// Camp dogs. Mechanically about as simple as anything here: they live inside a camp's wall and nowhere else, about half of them belong
// to somebody and go where that person goes, and the rest wander about, nap, go and get made a fuss of, and run about after the kids.
// They are not in any fight: when the camp empties or falls, they are gone with it.

import { STREET_Y } from '../shared/constants.js';
const NAMES = ['Biscuit', 'Rex', 'Bella', 'Scout', 'Max', 'Daisy', 'Bones', 'Pepper', 'Rocky', 'Luna', 'Duke', 'Rosie', 'Tank', 'Bailey',
  'Shadow', 'Penny', 'Buster', 'Ginger', 'Ziggy', 'Molly', 'Chief', 'Hazel', 'Otis', 'Mabel', 'Bandit', 'Sergeant', 'Pickles', 'Dottie'];
const PET_LINES = ['Hey, buddy.', 'Who is a good dog?', 'There you are.', 'Hello, trouble.', 'Go on, then. Just one scratch.', 'Look at you.'];
const rand = Math.random;
const pick = (a) => a[Math.floor(rand() * a.length)];

export class Dogs {
  constructor(g) {
    this.g = g;
    this.list = [];
    this.camps = new Set();
  }

  reset() { this.list.length = 0; this.camps.clear(); }

  update(dt) {
    const g = this.g, N = g.npcs;
    for (const c of g.layout.camps) {
      const st = N.camps[c.id], S = g.campSim.state[c.id];
      const live = st && st.active && S.status === 'holding' && !S.evac && !(S.collapseT > 0);
      if (live && !this.camps.has(c.id)) this.populate(c, st);
      else if (!live && this.camps.has(c.id)) { this.list = this.list.filter((d) => d.camp !== c.id); this.camps.delete(c.id); }
    }
    for (const d of this.list) this.step(d, dt);
  }

  populate(c, st) {
    this.camps.add(c.id);
    // Nobody laid up in the doctor's tent has a dog at their heels.
    const adults = st.npcs.filter((n) => n.kind === 'resident' && !n.kid && !n.dead && !n.patient);
    const count = Math.max(3, Math.min(9, Math.round(c.folk / 45)));
    const used = new Set(), names = NAMES.slice().sort(() => rand() - .5);
    for (let i = 0; i < count; i++) {
      let owner = null;
      if (rand() < .5 && adults.length) {
        for (let t = 0; t < 6 && !owner; t++) { const a = pick(adults); if (!used.has(a)) owner = a; }
        if (owner) used.add(owner);
      }
      const at = owner || pick(c.pois.filter((p) => p.kind !== 'sleep')) || c.spots.plaza;
      // On open ground, not inside a wreck or a stall's post.
      const [x, z] = this.openNear(c, at.x + (rand() - .5) * 3, at.z + (rand() - .5) * 3) || [c.spots.plaza.x, c.spots.plaza.z];
      const name = names[i % names.length];
      this.list.push({
        camp: c.id, owner, name, x, z, y: STREET_Y, yaw: rand() * 6.283, ys: 0, phase: rand() * 6,
        v: 0, state: 0, variant: 192 + Math.floor(rand() * 64), side: rand() < .5 ? -1 : 1, t: rand() * 8, rest: 0, tx: x, tz: z, mode: 'idle',
      });
    }
  }

  // The nearest place a dog can stand, out to a few blocks.
  openNear(c, x, z) {
    if (this.open(c, x, z)) return [x, z];
    for (let r = 1; r <= 6; r++) for (let a = 0; a < 12; a++) {
      const px = x + Math.cos(a * .5236) * r, pz = z + Math.sin(a * .5236) * r;
      if (this.open(c, px, pz)) return [px, pz];
    }
    return null;
  }

  // Can a dog stand here: walkable for people in that camp, the same test the residents use, and nothing solid in the block itself:
  // the walking map is two blocks to a square, and a crate or the corner of a stall can sit in half of one.
  open(c, x, z) {
    const w = this.g.world, fx = Math.floor(x), fz = Math.floor(z);
    if (w.solid(fx, STREET_Y, fz) || w.solid(fx, STREET_Y + 1, fz)) return false;
    if (!c.nav) return true;
    const cx = (fx - c.x0) >> 1, cz = (fz - c.z0) >> 1;
    if (cx < 0 || cz < 0 || cx >= c.navW || cz >= c.navD) return false;
    return !c.nav[cx + cz * c.navW];
  }

  step(d, dt) {
    const g = this.g, c = g.layout.camps[d.camp], P = g.player, w = g.world;
    const panic = g.npcs.campPanic(c);
    const o = d.owner && !d.owner.dead && d.owner.camp === d.camp && !d.owner.flee ? d.owner : null;
    // Ended up somewhere it cannot stand (a crate put down on it, a wreck pushed over it): out onto the nearest open ground.
    if (!this.open(c, d.x, d.z)) { const q = this.openNear(c, d.x, d.z); if (q) { d.x = q[0]; d.z = q[1]; d.y = STREET_Y; d.path = null; } }
    if (d.owner && !o) d.owner = null;
    let settle = 0;   // what to do when it gets there: 0 stand about, 5 sit, 7 lie down
    if (d.petT > 0) {
      // Being made a fuss of: sat facing whoever it is, tail going.
      d.petT -= dt;
      const who = d.petBy;
      if (who) d.yaw = Math.atan2(who.x - d.x, who.z - d.z);
      d.v = 0; d.state = 5; d.ys = this.ease(d.ys, d.yaw, dt * 6);
      return;
    }
    if (o) {
      // Sticks with its person: just behind and to one side while they walk, close by when they stop.
      const moving = !o.arrived || (o.state > .5 && o.state < 2);
      const back = moving ? 1.6 : .9, side = moving ? 1.1 : 1.3;
      const sy = Math.sin(o.yaw || 0), cy = Math.cos(o.yaw || 0);
      const nx = o.x - sy * back + cy * side * d.side, nz = o.z - cy * back - sy * side * d.side;
      // Only a new spot once the old one is really out of place: a person turning on the spot does not send the dog back and forth.
      if (d.tx === undefined || Math.hypot(nx - d.tx, nz - d.tz) > (moving ? .8 : 1.8) || !this.open(c, d.tx, d.tz)) { d.tx = nx; d.tz = nz; }
      // Their person indoors, on a bench, somewhere a dog cannot stand: the nearest open ground beside them will do.
      if (!this.open(c, d.tx, d.tz)) {
        let best = null, bd = 1e9;
        for (let r = 1; r <= 5 && !best; r++) for (let a = 0; a < 12; a++) {
          const x = o.x + Math.cos(a * .5236) * r, z = o.z + Math.sin(a * .5236) * r;
          if (!this.open(c, x, z)) continue;
          const e = Math.hypot(x - d.x, z - d.z);
          if (e < bd) { bd = e; best = [x, z]; }
        }
        if (best) { d.tx = best[0]; d.tz = best[1]; } else { d.tx = d.x; d.tz = d.z; }
      }
      // Stuck a moment ago: it sits where it is and waits, unless they have gone a good way off.
      if (d.hold > 0) { d.hold -= dt; if (Math.hypot(o.x - d.x, o.z - d.z) < 9) { d.tx = d.x; d.tz = d.z; } else d.hold = 0; }
      settle = o.state === 5 || o.state === 7 ? 7 : (d.restPick ?? 5);
      if ((d.t -= dt) <= 0) { d.t = 8 + rand() * 14; d.restPick = rand() < .5 ? 5 : rand() < .5 ? 0 : 7; }
    } else {
      // A stray of the camp's: off somewhere, a while there, off again. Sometimes to someone for a fuss, sometimes after the kids.
      if (d.mode === 'kid' && d.kid && !d.kid.dead && d.kid.task && d.kid.task.kind === 'play') { d.tx = d.kid.x + d.side * 1.2; d.tz = d.kid.z + 1; }
      else if (d.mode === 'kid') d.mode = 'idle';
      if (d.mode === 'pet' && d.mate) {
        const m = d.mate;
        // Too long getting there (no way through the crowd or round the stall): it gives up and goes back to its own business.
        d.petTry = (d.petTry || 0) + dt;
        if (m.dead || !m.arrived || m.camp !== d.camp || d.petTry > 14) { d.mode = 'idle'; d.petTry = 0; }
        else if (!d.petSpot || Math.hypot(d.petSpot[2] - m.x, d.petSpot[3] - m.z) > .5) {
          // In front of them if it can stand there, otherwise the nearest open ground beside them; chosen once, not every step.
          let q = [m.x + Math.sin(m.yaw || 0) * 1.2, m.z + Math.cos(m.yaw || 0) * 1.2];
          if (!this.open(c, q[0], q[1])) q = this.openNear(c, m.x, m.z) || q;
          d.petSpot = [q[0], q[1], m.x, m.z];
        }
        if (d.mode === 'pet') { d.tx = d.petSpot[0]; d.tz = d.petSpot[1]; }
        if (d.mode === 'pet' && Math.hypot(d.x - d.tx, d.z - d.tz) < .9) {
          d.petTry = 0; d.petSpot = null;
          // Arrived: they stop what they are doing for a moment.
          d.petT = 5 + rand() * 5; d.petBy = m; d.mode = 'idle'; d.t = 2 + rand() * 6;
          m.petT = d.petT; m.petDog = d;
          if (Math.hypot(m.x - P.x, m.z - P.z) < 26) g.ui.floatSay(m, pick(PET_LINES), 2.4);
          return;
        }
      }
      if (d.mode === 'idle' && Math.hypot(d.x - d.tx, d.z - d.tz) < .7 && (d.t -= dt) <= 0) this.wander(d, c);
      settle = d.restPick ?? 0;
    }
    // In a panic, nobody's dog sits about: it keeps close and moving.
    if (panic > .4) settle = 0;
    const dist = Math.hypot(d.tx - d.x, d.tz - d.z);
    // Once there it stays there until the spot is a good step away, rather than stopping and starting on the edge of it.
    if (dist < .5) d.there = true; else if (dist > 1.3) d.there = false;
    const want = d.there ? 0 : dist > 7 || panic > .4 ? 4.6 : dist > 2.5 ? 2.6 : 1.4;
    d.v += (want - d.v) * Math.min(1, dt * (want > d.v ? 3 : 5));
    if (d.v > .05 && dist > .05) {
      // Straight there when it can see the way; otherwise round by the paths the people use, and it keeps to them until it is
      // clear again rather than nosing at the wall.
      const [ax, az] = this.steer(d, c, dt);
      const dx = ax - d.x, dz = az - d.z, dd = Math.hypot(dx, dz) || 1;
      const sx = dx / dd * d.v * dt, sz = dz / dd * d.v * dt, bx = d.x, bz = d.z;
      if (this.open(c, d.x + sx, d.z + sz)) { d.x += sx; d.z += sz; }
      else if (this.open(c, d.x + sx, d.z)) d.x += sx;
      else if (this.open(c, d.x, d.z + sz)) d.z += sz;
      else { d.path = null; d.repath = 0; }
      const moved = Math.hypot(d.x - bx, d.z - bz);
      // Got nowhere: it does not stand there treading the air. It stops, and after a moment gives up on that and settles.
      if (moved < 1e-4) { d.v = 0; d.stuck = (d.stuck || 0) + dt; }
      else { d.stuck = 0; d.phase += moved * 2.8; }
      if (d.stuck > 1.2) { d.stuck = 0; if (o) d.hold = 4 + rand() * 4; else if (d.mode !== 'pet') this.wander(d, c); else d.mode = 'idle'; }
      // Faces the way it actually went, and only when it actually went somewhere.
      if (moved > .004) d.yaw = Math.atan2(d.x - bx, d.z - bz);
    }
    d.state = d.v > 3.2 ? 1 : d.v > .3 ? .7 : settle;
    d.ys = this.ease(d.ys, d.yaw, dt * 5);
    if (Math.hypot(d.x - P.x, d.z - P.z) < 90) {
      // Up onto a step or a bench only where there is room to stand on top of it; never up the face of a wall, however it ended up
      // against one, and never more than a step off the ground of the camp.
      const fx = Math.floor(d.x), fz = Math.floor(d.z);
      let gy = w.groundBelow(d.x, d.y + 1.6, d.z, 6);
      if (gy > d.y + .05 && (gy - d.y > 1.1 || w.solid(fx, Math.floor(gy), fz) || w.solid(fx, Math.floor(gy) + 1, fz))) gy = d.y;
      gy = Math.min(gy, STREET_Y + 1);
      d.y += Math.sign(gy - d.y) * Math.min(Math.abs(gy - d.y), dt * 10);
    }
    if (d.y > STREET_Y + 1) d.y = STREET_Y;
  }

  // Where to head right now: the target itself if nothing is in the way, or the next point on a path round whatever is.
  steer(d, c, dt) {
    const clear = (x0, z0, x1, z1) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .4);
      for (let k = 1; k <= n; k++) if (!this.open(c, x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n)) return false;
      return true;
    };
    if (clear(d.x, d.z, d.tx, d.tz)) { d.path = null; return [d.tx, d.tz]; }
    d.repath = (d.repath || 0) - dt;
    const moved = d.path && Math.hypot(d.pgx - d.tx, d.pgz - d.tz) > 2.5;
    if (!d.path || moved || d.repath <= 0) {
      d.path = this.g.npcs.findPath(c, d.x, d.z, d.tx, d.tz);
      d.pi = 0; d.pgx = d.tx; d.pgz = d.tz; d.repath = 1.5 + rand();
      if (!d.path) return [d.tx, d.tz];
    }
    const P = d.path;
    // Skip ahead to the furthest point on the path it can already see.
    for (let k = 0; k < 6 && d.pi + 2 < P.length && clear(d.x, d.z, P[d.pi + 2], P[d.pi + 3]); k++) d.pi += 2;
    if (Math.hypot(P[d.pi] - d.x, P[d.pi + 1] - d.z) < .6 && d.pi + 2 < P.length) d.pi += 2;
    return [P[d.pi], P[d.pi + 1]];
  }

  // Somewhere else in camp to be. Now and then, someone standing about to go and see, or a child to run about with.
  wander(d, c) {
    const st = this.g.npcs.camps[c.id], r = rand();
    d.mode = 'idle';
    d.t = 6 + rand() * 18;
    d.restPick = rand() < .45 ? 7 : rand() < .5 ? 5 : 0;
    if (r < .22) {
      const kids = st.npcs.filter((n) => n.kid && !n.dead && n.task && n.task.kind === 'play' && Math.hypot(n.x - d.x, n.z - d.z) < 40);
      if (kids.length) { d.mode = 'kid'; d.kid = pick(kids); d.t = 15 + rand() * 20; return; }
    } else if (r < .42) {
      const idle = st.npcs.filter((n) => !n.kid && !n.dead && n.arrived && n.task && !(n.petT > 0) && (n.task.kind === 'stand' || n.task.kind === 'warm' || n.task.kind === 'market' || n.task.kind === 'talk') && Math.hypot(n.x - d.x, n.z - d.z) < 30);
      if (idle.length) { d.mode = 'pet'; d.mate = pick(idle); d.petTry = 0; d.petSpot = null; return; }
    }
    for (let t = 0; t < 8; t++) {
      const p = pick(c.pois);
      if (!p || p.kind === 'sleep') continue;
      const x = p.x + (rand() - .5) * 6, z = p.z + (rand() - .5) * 6;
      if (!this.open(c, x, z)) continue;
      d.tx = x; d.tz = z;
      return;
    }
  }

  ease(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= 6.2832;
    while (d < -Math.PI) d += 6.2832;
    return a + d * Math.min(1, k);
  }

  // The dog you are looking at, close enough to reach down to.
  lookAt(o, f, range) {
    let best = null, bt = range;
    for (const d of this.list) {
      const cx = d.x - o[0], cy = d.y + .6 - o[1], cz = d.z - o[2];
      const t = cx * f[0] + cy * f[1] + cz * f[2];
      if (t < 0 || t > bt) continue;
      const px = cx - f[0] * t, py = cy - f[1] * t, pz = cz - f[2] * t;
      if (px * px + py * py + pz * pz < .5 * .5) { bt = t; best = d; }
    }
    return best;
  }

  // You, reaching down. It sits for it, and the tail goes.
  pet(d) {
    const P = this.g.player;
    d.petT = 3.5; d.petBy = P;
    const whose = d.owner ? `${d.owner.name}'s dog` : 'one of the settlement dogs';
    this.g.ui.toast(pick([`You scratch ${d.name} behind the ears.`, `${d.name} leans into your hand.`, `${d.name}, ${whose}, decides you are all right.`, `${d.name} rolls an eye at you and wags.`]));
  }

  draw(A) {
    const cam = this.g.renderer.camPos, w = this.g.weather, map = this.g.rainMap;
    // Wet in the rain like everyone else, out under the sky.
    const wetBits = w ? Math.min(7, Math.round(Math.min(1, Math.max(w.rain || 0, (w.wet || 0) * .5)) * 8)) * 4096 : 0;
    for (const d of this.list) {
      const dx = d.x - cam[0], dz = d.z - cam[2];
      if (dx * dx + dz * dz > 110 * 110) continue;
      let wet = wetBits;
      if (wet && map) { const top = map.at(d.x, d.z); if (top >= 0 && top >= d.y + 1.2) wet = 0; }
      A.pushDog(d.x, d.y, d.z, d.ys, d.phase, d.state, d.variant, wet);
    }
  }
}
