// The horde. Population lives in a coarse density grid covering the whole island; only the
// bubble around the player becomes real entities. Entities update in tiers: full physics up
// close, staggered flow-field steering further out, so tens of thousands stay affordable.
import { WX, WZ, STREET_Y, G, FLOOR_H } from '../shared/constants.js';
import { HUMAN_VARIANT_START } from '../engine/actors.js';
import { isGlass, HP } from '../shared/materials.js';

const MAX = 60000;
const GIB_DROP = 22;     // blocks: anything that falls this far comes apart when it lands
const FALLING = 8;       // what the actor shader takes for someone in mid-air
const POP_CELL = 64;
const FINE_CELL = 16;
const GRID = 256;        // spatial hash: GRID x GRID cells of HC voxels around the player
const HC = 2;
const FIELD = 400;       // horde flow field: FIELD x FIELD cells of 2 voxels
const NF_X = 96, NF_Y = 48, NF_Z = 96;  // voxel-accurate near field
const INF = 65535;

const S_IDLE = 0, S_CHASE = 1, S_ATTACK = 2;
const TURN2 = 220 * 220;
const FLINCH = .42;   // seconds a body takes to recover from a blow that did not drop it
const TURN_RATE = 4.5;     // radians a second, the fastest a body turns while walking   // within this, bodies on the coarse updates still turn smoothly frame by frame
// Slower than they were, by a fifth, and harder for it: more to put down, a worse bite, quicker hands, sharper eyes, and walls that give
// a little sooner under the same weight. There are no more of them. A camp still falls on about the day it used to.
export const BASE_SPEED = 2.0;
const AWARE = 28.6;   // how far a zombie notices you, in voxels, before stealth and difficulty
const ACTIVE_SHARE = .45;
const INDOOR_SHARE = .4;    // of the dead that come up out of a block's count, the part found up inside its buildings rather than on its street   // of a block's population, the part that is ever up and about at once
const rand = Math.random;

export const DIFFICULTY = {
  hard: { name: 'Collapse', speed: 1.4, horde: 2.7, damage: 1.4, sight: 1.15, loot: 1 },
};

export class Horde {
  constructor(world, layout, actors, particles) {
    this.world = world;
    this.L = layout;
    this.actors = actors;
    this.fx = particles;
    this.n = 0;
    const F = () => new Float32Array(MAX);
    this.px = F(); this.py = F(); this.pz = F(); this.vx = F(); this.vy = F(); this.vz = F();
    // Thrown by a blast: how long they are still off their feet, going where it threw them.
    this.knockT = F();
    this.flinch = F(); this.flx = F(); this.flz = F(); this.flinchTime = FLINCH;   // reeling from a blow: how long for, and which way it came from
    this.flying = [];   // the dead a blast threw into the air, until they come down
    this.sx = F(); this.sz = F(); this.yaw = F(); this.phase = F(); this.spd = F(); this.atk = F(); this.blk = F();
    this.hp = new Int16Array(MAX);
    this.state = new Uint8Array(MAX);
    this.variant = new Uint8Array(MAX);
    this.hurtT = F();
    this.stuck = F(); this.stuckT = F(); this.lastX = F(); this.lastZ = F();
    this.lure = new Uint8Array(MAX); this.lures = [null];
    this.droppers = new Uint8Array(MAX);
    this.tgt = new Int16Array(MAX);
    this.siege = new Uint8Array(MAX);   // camp id + 1 when this body is part of an attack on that camp
    this.mig = new Uint8Array(MAX);     // on the way to somewhere the crowd has thinned out
    this.stamp = new Int32Array(MAX);
    this.nextInCell = new Int32Array(MAX);
    this.head = new Int32Array(GRID * GRID);
    this.gridX = 0; this.gridZ = 0;
    this.rayId = 0;
    this.frame = 0;

    this.settings = { ...DIFFICULTY.hard, activeCap: 30000, radius: 220 };
    this.popW = Math.ceil(WX / POP_CELL);
    this.popD = Math.ceil(WZ / POP_CELL);
    this.pop = new Float32Array(this.popW * this.popD);
    this.menu = false;
    this.popBase = new Float32Array(this.popW * this.popD);
    this.killHeat = new Float32Array(this.popW * this.popD);   // where they have been dying lately
    this.growth = 1;                                           // the city's dead keep coming in from the other boroughs
    this.computeBasePopulation();
    this.computeCrowdLimits();

    this.fieldA = new Uint16Array(FIELD * FIELD).fill(INF);
    this.fieldB = new Uint16Array(FIELD * FIELD).fill(INF);
    this.fieldOX = 0; this.fieldOZ = 0;
    this.fq = new Int32Array(FIELD * FIELD);
    this.fbuild = null;
    this.fieldTimer = 0;

    // Second flow field: routes to the nearest camp under attack, through any hole in its wall.
    this.campA = new Uint16Array(FIELD * FIELD).fill(INF);
    this.campB = new Uint16Array(FIELD * FIELD).fill(INF);
    this.campOX = 0; this.campOZ = 0;
    this.cq = new Int32Array(FIELD * FIELD);
    this.cbuild = null;
    this.campTimer = 0;
    this.sim = null;
    this.siegeCount = new Int32Array(layout.camps.length);

    // Third flow field: routes to wherever the crowd is drifting.
    this.migA = new Uint16Array(FIELD * FIELD).fill(INF);
    this.migB = new Uint16Array(FIELD * FIELD).fill(INF);
    this.migOX = 0; this.migOZ = 0;
    this.mq = new Int32Array(FIELD * FIELD);
    this.mbuild = null;
    this.migTimer = 0;
    this.migTargets = new Map();
    this.stragglerT = 8;

    // Fourth flow field: the way to the next camp, for the people walking there.
    this.roadA = new Uint16Array(FIELD * FIELD).fill(INF);
    this.roadB = new Uint16Array(FIELD * FIELD).fill(INF);
    this.roadOX = 0; this.roadOZ = 0;
    this.rq = new Int32Array(FIELD * FIELD);
    this.rbuild = null;
    this.roadTimer = 0;
    this.roadTarget = null;
    this.roadOK = false;

    this.nearA = new Uint16Array(NF_X * NF_Y * NF_Z).fill(INF);
    this.nearB = new Uint16Array(NF_X * NF_Y * NF_Z).fill(INF);
    this.nearOX = 0; this.nearOY = 0; this.nearOZ = 0;
    this.nq = new Int32Array(NF_X * NF_Y * NF_Z);
    this.nbuild = null;
    this.nearTimer = 0;
    this.nearDirty = true;

    // Corpses (ring buffer)
    this.corpseCap = 3200;
    this.corpses = new Float32Array(this.corpseCap * 8);
    this.corpseHead = 0;
    this.corpseCount = 0;

    this.gnawBudget = 0;
    this.player = { x: 0, y: 0, z: 0, stealth: 1 };
    this.humans = [];
    this.swarm = new Int16Array(1024);      // how many are after each person
    this.swarmNow = new Int16Array(1024);
    this.nightK = 0;
    this.blowX = 0;
    this.blowZ = 0;
    this.onHitPlayer = null;
    this.onHitHuman = null;
    this.onKilled = null;
    this.onGnaw = null;
    this.chasers = 0;
    this.nearCount = 0;
    this.visibleCount = 0;
  }

  // --- Population model --------------------------------------------------------------
  computeBasePopulation() {
    const { ground, camps } = this.L;
    const W = this.popW, D = this.popD;
    let dens = new Float32Array(W * D);
    const street = new Float32Array(W * D), land = new Float32Array(W * D);
    this.cellStreet = street; this.cellLand = land;
    for (let cz = 0; cz < D; cz++) for (let cx = 0; cx < W; cx++) {
      let total = 0;
      for (let z = cz * POP_CELL; z < (cz + 1) * POP_CELL && z < WZ; z += 4) for (let x = cx * POP_CELL; x < (cx + 1) * POP_CELL && x < WX; x += 4) {
        total++;
        const g = ground[z * WX + x];
        if (g !== G.WATER) land[cx + cz * W]++;
        if (g === G.ROAD || g === G.WALK || g === G.PLAZA || g === G.ALLEY) street[cx + cz * W]++;
      }
      street[cx + cz * W] /= total; land[cx + cz * W] /= total;
      // Thick in the middle of Albion, thinner in the smaller towns, and next to nothing out in the fields and the woods.
      let d = 0;
      for (const [ox, oz] of [[.25, .25], [.75, .25], [.25, .75], [.75, .75]]) d += this.L.densityAt((cx + ox) * POP_CELL, (cz + oz) * POP_CELL) / 4;
      dens[cx + cz * W] = d;
    }
    // Neighbourhoods run into each other, with no line on the ground where one ends.
    for (let pass = 0; pass < 2; pass++) {
      const out = new Float32Array(W * D);
      for (let cz = 0; cz < D; cz++) for (let cx = 0; cx < W; cx++) {
        let t = 0, n = 0;
        for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
          const x = cx + ox, z = cz + oz;
          if (x < 0 || z < 0 || x >= W || z >= D) continue;
          const k = (2 - Math.abs(ox)) * (2 - Math.abs(oz));
          t += dens[x + z * W] * k; n += k;
        }
        out[cx + cz * W] = t / n;
      }
      dens = out;
    }
    this.densRaw = dens;
    this.dens = new Float32Array(W * D);
    this.applyThinning();
    // Inside the wall there are none at all.
    this.campCell = new Int8Array(W * D).fill(-1);
    for (const c of camps) {
      for (let cz = (c.z0 - 4) >> 6; cz <= (c.z1 + 4) >> 6; cz++) for (let cx = (c.x0 - 4) >> 6; cx <= (c.x1 + 4) >> 6; cx++) {
        if (cx >= 0 && cz >= 0 && cx < W && cz < D) this.campCell[cx + cz * W] = c.id;
      }
    }
  }

  // Patrols keep the streets around each camp thin, thinning out the closer you get to the wall. Once a camp has
  // fallen nobody is doing that any more, and the neighbourhood fills back in.
  applyThinning() {
    const { camps } = this.L, W = this.popW, D = this.popD, raw = this.densRaw, dens = this.dens;
    const living = camps.filter((c) => !this.sim || this.sim.state[c.id].status !== 'overrun');
    for (let cz = 0; cz < D; cz++) for (let cx = 0; cx < W; cx++) {
      const x = (cx + .5) * POP_CELL, z = (cz + .5) * POP_CELL;
      let m = 1;
      for (const c of living) {
        const d = Math.max(c.x0 - x, x - c.x1, c.z0 - z, z - c.z1);
        // Thin by the wall and filling in steadily further out, all the way to two hundred blocks.
        const k = Math.max(0, Math.min(1, (d - 30) / 170));
        m = Math.min(m, .06 + .94 * k * k * (3 - 2 * k));
      }
      dens[cx + cz * W] = raw[cx + cz * W] * m;
    }
    // Dense on streets, thin in parks and along the water.
    const street = this.cellStreet, land = this.cellLand;
    for (let c = 0; c < W * D; c++) this.popBase[c] = land[c] ? dens[c] * street[c] * 2.3 + dens[c] * .1 * land[c] : 0;
  }

  // A camp fell, or someone took one back. Without jump: a game being set up, where nothing has had time to walk there.
  campStatusChanged(jump = true) {
    const before = jump ? Float32Array.from(this.popBase) : null;
    this.applyThinning();
    this.fillCrowdLimits();
    if (!before) return;
    const m = this.settings.horde;
    for (let i = 0; i < this.pop.length; i++) if (this.popBase[i] > before[i]) this.pop[i] += (this.popBase[i] - before[i]) * m * .4;
  }

  // How many may be on their feet in each small patch of the city at once. It goes by how much street the patch
  // has, so the count is the same wherever the edge of the active area happens to fall, and the rest of a block's
  // crowd stays in the grid to top it up as it thins.
  computeCrowdLimits() {
    const { ground } = this.L;
    this.fineW = Math.ceil(WX / FINE_CELL);
    this.fineD = Math.ceil(WZ / FINE_CELL);
    this.fineCap = new Float32Array(this.fineW * this.fineD);
    this.fineKind = new Float32Array(this.fineW * this.fineD);
    this.fineExtra = new Uint8Array(this.fineW * this.fineD);
    this.active = new Int32Array(this.fineW * this.fineD);
    for (let fz = 0; fz < this.fineD; fz++) for (let fx = 0; fx < this.fineW; fx++) {
      let street = 0, land = 0, total = 0;
      for (let z = fz * FINE_CELL; z < (fz + 1) * FINE_CELL && z < WZ; z += 4) for (let x = fx * FINE_CELL; x < (fx + 1) * FINE_CELL && x < WX; x += 4) {
        total++;
        const g = ground[z * WX + x];
        if (g !== G.WATER) land++;
        if (g === G.ROAD || g === G.WALK || g === G.PLAZA || g === G.ALLEY) street++;
      }
      this.fineKind[fx + fz * this.fineW] = street / total * 2.3 + land / total * .1;
    }
    this.fillCrowdLimits();
  }

  fillCrowdLimits() {
    const W = this.popW, D = this.popD, d = this.dens;
    for (let fz = 0; fz < this.fineD; fz++) for (let fx = 0; fx < this.fineW; fx++) {
      const ux = Math.max(0, Math.min(W - 1.001, (fx + .5) * FINE_CELL / POP_CELL - .5)), uz = Math.max(0, Math.min(D - 1.001, (fz + .5) * FINE_CELL / POP_CELL - .5));
      const cx = ux | 0, cz = uz | 0, ax = ux - cx, az = uz - cz, k = cx + cz * W;
      const here = (d[k] * (1 - ax) + d[k + 1] * ax) * (1 - az) + (d[k + W] * (1 - ax) + d[k + W + 1] * ax) * az;
      this.fineCap[fx + fz * this.fineW] = here * this.fineKind[fx + fz * this.fineW] * (FINE_CELL * FINE_CELL) / (POP_CELL * POP_CELL);
    }
  }

  // Fractions are settled once per patch, so a quiet stretch of road has the odd one standing on it, not one in every patch.
  // Even the emptiest block has somebody standing around on it, and the crowd thickens as the weeks go by.
  crowdFull(f) {
    const frac = (f * .61803) % 1;
    return this.active[f] >= Math.max(frac < .2 ? 1 : 0, Math.floor(this.fineCap[f] * this.settings.horde * ACTIVE_SHARE * this.growth + frac) + this.fineExtra[f]);
  }

  // A job has put a crowd here: the block is allowed to hold that many, whatever it normally would.
  setCrowdBoosts(list) {
    this.fineExtra.fill(0);
    for (const b of list) {
      const r = Math.ceil(b.r / FINE_CELL), fx = b.x >> 4, fz = b.z >> 4;
      for (let z = fz - r; z <= fz + r; z++) for (let x = fx - r; x <= fx + r; x++) {
        if (x < 0 || z < 0 || x >= this.fineW || z >= this.fineD || (x - fx) ** 2 + (z - fz) ** 2 > r * r) continue;
        this.fineExtra[x + z * this.fineW] = b.n;
      }
    }
  }

  // Somebody went out and dealt with this neighbourhood. Returns how many.
  thinAround(x, z, r, share) {
    const cr = Math.ceil(r / POP_CELL), cx = x >> 6, cz = z >> 6;
    let n = 0;
    for (let k = cz - cr; k <= cz + cr; k++) for (let j = cx - cr; j <= cx + cr; j++) {
      if (j < 0 || k < 0 || j >= this.popW || k >= this.popD) continue;
      const c = j + k * this.popW, take = this.pop[c] * share;
      this.pop[c] -= take; n += take;
    }
    return Math.round(n);
  }

  // Make sure there are at least this many left to find around a point.
  ensurePop(x, z, n) {
    const cx = x >> 6, cz = z >> 6;
    const each = n / 5;
    for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = cx + ox + (cz + oz) * this.popW;
      if (k >= 0 && k < this.pop.length && this.popBase[k] > 0 && this.pop[k] < each) this.pop[k] = each;
    }
  }

  // --- Migration --------------------------------------------------------------------------------
  // The crowd is not evenly spread and it does not stay put. Each block slowly gets back what it lost, mostly out of
  // the blocks next door, so a cleared neighbourhood is never clear for long, and the ones around it thin out a little.
  drift(days) {
    const W = this.popW, D = this.popD, pop = this.pop, base = this.popBase, m = this.settings.horde * this.growth;
    const rate = Math.min(.5, days * 6);
    for (let cz = 0; cz < D; cz++) for (let cx = 0; cx < W; cx++) {
      const c = cx + cz * W;
      if (base[c] <= 0) continue;
      this.killHeat[c] *= .96;
      const target = base[c] * m;
      // Nowhere is ever completely empty. There is always someone shut in on an upper floor.
      const floor = Math.min(target + 2, 3 + target * .04);
      if (pop[c] < floor) pop[c] = floor;
      let want = target - pop[c];
      if (want <= 0) continue;
      for (const n of [c - 1, c + 1, c - W, c + W]) {
        if (n < 0 || n >= pop.length || base[n] <= 0) continue;
        const spare = pop[n] - base[n] * m * .55;
        if (spare <= 0) continue;
        const take = Math.min(spare, want) * rate;
        pop[n] -= take; pop[c] += take; want -= take;
      }
      pop[c] += target * .04 * days;
    }
  }

  // The block around here that the dead have most noticed something happening on.
  hottestCleared(px, pz) {
    const W = this.popW, D = this.popD, m = this.settings.horde * this.growth;
    const c0 = px >> 6, r0 = pz >> 6;
    let best = -1, bs = 7;
    for (let cz = r0 - 5; cz <= r0 + 5; cz++) for (let cx = c0 - 5; cx <= c0 + 5; cx++) {
      if (cx < 0 || cz < 0 || cx >= W || cz >= D) continue;
      const k = cx + cz * W;
      if (this.popBase[k] <= 0) continue;
      const target = this.popBase[k] * m;
      const score = this.killHeat[k] + (this.pop[k] < target * .3 ? (target - this.pop[k]) * .08 : 0);
      if (score <= bs) continue;
      const x = (cx + .5) * POP_CELL, z = (cz + .5) * POP_CELL;
      const near = this.inCamp(x, z, 60);
      if (near && !(this.sim && this.sim.isRuined(near.id))) continue;
      bs = score; best = k;
    }
    if (best < 0) return null;
    const w = this.world, gx = (best % W) * POP_CELL, gz = ((best / W) | 0) * POP_CELL;
    for (let t = 0; t < 30; t++) {
      const x = gx + Math.floor(rand() * POP_CELL), z = gz + Math.floor(rand() * POP_CELL);
      const g = this.L.ground[z * WX + x];
      if ((g === G.ROAD || g === G.WALK || g === G.PLAZA) && w.walk[(x >> 1) + (z >> 1) * w.walkW]) return { cell: best, x, z, heat: this.killHeat[best] };
    }
    return null;
  }

  // A settlement has fallen. Its ground had next to none of the dead on it while the wall stood; now it is given as many as the streets
  // round it hold, and some of those already about outside are set wandering in. It fills in over the next while, from all sides.
  fillRuin(c, quiet = false) {
    const W = this.popW, D = this.popD, m = this.settings.horde;
    const cx0 = Math.max(0, c.x0 >> 6), cx1 = Math.min(W - 1, c.x1 >> 6), cz0 = Math.max(0, c.z0 >> 6), cz1 = Math.min(D - 1, c.z1 >> 6);
    let sum = 0, n = 0;
    for (let cz = cz0 - 1; cz <= cz1 + 1; cz++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
      if (cx < 0 || cz < 0 || cx >= W || cz >= D) continue;
      if (cx >= cx0 && cx <= cx1 && cz >= cz0 && cz <= cz1) continue;
      sum += this.popBase[cx + cz * W]; n++;
    }
    const around = n ? sum / n : 60;
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cx + cz * W;
      this.popBase[k] = Math.max(this.popBase[k], around * .85);
      this.pop[k] = Math.max(this.pop[k], this.popBase[k] * m * .9);
    }
    if (quiet) return;
    this.setMigrationTarget(`ruin${c.id}`, (c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 240);
    this.sendMigrants((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2, 160, 40, 170);
  }

  setMigrationTarget(key, x, z, ttl = 1e9) {
    let t = this.migTargets.get(key);
    if (!t) { t = { x, z, ttl }; this.migTargets.set(key, t); this.migTimer = 0; }
    t.x = x; t.z = z; t.ttl = ttl;
  }

  clearMigrationTarget(key) { this.migTargets.delete(key); }

  // Send a pack up the street towards a point: whoever is already standing around nearby, and a few more from out of sight.
  // Returns how many set off.
  sendMigrants(tx, tz, count, rmin = 110, rmax = 190) {
    const w = this.world, P = this.player, { px, pz, py, state, mig, siege } = this;
    let sent = 0;
    if (this.n) {
      const R2 = rmax * rmax, r2 = 36 * 36;
      for (let t = 0; t < 300 && sent < count * .4; t++) {
        const i = Math.floor(rand() * this.n);
        if (state[i] !== S_IDLE || mig[i] || siege[i] || py[i] > this.gy(px[i], pz[i]) + 3) continue;
        const d = (px[i] - tx) ** 2 + (pz[i] - tz) ** 2;
        if (d < r2 || d > R2) continue;
        mig[i] = 1;
        sent++;
      }
    }
    const R = this.settings.radius;
    let left = count - sent, bx = -1, bz = -1, bp = -1;
    for (let t = 0; t < 40 && left > 0; t++) {
      const a = rand() * 6.283, r = rmin + rand() * (rmax - rmin);
      const x = Math.floor(tx + Math.cos(a) * r), z = Math.floor(tz + Math.sin(a) * r);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      const d = Math.hypot(x - P.x, z - P.z);
      if (d > R || d < 60) continue;
      const g = this.L.ground[z * WX + x];
      if (g !== G.ROAD && g !== G.WALK && g !== G.PLAZA) continue;
      if (!w.walk[(x >> 1) + (z >> 1) * w.walkW]) continue;
      const near = this.inCamp(x, z, 36);
      if (near && !(this.sim && this.sim.isRuined(near.id))) continue;
      const cell = (x >> 6) + (z >> 6) * this.popW;
      if (this.pop[cell] > bp && !w.los(P.x, P.y + 2.4, P.z, x + .5, w.terrainTop(x, z) + 2, z + .5)) { bp = this.pop[cell]; bx = x; bz = z; }
    }
    if (bx < 0) return sent;
    const cell = (bx >> 6) + (bz >> 6) * this.popW;
    for (let t = 0; t < left * 4 && left > 0; t++) {
      const x = bx + Math.floor((rand() - .5) * 18), z = bz + Math.floor((rand() - .5) * 18);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2 || !w.walk[(x >> 1) + (z >> 1) * w.walkW]) continue;
      const i = this.spawnOne(x + rand(), w.terrainTop(x, z), z + rand());
      if (i < 0) break;
      mig[i] = 1;
      this.pop[cell] = Math.max(0, this.pop[cell] - 1);
      sent++; left--;
    }
    return sent;
  }

  // Everyone standing around a point turns on a camp together.
  releaseMigrants(c, x, z, r) {
    const { px, pz, state, siege, mig } = this, r2 = r * r;
    for (let i = 0; i < this.n; i++) {
      if ((px[i] - x) ** 2 + (pz[i] - z) ** 2 > r2) continue;
      mig[i] = 0;
      if (state[i] === S_IDLE) { state[i] = S_CHASE; siege[i] = c.id + 1; }
    }
  }

  // Steering for a body that is on its way somewhere. Close enough, and it goes back to standing around.
  migSteer(i) {
    const f = this.migA, cx = (Math.floor(this.px[i]) >> 1) - this.migOX, cz = (Math.floor(this.pz[i]) >> 1) - this.migOZ;
    if (!this.migTargets.size) { this.mig[i] = 0; return; }
    if (cx >= 1 && cz >= 1 && cx < FIELD - 1 && cz < FIELD - 1) {
      const d = f[cx + cz * FIELD];
      // Each stops at its own distance, so they end up scattered about the block and not on one spot.
      if (d !== INF && d < 5 + (i & 15)) { this.mig[i] = 0; this.sx[i] = 0; this.sz[i] = 0; return; }
    }
    this.gradDir(i, f, this.migOX, this.migOZ);
  }

  beginMigField(P) {
    const w = this.world, W2 = w.walkW;
    const ox = (Math.floor(P.x) >> 1) - (FIELD >> 1), oz = (Math.floor(P.z) >> 1) - (FIELD >> 1);
    this.migB.fill(INF);
    let tail = 0;
    for (const t of this.migTargets.values()) {
      for (let r = 0; r < 3; r++) {
        const gx = ((t.x + (r ? (rand() - .5) * 24 : 0)) | 0) >> 1, gz = ((t.z + (r ? (rand() - .5) * 24 : 0)) | 0) >> 1;
        const lx = gx - ox, lz = gz - oz;
        if (lx < 0 || lz < 0 || lx >= FIELD || lz >= FIELD || !w.walk[gx + gz * W2]) continue;
        const k = lx + lz * FIELD;
        if (this.migB[k] === INF) { this.migB[k] = 0; this.mq[tail++] = k; }
      }
    }
    this.mbuild = tail ? { ox, oz, head: 0, tail } : null;
  }

  stepMigField(budget) {
    const b = this.mbuild;
    if (!b) return;
    if (this.bfs(this.migB, this.mq, b, budget)) {
      const t = this.migA; this.migA = this.migB; this.migB = t;
      this.migOX = b.ox; this.migOZ = b.oz;
      this.mbuild = null;
    }
  }

  // A route for people on foot. If where they are going is further off than the field reaches, it runs to the nearest
  // edge of the field in that direction, which moves along with you.
  setRoad(x, z) {
    if (!this.roadTarget || this.roadTarget.x !== x || this.roadTarget.z !== z) { this.roadOK = false; this.roadTimer = 0; }
    this.roadTarget = x === null ? null : { x, z };
  }

  beginRoadField(P) {
    const w = this.world, W2 = w.walkW, t = this.roadTarget;
    const ox = (Math.floor(P.x) >> 1) - (FIELD >> 1), oz = (Math.floor(P.z) >> 1) - (FIELD >> 1);
    this.roadB.fill(INF);
    let tail = 0;
    const cx = Math.max(1, Math.min(FIELD - 2, (t.x >> 1) - ox)), cz = Math.max(1, Math.min(FIELD - 2, (t.z >> 1) - oz));
    for (let r = 0; r < 60 && !tail; r += 2) for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) {
      const lx = cx + dx, lz = cz + dz;
      if (lx < 0 || lz < 0 || lx >= FIELD || lz >= FIELD) continue;
      const gx = ox + lx, gz = oz + lz;
      if (gx < 0 || gz < 0 || gx >= W2 || gz >= w.walkD || !w.walk[gx + gz * W2] || this.L.lot[(gz << 1) * WX + (gx << 1)]) continue;
      const k = lx + lz * FIELD;
      if (this.roadB[k] === INF) { this.roadB[k] = 0; this.rq[tail++] = k; }
    }
    this.rbuild = tail ? { ox, oz, head: 0, tail } : null;
  }

  stepRoadField(budget) {
    const b = this.rbuild;
    if (!b) return;
    if (this.bfs(this.roadB, this.rq, b, budget, true)) {
      const t = this.roadA; this.roadA = this.roadB; this.roadB = t;
      this.roadOX = b.ox; this.roadOZ = b.oz;
      this.rbuild = null;
      this.roadOK = true;
    }
  }

  roadAt(x, z) {
    if (!this.roadOK) return null;
    const f = this.roadA, cx = (Math.floor(x) >> 1) - this.roadOX, cz = (Math.floor(z) >> 1) - this.roadOZ;
    if (cx < 1 || cz < 1 || cx >= FIELD - 1 || cz >= FIELD - 1) return null;
    const k = cx + cz * FIELD, d = f[k], l = f[k - 1], r = f[k + 1], u = f[k - FIELD], v = f[k + FIELD];
    const ref = d === INF ? Math.min(l, r, u, v) + 1 : d;
    if (ref >= INF) return null;
    const dx = (r < ref ? ref - r : 0) - (l < ref ? ref - l : 0), dz = (v < ref ? ref - v : 0) - (u < ref ? ref - u : 0);
    const m = Math.hypot(dx, dz);
    return m ? [dx / m, dz / m] : null;
  }

  // How far it is along the route from here, in voxels. Null if there is no route from here.
  roadDist(x, z) {
    if (!this.roadOK) return null;
    const cx = (Math.floor(x) >> 1) - this.roadOX, cz = (Math.floor(z) >> 1) - this.roadOZ;
    if (cx < 0 || cz < 0 || cx >= FIELD || cz >= FIELD) return null;
    const d = this.roadA[cx + cz * FIELD];
    return d === INF ? null : d * 2;
  }

  // Walk down the middle of a block you just emptied and it should still not feel safe. Nothing ever appears in
  // sight; the odd one is just there, round the next corner, when the street has been quiet for a while.
  spawnStragglers(P, dt) {
    if ((this.stragglerT -= dt) > 0) return;
    this.stragglerT = (3 + rand() * 5) / Math.max(.3, this.journeyK ?? 1);
    if (this.nearCount >= 5 || this.menu) return;
    const w = this.world;
    for (let t = 0; t < 8; t++) {
      const a = rand() * 6.283, r = 34 + rand() * 50;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      const g = this.L.ground[z * WX + x];
      if (g !== G.ROAD && g !== G.WALK && g !== G.PLAZA && g !== G.ALLEY) continue;
      if (!w.walk[(x >> 1) + (z >> 1) * w.walkW]) continue;
      const near = this.inCamp(x, z, 36);
      if (near && !(this.sim && this.sim.isRuined(near.id))) continue;
      const y = w.terrainTop(x, z);
      if (w.los(P.x, P.y + 2.4, P.z, x + .5, y + 2, z + .5)) continue;
      const cell = (x >> 6) + (z >> 6) * this.popW;
      const k = 1 + Math.floor(rand() * 3);
      for (let n = 0; n < k; n++) {
        const ox = x + Math.floor(rand() * 5) - 2, oz = z + Math.floor(rand() * 5) - 2;
        if (ox < 2 || oz < 2 || ox >= WX - 2 || oz >= WZ - 2 || !w.walk[(ox >> 1) + (oz >> 1) * w.walkW]) continue;
        this.spawnOne(ox + .5, w.terrainTop(ox, oz), oz + .5);
        this.pop[cell] = Math.max(0, this.pop[cell] - 1);
      }
      return;
    }
  }

  // Someone who walked out of range goes back to the neighbourhood, not to the exact spot they stopped.
  bank(x, z) {
    const cx = (x >> 6) + Math.floor(rand() * 5) - 2, cz = (z >> 6) + Math.floor(rand() * 5) - 2;
    let cell = cx + cz * this.popW;
    if (cx < 0 || cz < 0 || cx >= this.popW || cz >= this.popD || this.popBase[cell] <= 0) cell = (x >> 6) + (z >> 6) * this.popW;
    if (cell >= 0 && cell < this.pop.length) this.pop[cell] += 1;
  }

  applyDifficulty(d) {
    Object.assign(this.settings, d);
  }

  resetPopulation() {
    const m = this.settings.horde;
    for (let i = 0; i < this.pop.length; i++) this.pop[i] = this.popBase[i] * m;
    this.active.fill(0);
    this.n = 0;
    this.corpseCount = 0;
    this.corpseHead = 0;
  }

  totalPopulation() {
    let t = this.n;
    for (let i = 0; i < this.pop.length; i++) t += this.pop[i];
    return Math.round(t);
  }

  // Kills reduce a city that slowly refills from the other boroughs.
  regrow(dtDays) {
    const m = this.settings.horde;
    for (let i = 0; i < this.pop.length; i++) {
      const target = this.popBase[i] * m;
      if (this.pop[i] < target) this.pop[i] = Math.min(target, this.pop[i] + target * .05 * dtDays);
    }
  }

  // How many of the dead are in the population grid round a camp, out to this far past its wall.
  popNear(c, R) {
    const W = this.popW;
    let s = 0;
    for (let cz = Math.max(0, (c.z0 - R) >> 6); cz <= Math.min(this.popD - 1, (c.z1 + R) >> 6); cz++) for (let cx = Math.max(0, (c.x0 - R) >> 6); cx <= Math.min(W - 1, (c.x1 + R) >> 6); cx++) s += this.pop[cx + cz * W];
    return s;
  }

  inCamp(x, z, margin = 0) {
    for (const c of this.L.camps) {
      if (x > c.x0 - margin && x < c.x1 + margin && z > c.z0 - margin && z < c.z1 + margin) return c;
    }
    return null;
  }

  // Fast test used in the movement loops: is this point inside a camp wall?
  campAt(x, z, margin = 0) {
    const cell = (x >> 6) + (z >> 6) * this.popW;
    const id = cell >= 0 && cell < this.campCell.length ? this.campCell[cell] : -1;
    if (id < 0) return false;
    const c = this.L.camps[id];
    return x > c.x0 - margin && x < c.x1 + margin && z > c.z0 - margin && z < c.z1 + margin;
  }

  spawnOne(x, y, z, state = S_IDLE) {
    if (this.n >= MAX) return -1;
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z;
    this.vx[i] = 0; this.vy[i] = 0; this.vz[i] = 0;
    const a = rand() * 6.283;
    this.sx[i] = Math.sin(a); this.sz[i] = Math.cos(a);
    this.yaw[i] = a;
    this.phase[i] = rand() * 6.283;
    // Everyone moves a tenth slower than they used to: chasing, wandering and on the move alike.
    this.spd[i] = (.88 + rand() * .24) * .9;
    this.atk[i] = 0;
    this.blk[i] = 0;
    this.hp[i] = 53 + (rand() * 38) | 0;
    this.state[i] = state;
    this.variant[i] = (rand() * HUMAN_VARIANT_START) | 0;
    this.tgt[i] = -1;
    this.hurtT[i] = 0;
    this.knockT[i] = 0; this.flinch[i] = 0;
    this.siege[i] = 0;
    this.mig[i] = 0;
    this.stuck[i] = 0; this.stuckT[i] = rand() * .5; this.lastX[i] = x; this.lastZ[i] = z; this.droppers[i] = 0; this.lure[i] = 0;
    return i;
  }

  // Convert a sampled point from the density grid into a real zombie.
  trySpawnAt(x, z) {
    const w = this.world;
    // On the road with a group: the streets only fill to a share of what they would (see NPCs.journeyStep).
    if (this.journeyK < 1 && rand() > this.journeyK) return false;
    const cell = (x >> 6) + (z >> 6) * this.popW;
    if (this.pop[cell] < 1) {
      if (this.pop[cell] <= 0 || rand() > this.pop[cell]) return false;
    }
    const patch = (x >> 4) + (z >> 4) * this.fineW;
    if (!this.menu && this.crowdFull(patch)) return false;
    if (!w.walk[(x >> 1) + (z >> 1) * w.walkW]) return false;
    const near = this.inCamp(x, z, 36);
    if (near && !(this.sim && this.sim.isRuined(near.id))) return false;
    // The crowd is on the street. Only a few got shut in behind closed doors.
    if (this.L.lot[z * WX + x] && rand() < .88) return false;
    const y = w.terrainTop(x, z);
    // The raster knows about parked cars, but not what the player has built or knocked down.
    if (w.isLoaded(x, y, z) && (w.solid(x, y, z) || w.solid(x, y + 1, z) || w.solid(x, y + 2, z))) return false;
    this.pop[cell] -= 1;
    this.active[patch]++;
    // Not all of a block's dead are out on the street. A good share of them never left the buildings they turned in: up on the floors of
    // whatever stands beside the street, in offices and flats, until something brings them down.
    if (!this.menu && rand() < INDOOR_SHARE && this.placeIndoors(x, z)) return true;
    this.spawnOne(x + .15 + rand() * .7, y, z + .15 + rand() * .7);
    return true;
  }

  // Somewhere up inside a building near this spot of street, on a real floor with room to stand. False if nothing near will do.
  placeIndoors(x, z) {
    const w = this.world, L = this.L;
    for (let t = 0; t < 6; t++) {
      const bx = Math.floor(x + (rand() - .5) * 28), bz = Math.floor(z + (rand() - .5) * 28);
      if (bx < 1 || bz < 1 || bx >= WX - 1 || bz >= WZ - 1) continue;
      const k = bz * WX + bx;
      if (!L.lot[k]) continue;
      const hb = L.buildings[L.lot[k] - 1], floors = Math.floor((L.height[k] - STREET_Y - hb.lift) / FLOOR_H);
      if (floors < 2 || hb.house) continue;
      const y = STREET_Y + hb.lift - 1 + FLOOR_H * (1 + Math.floor(rand() * Math.min(floors - 1, 16))) + 1;
      if (!w.isLoaded(bx, y, bz)) continue;
      const P = this.player;
      if (P && Math.abs(y - P.y) < 3 && Math.hypot(bx - P.x, bz - P.z) < 26) continue;   // not on top of you, on your own floor
      if (w.solid(bx, y - 1, bz) && !w.solid(bx, y, bz) && !w.solid(bx, y + 1, bz) && !w.solid(bx, y + 2, bz)) {
        this.spawnOne(bx + .5, y, bz + .5);
        return true;
      }
    }
    return false;
  }

  // The title screen's river of bodies: a whole avenue of them, walking up towards the camera.
  fillStreet(x, z0, length, halfWidth, count) {
    const w = this.world;
    for (let k = 0; k < count * 3 && count > 0; k++) {
      const sx = Math.floor(x + (rand() - .5) * 2 * halfWidth), sz = Math.floor(z0 + Math.pow(rand(), .85) * length);
      if (sx < 1 || sz < 1 || sx >= WX || sz >= WZ || !w.walk[(sx >> 1) + (sz >> 1) * w.walkW]) continue;
      if (this.spawnOne(sx + rand(), w.terrainTop(sx, sz), sz + rand(), S_CHASE) < 0) break;
      count--;
    }
  }

  // Anything that has walked past the camera goes round again, far off in the haze.
  menuStream(x, z, halfWidth) {
    const w = this.world, { px, py, pz, state } = this;
    for (let i = 0; i < this.n; i++) {
      if (!state[i] || pz[i] > z - 10) continue;
      const sx = Math.floor(x + (rand() - .5) * 2 * halfWidth), sz = Math.floor(z + 300 + rand() * 120);
      if (!w.walk[(sx >> 1) + (sz >> 1) * w.walkW]) continue;
      px[i] = sx + rand(); pz[i] = sz + rand(); py[i] = w.terrainTop(sx, sz);
    }
  }

  // Build the initial crowd instantly when a game starts or after fast travel.
  fillAround(px, pz) {
    const R = this.settings.radius;
    const cap = this.settings.activeCap;
    let tries = 0;
    const total = 400000;
    this.active.fill(0);
    for (let i = 0; i < this.n; i++) {
      const c = (this.px[i] >> 4) + (this.pz[i] >> 4) * this.fineW;
      if (c >= 0 && c < this.active.length) this.active[c]++;
    }
    while (this.n < cap && tries < total) {
      tries++;
      const a = rand() * 6.283, r = Math.sqrt(rand()) * R;
      const x = Math.floor(px + Math.cos(a) * r), z = Math.floor(pz + Math.sin(a) * r);
      if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
      if (r < 18) continue;
      this.trySpawnAt(x, z);
    }
  }

  // Return everyone to the density grid (fast travel, map reset).
  bankAll() {
    for (let i = 0; i < this.n; i++) this.bank(this.px[i], this.pz[i]);
    this.active.fill(0);
    this.n = 0;
  }

  // --- Flow fields ----------------------------------------------------------------------
  beginField(px, pz) {
    const ox = (Math.floor(px) >> 1) - (FIELD >> 1), oz = (Math.floor(pz) >> 1) - (FIELD >> 1);
    this.fieldB.fill(INF);
    const sx = (Math.floor(px) >> 1) - ox, sz = (Math.floor(pz) >> 1) - oz;
    this.fieldB[sx + sz * FIELD] = 0;
    this.fq[0] = sx + sz * FIELD;
    this.fbuild = { ox, oz, head: 0, tail: 1 };
  }

  // Everyone in a camp's attack heads for the inside if there is a way in, or the foot of the wall if not.
  beginCampField(P) {
    const w = this.world, W2 = w.walkW;
    const ox = (Math.floor(P.x) >> 1) - (FIELD >> 1), oz = (Math.floor(P.z) >> 1) - (FIELD >> 1);
    this.campB.fill(INF);
    let tail = 0;
    const seed = (wx, wz) => {
      const gx = wx >> 1, gz = wz >> 1;
      const lx = gx - ox, lz = gz - oz;
      if (lx < 0 || lz < 0 || lx >= FIELD || lz >= FIELD || !w.walk[gx + gz * W2]) return;
      const k = lx + lz * FIELD;
      if (this.campB[k] !== INF) return;
      this.campB[k] = 0;
      this.cq[tail++] = k;
    };
    for (const c of this.L.camps) {
      const s = this.sim.state[c.id];
      if (!s.drawing || s.status === 'overrun') continue;
      // A hole pulls in the whole stretch of wall around it. Further along than that they go at the wall in front of them,
      // so a big crowd still opens a few holes round the camp, but every one of them has a real river going through it.
      const holes = [];
      for (const b of s.breaches) holes.push(b);
      // A hole someone else knocked in the wall is as good as one of theirs.
      if (s.holes) for (const h of s.holes) if (h.open) holes.push(h);
      const st = this.sim.g.npcs.camps[c.id];
      for (const q of st.gates) if (q.open > 0) holes.push({ x: q.def.cx, z: q.def.cz });
      const open = holes.length > 0 || this.sim.hasOpening(c.id);
      if (open) for (let z = c.z0 + 6; z < c.z1 - 6; z += 6) for (let x = c.x0 + 6; x < c.x1 - 6; x += 6) seed(x, z);
      // Once the wall itself is coming down there is no more waiting at it. Any gap will do, wherever it is.
      if (open && (s.evac || s.collapseT > 0)) continue;
      const clear = (x, z) => { for (const h of holes) if (Math.abs(h.x - x) + Math.abs(h.z - z) < 85) return false; return true; };
      for (let x = c.x0 - 3; x <= c.x1 + 3; x += 2) { if (clear(x, c.z0)) seed(x, c.z0 - 3); if (clear(x, c.z1)) seed(x, c.z1 + 3); }
      for (let z = c.z0 - 3; z <= c.z1 + 3; z += 2) { if (clear(c.x0, z)) seed(c.x0 - 3, z); if (clear(c.x1, z)) seed(c.x1 + 3, z); }
    }
    this.cbuild = { ox, oz, head: 0, tail };
  }

  stepCampField(budget) {
    const b = this.cbuild;
    if (!b) return;
    if (this.bfs(this.campB, this.cq, b, budget)) {
      const t = this.campA; this.campA = this.campB; this.campB = t;
      this.campOX = b.ox; this.campOZ = b.oz;
      this.cbuild = null;
    }
  }

  stepField(budget) {
    const b = this.fbuild;
    if (!b) return;
    if (this.bfs(this.fieldB, this.fq, b, budget)) {
      const t = this.fieldA; this.fieldA = this.fieldB; this.fieldB = t;
      this.fieldOX = b.ox; this.fieldOZ = b.oz;
      this.fbuild = null;
    }
  }

  bfs(f, q, b, budget, outdoors = false) {
    const w = this.world, lot = this.L.lot;
    const walk = w.walk, WW = w.walkW, WD = w.walkD;
    const { ox, oz } = b;
    let head = b.head, tail = b.tail;
    while (head < tail && budget-- > 0) {
      const c = q[head++];
      const cx = c % FIELD, cz = (c / FIELD) | 0;
      const d = f[c] + 1;
      const visit = (nx, nz) => {
        const k = nx + nz * FIELD;
        if (f[k] !== INF) return;
        const gx = ox + nx, gz = oz + nz;
        if (gx < 0 || gz < 0 || gx >= WW || gz >= WD || !walk[gx + gz * WW]) return;
        if (outdoors && lot[(gz << 1) * WX + (gx << 1)]) return;
        f[k] = d;
        q[tail++] = k;
      };
      if (cx > 0) visit(cx - 1, cz);
      if (cx < FIELD - 1) visit(cx + 1, cz);
      if (cz > 0) visit(cx, cz - 1);
      if (cz < FIELD - 1) visit(cx, cz + 1);
    }
    b.head = head; b.tail = tail;
    return head >= tail;
  }

  beginNear(px, py, pz) {
    const ix = Math.floor(px), iz = Math.floor(pz);
    const iy = this.world.groundBelow(px, py + .5, pz, 40);
    const ox = ix - (NF_X >> 1), oy = iy - (NF_Y >> 1), oz = iz - (NF_Z >> 1);
    this.nearB.fill(INF);
    const k = (ix - ox) + (iy - oy) * NF_X + (iz - oz) * NF_X * NF_Y;
    this.nearB[k] = 0;
    this.nq[0] = k;
    this.nbuild = { ox, oy, oz, head: 0, tail: 1 };
    this.nearDirty = false;
  }

  stepNear(budget) {
    const b = this.nbuild;
    if (!b) return;
    const w = this.world, f = this.nearB, q = this.nq;
    const { ox, oy, oz } = b;
    let head = b.head, tail = b.tail;
    const XY = NF_X * NF_Y;
    // Glass is not a wall to them: a route through a window is a route.
    const clear = (x, y, z) => { const id = w.get(x, y, z); return !id || isGlass(id) || !w.solid(x, y, z); };
    const standable = (x, y, z) => clear(x, y, z) && clear(x, y + 1, z) && clear(x, y + 2, z) && w.solid(x, y - 1, z);
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (head < tail && budget-- > 0) {
      const c = q[head++];
      const lz = (c / XY) | 0, r = c - lz * XY, ly = (r / NF_X) | 0, lx = r - ly * NF_X;
      const x = lx + ox, y = ly + oy, z = lz + oz;
      const d = f[c] + 1;
      for (let dd = 0; dd < 4; dd++) {
        const nx = lx + DIRS[dd][0], nz = lz + DIRS[dd][1];
        if (nx < 0 || nz < 0 || nx >= NF_X || nz >= NF_Z) continue;
        const wx = nx + ox, wz = nz + oz;
        // Reverse edges: a zombie on this neighbour can walk, step up 1 or drop 3 to reach us.
        for (const dy of [0, -1, 1, 2, 3]) {
          const ny = ly + dy;
          if (ny < 0 || ny >= NF_Y) continue;
          const k = nx + ny * NF_X + nz * XY;
          if (f[k] !== INF) { if (dy === 0) break; continue; }
          if (!standable(wx, y + dy, wz)) continue;
          if (dy > 0) {
            let clearAbove = true;
            for (let t = y + 1; t < y + dy + 3; t++) if (w.solid(x, t, z)) { clearAbove = false; break; }
            if (!clearAbove) continue;
          } else if (dy < 0) {
            if (w.solid(wx, y + 2, wz)) continue;
          }
          f[k] = d;
          q[tail++] = k;
          break;
        }
      }
    }
    b.head = head; b.tail = tail;
    if (head >= tail) {
      const t = this.nearA; this.nearA = this.nearB; this.nearB = t;
      this.nearOX = ox; this.nearOY = oy; this.nearOZ = oz;
      this.nbuild = null;
    }
  }

  // The same field read by someone who isn't part of the horde. Null if there is no route from there.
  flowAt(x, z) {
    const f = this.fieldA;
    const cx = (Math.floor(x) >> 1) - this.fieldOX, cz = (Math.floor(z) >> 1) - this.fieldOZ;
    if (cx < 1 || cz < 1 || cx >= FIELD - 1 || cz >= FIELD - 1) return null;
    const k = cx + cz * FIELD, d = f[k], l = f[k - 1], r = f[k + 1], u = f[k - FIELD], v = f[k + FIELD];
    const ref = d === INF ? Math.min(l, r, u, v) + 1 : d;
    if (ref >= INF) return null;
    const dx = (r < ref ? ref - r : 0) - (l < ref ? ref - l : 0), dz = (v < ref ? ref - v : 0) - (u < ref ? ref - u : 0);
    const m = Math.hypot(dx, dz);
    return m ? [dx / m, dz / m] : null;
  }

  // About one in five of them does not keep to the streets: the street map says go round, and they go through. The same ones every time.
  cutsThrough(i) { return this.variant[i] % 5 === 0; }

  // Flow direction from the coarse field; returns false if there is no route.
  flowDir(i) { return this.gradDir(i, this.fieldA, this.fieldOX, this.fieldOZ); }

  campDir(i) { return this.gradDir(i, this.campA, this.campOX, this.campOZ); }

  // Steering for a body attacking a camp. False means it has reached the wall or lost the route.
  siegeSteer(i) {
    // At the wall already (the field bottoms out a cell short of it): keep pressing in. Read off the field there, the cell against the
    // wall leads back out to that line and the line leads back in, and a crowd on the wall sways between the two.
    const cx = (Math.floor(this.px[i]) >> 1) - this.campOX, cz = (Math.floor(this.pz[i]) >> 1) - this.campOZ;
    const atWall = cx >= 0 && cz >= 0 && cx < FIELD && cz < FIELD && this.campA[cx + cz * FIELD] <= 1;
    if (!atWall && this.campDir(i)) return true;
    const c = this.L.camps[this.siege[i] - 1];
    const dx = (c.x0 + c.x1) / 2 - this.px[i], dz = (c.z0 + c.z1) / 2 - this.pz[i];
    const m = Math.hypot(dx, dz) || 1;
    this.sx[i] = dx / m; this.sz[i] = dz / m;
    return false;
  }

  // A hunter whose quarry has gone behind a wall turns on the wall itself.
  // Those already close follow you to the wall. The ones still a long way back lose interest.
  joinSiege(i) {
    const id = this.player.campId;
    if (id === undefined || id < 0 || !this.sim) return false;
    const c = this.L.camps[id], x = this.px[i], z = this.pz[i];
    if (Math.max(c.x0 - x, x - c.x1, c.z0 - z, z - c.z1) > 70 + this.keen(i) * 90) { this.state[i] = S_IDLE; return false; }
    this.siege[i] = id + 1;
    const s = this.sim.state[id];
    // Joining in does not put off the end of a battle. Whether it is over depends on who is at the wall, not who has just turned up.
    s.drawing = true;
    return true;
  }

  // Bring nearby idle bodies down on a camp.
  drawToCamp(c, range, chance) {
    const { px, pz, state, siege } = this;
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const r2 = (range + Math.max(c.x1 - c.x0, c.z1 - c.z0) / 2) ** 2;
    for (let i = 0; i < this.n; i++) {
      if (state[i] !== S_IDLE) continue;
      const dx = px[i] - cx, dz = pz[i] - cz;
      if (dx * dx + dz * dz < r2 && rand() < chance) { state[i] = S_CHASE; siege[i] = c.id + 1; }
    }
  }

  gradDir(i, f, ox, oz) {
    const ox0 = this.sx[i], oz0 = this.sz[i];
    if (!this.fieldDir(i, f, ox, oz)) return false;
    // The field is coarse, two blocks a cell, and along the edge of a building the cells either side of a line can disagree: one turns a
    // body in towards the wall, the next turns it straight back out. Taken one at a time it swings round on the spot every update.
    // Kept a little of the way it was already going, the two settle into the way between them, which is the way along the wall.
    const x = this.sx[i] + ox0 * .6, z = this.sz[i] + oz0 * .6, m = Math.hypot(x, z);
    if (m > .05) { this.sx[i] = x / m; this.sz[i] = z / m; }
    return true;
  }

  fieldDir(i, f, ox, oz) {
    const cx = (Math.floor(this.px[i]) >> 1) - ox, cz = (Math.floor(this.pz[i]) >> 1) - oz;
    if (cx < 1 || cz < 1 || cx >= FIELD - 1 || cz >= FIELD - 1) return false;
    const k = cx + cz * FIELD;
    const d = f[k];
    const l = f[k - 1], r = f[k + 1], u = f[k - FIELD], v = f[k + FIELD];
    if (d === INF && l === INF && r === INF && u === INF && v === INF) {
      // Deeper in than one cell from the open: make for the nearest open ground a little further out. Giving up here and heading
      // straight for the target sends a body back in from the very edge the field just led it out to, and it rocks on that line.
      if (cx < 2 || cz < 2 || cx >= FIELD - 2 || cz >= FIELD - 2) return false;
      let best = INF, bx = 0, bz = 0;
      for (let oz = -2; oz <= 2; oz++) for (let ox = -2; ox <= 2; ox++) {
        if (Math.abs(ox) < 2 && Math.abs(oz) < 2) continue;
        const e = f[k + ox + oz * FIELD];
        if (e < best) { best = e; bx = ox; bz = oz; }
      }
      if (best === INF) return false;
      const m = Math.hypot(bx, bz);
      this.sx[i] = bx / m; this.sz[i] = bz / m;
      return true;
    }
    const ref = d === INF ? Math.min(l, r, u, v) + 1 : d;
    // Downhill only. Counting walls as uphill pushes a body back out of the mouth of any narrow gap.
    let dx = (r < ref ? ref - r : 0) - (l < ref ? ref - l : 0), dz = (v < ref ? ref - v : 0) - (u < ref ? ref - u : 0);
    // Where two ways are equally short, each body has its own habit. Going by the book, all of
    // them would close on the same line down the street; this way they fan out across the road.
    if (dx && dz) {
      const habit = .5 + .42 * Math.sin(this.frame * .002 + this.spd[i] * 9000);
      dx *= habit; dz *= 1 - habit;
    }
    const m = Math.hypot(dx, dz);
    if (m < .001) return false;
    this.sx[i] = dx / m; this.sz[i] = dz / m;
    // A shortest path pulls everyone onto one line. Given room, nobody walks it straight.
    if (l !== INF && r !== INF && u !== INF && v !== INF) this.weave(i, .75);
    return true;
  }

  // Each body drifts to either side of its heading on its own slow rhythm, keyed to its own stride.
  weave(i, amount) {
    const a = Math.sin(this.frame * .006 + this.spd[i] * 5000) * amount;
    const c = Math.cos(a), s = Math.sin(a), x = this.sx[i], z = this.sz[i];
    this.sx[i] = x * c - z * s;
    this.sz[i] = x * s + z * c;
  }

  // Voxel-accurate step toward the player: 2 when a route exists, 0 when none.
  nearDir(i) {
    const w = this.world, f = this.nearA;
    const px = this.px[i], pz = this.pz[i];
    const lx = Math.floor(px) - this.nearOX, lz = Math.floor(pz) - this.nearOZ;
    let ly = Math.floor(this.py[i] + .1) - this.nearOY;
    if (lx < 1 || lz < 1 || lx >= NF_X - 1 || lz >= NF_Z - 1 || ly < 1 || ly >= NF_Y - 4) return 0;
    const XY = NF_X * NF_Y;
    let d = f[lx + ly * NF_X + lz * XY];
    if (d === INF) {
      for (const o of [-1, 1, -2]) {
        const v = f[lx + (ly + o) * NF_X + lz * XY];
        if (v !== INF) { d = v; ly += o; break; }
      }
    }
    if (d === INF) return 0;
    let best = d, bx = 0, bz = 0;
    for (let dd = 0; dd < 4; dd++) {
      const nx = dd === 0 ? lx + 1 : dd === 1 ? lx - 1 : lx;
      const nz = dd === 2 ? lz + 1 : dd === 3 ? lz - 1 : lz;
      for (const o of [0, 1, -1, -2, -3]) {
        const v = f[nx + (ly + o) * NF_X + nz * XY];
        if (v < best) { best = v; bx = nx - lx; bz = nz - lz; }
      }
    }
    if (best >= d) return d === 0 ? 2 : 0;
    const tx = lx + this.nearOX + bx + .5 - px, tz = lz + this.nearOZ + bz + .5 - pz;
    const m = Math.hypot(tx, tz) || 1;
    this.sx[i] = tx / m; this.sz[i] = tz / m;
    if (d > 12) this.weave(i, .5);
    return 2;
  }

  // --- Noise and alerts ---------------------------------------------------------------------
  noise(x, z, radius, chance = .9) {
    const r2 = radius * radius;
    const n = this.n, state = this.state, px = this.px, pz = this.pz;
    // Sound fades with distance, and only so many can be after you at once.
    let room = this.chaseCap() - this.hunters;
    for (let i = 0; i < n && room > 0; i++) {
      if (state[i] !== S_IDLE) continue;
      const dx = px[i] - x, dz = pz[i] - z;
      const d = dx * dx + dz * dz;
      if (d < r2 && rand() < chance * (1 - d / r2)) { state[i] = S_CHASE; room--; }
    }
  }

  chaseCap() { return 420 * this.settings.horde; }

  // How alert this one is, 0 to 1. Fixed for each body, so a crowd thins out with distance instead of stopping dead.
  keen(i) { return (this.spd[i] * 7919) % 1; }

  // A crowd on the hunt makes a racket that carries, and the bigger it gets the further it carries. Each body has
  // its own idea of how far is far enough, so the pull fades away with distance and never stops at a line. A few
  // stragglers are not a horde and draw nobody.
  followCrowd(i, d2) {
    if (this.hunters < 40 || this.hunters >= this.chaseCap() || this.player.sanctuary) return false;
    const reach = (30 + 150 * Math.sqrt(this.hunters / this.chaseCap())) * (.45 + this.keen(i) * .9);
    if (d2 < reach * reach) {
      if (rand() < .015) { this.state[i] = S_CHASE; return true; }
      return false;
    }
    // Further out it takes seeing the others actually go past.
    if (d2 > reach * reach * 2.56) return false;
    const hx = Math.floor(this.px[i] / HC) - this.gridX, hz = Math.floor(this.pz[i] / HC) - this.gridZ;
    for (let t = 0; t < 3; t++) {
      const cx = hx + Math.floor(rand() * 11) - 5, cz = hz + Math.floor(rand() * 11) - 5;
      if (cx < 0 || cz < 0 || cx >= GRID || cz >= GRID) continue;
      let j = this.head[cx + cz * GRID], seen = 0;
      while (j !== -1 && seen < 4) {
        if (j !== i && this.state[j] === S_CHASE && !this.siege[j]) { this.state[i] = S_CHASE; return true; }
        j = this.nextInCell[j];
        seen++;
      }
    }
    return false;
  }

  // --- Simulation -----------------------------------------------------------------------------
  update(dt, P) {
    this.player = P;
    this.frame++;
    const s = this.settings;
    const { px, py, pz, vx, vz, sx, sz, yaw, state, spd, phase } = this;
    const fieldStart = !this.fbuild && (this.fieldTimer -= dt) <= 0;
    if (fieldStart) { this.beginField(P.x, P.z); this.fieldTimer = .5; }
    this.stepField(45000);
    if (this.sim) {
      this.campTimer -= dt;
      if (!this.cbuild && this.campTimer <= 0 && this.sim.hot) { this.beginCampField(P); this.campTimer = 1; }
      this.stepCampField(30000);
    }
    this.migTimer -= dt;
    if (this.migTargets.size) {
      for (const [k, t] of this.migTargets) if ((t.ttl -= dt) <= 0) this.migTargets.delete(k);
      if (!this.mbuild && this.migTimer <= 0) { this.beginMigField(P); this.migTimer = 3.5; }
    }
    this.stepMigField(25000);
    this.roadTimer -= dt;
    if (this.roadTarget && !this.rbuild && this.roadTimer <= 0) { this.beginRoadField(P); this.roadTimer = 4; }
    this.stepRoadField(25000);
    this.nearTimer -= dt;
    if (!this.nbuild && (this.nearTimer <= 0 || this.nearDirty)) { this.beginNear(P.x, P.y, P.z); this.nearTimer = .3; }
    this.stepNear(2600);

    this.gnawBudget = Math.min(10, this.gnawBudget + dt * 6);
    // Out on the street there is no wall crew and nothing holding them back: a crowd at a building takes it apart.
    this.streetBudget = Math.min(30, (this.streetBudget || 0) + dt * 11);
    // The city's buildings come apart at full speed only with a big operation on nearby (magnitude 4 and up). The rest of the time
    // a crowd still gets through them, just more slowly.
    if ((this.wreckT = (this.wreckT || 0) - dt) <= 0) {
      this.wreckT = 1;
      let k = .6;
      if (this.sim) for (const c of this.L.camps) {
        const s = this.sim.state[c.id];
        if (s && s.op && (s.op.mag || 1) >= 4 && Math.max(c.x0 - P.x, P.x - c.x1, c.z0 - P.z, P.z - c.z1) < 300) { k = 1; break; }
      }
      // Out on the road with a fallen settlement's people, the city comes apart round you a good deal more than usual.
      if ((this.journeyWant ?? 1) < 1) k = Math.max(k, 1.15);
      this.wreckK = k;
    }
    this.chewBudget = Math.min(30, (this.chewBudget || 0) + dt * 30);
    this.ambientWreck(P, dt);

    // Remove corpses-to-be and rebuild the hash.
    const gx = Math.floor(P.x / HC) - (GRID >> 1), gz = Math.floor(P.z / HC) - (GRID >> 1);
    this.gridX = gx; this.gridZ = gz;
    const head = this.head;
    head.fill(-1);
    const next = this.nextInCell;
    const R = s.radius, despawn = (R + 26) * (R + 26);
    let n = this.n;
    const speedK = BASE_SPEED * s.speed * (1 + this.nightK * .15);
    let nearCount = 0, chasers = 0, hunters = 0;
    if (this.swarm.length < this.humans.length) { this.swarm = new Int16Array(this.humans.length * 2); this.swarmNow = new Int16Array(this.humans.length * 2); }
    const counted = this.swarm;
    this.swarm = this.swarmNow;
    this.swarmNow = counted;
    this.swarmNow.fill(0);
    // How full the streets are allowed to be, eased towards what the road calls for so it never pops.
    const jw = this.journeyWant ?? 1;
    this.journeyK = this.journeyK === undefined ? jw : this.journeyK + (jw - this.journeyK) * Math.min(1, dt * .15);
    const thin = this.journeyK < .98 ? (1 - this.journeyK) * .5 : 0;
    const sc = this.siegeCount, active = this.active;
    sc.fill(0);
    active.fill(0);
    const NEAR2 = 40 * 40, MID2 = 105 * 105, w = this.world, turnK = Math.min(1, dt * 7), turnMax = dt * TURN_RATE;
    const f = this.frame;
    const hot = !!(this.sim && this.sim.hot);

    for (let i = 0; i < n; i++) {
      if (this.hp[i] <= 0) {
        n = this.removeAt(i, n);
        i--;
        continue;
      }
      const dx = px[i] - P.x, dz = pz[i] - P.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > despawn) {
        this.bank(px[i], pz[i]);
        n = this.removeAt(i, n);
        i--;
        continue;
      }
      // Thinning the road: now and then one of the idle ones well away from you drifts off, back into the city's count. Nothing that is
      // after anyone, nothing near, nothing laying siege to a wall.
      if (thin && state[i] === S_IDLE && d2 > 55 * 55 && !this.siege[i] && ((i + f) & 63) === 0 && rand() < thin) {
        this.bank(px[i], pz[i]);
        n = this.removeAt(i, n);
        i--;
        continue;
      }
      const here = (px[i] >> 4) + (pz[i] >> 4) * this.fineW;
      if (here >= 0 && here < active.length) active[here]++;
      // Integrate every body every frame; steering below is staggered.
      px[i] += vx[i] * dt;
      pz[i] += vz[i] * dt;
      const st = state[i];
      phase[i] += (Math.abs(vx[i]) + Math.abs(vz[i])) * dt * 2.1;
      if (this.flinch[i] > 0) this.flinch[i] -= dt;
      if (st !== S_IDLE) { chasers++; if (!this.siege[i]) hunters++; }
      if (this.siege[i]) sc[this.siege[i] - 1]++;

      // Only the detailed update has gravity. Anyone up off the street with nothing under them gets it, wherever they are.
      const unheld = py[i] > this.gy(px[i], pz[i]) + 1 && ((i + f) & 7) === 0 && w.isLoaded(Math.floor(px[i]), Math.floor(py[i]), Math.floor(pz[i])) && !w.solid(Math.floor(px[i]), Math.floor(py[i] - .05), Math.floor(pz[i]));
      if (unheld) this.droppers[i] = 1;
      if (this.droppers[i] || (d2 < NEAR2 && Math.abs(py[i] - P.y) < 30) || (st !== S_IDLE && d2 < 8100 && py[i] > this.gy(px[i], pz[i]) + 2.5)) {
        if (this.droppers[i] && w.solid(Math.floor(px[i]), Math.floor(py[i] - .05), Math.floor(pz[i]))) this.droppers[i] = 0;
        nearCount++;
        this.updateNear(i, dt, d2, speedK);
      } else if (hot && this.campAt(px[i], pz[i], 9)) {
        // The fight at a settlement is fought in full detail wherever the player happens to be standing: the wall, the pressure on it,
        // the holes. But a crowd of thousands does not need every one of them worked out every frame. Close to you, every frame; further
        // along the wall, every second or third frame with the time to match, which moves them just the same for a fraction of the work.
        const k = d2 < 3600 ? 1 : d2 < 19600 ? 2 : 3;
        if (k === 1 || (i + f) % k === 0) this.updateNear(i, dt * k, d2, speedK);
      } else {
        if (d2 < MID2) { if (((i + f) & 3) === 0) this.updateMid(i, dt * 4, d2, speedK); }
        else if (((i + f) & 15) === 0) this.updateFar(i, dt * 16, d2, speedK);
        // Steering further out is only worked out every few frames, but the turn onto it is spread over the frames between, the
        // same as close up, so nothing in view swings round in one jump.
        if (d2 < TURN2 && Math.abs(sx[i]) + Math.abs(sz[i]) > .05) {
          let da = Math.atan2(sx[i], sz[i]) - yaw[i];
          while (da > Math.PI) da -= 6.2832;
          while (da < -Math.PI) da += 6.2832;
          const t = da * turnK;
          yaw[i] += t > turnMax ? turnMax : t < -turnMax ? -turnMax : t;
        }
      }
      const hx = Math.floor(px[i] / HC) - gx, hz = Math.floor(pz[i] / HC) - gz;
      if (hx >= 0 && hz >= 0 && hx < GRID && hz < GRID) {
        const c = hx + hz * GRID;
        next[i] = head[c];
        head[c] = i;
      }
    }
    this.n = n;
    this.nearCount = nearCount;
    this.chasers = chasers;
    this.hunters = hunters;

    this.spawnStep(P);
    this.spawnStragglers(P, dt);
    this.updateCorpses(dt);
  }

  removeAt(i, n) {
    const last = n - 1;
    if (i !== last) {
      this.px[i] = this.px[last]; this.py[i] = this.py[last]; this.pz[i] = this.pz[last];
      this.vx[i] = this.vx[last]; this.vy[i] = this.vy[last]; this.vz[i] = this.vz[last];
      this.sx[i] = this.sx[last]; this.sz[i] = this.sz[last];
      this.yaw[i] = this.yaw[last]; this.phase[i] = this.phase[last]; this.spd[i] = this.spd[last];
      this.atk[i] = this.atk[last]; this.blk[i] = this.blk[last]; this.hp[i] = this.hp[last];
      this.state[i] = this.state[last]; this.variant[i] = this.variant[last]; this.tgt[i] = this.tgt[last];
      this.siege[i] = this.siege[last];
      this.mig[i] = this.mig[last];
      this.hurtT[i] = this.hurtT[last];
      this.knockT[i] = this.knockT[last]; this.flinch[i] = this.flinch[last]; this.flx[i] = this.flx[last]; this.flz[i] = this.flz[last];
      this.stuck[i] = this.stuck[last]; this.stuckT[i] = this.stuckT[last]; this.lastX[i] = this.lastX[last]; this.lastZ[i] = this.lastZ[last]; this.droppers[i] = this.droppers[last]; this.lure[i] = this.lure[last];
    }
    return last;
  }

  spawnStep(P) {
    const s = this.settings;
    if (this.n >= s.activeCap) return;
    const R = s.radius, inner = Math.min(R * .55, 90);
    for (let k = 0; k < 260 && this.n < s.activeCap; k++) {
      const a = rand() * 6.283;
      const r = inner + rand() * (R - inner);
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
      this.trySpawnAt(x, z);
    }
    // A few wake up inside the buildings around the player.
    if ((this.frame & 7) === 0) this.spawnIndoors(P);
  }

  // Offices and apartments are full of them, in twos and threes, shut in since the first week.
  spawnIndoors(P) {
    const w = this.world;
    for (let t = 0; t < 4; t++) {
      const a = rand() * 6.283, r = 18 + rand() * 62;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
      const i = z * WX + x;
      if (!this.L.lot[i]) continue;
      // Nothing wakes up behind a camp's wall: those buildings were cleared long ago.
      const near = this.inCamp(x, z, 36);
      if (near && !(this.sim && this.sim.isRuined(near.id))) continue;
      const hb = this.L.buildings[this.L.lot[i] - 1], floors = Math.floor((this.L.height[i] - STREET_Y - hb.lift) / FLOOR_H);
      if (floors < 2 || hb.house) continue;
      const y = STREET_Y + hb.lift - 1 + FLOOR_H * (1 + Math.floor(rand() * Math.min(floors - 1, 16))) + 1;
      if (Math.abs(y - P.y) < 3 && r < 26) continue;
      if (!w.isLoaded(x, y, z)) continue;
      const cell = (x >> 6) + (z >> 6) * this.popW;
      let group = 1 + Math.floor(rand() * 3);
      for (let k = 0; k < 6 && group > 0 && this.pop[cell] >= 1; k++) {
        const ox = x + Math.floor(rand() * 5) - 2, oz = z + Math.floor(rand() * 5) - 2;
        if (w.solid(ox, y - 1, oz) && !w.solid(ox, y, oz) && !w.solid(ox, y + 1, oz) && !w.solid(ox, y + 2, oz)) {
          this.pop[cell] -= 1;
          this.spawnOne(ox + .5, y, oz + .5);
          group--;
        }
      }
    }
  }

  addLure(x, z) {
    for (let k = 1; k < this.lures.length; k++) if (!this.lures[k]) { this.lures[k] = { x, z }; return k; }
    if (this.lures.length >= 255) return 0;
    this.lures.push({ x, z });
    return this.lures.length - 1;
  }

  dropLure(k) { this.lures[k] = null; }

  // Further out, where the full update does not reach: a body with something drawing it walks over and stands there, the same as close up.
  lureSteer(i) {
    if (!this.lure[i]) return false;
    const L = this.lures[this.lure[i]];
    if (!L) { this.lure[i] = 0; return false; }
    const dx = L.x - this.px[i], dz = L.z - this.pz[i], m = Math.hypot(dx, dz) || 1;
    if (m > 1.8) { this.sx[i] = dx / m; this.sz[i] = dz / m; } else { this.sx[i] = 0; this.sz[i] = 0; }
    return true;
  }

  // --- The city coming apart on its own ---------------------------------------------------------------
  // Nobody has to be there for it. Every so often, somewhere along the streets in sight of you, a knot of the dead fetches up against a
  // building and goes at it: the ones round about drift over to join in, and between them they pull out windows and the front of the
  // ground floor for a minute or two. Enough of a building's footing goes that way and it comes down by itself, like any other.
  ambientWreck(P, dt) {
    if (this.menu || !this.onGnaw || !this.sim) return;
    const W = this.wild;
    if (W) { this.workWild(W, dt); return; }
    if ((this.wildT = (this.wildT ?? 20 + rand() * 20) - dt) > 0) return;
    this.wildT = 4;   // nothing found: look again shortly
    const w = this.world, L = this.L, { px, py, pz } = this;
    for (let t = 0; t < 60 && this.n; t++) {
      const i = Math.floor(rand() * this.n);
      if (this.state[i] !== S_IDLE || this.siege[i] || this.mig[i] || this.lure[i] || Math.abs(py[i] - this.gy(px[i], pz[i])) > 1.5) continue;
      const d = Math.hypot(px[i] - P.x, pz[i] - P.z);
      if (d < 45 || d > 160) continue;
      const near = this.inCamp(px[i], pz[i], 45);
      if (near && !this.sim.isRuined(near.id)) continue;
      // The face of a building close by, at street level.
      const ix = Math.floor(px[i]), iz = Math.floor(pz[i]);
      let face = null;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let r = 1; r <= 7 && !face; r++) {
          const x = ix + ax * r, z = iz + az * r;
          if (x < 1 || z < 1 || x >= WX - 1 || z >= WZ - 1) break;
          const lot = L.lot[z * WX + x];
          if (!lot) continue;
          const b = L.buildings[lot - 1];
          const fy = STREET_Y + b.lift;
          if (!b || (L.height[z * WX + x] - fy) < 8 || !w.isLoaded(x, fy + 1, z)) break;
          if (w.solid(x, fy + 1, z)) face = { x, z, ax, az, lot, sx: x - ax * 1.5, sz: z - az * 1.5 };
          else break;
        }
        if (face) break;
      }
      if (!face) continue;
      // Who is about to join in.
      const k = this.addLure(face.sx + .5, face.sz + .5);
      if (!k) return;
      const crew = [];
      this.forRadius(face.sx, face.sz, 18, (j) => {
        if (crew.length >= 26 || this.state[j] !== S_IDLE || this.siege[j] || this.mig[j] || this.lure[j] || Math.abs(py[j] - this.gy(px[j], pz[j])) > 1.5) return;
        if (rand() < .75) { this.lure[j] = k; crew.push(j); }
      });
      if (crew.length < 6) { for (const j of crew) this.lure[j] = 0; this.dropLure(k); continue; }
      this.wild = { ...face, k, t: 80 + rand() * 70, tick: 0 };
      return;
    }
  }

  workWild(W, dt) {
    const w = this.world, P = this.player;
    const done = (W.t -= dt) <= 0 || Math.hypot(W.sx - P.x, W.sz - P.z) < 30 || !w.isLoaded(W.x, this.gy(W.x, W.z) + 1, W.z);
    if (done) {
      // Over: they lose interest and wander off. Anyone it was all happening in front of is another matter: close up, they have seen you.
      for (let i = 0; i < this.n; i++) if (this.lure[i] === W.k) { this.lure[i] = 0; if (!this.siege[i] && Math.hypot(this.px[i] - P.x, this.pz[i] - P.z) > 30) this.state[i] = S_IDLE; }
      this.dropLure(W.k);
      this.wild = null;
      this.wildT = 25 + rand() * 35;
      return;
    }
    if ((W.tick -= dt) > 0) return;
    W.tick = .35;
    // How many of them are actually up against it.
    let crowd = 0;
    this.forRadius(W.sx, W.sz, 6, (j) => { if (this.lure[j] === W.k) crowd++; });
    if (crowd < 2) return;
    const hits = Math.min(5, 1 + Math.floor(crowd / 4));
    for (let h = 0; h < hits; h++) {
      // Along the front, a little either side of where they are packed, from the ground up to the first floor's windows.
      const side = Math.round((rand() - .5) * 7), up = Math.floor(rand() * 4);
      const x = W.az ? W.x + side : W.x, z = W.ax ? W.z + side : W.z, y = this.gy(W.sx, W.sz) + up;
      // Into the building a block or two, past whatever has already gone.
      for (let r = 0; r < 3; r++) {
        const cx = x + W.ax * r, cz = z + W.az * r, id = w.get(cx, y, cz);
        if (!id) continue;
        if (isGlass(id)) { if (this.onGlass) this.onGlass(cx, y, cz); break; }
        if (HP[id] !== 255 && this.streetChew(cx, y, cz)) this.onGnaw(cx, y, cz, id, 2.5 + Math.min(3, crowd * .25));
        break;
      }
    }
  }

  // Tear at whatever is actually in the way. Walking at an angle, the block stopping a body is often off to one side of where it is heading
  // and the spot straight ahead is clear, so try the way it faces and then each side of it. Head height first: that is what opens a way through.
  chewAhead(i, bx, y, bz, force, allow = null) {
    const w = this.world, sx = this.sx[i], sz = this.sz[i], fy = Math.floor(y + .02), ix = Math.floor(bx), iz = Math.floor(bz);
    const ax = sx > .2 ? 1 : sx < -.2 ? -1 : 0, az = sz > .2 ? 1 : sz < -.2 ? -1 : 0;
    const fx = Math.floor(bx + sx * .9), fz = Math.floor(bz + sz * .9);
    for (let k = 0; k < 3; k++) {
      const cx = k === 0 ? fx : k === 1 ? ix + ax : ix, cz = k === 0 ? fz : k === 1 ? iz : iz + az;
      for (let h = 0; h < 3; h++) {
        const cy = fy + (h === 0 ? 1 : h === 1 ? 0 : 2), id = w.get(cx, cy, cz);
        if (id && HP[id] !== 255 && (!allow || allow(cx, cy, cz, id))) {
          if (this.onGnaw) this.onGnaw(cx, cy, cz, id, force);
          return true;
        }
      }
    }
    return false;
  }

  // What the dead are allowed to pull apart out on the street: anything standing on it, but not the street itself, and not a camp's wall or gate.
  // The odd beam or barricade put up just outside a wall is fair game.
  streetChew(x, y, z) {
    if (y < STREET_Y) return false;
    // A few blocks out counts as the wall too: whatever it is faced with on the outside, and the towers either side of a gate, are
    // as much a part of it as the inside layer, and hold the same way.
    const c = this.inCamp(x + .5, z + .5, 4);
    return !c || (this.sim && this.sim.isRuined(c.id));
  }

  // Inside a camp, well clear of the wall: the shacks and tents and whatever else the dead get in among once they are through.
  campInside(x, y, z) {
    return y >= STREET_Y && !!this.campAt(x + .5, z + .5, -7);
  }

  updateNear(i, dt, d2, speedK) {
    const { px, py, pz, vx, vy, vz, sx, sz, state, spd, yaw, tgt } = this;
    const w = this.world;
    const P = this.player;
    let st = state[i];
    if (this.hurtT[i] > 0) this.hurtT[i] -= dt;

    // Think: staggered target and route selection.
    if (((i + this.frame) & 3) === 0) {
      let tx = P.x, ty = P.y, tz = P.z, dist2 = d2, t = -1;
      if (this.humans.length) {
        // Only so many can reach one person. Once someone is crowded, the ones still arriving pick somebody else,
        // so a breach spreads through a camp instead of piling onto the first person it finds.
        const crowd = this.swarm, was = tgt[i];
        let best = !this.ignorePlayer && Math.abs(P.y - py[i]) < 6 ? d2 : 1e9;   // a player up on a roof does not outrank the people at street level
        for (let h = 0; h < this.humans.length; h++) {
          const H = this.humans[h];
          if (H.dead) continue;
          const dx = H.x - px[i], dz = H.z - pz[i];
          const dd = dx * dx + dz * dz;
          // Someone up on a catwalk is out of reach; go for the people you can actually get to.
          if (dd >= (st === S_IDLE ? 180 : 420) || Math.abs(H.y - py[i]) >= 3.5) continue;
          // Raiders move fast and shoot back: the dead don't go out of their way for them, and only a few at a time get close.
          // Anyone running for their life gets some of that, but a crowd they run into is a crowd they run into.
          if (st === S_IDLE && dd >= (H.raider ? 16 : H.evacuee ? 49 : 1e9)) continue;
          const others = crowd[h] - (h === was ? 1 : 0);
          if (others >= (H.raider ? 3 : H.evacuee ? 6 : 9) && dd >= 3.2) continue;     // no room left around this one
          const score = dd < 3.2 ? dd : dd + Math.max(0, others - 2) * 18;
          if (score < best) { best = score; dist2 = dd; tx = H.x; ty = H.y; tz = H.z; t = h; }
        }
        if (t !== was) {
          if (was >= 0) crowd[was]--;
          if (t >= 0) crowd[t]++;
        }
      }
      tgt[i] = t;
      // Told to leave you be: nobody is after you, and anyone who was loses interest.
      if (this.ignorePlayer && t < 0) {
        dist2 = 1e9;
        if (st !== S_IDLE && !this.siege[i]) { st = S_IDLE; state[i] = st; }
      }
      if (st === S_IDLE) {
        // Nothing on the street can see you behind a camp wall. Inside the wall is another matter.
        const blind = P.sanctuary && !this.campAt(px[i], pz[i]);
        const sight = (t >= 0 ? 14 : (blind ? 0 : AWARE * P.stealth * (.7 + this.keen(i) * .7))) * this.settings.sight * (1 + this.nightK * .25);
        // Close by they smell you; further off they have to be able to see you.
        if (dist2 < sight * sight && (t >= 0 || dist2 < 100 || w.los(px[i], py[i] + 2.2, pz[i], tx, ty + 2.2, tz))) { st = S_CHASE; state[i] = st; }
        else if (rand() < .03 && this.followCrowd(i, d2)) st = S_CHASE;
        else if (this.mig[i]) this.migSteer(i);
        else if (rand() < .02) {
          const a = rand() * 6.283;
          sx[i] = Math.sin(a); sz[i] = Math.cos(a);
          if (rand() < .4) { sx[i] = 0; sz[i] = 0; }
        }
      } else if (this.siege[i]) {
        const sg = this.siege[i] - 1, c = this.L.camps[sg], inside = this.campAt(px[i], pz[i]);
        if (!this.sim.state[sg].drawing && !inside) {
          this.siege[i] = 0;
          if (rand() < .6) { st = S_IDLE; state[i] = st; }
        } else if (t >= 0) {
          const m = Math.sqrt(dist2) || 1;
          sx[i] = (tx - px[i]) / m; sz[i] = (tz - pz[i]) / m;
        } else if (d2 < 144 && Math.abs(P.y - py[i]) < 4 && (inside || !P.sanctuary)) {
          this.siege[i] = 0;    // a live player within reach beats a wall
        } else if (inside) {
          // Loose inside the camp: drift to where the people are, sliding off whatever is in the way.
          if (this.blk[i] > .3 || rand() < .06) {
            const a = rand() * 6.283, bias = rand() < .6;
            // Each has a part of the camp it is making for, so they fan out from the hole.
            const gx = c.x0 + ((i * .618 + (this.frame >> 9) * .37) % 1) * (c.x1 - c.x0), gz = c.z0 + ((i * .382 + (this.frame >> 9) * .73) % 1) * (c.z1 - c.z0);
            const dx = gx - px[i], dz = gz - pz[i], m = Math.hypot(dx, dz) || 1;
            sx[i] = bias ? dx / m : Math.sin(a); sz[i] = bias ? dz / m : Math.cos(a);
          }
        } else this.siegeSteer(i);
      } else if (P.sanctuary && t < 0 && !this.campAt(px[i], pz[i])) {
        // You got inside. A hunting crowd does not forget that: it starts on the wall.
        if (this.joinSiege(i)) this.siegeSteer(i);
      } else if (dist2 < 36 && Math.abs(ty - py[i]) < 2 && w.los(px[i], py[i] + 1.5, pz[i], tx, ty + 1.5, tz)) {
        const m = Math.sqrt(dist2) || 1;
        sx[i] = (tx - px[i]) / m; sz[i] = (tz - pz[i]) / m;
      } else if (t >= 0) {
        const m = Math.sqrt(dist2) || 1;
        sx[i] = (tx - px[i]) / m; sz[i] = (tz - pz[i]) / m;
      } else if (py[i] - P.y > 3.5 && dist2 < 60 * 60 && spd[i] * 100 % 1 < .6) {
        // Upstairs and they have seen you. Most do not look for the stairs: they run at you,
        // through the glass and out of the window, and the street can sort out the rest.
        const m = Math.sqrt(dist2) || 1;
        sx[i] = (tx - px[i]) / m; sz[i] = (tz - pz[i]) / m;
      } else {
        const r = this.nearDir(i);
        if (!r && !this.flowDir(i)) {
          const m = Math.sqrt(dist2) || 1;
          sx[i] = (tx - px[i]) / m; sz[i] = (tz - pz[i]) / m;
        }
      }
    }

    if (this.lure[i]) {
      // Something has caught its attention. It goes and stands there until that thing is gone.
      const L = this.lures[this.lure[i]];
      if (!L) this.lure[i] = 0;
      else {
        const dx = L.x - px[i], dz = L.z - pz[i], m = Math.hypot(dx, dz) || 1;
        st = S_CHASE; state[i] = st;
        if (m > 1.8) { sx[i] = dx / m; sz[i] = dz / m; }
        else { sx[i] = 0; sz[i] = 0; yaw[i] = Math.atan2(dx, dz); }
        tgt[i] = -1;
      }
    }
    if (tgt[i] >= 0) this.swarmNow[tgt[i]]++;

    // Melee range against the current target.
    let tgtX = P.x, tgtY = P.y, tgtZ = P.z;
    const H = tgt[i] >= 0 ? this.humans[tgt[i]] : null;
    if (H && !H.dead) { tgtX = H.x; tgtY = H.y; tgtZ = H.z; }
    const ddx = tgtX - px[i], ddz = tgtZ - pz[i];
    const flat2 = ddx * ddx + ddz * ddz;
    let moving = 1;
    if (st !== S_IDLE) {
      if (flat2 < 2.9 && Math.abs(tgtY - py[i]) < 2.6 && (H || !this.ignorePlayer)) {
        st = S_ATTACK;
        // Close enough to reach: it stops walking, rather than shoving on into them and out the other side.
        moving = flat2 < 1.6 ? 0 : .15;
        this.atk[i] -= dt;
        if (this.atk[i] <= 0) {
          this.atk[i] = 1.15 + rand() * .8;
          if (H && !H.dead) { if (this.onHitHuman) this.onHitHuman(H); }
          else if (this.onHitPlayer && P.alive) this.onHitPlayer(i, px[i], pz[i]);
        }
        yaw[i] = Math.atan2(ddx, ddz);
      } else st = S_CHASE;
      state[i] = st;
    }

    // Still reeling from a heavy blow: no walking forward until they have got their feet back.
    if (this.hurtT[i] > .22) moving *= .05;
    const speed = st === S_IDLE ? (this.mig[i] ? spd[i] * speedK * .55 : spd[i] * .44) : spd[i] * speedK * (this.lure[i] ? 1.4 : 1);
    // Getting nowhere for a good while: try along the obstruction, first one way and then the other, then come back to it.
    let hx = sx[i], hz = sz[i];
    if (this.stuck[i] >= 5 && st !== S_IDLE) { const k = Math.floor(this.stuck[i] / 2) & 1 ? 1 : -1; hx = -sz[i] * k; hz = sx[i] * k; }
    let tvx = hx * speed * moving, tvz = hz * speed * moving;

    // Separation: keeps crowds from collapsing into a single point.
    const gx = Math.floor(px[i] / HC) - this.gridX, gz = Math.floor(pz[i] / HC) - this.gridZ;
    if (gx > 0 && gz > 0 && gx < GRID - 1 && gz < GRID - 1) {
      const head = this.head, next = this.nextInCell;
      let seen = 0, pushX = 0, pushZ = 0;
      for (let oz = -1; oz <= 1 && seen < 7; oz++) for (let ox = -1; ox <= 1 && seen < 7; ox++) {
        let j = head[gx + ox + (gz + oz) * GRID];
        while (j !== -1 && seen < 7) {
          if (j !== i) {
            const ax = px[i] - px[j], az = pz[i] - pz[j];
            const a2 = ax * ax + az * az;
            if (a2 < 1.1 && Math.abs(py[i] - py[j]) < 2) {
              const m = Math.sqrt(a2) + .02;
              const k = (1.05 - m) * 4.5 / m;
              pushX += ax * k; pushZ += az * k;
              seen++;
            }
          }
          j = next[j];
        }
      }
      tvx += pushX; tvz += pushZ;
    }

    const blend = Math.min(1, dt * 9);
    if (this.knockT[i] > 0) {
      // In the air or sliding from a blast: no steering, only drag.
      this.knockT[i] -= dt;
      vx[i] *= 1 - Math.min(1, dt * 1.6); vz[i] *= 1 - Math.min(1, dt * 1.6);
    } else {
      vx[i] += (tvx - vx[i]) * blend;
      vz[i] += (tvz - vz[i]) * blend;
    }
    if (st !== S_ATTACK && (Math.abs(sx[i]) + Math.abs(sz[i])) > .05) {
      const want = Math.atan2(sx[i], sz[i]);
      let da = want - yaw[i];
      while (da > Math.PI) da -= 6.2832;
      while (da < -Math.PI) da += 6.2832;
      // No faster than a body can actually swing round: steering that changes its mind from one update to the next then shows as a
      // lean one way and the other, not a twitch.
      const t = da * Math.min(1, dt * 7), tm = dt * TURN_RATE;
      yaw[i] += t > tm ? tm : t < -tm ? -tm : t;
    }

    // Voxel collision. Integration above already moved us; undo and step per axis.
    const r = .34;
    const stepX = vx[i] * dt, stepZ = vz[i] * dt;
    let y = py[i];
    const fy = Math.floor(y + .02);
    let bx = px[i], bz = pz[i];
    const ox0 = bx - stepX, oz0 = bz - stepZ;
    let blocked = false;
    {
      const cx = Math.floor(bx + (stepX > 0 ? r : -r)), cz = Math.floor(oz0);
      // Through a gap in a camp's wall they duck: two blocks of headroom will do there.
      const duck = this.campAt(bx, bz, 3) && !this.campAt(bx, bz, -3);
      const a = w.solid(cx, fy, cz), b = w.solid(cx, fy + 1, cz), c = !duck && w.solid(cx, fy + 2, cz);
      if (a || b || c) {
        if (a && !b && !c && !w.solid(cx, fy + 3, cz)) y = fy + 1;
        else { bx = ox0; blocked = true; vx[i] = 0; }
      }
    }
    {
      const fy2 = Math.floor(y + .02);
      const cx = Math.floor(bx), cz = Math.floor(bz + (stepZ > 0 ? r : -r));
      const duck2 = this.campAt(bx, bz, 3) && !this.campAt(bx, bz, -3);
      const a = w.solid(cx, fy2, cz), b = w.solid(cx, fy2 + 1, cz), c = !duck2 && w.solid(cx, fy2 + 2, cz);
      if (a || b || c) {
        if (a && !b && !c && !w.solid(cx, fy2 + 3, cz)) y = fy2 + 1;
        else { bz = oz0; blocked = true; vz[i] = 0; }
      }
    }
    px[i] = bx; pz[i] = bz;

    // A body pressing on a window goes straight through it.
    if (blocked && st !== S_IDLE && this.gnawBudget >= .3) {
      const a = Math.atan2(sx[i], sz[i]);
      const cx = Math.floor(bx + Math.sin(a) * .9), cz = Math.floor(bz + Math.cos(a) * .9), fy3 = Math.floor(y + .02);
      for (const oy of [1, 0, 2]) {
        if (isGlass(w.get(cx, fy3 + oy, cz))) {
          this.gnawBudget -= .3;
          if (this.onGlass) this.onGlass(cx, fy3 + oy, cz);
          break;
        }
      }
    }

    // Bodies stop at arm's length, from you (rather than clipping through the camera) and from anyone else they are going for: walking
    // into a person and out the other side flips the way to them from one frame to the next, and the body spins on the spot.
    {
      const T = H && !H.dead ? H : P, reach = H ? .9 : 1;
      const ax = bx - T.x, az = bz - T.z, a2 = ax * ax + az * az;
      if (a2 < reach * reach && Math.abs(y - T.y) < 2.4 && a2 > .0001) {
        const m = Math.sqrt(a2), k = (reach - m) / m;
        const nx = bx + ax * k, nz = bz + az * k;
        if (!w.solid(Math.floor(nx), Math.floor(y + .5), Math.floor(nz))) { bx = nx; bz = nz; px[i] = bx; pz[i] = bz; }
      }
    }

    // Are they actually getting anywhere? A body leaning on a wall only touches it now and then, because each touch knocks it back a little,
    // so one frame's collision says very little. Half a second of no progress says all of it.
    if ((this.stuckT[i] += dt) >= .5) {
      const moved = Math.abs(bx - this.lastX[i]) + Math.abs(bz - this.lastZ[i]);
      this.lastX[i] = bx; this.lastZ[i] = bz;
      this.stuck[i] = st === S_CHASE && moved < this.stuckT[i] ? this.stuck[i] + this.stuckT[i] : Math.max(0, this.stuck[i] - 1);
      this.stuckT[i] = 0;
    }
    const pressing = blocked || this.stuck[i] >= 1;

    // Climb or chew through what is stopping us when the player is out of reach.
    const atCampWall = this.campAt(bx, bz, 10);
    const ruin = pressing && st !== S_IDLE && atCampWall && this.sim ? this.sim.ruinChew(bx, bz) : 0;
    if (ruin) {
      // Whatever is in the way in a camp comes apart. How fast depends on how far gone the place is.
      this.blk[i] = Math.min(2, this.blk[i] + dt);
      const cost = ruin >= 7 ? .2 : .5;
      if (this.blk[i] > (ruin >= 7 ? .15 : .45) && this.chewBudget >= cost) {
        this.chewBudget -= cost;
        // Nothing ahead of them and stranded on top of something: down through it, to where the people are.
        if (this.chewAhead(i, bx, y, bz, ruin)) this.blk[i] = .02;
        else if (this.stuck[i] >= 2 && y > this.gy(bx, bz) + .5) {
          const ux = Math.floor(bx), uy = Math.floor(y - .05), uz = Math.floor(bz), id = w.get(ux, uy, uz);
          if (id && HP[id] !== 255 && this.onGnaw) this.onGnaw(ux, uy, uz, id, ruin);
        }
      }
    } else if (blocked && st === S_CHASE && atCampWall && !this.campAt(bx, bz, -7) && !w.solid(Math.floor(bx), Math.floor(y + 1), Math.floor(bz)) && this.sim && this.sim.climbAllowed(bx, bz) && this.canClimb(i, bx, y, bz, tgtY)) {
      // Packed deep enough, they go up over each other and spill across the top of the wall.
      this.blk[i] += dt;
      if (this.blk[i] > 1.5) {
        y += 1.3 * dt;
        vy[i] = 0;
        py[i] = y;
        return;
      }
    } else if (pressing && atCampWall) {
      this.blk[i] = Math.min(2, this.blk[i] + dt);   // lets a body loose inside the camp pick a new heading
      // Outside the wall, hung up on something that is not the wall: a beam, a barricade, a car. They go through it, slowly.
      if (st === S_CHASE && !this.campAt(bx, bz, 0) && this.blk[i] >= 1 && this.streetBudget >= 1 && rand() < dt * 4 * (this.wreckK ?? 1)) {
        if (this.chewAhead(i, bx, y, bz, 3, this.streetChewFn || (this.streetChewFn = (x, yy, z) => this.streetChew(x, yy, z)))) { this.streetBudget -= 1; this.blk[i] = .5; }
      }
    } else if (pressing && st === S_CHASE && !atCampWall) {
      this.blk[i] += dt;
      const need = tgtY - y, closeBy = flat2 < 100;
      if (this.blk[i] > 2.6 && need > 1.5 && closeBy && this.canClimb(i, bx, y, bz, tgtY)) {
        y += .9 * dt;
        vy[i] = 0;
        py[i] = y;
        return;
      }
      // Anywhere on the hunt, not only at arm's length: a crowd behind a door it saw you go through has the door, then the wall either
      // side of it, then whatever was holding the floor up. The more of them pushing, the harder each one tears, and bits come away round
      // the edges of the hole as well as in it.
      // Not only after you: one after somebody else, or a horde on its way to a wall, gets there too. Without anyone to go for they take
      // a little longer to start on it.
      const mine = !H && !this.ignorePlayer && flat2 < 2500;
      if (this.blk[i] > (mine || H ? 1.6 : 2.2) / (this.wreckK ?? 1) && (mine || H || this.siege[i]) && this.streetBudget >= 1) {
        this.blk[i] = .6 + rand() * .5;
        let crowd = 0;
        this.forRadius(bx, bz, 1.9, (j) => { if (j !== i && Math.abs(py[j] - y) < 2) crowd++; });
        const force = 2 + Math.min(3, crowd * .4);
        const ok = this.streetChewFn || (this.streetChewFn = (x, yy, z) => this.streetChew(x, yy, z));
        if (this.chewAhead(i, bx, y, bz, force, ok)) this.streetBudget -= 1;
        if (rand() < .1 + Math.min(.2, crowd * .03)) {
          const a = Math.atan2(sx[i], sz[i]) + (rand() - .5) * 2.2;
          const cx = Math.floor(bx + Math.sin(a) * 1.1), cz = Math.floor(bz + Math.cos(a) * 1.1), cy = Math.floor(y + .02) + Math.floor(rand() * 3);
          const id = w.get(cx, cy, cz);
          if (id && HP[id] !== 255 && ok(cx, cy, cz) && this.onGnaw) { this.streetBudget -= .5; this.onGnaw(cx, cy, cz, id, force * .8); }
        }
      }
    } else this.blk[i] = Math.max(0, this.blk[i] - dt);

    // Packed into a building after someone, or crushed up against one, they wreck it: walls, columns, stairs, whatever their hands find.
    // Nobody is there to put it back, and enough of a crowd brings the whole thing down.
    if (st !== S_IDLE && this.streetBudget >= 1 && ((i + this.frame) & 7) === 0) {
      const ix = Math.floor(bx), iz = Math.floor(bz), lot = this.L.lot;
      const inLot = lot[iz * WX + ix] || lot[Math.floor(bz + sz[i] * 1.2) * WX + Math.floor(bx + sx[i] * 1.2)];
      // In a city building, or in among the buildings of a camp they have got into.
      const inside = !inLot && this.campAt(bx, bz, -7);
      if ((inLot && !this.campAt(bx, bz, 2)) || inside) {
        let crowd = 0;
        this.forRadius(bx, bz, 1.6, (j) => { if (j !== i && Math.abs(py[j] - y) < 2) crowd++; });
        if (crowd >= 3 && rand() < (crowd - 2) * (inside ? .025 : .035 * (this.wreckK ?? 1))) {
          // Whatever is nearest in a few directions, out to a few steps: the crowd surges about, and someone is always up against something.
          search: for (let t = 0; t < 6; t++) {
            const a = rand() * 6.283, cy = Math.floor(y + .02) + Math.floor(rand() * 3), ux = Math.sin(a), uz = Math.cos(a);
            for (let r = .7; r <= 3.5; r += .5) {
              const cx = Math.floor(bx + ux * r), cz = Math.floor(bz + uz * r), id = w.get(cx, cy, cz);
              if (!id) continue;
              if (HP[id] !== 255 && (inside ? this.campInside(cx, cy, cz) : this.streetChew(cx, cy, cz)) && this.onGnaw) { this.streetBudget -= 1; this.onGnaw(cx, cy, cz, id, 2 + Math.min(3, crowd * .4)); break search; }
              break;
            }
          }
        }
      }
    }

    // Gravity
    const under = w.solid(Math.floor(bx), Math.floor(y - .05), Math.floor(bz));
    if (!under) {
      vy[i] -= 22 * dt;
      y += vy[i] * dt;
      const landed = w.solid(Math.floor(bx), Math.floor(y), Math.floor(bz));
      if (landed) {
        y = Math.floor(y) + 1;
        // A long drop breaks them, but it takes a very long drop to stop them.
        const impact = -vy[i];
        vy[i] = 0;
        if (impact > 16) {
          py[i] = y;
          this.hurtT[i] = .6;
          vx[i] = 0; vz[i] = 0;
          // How far they came down: the speed of the landing says exactly that.
          const drop = impact * impact / 44, k = Math.min(5, 1 + (drop - 5.8) / 5);
          if (this.onThud) this.onThud(bx, y, bz, impact);
          if (drop >= GIB_DROP) {
            // Nobody gets up from that, and there is not enough left to lie there.
            if (this.fx) this.fx.gib(bx, y, bz, Math.min(1.6, drop / GIB_DROP));
            this.noCorpse = true;
            this.damage(i, this.hp[i] + 1, false, bx, y, bz, false);
            this.noCorpse = false;
            return;
          }
          if (this.fx) {
            this.fx.blood(bx, y + .4, bz, 0, .6, 0, Math.round(8 * k), 3 + k);
            if (k >= 2) this.fx.gore(bx, y + .4, bz, Math.round(k));
          }
          this.damage(i, (impact - 16) * 4.5, false, bx, y, bz, false);
          if (this.hp[i] <= 0) return;
        }
      }
    } else {
      vy[i] = 0;
      const base = Math.floor(y - .05) + 1;
      if (y < base) y = Math.min(base, y + dt * 9);
      else if (y > base) y = base;
    }
    py[i] = y;
  }

  // Going up takes a wall to go up, and open air all the way to what they are after. Under a ceiling, they have to find the stairs.
  canClimb(i, x, y, z, toY) {
    const w = this.world, a = Math.atan2(this.sx[i], this.sz[i]), cx = Math.floor(x), cz = Math.floor(z);
    if (!w.solid(Math.floor(x + Math.sin(a) * .7), Math.floor(y + 1), Math.floor(z + Math.cos(a) * .7))) return false;
    const top = Math.max(Math.floor(y + 2.9), Math.min(Math.floor(toY) + 3, Math.floor(y) + 40));
    for (let k = Math.floor(y + 2.9); k <= top; k++) if (w.solid(cx, k, cz)) return false;
    return true;
  }

  updateMid(i, dt, d2, speedK) {
    const { px, py, pz, vx, vz, sx, sz, state, spd, yaw } = this;
    const w = this.world;
    let st = state[i];
    if (this.lureSteer(i)) { /* drawn to something: nothing else on its mind */ }
    else if (st === S_IDLE) {
      if (this.mig[i]) this.migSteer(i);
      else if (rand() < .03) {
        const a = rand() * 6.283;
        const go = rand() < .6;
        sx[i] = go ? Math.sin(a) : 0; sz[i] = go ? Math.cos(a) : 0;
      }
      const sight = this.player.sanctuary ? 0 : AWARE * this.player.stealth * this.settings.sight * (.7 + this.keen(i) * .7);
      if (!this.ignorePlayer && d2 < sight * sight && rand() < .12) state[i] = S_CHASE;
      else if (!this.ignorePlayer && rand() < .03) this.followCrowd(i, d2);
    } else if (st === S_CHASE) {
      if (this.siege[i]) {
        if (this.sim.state[this.siege[i] - 1].drawing) this.siegeSteer(i);
        else { this.siege[i] = 0; state[i] = S_IDLE; st = S_IDLE; }
      } else if (this.ignorePlayer) { state[i] = S_IDLE; st = S_IDLE; }
      else if (this.player.sanctuary) { if (this.joinSiege(i)) this.siegeSteer(i); }
      else if (this.cutsThrough(i) && d2 > 18 * 18 && d2 < 130 * 130) {
        // Straight at you, through whatever is in the way: in at a door or a window, across the floor, out the far side, or through the wall.
        const dx = this.player.x - px[i], dz = this.player.z - pz[i], m = Math.sqrt(d2) || 1;
        sx[i] = dx / m; sz[i] = dz / m;
      } else if (!this.flowDir(i)) {
        const dx = this.player.x - px[i], dz = this.player.z - pz[i];
        const m = Math.sqrt(d2) || 1;
        sx[i] = dx / m; sz[i] = dz / m;
      }
    } else state[i] = S_CHASE;
    const speed = this.lure[i] ? spd[i] * speedK * .75 : st === S_IDLE ? (this.mig[i] ? spd[i] * speedK * .55 : spd[i] * .44) : spd[i] * speedK;
    let tvx = sx[i] * speed, tvz = sz[i] * speed;

    // Light separation in the same hash cell only.
    const gx = Math.floor(px[i] / HC) - this.gridX, gz = Math.floor(pz[i] / HC) - this.gridZ;
    if (gx >= 0 && gz >= 0 && gx < GRID && gz < GRID) {
      let j = this.head[gx + gz * GRID], seen = 0;
      while (j !== -1 && seen < 6) {
        if (j !== i) {
          const ax = px[i] - px[j], az = pz[i] - pz[j];
          const a2 = ax * ax + az * az;
          // Fading out with distance, so a neighbour at arm's length is a nudge and not a shove that changes every update.
          if (a2 < 3) { const m = Math.sqrt(a2) + .02, k = (1.75 - m) / 1.75 * 1.4 / m; if (k > 0) { tvx += ax * k; tvz += az * k; } }
          seen++;
        }
        j = this.nextInCell[j];
      }
    }
    const blend = Math.min(1, dt * 6);
    vx[i] += (tvx - vx[i]) * blend; vz[i] += (tvz - vz[i]) * blend;
    this.snapGround(i, dt);
  }

  updateFar(i, dt, d2, speedK) {
    const { px, pz, vx, vz, sx, sz, state, spd, yaw } = this;
    let st = state[i];
    if (this.lureSteer(i)) { /* drawn to something */ }
    else if (st === S_CHASE) {
      if (this.siege[i]) {
        if (this.sim.state[this.siege[i] - 1].drawing) this.siegeSteer(i);
        else { this.siege[i] = 0; state[i] = S_IDLE; st = S_IDLE; }
      } else {
        // They hold on to a scent. Only a long way off, or behind a wall, do they give up.
        if (this.player.sanctuary) { if (this.joinSiege(i)) this.siegeSteer(i); }
        else if (d2 > (150 + this.keen(i) * 110) ** 2 && rand() < .01) { state[i] = S_IDLE; st = S_IDLE; }
        else if (this.cutsThrough(i) && d2 < 130 * 130) {
          const dx = this.player.x - px[i], dz = this.player.z - pz[i], m = Math.sqrt(d2) || 1;
          sx[i] = dx / m; sz[i] = dz / m;
        } else if (!this.flowDir(i)) {
          const dx = this.player.x - px[i], dz = this.player.z - pz[i], m = Math.sqrt(d2) || 1;
          sx[i] = dx / m; sz[i] = dz / m;
        }
      }
    } else if (st === S_ATTACK) state[i] = S_CHASE;
    if (st === S_IDLE && !this.lure[i]) {
      if (rand() < .12) this.followCrowd(i, d2);
      if (this.mig[i]) this.migSteer(i);
      else if (rand() < .1) {
        const a = rand() * 6.283;
        const go = rand() < .45;
        sx[i] = go ? Math.sin(a) : 0; sz[i] = go ? Math.cos(a) : 0;
      }
    }
    const speed = this.lure[i] ? spd[i] * speedK * .75 : st === S_IDLE ? (this.mig[i] ? spd[i] * speedK * .55 : spd[i] * .44) : spd[i] * speedK;
    let tvx = sx[i] * speed, tvz = sz[i] * speed;
    // Shoulders, even at this distance: a crowd takes up room.
    const gx = Math.floor(px[i] / HC) - this.gridX, gz = Math.floor(pz[i] / HC) - this.gridZ;
    if (st !== S_IDLE && gx >= 0 && gz >= 0 && gx < GRID && gz < GRID) {
      let j = this.head[gx + gz * GRID], seen = 0;
      while (j !== -1 && seen < 6) {
        if (j !== i) {
          const ax = px[i] - px[j], az = pz[i] - pz[j];
          const a2 = ax * ax + az * az;
          if (a2 < 3) { const m = Math.sqrt(a2) + .02, k = (1.75 - m) / 1.75 * 1.4 / m; if (k > 0) { tvx += ax * k; tvz += az * k; } }
          seen++;
        }
        j = this.nextInCell[j];
      }
    }
    vx[i] = tvx;
    vz[i] = tvz;
    // In sight, they turn a little every frame (see update); only a long way off is the turn taken all at once.
    if (d2 > TURN2 && Math.abs(sx[i]) + Math.abs(sz[i]) > .05) yaw[i] = Math.atan2(sx[i], sz[i]);
    this.snapGround(i, dt);
  }

  // The street level wherever a body stands: the lifted ground of a town, or the datum.
  gy(x, z) { return STREET_Y + Math.max(0, this.L.terr[Math.max(0, Math.min(WZ - 1, z | 0)) * WX + Math.max(0, Math.min(WX - 1, x | 0))]); }

  // Coarse ground follow; stops wanderers walking into walls or water.
  snapGround(i, dt) {
    const w = this.world;
    const x = this.px[i], z = this.pz[i], y = this.py[i];
    const ix = Math.floor(x), iz = Math.floor(z);
    if (ix < 1 || iz < 1 || ix >= WX - 1 || iz >= WZ - 1) { this.vx[i] = 0; this.vz[i] = 0; return; }
    const terrain = STREET_Y + this.L.terr[iz * WX + ix];
    if (y > terrain + 2.2) {
      // Upstairs: stay put until the player is close enough for real pathing.
      this.vx[i] = 0; this.vz[i] = 0;
      return;
    }
    const nx = Math.floor(x + this.vx[i] * dt), nz = Math.floor(z + this.vz[i] * dt);
    if (!w.walk[(ix >> 1) + (iz >> 1) * w.walkW]) {
      // Shoved in off the open street by the crowd: every way it turns is as blocked as where it stands, and turning back each time
      // only rocks it on the spot. Out the nearest way to open ground, or stand.
      const cx = ix >> 1, cz = iz >> 1;
      let ex = 0, ez = 0;
      for (let k = 0; k < 8 && !ex && !ez; k++) {
        const ox = [1, -1, 0, 0, 1, 1, -1, -1][k], oz = [0, 0, 1, -1, 1, -1, 1, -1][k];
        if (w.walk[(cx + ox) + (cz + oz) * w.walkW]) { ex = ox; ez = oz; }
      }
      if (ex || ez) {
        const m = Math.hypot(ex, ez), sp = Math.hypot(this.vx[i], this.vz[i]);
        this.sx[i] = ex / m; this.sz[i] = ez / m; this.vx[i] = this.sx[i] * sp; this.vz[i] = this.sz[i] * sp;
      } else { this.vx[i] = 0; this.vz[i] = 0; }
    } else if (!w.walk[(nx >> 1) + (nz >> 1) * w.walkW]) {
      if (this.state[i] === S_IDLE) { this.sx[i] = -this.sx[i]; this.sz[i] = -this.sz[i]; this.vx[i] *= -.25; this.vz[i] *= -.25; }
      // On the move, slide along whatever is in the way rather than bouncing off it.
      else if (w.walk[(nx >> 1) + (iz >> 1) * w.walkW]) this.vz[i] = 0;
      else if (w.walk[(ix >> 1) + (nz >> 1) * w.walkW]) this.vx[i] = 0;
      else { this.vx[i] *= -.25; this.vz[i] *= -.25; }
    }
    // Stand on what is actually there: rubble, a car, the bottom of a stair, a crater. The street map alone puts a body on a pile of rubble
    // down inside it, which is plain to see from up on a roof. Only within a few blocks of the street, where the map and the world can
    // differ, and only once the world is loaded there.
    let top = terrain;
    // From two blocks up at most, so nobody lands somewhere the 'upstairs' rule above would then freeze them.
    const fy = terrain + 1;
    if (w.isLoaded(ix, fy, iz)) {
      for (let yy = fy; yy >= terrain - 4; yy--) {
        if (w.solid(ix, yy, iz)) { if (!w.solid(ix, yy + 1, iz) && !w.solid(ix, yy + 2, iz)) top = yy + 1; break; }
      }
    }
    this.py[i] = top;
  }

  // --- Combat -------------------------------------------------------------------------------------
  // Ordered ray hit test through the spatial hash.
  // What a shot hits, nearest first. Tested against the body as it is drawn, not a post at its feet: the actor shader leans the dead
  // forward (more when they are coming at you), so the head can be well out in front of where they stand. Each one is a capsule from the
  // ankles to the neck along that lean, and a ball for the head, and the whole line of the shot is tested, not points every so often
  // along it, so nothing slips through between them.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, pierce, out) {
    out.length = 0;
    this.rayId++;
    const { px, py, pz, head, nextInCell: next, hp, stamp, yaw, phase, state, variant } = this;
    const gx = this.gridX, gz = this.gridZ;
    const hits = this.rayHits || (this.rayHits = []);
    hits.length = 0;
    // Cells within reach of the line: a body leans out up to most of a block from where it stands.
    const M = 1.4;
    for (let t = 0; t < maxDist + 1; t += 1) {
      const x = ox + dx * t, z = oz + dz * t;
      const c0x = Math.floor((x - M) / HC) - gx, c1x = Math.floor((x + M) / HC) - gx;
      const c0z = Math.floor((z - M) / HC) - gz, c1z = Math.floor((z + M) / HC) - gz;
      for (let cz = Math.max(0, c0z); cz <= Math.min(GRID - 1, c1z); cz++) for (let cx = Math.max(0, c0x); cx <= Math.min(GRID - 1, c1x); cx++) {
        let j = head[cx + cz * GRID];
        while (j !== -1) {
          if (stamp[j] !== this.rayId && hp[j] > 0) {
            stamp[j] = this.rayId;
            const h = this.shotHits(j, ox, oy, oz, dx, dy, dz, maxDist);
            if (h) hits.push(h);
          }
          j = next[j];
        }
      }
    }
    hits.sort((p, q) => p.t - q.t);
    for (let k = 0; k < hits.length && out.length < pierce; k++) out.push(hits[k]);
    return out;
  }

  // One body against one shot: the head first (a ball where the shader puts it), then the trunk and legs (a capsule along the lean).
  shotHits(j, ox, oy, oz, dx, dy, dz, maxDist) {
    const seed = this.variant[j] * .37, st = this.vy[j] < -5 ? FALLING : this.state[j];
    // The same lean and sway as ACTOR_VS: forward by lean (rotX), a little to the side by the shamble.
    const lean = st === FALLING ? ((seed % 2) > 1 ? .42 : -.3) : .1 + Math.sin(seed * 2.3) * .09 + (st >= 1 ? .1 : 0);
    const roll = st === FALLING ? 0 : Math.sin(this.phase[j] * .5 + seed) * .05;
    const sy = Math.sin(this.yaw[j]), cy = Math.cos(this.yaw[j]);
    const sl = Math.sin(lean), cl = Math.cos(lean), sr = Math.sin(roll);
    // Unit vector up the body in the world: model up (0,1,0) through rotZ(roll) then rotX(lean), then turned to face yaw.
    const mx = -sr, my = cl * Math.cos(roll), mz = sl * Math.cos(roll);
    const ux = mx * cy + mz * sy, uy = my, uz = -mx * sy + mz * cy;
    const bob = Math.abs(Math.sin(this.phase[j])) * .05;
    const fx = this.px[j], fy = this.py[j] + bob, fz = this.pz[j];
    // Head: centred about 2.45 up the body.
    let headT = -1;
    {
      const hx = fx + ux * 2.45, hy = fy + uy * 2.45, hz = fz + uz * 2.45, r = .37;
      const wx = ox - hx, wy = oy - hy, wz = oz - hz;
      const b = wx * dx + wy * dy + wz * dz, c = wx * wx + wy * wy + wz * wz - r * r, disc = b * b - c;
      if (disc >= 0) {
        const t = -b - Math.sqrt(disc);
        if (t > .3 && t < maxDist) headT = t;
      }
    }
    const headHit = () => ({ i: j, t: headT, head: true, x: ox + dx * headT, y: oy + dy * headT, z: oz + dz * headT });
    // Trunk and legs: the closest the shot comes to the line from the ankles (.15) to the neck (2.08), within the body's half-width.
    const ax = fx + ux * .15, ay = fy + uy * .15, az = fz + uz * .15, L = 1.93, R = .46;
    const wx = ox - ax, wy = oy - ay, wz = oz - az;
    const b = dx * ux + dy * uy + dz * uz, d = dx * wx + dy * wy + dz * wz, e = ux * wx + uy * wy + uz * wz;
    const den = 1 - b * b;
    let s = den > 1e-6 ? (e - b * d) / den : e;
    s = Math.max(0, Math.min(L, s));
    let t = (ax + ux * s - ox) * dx + (ay + uy * s - oy) * dy + (az + uz * s - oz) * dz;
    t = Math.max(.3, Math.min(maxDist, t));
    s = Math.max(0, Math.min(L, (ox + dx * t - ax) * ux + (oy + dy * t - ay) * uy + (oz + dz * t - az) * uz));
    const qx = ox + dx * t - (ax + ux * s), qy = oy + dy * t - (ay + uy * s), qz = oz + dz * t - (az + uz * s);
    const dist2 = qx * qx + qy * qy + qz * qz;
    if (dist2 >= R * R) return headT > 0 ? headHit() : null;
    // Where it goes in: back along the shot from the closest point to the surface.
    const tin = Math.max(.3, t - Math.sqrt(R * R - dist2));
    if (tin >= maxDist) return headT > 0 ? headHit() : null;
    // Through the body and the head both: whichever it reaches first, and the head if it is a near thing.
    if (headT > 0 && headT <= tin + .15) return headHit();
    return { i: j, t: tin, head: false, x: ox + dx * tin, y: oy + dy * tin, z: oz + dz * tin };
  }

  forRadius(x, z, r, fn) {
    const { head, nextInCell: next, hp } = this;
    const c0x = Math.floor((x - r) / HC) - this.gridX, c1x = Math.floor((x + r) / HC) - this.gridX;
    const c0z = Math.floor((z - r) / HC) - this.gridZ, c1z = Math.floor((z + r) / HC) - this.gridZ;
    for (let cz = Math.max(0, c0z); cz <= Math.min(GRID - 1, c1z); cz++) for (let cx = Math.max(0, c0x); cx <= Math.min(GRID - 1, c1x); cx++) {
      let j = head[cx + cz * GRID];
      while (j !== -1) {
        const n = next[j];
        if (hp[j] > 0) fn(j);
        j = n;
      }
    }
  }

  damage(i, amount, headshot, ix, iy, iz, byPlayer = true) {
    if (this.hp[i] <= 0) return false;
    // On its way to pull something down, it gets there. Nobody else in this fight has eyes for it. You can still stop it yourself.
    if (this.lure[i] && !byPlayer && amount < 500 && this.lures[this.lure[i]]) return false;
    this.hp[i] -= amount;
    this.hurtT[i] = .2;
    if (this.state[i] === S_IDLE) this.state[i] = S_CHASE;
    if (this.hp[i] <= 0) {
      if (!this.noCorpse) this.addCorpse(i, headshot);
      const cell = (this.px[i] >> 6) + (this.pz[i] >> 6) * this.popW;
      if (cell >= 0 && cell < this.killHeat.length) this.killHeat[cell] += 1;
      if (this.onKilled) this.onKilled(i, this.px[i], this.py[i], this.pz[i], headshot, byPlayer);
      return true;
    }
    return false;
  }

  // Throws one of the dead: alive, it is knocked off its feet and goes where it was thrown; killed by it, the body goes up and tumbles
  // and is laid down wherever it comes to rest.
  // Set up before the damage is dealt, so that a body it kills takes the throw with it.
  prepareThrow(i, ox, oz, power) {
    const dx = this.px[i] - ox, dz = this.pz[i] - oz, d = Math.hypot(dx, dz) || .001;
    const out = power * (.75 + Math.random() * .5), up = power * (.5 + Math.random() * .45);
    this.pendingThrow = { vx: dx / d * out, vy: Math.min(16, up * 1.1), vz: dz / d * out };
  }

  // After the damage: if it lived, it is knocked off its feet instead.
  finishThrow(i) {
    const t = this.pendingThrow;
    this.pendingThrow = null;
    if (!t || this.hp[i] <= 0) return;
    this.vx[i] = t.vx; this.vz[i] = t.vz; this.vy[i] = Math.min(13, t.vy);
    this.py[i] += .15;
    this.knockT[i] = .5 + Math.hypot(t.vx, t.vz) * .05;
  }

  updateFlying(dt) {
    const F = this.flying, w = this.world;
    for (let k = F.length - 1; k >= 0; k--) {
      const f = F[k];
      f.t += dt;
      f.vy -= 22 * dt;
      const nx = f.x + f.vx * dt, ny = f.y + f.vy * dt, nz = f.z + f.vz * dt;
      // Into a wall: it stops there and drops.
      if (w.solid(Math.floor(nx), Math.floor(f.y + .6), Math.floor(nz))) { f.vx *= -.15; f.vz *= -.15; }
      else { f.x = nx; f.z = nz; }
      f.y = ny;
      f.spin += f.spinV * dt;
      if ((f.vy < 0 && w.solid(Math.floor(f.x), Math.floor(f.y), Math.floor(f.z))) || f.t > 4) {
        f.y = Math.floor(f.y) + 1;
        if (this.fx && Math.abs(f.vy) > 6) this.fx.blood(f.x, f.y + .3, f.z, 0, .5, 0, 5, 3);
        if (this.onThud) this.onThud(f.x, f.y, f.z, Math.abs(f.vy));
        this.addBody(f.x, f.y, f.z, f.yaw + f.spin, f.variant, f.headless, f.phase);
        F.splice(k, 1);
      }
    }
  }

  addCorpse(i, headless) {
    let yaw = this.yaw[i];
    // Knocked down by a blow: whichever way this body falls, it goes the way it was hit.
    if (this.blowX || this.blowZ) {
      const fall = ((this.variant[i] * .37) % 2) > 1 ? -1 : 1;
      yaw = Math.atan2(this.blowX * fall, this.blowZ * fall);
    }
    const t = this.pendingThrow;
    if (t && this.flying.length < 120) {
      this.pendingThrow = null;
      this.flying.push({ x: this.px[i], y: this.py[i] + .3, z: this.pz[i], vx: t.vx, vy: t.vy, vz: t.vz, yaw, spin: 0, spinV: (Math.random() - .5) * 9, variant: this.variant[i], headless, phase: this.phase[i], t: 0 });
      return;
    }
    this.pendingThrow = null;
    this.addBody(this.px[i], this.py[i], this.pz[i], yaw, this.variant[i], headless, this.phase[i]);
  }

  addBody(x, y, z, yaw, variant, headless = false, phase = 0, kid = false) {
    // Lay the body on open ground, falling the way there is room, so it cannot end up inside a wall or a car.
    const w = this.world, fy = Math.floor(y + .02);
    if (w.solid(Math.floor(x), fy, Math.floor(z)) || w.solid(Math.floor(x), fy + 1, Math.floor(z))) {
      search: for (let r = 1; r <= 3; r++) for (let a = 0; a < 8; a++) {
        const nx = x + Math.cos(a * .785) * r, nz = z + Math.sin(a * .785) * r;
        if (!w.solid(Math.floor(nx), fy, Math.floor(nz)) && !w.solid(Math.floor(nx), fy + 1, Math.floor(nz))) { x = nx; z = nz; break search; }
      }
    }
    const fall = ((variant * .37) % 2) > 1 ? -1 : 1;
    for (let t = 0; t < 4; t++) {
      const a = yaw + t * 1.5708;
      const fx = Math.sin(a) * fall, fz = Math.cos(a) * fall;
      if (!w.solid(Math.floor(x + fx * 2.4), fy, Math.floor(z + fz * 2.4)) && !w.solid(Math.floor(x + fx * 1.2), fy, Math.floor(z + fz * 1.2))) { yaw = a; break; }
    }
    const k = this.corpseHead * 8;
    const c = this.corpses;
    c[k] = x; c[k + 1] = y; c[k + 2] = z; c[k + 3] = yaw;
    c[k + 4] = 0; c[k + 5] = variant; c[k + 6] = (headless ? 1 : 0) + (kid ? 32 : 0); c[k + 7] = phase;
    this.corpseHead = (this.corpseHead + 1) % this.corpseCap;
    this.corpseCount = Math.min(this.corpseCap, this.corpseCount + 1);
  }

  updateCorpses(dt) {
    const c = this.corpses, w = this.world, cap = this.corpseCount;
    for (let k = 0; k < cap; k++) c[k * 8 + 4] += dt;
    this.updateFlying(dt);
    // A body stays where it lies only while there is something under it. A few are checked every frame, so all of them get looked at
    // about twice a second. Killed halfway up a wall, or lying on something that has since been torn down, and it falls.
    const fall = this.corpseFall || (this.corpseFall = new Map());
    for (let n = Math.ceil(cap / 30), k = this.corpseScan || 0; n > 0 && cap > 0; n--, k = (k + 1) % cap) {
      this.corpseScan = (k + 1) % cap;
      const o = k * 8, x = Math.floor(c[o]), z = Math.floor(c[o + 2]), y = c[o + 1];
      if (fall.has(k) || c[o + 4] > 130 || !w.isLoaded(x, Math.floor(y), z)) continue;
      // Something solid where it lies: a gate swung shut across it, or something built over it. It gets shoved out sideways to the nearest
      // open ground at the same level. Only with nowhere at all to go does it end up on top.
      const fy = Math.floor(y + .1);
      if (w.solid(x, fy, z)) {
        let moved = false;
        search: for (let r = 1; r <= 3; r++) for (let a = 0; a < 8; a++) {
          const nx = c[o] + Math.cos(a * .785) * r, nz = c[o + 2] + Math.sin(a * .785) * r;
          if (!w.solid(Math.floor(nx), fy, Math.floor(nz)) && !w.solid(Math.floor(nx), fy + 1, Math.floor(nz)) && w.solid(Math.floor(nx), fy - 1, Math.floor(nz))) {
            c[o] = nx; c[o + 2] = nz; moved = true; break search;
          }
        }
        if (!moved) c[o + 1] = fy + 1;
        continue;
      }
      if (!w.solid(x, Math.floor(y - .05), z)) fall.set(k, 0);
    }
    for (const [k, v0] of fall) {
      const o = k * 8, x = Math.floor(c[o]), z = Math.floor(c[o + 2]), v = v0 + 22 * dt;
      const y = c[o + 1] - v * dt, cell = Math.floor(y);
      if (w.solid(x, cell, z) || y <= 0) {
        c[o + 1] = Math.max(0, cell + 1);
        fall.delete(k);
      } else {
        c[o + 1] = y;
        fall.set(k, v);
      }
    }
  }

  // --- Rendering -----------------------------------------------------------------------------------
  fillInstances(cam, fwd, aspect, fov) {
    const { px, py, pz, yaw, phase, state, variant, hp } = this;
    const A = this.actors;
    const cx = cam[0], cz = cam[2];
    const fx = fwd[0], fz = fwd[2];
    const fl = Math.hypot(fx, fz) || 1;
    const nx = fx / fl, nz = fz / fl;
    // Horizontal cone test: generous to allow for pitch.
    const cone = Math.tan(fov * .5) * aspect * (1 + Math.abs(fwd[1]) * 1.5) + .2;
    // The dead get rained on like anyone else: soaked out in the open, dry under a roof. Nobody is tracked one by one; the weather does for all of them.
    const w = this.weather, map = this.rainMap;
    const wetBits = w ? Math.min(7, Math.round(Math.min(1, Math.max(w.rain, w.wet * .5)) * 8)) * 4096 : 0;
    let vis = 0;
    const n = this.n;
    for (let i = 0; i < n; i++) {
      if (hp[i] <= 0) continue;
      const dx = px[i] - cx, dz = pz[i] - cz;
      const along = dx * nx + dz * nz;
      if (along < -4) continue;
      const side = Math.abs(dx * nz - dz * nx);
      if (side > along * cone + 5) continue;
      const d2 = dx * dx + dz * dz;
      const lod = d2 < 28 * 28 ? 0 : d2 < 90 * 90 ? 1 : 2;
      let wet = wetBits;
      if (wet && map) { const top = map.at(px[i], pz[i]); if (top >= 0 && top >= py[i] + 2.2) wet = 0; }
      let ox = 0, oz = 0, oy = yaw[i];
      if (this.flinch[i] > 0) {
        // A blow that did not drop them: the body snaps back from it and the head and shoulders wrench round, then it comes on again.
        const k = this.flinch[i] / FLINCH, s = Math.sin(Math.min(1, (1 - k) * 3.2) * Math.PI * .5) * k;
        ox = this.flx[i] * .32 * s; oz = this.flz[i] * .32 * s;
        oy += (i & 1 ? .75 : -.75) * s;
      }
      A.push(lod, px[i] + ox, py[i], pz[i] + oz, oy, phase[i], this.vy[i] < -5 ? FALLING : state[i], variant[i], wet);
      vis++;
    }
    const c = this.corpses;
    for (let k = 0; k < this.corpseCount; k++) {
      const o = k * 8;
      const t = c[o + 4];
      if (t > 130) continue;
      const dx = c[o] - cx, dz = c[o + 2] - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > 150 * 150) continue;
      const along = dx * nx + dz * nz;
      if (along < -6) continue;
      A.push(d2 < 28 * 28 ? 0 : 1, c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 7], 10 + t, c[o + 5], c[o + 6]);
    }
    for (const f of this.flying) {
      const dx = f.x - cx, dz = f.z - cz;
      if (dx * dx + dz * dz > 150 * 150) continue;
      // Tumbling: part way to lying down, turning as it goes.
      A.push(dx * dx + dz * dz < 28 * 28 ? 0 : 1, f.x, f.y, f.z, f.yaw + f.spin, f.phase, 10.25 + .2 * Math.abs(Math.sin(f.spin)), f.variant, f.headless ? 1 : 0);
    }
    this.visibleCount = vis;
  }

  exportState() {
    // The active bubble is taken out of the grid while live, so bank it back into the copy.
    const pop = Float32Array.from(this.pop);
    for (let i = 0; i < this.n; i++) {
      // Anyone attacking a camp is saved with that battle, not with the city.
      if (this.siege[i] && this.sim && this.sim.state[this.siege[i] - 1].status === 'holding') continue;
      const cell = (this.px[i] >> 6) + (this.pz[i] >> 6) * this.popW;
      if (this.hp[i] > 0 && cell >= 0 && cell < pop.length) pop[cell] += 1;
    }
    return { pop };
  }

  importState(s) {
    if (s && s.pop && s.pop.length === this.pop.length) this.pop.set(s.pop);
  }
}
