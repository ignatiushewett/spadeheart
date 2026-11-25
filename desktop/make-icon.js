// Draws the game's icon (the spade from the title, the same as the web page's favicon) into icon.png and icon.ico for the desktop
// window, on a dark rounded square so it shows up on a light taskbar as well as a dark one. Run with: node make-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// The spade, as in the title: a 10 by 12 outline.
const SPADE = [[5, 0], [10, 5.4], [10, 8.2], [8.4, 9.6], [5.9, 8.6], [6.9, 12], [3.1, 12], [4.1, 8.6], [1.6, 9.6], [0, 8.2], [0, 5.4]];
const inside = (x, y) => {
  let c = false;
  for (let i = 0, j = SPADE.length - 1; i < SPADE.length; j = i++) {
    const [xi, yi] = SPADE[i], [xj, yj] = SPADE[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

function draw(N) {
  const px = Buffer.alloc(N * N * 4);
  // The spade as big as the tile allows, with a margin, smoothed at its edges (sampled 4 by 4 a pixel).
  const pad = N * .16, s = (N - pad * 2) / 12, ox = (N - s * 10) / 2, oy = (N - s * 12) / 2, r = N * .16;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = (x + y * N) * 4;
    // The rounded square behind it, so it shows on a light taskbar as well as a dark one.
    const dx = Math.max(0, Math.abs(x + .5 - N / 2) - (N / 2 - r)), dy = Math.max(0, Math.abs(y + .5 - N / 2) - (N / 2 - r));
    const a = Math.max(0, Math.min(1, r - Math.hypot(dx, dy) + .5));
    let cover = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside((x + (sx + .5) / 4 - ox) / s, (y + (sy + .5) / 4 - oy) / s)) cover++;
    const t = cover / 16;
    px[k] = Math.round(22 + (233 - 22) * t); px[k + 1] = Math.round(21 + (228 - 21) * t); px[k + 2] = Math.round(19 + (216 - 19) * t);
    px[k + 3] = Math.round(Math.max(a, t) * 255);
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
