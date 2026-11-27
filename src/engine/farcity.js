// Skyline proxy: every town as merged boxes and the hills as one coarse sheet, so Albion and Mt. Page are always on the horizon.
// A per-column load mask in the shader swaps each piece for real voxels once meshed.
import { WX, WZ, STREET_Y, WATER_Y, G } from '../shared/constants.js';
import { PALETTE, M } from '../shared/materials.js';
import { STYLES, P, PROP_STRIDE } from '../shared/layout.js';
import { aabbInFrustum } from './math.js';

// Two blocks to a cell: near enough to the real footprints that alleys and setbacks stay where they are.
const CELL = 2;
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
    // Which style a cell is, and how that building's windows sit on it: how far along (from its seed) and how far up (from the ground it
    // stands on), so its stand-in has its windows where the real one has them. Cells only merge with ones that match in all of it.
    const C = new Uint16Array(W * D), BLD = [];
    if (STYLES.length > 62) throw new Error('FarCity: the style no longer fits in its six bits');
    const { height, lot, buildings, ground, terr } = L;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = (z * CELL + (CELL >> 1)) * WX + x * CELL + (CELL >> 1);
      const h = height[i];
      if (h && lot[i]) {
        const b = buildings[lot[i] - 1];
        H[x + z * W] = h;
        const key = (1 + b.style) | ((b.seed & 7) << 6) | ((((b.lift | 0) % 6 + 6) % 6) << 9) | (b.house ? 1 << 12 : 0) | (b.blank ? 1 << 13 : 0);
        C[x + z * W] = key;
      }
    }
    // (Trees are drawn far off as pictures now, by FarTrees, not as boxes here.)
    const palette = (c) => {
      const s = STYLES[(c & 63) - 1];
      // The facade the shader draws over the wall: the style's own glass and trim, its window spacing and width, and whether it is cast
      // iron (a pilaster between the windows), a curtain wall, a house, or a blank silo.
      const face = { glass: srgb(s.glass, 1), trim: srgb(s.trim, 1), p: s.p, w: s.w, cast: s.cast, phase: (c >> 6) & 7, lift: (c >> 9) & 7, house: !!(c & (1 << 12)), blank: !!(c & (1 << 13)) };
      return { col: srgb(s.wall, 1), roof: srgb(s.roof, 1), glass: 1, face };
    };
    void BLD;
    const cache = new Map();
    const pal = (c) => { let p = cache.get(c); if (!p) { p = palette(c); cache.set(c, p); } return p; };

    const verts = Array.from({ length: Math.ceil(WZ / BUCKET) }, () => []);
    // The ground itself goes in buckets of its own: it is drawn, but it casts no shadow worth the cost of a second and third pass.
    const tverts = Array.from({ length: Math.ceil(WZ / BUCKET) }, () => []);
    const used = new Uint8Array(W * D);
    // kind: 0 a plain box (no windows), .3 the ground, 1 a building. face: its facade, for the walls of a building.
    const NOFACE = { glass: [0, 0, 0], trim: [0, 0, 0], p: 0, w: 0, cast: 0, phase: 0, lift: 0, house: false, blank: false };
    const quad = (out, p, n, col, kind, face = NOFACE) => {
      const f = face, bits = f.phase | (f.lift << 3) | (f.house ? 64 : 0) | (f.blank ? 128 : 0);
      for (const v of p) {
        out.push(v[0], v[1], v[2], n[0], n[1], n[2], col[0], col[1], col[2], kind, f.glass[0], f.glass[1], f.glass[2], f.p, f.trim[0], f.trim[1], f.trim[2], f.w | (f.cast << 4), bits);
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
      const F = p.face;
      // Sides only reach down to the lowest neighbour, keeping the proxy light.
      let lowW = h, lowE = h, lowN = h, lowS = h;
      for (let a = 0; a < d; a++) { lowW = Math.min(lowW, heightAt(x - 1, z + a)); lowE = Math.min(lowE, heightAt(x + w, z + a)); }
      for (let b = 0; b < w; b++) { lowN = Math.min(lowN, heightAt(x + b, z - 1)); lowS = Math.min(lowS, heightAt(x + b, z + d)); }
      const base = (v) => Math.max(STREET_Y - 2, v);
      if (lowW < h) quad(bucket, [[x0, base(lowW), z0], [x0, base(lowW), z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], p.col, 1, F);
      if (lowE < h) quad(bucket, [[x1, base(lowE), z1], [x1, base(lowE), z0], [x1, h, z0], [x1, h, z1]], [1, 0, 0], p.col, 1, F);
      if (lowN < h) quad(bucket, [[x1, base(lowN), z0], [x0, base(lowN), z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], p.col, 1, F);
      if (lowS < h) quad(bucket, [[x0, base(lowS), z1], [x1, base(lowS), z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], p.col, 1, F);
    }
    // The country: one quad to every sixteen blocks, tilted to the slope, and lifted where the forest stands on it.
    {
      const T = 16, mark = L.mark;
      // Over the tunnel (marked 32) the ground is the hill on top of it, not the road underneath: otherwise the ridge has a canyon in it.
      const overTunnel = (i) => (mark[i] & 32) && L.height[i] > 0;
      const at = (x, z) => { const i = Math.min(WZ - 1, z) * WX + Math.min(WX - 1, x); return ground[i] === G.WATER ? -4 : overTunnel(i) ? L.height[i] - STREET_Y : terr[i]; };
      const grass = srgb(M.GRASS, 1), wood = srgb(M.LEAF, .8), rock = srgb(M.SCHIST, 1), snow = srgb(M.SNOW, 1), field = srgb(M.GRASS_DRY, 1);
      const GC = { [G.ROAD]: srgb(M.ASPHALT, 1), [G.WALK]: srgb(M.WALK, 1), [G.LOT]: srgb(M.WALK2, 1), [G.PLAZA]: srgb(M.WALK2, 1), [G.ALLEY]: srgb(M.ALLEYWAY, 1), [G.CAMP]: srgb(M.GRAVEL, 1),
        [G.SAND]: srgb(M.SAND, 1), [G.DIRT]: srgb(M.PATH, 1), [G.FIELD]: srgb(M.SOIL, 1), [G.PROM]: srgb(M.WOOD, 1), [G.PARK]: grass, [G.ROCK]: rock, [G.WATER]: grass };
      // The colour of a patch of ground from afar: what covers most of it, blended.
      const patch = (x, z) => {
        const c = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          const sx = Math.min(WX - 1, x + 2 + (k & 1) * 8), sz = Math.min(WZ - 1, z + 2 + (k >> 1) * 8), g = overTunnel(sz * WX + sx) ? G.PARK : ground[sz * WX + sx];
          const fm = g === G.FIELD ? mark[sz * WX + sx] : 0, q = fm === 2 ? srgb(M.CORN, .8) : fm === 1 || fm === 3 || fm === 5 ? srgb(M.LEAF2, .75) : fm === 6 ? srgb(M.GRASS_DRY, 1) : GC[g] || grass;
          c[0] += q[0] / 4; c[1] += q[1] / 4; c[2] += q[2] / 4;
        }
        return c;
      };
      for (let z = 0; z < WZ; z += T) for (let x = 0; x < WX; x += T) {
        const a = at(x, z), b = at(x + T, z), c = at(x, z + T), e = at(x + T, z + T);
        // On the shore one tilted quad makes a long pale ramp out over the water, and the flat stand-in for low ground (the ground plane,
        // at street height) stands up over a low island like a slab. So any tile with water in it or within eight blocks of it is drawn
        // here, low or not, in steps of four blocks, each flat at its own height and dropping straight into the sea, as the built shore
        // does; the ground plane and the water's own cut-out both leave these tiles alone (coastal() in GROUND_FS and WATER_FS).
        const wet = (sx, sz) => sx < 0 || sz < 0 || sx >= WX || sz >= WZ || ground[sz * WX + sx] === G.WATER || (ground[sz * WX + sx] === G.PARK && terr[sz * WX + sx] < -2);
        let coast = false, dry = false;
        for (let sz = z - 8; sz <= z + T + 8 && !(coast && dry); sz += 4) for (let sx = x - 8; sx <= x + T + 8; sx += 4) {
          if (wet(sx, sz)) coast = true;
          else if (sx >= x && sx < x + T && sz >= z && sz < z + T) dry = true;
        }
        if (coast && dry) {
          const Q = 4;
          const hq = (qx, qz) => { const sx = x + qx * Q + 2, sz = z + qz * Q + 2; return wet(sx, sz) ? null : Math.max(STREET_Y + terr[sz * WX + sx], WATER_Y + .35); };
          const bk = tverts[Math.min(tverts.length - 1, Math.floor(z / BUCKET))], sea = WATER_Y - 2;
          for (let qz = 0; qz < T / Q; qz++) for (let qx = 0; qx < T / Q; qx++) {
            const h = hq(qx, qz);
            if (h === null) continue;
            const x0 = x + qx * Q, z0 = z + qz * Q, x1 = x0 + Q, z1 = z0 + Q, sx = x0 + 2, sz = z0 + 2;
            const col = GC[ground[sz * WX + sx]] || grass;
            quad(bk, [[x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0]], [0, 1, 0], col, .3);
            const low = (nx, nz) => { const v = (nx < 0 || nz < 0 || nx >= T / Q || nz >= T / Q) ? (wet(x + nx * Q + 2, z + nz * Q + 2) ? sea : h) : hq(nx, nz); return v === null ? sea : v; };
            const side = col.map((v) => v * .8);
            const lw = low(qx - 1, qz), le = low(qx + 1, qz), ln = low(qx, qz - 1), ls = low(qx, qz + 1);
            if (lw < h) quad(bk, [[x0, lw, z0], [x0, lw, z1], [x0, h, z1], [x0, h, z0]], [-1, 0, 0], side, .3);
            if (le < h) quad(bk, [[x1, le, z1], [x1, le, z0], [x1, h, z0], [x1, h, z1]], [1, 0, 0], side, .3);
            if (ln < h) quad(bk, [[x1, ln, z0], [x0, ln, z0], [x0, h, z0], [x1, h, z0]], [0, 0, -1], side, .3);
            if (ls < h) quad(bk, [[x0, ls, z1], [x1, ls, z1], [x1, h, z1], [x0, h, z1]], [0, 0, 1], side, .3);
          }
          continue;
        }
        if (Math.max(a, b, c, e) <= 2 && L.forestAt(x + 8, z + 8) < .3) continue;
        const i = (z + 8) * WX + x + 8, g = ground[i];
        if (g === G.WATER && Math.max(a, b, c, e) <= 6) continue;
        const canopy = (cx, cz) => { const j = Math.min(WZ - 1, cz) * WX + Math.min(WX - 1, cx); return ground[j] === G.PARK ? 8 * Math.max(0, Math.min(1, (L.forestAt(cx, cz) - .3) / .25)) : 0; };
        const ta = canopy(x, z), tb = canopy(x + T, z), tc = canopy(x, z + T), te = canopy(x + T, z + T), trees = (ta + tb + tc + te) / 4;
        const col = g === G.ROCK ? rock : trees > 4 ? wood : patch(x, z);
        // The ground only: the trees on it are drawn as pictures (FarTrees), so the forest floor is not raised into a slab.
        // At the height of the real ground (its surface is STREET_Y + terr), so the two meet level at the join.
        const y = (t) => STREET_Y + Math.max(t, -1);
        const nx = (a + c - b - e) / 2, nz = (a + b - c - e) / 2, nl = Math.hypot(nx, T, nz);
        quad(tverts[Math.min(tverts.length - 1, Math.floor(z / BUCKET))], [[x, y(c, tc), z + T], [x + T, y(e, te), z + T], [x + T, y(b, tb), z], [x, y(a, ta), z]], [nx / nl, T / nl, nz / nl], col, .3);
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
        // Right at the edge it starts a little below the ground there, so the country past it never stands up over the map and shows a
        // gap under it; it rises to the height of the trees over the first stretch out.
        // (The woods on it are pictures now, FarTrees, so the ground stays the ground.)
        const lift = -1.5 * (1 - Math.min(1, d / 90));
        return edgeH * (1 - k * k * (3 - 2 * k)) + (14 + 46 * vn(x / 700, z / 700) + 14 * vn(x / 180 + 3, z / 180)) * k * k * (3 - 2 * k) + lift;
      };
      const woodC = [srgb(M.LEAF, .75), srgb(M.LEAF2, .75), srgb(M.LEAF, .65)];
      const land = (x, z) => (x < 0 ? true : z < 0 ? x < topC : z >= WZ ? x < botC : false);
      this.skirt = { height: skirtH, land, FAR, noise: vn };
      for (let z = -FAR; z < WZ + FAR; z += S) for (let x = -FAR; x < WX; x += S) {
        if (x >= 0 && z >= 0 && z < WZ) continue;
        if (!land(x + S / 2, z + S / 2)) continue;
        const a = skirtH(x, z), b = skirtH(x + S, z), c = skirtH(x, z + S), e = skirtH(x + S, z + S);
        const y = (t) => STREET_Y - 1 + t;
        const nx = (a + c - b - e) / 2, nz = (a + b - c - e) / 2, nl = Math.hypot(nx, S, nz);
        const bucket = tverts[Math.max(0, Math.min(tverts.length - 1, Math.floor(z / BUCKET)))];
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

    // Settlements, from afar: the wall round them in what it is really built of, and everything inside it big enough to see over a
    // street (the shacks, the tents, the stalls, the halls, the towers, the church) as a block of its own walls under its own roof, where
    // it really stands. Benches, fire pits, lamp posts and the like are too small to matter from out there.
    const WALL_COL = { cabs: M.TAXI, containers: M.CONT_R, palisade: M.LOG, hesco: M.SANDBAG, sheet: M.STEEL, scrap: M.RUST, white: M.CAR_W, brick: M.BRICK_R, stone: M.GRANITE, qz: M.CONCRETE };
    const SKIP = new Set(['bench', 'firepit', 'lights', 'flag', 'flood', 'table', 'well', 'alarm', 'smokers', 'graves', 'crops', 'garden', 'mural', 'racks', 'goods', 'bonfire', 'court', 'divider', 'wreck', 'humvee', 'arch', 'windmill', 'crane', 'range']);
    const PLANK = { wall: M.PLANK, roof: M.ROOF_TAR };
    const LOOK = {
      tower: { wall: M.WOOD, roof: M.PLANK }, stall: { wall: M.PLANK, roof: M.AWN_R }, clinic: { wall: M.TENT_W, roof: M.TENT_W }, greenhouse: { wall: M.GLASS_C, roof: M.GLASS_C },
      tank: { wall: M.STEEL, roof: M.STEEL }, keep: { wall: M.GRANITE, roof: M.ROOF_GRAVEL }, cloister: { wall: M.LIMESTONE, roof: M.ROOF_TAR }, ferry: { wall: M.CAR_W, roof: M.STEEL },
    };
    const num = (v) => (typeof v === 'number' && v > 0 && v < 256 ? v : 0);
    for (const c of L.camps) {
      const col = srgb(WALL_COL[c.wall] || M.WOOD, 1);
      const top = STREET_Y + c.H;
      const edges = [[c.x0, c.z0, c.x1, c.z0 + 2], [c.x0, c.z1 - 2, c.x1, c.z1], [c.x0, c.z0, c.x0 + 2, c.z1], [c.x1 - 2, c.z0, c.x1, c.z1]];
      for (const [a, b, e, f] of edges) {
        for (let z = b; z < f; z += BUCKET) this.box(verts[Math.floor(z / BUCKET)], a, 3, z, e, top, Math.min(f, z + BUCKET), col, quad);
      }
      for (const p of c.parts) {
        if (SKIP.has(p.t) || p.h < 3 || (p.x1 - p.x0 + 1) * (p.z1 - p.z0 + 1) < 4) continue;
        if (p.t === 'hallchurch') {
          // The church: a long board nave under a pitched roof, stepped in towards the ridge, and the square tower over the door (the
          // east end) with its spire.
          const B = verts[Math.floor(p.z0 / BUCKET)], wallC = srgb(M.PLANK, 1), roofC = srgb(M.SHINGLE_R, 1);
          const zm = (p.z0 + p.z1 + 1) / 2, Wd = p.z1 - p.z0 + 1;
          this.box(B, p.x0, STREET_Y - 1, p.z0, p.x1 - 2, STREET_Y + 10, p.z1 + 1, wallC, quad, roofC, { glass: srgb(M.GLASS_T, 1), trim: srgb(M.WOOD_D, 1), p: 5, w: 2, cast: 0, phase: 1, lift: 0, house: false, blank: false });
          for (const [inset, top] of [[Wd * .22, 14], [Wd * .4, 18]]) this.box(B, p.x0, STREET_Y + 10, p.z0 + inset, p.x1 - 2, STREET_Y + top, p.z1 + 1 - inset, roofC, quad);
          this.box(B, p.x1 - 8, STREET_Y - 1, zm - 3.5, p.x1 - 2, STREET_Y + 23, zm + 3.5, wallC, quad, roofC);
          this.box(B, p.x1 - 6, STREET_Y + 23, zm - 1.5, p.x1 - 4, STREET_Y + 27, zm + 1.5, roofC, quad);
          continue;
        }
        const look = LOOK[p.t] || PLANK;
        // What it is made of, where the plan says: a shack's sheeting, a row house's brick, a tent's canvas.
        const wall = num(p.far) || num(p.mat) || num(p.col) || look.wall, roof = num(p.roof) || num(p.col) || look.roof;
        // Tents and shelters slope to a ridge: drawn a little lower than their peak, about where most of them is.
        const cloth = p.t === 'tent' || p.t === 'bunk' || p.t === 'shelter' || p.t === 'bigtent';
        const h = cloth ? Math.max(2, Math.round(p.h * .75)) : p.h;
        // Their walls drawn the way the city's are, so they are buildings and not plain blocks: a row house's windows up every storey,
        // a shack's or a hall's small ones, a tower's or a tank's bands; canvas only its seams.
        const glass = srgb(M.GLASS_K, 1), dark = srgb(M.WOOD_D, 1), ph = (p.x0 + p.z0) & 7;
        const face = p.t === 'rowhouse' ? { glass, trim: srgb(num(p.roof) || M.CONCRETE_D, 1), p: 3, w: 1, cast: 0, phase: ph, lift: 0, house: false, blank: false }
          : cloth ? { glass, trim: srgb(wall, .7), p: 3, w: 0, cast: 1, phase: ph, lift: 0, house: true, blank: false }
          : p.t === 'tower' || p.t === 'tank' || p.t === 'keep' || p.t === 'ferry' ? { glass, trim: dark, p: 4, w: 0, cast: 0, phase: 0, lift: 0, house: false, blank: true }
          : { glass, trim: dark, p: 4, w: 1, cast: 0, phase: ph, lift: 0, house: true, blank: false };
        this.box(verts[Math.floor(p.z0 / BUCKET)], p.x0, STREET_Y - 1, p.z0, p.x1 + 1, STREET_Y + h, p.z1 + 1, srgb(wall, 1), quad, srgb(roof, 1), face);
      }
    }

    for (let bb = 0; bb < verts.length * 2; bb++) {
      const ground = bb >= verts.length, b = bb % verts.length, arr = ground ? tverts[b] : verts[b];
      if (!arr.length) continue;
      const N = 19, SZ = 28, vertCount = arr.length / N;
      const buf = new ArrayBuffer(vertCount * SZ);
      const fv = new Float32Array(buf), iv = new Int8Array(buf), uv = new Uint8Array(buf);
      const c8 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
      for (let k = 0, o = 0; k < arr.length; k += N, o += SZ) {
        fv[o >> 2] = arr[k]; fv[(o >> 2) + 1] = arr[k + 1]; fv[(o >> 2) + 2] = arr[k + 2];
        iv[o + 12] = arr[k + 3] * 127; iv[o + 13] = arr[k + 4] * 127; iv[o + 14] = arr[k + 5] * 127; uv[o + 15] = arr[k + 18];
        uv[o + 16] = c8(arr[k + 6]); uv[o + 17] = c8(arr[k + 7]); uv[o + 18] = c8(arr[k + 8]); uv[o + 19] = c8(arr[k + 9]);
        uv[o + 20] = c8(arr[k + 10]); uv[o + 21] = c8(arr[k + 11]); uv[o + 22] = c8(arr[k + 12]); uv[o + 23] = arr[k + 13];
        uv[o + 24] = c8(arr[k + 14]); uv[o + 25] = c8(arr[k + 15]); uv[o + 26] = c8(arr[k + 16]); uv[o + 27] = arr[k + 17];
      }
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vb);
      gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, SZ, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.BYTE, true, SZ, 12);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, SZ, 16);
      // The facade: glass colour and window spacing, trim colour and window width (with the kind of wall in the high bits), and the
      // bits for where the windows start (raw bytes, unpacked in the shader).
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, false, SZ, 20);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, false, SZ, 24);
      gl.enableVertexAttribArray(5);
      gl.vertexAttribPointer(5, 1, gl.UNSIGNED_BYTE, false, SZ, 15);
      const idx = new Uint32Array(vertCount / 4 * 6);
      for (let q = 0, v = 0, k = 0; q < vertCount / 4; q++, v += 4) {
        idx[k++] = v; idx[k++] = v + 1; idx[k++] = v + 2; idx[k++] = v; idx[k++] = v + 2; idx[k++] = v + 3;
      }
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      this.buckets.push({ vao, count: idx.length, z0: b * BUCKET, z1: (b + 1) * BUCKET, first: b === 0, last: b === verts.length - 1, ground });
    }
  }

  box(out, x0, y0, z0, x1, y1, z1, col, quad, top = col, face = null) {
    const k = face ? 1 : 0, f = face || undefined;
    quad(out, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], top, 0);
    quad(out, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], col, k, f);
    quad(out, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], col, k, f);
    quad(out, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], col, k, f);
    quad(out, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], col, k, f);
  }

  draw(gl, planes, shadow = false) {
    for (const b of this.buckets) {
      if (shadow && b.ground) continue;
      if (!aabbInFrustum(planes, -3200, 0, b.z0 - (b.first ? 3200 : 0), WX, 256, b.z1 + (b.last ? 3200 : 0))) continue;
      gl.bindVertexArray(b.vao);
      gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_INT, 0);
    }
  }

  drawShadow(gl, planes) {
    this.draw(gl, planes, true);
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
    [G.SAND]: [150, 138, 104], [G.FIELD]: [104, 92, 56], [G.DIRT]: [126, 102, 74],
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
