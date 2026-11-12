// The camps as living things. Hordes move on them whether or not you are watching. Walls wear down
// under pressure and get breached, guards die and ammunition runs out, and a camp that loses enough
// people falls. When you are close the battle is fought with real bodies; otherwise it is resolved in numbers.
import { STREET_Y, WX, WZ } from '../shared/constants.js';
import { HP, M } from '../shared/materials.js';
import { alarmPostCells, flagCells } from '../shared/camps.js';
import { LORE } from './camplore.js';
import { CAMP_START } from './items.js';
import { refugeCandidates, sideOf } from './director.js';

const rand = Math.random;
const M_ALUM = M.ALUM;
const FLAG_DOOM = .55;      // the chance any one flag comes down when its camp falls
// An operation runs from the first warning until the camp has gone this long, in days, without a big attack or an open wound.
const OP_CALM = .55;
// How bad an operation has to get before the gates are shut on it, and how long anyone outside has to get in first.
export const GATE_LOCK_MAG = 6;
export const GATE_LOCK_WARN = 20;
const pickFrom = (a) => a[Math.floor(Math.random() * a.length)];
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
// How long before a big attack, in days, the scouts have seen enough for the town hall to post it. The operation itself opens at the warning, a bit later.
export const OUTBREAK_DAYS = 40;   // how long it had been going on the day you woke up
export const OP_NOTICE = 1.25;   // scouts and travellers see a big push coming a day or more out
export const OP_EMERGENCY = 1 / 24;   // the least notice anyone gets of an operation, even when the wall has already gone
export const OP_GAP = 2;     // days of peace a camp is owed between one operation and the next
// One word each, and enough of them that a whole run through the fall of every camp should not need the same one twice.
const OP_WORDS = ['Lantern', 'Harbor', 'Anvil', 'Bridge', 'Sparrow', 'Hammer', 'Ledger', 'Bell', 'Ferry', 'Subway', 'Tenement', 'Orchard', 'Steeple', 'Compass', 'Furnace', 'Trellis', 'Causeway', 'Gull', 'Ember', 'Watchman', 'Turnstile', 'Hydrant', 'Skyline', 'Pigeon', 'Rampart', 'Viaduct', 'Foundry', 'Mason', 'Crossing', 'Mercy',
  'Copper', 'Winter', 'Ashfall', 'Hollow', 'Bastion', 'Crowbar', 'Kettle', 'Rooftop', 'Sandbag', 'Tinderbox', 'Boxcar', 'Ironside', 'Gaslight', 'Stairwell', 'Lockstep', 'Blackout', 'Whistle', 'Halyard', 'Rivet', 'Girder', 'Trestle', 'Cinder', 'Marrow', 'Bulwark', 'Palisade', 'Hearth', 'Longshot', 'Backstop', 'Crosscut', 'Overpass',
  'Thimble', 'Sextant', 'Gantry', 'Fireline', 'Nightfall', 'Daybreak', 'Holdfast', 'Tollgate', 'Sentry', 'Barricade', 'Tarpaulin', 'Boilermaker', 'Foghorn', 'Lamplight', 'Keystone', 'Cornerstone', 'Grindstone', 'Flagstone', 'Headlong', 'Stonewall', 'Breakwater', 'Floodgate', 'Drawbridge', 'Pawnshop', 'Fishmonger', 'Tinsmith', 'Cobbler', 'Ragman', 'Chimney', 'Coalbin',
  'Dumbwaiter', 'Fuselage', 'Harrow', 'Pitchfork', 'Plumbline', 'Ratchet', 'Sawhorse', 'Scaffold', 'Shoebox', 'Slingshot', 'Spillway', 'Switchback', 'Tailgate', 'Thornbush', 'Tightrope', 'Trapdoor', 'Tripwire', 'Woodpile', 'Wrecker', 'Yardarm'];
const COLLAPSE_TIME = 10;   // seconds of the crowd bringing the wall down before anyone calls it
const REAL_RANGE = 190;
// How well each wall type stands up to being leaned on.
const WALL_MUL = { cabs: 1, containers: 1.5, palisade: .7, hesco: 1.3, sheet: 1, scrap: .6, white: 1, brick: 1.6, stone: 2.6 };
const SEG_HP = 950;       // zombie-seconds of pressure on one 8-voxel stretch of wall (lower now the dead are slower to arrive)
const BREACH_W = 4, BREACH_H = 5;
const HAND_REPAIR = 7;     // seconds of work for one person to shut a hole
// How much a camp can put behind its guns, and how quickly it makes good what it lost.
const MIGHT = { Poor: .55, Middling: .95, Strong: 2.6, Wealthy: 2.8 };
const RECOVERY = { Poor: .4, Middling: .8, Strong: 1.8, Wealthy: 1.9 };
const SIEGE_BODIES = 1800;  // however big the wave is, this many at the wall at once and the rest still on the way

export class CampSim {
  constructor(game) {
    this.g = game;
    this.reset();
  }

  fresh(c) {
    return {
      status: 'holding', guards: c.guards.length, folk: c.folk, ammo: 100, wall: 100, pool: 0, dir: 0, inside: 0, tally: 0,
      segs: {}, breaches: [], openGates: 0, drawing: false, quiet: 0, climbing: false, infest: 0, clearT: 0, resettle: 0, wallDebt: 0, real: false, abstractT: 0, wave: 0, peak: 0,
      major: false, fatal: false, fatalT: 0, harm: 0, harmLeft: 0, waveStart: 0, evac: false, evacT: 0, raid: null, flareT: 0, cascadeT: 0, cascadeSize: 0,
    };
  }

  reset() {
    this.state = this.g.layout.camps.map((c) => this.fresh(c));
    this.opNames = [];
    this.lastCamp = -1;       // the last camp you were inside, which is the one the status line keeps talking about
    this.elapsed = 0;
    this.flares = [];
    this.lastReport = null;
    this.news = [];         // everything you might have missed, for the page in the inventory
    this.dead = {};         // named characters who did not make it
    this.refugees = [];     // named survivors of a fallen camp, sheltering elsewhere
    this.hot = false;
  }

  // Every week more of the island has heard about the people behind the walls.
  pressure() { return Math.min(4.5, 1 + (this.g.day - 1) * .12); }

  might(c) { return MIGHT[CAMP_START[c.key].tier] || 1; }

  // 0 on the first day, 1 by the tenth. The city has not properly noticed these people yet.
  ramp() { return Math.max(0, Math.min(1, (this.g.day - 1) / 9)); }

  isRuined(id) { return this.state[id].status === 'overrun'; }
  isUnderAttack(id) { const s = this.state[id]; return s.pool > 0 || s.inside > 0 || s.breaches.length > 0; }
  hasOpening(id) { const s = this.state[id]; return s.breaches.length > 0 || s.openGates > 0 || s.wallDebt > 0 || !!(s.holes && s.holes.some((h) => h.open)); }

  // You put a hole in their wall. Until the crew closes it, it is a way in for the dead the same as one they made themselves.
  playerHole(x, y, z, id) {
    const g = this.g, c = g.horde.inCamp(x + .5, z + .5, 1);
    if (!c || y < STREET_Y) return;
    const s = this.state[c.id];
    if (s.status !== 'holding' || s.evac || s.collapseT > 0) return;
    const d = Math.max(c.x0 - x, x - c.x1, c.z0 - z, z - c.z1);
    if (d < -1 || d > 0) return;     // the two rows of the wall itself
    const side = x <= c.x0 + 1 ? 'W' : x >= c.x1 - 1 ? 'E' : z <= c.z0 + 1 ? 'N' : 'S';
    const t = side === 'N' || side === 'S' ? x : z;
    if (c.gates.some((q) => q.side === side && Math.abs(q.tc - t) <= 6)) return;
    const holes = s.holes || (s.holes = []);
    let h = holes.find((q) => q.side === side && t >= q.lo - 3 && t <= q.hi + 3);
    if (!h) { h = { side, lo: t, hi: t, x: x + .5, z: z + .5, cells: [], prog: 0, open: false }; holes.push(h); }
    h.cells.push(x, y, z, id);
    h.lo = Math.min(h.lo, t); h.hi = Math.max(h.hi, t);
    h.prog = 0;   // fresh damage puts the crew back to the start
    h.open = this.holeOpen(c, h);
    g.horde.nearDirty = true;
  }

  // Big enough for a body: both rows of the wall gone, three high, somewhere along it.
  holeOpen(c, h) {
    const W = this.g.world, horiz = h.side === 'N' || h.side === 'S';
    const fixed = h.side === 'N' ? c.z0 : h.side === 'S' ? c.z1 : h.side === 'W' ? c.x0 : c.x1, inward = h.side === 'N' || h.side === 'W' ? 1 : -1;
    for (let t = h.lo; t <= h.hi; t++) {
      let clear = true;
      for (let row = 0; row < 2 && clear; row++) for (let y = STREET_Y; y < STREET_Y + 2; y++) {
        const x = horiz ? t : fixed + inward * row, z = horiz ? fixed + inward * row : t;
        if (W.solid(x, y, z)) { clear = false; break; }
      }
      if (clear) return true;
    }
    return false;
  }

  // The crew closes your hole the way they close any other: when nothing is coming through it, a little at a time, and anything still
  // standing in it when the boards go up does not walk out again.
  mendHoles(c, s, step) {
    const holes = s.holes;
    if (!holes || !holes.length) return;
    const g = this.g, H = g.horde, W = g.world, P = g.player;
    for (let i = holes.length - 1; i >= 0; i--) {
      const h = holes[i];
      h.open = this.holeOpen(c, h);
      let near = 0;
      H.forRadius(h.x, h.z, 9, () => { near++; });
      // Slower with a fight on, and slower again when they are worn out.
      h.prog += step * (!near ? 1 : near <= 4 ? .5 : 0) * (s.drawing ? .6 : 1) * (1 - .4 * (s.wear || 0));
      if ((h.crewT = (h.crewT || 0) - step) <= 0) { h.crewT = 7; g.npcs.sendRepairCrew(c, h.x, h.z); }
      if (h.prog < 9 + h.cells.length * .12) continue;
      if (Math.abs(P.x - h.x) < 4 && Math.abs(P.z - h.z) < 4 && Math.abs(P.y - STREET_Y) < 4) continue;   // not while you stand in it
      H.forRadius(h.x, h.z, 3 + (h.hi - h.lo) / 2, (q) => {
        const qx = Math.floor(H.px[q]), qz = Math.floor(H.pz[q]), d = Math.max(c.x0 - qx, qx - c.x1, c.z0 - qz, qz - c.z1);
        if (d >= -1 && d <= 0) H.damage(q, 999, false, H.px[q], H.py[q], H.pz[q], false);
      });
      for (let k = 0; k < h.cells.length; k += 4) if (!W.get(h.cells[k], h.cells[k + 1], h.cells[k + 2])) W.set(h.cells[k], h.cells[k + 1], h.cells[k + 2], h.cells[k + 3]);
      holes.splice(i, 1);
      H.nearDirty = true;
      if (Math.hypot(P.x - h.x, P.z - h.z) < 60) g.ui.toast(`${c.name} has boarded up the hole in its wall.`);
    }
  }

  // Is the crowd at this point deep enough to climb its own dead over the wall?
  climbAllowed(x, z) {
    const H = this.g.horde;
    if (!H.campAt(x, z, 10)) return false;
    const c = H.inCamp(x, z, 10);
    return !!c && this.state[c.id].climbing;
  }

  // --- Time ------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, P = g.player, camps = g.layout.camps;
    this.elapsed += dt;
    let hot = false;
    for (const c of camps) {
      const s = this.state[c.id];
      const dist = Math.hypot(c.cx - P.x, c.cz - P.z);
      s.real = dist < REAL_RANGE && g.npcs.camps[c.id].active;
      if (s.status === 'overrun') { this.updateRuin(c, s, dt); this.wreck(c, s, dt); hot = hot || s.real; continue; }
      if (s.status === 'resettling') {
        s.resettle -= dt;
        if (s.resettle <= 0) this.resettled(c, s);
        continue;
      }
      if (s.pool > 0) {
        if (s.real) this.feedWave(c, s);
        else this.abstractBattle(c, s, dt);
      }
      if (s.real && s.wallDebt > 0) this.applyWallDebt(c, s);
      if (s.real && s.resumeInside > 0) {
        const n = Math.min(s.resumeInside, 260);
        s.resumeInside -= n;
        s.pool += n;   // floodIn takes them back off as it places them; any it cannot place come round from outside
        this.floodIn(c, s, n);
      }
      if (s.collapseT > 0) {
        s.fullT = 12;
        if (!g.npcs.camps[c.id].active) s.collapseT = .001;
        else this.tearWall(c, s, dt, 10);
        if ((s.collapseT -= dt) <= 0) { s.collapseT = 0; this.evacuate(c, s); }
      } else if (s.evac && s.real) this.tearWall(c, s, dt, 2.5);
      if (s.fatal || s.evac) this.lastStand(c, s, dt);
      this.wreck(c, s, dt);
      if (s.status !== 'holding') continue;
      if (s.real && s.drawing && !s.evac && !(s.collapseT > 0)) this.judgeBattle(c, s, dt);
      else if (s.doomT > 0 && !s.drawing) s.doomT = 0;
      if (s.status !== 'holding') continue;
      if (s.raid) this.updateRaid(c, s, dt);
      if (s.real && s.rec) s.rec.present = true;
      // A camp stands down when nothing has been at the wall for a while.
      if (s.drawing) {
        // It is not over while anyone is still on their way.
        // It is not over until the last of them is down and the last hole is shut. However many holes it took, this is one battle.
        const patching = s.real && s.breaches.length > 0 && s.guards + s.folk >= 30;
        // Once the wave has run out, the stragglers do not count for long. There are always a few trying the wall, especially with you behind it,
        // and they could otherwise hold a battle open for days and run it into the next one.
        s.drainT = s.pool > 0 || s.breaches.length || s.inside > 3 ? 0 : (s.drainT || 0) + dt;
        const crowd = s.real && (s.inside > 3 || s.atWall > 60 || ((s.atWall > 20 || s.peak > 6) && s.drainT < 90));
        s.quiet = (s.pool > 0 || s.fatal || s.raid || patching || crowd) ? 0 : s.quiet + dt;
        if (s.quiet > 12) this.endSiege(c, s, true);
      }
      if (s.real && (s.drawing || s.inside > 0)) hot = true;
    }
    this.hot = hot;
    // Enough of a hole, or enough of them through it, and somebody leans on the siren.
    // The siren means they are in, or about to be: a hole in the wall, a crowd through a gate, or everybody out. If two camps have it going, you hear the nearer one.
    let alarm = null, alarmD = 1e9;
    for (const c of camps) {
      const s = this.state[c.id];
      if (s.status !== 'holding' || !g.npcs.camps[c.id].active) continue;
      // No post, no siren.
      if (s.postBroken) { s.fullT = 0; s.slowT = 0; continue; }
      // The full siren: three holes or a real crowd inside. However briefly that is true, it always gets through at least one
      // whole rise and fall, and a crowd hovering around the line does not keep flipping it on and off.
      if (s.breaches.length >= 3 || s.inside >= 150) s.fullT = 12;
      else if (s.fullT > 0) s.fullT -= dt;
      // The slow one gets to finish its wail too.
      if (s.breaches.length || s.inside >= 30 || s.evac) s.slowT = 7;
      else if (s.slowT > 0) s.slowT -= dt;
      if (!(s.fullT > 0) && !(s.slowT > 0) && !s.evac) continue;
      const d = Math.max(0, c.x0 - P.x, P.x - c.x1, c.z0 - P.z, P.z - c.z1);
      if (d < alarmD) { alarmD = d; alarm = c; }
    }
    this.alarm = alarm;
    this.alarmD = alarmD;
    // 0: the slow one, a long wail every so often. 1: the full siren, from three holes up or a real crowd inside. 2: everybody out.
    this.alarmLevel = alarm ? (this.state[alarm.id].evac ? 2 : this.state[alarm.id].fullT > 0 ? 1 : 0) : 0;
    this.updateCascades(dt);
    this.updateFlares(dt);
  }

  newDay() {
    for (const c of this.g.layout.camps) {
      const s = this.state[c.id];
      if (s.status !== 'holding' || s.pool > 0) continue;
      const k = RECOVERY[CAMP_START[c.key].tier] || 1;
      // A quiet day does a lot. The wounded get back on their feet, the wall gets patched, stragglers come in.
      // There is a limit to how far a camp can climb back by now, and it comes down as the weeks go by.
      const D = this.g.director, room = Math.min(1, D.curve(c, this.g.day + this.g.tod) + .22), gain = (.5 + .6 * k) * (1 - (s.wear || 0) * (s.op ? .8 : .35));
      s.ammo = Math.min(Math.max(s.ammo, 100 * Math.min(1, room + .25)), s.ammo + 26 * gain);
      s.wall = Math.min(Math.max(s.wall, 100 * Math.min(1, room + .3)), s.wall + 24 * gain);
      s.guards = Math.min(Math.max(s.guards, c.guards.length * room), s.guards + c.guards.length * .12 * gain);
      s.folk = Math.min(Math.max(s.folk, c.folk * room), s.folk + c.folk * .05 * gain);
    }
    this.g.director.newDay();
    for (const c of this.g.layout.camps) if (this.state[c.id].status === 'holding') this.g.npcs.replaceVendors(c);
  }

  // Time goes by while you sleep. Returns how long you got before the siren, if it came for your own wall.
  pass(seconds, ownId, deep = false) {
    const camps = this.g.layout.camps, STEP = 5;
    const D = this.g.director, start = this.g.day + this.g.tod;
    this.passClock = start;
    this.passing = true;
    this.passOwn = ownId;
    let t = 0;
    this.wakeReason = null;
    this.passReports = [];
    // Out cold, the fight at your own wall comes down to the numbers like any other.
    if (deep && ownId >= 0) this.state[ownId].real = false;
    for (; t < seconds; t += STEP) {
      this.elapsed += STEP;
      this.passClock = start + t / 1500;
      D.step(this.passClock, STEP);
      for (const c of camps) {
        const s = this.state[c.id];
        if (s.status !== 'holding') continue;
        if (s.pool > 0) this.abstractBattle(c, s, STEP);
        if (s.fatal || s.evac) this.lastStand(c, s, STEP);
        if (s.status === 'holding' && s.raid) this.updateRaid(c, s, STEP);
      }
      this.updateCascades(STEP);
      // Crowds at the wall are what the guards are for, and you sleep through them. It takes a hole in the wall to get you up.
      if (ownId >= 0) {
        const own = this.state[ownId], c = camps[ownId];
        const wake = (why) => { this.wakeReason = why; t += STEP; };
        if (own.status !== 'holding' || own.evac) { wake(deep ? 'extreme' : 'breach'); break; }
        if (!deep && own.breaches.length) { wake('breach'); break; }
        if (!deep && own.raid) { wake('raid'); break; }
        // The crowd on your own wall gets the same chance it would have if you were awake. A wall lasts as long as it takes
        // one stretch to give, and this wave is either still at it by then or it is not. Each new hole takes as long again.
        if (own.pool > 0) {
          own.passWave = (own.passWave || 0) + STEP;
          const lasts = this.wallHp(c, own) / 40 * 1.3, open = own.breaches.length;
          const most = own.fatal ? 4 : Math.min(4, 1 + Math.floor(this.g.day / 4));
          if (open < most && own.waveStart / 15 > lasts && own.passWave > lasts * (open + 1)) {
            const side = this.freeSide(own, Math.floor(((own.dir + Math.PI * .25) / (Math.PI * 2)) * 4 + 4) % 4), horiz = side === 'N' || side === 'S';
            const lo = (horiz ? c.x0 : c.z0) + 12, hi = (horiz ? c.x1 : c.z1) - 12;
            this.carve(c, own, side, Math.floor(lo + rand() * (hi - lo)));
          }
          if (!deep && own.breaches.length) { wake('breach'); break; }
        }
        if (deep) {
          // Exactly what would set off the full siren if you were awake: three holes, or a real crowd through them. Nothing less gets you up.
          const open = own.breaches.length, inside = Math.max(0, (own.passWave || 0) - this.wallHp(c, own) / 40 * 1.3) * 3 * open;
          if (open >= 3 || inside >= 150) {
            // They are really there when you open your eyes, and the siren is really going.
            if (open) this.floodIn(c, own, Math.round(Math.max(inside, 150)));
            wake('extreme');
            break;
          }
          if (open) this.repairs(c, own, STEP);
        }
      }
    }
    this.passing = false;
    return Math.min(seconds, t);
  }

  // What happened while you were out, once you are awake enough to read it.
  showSleepReports() {
    const list = this.passReports || [], g = this.g;
    this.passReports = [];
    // Only the last word on something gets its own report. A fight you slept through is in the day's count.
    for (const r of list) if (r.fell || r.opEnd || r.daily) g.ui.battleReport(r);
    // Something happened to an operation while you were out. You hear about it right after you wake, and only where you are based.
    const yours = this.lastCamp >= 0 ? this.lastCamp : g.player.home, mine = yours >= 0 ? this.state[yours] : null;
    if (mine && mine.op && mine.op.slept) g.ui.bannerNext(`Operation ${mine.op.name} has begun`, `${g.layout.camps[yours].name} is under threat. The Town Hall is taking contracts.`);
    else if (mine && mine.opNext && mine.opNext.slept) g.ui.bannerNext(`Operation ${mine.opNext.name} has been posted`, 'Enlist at the Town Hall.');
    for (const s of this.state) {
      if (s.op) s.op.slept = false;
      if (s.opNext) s.opNext.slept = false;
    }
  }

  // --- Operations ----------------------------------------------------------------------------------
  // Nobody fights these in an evening, so nobody calls them a battle. Each one gets a codename the day it starts, keeps its own count of the
  // days, and is over when the camp has gone quiet again or the camp is gone.
  now() { return this.passing ? this.passClock : this.g.day + this.g.tod; }

  opDay(op, now = this.now()) { return Math.floor(now - op.start) + 1; }

  // How long the command post says it will last, in days. Their guess, not a promise: a big camp with a lot of guns is sure it will be
  // quick, and everybody's guess is off by something, one way or the other.
  predictDays(c, cap) {
    const s = this.state[c.id], size = Math.max(-1, Math.min(1, ((s.folk || 0) + (s.guards || 0) * 3 - 300) / 260));
    const base = cap ? cap * .95 : 3;
    const guess = (base - size * .7) * (.6 + rand() * .85) + (rand() < .2 ? (rand() < .5 ? -1 : 1) : 0);
    return Math.max(1, Math.min(10, Math.round(guess)));
  }

  // The longest an operation runs before the attacks let up. Three to eight days in the first couple of weeks; longer ones come later.
  opCapFor() {
    const day = this.g.day;
    return day < 16 ? Math.max(3, Math.min(8, Math.round(2.2 + rand() * 3 + day * .2))) : Math.max(3, Math.min(12, Math.round(4.5 + rand() * 4.5 + (day - 16) * .12)));
  }

  // "Day 3/2": the day it is on, against the day it was meant to be over by. over is true once it has run past that.
  opDayOf(op, now = this.now()) {
    const d = this.opDay(op, now), p = op.predict || 0;
    return { day: d, predict: p, over: p > 0 && d > p, text: p ? `Day ${d}/${p}` : `Day ${d}` };
  }

  // The same, coloured for the page once it has gone on longer than they said.
  opDayHtml(op, now) {
    const o = this.opDayOf(op, now);
    return o.over ? `<em class="over">${o.text}</em>` : o.text;
  }

  // "a 3-day defence", for anything that wants to say how long it is meant to take.
  opLength(n) { return `${n === 1 ? 'a one-day' : `a ${n}-day`} defence`; }

  openOp(c, s, quiet = false) {
    if (s.op) return s.op;
    const g = this.g, now = this.now();
    // If it was posted ahead of time it keeps the name it was posted under, and whatever anyone signed up for.
    const name = s.opNext ? s.opNext.name : this.newOpName(), quota = s.opNext ? s.opNext.quota : g.jobs.quotaFor(c);
    const cap = s.opNext && s.opNext.cap ? s.opNext.cap : this.opCapFor();
    const predict = s.opNext && s.opNext.predict ? s.opNext.predict : this.predictDays(c, cap);
    // An operation is planned for: every crate in storage comes out, and the supply runs before it bring in what they can. Most of what
    // has been shot off gets made up. One nobody saw coming gets what could be scraped together in the hour.
    const emergency = !!(s.opNext && s.opNext.emergency), had = s.ammo;
    s.ammo = Math.min(100, Math.max(s.ammo, emergency ? 55 : 80) + (emergency ? 15 : 30));
    const restock = Math.round(s.ammo - had);
    s.opNext = null;
    s.opCount = (s.opCount || 0) + 1;
    s.broke = false;
    s.op = { name, slept: !!this.passing, start: now, hot: now, kills: 0, raiders: 0, guardsLost: 0, folkLost: 0, yours: 0, quota, mag: 1, peak: 1, magT: now, predict, cap };
    if (quiet) return s.op;
    this.radio(c, `This is now Operation ${name}, ${this.opLength(predict)} by our reckoning. The Town Hall is taking contracts.`, c.name, false);
    if (restock >= 10) this.radio(c, emergency ? `Every spare box we had is going up on the wall. Ammunition is at ${Math.round(s.ammo)} percent. Make it last.` : `The supply runs came through for ${name}. Crates are going up on the wall now: ammunition is at ${Math.round(s.ammo)} percent.`);
    this.logOp(c, name, 'Begun', `${c.name} is under threat. The Town Hall is taking contracts.`);
    const yours = this.lastCamp >= 0 ? this.lastCamp : g.player.home;
    if (!this.passing && this.known(c) && yours === c.id) {
      g.ui.banner(`Operation ${name} has begun`, `${c.name} is under threat. The Town Hall is taking contracts.`);
    }
    g.jobs.opOpened(c, s.op);
    return s.op;
  }

  newOpName() {
    const free = OP_WORDS.filter((w) => !this.opNames.includes(w)), from = free.length ? free : OP_WORDS;
    const name = from[Math.floor(rand() * from.length)];
    this.opNames.push(name);
    return name;
  }

  // The scouts have seen enough. It goes on the town hall's board before anyone has fired a shot, and you can sign for it from now on.
  noticeOp(c, s, m) {
    if (s.op || s.opNext) return;
    const cap = this.opCapFor();
    s.opNext = { name: this.newOpName(), quota: this.g.jobs.quotaFor(c), at: m.next, postedAt: this.now(), slept: !!this.passing, cap, predict: this.predictDays(c, cap) };
    this.radio(c, `Scouts expect a big push. The Town Hall has posted Operation ${s.opNext.name}, ${this.opLength(s.opNext.predict)}, and is taking contracts now.`, c.name, false);
    this.logOp(c, s.opNext.name, 'Posted', `Scouts expect a big push. Operation ${s.opNext.name} is ${this.opLength(s.opNext.predict)}. Enlist at the Town Hall.`);
  }

  // Nobody planned this one. It goes on the board straight away and starts within the hour, so there is time to hear about it and sign.
  emergencyOp(c, s) {
    if (s.op) return;
    const g = this.g, now = this.now();
    if (s.opNext) {
      // Already posted, and the attack has come early: it starts as soon as it has been up for its hour.
      const since = now - (s.opNext.postedAt ?? -1e9);
      if (since >= OP_EMERGENCY) { this.openOp(c, s); return; }
      s.opNext.at = Math.min(s.opNext.at, s.opNext.postedAt + OP_EMERGENCY + .2);
      s.opNext.emergency = true;
      return;
    }
    const name = this.newOpName();
    const cap = this.opCapFor();
    s.opNext = { name, quota: g.jobs.quotaFor(c), at: now + OP_EMERGENCY + .2, postedAt: now, emergency: true, slept: !!this.passing, cap, predict: this.predictDays(c, cap) };
    this.radio(c, `The wall is breached. This is now an emergency: the Town Hall has posted Operation ${name} and is taking contracts now.`, c.name, false);
    this.logOp(c, name, 'Posted', 'Emergency. The wall is breached. It starts within the hour. Enlist at the Town Hall.');
    const yours = this.lastCamp >= 0 ? this.lastCamp : g.player.home;
    // After the hole itself has been announced, not instead of it.
    if (!this.passing && this.known(c) && yours === c.id) setTimeout(() => g.ui.bannerNext(`Operation ${name} has been posted`, 'Emergency. It starts in 1 hour. Enlist at the Town Hall.'), 0);
  }

  // Roughly when, as far as anyone can say.
  opNoticeHours(s, now = this.now()) {
    const left = Math.max(0, (s.opNext.at - .2 - now) * 24);
    if (s.opNext.emergency) return Math.max(1, Math.ceil(left - .05));
    return Math.max(1, Math.round(left / 2) * 2);
  }

  // What the command post could tell you about the operation at any moment: where it is coming from, the state of the wall, and who is left on it.
  opBrief(c) {
    const s = this.state[c.id], m = this.g.director.plans[c.id], rows = [];
    if (s.op) rows.push(['Magnitude', Math.round(s.op.mag || 1)]);
    const fighting = s.drawing && (s.pool > 0 || s.atWall > 20 || s.inside > 3);
    rows.push(['Attack', fighting ? `From the ${sideOf(s.dir)}` : m.stage > 0 ? `Expected, ${sideOf(m.dir)}` : 'None right now']);
    if (s.breaches.length) rows.push(['Breaches', s.breaches.length]);
    rows.push(['Guards', `${Math.round(s.guards)} / ${c.guards.length}`], ['Civilians', Math.round(s.folk)]);
    return rows;
  }

  // How hard the dead are leaning on a camp right now, from 1 to 10, on the same scale everywhere: 50 at the wall is about a 2, 500 about a 5,
  // 5,000 about a 9, and anything past 10,000 is a 10. Those through the wall count double, and a hole counts for a crowd on its own.
  // It says nothing about the camp, so what a camp has held at, and what it finally fell at, says how strong it was.
  pressure10(c, s) {
    const H = this.g.horde, bodies = s.real ? Math.max(H.siegeCount[c.id], s.atWall || 0) + (s.inside || 0) * 2 : 0;
    const crowd = s.pool + bodies + s.breaches.length * 150;
    return Math.max(1, Math.min(10, 1 + 9 * Math.log(1 + crowd / 50) / Math.log(201)));
  }

  // What each camp has been through, added up as it happens, so that any morning can say how the last day went.
  ledger(s) { return s.ledger || (s.ledger = { kills: 0, yours: 0, breaches: 0 }); }

  // Every morning at six: how the last day went at the camp you last walked into. An operation also reports from wherever you have a stake in it.
  morningReport(c, s, now) {
    const g = this.g, op = s.op, morning = Math.floor(now - .25), count = { ...this.ledger(s), guards: s.guards, folk: s.folk };
    if (s.morning === undefined) { s.morning = morning; s.morningSnap = count; return; }
    if (morning <= s.morning) return;
    const was = s.morningSnap || count;
    s.morning = morning;
    s.morningSnap = count;
    const P = g.player, yours = this.lastCamp >= 0 ? this.lastCamp : P.home;
    const killed = Math.round(count.kills - was.kills), breaches = count.breaches - was.breaches, mine = count.yours - was.yours;
    const guardsLost = Math.max(0, Math.round(was.guards - s.guards)), folkLost = Math.max(0, Math.round(was.folk - s.folk));
    const rows = [['Infected killed', killed.toLocaleString('en-US')]];
    if (breaches > 0) rows.push(['Breaches', breaches]);
    rows.push(['Guards lost', guardsLost], ['Civilians lost', folkLost], ['Guards left', `${Math.round(s.guards)} / ${c.guards.length}`], ['Civilians left', Math.round(s.folk)], ['Ammunition', `${Math.round(s.ammo)}%`]);
    if (mine > 0) rows.push(['Your kills', mine.toLocaleString('en-US')]);
    const left = g.director.strength(c), quiet = !op && killed < 30 && !breaches && !guardsLost && !folkLost;
    const note = quiet ? (left > .5 ? 'A quiet day on the wall.' : 'A quiet day on the wall, and they needed one.')
      : left > .8 ? 'The wall held yesterday. There is plenty of fight left in this place.' : left > .5 ? 'The wall held yesterday, and it hurt. They are already rebuilding.' : left > .25 ? 'The wall held yesterday, but they cannot take many more days like it.' : 'The wall held yesterday. One more like it and it is over.';
    const report = { clock: morning + .25, title: `Day ${OUTBREAK_DAYS + morning} Report`, camp: c.name, sub: op ? `${this.opDayOf(op, morning + .25).text} of Operation ${op.name}` : '', rows, note, day: g.day, fell: false, campId: c.id, op: op ? op.name : null, daily: true, kills: killed };
    if (op) {
      const opRows = [['Magnitude', Math.round(op.mag || 1)], ['Peak magnitude', Math.round(op.peak || 1)], ['Infected killed', killed.toLocaleString('en-US')]];
      if (breaches > 0) opRows.push(['Breaches', breaches]);
      opRows.push(['Guards lost', guardsLost], ['Civilians lost', folkLost]);
      if (mine > 0) opRows.push(['Your kills', mine.toLocaleString('en-US')]);
      const dd = this.opDayOf(op, morning + .25);
      this.logOp(c, op.name, dd.text, dd.over ? `${note} It has now run past the ${dd.predict === 1 ? 'day' : `${dd.predict} days`} it was meant to take.` : note, { rows: opRows, at: morning + .25 });
    }
    if (yours !== c.id && !(op && (P.home === c.id || s.real || g.jobs.active.some((j) => j.type === 'defend' && j.campId === c.id)))) return;
    if (this.passing) {
      // Slept through more than one: the latest is the one that matters.
      this.passReports = this.passReports.filter((q) => !(q.daily && q.campId === c.id));
      this.passReports.push(report);
    } else g.ui.battleReport(report);
    this.lastReport = report;
  }

  // Between the big days, people keep turning up who can shoot, and the camp keeps handing them a rifle: a few a day, as long as it is
  // not in the middle of a fight, and never past what the place could hold by now.
  recruit(c, s, now) {
    const last = s.recruitAt ?? now;
    s.recruitAt = now;
    const span = Math.min(.5, Math.max(0, now - last));
    if (!span || s.drawing || s.evac || s.raid || (s.op && ((s.op.mag || 1) >= 4 || (s.wear || 0) > .25))) return;
    const room = Math.min(1, this.g.director.curve(c, now) + .22) * c.guards.length;
    if (s.guards >= room) return;
    const k = RECOVERY[CAMP_START[c.key].tier] || 1;
    s.guards = Math.min(room, s.guards + c.guards.length * .1 * (.6 + .5 * k) * span * (1 - (s.wear || 0)));
  }

  // How worn down a camp is, 0 to 1. It builds while the dead are at the wall in an operation, with every hole and every guard lost,
  // and it only comes back during a proper lull: a couple of hours with nothing at the wall. A camp that gets no break between attacks
  // goes into each one weaker than the last.
  wearTick(c, s, now) {
    const last = s.wearAt ?? now;
    s.wearAt = now;
    const span = Math.min(.25, Math.max(0, now - last));
    if (!span) return;
    const busy = s.drawing && (s.pool > 0 || (s.atWall || 0) > 15 || (s.inside || 0) > 3);
    if (busy) { s.lastBusy = now; if (s.op) s.wear = Math.min(1, (s.wear || 0) + span * .7 * Math.max(.4, (s.op.mag || 1) / 5)); return; }
    if (now - (s.lastBusy ?? -9) < .1) return;
    s.wear = Math.max(0, (s.wear || 0) - span * (s.op ? .3 : .9));
  }

  // Called for every camp still standing, awake or asleep.
  tickOp(c, s, m, now) {
    const op = s.op;
    if (!op) {
      if (s.opNext && s.opNext.emergency && now >= s.opNext.at - .2) this.openOp(c, s);
      return;
    }
    // It climbs and eases over a few seconds rather than flickering with every body that drops.
    const k = 1 - Math.exp(-Math.max(0, now - (op.magT ?? now)) * 1500 / 6);
    op.magT = now;
    op.mag = (op.mag || 1) + (this.pressure10(c, s) - (op.mag || 1)) * k;
    op.peak = Math.max(op.peak || 1, op.mag);
    // Past a certain size the gates are shut and stay shut. Whoever is outside gets a warning and a short while to get in.
    const t = this.g.time;
    if (s.evac || s.status !== 'holding') { s.lockAt = null; s.locked = false; }
    else if (!s.locked && s.lockAt == null && op.mag >= GATE_LOCK_MAG) {
      s.lockAt = t + GATE_LOCK_WARN;
      this.radio(c, op.mag >= 8 ? `Magnitude ${Math.round(op.mag)}! Gates shut in ${GATE_LOCK_WARN}. If you're out there, run!` : `Magnitude ${Math.round(op.mag)}. Gates lock in ${GATE_LOCK_WARN} seconds. Anyone outside, get in now.`, c.name, false);
    } else if (s.lockAt != null && !s.locked && t >= s.lockAt) {
      s.locked = true; s.lockAt = null;
      this.radio(c, 'Gates are locked. Nobody in or out until this eases.', c.name, false);
    } else if (s.lockAt != null && op.mag < GATE_LOCK_MAG - 1) s.lockAt = null;
    else if (s.locked && op.mag < GATE_LOCK_MAG - 1.5) {
      s.locked = false;
      this.radio(c, 'It is easing off. Gates are open again.', c.name, false);
    }
    // Every guard lost while it lasts is called in. The ones that die in front of you are named where it happens.
    if (op.gw === undefined || s.guards > op.gw) op.gw = s.guards;
    const lost = Math.floor(op.gw - s.guards + 1e-6);
    if (lost >= 1) {
      op.gw -= lost;
      s.wear = Math.min(1, (s.wear || 0) + .006 * lost);
      op.lossPend = (op.lossPend || 0) + lost;
    }
    // Called in when there is a moment to call it in, not a separate shout for every one of them: whoever has gone since the last call
    // goes out together, no more often than every half a minute or so of game time. Nothing goes out once the place is being given up.
    const gsec = now * 1500;
    if (op.lossPend >= 1 && gsec - (op.lossSaid ?? -1e9) > 25 && !s.evac && !(s.collapseT > 0)) {
      this.radio(c, this.lossCall(c, s, op.lossPend));
      op.lossPend = 0;
      op.lossSaid = gsec;
    }
    if (m.stage > 0 || (s.major && s.drawing) || s.fatal || s.evac || s.collapseT > 0 || (s.real && s.breaches.length) || s.inside >= 30) op.hot = now;
    this.g.jobs.opTick(c, op, now);
    // A lull early on is not the end of it: the follow-ups are further apart at the start, and the operation runs its length.
    const running = op.cap && now - op.start < op.cap - .35;
    if (!running && now - op.hot >= OP_CALM && !s.drawing && !s.raid && s.pool <= 0 && !s.rec) this.closeOp(c, s, true, now);
  }

  // The operation is over. A win is written up here. A loss has already been, by the report that says the camp fell.
  closeOp(c, s, won, now = this.now()) {
    const g = this.g, op = s.op;
    if (!op) return;
    s.op = null;
    s.locked = false; s.lockAt = null;
    const had = g.jobs.active.some((j) => j.type === 'defend' && j.campId === c.id);
    const pay = won ? g.jobs.opWon(c, op) : g.jobs.opLost(c, op);
    if (!won) {
      s.fellAtMag = Math.round(op.peak || 1);
      this.logOp(c, op.name, 'Failed', `${c.name} has fallen. Peak magnitude ${s.fellAtMag}.`);
      return;
    }
    s.heldMag = Math.max(s.heldMag || 0, Math.round(op.peak || 1));
    // What the watch will be talking about for a day or two after.
    s.lastOp = { name: op.name, days: Math.max(1, Math.ceil(now - op.start)), predict: op.predict || 0, peak: Math.round(op.peak || 1), lost: op.guardsLost + op.folkLost, guardsLost: op.guardsLost, until: now + 2 };
    s.opGapUntil = now + OP_GAP;
    g.director.opEnded(c, now);
    const days = Math.max(1, Math.ceil(now - op.start));
    const rows = [['Lasted', `${days === 1 ? '1 day' : `${days} days`}${op.predict ? ` of ${op.predict} expected` : ''}`], ['Peak magnitude', Math.round(op.peak || 1)], ['Infected killed', Math.round(op.kills).toLocaleString('en-US')]];
    if (op.raiders) rows.push(['Raiders killed', op.raiders]);
    rows.push(['Guards lost', op.guardsLost], ['Civilians lost', op.folkLost]);
    if (op.yours) rows.push(['Your kills', op.yours.toLocaleString('en-US')]);
    const docked = pay && g.jobs.lastOpFull > pay;
    if (pay) rows.push(['Your pay', `\u2660\ufe0e ${pay.toLocaleString('en-US')}${docked ? ' (docked)' : ''}`]);
    if (docked) rows.push(['Before docking', `\u2660\ufe0e ${g.jobs.lastOpFull.toLocaleString('en-US')}`]);
    const note = pay ? `${docked ? 'Missed quotas docked your pay. ' : ''}Your pay is waiting at the ${c.name} Town Hall. If the settlement falls first, so does your pay.` : 'They have stood down, for now.';
    const report = { clock: now, win: true, title: `Operation ${op.name} succeeded`, camp: c.name, rows, note, day: g.day, fell: false, campId: c.id, opEnd: true, op: op.name, kills: Math.round(op.kills) };
    this.logOp(c, op.name, 'Succeeded', note, { rows, at: now });
    if (had || s.real || g.player.home === c.id) {
      if (this.passing) this.passReports.push(report);
      else g.ui.battleReport(report);
      this.lastReport = report;
    } else if (this.known(c)) {
      this.radio(c, `Operation ${op.name} is over. We have stood down.`, c.name, false);
    }
  }

  // How bad it is right now, for how people talk on the radio: 0 a normal day, 1 bad, 2 falling apart.
  tension(c, s) {
    const mag = s.op ? s.op.mag || 1 : 1, left = c.guards.length ? s.guards / c.guards.length : 1;
    let t = 0;
    if (mag >= 6 || s.breaches.length >= 1 || s.inside >= 30 || left < .5) t = 1;
    if (mag >= 8 || s.breaches.length >= 3 || s.inside >= 150 || left < .25 || s.fatal) t = 2;
    return t;
  }

  // Guards lost, called in. A run of them in a short time sounds like it: first clipped, then frantic, then nobody even counting.
  // When it is bad, people swear. Not every time: now and then, more the worse it gets.
  swear(text, t) {
    if (t < 1 || rand() > (t >= 2 ? .4 : .25)) return text;
    return rand() < .6 ? pickFrom(['Shit! ', 'Fuck! ', 'Goddamn it! ', 'Jesus Christ! ', 'Oh, hell. ', 'Fuck me. ']) + text : `${text} ${pickFrom(['Fuck!', 'Shit!', 'Goddammit!', 'Christ!'])}`;
  }

  // On the radio they keep it clean, until it is truly bad: magnitude 7 and up. Below that, the words come out.
  radioSwear(c, s, text) {
    if ((s.op ? s.op.mag || 1 : 1) >= 7) return this.swear(text, 2);
    return text.replace(/This is a fucking massacre/g, 'This is a massacre').replace(/We are so fucked\./g, 'We are finished.').replace(/^Shit, shit, shit, they/g, 'They')
      .replace(/^Goddamn it, another/g, 'Another').replace(/wall's fucked/g, "wall's gone").replace(/Thank fuck\./g, 'Thank God.').replace(/^Christ, they/g, 'They');
  }

  lossCall(c, s, lost) {
    const now = this.now() * 1500, log = s.lossLog || (s.lossLog = []);
    for (let k = 0; k < lost; k++) log.push(now);
    while (log.length && now - log[0] > 75) log.shift();
    const run = log.length, t = this.tension(c, s), left = Math.round(s.guards);
    if (left <= Math.max(2, c.guards.length * .12)) return this.radioSwear(c, s, pickFrom([`There's hardly anyone left up here! ${left}, maybe!`, 'I can count who\'s left on the wall on one hand!', 'Half the posts aren\'t answering. Nobody.', `It's just a few of us now. Send anyone who can hold a gun!`, 'We are so fucked. There\'s nobody left up here.']));
    if (run >= 6) return this.radioSwear(c, s, pickFrom(['They\'re slaughtering us up here!', 'Stop sending people to that stretch, they\'re just dying!', 'Christ, they\'re dropping like flies! Who\'s still up there?', 'We keep losing people and they keep coming! What do we do?!', 'Another one! And another! I can\'t keep count!', 'Half the wall\'s gone quiet. Is anyone still up there?', 'This is a fucking massacre up here!', 'Shit, shit, shit, they got another one!']));
    if (run >= 3) return this.radioSwear(c, s, pickFrom([`${lost === 1 ? 'Another' : lost} down! That's ${run} in a minute!`, 'We\'re losing them fast! Close up, close up!', 'They\'re pulling people off the wall! Watch the edge!', `${run} gone already. Somebody fill those spots!`, 'Man down! Again! Get up there!', 'Goddamn it, another one\'s down!']));
    if (t >= 1) return this.radioSwear(c, s, lost === 1 ? pickFrom(['Lost one! Close the gap!', 'Guard down! Somebody cover that spot!', 'We just lost one up top!', 'Man down on the wall! Move up!']) : `${lost} more down on the wall! Fill in!`);
    return lost === 1 ? pickFrom(['We lost one on the wall.', 'Guard down. We are one short on the wall.', 'Man down on the wall. Close the gap.']) : `We have lost ${lost} more on the wall.`;
  }

  // You only pick up the camps you have actually found.
  known(c) { return !!this.g.player.discovered[c.id]; }

  // always: an evacuation's own calls, which go out whatever state the place is in. Anything else from a settlement that is being given
  // up, coming down, or gone is not sent at all: no magnitudes, no gate calls, no losses, no rockets from a wall nobody is on.
  radio(c, text, who = c && c.name, keep = true, always = false) {
    if (!c || !this.known(c)) return;
    const st = this.state[c.id];
    if (!always && st && (st.evac || st.collapseT > 0 || st.status !== 'holding')) return;
    if (keep) this.logNews({ kind: 'radio', campId: c.id, who, text });
    if (!this.passing) this.g.ui.radio(who, text, c.name);
  }

  // An operation is bigger news than a radio call, and gets a bigger post.
  logOp(c, name, stage, text, extra = {}) {
    if (this.known(c)) this.logNews({ kind: 'op', campId: c.id, name, stage, text, ...extra });
  }

  // Goes on the news page. Only so much of it is worth keeping.
  logNews(item) {
    if (item.at === undefined) item.at = this.now();
    this.news.push(item);
    if (this.news.length > 400) this.news.shift();
  }

  // --- Waves --------------------------------------------------------------------------------------
  // The director decides when and how bad. opts.harm is what it will cost the camp, win or lose.
  startWave(id, size, opts = {}) {
    const g = this.g, c = g.layout.camps[id], s = this.state[id], H = g.horde;
    const major = !!opts.major;
    s.pool += size;
    s.wave = size;
    s.dir = opts.dir ?? rand() * Math.PI * 2;
    s.drawing = true;
    s.quiet = 0;
    s.major = major;
    s.fatal = !!opts.fatal;
    s.fatalT = 0;
    s.harmLeft += opts.harm || 0;
    s.harm = s.harmLeft;
    s.waveStart = s.pool;
    s.waveT = 0;
    s.passWave = 0;
    // A small crowd comes up one street. A big one comes up all of them.
    s.arms = s.fatal ? 4 : major && size > 1000 ? 2 + (size > 2200 ? 1 : 0) : 1;
    s.startPeople = s.folk + s.guards;
    s.sideI = 0;
    const rec = this.openTally(s);
    rec.major = rec.major || major;
    const lore = LORE[c.key];
    const who = lore.cast.find((m) => m.role === 'leader');
    const speaker = this.dead[who.id] ? c.name : who.name;
    // The last one is announced like any other big one: nobody calls it the end before it is.
    const opener = major || s.fatal ? `A huge crowd is moving on ${c.name}` : `A crowd is moving on ${c.name}`;
    this.radio(c, `${opener} from the ${sideOf(s.dir)}. All guns to the wall.`, speaker);
    if (major) this.openOp(c, s);
    // Everything idle in earshot joins in.
    if (s.real) H.drawToCamp(c, 90, major ? .25 : .12);
  }

  // Somebody keeps the count, from the first shot until it goes quiet.
  openTally(s) {
    if (s.rec) return s.rec;
    s.rec = { folk: s.folk, guards: s.guards, kills: 0, raiders: 0, breaches: 0, major: false, raid: false, present: !!s.real, yours: 0 };
    return s.rec;
  }

  // One of the dead went down close to a wall. If an operation is on and it was you that put it down, that kill counts for you, whether the
  // crowd is at the wall right now or you went out looking for it. The camp pays for it if it holds.
  noteKill(x, z, byPlayer) {
    const H = this.g.horde, c = H.inCamp(x, z, 100);
    if (!c) return;
    const s = this.state[c.id], r = s.rec, count = this.ledger(s);
    count.kills++;
    if (byPlayer) count.yours++;
    if (r) r.kills++;
    if (byPlayer && s.status === 'holding') this.g.jobs.nightKill(c);
    if (!s.op || s.status !== 'holding') return;
    if (!r) s.op.kills++;
    if (!byPlayer) return;
    if (r) r.yours = (r.yours || 0) + 1;
    s.op.yours++;
    this.g.jobs.defendKill(c, s.op);
  }

  // The count, once there is time to take it. A breach, a big assault or a raid gets written up. A few dozen at the wall does not.
  closeTally(c, s, outcome) {
    const g = this.g, r = s.rec, P = g.player, op = s.op;
    s.rec = null;
    if (!r) return;
    // When a camp falls, anyone who did not get out is counted with the dead, and the watch never came down from the wall.
    const fell = outcome === 'fell';
    const folkLost = Math.max(0, Math.round(r.folk - (fell ? r.gotOut || 0 : s.folk))), guardsLost = Math.max(0, Math.round(fell ? r.guards : r.guards - s.guards));
    if (op) {
      op.kills += r.kills;
      op.raiders += r.raiders || 0;
      op.guardsLost += guardsLost;
      op.folkLost += folkLost;
    }
    // While an operation is on, one crowd beaten is not news: it goes in the count for the morning report. A raid is still its own event.
    if (op && !fell && !(r.raid && !r.major)) {
      op.breaches = (op.breaches || 0) + (r.breaches || 0);
      s.rebuildUntil = g.day + g.tod + .3;
      s.calmFrom = g.day + g.tod;
      return;
    }
    // A handful at the wall is a normal afternoon. Anything you would call a horde gets written up.
    if (!r.breaches && !r.major && !r.raid && outcome !== 'fell' && r.kills < 30) return;
    const yours = r.yours || 0;
    const title = outcome === 'fell' ? (op ? `Operation ${op.name}` : 'The settlement has fallen') : r.raid && !r.major ? 'Raid driven off' : r.breaches ? 'Horde beaten, breaches sealed' : 'Attack defended';
    const rows = [];
    if (op) rows.push(['Day of operation', this.opDayOf(op).text.replace('Day ', '')], ['Peak magnitude', Math.round(op.peak || 1)]);
    rows.push(['Infected killed', Math.round(r.kills).toLocaleString('en-US')]);
    if (r.raiders) rows.push(['Raiders killed', r.raiders]);
    rows.push(['Guards lost', guardsLost], ['Civilians lost', folkLost]);
    if (outcome === 'fell') rows.push(['Got out', Math.round(r.gotOut || 0)]);
    else {
      rows.push(['Guards left', `${Math.round(s.guards)} / ${c.guards.length}`], ['Civilians left', `${Math.round(s.folk)}`]);
      if (r.breaches) rows.push(['Breaches', r.breaches]);
      rows.push(['Ammunition', `${Math.round(s.ammo)}%`]);
    }
    if (yours) rows.push(['Your kills', yours.toLocaleString('en-US')]);
    const left = g.director.strength(c);
    // Nothing got through, so that is what the line at the bottom gets to say.
    const wallHeld = outcome !== 'fell' && !(r.raid && !r.major) && !r.breaches;
    const note = outcome === 'fell' ? (op ? 'Operation has failed. There is nothing left to hold.' : 'There is nothing left to hold.')
      : wallHeld ? (left > .8 ? 'The wall held, and they took that well. There is plenty of fight left in this place.' : left > .5 ? 'The wall held, but it hurt. They are already rebuilding.' : left > .25 ? 'The wall held, but they cannot take many more like that.' : 'The wall held, but one more night like that and it is over.')
      : left > .8 ? 'They took that well. There is plenty of fight left in this place.' : left > .5 ? 'It hurt. They are already rebuilding.' : left > .25 ? 'They held, but they cannot take many more like that.' : 'One more night like that and it is over.';
    const report = { clock: this.now(), win: !fell, title, camp: op && !fell ? `Operation ${op.name}, ${c.name}` : c.name, rows, note, day: g.day, fell: outcome === 'fell', campId: c.id, kills: Math.round(r.kills), raiders: r.raiders, guardsLost, folkLost, op: op ? op.name : null };
    if (r.present || P.home === c.id) {
      if (this.passing) this.passReports.push(report);
      else g.ui.battleReport(report);
      this.lastReport = report;
    } else if (this.known(c) && !this.passing) {
      this.radio(c, outcome === 'fell' ? `${folkLost + guardsLost} dead. It is over here.` : `We held. ${folkLost + guardsLost} dead, ${Math.round(s.folk)} civilians and ${Math.round(s.guards)} guards left.`);
    }
    if (outcome !== 'fell') s.rebuildUntil = g.day + g.tod + .3;
    s.calmFrom = g.day + g.tod;
  }

  // What a battle has cost so far, in people and guns and ammunition.
  applyHarm(c, s, amount) {
    if (amount <= 0) return;
    s.harmLeft = Math.max(0, s.harmLeft - amount);
    s.buried = (s.buried || 0) + c.folk * amount * .9;
    s.folk = Math.max(0, s.folk - c.folk * amount * .9);
    s.guards = Math.max(0, s.guards - c.guards.length * amount * 1.05);
    s.ammo = Math.max(0, s.ammo - amount * 90);
    s.wall = Math.max(0, s.wall - amount * 70);
  }

  // Bodies arrive in a stream from the direction the wave came from.
  feedWave(c, s) {
    const g = this.g, H = g.horde, P = g.player, W = g.world;
    const R = H.settings.radius;
    if (H.siegeCount[c.id] >= SIEGE_BODIES * (s.fatal || s.evac || s.collapseT > 0 ? 1.5 : 1)) return;
    // They do not all arrive at once. It builds.
    let budget = Math.min(s.waveT > 40 ? 12 : 3 + Math.floor(s.waveT * .2), Math.ceil(s.pool));
    s.waveT = (s.waveT || 0) + g.frameDt;
    const hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    const start = budget;
    for (let t = 0; t < 60 && budget > 0; t++) {
      // Out from the wall itself, whatever the camp's shape: a ring around a long camp lands too far off.
      const a = s.dir + Math.floor(rand() * (s.arms || 1)) * (Math.PI * 2 / (s.arms || 1)) + (rand() - .5) * 1.4, ux = Math.sin(a), uz = -Math.cos(a);
      const d = Math.min(hx / (Math.abs(ux) + .001), hz / (Math.abs(uz) + .001)) + 35 + rand() * 70;
      const x = Math.floor(c.cx + ux * d), z = Math.floor(c.cz + uz * d);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      if (Math.hypot(x - P.x, z - P.z) > R || Math.hypot(x - P.x, z - P.z) < 30) continue;
      if (!W.walk[(x >> 1) + (z >> 1) * W.walkW] || H.campAt(x, z, 12)) continue;
      const i = H.spawnOne(x + .5, W.terrainTop(x, z), z + .5, 1);
      if (i < 0) break;
      H.siege[i] = c.id + 1;
      s.pool = Math.max(0, s.pool - 1);
      budget--;
    }
    // Water, or nothing loaded out that way: they come round from another side.
    if (budget === start) s.dir += 1.1;
  }

  // Far from the player, a battle is arithmetic with the same rough shape as the real thing.
  abstractBattle(c, s, dt) {
    s.abstractT += dt;
    if (s.abstractT < 1) return;
    const step = s.abstractT;
    s.abstractT = 0;
    const ammoK = s.ammo > 0 ? 1 : .3, might = this.might(c);
    const kills = Math.max(3, s.guards * .8 * ammoK * might) * step;
    const was = s.pool;
    s.pool = Math.max(0, s.pool - kills);
    s.tally += kills;
    if (s.rec) s.rec.kills += was - s.pool;
    this.ledger(s).kills += was - s.pool;
    // The fight goes the way the director said it would: the cost arrives in step with the crowd being worn down.
    if (!s.fatal && s.waveStart > 0) this.applyHarm(c, s, s.harm * (was - s.pool) / s.waveStart);
    if (s.pool <= 0 && !s.fatal) this.endSiege(c, s, true);
  }

  // The last evening. However well it goes, after a while the only question left is how many get out.
  lastStand(c, s, dt) {
    if (s.status !== 'holding') return;
    if (s.evac) {
      s.evacT -= dt;
      if (s.evacT <= 0) this.fall(c, s);
      return;
    }
    s.fatalT += dt;
    s.wall = Math.max(0, s.wall - dt * .3);
    s.ammo = Math.max(0, s.ammo - dt * .55);
    if (!s.real) {
      // Nobody watching: it comes down to the numbers.
      s.folk = Math.max(0, s.folk - c.folk * dt * .0012);
      s.guards = Math.max(0, s.guards - c.guards.length * dt * .0014);
      if (s.fatalT > 230) this.callEvac(c, s);
      return;
    }
    if (s.collapseT > 0) return;   // it is already coming down
    // The last evening has no quiet spells. If the crowd has somehow run out with the camp still standing, there is more of it.
    if (s.pool <= 0 && (s.atWall || 0) + s.inside < 8) {
      s.lullT = (s.lullT || 0) + dt;
      if (s.lullT > 15) { s.lullT = 0; s.pool += Math.max(500, Math.round((s.waveStart || 0) * .35)); s.waveT = 0; }
    } else s.lullT = 0;
    // More of the wall gives way every so often, on one side after another, until there is nowhere left to hold. It takes a crowd
    // at that wall to do it: a stretch with nobody on it stays up, and one that has just been patched gets a moment first.
    if (s.fatalT > 22 && !(s.breachCd > 0) && s.breaches.length < Math.min(4, 1 + Math.floor(s.fatalT / 42))) {
      const hot = this.g.npcs.camps[c.id].sideHot, from = (s.sideI = (s.sideI || 0) + 1);
      for (let k = 0; k < 4; k++) {
        const side = 'NESW'[(from + k) % 4], h = hot && hot[side];
        if (!h || h.n < 5 || s.breaches.some((b) => b.side === side)) continue;
        const horiz = side === 'N' || side === 'S', lo = (horiz ? c.x0 : c.z0) + 12, hi = (horiz ? c.x1 : c.z1) - 12;
        if (this.carve(c, s, side, Math.floor(Math.max(lo, Math.min(hi, h.sum / h.n))))) s.breachCd = 18;
        break;
      }
    }
    // The very last line is only there so the night cannot go on forever.
    if (s.fatalT > 320) this.callEvac(c, s);
  }

  // Is this battle lost? Nobody can say for sure, so somebody has to judge it the way a person on the wall would: how many are through,
  // how many of us are gone, and whether it is getting better or worse. Either a big enough flood or heavy enough losses can tip it, and
  // the two together tip it sooner. Once it looks lost they still get a little while to turn it round. If they are actually pushing the
  // crowd back the clock stops, and if it stays that way it runs back down. Call it in time, and a fair number still get out.
  judgeBattle(c, s, dt) {
    const people = s.folk + s.guards, was = s.rec ? s.rec.folk + s.rec.guards : s.startPeople || people;
    const lost = Math.max(0, 1 - people / Math.max(1, was));
    // Sampled every few seconds, so one quick volley does not count as turning the tide.
    if ((s.trendT = (s.trendT || 0) - dt) <= 0) {
      s.trendT = 5;
      s.pushingBack = s.inside < (s.trendIn ?? 0) * .88;
      s.trendIn = s.inside;
    }
    // Enough of them through to matter at all. A handful of bites in a small camp is not a lost battle, however it adds up on paper.
    const wear = s.wear || 0, need = 1 - .45 * wear;
    const real = s.inside >= 400 * need || (s.inside >= 180 * need && s.breaches.length >= 2) || (people < 15 && s.inside >= 80);
    const grim = real ? s.inside / 800 + lost / .55 + (s.flood || 0) * .25 + wear * .35 : 0;
    // The breaking point: worn out, holed on three sides and full of them. The line goes; what is left of the wall's watch comes down
    // into the camp, and everybody is fighting where they stand. The call to get out comes out of that, not before it.
    if (!s.broke && wear > .72 && s.breaches.length >= 3 && s.inside >= 100 && s.op) {
      s.broke = true;
      s.fullT = 12;
      this.radio(c, this.radioSwear(c, s, pickFrom(['The line is gone! Everybody off the wall, fight where you are!', 'We cannot hold the wall! Fall back into the settlement, fall back!', 'They are everywhere inside! Forget the posts, protect the people!'])));
      if (s.real) this.floodIn(c, s, 120);
    }
    // A strong camp is given the time to turn it around. The more outnumbered it is, the less of that it can afford.
    const odds = 1 + Math.max(0, s.inside / Math.max(1, people) - 3) * .2;
    if (grim >= 1 && !s.pushingBack) s.doomT = (s.doomT || 0) + dt * Math.min(3, grim * odds);
    else if (s.doomT > 0) s.doomT = Math.max(0, s.doomT - dt * (s.pushingBack ? 1.2 : grim < .75 ? .8 : .15));
    s.grim = grim;
    if (s.doomT >= 50) this.callEvac(c, s);
  }

  // How bad the bites are, and how little the guns are doing, once the last stand is well along.
  desperation(s) { return s.fatal || s.evac ? Math.min(1, s.fatalT / 170) : 0; }

  lastFight(s) {
    s.fatal = true;
    s.fatalT = 0;
    s.arms = 4;
    s.startPeople = s.folk + s.guards;
  }

  // Somebody finally says it out loud.
  evacuate(c, s) {
    const g = this.g, refuge = this.refugeFor(c);
    s.collapseT = 0;
    s.evac = true;
    s.evacT = s.real ? 75 : 40;
    s.fatal = false;
    s.refuge = refuge ? refuge.id : -1;
    if (g.ui.clearRadio) g.ui.clearRadio(c.name);
    if (s.op) { s.op.lossPend = 0; }
    const lore = LORE[c.key], who = lore.cast.find((m) => m.role === 'leader');
    const to = refuge ? ` Make for ${refuge.name}.` : '';
    this.radio(c, `It's over. Open the gates, everybody out.${to} Go now!`, this.dead[who.id] ? c.name : who.name, true, true);
    if (g.player.home === c.id) {
      g.jobs.startMigrate(c, refuge);
      if (!this.passing) g.ui.banner(`${c.name} is falling`, refuge ? `Survivors are running for ${refuge.name}. It is marked on your map.` : 'There is nowhere left to run to.');
    } else if (refuge && !this.passing) {
      // Anyone's people on the road can use someone with a gun walking alongside.
      g.jobs.startMigrate(c, refuge, true);
    }
    if (s.real) g.npcs.evacuate(c, refuge);
  }

  // Once it is lost, some flags come down and some do not. Nothing times this: each flag either draws a few of the crowd or it does not,
  // whoever happens to be close by goes and tears at the pole, and it lasts until it doesn't. Some are still flying over the ruins afterwards.
  flagsGo(c, s, dt) {
    const g = this.g, W = g.world, H = g.horde;
    if (!s.flagFate) {
      s.flagFate = c.parts.filter((p) => p.t === 'flag').map((p) => ({ x: p.x0, z: p.z0, doomed: rand() < FLAG_DOOM, wear: 0, last: 1 + rand() * 2.5, after: rand() * 4, lure: 0, seen: 0 }));
    }
    const away = !s.real;
    for (const f of s.flagFate) {
      if (!f.doomed || f.down) continue;
      // Nothing can be said about a pole that has not been loaded yet.
      if (!W.isLoaded(f.x, STREET_Y + 2, f.z)) continue;
      if (away) {
        // It happened while nobody was looking. It is on the ground when you get there.
        this.snapFlag(f, true);
        continue;
      }
      if ((f.after -= dt) > 0) continue;
      if ((f.tick = (f.tick || 0) - dt) > 0) continue;
      f.tick = .5;
      if (!W.get(f.x, STREET_Y + 1, f.z)) { f.down = true; continue; }   // something else got it first
      // Who is at the base, and who is nearest and not already busy with something like this. The fight is usually out at the walls, so it can
      // take one of them a while to wander over, and that is what decides when this happens.
      let at = 0, drawn = 0, near = -1, nd = 1e9;
      H.forRadius(f.x, f.z, 120, (i) => {
        const d = Math.hypot(H.px[i] - f.x - .5, H.pz[i] - f.z - .5);
        if (H.py[i] > STREET_Y + 3) return;
        if (d < 2.8) at++;
        if (f.lure && H.lure[i] === f.lure) drawn++;
        else if (!H.lure[i] && d < nd) { nd = d; near = i; }
      });
      if (drawn < 1 + (f.x & 1) && near >= 0) {
        if (!f.lure) f.lure = H.addLure(f.x + .5, f.z + .5);
        H.lure[near] = f.lure;
      }
      if (!at) continue;
      f.wear += at * .5;
      if ((f.seen += .5) >= 1) {
        f.seen = 0;
        g.particles.dust(f.x + .5, STREET_Y + 1.4, f.z + .5, 2, .8);
        g.particles.debris(f.x, STREET_Y + 1, f.z, M_ALUM, 2, 2.4);
        g.audio.simple('block', f.x, STREET_Y + 1, f.z);
      }
      if (f.wear >= f.last) this.snapFlag(f, false);
    }
  }

  snapFlag(f, quiet) {
    const g = this.g, W = g.world, H = g.horde;
    f.down = true;
    if (f.lure) H.dropLure(f.lure);
    W.set(f.x, STREET_Y + 1, f.z, 0);
    W.set(f.x, STREET_Y + 2, f.z, 0);
    W.queueFloatCheck(f.x, STREET_Y + 2, f.z);
    W.floatQueue.push(f.x, STREET_Y + 3, f.z, 1);
    if (!quiet) {
      g.particles.debris(f.x, STREET_Y + 1, f.z, M_ALUM, 7, 4);
      g.particles.dust(f.x + .5, STREET_Y + 1.5, f.z + .5, 4, 1.4);
    }
  }

  // How hard one of the dead can tear at what is in front of it here. Inside the wall anything will come apart if they keep at it, and more
  // readily the worse it is going. The outer wall is the exception: the only time it comes apart under their hands is when the camp is finished.
  ruinChew(x, z) {
    const H = this.g.horde, c = H.inCamp(x, z, 6);
    if (!c) return 0;
    const s = this.state[c.id];
    if (s.status === 'overrun') return H.campAt(x, z, -7) ? 7 : 0;
    if (s.status !== 'holding') return 0;
    if (s.evac || s.collapseT > 0) return 10;
    if (!H.campAt(x, z, -7)) return 0;
    return s.fatal ? 6 : 3;
  }

  // It is lost. Nobody has said so yet, but the whole crowd seems to know: for a few seconds they go at the wall all along its length and pour
  // in through what is left of it, and only then does someone make the call. A camp nobody is watching just gets the call.
  callEvac(c, s) {
    if (s.evac || s.collapseT > 0) return;
    this.openOp(c, s);
    if (this.g.ui.clearRadio) this.g.ui.clearRadio(c.name);
    if (!s.real || this.passing || !this.g.npcs.camps[c.id].active) { this.evacuate(c, s); return; }
    s.collapseT = COLLAPSE_TIME;
    s.fullT = 12;
    s.drawing = true;
    s.quiet = 0;
    s.arms = 4;
    s.waveT = Math.max(s.waveT || 0, 41);
    // Everything that was still on its way arrives now.
    s.pool = Math.max(s.pool, Math.round(240 * this.g.horde.settings.horde));
    this.radio(c, 'The wall! The whole wall is coming down!', c.name, true, true);
  }

  // Pull a stretch of the outer wall down. Not always to the ground, so it ends up broken rather than sliced.
  tearWall(c, s, dt, rate) {
    const g = this.g, W = g.world, P = g.player, st = g.npcs.camps[c.id], hot = st.sideHot;
    if (s.collapseT > 0 && (s.sideT = (s.sideT || 0) - dt) <= 0) {
      // A real gap on every side the crowd has reached, and soon enough on all of them.
      s.sideT = 1.2;
      for (const side of 'NESW') {
        const h = hot && hot[side], late = s.collapseT < COLLAPSE_TIME * .6;
        if (s.breaches.some((b) => b.side === side) || (!late && (!h || h.n < 3))) continue;
        const horiz = side === 'N' || side === 'S', lo = (horiz ? c.x0 : c.z0) + 12, hi = (horiz ? c.x1 : c.z1) - 12;
        const t = h && h.n ? h.sum / h.n : lo + rand() * (hi - lo);
        this.carve(c, s, side, Math.floor(Math.max(lo, Math.min(hi, t))), true);
        break;
      }
    }
    s.tearT = (s.tearT || 0) + dt * rate;
    while (s.tearT >= 1) {
      s.tearT -= 1;
      // Mostly where the crowd is leaning on it.
      let total = 0;
      for (const k of 'NESW') total += (hot && hot[k].n) || 0;
      let side = 'NESW'[Math.floor(rand() * 4)];
      if (total > 0 && rand() < .8) {
        let pick = rand() * total;
        for (const k of 'NESW') { pick -= hot[k].n; if (pick <= 0) { side = k; break; } }
      }
      const h = hot && hot[side], horiz = side === 'N' || side === 'S', lo = horiz ? c.x0 : c.z0, hi = (horiz ? c.x1 : c.z1) - 1;
      const t = h && h.n && rand() < .75 ? h.sum / h.n + (rand() - .5) * 90 : lo + rand() * (hi - lo);
      const at = Math.floor(Math.max(lo, Math.min(hi, t))), wide = 2 + Math.floor(rand() * 4);
      const y0 = rand() < .5 ? STREET_Y : STREET_Y + 1 + Math.floor(rand() * c.hc), y1 = STREET_Y + c.hc + 2;
      const ix = side === 'W' ? 1 : side === 'E' ? -1 : 0, iz = side === 'N' ? 1 : side === 'S' ? -1 : 0;
      const bx = side === 'W' ? c.x0 : side === 'E' ? c.x1 - 1 : at, bz = side === 'N' ? c.z0 : side === 'S' ? c.z1 - 1 : at;
      let gone = 0, sample = 0;
      for (let d = -1; d < 4; d++) for (let a = 0; a < wide; a++) for (let y = y0; y <= y1; y++) {
        const x = bx + ix * d + (horiz ? a : 0), z = bz + iz * d + (horiz ? 0 : a), id = W.get(x, y, z);
        if (!id || HP[id] === 255) continue;
        if (W.set(x, y, z, 0)) { gone++; sample = id; }
      }
      if (!gone) continue;
      W.queueFloatCheck(bx, y1, bz);
      W.floatQueue.push(bx + ix * 4, y0 + 2, bz + iz * 4, 1);
      this.crush(c, bx, bz, wide + 3);
      if (Math.hypot(bx - P.x, bz - P.z) < 130) {
        g.particles.debris(bx, y0 + 2, bz, sample, 5, 7);
        g.particles.dust(bx, y0 + 2, bz, 5, 3);
        if (rand() < .3) g.audio.collapse(bx, y0 + 2, bz, .3);
      }
    }
  }

  // Nobody keeps standing on a walkway that has gone from under them.
  crush(c, x, z, r) {
    const N = this.g.npcs;
    for (const n of N.camps[c.id].npcs.slice()) {
      if (n.dead || n.kind !== 'guard' || n.y < STREET_Y + 3) continue;
      if (Math.abs(n.x - x) < r && Math.abs(n.z - z) < r) N.hurt(n, 99999);
    }
  }

  // A camp going under gets taken apart, and stays that way. Where the crowd is thickest, walls cave in and roofs come down.
  // A camp that fell with nobody watching has all of that waiting for you when you get there.
  wreck(c, s, dt) {
    const g = this.g;
    if (!g.npcs.camps[c.id].active) return;
    if (s.evac || s.collapseT > 0 || s.status === 'overrun') this.flagsGo(c, s, dt);
    // Any real crowd inside does damage. A last stand does a lot more, and it peaks once the gates are open.
    const going = s.status === 'holding' && s.real && s.inside >= 30;
    if (!going && !(s.ruinDebt > 0)) return;
    const rate = !going ? 9 : s.evac ? 6 + Math.min(4, s.inside / 120) : s.collapseT > 0 ? 5 + Math.min(3, s.inside / 150) : s.fatal ? 1.5 + Math.min(2.5, s.inside / 200) : Math.min(1.2, s.inside / 250);
    s.wreckT = (s.wreckT || 0) + dt * rate;
    while (s.wreckT >= 1) {
      s.wreckT -= 1;
      const done = this.wreckOne(c, s, going);
      if (!going && done) s.ruinDebt--;
      if (!going && done === null) { s.wreckT = 0; return; }   // not loaded yet: wait till it is
    }
  }

  wreckOne(c, s, going) {
    const g = this.g, W = g.world, P = g.player, hot = going ? g.npcs.camps[c.id].hot : null;
    // The outer wall is left out of this until the camp is finished. People will be back to fix anything else, if it holds.
    const edge = s.evac || s.collapseT > 0 || s.status !== 'holding' ? 0 : 7;
    const mend = s.status === 'holding' && !s.evac && !s.fatal && !(s.collapseT > 0);
    for (let t = 0; t < 10; t++) {
      let x, z;
      if (hot && hot.length && rand() < .85) {
        const h = hot[Math.floor(rand() * hot.length)];
        x = Math.floor(h.x + (rand() - .5) * 16); z = Math.floor(h.z + (rand() - .5) * 16);
      } else {
        x = Math.floor(c.x0 + rand() * (c.x1 - c.x0)); z = Math.floor(c.z0 + rand() * (c.z1 - c.z0));
      }
      if (x < c.x0 + edge || x >= c.x1 - edge || z < c.z0 + edge || z >= c.z1 - edge) continue;
      if (Math.abs(x - P.x) < 5 && Math.abs(z - P.z) < 5) continue;
      if (!W.isLoaded(x, STREET_Y + 2, z)) return null;
      const r = 1.3 + rand() * 1.7, low = STREET_Y + Math.ceil(r);
      // Whatever stands here, somewhere from waist height up, and never into the ground under it.
      let y = -1;
      for (let k = 0, from = low + Math.floor(rand() * 7); k < 8; k++) if (W.get(x, from + k, z)) { y = from + k; break; }
      if (y < 0) continue;
      const out = W.explode(x, y, z, r, 34);
      if (!out.length) continue;
      if (mend) for (let k = 0; k < out.length; k += 4) this.noteBroken(out[k], out[k + 1], out[k + 2], out[k + 3]);
      if (edge === 0 && y > STREET_Y + 4) this.crush(c, x, z, r + 2);
      if (Math.hypot(x - P.x, z - P.z) < 110) {
        g.particles.debris(x, y, z, out[3], 3, 6);
        g.particles.dust(x, y, z, 3, 2);
        if (rand() < .25) g.audio.collapse(x, y, z, .22);
      }
      return true;
    }
    return false;
  }

  // Damage done while nobody was looking takes physical form once the player can see it.
  applyWallDebt(c, s) {
    if (s.wall < 75 && !s.breaches.length) s.wallDebt = Math.ceil((100 - s.wall) / 28);
    while (s.wallDebt > 0) {
      s.wallDebt--;
      const side = this.freeSide(s, Math.floor(rand() * 4));
      if (!side) { s.wallDebt = 0; break; }
      const horiz = side === 'N' || side === 'S';
      const lo = (horiz ? c.x0 : c.z0) + 12, hi = (horiz ? c.x1 : c.z1) - 12;
      if (!this.carve(c, s, side, Math.floor(lo + rand() * (hi - lo)), true)) { s.wallDebt = 0; break; }
    }
  }

  // --- Pressure and breaches ----------------------------------------------------------------------
  // A crowd that got through while nobody was counting: into the camp behind each hole.
  floodIn(c, s, n) {
    const H = this.g.horde, W = this.g.world;
    n = Math.min(n, 260);
    for (let k = 0; k < n * 3 && n > 0 && s.breaches.length; k++) {
      const b = s.breaches[k % s.breaches.length], ix = b.side === 'W' ? 1 : b.side === 'E' ? -1 : 0, iz = b.side === 'N' ? 1 : b.side === 'S' ? -1 : 0;
      const d = 8 + rand() * 34, side = (rand() - .5) * 34;
      const x = Math.floor(b.x + ix * d + (iz ? side : 0)), z = Math.floor(b.z + iz * d + (ix ? side : 0));
      if (!H.campAt(x, z) || !W.walk[(x >> 1) + (z >> 1) * W.walkW]) continue;
      const i = H.spawnOne(x + .5, STREET_Y, z + .5, 1);
      if (i < 0) break;
      H.siege[i] = c.id + 1;
      s.pool = Math.max(0, s.pool - 1);
      n--;
    }
    s.inside = Math.max(s.inside, 150);
    s.fullT = 12;
  }

  // How much leaning one stretch of this wall can take, right now.
  wallHp(c, s, onGate = false) {
    const early = 1 - this.ramp();
    // Worn down by days of it: every attack that comes before the last one is properly over leaves the wall a little weaker.
    const worn = 1 - .5 * (s.wear || 0);
    return SEG_HP * (WALL_MUL[c.wall] || 1) * this.might(c) * (onGate ? .6 : 1) * worn * (s.fatal ? .75 : (.5 + .5 * this.g.director.strength(c)) * (1 + early * .9)) / Math.sqrt(this.pressure());
  }

  // Called from the guards' scan a few times a second, for each zombie pressed against the wall.
  beginPressureScan(s) { s.segCount = {}; }

  addPressure(c, s, x, z, step) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const ox = Math.abs(x - cx) - (c.x1 - c.x0) / 2, oz = Math.abs(z - cz) - (c.z1 - c.z0) / 2;
    const side = ox > oz ? (x < cx ? 'W' : 'E') : (z < cz ? 'N' : 'S');
    const t = ox > oz ? z : x;
    const b = Math.floor(t / 8);
    const key = `${side}${b}`;
    const seg = s.segs[key] || (s.segs[key] = { p: 0, side, t: b * 8 + 4 });
    // Only so many can get their weight against one stretch; the rest are just the crowd behind them.
    if ((s.segCount[key] || 0) < 40) seg.p += step * 1.15;
    s.segCount[key] = (s.segCount[key] || 0) + 1;
  }

  endPressureScan(c, s, step) {
    let max = 0;
    s.breachCd = Math.max(0, (s.breachCd || 0) - step);
    const early = 1 - this.ramp();
    for (const key in s.segs) {
      const seg = s.segs[key];
      const n = s.segCount[key] || 0;
      if (n > max) max = n;
      if (!n) { seg.p = Math.max(0, seg.p - step * 6); if (seg.p <= 0) delete s.segs[key]; continue; }
      const onGate = c.gates.some((g) => g.side === seg.side && Math.abs(g.tc - seg.t) < 8);
      const hp = this.wallHp(c, s, onGate);
      if (seg.p >= hp) {
        seg.p = hp;
        // A wall fails in a few places at a time. Once there is a way in, the crowd uses it.
        // How many holes at once: more the bigger it is, more the more worn down the place is, never more than one a side.
        const mag = s.op ? s.op.mag || 1 : 1, byMag = mag >= 8 ? 4 : mag >= 6.5 ? 3 : mag >= 5 ? 2 : 1;
        const most = s.fatal ? 4 : Math.min(4, Math.max(1 + Math.floor(this.g.day / 4), byMag) + ((s.wear || 0) > .6 ? 1 : 0));
        const crowded = s.breaches.length < Math.min(most, 1 + Math.floor(n / 14));
        if (crowded && s.breachCd <= 0 && !s.breaches.some((br) => br.side === seg.side)) {
          this.carve(c, s, seg.side, Math.floor(seg.t));
          s.breachCd = 34 / Math.sqrt(this.pressure()) * (1 + early * 1.3);
          seg.p = 0;
        }
      }
    }
    s.peak = max;
    // A deep enough crowd stops waiting and goes over the top.
    s.climbing = max >= 40 + (1 - this.ramp()) * 60;
  }

  // The next side round from this one that has no hole in it yet. Null if they all do.
  freeSide(s, from = 0) {
    for (let k = 0; k < 4; k++) {
      const side = 'NESW'[(from + k) % 4];
      if (!s.breaches.some((b) => b.side === side)) return side;
    }
    return null;
  }

  // Punch a real hole in the wall.
  carve(c, s, side, tc, silent = false) {
    // One hole to a side, so never more than four. Once a side has given way the crowd uses that.
    if (s.breaches.some((b) => b.side === side)) return false;
    s.wear = Math.min(1, (s.wear || 0) + .07);
    // Operations are planned off what the scouts report. Only a hole knocked in the wall by a really big crowd, one nobody saw coming,
    // makes an emergency of it; a smaller hole is patched and fought like any other bad afternoon.
    const crowd = (s.atWall || 0) + (s.inside || 0) + (s.pool || 0), big = 380 * Math.max(.6, this.g.horde.settings.horde || 1);
    // Only a hole knocked in now, in front of somebody. Holes put back in the wall after a load, or caught up on while nobody was there
    // (silent), are old news: they must not bring forward an operation that is due later, or call one the moment a save loads.
    if (!silent && this.now() >= (s.opGapUntil || 0) && (s.opNext || crowd >= big)) this.emergencyOp(c, s);
    const g = this.g, W = g.world;
    const horiz = side === 'N' || side === 'S';
    const lo = (horiz ? c.x0 : c.z0) + 7, hi = (horiz ? c.x1 : c.z1) - 7;
    tc = Math.max(lo, Math.min(hi, tc));
    const fixed = side === 'N' ? c.z0 : side === 'S' ? c.z1 : side === 'W' ? c.x0 : c.x1;
    const inward = side === 'N' || side === 'W' ? 1 : -1;
    const cells = [];
    const midX = horiz ? tc : fixed, midZ = horiz ? fixed : tc;
    if (!W.isLoaded(midX, STREET_Y + 1, midZ)) return false;
    // Later on it takes more of the wall with it each time.
    const grow = this.pressure() - 1, bw = BREACH_W + Math.min(4, Math.floor(grow)), bh = BREACH_H + Math.min(3, Math.floor(grow * .7));
    // Torn, not cut: highest in the middle where the weight of them went through, lower and broken towards the sides, a few bites
    // out of the wall past the edges, and a ragged top. The middle is always tall and wide enough for them to come through.
    for (let t = tc - bw - 2; t <= tc + bw + 2; t++) {
      const off = Math.abs(t - tc), u = off / (bw + .5);
      let col = u <= 1 ? bh * Math.sqrt(1 - u * u * .6) + (rand() - .5) * 2.2 : u < 1.4 ? rand() * 2.6 * (1.4 - u) / .4 : 0;
      if (off <= bw - 1) col = Math.max(col, Math.min(bh, 4));
      for (let row = 0; row < 2; row++) {
        let h = Math.round(col + (row ? (rand() - .5) * 1.6 : 0));
        if (h > 0 && rand() < .3) h++;   // a loose block knocked off the lip
        for (let y = STREET_Y; y < STREET_Y + h; y++) {
          const x = horiz ? t : fixed + inward * row, z = horiz ? fixed + inward * row : t;
          const id = W.get(x, y, z);
          if (!id) continue;
          if (W.set(x, y, z, 0)) cells.push(x, y, z, id);
        }
      }
    }
    // The crowd flattens the stakes in front of the hole too, or the rest could never get to it.
    for (let t = tc - bw - 2; t <= tc + bw + 2; t++) for (const row of [-1, -3, -4]) for (let y = STREET_Y; y < STREET_Y + 4; y++) {
      const x = horiz ? t : fixed + inward * row, z = horiz ? fixed + inward * row : t;
      const id = W.get(x, y, z);
      if (id && W.set(x, y, z, 0)) cells.push(x, y, z, id);
    }
    const st = g.npcs.camps[c.id];
    for (const gate of st.gates) {
      if (gate.def.side === side && Math.abs(gate.def.tc - tc) < 9) gate.broken = true;
    }
    s.breaches.push({ side, tc, x: midX, z: midZ, cells, t: 0 });
    this.openTally(s).breaches++;
    this.ledger(s).breaches++;
    s.wall = Math.max(0, Math.min(s.wall, 100 - 24 * s.breaches.length));
    s.drawing = true;
    s.quiet = 0;
    if (!silent) {
      for (let k = 0; k < cells.length; k += 4 * 3) g.particles.debris(cells[k], cells[k + 1], cells[k + 2], cells[k + 3], 2, 7);
      g.particles.explosion(midX + .5, STREET_Y + 2, midZ + .5, .9);
      g.particles.dust(midX, STREET_Y + 2, midZ, 8, 4);
      g.audio.collapse(midX, STREET_Y + 2, midZ, .5);
      const name = { N: 'north', S: 'south', E: 'east', W: 'west' }[side];
      const tb = this.tension(c, s);
      this.radio(c, tb >= 1 ? this.radioSwear(c, s, pickFrom([`They're in! ${cap(name)} wall, they're coming through!`, `${cap(name)} side's open! Get bodies over there, now!`, `We've got a hole on the ${name}! They're pouring in!`, `${cap(name)} wall's gone! Somebody plug it!`, `${cap(name)} wall's fucked, they're through!`]))
        : `They are through the ${name} wall! Breach on the ${name} side!`);
      if (g.player.sanctuary && g.horde.campAt(g.player.x, g.player.z) && g.horde.inCamp(g.player.x, g.player.z)?.id === c.id) g.ui.banner('The wall is breached', `The ${name} side has given way.`);
    }
    g.horde.nearDirty = true;
    return true;
  }

  // Work crews seal a breach once nothing has been near it for a while.
  repairs(c, s, step) {
    const g = this.g, H = g.horde, W = g.world;
    if (s.guards + s.folk < 30 || s.evac || s.raid || s.collapseT > 0) return;
    if (s.repairHold > 0) { s.repairHold -= step; return; }
    // There are fewer hands every week, and it shows in how long a hole stays open. With three or four sides open, everybody who can
    // lift a plank is on it, and the holes go twice as fast.
    const open = s.breaches.length, rush = open >= 4 ? 2.4 : open === 3 ? 1.8 : open === 2 ? 1.25 : 1;
    const crew = (6 + 7 * (1 - Math.min(1, g.director.strength(c)))) / rush * (1 + (s.wear || 0) * 1.2);
    for (let i = s.breaches.length - 1; i >= 0; i--) {
      const b = s.breaches[i];
      let near = 0;
      H.forRadius(b.x, b.z, 11, () => { near++; });
      b.age = (b.age || 0) + step;
      // A few stragglers only slow the crew down. It takes a real crowd in the gap to stop them, and even then not forever.
      // On the last evening nobody can get near a hole that still has anyone coming through it.
      const hurried = b.age * rush;
      let pace = !near ? 1 : near <= 6 ? .6 : near <= 20 ? (hurried > 45 ? .35 : .15) : hurried > 90 ? .2 : 0;
      if (s.fatal && near) pace = 0;
      b.t = pace ? b.t + step * pace : Math.max(0, b.t - step * .5);
      b.prog = b.t / crew;
      if (b.t >= crew) this.sealBreach(c, s, b);
    }
    this.mendHoles(c, s, step);
    this.patchUp(c, s, step);
    this.mendPost(c, s, step);
    this.mendFlags(c, s, step);
  }

  // The colours go back up the same way as the alarm: from the foot of the pole, a few blocks at a time, once it is safe to be out there.
  // A camp that is getting out, or has fallen, leaves them where they lie.
  mendFlags(c, s, step) {
    if (s.inside > 4 || s.fatal || s.collapseT > 0 || s.evac || s.status !== 'holding') return;
    const g = this.g, W = g.world, P = g.player;
    const flags = c.flagParts || (c.flagParts = c.parts.filter((p) => p.t === 'flag').map((p) => ({ p, cells: flagCells(p) })));
    for (const f of flags) {
      let any = false;
      // Anything to do at all? If not, whoever was sent goes back to what they were doing.
      const need = f.cells.some(([x, y, z, id]) => W.isLoaded(x, y, z) && W.get(x, y, z) !== id);
      if (!need) { if (f.work) g.npcs.releaseWork(c, f.p.x0, f.p.z0); f.work = 0; continue; }
      // A block every couple of seconds, and only while somebody is at the foot of the pole doing it. What fell gets cleared first.
      const work = g.npcs.workAt(c, f.p.x0, f.p.z0, step);
      if (work && this.clearDebris(c, f.p.x0, f.p.z0, f.cells)) { f.work = Math.max(0, (f.work || 0) - .5); continue; }
      f.work = Math.min(2, (f.work || 0) + step * work / 1.8);
      let budget = Math.floor(f.work);
      for (const [x, y, z, id] of f.cells) {
        if (!W.isLoaded(x, y, z)) break;
        if (W.get(x, y, z) === id) continue;
        any = true;
        if (budget <= 0) break;
        if (Math.abs(P.x - x - .5) < 1.2 && Math.abs(P.z - z - .5) < 1.2 && y >= P.y - 1 && y <= P.y + 3) continue;
        // Bottom up: nothing goes on a pole that is not there yet.
        if (y > STREET_Y + 1 && !W.get(x, y - 1, z) && W.get(f.p.x0, y, z) !== M_ALUM && x === f.p.x0) continue;
        if (W.set(x, y, z, id)) { budget--; f.work--; }
      }
      if (!any) f.work = 0;
      if (any && !work && (f.crewT = (f.crewT || 0) - step) <= 0) { f.crewT = 10; g.npcs.sendRepairCrew(c, f.p.x0, f.p.z0); }
    }
  }

  // A camp puts its alarm back up before almost anything else, once it is safe to stand out there and do it.
  mendPost(c, s, step) {
    if (s.inside > 4 || s.fatal || s.collapseT > 0) return;
    const part = c.alarmPart === undefined ? (c.alarmPart = c.parts.find((p) => p.t === 'alarm') || null) : c.alarmPart;
    if (!part) return;
    const g = this.g, W = g.world, P = g.player, cells = c.postCells || (c.postCells = alarmPostCells(part.x0, part.z0, part.x1, part.z1));
    // How much of it is missing. Past a fifth of it, the siren and the beacon are down with it until it is back up.
    let missing = 0;
    for (const [x, y, z, id] of cells) if (W.isLoaded(x, y, z) && W.get(x, y, z) !== id) missing++;
    const broken = missing > cells.length * .2;
    if (broken && !s.postBroken) this.radio(c, pickFrom(['The alarm is down. No siren until we get it back up.', 'They took the alarm out. We are deaf on the wall till it is fixed.', 'Siren is gone. Someone get that post back up.']));
    s.postBroken = broken;
    if (!missing) { if (s.postWork) g.npcs.releaseWork(c, c.post.x, c.post.z); s.postWork = 0; return; }
    // Put back by hand, a block every second and a half, while someone is at the foot of it. What fell gets cleared first.
    const work = g.npcs.workAt(c, c.post.x, c.post.z, step);
    if (work && this.clearDebris(c, c.post.x, c.post.z, cells)) { s.postWork = Math.max(0, (s.postWork || 0) - .5); return; }
    s.postWork = Math.min(2, (s.postWork || 0) + step * work / 1.4);
    let budget = Math.floor(s.postWork), any = false;
    for (const [x, y, z, id] of cells) {
      if (!W.isLoaded(x, y, z)) return;
      if (W.get(x, y, z) === id) continue;
      any = true;
      if (budget <= 0) break;
      if (Math.abs(P.x - x - .5) < 1.2 && Math.abs(P.z - z - .5) < 1.2 && y >= P.y - 1 && y <= P.y + 3) continue;   // not on top of you
      if (W.set(x, y, z, id)) { budget--; s.postWork--; }
    }
    if (!any) s.postWork = 0;
    if (any && !work && (s.postCrewT = (s.postCrewT || 0) - step) <= 0) {
      s.postCrewT = 8;
      g.npcs.sendRepairCrew(c, c.post.x, c.post.z);
    }
  }

  // The wreck of the thing, hauled off before it goes back up: rubble and the bits of it lying round its foot. A block at a time.
  clearDebris(c, x, z, cells) {
    const W = this.g.world, keep = cells.keep || (cells.keep = new Set(cells.map(([a, b, cc]) => `${a},${b},${cc}`)));
    const fx = Math.floor(x), fz = Math.floor(z);
    for (let r = 1; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
      for (let y = STREET_Y + 4; y >= STREET_Y; y--) {
        const bx = fx + dx, bz = fz + dz, id = W.get(bx, y, bz);
        if (!id || keep.has(`${bx},${y},${bz}`)) continue;
        // Only what came down: rubble, or anything the collapse itself set down here. Never a neighbour's wall.
        if (id !== M.RUBBLE && !(this.g.heapCells && this.g.heapCells.has(bx + bz * WX + y * WX * WZ))) continue;
        W.set(bx, y, bz, 0);
        this.g.particles.dust(bx + .5, y + .5, bz + .5, 1, .8);
        return true;
      }
    }
    return false;
  }

  sealBreach(c, s, b) {
    const g = this.g, H = g.horde, W = g.world;
    // Whoever is still standing in the gap when it closes is not getting out of it.
    H.forRadius(b.x, b.z, 8, (q) => { H.damage(q, 999, false, H.px[q], H.py[q], H.pz[q], false); });
    for (let k = 0; k < b.cells.length; k += 4) W.set(b.cells[k], b.cells[k + 1], b.cells[k + 2], b.cells[k + 3]);
    s.breaches.splice(s.breaches.indexOf(b), 1);
    // That stretch has been leaned on all this time. Fresh timber buys it a moment, or the hole would be back the second it shut.
    for (const key in s.segs) if (s.segs[key].side === b.side) s.segs[key].p *= .4;
    s.breachCd = Math.max(s.breachCd || 0, 12);
    for (const gate of g.npcs.camps[c.id].gates) {
      if (gate.def.side === b.side && Math.abs(gate.def.tc - b.tc) < 9) { gate.broken = false; gate.open = 1; gate.target = 0; }
    }
    s.wall = Math.min(100, s.wall + 24);
    const t = this.tension(c, s);
    this.radio(c, s.breaches.length ? (t >= 1 ? pickFrom([`Got one shut. ${s.breaches.length} more, keep going!`, `That hole's plugged. Still ${s.breaches.length} open, move!`]) : `Breach sealed. ${s.breaches.length} still open.`)
      : (t >= 1 ? this.radioSwear(c, s, pickFrom(['That\'s the last hole shut! Hold it, hold it!', 'Last one\'s boarded! Don\'t let them open another!', 'Last hole\'s shut. Thank fuck.'])) : 'That is the last breach sealed.'));
  }

  // A breach the player is standing at. near is how many are at it: nobody can work on a hole that is in use.
  breachNear(x, y, z) {
    const H = this.g.horde, c = H.inCamp(x, z, 10);
    if (!c || Math.abs(y - STREET_Y) > 6) return null;
    const s = this.state[c.id];
    if (s.status !== 'holding' || s.evac || s.collapseT > 0) return null;
    let best = null, bd = 11;
    for (const b of s.breaches) {
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) { bd = d; best = b; }
    }
    if (!best) return null;
    let near = 0;
    H.forRadius(best.x, best.z, 11, () => { near++; });
    return { c, s, b: best, near, busy: near > 2, progress: Math.max((best.hand || 0) / HAND_REPAIR, best.prog || 0) };
  }

  // Hands on. It takes a few seconds of real work, and it stops the moment anyone comes through.
  handRepair(br, dt) {
    const g = this.g, b = br.b;
    if (br.busy) return;
    b.hand = (b.hand || 0) + dt;
    b.t += dt;     // anyone already working on it gets it done that much sooner
    if ((b.handT = (b.handT || 0) - dt) <= 0) {
      b.handT = .45;
      g.audio.simple('place', b.x, STREET_Y + 2, b.z);
      g.particles.dust(b.x, STREET_Y + 2, b.z, 2, 2);
    }
    if (b.hand < HAND_REPAIR) return;
    this.sealBreach(br.c, br.s, b);
    g.dialogue.addStanding(br.c.id, 2);
    g.player.scrip += 25;
    g.audio.simple('coin');
    g.ui.toast('You sealed the breach. +25 spades', 'good');
  }

  // Blocks the dead tore out or brought down inside the wall. Somebody puts them back, once it is safe to.
  noteBroken(x, y, z, id) {
    const c = this.g.horde.inCamp(x, z, -6);
    if (!c) return;
    const s = this.state[c.id];
    if (s.status !== 'holding' || (s.broken && s.broken.length >= 8000)) return;
    (s.broken || (s.broken = [])).push(x, y, z, id);
  }

  noteCollapse(list) {
    for (let k = 0; k < list.length; k += 4) {
      const c = this.g.horde.inCamp(list[k], list[k + 2], -6);
      if (c && this.state[c.id].inside > 0) this.noteBroken(list[k], list[k + 1], list[k + 2], list[k + 3]);
    }
  }

  patchUp(c, s, step) {
    if (!s.broken || !s.broken.length || s.inside > 4 || s.fatal) return;
    const g = this.g, W = g.world, P = g.player, B = s.broken;
    // One place at a time: the crew is sent there, and it is put back around where they are standing, a block every so often.
    if (!s.patchAt || !B.length) s.patchAt = [B[B.length - 4], B[B.length - 2]];
    const [tx, tz] = s.patchAt;
    const work = g.npcs.workAt(c, tx, tz, step, 6);
    // Slower while there is fighting, and slower again when everyone is worn out.
    const mag = s.op ? s.op.mag || 1 : 1, pace = (s.drawing || mag >= 5 ? .45 : 1) * (1 - .4 * (s.wear || 0));
    s.patchWork = Math.min(4, (s.patchWork || 0) + step * 2.2 * pace * work);
    let near = false;
    for (let k = B.length - 4; k >= 0 && k >= B.length - 800 && s.patchWork >= 1; k -= 4) {
      const x = B[k], y = B[k + 1], z = B[k + 2], id = B[k + 3];
      if (Math.abs(x - tx) > 6 || Math.abs(z - tz) > 6) continue;
      near = true;
      if (W.get(x, y, z)) { B.splice(k, 4); continue; }
      // Not on top of anyone.
      if (Math.abs(P.x - x - .5) < 1.2 && Math.abs(P.z - z - .5) < 1.2 && y >= P.y - 1 && y <= P.y + 3) continue;
      if (W.set(x, y, z, id)) { B.splice(k, 4); s.patchWork -= 1; g.particles.dust(x + .5, y + .5, z + .5, 1, .6); }
    }
    // Nothing left to do there: on to the next place.
    if (!near || !B.some((v, k) => k % 4 === 0 && Math.abs(v - tx) <= 6 && Math.abs(B[k + 2] - tz) <= 6)) {
      g.npcs.releaseWork(c, tx, tz);
      s.patchAt = B.length ? [B[B.length - 4], B[B.length - 2]] : null;
      s.crewT = 0;
    }
    // Somebody walks over and does it. You can see who.
    if (s.patchAt && !work && (s.crewT = (s.crewT || 0) - step) <= 0) {
      s.crewT = 8;
      g.npcs.sendRepairCrew(c, s.patchAt[0], s.patchAt[1]);
    }
  }

  // --- Endings ----------------------------------------------------------------------------------------
  endSiege(c, s, held) {
    // Once the wall is coming down or the gates are open there is nothing left to win, however quiet it gets. This only ends one way, in fall().
    if (s.evac || s.collapseT > 0) { s.quiet = 0; return; }
    const g = this.g;
    s.drawing = false;
    s.quiet = 0;
    s.climbing = false;
    s.peak = 0;
    if (s.wave > 0 && s.real) this.radio(c, s.op ? 'That is the last of this lot. Stay close, we are not done.' : 'That is the last of them. Stand down.');
    s.wave = 0;
    // Far away, this is what it cost when they counted up. If you were there, you saw most of what it cost.
    this.applyHarm(c, s, s.harmLeft * (s.real ? .3 : .8));
    s.harm = 0; s.harmLeft = 0; s.major = false;
    this.closeTally(c, s, 'held');
  }

  fall(c, s) {
    const g = this.g;
    const refuge = this.refugeFor(c), wasReal = s.real && g.npcs.camps[c.id].active;
    // Everyone who got through a gate is somewhere on the road now. If you were here, you saw exactly how many. If not, it is an estimate.
    const gotOut = wasReal ? Math.max(10, g.npcs.stillRunning(c.id) + (s.outOfSight || 0)) : Math.max(10, s.folk * .6 + 8);
    s.outOfSight = 0;
    if (refuge) g.director.flee(c, refuge, gotOut);
    this.openTally(s).gotOut = gotOut;
    this.closeTally(c, s, 'fell');
    s.status = 'overrun';
    // Nothing keeps them out now. The streets round it have been full for days; the dead spread in and the place fills like any other block.
    if (g.horde.fillRuin) g.horde.fillRuin(c);
    s.pool = 0;
    s.drawing = false;
    s.climbing = false;
    s.guards = 0;
    s.folk = 0;
    s.fatal = false; s.evac = false; s.collapseT = 0; s.major = false; s.raid = null; s.harm = 0; s.harmLeft = 0;
    // Nobody is coming back to fix any of it. Whatever the crowd has not got to yet, it will.
    s.broken = null;
    s.ruinDebt = Math.round((c.x1 - c.x0) * (c.z1 - c.z0) / (wasReal ? 420 : 170));
    s.infest = Math.round((140 + rand() * 180) * Math.min(3, Math.max(.6, g.horde.settings.horde)));
    s.clearT = 0;
    s.wave = 0;
    this.radio(c, 'They are everywhere! Get out, get out, everybody get...', c.name, true, true);
    if (this.known(c)) {
      setTimeout(() => g.ui.banner(`${c.name} has fallen`, 'The radio has gone quiet. It would take a lot of work to clear it now.'), 1500);
      g.audio.simple('beep');
    }
    // The named cast either die with the camp or run for the nearest one still standing.
    const lore = LORE[c.key];
    for (const m of lore.cast) {
      if (this.dead[m.id] || this.refugees.some((r) => r.id === m.id)) continue;
      if (rand() < .55 || !refuge) this.dead[m.id] = true;
      else {
        this.refugees.push({ id: m.id, key: c.key, at: refuge.id });
        if (!this.passing && this.known(c)) g.ui.toast(`${m.name} made it out, and is sheltering at ${refuge.name}.`);
      }
    }
    // The notice stays up a little while after, in red, so it is plain what just happened.
    if (s.op) s.opFailed = { name: s.op.name, until: this.now() + .25 };
    this.closeOp(c, s, false);
    s.opNext = null;
    g.jobs.campFell(c);
    if (g.player.home === c.id) {
      g.jobs.startMigrate(c, refuge);
      g.player.home = -1;
    }
    g.horde.campStatusChanged();
    g.npcs.campFell(c, refuge);
    g.refreshCityLights();
  }

  refugeFor(c) { return refugeCandidates(this.g, c)[0] || null; }

  // --- Raids --------------------------------------------------------------------------------------
  // A big crew comes over the wall for what is in the stores. Nobody expects it to take the camp, least of all them.
  startRaid(id, size) {
    const g = this.g, c = g.layout.camps[id], s = this.state[id];
    const dir = rand() * Math.PI * 2, side = 'NESW'[Math.floor(((dir + Math.PI * .25) / (Math.PI * 2)) * 4 + 4) % 4];
    s.raid = { size, left: size, side, dir, t: 90 + rand() * 60, spawned: false, shots: 0, blown: false, out: false };
    this.openTally(s).raid = true;
    s.drawing = true;
    s.quiet = 0;
    const lore = LORE[c.key], who = lore.cast.find((m) => m.role === 'leader');
    this.radio(c, `Raiders at the ${sideOf(dir)} wall! Masks, the lot of them. They are not here for us, they are here for the stores.`, this.dead[who.id] ? c.name : who.name);
  }

  updateRaid(c, s, dt) {
    const g = this.g, R = s.raid;
    R.t -= dt;
    if (s.real) {
      if (!R.spawned) g.npcs.spawnRaid(c, s);
      const alive = g.npcs.raidCount(c.id);
      if (R.spawned && (R.t <= 0 || alive < R.size * .4) && !R.out) {
        R.out = true;
        g.npcs.raidRetreat(c.id);
        this.radio(c, 'They are pulling back! They are running!');
      }
      if (R.out && (alive === 0 || R.t < -60)) this.endRaid(c, s);
      return;
    }
    if (R.t <= 0) {
      // Far away it comes down to the count, afterwards.
      this.applyHarm(c, s, .005 + rand() * .01);
      R.shots = Math.max(R.shots, 40 + rand() * 260);
      this.endRaid(c, s);
    }
  }

  endRaid(c, s) {
    const g = this.g, R = s.raid;
    s.raid = null;
    if (!s.real && s.pool <= 0) this.endSiege(c, s, true);
    // Twenty rifles going for three minutes carries for miles. Everything that heard it comes to see.
    const odds = Math.min(.6, .12 + R.shots / 2500);
    if (rand() < odds) {
      s.cascadeT = 40 + rand() * 70;
      s.cascadeSize = Math.round((120 + Math.min(300, R.shots)) * Math.pow(g.horde.settings.horde, .8) * Math.pow(this.pressure(), .6) * (.6 + .4 * this.ramp()));
      this.radio(c, 'That was a lot of noise. Get back on the wall, something is going to have heard that.');
    }
  }

  // Cascades: the crowd that heard the shooting.
  updateCascades(dt) {
    for (const c of this.g.layout.camps) {
      const s = this.state[c.id];
      if (!s.cascadeT || s.status !== 'holding') continue;
      s.cascadeT -= dt;
      if (s.cascadeT <= 0) {
        s.cascadeT = 0;
        if (s.pool <= 0) this.startWave(c.id, s.cascadeSize, { harm: .012 + rand() * .012 });
      }
    }
  }

  // Night fights get lit. Someone on the wall sends up a flare, and for half a minute you can see all of it.
  updateFlares(dt) {
    const g = this.g, night = g.renderer.sky.night, list = this.flares;
    for (const c of g.layout.camps) {
      const s = this.state[c.id];
      if (!s.real || !s.drawing || s.status !== 'holding' || night < .3 || (s.peak < 6 && s.inside < 3 && !s.raid)) continue;
      s.flareT -= dt;
      if (s.flareT > 0 || list.length >= 3) continue;
      s.flareT = 7 + rand() * 11;
      // Up from the side they came from, out over the crowd.
      const a = s.dir + (rand() - .5) * 1.1, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2, ux = Math.sin(a), uz = -Math.cos(a);
      const d = Math.min(hx / (Math.abs(ux) + .001), hz / (Math.abs(uz) + .001)) + 10 + rand() * 24;
      const x = c.cx + ux * d, z = c.cz + uz * d;
      list.push({ x, y: STREET_Y + c.H + 3, z, vy: 20 + rand() * 6, t: 0, life: 24 + rand() * 8, red: rand() < .35, sx: (rand() - .5) * .9, sz: (rand() - .5) * .9 });
      g.audio.simple('pump', x, STREET_Y + c.H, z);
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.t += dt;
      if (f.t > f.life) { list.splice(i, 1); continue; }
      f.vy = f.vy > -1.1 ? f.vy - dt * 9 : -1.1;   // up fast, then down slowly on its little parachute
      f.y += f.vy * dt;
      f.x += f.sx * dt;
      f.z += f.sz * dt;
      const k = Math.min(1, f.t / 1.2) * Math.min(1, (f.life - f.t) / 3) * (.85 + Math.sin(g.time * 23 + f.life) * .08 + rand() * .07);
      const r = f.red ? 1 : .95, gg = f.red ? .32 : .86, b = f.red ? .2 : .62;
      g.queueLight(f.x, f.y, f.z, 72, r * 6.5 * k, gg * 6.5 * k, b * 6.5 * k);
      g.particles.sprite(2, f.x, f.y, f.z, 0, 0, 0, 1.1 + rand() * .3, 0, r * 7, gg * 7, b * 7, .9 * k, .05);
      if (rand() < dt * 18) g.particles.sprite(0, f.x, f.y, f.z, 0, 1, 0, .4, 1.6, .5, .45, .42, .22, 3);
    }
  }

  // A fallen camp stays full of the dead until somebody clears it out.
  updateRuin(c, s, dt) {
    const g = this.g, H = g.horde, P = g.player, W = g.world;
    if (!s.real) return;
    if (s.infest > 0 && s.inside < 130) {
      for (let t = 0; t < 8 && s.infest > 0; t++) {
        const x = Math.floor(c.x0 + 6 + rand() * (c.x1 - c.x0 - 12)), z = Math.floor(c.z0 + 6 + rand() * (c.z1 - c.z0 - 12));
        if (!W.walk[(x >> 1) + (z >> 1) * W.walkW] || Math.hypot(x - P.x, z - P.z) < 26) continue;
        const i = H.spawnOne(x + .5, STREET_Y, z + .5);
        if (i >= 0) { s.infest--; s.inside++; }
      }
    }
    // Clear it completely and hold it for a moment, and people will take the chance to come back.
    const onSite = H.campAt(P.x, P.z, 40);
    if (s.infest <= 0 && s.inside === 0 && onSite) {
      s.clearT += dt;
      if (s.clearT > 8) this.retaken(c, s);
    } else s.clearT = 0;
  }

  retaken(c, s) {
    const g = this.g;
    s.status = 'resettling';
    s.ruinDebt = 0;
    s.flagFate = null;
    s.resettle = 150;
    g.director.resettled(c);
    g.dialogue.addStanding(c.id, 25);
    g.player.rep = Math.min(100, g.player.rep + 10);
    g.player.discovered[c.id] = true;
    g.ui.banner(`${c.name} is clear`, 'You did it. Word is going out. People will start coming back.');
    g.audio.simple('coin');
    this.logNews({ kind: 'radio', campId: c.id, who: 'Unknown', text: `Is that true about ${c.name}? We are on our way.` });
    g.ui.radio('Unknown', `Is that true about ${c.name}? We are on our way.`);
  }

  resettled(c, s) {
    const g = this.g;
    s.status = 'holding';
    s.guards = Math.round(c.guards.length * .35);
    s.folk = Math.round(c.folk * .4);
    s.ammo = 45;
    s.wall = Math.min(s.wall, 55);
    this.refugees = this.refugees.filter((r) => r.key !== c.key);
    g.refreshCityLights();
    g.npcs.deactivateCamp(c);
    // The new arrivals rehang the doors: mark them open so the gates swing shut on their next update.
    for (const gate of g.npcs.camps[c.id].gates) { gate.broken = false; gate.ruinOpen = false; gate.open = 1; gate.target = 0; }
    this.radio(c, `${c.name} is back on the air. We are few, but we are here.`);
  }

  statusLine(id) {
    const s = this.state[id];
    if (s.status === 'overrun') return 'Overrun';
    if (s.status === 'resettling') return 'Resettling';
    if (s.evac) return 'Falling';
    if (s.raid) return 'Raiders inside';
    if (s.inside > 3) return 'Fighting inside the wall';
    if (s.breaches.length) return 'Breached';
    if (s.pool > 0 || s.peak > 3) return 'Under attack';
    if (s.ammo < 25) return 'Low on ammunition';
    if (s.guards < this.g.layout.camps[id].guards.length * .5) return 'Short of guards';
    if (s.rebuildUntil > this.g.day + this.g.tod) return 'Rebuilding';
    if (s.folk < this.g.layout.camps[id].folk * .55) return 'Losing people';
    return 'Holding';
  }

  report(id) {
    const s = this.state[id], c = this.g.layout.camps[id];
    const g = Math.round(s.guards), a = Math.round(s.ammo);
    if (s.inside > 0) return `They are inside! ${s.inside} at least. Stop talking and start shooting!`;
    if (s.breaches.length) return `We have ${s.breaches.length} ${s.breaches.length > 1 ? 'holes' : 'hole'} in the wall, and ${g} guards trying to cover them. Crews go out the moment it is quiet.`;
    if (s.pool > 0 || s.peak > 3) return `We are under attack. ${g} on the wall. Ammunition is at ${a} percent. If you can shoot, get up there.`;
    const tally = Math.round(s.tally);
    const base = tally > 0 ? `The wall has put down ${tally.toLocaleString('en-US')} of them lately.` : 'Quiet for now. I do not trust quiet.';
    const lack = a < 40 ? ` We are down to ${a} percent on ammunition, though, and I do not like it.` : g < c.guards.length * .6 ? ` We have only ${g} guards left to cover the whole wall.` : ` ${g} on the wall, ${a} percent on ammunition.`;
    const left = this.g.director.strength(c);
    const mood = left < .35 ? ' I will not lie to you. We have maybe one more of these in us.' : left < .6 ? ' Every fight costs us people we are not getting back. Families have started to leave.' : '';
    return base + lack + mood;
  }

  toSave() {
    // Bodies are not saved, only numbers. Whoever is in this fight goes back on the list of those still to come, or they would
    // wake up as idle strangers all over the neighbourhood and the battle would just stop.
    const H = this.g.horde, at = this.state.map(() => 0), inn = this.state.map(() => 0);
    for (let i = 0; i < H.n; i++) {
      const id = H.siege[i] - 1;
      if (id < 0 || H.hp[i] <= 0 || this.state[id].status !== 'holding') continue;
      const here = H.inCamp(H.px[i], H.pz[i], 0);
      if (here && here.id === id) inn[id]++; else at[id]++;
    }
    const state = this.state.map((s, k) => {
      if (!at[k] && !inn[k]) return s;
      // A real crowd already through a hole goes back where it was. A few, or nowhere to put them, come round again from outside.
      const through = s.breaches.length && inn[k] >= 30 ? inn[k] : 0;
      return { ...s, pool: s.pool + at[k] + inn[k] - through, resumeInside: through };
    });
    return { state, elapsed: this.elapsed, dead: this.dead, refugees: this.refugees, lastReport: this.lastReport, news: this.news, opNames: this.opNames, lastCamp: this.lastCamp };
  }

  fromSave(d) {
    if (!d) return;
    this.state = d.state;
    this.lastReport = d.lastReport || null;
    this.news = d.news || [];
    this.elapsed = d.elapsed;
    this.dead = d.dead || {};
    this.refugees = d.refugees || [];
    this.opNames = d.opNames || [];
    this.lastCamp = d.lastCamp ?? -1;
    for (let id = 0; id < this.state.length; id++) {
      const s = this.state[id];
      // A fallen settlement's ground holds its share of the dead again (it is not kept in the save).
      if (s.status === 'overrun' && this.g.horde.fillRuin) this.g.horde.fillRuin(this.g.layout.camps[id], true);
      s.inside = 0; s.real = false; s.segs = {}; s.openGates = 0;
      // A save from before there were operations: a big fight already under way is one now.
      // (Only saves that old: they have no operation names. In anything newer a breach with no operation is just a breach.)
      if (d.opNames === undefined && !s.op && s.status === 'holding' && ((s.drawing && s.major) || s.breaches.length || s.evac || s.fatal)) this.openOp(this.g.layout.camps[id], s, true);
      // The crowd takes a few seconds to walk back up to the wall. Nobody gets to brick up the holes in that time.
      s.repairHold = s.pool > 0 || s.resumeInside > 0 ? 12 : 0;
      if (s.raid) s.raid.spawned = false;
    }
  }
}
