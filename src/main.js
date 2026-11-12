// Game shell: boot, state machine, main loop, saving and the glue between systems.
import { Renderer, QUALITY } from './engine/renderer.js';
import { World } from './engine/world.js';
import { FarCity, buildCityMap } from './engine/farcity.js';
import { ActorRenderer } from './engine/actors.js';
import { Particles } from './engine/particles.js';
import { buildLayout, P as PROP, PROP_STRIDE } from './shared/layout.js';
import { glowLights } from './shared/camps.js';
import { WX, WZ, CW, CD, STREET_Y, WATER_Y, G, STATUE_LAMPS, FLOOR_H } from './shared/constants.js';
import { M, HP, isGlass, PALETTE, FLAGS, F_EMISSIVE, F_CRACK, CRACKED, F_LEAF, F_GLASS } from './shared/materials.js';
import { r2, h2 } from './shared/rng.js';
import { Horde, DIFFICULTY } from './game/horde.js';
import { Player } from './game/player.js';
import { NPCs, Jobs } from './game/npcs.js';
import { Dialogue } from './game/dialogue.js';
import { CampSim } from './game/campsim.js';
import { UI } from './game/ui.js';
import { Audio2 } from './game/audio.js';
import { ViewModel } from './game/viewmodel.js';
import { START_CAMP, CITIZENSHIP, papersFor, ITEMS, rollLoot, rollZombieDrop, CAMP_START, randomName, SURVIVAL_TIERS } from './game/items.js';
import { STYLES } from './shared/layout.js';
import { Weather } from './game/weather.js';
import { RainMap } from './engine/rainmap.js';
import { Drips } from './game/drips.js';
import { Dogs } from './game/dogs.js';
import { Director } from './game/director.js';
import { LORE } from './game/camplore.js';
import { damp } from './engine/math.js';
const pickBusy = (a) => a[Math.floor(Math.random() * a.length)];

const rand = Math.random;
// The timeout keeps boot moving in a background tab, where animation frames stop.
const nextFrame = () => new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
const DAY_SECONDS = 1500;
const GARVEY_V = 5;        // which build of Carver Yard a save's edits belong to
const INTRO_TIME = 7.5;    // seconds of words on black before the wake-up
const INTRO_FADE = 1.3;    // the last of that is them fading out, and a beat of nothing
// What a broken voxel gives back when you tear it down by hand.
const SALVAGE = new Map();
for (const id of [M.PLANK, M.BARRICADE, M.BARRICADE2, M.WOOD, M.WOOD_D, M.LOG, M.TANK, M.DOOR, M.WOOD_FLOOR, M.BLOCK_WOOD, M.TRUNK, M.CRATE_OPEN]) SALVAGE.set(id, 'block_wood');
for (const id of [M.BRICK_O, M.BRICK_P, M.STUCCO, M.STUCCO_B, M.STUCCO_G, M.BRICK_R, M.BRICK_R2, M.BRICK_B, M.BRICK_Y, M.BRICK_W, M.BROWNSTONE, M.LIMESTONE, M.GRANITE, M.CONCRETE, M.CONCRETE_D, M.CASTIRON, M.BLOCK_CONC, M.PLASTER, M.PLASTER2, M.RUBBLE, M.JERSEY, M.WALK, M.ASPHALT, M.TILE]) SALVAGE.set(id, 'block_conc');
for (const id of [M.STEEL, M.STEEL_D, M.ALUM, M.IRON, M.BLOCK_STEEL, M.CONT_R, M.CONT_B, M.CONT_O, M.CONT_G, M.RUST, M.TAXI, M.CAR_W, M.CAR_K, M.CAR_R, M.CAR_B, M.CAR_S, M.BUS, M.BURNT]) SALVAGE.set(id, 'block_steel');
const SETTINGS_KEY = 'acez.settings.v2';
const OLD_SETTINGS_KEY = 'acez.settings.v1';
const DB_NAME = 'acez';
const MENU_SHOT = { angle: .62, dist: 185, height: 88, turn: .46, pitch: -.14, fov: 1.05, flight: 125, startHeight: 30, startOff: 44, startPitch: -.1 };
const SAVE_KEY = 'slot15';  // bumped whenever the map changes: old voxel edits no longer line up
export const SLOTS = 3;
// Slot 1 keeps the plain key, so a save from before there were slots simply becomes the first character.
const slotKey = (n) => (n === 1 ? SAVE_KEY : `${SAVE_KEY}.${n}`);   // 'sandbox' gives its own key too

function openDB() {
  return new Promise((resolve, reject) => {
    const q = indexedDB.open(DB_NAME, 1);
    q.onupgradeneeded = () => q.result.createObjectStore('saves');
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
async function dbPut(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  });
}
async function dbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('saves', 'readonly');
    const q = tx.objectStore('saves').get(key);
    q.onsuccess = () => { db.close(); resolve(q.result); };
    q.onerror = () => reject(q.error);
  });
}

// A grid of values softened in place: a few passes of a 3x3 average.
function softenGrid(A, W, D, passes) {
  const B = new Float32Array(A.length);
  for (let p = 0; p < passes; p++) {
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
      let s = 0, n = 0;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, zz = z + dz; if (xx < 0 || zz < 0 || xx >= W || zz >= D) continue; s += A[xx + zz * W]; n++; }
      B[x + z * W] = s / n;
    }
    A.set(B);
  }
}

// Smooth value noise for the maps.
// A cheap integer hash for the maps, 0..1, for any pair of numbers (fractions are kept to a sixty-fourth).
function mapHash(a, b) { return h2((a * 64) | 0, (b * 64) | 0) / 4294967296; }

function mapNoise(a, b) {
  const hash = (p, q) => h2(p | 0, q | 0) / 4294967296;
  const ia = Math.floor(a), ib = Math.floor(b), fa = a - ia, fb = b - ib, ua = fa * fa * (3 - 2 * fa), ub = fb * fb * (3 - 2 * fb);
  const p = hash(ia, ib), q = hash(ia + 1, ib), r = hash(ia, ib + 1), t = hash(ia + 1, ib + 1);
  return p + (q - p) * ua + (r - p) * ub + (p - q - r + t) * ua * ub;
}

class Game {
  constructor() {
    this.state = 'boot';
    this.time = 0;
    this.frame = 0;
    this.tod = .34;
    this.day = 1;
    this.settings = this.loadSettings();
    this.stats = { shots: 0, jobs: 0, placed: 0 };
    this.input = { keys: {}, pressed: {}, mouse: [false, false, false], mousePressed: [false, false, false], mouseDX: 0, mouseDY: 0, sens: .0022 };
    this.pickups = [];
    this.tempLights = [];
    this.explFlash = 0;
    this.fadeK = 0;
    this.fpsT = 0;
    this.fpsN = 0;
    this.fps = 0;
    this.showFPS = false;
    this.focusSmooth = 40;
    this.flareVis = 0;
    this.cpuMs = 0;
    this.cam = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, fov: 1.3 };
    this.fovSmooth = 1.3;
    this.audio = new Audio2();
    this.weather = new Weather();
    this.weather.onThunder = (delay) => this.audio.thunder(delay);
  }

  defaultSettings() {
    return { quality: 'high', view: 320, scale: 1, cap: 24000, fov: 105, sens: 1, volume: .8, motion: false, dof: true, fpsCap: 0, muteSiren: false, uiScale: 1, clock24: false, drips: true, grain: .3, minimap: false, chatterNoHud: true, hitmarker: false, crosshair: true,
      brightness: 1, bob: 1, shake: 1, music: 1, adsSens: 1, invertY: false, toggleAim: false, toggleCrouch: false, showFps: false, defaultsV: 3 };
  }

  loadSettings() {
    const base = this.defaultSettings();
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        const mine = JSON.parse(saved), s = { ...base, ...mine };
        // The defaults moved. Anyone still on the old ones moves with them; anyone who chose something else keeps it.
        if (mine.defaultsV === undefined) {
          if (s.fov === 80) s.fov = 105;
          if (s.uiScale === .82) s.uiScale = 1;
        }
        // The city is drawn further out than it was. Anyone still on a preset's old distance moves out with it.
        if ((mine.defaultsV ?? 0) < 3) {
          const was = { 192: 224, 256: 288, 288: 320, 384: 416 };
          if (was[s.view]) s.view = was[s.view];
          s.defaultsV = 3;
        }
        return s;
      }
      // Older settings carry over, except motion blur, which now starts off for everyone.
      return { ...base, ...JSON.parse(localStorage.getItem(OLD_SETTINGS_KEY) || '{}'), motion: false };
    } catch { return base; }
  }

  saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* private mode */ }
    this.applyLight();
    if (this.horde) { this.horde.settings.activeCap = this.settings.cap; }
  }

  // The settings that cost nothing to change: how the mouse feels, how loud things are, how bright the picture is.
  applyLight() {
    const s = this.settings, I = this.input;
    I.sens = .0022 * s.sens;
    I.adsSens = s.adsSens ?? 1;
    I.invertY = !!s.invertY;
    I.toggleAim = !!s.toggleAim;
    I.toggleCrouch = !!s.toggleCrouch;
    this.audio.setVolume(s.volume, s.music ?? 1);
    if (this.renderer) this.renderer.brightness = s.brightness ?? 1;
  }

  setQualityPreset(key) {
    const q = QUALITY[key];
    const s = this.settings;
    s.quality = key; s.view = q.view; s.scale = q.scale; s.motion = q.motion; s.dof = q.dof;
    this.saveSettings();
    this.applySettings(true);
  }

  applySettings(rebuild) {
    const s = this.settings;
    this.renderer.applyQuality(s.quality, { scale: s.scale, motion: s.motion, dof: s.dof, view: s.view });
    this.applyLight();
    if (this.world && this.world.viewRadius !== s.view) {
      this.world.viewRadius = s.view;
      this.world.lastCX = -999;
    }
    if (this.horde) {
      this.horde.settings.activeCap = s.cap;
      this.horde.settings.radius = Math.min(264, s.view - 24);
    }
  }

  async boot() {
    const canvas = document.getElementById('gl');
    this.renderer = new Renderer(canvas);
    this.ui = new UI(this);
    this.ui.loading('', .05, '', false, true);
    await nextFrame();
    await nextFrame();
    const t0 = performance.now();
    this.layout = buildLayout();
    console.log(`layout ${(performance.now() - t0).toFixed(0)} ms, ${this.layout.buildings.length} buildings, ${this.layout.props.length / PROP_STRIDE} props`, JSON.stringify(this.layout.timings));
    this.ui.loading('', .45, '', false, true);
    await nextFrame();
    const gl = this.renderer.gl;
    const t1 = performance.now();
    const map = buildCityMap(this.layout);
    this.renderer.setCityMap(map.rgba, map.w, map.h);
    const t2 = performance.now();
    this.far = new FarCity(gl, this.layout);
    const t3 = performance.now();
    this.makeMapCanvas();
    console.log(`city map ${(t2 - t1) | 0} ms, far ${(t3 - t2) | 0} ms, maps ${(performance.now() - t3) | 0} ms`);
    this.ui.loading('', .7, '', false, true);
    await nextFrame();
    this.world = new World(this.layout, this.renderer);
    const cores = navigator.hardwareConcurrency || 4;
    await this.world.initWorkers(Math.max(2, Math.min(8, cores - 2)));
    this.actors = new ActorRenderer(gl);
    this.particles = new Particles(gl, this.world);
    this.rainMap = new RainMap(this.world);
    this.renderer.rainMap = this.rainMap;
    this.drips = new Drips(this);
    this.horde = new Horde(this.world, this.layout, this.actors, this.particles);
    this.horde.weather = this.weather;
    this.horde.rainMap = this.rainMap;
    this.viewModel = new ViewModel(gl);
    this.player = new Player(this);
    this.npcs = new NPCs(this);
    this.dogs = new Dogs(this);
    this.jobs = new Jobs(this);
    this.dialogue = new Dialogue(this);
    this.campSim = new CampSim(this);
    this.horde.sim = this.campSim;
    this.director = new Director(this);
    this.setupCallbacks();
    this.setupInput();
    this.setupAtmosphere();
    this.applySettings(false);
    this.horde.applyDifficulty(DIFFICULTY.hard);
    this.horde.settings.activeCap = Math.min(this.settings.cap, 14000);
    this.horde.resetPopulation();
    this.refreshCityLights();
    // Browsers keep quiet until you touch something. So the menu comes up behind a black screen and one click: that touch starts
    // the sound, and the menu fades in with its music already playing. Behind the screen, the city around it gets loaded meanwhile.
    this.bootVeil();
    this.enterMenu();
    await this.refreshContinue();
    this.last = performance.now();
    this.schedule();
  }

  // The map is drawn from the state itself, roof by roof, the way an Ace of Spades map is: every pixel the colour of what is really
  // there, the hills lit from the north-west with a line round them every so often, and the shadow of the tall things falling across it.
  // Past the edges of the world the country carries on (and the sea, to the east), so the map never ends in a hard line.
  groundColour(wx, wz, t, f, col, hash) {
    const n = hash(wx >> 2, wz >> 2);
    let rgb = col(n < .3 ? M.GRASS_DRY : n < .65 ? M.GRASS : M.GRASS2);
    // Richer toward the coast, over a long reach of the map; a little less rich everywhere than it was.
    const ck = Math.max(0, Math.min(1, (wx - this.layout.coastAt(wz) + 2600) / 2400));
    const lum = rgb[0] * .3 + rgb[1] * .59 + rgb[2] * .11, sat = (.68 + mapNoise(wx * .012 + 4, wz * .012) * .6 + (hash(wx >> 3, wz >> 3) - .5) * .1) * (1 + ck * .3);
    rgb = [lum + (rgb[0] - lum) * sat, lum + (rgb[1] - lum) * sat, lum + (rgb[2] - lum) * sat];
    // Yellower from the north-west down to the south-east, and most of all round Weston's farms.
    const diag = Math.max(0, Math.min(1, (wx / WX + wz / WZ) / 2)), wk = Math.exp(-(((wx - 2300) / 1100) ** 2 + ((wz - 2700) / 1000) ** 2));
    const yk = diag * .22 + wk * .2;
    rgb = [rgb[0] + (122 - rgb[0]) * yk, rgb[1] + (116 - rgb[1]) * yk, rgb[2] + (58 - rgb[2]) * yk];
    // High ground goes a duller olive, not pale.
    const hk = Math.min(.38, Math.max(0, t) / 180);
    rgb = [rgb[0] + (84 - rgb[0]) * hk, rgb[1] + (84 - rgb[1]) * hk, rgb[2] + (54 - rgb[2]) * hk];
    const fv = Math.max(0, Math.min(1, f + (mapNoise(wx * .02 + 9, wz * .02) - .5) * .18)), fk = Math.pow(fv, 2.2) * .55;
    return [rgb[0] + (18 - rgb[0]) * fk, rgb[1] + (34 - rgb[1]) * fk, rgb[2] + (17 - rgb[2]) * fk];
  }

  makeMapCanvas() {
    const L = this.layout;
    const c = document.createElement('canvas');
    const w = WX >> 1, h = WZ >> 1;
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const img = x.createImageData(w, h);
    const T = (wx, wz) => (wx < 0 || wz < 0 || wz >= WZ ? L.elevAt(wx, wz) : L.terr[wz * WX + Math.min(WX - 1, wx)]);
    const FGW = (WX >> 4) + 2, FGD = (WZ >> 4) + 2, FG = new Float32Array(FGW * FGD);
    for (let gz = 0; gz < FGD; gz++) for (let gx = 0; gx < FGW; gx++) FG[gx + gz * FGW] = Math.min(1, L.forestAt(gx * 16, gz * 16) * .8 + L.trinityAt(gx * 16, gz * 16) * .35);
    softenGrid(FG, FGW, FGD, 5);
    const FA = (wx, wz) => {
      const fx = wx / 16, fz = wz / 16, ix = Math.min(FGW - 2, fx | 0), iz = Math.min(FGD - 2, fz | 0), ux = fx - ix, uz = fz - iz, k = ix + iz * FGW;
      return (FG[k] * (1 - ux) + FG[k + 1] * ux) * (1 - uz) + (FG[k + FGW] * (1 - ux) + FG[k + FGW + 1] * ux) * uz;
    };
    const FOREST = [24, 42, 22];
    const col = (id) => [PALETTE[id * 4], PALETTE[id * 4 + 1], PALETTE[id * 4 + 2]];
    const hash = mapHash;
    const WATER = { deep: [20, 42, 54], shallow: [38, 66, 74] };
    for (let z = 0; z < h; z++) for (let px = 0; px < w; px++) {
      const wx = px << 1, wz = z << 1, i = wz * WX + wx;
      const g = L.ground[i], top = L.height[i];
      let rgb;
      if (top && L.lot[i]) {
        const b = L.buildings[L.lot[i] - 1], st = STYLES[b.style];
        rgb = col(L.edge[i] <= 1 ? st.trim : st.roof);
        // Skylights, vents and rooftop clutter.
        if (L.edge[i] > 2 && hash(wx >> 3, wz >> 3) < .1 && (wx & 7) < 4 && (wz & 7) < 4) rgb = col(M.ALUM);
        const k = .86 + Math.min(.34, (top - STREET_Y) / 340);
        rgb = [rgb[0] * k, rgb[1] * k, rgb[2] * k];
      } else if (g === G.WATER || (L.terr[i] < -2 && g === G.PARK)) {
        const shore = hash(wx * .013 + 3, wz * .013) * .15 + (L.terr[i] > -6 ? .75 : 0);
        rgb = [WATER.deep[0] + (WATER.shallow[0] - WATER.deep[0]) * shore, WATER.deep[1] + (WATER.shallow[1] - WATER.deep[1]) * shore, WATER.deep[2] + (WATER.shallow[2] - WATER.deep[2]) * shore];
      } else if (g === G.ROAD) rgb = col((L.mark[i] & 15) === 1 ? M.LINE_Y : L.mark[i] & 15 ? M.LINE_W : M.ASPHALT);
      else if (g === G.WALK) rgb = col(M.WALK);
      else if (g === G.PLAZA) rgb = col(L.mark[i] === 4 ? M.ASPHALT2 : M.WALK2);
      else if (g === G.SAND) {
        const s0 = col(M.SAND), gr = this.groundColour(wx, wz, Math.max(0, L.terr[i]), 0, col, hash), at2 = (dx, dz) => L.ground[Math.max(0, Math.min(WZ - 1, wz + dz)) * WX + Math.max(0, Math.min(WX - 1, wx + dx))] === G.PARK ? 1 : 0;
        const k = Math.min(.75, (at2(-8, 0) + at2(-14, 0) + at2(0, -10) + at2(0, 10)) * .19 + (hash(wx >> 1, wz >> 1) - .5) * .15);
        rgb = [s0[0] + (gr[0] - s0[0]) * Math.max(0, k), s0[1] + (gr[1] - s0[1]) * Math.max(0, k), s0[2] + (gr[2] - s0[2]) * Math.max(0, k)];
      }
      else if (g === G.DIRT) rgb = col(hash(wx >> 1, wz >> 1) < .4 ? M.PATH : M.DIRT);
      else if (g === G.FIELD) { const m = L.mark[i], dot = hash(wx >> 1, wz >> 1); rgb = col(m === 1 ? (wx % 6 < 4 ? M.LEAF2 : M.SOIL) : m === 2 ? (dot < .6 ? M.CORN : M.LEAF3) : m === 3 ? (dot < .35 ? M.COTTON : M.LEAF3) : m === 4 ? (dot < .5 ? M.PEANUT : M.SOIL) : m === 5 ? (wx % 8 < 2 ? M.LEAF2 : M.SOIL) : m === 6 ? M.GRASS_DRY : M.SOIL); rgb = [rgb[0] * .88, rgb[1] * .88, rgb[2] * .88]; }
      else if (g === G.ALLEY) rgb = col(M.ALLEYWAY);
      else if (g === G.PROM) rgb = col((wx + wz) % 4 === 0 ? M.WOOD_D : M.WOOD);
      else if (g === G.CAMP) rgb = col(M.GRAVEL);
      else if (g === G.ROCK) { const r0 = col(M.SCHIST), gr = this.groundColour(wx, wz, L.terr[i], 0, col, hash); rgb = [r0[0] * .62 + gr[0] * .3, r0[1] * .62 + gr[1] * .3, r0[2] * .62 + gr[2] * .3]; }
      else if (g === G.PARK) {
        rgb = this.groundColour(wx, wz, L.terr[i], L.townAt(wx, wz) ? 0 : FA(wx, wz), col, hash);
      } else rgb = col(M.WALK);
      // Relief: lit from the north-west, a little lighter the higher it is, and a contour every twelve blocks of height.
      let shade = 1;
      if (!top && g !== G.WATER) {
        const t = L.terr[i], slope = ((T(wx + 4, wz) - T(wx - 4, wz)) + (T(wx, wz + 4) - T(wx, wz - 4))) * .07;
        shade *= 1 + Math.max(-.6, Math.min(.5, slope));
        const lift = g === G.PARK ? 0 : Math.max(0, Math.min(60, t)) * .2;
        rgb = [rgb[0] + lift, rgb[1] + lift * .9, rgb[2] + lift * .7];
        if (t > 3 && (g === G.PARK || g === G.ROCK || g === G.FIELD) && (Math.floor(t / 16) !== Math.floor(T(wx + 2, wz) / 16) || Math.floor(t / 16) !== Math.floor(T(wx, wz + 2) / 16))) shade *= .87;
      }
      const own = top || STREET_Y;
      for (let s = 1; s <= 8; s++) {
        const nz = wz - s * 4, nx = wx - s * 3;
        if (nz < 0 || nx < 0) break;
        if ((L.height[nz * WX + nx] || STREET_Y + L.terr[nz * WX + nx]) - (top || STREET_Y + L.terr[i]) > s * 5) { shade = .58; break; }
      }
      const grain = .94 + hash(wx, wz) * .12;
      const o = (px + z * w) * 4;
      img.data[o] = Math.min(255, rgb[0] * shade * grain);
      img.data[o + 1] = Math.min(255, rgb[1] * shade * grain);
      img.data[o + 2] = Math.min(255, rgb[2] * shade * grain);
      img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // Things on the ground: trees and parked cars, at their real positions.
    const hex = (id) => { const [r, g, b] = col(id); return `rgb(${r | 0},${g | 0},${b | 0})`; };
    const carCols = [M.CAR_S, M.TAXI, M.BUS, M.CAR_W, M.CAR_K, M.CAR_W, M.BURNT];
    const dim = (id, k) => { const [r, g, b] = col(id); return `rgb(${r * k | 0},${g * k | 0},${b * k | 0})`; };
    const leafLv = [M.LEAF, M.LEAF2, M.LEAF].map((id, k) => [0, 1, 2, 3, 4].map((lv) => dim(id, (k === 2 ? .76 : .88) * (1 - lv * .06))));
    const leafAt = (k, f) => leafLv[k][Math.max(0, Math.min(4, Math.round(f * 5)))];
    const P_ = L.props;
    for (let k = 0; k < P_.length; k += PROP_STRIDE) {
      const t = P_[k], a = P_[k + 3], b = P_[k + 4], px = P_[k + 1] >> 1, pz = P_[k + 2] >> 1;
      if (t === PROP.CAR) {
        const len = b === 2 ? 10 : b === 3 ? 6 : 4, wid = 2;
        x.fillStyle = hex(carCols[b] || M.CAR_S);
        if (a === 0) x.fillRect(px, pz, wid, len); else x.fillRect(px, pz, len, wid);
      } else if (t === PROP.TREE || t === PROP.PARKTREE) {
        const r = t === PROP.PARKTREE ? 3 : 2;
        x.fillStyle = 'rgba(6,12,6,.3)';
        x.fillRect(px - (r >> 1) + 1, pz - (r >> 1) + 1, r, r);
        x.fillStyle = leafAt(a % 3, FA(P_[k + 1], P_[k + 2]));
        x.fillRect(px - (r >> 1), pz - (r >> 1), r, r);
      }
    }
    for (let tz = -6; tz < WZ + 6; tz += 6) for (let tx = -6; tx < WX + 6; tx += 6) {
      if (tx >= 6 && tx < WX - 6 && tz >= 6 && tz < WZ - 6) { tx = Math.ceil((WX - 6) / 6) * 6 - 6; continue; }
      const j = r2(tx, tz), ax = tx + Math.floor(j * 40) % 4, az = tz + Math.floor(j * 70) % 4;
      if (ax < 0 || az < 0 || ax >= WX || az >= WZ || L.ground[az * WX + ax] !== G.PARK || j >= L.forestAt(tx, tz) * .8) continue;
      x.fillStyle = 'rgba(6,12,6,.3)';
      x.fillRect((ax >> 1), (az >> 1), 3, 3);
      x.fillStyle = leafAt(Math.floor(j * 9999) % 3, FA(ax, az));
      x.fillRect((ax >> 1) - 1, (az >> 1) - 1, 3, 3);
    }
    // Camps, part by part.
    const partCol = { bonfire: M.FIRE, bench: M.WOOD_D, stall: M.AWN_G, crops: M.LEAF2, court: M.COURT, firepit: M.LOG, table: M.WOOD, garden: M.LEAF, flag: M.IRON, tower: M.IRON, bigtent: M.TENT_W, tent: M.TENT_G };
    const wallCol = { cabs: M.TAXI, containers: M.CONT_R, palisade: M.LOG, hesco: M.SANDBAG, sheet: M.STEEL, scrap: M.RUST, white: M.CAR_W, brick: M.BRICK_R, stone: M.GRANITE };
    for (const camp of L.camps) {
      const idOf = (p) => { const id = p.sign || p.roof || p.col || p.mat || partCol[p.t] || M.PLANK; return typeof id === 'number' ? id : 0; };
      const box = (p) => [p.x0 >> 1, p.z0 >> 1, Math.max(1, (p.x1 - p.x0 + 1) >> 1), Math.max(1, (p.z1 - p.z0 + 1) >> 1)];
      x.fillStyle = 'rgba(4,6,8,.42)';
      for (const p of camp.parts) { if (!idOf(p) || !(p.h > 1)) continue; const [bx, bz, bw, bd] = box(p), o = Math.min(5, Math.max(1, p.h / 4)); x.fillRect(bx + o * .75, bz + o, bw, bd); }
      for (const p of camp.parts) {
        const id = idOf(p);
        if (!id) continue;
        const [bx, bz, bw, bd] = box(p);
        x.fillStyle = hex(id);
        x.fillRect(bx, bz, bw, bd);
        if (bw > 2 && bd > 2) { x.strokeStyle = dim(id, .62); x.lineWidth = .7; x.strokeRect(bx + .35, bz + .35, bw - .7, bd - .7); }
      }
      x.strokeStyle = hex(wallCol[camp.wall] || M.STEEL);
      x.lineWidth = 2;
      x.strokeRect((camp.x0 >> 1) + 1, (camp.z0 >> 1) + 1, (camp.x1 - camp.x0) >> 1, (camp.z1 - camp.z0) >> 1);
    }
    this.mapCanvas = c;
    this.makeSeaModel();
    this.mapSurround = this.makeMapSurround();
    this.mapMargin = this.makeMapMargin();
  }

  // The country just past the edges, for the map: drawn at the map's own detail and exactly the way the map draws its own country,
  // pixel for pixel, so there is no seam where the world stops. The woods, the fields running on south, the river running on north,
  // and the two highways west carrying on out of sight.
  makeSeaModel() {
    const L = this.layout, G0 = L.ground;
    const runsOf = (z) => {
      const out = [];
      let x = 0;
      while (x < WX) {
        while (x < WX && G0[z * WX + x] === G.WATER) x++;
        const a = x;
        while (x < WX && G0[z * WX + x] !== G.WATER) x++;
        if (x > a + 4) out.push([a, x - 1]);
      }
      return out;
    };
    const top = runsOf(0), bot = runsOf(WZ - 1);
    const wob = (z) => (mapNoise(z * .006 + 2, 7.7) - .5) * 60 + (mapNoise(z * .03, 1.3) - .5) * 10;
    // A stretch of land off the edge of the world: the mainland keeps going, its shore bending the way the coast was heading (the river
    // and the like keep their banks); a small island, like the spit, tapers away to a point.
    const coastRun = (runs) => runs.reduce((m, r, k) => (r[1] - r[0] > 300 ? k : m), -1);
    const landAt = (runs, wx, d, trend) => {
      const last = coastRun(runs);
      for (let k = 0; k < runs.length; k++) {
        const [a, b] = runs[k];
        if (b - a > 300) {
          const right = k === last ? b + trend * d * Math.max(.35, 1 - d / 1600) + wob(d) - wob(0) : b;
          if (wx >= a && wx <= right) return true;
          continue;
        }
        const c = (a + b) / 2 + d * .06, hw = (b - a) / 2 - d * .28;
        if (hw > 0 && Math.abs(wx - c) <= hw) return true;
      }
      return false;
    };
    this.seaAt = (wx, wz) => {
      if (wx >= WX) return true;
      if (wz < 0) return !landAt(top, wx, -wz, -.45);
      if (wz >= WZ) return !landAt(bot, wx, wz - WZ + 1, -.11);
      return wx > L.coastAt(wz);
    };
  }

  makeMapMargin() {
    const L = this.layout, X0 = -1408, Z0 = -768, X1 = WX, Z1 = WZ + 768, w = (X1 - X0) >> 1, h = (Z1 - Z0) >> 1;
    const c = document.createElement('canvas');
    c.width = w; c.height = h; c.x0 = X0; c.z0 = Z0;
    const x = c.getContext('2d'), img = x.createImageData(w, h);
    const col = (id) => [PALETTE[id * 4], PALETTE[id * 4 + 1], PALETTE[id * 4 + 2]];
    const hash = mapHash;
    const inWorld = (wx, wz) => wx >= 0 && wz >= 0 && wx < WX && wz < WZ;
    const GS = 16, GW = Math.ceil((X1 - X0) / GS) + 2, GD = Math.ceil((Z1 - Z0) / GS) + 2, E = new Float32Array(GW * GD), F = new Float32Array(GW * GD);
    for (let gz = 0; gz < GD; gz++) for (let gx = 0; gx < GW; gx++) {
      const wx = X0 + gx * GS, wz = Z0 + gz * GS;
      if (inWorld(wx - 220, wz - 220) && inWorld(wx + 220, wz + 220)) continue;
      E[gx + gz * GW] = L.elevAt(wx, wz);
      F[gx + gz * GW] = Math.min(1, L.forestAt(wx, wz) * .8 + L.trinityAt(wx, wz) * .35);
    }
    softenGrid(F, GW, GD, 10);
    const at = (A, wx, wz) => {
      const fx = Math.max(0, (wx - X0) / GS), fz = Math.max(0, (wz - Z0) / GS), ix = Math.min(GW - 2, fx | 0), iz = Math.min(GD - 2, fz | 0), ux = Math.min(1, fx - ix), uz = Math.min(1, fz - iz), k = ix + iz * GW;
      return (A[k] * (1 - ux) + A[k + 1] * ux) * (1 - uz) + (A[k + GW] * (1 - ux) + A[k + GW + 1] * ux) * uz;
    };
    // The highways west, and the two roads north out of Albion, carrying straight on from where they leave the world.
    const chaikin = (pts) => { for (let n = 0; n < 2; n++) { const o = [pts[0]]; for (let i = 0; i + 1 < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1]; o.push([ax * .75 + bx * .25, az * .75 + bz * .25], [ax * .25 + bx * .75, az * .25 + bz * .75]); } o.push(pts[pts.length - 1]); pts = o; } return pts; };
    const roads = [chaikin([[40, 2278], [0, 2290], [-196, 2350], [-480, 2412], [-760, 2400], [-1060, 2452], [-1440, 2472]]), chaikin([[40, 3559], [0, 3560], [-300, 3570], [-620, 3560], [-900, 3604], [-1180, 3622], [-1440, 3648]]),
      chaikin([[333, 40], [334, 0], [350, -180], [318, -380], [262, -560], [250, -800]]), chaikin([[2379, 40], [2378, 0], [2360, -160], [2410, -360], [2470, -560], [2500, -800]])];
    const roadBox = roads.map((pts) => { let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity; for (const [px2, pz2] of pts) { a = Math.min(a, px2); b = Math.max(b, px2); c = Math.min(c, pz2); d = Math.max(d, pz2); } return [a - 12, b + 12, c - 12, d + 12]; });
    const roadAt = (wx, wz) => {
      for (let r = 0; r < roads.length; r++) {
        const pts = roads[r], bb = roadBox[r];
        if (wx < bb[0] || wx > bb[1] || wz < bb[2] || wz > bb[3]) continue;
        let run = 0;
        for (let k = 0; k + 1 < pts.length; k++) {
          const [ax, az] = pts[k], [bx, bz] = pts[k + 1], dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
          const t = Math.max(0, Math.min(1, ((wx - ax) * dx + (wz - az) * dz) / (len * len)));
          const d = Math.hypot(wx - ax - dx * t, wz - az - dz * t);
          if (d <= 11) return d <= 8 ? (d < 1 && (run + t * len) % 11 < 6 ? 2 : 1) : 3;
          run += len;
        }
      }
      return 0;
    };
    const WATER = { deep: [20, 42, 54], shallow: [38, 66, 74] };
    for (let pz = 0; pz < h; pz++) for (let px = 0; px < w; px++) {
      const wx = X0 + px * 2, wz = Z0 + pz * 2;
      const edgeIn = inWorld(wx, wz) ? Math.min(wx, wz, WZ - 1 - wz, WX - 1 - wx) : -1;
      if (edgeIn >= 0) continue;
      const o = (px + pz * w) * 4;
      let rgb, land = true;
      if (this.seaAt(wx, wz)) {
        const shore = hash(wx * .013 + 3, wz * .013) * .15;
        rgb = [WATER.deep[0] + (WATER.shallow[0] - WATER.deep[0]) * shore, WATER.deep[1] + (WATER.shallow[1] - WATER.deep[1]) * shore, WATER.deep[2] + (WATER.shallow[2] - WATER.deep[2]) * shore];
        land = false;
      } else {
        const crop = wz > WZ ? L.cropAt(wx, wz) : 0, t = at(E, wx, wz), road = roadAt(wx, wz);
        const steep = Math.abs(at(E, wx + 2, wz) - at(E, wx - 2, wz)) + Math.abs(at(E, wx, wz + 2) - at(E, wx, wz - 2));
        let park = false;
        const sandK = wx > 1800 ? (this.seaAt(wx + 14 + mapNoise(wz * .02, 3) * 12, wz) || this.seaAt(wx - 22, wz) ? 1 : this.seaAt(wx + 34, wz) ? .45 : 0) : 0;
        if (sandK) { const s0 = col(M.SAND), gr = this.groundColour(wx, wz, t, 0, col, hash), k = 1 - sandK; rgb = [s0[0] + (gr[0] - s0[0]) * k, s0[1] + (gr[1] - s0[1]) * k, s0[2] + (gr[2] - s0[2]) * k]; }
        else if (road === 1) rgb = col(M.ASPHALT);
        else if (road === 2) rgb = col(M.LINE_Y);
        else if (road === 3) rgb = col(hash(wx >> 1, wz >> 1) < .4 ? M.PATH : M.DIRT);
        else if (crop === -1) rgb = col(hash(wx >> 1, wz >> 1) < .4 ? M.PATH : M.DIRT);
        else if (crop > 0) {
          const dot = hash(wx >> 1, wz >> 1);
          rgb = col(crop === 1 ? (wx % 6 < 4 ? M.LEAF2 : M.SOIL) : crop === 2 ? (dot < .6 ? M.CORN : M.LEAF3) : crop === 3 ? (dot < .35 ? M.COTTON : M.LEAF3) : crop === 4 ? (dot < .5 ? M.PEANUT : M.SOIL) : crop === 5 ? (wx % 8 < 2 ? M.LEAF2 : M.SOIL) : crop === 6 ? M.GRASS_DRY : M.SOIL);
          rgb = [rgb[0] * .88, rgb[1] * .88, rgb[2] * .88];
        } else if ((t >= 12 && steep > 7) || t > 128 + mapNoise(wx * .02, wz * .02) * 30) { const r0 = col(M.SCHIST), gr = this.groundColour(wx, wz, t, 0, col, hash); rgb = [r0[0] * .62 + gr[0] * .3, r0[1] * .62 + gr[1] * .3, r0[2] * .62 + gr[2] * .3]; }
        else { rgb = this.groundColour(wx, wz, t, at(F, wx, wz), col, hash); park = true; }
        let shade = 1 + Math.max(-.6, Math.min(.5, ((at(E, wx + 4, wz) - at(E, wx - 4, wz)) + (at(E, wx, wz + 4) - at(E, wx, wz - 4))) * .07));
        const lift = park ? 0 : Math.max(0, Math.min(60, t)) * .2;
        rgb = [rgb[0] + lift, rgb[1] + lift * .9, rgb[2] + lift * .7];
        if (t > 3 && !road && (Math.floor(t / 16) !== Math.floor(at(E, wx + 2, wz) / 16) || Math.floor(t / 16) !== Math.floor(at(E, wx, wz + 2) / 16))) shade *= .87;
        rgb = [rgb[0] * shade, rgb[1] * shade, rgb[2] * shade];
      }
      const grain = land ? .94 + hash(wx, wz) * .12 : 1;
      img.data[o] = Math.min(255, rgb[0] * grain); img.data[o + 1] = Math.min(255, rgb[1] * grain); img.data[o + 2] = Math.min(255, rgb[2] * grain);
      img.data[o + 3] = edgeIn < 0 ? 255 : Math.round(255 * (1 - edgeIn / 28) ** 1.5);
    }
    x.putImageData(img, 0, 0);
    const P = (wx, wz) => [(wx - X0) / 2, (wz - Z0) / 2];
    // The river north, out of the top of the world.
    x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = 'rgb(29,54,64)'; x.lineWidth = 17;
    const rx = L.gx(1633);
    x.beginPath(); x.moveTo(...P(rx, 4)); x.bezierCurveTo(...P(rx + 7, -200), ...P(rx - 33, -420), ...P(rx - 8, -780)); x.stroke();
    // Trees exactly as the world sets them out: one to each six blocks where the wood wants one, and the second stand in Trinity.
    const dim = (id, k) => { const [r, g, b] = col(id); return `rgb(${r * k | 0},${g * k | 0},${b * k | 0})`; };
    const leafLv = [M.LEAF, M.LEAF2, M.LEAF].map((id, k) => [0, 1, 2, 3, 4].map((lv) => dim(id, (k === 2 ? .76 : .88) * (1 - lv * .06))));
    const tree = (tx, tz, a, f) => {
      if (inWorld(tx, tz) || this.seaAt(tx + 4, tz) || this.seaAt(tx - 4, tz)) return;
      if (wz0(tz) && L.cropAt(tx, tz)) return;
      const [qx, qz] = P(tx, tz);
      x.fillStyle = 'rgba(6,12,6,.3)';
      x.fillRect(Math.round(qx), Math.round(qz), 3, 3);
      x.fillStyle = leafLv[a % 3][Math.max(0, Math.min(4, Math.round(f * 5)))];
      x.fillRect(Math.round(qx) - 1, Math.round(qz) - 1, 3, 3);
    };
    const wz0 = (tz) => tz > WZ;
    for (let wz = Math.floor(Z0 / 6) * 6; wz < Z1; wz += 6) for (let wx = Math.floor(X0 / 6) * 6; wx < X1; wx += 6) {
      if (inWorld(wx, wz) && inWorld(wx + 4, wz + 4)) continue;
      const t = at(E, wx, wz), steep = Math.abs(at(E, wx + 2, wz) - at(E, wx - 2, wz)) + Math.abs(at(E, wx, wz + 2) - at(E, wx, wz - 2));
      if ((t >= 12 && steep > 7) || (!inWorld(wx, wz) && roadAt(wx, wz))) continue;
      const f = at(F, wx, wz), j = r2(wx, wz);
      if (j < L.forestAt(wx, wz) * .8) tree(wx + Math.floor(j * 40) % 4, wz + Math.floor(j * 70) % 4, Math.floor(j * 9999), f);
      const tk = L.trinityAt(wx, wz);
      if (tk > .2 && r2(wx + 3, wz + 3) < tk * .85) tree(wx + 3, wz + 3, Math.floor(r2(wz + 3, wx) * 9999), f);
    }
    return c;
  }

  // The country round the state, for the maps: the same land, the same woods, the same light, carried on past the edges at an eighth of
  // the detail, so that nothing ends in a line. The sea is wherever the coast says it is, and the two roads west run on to the horizon.
  makeMapSurround() {
    const L = this.layout, S = 4096, P = 16, n = (WX + S * 2) / P;
    const c = document.createElement('canvas');
    c.width = c.height = n; c.span = S;
    const x = c.getContext('2d'), img = x.createImageData(n, n);
    const col = (id) => [PALETTE[id * 4], PALETTE[id * 4 + 1], PALETTE[id * 4 + 2]];
    const hash = mapHash;
    const G4 = (n >> 1) + 2, E = new Float32Array(G4 * G4), F = new Float32Array(G4 * G4);
    for (let gz = 0; gz < G4; gz++) for (let gx = 0; gx < G4; gx++) {
      const wx = -S + gx * 32, wz = -S + gz * 32;
      E[gx + gz * G4] = L.elevAt(wx, wz);
      F[gx + gz * G4] = Math.min(1, L.forestAt(wx, wz) + L.trinityAt(wx, wz) * .3);
    }
    const at = (A, px, pz) => {
      const fx = px / 2, fz = pz / 2, ix = Math.min(G4 - 2, fx | 0), iz = Math.min(G4 - 2, fz | 0), ux = fx - ix, uz = fz - iz, k = ix + iz * G4;
      return (A[k] * (1 - ux) + A[k + 1] * ux) * (1 - uz) + (A[k + G4] * (1 - ux) + A[k + G4 + 1] * ux) * uz;
    };
    const grass = [col(M.GRASS_DRY), col(M.GRASS), col(M.GRASS2)], leaf = [col(M.LEAF), col(M.LEAF2), col(M.LEAF3)], sea = [20, 42, 54];
    for (let pz = 0; pz < n; pz++) for (let px = 0; px < n; px++) {
      const wx = -S + px * P, wz = -S + pz * P, o = (px + pz * n) * 4;
      let rgb;
      if (this.seaAt(wx, wz)) { const sh = hash(wx * .013 + 3, wz * .013) * .15; rgb = [20 + 18 * sh, 42 + 24 * sh, 54 + 20 * sh]; }
      else {
        const t = at(E, px, pz), f = at(F, px, pz);
        rgb = this.groundColour(wx, wz, t, f, col, hash);
        // Trees too small to draw at this scale: their canopy, as a darkening the denser the wood.
        const lf = leaf[(hash(px, pz) * 7 | 0) % 3], k = Math.min(.55, f * .6) * (.7 + hash(pz, px) * .6);
        rgb = [rgb[0] + (lf[0] * .8 - rgb[0]) * k, rgb[1] + (lf[1] * .8 - rgb[1]) * k, rgb[2] + (lf[2] * .8 - rgb[2]) * k];
        const sl = ((at(E, px + .5, pz) - at(E, px - .5, pz)) + (at(E, px, pz + .5) - at(E, px, pz - .5))) * .07;
        const sh = (1 + Math.max(-.6, Math.min(.5, sl))) * (Math.floor(t / 16) !== Math.floor(at(E, px + 1, pz) / 16) ? .87 : 1) * (.94 + hash(px * 3, pz) * .12);
        rgb = [rgb[0] * sh, rgb[1] * sh, rgb[2] * sh];
      }
      img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    x.strokeStyle = `rgb(${col(M.ASPHALT).map((v) => v | 0).join(',')})`;
    x.lineWidth = 2;
    for (const [z0, z1] of [[2470, 2560], [3646, 3700]]) { x.beginPath(); x.moveTo((S - 1420) / P, (z0 + S) / P); x.bezierCurveTo((S - 2200) / P, (z0 + 30 + S) / P, (S - 3200) / P, (z1 + S) / P, 0, (z1 + 60 + S) / P); x.stroke(); }
    return c;
  }

  setupAtmosphere() {
    // Long smoke columns: the city is still burning in places.
    const L = this.layout;
    this.plumes = [];
    for (const f of L.fireSpots) this.plumes.push({ x: f.cx, y: f.top + 1, z: f.cz, t: rand(), scale: .8 + rand() * .7 });
    // Burning wrecks are picked from the placed cars.
    const wrecks = [];
    const props = L.props;
    for (let k = 0; k < props.length; k += PROP_STRIDE) {
      // Centre of the burnt shell, and which way it lies: it burns from the hood, the trunk and the roof, not above it.
      if (props[k] === PROP.CAR && props[k + 4] === 6) wrecks.push(props[k + 3] === 0 ? [props[k + 1] + 2, props[k + 2] + 4.5, 0] : [props[k + 1] + 4.5, props[k + 2] + 2, 1]);
    }
    this.wrecks = wrecks;
    this.activeWrecks = [];
    this.wreckScan = 0;
  }

  setupCallbacks() {
    const H = this.horde, W = this.world;
    H.onHitPlayer = (i, x, z) => {
      // One of them is a nuisance. It is being surrounded that kills you: bites land faster, and harder, the more are on you.
      let round = 0;
      H.forRadius(this.player.x, this.player.z, 3.2, () => { round++; });
      const crowd = Math.min(round, 9);
      // The clock starts again at zero with every new game. The last bite from a game before must not count, or nothing could bite
      // you until the new clock caught up with it.
      const since = this.time - (this.lastBite ?? -1e9);
      if (since >= 0 && since < .8 - crowd * .05) return;
      this.lastBite = this.time;
      const base = 4.2 + rand() * 4.2;
      this.player.damage(base * H.settings.damage * (1 + crowd * .07), x, z, 'bite');
    };
    H.onHitHuman = (h) => this.npcs.bitten(h);
    H.onKilled = (i, x, y, z, headshot, byPlayer) => {
      if (byPlayer) this.jobs.onKill(x, z);
      this.addBlood(x, y, z, headshot ? .3 : .22, 3.4);
      this.campSim.noteKill(x, z, byPlayer, H.siege[i]);
      if (byPlayer) {
        const drop = rollZombieDrop(H.settings.loot);
        if (drop) this.addPickup(x, y + .4, z, drop);
      }
    };
    H.onGnaw = (x, y, z, id, force = 2) => {
      if (HP[id] === 255) return;
      const broke = W.hit(x, y, z, force);
      if (broke) this.campSim.noteBroken(x, y, z, broke);
      this.particles.debris(x, y, z, id, 2, 2);
      // A crowd tearing at a wall is a din, not a separate sound for every hand on it.
      if (rand() < .35 || broke) this.audio.simple('block', x, y, z);
      if (broke) H.nearDirty = true;
    };
    H.onGlass = (x, y, z) => this.breakGlass(x, y, z);
    H.onThud = (x, y, z, impact) => this.audio.bodyFall(x, y, z, impact);
    W.onVoxelChange = () => { H.nearDirty = true; };
    W.onCollapse = (list) => this.onCollapse(list);
    W.onRemoved = (x, y, z, id) => this.structureLost(x, y, z, id);
    this.particles.onImpact = (x, y, z, r, g, b, speed) => this.onDebrisImpact(x, y, z, r, g, b, speed);
  }

  setupInput() {
    const I = this.input;
    const canvas = this.renderer.canvas;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (!I.keys[e.code]) I.pressed[e.code] = true;
      I.keys[e.code] = true;
      if (e.code === 'F3') { e.preventDefault(); this.showFPS = !this.showFPS; }
      // F1, out in the corner where nothing else is: the whole HUD off for a clean view, and back. Not saved: a new session has it on.
      if (e.code === 'F1') { e.preventDefault(); if (this.state === 'play') document.getElementById('hud').classList.toggle('hud-off'); }
      // The dev tools stay hidden until someone types the word, in each game: a new or loaded game locks them again.
      if (this.state === 'play' && !this.devUnlocked && e.code.startsWith('Key')) {
        this.devTyped = ((this.devTyped || '') + e.code.slice(3)).slice(-5);
        if (this.devTyped === 'IDKFA') {
          this.devUnlocked = true;
          this.ui.radio(null, 'Somebody on this channel knows the old codes. F4 opens the dev tools.', 'Pirate');
        }
      }
      if (e.code === 'F4') { e.preventDefault(); if (this.state === 'play' && this.devUnlocked) this.toggleDev(); }
      if (this.state === 'play') this.onKey(e);
    });
    window.addEventListener('keyup', (e) => { I.keys[e.code] = false; });
    window.addEventListener('mousedown', (e) => {
      if (this.state === 'play' && this.locked) {
        if (this.wakeFx) { e.preventDefault(); return; }
        I.mouse[e.button] = true;
        I.mousePressed[e.button] = true;
        e.preventDefault();
      }
    });
    window.addEventListener('mouseup', (e) => { I.mouse[e.button] = false; });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { I.mouseDX += e.movementX; I.mouseDY += e.movementY; }
    });
    window.addEventListener('wheel', (e) => {
      if (this.state === 'play' && this.locked && !this.ui.modal) this.player.selectNext(Math.sign(e.deltaY));
    }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.state === 'play' && !this.ui.modal && this.player.alive && !this.devOpen) this.pause();
    });
    canvas.addEventListener('click', () => { if (this.state === 'play' && !this.ui.modal) this.lock(); });
    window.addEventListener('blur', () => { I.keys = {}; I.mouse = [false, false, false]; });
    window.addEventListener('beforeunload', () => { if (this.state === 'play') this.saveGame(); });
  }

  // --- Dev menu (F4) -----------------------------------------------------------------------------
  toggleDev(on = !this.devOpen) {
    this.devOpen = on;
    document.getElementById('devmenu').classList.toggle('on', on);
    if (on) document.exitPointerLock();
    else if (!this.ui.modal) this.lock();
  }

  devAction(what) {
    const P = this.player, w = this.weather, [kind, arg] = what.split(':');
    const note = (t) => { document.getElementById('dev-note').textContent = t; };
    if (kind === 'w' && arg === 'cycle') {
      // Let go of it: the weather picks its next spell the way it always does, and rolls into it in its own time.
      w.spell = w.nextSpell();
      const sp = { dry: [340, 740], light: [220, 540], pour: [200, 460] }[w.spell];
      w.timer = sp[0] + Math.random() * (sp[1] - sp[0]);
      note(`Weather is back on its own cycle: ${w.spell === 'dry' ? 'dry' : w.spell === 'light' ? 'light rain' : 'downpour'} next, coming in naturally.`);
    } else if (kind === 'w') {
      // Straight to it, not rolling in over a minute.
      w.cue(arg, 900);
      w.rain = arg === 'dry' ? 0 : arg === 'light' ? .3 : .9;
      if (w.rain > 0) w.wet = Math.max(w.wet, .7);
      note(arg === 'dry' ? 'Clear. Things stay wet for a while.' : arg === 'light' ? 'Light rain.' : 'Downpour.');
    } else if (kind === 't' || kind === 'day') {
      if (this.sleepFx || this.wakeFx) return;
      // The world gets the time it would have had: everywhere else carries on while the clock runs, the same as sleeping.
      const DAY = DAY_SECONDS, span = kind === 'day' ? DAY : ((+arg - this.tod + 1) % 1) * DAY;
      if (span < 1) return;
      const slept = this.campSim.pass(span, -1, false);
      this.tod += slept / DAY;
      while (this.tod >= 1) { this.tod -= 1; this.day++; this.horde.regrow(1); this.campSim.newDay(); }
      this.campSim.showSleepReports();
      note(`Skipped ${(span / DAY * 24).toFixed(1)} hours. Day ${this.day}.`);
    } else if (kind === 's') {
      P.scrip += +arg;
      note(`${P.scrip.toLocaleString('en-US')} spades.`);
    } else if (kind === 'c') {
      const ch = this.cheats || (this.cheats = {});
      ch[arg] = !ch[arg];
      document.getElementById(`dev-c-${arg}`).classList.toggle('on', ch[arg]);
      if (arg === 'spades' && ch.spades) P.scrip = Math.max(P.scrip, 999999);
      if (arg === 'ignore') this.horde.ignorePlayer = ch.ignore;
      note({ god: 'Nothing hurts you', ammo: 'Magazines never run dry', spades: 'Spades never run out', ignore: 'The dead pay you no attention' }[arg] + (ch[arg] ? ': on.' : ': off.'));
    } else if (kind === 'horde') {
      // A crowd that has your scent, coming in from out of sight on all sides but mostly from behind.
      const H = this.horde, W = this.world;
      let made = 0;
      for (let k = 0; k < 600 && made < 140; k++) {
        const a = P.yaw + Math.PI + (Math.random() - .5) * (Math.random() < .7 ? 2.2 : 6.28), r = 48 + Math.random() * 26;
        const x = Math.floor(P.x + Math.sin(a) * r), z = Math.floor(P.z - Math.cos(a) * r);
        if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2 || !W.walk[(x >> 1) + (z >> 1) * W.walkW] || H.inCamp(x, z, 4)) continue;
        const y = W.terrainTop(x, z);
        if (W.isLoaded(x, y, z) && (W.solid(x, y, z) || W.solid(x, y + 1, z))) continue;
        if (H.spawnOne(x + .5, y, z + .5, 1) >= 0) made++;
      }
      H.nearDirty = true;
      note(`${made} of them, coming for you.`);
    } else if (kind === 'fall') {
      this.skipToFall(note);
    } else if (kind === 'evac') {
      const sim = this.campSim;
      let best = null, bd = 1e9;
      for (const c of this.layout.camps) {
        const s = sim.state[c.id], d = Math.hypot(c.cx - P.x, c.cz - P.z);
        if (s.status === 'holding' && !s.evac && d < bd) { bd = d; best = c; }
      }
      if (best) { sim.evacuate(best, sim.state[best.id]); note(`${best.name} is evacuating.`); }
      else note('No settlement left to evacuate.');
    } else if (kind === 'fly') {
      P.fly = !P.fly;
      P.vx = P.vy = P.vz = 0;
      const b = document.getElementById('dev-fly');
      b.textContent = P.fly ? 'Fly: on' : 'Fly: off';
      b.classList.toggle('on', P.fly);
      note('Fly: WASD where you look, Space up, Ctrl down, Shift fast');
    }
  }

  lock() {
    // Browsers refuse this without a recent click; the HUD then asks for one.
    const p = this.renderer.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  onKey(e) {
    const ui = this.ui, P = this.player;
    if (this.sleepFx) return;
    // Nobody hurries this. The only key that does anything is the one that opens the pause menu.
    if (this.wakeFx && e.code !== 'Escape') return;
    if (ui.modal === 'dialog') {
      const slot = { ArrowUp: 0, ArrowLeft: 1, ArrowRight: 2, ArrowDown: 3 }[e.code];
      if (e.code.startsWith('Digit') || slot !== undefined) {
        const b = document.getElementById('dlg-opts').children[slot ?? +e.code.slice(5) - 1];
        if (b) b.click();
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') { ui.finishLine(); return; }
    }
    // Dead: the only way on is one of the buttons on that screen. Escape closing it left you dead with nothing to press.
    if (ui.modal === 'death') return;
    // Done at the counter: back to the person, in case there is anything else.
    if (e.code === 'Escape' && ui.modal === 'trade' && ui.dlgNpc && !ui.dlgNpc.dead) { ui.backToDialog(); return; }
    if (e.code === 'Escape' && ui.modal && ui.modal !== 'pause') { this.resume(); return; }
    if (e.code === 'Tab') {
      if (ui.modal === 'inventory') { this.resume(); return; }
      if (!ui.modal && P.alive) { this.openModal(() => ui.openInventory()); }
      return;
    }
    if (ui.modal === 'map' && (e.code === 'KeyW' || e.code === 'ArrowUp')) { ui.panMap(-1); return; }
    if (ui.modal === 'map' && (e.code === 'KeyS' || e.code === 'ArrowDown')) { ui.panMap(1); return; }
    if (e.code === 'KeyM') {
      if (ui.modal === 'map') { this.resume(); return; }
      if (!ui.modal && P.alive) { this.openModal(() => ui.openMap()); }
      return;
    }
    if (ui.modal || !P.alive) return;
    if (e.code === 'KeyE') this.interact();
    else if (e.code === 'KeyF') P.toggleFlashlight();
    else if (e.code === 'KeyH') P.quickHeal();
    else if (e.code === 'KeyB') P.selectBlocks();
    else if (e.code === 'KeyG') { if (P.count('grenade')) P.selectWeapon('grenade'); else ui.toast('No grenades'); }
    else if (e.code.startsWith('Digit')) {
      const n = +e.code.slice(5);
      if (n >= 1) P.selectIndex(n - 1);
    }
  }

  // A modal opens over the game: the sim stops and the view racks out of focus.
  openModal(fn) {
    this.modalOpenWhilePlaying = true;
    document.exitPointerLock();
    fn();
  }

  pause() {
    // The wake-up plays through whatever happens to the mouse or the window. The pause menu would only open behind it and stop it dead.
    if (this.wakeFx) return;
    this.ui.open('pause', false);
    this.saveGame();
  }

  resume() {
    // Nothing to go back to while you are dead: once the death screen is up, it stays up.
    if (this.state === 'play' && !this.player.alive) { if (this.deathShown) this.ui.open('death', false); return; }
    this.ui.closeAll();
    this.ui.showHUD(true);
    this.input.mouse = [false, false, false];
    this.input.keys = {};
    this.lock();
  }

  interact() {
    const P = this.player, it = P.interact;
    if (!it) return;
    if (it.kind === 'npc') {
      if (it.npc.state === 7) { this.ui.caption(it.npc.name, 'Mmph. Let me sleep.'); return; }
      // Nobody stops to chat with the dead coming at them, or while they are running from them.
      const m = it.npc;
      // The people you come to for business (the clerk, the traders, the doctor, whoever runs the place) keep their post through a fight
      // at the wall and will still deal with you: only the dead right on top of them, or backing away from them, stops that.
      const service = m.kind === 'clerk' || m.kind === 'vendor' || m.kind === 'boss' || m.kind === 'named' || m.doctor;
      let close = 0;
      if (service) this.horde.forRadius(m.x, m.z, 7, () => { close++; });
      const busy = service ? m.flee || m.giving || close >= 2 : m.flee || m.threat || m.alarmed || m.fighting || m.aim > .2 || m.state === 3;
      if (m.kind !== 'follower' && busy) {
        if (this.time - (m.busySaid ?? -99) > 2.5) { m.busySaid = this.time; this.ui.floatSay(m, m.flee ? pickBusy(['Not now! Run!', 'Move! Move!', 'Later! Go!']) : pickBusy(['Not now!', 'Kind of busy here!', 'Later! Shoot something!', 'Can it wait?']), 1.6); }
        return;
      }
      this.openModal(() => this.ui.openDialog(it.npc));
    } else if (it.kind === 'dog') {
      this.dogs.pet(it.dog);
    } else if (it.kind === 'bed') this.sleepHere();
    else if (it.kind === 'seat') {
      P.sitting = true;
      P.vx = P.vz = 0;
      this.ui.toast('You sit down for a while. Move to get up.');
    }
    else if (it.kind === 'loot') this.searchContainer(it.hit);
    else if (it.kind === 'cache') { this.jobs.collect(it.obj.job); this.audio.simple('crate'); }
    else if (it.kind === 'fire') {
      if (it.wet) { this.ui.toast('Too wet to catch. It will have to wait for the rain to ease.', 'bad'); return; }
      it.fire.out = false;
      it.fire.soak = 0;
      this.fireRelit(it.camp, it.fire, true);
      this.updateFires(1);
      this.refreshCityLights();
    }
  }

  // The whole pane goes at once, along with whoever came through it.
  // A pane takes the hit where it lands: that block is gone, and the glass round it crazes. Hit glass that has crazed already and the
  // whole pane lets go at once.
  breakGlass(x, y, z) {
    const W = this.world, id = W.get(x, y, z);
    if (!isGlass(id)) return;
    const fx = this.particles;
    // Glass that only cracked a moment ago, from this same shot (the next pellet, or the round going on through the hole it made),
    // gives up just the block that was hit. It takes a second shot to bring the pane down.
    const key = x + z * WX + y * WX * WZ, cracks = this.freshCracks || (this.freshCracks = new Map());
    if ((FLAGS[id] & F_CRACK) && this.time - (cracks.get(key) ?? -9) < .35) {
      if (W.set(x, y, z, 0)) fx.glass(x, y, z, 5, 3);
      this.audio.simple('glass', x, y, z);
      this.horde.nearDirty = true;
      return;
    }
    if (FLAGS[id] & F_CRACK) {
      const stack = [x, y, z], seen = new Set();
      let n = 0;
      while (stack.length && n < 400) {
        const c = stack.pop(), b = stack.pop(), a = stack.pop();
        const k = a + c * WX + b * WX * WZ;
        if (seen.has(k)) continue;
        seen.add(k);
        const g = W.get(a, b, c);
        if (!isGlass(g)) continue;
        if (W.set(a, b, c, 0)) { n++; if (n < 90) fx.glass(a, b, c, n < 30 ? 3 : 1, 3); }
        stack.push(a + 1, b, c, a - 1, b, c, a, b + 1, c, a, b - 1, c, a, b, c + 1, a, b, c - 1);
      }
    } else {
      if (W.set(x, y, z, 0)) fx.glass(x, y, z, 9, 3.2);
      if (cracks.size > 400) cracks.clear();
      // Remember where it went in, so the cracks run out from there.
      const r = this.renderer, pts = r.crackPts || (r.crackPts = new Float32Array(64).fill(-1)), k = (this.crackN = ((this.crackN || 0) + 1) % 16) * 4;
      pts[k] = x + .5; pts[k + 1] = y + .5; pts[k + 2] = z + .5; pts[k + 3] = Math.random() * 40;
      // The glass in reach of the hole, two blocks each way, goes to cracks.
      for (let b = y - 2; b <= y + 2; b++) for (let c = z - 2; c <= z + 2; c++) for (let a = x - 2; a <= x + 2; a++) {
        const g = W.get(a, b, c);
        if (!g || !isGlass(g) || (FLAGS[g] & F_CRACK) || !CRACKED[g]) continue;
        if (Math.abs(a - x) + Math.abs(b - y) + Math.abs(c - z) > 3) continue;
        if (W.set(a, b, c, CRACKED[g])) cracks.set(a + c * WX + b * WX * WZ, this.time);
      }
    }
    this.audio.simple('glass', x, y, z);
    this.horde.nearDirty = true;
  }

  // Dev: on to the morning of the day the camp you are in (or your home) is due to fall. Nothing is set up for it: the world runs forward
  // the same way it does while you sleep, half a day at a time, so whatever would have happened has happened: operations posted, fought
  // and over, or one still running into that evening if it would have been; other camps worn down or gone; people on the roads. The fall
  // date is looked at again after each step, since the director moves it (a run of operations can push the last evening back).
  skipToFall(note) {
    if (this.sleepFx || this.wakeFx || this.state !== 'play') return;
    const P = this.player, sim = this.campSim, D = this.director;
    const here = this.horde.inCamp(P.x, P.z, 0);
    let c = here || (P.home >= 0 ? this.layout.camps[P.home] : null);
    if (c && sim.state[c.id].status !== 'holding') c = null;
    if (!c) {
      let bd = 1e9;
      for (const k of this.layout.camps) { const d = Math.hypot(k.cx - P.x, k.cz - P.z); if (sim.state[k.id].status === 'holding' && d < bd) { bd = d; c = k; } }
    }
    if (!c) { note('No settlement left standing.'); return; }
    const morningOf = () => Math.floor(D.lastEvening(D.plans[c.id])) + .3;
    if (sim.now() >= morningOf() - .01) { note(`${c.name} is already on its last day.`); return; }
    // Eyes shut, as for a bed: the time goes by in the dark.
    this.sleepFx = true;
    this.ui.sleepVeil(true);
    this.audio.duck(true);
    setTimeout(() => {
      const DAY = DAY_SECONDS, start = this.day, kept = [];
      for (let guard = 0; guard < 400; guard++) {
        const now = sim.now(), target = morningOf();
        if (now >= target - 1e-4 || sim.state[c.id].status !== 'holding') break;
        // Each step starts its own list of what happened; the camps that fell and the operations that ended are kept from all of them.
        kept.push(...(sim.passReports || []).filter((r) => r.fell || r.opEnd));
        const slept = sim.pass(Math.min(.5, target - now) * DAY, -1, false);
        this.tod += slept / DAY;
        while (this.tod >= 1) { this.tod -= 1; this.day++; this.horde.regrow(1); sim.newDay(); }
        if (slept <= 0) break;
      }
      sim.passReports = kept.concat(sim.passReports || []);
      setTimeout(() => {
        this.wake();
        const s = sim.state[c.id];
        const op = s.op ? `Operation ${s.op.name} is on, ${sim.opDayOf(s.op).text}.` : s.opNext ? `Operation ${s.opNext.name} is posted.` : 'No operation is on.';
        const msg = s.status !== 'holding' ? `${c.name} did not make it that far.` : `Day ${this.day}. ${c.name} is due to fall this evening. ${op}`;
        this.ui.banner(s.status !== 'holding' ? `${c.name} has fallen` : `Day ${this.day}`, msg);
        note(`Skipped ${this.day - start} days. ${msg}`);
        sim.showSleepReports();
        this.saveGame();
      }, 1100);
    }, 1100);
  }

  // Bedrolls are for sleeping: through the day until dark, or through the night until morning.
  sleepingUntilNight() { return this.tod >= .25 && this.tod < .74; }

  // Why you can't lie down here right now, if you can't. A fight at the wall is what the wall's guards are for:
  // only trouble that has actually reached you, or a wall that has properly failed, keeps you up.
  noSleep() {
    const P = this.player, c = this.horde.inCamp(P.x, P.z);
    if (!c) return null;
    const s = this.campSim.state[c.id];
    if (s.status !== 'holding') return 'Not here. Not with the place like this.';
    // In survival it is how rested you are that decides it. Otherwise, a couple of hours since you last woke.
    // Sleeping pills put you under whether you are tired or not.
    if (P.sedated) { /* tired enough */ }
    else if (P.loadout === 'survival') { if (P.rest > 80) return "You aren't tired yet."; }
    else if (this.lastWake !== undefined && this.campSim.now() - this.lastWake < 2 / 24) {
      const mins = Math.ceil((2 / 24 - (this.campSim.now() - this.lastWake)) * 24 * 60);
      return `You aren't tired. Try again in ${mins >= 60 ? `${Math.ceil(mins / 60)}h` : `${mins} min`}.`;
    }
    if (this.npcs.angry && this.npcs.angry[c.id]) return 'Not here. They would shoot you in your sleep.';
    let close = 0;
    this.horde.forRadius(P.x, P.z, 20, () => { close++; });
    if (close) return 'Not with them this close.';
    // On the pills you can lie down through the siren. Just not through the end of the world.
    if (this.player.sedated) return s.evac || s.breaches.length >= 3 || s.inside >= 150 ? 'Not even the pills would get you through this.' : null;
    if (s.inside >= 25 || (s.breaches.length && s.inside >= 8)) return 'Not with them inside the wall.';
    if (s.raid) return 'Not with raiders inside the wall.';
    if (s.breaches.length || s.evac) return 'Not with the siren going.';
    return null;
  }

  // Whatever was going to happen elsewhere happens while you are out. If it happens here, the siren wakes you.
  sleepHere() {
    const P = this.player, c = this.horde.inCamp(P.x, P.z);
    const no = this.noSleep();
    if (no) { this.ui.toast(no, 'bad'); return; }
    if (this.sleepFx) return;
    // Eyes close, the sound goes, and whatever happens next happens in the dark.
    this.sleepFx = true;
    this.ui.sleepVeil(true);
    this.audio.duck(true);
    setTimeout(() => this.drift(c), 1100);
  }

  drift(c) {
    const P = this.player;
    const cancelled = this.state !== 'play' || !P.alive ? '' : this.noSleep();
    if (this.state !== 'play' || !P.alive || cancelled) {
      if (cancelled) this.ui.toast(cancelled, 'bad');
      this.wake();
      return;
    }
    const toNight = this.sleepingUntilNight(), target = toNight ? .8 : .27;
    const span = ((target - this.tod + 1) % 1) * DAY_SECONDS;
    const deep = P.sedated;
    P.sedated = false;
    const slept = this.campSim.pass(span, c ? c.id : -1, deep);
    const woken = !!this.campSim.wakeReason;
    const share = slept / Math.max(1, span);
    this.tod += slept / DAY_SECONDS;
    if (this.tod >= 1) { this.tod -= 1; this.day++; this.horde.regrow(1); this.campSim.newDay(); }
    this.lastWake = this.campSim.now();
    P.stamina = 100;
    P.infection = Math.max(0, P.infection - 15 * share);
    if (P.loadout === 'survival') {
      // A night's sleep helps, but it won't close a wound by itself.
      P.health = Math.min(100, P.health + 18 * share);
      P.hunger = Math.max(0, P.hunger - slept * 100 / 4500);
      // A full night puts you right; cut short, you get back what you slept.
      P.rest = Math.min(100, P.rest + 100 * share);
    } else P.health = Math.min(100, P.health + 100 * share);
    const reason = this.campSim.wakeReason, raid = reason === 'raid', extreme = reason === 'extreme';
    // A moment in the dark before you open your eyes. Rudely short, if something woke you.
    setTimeout(() => {
      this.wake();
      if (extreme) this.ui.banner('Even the pills could not keep you under', 'The wall is failing. Get up, now.');
      else if (woken) this.ui.banner(raid ? 'Gunfire woke you' : 'The siren woke you', raid ? 'Raiders at the wall. Get up.' : 'The wall is breached. Get up.');
      else this.ui.banner(toNight ? 'Nightfall' : 'Morning', deep ? 'You slept like the dead. Whatever happened, you missed it.' : toNight ? 'You slept through the day. It is dark out now.' : 'You slept. Everyone is still here.');
      this.campSim.showSleepReports();
      this.saveGame();
    }, woken ? 250 : 1100);
  }

  wake() {
    this.sleepFx = false;
    this.ui.sleepVeil(false);
    this.audio.duck(false);
  }

  searchContainer(hit) {
    const P = this.player;
    const loot = rollLoot(hit.id, this.horde.settings.loot);
    this.world.set(hit.x, hit.y, hit.z, M.CRATE_OPEN);
    this.audio.simple('crate');
    const parts = [];
    // One line in the corner for each thing found, the way a drop off the street is.
    if (loot.scrip) { P.scrip += loot.scrip; parts.push(1); this.ui.toast(`+${loot.scrip} spades`); }
    for (const { id, count } of loot.items) { P.gain(id, count); parts.push(1); }
    if (!parts.length) this.ui.toast('Empty');
    if (P.carryWeight() > P.carryCap()) this.ui.toast('You are overloaded', 'bad');
  }

  // Every lamp and fire on the island, minus any camp that has gone dark.
  refreshCityLights() {
    const lights = [];
    const sim = this.campSim;
    for (const c of this.layout.camps) {
      const dead = sim && sim.state[c.id].status === 'overrun';
      // A fallen camp keeps a few fires burning. Nothing else.
      if (dead) { for (const f of c.fires) if (!f.out) lights.push({ x: f.x, z: f.z, r: 22, k: 1, i: .8 }); continue; }
      const out = c.fires.filter((f) => f.out), gone = this.lightsGone;
      const drowned = (l) => (gone && gone.size && gone.has(`${Math.round(l.x * 2)},${Math.round(l.z * 2)}`)) || (l.k === 1 && out.some((f) => Math.hypot(l.x - f.x, l.z - f.z) < 7));
      for (const l of c.lights) if (!drowned(l)) lights.push(l);
      for (const l of c.glowLights || (c.glowLights = glowLights(c, this.layout.ground))) if (!drowned(l)) lights.push(l);
    }
    for (const s of this.layout.structs) {
      if (s.type === 'statue') lights.push({ x: s.x + 5, z: s.z, r: 30, k: 1 });
    }
    // Buildings that have been burning for weeks: the only light for blocks around.
    for (const f of this.layout.fireSpots) lights.push({ x: f.x, z: f.z, r: 44, k: 3, i: .62 });
    this.renderer.paintCityLights(lights);
  }

  // Tearing the city apart is how you pay for building it back up.
  salvage(id, n) {
    const item = SALVAGE.get(id);
    if (!item) return;
    const got = Math.floor(n * 1.2 + rand());
    if (!got) return;
    this.salvageN = (this.salvageN || 0) + got;
    this.player.add(item, got);
    this.salvageItem = item;
    if (this.time - (this.salvageT || -9) > 4) {
      this.salvageT = this.time;
      setTimeout(() => {
        if (this.salvageN) this.ui.toast(`+${this.salvageN} ${ITEMS[this.salvageItem].name}`);
        this.salvageN = 0;
      }, 2500);
    }
  }

  addPickup(x, y, z, data) {
    if (this.pickups.length > 240) this.pickups.shift();
    this.pickups.push({ x, y, z, t: 0, ...data });
  }

  // --- Destruction ----------------------------------------------------------------------------------
  // `hostile` means someone else threw it: no salvage, no kills on your tally, and nobody blames you.
  explode(x, y, z, radius, strength, dmg, hostile = false, loud = false) {
    const P = this.player, H = this.horde, W = this.world;
    const removed = W.explode(x, y, z, radius, strength);
    if (!hostile && Math.hypot(x - P.x, z - P.z) < 60) for (let k = 0; k < removed.length; k += 4 * 3) this.salvage(removed[k + 3], 1);
    if (!hostile && removed.length) this.npcs.wallDamaged(x, z, 3);
    if (!hostile) for (let k = 0; k < removed.length; k += 4) this.campSim.playerHole(removed[k], removed[k + 1], removed[k + 2], removed[k + 3]);
    this.particles.explosion(x, y, z, radius * .75);
    // What it set alight: a few small fires scattered about where it went off, burning down over half a minute or so.
    const F = this.rubbleFires || (this.rubbleFires = []);
    const big = radius >= 6;
    const lit = big ? 3 + (rand() < .6 ? 1 : 0) + (rand() < .3 ? 1 : 0) : 1 + (rand() < .4 ? 1 : 0);
    for (let k = 0; k < lit; k++) {
      const a = rand() * 6.283, r = rand() * radius * .8;
      F.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, top: y + 2, t: 0, delay: .1 + rand() * .8, life: big ? 35 + rand() * 40 : 12 + rand() * 20, size: .45 + rand() * .45 * Math.min(1.4, radius / 5) });
    }
    if (F.length > 32) F.splice(0, F.length - 32);
    for (let k = 0; k < removed.length; k += 4 * Math.max(1, Math.floor(removed.length / 4 / 160))) {
      const id = removed[k + 3];
      this.particles.debris(removed[k], removed[k + 1], removed[k + 2], id, 1, radius * 2.8);
    }
    P.voxelsBroken += removed.length / 4;
    this.audio.explosion(x, y, z, radius / 5, loud ? 320 : 90);
    this.tempLights.push({ x, y: y + 1, z, r: radius * 8, cr: 22, cg: 12, cb: 4, t: .55, max: .55 });
    const distToP = Math.hypot(P.x - x, P.y + 1.2 - y, P.z - z);
    this.explFlash = Math.max(this.explFlash, Math.min(1, 25 / (distToP * distToP + 5)));
    P.shake = Math.min(1.4, P.shake + Math.min(1, radius * 7 / (distToP + 2)));
    if (P.alive && distToP < radius * 2.1 && W.los(x, y, z, P.x, P.y + 1.2, P.z)) {
      P.damage(dmg * .24 * (1 - distToP / (radius * 2.1)), x, z, 'blast');
    }
    const R = radius * 2.2;
    let killed = 0;
    H.forRadius(x, z, R, (i) => {
      const dx = H.px[i] - x, dy = H.py[i] + 1.3 - y, dz = H.pz[i] - z;
      const d = Math.hypot(dx, dy, dz);
      if (d > R) return;
      const k = 1 - d / R;
      // Thrown, dead or alive: hardest near the middle of it.
      const power = (4 + radius * 2.2) * k;
      if (k > .1) H.prepareThrow(i, x, z, power);
      const died = H.damage(i, dmg * k * k + 25, k > .55, x, y, z, !hostile);
      H.finishThrow(i);
      if (died) {
        killed++;
        if (killed < 40) this.particles.gore(H.px[i], H.py[i] + 1.3, H.pz[i], 6);
      }
    });
    if (!hostile) P.kills += killed;
    for (const n of this.npcs.list) {
      const d = Math.hypot(n.x - x, n.y + 1.3 - y, n.z - z);
      if (d >= R) continue;
      if (hostile) this.npcs.hurt(n, dmg * (1 - d / R) * .6);
      else this.npcs.playerHit(n, dmg * (1 - d / R) * .6);
      // Knocked flat and thrown back by it, if they are still alive to get up.
      const kk = 1 - d / R, dd = Math.hypot(n.x - x, n.z - z) || .001;
      if (!n.dead && kk > .15) n.knock = { vx: (n.x - x) / dd * (3 + radius * 1.6) * kk, vz: (n.z - z) / dd * (3 + radius * 1.6) * kk, vy: (3 + radius * 1.2) * kk, t: 0 };
    }
    H.noise(x, z, 120, 1);
    H.nearDirty = true;
  }

  onVoxelBroken(x, y, z, id) {
    this.npcs.wallDamaged(x, z);
    this.campSim.playerHole(x, y, z, id);
    this.player.voxelsBroken++;
    this.particles.debris(x, y, z, id, 7, 3);
    this.particles.dust(x + .5, y + .5, z + .5, 2, .8);
    this.horde.nearDirty = true;
  }

  onCollapse(list) {
    const count = list.length / 4;
    if (!count) return;
    if (this.campSim) this.campSim.noteCollapse(list);
    this.afterCollapse(list);
    let sx = 0, sy = 0, sz = 0;
    const step = Math.max(1, Math.floor(count / 5500));
    for (let k = 0; k < list.length; k += 4) {
      sx += list[k]; sy += list[k + 1]; sz += list[k + 2];
      if ((k / 4) % step === 0) this.particles.falling(list[k], list[k + 1], list[k + 2], list[k + 3], rand() * .4);
    }
    sx /= count; sy /= count; sz /= count;
    this.player.voxelsBroken += count;
    // What it was made of decides what it leaves: a tree is leaves and wood, and comes down as a log in its own litter, with no dust to
    // speak of; anything built throws up dust in proportion to how much of it there was, and the scatter is its own stone or brick.
    let organic = 0;
    for (let k = 3; k < list.length; k += 4) if ((FLAGS[list[k]] & F_LEAF) || list[k] === M.TRUNK) organic++;
    const built = count - organic;
    this.collapseOrganic = organic > built;
    this.rubbleMat = built > 8 ? this.heapMats(list)[0] || M.RUBBLE : 0;
    // The heap is laid down where it fell; what bounces off it is only the odd bit of scatter.
    if (this.heapFor) this.buildingHeap(this.heapFor, list); else if (this.collapseOrganic) this.treeFall(list); else this.collapseHeap(list);
    this.rubbleBudget = built > 8 ? Math.min(140, 10 + built * .03) : 0;
    if (count > 8) {
      this.audio.collapse(sx, sy, sz, Math.min(1, count / 1500));
      this.horde.noise(sx, sz, Math.min(130, 30 + count * .2), 1);
      const dist = Math.hypot(this.player.x - sx, this.player.z - sz);
      this.player.shake = Math.min(1.4, this.player.shake + Math.min(1, count / 800) * 60 / (dist + 20));
    }
    if (built > 30) this.collapseDust(list, built);
  }

  // A collapse throws up a cloud: a wall of dust rolling out over the ground from where it came down, and then a haze that hangs over
  // the wreck for a while after. A whole building smokes for a minute and a half; anything smaller for half a minute.
  collapseDust(list, count) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9, y0 = 1e9;
    for (let k = 0; k < list.length; k += 4) {
      const x = list[k], y = list[k + 1], z = list[k + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y;
    }
    const W = this.world, fx = this.particles, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let ground = y0;
    while (ground > 1 && !W.get(Math.round(cx), ground - 1, Math.round(cz))) ground--;
    // The cloud is the size of what came down: a garden wall puffs, a tower block rolls out over the street.
    const big = !!this.heapFor, span = Math.max(4, Math.max(x1 - x0, z1 - z0) + 1), k = Math.min(1, Math.sqrt(count / 2500) * .7 + span / 120);
    const burst = Math.min(220, 3 + count * .022), size = 1.6 + k * (big ? 7 : 4), push = 1 + k * (big ? 7 : 4);
    if (Math.hypot(cx - this.player.x, cz - this.player.z) < 320) {
      for (let i = 0; i < burst; i++) {
        const x = x0 + rand() * (x1 - x0 + 1), z = z0 + rand() * (z1 - z0 + 1), dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
        fx.dustCloud(x, ground + .5 + rand() * (1 + k * 2), z, size * (.6 + rand() * .7), push * (.6 + rand() * .7), dx / l, dz / l);
      }
    }
    (this.dustSites || (this.dustSites = [])).push({ x0: x0 - 2, x1: x1 + 2, z0: z0 - 2, z1: z1 + 2, y: ground, t: 0, life: big ? 100 : 8 + Math.min(30, count * .02), rate: Math.min(13, .2 + count * .003), big });
    if (this.dustSites.length > 12) this.dustSites.shift();
    // Wiring, gas, a stove: a building coming down sometimes starts something. It does not last; there is not much left to burn.
    if ((big ? rand() < .45 : count > 200 && rand() < .12)) {
      const n = big ? 1 + Math.floor(rand() * 3) : 1;
      for (let k = 0; k < n; k++) (this.rubbleFires || (this.rubbleFires = [])).push({ x: x0 + 2 + rand() * Math.max(1, x1 - x0 - 4), z: z0 + 2 + rand() * Math.max(1, z1 - z0 - 4), t: 0, delay: 2 + rand() * 6, life: 40 + rand() * 60, size: .8 + rand() * .8 });
      if (this.rubbleFires.length > 32) this.rubbleFires.splice(0, this.rubbleFires.length - 32);
    }
  }

  // The small fires a collapse leaves: on top of the pile, a while to catch, a minute or so of burning, and out sooner in rain.
  updateRubbleFires(dt) {
    const F = this.rubbleFires;
    if (!F || !F.length) return;
    const fx = this.particles, W = this.world, P = this.player, wet = this.weather.rain;
    for (let i = F.length - 1; i >= 0; i--) {
      const f = F[i];
      f.t += dt * (1 + wet * 3);
      if (f.t > f.delay + f.life) { F.splice(i, 1); continue; }
      if (f.t < f.delay || Math.hypot(f.x - P.x, f.z - P.z) > 220) continue;
      if (f.y === undefined) { let y = Math.floor(f.top ?? STREET_Y + 20); while (y > 1 && !W.get(Math.floor(f.x), y - 1, Math.floor(f.z))) y--; f.y = y; }
      const k = Math.min(1, (f.t - f.delay) / 4) * Math.min(1, (f.delay + f.life - f.t) / 10), s = f.size * (.5 + .5 * k);
      for (let q = this.emitN(f, 'fireAcc', 25 * (k + .1), dt); q > 0; q--) fx.fire(f.x + (rand() - .5) * s, f.y, f.z + (rand() - .5) * s, 1.3 * s);
      for (let q = this.emitN(f, 'smokeAcc', 6, dt); q > 0; q--) fx.smoke(f.x + (rand() - .5) * s, f.y + .4, f.z + (rand() - .5) * s, 1.1 * s, .8 * k, .08, .3 * (.4 + k * .6));
      const fl = .8 + rand() * .3;
      this.queueLight(f.x, f.y + 1, f.z, 16, 4 * k * fl, 1.6 * k * fl, .4 * k);
    }
  }

  updateDustSites(dt) {
    const S = this.dustSites;
    if (!S || !S.length) return;
    const fx = this.particles, P = this.player;
    for (let i = S.length - 1; i >= 0; i--) {
      const d = S[i];
      d.t += dt;
      if (d.t > d.life) { S.splice(i, 1); continue; }
      const cx = (d.x0 + d.x1) / 2, cz = (d.z0 + d.z1) / 2;
      if (Math.hypot(cx - P.x, cz - P.z) > 300) continue;
      const k = 1 - d.t / d.life;
      let n = d.rate * k * k * dt;
      while (n > 0) {
        if (rand() < n) {
          const x = d.x0 + rand() * (d.x1 - d.x0), z = d.z0 + rand() * (d.z1 - d.z0);
          if (rand() < .65) fx.dustCloud(x, d.y + 1 + rand() * 3, z, 4 + rand() * 4, .4, 0, 0, .38);
          else fx.smoke(x, d.y + 2 + rand() * (d.big ? 8 : 3), z, d.big ? 2.4 : 1.4, 0, .3, .16, .45);
        }
        n -= 1;
      }
    }
  }

  // Whatever hung off what came down, or sat on top of it, comes down too: a lamp on its own in the air, a bit of rubble on nothing.
  // Then, once things have settled, the light those lamps threw goes out with them.
  afterCollapse(list) {
    const W = this.world;
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    const cols = new Set();
    for (let k = 0; k < list.length; k += 4) {
      const x = list[k], y = list[k + 1], z = list[k + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
      cols.add(x + z * WX);
    }
    x0 -= 2; z0 -= 2; x1 += 2; z1 += 2; y0 = Math.max(1, y0 - 2); y1 += 2;
    if ((x1 - x0 + 1) * (z1 - z0 + 1) * (y1 - y0 + 1) <= 600000) {
      for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const id = W.get(x, y, z);
        if (!id || !((FLAGS[id] & F_EMISSIVE) || id === M.RUBBLE)) continue;
        let held = 0;
        if (W.get(x, y - 1, z)) held++; if (W.get(x, y + 1, z)) held++; if (W.get(x + 1, y, z)) held++;
        if (W.get(x - 1, y, z)) held++; if (W.get(x, y, z + 1)) held++; if (W.get(x, y, z - 1)) held++;
        if (held <= 1) W.floatQueue.push(x, y, z, 1);
      }
    }
    (this.lightChecks || (this.lightChecks = [])).push({ t: 1.5, cols });
    // Once the dust settles, a look round the whole area for anything left hanging: an awning that hung out in front of a wall that
    // is gone, a sign, a lone block. Things like that never touched what fell, so nothing else would ever check them.
    (this.floatSweeps || (this.floatSweeps = [])).push({ t: 4, x0: x0 - 2, x1: x1 + 2, z0: z0 - 2, z1: z1 + 2, y0: Math.max(1, Math.min(y0, STREET_Y - 1)), y1: y1 + 2 });
  }

  // Every piece of solid in the box, and whether it reaches the ground or out of the box (to something standing beyond it). Any
  // piece that does neither is in the air: one block of it is handed to the world's own check, which brings the whole piece down.
  sweepFloating(b) {
    const W = this.world, nx = b.x1 - b.x0 + 1, ny = b.y1 - b.y0 + 1, nz = b.z1 - b.z0 + 1, N = nx * ny * nz;
    if (N > 900000 || N <= 0) return;
    const seen = new Uint8Array(N), stack = new Int32Array(N), piece = [];
    const L = this.layout, hurt = this.lotHurt;
    // Still standing: a building whose lot has not come down. What hangs a block or two off one of those (an awning) is held by it.
    const standing = (x, z) => { const id = L.lot[z * WX + x]; if (!id) return false; const e = hurt && hurt.get(id); return !(e && e.down) && !L.buildings[id - 1].gone; };
    const at = (i) => [b.x0 + (i % nx), b.y0 + ((i / (nx * nz)) | 0), b.z0 + (((i / nx) | 0) % nz)];
    let dropped = 0;
    for (let y = 0; y < ny; y++) for (let z = 0; z < nz; z++) for (let x = 0; x < nx; x++) {
      const i0 = x + z * nx + y * nx * nz;
      if (seen[i0] || !W.get(b.x0 + x, b.y0 + y, b.z0 + z)) continue;
      let sp = 0, held = false;
      stack[sp++] = i0; seen[i0] = 1; piece.length = 0;
      while (sp) {
        const i = stack[--sp], ix = i % nx, iz = ((i / nx) | 0) % nz, iy = (i / (nx * nz)) | 0;
        if (piece.length < 4000) piece.push(i);
        // On the ground, or running out of the box to something beyond it. In a settlement, where everything leans on everything, only
        // the ground counts for what was standing in the box (fallen: the structure that came down, its rect in b.fell). Anything running
        // out of the box is held by whatever it runs on to: the rest of the church a stray round took one block out of, the next building
        // along from a shack that came down.
        const edge = ix === 0 || iz === 0 || ix === nx - 1 || iz === nz - 1 || iy === ny - 1;
        if (iy === 0 || (edge && (!b.camp || b.edges))) held = true;
        else if (edge && b.fell) {
          const wx = b.x0 + ix, wz = b.z0 + iz, f = b.fell;
          if (wx < f.x0 - 2 || wx > f.x1 + 2 || wz < f.z0 - 2 || wz > f.z1 + 2) held = true;
        }
        const step = (dx, dy, dz, d) => {
          const jx = ix + dx, jy = iy + dy, jz = iz + dz;
          if (jx < 0 || jy < 0 || jz < 0 || jx >= nx || jy >= ny || jz >= nz) return;
          const j = i + d;
          if (seen[j] || !W.get(b.x0 + jx, b.y0 + jy, b.z0 + jz)) return;
          seen[j] = 1; stack[sp++] = j;
        };
        step(1, 0, 0, 1); step(-1, 0, 0, -1); step(0, 0, 1, nx); step(0, 0, -1, -nx); step(0, 1, 0, nx * nz); step(0, -1, 0, -nx * nz);
      }
      if (!held && b.camp && piece.length >= 4000) held = true;
      // Trim of the building that fell (a roof railing, a cornice, the lip a block out from its walls) went with it. Brushing the
      // building next door does not hold it up; only reaching the ground would.
      let own = false;
      if (!held && b.own) for (const i of piece) {
        const [ax, , az] = at(i);
        if (ax >= b.own.x0 - 1 && ax <= b.own.x1 + 1 && az >= b.own.z0 - 1 && az <= b.own.z1 + 1) { own = true; break; }
      }
      if (!held && !b.camp && !own) {
        for (const i of piece) {
          const [ax, ay, az] = at(i);
          for (let dz = -2; dz <= 2 && !held; dz++) for (let dx = -2; dx <= 2 && !held; dx++) if ((dx || dz) && W.get(ax + dx, ay, az + dz) && standing(ax + dx, az + dz)) held = true;
          if (held) break;
        }
      }
      if (!held && (b.camp || b.into)) {
        // Brought down here and now: the world's own check would call it held by whatever it leans on next door, or get to it late.
        const list = b.into || [];
        this.lotFalling = true;
        for (const i of piece) { const [ax, ay, az] = at(i), id = W.get(ax, ay, az); if (id && HP[id] !== 255 && W.set(ax, ay, az, 0)) list.push(ax, ay, az, id); }
        this.lotFalling = false;
        if (!b.into && list.length) this.onCollapse(list);
        dropped++;
      } else if (!held) { const [ax, ay, az] = at(i0); W.floatQueue.push(ax, ay, az, 1); dropped++; }
    }
    return dropped;
  }

  // A camp light whose structure came down above or around it, with nothing left glowing nearby, is out for good.
  checkLightsGone(cols) {
    const W = this.world, gone = this.lightsGone || (this.lightsGone = new Set());
    let changed = false;
    const lit = (l) => {
      const lx = Math.floor(l.x), lz = Math.floor(l.z);
      for (let z = lz - 6; z <= lz + 6; z++) for (let x = lx - 6; x <= lx + 6; x++) for (let y = STREET_Y - 1; y <= STREET_Y + 45; y++) {
        const id = W.get(x, y, z);
        if (id && (FLAGS[id] & F_EMISSIVE)) return true;
      }
      return false;
    };
    const hit = (l) => {
      const lx = Math.floor(l.x), lz = Math.floor(l.z);
      for (let z = lz - 2; z <= lz + 2; z++) for (let x = lx - 2; x <= lx + 2; x++) if (cols.has(x + z * WX)) return true;
      return false;
    };
    for (const c of this.layout.camps) {
      const all = c.lights.concat(c.glowLights || []);
      for (const l of all) {
        const key = `${Math.round(l.x * 2)},${Math.round(l.z * 2)}`;
        if (gone.has(key) || !hit(l) || lit(l)) continue;
        gone.add(key); changed = true;
      }
    }
    if (changed) this.refreshCityLights();
  }

  // --- Blood -------------------------------------------------------------------------------------------
  // Every one put down leaves some of itself on the ground. One is a few pink spots; a street where a horde was cleared goes dark
  // red. Kept per column with the height of the surface it lies on, so it never shows on a roof over the spot.
  addBlood(x, y, z, amount, spread = 1) {
    const W = this.world, B = this.bloodCols || (this.bloodCols = new Map());
    const n = 1 + Math.round(spread * 2.5);
    for (let k = 0; k < n; k++) {
      const a = rand() * 6.283, r = k ? rand() * spread : 0;
      const bx = Math.floor(x + Math.cos(a) * r), bz = Math.floor(z + Math.sin(a) * r);
      let by = Math.floor(y + .3);
      if (W.get(bx, by, bz)) { if (W.get(bx, by + 1, bz)) continue; by++; }
      let s = 0;
      while (by > 1 && !W.get(bx, by - 1, bz) && s++ < 4) by--;
      if (!W.get(bx, by - 1, bz)) continue;
      // Thinner the further it was thrown from where they fell.
      const key = bx + bz * WX, e = B.get(key), add = amount * (k ? .5 * (1 - r / (spread * 1.6)) + .1 : 1) * (.7 + rand() * .6);
      if (e && e.y === by) e.a = Math.min(1.6, e.a + add);
      else if (!e || e.a < add) B.set(key, { a: Math.min(1.6, add), y: by });
    }
    if (B.size > 60000) { const it = B.keys(); for (let k = 0; k < 5000; k++) B.delete(it.next().value); }
    this.bloodDirty = true;
  }

  // Rain takes it away, slowly, wherever the rain can get at it. A downpour clears a street in a few minutes; a drizzle barely touches it.
  // Then the patch of it round you is handed to the renderer.
  updateBlood(dt) {
    const B = this.bloodCols, P = this.player, R = this.renderer;
    if (!B) return;
    this.bloodT = (this.bloodT || 0) - dt;
    if (this.bloodT > 0) return;
    this.bloodT = .5;
    const rain = this.weather.rain || 0, map = this.rainMap;
    if (rain > .03 && B.size) {
      const loss = rain * .006;
      for (const [key, e] of B) {
        const x = key % WX, z = (key / WX) | 0;
        // Under cover it stays.
        if (map && map.at(x, z) >= e.y) continue;
        e.a -= loss;
        if (e.a <= .01) B.delete(key);
      }
      this.bloodDirty = true;
    }
    const N = 256, x0 = Math.floor(P.x) - N / 2, z0 = Math.floor(P.z) - N / 2;
    const tex = R.blood || (R.blood = { N, x0, z0, data: new Uint8Array(N * N * 2), version: 0 });
    if (!this.bloodDirty && Math.abs(tex.x0 - x0) < 48 && Math.abs(tex.z0 - z0) < 48) return;
    this.bloodDirty = false;
    tex.x0 = x0; tex.z0 = z0;
    const d = tex.data;
    d.fill(0);
    for (const [key, e] of B) {
      const x = key % WX - x0, z = ((key / WX) | 0) - z0;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const i = (x + z * N) * 2;
      d[i] = Math.min(255, Math.round(e.a / 1.6 * 255));
      d[i + 1] = e.y & 255;
    }
    tex.version++;
  }

  // A building stands on its ground floor. Every block that goes out of it, to the dead or to you, counts against it, and past a point
  // what is left cannot carry what is above: the whole thing comes down. A crowd chewing its way in after you can do it, given time.
  structureLost(x, y, z, id) {
    // A tree is only leaves and a trunk. Take some of it away and see what is still holding on to anything.
    if (id === M.TRUNK || (FLAGS[id] & F_LEAF)) {
      const q = this.treeQ || (this.treeQ = new Map());
      const key = (x >> 2) + (z >> 2) * 4096 + (y >> 2) * 4096 * 4096;
      if (q.size < 40 && !q.has(key)) q.set(key, [x, y, z]);
    }
    // Anything taken out of a camp's buildings: in a moment, a look round it for whatever it was holding up.
    if (!this.lotFalling && y >= STREET_Y && this.horde.campAt(x + .5, z + .5, -6)) {
      const ck = (x >> 3) + (z >> 3) * 4096, seen = this.campSweepAt || (this.campSweepAt = new Map());
      if (!(this.time - (seen.get(ck) ?? -99) < 3)) {
        seen.set(ck, this.time);
        if (seen.size > 400) seen.clear();
        (this.floatSweeps || (this.floatSweeps = [])).push({ t: 1.5, x0: x - 8, x1: x + 8, z0: z - 8, z1: z + 8, y0: STREET_Y - 1, y1: STREET_Y + 18, camp: true, edges: true });
      }
    }
    if (this.lotFalling || y < STREET_Y || y > STREET_Y + 3) return;
    const lot = this.layout.lot[z * WX + x];
    if (!lot) { this.campPartLost(x, y, z); return; }
    const m = this.lotHurt || (this.lotHurt = new Map());
    let e = m.get(lot);
    if (!e) { e = { lost: 0, base: 0, down: false }; m.set(lot, e); }
    if (e.down) return;
    e.lost++;
    (this.lotDirty || (this.lotDirty = new Set())).add(lot);
  }

  // Leaves that were held by what has gone: each is tried on its own, so a clump hanging by a corner comes down with the rest.
  checkTrees() {
    const q = this.treeQ;
    if (!q || !q.size) return;
    const W = this.world;
    let n = 0;
    for (const [key, [x, y, z]] of q) {
      q.delete(key);
      for (let b = y - 5; b <= y + 5; b++) for (let c = z - 4; c <= z + 4; c++) for (let a = x - 4; a <= x + 4; a++) {
        const id = W.get(a, b, c);
        if (id && (FLAGS[id] & F_LEAF) && n < 160) { W.floatQueue.push(a, b, c, 1); n++; }
      }
      if (n >= 160) break;
    }
  }

  // The same for what a camp has built inside its wall: a shack, a tenement, the church. Enough of what it stands on gone and it comes
  // down. The wall, its towers, the flag and the alarm have their own rules and are left out of it.
  campPartLost(x, y, z) {
    const c = this.horde.inCamp(x + .5, z + .5, 0);
    if (!c || !this.horde.campAt(x + .5, z + .5, -6)) return;
    const skip = { tower: 1, flood: 1, flag: 1, alarm: 1, lights: 1, lamp: 1, crops: 1, court: 1, graves: 1, garden: 1, firepit: 1 };
    const k = c.parts.findIndex((p) => !skip[p.t] && x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1);
    if (k < 0) return;
    const p = c.parts[k], m = this.partHurt || (this.partHurt = new Map()), key = `${c.id}:${k}`;
    let e = m.get(key);
    // Put back up since it last fell: it can come down again.
    if (e && e.down && this.day + this.tod - e.downAt > 1) e = null;
    if (!e) {
      const W = this.world;
      let n = 0;
      for (let yy = STREET_Y; yy <= STREET_Y + 3; yy++) for (let zz = p.z0; zz <= p.z1; zz++) for (let xx = p.x0; xx <= p.x1; xx++) if (W.get(xx, yy, zz)) n++;
      e = { lost: 0, base: n + 1, down: false };
      m.set(key, e);
    }
    if (e.down) return;
    e.lost++;
    if (e.lost < Math.max(10, e.base * .3)) return;
    e.down = true; e.downAt = this.day + this.tod;
    this.campPartDown(p);
  }

  campPartDown(p) {
    const W = this.world, list = [], top = STREET_Y + (p.h || 8) + 3;
    if (!W.isLoaded(p.x0, STREET_Y, p.z0) || !W.isLoaded(p.x1, STREET_Y, p.z1)) return;
    this.lotFalling = true;
    for (let y = STREET_Y; y <= top; y++) for (let z = p.z0; z <= p.z1; z++) for (let x = p.x0; x <= p.x1; x++) {
      const id = W.get(x, y, z);
      if (!id || HP[id] === 255) continue;
      if (W.set(x, y, z, 0)) list.push(x, y, z, id);
    }
    this.lotFalling = false;
    this.sweepFloating({ x0: p.x0 - 6, x1: p.x1 + 6, z0: p.z0 - 6, z1: p.z1 + 6, y0: STREET_Y - 1, y1: top + 3, camp: true, into: list, fell: p });
    if (list.length) this.onCollapse(list);
  }

  checkStructures() {
    const dirty = this.lotDirty;
    if (!dirty || !dirty.size) return;
    const W = this.world, L = this.layout;
    for (const lot of dirty) {
      const e = this.lotHurt.get(lot), b = L.buildings[lot - 1];
      if (!e || e.down || !b) { dirty.delete(lot); continue; }
      // Everything it had to stand on, counted once, the first time anything went: what is there now and what has gone already.
      if (!e.base) {
        let n = 0;
        for (let y = STREET_Y; y <= STREET_Y + 3; y++) for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) if (L.lot[z * WX + x] === lot && W.get(x, y, z)) n++;
        e.base = n + e.lost;
      }
      dirty.delete(lot);
      if (e.lost < Math.max(40, e.base * .26)) continue;
      // Only once all of it is here to fall: a building half in memory cannot come down half way.
      if (!W.isLoaded(b.x0, STREET_Y, b.z0) || !W.isLoaded(b.x1, STREET_Y, b.z1)) { dirty.add(lot); continue; }
      this.bringDown(lot, b, e);
      break;
    }
  }

  bringDown(lot, b, e) {
    const W = this.world, L = this.layout;
    e.down = true;
    let top = STREET_Y + 8;
    for (let k = 1; k < b.tiers.length; k += 2) top = Math.max(top, b.tiers[k] + 10);
    const list = [];
    this.lotFalling = true;
    for (let y = STREET_Y; y <= Math.min(250, top); y++) for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
      if (L.lot[z * WX + x] !== lot) continue;
      const id = W.get(x, y, z);
      if (!id || HP[id] === 255) continue;
      // A few stumps of the ground floor walls are left standing in the heap.
      if (y <= STREET_Y + 2) {
        const edge = x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1;
        if (edge && ((x * 7 + z * 13 + y * 3) % 5) < 2 + (STREET_Y + 2 - y)) continue;
      }
      if (W.set(x, y, z, 0)) list.push(x, y, z, id);
    }
    // The trim a block out from its walls belongs to no lot: a roof railing, a cornice, the root of an awning. It goes with the building,
    // which also parts it from the same railing running on along the next roof, so nothing of it is left hanging off the neighbour.
    for (let y = STREET_Y + 3; y <= Math.min(250, top); y++) for (let z = b.z0 - 1; z <= b.z1 + 1; z++) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
      if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) continue;
      if (L.lot[z * WX + x] || this.horde.inCamp(x + .5, z + .5, 0)) continue;
      const id = W.get(x, y, z);
      if (!id || HP[id] === 255) continue;
      if (W.set(x, y, z, 0)) list.push(x, y, z, id);
    }
    this.lotFalling = false;
    // Whatever was hanging off it or standing on it, all of it, now: an awning, a fire escape, a sign, the corner of a roof.
    this.sweepFloating({ x0: b.x0 - 4, x1: b.x1 + 4, z0: b.z0 - 4, z1: b.z1 + 4, y0: STREET_Y - 1, y1: Math.min(250, top + 2), into: list, own: b });
    this.heapFor = b;
    if (list.length) this.onCollapse(list);
    this.heapFor = null;
  }

  // What a building leaves when it comes down: a mound over its footprint, one to three floors deep depending on how much building
  // there was, made of what it was made of. Anything under it when it lands stays under it.
  buildingHeap(b, list) {
    const W = this.world, L = this.layout, H = this.horde, P = this.player, id = b.id, base = STREET_Y + (b.lift || 0);
    const floors = Math.max(1, (b.top - base) / FLOOR_H), span = Math.max(b.x1 - b.x0, b.z1 - b.z0);
    const peak = Math.round(FLOOR_H * Math.min(3, 1 + floors / 12 + span / 45));
    const mats = this.heapMats(list);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, rx = (b.x1 - b.x0) / 2 + 1, rz = (b.z1 - b.z0) / 2 + 1;
    const heightAt = (x, z) => {
      const nx = (x + .5 - cx) / rx, nz = (z + .5 - cz) / rz;
      const box = Math.max(Math.abs(nx), Math.abs(nz)), round = Math.hypot(nx, nz);
      const k = Math.max(0, 1 - Math.pow(box * .55 + round * .45, 1.7));
      // Lumpy, not spiky: the roughness comes in patches a couple of blocks across, and nothing stands above the peak.
      const cell = (a, b) => (((a * 73856093) ^ (b * 19349663)) >>> 0) % 1000 / 1000 - .5;
      const n = cell(x >> 1, z >> 1) * .6 + cell(x, z) * .4;
      return Math.max(1, Math.min(peak, Math.round(peak * (k + n * .22) + .4)));
    };
    // It comes down from the ground up: each layer of the mound lands when the part of the building that makes it would, so the
    // heap grows under the falling floors and reaches its full height as the roof comes in.
    const tall = Math.max(4, b.top - base);
    const landAt = (y) => Math.sqrt(2 * tall * ((y - base) / peak) / 18) + .08 + Math.random() * .25;
    for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
      if (L.lot[z * WX + x] !== id) continue;
      const h = heightAt(x, z);
      for (let y = base; y < base + h; y++) this.dropLater(landAt(y), x, y, z, Math.random() < .45 || !mats.length ? M.RUBBLE : mats[(Math.random() * mats.length) | 0], 35);
    }
    // Crushed: the dead and anyone else caught where it lands, once it has landed on them.
    this.afterDrops(landAt(base + 1), () => this.heapCrush(b, heightAt));
  }

  heapCrush(b, heightAt) {
    const L = this.layout, H = this.horde, id = b.id, base = STREET_Y + (b.lift || 0);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, rx = (b.x1 - b.x0) / 2 + 1, rz = (b.z1 - b.z0) / 2 + 1;
    H.forRadius(cx, cz, Math.max(rx, rz) + 1, (i) => {
      const x = Math.floor(H.px[i]), z = Math.floor(H.pz[i]);
      if (L.lot[z * WX + x] === id && H.py[i] < base + heightAt(x, z)) H.damage(i, 9999, false, H.px[i], H.py[i] + 1, H.pz[i], false);
    });
    for (const n of this.npcs.list) {
      if (n.dead || L.lot[Math.floor(n.z) * WX + Math.floor(n.x)] !== id) continue;
      if (n.y < base + heightAt(Math.floor(n.x), Math.floor(n.z))) this.npcs.hurt(n, 9999);
    }
  }

  // Debris that is still in the air: each block is set down when what it stands for would have landed.
  dropLater(t, x, y, z, id, hurt = 0) {
    (this.drops || (this.drops = [])).push({ t: (this.dropClock || 0) + t, x, y, z, id, hurt });
    this.dropsSorted = false;
  }

  afterDrops(t, fn) { (this.dropsAfter || (this.dropsAfter = [])).push({ t: (this.dropClock || 0) + t, fn }); }

  updateDrops(dt) {
    const D = this.drops, A = this.dropsAfter;
    if (!(D && D.length) && !(A && A.length)) { this.dropClock = 0; return; }
    const now = (this.dropClock = (this.dropClock || 0) + dt), W = this.world, P = this.player;
    if (D && D.length) {
      if (!this.dropsSorted) { D.sort((a, b) => b.t - a.t); this.dropsSorted = true; }   // soonest last, so they pop off the end
      // A big building lands over a couple of seconds; keep any one frame's share of it reasonable.
      let n = 0, hurtYou = 0;
      const px = Math.floor(P.x), pz = Math.floor(P.z);
      while (D.length && D[D.length - 1].t <= now && n < 2500) {
        const d = D.pop();
        if (W.get(d.x, d.y, d.z)) continue;
        W.set(d.x, d.y, d.z, d.id);
        n++;
        // Remembered as wreckage, so whoever comes to put something back knows what to haul off first.
        const hc = this.heapCells || (this.heapCells = new Set());
        if (hc.size < 200000) hc.add(d.x + d.z * WX + d.y * WX * WZ);
        // Landing where you stand: you are pushed up onto it, and if it was a building you feel it.
        if (d.x === px && d.z === pz && d.y + 1 > P.y && d.y < P.y + 1.8) {
          P.y = d.y + 1; P.vy = Math.max(0, P.vy);
          hurtYou = Math.max(hurtYou, d.hurt);
        }
      }
      if (hurtYou && !(this.dropHurtAt > now - 3)) { this.dropHurtAt = now; P.damage(hurtYou, P.x, P.z, 'blast'); }
    }
    if (A && A.length) for (let i = A.length - 1; i >= 0; i--) if (A[i].t <= now) A.splice(i, 1)[0].fn();
  }

  // Anything smaller that comes down leaves a pile where it fell, about a fifth of what fell, spread a little.
  collapseHeap(list) {
    const W = this.world, cols = new Map();
    let solid = 0;
    for (let k = 0; k < list.length; k += 4) {
      const id = list[k + 3];
      if ((FLAGS[id] & (F_GLASS | F_LEAF | F_EMISSIVE)) || id === M.TRUNK) continue;
      solid++;
      const key = list[k] + list[k + 2] * WX, e = cols.get(key);
      if (e) { e.n++; e.y = Math.min(e.y, list[k + 1]); e.top = Math.max(e.top, list[k + 1]); } else cols.set(key, { x: list[k], z: list[k + 2], y: list[k + 1], top: list[k + 1], n: 1 });
    }
    if (solid < 12) return;
    const mats = this.heapMats(list);
    for (const e of cols.values()) {
      let h = Math.min(5, Math.floor(e.n * .2 + Math.random()));
      if (!h) continue;
      let y = e.y;
      while (y > 1 && !W.get(e.x, y - 1, e.z)) y--;
      // Each block of the pile is down when the stretch of the column it stands for has fallen that far.
      for (let k = 0; k < h; k++, y++) {
        const from = e.y + (e.top - e.y) * (k + 1) / h;
        this.dropLater(Math.sqrt(2 * Math.max(.5, from - y) / 18) + .05 + Math.random() * .12, e.x, y, e.z, Math.random() < .5 || !mats.length ? M.RUBBLE : mats[(Math.random() * mats.length) | 0]);
      }
    }
  }

  // A tree that comes down: the trunk lies where it fell, away from whoever felled it, and a scatter of its leaves lies round about.
  treeFall(list) {
    const W = this.world, P = this.player;
    let tx = 0, tz = 0, tn = 0, base = 1e9;
    for (let k = 0; k < list.length; k += 4) if (list[k + 3] === M.TRUNK) { tx += list[k]; tz += list[k + 2]; tn++; base = Math.min(base, list[k + 1]); }
    if (tn) {
      tx = Math.round(tx / tn); tz = Math.round(tz / tn);
      let dx = tx - P.x, dz = tz - P.z;
      if (Math.abs(dx) > Math.abs(dz)) { dx = Math.sign(dx) || 1; dz = 0; } else { dz = Math.sign(dz) || 1; dx = 0; }
      for (let s = 1; s <= Math.min(10, tn); s++) {
        const x = tx + dx * s, z = tz + dz * s;
        let y = base + 2;
        while (y > 1 && !W.get(x, y - 1, z)) y--;
        if (W.get(x, y, z)) continue;
        this.dropLater(.25 + s * .06, x, y, z, M.TRUNK);
      }
    }
    for (let k = 0; k < list.length; k += 4) {
      const id = list[k + 3];
      if (!(FLAGS[id] & F_LEAF) || Math.random() > .12) continue;
      const x = list[k], z = list[k + 2];
      let y = list[k + 1];
      while (y > 1 && !W.get(x, y - 1, z)) y--;
      if (!W.get(x, y, z)) this.dropLater(Math.sqrt(2 * Math.max(.5, list[k + 1] - y) / 18) + .1 + Math.random() * .2, x, y, z, id);
    }
  }

  heapMats(list) {
    const mats = [], step = Math.max(1, Math.floor(list.length / 4 / 64)) * 4;
    for (let k = 3; k < list.length && mats.length < 64; k += step) {
      const m = list[k];
      if (!(FLAGS[m] & (F_GLASS | F_LEAF | F_EMISSIVE)) && m !== M.TRUNK && HP[m] !== 255) mats.push(m);
    }
    return mats;
  }

  onDebrisImpact(x, y, z, r, g, b, speed) {
    const W = this.world, ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    if (!this.collapseOrganic && rand() < .08) this.particles.dust(x, y + .5, z, 1, 2.4);
    if (this.rubbleBudget > 0 && rand() < .3) {
      let py = iy + 1;
      if (!W.get(ix, py, iz) && py < 200) {
        W.set(ix, py, iz, this.rubbleMat && rand() < .55 ? this.rubbleMat : M.RUBBLE);
        this.rubbleBudget--;
        if (!W.get(ix, py - 1, iz)) W.floatQueue.push(ix, py, iz, 1);
      }
    }
    if (rand() < .22 && speed > 3) {
      const H = this.horde;
      H.forRadius(x, z, 1.2, (i) => {
        if (Math.abs(H.py[i] - y) < 3) {
          // Rubble in a camp came down because the dead chewed through what held it up, so it is not the player's kill.
          const yours = !H.campAt(x, z, 14);
          if (H.damage(i, 60, false, x, y, z, yours)) { if (yours) this.player.kills++; this.particles.blood(H.px[i], H.py[i] + 1.2, H.pz[i], 0, 1, 0, 6, 4); }
        }
      });
      const P = this.player;
      if (P.alive && Math.hypot(P.x - x, P.z - z) < 1.1 && Math.abs(P.y + 1 - y) < 3) P.damage(9, x, z, 'blast');
    }
  }

  bootVeil() {
    const v = document.getElementById('boot-veil');
    v.classList.add('on');
    const go = (e) => {
      // The function keys are the browser's (F5 reload, F11 full screen, F12 tools): they pass straight through and do not start it.
      if (e && e.type === 'keydown' && /^F\d+$/.test(e.code)) return;
      // Only the first click or key, and it does nothing else: no menu button pressed through it, no key reaching the game.
      if (e) { e.preventDefault(); e.stopPropagation(); }
      // The click that follows the press would land on whatever menu button is under the fading screen.
      if (e && e.type === 'pointerdown') window.addEventListener('click', (c) => { c.preventDefault(); c.stopPropagation(); }, { capture: true, once: true });
      v.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go, true);
      this.audio.init();
      v.classList.add('out');
      setTimeout(() => v.remove(), 1700);
    };
    v.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go, true);
  }

  // --- Game flow ---------------------------------------------------------------------------------------
  enterMenu() {
    this.state = 'menu';
    this.audio.menuMusic(true);
    // A clean slate for the people down there, whatever the last game left behind. The save already has it.
    this.campSim.reset();
    this.npcs.list.length = 0;
    this.dogs.reset();
    this.npcs.followers.length = 0;
    this.npcs.camps.forEach((c) => { c.active = false; c.npcs = []; c.guards = []; });
    this.npcs.showcase = true;
    if (this.campSim) { this.campSim.alarm = null; this.campSim.alarmLevel = 0; }
    this.ui.showHUD(false);
    this.ui.open('menu', false);
    this.tod = rand();
    this.weather.randomise();
    const lady = this.layout.structs.find((s) => s.type === 'statue'), bat = this.layout.camps.find((c) => c.key === 'battery');
    const bx = bat.cx - lady.x, bz = bat.cz - lady.z, bd = Math.hypot(bx, bz);
    // What gets loaded in full is everything from the foot of the light to the far side of the Landing, whichever of them the camera is nearer to.
    this.menuCenter = { x: lady.x + bx * .63, z: lady.z + bz * .63, lx: lady.x, lz: lady.z, ux: bx / bd, uz: bz / bd, bd, bx: bat.cx, bz: bat.cz };
    this.menuT = rand() * 100;
    this.menuY = undefined;
    // Where the flight starts and finishes, and a point off to the side that bends it out over open water, well clear of her.
    {
      const ca = Math.cos(MENU_SHOT.angle), sa = Math.sin(MENU_SHOT.angle), M0 = this.menuCenter;
      const to = { x: M0.lx - (M0.ux * ca - M0.uz * sa) * MENU_SHOT.dist, z: M0.lz - (M0.ux * sa + M0.uz * ca) * MENU_SHOT.dist };
      // Off the near wall of the Landing, out over the bay.
      const from = { x: bat.cx - M0.ux * (MENU_SHOT.startOff + 115) + M0.uz * 20, z: bat.cz - M0.uz * (MENU_SHOT.startOff + 115) - M0.ux * 20 };
      const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2, nx = mx - M0.lx, nz = mz - M0.lz, nd = Math.hypot(nx, nz) || 1;
      // Facing the camp at the start and past her at the end, and always the long way round to the left.
      const yawFrom = Math.atan2(bat.cx - from.x, from.z - bat.cz);
      let yawTo = Math.atan2(M0.lx - to.x, to.z - M0.lz) - MENU_SHOT.turn;
      while (yawTo >= yawFrom) yawTo -= Math.PI * 2;
      this.menuPath = { from, to, yawFrom, yawTo, bend: { x: mx + nx / nd * 40, z: mz + nz / nd * 40 } };
      this.menuFlight = 0;
    }
    this.horde.bankAll();
    // The crowd is around the Battery and a long way off. It does not have to be big, only there.
    this.horde.settings.radius = 300;
    this.horde.menu = true;
    this.horde.settings.activeCap = Math.min(this.settings.cap, 7000);
    this.fadeK = 0;
    this.player.alive = true;
    this.menuFilled = false;
    this.npcs.list.length = 0;
    this.dogs.reset();
    this.npcs.followers.length = 0;
    this.npcs.camps.forEach((c) => { c.active = false; c.npcs = []; });
  }

  newGame(diff, campId = 0, kit = 'veteran') {
    const P = this.player;
    this.difficulty = diff;
    this.horde.menu = false;
    this.horde.applyDifficulty(diff);
    this.horde.settings.activeCap = this.settings.cap;
    this.horde.settings.radius = Math.min(264, this.settings.view - 24);
    this.horde.resetPopulation();
    this.world.importEdits([]);
    this.world.edits.clear();
    this.lightsGone = new Set();
    this.lightChecks = [];
    this.lotHurt = new Map();
    this.lotDirty = new Set();
    this.clearLoadedWorld();
    this.jobs.active = [];
    this.jobs.offerDay = {};
    this.campSim.reset();
    this.director.reset();
    this.horde.campStatusChanged(false);
    this.horde.growth = 1;
    this.horde.resetPopulation();
    this.horde.setCrowdBoosts([]);
    this.refreshCityLights();
    this.npcs.list.length = 0;
    this.dogs.reset();
    this.npcs.followers.length = 0;
    this.npcs.camps.forEach((c) => { c.active = false; c.npcs = []; c.guards = []; c.gates.forEach((q) => { q.open = 0; q.target = 0; q.broken = false; q.ruinOpen = false; q.evac = false; }); });
    this.stats = { shots: 0, jobs: 0, placed: 0 };
    P.reset();
    // Survival always begins at the same camp. Everyone else picks.
    const c = kit === 'survival' ? this.layout.camps.find((k) => k.key === START_CAMP) : this.layout.camps[campId];
    P.holdKit(kit, c.key);
    if (kit === 'regular' || kit === 'survival') P.campRep[c.id] = 10;
    P.home = c.id;
    this.nameCharacter();
    P.x = c.boss.x + .5; P.y = STREET_Y; P.z = c.boss.z + 9.5;
    P.yaw = 0;
    // A survivor wakes before dawn, about an hour before the day report goes out at six, under whatever sky there is, as often as that
    // sky turns up.
    if (kit === 'survival') this.weather.randomise(); else this.weather.clearSky();
    this.freshStart();
    const bed = kit === 'survival' ? this.placeInBed(c) : null;
    P.discovered[c.id] = true;
    this.tod = kit === 'survival' ? .201 + rand() * .016 : .33;
    this.day = 1;
    this.time = 0;
    this.lastBite = -1e9;
    this.pickups = [];
    this.spawnPending = true;
    this.beginLoad('Entering Ballarat', () => {
      const leader = LORE[c.key].cast.find((m) => m.role === 'leader');
      // The sandbox skips the introductions: you walk in already carrying your kit, and nobody sends you to see anyone.
      if (this.slot === 'sandbox' && kit !== 'survival') {
        P.takeKit();
        this.saveGame();
        this.ui.banner(c.name, 'Sandbox. Your kit is on you, and the city is yours.');
        return;
      }
      this.jobs.startVisit(c);
      this.saveGame();
      if (kit === 'survival') { this.wakeUp(c, bed, () => this.ui.banner(c.name, this.survivalBanner())); return; }
      this.ui.banner(c.name, `You came in with nothing. Find ${leader.name}, who runs this place: they will get you set up.`);
    });
  }

  clearLoadedWorld() {
    const W = this.world, gl = this.renderer.gl;
    for (let i = 0; i < W.chunks.length; i++) {
      const c = W.chunks[i];
      if (!c) continue;
      if (c.vao) { gl.deleteVertexArray(c.vao); gl.deleteBuffer(c.vbo); }
      c.dead = true;
      W.chunks[i] = null;
    }
    W.colState.fill(0);
    W.loadMask.fill(0);
    W.maskDirty = true;
    W.highPrio.length = 0;
    W.lastCX = -999;
    W.floatQueue.length = 0;
    W.damage.clear();
    W.initWalk();
    W.stats.quads = 0;
    this.horde.corpseCount = 0;
    this.horde.corpseHead = 0;
    this.horde.n = 0;
  }

  // What the character screen shows. Reads each save, so it is for the menu, not for every frame.
  async slotInfo() {
    await this.savePending;
    const out = [];
    for (const n of [1, 2, 3, 'sandbox']) {
      const s = await dbGet(slotKey(n)).catch(() => null);
      if (!s) { out.push({ n, empty: true }); continue; }
      const P = s.player || {};
      out.push({ n, empty: false, name: P.charName || `Character ${n}`, kit: P.loadout, day: s.day, kills: P.kills || 0, scrip: P.scrip || 0, savedAt: s.savedAt || 0, dead: !!s.permaDead, lived: Math.max(1, (s.day || 1) - (P.bornDay || 1) + 1) });
    }
    return out;
  }

  // Continue means the last person you played who is still alive.
  async refreshContinue() {
    const slots = await this.slotInfo();
    this.sandboxSave = slots.find((s) => s.n === 'sandbox');
    // Continue is for your characters: the latest survival save. The sandbox is picked up from its own screen.
    const best = slots.filter((s) => s.n !== 'sandbox' && !s.empty && !s.dead).sort((a, b) => b.savedAt - a.savedAt)[0] || null;
    this.continueSlot = best ? best.n : 0;
    this.ui.setContinue(best);
  }

  // Every character and the sandbox, gone. Only from the title screen, so nothing is mid-save.
  async deleteAllSaves() {
    if (this.state === 'play') return false;
    await this.savePending;
    for (const n of [1, 2, 3, 'sandbox']) await dbDelete(slotKey(n)).catch((e) => console.warn('delete failed', e));
    await this.refreshContinue();
    return true;
  }

  async deleteSlot(n) {
    await this.savePending;
    await dbDelete(slotKey(n)).catch((e) => console.warn('delete failed', e));
    await this.refreshContinue();
  }

  // The dead stay dead. The only way back into a dead character's city is as somebody else, and only if you ask for that.
  async continueGame(slot = this.continueSlot, asSomeoneNew = false) {
    await this.savePending;
    if (!slot) return;
    const s = await dbGet(slotKey(slot)).catch(() => null);
    if (!s || (s.permaDead && !asSomeoneNew)) return;
    this.slot = slot;
    this.horde.menu = false;
    this.difficulty = s.difficulty;
    this.horde.applyDifficulty(s.difficulty);
    this.horde.settings.activeCap = this.settings.cap;
    this.horde.settings.radius = Math.min(264, this.settings.view - 24);
    this.horde.resetPopulation();
    // Garvey was rebuilt. Damage inside its wall belongs to buildings that are gone, and nobody should wake up inside a new one.
    const rebuilt = s.garvey !== GARVEY_V, yard = this.layout.camps.find((k) => k.key === 'garvey');
    let edits = rebuilt ? this.world.dropEditsIn(s.edits, yard.x0 + 2, yard.z0 + 2, yard.x1 - 2, yard.z1 - 2) : s.edits;
    // The outside face of a standing camp's wall, and its gate towers, are as hard as the wall itself now. Damage to them in an older
    // save is put back, on every side that does not have an open breach the camp is still dealing with.
    for (const c of this.layout.camps) {
      const cs = s.camps && s.camps.state && s.camps.state[c.id];
      if (!cs || cs.status !== 'holding') continue;
      const open = new Set((cs.breaches || []).map((b) => b.side)), M = 4;
      if (!open.has('N')) edits = this.world.dropEditsIn(edits, c.x0 - M, c.z0 - M, c.x1 + M, c.z0 - 1);
      if (!open.has('S')) edits = this.world.dropEditsIn(edits, c.x0 - M, c.z1 + 1, c.x1 + M, c.z1 + M);
      if (!open.has('W')) edits = this.world.dropEditsIn(edits, c.x0 - M, c.z0, c.x0 - 1, c.z1);
      if (!open.has('E')) edits = this.world.dropEditsIn(edits, c.x1 + 1, c.z0, c.x1 + M, c.z1);
    }
    this.world.importEdits(edits);
    this.lightsGone = new Set((s.lightsGone || []).filter((k) => {
      if (!rebuilt) return true;
      const [x, z] = k.split(',').map((v) => v / 2);
      return !(x > yard.x0 && x < yard.x1 && z > yard.z0 && z < yard.z1);
    }));
    this.lightChecks = [];
    this.lotHurt = new Map((s.lotHurt || []).map(([k, lost, base, down]) => [k, { lost, base, down: !!down }]));
    this.freshStart();
    this.lotDirty = new Set();
    this.clearLoadedWorld();
    this.player.reset();
    this.player.fromSave(s.player);
    if (rebuilt) {
      const P = this.player;
      if (P.x > yard.x0 && P.x < yard.x1 && P.z > yard.z0 && P.z < yard.z1) { P.x = yard.spots.plaza.x; P.z = yard.spots.plaza.z; P.y = STREET_Y; }
      const yardState = s.camps && s.camps.state && s.camps.state[yard.id];
      if (yardState) yardState.broken = null;
    }
    this.jobs.offerDay = {};
    this.tod = s.tod;
    this.day = s.day;
    this.campSim.reset();
    this.campSim.fromSave(s.camps);
    this.director.reset();
    this.director.fromSave(s.director);
    this.weather.fromSave(s.weather);
    this.horde.campStatusChanged(false);
    this.horde.growth = 1 + Math.min(1.2, (s.day - 1) * .04);
    this.horde.importState(s.horde);
    this.jobs.fromSave(s.jobs);
    this.refreshCityLights();
    this.npcs.list.length = 0;
    this.dogs.reset();
    this.npcs.followers.length = 0;
    this.npcs.camps.forEach((c) => { c.active = false; c.npcs = []; c.guards = []; });
    this.tod = s.tod;
    this.day = s.day;
    this.stats = s.stats || this.stats;
    this.pickups = [];
    this.spawnPending = true;
    if (s.permaDead) { this.rollCharacter(); return; }
    this.beginLoad('Returning to the city', null);
  }

  saveGame() {
    if (this.state !== 'play' && this.state !== 'loading') return;
    const data = {
      version: 1, garvey: GARVEY_V, player: this.player.toSave(), jobs: this.jobs.toSave(), edits: this.world.exportEdits(), horde: this.horde.exportState(),
      tod: this.tod, day: this.day, difficulty: this.difficulty, stats: this.stats, lightsGone: [...(this.lightsGone || [])], lotHurt: [...(this.lotHurt || new Map())].map(([k, e]) => [k, e.lost, e.base, e.down ? 1 : 0]), camps: this.campSim.toSave(), director: this.director.toSave(), weather: this.weather.toSave(), savedAt: Date.now(),
      permaDead: this.player.loadout === 'survival' && !this.player.alive,
    };
    this.savePending = dbPut(slotKey(this.slot || 1), data).catch((e) => console.warn('save failed', e));
    this.world.editsDirty = false;
  }

  quitToMenu() {
    if (this.devOpen) this.toggleDev(false);
    this.player.fly = false;
    this.saveGame();
    this.horde.bankAll();
    this.clearLoadedWorld();
    this.horde.applyDifficulty(DIFFICULTY.hard);
    this.horde.settings.activeCap = Math.min(this.settings.cap, 14000);
    this.world.importEdits([]);
    this.horde.resetPopulation();
    this.enterMenu();
    this.refreshContinue();
  }

  beginLoad(title, after) {
    this.audio.menuMusic(false);
    this.npcs.showcase = false;
    this.state = 'loading';
    this.loadTitle = title;
    this.loadAfter = after;
    this.loadStart = performance.now();
    this.ui.showHUD(false);
    this.ui.loading(title, 0, 'Streaming the neighbourhood');
    this.audio.init();
  }

  updateLoading() {
    const W = this.world, P = this.player;
    W.update(P.x, P.z);
    const pcx = Math.floor(P.x) >> 5, pcz = Math.floor(P.z) >> 5;
    let total = 0, ready = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dz * dz > 10) continue;
      const cx = pcx + dx, cz = pcz + dz;
      if (cx < 0 || cz < 0 || cx >= CW || cz >= CD) continue;
      total++;
      if (W.loadMask[cx + cz * CW]) ready++;
    }
    const pct = total ? ready / total : 1;
    this.ui.loading(this.loadTitle, pct, `${ready} of ${total} blocks ready`, false);
    if (pct >= 1 || performance.now() - this.loadStart > 25000) {
      this.state = 'play';
      if (this.spawnPending) {
        this.horde.fillAround(P.x, P.z);
        this.spawnPending = false;
      }
      this.ui.closeAll();
      this.ui.showHUD(true);
      this.renderer.shadowInitFrames = 3;
      this.fadeK = 0;
      this.lock();
      if (this.loadAfter) this.loadAfter();
      this.loadAfter = null;
    }
  }

  travelTo(camp, spot) {
    const P = this.player;
    this.horde.bankAll();
    P.x = spot ? spot.x : camp.boss.x + .5; P.y = STREET_Y; P.z = spot ? spot.z : camp.boss.z + 9.5;
    P.vx = P.vy = P.vz = 0;
    this.tod = (this.tod + .06) % 1;
    this.spawnPending = true;
    this.ui.closeAll();
    this.world.lastCX = -999;
    this.beginLoad(spot ? 'Coming round' : `Travelling to ${camp.name}`, spot ? () => this.wokeInStreet(camp) : null);
  }

  onPlayerDeath() {
    const P = this.player;
    this.deathShown = false;
    document.exitPointerLock();
    const survival = P.loadout === 'survival';
    document.querySelector('#death h1').textContent = survival ? `${P.charName} is dead` : 'Overrun';
    document.getElementById('death-respawn').textContent = survival ? 'Start as someone new' : 'Wake up';
    document.getElementById('death-menu').style.display = survival ? '' : 'none';
    document.getElementById('death-restart').style.display = survival ? '' : 'none';
    if (survival) {
      this.saveGame();
      const days = Math.max(1, this.day - (P.bornDay || 1) + 1);
      setTimeout(() => {
        if (this.state !== 'play') return;
        document.getElementById('death-text').textContent = `${days === 1 ? 'One day' : `${days} days`} in the city, ${P.kills.toLocaleString('en-US')} infected down. Nobody is coming back from this one, but the city carries on without them.`;
        this.deathShown = true;
        this.ui.open('death', false);
      }, 1800);
      return;
    }
    const lost = Math.floor(P.scrip * .25);
    P.scrip -= lost;
    this.deathLost = lost;
    const papers = Object.keys(CITIZENSHIP).filter((key) => P.count(papersFor(key))).map((key) => this.layout.camps.find((k) => k.key === key).name);
    setTimeout(() => {
      if (this.state !== 'play') return;
      this.deathShown = true;
      document.getElementById('death-text').textContent = `Someone dragged you out of the street before you turned. They kept ${lost} spades for the trouble. ${P.kills.toLocaleString('en-US')} infected down so far.${papers.length ? ` On the books you died, so your papers for ${papers.join(' and ')} are gone.` : ''}`;
      this.ui.open('death', false);
    }, 1800);
  }

  // Somewhere that would take in a stranger: not one of the strong camps, and still standing.
  survivalCamp() {
    const standing = this.layout.camps.filter((c) => this.campSim.state[c.id].status === 'holding');
    const low = standing.filter((c) => SURVIVAL_TIERS.includes(CAMP_START[c.key].tier));
    const pool = low.length ? low : standing;
    return pool.length ? pool[Math.floor(rand() * pool.length)] : null;
  }

  nameCharacter() {
    const P = this.player;
    let name = P.charName;
    while (name === P.charName) name = randomName(true);
    P.charName = name;
    P.bornDay = this.day || 1;
  }

  // A survivor starts their life in a bed, and the wake-up shows it. Stands them next to it for now, so the right bit of the city loads.
  bedFor(c, ground) {
    if (c.wakeBed && !ground) return c.wakeBed;
    let best = null, bd = 1e12;
    for (const p of c.pois) {
      if (p.kind !== 'sleep' || (p.yaw || 0) !== 0) continue;
      const d = Math.hypot(p.x - c.boss.x, p.z - c.boss.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  placeInBed(c) {
    const bed = this.bedFor(c);
    if (bed) this.placeInBed2(bed);
    return bed || null;
  }

  placeInBed2(bed) {
    const P = this.player;
    P.x = bed.standX ?? bed.x; P.y = bed.y ?? STREET_Y; P.z = bed.standZ ?? bed.z + 1.9;
    P.vx = P.vy = P.vz = 0;
    P.yaw = bed.lookYaw ?? Math.PI;
    P.pitch = bed.lookPitch ?? 0;
  }

  showIntro(on, c) {
    const box = document.getElementById('wake-text');
    if (!on) { box.className = ''; return; }
    box.children[0].textContent = `You were rescued and taken to ${c.name}, in ${this.layout.areaOf(c.cx, c.cz)}.`;
    box.children[1].textContent = `Your name is ${this.player.charName}.`;
    box.className = 'on';
  }

  wakeUp(c, bed, then) {
    const P = this.player;
    if (this.ui.modal === 'pause') this.ui.open(null, false);
    if (!bed) { then(); return; }
    const W = this.world;
    // The city keeps its holes between lives. If that bed's floor is gone, or the bed itself, it is one of the ordinary ones.
    if (bed.y && !(W.solid(Math.floor(bed.x), bed.y, Math.floor(bed.z)) && W.solid(Math.floor(P.x), bed.y - 1, Math.floor(P.z)))) {
      bed = this.bedFor(c, true);
      if (!bed) { then(); return; }
      this.placeInBed2(bed);
    }
    // If the foot of the bed is blocked, anywhere else nearby will do to stand.
    // A spot to stand is floor underfoot and room for a head over it, both: never the middle of a wall.
    // The whole body has to fit, not just the middle of it: anything less and the push out of the wall goes up, through the roof.
    const Y = bed.y ?? STREET_Y, col = (x, z) => W.solid(Math.floor(x), Y - 1, Math.floor(z)) && !W.solid(Math.floor(x), Y, Math.floor(z)) && !W.solid(Math.floor(x), Y + 1, Math.floor(z)) && !W.solid(Math.floor(x), Y + 2, Math.floor(z));
    const clear = (x, z) => col(x - .4, z - .4) && col(x + .4, z - .4) && col(x - .4, z + .4) && col(x + .4, z + .4);
    if (!clear(P.x, P.z)) {
      search: for (let r = 1; r < 9; r += .5) for (let a = 0; a < 16; a++) {
        const x = bed.x + .5 + Math.cos(a * .3927) * r, z = bed.z + Math.sin(a * .3927) * r;
        if (clear(x, z)) { P.x = x; P.z = z; break search; }
      }
    }
    P.y = Y;
    this.wakeFx = { t: 0, c, bed, then, health: P.health, x: bed.x, y: Y, z: bed.z, intro: INTRO_TIME };
    this.showIntro(true, c);
    document.body.classList.add('waking');
    document.getElementById('wake-lids').style.display = 'block';
    this.setLids(0);
    this.audio.duck(true);
    this.wakeFx.heard = false;
  }

  setLids(open) {
    const box = document.getElementById('wake-lids');
    box.children[0].style.transform = `translateY(${-open * 112}%)`;
    box.children[1].style.transform = `translateY(${open * 112}%)`;
  }

  // Dark. Eyes open, the canvas over the bed, close them again. Open. Sit up, look around, stand. Six seconds.
  updateWake(dt) {
    const fx = this.wakeFx, P = this.player, cam = this.cam;
    // Nobody else gets this bed until they are out of it, and whoever was in it moves over.
    fx.bed.by = P;
    for (const n of this.npcs.camps[fx.c.id].npcs) if (n.task && n.task.poi === fx.bed) { n.bed = null; n.task = null; }
    if (P.health < fx.health || !P.alive) { this.endWake(); return; }
    // The words first, on black.
    if (fx.intro > 0) {
      fx.intro -= dt;
      // The words fade out before anything else starts, and it is dark for a moment after. The lines stay as they are: the whole block fades.
      if (fx.intro <= INTRO_FADE) document.getElementById('wake-text').classList.add('out');
      if (fx.intro <= 0) this.showIntro(false);
      return;
    }
    const t = (fx.t += dt);
    const ease = (a, b) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };
    // Two tries at opening them: the first does not take.
    const lids = t < 1.75 ? ease(.55, 1.05) * .5 * (1 - ease(1.3, 1.7)) : ease(1.95, 2.9);
    this.setLids(lids);
    fx.blur = 3.6 * (1 - ease(1.9, 3.9));
    if (!fx.heard && t > 1.9) { fx.heard = true; this.audio.duck(false); }
    const sit = ease(2.95, 4.25), stand = ease(4.25, 5.6);
    const feet = fx.bed.feet ?? 1, eye = P.eyePos(), hx = fx.x + .0, hz = fx.z - 3.1 * feet, breath = Math.sin(t * 1.5) * .018 * (1 - stand);
    const sx = fx.x, sy = fx.y + 2.45, sz = fx.z - 1.3 * feet;
    let x = hx + (sx - hx) * sit, y = fx.y + 1.42 + (sy - fx.y - 1.42) * sit + breath, z = hz + (sz - hz) * sit;
    x += (eye[0] - x) * stand; y += (eye[1] - y) * stand; z += (eye[2] - z) * stand;
    cam.x = x; cam.y = y; cam.z = z;
    // Flat on your back, looking up past your feet; a glance to the side as you come up; then level, facing the way you are going to walk.
    const glance = Math.sin(ease(3.2, 5.2) * Math.PI) * .32;
    cam.yaw = P.yaw + glance;
    const lying = 1.22 + Math.sin(t * .9) * .02;
    cam.pitch = lying + (-.06 - lying) * sit + (P.pitch + .06) * stand - Math.sin(stand * Math.PI) * .09;
    cam.roll = (.16 * (1 - sit)) + Math.sin(sit * Math.PI) * -.06 + Math.sin(stand * Math.PI) * .03;
    if (t >= 6.1) this.endWake();
  }

  endWake() {
    const fx = this.wakeFx;
    if (!fx) return;
    this.wakeFx = null;
    fx.bed.by = null;
    document.body.classList.remove('waking');
    document.getElementById('wake-lids').style.display = 'none';
    this.showIntro(false);
    this.audio.duck(false);
    this.player.swapT = .45;
    fx.then();
  }

  survivalBanner() {
    return 'You only get the one life. You came in with nothing: find the leader.';
  }

  // Permadeath. The city stays as it is, holes and all; the person walking around in it is new.
  rollCharacter() {
    const P = this.player, c = this.survivalCamp();
    if (!c) { this.newGame(this.difficulty, 0, 'survival'); return; }   // nowhere left standing: a fresh city
    const was = P.charName;
    P.reset();
    P.charName = was;
    this.nameCharacter();
    P.holdKit('survival', c.key);
    P.campRep[c.id] = 10;
    P.home = c.id;
    this.campSim.lastCamp = c.id;
    P.discovered[c.id] = true;
    P.x = c.boss.x + .5; P.y = STREET_Y; P.z = c.boss.z + 9.5;
    P.vx = P.vy = P.vz = 0;
    P.yaw = 0;
    const bed = this.placeInBed(c);
    this.horde.bankAll();
    this.jobs.active = [];
    this.jobs.offerDay = {};
    this.npcs.list.length = 0;
    this.dogs.reset();
    this.npcs.followers.length = 0;
    this.npcs.camps.forEach((k) => { k.active = false; k.npcs = []; k.guards = []; });
    this.stats = { shots: 0, jobs: 0, placed: 0 };
    this.pickups = [];
    this.spawnPending = true;
    this.ui.closeAll();
    this.world.lastCX = -999;
    this.beginLoad(`Elsewhere in the city`, () => {
      this.jobs.startVisit(c);
      this.saveGame();
      this.wakeUp(c, bed, () => this.ui.banner(c.name, this.survivalBanner()));
    });
  }

  // Survival, from the top: a new face, the first morning, Carver Yard, the city as it was. Same save slot.
  restartSurvival() {
    if (this.player.loadout !== 'survival') return;
    this.ui.closeAll();
    this.newGame(this.difficulty, 0, 'survival');
  }

  respawn() {
    const P = this.player;
    if (P.loadout === 'survival') { this.rollCharacter(); return; }
    let best = null, bd = 1e9;
    // The hunt ends with you. Your name does not.
    P.grief = {};
    P.wanted = {};
    P.bail = {};
    // On the books you died. Whatever you paid for died with you.
    for (const key of Object.keys(CITIZENSHIP)) P.remove(papersFor(key), P.count(papersFor(key)));
    const welcome = (c) => this.campSim.state[c.id].status === 'holding' && !this.npcs.hostileCamp(c.id) && this.npcs.admitted(c.id);
    for (const c of this.layout.camps) {
      if (!P.discovered[c.id] || !welcome(c)) continue;
      const d = Math.hypot(c.cx - P.x, c.cz - P.z);
      if (d < bd) { bd = d; best = c; }
    }
    // Nobody will have you inside: whoever found you left you in the street, outside the wall.
    const spot = best ? null : this.streetSpot();
    best = best || this.nearestCamp();
    P.alive = true;
    P.health = 60;
    P.infection = Math.min(100, P.infection + 6);
    P.stamina = 100;
    P.hurtFlash = 0;
    P.eye = 2.45;
    P.pitch = 0;
    this.travelTo(best, spot);
    this.saveGame();
  }

  nearestCamp() {
    const P = this.player;
    let best = this.layout.camps[0], bd = 1e12;
    for (const c of this.layout.camps) {
      const d = Math.hypot(c.cx - P.x, c.cz - P.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  streetSpot() {
    const P = this.player, W = this.world, L = this.layout;
    for (let t = 0; t < 600; t++) {
      const a = Math.random() * 6.283, r = 40 + t * .8;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      if (!W.walk[(x >> 1) + (z >> 1) * W.walkW] || L.lot[z * WX + x] || this.horde.inCamp(x, z, 30)) continue;
      return { x: x + .5, z: z + .5 };
    }
    return { x: P.x, z: P.z };
  }

  wokeInStreet(camp) {
    this.npcs.spawnRoamers(16, 14, true);
    if (this.npcs.hostileCamp(camp.id)) this.ui.banner('Left in the street', `${camp.name} will not have you back. Its patrols will take your bail: ${this.npcs.bailFor(camp.id)} spades.`);
    else this.ui.banner('Left in the street', 'Nobody you know could take you in. Find a settlement that will have you.');
  }

  // --- Frame --------------------------------------------------------------------------------------------------
  schedule() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame((t) => { this.rafPending = false; this.loop(t); });
  }

  loop(now) {
    this.schedule();
    // Keeps its own clock, so a limit that does not divide evenly into the screen's refresh still averages out right.
    const cap = this.settings.fpsCap;
    if (cap) {
      const gap = 1000 / cap;
      if (now < (this.nextFrameAt || 0) - 1) return;
      this.nextFrameAt = Math.max((this.nextFrameAt || 0) + gap, now - gap);
    }
    const dt = Math.min(.05, Math.max(0, now - this.last) / 1000) || 0;
    this.last = now;
    this.frame++;
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT >= .5) { this.fps = this.fpsN / this.fpsT; this.fpsN = 0; this.fpsT = 0; }
    const t0 = performance.now();
    try {
      this.step(dt);
    } catch (e) {
      console.error(e);
      if (!this.errored) { this.errored = true; this.ui.toast(`Error: ${e.message}`, 'bad'); }
    }
    this.cpuMs = this.cpuMs * .9 + (performance.now() - t0) * .1;
    this.input.pressed = {};
    this.input.mousePressed = [false, false, false];
  }

  // Somebody out there keeps her lit. They come up at dusk: the shafts in the air, the lamps themselves, and what the harbour makes of it all.
  statueLights(paused) {
    const r = this.renderer, fx = this.particles;
    const lady = this.lady || (this.lady = this.layout.structs.find((s) => s.type === 'statue'));
    const k = Math.min(1, Math.max(0, (r.sky.night - .2) / .5));
    r.flood[0] = lady.x + .5; r.flood[1] = STREET_Y + 58; r.flood[2] = lady.z + .5; r.flood[3] = k;
    const cam = r.camPos;
    for (let i = 0; i < STATUE_LAMPS.length; i++) r.floodLamps.set([lady.x + STATUE_LAMPS[i][0] + .5, STREET_Y + 6, lady.z + STATUE_LAMPS[i][1] + .5, STATUE_LAMPS[i][2]], i * 4);
    if (k <= 0 || !cam) return;
    const far = Math.hypot(cam[0] - lady.x, cam[2] - lady.z) > 1400;
    const rainy = this.weather.rain;
    for (let i = 0; i < STATUE_LAMPS.length; i++) {
      const [dx, dz, power] = STATUE_LAMPS[i];
      const x = lady.x + dx + .5, y = STREET_Y + 6, z = lady.z + dz + .5;
      if (far) continue;
      let ax = lady.x + .5 - x, ay = r.flood[1] - y, az = lady.z + .5 - z;
      const m = Math.hypot(ax, ay, az);
      ax /= m; ay /= m; az /= m;
      const air = (.1 + rainy * .07) * power * k;
      r.addBeam(x, y, z, ax, ay, az, 78, 24, air, air * .95, air * .86);
      if (!paused) {
        const cl = Math.hypot(cam[0] - x, cam[1] - y, cam[2] - z);
        fx.sprite(2, x, y - .4, z, 0, 0, 0, .35 + cl * .0035, 0, k * 1.6, .95 * k * 1.6, .86 * k * 1.6, .7, .035);
      }
    }
    if (cam[1] > WATER_Y && !far) {
      // In the water she is a long pale smear, and her flame a warm streak coming towards you.
      const pale = .14 * k;
      r.addWaterBeam(lady.x + .5, STREET_Y + 20, lady.z + .5, 0, 1, 0, 72, 7, pale, pale * .95, pale * .86);
      const flame = .3 * k;
      r.addWaterBeam(lady.x + 5.5, STREET_Y + 92, lady.z + .5, 0, 1, 0, 10, 2, flame, flame * .55, flame * .2);
    }
  }

  step(dt) {
    const r = this.renderer;
    this.time += dt;
    // Sirens belong to the game being played. Nothing else tells them to stop, so a menu, a pause or a loading screen has to.
    if (this.state !== 'play' || (this.ui.modal && this.ui.modal !== 'dialog')) this.audio.setAlarm(null, 0, true);
    if (this.state === 'loading') {
      this.updateLoading();
      this.drawScene(dt, true);
      return;
    }
    const paused = this.state === 'play' && !!this.ui.modal && this.ui.modal !== 'dialog';
    this.audio.muffle(paused);
    if (!paused && this.state !== 'loading') this.updateWeather(dt);
    if (this.state === 'play' && !paused) this.updateFires(dt);
    if (this.state === 'menu') this.updateMenu(dt);
    else if (this.state === 'play' && !paused) this.updatePlay(dt);
    else if (this.state === 'play') this.world.update(this.player.x, this.player.z);
    r.setTimeOfDay(this.tod);
    r.grain = this.settings.grain ?? .3;
    this.statueLights(paused);
    this.drawScene(dt, paused);
    if (this.state === 'play') this.ui.updateHUD(dt);
    // F3 works anywhere there is something being drawn, the menu included.
    if (this.state === 'play' || this.state === 'menu') {
      const W = this.world;
      if (!this.showFPS && this.settings.showFps) this.ui.setFPS(`${this.fps.toFixed(0)} fps`, true);
      else this.ui.setFPS(`${this.fps.toFixed(0)} fps  cpu ${this.cpuMs.toFixed(1)} ms\nzombies ${this.horde.n}  near ${this.horde.nearCount}  drawn ${this.horde.visibleCount}  hunting ${this.horde.chasers}\nisland ${this.horde.totalPopulation()}\ndraws ${r.stats.draws}  tris ${(r.stats.tris / 1e6).toFixed(2)}M  quads ${(W.stats.quads / 1e6).toFixed(2)}M\nfx ${this.particles.cn} cubes ${this.particles.sn} sprites  npcs ${this.npcs.list.length}\nxyz ${this.player.x.toFixed(0)} ${this.player.y.toFixed(0)} ${this.player.z.toFixed(0)}  edits ${W.edits.size}`, this.showFPS);
    }
  }

  updateWeather(dt) {
    const w = this.weather, r = this.renderer, fx = this.particles, cam = this.cam;
    w.update(dt);
    r.rain = w.rain; r.wet = w.wet; r.windX = w.windX; r.windZ = w.windZ; r.lightning = w.lightning;
    fx.windX = w.windX; fx.windZ = w.windZ;
    r.rainDriftX = (r.rainDriftX + w.windX * 27 * dt) % 840;
    r.rainDriftZ = (r.rainDriftZ + w.windZ * 27 * dt) % 840;
    const P = this.player, play = this.state === 'play', map = this.rainMap;
    // The roofs decide where the rain shows now, drop by drop, so a window still has weather behind it.
    map.update(cam.x, cam.z);
    r.rainVis = 1;
    r.rainIndoor = play ? Math.min(1, Math.max(0, (1 - P.skyVis) / .92)) : 0;
    if (play) this.drips.update(dt, cam);
    // Thin enough on the menu to see across the harbour.
    r.fogK = play ? 1 : this.state === 'menu' ? .5 : 1.5;
    r.rainFloor = r.sky.night * (this.state === 'menu' ? .09 : .12);
    // In the game, at night, the streaks also get more body: out in the dark they are all you have to tell it is raining.
    r.rainNight = play ? r.sky.night * 1.1 : 0;
    // Rain bouncing off the ground and mist kicked up around you, out in the open.
    if (w.rain > .03 && fx) {
      // Plenty of them, everywhere it is coming down, thickest close to you where you would see them.
      const n = Math.min(60, Math.floor(w.rain * 2400 * dt + rand()));
      const amb = (1 - r.sky.night * .82) * .5 + .045;
      for (let k = 0; k < n; k++) {
        const a = rand() * 6.283, d = 1.5 + Math.sqrt(rand()) * 30;
        const x = Math.floor(cam.x + Math.cos(a) * d), z = Math.floor(cam.z + Math.sin(a) * d);
        if (x < 1 || z < 1 || x >= WX || z >= WZ || this.layout.lot[z * WX + x]) continue;
        // On whatever it hits first: the street, or a tent, an awning, a roof. Not on the one over your own head.
        const y = Math.max(this.world.terrainTop(x, z), map.at(x, z) + 1);
        if (y > cam.y + 2) continue;
        // A splash is as bright as whatever is shining on it: the sky, the camp's lamps and fires, and a little more in your own torch beam.
        const lit = r.spot && ((x - cam.x) * r.camForward[0] + (y - cam.y) * r.camForward[1] + (z - cam.z) * r.camForward[2]) / Math.hypot(x - cam.x, y - cam.y, z - cam.z) > .9;
        const L = r.lightAt(x, z), t = lit ? .45 : 0;
        const b = 14;
        fx.sprite(2, x + rand(), y + .2, z + rand(), 0, .8, 0, .02, .03, (amb + L[0] * .7 + t) * b, (amb * 1.05 + L[1] * .7 + t * .97) * b, (amb * 1.15 + L[2] * .7 + t * .9) * b, .4, .14);
      }
      // The bigger splashes too, everywhere it rains: lit by the sky and the lamps like the small ones, and at their brightest in your torch beam.
      {
        const m = Math.min(30, Math.floor(w.rain * 1100 * dt + rand()));
        for (let k = 0; k < m; k++) {
          const a = rand() * 6.283, d = 2 + Math.sqrt(rand()) * 24;
          const x = Math.floor(cam.x + Math.cos(a) * d), z = Math.floor(cam.z + Math.sin(a) * d);
          if (x < 1 || z < 1 || x >= WX || z >= WZ || this.layout.lot[z * WX + x]) continue;
          const y = Math.max(this.world.terrainTop(x, z), map.at(x, z) + 1);
          if (y > cam.y + 2) continue;
          const ux = x + .5 - cam.x, uy = y - cam.y, uz = z + .5 - cam.z, ul = Math.hypot(ux, uy, uz) || 1;
          const lit = r.spot > 0 && (ux * r.camForward[0] + uy * r.camForward[1] + uz * r.camForward[2]) / ul > .9;
          const L = r.lightAt(x, z), k2 = 9;
          const cr = lit ? 1.76 : (amb + L[0] * .7) * k2, cg = lit ? 1.84 : (amb * 1.05 + L[1] * .7) * k2, cb = lit ? 2 : (amb * 1.15 + L[2] * .7) * k2;
          fx.sprite(2, x + rand(), y + .22, z + rand(), 0, .9, 0, .05, .34, cr, cg, cb, .26, .14);
        }
      }
      if ((this.frame & 3) === 0 && w.rain > .4) {
        const a = rand() * 6.283, d = 8 + rand() * 30, mx = cam.x + Math.cos(a) * d, mz = cam.z + Math.sin(a) * d;
        const my = Math.max(this.world.terrainTop(Math.floor(mx), Math.floor(mz)), map.at(mx, mz) + 1);
        if (my < cam.y + 2) fx.sprite(0, mx, my + .6, mz, w.windX * 4, .15, w.windZ * 4, 2.6, 1.6, .55, .57, .6, .1 * w.rain, 2.4);
      }
    }
  }

  updateMenu(dt) {
    this.menuT += dt;
    const t = this.menuT * .06;
    const C = this.menuCenter;
    const cam = this.cam;
    // Once the Battery has loaded: away from its wall, out across the harbour, past her, and into the wide view of all of it, where it stays and drifts.
    if (this.menuFilled) this.menuFlight = Math.min(1, this.menuFlight + dt / MENU_SHOT.flight);
    const R = this.menuPath, k = this.menuFlight * this.menuFlight * (3 - 2 * this.menuFlight), q = 1 - k;
    const look = k;
    const px = q * q * R.from.x + 2 * q * k * R.bend.x + k * k * R.to.x, pz = q * q * R.from.z + 2 * q * k * R.bend.z + k * k * R.to.z;
    // At the end of it, a boat's worth of movement and no more.
    const drift = Math.sin(t * .5) * 3.5 * k;
    cam.x = px + C.uz * drift;
    cam.z = pz - C.ux * drift;
    cam.y = STREET_Y + MENU_SHOT.startHeight + (MENU_SHOT.height - MENU_SHOT.startHeight) * k + Math.sin(this.menuT * .7) * .4 + Math.sin(this.menuT * .29) * .5;
    // Looking at the camp to begin with, then turning steadily left as it backs away, so she comes into view on the right.
    cam.yaw = R.yawFrom + (R.yawTo - R.yawFrom) * look + Math.sin(t * .41) * .012;
    cam.pitch = MENU_SHOT.startPitch + (MENU_SHOT.pitch - MENU_SHOT.startPitch) * look + Math.sin(this.menuT * .43) * .006;
    cam.roll = Math.sin(this.menuT * .37) * .007 + Math.sin(k * Math.PI) * .012;
    this.menuFocus = Math.hypot(C.bx - cam.x, C.bz - cam.z) * (1 - look) + MENU_SHOT.dist * look;
    cam.fov = MENU_SHOT.fov;
    // What is loaded in full follows the flight: the camp while it is close, and her by the time it gets to her.
    const share = .75 - .29 * k;
    this.world.update(C.lx + C.ux * C.bd * share, C.lz + C.uz * C.bd * share);
    if (!this.menuFilled && this.world.loadMask[(Math.floor(C.bx) >> 5) + (Math.floor(C.bz) >> 5) * CW]) {
      this.menuFilled = true;
      this.horde.fillAround(C.bx, C.bz);
    }
    this.horde.nightK = 0;
    this.horde.update(dt, { x: C.bx, y: STREET_Y, z: C.bz, stealth: 0, alive: false });
    // The camp goes about its day under the camera. It wakes up when the camera is near enough, and is let go once it is too far off to see.
    if (this.menuFilled) {
      this.player.x = cam.x;
      this.player.z = cam.z;
      this.frameDt = dt;
      this.npcs.showcaseUpdate(dt);
    }
    this.audio.setListener(cam.x, cam.y, cam.z, cam.yaw);
    const w = this.weather, H = this.horde;
    this.audio.tick(dt, { nearZombies: H.nearCount, chasers: Math.min(H.chasers, 500), rain: w.rain * .18, wind: Math.hypot(w.windX, w.windZ), gust: w.gust, height: 20, night: this.renderer.sky.night, insects: .2 * Math.max(0, 1 - k / .55) });
    this.particles.update(dt);
    this.tickAtmosphere(dt, cam.x, cam.z);
    this.flareSun();
  }

  // Camp fires out in the open drown in a real downpour: the flames go, the light goes, and it is just wet ash. Once it eases off,
  // somebody in the camp gets it going again. You can too, if you would rather not wait. None of this goes in the save: a fire is
  // lit when the city is first seen, and the weather takes it from there.
  updateFires(dt) {
    const w = this.weather, W = this.world, sim = this.campSim;
    if ((this.fireTick = (this.fireTick || 0) + dt) < .5) return;
    const step = this.fireTick;
    this.fireTick = 0;
    let changed = false;
    for (const c of this.layout.camps) {
      const holding = sim.state[c.id].status === 'holding';
      for (const f of c.fires) {
        if (f.cells === undefined && W.isLoaded(f.x, STREET_Y, f.z)) {
          f.cells = [];
          for (let y = STREET_Y; y <= STREET_Y + 3; y++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (W.get(f.x + dx, y, f.z + dz) === M.FIRE) f.cells.push([f.x + dx, y, f.z + dz]);
          // A cookstove under a roof does not care what the sky is doing.
          f.sheltered = false;
          for (let y = STREET_Y + 2; y < STREET_Y + 34; y++) if (W.get(f.x, y, f.z)) { f.sheltered = true; break; }
          f.lasts = (f.big ? 55 : 28) + rand() * 25;
        }
        if (!f.out) {
          if (w.rain > .6 && !f.sheltered) {
            f.soak = (f.soak || 0) + step;
            if (f.soak > (f.lasts || 40)) { f.out = true; f.soak = 0; f.relight = 40 + rand() * 110; changed = true; }
          } else f.soak = Math.max(0, (f.soak || 0) - step * .5);
        } else if (holding && w.rain < .25 && (f.relight -= step) <= 0) {
          f.out = false;
          changed = true;
          this.fireRelit(c, f, null);
        }
        if (f.cells && f.cells.length && W.isLoaded(f.x, STREET_Y, f.z)) {
          const want = f.out ? M.BURNT : M.FIRE;
          for (const [x, y, z] of f.cells) {
            const id = W.get(x, y, z);
            if (id !== want && (id === M.FIRE || id === M.BURNT)) W.set(x, y, z, want, false);
          }
        }
      }
    }
    if (changed) this.refreshCityLights();
  }

  // Runs one part of the frame. If it throws, the rest of the frame still happens, the error goes to the console, and you are told once.
  guard(name, fn) {
    try { fn(); } catch (e) {
      console.error(`[${name}]`, e);
      const seen = this.guardSeen || (this.guardSeen = new Set());
      if (!seen.has(name)) { seen.add(name); this.ui.toast(`Something went wrong (${name}). The game carries on; the details are in the console.`, 'bad'); }
    }
  }

  // Nothing from the last game, or from the rain on the title screen, comes into this one: every camp fire is lit, and the gun in your
  // hands is dry until the weather here says otherwise.
  freshStart() {
    // Cheats belong to the game they were typed in. A new game, a new character or a loaded one starts without them, and locked.
    this.devUnlocked = false;
    this.devTyped = '';
    this.drops = []; this.dropsAfter = []; this.dropClock = 0;
    this.partHurt = new Map();
    this.rubbleFires = []; this.dustSites = [];
    this.bloodCols = new Map(); this.bloodDirty = true;
    this.cheats = {};
    this.horde.ignorePlayer = false;
    if (this.player) this.player.fly = false;
    if (this.devOpen) this.toggleDev(false);
    document.querySelectorAll('#devmenu button.on').forEach((b) => b.classList.remove('on'));
    const fly = document.getElementById('dev-fly');
    if (fly) fly.textContent = 'Fly: off';
    for (const c of this.layout.camps) for (const f of c.fires) { f.out = false; f.soak = 0; f.relight = 0; f.cells = undefined; }
    // Not from the weather now, which may still be the title screen's: the gun settles to where you are standing once it is drawn.
    if (this.viewModel) { this.viewModel.wet = 0; this.viewModel.settleWet = 12; }
    this.refreshCityLights();
  }

  // Lit again: by you, or by whoever in the camp got to it first, who will say so if you are close enough to hear.
  fireRelit(c, f, byPlayer) {
    const P = this.player;
    if (byPlayer) { this.ui.toast('You get the fire going again.', 'good'); this.audio.simple('crate'); return; }
    if (Math.hypot(f.x - P.x, f.z - P.z) > 40) return;
    let best = null, bd = 1e9;
    for (const n of this.npcs.list) {
      if (n.dead || n.camp !== c.id || n.kind !== 'resident' || n.kid) continue;
      const d = Math.hypot(n.x - f.x, n.z - f.z);
      if (d < bd) { bd = d; best = n; }
    }
    if (best && bd < 25) this.npcs.bark(best, ['There. Got it going again.', 'Who let the fire go out?', 'Somebody find me something dry to burn.', 'That will do. Come get warm.'][Math.floor(rand() * 4)], 30);
  }

  updatePlay(dt) {
    const P = this.player, H = this.horde, W = this.world, r = this.renderer;
    this.tod += dt / DAY_SECONDS;
    if (this.tod >= 1) { this.tod -= 1; this.day++; H.regrow(1); this.campSim.newDay(); }
    const night = r.sky.night;
    this.isNight = night > .5;
    H.nightK = night;

    const talking = this.ui.modal === 'dialog' && this.ui.dlgNpc;
    P.update(dt, this.input, this.locked && !talking && !this.sleepFx && !this.wakeFx);
    if (talking) {
      // Turn to face whoever you are talking to.
      const n = this.ui.dlgNpc;
      const e0 = P.eyePos();
      const dx = n.x - e0[0], dy = n.y + 2.2 - e0[1], dz = n.z - e0[2];
      let dy2 = Math.atan2(dx, -dz) - P.yaw;
      while (dy2 > Math.PI) dy2 -= Math.PI * 2;
      while (dy2 < -Math.PI) dy2 += Math.PI * 2;
      P.yaw += dy2 * Math.min(1, dt * 5);
      P.pitch += (Math.atan2(dy, Math.hypot(dx, dz)) - P.pitch) * Math.min(1, dt * 5);
    }
    W.update(P.x, P.z);
    const stealth = (P.crouch ? .45 : 1) * (P.sprinting ? 1.4 : 1);
    const shelter = H.campAt(P.x, P.z) ? H.inCamp(P.x, P.z) : null;
    // A ruin is no shelter from anything.
    P.sanctuary = !!shelter && this.campSim.state[shelter.id].status !== 'overrun';
    // Each part of the world runs on its own: one going wrong must not stop the rest. Before this, one bad frame in the people code left
    // everybody frozen mid-step and unkillable for the rest of the session.
    this.guard('horde', () => H.update(dt, { x: P.x, y: P.y, z: P.z, stealth, alive: P.alive, sanctuary: P.sanctuary, campId: shelter ? shelter.id : -1 }));
    this.frameDt = dt;
    if (P.interact && P.interact.kind === 'breach' && this.input.keys.KeyE && this.locked && !this.sleepFx && P.alive) this.campSim.handRepair(P.interact.breach, dt);
    this.guard('director', () => this.director.update(dt));
    this.guard('camps', () => this.campSim.update(dt));
    if (this.cheats && this.cheats.spades && P.scrip < 999999) P.scrip = 999999;
    this.guard('people', () => this.npcs.update(dt));
    this.guard('dogs', () => this.dogs.update(dt));
    this.guard('buildings', () => {
      if ((this.structT = (this.structT || 0) - dt) <= 0) { this.structT = .5; this.checkStructures(); }
      this.checkTrees();
      const lc = this.lightChecks;
      if (lc && lc.length) for (let i = lc.length - 1; i >= 0; i--) if ((lc[i].t -= dt) <= 0) { const q = lc.splice(i, 1)[0]; this.checkLightsGone(q.cols); }
      const fs = this.floatSweeps;
      // One a frame at most: a big one is a fair bit of work.
      if (fs && fs.length) for (let i = fs.length - 1; i >= 0; i--) if ((fs[i].t -= dt) <= 0 && !(this.dropsAfter && this.dropsAfter.length) && !(this.drops && this.drops.length)) { this.sweepFloating(fs.splice(i, 1)[0]); break; }
    });
    this.guard('jobs', () => this.jobs.update(dt));
    this.guard('effects', () => { this.particles.update(dt); this.updateDrops(dt); this.updateDustSites(dt); this.updateRubbleFires(dt); this.updateBlood(dt); });
    this.updatePickups(dt);
    this.tickAtmosphere(dt, P.x, P.z);
    this.flareSun();

    if ((this.autoSave = (this.autoSave || 0) - dt) <= 0) { this.autoSave = 60; if (P.alive) this.saveGame(); }

    // Audio
    const sampleMoan = () => {
      if (!H.n) return null;
      for (let t = 0; t < 6; t++) {
        const i = Math.floor(rand() * H.n);
        if (Math.hypot(H.px[i] - P.x, H.pz[i] - P.z) < 60) return [H.px[i], H.py[i] + 2, H.pz[i], H.state[i] > 0];
      }
      return null;
    };
    this.audio.setListener(P.x, P.y, P.z, P.yaw);
    const siren = this.campSim.alarm;
    this.audio.setAlarm(siren && !this.settings.muteSiren ? siren : null, this.campSim.alarmLevel);
    this.audio.tick(dt, this.audioState(sampleMoan, night));

    const wasSwim = this.wasSwim;
    this.wasSwim = P.y + 1 < WATER_Y;
    if (wasSwim !== this.wasSwim && this.time > 3) this.audio.simple('splash');

    // Camera
    const e = P.eyePos();
    const cam = this.cam;
    const shake = P.shake * P.shake * .09 * (this.settings.shake ?? 1);
    cam.x = e[0] + (rand() - .5) * shake;
    cam.y = e[1] + (rand() - .5) * shake;
    cam.z = e[2] + (rand() - .5) * shake;
    cam.yaw = P.yaw + P.kickX;
    cam.pitch = P.pitch + P.kickY;
    cam.roll = (Math.cos(P.bob) * .004 * P.bobAmt) + (P.alive ? 0 : Math.min(.7, P.deadT * .45)) + (rand() - .5) * shake * .3;
    const base = this.settings.fov * Math.PI / 180 * .72;
    const it = P.weapon ? ITEMS[P.weapon] : null;
    let wantFov = base * (P.sprinting ? 1.07 : 1);
    if (P.ads > .01 && it && it.type === 'gun') wantFov = base + (base * (it.scope ? .24 : .72) - base) * P.ads;
    this.fovSmooth = damp(this.fovSmooth, wantFov, 16, dt);
    cam.fov = this.fovSmooth;

    r.exposure = P.exposure;
    r.underwater = cam.y < WATER_Y;
    r.spot = P.flashlight ? 1.35 : 0;
    this.explFlash = Math.max(0, this.explFlash - dt * 2.2);
    if (this.wakeFx) this.updateWake(dt);
  }

  // Everything the sound beds want to know about where you are and what is around you.
  audioState(sample, night) {
    const P = this.player, w = this.weather, N = this.npcs;
    // How many people are about: wind and crickets give way to a busy camp.
    let voices = 0;
    for (let k = 0; k < N.list.length; k += 2) {
      const n = N.list[k];
      if (n.kind !== 'raider' && n.state !== 7 && Math.abs(n.x - P.x) + Math.abs(n.z - P.z) < 46) voices += 2;
    }
    let fireDist = 999;
    for (const c of this.layout.camps) {
      if (Math.abs(c.cx - P.x) > 240 || Math.abs(c.cz - P.z) > 240) continue;
      for (const f of c.fires) if (!f.out) fireDist = Math.min(fireDist, Math.hypot(f.x - P.x, f.z - P.z));
    }
    for (const f of this.layout.fireSpots) fireDist = Math.min(fireDist, Math.hypot(f.x - P.x, f.z - P.z) * 1.5);
    return {
      nearZombies: this.horde.nearCount, chasers: this.horde.chasers, sample, night, height: P.y, rain: w.rain, gust: w.gust,
      roof: 1 - Math.min(1, P.skyVis), wind: Math.hypot(w.windX, w.windZ), voices, fireDist, indoorsCamp: P.sanctuary,
    };
  }

  updatePickups(dt) {
    const P = this.player, fx = this.particles;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      const under = this.world.solid(Math.floor(p.x), Math.floor(p.y - .3), Math.floor(p.z));
      if (!under) p.y -= dt * 6;
      const d = Math.hypot(P.x - p.x, P.z - p.z);
      if (d < 1.9 && Math.abs(P.y + 1 - p.y) < 2.6 && P.alive) {
        if (p.scrip) { P.scrip += p.scrip; this.ui.toast(`+${p.scrip} spades`); this.audio.simple('coin'); }
        else { P.add(p.id, p.count); this.ui.toast(`+${p.count} ${ITEMS[p.id].name}`); this.audio.simple('pickup'); }
        this.pickups.splice(i, 1);
        continue;
      }
      if (p.t > 240) { this.pickups.splice(i, 1); continue; }
      if (d < 70) {
        const col = p.scrip ? [.62, .5, .16] : [.42, .45, .48];
        fx.cube(p.x, p.y + .15 + Math.sin(p.t * 3) * .07, p.z, 0, 0, 0, .22, col[0], col[1], col[2], .0001, 0, 3);
        // Redrawn every frame, so it is given its turn here: a slow, steady spin, not a fresh random angle each frame.
        if (fx.cn > 0) { const k = (fx.cn - 1) * fx.CF; fx.c[k + 10] = (p.spin ?? (p.spin = Math.random() * 6.28)) + p.t * 1.1; fx.c[k + 11] = 0; }
      }
    }
    P.drawProjectiles();
  }

  // How many to emit this frame for something that puts out `rate` a second: a running remainder per emitter, so effects come out at
  // the same rate whatever the frame rate is. At 280 frames a second, one-per-frame was most of the smoke in the city.
  emitN(owner, key, rate, dt) {
    const a = (owner[key] || 0) + rate * Math.min(dt, .1);
    const n = Math.floor(a);
    owner[key] = a - n;
    return n;
  }

  tickAtmosphere(dt, px, pz) {
    const fx = this.particles, r = this.renderer;
    // A living camp's fires and floodlights wash out the sky over it. Out in the dark city, or under a dead one, the stars come back.
    let glare = 0;
    if (this.campSim) {
      for (const c of this.layout.camps) {
        if (this.campSim.state[c.id].status !== 'holding') continue;
        const d = Math.max(c.x0 - px, px - c.x1, c.z0 - pz, pz - c.z1), k = Math.max(0, Math.min(1, (d - 20) / 240));
        glare = Math.max(glare, 1 - k * k * (3 - 2 * k));
      }
    }
    r.stars = damp(r.stars ?? 1, 1 - glare * .92, 1.5, dt);
    // A fallen camp burns for a long time, and you can see it from most of the island.
    if (this.campSim) {
      for (const c of this.layout.camps) {
        if (this.campSim.state[c.id].status !== 'overrun' || rand() > dt * 1.2) continue;
        if (Math.hypot(c.cx - px, c.cz - pz) < 2200) fx.plume(c.cx + (rand() - .5) * 60, STREET_Y + 6, c.cz + (rand() - .5) * 60, 1.5);
      }
    }
    for (const p of this.plumes) {
      p.t -= dt;
      if (p.t <= 0) {
        p.t = 1.3;
        if (Math.hypot(p.x - px, p.z - pz) < 2200) fx.plume(p.x, p.y, p.z, p.scale);
      }
    }
    this.wreckScan -= dt;
    if (this.wreckScan <= 0) {
      this.wreckScan = 1.2;
      const list = [];
      for (const w of this.wrecks) {
        const dx = w[0] - px, dz = w[1] - pz;
        if (dx * dx + dz * dz < 95 * 95) list.push(w);
        if (list.length >= 6) break;
      }
      this.activeWrecks = list;
    }
    const night = r.sky.night;
    for (const w of this.activeWrecks) {
      // Flames licking up off the hood and the trunk, lower and smaller off the roof: sat on the shell, never floating over it.
      for (let k = this.emitN(w, 'fireAcc', 50, dt); k > 0; k--) {
        const end = rand() < .4 ? 0 : rand() < .5 ? -1 : 1, along = end === 0 ? (rand() - .5) * 2.4 : end * (2.6 + rand() * 1.3), across = (rand() - .5) * 2.6;
        const fy = STREET_Y + (end === 0 ? 2.75 : .8) + rand() * .2;
        const ax = w[2] === 0 ? across : along, az = w[2] === 0 ? along : across;
        fx.fire(w[0] + ax, fy, w[1] + az, end === 0 ? 1.4 : 1.9);
      }
      // Tyres and seats: thick black smoke, pouring off the burning shell.
      for (let k = this.emitN(w, 'smokeAcc', Math.hypot(w[0] - px, w[1] - pz) < 120 ? 6 : 3, dt); k > 0; k--) fx.smoke(w[0] + (rand() - .5) * 2.4, STREET_Y + 2.1, w[1] + (rand() - .5) * 2.4, 1.6, .8, .05, .4);
      this.queueLight(w[0], STREET_Y + 2.6, w[1], 30, 6.5 + night * 2 + rand() * 1.8, 2.6 + night * .6, .6);
    }
    // Burning floors far off: just a small, flickering orange point in the dark, but it carries a long way.
    if (!this.farFires) this.farFires = this.layout.fireSpots;
    for (const f of this.farFires) {
      const d = Math.hypot(f.x - px, f.z - pz);
      if (d > 1800) continue;
      if (d < 200 && f.fx !== undefined) continue;
      const fl = .8 + .2 * Math.sin(this.time * 1.9 + f.x) * Math.sin(this.time * 1.1 + f.z);
      const k = (.55 + night * .9) * fl;
      if (f.fx === undefined) { fx.sprite(2, f.x + .5, f.y, f.z + .5, 0, 0, 0, 1.6 + d * .006, 0, 9 * k, 3.4 * k, .8 * k, 1, .035); continue; }
      // A row of burning windows across the face of the building, two floors high, each guttering in its own time.
      const ux = f.dz !== 0 ? 1 : 0, uz = f.dx !== 0 ? 1 : 0;
      for (let s = -2; s <= 2; s++) {
        const sure = f.found === 'yes', a = (sure ? (f.lo + f.hi) / 2 : 0) + s / 2 * f.half * (sure ? .85 : 1), fk = k * (.85 + .25 * Math.sin(this.time * (1.4 + s * .25) + f.x * .3 + s * 2.1));
        // Just out in front of the face, so the wall it is set in does not hide it: right against it once the face has been found.
        // Just inside the openings once the face is known, so it is the windows that glow; out in front until then.
        const out = sure ? -1.6 : 1.8;
        for (const h of [1.5, 5.5]) fx.sprite(2, f.fx + .5 + ux * a + f.dx * out, f.y + h, f.fz + .5 + uz * a + f.dz * out, 0, 0, 0, 2 + d * .009, 0, 9 * fk, 3.2 * fk, .7 * fk, 1, .035);
      }
      // And the light of it on its own smoke: a big dull glow round the whole floor, the way a fire looks from miles off.
      const mid = f.found === 'yes' ? (f.lo + f.hi) / 2 : 0;
      fx.sprite(2, f.fx + .5 + ux * mid + f.dx * 3, f.y + 5, f.fz + .5 + uz * mid + f.dz * 3, 0, 0, 0, f.half * 2.2 + 6 + d * .02, 0, 1.5 * k, .55 * k, .12 * k, 1, .035);
    }
    // The fires in the buildings, up close: the whole floor alight behind the windows, flame rolling out of them and up the face,
    // and smoke pouring up the outside of the building. It lights the street below.
    for (const f of this.layout.fireSpots) {
      const dx = f.x - px, dz = f.z - pz;
      if (dx * dx + dz * dz > 220 * 220) continue;
      // A big fire breathes: its light swells and sinks slowly rather than jittering frame to frame.
      const flicker = .9 + Math.sin(this.time * 2.3 + f.x) * .07 + Math.sin(this.time * 3.7 + f.z) * .05;
      // Where the face really is up there. The spot was picked at street level, and tall buildings step back as they rise, so
      // until the floor has been looked at in the world the flames would be hanging in the air beside it.
      if (f.fx !== undefined && !f.found) this.findFireFace(f);
      if (f.fx !== undefined && f.found === 'none') continue;
      if (f.fx === undefined) {
        for (let k = 0; k < 2; k++) fx.fire(f.x + (rand() - .5) * 7, f.y - 2 + rand() * 4, f.z + (rand() - .5) * 7, 2.4);
        this.queueLight(f.x, f.y, f.z, 34, 5.5 * flicker, 2.1 * flicker, .5);
        continue;
      }
      const ux = f.dz !== 0 ? 1 : 0, uz = f.dx !== 0 ? 1 : 0, lo = f.lo, hi = f.hi, mid = (lo + hi) / 2, span = hi - lo;
      const at = (along, depth, y) => [f.fx + .5 + ux * along - f.dx * depth, y, f.fz + .5 + uz * along - f.dz * depth];
      const anywhere = (inset) => lo + inset + rand() * Math.max(0, span - inset * 2);
      // The floors themselves, alight behind the window openings, kept inside the walls.
      for (let k = 0; k < 6; k++) {
        const [x, y, z] = at(anywhere(1.5), 3 + rand() * 8, f.y + .3 + rand() * 6.2);
        fx.fire(x, y, z, 2.6 + rand() * 1.8, true);
      }
      // Now and then licking out of an opening and up the face, close against it.
      for (let k = 0; k < (rand() < .5 ? 1 : 0); k++) {
        const [x, y, z] = at(anywhere(1.5), -.35, f.y + 1.5 + rand() * 5.5);
        fx.fire(x, y, z, 1.6 + rand() * .8, true);
      }
      if (this.frame % 3 === 0) {
        // Out of the top of the openings, rolling up the face of the building.
        const [x, y, z] = at(anywhere(2), -.8, f.y + 6.5 + rand() * 2);
        fx.smoke(x, y, z, 2.6, .55, .06, .42, .45);
      }
      // It lights its own building: the rooms from inside, and the face round the windows, the floors above, from out in front.
      const [lx, ly, lz] = at(mid, 6, f.y + 3.5);
      this.queueLight(lx, ly, lz, 42, 8.5 * flicker, 3.2 * flicker, .7);
      for (const side of span > 10 ? [lo + span * .25, hi - span * .25] : [mid]) {
        const fl2 = flicker * (.9 + .2 * Math.sin(this.time * 6.3 + side));
        const [ox, oy, oz] = at(side, -2.5, f.y + 4.5);
        this.queueLight(ox, oy, oz, 34, 6.5 * fl2, 2.5 * fl2, .55);
      }
    }
    // The floods only flash red for the real thing, not the slow siren.
    const siren = this.campSim && this.campSim.alarmLevel >= 1 ? this.campSim.alarm : null;
    const raised = this.campSim && this.campSim.alarm;
    for (const c of this.layout.camps) {
      const dx = c.cx - px, dz = c.cz - pz;
      if (dx * dx + dz * dz > 300 * 300) continue;
      // The beacon lights its own pole. A light straight above a pole only grazes its sides, so the glow is set either side of it, just under the lamp.
      let beam = 0;
      if (raised === c) {
        const level = this.campSim.alarmLevel, on = Math.sin(this.time * (level === 2 ? 14 : level === 1 ? 7 : 2.4)) > (level === 0 ? .55 : 0);
        if (on) {
          fx.sprite(2, c.post.x, c.post.y, c.post.z, 0, 0, 0, 1.1, 0, 10, .9, .6, .95, .04);
          this.queueLight(c.post.x, c.post.y, c.post.z, 22, 9, .9, .6);
          beam = 2.6;
        } else beam = .5;
      } else if (night > .15) beam = night;
      if (beam > 0 && dx * dx + dz * dz < 90 * 90) {
        for (const s of [1, -1]) this.queueLight(c.post.x + s * 1.5, c.post.y - 1.6, c.post.z + s * 1.5, 9, 1.5 * beam, .16 * beam, .12 * beam);
      }
      // Floodlights rake the approach after dark, and flash red when the alarm is going.
      const beat = siren === c ? (Math.sin(this.time * 7) > 0 ? 1 : .15) : 0;
      if (night > .25 || beat) {
        for (const l of c.floods) {
          const a = Math.hypot(l.x - px, l.z - pz);
          if (a > 240) continue;
          const sw = Math.sin(this.time * .35 + l.x) * .5;
          const ux = l.dx * Math.cos(sw) - l.dz * Math.sin(sw), uz = l.dz * Math.cos(sw) + l.dx * Math.sin(sw);
          const red = beat > .5;
          if (night > .25) {
            // Aimed down at the road, sweeping a little nearer and further as well as side to side, and reaching the ground unless
            // a proper wall is in the way. Glass, posts and the odd lone block do not stop it.
            const reach = 26 + 7 * Math.sin(this.time * .23 + l.z), drop = l.y - (STREET_Y - 1);
            let dx = ux * reach, dy = -drop, dz = uz * reach;
            const full = Math.hypot(dx, dy, dz); dx /= full; dy /= full; dz /= full;
            const len = this.beamLength(l.x, l.y, l.z, dx, dy, dz, full * 1.25);   // on past where the road should be, for a sunken one
            fx.sprite(3, l.x + dx * len / 2, l.y + dy * len / 2, l.z + dz * len / 2, dx * .01, dy * .01, dz * .01, 2.6, 0, red ? 1.8 : 1, red ? .2 : 1, red ? .15 : 1.1, .05, .035, len / 2);
            if (a < 110) this.queueLight(l.x + dx * (len - .8), l.y + dy * (len - .8) + .6, l.z + dz * (len - .8), 9, red ? 2.2 : 1.6, red ? .25 : 1.6, red ? .2 : 1.7);
          }
          fx.sprite(2, l.x, l.y, l.z, 0, 0, 0, .9, 0, red ? 9 : 5, red ? .8 : 5, red ? .6 : 5.6, .95, .035);
          if (beat && a < 160) this.queueLight(l.x, l.y, l.z, 34, 12 * beat, 1.2 * beat, .9 * beat);
        }
      }
      for (const f of c.fires) {
        const fxd = f.x - px, fzd = f.z - pz;
        if (fxd * fxd + fzd * fzd > 110 * 110) continue;
        if (f.small || f.out) continue;
        const fy = STREET_Y + 1;
        const size = f.big ? 2.3 : 1.3;
        for (let k = this.emitN(f, 'fireAcc', f.big ? 28 : 12, dt); k > 0; k--) fx.fire(f.x + .5 + (rand() - .5) * (f.big ? 3 : 0), fy, f.z + .5 + (rand() - .5) * (f.big ? 3 : 0), size);
        // Wood smoke, a steady stream of it off the top of the flames.
        for (let k = this.emitN(f, 'smokeAcc', f.big ? 8 : 3, dt); k > 0; k--) fx.smoke(f.x + .5 + (rand() - .5) * (f.big ? 1.4 : .3), fy + (f.big ? .7 : .35), f.z + .5 + (rand() - .5) * (f.big ? 1.4 : .3), f.big ? 1.25 : .7, .9, .16, f.big ? .27 : .2);
      }
    }
    for (let i = this.tempLights.length - 1; i >= 0; i--) {
      const l = this.tempLights[i];
      l.t -= dt;
      if (l.t <= 0) { this.tempLights.splice(i, 1); continue; }
      const k = l.t / l.max;
      r.addLight(l.x, l.y, l.z, l.r, l.cr * k, l.cg * k, l.cb * k);
    }
    this.flushLights(px, pz);
  }

  // Looks at a burning floor in the loaded world to find its face: walk out from the middle of the building along the floor slab to
  // its edge, then along the edge both ways for as far as it runs straight. Waits for the chunks to be there.
  findFireFace(f) {
    const W = this.world, y = f.y - 2;   // the burning floor's own slab
    if (!W.isLoaded(f.cx, y, f.cz) || !W.isLoaded(f.fx, y, f.fz)) return;
    let x = Math.round(f.cx), z = Math.round(f.cz), last = null;
    for (let s = 0; s < 90; s++, x += f.dx, z += f.dz) {
      if (!W.isLoaded(x, y, z)) return;
      if (W.get(x, y, z)) last = [x, z];
      else if (last) break;
    }
    if (!last) { f.found = 'none'; return; }
    const ux = f.dz !== 0 ? 1 : 0, uz = f.dx !== 0 ? 1 : 0;
    const edge = (a) => { const ex = last[0] + ux * a, ez = last[1] + uz * a; return W.get(ex, y, ez) && !W.get(ex + f.dx, y, ez + f.dz); };
    let lo = 0, hi = 0;
    while (lo > -14 && edge(lo - 1)) lo--;
    while (hi < 14 && edge(hi + 1)) hi++;
    if (hi - lo < 4) { f.found = 'none'; return; }
    f.fx = last[0]; f.fz = last[1]; f.lo = lo + .5; f.hi = hi - .5; f.half = (hi - lo) / 2;
    f.found = 'yes';
  }

  // How far a beam gets before something stops it: the first solid block that is part of a wall, which is to say it has solid
  // neighbours on most sides across the beam. Glass lets it through.
  beamLength(x, y, z, dx, dy, dz, most) {
    const W = this.world, side = Math.abs(dx) > Math.abs(dz) ? [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] : [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
    const solid = (bx, by, bz) => { const id = W.get(bx, by, bz); return id && !(FLAGS[id] & F_GLASS); };
    for (let t = 1.5; t < most; t += .5) {
      const bx = Math.floor(x + dx * t), by = Math.floor(y + dy * t), bz = Math.floor(z + dz * t);
      if (!solid(bx, by, bz)) continue;
      let n = 0;
      for (const [ax, ay, az] of side) if (solid(bx + ax, by + ay, bz + az)) n++;
      if (n >= 3 || by <= STREET_Y - 1) return t;
    }
    return most;
  }

  queueLight(x, y, z, rad, cr, cg, cb) {
    (this.lightQ || (this.lightQ = [])).push({ x, y, z, rad, cr, cg, cb });
  }

  flushLights(px, pz) {
    const q = this.lightQ;
    if (!q || !q.length) return;
    // Only so many can light the world at once, so the ones that light the most of it get to: how bright and how far it reaches,
    // against how far off it is. Nearest-first let a scatter of little fires from a blast push a burning car's glow out of the street.
    for (const l of q) {
      const d = Math.hypot(l.x - px, l.z - pz);
      l.score = (l.cr + l.cg + l.cb) * l.rad * l.rad / (d + l.rad * .5 + 1);
    }
    q.sort((a, b) => b.score - a.score);
    for (const l of q.slice(0, 11)) this.renderer.addLight(l.x, l.y, l.z, l.rad, l.cr, l.cg, l.cb);
    q.length = 0;
  }

  flareSun() {
    const r = this.renderer;
    if (!r.camPos) return;
    const target = r.sunOcclusion(this.world);
    this.flareVis = damp(this.flareVis, target, 8, .016);
  }

  drawScene(dt, paused) {
    const r = this.renderer, cam = this.cam, P = this.player, gl = r.gl;
    if (this.state === 'loading') {
      cam.x = P.x; cam.y = P.y + 2.4; cam.z = P.z; cam.yaw = P.yaw; cam.pitch = 0; cam.roll = 0;
    }
    r.beginFrame(dt, cam);
    this.actors.reset();
    const asp = r.width / r.height;
    this.horde.fillInstances(r.camPos, r.camForward, asp, cam.fov);
    if (this.state === 'play' || this.state === 'menu') { this.npcs.draw(); this.dogs.draw(this.actors); }
    this.actors.upload(gl);

    // Focus pulls to whatever is under the crosshair.
    const f = r.camForward;
    const hit = this.world.raycast(cam.x, cam.y, cam.z, f[0], f[1], f[2], 260, true);
    const focusT = hit ? Math.max(2.5, hit.dist) : 260;
    this.focusSmooth = damp(this.focusSmooth, focusT, 6, dt);
    r.focus = this.focusSmooth;
    const modal = this.ui.modal;
    const isPlay = this.state === 'play';
    let aperture = 0;
    if (modal === 'dialog' && isPlay && this.ui.dlgNpc) {
      // Rack focus onto the person talking and let the camp fall away behind them.
      const n = this.ui.dlgNpc;
      aperture = .55;
      r.focus = Math.max(1, Math.hypot(n.x - cam.x, n.y + 2 - cam.y, n.z - cam.z));
    } else if (modal && isPlay) { aperture = 1.8; r.focus = 1.2; }
    if (this.state === 'menu') { aperture = .18; r.focus = this.menuFocus || MENU_SHOT.dist; }
    if (this.wakeFx && this.wakeFx.blur > .05) { aperture = this.wakeFx.blur; r.focus = .6; }
    if (isPlay && !P.alive) { aperture = 1.1; r.focus = 1.5; }
    r.aperture = aperture;

    r.renderShadows(this.world, this.far, this.actors);
    r.renderWorld(this.world, this.far,
      (g) => {
        this.actors.draw(g, r);
        this.particles.drawCubes(g, r);
        if (this.state === 'play') this.viewModel.drawThrown(g, r, P);
      },
      (g) => { this.particles.drawSprites(g, r); r.drawBeams(); r.drawRain(); });

    const health = P.health;
    this.fadeK = damp(this.fadeK, 1, 2.4, dt);
    const fx = {
      motion: this.settings.motion ? (isPlay ? .3 : .2) : 0,
      hurt: isPlay ? Math.min(1, Math.max(P.hurtFlash, health < 40 ? (40 - health) / 55 : 0)) : 0,
      sat: isPlay ? .9 - (health < 30 ? (30 - health) / 60 : 0) - P.infection * .002 : .92,
      flash: this.explFlash,
      fade: this.fadeK,
      flareVis: this.flareVis,
      infected: isPlay ? P.infection / 100 : 0,
      // Noticeable in a drizzle, stronger in a downpour, by day only, and weaker indoors.
      rainTint: (this.weather.rain > .04 ? .3 + .45 * Math.min(1, Math.max(0, (this.weather.rain - .2) / .7)) : this.weather.rain / .04 * .3) * (1 - this.renderer.sky.night),   // the grey-blue light of a wet day comes in through the windows too: no less of it indoors
    };
    const drawVM = isPlay && P.alive && !this.wakeFx && modal !== 'dialog' && !(P.ads > .85 && P.weapon && ITEMS[P.weapon].scope);
    r.post(drawVM ? (g) => this.viewModel.draw(g, r, P, paused ? 0 : dt) : null, fx);
    r.lightCount = 0;
    r.spotN = 0;
    r.waterBeamN = 0;
    r.beams.length = 0;
  }
}

const game = new Game();
window.ACEZ = game;
game.boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('error');
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('error-text').textContent = `${e.message}\n\n${e.stack || ''}`;
});
