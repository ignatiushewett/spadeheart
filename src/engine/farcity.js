// Skyline proxy: every town as merged boxes and the hills as one coarse sheet, so Albion and Mt. Page are always on the horizon.
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
      if (h && lot[i]) {
        H[x + z * W] = h;
        C[x + z * W] = 1 + buildings[lot[i] - 1].style;
      }
    }
    // Trees make the parks read as canopy from afar.
    for (let k = 0; k < L.props.length; k += PROP_STRIDE) {
      if (L.props[k] !== P.PARKTREE || terr[L.props[k + 2] * WX + L.props[k + 1]] > 2) continue;
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
    // The country: one quad to every sixteen blocks, tilted to the slope, and lifted where the forest stands on it.
    {
      const T = 16, mark = L.mark;
      const at = (x, z) => { const i = Math.min(WZ - 1, z) * WX + Math.min(WX - 1, x); return ground[i] === G.WATER ? -4 : terr[i]; };
      const grass = srgb(M.GRASS, 1), wood = srgb(M.LEAF, .8), rock = srgb(M.SCHIST, 1), snow = srgb(M.SNOW, 1), field = srgb(M.GRASS_DRY, 1);
      const GC = { [G.ROAD]: srgb(M.ASPHALT, 1), [G.WALK]: srgb(M.WALK, 1), [G.LOT]: srgb(M.WALK2, 1), [G.PLAZA]: srgb(M.WALK2, 1), [G.ALLEY]: srgb(M.ALLEYWAY, 1), [G.CAMP]: srgb(M.GRAVEL, 1),
        [G.SAND]: srgb(M.SAND, 1), [G.DIRT]: srgb(M.DIRT, 1), [G.FIELD]: srgb(M.SOIL, 1), [G.PROM]: srgb(M.WOOD, 1), [G.PARK]: grass, [G.ROCK]: rock, [G.WATER]: grass };
      // The colour of a patch of ground from afar: what covers most of it, blended.
      const patch = (x, z) => {
        const c = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const sx = Math.min(WX - 1, x + 2 + (k & 1) * 8), sz = Math.min(WZ - 1, z + 2 + (k >> 1) * 8), g = ground[sz * WX + sx];
          const q = g === G.FIELD && mark[sz * WX + sx] === 2 ? srgb(M.CORN, .8) : GC[g] || grass;
          c[0] += q[0] / 4; c[1] += q[1] / 4; c[2] += q[2] / 4;
        }
        return c;
      };
      for (let z = 0; z < WZ; z += T) for (let x = 0; x < WX; x += T) {
        const a = at(x, z), b = at(x + T, z), c = at(x, z + T), e = at(x + T, z + T);
        if (Math.max(a, b, c, e) <= 2 && L.forestAt(x + 8, z + 8) < .3) continue;
        const i = (z + 8) * WX + x + 8, g = ground[i];
        if (g === G.WATER && Math.max(a, b, c, e) <= 6) continue;
        const canopy = (cx, cz) => { const j = Math.min(WZ - 1, cz) * WX + Math.min(WX - 1, cx); return ground[j] === G.PARK ? 8 * Math.max(0, Math.min(1, (L.forestAt(cx, cz) - .3) / .25)) : 0; };
        const ta = canopy(x, z), tb = canopy(x + T, z), tc = canopy(x, z + T), te = canopy(x + T, z + T), trees = (ta + tb + tc + te) / 4;
        const col = g === G.ROCK ? rock : trees > 4 ? wood : patch(x, z);
        const y = (t, k) => STREET_Y - 1 + Math.max(t, -1) + k;
        const nx = (a + c - b - e) / 2, nz = (a + b - c - e) / 2, nl = Math.hypot(nx, T, nz);
        quad(verts[Math.min(verts.length - 1, Math.floor(z / BUCKET))], [[x, y(c, tc), z + T], [x + T, y(e, te), z + T], [x + T, y(b, tb), z], [x, y(a, ta), z]], [nx / nl, T / nl, nz / nl], col, .3);
      }
      // Past the edges of the world the country carries on: woods rising and falling away from whatever the edge was, out to the
      // horizon, so that from a hill the state does not end in open sea on three sides.
      const S = 64, FAR = 3200, h2n = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
      const vn = (a, b) => {
        const ia = Math.floor(a), ib = Math.floor(b), fa = a - ia, fb = b - ib, ua = fa * fa * (3 - 2 * fa), ub = fb * fb * (3 - 2 * fb);
        const p = h2n(ia, ib), q = h2n(ia + 1, ib), r = h2n(ia, ib + 1), s = h2n(ia + 1, ib + 1);
        return p + (q - p) * ua + (r - p) * ub + (p - q - r + s) * ua * ub;
      };
      const coastOf = (row) => { let e = WX - 1; while (e > 0 && ground[row * WX + e] === G.WATER) e--; return e; };
      const topC = coastOf(0), botC = coastOf(WZ - 1);
      const skirtH = (x, z) => {
        const cx = Math.max(0, Math.min(WX - 1, x)), cz = Math.max(0, Math.min(WZ - 1, z)), d = Math.hypot(x - cx, z - cz);
        const edgeH = Math.max(0, terr[cz * WX + cx]), k = Math.min(1, d / 500);
        return edgeH * (1 - k * k * (3 - 2 * k)) + (14 + 46 * vn(x / 700, z / 700) + 14 * vn(x / 180 + 3, z / 180)) * k * k * (3 - 2 * k) + 8;
      };
      const woodC = [srgb(M.LEAF, .75), srgb(M.LEAF2, .75), srgb(M.LEAF, .65)];
      const land = (x, z) => (x < 0 ? true : z < 0 ? x < topC : z >= WZ ? x < botC : false);
      for (let z = -FAR; z < WZ + FAR; z += S) for (let x = -FAR; x < WX; x += S) {
        if (x >= 0 && z >= 0 && z < WZ) continue;
        if (!land(x + S / 2, z + S / 2)) continue;
        const a = skirtH(x, z), b = skirtH(x + S, z), c = skirtH(x, z + S), e = skirtH(x + S, z + S);
        const y = (t) => STREET_Y - 1 + t;
        const nx = (a + c - b - e) / 2, nz = (a + b - c - e) / 2, nl = Math.hypot(nx, S, nz);
        const bucket = verts[Math.max(0, Math.min(verts.length - 1, Math.floor(z / BUCKET)))];
        quad(bucket, [[x, y(c), z + S], [x + S, y(e), z + S], [x + S, y(b), z], [x, y(a), z]], [nx / nl, S / nl, nz / nl], woodC[Math.floor(h2n(x, z) * 3)], .3);
      }
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
        this.box(bucket, s.x - 22, STREET_Y - 2, s.z - 22, s.x + 22, STREET_Y + 4, s.z + 22, srgb(M.CONCRETE, 1), quad);
        this.box(bucket, s.x - 6, STREET_Y + 4, s.z - 6, s.x + 6, STREET_Y + 34, s.z + 6, srgb(M.CLAP_W, 1), quad);
        this.box(bucket, s.x - 5, STREET_Y + 34, s.z - 5, s.x + 5, STREET_Y + 64, s.z + 5, srgb(M.BARN_R, 1), quad);
        this.box(bucket, s.x - 3, STREET_Y + 64, s.z - 3, s.x + 3, STREET_Y + 72, s.z + 3, srgb(M.COPPER, 1), quad);
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
      this.buckets.push({ vao, count: idx.length, z0: b * BUCKET, z1: (b + 1) * BUCKET, first: b === 0, last: b === verts.length - 1 });
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
      if (!aabbInFrustum(planes, -3200, 0, b.z0 - (b.first ? 3200 : 0), WX, 256, b.z1 + (b.last ? 3200 : 0))) continue;
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
    [G.SAND]: [150, 138, 104], [G.FIELD]: [104, 92, 56], [G.DIRT]: [96, 82, 62],
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
