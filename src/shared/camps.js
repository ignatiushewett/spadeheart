// Survivor settlements: walled towns packed tight as slums, each with its own look and flag.
// planCamp turns a definition into plain data; stampCamp turns that data into voxels chunk by chunk.
// Everything placed reserves its footprint first, so no two pieces of a camp can overlap.
import { STREET_Y, WX, G } from './constants.js';
import { M, CLOTH_OF, FLAGS, F_CLOTH } from './materials.js';
import { h2, makeRng } from './rng.js';

// A real bed, a block off the floor: headboard, pillows, the sheet turned down, then the blanket, and maybe a spare folded at the foot.
// set(row, col, y, id) puts it wherever and whichever way round the caller wants it. Row 0 is the head.
const BLANKETS = [M.BEDROLL, M.BLANKET_G, M.BLANKET_R, M.BLANKET_B, M.BLANKET_C];
function layBed(set, rows, cols, seed) {
  const h = Math.abs(Math.floor(seed)), blanket = BLANKETS[h % BLANKETS.length], spare = BLANKETS[(h >> 3) % BLANKETS.length];
  for (let c = 0; c < cols; c++) {
    set(0, c, STREET_Y, M.WOOD_D);
    set(0, c, STREET_Y + 1, M.WOOD_D);
    set(1, c, STREET_Y, M.PILLOW);
    set(2, c, STREET_Y, M.MATTRESS);
    for (let r = 3; r < rows; r++) set(r, c, STREET_Y, r === rows - 1 && spare !== blanket && h % 3 === 0 ? spare : blanket);
  }
}

const YB = STREET_Y;
const G0 = YB - 1;

const E = {
  dollar: ['..#.#..', '.#####.', '#.#.#..', '.#####.', '..#.#.#', '.#####.', '..#.#..'],
  anchor: ['...#...', '..###..', '...#...', '...#...', '#..#..#', '##.#.##', '.#####.'],
  arch: ['#######', '#######', '##...##', '##...##', '##...##', '##...##', '##...##'],
  star: ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.', '.#...#.'],
  leaf: ['...##..', '..####.', '.#####.', '.#####.', '..###..', '...#...', '...#...'],
  anarchy: ['..###..', '.#.#.#.', '#.#.#.#', '#.###.#', '##...##', '.#...#.', '..###..'],
  cross: ['..###..', '..###..', '#######', '#######', '#######', '..###..', '..###..'],
  fist: ['.#.#.#.', '#######', '#######', '#######', '.#####.', '..###..', '..###..'],
  tower: ['#.#.#.#', '#######', '.#####.', '.##.##.', '.##.##.', '.#####.', '#######'],
};

export const CAMP_DEFS = [
  { key: 'bryant', name: 'Lakeshore Market', blurb: 'A trade town behind a wall of stacked taxis, where the river runs into the lake. No shooting on the market floor.', wall: 'cabs', H: 9, door: M.TAXI, gates: 'NSEW', flag: [M.PAINT_Y, M.PAINT_K], emblem: 'dollar', faction: [.78, .62, .14], wardrobe: ['civ', 'scrap', 'civ'], stalls: ['general', 'arms', 'medic', 'junk', 'food', 'builder'], stallCount: 44, guardWeapons: ['rifle', 'shotgun', 'smg', 'rifle', 'sniper'], folkWeapons: ['pistol', 'shotgun', 'smg', 'bat', 'machete', 'pistol'], folk: 330, mix: { shack: 5, tent: 2, shelter: 3, fire: 2, table: 3, kitchen: 1, workshop: 2, garden: 0, laundry: 1, well: 1, school: .4 } },
  { key: 'battery', name: 'Severn Landing', blurb: 'Containers, ferries and people still watching the bay for a ship.', wall: 'containers', H: 10, door: M.RUST, gates: 'NW', flag: [M.AWN_B, M.TENT_W], emblem: 'anchor', faction: [.2, .42, .72], wardrobe: ['scrap', 'civ'], stalls: ['general', 'junk', 'food', 'builder'], stallCount: 26, guardWeapons: ['rifle', 'shotgun', 'lmg', 'rifle'], folkWeapons: ['shotgun', 'pistol', 'axe', 'machete'], folk: 240, shackMats: [M.CONT_R, M.CONT_B, M.CONT_O, M.CONT_G], mix: { shack: 7, tent: 1, shelter: 3, fire: 2, table: 2, kitchen: 1, workshop: 2, garden: 0, laundry: 2, well: 1, school: .3 } },
  { key: 'wash', name: 'Weston Grange', blurb: 'A log palisade around the old fairground and its arch. Everything here is decided by vote.', wall: 'palisade', H: 9, door: M.LOG, gates: 'NSE', flag: [M.BARN_R, M.TENT_W], emblem: 'arch', faction: [.52, .27, .2], wardrobe: ['civ', 'civ', 'med'], stalls: ['general', 'medic', 'food', 'builder'], stallCount: 24, guardWeapons: ['rifle', 'crossbow', 'shotgun', 'crossbow'], folkWeapons: ['crossbow', 'bat', 'machete', 'pistol', 'spear'], folk: 280, mix: { shack: 2, tent: 5, shelter: 3, fire: 3, table: 3, kitchen: 1, workshop: 1, garden: 3, laundry: 1, well: 1, school: 1 } },
  { key: 'union', name: 'Fort Westpoint', blurb: 'National Guard who stopped taking orders. Sandbags, drills and a straight flagpole.', wall: 'hesco', H: 9, door: M.STEEL_D, gates: 'NSE', flag: [M.CONT_G, M.TENT_W], emblem: 'star', faction: [.82, .82, .78], wardrobe: ['mil', 'mil', 'mil', 'civ'], stalls: ['arms', 'junk', 'food', 'builder'], stallCount: 20, guardWeapons: ['rifle', 'rifle', 'lmg', 'sniper', 'rifle'], folkWeapons: ['rifle', 'rifle', 'smg', 'pistol'], folk: 300, tentCols: [M.TENT_G, M.TENT_G, M.CANVAS], shackMats: [M.CONT_G, M.CONCRETE_D], mix: { shack: 1, tent: 7, shelter: 1, fire: 1, table: 2, kitchen: 1, workshop: 2, garden: 0, laundry: .5, well: 1, school: .2 } },
  { key: 'sheep', name: 'Arnhem Bastion', blurb: 'Sheet steel, crops and rules. The closest thing left to a town.', wall: 'sheet', H: 10, door: M.STEEL, gates: 'NSE', flag: [M.AWN_G, M.PAINT_Y], emblem: 'leaf', faction: [.26, .55, .24], wardrobe: ['civ', 'civ', 'mil'], stalls: ['general', 'arms', 'medic', 'food', 'builder'], stallCount: 28, guardWeapons: ['rifle', 'sniper', 'shotgun', 'rifle'], folkWeapons: ['shotgun', 'pistol', 'rifle', 'axe', 'bat'], folk: 380, shackMats: [M.PLANK, M.WOOD, M.TENT_W], mix: { shack: 7, tent: 1, shelter: 2, fire: 2, table: 3, kitchen: 1, workshop: 1, garden: 5, laundry: 2, well: 1, school: 1 } },
  { key: 'tompkins', name: 'Cannery Collective', blurb: 'Punks, squatters and a wall they painted themselves, in the old cannery sheds back of Dayton. They were ready for this.', wall: 'scrap', H: 8, door: M.RUST, gates: 'SW', flag: [M.PAINT_K, M.RUST], emblem: 'anarchy', faction: [.27, .25, .25], wardrobe: ['scrap', 'scrap', 'civ'], stalls: ['junk', 'general', 'food', 'builder'], stallCount: 22, guardWeapons: ['shotgun', 'smg', 'crossbow', 'rifle'], folkWeapons: ['bat', 'machete', 'axe', 'crossbow', 'pistol', 'spear'], folk: 240, shackMats: [M.RUST, M.CONT_R, M.PLANK, M.RUST, M.PAINT_K, M.BRICK_B], mix: { shack: 6, tent: 2, shelter: 4, fire: 4, table: 2, kitchen: 1, workshop: 3, garden: 1, laundry: 1, well: 1, school: .2 } },
  { key: 'morning', name: 'Gibson Redoubt', blurb: 'The last working clinic this side of the mountain, ringed by ambulances and white tents.', wall: 'white', H: 9, door: M.CAR_W, gates: 'NS', flag: [M.TENT_W, M.AWN_R], emblem: 'cross', faction: [.72, .14, .12], wardrobe: ['med', 'med', 'civ'], stalls: ['medic', 'general', 'food', 'builder'], stallCount: 24, guardWeapons: ['rifle', 'shotgun', 'smg', 'rifle'], folkWeapons: ['pistol', 'pistol', 'smg', 'bat'], folk: 280, tentCols: [M.TENT_W], shackMats: [M.TENT_W, M.CAR_W], mix: { shack: 2, tent: 7, shelter: 2, fire: 1, table: 2, kitchen: 1, workshop: 1, garden: 1, laundry: 3, well: 1, school: .4 } },
  { key: 'garvey', lowCorners: true, clearCorners: 30, name: 'Carver Yard', blurb: 'Block captains, a church and a basketball court, in the old mill village down the valley from Esperance. The valley looks after its own.', wall: 'brick', H: 9, door: M.TAXI, gates: 'NSE', flag: [M.AWN_R, M.AWN_G], emblem: 'fist', faction: [.72, .42, .12], wardrobe: ['civ', 'civ', 'scrap'], stalls: ['arms', 'junk', 'general', 'food', 'builder'], stallCount: 28, guardWeapons: ['rifle', 'shotgun', 'sniper', 'lmg'], folkWeapons: ['shotgun', 'pistol', 'bat', 'rifle', 'smg'], folk: 430, shackMats: [M.BRICK_R, M.BRICK_B, M.PLANK, M.RUST], tentCols: [M.TENT_G, M.CANVAS, M.TENT_W, M.CANVAS], mix: { tenement: 5, wreck: .8, shack: 4, tent: 1, shelter: 2, fire: 4, table: 5, kitchen: 2, workshop: 1, garden: 1, laundry: 2, well: 1, school: 1 } },
  { key: 'tryon', name: 'Abbey Keep', blurb: 'The museum staff held the old abbey in Westmoor, on Albion\'s west side, and built out from its stone. Crossbows, because gunfire carries.', wall: 'stone', H: 13, door: M.WOOD_D, gates: 'SW', flag: [M.STAINED, M.PAINT_Y], emblem: 'tower', faction: [.38, .33, .42], wardrobe: ['civ', 'mil', 'civ'], stalls: ['general', 'arms', 'food', 'builder'], stallCount: 22, guardWeapons: ['crossbow', 'rifle', 'sniper', 'rifle'], folkWeapons: ['crossbow', 'spear', 'crossbow', 'axe', 'machete'], folk: 270, shackMats: [M.GRANITE, M.WOOD_D, M.SCHIST], mix: { shack: 5, tent: 2, shelter: 2, fire: 3, table: 3, kitchen: 1, workshop: 2, garden: 2, laundry: 1, well: 1, school: .4 } },
];

// Uptown's brick, the same as the blocks outside the wall. These ones are lived in and patched up with whatever came to hand.
const ROW_STYLES = [
  { wall: M.BRICK_P, trim: M.BROWNSTONE, p: 4, w: 2 },
  { wall: M.BRICK_O, trim: M.CONCRETE_D, p: 3, w: 1, esc: true },
  { wall: M.BROWNSTONE, trim: M.BRICK_B, p: 4, w: 2 },
  { wall: M.BRICK_R, trim: M.BRICK_R2, p: 4, w: 2 },
  { wall: M.BRICK_R2, trim: M.BRICK_B, p: 3, w: 1, esc: true },
];

const ROLE_SIGN = { general: M.AWN_G, arms: M.AWN_R, medic: M.AWN_B, junk: M.CANVAS, food: M.CONT_O, builder: M.PLANK, mechanic: M.PAINT_Y };
// Nobody built these from the same plan. Each trade tends towards what suits it, and what they could get hold of.
const STALL_STYLES = { general: ['awning', 'kiosk', 'tarp', 'awning'], arms: ['container', 'kiosk', 'container'], medic: ['awning', 'kiosk'], junk: ['tarp', 'container', 'tarp'], food: ['cart', 'awning', 'cart', 'kiosk'], builder: ['yard', 'tarp', 'yard'], mechanic: ['garage'] };
const WARM = 0, FIRE = 1, COOL = 2;

export function planCamp(def, id, r, ground) {
  const rng = makeRng(9000 + id * 77);
  const c = {
    id, key: def.key, name: def.name, blurb: def.blurb, wall: def.wall, H: def.H, door: def.door, flag: def.flag, emblem: def.emblem, faction: def.faction,
    wardrobe: def.wardrobe, guardWeapons: def.guardWeapons, folkWeapons: def.folkWeapons, folk: def.folk,
    x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, cx: (r.x0 + r.x1) >> 1, cz: (r.z0 + r.z1) >> 1,
    parts: [], gates: [], guards: [], sentries: [], vendors: [], fires: [], pois: [], lights: [], floods: [], spots: {}, maxY: YB + def.H + 12,
  };
  const W = r.x1 - r.x0 + 1, D = r.z1 - r.z0 + 1;
  const occ = new Uint8Array(W * D);    // nothing else may be built here
  const solid = new Uint8Array(W * D);  // nobody can walk through here
  const inR = (x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
  const reserve = (x0, z0, x1, z1) => {
    for (let z = Math.max(r.z0, z0); z <= Math.min(r.z1, z1); z++) for (let x = Math.max(r.x0, x0); x <= Math.min(r.x1, x1); x++) occ[(x - r.x0) + (z - r.z0) * W] = 1;
  };
  const block = (x0, z0, x1, z1) => {
    for (let z = Math.max(r.z0, z0); z <= Math.min(r.z1, z1); z++) for (let x = Math.max(r.x0, x0); x <= Math.min(r.x1, x1); x++) solid[(x - r.x0) + (z - r.z0) * W] = 1;
  };
  const isFree = (x0, z0, x1, z1) => {
    if (x0 < r.x0 + 8 || z0 < r.z0 + 8 || x1 > r.x1 - 8 || z1 > r.z1 - 8) return false;
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (occ[(x - r.x0) + (z - r.z0) * W] || ground[z * WX + x] === G.WATER) return false;
    }
    return true;
  };
  // Parts you can walk under or across say so; everything else is solid to the people who live here.
  const OPEN = { hallchurch: 1, crops: 1, court: 1, graves: 1, bigtent: 1, cloister: 1, firepit: 1, table: 1, mechyard: 1, clinic: 1, lamp: 1, lights: 1, flag: 1, school: 1, range: 1, laundry: 1, garden: 1, kitchen: 1, nest: 1, well: 1 };
  const add = (t, x0, z0, x1, z1, h, extra = {}) => {
    c.parts.push({ t, x0, z0, x1, z1, h, ...extra });
    reserve(x0, z0, x1, z1);
    if (!OPEN[t]) block(x0, z0, x1, z1);
    if (YB + h + 2 > c.maxY) c.maxY = YB + h + 2;
  };
  const light = (x, z, rad, kind = WARM) => c.lights.push({ x, z, r: rad, k: kind });
  // Nearest open spot to where a landmark would like to be.
  const placeNear = (w, d, ox, oz, pad = 2) => {
    for (let rad = 0; rad < 130; rad += 3) for (let a = 0; a < 12; a++) {
      const x = Math.round(ox + Math.cos(a * .5236) * rad), z = Math.round(oz + Math.sin(a * .5236) * rad);
      if (isFree(x - pad, z - pad, x + w + pad - 1, z + d + pad - 1)) return { x, z };
    }
    return null;
  };
  for (const k of r.keep || []) { reserve(k.x0 - 3, k.z0 - 3, k.x1 + 3, k.z1 + 3); block(k.x0, k.z0, k.x1, k.z1); }

  // --- Gates, wall guards, towers ------------------------------------------------------------
  const hc = def.H - 1;
  c.hc = hc;
  const gateHalf = 5;
  const px = r.plazaX ?? c.cx, pz = r.plazaZ ?? c.cz;
  // Carver Yard keeps its books in the old church, on the edge of the square.
  const harlem = def.key === 'garvey';
  const mkGate = (side) => {
    const horiz = side === 'N' || side === 'S';
    const tc = horiz ? px : pz;
    const base = side === 'N' ? r.z0 : side === 'S' ? r.z1 - 1 : side === 'W' ? r.x0 : r.x1 - 1;
    const g = horiz
      ? { side, x0: tc - gateHalf, x1: tc + gateHalf, z0: base, z1: base + 1 }
      : { side, x0: base, x1: base + 1, z0: tc - gateHalf, z1: tc + gateHalf };
    g.y0 = YB; g.y1 = YB + hc - 2; g.mat = def.door; g.horiz = horiz; g.tc = tc;
    g.cx = (g.x0 + g.x1) >> 1; g.cz = (g.z0 + g.z1) >> 1;
    c.gates.push(g);
    const inX = horiz ? 0 : (side === 'W' ? 1 : -1), inZ = horiz ? (side === 'N' ? 1 : -1) : 0;
    for (const s of [-1, 1]) {
      // Built out from the wall's outer face, which keeps the walkway behind it clear all the way past.
      const tx = horiz ? tc + s * (gateHalf + 3) : (side === 'W' ? r.x0 - 1 : r.x1 + 1);
      const tz = horiz ? (side === 'N' ? r.z0 - 1 : r.z1 + 1) : tc + s * (gateHalf + 3);
      c.parts.push({ t: 'tower', x0: tx - 2, z0: tz - 2, x1: tx + 2, z1: tz + 2, h: def.H + 5, mat: def.wall });
      reserve(tx - 3, tz - 3, tx + 3, tz + 3);
      const yaw = side === 'N' ? Math.PI : side === 'S' ? 0 : side === 'W' ? -Math.PI / 2 : Math.PI / 2;
      // Floodlights on the gate towers, aimed out across the approach.
      const outX = -inX, outZ = -inZ;
      // The watch stands a step back from the lamp housing, so nobody has their head in the light.
      c.guards.push({ x: tx + .5 - outX * 1.2, y: YB + def.H + 6, z: tz + .5 - outZ * 1.2, yaw, gate: true });
      // Up on the roof's outer edge, over the heads of the watch and out of the way of the view.
      c.parts.push({ t: 'flood', x0: tx + outX * 3 - 1, z0: tz + outZ * 3 - 1, x1: tx + outX * 3 + 1, z1: tz + outZ * 3 + 1, h: def.H + 11, dx: outX, dz: outZ, roof: true });
      c.floods.push({ x: tx + outX * 4 + .5, y: YB + def.H + 11, z: tz + outZ * 4 + .5, dx: outX, dz: outZ });
    }
    light(g.cx - inX * 18, g.cz - inZ * 18, 36, COOL);
    // Gate watch on the ground: the two people you always pass on the way in.
    const inYaw = side === 'N' ? 0 : side === 'S' ? Math.PI : side === 'W' ? Math.PI / 2 : -Math.PI / 2;
    for (const s of [-1, 1]) {
      c.sentries.push({
        x: (horiz ? tc + s * 6 : base + inX * 9) + .5, z: (horiz ? base + inZ * 9 : tc + s * 6) + .5, yaw: inYaw + Math.PI,
      });
    }
    light(g.cx + inX * 6, g.cz + inZ * 6, 18);
  };
  for (const s of def.gates) mkGate(s);
  // Corner towers sit outside the corner, so the walkways on either side join up behind them.
  for (const [tx, tz] of [[r.x0 - 2, r.z0 - 2], [r.x1 + 2, r.z0 - 2], [r.x0 - 2, r.z1 + 2], [r.x1 + 2, r.z1 + 2]]) {
    // A humbler camp puts up something lower and narrower: a lookout, not a keep.
    if (def.lowCorners) {
      const lx = tx < c.cx ? r.x0 - 1 : r.x1 + 1, lz = tz < c.cz ? r.z0 - 1 : r.z1 + 1;
      c.parts.push({ t: 'tower', x0: lx - 2, z0: lz - 2, x1: lx + 2, z1: lz + 2, h: def.H + 5, mat: def.wall, big: true });
      c.guards.push({ x: lx + .5, y: YB + def.H + 6, z: lz + .5, yaw: Math.atan2(lx - c.cx, lz - c.cz), sniper: true });
      light(lx, lz, 16);
      continue;
    }
    c.parts.push({ t: 'tower', x0: tx - 3, z0: tz - 3, x1: tx + 3, z1: tz + 3, h: def.H + 8, mat: def.wall, big: true });
    reserve(tx - 4, tz - 4, tx + 4, tz + 4);
    c.guards.push({ x: tx + .5, y: YB + def.H + 9, z: tz + .5, yaw: Math.atan2(tx - c.cx, tz - c.cz), sniper: true });
    light(tx, tz, 22);
  }
  c.maxY = Math.max(c.maxY, YB + def.H + 14);
  const nearGate = (side, t) => c.gates.some((g) => g.side === side && Math.abs(g.tc - t) < gateHalf + 7);
  const walkY = YB + hc;
  // A thin line on the wall itself: a few people walking each side of it. Most people here are down in the town.
  const POST = 3;   // one lookout per this many 13-voxel stretches
  let run = 0;
  for (let x = r.x0 + 14; x < r.x1 - 10; x += 13, run++) {
    if (run % POST === 0) {
      if (!nearGate('N', x)) c.guards.push({ x: x + .5, y: walkY, z: r.z0 + 3.5, yaw: Math.PI, beat: { side: 'N', axis: 'x', lo: r.x0 + 6, hi: r.x1 - 6 } });
      if (!nearGate('S', x)) c.guards.push({ x: x + .5, y: walkY, z: r.z1 - 2.5, yaw: 0, beat: { side: 'S', axis: 'x', lo: r.x0 + 6, hi: r.x1 - 6 } });
    }
    if (x % 39 < 13) { light(x, r.z0 + 5, 13); light(x, r.z1 - 5, 13); }
    c.pois.push({ x: x + .5, z: r.z0 + 9.5, kind: 'patrol', yaw: Math.PI }, { x: x + .5, z: r.z1 - 8.5, kind: 'patrol', yaw: 0 });
  }
  run = 0;
  for (let z = r.z0 + 14; z < r.z1 - 10; z += 13, run++) {
    if (run % POST === 0) {
      if (!nearGate('W', z)) c.guards.push({ x: r.x0 + 3.5, y: walkY, z: z + .5, yaw: -Math.PI / 2, beat: { side: 'W', axis: 'z', lo: r.z0 + 6, hi: r.z1 - 6 } });
      if (!nearGate('E', z)) c.guards.push({ x: r.x1 - 2.5, y: walkY, z: z + .5, yaw: Math.PI / 2, beat: { side: 'E', axis: 'z', lo: r.z0 + 6, hi: r.z1 - 6 } });
    }
    if (z % 39 < 13) { light(r.x0 + 5, z, 13); light(r.x1 - 5, z, 13); }
    c.pois.push({ x: r.x0 + 9.5, z: z + .5, kind: 'patrol', yaw: -Math.PI / 2 }, { x: r.x1 - 8.5, z: z + .5, kind: 'patrol', yaw: Math.PI / 2 });
  }

  // Ring road just inside the wall, and four avenues meeting at the plaza. The town grows between them.
  reserve(r.x0, r.z0, r.x1, r.z0 + 10); reserve(r.x0, r.z1 - 10, r.x1, r.z1);
  reserve(r.x0, r.z0, r.x0 + 10, r.z1); reserve(r.x1 - 10, r.z0, r.x1, r.z1);
  block(r.x0, r.z0, r.x1, r.z0 + 6); block(r.x0, r.z1 - 6, r.x1, r.z1);
  block(r.x0, r.z0, r.x0 + 6, r.z1); block(r.x1 - 6, r.z0, r.x1, r.z1);
  const AV = 4;
  reserve(px - AV, r.z0, px + AV, r.z1); reserve(harlem ? px : r.x0, pz - AV, r.x1, pz + AV);

  // --- Plaza: the heart of the place --------------------------------------------------------------
  const PW = 24, PD = 20;
  reserve(px - PW, pz - PD, px + PW, pz + PD);
  c.boss = { x: px, z: pz - 13 };
  light(px, pz - 14, 12);
  add('bonfire', px - 4, pz - 3, px + 4, pz + 3, 3);
  c.fires.push({ x: px, z: pz, big: true });
  light(px, pz, 30, FIRE);
  // Long benches around the bonfire: this is where a camp sits together at night.
  for (const [dx, dz, yaw] of [[-8, 0, Math.PI / 2], [8, 0, -Math.PI / 2], [0, -8, 0], [0, 8, Math.PI]]) {
    const hz = dx === 0;
    add('bench', px + dx - (hz ? 4 : 0), pz + dz - (hz ? 0 : 4), px + dx + (hz ? 4 : 0), pz + dz + (hz ? 0 : 4), 1);
    for (let k = -3; k <= 3; k += 1.5) c.pois.push({ x: px + dx + (hz ? k : 0) + .5, z: pz + dz + (hz ? 0 : k) + .5, kind: 'sit', yaw, seat: true });
  }
  add('flag', px + 16, pz - 16, px + 26, pz - 16, 26, { c1: def.flag[0], c2: def.flag[1] });
  add('flag', px - 26, pz - 16, px - 16, pz - 16, 26, { c1: def.flag[0], c2: def.flag[1] });
  c.maxY = Math.max(c.maxY, YB + 29);
  c.spots.plaza = { x: px + 12.5, z: pz + 10.5 };
  // Conversations in the open.
  const talkCluster = (x, z) => {
    const n = 3 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283;
      c.pois.push({ x: x + Math.cos(a) * 1.5, z: z + Math.sin(a) * 1.5, kind: 'talk', yaw: Math.atan2(-Math.cos(a), -Math.sin(a)) });
    }
  };
  talkCluster(px + 15, pz + 7); talkCluster(px - 15, pz - 7); talkCluster(px + 16, pz - 9);
  const first = c.gates[0];
  c.spots.gate = { x: first.cx + (first.horiz ? 12 : (first.side === 'W' ? 9 : -9)), z: first.cz + (first.horiz ? (first.side === 'N' ? 9 : -9) : 12) };

  if (harlem) {
    const D = 32, x1 = px - PW - 3, x0 = x1 - D + 1, z0 = pz - 11, z1 = pz + 11;
    add('hallchurch', x0, z0, x1, z1, 24, { roof: M.ROOF_TAR, far: M.BRICK_R, flag1: def.flag[0], flag2: def.flag[1] });
    c.maxY = Math.max(c.maxY, YB + 32);
    c.clerk = { x: x1 - (D - 5) + .5, z: pz + .5, yaw: Math.PI / 2, doorX: x1 - 1.5, doorZ: pz + .5 };
    c.spots.hq = { x: x1 + 2.5, z: pz - 7.5 };
    light(x1 - 2, pz, 15); light(x1 - 13, pz, 13); light(x1 - 24, pz, 13);
    for (let k = 0; k < 4; k++) c.pois.push({ x: x1 + 2.5, z: pz - 4.5 + k * 3, kind: 'stand', yaw: -Math.PI / 2 });
    // Only the walls, the sandbags and the table stop anyone. Everything between them is floor.
    const Wd = z1 - z0 + 1, mid = Wd >> 1;
    block(x0, z0, x1 - 3, z0); block(x0, z1, x1 - 3, z1); block(x0, z0, x0, z1);
    block(x1 - 3, z0, x1 - 3, pz - 3); block(x1 - 3, pz + 3, x1 - 3, z1);
    block(x1 - 1, z0, x1, pz - 4); block(x1 - 1, pz + 4, x1, z1);
    block(x1 - (D - 6), pz - 3, x1 - (D - 7), pz + 3);
    // A queue down the aisle for the clerk, people waiting along what is left of the pews, and knots of them arguing by the walls.
    c.hallPois = [];
    const hallPoi = (v, u, kind, yaw, seat) => { const q = { x: x1 - v + .5, z: z0 + u + .5, kind, yaw, hall: true }; if (seat) q.seat = true; c.hallPois.push(q); };
    c.hallQueue = [];
    for (let v = D - 9; v >= 9.5; v -= 1.5) {
      const x = x1 - v + .5, z = z0 + mid - .5 + ((h2(v * 2, 7) % 3) - 1) * .2;
      c.hallQueue.push({ x, z, kind: 'stand', yaw: Math.atan2(c.clerk.x - x, c.clerk.z - z), hall: true });
    }
    for (let v = 11; v <= D - 10; v += 3) for (let u = 3; u <= Wd - 4; u += 2) if (Math.abs(u - mid) > 2 && h2(u, v) % 5) hallPoi(v, u, 'sit', -Math.PI / 2, true);
    for (const [v, u] of [[9, 3], [9, Wd - 4], [D - 9, 3], [D - 9, Wd - 4]]) {
      for (const [a, b, yaw] of [[0, 0, Math.PI / 2], [1, 1, 0], [-1, 1, Math.PI]]) hallPoi(v + a, u + b, 'talk', yaw);
    }
    // Everyone who could not face the queue: out front and along that side of the building, drifting from one spot to the next. The way to the door stays open.
    c.hallYard = [];
    for (let dx = 2; dx <= 11; dx += 3) for (let z = z0 - 3; z <= z1 + 4; z += 3) {
      if (Math.abs(z - pz) <= 3 && dx < 8) continue;
      const k = h2(dx, z);
      c.hallYard.push({ x: x1 + dx + .5 + (k % 3) * .5, z: z + .5, kind: k % 4 ? 'stand' : 'talk', yaw: (k % 8) * .785 - Math.PI });
    }
  }

  // --- Market: stalls shoulder to shoulder along the avenues ------------------------------------------
  const stallSlots = [];
  for (let d = PD + 3; pz - d > r.z0 + 16; d += 11) for (const s of [-1, 1]) stallSlots.push({ x: px + s * (AV + 1), z: pz - d, face: s < 0 ? 'E' : 'W' });
  for (let d = PD + 3; pz + d < r.z1 - 16; d += 11) for (const s of [-1, 1]) stallSlots.push({ x: px + s * (AV + 1), z: pz + d, face: s < 0 ? 'E' : 'W' });
  for (let d = PW + 3; px - d > r.x0 + 16; d += 11) for (const s of [-1, 1]) stallSlots.push({ x: px - d, z: pz + s * (AV + 1), face: s < 0 ? 'S' : 'N' });
  for (let d = PW + 3; px + d < r.x1 - 16; d += 11) for (const s of [-1, 1]) stallSlots.push({ x: px + d, z: pz + s * (AV + 1), face: s < 0 ? 'S' : 'N' });
  stallSlots.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
  let stalls = 0, hasDoctor = true;
  for (const s of stallSlots) {
    if (stalls >= def.stallCount) break;
    const horizontalFront = s.face === 'E' || s.face === 'W';
    // Stall footprint: 9 along the street, 6 deep, opening onto it.
    const b = horizontalFront
      ? { x0: s.face === 'E' ? s.x - 5 : s.x, x1: s.face === 'E' ? s.x : s.x + 5, z0: s.z - 4, z1: s.z + 4 }
      : { x0: s.x - 4, x1: s.x + 4, z0: s.face === 'S' ? s.z - 5 : s.z, z1: s.face === 'S' ? s.z : s.z + 5 };
    if (!isFree(b.x0, b.z0, b.x1, b.z1)) continue;
    // A gap in the row now and then, where somebody has left their stock in the way.
    if (!harlem && hasDoctor && stalls > 3 && rng() < .1) {
      add('goods', b.x0 + 2, b.z0 + 2, b.x1 - 2, b.z1 - 2, 3, { seed: b.x0 * 7 + b.z0 });
      continue;
    }
    // The first and best spot on the market is the camp's doctor.
    const doctor = false;
    const role = doctor ? 'medic' : stalls < def.stalls.length ? def.stalls[stalls] : def.stalls[Math.floor(rng() * def.stalls.length)];
    const style = doctor ? 'clinic' : STALL_STYLES[role][Math.floor(rng() * STALL_STYLES[role].length)];
    add('stall', b.x0, b.z0, b.x1, b.z1, 7, { sign: ROLE_SIGN[role], face: s.face, role, style });
    const cx = (b.x0 + b.x1 + 1) / 2, cz = (b.z0 + b.z1 + 1) / 2;
    const yaw = { E: Math.PI / 2, W: -Math.PI / 2, N: Math.PI, S: 0 }[s.face];
    // Right behind the counter, with nothing between you and them but the counter itself.
    const bx = horizontalFront ? (s.face === 'E' ? b.x1 - .5 : b.x0 + 1.5) : cx, bz = horizontalFront ? cz : (s.face === 'S' ? b.z1 - .5 : b.z0 + 1.5);
    const ox = horizontalFront ? (s.face === 'E' ? b.x1 + 1.8 : b.x0 - .8) : cx, oz = horizontalFront ? cz : (s.face === 'S' ? b.z1 + 1.8 : b.z0 - .8);
    // Room for a small knot of people along the counter, looking over what is on it.
    const browse = [];
    for (const k of [-3, -1, 1, 3]) {
      const p = { x: ox + (horizontalFront ? 0 : k), z: oz + (horizontalFront ? k : 0), kind: 'browse', yaw: yaw + Math.PI };
      browse.push(p);
      c.pois.push(p);
    }
    c.vendors.push({ role, x: bx, z: bz, yaw, browse, doctor });
    light(cx, cz, 9);
    if (doctor) hasDoctor = true; else stalls++;
  }
  c.spots.market = { x: px + AV + .5, z: pz + PD + 6.5 };

  // Strings of bulbs over the avenues, so the town can be seen from the wall at night.
  // Strings of bulbs across the avenues, except where one would run through the front of the church.
  const string = (x0, z0, x1, z1, lx, lz) => {
    if (c.parts.some((q) => q.t === 'hallchurch' && x1 >= q.x0 - 3 && x0 <= q.x1 + 3 && z1 >= q.z0 - 3 && z0 <= q.z1 + 3)) return;
    c.parts.push({ t: 'lights', x0, z0, x1, z1, h: 7 });
    light(lx, lz, 11);
  };
  // Each string crosses in a gap between two stalls, its poles in line with the stall fronts: nothing stands in the walkway or at a counter.
  for (let d = PD + 9; pz - d > r.z0 + 13; d += 22) string(px - AV - 1, pz - d, px + AV + 1, pz - d, px, pz - d);
  for (let d = PD + 9; pz + d < r.z1 - 13; d += 22) string(px - AV - 1, pz + d, px + AV + 1, pz + d, px, pz + d);
  for (let d = PW + 9; px - d > r.x0 + 13; d += 22) string(px - d, pz - AV - 1, px - d, pz + AV + 1, px - d, pz);
  for (let d = PW + 9; px + d < r.x1 - 13; d += 22) string(px + d, pz - AV - 1, px + d, pz + AV + 1, px + d, pz);

  // --- Signature buildings --------------------------------------------------------------------------
  const sig = (t, w, d, ox, oz, h, extra = {}, pad = 2) => {
    const s = placeNear(w, d, px + ox * .82, pz + oz * .82, pad);
    if (!s) return null;
    add(t, s.x, s.z, s.x + w - 1, s.z + d - 1, h, extra);
    return s;
  };
  const hall = (ox, oz, w, d, h, mat, roof, name = 'hq') => {
    const s = sig('hall', w, d, ox, oz, h, { mat, roof, emblem: def.emblem, c1: def.flag[0], c2: def.flag[1] });
    if (s && name === 'hq') c.hall = { x0: s.x, z0: s.z, x1: s.x + w - 1, z1: s.z + d - 1 };
    if (s) {
      c.spots[name] = { x: s.x + (w >> 1) + .5, z: s.z + d + 4.5 };
      light(s.x + (w >> 1), s.z + d + 2, 14);
      for (let k = 0; k < 3; k++) c.pois.push({ x: s.x + 4 + k * 5, z: s.z + d + 5, kind: 'stand', yaw: 0 });
    }
    return s;
  };
  const cropField = (ox, oz, w, d, kind) => {
    const s = sig('crops', w, d, ox, oz, 2, { kind });
    if (!s) return;
    for (let k = 0; k < Math.min(14, w * d / 40); k++) c.pois.push({ x: s.x + 1 + rng() * (w - 2), z: s.z + 1 + rng() * (d - 2), kind: 'farm', yaw: rng() * 6.28 });
    c.spots.field = { x: s.x + (w >> 1) + .5, z: s.z + d + 1.5 };
  };
  switch (def.key) {
    case 'bryant':
      sig('lions', 13, 6, -50, -14, 4);
      hall(-40, -48, 36, 16, 8, M.CONT_O, M.TENT_B);
      sig('mural', 22, 1, 40, -44, 12, { seed: 3 });
      break;
    case 'battery':
      sig('crane', 15, 9, 40, 48, 58);
      sig('ferry', 46, 20, -70, 56, 13);
      hall(-44, -44, 34, 14, 7, M.CONT_B, M.RUST);
      sig('racks', 20, 9, 40, -44, 4);
      break;
    case 'wash':
      sig('arch', 27, 9, -13, -60, 28, {}, 1);
      hall(-70, -30, 28, 14, 6, M.BRICK_R, M.ROOF_TAR);
      cropField(34, -56, 30, 18, 'mixed');
      sig('mural', 24, 1, -40, 52, 9, { seed: 11 });
      break;
    case 'union':
      sig('bigtent', 30, 20, -60, -58, 7, { col: M.TENT_G, tables: true });
      sig('bigtent', 30, 20, 30, -58, 7, { col: M.TENT_G });
      hall(-14, -62, 28, 12, 6, M.CONT_G, M.ROOF_GRAVEL);
      sig('humvee', 5, 9, -68, 30, 5);
      sig('humvee', 5, 9, -58, 30, 5);
      sig('humvee', 5, 9, 58, 30, 5);
      sig('range', 32, 14, 30, 44, 4);
      break;
    case 'sheep':
      cropField(-82, -110, 56, 40, 'tomato');
      cropField(-22, -110, 50, 40, 'corn');
      cropField(36, -110, 44, 40, 'mixed');
      cropField(-82, 70, 44, 36, 'corn');
      sig('greenhouse', 30, 18, 44, 72, 6);
      sig('windmill', 5, 5, -48, -56, 32);
      sig('windmill', 5, 5, 48, -56, 32);
      hall(-18, -50, 36, 14, 7, M.PLANK, M.ROOF_TAR);
      sig('tank', 9, 9, 60, -30, 14);
      break;
    case 'tompkins':
      sig('mural', 30, 1, -56, -40, 14, { seed: 21 });
      sig('mural', 30, 1, 26, -40, 14, { seed: 8 });
      sig('mural', 40, 1, -20, 44, 10, { seed: 2 });
      hall(-16, -44, 30, 14, 7, M.BRICK_B, M.PAINT_K);
      break;
    case 'morning':
      for (let k = 0; k < 4; k++) sig('bigtent', 27, 18, -70 + k * 36, -62, 7, { col: M.TENT_W, cross: true });
      hall(-24, 40, 46, 16, 8, M.TENT_W, M.ROOF_GRAVEL);
      sig('graves', 30, 20, 44, 56, 3, { n: 60 });
      break;
    case 'garvey':
      sig('court', 38, 22, 26, -60, 6);
      sig('smokers', 22, 7, -24, 46, 4);
      sig('tank', 9, 9, 50, 40, 18);
      break;
    case 'tryon':
      {
        // No hall here. The ground floor of the keep does that job, with its door on the south side.
        const k = sig('keep', 31, 31, -15, -78, 36);
        if (k) c.hall = { x0: k.x, z0: k.z + 3, x1: k.x + 30, z1: k.z + 30 };
      }
      sig('cloister', 36, 36, -74, -36, 8);
      sig('cloister', 36, 36, 40, -36, 8);
      sig('range', 32, 12, -40, 52, 4);
      c.maxY = Math.max(c.maxY, YB + 42);
      break;
  }
  if (!c.spots.hq) c.spots.hq = { x: px + 18.5, z: pz - 12.5 };
  if (!c.spots.field) c.spots.field = { x: px - 20.5, z: pz + 22.5 };

  // The strings of bulbs across the avenues are not built on, but nothing should be built through them either: hold their poles and
  // the line between them clear before the yard and the tent look for ground.
  for (const q of c.parts) if (q.t === 'lights') reserve(q.x0 - 1, q.z0 - 1, q.x1 + 1, q.z1 + 1);

  // --- The mechanic's yard: tucked into a corner of the town ------------------------------------------
  // A fenced corner with a bench, tyres and drums, a cot under a tarp, and two bikes: one in pieces that the mechanic is always at, and
  // one going that is for sale. Laid out the same everywhere, turned so the fence runs along the outside wall and it opens onto the town.
  {
    const YW = 14, YD = 10;
    const corners = [[r.x0 + 11, r.z0 + 11, 0, 0], [r.x1 - 11 - YW, r.z0 + 11, 1, 0], [r.x0 + 11, r.z1 - 11 - YD, 0, 1], [r.x1 - 11 - YW, r.z1 - 11 - YD, 1, 1]];
    for (let i = corners.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [corners[i], corners[j]] = [corners[j], corners[i]]; }
    let at = null;
    for (const [tx, tz, fx, fz] of corners) {
      const s = placeNear(YW, YD, tx, tz, 1);
      if (s && Math.hypot(s.x - tx, s.z - tz) < 34) { at = { ...s, fx, fz }; break; }
    }
    if (!at) {
      const [tx, tz, fx, fz] = corners[0];
      const s = placeNear(YW, YD, tx, tz, 1);
      if (s) at = { ...s, fx, fz };
    }
    if (at) {
      const x0 = at.x, z0 = at.z, x1 = x0 + YW - 1, z1 = z0 + YD - 1, fx = at.fx, fz = at.fz;
      c.yardCorner = `${fx}${fz}`;
      // Local (u along x, v along z) to the world, with the fence sides (u = 0, v = 0) against the outside wall.
      const wx = (u) => (fx ? x1 + 1 - u : x0 + u), wz = (v) => (fz ? z1 + 1 - v : z0 + v);
      const cell = (u, v) => [Math.floor(wx(u + .5)), Math.floor(wz(v + .5))];
      add('mechyard', x0, z0, x1, z1, 5, { fx, fz });
      // It is open ground to walk about in (see OPEN); only the fence, the bench, the cot and the stacks get in anyone's way.
      const solidCell = (u, v) => { const [a, b] = cell(u, v); block(a, b, a, b); };
      for (let v = 0; v <= 5; v++) solidCell(0, v);
      for (let u = 0; u <= 11; u++) solidCell(u, 0);
      const solids = [[1, 1], [1, 2], [1, 3], [4, 1], [5, 1], [12, 1], [12, 2], [6, 4], [13, 5], [13, 8], [13, 9]];
      for (let u = 7; u <= 10; u++) solids.push([u, 1]);
      for (const [u, v] of solids) solidCell(u, v);
      const ang = (du, dv) => Math.atan2(fx ? -du : du, fz ? -dv : dv);
      const bikeYaw = Math.PI / 2;
      const yard = {
        x0, z0, x1, z1,
        // Stood a little askew, each its own way, not lined up like a showroom.
        bikes: [{ x: wx(8.5), z: wz(5.5), yaw: bikeYaw + .2 }, { x: wx(8.5), z: wz(8.5), yaw: bikeYaw - .26 }],
        // Down beside each one: facing the bike in pieces from the bench side, the other from between the two.
        work: [{ x: wx(8.6), z: wz(3.9), yaw: ang(0, 1) }, { x: wx(8.6), z: wz(6.9), yaw: ang(0, 1) }],
        // Where the feet go: a sleeper lies back from there, the way they face, so the head ends up on the pillow by the fence.
        bed: { x: wx(1.5), z: wz(3.95), yaw: ang(0, 1), kind: 'sleep' },
      };
      // The way round: bed to the near bike, out along the open side past the stands, and in to the far one. Never through a stand.
      yard.chain = [yard.bed, yard.work[0], { x: wx(11.6), z: yard.work[0].z }, { x: wx(11.6), z: yard.work[1].z }, yard.work[1]];
      c.mechYard = yard;
      // Where the curious stand and talk bikes with whoever is working: by the open side, looking in.
      const browse = [];
      for (const [u, v] of [[12.2, 5.6], [12.4, 7.4], [11.2, 9.2]]) {
        const p = { x: wx(u), z: wz(v), kind: 'browse', yaw: ang(-1, 0) };
        browse.push(p);
        c.pois.push(p);
      }
      c.vendors.push({ role: 'mechanic', x: yard.work[0].x, z: yard.work[0].z, yaw: yard.work[0].yaw, browse, yard });
      light(Math.floor(wx(7)), Math.floor(wz(5)), 10);
    }
  }

  // --- The doctor's tent: a field hospital in another corner ------------------------------------------
  // A long white tent with a red cross on the end, open at the front: a row of cots along the back with people laid up in them, a bench of
  // those waiting to be seen, shelves of whatever medicine there is, and the doctor's table by the way in. The doctor goes round them.
  {
    const CW2 = 16, CD = 12;
    // As near the middle of the town as there is clear ground, before the houses fill in round it: nothing that matters is moved.
    let at = null;
    const s0 = placeNear(CW2, CD, px - (CW2 >> 1), pz - (CD >> 1), 1);
    if (s0) {
      // The way in faces the square; the red cross end faces whichever way it is away from the middle.
      const tx = s0.x + CW2 / 2, tz = s0.z + CD / 2;
      at = { ...s0, fx: tx < px ? 1 : 0, fz: tz > pz ? 1 : 0 };
    }
    if (at) {
      const x0 = at.x, z0 = at.z, x1 = x0 + CW2 - 1, z1 = z0 + CD - 1, fx = at.fx, fz = at.fz;
      const wx = (u) => (fx ? x1 + 1 - u : x0 + u), wz = (v) => (fz ? z1 + 1 - v : z0 + v);
      const cell = (u, v) => [Math.floor(wx(u + .5)), Math.floor(wz(v + .5))];
      add('clinic', x0, z0, x1, z1, 6, { fx, fz });
      const solidCell = (u, v) => { const [a, b] = cell(u, v); block(a, b, a, b); };
      for (let v = 0; v < CD; v++) { solidCell(0, v); solidCell(15, v); }
      for (let u = 0; u < CW2; u++) { if (u < 13 || u > 14) solidCell(u, 0); if (u < 4 || u > 11) solidCell(u, 11); }
      for (const u of [2, 4, 6, 8, 10, 12]) for (let v = 1; v <= 3; v++) solidCell(u, v);
      for (let v = 5; v <= 8; v++) solidCell(14, v);
      for (let v = 6; v <= 8; v++) solidCell(1, v);
      for (const [u, v] of [[11, 9], [12, 9], [1, 9], [1, 10], [5, 1]]) solidCell(u, v);
      const ang = (du, dv) => Math.atan2(fx ? -du : du, fz ? -dv : dv);
      // The cots run back to front, the pillow end against the back wall.
      // Feet at the foot of each cot, the head back on the pillow against the tent wall.
      const cots = [2, 4, 6, 8, 10, 12].map((u) => ({ x: wx(u + .5), z: wz(3.95), yaw: ang(0, 1), kind: 'sleep' }));
      const clinic = {
        x0, z0, x1, z1,
        // Who is laid up (some of the cots), and who sits waiting on the bench.
        lie: [cots[0], cots[1], cots[3], cots[5]],
        sit: [{ x: wx(13.9), z: wz(5.5), yaw: ang(-1, 0) }, { x: wx(13.9), z: wz(7.5), yaw: ang(-1, 0) }],
        // The doctor's rounds: the foot of each occupied cot, and the table.
        desk: { x: wx(11.5), z: wz(8.1), yaw: ang(0, 1) },
        stops: [2, 4, 8, 12].map((u) => ({ x: wx(u + .5), z: wz(4.4), yaw: ang(0, -1) })),
      };
      clinic.stops.push({ x: wx(12.6), z: wz(6.5), yaw: ang(1, 0) });
      c.clinic = clinic;
      const browse = [];
      for (const [u, v] of [[7.5, 10.1], [8.6, 10.2]]) {
        const p = { x: wx(u), z: wz(v), kind: 'browse', yaw: ang(0, -1) };
        browse.push(p);
        c.pois.push(p);
      }
      c.vendors.push({ role: 'medic', x: clinic.desk.x, z: clinic.desk.z, yaw: clinic.desk.yaw, browse, doctor: true, clinic });
      light(Math.floor(wx(8)), Math.floor(wz(6)), 13);
    }
  }
  // Nowhere for a tent: the doctor takes the first stall on the market, the way it used to be.
  if (!c.clinic) { const v = c.vendors.find((q) => q.role !== 'mechanic'); if (v) { v.role = 'medic'; v.doctor = true; } }

  // --- The town itself: plot after plot, with alleys just wide enough to push through -------------------
  const shackMats = def.shackMats || [M.PLANK, M.RUST, M.CONT_O, M.BRICK_B, M.WOOD_D];
  const tentCols = def.tentCols || [M.TENT_G, M.TENT_W, M.TENT_B, M.CANVAS];
  const mixEntries = Object.entries(def.mix);
  const mixTotal = mixEntries.reduce((a, [, v]) => a + v, 0);
  const pickModule = () => {
    let v = rng() * mixTotal;
    for (const [k, w] of mixEntries) { v -= w; if (v <= 0) return k; }
    return 'shack';
  };
  const bed = (x, z) => c.pois.push({ x, z, kind: 'sleep', yaw: 0 });
  const seat = (x, z, yaw) => c.pois.push({ x, z, kind: 'sit', yaw, seat: true });
  const placeModule = (kind, x, z, w, rowD) => {
      const x1 = x + w - 1, z1 = z + rowD - 1;
      const cx = (x + x1) >> 1, cz = (z + z1) >> 1;
      switch (kind) {
        case 'wreck': {
          // Where it stopped, with people making use of it: a burnt-out car, or a cab somebody lives next to.
          const car = [6, 0, 6, 1, 6][Math.floor(rng() * 5)], a = x + Math.floor(rng() * Math.max(1, w - 4));
          add('wreck', a, z, a + 3, z + 8, 5, { kind: car, dir: 0 });
          c.pois.push({ x: a + 5.5 > x1 ? a - 1 : a + 5.5, z: z + 4.5, kind: 'talk', yaw: a + 5.5 > x1 ? Math.PI / 2 : -Math.PI / 2 });
          reserve(x, z, x1, z1);
          break;
        }
        case 'tenement': {
          // An old walk-up someone kept standing. Its door is on the alley to the south or the north, whichever it happened to have.
          const face = rng() < .7 ? 'S' : 'N', floors = rng() < .45 ? 2 : 3, pal = Math.floor(rng() * ROW_STYLES.length), seed = x * 31 + z * 7;
          const beds = w >= 10 ? [2, 4] : [2];
          add('rowhouse', x, z, x1, z1, floors * 5, { face, floors, pal, door: 1 + (seed % Math.max(1, w - 6)), sd: 1, seed, lit: seed % 5 < 3, mat: ROW_STYLES[pal].wall, roof: M.ROOF_TAR, far: ROW_STYLES[pal].wall });
          c.maxY = Math.max(c.maxY, YB + floors * 5 + 11);
          const at = (u, back) => (face === 'S' ? [x + u, z + back] : [x1 + 1 - u, z1 + 1 - back]);
          for (const b of beds) { const [a, d] = at(b, 5.6); c.pois.push({ x: a, z: d, kind: 'sleep', yaw: face === 'S' ? 0 : Math.PI }); }
          const [sx, sz] = at(1 + (seed % Math.max(1, w - 6)) + 1, rowD + 1.2);
          c.pois.push({ x: sx, z: sz, kind: 'stand', yaw: face === 'S' ? 0 : Math.PI });
          light(Math.floor(sx), Math.floor(sz), 6);
          break;
        }
        case 'shack': {
          const two = rng() < .22;
          add('shack', x, z, x1, z1, two ? 8 : 4 + Math.floor(rng() * 2), { mat: rng.pick(shackMats), roof: rng() < .5 ? M.RUST : M.ROOF_TAR, two, lit: rng() < .55, seed: x * 31 + z });
          // Beds along the back wall with their feet to the door.
          for (const b of [cx - 2, cx + 2]) if (b > x && b + 1 < x1) bed(b + 1, z + 5.6);
          c.pois.push({ x: cx + .5, z: z1 + 2.2, kind: 'stand', yaw: 0 });
          light(cx, z1 + 1, 6);
          break;
        }
        case 'tent': {
          if (w >= 11) {
            // Longhouse: one big canvas over a row of bedrolls.
            add('bunk', x, z, x1, z + 8, 5, { col: rng.pick(tentCols), cross: def.key === 'morning' });
            for (let b = x + 2; b < x1 - 1; b += 3) bed(b + 1, z + 5.6);
            light(cx, z + 8, 7);
            reserve(x, z, x1, z1);
            break;
          }
          const n = 1 + Math.floor((w - 7) / 7);
          for (let k = 0; k < Math.max(1, n); k++) {
            const tx = x + k * 7;
            if (tx + 6 > x1) break;
            add('tent', tx, z, tx + 6, z + 6, 3, { col: rng.pick(tentCols), cross: def.key === 'morning' });
            bed(tx + 4, z + 5.6);
          }
          reserve(x, z, x1, z1);
          break;
        }
        case 'shelter': {
          add('shelter', x, z, x1, z + 7, 4, { col: rng.pick(tentCols), seed: x + z });
          for (let b = x + 2; b < x1 - 1; b += 3) bed(b + 1, z + 5.6);
          reserve(x, z, x1, z1);
          break;
        }
        case 'fire': {
          add('firepit', cx - 4, cz - 4, cx + 4, cz + 4, 2);
          c.fires.push({ x: cx, z: cz });
          light(cx, cz, 19, FIRE);
          for (const [dx, dz, yaw] of [[-3, 0, Math.PI / 2], [3, 0, -Math.PI / 2], [0, -3, 0], [0, 3, Math.PI]]) {
            for (const k of [-1, 1]) seat(cx + dx + (dx ? 0 : k) + .5, cz + dz + (dz ? 0 : k) + .5, yaw);
          }
          reserve(x, z, x1, z1);
          break;
        }
        case 'table': {
          const tw = Math.min(w, 9);
          add('table', x, z, x + tw - 1, z + 4, 4, { lamp: rng() < .7 });
          light(x + (tw >> 1), z + 2, 9);
          for (let k = 1; k < tw - 1; k += 2) { seat(x + k + .5, z + .5, 0); seat(x + k + .5, z + 4.5, Math.PI); }
          reserve(x, z, x1, z1);
          break;
        }
        case 'kitchen': {
          add('kitchen', x, z, x1, z1, 5);
          light(cx, cz, 13, FIRE);
          c.fires.push({ x: cx, z: z + 2, small: true });
          c.pois.push({ x: x + 2.5, z: z + 4.5, kind: 'work', yaw: Math.PI }, { x: x1 - 2, z: z + 4.5, kind: 'work', yaw: Math.PI });
          for (let k = 0; k < 4; k++) c.pois.push({ x: x + 2 + k * 2, z: z1 + 1.5, kind: 'shop', yaw: Math.PI });
          break;
        }
        case 'workshop': {
          add('workshop', x, z, x1, z + 7, 5, { seed: x + z });
          light(cx, z + 4, 8);
          c.pois.push({ x: x + 2.5, z: z + 3.5, kind: 'work', yaw: Math.PI }, { x: x1 - 2, z: z + 3.5, kind: 'work', yaw: Math.PI });
          reserve(x, z, x1, z1);
          break;
        }
        case 'garden': {
          add('garden', x, z, x1, z1, 2, { kind: rng() < .5 ? 'tomato' : 'mixed' });
          c.pois.push({ x: x + 2, z: cz + .5, kind: 'farm', yaw: 0 }, { x: x1 - 1, z: cz + .5, kind: 'farm', yaw: Math.PI });
          break;
        }
        case 'laundry': {
          add('laundry', x, z, x1, z + 3, 5, { seed: x * 3 + z });
          c.pois.push({ x: cx + .5, z: z + 5.5, kind: 'work', yaw: Math.PI });
          reserve(x, z, x1, z1);
          break;
        }
        case 'well': {
          add('well', cx - 2, cz - 2, cx + 2, cz + 2, 4);
          c.pois.push({ x: cx - 3.5, z: cz + .5, kind: 'talk', yaw: Math.PI / 2 }, { x: cx + 4, z: cz + .5, kind: 'talk', yaw: -Math.PI / 2 }, { x: cx + .5, z: cz + 4, kind: 'talk', yaw: Math.PI });
          reserve(x, z, x1, z1);
          break;
        }
        case 'school': {
          add('school', x, z, x1, z1, 5);
          for (let row = 3; row < rowD - 1; row += 2) for (let k = 1; k < w - 1; k += 2) c.pois.push({ x: x + k + .5, z: z + row + .5, kind: 'class', yaw: Math.PI, seat: true });
          c.pois.push({ x: cx + .5, z: z + 1.5, kind: 'teach', yaw: 0 });
          break;
        }
      }
  };

  for (let z = r.z0 + 11; z < r.z1 - 18; ) {
    const rowD = harlem ? 10 + Math.floor(rng() * 3) : 9 + Math.floor(rng() * 3);
    for (let x = r.x0 + 11; x < r.x1 - 14; ) {
      const w = 8 + Math.floor(rng() * 6);
      if (!isFree(x, z, x + w - 1, z + rowD - 1)) { x += 2; continue; }
      placeModule(pickModule(), x, z, w, rowD);
      x += w + 3;
    }
    z += rowD + 3;
  }

  // Nothing has driven through here in weeks. The old roads have gone the same colour as everything else.
  if (harlem) {
    for (let z = r.z0 + 2; z <= r.z1 - 2; z++) for (let x = r.x0 + 2; x <= r.x1 - 2; x++) {
      const i = z * WX + x;
      if (ground[i] === G.ROAD || ground[i] === G.WALK) ground[i] = G.CAMP;
    }
  }

  // The alarm post: out on the plaza where everyone can hear it. The first spot with nothing in the way and nobody's business on it.
  // Placed last, and with no dice, so it cannot move anything else in the camp.
  c.post = { x: px + .5, y: YB + 8.5, z: pz + .5 };
  for (const [dx, dz] of [[18, 13], [21, 7], [-20, 8], [18, -8], [-18, -8], [12, 17], [-22, 12], [22, -3], [-22, -3]]) {
    const x = px + dx, z = pz + dz;
    let clear = inR(x - 1, z - 1) && inR(x + 1, z + 1);
    for (let b = z - 1; clear && b <= z + 1; b++) for (let a = x - 1; a <= x + 1; a++) {
      if (solid[(a - r.x0) + (b - r.z0) * W] || ground[b * WX + a] === G.WATER) clear = false;
    }
    if (!clear || c.pois.some((p) => Math.abs(p.x - x - .5) < 3 && Math.abs(p.z - z - .5) < 3)) continue;
    add('alarm', x - 1, z - 1, x + 1, z + 1, 9);
    c.post = { x: x + .5, y: YB + 8.5, z: z + .5 };
    break;
  }

  // The town hall. Most camps built one along with everything else. Those that did not get one on whatever ground is left: last, and with
  // no dice, so it cannot move anything else in the camp.
  if (!c.hall && !c.clerk) hall(-30, 30, 22, 12, 6, M.BRICK_R, M.ROOF_TAR);
  // The clerk stands behind the table with the board at their back, facing the door.
  if (c.clerk) {
    // Already settled: the church.
  } else if (c.hall) {
    const cx = (c.hall.x0 + c.hall.x1) >> 1;
    c.clerk = { x: cx + .5, z: c.hall.z0 + 2.5, yaw: 0, doorX: cx + .5, doorZ: c.hall.z1 + 1.5 };
  } else {
    c.clerk = { x: c.spots.hq.x, z: c.spots.hq.z, yaw: 0, doorX: c.spots.hq.x, doorZ: c.spots.hq.z };
  }

  // The gate watch stands where it stands. Nobody else's errands take them onto the same spot.
  c.pois = c.pois.filter((p) => !c.sentries.some((s) => Math.hypot(s.x - p.x, s.z - p.z) < 3.5));
  // Where a survivor comes to: upstairs in the walk-up nearest the corner furthest from the Town Hall. Its beds point at the front windows, which look north over the roofs.
  if (harlem) {
    const off = (p) => Math.hypot(c.x1 - p.x1, c.z1 - p.z1);
    const home = c.parts.filter((p) => p.t === 'rowhouse' && p.face === 'N' && ROW_STYLES[p.pal].w === 2).sort((a, b) => off(a) - off(b))[0];
    if (home) {
      const S = ROW_STYLES[home.pal], hit = (u) => (u + (home.seed & 3)) % S.p < S.w;
      let u = 3;
      while (u < home.x1 - home.x0 - 1 && !(hit(u) && hit(u + 1))) u++;
      home.wake = true;
      c.wakeBed = { x: home.x1 - 1, y: YB + 5, z: home.z1 - 4.6, feet: -1, kind: 'sleep', yaw: Math.PI, standX: home.x1 - u - .1, standZ: home.z0 + 3.6, lookYaw: .1, lookPitch: .03 };   // a step back from the window
    }
  }

  // Walkable grid for the people who live here: 2-voxel cells, 1 means blocked.
  const NW = Math.ceil(W / 2), ND = Math.ceil(D / 2);
  const nav = new Uint8Array(NW * ND);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const wx = r.x0 + x, wz = r.z0 + z;
    if (solid[x + z * W] || ground[wz * WX + wx] === G.WATER) nav[(x >> 1) + (z >> 1) * NW] = 1;
  }
  c.nav = nav; c.navW = NW; c.navD = ND;
  return c;
}

// --- Voxels ---------------------------------------------------------------------------------------------------
function wallVoxel(style, t, h, row, H) {
  const seg = (n) => Math.floor(t / n);
  switch (style) {
    case 'cabs': {
      const layer = Math.floor(h / 3), s = h2(seg(10) + layer * 7, 5);
      const body = s % 5 === 0 ? M.BUS : s % 5 === 1 ? M.CAR_R : s % 5 === 2 ? M.CAR_S : M.TAXI;
      if (h % 3 === 2) return row === 0 && t % 10 > 2 && t % 10 < 7 ? M.CAR_GLASS : body;
      if (h % 3 === 0) return t % 10 === 0 || t % 10 === 9 ? M.TIRE : M.STEEL_D;
      return body;
    }
    case 'containers': {
      const layer = Math.floor(h / 3), s = h2(seg(14) + layer * 31, 3);
      const col = [M.CONT_R, M.CONT_B, M.CONT_O, M.CONT_G, M.RUST][s % 5];
      return t % 14 === 0 ? M.RUST : col;
    }
    case 'palisade':
      return t % 3 === 2 ? M.WOOD_D : M.LOG;
    case 'hesco':
      if (h < 3) return M.JERSEY;
      return (Math.floor(t / 4) + Math.floor(h / 2)) % 2 ? M.SANDBAG : M.CONT_G;
    case 'sheet':
      if (h === 0 || h === H - 1 || t % 16 === 0) return M.WOOD_D;
      return t % 4 < 2 ? M.STEEL : M.ALUM;
    case 'scrap': {
      const s = h2(seg(4), Math.floor(h / 2));
      return [M.CONT_R, M.RUST, M.CONT_G, M.PLANK, M.RUST, M.CONT_O, M.BRICK_B, M.PAINT_K][s % 8];
    }
    case 'white':
      if (h === 3 || h === 4) return t % 22 < 5 ? M.AWN_R : M.CAR_W;
      return h < 3 ? M.JERSEY : M.CAR_W;
    case 'brick':
      if (h >= H - 2) return M.CONCRETE;
      return t % 30 < 11 && h > 1 ? (h === 4 ? M.CAR_GLASS : M.TAXI) : M.BRICK_R;
    case 'stone':
      return h2(seg(3), Math.floor(h / 2)) % 4 === 0 ? M.SCHIST : M.GRANITE;
  }
  return M.CONCRETE;
}

// Every glowing block in the camp that no hand-placed light already covers gets a light of its own. The blocks are found by stamping the
// whole camp once and noting where they went, so nothing that glows can be missed. One light per light-map cell is plenty.
const GLOW = new Map([
  [M.LAMP, { r: 14, k: 0, i: .7 }], [M.FIRE, { r: 14, k: 1, i: .7 }], [M.WIN_LIT, { r: 10, k: 0, i: .55 }],
  [M.NEON_R, { r: 9, k: 3, i: .55 }], [M.NEON_P, { r: 9, k: 3, i: .55 }], [M.NEON_C, { r: 9, k: 2, i: .55 }], [M.NEON_Y, { r: 9, k: 1, i: .55 }], [M.NEON_G, { r: 9, k: 2, i: .55 }], [M.NEON_W, { r: 9, k: 2, i: .55 }],
]);
export function glowLights(c, ground) {
  const cells = new Map();
  const note = (x, z, id) => {
    const g = GLOW.get(id);
    if (!g) return;
    const key = (x >> 2) + (z >> 2) * 4096, old = cells.get(key);
    if (!old || g.r > old.r) cells.set(key, { x: x + .5, z: z + .5, r: g.r, k: g.k, i: g.i });
  };
  stampCamp(c, {
    ox: c.x0 - 16, oy: 0, oz: c.z0 - 16, CS: 1 << 14, ground, car: () => {}, letterAt: () => false,
    put: (x, y, z, id) => note(x, z, id),
    box: (x0, y0, z0, x1, y1, z1, id) => { if (GLOW.has(id)) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) note(x, z, id); },
  });
  return [...cells.values()].filter((g) => !c.lights.some((l) => Math.hypot(l.x - g.x, l.z - g.z) < l.r * .45));
}

// A flagpole, block by block, from the foot up: a concrete footing, the pole, and the flag in the yard's two colours.
export function flagCells(p) {
  const out = [], pole = p.x0, z = p.z0, h = p.h;
  for (let b = z - 1; b <= z + 1; b++) for (let a = pole - 1; a <= pole + 1; a++) out.push([a, YB, b, M.CONCRETE]);
  for (let y = YB + 1; y <= YB + h; y++) out.push([pole, y, z, M.ALUM]);
  for (let y = YB + h - 6; y <= YB + h - 1; y++) for (let k = 1; k <= 9; k++) { const col = y >= YB + h - 3 ? p.c2 : p.c1; out.push([pole + k, y, z, CLOTH_OF[col] || col]); }
  return out;
}

// The alarm post, block by block: a hazard-striped pole on a concrete foot with a red beacon on top. Nothing else. The bottom comes first.
export function alarmPostCells(x0, z0, x1, z1) {
  const out = [], x = (x0 + x1) >> 1, z = (z0 + z1) >> 1;
  for (let b = z0; b <= z1; b++) for (let a = x0; a <= x1; a++) out.push([a, YB, b, M.CONCRETE]);
  // Galvanised up top, so the beacon has something to light: black iron just swallowed it.
  for (let k = 1; k <= 7; k++) out.push([x, YB + k, z, k <= 4 ? (k % 2 ? M.PAINT_Y : M.PAINT_K) : M.STEEL]);
  out.push([x, YB + 8, z, M.NEON_R], [x, YB + 9, z, M.IRON]);
  return out;
}

export function stampCamp(c, ctx) {
  const { box, put, ox, oy, oz, CS, ground, car, letterAt } = ctx;
  const { x0, x1, z0, z1, H, hc, wall } = c;
  const bitmap = E[c.emblem] || E.star;

  const side = (fixed, inward, horiz, sideKey) => {
    const a0 = horiz ? x0 : z0, a1 = horiz ? x1 : z1;
    const lo = Math.max(a0, (horiz ? ox : oz) - 1), hi = Math.min(a1, (horiz ? ox : oz) + CS);
    const gates = c.gates.filter((g) => g.side === sideKey);
    const P = (t, y, row, id) => (horiz ? put(t, y, fixed + inward * row, id) : put(fixed + inward * row, y, t, id));
    const baseRow = (t, row) => { const wx = horiz ? t : fixed + inward * row, wz = horiz ? fixed + inward * row : t; return ground[wz * WX + wx] === G.WATER ? 3 : G0; };
    for (let t = lo; t <= hi; t++) {
      const gate = gates.find((g) => t >= g.tc - 5 && t <= g.tc + 5);
      for (let row = 0; row < 2; row++) {
        const by = baseRow(t, row);
        for (let y = by; y < YB + H; y++) {
          if (y < oy || y >= oy + CS) continue;
          const h = y - YB;
          if (gate && y >= YB && h <= hc - 2) { P(t, y, row, c.door); continue; }
          if (y < YB) { P(t, y, row, M.CONCRETE_D); continue; }
          // The top band is set a block out (see below), so on the inside it gives way to the walkway: boards at its foot, open above.
          if (row === 1 && h >= H - 2) { if (h === H - 2) P(t, y, row, M.PLANK); continue; }
          P(t, y, row, wallVoxel(wall, t, h, row, H));
        }
      }
      // The top of the wall stands out a block past the face below it, all the way along and over the gates: a coping two blocks wide,
      // set a block further out than the wall it sits on, which you can see from the road.
      for (let h = H - 2; h < H; h++) if (YB + h >= oy && YB + h < oy + CS) P(t, YB + h, -1, wallVoxel(wall, t, h, 0, H));
      for (let row = 2; row <= 4; row++) P(t, YB + hc - 1, row, M.PLANK);
      if (t % 8 === 0) for (let y = YB; y < YB + hc - 1; y++) P(t, y, 4, M.WOOD_D);
      const clearOfGate = !c.gates.some((g) => g.side === sideKey && Math.abs(t - g.tc) < 9);
      if (clearOfGate && t > a0 + 7 && t < a1 - 7 && t % 3 === 0 && ground[(horiz ? fixed - inward * 3 : t) * WX + (horiz ? t : fixed - inward * 3)] !== G.WATER) {
        for (let y = YB; y < YB + 3; y++) P(t, y, -3, M.LOG);
        P(t, YB + 3, -4, M.LOG);
      }
      // Faction banners hang off the outside of the wall, large enough to read from down the street.
      if (clearOfGate && t > a0 + 12 && t < a1 - 12) {
        const u = ((t % 56) + 56) % 56;
        if (u < 9) {
          const top = YB + H - 1;
          for (let k = 0; k < 8; k++) {
            const col = u < 1 || u > 7 || k === 0 ? c.flag[1] : (bitmap[k - 1][u - 1] === '#' ? c.flag[1] : c.flag[0]);
            P(t, top - k, -2, col);
          }
        }
      }
    }
    // Stairs up to the walkway: one each way from every gate, and a pair in the middle of any wall without one.
    // A flight that would run into the corner is left out. There is always another.
    const flight = (start, dir) => {
      const end = start + dir * (hc - 1);
      if (Math.min(start, end) < a0 + 10 || Math.max(start, end) > a1 - 10) return;
      for (let k = 1; k <= hc; k++) {
        const t = start + dir * (hc - k);
        for (const row of [5, 6]) for (let y = YB; y < YB + k; y++) P(t, y, row, M.PLANK);
      }
    };
    for (const g of gates) {
      flight(g.tc + 8, 1); flight(g.tc - 8, -1);
      // Over the gate, the two flights meet: planks across from the top of one to the top of the other, so you can cross at the
      // height you came up at instead of stepping back onto the walkway. Nothing holds it up in the gateway itself.
      for (let t = g.tc - 7; t <= g.tc + 7; t++) for (const row of [5, 6]) P(t, YB + hc - 1, row, M.PLANK);
    }
    if (!gates.length) { const mid = (a0 + a1) >> 1; flight(mid + 3, 1); flight(mid - 3, -1); }
  };
  if (oz <= z0 + 8 && oz + CS >= z0 - 6) side(z0, 1, true, 'N');
  if (oz <= z1 + 6 && oz + CS >= z1 - 8) side(z1, -1, true, 'S');
  if (ox <= x0 + 8 && ox + CS >= x0 - 6) side(x0, 1, false, 'W');
  if (ox <= x1 + 6 && ox + CS >= x1 - 8) side(x1, -1, false, 'E');

  for (const p of c.parts) {
    if (p.x1 + 2 < ox || p.x0 - 2 >= ox + CS || p.z1 + 2 < oz || p.z0 - 2 >= oz + CS) continue;
    stampPart(p, c, box, put, car, letterAt);
  }
}

function stampPart(p, c, box, put, car, letterAt) {
  const { x0, x1, z0, z1, h } = p;
  const w = x1 - x0 + 1;
  const cxm = (x0 + x1) >> 1, czm = (z0 + z1) >> 1;
  switch (p.t) {
    case 'flood': {
      // A pole off the side of the tower and a bank of lamps looking out.
      const cx = x0 + 1, cz = z0 + 1;
      if (!p.roof) box(cx, YB + h - 3, cz, cx, YB + h - 1, cz, M.IRON);
      for (let k = -1; k <= 1; k++) {
        if (p.dx) { put(cx + p.dx, YB + h, cz + k, M.LAMP); put(cx, YB + h, cz + k, M.IRON); put(cx, YB + h + 1, cz + k, M.IRON); }
        else { put(cx + k, YB + h, cz + p.dz, M.LAMP); put(cx + k, YB + h, cz, M.IRON); put(cx + k, YB + h + 1, cz, M.IRON); }
      }
      break;
    }
    case 'tower': {
      const mat = { cabs: M.TAXI, containers: M.CONT_R, palisade: M.LOG, hesco: M.CONT_G, sheet: M.STEEL, scrap: M.RUST, white: M.CAR_W, brick: M.BRICK_R, stone: M.GRANITE }[p.mat] || M.STEEL;
      if (p.mat === 'stone' || p.mat === 'brick') {
        box(x0, YB, z0, x1, YB + h - 1, z1, mat);
      } else {
        for (const [a, b] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(a, YB, b, a, YB + h - 1, b, M.IRON);
        for (let y = 4; y < h - 1; y += 4) { box(x0, YB + y, z0, x1, YB + y, z0, M.IRON); box(x0, YB + y, z1, x1, YB + y, z1, M.IRON); box(x0, YB + y, z0, x0, YB + y, z1, M.IRON); box(x1, YB + y, z0, x1, YB + y, z1, M.IRON); }
      }
      box(x0 - 1, YB + h, z0 - 1, x1 + 1, YB + h, z1 + 1, M.PLANK);
      for (let a = x0 - 1; a <= x1 + 1; a++) { put(a, YB + h + 1, z0 - 1, mat); put(a, YB + h + 1, z1 + 1, mat); }
      for (let b = z0 - 1; b <= z1 + 1; b++) { put(x0 - 1, YB + h + 1, b, mat); put(x1 + 1, YB + h + 1, b, mat); }
      for (const [a, b] of [[x0 - 1, z0 - 1], [x1 + 1, z0 - 1], [x0 - 1, z1 + 1], [x1 + 1, z1 + 1]]) box(a, YB + h + 1, b, a, YB + h + 4, b, M.WOOD_D);
      box(x0 - 1, YB + h + 5, z0 - 1, x1 + 1, YB + h + 5, z1 + 1, p.big ? M.RUST : M.CANVAS);
      // The lamp hangs up against the roof, well over anyone's head.
      put(cxm, YB + h + 4, czm, M.LAMP);
      break;
    }
    case 'bonfire': {
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * 6.283;
        put(Math.round(cxm + Math.cos(a) * 3.4), YB, Math.round(czm + Math.sin(a) * 3.4), M.STONE);
      }
      box(cxm - 1, YB, czm - 1, cxm + 1, YB, czm + 1, M.FIRE);
      put(cxm, YB + 1, czm, M.FIRE);
      for (const [a, b] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) put(cxm + a, YB, czm + b, M.LOG);
      break;
    }
    case 'bench':
      box(x0, YB, z0, x1, YB, z1, M.LOG);
      break;
    case 'mechyard': {
      // In the yard's own terms: u along x and v along z from the corner against the wall, mirrored to suit whichever corner it is in.
      const U = (u) => (p.fx ? x1 - u : x0 + u), V = (v) => (p.fz ? z1 - v : z0 + v);
      const T = (u, y, v, id) => put(U(u), YB + y, V(v), id);
      const W2 = x1 - x0 + 1, D2 = z1 - z0 + 1;
      // The ground is the town's own, except a pad of concrete where the bikes stand, black with oil under each.
      for (let u = 5; u <= 12; u++) for (let v = 3; v <= 9; v++) T(u, -1, v, (v === 5 || v === 8) && u >= 7 && u <= 9 ? M.CONCRETE_D : M.CONCRETE);
      // A plank fence, waist high, on posts: behind the cot and the bench only, so the yard is open to walk into from three sides.
      for (let v = 0; v <= 5; v++) { const post = v % 3 === 0; T(0, 0, v, post ? M.WOOD_D : M.PLANK); T(0, 1, v, post ? M.WOOD_D : M.PLANK); }
      for (let u = 1; u <= 11; u++) { const post = u % 3 === 0; T(u, 0, 0, post ? M.WOOD_D : M.PLANK); T(u, 1, 0, post ? M.WOOD_D : M.PLANK); }
      // A small lean-to over the cot and the drums in the corner, on the fence posts and one more; everything else is open sky.
      for (const [u, v] of [[0, 0], [0, 3], [3, 0], [6, 0]]) for (let y = 2; y < 4; y++) T(u, y, v, M.WOOD_D);
      for (let y = 0; y < 4; y++) T(6, y, 4, M.WOOD_D);
      for (let u = 0; u <= 6; u++) for (let v = 0; v <= 4; v++) T(u, 4, v, u === 4 ? M.ROOF_TIN : (u === 2 && v >= 1 && v <= 2) ? M.PLANK : M.RUST);
      // The yellow sign on two posts over the bench, a black spanner painted across it.
      for (const u of [7, 10]) T(u, 2, 0, M.WOOD_D);
      for (let u = 7; u <= 10; u++) T(u, 3, 0, u === 8 || u === 9 ? M.PAINT_K : M.PAINT_Y);
      // The bench: a plank top on iron legs, crates of parts under it, a vice at one end, a red toolbox, and a cylinder head being worked on.
      T(7, 0, 1, M.IRON); T(10, 0, 1, M.IRON);
      T(8, 0, 1, M.CRATE_OPEN);
      for (let u = 7; u <= 10; u++) T(u, 1, 1, M.PLANK);
      T(7, 2, 1, M.STEEL_D); T(9, 2, 1, M.CAR_R); T(10, 2, 1, M.ALUM);
      // Oil drums, blue and red, under the lean-to, and tyres stacked by the fence.
      T(4, 0, 1, M.CAR_B); T(4, 1, 1, M.CAR_B); T(5, 0, 1, M.CAR_R);
      for (let y = 0; y < 3; y++) T(12, y, 1, M.TIRE);
      T(12, 0, 2, M.TIRE);
      // What piles up by the open corner: a few crates.
      T(13, 0, 9, M.CRATE); T(13, 1, 9, M.CRATE); T(13, 0, 8, M.CRATE_OPEN);
      // The cot, made up, in the corner against the fence.
      T(1, 0, 1, M.PILLOW); T(1, 0, 2, M.MATTRESS); T(1, 0, 3, M.BLANKET_G);
      // A lamp on a pole by the bikes, for working late.
      for (let y = 0; y < 3; y++) T(13, y, 5, M.WOOD_D);
      T(13, 3, 5, M.LAMP);
      break;
    }
    case 'clinic': {
      const U = (u) => (p.fx ? x1 - u : x0 + u), V = (v) => (p.fz ? z1 - v : z0 + v);
      const T = (u, y, v, id) => put(U(u), YB + y, V(v), id);
      const W2 = x1 - x0 + 1, D2 = z1 - z0 + 1;
      // The tent's height along it: low at the back and front, up to a ridge down the middle.
      const roofY = (v) => 4 + (v >= 2 && v <= 9 ? 1 : 0) + (v >= 4 && v <= 7 ? 1 : 0);
      // Boards on the ground inside, to keep the mud off.
      for (let u = 0; u < W2; u++) for (let v = 0; v < D2; v++) T(u, -1, v, M.PLANK);
      // Weathered canvas, patched where it tore, mud splashed up the bottom.
            const cv = (u, y, v) => { const k = ((u * 73856093) ^ (y * 19349663) ^ (v * 83492791) ^ x0) >>> 0; return y === 0 && k % 3 === 0 ? M.TENT_W_DIRTY : k % 9 === 0 ? M.TENT_W_DIRTY : M.TENT_W; };
      // The canvas: the two ends up to the roof, the back wall, and the front, its way in wide open with the flaps tied back.
      for (let v = 0; v < D2; v++) for (let y = 0; y < roofY(v); y++) { T(0, y, v, cv(0, y, v)); T(15, y, v, cv(15, y, v)); }
      for (let u = 1; u < W2 - 1; u++) for (let y = 0; y < 4; y++) { if (!(u >= 13 && u <= 14 && y < 3)) T(u, y, 0, cv(u, y, 0)); if (u < 4 || u > 11 || y === 3) T(u, y, 11, cv(u, y, 11)); }
      for (let y = 0; y < 3; y++) { T(3, y, 11, M.TENT_W_DIRTY); T(12, y, 11, M.TENT_W_DIRTY); }
      for (let u = 0; u < W2; u++) for (let v = 0; v < D2; v++) T(u, roofY(v), v, cv(u, 9, v));
      // A red cross along the ridge, for anyone looking down from the wall.
      for (let u = 6; u <= 9; u++) for (const v of [5, 6]) T(u, 6, v, M.AWN_R);
      for (const u of [7, 8]) for (const v of [4, 7]) T(u, 6, v, M.AWN_R);
      // A red cross on the end facing the town, and another over the way in.
      for (let v = 4; v <= 7; v++) T(15, 3, v, M.AWN_R);
      for (const v of [5, 6]) { T(15, 2, v, M.AWN_R); T(15, 4, v, M.AWN_R); }
      T(7, 3, 11, M.AWN_R); T(8, 3, 11, M.AWN_R);
      // The cots, made up, along the back: pillow, mattress, blanket.
      const blankets = [M.BLANKET_G, M.BLANKET_B, M.BLANKET_C, M.BLANKET_G, M.BLANKET_R, M.BLANKET_B];
      [2, 4, 6, 8, 10, 12].forEach((u, i) => { T(u, 0, 1, M.PILLOW); T(u, 0, 2, M.MATTRESS); T(u, 0, 3, blankets[i]); });
      // A drip stand by one bed.
      T(5, 0, 1, M.IRON); T(5, 1, 1, M.IRON); T(5, 2, 1, M.ALUM);
      // The bench by the far wall, for those waiting.
      for (let v = 5; v <= 8; v++) T(14, 0, v, M.PLANK);
      // Shelves against the back end, white boxes and bottles on them, and medical crates by the door.
      for (let v = 6; v <= 8; v++) { T(1, 0, v, M.SHELF); T(1, 1, v, v % 2 ? M.TENT_W : M.ALUM); T(1, 2, v, M.SHELF); }
      T(1, 0, 9, M.CRATE_MED); T(1, 0, 10, M.CRATE_MED); T(1, 1, 9, M.CRATE_MED);
      // The doctor's table: a plank top on trestles, with a lamp and a white case on it.
      T(11, 0, 9, M.WOOD_D); T(12, 0, 9, M.WOOD_D); T(11, 1, 9, M.PLANK); T(12, 1, 9, M.PLANK); T(12, 2, 9, M.TENT_W);
      // Lamps hung from the ridge.
      T(4, 5, 5, M.LAMP); T(11, 5, 6, M.LAMP);
      break;
    }
    case 'flag': {
      for (const [a, y, b, id] of flagCells(p)) put(a, y, b, id);
      break;
    }
    case 'alarm': {
      for (const [a, y, b, id] of alarmPostCells(x0, z0, x1, z1)) put(a, y, b, id);
      break;
    }
    case 'firepit': {
      for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(cxm + a, YB, czm + b, M.STONE);
      put(cxm, YB, czm, M.FIRE);
      // Four logs to sit on, set back from the heat.
      box(cxm - 3, YB, czm - 1, cxm - 3, YB, czm + 1, M.LOG);
      box(cxm + 3, YB, czm - 1, cxm + 3, YB, czm + 1, M.LOG);
      box(cxm - 1, YB, czm - 3, cxm + 1, YB, czm - 3, M.LOG);
      box(cxm - 1, YB, czm + 3, cxm + 1, YB, czm + 3, M.LOG);
      break;
    }
    case 'table': {
      // A real table: two trestles, a plank top, a bench down each side.
      box(x0 + 1, YB, z0 + 2, x0 + 1, YB, z0 + 2, M.WOOD_D);
      box(x1 - 1, YB, z0 + 2, x1 - 1, YB, z0 + 2, M.WOOD_D);
      box(x0, YB + 1, z0 + 1, x1, YB + 1, z0 + 3, M.WOOD);
      box(x0, YB, z0, x1, YB, z0, M.WOOD_D);
      box(x0, YB, z0 + 4, x1, YB, z0 + 4, M.WOOD_D);
      if (p.lamp) { box(x1 + 1, YB, z0 + 2, x1 + 1, YB + 3, z0 + 2, M.IRON); put(x1, YB + 4, z0 + 2, M.LAMP); put(x1 + 1, YB + 4, z0 + 2, M.IRON); }
      break;
    }
    case 'stall': {
      // Built facing the street. l runs along the front, d runs back from it.
      const face = p.face || 'S';
      const hz = face === 'E' || face === 'W';
      const lenL = hz ? z1 - z0 : x1 - x0, depth = hz ? x1 - x0 : z1 - z0;
      const T = (l, d, y, id) => {
        const lx = hz ? (face === 'E' ? x1 - d : x0 + d) : x0 + l;
        const lz = hz ? z0 + l : (face === 'S' ? z1 - d : z0 + d);
        put(lx, y, lz, id);
      };
      const style = p.style || 'awning', role = p.role || 'general', sd = h2(x0, z0), sign = p.sign;
      const cont = [M.CONT_R, M.CONT_B, M.CONT_O, M.CONT_G, M.RUST][sd % 5], tarp = [M.TENT_B, M.TENT_G, M.CANVAS, M.TENT_W][sd % 4];
      const paint = [M.PAINT_C, M.PAINT_Y, M.AWN_R, M.AWN_G][sd % 4];
      const S = {
        awning: { wall: M.CANVAS, post: M.WOOD_D, a: sign, b: M.TENT_W, top: M.WOOD, trim: M.TENT_W },
        kiosk: { wall: [M.PLANK, M.WOOD, M.BARRICADE][sd % 3], post: M.WOOD_D, a: M.RUST, b: M.ROOF_TAR, top: M.WOOD_D, trim: M.WOOD_D },
        container: { wall: cont, post: cont, a: cont, b: cont, top: M.STEEL_D, trim: M.STEEL_D },
        tarp: { wall: M.WOOD, post: M.IRON, a: tarp, b: tarp, top: M.PLANK, trim: M.CANVAS },
        cart: { wall: paint, post: M.TENT_W, a: paint, b: M.TENT_W, top: M.ALUM, trim: M.TENT_W },
        yard: { wall: M.PLANK, post: M.LOG, a: M.RUST, b: M.RUST, top: M.PLANK, trim: M.LOG },
        clinic: { wall: M.TENT_W, post: M.ALUM, a: M.TENT_W, b: M.TENT_W, top: M.ALUM, trim: M.AWN_R },
        garage: { wall: M.ROOF_TIN, post: M.IRON, a: M.ROOF_TIN, b: M.RUST, top: M.STEEL_D, trim: M.PAINT_K },
      }[style];
      // A striped awning is all cloth, whatever colour its stripes are: a stripe in the stall's sign colour is the cloth of that colour,
      // or the canvas stripes either side of it would be held still by it and only the ends would move in the wind.
      const cl = (id) => CLOTH_OF[id] || id;
      const clothRoof = !!((FLAGS[S.a] | FLAGS[S.b]) & F_CLOTH), clothTrim = !!(FLAGS[S.trim] & F_CLOTH);
      const RA = clothRoof ? cl(S.a) : S.a, RB = clothRoof ? cl(S.b) : S.b, VS = clothTrim ? cl(sign) : sign;
      // Every one works the same way at the front, however it was built. A counter one block high, the seller right behind it,
      // and a valance hanging down over it: you can see straight in, and you can't climb up and stand on the goods.
      for (let l = 1; l < lenL; l++) {
        T(l, 0, YB, l % 3 === 1 ? (h2(l + x0, z0) % 2 ? M.CRATE_OPEN : sign) : S.top);
        T(l, 0, YB + 3, l % 2 ? S.trim : VS);
      }
      for (const l of [0, lenL]) {
        for (let y = YB; y < YB + 4; y++) T(l, 0, y, S.post);
        // Solid down the sides and across the back, so the only way to the goods is across the counter.
        for (let d = 1; d <= depth; d++) for (let y = YB; y < YB + 4; y++) T(l, d, y, y === YB + 3 && d === depth ? S.post : S.wall);
      }
      for (let l = 1; l < lenL; l++) for (let y = YB; y < YB + 4; y++) T(l, depth, y, S.wall);
      // The roof.
      const roofTo = depth;
      for (let l = 0; l <= lenL; l++) for (let d = 0; d <= roofTo; d++) T(l, d, YB + 4, l % 2 ? RA : RB);
      if (style === 'awning' || style === 'cart') {
        // Out over the street on a slope, so whoever is buying stands in the shade of it.
        for (let l = 0; l <= lenL; l++) { T(l, -1, YB + 4, l % 2 ? RA : RB); T(l, -2, YB + 3, l % 2 ? RA : RB); }
      } else if (style !== 'container') {
        // Every stall keeps its customers dry: something run out over the front, whatever it was made of. Patched, not matched.
        const over = { kiosk: [M.ROOF_TAR, M.RUST], tarp: [tarp, M.CANVAS], yard: [M.RUST, M.STEEL], clinic: [M.TENT_W, M.CANVAS], garage: [M.ROOF_TIN, M.RUST] }[style] || [S.a, S.b];
        for (let l = 0; l <= lenL; l++) { const q = h2(l + x0, z0 + 7) % 5 ? 0 : 1; T(l, -1, YB + 4, over[q]); T(l, -2, YB + 4, over[(l + q) % 2]); }
      } else if (style === 'kiosk') {
        // A proper pitched roof and a board across the front.
        for (let l = 0; l <= lenL; l++) {
          for (let d = 1; d < depth; d++) T(l, d, YB + 5, S.a);
          for (let d = 2; d < depth - 1; d++) T(l, d, YB + 6, S.b);
        }
        for (let l = 2; l <= lenL - 2; l++) T(l, 0, YB + 5, sign);
      } else if (style === 'container') {
        // The side of a shipping container, cut out and propped up as a shutter.
        for (let l = 0; l <= lenL; l++) { T(l, -1, YB + 4, cont); T(l, -2, YB + 4, cont); T(l, depth, YB + 3, cont); }
        for (const l of [0, lenL]) T(l, -1, YB + 3, M.IRON);
        for (let l = 0; l <= lenL; l += 2) T(l, depth, YB + 1, M.STEEL_D);
      } else if (style === 'tarp') {
        // Whatever they could tie down.
        for (const l of [0, lenL]) for (const d of [0, depth]) T(l, d, YB + 5, S.post);
        for (let d = 0; d <= depth; d++) if (d % 2) T(lenL >> 1, d, YB + 5, tarp);
      } else if (style === 'clinic') {
        // White canvas, a red cross on the roof where it can be seen from the wall, and somewhere to lie down.
        const mid = lenL >> 1, md = depth >> 1;
        for (let k = -1; k <= 1; k++) { T(mid + k, md, YB + 5, M.AWN_R); T(mid, md + k, YB + 5, M.AWN_R); }
        for (let k = -1; k <= 1; k++) { T(mid + k, depth, YB + 2, M.AWN_R); T(mid, depth, YB + 2 + k, M.AWN_R); }
        for (let l = 0; l <= lenL; l++) for (let d = 0; d <= depth; d++) T(l, d, G0, M.TILE);
        for (const l of [1, lenL - 1]) { T(l, 2, YB, M.PILLOW); T(l, 3, YB, M.MATTRESS); T(l, 4, YB, M.BLANKET_G); }
        T(2, 4, YB, M.IRON); T(2, 4, YB + 1, M.IRON); T(2, 4, YB + 2, M.ALUM);
        T(lenL - 2, 4, YB, M.SHELF); T(lenL - 2, 4, YB + 1, M.ALUM);
      }
      // What they are selling, along the back and in the corners.
      const back = depth - 1;
      if (style !== 'clinic') for (let l = 1; l < lenL; l++) {
        const q = h2(l + x0, z0 + 3);
        if (role === 'arms') {
          T(l, back, YB, q % 3 ? M.CONT_G : M.CRATE_OPEN);
          T(l, back, YB + 1, M.STEEL_D);
          T(l, back, YB + 2, l % 2 ? M.IRON : M.STEEL);
        } else if (role === 'junk') {
          const heap = [M.RUST, M.ALUM, M.TIRE, M.CAR_S, M.PAINT_C][q % 5];
          for (let y = 0; y <= q % 3; y++) T(l, back, YB + y, y ? heap : M.RUST);
        } else if (role === 'food') {
          T(l, back, YB, M.CRATE_OPEN);
          T(l, back, YB + 1, [M.TOMATO, M.CORN, M.BRICK_O, M.AWN_G][q % 4]);
        } else if (role === 'builder') {
          const stack = [M.PLANK, M.BLOCK_CONC, M.BRICK_R, M.BLOCK_WOOD][q % 4];
          for (let y = 0; y < 2 + q % 2; y++) T(l, back, YB + y, stack);
        } else if (role === 'mechanic') {
          // Tyres stacked up, oil drums, a bench with an engine half out on it, and the tools hung over it.
          const k = q % 4;
          if (k === 0) for (let y = 0; y < 3; y++) T(l, back, YB + y, M.TIRE);
          else if (k === 1) { T(l, back, YB, [M.AWN_R, M.PAINT_C, M.RUST][q % 3]); T(l, back, YB + 1, [M.AWN_R, M.PAINT_C, M.RUST][q % 3]); }
          else { T(l, back, YB, M.IRON); T(l, back, YB + 1, k === 2 ? M.ALUM : M.STEEL_D); T(l, back, YB + 2, M.PAINT_K); }
        } else if (role === 'medic') {
          T(l, back, YB, M.SHELF);
          T(l, back, YB + 1, l % 2 ? M.TENT_W : M.ALUM);
          T(l, back, YB + 2, M.SHELF);
        } else {
          T(l, back, YB, M.SHELF);
          T(l, back, YB + 1, [M.CRATE_OPEN, M.CONT_O, M.AWN_G, M.TENT_W, M.AWN_B][q % 5]);
          T(l, back, YB + 2, M.SHELF);
        }
      }
      if (style === 'cart') {
        // A stove going in the corner, the flue through the roof, and dinner hanging up where the customers can look at it.
        for (let y = YB + 5; y < YB + 8; y++) T(lenL - 1, back, y, M.IRON);
        T(lenL - 1, back, YB, M.IRON); T(lenL - 1, back, YB + 1, M.FIRE); T(lenL - 1, back, YB + 2, M.IRON); T(lenL - 1, back, YB + 3, M.IRON); T(lenL - 1, back, YB + 4, M.IRON);
        for (let l = 1; l < lenL - 1; l += 2) T(l, 2, YB + 3, [M.BRICK_R, M.CORN, M.BRICK_P][(l + sd) % 3]);
      }
      T(lenL >> 1, 2, YB + 3, M.LAMP);
      // A way in for whoever keeps the stall: a narrow doorway toward the back of one side, a step in front of the stock, out into the
      // gap next door.
      { const l = (sd >> 2) % 2 ? 0 : lenL; for (let y = YB; y < YB + 3; y++) T(l, back - 1, y, 0); }
      break;
    }
    case 'goods': {
      // Somebody's stock, stacked in a gap in the row.
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const q = h2(x + (p.seed | 0), z);
        if (q % 5 === 0) continue;
        const mat = [M.CRATE_OPEN, M.PLANK, M.CONT_O, M.TIRE, M.SANDBAG, M.RUST][q % 6];
        for (let y = 0; y <= q % 3; y++) put(x, YB + y, z, mat);
      }
      break;
    }
    case 'tent': {
      const col = p.col;
      for (let k = 0; k < 3; k++) {
        box(x0 + k, YB + k, z0, x0 + k, YB + k, z1, col);
        box(x1 - k, YB + k, z0, x1 - k, YB + k, z1, col);
      }
      box(x0 + 3, YB + 3, z0, x1 - 3, YB + 3, z1, col);
      box(x0 + 1, YB, z0, x1 - 1, YB + 2, z0, col);
      // A bed under the ridge, foot at the opening.
      layBed((row, col, y, id) => put(x0 + 3 + col, y, z0 + 1 + row, id), 6, 2, x0 * 7 + z0 * 13);
      if (p.cross) { box(x0 + 3, YB + 3, z0 + 2, x0 + 3, YB + 3, z0 + 4, M.AWN_R); }
      break;
    }
    case 'bunk': {
      for (const [a, b] of [[x0, z1], [x1, z1]]) box(a, YB, b, a, YB + 2, b, M.WOOD_D);
      for (let k = 0; k < 3; k++) { box(x0, YB + 3 + k, z0 + k, x1, YB + 3 + k, z0 + k, p.col); box(x0, YB + 3 + k, z1 - k, x1, YB + 3 + k, z1 - k, p.col); }
      box(x0, YB + 5, z0 + 3, x1, YB + 5, z1 - 3, p.col);
      box(x0, YB, z0, x1, YB + 2, z0, p.col);
      for (let a = x0; a <= x1; a += x1 - x0) box(a, YB, z0, a, YB + 2, z0 + 3, p.col);
      for (let b = x0 + 2; b < x1 - 1; b += 3) layBed((row, col, y, id) => put(b + col, y, z0 + 1 + row, id), 6, 2, b * 7 + z0 * 13);
      if (p.cross) box(cxm - 1, YB + 5, czm, cxm + 1, YB + 5, czm, M.AWN_R);
      break;
    }
    case 'shelter': {
      // Lean-to: a sloped sheet over a row of bedrolls, open along the front.
      // Low against the back wall, rising to a tall open front you can see into.
      for (let d = 0; d <= z1 - z0; d++) box(x0, YB + 2 + Math.floor(d / 3), z0 + d, x1, YB + 2 + Math.floor(d / 3), z0 + d, p.col);
      const frontTop = YB + 1 + Math.floor((z1 - z0) / 3);
      for (let a = x0; a <= x1; a += x1 - x0) { box(a, YB, z0, a, YB + 1, z0, M.WOOD_D); box(a, YB, z1, a, frontTop, z1, M.WOOD_D); }
      box(x0, YB, z0, x1, YB + 1, z0, M.PLANK);
      for (let b = x0 + 2; b < x1 - 1; b += 3) layBed((row, col, y, id) => put(b + col, y, z0 + 1 + row, id), 6, 2, b * 7 + z0 * 13);
      break;
    }
    case 'bigtent': {
      for (const [a, b] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(a, YB, b, a, YB + 3, b, M.WOOD_D);
      for (let k = 0; k < 4; k++) {
        box(x0 + k, YB + 3 + k, z0, x0 + k, YB + 3 + k, z1, p.col);
        box(x1 - k, YB + 3 + k, z0, x1 - k, YB + 3 + k, z1, p.col);
      }
      box(x0 + 4, YB + 7, z0, x1 - 4, YB + 7, z1, p.col);
      put(cxm, YB + 6, czm, M.LAMP);
      if (p.cross) { box(cxm - 3, YB + 7, czm, cxm + 3, YB + 7, czm, M.AWN_R); box(cxm, YB + 7, czm - 3, cxm, YB + 7, czm + 3, M.AWN_R); for (let z = z0 + 3; z < z1 - 3; z += 4) { layBed((row, col, y, id) => put(x0 + 1 + row, y, z + col, id), 6, 2, z * 7 + x0); layBed((row, col, y, id) => put(x1 - 1 - row, y, z + col, id), 6, 2, z * 11 + x1); } }
      if (p.tables) for (let z = z0 + 3; z < z1 - 2; z += 5) box(x0 + 4, YB, z, x1 - 4, YB, z, M.WOOD);
      break;
    }
    case 'shack':
    case 'hall': {
      box(x0, YB, z0, x1, YB + h - 1, z1, p.mat);
      box(x0 + 1, YB, z0 + 1, x1 - 1, YB + h - 2, z1 - 1, 0);
      box(x0, YB + h, z0, x1, YB + h, z1, p.roof);
      const cx = (x0 + x1) >> 1;
      box(cx - 1, YB, z1, cx + 1, YB + 2, z1, 0);
      for (let a = x0 + 2; a < x1 - 1; a += 4) if (Math.abs(a - cx) > 2) { put(a, YB + 2, z1, p.lit ? M.WIN_LIT : M.GLASS_K); if (h > 6) put(a, YB + 6, z1, p.lit ? M.WIN_LIT : M.GLASS_K); }
      if (p.t === 'hall') {
        const lo = Math.max(x0 + 1, cx - 3), hi = Math.min(x1 - 1, cx + 3);
        box(lo, YB + 3, z1 + 1, hi, YB + 3, z1 + 3, M.CANVAS);
        box(lo, YB, z1 + 3, lo, YB + 2, z1 + 3, M.WOOD_D); box(hi, YB, z1 + 3, hi, YB + 2, z1 + 3, M.WOOD_D);
        box(x0 + 2, YB, z0 + 2, x0 + 2, YB + 1, z1 - 2, M.SHELF);
        box(cx - 3, YB, z0 + 3, cx + 3, YB, z0 + 4, M.WOOD);
        // The board behind the clerk, with the day's work pinned to it.
        box(cx - 5, YB + 1, z0 + 1, cx + 5, YB + 3, z0 + 1, M.PLANK);
        for (let a = cx - 4; a <= cx + 4; a += 2) put(a, YB + 2 + (a & 2 ? 1 : 0), z0 + 1, M.TENT_W);
        put(cx, YB + h - 2, (z0 + z1) >> 1, M.LAMP);
        put(x1 - 2, YB, z0 + 2, M.CRATE);
        // The camp's mark, above the door.
        const bm = E[p.emblem] || E.star;
        for (let k = 0; k < 7; k++) for (let a = 0; a < 7; a++) {
          if (YB + h + 7 - k < YB + 3) continue;
          put(cx - 3 + a, YB + h + 7 - k, z1, bm[k][a] === '#' ? p.c2 : p.c1);
        }
        box(cx - 4, YB + h + 1, z1, cx - 4, YB + h + 7, z1, M.WOOD_D);
        box(cx + 4, YB + h + 1, z1, cx + 4, YB + h + 7, z1, M.WOOD_D);
      } else {
        // Two sleeping spots, a lamp and a shelf: someone's whole life.
        const b1 = cx - 2, b2 = cx + 2;
        for (const b of [b1, b2]) if (b > x0 && b + 1 < x1) layBed((row, col, y, id) => put(b + col, y, z0 + 1 + row, id), 6, 2, b * 7 + z0 * 13);
        put(x1 - 1, YB, z0 + 1, M.WOOD);
        if (p.lit) put(x1 - 1, YB + 1, z0 + 1, M.LAMP);
        if (p.two) box(x0 + 1, YB + 4, z0 + 1, x1 - 1, YB + 4, z1 - 1, M.PLANK);
      }
      break;
    }
    case 'kitchen': {
      for (const [a, b] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(a, YB, b, a, YB + 3, b, M.WOOD_D);
      box(x0, YB + 4, z0, x1, YB + 4, z1, M.CANVAS);
      box(x0 + 1, YB, z0 + 1, x1 - 1, YB, z0 + 2, M.STONE);
      for (let a = x0 + 2; a < x1 - 1; a += 3) { put(a, YB + 1, z0 + 1, M.FIRE); put(a, YB + 1, z0 + 2, M.IRON); put(a, YB + 2, z0 + 2, M.ALUM); }
      box(x0 + 1, YB, z1 - 1, x1 - 1, YB, z1 - 1, M.WOOD);
      for (let a = x0 + 2; a < x1 - 1; a += 2) put(a, YB + 1, z1 - 1, M.ALUM);
      put(cxm, YB + 3, czm, M.LAMP);
      break;
    }
    case 'workshop': {
      for (const [a, b] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(a, YB, b, a, YB + 3, b, M.WOOD_D);
      box(x0, YB + 4, z0, x1, YB + 4, z1, M.RUST);
      box(x0, YB, z0, x1, YB + 3, z0, M.PLANK);
      box(x0 + 1, YB, z0 + 1, x1 - 1, YB, z0 + 1, M.WOOD);
      for (let a = x0 + 1; a < x1; a += 2) put(a, YB + 1, z0 + 1, h2(a, p.seed || 0) % 2 ? M.STEEL_D : M.CRATE_OPEN);
      put(cxm, YB + 3, z0 + 1, M.LAMP);
      break;
    }
    case 'garden': {
      box(x0, G0, z0, x1, G0, z1, M.SOIL);
      for (let z = z0 + 1; z < z1; z += 2) for (let x = x0 + 1; x < x1; x++) {
        const k = h2(x, z) % 100;
        put(x, YB, z, M.LEAF2);
        if (k < 60) put(x, YB + 1, z, k < 22 ? (p.kind === 'tomato' ? M.TOMATO : M.CORN) : M.LEAF);
      }
      for (let a = x0; a <= x1; a++) { put(a, YB, z0, M.WOOD_D); put(a, YB, z1, M.WOOD_D); }
      for (let b = z0; b <= z1; b++) { put(x0, YB, b, M.WOOD_D); put(x1, YB, b, M.WOOD_D); }
      break;
    }
    case 'laundry': {
      box(x0, YB, z0 + 1, x0, YB + 4, z0 + 1, M.WOOD_D); box(x1, YB, z0 + 1, x1, YB + 4, z0 + 1, M.WOOD_D);
      const cloth = [M.TENT_W, M.AWN_B, M.AWN_R, M.CANVAS, M.TENT_G];
      for (let a = x0 + 1; a < x1; a++) {
        put(a, YB + 4, z0 + 1, M.IRON);
        if (a % 2) { put(a, YB + 3, z0 + 1, cloth[(a + (p.seed || 0)) % 5]); if (a % 4 === 1) put(a, YB + 2, z0 + 1, cloth[(a + (p.seed || 0)) % 5]); }
      }
      put(x0 + 1, YB, z0 + 3, M.ALUM);
      break;
    }
    case 'well': {
      // A stone curb round a shaft sunk two blocks below the street, lined in the same stone all the way down to the water; a plank
      // roof over it on a post at every corner.
      box(x0, YB - 3, z0, x1, YB, z1, M.STONE);
      box(x0 + 1, YB - 2, z0 + 1, x1 - 1, YB, z1 - 1, 0);
      box(x0 + 1, YB - 2, z0 + 1, x1 - 1, YB - 2, z1 - 1, M.CAR_GLASS);
      for (const [a, b] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(a, YB, b, a, YB + 3, b, M.WOOD_D);
      box(x0, YB + 4, z0, x1, YB + 4, z1, M.PLANK);
      break;
    }
    case 'school': {
      for (const [a, b] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) box(a, YB, b, a, YB + 3, b, M.WOOD_D);
      box(x0, YB + 4, z0, x1, YB + 4, z1, M.TENT_B);
      box(x0 + 1, YB + 1, z0, x1 - 1, YB + 3, z0, M.CONT_G);
      for (let a = x0 + 2; a < x1 - 1; a += 3) put(a, YB + 2, z0, M.TENT_W);
      for (let z = z0 + 3; z < z1; z += 2) for (let x = x0 + 1; x < x1; x += 2) put(x, YB, z, M.WOOD);
      break;
    }
    case 'lights': {
      // Bulbs strung between two poles across a street.
      const hz = z1 === z0;
      const a0 = hz ? x0 : z0, a1 = hz ? x1 : z1;
      const pole = (t) => box(hz ? t : x0, YB, hz ? z0 : t, hz ? t : x0, YB + 6, hz ? z0 : t, M.IRON);
      pole(a0); pole(a1);
      // The bulbs are spaced out from the middle of the string, so they hang evenly between the poles and none sits up against one.
      const mid = (a0 + a1) >> 1;
      for (let t = a0; t <= a1; t++) {
        put(hz ? t : x0, YB + 7, hz ? z0 : t, M.IRON);
        if ((((t - mid) % 3) + 3) % 3 === 0 && t > a0 + 1 && t < a1 - 1) put(hz ? t : x0, YB + 6, hz ? z0 : t, M.LAMP);
      }
      break;
    }
    case 'crops': {
      box(x0, G0, z0, x1, G0, z1, M.SOIL);
      for (let z = z0; z <= z1; z += 2) for (let x = x0; x <= x1; x++) {
        const k = h2(x, z) % 100;
        const fruit = p.kind === 'tomato' ? M.TOMATO : p.kind === 'corn' ? M.CORN : (h2(x >> 3, z >> 3) % 2 ? M.TOMATO : M.CORN);
        put(x, YB, z, M.LEAF2);
        if (k < 70) put(x, YB + 1, z, k < 26 ? fruit : M.LEAF);
      }
      break;
    }
    case 'greenhouse': {
      box(x0, YB, z0, x1, YB + h - 1, z1, M.GLASS_C);
      box(x0 + 1, YB, z0 + 1, x1 - 1, YB + h - 2, z1 - 1, 0);
      box(x0, YB + h, z0, x1, YB + h, z1, M.GLASS_C);
      for (let a = x0; a <= x1; a += 6) { box(a, YB, z0, a, YB + h, z0, M.IRON); box(a, YB, z1, a, YB + h, z1, M.IRON); box(a, YB + h, z0, a, YB + h, z1, M.IRON); }
      box(cxm - 1, YB, z1, cxm + 1, YB + 2, z1, 0);
      box(x0 + 2, G0, z0 + 2, x1 - 2, G0, z1 - 3, M.SOIL);
      for (let z = z0 + 2; z <= z1 - 3; z += 3) for (let x = x0 + 2; x <= x1 - 2; x += 1) if (h2(x, z) % 3) put(x, YB, z, h2(z, x) % 4 ? M.LEAF : M.TOMATO);
      break;
    }
    case 'windmill': {
      for (let y = 0; y < h; y++) {
        const k = Math.round(2 * (1 - y / h));
        for (const [a, b] of [[-k, -k], [k, -k], [-k, k], [k, k]]) put(x0 + 2 + a, YB + y, z0 + 2 + b, M.IRON);
      }
      const hy = YB + h, cx = x0 + 2, cz = z0 + 1;
      put(cx, hy, cz, M.STEEL_D);
      for (let k = 1; k <= 9; k++) {
        put(cx + k, hy + k, cz, M.ALUM); put(cx - k, hy - k, cz, M.ALUM);
        put(cx + k, hy - k, cz, M.ALUM); put(cx - k, hy + k, cz, M.ALUM);
      }
      break;
    }
    case 'tank': {
      for (const [a, b] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) box(cxm + a, YB, czm + b, cxm + a, YB + h - 7, czm + b, M.IRON);
      for (let y = h - 6; y < h; y++) for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) if (a * a + b * b <= 17) put(cxm + a, YB + y, czm + b, M.TANK);
      for (let y = 0; y < 3; y++) { const q = 3 - y; for (let b = -q; b <= q; b++) for (let a = -q; a <= q; a++) put(cxm + a, YB + h + y, czm + b, M.RUST); }
      break;
    }
    case 'lions':
      for (const a of [x0, x1 - 3]) {
        box(a, YB, z0, a + 3, YB, z1, M.GRANITE);
        box(a + 1, YB + 1, z0, a + 2, YB + 2, z1 - 1, M.LIMESTONE);
        box(a + 1, YB + 2, z1 - 2, a + 2, YB + 3, z1, M.LIMESTONE);
      }
      break;
    case 'mural': {
      const seed = p.seed || 1;
      const cols = [M.AWN_R, M.AWN_B, M.PAINT_Y, M.PAINT_K, M.AWN_G, M.TENT_W];
      for (let a = x0; a <= x1; a++) for (let y = 0; y < h; y++) {
        const band = (Math.floor((a + y * .6) / 4) * 7 + Math.floor(y / 3) * 3 + seed) % cols.length;
        put(a, YB + y, z0, cols[Math.abs(band)]);
      }
      break;
    }
    case 'car':
      car(x0, z0, p.dir || 0, p.kind ?? 0, (x0 * 7 + z0) & 255, YB);
      break;
    case 'humvee':
      box(x0, YB, z0, x1, YB + 1, z1, M.CONT_G);
      put(x0, YB, z0 + 1, M.TIRE); put(x1, YB, z0 + 1, M.TIRE); put(x0, YB, z1 - 1, M.TIRE); put(x1, YB, z1 - 1, M.TIRE);
      box(x0, YB + 2, z0 + 2, x1, YB + 3, z1 - 2, M.CONT_G);
      box(x0 + 1, YB + 3, z0 + 3, x1 - 1, YB + 3, z0 + 3, M.CAR_GLASS);
      box(x0 + 2, YB + 4, z0 + 4, x0 + 2, YB + 5, z0 + 4, M.IRON);
      box(x0 + 2, YB + 5, z0 + 1, x0 + 2, YB + 5, z0 + 4, M.IRON);
      break;
    case 'range':
      for (let a = x0; a <= x1; a += 6) { box(a, YB, z0, a, YB + 3, z0, M.WOOD_D); box(a, YB + 1, z0, a, YB + 2, z0, M.TENT_W); put(a, YB + 2, z0, M.AWN_R); }
      box(x0, YB, z1, x1, YB, z1, M.SANDBAG);
      break;
    case 'graves': {
      const n = p.n || 12;
      const across = Math.max(1, Math.floor(w / 3));
      for (let k = 0; k < n; k++) {
        const a = x0 + 1 + (k % across) * 3, b = z0 + 1 + Math.floor(k / across) * 4;
        if (b + 2 > z1) break;
        box(a, G0, b, a, G0, b + 1, M.SOIL);
        box(a, YB, b, a, YB + 1, b, M.WOOD_D);
        put(a - 1, YB + 1, b, M.WOOD_D); put(a + 1, YB + 1, b, M.WOOD_D);
      }
      break;
    }
    case 'arch':
      box(x0, YB, z0, x0 + 6, YB + h - 1, z1, M.LIMESTONE);
      box(x1 - 6, YB, z0, x1, YB + h - 1, z1, M.LIMESTONE);
      box(x0, YB + 19, z0, x1, YB + h - 1, z1, M.LIMESTONE);
      box(x0 - 1, YB + h - 1, z0 - 1, x1 + 1, YB + h - 1, z1 + 1, M.CASTIRON);
      for (let a = x0 + 7; a < x1 - 6; a++) { const k = Math.abs(a - cxm); put(a, YB + 16 + Math.round(3 - k * k * .05 + .5), z0, M.LIMESTONE); put(a, YB + 16 + Math.round(3 - k * k * .05 + .5), z1, M.LIMESTONE); }
      break;
    case 'crane': {
      const tx = x0 + 3 + 12, tz = z0 + 4;
      for (const [a, b] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) box(tx + a, YB, tz + b, tx + a, YB + h, tz + b, M.TAXI);
      for (let y = 4; y < h; y += 5) { box(tx - 2, YB + y, tz - 2, tx + 2, YB + y, tz - 2, M.TAXI); box(tx - 2, YB + y, tz + 2, tx + 2, YB + y, tz + 2, M.TAXI); box(tx - 2, YB + y, tz - 2, tx - 2, YB + y, tz + 2, M.TAXI); box(tx + 2, YB + y, tz - 2, tx + 2, YB + y, tz + 2, M.TAXI); }
      box(tx - 2, YB + h, tz - 3, tx + 2, YB + h + 3, tz + 3, M.TAXI);
      box(tx - 26, YB + h + 1, tz, tx + 12, YB + h + 2, tz, M.TAXI);
      box(tx - 22, YB + 6, tz, tx - 22, YB + h, tz, M.IRON);
      box(tx - 25, YB, tz - 3, tx - 19, YB + 5, tz + 3, M.CONT_B);
      break;
    }
    case 'ferry': {
      for (let y = 0; y < 5; y++) {
        const k = 4 - y;
        box(x0 + k, YB - 5 + y * 2, z0 + k, x1 - k, YB - 4 + y * 2, z1 - k, M.CONT_O);
      }
      box(x0 + 8, YB + 5, z0 + 4, x1 - 8, YB + 8, z1 - 4, M.TENT_W);
      for (let a = x0 + 9; a < x1 - 8; a += 3) { put(a, YB + 7, z0 + 4, M.GLASS_K); put(a, YB + 7, z1 - 4, M.GLASS_K); }
      box(x0 + 18, YB + 9, z0 + 6, x1 - 18, YB + 11, z1 - 6, M.CONT_O);
      box(cxm, YB + 12, czm, cxm, YB + 16, czm, M.IRON);
      put(cxm, YB + 17, czm, M.LAMP);
      break;
    }
    case 'racks':
      for (let a = x0; a <= x1; a += 6) { box(a, YB, z0, a, YB + 3, z0, M.WOOD_D); box(a, YB, z1, a, YB + 3, z1, M.WOOD_D); box(a, YB + 3, z0, a, YB + 3, z1, M.WOOD); for (let b = z0 + 1; b < z1; b += 2) put(a, YB + 2, b, M.ALUM); }
      break;
    case 'smokers':
      for (let a = x0; a + 3 <= x1; a += 7) { box(a, YB, z0, a + 3, YB + 1, z1 - 3, M.IRON); put(a + 1, YB + 2, z0 + 1, M.FIRE); box(a + 3, YB + 2, z0, a + 3, YB + 3, z0, M.IRON); }
      box(x0, YB, z1, x1, YB, z1, M.WOOD);
      break;
    case 'rowhouse': {
      // Laid out like the buildings outside the wall, floor for floor: four clear, one slab, and a stair that goes all the way to the roof.
      // What is different is that people live here. The holes get patched, the windows get boarded, and the roof gets used.
      const face = p.face, hz = face === 'E' || face === 'W';
      const W = (hz ? z1 - z0 : x1 - x0) + 1, D = (hz ? x1 - x0 : z1 - z0) + 1, sd = p.sd, S = ROW_STYLES[p.pal], top = YB + p.floors * 5, seed = p.seed;
      const T = (u, y, v, id) => put(face === 'S' ? x0 + u : face === 'N' ? x1 - u : face === 'E' ? x1 - v : x0 + v, y, face === 'S' ? z1 - v : face === 'N' ? z0 + v : face === 'E' ? z0 + u : z1 - u, id);
      const sa = W - 5, sb = D - 7;   // the corner of the stairwell
      // Stained and patched, in blocks rather than speckle: a sheet of tin here, some planks there, a burn nobody painted over.
      const brick = (u, y, v) => {
        const k = h2(((u + v) >> 2) + seed, (y >> 2) * 3) % 41;
        return k === 0 ? M.PLANK : k === 1 ? M.BURNT : S.wall;
      };
      // Most windows still have glass, which is more than can be said for outside. The rest got what was available.
      const pane = (u, fl) => { if (p.wake && fl === 1) return M.GLASS_K; const k = h2(((u / S.p) | 0) + seed, fl * 5) % 10; return k < 2 ? M.WIN_LIT : k < 4 ? M.BARRICADE : M.GLASS_K; };
      for (let v = sd; v < D; v++) for (let u = 0; u < W; u++) {
        const front = v === sd, back = v === D - 1, side = u === 0 || u === W - 1;
        T(u, G0, v, M.WOOD_FLOOR);
        for (let y = YB; y < top; y++) {
          const rel = y - (YB - 1), lv = rel % 5, fl = (rel / 5) | 0;
          let id = 0;
          if (front || back || side) {
            const hit = (u + (seed & 3)) % S.p < S.w;
            if (lv === 0) id = S.trim;
            else if (side) id = brick(u, y, v);
            else if (front && fl === 0) {
              const du = u - p.door;
              if (du === 0 || du === 1) id = lv <= 3 ? 0 : M.WOOD_D;
              else if (du === -1 || du === 2) id = M.WOOD_D;
              else id = hit && (lv === 2 || lv === 3) ? (u & 1 ? M.IRON : pane(u, fl)) : brick(u, y, v);
            } else if (hit && lv >= 1 && lv <= 3 && (front || fl > 0)) id = pane(u, fl);
            else id = brick(u, y, v);
          } else if (u >= sa && u < sa + 4 && v >= sb && v < sb + 6) {
            // The same switchback every building in the city has. Lane A climbs; lane B lands on the next floor.
            const l = u - sa, r = v - sb, laneA = l < 2;
            const solid = r === 0 ? lv === 0 : r <= 3 ? (laneA ? lv === r : r === 3 ? lv === 4 : lv === 0) : lv === 3;
            if (solid) id = y === top - 1 ? M.ROOF_TAR : M.WOOD_D;
          } else if (lv === 0) id = y === top - 1 ? M.ROOF_TAR : M.WOOD_FLOOR;
          if (id) T(u, y, v, id);
        }
        // Whatever is left of the parapet.
        if ((front || back || side) && h2(u * 5 + seed, v) % 9) T(u, top, v, S.trim);
      }
      // Out front, a lean-to of tin and tarp over the door, on a couple of poles.
      for (let u = 0; u < W; u++) for (let v = 0; v < sd; v++) T(u, YB + 3, v, seed % 2 ? M.RUST : M.CANVAS);
      for (const u of [0, W - 1]) for (let y = YB; y < YB + 3; y++) T(u, y, 0, M.WOOD_D);
      // Rusted iron balconies down the fronts of the old walk-ups, with someone's washing on them.
      if (S.esc) {
        const a = 1 + (seed & 3), b = Math.min(W - 2, a + 4);
        for (let f = 1; f < p.floors; f++) for (let u = a; u <= b; u++) {
          T(u, YB + f * 5 - 1, sd - 1, M.IRON);
        }
      }
      // Inside, where people actually live: the same two proper beds on every floor, feet to the door. On a narrow plot there is room for one.
      const beds = W >= 10 ? [1, 3] : [1], rows = Math.min(6, D - sd - 3);
      for (let f = 0; f < p.floors; f++) {
        const off = f * 5;
        for (const b of beds) layBed((row, col, y, id) => T(b + col, y + off, D - 2 - row, id), rows, 2, seed + b + f * 11);
        if (p.lit || f) T(2, YB + 3 + off, sd + 1, M.LAMP);
      }
      // Up top: a chimney.
      for (let y = top; y < top + 2; y++) T(1, y, D - 2, S.wall);
      break;
    }
    case 'hallchurch': {
      // A brick neighbourhood church that has had a hard few months. Its windows went early and it has been a town office ever since. It faces east, onto the square.
      const D = x1 - x0 + 1, Wd = z1 - z0 + 1, mid = Wd >> 1, C = (v, y, u, id) => put(x1 - v, y, z0 + u, id);
      const brick = (u, y, v) => {
        const k = h2(((u + v) >> 2) + 17, (y >> 2) * 3) % 31;
        return k === 0 ? M.PLANK : k === 1 ? M.BURNT : M.BRICK_R;
      };
      for (let v = 3; v < D; v++) for (let u = 0; u < Wd; u++) C(v, G0, u, Math.abs(u - mid) <= 2 ? M.WOOD_D : M.WOOD_FLOOR);
      // The walls, with what is left of the windows, and a low tar roof that has been patched more than once.
      for (let v = 3; v < D; v++) {
        const bay = (v - 6 + 500) % 5;
        for (const u of [0, Wd - 1]) for (let y = YB; y <= YB + 9; y++) {
          const win = v > 9 && v < D - 2 && (bay === 1 || bay === 2) && y >= YB + 3 && y <= YB + 7;
          C(v, y, u, win ? (h2(v, y) % 4 === 0 ? M.STAINED : h2(v + u, y) % 3 ? M.BARRICADE : M.BARRICADE2) : brick(u, y, v));
        }
        for (let k = 0; k <= mid; k++) {
          const tile = () => M.ROOF_TAR;
          C(v, YB + 10 + k, k, tile(k));
          C(v, YB + 10 + k, Wd - 1 - k, tile(Wd - 1 - k));
        }
      }
      // The two gable ends.
      for (let u = 0; u < Wd; u++) {
        const peak = YB + 10 + Math.min(u, Wd - 1 - u);
        for (let y = YB; y <= peak; y++) {
          C(D - 1, y, u, brick(u, y, D - 1));
          const d = Math.abs(u - mid), door = d <= 2 && y <= YB + 5;
          if (!door) C(3, y, u, brick(u, y, 3));
        }
      }
      // One square tower over the door, nothing grand, and a welded cross.
      for (let v = 3; v <= 8; v++) for (let u = mid - 3; u <= mid + 3; u++) {
        if (!(v === 3 || v === 8 || Math.abs(u - mid) === 3)) continue;
        for (let y = YB + 6; y <= YB + 22; y++) {
          const open = (u === mid || v === 5 || v === 6) && y >= YB + 18 && y <= YB + 20;
          if (!open) C(v, y, u, brick(u, y, v));
        }
      }
      // Its two inside corners stand on timber posts down to the floor.
      for (const u of [mid - 3, mid + 3]) for (let y = YB; y < YB + 6; y++) C(8, y, u, M.LOG);
      for (let v = 3; v <= 8; v++) for (let u = mid - 3; u <= mid + 3; u++) if (h2(u, v) % 5) C(v, YB + 23, u, M.ROOF_TAR);
      for (let y = YB + 24; y <= YB + 28; y++) C(5, y, mid, M.IRON);
      for (const k of [-1, 1]) C(5, YB + 26, mid + k, M.IRON);
      // The yard's colours off the corner, and sandbags either side of the door from the last time.
      for (const a of [mid - 8, mid + 8]) for (let y = YB + 6; y <= YB + 13; y++) C(2, y, a, y > YB + 11 ? p.flag2 : p.flag1);
      for (let u = 0; u < Wd; u++) if (Math.abs(u - mid) > 3) for (let v = 0; v <= 1; v++) { C(v, YB, u, M.SANDBAG); if (h2(u, v) % 2) C(v, YB + 1, u, M.SANDBAG); }
      // Inside: what is left of the pews, a few lamps, and the clerk's table where the altar was with the board behind it.
      for (let v = 11; v <= D - 10; v += 3) for (let u = 3; u <= Wd - 4; u++) if (Math.abs(u - mid) > 2 && h2(u, v) % 5) C(v, YB, u, M.WOOD_D);
      // Each on an iron bracket off the wall, so it stands or falls with the wall it hangs from.
      for (const v of [9, 17, 24]) { C(v, YB + 8, 1, M.IRON); C(v, YB + 8, 2, M.LAMP); C(v, YB + 8, Wd - 2, M.IRON); C(v, YB + 8, Wd - 3, M.LAMP); }
      // Everything people left here for safekeeping, stacked along the walls.
      for (let v = 5; v < D - 8; v++) for (const u of [1, Wd - 2]) {
        const k = h2(v, u) % 7;
        if (k < 2) C(v, YB, u, M.WOOD);
        else if (k === 2) { C(v, YB, u, M.WOOD_D); C(v, YB + 1, u, M.CANVAS); }
      }
      for (let u = mid - 7; u <= mid + 7; u++) if (Math.abs(u - mid) > 5) for (let y = YB; y <= YB + 2; y++) C(D - 2, y, u, M.SHELF);
      for (let v = D - 7; v <= D - 6; v++) for (let u = mid - 3; u <= mid + 3; u++) C(v, YB, u, M.WOOD);
      for (let u = mid - 5; u <= mid + 5; u++) for (let y = YB + 1; y <= YB + 5; y++) C(D - 2, y, u, (u + mid) % 2 && y % 2 ? M.TENT_W : M.PLANK);
      C(D - 2, YB + 7, mid, M.LAMP);
      break;
    }
    case 'wreck': {
      car(x0, z0, p.dir, p.kind, (x0 * 7 + z0) & 255);
      break;
    }
    case 'church': {
      box(x0, YB, z0, x1, YB + 10, z1, M.BRICK_R);
      box(x0 + 1, YB, z0 + 1, x1 - 1, YB + 9, z1 - 1, 0);
      for (let k = 0; k < 5; k++) box(x0 + k, YB + 11 + k, z0, x1 - k, YB + 11 + k, z1, M.ROOF_TAR);
      box(cxm - 2, YB, z1, cxm + 2, YB + 4, z1, 0);
      for (let z = z0 + 3; z < z1 - 2; z += 5) { box(x0, YB + 4, z, x0, YB + 7, z + 1, M.STAINED); box(x1, YB + 4, z, x1, YB + 7, z + 1, M.STAINED); }
      box(cxm - 3, YB, z1 - 7, cxm + 3, YB + 22, z1 - 1, M.BRICK_R);
      box(cxm - 2, YB, z1 - 6, cxm + 2, YB + 21, z1 - 2, 0);
      box(cxm - 1, YB + 16, z1 - 7, cxm + 1, YB + 19, z1 - 7, 0);
      box(cxm, YB + 23, z1 - 4, cxm, YB + 28, z1 - 4, M.ALUM);
      box(cxm - 2, YB + 26, z1 - 4, cxm + 2, YB + 26, z1 - 4, M.ALUM);
      for (let z = z0 + 3; z < z1 - 9; z += 3) { box(x0 + 3, YB, z, cxm - 3, YB, z, M.WOOD_D); box(cxm + 3, YB, z, x1 - 3, YB, z, M.WOOD_D); }
      box(cxm - 3, YB, z0 + 1, cxm + 3, YB + 1, z0 + 2, M.WOOD);
      break;
    }
    case 'court': {
      box(x0, G0, z0, x1, G0, z1, M.COURT);
      for (let a = x0; a <= x1; a++) { put(a, G0, z0, M.LINE_W); put(a, G0, z1, M.LINE_W); }
      for (let b = z0; b <= z1; b++) { put(x0, G0, b, M.LINE_W); put(x1, G0, b, M.LINE_W); put(cxm, G0, b, M.LINE_W); }
      for (const [a, s] of [[x0, 1], [x1, -1]]) {
        box(a, YB, czm, a, YB + 4, czm, M.IRON);
        box(a + s, YB + 4, czm - 1, a + s, YB + 5, czm + 1, M.TENT_W);
        put(a + s * 2, YB + 4, czm, M.CAR_R);
      }
      break;
    }
    case 'keep': {
      box(x0, YB, z0, x1, YB + h - 1, z1, M.GRANITE);
      box(x0 + 2, YB, z0 + 2, x1 - 2, YB + h - 2, z1 - 2, 0);
      box(cxm - 2, YB, z1 - 1, cxm + 2, YB + 5, z1, 0);
      // The town hall, such as it is: a table, a board and a lamp on the ground floor.
      box(cxm - 3, YB, z0 + 6, cxm + 3, YB, z0 + 7, M.WOOD);
      box(cxm - 5, YB + 1, z0 + 2, cxm + 5, YB + 3, z0 + 2, M.PLANK);
      for (let a = cxm - 4; a <= cxm + 4; a += 2) put(a, YB + 2 + (a & 2 ? 1 : 0), z0 + 2, M.TENT_W);
      put(cxm, YB + 6, z0 + 8, M.LAMP);
      for (let y = 8; y < h - 3; y += 8) {
        for (let a = x0 + 4; a < x1 - 2; a += 6) { put(a, YB + y, z0, 0); put(a, YB + y, z1, 0); put(a, YB + y + 1, z0, 0); put(a, YB + y + 1, z1, 0); }
        box(x0 + 2, YB + y - 1, z0 + 2, x1 - 2, YB + y - 1, z1 - 2, M.WOOD_D);
      }
      for (let a = x0; a <= x1; a += 2) { put(a, YB + h, z0, M.GRANITE); put(a, YB + h, z1, M.GRANITE); }
      for (let b = z0; b <= z1; b += 2) { put(x0, YB + h, b, M.GRANITE); put(x1, YB + h, b, M.GRANITE); }
      box(x0 + 1, YB + h - 1, z0 + 1, x1 - 1, YB + h - 1, z1 - 1, M.ROOF_GRAVEL);
      box(cxm, YB + h, z0 + 8, cxm, YB + h + 3, z0 + 8, M.ALUM);
      box(cxm - 5, YB + 7, z1, cxm - 3, YB + 11, z1, M.STAINED);
      box(cxm + 3, YB + 7, z1, cxm + 5, YB + 11, z1, M.STAINED);
      break;
    }
    case 'cloister': {
      for (let a = x0; a <= x1; a += 5) for (const b of [z0, z1]) box(a, YB, b, a, YB + 5, b, M.LIMESTONE);
      for (let b = z0; b <= z1; b += 5) for (const a of [x0, x1]) box(a, YB, b, a, YB + 5, b, M.LIMESTONE);
      for (let a = x0; a <= x1; a++) for (const b of [z0, z1]) put(a, YB + 6, b, M.GRANITE);
      for (let b = z0; b <= z1; b++) for (const a of [x0, x1]) put(a, YB + 6, b, M.GRANITE);
      box(x0 + 8, G0, z0 + 8, x1 - 8, G0, z1 - 8, M.SOIL);
      for (let z = z0 + 8; z <= z1 - 8; z += 2) for (let x = x0 + 8; x <= x1 - 8; x++) if (h2(x, z) % 3) put(x, YB, z, h2(z, x) % 5 ? M.LEAF2 : M.CORN);
      break;
    }
  }
}
