import { WX, WZ, CW, STREET_Y } from '../shared/constants.js';

// Where the rain stops: the highest solid block in every column around the camera. Rain is drawn above it and nowhere
// below, so it falls past the window and not through the ceiling, and dripping edges are found from the same map.
// Kept up to date a little at a time: new ground as the camera moves first, then a steady sweep for anything blown away.
export const RAIN_N = 96;

export class RainMap {
  constructor(world) {
    this.w = world;
    this.top = new Uint8Array(RAIN_N * RAIN_N);
    this.hang = new Uint8Array(RAIN_N * RAIN_N);   // nothing directly under the top block: it overhangs
    // Under the cover: the first open space below it, top and bottom. Under a lamp arm that is the whole street; in a doorway it is
    // the opening under the lintel; in a wall there is none until the ground. Rain can blow sideways through that space and nowhere else.
    this.gapTop = new Uint8Array(RAIN_N * RAIN_N);
    this.floor = new Uint8Array(RAIN_N * RAIN_N);
    this.rgba = new Uint8Array(RAIN_N * RAIN_N * 4);
    this.x0 = -1e6;
    this.z0 = -1e6;
    this.pending = new Int32Array(RAIN_N * RAIN_N);
    this.pendN = 0;
    this.sweep = 0;
    this.version = 0;
  }

  // The top of this column, or -1 if it is outside the map.
  at(x, z) {
    const i = this.index(x, z);
    return i < 0 ? -1 : this.top[i];
  }

  index(x, z) {
    const ix = Math.floor(x) - this.x0, iz = Math.floor(z) - this.z0;
    if (ix < 0 || iz < 0 || ix >= RAIN_N || iz >= RAIN_N) return -1;
    return ix + iz * RAIN_N;
  }

  update(cx, cz) {
    const N = RAIN_N;
    const nx0 = Math.floor(cx / 8) * 8 - N / 2, nz0 = Math.floor(cz / 8) * 8 - N / 2;
    if (nx0 !== this.x0 || nz0 !== this.z0) {
      // Slide what is already known across, and queue only the new strip.
      const top = new Uint8Array(N * N), hang = new Uint8Array(N * N), gapTop = new Uint8Array(N * N), floor = new Uint8Array(N * N);
      const dx = nx0 - this.x0, dz = nz0 - this.z0;
      this.pendN = 0;
      for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
        const ox = ix + dx, oz = iz + dz, i = ix + iz * N;
        if (ox >= 0 && oz >= 0 && ox < N && oz < N) { const o = ox + oz * N; top[i] = this.top[o]; hang[i] = this.hang[o]; gapTop[i] = this.gapTop[o]; floor[i] = this.floor[o]; }
        else this.pending[this.pendN++] = i;
      }
      // Nearest first, so what is around you is right before what is at the edge.
      if (this.pendN > 0) {
        const mid = N / 2, list = Array.from(this.pending.subarray(0, this.pendN));
        list.sort((a, b) => Math.abs((a % N) - mid) + Math.abs(((a / N) | 0) - mid) - Math.abs((b % N) - mid) - Math.abs(((b / N) | 0) - mid));
        this.pending.set(list);
      }
      this.top = top; this.hang = hang; this.gapTop = gapTop; this.floor = floor;
      this.x0 = nx0; this.z0 = nz0;
    }
    let budget = 1500;
    while (this.pendN > 0 && budget > 0) { this.scan(this.pending[--this.pendN]); budget -= 3; }
    for (let k = 0; k < 360 && budget > 0; k++, budget--) {
      this.scan(this.sweep);
      this.sweep = (this.sweep + 1) % (N * N);
    }
    this.version++;
  }

  // Everything the shaders need, one pixel per column.
  packed() {
    const { top, gapTop, floor, rgba } = this;
    for (let i = 0, n = top.length; i < n; i++) { const o = i * 4; rgba[o] = top[i]; rgba[o + 1] = gapTop[i]; rgba[o + 2] = floor[i]; }
    return rgba;
  }

  scan(i) {
    const N = RAIN_N, w = this.w, x = this.x0 + (i % N), z = this.z0 + ((i / N) | 0);
    if (x < 0 || z < 0 || x >= WX || z >= WZ) { this.top[i] = 0; this.hang[i] = 0; this.gapTop[i] = 0; this.floor[i] = 0; return; }
    let y = Math.min(255, w.colTopCy((x >> 5) + (z >> 5) * CW) * 32 + 31);
    while (y > 0 && !w.get(x, y, z)) y--;
    this.top[i] = y;
    this.hang[i] = y > STREET_Y && !w.get(x, y - 1, z) ? 1 : 0;
    let a = y - 1;
    while (a > 0 && w.get(x, a, z)) a--;
    let f = a;
    while (f > 0 && !w.get(x, f, z)) f--;
    this.gapTop[i] = a;
    this.floor[i] = f;
  }
}
