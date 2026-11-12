// A motorbike, for now only from the dev menu. Built from the same small cubes as everything else that moves, at the same scale as
// the people: square wheels, a red tank, and nothing that turns. It goes where the ground lets it: up a kerb, not up a wall.

const VS = .125;           // one voxel of the model, in blocks: the same as a person
const MAX = 17, BACK = 5;  // blocks a second, flat out forward and in reverse

// The model, in voxels: x across (right), y up from the ground, z forward. Each part [x, y, z, r, g, b, glow].
const MODEL = (() => {
  const out = [];
  const put = (x, y, z, c, glow = 0) => out.push([x, y, z, c[0], c[1], c[2], glow]);
  const TIRE = [.07, .07, .08], RIM = [.42, .43, .45], HUB = [.72, .73, .75], FRAME = [.16, .16, .18], ENGINE = [.33, .33, .35];
  const FIN = [.5, .5, .52], CHROME = [.78, .78, .8], PAINT = [.6, .12, .1], SEAT = [.09, .08, .08], GRIP = [.05, .05, .05];
  // Two square wheels, each a tyre round a rim round a hub.
  for (const zc of [-6.5, 6.5]) for (const x of [-.5, .5]) for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) {
    const edge = a === 0 || a === 5 || b === 0 || b === 5, mid = (a === 2 || a === 3) && (b === 2 || b === 3);
    put(x, a, zc - 2.5 + b, edge ? TIRE : mid ? HUB : RIM);
  }
  // Swingarm back to the rear hub, and the engine with its fins.
  for (const x of [-1.5, 1.5]) for (let z = -6; z <= -3; z++) put(x, 2.5, z, FRAME);
  for (let x = -1; x <= 1; x++) for (let y = 2; y <= 5; y++) for (let z = -2; z <= 2; z++) put(x, y, z, y === 5 && z % 2 === 0 ? FIN : ENGINE);
  // The exhaust down the right-hand side.
  for (let z = -8; z <= -1; z++) put(2, 2, z, CHROME);
  put(2, 3, -1, CHROME);
  // Tank, seat, tail.
  for (let x = -1; x <= 1; x++) for (let z = 0; z <= 3; z++) { put(x, 6, z, PAINT); put(x, 7, z, PAINT); }
  for (let z = 1; z <= 2; z++) put(0, 8, z, PAINT);
  for (let x = -1; x <= 1; x++) for (let z = -6; z <= -1; z++) put(x, 6, z, SEAT);
  for (let x = -1; x <= 1; x++) for (let z = -5; z <= -2; z++) put(x, 7, z, SEAT);
  for (let x = -1; x <= 1; x++) for (let z = -9; z <= -7; z++) put(x, 6, z, PAINT);
  put(0, 7, -9, [.9, .1, .08], .8);
  // The frame under the tank, from the engine up to the head of the forks.
  for (let z = 3; z <= 5; z++) for (let y = 5; y <= 8; y++) if (y >= 8 - (z - 3) * 1.2 || z === 5) put(0, y, z, FRAME);
  // Forks down to the front hub, leaning back as they go up.
  for (const x of [-1.5, 1.5]) for (let k = 0; k <= 7; k++) put(x, 2.5 + k, Math.round(6.5 - k * .32), CHROME);
  // Front mudguard, headlamp, handlebar and grips.
  for (const x of [-.5, .5]) for (let z = 5; z <= 8; z++) put(x, 6, z, PAINT);
  for (const x of [-.5, .5]) for (let y = 8; y <= 9; y++) put(x, y, 6, [1, .95, .78], 1.4);
  for (let x = -4; x <= 4; x++) put(x, 10, 4, x === -4 || x === 4 ? GRIP : FRAME);
  for (const x of [-5, 5]) put(x, 10, 4, GRIP);
  return out;
})();

export class Bike {
  constructor(g) {
    this.g = g;
    this.here = false;       // one has been brought out
    this.on = false;         // and you are riding it
    this.x = 0; this.y = 0; this.z = 0; this.yaw = 0; this.v = 0; this.vy = 0;
    this.cubes = new Float32Array((MODEL.length + 160) * 9);
    this.n = 0;
  }

  // Out of nowhere, right in front of you, and you on it.
  spawn() {
    const P = this.g.player;
    this.yaw = P.yaw;
    this.x = P.x + Math.sin(P.yaw) * 2; this.z = P.z - Math.cos(P.yaw) * 2;
    this.y = this.ground(this.x, this.z, P.y + 2);
    this.v = 0; this.vy = 0;
    this.here = true;
    this.mount();
  }

  mount() {
    const P = this.g.player;
    this.on = true;
    P.yaw = this.yaw; P.fly = false; P.crouch = false;
    this.seat();
  }

  // Off on the right-hand side, wherever there is room to stand.
  dismount() {
    const P = this.g.player, W = this.g.world;
    this.on = false;
    this.v = 0;
    const rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
    for (const k of [1.3, -1.3, 2.2, -2.2]) {
      const x = this.x + rx * k, z = this.z + rz * k, y = this.ground(x, z, this.y + 1.5);
      if (Math.abs(y - this.y) <= 1.5 && !W.solid(Math.floor(x), y, Math.floor(z)) && !W.solid(Math.floor(x), y + 1, Math.floor(z))) { P.x = x; P.z = z; P.y = y; break; }
    }
    P.vx = P.vy = P.vz = 0;
  }

  near(P) { return this.here && !this.on && Math.hypot(P.x - this.x, P.z - this.z) < 2.5 && Math.abs(P.y - this.y) < 2; }

  // The top of whatever is underfoot here, looking down from a little above.
  ground(x, z, from) {
    const W = this.g.world, ix = Math.floor(x), iz = Math.floor(z);
    for (let y = Math.floor(from); y > from - 8; y--) if (W.solid(ix, y, iz)) return y + 1;
    return Math.floor(from - 8);
  }

  // Throttle and brake on W and S, steer on A and D. The faster it goes the more a turn takes it round, up to a point.
  update(dt, keys) {
    const g = this.g, P = g.player, W = g.world;
    const fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), st = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    if (fw > 0) this.v += (this.v < 0 ? 22 : 9 * (1 - Math.max(0, this.v) / MAX)) * dt;
    else if (fw < 0) this.v -= (this.v > 0 ? 20 : 5) * dt;
    else this.v -= Math.sign(this.v) * Math.min(Math.abs(this.v), 3.2 * dt);
    this.v = Math.max(-BACK, Math.min(MAX, this.v));
    const turn = st * dt * 1.9 * Math.min(1, Math.abs(this.v) / 3) * Math.sign(this.v || 1) * (1 - Math.min(.45, Math.abs(this.v) / MAX * .45));
    this.yaw += turn;
    P.yaw += turn;
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const nx = this.x + fx * this.v * dt, nz = this.z + fz * this.v * dt;
    // Looked for from a block and a bit up: a kerb it rides up, a wall it does not.
    const ny = this.ground(nx + fx * .9 * Math.sign(this.v), nz + fz * .9 * Math.sign(this.v), this.y + 1.2);
    const head = W.solid(Math.floor(nx), Math.max(ny, this.y) + 1, Math.floor(nz)) || W.solid(Math.floor(nx), Math.max(ny, this.y) + 2, Math.floor(nz));
    if (ny > this.y + 1.05 || head) {
      if (Math.abs(this.v) > 9) g.audio.simple('hurt');
      this.v *= -.2;
    } else {
      this.x = nx; this.z = nz;
      const gy = this.ground(this.x, this.z, this.y + 1.2);
      if (gy >= this.y) { this.y = gy; this.vy = 0; } else { this.vy -= 26 * dt; this.y = Math.max(gy, this.y + this.vy * dt); if (this.y === gy) this.vy = 0; }
    }
    // Anything dead in the way goes down under it, if it is going fast enough to matter.
    if (Math.abs(this.v) > 5) {
      const H = g.horde;
      H.forRadius(this.x + fx * .8, this.z + fz * .8, 1.1, (i) => {
        if (Math.abs(H.py[i] - this.y) > 1.5) return;
        if (H.damage(i, 60 + Math.abs(this.v) * 25, false, H.px[i], H.py[i] + 1, H.pz[i])) P.kills++;
        g.particles.blood(H.px[i], H.py[i] + 1, H.pz[i], fx, .3, fz, 8, 4);
        this.v *= .82;
      });
    }
    this.seat();
  }

  // You go where the seat goes.
  seat() {
    const P = this.g.player;
    // Kept right on the ground under the seat, and the camera's easing over steps held still, or the walking code steps you down
    // every frame and the camera creeps off upward.
    P.x = this.x - Math.sin(this.yaw) * .3; P.z = this.z + Math.cos(this.yaw) * .3; P.y = this.y;
    P.vx = P.vy = P.vz = 0; P.onGround = true; P.eyeSmooth = -.45;   // sat down, not standing
  }

  // The model, turned and placed, and while you are riding, your hands on the grips with your arms back to your shoulders.
  build() {
    this.n = 0;
    if (!this.here) return;
    const c = this.cubes, rx = Math.cos(this.yaw), rz = Math.sin(this.yaw), fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const add = (wx, wy, wz, size, r, g, b, glow) => {
      if ((this.n + 1) * 9 > c.length) return;
      const k = this.n++ * 9;
      c[k] = wx; c[k + 1] = wy; c[k + 2] = wz; c[k + 3] = size; c[k + 4] = r; c[k + 5] = g; c[k + 6] = b; c[k + 7] = -this.yaw; c[k + 8] = -1 - glow;
    };
    const at = (x, y, z) => [this.x + (rx * x + fx * z) * VS, this.y + (y + .5) * VS, this.z + (rz * x + fz * z) * VS];
    for (const [x, y, z, r, g, b, glow] of MODEL) { const p = at(x, y, z); add(p[0], p[1], p[2], VS * 1.02, r, g, b, glow); }
    if (!this.on) return;
    const P = this.g.player, e = P.eyePos();
    for (const side of [-1, 1]) {
      const grip = at(side * 4.5, 10.6, 4);
      const sh = [e[0] + rx * side * .27 - fx * .05, e[1] - .55, e[2] + rz * side * .27 - fz * .05];
      // A fist round the grip, and the sleeve back from it.
      for (const [a, b] of [[-.04, -.04], [.04, -.04], [-.04, .04], [.04, .04]]) add(grip[0] + rx * a, grip[1] + b, grip[2] + rz * a, .09, .76, .58, .46, 0);
      for (let t = .12; t <= 1; t += .1) add(grip[0] + (sh[0] - grip[0]) * t, grip[1] + (sh[1] - grip[1]) * t, grip[2] + (sh[2] - grip[2]) * t, .13, .2, .22, .19, 0);
    }
  }
}
