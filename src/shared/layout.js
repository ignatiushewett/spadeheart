// Builds the state plan: coast, river and lakes, the hills and Mt. Page, the highways, the six towns and their lots.
// The result is a set of rasters (one cell per voxel column) read by the chunk generator,
// the far-country mesher, the minimap and the zombie population model.
import { WX, WZ, CS, CW, CD, STREET_Y, FLOOR_H, G } from './constants.js';
import { M } from './materials.js';
import { makeRng, fbm2, noise2, r2 } from './rng.js';
import { CAMP_DEFS, planCamp } from './camps.js';

// Map fractions: u runs west to east, v north to south.
export const xU = (u) => u * WX;
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
};

// What gets built where. f: floors, lot: plot size, house: the yard left round a detached house.
const Z = {
  core: { drop: 0, f: [14, 38], st: [S.glassB, S.glassK, S.glassT, S.limestone, S.deco, S.granite, S.concrete], lot: [36, 64], tall: .3, alley: .35, dens: 190 },
  midtown: { drop: 0.03, f: [7, 20], st: [S.limestone, S.deco, S.glassB, S.glassK, S.concrete, S.granite, S.brick2, S.whitebrick], lot: [28, 50], tall: .16, alley: .3, parking: .03, dens: 150 },
  old: { drop: 0.1, f: [3, 7], st: [S.castiron, S.castiron, S.brick, S.brick2, S.whitebrick, S.limestone], lot: [18, 32], tall: .05, alley: .3, dens: 130 },
  rows: { drop: 0.1, f: [3, 5], st: [S.brownstone, S.brownstone, S.brick, S.limestone, S.brick2, S.redstone, S.graystone], lot: [13, 22], tall: .02, fronts: true, stoops: true, garden: .05, church: .03, alley: .2, dens: 100 },
  eastbank: { drop: 0.14, f: [2, 5], st: [S.brick, S.brick, S.brownstone, S.redstone, S.tenement, S.stucco, S.stuccoB, S.warehouse], lot: [14, 26], tall: .02, fronts: true, stoops: true, garden: .08, church: .04, parking: .04, alley: .25, dens: 70 },
  tenement: { drop: 0.1, f: [4, 9], st: [S.tenement, S.tenement, S.terracotta, S.brick, S.brick2, S.deco, S.redstone, S.stuccoG], lot: [18, 34], tall: .08, towers: true, fronts: true, church: .02, stepped: .3, garden: .04, parking: .03, alley: .3, dens: 120 },
  apartments: { drop: 0.06, f: [8, 19], st: [S.whitebrick, S.limestone, S.brick2, S.concrete, S.deco], lot: [26, 44], tall: .12, alley: .3, dens: 120 },
  works: { drop: 0.22, f: [1, 3], st: [S.warehouse, S.warehouse, S.brick2, S.concrete, S.brick], lot: [38, 70], tall: 0, parking: .14, alley: .4, dens: 70 },
  mainst: { drop: 0.06, f: [2, 4], st: [S.brick, S.brick2, S.castiron, S.limestone, S.whitebrick, S.stucco], lot: [16, 30], tall: .03, parking: .07, alley: .3, dens: 80 },
  commercial: { drop: 0.06, f: [3, 8], st: [S.brick, S.brick2, S.concrete, S.limestone, S.whitebrick, S.deco], lot: [22, 40], tall: .08, parking: .07, alley: .3, dens: 120 },
  finest: { drop: 0.14, f: [2, 4], st: [S.limestone, S.limestone, S.brick, S.graystone, S.whitebrick, S.manorB], lot: [18, 30], tall: 0, fronts: true, garden: .06, alley: .3, dens: 80 },
  strand: { drop: 0.1, f: [5, 15], st: [S.stucco, S.stuccoB, S.beachP, S.beachT, S.whitebrick, S.glassT, S.concrete], lot: [30, 54], tall: .1, parking: .1, alley: .4, dens: 110 },
  houses: { drop: 0.3, f: [1, 2], st: [S.clapW, S.clapB, S.clapY, S.clapG, S.cottage, S.cedar], lot: [21, 29], house: [3, 5], dens: 60 },
  beach: { drop: 0.26, f: [1, 2], st: [S.beachP, S.beachT, S.clapW, S.clapY, S.clapB], lot: [20, 27], house: [3, 4], dens: 50 },
  estate: { drop: 0.38, f: [2, 3], st: [S.manor, S.manor, S.manorB, S.cottage, S.clapW], lot: [56, 88], house: [11, 17], dens: 35 },
  village: { drop: 0.3, f: [1, 2], st: [S.clapW, S.cedar, S.cottage, S.clapY, S.brick], lot: [20, 28], house: [3, 5], dens: 38 },
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

// The shoreline, north to south: [v, u].
const COAST = [[0, .895], [.08, .886], [.16, .878], [.26, .873], [.34, .868], [.44, .86], [.55, .85], [.64, .846], [.72, .86], [.80, .872], [.88, .862], [.95, .835], [1, .80]];
const MT = { x: 1159, z: 1864, r: 500, h: 208 };            // Mt. Page
const LIGHT = { x: 3490, z: 3440, r: 30 };                  // Severn Rock, and the light on it
const RIVER = [[1840, 0], [1812, 200], [1852, 420], [1792, 640], [1842, 860], [1802, 1080], [1852, 1300], [1905, 1450]];

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
  const sstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const inside = (x, z) => x >= 0 && z >= 0 && x < WX && z < WZ;

  // --- Sea, river, lakes ------------------------------------------------------------------------
  const land = new Uint8Array(N);
  const coastU = (v) => {
    for (let i = 1; i < COAST.length; i++) if (v <= COAST[i][0]) {
      const [va, ua] = COAST[i - 1], [vb, ub] = COAST[i];
      return ua + (ub - ua) * sstep((v - va) / (vb - va));
    }
    return COAST[COAST.length - 1][1];
  };
  const coastX = new Int16Array(WZ);
  for (let z = 0; z < WZ; z++) {
    const cx = Math.round(xU(coastU(vZ(z))) + (fbm2(z * .006, 7.7, 3) - .5) * 70);
    coastX[z] = cx;
    land.fill(1, z * WX, z * WX + Math.min(WX, cx));
  }
  const carve = (cx, cz, rx, rz, wob = .22, val = 0) => {
    const m = 1.35;
    for (let z = Math.max(0, Math.floor(cz - rz * m)); z <= Math.min(WZ - 1, Math.ceil(cz + rz * m)); z++) {
      for (let x = Math.max(0, Math.floor(cx - rx * m)); x <= Math.min(WX - 1, Math.ceil(cx + rx * m)); x++) {
        const dx = (x - cx) / rx, dz = (z - cz) / rz;
        if (dx * dx + dz * dz < 1 + (fbm2(x * .017 + cx, z * .017, 2) - .5) * wob * 2) land[z * WX + x] = val;
      }
    }
  };
  const LAKES = [
    ['Severn Bay', 3440, 3420, 235, 150], ['Marsh Lagoon', 3320, 3765, 165, 82], ['Dayton Harbor', 3520, 985, 105, 72], ['Mill Pond', 3168, 1012, 44, 34],
    ['Albion Lake', 1928, 1532, 116, 94], ['Gibson Pond', 2400, 800, 46, 35], ['Weston Pond', 1800, 2392, 52, 40], ['Mirror Lake', 640, 3052, 56, 40], ['Trinity Tarn', 2880, 1690, 40, 30],
  ];
  for (const [, x, z, rx, rz] of LAKES) carve(x, z, rx, rz);
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
  const river = chaikinOpen(RIVER, 3);
  eachNear(river, 24, (i, d, along) => { if (d < 15 + 5 * Math.sin(along * .011)) land[i] = 0; });
  // Severn Rock stands in the mouth of the bay, a long swim from anywhere.
  carve(LIGHT.x, LIGHT.z, LIGHT.r, LIGHT.r, .12, 2);

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
  const dw = chamfer((i) => land[i] === 0);
  const dl = chamfer((i) => land[i] !== 0, 40);

  // --- Towns ------------------------------------------------------------------------------------
  const ord = ordinal;
  const grid = (list, w, names, wide = {}) => list.map((p, k) => ({ p, w: wide[k] || w, name: names[k], k }));
  const TOWNS = [
    {
      key: 'albion', name: 'Albion', x0: 470, x1: 2200, z0: 200, z1: 1520, round: 90, wob: 70, warp: [64, .0016],
      aves: grid([530, 654, 778, 902, 1026, 1150, 1274, 1398, 1522, 1646, 1744, 1920, 2040, 2160], 18,
        ['Westmoor Ave', 'Carrow Ave', 'Linden Ave', 'Page Ave', 'Founders Ave', 'Marlowe Ave', 'Kingsway', 'Exchange Ave', 'Meridian Ave', 'Garrison Ave', 'Quay St', 'Tanner Ave', 'Eastbank Ave', 'Mill Road'], { 6: 24, 10: 14, 13: 14 }),
      rows: grid(Array.from({ length: 17 }, (_, k) => 250 + k * 76), 12, Array.from({ length: 17 }, (_, k) => `${ord(k + 1)} St`), { 2: 18, 6: 18, 10: 18, 14: 18 }),
      bridges: [2, 6, 10, 14],
      zone: (x, z) => {
        if (x > 1870) return z > 1390 ? ['Lakeside', Z.rows] : ['Eastbank', Z.eastbank];
        if (x >= 1262 && x <= 1658 && z >= 696 && z <= 1020) return ['Exchange District', Z.core];
        if (x >= 1140 && x <= 1760 && z >= 540 && z <= 1170) return ['Midtown', Z.midtown];
        if (x > 1660) return ['Riverside', Z.apartments];
        if (z < 480) return ['Northgate', Z.rows];
        if (x < 800) return ['Westmoor', Z.tenement];
        if (z > 1170) return ['Pagefoot', Z.tenement];
        if (z < 640 && x > 1140) return ['Old Quarter', Z.old];
        return x > 1140 ? ['Old Quarter', Z.old] : ['Greenside', Z.apartments];
      },
    },
    {
      key: 'dayton', name: 'Dayton', x0: 3030, x1: 3550, z0: 512, z1: 1372, round: 60, wob: 50, warp: [70, .0026],
      aves: grid([3080, 3180, 3280, 3380, 3480], 14, ['Mill St', 'Cannery Row', 'Dayton Ave', 'Harbor St', 'Shore Rd'], { 2: 18 }),
      rows: grid(Array.from({ length: 12 }, (_, k) => 560 + k * 70), 12, ['Foundry St', 'Union St', 'Cooper St', 'Market St', 'Front St', 'Bay St', 'Pine St', 'Elm St', 'Cedar St', 'Maple St', 'Oak St', 'South St'], { 3: 16 }),
      zone: (x, z) => {
        if (z < 740) return ['Dayton Works', Z.works];
        if (x >= 3190 && x <= 3400 && z >= 740 && z <= 1010) return ['Dayton Center', Z.commercial];
        if (x > 3400 && z < 1100) return ['Harborside', Z.mainst];
        return z < 1010 ? ['Millside', Z.houses] : ['Southside', Z.houses];
      },
    },
    {
      key: 'severn', name: 'Severn Bay', x0: 2890, x1: 3580, z0: 2960, z1: 3610, round: 70, wob: 50, warp: [66, .0026],
      aves: grid([2940, 3050, 3160, 3270, 3380, 3490], 14, ['Marsh Rd', 'Gull Ave', 'Severn Ave', 'Bayview Ave', 'Strand Ave', 'Ocean Dr'], { 3: 18 }),
      rows: grid([3010, 3090, 3170, 3250, 3330, 3410, 3490, 3570], 12, ['Pier St', 'Carousel St', 'Sandpiper St', 'Beacon St', 'Regatta St', 'Anchor St', 'Dune St', 'Lagoon Rd'], { 3: 16 }),
      zone: (x, z, i) => {
        if (dw[i] < 120 && x > 3190) return ['The Strand', Z.strand];
        if (x >= 3060 && x <= 3290 && z >= 3100 && z <= 3330) return ['Severn Bay Center', Z.commercial];
        if (z < 3100) return ['Carousel Park', Z.mainst];
        return ['Bayside', Z.beach];
      },
    },
    {
      key: 'esperance', name: 'Esperance', x0: 450, x1: 1310, z0: 2908, z1: 3686, round: 150, wob: 90, warp: [92, .0022],
      aves: grid([520, 670, 780, 860, 940, 1050, 1200], 12, ['Highland Rd', 'Orchard Ln', 'Chapel St', 'Esperance Ave', 'Vine St', 'Belmont Rd', 'Abbey Rd'], { 3: 16 }),
      rows: grid([2970, 3110, 3200, 3270, 3340, 3430, 3560, 3650], 12, ['Ridge Rd', 'Hawthorn Ln', 'Court St', 'Common St', 'Bell St', 'Laurel Ln', 'Stonegate Rd', 'Southview Rd'], { 5: 16 }),
      zone: (x, z) => (x >= 770 && x <= 1050 && z >= 3190 && z <= 3440 ? ['Esperance Village', Z.finest] : ['Esperance Heights', Z.estate]),
    },
    {
      key: 'weston', name: 'Weston', x0: 1870, x1: 2126, z0: 2416, z1: 2650, round: 40, wob: 30, warp: [36, .004],
      aves: grid([1920, 1997, 2074], 12, ['Grange Rd', 'Main St', 'Silo Rd'], { 1: 14 }),
      rows: grid([2460, 2530, 2600], 12, ['Feed St', 'Church St', 'Depot St']),
      zone: (x) => (Math.abs(x - 1997) < 44 ? ['Weston', Z.mainst] : ['Weston', Z.village]),
    },
    {
      key: 'westpoint', name: 'Westpoint', x0: 290, x1: 530, z0: 1890, z1: 2064, round: 40, wob: 24, warp: [36, .004],
      aves: grid([340, 410, 480], 12, ['Stockade Ln', 'Post Rd', 'Quarry Ln']),
      rows: grid([1940, 2010], 12, ['Drill St', 'Armory St']),
      zone: () => ['Westpoint', Z.village],
    },
    {
      key: 'gibson', name: 'Gibson Valley', x0: 2390, x1: 2640, z0: 474, z1: 700, round: 40, wob: 26, warp: [46, .004],
      aves: grid([2440, 2515, 2590], 12, ['Mill Ln', 'Valley Rd', 'Gibson St']),
      rows: grid([520, 590, 660], 12, ['Orchard St', 'Church St', 'Creek St']),
      zone: (x, z) => (Math.abs(z - 590) < 40 ? ['Gibson Valley', Z.mainst] : ['Gibson Valley', Z.village]),
    },
  ];
  const townId = new Uint8Array(N);
  TOWNS.forEach((t, ti) => {
    const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2, hx = (t.x1 - t.x0) / 2 - t.round, hz = (t.z1 - t.z0) / 2 - t.round;
    for (let z = Math.max(1, t.z0 - t.wob); z <= Math.min(WZ - 2, t.z1 + t.wob); z++) for (let x = Math.max(1, t.x0 - t.wob); x <= Math.min(WX - 2, t.x1 + t.wob); x++) {
      const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
      const sd = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - t.round;
      if (sd + (fbm2(x * .007 + t.x0, z * .007, 2) - .5) * t.wob * 2 < 0) townId[z * WX + x] = ti + 1;
    }
  });

  // --- Where the settlements stand ----------------------------------------------------------------
  // Each one on the quiet side of somewhere, with a road to its gate and something worth having close by.
  const around = (x, z, hw, hd, extra = {}) => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, ...extra });
  const P_LIBRARY = { x0: 1716, x1: 1750, z0: 1338, z1: 1402 };
  const campRects = {
    bryant: { x0: 1504, x1: 1776, z0: 1230, z1: 1510, keep: [P_LIBRARY], plazaX: 1646, plazaZ: 1370 },   // Lakeshore Market, Albion
    battery: around(3090, 3500, 115, 98),      // Severn Landing
    wash: around(1730, 2560, 95, 106),         // Weston Grange
    union: around(410, 2187, 109, 109),        // Fort Westpoint
    sheep: around(2040, 3700, 104, 162),       // Arnhem Bastion
    tompkins: around(3130, 650, 84, 94),       // Cannery Collective, Dayton
    morning: around(2600, 820, 104, 112),      // Gibson Redoubt
    garvey: around(2040, 640, 106, 106),       // Carver Yard, Albion's east bank
    tryon: around(1180, 2980, 100, 110),       // Abbey Keep, above Esperance
  };

  // --- Roads --------------------------------------------------------------------------------------
  // mask: 0 none, 1 gravel shoulder, 2 sidewalk, 3 carriageway
  const mask = new Uint8Array(N);
  const deck = new Uint8Array(N);     // where a road is allowed to cross water on a bridge
  const tun = new Uint8Array(N);      // the Weston Tunnel
  // The town plans. Each town's streets are laid out on a lattice that has been bent: avenues wander, streets curve with the lie of the
  // land, and away from the middle of a town whole stretches of street were never built, so blocks run long and roads end in a T.
  const lat = new Uint8Array(N);       // 1: a park, 2: Meridian Square
  const townCars = [];
  const WO = [0, 0];
  const town = (key) => TOWNS.find((t) => t.key === key);
  // The inside of a block, in the town's own lattice: east of avenue a, south of street r, spanning na avenues and nr streets.
  const blockRect = (t, a, r, na = 1, nr = 1) => {
    const w = t.aves[a], e = t.aves[a + na], n = t.rows[r], s = t.rows[r + nr];
    return { x0: w.p + (w.w >> 1) + 5, x1: e.p - (e.w >> 1) - 5, z0: n.p + (n.w >> 1) + 5, z1: s.p - (s.w >> 1) - 5 };
  };
  const AL = town('albion');
  const PARKS = [['Founders Green', AL, blockRect(AL, 3, 5, 2, 5)], ['Esperance Common', town('esperance'), blockRect(town('esperance'), 3, 3, 1, 1)],
    ['Cooper Square', town('dayton'), blockRect(town('dayton'), 2, 4, 1, 1)], ['Carousel Park', town('severn'), blockRect(town('severn'), 1, 0, 2, 1)],
    ['Weston Green', town('weston'), blockRect(town('weston'), 1, 1)], ['Northgate Gardens', AL, blockRect(AL, 1, 1, 1, 2)], ['Pagefoot Park', AL, blockRect(AL, 5, 13, 1, 2)]];
  // Meridian Square: where Kingsway opens out, under the dead screens.
  AL.square = { x: AL.aves[6].p, z0: AL.rows[8].p, z1: AL.rows[9].p };
  TOWNS.forEach((t, ti) => {
    const [A, f] = t.warp, X0 = t.x0 - t.wob - 24, Z0 = t.z0 - t.wob - 24;
    const GW = Math.ceil((t.x1 - t.x0 + 2 * t.wob + 48) / 8) + 2, GD = Math.ceil((t.z1 - t.z0 + 2 * t.wob + 48) / 8) + 2;
    const ax = new Float32Array(GW * GD), az = new Float32Array(GW * GD);
    for (let q = 0, gz = 0; gz < GD; gz++) for (let gx = 0; gx < GW; gx++, q++) {
      const x = X0 + gx * 8, z = Z0 + gz * 8;
      ax[q] = A * 2 * (fbm2(x * f + ti * 31.7, z * f + 4.1, 2) - .5);
      az[q] = A * 2 * (fbm2(x * f + 9.3, z * f + ti * 17.9, 2) - .5);
    }
    // Real position to lattice position, and back.
    t.map = (x, z) => {
      const fx = Math.max(0, Math.min(GW - 1.001, (x - X0) / 8)), fz = Math.max(0, Math.min(GD - 1.001, (z - Z0) / 8));
      const ix = fx | 0, iz = fz | 0, ux = fx - ix, uz = fz - iz, q = ix + iz * GW;
      WO[0] = x + (ax[q] * (1 - ux) + ax[q + 1] * ux) * (1 - uz) + (ax[q + GW] * (1 - ux) + ax[q + GW + 1] * ux) * uz;
      WO[1] = z + (az[q] * (1 - ux) + az[q + 1] * ux) * (1 - uz) + (az[q + GW] * (1 - ux) + az[q + GW + 1] * ux) * uz;
      return WO;
    };
    t.toReal = (gx, gz) => {
      let x = gx, z = gz;
      for (let k = 0; k < 8; k++) { t.map(x, z); x += gx - WO[0]; z += gz - WO[1]; }
      return [Math.round(x), Math.round(z)];
    };
    t.realX = (gx, z) => { let x = gx; for (let k = 0; k < 8; k++) x += gx - t.map(x, z)[0]; return Math.round(x); };
    const R = t.rows.length, AV = t.aves.length, bridges = t.bridges || [];
    const dropP = (x, z) => { const i = Math.max(0, Math.min(N - 1, Math.round(z) * WX + Math.round(x))); return t.zone(Math.round(x), Math.round(z), i)[1].drop || 0; };
    const segMid = (list, k, far) => (k === 0 ? list[0].p - far : k === list.length ? list[list.length - 1].p + far : (list[k - 1].p + list[k].p) / 2);
    t.aveDrop = t.aves.map((a) => Array.from({ length: R + 1 }, (_, k) => a.w < 18 && r2(ti * 97 + a.k, k * 13 + 5) < dropP(a.p, segMid(t.rows, k, 40))));
    t.rowDrop = t.rows.map((r) => Array.from({ length: AV + 1 }, (_, k) => r.w < 16 && !bridges.includes(r.k) && r2(ti * 89 + r.k + 50, k * 11 + 3) < dropP(segMid(t.aves, k, 40), r.p)));
    t.parks = PARKS.filter((q) => q[1] === t).map((q) => q[2]);
    const id = ti + 1, busy = t.key === 'albion' ? 1 : .6;
    for (let z = Math.max(1, t.z0 - t.wob); z <= Math.min(WZ - 2, t.z1 + t.wob); z++) for (let x = Math.max(1, t.x0 - t.wob); x <= Math.min(WX - 2, t.x1 + t.wob); x++) {
      const i = z * WX + x;
      if (townId[i] !== id) continue;
      t.map(x, z);
      const gx = WO[0], gz = WO[1];
      let a = t.aves[0], da = Infinity, sr = 0;
      for (let k = 0; k < AV; k++) { const q = t.aves[k], dd = Math.abs(gx - q.p); if (dd < da) { da = dd; a = q; } if (q.p < gx) sr = k + 1; }
      let r = t.rows[0], dr = Infinity, sa = 0;
      for (let k = 0; k < R; k++) { const q = t.rows[k], dd = Math.abs(gz - q.p); if (dd < dr) { dr = dd; r = q; } if (q.p < gz) sa = k + 1; }
      const ha = a.w >> 1, hr = r.w >> 1;
      const aveOn = !t.aveDrop[a.k][sa], rowOn = !t.rowDrop[r.k][sr];
      const onA = aveOn && da <= ha, onR = rowOn && dr <= hr;
      const v = onA || onR ? 3 : (aveOn && da <= ha + 4) || (rowOn && dr <= hr + 4) ? 2 : 0;
      if (v > mask[i]) mask[i] = v;
      if (rowOn && dr <= hr + 4 && bridges.includes(r.k)) deck[i] = 1;
      for (const q of t.parks) if (gx >= q.x0 && gx <= q.x1 && gz >= q.z0 && gz <= q.z1) lat[i] = 1;
      if (t.square && Math.abs(gx - t.square.x) <= 28 && gz >= t.square.z0 && gz <= t.square.z1) lat[i] = 2;
      if (v !== 3) continue;
      // Lane lines and crossings.
      let mk = 0;
      if (onA && !onR) {
        if (rowOn && dr - hr > 1 && dr - hr <= 5) mk = x % 2 === 0 ? 3 : 0;
        else if (da < .5 && Math.floor(gz) % 9 < 5) mk = 1;
        else if (a.w >= 18 && Math.abs(da - (a.w >> 2)) < .5 && Math.floor(gz) % 12 < 3) mk = 2;
      } else if (onR && !onA) {
        if (aveOn && da - ha > 1 && da - ha <= 5) mk = z % 2 === 0 ? 3 : 0;
        else if (dr < .5 && Math.floor(gx) % 9 < 4) mk = 2;
      }
      if (mk) mark[i] = mk;
      // Where the cars were left, along the kerbs and in the lanes, clear of the crossings.
      if (onA && !onR && dr > hr + 8 && (sa >= R || t.rows[sa].p - (t.rows[sa].w >> 1) - gz > 22)) {
        for (const ln of a.w >= 18 ? [-ha + 3, -3, 3, ha - 3] : [-ha + 3, ha - 3]) {
          if (Math.floor(gx - a.p) === ln - 2 && Math.floor(gz) % 20 === 0 && r2(ti * 7 + a.k * 31 + ln, Math.floor(gz)) < .3 * busy) townCars.push(x, z, 0, r2(z, x));
        }
      }
      if (onR && !onA && da > ha + 8 && (sr >= AV || t.aves[sr].p - (t.aves[sr].w >> 1) - gx > 22)) {
        for (const ln of [-hr + 2, hr - 2]) {
          if (Math.floor(gz - r.p) === ln - 2 && Math.floor(gx) % 20 === 0 && r2(ti * 5 + r.k * 37 + ln, Math.floor(gx)) < .26 * busy) townCars.push(x, z, 1, r2(x, z));
        }
      }
    }
  });
  const lineMarks = [];
  const stampLine = (pts, w, { walk = false, bridge = true, line = true, smooth = 2 } = {}) => {
    const path = smooth ? chaikinOpen(pts, smooth) : pts;
    const hw = w / 2, hs = hw + (walk ? 4 : 3);
    eachNear(path, hs, (i, d, along) => {
      const v = d <= hw ? 3 : walk || townId[i] ? 2 : 1;
      if (v > mask[i]) mask[i] = v;
      if (bridge) deck[i] = 1;
      if (line && d < .75 && (along % 11) < 6) lineMarks.push(i);
    });
    return path;
  };
  const HW = 14;
  const highways = {
    north: stampLine([[2090, 326], [2420, 190], [2900, 120], [3290, 170], [3380, 400], [3380, 610]], HW),
    gibson: stampLine([[2110, 706], [2360, 640], [2515, 590], [2625, 632], [2800, 720], [2940, 860], [3050, 910], [3130, 910]], HW),
    gibsonNorth: stampLine([[2515, 520], [2520, 330], [2560, 172]], 12),
    coast: stampLine([[3380, 1280], [3400, 1560], [3430, 1850], [3410, 2300], [3330, 2700], [3270, 2900], [3270, 3060]], HW),
    trinity: stampLine([[3428, 1850], [3150, 1800], [2950, 1740], [2885, 1745]], 10, { line: false }),
    lake: stampLine([[1646, 1500], [1672, 1650], [1880, 1790], [2090, 1870], [2200, 1925]], HW),
    weston: stampLine([[2206, 2105], [2110, 2280], [1997, 2400], [1997, 2470]], HW),
    south: stampLine([[1997, 2590], [1997, 2700], [2012, 2950], [2040, 3200], [2050, 3400]], HW),
    southWest: stampLine([[0, 3440], [300, 3430], [580, 3430]], HW),
    southMid: stampLine([[1180, 3430], [1600, 3442], [2050, 3400], [2450, 3360], [2750, 3300], [2900, 3250], [2990, 3250]], HW),
    west: stampLine([[530, 1390], [530, 1500], [455, 1700], [410, 1890], [410, 2420], [470, 2700], [600, 2860], [670, 2940], [670, 3020]], HW),
    page: stampLine([[412, 1800], [600, 1842], [760, 1880], [842, 1900]], 10, { line: false }),
    arnhem: stampLine([[1850, 3425], [1838, 3700], [1900, 3905], [2200, 3905], [2262, 3700], [2250, 3385]], 10, { line: false }),
  };
  // The tunnel under the ridge between the lake country and Weston: the road keeps its level and the hill goes over the top.
  const TUNNEL = [[2200, 1925], [2203, 2015], [2206, 2105]];
  eachNear(TUNNEL, 7, (i, d, along) => {
    if (d > 6.5) return;
    mask[i] = 3; tun[i] = 1;
    if (d < .75 && (along % 11) < 6) lineMarks.push(i);
  });
  // A way from each gate out to the nearest road, for the ones that stand out in the country.
  for (const pts of [
    [[2600, 708], [2612, 640]], [[2600, 932], [2596, 990]],                                    // Gibson Redoubt
    [[1825, 2560], [1870, 2546], [1920, 2530]], [[1730, 2454], [1742, 2420]], [[1730, 2666], [1730, 2710]],   // Weston Grange
    [[2040, 3538], [2046, 3400]], [[2040, 3862], [2040, 3905]], [[2144, 3700], [2262, 3700]],   // Arnhem Bastion
    [[519, 2187], [580, 2187]],                                                                 // Fort Westpoint's east gate
    [[1080, 2980], [1050, 2980]], [[1180, 3090], [1200, 3110]],                                 // Abbey Keep
  ]) stampLine(pts, 10, { line: false, smooth: 0 });
  // A diagonal across Albion's grid, older than the grid is.
  const postRoad = stampLine([[1026, 250], [1620, 1238]], 14, { walk: true, bridge: false, smooth: 0 });
  // Older roads than the grids, which the grids were laid over: Canal Way through west Albion, Harbor Road into Dayton, Abbey Road down through Esperance.
  stampLine([[560, 1250], [880, 900], [1150, 620]], 14, { walk: true, bridge: false });
  stampLine([[3060, 1330], [3250, 1120], [3400, 1000]], 12, { walk: true, bridge: false });
  stampLine([[470, 3030], [700, 3180], [880, 3330], [1080, 3600]], 12, { walk: true, bridge: false });

  // --- Ground classes -----------------------------------------------------------------------------
  const fieldAt = (x, z) => {
    const e = (cx, cz, rx, rz) => ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2;
    const m = Math.min(e(1997, 2540, 560, 420), e(2040, 3690, 470, 300), e(2515, 640, 250, 200), e(900, 2560, 200, 150));
    return m < 1.3 && m + (fbm2(x * .006, z * .006 + 3, 2) - .5) * .5 < 1;
  };
  for (let z = 0, i = 0; z < WZ; z++) for (let x = 0; x < WX; x++, i++) {
    const m = mask[i];
    if (!land[i]) {
      if (m >= 2 && deck[i]) { ground[i] = m === 3 ? G.ROAD : G.WALK; mark[i] = 16; } else ground[i] = G.WATER;
      continue;
    }
    if (land[i] === 2) { ground[i] = Math.hypot(x - LIGHT.x, z - LIGHT.z) < 21 ? G.PLAZA : G.ROCK; continue; }
    if (m === 3) { ground[i] = G.ROAD; continue; }
    const d = dw[i];
    if (townId[i]) {
      // A town meets its water with a boardwalk; everything else is a lot until something claims it.
      ground[i] = d < 7 ? G.PROM : m === 2 || d < 10 ? G.WALK : G.LOT;
      continue;
    }
    if (m === 2) { ground[i] = G.WALK; continue; }
    if (m === 1) { ground[i] = G.DIRT; continue; }
    if (d < 9 && x > coastX[z] - 60) { ground[i] = G.SAND; continue; }
    if (d > 14 && fieldAt(x, z)) {
      // Plots with a track round each: corn, wheat, rows of vegetables, cut hay, and pasture left as grass.
      const fx = x + 30, px = Math.floor(fx / 92), pz = Math.floor(z / 66);
      if (fx % 92 < 3 || z % 66 < 3) { ground[i] = G.DIRT; continue; }
      const crop = Math.floor(r2(px * 7 + 3, pz * 13 + 1) * 6);
      if (crop !== 3) { ground[i] = G.FIELD; mark[i] = crop + 1; continue; }
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
  const SQ = (() => { const [x, z0] = AL.toReal(AL.square.x, AL.square.z0), [, z1] = AL.toReal(AL.square.x, AL.square.z1); return { x, z0, z1 }; })();
  // Piers: Dayton's working harbour, and the pleasure pier at Severn Bay.
  const piers = [];
  const pier = (x, z, dx, dz, len, half) => {
    for (let s = 0; s <= len; s++) for (let o = -half; o <= half; o++) {
      const px = x + dx * s + dz * o, pz = z + dz * s + dx * o;
      if (inside(px, pz) && !land[pz * WX + px]) { ground[pz * WX + px] = G.PROM; mark[pz * WX + px] = 16; }
    }
    piers.push({ x: x + dx * len, z: z + dz * len });
  };
  for (const pz of [935, 985, 1035]) { let x = 3380; while (x < WX - 2 && land[pz * WX + x]) x++; pier(x - 2, pz, 1, 0, 46, 5); }
  { let z = 3200; while (z < WZ - 2 && land[z * WX + 3440]) z++; pier(3440, z - 2, 0, 1, 90, 7); }
  { let x = 3500; while (x < WX - 2 && land[3090 * WX + x]) x++; pier(x - 2, 3090, 1, 0, 70, 6); }

  // --- Camps -------------------------------------------------------------------------------------
  // Each camp is a walled compound. Everything inside the wall is cleared except the roads, which survive as the settlement's streets.
  const campMask = new Uint8Array(N);
  const filled = {};
  const GREEN = { sheep: 1, wash: 1 };
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

  // --- Lots and buildings ----------------------------------------------------------------------------
  const buildings = [];
  const addBuilding = (b) => { buildings.push(b); b.id = buildings.length; return b.id; };
  const zoneOf = (x, z) => {
    const i = z * WX + x, t = TOWNS[townId[i] - 1];
    return t ? t.zone(x, z, i) : ['', Z.village];
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
  const sub = (r, w, d) => { const c = mid(r); return { x0: c.x - (w >> 1), x1: c.x + (w >> 1), z0: c.z - (d >> 1), z1: c.z + (d >> 1) }; };
  // A block's middle, found back in the real world, with a building of the given size round it.
  const subT = (t, r, w, d) => { const [x, z] = t.toReal((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); return { x0: x - (w >> 1), x1: x + (w >> 1), z0: z - (d >> 1), z1: z + (d >> 1) }; };
  const R_EXCHANGE = subT(AL, blockRect(AL, 7, 7), 44, 44), R_MERIDIAN = subT(AL, blockRect(AL, 8, 8), 34, 34), R_CARROW = subT(AL, blockRect(AL, 6, 9), 38, 38);
  const R_STATE = subT(AL, blockRect(AL, 7, 3), 70, 38), R_TERMINAL = subT(AL, blockRect(AL, 9, 6), 80, 36), R_HOSPITAL = subT(AL, blockRect(AL, 1, 8), 64, 36);
  const R_GRAND = subT(town('severn'), blockRect(town('severn'), 4, 2), 60, 40), R_ELEVATOR = subT(town('weston'), { x0: 2092, x1: 2118, z0: 2470, z1: 2484 }, 26, 14);
  landmark('Exchange Tower', R_EXCHANGE, S.limestone, [0, 13, 5, 21, 9, 31, 13, 37]);
  landmark('Meridian Building', R_MERIDIAN, S.deco, [0, 10, 4, 22, 8, 33]);
  landmark('Carrow Trust', R_CARROW, S.glassB, [0, 36]);
  landmark('Albion Athenaeum', P_LIBRARY, S.limestone, [0, 4]);
  landmark('State House', R_STATE, S.limestone, [0, 3, 12, 6]);
  landmark('Union Terminal', R_TERMINAL, S.granite, [0, 4]);
  landmark('Albion General', R_HOSPITAL, S.whitebrick, [0, 9]);
  landmark('Grand Severn Hotel', R_GRAND, S.beachP, [0, 6, 6, 14]);
  landmark('Weston Co-op Elevator', R_ELEVATOR, S.silo, [0, 10], { blank: true });

  // Farmsteads out among the fields: a house, a barn and a silo round a dirt yard.
  const farms = [];
  const farmRng = makeRng(seed + 77);
  for (let t = 0; t < 2600 && farms.length < 46; t++) {
    const x = 300 + Math.floor(farmRng() * (WX - 900)), z = 300 + Math.floor(farmRng() * (WZ - 500));
    if (!fieldAt(x, z) || farms.some((f) => Math.hypot(f.x - x, f.z - z) < 150)) continue;
    let ok = true;
    for (let dz = -30; dz <= 30 && ok; dz += 6) for (let dx = -36; dx <= 36 && ok; dx += 6) {
      const g = ground[(z + dz) * WX + x + dx];
      if (g !== G.FIELD && g !== G.PARK && g !== G.DIRT || campMask[(z + dz) * WX + x + dx] || townId[(z + dz) * WX + x + dx]) ok = false;
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
  landmark('Trinity Ranger Station', { x0: 2856, x1: 2876, z0: 1756, z1: 1772 }, S.cedar, [0, 1], { house: true, rise: 4 });
  landmark('Mt. Page Trailhead', { x0: 848, x1: 866, z0: 1906, z1: 1920 }, S.cedar, [0, 1], { house: true, rise: 4 });
  fillGround({ x0: 2840, x1: 2884, z0: 1730, z1: 1754 }, G.DIRT, (g) => g === G.PARK);
  fillGround({ x0: 846, x1: 880, z0: 1876, z1: 1904 }, G.DIRT, (g) => g === G.PARK);

  // Flood fill the remaining lot cells into blocks, then split each block into lots.
  const label = new Int32Array(N);
  const stack = new Int32Array(N >> 1);
  const lotsOut = [];
  const parking = [];
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
      for (const n of [c - 1, c + 1, c - WX, c + WX]) {
        if (n >= 0 && n < N && ground[n] === G.LOT && !lot[n] && !label[n]) { label[n] = lbl; stack[sp++] = n; }
      }
    }
    if (cells < 60) continue; // left as paved ground below
    const split = (ax, az, bx, bz) => {
      const w = bx - ax + 1, d = bz - az + 1;
      const zone = zoneOf((ax + bx) >> 1, (az + bz) >> 1)[1];
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
    const zone = zoneOf((L.ax + L.bx) >> 1, (L.az + L.bz) >> 1)[1];
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
    if (zone.parking && thin >= 18 && r() < zone.parking) { turn(G.PLAZA, 4); parking.push(L); continue; }
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
      else { ground[i] = zone.house ? G.PARK : G.PLAZA; mark[i] = 0; }
    }
  }
  // Any unclaimed lot ground (slivers, tiny blocks) becomes pavement in town and grass out of it.
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

  // Across the street from every gate the crews knocked down whatever stood there, and hauled off the wrecks: a clear field for the
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
  for (let z = 1; z < WZ - 1; z++) for (let x = 1, i = z * WX + 1; x < WX - 1; x++, i++) {
    const id = lot[i];
    if (!id) continue;
    const b = buildings[id - 1], e = edge[i];
    let h = b.tiers[1];
    for (let t = 2; t < b.tiers.length; t += 2) if (e >= b.tiers[t]) h = b.tiers[t + 1];
    // A house roof climbs a step for every step in from the eaves.
    height[i] = b.house ? h + Math.min(e, b.rise || 4) : h;
  }
  // Stairwells: two flights round a spine, five wide and six deep, near the core wherever one fits with a wall's width to spare.
  for (const b of buildings) {
    b.top = b.tiers[b.tiers.length - 1];
    b.sx = -1;
    if (b.gone || b.blank || b.open) continue;
    const floors = (b.top - STREET_Y) / FLOOR_H;
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
    b.tank = !b.house && b.top > (b.harlem ? 36 : 48) && STYLES[b.style].cast !== 2 && (b.seed % 100) < (b.harlem ? 60 : 45);
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
    const floors = (b.tiers[1] - STREET_Y) / FLOOR_H;
    if (wide > room - 4 || floors < 3) continue;
    const high = 5 * scale + 3;
    const pair = AD_PAIRS[Math.floor(r2(b.id, 9) * AD_PAIRS.length)];
    const floor = 1 + Math.floor(r2(b.id, 11) * Math.max(1, Math.min(floors - 2, 6)));
    const t0 = (alongX ? b.x0 : b.z0) + ((room - wide) >> 1);
    b.ad = { alongX, t0, t1: t0 + wide - 1, y0: top(floor), y1: top(floor) + high - 1, word, scale, bg: pair[0], fg: pair[1] };
  }
  const fireSpots = [];
  const campNear = (x, z, m) => CAMP_DEFS.some((d) => { const r = campRects[d.key]; return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; });

  // --- Terrain -----------------------------------------------------------------------------------
  // Towns, roads, fields and settlements all keep the one street level. The country between them carries the relief: a low plain along
  // the coast, hills that climb as you go west, the Trinity ridge, and Mt. Page standing over all of it.
  for (let k = 0; k < rubble.length; k += 2) if (ground[rubble[k]] === G.WATER) ground[rubble[k]] = G.ROCK;
  const slump = new Map();
  for (let k = 0; k < rubble.length; k += 2) slump.set(rubble[k], Math.min(slump.get(rubble[k]) ?? 99, rubble[k + 1]));
  const gauss = (x, z, cx, cz, rx, rz) => Math.exp(-(((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2));
  const elev = (x, z) => {
    const west = sstep((.68 - x / WX) / .52);
    const n = fbm2(x * .0032 + 11, z * .0032 + 5, 4);
    let e = 2.5 + west * 26 + Math.max(-.5, n - .36) * (16 + west * 64);
    e += 44 * gauss(x, z, 2870, 1700, 340, 270);          // Trinity Forest
    e += 46 * gauss(x, z, 2203, 2015, 560, 115);          // the ridge the tunnel goes under
    e += 22 * gauss(x, z, 2500, 330, 300, 160);           // the north side of Gibson Valley
    const d = Math.hypot(x - MT.x, z - MT.z) / MT.r;
    if (d < 1) e += MT.h * Math.pow(1 - d, 1.5) * (.8 + .4 * fbm2(x * .011, z * .011, 3));
    return Math.max(0, Math.min(236, e));
  };
  const QW = (WX >> 2) + 1;
  const EQ = new Float32Array(QW * QW);
  for (let qz = 0; qz < QW; qz++) for (let qx = 0; qx < QW; qx++) EQ[qx + qz * QW] = elev(qx * 4, qz * 4);
  const flat = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const g = ground[i];
    flat[i] = (g === G.WATER || townId[i] || (mask[i] && !tun[i]) || g === G.FIELD || g === G.LOT || g === G.DIRT || g === G.SAND || g === G.PLAZA || g === G.PROM || land[i] === 2) ? 1 : 0;
  }
  for (const def of CAMP_DEFS) {
    const r = campRects[def.key];
    for (let z = Math.max(0, r.z0 - 34); z <= Math.min(WZ - 1, r.z1 + 34); z++) flat.fill(1, z * WX + Math.max(0, r.x0 - 34), z * WX + Math.min(WX - 1, r.x1 + 34) + 1);
  }
  const df = chamfer((i) => flat[i] === 1);
  const BLEND = 92;
  const forestAt = (x, z) => {
    const n = fbm2(x * .0045 + 3, z * .0045 + 8, 3);
    const trin = ((x - 2860) / 430) ** 2 + ((z - 1700) / 430) ** 2 + (fbm2(x * .006 + 1, z * .006 + 2, 2) - .5) * .9;
    const k = (n - .44) * 2.2 + 1.7 * sstep((1.15 - trin) / .35) + .6 * sstep((.24 - x / WX) / .24) + .5 * sstep((.11 - z / WZ) / .11) + .4 * gauss(x, z, MT.x, MT.z, 560, 560);
    return Math.max(0, Math.min(1, k));
  };
  for (let z = 0, i = 0; z < WZ; z++) {
    const qz = z >> 2, fz = (z & 3) / 4;
    for (let x = 0; x < WX; x++, i++) {
      const g = ground[i];
      if (campMask[i] && g !== G.WATER) { terr[i] = 0; continue; }
      if (g === G.WATER) { terr[i] = -6 - Math.min(4, dl[i] >> 2); continue; }
      if (mark[i] & 16) { terr[i] = g === G.ROAD ? -1 : 0; continue; }
      const qx = x >> 2, fx = (x & 3) / 4, q = qx + qz * QW;
      const e = (EQ[q] * (1 - fx) + EQ[q + 1] * fx) * (1 - fz) + (EQ[q + QW] * (1 - fx) + EQ[q + QW + 1] * fx) * fz;
      // The tunnel's ridge keeps its height right up to the portals, however near the road is.
      const h = Math.round(e * sstep(df[i] / BLEND) + 40 * gauss(x, z, 2203, 2015, 330, 72));
      if (tun[i]) {
        terr[i] = -1;
        // Deep enough under the hill to have a roof: the column's top is the hillside, and the road runs through underneath.
        if (h >= 10) { height[i] = Math.min(250, STREET_Y + h); mark[i] |= 32; }
        continue;
      }
      if (g === G.ROAD) { terr[i] = -1; continue; }
      if (g === G.PLAZA) { terr[i] = mark[i] === 4 ? -1 : 0; continue; }
      if (g === G.SAND) { terr[i] = Math.min(0, -4 + (dw[i] >> 1)); continue; }
      if (g !== G.PARK) continue;
      // Banks shelve into the water, and the marsh behind the spit barely clears it.
      let t = h;
      if (dw[i] < 6 && !townId[i]) t = Math.min(t, -3 + (dw[i] >> 1));
      terr[i] = t;
      // Bare granite on the dome of Mt. Page, as on every big rock in this part of the South.
      if (t > 124 + noise2(x * .02, z * .02) * 30 || (t > 20 && noise2(x * .045, z * .045) > .93)) ground[i] = G.ROCK;
    }
  }
  for (const [i, d] of slump) terr[i] = -d;
  // Cliffs: wherever the hillside is too steep to hold soil.
  for (let z = 2; z < WZ - 2; z++) for (let x = 2, i = z * WX + 2; x < WX - 2; x++, i++) {
    if (ground[i] !== G.PARK || terr[i] < 12) continue;
    if (Math.abs(terr[i + 2] - terr[i - 2]) + Math.abs(terr[i + 2 * WX] - terr[i - 2 * WX]) > 8) ground[i] = G.ROCK;
  }

  // --- Props ----------------------------------------------------------------------------------------
  const props = [];
  const addProp = (t, x, z, a = 0, b = 0, c = 0) => { if (inside(x, z) && !campMask[z * WX + x] && !clearMask[z * WX + x]) props.push(t, x, z, a, b, c); };
  const groundAt = (x, z) => (inside(x, z) ? ground[z * WX + x] : G.WATER);
  const placeCar = (x, z, dir, seedVal, lotOK) => {
    const g = groundAt(x, z);
    if (!(g === G.ROAD || (lotOK && g === G.PLAZA)) || tun[z * WX + x]) return;
    const r = seedVal;
    const kind = r < .5 ? 0 : r < .56 ? 1 : r < .62 ? 2 : r < .78 ? 3 : r < .83 ? 4 : r < .88 ? 5 : 6; // sedan,taxi,bus,truck,police,ambulance,wreck
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
    for (let z = L.az + 2; z + 9 <= L.bz; z += 13) for (let x = L.ax + 2; x + 4 <= L.bx; x += 6) {
      if (r2(x, z + 5) < .3) placeCar(x, z, 0, r2(z, x + 9), true);
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
    } else if (g === G.ROCK && !mark[i] && r2(x, z + 1) < .12) addProp(P.ROCK, x, z, Math.floor(r2(z, x) * 999));
    else if (g === G.FIELD && mark[i] === 6 && r2(x, z + 2) < .16) addProp(P.BALE, x, z, Math.floor(r2(z, x) * 999));
  }
  // Abandoned army checkpoints: at some of Albion's big crossings, and where each highway comes into a town.
  for (const r of AL.rows) if (r.w >= 18) for (const a of AL.aves) {
    // Kingsway stays clear through Meridian Square.
    if (a.k === 6 && r.k >= 6 && r.k <= 10) continue;
    const [cx, cz] = AL.toReal(a.p, r.p);
    if (r2(r.k, a.k) < .16 && ground[cz * WX + cx] === G.ROAD) addProp(P.CHECKPOINT, cx, cz, Math.floor(r2(a.k, r.k) * 99));
  }
  for (const [x, z] of [[2290, 258], [3380, 470], [2960, 874], [3392, 1450], [3272, 2930], [2820, 3284], [1380, 3432], [380, 3430], [1997, 2360], [2000, 2760], [470, 1660], [1660, 1600]]) {
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

  // --- Large structures (generated by bbox, a few dozen only) --------------------------------------
  const structs = [];
  for (const c of camps) structs.push({ type: 'camp', id: c.id, x0: c.x0 - 6, x1: c.x1 + 6, z0: c.z0 - 6, z1: c.z1 + 6, y1: c.maxY });
  const spire = (name, r, y0, y1, r0) => {
    const { x, z } = mid(r);
    structs.push({ type: 'spire', name, x, z, y0, y1, r0, x0: x - r0, x1: x + r0, z0: z - r0, z1: z + r0 });
  };
  spire('exchange', R_EXCHANGE, top(37), 255, 2);
  spire('chrysler', R_MERIDIAN, top(33), 242, 6);
  spire('state', R_STATE, top(6), top(6) + 22, 7);
  // Meridian Square: the screens are still on the buildings, and the power has been off for six weeks.
  for (const side of [-1, 1]) {
    let z = SQ.z0 + 2;
    while (z < SQ.z1 - 8) {
      const cx = AL.realX(AL.square.x, z);
      let x = cx + side * 8;
      while (Math.abs(x - cx) < 70 && !lot[z * WX + x]) x += side;
      const id = lot[z * WX + x];
      if (!id) { z += 6; continue; }
      // Run along the face for as long as it stays flat and tall enough.
      // The square curves a little, and its fronts step with it: follow the face along, and hang the screen off the part nearest the square.
      let z1 = z, face = x;
      while (z1 < SQ.z1 && z1 - z < 34) {
        const nz = z1 + 1, cn = AL.realX(AL.square.x, nz);
        let fx = cn + side * 8;
        while (Math.abs(fx - cn) < 70 && !lot[nz * WX + fx]) fx += side;
        if (lot[nz * WX + fx] !== id || Math.abs(fx - x) > 3) break;
        if ((fx - face) * side < 0) face = fx;
        z1 = nz;
      }
      x = face;
      const tall = height[z * WX + x];
      if (z1 - z >= 10 && tall >= STREET_Y + 18) {
        let y = STREET_Y + 7;
        const bands = Math.min(3, Math.floor((tall - STREET_Y - 8) / 16));
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
    if (r2(b.id, 57) > .2 || b.name !== undefined || b.house || b.gone || b.top < STREET_Y + 18 || b.top > STREET_Y + 110 || b.bestE < 12) continue;
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

  // --- Names ------------------------------------------------------------------------------------
  // Places worth a name on the map. tier 0 shows at any zoom, tier 1 only when you are looking closely.
  const tc = (t) => [(t.x0 + t.x1) / 2, (t.z0 + t.z1) / 2];
  const places = [
    ...TOWNS.map((t) => [t.name, ...tc(t), 0, 'area']),
    ['Exchange District', 1460, 860, 1, 'area'], ['Midtown', 1460, 1110, 1, 'area'], ['Old Quarter', 1400, 590, 1, 'area'], ['Northgate', 1000, 360, 1, 'area'], ['Westmoor', 640, 800, 1, 'area'],
    ['Greenside', 960, 1090, 1, 'area'], ['Pagefoot', 1000, 1330, 1, 'area'], ['Riverside', 1715, 620, 1, 'area'], ['Eastbank', 2030, 880, 1, 'area'], ['Lakeside', 2060, 1440, 1, 'area'],
    ['Dayton Works', 3290, 620, 1, 'area'], ['Dayton Center', 3295, 880, 1, 'area'], ['Harborside', 3440, 860, 1, 'area'], ['Southside', 3280, 1220, 1, 'area'],
    ['The Strand', 3440, 3130, 1, 'area'], ['Bayside', 2990, 3380, 1, 'area'], ['Esperance Village', 905, 3315, 1, 'area'], ['Esperance Heights', 620, 3520, 1, 'area'],
    ...PARKS.map(([name, t, p]) => [name, ...t.toReal(mid(p).x, mid(p).z), 1, 'park']),
    ['Mt. Page', MT.x, MT.z, 0, 'park'], ['Trinity Forest', 2870, 1640, 0, 'park'], ['Arnhem Fields', 2040, 3960, 0, 'park'], ['Albion River', 1830, 150, 1, 'park'],
    ...LAKES.filter(([name]) => name !== 'Dayton Harbor').map(([name, x, z]) => [name, x, z, name === 'Severn Bay' ? 2 : 1, 'park']),
    ['Weston Tunnel', 2203, 2015, 0, 'bridge'], ['Severn Rock Light', LIGHT.x, LIGHT.z, 0, 'mark'], ['Dayton Harbor', 3470, 985, 1, 'mark'],
    ['Exchange Tower', mid(R_EXCHANGE).x, mid(R_EXCHANGE).z, 1, 'mark'], ['Meridian Building', mid(R_MERIDIAN).x, mid(R_MERIDIAN).z, 1, 'mark'], ['Carrow Trust', mid(R_CARROW).x, mid(R_CARROW).z, 1, 'mark'],
    ['Meridian Square', SQ.x, (SQ.z0 + SQ.z1) >> 1, 0, 'mark'], ['State House', mid(R_STATE).x, mid(R_STATE).z, 1, 'mark'], ['Union Terminal', mid(R_TERMINAL).x, mid(R_TERMINAL).z, 1, 'mark'],
    ['Albion General', mid(R_HOSPITAL).x, mid(R_HOSPITAL).z, 1, 'mark'], ['Albion Athenaeum', mid(P_LIBRARY).x, mid(P_LIBRARY).z, 1, 'mark'], ['Grand Severn Hotel', mid(R_GRAND).x, mid(R_GRAND).z, 1, 'mark'],
    ['Weston Co-op Elevator', 2105, 2477, 1, 'mark'], ['Trinity Ranger Station', 2866, 1764, 1, 'mark'], ['Mt. Page Trailhead', 857, 1913, 1, 'mark'],
  ].filter((p) => p[3] < 2).map(([name, x, z, tier, kind]) => ({ name, x: Math.round(x), z: Math.round(z), tier, kind }));

  // The country between the towns, by whatever is nearest.
  const COUNTRY = [['Mt. Page', MT.x, MT.z, 640], ['Trinity Forest', 2870, 1700, 520], ['Gibson Valley', 2515, 640, 420], ['Arnhem Fields', 2040, 3700, 560], ['Weston farmland', 1997, 2540, 620],
    ['Westpoint', 410, 2100, 380], ['the Severn marshes', 3300, 3780, 300], ['the Esperance hills', 880, 3300, 760], ['the lake country', 1900, 1700, 330]];
  const lakeAt = (x, z) => {
    for (const [name, lx, lz, rx, rz] of LAKES) if (((x - lx) / (rx * 1.4)) ** 2 + ((z - lz) / (rz * 1.4)) ** 2 < 1) return name;
    return x > coastX[Math.max(0, Math.min(WZ - 1, Math.floor(z)))] - 80 ? 'The Atlantic' : 'Albion River';
  };
  const countryAt = (x, z) => {
    let best = null, bd = 1;
    for (const [name, cx, cz, r] of COUNTRY) { const d = Math.hypot(x - cx, z - cz) / r; if (d < bd) { bd = d; best = name; } }
    if (best) return best;
    if (z < 480) return 'the North Woods';
    if (x > 3000) return 'the coast road';
    return x < 1500 ? 'the Page highlands' : 'the back country';
  };
  const cellOf = (x, z) => Math.max(0, Math.min(WZ - 1, Math.floor(z))) * WX + Math.max(0, Math.min(WX - 1, Math.floor(x)));
  // The part of the state somewhere is in, whether or not there is a wall around it now.
  const areaOf = (x, z) => {
    const i = cellOf(x, z), t = TOWNS[townId[i] - 1];
    if (!t) return countryAt(x, z);
    const d = t.zone(Math.floor(x), Math.floor(z), i)[0];
    return d === t.name ? d : `${d}, ${t.name}`;
  };
  const describe = (x, z) => {
    for (const c of camps) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return { district: c.name, cross: 'Inside the wall' };
    const i = cellOf(x, z), t = TOWNS[townId[i] - 1];
    if (ground[i] === G.WATER) return { district: lakeAt(x, z), cross: '' };
    if (!t) return { district: countryAt(x, z).replace(/^the /, 'The '), cross: '' };
    const [gx, gz] = t.map(x, z);
    const row = t.rows.reduce((b, r) => (Math.abs(r.p - gz) < Math.abs(b.p - gz) ? r : b), t.rows[0]);
    const ave = t.aves.reduce((b, a) => (Math.abs(a.p - gx) < Math.abs(b.p - gx) ? a : b), t.aves[0]);
    const d = t.zone(Math.floor(x), Math.floor(z), i)[0];
    return { district: d === t.name ? d : `${d} · ${t.name}`, cross: `${row.name} & ${ave.name}` };
  };
  // How thick the dead are on the ground, before the streets and the camps have their say.
  const densityAt = (x, z) => {
    const i = cellOf(x, z), t = TOWNS[townId[i] - 1];
    if (t) return t.zone(Math.floor(x), Math.floor(z), i)[1].dens;
    if (ground[i] === G.ROCK) return 1;
    return 4 + 8 * (1 - forestAt(x, z)) + (ground[i] === G.FIELD ? 6 : 0);
  };

  const rows = [], aves = [];
  return {
    ground, lot, edge, height, mark, terr, buildings, camps, rows, aves, structs, chunkTop, piers, places, fireSpots,
    props: propArr, binStart, binData, broadway: postRoad, describe, areaOf, densityAt, forestAt, mountain: MT, towns: TOWNS.map((t) => ({ key: t.key, name: t.name, x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1 })),
    spawn: { x: camps[0].cx, z: camps[0].cz, y: STREET_Y + 1 },
  };
}

export function ordinal(n) {
  const s = n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + s;
}
