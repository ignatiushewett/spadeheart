// The dead in the distance, as pictures, the way the far trees are drawn: past the edge of the real horde round you, out to where the
// haze takes everything, the streets have their crowds in them. Nothing is simulated out there. How many stand in each part of the city
// comes from the horde's own count of it (the share of a neighbourhood's dead that are out on the street rather than up inside), and
// where each one stands is fixed for that patch of ground, so they do not swim about as you move. They shuffle and sway on the spot, and
// fade in just past the real ones, so the one runs on into the other.
import { WX, WZ, STREET_Y, G } from '../shared/constants.js';

const POP_CELL = 64;
const COLS = 4;            // pictures across the sheet: reaching (two steps), slumped (two steps)
const BW = 14, BH = 31;    // each picture, in tenths of a block (the bodies are built at a tenth of a block to a unit)
const PX = 2;              // pixels to a unit
// As thick as the real crowd is just inside the edge of it (about a hundred and fifty to a patch in a busy part of town), so walking
// out of the one and into the other there is no sudden thinning.
const SHOWN = .45;         // of a neighbourhood's count, the part out and about to be seen
const PER_CELL = 160;      // the most pictures in any one patch, however thick it is
const FAR = 900, MOVE = 48, EVERY = 10;
const CAPS = { potato: 4000, low: 8000, medium: 14000, high: 22000, ultra: 30000 };

// The sheet. Red is how lit that bit is; green says what it is: skin, shirt, trousers or hair (0, 1/3, 2/3, 1).
function drawSheet() {
  const c = document.createElement('canvas');
  c.width = COLS * BW * PX; c.height = BH * PX;
  const x = c.getContext('2d');
  const put = (col, x0, y0, w, h, part, light) => {
    const g = [0, 85, 170, 255][part], v = Math.round(Math.max(0, Math.min(1, light)) * 255);
    x.fillStyle = `rgb(${v},${g},0)`;
    // y counts up from the feet; the canvas counts down from the top.
    x.fillRect((col * BW + x0) * PX, (BH - y0 - h) * PX, w * PX, h * PX);
  };
  // A body, from the front, built like the real ones: legs, a torso, arms, a head. step swaps which leg is forward; reach holds the arms
  // up in front (seen from the front, short, at the shoulders) or lets one hang.
  const body = (col, step, reach) => {
    const lx = step ? 3 : 4, rx = step ? 8 : 7, ll = step ? 12 : 11, rl = step ? 11 : 12;
    put(col, lx, 0, 3, ll, 2, .5); put(col, rx, 0, 3, rl, 2, .44);
    put(col, 3, 11, 8, 2, 2, .48);
    put(col, 3, 12, 8, 11, 1, .56); put(col, 3, 20, 8, 3, 1, .66);
    if (reach) { put(col, 0, 18, 3, 5, 1, .6); put(col, 11, 18, 3, 5, 1, .52); put(col, 0, 17, 3, 2, 0, .62); put(col, 11, 17, 3, 2, 0, .55); }
    else { put(col, 0, 13, 3, 10, 1, .55); put(col, 0, 11, 3, 2, 0, .6); put(col, 11, 18, 3, 5, 1, .5); put(col, 11, 16, 3, 2, 0, .52); }
    // The head hangs a little forward and to one side.
    const hx = reach ? 3 : 4;
    put(col, hx, 23, 7, 7, 0, .64); put(col, hx, 28, 7, 2, 3, .5);
    put(col, hx + 1, 26, 2, 1, 3, .2); put(col, hx + 4, 26, 2, 1, 3, .2);
  };
  body(0, 0, true); body(1, 1, true); body(2, 0, false); body(3, 1, false);
  return c;
}

export class FarHorde {
  constructor(gl, L) {
    this.gl = gl;
    this.L = L;
    this.count = 0;
    this.cap = 0;
    this.data = new Float32Array(CAPS.ultra * 8);
    this.nearR = 0;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, 0, .5, 0, .5, 1, -.5, 0, .5, 1, -.5, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    this.ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawSheet());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.at = { x: -1e9, z: -1e9, t: -1e9 };
  }

  // Called each frame in play. Cheap unless you have moved a fair way or a while has passed: then the crowds are laid out again from
  // where the horde's count says they are now.
  update(px, pz, horde, quality, nearR, now) {
    const cap = CAPS[quality] ?? CAPS.medium;
    // Well inside the edge of the real horde, where it is already thinning out to the eye: a stretch where both are there, then these.
    this.nearR = Math.max(40, nearR * .65);
    const a = this.at;
    if (cap === this.cap && Math.hypot(px - a.x, pz - a.z) < MOVE && now - a.t < EVERY) return;
    a.x = px; a.z = pz; a.t = now; this.cap = cap;
    const L = this.L, { ground, height, terr } = L, W = horde.popW, D = horde.popD, pop = horde.pop, camp = horde.campCell;
    const h = (p, q) => { const v = Math.sin(p * 127.1 + q * 311.7) * 43758.5453; return v - Math.floor(v); };
    // The patches in reach, nearest first, so if there are more than the cap it is the far ones that go.
    const cells = [];
    const r0 = Math.max(0, Math.floor((px - FAR) / POP_CELL)), r1 = Math.min(W - 1, Math.floor((px + FAR) / POP_CELL));
    const s0 = Math.max(0, Math.floor((pz - FAR) / POP_CELL)), s1 = Math.min(D - 1, Math.floor((pz + FAR) / POP_CELL));
    for (let cz = s0; cz <= s1; cz++) for (let cx = r0; cx <= r1; cx++) {
      const c = cx + cz * W;
      if (pop[c] < .5 || (camp && camp[c] >= 0)) continue;
      const d = Math.hypot((cx + .5) * POP_CELL - px, (cz + .5) * POP_CELL - pz);
      if (d > FAR + 46 || d < this.nearR - 46) continue;
      cells.push(d, c);
    }
    const order = [];
    for (let k = 0; k < cells.length; k += 2) order.push(k);
    order.sort((p, q) => cells[p] - cells[q]);
    const out = this.data;
    let n = 0;
    for (const k of order) {
      if (n >= cap) break;
      const c = cells[k + 1], cx = c % W, cz = (c / W) | 0;
      const want = Math.min(PER_CELL, Math.round(pop[c] * SHOWN));
      for (let i = 0; i < want && n < cap; i++) {
        // Somewhere out in the open in this patch: not in the water, not inside a building. A few goes at it, then give up on that one.
        let x = 0, z = 0, ok = false;
        for (let t = 0; t < 6 && !ok; t++) {
          x = cx * POP_CELL + h(c + t * .37, i) * POP_CELL; z = cz * POP_CELL + h(i + t * .61, c * .13) * POP_CELL;
          const j = Math.floor(z) * WX + Math.floor(x);
          ok = x >= 0 && z >= 0 && x < WX && z < WZ && ground[j] !== G.WATER && !height[j];
        }
        if (!ok) continue;
        const j = Math.floor(z) * WX + Math.floor(x), s = h(x, z);
        const o = n * 8;
        out[o] = x; out[o + 1] = STREET_Y + terr[j]; out[o + 2] = z; out[o + 3] = s < .7 ? 0 : 2;   // most reach, some slump
        out[o + 4] = Math.floor(h(z, x) * 8); out[o + 5] = Math.floor(h(x * 3, z) * 8); out[o + 6] = s * 6.283; out[o + 7] = h(x + z, z - x);
        n++;
      }
    }
    this.count = n;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ib);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, out, 0, n * 8);
  }

  // p: the far horde program, in use with the frame's uniforms set.
  draw(gl, p) {
    if (!this.count) return;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(p.u.uHordeTex, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(p.u.uCols, COLS);
    gl.uniform1f(p.u.uNearR, this.nearR || 0);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.enable(gl.CULL_FACE);
  }
}
