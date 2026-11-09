// Builds the Manhattan city plan: coastline, street grid, parks, lots and buildings.
// The result is a set of rasters (one cell per voxel column) read by the chunk generator,
// the far-city mesher, the minimap and the zombie population model.
import { WX, WZ, CS, CW, CD, STREET_Y, FLOOR_H, G } from './constants.js';
import { M } from './materials.js';
import { makeRng, fbm2, noise2, r2 } from './rng.js';
import { CAMP_DEFS, planCamp } from './camps.js';

export const xU = (u) => 60 + u * 1380;
export const zV = (v) => 6050 - v * 5950;
export const uX = (x) => (x - 60) / 1380;
export const vZ = (z) => (6050 - z) / 5950;

const COAST = [
  [.30, .00], [.22, .015], [.15, .04], [.11, .075], [.08, .12], [.065, .20], [.045, .30], [.06, .40], [.10, .50],
  [.15, .60], [.19, .69], [.24, .76], [.28, .82], [.33, .90], [.40, .97], [.50, 1.0], [.62, .985], [.66, .95],
  [.63, .88], [.68, .79], [.80, .71], [.94, .63], [1.0, .58], [.985, .50], [.95, .42], [.97, .33], [1.0, .25],
  [1.0, .17], [.93, .12], [.76, .075], [.58, .03], [.42, .005],
];

// Street number -> north/south position, anchored on the real crosstown streets.
const STOPS = [[1, .155], [14, .20], [23, .24], [34, .29], [42, .33], [57, .40], [72, .47], [86, .53], [96, .57],
  [110, .63], [125, .69], [145, .76], [155, .80], [181, .89], [207, .975]];
const vNum = (n) => {
  for (let i = 1; i < STOPS.length; i++) {
    if (n <= STOPS[i][0]) {
      const [a, va] = STOPS[i - 1], [b, vb] = STOPS[i];
      return va + (vb - va) * (n - a) / (b - a);
    }
  }
  return STOPS[STOPS.length - 1][1];
};
export const zNum = (n) => Math.round(zV(vNum(n)));

const AVE_NAMES = ['12th Ave', '11th Ave', '10th Ave', '9th Ave', '8th Ave', '7th Ave', '6th Ave', '5th Ave', 'Madison Ave',
  'Park Ave', 'Lexington Ave', '3rd Ave', '2nd Ave', '1st Ave', 'York Ave'];
const aveU = (a) => .06 + a * .0655;
export const aveX = (a) => Math.round(xU(aveU(a)));
const AVE_W = [18, 18, 18, 18, 18, 18, 18, 18, 14, 22, 14, 18, 18, 18, 14];

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
  // Harlem: rows of stone fronts, tan and plum tenements with their fire escapes, terracotta and the odd painted front.
  { name: 'redstone', wall: M.BRICK_P, trim: M.BROWNSTONE, glass: M.GLASS_K, p: 4, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, cornice: M.IRON },
  { name: 'tenement', wall: M.BRICK_O, trim: M.CONCRETE_D, glass: M.GLASS_K, p: 3, w: 1, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, escape: true, cornice: M.STEEL_D },
  { name: 'graystone', wall: M.LIMESTONE, trim: M.GRANITE, glass: M.GLASS_K, p: 5, w: 3, floor: M.WOOD_FLOOR, roof: M.ROOF_GRAVEL, cast: 0, cornice: M.GRANITE },
  { name: 'terracotta', wall: M.BRICK_R, trim: M.BRICK_O, glass: M.GLASS_A, p: 4, w: 2, floor: M.CARPET, roof: M.ROOF_TAR, cast: 0, cornice: M.COPPER },
  { name: 'stucco', wall: M.STUCCO, trim: M.BRICK_B, glass: M.GLASS_K, p: 5, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, cornice: M.WOOD_D },
  { name: 'stuccoB', wall: M.STUCCO_B, trim: M.CONCRETE, glass: M.GLASS_K, p: 4, w: 2, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, cornice: M.CONCRETE_D },
  { name: 'stuccoG', wall: M.STUCCO_G, trim: M.BRICK_R2, glass: M.GLASS_K, p: 3, w: 1, floor: M.WOOD_FLOOR, roof: M.ROOF_TAR, cast: 0, escape: true, cornice: M.BRICK_R2 },
];
const S = Object.fromEntries(STYLES.map((s, i) => [s.name, i]));

export const P = { CAR: 1, TREE: 2, LAMP: 3, HYDRANT: 4, TRASH: 5, DUMPSTER: 6, CHECKPOINT: 7, PARKTREE: 8, BENCH: 9, NEWS: 10, ROCK: 11 };
export const PROP_STRIDE = 6;

export const ROLES = {
  general: { title: 'General Trader', sign: M.AWN_G },
  arms: { title: 'Arms Dealer', sign: M.AWN_R },
  medic: { title: 'Field Medic', sign: M.AWN_B },
  junk: { title: 'Scrap Merchant', sign: M.CANVAS },
  food: { title: 'Food Stall', sign: M.CONT_O },
  builder: { title: 'Lumber and Block', sign: M.PLANK },
};

const DISTRICTS = [
  [.075, 1, 'Financial District'], [.155, .46, 'Tribeca & SoHo'], [.155, .70, 'Chinatown'], [.155, 1, 'Lower East Side'],
  [.20, .42, 'West Village'], [.20, 1, 'East Village'], [.29, .33, 'Chelsea'], [.29, .62, 'Flatiron'], [.29, 1, 'Gramercy'],
  [.40, .30, "Hell's Kitchen"], [.40, .60, 'Midtown'], [.40, 1, 'Midtown East'], [.63, .32, 'Upper West Side'],
  [.63, .515, 'Central Park'], [.63, 1, 'Upper East Side'], [.76, .36, 'Morningside Heights'], [.76, .62, 'Harlem'],
  [.76, 1, 'East Harlem'], [.90, 1, 'Washington Heights'], [2, 1, 'Inwood'],
];

function chaikin(pts, n) {
  for (let k = 0; k < n; k++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]);
    }
    pts = out;
  }
  return pts;
}

export function buildLayout(seed = 1609) {
  const shared = typeof SharedArrayBuffer !== 'undefined' && self.crossOriginIsolated;
  const alloc = (T, n) => new T(shared ? new SharedArrayBuffer(n * T.BYTES_PER_ELEMENT) : new ArrayBuffer(n * T.BYTES_PER_ELEMENT));
  const N = WX * WZ;
  const ground = alloc(Uint8Array, N);
  const lot = alloc(Uint16Array, N);
  const edge = alloc(Uint8Array, N);
  const height = alloc(Uint8Array, N);
  const mark = alloc(Uint8Array, N);
  const terr = alloc(Int8Array, N);
  const rng = makeRng(seed);

  // --- Coastline ---------------------------------------------------------
  const land = new Uint8Array(N);
  const coast = chaikin(COAST.map(([u, v]) => [xU(u), zV(v)]), 3);
  const xs = [];
  for (let z = 0; z < WZ; z++) {
    xs.length = 0;
    for (let i = 0; i < coast.length; i++) {
      const a = coast[i], b = coast[(i + 1) % coast.length];
      if ((a[1] <= z) !== (b[1] <= z)) xs.push(a[0] + (z - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    const jitter = (fbm2(z * .012, 3.3, 3) - .5) * 22;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const lo = Math.max(1, Math.round(xs[k] + jitter)), hi = Math.min(WX - 2, Math.round(xs[k + 1] + jitter));
      land.fill(1, z * WX + lo, z * WX + hi + 1);
    }
  }
  // Liberty Island sits in the harbour, reachable only by a long swim.
  const LIB = { x: 194, z: 6208, r: 46 };
  for (let z = LIB.z - LIB.r; z <= LIB.z + LIB.r; z++) for (let x = LIB.x - LIB.r; x <= LIB.x + LIB.r; x++) {
    if ((x - LIB.x) ** 2 + (z - LIB.z) ** 2 < LIB.r * LIB.r) land[z * WX + x] = 2;
  }

  const chamfer = (src, isZero, max = 255) => {
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
  const dw = chamfer(land, (i) => land[i] === 0);

  // --- Roads -------------------------------------------------------------
  // mask: 0 none, 1 sidewalk margin, 2 carriageway
  const mask = new Uint8Array(N);
  const zHouston = zNum(1);
  const z14 = zNum(14);
  const villageCell = (x, z) => z > z14 && z <= zHouston && uX(x) < .42;

  const rows = [];
  for (let s = 1; s < STOPS.length; s++) {
    const [na, va] = STOPS[s - 1], [nb, vb] = STOPS[s];
    const za = zV(va), zb = zV(vb);
    const count = Math.max(1, Math.round((za - zb) / 52));
    for (let k = s === 1 ? 0 : 1; k <= count; k++) {
      const major = k === count || (s === 1 && k === 0);
      const num = Math.round(na + (nb - na) * k / count);
      rows.push({ z: Math.round(za + (zb - za) * k / count), w: major ? 16 : 10, num, major });
    }
  }
  const aves = AVE_NAMES.map((name, a) => ({ name, a, x: aveX(a), w: AVE_W[a] }));

  const rect = (x0, z0, x1, z1, v) => {
    x0 = Math.max(0, x0); z0 = Math.max(0, z0); x1 = Math.min(WX - 1, x1); z1 = Math.min(WZ - 1, z1);
    for (let z = z0; z <= z1; z++) for (let x = x0, i = z * WX + x; x <= x1; x++, i++) if (v > mask[i]) mask[i] = v;
  };
  const zTop = zNum(207);
  const onAve = new Uint8Array(WX), onRow = new Uint8Array(WZ);
  for (const a of aves) {
    const h = a.w >> 1;
    for (let z = zTop; z <= zHouston; z++) {
      for (let x = a.x - h - 3; x <= a.x + h + 3; x++) {
        if (villageCell(x, z)) continue;
        const i = z * WX + x;
        const v = Math.abs(x - a.x) <= h ? 2 : 1;
        if (v > mask[i]) mask[i] = v;
      }
    }
    for (let x = a.x - h; x <= a.x + h; x++) onAve[x] = 1;
  }
  for (const r of rows) {
    const h = r.w >> 1;
    for (let z = r.z - h - 3; z <= r.z + h + 3; z++) {
      for (let x = 0; x < WX; x++) {
        if (villageCell(x, z)) continue;
        const i = z * WX + x;
        const v = Math.abs(z - r.z) <= h ? 2 : 1;
        if (v > mask[i]) mask[i] = v;
      }
    }
    for (let z = r.z - h; z <= r.z + h; z++) onRow[z] = 1;
  }

  // Lower Manhattan: skewed grids stitched together, as in the real street plan.
  const SKEW = [
    { test: (u, v) => v < .075, ang: .52, pa: 66, pb: 46, wa: 9, wb: 7 },
    { test: (u, v) => v < .155 && u < .46, ang: .17, pa: 84, pb: 52, wa: 10, wb: 9 },
    { test: (u, v) => v < .155 && u < .70, ang: -.28, pa: 62, pb: 48, wa: 9, wb: 8 },
    { test: (u, v) => v < .155, ang: .05, pa: 70, pb: 44, wa: 10, wb: 9 },
    { test: (u, v) => v < .20 && u < .42, ang: .62, pa: 70, pb: 46, wa: 9, wb: 8 },
  ];
  for (let z = 0; z < WZ; z++) {
    const inLower = z > z14;
    if (!inLower) continue;
    const v = vZ(z);
    for (let x = 0; x < WX; x++) {
      const i = z * WX + x;
      if (!land[i] || land[i] === 2) continue;
      if (z <= zHouston && !villageCell(x, z)) continue;
      const u = uX(x);
      const zone = SKEW.find((s) => s.test(u, v));
      if (!zone) continue;
      const c = Math.cos(zone.ang), s = Math.sin(zone.ang);
      const a = x * c + z * s, b = -x * s + z * c;
      const ma = ((a % zone.pa) + zone.pa) % zone.pa, mb = ((b % zone.pb) + zone.pb) % zone.pb;
      const road = ma < zone.wa || mb < zone.wb;
      const near = ma < zone.wa + 3 || ma > zone.pa - 3 || mb < zone.wb + 3 || mb > zone.pb - 3;
      const val = road ? 2 : near ? 1 : 0;
      if (val > mask[i]) mask[i] = val;
    }
  }

  const stampLine = (pts, w) => {
    const hw = w / 2, hs = hw + 3;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - hs)), x1 = Math.min(WX - 1, Math.ceil(Math.max(ax, bx) + hs));
      const z0 = Math.max(0, Math.floor(Math.min(az, bz) - hs)), z1 = Math.min(WZ - 1, Math.ceil(Math.max(az, bz) + hs));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2));
        const d = Math.hypot(x - ax - dx * t, z - az - dz * t);
        if (d > hs) continue;
        const i = z * WX + x, v = d <= hw ? 2 : 1;
        if (v > mask[i]) mask[i] = v;
      }
    }
  };
  const ave2u = aveU;
  const uvPts = (list) => list.map(([u, v]) => [xU(u), zV(v)]);
  const anPts = (list) => list.map(([a, n]) => [xU(ave2u(a)), zNum(n)]);
  // Broadway cuts across the grid and creates Union, Madison and Times Squares.
  const broadway = [...uvPts([[.33, .012], [.37, .09], [.44, .155]]),
    ...anPts([[9, 14], [7, 23], [6, 34], [5, 45], [4, 59], [2.2, 72], [1.8, 96], [3, 125], [4, 155], [5.5, 181], [6.5, 207]])];
  stampLine(broadway, 14);
  stampLine(uvPts([[.12, .105], [.75, .105]]), 12); // Canal St
  stampLine(uvPts([[.14, .062], [.56, .062]]), 10); // Chambers St
  stampLine(uvPts([[.55, .127], [.92, .127]]), 12); // Delancey St
  stampLine(uvPts([[.60, .155], [.46, .06]]), 12);  // Bowery
  stampLine(uvPts([[.30, .03], [.46, .03]]), 8);    // Wall St
  const broadwayNames = broadway;

  // --- Ground classes --------------------------------------------------------
  for (let i = 0; i < N; i++) {
    if (!land[i]) { ground[i] = G.WATER; continue; }
    if (land[i] === 2) { ground[i] = G.PLAZA; continue; }
    const dist = dw[i];
    if (dist < 8) ground[i] = G.PROM;
    else if (dist < 10) ground[i] = G.WALK;
    else if (dist < 23) ground[i] = G.ROAD;   // West St / FDR Drive ring road
    else if (dist < 26) ground[i] = G.WALK;
    else ground[i] = mask[i] === 2 ? G.ROAD : mask[i] === 1 ? G.WALK : G.LOT;
  }

  // Road markings
  for (const a of aves) {
    for (let z = zTop; z <= zHouston; z++) {
      if (onRow[z]) continue;
      const i = z * WX + a.x;
      if (ground[i] === G.ROAD && (z % 9) < 5) mark[i] = 1;
      for (const off of [-Math.floor(a.w / 4), Math.floor(a.w / 4)]) {
        const j = z * WX + a.x + off;
        if (ground[j] === G.ROAD && (z % 12) < 3) mark[j] = 2;
      }
    }
  }
  for (const r of rows) {
    for (let x = 0; x < WX; x++) {
      if (onAve[x]) continue;
      const i = r.z * WX + x;
      if (ground[i] === G.ROAD && (x % 9) < 4) mark[i] = 2;
    }
    for (const a of aves) {
      const hz = r.w >> 1, hx = a.w >> 1;
      for (let band = 2; band <= 5; band++) {
        for (const zz of [r.z - hz - band, r.z + hz + band]) for (let x = a.x - hx; x <= a.x + hx; x++) {
          if (x % 2 === 0 && zz >= 0 && zz < WZ && ground[zz * WX + x] === G.ROAD) mark[zz * WX + x] = 3;
        }
        for (const xx of [a.x - hx - band, a.x + hx + band]) for (let z = r.z - hz; z <= r.z + hz; z++) {
          if (z % 2 === 0 && ground[z * WX + xx] === G.ROAD) mark[z * WX + xx] = 3;
        }
      }
    }
  }

  // --- Parks and open space ------------------------------------------------------
  const nearestRow = (n) => rows.reduce((b, r) => Math.abs(r.num - n) < Math.abs(b.num - n) ? r : b, rows[0]);
  const parkRect = (a0, a1, n0, n1) => {
    const rs = nearestRow(n0), rn = nearestRow(n1);
    const w = aves[a0], e = aves[a1];
    return { x0: w.x + (w.w >> 1) + 4, x1: e.x - (e.w >> 1) - 4, z0: rn.z + (rn.w >> 1) + 4, z1: rs.z - (rs.w >> 1) - 4 };
  };
  const uvRect = (u0, u1, v0, v1) => ({ x0: Math.round(xU(u0)), x1: Math.round(xU(u1)), z0: Math.round(zV(v1)), z1: Math.round(zV(v0)) });
  const fillGround = (r, g, force = true) => {
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0, i = z * WX + x; x <= r.x1; x++, i++) {
      if (ground[i] === G.WATER) continue;
      if (force || ground[i] === G.LOT) { ground[i] = g; mark[i] = 0; }
    }
  };
  const P_CENTRAL = parkRect(4, 7, 59, 110);
  const P_BRYANT = parkRect(6, 7, 40, 42);
  const P_LIBRARY = { x0: P_BRYANT.x1 - 34, x1: P_BRYANT.x1, z0: P_BRYANT.z0, z1: P_BRYANT.z1 };
  P_BRYANT.x1 -= 38;
  const P_UNION = parkRect(8, 10, 14, 17);
  const P_MADISON = parkRect(7, 8, 23, 26);
  const P_WASH = uvRect(.45, .52, .165, .19);
  const P_TOMPKINS = uvRect(.74, .80, .175, .195);
  const P_MORNING = parkRect(3, 4, 110, 123);
  const P_GARVEY = parkRect(6, 7, 120, 124);
  const P_TRYON = uvRect(.33, .50, .89, .93);
  const P_CITYHALL = uvRect(.36, .41, .06, .08);
  for (const p of [P_CENTRAL, P_BRYANT, P_UNION, P_MADISON, P_WASH, P_TOMPKINS, P_MORNING, P_GARVEY, P_TRYON, P_CITYHALL]) fillGround(p, G.PARK);
  const parkMaskCells = (fn) => {
    for (let z = 0; z < WZ; z++) {
      const v = vZ(z);
      for (let x = 0; x < WX; x++) {
        const i = z * WX + x;
        if (ground[i] !== G.WATER && fn(uX(x), v, dw[i])) { ground[i] = G.PARK; mark[i] = 0; }
      }
    }
  };
  parkMaskCells((u, v) => v < .036 && u < .42);                       // Battery Park
  parkMaskCells((u, v, d) => v > .955 && u < .52);                    // Inwood Hill
  // Liberty Island is paved around the fort, with lawn only out at the edge.
  for (let z = LIB.z - LIB.r; z <= LIB.z + LIB.r; z++) for (let x = LIB.x - LIB.r; x <= LIB.x + LIB.r; x++) {
    const i = z * WX + x, d = Math.hypot(x - LIB.x, z - LIB.z);
    if (land[i] === 2) ground[i] = d < 36 ? G.PLAZA : G.PARK;
  }
  parkMaskCells((u, v, d) => v > .47 && v < .76 && u < .34 && d < 40 && d >= 23 && uX(0) < u); // Riverside Park
  // Times Square bowtie
  const tsz0 = nearestRow(47).z, tsz1 = nearestRow(42).z;
  const tsx = Math.round(xU(aveU(5.2)));
  for (let z = tsz0; z <= tsz1; z++) for (let x = tsx - 26; x <= tsx + 26; x++) {
    const i = z * WX + x;
    if (ground[i] === G.ROAD || ground[i] === G.WALK) { ground[i] = G.PLAZA; mark[i] = 0; }
  }

  // Piers along the Hudson
  const piers = [];
  for (let z = Math.round(zV(.40)); z < zV(.09); z += 130) {
    let sx = 0;
    while (sx < WX && !land[z * WX + sx]) sx++;
    if (sx >= WX || sx < 40) continue;
    const len = 44 + Math.floor(r2(z, 5) * 26);
    for (let dz = -8; dz <= 8; dz++) for (let x = sx - len; x <= sx + 2; x++) {
      if (x > 0 && !land[(z + dz) * WX + x]) ground[(z + dz) * WX + x] = G.PROM;
    }
    piers.push({ x: sx - len, z });
  }

  // --- Camps -------------------------------------------------------------------
  // Each camp is a walled compound centred on open ground. Everything inside the wall is cleared
  // except the streets, which survive as the settlement's roads.
  const parkMid = (p) => ({ x: (p.x0 + p.x1) >> 1, z: (p.z0 + p.z1) >> 1 });
  const around = (x, z, hw, hd, extra = {}) => ({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd, ...extra });
  const br = parkMid(P_BRYANT);
  // Spread the length and width of the island, so that each one is a long walk from the next.
  const campRects = {
    bryant: { x0: 684, x1: 956, z0: br.z - 140, z1: br.z + 140, keep: [P_LIBRARY], plazaX: 835, plazaZ: br.z },
    battery: around(Math.round(xU(.28)), Math.round(zV(.03)), 115, 98),
    wash: around(Math.round(xU(.36)), Math.round(zV(.178)), 95, 106),
    union: around(Math.round(xU(.74)), Math.round(zV(.235)), 109, 109),
    sheep: around(640, Math.round(zV(.47)), 104, 162),
    tompkins: around(Math.round(xU(.78)), Math.round(zV(.135)), 84, 94),
    morning: around(Math.round(xU(.29)), Math.round(zV(.655)), 104, 112),
    garvey: around(Math.round(xU(.55)), Math.round(zV(.755)), 106, 106),
    tryon: around(Math.round(xU(.42)), Math.round(zV(.91)), 100, 110),
  };
  const campMask = new Uint8Array(N);
  const filled = {};
  for (const def of CAMP_DEFS) {
    const r = campRects[def.key];
    for (let z = r.z0 - 8; z <= r.z1 + 8; z++) for (let x = r.x0 - 8; x <= r.x1 + 8; x++) {
      const i = z * WX + x;
      campMask[i] = 1;
      mark[i] = 0;
      // Part of the compound that ran out over the river has been filled in, with whatever the city had lying around.
      if (ground[i] === G.WATER) { ground[i] = G.CAMP; filled[def.key] = 1; continue; }
      const band = x < r.x0 + 8 || x > r.x1 - 8 || z < r.z0 + 8 || z > r.z1 - 8;
      if (band || ground[i] === G.LOT) { ground[i] = G.CAMP; mark[i] = 0; }
    }
  }
  // The fill slumps away into the river on its outer edge instead of ending in a clean cut.
  const SLOPE = 7;
  const rubble = [];
  for (const def of CAMP_DEFS) {
    const r = campRects[def.key], m = 8;
    if (!filled[def.key]) continue;
    for (let z = r.z0 - m - SLOPE; z <= r.z1 + m + SLOPE; z++) for (let x = r.x0 - m - SLOPE; x <= r.x1 + m + SLOPE; x++) {
      if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
      const i = z * WX + x;
      if (ground[i] !== G.WATER) continue;
      const d = Math.max(r.x0 - m - x, x - r.x1 - m, r.z0 - m - z, z - r.z1 - m);
      rubble.push(i, d);
    }
  }
  const camps = CAMP_DEFS.map((def, id) => planCamp(def, id, campRects[def.key], ground));

  // --- Lots and buildings ----------------------------------------------------------
  const buildings = [];
  const addBuilding = (b) => { buildings.push(b); b.id = buildings.length; return b.id; };
  const zoneOf = (x, z) => {
    const u = uX(x), v = vZ(z);
    const avenueDist = Math.abs(u - Math.round((u - .06) / .0655) * .0655 - .06);
    const nearAve = avenueDist < .022;
    if (v < .075) return { f: [8, 34], st: [S.glassB, S.glassK, S.limestone, S.deco, S.granite, S.concrete], lot: [22, 44], tall: .25 };
    if (v < .155) return { f: [3, 7], st: [S.castiron, S.castiron, S.brick, S.brick2, S.whitebrick], lot: [10, 26], tall: .05 };
    if (v < .20) return { f: [3, 6], st: [S.brick, S.brick, S.brownstone, S.brick2, S.whitebrick], lot: [9, 22], tall: .04 };
    if (v < .29) return { f: nearAve ? [6, 16] : [4, 9], st: [S.brick, S.castiron, S.limestone, S.deco, S.brick2, S.whitebrick], lot: [14, 30], tall: .1 };
    if (v < .41) {
      if (u < .16 && v > .27 && v < .34) return { f: [18, 40], st: [S.glassB, S.glassT, S.glassK], lot: [30, 60], tall: .6 };
      const core = u > .25 && u < .72;
      return { f: core ? [12, 34] : [6, 18], st: [S.limestone, S.deco, S.glassB, S.glassK, S.concrete, S.glassT, S.granite, S.brick2], lot: [18, 44], tall: core ? .3 : .08 };
    }
    if (v < .63) {
      if (nearAve) return { f: [8, 19], st: [S.whitebrick, S.limestone, S.brick2, S.concrete, S.deco], lot: [16, 34], tall: .1 };
      return { f: [3, 6], st: [S.brownstone, S.brownstone, S.brick, S.limestone, S.brick2], lot: [8, 13], tall: .02, row: true };
    }
    if (v < .82) {
      // Harlem. Grand apartment houses and tenements on the avenues, rows of stone fronts on the side streets, with
      // the churches and community gardens that break them up.
      if (nearAve) return { f: [5, 11], st: [S.tenement, S.tenement, S.tenement, S.terracotta, S.terracotta, S.brick, S.brick, S.brick2, S.deco, S.redstone, S.graystone], lot: [14, 30], tall: .08, towers: true, harlem: true, stepped: .35, church: .02 };
      return { f: [3, 5], st: [S.brownstone, S.brownstone, S.brownstone, S.brick, S.brick, S.brick, S.tenement, S.tenement, S.tenement, S.terracotta, S.redstone, S.stucco, S.stucco, S.graystone, S.stuccoB, S.stuccoG], lot: [10, 20], tall: .05, harlem: true, garden: .07, church: .04, stoops: true };
    }
    return { f: [4, 8], st: [S.brick, S.brick2, S.whitebrick, S.projects], lot: [14, 30], tall: .03 };
  };

  const makeTiers = (floors, style, r) => {
    const top = (f) => STREET_Y + f * FLOOR_H;
    if (floors < 12 || STYLES[style].cast === 2 && r() < .6) return [0, top(floors)];
    if (floors < 20) return r() < .5 ? [0, top(floors)] : [0, top(floors - 3), 3, top(floors)];
    const a = Math.round(floors * .45), b = Math.round(floors * .75);
    return [0, top(a), 3, top(b), 6, top(floors)];
  };
  const landmark = (name, r, style, tiers, force = true) => {
    const id = addBuilding({ name, style, tiers: tiers.map((v, i) => i % 2 ? STREET_Y + v * FLOOR_H : v), x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, seed: id0(name) });
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0, i = z * WX + x; x <= r.x1; x++, i++) {
      if (!force && ground[i] !== G.LOT) continue;
      if (ground[i] === G.WATER) continue;
      ground[i] = G.LOT; lot[i] = id; mark[i] = 0;
    }
    return id;
  };
  function id0(s) { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return h >>> 0; }

  const empX = aves[7].x - (aves[7].w >> 1) - 3 - 34, empZ = nearestRow(34).z - 8 - 3 - 16;
  const empire = { x0: empX - 32, x1: empX + 32, z0: empZ - 16, z1: empZ + 16 };
  const chryX = aves[10].x + 7 + 3 + 16, chryZ = nearestRow(42).z - 8 - 3 - 16;
  const chrysler = { x0: chryX - 15, x1: chryX + 15, z0: chryZ - 15, z1: chryZ + 15 };
  const wtcX = Math.round(xU(.27)), wtcZ = Math.round(zV(.058));
  const wtc = { x0: wtcX - 22, x1: wtcX + 22, z0: wtcZ - 22, z1: wtcZ + 22 };
  const metR = { x0: P_CENTRAL.x1 - 44, x1: P_CENTRAL.x1, z0: Math.round(zNum(82)) - 40, z1: Math.round(zNum(82)) + 40 };
  landmark('Empire State Building', empire, S.limestone, [0, 12, 5, 18, 9, 34, 13, 40]);
  landmark('Chrysler Building', chrysler, S.deco, [0, 10, 4, 20, 8, 36]);
  landmark('One World Trade', wtc, S.glassB, [0, 44]);
  landmark('New York Public Library', P_LIBRARY, S.limestone, [0, 5]);
  landmark('The Met', metR, S.limestone, [0, 5]);
  const rockX = aves[6].x + 40, rockZ = nearestRow(50).z - 8 - 3 - 15;
  landmark('30 Rockefeller Plaza', { x0: rockX - 24, x1: rockX + 24, z0: rockZ - 15, z1: rockZ + 15 }, S.limestone, [0, 12, 4, 30, 7, 44], false);
  const px432 = aves[9].x + 11 + 3 + 14, pz432 = nearestRow(57).z - 8 - 3 - 12;
  landmark('432 Park', { x0: px432 - 9, x1: px432 + 9, z0: pz432 - 9, z1: pz432 + 9 }, S.glassK, [0, 47], false);

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
      for (const n of [c - 1, c + 1, c - WX, c + WX]) {
        if (n >= 0 && n < N && ground[n] === G.LOT && !lot[n] && !label[n]) { label[n] = lbl; stack[sp++] = n; }
      }
    }
    if (cells < 30) continue; // left as paved ground below
    const split = (ax, az, bx, bz) => {
      const w = bx - ax + 1, d = bz - az + 1;
      const zone = zoneOf((ax + bx) >> 1, (az + bz) >> 1);
      const [lmin, lmax] = zone.lot;
      const big = Math.max(w, d);
      if (big <= lmax && (big < lmin * 2 || rng() < .35)) { lotsOut.push({ ax, az, bx, bz, lbl }); return; }
      const alley = big > 40 && rng() < .18 ? 3 : 0;
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
    const zone = zoneOf((L.ax + L.bx) >> 1, (L.az + L.bz) >> 1);
    let count = 0;
    for (let z = L.az; z <= L.bz; z++) for (let x = L.ax, i = z * WX + x; x <= L.bx; x++, i++) if (label[i] === L.lbl && ground[i] === G.LOT) count++;
    if (count < 20) continue;
    const r = makeRng(L.ax * 73 + L.az * 131 + seed);
    const thin = Math.min(L.bx - L.ax + 1, L.bz - L.az + 1);
    // Every so often somebody's cleared lot has been turned over for vegetables.
    if (zone.garden && thin >= 8 && r() < zone.garden) {
      for (let z = L.az; z <= L.bz; z++) for (let x = L.ax, i = z * WX + x; x <= L.bx; x++, i++) if (label[i] === L.lbl && ground[i] === G.LOT) ground[i] = G.PARK;
      continue;
    }
    let style = r.pick(zone.st);
    const [fa, fb] = zone.f;
    let floors = Math.round(fa + (fb - fa) * Math.pow(r(), 1.6));
    if (r() < zone.tall) floors = Math.round(floors * r.range(1.3, 1.8));
    if (zone.towers && thin >= 18 && r() < .12) { floors = r.int(12, 18); style = S.projects; }
    floors = Math.min(46, Math.max(2, floors));
    floors = Math.max(2, Math.min(floors, 2 + Math.floor(count / 10)));
    const top = (f) => STREET_Y + f * FLOOR_H;
    let tiers = makeTiers(floors, style, r);
    let church = false;
    if (zone.church && thin >= 15 && r() < zone.church) {
      // A nave and a square tower rising out of the middle of it.
      church = true; style = S.graystone;
      tiers = [0, top(3), 5, top(8)];
    } else if (zone.stepped && floors >= 7 && r() < zone.stepped) tiers = [0, top(floors - 2), 3, top(floors)];
    const id = addBuilding({ style, tiers, x0: L.ax, x1: L.bx, z0: L.az, z1: L.bz, seed: r() * 4294967296 >>> 0 });
    if (zone.harlem) {
      const b = buildings[id - 1];
      b.harlem = true;
      b.cornice = church || r() < .85;
      b.stoop = !!zone.stoops && !church && floors <= 5 && [S.brownstone, S.redstone, S.graystone].includes(style);
    }
    for (let z = L.az; z <= L.bz; z++) for (let x = L.ax, i = z * WX + x; x <= L.bx; x++, i++) {
      if (label[i] === L.lbl && ground[i] === G.LOT) lot[i] = id;
    }
  }
  // Any unclaimed lot ground (slivers, tiny blocks) becomes pavement.
  for (let i = 0; i < N; i++) if (ground[i] === G.LOT && !lot[i]) ground[i] = G.ALLEY;

  // Flatiron: make the wedge of Broadway and 5th a landmark.
  {
    const fx = Math.round(xU(aveU(7)));
    const fz = nearestRow(23).z - 22;
    outer: for (let d = 0; d < 40; d++) for (let x = fx - d; x <= fx + d; x++) {
      const id = lot[fz * WX + x];
      if (id) {
        const b = buildings[id - 1];
        b.name = 'Flatiron Building'; b.style = S.limestone; b.tiers = [0, STREET_Y + 18 * FLOOR_H];
        break outer;
      }
    }
  }

  // A camp that wants to see what is coming has pulled down whatever stood right outside its corners.
  for (const def of CAMP_DEFS) {
    const R = def.clearCorners;
    if (!R) continue;
    const r = campRects[def.key];
    for (const [cx, cz] of [[r.x0, r.z0], [r.x1, r.z0], [r.x0, r.z1], [r.x1, r.z1]]) {
      for (let z = cz - R; z <= cz + R; z++) for (let x = cx - R; x <= cx + R; x++) {
        if (x < 0 || z < 0 || x >= WX || z >= WZ || (x - cx) ** 2 + (z - cz) ** 2 > R * R) continue;
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
  // Only props are kept off it: the ground stays as it was, roads a step below the kerb.
  const clearMask = new Uint8Array(N);
  for (const c of camps) for (const q of c.gates) {
    const ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
    const face = q.horiz ? (oz < 0 ? q.z0 : q.z1) : (ox < 0 ? q.x0 : q.x1);
    for (let d = 1; d <= 34; d++) for (let a = -14; a <= 14; a++) {
      const x = q.horiz ? q.tc + a : face + ox * d, z = q.horiz ? face + oz * d : q.tc + a;
      if (x < 0 || z < 0 || x >= WX || z >= WZ) continue;
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

  // Nothing stands that is too narrow to be a building: anything a 3x3 room would not fit inside goes back to being an alley.
  {
    const keep = new Uint8Array(N);
    for (let z = 1; z < WZ - 3; z++) for (let x = 1, i = z * WX + 1; x < WX - 3; x++, i++) {
      const id = lot[i];
      if (!id || lot[i + 1] !== id || lot[i + 2] !== id) continue;
      if (lot[i + WX] !== id || lot[i + WX + 1] !== id || lot[i + WX + 2] !== id) continue;
      if (lot[i + 2 * WX] !== id || lot[i + 2 * WX + 1] !== id || lot[i + 2 * WX + 2] !== id) continue;
      for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) keep[i + a * WX + b] = 1;
    }
    for (let i = 0; i < N; i++) if (lot[i] && !keep[i] && !buildings[lot[i] - 1].name) { lot[i] = 0; ground[i] = G.ALLEY; mark[i] = 0; }
  }

  // Edge distance inside each lot drives setbacks and facade detection.
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
  // How tall a building can be depends on how wide it is. Slivers come down altogether.
  for (const b of buildings) {
    if (b.name || b.bestE < 0) continue;
    const across = b.bestE * 2 + 1;
    if (across < 5) {
      b.gone = true;
      for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0, i = z * WX + x; x <= b.x1; x++, i++) if (lot[i] === b.id) { lot[i] = 0; ground[i] = G.ALLEY; edge[i] = 0; mark[i] = 0; }
      continue;
    }
    const most = Math.max(2, Math.round(across * (b.harlem ? .85 : 1.4)));
    if ((b.tiers[b.tiers.length - 1] - STREET_Y) / FLOOR_H > most) b.tiers = [0, STREET_Y + most * FLOOR_H];
  }
  for (let z = 1; z < WZ - 1; z++) for (let x = 1, i = z * WX + 1; x < WX - 1; x++, i++) {
    const id = lot[i];
    if (!id) continue;
    const b = buildings[id - 1], e = edge[i];
    let h = b.tiers[1];
    for (let t = 2; t < b.tiers.length; t += 2) if (e >= b.tiers[t]) h = b.tiers[t + 1];
    height[i] = h;
  }
  // Stairwells: one 4x6 shaft near the core wherever it fits.
  for (const b of buildings) {
    b.top = b.tiers[b.tiers.length - 1];
    b.sx = -1;
    const fits = (sx, sz) => {
      for (let z = sz - 1; z < sz + 7; z++) for (let x = sx - 1; x < sx + 5; x++) {
        const i = z * WX + x;
        if (lot[i] !== b.id || (x >= sx && x < sx + 4 && z >= sz && z < sz + 6 && edge[i] < 1) || height[i] !== b.top) return false;
      }
      return true;
    };
    const search = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 1], [-2, -1], [2, -2], [-2, 2], [3, 0], [-3, 0], [0, 3], [0, -3]];
    for (const [dx, dz] of search) {
      const sx = b.cx - 2 + dx, sz = b.cz - 3 + dz;
      if (sx > 1 && sz > 1 && fits(sx, sz)) { b.sx = sx; b.sz = sz; break; }
    }
    b.tank = b.top > (b.harlem ? 30 : 40) && STYLES[b.style].cast !== 2 && (b.seed % 100) < (b.harlem ? 60 : 45);
  }

  // Old painted ads on the brick, and a few buildings that have been on fire for weeks.
  const AD_WORDS = ['HOTEL', 'COLA', 'LOANS', 'DELI', 'TAXI', 'RADIO', 'LAUNDRY', 'STEAK', 'CIGARS', 'BANK', 'JEANS', 'SODA', 'PAWN', 'DINER', 'GARAGE', 'THEATER', 'MOTEL', 'TICKETS', 'RYE', 'COFFEE', 'BEER', 'TAILOR', 'FURS', 'SHOES'];
  const AD_PAIRS = [[M.AD_CREAM, M.AD_RED], [M.AD_BLUE, M.AD_CREAM], [M.AD_BLACK, M.AD_YELLOW], [M.AD_RED, M.AD_CREAM], [M.AD_GREEN, M.AD_CREAM], [M.AD_CREAM, M.AD_BLUE], [M.AD_YELLOW, M.AD_BLACK]];
  for (const b of buildings) {
    const st = STYLES[b.style];
    if (st.cast === 2 || r2(b.id, 41) > .2) continue;
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
    b.ad = { alongX, t0, t1: t0 + wide - 1, y0: STREET_Y + floor * FLOOR_H, y1: STREET_Y + floor * FLOOR_H + high - 1, word, scale, bg: pair[0], fg: pair[1] };
  }
  const burning = [];
  const fireSpots = [];
  const campNear = (x, z, m) => CAMP_DEFS.some((d) => { const r = campRects[d.key]; return x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m; });
  // (Burning buildings are switched off: nothing is picked to burn.)
  for (let k = 0; k < buildings.length * 2 && burning.length < 0; k++) {
    const b = buildings[Math.floor(r2(k, 173) * buildings.length)];
    if (b.gone || b.burn !== undefined || b.top < STREET_Y + 20 || b.top > STREET_Y + 120 || campNear(b.cx, b.cz, 130)) continue;
    if (burning.some((o) => Math.hypot(o.cx - b.cx, o.cz - b.cz) < 240)) continue;
    // The fire shows on whichever side of the building faces a street.
    let found = null;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let x = b.cx, z = b.cz;
      for (let s = 0; s < 70 && lot[z * WX + x] === b.id; s++) { x += dx; z += dz; }
      if (lot[z * WX + x] === 0) { found = { x, z, d: [dx, dz] }; break; }
    }
    if (!found) continue;
    // Up near the roof, two storeys of it, gutted and still going: the kind of thing you see from across the city.
    const floors = Math.floor((b.top - STREET_Y) / FLOOR_H);
    b.burn = Math.max(1, floors - 2 - Math.floor(r2(b.id, 3) * 2));
    burning.push(b);
    const [dx, dz] = found.d, along = dx ? (b.z1 - b.z0) : (b.x1 - b.x0);
    fireSpots.push({
      x: found.x - dx * 3, z: found.z - dz * 3, y: STREET_Y + b.burn * FLOOR_H + 1, cx: b.cx, cz: b.cz, top: b.top,
      fx: found.x - dx, fz: found.z - dz, dx, dz, half: Math.max(3, Math.min(12, (along >> 1) - 2)),
    });
  }

  // Terrain: parks roll, ponds dip below the water line, roads sit a step below the kerb.
  const dp = chamfer(ground, (i) => ground[i] !== G.PARK);
  const ponds = [[.42, .545, 92, 150], [.37, .478, 46, 54], [.495, .42, 30, 22], [.49, .622, 34, 24]].map(([u, v, rx, rz]) => ({ x: xU(u), z: zV(v), rx, rz }));
  const hills = (x, z) => {
    const v = vZ(z);
    if (v > .955) return 32 * Math.pow(fbm2(x * .006, z * .006, 4), 1.1);
    if (v > .88) return 22 * fbm2(x * .007 + 5, z * .007, 4);
    if (v > .6) return 9 * fbm2(x * .009 + 2, z * .009, 3);
    return 8 * Math.max(0, fbm2(x * .012, z * .012, 3) - .25);
  };
  for (let k = 0; k < rubble.length; k += 2) if (ground[rubble[k]] === G.WATER) ground[rubble[k]] = G.ROCK;
  const slump = new Map();
  for (let k = 0; k < rubble.length; k += 2) slump.set(rubble[k], Math.min(slump.get(rubble[k]) ?? 99, rubble[k + 1]));
  for (let z = 0; z < WZ; z++) for (let x = 0, i = z * WX; x < WX; x++, i++) {
    const g = ground[i];
    if (slump.has(i)) terr[i] = -slump.get(i);
    else if (campMask[i] && g !== G.WATER) terr[i] = 0;
    else if (g === G.ROAD) terr[i] = -1;
    else if (g === G.WATER) terr[i] = -7;
    else if (g === G.PARK) {
      const fade = Math.min(1, dp[i] / 14);
      let t = Math.round(hills(x, z) * fade);
      for (const p of ponds) {
        const d = Math.hypot((x - p.x) / p.rx, (z - p.z) / p.rz);
        if (d < 1.15) t = Math.min(t, Math.round((d - 1) * 40));
      }
      terr[i] = Math.max(-6, Math.min(40, t));
      if (t > 3 && noise2(x * .06, z * .06) > .72) ground[i] = G.ROCK;
    }
  }

  // --- Props ----------------------------------------------------------------------
  const props = [];
  const addProp = (t, x, z, a = 0, b = 0, c = 0) => { if (!campMask[z * WX + x] && !clearMask[z * WX + x]) props.push(t, x, z, a, b, c); };
  const groundAt = (x, z) => (x >= 0 && z >= 0 && x < WX && z < WZ) ? ground[z * WX + x] : G.WATER;
  const placeCar = (x, z, dir, seedVal) => {
    if (groundAt(x, z) !== G.ROAD) return;
    const r = seedVal;
    const kind = r < .32 ? 1 : r < .72 ? 0 : r < .79 ? 2 : r < .86 ? 3 : r < .90 ? 4 : r < .94 ? 5 : 6; // sedan,taxi,bus,truck,police,ambulance,wreck
    addProp(P.CAR, x, z, dir, kind, Math.floor(r * 1000));
  };
  for (const a of aves) {
    const hw = a.w >> 1;
    for (const lane of [-hw + 3, -3, 3, hw - 3]) {
      for (let z = zTop; z < zHouston; z += 7) {
        const k = r2(a.x + lane, z);
        if (onRow[z] || onRow[Math.min(WZ - 1, z + 10)]) continue;
        if (k < .17) { placeCar(a.x + lane - 2, z, 0, r2(z, a.x + lane)); z += 12; }
      }
    }
  }
  for (const r of rows) {
    const hw = r.w >> 1;
    for (const lane of [-hw + 2, hw - 2]) {
      for (let x = 40; x < WX - 40; x += 7) {
        const k = r2(x, r.z + lane);
        if (onAve[x] || onAve[Math.min(WX - 1, x + 10)]) continue;
        if (k < .14) { placeCar(x, r.z + lane - 2, 1, r2(r.z + lane, x)); x += 12; }
      }
    }
  }
  for (let t = 0; t < 900; t++) { // cars piled on the lower streets and ring road
    const x = 40 + Math.floor(rng() * (WX - 80)), z = 40 + Math.floor(rng() * (WZ - 80));
    placeCar(x, z, rng() < .5 ? 0 : 1, rng());
  }

  const curbSide = (x, z) => {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (groundAt(x + dx * 2, z + dz * 2) === G.ROAD) return true;
    return false;
  };
  for (let z = 8; z < WZ - 8; z += 3) for (let x = 8 + (z % 2); x < WX - 8; x += 3) {
    const g = ground[z * WX + x];
    if (g === G.WALK && curbSide(x, z)) {
      const k = r2(x * 3, z * 7);
      const v = vZ(z);
      if (k < .05) addProp(P.LAMP, x, z, 0);
      else if (k < (v > .41 ? .13 : .09)) addProp(P.TREE, x, z, Math.floor(k * 1000));
      else if (k < .152) addProp(P.TRASH, x, z, Math.floor(k * 9999));
      else if (k < .156) addProp(P.HYDRANT, x, z);
      else if (k < .158) addProp(P.NEWS, x, z);
    } else if (g === G.ALLEY) {
      if (r2(x, z) < .05) addProp(P.DUMPSTER, x, z, r2(z, x) < .5 ? 0 : 1);
    } else if (g === G.PROM && r2(x + 5, z) < .012) {
      addProp(P.BENCH, x, z);
    }
  }
  for (let z = 4; z < WZ - 4; z += 7) for (let x = 4; x < WX - 4; x += 7) {
    const g = ground[z * WX + x];
    if (g === G.PARK) {
      const dens = fbm2(x * .018, z * .018, 3);
      const j = r2(x, z);
      if (j < (dens - .32) * 2.1) addProp(P.PARKTREE, x + Math.floor(j * 40) % 5, z + Math.floor(j * 70) % 5, Math.floor(j * 9999));
    } else if (g === G.ROCK && r2(x, z + 1) < .4) addProp(P.ROCK, x, z, Math.floor(r2(z, x) * 999));
  }
  // Abandoned army checkpoints at major crossings.
  for (const r of rows) if (r.major) for (const a of aves) {
    // 7th Avenue stays clear below 50th: it is the view from the title screen.
    if (a.a === 5 && r.num < 60) continue;
    if (r2(r.num, a.a) < .13 && ground[r.z * WX + a.x] === G.ROAD) addProp(P.CHECKPOINT, a.x, r.z, Math.floor(r2(a.a, r.num) * 99));
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

  // --- Large structures (generated by bbox, a few dozen only) --------------------------
  const structs = [];
  for (const c of camps) structs.push({ type: 'camp', id: c.id, x0: c.x0 - 6, x1: c.x1 + 6, z0: c.z0 - 6, z1: c.z1 + 6, y1: c.maxY });
  const spire = (name, r, y0, y1, r0) => {
    const x = (r.x0 + r.x1) >> 1, z = (r.z0 + r.z1) >> 1;
    structs.push({ type: 'spire', name, x, z, y0, y1, r0, x0: x - r0, x1: x + r0, z0: z - r0, z1: z + r0 });
  };
  spire('empire', empire, STREET_Y + 40 * FLOOR_H, 250, 2);
  spire('chrysler', chrysler, STREET_Y + 36 * FLOOR_H, 228, 7);
  spire('wtc', wtc, STREET_Y + 44 * FLOOR_H, 254, 1);
  const bridge = (x0, x1, z, w, deck, towers, towerH, mat) => {
    structs.push({ type: 'bridge', x0: Math.min(x0, x1) - 4, x1: Math.max(x0, x1) + 4, z0: z - w - 2, z1: z + w + 2, z, w, deck, towers, towerH, mat, xa: x0, xb: x1 });
  };
  const shoreEast = (z) => { let x = WX - 1; while (x > 0 && !land[z * WX + x]) x--; return x; };
  const shoreWest = (z) => { let x = 0; while (x < WX && !land[z * WX + x]) x++; return x; };
  const bz1 = Math.round(zV(.066));
  const se1 = shoreEast(bz1);
  bridge(se1 - 60, WX - 6, bz1, 7, STREET_Y + 16, [se1 + 34], 58, M.GRANITE);       // Brooklyn Bridge
  const bz2 = Math.round(zV(.127));
  const se2 = shoreEast(bz2);
  bridge(se2 - 50, WX - 6, bz2, 8, STREET_Y + 16, [se2 + 20], 44, M.STEEL_D);       // Williamsburg Bridge
  const bz3 = nearestRow(59).z;
  const se3 = shoreEast(bz3);
  bridge(se3 - 60, WX - 6, bz3, 8, STREET_Y + 16, [se3 + 16], 40, M.STEEL);         // Queensboro Bridge
  const bz4 = nearestRow(181).z;
  const sw4 = shoreWest(bz4);
  bridge(sw4 + 50, 4, bz4, 9, STREET_Y + 22, [sw4 - 20], 90, M.STEEL);              // George Washington Bridge
  // Times Square: the screens are still on the buildings, and the power has been off for six weeks.
  for (const side of [-1, 1]) {
    let z = tsz0 + 2;
    while (z < tsz1 - 8) {
      let x = aves[5].x + side * 8;
      while (Math.abs(x - tsx) < 70 && !lot[z * WX + x]) x += side;
      const id = lot[z * WX + x];
      if (!id) { z += 6; continue; }
      // Run along the face for as long as it stays flat and tall enough.
      let z1 = z;
      while (z1 < tsz1 && z1 - z < 34 && lot[(z1 + 1) * WX + x] === id && !lot[(z1 + 1) * WX + x - side]) z1++;
      const top = height[z * WX + x];
      if (z1 - z >= 10 && top >= STREET_Y + 16) {
        let y = STREET_Y + 6;
        const rows = Math.min(3, Math.floor((top - STREET_Y - 8) / 16));
        for (let k = 0; k < rows; k++) {
          const h = 10 + Math.floor(r2(z, k) * 5);
          if (y + h >= top - 1) break;
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
    if (r2(b.id, 57) > .2 || b.name || b.top < STREET_Y + 18 || b.top > STREET_Y + 95 || b.bestE < 8 || b.burn !== undefined) continue;
    if (campNear(b.cx, b.cz, 12)) continue;
    const alongX = r2(b.id, 59) < .5;
    const word = ROOF_WORDS[Math.floor(r2(b.id, 61) * ROOF_WORDS.length)];
    const half = Math.min(b.bestE - 2, (word.length * 4 + 4) >> 1);
    if ((word.length * 4 + 3) >> 1 > half) continue;
    const pair = AD_PAIRS[Math.floor(r2(b.id, 63) * AD_PAIRS.length)];
    const x0 = alongX ? b.cx - half : b.cx, x1 = alongX ? b.cx + half : b.cx;
    const z0 = alongX ? b.cz : b.cz - half, z1 = alongX ? b.cz : b.cz + half;
    structs.push({ type: 'roofad', alongX, x0, x1, z0, z1, y0: b.top, y1: b.top + 12, word, bg: pair[0], fg: pair[1], seed: b.id });
  }
  structs.push({ type: 'statue', x: LIB.x, z: LIB.z, x0: LIB.x - 30, x1: LIB.x + 30, z0: LIB.z - 30, z1: LIB.z + 30 });

  // Column ceiling in chunks, so empty sky never touches the workers.
  const chunkTop = new Uint8Array(CW * CD);
  for (let cz = 0; cz < CD; cz++) for (let cx = 0; cx < CW; cx++) {
    let m = STREET_Y + 2;
    for (let z = cz * CS; z < (cz + 1) * CS; z++) for (let x = cx * CS, i = z * WX + x; x < (cx + 1) * CS; x++, i++) {
      const t = height[i] ? height[i] + 10 : STREET_Y + terr[i] + 12;
      if (t > m) m = t;
    }
    chunkTop[cx + cz * CW] = Math.min(255, m);
  }
  for (const s of structs) {
    const top = s.type === 'spire' ? s.y1 : s.type === 'bridge' ? STREET_Y + s.towerH + 4 + 22 : s.type === 'screen' ? s.y2 : s.type === 'statue' ? 118 : (s.y1 || 40);
    for (let cz = Math.max(0, s.z0 >> 5); cz <= Math.min(CD - 1, s.z1 >> 5); cz++) for (let cx = Math.max(0, s.x0 >> 5); cx <= Math.min(CW - 1, s.x1 >> 5); cx++) {
      chunkTop[cx + cz * CW] = Math.min(255, Math.max(chunkTop[cx + cz * CW], top));
    }
  }

  // Places worth a name on the map. tier 0 shows at any zoom, tier 1 only when you are looking closely.
  const aveAt = (a) => xU(aveU(a));
  const places = [
    ['Financial District', xU(.42), zV(.04), 0, 'area'], ['Tribeca', xU(.27), zV(.11), 1, 'area'], ['SoHo', xU(.42), zV(.13), 0, 'area'], ['Chinatown', xU(.58), zV(.105), 0, 'area'],
    ['Lower East Side', xU(.82), zV(.15), 0, 'area'], ['Greenwich Village', xU(.27), zV(.19), 0, 'area'], ['East Village', xU(.82), zV(.195), 0, 'area'], ['Chelsea', xU(.2), zV(.25), 0, 'area'],
    ['Flatiron', xU(.5), zV(.24), 1, 'area'], ['Gramercy', xU(.72), zV(.265), 1, 'area'], ["Hell's Kitchen", xU(.2), zV(.37), 0, 'area'], ['Midtown', xU(.47), zV(.36), 0, 'area'],
    ['Midtown East', xU(.75), zV(.37), 0, 'area'], ['Upper West Side', xU(.2), zV(.52), 0, 'area'], ['Central Park', xU(.43), zV(.58), 0, 'park'], ['Upper East Side', xU(.75), zV(.52), 0, 'area'],
    ['Morningside Heights', xU(.2), zV(.69), 1, 'area'], ['Harlem', xU(.45), zV(.70), 0, 'area'], ['East Harlem', xU(.72), zV(.66), 0, 'area'], ['Washington Heights', xU(.42), zV(.84), 0, 'area'], ['Inwood', xU(.5), zV(.97), 0, 'area'],
    ['Empire State Building', empX, empZ, 1, 'mark'], ['Chrysler Building', chryX, chryZ, 1, 'mark'], ['One World Trade', wtcX, wtcZ, 1, 'mark'], ['Rockefeller Center', rockX, rockZ, 1, 'mark'], ['432 Park', px432, pz432, 1, 'mark'],
    ['Times Square', tsx, (tsz0 + tsz1) >> 1, 0, 'mark'], ['The Met', (metR.x0 + metR.x1) >> 1, (metR.z0 + metR.z1) >> 1, 1, 'mark'], ['Public Library', (P_LIBRARY.x0 + P_LIBRARY.x1) >> 1, (P_LIBRARY.z0 + P_LIBRARY.z1) >> 1, 1, 'mark'],
    ['Flatiron Building', xU(aveU(7)), nearestRow(23).z - 22, 1, 'mark'], ['Grand Central', aveAt(9.4), nearestRow(42).z, 1, 'mark'], ['Penn Station', aveAt(4.6), nearestRow(33).z, 1, 'mark'], ['Columbus Circle', aveAt(4), nearestRow(59).z, 1, 'mark'],
    ['Lincoln Center', aveAt(3.4), nearestRow(65).z, 1, 'mark'], ['Union Square', (P_UNION.x0 + P_UNION.x1) >> 1, (P_UNION.z0 + P_UNION.z1) >> 1, 1, 'park'], ['Madison Square', (P_MADISON.x0 + P_MADISON.x1) >> 1, (P_MADISON.z0 + P_MADISON.z1) >> 1, 1, 'park'],
    ['City Hall', xU(.385), zV(.07), 1, 'mark'], ['Wall Street', xU(.38), zV(.03), 1, 'mark'], ['Battery Park', xU(.27), zV(.018), 1, 'park'], ['Columbia University', aveAt(3), nearestRow(117).z, 1, 'mark'], ['Apollo Theater', aveAt(5.5), nearestRow(125).z, 1, 'mark'],
    ['Brooklyn Bridge', se1, bz1, 0, 'bridge'], ['Williamsburg Bridge', se2, bz2, 0, 'bridge'], ['Queensboro Bridge', se3, bz3, 0, 'bridge'], ['George Washington Bridge', sw4, bz4, 0, 'bridge'], ['Statue of Liberty', LIB.x, LIB.z, 0, 'mark'],
  ].map(([name, x, z, tier, kind]) => ({ name, x: Math.round(x), z: Math.round(z), tier, kind }));

  // The part of Manhattan somewhere is in, whether or not there is a wall around it now.
  const areaOf = (x, z) => {
    const u = uX(x), v = vZ(z);
    for (const [dv, du, name] of DISTRICTS) if (v < dv && u < du) return name;
    return 'Manhattan';
  };
  const describe = (x, z) => {
    const u = uX(x), v = vZ(z);
    for (const c of camps) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1) return { district: c.name, cross: 'Inside the wall' };
    let district = 'New York Harbor';
    if (ground[Math.max(0, Math.min(N - 1, Math.floor(z) * WX + Math.floor(x)))] !== G.WATER || (u > 0 && u < 1 && v > 0 && v < 1)) {
      for (const [dv, du, name] of DISTRICTS) if (v < dv && u < du) { district = name; break; }
    }
    if (ground[Math.floor(z) * WX + Math.floor(x)] === G.WATER) return { district: u < .5 ? 'Hudson River' : 'East River', cross: '' };
    let cross = '';
    if (z < zHouston) {
      const row = rows.reduce((b, r) => Math.abs(r.z - z) < Math.abs(b.z - z) ? r : b, rows[0]);
      const ave = aves.reduce((b, a) => Math.abs(a.x - x) < Math.abs(b.x - x) ? a : b, aves[0]);
      cross = `${ordinal(row.num)} St & ${ave.name}`;
    }
    return { district, cross };
  };

  return {
    ground, lot, edge, height, mark, terr, buildings, camps, rows, aves, structs, chunkTop, piers, places, fireSpots,
    props: propArr, binStart, binData, broadway: broadwayNames, describe, areaOf,
    spawn: { x: camps[0].cx, z: camps[0].cz, y: STREET_Y + 1 },
  };
}

export function ordinal(n) {
  const s = n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return n + s;
}
