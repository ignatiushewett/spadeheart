// The menu's music: after J.S. Bach, Prelude No. 1 (BWV 846), moved from C major into C minor and played slowly on a dark synthesised piano. Like every
// other sound in the game, nothing is recorded. Each bar is one chord broken into the same pattern, so this is mostly a list of chords.
const BARS = [
  'C4 Eb4 G4 C5 Eb5', 'C4 D4 Ab4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 Eb4 G4 C5 Eb5', 'C4 Eb4 Ab4 Eb5 Ab5', 'C4 D4 F#4 A4 D5', 'B3 D4 G4 D5 G5', 'B3 C4 Eb4 G4 C5',
  'Ab3 C4 Eb4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4', 'G3 Bb3 E4 G4 C#5', 'F3 Ab3 D4 Ab4 D5', 'F3 Ab3 D4 F4 B4', 'Eb3 G3 C4 G4 C5', 'Eb3 F3 Ab3 C4 F4',
  'D3 F3 Ab3 C4 F4', 'G2 D3 G3 B3 F4', 'C3 Eb3 G3 C4 Eb4', 'C3 G3 Bb3 C4 E4', 'F2 F3 Ab3 C4 Eb4', 'F#2 C3 A3 C4 Eb4', 'Ab2 F3 B3 C4 D4', 'G2 F3 G3 B3 D4',
  'G2 Eb3 G3 C4 Eb4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'G2 Eb3 A3 C4 F#4', 'G2 Eb3 G3 C4 G4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'C2 C3 G3 Bb3 E4',
];
// The last bars leave the pattern, and the end is one held chord.
const CODA = [
  'C2 C3 F3 Ab3 C4 F4 C4 Ab3 C4 Ab3 F3 Ab3 F3 D3 F3 D3',
  'C2 B2 G4 B4 D5 F5 D5 B4 D5 B4 G4 B4 D4 F4 Eb4 D4',
];
const LAST = 'C2 C3 Eb4 G4 C5';
const SIXTEENTH = .31;       // slower than it is usually played
const REST = 9;              // seconds of quiet before it comes round again
const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const midi = (name) => {
  const m = /^([A-G])([#b]?)(\d)$/.exec(name);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};

// Every note in the piece, in order: when (seconds from the start), which, and how hard.
function score() {
  const out = [];
  let t = 0;
  const bar = (notes, slow = 1) => {
    notes.forEach((n, i) => {
      const beat = i % 8 === 0;
      out.push({ t, m: midi(n), v: (beat ? .56 : .36 + (i % 8 > 4 ? .03 : 0) + (i > 7 ? .02 : 0)) });
      t += SIXTEENTH * slow;
    });
  };
  for (const chord of BARS) {
    const [a, b, c, d, e] = chord.split(' ');
    bar([a, b, c, d, e, c, d, e, a, b, c, d, e, c, d, e]);
  }
  bar(CODA[0].split(' '), 1.08);
  bar(CODA[1].split(' '), 1.2);
  // Rolled, not struck.
  LAST.split(' ').forEach((n, i) => out.push({ t: t + .55 + i * .14, m: midi(n), v: .5 }));
  return { notes: out, length: t + 7 + REST };
}

const SCORE = score();

export class MenuMusic {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.fade = ctx.createGain();
    this.fade.gain.value = 0;
    this.fade.connect(dest);
    this.dry = ctx.createGain();
    this.dry.gain.value = .85;
    this.dry.connect(this.fade);
    // A room of its own, warm and not very big. The reverb the guns use is a street.
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += ((Math.random() * 2 - 1) * Math.pow(1 - k, 3) - lp) * (.34 - k * .26);
        d[i] = lp;
      }
    }
    const room = ctx.createConvolver();
    room.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = .9;
    room.connect(wet);
    wet.connect(this.fade);
    this.room = room;
    // A soft felt piano: mostly the fundamental, with the upper partials there for the attack.
    const partials = [0, 1, .4, .16, .07, .03, .015, .006];
    this.wave = ctx.createPeriodicWave(new Float32Array(partials.length), Float32Array.from(partials));
    this.timer = 0;
    this.next = 0;
    this.origin = 0;
    this.endAt = 0;
  }

  // One note: struck, ringing down, and getting duller as it goes. Lower notes last longer.
  strike(at, m, v) {
    const ctx = this.ctx, f = 440 * Math.pow(2, (m - 69) / 12), ring = Math.max(2.8, Math.min(7.5, 8 - (m - 36) * .1));
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = .3;
    lp.frequency.setValueAtTime(Math.min(3400, f * (2.8 + v * 5)), at);
    lp.frequency.exponentialRampToValueAtTime(Math.max(180, f * 1.7), at + ring * .55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.0001, at);
    g.gain.exponentialRampToValueAtTime(v * .3, at + .012);
    g.gain.setTargetAtTime(v * .16, at + .012, .22);
    g.gain.setTargetAtTime(.0001, at + .5, ring / 4.5);
    lp.connect(g);
    g.connect(this.dry);
    g.connect(this.room);
    // Two strings a hair apart, so it breathes a little.
    for (const cents of [-1.6, 1.6]) {
      const o = ctx.createOscillator();
      o.setPeriodicWave(this.wave);
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(lp);
      o.start(at);
      o.stop(at + ring + .5);
    }
  }

  // Runs on a timer of its own and books ahead, so it keeps time while the game is busy loading the city.
  schedule() {
    const now = this.ctx.currentTime;
    // It plays on under the fade, and stops booking notes once nobody could hear them.
    if (this.endAt && now >= this.endAt) { clearInterval(this.timer); this.timer = 0; this.endAt = 0; return; }
    while (this.origin + SCORE.notes[this.next].t < now + 2) {
      const n = SCORE.notes[this.next];
      this.strike(Math.max(now + .02, this.origin + n.t + (Math.random() - .5) * .012), n.m, n.v * (.94 + Math.random() * .12));
      this.next++;
      if (this.next >= SCORE.notes.length) { this.next = 0; this.origin += SCORE.length; }
    }
  }

  ramp(to, secs) {
    const g = this.fade.gain, now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + secs);
  }

  play(fadeIn = 5) {
    this.endAt = 0;
    this.ramp(1, fadeIn);
    if (this.timer) return;
    this.next = 0;
    this.origin = this.ctx.currentTime + .4;
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 300);
  }

  // Leaves slowly. Whatever is already ringing rings on under the fade.
  stop(fadeOut = 6) {
    if (!this.timer || this.endAt) return;
    this.ramp(0, fadeOut);
    this.endAt = this.ctx.currentTime + fadeOut;
  }
}

export const SCORE_INFO = { notes: SCORE.notes.length, seconds: SCORE.length };
