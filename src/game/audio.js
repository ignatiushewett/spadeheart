// All sound is synthesised at runtime, so the game ships with no audio assets. Weapons and the long
// ambient beds are rendered once into buffers, a few variations of each, and then played back
// through distance filters and a street-canyon reverb.
import { MenuMusic } from './menumusic.js';

const rand = Math.random;
const TAU = Math.PI * 2;

// Weapon recipes. crack: supersonic snap; body: muzzle blast length and brightness; sub: chest thump
// frequency and length; drive: how hard it saturates; mech: the action cycling, as a delay in seconds.
const GUNS = {
  pistol: { crack: .55, bodyT: .05, bright: 3600, sub: 165, subT: .05, drive: 2.4, mech: .05, gain: .62 },
  magnum: { crack: .8, bodyT: .11, bright: 2600, sub: 105, subT: .1, drive: 3.4, mech: 0, gain: 1 },
  smg: { crack: .4, bodyT: .032, bright: 4200, sub: 190, subT: .035, drive: 2.2, mech: .03, gain: .5 },
  rifle: { crack: 1, bodyT: .065, bright: 3300, sub: 118, subT: .07, drive: 3.2, mech: .035, gain: .78 },
  shotgun: { crack: .35, bodyT: .17, bright: 1700, sub: 72, subT: .17, drive: 4, mech: 0, gain: 1.15 },
  sniper: { crack: 1.2, bodyT: .16, bright: 2600, sub: 78, subT: .18, drive: 4, mech: 0, gain: 1.25 },
  rocket: { crack: .2, bodyT: .5, bright: 900, sub: 48, subT: .4, drive: 2.4, mech: 0, gain: 1 },
};

// Interface sounds: heard as they are whatever else is going on (see uiOut).
const UI_SOUNDS = new Set(['ui', 'uiOver', 'coin', 'bonk', 'beep', 'pickup', 'crate']);

export class Audio2 {
  constructor() {
    this.ctx = null;
    this.volume = .8;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.moanTimer = 0;
    this.ambientTimer = 20;
    this.bank = {};
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.sr = ctx.sampleRate;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    comp.attack.value = .004;
    comp.release.value = .22;
    // Paused, the world goes quiet and far off, as if heard through a wall: everything in the game passes through a low-pass filter and
    // a level that both ease down while a menu is up, and back when you return. The menu's own music is outside it.
    this.muffleF = ctx.createBiquadFilter();
    this.muffleF.type = 'lowpass';
    this.muffleF.frequency.value = 22000;
    this.muffleF.Q.value = .5;
    this.muffleG = ctx.createGain();
    this.muffleG.gain.value = 1;
    this.master.connect(this.muffleF);
    this.muffleF.connect(this.muffleG);
    this.muffleG.connect(comp);
    comp.connect(ctx.destination);
    // The music goes round the master, so a wake-up or a nap ducking the world does not cut it off. It still answers to the volume setting.
    this.musicLevel = ctx.createGain();
    this.musicLevel.gain.value = this.volume * .55 * (this.musicShare ?? 1);
    this.musicLevel.connect(comp);
    this.music = new MenuMusic(ctx, this.musicLevel);
    // The interface, and the voice of whoever you are talking to, go round the muffle too: a menu being up is exactly when they need
    // to be heard, not when they should sound like they are through a wall.
    this.uiLevel = ctx.createGain();
    this.uiLevel.gain.value = this.volume;
    this.uiLevel.connect(comp);
    if (this.wantMusic) this.music.play();
    // Long slapback impulse: the sound of gunfire between Albion towers.
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        const n = (rand() * 2 - 1) * Math.pow(1 - t, 3.4) * (t < .01 ? t / .01 : 1);
        lp += (n - lp) * (.6 - t * .5);   // the tail darkens as it goes
        d[i] = lp;
      }
      for (const tap of [.09, .16, .27, .41, .63]) {
        const at = Math.floor(tap * ctx.sampleRate) + ch * 310;
        for (let i = 0; i < 900; i++) d[at + i] += (rand() * 2 - 1) * (.6 - tap * .8) * (1 - i / 900) * .7;
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.revGain = ctx.createGain();
    this.revGain.gain.value = .4;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rand() * 2 - 1;
    this.startAmbience();
    this.renderBank();
  }

  // A motorbike's engine: a ragged sawtooth at the firing rate with a square an octave down, a throb at a quarter of it, and a bit of
  // mechanical rattle, driven hard through a low-pass that opens up with the throttle. It runs while someone is on the bike and is
  // told every frame how hard; told nothing, it dies away on its own.
  engineStart(x, y, z) {
    if (!this.ctx) return;
    if (this.eng) this.engineStop(true);
    const ctx = this.ctx;
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), throb = ctx.createOscillator();
    o1.type = 'sawtooth'; o2.type = 'square'; throb.type = 'square';
    const am = ctx.createGain(), depth = ctx.createGain();
    am.gain.value = .6; depth.gain.value = .4;
    throb.connect(depth); depth.connect(am.gain);
    const o2g = ctx.createGain(); o2g.gain.value = .45;
    o1.connect(am); o2.connect(o2g); o2g.connect(am);
    const rattle = ctx.createBufferSource(); rattle.buffer = this.noiseBuf; rattle.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 2200; rf.Q.value = 1.2;
    const rg = ctx.createGain(); rg.gain.value = .12;
    rattle.connect(rf); rf.connect(rg); rg.connect(am);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 2.5; f.frequency.value = 500;
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 127.5 - 1) * 2.4);
    shape.curve = curve;
    const lvl = ctx.createGain(); lvl.gain.value = 0;
    const s = this.spatial(x, y, z, 18);
    const out = this.out(1, s.pan, .12);
    am.connect(shape); shape.connect(f); f.connect(lvl); lvl.connect(out);
    for (const o of [o1, o2, throb]) o.frequency.value = 30;
    o1.start(); o2.start(); throb.start(); rattle.start();
    this.eng = { o1, o2, throb, f, lvl, out, rattle };
    // Kicked over: a cough, then it catches.
    this.noiseBurst(this.out(s.gain * .5, s.pan), .35, 'lowpass', 300, 120, 1, .5, .01);
  }

  engineSet(rev, load, x, y, z) {
    const e = this.eng;
    if (!e) return;
    const t = this.ctx.currentTime, s = this.spatial(x, y, z, 26);
    const fr = 34 + rev * 150;
    e.o1.frequency.setTargetAtTime(fr, t, .04);
    e.o2.frequency.setTargetAtTime(fr * .502, t, .04);
    e.throb.frequency.setTargetAtTime(fr * .25, t, .04);
    e.f.frequency.setTargetAtTime(380 + rev * 1500 + load * 900, t, .06);
    e.out.gain.setTargetAtTime(s.gain, t, .05);
    e.lvl.gain.cancelScheduledValues(t);
    e.lvl.gain.setTargetAtTime(.3 + rev * .18 + load * .15, t, .05);
    e.lvl.gain.setTargetAtTime(0, t + .3, .15);   // if nobody says anything more, it goes quiet
  }

  engineStop(now = false) {
    const e = this.eng;
    if (!e) return;
    this.eng = null;
    const t = this.ctx.currentTime;
    e.lvl.gain.cancelScheduledValues(t);
    e.lvl.gain.setTargetAtTime(0, t, now ? .02 : .12);
    e.o1.frequency.setTargetAtTime(28, t, .25);
    setTimeout(() => { for (const n of [e.o1, e.o2, e.throb, e.rattle]) { try { n.stop(); } catch (_) { /* already stopped */ } } e.out.disconnect(); }, 900);
  }

  setVolume(v, music = this.musicShare ?? 1) {
    this.volume = v;
    this.musicShare = music;
    if (this.master) this.master.gain.value = v;
    if (this.musicLevel) this.musicLevel.gain.value = v * .55 * music;
    if (this.uiLevel) this.uiLevel.gain.value = v;
  }

  // Straight to the speakers past the pause muffle: menu clicks, coins, and dialogue.
  uiOut(gain) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    g.connect(this.uiLevel);
    return g;
  }

  // On in the menu, and a long slow fade once you leave it. Browsers will not make a sound until you have touched something, so it may have to wait for that.
  menuMusic(on) {
    this.wantMusic = on;
    if (!this.music) return;
    if (on) this.music.play();
    else this.music.stop();
  }

  setListener(x, y, z, yaw) {
    const l = this.listener;
    l.x = x; l.y = y; l.z = z; l.yaw = yaw;
  }

  // Distance gain and pan for a world position.
  spatial(x, y, z, ref = 14) {
    const l = this.listener;
    const dx = x - l.x, dy = y - l.y, dz = z - l.z;
    const d = Math.hypot(dx, dy, dz);
    const gain = 1 / (1 + (d / ref) * (d / ref) * .5 + d / ref * .4);
    const cos = Math.cos(l.yaw), sin = Math.sin(l.yaw);
    const side = (dx * cos + dz * sin) / (d + 1);
    return { gain, pan: Math.max(-1, Math.min(1, side)), dist: d };
  }

  out(gain, pan, wet = .25) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.master);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      p.connect(s);
      s.connect(this.reverb);
    }
    return g;
  }

  // --- Offline rendering --------------------------------------------------------------------
  // One job per tick, so nothing hitches while the bank fills up.
  renderBank() {
    const jobs = [];
    for (const k of Object.keys(GUNS)) for (let v = 0; v < 3; v++) jobs.push(() => { (this.bank[k] || (this.bank[k] = [])).push(this.renderGun(GUNS[k])); });
    jobs.push(() => { this.bank.insects = this.renderInsects(); this.loopInto(this.bank.insects, this.insectGain); });
    jobs.push(() => { this.bank.crackle = this.renderCrackle(); this.loopInto(this.bank.crackle, this.fireGain); });
    const next = () => {
      const j = jobs.shift();
      if (!j) return;
      j();
      setTimeout(next, 8);
    };
    next();
  }

  buffer(seconds, fn) {
    const n = Math.floor(seconds * this.sr);
    const b = this.ctx.createBuffer(1, n, this.sr);
    fn(b.getChannelData(0), n, this.sr);
    return b;
  }

  loopInto(buf, gainNode) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(gainNode);
    s.start(0, rand() * buf.duration);
  }

  renderGun(g) {
    const seconds = Math.max(.35, g.bodyT * 6 + .15);
    return this.buffer(seconds, (d, n, sr) => {
      let lp = 0, lp2 = 0, hp = 0, phase = 0;
      const jitter = .92 + rand() * .16;
      const sub0 = g.sub * jitter;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const noise = rand() * 2 - 1;
        // Snap: a few milliseconds of high air.
        hp = .55 * hp + .45 * noise;
        const crack = (noise - hp) * Math.exp(-t / .0018) * g.crack;
        // Blast: noise whose brightness falls as it decays.
        const cut = Math.min(.95, (g.bright * Math.exp(-t / (g.bodyT * .9)) + 180) / sr * TAU);
        lp += (noise - lp) * cut;
        lp2 += (lp - lp2) * Math.min(.95, cut * 1.6);
        const body = lp2 * Math.exp(-t / g.bodyT) * 2.4;
        // Thump, sweeping down.
        const f = sub0 * (.55 + .9 * Math.exp(-t / .018));
        phase += TAU * f / sr;
        const sub = Math.sin(phase) * Math.exp(-t / g.subT) * 1.1;
        let s = crack + body + sub;
        // The bolt or slide cycling, just audible behind the shot.
        if (g.mech && t > g.mech && t < g.mech + .018) s += noise * .1 * (1 - (t - g.mech) / .018);
        d[i] = Math.tanh(s * g.drive) * .8;
      }
    });
  }

  // Crickets in the park, and a higher thin trill behind them.
  renderInsects() {
    return this.buffer(8, (d, n, sr) => {
      for (let c = 0; c < 9; c++) {
        const f = 3600 + rand() * 1800, rate = 12 + rand() * 12, off = rand() * 8, chirp = .7 + rand() * 1.5, g = .03 + rand() * .05;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const pulse = ((t + off) % chirp) < chirp * .42 ? Math.max(0, Math.sin(TAU * rate * t)) : 0;
          d[i] += Math.sin(TAU * f * t) * pulse * pulse * g;
        }
      }
      for (let i = 0; i < n; i++) d[i] += Math.sin(TAU * 6100 * (i / sr)) * (.012 + .008 * Math.sin(i / sr * 1.7));
    });
  }

  renderCrackle() {
    return this.buffer(6, (d, n, sr) => {
      let lp = 0;
      for (let i = 0; i < n; i++) { lp += ((rand() * 2 - 1) - lp) * .012; d[i] = lp * .9; }
      for (let k = 0; k < 340; k++) {
        const at = Math.floor(rand() * n), g = .06 + Math.pow(rand(), 3) * .6, len = 30 + Math.floor(rand() * 260);
        for (let i = 0; i < len; i++) d[(at + i) % n] += (rand() * 2 - 1) * g * (1 - i / len) * (1 - i / len);
      }
    });
  }

  play(buf, dest, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.playbackRate.value = rate;
    s.connect(dest);
    s.start();
    return s;
  }

  // --- Simple one-shots ---------------------------------------------------------------------
  noiseBurst(dest, dur, type, f0, f1, q, peak, attack = .001) {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = .8 + rand() * .4;
    const flt = ctx.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    flt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(flt); flt.connect(g); g.connect(dest);
    src.start(t, rand());
    src.stop(t + dur + .02);
  }

  // One letter of someone talking: a short, soft blip at their pitch, never quite the same twice.
  voice(freq) {
    if (!this.ctx) return;
    if (!this.voiceBus) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2600;
      lp.connect(this.uiOut(.75));
      this.voiceBus = lp;
    }
    const f = freq * (.95 + Math.random() * .1);
    this.tone(this.voiceBus, .065, 'square', f, f * .96, .6);
  }

  // The same, overheard: quieter, from where they stand, and gone in a few steps.
  voiceAt(freq, x, y, z) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 9);
    if (s.gain < .05) return;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2100;
    lp.connect(this.out(s.gain * 1.05, s.pan, .1));
    const f = freq * (.95 + Math.random() * .1);
    this.tone(lp, .075, 'square', f, f * .96, .6);
  }

  tone(dest, dur, type, f0, f1, peak) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(16, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t);
    o.stop(t + dur + .02);
  }

  gun(kind, x, y, z, npc = false) {
    if (!this.ctx) return;
    const s = x === undefined ? { gain: 1, pan: 0, dist: 0 } : this.spatial(x, y, z, 46);
    if (s.gain < .005) return;
    const spec = GUNS[kind] || GUNS.pistol;
    const far = Math.min(1, s.dist / 260);
    const bank = this.bank[kind] || this.bank.pistol;
    const dest = this.out(s.gain * (npc ? .6 : .92) * spec.gain, s.pan, .32 + far * .6);
    if (!bank || !bank.length) {
      this.noiseBurst(dest, spec.bodyT * 3, 'lowpass', spec.bright, 200, .6, .9);
      return;
    }
    // Distance takes the top off a gunshot long before it takes the volume.
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 16000 * Math.pow(1 - far, 2.4) + 420;
    lp.connect(dest);
    this.play(bank[Math.floor(rand() * bank.length)], lp, .95 + rand() * .1);
  }

  explosion(x, y, z, size = 1, reach = 90) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, reach);
    const dest = this.out(Math.min(1.4, s.gain * 1.5), s.pan, .8);
    this.noiseBurst(dest, 2.3 * size, 'lowpass', 1500, 45, .5, 1.3, .004);
    this.tone(dest, 1.5 * size, 'sine', 95, 18, 1.4);
    this.noiseBurst(dest, .09, 'highpass', 2200, 900, .3, .5);
    if (s.dist < 120) for (let i = 0; i < 7; i++) setTimeout(() => { if (this.ctx) this.noiseBurst(dest, .2, 'bandpass', 900 + rand() * 1800, 300, 2, .12); }, 180 + rand() * 1500);
  }

  // A launcher going off on a wall: a hard thump and the tearing rush of the motor, heard across the yard and down the streets round it.
  // Loud, but well short of what it does when it lands.
  rocketLaunch(x, y, z) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 70);
    if (s.gain < .01) return;
    const dest = this.out(Math.min(1, s.gain * 1.05), s.pan, .6);
    this.noiseBurst(dest, .35, 'lowpass', 900, 70, .6, .9, .003);
    this.tone(dest, .4, 'sine', 120, 38, .7);
    this.noiseBurst(dest, .9, 'bandpass', 500, 2600, .9, .55, .05);
    this.noiseBurst(dest, 1.4, 'highpass', 1800, 900, .4, .22, .12);
  }

  collapse(x, y, z, size) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 70);
    const dest = this.out(Math.min(1.2, s.gain * (.5 + size)), s.pan, .75);
    this.noiseBurst(dest, 2.8 + size * 2, 'lowpass', 500, 40, .4, 1, .2);
    this.tone(dest, 2.6, 'sine', 54, 22, .7);
    for (let i = 0; i < 6; i++) setTimeout(() => { if (this.ctx) this.noiseBurst(dest, .22, 'bandpass', 700 + rand() * 900, 200, 1.6, .22); }, rand() * 2200);
  }

  moan(x, y, z, loud = 1) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 11);
    if (s.gain < .01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = .55 + rand() * 1.1;
    const dest = this.out(s.gain * .42 * loud, s.pan, .22);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = 68 + rand() * 62;
    o.frequency.setValueAtTime(f * (1 + rand() * .3), t);
    o.frequency.linearRampToValueAtTime(f * (.68 + rand() * .3), t + dur);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5 + rand() * 9;
    const lg = ctx.createGain();
    lg.gain.value = 5 + rand() * 9;
    lfo.connect(lg); lg.connect(o.frequency);
    // Two formants make it read as a throat rather than a synth.
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass'; f1.frequency.value = 380 + rand() * 260; f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass'; f2.frequency.value = 900 + rand() * 500; f2.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(.7, t + dur * .2);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(dest);
    o.start(t); lfo.start(t);
    o.stop(t + dur + .05); lfo.stop(t + dur + .05);
  }

  bodyFall(x, y, z, impact) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 26);
    if (s.gain < .02) return;
    const o = this.out(s.gain * Math.min(1, impact / 24), s.pan, .25);
    this.noiseBurst(o, .14, 'lowpass', 900, 110, 1, 1);
    this.tone(o, .14, 'sine', 120, 42, .8);
    if (impact > 30) this.noiseBurst(o, .22, 'bandpass', 1500, 420, 1.2, .8);
  }

  simple(kind, x, y, z) {
    if (!this.ctx) return;
    const s = x === undefined ? { gain: 1, pan: 0 } : this.spatial(x, y, z, 20);
    if (s.gain < .01) return;
    const ui = x === undefined && UI_SOUNDS.has(kind);
    const d = (g, w = .1) => (ui ? this.uiOut(s.gain * g) : this.out(s.gain * g, s.pan, w));
    const later = (ms, fn) => setTimeout(() => { if (this.ctx) fn(); }, ms);
    switch (kind) {
      case 'step': this.noiseBurst(d(.1, .02), .07, 'lowpass', 500 + rand() * 300, 160, 1, .7); break;
      case 'splash': { const o = d(.13, .03); this.noiseBurst(o, .09, 'lowpass', 420 + rand() * 200, 140, 1, .6); this.noiseBurst(o, .16, 'bandpass', 1500 + rand() * 900, 700, 1.3, .45, .006); break; }
      case 'land': { const o = d(.4, .05); this.noiseBurst(o, .15, 'lowpass', 420, 90, 1, .9); this.tone(o, .12, 'sine', 90, 45, .5); break; }
      case 'swing': this.noiseBurst(d(.26), .22, 'bandpass', 700, 2600, 1.4, .55, .06); break;
      case 'flesh': { const o = d(.55, .05); this.noiseBurst(o, .11, 'lowpass', 1200, 170, 1.8, .95); this.tone(o, .1, 'sine', 160, 50, .6); break; }
      case 'head': { const o = d(.65, .08); this.noiseBurst(o, .17, 'bandpass', 1500, 260, 1.2, 1); this.tone(o, .1, 'square', 300, 70, .18); this.noiseBurst(o, .05, 'highpass', 3000, 1800, 1, .3); break; }
      case 'block': this.noiseBurst(d(.3, .12), .12, 'bandpass', 700 + rand() * 500, 300, 1.8, .8); break;
      case 'glass': {
        const o = d(.55, .3);
        this.noiseBurst(o, .34, 'highpass', 3800, 2600, 1, .55);
        for (let i = 0; i < 6; i++) later(rand() * 240, () => this.tone(o, .09 + rand() * .1, 'triangle', 3000 + rand() * 3200, 2100, .1));
        break;
      }
      case 'bonk': this.tone(d(.35, .08), .1, 'triangle', 320, 120, .7); break;
      case 'click': this.noiseBurst(d(.5, 0), .025, 'highpass', 2600, 2000, 1, .8); break;
      case 'reload': {
        // Magazine out, magazine in, bolt forward.
        this.noiseBurst(d(.9, .02), .05, 'bandpass', 1500, 900, 3, 1);
        later(330, () => { const o = d(1, .02); this.noiseBurst(o, .06, 'bandpass', 1050, 700, 3, 1); this.tone(o, .04, 'square', 200, 120, .1); });
        later(620, () => { const o = d(1.15, .03); this.noiseBurst(o, .05, 'bandpass', 2000, 1200, 2.5, 1); later(70, () => this.noiseBurst(o, .06, 'bandpass', 1200, 700, 2.5, 1)); });
        break;
      }
      case 'pump': { this.noiseBurst(d(.75, .03), .07, 'bandpass', 800, 450, 2, 1); later(150, () => this.noiseBurst(d(.8, .03), .07, 'bandpass', 1400, 800, 2, 1)); break; }
      case 'pickup': { const o = d(.18, .05); this.tone(o, .09, 'triangle', 620, 840, .5); later(60, () => this.tone(d(.18, .05), .1, 'triangle', 920, 1160, .4)); break; }
      case 'coin': { const o = d(1, .06); this.tone(o, .14, 'square', 1500, 1400, .3); later(70, () => this.tone(d(1, .06), .22, 'square', 2000, 1900, .3)); break; }
      case 'ui': { const o = d(1.2, 0); this.tone(o, .06, 'triangle', 640, 430, .7); this.noiseBurst(o, .022, 'bandpass', 2400, 1300, 1.4, .45); break; }
      case 'uiOver': this.tone(d(.45, 0), .026, 'triangle', 1180, 940, .5); break;
      // A blow landing on a body that stays up: a dull, heavy thud you feel more than hear.
      case 'thump': { const o = d(.9, .04); this.tone(o, .16, 'sine', 110, 46, .9); this.noiseBurst(o, .09, 'lowpass', 700, 120, 1.4, .9); break; }
      case 'hurt': { const o = d(.7, .05); this.noiseBurst(o, .22, 'lowpass', 900, 220, 2, .8); this.tone(o, .2, 'sawtooth', 150, 70, .25); break; }
      case 'crate': this.noiseBurst(d(.3, .08), .2, 'bandpass', 500, 900, 2.5, .8, .04); break;
      // Stalks going down under a wheel: a dry swish and the snap of them.
      case 'thrash': { const o = d(.75, .05); this.noiseBurst(o, .13 + rand() * .06, 'bandpass', 2600 + rand() * 900, 1100, 1.1, .7, .008); this.noiseBurst(o, .03, 'highpass', 3400, 2600, 1, .5); break; }
      // Driven into a wall: the crack of it going, the thud through the frame, and what is left of it coming down after.
      case 'smash': {
        const o = d(1.1, .25);
        this.noiseBurst(o, .38, 'lowpass', 1100, 140, 1.4, 1, .002);
        this.tone(o, .3, 'sine', 80, 34, .9);
        this.noiseBurst(o, .06, 'bandpass', 2200, 900, 1.5, .7);
        for (let i = 0; i < 5; i++) later(90 + rand() * 600, () => this.noiseBurst(d(.45, .2), .14, 'bandpass', 600 + rand() * 900, 250, 1.6, .5));
        break;
      }
      case 'place': this.tone(d(.3, .06), .08, 'square', 140, 90, .4); break;
      case 'beep': this.tone(d(.3, .12), .08, 'square', 1250, 1250, .24); break;
      case 'gate': { const o = d(.4, .3); this.noiseBurst(o, .7, 'lowpass', 340, 120, 2, .7, .08); this.tone(o, .5, 'sawtooth', 64, 52, .18); break; }
      case 'splash': this.noiseBurst(d(.4, .15), .5, 'lowpass', 1800, 300, .6, .7, .02); break;
    }
  }

  // --- The long beds -----------------------------------------------------------------------------
  startAmbience() {
    const ctx = this.ctx;
    const gain = (v, to = this.master) => { const g = ctx.createGain(); g.gain.value = v; g.connect(to); return g; };
    // Wind: two bands, low rush and a thin whistle between the buildings.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = .5;
    this.windGain = gain(.05);
    src.connect(f); f.connect(this.windGain);
    src.start();
    this.windFilter = f;
    const src2 = ctx.createBufferSource();
    src2.buffer = this.noiseBuf;
    src2.loop = true;
    src2.playbackRate.value = .7;
    const b = ctx.createBiquadFilter();
    b.type = 'bandpass'; b.frequency.value = 760; b.Q.value = 7;
    this.whistleGain = gain(.0);
    src2.connect(b); b.connect(this.whistleGain);
    // A crowd talking: brown-ish noise kept low and soft, swelling and dipping at the rate people speak.
    const src4 = ctx.createBufferSource();
    src4.buffer = this.noiseBuf;
    src4.loop = true;
    src4.playbackRate.value = .45;
    const ml = ctx.createBiquadFilter();
    ml.type = 'lowpass'; ml.frequency.value = 520; ml.Q.value = .4;
    const mb = ctx.createBiquadFilter();
    mb.type = 'peaking'; mb.frequency.value = 300; mb.Q.value = .9; mb.gain.value = 5;
    const mamp = ctx.createGain();
    mamp.gain.value = .7;
    for (const [hz, depth] of [[2.7, .18], [4.3, .12], [.37, .14]]) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = hz; lg.gain.value = depth;
      lfo.connect(lg); lg.connect(mamp.gain); lfo.start();
    }
    this.murmurGain = gain(0);
    src4.connect(ml); ml.connect(mb); mb.connect(mamp); mamp.connect(this.murmurGain);
    src4.start();
    // Storm wind: a deeper, heavier rush that comes in with the rain and leans on the city in gusts.
    const src3 = ctx.createBufferSource();
    src3.buffer = this.noiseBuf;
    src3.loop = true;
    src3.playbackRate.value = .55;
    const sf = ctx.createBiquadFilter();
    sf.type = 'lowpass'; sf.frequency.value = 420; sf.Q.value = .9;
    this.stormGain = gain(0);
    src3.connect(sf); sf.connect(this.stormGain);
    src3.start();
    this.stormFilter = sf;
    src2.start();
    this.whistleFilter = b;
    // Rain: bright hiss over a soft roar. Dulled when there is a roof over you.
    const rain = ctx.createBufferSource();
    rain.buffer = this.noiseBuf;
    rain.loop = true;
    rain.playbackRate.value = 1.15;
    const rl = ctx.createBiquadFilter();
    rl.type = 'lowpass'; rl.frequency.value = 7000;
    const rh = ctx.createBiquadFilter();
    rh.type = 'highpass'; rh.frequency.value = 240;
    this.rainGain = gain(0);
    rain.connect(rh); rh.connect(rl); rl.connect(this.rainGain);
    rain.start();
    this.rainFilter = rl;
    // Low crowd drone that swells with the horde around you.
    const crowd = ctx.createBufferSource();
    crowd.buffer = this.noiseBuf;
    crowd.loop = true;
    crowd.playbackRate.value = .5;
    const b1 = ctx.createBiquadFilter();
    b1.type = 'bandpass'; b1.frequency.value = 240; b1.Q.value = 1.2;
    const b2 = ctx.createBiquadFilter();
    b2.type = 'lowpass'; b2.frequency.value = 520;
    this.crowdGain = gain(0);
    crowd.connect(b1); b1.connect(b2); b2.connect(this.crowdGain);
    crowd.start();
    this.insectGain = gain(0);
    this.fireGain = gain(0);
    // Camp siren: two detuned tones climbing and falling. Silent until something sets it off.
    const a1 = ctx.createOscillator(), a2 = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    a1.type = 'sawtooth'; a2.type = 'sawtooth';
    a1.frequency.value = 520; a2.frequency.value = 528;
    lfo.frequency.value = .18;
    lg.gain.value = 190;
    lfo.connect(lg); lg.connect(a1.frequency); lg.connect(a2.frequency);
    const aF = ctx.createBiquadFilter();
    aF.type = 'bandpass'; aF.frequency.value = 900; aF.Q.value = .8;
    this.alarmGain = ctx.createGain();
    this.alarmGain.gain.value = 0;
    a1.connect(aF); a2.connect(aF); aF.connect(this.alarmGain);
    // Every siren in the camp is the same one on the same wire, coming out of a horn on each gate. That is why they do not fight each other.
    this.sirenBus = ctx.createGain();
    this.sirenWet = gain(.6, this.reverb);
    this.speakers = [];
    this.alarmGain.connect(this.sirenBus);
    a1.start(); a2.start(); lfo.start();
    // The one nobody ever wants to hear: a long air-raid wail, and under it a klaxon that does not let up.
    const e1 = ctx.createOscillator(), e2 = ctx.createOscillator(), eLfo = ctx.createOscillator(), eDepth = ctx.createGain();
    e1.type = 'sawtooth'; e2.type = 'square';
    e1.frequency.value = 620; e2.frequency.value = 311;
    eLfo.type = 'sine';
    eLfo.frequency.value = .3;
    eDepth.gain.value = 360;
    eLfo.connect(eDepth); eDepth.connect(e1.frequency);
    const eHalf = ctx.createGain();
    eHalf.gain.value = .5;
    eDepth.connect(eHalf); eHalf.connect(e2.frequency);
    const eF = ctx.createBiquadFilter();
    eF.type = 'bandpass'; eF.frequency.value = 760; eF.Q.value = .5;
    e1.connect(eF);
    const e2g = ctx.createGain();
    e2g.gain.value = .35;
    e2.connect(e2g); e2g.connect(eF);
    const k1 = ctx.createOscillator(), k2 = ctx.createOscillator(), kGate = ctx.createOscillator(), kAmp = ctx.createGain(), kDepth = ctx.createGain();
    k1.type = 'square'; k2.type = 'square';
    k1.frequency.value = 185; k2.frequency.value = 220;
    kGate.type = 'square'; kGate.frequency.value = .95;
    kAmp.gain.value = .22;
    kDepth.gain.value = .22;
    kGate.connect(kDepth); kDepth.connect(kAmp.gain);
    const kF = ctx.createBiquadFilter();
    kF.type = 'lowpass'; kF.frequency.value = 1100;
    k1.connect(kF); k2.connect(kF); kF.connect(kAmp);
    this.evacGain = ctx.createGain();
    this.evacGain.gain.value = 0;
    eF.connect(this.evacGain); kAmp.connect(this.evacGain);
    this.evacGain.connect(this.sirenBus);
    e1.start(); e2.start(); eLfo.start(); k1.start(); k2.start(); kGate.start();
    // The slow one: a single long wail, then a long silence. Trouble, but nobody needs to run yet.
    this.slowGain = ctx.createGain();
    this.slowGain.gain.value = 0;
    this.slowGain.connect(this.sirenBus);
    // And a small electric alarm in the middle of the camp, which you only hear from close to.
    const bell = ctx.createOscillator(), bell2 = ctx.createOscillator(), bF = ctx.createBiquadFilter();
    bell.type = 'square'; bell2.type = 'square';
    bell.frequency.value = 1180; bell2.frequency.value = 1486;
    bF.type = 'bandpass'; bF.frequency.value = 1500; bF.Q.value = 1.1;
    this.beepAmp = ctx.createGain();
    this.beepAmp.gain.value = 0;
    this.beepOut = ctx.createGain();
    this.beepOut.gain.value = 0;
    this.beepPan = ctx.createStereoPanner();
    bell.connect(bF); bell2.connect(bF); bF.connect(this.beepAmp); this.beepAmp.connect(this.beepOut); this.beepOut.connect(this.beepPan); this.beepPan.connect(this.master);
    bell.start(); bell2.start();
  }

  // One horn: how much of the siren reaches you from it, from which side, and how much the distance has dulled it.
  speaker(k) {
    if (this.speakers[k]) return this.speakers[k];
    const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
    g.gain.value = 0;
    lp.type = 'lowpass'; lp.frequency.value = 6000;
    this.sirenBus.connect(g); g.connect(lp); lp.connect(p); p.connect(this.master); p.connect(this.sirenWet);
    return (this.speakers[k] = { g, lp, p });
  }

  // Points the horns at where you are standing. Close to a gate that gate is most of what you hear, and in the middle of the camp they
  // blend. They are balanced as a set, so standing among all of them is no louder than standing beside one.
  aimSirens(camp) {
    const l = this.listener, t = this.ctx.currentTime, cos = Math.cos(l.yaw), sin = Math.sin(l.yaw), horn = camp.gates;
    const raw = [], side = [], dist = [];
    let power = 0;
    for (const q of horn) {
      const dx = q.cx - l.x, dz = q.cz - l.z, d = Math.hypot(dx, dz);
      const v = 1 / (1 + (d / 130) * (d / 130));
      raw.push(v); dist.push(d); side.push((dx * cos + dz * sin) / (d + 12));
      power += v * v;
    }
    const k = power > 1 ? 1 / Math.sqrt(power) : 1;
    for (let i = 0; i < Math.max(horn.length, this.speakers.length); i++) {
      const s = this.speaker(i), on = i < horn.length;
      s.g.gain.setTargetAtTime(on ? raw[i] * k : 0, t, .12);
      if (!on) continue;
      s.p.pan.setTargetAtTime(Math.max(-1, Math.min(1, side[i])) * .85, t, .1);
      s.lp.frequency.setTargetAtTime(700 + 7000 / (1 + dist[i] / 45), t, .15);
    }
    const post = camp.post, dx = post.x - l.x, dz = post.z - l.z, d = Math.hypot(dx, dz);
    this.beepOut.gain.setTargetAtTime(.17 / (1 + (d / 20) * (d / 20)), t, .12);
    this.beepPan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (dx * cos + dz * sin) / (d + 6))) * .85, t, .1);
  }

  // The little alarm's pattern says how bad it is: an occasional blip, then steady pulses, then frantic.
  tickBeep(level) {
    const t = this.ctx.currentTime;
    if (t < (this.beepNext || 0)) return;
    const every = level === 2 ? .42 : level === 1 ? .95 : 2.6, on = level === 2 ? .22 : .16, g = this.beepAmp.gain;
    g.setValueAtTime(1, t);
    g.setValueAtTime(0, t + on);
    if (level === 1) { g.setValueAtTime(1, t + on * 1.6); g.setValueAtTime(0, t + on * 2.6); }
    this.beepNext = t + every;
  }

  slowWail() {
    const ctx = this.ctx, t = ctx.currentTime, dur = 6.5;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), env = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'triangle';
    for (const [osc, k] of [[o, 1], [o2, 1.004]]) {
      osc.frequency.setValueAtTime(190 * k, t);
      osc.frequency.linearRampToValueAtTime(430 * k, t + 2.6);
      osc.frequency.setValueAtTime(430 * k, t + 3.4);
      osc.frequency.linearRampToValueAtTime(170 * k, t + dur);
    }
    f.type = 'lowpass'; f.frequency.value = 900;
    env.gain.setValueAtTime(.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 1.6);
    env.gain.setValueAtTime(1, t + 3.6);
    env.gain.linearRampToValueAtTime(.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(env); env.connect(this.slowGain);
    o.start(t); o2.start(t);
    o.stop(t + dur + .1); o2.stop(t + dur + .1);
  }

  siren(x, z) {
    const ctx = this.ctx, s = this.spatial(x, 30, z, 200);
    const t = ctx.currentTime, dur = 5 + rand() * 4;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    const lf = ctx.createOscillator();
    lf.frequency.value = .28;
    const lg = ctx.createGain();
    lg.gain.value = 200;
    lf.connect(lg); lg.connect(o.frequency);
    o.frequency.value = 620;
    const g = this.out(s.gain * .1, s.pan, .9);
    const env = ctx.createGain();
    env.gain.setValueAtTime(.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 1.2);
    env.gain.linearRampToValueAtTime(.0001, t + dur);
    o.connect(env); env.connect(g);
    o.start(t); lf.start(t);
    o.stop(t + dur); lf.stop(t + dur);
  }

  // Everything goes quiet and far away as you drop off.
  muffle(on) {
    if (!this.ctx || !this.muffleF || this.muffled === on) return;
    this.muffled = on;
    const t = this.ctx.currentTime;
    this.muffleF.frequency.cancelScheduledValues(t);
    this.muffleF.frequency.setTargetAtTime(on ? 480 : 22000, t, on ? .12 : .2);
    this.muffleG.gain.cancelScheduledValues(t);
    this.muffleG.gain.setTargetAtTime(on ? .32 : 1, t, on ? .12 : .2);
  }

  duck(on) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(this.volume * (on ? .12 : 1), this.ctx.currentTime, on ? .35 : .6);
  }

  // camp is whichever camp's siren you can hear, or null. The horns carry the distance, so this only says which siren is going.
  // Leaving the game cuts it straight off; a siren winding down on its own takes its time.
  setAlarm(camp, level = 1, cut = false) {
    if (!this.ctx || !this.alarmGain) return;
    const evac = !!camp && level === 2;
    const g = camp && level === 1 ? .55 : 0, e = evac ? .8 : 0, w = camp && level === 0 ? .5 : 0;
    if (camp) {
      if (this.ctx.currentTime >= (this.hornNext || 0)) { this.hornNext = this.ctx.currentTime + .12; this.aimSirens(camp); }
      this.tickBeep(level);
    } else if (this.beepOut) this.beepOut.gain.setTargetAtTime(0, this.ctx.currentTime, .2);
    if (Math.abs(w - (this.slowWant ?? -1)) >= .004) {
      this.slowWant = w;
      this.slowGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.slowGain.gain.setTargetAtTime(w, this.ctx.currentTime, cut ? .08 : w ? .2 : .6);
    }
    if (w > 0) {
      if (this.ctx.currentTime >= (this.slowNext || 0)) { this.slowWail(); this.slowNext = this.ctx.currentTime + 18; }
    } else this.slowNext = 0;
    // Only when it actually changes: queueing a ramp every frame is how you lose a sound to its own schedule.
    if (Math.abs(g - (this.alarmWant ?? -1)) >= .004) {
      this.alarmWant = g;
      this.alarmGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.alarmGain.gain.setTargetAtTime(g, this.ctx.currentTime, cut ? .08 : g ? .5 : evac ? .25 : 1.4);
    }
    if (Math.abs(e - (this.evacWant ?? -1)) >= .004) {
      this.evacWant = e;
      this.evacGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.evacGain.gain.setTargetAtTime(e, this.ctx.currentTime, cut ? .08 : e ? .4 : 2.2);
    }
  }

  thunder(delay) {
    if (!this.ctx) return;
    setTimeout(() => {
      if (!this.ctx) return;
      const k = Math.max(.25, 1 - delay / 5);
      const dest = this.out(k * .9, (rand() - .5) * 1.4, .9);
      this.noiseBurst(dest, 2.6 + rand() * 2, 'lowpass', 220 + k * 500, 36, .4, 1.2, .03 + delay * .03);
      this.tone(dest, 2.6, 'sine', 60, 22, .8);
      for (let i = 0; i < 4; i++) setTimeout(() => { if (this.ctx) this.noiseBurst(dest, 1.1, 'lowpass', 150, 40, .4, .7, .1); }, 250 + rand() * 1800);
    }, delay * 1000);
  }

  tick(dt, st) {
    if (!this.ctx) return;
    const { nearZombies = 0, chasers = 0, sample = null, night = 0, height = 0, rain = 0, roof = 0, wind = .2, gust = .5, voices = 0, fireDist = 999, indoorsCamp = false, insects = 1 } = st;
    const t = this.ctx.currentTime;
    const near = Math.pow(Math.min(nearZombies, 900) / 900, .55);
    this.crowdGain.gain.setTargetAtTime(Math.min(.5, near * .34 + Math.min(chasers, 3000) / 3000 * .12), t, .6);
    // Wind fills the empty city. It drops away when anything else is going on.
    const busy = Math.min(1, near * 1.2 + voices * .03);
    const out = 1 - roof * .7;
    this.windGain.gain.setTargetAtTime((.08 + wind * .22 + Math.min(.18, height / 380)) * out * (1 - busy * .35), t, 1.2);
    this.windFilter.frequency.setTargetAtTime(240 + wind * 620, t, 1.5);
    this.whistleGain.gain.setTargetAtTime(Math.max(0, wind - .25) * .085 * out * (1 + rain * 1.4) * (.4 + .6 * Math.sin(t * .23) ** 2), t, 1);
    // In the rain the wind comes with it, rising and falling in gusts. It is weather, so being busy does not drown it out much; a roof does, a little.
    const swell = Math.max(0, gust) * (.75 + .25 * Math.sin(t * .9) * Math.sin(t * .37 + 1));
    this.stormGain.gain.setTargetAtTime(Math.min(1, rain * 1.3) * (.08 + .2 * swell) * (1 - roof * .5) * (1 - busy * .2), t, .9);
    this.stormFilter.frequency.setTargetAtTime(260 + 820 * swell * Math.min(1, rain * 1.2), t, 1.1);
    this.whistleFilter.frequency.setTargetAtTime(620 + 340 * Math.sin(t * .17), t, 1);
    // Rain, muffled by a roof.
    this.rainGain.gain.setTargetAtTime(Math.min(.32, rain * .32) * (1 - roof * .45), t, 1);
    this.rainFilter.frequency.setTargetAtTime(roof > .5 ? 1500 : 7500, t, .8);
    // Crickets at night, out in the quiet, far from camps and crowds.
    this.insectGain.gain.setTargetAtTime(night * (1 - rain) * out * (1 - busy) * .34 * insects, t, 2);
    this.fireGain.gain.setTargetAtTime(fireDist < 40 ? .28 * (1 - fireDist / 40) : 0, t, .6);
    // Only a real crowd makes a murmur: a few people talking is just them.
    this.murmurGain.gain.setTargetAtTime(Math.min(.075, Math.max(0, voices - 10) * .0016) * (1 - roof * .3) * (1 - near * .6), t, 1.5);

    this.moanTimer -= dt;
    if (this.moanTimer <= 0 && sample) {
      const rate = Math.min(9, 1 + nearZombies * .04);
      this.moanTimer = (.2 + rand() * .9) / rate * 2;
      const p = sample();
      if (p) this.moan(p[0], p[1], p[2], p[3] ? 1.25 : .9);
    }
    // Out here, not much. Now and then, something a long way off.
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = indoorsCamp ? 30 + rand() * 50 : 18 + rand() * 46;
      this.distantEvent(night);
    }
  }

  distantEvent(night) {
    const a = rand() * 6.28, d = 260 + rand() * 500;
    const l = this.listener;
    const x = l.x + Math.cos(a) * d, z = l.z + Math.sin(a) * d;
    const r = rand();
    if (r < .22) {
      const shots = 1 + Math.floor(rand() * 4);
      const kind = ['rifle', 'pistol', 'shotgun'][Math.floor(rand() * 3)];
      for (let i = 0; i < shots; i++) setTimeout(() => this.gun(kind, x, 20, z, true), i * (90 + rand() * 420));
    } else if (r < .3) {
      this.siren(x, z);
    } else if (r < .36) {
      this.explosion(x, 20, z, .7);
    } else if (r < .62) {
      // Metal working in the wind: a sign, a fire escape, a door nobody will shut.
      const s = this.spatial(x * .3 + l.x * .7, 30, z * .3 + l.z * .7, 90);
      const o = this.out(s.gain * .24, s.pan, .85);
      this.tone(o, 1.2 + rand(), 'sawtooth', 140 + rand() * 130, 85 + rand() * 60, .1);
      this.noiseBurst(o, .3, 'bandpass', 500, 300, 6, .12);
    } else if (r < .82 && !night) {
      // Crows. They are doing very well.
      const s = this.spatial(x * .25 + l.x * .75, 40, z * .25 + l.z * .75, 100);
      const n = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < n; i++) setTimeout(() => { if (this.ctx) this.tone(this.out(s.gain * .22, s.pan, .6), .17, 'sawtooth', 780 + rand() * 180, 430, .22); }, i * (240 + rand() * 180));
    } else {
      // A long way away, a dog that has not given up yet.
      const s = this.spatial(x, 20, z, 200);
      const n = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < n; i++) setTimeout(() => { if (this.ctx) this.tone(this.out(s.gain * .34, s.pan, .9), .12, 'sawtooth', 500, 250, .28); }, i * (280 + rand() * 120));
    }
  }
}
