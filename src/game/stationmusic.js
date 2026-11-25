// The civilian stations' music: a handful of upbeat little instrumentals, the kind a station keeps on a loop between the talking, played
// one after another, round and round. Made here, note by note, a moment ahead of when it is heard: a drum kit, a bass line, a rhythm
// part on the off beats, a pad under the choruses and a tune over the top that comes back round the way a hook does. It comes out of one
// place and goes two ways: to your own radio, if you have tuned in, and out of the speakers dotted about the settlements, quietly, for
// whoever is near enough to hear them.

const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// Each song: its tempo and key, the chords of its verse and its chorus (a bar each), how it is played, and a little swing.
// key is the tonic as a note number; the tune is picked from the major or minor pentatonic over it, so it sits on any of the chords.
const SONGS = [
  { bpm: 112, key: 60, minor: false, swing: .06, feel: 'pop',
    verse: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]],
    chorus: [[53, 57, 60, 64], [55, 59, 62, 65], [52, 55, 59, 62], [57, 60, 64, 67]] },
  { bpm: 98, key: 57, minor: true, swing: .14, feel: 'funk',
    verse: [[57, 60, 64, 67], [57, 60, 64, 67], [62, 65, 69, 72], [64, 68, 71, 74]],
    chorus: [[53, 57, 60, 64], [55, 59, 62, 65], [57, 60, 64, 67], [64, 68, 71, 74]] },
  { bpm: 122, key: 62, minor: false, swing: 0, feel: 'drive',
    verse: [[62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]],
    chorus: [[55, 59, 62], [57, 61, 64], [59, 62, 66], [57, 61, 64]] },
  { bpm: 104, key: 55, minor: false, swing: .1, feel: 'skank',
    verse: [[55, 59, 62], [60, 64, 67], [55, 59, 62], [62, 66, 69]],
    chorus: [[60, 64, 67], [62, 66, 69], [55, 59, 62], [52, 55, 59]] },
];
// Intro, verse, chorus, verse, chorus, a last chorus, and out: about a minute and a half.
const FORM = [['intro', 2], ['verse', 8], ['chorus', 8], ['verse', 8], ['chorus', 8], ['chorus', 4], ['outro', 2]];
const FORM_BARS = FORM.reduce((s, f) => s + f[1], 0);

// The same tune every time a song comes round: its notes are picked by a seeded hand, not a fresh roll.
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

export class StationMusic {
  constructor(ctx, radioDest, worldDest) {
    this.ctx = ctx;
    // A small, boxy sound: what comes out of a cheap speaker.
    const hp = ctx.createBiquadFilter(), lp = ctx.createBiquadFilter(), level = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 95;
    lp.type = 'lowpass'; lp.frequency.value = 4200;
    level.gain.value = 2.6;
    level.connect(hp); hp.connect(lp);
    this.radio = ctx.createGain(); this.radio.gain.value = 0;
    this.world = ctx.createGain(); this.world.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    lp.connect(this.radio); this.radio.connect(radioDest);
    lp.connect(this.world); this.world.connect(this.pan); this.pan.connect(worldDest);
    // One bus for each part, each with its own tone.
    const bus = (type, f, q = .7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.connect(level); return b; };
    this.drums = bus('lowpass', 9000);
    this.bass = bus('lowpass', 650, 1.2);
    this.keys = bus('lowpass', 2300);
    this.pad = bus('lowpass', 1500);
    this.lead = bus('lowpass', 3600);
    // The tune with a slap of echo on it.
    const echo = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    echo.delayTime.value = .27; fb.gain.value = .28; wet.gain.value = .3;
    this.lead.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(level);
    const n = ctx.createBuffer(1, Math.floor(ctx.sampleRate * .5), ctx.sampleRate), d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.song = Math.floor(Math.random() * SONGS.length);
    this.bar = 0; this.step = 0;
    this.next = ctx.currentTime + .2;
    this.hooks = SONGS.map((s, i) => ({ verse: this.hook(s, i * 31 + 1, .42), chorus: this.hook(s, i * 31 + 2, .6) }));
  }

  // A two-bar phrase on a sixteenth grid: which steps have a note, which note of the scale, and how long it is held.
  hook(s, seed, busy) {
    const rnd = seeded(seed), scale = s.minor ? [0, 3, 5, 7, 10, 12, 15, 17] : [0, 2, 4, 7, 9, 12, 14, 16];
    const out = [];
    let at = 0, deg = 3;
    while (at < 32) {
      const strong = at % 4 === 0;
      if (rnd() < (strong ? busy + .2 : busy * .55)) {
        deg = Math.max(0, Math.min(scale.length - 1, deg + Math.round((rnd() - .5) * 4)));
        const len = rnd() < .3 ? 4 : rnd() < .5 ? 2 : 1;
        out.push({ at, note: s.key + 12 + scale[deg], len });
        at += len;
      } else at += 1;
    }
    // The phrase comes to rest on the key note.
    if (out.length) out[out.length - 1].note = s.key + 12 + (rnd() < .5 ? 0 : 12);
    return out;
  }

  // How loud on your radio, and how loud and from which side out of the nearest speaker. Called every frame.
  set(radio, world, pan) {
    const t = this.ctx.currentTime;
    if (Math.abs(radio - (this.rWant ?? -1)) > .003) { this.rWant = radio; this.radio.gain.setTargetAtTime(radio, t, .25); }
    if (Math.abs(world - (this.wWant ?? -1)) > .003) { this.wWant = world; this.world.gain.setTargetAtTime(world, t, .3); }
    this.pan.pan.setTargetAtTime(pan, t, .1);
    this.schedule(radio > .001 || world > .001);
  }

  // Everything due in the next little while. With nobody listening the song still goes on, unheard, so it is where it should be later.
  schedule(heard) {
    const ctx = this.ctx, ahead = ctx.currentTime + .6;
    if (this.next < ctx.currentTime - 1) this.next = ctx.currentTime + .05;
    while (this.next < ahead) {
      const s = SONGS[this.song], six = 15 / s.bpm;
      if (heard && this.bar >= 0) this.play(s, this.next);
      this.next += this.step % 2 === 0 ? six * (1 + s.swing) : six * (1 - s.swing);
      if (++this.step >= 16) {
        this.step = 0;
        // A beat of quiet between songs, then the next one.
        if (++this.bar >= FORM_BARS) { this.bar = -1; this.song = (this.song + 1) % SONGS.length; }
      }
    }
  }

  // Where in the song a bar falls: which part, and how far into it.
  part(bar) {
    let b = bar;
    for (const [name, n] of FORM) { if (b < n) return { name, at: b, len: n }; b -= n; }
    return { name: 'outro', at: 0, len: 1 };
  }

  play(s, t) {
    const st = this.step, six = 15 / s.bpm, p = this.part(this.bar), name = p.name;
    const prog = name === 'chorus' ? s.chorus : s.verse, chord = prog[(name === 'intro' || name === 'outro' ? 0 : p.at) % prog.length];
    const root = chord[0] - 24, last = p.at === p.len - 1, full = name === 'chorus';
    const fill = last && st >= 12 && name !== 'outro';
    // Drums.
    const kick = s.feel === 'drive' ? st % 4 === 0 : s.feel === 'funk' ? [0, 6, 10].includes(st) : s.feel === 'skank' ? st === 8 : [0, 8, 10].includes(st);
    if (kick && !(name === 'outro' && p.at === 1 && st > 0)) this.kick(t);
    if ((st === 4 || st === 12) && name !== 'intro') this.snare(t, .5);
    if (fill && st % 2 === 1) this.snare(t, .22 + (st - 12) * .05);
    if (s.feel === 'skank' && st === 8) this.snare(t, .35);
    const hat = full || s.feel === 'funk' ? true : st % 2 === 0;
    if (hat && !fill) this.hat(t, st % 4 === 2 ? .2 : .1, s.feel !== 'drive' && st === 14 && full);
    if (name === 'outro' && p.at === 1) return;
    // Bass: on the root, up to the octave and the fifth, and a step into the next chord.
    const bp = s.feel === 'drive' ? [0, 2, 4, 6, 8, 10, 12, 14] : s.feel === 'funk' ? [0, 3, 6, 7, 10, 14] : s.feel === 'skank' ? [0, 6, 8, 14] : [0, 6, 8, 11, 14];
    if (bp.includes(st)) {
      const k = bp.indexOf(st);
      const m = st === 14 && s.feel !== 'drive' ? root + 7 : s.feel === 'funk' && k % 2 ? root + 12 : st === 8 && s.feel !== 'drive' ? root + 7 : root;
      this.voice(this.bass, t, hz(m), six * (s.feel === 'drive' ? 1.7 : 1.5), 'sawtooth', .2, .004);
    }
    // The rhythm part: chords chopped on the off beats, or pushed on the and of two.
    const kp = s.feel === 'skank' ? [4, 12] : s.feel === 'funk' ? [2, 5, 10, 13] : s.feel === 'drive' ? [0, 3, 6, 10, 12] : [2, 6, 10, 14];
    if (name !== 'intro' && kp.includes(st)) for (const m of chord) this.voice(this.keys, t, hz(m), six * (s.feel === 'drive' ? 1.6 : .9), 'square', .032, .003);
    // A pad held under the choruses.
    if (full && st === 0) for (const m of chord) { this.voice(this.pad, t, hz(m) * 1.003, six * 15.5, 'sawtooth', .018, .12); this.voice(this.pad, t, hz(m) * .997, six * 15.5, 'sawtooth', .018, .12); }
    // The tune: in the second half of each verse and all through the choruses, the hook played twice over, the octave up in the chorus.
    if ((name === 'verse' && p.at >= 4) || full) {
      const hook = this.hooks[this.song][full ? 'chorus' : 'verse'], pos = (p.at % 2) * 16 + st;
      for (const q of hook) if (q.at === pos) this.voice(this.lead, t, hz(q.note + (full ? 12 : 0)), six * q.len * .95, 'square', .045, .006, true);
    }
  }

  // One note on one part. A little vibrato on the held tune notes.
  voice(dest, t, f, dur, type, peak, attack, vib = false) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    if (vib && dur > .25) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * .008, t + dur * .6);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + .05);
    }
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.setValueAtTime(peak, t + Math.max(attack, dur * .55));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + .05);
  }

  kick(t) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + .12);
    g.gain.setValueAtTime(.55, t); g.gain.exponentialRampToValueAtTime(.0001, t + .28);
    o.connect(g); g.connect(this.drums);
    o.start(t); o.stop(t + .3);
  }

  snare(t, peak) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = this.noise;
    f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = .8;
    g.gain.setValueAtTime(peak * .5, t); g.gain.exponentialRampToValueAtTime(.0001, t + .16);
    src.connect(f); f.connect(g); g.connect(this.drums);
    src.start(t, Math.random() * .3); src.stop(t + .18);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + .06);
    og.gain.setValueAtTime(peak * .3, t); og.gain.exponentialRampToValueAtTime(.0001, t + .08);
    o.connect(og); og.connect(this.drums); o.start(t); o.stop(t + .1);
  }

  hat(t, peak, open = false) {
    const ctx = this.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), len = open ? .22 : .045;
    src.buffer = this.noise;
    f.type = 'highpass'; f.frequency.value = 7200;
    g.gain.setValueAtTime(peak * .5, t); g.gain.exponentialRampToValueAtTime(.0001, t + len);
    src.connect(f); f.connect(g); g.connect(this.drums);
    src.start(t, Math.random() * .3); src.stop(t + len + .02);
  }
}
