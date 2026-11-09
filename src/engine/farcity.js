// Skyline proxy: the whole island as merged boxes so Manhattan is always on the horizon.
// A per-column load mask in the shader swaps each piece for real voxels once meshed.
import { WX, WZ, STREET_Y, G } from '../shared/constants.js';
import { PALETTE, M } from '../shared/materials.js';
import { STYLES, P, PROP_STRIDE } from '../shared/layout.js';
import { aabbInFrustum } from './math.js';

const CELL = 4;
const BUCKET = 512;

const srgb = (id, k) => {
  return [
    Math.pow(PALETTE[id * 4] / 255, 2.2) * k,
    Math.pow(PALETTE[id * 4 + 1] / 255, 2.2) * k,
    Math.pow(PALETTE[id * 4 + 2] / 255, 2.2) * k,
  ];
};

export class FarCity {
  constructor(gl, L) {
    this.buckets = [];
    const W = WX / CELL, D = WZ / CELL;
    const H = new Uint8Array(W * D);
    const C = new Uint16Array(W * D);
    const { height, lot, buildings, ground, terr } = L;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = (z * CELL + 2) * WX + x * CELL + 2;
      const h = height[i];
      if (h) {
        H[x + z * W] = h;
        C[x + z * W] = lot[i] ? 1 + buildings[lot[i] - 1].style : 200;
      } else if (terr[i] > 2 && ground[i] !== G.WATER) {
        H[x + z * W] = STREET_Y + terr[i];
        C[x + z * W] = 201;
      }
    }
    // Trees make the parks read as canopy from afar.
    for (let k = 0; k < L.props.length; k += PROP_STRIDE) {
      if (L.props[k] !== P.PARKTREE) continue;
      const x = L.props[k + 1] >> 2, z = L.props[k + 2] >> 2;
      const i = x + z * W;
      if (!H[i]) {
        const y = STREET_Y + 9 + (L.props[k + 3] % 4) + Math.max(0, terr[L.props[k + 2] * WX + L.props[k + 1]]);
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          if (!H[i + dx + dz * W]) { H[i + dx + dz * W] = y; C[i + dx + dz * W] = 202 + (L.props[k + 3] % 2); }
        }
      }
    }
    const palette = (c) => {
      if (c === 200) return { col: srgb(M.COPPER, 1), glass: 0 };
      if (c === 201) return { col: srgb(M.SCHIST, 1), glass: 0, solid: true };
      if (c >= 202) return { col: srgb(c === 202 ? M.LEAF : M.LEAF2, 1), glass: 0, solid: true };
      const s = STYLES[c - 1];
      return { col: srgb(s.wall, 1), roof: srgb(s.roof, 1), glass: s.cast === 2 ? 1 : 0 };
    };
    const cache = new Map();
    const pal = (c) => { let p = cache.get(c); if (!p) { p = palette(c); cache.set(c, p); } return p; };

    const verts = Array.from({ length: Math.ceil(WZ / BUCKET) }, () => []);
    const used = new Uint8Array(W * D);
    const quad = (out, p, n, col, glass) => {
      for (const v of p) {
        out.push(v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], glass);
      }
    };
    const heightAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= D) ? 0 : H[x + z * W];
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = x + z * W;
      if (!H[i] || used[i]) continue;
      const h = H[i], c = C[i];
      let w = 1;
      while (x + w < W && !used[i + w] && H[i + w] === h && C[i + w] === c) w++;
      let d = 1;
      outer: while (z + d < D) {
        for (let k = 0; k < w; k++) {
          const j = x + k + (z + d) * W;
          if (used[j] || H[j] !== h || C[j] !== c) break outer;
        }
        d++;
      }
      for (let a = 0; a < d; a++) for (let b = 0; b < w; b++) used[x + b + (z + a) * W] = 1;
      const x0 = x * CELL, x1 = (x + w) * CELL, z0 = z * CELL, z1 = (z + d) * CELL;
      const p = pal(c);
      const bucket = verts[Math.min(verts.length - 1, Math.floor(z0 / BUCKET))];
      quad(bucket, [[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0]], [0, 1, 0], p.roof || p.col, 0);
      // Sides only reach down to the lowest neighbour, keeping the proxy light.
      let lowW = h, lowE = h, lowN = h, lowS = h;
      for (let a = 0; a < d; a++) { lowW = Math.min(lowW, heightAt(x - 1, z + a)); lowE = Math.min(lowE, heightAt(x + w, z + a)); }
      for (let b = 0; b < w; b++) { lowN = Math.min(lowN, heightAt(x + b, z - 1)); lowS = Math.min(lowS, heightAt(x + b, z + d)); }
      const base = (v) => Math.max(STREET_Y - 2, v);
      if (lowW < h) quad(bucket, [[x0, base(lowW), z0], [x0, base(lowW), z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], p.col, p.glass);
      if (lowE < h) quad(bucket, [[x1, base(lowE), z1], [x1, base(lowE), z0], [x1, h, z0], [x1, h, z1]], [1, 0, 0], p.col, p.glass);
      if (lowN < h) quad(bucket, [[x1, base(lowN), z0], [x0, base(lowN), z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], p.col, p.glass);
      if (lowS < h) quad(bucket, [[x0, base(lowS), z1], [x1, base(lowS), z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], p.col, p.glass);
    }
    // Spires and bridges, hand-placed so the silhouette reads.
    for (const s of L.structs) {
      if (s.type === 'spire') {
        const r = Math.max(1, s.r0);
        const bucket = verts[Math.floor(s.z / BUCKET)];
        this.box(bucket, s.x - r, s.y0, s.z - r, s.x + r, (s.y0 + s.y1) >> 1, s.z + r, srgb(M.STEEL, 1), quad);
        this.box(bucket, s.x - 1, (s.y0 + s.y1) >> 1, s.z - 1, s.x + 1, s.y1, s.z + 1, srgb(M.STEEL, 1), quad);
      } else if (s.type === 'bridge') {
        const bucket = verts[Math.floor(s.z / BUCKET)];
        const lo = Math.min(s.xa, s.xb), hi = Math.max(s.xa, s.xb);
        this.box(bucket, lo, s.deck - 1, s.z - s.w, hi, s.deck, s.z + s.w, srgb(M.STEEL_D, 1), quad);
        for (const tx of s.towers) {
          this.box(bucket, tx - 3, 4, s.z - s.w - 3, tx + 3, s.deck + s.towerH, s.z - s.w + 1, srgb(s.mat, 1), quad);
          this.box(bucket, tx - 3, 4, s.z + s.w - 1, tx + 3, s.deck + s.towerH, s.z + s.w + 3, srgb(s.mat, 1), quad);
        }
      } else if (s.type === 'statue') {
        const bucket = verts[Math.floor(s.z / BUCKET)];
        this.box(bucket, s.x - 9, STREET_Y - 2, s.z - 9, s.x + 9, STREET_Y + 30, s.z + 9, srgb(M.GRANITE, 1), quad);
        this.box(bucket, s.x - 6, STREET_Y + 30, s.z - 6, s.x + 6, STREET_Y + 74, s.z + 6, srgb(M.COPPER, 1), quad);
        this.box(bucket, s.x + 4, STREET_Y + 74, s.z - 1, s.x + 7, STREET_Y + 90, s.z + 1, srgb(M.COPPER, 1), quad);
      }
    }

    // Camps read from afar as a wall ring with their tallest buildings poking over it.
    const WALL_COL = { cabs: M.TAXI, containers: M.CONT_R, palisade: M.LOG, hesco: M.SANDBAG, sheet: M.STEEL, scrap: M.PAINT_P, white: M.CAR_W, brick: M.BRICK_R, stone: M.GRANITE };
    for (const c of L.camps) {
      const col = srgb(WALL_COL[c.wall] || M.CONCRETE, 1);
      const top = STREET_Y + c.H;
      const edges = [[c.x0, c.z0, c.x1, c.z0 + 2], [c.x0, c.z1 - 2, c.x1, c.z1], [c.x0, c.z0, c.x0 + 2, c.z1], [c.x1 - 2, c.z0, c.x1, c.z1]];
      for (const [a, b, e, f] of edges) {
        for (let z = b; z < f; z += BUCKET) this.box(verts[Math.floor(z / BUCKET)], a, 3, z, e, top, Math.min(f, z + BUCKET), col, quad);
      }
      for (const p of c.parts) {
        if (p.h < 12 || p.t === 'flag') continue;
        this.box(verts[Math.floor(p.z0 / BUCKET)], p.x0, STREET_Y, p.z0, p.x1, STREET_Y + p.h, p.z1, srgb(p.far || M.CONCRETE_D, 1), quad);
      }
    }

    for (let b = 0; b < verts.length; b++) {
      const arr = verts[b];
      if (!arr.length) continue;
      const vertCount = arr.length / 10;
      const buf = new ArrayBuffer(vertCount * 20);
      const fv = new Float32Array(buf), iv = new Int8Array(buf), uv = new Uint8Array(buf);
      for (let k = 0, o = 0; k < arr.length; k += 10, o += 20) {
        fv[o >> 2] = arr[k]; fv[(o >> 2) + 1] = arr[k + 1]; fv[(o >> 2) + 2] = arr[k + 2];
        iv[o + 12] = arr[k + 3] * 127; iv[o + 13] = arr[k + 4] * 127; iv[o + 14] = arr[k + 5] * 127;
        uv[o + 16] = Math.min(255, arr[k + 6] * 255); uv[o + 17] = Math.min(255, arr[k + 7] * 255); uv[o + 18] = Math.min(255, arr[k + 8] * 255); uv[o + 19] = arr[k + 9] * 255;
      }
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.BYTE, true, 20, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 20, 16);
      const idx = new Uint32Array(vertCount / 4 * 6);
      for (let q = 0, v = 0, k = 0; q < vertCount / 4; q++, v += 4) {
        idx[k++] = v; idx[k++] = v + 1; idx[k++] = v + 2; idx[k++] = v; idx[k++] = v + 2; idx[k++] = v + 3;
      }
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.buckets.push({ vao, count: idx.length, z0: b * BUCKET, z1: (b + 1) * BUCKET });
    }
  }

  box(out, x0, y0, z0, x1, y1, z1, col, quad) {
    quad(out, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], col, 0);
    quad(out, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], col, 0);
    quad(out, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], col, 0);
    quad(out, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], col, 0);
    quad(out, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], col, 0);
  }

  draw(gl, planes) {
    for (const b of this.buckets) {
      if (!aabbInFrustum(planes, 0, 0, b.z0, WX, 256, b.z1)) continue;
      gl.bindVertexArray(b.vao);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_INT, 0);
    }
  }

  drawShadow(gl, planes) {
    this.draw(gl, planes);
  }
}

// RGBA map image used by the ground proxy and the in-game maps.
export function buildCityMap(L) {
  const w = WX >> 1, h = WZ >> 1;
  const rgba = new Uint8Array(w * h * 4);
  const { ground, height, terr, lot, buildings } = L;
  const groundCol = {
    [G.WATER]: [20, 42, 54], [G.ROAD]: [50, 50, 52], [G.WALK]: [100, 98, 92], [G.LOT]: [72, 72, 70], [G.PARK]: [66, 76, 50],
    [G.PLAZA]: [120, 116, 108], [G.ALLEY]: [70, 68, 64], [G.PROM]: [108, 88, 62], [G.CAMP]: [94, 90, 78], [G.ROCK]: [110, 110, 112],
  };
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const i = (z << 1) * WX + (x << 1);
    const g = ground[i];
    let c = groundCol[g] || groundCol[G.LOT];
    let a = 255;
    if (g === G.WATER) a = 0;
    if (g === G.PARK && terr[i] < -2) { c = groundCol[G.WATER]; a = 0; }
    const o = (x + z * w) * 4;
    rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = a;
  }
  return { rgba, w, h };
}
