// Every operation gets a banner of its own, drawn once from its name in big square pixels, so the same operation looks the same wherever it turns up.
const W = 130, H = 26;
const PALETTES = [
  ['#2c1410', '#7d3324', '#d59a46'], // rust
  ['#20261a', '#55663a', '#c6b97c'], // olive
  ['#191f25', '#465c6a', '#c6d0cc'], // steel
  ['#271016', '#74293a', '#dfae9c'], // dried blood
  ['#2a200f', '#987028', '#ecd48c'], // ochre
  ['#112120', '#2d6461', '#b6d4c2'], // verdigris
];

const seedOf = (name) => {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

const dice = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// Each of these draws on the dark ground in the mid colour, with the light colour for what catches the eye.
const PATTERNS = [
  // Chevrons, marching across.
  (x, mid, hi, r) => {
    const gap = 10 + Math.floor(r() * 7), off = Math.floor(r() * gap), up = r() < .5 ? 1 : -1;
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const k = (u + up * Math.abs(v - H / 2) + off + 200) % gap;
      if (k < 3) { x.fillStyle = (u + off) % (gap * 3) < gap ? hi : mid; x.fillRect(u, v, 1, 1); }
    }
  },
  // Hazard tape along the top and bottom.
  (x, mid, hi, r) => {
    const band = 5 + Math.floor(r() * 3), step = 6 + Math.floor(r() * 3);
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) {
      const edge = v < band || v >= H - band;
      if ((u + v) % (step * 2) < step) { x.fillStyle = edge ? hi : mid; if (edge || (u + v * 3) % 19 < 2) x.fillRect(u, v, 1, 1); }
    }
  },
  // The skyline, and a low sun behind it.
  (x, mid, hi, r) => {
    const cx = 18 + Math.floor(r() * 94), cy = 11 + Math.floor(r() * 7), rad = 5 + Math.floor(r() * 5);
    x.fillStyle = hi;
    for (let v = 0; v < H; v++) for (let u = 0; u < W; u++) if ((u - cx) ** 2 + (v - cy) ** 2 < rad * rad) x.fillRect(u, v, 1, 1);
    x.fillStyle = mid;
    for (let u = 0; u < W;) {
      const w = 4 + Math.floor(r() * 9), h = 6 + Math.floor(r() * 15);
      x.fillRect(u, H - h, w, h);
      u += w + (r() < .25 ? 1 : 0);
    }
  },
  // A wall with a hole in it, and the crowd coming through.
  (x, mid, hi, r) => {
    const top = 10 + Math.floor(r() * 4), hole = 30 + Math.floor(r() * 70), holeW = 9 + Math.floor(r() * 9);
    x.fillStyle = mid;
    for (let u = 0; u < W; u++) {
      if (u > hole && u < hole + holeW) continue;
      x.fillRect(u, top + (u % 8 < 3 ? -3 : 0), 1, H);
    }
    x.fillStyle = hi;
    for (let k = 0; k < 90; k++) {
      const u = Math.floor(hole + holeW / 2 + (r() - .5) * (22 + k * .7)), v = 2 + Math.floor(r() * 8) + Math.floor(Math.abs(u - hole - holeW / 2) < holeW / 2 ? r() * 14 : 0);
      x.fillRect(u, v, 1, 2);
    }
  },
  // Colour bands, with a block star in the middle of them.
  (x, mid, hi, r) => {
    const vertical = r() < .5, n = 3 + Math.floor(r() * 3);
    x.fillStyle = mid;
    for (let k = 0; k < n; k += 2) {
      if (vertical) x.fillRect(Math.floor(k * W / n), 0, Math.ceil(W / n), H);
      else x.fillRect(0, Math.floor(k * H / n), W, Math.ceil(H / n));
    }
    const cx = 14 + Math.floor(r() * 102), cy = 13;
    x.fillStyle = hi;
    x.fillRect(cx - 6, cy - 2, 13, 5);
    x.fillRect(cx - 2, cy - 7, 5, 15);
    x.fillRect(cx - 4, cy + 3, 3, 3);
    x.fillRect(cx + 2, cy + 3, 3, 3);
  },
  // City blocks seen from above, with a target on one of them.
  (x, mid, hi, r) => {
    const size = 7 + Math.floor(r() * 4);
    x.fillStyle = mid;
    for (let v = 1; v < H; v += size + 2) for (let u = 1; u < W; u += size + 2) if (r() < .82) x.fillRect(u, v, size, size);
    const cx = 15 + Math.floor(r() * 100), cy = 7 + Math.floor(r() * 12), rad = 7;
    x.fillStyle = hi;
    for (let v = -rad; v <= rad; v++) for (let u = -rad; u <= rad; u++) {
      const d = u * u + v * v;
      if ((d <= rad * rad && d >= (rad - 2) * (rad - 2)) || (u === 0 && Math.abs(v) <= rad + 2) || (v === 0 && Math.abs(u) <= rad + 2)) x.fillRect(cx + u, cy + v, 1, 1);
    }
  },
];

const cache = new Map();

export function opBanner(name) {
  if (cache.has(name)) return cache.get(name);
  const seed = seedOf(name), r = dice(seed);
  const [low, mid, hi] = PALETTES[seed % PALETTES.length], draw = PATTERNS[(seed >>> 8) % PATTERNS.length];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = low;
  x.fillRect(0, 0, W, H);
  draw(x, mid, hi, r);
  // Out in the weather: flecks missing, and darker towards the edges so the name reads over the middle.
  x.fillStyle = low;
  for (let k = 0; k < 70; k++) x.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1 + Math.floor(r() * 2), 1);
  x.fillStyle = 'rgba(0,0,0,.34)';
  x.fillRect(0, 0, W, H);
  const url = c.toDataURL();
  cache.set(name, url);
  return url;
}
