// Forward HDR renderer with cascaded sun shadows and an OpenSpades-style cinematic post chain:
// SSAO, motion blur, depth of field, bloom, god rays, lens flare, ACES grading, grain and FXAA.
import * as SH from './shaders.js';
import { mat4, multiply, perspective, ortho, lookAt, invert, identity, frustumPlanes, aabbInFrustum, clamp } from './math.js';
import { CS, WX, WZ, CW, CD, STREET_Y, WATER_Y } from '../shared/constants.js';
import { RAIN_N } from './rainmap.js';
import { PALETTE } from '../shared/materials.js';

export const QUALITY = {
  low: { name: 'Low', shadow: 1024, cascades: 2, ssao: false, rays: false, motion: false, dof: false, volume: false, scale: .85, view: 224 },
  medium: { name: 'Medium', shadow: 1536, cascades: 3, ssao: false, rays: false, motion: false, dof: true, volume: true, scale: 1, view: 288 },
  high: { name: 'High', shadow: 2048, cascades: 3, ssao: true, rays: false, motion: false, dof: true, volume: true, scale: 1, view: 320 },
  ultra: { name: 'Ultra', shadow: 4096, cascades: 3, ssao: true, rays: false, motion: false, dof: true, volume: true, scale: 1, view: 416 },
};

class Program {
  constructor(gl, vs, fs, name) {
    this.gl = gl;
    const p = gl.createProgram();
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        console.error(`Shader ${name}:`, log);
        throw new Error(`Shader ${name} failed: ${log}`);
      }
      gl.attachShader(p, s);
      return s;
    };
    compile(gl.VERTEX_SHADER, vs);
    compile(gl.FRAGMENT_SHADER, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(p);
      console.error(`Program ${name}:`, log);
      throw new Error(`Program ${name} failed: ${log}`);
    }
    this.p = p;
    this.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      this.u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
  }
  use() { this.gl.useProgram(this.p); return this; }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is required to run this game.');
    this.gl = gl;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.quality = { ...QUALITY.high };

    const P = (v, f, n) => new Program(gl, v, f, n);
    this.pChunk = P(SH.CHUNK_VS, SH.CHUNK_FS, 'chunk');
    this.pShadow = P(SH.SHADOW_VS, SH.SHADOW_FS, 'shadow');
    this.pFarShadow = P(SH.FAR_SHADOW_VS, SH.SHADOW_FS, 'farShadow');
    this.pFar = P(SH.FAR_VS, SH.FAR_FS, 'far');
    this.pGround = P(SH.GROUND_VS, SH.GROUND_FS, 'ground');
    this.pWater = P(SH.WATER_VS, SH.WATER_FS, 'water');
    this.pSky = P(SH.FS_VS, SH.SKY_FS, 'sky');
    this.pActor = P(SH.ACTOR_VS, SH.ACTOR_FS, 'actor');
    this.pActorShadow = P(SH.ACTOR_SHADOW_VS, SH.SHADOW_FS, 'actorShadow');
    this.pCube = P(SH.CUBE_VS, SH.CUBE_FS, 'cube');
    this.pSprite = P(SH.SPRITE_VS, SH.SPRITE_FS, 'sprite');
    this.pBox = P(SH.BOX_VS, SH.BOX_FS, 'box');
    this.pSSAO = P(SH.FS_VS, SH.SSAO_FS, 'ssao');
    this.pBlurAO = P(SH.FS_VS, SH.BLUR_AO_FS, 'blurAO');
    this.pMotion = P(SH.FS_VS, SH.MOTION_DOF_FS, 'motion');
    this.pBright = P(SH.FS_VS, SH.BRIGHT_FS, 'bright');
    this.pDown = P(SH.FS_VS, SH.DOWN_FS, 'down');
    this.pUp = P(SH.FS_VS, SH.UP_FS, 'up');
    this.pRays = P(SH.FS_VS, SH.RAYS_FS, 'rays');
    this.pComposite = P(SH.FS_VS, SH.COMPOSITE_FS, 'composite');
    this.pFXAA = P(SH.FS_VS, SH.FXAA_FS, 'fxaa');
    this.pVolume = P(SH.FS_VS, SH.VOLUME_FS, 'volume');
    this.pVolBlit = P(SH.FS_VS, SH.VOLUME_BLIT_FS, 'volumeBlit');
    this.pRain = P(SH.RAIN_VS, SH.RAIN_FS, 'rain');
    this.pBeam = P(SH.BEAM_VS, SH.BEAM_FS, 'beam');
    this.spotN = 0;
    this.spotPos = new Float32Array(SH.MAX_SPOTS * 4);
    this.spotDir = new Float32Array(SH.MAX_SPOTS * 4);
    this.spotCol = new Float32Array(SH.MAX_SPOTS * 3);
    this.beams = [];
    this.waterBeamN = 0;
    this.waterBeamA = new Float32Array(18 * 4);
    this.waterBeamB = new Float32Array(18 * 4);
    this.waterBeamC = new Float32Array(18 * 3);
    this.flood = [0, 0, 0, 0];
    this.floodLamps = new Float32Array(16);

    this.emptyVAO = gl.createVertexArray();

    // Shared quad index buffer for all chunk meshes.
    this.quadIndex = gl.createBuffer();
    this.quadCap = 0;
    this.ensureQuadIndex(160000);

    // Palette
    this.texPalette = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texPalette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, PALETTE);
    this.nearest();

    // Load mask
    this.texMask = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, CW, CD, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(CW * CD));
    this.nearest();

    // Water / ground proxy quads
    const planeVerts = new Float32Array([-6000, -6000, WX + 6000, -6000, WX + 6000, WZ + 6000, -6000, WZ + 6000]);
    this.planeVAO = gl.createVertexArray();
    gl.bindVertexArray(this.planeVAO);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, planeVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.landVAO = gl.createVertexArray();
    gl.bindVertexArray(this.landVAO);
    const lb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, WX, 0, WX, WZ, 0, WZ]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.view = mat4(); this.proj = mat4(); this.viewProj = mat4(); this.invViewProj = mat4();
    this.prevViewProj = mat4(); this.invProj = mat4();
    this.vmProj = mat4();
    // A ray from the eye through a point on the screen (-1..1 each way), in world space.
    this.screenRay = (nx, ny) => {
      const m = this.invViewProj, w = m[3] * nx + m[7] * ny + m[11] * .5 + m[15];
      const x = (m[0] * nx + m[4] * ny + m[8] * .5 + m[12]) / w - this.camPos[0];
      const y = (m[1] * nx + m[5] * ny + m[9] * .5 + m[13]) / w - this.camPos[1];
      const z = (m[2] * nx + m[6] * ny + m[10] * .5 + m[14]) / w - this.camPos[2];
      const l = Math.hypot(x, y, z) || 1;
      return [x / l, y / l, z / l];
    };
    this.shadowMats = [mat4(), mat4(), mat4()];
    this.shadowFlat = new Float32Array(48);
    this.shadowFrame = 0;
    this.planes = new Float32Array(24);
    this.tmpPlanes = new Float32Array(24);
    this.lightPos = new Float32Array(SH.MAX_LIGHTS * 4);
    this.lightCol = new Float32Array(SH.MAX_LIGHTS * 3);
    this.lightCount = 0;
    this.time = 0;
    this.width = 0;
    this.height = 0;
    this.fbos = null;
    // The sharp cascade reaches well past the buildings round you; the others pick up from there.
    this.ranges = [60, 170, 560];
    this.sky = {};
    // Set by the weather each frame; fogK thickens the air on the title screen.
    this.rain = 0; this.wet = 0; this.windX = 0; this.windZ = 0; this.lightning = 0; this.rainVis = 1; this.fogK = 1; this.rainDriftX = 0; this.rainDriftZ = 0;
    this.initCityLights();
    this.setTimeOfDay(.42);
    this.exposure = 1;
    this.focus = 40;
    this.aperture = 0;
    this.stats = { draws: 0, tris: 0 };
    this.sunUV = [0, 0, 0];
    this.createShadowMaps();
  }

  nearest() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  linear() {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  ensureQuadIndex(quads) {
    if (quads <= this.quadCap) return;
    const gl = this.gl;
    const cap = Math.max(quads, this.quadCap * 2);
    const idx = new Uint32Array(cap * 6);
    for (let i = 0, v = 0, k = 0; i < cap; i++, v += 4) {
      idx[k++] = v; idx[k++] = v + 1; idx[k++] = v + 2; idx[k++] = v; idx[k++] = v + 2; idx[k++] = v + 3;
    }
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndex);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.quadCap = cap;
  }

  applyQuality(key, overrides = {}) {
    this.quality = { ...QUALITY[key], ...overrides };
    this.createShadowMaps();
    this.width = 0; // force target rebuild
  }

  createShadowMaps() {
    const gl = this.gl;
    const size = this.quality.shadow;
    if (this.shadowTex && this.shadowSize === size) return;
    if (this.shadowTex) { gl.deleteTexture(this.shadowTex); this.shadowFBOs.forEach((f) => gl.deleteFramebuffer(f)); }
    this.shadowSize = size;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.DEPTH_COMPONENT24, size, size, 3);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFBOs = [0, 1, 2].map((layer) => {
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadowTex, 0, layer);
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      return f;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shadowFrame = 0;
    this.shadowInitFrames = 3;
  }

  makeTarget(w, h, internal, format, type, filter, depthTex) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
    if (filter === 'linear') this.linear(); else this.nearest();
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (depthTex) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
    return { tex, fbo, w, h };
  }

  resize() {
    const gl = this.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // A minimised window reports no size at all, and the post chain still needs something to work with.
    const cw = Math.max(64, Math.floor(this.canvas.clientWidth * dpr));
    const ch = Math.max(64, Math.floor(this.canvas.clientHeight * dpr));
    const sw = Math.max(64, Math.floor(cw * this.quality.scale));
    const sh = Math.max(64, Math.floor(ch * this.quality.scale));
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    if (sw === this.width && sh === this.height) return;
    this.width = sw; this.height = sh;
    if (this.fbos) this.destroyTargets();
    const HF = this.hdr ? [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT] : [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
    const LDR = [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE];
    const makeDepth = (w, h) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT32F, w, h);
      this.nearest();
      return t;
    };
    const depth = makeDepth(sw, sh);
    const depthCopy = makeDepth(sw, sh);
    const f = {
      depth, depthCopy,
      scene: this.makeTarget(sw, sh, ...HF, 'linear', depth),
      cine: null,
      composite: this.makeTarget(sw, sh, ...LDR, 'linear'),
      ao: this.makeTarget(sw >> 1, sh >> 1, ...LDR, 'linear'),
      aoB: this.makeTarget(sw >> 1, sh >> 1, ...LDR, 'linear'),
      rays: this.makeTarget(sw >> 1, sh >> 1, ...LDR, 'linear'),
      vol: this.makeTarget(sw >> 1, sh >> 1, ...HF, 'linear'),
      bloom: [],
      depthCopyFBO: gl.createFramebuffer(),
    };
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.depthCopyFBO);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthCopy, 0);
    // The view model draws over the cinematic buffer with its own depth.
    f.cineDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, f.cineDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, sw, sh);
    f.cine = this.makeTarget(sw, sh, ...HF, 'linear');
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, f.cineDepth);
    let bw = sw >> 1, bh = sh >> 1;
    for (let i = 0; i < 6 && bw > 4 && bh > 4; i++) {
      f.bloom.push(this.makeTarget(bw, bh, ...HF, 'linear'));
      bw >>= 1; bh >>= 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.ao.fbo);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.fbos = f;
  }

  destroyTargets() {
    const gl = this.gl, f = this.fbos;
    const kill = (t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); };
    [f.scene, f.cine, f.composite, f.ao, f.aoB, f.rays, f.vol, ...f.bloom].forEach(kill);
    gl.deleteTexture(f.depth); gl.deleteTexture(f.depthCopy);
    gl.deleteRenderbuffer(f.cineDepth);
    gl.deleteFramebuffer(f.depthCopyFBO);
  }

  updateLoadMask(mask) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texMask);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, CW, CD, gl.RED, gl.UNSIGNED_BYTE, mask.map ? mask.map((v) => v * 255) : mask);
  }

  // All the world's fixed lights live in one low-res map, so a camp can have hundreds of them.
  initCityLights() {
    const gl = this.gl;
    this.lightW = WX >> 2; this.lightH = WZ >> 2;
    this.lightData = new Uint8Array(this.lightW * this.lightH * 4);
    this.texLights = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texLights);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.lightW, this.lightH, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.lightData);
    this.linear();
  }

  paintCityLights(lights) {
    const d = this.lightData, W = this.lightW, H = this.lightH;
    d.fill(0);
    const COL = [[1, .8, .56], [1, .62, .32], [.8, .85, 1], [.85, .4, .5]];
    for (const l of lights) {
      const col = COL[l.k || 0];
      const R = l.r / 4, cx = l.x / 4, cz = l.z / 4;
      for (let z = Math.max(0, Math.floor(cz - R)); z <= Math.min(H - 1, Math.ceil(cz + R)); z++) {
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, Math.ceil(cx + R)); x++) {
          const dd = Math.hypot(x - cx, z - cz) / R;
          if (dd >= 1) continue;
          const v = (1 - dd) * (1 - dd) * 255 * (l.i ?? 1);
          const o = (x + z * W) * 4;
          d[o] = Math.min(255, d[o] + v * col[0]);
          d[o + 1] = Math.min(255, d[o + 1] + v * col[1]);
          d[o + 2] = Math.min(255, d[o + 2] + v * col[2]);
          d[o + 3] = 255;
        }
      }
    }
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texLights);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, d);
  }

  // How much fixed light is falling on a point, for things that are not drawn with the map.
  lightAt(x, z) {
    if (!this.lightData) return [0, 0, 0];
    const lx = Math.floor(x / 4), lz = Math.floor(z / 4);
    if (lx < 0 || lz < 0 || lx >= this.lightW || lz >= this.lightH) return [0, 0, 0];
    const o = (lx + lz * this.lightW) * 4, k = this.sky.cityLightK * 5.5 / 65025;
    const d = this.lightData;
    return [d[o] * d[o] * k, d[o + 1] * d[o + 1] * k, d[o + 2] * d[o + 2] * k];
  }

  setCityMap(rgba, w, h) {
    const gl = this.gl;
    this.texCity = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texCity);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  }

  // t in [0,1): 0 midnight, .25 sunrise, .5 noon, .75 sunset.
  setTimeOfDay(t) {
    const a = (t - .25) * Math.PI * 2;
    const elev = Math.sin(a);
    const s = this.sky;
    let x = Math.cos(a) * .72, y = elev, z = .42;
    const len = Math.hypot(x, y, z);
    x /= len; y /= len; z /= len;
    // Through twilight the light still comes from where the sun is, just under the horizon: the sky brightens over the east before dawn
    // and stays warm in the west after sunset. Only once it is properly dark does the moon take over. Before, the moon took over the
    // moment the sun dipped, and the twilight glow went with it: a little orange sun setting in the west in the hour before sunrise.
    const up = elev > -.28;
    s.sunDir = up ? [x, Math.max(y, .06), z] : [-x, Math.max(-y, .12), -z * .6];
    s.sunUp = clamp((elev + .04) / .07, 0, 1);   // how much of the disc itself is above the horizon
    const l2 = Math.hypot(...s.sunDir);
    s.sunDir = s.sunDir.map((v) => v / l2);
    const ss = (e0, e1, v) => { const k = clamp((v - e0) / (e1 - e0), 0, 1); return k * k * (3 - 2 * k); };
    // Slow ends to the day: a long golden hour going down into a long dusk, and the same back up in the morning. The day itself is
    // just as long; it is the turning from light to dark, and back, that takes its time.
    const day = ss(-.12, .42, elev);
    const dusk = ss(.58, .06, Math.abs(elev)) * ss(-.4, -.04, elev);
    const night = 1 - ss(-.34, .1, elev);
    const mix3 = (a0, b0, k) => [a0[0] + (b0[0] - a0[0]) * k, a0[1] + (b0[1] - a0[1]) * k, a0[2] + (b0[2] - a0[2]) * k];
    // A sun that seldom breaks through, under a low dirty ceiling. After dark there is no fill at all.
    let sunCol = mix3([1.75, 1.66, 1.5], [1.9, .92, .42], dusk);
    sunCol = mix3(sunCol, [0, 0, 0], night);
    let skyCol = mix3([.68, .71, .74], [.32, .27, .3], dusk);
    skyCol = mix3(skyCol, [.0014, .0017, .0026], night);
    let hor = mix3([.62, .63, .61], [.72, .42, .28], dusk);
    hor = mix3(hor, [.0016, .002, .0032], night);
    let gnd = mix3([.32, .3, .27], [.15, .11, .1], dusk);
    gnd = mix3(gnd, [.0006, .0006, .0009], night);
    s.sunCol = sunCol;
    s.skyCol = skyCol;
    s.horizon = hor;
    s.ground = gnd;
    s.fog = mix3(hor, skyCol, .35).map((v) => v * .72);
    // Rain takes the sun away by degrees. A light shower still leaves a decent day.
    const wet = this.rain || 0;
    const dim = 1 - wet * .86, flash = this.lightning || 0;
    s.sunCol = sunCol.map((v) => v * dim);
    const overcast = (c, keep) => mix3(c, [c[1] * keep, c[1] * keep * 1.01, c[1] * keep * 1.05], wet);
    s.skyCol = overcast(skyCol, .62).map((v, i) => v + [.72, .78, 1][i] * flash * .9);
    s.horizon = overcast(hor, .68).map((v, i) => v + [.6, .65, .85][i] * flash * .55);
    s.ground = gnd.map((v) => v * (1 - wet * .3));
    s.fog = overcast(s.fog, .72).map((v, i) => v + [.4, .44, .6][i] * flash * .5);
    s.wet = this.wet || 0;
    s.night = night;
    s.day = day;
    s.fogDensity = (.0021 + night * .0007) * (1 + wet * 1.5 + (this.rain || 0) * 1.2) * (this.fogK || 1);
    s.cityLightK = ss(.4, -.1, elev);
    s.isSun = elev > -.04;
    this.nightGlow = night;
  }

  beginFrame(dt, cam) {
    this.time += dt;
    // Water runs down glass and walls at its own pace: a slow crawl in a drizzle, quick in a downpour. Kept as its own clock so a change
    // in the rain changes the speed, not where every run is.
    const rn = this.rain || 0;
    this.runTime = (this.runTime || 0) + dt * (.35 + .65 * Math.min(1, Math.max(0, (rn - .12) / .6)));
    this.resize();
    const asp = this.width / this.height;
    this.prevViewProj.set(this.viewProj);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    // yaw 0 faces -z (north); yaw grows to the right.
    const fx = sy * cp, fy = sp, fz = -cy * cp;
    this.camForward = [fx, fy, fz];
    this.camPos = [cam.x, cam.y, cam.z];
    const rollX = Math.cos(cam.yaw) * Math.sin(cam.roll || 0), rollZ = Math.sin(cam.yaw) * Math.sin(cam.roll || 0);
    lookAt(this.view, cam.x, cam.y, cam.z, cam.x + fx, cam.y + fy, cam.z + fz, rollX, Math.cos(cam.roll || 0), rollZ);
    perspective(this.proj, cam.fov, asp, .2, 9000);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.invViewProj, this.viewProj);
    invert(this.invProj, this.proj);
    frustumPlanes(this.planes, this.viewProj);
    perspective(this.vmProj, 1.22, asp, .05, 20);
    this.asp = asp;
    this.stats.draws = 0;
    this.stats.tris = 0;
    this.spot = this.spot || 0;
  }

  addLight(x, y, z, radius, r, g, b) {
    if (this.lightCount >= SH.MAX_LIGHTS) return;
    const i = this.lightCount++;
    this.lightPos[i * 4] = x; this.lightPos[i * 4 + 1] = y; this.lightPos[i * 4 + 2] = z; this.lightPos[i * 4 + 3] = radius;
    this.lightCol[i * 3] = r; this.lightCol[i * 3 + 1] = g; this.lightCol[i * 3 + 2] = b;
  }

  // Someone else's torch, on whatever it reaches. Only a few light the world; every one of them gets a beam.
  addSpot(x, y, z, dx, dy, dz, range, k, r, g, b) {
    if (this.spotN >= SH.MAX_SPOTS) return;
    const i = this.spotN++;
    this.spotPos.set([x, y, z, k], i * 4);
    this.spotDir.set([dx, dy, dz, range], i * 4);
    this.spotCol.set([r, g, b], i * 3);
  }

  addBeam(x, y, z, dx, dy, dz, len, wide, r, g, b) {
    this.beams.push({ x, y, z, dx, dy, dz, len, wide, r, g, b });
  }

  // The ones the water can see. Only some can: a beam behind a wall has no reflection, whatever the sums say.
  addWaterBeam(x, y, z, dx, dy, dz, len, wide, r, g, b) {
    if (this.waterBeamN >= 18) return;
    const i = this.waterBeamN++;
    this.waterBeamA.set([x, y, z, wide], i * 4);
    this.waterBeamB.set([dx, dy, dz, len], i * 4);
    this.waterBeamC.set([r, g, b], i * 3);
  }

  drawBeams() {
    const gl = this.gl;
    if (!this.beams.length) return;
    const p = this.pBeam.use();
    this.frameUniforms(p, false);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.depthCopy);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.u.uDepth, 4);
    gl.uniform2f(p.u.uResolution, this.width, this.height);
    gl.uniform2f(p.u.uNearFar, .2, 9000);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.emptyVAO);
    for (const b of this.beams) {
      gl.uniform3f(p.u.uBeamPos, b.x, b.y, b.z);
      gl.uniform4f(p.u.uBeamDir, b.dx, b.dy, b.dz, b.len);
      gl.uniform1f(p.u.uBeamWide, b.wide);
      gl.uniform3f(p.u.uBeamCol, b.r, b.g, b.b);
      gl.drawArrays(gl.TRIANGLES, 0, 18 * 6);
    }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    this.stats.draws += this.beams.length;
  }

  frameUniforms(p, withLighting = true) {
    const gl = this.gl, u = p.u, s = this.sky;
    gl.uniformMatrix4fv(u.uViewProj, false, this.viewProj);
    if (u.uCam) gl.uniform3fv(u.uCam, this.camPos);
    if (u.uSunDir) gl.uniform3fv(u.uSunDir, s.sunDir);
    if (u.uSunCol) gl.uniform3fv(u.uSunCol, s.sunCol);
    if (u.uSkyCol) gl.uniform3fv(u.uSkyCol, s.skyCol);
    if (u.uHorizon) gl.uniform3fv(u.uHorizon, s.horizon);
    if (u.uGroundCol) gl.uniform3fv(u.uGroundCol, s.ground);
    if (u.uFogCol) gl.uniform3fv(u.uFogCol, this.underwater ? [.01, .06, .08] : s.fog);
    if (u.uFogDensity) gl.uniform1f(u.uFogDensity, this.underwater ? .09 : s.fogDensity);
    if (u.uTime) gl.uniform1f(u.uTime, this.time);
    if (u.uWet) gl.uniform1f(u.uWet, s.wet || 0);
    if (u.uRainNow) gl.uniform1f(u.uRainNow, this.rain || 0);
    if (u.uRunTime) gl.uniform1f(u.uRunTime, (this.runTime || 0) % 10000);
    if (u.uCrackPts) gl.uniform4fv(u.uCrackPts, this.crackPts || (this.crackPts = new Float32Array(64).fill(-1)));
    if (u.uNightGlow) gl.uniform1f(u.uNightGlow, this.nightGlow);
    if (!withLighting) return;
    if (u.uShadow) {
      gl.activeTexture(gl.TEXTURE7);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowTex);
      gl.uniform1i(u.uShadow, 7);
      gl.uniformMatrix4fv(u.uShadowMat, false, this.shadowFlat);
      gl.uniform3f(u.uShadowRange, this.ranges[0] * .9, this.ranges[1] * .9, this.quality.cascades === 2 ? this.ranges[1] : this.ranges[2]);
      gl.uniform1i(u.uShadowOn, this.sky.night > .97 ? 0 : 1);
    }
    if (u.uCityLight) {
      gl.activeTexture(gl.TEXTURE6);
      gl.bindTexture(gl.TEXTURE_2D, this.texLights);
      gl.uniform1i(u.uCityLight, 6);
      gl.uniform1f(u.uCityLightK, s.cityLightK);
    }
    if (u.uFlood) {
      gl.uniform4fv(u.uFlood, this.flood);
      if (this.flood[3] > 0) gl.uniform4fv(u.uFloodLamp, this.floodLamps);
    }
    if (u.uLightCount !== undefined && u.uLightCount !== null) {
      gl.uniform1i(u.uLightCount, this.lightCount);
      if (this.lightCount) {
        gl.uniform4fv(u.uLightPos, this.lightPos);
        gl.uniform3fv(u.uLightCol, this.lightCol);
      }
      gl.uniform4f(u.uSpotPos, this.camPos[0], this.camPos[1], this.camPos[2], this.spot);
      gl.uniform3fv(u.uSpotDir, this.camForward);
      gl.uniform1i(u.uSpotN, this.spotN);
      if (this.spotN) {
        gl.uniform4fv(u.uSpots, this.spotPos);
        gl.uniform4fv(u.uSpotDirs, this.spotDir);
        gl.uniform3fv(u.uSpotCols, this.spotCol);
      }
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  cascadeMatrix(i, range) {
    const s = this.sky.sunDir;
    const cam = this.camPos, f = this.camForward;
    const cx0 = cam[0] + f[0] * range * .35, cz0 = cam[2] + f[2] * range * .35;
    const cy0 = Math.max(STREET_Y, cam[1]);
    const depth = 900;
    const tmp = this.tmpMat || (this.tmpMat = mat4());
    lookAt(tmp, cx0 + s[0] * depth * .5, cy0 + s[1] * depth * .5, cz0 + s[2] * depth * .5, cx0, cy0, cz0, 0, 1, 0);
    // Snap the light-space origin to whole texels so shadow edges do not shimmer.
    const texel = (range * 2) / this.shadowSize;
    const lx = tmp[0] * cx0 + tmp[4] * cy0 + tmp[8] * cz0 + tmp[12];
    const ly = tmp[1] * cx0 + tmp[5] * cy0 + tmp[9] * cz0 + tmp[13];
    tmp[12] += Math.round(lx / texel) * texel - lx;
    tmp[13] += Math.round(ly / texel) * texel - ly;
    const pr = this.tmpOrtho || (this.tmpOrtho = mat4());
    ortho(pr, -range, range, -range, range, 1, depth * 1.6);
    multiply(this.shadowMats[i], pr, tmp);
    this.shadowFlat.set(this.shadowMats[i], i * 16);
  }

  renderShadows(world, far, actors, force) {
    const gl = this.gl;
    if (this.sky.night > .97) return;   // no moonlight: nothing to cast from
    const count = this.quality.cascades;
    this.shadowFrame++;
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.5, 2.5);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    for (let i = 0; i < count; i++) {
      if (!force && this.shadowInitFrames <= 0) {
        if (i === 1 && this.shadowFrame % 3 !== 0) continue;
        if (i === 2 && this.shadowFrame % 40 !== 7) continue;
      }
      const range = this.ranges[i];
      this.cascadeMatrix(i, range);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFBOs[i]);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      frustumPlanes(this.tmpPlanes, this.shadowMats[i]);
      // The shadow frustum's near plane must not clip casters; drop it.
      this.tmpPlanes[16] = 0; this.tmpPlanes[17] = 0; this.tmpPlanes[18] = 0; this.tmpPlanes[19] = 1;
      this.pShadow.use();
      gl.uniformMatrix4fv(this.pShadow.u.uMat, false, this.shadowMats[i]);
      const uo = this.pShadow.u.uOrigin;
      world.forEachMesh((c) => {
        if (!c.oq) return;
        const x = c.cx * CS, y = c.cy * CS, z = c.cz * CS;
        if (!aabbInFrustum(this.tmpPlanes, x, y, z, x + CS, y + CS, z + CS)) return;
        gl.uniform3f(uo, x, y, z);
        gl.bindVertexArray(c.vao);
        gl.drawElements(gl.TRIANGLES, c.oq * 6, gl.UNSIGNED_INT, 0);
        this.stats.draws++;
      });
      if (i >= 1 && far) {
        this.pFarShadow.use();
        gl.uniformMatrix4fv(this.pFarShadow.u.uMat, false, this.shadowMats[i]);
        far.drawShadow(gl, this.tmpPlanes);
      }
      if (i === 0 && actors) {
        this.pActorShadow.use();
        gl.uniformMatrix4fv(this.pActorShadow.u.uMat, false, this.shadowMats[0]);
        actors.drawShadow(gl);
      }
    }
    this.shadowInitFrames--;
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.bindVertexArray(null);
  }

  renderWorld(world, far, drawOpaqueExtras, drawTransparentExtras, drawFinalLayer, opts) {
    const gl = this.gl, f = this.fbos;
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.scene.fbo);
    gl.viewport(0, 0, this.width, this.height);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Chunks (front to back for early-z)
    const p = this.pChunk.use();
    this.frameUniforms(p);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texPalette);
    gl.uniform1i(p.u.uPalette, 1);
    gl.uniform1i(p.u.uGlassPass, 0);
    this.bindRainMap(p); this.bindBlood(p);
    gl.activeTexture(gl.TEXTURE0);
    const visible = this.visible || (this.visible = []);
    visible.length = 0;
    const cam = this.camPos;
    world.forEachMesh((c) => {
      const x = c.cx * CS, y = c.cy * CS, z = c.cz * CS;
      if (!aabbInFrustum(this.planes, x, y, z, x + CS, y + CS, z + CS)) return;
      const dx = x + 16 - cam[0], dy = y + 16 - cam[1], dz = z + 16 - cam[2];
      c.camDist = dx * dx + dy * dy + dz * dz;
      visible.push(c);
    });
    visible.sort((a, b) => a.camDist - b.camDist);
    for (const c of visible) {
      if (!c.oq) continue;
      gl.uniform3f(p.u.uOrigin, c.cx * CS, c.cy * CS, c.cz * CS);
      gl.bindVertexArray(c.vao);
      gl.drawElements(gl.TRIANGLES, c.oq * 6, gl.UNSIGNED_INT, 0);
      this.stats.draws++;
      this.stats.tris += c.oq * 2;
    }

    // Far proxies
    if (far) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.texMask);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.texCity);
      gl.activeTexture(gl.TEXTURE0);
      const pf = this.pFar.use();
      this.frameUniforms(pf);
      gl.uniform1i(pf.u.uLoadMask, 2);
      gl.uniform2f(pf.u.uWorldSize, WX, WZ);
      far.draw(gl, this.planes);
      const pg = this.pGround.use();
      this.frameUniforms(pg);
      gl.uniform1i(pg.u.uLoadMask, 2);
      gl.uniform1i(pg.u.uCityMap, 3);
      gl.uniform2f(pg.u.uWorldSize, WX, WZ);
      gl.uniform1f(pg.u.uY, STREET_Y - .5);
      gl.bindVertexArray(this.landVAO);
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      gl.enable(gl.CULL_FACE);
    }

    if (drawOpaqueExtras) drawOpaqueExtras(gl);

    // Sky fills what is left, drawn at the far plane.
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    const ps = this.pSky.use();
    this.frameUniforms(ps, false);
    gl.uniformMatrix4fv(ps.u.uInvViewProj, false, this.invViewProj);
    gl.uniform1f(ps.u.uNight, this.sky.night);
    if (ps.u.uSunUp) gl.uniform1f(ps.u.uSunUp, this.sky.sunUp ?? 1);
    gl.uniform1f(ps.u.uStars, this.stars ?? 1);
    gl.uniform1f(ps.u.uCloud, 1.05 + this.rain * 1.1);
    gl.bindVertexArray(this.emptyVAO);
    gl.depthFunc(gl.LEQUAL);
    this.drawFullscreenAtFar(gl);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);

    // Water
    if (!this.underwater) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const pw = this.pWater.use();
      this.frameUniforms(pw);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.texCity);
      gl.activeTexture(gl.TEXTURE0);
      if (pw.u.uCityMap) gl.uniform1i(pw.u.uCityMap, 3);
      if (pw.u.uWorldSize) gl.uniform2f(pw.u.uWorldSize, WX, WZ);
      gl.uniform1f(pw.u.uY, WATER_Y);
      gl.uniform1i(pw.u.uWaterBeamN, this.waterBeamN);
      if (this.waterBeamN) {
        gl.uniform4fv(pw.u.uWaterBeamA, this.waterBeamA);
        gl.uniform4fv(pw.u.uWaterBeamB, this.waterBeamB);
        gl.uniform3fv(pw.u.uWaterBeamC, this.waterBeamC);
      }
      gl.bindVertexArray(this.planeVAO);
      gl.disable(gl.CULL_FACE);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
      gl.enable(gl.CULL_FACE);
    }

    // Copy depth for soft particles and post effects.
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, f.scene.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, f.depthCopyFBO);
    gl.blitFramebuffer(0, 0, this.width, this.height, 0, 0, this.width, this.height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f.scene.fbo);

    // Glass, back to front
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const pg2 = this.pChunk.use();
    this.frameUniforms(pg2);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texPalette);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(pg2.u.uGlassPass, 1);
    this.bindRainMap(pg2); this.bindBlood(pg2);
    // Both sides of glass: the back of a pane only ever shows the rain on its outside, and is thrown away otherwise.
    gl.disable(gl.CULL_FACE);
    for (let i = visible.length - 1; i >= 0; i--) {
      const c = visible[i];
      if (!c.gq) continue;
      gl.uniform3f(pg2.u.uOrigin, c.cx * CS, c.cy * CS, c.cz * CS);
      gl.bindVertexArray(c.vao);
      gl.drawElements(gl.TRIANGLES, c.gq * 6, gl.UNSIGNED_INT, c.oq * 6 * 4);
    }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    if (drawTransparentExtras) drawTransparentExtras(gl);
    gl.bindVertexArray(null);
  }

  // Blood on the ground round the camera: how much (r) and the height of the surface it is on (g), a block to a texel.
  bindBlood(p) {
    const gl = this.gl, b = this.blood;
    if (!p.u.uBloodO) return;
    if (!b) { gl.uniform3f(p.u.uBloodO, 0, 0, 0); return; }
    if (!this.texBlood) {
      this.texBlood = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texBlood);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, b.N, b.N, 0, gl.RG, gl.UNSIGNED_BYTE, b.data);
      this.bloodV = b.version;
    }
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.texBlood);
    if (this.bloodV !== b.version) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, b.N, b.N, gl.RG, gl.UNSIGNED_BYTE, b.data);
      this.bloodV = b.version;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.u.uBlood, 9);
    gl.uniform3f(p.u.uBloodO, b.x0, b.z0, b.N);
  }

  bindRainMap(p) {
    const gl = this.gl, m = this.rainMap;
    if (!p.u.uRainMapO) return;
    if (!m) { gl.uniform3f(p.u.uRainMapO, 0, 0, 0); return; }
    if (!this.texRainMap) {
      this.texRainMap = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texRainMap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, RAIN_N, RAIN_N, 0, gl.RGBA, gl.UNSIGNED_BYTE, m.packed());
      this.rainMapV = m.version;
    }
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.texRainMap);
    if (this.rainMapV !== m.version) {
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, RAIN_N, RAIN_N, gl.RGBA, gl.UNSIGNED_BYTE, m.packed());
      this.rainMapV = m.version;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.u.uRainMap, 8);
    gl.uniform3f(p.u.uRainMapO, m.x0, m.z0, RAIN_N);
  }

  drawRain() {
    const gl = this.gl, k = this.rain * this.rainVis;
    if (k < .01 || this.underwater) return;
    const p = this.pRain.use();
    this.frameUniforms(p);
    gl.uniform3f(p.u.uWindRain, this.windX, this.windZ, Math.min(1, this.rain * 1.4));
    gl.uniform2f(p.u.uRainDrift, this.rainDriftX, this.rainDriftZ);
    // Light rain gets a little more body than its share; a downpour is left as it is.
    const light = Math.min(1, this.rain / .3) * (1 - Math.min(1, Math.max(0, (this.rain - .3) / .45)));
    gl.uniform1f(p.u.uRainAlpha, (.22 + this.rain * .4 + light * .09) * (1 + Math.max((this.rainIndoor || 0) * 1.6, this.rainNight || 0)));
    gl.uniform1f(p.u.uRainFloor, this.rainFloor || 0);
    if (p.u.uRainFloorV) gl.uniform1f(p.u.uRainFloorV, this.rainFloor || 0);
    this.bindRainMap(p); this.bindBlood(p);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.emptyVAO);
    if (p.u.uRainFar) gl.uniform1f(p.u.uRainFar, 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.floor(this.rain * 6500 + (Math.min(1, this.rain / .3) * (1 - Math.min(1, Math.max(0, (this.rain - .3) / .45)))) * 700) + 200);
    // And the rain further off, out to a hundred blocks or so: a wider box, thinner on the ground, only drawn past where the near one fades.
    if (p.u.uRainFar) {
      gl.uniform1f(p.u.uRainFar, 1);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, Math.floor(this.rain * 9000) + 300);
    }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  drawFullscreenAtFar(gl) {
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bindSpriteUniforms(p) {
    const gl = this.gl;
    // With the lights: smoke is lit by the fire under it and the lamps around it, worked out once per puff.
    this.frameUniforms(p, true);
    const v = this.view;
    gl.uniform3f(p.u.uRight, v[0], v[4], v[8]);
    gl.uniform3f(p.u.uUp, v[1], v[5], v[9]);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.fbos.depthCopy);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(p.u.uDepth, 4);
    gl.uniform2f(p.u.uResolution, this.width, this.height);
    gl.uniform2f(p.u.uNearFar, .2, 9000);
  }

  post(viewModelDraw, fx) {
    const gl = this.gl, f = this.fbos, q = this.quality;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    gl.bindVertexArray(this.emptyVAO);
    const fs = () => gl.drawArrays(gl.TRIANGLES, 0, 3);
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    const target = (t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.viewport(0, 0, t.w, t.h); };
    const w = this.width, h = this.height;

    // Screen-space AO
    if (q.ssao) {
      target(f.aoB);
      const p = this.pSSAO.use();
      bind(0, f.depth);
      gl.uniform1i(p.u.uDepth, 0);
      gl.uniformMatrix4fv(p.u.uProj, false, this.proj);
      gl.uniformMatrix4fv(p.u.uInvProj, false, this.invProj);
      fs();
      const pb = this.pBlurAO.use();
      gl.uniform1i(pb.u.uTex, 1);
      gl.uniform1i(pb.u.uDepth, 0);
      gl.uniform2f(pb.u.uNearFar, .2, 9000);
      target(f.ao);
      bind(1, f.aoB.tex);
      gl.uniform2f(pb.u.uDir, 2 / w, 0);
      fs();
      target(f.aoB);
      bind(1, f.ao.tex);
      gl.uniform2f(pb.u.uDir, 0, 2 / h);
      fs();
    }

    // Motion blur and depth of field
    target(f.cine);
    {
      const p = this.pMotion.use();
      bind(0, f.scene.tex);
      bind(1, f.depth);
      gl.uniform1i(p.u.uScene, 0);
      gl.uniform1i(p.u.uDepth, 1);
      gl.uniformMatrix4fv(p.u.uInvViewProj, false, this.invViewProj);
      gl.uniformMatrix4fv(p.u.uPrevViewProj, false, this.prevViewProj);
      gl.uniform1f(p.u.uMotion, q.motion ? (fx.motion ?? .55) : 0);
      gl.uniform1f(p.u.uFocus, this.focus);
      gl.uniform1f(p.u.uAperture, q.dof ? this.aperture : 0);
      gl.uniform2f(p.u.uTexel, 1 / w, 1 / h);
      gl.uniform2f(p.u.uNearFar, .2, 9000);
      fs();
    }

    // Mist in the air, in front of everything except what you are holding.
    if (q.volume) {
      target(f.vol);
      const pv = this.pVolume.use();
      this.frameUniforms(pv);
      this.bindRainMap(pv);
      bind(0, f.depth);
      gl.uniform1i(pv.u.uDepth, 0);
      gl.uniformMatrix4fv(pv.u.uInvViewProj, false, this.invViewProj);
      gl.uniform1f(pv.u.uVolDensity, (.0052 + this.rain * .0085 + this.sky.night * .002) * (this.fogK || 1));
      gl.uniform2f(pv.u.uWind, this.windX, this.windZ);
      gl.uniform1f(pv.u.uRainHaze, Math.min(.2 + .06 * (1 - this.sky.night), this.rain * (.22 + .07 * (1 - this.sky.night))) * (this.rainVis ?? 1));
      fs();
      target(f.cine);
      const pb = this.pVolBlit.use();
      bind(0, f.vol.tex);
      bind(1, f.depth);
      gl.uniform1i(pb.u.uTex, 0);
      gl.uniform1i(pb.u.uDepth, 1);
      gl.uniform2f(pb.u.uNearFar, .2, 9000);
      gl.uniform2f(pb.u.uTexel, 1 / f.vol.w, 1 / f.vol.h);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      fs();
      gl.disable(gl.BLEND);
    }

    // View model sits on top of the blurred world, with its own depth.
    if (viewModelDraw) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      viewModelDraw(gl);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.bindVertexArray(this.emptyVAO);
    }

    // Bloom pyramid
    const chain = f.bloom;
    {
      target(chain[0]);
      const p = this.pBright.use();
      bind(0, f.cine.tex);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform1f(p.u.uThreshold, 1.0);
      fs();
      const pd = this.pDown.use();
      gl.uniform1i(pd.u.uTex, 0);
      for (let i = 1; i < chain.length; i++) {
        target(chain[i]);
        bind(0, chain[i - 1].tex);
        gl.uniform2f(pd.u.uTexel, .5 / chain[i - 1].w, .5 / chain[i - 1].h);
        fs();
      }
      const pu = this.pUp.use();
      gl.uniform1i(pu.u.uTex, 0);
      gl.uniform1f(pu.u.uWeight, 1);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = chain.length - 1; i >= 1; i--) {
        target(chain[i - 1]);
        bind(0, chain[i].tex);
        gl.uniform2f(pu.u.uTexel, 1 / chain[i - 1].w, 1 / chain[i - 1].h);
        fs();
      }
      gl.disable(gl.BLEND);
    }

    // Sun position on screen, for rays and the lens flare.
    const s = this.sky.sunDir;
    const c = this.camPos, vp = this.viewProj;
    const sx = c[0] + s[0] * 4000, sy = c[1] + s[1] * 4000, sz = c[2] + s[2] * 4000;
    const cw = vp[3] * sx + vp[7] * sy + vp[11] * sz + vp[15];
    let sunVis = 0, su = 0, sv = 0;
    if (cw > 0) {
      su = (vp[0] * sx + vp[4] * sy + vp[8] * sz + vp[12]) / cw * .5 + .5;
      sv = (vp[1] * sx + vp[5] * sy + vp[9] * sz + vp[13]) / cw * .5 + .5;
      // Fades out as the sun nears the edge of the view. It used to snap, and the whole picture changed with it.
      const off = Math.max(Math.abs(su - .5), Math.abs(sv - .5));
      sunVis = clamp((1 - off) / .55, 0, 1);
      sunVis *= sunVis;
    }
    this.sunUV[0] = su; this.sunUV[1] = sv;
    const sunStrength = this.sky.isSun ? 1 : .15;
    target(f.rays);
    if (q.rays && sunVis > .002) {
      const p = this.pRays.use();
      bind(0, f.depth);
      bind(1, f.cine.tex);
      gl.uniform1i(p.u.uDepth, 0);
      gl.uniform1i(p.u.uScene, 1);
      gl.uniform2f(p.u.uSunUV, su, sv);
      // The sun throws real shafts, stronger the more of the view it is in. The moon's stay faint.
      gl.uniform1f(p.u.uStrength, (this.sky.isSun ? .3 + .22 * sunVis : .2) * sunStrength * sunVis * (1 - this.rain * .85));
      fs();
    } else {
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    // Soft flare visibility: is there sky at the sun's pixel? Sampled from depth via fx.sunOccluded.
    const flareVis = (fx.flareVis ?? 0) * sunStrength * sunVis * .35;
    // Looking straight into the sun, with nothing in the way: it blinds. Only the sun, only near the middle of the view, worse the more
    // directly you look, and it comes on over a moment rather than in a frame, the way eyes take it.
    const centred = Math.max(0, 1 - Math.hypot((su - .5) * w / h, sv - .5) / .42);
    const glareTo = this.sky.isSun && cw > 0 ? (fx.flareVis ?? 0) * centred * centred * Math.max(0, 1 - this.rain * 1.6) * Math.min(1, Math.max(0, this.sky.sunDir[1] * 6 + .2)) : 0;
    this.glare = (this.glare ?? 0) + (glareTo - (this.glare ?? 0)) * (glareTo > (this.glare ?? 0) ? .045 : .12);

    // Composite to LDR
    target(f.composite);
    {
      const p = this.pComposite.use();
      bind(0, f.cine.tex);
      bind(1, chain[0].tex);
      bind(2, q.ssao ? f.aoB.tex : f.ao.tex);
      bind(3, f.rays.tex);
      gl.uniform1i(p.u.uScene, 0);
      gl.uniform1i(p.u.uBloom, 1);
      gl.uniform1i(p.u.uAO, 2);
      gl.uniform1i(p.u.uRays, 3);
      gl.uniform1f(p.u.uExposure, this.exposure * .88 * (this.brightness || 1));
      if (p.u.uGrain) gl.uniform1f(p.u.uGrain, this.grain ?? .3);
      gl.uniform1f(p.u.uBloomAmt, .075);
      gl.uniform3fv(p.u.uSunCol, this.sky.sunCol);
      gl.uniform3f(p.u.uFlareData, su, sv, flareVis);
      gl.uniform1f(p.u.uAspect, w / h);
      gl.uniform1f(p.u.uHurt, fx.hurt || 0);
      gl.uniform1f(p.u.uSat, fx.sat ?? .74);
      gl.uniform1f(p.u.uTime, this.time);
      gl.uniform1f(p.u.uFlash, fx.flash || 0);
      if (p.u.uGlare) gl.uniform1f(p.u.uGlare, this.glare || 0);
      gl.uniform1f(p.u.uFade, fx.fade ?? 1);
      gl.uniform1f(p.u.uInfected, fx.infected || 0);
      if (p.u.uRainTint) gl.uniform1f(p.u.uRainTint, fx.rainTint || 0);
      fs();
    }

    // FXAA to the screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const p = this.pFXAA.use();
    bind(0, f.composite.tex);
    gl.uniform1i(p.u.uTex, 0);
    gl.uniform2f(p.u.uTexel, 1 / w, 1 / h);
    fs();
    gl.activeTexture(gl.TEXTURE0);
    gl.depthMask(true);
  }

  // How much sky is at a world point on screen (used to gate the lens flare).
  sunOcclusion(world) {
    const s = this.sky.sunDir, c = this.camPos;
    const hit = world.raycast(c[0], c[1], c[2], s[0], s[1], s[2], 220, true);
    return hit ? 0 : 1;
  }
}
