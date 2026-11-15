// Draws the game's icon (the same pixel spade as the web page's favicon, read out of index.html) into icon.png and icon.ico for the
// desktop window, on a dark rounded square so it shows up on a light taskbar as well as a dark one. Run with: node make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const icon = html.match(/<link rel="icon"[^>]*href='([^']*)'/)[1];
const svg = decodeURIComponent(icon.replace(/^data:image\/svg\+xml,/, ''));
const [, vw, vh] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
const layers = [...svg.matchAll(/<path fill="#([0-9a-f]{6})" d="([^"]*)"/g)].map(([, col, d]) => ({
  rgb: [0, 2, 4].map((k) => parseInt(col.slice(k, k + 2), 16)),
  rects: [...d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)].map((m) => m.slice(1).map(Number)),
}));

function draw(N) {
  const px = Buffer.alloc(N * N * 4);
  // The spade as big as the tile allows: a thin margin, and scaled to whatever the size is (so at 16 and 24 pixels, where Windows draws
  // it in the title bar, it is still all there rather than nothing).
  const pad = N <= 32 ? 1 : Math.round(N * .07), s = (N - pad * 2) / Math.max(vw, vh);
  const ox = (N - s * vw) / 2, oy = (N - s * vh) / 2, r = N * .16;
  const grid = new Array(vw * vh).fill(null);
  for (const { rgb, rects } of layers) for (const [x0, y0, w, h] of rects) for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) grid[x + y * vw] = rgb;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (x + y * N) * 4;
    // The rounded square behind it, so it shows on a light taskbar as well as a dark one.
    const dx = Math.max(0, Math.abs(x + .5 - N / 2) - (N / 2 - r)), dy = Math.max(0, Math.abs(y + .5 - N / 2) - (N / 2 - r));
    const a = Math.max(0, Math.min(1, r - Math.hypot(dx, dy) + .5));
    px[k] = 22; px[k + 1] = 21; px[k + 2] = 19; px[k + 3] = Math.round(a * 255);
    const u = Math.floor((x + .5 - ox) / s), v = Math.floor((y + .5 - oy) / s);
    const c = u >= 0 && v >= 0 && u < vw && v < vh ? grid[u + v * vw] : null;
    if (c) { px[k] = c[0]; px[k + 1] = c[1]; px[k + 2] = c[2]; px[k + 3] = 255; }
  }
  return png(N, px);
}

function png(N, px) {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((N * 4 + 1) * N);
  for (let y = 0; y < N; y++) px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// An .ico holding PNGs at the sizes Windows asks for.
const sizes = [16, 24, 32, 48, 64, 128, 256], pngs = sizes.map(draw);
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((n, i) => {
  const e = 6 + i * 16;
  head[e] = n >= 256 ? 0 : n; head[e + 1] = n >= 256 ? 0 : n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(pngs[i].length, e + 8); head.writeUInt32LE(off, e + 12); off += pngs[i].length;
});
fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, ...pngs]));
fs.writeFileSync(path.join(__dirname, 'icon.png'), pngs[sizes.length - 1]);
console.log('icon.ico and icon.png written');
