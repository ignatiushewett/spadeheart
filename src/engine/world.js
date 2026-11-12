// Voxel world on the main thread: chunk streaming, edit storage, queries and destruction.
import { CS, CS3, WX, WY, WZ, CW, CD, CH, STREET_Y, G } from '../shared/constants.js';
import { M, HP, FLAGS, F_GLASS, F_LEAF } from '../shared/materials.js';
import { P as PROP, PROP_STRIDE } from '../shared/layout.js';

const P = CS + 2;
const PP = P * P;
// The bonnet of a car is only one voxel high, but nothing stands around inside it.
const VEHICLE = new Uint8Array(256);
for (const id of [M.TAXI, M.CAR_W, M.CAR_K, M.CAR_R, M.CAR_B, M.CAR_S, M.TIRE, M.CAR_GLASS, M.HEADLIGHT, M.TAILLIGHT, M.BUS, M.BURNT, M.TRUNK_LOOT]) VEHICLE[id] = 1;
const COL = CW * CD;
export const LOD_RADIUS = 110;

class Chunk {
  constructor(cx, cy, cz) {
    this.cx = cx; this.cy = cy; this.cz = cz;
    this.data = null;
    this.ready = false;       // voxels available
    this.pending = false;     // generation in flight
    this.meshReady = false;   // has been meshed at least once
    this.meshing = false;
    this.dirty = true;
    this.ver = 0;
    this.lod = -1;
    this.edited = false;
    this.vao = null;
    this.vbo = null;
    this.oq = 0;
    this.gq = 0;
  }
}

export class World {
  constructor(layout, renderer) {
    this.L = layout;
    this.r = renderer;
    this.chunks = new Array(COL * CH).fill(null);
    this.edits = new Map();     // chunk index -> Map(voxel index -> id)
    this.damage = new Map();    // packed voxel -> accumulated damage
    this.workers = [];
    this.idle = [];
    this.pendingGen = 0;
    this.columns = [];          // wanted columns sorted by distance
    this.colState = new Uint8Array(COL);
    this.editTop = new Uint8Array(COL);
    this.lastCX = -999;
    this.lastCZ = -999;
    this.viewRadius = 288;
    this.loadMask = new Uint8Array(COL);
    this.maskDirty = true;
    this.highPrio = [];
    this.stats = { chunks: 0, quads: 0 };
    this.floatQueue = [];
    this.onVoxelChange = null;
    this.onCollapse = null;
    this.onRemoved = null;
    // Coarse walkability, 2-voxel cells, for the horde flow field.
    this.walkW = WX >> 1;
    this.walkD = WZ >> 1;
    this.walk = new Uint8Array(this.walkW * this.walkD);
    this.initWalk();
  }

  initWorkers(count) {
    const shareable = {
      ground: this.L.ground, lot: this.L.lot, edge: this.L.edge, height: this.L.height, mark: this.L.mark, terr: this.L.terr,
      buildings: this.L.buildings, structs: this.L.structs, chunkTop: this.L.chunkTop,
      // Workers only build the camps. People and paths stay on this side.
      camps: this.L.camps.map((c) => ({ id: c.id, wall: c.wall, H: c.H, hc: c.hc, door: c.door, flag: c.flag, emblem: c.emblem, x0: c.x0, x1: c.x1, z0: c.z0, z1: c.z1, cx: c.cx, cz: c.cz, gates: c.gates, parts: c.parts })),
      props: this.L.props, binStart: this.L.binStart, binData: this.L.binData,
    };
    return new Promise((resolve) => {
      let waiting = count;
      for (let i = 0; i < count; i++) {
        const w = new Worker(new URL('../shared/worker.js', import.meta.url), { type: 'module' });
        w.onmessage = (e) => {
          if (e.data.t === 'ready') {
            this.idle.push(w);
            if (--waiting === 0) resolve();
          } else {
            this.onWorker(w, e.data);
          }
        };
        w.onerror = (e) => console.error('worker error', e.message, e.filename, e.lineno);
        w.postMessage({ t: 'init', layout: shareable });
        this.workers.push(w);
      }
    });
  }

  initWalk() {
    const { ground, terr } = this.L;
    const W = this.walkW, D = this.walkD;
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      const i = (z << 1) * WX + (x << 1);
      const g = ground[i];
      this.walk[x + z * W] = g !== G.WATER && g !== G.LOT && terr[i] >= -2 && g !== G.ROCK ? 1 : 0;
    }
    // Nothing walks through a parked car, even before its chunk has loaded.
    const { props } = this.L;
    const blockRect = (x0, z0, x1, z1) => {
      for (let z = z0 >> 1; z <= z1 >> 1; z++) for (let x = x0 >> 1; x <= x1 >> 1; x++) {
        if (x >= 0 && z >= 0 && x < W && z < D) this.walk[x + z * W] = 0;
      }
    };
    for (let k = 0; k < props.length; k += PROP_STRIDE) {
      const t = props[k], x = props[k + 1], z = props[k + 2], a = props[k + 3], b = props[k + 4];
      if (t === PROP.CAR) {
        const len = b === 2 ? 20 : b === 3 ? 13 : b === 5 ? 11 : 9, wid = b === 2 || b === 3 || b === 5 ? 5 : 4;
        if (a === 0) blockRect(x, z, x + wid - 1, z + len - 1); else blockRect(x, z, x + len - 1, z + wid - 1);
      } else if (t === PROP.DUMPSTER) blockRect(x, z, x + (a ? 4 : 2), z + (a ? 2 : 4));
      else if (t === PROP.NEWS) blockRect(x, z, x + 3, z + 2);
      else if (t === PROP.CHECKPOINT) blockRect(x - 2, z - 2, x + 2, z + 4);
    }
    // Camp walls block the horde even before their chunks have loaded.
    const block = (wx, wz) => { this.walk[(wx >> 1) + (wz >> 1) * W] = 0; };
    for (const c of this.L.camps) {
      for (let x = c.x0; x <= c.x1; x += 2) { block(x, c.z0); block(x, c.z1); }
      for (let z = c.z0; z <= c.z1; z += 2) { block(c.x0, z); block(c.x1, z); }
    }
  }

  refreshWalkCell(wx, wz) {
    const { terr, ground } = this.L;
    const x = wx >> 1, z = wz >> 1;
    if (x < 0 || z < 0 || x >= this.walkW || z >= this.walkD) return;
    // In a camp's wall, a gap a single block wide is still a way through: the cell is open if one line of it is clear right through
    // the thickness of the wall, two high.
    const bx = x << 1, bz = z << 1;
    for (const c of this.L.camps) {
      const onNS = bx >= c.x0 - 1 && bx <= c.x1 + 1 && (Math.abs(bz - c.z0) <= 2 || Math.abs(bz - c.z1) <= 2);
      const onEW = bz >= c.z0 - 1 && bz <= c.z1 + 1 && (Math.abs(bx - c.x0) <= 2 || Math.abs(bx - c.x1) <= 2);
      if (!onNS && !onEW) continue;
      const clear = (vx, vz) => { const y0 = STREET_Y + terr[vz * WX + vx]; return !this.get(vx, y0, vz) && !this.get(vx, y0 + 1, vz); };
      let through = false;
      if (onNS) for (let dx = 0; dx < 2 && !through; dx++) through = clear(bx + dx, bz) && clear(bx + dx, bz + 1);
      if (onEW && !through) for (let dz = 0; dz < 2 && !through; dz++) through = clear(bx, bz + dz) && clear(bx + 1, bz + dz);
      this.walk[x + z * this.walkW] = through ? 1 : 0;
      return;
    }
    let ok = 1;
    for (let dz = 0; dz < 2 && ok; dz++) for (let dx = 0; dx < 2 && ok; dx++) {
      const vx = (x << 1) + dx, vz = (z << 1) + dz;
      const i = vz * WX + vx;
      const g = ground[i];
      if (g === G.WATER) { ok = 0; break; }
      const y0 = STREET_Y + terr[i];
      if (y0 < STREET_Y - 2) { ok = 0; break; }
      if (VEHICLE[this.get(vx, y0, vz)]) ok = 0;
      else if (this.get(vx, y0, vz) && this.get(vx, y0 + 1, vz)) ok = 0;
      else if (this.get(vx, y0 + 1, vz) || this.get(vx, y0 + 2, vz)) ok = 0;
    }
    this.walk[x + z * this.walkW] = ok;
  }

  chunkAt(cx, cy, cz) {
    if (cx < 0 || cz < 0 || cy < 0 || cx >= CW || cz >= CD || cy >= CH) return null;
    return this.chunks[cx + cz * CW + cy * COL];
  }

  ensure(cx, cy, cz) {
    const i = cx + cz * CW + cy * COL;
    let c = this.chunks[i];
    if (!c) { c = new Chunk(cx, cy, cz); this.chunks[i] = c; }
    return c;
  }

  get(x, y, z) {
    if (y < 0) return M.BEDROCK;
    if (y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
    const c = this.chunks[(x >> 5) + (z >> 5) * CW + (y >> 5) * COL];
    if (!c || !c.ready) return y < STREET_Y - 1 ? M.STONE : 0;
    const d = c.data;
    return d ? d[(x & 31) | ((y & 31) << 5) | ((z & 31) << 10)] : 0;
  }

  isLoaded(x, y, z) {
    if (y < 0 || y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return true;
    const c = this.chunks[(x >> 5) + (z >> 5) * CW + (y >> 5) * COL];
    return !!c && c.ready;
  }

  // Solid for physics; leaves are pass-through so the street trees do not snag players.
  solid(x, y, z) {
    const id = this.get(x, y, z);
    return id !== 0 && !(FLAGS[id] & F_LEAF);
  }

  terrainTop(x, z) {
    x |= 0; z |= 0;
    if (x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
    return STREET_Y + this.L.terr[z * WX + x];
  }

  // Highest standable y at or below `fromY` (falls back to terrain when unloaded).
  groundBelow(x, fromY, z, scan = 8) {
    const ix = Math.floor(x), iz = Math.floor(z);
    let y = Math.floor(fromY);
    for (let k = 0; k < scan; k++, y--) if (this.solid(ix, y - 1, iz)) return y;
    return this.terrainTop(ix, iz);
  }

  // --- Streaming ------------------------------------------------------------
  update(px, pz) {
    const pcx = Math.floor(px) >> 5, pcz = Math.floor(pz) >> 5;
    this.px = px; this.pz = pz;
    if (pcx !== this.lastCX || pcz !== this.lastCZ) {
      this.lastCX = pcx; this.lastCZ = pcz;
      this.rebuildWanted(pcx, pcz);
    }
    this.pump();
    if (this.maskDirty && this.r) {
      this.maskDirty = false;
      this.r.updateLoadMask(this.loadMask);
    }
    this.processFloating();
  }

  rebuildWanted(pcx, pcz) {
    const R = Math.ceil(this.viewRadius / CS) + 1;
    const list = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > R * R) continue;
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < 0 || cz < 0 || cx >= CW || cz >= CD) continue;
      list.push(d2 << 16 | (cx + cz * CW));
    }
    list.sort((a, b) => a - b);
    this.columns = list.map((v) => v & 0xffff);
    this.wantedSet = new Set(this.columns);
    this.scan = 0;
    this.unloadFar(pcx, pcz, R + 2);
  }

  unloadFar(pcx, pcz, R) {
    const gl = this.r && this.r.gl;
    for (let col = 0; col < COL; col++) {
      if (!this.colState[col]) continue;
      const cx = col % CW, cz = (col / CW) | 0;
      const dx = cx - pcx, dz = cz - pcz;
      if (dx * dx + dz * dz <= R * R) continue;
      for (let cy = 0; cy < CH; cy++) {
        const i = col + cy * COL;
        const c = this.chunks[i];
        if (!c) continue;
        if (c.vao) { gl.deleteVertexArray(c.vao); gl.deleteBuffer(c.vbo); }
        this.stats.quads -= c.oq + c.gq;
        c.dead = true;
        this.chunks[i] = null;
      }
      this.colState[col] = 0;
      if (this.loadMask[col]) { this.loadMask[col] = 0; this.maskDirty = true; }
    }
  }

  colTopCy(col) { return Math.max(this.editTop[col], Math.min(CH - 1, this.L.chunkTop[col] >> 5)); }

  pump() {
    const wx = Math.floor(this.px), wz = Math.floor(this.pz);
    const pcx = wx >> 5, pcz = wz >> 5;
    // Player edits first: they must feel instant.
    while (this.idle.length && this.highPrio.length) {
      const c = this.highPrio.shift();
      c.queued = false;
      if (c.dead || !c.dirty) continue;
      if (!this.sendMesh(c, this.idle[this.idle.length - 1])) continue;
      this.idle.pop();
    }
    const lodR2 = (LOD_RADIUS / CS) ** 2;
    let budget = this.idle.length;
    if (!budget) return;
    const meshR = Math.ceil(this.viewRadius / CS);
    const list = this.columns;
    for (let k = this.scan || 0; k < list.length && budget > 0; k++) {
      const col = list[k];
      const cx = col % CW, cz = (col / CW) | 0;
      const dx = cx - pcx, dz = cz - pcz, d2 = dx * dx + dz * dz;
      const top = this.colTopCy(col);
      let columnDone = true;
      this.colState[col] = 1;
      for (let cy = 0; cy <= top && budget > 0; cy++) {
        const c = this.ensure(cx, cy, cz);
        if (!c.ready) {
          columnDone = false;
          if (!c.pending) {
            c.pending = true;
            this.idle.pop().postMessage({ t: 'gen', cx, cy, cz });
            budget--;
          }
        } else if (d2 <= meshR * meshR) {
          const lod = (d2 > lodR2 && !c.edited) ? 1 : 0;
          if (c.dirty || (c.meshReady && c.lod !== lod && !c.meshing)) {
            if (c.meshing) { columnDone = false; continue; }
            if (!c.data) { c.dirty = false; c.meshReady = true; c.lod = lod; continue; }
            if (!this.neighboursReady(c)) { columnDone = false; continue; }
            const w = this.idle[this.idle.length - 1];
            if (this.sendMesh(c, w, lod)) { this.idle.pop(); budget--; }
            columnDone = false;
          } else if (c.meshing) columnDone = false;
        }
      }
      if (d2 <= meshR * meshR) {
        let meshed = true;
        for (let cy = 0; cy <= top; cy++) {
          const c = this.chunks[col + cy * COL];
          if (!c || !c.meshReady) { meshed = false; break; }
        }
        const val = meshed ? 1 : 0;
        if (this.loadMask[col] !== val) { this.loadMask[col] = val; this.maskDirty = true; }
      }
      if (budget <= 0) columnDone = false;
      if (columnDone && k === (this.scan || 0)) this.scan = k + 1;
    }
  }

  neighboursReady(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const cx = c.cx + dx, cy = c.cy + dy, cz = c.cz + dz;
      if (cx < 0 || cz < 0 || cy < 0 || cx >= CW || cz >= CD || cy >= CH) continue;
      const col = cx + cz * CW;
      if (cy > this.colTopCy(col)) {
        const n = this.chunks[col + cy * COL];
        if (n && !n.ready) return false;
        continue;
      }
      const n = this.chunks[col + cy * COL];
      if (!n || !n.ready) {
        if (!this.wantedSet || !this.wantedSet.has(col)) continue; // outside load range: treat as empty
        return false;
      }
    }
    return true;
  }

  sendMesh(c, worker, lod) {
    if (lod === undefined) lod = c.lod >= 0 ? (c.edited ? 0 : c.lod) : 0;
    if (!c.data) { c.dirty = false; c.meshReady = true; return false; }
    const pad = new Uint8Array(P * P * P);
    this.fillPadded(c, pad);
    c.dirty = false;
    c.meshing = true;
    c.ver++;
    worker.postMessage({ t: 'mesh', cx: c.cx, cy: c.cy, cz: c.cz, ver: c.ver, lod, data: pad }, [pad.buffer]);
    return true;
  }

  fillPadded(c, pad) {
    const d = c.data;
    if (d) {
      for (let z = 0; z < CS; z++) for (let y = 0; y < CS; y++) {
        pad.set(d.subarray((y << 5) | (z << 10), ((y << 5) | (z << 10)) + CS), 1 + (y + 1) * P + (z + 1) * PP);
      }
    }
    const ox = c.cx * CS, oy = c.cy * CS, oz = c.cz * CS;
    for (let z = -1; z <= CS; z++) for (let y = -1; y <= CS; y++) {
      const shellYZ = z < 0 || z >= CS || y < 0 || y >= CS;
      if (shellYZ) {
        for (let x = -1; x <= CS; x++) pad[(x + 1) + (y + 1) * P + (z + 1) * PP] = this.getRaw(ox + x, oy + y, oz + z);
      } else {
        pad[(y + 1) * P + (z + 1) * PP] = this.getRaw(ox - 1, oy + y, oz + z);
        pad[CS + 1 + (y + 1) * P + (z + 1) * PP] = this.getRaw(ox + CS, oy + y, oz + z);
      }
    }
  }

  getRaw(x, y, z) {
    if (y < 0) return M.BEDROCK;
    if (y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return 0;
    const c = this.chunks[(x >> 5) + (z >> 5) * CW + (y >> 5) * COL];
    if (!c || !c.data) return 0;
    return c.data[(x & 31) | ((y & 31) << 5) | ((z & 31) << 10)];
  }

  onWorker(w, m) {
    this.idle.push(w);
    const i = m.cx + m.cz * CW + m.cy * COL;
    const c = this.chunks[i];
    if (m.t === 'gen') {
      if (!c) return;
      c.pending = false;
      c.data = m.data;
      const ed = this.edits.get(i);
      if (ed) {
        if (!c.data) c.data = new Uint8Array(CS3);
        for (const [k, id] of ed) c.data[k] = id;
        c.edited = true;
      }
      c.ready = true;
      c.dirty = true;
      if (m.cy === 0) {
        // Street-level detail (cars, doors, walls) refines the coarse walk grid.
        const ox = m.cx * CS, oz = m.cz * CS;
        for (let z = 0; z < CS; z += 2) for (let x = 0; x < CS; x += 2) this.refreshWalkCell(ox + x, oz + z);
      }
      // Neighbours meshed before this chunk existed may need their borders redone.
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const n = this.chunkAt(m.cx + dx, m.cy + dy, m.cz + dz);
        if (n && n.meshReady && n.data && m.data) { n.dirty = true; this.scan = 0; }
      }
    } else if (m.t === 'mesh') {
      if (!c) return;
      if (m.ver === c.ver) c.meshing = false;
      if (m.ver < c.ver) return;
      this.uploadMesh(c, m);
    }
    this.pump();
  }

  uploadMesh(c, m) {
    const gl = this.r.gl;
    this.stats.quads += m.oq + m.gq - c.oq - c.gq;
    c.oq = m.oq; c.gq = m.gq; c.lod = m.lod; c.meshReady = true;
    if (m.oq + m.gq === 0) {
      if (c.vao) { gl.deleteVertexArray(c.vao); gl.deleteBuffer(c.vbo); c.vao = null; c.vbo = null; }
      return;
    }
    if (!c.vao) {
      c.vao = gl.createVertexArray();
      c.vbo = gl.createBuffer();
      gl.bindVertexArray(c.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
      gl.enableVertexAttribArray(0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribIPointer(0, 4, gl.UNSIGNED_BYTE, 8, 0);
      gl.vertexAttribIPointer(1, 4, gl.UNSIGNED_BYTE, 8, 4);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.r.quadIndex);
      gl.bindVertexArray(null);
    }
    this.r.ensureQuadIndex(m.oq + m.gq);
    gl.bindBuffer(gl.ARRAY_BUFFER, c.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, m.verts, gl.STATIC_DRAW);
  }

  // All loaded chunks that have geometry, for the renderer.
  forEachMesh(fn) {
    for (const col of this.columns) {
      for (let cy = 0; cy < CH; cy++) {
        const c = this.chunks[col + cy * COL];
        if (c && c.vao) fn(c);
      }
    }
  }

  // --- Edits ------------------------------------------------------------------
  set(x, y, z, id, record = true) {
    if (y < 0 || y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) return false;
    const cx = x >> 5, cy = y >> 5, cz = z >> 5;
    const i = cx + cz * CW + cy * COL;
    const col = cx + cz * CW;
    let c = this.chunks[i];
    if (!c && this.colState[col] && cy > this.colTopCy(col)) {
      // Building above the generated column: open up an empty chunk.
      c = this.ensure(cx, cy, cz);
      c.ready = true;
      c.meshReady = true;
      c.dirty = false;
    }
    if (!c || !c.ready) return false;
    if (!c.data) c.data = new Uint8Array(CS3);
    const k = (x & 31) | ((y & 31) << 5) | ((z & 31) << 10);
    const old = c.data[k];
    if (old === id) return false;
    c.data[k] = id;
    if (old && !id && this.onRemoved) this.onRemoved(x, y, z, old);
    if (record) {
      let e = this.edits.get(i);
      if (!e) { e = new Map(); this.edits.set(i, e); }
      e.set(k, id);
      this.editsDirty = true;
      if (cy > this.editTop[col]) this.editTop[col] = cy;
    }
    c.edited = true;
    this.touch(c);
    const lx = x & 31, ly = y & 31, lz = z & 31;
    if (lx === 0) this.touchAt(cx - 1, cy, cz); else if (lx === 31) this.touchAt(cx + 1, cy, cz);
    if (ly === 0) this.touchAt(cx, cy - 1, cz); else if (ly === 31) this.touchAt(cx, cy + 1, cz);
    if (lz === 0) this.touchAt(cx, cy, cz - 1); else if (lz === 31) this.touchAt(cx, cy, cz + 1);
    if (y >= STREET_Y - 2 && y < STREET_Y + 4) this.refreshWalkCell(x, z);
    if (this.onVoxelChange) this.onVoxelChange(x, y, z);
    return true;
  }

  touchAt(cx, cy, cz) { const n = this.chunkAt(cx, cy, cz); if (n) this.touch(n); }

  touch(c) {
    c.dirty = true;
    c.lod = 0;
    if (!c.queued) { c.queued = true; this.highPrio.push(c); }
  }

  // Apply damage to one voxel. Returns the id that broke, or 0.
  hit(x, y, z, dmg) {
    const id = this.get(x, y, z);
    if (!id || HP[id] === 255) return 0;
    const key = x + z * WX + y * WX * WZ;
    const total = (this.damage.get(key) || 0) + dmg;
    if (total >= HP[id]) {
      this.damage.delete(key);
      if (this.set(x, y, z, 0)) {
        this.queueFloatCheck(x, y, z);
        return id;
      }
      return 0;
    }
    this.damage.set(key, total);
    if (this.damage.size > 4000) this.damage.clear();
    return 0;
  }

  // Carve a sphere; returns a sample of destroyed voxels for debris.
  explode(cx, cy, cz, radius, strength = 40) {
    const removed = [];
    const r = Math.ceil(radius);
    const ix = Math.floor(cx), iy = Math.floor(cy), iz = Math.floor(cz);
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > radius * radius) continue;
      const x = ix + dx, y = iy + dy, z = iz + dz;
      const id = this.get(x, y, z);
      if (!id || HP[id] === 255) continue;
      const fall = strength * (1 - Math.sqrt(d2) / (radius + 1));
      if (HP[id] > fall && d2 > radius * radius * .35) continue;
      if (y < 3) continue;
      if (this.set(x, y, z, 0)) removed.push(x, y, z, id);
    }
    for (let k = 0; k < removed.length; k += 4 * 8) this.queueFloatCheck(removed[k], removed[k + 1], removed[k + 2]);
    if (removed.length) {
      // Seeds on the crater rim catch whatever the blast cut loose.
      for (const [dx, dy, dz] of [[0, r + 1, 0], [r + 1, 0, 0], [-r - 1, 0, 0], [0, 0, r + 1], [0, 0, -r - 1], [r, r, 0], [-r, r, 0], [0, r, r], [0, r, -r]]) {
        this.floatQueue.push(ix + dx, iy + dy, iz + dz, 1);
      }
    }
    return removed;
  }

  queueFloatCheck(x, y, z) {
    this.floatQueue.push(x, y, z, 0);
  }

  processFloating() {
    let budget = 3;
    while (this.floatQueue.length && budget-- > 0) {
      const direct = this.floatQueue.pop(), z = this.floatQueue.pop(), y = this.floatQueue.pop(), x = this.floatQueue.pop();
      // Already gone (it came down with something checked before it): costs nothing.
      if (direct && !this.get(x, y, z)) { budget++; continue; }
      if (direct) { this.tryCollapse(x, y, z); continue; }
      for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) this.tryCollapse(x + dx, y + dy, z + dz);
    }
  }

  // Ace-of-Spades rule: anything no longer connected to the ground comes down.
  tryCollapse(sx, sy, sz) {
    if (!this.get(sx, sy, sz)) return;
    const LIMIT = 16000;
    const lot = this.L.lot;
    const seen = new Set();
    const key = (x, y, z) => x + z * WX + y * WX * WZ;
    const stack = [sx, sy, sz];
    seen.add(key(sx, sy, sz));
    const list = [];
    while (stack.length) {
      const z = stack.pop(), y = stack.pop(), x = stack.pop();
      if (y <= STREET_Y - 2) return;
      if (!this.isLoaded(x, y, z)) return;
      list.push(x, y, z);
      if (list.length > LIMIT * 3) return;
      const lotHere = lot[z * WX + x];
      // Leaves hold nothing up. Whatever is built can't lean on a tree's canopy, and a canopy is only held by its own trunk, or by
      // something it is resting its weight on from above (a crop on its soil). So: nothing steps from the solid world into leaves
      // except a trunk, and from leaves nothing steps sideways or up into anything but leaves and trunk.
      const here = this.getRaw(x, y, z), hereLeaf = !!(FLAGS[here] & F_LEAF), hereTrunk = here === M.TRUNK;
      // Pushing "down" last explores it first, so grounded structures exit quickly.
      const push = (nx, ny, nz) => {
        if (ny < 0 || nx < 0 || nz < 0 || nx >= WX || nz >= WZ) return;
        const id = this.getRaw(nx, ny, nz);
        if (!id) return;
        const leaf = FLAGS[id] & F_LEAF;
        if (leaf && !hereLeaf && !hereTrunk) return;
        if (hereLeaf && !leaf && id !== M.TRUNK && ny >= y) return;
        // Party walls do not hold a neighbour up: each building stands or falls alone.
        const lotThere = lot[nz * WX + nx];
        if (lotHere && lotThere && lotHere !== lotThere) return;
        const k = key(nx, ny, nz);
        if (seen.has(k)) return;
        seen.add(k);
        stack.push(nx, ny, nz);
      };
      push(x, y + 1, z); push(x + 1, y, z); push(x - 1, y, z); push(x, y, z + 1); push(x, y, z - 1); push(x, y - 1, z);
    }
    if (list.length === 0) return;
    const out = [];
    for (let i = 0; i < list.length; i += 3) {
      const x = list[i], y = list[i + 1], z = list[i + 2];
      const id = this.get(x, y, z);
      if (this.set(x, y, z, 0)) out.push(x, y, z, id);
    }
    if (this.onCollapse) this.onCollapse(out);
  }

  // DDA voxel raycast. Returns null or {x,y,z,id,nx,ny,nz,dist}.
  raycast(ox, oy, oz, dx, dy, dz, maxDist, skipGlass = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9, tdy = dy !== 0 ? Math.abs(1 / dy) : 1e9, tdz = dz !== 0 ? Math.abs(1 / dz) : 1e9;
    let tx = dx !== 0 ? ((dx > 0 ? x + 1 - ox : ox - x) * tdx) : 1e9;
    let ty = dy !== 0 ? ((dy > 0 ? y + 1 - oy : oy - y) * tdy) : 1e9;
    let tz = dz !== 0 ? ((dz > 0 ? z + 1 - oz : oz - z) * tdz) : 1e9;
    let nx = 0, ny = 0, nz = 0, t = 0;
    while (t <= maxDist) {
      const id = this.get(x, y, z);
      if (id && !(skipGlass && (FLAGS[id] & F_GLASS))) return { x, y, z, id, nx, ny, nz, dist: t };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  // Line of sight between two points (coarse, half-voxel steps).
  // What someone can actually see, as against what a round could pass through: walls stop it, and so does foliage after the first
  // leaf or two (the ones right at either end, someone standing in a crop, do not count).
  sight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < .01) return true;
    const steps = Math.min(300, Math.ceil(d * 1.5));
    let leaf = 0;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const id = this.get(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t));
      if (!id || (FLAGS[id] & F_GLASS)) continue;
      if (FLAGS[id] & F_LEAF) { if (t * d > 1.6 && (1 - t) * d > 1.6 && ++leaf >= 2) return false; continue; }
      return false;
    }
    return true;
  }

  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const d = Math.hypot(dx, dy, dz);
    if (d < .01) return true;
    const steps = Math.min(200, Math.ceil(d));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const id = this.get(Math.floor(ax + dx * t), Math.floor(ay + dy * t), Math.floor(az + dz * t));
      if (id && !(FLAGS[id] & (F_GLASS | F_LEAF))) return false;
    }
    return true;
  }

  exportEdits() {
    const out = [];
    for (const [i, e] of this.edits) {
      const arr = new Int32Array(e.size * 2);
      let k = 0;
      for (const [idx, id] of e) { arr[k++] = idx; arr[k++] = id; }
      out.push([i, arr]);
    }
    return out;
  }

  // Forget anything done to the voxels inside this rectangle: what it was done to is no longer there.
  dropEditsIn(list, x0, z0, x1, z1) {
    const out = [];
    for (const [i, arr] of list || []) {
      const col = i % COL, cx = col % CW, cz = (col / CW) | 0, kept = [];
      for (let k = 0; k < arr.length; k += 2) {
        const idx = arr[k], x = cx * 32 + (idx & 31), z = cz * 32 + ((idx >> 10) & 31);
        if (x < x0 || x > x1 || z < z0 || z > z1) kept.push(idx, arr[k + 1]);
      }
      if (kept.length) out.push([i, Int32Array.from(kept)]);
    }
    return out;
  }

  importEdits(list) {
    this.edits.clear();
    this.editTop.fill(0);
    for (const [i, arr] of list || []) {
      const m = new Map();
      for (let k = 0; k < arr.length; k += 2) m.set(arr[k], arr[k + 1]);
      this.edits.set(i, m);
      const col = i % COL, cy = (i / COL) | 0;
      if (cy > this.editTop[col]) this.editTop[col] = cy;
    }
  }
}
