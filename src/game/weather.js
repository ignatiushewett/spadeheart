// Weather: long spells of dry, drizzle and downpour, sliding into one another. Aimed at roughly
// 60% dry, 25% light rain and 15% pouring across a long session. Wind and gusts rise with the rain.
const rand = Math.random;

export const SPELLS = {
  dry: { share: .57, min: 340, max: 740, target: 0 },
  light: { share: .2, min: 220, max: 540, target: .3 },
  pour: { share: .23, min: 200, max: 460, target: .92 },
};

export class Weather {
  constructor() {
    this.spell = 'dry';
    this.timer = 90 + rand() * 300;
    this.rain = 0;
    this.wet = 0;
    this.time = rand() * 1000;
    this.windA = rand() * 6.283;
    this.windX = 0;
    this.windZ = 0;
    this.gust = 0;
    this.lightning = 0;
    this.boltT = 30;
    this.onThunder = null;
  }

  nextSpell() {
    let r = rand();
    for (const k of Object.keys(SPELLS)) {
      r -= SPELLS[k].share;
      if (r <= 0) return k;
    }
    return 'dry';
  }

  // The director's hand on the sky: this spell, for this long, starting now. It still takes a minute to roll in.
  cue(spell, seconds) {
    this.spell = spell;
    this.timer = seconds;
  }

  // Whatever the sky happens to be doing when you look at it, already under way.
  randomise() {
    this.spell = this.nextSpell();
    const s = SPELLS[this.spell];
    this.timer = s.min + rand() * (s.max - s.min);
    this.rain = s.target * (.7 + rand() * .25);
    this.wet = this.rain > .06 ? .35 + rand() * .55 : rand() < .3 ? rand() * .4 : 0;
    this.windA = rand() * 6.283;
    this.boltT = 12 + rand() * 40;
  }

  // A fresh start: the first thing you see of the city is a dry morning.
  clearSky() {
    this.spell = 'dry';
    this.timer = 90 + rand() * 300;
    this.rain = 0;
    this.wet = 0;
    this.lightning = 0;
  }

  update(dt) {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.spell = this.nextSpell();
      const s = SPELLS[this.spell];
      this.timer = s.min + rand() * (s.max - s.min);
    }
    const t = this.time;
    // Bands of heavier and lighter rain move through inside a spell, so it never just sits at one level.
    const breath = .78 + .16 * Math.sin(t * .021) + .1 * Math.sin(t * .067 + 1.3) + .05 * Math.sin(t * .19);
    const want = SPELLS[this.spell].target * breath;
    this.rain += (want - this.rain) * Math.min(1, dt / (want > this.rain ? 55 : 80));
    if (this.rain < .004 && want === 0) this.rain = 0;
    this.wet += (this.rain > .06 ? (dt / 70) * Math.min(1, this.rain * 3) : -dt / 340);
    this.wet = Math.max(0, Math.min(1, this.wet));
    this.windA += (Math.sin(t * .013) * .05 + (rand() - .5) * .02) * dt;
    this.gust = .55 + .45 * Math.sin(t * .31) * Math.sin(t * .087 + 2);
    // Rain always comes with some wind behind it.
    const blow = (.12 + Math.min(1, this.rain * 6) * .3 + this.rain * .85) * (.7 + this.gust * .6);
    this.windX = Math.cos(this.windA) * blow;
    this.windZ = Math.sin(this.windA) * blow;
    this.lightning = Math.max(0, this.lightning - dt * 5.5);
    if (this.rain > .62) {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 22 + rand() * 70;
        this.lightning = .6 + rand() * .4;
        if (this.onThunder) this.onThunder(.6 + rand() * 3.4);
      }
    }
  }

  // The sky you left is the sky you come back to, puddles and all.
  toSave() {
    return { spell: this.spell, timer: this.timer, rain: this.rain, wet: this.wet, time: this.time, windA: this.windA, boltT: this.boltT };
  }

  fromSave(d) {
    if (!d || !SPELLS[d.spell]) return;
    Object.assign(this, d);
  }

  // Share of time spent at each level over a long run: dry, light, pouring.
  static sample(seconds) {
    const w = new Weather();
    w.onThunder = null;
    const n = [0, 0, 0];
    for (let i = 0; i < seconds; i++) {
      w.update(1);
      if (w.rain < .08) n[0]++;
      else if (w.rain < .5) n[1]++;
      else n[2]++;
    }
    return n.map((v) => v / seconds);
  }
}
