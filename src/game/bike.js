import { SKIN_TONES } from './viewmodel.js';
import { FLAGS, F_GLASS, F_LEAF, M } from '../shared/materials.js';
import { G, WX, WZ, STREET_Y } from '../shared/constants.js';

// Motorbikes. The dev menu puts one down in front of you; from then on it is a thing in the world like any other: walk up to it and
// E gets you on, E again gets you off, and it stays where you leave it, in the save too. A rough old scrambler: knobbly tyres, a
// brass tank gone to rust, a brown leather seat, gold forks and a bare engine. Built from the same small cubes as the people, at the
// same scale, so it stands as big beside you as a real one would, a bit more.

const VS = .125;            // one voxel of the model, in blocks: the same as a person
const MAX = 19, BACK = 5;   // blocks a second, flat out forward and in reverse
const TANK = 2400;          // blocks on a full tank: right across the island and a good way back
const OPEN = 9, OPEN_T = 5; // held flat out and straight, it keeps winding on: this much more, over this many seconds
const TREE = new Set([M.LEAF, M.LEAF2, M.LEAF3]);   // leaves are up in the trees, except in a field, where the crops are made of them too
const WR = 5.5;             // wheel radius, in voxels
const WHEELS = [-10, 10];   // where the hubs are along the bike
const HUB_Y = 5;
const FRONT = 15.5, REAR = 16.5;   // how far the bike reaches, front and back, in voxels
const SEAT = -5;            // where you sit along it
const SIT_EYE = .33;        // how much higher your eyes are, sat on it, than standing on the ground under it
const SHOW = 140;           // drawn within this many blocks of the camera

// Metal: 0 none, 1 painted, 2 bare and worn, 3 polished. The shader puts the sky and the sun in it to match.
const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

// The fixed parts, in voxels: x across (right), y up from the ground, z forward. Each [x, y, z, r, g, b, metal, glow].
const MODEL = (() => {
  const cells = new Map();
  const put = (x, y, z, c, metal = 0, glow = 0) => cells.set(`${x},${y},${z}`, [x, y, z, c[0], c[1], c[2], metal, glow]);
  const line = (x, y0, z0, y1, z1, c, metal = 0) => {
    const n = Math.max(Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
    for (let i = 0; i <= n; i++) put(x, Math.round(y0 + (y1 - y0) * i / n), Math.round(z0 + (z1 - z0) * i / n), c, metal);
  };
  const FRAME = [.1, .1, .11], SILVER = [.74, .74, .76], DARK = [.2, .2, .22], GOLD = [.86, .63, .17], SLIDER = [.13, .13, .14];
  const BRASS = [.66, .5, .3], BRASS_HI = [.78, .63, .4], RUST = [.5, .31, .17], LEATHER = [.46, .23, .13], STITCH = [.33, .15, .09];
  const WRAP = [.72, .6, .42], WRAP_D = [.6, .49, .33], CANVAS = [.52, .45, .3], CANVAS_D = [.42, .36, .24], COPPER = [.66, .45, .25];
  const GREY = [.43, .43, .45], RUBBER = [.06, .06, .06];
  const rusty = (x, y, z) => { const h = hash(x, y, z); return h < .28 ? RUST : h < .8 ? BRASS : BRASS_HI; };

  // Under everything: the engine. A bare four with its fins, a copper clutch cover on the right and a grey one on the left, carbs behind.
  for (let x = -2; x <= 2; x++) for (let y = 3; y <= 6; y++) for (let z = -3; z <= 5; z++) {
    put(x, y, z, x === 2 && y >= 4 && z >= -1 && z <= 3 ? COPPER : x === -2 && y >= 4 && z >= 0 && z <= 4 ? GREY : DARK, 2);
  }
  for (let y = 7; y <= 10; y++) for (let z = -1; z <= 4; z++) for (let x = -3; x <= 3; x++) {
    const fin = y % 2 === 1;
    if (Math.abs(x) === 3 && !fin) continue;   // the fins stand out past the block
    put(x, y, z, fin || y === 10 ? SILVER : DARK, fin || y === 10 ? 3 : 2);
  }
  for (let x = -2; x <= 2; x++) for (let y = 7; y <= 9; y++) put(x, y, -2, y === 9 ? SILVER : DARK, 3);
  for (const x of [-2, -1, 1, 2]) for (let y = 7; y <= 8; y++) put(x, y, -3, SILVER, 3);
  // The frame: a cradle under the engine, a single tube down in front of it, the backbone under the tank, rails back under the seat.
  for (const x of [-1, 1]) for (let z = -3; z <= 6; z++) put(x, 2, z, FRAME, 1);
  line(0, 14, 6, 3, 7, FRAME, 1);
  line(0, 14, 6, 11, -4, FRAME, 1);
  for (const x of [-2, 2]) line(x, 11, -2, 12, -15, FRAME, 1);
  for (const x of [-2, 2]) line(x, 6, -3, 11, -3, FRAME, 1);
  // Chain and sprocket on the left, round the back hub.
  for (let y = 0; y <= 10; y++) for (let z = -15; z <= -5; z++) {
    const d = Math.hypot(y - HUB_Y, z + 10);
    if (d > 1.4 && d <= 2.6) put(-2, y, z, (Math.round(Math.atan2(y - HUB_Y, z + 10) * 3) & 1) ? SILVER : GREY, 3);
  }
  for (let z = -9; z <= -2; z++) { put(-2, 3, z, GREY, 2); put(-2, 7, z, GREY, 2); }
  // Swingarm from the back hub to the pivot behind the engine, and the shocks up to the rails.
  for (const x of [-3, 2]) line(x, 5, -10, 6, -3, FRAME, 1);
  for (const x of [-3, 3]) { line(x, 6, -9, 11, -7, SLIDER, 2); put(x, 12, -7, COPPER, 3); put(x, 7, -9, COPPER, 3); }
  // The tank: brass gone to rust in patches, fat in the middle and narrowing to the seat. Its cap in chrome.
  for (let z = -3; z <= 5; z++) for (let y = 11; y <= 15; y++) for (let x = -2; x <= 2; x++) {
    const ax = Math.abs(x);
    if (ax === 2 && (y === 11 || y === 15 || z === -3 || z === 5)) continue;
    if (y === 15 && (z < -1 || z > 4 || ax > 1)) continue;
    if (z === -3 && y > 13) continue;
    put(x, y, z, rusty(x, y, z), 2);
  }
  for (let x = -1; x <= 1; x++) put(x, 11, -4, FRAME, 1);
  put(0, 16, 2, SILVER, 3);
  // The seat: long and flat, brown leather quilted across, its back end capped.
  for (let z = -15; z <= -4; z++) for (let x = -2; x <= 2; x++) {
    put(x, 12, z, Math.abs(x) === 2 ? STITCH : LEATHER, 0);
    if (z >= -14 && z <= -4) put(x, 13, z, Math.abs(x) === 2 || z % 3 === 0 ? STITCH : LEATHER, 0);
  }
  // Rear mudguard, a little rack with a wooden block on it, and the tail light.
  for (let z = -15; z <= -11; z++) for (let x = -1; x <= 1; x++) put(x, 11, z, rusty(x, 11, z), 2);
  for (let z = -18; z <= -16; z++) for (const x of [-2, 2]) put(x, 12, z, SILVER, 3);
  for (let x = -2; x <= 2; x++) put(x, 12, -18, SILVER, 3);
  for (let x = -1; x <= 1; x++) for (let z = -18; z <= -17; z++) put(x, 13, z, [.42, .28, .16], 0);
  put(0, 11, -17, [.9, .08, .06], 1, .9);
  put(1, 11, -17, [.95, .55, .05], 1, .5);
  put(-1, 11, -17, [.95, .55, .05], 1, .5);
  // Canvas bags hung either side under the seat, flaps and a strap.
  for (const x of [-3, 3]) for (let y = 7; y <= 10; y++) for (let z = -12; z <= -7; z++) {
    put(x, y, z, z === -10 && y >= 8 ? LEATHER : y === 10 ? CANVAS_D : CANVAS, 0);
  }
  for (const x of [-3, 3]) put(x, 8, -10, SILVER, 3);
  // The exhaust: wrapped headers out of the front of the engine, down and back under it, out to the right into a chrome can that
  // rises along under the bag.
  for (const x of [1, 2]) { line(x, 8, 5, 8, 6, WRAP); line(x, 8, 6, 2, 7, WRAP); line(x, 2, 7, 2, -1, WRAP); }
  for (let z = -1; z >= -3; z--) put(3, 2, z, WRAP);
  for (let i = 0; i <= 3; i++) put(3, 3 + (i >> 1), -3 - i, (i & 1) ? WRAP_D : WRAP);
  for (let i = 0; i <= 8; i++) {
    const y = 4 + Math.round(i * .35), z = -7 - i;
    put(4, y, z, SILVER, 3); put(4, y + 1, z, SILVER, 3);
  }
  put(4, 7, -16, DARK, 2); put(4, 8, -16, DARK, 2);
  // Footpegs.
  for (const x of [-3, 3]) for (let z = -5; z <= -4; z++) put(x, 4, z, RUBBER, 0);
  // The forks: gold up top, black sliders down to the front hub, raked back. Clamps across them in polished steel.
  const forkZ = (y) => Math.round(10 - (y - HUB_Y) * .33);
  for (const x of [-2, 2]) for (let y = 4; y <= 17; y++) put(x, y, forkZ(y), y <= 9 ? SLIDER : GOLD, y <= 9 ? 2 : 3);
  for (const y of [14, 17]) for (let x = -2; x <= 2; x++) put(x, y, forkZ(y), SILVER, 3);
  for (let y = 12; y <= 16; y++) put(0, y, forkZ(y), FRAME, 1);
  // The brake caliper on the left, in gold.
  for (let y = 6; y <= 7; y++) put(-2, y, 12, GOLD, 3);
  // Front mudguard, short and rusty.
  for (let z = 7; z <= 13; z++) for (let x = -1; x <= 1; x++) put(x, z >= 12 ? 10 : 11, z, rusty(x, 11, z), 2);
  // The headlamp: a black bucket on the front of the forks, its glass lit.
  for (let x = -2; x <= 2; x++) for (let y = 13; y <= 17; y++) for (let z = 9; z <= 10; z++) {
    if (Math.abs(x) === 2 && (y === 13 || y === 17)) continue;
    const lens = z === 10 && Math.abs(x) <= 1 && y >= 14 && y <= 16;
    put(x, y, z, lens ? [1, .95, .78] : FRAME, lens ? 3 : 2, lens ? 1.4 : 0);
  }
  // Bars: risers off the top clamp, the bar sweeping back at the ends, rubber grips and the levers.
  for (const x of [-1, 1]) put(x, 18, 6, FRAME, 2);
  for (let x = -7; x <= 7; x++) put(x, 19, Math.abs(x) >= 5 ? 5 : 6, Math.abs(x) >= 6 ? RUBBER : FRAME, Math.abs(x) >= 6 ? 0 : 2);
  for (const x of [-5, 5]) put(x, 19, 6, SILVER, 3);

  // What can never be seen, the inside of anything solid, is left out.
  const out = [];
  for (const p of cells.values()) {
    const [x, y, z] = p;
    let shut = true;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (!cells.has(`${x + dx},${y + dy},${z + dz}`)) { shut = false; break; }
    if (!shut) out.push(p);
  }
  return out;
})();

// One wheel, turned to how far it has rolled: a fat knobbly tyre, the rim, five black spokes and a polished hub. The brake disc on the
// front one. They are put together fresh each frame, so they turn.
function wheelCells(front, spin, emit) {
  const TYRE = [.06, .06, .065], KNOB = [.11, .11, .11], RIM = [.09, .09, .1], HUB = [.72, .72, .74], DISC = [.6, .6, .62];
  const zc = front ? WHEELS[1] : WHEELS[0], step = Math.PI * 2 / 22, spoke = Math.PI * 2 / 5;
  // The bottom row is in the ground: the bike sits a voxel down, on a flat of tyre squashed under its weight.
  for (let a = 1; a <= 10; a++) for (let b = 0; b <= 10; b++) {
    const dy = a - 5, dz = b - 5, d = Math.hypot(dy, dz);
    if (d > WR && !(a === 1 && Math.abs(dz) <= 4)) continue;
    const ang = Math.atan2(dy, dz) + spin, z = zc + dz;
    if (d > 3.7) {
      const outer = d > 4.6, k = ((Math.floor(ang / step) % 2) + 2) % 2;
      for (let x = -1; x <= 1; x++) {
        if (outer && x !== 0 && k) continue;   // the knobs stand off the tread in a staggered row
        emit(x, a, z, outer && (x === 0 ? !k : true) ? KNOB : TYRE, 0);
      }
    } else if (d > 3) emit(0, a, z, RIM, 2);
    else if (d <= 1.2) { for (let x = -1; x <= 1; x++) emit(x, a, z, HUB, 3); }
    else {
      const off = ((ang % spoke) + spoke) % spoke, dist = Math.min(off, spoke - off) * d;
      if (dist < .62) emit(0, a, z, RIM, 2);
      if (front && d <= 2.6) emit(-1, a, z, DISC, 3);
    }
  }
}

class Bike {
  constructor(x, y, z, yaw) {
    this.x = x; this.y = y; this.z = z; this.yaw = yaw;
    this.v = 0; this.vy = 0; this.spin = 0; this.rev = 0; this.load = 0; this.straight = 0; this.thrashT = 0;
    this.lean = 0;             // over to the right, in radians: into the turn
    this.fuel = 1;             // how much is in the tank, 0 to 1
    this.sy = y;               // where it is drawn, and you with it: eased up a kerb rather than snapped (it can sink into the step a little)
    this.light = false;        // the headlamp: switched on and off from the bars, and left however you leave it
  }
}

export class Bikes {
  constructor(g) {
    this.g = g;
    this.list = [];
    this.ride = null;          // the one you are on
    this.cubes = new Float32Array(12000 * 9);
    this.n = 0;
  }

  clear() {
    if (this.ride) this.g.audio.engineStop();
    this.list.length = 0;
    this.ride = null;
  }

  toSave() { return this.list.filter((b) => !b.npc && !b.broken && !b.locked).map(b => [+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), +b.yaw.toFixed(3), b.light ? 1 : 0, b.owned ? 1 : 0, +b.fuel.toFixed(3)]); }
  fromSave(s) {
    this.clear();
    if (Array.isArray(s)) for (const [x, y, z, yaw, light, owned, fuel] of s) if (isFinite(x + y + z + yaw)) { const b = new Bike(x, y, z, yaw); b.light = !!light; b.owned = !!owned; b.fuel = isFinite(fuel) ? fuel : 1; this.list.push(b); }
  }

  // A new one stood on the ground a couple of steps in front of you, side on, so you can see it and swing a leg over.
  spawn() {
    const P = this.g.player;
    const x = P.x + Math.sin(P.yaw) * 3, z = P.z - Math.cos(P.yaw) * 3;
    const b = new Bike(x, 0, z, P.yaw + Math.PI / 2);
    b.y = b.sy = this.ground(x, z, P.y + 2);
    this.list.push(b);
    this.trim();
    return b;
  }

  // Never more than a dozen about. The ones you paid for are the last to go.
  trim() {
    while (this.list.length > 12) {
      const i = this.list.findIndex((o) => !o.owned && o !== this.ride);
      this.list.splice(i >= 0 ? i : 0, 1);
    }
  }

  // Bought from a mechanic: one of theirs, wheeled out and stood in the street in front of the garage, side on to it.
  deliver(npc) {
    const g = this.g, W = g.world, c = npc.camp >= 0 ? g.layout.camps[npc.camp] : null;
    const v = c && c.vendors.find((q) => q.role === 'mechanic' && Math.hypot(q.x - npc.x, q.z - npc.z) < 8);
    const vx = v ? v.x : npc.x, vz = v ? v.z : npc.z;
    let ox = 0, oz = 0;
    if (v && v.browse && v.browse.length) {
      for (const p of v.browse) { ox += p.x - vx; oz += p.z - vz; }
    } else { ox = Math.sin(npc.yaw); oz = -Math.cos(npc.yaw); }
    const ol = Math.hypot(ox, oz) || 1;
    ox /= ol; oz /= ol;
    // Along the street: forward is (sin yaw, -cos yaw), and the street runs across the front of the stall.
    const yaw = Math.atan2(-oz, -ox), fx = Math.sin(yaw), fz = -Math.cos(yaw);
    const clear = (x, z, y) => {
      for (let t = -2.1; t <= 2.11; t += .5) {
        const px = Math.floor(x + fx * t), pz = Math.floor(z + fz * t);
        if (W.solid(px, y, pz) || W.solid(px, y + 1, pz) || W.solid(px, y + 2, pz) || Math.abs(this.ground(x + fx * t, z + fz * t, y + 1.5) - y) > .6) return false;
      }
      return !this.list.some((o) => Math.hypot(o.x - x, o.z - z) < 2.6);
    };
    let at = null;
    for (const d of [4.5, 5.5, 3.6, 6.5, 7.5]) {
      for (const s of [0, 2.5, -2.5, 5, -5, 7.5, -7.5]) {
        const x = vx + ox * d - oz * s, z = vz + oz * d + ox * s, y = this.ground(x, z, STREET_Y + 3);
        if (clear(x, z, y)) { at = [x, y, z]; break; }
      }
      if (at) break;
    }
    if (!at) at = [vx + ox * 4.5, this.ground(vx + ox * 4.5, vz + oz * 4.5, STREET_Y + 3), vz + oz * 4.5];
    const b = new Bike(at[0], at[1], at[2], yaw);
    b.owned = true;
    this.list.push(b);
    this.trim();
    return b;
  }

  // The bikes standing near a mechanic that could do with filling, nearest first.
  needingFuel(x, z, r = 30) {
    return this.list.filter((b) => b !== this.ride && b.fuel < .98 && Math.hypot(b.x - x, b.z - z) < r).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }

  // Where yours is, from here.
  whereIs() {
    const P = this.g.player;
    let best = null, bd = 1e9;
    for (const b of this.list) if (b.owned) { const d = Math.hypot(b.x - P.x, b.z - P.z); if (d < bd) { bd = d; best = b; } }
    if (!best) { this.g.ui.toast('Whatever these were the keys to, it is not there any more.'); return; }
    if (bd < 6) { this.g.ui.toast('Your motorbike is right here.'); return; }
    const a = Math.atan2(best.x - P.x, -(best.z - P.z));
    const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
    this.g.ui.toast(`Your motorbike: ${Math.round(bd)} m ${dir}.`);
  }

  mount(b) {
    const P = this.g.player;
    if (this.ride || !b || b.npc) return;
    if (b.broken) { this.g.ui.toast('Wrecked. The engine will not turn over.'); return; }
    if (b.locked) { this.g.ui.toast('No keys. Whoever rode it in still has them.'); return; }
    this.ride = b;
    b.v = 0; b.vy = 0; b.vx = 0; b.vz = 0; b.slip = 0; b.yawRate = 0;
    // Picked up off its side if it went over.
    b.down = 0; b.lean = 0; b.tipping = false; b.tipT = 0;
    // Both hands on the bars: the torch goes away, and comes back out the way it was when you get off.
    this.torchWas = P.flashlight;
    P.flashlight = false;
    P.yaw = b.yaw; P.fly = false; P.crouch = false; P.sitting = false;
    this.seat(b);
    this.g.audio.engineStart(b.x, b.y, b.z);
  }

  // Off on the left, the way you would, or the right if there is no room that side, or failing both, behind it.
  dismount() {
    const b = this.ride, P = this.g.player, W = this.g.world;
    if (!b) return;
    this.ride = null;
    this.g.audio.engineStop();
    const rx = Math.cos(b.yaw), rz = Math.sin(b.yaw), fx = Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const spots = [[-1.4, 0], [1.4, 0], [-2.3, 0], [2.3, 0], [0, -2.6], [0, 2.6]];
    let placed = false;
    for (const [s, f] of spots) {
      const x = b.x + rx * s + fx * f, z = b.z + rz * s + fz * f, y = this.ground(x, z, b.y + 1.5);
      if (Math.abs(y - b.y) <= 1.5 && !W.solid(Math.floor(x), y, Math.floor(z)) && !W.solid(Math.floor(x), y + 1, Math.floor(z)) && !W.solid(Math.floor(x), y + 2, Math.floor(z))) {
        P.x = x; P.z = z; P.y = y; placed = true; break;
      }
    }
    if (!placed) P.y = b.y;
    // Jumping off at speed keeps a little of it.
    P.vx = fx * b.v * .3; P.vz = fz * b.v * .3; P.vy = 0;
    P.eyeSmooth = SIT_EYE;
    P.flashlight = !!this.torchWas;
    // Off it while it is still going, it keeps going without you: weaving off line as it goes, slowing, and once it has run out of
    // speed, down on its side. Stepped off standing still, it stays on its stand.
    b.straight = 0;
    const sp = Math.hypot(b.vx || 0, b.vz || 0);
    b.yawRate = (Math.random() < .5 ? -1 : 1) * (.4 + Math.random() * .6) * Math.min(3, sp * .14);
    b.tipping = sp > 2.5;
  }

  toggleLight() {
    const b = this.ride;
    if (!b) return;
    b.light = !b.light;
    this.g.audio.simple('click');
  }

  // Every lit headlamp near you: a long, hard, white beam well past anything a hand torch does, on whatever it reaches. They go in
  // ahead of the torches people are carrying, which only get what slots are left.
  lights(r) {
    const cam = this.g.player, W = this.g.world;
    let n = 0;
    for (const b of this.list) {
      if (!b.light || n >= 2 || Math.hypot(b.x - cam.x, b.z - cam.z) > 160) continue;
      const fx = Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      const lr = Math.sin(b.lean) * 14.8 * VS, ox = b.x + fx * 11 * VS + Math.cos(b.yaw) * lr, oz = b.z + fz * 11 * VS + Math.sin(b.yaw) * lr;
      const base = b.sy + Math.cos(b.lean) * 14.8 * VS;
      // Everything about the beam is eased from frame to frame, never jumped: driving through a field the crops ahead come and go as
      // they are cut, and a beam that followed every one of them would flicker.
      const now = this.g.time, ldt = Math.min(.1, Math.max(0, now - (b.lampT ?? now)));
      b.lampT = now;
      // In among standing crops the lamp is down at the height of the leaves, and all it would show is a wall of them a few yards
      // off. So there it is taken up over the tops of the crops just ahead and angled down onto them, lighting the field the way it
      // should look: the tops of the rows running away into the dark.
      let crop = 0;
      for (const a of [2, 3.5, 5, 7, 9]) {
        const cx = Math.floor(ox + fx * a), cz = Math.floor(oz + fz * a);
        for (let y = Math.floor(b.y); y < b.y + 5; y++) if (FLAGS[W.get(cx, y, cz)] & F_LEAF) crop = Math.max(crop, y + 1);
      }
      // Held up for a while after the last crop is seen, so a gap in the rows does not drop it and lift it again.
      if (crop > base - .6) { b.cropTop = Math.max(crop + .35, (b.cropHold > 0 && b.cropTop) || 0); b.cropHold = 1.2; }
      else b.cropHold = (b.cropHold || 0) - ldt;
      const liftTo = b.cropHold > 0 && b.cropTop ? Math.max(0, b.cropTop - base) : 0;
      if (b.cropHold <= 0) b.cropTop = 0;
      b.lift = (b.lift || 0) + (liftTo - (b.lift || 0)) * Math.min(1, ldt * 3);
      const oy = base + b.lift, dy = -.045 + (-(oy - b.sy) / 34 + .045) * Math.min(1, b.lift / .4);
      const k = Math.hypot(1, dy), ux = fx / k, uy = dy / k, uz = fz / k, far = 130;
      // Where the beam stops: at the first wall it meets. Not at the crops it shines through, and not where it comes down across open
      // ground, which it goes on lighting all the way out: there, whatever stands up in its path straight ahead is where it ends.
      const reach = (dx, dy2, dz) => {
        let t = .3;
        for (let tries = 0; tries < 24; tries++) {
          const h = W.raycast(ox + dx * t, oy + dy2 * t, oz + dz * t, dx, dy2, dz, far - t, false);
          if (!h) return { dist: far, ground: false };
          const d = t + h.dist;
          if (FLAGS[h.id] & F_LEAF) { t = d + .8; continue; }
          return { dist: d, ground: h.ny > 0 };
        }
        return { dist: far, ground: false };
      };
      const hit = reach(ux, uy, uz), flat = reach(fx, 0, fz);
      const lenTo = Math.max(.5, (hit.ground ? flat.dist : Math.min(hit.dist, flat.dist)) + .3);
      b.len = b.len === undefined ? lenTo : b.len + (lenTo - b.len) * Math.min(1, ldt * (lenTo < b.len ? 5 : 2));
      const len = b.len;
      // Pushed in at the front: everything already there moves down one, and whatever falls off the end goes.
      const S = r.spotPos.length / 4;
      r.spotPos.copyWithin(4, 0, (S - 1) * 4); r.spotDir.copyWithin(4, 0, (S - 1) * 4); r.spotCol.copyWithin(3, 0, (S - 1) * 3);
      // A strength below zero tells the shader it is a long throw.
      r.spotPos.set([ox, oy, oz, -4.6], 0); r.spotDir.set([ux, uy, uz, len], 0); r.spotCol.set([1, .95, .84], 0);
      r.spotN = Math.min(S, r.spotN + 1);
      // The visible shaft starts at the lamp itself, low on the front of the bike, short and faint, not a bar of light over your head.
      r.addBeam(ox, base, oz, fx, -.045, fz, Math.min(len + .5, 45), Math.min(len + .5, 45) * .09, .07, .066, .058);
      r.addLight(ox + fx * 1.2, oy - .3, oz + fz * 1.2, 2.2, .35, .33, .28);
      n++;
    }
  }

  // The bike you are looking at, near enough to get on.
  lookAt(o, f, reach) {
    let best = null, bd = reach;
    for (const b of this.list) {
      if (b === this.ride || b.npc) continue;
      const fx = Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      for (let s = -1.6; s <= 1.61; s += .4) for (const h of [.6, 1.6]) {
        const cx = b.x + fx * s - o[0], cy = b.y + h - o[1], cz = b.z + fz * s - o[2];
        const t = cx * f[0] + cy * f[1] + cz * f[2];
        if (t < 0 || t > bd) continue;
        const px = cx - f[0] * t, py = cy - f[1] * t, pz = cz - f[2] * t;
        if (px * px + py * py + pz * pz < .85 * .85) { best = b; bd = t; }
      }
    }
    return best;
  }

  // The top of whatever is underfoot here, looking down from a little above.
  ground(x, z, from) {
    const W = this.g.world, ix = Math.floor(x), iz = Math.floor(z);
    for (let y = Math.floor(from); y > from - 10; y--) if (W.solid(ix, y, iz)) return y + 1;
    return Math.floor(from - 10);
  }

  update(dt, keys) {
    const b = this.ride;
    this.traffic(dt);
    for (const o of this.list) if (o !== b && !o.npc) {
      // Rolling on with nobody on it: the same road under it as with you on it, spinning out, slowing, knocking down and smashing
      // through whatever it still has the speed for, until it comes to rest and falls over on its side.
      if (Math.hypot(o.vx || 0, o.vz || 0) > .05 || Math.abs(o.yawRate || 0) > .05) this.drive(o, dt, null);
      else { o.vx = o.vz = 0; o.v = 0; o.slip = 0; o.yawRate = 0; }
      // With nobody to hold it up it goes over almost at once, and slides and spins on its side, not upright.
      if (o.tipping && !o.down && (o.tipT = (o.tipT || 0) + dt) > .35) o.down = (o.yawRate || o.lean || 1) > 0 ? -1.3 : 1.3;
      o.lean += ((o.down || 0) - o.lean) * Math.min(1, dt * (o.down ? 3.5 : 3));
      const gy = this.ground(o.x, o.z, o.y + .5);
      if (gy < o.y) { o.vy -= 26 * dt; o.y = Math.max(gy, o.y + o.vy * dt); if (o.y === gy) o.vy = 0; } else if (gy > o.y + .01 && gy - o.y < 1.2) o.y = gy;
      o.sy = o.y;
    }
    if (!b) return;
    const g = this.g, P = g.player;
    const fw = this.drive(b, dt, keys);
    if (this.ride !== b) return;   // thrown off on the way
    // Petrol goes with the miles, a little more with the throttle open, and a trickle just ticking over.
    if (b.fuel > 0) {
      const was = b.fuel;
      b.fuel = Math.max(0, b.fuel - (Math.abs(b.v) * dt * (fw > 0 ? 1.15 : .85) + dt * .15) / TANK);
      if (was > .1 && b.fuel <= .1) g.ui.toast('Petrol is low.', 'bad');
      if (b.fuel > 0) b.dryTold = false;
    }
    // The engine: revs climbing through each gear and dropping back as it changes up, a bit more when you open it up.
    const sp = Math.abs(b.v), gear = MAX / 4.2 + (sp > MAX ? 1.5 : 0), inGear = sp < .3 ? 0 : ((sp % gear) / gear) * .8 + .2;
    const want = Math.min(1, inGear * (sp < gear ? 1 : .9) + (fw ? .12 : 0) + (b.drift ? .15 : 0));
    b.rev += (want - b.rev) * Math.min(1, dt * (want > b.rev ? 5 : 9));
    b.load += ((fw > 0 ? 1 : 0) - b.load) * Math.min(1, dt * 6);
    g.audio.engineSet(b.rev, b.load, b.x, b.y + .8, b.z);
    this.seat(b);
  }

  // One step of a bike on the road, ridden (keys) or not (null). Returns the throttle.
  // It keeps a velocity of its own, in the world, which the tyres pull round to where the bike points: hard, normally, so it goes where
  // it is steered; hardly at all with the handbrake on or a hard turn at speed, so the back steps out and it slides, drifting, with
  // smoke off the back tyre. Slide it too far sideways at speed and it throws you.
  drive(b, dt, keys) {
    const g = this.g, P = g.player, W = g.world, rider = !!keys, isP = rider && b === this.ride;
    if (b.vx === undefined) { b.vx = Math.sin(b.yaw) * (b.v || 0); b.vz = -Math.cos(b.yaw) * (b.v || 0); }
    let fx = Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = Math.cos(b.yaw), rz = Math.sin(b.yaw);
    let long = b.vx * fx + b.vz * fz, lat = b.vx * rx + b.vz * rz;
    // Out of petrol, the throttle does nothing: it coasts, and the brakes still work.
    const dry = b.fuel <= 0;
    const fw = rider ? (keys.KeyW && !dry ? 1 : 0) - (keys.KeyS ? 1 : 0) : 0, st = rider ? (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) : 0;
    const hb = rider && !!keys.Space;
    if (isP && dry && keys.KeyW && !b.dryTold) { b.dryTold = true; g.ui.toast('Out of petrol. A mechanic will fill it up, for a price.', 'bad'); }
    // Flat out in a straight line it keeps winding on past its usual top speed; a turn costs some of that, not all of it at once.
    if (fw > 0 && !st && !hb && long > MAX * .9) b.straight = Math.min(OPEN_T, b.straight + dt);
    else b.straight = Math.max(0, b.straight - dt * (st ? 1 : 1.5));
    const cap = MAX + OPEN * b.straight / OPEN_T;
    if (fw > 0) long += (long < 0 ? 22 : long < MAX ? 10.5 * (1 - Math.max(0, long) / MAX) + 1.4 : 2.8) * dt;
    else if (fw < 0) long -= (long > 0 ? 20 : 5) * dt;
    else long -= Math.sign(long) * Math.min(Math.abs(long), (rider ? 3.2 : b.down ? 7 + Math.abs(long) * .3 : 4 + Math.abs(long) * .25) * dt);
    if (hb) long -= Math.sign(long) * Math.min(Math.abs(long), 8 * dt);
    long = Math.max(-BACK, long);
    if (long > cap) long = Math.max(cap, long - 3 * dt);
    // Steering. A hard turn at speed, or the handbrake, lets the back come round: it turns in quicker, and slides.
    const drifting = rider && Math.abs(long) > 6 && (hb || (st && Math.abs(long) > 15));
    b.drift = drifting;
    let turn;
    if (rider) turn = st * dt * 1.9 * Math.min(1, Math.abs(long) / 3) * Math.sign(long || 1) * (1 - Math.min(.45, Math.abs(long) / MAX * .45)) * (drifting ? 1.5 : 1);
    else { turn = (b.yawRate || 0) * dt; b.yawRate *= 1 - Math.min(1, dt * (Math.hypot(long, lat) > 2 ? .7 : 3)); }
    // The world velocity stays as it was; the bike turns under it, so the same motion is now partly sideways to it.
    const vx0 = b.vx, vz0 = b.vz;
    b.yaw += turn;
    if (isP) P.yaw += turn;
    fx = Math.sin(b.yaw); fz = -Math.cos(b.yaw); rx = Math.cos(b.yaw); rz = Math.sin(b.yaw);
    {
      // Re-measured against where it now points, with this step's throttle and brakes put back in along it.
      const oldLong = vx0 * Math.sin(b.yaw - turn) + vz0 * -Math.cos(b.yaw - turn);
      const dl = long - oldLong;
      long = vx0 * fx + vz0 * fz + dl;
      lat = vx0 * rx + vz0 * rz;
    }
    // The tyres pull the sideways part away. Most of it goes into carrying on along the bike, not lost: a turn costs a little speed.
    const grip = !rider ? 1.4 : drifting ? (hb ? 1.5 : 2.6) : 11;
    const keep = Math.exp(-grip * dt), shed = lat * (1 - keep);
    lat *= keep;
    // Carried on as the same speed, not added to it: the turn bends the motion round, it never speeds it up.
    long = Math.sign(long || 1) * Math.sqrt(long * long + shed * shed * (rider ? .82 : .3) ** 2);
    const speed = Math.hypot(long, lat), slipA = Math.atan2(Math.abs(lat), Math.abs(long) + .001);
    b.vx = fx * long + rx * lat; b.vz = fz * long + rz * lat;
    b.v = long; b.slip = lat;
    // Skidding: smoke off the back tyre and the scream of it.
    if (Math.abs(lat) > 2.2 && speed > 5) {
      const bx = b.x - fx * 10 * VS, bz = b.z - fz * 10 * VS;
      if (Math.random() < Math.min(1, Math.abs(lat) * .12)) g.particles.smoke(bx + (Math.random() - .5) * .6, b.y + .3, bz + (Math.random() - .5) * .6, .8, 0, .55, .3, .5);
      if ((b.skidT = (b.skidT || 0) - dt) <= 0) { g.audio.simple('skid', bx, b.y + .3, bz); b.skidT = .16 + Math.random() * .08; }
    }
    // Too far sideways, too fast: off you come.
    if (isP && speed > 11 && slipA > 1.0) { this.throwOff(b, speed); return fw; }
    // Leaned into the turn, more the faster and tighter it is, further still sliding, and back up as it straightens.
    if (rider) {
      const leanTo = Math.max(-.5, Math.min(.5, long * (turn / Math.max(dt, 1e-3)) * .03 + (drifting ? Math.sign(st) * .08 : 0)));
      b.lean += (leanTo - b.lean) * Math.min(1, dt * 5);
    }
    // Where it is going this step, and what the front of it (whichever way it is moving) runs into.
    const mv = Math.hypot(b.vx, b.vz), mx = mv > .01 ? b.vx / mv : fx, mz = mv > .01 ? b.vz / mv : fz;
    const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt, along = mx * fx + mz * fz;
    const reach = (Math.abs(along) > .6 ? (along > 0 ? FRONT : REAR) : 6) * VS;
    const lx = nx + mx * reach, lz = nz + mz * reach;
    const ny = this.ground(lx, lz, b.y + 1.2), top = Math.max(ny, b.y);
    let blocked = ny > b.y + 1.05;
    for (const [px, pz] of [[lx, lz], [nx, nz]]) for (let k = 1; k <= (rider ? 3 : 2) && !blocked; k++) if (W.solid(Math.floor(px), top + k, Math.floor(pz))) blocked = true;
    if (mv > .01 && blocked) {
      const broke = this.smash(b, lx, lz, mx, mz, mv);
      if (isP) {
        if (!broke && mv > 2.5) { g.audio.simple('thump', lx, b.y + .8, lz); if (mv > 7) g.audio.simple('block', lx, b.y + .8, lz); }
        if (mv > 9) { g.audio.simple('hurt'); P.shake = Math.min(1, P.shake + (broke ? .3 : .5)); }
        if (mv > 12) P.damage((mv - 12) * (broke ? 1.5 : 3), null, null, 'fall');
      } else if (!broke && mv > 2.5) g.audio.simple('thump', lx, b.y + .8, lz);
      // Through it, it loses a good deal of what it had; into something that held, it bounces back off (and, riderless, spins).
      const k = broke ? .55 : -.15;
      b.vx *= k; b.vz *= k;
      if (!rider) b.yawRate = (b.yawRate || 0) + (Math.random() - .5) * mv * .3;
      b.straight = 0;
      b.v = b.vx * fx + b.vz * fz; b.slip = b.vx * rx + b.vz * rz;
    } else {
      b.x = nx; b.z = nz;
      // It sits on the higher of what is under its two wheels.
      const rx2 = b.x - fx * 10 * VS, rz2 = b.z - fz * 10 * VS, fx2 = b.x + fx * 10 * VS, fz2 = b.z + fz * 10 * VS;
      const gy = Math.max(this.ground(rx2, rz2, b.y + 1.2), this.ground(fx2, fz2, b.y + 1.2), this.ground(b.x, b.z, b.y + 1.2));
      if (gy >= b.y) { b.y = gy; b.vy = 0; } else { b.vy -= 26 * dt; b.y = Math.max(gy, b.y + b.vy * dt); if (b.y === gy) b.vy = 0; }
    }
    if (rider) b.sy = b.y < b.sy ? b.y : b.sy + (b.y - b.sy) * Math.min(1, dt * (7 + Math.abs(b.v) * .35));
    b.spin += b.v * dt / (WR * VS);
    this.mow(b, dt);
    // Anything dead in the way goes down under it, if it is going fast enough to matter.
    if (mv > 5) {
      const H = g.horde;
      H.forRadius(b.x + mx * 1.4, b.z + mz * 1.4, 1.2, (i) => {
        if (Math.abs(H.py[i] - b.y) > 1.5) return;
        if (H.damage(i, 60 + mv * 25, false, H.px[i], H.py[i] + 1, H.pz[i]) && isP) P.kills++;
        g.particles.blood(H.px[i], H.py[i] + 1, H.pz[i], mx, .3, mz, 8, 4);
        g.audio.simple('hurt', H.px[i], H.py[i], H.pz[i]);
        b.vx *= .82; b.vz *= .82;
      });
    }
    return fw;
  }

  // Through whatever it hit, if it hit hard enough. The hole is the shape of a crash, not a doorway: a ragged blob round where it struck,
  // wider the harder the hit, shallow front to back, torn at the edges, with the gap the bike needs always in it. Returns how much went.
  smash(b, lx, lz, mx, mz, hit) {
    if (hit <= 11) return 0;
    const g = this.g, W = g.world;
    const dmg = (hit - 9) * 1.15, rx = -mz, rz = mx, ex = lx + mx * .5, ez = lz + mz * .5;
    const cy = b.y + 1.5, R = 1.5 + Math.min(1.5, (hit - 11) * .1), n = Math.ceil(R) + 1;
    const ix = Math.floor(ex), iz = Math.floor(ez);
    let broke = 0;
    for (let dy = -n; dy <= n; dy++) for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      const x = ix + dx, y = Math.floor(cy) + dy, z = iz + dz;
      if (y < Math.floor(b.y)) continue;   // never the ground it is on
      const id = W.get(x, y, z);
      if (!id) continue;
      const px = x + .5 - ex, pu = y + .5 - cy, pz = z + .5 - ez;
      const across = px * rx + pz * rz, deep = px * mx + pz * mz;
      if (deep < -.8) continue;
      let d = Math.hypot(across / R, pu / (R * 1.1), deep / (R * .5)) + (hash(x, y, z) - .5) * .7;
      if (Math.abs(across) < .75 && pu > -1.6 && pu < 1.7 && deep < .9) d = Math.min(d, .45);
      if (d >= 1) continue;
      if (FLAGS[id] & F_GLASS) { g.breakGlass(x, y, z); broke++; continue; }
      if (Math.random() < .5) g.particles.debris(x, y, z, id, 2, 4);
      const gone = W.hit(x, y, z, dmg * (1.35 - d * .55));
      if (gone) { g.onVoxelBroken(x, y, z, gone); broke++; }
    }
    if (broke) { g.audio.simple('smash', ex, b.y + 1, ez); g.horde.noise(b.x, b.z, 30, .8); }
    return broke;
  }

  // Crops go down under it: anything soft and leafy that is not up a tree, the whole plant, anywhere under its length and width.
  // Cut a little ahead of the front wheel, more the faster it goes, so they burst as it hits them and not a moment after.
  mow(b, dt) {
    if (Math.abs(b.v) <= .3 && Math.abs(b.slip || 0) <= .3) return;
    const g = this.g, W = g.world, fx = Math.sin(b.yaw), fz = -Math.cos(b.yaw), dir = Math.sign(b.v || 1);
    const rx = Math.cos(b.yaw), rz = Math.sin(b.yaw), ahead = .05 + Math.abs(b.v) * .055, ground = g.layout.ground;
    let cut = 0;
    const s0 = dir >= 0 ? -REAR * VS : -REAR * VS - ahead, s1 = dir >= 0 ? FRONT * VS + ahead : FRONT * VS, done = new Set();
    for (let s = s0; s <= s1 + .01; s += .35) for (const w of [-.65, 0, .65]) {
      const x = Math.floor(b.x + fx * s + rx * w), z = Math.floor(b.z + fz * s + rz * w), key = x * 8192 + z;
      if (done.has(key)) continue;
      done.add(key);
      const field = x >= 0 && z >= 0 && x < WX && ground[z * WX + x] === G.FIELD;
      for (let y = Math.floor(b.y) - 1, top = y + 7; y <= top; y++) {
        const id = W.get(x, y, z);
        if (!id || !(FLAGS[id] & F_LEAF) || (TREE.has(id) && !field)) continue;
        cut++;
        // A few bits thrown low and off to the sides; none up where they would be in your face.
        if (W.set(x, y, z, 0) && y < b.y + 2 && Math.random() < .6) g.particles.debris(x, y, z, id, 1, 1.6);
      }
    }
    b.thrashT = (b.thrashT || 0) - dt;
    if (cut && b.thrashT <= 0) { g.audio.simple('thrash', b.x + fx * 1.6 * dir, b.y + .6, b.z + fz * 1.6 * dir); b.thrashT = .07 + Math.random() * .06; }
  }

  // Slid out from under you: you go off the side, hurt by how fast it was going, and it carries on without you, spinning.
  throwOff(b, speed) {
    const P = this.g.player;
    const vx = b.vx, vz = b.vz, lat = b.slip || 0;
    this.dismount();
    P.vx = vx * .45; P.vz = vz * .45; P.vy = 5;
    P.damage(6 + speed * .7, null, null, 'fall');
    P.shake = Math.min(1.2, P.shake + .8);
    b.yawRate = Math.sign(lat || 1) * (2.5 + speed * .15);
    b.tipping = true;
    this.g.audio.simple('hurt');
    this.g.ui.toast('Thrown off the motorbike!', 'bad');
  }

  // --- Other people on bikes ----------------------------------------------------------------------------------------------------
  // Now and then, out on the roads: a lone rider passing through, or a raider crew of two to four riding in a line. They keep to the
  // roads the way anyone would, round the bends and through the junctions, not across country. Raiders who spot you pull up, get off
  // and come for you, and take the keys with them. Shoot someone off a bike and it goes down skidding, wrecked: nothing to ride away.
  traffic(dt) {
    const g = this.g, P = g.player, L = g.layout, W = g.world;
    this.trafficT = (this.trafficT ?? 60 + Math.random() * 60) - dt;
    if (this.trafficT <= 0) {
      this.trafficT = 90 + Math.random() * 120;
      const riding = this.list.filter((b) => b.npc).length;
      if (riding < 5 && !g.horde.inCamp(P.x, P.z, 60) && Math.random() < .55) this.spawnTraffic(Math.random() < .68 ? 'wanderer' : 'raider');
    }
    for (const b of this.list.slice()) {
      if (!b.npc) {
        // Wrecks and bikes left by people who got off them do not hang about once you are well away.
        if ((b.broken || b.locked) && Math.hypot(b.x - P.x, b.z - P.z) > 320) this.list.splice(this.list.indexOf(b), 1);
        continue;
      }
      const n = b.npc;
      if (n.dead || !g.npcs.list.includes(n)) { this.unseat(n, true); if (!g.npcs.list.includes(n)) this.list.splice(this.list.indexOf(b), 1); continue; }
      if (Math.hypot(b.x - P.x, b.z - P.z) > 380) {
        // Out of sight, gone on their way.
        this.list.splice(this.list.indexOf(b), 1);
        const i = g.npcs.list.indexOf(n);
        if (i >= 0) g.npcs.list.splice(i, 1);
        continue;
      }
      this.drive(b, dt, this.steerAI(b, dt));
    }
    // Their engines, the nearest few, heard from where they are.
    const near = this.list.filter((b) => b.npc && Math.hypot(b.x - P.x, b.z - P.z) < 110).sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z)).slice(0, 3);
    const on = new Set(near);
    for (const b of near) {
      const sp = Math.abs(b.v || 0), gear = MAX / 4.2;
      b.rev = sp < .3 ? .1 : ((sp % gear) / gear) * .75 + .25;
      g.audio.bikeHum(b, b.x, b.y + .8, b.z, b.rev);
    }
    g.audio.bikeHumsKeep(on);
  }

  // A road cell somewhere out of the way, a ride away from you, and the way the road runs there.
  spawnTraffic(kind) {
    const g = this.g, P = g.player, L = g.layout, W = g.world;
    for (let t = 0; t < 60; t++) {
      const a = Math.random() * 6.283, r = 120 + Math.random() * 60;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 20 || z < 20 || x >= WX - 20 || z >= WZ - 20 || L.ground[z * WX + x] !== G.ROAD || g.horde.inCamp(x, z, 40)) continue;
      // Which way the road runs: the heading with the most road straight ahead of it, and riding towards you rather than away.
      let best = -1, yaw = 0;
      for (let k = 0; k < 16; k++) {
        const h = k / 16 * 6.283;
        let s = 0;
        for (let d = 3; d <= 24; d += 3) { const px = Math.floor(x + Math.sin(h) * d), pz = Math.floor(z - Math.cos(h) * d); if (L.ground[pz * WX + px] === G.ROAD) s++; }
        const toward = Math.sin(h) * (P.x - x) - Math.cos(h) * (P.z - z) > 0 ? 1.5 : 0;
        if (s + toward > best) { best = s + toward; yaw = h; }
      }
      if (best < 6) continue;
      const count = kind === 'raider' ? 2 + Math.floor(Math.random() * 3) : 1, gang = x * 7 + z, night = g.renderer.sky.night > .5;
      let lead = null;
      for (let i = 0; i < count; i++) {
        const bx = x + .5 - Math.sin(yaw) * 7 * i, bz = z + .5 + Math.cos(yaw) * 7 * i, by = this.ground(bx, bz, W.terrainTop(Math.floor(bx), Math.floor(bz)) + 2);
        const b = new Bike(bx, by, bz, yaw);
        b.sy = by;
        b.light = night;
        b.ai = { bias: 0, biasT: 0, lead, trail: [], gone: 0 };
        const n = g.npcs.makeRider(kind, bx, bz, gang);
        b.npc = n; n.onBike = b;
        this.list.push(b);
        lead = lead || b;
      }
      return true;
    }
    return false;
  }

  // Where a rider wants to go next, as the keys they would press. Along the road: of the headings ahead, the one with the most road
  // under it, a little in favour of straight on and, at a junction, of whichever way this rider has a mind to go this time. A crew
  // follows its leader's line at a bike's length or so apart. Raiders who see you stop.
  steerAI(b, dt) {
    const g = this.g, P = g.player, L = g.layout, W = g.world, ai = b.ai, n = b.npc;
    const keys = {};
    const dp = Math.hypot(P.x - b.x, P.z - b.z);
    if (n.kind === 'raider' && !ai.stop && P.alive && dp < 46 && W.los(b.x, b.y + 2.6, b.z, P.x, P.y + 1.8, P.z)) {
      for (const o of this.list) if (o.npc && o.npc.gang === n.gang) o.ai.stop = true;
    }
    if (ai.stop) {
      keys.KeyS = Math.abs(b.v) > .6;
      if (Math.abs(b.v) < 1.5) {
        // Off, and at you. They take the keys.
        b.locked = true;
        this.unseat(n, false);
        n.calm = false;
        g.npcs.raiderAlert(n);
      }
      return keys;
    }
    let want;
    const lead = ai.lead && ai.lead.npc && this.list.includes(ai.lead) ? ai.lead : null;
    if (lead) {
      // Along the leader's line, so many bike lengths back.
      const tr = lead.ai.trail, back = 7 * (1 + this.list.filter((o) => o.ai && o.ai.lead === lead).indexOf(b));
      let tx = lead.x, tz = lead.z, acc = 0;
      for (let i = tr.length - 1; i > 0; i--) {
        acc += Math.hypot(tr[i][0] - tr[i - 1][0], tr[i][1] - tr[i - 1][1]);
        if (acc >= back) { tx = tr[i - 1][0]; tz = tr[i - 1][1]; break; }
      }
      want = Math.atan2(tx - b.x, -(tz - b.z));
      const gap = Math.hypot(lead.x - b.x, lead.z - b.z);
      ai.target = Math.max(0, Math.min(23, lead.v + (gap - back) * .8));
    } else {
      if ((ai.biasT -= dt) <= 0) { ai.bias = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]; ai.biasT = 4 + Math.random() * 6; }
      let best = -1e9, ba = 0;
      for (let a = -1.4; a <= 1.41; a += .175) {
        const h = b.yaw + a;
        let s = 0;
        for (const d of [3, 6, 10, 15, 21, 28]) {
          const cx = b.x + Math.sin(h) * d, cz = b.z - Math.cos(h) * d, x = Math.floor(cx), z = Math.floor(cz);
          if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) { s -= 4; continue; }
          const gr = L.ground[z * WX + x];
          s += gr === G.ROAD ? 2 : gr === G.WALK || gr === G.PLAZA ? .2 : -1.2;
          // Anything standing in the road (a wreck, a bus, a barricade): the whole width of the bike has to clear it, and the
          // nearer it is the more it matters.
          const y = Math.floor(b.y), rxh = Math.cos(h), rzh = Math.sin(h);
          for (const w of [-1.1, 0, 1.1]) {
            const px = Math.floor(cx + rxh * w), pz = Math.floor(cz + rzh * w);
            if (W.solid(px, y, pz) || W.solid(px, y + 1, pz)) { s -= d < 12 ? 9 : 5; break; }
          }
        }
        s -= Math.abs(a) * 1.1;
        s += a * ai.bias * .8;
        if (s > best) { best = s; ba = a; }
      }
      // Nowhere ahead worth riding: round, and back the way it came.
      want = best < 0 ? b.yaw + Math.PI * .9 * (ai.bias || 1) : b.yaw + ba;
      const sharp = Math.abs(ba);
      ai.target = (n.kind === 'raider' ? 20 : 17.5) - sharp * 9;
      if (best < 0) ai.target = 4;
      // The leader leaves a line for the others to follow.
      const last = ai.trail[ai.trail.length - 1];
      if (!last || Math.hypot(last[0] - b.x, last[1] - b.z) > 1.5) { ai.trail.push([b.x, b.z]); if (ai.trail.length > 60) ai.trail.shift(); }
    }
    let d = want - b.yaw;
    while (d > Math.PI) d -= 6.2832;
    while (d < -Math.PI) d += 6.2832;
    if (d > .05) keys.KeyD = true; else if (d < -.05) keys.KeyA = true;
    if (b.v < ai.target) keys.KeyW = true;
    else if (b.v > ai.target + 3) keys.KeyS = true;
    return keys;
  }

  // Off the bike. Shot off (or killed on it): the bike goes down skidding and is wrecked for good. Getting off of their own accord:
  // it stays where they left it, but locked; the keys went with them.
  unseat(n, crash) {
    const b = n.onBike;
    if (!b) return;
    n.onBike = null;
    b.npc = null;
    const sp = Math.hypot(b.vx || 0, b.vz || 0);
    const rx = Math.cos(b.yaw), rz = Math.sin(b.yaw);
    n.x = b.x - rx * 1.2; n.z = b.z - rz * 1.2; n.y = b.y; n.ys = n.yaw = b.yaw;
    n.state = 0;
    if (crash) {
      b.broken = true;
      b.light = false;
      b.yawRate = (Math.random() < .5 ? -1 : 1) * (1.5 + sp * .16);
      b.tipping = true;
      if (sp > 3) n.knock = { t: 0, vx: (b.vx || 0) * .5, vz: (b.vz || 0) * .5, vy: 4 };
    } else {
      b.vx = b.vz = 0; b.v = 0;
    }
  }

  // You go where the seat goes, and sit at the height of it.
  seat(b) {
    const P = this.g.player, side = Math.sin(b.lean) * 2.1;   // leaning with it: your head goes over as far as the bike does
    P.x = b.x + Math.sin(b.yaw) * SEAT * VS + Math.cos(b.yaw) * side; P.z = b.z - Math.cos(b.yaw) * SEAT * VS + Math.sin(b.yaw) * side; P.y = b.sy;
    P.vx = P.vy = P.vz = 0; P.onGround = true; P.eyeSmooth = SIT_EYE;
  }

  // Every bike near enough to see, turned and placed; on the one you ride, your arms out to the grips and your legs down to the pegs.
  build() {
    this.n = 0;
    const c = this.cubes, cam = this.g.player;
    for (const b of this.list) {
      if (Math.hypot(b.x - cam.x, b.z - cam.z) > SHOW) continue;
      const rx = Math.cos(b.yaw), rz = Math.sin(b.yaw), fx = Math.sin(b.yaw), fz = -Math.cos(b.yaw);
      const add = (wx, wy, wz, size, r, g, bl, metal, glow) => {
        if ((this.n + 1) * 9 > c.length) return;
        const k = this.n++ * 9;
        c[k] = wx; c[k + 1] = wy; c[k + 2] = wz; c[k + 3] = size; c[k + 4] = r; c[k + 5] = g; c[k + 6] = bl; c[k + 7] = -b.yaw;
        c[k + 8] = -1 - glow - 4 * metal - 16 * (24 + Math.max(-24, Math.min(24, Math.round(b.lean * 16))));
      };
      // Every voxel on one grid, the same size, sat a hair off the ground: no two faces ever lie in the same place to fight.
      // Leaned over about the line the tyres touch the ground along, the same way the shader leans each voxel.
      const cl = Math.cos(b.lean), sl = Math.sin(b.lean);
      const at = (x, y, z) => {
        const lx = x * cl + (y - .5) * sl, ly = -x * sl + (y - .5) * cl;
        return [b.x + (rx * lx + fx * z) * VS, b.sy + .015 + ly * VS, b.z + (rz * lx + fz * z) * VS];
      };
      const vox = (x, y, z, col, metal, glow = 0) => { const p = at(x, y, z); add(p[0], p[1], p[2], VS * 1.001, col[0], col[1], col[2], metal, glow); };
      for (const [x, y, z, r, g, bl, metal, glow] of MODEL) {
        const p = at(x, y, z);
        // The headlamp's glass: lit when it is on, a dull grey-yellow when it is not.
        if (glow > 1.3 && !b.light) add(p[0], p[1], p[2], VS * 1.001, .55, .53, .45, 3, 0);
        else add(p[0], p[1], p[2], VS * 1.001, r, g, bl, metal, glow);
      }
      wheelCells(false, b.spin, vox);
      wheelCells(true, b.spin, vox);
      if (b !== this.ride) continue;
      const P = this.g.player, e = P.eyePos();
      // One box from a to z, as thick as it says, laid along the line between them at whatever angle that is.
      const limb = (a, z, thick, col) => {
        if ((this.n + 1) * 9 > c.length) return;
        const dx = z[0] - a[0], dy = z[1] - a[1], dz = z[2] - a[2], flat = Math.hypot(dx, dz), len = Math.hypot(flat, dy);
        const pitch = Math.max(-1.57, Math.min(1.57, Math.atan2(dy, flat)));
        const k = this.n++ * 9;
        c[k] = (a[0] + z[0]) / 2; c[k + 1] = (a[1] + z[1]) / 2; c[k + 2] = (a[2] + z[2]) / 2; c[k + 3] = thick;
        c[k + 4] = col[0]; c[k + 5] = col[1]; c[k + 6] = col[2]; c[k + 7] = Math.atan2(dx, dz);
        c[k + 8] = -1000 - (Math.round(len * 100) * 10 + (pitch + 1.6) * 3);
      };
      const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
      const SKIN = hex((SKIN_TONES[P.skin] || SKIN_TONES[1])[0]);
      const SLEEVE = [.22, .21, .18], CUFF = [.15, .14, .12], GLOVE = [.12, .1, .08], JEANS = [.22, .25, .32], BOOT = [.17, .12, .09];
      const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
      const off = (p, s, u, f) => [p[0] + rx * s + fx * f, p[1] + u, p[2] + rz * s + fz * f];
      for (const side of [-1, 1]) {
        // The hand closed round the grip: a glove across it, the bare fingers over the top and down the front.
        const grip = at(side * 6.5, 19, 5);
        limb(off(grip, -side * .07, 0, 0), off(grip, side * .07, 0, 0), .1, GLOVE);
        limb(off(grip, -side * .06, .045, .03), off(grip, side * .06, .045, .03), .045, SKIN);
        // Wrist just behind and in from the grip, the elbow out and down a little, the shoulder under your eye.
        const wrist = off(grip, -side * .02, -.01, -.08);
        const sh = off(e, side * .32, -.62, -.12);
        const elbow = off(lerp(wrist, sh, .5), side * .12, -.1, 0);
        limb(wrist, lerp(wrist, elbow, .2), .1, CUFF);
        limb(lerp(wrist, elbow, .2), elbow, .13, SLEEVE);
        limb(elbow, sh, .15, SLEEVE);
        // Thigh along the tank, shin down to the peg, a boot on it.
        const hip = at(side * 2.2, 15, SEAT), knee = at(side * 3.8, 13.5, 1.5), ankle = at(side * 3.8, 5.5, -4);
        limb(hip, knee, .22, JEANS);
        limb(knee, ankle, .19, JEANS);
        limb(at(side * 3.8, 5, -5.5), at(side * 3.8, 5, -2), .16, BOOT);
      }
    }
  }
}
