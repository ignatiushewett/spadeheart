// Trees in the distance, as pictures: every tree in the world drawn far off as one flat cut-out turned to face you, the way most games
// do it, in place of the green slab the far scenery used to raise over a forest. Each stands exactly where its real tree stands, the
// same kind and about the same size, and steps aside the moment the real one has been built (the same load mask the rest of the far
// scenery uses), so near you there are only the voxel trees and further off only these.
import { WX, WZ, STREET_Y } from '../shared/constants.js';
import { M, PALETTE } from '../shared/materials.js';
import { P, PROP_STRIDE } from '../shared/layout.js';

const COLS = 4;          // pictures across the sheet: two leafy shapes, two pines
const BW = 9, BH = 13;   // each picture, in blocks
const PX = 4;            // pixels to a block

// The sheet of pictures. Red is how lit the block is; green marks the trunk (drawn in bark colour rather than the tree's leaf colour).
function drawSheet() {
  const c = document.createElement('canvas');
  c.width = COLS * BW * PX; c.height = BH * PX;
  const x = c.getContext('2d');
  const h = (a, b) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
  const block = (col, bx, by, light, trunk) => {
    const v = Math.round(Math.max(0, Math.min(1, light)) * 255);
    x.fillStyle = `rgb(${v},${trunk ? 255 : 0},0)`;
    x.fillRect((col * BW + bx) * PX, by * PX, PX, PX);
  };
  // A leafy one: a round crown of blocks, lit from above and the left, ragged at the edge, on a short trunk.
  const leafy = (col, rx, ry, cy, trunkFrom, seed) => {
    for (let by = 0; by < BH; by++) for (let bx = 0; bx < BW; bx++) {
      const dx = (bx - 4) / rx, dy = (by - cy) / ry, d = Math.hypot(dx, dy);
      const edge = d > .82 ? h(bx + seed, by) < .45 : false;
      if (d <= 1.05 && !edge) block(col, bx, by, .5 + .35 * (-dy * .7 - dx * .3) + (h(bx * 3 + seed, by * 5) - .5) * .25 - (d > .8 ? .12 : 0), false);
    }
    for (let by = trunkFrom; by < BH; by++) block(col, 4, by, .55 + (by % 2) * .08, true);
  };
  // A pine: tiers that narrow to a point, each a little lighter on top, a bare bit of trunk at the foot.
  const pine = (col, seed) => {
    for (let by = 0; by < BH - 2; by++) {
      const r = Math.min(4, Math.floor(by * .42 + ((by & 1) ? .2 : .6)));
      for (let bx = 4 - r; bx <= 4 + r; bx++) block(col, bx, by, .42 + (by & 1 ? .12 : 0) - Math.abs(bx - 4) * .04 + (h(bx + seed, by) - .5) * .18, false);
    }
    for (let by = BH - 3; by < BH; by++) block(col, 4, by, .5, true);
  };
  leafy(0, 4.2, 4.6, 4.4, 8, 3);
  leafy(1, 4.4, 3.9, 4.0, 7, 11);
  pine(2, 5);
  pine(3, 19);
  return c;
}

export class FarTrees {
  constructor(gl, L) {
    this.gl = gl;
    const { props, terr, ground } = L;
    const inst = [];
    const lin = (id, k = 1) => [0, 1, 2].map((c) => Math.pow(PALETTE[id * 4 + c] / 255, 2.2) * k);
    this.leaves = [lin(M.LEAF), lin(M.LEAF2), lin(M.LEAF3)];
    this.bark = lin(M.TRUNK);
    for (let k = 0; k < props.length; k += PROP_STRIDE) {
      const kind = props[k];
      if (kind !== P.PARKTREE && kind !== P.TREE) continue;
      const x = props[k + 1], z = props[k + 2], seed = props[k + 3];
      if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
      const size = kind === P.PARKTREE ? 1 + seed % 3 : 0;
      const base = STREET_Y + terr[z * WX + x];
      let w, ht, pic, leaf;
      if (size && seed % 5 < 2) {
        // As the voxel pine: a tall trunk and a cone of needles.
        const tall = 9 + size * 2 + seed % 4;
        ht = tall + 2; w = 2 * Math.round((tall - 3) * .42) + 1; pic = 2 + (seed & 1); leaf = 0;
      } else {
        const trunkH = 3 + size + seed % 3, r = 2 + size;
        ht = trunkH + 2 * r; w = 2 * r + 1; pic = seed % 2; leaf = seed % 7 === 0 ? 2 : seed % 2 ? 0 : 1;
      }
      inst.push(x + .5, base, z + .5, pic, w * 1.06, ht, leaf, (seed % 13) / 13);
    }
    this.count = inst.length / 8;
    const data = new Float32Array(inst);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, 0, .5, 0, .5, 1, -.5, 0, .5, 1, -.5, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, ib);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    // The sheet: sharp blocks close to, smoothed down far off.
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawSheet());
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // p: the tree program, already in use with the frame's uniforms and the load mask on unit 2.
  draw(gl, p) {
    if (!this.count) return;
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(p.u.uTreeTex, 4);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform3fv(p.u.uLeaf, new Float32Array(this.leaves.flat()));
    gl.uniform3fv(p.u.uBark, this.bark);
    gl.uniform1f(p.u.uCols, COLS);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, this.count);
    gl.enable(gl.CULL_FACE);
  }
}
