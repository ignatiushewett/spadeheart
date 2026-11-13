// Debris cubes (voxel chunks, blood, casings) and soft sprites (smoke, fire, flashes, tracers).
import { PALETTE } from '../shared/materials.js';

const BLOOD_SCALE = 2.4, GORE_SCALE = 2;   // everything that bleeds goes through these
const CUBE_CAP = 14000;
const SPRITE_CAP = 10000;
const CUBE_STRIDE = 9;
const SPRITE_STRIDE = 15;
const rand = Math.random;

export class Particles {
  constructor(gl, world) {
    this.world = world;
    this.cn = 0;
    const CF = 15; // x y z vx vy vz size r g b rot rotV life glow flags
    this.c = new Float32Array(CUBE_CAP * CF);
    this.CF = CF;
    this.cubeInst = new Float32Array(CUBE_CAP * CUBE_STRIDE);
    this.sn = 0;
    // x y z vx vy vz size grow r g b a fade rot rotV kind life stretch gravity, then for smoke that billows: its whole life, how hot
    // it was when it left the fire, and how thick it gets at its thickest.
    const SF = 22;
    this.windX = 0; this.windZ = 0;
    this.s = new Float32Array(SPRITE_CAP * SF);
    this.SF = SF;
    this.spriteInst = new Float32Array(SPRITE_CAP * SPRITE_STRIDE);
    this.onImpact = null;
    this.initGL(gl);
  }

  initGL(gl) {
    const v = [];
    const add = (n, a, b, c, d) => { for (const p of [a, b, c, a, c, d]) v.push(...p, ...n); };
    const h = .5;
    add([1, 0, 0], [h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]);
    add([-1, 0, 0], [-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]);
    add([0, 1, 0], [-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]);
    add([0, -1, 0], [-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]);
    add([0, 0, 1], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]);
    add([0, 0, -1], [h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]);
    this.cubeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.cubeVAO);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    this.cubeBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.cubeInst.byteLength, gl.DYNAMIC_DRAW);
    const s = CUBE_STRIDE * 4;
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, s, 0); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, s, 16); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 1, gl.FLOAT, false, s, 32); gl.vertexAttribDivisor(4, 1);

    this.spriteVAO = gl.createVertexArray();
    gl.bindVertexArray(this.spriteVAO);
    const qb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, qb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.spriteBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.spriteInst.byteLength, gl.DYNAMIC_DRAW);
    const ss = SPRITE_STRIDE * 4;
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, ss, 0); gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, ss, 16); gl.vertexAttribDivisor(2, 1);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, ss, 32); gl.vertexAttribDivisor(3, 1);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, ss, 48); gl.vertexAttribDivisor(4, 1);
    gl.bindVertexArray(null);
  }

  cube(x, y, z, vx, vy, vz, size, r, g, b, life, glow = 0, flags = 0) {
    if (this.cn >= CUBE_CAP) return;
    const c = this.c, k = this.cn++ * this.CF;
    c[k] = x; c[k + 1] = y; c[k + 2] = z; c[k + 3] = vx; c[k + 4] = vy; c[k + 5] = vz;
    c[k + 6] = size; c[k + 7] = r; c[k + 8] = g; c[k + 9] = b;
    c[k + 10] = rand() * 6.28; c[k + 11] = (rand() - .5) * 14; c[k + 12] = life; c[k + 13] = glow; c[k + 14] = flags;
  }

  sprite(kind, x, y, z, vx, vy, vz, size, grow, r, g, b, a, life, stretch = 0, gravity = 0) {
    if (this.sn >= SPRITE_CAP) return;
    const s = this.s, k = this.sn++ * this.SF;
    s[k] = x; s[k + 1] = y; s[k + 2] = z; s[k + 3] = vx; s[k + 4] = vy; s[k + 5] = vz;
    s[k + 6] = size; s[k + 7] = grow; s[k + 8] = r; s[k + 9] = g; s[k + 10] = b; s[k + 11] = a;
    s[k + 12] = a / life; s[k + 13] = rand() * 6.28; s[k + 14] = (rand() - .5) * .8; s[k + 15] = kind;
    s[k + 16] = life; s[k + 17] = stretch; s[k + 18] = gravity;
    s[k + 19] = 0; s[k + 20] = 0; s[k + 21] = 0;
  }

  // Smoke the way it really comes off a fire: small and thick where it leaves the flames, lit from underneath by them, then rising,
  // spreading and thinning out as it goes, leaning with the wind. Many small puffs, not one big disc. heat is how much of the fire's
  // glow it carries at first; shade is its colour (dark for burning cars and buildings, pale for wood and dust).
  smoke(x, y, z, size = 1, heat = .6, shade = .1, thick = .32, rise = 1) {
    if (this.sn >= SPRITE_CAP - 400) return;
    const g = shade * (.8 + rand() * .4), life = (5.5 + rand() * 4) * Math.sqrt(size);
    this.sprite(0, x + (rand() - .5) * .5 * size, y, z + (rand() - .5) * .5 * size, (rand() - .5) * .5, (1.4 + rand() * 1.2) * rise * Math.sqrt(size), (rand() - .5) * .5,
      size * (.3 + rand() * .2), size * (.45 + rand() * .35), g, g * .97, g * .93, thick, life);
    const k = (this.sn - 1) * this.SF, S = this.s;
    S[k + 12] = 0; S[k + 19] = life; S[k + 20] = heat; S[k + 21] = thick;
  }

  // What a building leaves hanging over itself when it comes down: a low, heavy cloud of dust rolling out across the ground.
  dustCloud(x, y, z, size = 4, out = 0, dirX = 0, dirZ = 0, shade = .42) {
    if (this.sn >= SPRITE_CAP - 400) return;
    // Dust from a collapse rolls out slowly and hangs there: a fraction of the push, barely rising, and the wind only nudges it.
    const g = shade * (.9 + rand() * .2), life = 12 + rand() * 12;
    this.sprite(0, x, y, z, dirX * out * .3 + (rand() - .5) * .3, .06 + rand() * .16, dirZ * out * .3 + (rand() - .5) * .3, size * (.6 + rand() * .4), size * (.1 + rand() * .1),
      g, g * .94, g * .85, .3, life);
    const k = (this.sn - 1) * this.SF, S = this.s;
    S[k + 12] = 0; S[k + 18] = .3; S[k + 19] = life; S[k + 20] = 0; S[k + 21] = .3;
  }

  // --- Effects -----------------------------------------------------------------
  debris(x, y, z, id, n = 6, power = 3) {
    const r = PALETTE[id * 4] / 255, g = PALETTE[id * 4 + 1] / 255, b = PALETTE[id * 4 + 2] / 255;
    for (let i = 0; i < n; i++) {
      const s = .12 + rand() * .22;
      this.cube(x + rand(), y + rand(), z + rand(), (rand() - .5) * power, rand() * power, (rand() - .5) * power, s, r, g, b, 2 + rand() * 2.5, 0, 1);
    }
  }

  // Shards of glass: small, pale, catching the light, and quick to be gone.
  glass(x, y, z, n = 8, power = 3) {
    for (let i = 0; i < n; i++) {
      const s = .04 + rand() * .09, t = .7 + rand() * .25;
      this.cube(x + rand(), y + rand(), z + rand(), (rand() - .5) * power, rand() * power * .8, (rand() - .5) * power, s, .62 * t, .7 * t, .74 * t, 1.2 + rand() * 1.4, .35, 1);
      if (i % 3 === 0) this.sprite(2, x + rand(), y + rand(), z + rand(), (rand() - .5) * power * .6, rand() * power * .5, (rand() - .5) * power * .6, .05, 0, 2.2, 2.4, 2.6, .8, .25 + rand() * .3);
    }
  }

  blood(x, y, z, dx, dy, dz, n = 8, power = 4) {
    // In a big fight the pool fills up. It eases off rather than suddenly having no room for the hit in front of you.
    n = Math.ceil(n * BLOOD_SCALE * (this.cn > CUBE_CAP * .6 ? .35 : 1));
    for (let i = 0; i < n; i++) {
      const dark = .3 + rand() * .3;
      this.cube(x, y, z, dx * power * rand() + (rand() - .5) * 2.4, dy * power * rand() + rand() * 2.2, dz * power * rand() + (rand() - .5) * 2.4,
        .07 + rand() * .11, dark, .02, .02, .7 + rand() * 1.4, 0, 1);
    }
  }

  gore(x, y, z, n = 12, tone = [.45, .32, .3]) {
    n = Math.ceil(n * GORE_SCALE * (this.cn > CUBE_CAP * .6 ? .35 : 1));
    for (let i = 0; i < n; i++) {
      this.cube(x, y, z, (rand() - .5) * 7, rand() * 7, (rand() - .5) * 7, .1 + rand() * .2, tone[0] * (.6 + rand() * .6), tone[1] * rand(), tone[2] * rand(), 1.6 + rand() * 2.4, 0, 1);
    }
    this.blood(x, y, z, 0, 1, 0, 14, 6);
  }

  // What is left after a very long drop: nothing you could call a body. A flat burst outward along the ground, with the big pieces going furthest.
  gib(x, y, z, k = 1) {
    const room = this.cn > CUBE_CAP * .6 ? .35 : 1;
    for (let i = 0, n = Math.ceil(30 * k * room); i < n; i++) {
      const a = rand() * 6.283, v = 2 + rand() * 11 * Math.sqrt(k), big = rand() < .3;
      this.cube(x, y + .4, z, Math.cos(a) * v, 1 + rand() * 7, Math.sin(a) * v, big ? .16 + rand() * .2 : .08 + rand() * .12, .2 + rand() * .2, .025 + rand() * .05, .025 + rand() * .04, 2.2 + rand() * 3, 0, 1);
    }
    for (let i = 0, n = Math.ceil(70 * k * room); i < n; i++) {
      const a = rand() * 6.283, v = rand() * 12 * Math.sqrt(k), dark = .28 + rand() * .3;
      this.cube(x, y + .3, z, Math.cos(a) * v, rand() * rand() * 12, Math.sin(a) * v, .06 + rand() * .13, dark, .02, .02, 1 + rand() * 2.2, 0, 1);
    }
  }

  dust(x, y, z, n = 3, size = 1) {
    for (let i = 0; i < n; i++) {
      const g = .4 + rand() * .15;
      this.sprite(0, x + (rand() - .5) * size, y + rand() * size, z + (rand() - .5) * size, (rand() - .5) * 1.2, .5 + rand(), (rand() - .5) * 1.2, size * (.6 + rand() * .6), size * .7, g, g * .96, g * .9, .32, 1.4 + rand() * 1.6);
    }
  }

  spark(x, y, z, nx, ny, nz, n = 5) {
    for (let i = 0; i < n; i++) {
      this.cube(x, y, z, nx * 4 + (rand() - .5) * 6, ny * 4 + rand() * 4, nz * 4 + (rand() - .5) * 6, .035 + rand() * .03, 1, .7, .3, .25 + rand() * .3, 14, 1);
    }
    this.sprite(2, x, y, z, 0, 0, 0, .34, 0, 3.2, 2.2, 1.1, 1, .07);
  }

  // What is left in the air after a shot: a breath of smoke drifting off the muzzle.
  muzzleSmoke(x, y, z, dx, dy, dz, size = 1) {
    if (rand() < .55) this.sprite(0, x + dx * .5, y + dy * .5, z + dz * .5, dx * 1.6 + (rand() - .5) * .4, dy * 1.6 + .5, dz * 1.6 + (rand() - .5) * .4, .16 * size, .8, .45, .45, .45, .045, .8);
  }

  muzzle(x, y, z, dx, dy, dz, size = 1) {
    this.sprite(1, x, y, z, dx * 2, dy * 2, dz * 2, .5 * size, 3 * size, 9, 5.6, 2.2, 1, .05);
    this.sprite(1, x + dx * .3, y + dy * .3, z + dz * .3, dx * 4, dy * 4, dz * 4, .3 * size, 2 * size, 8, 4, 1.4, .9, .04);
    if (rand() < .4) this.sprite(0, x + dx * .9, y + dy * .9, z + dz * .9, dx * 2.5 + (rand() - .5) * .4, dy * 2.5 + .5, dz * 2.5 + (rand() - .5) * .4, .2 * size, .9, .4, .4, .4, .05, .7);
  }

  tracer(x0, y0, z0, x1, y1, z1, speed = 340) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const d = Math.hypot(dx, dy, dz);
    if (d < 2) return;
    const ux = dx / d, uy = dy / d, uz = dz / d;
    this.sprite(3, x0 + ux * 2, y0 + uy * 2, z0 + uz * 2, ux * speed, uy * speed, uz * speed, .035, 0, 12, 9, 5, .8, Math.min(.2, d / speed), Math.min(5, d * .3));
  }

  explosion(x, y, z, r) {
    for (let i = 0; i < 12; i++) {
      const a = rand() * 6.28, p = rand() * r * 1.5;
      this.sprite(1, x + Math.cos(a) * r * .3 * rand(), y + rand() * r * .4, z + Math.sin(a) * r * .3 * rand(), Math.cos(a) * p, rand() * p * 1.5, Math.sin(a) * p, r * (.5 + rand() * .5), r * .9, 11, 5.2 + rand() * 3, 1.5, 1, .22 + rand() * .3);
    }
    for (let i = 0; i < 26; i++) {
      const a = rand() * 6.28, p = rand() * r * .9;
      const g = .1 + rand() * .22;
      this.sprite(0, x + (rand() - .5) * r, y + rand() * r * .8, z + (rand() - .5) * r, Math.cos(a) * p, 1 + rand() * r * .55, Math.sin(a) * p, r * (.5 + rand() * .6), r * .55, g, g, g * .95, .55, 2.6 + rand() * 4.2);
    }
    for (let i = 0; i < 44; i++) {
      this.cube(x, y, z, (rand() - .5) * r * 9, rand() * r * 8, (rand() - .5) * r * 9, .03 + rand() * .05, 1, .66, .3, .6 + rand() * 1, 12, 1);
    }
  }

  // calm: a big, slow fire, the flames rolling up rather than darting.
  fire(x, y, z, size = 1, calm = false) {
    const up = calm ? .5 : 1, last = calm ? 1.6 : 1;
    this.sprite(1, x + (rand() - .5) * .5 * size, y + rand() * .2, z + (rand() - .5) * .5 * size, (rand() - .5) * .3 * up, (1.2 + rand() * 1.2) * up, (rand() - .5) * .3 * up, .35 * size, -.1 * size / last, 2.5, 1, .22, .6, (.45 + rand() * .35) * last);
  }

  plume(x, y, z, scale = 1) {
    if (this.sn >= SPRITE_CAP) return;
    const g = .05 + rand() * .08;
    // A slow column: it rises steadily, spreads a little at a time, and goes where the wind takes it, which is not far or fast.
    const life = 40 + rand() * 30;
    this.sprite(0, x + (rand() - .5) * 6 * scale, y, z + (rand() - .5) * 6 * scale, (rand() - .5) * .4, 1.3 + rand() * .9, (rand() - .5) * .4, 7 * scale, 1.5 * scale, g, g, g, .55, life);
    // Ages like the rest of the smoke: thickens as it leaves, thins out up high.
    const k = (this.sn - 1) * this.SF;
    this.s[k + 12] = 0; this.s[k + 19] = life; this.s[k + 20] = .25; this.s[k + 21] = .55;
  }

  // A falling slab from a collapse: every voxel keeps its colour on the way down.
  // vx, vz: the drift it goes down with, the way the whole thing is leaning and a little of its own.
  falling(x, y, z, id, delay, vx = 0, vz = 0) {
    const r = PALETTE[id * 4] / 255, g = PALETTE[id * 4 + 1] / 255, b = PALETTE[id * 4 + 2] / 255;
    const life = 3.5 + rand() * 1.5;
    this.cube(x + .5, y + .5, z + .5, vx + (rand() - .5) * .35, -rand() * .6 - delay, vz + (rand() - .5) * .35, .98, r, g, b, life, 0, 2);
  }

  update(dt) {
    const c = this.c, CF = this.CF, w = this.world;
    let n = this.cn;
    for (let i = 0; i < n; i++) {
      const k = i * CF;
      c[k + 12] -= dt;
      if (c[k + 12] <= 0) {
        n--;
        if (i !== n) c.copyWithin(k, n * CF, n * CF + CF);
        i--;
        continue;
      }
      const flags = c[k + 14];
      c[k + 4] -= (flags === 2 ? 18 : 16) * dt;
      c[k] += c[k + 3] * dt; c[k + 1] += c[k + 4] * dt; c[k + 2] += c[k + 5] * dt;
      c[k + 10] += c[k + 11] * dt * (flags === 2 ? .15 : 1);
      if (w.solid(Math.floor(c[k]), Math.floor(c[k + 1]), Math.floor(c[k + 2]))) {
        if (flags === 2) {
          if (this.onImpact) this.onImpact(c[k], c[k + 1], c[k + 2], c[k + 7], c[k + 8], c[k + 9], -c[k + 4]);
          c[k + 12] = 0;
          continue;
        }
        c[k] -= c[k + 3] * dt; c[k + 1] -= c[k + 4] * dt; c[k + 2] -= c[k + 5] * dt;
        c[k + 3] *= .42; c[k + 5] *= .42; c[k + 4] = -c[k + 4] * .28; c[k + 11] *= .4;
        if (Math.abs(c[k + 4]) < 1) { c[k + 4] = 0; c[k + 3] *= .4; c[k + 5] *= .4; }
      }
    }
    this.cn = n;

    const s = this.s, SF = this.SF;
    let m = this.sn;
    for (let i = 0; i < m; i++) {
      const k = i * SF;
      s[k + 16] -= dt;
      s[k + 11] -= s[k + 12] * dt;
      if (s[k + 16] <= 0 || s[k + 11] <= 0) {
        m--;
        if (i !== m) s.copyWithin(k, m * SF, m * SF + SF);
        i--;
        continue;
      }
      s[k] += s[k + 3] * dt; s[k + 1] += s[k + 4] * dt; s[k + 2] += s[k + 5] * dt;
      s[k + 6] += s[k + 7] * dt;
      s[k + 13] += s[k + 14] * dt;
      if (s[k + 19] > 0) {
        // Rises fast off the fire and slows as it cools, carried off sideways by the wind more the higher and older it gets; spreads
        // quickly at first, then hardly at all.
        const age = 1 - s[k + 16] / s[k + 19], wk = Math.min(1, .25 + age * 1.6) * (s[k + 18] || 1);
        // A light push, eased into: smoke leans with the wind, it is not blown away by it.
        s[k + 3] += (this.windX * 1.6 * wk - s[k + 3]) * Math.min(1, .35 * dt);
        s[k + 5] += (this.windZ * 1.6 * wk - s[k + 5]) * Math.min(1, .35 * dt);
        s[k + 4] *= 1 - .3 * dt;
        s[k + 7] *= 1 - .22 * dt;
      } else if (s[k + 15] < .5) { s[k + 3] *= 1 - .4 * dt; s[k + 5] *= 1 - .4 * dt; s[k + 4] *= 1 - .22 * dt; }
    }
    this.sn = m;
  }

  // extra: more cubes to draw this frame only, already laid out as instances (a vehicle, say). They are not simulated.
  drawCubes(gl, renderer, extra = null, extraN = 0) {
    if (!this.cn && !extraN) return;
    const c = this.c, CF = this.CF, o = this.cubeInst;
    for (let i = 0; i < this.cn; i++) {
      const k = i * CF, q = i * CUBE_STRIDE;
      o[q] = c[k]; o[q + 1] = c[k + 1]; o[q + 2] = c[k + 2]; o[q + 3] = c[k + 6];
      o[q + 4] = c[k + 7]; o[q + 5] = c[k + 8]; o[q + 6] = c[k + 9]; o[q + 7] = c[k + 10];
      o[q + 8] = c[k + 13];
    }
    const xn = Math.min(extraN, CUBE_CAP - this.cn);
    if (xn > 0) o.set(extra.subarray(0, xn * CUBE_STRIDE), this.cn * CUBE_STRIDE);
    const total = this.cn + Math.max(0, xn);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, o, 0, total * CUBE_STRIDE);
    const p = renderer.pCube.use();
    renderer.frameUniforms(p);
    // Where the rain reaches, so a bike under a roof stays dry.
    renderer.bindRainMap(p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindVertexArray(this.cubeVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 36, total);
    renderer.stats.draws++;
  }

  drawSprites(gl, renderer) {
    if (!this.sn) return;
    const s = this.s, SF = this.SF, o = this.spriteInst;
    for (let i = 0; i < this.sn; i++) {
      const k = i * SF, q = i * SPRITE_STRIDE;
      o[q] = s[k]; o[q + 1] = s[k + 1]; o[q + 2] = s[k + 2]; o[q + 3] = s[k + 6];
      o[q + 4] = s[k + 8]; o[q + 5] = s[k + 9]; o[q + 6] = s[k + 10]; o[q + 7] = Math.min(1, s[k + 11]);
      o[q + 8] = s[k + 15]; o[q + 9] = s[k + 13]; o[q + 10] = s[k + 17]; o[q + 11] = 0;
      if (s[k + 19] > 0) {
        // Fades in as it leaves the flames, thins away at the end, and loses the glow of the fire within its first few seconds.
        const age = 1 - s[k + 16] / s[k + 19], inK = Math.min(1, age / .1);
        o[q + 7] = s[k + 21] * inK * inK * Math.pow(1 - age, 1.4);
        const hot = Math.max(0, 1 - age / .3);
        o[q + 11] = s[k + 20] * hot * hot;
      }
      o[q + 12] = s[k + 3]; o[q + 13] = s[k + 4]; o[q + 14] = s[k + 5];
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.spriteBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, o, 0, this.sn * SPRITE_STRIDE);
    const p = renderer.pSprite.use();
    renderer.bindSpriteUniforms(p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.spriteVAO);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.sn);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    renderer.stats.draws++;
  }
}
