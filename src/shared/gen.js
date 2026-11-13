// Turns the city plan into voxels, one 32^3 chunk at a time. Pure function of position:
// chunks can be dropped and rebuilt freely; player edits are stored separately.
import { CS, CS3, WX, WZ, CW, STREET_Y, WATER_Y, FLOOR_H, G, STATUE_LAMPS } from './constants.js';
import { M, CRACKED } from './materials.js';
import { h3, r2, r3, h2, noise2 } from './rng.js';
import { STYLES, P } from './layout.js';
import { stampCamp } from './camps.js';

const CAR_COLORS = [M.CAR_W, M.CAR_K, M.CAR_R, M.CAR_B, M.CAR_S, M.CAR_S];

// A blocky 3x5 alphabet, for what is left of the signs.
const FONT = { A: 'xxxx.xxxxx.xx.x', B: 'xx.x.xxx.x.xxx.', C: 'xxxx..x..x..xxx', D: 'xx.x.xx.xx.xxx.', E: 'xxxx..xx.x..xxx', F: 'xxxx..xx.x..x..', G: 'xxxx..x.xx.xxxx', H: 'x.xx.xxxxx.xx.x', I: 'xxx.x..x..x.xxx', K: 'x.xx.xxx.x.xx.x', L: 'x..x..x..x..xxx', M: 'x.xxxxxxxx.xx.x', N: 'xx.x.xx.xx.xx.x', O: 'xxxx.xx.xx.xxxx', P: 'xxxx.xxxxx..x..', R: 'xxxx.xxx.x.xx.x', S: 'xxxx..xxx..xxxx', T: 'xxx.x..x..x..x.', U: 'x.xx.xx.xx.xxxx', W: 'x.xx.xxxxxxxx.x', Y: 'x.xx.x.x..x..x.', ' ': '...............' };
const letterAt = (word, col, row) => {
  const cell = col % 4;
  if (cell === 3) return false;
  const ch = FONT[word[(col / 4) | 0]];
  return !!ch && ch[row * 3 + cell] === 'x';
};

export function makeGenerator(L) {
  const { ground, lot, edge, height, mark, terr, buildings, props, binStart, binData, structs, camps, chunkTop } = L;

  let d = null, ox = 0, oy = 0, oz = 0, any = false;
  const put = (x, y, z, id) => {
    const lx = x - ox, ly = y - oy, lz = z - oz;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= CS || ly >= CS || lz >= CS) return;
    d[lx | (ly << 5) | (lz << 10)] = id;
    any = true;
  };
  const box = (x0, y0, z0, x1, y1, z1, id) => {
    const ax = Math.max(x0, ox), bx = Math.min(x1, ox + CS - 1);
    const ay = Math.max(y0, oy), by = Math.min(y1, oy + CS - 1);
    const az = Math.max(z0, oz), bz = Math.min(z1, oz + CS - 1);
    if (ax > bx || ay > by || az > bz) return;
    for (let z = az; z <= bz; z++) for (let y = ay; y <= by; y++) {
      const base = ((y - oy) << 5) | ((z - oz) << 10);
      for (let x = ax; x <= bx; x++) d[base | (x - ox)] = id;
    }
    any = true;
  };

  function column(x, z, y0, y1) {
    const i = z * WX + x;
    const g = ground[i];
    const top = STREET_Y - 1 + terr[i];
    const lx = x - ox, lz = z - oz;
    let surface = M.STONE, under = M.STONE, deep = M.STONE;
    const flags = mark[i];
    switch (g) {
      case G.ROAD: {
        const mk = mark[i] & 15;
        surface = mk === 1 ? M.LINE_Y : mk ? M.LINE_W : ((x >> 3) + (z >> 3)) % 7 === 0 ? M.ASPHALT2 : M.ASPHALT;
        break;
      }
      case G.WALK: {
        surface = ground[i - 1] === G.ROAD || ground[i + 1] === G.ROAD || ground[i - WX] === G.ROAD || ground[i + WX] === G.ROAD ? M.CURB : M.WALK;
        break;
      }
      case G.LOT: {
        const b = buildings[lot[i] - 1];
        surface = b ? STYLES[b.style].floor : M.WALK;
        break;
      }
      case G.ALLEY: surface = M.ALLEYWAY; break;
      case G.PLAZA: surface = mark[i] === 4 ? ((x % 6 === 0 && z % 13 < 9) ? M.LINE_W : M.ASPHALT2) : M.WALK2; break;
      case G.PROM: surface = (x + z) % 4 === 0 ? M.WOOD_D : M.WOOD; under = M.WOOD_D; break;
      case G.CAMP: surface = M.GRAVEL; break;
      case G.ROCK: surface = mark[i] ? M.SNOW : M.SCHIST; under = M.SCHIST; deep = M.SCHIST; break;
      case G.SAND: surface = M.SAND; under = M.SAND; break;
      // Trodden earth: one light brown, the same all the way along.
      case G.DIRT: surface = M.PATH; under = M.DIRT; break;
      case G.FIELD: surface = mark[i] === 6 ? M.GRASS_DRY : M.SOIL; under = M.DIRT; break;
      case G.PARK: {
        if (top < WATER_Y) { surface = M.DIRT; under = M.DIRT; break; }
        const n = noise2(x * .05, z * .05);
        const pathN = Math.abs(noise2(x * .012 + 40, z * .012) - .5);
        surface = pathN < .018 ? M.PATH : n < .35 ? M.GRASS_DRY : n < .6 ? M.GRASS : M.GRASS2;
        under = M.DIRT;
        break;
      }
      case G.WATER: surface = terr[i] < -4 ? M.SAND : M.STONE; break;
    }
    const groundEnd = Math.min(top, y1);
    // You can dig a pit, not a mine: three voxels down the ground stops being diggable. Beside water
    // the barrier drops with the neighbouring bed, so shores and pond edges can still be cut away.
    const barrier = g === G.WATER ? 2 : Math.max(2, top - 2 + Math.min(0, terr[Math.max(0, i - 1)] - terr[i], terr[Math.min(terr.length - 1, i + 1)] - terr[i], terr[Math.max(0, i - WX)] - terr[i], terr[Math.min(terr.length - 1, i + WX)] - terr[i]));
    if (flags & 16 && g !== G.CAMP) {
      // A bridge or a pier: a deck over open water, on piles.
      const pile = g === G.PROM ? (x & 7) === 0 && (z & 7) === 0 : (x & 15) < 2 && (z & 15) < 2;
      for (let y = y0; y <= groundEnd; y++) {
        const id = y === top ? surface : y === top - 1 ? (g === G.PROM ? M.WOOD_D : M.STEEL_D) : pile ? (g === G.PROM ? M.LOG : M.CONCRETE_D) : 0;
        if (id) { d[lx | ((y - oy) << 5) | (lz << 10)] = id; any = true; }
      }
      // A rail along the open side.
      const rail = top + 1;
      if (g !== G.PROM && rail >= y0 && rail <= y1 && (ground[i - 1] === G.WATER || ground[i + 1] === G.WATER || ground[i - WX] === G.WATER || ground[i + WX] === G.WATER)) { d[lx | ((rail - oy) << 5) | (lz << 10)] = M.IRON; any = true; }
      return;
    }
    for (let y = y0; y <= groundEnd; y++) {
      let id = y === top ? surface : y < barrier ? M.BEDROCK : y < top - 3 ? deep : under;
      d[lx | ((y - oy) << 5) | (lz << 10)] = id;
      any = true;
    }
    if (flags & 32) {
      // The tunnel: seven clear over the road, a concrete lid, and then the hill.
      const roof = height[i] - 1;
      const lid = top + 8;
      for (let y = Math.max(y0, lid); y <= Math.min(y1, roof); y++) {
        d[lx | ((y - oy) << 5) | (lz << 10)] = y === lid ? M.CONCRETE : y === roof ? M.GRASS : y > roof - 3 ? M.DIRT : M.STONE;
        any = true;
      }
      return;
    }
    if (g === G.FIELD && flags >= 1 && flags < 6) {
      // What was in the ground when everyone stopped coming out to it.
      const y = top + 1;
      // Corn in tall rows, cotton gone to boll and never picked, low peanut rows, and somebody's tomatoes.
      const tall = flags === 1 ? (x % 3 && h2(x, z) % 5 ? 1 : 0) : flags === 2 ? ((x + (z >> 6)) % 3 === 0 ? 0 : 2 + (h2(x, z) & 1)) : flags === 3 ? ((z & 1) && h2(x, z) % 4 ? 2 : 0) : flags === 4 ? (x % 3 === 0 ? 1 : 0) : (x % 4 === 0 && h2(x, z) % 3 ? 1 : 0);
      for (let k = 0; k < tall; k++) {
        const id = flags === 1 ? M.LEAF2 : flags === 2 ? M.CORN : flags === 3 ? (k === tall - 1 && h2(x + k, z) % 3 ? M.COTTON : M.LEAF3) : flags === 4 ? M.PEANUT : M.TOMATO;
        if (y + k >= y0 && y + k <= y1) { d[lx | ((y + k - oy) << 5) | (lz << 10)] = id; any = true; }
      }
      return;
    }
    if (g === G.LOT && lot[i]) building(i, x, z, y0, y1, buildings[lot[i] - 1]);
    else if (g === G.WALK) { fireEscape(i, x, z, y0, y1); awning(i, x, z, y0, y1); frontage(i, x, z, y0, y1); }
    else if (g === G.ALLEY) frontage(i, x, z, y0, y1);
  }

  // What a Harlem front has that a plain wall does not: a heavy cornice overhanging the street, and stone cheeks either side of the door.
  function frontage(i, x, z, y0, y1) {
    let nb = 0, nj = 0, dir = 0;
    if (lot[i - 1]) { nj = i - 1; dir = 1; } else if (lot[i + 1]) { nj = i + 1; dir = 1; } else if (lot[i - WX]) { nj = i - WX; dir = 2; } else if (lot[i + WX]) { nj = i + WX; dir = 2; }
    if (!nj) return;
    nb = lot[nj];
    const b = buildings[nb - 1];
    if (!b.cornice && !b.stoop) return;
    const S = STYLES[b.style], t = dir === 1 ? z : x;
    const place = (y, id) => { if (y >= y0 && y <= y1) { d[(x - ox) | ((y - oy) << 5) | ((z - oz) << 10)] = id; any = true; } };
    if (b.cornice && height[nj] === b.tiers[1]) {
      const top = b.tiers[1];
      place(top - 1, S.cornice || S.trim);
      // Brackets under it, every so often.
      if (t % 3 === 0) place(top - 2, S.cornice || S.trim);
    }
    if (b.stoop) {
      const m = (t + (b.seed & 15)) % 15;
      if (m === 3 || m === 14) { place(STREET_Y + b.lift, S.trim); place(STREET_Y + b.lift + 1, S.trim); }
    }
  }

  // Shop awnings over the sidewalk, faded and torn, on the stretches of shopfront that have them.
  function awning(i, x, z, y0, y1) {
    let nb = 0, t = 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const reach of [1, 2]) {
        const j = i + dx * reach + dz * reach * WX;
        if (j > 0 && lot[j]) { nb = lot[j]; t = dx ? z : x; break; }
      }
      if (nb) break;
    }
    if (!nb) return;
    const b = buildings[nb - 1];
    if (STYLES[b.style].cast === 2 || b.house || b.blank) return;
    const y = STREET_Y + 4 + b.lift;
    if (y < y0 || y > y1) return;
    const s = t + (b.seed & 15);
    const seg = (s / 15) | 0;
    if (s % 15 < 4 || s % 15 > 13 || h2(b.id, seg * 7) % 3 !== 0) return;
    if (r3(x, y, z) < .1) return;
    const col = [M.AWN_R, M.AWN_G, M.AWN_B, M.AD_YELLOW, M.AD_BLACK][h2(b.id, seg) % 5];
    d[(x - ox) | ((y - oy) << 5) | ((z - oz) << 10)] = (t & 1) ? col : M.CANVAS;
    any = true;
  }

  // What a painted ad shows at this spot on a wall, if anything. The weather has had some of it.
  function adPixel(b, t, y, x, z) {
    const A = b.ad;
    if (t < A.t0 || t > A.t1 || y < A.y0 || y > A.y1) return 0;
    if (r3(x, y, z) < .11) return 0;
    const col = Math.floor((t - A.t0 - 2) / A.scale), row = Math.floor((A.y1 - 2 - y) / A.scale);
    if (col >= 0 && row >= 0 && row < 5 && col < A.word.length * 4 && letterAt(A.word, col, row)) return A.fg;
    return A.bg;
  }

  function fireEscape(i, x, z, y0, y1) {
    // Iron balconies on the sidewalk face of old brick walk-ups.
    let dir = 0, nb = 0;
    if (lot[i - 1]) { nb = lot[i - 1]; dir = 1; } else if (lot[i + 1]) { nb = lot[i + 1]; dir = 2; } else if (lot[i - WX]) { nb = lot[i - WX]; dir = 3; } else if (lot[i + WX]) { nb = lot[i + WX]; dir = 4; }
    if (!nb) return;
    const b = buildings[nb - 1];
    if (b.style > 2 && b.style !== 10 && !STYLES[b.style].escape) return;
    const t = dir <= 2 ? z : x;
    if (((t + b.seed) % 22) > 6) return;
    const top = b.tiers[1];
    if (top - b.lift > STREET_Y + 54 || b.house) return;
    const base = STREET_Y + b.lift + FLOOR_H - 1;
    for (let y = Math.max(y0, base); y <= Math.min(y1, top - 2); y++) {
      if ((y - base) % FLOOR_H === 0) d[(x - ox) | ((y - oy) << 5) | ((z - oz) << 10)] = M.IRON, any = true;
    }
  }

  const FH = FLOOR_H;
  const isSealed = (b) => (b.seed >>> 9) % 100 < (b.house ? 40 : 62);
  // Rough planks across an opening, with the odd chink at the top you could see through but never fit through.
  const boards = (t, lv) => (lv >= 3 && t % 2 ? 0 : lv === 2 ? M.BARRICADE2 : M.BARRICADE);
  // Always the way up from the street, and every so often further up, in the buildings that were held.
  const stairsBarred = (b, fl, top) => !b.house && isSealed(b) && (fl <= 8 || top < 80) && (fl === 0 || h2(b.id + 21, fl) % 3 === 0);

  function building(i, x, z, y0, y1, b) {
    const top = height[i];
    if (!top) return;
    const S = STYLES[b.style];
    // A house's walls stop at the eaves, and the roof climbs from there.
    const wallTop = b.house ? b.tiers[1] : top;
    const hN = height[i - WX], hS = height[i + WX], hW = height[i - 1], hE = height[i + 1];
    const e = edge[i];
    const lx = x - ox, lz = z - oz;
    const startY = Math.max(y0, STREET_Y + b.lift);
    const endY = Math.min(y1, top - 1);
    const hasStair = b.sx >= 0;
    const inShaft = hasStair && x >= b.sx && x < b.sx + 5 && z >= b.sz && z < b.sz + 6;
    // The stairwell's own walls: down both sides and across the back, open at the foot of the flights.
    const shaftWall = hasStair && !b.house && !inShaft && z >= b.sz + 1 && z <= b.sz + 6 && x >= b.sx - 1 && x <= b.sx + 5 && (x === b.sx - 1 || x === b.sx + 5 || z === b.sz + 6);

    for (let y = startY; y <= endY; y++) {
      let id = 0;
      if (y >= wallTop) {
        // Shingles outside, an empty loft inside.
        if (y === top - 1) { d[lx | ((y - oy) << 5) | (lz << 10)] = S.roof; any = true; }
        continue;
      }
      const rel = y - (STREET_Y - 1 + b.lift);
      const lv = rel % FH;
      const fl = (rel / FH) | 0;
      const oN = hN <= y, oS = hS <= y, oW = hW <= y, oE = hE <= y;
      const open = oN || oS || oW || oE;
      if (b.blank) {
        // A silo or an elevator: a skin with nothing in it, and no way in.
        if (e === 0 || open || y === top - 1) id = y === top - 1 ? S.roof : (y - STREET_Y - b.lift) % 8 === 7 ? S.trim : S.wall;
      } else if (e === 0 || open) {
        if (!open) id = S.wall;                    // party wall between buildings
        else if (lv === 0) id = y === wallTop - 1 ? S.roof : S.trim;
        else {
          const corner = (oN || oS) && (oW || oE);
          const t = (oN || oS) ? x : z;
          if (corner) id = b.house ? S.trim : S.wall;
          else if (fl === 0 && b.house) {
            // A front door, a back door, and windows like the ones upstairs. A barn has doors you could drive through.
            const s = t + (b.seed & 31);
            // Every house has a front door, two wide in the middle of its south side, whatever else its walls happen to have.
            const hx = (b.x0 + b.x1) >> 1, front = !b.open && oS && !oW && !oE && (x === hx || x === hx + 1);
            if (front) id = lv <= 3 ? 0 : S.wall;
            else if (b.open) id = s % 23 < 6 && lv <= 4 ? 0 : lv === 3 && s % 9 === 4 ? S.glass : S.wall;
            else if (s % 23 < 2 && lv <= 3) id = isSealed(b) && h2(b.id, (s / 23) | 0) % 2 === 0 ? boards(t, lv) : 0;
            else id = lv >= 2 && lv <= 3 && (t + (b.seed & 7)) % S.p < S.w && s % 23 > 3 ? (r3(x, y, z) < .1 ? 0 : S.glass) : S.wall;
          } else if (fl === 0) {
            // Ground floor: shop fronts and doorways, three wide and tall enough to walk a crowd through. The doors went for firewood
            // long ago. Most buildings are shut up behind that: shutters down, glass in the frames, boards inside.
            const s = (t + (b.seed & 15));
            const sealed = isSealed(b);
            const seg = (s / 15) | 0;
            const doorHit = s % 15 < 3;
            if (doorHit && lv <= 4) {
              if (lv === 4) id = S.trim;
              else if (h2(b.id, seg) % (sealed ? 3 : 6) === 0) id = boards(t, lv);
              else id = 0;
            } else if (S.cast === 2 || b.style === 4 || (s % 15 > 4 && (s >> 4) % 2 === 0)) {
              // A painted fascia above the shop window, one business to each stretch of frontage.
              if (lv > 4 && h2(b.id + 3, seg) % 3 === 0) id = (s & 1) && h2(b.id, seg) % 2 ? M.AD_CREAM : [M.AD_RED, M.AD_BLUE, M.AD_GREEN, M.AD_BLACK, M.AD_YELLOW][h2(b.id + 5, seg) % 5];
              else if (lv > 4 || s % 7 === 0) id = S.trim;
              else if (sealed) id = h2(b.id + 7, seg) % 5 < 2 ? M.SHUTTER : M.GLASS_C;
              else id = r3(x, y, z) < .28 ? 0 : h2(b.id + 17, seg) % 100 < 24 ? M.GLASS_C_X : M.GLASS_C;
            } else id = lv >= 2 && lv <= 3 && s % 4 < 2 ? S.glass : S.wall;
          } else {
            const pitch = S.p;
            const hit = ((t + (b.seed & 7)) % pitch) < S.w;
            // A sill a block off the floor and a head a block under the ceiling; curtain wall runs floor to ceiling.
            const hiRange = S.cast === 2 ? lv >= 1 : b.house ? lv >= 2 && lv <= 3 : lv >= 2 && lv <= 4;
            if (hit && hiRange) {
              const r = r3(x, y, z);
              if (r < .085) id = 0;
              else if (r < .0705 + (S.cast === 2 ? 0 : .0008)) id = M.WIN_LIT;
              // Some panes went to cracks a long time ago and are still hanging in the frame.
              else id = h2(b.id * 13 + (((t + (b.seed & 7)) / pitch) | 0), fl + 40) % 100 < 17 ? (CRACKED[S.glass] || S.glass) : S.glass;
            } else id = S.cast === 1 && (t % pitch === pitch - 1) ? S.trim : S.wall;
            if (b.ad && ((oN || oS) === b.ad.alongX)) {
              const px = adPixel(b, t, y, x, z);
              if (px) id = px;
            }
          }
        }
      } else if (inShaft) {
        // Two flights round a spine. Up the left side: three steps to a half-landing across the back. Up the right side coming back:
        // three more steps, and you are on the next floor facing the way you came in.
        const r = z - b.sz, l = x - b.sx;
        const lastFloor = b.house && y >= wallTop - FH;
        let solid;
        // A house's top floor: the stairs arrive and stop. Its floor runs round the head of the stairs, and a rail stands along the spine.
        if (lastFloor) solid = y === wallTop - 1 || (lv === 0 && (r === 0 || (l >= 3 && r === 1))) || (l === 2 && r >= 1 && r <= 3 && lv === 1);
        else if (l === 2 && r >= 1 && r <= 3) solid = true;
        else if (r === 0) solid = lv === 0;
        else if (r <= 3) solid = l < 2 ? lv === r : lv === (r === 3 ? 4 : r === 2 ? 5 : 0);
        else solid = lv === 3;
        id = solid ? (y === top - 1 ? S.roof : lastFloor && y === wallTop - 1 ? S.floor : l === 2 && lv ? M.CONCRETE_D : M.CONCRETE) : 0;
        // Whoever held out upstairs filled the bottom of the flight with whatever they could carry.
        if (!solid && l < 2 && r >= 1 && r <= 3 && lv > r && stairsBarred(b, fl, top)) id = lv === 5 && r > 1 ? (x % 2 ? M.BARRICADE2 : 0) : y % 2 ? M.BARRICADE2 : M.BARRICADE;
      } else if (lv === 0) {
        // A barn is one tall room: no floor between the ground and the loft boards.
        id = y === top - 1 ? S.roof : b.open && y !== wallTop - 1 ? 0 : S.floor;
      } else if (shaftWall) {
        id = M.PLASTER2;
      } else {
        id = interior(b, S, x, y, z, lv, fl, e, top);
      }
      if (id) { d[lx | ((y - oy) << 5) | (lz << 10)] = id; any = true; }
    }

    // Rooftop dressing above the slab.
    if (!b.house && !b.blank && y1 >= top && y0 <= top + 9) {
      const inParapet = e === 0 || hN < top || hS < top || hW < top || hE < top;
      const head = hasStair && top === b.top && z >= b.sz + 1 && z <= b.sz + 6 && x >= b.sx - 1 && x <= b.sx + 5;
      if (head) {
        // The stairhead: a box over the top of the flights, with its open side where you step out.
        for (let y = Math.max(y0, top); y <= Math.min(y1, top + 5); y++) {
          if (y === top + 5 || shaftWall) { d[lx | ((y - oy) << 5) | (lz << 10)] = y === top + 5 ? S.roof : S.wall; any = true; }
        }
      } else if (inParapet) {
        if (top >= y0 && top <= y1) { d[lx | ((top - oy) << 5) | (lz << 10)] = S.trim; any = true; }
      } else if (e > 2 && !inShaft) {
        const gx = x >> 3, gz = z >> 3;
        const k = r2(gx + b.id, gz);
        if (k < .1 && (x & 7) < 4 && (z & 7) < 4) {
          const ht = k < .04 ? 3 : 2;
          for (let y = Math.max(y0, top); y <= Math.min(y1, top + ht - 1); y++) { d[lx | ((y - oy) << 5) | (lz << 10)] = M.ALUM; any = true; }
        }
      }
      if (b.tank && top === b.top) {
        const dx = x - b.cx - 9, dz = z - b.cz + 8;
        const dist2 = dx * dx + dz * dz;
        if (dist2 < 11 && !head) {
          const start = top + 3, stop = top + 8;
          for (let y = Math.max(y0, start); y <= Math.min(y1, stop); y++) { d[lx | ((y - oy) << 5) | (lz << 10)] = M.TANK; any = true; }
          if (dist2 < 3 && top + 9 >= y0 && top + 9 <= y1) { d[lx | ((top + 9 - oy) << 5) | (lz << 10)] = M.TANK; any = true; }
          if (Math.abs(dx) === 2 && Math.abs(dz) === 2) for (let y = Math.max(y0, top); y <= Math.min(y1, top + 2); y++) { d[lx | ((y - oy) << 5) | (lz << 10)] = M.IRON; any = true; }
        }
      }
    }
  }

  function interior(b, S, x, y, z, lv, fl, e, top) {
    // A barn has no upper floor to put anything on: the hay is on the ground.
    if (b.open) return fl === 0 && lv === 1 && e > 2 && r3(x, 7, z) < .02 ? M.HAY : 0;
    const ux = x - b.x0, uz = z - b.z0;
    // Columns in anything big enough to need them, on the building's own grid.
    if (b.bestE >= 9 && ux % 12 === 6 && uz % 12 === 6) return M.CONCRETE;
    const detail = fl <= 8 || top < 80;
    if (!detail) return 0;
    // Rooms you can cross in more than three steps. Offices are open floors with the odd glass-walled corner; a shop is one room
    // back to its stockroom; a house is four or five rooms.
    const shop = fl === 0 && !b.house && !b.harlem;
    const span = b.house ? 7 : S.cast === 2 ? 19 : 12;
    const fh = h2(b.id, fl >> 1);
    const px = span + (fh % 6), pz = span + ((fh >> 4) % 6);
    const ox2 = (fh >> 8) % px, oz2 = (fh >> 12) % pz;
    const onX = (ux + ox2) % px === 0, onZ = (uz + oz2) % pz === 0;
    const nearShaft = b.sx >= 0 && x >= b.sx - 3 && x < b.sx + 8 && z >= b.sz - 4 && z < b.sz + 9;
    if ((onX || onZ) && e > 1 && !nearShaft && !(shop && e < 12)) {
      const t = onX ? uz : ux;
      // No doors left, just the gaps where they hung: two wide, a block of wall over the top. In a shut-up building someone has nailed
      // some of them closed.
      const m = (t + (fh >> 16)) % 11;
      if (m < 2 && lv <= 3) return isSealed(b) && h2((t / 11 | 0) * 7 + (onX ? 3 : 0), fl + b.id) % 3 === 0 ? boards(t, lv) : 0;
      if (S.cast === 2) return lv <= 3 ? M.GLASS_C : 0;
      return (fh >> 3) % 2 ? M.PLASTER : M.PLASTER2;
    }
    if (nearShaft || e < 2) return 0;
    const cell = h3(x >> 2, fl, z >> 2);
    const k = (cell & 1023) / 1024;
    const inX = x & 3, inZ = z & 3;
    if (lv === 1) {
      if (r3(x, fl + 1000, z) < (fl === 0 ? .004 : .0018)) {
        const c = h3(x, fl + 7, z) % 100;
        return c < 14 ? M.CRATE_MED : c < 30 ? M.CRATE_AMMO : M.CRATE;
      }
      if (k < .08 && inX < 3 && inZ === 1) return M.WOOD;
      if (k > .1 && k < .14 && inZ === 0) return M.SHELF;
    } else if (lv <= 3 && k > .1 && k < .14 && inZ === 0) return M.SHELF;
    return 0;
  }

  function car(x, z, dir, kind, seed, baseY) {
    const base = baseY ?? STREET_Y - 1;
    const color = kind === 1 ? M.TAXI : kind === 2 ? M.BUS : kind === 3 ? M.CAR_W : kind === 4 ? M.CAR_K : kind === 5 ? M.CAR_W : kind === 6 ? M.BURNT : CAR_COLORS[seed % CAR_COLORS.length];
    const len = kind === 2 ? 20 : kind === 3 ? 13 : kind === 5 ? 11 : 9;
    const wid = kind === 2 || kind === 3 || kind === 5 ? 5 : 4;
    const p = (l, w, h, id) => (dir === 0 ? put(x + w, base + h, z + l, id) : put(x + l, base + h, z + w, id));
    for (let l = 0; l < len; l++) for (let w = 0; w < wid; w++) {
      const edgeL = l === 0 || l === len - 1;
      const wheel = (l === 1 || l === len - 2) && (w === 0 || w === wid - 1);
      if (wheel) p(l, w, 0, M.TIRE);
      else p(l, w, 0, M.STEEL_D);
      if (kind === 2 || kind === 3 || kind === 5) {
        const tall = kind === 2 ? 4 : 4;
        for (let h = 1; h <= tall; h++) {
          let id = color;
          if (kind === 2 && h >= 2 && h <= 3 && !edgeL && l % 3 !== 0) id = w === 0 || w === wid - 1 ? M.CAR_GLASS : color;
          if (kind === 3 && l >= len - 3) id = h >= 3 ? 0 : color;
          if (kind === 3 && l === len - 3 && h >= 3) id = M.CAR_GLASS;
          if (kind === 5 && h === 3 && l < 7 && (l + w) % 3 === 0) id = M.CAR_R;
          if (id) p(l, w, h, id);
        }
      } else {
        p(l, w, 1, edgeL && (w === 0 || w === wid - 1) ? (l === 0 ? M.TAILLIGHT : M.HEADLIGHT) : color);
        if (l >= 2 && l <= 6) {
          const front = l === 2 || l === 6;
          const side = w === 0 || w === wid - 1;
          p(l, w, 2, kind === 6 ? color : front || side ? M.CAR_GLASS : color);
          if (l >= 3 && l <= 5) p(l, w, 3, kind === 4 && l === 4 ? (w < 2 ? M.AWN_R : M.AWN_B) : color);
        }
      }
    }
    if (kind !== 2 && kind !== 3 && kind !== 6 && seed % 5 === 0) p(0, 1, 2, M.TRUNK_LOOT);
    if (kind === 3 && seed % 3 === 0) p(len - 2, 2, 1, seed % 2 ? M.CRATE : M.CRATE_AMMO);
  }

  // A tree grows round what is there, not through it: nothing of it on a building's lot, and nothing put where something already is.
  const grow = (x, y, z, id) => {
    if (x < 0 || z < 0 || x >= WX || z >= WZ) return;
    const i = z * WX + x;
    if (lot[i] && ground[i] === G.LOT) return;
    const lx = x - ox, ly = y - oy, lz = z - oz;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= CS || ly >= CS || lz >= CS || d[lx | (ly << 5) | (lz << 10)]) return;
    put(x, y, z, id);
  };
  function tree(x, z, seed, size) {
    const base = STREET_Y - 1 + terr[Math.max(0, z * WX + x)] + 1;
    if (size && seed % 5 < 2) {
      // A pine: a tall bare trunk and a cone of dark needles.
      const tall = 9 + size * 2 + seed % 4;
      for (let y = 0; y < tall - 2; y++) grow(x, base + y, z, M.TRUNK);
      // Tiers that step in and out a little as they go up, but never wider than the one below: no flat cap sat on a narrower neck,
      // just a cone that comes to a point, with a single sprig standing off the top.
      let prev = 3;
      for (let y = 3 + seed % 2; y <= tall; y++) {
        const r = prev = Math.min(prev, Math.round((tall - y) * .42 + ((y & 1) ? .6 : 0)));
        for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz > r * r + 1 || (!dx && !dz && y < tall - 2)) continue;
          grow(x + dx, base + y, z + dz, M.LEAF);
        }
      }
      grow(x, base + tall + 1, z, M.LEAF);
      return;
    }
    const trunkH = 3 + size + seed % 3;
    for (let y = 0; y < trunkH; y++) grow(x, base + y, z, M.TRUNK);
    const r = 2 + size;
    const leaf = seed % 7 === 0 ? M.LEAF3 : seed % 2 ? M.LEAF : M.LEAF2;
    const cy = base + trunkH + r - 2;
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const dist = dx * dx + dy * dy * 1.4 + dz * dz;
      if (dist > r * r + 1) continue;
      if (dist > (r - 1) * (r - 1) && r3(x + dx, cy + dy, z + dz) < .22) continue;
      grow(x + dx, cy + dy, z + dz, leaf);
    }
  }

  // A farm tractor, long abandoned: big rear wheels and small front ones, a long bonnet with the exhaust stack up through it, the
  // seat and wheel out in the open behind, mudguards over the back wheels, and sometimes a roll cage with a roof. Paint gone to rust
  // in patches. dir 0-3: which way it faces.
  function tractor(x, z, dir, seed, base) {
    const paint = [M.CAR_R, M.AWN_G, M.CONT_O, M.CAR_B, M.BARN_R][seed % 5], cage = seed % 3 === 0;
    const p = (l, w, h, id) => {
      const L = dir & 1 ? 8 - l : l, W = dir & 2 ? 4 - w : w;
      if (dir < 2) put(x + W, base + h, z + L, id); else put(x + L, base + h, z + W, id);
    };
    const col = (l, w, h) => ((seed + l * 7 + w * 13 + h * 3) % 11 === 0 ? M.RUST : paint);
    // Rear wheels, four high, a rusted hub in each; front wheels, two high.
    for (const w of [0, 4]) {
      for (let l = 0; l <= 3; l++) for (let h = 0; h <= 3; h++) p(l, w, h, (l === 1 || l === 2) && (h === 1 || h === 2) ? M.RUST : M.TIRE);
      for (let l = 6; l <= 7; l++) for (let h = 0; h <= 1; h++) p(l, w, h, M.TIRE);
      for (let l = 0; l <= 3; l++) p(l, w, 4, col(l, w, 4));
    }
    // Chassis and bonnet, the grille at the front, the stack up through the bonnet.
    for (let l = 1; l <= 8; l++) for (let w = 1; w <= 3; w++) p(l, w, 1, col(l, w, 1));
    for (let l = 4; l <= 8; l++) for (let w = 1; w <= 3; w++) p(l, w, 2, l === 8 ? M.IRON : col(l, w, 2));
    for (let w = 1; w <= 3; w++) p(8, w, 1, M.IRON);
    for (let h = 3; h <= 5; h++) p(6, 3, h, M.IRON);
    // Where the driver sat: the seat, the wheel on its column, a step up.
    p(1, 2, 2, M.CAR_K); p(0, 2, 2, M.CAR_K); p(0, 2, 3, M.CAR_K);
    p(3, 2, 2, M.IRON); p(3, 2, 3, M.CAR_K);
    if (cage) {
      for (const l of [0, 3]) for (const w of [1, 3]) for (let h = 2; h <= 5; h++) p(l, w, h, M.IRON);
      for (let l = 0; l <= 3; l++) for (let w = 1; w <= 3; w++) p(l, w, 6, col(l, w, 6));
    }
  }

  function prop(idx) {
    const t = props[idx], x = props[idx + 1], z = props[idx + 2], a = props[idx + 3], b = props[idx + 4], c = props[idx + 5];
    const base = STREET_Y + terr[z * WX + x];
    switch (t) {
      case P.CAR: car(x, z, a, b, c, base); break;
      case P.TRACTOR: tractor(x, z, a, b, base); break;
      case P.BALE: { const y = STREET_Y + terr[z * WX + x]; if (a % 3) box(x, y, z, x + 2, y + 1, z + 1, M.HAY); else box(x, y, z, x + 1, y + 1, z + 2, M.HAY); break; }
      case P.TREE: if (ground[z * WX + x] === G.WALK) tree(x, z, a, 0); break;
      case P.PARKTREE: tree(x, z, a, 1 + a % 3); break;
      case P.LAMP:
        for (let y = 0; y < 9; y++) put(x, base + y, z, M.IRON);
        put(x, base + 9, z, M.IRON); put(x + 1, base + 9, z, M.IRON); put(x + 1, base + 8, z, M.STEEL);
        break;
      case P.HYDRANT: put(x, base, z, M.CAR_R); put(x, base + 1, z, M.CAR_R); break;
      case P.TRASH:
        put(x, base, z, M.CAR_K); if (a % 2) put(x + 1, base, z, M.CAR_K); if (a % 3 === 0) put(x, base, z + 1, M.TIRE);
        break;
      case P.NEWS: box(x, base, z, x + 3, base + 3, z + 2, M.AWN_G); box(x, base + 4, z - 1, x + 3, base + 4, z + 3, M.STEEL_D); break;
      case P.DUMPSTER: {
        const lx = a ? 4 : 2, lz = a ? 2 : 4;
        box(x, base, z, x + lx, base + 1, z + lz, M.CONT_G);
        put(x + 1, base + 2, z + 1, M.CRATE);
        break;
      }
      case P.BENCH: box(x, base, z, x, base, z + 3, M.WOOD_D); break;
      case P.ROCK: {
        const top = STREET_Y - 1 + terr[z * WX + x];
        const r = 2 + (a % 3);
        for (let dy = 0; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dz * dz + dy * dy * 2 <= r * r) put(x + dx, top + dy, z + dz, M.SCHIST);
        }
        break;
      }
      case P.CHECKPOINT: {
        const y = base;
        for (let k = -9; k <= 9; k++) {
          if (Math.abs(k) < 3) continue;
          put(x + k, y, z + 9, M.JERSEY); put(x + k, y + 1, z + 9, M.JERSEY);
          put(x + k, y, z - 9, M.SANDBAG); put(x + k, y + 1, z - 9, M.SANDBAG);
        }
        box(x - 2, y, z - 2, x + 2, y + 2, z + 4, M.CONT_G);
        box(x - 1, y + 3, z - 1, x + 1, y + 3, z + 2, M.CONT_G);
        put(x, y + 1, z - 3, M.CRATE_AMMO);
        break;
      }
    }
  }

  function structure(s) {
    switch (s.type) {
      case 'camp': stampCamp(camps[s.id], { box, put, ox, oy, oz, CS, ground, car, letterAt }); break;
      case 'spire': {
        const span = s.y1 - s.y0;
        for (let y = s.y0; y < s.y1; y++) {
          const t = (y - s.y0) / span;
          const r = Math.round(s.r0 * (1 - t) * (1 - t * .3));
          const mat = s.name === 'chrysler' ? ((y >> 2) % 2 ? M.ALUM : M.STEEL) : M.STEEL;
          box(s.x - r, y, s.z - r, s.x + r, y, s.z + r, mat);
        }
        break;
      }
      case 'bridge': {
        const dirn = s.xb > s.xa ? 1 : -1;
        const ramp = 60;
        const yBase = STREET_Y - 1;
        const a = Math.max(Math.min(s.xa, s.xb), ox), b = Math.min(Math.max(s.xa, s.xb), ox + CS - 1);
        for (let x = a; x <= b; x++) {
          const along = (x - s.xa) * dirn;
          const yd = along < ramp ? yBase + Math.floor((s.deck - yBase) * along / ramp) : s.deck;
          const broken = along > ramp + 110 + ((h2(x, 1) >> 3) % 6);
          if (broken && along < (s.xb - s.xa) * dirn - 40) continue;
          box(x, yd, s.z - s.w, x, yd, s.z + s.w, M.ASPHALT);
          box(x, yd - 1, s.z - s.w, x, yd - 1, s.z + s.w, M.STEEL_D);
          put(x, yd + 1, s.z - s.w, M.IRON); put(x, yd + 1, s.z + s.w, M.IRON);
          if (x % 8 === 0) { put(x, yd + 2, s.z - s.w, M.IRON); put(x, yd + 2, s.z + s.w, M.IRON); }
        }
        for (const tx of s.towers) {
          for (const zz of [s.z - s.w - 1, s.z + s.w + 1]) box(tx - 3, 4, zz - 2, tx + 3, s.deck + s.towerH, zz + 2, s.mat);
          box(tx - 3, s.deck + s.towerH - 5, s.z - s.w, tx + 3, s.deck + s.towerH, s.z + s.w, s.mat);
          box(tx - 3, s.deck + 3, s.z - s.w, tx + 3, s.deck + 6, s.z + s.w, s.mat);
          // Main cables sweeping down from the tower top.
          for (let x = a; x <= b; x++) {
            const dx = Math.abs(x - tx);
            if (dx > 96) continue;
            const yc = s.deck + 3 + Math.round((s.towerH - 3) * Math.pow(dx / 96 - 1, 2));
            for (const zz of [s.z - s.w, s.z + s.w]) {
              put(x, yc, zz, M.IRON);
              if (x % 6 === 0) box(x, s.deck + 1, zz, x, yc - 1, zz, M.IRON);
            }
          }
        }
        break;
      }
      case 'screen': {
        // A dead video wall bolted to the front of a building: black panels, a steel frame,
        // and the odd strip of old vinyl that nobody ever took down.
        for (let t = s.a0; t <= s.a1; t++) for (let y = s.y0; y <= s.y1; y++) {
          const edgeT = t === s.a0 || t === s.a1, edgeY = y === s.y0 || y === s.y1;
          let id = edgeT || edgeY ? M.SIGN_K : M.SCREEN;
          if (!edgeT && !edgeY) {
            if ((t + s.seed) % 8 === 0 || (y + s.seed) % 6 === 0) id = M.AD_BLACK;
            const n = r3(t, y, s.seed);
            if (n < .025) id = M.STEEL_D;
            if (y < s.y0 + 3 && (t >> 2) % 3 === 0) id = [M.AD_RED, M.AD_CREAM, M.AD_BLUE, M.AD_YELLOW][(s.seed + (t >> 2)) % 4];
          }
          put(s.fixed, y, t, id);
        }
        break;
      }
      case 'roofad': {
        // Two legs, a walkway and a painted board, facing both ways down the street.
        const a0 = s.alongX ? s.x0 : s.z0, a1 = s.alongX ? s.x1 : s.z1, w = a1 - a0 + 1;
        const P2 = (t, y, id) => (s.alongX ? put(t, y, s.z0, id) : put(s.x0, y, t, id));
        for (let t = a0 + 1; t < a1; t += Math.max(4, w >> 2)) for (let y = s.y0; y <= s.y0 + 3; y++) P2(t, y, M.IRON);
        for (let t = a0; t <= a1; t++) P2(t, s.y0 + 3, M.IRON);
        const scale = 1, textW = s.word.length * 4 - 1, off = (w - textW) >> 1;
        for (let t = a0; t <= a1; t++) for (let y = s.y0 + 4; y <= s.y0 + 11; y++) {
          const edge = y === s.y0 + 4 || y === s.y0 + 11 || t === a0 || t === a1;
          if (!edge && r3(t, y, s.seed) < .06) continue;
          const col = t - a0 - off, row = s.y0 + 9 - y;
          const on = !edge && col >= 0 && row >= 0 && row < 5 && col < textW && letterAt(s.word, col, row);
          P2(t, y, edge ? M.IRON : on ? s.fg : s.bg);
        }
        break;
      }
      case 'statue': {
        // Severn Rock Light: a concrete apron on the rock, the keeper's house, and the tower in its red and white bands.
        const yb = STREET_Y;
        for (let dz = -24; dz <= 24; dz++) for (let dx = -24; dx <= 24; dx++) {
          const dist = Math.hypot(dx, dz);
          if (dist <= 23.5) box(s.x + dx, yb, s.z + dz, s.x + dx, yb + 3, s.z + dz, dist > 21.5 ? M.GRANITE : M.CONCRETE);
        }
        box(s.x - 19, yb + 4, s.z + 5, s.x - 9, yb + 8, s.z + 14, M.CLAP_W);
        box(s.x - 18, yb + 4, s.z + 6, s.x - 10, yb + 7, s.z + 13, 0);
        box(s.x - 9, yb + 4, s.z + 8, s.x - 9, yb + 6, s.z + 9, 0);
        box(s.x - 20, yb + 9, s.z + 4, s.x - 8, yb + 9, s.z + 15, M.SHINGLE_R);
        box(s.x - 18, yb + 10, s.z + 6, s.x - 10, yb + 10, s.z + 13, M.SHINGLE_R);
        const b0 = yb + 4;
        for (let y = 0; y < 60; y++) {
          const r = 6.6 - y * .04, band = ((y / 10) | 0) % 2 ? M.BARN_R : M.CLAP_W;
          const R = Math.ceil(r);
          for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
            const q = dx * dx + dz * dz;
            if (q > r * r + 1) continue;
            // A shell, with the stair's centre post up the middle, and a door at the foot of it.
            if (q > (r - 1.4) * (r - 1.4)) { if (!(y < 3 && dx < 0 && Math.abs(dz) < 1)) put(s.x + dx, b0 + y, s.z + dz, band); } else if (!dx && !dz) put(s.x, b0 + y, s.z, M.IRON);
            else if (y % 6 === 0 && y) put(s.x + dx, b0 + y, s.z + dz, M.STEEL_D);
          }
        }
        // The gallery, the lantern room, and what is left of the lamp.
        for (let dz = -7; dz <= 7; dz++) for (let dx = -7; dx <= 7; dx++) {
          const q = dx * dx + dz * dz;
          if (q <= 44) put(s.x + dx, b0 + 60, s.z + dz, M.IRON);
          if (q <= 44 && q > 32) put(s.x + dx, b0 + 61, s.z + dz, M.IRON);
          if (q <= 14 && q > 7) for (let y = 61; y <= 65; y++) put(s.x + dx, b0 + y, s.z + dz, (dx + dz) % 3 ? M.GLASS_C : M.IRON);
          if (q <= 18) put(s.x + dx, b0 + 66, s.z + dz, M.COPPER);
          if (q <= 6) put(s.x + dx, b0 + 67, s.z + dz, M.COPPER);
        }
        box(s.x, b0 + 61, s.z, s.x, b0 + 64, s.z, M.NEON_W);
        box(s.x, b0 + 68, s.z, s.x, b0 + 70, s.z, M.IRON);
        // The floodlights: a squat steel housing with the lamp in it, bolted down round the apron.
        for (const [dx, dz] of STATUE_LAMPS) {
          box(s.x + dx - 1, yb + 4, s.z + dz - 1, s.x + dx + 1, yb + 4, s.z + dz + 1, M.STEEL_D);
          put(s.x + dx, yb + 5, s.z + dz, M.NEON_W);
        }
        break;
      }
    }
  }

  return function genChunk(cx, cy, cz) {
    ox = cx * CS; oy = cy * CS; oz = cz * CS;
    d = new Uint8Array(CS3);
    any = false;
    const col = cx + cz * CW;
    const y0 = oy, y1 = oy + CS - 1;
    if (y0 <= chunkTop[col]) {
      for (let z = oz; z < oz + CS; z++) for (let x = ox; x < ox + CS; x++) column(x, z, y0, y1);
      for (let k = binStart[col]; k < binStart[col + 1]; k++) prop(binData[k]);
    }
    for (const s of structs) {
      if (s.x1 >= ox && s.x0 < ox + CS && s.z1 >= oz && s.z0 < oz + CS) structure(s);
    }
    if (!any) return null;
    return d;
  };
}
