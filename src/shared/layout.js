// Builds Ballarat: coast, river and lakes, the lie of the land and Mt. Page, the highways, the towns, their neighbourhoods and their lots.
// The result is a set of rasters (one cell per voxel column) read by the chunk generator,
// the far-country mesher, the minimap and the zombie population model.
import { WX, WZ, CS, CW, CD, STREET_Y, FLOOR_H, G } from './constants.js';
import { M } from './materials.js';
import { makeRng, fbm2, noise2, r2, h2 } from './rng.js';
import { CAMP_DEFS, planCamp } from './camps.js';

// Everything here was laid out on the state map, 4096 across; the world is wider. Country was added in two places, between
// Esperance and the Weston farmland, and through Gibson Valley, by moving everything east of each a long way further east.
export const gx = (x) => x + (x >= 1540 ? 320 : 0) + (x >= 2380 ? 800 : 0);
// Map fractions: u runs west to east, v north to south.
export const xU = (u) => gx(u * 4096);
export const zV = (v) => v * WZ;
export const uX = (x) => x / WX;
export const vZ = (z) => z / WZ;

export const STYLES = [
  { name: 'brick', wall: M.BRICK_R, trim: M.LIMESTONE, glass: M.GLASS_K, p: 4, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0 },
  { name: 'brick2', wall: M.BRICK_B, trim: M.CONCRETE, glass: M.GLASS_K, p: 5, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0 },
  { name: 'brownstone', wall: M.BROWNSTONE, trim: M.BRICK_B, glass: M.GLASS_K, p: 4, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0 },
  { name: 'limestone', wall: M.LIMESTONE, trim: M.CASTIRON, glass: M.GLASS_K, p: 4, w: 2, floor: M.CARPET, roof: M.ROOF_GRAVEL, cast: 0 },
  { name: 'castiron', wall: M.CASTIRON, trim: M.IRON, glass: M.GLASS_C, p: 4, w: 3, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 1 },
  { name: 'concrete', wall: M.CONCRETE, trim: M.CONCRETE_D, glass: M.GLASS_K, p: 5, w: 3, floor: M.CARPET, roof: M.ROOF_GRAVEL, cast: 0 },
  { name: 'glassB', wall: M.STEEL, trim: M.STEEL_D, glass: M.GLASS_B, p: 4, w: 3, floor: M.CARPET, roof: M.ROOF_GRAVEL, cast: 2 },
  { name: 'glassT', wall: M.ALUM, trim: M.STEEL, glass: M.GLASS_T, p: 3, w: 2, floor: M.CARPET, roof: M.ROOF_GRAVEL, cast: 2 },
  { name: 'glassK', wall: M.STEEL_D, trim: M.IRON, glass: M.GLASS_K, p: 4, w: 3, floor: M.TILE, roof: M.ROOF_GRAVEL, cast: 2 },
  { name: 'deco', wall: M.BRICK_Y, trim: M.LIMESTONE, glass: M.GLASS_A, p: 4, w: 2, floor: M.CARPET, roof: M.ROOF_GRAVEL, cast: 0 },
  { name: 'projects', wall: M.BRICK_R2, trim: M.CONCRETE, glass: M.GLASS_K, p: 6, w: 2, floor: M.TILE, roof: M.ROOF_TAR, cast: 0 },
  { name: 'whitebrick', wall: M.BRICK_W, trim: M.CONCRETE, glass: M.GLASS_K, p: 5, w: 3, floor: M.CARPET, roof: M.ROOF_TAR, cast: 0 },
  { name: 'granite', wall: M.GRANITE, trim: M.LIMESTONE, glass: M.GLASS_K, p: 5, w: 2, floor: M.TILE, roof: M.ROOF_GRAVEL, cast: 0 },
  // Albion's older streets: rows of stone fronts, tan and plum tenements with their fire escapes, terracotta and the odd painted front.
  { name: 'redstone', wall: M.BRICK_P, trim: M.BROWNSTONE, glass: M.GLASS_K, p: 4, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, cornice: M.IRON },
  { name: 'tenement', wall: M.BRICK_O, trim: M.CONCRETE_D, glass: M.GLASS_K, p: 3, w: 1, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, escape: true, cornice: M.STEEL_D },
  { name: 'graystone', wall: M.LIMESTONE, trim: M.GRANITE, glass: M.GLASS_K, p: 5, w: 3, floor: M.WOOD_FLOOR, roof: M.ROOF_GRAVEL, cast: 0, cornice: M.GRANITE },
  { name: 'terracotta', wall: M.BRICK_R, trim: M.BRICK_O, glass: M.GLASS_A, p: 4, w: 2, floor: M.CARPET, roof: M.ROOF_TAR, cast: 0, cornice: M.COPPER },
  { name: 'stucco', wall: M.STUCCO, trim: M.BRICK_B, glass: M.GLASS_K, p: 5, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, cornice: M.WOOD_D },
  { name: 'stuccoB', wall: M.STUCCO_B, trim: M.CONCRETE, glass: M.GLASS_K, p: 4, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, cornice: M.CONCRETE_D },
  { name: 'stuccoG', wall: M.STUCCO_G, trim: M.BRICK_R2, glass: M.GLASS_K, p: 3, w: 1, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, escape: true, cornice: M.BRICK_R2 },
  // Out of the city: painted board houses under shingle, the big stone places round Esperance, barns, and the pastel fronts along the shore.
  { name: 'clapW', wall: M.CLAP_W, trim: M.WOOD_D, glass: M.GLASS_K, p: 5, w: 2, floor: M.WOOD_FLOOR, roof: M.SHINGLE, cast: 0 },
  { name: 'clapB', wall: M.CLAP_B, trim: M.CLAP_W, glass: M.GLASS_K, p: 5, w: 2, floor: M.WOOD_FLOOR, roof: M.SHINGLE, cast: 0 },
  { name: 'clapY', wall: M.CLAP_Y, trim: M.CLAP_W, glass: M.GLASS_K, p: 5, w: 2, floor: M.WOOD_FLOOR, roof: M.SHINGLE_R, cast: 0 },
  { name: 'clapG', wall: M.CLAP_G, trim: M.CLAP_W, glass: M.GLASS_K, p: 6, w: 2, floor: M.WOOD_FLOOR, roof: M.SHINGLE, cast: 0 },
  { name: 'cottage', wall: M.BRICK_R, trim: M.CLAP_W, glass: M.GLASS_K, p: 5, w: 2, floor: M.WOOD_FLOOR, roof: M.SHINGLE_R, cast: 0 },
  { name: 'cedar', wall: M.PLANK, trim: M.WOOD_D, glass: M.GLASS_K, p: 6, w: 2, floor: M.WOOD_FLOOR, roof: M.SHINGLE, cast: 0 },
  { name: 'manor', wall: M.LIMESTONE, trim: M.GRANITE, glass: M.GLASS_K, p: 5, w: 2, floor: M.CARPET, roof: M.SHINGLE_B, cast: 0 },
  { name: 'manorB', wall: M.BRICK_R2, trim: M.LIMESTONE, glass: M.GLASS_K, p: 5, w: 2, floor: M.CARPET, roof: M.SHINGLE_B, cast: 0 },
  { name: 'barn', wall: M.BARN_R, trim: M.CLAP_W, glass: M.GLASS_K, p: 9, w: 2, floor: M.PLANK, roof: M.ROOF_TIN, cast: 0 },
  { name: 'beachP', wall: M.STUCCO_P, trim: M.CLAP_W, glass: M.GLASS_C, p: 5, w: 3, floor: M.TILE, roof: M.SHINGLE_R, cast: 0 },
  { name: 'beachT', wall: M.STUCCO_T, trim: M.CLAP_W, glass: M.GLASS_C, p: 5, w: 3, floor: M.TILE, roof: M.SHINGLE, cast: 0 },
  { name: 'silo', wall: M.ALUM, trim: M.STEEL, glass: M.GLASS_K, p: 9, w: 1, floor: M.CONCRETE, roof: M.ROOF_TIN, cast: 0 },
  { name: 'warehouse', wall: M.BRICK_B, trim: M.CONCRETE_D, glass: M.GLASS_K, p: 8, w: 3, floor: M.TILE, roof: M.ROOF_TIN, cast: 0 },
];
const S = Object.fromEntries(STYLES.map((s, i) => [s.name, i]));

export const P = { CAR: 1, TREE: 2, LAMP: 3, HYDRANT: 4, TRASH: 5, DUMPSTER: 6, CHECKPOINT: 7, PARKTREE: 8, BENCH: 9, NEWS: 10, ROCK: 11, BALE: 12 };
export const PROP_STRIDE = 6;

export const ROLES = {
  general: { title: 'General Trader', sign: M.AWN_G },
  arms: { title: 'Arms Dealer', sign: M.AWN_R },
  medic: { title: 'Field Medic', sign: M.AWN_B },
  junk: { title: 'Scrap Merchant', sign: M.CANVAS },
  food: { title: 'Food Stall', sign: M.CONT_O },
  builder: { title: 'Lumber and Block', sign: M.PLANK },
  mechanic: { title: 'Mechanic', sign: M.PAINT_Y },
};

// What gets built where. f: floors, lot: plot size, house: the yard left round a detached house.
const Z = {
  core: { blk: [120, 84], drop: 0, f: [14, 38], st: [S.glassB, S.glassK, S.glassT, S.limestone, S.deco, S.granite, S.concrete], lot: [36, 64], tall: .3, alley: .35, dens: 190 },
  midtown: { blk: [116, 80], drop: 0.03, f: [7, 20], st: [S.limestone, S.deco, S.glassB, S.glassK, S.concrete, S.granite, S.brick2, S.whitebrick], lot: [28, 50], tall: .16, alley: .3, parking: .03, dens: 150 },
  old: { blk: [84, 64], drop: 0.1, f: [3, 7], st: [S.castiron, S.castiron, S.brick, S.brick2, S.whitebrick, S.limestone], lot: [18, 32], tall: .05, alley: .3, dens: 130 },
  rows: { blk: [104, 58], drop: 0.1, f: [3, 5], st: [S.brownstone, S.brownstone, S.brick, S.limestone, S.brick2, S.redstone, S.graystone], lot: [13, 22], tall: .02, fronts: true, stoops: true, garden: .05, church: .03, alley: .2, dens: 100 },
  eastbank: { blk: [96, 62], drop: 0.14, f: [2, 5], st: [S.brick, S.brick, S.brownstone, S.redstone, S.tenement, S.stucco, S.stuccoB, S.warehouse], lot: [14, 26], tall: .02, fronts: true, stoops: true, garden: .08, church: .04, parking: .04, alley: .25, dens: 70 },
  tenement: { blk: [100, 66], drop: 0.1, f: [4, 9], st: [S.tenement, S.tenement, S.terracotta, S.brick, S.brick2, S.deco, S.redstone, S.stuccoG], lot: [18, 34], tall: .08, towers: true, fronts: true, church: .02, stepped: .3, garden: .04, parking: .03, alley: .3, dens: 120 },
  apartments: { blk: [112, 76], drop: 0.06, f: [8, 19], st: [S.whitebrick, S.limestone, S.brick2, S.concrete, S.deco], lot: [26, 44], tall: .12, alley: .3, dens: 120 },
  works: { blk: [170, 120], drop: 0.22, f: [1, 3], st: [S.warehouse, S.warehouse, S.brick2, S.concrete, S.brick], lot: [38, 70], tall: 0, parking: .14, alley: .4, dens: 70 },
  mainst: { blk: [92, 66], drop: 0.06, f: [2, 4], st: [S.brick, S.brick2, S.castiron, S.limestone, S.whitebrick, S.stucco], lot: [16, 30], tall: .03, parking: .07, alley: .3, dens: 80 },
  commercial: { blk: [104, 76], drop: 0.06, f: [3, 8], st: [S.brick, S.brick2, S.concrete, S.limestone, S.whitebrick, S.deco], lot: [22, 40], tall: .08, parking: .07, alley: .3, dens: 120 },
  finest: { blk: [96, 64], drop: 0.14, f: [2, 4], st: [S.limestone, S.limestone, S.brick, S.graystone, S.whitebrick, S.manorB], lot: [18, 30], tall: 0, fronts: true, garden: .06, alley: .3, dens: 80 },
  towers: { blk: [104, 72], f: [10, 32], st: [S.glassT, S.glassB, S.beachP, S.beachT, S.whitebrick, S.concrete], lot: [30, 50], tall: .15, parking: .06, alley: .4, dens: 120 },
  resort: { blk: [100, 70], f: [4, 12], st: [S.beachP, S.beachT, S.stucco, S.stuccoB, S.whitebrick, S.glassT], lot: [26, 46], tall: .1, parking: .08, alley: .35, dens: 100 },
  bungalow: { blk: [104, 60], f: [1, 1], st: [S.clapW, S.beachP, S.beachT, S.clapY, S.cottage, S.stuccoB], lot: [22, 28], house: [4, 6], dens: 45 },
  shops: { blk: [92, 68], f: [2, 4], st: [S.limestone, S.brick, S.manorB, S.whitebrick, S.graystone, S.stucco], lot: [20, 34], tall: 0, parking: .12, alley: .3, dens: 70 },
  truck: { blk: [200, 140], f: [1, 2], st: [S.warehouse, S.stucco, S.brick2, S.concrete], lot: [30, 52], parking: .45, alley: .5, dens: 25 },
  houses: { blk: [104, 66], drop: 0.3, f: [1, 2], st: [S.clapW, S.clapB, S.clapY, S.clapG, S.cottage, S.cedar], lot: [21, 29], house: [3, 5], dens: 60 },
  beach: { blk: [100, 62], drop: 0.26, f: [1, 2], st: [S.beachP, S.beachT, S.clapW, S.clapY, S.clapB], lot: [20, 27], house: [3, 4], dens: 50 },
  estate: { blk: [190, 140], drop: 0.38, f: [2, 3], st: [S.manor, S.manor, S.manorB, S.cottage, S.clapW], lot: [56, 88], house: [11, 17], dens: 35 },
  farmtown: { blk: [130, 90], rural: true, f: [1, 2], st: [S.clapW, S.clapY, S.brick, S.cedar, S.clapG, S.brick2], lot: [22, 36], tall: 0, parking: .14, garden: .12, fields: .1, alley: .1, dens: 45 },
  farmhouse: { blk: [240, 170], rural: true, f: [1, 2], st: [S.clapW, S.clapW, S.clapY, S.cedar, S.cottage, S.clapG, S.barn], lot: [40, 64], house: [7, 13], garden: .14, fields: .55, dens: 22 },
  grainyard: { blk: [180, 130], rural: true, f: [1, 3], st: [S.barn, S.barn, S.warehouse, S.silo], lot: [40, 70], parking: .18, fields: .2, alley: .2, dens: 24 },
  village: { blk: [100, 70], drop: 0.3, f: [1, 2], st: [S.clapW, S.cedar, S.cottage, S.clapY, S.brick], lot: [20, 28], house: [3, 5], dens: 38 },
};

function chaikinOpen(pts, n) {
  for (let k = 0; k < n; k++) {
    const out = [pts[0]];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Everything below is traced off the state map, which is 1254 pixels across: PX turns its pixels into blocks.
const PX = 4096 / 1254;
const px = (list) => list.map(([a, b]) => [gx(a * PX), b * PX]);
// The mainland's sea shore, north to south: [map y, map x].
const COAST = [[0, 905], [50, 935], [100, 975], [150, 990], [200, 1000], [250, 1012], [300, 1030], [350, 1048], [400, 1052], [450, 1062], [500, 1080], [550, 1096],
  [600, 1120], [650, 1150], [680, 1162], [705, 1135], [725, 1110], [770, 1100], [830, 1095], [880, 1062], [950, 1052], [1000, 1050], [1050, 1045], [1075, 1020],
  [1085, 990], [1100, 955], [1130, 925], [1170, 910], [1210, 905], [1254, 900]];
const MT = { x: 1159, z: 1862 };                       // the summit of Mt. Page
const LIGHT = { x: 4517, z: 3821 };                    // Severn Rock, and the light on it
const RIVER = px([[500, 0], [492, 60], [490, 110], [500, 140], [525, 165], [560, 185], [575, 210], [560, 240], [540, 260], [525, 290], [530, 315], [555, 330],
  [590, 345], [600, 370], [585, 395], [575, 420], [565, 440], [580, 460]]);
const BARRIER = px([[1095, 830], [1115, 900], [1140, 1000], [1160, 1070], [1150, 1092], [1128, 1080], [1110, 1005], [1090, 925], [1076, 860]]);
const GIBSON_ROAD = [[2400, 1045], [2520, 1045], [2610, 960], [2660, 830], [2900, 792], [3010, 760], [3500, 760], [3720, 760], [3810, 790], [3880, 866], [4059, 900], [4110, 935], [4220, 935]];
const STREET_POOL = ['Linden', 'Carrow', 'Page', 'Founders', 'Marlowe', 'Garrison', 'Exchange', 'Meridian', 'Tanner', 'Quay', 'Mill', 'Ferry', 'Chapel', 'Union', 'Market',
  'Bridge', 'Hawthorn', 'Laurel', 'Cedar', 'Magnolia', 'Dogwood', 'Pecan', 'Willow', 'Sycamore', 'Pine', 'Juniper', 'Palmetto', 'Live Oak', 'Peachtree', 'Cypress',
  'Harbor', 'Bay', 'Ocean', 'Gull', 'Heron', 'Pelican', 'Dune', 'Coral', 'Orchard', 'Ridge', 'Summit', 'Highland', 'Abbey', 'Stone', 'Belmont', 'Court', 'Bell', 'Vine',
  'Foundry', 'Cannery', 'Depot', 'Grange', 'Silo', 'Feed', 'Church', 'Spring', 'Hickory', 'Walnut', 'Poplar', 'Elm', 'Maple', 'Ash', 'Birch', 'Holly', 'Ivy'];

function inPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
const capsule = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const lineDist = (x, z, pts) => { let m = Infinity; for (let k = 0; k + 1 < pts.length; k++) m = Math.min(m, capsule(x, z, ...pts[k], ...pts[k + 1])); return m; };
// Ridges and the valleys between them, running along the given direction.
const ridged = (x, z, f, ang, str, o) => {
  const c = Math.cos(ang), s = Math.sin(ang);
  const n = fbm2((x * c + z * s) * f / str + o, (-x * s + z * c) * f + o * .7, 4);
  const r = 1 - Math.abs(2 * n - 1);
  return r * r;
};

// Each town is a patchwork of neighbourhoods, each laid out in its own time: its own grid, at its own angle, its own size of block, and
// a boulevard along every edge where it meets the next. [name, x, z, zone, angle, block across, block deep, avenue width, street width]
const TOWN_DEFS = [
  {
    key: 'albion', name: 'Albion', joins: [[false, 310], [false, 1045], [true, 2386], [true, 441]], lift: (x, z) => 6 + 26 * sstep((1700 - z) / 1400),
    // The north side steps in through the middle: the old town reaches up at the west corner and the mills by the river at the east, and
    // between them the woods come down to the edge of Market Row.
    poly: px([[95, 58], [200, 52], [262, 58], [280, 126], [330, 136], [395, 132], [412, 98], [470, 66], [520, 85], [640, 95], [648, 300], [645, 480], [600, 485], [565, 470], [520, 430], [450, 405], [380, 395], [300, 420], [260, 470],
      [200, 520], [140, 510], [110, 470], [80, 380], [75, 200]]),
    districts: [
      ['Exchange District', 1180, 840, 'core', 0, 124, 76, 18, 12, { oa: 0, ob: 38, wide: [0], square: { ia: 0, ir: -1 }, numbered: true }],
      ['Midtown', 880, 820, 'midtown', 0, 116, 72, 16, 12, { numbered: true, parks: [['Founders Green', -1, -2, 2, 4]] }],
      ['Market Row', 1080, 470, 'commercial', .18, 110, 70, 14, 12, {}], ['Old Quarter', 1450, 560, 'old', -.38, 96, 64, 12, 10, {}],
      ['Foundry Row', 1420, 270, 'works', -.12, 150, 110, 14, 12, {}], ['Riverside', 1520, 1000, 'apartments', .3, 110, 72, 14, 12, {}],
      ['Northgate', 760, 330, 'rows', 0, 120, 60, 14, 10, { numbered: true, parks: [['Northgate Gardens', 0, 0, 1, 1]] }], ['Carrow Hill', 450, 300, 'rows', -.25, 100, 60, 12, 10, {}],
      ['Westmoor', 470, 700, 'tenement', .32, 110, 68, 14, 12, {}], ['Westmoor Yards', 420, 1220, 'works', 0, 160, 110, 14, 12, {}],
      ['Greenside', 720, 1130, 'apartments', -.15, 116, 72, 14, 12, {}], ['Pagefoot', 1120, 1200, 'tenement', .2, 104, 66, 14, 12, { parks: [['Pagefoot Park', 0, 0, 1, 1]] }],
      ['Southgate', 650, 1500, 'rows', -.1, 110, 60, 12, 10, {}], ['Eastbank', 2330, 820, 'eastbank', 0, 100, 64, 12, 10, {}],
      ['Millrace', 2310, 380, 'works', .15, 140, 100, 14, 12, {}], ['Lakeside', 2310, 1350, 'rows', -.3, 100, 60, 12, 10, {}],
      ['Riverbend', 2020, 1250, 'apartments', .45, 100, 70, 14, 12, {}],
    ],
  },
  {
    key: 'severn', name: 'Severn Bay', joins: [[true, 4320], [false, 3200], [false, 2905]], lift: () => 1,
    poly: px([[760, 840], [860, 820], [960, 815], [1060, 830], [1092, 858], [1066, 892], [1056, 960], [1054, 1050], [1040, 1080], [990, 1095], [950, 1110], [900, 1105],
      [860, 1070], [790, 1050], [755, 980], [750, 900]]),
    districts: [
      ['Lagoon Front', 4540, 2950, 'resort', -.15, 100, 70, 14, 12, { bridgeAll: true }], ['Severn Bay Center', 4280, 3140, 'commercial', 0, 104, 72, 16, 12, {}],
      ['The Marina', 4320, 3450, 'mainst', .2, 96, 66, 14, 12, {}], ['Old Severn', 4070, 2800, 'mainst', 0, 92, 64, 12, 10, { parks: [['Carousel Park', 0, 0, 1, 1]] }],
      ['Midbay', 4050, 3150, 'resort', .3, 100, 70, 14, 12, {}], ['Palm Heights', 3740, 3000, 'houses', -.2, 104, 62, 12, 10, {}],
      ['Bayside', 3840, 3380, 'beach', .12, 104, 62, 12, 10, {}], ['Gull Point', 4540, 3320, 'resort', -.3, 96, 66, 14, 12, {}],
    ],
  },
  {
    key: 'esperance', name: 'Esperance', joins: [[true, 760], [false, 3544]], lift: (x) => 8 + 36 * sstep((1520 - x) / 620),
    // Sat low on its hill, so the southern road runs through the lower middle of town rather than along the bottom of it.
    poly: px([[150, 840], [250, 815], [340, 840], [430, 880], [455, 960], [440, 1050], [380, 1095], [290, 1110], [200, 1090], [140, 1040], [115, 960], [125, 890]]).map(([x, z]) => [x, z + 170]),
    districts: [
      ['Esperance Center', 950, 3470, 'shops', 0, 92, 68, 14, 12, { parks: [['Esperance Common', 0, -1, 1, 1]] }], ['Laurel Park', 1180, 3300, 'houses', .25, 104, 64, 12, 10, {}],
      ['Belmont', 720, 3630, 'houses', -.3, 104, 64, 12, 10, {}], ['Chapel Hill', 960, 3730, 'finest', .1, 96, 64, 12, 10, {}],
      ['Esperance Heights', 680, 3100, 'estate', .4, 170, 120, 12, 10, {}], ['Highland', 470, 3390, 'estate', -.45, 170, 120, 12, 10, {}],
      ['Ridgeview', 1300, 3070, 'estate', -.2, 170, 120, 12, 10, {}], ['Southview', 1250, 3650, 'estate', .15, 170, 120, 12, 10, {}],
    ],
  },
  {
    key: 'dayton', name: 'Dayton', joins: [[true, 4210], [false, 935], [true, 4600]], lift: () => 2,
    poly: px([[940, 60], [985, 70], [998, 200], [1012, 250], [1040, 320], [1052, 400], [1065, 470], [1085, 540], [1100, 600], [1060, 630], [1010, 600], [975, 520], [950, 440],
      [935, 350], [925, 250], [925, 140]]),
    districts: [
      ['Dayton Works', 4240, 520, 'works', -.15, 140, 100, 14, 12, {}], ['Harborside', 4350, 1070, 'mainst', -.2, 90, 64, 12, 10, {}],
      ['Dayton Center', 4450, 1400, 'commercial', -.2, 96, 66, 16, 12, { parks: [['Cooper Square', 0, 0, 1, 1]] }], ['Millside', 4250, 810, 'houses', -.2, 110, 64, 12, 10, {}],
      ['Sunset Shores', 4520, 1730, 'bungalow', -.22, 104, 60, 12, 10, {}], ['Palm Grove', 4600, 2050, 'bungalow', -.25, 110, 62, 12, 10, {}],
    ],
  },
  {
    key: 'weston', name: 'Weston', joins: [[true, 2330]], lift: () => 3,
    poly: px([[515, 700], [600, 688], [680, 708], [695, 780], [665, 835], [590, 845], [525, 815], [505, 755]]),
    districts: [
      ['Weston', 2330, 2500, 'farmtown', 0, 96, 70, 14, 12, { oa: 0, parks: [['Weston Green', 0, -1, 1, 1]] }], ['North Weston', 2170, 2340, 'farmhouse', .15, 100, 66, 12, 10, {}],
      ['South Weston', 2320, 2680, 'farmhouse', -.1, 100, 66, 12, 10, {}], ['Weston Yards', 2510, 2470, 'grainyard', 0, 130, 100, 14, 12, {}],
      ['Pond Side', 2080, 2550, 'farmhouse', .3, 100, 66, 12, 10, {}],
    ],
  },
  {
    key: 'westpoint', name: 'Westpoint', joins: [[false, 2215]], lift: null,
    poly: px([[66, 655], [122, 655], [124, 702], [66, 702]]),
    districts: [['Westpoint Truck Stop', 305, 2215, 'truck', 0, 200, 140, 14, 14, {}]],
  },
  {
    key: 'gibson', name: 'Gibson Valley', joins: [[false, 760]], lift: null,
    poly: [[3170, 540], [3400, 520], [3440, 690], [3390, 810], [3200, 820], [3150, 690]],
    districts: [['Gibson Valley', 3290, 670, 'village', .2, 90, 66, 12, 10, {}]],
  },
];
function sstep(t) { return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t); }

export function buildLayout(seed = 1609) {
  const shared = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
  const alloc = (T, n) => new T(shared ? new SharedArrayBuffer(n * T.BYTES_PER_ELEMENT) : new ArrayBuffer(n * T.BYTES_PER_ELEMENT));
  const N = WX * WZ;
  const ground = alloc(Uint8Array, N);
  const lot = alloc(Uint16Array, N);
  const edge = alloc(Uint8Array, N);
  const height = alloc(Uint8Array, N);
  const mark = alloc(Uint8Array, N);
  const terr = alloc(Int16Array, N);
  const rng = makeRng(seed);
  const T0 = performance.now(), TM = {}, tick = (k) => { TM[k] = Math.round(performance.now() - T0); };
  const inside = (x, z) => x >= 0 && z >= 0 && x < WX && z < WZ;
  const cellOf = (x, z) => Math.max(0, Math.min(WZ - 1, Math.floor(z))) * WX + Math.max(0, Math.min(WX - 1, Math.floor(x)));

  // --- Sea, river, lakes ------------------------------------------------------------------------
  const land = new Uint8Array(N);
  const coastX = new Int16Array(WZ);
  for (let z = 0, k = 1; z < WZ; z++) {
    const y = z / PX;
    while (k < COAST.length - 1 && COAST[k][0] < y) k++;
    const [ya, xa] = COAST[k - 1], [yb, xb] = COAST[k];
    const t = Math.max(0, Math.min(1, (y - ya) / (yb - ya)));
    const cx = Math.round(gx((xa + (xb - xa) * t) * PX) + (fbm2(z * .007, 7.7, 3) - .5) * 44 + (noise2(z * .05, 3.1) - .5) * 8);
    coastX[z] = cx;
    land.fill(1, z * WX, z * WX + Math.max(0, Math.min(WX, cx)));
  }
  const fillPoly = (pts, val, wob = 0) => {
    let x0 = WX, x1 = 0, z0 = WZ, z1 = 0;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let z = Math.max(0, Math.floor(z0 - wob)); z <= Math.min(WZ - 1, Math.ceil(z1 + wob)); z++) for (let x = Math.max(0, Math.floor(x0 - wob)); x <= Math.min(WX - 1, Math.ceil(x1 + wob)); x++) {
      const ox = wob ? (fbm2(x * .02 + 5, z * .02, 2) - .5) * 2 * wob : 0, oz = wob ? (fbm2(x * .02, z * .02 + 9, 2) - .5) * 2 * wob : 0;
      if (inPoly(pts, x + ox, z + oz)) land[z * WX + x] = val;
    }
  };
  // The barrier beach in front of Severn Bay. Past its end, the mouth of the bay is open water out to the light.
  fillPoly(BARRIER, 1, 10);
  // Marsh islands, all through the lagoon behind the barrier.
  for (let z = Math.round(830 * PX); z < Math.round(1078 * PX); z++) for (let x = coastX[z] + 22; x < gx(1120 * PX); x++) {
    const i = z * WX + x;
    if (!land[i] && fbm2(x * .018 + 3, z * .018, 3) > .6) land[i] = 3;
  }
  // Lakes: shapes the land made, not drawn with a compass. A blob, pushed about by noise, with its edge broken up by more.
  const blob = (cx, cz, rx, rz, k, val = 0) => {
    const R = Math.max(rx, rz) * 1.9;
    for (let z = Math.max(0, Math.floor(cz - R)); z <= Math.min(WZ - 1, Math.ceil(cz + R)); z++) for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(WX - 1, Math.ceil(cx + R)); x++) {
      const wx = x + rx * 1.1 * (fbm2(x * .012 + k, z * .012, 3) - .5), wz = z + rz * 1.1 * (fbm2(x * .012, z * .012 + k * 3, 3) - .5);
      const d = Math.hypot((wx - cx) / rx, (wz - cz) / rz);
      if (d + (fbm2(x * .035 + k, z * .035 - k, 2) - .5) * .9 < 1) land[z * WX + x] = val;
    }
  };
  const LAKES = [['Albion Lake', 2221, 1496, 92, 58, 1], ['Gibson Pond', 3300, 690, 50, 32, 2], ['Weston Pond', 2165, 2466, 54, 38, 3], ['Dayton Harbor', 4295, 1060, 92, 112, 4]];
  for (const [, x, z, rx, rz, k] of LAKES) blob(x, z, rx, rz, k);
  const eachNear = (pts, reach, fn) => {
    let run = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz, len = Math.sqrt(len2);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach)), x1 = Math.min(WX - 1, Math.ceil(Math.max(ax, bx) + reach));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz) - reach)), z1 = Math.min(WZ - 1, Math.ceil(Math.max(az, bz) + reach));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d <= reach) fn(z * WX + x, d, run + t * len, x, z);
      }
      run += len;
    }
  };
  // The channel out of Dayton's harbour to the sea, and two rocks off the point.
  eachNear([[4350, 1010], [4450, 985], [4560, 990]], 18, (i, d) => { if (d < 15) land[i] = 0; });
  blob(4598, 1160, 16, 12, 5, 2); blob(4631, 1241, 13, 10, 6, 2);
  const river = chaikinOpen(RIVER, 3);
  eachNear(river, 26, (i, d, along) => { if (d < 15 + 5 * Math.sin(along * .011) + (noise2(along * .03, 1) - .5) * 6) land[i] = 0; });
  // Severn Rock stands in the mouth of the bay, a long swim from anywhere.
  blob(LIGHT.x, LIGHT.z, 34, 31, 7, 2);

  const chamfer = (isZero, max = 255) => {
    const d = new Uint8Array(N);
    for (let i = 0; i < N; i++) d[i] = isZero(i) ? 0 : max;
    for (let z = 1; z < WZ; z++) for (let x = 1, i = z * WX + 1; x < WX; x++, i++) {
      const v = Math.min(d[i], d[i - 1] + 1, d[i - WX] + 1);
      d[i] = v;
    }
    for (let z = WZ - 2; z >= 0; z--) for (let x = WX - 2, i = z * WX + x; x >= 0; x--, i--) {
      const v = Math.min(d[i], d[i + 1] + 1, d[i + WX] + 1);
      d[i] = v;
    }
    return d;
  };
  // Tidy what the noise left behind: specks of land standing alone in the water go under, and puddles cut off on dry land fill in.
  // Rocks and marsh are meant to be where they are and stay.
  {
    const seen = new Uint8Array(N), stk = new Int32Array(N >> 2), cells = [];
    for (let s = 0; s < N; s++) {
      if (seen[s]) continue;
      const wet = land[s] === 0;
      if (!wet && land[s] !== 1) { seen[s] = 1; continue; }
      let sp = 0, size = 0, edgeHit = false;
      cells.length = 0;
      stk[sp++] = s; seen[s] = 1;
      while (sp) {
        const c = stk[--sp], x = c % WX, z = (c / WX) | 0;
        size++;
        if (size < 4000) cells.push(c);
        if (x === 0 || z === 0 || x === WX - 1 || z === WZ - 1) edgeHit = true;
        for (let q = 0; q < 4; q++) {
          if ((q === 0 && x === 0) || (q === 1 && x === WX - 1) || (q === 2 && z === 0) || (q === 3 && z === WZ - 1)) continue;
          const nb = q === 0 ? c - 1 : q === 1 ? c + 1 : q === 2 ? c - WX : c + WX;
          if (seen[nb]) continue;
          const ln = land[nb];
          if ((ln === 0) !== wet || (!wet && ln !== 1)) continue;
          seen[nb] = 1;
          if (sp < stk.length) stk[sp++] = nb;
        }
      }
      if (edgeHit) continue;
      if (wet && size < 1500) for (const c of cells) land[c] = 1;
      else if (!wet && size < 3500) for (const c of cells) land[c] = 0;
    }
  }
  tick('water');
  const dw = chamfer((i) => land[i] === 0);
  const dl = chamfer((i) => land[i] !== 0, 40);

  // --- Towns ------------------------------------------------------------------------------------
  // Each town's edge follows the map, broken up the way a town really thins out into the country round it.
  const TOWNS = TOWN_DEFS.map((t) => {
    let x0 = WX, x1 = 0, z0 = WZ, z1 = 0;
    for (const [x, z] of t.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const m = 90;
    return { ...t, x0: Math.max(1, Math.floor(x0 - m)), x1: Math.min(WX - 2, Math.ceil(x1 + m)), z0: Math.max(1, Math.floor(z0 - m)), z1: Math.min(WZ - 2, Math.ceil(z1 + m)) };
  });
  const townId = new Uint8Array(N);
  TOWNS.forEach((t, ti) => {
    const GWd = ((t.x1 - t.x0) >> 2) + 2, GDd = ((t.z1 - t.z0) >> 2) + 2, OX = new Float32Array(GWd * GDd), OZ = new Float32Array(GWd * GDd);
    for (let gz = 0; gz < GDd; gz++) for (let gx = 0; gx < GWd; gx++) {
      const x = t.x0 + gx * 4, z = t.z0 + gz * 4;
      OX[gx + gz * GWd] = 62 * (noise2(x * .008 + ti * 7.3, z * .008) - .5) * 2 + 22 * (noise2(x * .03, z * .03 + ti) - .5) * 2;
      OZ[gx + gz * GWd] = 62 * (noise2(x * .008, z * .008 + ti * 4.1) - .5) * 2 + 22 * (noise2(x * .03 + ti, z * .03) - .5) * 2;
    }
    // Two blocks at a time is fine enough for the edge of a town.
    for (let z = t.z0; z < t.z1; z += 2) for (let x = t.x0; x < t.x1; x += 2) {
      const k = ((x - t.x0) >> 2) + ((z - t.z0) >> 2) * GWd;
      if (!inPoly(t.poly, x + OX[k], z + OZ[k])) continue;
      const i = z * WX + x;
      townId[i] = townId[i + 1] = townId[i + WX] = townId[i + WX + 1] = ti + 1;
    }
  });

  tick('towns');
  // --- Where the settlements stand ----------------------------------------------------------------
  // Each one on open ground a little way out from a town, with a road to its gate and something worth having close by.
  const around = (x, z, hw, hd, extra = {}) => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, ...extra });
  const P_LIBRARY = { x0: 2036, x1: 2070, z0: 1348, z1: 1412 };
  const campRects = {
    bryant: { x0: 1824, x1: 2096, z0: 1240, z1: 1520, keep: [P_LIBRARY], plazaX: 1966, plazaZ: 1380 },   // Lakeshore Market: built into the south of Albion, above the lake
    battery: around(4120, 3400, 135, 86),      // Severn Landing: built into the south side of Severn Bay, up from the marina
    wash: around(2150, 2120, 122, 84),         // Weston Grange, under the ridge on the north side of Weston: the road from the valley runs through town to it
    union: around(560, 1990, 94, 140),        // Fort Westpoint, off the west road above the truck stop
    sheep: around(2570, 3720, 150, 104),       // Arnhem Bastion, out among the fields
    tompkins: around(4380, 1400, 86, 128),      // Cannery Collective: the old cannery lots in south Dayton, back from the shore
    morning: around(2900, 560, 138, 92),      // Gibson Redoubt, on the north side at the head of the valley
    garvey: around(1740, 3350, 128, 96),      // Carver Yard: the old mill village in the valley below Esperance, where a new life starts
    tryon: around(560, 900, 90, 124),         // Abbey Keep: the old abbey, walled into Westmoor on Albion's west side
  };
  // The walls stand a block further out than the plots above: the yard inside and the walkway get the room.
  for (const k in campRects) { const r = campRects[k]; r.x0--; r.z0--; r.x1++; r.z1++; }
  const campDist = (x, z) => {
    let m = Infinity;
    for (const k in campRects) { const r = campRects[k]; m = Math.min(m, Math.max(0, r.x0 - x, x - r.x1, r.z0 - z, z - r.z1)); }
    return m;
  };

  // --- The lie of the land ------------------------------------------------------------------------
  // The land rises to the north. Mt. Page is a sandstone plateau cut through with gorges, its peak standing out of it, and from its
  // lower slopes a ridge runs east to Trinity Forest: high, broken forest country from the coast road up past Gibson Valley to the northern
  // edge. Weston's farmland lies flat from that ridge to the southern edge, and the coast is a low plain.
  // The farmland: a long run south from Weston, spreading west toward Carver Yard and a little way east, with open country between the
  // last fields and Severn Bay.
  const farmK = (x, z) => Math.max(sstep(1 - capsule(x, z, 2540, 2480, 2520, 4096) / 520), sstep(1 - capsule(x, z, 2700, 3150, 2900, 3420) / 400), sstep(1 - capsule(x, z, 2080, 2980, 2020, 3820) / 380));
  const trinityK = (x, z) => Math.max(sstep(1 - capsule(x, z, 2570, 950, 4470, 2150) / 430), sstep(1 - capsule(x, z, 2270, 60, 4120, 380) / 300), sstep(1 - capsule(x, z, 3500, 1700, 2820, 2380) / 380));
  const pageK = (x, z) => sstep(1 - capsule(x, z, 560, 1450, 2040, 2380) / 560);
  const elev0 = (x, z) => {
    let e = 4 + 30 * sstep((2800 - z) / 2500) + 8 * sstep((1800 - x) / 1600);
    e += (fbm2(x * .0028 + 11, z * .0028 + 5, 4) - .45) * 34;
    const mP = pageK(x, z);
    if (mP > 0) {
      const n = fbm2(x * .0042 + 31, z * .0042 + 17, 3);
      const gorge = 1 - sstep(Math.abs(n - .5) / .085);
      e += mP * (64 + 26 * fbm2(x * .009, z * .009, 2) - 58 * gorge);
    }
    {
      const dx = x - MT.x, dz = z - MT.z, d = Math.hypot(dx, dz), ang = Math.atan2(dz, dx);
      const R = 430 * (1 + (fbm2(Math.cos(ang) * 1.4 + 7, Math.sin(ang) * 1.4 + 3, 3) - .5) * .55);
      if (d < R) {
        const k = 1 - d / R;
        let cone = 112 * Math.pow(k, 1.5);
        const gully = Math.abs(Math.sin(ang * 11 + fbm2(d * .012, ang * 2, 2) * 7));
        cone *= 1 - .22 * (1 - gully) * Math.min(1, k * 3) * (1 - k * .6);
        if (d < 50) cone -= 16 * (1 - (d / 50) ** 2);
        e += cone;
      }
    }
    e += sstep(1 - capsule(x, z, 1920, 2180, 3740, 1860) / 190) * (34 + 22 * ridged(x, z, .008, .3, 2, 3));
    e += 30 * sstep(1 - Math.hypot((x - 2515) / 260, (z - 2075) / 120));
    const mT = trinityK(x, z);
    e += mT * (24 + 46 * ridged(x, z, .0065, .69, 2.4, 9));
    e *= 1 - .75 * sstep(1 - lineDist(x, z, GIBSON_ROAD) / 240);
    e += sstep((z - 2450) / 400) * sstep((1750 - x) / 600) * (14 + 34 * ridged(x, z, .006, .35, 2.2, 5));
    e *= 1 - .85 * farmK(x, z);
    e *= .25 + .75 * Math.max(sstep((coastX[Math.max(0, Math.min(WZ - 1, z | 0))] - x - 100) / 650), mT * .8);
    return Math.max(0, Math.min(236, e));
  };
  const QW = (WX >> 2) + 1, QD = (WZ >> 2) + 1, Q = QW * QD;
  const EQ = new Float32Array(Q), TQ = new Float32Array(Q), TL = new Float32Array(Q), WQ = new Float32Array(Q), CQ = new Float32Array(Q);
  const CWD = (WX >> 3) + 2, CDD = (WZ >> 3) + 2, E8 = new Float32Array(CWD * CDD);
  for (let cz = 0; cz < CDD; cz++) for (let cx = 0; cx < CWD; cx++) E8[cx + cz * CWD] = elev0(Math.min(WX - 1, cx * 8), Math.min(WZ - 1, cz * 8));
  for (let qz = 0, q = 0; qz < QD; qz++) for (let qx = 0; qx < QW; qx++, q++) {
    const x = Math.min(WX - 1, qx * 4), z = Math.min(WZ - 1, qz * 4), i = z * WX + x;
    const cd = campDist(x, z);
    const c8 = qx >> 1, r8 = qz >> 1, fx = (qx & 1) * .5, fz = (qz & 1) * .5, k8 = c8 + r8 * CWD;
    const e0 = (E8[k8] * (1 - fx) + E8[k8 + 1] * fx) * (1 - fz) + (E8[k8 + CWD] * (1 - fx) + E8[k8 + CWD + 1] * fx) * fz;
    WQ[q] = sstep(dw[i] / 160);
    CQ[q] = sstep((cd - 34) / 260);
    EQ[q] = e0 * sstep(dw[i] / 220) * (.08 + .92 * sstep((cd - 34) / 320));
    TQ[q] = townId[i] ? 1 : 0;
  }
  const blur = (src, r, passes = 2) => {
    let a = Float32Array.from(src), b = new Float32Array(Q);
    for (let p = 0; p < passes; p++) {
      for (let z = 0; z < QD; z++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += a[z * QW + Math.max(0, Math.min(QW - 1, x))];
        for (let x = 0; x < QW; x++) {
          b[z * QW + x] = s / (2 * r + 1);
          s += a[z * QW + Math.min(QW - 1, x + r + 1)] - a[z * QW + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < QW; x++) {
        let s = 0;
        for (let z = -r; z <= r; z++) s += b[Math.max(0, Math.min(QD - 1, z)) * QW + x];
        for (let z = 0; z < QD; z++) {
          a[z * QW + x] = s / (2 * r + 1);
          s += b[Math.min(QD - 1, z + r + 1) * QW + x] - b[Math.max(0, z - r) * QW + x];
        }
      }
    }
    return a;
  };
  const EB = blur(EQ, 10);
  // A town sits on its own ground, levelled out over generations: Albion higher to the north, Esperance highest of all on the shoulder of
  // the mountain, the coast towns hardly above the water. Smaller places just follow the land.
  for (let qz = 0, q = 0; qz < QD; qz++) for (let qx = 0; qx < QW; qx++, q++) {
    const x = Math.min(WX - 1, qx * 4), z = Math.min(WZ - 1, qz * 4), t = TOWNS[townId[z * WX + x] - 1];
    TL[q] = t ? (t.lift ? t.lift(x, z) : EB[q]) * TQ[q] : 0;
  }
  const TB = blur(TQ, 15), LB = blur(TL, 15);
  const BQ = new Float32Array(Q);
  const TUN = [[2515, 1950], [2516, 2075], [2512, 2200]];
  for (let qz = 0, q = 0; qz < QD; qz++) for (let qx = 0; qx < QW; qx++, q++) {
    const x = qx * 4, z = qz * 4;
    let b = EB[q] * (1 - TB[q]) + LB[q];
    b *= WQ[q] * CQ[q];
    // The tunnel keeps its road low, and the approaches come down to meet it.
    const tk = sstep(1 - lineDist(x, z, TUN) / 160);
    BQ[q] = b * (1 - tk) + 6 * tk;
  }
  const sampleQ = (A, x, z) => {
    const fx = Math.max(0, Math.min(QW - 1.001, x / 4)), fz = Math.max(0, Math.min(QD - 1.001, z / 4));
    const ix = fx | 0, iz = fz | 0, ux = fx - ix, uz = fz - iz, q = ix + iz * QW;
    return (A[q] * (1 - ux) + A[q + 1] * ux) * (1 - uz) + (A[q + QW] * (1 - ux) + A[q + QW + 1] * ux) * uz;
  };
  const baseAt = (x, z) => sampleQ(BQ, x, z);

  tick('lie');
  // --- Roads --------------------------------------------------------------------------------------
  // mask: 0 none, 1 gravel shoulder, 2 sidewalk, 3 carriageway
  const mask = new Uint8Array(N);
  const deck = new Uint8Array(N);     // where a road is allowed to cross water on a bridge
  const tun = new Uint8Array(N);      // the Weston Tunnel
  const lat = new Uint8Array(N);      // 1: a park, 2: Meridian Square
  const dist = new Uint8Array(N), dist2 = new Uint8Array(N), dEdge = new Uint8Array(N);
  const roads = new Uint8Array(N);    // how many streets cross a cell: lane lines stop at the junctions
  const townCars = [];
  const hwy = new Uint8Array(N);     // what the highways laid down: 3 the carriageway, 1-2 its verges
  const nearMain = new Uint8Array(N);
  const DISTRICTS = [];
  const leaves = [];
  // Settlements built into a town take whole blocks of it: the streets go round them, not through them.
  const INTOWN = ['bryant', 'tompkins', 'tryon', 'battery'].map((k) => campRects[k]);
  TOWNS.forEach((t, ti) => {
    t.ds = t.districts.map(([n, x, z, zk]) => { const d = { n, x, z, zone: Z[zk], town: t }; DISTRICTS.push(d); d.id = DISTRICTS.length; return d; });
    const ds = t.ds, nd = ds.length;
    // The streets. The whole town is one block, split by a street, and each half split again, and again, until the blocks are the size
    // the neighbourhood builds them. Every street runs straight, north-south or east-west, from one street to another: the first few
    // cut across the town and are the wide ones, the later ones get narrower and shorter, and none of them line up with the street
    // across the way. Blocks come out every size, streets jog and end in T-junctions, and there is no grid to see.
    const rr = makeRng(seed + ti * 977);
    t.segs = [];
    const zoneNear = (x, z) => { let d = ds[0], b = Infinity; for (const q of ds) { const dd = (x - q.x) ** 2 + (z - q.z) ** 2; if (dd < b) { b = dd; d = q; } } return d.zone; };
    const anyTown = (x0, z0, x1, z1) => {
      for (let k = 0; k < 36; k++) { const x = Math.round(x0 + (x1 - x0) * ((k % 6) + .5) / 6), z = Math.round(z0 + (z1 - z0) * (((k / 6) | 0) + .5) / 6); if (townId[cellOf(x, z)] === ti + 1) return true; }
      return false;
    };
    const split = (x0, z0, x1, z1, depth, wN, wS, wW, wE) => {
      if (!anyTown(x0, z0, x1, z1)) return;
      const zone = zoneNear((x0 + x1) / 2, (z0 + z1) / 2), jit = .45 + r2(x0 * 7 + z1, z0 * 3 + x1) * .9, A = zone.blk[0] * jit, B = zone.blk[1] * jit;
      const w = x1 - x0, d = z1 - z0;
      const leaf = () => leaves.push({ t, ti, x0, z0, x1, z1, wN, wS, wW, wE, zone, ix0: x0 + (wW >> 1) + 5, ix1: x1 - (wE >> 1) - 5, iz0: z0 + (wN >> 1) + 5, iz1: z1 - (wS >> 1) - 5 });
      const canV = w > A * 1.45, canH = d > B * 1.45;
      // Now and then a big block is left whole: a yard, a campus, a square of grass nobody built on.
      if (depth >= 4 && w < A * 2.2 && d < B * 2.2 && rr() < .1 && !(t.joins || []).some(([fv, fp]) => (fv ? fp > x0 + 34 && fp < x1 - 34 : fp > z0 + 34 && fp < z1 - 34))) { leaf(); return; }
      let forced = null;
      for (const [fv, fp] of t.joins || []) {
        if (fv ? !(fp > x0 + 34 && fp < x1 - 34) : !(fp > z0 + 34 && fp < z1 - 34)) continue;
        const dc = Math.abs(fp - (fv ? (x0 + x1) / 2 : (z0 + z1) / 2));
        if (!forced || dc < forced.dc) forced = { fv, fp, dc };
      }
      if (!canV && !canH && !forced) { leaf(); return; }
      const vert = forced ? forced.fv : canV && (!canH || (w / A) * (.75 + rr() * .5) > d / B);
      const sw = zone.rural ? (forced || depth < 2 ? 14 : 10) : forced || depth < 2 ? 18 : depth < 4 ? 14 : zone.house ? 10 : 12;
      const lo = vert ? x0 : z0, ext = vert ? w : d, tgt = vert ? A : B;
      const k = Math.max(2, Math.round(ext / tgt)), m = Math.max(1, Math.min(k - 1, Math.round(k * (.3 + rr() * .4))));
      let p = forced ? forced.fp : Math.round(lo + ext * m / k + (rr() - .5) * 12);
      if (!forced) for (const c of INTOWN) {
        const a0 = vert ? c.x0 : c.z0, a1 = vert ? c.x1 : c.z1, b0 = vert ? c.z0 : c.x0, b1 = vert ? c.z1 : c.x1, s0 = vert ? z0 : x0, s1 = vert ? z1 : x1;
        if (b1 < s0 || b0 > s1) continue;
        const pad = 14 + (sw >> 1);
        if (p > a0 - pad && p < a1 + pad) p = p - a0 < a1 - p ? a0 - pad : a1 + pad;
      }
      if (p - lo < 34 || lo + ext - p < 34) { leaf(); return; }
      t.segs.push({ v: vert, p, a0: vert ? z0 : x0, a1: vert ? z1 : x1, w: sw, e0: vert ? wN : wW, e1: vert ? wS : wE, depth, forced: !!forced });
      if (vert) { split(x0, z0, p, z1, depth + 1, wN, wS, wW, sw); split(p, z0, x1, z1, depth + 1, wN, wS, sw, wE); }
      else { split(x0, z0, x1, p, depth + 1, wN, sw, wW, wE); split(x0, p, x1, z1, depth + 1, sw, wS, wW, wE); }
    };
    split(t.x0, t.z0, t.x1, t.z1, 0, 0, 0, 0, 0);
    // A block is in the town or it is not. The edge of a town is the edge of its last blocks and the street round them: never a line
    // through the middle of somebody's house.
    const mine = leaves.filter((L) => L.ti === ti);
    for (const L of mine) {
      let n = 0;
      for (let k = 0; k < 9; k++) if (townId[cellOf(L.x0 + (L.x1 - L.x0) * ((k % 3) + .5) / 3, L.z0 + (L.z1 - L.z0) * (((k / 3) | 0) + .5) / 3)] === ti + 1) n++;
      L.inTown = n >= 5;
    }
    for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0, i = z * WX + x; x <= t.x1; x++, i++) if (townId[i] === ti + 1) townId[i] = 0;
    for (const L of mine) {
      if (!L.inTown) continue;
      for (let z = Math.max(0, L.z0 - (L.wN >> 1) - 4); z <= Math.min(WZ - 1, L.z1 + (L.wS >> 1) + 4); z++) for (let x = Math.max(0, L.x0 - (L.wW >> 1) - 4); x <= Math.min(WX - 1, L.x1 + (L.wE >> 1) + 4); x++) {
        const i = z * WX + x;
        if (!townId[i]) townId[i] = ti + 1;
      }
    }
    // Neighbourhoods give a place its character. They have no edges you can see: near where one meets the next, the buildings mix.
    const inv = new Float64Array(nd * nd), DD = new Float64Array(nd);
    for (let a = 0; a < nd; a++) for (let b = 0; b < nd; b++) if (a !== b) inv[a * nd + b] = 1 / (2 * Math.hypot(ds[a].x - ds[b].x, ds[a].z - ds[b].z));
    for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0; x <= t.x1; x++) {
      const i = z * WX + x;
      if (townId[i] !== ti + 1) continue;
      let bi = 0, best = Infinity;
      for (let k = 0; k < nd; k++) { const q = ds[k], dd = (x - q.x) * (x - q.x) + (z - q.z) * (z - q.z); DD[k] = dd; if (dd < best) { best = dd; bi = k; } }
      let e = 255, b2 = bi;
      for (let k = 0; k < nd; k++) { if (k === bi) continue; const ed = (DD[k] - best) * inv[bi * nd + k]; if (ed < e) { e = ed; b2 = k; } }
      dist[i] = ds[bi].id; dist2[i] = ds[b2].id; dEdge[i] = Math.min(255, Math.round(e));
    }
    // Out where the houses are, a big block gets a cul-de-sac into the middle of it, with a turning circle at the end.
    for (const L of mine) {
      if (!L.inTown || !L.zone.house || L.zone.rural) continue;
      const iw = L.ix1 - L.ix0, ih = L.iz1 - L.iz0;
      if (Math.max(iw, ih) < 84 || Math.min(iw, ih) < 56 || rr() > .65) continue;
      const vert = iw < ih ? false : true;
      const p = vert ? (L.x0 + L.x1) >> 1 : (L.z0 + L.z1) >> 1, a0 = vert ? L.z0 : L.x0, a1 = Math.round(a0 + (vert ? L.z1 - L.z0 : L.x1 - L.x0) * .6);
      t.segs.push({ v: vert, p, a0, a1, w: 10, e0: vert ? L.wN : L.wW, e1: 0, depth: 9, cul: true });
      const ex = vert ? p : a1, ez = vert ? a1 : p;
      for (let z = ez - 14; z <= ez + 14; z++) for (let x = ex - 14; x <= ex + 14; x++) {
        const dd = Math.hypot(x - ex, z - ez), i = z * WX + x;
        if (dd > 13 || townId[i] !== ti + 1) continue;
        const v = dd <= 9 ? 3 : 2;
        if (v > mask[i]) mask[i] = v;
        if (v === 3 && !roads[i]) roads[i] = 1;
      }
    }
    const busy = t.key === 'albion' ? 1 : .6;
    for (const s of t.segs) {
      const hw = s.w >> 1, deckOK = t.key === 'albion' && s.w >= 14;
      s.name = STREET_POOL[h2(ti * 977 + s.p, s.v ? 3 : 7) % STREET_POOL.length] + (s.depth < 2 ? (s.v ? ' Ave' : ' Blvd') : s.v ? (s.w <= 10 ? ' Ln' : ' Ave') : (s.w <= 10 ? ' Rd' : ' St'));
      const SL = s.a1 - s.a0 + 1, inT = new Uint8Array(SL), fwd = new Int32Array(SL), back = new Int32Array(SL);
      for (let k = 0; k < SL; k++) { const x = s.v ? s.p : s.a0 + k, z = s.v ? s.a0 + k : s.p; inT[k] = inside(x, z) && townId[z * WX + x] === ti + 1 ? 1 : 0; }
      for (let k = 0, last = -1e6; k < SL; k++) { if (inT[k]) last = k; fwd[k] = k - last; }
      for (let k = SL - 1, last = 1e6; k >= 0; k--) { if (inT[k]) last = k; back[k] = last - k; }
      const ext0 = 12 + Math.floor(r2(s.p * 3 + ti, 17) * 64), ext1 = 12 + Math.floor(r2(s.p * 5 + ti, 29) * 64);
      let br = null;
      if (s.forced) {
        const wet = (k) => { const x = s.v ? s.p : s.a0 + k, z = s.v ? s.a0 + k : s.p; return inside(x, z) && !land[z * WX + x]; };
        for (let k = 0; k < SL;) {
          if (!wet(k)) { k++; continue; }
          let e = k;
          while (e < SL && wet(e)) e++;
          if (k > 0 && e < SL && e - k <= 260 && inT[k - 1] && inT[e]) { br = br || new Uint8Array(SL); for (let q = Math.max(0, k - 28); q < Math.min(SL, e + 28); q++) br[q] = 1; }
          k = e;
        }
      }
      for (let a = s.a0; a <= s.a1; a++) for (let c = s.p - hw - 4; c <= s.p + hw + 4; c++) {
        const k = a - s.a0;
        if (!inT[k] && fwd[k] > ext1 && back[k] > ext0) continue;
        const x = s.v ? c : a, z = s.v ? a : c;
        if (!inside(x, z)) continue;
        const i = z * WX + x;
        if (townId[i] !== ti + 1) {
          if (townId[i] || !land[i] || dw[i] < 24 || campDist(x, z) < 16) continue;
          const v = Math.abs(c - s.p) <= hw ? 3 : Math.abs(c - s.p) <= hw + 3 ? 1 : 0;
          const side = fwd[k] < back[k] ? 1 : 0, st = (s.stub || (s.stub = [{ cells: [], cent: [], side: 0 }, { cells: [], cent: [], side: 1 }]))[side];
          if (v > mask[i]) { st.cells.push(i, mask[i], a); mask[i] = v; }
          if (c === s.p) st.cent.push(i, a);
          continue;
        }
        const dk = deckOK || (br && br[k]);
        if (!dk && dw[i] < 24) continue;
        const v = Math.abs(c - s.p) <= hw ? 3 : 2;
        if (v > mask[i]) mask[i] = v;
        if (v === 3 && roads[i] < 255) roads[i]++;
        if (dk) deck[i] = 1;
      }
      // Beside a main street the waterfront drive gives way to it: no second road squeezed in between it and the water.
      if (s.forced) for (let a = s.a0; a <= s.a1; a++) for (let c = s.p - hw - 26; c <= s.p + hw + 26; c++) {
        const x = s.v ? c : a, z = s.v ? a : c;
        if (inside(x, z)) nearMain[z * WX + x] = 1;
      }
    }
    // A waterfront drive along every shore in town, coast, lake or river: a promenade by the water, the drive behind it, and the streets
    // coming down to meet it. Nothing runs off the end of the land.
    for (let z = t.z0; z <= t.z1; z++) for (let x = t.x0, i = z * WX + x; x <= t.x1; x++, i++) {
      if (townId[i] !== ti + 1 || !land[i]) continue;
      const e = dw[i];
      if (e < 9 || e > 27 || nearMain[i] || campDist(x, z) < 12) continue;
      const v = e >= 12 && e <= 22 ? 3 : 2;
      if (v > mask[i]) mask[i] = v;
      if (v === 3) { if (roads[i] < 255) roads[i]++; if (e === 17 && (x + z) % 9 < 5) mark[i] = 2; }
    }
    // Lane lines and crossings, where a street meets the one it runs into; and the cars left along the kerbs.
    for (const s of t.segs) {
      const hw = s.w >> 1, lane = !zoneNear(s.v ? s.p : (s.a0 + s.a1) >> 1, s.v ? (s.a0 + s.a1) >> 1 : s.p).rural || s.w >= 14;
      for (let a = s.a0; a <= s.a1; a++) {
        const near0 = a - s.a0 <= s.a1 - a, e = near0 ? s.e0 : s.e1, din = near0 ? a - s.a0 - (e >> 1) : s.a1 - a - (e >> 1);
        for (let c = s.p - hw; c <= s.p + hw; c++) {
          const x = s.v ? c : a, z = s.v ? a : c;
          if (!inside(x, z)) continue;
          const i = z * WX + x;
          if (townId[i] !== ti + 1 || roads[i] !== 1) continue;
          let mk = 0;
          if (lane && e && din >= 2 && din <= 5) mk = c & 1 ? 0 : 3;
          else if (lane && c === s.p && s.w >= 14 && a % 9 < 5) mk = s.w >= 18 ? 1 : 2;
          if (mk) mark[i] = mk;
        }
      }
      const lanes = s.w >= 18 ? [-hw + 3, -3, 3, hw - 3] : [-hw + 3, hw - 3];
      for (let a = s.a0 + (s.e0 >> 1) + 12; a < s.a1 - (s.e1 >> 1) - 26; a += 20) for (const ln of lanes) {
        if (r2(ti * 7 + s.p * 3 + ln, a) < (lane ? .2 : .07) * busy) townCars.push(s.v ? s.p + ln - 2 : a, s.v ? a : s.p + ln - 2, s.v ? 0 : 1, r2(a, s.p + ln));
      }
    }
  });
  // A block for something in particular: the one at a spot, or the nearest one to it nobody has had yet.
  const usedLeaf = new Set();
  const leafFor = (x, z, min = 30) => {
    let best = null, bd = Infinity;
    for (const L of leaves) {
      if (!L.inTown || usedLeaf.has(L) || L.ix1 - L.ix0 < min || L.iz1 - L.iz0 < min) continue;
      const within = x >= L.x0 && x <= L.x1 && z >= L.z0 && z <= L.z1;
      const dd = within ? -1 : ((L.ix0 + L.ix1) / 2 - x) ** 2 + ((L.iz0 + L.iz1) / 2 - z) ** 2;
      if (dd < bd) { bd = dd; best = L; }
    }
    usedLeaf.add(best);
    return best;
  };
  const inLeaf = (L, w, h) => {
    const cx = (L.ix0 + L.ix1) >> 1, cz = (L.iz0 + L.iz1) >> 1, hw = Math.min(w, L.ix1 - L.ix0 - 6) >> 1, hh = Math.min(h, L.iz1 - L.iz0 - 6) >> 1;
    return { x0: cx - hw, x1: cx + hw, z0: cz - hh, z1: cz + hh };
  };
  // Parks: a whole block each, kept as grass. Meridian Square: a block in the middle of Albion, paved over.
  const PARK_DEFS = [['Founders Green', 900, 820], ['Northgate Gardens', 760, 330], ['Pagefoot Park', 1120, 1200], ['Esperance Common', 950, 3410], ['Cooper Square', 4450, 1230],
    ['Carousel Park', 4070, 2800], ['Weston Green', 2330, 2450], ['Bayfront Park', 4350, 3400]];
  const SQL = leafFor(1180, 840, 50);
  const parkLeaves = PARK_DEFS.map(([pn, x, z]) => { const L = leafFor(x, z); L.park = pn; return L; });
  for (const L of [SQL, ...parkLeaves]) {
    const f = L === SQL ? 2 : 1;
    for (let z = L.iz0 - (f === 2 ? 5 : 0); z <= L.iz1 + (f === 2 ? 5 : 0); z++) for (let x = L.ix0 - (f === 2 ? 5 : 0); x <= L.ix1 + (f === 2 ? 5 : 0); x++) if (inside(x, z) && !roads[z * WX + x]) lat[z * WX + x] = f;
  }

  const lineMarks = [];
  const wander = (pts, seedw) => {
    const out = [pts[0]];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], len = Math.hypot(bx - ax, bz - az);
      // The first and last stretch are how the road comes into a town: those stay straight.
      // Nor does a stretch through a town, where the road is the town's own main street.
      if (k === 0 || k === pts.length - 2 || len < 220 || townId[cellOf((ax + bx) / 2, (az + bz) / 2)] || townId[cellOf(ax * .8 + bx * .2, az * .8 + bz * .2)] || townId[cellOf(ax * .2 + bx * .8, az * .2 + bz * .8)]) { out.push(pts[k + 1]); continue; }
      const n = Math.max(2, Math.round(len / 150)), nx = -(bz - az) / len, nz = (bx - ax) / len, amp = Math.min(70, len * .09);
      for (let s = 1; s < n; s++) {
        const t = s / n, off = (noise2(seedw * 3.7 + k * 1.3, s * .8) - .5) * 2 * amp * Math.sin(t * Math.PI);
        out.push([ax + (bx - ax) * t + nx * off, az + (bz - az) * t + nz * off]);
      }
      out.push(pts[k + 1]);
    }
    return out;
  };
  let wanderSeed = 0;
  const stampLine = (pts, w, { walk = false, bridge = true, line = true, smooth = 2, wind = false } = {}) => {
    const path = smooth ? chaikinOpen(wind ? wander(pts, ++wanderSeed) : pts, smooth) : pts;
    const hw = w / 2, hs = hw + (walk ? 4 : 3);
    eachNear(path, hs, (i, d, along) => {
      const v = d <= hw ? 3 : walk || townId[i] ? 2 : 1;
      if (v > mask[i]) mask[i] = v;
      if (v > hwy[i]) hwy[i] = v;
      if (bridge) deck[i] = 1;
      if (line && d < .75 && (along % 11) < 6) lineMarks.push(i);
    });
    return path;
  };
  // The highways, as the state map has them.
  const HW = 16;
  const highways = {
    north: stampLine([[2390, 310], [2510, 310], [2590, 240], [2650, 180], [3733, 114], [3929, 82], [4059, 98], [4160, 125], [4210, 185], [4210, 300]], HW, { wind: true }),
    gibson: stampLine(GIBSON_ROAD, HW),
    coast: stampLine([[4600, 1900], [4600, 2000], [4665, 2123], [4690, 2286], [4600, 2470], [4420, 2560], [4330, 2610], [4320, 2700]], HW, { wind: true }),
    albionSouth: stampLine([[2386, 1520], [2386, 1610], [2430, 1690], [2500, 1800], [2515, 1880], [2515, 1950]], HW),
    trinity: stampLine([[2428, 1680], [3553, 1640], [3576, 1764], [3765, 1790]], 10, { line: false, wind: true }),
    weston: stampLine([[2512, 2200], [2510, 2236], [2440, 2246], [2360, 2240], [2330, 2262], [2330, 2310]], HW),
    south: stampLine([[2330, 2700], [2330, 2800], [2280, 2900], [2230, 2980], [2210, 3270], [2190, 3530]], HW, { wind: true }),
    southern: stampLine([[0, 3560], [300, 3550], [392, 3544], [1480, 3544], [1920, 3540], [2190, 3530], [2443, 3460], [3500, 3300], [3590, 3215], [3640, 3200], [3740, 3200]], HW, { wind: true }),
    west: stampLine([[441, 1660], [441, 1760], [408, 1850], [408, 1960], [400, 2200], [392, 2286], [425, 2548], [653, 2711], [760, 2770], [760, 2900]], HW, { wind: true }),
    westpoint: stampLine([[400, 2215], [300, 2215], [196, 2230], [0, 2290]], HW, { wind: true }),
    // Two roads out of Albion to the north, off the edge of the map: the old turnpike off the ring road, and the river road on the east bank.
    turnpike: stampLine([[327, 196], [322, 120], [334, 0]], HW, { smooth: 1 }),
    riverRoad: stampLine([[2390, 310], [2392, 170], [2378, 0]], HW, { smooth: 1 }),
    ring: stampLine([[620, 190], [327, 196], [245, 457], [261, 817], [376, 1078], [425, 1372], [441, 1660]], 14),
    page: stampLine([[408, 1800], [653, 1830], [880, 1990]], 10, { line: false, wind: true }),
    arnhem: stampLine([[2190, 3530], [2180, 3700], [2200, 3900], [2500, 3920], [3820, 3890]], 10, { line: false, wind: true }),
  };
  const OCEAN_DRIVE = stampLine(px([[1086, 845], [1102, 915], [1125, 1000], [1144, 1065]]), 14, { walk: true, bridge: false });
  // Two causeways out across the lagoon to the Strand: from the mainland's last street, over the water, to Ocean Drive.
  for (const cz of [2905, 3200]) {
    let x = coastX[cz] - 60;
    while (x < WX - 1 && land[cz * WX + x] === 1) x++;
    while (x < WX - 1 && land[cz * WX + x] !== 1) x++;
    let e = x;
    while (e < WX - 1 && mask[cz * WX + e] !== 3) e++;
    highways['cause' + cz] = stampLine([[coastX[cz] - 70, cz], [e + 4, cz]], 14, { walk: true, smooth: 0 });
  }
  // A street that runs on out of town stops short where a highway comes in: the highway is the way out, and a stub of street beside it or
  // across it only looks like a mistake.
  // Where it meets the highway it stops there; where it only runs alongside, it goes altogether.
  const hwyWithin = (i, r) => {
    const x = i % WX, z = (i / WX) | 0;
    for (let dz = -r; dz <= r; dz += 2) for (let dx = -r; dx <= r; dx += 2) { const xx = x + dx, zz = z + dz; if (inside(xx, zz) && hwy[zz * WX + xx] === 3) return true; }
    return false;
  };
  for (const t of TOWNS) for (const s of t.segs || []) for (const st of s.stub || []) {
    if (!st.cent.length) continue;
    // From the town outward.
    const cent = [];
    for (let q = 0; q < st.cent.length; q += 2) cent.push([st.cent[q], st.cent[q + 1]]);
    cent.sort((p, q) => (st.side ? p[1] - q[1] : q[1] - p[1]));
    let meet = null, near = false;
    for (const [i, a] of cent) {
      if (hwyWithin(i, 4)) { meet = a; break; }
      if (!near && hwyWithin(i, 24)) near = true;
    }
    if (meet === null && !near) continue;
    for (let q = 0; q < st.cells.length; q += 3) {
      const i = st.cells[q], a = st.cells[q + 2];
      if (meet !== null && (st.side ? a <= meet : a >= meet)) continue;
      mask[i] = Math.max(st.cells[q + 1], hwy[i]);
    }
  }
  // The tunnel under the ridge between Albion and Weston: the road keeps its level and the hill goes over the top.
  eachNear(TUN, 8, (i, d, along) => {
    if (d > 7.5) return;
    mask[i] = 3; tun[i] = 1;
    if (d < .75 && (along % 11) < 6) lineMarks.push(i);
  });
  // A short way from each gate to the road it faces, where there is one close by.
  for (const def of CAMP_DEFS) {
    const r = campRects[def.key], px0 = r.plazaX ?? ((r.x0 + r.x1) >> 1), pz0 = r.plazaZ ?? ((r.z0 + r.z1) >> 1);
    for (const side of def.gates) {
      const dx = side === 'E' ? 1 : side === 'W' ? -1 : 0, dz = side === 'S' ? 1 : side === 'N' ? -1 : 0;
      let x = side === 'E' ? r.x1 + 10 : side === 'W' ? r.x0 - 10 : px0, z = side === 'S' ? r.z1 + 10 : side === 'N' ? r.z0 - 10 : pz0;
      const sx = x, sz = z;
      let hit = false;
      for (let k = 0; k < 170 && inside(x, z); k++, x += dx, z += dz) {
        const i = z * WX + x;
        if (!land[i]) break;
        if (mask[i] >= 2) { hit = true; break; }
      }
      if (hit) stampLine([[sx - dx * 12, sz - dz * 12], [x, z]], 10, { line: false, smooth: 0, bridge: false });
    }
  }

  tick('streets');
  // --- Ground classes -----------------------------------------------------------------------------
  // The edges of some towns are country already: farmhouses on big lots, paddocks and barns, the way Weston builds, inside the town's
  // own bounds. Gibson Valley is all of it; Esperance all round; Dayton and Severn Bay on the side that faces inland.
  const townEdge = chamfer((i) => !townId[i]);
  const OUTSKIRTS = { gibson: [255, () => true], esperance: [120, () => true], dayton: [110, (x) => x < 4330], severn: [120, (x) => x < 3760] };
  const outskirt = (i, x, z) => {
    const t = townId[i] && TOWNS[townId[i] - 1], o = t && OUTSKIRTS[t.key];
    return !!o && o[1](x, z) && townEdge[i] < o[0] * (.65 + .7 * noise2(x * .008 + 11, z * .008));
  };
  const fieldAt = (x, z) => {
    const k = Math.max(farmK(x, z) * 1.7, sstep(1 - Math.hypot((x - 3290) / 260, (z - 700) / 170)));
    return k + (fbm2(x * .006, z * .006 + 3, 2) - .5) * .9 > .55;
  };
  // The fields are laid out in sections a quarter-mile or so across, with a track round each; a section is one big field, or split into
  // two, three or four, so the country is a patchwork of every size rather than a chequerboard. Whether a field is ploughed is down to its
  // own middle, so the farmland's edge goes field by field. Returns 0 off the fields, -1 on a track, 1-6 for a crop, 7 for pasture.
  const SW = 276, SD = 198, SECW = Math.ceil((WX + 30) / SW) + 1, SECD = Math.ceil((WZ + 800) / SD) + 1;
  const fieldMemo = new Int8Array(SECW * SECD * 16).fill(-1);
  const CROPS = [1, 1, 2, 2, 2, 3, 4, 6, 6, 7, 7, 5, 1, 6];
  const fieldCell = (x, z) => {
    const fx = x + 30, sx = Math.floor(fx / SW), sz = Math.floor(z / SD), lx = fx - sx * SW, lz = z - sz * SD;
    const a = r2(sx * 7 + 1, sz * 11 + 5), b = r2(sx * 3 + 9, sz * 5 + 2), c = r2(sx * 13 + 4, sz * 17 + 8), t = Math.floor(a * 6);
    const v0 = t === 1 || t === 3 ? (.3 + b * .4) * SW : t === 4 ? (.26 + b * .12) * SW : 0, v1 = t === 4 ? (.6 + c * .12) * SW : 0;
    const h0 = t === 2 || t === 3 || t === 5 ? (.3 + c * .4) * SD : 0;
    const ix = v0 && lx >= v0 ? (v1 && lx >= v1 ? 2 : 1) : 0, iz = h0 && lz >= h0 ? 1 : 0;
    const key = ((sz * SECW + sx) * 4 + ix) * 4 + iz;
    let on = sx >= 0 && sz >= 0 && sx < SECW && sz < SECD ? fieldMemo[key] : -1;
    if (on < 0) {
      const xa = ix === 0 ? 0 : ix === 1 ? v0 : v1, xb = ix === 0 ? (v0 || SW) : ix === 1 ? (v1 || SW) : SW, za = iz ? h0 : 0, zb = iz || !h0 ? SD : h0;
      const wx0 = sx * SW - 30 + xa, wx1 = sx * SW - 30 + xb, wz0 = sz * SD + za, wz1 = sz * SD + zb;
      on = fieldAt((wx0 + wx1) / 2, (wz0 + wz1) / 2) ? 1 : 0;
      // Nobody ploughs right up to a settlement's wall: a field that would is left as grass.
      for (const k in campRects) { const r = campRects[k]; if (wx1 > r.x0 - 40 && wx0 < r.x1 + 40 && wz1 > r.z0 - 40 && wz0 < r.z1 + 40) on = 0; }
      if (sx >= 0 && sz >= 0 && sx < SECW && sz < SECD) fieldMemo[key] = on;
    }
    if (!on) return 0;
    if (lx < 3 || lz < 3 || (v0 && Math.abs(lx - v0) < 1.5) || (v1 && Math.abs(lx - v1) < 1.5) || (h0 && Math.abs(lz - h0) < 1.5)) return -1;
    return CROPS[Math.floor(r2(key * 7 + 3, key * 13 + 1) * CROPS.length)];
  };
  for (let z = 0, i = 0; z < WZ; z++) for (let x = 0; x < WX; x++, i++) {
    const m = mask[i];
    if (!land[i]) {
      if (m >= 2 && deck[i]) { ground[i] = m === 3 ? G.ROAD : G.WALK; mark[i] = 16; } else ground[i] = G.WATER;
      continue;
    }
    if (land[i] === 2) { ground[i] = Math.hypot(x - LIGHT.x, z - LIGHT.z) < 25 ? G.PLAZA : G.ROCK; continue; }
    // The marsh islands are left to the reeds: no street goes onto one unless it is on its way across.
    if (land[i] === 3 && !(m === 3 && deck[i])) { ground[i] = G.PARK; continue; }
    if (m === 3) { ground[i] = G.ROAD; continue; }
    const d = dw[i];
    if (townId[i] && land[i] !== 3) {
      // A town meets its water with a boardwalk; everything else is a lot until something claims it.
      const rural = (dist[i] && DISTRICTS[dist[i] - 1].zone.rural) || outskirt(i, x, z);
      ground[i] = d < 7 ? G.PROM : m === 2 || d < 10 ? (rural ? G.DIRT : G.WALK) : G.LOT;
      continue;
    }
    if (m === 2) { ground[i] = G.WALK; continue; }
    if (m === 1) { ground[i] = G.DIRT; continue; }
    if (x > coastX[z] - 180 && d < 24 + noise2(x * .02, z * .02) * 14) { ground[i] = G.SAND; continue; }
    if (x > coastX[z] && land[i] === 1 && (z > 3560 || d < 22 + noise2(x * .03, z * .03) * 10)) { ground[i] = G.SAND; continue; }
    if (land[i] !== 3 && d > 14) {
      // Beans, corn, cotton, peanuts, somebody's tomatoes, cut hay, and pasture left as grass.
      const fc = fieldCell(x, z);
      if (fc < 0) { ground[i] = G.DIRT; continue; }
      if (fc > 0 && fc < 7) { ground[i] = G.FIELD; mark[i] = fc; continue; }
    }
    ground[i] = G.PARK;
  }
  for (const i of lineMarks) if (ground[i] === G.ROAD) mark[i] = (mark[i] & 48) | 1;
  // --- Parks, squares and the waterfront -----------------------------------------------------------
  const fillGround = (r, g, only) => {
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0, i = z * WX + x; x <= r.x1; x++, i++) {
      if (ground[i] === G.WATER || (only && !only(ground[i]))) continue;
      ground[i] = g; mark[i] = 0;
    }
  };
  for (let i = 0; i < N; i++) {
    const f = lat[i];
    if (!f || ground[i] === G.WATER) continue;
    if (f === 1) { ground[i] = G.PARK; mark[i] = 0; } else if (ground[i] === G.ROAD || ground[i] === G.WALK) { ground[i] = G.PLAZA; mark[i] = 0; }
  }
  const SQ = { x: (SQL.ix0 + SQL.ix1) >> 1, z0: SQL.iz0, z1: SQL.iz1 };
  // Piers: Dayton's working harbour, the pleasure pier off the Strand, and the marina in the bay.
  const piers = [];
  const pier = (x, z, dx, dz, len, half) => {
    for (let s = 0; s <= len; s++) for (let o = -half; o <= half; o++) {
      const px2 = x + dx * s + dz * o, pz = z + dz * s + dx * o;
      if (inside(px2, pz) && !land[pz * WX + px2]) { ground[pz * WX + px2] = G.PROM; mark[pz * WX + px2] = 16; }
    }
    piers.push({ x: x + dx * len, z: z + dz * len });
  };
  for (const pz of [1240, 1290, 1340]) { let x = 4420; while (x < WX - 2 && land[pz * WX + x]) x++; pier(x - 2, pz, 1, 0, 46, 5); }
  let PLEASURE = null;
  {
    // Out across the lagoon to the barrier, over it to its seaward shore: the pier starts there. A boardwalk crosses the sand to it from
    // Ocean Drive.
    const pz = 3050, row = pz * WX;
    let x = coastX[pz];
    while (x < WX - 2 && land[row + x] !== 1) x++;
    while (x < WX - 2 && land[row + x]) x++;
    pier(x - 2, pz, 1, 0, 110, 6);
    PLEASURE = { x: x + 40, z: pz };
    let r = x - 3;
    while (r > x - 160 && mask[row + r] !== 3) r--;
    if (mask[row + r] === 3) for (let dz = -4; dz <= 4; dz++) for (let bx = r + 8; bx < x; bx++) { const i = (pz + dz) * WX + bx; if (land[i] && mask[i] !== 3) { ground[i] = G.PROM; mark[i] = 0; } }
  }
  for (const mx of [4360, 4420, 4480]) { let z = 3420; while (z < WZ - 2 && land[z * WX + mx]) z++; pier(mx, z - 2, 0, 1, 50, 3); }

  tick('ground');
  // --- Camps -------------------------------------------------------------------------------------
  // Each camp is a walled compound. Everything inside the wall is cleared except the roads, which survive as the settlement's streets.
  const campMask = new Uint8Array(N);
  const filled = {};
  const GREEN = { sheep: 1, wash: 1, tryon: 1, union: 1, morning: 1, battery: 1, tompkins: 1, garvey: 1 };
  for (const def of CAMP_DEFS) {
    const r = campRects[def.key];
    for (let z = r.z0 - 8; z <= r.z1 + 8; z++) for (let x = r.x0 - 8; x <= r.x1 + 8; x++) {
      const i = z * WX + x;
      campMask[i] = 1;
      const g = ground[i];
      // Part of the compound that ran out over the water has been filled in, with whatever there was lying around.
      if (g === G.WATER) { ground[i] = G.CAMP; mark[i] = 0; filled[def.key] = 1; continue; }
      const band = x < r.x0 + 8 || x > r.x1 - 8 || z < r.z0 + 8 || z > r.z1 - 8;
      if (g === G.ROAD || g === G.WALK) { if (band) { ground[i] = G.CAMP; mark[i] = 0; } else mark[i] &= 15; continue; }
      mark[i] = 0;
      ground[i] = !band && GREEN[def.key] && g !== G.LOT ? G.PARK : G.CAMP;
    }
  }
  // The fill slumps away into the water on its outer edge instead of ending in a clean cut.
  const SLOPE = 7;
  const rubble = [];
  for (const def of CAMP_DEFS) {
    const r = campRects[def.key], m = 8;
    if (!filled[def.key]) continue;
    for (let z = r.z0 - m - SLOPE; z <= r.z1 + m + SLOPE; z++) for (let x = r.x0 - m - SLOPE; x <= r.x1 + m + SLOPE; x++) {
      if (!inside(x, z)) continue;
      const i = z * WX + x;
      if (ground[i] !== G.WATER) continue;
      const d = Math.max(r.x0 - m - x, x - r.x1 - m, r.z0 - m - z, z - r.z1 - m);
      rubble.push(i, d);
    }
  }
  const camps = CAMP_DEFS.map((def, id) => planCamp(def, id, campRects[def.key], ground));
  // Trodden dirt where everybody walks: in at each gate, down the market's aisles to the square, and on to the hall and the fields.
  // The way is the one the people take, round the stalls and sheds, and it goes straight wherever it can rather than wandering.
  for (const c of camps) {
    const NW = c.navW, ND = c.navD, nav = c.nav, n = NW * ND;
    const cellOf2 = (x, z) => Math.max(0, Math.min(NW - 1, Math.floor((x - c.x0) / 2))) + Math.max(0, Math.min(ND - 1, Math.floor((z - c.z0) / 2))) * NW;
    // Five wide, centred on a block, and on the same blocks as the market's own middle line, so a path down an avenue runs dead
    // centre between the stall fronts.
    const ax0 = c.spots.plaza ? Math.floor(c.spots.plaza.x) : c.cx, az0 = c.spots.plaza ? Math.floor(c.spots.plaza.z) : c.cz;
    const paintAt = (x, z) => {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const i = (z + dz) * WX + x + dx;
        if (ground[i] === G.CAMP || ground[i] === G.PARK) { ground[i] = G.DIRT; mark[i] = 0; }
      }
    };
    const paint = (x, z) => paintAt(x + ((ax0 - x) & 1), z + ((az0 - z) & 1));
    const route = (ax, az, bx, bz) => {
      const s = cellOf2(ax, az), t = cellOf2(bx, bz);
      const cost = new Int32Array(n * 4).fill(1 << 30), prev = new Int32Array(n * 4).fill(-1), buckets = [];
      const push = (k, d) => { (buckets[d] || (buckets[d] = [])).push(k); };
      for (let dir = 0; dir < 4; dir++) { cost[s * 4 + dir] = 0; push(s * 4 + dir, 0); }
      const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
      let end = -1;
      for (let d = 0; d < buckets.length && end < 0; d++) {
        const b = buckets[d];
        if (!b) continue;
        for (let q = 0; q < b.length; q++) {
          const k = b[q];
          if (cost[k] !== d) continue;
          const cell = k >> 2, dir = k & 3;
          if (cell === t) { end = k; break; }
          const cx = cell % NW, cz = (cell / NW) | 0;
          for (let nd = 0; nd < 4; nd++) {
            const nx = cx + DX[nd], nz = cz + DZ[nd];
            if (nx < 1 || nz < 1 || nx >= NW - 1 || nz >= ND - 1) continue;
            const nc = nx + nz * NW;
            if (nav[nc] && nc !== t) continue;
            const nk = nc * 4 + nd, nd2 = d + 1 + (nd === dir ? 0 : 4);
            if (nd2 < cost[nk]) { cost[nk] = nd2; prev[nk] = k; push(nk, nd2); }
          }
        }
      }
      for (let k = end; k >= 0; k = prev[k]) { const cell = k >> 2; paint(c.x0 + (cell % NW) * 2, c.z0 + ((cell / NW) | 0) * 2); }
      return end >= 0;
    };
    const { plaza, market, hq, field } = c.spots;
    for (const g of c.gates) {
      const inX = g.horiz ? 0 : g.side === 'W' ? 1 : -1, inZ = g.horiz ? (g.side === 'N' ? 1 : -1) : 0;
      // From just inside the gate: nothing is trodden out past it.
      for (let k = 2; k <= 6; k++) paintAt((g.horiz ? g.tc : g.cx) + inX * k, (g.horiz ? g.cz : g.tc) + inZ * k);
      const sx = g.cx + inX * 6, sz = g.cz + inZ * 6;
      if (market) route(sx, sz, market.x, market.z); else if (plaza) route(sx, sz, plaza.x, plaza.z);
    }
    if (market && plaza) route(market.x, market.z, plaza.x, plaza.z);
    if (plaza && hq) route(plaza.x, plaza.z, hq.x, hq.z);
    if (plaza && c.clerk) route(plaza.x, plaza.z, c.clerk.doorX, c.clerk.doorZ);
    if (plaza && field) route(plaza.x, plaza.z, field.x, field.z);
  }

  // --- Lots and buildings ----------------------------------------------------------------------------
  const buildings = [];
  const addBuilding = (b) => { buildings.push(b); b.id = buildings.length; return b.id; };
  // A lot takes the character of its neighbourhood, and near the edge, every so often, the one next door's.
  const zoneOf = (x, z, seedv = 0) => {
    const i = z * WX + x, d = DISTRICTS[dist[i] - 1];
    if (!d) return Z.village;
    if (outskirt(i, x, z)) return Z.farmhouse;
    const e = dEdge[i];
    if (e < 70 && dist2[i] && r2(x * 3 + seedv, z * 5) < .45 * (1 - e / 70)) return DISTRICTS[dist2[i] - 1].zone;
    return d.zone;
  };
  const top = (f) => STREET_Y + f * FLOOR_H;
  const makeTiers = (floors, style, r) => {
    if (floors < 12 || STYLES[style].cast === 2 && r() < .6) return [0, top(floors)];
    if (floors < 20) return r() < .5 ? [0, top(floors)] : [0, top(floors - 3), 4, top(floors)];
    const a = Math.round(floors * .45), b = Math.round(floors * .75);
    return [0, top(a), 4, top(b), 8, top(floors)];
  };
  function id0(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h >>> 0; }
  const landmark = (name, r, style, tiers, extra = {}) => {
    const id = addBuilding({ name, style, tiers: tiers.map((v, i) => (i % 2 ? top(v) : v)), x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, seed: id0(name), ...extra });
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0, i = z * WX + x; x <= r.x1; x++, i++) {
      if (ground[i] === G.WATER) continue;
      ground[i] = G.LOT; lot[i] = id; mark[i] = 0;
    }
    return id;
  };
  const mid = (r) => ({ x: (r.x0 + r.x1) >> 1, z: (r.z0 + r.z1) >> 1 });
  const R_EXCHANGE = inLeaf(leafFor(1310, 840, 50), 44, 44), R_MERIDIAN = inLeaf(leafFor(1180, 720, 40), 34, 34), R_CARROW = inLeaf(leafFor(1050, 840, 40), 38, 38);
  const R_STATE = inLeaf(leafFor(1180, 560, 50), 70, 38), R_TERMINAL = inLeaf(leafFor(1310, 960, 50), 80, 36), R_HOSPITAL = inLeaf(leafFor(720, 1130, 50), 64, 36);
  const R_GRAND = inLeaf(leafFor(4280, 3140, 50), 60, 40), R_ELEVATOR = inLeaf(leafFor(2510, 2470, 30), 26, 14);
  landmark('Exchange Tower', R_EXCHANGE, S.limestone, [0, 13, 5, 21, 9, 31, 13, 37]);
  landmark('Meridian Building', R_MERIDIAN, S.deco, [0, 10, 4, 22, 8, 33]);
  landmark('Carrow Trust', R_CARROW, S.glassB, [0, 36]);
  landmark('Albion Athenaeum', P_LIBRARY, S.limestone, [0, 4]);
  landmark('State House', R_STATE, S.limestone, [0, 3, 12, 6]);
  landmark('Union Terminal', R_TERMINAL, S.granite, [0, 4]);
  landmark('Albion General', R_HOSPITAL, S.whitebrick, [0, 9]);
  landmark('Grand Severn Hotel', R_GRAND, S.beachP, [0, 6, 6, 14]);
  landmark('Weston Co-op Elevator', R_ELEVATOR, S.silo, [0, 10], { blank: true });

  // Farmsteads out among the fields: a house, a barn and a silo round a dirt yard, a long way from each other.
  const farms = [];
  const farmRng = makeRng(seed + 77);
  for (let t = 0; t < 4000 && farms.length < 54; t++) {
    const x = 200 + Math.floor(farmRng() * (WX - 700)), z = 300 + Math.floor(farmRng() * (WZ - 400));
    if (!fieldAt(x, z) || farms.some((f) => Math.hypot(f.x - x, f.z - z) < 170)) continue;
    let ok = true;
    for (let dz = -30; dz <= 30 && ok; dz += 6) for (let dx = -36; dx <= 36 && ok; dx += 6) {
      const j = (z + dz) * WX + x + dx, g = ground[j];
      if (g !== G.FIELD && g !== G.PARK && g !== G.DIRT || campMask[j] || townId[j] || campDist(x + dx, z + dz) < 60) ok = false;
    }
    if (!ok) continue;
    farms.push({ x, z });
    fillGround({ x0: x - 34, x1: x + 34, z0: z - 28, z1: z + 28 }, G.DIRT);
    const st = farmRng.pick([S.clapW, S.clapW, S.clapY, S.cedar, S.cottage]);
    landmark('', { x0: x - 30, x1: x - 14, z0: z - 22, z1: z - 8 }, st, [0, 2], { house: true, rise: 4 });
    landmark('', { x0: x + 2, x1: x + 28, z0: z - 20, z1: z - 4 }, S.barn, [0, 2], { house: true, rise: 6, open: true });
    const sx = x + 14, sz = z + 14;
    const sid = addBuilding({ name: '', style: S.silo, tiers: [0, top(4 + Math.floor(farmRng() * 2))], x0: sx - 4, x1: sx + 4, z0: sz - 4, z1: sz + 4, seed: farms.length * 977, blank: true });
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dz * dz <= 17) { const i = (sz + dz) * WX + sx + dx; ground[i] = G.LOT; lot[i] = sid; mark[i] = 0; }
  }
  // A ranger's cabin where the forest road gives out, and another at the foot of the mountain trail.
  landmark('Trinity Ranger Station', { x0: 3770, x1: 3790, z0: 1782, z1: 1798 }, S.cedar, [0, 1], { house: true, rise: 4 });
  landmark('Mt. Page Trailhead', { x0: 886, x1: 904, z0: 2006, z1: 2020 }, S.cedar, [0, 1], { house: true, rise: 4 });
  fillGround({ x0: 3750, x1: 3810, z0: 1778, z1: 1806 }, G.DIRT, (g) => g === G.PARK);
  fillGround({ x0: 870, x1: 910, z0: 1984, z1: 2004 }, G.DIRT, (g) => g === G.PARK);
  // The Strand: a tower every so often down both sides of Ocean Drive, each in its own paved apron, facing the sea or the lagoon.
  {
    const towerSt = [S.glassT, S.glassB, S.beachP, S.beachT, S.whitebrick, S.concrete], tr = makeRng(seed + 404);
    let run = 0, side = 1;
    for (let k = 0; k + 1 < OCEAN_DRIVE.length; k++) {
      const [ax, az] = OCEAN_DRIVE[k], [bx, bz] = OCEAN_DRIVE[k + 1], len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
      for (let s = 0; s < len; s += 4) {
        run += 4;
        if (run < 40) continue;
        const cx = Math.round(ax + (bx - ax) * s / len + nx * 21 * side), cz = Math.round(az + (bz - az) * s / len + nz * 21 * side);
        let ok = true;
        for (let z = cz - 12; z <= cz + 12 && ok; z += 2) for (let x = cx - 12; x <= cx + 12 && ok; x += 2) { const i = z * WX + x; if (land[i] !== 1 || mask[i] === 3) ok = false; }
        side = -side;
        if (!ok) continue;
        run = 0;
        fillGround({ x0: cx - 12, x1: cx + 12, z0: cz - 12, z1: cz + 12 }, G.PLAZA, (g) => g !== G.ROAD && g !== G.WALK);
        landmark('', { x0: cx - 9, x1: cx + 9, z0: cz - 9, z1: cz + 9 }, tr.pick(towerSt), [0, tr.int(10, 28)]);
      }
    }
  }
  // Stops along the highways: a motel, a gas station, a diner, each with its lot and whatever was left in it.
  const parking = [];
  const wayside = (name, x, z, ox, oz, style) => {
    const along = ox === 0, bw = along ? 30 : 18, bd = along ? 18 : 30;
    const r = { x0: x + ox - (bw >> 1), x1: x + ox + (bw >> 1), z0: z + oz - (bd >> 1), z1: z + oz + (bd >> 1) };
    const k = 28 / Math.hypot(ox, oz);
    const p = { x0: x + Math.round(ox * k) - (along ? 24 : 8), x1: x + Math.round(ox * k) + (along ? 24 : 8), z0: z + Math.round(oz * k) - (along ? 8 : 24), z1: z + Math.round(oz * k) + (along ? 8 : 24) };
    fillGround(p, G.PLAZA, (g) => g !== G.ROAD);
    for (let zz = p.z0; zz <= p.z1; zz++) for (let xx = p.x0; xx <= p.x1; xx++) if (ground[zz * WX + xx] === G.PLAZA) mark[zz * WX + xx] = 4;
    parking.push({ ax: p.x0, az: p.z0, bx: p.x1, bz: p.z1 });
    landmark(name, r, style, [0, 1]);
  };
  wayside('Pine Hill Motel', 3570, 147, 0, -50, S.clapW);
  wayside('Surfside Gas', 4696, 2286, -50, 0, S.stucco);
  wayside('Junction Diner', 1400, 3536, 0, 48, S.whitebrick);
  wayside('Ridge View Motel', 425, 2548, 50, 0, S.cedar);
  wayside('Valley Feed & Seed', 3560, 745, 0, 48, S.barn);

  tick('camps');
  // Flood fill the remaining lot cells into blocks, then split each block into lots.
  const label = new Int32Array(N);
  const stack = new Int32Array(N >> 1);
  const lotsOut = [];
  let blockCount = 0;
  for (let start = 0; start < N; start++) {
    if (ground[start] !== G.LOT || lot[start] || label[start]) continue;
    const lbl = ++blockCount;
    let sp = 0, x0 = WX, x1 = 0, z0 = WZ, z1 = 0, cells = 0;
    stack[sp++] = start; label[start] = lbl;
    while (sp) {
      const c = stack[--sp];
      const x = c % WX, z = (c / WX) | 0;
      cells++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
      if (x > 0 && ground[c - 1] === G.LOT && !lot[c - 1] && !label[c - 1]) { label[c - 1] = lbl; stack[sp++] = c - 1; }
      if (x < WX - 1 && ground[c + 1] === G.LOT && !lot[c + 1] && !label[c + 1]) { label[c + 1] = lbl; stack[sp++] = c + 1; }
      if (z > 0 && ground[c - WX] === G.LOT && !lot[c - WX] && !label[c - WX]) { label[c - WX] = lbl; stack[sp++] = c - WX; }
      if (z < WZ - 1 && ground[c + WX] === G.LOT && !lot[c + WX] && !label[c + WX]) { label[c + WX] = lbl; stack[sp++] = c + WX; }
    }
    if (cells < 60) continue; // left as paved ground below
    const split = (ax, az, bx, bz) => {
      const w = bx - ax + 1, d = bz - az + 1;
      const zone = zoneOf((ax + bx) >> 1, (az + bz) >> 1, lbl);
      const [lmin, lmax] = zone.lot;
      const big = Math.max(w, d);
      if (big <= lmax && (big < lmin * 2 || rng() < .35)) { lotsOut.push({ ax, az, bx, bz, lbl }); return; }
      // Service alleys and light wells: the gaps that stop a block being one solid wall.
      const alley = !zone.house && big > 44 && rng() < (zone.alley || .2) ? 4 : 0;
      const at = Math.round(big * rng.range(.38, .62));
      if (w >= d) {
        split(ax, az, ax + at - 1, bz);
        split(ax + at + alley, az, bx, bz);
        for (let g = 0; g < alley; g++) for (let z = az; z <= bz; z++) {
          const i = z * WX + ax + at + g;
          if (label[i] === lbl) ground[i] = G.ALLEY;
        }
      } else {
        split(ax, az, bx, az + at - 1);
        split(ax, az + at + alley, bx, bz);
        for (let g = 0; g < alley; g++) for (let x = ax; x <= bx; x++) {
          const i = (az + at + g) * WX + x;
          if (label[i] === lbl) ground[i] = G.ALLEY;
        }
      }
    };
    split(x0, z0, x1, z1);
  }
  for (const L of lotsOut) {
    const zone = zoneOf((L.ax + L.bx) >> 1, (L.az + L.bz) >> 1, L.lbl);
    let count = 0;
    for (let z = L.az; z <= L.bz; z++) for (let x = L.ax, i = z * WX + x; x <= L.bx; x++, i++) if (label[i] === L.lbl && ground[i] === G.LOT) count++;
    const r = makeRng(L.ax * 73 + L.az * 131 + seed);
    const thin = Math.min(L.bx - L.ax + 1, L.bz - L.az + 1);
    const turn = (g, mk = 0) => {
      for (let z = L.az; z <= L.bz; z++) for (let x = L.ax, i = z * WX + x; x <= L.bx; x++, i++) if (label[i] === L.lbl && ground[i] === G.LOT) { ground[i] = g; mark[i] = mk; }
    };
    if (count < 40) { turn(zone.house ? G.PARK : G.ALLEY); continue; }
    // Every so often somebody's cleared lot has been turned over for vegetables, or was only ever somewhere to leave the car.
    if (zone.garden && thin >= 8 && r() < zone.garden) { turn(G.PARK); continue; }
    if (zone.parking && thin >= 18 && r() < zone.parking) { turn(G.PLAZA, zone.rural ? 0 : 4); if (!zone.rural) parking.push(L); else turn(G.DIRT); continue; }
    if (zone.fields && thin >= 24 && r() < zone.fields) { const crop = [2, 3, 4, 6, 6][Math.floor(r() * 5)]; turn(G.FIELD, crop); continue; }
    let style = r.pick(zone.st);
    const [fa, fb] = zone.f;
    let floors = Math.round(fa + (fb - fa) * Math.pow(r(), 1.6));
    if (r() < zone.tall) floors = Math.round(floors * r.range(1.3, 1.8));
    if (zone.towers && thin >= 22 && r() < .12) { floors = r.int(12, 18); style = S.projects; }
    floors = Math.min(40, Math.max(1, floors));
    if (!zone.house) floors = Math.max(2, Math.min(floors, 2 + Math.floor(count / 12)));
    let tiers = makeTiers(floors, style, r);
    let church = false;
    // A house stands in its own yard, back from the road. A big building sometimes stands back a little as well.
    let inset = zone.house ? r.int(zone.house[0], zone.house[1]) : (thin >= 24 && r() < .3 ? 2 : 0);
    if (zone.church && thin >= 18 && r() < zone.church) {
      // A nave and a square tower rising out of the middle of it.
      church = true; style = S.graystone; inset = 0;
      tiers = [0, top(3), 6, top(7)];
    } else if (zone.stepped && floors >= 7 && r() < zone.stepped) tiers = [0, top(floors - 2), 4, top(floors)];
    const fx0 = L.ax + inset, fx1 = L.bx - inset, fz0 = L.az + inset, fz1 = L.bz - inset;
    if (fx1 - fx0 < 8 || fz1 - fz0 < 8) { turn(zone.house ? G.PARK : G.ALLEY); continue; }
    // A silo is a round-shouldered tin can, not a building with windows: a small one at the back of its lot.
    if (style === S.silo) { const cx = (fx0 + fx1) >> 1, cz = (fz0 + fz1) >> 1; tiers = [0, top(r.int(4, 6))]; addBuilding({ name: '', style, tiers, x0: cx - 5, x1: cx + 5, z0: cz - 5, z1: cz + 5, seed: r() * 4294967296 >>> 0, blank: true }); for (let z = L.az; z <= L.bz; z++) for (let x = L.ax, i = z * WX + x; x <= L.bx; x++, i++) if (label[i] === L.lbl && ground[i] === G.LOT) { if (Math.abs(x - cx) <= 5 && Math.abs(z - cz) <= 5) lot[i] = buildings.length; else { ground[i] = G.DIRT; mark[i] = 0; } } continue; }
    const b = buildings[addBuilding({ style, tiers, x0: fx0, x1: fx1, z0: fz0, z1: fz1, seed: r() * 4294967296 >>> 0 }) - 1];
    if (zone.house) { b.house = true; b.rise = Math.min(6, 3 + Math.floor((Math.min(fx1 - fx0, fz1 - fz0)) / 6)); }
    if (zone.fronts) {
      b.harlem = true;
      b.cornice = church || r() < .85;
      b.stoop = !!zone.stoops && !church && floors <= 5 && [S.brownstone, S.redstone, S.graystone].includes(style);
    }
    for (let z = L.az; z <= L.bz; z++) for (let x = L.ax, i = z * WX + x; x <= L.bx; x++, i++) {
      if (label[i] !== L.lbl || ground[i] !== G.LOT) continue;
      if (x >= fx0 && x <= fx1 && z >= fz0 && z <= fz1) lot[i] = b.id;
      else { ground[i] = zone.house ? G.PARK : zone.rural ? G.DIRT : G.PLAZA; mark[i] = 0; }
    }
  }
  // Any unclaimed lot ground (slivers, tiny blocks) becomes pavement.
  for (let i = 0; i < N; i++) if (ground[i] === G.LOT && !lot[i]) ground[i] = G.ALLEY;

  // A camp that wants to see what is coming has pulled down whatever stood right outside its corners.
  for (const def of CAMP_DEFS) {
    const R = def.clearCorners;
    if (!R) continue;
    const r = campRects[def.key];
    for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
      for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
        if (!inside(x, z) || (x - cx) ** 2 + (z - cz) ** 2 > R * R) continue;
        const id = lot[z * WX + x];
        if (!id || buildings[id - 1].name) continue;
        const b = buildings[id - 1];
        b.gone = true;
        for (let bz = b.z0; bz <= b.z1; bz++) for (let bx = b.x0, i = bz * WX + bx; bx <= b.x1; bx++, i++) if (lot[i] === id) { lot[i] = 0; ground[i] = G.CAMP; mark[i] = 0; }
      }
    }
  }

  // Across the way from every gate the crews knocked down whatever stood there, and hauled off the wrecks: a clear field for the
  // guns, and nobody walks out of a gate into a wall or a pile of what used to be one.
  const clearMask = new Uint8Array(N);
  for (const c of camps) for (const q of c.gates) {
    const ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
    const face = q.horiz ? (oz < 0 ? q.z0 : q.z1) : (ox < 0 ? q.x0 : q.x1);
    for (let d = 1; d <= 34; d++) for (let a = -14; a <= 14; a++) {
      const x = q.horiz ? q.tc + a : face + ox * d, z = q.horiz ? face + oz * d : q.tc + a;
      if (!inside(x, z)) continue;
      const i = z * WX + x;
      if (ground[i] === G.WATER) continue;
      clearMask[i] = 1;
      const id = lot[i];
      if (!id || buildings[id - 1].name) continue;
      const b = buildings[id - 1];
      b.gone = true;
      for (let bz = b.z0; bz <= b.z1; bz++) for (let bx = b.x0, k = bz * WX + bx; bx <= b.x1; bx++, k++) if (lot[k] === id) { lot[k] = 0; ground[k] = G.PLAZA; mark[k] = 0; }
    }
  }

  // Edge distance inside each lot drives setbacks, roof pitch and facade detection.
  for (let z = 1; z < WZ - 1; z++) for (let x = 1, i = z * WX + 1; x < WX - 1; x++, i++) {
    const id = lot[i];
    if (!id) continue;
    edge[i] = (lot[i - 1] !== id || lot[i + 1] !== id || lot[i - WX] !== id || lot[i + WX] !== id) ? 0 : 200;
  }
  for (let z = 1; z < WZ - 1; z++) for (let x = 1, i = z * WX + 1; x < WX - 1; x++, i++) {
    if (lot[i] && edge[i]) edge[i] = Math.min(edge[i], edge[i - 1] + 1, edge[i - WX] + 1);
  }
  for (let z = WZ - 2; z > 0; z--) for (let x = WX - 2, i = z * WX + x; x > 0; x--, i--) {
    if (lot[i] && edge[i]) edge[i] = Math.min(edge[i], edge[i + 1] + 1, edge[i + WX] + 1);
  }
  for (const b of buildings) { b.bestE = -1; b.cx = b.x0; b.cz = b.z0; }
  for (let z = 1; z < WZ - 1; z++) for (let x = 1, i = z * WX + 1; x < WX - 1; x++, i++) {
    const id = lot[i];
    if (!id) continue;
    const b = buildings[id - 1], e = edge[i];
    if (e > b.bestE) { b.bestE = e; b.cx = x; b.cz = z; }
  }
  // How tall a building can be depends on how wide it is. Anything too narrow to have a room in it comes down altogether.
  for (const b of buildings) {
    if (b.bestE < 0) { b.gone = true; continue; }
    if (b.name !== undefined) continue;
    const across = b.bestE * 2 + 1;
    if (across < 8) {
      b.gone = true;
      for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0, i = z * WX + x; x <= b.x1; x++, i++) if (lot[i] === b.id) { lot[i] = 0; ground[i] = b.house ? G.PARK : G.ALLEY; edge[i] = 0; mark[i] = 0; }
      continue;
    }
    const most = Math.max(2, Math.round(across * (b.harlem ? .7 : 1.15)));
    if (!b.house && (b.tiers[b.tiers.length - 1] - STREET_Y) / FLOOR_H > most) b.tiers = [0, top(most)];
  }
  // Every building stands on the ground where it is: its floors are lifted with the street, and nothing reaches past the top of the world.
  for (const b of buildings) {
    b.lift = Math.max(0, Math.round(baseAt((b.x0 + b.x1) >> 1, (b.z0 + b.z1) >> 1)));
    const over = b.tiers[b.tiers.length - 1] + b.lift - 250;
    if (over > 0) { const k = Math.ceil(over / FLOOR_H); for (let t = 1; t < b.tiers.length; t += 2) b.tiers[t] = Math.max(top(1), b.tiers[t] - k * FLOOR_H); }
    for (let t = 1; t < b.tiers.length; t += 2) b.tiers[t] += b.lift;
  }
  for (let z = 1; z < WZ - 1; z++) for (let x = 1, i = z * WX + 1; x < WX - 1; x++, i++) {
    const id = lot[i];
    if (!id) continue;
    const b = buildings[id - 1], e = edge[i];
    let h = b.tiers[1];
    for (let t = 2; t < b.tiers.length; t += 2) if (e >= b.tiers[t]) h = b.tiers[t + 1];
    // A house roof climbs a step for every step in from the eaves.
    height[i] = Math.min(254, b.house ? h + Math.min(e, b.rise || 4) : h);
  }
  // Stairwells: two flights round a spine, five wide and six deep, near the core wherever one fits with a wall's width to spare.
  for (const b of buildings) {
    b.top = b.tiers[b.tiers.length - 1];
    b.sx = -1;
    if (b.gone || b.blank || b.open) continue;
    const floors = (b.top - STREET_Y - b.lift) / FLOOR_H;
    if (b.house && floors < 2) continue;
    const fits = (sx, sz) => {
      for (let z = sz - 1; z < sz + 7; z++) for (let x = sx - 1; x < sx + 6; x++) {
        const i = z * WX + x;
        if (lot[i] !== b.id || edge[i] < 1 || (!b.house && height[i] !== b.top)) return false;
      }
      return true;
    };
    const search = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, -1], [2, -2], [-2, 2], [3, 0], [-3, 0], [0, 3], [0, -3], [4, 2], [-4, -2]];
    for (const [dx, dz] of search) {
      const sx = b.cx - 2 + dx, sz = b.cz - 3 + dz;
      if (sx > 1 && sz > 1 && fits(sx, sz)) { b.sx = sx; b.sz = sz; break; }
    }
    b.tank = !b.house && b.top - b.lift > (b.harlem ? 36 : 48) && STYLES[b.style].cast !== 2 && (b.seed % 100) < (b.harlem ? 60 : 45);
  }

  // Old painted ads on the brick.
  const AD_WORDS = ['HOTEL', 'COLA', 'LOANS', 'DELI', 'TAXI', 'RADIO', 'LAUNDRY', 'STEAK', 'CIGARS', 'BANK', 'JEANS', 'SODA', 'PAWN', 'DINER', 'GARAGE', 'THEATER', 'MOTEL', 'TICKETS', 'RYE', 'COFFEE', 'BEER', 'TAILOR', 'FURS', 'SHOES', 'FEED', 'BAIT'];
  const AD_PAIRS = [[M.AD_CREAM, M.AD_RED], [M.AD_BLUE, M.AD_CREAM], [M.AD_BLACK, M.AD_YELLOW], [M.AD_RED, M.AD_CREAM], [M.AD_GREEN, M.AD_CREAM], [M.AD_CREAM, M.AD_BLUE], [M.AD_YELLOW, M.AD_BLACK]];
  for (const b of buildings) {
    const st = STYLES[b.style];
    if (st.cast === 2 || b.house || b.blank || b.gone || r2(b.id, 41) > .2) continue;
    const span = b.x1 - b.x0, deep = b.z1 - b.z0;
    const alongX = span >= deep;
    const room = Math.max(span, deep);
    const word = AD_WORDS[Math.floor(r2(b.id, 7) * AD_WORDS.length)];
    const scale = room >= word.length * 8 + 10 ? 2 : 1;
    const wide = word.length * 4 * scale + 3;
    const floors = (b.tiers[1] - STREET_Y - b.lift) / FLOOR_H;
    if (wide > room - 4 || floors < 3) continue;
    const high = 5 * scale + 3;
    const pair = AD_PAIRS[Math.floor(r2(b.id, 9) * AD_PAIRS.length)];
    const floor = 1 + Math.floor(r2(b.id, 11) * Math.max(1, Math.min(floors - 2, 6)));
    const t0 = (alongX ? b.x0 : b.z0) + ((room - wide) >> 1);
    b.ad = { alongX, t0, t1: t0 + wide - 1, y0: top(floor) + b.lift, y1: top(floor) + b.lift + high - 1, word, scale, bg: pair[0], fg: pair[1] };
  }
  const fireSpots = [];
  const campNear = (x, z, m) => CAMP_DEFS.some((d) => { const r = campRects[d.key]; return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; });

  tick('lots');
  // --- Terrain -----------------------------------------------------------------------------------
  // Streets, lots, fields and settlements lie on the levelled ground under them; the country between carries the full relief of the land.
  for (let k = 0; k < rubble.length; k += 2) if (ground[rubble[k]] === G.WATER) ground[rubble[k]] = G.ROCK;
  const slump = new Map();
  for (let k = 0; k < rubble.length; k += 2) slump.set(rubble[k], Math.min(slump.get(rubble[k]) ?? 99, rubble[k + 1]));
  const flat = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const g = ground[i];
    flat[i] = (g === G.WATER || townId[i] || (mask[i] && !tun[i]) || g === G.FIELD || g === G.LOT || g === G.DIRT || g === G.SAND || g === G.PLAZA || g === G.PROM || land[i] >= 2) ? 1 : 0;
  }
  for (const def of CAMP_DEFS) {
    const r = campRects[def.key];
    for (let z = Math.max(0, r.z0 - 34); z <= Math.min(WZ - 1, r.z1 + 34); z++) flat.fill(1, z * WX + Math.max(0, r.x0 - 34), z * WX + Math.min(WX - 1, r.x1 + 34) + 1);
  }
  const df = chamfer((i) => flat[i] === 1);
  const BLEND = 92;
  const forestAt = (x, z) => {
    const n = fbm2(x * .0045 + 3, z * .0045 + 8, 3);
    const esp = sstep((z - 2600) / 500) * sstep((1700 - x) / 700) * (.55 + .45 * Math.max(sstep((700 - x) / 500), sstep((z - 3500) / 450)));
    let k = (n - .46) * 2.2 + 1.8 * trinityK(x, z) + .8 * sstep((420 - x) / 420) + .7 * sstep((380 - z) / 380) + 1.15 * esp + .45 * pageK(x, z) - 1.1 * farmK(x, z);
    // Past the edges of the map the country goes on in woods and clearings: big stands of forest with open ground between, carrying on
    // from whatever the edge was doing.
    const out = Math.max(0, -x, -z, z - WZ);
    if (out > 0) {
      const patch = (fbm2(x * .0024 + 41, z * .0024 + 17, 3) - .44) * 3.4 + .35 * sstep((-x - 300) / 900);
      k += (patch - k) * sstep(out / 420);
    }
    return Math.max(0, Math.min(1, k));
  };
  const rowB = new Float32Array(QW), rowE = new Float32Array(QW);
  for (let z = 0, i = 0; z < WZ; z++) {
    {
      const fz = Math.min(QD - 1.001, z / 4), iz = fz | 0, uz = fz - iz;
      for (let q = 0; q < QW; q++) { const k = q + iz * QW; rowB[q] = BQ[k] * (1 - uz) + BQ[k + QW] * uz; rowE[q] = EQ[k] * (1 - uz) + EQ[k + QW] * uz; }
    }
    for (let x = 0; x < WX; x++, i++) {
      const g = ground[i];
      if (campMask[i] && g !== G.WATER) { terr[i] = 0; continue; }
      if (g === G.WATER) { terr[i] = -4 - Math.min(6, Math.round(dl[i] / 3)); continue; }
      if (mark[i] & 16) { terr[i] = g === G.ROAD ? -1 : 0; continue; }
      if (lot[i]) { terr[i] = buildings[lot[i] - 1].lift; continue; }
      const fx = x / 4, ix = fx | 0, ux = fx - ix;
      const b = rowB[ix] * (1 - ux) + rowB[ix + 1] * ux, base = Math.round(b);
      if (tun[i]) {
        terr[i] = base - 1;
        // Deep enough under the hill to have a roof: the column's top is the hillside, and the road runs through underneath.
        const e = sampleQ(EQ, x, z) + 34 * sstep(1 - Math.abs(z - 2075) / 150);
        if (e - base >= 10) { height[i] = Math.min(250, STREET_Y + Math.round(e)); mark[i] |= 32; }
        continue;
      }
      if (g === G.ROAD) { terr[i] = base - 1; continue; }
      if (g === G.PLAZA) { terr[i] = mark[i] === 4 ? base - 1 : base; continue; }
      if (g === G.SAND) { terr[i] = Math.min(base, Math.round(-3 + dw[i] * .17)); continue; }
      if (g !== G.PARK && g !== G.ROCK) { terr[i] = base; continue; }
      const e = rowE[ix] * (1 - ux) + rowE[ix + 1] * ux;
      let t = Math.round(b + (e - b) * sstep(df[i] / BLEND));
      // Banks shelve into the water, and the marsh behind the barrier barely clears it.
      if (land[i] === 3) t = Math.min(t, -1 + (noise2(x * .1, z * .1) > .5 ? 1 : 0));
      if (dw[i] < 6 && !townId[i]) t = Math.min(t, -3 + (dw[i] >> 1));
      terr[i] = t;
      // Bare rock along the tops, on the peak, and wherever the stone breaks through.
      if (g === G.PARK && t > 70 && (t > 128 + noise2(x * .02, z * .02) * 30 || noise2(x * .03, z * .03) > .9)) ground[i] = G.ROCK;
    }
  }
  for (const [i, d] of slump) terr[i] = -d;
  // Cliffs: wherever the hillside is too steep to hold soil. The plateau's edges are lined with them.
  for (let z = 2; z < WZ - 2; z++) for (let x = 2, i = z * WX + 2; x < WX - 2; x++, i++) {
    if (ground[i] !== G.PARK || terr[i] < 12) continue;
    if (Math.abs(terr[i + 2] - terr[i - 2]) + Math.abs(terr[i + 2 * WX] - terr[i - 2 * WX]) > 7) ground[i] = G.ROCK;
  }

  tick('terrain');
  // --- Props ----------------------------------------------------------------------------------------
  const props = [];
  const addProp = (t, x, z, a = 0, b = 0, c = 0) => { if (inside(x, z) && !campMask[z * WX + x] && !clearMask[z * WX + x]) props.push(t, x, z, a, b, c); };
  const groundAt = (x, z) => (inside(x, z) ? ground[z * WX + x] : G.WATER);
  const placeCar = (x, z, dir, seedVal, lotOK, truck) => {
    const g = groundAt(x, z);
    if (!(g === G.ROAD || (lotOK && g === G.PLAZA)) || tun[z * WX + x]) return;
    const r = seedVal;
    const kind = truck && r < .6 ? 3 : r < .5 ? 0 : r < .56 ? 1 : r < .62 ? 2 : r < .78 ? 3 : r < .83 ? 4 : r < .88 ? 5 : 6; // sedan,taxi,bus,truck,police,ambulance,wreck
    addProp(P.CAR, x, z, dir, kind, Math.floor(r * 1000));
  };
  for (let k = 0; k < townCars.length; k += 4) placeCar(townCars[k], townCars[k + 1], townCars[k + 2], townCars[k + 3]);
  // Out on the highways: the odd car where it stopped, and a jam wherever people gave up on getting through.
  for (const key in highways) {
    const path = highways[key];
    let since = 0, jam = 0;
    for (let k = 0; k + 1 < path.length; k++) {
      const [ax, az] = path[k], [bx, bz] = path[k + 1], len = Math.hypot(bx - ax, bz - az), dir = Math.abs(bx - ax) > Math.abs(bz - az) ? 1 : 0;
      for (let s = 0; s < len; s += 13) {
        since += 13;
        const x = Math.round(ax + (bx - ax) * s / len), z = Math.round(az + (bz - az) * s / len);
        if (jam <= 0 && rng() < .012) jam = 6 + Math.floor(rng() * 10);
        if (jam > 0 || (since > 60 && rng() < .12)) {
          const off = rng() < .5 ? -5 : 2;
          placeCar(x + (dir ? 0 : off), z + (dir ? off : 0), dir, rng());
          if (jam > 0 && rng() < .6) placeCar(x + (dir ? 0 : -off - 3), z + (dir ? -off - 3 : 0), dir, rng());
          jam--; since = 0;
        }
      }
    }
  }
  for (const L of parking) {
    const truck = DISTRICTS[dist[cellOf(L.ax, L.az)] - 1]?.zone === Z.truck;
    for (let z = L.az + 2; z + 9 <= L.bz; z += 13) for (let x = L.ax + 2; x + 4 <= L.bx; x += 6) {
      if (r2(x, z + 5) < (truck ? .55 : .3)) placeCar(x, z, 0, r2(z, x + 9), true, truck);
    }
  }

  const curbSide = (x, z) => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (groundAt(x + dx * 2, z + dz * 2) === G.ROAD) return true;
    return false;
  };
  for (let z = 8; z < WZ - 8; z += 3) for (let x = 8 + (z % 2); x < WX - 8; x += 3) {
    const i = z * WX + x, g = ground[i];
    if (g === G.WALK && !(mark[i] & 16) && curbSide(x, z)) {
      const k = r2(x * 3, z * 7);
      const leafy = townId[i] > 1 || !townId[i];
      if (k < .045) addProp(P.LAMP, x, z, 0);
      else if (k < (leafy ? .14 : .1)) addProp(P.TREE, x, z, Math.floor(k * 1000));
      else if (k < (leafy ? .15 : .16)) addProp(P.TRASH, x, z, Math.floor(k * 9999));
      else if (k < .164) addProp(P.HYDRANT, x, z);
      else if (k < .166) addProp(P.NEWS, x, z);
    } else if (g === G.ALLEY) {
      if (r2(x, z) < .03) addProp(P.DUMPSTER, x, z, r2(z, x) < .5 ? 0 : 1);
    } else if (g === G.PROM && r2(x + 5, z) < .012) {
      addProp(P.BENCH, x, z);
    }
  }
  for (let z = 6; z < WZ - 6; z += 6) for (let x = 6; x < WX - 6; x += 6) {
    const i = z * WX + x, g = ground[i];
    if (g === G.PARK) {
      if (terr[i] < -1) continue;
      const j = r2(x, z);
      // Yards and town greens get the odd tree; the country gets as many as the forest there wants.
      const dens = townId[i] || campMask[i] ? .09 + (lot[i - 4] || lot[i + 4] ? -.04 : .1) * fbm2(x * .03, z * .03, 2) : forestAt(x, z) * .8;
      if (j < dens) addProp(P.PARKTREE, x + Math.floor(j * 40) % 4, z + Math.floor(j * 70) % 4, Math.floor(j * 9999));
      // Trinity is thicker than any other wood in the state: a second stand of trees between the first.
      const tk = townId[i] || campMask[i] ? 0 : trinityK(x, z);
      if (tk > .2 && r2(x + 3, z + 3) < tk * .85) addProp(P.PARKTREE, x + 3, z + 3, Math.floor(r2(z + 3, x) * 9999));
    } else if (g === G.ROCK && !mark[i] && r2(x, z + 1) < .12) addProp(P.ROCK, x, z, Math.floor(r2(z, x) * 999));
    else if (g === G.FIELD && mark[i] === 6 && r2(x, z + 2) < .16) addProp(P.BALE, x, z, Math.floor(r2(z, x) * 999));
  }
  // Abandoned army checkpoints where each highway comes into a town, and at a few of Albion's boulevards.
  for (const [x, z] of [[2610, 180], [4180, 300], [4080, 882], [4620, 1990], [4350, 2830], [3720, 3240], [1400, 3536], [380, 3554], [2330, 2310], [2330, 2740],
    [441, 1640], [1300, 250], [2460, 1040], [2080, 1834]]) {
    if (groundAt(x, z) === G.ROAD) addProp(P.CHECKPOINT, x, z, (x + z) % 99);
  }
  const propArr = new Int32Array(props);
  const binLists = Array.from({ length: CW * CD }, () => []);
  const PROP_R = 14;
  for (let i = 0; i < propArr.length; i += PROP_STRIDE) {
    const x = propArr[i + 1], z = propArr[i + 2];
    for (let cz = Math.max(0, (z - PROP_R) >> 5); cz <= Math.min(CD - 1, (z + PROP_R) >> 5); cz++) {
      for (let cx = Math.max(0, (x - PROP_R) >> 5); cx <= Math.min(CW - 1, (x + PROP_R) >> 5); cx++) binLists[cx + cz * CW].push(i);
    }
  }
  const binStart = new Int32Array(CW * CD + 1);
  let total = 0;
  for (let i = 0; i < binLists.length; i++) { binStart[i] = total; total += binLists[i].length; }
  binStart[binLists.length] = total;
  const binData = new Int32Array(total);
  for (let i = 0, k = 0; i < binLists.length; i++) for (const p of binLists[i]) binData[k++] = p;

  tick('props');
  // --- Large structures (generated by bbox, a few dozen only) --------------------------------------
  const structs = [];
  for (const c of camps) structs.push({ type: 'camp', id: c.id, x0: c.x0 - 6, x1: c.x1 + 6, z0: c.z0 - 6, z1: c.z1 + 6, y1: c.maxY });
  const named = (n) => buildings.find((b) => b.name === n);
  const spire = (name, b, rise, r0) => {
    const { x, z } = mid(b);
    if (b.top + 4 > 255) return;
    structs.push({ type: 'spire', name, x, z, y0: b.top, y1: Math.min(255, b.top + rise), r0, x0: x - r0, x1: x + r0, z0: z - r0, z1: z + r0 });
  };
  spire('exchange', named('Exchange Tower'), 30, 2);
  spire('chrysler', named('Meridian Building'), 26, 6);
  spire('state', named('State House'), 22, 7);
  // Meridian Square: the screens are still on the buildings, and the power has been off for six weeks.
  for (const side of [-1, 1]) {
    let z = SQ.z0 + 2;
    while (z < SQ.z1 - 8) {
      const cx = SQ.x;
      let x = cx + side * 8;
      while (Math.abs(x - cx) < 120 && !lot[z * WX + x]) x += side;
      const id = lot[z * WX + x];
      if (!id) { z += 6; continue; }
      // Run along the face for as long as it stays flat and tall enough.
      let z1 = z;
      while (z1 < SQ.z1 && z1 - z < 34 && lot[(z1 + 1) * WX + x] === id && !lot[(z1 + 1) * WX + x - side]) z1++;
      const b = buildings[id - 1], tall = height[z * WX + x];
      if (z1 - z >= 10 && tall >= STREET_Y + b.lift + 18) {
        let y = STREET_Y + b.lift + 7;
        const bands = Math.min(3, Math.floor((tall - STREET_Y - b.lift - 8) / 16));
        for (let k = 0; k < bands; k++) {
          const h = 10 + Math.floor(r2(z, k) * 5);
          if (y + h >= tall - 1) break;
          structs.push({ type: 'screen', fixed: x - side, along: 'z', a0: z + 1, a1: z1 - 1, y0: y, y1: y + h, x0: x - side, x1: x - side, z0: z + 1, z1: z1 - 1, seed: z * 7 + k, y2: y + h + 2 });
          y += h + 3;
        }
      }
      z = z1 + 3;
    }
  }
  // Billboards on rooftop frames: the sort of thing every block in the city used to have.
  const ROOF_WORDS = ['COLA', 'TICKETS', 'RADIO', 'TAXI', 'HOTEL', 'BEER', 'RYE', 'NEWS', 'JEANS', 'LOANS', 'THEATER', 'CIGARS', 'SODA'];
  for (const b of buildings) {
    if (r2(b.id, 57) > .2 || b.name !== undefined || b.house || b.gone || b.top - b.lift < STREET_Y + 18 || b.top - b.lift > STREET_Y + 110 || b.top > 238 || b.bestE < 12) continue;
    if (campNear(b.cx, b.cz, 12)) continue;
    const alongX = r2(b.id, 59) < .5;
    const word = ROOF_WORDS[Math.floor(r2(b.id, 61) * ROOF_WORDS.length)];
    const half = Math.min(b.bestE - 2, (word.length * 4 + 4) >> 1);
    if ((word.length * 4 + 3) >> 1 > half) continue;
    // Off to one side of the stairhead, never across it.
    const pair = AD_PAIRS[Math.floor(r2(b.id, 63) * AD_PAIRS.length)];
    const bx = alongX ? b.cx : b.cx + 8, bz = alongX ? b.cz + 8 : b.cz;
    if (lot[bz * WX + bx] !== b.id || edge[bz * WX + bx] < 3) continue;
    const x0 = alongX ? bx - half : bx, x1 = alongX ? bx + half : bx;
    const z0 = alongX ? bz : bz - half, z1 = alongX ? bz : bz + half;
    structs.push({ type: 'roofad', alongX, x0, x1, z0, z1, y0: b.top, y1: b.top + 12, word, bg: pair[0], fg: pair[1], seed: b.id });
  }
  // The light on Severn Rock. (Still filed under 'statue': it is the thing the title screen circles.)
  structs.push({ type: 'statue', x: LIGHT.x, z: LIGHT.z, x0: LIGHT.x - 30, x1: LIGHT.x + 30, z0: LIGHT.z - 30, z1: LIGHT.z + 30 });

  // Column ceiling in chunks, so empty sky never touches the workers.
  const chunkTop = new Uint8Array(CW * CD);
  for (let cz = 0; cz < CD; cz++) for (let cx = 0; cx < CW; cx++) {
    let m = STREET_Y + 2;
    for (let z = cz * CS; z < (cz + 1) * CS; z++) for (let x = cx * CS, i = z * WX + x; x < (cx + 1) * CS; x++, i++) {
      const t = height[i] ? height[i] + 10 : STREET_Y + terr[i] + 3;
      if (t > m) m = t;
    }
    chunkTop[cx + cz * CW] = Math.min(255, m);
  }
  // Trees and the like stand taller than the ground they are on.
  for (let i = 0; i < propArr.length; i += PROP_STRIDE) {
    const x = propArr[i + 1], z = propArr[i + 2], t = Math.min(255, STREET_Y + Math.max(0, terr[z * WX + x]) + 18);
    for (let cz = Math.max(0, (z - 5) >> 5); cz <= Math.min(CD - 1, (z + 5) >> 5); cz++) for (let cx = Math.max(0, (x - 5) >> 5); cx <= Math.min(CW - 1, (x + 5) >> 5); cx++) {
      if (chunkTop[cx + cz * CW] < t) chunkTop[cx + cz * CW] = t;
    }
  }
  for (const s of structs) {
    const sTop = s.type === 'spire' ? s.y1 : s.type === 'screen' ? s.y2 : s.type === 'statue' ? 118 : (s.y1 || 40);
    for (let cz = Math.max(0, s.z0 >> 5); cz <= Math.min(CD - 1, s.z1 >> 5); cz++) for (let cx = Math.max(0, s.x0 >> 5); cx <= Math.min(CW - 1, s.x1 >> 5); cx++) {
      chunkTop[cx + cz * CW] = Math.min(255, Math.max(chunkTop[cx + cz * CW], sTop));
    }
  }

  tick('structs');
  // --- Names ------------------------------------------------------------------------------------
  // Places worth a name on the map. tier 0 shows at any zoom, tier 1 only when you are looking closely.
  const townLabel = { albion: [1127, 800], severn: [4320, 3233], esperance: [880, 3440], dayton: [4419, 915], weston: [2313, 2531], westpoint: [300, 2185], gibson: [3290, 600] };
  const places = [
    ...TOWNS.map((t) => [t.name, ...townLabel[t.key], 0, ['albion', 'severn', 'esperance', 'dayton', 'weston'].includes(t.key) ? 'town' : 'area']),
    ...DISTRICTS.filter((d) => d.town.ds.length > 1 && d.n !== d.town.name).map((d) => [d.n, d.x, d.z, 1, 'area']),
    ...parkLeaves.map((L) => [L.park, (L.ix0 + L.ix1) / 2, (L.iz0 + L.iz1) / 2, 1, 'park']),
    ['Mt. Page', MT.x, MT.z, 0, 'park'], ['Trinity Forest', 3420, 1640, 0, 'park'], ['Arnhem Fields', 2370, 3960, 0, 'park'], ['Albion River', 1960, 150, 1, 'park'], ['The North Woods', 3520, 250, 1, 'park'],
    ...LAKES.filter(([name]) => name !== 'Dayton Harbor').map(([name, x, z]) => [name, x, z, 1, 'park']),
    ['Severn Lagoon', 4600, 3000, 1, 'park'], ['The Strand', 4780, 3150, 1, 'area'], ['Weston Tunnel', 2520, 1955, 0, 'bridge'], ['Severn Rock Light', LIGHT.x, LIGHT.z, 0, 'mark'], ['Dayton Harbor', 4295, 1060, 1, 'mark'],
    ['Exchange Tower', mid(R_EXCHANGE).x, mid(R_EXCHANGE).z, 1, 'mark'], ['Meridian Building', mid(R_MERIDIAN).x, mid(R_MERIDIAN).z, 1, 'mark'], ['Carrow Trust', mid(R_CARROW).x, mid(R_CARROW).z, 1, 'mark'],
    ['Meridian Square', SQ.x, (SQ.z0 + SQ.z1) >> 1, 1, 'mark'], ['State House', mid(R_STATE).x, mid(R_STATE).z, 1, 'mark'], ['Union Terminal', mid(R_TERMINAL).x, mid(R_TERMINAL).z, 1, 'mark'],
    ['Albion General', mid(R_HOSPITAL).x, mid(R_HOSPITAL).z, 1, 'mark'], ['Albion Athenaeum', mid(P_LIBRARY).x, mid(P_LIBRARY).z, 1, 'mark'], ['Grand Severn Hotel', mid(R_GRAND).x, mid(R_GRAND).z, 1, 'mark'],
    ['Weston Co-op Elevator', mid(R_ELEVATOR).x, mid(R_ELEVATOR).z, 1, 'mark'], ['Trinity Ranger Station', 3780, 1790, 1, 'mark'], ['Mt. Page Trailhead', 895, 2013, 1, 'mark'],
    ['Pleasure Pier', PLEASURE.x, PLEASURE.z, 1, 'mark'],
    ...['Pine Hill Motel', 'Surfside Gas', 'Junction Diner', 'Ridge View Motel', 'Valley Feed & Seed'].map((n) => { const b = named(n); return [n, mid(b).x, mid(b).z, 1, 'mark']; }),
  ].map(([name, x, z, tier, kind]) => ({ name, x: Math.round(x), z: Math.round(z), tier, kind }));

  // The country between the towns, by whatever is nearest.
  const COUNTRY = [['The Strand', 4760, 3110, 230], ['Mt. Page', MT.x, MT.z, 720], ['the Page escarpment', 900, 1700, 700], ['Trinity Forest', 3420, 1640, 820], ['the North Woods', 3520, 230, 520], ['Gibson Valley', 3200, 720, 520],
    ['Arnhem Fields', 2410, 3820, 480], ['the Weston farmlands', 2350, 2950, 760], ['Westpoint', 360, 2150, 320], ['the Severn marshes', 4620, 3150, 260], ['the Esperance woods', 800, 3470, 820],
    ['the lake country', 2220, 1700, 300], ['the Weston ridge', 2520, 1980, 320]];
  const lakeAt = (x, z) => {
    for (const [name, lx, lz, rx, rz] of LAKES) if (((x - lx) / (rx * 1.6)) ** 2 + ((z - lz) / (rz * 1.6)) ** 2 < 1) return name;
    if (x > coastX[Math.max(0, Math.min(WZ - 1, Math.floor(z)))] - 80) return z > 3530 && x < 4680 ? 'Severn Bay' : z > 2700 && z < 3530 && x < 4820 ? 'Severn Lagoon' : 'The Atlantic';
    return 'Albion River';
  };
  const countryAt = (x, z) => {
    let best = null, bd = 1;
    for (const [name, cx, cz, r] of COUNTRY) { const d = Math.hypot(x - cx, z - cz) / r; if (d < bd) { bd = d; best = name; } }
    if (best) return best;
    if (x > 4120) return 'the coast road';
    return x < 1500 ? 'the Page highlands' : 'the back country';
  };
  // The part of the state somewhere is in, whether or not there is a wall around it now.
  const areaOf = (x, z) => {
    const i = cellOf(x, z), d = townId[i] ? DISTRICTS[dist[i] - 1] : null;
    if (!d) return countryAt(x, z);
    return d.n === d.town.name ? d.n : `${d.n}, ${d.town.name}`;
  };
  const describe = (x, z) => {
    for (const c of camps) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return { district: c.name, cross: 'Inside the wall' };
    const i = cellOf(x, z);
    if (ground[i] === G.WATER) return { district: lakeAt(x, z), cross: '' };
    const d = townId[i] ? DISTRICTS[dist[i] - 1] : null;
    if (!d) return { district: countryAt(x, z).replace(/^the /, 'The '), cross: '' };
    const district = d.n === d.town.name ? d.n : `${d.n} · ${d.town.name}`;
    let hs = null, hd = Infinity, vs = null, vd = Infinity;
    for (const s of d.town.segs) {
      if (s.v) { if (z >= s.a0 && z <= s.a1 && Math.abs(x - s.p) < vd) { vd = Math.abs(x - s.p); vs = s; } } else if (x >= s.a0 && x <= s.a1 && Math.abs(z - s.p) < hd) { hd = Math.abs(z - s.p); hs = s; }
    }
    const nm = (s) => s.name || 'Dead End';
    return { district, cross: hs && vs ? (vd < hd ? `${nm(vs)} & ${nm(hs)}` : `${nm(hs)} & ${nm(vs)}`) : hs || vs ? nm(hs || vs) : '' };
  };
  // How thick the dead are on the ground, before the streets and the camps have their say. It builds as you go in: a few out in the
  // country, more along the roads in, thin on a town's edge and thickening block by block to the middle, thickest of all in the
  // busiest districts. The total is the same as it always was; it has only moved toward the middles.
  const townOut = chamfer((i) => !!townId[i]);
  const densityOld = (x, z) => {
    const i = cellOf(x, z);
    if (townId[i]) return (DISTRICTS[dist[i] - 1] || { zone: Z.village }).zone.dens;
    if (ground[i] === G.ROCK) return 1;
    return 4 + 8 * (1 - forestAt(x, z)) + (ground[i] === G.FIELD ? 6 : 0);
  };
  const densityNew = (x, z) => {
    const i = cellOf(x, z);
    if (townId[i]) {
      const base = (DISTRICTS[dist[i] - 1] || { zone: Z.village }).zone.dens;
      return Math.pow(base, 1.25) / Math.pow(100, .25) * (.4 + .9 * sstep(townEdge[i] / 210));
    }
    if (ground[i] === G.ROCK) return .6;
    const country = (4 + 8 * (1 - forestAt(x, z)) + (ground[i] === G.FIELD ? 6 : 0)) * .6;
    // Coming up on a town, the road gets busier before the houses start.
    return country * (1 + 1.6 * sstep(1 - townOut[i] / 255));
  };
  let densK = 1;
  {
    let a = 0, b = 0;
    for (let z = 16; z < WZ; z += 32) for (let x = 16; x < WX; x += 32) { a += densityOld(x, z); b += densityNew(x, z); }
    densK = b > 0 ? a / b : 1;
  }
  const densityAt = (x, z) => densityNew(x, z) * densK;

  const rows = [], aves = [];
  return {
    ground, lot, edge, height, mark, terr, buildings, camps, rows, aves, structs, chunkTop, piers, places, fireSpots,
    props: propArr, binStart, binData, broadway: [], describe, areaOf, densityAt, forestAt, gx, townAt: (x, z) => townId[cellOf(x, z)] > 0, elevAt: elev0, trinityAt: trinityK, cropAt: (x, z) => { const c = fieldCell(x, z); return c === 7 ? 0 : c; }, coastAt: (z) => coastX[Math.max(0, Math.min(WZ - 1, z | 0))], mountain: MT,
    towns: TOWNS.map((t) => ({ key: t.key, name: t.name, x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 })),
    pleasurePier: PLEASURE, timings: TM,
    spawn: { x: camps[0].cx, z: camps[0].cz, y: STREET_Y + 1 },
  };
}

export function ordinal(n) {
  const s = n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + s;
}
