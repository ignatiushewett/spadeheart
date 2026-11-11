// The director. The city has a story to tell and it tells it slowly, in the way RimWorld's storytellers do: long
// stretches of ordinary trouble, a crowd that is seen building days before it arrives, a battle at dusk with the rain
// coming in, then a while to bury people and count what is left. Every camp holds its own fate. It wins most of its
// fights and looks fine for a long time, but each win costs it something that does not come back, and one evening
// it stops winning. By then everyone can see it coming, and the people who can walk are already walking.
import { CAMP_START, CITIZENSHIP } from './items.js';
import { LORE } from './camplore.js';
import { OP_NOTICE, OP_GAP } from './campsim.js';

const rand = Math.random;
const DAY = 1500;       // seconds in a day
const DUSK = .72;       // when the worst of it likes to arrive

// The last evening a camp is likely to see. The poor go first and the rich take a long time about it.
// Operations run their full length now, so every camp gets a couple more days than it used to.
const FATE = { tompkins: [12, 14], garvey: [15, 17], wash: [18, 21], morning: [23, 27], tryon: [28, 32], battery: [33, 38], union: [46, 52], sheep: [52, 58], bryant: [58, 68] };
const RESETTLED_FATE = [14, 22];
const TIER_SIZE = { Poor: .8, Middling: 1, Strong: 1.6, Wealthy: 1.75 };
// Being there buys a camp time, but never much of it.
const MAX_CREDIT = 1;
const CREDIT_PER_DEFENCE = .34;

const OMENS = [
  (side) => `Scouts are coming in from the ${side}. A lot of them are moving, and it is not stopping at the usual blocks.`,
  (side) => `Rooftop watch has a crowd building to the ${side}. Could be nothing. It is never nothing.`,
  (side) => `They are thick on the ${side} side this evening. Get your people fed and get some rest while you can.`,
  (side) => `Something has stirred up the ${side} blocks. We can hear it from here. Check your ammunition.`,
];
// The night the wall gives sounds like a bad night, not like the end: nobody on the radio knows it is the last one, and nobody says so.
const LAST_OMENS = [
  (side) => `It is the whole ${side} side of the neighbourhood. I have never seen this many. Everyone who can hold a gun, on the wall.`,
  (side) => `Biggest crowd we have seen, coming from the ${side}. Every gun on the wall, and nobody sleeps tonight.`,
];
const HORNS = ['Here they come. All guns to the wall.', 'I can see them from up here. Everybody up.', 'Eyes up, everyone. They are on the road.'];

const pickFrom = (a) => a[Math.floor(rand() * a.length)];

export const SIDE_NAMES = ['north', 'east', 'south', 'west'];
export const sideOf = (dir) => SIDE_NAMES[Math.floor(((dir + Math.PI * .25) / (Math.PI * 2)) * 4 + 4) % 4];

export class Director {
  constructor(game) {
    this.g = game;
    this.reset();
  }

  reset() {
    this.plans = this.g.layout.camps.map((c) => this.planFor(c, 1));
    this.waveT = 420;        // the first days are quiet enough to learn the city
    this.raidAt = 3 + rand() * 1.5;
    this.restUntil = 0;
    this.migT = 25;
    this.driftT = 30;
    this.displaced = [];     // people on the road between camps
  }

  planFor(c, from) {
    const [lo, hi] = FATE[c.key] || RESETTLED_FATE;
    const span = from > 1 ? RESETTLED_FATE : [lo, hi];
    const doom = from + (from > 1 ? 0 : -1) + span[0] + Math.floor(rand() * (span[1] - span[0] + 1));
    const m = { doom, credit: 0, from, next: 0, stage: 0, dir: 0, fatal: false, size: 0, harm: 0 };
    // A new game gets at least four quiet days before the first operation anywhere, a little more or less each time.
    const first = from <= 1 ? 4 + rand() * 1.6 : 3;
    this.scheduleNext(m, from + Math.min(Math.max(6, first), Math.max(first, (doom - from) * .25)));
    return m;
  }

  // The evening the walls finally give.
  lastEvening(m) { return m.doom + Math.floor(m.credit) + DUSK; }

  // Mostly at dusk. A battle should be something you can see coming across the rooftops, with the light going.
  hourFor(day) {
    const r = rand();
    return Math.floor(day) + (r < .62 ? .69 + rand() * .08 : r < .82 ? .84 + rand() * .12 : .36 + rand() * .24);
  }

  scheduleNext(m, earliest) {
    const end = this.lastEvening(m);
    const t = this.hourFor(earliest);
    m.fatal = t >= end - .9;
    m.next = m.fatal ? end : Math.max(t, earliest);
    m.stage = 0;
    m.within = false;
  }

  // An operation has just ended. Whatever was coming next waits until the camp has had its days of peace, and if that runs past
  // what would have been its last evening, then that evening waits as well. The operation opens a little before the attack does.
  opEnded(c, now) {
    const m = this.plans[c.id], earliest = now + OP_GAP + .21;
    if (m.next >= earliest || m.stage > 0) return;
    const end = this.lastEvening(m);
    if (end < earliest) m.doom += Math.ceil(earliest - end);
    this.scheduleNext(m, earliest);
  }

  // How much of a camp is left, from 1 (what it was built to be) down to nothing.
  strength(c) {
    const s = this.g.campSim.state[c.id];
    return Math.min(1, (s.guards / Math.max(1, c.guards.length)) * .4 + (s.folk / Math.max(1, c.folk)) * .6);
  }

  // How much of it should be left by now. It stays near the top for most of its life, then the bottom goes out of it.
  curve(c, now) {
    const m = this.plans[c.id], end = this.lastEvening(m);
    const k = Math.max(0, Math.min(1, (now - m.from) / Math.max(1, end - m.from)));
    return 1 - Math.pow(k, 2.4);
  }

  // --- Time -----------------------------------------------------------------------------------------
  update(dt) {
    this.step(this.g.day + this.g.tod, dt);
    this.migration(dt);
  }

  // Also called for each slice of time you sleep through.
  step(now, dt) {
    const g = this.g, sim = g.campSim, camps = g.layout.camps;
    for (const c of camps) {
      const s = sim.state[c.id];
      if (s.status === 'holding') {
        sim.morningReport(c, s, now);
        this.tend(c, s, this.plans[c.id], now);
        this.resist(c, s, this.plans[c.id], now);
        if (s.status === 'holding') { sim.tickOp(c, s, this.plans[c.id], now); sim.recruit(c, s, now); sim.wearTick(c, s, now); }
      }
    }
    this.minorTrouble(now, dt);
    this.raids(now);
    this.roads(now, dt);
    if ((this.driftT -= dt) <= 0) { g.horde.drift(.02); this.driftT = 30; }
  }

  // Every camp is somewhere on its way to its next bad evening.
  tend(c, s, m, now) {
    const sim = this.g.campSim;
    // An operation has run as long as it is going to: no more waves on top of it. The crowd that is there is finished off, it ends,
    // and the next one waits for the break, unless this camp's last evening is too close to give it one.
    const op = s.op;
    if (op && op.cap && now - op.start >= op.cap && !m.fatal && m.stage === 0 && this.lastEvening(m) - now > OP_GAP + 2 && m.next < now + OP_GAP) {
      this.scheduleNext(m, now + OP_GAP + .6);
    }
    const lead = m.next - now;
    if (lead < OP_NOTICE && m.next < 1e8) {
      if (s.opNext) { if (!s.opNext.emergency) s.opNext.at = m.next; }
      else sim.noticeOp(c, s, m);
    }
    if (m.stage === 0 && lead < .2) this.omen(c, s, m);
    if (m.stage === 1 && lead < .04) this.horn(c, s, m);
    if (m.stage >= 1) this.gather(c, s, m);
    if (lead > 0) return;
    // Busy with something else: it waits a moment, then comes in behind it.
    if (s.pool > 0 || s.raid) { m.next = now + .04; return; }
    this.gatherEnd(c, m);
    sim.startWave(c.id, m.size, { major: true, fatal: m.fatal, harm: m.harm, dir: m.dir });
    if (!m.fatal) {
      // An operation is a horde on the move for days, not one evening: until it has run its length the push keeps coming, a smaller wave
      // every half a day or so, at any hour. However fast the last one was put down, the next is already on its way.
      // It builds. Early on the follow-ups are thin and far apart: time to sleep, patch the wall and get out on a job. Towards the
      // end of its length they come closer together and bigger, and the last days are the hard ones.
      const op = sim.state[c.id].op;
      const p = op && op.cap ? Math.min(1, Math.max(0, (now - op.start) / op.cap)) : 1;
      const end = this.lastEvening(m), soon = now + (.55 + rand() * .3) * (1 - p * .55);
      if (op && op.cap && now - op.start < op.cap - .35 && soon < end - 1.2) { m.next = soon; m.stage = 0; m.fatal = false; m.within = true; }
      else {
        m.within = false;
        const gap = Math.max(1.6, Math.min(4, (end - DUSK - now) * .3));
        this.scheduleNext(m, now + gap * (.85 + rand() * .3));
      }
    } else m.next = 1e9;
    // A while to bury people and count what is left, around here at least.
    if (sim.state[c.id].real) this.restUntil = now + .16;
  }

  // Between the bad evenings a camp is not just waiting. It sends out supply runs, takes people in, patches the wall,
  // and every so often it goes out and hits them first.
  resist(c, s, m, now) {
    if (m.resistAt === undefined) m.resistAt = now + .5 + rand();
    if (now < m.resistAt) return;
    if (s.drawing || s.pool > 0 || s.raid || s.evac || s.fatal || m.stage > 0) { m.resistAt = now + .08; return; }
    m.resistAt = now + .7 + rand() * 1.1;
    const g = this.g, sim = g.campSim, room = Math.min(1.05, this.curve(c, now) + .3), left = this.strength(c);
    const options = ['sortie'];
    if (left < room) options.push('people', 'people', 'people');
    if (s.ammo < 85) options.push('supply', 'supply');
    if (s.wall < 85) options.push('repair');
    const what = options[Math.floor(rand() * options.length)];
    if (what === 'people') {
      const n = Math.max(3, Math.round(c.folk * (.035 + rand() * .05))), armed = Math.max(1, Math.round(c.guards.length * (.03 + rand() * .05)));
      s.folk = Math.min(c.folk * 1.1, s.folk + n);
      s.guards = Math.min(c.guards.length, s.guards + armed);
      sim.radio(c, pickFrom([`${n} survivors came in through the gate this morning. ${armed} of them can shoot. Welcome back to the living.`, `The search party found ${n} people holed up on an upper floor. Get them fed. ${armed} are going straight on the wall.`, `We are ${n} stronger tonight. People heard we were still fighting, and they came.`]));
    } else if (what === 'supply') {
      const n = 18 + Math.round(rand() * 24);
      s.ammo = Math.min(100, s.ammo + n);
      sim.radio(c, pickFrom(['The supply run is back, all of them, with crates. We can keep shooting.', 'Found an armoury nobody had got to. Ammunition is back up.', 'Salvage crew just came in loaded. That buys us another fight.']));
    } else if (what === 'repair') {
      s.wall = Math.min(100, s.wall + 20 + rand() * 20);
      sim.radio(c, pickFrom(['Work crews finished the damaged stretch. It is stronger than it was.', 'The wall is patched. Good work, everyone.', 'Double layer on the bad section now. Let them try it again.']));
    } else {
      // Out through the gate, clear a few blocks, and back before they know what happened.
      const a = rand() * Math.PI * 2, r = Math.max(c.x1 - c.x0, c.z1 - c.z0) / 2 + 110;
      const x = c.cx + Math.sin(a) * r, z = c.cz - Math.cos(a) * r;
      const n = g.horde.thinAround(x, z, 90, .1 + rand() * .1);
      s.tally += n;
      if (!m.fatal && m.stage === 0) m.next = Math.max(m.next, Math.min(m.next + .1 + rand() * .2, this.lastEvening(m) - 1));
      sim.radio(c, `We hit them first. A sortie went out the ${sideOf(a)} side and put down ${n.toLocaleString('en-US')} before they could form up. That is a few more quiet days.`);
      if (s.real) g.npcs.sortie(c);
    }
  }

  // Sized by day and by what the camp can field, so a strong camp's bad evening is every bit as big as it looks.
  sizeFor(c, fatal) {
    const k = TIER_SIZE[CAMP_START[c.key].tier] || 1, day = this.g.day;
    const count = this.g.campSim.state[c.id].opCount || 1;
    const base = (340 + 90 * day) * k * Math.pow(this.g.horde.settings.horde, .8) * (.85 + rand() * .3) * (1 + .12 * Math.min(5, count - 1));
    return Math.round(base * (fatal ? 2.6 : .55 + .45 * this.g.campSim.ramp()));
  }

  // How big an operation's follow-up wave is against the one that opened it: a quarter early on, three quarters by the end.
  withinK(s, now) {
    const op = s.op, p = op && op.cap ? Math.min(1, Math.max(0, (now - op.start) / op.cap)) : 1;
    return .25 + .5 * p * p;
  }

  // What it will cost them this time: whatever it takes to bring them down to where they ought to be by next time.
  harmFor(c, m, now) {
    if (m.fatal) return 1;
    const gap = m.within ? .5 : Math.max(1.6, Math.min(4, (this.lastEvening(m) - DUSK - now) * .3));
    const left = this.strength(c), aim = this.curve(c, now + gap);
    // The early follow-ups cost little; the hurt comes with the late ones.
    if (m.within && !m.fatal) return Math.max(.01, Math.min(.42, Math.min(left - aim, left - .2)) * (.35 + .65 * this.withinK(this.g.campSim.state[c.id], now) / .75));
    return Math.max(.015, Math.min(.42, Math.min(left - aim, left - .2)));
  }

  isNear(c) {
    const P = this.g.player;
    return this.g.player.home === c.id || Math.hypot(c.cx - P.x, c.cz - P.z) < 800;
  }

  omen(c, s, m) {
    const g = this.g, sim = g.campSim, now = g.day + g.tod;
    m.stage = 1;
    m.dir = rand() * Math.PI * 2;
    m.fatal = m.next >= this.lastEvening(m) - .001;
    // The follow-up waves of an operation are its stragglers and second pushes: a good deal smaller than what opened it.
    m.size = Math.round(this.sizeFor(c, m.fatal) * (m.within && !m.fatal ? this.withinK(s, now) : 1));
    m.harm = this.harmFor(c, m, now);
    sim.openOp(c, s);
    const side = sideOf(m.dir), lore = LORE[c.key], who = lore.cast.find((q) => q.role === 'captain') || lore.cast.find((q) => q.role === 'leader');
    const pool = m.fatal ? LAST_OMENS : OMENS;
    sim.radio(c, pool[Math.floor(rand() * pool.length)](side), sim.dead[who.id] ? c.name : who.name);
    // The big nights come with the weather. It makes for a bad time to be on a wall, and you will remember it.
    if (this.isNear(c) && !sim.passing) {
      const r = rand();
      if (r < (m.fatal ? .85 : .5)) g.weather.cue('pour', 520 + rand() * 300);
      else if (r < (m.fatal ? .95 : .72)) g.weather.cue('light', 400 + rand() * 200);
    }
  }

  horn(c, s, m) {
    const sim = this.g.campSim;
    m.stage = 2;
    if (s.real) {
      const st = this.g.npcs.camps[c.id];
      const who = st.guards[Math.floor(rand() * st.guards.length)];
      if (who) this.g.npcs.bark(who, HORNS[Math.floor(rand() * HORNS.length)], 90);
    }
    sim.radio(c, HORNS[Math.floor(rand() * HORNS.length)]);
  }

  // If you are there to see it, you see it: the street out past the wall slowly fills up.
  gather(c, s, m) {
    if (!s.real || this.g.campSim.passing) return;
    const g = this.g;
    const hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2, ux = Math.sin(m.dir), uz = -Math.cos(m.dir);
    const out = Math.min(hx / (Math.abs(ux) + .001), hz / (Math.abs(uz) + .001)) + 58;
    if (!m.gx) {
      m.gx = Math.floor(c.cx + ux * out); m.gz = Math.floor(c.cz + uz * out);
      m.gathered = 0;
      m.gatherT = 0;
    }
    g.horde.setMigrationTarget(c.id + 1000, m.gx, m.gz);
    if ((m.gatherT -= g.frameDt || .016) > 0 || m.gathered > Math.min(320, m.size * .16)) return;
    m.gatherT = 1.5;
    m.gathered += g.horde.sendMigrants(m.gx, m.gz, 8, 100, 170);
  }

  // Everything that has been standing out there all evening starts for the wall at once.
  gatherEnd(c, m) {
    const H = this.g.horde;
    H.clearMigrationTarget(c.id + 1000);
    if (m.gathered) H.releaseMigrants(c, m.gx, m.gz, 70);
    m.gx = 0; m.gathered = 0;
  }

  // Ordinary trouble: small crowds leaning on one wall or another, all the time, all over the island.
  minorTrouble(now, dt) {
    const g = this.g, sim = g.campSim, P = g.player;
    if (sim.elapsed < 60) return;
    this.waveT -= dt;
    if (this.waveT > 0) return;
    const left = g.layout.camps.filter((c) => sim.state[c.id].status === 'holding').length;
    this.waveT = (260 + rand() * 300) / (1 + (sim.pressure() - 1) * .18) * 9 / Math.max(1, left);
    const weights = g.layout.camps.map((c) => {
      const s = sim.state[c.id], m = this.plans[c.id];
      if (s.status !== 'holding' || s.pool > 0 || s.raid || m.stage > 0) return 0;
      // A settlement in an operation has waves enough of its own, paced to build towards the end. Everyday trouble on top of that
      // was what made the first days of a long one wall-to-wall.
      if (s.op) return 0;
      if (sim.passing) return P.home === c.id ? 5 : 1;
      const d = Math.hypot(c.cx - P.x, c.cz - P.z), close = d < 500;
      if (close && now < this.restUntil) return 0;
      return 1 + (close ? 3 : d < 1200 ? 1.5 : 0) + (P.home === c.id ? 3 : 0);
    });
    const id = this.pick(weights);
    if (id < 0) return;
    const size = Math.round((110 + rand() * 230) * Math.pow(sim.pressure(), .7) * Math.pow(g.horde.settings.horde, .8) * (.6 + .4 * sim.ramp()));
    sim.startWave(id, size, { harm: .004 + rand() * .006 });
  }

  // Now and then a crew comes over somebody's wall in the quiet after a fight. It is not a siege, it is a bad afternoon.
  raids(now) {
    if (now < this.raidAt) return;
    const g = this.g, sim = g.campSim, P = g.player;
    const weights = g.layout.camps.map((c) => {
      const s = sim.state[c.id], m = this.plans[c.id];
      // They wait until the camp has stopped fighting and started counting. Nothing is due soon, and nothing has just happened.
      if (s.status !== 'holding' || s.pool > 0 || s.raid || s.drawing || s.rec || s.cascadeT > 0 || m.stage > 0 || m.next - now < .5 || now - (s.calmFrom || 0) < .2) return 0;
      if (sim.passing) return 1;
      return 1 + (Math.hypot(c.cx - P.x, c.cz - P.z) < 500 ? 2 : 0) + (P.home === c.id ? 4 : 0);
    });
    const id = this.pick(weights);
    if (id < 0) { this.raidAt = now + .1; return; }
    this.raidAt = now + 2.2 + rand() * 2.4;
    sim.startRaid(id, 6 + Math.floor(rand() * 5) + Math.min(5, Math.floor(g.day / 5)));
  }

  pick(weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    if (!total) return -1;
    let r = rand() * total;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return -1;
  }

  // Someone helped them hold. It buys them a little time, and only a little.
  defended(c) {
    const m = this.plans[c.id];
    if (m.fatal && m.stage > 0) return;
    const wasLast = m.fatal;
    m.credit = Math.min(MAX_CREDIT, m.credit + CREDIT_PER_DEFENCE);
    if (wasLast) m.next = this.lastEvening(m);
  }

  resettled(c) {
    const now = this.g.day + this.g.tod;
    this.plans[c.id] = this.planFor(c, now);
  }

  newDay() {
    const g = this.g, sim = g.campSim, now = g.day + g.tod;
    g.horde.growth = 1 + Math.min(1.2, (g.day - 1) * .04);
    for (const c of g.layout.camps) {
      const s = sim.state[c.id];
      if (s.status !== 'holding') continue;
      const left = this.strength(c);
      // People do not leave because things look bad. They leave after they have buried somebody.
      const buried = s.buried || 0;
      s.buried = 0;
      if (left < .8 && buried >= 6) {
        const to = sim.refugeFor(c);
        if (to) {
          const n = Math.round(Math.min(c.folk * .05, buried * .25));
          s.folk = Math.max(0, s.folk - n);
          this.displaced.push({ from: c.id, to: to.id, left: n, until: now + 1.2 + rand() * .5 });
          if (g.player.home === c.id && rand() < .6) sim.radio(c, `We buried ${Math.round(buried)} this week. ${n} more left at first light, for ${to.name}. I am not going to stop them.`);
        }
      }
    }
  }

  // --- People on the road ---------------------------------------------------------------------------
  flee(c, to, count) {
    const now = this.g.day + this.g.tod;
    this.displaced.push({ from: c.id, to: to.id, left: Math.round(count), until: now + 1.6 + rand() * .6 });
  }

  // Someone you could see the whole way there. They are no longer part of the crowd still expected.
  walkedIn(from, to) {
    const d = this.displaced.find((e) => e.from === from && e.to === to && e.left > 0);
    if (d) d.left--;
    const s = this.g.campSim.state[to], c = this.g.layout.camps[to];
    s.folk = Math.min(c.folk * 1.3, s.folk + 1);
  }

  diedOnRoad(from, to) {
    const d = this.displaced.find((e) => e.from === from && e.to === to && e.left > 0);
    if (d) d.left--;
  }

  // Whoever is still walking arrives sooner or later, and the camp they reach has more mouths and a few more guns.
  roads(now) {
    const sim = this.g.campSim, list = this.displaced;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (now < d.until) continue;
      list.splice(i, 1);
      const s = sim.state[d.to], c = this.g.layout.camps[d.to];
      if (s.status !== 'holding') {
        const next = sim.refugeFor(c);
        if (next) this.displaced.push({ from: d.from, to: next.id, left: Math.round(d.left * .7), until: now + .8 });
        continue;
      }
      s.folk = Math.min(c.folk * 1.3, s.folk + d.left * .9);
      s.guards = Math.min(c.guards.length, s.guards + d.left * .03);
    }
  }

  // --- The dead move towards the quiet ----------------------------------------------------------------
  // Clear a block and the crowd on the next one drifts into it, a pack at a time, up the street where you can see them.
  migration(dt) {
    const g = this.g, H = g.horde, P = g.player;
    if ((this.migT -= dt) > 0) return;
    this.migT = 9 + rand() * 12;
    const t = H.hottestCleared(P.x, P.z);
    if (!t) return;
    const n = Math.min(44, 6 + t.heat * .6) * (1 + Math.min(1.5, g.day * .05));
    H.setMigrationTarget(t.cell, t.x, t.z, 60);
    H.sendMigrants(t.x, t.z, Math.round(n), 110, 190);
    H.killHeat[t.cell] *= .5;
  }

  toSave() { return { plans: this.plans, waveT: this.waveT, raidAt: this.raidAt, restUntil: this.restUntil, displaced: this.displaced }; }

  fromSave(d) {
    if (!d) return;
    this.plans = d.plans;
    for (const m of this.plans) { m.gx = 0; m.gathered = 0; }
    this.waveT = d.waveT;
    this.raidAt = d.raidAt;
    this.restUntil = d.restUntil || 0;
    this.displaced = d.displaced || [];
  }
}

// Somewhere that would take in the people from this camp: the nearest wall still standing that doesn't charge at the gate,
// unless there is nothing else.
export function refugeCandidates(g, c) {
  const open = [], paid = [];
  for (const o of g.layout.camps) {
    if (o.id === c.id || g.campSim.state[o.id].status !== 'holding') continue;
    (CITIZENSHIP[o.key] ? paid : open).push(o);
  }
  const byDist = (a, b) => Math.hypot(a.cx - c.cx, a.cz - c.cz) - Math.hypot(b.cx - c.cx, b.cz - c.cz);
  return (open.length ? open : paid).sort(byDist);
}
