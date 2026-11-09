import { STREET_Y } from '../shared/constants.js';

const rand = Math.random;
const EDGES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// Water coming off things: the edge of a tent, a pole, an awning, the lip of a roof that has nothing under it.
// Heavy while it rains and a slow patter for a few minutes after, as everything that got wet runs dry.
// Edges are found from the rain map, a patch at a time, and only near you.
export class Drips {
  constructor(g) {
    this.g = g;
    this.spots = [];
    this.findT = 0;
    this.landing = [];
  }

  clear() {
    this.spots.length = 0;
    this.landing.length = 0;
  }

  update(dt, cam) {
    const g = this.g, w = g.weather, fx = g.particles;
    // Once it stops, what is left is half as much and half as bright, and thins out from there as things dry: otherwise it looks like it is still raining.
    const raining = Math.min(1, w.rain / .25), vis = .5 + .5 * raining;
    // A light shower makes for a patter off the edges, not a steady run; a downpour is as heavy as ever.
    const rate = Math.max(w.rain > .04 ? .7 + w.rain * 6.7 : 0, w.wet * .52);
    if (g.settings.drips) this.bodies(dt, cam);
    if (!g.settings.drips || rate < .03) { this.clear(); return; }
    if ((this.findT -= dt) <= 0) { this.findT = .7; this.find(cam); }
    let made = 0;
    for (const s of this.spots) {
      if (made >= 150 || rand() >= rate * s.k * dt) continue;
      made++;
      const a = .08 + rand() * .84, x = s.x + s.ax * a, z = s.z + s.az * a;
      const v = 8 + rand() * 3, fall = s.y - s.land, life = fall / v;
      // Thicker the further off it is, as the rain is, so a drip across the yard is still a line and not nothing.
      // Past arm's length they thin out: a few blocks off they should be a hint, not a curtain.
      const far = Math.hypot(x - cam.x, s.y - cam.y, z - cam.z), fade = 1 - .6 * Math.min(1, Math.max(0, (far - 4) / 12));
      const col = this.colour(x, (s.y + s.land) / 2, z);
      fx.sprite(4, x, s.y - .1, z, 0, -v, 0, .012 + far * .0005, 0, col[0], col[1], col[2], .6 * vis * fade, life, .18);
      if (this.landing.length < 900) this.landing.push({ t: life, x, y: s.land + .04, z, far, vis: vis * fade, col });
    }
    // Where it lands, a bead of light and gone.
    for (let i = this.landing.length - 1; i >= 0; i--) {
      const d = this.landing[i];
      if ((d.t -= dt) > 0) continue;
      const col = d.col;
      // A small burst where it hits: a ring of light, and a couple of flecks thrown up and out.
      fx.sprite(2, d.x, d.y, d.z, 0, .4, 0, .05 + d.far * .003, .55, col[0] * 1.3, col[1] * 1.3, col[2] * 1.3, .42 * d.vis, .2);
      for (let k = 0; k < (d.vis > .75 ? 2 : 1); k++) {
        const sa = rand() * 6.283, sp = .8 + rand() * .9;
        fx.sprite(4, d.x, d.y + .05, d.z, Math.cos(sa) * sp, 1.3 + rand() * 1.2, Math.sin(sa) * sp, .008 + d.far * .0006, 0, col[0], col[1], col[2], .45 * d.vis, .13, .05);
      }
      this.landing[i] = this.landing[this.landing.length - 1];
      this.landing.pop();
    }
  }

  // Anyone soaked through runs with water: the odd drop off a sleeve, a hem, the end of a gun, falling to their feet. Close by only.
  bodies(dt, cam) {
    const g = this.g, fx = g.particles, H = g.horde, map = g.rainMap, w = g.weather;
    let made = 0;
    const drop = (x, y, z, top, wet, yaw) => {
      if (made >= 24 || rand() >= wet * 2.4 * dt) return;
      made++;
      const a = yaw + (rand() < .5 ? 1.5708 : -1.5708) + (rand() - .5) * .7, r = .5 + rand() * .12;
      const sx = x + Math.sin(a) * r, sz = z + Math.cos(a) * r, sy = y + top * (.45 + rand() * .35);
      const far = Math.hypot(sx - cam.x, sy - cam.y, sz - cam.z), fade = 1 - .6 * Math.min(1, Math.max(0, (far - 4) / 12));
      const col = this.colour(sx, sy, sz), v = 6.5 + rand() * 2, life = (sy - y) / v;
      fx.sprite(4, sx, sy, sz, 0, -v, 0, .009 + far * .0004, 0, col[0], col[1], col[2], .4 * fade, life, .12);
    };
    for (const n of g.npcs.list) {
      if (n.dead || !(n.wet > (n.underRoof ? .45 : .2))) continue;
      const dx = n.x - cam.x, dz = n.z - cam.z;
      if (dx * dx + dz * dz > 18 * 18) continue;
      drop(n.x, n.y, n.z, n.kid ? 1.5 : 2.2, n.wet, n.yaw || 0);
    }
    // The dead are as wet as the weather makes anyone out in it, and none of them are ever indoors by choice.
    const soak = Math.min(1, Math.max(w.rain * 1.4, w.wet * .5));
    if (soak > .2) H.forRadius(cam.x, cam.z, 16, (i) => {
      if (made >= 24) return;
      const x = H.px[i], y = H.py[i], z = H.pz[i], top = map ? map.at(x, z) : -1;
      if (top >= 0 && top >= y + 2.2) return;
      drop(x, y, z, 2.3, soak, H.yaw[i]);
    });
  }

  // Only as bright as the light where it falls: the sky by day, the camp's lamps and fires, anything burning close by, and your own torch.
  // A drop in the dark is a dark drop, a dim thread like the rain around it, not nothing: it does not blink out when the torch goes off.
  colour(x, y, z) {
    const r = this.g.renderer, s = r.sky, night = s.night || 0, day = 1 - night * .9;
    const L = r.lightAt(x, z), f = s.fog || [.1, .1, .1], k = s.skyCol || [.1, .1, .1];
    // Water picks up whatever light is going: a lamp across the yard is enough to show a drip.
    let cr = (f[0] * 1.4 + k[0] * .3) * day + L[0] * 1.15, cg = (f[1] * 1.4 + k[1] * .3) * day + L[1] * 1.15, cb = (f[2] * 1.4 + k[2] * .3) * day + L[2] * 1.15;
    for (let i = 0; i < (r.lightCount || 0); i++) {
      const o = i * 4, dx = r.lightPos[o] - x, dy = r.lightPos[o + 1] - y, dz = r.lightPos[o + 2] - z, rad = r.lightPos[o + 3];
      const d = Math.hypot(dx, dy, dz);
      if (d >= rad) continue;
      const a = (1 - d / rad) ** 1.4;
      cr += r.lightCol[i * 3] * a * 1.1; cg += r.lightCol[i * 3 + 1] * a * 1.1; cb += r.lightCol[i * 3 + 2] * a * 1.1;
    }
    if (r.spot > 0 && r.camPos) {
      const vx = x - r.camPos[0], vy = y - r.camPos[1], vz = z - r.camPos[2], d = Math.hypot(vx, vy, vz) || 1;
      const c = (vx * r.camForward[0] + vy * r.camForward[1] + vz * r.camForward[2]) / d;
      if (c > .86 && d < 40) { const t = r.spot * Math.min(1, (c - .86) / .1) / (1 + d * d * .014) * 1.4; cr += t; cg += t * .95; cb += t * .86; }
    }
    // Right under a lamp they glint, but they are still water, not sparks.
    const top = Math.max(cr, cg, cb), cap = top > 1.1 ? 1.1 / top : 1;
    // The floor the rain has at night, a little under it, and it gives way as soon as there is real light on the drop.
    const fl = (r.rainFloor || 0) * .7 * Math.max(0, 1 - top / .25);
    return [cr * cap + .002 + fl * .74, cg * cap + .002 + fl * .82, cb * cap + .003 + fl];
  }

  find(cam) {
    const g = this.g, m = g.rainMap, R = 38, out = [];
    const cx = Math.floor(cam.x), cz = Math.floor(cam.z);
    for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
      const i = m.index(x, z);
      if (i < 0 || !m.hang[i]) continue;
      const y = m.top[i];
      if (y <= STREET_Y || y > cam.y + 26) continue;
      // Each open side is an edge of its own: the beside column is well below, so the water drops off this side and lands on whatever is down there.
      // A step down of one or two is just the roof going on; the water runs over it, not off it.
      for (const [dx, dz] of EDGES) {
        const nt = m.at(x + dx, z + dz);
        if (nt < 0 || nt >= y - 2) continue;
        const land = nt + 1;
        if (y - land < 2 || y - land > 40) continue;
        // A line just outside the face, running along it: start corner and direction.
        const sx = dx > 0 ? x + 1.03 : dx < 0 ? x - .03 : x, sz = dz > 0 ? z + 1.03 : dz < 0 ? z - .03 : z;
        out.push({ x: sx, z: sz, ax: dx ? 0 : 1, az: dz ? 0 : 1, y, land, k: .35 + rand() * 1.1 });
      }
    }
    // Plenty is plenty. Keep a spread of them rather than the first few rows.
    while (out.length > 600) { const j = Math.floor(rand() * out.length); out[j] = out[out.length - 1]; out.pop(); }
    this.spots = out;
  }
}
