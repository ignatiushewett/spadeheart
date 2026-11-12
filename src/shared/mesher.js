// Greedy voxel mesher with per-vertex ambient occlusion and a coarse sky-visibility term.
// Vertex layout (8 bytes): x,y,z,normal | id,ao,sky,lift (bit 0 on a grass block's top edge: the shader raises it in the wind;
// bit 1 on leaves meshed for distance, which hold still)
import { CS, WX, WZ, STREET_Y } from './constants.js';
import { FLAGS, F_GLASS, F_LEAF, M, PANE } from './materials.js';

const P = CS + 2;
const PP = P * P;
const AXES = [
  // dir normal, u axis, v axis, normal axis index (mask loops over u,v)
  { n: [1, 0, 0], u: [0, 1, 0], v: [0, 0, 1], ni: 0 },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0], ni: 1 },
  { n: [0, 1, 0], u: [0, 0, 1], v: [1, 0, 0], ni: 2 },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1], ni: 3 },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], ni: 4 },
  { n: [0, 0, -1], u: [0, 1, 0], v: [1, 0, 0], ni: 5 },
];

// The leaves of trees, as against standing crops: walking through a field you see the stalks round you; nobody stands inside a canopy.
const TREE_LEAF = new Uint8Array(256);
TREE_LEAF[M.LEAF] = TREE_LEAF[M.LEAF2] = TREE_LEAF[M.LEAF3] = 1;
// Grass that rides the wind: its top edge is lifted and let down in long slow waves by the shader. Paths, soil and the rest stay put.
const WAVE = new Uint8Array(256);
WAVE[M.GRASS] = WAVE[M.GRASS2] = WAVE[M.GRASS_DRY] = 1;

export function makeMesher(L) {
  const { height, terr, lot, edge } = L;
  const mask = new Int32Array(CS * CS);
  const opaque = { buf: new Uint8Array(1 << 21), n: 0 };
  const glass = { buf: new Uint8Array(1 << 19), n: 0 };
  const topCache = new Uint8Array(46 * 46);

  const topAt = (ox, oz, x, z) => topCache[(x + 7) + (z + 7) * 46];

  function grow(t, need) {
    if (t.n + need <= t.buf.length) return;
    const nb = new Uint8Array(t.buf.length * 2);
    nb.set(t.buf);
    t.buf = nb;
  }

  let still = 0;   // set while meshing at distance: the leaves there are merged into big faces and must not sway apart
  function quad(t, x, y, z, ax, du, dv, n, id, ao, sky) {
    grow(t, 32);
    const b = t.buf;
    let i = t.n;
    const { u, v, ni } = ax;
    const ux = u[0] * du, uy = u[1] * du, uz = u[2] * du;
    const vx = v[0] * dv, vy = v[1] * dv, vz = v[2] * dv;
    const a0 = ao & 3, a1 = (ao >> 2) & 3, a2 = (ao >> 4) & 3, a3 = (ao >> 6) & 3;
    // Rotate the quad diagonal so AO gradients interpolate without the usual seam.
    const flip = a0 + a2 < a1 + a3;
    const wave = WAVE[id], topY = y + Math.max(0, uy) + Math.max(0, vy), hold = still && (FLAGS[id] & F_LEAF) ? 2 : 0;
    const emit = (px, py, pz, a) => {
      b[i++] = px; b[i++] = py; b[i++] = pz; b[i++] = ni;
      b[i++] = id; b[i++] = a; b[i++] = sky; b[i++] = (wave && py === topY ? 1 : 0) | hold;
    };
    if (flip) {
      emit(x + ux, y + uy, z + uz, a1);
      emit(x + ux + vx, y + uy + vy, z + uz + vz, a2);
      emit(x + vx, y + vy, z + vz, a3);
      emit(x, y, z, a0);
    } else {
      emit(x, y, z, a0);
      emit(x + ux, y + uy, z + uz, a1);
      emit(x + ux + vx, y + uy + vy, z + uz + vz, a2);
      emit(x + vx, y + vy, z + vz, a3);
    }
    t.n = i;
  }

  // data: padded (34^3) voxels. lod 1 drops interior faces and treats glass as solid.
  return function mesh(data, cx, cy, cz, lod) {
    opaque.n = 0;
    glass.n = 0;
    still = lod ? 1 : 0;
    const ox = cx * CS, oy = cy * CS, oz = cz * CS;
    for (let z = -7; z < 39; z++) for (let x = -7; x < 39; x++) {
      const wx = ox + x, wz = oz + z;
      let t = 0;
      if (wx >= 0 && wz >= 0 && wx < WX && wz < WZ) {
        const i = wz * WX + wx;
        t = height[i] || (STREET_Y + terr[i]);
      }
      topCache[(x + 7) + (z + 7) * 46] = t;
    }

    if (lod) {
      // Plug broken windows at distance, otherwise the hollow shell shows sky through it.
      for (let z = -1; z <= CS; z++) for (let x = -1; x <= CS; x++) {
        const wx = ox + x, wz = oz + z;
        if (wx < 0 || wz < 0 || wx >= WX || wz >= WZ) continue;
        const i = wz * WX + wx;
        if (!lot[i] || edge[i] !== 0) continue;
        const top = height[i];
        for (let y = -1; y <= CS; y++) {
          const k = (x + 1) + (y + 1) * P + (z + 1) * PP;
          if (data[k] === 0 && oy + y < top && oy + y >= STREET_Y) data[k] = M.GLASS_K;
        }
      }
    }

    const at = (x, y, z) => data[(x + 1) + (y + 1) * P + (z + 1) * PP];
    const solidAO = (x, y, z) => {
      const id = at(x, y, z);
      return id !== 0 && !(FLAGS[id] & F_GLASS);
    };
    const pos = [0, 0, 0];

    for (let a = 0; a < 6; a++) {
      const ax = AXES[a];
      const [nx, ny, nz] = ax.n, [ux, uy, uz] = ax.u, [vx, vy, vz] = ax.v;
      const wx0 = nx !== 0 ? 0 : ny !== 0 ? 1 : 2;
      for (let d = 0; d < CS; d++) {
        let any = false;
        // Fill mask: id in the low 8 bits, ao 8..15, sky 16..19.
        for (let j = 0; j < CS; j++) for (let i = 0; i < CS; i++) {
          let x = ux * i + vx * j, y = uy * i + vy * j, z = uz * i + vz * j;
          if (wx0 === 0) x = d; else if (wx0 === 1) y = d; else z = d;
          const id = at(x, y, z);
          let v = 0;
          if (id !== 0) {
            const nb = at(x + nx, y + ny, z + nz);
            const selfG = FLAGS[id] & F_GLASS, nbG = nb !== 0 && (FLAGS[nb] & F_GLASS);
            let vis;
            if (lod) {
              vis = nb === 0 || false;
              // Interior air: nothing up close to see it, so drop the face.
              if (vis) {
                const wy = oy + y + ny;
                const t = topAt(ox, oz, x + nx, z + nz);
                if (wy < t) vis = false;
              }
            } else {
              vis = nb === 0 || (nbG && !selfG) || (selfG && nbG && (PANE[nb] || nb) !== (PANE[id] || id));
              // Leaves and crops can be walked into, so with your head in one you are looking at everything round it from the inside:
              // the faces of the leaves next to it, the branch it grows off, the ground under a crop. Those are drawn, not culled.
              if (!vis && (FLAGS[nb] & F_LEAF) && !(TREE_LEAF[nb] && TREE_LEAF[id])) vis = true;
              // Grass beside a path or anything else at the same height: its side is drawn too, so when the wind lifts the grass there is
              // a side under it and not a slit.
              if (!vis && ny === 0 && WAVE[id] && !WAVE[nb] && !at(x, y + 1, z) && !at(x + nx, y + 1, z + nz)) vis = true;
            }
            if (vis) {
              const sx = x + nx, sy = y + ny, sz = z + nz;
              // AO from the 8 neighbours around the face.
              const s = (du, dv) => solidAO(sx + ux * du + vx * dv, sy + uy * du + vy * dv, sz + uz * du + vz * dv) ? 1 : 0;
              const c0 = s(-1, 0), c1 = s(1, 0), c2 = s(0, -1), c3 = s(0, 1);
              const ao = (e1, e2, cn) => (e1 && e2) ? 0 : 3 - (e1 + e2 + cn);
              const a0 = ao(c0, c2, s(-1, -1)), a1 = ao(c1, c2, s(1, -1)), a2 = ao(c1, c3, s(1, 1)), a3 = ao(c0, c3, s(-1, 1));
              // Sky term: fraction of nearby columns that are open above this face. The side of grass beside a path is lit as its top
              // is: the strip of it that shows when the wind lifts it is above the ground beside it, not down in it.
              const lip = !lod && ny === 0 && WAVE[id];
              const wy = oy + sy + (lip ? 1 : 0);
              let open = 0;
              if (wy >= topAt(ox, oz, sx, sz)) open += 2;
              if (wy >= topAt(ox, oz, sx - 4, sz)) open++;
              if (wy >= topAt(ox, oz, sx + 4, sz)) open++;
              if (wy >= topAt(ox, oz, sx, sz - 4)) open++;
              if (wy >= topAt(ox, oz, sx, sz + 4)) open++;
              if (wy >= topAt(ox, oz, sx - 2, sz - 2)) open++;
              if (wy >= topAt(ox, oz, sx + 2, sz + 2)) open++;
              v = id | ((lip ? 255 : a0 | (a1 << 2) | (a2 << 4) | (a3 << 6)) << 8) | (open << 16);
              any = true;
            }
          }
          mask[i + j * CS] = v;
        }
        if (!any) continue;
        // Greedy merge
        for (let j = 0; j < CS; j++) for (let i = 0; i < CS; ) {
          const v = mask[i + j * CS];
          if (!v) { i++; continue; }
          // Grass is kept to small pieces, so the wave can bend it. Leaves near enough to sway are kept to single faces: every corner
          // is then shared outright with the faces round it and they all move as one, where a big merged face would bend in a straight
          // line past its neighbours' corners and open slits between them.
          const cap = WAVE[v & 255] ? 4 : !lod && (FLAGS[v & 255] & F_LEAF) ? 1 : CS;
          let w = 1;
          while (i + w < CS && w < cap && mask[i + w + j * CS] === v) w++;
          let h = 1;
          outer: for (; j + h < CS && h < cap; h++) {
            for (let k = 0; k < w; k++) if (mask[i + k + (j + h) * CS] !== v) break outer;
          }
          for (let q = 0; q < h; q++) for (let k = 0; k < w; k++) mask[i + k + (j + q) * CS] = 0;
          let x = ux * i + vx * j, y = uy * i + vy * j, z = uz * i + vz * j;
          if (wx0 === 0) x = d; else if (wx0 === 1) y = d; else z = d;
          // Face plane sits on the positive side for positive normals.
          if (nx > 0) x += 1;
          if (ny > 0) y += 1;
          if (nz > 0) z += 1;
          const id = v & 255, ao = (v >> 8) & 255, sky = (v >> 16) & 15;
          const target = (!lod && (FLAGS[id] & F_GLASS)) ? glass : opaque;
          quad(target, x, y, z, ax, w, h, a, id, ao, Math.round(sky / 8 * 255));
          i += w;
        }
      }
    }
    const out = new Uint8Array(opaque.n + glass.n);
    out.set(opaque.buf.subarray(0, opaque.n), 0);
    out.set(glass.buf.subarray(0, glass.n), opaque.n);
    return { verts: out, opaqueQuads: opaque.n / 32, glassQuads: glass.n / 32 };
  };
}
