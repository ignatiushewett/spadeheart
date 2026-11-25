import { WX, WZ, CW, STREET_Y, G } from '../shared/constants.js';
import { M, FLAGS, F_LEAF, F_CLOTH, F_GLASS } from '../shared/materials.js';

// Where grass grows strands, a long way round the camera: in each column, the grass block at the ground with open air on top of it,
// even under a tree, an awning or a lamp arm, and whether anything hangs over it at all. One pixel per column for the shader: how high,
// which grass, and whether it is under cover. Kept up to date a little at a time, like the rain map: new ground first as the camera
// moves, then a steady sweep for anything built or blown away. Only the rows that changed are sent to the card.
export const GRASS_N = 448;
const KIND = new Uint8Array(256);
KIND[M.GRASS] = 1; KIND[M.GRASS2] = 2; KIND[M.GRASS_DRY] = 3;
// What a strand can grow up through, looking down from the sky: leaves, canvas, glass.
const SEE = (id) => (FLAGS[id] & (F_LEAF | F_CLOTH | F_GLASS)) !== 0;

export class GrassMap {
  constructor(world) {
    this.w = world;
    this.rgba = new Uint8Array(GRASS_N * GRASS_N * 4);
    this.x0 = -1e6;
    this.z0 = -1e6;
    this.pending = new Int32Array(GRASS_N * GRASS_N);
    this.pendN = 0;
    this.sweep = 0;
    this.version = 0;
    this.retry = [];
    this.lo = GRASS_N; this.hi = -1;   // the rows changed since the card last had them
  }

  // Rows lo to hi (inclusive) that need sending; taken and cleared by the renderer.
  takeRows() {
    const r = this.hi >= this.lo ? [this.lo, this.hi] : null;
    this.lo = GRASS_N; this.hi = -1;
    return r;
  }

  touch(row) { if (row < this.lo) this.lo = row; if (row > this.hi) this.hi = row; this.dirty = true; }

  update(cx, cz) {
    const N = GRASS_N;
    const nx0 = Math.floor(cx / 16) * 16 - N / 2, nz0 = Math.floor(cz / 16) * 16 - N / 2;
    if (nx0 !== this.x0 || nz0 !== this.z0) {
      // Slide what is known across a row at a time, and queue only the strips that are new.
      const old = this.rgba, rgba = new Uint8Array(N * N * 4), dx = nx0 - this.x0, dz = nz0 - this.z0;
      this.pendN = 0;
      this.retry.length = 0;
      const xa = Math.max(0, -dx), xb = Math.min(N, N - dx);
      for (let iz = 0; iz < N; iz++) {
        const oz = iz + dz, inside = oz >= 0 && oz < N;
        if (inside && xb > xa) rgba.set(old.subarray((oz * N + xa + dx) * 4, (oz * N + xb + dx) * 4), (iz * N + xa) * 4);
        for (let ix = 0; ix < N; ix++) if (!inside || ix < xa || ix >= xb) this.pending[this.pendN++] = ix + iz * N;
      }
      this.rgba = rgba;
      this.x0 = nx0; this.z0 = nz0;
      this.lo = 0; this.hi = N - 1; this.dirty = true;
    }
    // A budget of blocks looked at, not of columns, so a frame never does more than its share however the ground lies.
    this.steps = 0;
    const limit = 30000;
    if (this.retry.length) { const again = this.retry.splice(0, 600); for (const i of again) this.scan(i); }
    while (this.pendN > 0 && this.steps < limit) this.scan(this.pending[--this.pendN]);
    for (let k = 0; k < 300 && this.steps < limit; k++) {
      this.scan(this.sweep);
      this.sweep = (this.sweep + 1) % (N * N);
    }
    if (this.dirty) { this.version++; this.dirty = false; }
  }

  scan(i) {
    const N = GRASS_N, w = this.w, x = this.x0 + (i % N), z = this.z0 + ((i / N) | 0), o = i * 4, rgba = this.rgba, row = (i / N) | 0;
    const was = rgba[o] | (rgba[o + 1] << 8) | (rgba[o + 2] << 16);
    const set = (h, k, c) => { rgba[o] = h; rgba[o + 1] = k; rgba[o + 2] = c; if ((h | (k << 8) | (c << 16)) !== was) this.touch(row); };
    this.steps++;
    if (x < 0 || z < 0 || x >= WX || z >= WZ) { set(0, 0, 0); return; }
    const L = w.L, j = z * WX + x, base = STREET_Y + L.terr[j] - 1;
    // Not built yet, out past where the world is loaded: the lie of the land says where the grass is, until the real ground arrives.
    if (!w.loadMask[(x >> 5) + (z >> 5) * CW]) {
      if (L.ground[j] === G.PARK && L.terr[j] >= 0) set(base, 1, 0); else set(0, 0, 0);
      if (this.retry.length < 40000) this.retry.push(i);
      return;
    }
    // Look at the ground where the map says it is, a block or two either way, not down through everything built on top of it.
    for (let y = base + 2; y >= base - 2; y--) {
      this.steps++;
      const id = w.get(x, y, z);
      if (KIND[id]) { this.grassAt(x, y, z, set); return; }
      if (id && !SEE(id) && y > base) { set(0, 0, 0); return; }
    }
    set(0, 0, 0);
  }

  // Grass at y: open air on top of it (or leaves, canvas, glass), and is there anything over it at all, up to a tree's height.
  grassAt(x, y, z, set) {
    const w = this.w, kind = KIND[w.get(x, y, z)], over = w.get(x, y + 1, z);
    this.steps += 2;
    if (over && !SEE(over)) { set(0, 0, 0); return; }
    let covered = over ? 1 : 0;
    for (let k = 2; k <= 14 && !covered; k += 3) { this.steps++; if (w.get(x, y + k, z)) covered = 1; }
    set(y, kind, covered ? 255 : 0);
  }
}
