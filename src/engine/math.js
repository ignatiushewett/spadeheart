// Minimal column-major matrix helpers. Matrices are plain Float32Array(16).
export const mat4 = () => new Float32Array(16);

export function identity(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; }

export function multiply(o, a, b) {
  const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
  const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
  for (let i = 0; i < 4; i++) {
    const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
    o[i * 4] = a00 * b0 + a10 * b1 + a20 * b2 + a30 * b3;
    o[i * 4 + 1] = a01 * b0 + a11 * b1 + a21 * b2 + a31 * b3;
    o[i * 4 + 2] = a02 * b0 + a12 * b1 + a22 * b2 + a32 * b3;
    o[i * 4 + 3] = a03 * b0 + a13 * b1 + a23 * b2 + a33 * b3;
  }
  return o;
}

export function perspective(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  o.fill(0);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = 2 * far * near / (near - far);
  return o;
}

export function ortho(o, l, r, b, t, n, f) {
  o.fill(0);
  o[0] = 2 / (r - l);
  o[5] = 2 / (t - b);
  o[10] = -2 / (f - n);
  o[12] = -(r + l) / (r - l);
  o[13] = -(t + b) / (t - b);
  o[14] = -(f + n) / (f - n);
  o[15] = 1;
  return o;
}

export function lookAt(o, ex, ey, ez, cx, cy, cz, ux, uy, uz) {
  let fx = cx - ex, fy = cy - ey, fz = cz - ez;
  let l = Math.hypot(fx, fy, fz) || 1;
  fx /= l; fy /= l; fz /= l;
  let sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux;
  l = Math.hypot(sx, sy, sz) || 1;
  sx /= l; sy /= l; sz /= l;
  const nx = sy * fz - sz * fy, ny = sz * fx - sx * fz, nz = sx * fy - sy * fx;
  o[0] = sx; o[1] = nx; o[2] = -fx; o[3] = 0;
  o[4] = sy; o[5] = ny; o[6] = -fy; o[7] = 0;
  o[8] = sz; o[9] = nz; o[10] = -fz; o[11] = 0;
  o[12] = -(sx * ex + sy * ey + sz * ez);
  o[13] = -(nx * ex + ny * ey + nz * ez);
  o[14] = fx * ex + fy * ey + fz * ez;
  o[15] = 1;
  return o;
}

export function invert(o, m) {
  const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7];
  const i = m[8], j = m[9], k = m[10], l = m[11], n = m[12], p = m[13], q = m[14], r = m[15];
  const b00 = a * f - b * e, b01 = a * g - c * e, b02 = a * h - d * e, b03 = b * g - c * f, b04 = b * h - d * f, b05 = c * h - d * g;
  const b06 = i * p - j * n, b07 = i * q - k * n, b08 = i * r - l * n, b09 = j * q - k * p, b10 = j * r - l * p, b11 = k * r - l * q;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return null;
  det = 1 / det;
  o[0] = (f * b11 - g * b10 + h * b09) * det;
  o[1] = (c * b10 - b * b11 - d * b09) * det;
  o[2] = (p * b05 - q * b04 + r * b03) * det;
  o[3] = (k * b04 - j * b05 - l * b03) * det;
  o[4] = (g * b08 - e * b11 - h * b07) * det;
  o[5] = (a * b11 - c * b08 + d * b07) * det;
  o[6] = (q * b02 - n * b05 - r * b01) * det;
  o[7] = (i * b05 - k * b02 + l * b01) * det;
  o[8] = (e * b10 - f * b08 + h * b06) * det;
  o[9] = (b * b08 - a * b10 - d * b06) * det;
  o[10] = (n * b04 - p * b02 + r * b00) * det;
  o[11] = (j * b02 - i * b04 - l * b00) * det;
  o[12] = (f * b07 - e * b09 - g * b06) * det;
  o[13] = (a * b09 - b * b07 + c * b06) * det;
  o[14] = (p * b01 - n * b03 - q * b00) * det;
  o[15] = (i * b03 - j * b01 + k * b00) * det;
  return o;
}

// Writes the 6 frustum planes (a,b,c,d) of a view-projection matrix into `out`.
export function frustumPlanes(out, m) {
  const set = (i, a, b, c, d) => {
    const l = Math.hypot(a, b, c);
    out[i] = a / l; out[i + 1] = b / l; out[i + 2] = c / l; out[i + 3] = d / l;
  };
  set(0, m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
  set(4, m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
  set(8, m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
  set(12, m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
  set(16, m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
  set(20, m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  return out;
}

export function aabbInFrustum(p, x0, y0, z0, x1, y1, z1) {
  for (let i = 0; i < 24; i += 4) {
    const a = p[i], b = p[i + 1], c = p[i + 2], d = p[i + 3];
    if (a * (a > 0 ? x1 : x0) + b * (b > 0 ? y1 : y0) + c * (c > 0 ? z1 : z0) + d < 0) return false;
  }
  return true;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
