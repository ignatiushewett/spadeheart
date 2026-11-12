// Survivors and the jobs they hand out. A camp comes alive when you get close: hundreds of people with
// homes, routines and work, guards on the walls, gates that open for you, patrols on the streets outside.
import { WX, WZ, STREET_Y, WATER_Y, G } from '../shared/constants.js';
import { xU, zV, ROLES } from '../shared/layout.js';
import { ITEMS, RUMORS, randomName, buildStock, pickFocus, CITIZENSHIP, papersFor } from './items.js';
import { NPC_WEAPON, WARDROBE } from '../engine/actors.js';
import { isGlass as isGlassId } from '../shared/materials.js';
import { LORE, COMMON_BARKS, ACTIVITY_BARKS, CONVERSATIONS, CAMP_TALK } from './camplore.js';
import { makePersona } from './dialogue.js';

const rand = Math.random;
// What people in a camp say when it is going wrong.
const PANIC_LINES = ["Oh God, they're in, they're in!", 'Where do we go? Where do we go?!', 'Get the kids inside!', 'Is the wall holding? Somebody tell me!', "Don't just stand there, move!", 'I can hear them. I can hear them!', 'Bar the doors! Bar the doors!', 'Has anyone seen my brother?', 'We should have left when we could.', 'Keep your head down and keep moving.', 'They said it would hold. They said!', 'Get away from the wall!', 'Run! Just run!', 'Somebody help me with this!', "Oh shit, oh shit, they're inside!", 'Fuck! Get back, get back!', 'Goddamn it, where are the guards?!', 'Shit, shut the doors!'];
const PANIC_KIDS = ['Mom? Mom!', 'I want to go home!', 'Are they coming in?', "I'm scared."];
const pickOf = (a) => a[Math.floor(rand() * a.length)];
const pickName = () => randomName();

// dmg, seconds between shots, range, sound. Melee weapons (range 0) only matter up close.
const NPC_GUNS = {
  pistol: { dmg: 40, rate: .75, range: 48, sound: 'pistol', label: 'pistol' },
  rifle: { dmg: 62, rate: .5, range: 92, sound: 'rifle', label: 'rifle' },
  shotgun: { dmg: 95, rate: 1, range: 34, sound: 'shotgun', label: 'shotgun' },
  smg: { dmg: 34, rate: .3, range: 50, sound: 'smg', label: 'SMG' },
  sniper: { dmg: 220, rate: 1.7, range: 140, sound: 'sniper', label: 'rifle' },
  lmg: { dmg: 46, rate: .18, range: 88, sound: 'rifle', label: 'machine gun' },
  crossbow: { dmg: 130, rate: 1.4, range: 78, sound: null, label: 'crossbow' },
  bat: { label: 'bat' }, machete: { label: 'machete' }, katana: { label: 'sword' }, axe: { label: 'axe' }, spear: { label: 'spear' },
};

// What an operation pays. A commission is open to anyone who turns up and fights. A contract you sign for at the town hall.
export const OP_PAY = {
  commission: 1,               // spades a kill, for anyone who fights, if the camp holds
  vanguard: 4,                 // spades a kill under a Vanguard contract, if the camp holds and every day's quota was met
  shift: 115,                  // a shift, patrol or night, in ordinary times
  shiftOp: 150,                // and while the camp has an operation on
  days: 3,                     // a patrol contract is this many days in a row
  patrolStart: 5 / 24,         // a patrol day runs from five in the morning to five the next
  nights: 3,                   // a night shift contract is this many nights in a row
  nightStart: .875,            // nine in the evening
  nightLen: 1 / 3,             // until five in the morning
  strikes: 3,                  // missed quotas before a contract is torn up
};
// How far from a camp's wall a kill still counts toward a night shift: out past where the guards on the wall do most of their work.
export const NIGHT_RADIUS = 150;
// What each place does about a missed quota: how much of the contract's earnings it still pays, and how it puts that to you. Nobody here is a charity,
// and the ones doing badly can afford it least: the lower a camp has sunk, the less of even this it pays.
const DOCK = {
  bryant: { keep: .2, why: 'There is a penalty clause. The market always reads the small print.' },
  battery: { keep: .25, why: 'The Harbormaster pays for cargo delivered, and you came up short.' },
  wash: { keep: .4, why: 'The Assembly voted on your case. It was close.' },
  union: { keep: .15, why: 'Failure to meet a tasking. Nobody at Fort Westpoint gets partial credit.' },
  sheep: { keep: .2, why: 'The Judge has ruled on it, and she does not hear appeals.' },
  tompkins: { keep: .35, why: 'Nobody here wants to fine you. There just is not much left in the tin.' },
  morning: { keep: .3, why: 'Those spades were going to buy antibiotics.' },
  garvey: { keep: .3, why: 'A deal is a deal, and Coach Calloway has a whole team to feed.' },
  tryon: { keep: .15, why: 'The shortfall has been entered in the ledger, in a very nice hand.' },
};
const DEFEND_REAL_HELP = 30;   // kills it takes before your help buys the camp more time
const SPADE = '\u2660\ufe0e';
// What share of a person's health one point of weapon damage takes: 80 damage is a fatal wound.
const BODY_HIT = 1 / 80;
const FF_GRACE = 600;
// What people put their weapon away to do.
const STOW_TASKS = { sleep: 1, work: 1, farm: 1, sit: 1, teach: 1, class: 1, shop: 1, warm: 1, play: 1 };
const WATCH_SIGHT = 85;   // how far out the watch on a wall picks targets: what they could make out well enough to hit   // seconds of play between stray rounds that are let go without harm
// Said round a fire, to whoever else is there.
const WARM_LINES = ['Nights are getting colder.', 'Do not let it go out, whatever you do.', 'Feels like the first warm thing in a week.', 'Remember takeout? I would kill for takeout.',
  'Pass me that log.', 'Hands are finally working again.', 'Who is on the wall tonight?', 'You smell that? Somebody is burning a tyre again.', 'My dad used to do this every summer. Upstate.'];
const POSE = { warm: 0, sit: 5, class: 5, sleep: 7, work: 6, farm: 6, talk: 4, teach: 4, shop: 0, browse: 0, stand: 0, mourn: 0, patrol: 0, play: 4 };

const wardrobeRow = (kinds) => {
  const [start, n] = WARDROBE[pickOf(kinds)];
  return start + Math.floor(rand() * n);
};
// The same look every time for someone who is always the same person: picked from their name, not the dice.
const fixedRow = (kind, key) => {
  const [start, n] = WARDROBE[kind];
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return start + (h % n);
};

let nextPersona = 1;

// Raiders belong to nobody and stay away from the walls. Each crew has its own way of going about this, and
// everyone in it has a job. hold is how close they like to get (0: all the way), sees how far they notice you.
const RAIDER_ROLES = {
  scav: { weapons: ['pistol', 'pistol', 'bat', 'machete'], hp: 130, speed: 3.9, hold: 16, sees: 44, breaks: true, say: ['Hey! Drop the bag!', "Your stuff, now!", 'Come on, come on, just hand it over!'] },
  gunman: { weapons: ['smg', 'pistol', 'rifle', 'smg'], hp: 190, speed: 3.9, hold: 22, sees: 54, say: ["That one's carrying!", 'Spread out!', "Don't let 'em run!", 'Cut them off!'] },
  shotgun: { weapons: ['shotgun'], hp: 220, speed: 4.5, hold: 9, sees: 44, say: ['Get in close!', 'Going in!', 'Stay still, this only takes one.'] },
  rusher: { weapons: ['machete', 'axe', 'bat', 'katana', 'spear'], hp: 250, speed: 5.9, hold: 0, sees: 50, say: ['I got this one!', 'Come here!', 'Hold still!', 'Mine! That one is mine!'] },
  marksman: { weapons: ['sniper', 'sniper', 'rifle'], hp: 150, speed: 3.5, hold: 58, sees: 110, reach: 125, say: ["Got 'em. Stay down.", 'Far side of the street. Watch this.', 'Easy. Easy.'] },
  gunner: { weapons: ['lmg'], hp: 340, speed: 3.2, hold: 30, sees: 70, reach: 80, say: ['Keep their heads down!', "Move up, I've got you!", 'Light them up!'] },
  bomber: { weapons: ['pistol', 'smg'], hp: 170, speed: 4.1, hold: 20, sees: 50, grenades: 2, say: ['Flush them out!', 'Get back, get back!', 'I got something for that.'] },
  boss: { weapons: ['lmg', 'shotgun', 'rifle'], hp: 620, speed: 4, hold: 15, sees: 70, reach: 80, boss: true, say: ['Who let this one walk in here?', "Bring me that one. I don't care what state.", 'Everybody up. We have got company.'] },
};
const RAIDER_CREWS = [
  { w: 3, roles: ['scav', 'scav', 'gunman'] },                               // hungry and badly armed
  { w: 3, roles: ['gunman', 'shotgun', 'rusher', 'gunman'] },                // a proper stick-up crew
  { w: 2, roles: ['rusher', 'rusher', 'rusher', 'shotgun'] },                // they would rather do it by hand
  { w: 2, roles: ['marksman', 'gunman', 'marksman', 'gunner'] },             // they see you before you see them
  { w: 2, roles: ['bomber', 'gunman', 'gunner', 'rusher'] },                 // they brought explosives
  { w: 1.2, day: 3, boss: true, roles: ['gunman', 'gunner', 'shotgun', 'rusher', 'bomber', 'marksman'] },   // somebody has built an army
];
// What one hit costs you, before armour.
const RAIDER_DAMAGE = { pistol: 9, smg: 6, shotgun: 20, rifle: 13, sniper: 28, lmg: 5 };
// What a raider's gun does to you: how far it reaches at all, how likely a round is to land up close, and how hard it hits (a shotgun
// loses its punch over fall blocks). Beyond its range they close in rather than throw rounds away.
const RAIDER_GUN = {
  pistol: { range: 38, acc: .42, dmg: 11 }, smg: { range: 42, acc: .3, dmg: 8 }, shotgun: { range: 22, acc: .72, dmg: 26, fall: 26 },
  rifle: { range: 75, acc: .44, dmg: 15 }, sniper: { range: 120, acc: .6, dmg: 34 }, lmg: { range: 65, acc: .26, dmg: 9 },
};
const RAIDER_NAMES = ['Crow', 'Dutch', 'Rat', 'Knuckles', 'Tiny', 'Spook', 'Mace', 'Lefty', 'Boots', 'Sully', 'Razor', 'Ghost', 'Pike', 'Wes', 'Hatch', 'Cricket', 'Nine', 'Dolly', 'Sparks', 'Mouse', 'Preacher', 'Vee', 'Bones', 'Junior', 'Ash', 'Bishop', 'Blue', 'Bricks', 'Buck', 'Chalk', 'Chicago', 'Cinder', 'Cutter', 'Deuce', 'Dice', 'Duke', 'Fang', 'Flint', 'Fox', 'Grease', 'Hollow', 'Jinx', 'Judge', 'Kid', 'Lark', 'Latch', 'Lucky', 'Magpie', 'Monk', 'Moth', 'Needles', 'Nickel', 'Patch', 'Pepper', 'Queens', 'Rabbit', 'Reno', 'Rook', 'Rust', 'Saint', 'Scratch', 'Shiv', 'Smoke', 'Snake', 'Socks', 'Stitch', 'Tack', 'Tallboy', 'Termite', 'Trey', 'Tuesday', 'Viper', 'Wire', 'Wolf', 'Yonkers', 'Zero'];
const RAIDER_IDLE = ["This block's picked clean.", "Keep it down, they can hear you.", 'I told you, nothing on 9th.', "Where's the rest of the crew?", "I'm so sick of canned peaches.", "Somebody's been through here.", 'Watch the windows.', 'We should have gone north.'];
const RAIDER_BREAK = ['Forget this!', "I'm out!", 'Not worth it!', 'Go, go, go!'];
const RAID_CREW = ['gunman', 'shotgun', 'rusher', 'gunman', 'scav', 'gunner', 'gunman', 'bomber', 'rusher', 'marksman', 'scav', 'shotgun'];
const RAID_BARKS = ['Stores first! Then we go!', 'Grab what you can carry!', 'Keep them off me!', "Don't stop, don't stop!", 'Who has eyes on the stores?', 'Two minutes, then we are gone!'];
const WANDERER_BARKS = ['We keep moving. That is the whole plan.', 'Watch the side streets.', 'Did you hear that?', 'Do not stop here. Not here.', 'How far now?', 'I had a house, you know. Up on Convent.', 'Keep your voice down.', 'Somebody back there was still alive when we left.'];
// People on the road with nobody's wall behind them.
const ROAD_TALK = [
  ['How much further?', 'Further than yesterday.'],
  ['They say the walls are still up at the next settlement.', 'They said that about the last one.'],
  ['Did you see {name} get out?', 'I saw a lot of people not get out.'],
  ['Are you sure about this street?', 'No. Keep walking.'],
  ['We should have stayed.', 'We would be dead.', 'We might be dead anyway.'],
  ['My feet are finished.', 'Then carry them.'],
];
// What people say behind the wall, when the numbers have started going the wrong way.
const DECLINE_TALK = [
  ['How many on the wall last night?', 'Fewer.', 'That is not a number.', 'It is the only one anyone will give me.'],
  ['The Hendersons left this morning.', 'With the kids?', 'With everything.'],
  ['Do you think it holds?', 'It held last time.', 'That is not what I asked.'],
  ['They have stopped fixing the east side.', 'They have stopped having anyone to fix it.'],
  ['I still think we should go.', 'Go where, {name}?', 'Anywhere that still has a full wall.'],
  ['Half the bunks in our row are empty.', 'At least you can get a bunk now.'],
];

const RAIDER_LOOT = { pistol: ['ammo_pistol', 'pistol'], smg: ['ammo_pistol', 'smg'], shotgun: ['ammo_shell', 'shotgun'], rifle: ['ammo_rifle', 'rifle'], sniper: ['ammo_rifle', 'hunting'], lmg: ['ammo_rifle', 'lmg'], axe: [null, 'axe'], bat: [null, 'crowbar'], machete: [null, 'crowbar'], katana: [null, 'axe'], spear: [null, 'crowbar'] };

// How far from its own wall a camp will send anyone.
const PATROL_REACH = 230;
// Where a torch sits on each weapon, along it and under it. Hand weapons and empty hands just hold it at the grip.
// The end of each gun's barrel, in the same arm units as TORCH_MOUNT (from the weapon models in engine/actors.js).
const MUZZLE = { 1: [.66, .0975], 2: [-.62, .09], 3: [-.70, .123], 4: [-.06, .105], 5: [-1.0, .08], 6: [-.82, .093], 7: [-.05, .08] };
const TORCH_MOUNT = { 0: [.98, .1], 1: [.66, .03], 2: [-.22, .02], 3: [-.24, .0], 4: [-.05, .05], 5: [.05, .0], 6: [.1, .0], 7: [.3, .02] };

// How much a camp has to spend it on: what it charges to take you back.
const BAIL_WEALTH = { bryant: 1.6, battery: 1.3, wash: .6, union: 1.2, sheep: 1.1, tompkins: .5, morning: .9, garvey: .7, tryon: 1.4 };

class NPC {
  constructor(kind, x, y, z, opts = {}) {
    this.kind = kind;
    this.x = x; this.y = y; this.z = z;
    this.yaw = opts.yaw ?? rand() * 6.28;
    this.baseYaw = opts.yaw ?? null;
    this.hp = opts.hp || 180;
    this.bodyHp = this.hp;
    this.maxHp = this.hp;
    this.variant = opts.variant ?? 192;
    this.name = opts.name || pickName();
    this.role = opts.role || null;
    this.camp = opts.camp ?? -1;
    this.campKey = opts.campKey || null;
    this.campName = opts.campName || null;
    this.phase = rand() * 6;
    this.cd = rand();
    this.aim = 0;
    this.dead = false;
    this.part = opts.part || null;
    this.loreId = opts.part ? opts.part.id : null;
    this.title = opts.part ? opts.part.title : opts.title;
    this.kid = !!opts.kid;
    this.setWeapon(opts.weapon);
    this.personaId = `p${nextPersona++}`;
    this.persona = makePersona(Math.floor(rand() * 1e6), this.kid);
    this.task = null;
    this.state = 0;
    this.barkT = 4 + rand() * 18;
    this.dx = 0; this.dz = 0;
    this.moveT = rand() * 4;
    this.speed = this.kid ? 3.2 : 1.8 + rand() * .7;
    this.path = null;
    this.pathI = 0;
    this.tick = Math.floor(rand() * 4);
    this.bed = null;
    this.coolTorch = rand() < .22;   // the odd newer LED torch among the old bulbs
    this.carriesTorch = rand() < .5;
    this.ys = this.yaw;              // the way the body is actually facing, catching up with where it wants to
  }

  setWeapon(w) {
    this.weaponName = w || null;
    this.weaponId = w ? NPC_WEAPON[w] : 0;
    this.gun = w ? NPC_GUNS[w] : null;
    this.weaponLabel = this.gun ? this.gun.label : '';
    this.armed = !!(this.gun && this.gun.range);
  }

  promptLabel() {
    if (this.state === 7) return `${this.name} is asleep`;
    if (this.kid) return `Talk to ${this.name}`;
    const t = this.title ? `, ${this.title}` : '';
    if (this.doctor || this.kind === 'clerk') return `See ${this.name}${t}`;
    if (this.role) return `Trade with ${this.name}${t}`;
    return `Talk to ${this.name}${t}`;
  }
}

export class NPCs {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.camps = game.layout.camps.map((c) => ({ active: false, npcs: [], guards: [], scanT: rand() * .25, alarmT: 0, gates: c.gates.map((g) => ({ def: g, open: 0, target: 0 })) }));
    this.stock = {};
    this.stockDay = {};
    this.roamTimer = 5;
    this.humans = [];
    this.barkGlobal = 0;
    this.shotsBark = 0;
    this.pathBudget = 0;
    this.followers = [];
    this.raiders = [];
    this.raidT = 40;
    this.convos = [];
    this.chatT = 1;
    // Scratch space for pathfinding.
    this.pStamp = null;
    this.pFrom = null;
    this.pQueue = null;
    this.pId = 0;
    game.actors.factions = new Float32Array(30);
    // Armbands are cut from whatever cloth there was, and it has faded like everything else.
    game.layout.camps.forEach((c, i) => {
      if (i >= 9) return;
      const l = c.faction[0] * .3 + c.faction[1] * .59 + c.faction[2] * .11;
      game.actors.factions.set(c.faction.map((v) => (l + (v - l) * .62) * .8), (i + 1) * 3);
    });
  }

  // Each trader's own counter: keyed by their stall (or, for one on the road, by them), so two arms dealers in a camp never share stock.
  // What they specialise in is settled the first time and stays with that stall.
  stockFor(campId, role, key) {
    const k = key || `${campId}:${role}`;
    const day = this.g.day;
    const focus = this.stockFocus || (this.stockFocus = {});
    if (!focus[k]) focus[k] = pickFocus(role);
    if (this.stockDay[k] !== day) {
      this.stock[k] = buildStock(role, focus[k]);
      this.stockDay[k] = day;
    }
    return this.stock[k];
  }

  // --- Camp population ------------------------------------------------------------------------
  activateCamp(c) {
    const st = this.camps[c.id];
    if (st.active) return;
    st.active = true;
    // The pair out in front of each gate are part of the camp: they are there when everyone else is, a loaded save included.
    st.freshGates = true;
    const sim = this.g.campSim, S = sim.state[c.id];
    if (!c.poiBy) {
      c.poiBy = {};
      for (const p of c.pois) (c.poiBy[p.kind] || (c.poiBy[p.kind] = [])).push(p);
    }
    for (const p of c.pois) p.by = null;
    for (const p of c.hallPois || []) p.by = null;
    for (const p of c.hallYard || []) p.by = null;
    for (const p of c.hallQueue || []) p.by = null;
    const add = (n) => { n.camp = c.id; n.campKey = c.key; n.campName = c.name; st.npcs.push(n); this.list.push(n); return n; };
    const beds = (c.poiBy.sleep || []).slice().sort(() => rand() - .5);
    let bedI = 0;
    const giveBed = (n) => { if (bedI < beds.length) n.bed = beds[bedI++]; };
    // A fallen camp has nobody left. Its gates hang open.
    if (S.status === 'overrun' || S.status === 'resettling') {
      for (const gate of st.gates) { gate.broken = true; gate.ruinOpen = true; }
      if (S.status === 'resettling') {
        for (let i = 0; i < 24; i++) {
          const p = pickOf(c.pois);
          const n = add(new NPC('resident', p.x, STREET_Y, p.z, { weapon: pickOf(c.folkWeapons), variant: wardrobeRow(c.wardrobe), hp: 220 }));
          giveBed(n);
        }
      }
      return;
    }
    for (const gate of st.gates) { gate.ruinOpen = false; gate.broken = S.breaches.some((b) => b.side === gate.def.side && Math.abs(b.tc - gate.def.tc) < 9); }
    const lore = LORE[c.key];
    const cast = lore.cast;
    const row = (kinds) => wardrobeRow(kinds);
    const alive = (m) => m && !sim.dead[m.id] && !sim.refugees.some((r) => r.id === m.id);
    const byRole = (r, used) => cast.find((m) => m.role === r && alive(m) && !used.has(m.id));

    // Leader
    let leader = cast.find((m) => m.role === 'leader');
    if (!alive(leader)) leader = cast.find((m) => alive(m) && m.role === 'captain') || null;
    if (leader) add(new NPC('boss', c.boss.x + .5, STREET_Y, c.boss.z + .5, { name: leader.name, part: leader, weapon: leader.weapon, variant: fixedRow(leader.wardrobe, `${c.key}:${leader.id}`), hp: 600, yaw: 0, title: leader.role === 'leader' ? undefined : 'Acting Leader' }));
    else add(new NPC('boss', c.boss.x + .5, STREET_Y, c.boss.z + .5, { weapon: pickOf(c.guardWeapons), variant: row(c.wardrobe), hp: 500, yaw: 0, title: 'Acting Leader' }));
    // The town hall. Whoever keeps the books keeps them from behind the table, whatever is going on outside.
    if (!S.clerkName) S.clerkName = pickName();
    add(new NPC('clerk', c.clerk.x, STREET_Y, c.clerk.z, { name: S.clerkName, weapon: 'pistol', variant: row(c.wardrobe), hp: 500, yaw: c.clerk.yaw || 0, title: 'Town Clerk' }));
    // Traders. The first of each trade is someone you may come to know; the rest are just trying to eat.
    const used = new Set();
    if (leader) used.add(leader.id);
    for (const v of c.vendors) {
      const part = byRole(v.role, used);
      if (part) used.add(part.id);
      const seller = add(new NPC('vendor', v.x, STREET_Y, v.z, { role: v.role, name: part ? part.name : pickName(), part: part || null, weapon: part ? part.weapon : pickOf(c.folkWeapons), variant: row(part ? [part.wardrobe] : v.doctor ? ['med'] : c.wardrobe), hp: 400, yaw: v.yaw, title: part ? undefined : v.doctor ? 'Doctor' : ROLES[v.role].title }));
      if (v.doctor) seller.doctor = true;
      seller.stall = v;
      seller.stockKey = `${c.id}:${v.role}:${Math.floor(v.x)},${Math.floor(v.z)}`;
    }
    for (const m of cast) {
      if (used.has(m.id) || !alive(m) || m.role === 'leader') continue;
      if (m.role !== 'captain' && m.role !== 'local') continue;
      const s = c.spots[m.spot || 'plaza'] || c.spots.plaza;
      used.add(m.id);
      add(new NPC('named', s.x + rand() * 2, STREET_Y, s.z + rand() * 2, { name: m.name, part: m, weapon: m.weapon, variant: row([m.wardrobe]), hp: 500, yaw: 0 }));
    }
    for (const r of sim.refugees) {
      if (r.at !== c.id) continue;
      const m = LORE[r.key].cast.find((q) => q.id === r.id);
      const s = c.spots.plaza;
      const n = add(new NPC('named', s.x + 4 + rand() * 8, STREET_Y, s.z + 3 + rand() * 6, { name: m.name, part: m, weapon: m.weapon, variant: row([m.wardrobe]), hp: 400, title: 'Refugee' }));
      n.refugee = true;
    }
    // The gate watch. Every gate has someone on it, day and night.
    for (const s of c.sentries) {
      add(new NPC('sentry', s.x, STREET_Y, s.z, { weapon: pickOf(c.guardWeapons), variant: row(['light']), hp: 400, yaw: s.yaw, title: 'Gate watch' }));
    }
    // The wall. Only those still alive stand their posts.
    st.guards = [];
    const posts = c.guards.slice().sort(() => rand() - .5).slice(0, Math.max(0, Math.round(S.guards)));
    for (const s of posts) this.postGuard(c, st, s);
    // On the menu the wall is manned for show: more of them up there, half walking it and half standing their post, day or night.
    if (this.showcase) {
      for (const s of posts) if (s.beat && rand() < .7) this.postGuard(c, st, s);
      st.guards.filter((n) => n.beat).forEach((n, i) => { n.holdPost = i % 2 === 0; });
    }
    // Everyone else. One in eight is a child; almost all the rest carry something.
    const count = Math.round(S.folk);
    const adults = [];
    for (let i = 0; i < count; i++) {
      const kid = i % 8 === 0;
      const weapon = kid ? null : rand() < .9 ? pickOf(c.folkWeapons) : null;
      const n = add(new NPC('resident', 0, STREET_Y, 0, { weapon, kid, variant: row(c.wardrobe), hp: kid ? 120 : 220 }));
      if (!kid) adults.push(n);
    }
    // There is always a line at the town hall.
    if (c.hallQueue) for (let k = 0; k < c.hallQueue.length + 3; k++) { const q = adults.pop(); if (q) q.hallQueue = true; }
    if (c.hallPois) for (let k = 0; k < c.hallPois.length * .3; k++) { const q = adults.pop(); if (q) q.hallGoer = true; }
    if (c.hallYard) for (let k = 0; k < c.hallYard.length * .45; k++) { const q = adults.pop(); if (q) q.hallYard = true; }
    // The market has its idlers, working their way from stall to stall and wandering off again.
    const stalls = c.vendors.slice().sort(() => rand() - .5);
    for (let k = 0; k < stalls.length * 1.1; k++) {
      const passing = adults.pop();
      if (passing) { passing.browser = true; passing.home = stalls[k % stalls.length]; }
    }
    this.holdGround(c, st);
    for (const n of st.npcs) {
      if (n.kind !== 'resident') continue;
      giveBed(n);
      if (!n.home) n.home = n.bed || pickOf(c.pois);
      this.startTask(n, c, true);
    }
    // Everybody was already running when you got here.
    if (S.evac) this.evacuate(c, sim.refugeFor(c));
  }

  postGuard(c, st, s) {
    const weapon = s.sniper ? 'sniper' : pickOf(c.guardWeapons);
    const n = new NPC('guard', s.x, s.y, s.z, { name: pickName(), weapon, variant: wardrobeRow(['light']), hp: 620, yaw: s.yaw, title: 'on watch' });
    n.camp = c.id; n.campKey = c.key; n.campName = c.name;
    n.post = s;
    st.npcs.push(n);
    this.list.push(n);
    st.guards.push(n);
    if (s.beat) {
      // Most of the watch walk their side of the wall. Anyone can see who is out there, and how few.
      n.beat = s.beat;
      n.spot = (rand() - .5) * 46;
      n.pauseT = rand() * 8;
      const along = s.beat.lo + rand() * (s.beat.hi - s.beat.lo);
      if (s.beat.axis === 'x') n.x = along; else n.z = along;
    }
    return n;
  }

  // Someone new takes over a stall whose owner did not make it. Selling is the last job in the world to stay empty.
  replaceVendors(c) {
    const st = this.camps[c.id];
    if (!st.active) return;
    // The books do not keep themselves. Somebody new is behind the table at the town hall by morning.
    if (!st.npcs.some((n) => n.kind === 'clerk' && !n.dead)) {
      const S = this.g.campSim.state[c.id];
      S.clerkName = pickName();
      const n = new NPC('clerk', c.clerk.x, STREET_Y, c.clerk.z, { name: S.clerkName, weapon: 'pistol', variant: wardrobeRow(c.wardrobe), hp: 500, yaw: c.clerk.yaw || 0, title: 'Town Clerk' });
      n.camp = c.id; n.campKey = c.key; n.campName = c.name;
      st.npcs.push(n);
      this.list.push(n);
    }
    let filled = 0;
    for (const v of c.vendors) {
      if (st.npcs.some((n) => n.stall === v && !n.dead)) continue;
      const n = new NPC('vendor', v.x, STREET_Y, v.z, { role: v.role, name: pickName(), weapon: pickOf(c.folkWeapons), variant: wardrobeRow(v.doctor ? ['med'] : c.wardrobe), hp: 400, yaw: v.yaw, title: v.doctor ? 'Doctor' : ROLES[v.role].title });
      n.camp = c.id; n.campKey = c.key; n.campName = c.name;
      n.stall = v;
      n.stockKey = `${c.id}:${v.role}:${Math.floor(v.x)},${Math.floor(v.z)}`;
      if (v.doctor) n.doctor = true;
      st.npcs.push(n);
      this.list.push(n);
      filled++;
    }
    if (filled) this.g.campSim.radio(c, filled > 1 ? `${filled} stalls have new people behind the counter this morning.` : 'There is someone new behind the counter at one of the stalls. Be nice to them.');
  }

  // A few people go and put back what got broken.
  // Someone at the job: a resident sent to work at (x, z) who has got there, keeps at it, and is seen to. How fast a thing is put
  // back depends on whether anyone is. Out of sight, the camp's people are not walking about at all, so the job just goes slowly.
  // Returns 1 with someone working, a fraction when nobody can see, and 0 while the crew is still on its way.
  workAt(c, x, z, dt, r = 4.5) {
    const st = this.camps[c.id], g = this.g;
    if (!st.active) return .2;
    for (const n of st.npcs) {
      if (n.dead || n.kind !== 'resident' || !n.task || n.task.kind !== 'work' || !n.arrived || n.alarmed || n.flee) continue;
      if ((n.x - x) ** 2 + (n.z - z) ** 2 > r * r) continue;
      n.task.t = Math.max(n.task.t, 3);
      n.yaw = Math.atan2(x + .5 - n.x, z + .5 - n.z);
      // Hammering at it, if what they are carrying will hammer.
      if (g.time - (n.workSwing || 0) > .8 + rand() * .5) { n.workSwing = g.time; n.swingAt = g.time; }
      return 1;
    }
    return 0;
  }

  // The job is done: whoever was on it is free to go.
  releaseWork(c, x, z) {
    for (const n of this.camps[c.id].npcs) if (n.task && n.task.kind === 'work' && n.task.at && Math.hypot(n.task.at[0] - x, n.task.at[1] - z) < 2) n.task.t = 0;
  }

  sendRepairCrew(c, x, z) {
    const st = this.camps[c.id];
    let sent = 0;
    for (const n of st.npcs) {
      if (n.kind !== 'resident' || n.kid || n.alarmed || n.flee || n.dead || n.state === 7 || (n.x - x) ** 2 + (n.z - z) ** 2 > 60 * 60) continue;
      if (n.task && n.task.poi && n.task.poi.by === n) n.task.poi.by = null;
      // Stood off a few steps, each from their own side, not pressed up against what they are working on.
      const a = rand() * 6.283, off = 3 + rand() * 1.2;
      n.task = { poi: { x: x + .5 + Math.cos(a) * off, z: z + .5 + Math.sin(a) * off, kind: 'work' }, kind: 'work', loose: true, t: 10 + rand() * 6, at: [x, z] };
      n.path = null;
      n.arrived = false;
      if (++sent >= 3) return;
    }
  }

  // The numbers are one thing. If a camp has climbed back, you should see them walking in through the gate, and the gaps on the wall filling up.
  replenish(c, st, S) {
    const P = this.g.player;
    let residents = 0, joining = 0;
    for (const n of st.npcs) if (n.kind === 'resident' && !n.dead) residents++;
    for (const n of this.list) if (n.joining === c.id && !n.dead) joining++;
    const want = Math.round(S.folk) - residents - joining;
    if (want >= 2) this.bringIn(c, Math.min(want, 6));
    // A new face on the watch, as long as nobody sees them appear.
    if (Math.round(S.guards) > st.guards.length) {
      const taken = new Set(st.guards.map((n) => n.post));
      const free = c.guards.filter((s) => !taken.has(s) && this.offCamera({ x: s.x, y: s.y, z: s.z }, Math.hypot(s.x - P.x, s.z - P.z)));
      // New hands go on the wall walk first. The towers are kept by the people already up there.
      const walk = free.filter((q) => !q.gate);
      if (free.length) this.postGuard(c, st, pickOf(walk.length ? walk : free));
    }
  }

  // The gate towers, where the floodlights are, are never left empty for long. When the one up there dies, somebody climbs up to
  // take over after a minute or two, fight or no fight. If the count is short, it is a new recruit.
  manTowers(c, st, S) {
    if (S.status !== 'holding' || S.evac) return;
    const g = this.g, P = g.player, now = g.time, due = st.towerDue || (st.towerDue = new Map());
    for (const s of c.guards) {
      if (!s.gate) continue;
      if (st.guards.some((n) => n.post === s && !n.dead)) { due.delete(s); continue; }
      if (!due.has(s)) { due.set(s, now + 60 + rand() * 60); continue; }
      if (now < due.get(s) || !this.offCamera({ x: s.x, y: s.y, z: s.z }, Math.hypot(s.x - P.x, s.z - P.z))) continue;
      due.delete(s);
      if (Math.round(S.guards) <= st.guards.length) S.guards = Math.min(c.guards.length, st.guards.length + 1);
      const n = this.postGuard(c, st, s);
      if (n && S.op) g.campSim.radio(c, pickOf([`Somebody's back up the ${this.towerSide(c, s)} tower. Light's manned.`, `${n.name} is taking the ${this.towerSide(c, s)} tower.`, `We've got eyes on the ${this.towerSide(c, s)} gate again.`]));
    }
  }

  towerSide(c, s) {
    const dx = s.x - c.cx, dz = s.z - c.cz;
    return Math.abs(dx) / (c.x1 - c.x0) > Math.abs(dz) / (c.z1 - c.z0) ? (dx < 0 ? 'west' : 'east') : (dz < 0 ? 'north' : 'south');
  }

  bringIn(c, count) {
    const g = this.g, w = g.world, gates = c.gates;
    if (!gates.length) return;
    const q = pickOf(gates), ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const out = 22 + rand() * 12, x = q.cx + ox * out + (rand() - .5) * 8, z = q.cz + oz * out + (rand() - .5) * 8, kid = rand() < .12;
      const m = new NPC('wanderer', x, w.terrainTop(x, z), z, { weapon: kid ? null : pickOf(c.folkWeapons), kid, variant: wardrobeRow(c.wardrobe), hp: kid ? 120 : 220, title: `Heading for ${c.name}` });
      m.dest = c.id;
      m.joining = c.id;
      m.flank = rand() * 6.283;
      m.fromCamp = -1;
      m.gateTo = { camp: c.id, def: q };
      this.unstick(m);
      this.list.push(m);
    }
  }

  // A crew going out to hit them first: you can watch them leave.
  sortie(c) {
    const q = pickOf(c.gates);
    if (!q) return;
    const gate = this.camps[c.id].gates.find((k) => k.def === q);
    if (gate) gate.admitT = 6;
    const ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
    this.addCrew(c, q.cx + ox * 12, q.cz + oz * 12, 30, 6 + Math.floor(rand() * 5), false);
  }

  // People who stay put are obstacles like any other: routes go round them, and errands stay off their feet.
  holdGround(c, st) {
    st.held = [];
    for (const n of st.npcs) {
      if (n.kind !== 'vendor' && n.kind !== 'boss' && n.kind !== 'named' && n.kind !== 'sentry' && n.kind !== 'clerk') continue;
      const cx = (Math.floor(n.x) - c.x0) >> 1, cz = (Math.floor(n.z) - c.z0) >> 1;
      if (cx >= 0 && cz >= 0 && cx < c.navW && cz < c.navD) {
        const k = cx + cz * c.navW;
        if (!c.nav[k]) { c.nav[k] = 1; st.held.push(k); }
      }
      for (const p of c.pois) if (!p.by && (p.x - n.x) ** 2 + (p.z - n.z) ** 2 < 3.2) p.by = n;
    }
  }

  deactivateCamp(c) {
    const st = this.camps[c.id];
    if (!st.active) return;
    st.active = false;
    for (const k of st.held || []) c.nav[k] = 0;
    st.held = [];
    const gone = new Set(st.npcs.filter((n) => n.kind !== 'follower'));
    this.list = this.list.filter((n) => !gone.has(n));
    st.npcs = [];
    st.guards = [];
    this.list = this.list.filter((n) => !(n.squad && n.squad.gate && n.squad.camp === c));
    for (const g of st.gates) { g.open = 0; g.target = 0; g.jamT = 0; }
    st.hot = null;
  }

  // --- Daily life -----------------------------------------------------------------------------
  scheduleKind(n) {
    const t = this.g.tod, r = rand();
    const night = t > .88 || t < .22, evening = t >= .72 && t <= .88, morning = t >= .22 && t < .34;
    if (n.kid) {
      if (night) return r < .9 ? 'sleep' : 'sit';
      if (evening) return r < .5 ? 'sit' : r < .8 ? 'play' : 'sleep';
      return r < .35 ? 'class' : r < .85 ? 'play' : 'sit';
    }
    // After dark most people are in bed. The rest drift to the stalls, where a lot of what changes hands at that hour isn't on the counter.
    if (night) return r < .64 ? 'sleep' : r < .86 ? 'market' : r < .94 ? 'warm' : r < .98 ? 'sit' : 'talk';
    if (evening) return r < .28 ? 'sit' : r < .5 ? 'market' : r < .62 ? 'talk' : r < .74 ? 'warm' : r < .8 ? 'stroll' : r < .9 ? 'shop' : 'sleep';
    if (morning) return r < .2 ? 'shop' : r < .44 ? 'sit' : r < .52 ? 'warm' : r < .6 ? 'stroll' : r < .82 ? 'work' : 'talk';
    if (r < .22) return 'work';
    if (r < .31) return 'farm';
    if (r < .42) return 'shop';
    if (r < .56) return 'talk';
    if (r < .77) return 'sit';
    if (r < .89) return 'stroll';   // across to the other side of the camp, for no reason they could tell you
    if (r < .92) return 'sleep';    // a nap: it was a long night on the wall
    if (r < .94) return 'warm';
    if (r < .96) return 'mourn';
    return 'stand';
  }

  // People mostly keep to their own part of town, which keeps every quarter of the camp busy.
  freePoi(c, kind, n) {
    const list = c.poiBy[kind];
    if (!list || !list.length) return null;
    const home = n && n.home;
    // Company is found close to home. Errands and odd jobs take people all over.
    const wander = !home || rand() < (kind === 'talk' || kind === 'sit' ? .08 : .3);
    if (wander) {
      for (let k = 0; k < 18; k++) {
        const p = list[Math.floor(rand() * list.length)];
        if (!p.by) return p;
      }
      return null;
    }
    // Close to home, with enough luck in it that nobody picks the same seat every time.
    let best = null, bd = 1e12;
    for (const p of list) {
      if (p.by) continue;
      const d = ((p.x - home.x) ** 2 + (p.z - home.z) ** 2) * (1 + rand() * 3);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // Somewhere nearby to be, for when nothing specific is free.
  nearbySpot(c, n) {
    const home = n.home || c.spots.plaza;
    let best = null, bd = 1e12;
    for (let k = 0; k < 6; k++) {
      const p = c.pois[Math.floor(rand() * c.pois.length)];
      if (p.kind === 'sleep') continue;
      const d = (p.x - home.x) ** 2 + (p.z - home.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    best = best || c.spots.plaza;
    return { x: best.x + (rand() - .5) * 6, z: best.z + (rand() - .5) * 6, kind: 'stand' };
  }

  // Anywhere in the camp at all: a corner of it nobody in particular is sitting in.
  strollSpot(c) {
    for (let k = 0; k < 8; k++) {
      const p = c.pois[Math.floor(rand() * c.pois.length)];
      if (!p || p.kind === 'sleep') continue;
      return { x: p.x + (rand() - .5) * 9, z: p.z + (rand() - .5) * 9, kind: 'stand' };
    }
    return { x: c.spots.plaza.x + (rand() - .5) * 20, z: c.spots.plaza.z + (rand() - .5) * 20, kind: 'stand' };
  }

  // The next stall along, never the one they just left. Near enough to wander to, with room to stand.
  nextStall(c, n, instant) {
    const from = instant ? n.home || c.spots.plaza : n;
    const ox = from.x, oz = from.z;
    let best = null, bd = 1e12;
    for (let k = 0; k < 7; k++) {
      const v = c.vendors[Math.floor(rand() * c.vendors.length)];
      if (v === n.stall || v.browse.every((p) => p.by)) continue;
      const d = (v.x - ox) ** 2 + (v.z - oz) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    if (!best) return null;
    n.stall = best;
    const free = best.browse.filter((p) => !p.by);
    return free[Math.floor(rand() * free.length)];
  }

  // Standing round one of the camp's fires, just outside the ring of benches, facing in: hands out to it, talking over it.
  fireSpot(c) {
    const fires = c.fires.filter((f) => !f.out && !f.small);
    for (let t = 0; t < 8 && fires.length; t++) {
      const f = pickOf(fires), a = rand() * 6.283, r = 4.6 + rand() * .9;
      const x = f.x + .5 + Math.cos(a) * r, z = f.z + .5 + Math.sin(a) * r;
      const ci = ((Math.floor(x) - c.x0) >> 1) + ((Math.floor(z) - c.z0) >> 1) * c.navW;
      if (ci < 0 || ci >= c.nav.length || c.nav[ci]) continue;
      return { x, z, kind: 'warm', yaw: Math.atan2(f.x + .5 - x, f.z + .5 - z), fire: f };
    }
    return null;
  }

  // Hanging around near a stall, for when there is no room at the counter itself.
  marketSpot(c) {
    const v = c.vendors.length ? pickOf(c.vendors) : null;
    const p = v ? pickOf(v.browse) : c.spots.market;
    return { x: p.x + (rand() - .5) * 7, z: p.z + (rand() - .5) * 7, kind: 'market' };
  }

  startTask(n, c, instant) {
    // Someone just milling about the market keeps milling: on to the next stretch of stalls, up or down, more often than not.
    const milling = n.task && n.task.kind === 'market' && n.task.loose && rand() < .7;
    if (n.task && n.task.poi) { if (n.task.poi.by === n) n.task.poi.by = null; }
    n.stuckT = 0; n.stuckN = 0; n.lastX = n.x; n.lastZ = n.z;
    let kind = milling ? 'market' : this.scheduleKind(n);
    const tod = this.g.tod;
    const idler = n.browser;
    if (idler && kind !== 'sleep' && rand() < .75) kind = 'browse';
    else if (kind === 'shop' && rand() < .5) kind = 'browse';
    else if (n.armed && !n.kid && kind === 'stand' ) kind = 'patrol';
    else if (n.armed && !n.kid && kind === 'work' && rand() < .25) kind = 'patrol';
    let poi = null;
    let loose = kind === 'play';
    const stroll = kind === 'stroll';
    if (stroll) kind = 'stand';
    // There are never enough beds, so they get shared: your own if it is free, or any other nobody is in.
    // If they are all taken, you stay up.
    if (kind === 'sleep') {
      poi = n.bed && (!n.bed.by || n.bed.by === n) ? n.bed : this.freePoi(c, 'sleep', n);
      if (!poi) kind = n.kid ? 'sit' : 'market';
    }
    if (kind === 'sleep') {
      // Already chosen above.
    } else if (kind === 'market') {
      poi = this.nextStall(c, n, instant);
      if (poi) kind = 'browse';
      else { poi = this.marketSpot(c); loose = true; }
    } else if (kind === 'browse') poi = this.nextStall(c, n, instant);
    else if (kind === 'play') {
      // Tearing around the alleys near home, as children do.
      poi = { ...this.nearbySpot(c, n), kind: 'play' };
    } else if (stroll) { poi = this.strollSpot(c); loose = true; }
    else if (kind === 'warm') { poi = this.fireSpot(c); if (!poi) kind = 'stand'; }
    else poi = this.freePoi(c, kind, n);
    if (n.hallGoer && kind !== 'sleep' && c.hallPois) {
      const free = c.hallPois.filter((q) => !q.by);
      if (free.length) { poi = pickOf(free); kind = poi.kind; loose = false; }
    }
    if (n.hallYard && kind !== 'sleep' && c.hallYard) {
      const free = c.hallYard.filter((q) => !q.by);
      if (free.length) { poi = pickOf(free); kind = poi.kind; loose = false; }
    }
    let slot = -1;
    if (n.hallQueue && kind !== 'sleep' && c.hallQueue) {
      if (n.served) {
        n.served = false;
        const free = (c.hallYard || []).filter((q) => !q.by);
        if (free.length) { poi = pickOf(free); kind = poi.kind; loose = false; }
      } else {
        slot = c.hallQueue.findIndex((q) => this.slotFree(q));
        if (slot >= 0) { poi = c.hallQueue[slot]; kind = 'stand'; loose = false; }
      }
    }
    if (!poi) { kind = 'stand'; poi = this.freePoi(c, 'stand', n) || this.freePoi(c, 'talk', n); }
    if (!poi) { poi = this.nearbySpot(c, n); loose = true; }
    if (!loose) poi.by = n;
    // A look at the goods takes moments; a seat by the fire is hard to give up.
    // Anyone who goes to bed after dark stays there until morning, give or take.
    const overnight = kind === 'sleep' && (tod > .72 || tod < .2);
    const time = overnight ? ((.24 + rand() * .1 - tod + 1) % 1) * 1500 : kind === 'sleep' ? 40 + rand() * 120 : kind === 'market' ? (loose ? 4 + rand() * 7 : 25 + rand() * 50) : kind === 'play' ? 2 + rand() * 4 : kind === 'browse' ? 15 + rand() * 20 : kind === 'shop' ? 12 + rand() * 22 : kind === 'sit' ? 70 + rand() * 130 : n.hallYard ? 8 + rand() * 22 : stroll ? 6 + rand() * 16 : idler ? 15 + rand() * 20 : 35 + rand() * 70;
    n.task = { poi, kind, loose, t: slot < 0 ? time : slot === 0 ? 15 + rand() * 30 : 45 };
    if (slot >= 0) n.task.slot = slot;
    n.path = null;
    n.pathI = 0;
    n.arrived = false;
    if (instant) {
      n.x = poi.x; n.z = poi.z;
      n.arrived = true;
      n.task.t *= rand();
      if (poi.yaw !== undefined) n.yaw = poi.yaw;
    }
  }

  // A place in the queue is free if nobody holds it, or whoever did has since gone off and done something else.
  slotFree(q) {
    return !q.by || q.by.dead || !q.by.task || q.by.task.poi !== q;
  }

  // Breadth-first search over the camp's walkable cells. Cheap enough to run a few times a frame.
  findPath(c, x0, z0, x1, z1) {
    const W = c.navW, D = c.navD, nav = c.nav;
    if (!this.pStamp || this.pStamp.length < W * D) {
      this.pStamp = new Int32Array(W * D);
      this.pFrom = new Int32Array(W * D);
      this.pQueue = new Int32Array(W * D);
    }
    const nearest = (x, z) => {
      let cx = (x - c.x0) >> 1, cz = (z - c.z0) >> 1;
      cx = Math.max(0, Math.min(W - 1, cx)); cz = Math.max(0, Math.min(D - 1, cz));
      if (!nav[cx + cz * W]) return cx + cz * W;
      for (let r = 1; r < 14; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx += (Math.abs(dz) === r ? 1 : 2 * r)) {
        const nx = cx + dx, nz = cz + dz;
        if (nx >= 0 && nz >= 0 && nx < W && nz < D && !nav[nx + nz * W]) return nx + nz * W;
      }
      return -1;
    };
    const start = nearest(x0, z0), goal = nearest(x1, z1);
    if (start < 0 || goal < 0) return null;
    const id = ++this.pId, stamp = this.pStamp, from = this.pFrom, q = this.pQueue;
    let head = 0, tail = 0;
    q[tail++] = goal; stamp[goal] = id; from[goal] = -1;
    let found = start === goal;
    // Of all the equally short ways across, each search takes a different one: shuffle which way it looks first.
    const dirs = this.pDirs || (this.pDirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]);
    for (let i = 3; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
    for (let i = 7; i > 4; i--) { const j = 4 + Math.floor(rand() * (i - 3)); [dirs[i], dirs[j]] = [dirs[j], dirs[i]]; }
    while (head < tail && !found) {
      const c0 = q[head++];
      const cx = c0 % W, cz = (c0 / W) | 0;
      for (let di = 0; di < 8 && !found; di++) {
        const dx = dirs[di][0], dz = dirs[di][1];
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
        const k = nx + nz * W;
        if (stamp[k] === id || nav[k]) continue;
        // No cutting corners through a wall.
        if (dx && dz && (nav[cx + dx + cz * W] || nav[cx + (cz + dz) * W])) continue;
        stamp[k] = id; from[k] = c0; q[tail++] = k;
        if (k === start) { found = true; break; }
      }
    }
    if (!found) return null;
    // Nobody walks the exact middle of every cell: each walker keeps to their own side of the way, give or take, so a crowd spreads across the street.
    const path = [], side = (rand() - .5) * 1.1;
    for (let k = start; k !== -1 && path.length < 400; k = from[k]) {
      const wob = side + (rand() - .5) * .45;
      path.push(c.x0 + (k % W) * 2 + 1 + Math.max(-.7, Math.min(.7, wob)), c.z0 + ((k / W) | 0) * 2 + 1 + Math.max(-.7, Math.min(.7, wob * (rand() < .5 ? 1 : -1))));
    }
    return path;
  }

  updateResident(n, dt, dp) {
    const g = this.g, P = g.player;
    const c = g.layout.camps[n.camp];
    const S = g.campSim.state[n.camp];
    if (n.flee) { this.updateFleeing(n, dt, dp, c); return; }
    // Everyone in a camp lives at street level, or on top of a bed. Nobody gets to stay anywhere else, however they got there.
    const rest = n.arrived && n.task && n.task.kind === 'sleep' ? STREET_Y + 1 : STREET_Y;
    if (n.y !== rest) n.y += Math.sign(rest - n.y) * Math.min(Math.abs(rest - n.y), dt * 12);
    // Trouble is local. Those near it fight or run; the far side of camp hears shooting and carries on.
    if (n.threat) {
      n.calmT = 0;
      if (!n.alarmed || (n.arrived && (n.reactT -= dt) <= 0)) this.reactTo(n, c);
    } else if (n.alarmed) {
      n.calmT = (n.calmT || 0) + dt;
      if (n.calmT > 4) { n.alarmed = false; this.startTask(n, c); }
    }
    if (n.aim > 0) { n.state = 3; return; }
    const t = n.task;
    if (!t) { this.startTask(n, c); return; }
    // When the siren goes, or they are through the wall, nobody in the camp sits still: they hurry, they cut whatever they were doing
    // short and go somewhere else, they wake up, and they say what everyone is thinking.
    const panic = this.campPanic(c);
    if (panic > 0) {
      if (t.kind === 'sleep' && panic >= .9 && n.arrived) { this.startTask(n, c); return; }
      if (n.arrived && !t.panicked && t.kind !== 'sleep' && t.kind !== 'work') { t.panicked = true; t.t = Math.min(t.t, 1.5 + rand() * (8 - panic * 5)); }
      if (dp < 45 && rand() < dt * .05 * panic) this.bark(n, pickOf(n.kid ? PANIC_KIDS : PANIC_LINES), 34);
    }
    if (n.arrived) {
      if (t.loose && this.crowd && dp < 80 && ((n.tick + this.frameN) & 3) === 0) {
        const kx = Math.floor(n.x) >> 1, kz = Math.floor(n.z) >> 1;
        let px = 0, pz = 0;
        for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
          const cell = this.crowd.get(kx + ox + (kz + oz) * 4096);
          if (cell) for (const m of cell) {
            if (m === n || Math.abs(m.y - n.y) > 1.5) continue;
            const ax = n.x - m.x, az = n.z - m.z, d = Math.hypot(ax, az);
            if (d < .8 && d > .001) { px += ax / d * (.8 - d); pz += az / d * (.8 - d); }
          }
        }
        if (px || pz) {
          const nx = n.x + px * .35, nz = n.z + pz * .35, ci = ((Math.floor(nx) - c.x0) >> 1) + ((Math.floor(nz) - c.z0) >> 1) * c.navW;
          if (ci >= 0 && ci < c.nav.length && !c.nav[ci]) { n.x = nx; n.z = nz; }
        }
      }
      // Someone walking right up to you gets your attention, unless you are in the middle of something.
      // Not while you are talking to someone else: they get on with what they were doing.
      const talking = this.g.ui.modal === 'dialog' && this.g.ui.dlgNpc !== n;
      if (dp < 3 && !talking && !n.alarmed && !(n.busyT > 0) && !n.threat && !n.inConvo && t.kind !== 'sleep' && t.kind !== 'sit' && t.kind !== 'class' && t.kind !== 'work' && t.kind !== 'farm') n.yaw = Math.atan2(P.x - n.x, P.z - n.z);
      // A dog has come over: they stop and give it a scratch.
      if (n.petT > 0 && n.petDog && panic < .3) {
        n.petT -= dt;
        n.yaw = Math.atan2(n.petDog.x - n.x, n.petDog.z - n.z);
        n.state = 6;
        return;
      }
      t.t -= dt;
      n.state = POSE[t.kind] ?? 0;
      if (n.speakT > 0) { n.speakT -= dt; if (n.state !== 5) n.state = 4; }
      // Stood waiting in a panic: arms going, head turning, never quite still.
      else if (panic > .4 && n.state === 0 && Math.sin(g.time * 1.3 + n.tick * 2.1) > .2) { n.state = 4; if (rand() < dt * 1.5) n.yaw += (rand() - .5) * 1.6; }
      // Round a fire: hands held out to it now and then, and the odd word over it.
      if (t.kind === 'warm' && !(n.speakT > 0)) {
        if (Math.sin(g.time * .6 + n.tick * 1.3) > .45) n.state = 4;
        if (t.poi.fire && t.poi.fire.out) t.t = Math.min(t.t, 2);
        if (dp < 30 && rand() < dt * .008) this.bark(n, pickOf(WARM_LINES), 30);
      }
      // People at a stall talk with their hands, on and off.
      if ((t.kind === 'browse' || t.kind === 'market') && !(n.speakT > 0) && Math.sin(g.time * .5 + n.tick * 1.7 + n.phase) > .35) n.state = 4;
      // Time can jump if you slept through it. Nobody stays in bed until noon on that account.
      if (t.kind === 'sleep' && t.t > 40 && g.tod > .3 && g.tod < .7) t.t = 5 + rand() * 35;
      if (t.slot !== undefined) {
        const ahead = c.hallQueue[t.slot - 1];
        if (ahead && this.slotFree(ahead)) {
          t.poi.by = null; ahead.by = n; t.poi = ahead; t.slot--;
          if (!t.slot) t.t = 15 + rand() * 30;
          n.arrived = false; n.path = []; n.pathI = 0; n.stuckT = 0; n.lastX = n.x; n.lastZ = n.z;
          return;
        }
        if (t.t <= 0) {
          if (!t.slot) n.served = true;
          else if (g.tod > .25 && g.tod < .8) { t.t = 45; return; }
        }
      }
      if (t.t <= 0) this.startTask(n, c);
      return;
    }
    // Walking. Paths are rationed per frame, so a crowd never causes a hitch.
    if (!n.path) {
      if (this.pathBudget <= 0) { n.state = 0; return; }
      this.pathBudget--;
      n.path = this.findPath(c, n.x, n.z, t.poi.x, t.poi.z);
      // The first point is the middle of the cell they already stand in: heading there means a step backwards.
      n.pathI = n.path && n.path.length > 2 ? 2 : 0;
      if (!n.path) { this.startTask(n, c); return; }
      n.stuckT = 0; n.lastX = n.x; n.lastZ = n.z;
    }
    n.stuckT = (n.stuckT || 0) + dt;
    if (n.stuckT > 1.2) {
      const moved = Math.hypot(n.x - n.lastX, n.z - n.lastZ);
      n.stuckT = 0; n.lastX = n.x; n.lastZ = n.z;
      if (moved > n.speed * .4) n.stuckN = 0;
      else {
        // Blocked. Close enough will do; otherwise look for another way, and if that fails, wait here and think again.
        n.stuckN = (n.stuckN || 0) + 1;
        if (Math.hypot(t.poi.x - n.x, t.poi.z - n.z) < 4 || n.stuckN >= 3) {
          if (t.poi.by === n) t.poi.by = null;
          n.task = { poi: { x: n.x, z: n.z, kind: 'stand' }, kind: 'stand', loose: true, t: 4 + rand() * 8 };
          n.arrived = true; n.path = null; n.state = 0;
          return;
        }
        n.path = null;
        return;
      }
    }
    if (n.bumpT > 0) n.bumpT -= dt;
    const speed = n.speed * (t.kind === 'play' || n.alarmed ? 1.6 : 1) * (1 + panic * .65) * (n.bumpT > 0 ? .55 : 1);
    // Spend this frame's whole stride along the path, however many points it passes, so the pace never hitches.
    let left = speed * dt, hx = 0, hz = 0;
    n.phase += left * 2.1;
    n.state = .7;
    while (left > 0) {
      let tx, tz;
      if (n.pathI < n.path.length) { tx = n.path[n.pathI]; tz = n.path[n.pathI + 1]; }
      else if (t.loose) { n.arrived = true; n.state = POSE[t.kind] ?? 0; return; }  // a spot in the open: the end of the path will do
      else { tx = t.poi.x; tz = t.poi.z; }
      const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d > .001) { hx = dx / d; hz = dz / d; }
      if (d > left) { n.x += dx / d * left; n.z += dz / d * left; break; }
      n.x = tx; n.z = tz;
      left -= d;
      if (n.pathI < n.path.length) n.pathI += 2;
      else {
        n.arrived = true;
        if (t.poi.yaw !== undefined) n.yaw = t.poi.yaw;
        n.y = STREET_Y;
        n.state = POSE[t.kind] ?? 0;
        return;
      }
    }
    // Somebody in the way. People see each other coming and drift to one side a few steps out, the way you do on a pavement.
    // If they still end up chest to chest, they shuffle apart, and if that has not sorted it in a moment one of them just squeezes past.
    if (n.ghostT > 0) n.ghostT -= dt;
    else if (this.crowd && dp < 80) {
      const kx = Math.floor(n.x) >> 1, kz = Math.floor(n.z) >> 1, rx = hz, rz = -hx;
      let px = 0, pz = 0, sx = 0, sz = 0, touch = 0;
      for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
        const cell = this.crowd.get(kx + ox + (kz + oz) * 4096);
        if (!cell) continue;
        for (const m of cell) {
          if (m === n || Math.abs(m.y - n.y) > 1.5) continue;
          const ax = n.x - m.x, az = n.z - m.z, d = Math.hypot(ax, az);
          if (d >= 1.7 || d < .001) continue;
          if (d < .72) { const push = .72 - d; px += ax / d * push * .5; pz += az / d * push * .5; touch++; }
          // Coming up on them: ease off to whichever side they are not on, or to your right if they are dead ahead.
          const ahead = -(ax * hx + az * hz);
          if ((hx || hz) && ahead > 0) {
            const lat = -(ax * rx + az * rz), side = lat > .08 ? -1 : 1, k = (1.7 - d) / 1.7 * Math.min(1, ahead / d);
            sx += rx * side * k; sz += rz * side * k;
          }
        }
      }
      if (touch || sx || sz) {
        const step = Math.min(.9, Math.hypot(sx, sz)) * speed * dt * 1.1, sl = Math.hypot(sx, sz) || 1;
        const nx = n.x + px + sx / sl * step, nz = n.z + pz + sz / sl * step;
        const ci = ((Math.floor(nx) - c.x0) >> 1) + ((Math.floor(nz) - c.z0) >> 1) * c.navW;
        if (ci >= 0 && ci < c.nav.length && !c.nav[ci]) { n.x = nx; n.z = nz; }
        if (hx || hz) { hx += sx * .6 + px; hz += sz * .6 + pz; }
      }
      if (touch) {
        n.bumpT = .3 + rand() * .3;
        if ((n.hugT = (n.hugT || 0) + dt) > 1.4) { n.hugT = 0; n.ghostT = 1.2; }
      } else n.hugT = Math.max(0, (n.hugT || 0) - dt * 2);
    }
    // They turn into the new heading over a few steps, not all at once.
    if (hx || hz) {
      let da = Math.atan2(hx, hz) - n.yaw;
      while (da > Math.PI) da -= 6.2832;
      while (da < -Math.PI) da += 6.2832;
      n.yaw += da * Math.min(1, dt * 8);
    }
  }

  reactTo(n, c) {
    const threat = n.threat;
    if (n.task && n.task.poi && n.task.poi.by === n) n.task.poi.by = null;
    n.alarmed = true;
    n.reactT = 4 + rand() * 3;
    let poi;
    if (n.gun && !n.kid) {
      // Fighters close to their own range and hold there. Blades go right in.
      const dx = n.x - threat.x, dz = n.z - threat.z;
      const stand = n.armed ? 9 + rand() * 16 : 1.5 + rand() * 3;
      // Everyone takes their own spot on an arc facing the trouble, not the same one.
      const a = Math.atan2(dz, dx) + (rand() - .5) * (n.armed ? 2.4 : 6.28);
      poi = { x: threat.x + Math.cos(a) * stand, z: threat.z + Math.sin(a) * stand, kind: 'stand' };
    } else {
      // Everyone else gets away from it, wherever is furthest of a few places they know.
      let bd = -1;
      for (let k = 0; k < 6; k++) {
        const p = c.pois[Math.floor(rand() * c.pois.length)];
        const d = (p.x - threat.x) ** 2 + (p.z - threat.z) ** 2;
        if (d > bd) { bd = d; poi = p; }
      }
      poi = { x: poi.x, z: poi.z, kind: 'stand' };
    }
    n.task = { poi, kind: 'stand', loose: true, t: 999 };
    n.path = null; n.pathI = 0; n.arrived = false;
  }

  // Companions you have talked into coming along.
  updateFollower(n, dt, dp) {
    const g = this.g, w = g.world, P = g.player;
    if (dp > 55) {
      // Lost contact: they catch up the way people do when nobody is looking.
      const a = rand() * 6.28;
      n.x = P.x + Math.cos(a) * 6; n.z = P.z + Math.sin(a) * 6; n.y = P.y;
      return;
    }
    const want = n.slot;
    const tx = P.x + Math.cos(want) * 3.5, tz = P.z + Math.sin(want) * 3.5;
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    // Set off once they are properly behind, and keep going until they are properly there. One line for both had them stopping and
    // starting every frame while you walked, legs flicking between a stride and standing still.
    if (n.following ? d < .7 : d > 1.9) n.following = !n.following;
    if (n.following) {
      // Slowing into their place rather than arriving at a run.
      const speed = Math.min(6.8, 2.4 + d, Math.max(1.4, d * 3));
      const ux = dx / d, uz = dz / d;
      const nx = n.x + ux * speed * dt, nz = n.z + uz * speed * dt;
      const fy = Math.floor(n.y + .05);
      if (!w.solid(Math.floor(nx), fy + 1, Math.floor(nz)) || d > 14) { n.x = nx; n.z = nz; }
      if (n.aim <= 0) n.yaw = Math.atan2(ux, uz);
      n.phase += speed * dt * 2.1;
      n.state = n.aim > 0 ? 3 : .7;
    } else n.state = n.aim > 0 ? 3 : 0;
    const gy = w.groundBelow(n.x, n.y + 1.2, n.z, 8);
    n.y += Math.sign(gy - n.y) * Math.min(Math.abs(gy - n.y), dt * 14);
  }

  recruit(n) {
    if (this.followers.length >= 3) return false;
    n.kind = 'follower';
    n.home = n.camp;
    if (n.task && n.task.poi && n.task.poi.by === n) n.task.poi.by = null;
    n.task = null;
    n.slot = this.followers.length * 2.1 + 1;
    n.hp = Math.max(n.hp, 400);
    if (n.camp >= 0) {
      const st = this.camps[n.camp];
      st.npcs = st.npcs.filter((m) => m !== n);
      this.g.campSim.state[n.camp].folk = Math.max(0, this.g.campSim.state[n.camp].folk - 1);
    }
    this.followers.push(n);
    return true;
  }

  dismiss(n) {
    const i = this.followers.indexOf(n);
    if (i >= 0) this.followers.splice(i, 1);
    n.kind = 'wanderer';
    n.dx = 0; n.dz = 0;
    n.squad = null;
    n.dest = n.home >= 0 && this.g.campSim.state[n.home].status === 'holding' ? n.home : -1;
    if (n.dest >= 0) this.g.campSim.state[n.home].folk += 1;
  }

  // You have thrown in with these people.
  join(id) {
    const g = this.g, P = g.player, c = g.layout.camps[id];
    P.home = id;
    P.discovered[id] = true;
    g.dialogue.addStanding(id, Math.max(0, 10 - (P.campRep[id] || 0)));
    const j = g.jobs.active.find((a) => a.type === 'migrate' && !a.escort);
    if (j) g.jobs.active.splice(g.jobs.active.indexOf(j), 1);
    g.audio.simple('coin');
    g.ui.banner(`${c.name} is home now`, 'Their fight is yours, and so is whatever happens to them.');
    g.saveGame();
  }

  // Whichever camp would have someone out at this spot, if any. Nobody walks further than they can get back from.
  patrolHome(x, z, anywhere = false) {
    const g = this.g;
    let near = null, best = anywhere ? 1e9 : PATROL_REACH;
    for (const c of g.layout.camps) {
      if (g.campSim.state[c.id].status !== 'holding') continue;
      const d = Math.max(c.x0 - x, x - c.x1, c.z0 - z, z - c.z1);
      if (d < best) { best = d; near = c; }
    }
    return near;
  }

  // Patrols out of the nearest camp. How thick they are depends on the ground, not on you: crew after crew close in under
  // the wall, the odd one working the wider neighbourhood, and hardly any at the far end of what a camp will reach.
  // Only someone left for dead (anywhere) gets found further out than that.
  spawnRoamers(reach = 110, span = 130, anywhere = false) {
    const g = this.g, w = g.world, P = g.player;
    if (!anywhere && this.list.filter((n) => n.kind === 'roamer').length >= 26) return;
    for (let t = 0; t < 24; t++) {
      const a = rand() * 6.283, r = reach + rand() * span;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      const gd = g.layout.ground[z * WX + x];
      if (gd !== G.ROAD && gd !== G.WALK && gd !== G.PLAZA) continue;
      if (!w.walk[(x >> 1) + (z >> 1) * w.walkW] || g.horde.campAt(x, z, 12)) continue;
      const near = this.patrolHome(x, z, anywhere);
      if (!near) continue;
      const d = Math.max(near.x0 - x, x - near.x1, near.z0 - z, z - near.z1);
      if (!anywhere) {
        if (rand() > (d < 35 ? 1 : d < 80 ? .65 : d < 140 ? .22 : .07)) continue;
        // Enough on this stretch already, or it would be in plain sight of you.
        const crews = new Set();
        for (const m of this.list) if (m.kind === 'roamer' && (m.x - x) ** 2 + (m.z - z) ** 2 < 95 * 95) crews.add(m.squad);
        if (crews.size >= (d < 60 ? 3 : 1)) continue;
        if (w.los(P.x, P.y + 2.4, P.z, x + .5, w.terrainTop(x, z) + 2, z + .5)) continue;
      }
      this.addCrew(near, x, z, Math.max(10, Math.min(PATROL_REACH, d + (rand() - .5) * 30)), 3 + Math.floor(rand() * 4), rand() < .3);
      return;
    }
  }

  // Owe a camp and stand anywhere its patrols go, and one of its crews comes looking for you: they want the money as much as you
  // want to pay it. Out of sight when it starts, and straight over to you.
  bailCrew() {
    const g = this.g, P = g.player, w = g.world;
    if (!P.alive) return;
    for (const c of g.layout.camps) {
      if (!this.owesBail(c.id) || g.campSim.state[c.id].status !== 'holding') continue;
      const wall = Math.max(c.x0 - P.x, P.x - c.x1, c.z0 - P.z, P.z - c.z1);
      if (wall < 0 || wall > PATROL_REACH) continue;
      // One of theirs already about: the nearest crew is sent over.
      let near = null, nd = 1e9;
      for (const m of this.list) {
        if (m.dead || m.kind !== 'roamer' || m.factionId !== c.id + 1 || !m.squad) continue;
        const d = Math.hypot(m.x - P.x, m.z - P.z);
        if (d < nd) { nd = d; near = m; }
      }
      if (near && nd < 260) {
        const q = near.squad;
        if (nd > 9 && !(q.seekT > 0)) { q.seekT = 90; q.seekBest = nd; q.stallT = 0; }
        // Hung up on the way: round the block out of sight, and they turn up a street or two away instead.
        if (q.seekT > 0 && nd > 9) {
          if (nd < (q.seekBest ?? 1e9) - 3) { q.seekBest = nd; q.stallT = 0; }
          else if ((q.stallT = (q.stallT || 0) + 4) >= 8) {
            const spot = nd < 45 ? this.bailSpot(8, 10) : this.bailSpot(18, 22);
            if (spot) {
              for (const m of q.members) if (!m.dead) { m.x = spot[0] + (rand() - .5) * 4; m.z = spot[1] + (rand() - .5) * 4; m.y = w.terrainTop(Math.floor(m.x), Math.floor(m.z)); }
              q.seekBest = Math.hypot(spot[0] - P.x, spot[1] - P.z); q.stallT = 0;
            }
          }
        }
        return;
      }
      const spot = this.bailSpot(25, 30);
      if (spot) {
        this.addCrew(c, spot[0], spot[1], Math.max(10, Math.min(PATROL_REACH, wall + 10)), 3 + Math.floor(rand() * 2), false);
        const q = this.list[this.list.length - 1].squad;
        q.seekT = 90; q.seekBest = 1e9; q.stallT = 0;
        if (!this.bailSaid || g.time - this.bailSaid > 120) {
          this.bailSaid = g.time;
          g.ui.toast(`A ${c.name} patrol is coming your way. They will take your bail: ${this.bailFor(c.id).toLocaleString('en-US')} spades.`);
        }
      }
      return;
    }
  }

  // Open street a short walk from you that you cannot see from where you stand, if there is any.
  bailSpot(r0, span) {
    const g = this.g, P = g.player, w = g.world;
    let fallback = null;
    for (let t = 0; t < 70; t++) {
      const a = rand() * 6.283, r = r0 + rand() * span;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      const gd = g.layout.ground[z * WX + x];
      if (gd !== G.ROAD && gd !== G.WALK && gd !== G.PLAZA) continue;
      if (!w.walk[(x >> 1) + (z >> 1) * w.walkW] || g.horde.campAt(x, z, 12)) continue;
      const y = w.terrainTop(x, z);
      if (w.solid(x, y, z) || w.solid(x, y + 1, z)) continue;
      if (!w.los(P.x, P.y + 2.4, P.z, x + .5, y + 2, z + .5)) return [x + .5, z + .5];
      if (!fallback) fallback = [x + .5, z + .5];
    }
    return fallback;
  }

  addCrew(near, x, z, ring, n, trader) {
    const w = this.g.world;
    const squad = { camp: near, ring, th: Math.atan2(x - near.cx, z - near.cz), turn: rand() < .5 ? 1 : -1, wx: 0, wz: 0, t: 0, members: [] };
    for (let i = 0; i < n; i++) {
      const nx = x + (rand() - .5) * 6, nz = z + (rand() - .5) * 6;
      const weapon = pickOf(near.guardWeapons);
      const m = new NPC('roamer', nx, w.terrainTop(nx, nz), nz, { weapon, variant: wardrobeRow(trader && i === 0 ? near.wardrobe : ['medium']), hp: 320, title: `${near.name} patrol`, campName: near.name, campKey: near.key });
      m.factionId = near.id + 1;
      m.squad = squad;
      m.flank = rand() * 6.283;
      squad.members.push(m);
      if (trader && i === 0) { m.role = rand() < .5 ? 'general' : 'junk'; m.title = 'Road trader'; m.stockKey = `r${Math.floor(rand() * 1e9)}`; }
      this.list.push(m);
    }
    this.nextBeat(squad);
  }

  // Every gate has a pair out in front of it, walking the approach. They are two of the camp's patrols, not extra ones.
  // Replacements walk on out of sight. When the camp is first filled (anywhere) they are simply already there.
  manGates(c, st, anywhere = false) {
    const S = this.g.campSim.state[c.id], P = this.g.player;
    if (S.status !== 'holding' || S.evac) return;
    for (const q of c.gates) {
      const have = this.list.filter((n) => !n.dead && n.squad && n.squad.gate === q).length;
      if (have >= 2) continue;
      const ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
      const x = q.cx + .5 + ox * 10, z = q.cz + .5 + oz * 10;
      if (!anywhere && !this.offCamera({ x, y: STREET_Y, z }, Math.hypot(x - P.x, z - P.z))) continue;
      // They count against the patrols the city can have around you, so there are that many fewer out on the wider beats.
      const squad = { camp: c, gate: q, ox, oz, ring: 0, th: 0, turn: 1, wx: x, wz: z, t: 0, members: [] };
      for (let i = have; i < 2; i++) {
        const m = new NPC('roamer', x + (rand() - .5) * 3, STREET_Y, z + (rand() - .5) * 3, { weapon: pickOf(c.guardWeapons), variant: wardrobeRow(['heavy']), hp: 320, title: `${c.name} gate watch`, campName: c.name, campKey: c.key });
        m.factionId = c.id + 1;
        m.squad = squad;
        m.flank = i * Math.PI;
        squad.members.push(m);
        this.list.push(m);
      }
      this.gateBeat(squad);
    }
  }

  // Somewhere out in front of the gate: a few steps to a stone's throw out, either side of it.
  gateBeat(q) {
    const g = q.gate, out = 6 + rand() * 14, side = (rand() - .5) * 22;
    q.wx = g.cx + .5 + q.ox * out + (g.horiz ? side : 0);
    q.wz = g.cz + .5 + q.oz * out + (g.horiz ? 0 : side);
  }

  // On round the camp to the next corner of the beat. Now and then a crew works closer in, or goes further out.
  nextBeat(q) {
    const c = q.camp, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    if (rand() < .22) q.ring = 10 + Math.pow(rand(), 2.2) * (PATROL_REACH - 10);
    // When it is bad, nobody wanders: the crews hold a tight line round the wall, never more than a short run from a gate.
    if (this.underStress(c)) q.ring = 8 + rand() * 24;
    q.th += q.turn * (45 + rand() * 50) / (Math.max(hx, hz) + q.ring);
    const ux = Math.sin(q.th), uz = Math.cos(q.th), r = Math.min((hx + q.ring) / (Math.abs(ux) + .001), (hz + q.ring) / (Math.abs(uz) + .001));
    q.wx = Math.max(4, Math.min(WX - 4, c.cx + ux * r));
    q.wz = Math.max(4, Math.min(WZ - 4, c.cz + uz * r));
    q.t = 70;
  }

  // Getting across town on foot: along the long side of the trip first, the way the streets run, and round whatever is in the way.
  trek(n, tx, tz, speed, dt, dp) {
    n.moveT -= dt;
    const dx = tx - n.x, dz = tz - n.z;
    if (n.moveT <= 0) {
      n.moveT = 1.4 + rand() * 2.6;
      if ((Math.abs(dx) > Math.abs(dz)) === (rand() < .86)) { n.dx = Math.sign(dx) || 1; n.dz = 0; } else { n.dx = 0; n.dz = Math.sign(dz) || 1; }
    }
    const bx = n.x, bz = n.z;
    this.walkStep(n, n.dx * speed, n.dz * speed, dt, dp);
    if (Math.abs(n.x - bx) + Math.abs(n.z - bz) > 1e-4) { n.trekT = 0; return; }
    // Boxed in by wrecks with no way round: they climb out over them.
    n.trekT = (n.trekT || 0) + dt;
    if (n.trekT > 1.6) { n.trekT = 0; n.moveT = 0; this.unstick(n); }
  }

  // The nearest bit of open street, with room on every side.
  unstick(n) {
    const w = this.g.world, lot = this.g.layout.lot, open = (x, z) => x > 2 && z > 2 && x < WX - 2 && z < WZ - 2 && !!w.walk[(x >> 1) + (z >> 1) * w.walkW] && !lot[z * WX + x];
    for (let r = 3; r < 60; r += 2) for (let a = 0; a < 14; a++) {
      const x = Math.floor(n.x + Math.cos(a * .449) * r), z = Math.floor(n.z + Math.sin(a * .449) * r);
      if (open(x, z) && open(x + 2, z) && open(x - 2, z) && open(x, z + 2) && open(x, z - 2)) { n.x = x + .5; n.z = z + .5; n.y = w.terrainTop(x, z); return true; }
    }
    return false;
  }

  updatePatrol(n, dt, dp) {
    const q = n.squad;
    n.aim = Math.max(0, n.aim);
    // They will stop for you, as long as they are not in the middle of a fight.
    const wait = dp < 5 && !(n.busyT > 0);
    if (wait) n.yaw = Math.atan2(this.g.player.x - n.x, this.g.player.z - n.z);
    let moved = false;
    if (!wait) {
      let lead = q.members[0];
      while (lead && lead.dead) { q.members.shift(); lead = q.members[0]; }
      let tx, tz, hold = false;
      if ((lead === n || !lead) && q.seekT > 0) {
        // Coming to find you. Once they are with you they wait, and go back to their round after a while.
        const P = this.g.player;
        q.seekT -= dt;
        tx = P.x; tz = P.z;
        if ((n.x - P.x) ** 2 + (n.z - P.z) ** 2 < 25) { hold = true; n.yaw = Math.atan2(P.x - n.x, P.z - n.z); }
      } else if (q.gate && (lead === n || !lead)) {
        // The pair out in front of a gate: walk to a spot, stop there and look out a while, on to the next.
        if ((n.x - q.wx) ** 2 + (n.z - q.wz) ** 2 < 6) {
          q.holdT = (q.holdT ?? 3 + rand() * 6) - dt;
          if (q.holdT > 0) { hold = true; if (n.aim <= 0) n.yaw = Math.atan2(q.ox, q.oz) + Math.sin(this.g.time * .4 + n.tick) * .6; }
          else { q.holdT = undefined; this.gateBeat(q); }
        }
        tx = q.wx; tz = q.wz;
      } else if (lead === n || !lead) {
        q.t -= dt;
        // Called in: a crew out on a wide beat when it turns bad comes straight back to the close line.
        if (q.camp && q.ring > 34 && this.underStress(q.camp)) q.t = 0;
        if (q.t <= 0 || (n.x - q.wx) ** 2 + (n.z - q.wz) ** 2 < 144) this.nextBeat(q);
        tx = q.wx; tz = q.wz;
      } else { tx = lead.x + Math.cos(n.flank) * 3.5; tz = lead.z + Math.sin(n.flank) * 3.5; }
      // A crew that is shooting stops to do it properly. The rest of the time they keep moving.
      const close = lead && lead !== n && (n.x - tx) ** 2 + (n.z - tz) ** 2 < 5;
      const seekNear = q.seekT > 0 && (lead === n || !lead) && dp < 50;
      if (!close && !hold && n.aim <= .4 && seekNear) {
        // The last stretch, straight at you.
        // Only what is actually in the way stops them here, not the street plan: they step up a kerb, and slide along a wall.
        const P = this.g.player, w = this.g.world, ddx = P.x - n.x, ddz = P.z - n.z, dd = Math.hypot(ddx, ddz) || 1;
        const fy = Math.floor(n.y + .05), sp = 4.4 * dt;
        const free = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); return !w.solid(cx, fy + 1, cz) && !w.solid(cx, fy + 2, cz) && !(w.solid(cx, fy, cz) && w.solid(cx, fy + 3, cz)); };
        const go = (x, z) => { const cx = Math.floor(x), cz = Math.floor(z); n.x = x; n.z = z; if (w.solid(cx, fy, cz)) n.y = fy + 1; };
        const ux = ddx / dd, uz = ddz / dd;
        if (free(n.x + ux * (sp + .4), n.z + uz * (sp + .4))) go(n.x + ux * sp, n.z + uz * sp);
        else if (free(n.x + Math.sign(ux) * (sp + .4), n.z)) go(n.x + Math.sign(ux) * sp, n.z);
        else if (free(n.x, n.z + Math.sign(uz) * (sp + .4))) go(n.x, n.z + Math.sign(uz) * sp);
        const gy = w.groundBelow(n.x, n.y + .6, n.z, 5);
        n.y += Math.sign(gy - n.y) * Math.min(Math.abs(gy - n.y), dt * 12);
        n.phase += 4.4 * dt * 2.1;
        n.yaw = Math.atan2(ddx, ddz);
        moved = true;
      } else if (!close && !hold && n.aim <= .4) { this.trek(n, tx, tz, q.seekT > 0 ? (lead === n ? 4.4 : 4.9) : (lead === n ? 3 : 3.5), dt, dp); moved = true; }
      else this.walkStep(n, 0, 0, dt, dp);
    } else this.walkStep(n, 0, 0, dt, dp);
    n.state = n.aim > 0 ? 3 : moved ? .7 : 0;
    // Now and then, into a crowd that is packed tight enough to be worth it, well clear of the wall and of you.
    if (n.aim > 0 && (n.nadeT = (n.nadeT ?? 30 + rand() * 60) - dt) <= 0) {
      n.nadeT = 6;
      const H = this.g.horde, P = this.g.player;
      let pick = -1;
      H.forRadius(n.x, n.z, 24, (i) => { if (pick < 0 && rand() < .15) { const d = Math.hypot(H.px[i] - n.x, H.pz[i] - n.z); if (d > 11) pick = i; } });
      if (pick >= 0) {
        const x = H.px[pick], z = H.pz[pick];
        let packed = 0;
        H.forRadius(x, z, 4, () => { packed++; });
        if (packed >= 6 && !H.campAt(x, z, 10) && Math.hypot(x - P.x, z - P.z) > 9 && rand() < .45) {
          this.lobAt(n, x, H.py[pick], z);
          n.nadeT = 45 + rand() * 75;
        }
      }
    }
  }

  // Pressed hard enough that the patrols pull in close and the watch starts using what it has been saving.
  underStress(c) {
    const S = this.g.campSim.state[c.id];
    return S.status === 'holding' && ((S.op && (S.op.mag || 1) >= 5) || S.breaches.length > 0 || S.locked || (S.drawing && S.pool > 300));
  }

  // A friendly grenade: the same throw as a raider's, at a spot rather than at you, and nothing it kills is yours.
  lobAt(n, x, y, z) {
    const g = this.g, P = g.player, d = Math.hypot(x - n.x, z - n.z), T = d / 15;
    n.yaw = Math.atan2(x - n.x, z - n.z);
    n.aim = .6;
    P.projectiles.push({ kind: 'grenade', hostile: true, x: n.x + Math.sin(n.yaw) * .8, y: n.y + 2.4, z: n.z + Math.cos(n.yaw) * .8, vx: (x - n.x) / T, vy: (y + .5 - n.y - 2.4) / T + 11 * T, vz: (z - n.z) / T, t: 0, fuse: Math.max(1.6, T + .9), radius: 3.2, strength: 9, dmg: 150, sticky: false, stuck: false, beep: 0 });
    g.audio.simple('swing', n.x, n.y, n.z);
    if (rand() < .7) g.ui.floatSay(n, pickOf(['Frag out!', 'Grenade! Get down!', 'Fire in the hole!', 'Throwing!']), 1.6);
  }

  // At a magnitude of 7 and up the watch breaks out the launchers: a rocket into the thickest of the crowd, out past the gates, from
  // whoever is up by a floodlight. Loud enough to hear across half the city, and not often: there are not many of them left.
  // Every watchtower has a launcher of its own: the four corners, and the pair either side of each gate. It goes out when there is a
  // real crowd in reach of that tower, a thick knot of the dead out in front of the wall, not on a schedule. Each one is called on the
  // radio a few seconds before it goes, and that tower then needs a long while to get another one up. Two towers never go for the
  // same crowd, and the calls come a few seconds apart. In a big operation it takes less of a crowd to be worth it.
  campRockets(c, st, dt) {
    const g = this.g, S = g.campSim.state[c.id], H = g.horde;
    if (!st.towers) st.towers = c.guards.filter((p) => p.gate || p.sniper).map((p) => ({ post: p, cd: 10 + rand() * 50, pend: null }));
    if (S.status !== 'holding' || S.evac) { for (const t of st.towers) t.pend = null; return; }
    // Rockets are mostly kept for operations. Outside one (or in a small one) it takes a far bigger crowd to be worth one, and the
    // towers wait much longer between them.
    for (const t of st.towers) {
      t.cd -= dt;
      if (t.pend && g.time >= t.pend.at) { const pend = t.pend; t.pend = null; this.launchRocket(c, st, pend); }
    }
    if ((st.rocketT = (st.rocketT ?? 3) - dt) > 0) return;
    st.rocketT = 3;
    // In an operation the launchers are what they are there for. An operation's own length no longer depends on how fast the dead go
    // down (the waves keep coming until it has run its course), so they go out as freely as a crowd is worth it.
    const inOp = !!S.op;
    // One call at a time across the whole camp, with room between them: a lot more room when there is no operation on.
    const opMag = inOp ? S.op.mag || 1 : 1;
    if (g.time - (st.lastCall ?? -99) < (inOp ? Math.max(3, 8 - opMag * .5) : 75)) return;
    const ready = st.towers.filter((t) => t.cd <= 0 && !t.pend);
    if (!ready.length) return;
    // The worse it gets, the freer they are with them: a smaller crowd is worth one, and the towers load faster.
    const mag = opMag, need = !inOp ? 55 : Math.max(12, Math.round(30 - mag * 2));
    // Where they actually are: every one of the dead out in front of the wall, counted into squares a blast across. The thickest
    // squares are then looked at properly, centred on the crowd in them.
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    const bins = this.rocketBins || (this.rocketBins = new Map());
    bins.clear();
    H.forRadius(cx, cz, Math.max(hx, hz) + 110, (i) => {
      const out = Math.max(Math.abs(H.px[i] - cx) - hx, Math.abs(H.pz[i] - cz) - hz);
      if (out < 14 || out > 100 || Math.abs(H.py[i] - STREET_Y) > 4) return;
      const k = (Math.floor(H.px[i] / 8) + 512) * 4096 + Math.floor(H.pz[i] / 8) + 512;
      const b = bins.get(k);
      if (b) { b.n++; b.x += H.px[i]; b.z += H.pz[i]; } else bins.set(k, { n: 1, x: H.px[i], z: H.pz[i] });
    });
    const crowds = [];
    // Plenty of them looked at: the thickest crowds are often a long way down a street, out of any tower's line, and a smaller one nearer is
    // the one that can actually be hit.
    for (const b of [...bins.values()].filter((b) => b.n >= need * .35).sort((a, b) => b.n - a.n).slice(0, 24)) {
      const x = b.x / b.n, z = b.z / b.n;
      let n = 0;
      H.forRadius(x, z, 8, () => { n++; });
      if (n >= need) crowds.push({ x, z, n });
    }
    crowds.sort((a, b) => b.n - a.n);
    const taken = st.towers.filter((t) => t.pend).map((t) => t.pend);
    for (const cr of crowds) {
      if (taken.some((p) => Math.hypot(p.x - cr.x, p.z - cr.z) < 16)) continue;
      // The nearest tower with its launcher ready and a clear line from the top of it.
      const order = ready.map((t) => ({ t, d: Math.hypot(t.post.x - cr.x, t.post.z - cr.z) })).filter((o) => o.d < 130).sort((a, b) => a.d - b.d);
      for (const { t } of order) {
        const crew = st.guards.find((m) => m.post === t.post && !m.dead);
        if (!crew) continue;
        const shot = this.rocketLine(c, st, [cr.x, cr.z], crew);
        if (!shot) continue;
        const where = this.towerName(c, t.post);
        g.campSim.radio(c, pickOf([`Rocket going out from the ${where} in five! Get clear of the front!`, `${where[0].toUpperCase() + where.slice(1)}, launcher's up. Rocket in five, heads down!`, `Big crowd off the ${where}. Rocket's going into them, five seconds! Clear out!`, `Stand clear of the ${where}, rocket coming! Five seconds!`]));
        g.ui.floatSay(crew, pickOf(['Loading!', 'Launcher up!', 'Get me a line!', 'Clear behind!']), 2.5);
        crew.aim = 5; crew.busyT = 6; crew.yaw = Math.atan2(cr.x - crew.x, cr.z - crew.z);
        t.pend = { n: crew, x: cr.x, z: cr.z, at: g.time + 5, only: true };
        // That tower's launcher is spent for a long while, however it goes.
        t.cd = inOp ? (125 + rand() * 65) * (1.15 - Math.min(.72, mag * .08)) : 420 + rand() * 240;
        st.lastCall = g.time;
        return;
      }
    }
  }

  // "north gate", "south-west corner": what the radio calls a tower.
  towerName(c, p) {
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    if (p.gate) {
      const q = c.gates.reduce((a, q) => (Math.hypot(q.cx - p.x, q.cz - p.z) < Math.hypot(a.cx - p.x, a.cz - p.z) ? q : a));
      return `${{ N: 'north', S: 'south', E: 'east', W: 'west' }[q.side]} gate`;
    }
    return `${p.z < cz ? 'north' : 'south'}-${p.x < cx ? 'west' : 'east'} corner`;
  }

  // Who on the wall has a clear line to it: up by a floodlight, or failing that the nearest of the watch, up on the parapet so the tube
  // clears the top of the wall. A rocket into the top of their own tower helps nobody.
  rocketLine(c, st, to, only = null) {
    const g = this.g;
    const crew = only ? [only] : st.guards.filter((n) => !n.dead);
    if (!crew.length) return null;
    const near = (n) => Math.min(...c.floods.map((l) => Math.hypot(l.x - n.x, l.z - n.z)), 999);
    if (!only) crew.sort((a, b) => Math.hypot(a.x - to[0], a.z - to[1]) + near(a) * .3 - Math.hypot(b.x - to[0], b.z - to[1]) - near(b) * .3);
    for (const m of crew.slice(0, 16)) {
      if (m.dead) continue;
      // Shouldered, under the tower's roof. The tower itself is no obstacle: the rocket goes out of the firing slit in its front, so the
      // first few blocks round the crew (their own rail, roof and walls) do not count, and it is seen leaving from the outside of them.
      for (const lift of [2.3, 1.7]) {
        const ax = m.x, ay = m.y + lift, az = m.z, bx = to[0] - ax, by = STREET_Y + 1 - ay, bz = to[1] - az, bl = Math.hypot(bx, by, bz) || 1;
        if (bl > 140) break;
        const ux = bx / bl, uy = by / bl, uz = bz / bl;
        let start = 2.2, hit = null;
        for (let k = 0; k < 8; k++) {
          hit = g.world.raycast(ax + ux * start, ay + uy * start, az + uz * start, ux, uy, uz, bl - 4 - start, true);
          if (hit && start + hit.dist < 9) { start += hit.dist + .75; continue; }
          break;
        }
        if (start >= 9) continue;
        // Something in the way right by the crowd is as good as the crowd: the blast is wide, and that is where it goes off.
        if (hit && hit.dist + start < bl - (7 + bl * .1)) continue;
        return { n: m, sx: ax, sy: ay, sz: az, dx: bx, dy: by, dz: bz, d: bl, start };
      }
    }
    return null;
  }

  // Five seconds on: into the thickest of them near where it was called, which will have shuffled a little.
  launchRocket(c, st, pend) {
    const g = this.g, H = g.horde;
    let to = [pend.x, pend.z], bestN = -1;
    H.forRadius(pend.x, pend.z, 10, (i) => {
      if (rand() > .3) return;
      let n = 0;
      H.forRadius(H.px[i], H.pz[i], 8, () => { n++; });
      if (n > bestN) { bestN = n; to = [H.px[i], H.pz[i]]; }
    });
    // Nobody on a wall is a marksman with one of these: it lands somewhere about the crowd, a few blocks off, more the further it goes.
    {
      const d = Math.hypot(to[0] - pend.n.x, to[1] - pend.n.z), err = (1.5 + d * .07) * Math.sqrt(rand()), a = rand() * 6.283;
      to = [to[0] + Math.cos(a) * err, to[1] + Math.sin(a) * err];
    }
    // A tower's own launcher: only its own crew fires it. Once it has been called it goes: if the crowd has shuffled out of the line,
    // it goes where it was called, or just short of it.
    const aims = [to, [pend.x, pend.z]];
    if (!pend.n.dead) for (const k of [.85, .7]) aims.push([pend.n.x + (pend.x - pend.n.x) * k, pend.n.z + (pend.z - pend.n.z) * k]);
    let shot = null;
    for (const a of aims) if (!shot && !pend.n.dead) shot = this.rocketLine(c, st, a, pend.n);
    if (!shot && !pend.only) shot = this.rocketLine(c, st, to);
    if (!shot) return;
    const { n, sx, sy, sz, dx, dy, dz, d } = shot, ux = dx / d, uy = dy / d, uz = dz / d;
    n.yaw = n.ys = Math.atan2(dx, dz); n.aim = 1.2; n.busyT = 3;
    const st0 = shot.start ?? 2.2;
    g.player.projectiles.push({ kind: 'rocket', hostile: true, loud: true, x: sx + ux * st0, y: sy + uy * st0, z: sz + uz * st0, vx: ux * 58, vy: uy * 58, vz: uz * 58, t: 0, fuse: 6, radius: 7, strength: 40, dmg: 380 });
    g.audio.rocketLaunch(sx, sy, sz);
    g.particles.sprite(1, sx + ux * 1.6, sy + uy * 1.6, sz + uz * 1.6, 0, 0, 0, .6, 3, 9, 5, 2, 1, .08);
    g.ui.floatSay(n, pickOf(['Rocket out!', 'Backblast clear!', 'Heads down, rocket!', 'Eat this!']), 2);
  }

  // --- People on the road -----------------------------------------------------------------------------
  // Nobody's patrol and nobody's problem. Some are making for a wall they have heard is still up. Some have given up on walls.
  spawnWanderers() {
    const g = this.g, w = g.world, P = g.player, D = g.director;
    if (this.list.filter((n) => n.kind === 'wanderer').length >= 18) return;
    // Is anyone on the road near here?
    let route = null;
    for (const d of D.displaced) {
      if (d.left <= 0) continue;
      const a = g.layout.camps[d.from], b = g.layout.camps[d.to];
      const ux = b.cx - a.cx, uz = b.cz - a.cz, k = Math.max(0, Math.min(1, ((P.x - a.cx) * ux + (P.z - a.cz) * uz) / (ux * ux + uz * uz || 1)));
      if (Math.hypot(a.cx + ux * k - P.x, a.cz + uz * k - P.z) < 300) { route = d; break; }
    }
    if (!route && rand() < .5) return;
    for (let t = 0; t < 24; t++) {
      const a = rand() * 6.283, r = 75 + rand() * 110;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (x < 2 || z < 2 || x >= WX - 2 || z >= WZ - 2) continue;
      const gd = g.layout.ground[z * WX + x];
      if (gd !== G.ROAD && gd !== G.WALK && gd !== G.PLAZA && gd !== G.ALLEY) continue;
      if (!w.walk[(x >> 1) + (z >> 1) * w.walkW] || g.horde.campAt(x, z, 20)) continue;
      if (w.los(P.x, P.y + 2.4, P.z, x + .5, w.terrainTop(x, z) + 2, z + .5)) continue;
      const from = route ? g.layout.camps[route.from] : null;
      const count = route ? Math.min(route.left, 3 + Math.floor(rand() * 5)) : rand() < .15 ? 4 + Math.floor(rand() * 2) : 1 + Math.floor(rand() * 3);
      if (route) route.left -= count;
      const squad = { members: [] }, dest = route ? route.to : rand() < .4 ? this.someCamp() : -1;
      const trader = !route && rand() < .22;
      for (let i = 0; i < count; i++) {
        const nx = x + (rand() - .5) * 5, nz = z + (rand() - .5) * 5, kid = !!route && rand() < .12;
        const weapon = kid ? null : rand() < .62 ? pickOf(['pistol', 'pistol', 'shotgun', 'bat', 'machete', 'smg']) : null;
        const m = new NPC('wanderer', nx, w.terrainTop(nx, nz), nz, { weapon, kid, variant: wardrobeRow(from ? from.wardrobe : ['civ', 'scrap', 'civ']), hp: kid ? 110 : 200, title: from ? `From ${from.name}` : 'Wanderer' });
        m.dest = dest;
        m.squad = squad;
        m.flank = rand() * 6.283;
        m.fromCamp = from ? from.id : -1;
        squad.members.push(m);
        if (trader && i === 0) { m.role = rand() < .5 ? 'general' : 'junk'; m.title = 'Travelling trader'; m.stockKey = `w${Math.floor(rand() * 1e9)}`; }
        this.list.push(m);
      }
      return;
    }
  }

  // Most of the people on the road near you are heading the same way. The field gets worked out for them.
  // Out on the road with a group from a fallen settlement, the streets are quieter than they would be: the crowd is back at the walls
  // you left. They thicken again as the next settlement comes near, its own dead closing in round it. Only the steady fill of the
  // streets is turned down; what is already chasing you, and what comes out of the buildings, is not.
  journeyStep() {
    const g = this.g, P = g.player, H = g.horde;
    let want = 1;
    for (const n of this.list) {
      const q = n.squad;
      if (!q || !q.rally || q.members[0] !== n || n.dead || n.dest === undefined || n.dest < 0) continue;
      if (Math.hypot(n.x - P.x, n.z - P.z) > 90) continue;
      const c = g.layout.camps[n.dest];
      const toWall = Math.max(c.x0 - n.x, n.x - c.x1, c.z0 - n.z, n.z - c.z1, 0);
      const k = toWall > 260 ? .8 : toWall < 90 ? 1 : .8 + .2 * (1 - (toWall - 90) / 170);
      want = Math.min(want, k);
    }
    H.journeyWant = want;
  }

  pickRoad() {
    const g = this.g, H = g.horde, P = g.player, count = {};
    let top = -1, most = 0;
    for (const n of this.list) {
      if (n.kind !== 'wanderer' || n.dest === undefined || n.dest < 0 || g.campSim.state[n.dest].status !== 'holding') continue;
      count[n.dest] = (count[n.dest] || 0) + 1;
      if (count[n.dest] > most) { most = count[n.dest]; top = n.dest; }
    }
    if (top < 0) { H.setRoad(null, null); this.road = null; return; }
    const c = g.layout.camps[top];
    if (!this.road || this.road.id !== top) {
      let bg = null, bd = 1e12;
      for (const q of c.gates) { const d = (q.cx - P.x) ** 2 + (q.cz - P.z) ** 2; if (d < bd) { bd = d; bg = q; } }
      if (!bg) { H.setRoad(null, null); this.road = null; return; }
      const ox = bg.side === 'W' ? -1 : bg.side === 'E' ? 1 : 0, oz = bg.side === 'N' ? -1 : bg.side === 'S' ? 1 : 0;
      this.road = { id: top, def: bg, middle: null };
      H.setRoad(bg.cx + ox * 7, bg.cz + oz * 7);
    }
    // Where the middle of the column has got to, so the front can ease off and the back can catch up.
    const all = [];
    for (const n of this.list) {
      if (n.kind !== 'wanderer' || n.dest !== top || !n.weak) continue;
      const d = H.roadDist(n.x, n.z);
      if (d !== null) all.push(d);
    }
    all.sort((a, b) => a - b);
    this.road.middle = all.length >= 3 ? all[Math.floor(all.length * .35)] : null;
  }

  someCamp() {
    const g = this.g, open = g.layout.camps.filter((c) => g.campSim.state[c.id].status === 'holding');
    return open.length ? pickOf(open).id : -1;
  }

  updateWanderer(n, dt, dp) {
    const g = this.g, H = g.horde, P = g.player;
    if (n.rally && !n.rally.gone && this.rallyStep(n, dt, dp)) return;
    if (n.zT === undefined || (n.zT -= dt) <= 0) {
      n.zT = .35 + rand() * .3;
      let bd = 15 * 15, bi = -1;
      H.forRadius(n.x, n.z, 15, (i) => {
        const dd = (H.px[i] - n.x) ** 2 + (H.pz[i] - n.z) ** 2;
        if (dd < bd && Math.abs(H.py[i] - n.y) < 4) { bd = dd; bi = i; }
      });
      n.zd = bi >= 0 ? Math.sqrt(bd) : 99;
      if (bi >= 0) { n.zx = H.px[bi]; n.zz = H.pz[bi]; }
    }
    let moved = false;
    // Anyone with somewhere to be checks every few seconds that they are getting there, whatever else is going on. Caught in a building,
    // boxed in against a wall, or not getting any closer: back out to the nearest open street and on from there.
    if (n.dest >= 0 && (n.goalT = (n.goalT ?? 5) - dt) <= 0) {
      const c = g.layout.camps[n.dest], left = Math.hypot(c.cx - n.x, c.cz - n.z);
      // At the gate they are waiting their turn or already on their way in, and nobody needs rescuing from that.
      const gd = n.gateTo && n.gateTo.def, atGate = gd && n.gateTo.camp === n.dest && Math.hypot(gd.cx - n.x, gd.cz - n.z) < 28;
      if (!atGate && (g.layout.lot[Math.floor(n.z) * WX + Math.floor(n.x)] || (n.goalD !== undefined && n.goalD - left < 3))) this.unstick(n);
      n.goalD = left;
      n.goalT = 5;
    }
    // In a group people hold their nerve: they keep to their place and let the guns deal with it, until it is right on them.
    const scared = n.zd < (n.squad && n.squad.rally ? (n.armed ? 2.5 : 5) : (n.armed ? 5 : 11));
    if (scared) {
      // Away from it. If they know where they are going, mostly that means carrying on up the road, a good deal faster.
      const m = n.zd || 1, c = n.dest >= 0 ? g.layout.camps[n.dest] : null, route = c && this.road && this.road.id === n.dest ? H.roadAt(n.x, n.z) : null;
      let ax = (n.x - n.zx) / m, az = (n.z - n.zz) / m;
      if (route) { ax = ax * .55 + route[0] * 1.4; az = az * .55 + route[1] * 1.4; }
      else if (c) { const t = Math.hypot(c.cx - n.x, c.cz - n.z) || 1; ax += (c.cx - n.x) / t * 1.1; az += (c.cz - n.z) / t * 1.1; }
      const k = Math.hypot(ax, az) || 1, bx = n.x, bz = n.z;
      this.walkStep(n, ax / k * 5.2, az / k * 5.2, dt, dp);
      // Pinned: straight up the road instead, and if that is no good either, the sides are the only way out.
      if (route && Math.abs(n.x - bx) + Math.abs(n.z - bz) < 1e-4) this.walkStep(n, route[0] * 5.2, route[1] * 5.2, dt, dp);
      moved = true;
    } else if (dp < 4.5 && !(n.busyT > 0) && !(this.g.ui.modal === 'dialog' && this.g.ui.dlgNpc !== n)) {
      n.yaw = Math.atan2(P.x - n.x, P.z - n.z);
      this.walkStep(n, 0, 0, dt, dp);
    } else if (n.restT > 0) {
      n.restT -= dt;
      this.walkStep(n, 0, 0, dt, dp);
    } else if (n.aim <= .3 || n.dest >= 0) {
      // Anyone with somewhere to be shoots on the move. Stopping to fight is how you end up not getting there.
      const q = n.squad;
      let lead = q ? q.members[0] : null;
      while (lead && (lead.dead || lead.kind !== 'wanderer')) { q.members.shift(); lead = q.members[0]; }
      // Whoever leads a group out of a fallen camp keeps an eye behind: nobody gets left at the back.
      if (q && q.rally && lead === n) {
        // Which way the group is going: where whoever is in front has actually been walking, eased so it does not swing about.
        if (q.lx !== undefined) {
          const mx = n.x - q.lx, mz = n.z - q.lz, ml = Math.hypot(mx, mz);
          if (ml > .02) {
            const k = Math.min(1, dt * 1.5), ax = mx / ml, az = mz / ml;
            q.hx = (q.hx ?? ax) + (ax - (q.hx ?? ax)) * k; q.hz = (q.hz ?? az) + (az - (q.hz ?? az)) * k;
            const hl = Math.hypot(q.hx, q.hz) || 1; q.hx /= hl; q.hz /= hl;
          }
        }
        q.lx = n.x; q.lz = n.z;
        // Nobody gets left at the back: a pause for anyone dropping well behind the rest.
        if ((n.waitT = (n.waitT || 0) - dt) <= 0) {
          n.waitT = 1.5;
          if (q.members.some((m) => !m.dead && Math.hypot(m.x - n.x, m.z - n.z) > (q.tail || 11) + 12)) n.restT = 2;
        }
        if (rand() < dt * .006) this.bark(n, pickOf(['Keep moving. Nobody falls behind.', 'Stay together back there!', 'Not far now.', 'Eyes on the side streets.']), 40);
      }
      let tx, tz;
      if (lead && lead !== n && q.rally && n.trailA !== undefined) {
        // Their own place in the crowd, relative to the way it is going, drifting a little as people do.
        if ((n.driftT = (n.driftT || 0) - dt) <= 0) {
          n.driftT = 6 + rand() * 8;
          // Drifting about inside the knot, never out of it.
          const hw = q.halfW || 3 + Math.sqrt(q.members.length) * 1.4, hl = q.halfL || (q.tail || 10) / 2;
          n.trailS = Math.max(-hw * 1.1, Math.min(hw * 1.1, n.trailS + (rand() - .5) * 2.4));
          n.trailA = Math.max(-(hl * 2 + 2.5), Math.min(.5, n.trailA + (rand() - .5) * 2.4));
        }
        const hx = q.hx ?? 0, hz = q.hz ?? 1;
        tx = lead.x + hx * n.trailA - hz * n.trailS; tz = lead.z + hz * n.trailA + hx * n.trailS;
        if (((n.tick + this.frameN) & 1) === 0) n.room = this.elbowRoom(n, q.members, 2.2);
        if (n.room) { tx += n.room[0]; tz += n.room[1]; }
      } else if (lead && lead !== n) {
        const fr = n.flankR || 3;
        tx = lead.x + Math.cos(n.flank) * fr; tz = lead.z + Math.sin(n.flank) * fr;
        // They wait when the one in front does.
        if (lead.restT > 0) n.restT = lead.restT + rand();
      } else if (n.dest >= 0 && g.campSim.state[n.dest].status === 'holding') {
        const c = g.layout.camps[n.dest];
        if (this.road && this.road.id === n.dest) n.gateTo = { camp: n.dest, def: this.road.def };
        // Make for the nearest gate. It opens for them, and in they go.
        if (!n.gateTo || n.gateTo.camp !== n.dest) {
          let bg = null, bd = 1e12;
          for (const q of c.gates) { const d = (q.cx - n.x) ** 2 + (q.cz - n.z) ** 2; if (d < bd) { bd = d; bg = q; } }
          n.gateTo = bg ? { camp: n.dest, def: bg } : null;
        }
        const q = n.gateTo && n.gateTo.def;
        tx = q ? q.cx : c.cx; tz = q ? q.cz : c.cz;
        if (q && (n.x - q.cx) ** 2 + (n.z - q.cz) ** 2 < 15 * 15) { this.arrive(n, c, q, dt); return; }
        if (!q && n.x > c.x0 - 10 && n.x < c.x1 + 10 && n.z > c.z0 - 10 && n.z < c.z1 + 10) { n.dead = true; return; }
        // All going the same way, but a crowd and not a queue: everyone drifts across the street at their own angle and their own
        // pace, peels off the wall when they reach it, and heads back across.
        const route = this.road && this.road.id === n.dest ? H.roadAt(n.x, n.z) : null;
        if (route && (!lead || lead === n || (n.x - tx) ** 2 + (n.z - tz) ** 2 > 100)) {
          if (n.lean === undefined || (n.leanT = (n.leanT || 0) - dt) <= 0) {
            n.lean = (rand() - .5) * .9;
            n.leanT = 3 + rand() * 6;
            n.pace = (n.kid ? 3 : 2.8) + rand() * 1.4;
          }
          const a = n.lean, ca = Math.cos(a), sa = Math.sin(a);
          // They spread out leaving and pull together again on the road: nobody wants to be the one out in front, or the one left behind.
          let keep = 1;
          const mid = this.road.middle, here = mid !== null && n.weak ? H.roadDist(n.x, n.z) : null;
          if (here !== null) {
            const lag = here - mid;
            keep = lag > 18 ? 1.4 : lag < -18 ? Math.max(.6, 1 + (lag + 18) / 70) : 1;
          }
          // At the head of a group from a fallen camp: a pace the slowest of them can keep.
          const speed = (n.squad && n.squad.rally && (!lead || lead === n) ? Math.min(2.5, n.pace) : n.pace * (n.weak ? 1.3 : 1) * keep), bx = n.x, bz = n.z;
          this.walkStep(n, (route[0] * ca - route[1] * sa) * speed, (route[0] * sa + route[1] * ca) * speed, dt, dp);
          if (Math.abs(n.x - bx) + Math.abs(n.z - bz) < 1e-4) {
            n.lean = -n.lean;
            this.walkStep(n, route[0] * speed, route[1] * speed, dt, dp);
            if (Math.abs(n.x - bx) + Math.abs(n.z - bz) < 1e-4) { n.trekT = (n.trekT || 0) + dt; if (n.trekT > 1.6) { n.trekT = 0; this.unstick(n); } }
          }
          n.state = n.aim > 0 ? 3 : .7;
          if (n.speakT > 0) n.speakT -= dt;
          return;
        }
      } else {
        // Out here for its own sake. Keep moving, stop somewhere safe-looking for a while, keep moving.
        if (n.wpx === undefined || (n.x - n.wpx) ** 2 + (n.z - n.wpz) ** 2 < 100) {
          if (n.wpx !== undefined && rand() < .45) n.restT = 12 + rand() * 30;
          const a = rand() * 6.283, r = 60 + rand() * 90;
          n.wpx = Math.max(4, Math.min(WX - 4, n.x + Math.cos(a) * r));
          n.wpz = Math.max(4, Math.min(WZ - 4, n.z + Math.sin(a) * r));
        }
        tx = n.wpx; tz = n.wpz;
      }
      if (q && q.rally && lead && lead !== n) {
        // Keeping up with their bit of the crowd: an even walk, a little quicker the further they have dropped back, easing in and out
        // of it rather than stopping dead and setting off again.
        const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
        const want = d < 1 ? 0 : Math.min(4.6, 1.6 + d * .22);
        n.v = (n.v || 0) + (want - (n.v || 0)) * Math.min(1, dt * (want > (n.v || 0) ? 2.2 : 3.5));
        if (n.v > .15 && d > .05) {
          const bx = n.x, bz = n.z;
          this.walkStep(n, dx / d * n.v, dz / d * n.v, dt, dp);
          if (Math.abs(n.x - bx) + Math.abs(n.z - bz) < 1e-4) this.trek(n, tx, tz, n.v, dt, dp);
          moved = n.v > .5;
        } else this.walkStep(n, 0, 0, dt, dp);
        const where = q.toName || 'The next settlement';
        if (rand() < dt * .004) this.bark(n, pickOf(['Stay with the group.', 'Keep up.', 'How much further?', 'Do not look back. Just walk.', 'Where are we even going?', `${where}. If it is still there.`]), 30);
      } else if (!lead || lead === n || (n.x - tx) ** 2 + (n.z - tz) ** 2 > 6) { this.trek(n, tx, tz, (n.kid ? 3.4 : 3 + (n.tick & 1) * .3) * (n.weak ? 1.25 : 1), dt, dp); moved = true; }
      else this.walkStep(n, 0, 0, dt, dp);
    } else this.walkStep(n, 0, 0, dt, dp);
    // Stopping for a breather out on the road is standing about: there is nothing out there to sit on.
    n.state = n.aim > 0 ? 3 : moved ? .7 : 0;
    if (n.speakT > 0) n.speakT -= dt;
  }

  // The last few steps: the gate swings open, they walk through, and they are one of this camp's people now.
  arrive(n, c, q, dt) {
    const st = this.camps[c.id];
    if (!st.active) { n.dead = true; return; }
    const gate = st.gates.find((k) => k.def === q);
    if (gate) gate.admitT = 3;
    const inX = q.side === 'W' ? 1 : q.side === 'E' ? -1 : 0, inZ = q.side === 'N' ? 1 : q.side === 'S' ? -1 : 0;
    const inTx = q.cx + inX * 10, inTz = q.cz + inZ * 10;
    // Still outside and off to one side: line up with the opening first, each at their own place across it, rather than cutting through the wall.
    const depth = (n.x - q.cx) * inX + (n.z - q.cz) * inZ, side = (n.x - q.cx) * inZ + (n.z - q.cz) * inX;
    const wide = depth < -1 && Math.abs(side) > 3.5, across = Math.max(-3.5, Math.min(3.5, side));
    const tx = wide ? q.cx - inX * 3 + inZ * across : inTx, tz = wide ? q.cz - inZ * 3 + inX * across : inTz;
    const dx = tx - n.x, dz = tz - n.z, way = Math.hypot(dx, dz) || 1;
    // Past the threshold the gate no longer matters. Nobody should be stopped dead in the opening if it swings shut behind them.
    if (!gate || gate.open >= .6 || gate.broken || depth >= 0) {
      n.x += dx / way * 3.2 * dt; n.z += dz / way * 3.2 * dt;
      n.phase += 3.2 * dt * 2.1; n.yaw = Math.atan2(dx, dz); n.state = .7;
    } else n.state = 0;
    // The ground is not level on the way in. Stay on it.
    const gy = this.g.world.groundBelow(n.x, n.y + 1.2, n.z, 8);
    n.y += Math.sign(gy - n.y) * Math.min(Math.abs(gy - n.y), dt * 12);
    if (wide || Math.hypot(inTx - n.x, inTz - n.z) > 2) return;
    // One less on the road and one more mouth here, now rather than whenever the rest of them turn up.
    if (n.fromCamp >= 0 && n.joining === undefined) this.g.director.walkedIn(n.fromCamp, c.id);
    n.kind = 'resident';
    n.camp = c.id; n.campKey = c.key; n.campName = c.name;
    n.title = undefined;
    n.y = STREET_Y;
    n.weak = false;
    n.evacuee = false;
    n.hp = Math.max(n.hp, 140);
    n.gateTo = null; n.squad = null; n.joining = undefined;
    n.home = c.spots.plaza;
    st.npcs.push(n);
    this.startTask(n, c);
  }

  // --- A raid: a big crew through the wall. They are after the stores and whoever is in the way. You are a stranger
  // in somebody else's fight, and they will leave you to it unless you make it personal.
  spawnRaid(c, S) {
    const g = this.g, w = g.world, R = S.raid, H = g.horde;
    R.spawned = true;
    const horiz = R.side === 'N' || R.side === 'S';
    const lo = (horiz ? c.x0 : c.z0) + 16, hi = (horiz ? c.x1 : c.z1) - 16;
    // Not at a gate: that is where the guns are.
    let t = Math.floor(lo + rand() * (hi - lo));
    for (let k = 0; k < 8 && c.gates.some((q) => q.side === R.side && Math.abs(q.tc - t) < 18); k++) t = Math.floor(lo + rand() * (hi - lo));
    const fixed = R.side === 'N' ? c.z0 : R.side === 'S' ? c.z1 : R.side === 'W' ? c.x0 : c.x1;
    const ox = R.side === 'W' ? -1 : R.side === 'E' ? 1 : 0, oz = R.side === 'N' ? -1 : R.side === 'S' ? 1 : 0;
    R.tc = t; R.ox = ox; R.oz = oz;
    R.bx = horiz ? t : fixed; R.bz = horiz ? fixed : t;
    R.blowT = 9 + rand() * 4;
    const tough = 1 + Math.min(.9, g.day * .03), gang = R.bx * 7 + R.bz * 3 + 1;
    for (let i = 0; i < R.size; i++) {
      const key = R.size >= 14 && i === 0 ? 'boss' : RAID_CREW[i % RAID_CREW.length];
      const role = RAIDER_ROLES[key];
      let x = 0, z = 0, ok = false;
      for (let k = 0; k < 20 && !ok; k++) {
        const out = 18 + rand() * 18, side = (rand() - .5) * 34;
        x = Math.floor(R.bx + ox * out + (horiz ? side : 0)); z = Math.floor(R.bz + oz * out + (horiz ? 0 : side));
        ok = x > 2 && z > 2 && x < WX - 2 && z < WZ - 2 && !!w.walk[(x >> 1) + (z >> 1) * w.walkW] && !H.campAt(x, z, 4);
        // Not stood inside a wreck, a bus or a wall.
        if (ok) { const y = w.terrainTop(x, z); ok = !w.solid(x, y, z) && !w.solid(x, y + 1, z) && !w.solid(x, y + 2, z); }
      }
      if (!ok) { x = R.bx + ox * 8; z = R.bz + oz * 8; }
      const m = new NPC('raider', x + .5, w.terrainTop(x, z), z + .5, { weapon: pickOf(role.weapons), variant: wardrobeRow(['raider']), hp: role.hp * 1.5 * tough * (.9 + rand() * .2), name: pickOf(RAIDER_NAMES), title: role.boss ? 'Raider boss' : 'Raider' });
      m.gang = gang;
      m.raidCamp = c.id;
      m.raider = role;
      m.maxHp = m.hp;
      m.flank = (rand() - .5) * 30;
      m.grenades = 0;
      m.crew = R.size;
      m.homeX = x; m.homeZ = z;
      m.dx = 0; m.dz = 0;
      this.list.push(m);
    }
  }

  raidCount(id) {
    let n = 0;
    for (const m of this.list) if (m.raidCamp === id && !m.dead) n++;
    return n;
  }

  raidRetreat(id) {
    for (const m of this.list) if (m.raidCamp === id) { m.raidOut = true; m.path = null; }
  }

  updateRaidRaider(n, dt, dp) {
    const g = this.g, H = g.horde, P = g.player, w = g.world, S = g.campSim.state[n.raidCamp], R = S.raid, c = g.layout.camps[n.raidCamp], role = n.raider;
    n.cd -= dt; n.barkT -= dt; n.aim = Math.max(0, n.aim - dt);
    // It is over, one way or another: from here they are just a crew heading somewhere else, and in no mood to pick another fight.
    if (!R || S.status !== 'holding') {
      n.raidCamp = undefined; n.calm = true;
      n.homeX = Math.max(8, Math.min(WX - 8, n.x + (n.x - c.cx) * .8)); n.homeZ = Math.max(8, Math.min(WZ - 8, n.z + (n.z - c.cz) * .8));
      return;
    }
    if (!R.blown) {
      R.blowT -= dt;
      if (R.blowT <= 0) {
        R.blown = true;
        const open = S.breaches.find((b) => b.side === R.side);
        if (open) { R.bx = open.x; R.bz = open.z; R.tc = open.tc; }
        else g.campSim.carve(c, S, R.side, R.tc);
        H.noise(R.bx, R.bz, 90, .7);
      }
    }
    const inside = H.campAt(n.x, n.z, -1);
    // Who is nearest? Twice a second is plenty.
    if ((n.foeT = (n.foeT || 0) - dt) <= 0) {
      n.foeT = .45 + rand() * .3;
      // Whoever is closest that they can actually get a line on. They are not here for the people who run the place,
      // and nobody shoots the doctor if they might need one on the way out.
      const close = this.raidNear || (this.raidNear = []);
      close.length = 0;
      for (const h of this.camps[n.raidCamp].npcs) {
        if (h.dead || h.kind === 'guard' || h.kind === 'boss' || h.kind === 'clerk' || h.kind === 'named' || h.doctor) continue;
        const d = (h.x - n.x) ** 2 + (h.z - n.z) ** 2;
        if (d > 80 * 80) continue;
        if (close.length < 5) { close.push([d, h]); close.sort((a, b) => a[0] - b[0]); }
        else if (d < close[4][0]) { close[4] = [d, h]; close.sort((a, b) => a[0] - b[0]); }
      }
      let open = null;
      if (n.armed) for (const [d, h] of close) if (d < n.gun.range ** 2 && this.clearShot(n, h.x, h.y + 1.8, h.z)) { open = h; break; }
      n.foe = open || (close[0] ? close[0][1] : null);
      n.foeOpen = !!open;
      // The camp's people come first. But stand close enough, or shoot one of them, and you are part of this as well.
      const fd = n.foe ? Math.hypot(n.foe.x - n.x, n.foe.z - n.z) : 999;
      // Only a few at a time, though. The rest have a job to do.
      let onYou = 0;
      for (const m of this.raiders) if (m !== n && m.onPlayer && !m.dead) onYou++;
      n.onPlayer = P.alive && onYou < 3 && dp < (n.aggro ? 46 : 26) && dp * (n.aggro ? .8 : 1.7) < (n.foeOpen ? fd : fd + 20) && w.los(n.x, n.y + 2.3, n.z, P.x, P.y + 1.8, P.z);
      if (n.onPlayer && !n.seenP) { n.seenP = true; if (rand() < .4) g.ui.floatSay(n, pickOf(n.raider.say), 2.2); }
      if (!n.onPlayer) n.seenP = false;
    }
    let tx, tz, stop = 1;
    const breachIn = () => { tx = R.bx - R.ox * 12; tz = R.bz - R.oz * 12; };
    if (n.raidOut) {
      if (inside) breachIn(); else { tx = R.bx + R.ox * 40; tz = R.bz + R.oz * 40; }
      if (!inside && Math.hypot(n.x - tx, n.z - tz) < 16) { n.raidCamp = undefined; n.calm = true; n.homeX = tx + R.ox * 160; n.homeZ = tz + R.oz * 160; return; }
    } else if (!R.blown) {
      const hz = R.ox === 0;
      tx = R.bx + R.ox * 11 + (hz ? n.flank : 0); tz = R.bz + R.oz * 11 + (hz ? 0 : n.flank); stop = 3;
    } else if (n.onPlayer && (inside || dp < 20)) {
      tx = P.x; tz = P.z;
      stop = n.armed ? Math.min(role.hold, 12) : 1.8;
    } else if (!inside) breachIn();
    else if (n.foe) {
      tx = n.foe.x; tz = n.foe.z;
      stop = n.armed ? Math.min(role.hold, 15) : 1.6;
    } else { tx = c.spots.plaza.x; tz = c.spots.plaza.z; stop = 4; }
    const dx = tx - n.x, dz = tz - n.z, dist = Math.hypot(dx, dz);
    let moving = false;
    if (dist > stop) {
      const speed = role.speed * (n.raidOut ? 1.25 : 1);
      if (inside && c.nav) {
        // Through the camp they have to go round things, the same as anyone.
        if ((n.pathT = (n.pathT || 0) - dt) <= 0 && this.pathBudget > 0) {
          this.pathBudget--;
          n.path = this.findPath(c, n.x, n.z, tx, tz);
          n.pathI = n.path && n.path.length > 2 ? 2 : 0;
          n.pathT = 1.6 + rand() * 1.6;
        }
        if (n.path && n.pathI < n.path.length) {
          const px = n.path[n.pathI], pz = n.path[n.pathI + 1], ax = px - n.x, az = pz - n.z, ad = Math.hypot(ax, az);
          if (ad < .7) n.pathI += 2;
          else {
            const bx = n.x, bz = n.z;
            this.walkStep(n, ax / ad * speed, az / ad * speed, dt, dp);
            moving = true;
            // Caught on a corner. They shove through it.
            if (Math.abs(n.x - bx) + Math.abs(n.z - bz) < .0001) {
              n.blockT = (n.blockT || 0) + dt;
              if (n.blockT > .8) { n.x += ax / ad * .9; n.z += az / ad * .9; n.blockT = 0; }
            } else n.blockT = 0;
          }
        }
      } else {
        const bx = n.x, bz = n.z;
        this.walkStep(n, dx / dist * speed, dz / dist * speed, dt, dp);
        moving = true;
        // Stuck on the stakes: they climb over.
        if (Math.abs(n.x - bx) + Math.abs(n.z - bz) < .0001) {
          n.blockT = (n.blockT || 0) + dt;
          if (n.blockT > 1.1) { n.x += dx / dist * 1.3; n.z += dz / dist * 1.3; n.blockT = 0; }
        } else n.blockT = 0;
      }
    }
    if (!moving) this.walkStep(n, 0, 0, dt, dp);
    n.state = n.aim > 0 ? 3 : moving ? .7 : 0;
    if (n.barkT <= 0 && dp < 40 && rand() < .5) { n.barkT = 10 + rand() * 16; g.ui.floatSay(n, pickOf(RAID_BARKS), 2.2); }
    if (n.cd > 0) return;
    n.cd = n.gun && n.gun.rate ? n.gun.rate * (1.4 + rand()) : .9;
    // You, if it has come to that. They are in a hurry and most of it goes wide, but it is real.
    if (n.onPlayer) {
      if (!n.armed && dp < 2.8) {
        P.damage((7 + rand() * 4) * this.raiderHits(), n.x, n.z, 'shot');
        n.cd = 1.7 + rand() * .9;
        n.aim = .4;
        n.yaw = Math.atan2(P.x - n.x, P.z - n.z);
        g.audio.simple('swing', n.x, n.y, n.z);
        return;
      }
      if (n.armed && dp < (RAIDER_GUN[n.weaponName] || RAIDER_GUN.pistol).range && this.clearShot(n, P.x, P.y + 1.6, P.z)) {
        n.cd *= 1.4;
        this.raiderShoot(n, dp);
        R.shots++;
        H.noise(n.x, n.z, 26, .3);
        return;
      }
    }
    // Blades, on whoever is in arm's reach.
    if (!n.armed && n.foe && !n.foe.dead && (n.foe.x - n.x) ** 2 + (n.foe.z - n.z) ** 2 < 6.2) {
      this.hurt(n.foe, 26);
      n.aim = .4;
      n.yaw = Math.atan2(n.foe.x - n.x, n.foe.z - n.z);
      g.audio.simple('swing', n.x, n.y, n.z);
      return;
    }
    // Armed and with a line on someone. This is mostly about keeping heads down while the others load up.
    if (n.armed && n.foe && !n.foe.dead && n.foeOpen && (n.foe.x - n.x) ** 2 + (n.foe.z - n.z) ** 2 < n.gun.range ** 2) {
      this.fire(n, n.foe.x, n.foe.y + 1.8, n.foe.z, n.gun, true);
      R.shots++;
      H.noise(n.x, n.z, 26, .3);
      if (rand() < .08) this.hurt(n.foe, n.gun.dmg * .45);
      return;
    }
    if (this.selfDefence(n, dp, false)) { if (n.armed) { R.shots++; H.noise(n.x, n.z, 26, .3); } }
  }

  // --- When a camp falls ------------------------------------------------------------------------------
  // The gates go up and whoever is left runs for the one furthest from the crowd.
  evacuate(c, refuge) {
    const st = this.camps[c.id], S = this.g.campSim.state[c.id];
    if (!st.active) return;
    for (const gate of st.gates) { if (!gate.broken) { gate.evac = true; gate.target = 1; } }
    // Every way out anyone can think of: the gates, and the holes the dead came in by.
    const exits = [];
    for (const q of c.gates) {
      const ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
      exits.push({ ix: q.cx - ox * 12, iz: q.cz - oz * 12, ox: q.cx + ox * 18, oz: q.cz + oz * 18, to: refuge ? refuge.id : -1, from: c });
    }
    for (const b of S.breaches) {
      const ox = b.side === 'W' ? -1 : b.side === 'E' ? 1 : 0, oz = b.side === 'N' ? -1 : b.side === 'S' ? 1 : 0;
      exits.push({ ix: b.x - ox * 10, iz: b.z - oz * 10, ox: b.x + ox * 16, oz: b.z + oz * 16, to: refuge ? refuge.id : -1, from: c, hole: true });
    }
    if (!exits.length) return;
    // The gates on the side nearest the next camp get more of them, since that is where everyone is going.
    if (refuge) {
      const ux = refuge.cx - c.cx, uz = refuge.cz - c.cz, m = Math.hypot(ux, uz) || 1;
      for (const e of exits) e.lean = Math.max(0, ((e.ox - c.cx) * ux + (e.oz - c.cz) * uz) / (m * Math.hypot(e.ox - c.cx, e.oz - c.cz)));
    }
    // Somewhere to meet outside: past the gate on the side towards the next camp, far enough out to be clear of the wall. Not everyone
    // makes for it, but most of them do, and the ones who do go on together. You find it by going where they go.
    const best = exits.filter((e) => !e.hole).sort((a, b) => (b.lean || 0) - (a.lean || 0))[0] || exits[0];
    const ux = best.ox - best.ix, uz = best.oz - best.iz, ul = Math.hypot(ux, uz) || 1;
    st.rally = { x: best.ox + ux / ul * 16, z: best.oz + uz / ul * 16, to: refuge ? refuge.id : -1, toName: refuge ? refuge.name : '', from: c.id, members: [], at: 0, gone: false, t0: this.g.time, expect: 6 };
    // Everyone goes out on that side, the side towards the next settlement: the gate by the meeting place, one round the corner from
    // it, or a hole near it. Out of the far gate they would only have to come back in and through the place again, whether they mean
    // to meet the others or to strike out on their own.
    const toRally = (e) => Math.hypot(e.ox - st.rally.x, e.oz - st.rally.z);
    const nearest = Math.min(...exits.map(toRally));
    const rallyExits = exits.filter((e) => toRally(e) <= nearest + 60);
    for (const n of st.npcs) {
      if (n.kind === 'guard' || n.kind === 'sentry' || n.kind === 'follower') continue;
      const joins = rand() < .9;
      this.startFleeing(n, c, rallyExits);
      if (joins) { n.rallyTo = st.rally; st.rally.expect++; }
    }
    // A handful of the watch come down to go with them. They are what makes it a group worth being in.
    const free = st.guards.filter((n) => !n.dead && n.armed && !(n.post && n.post.gate));
    const escort = free.sort(() => rand() - .5).slice(0, Math.min(16, Math.max(10, Math.round(free.length * .3))));
    for (const n of escort) {
      st.guards = st.guards.filter((m) => m !== n);
      n.beat = null; n.post = null; n.y = STREET_Y; n.escort = true;
      this.startFleeing(n, c, [best]);
      n.fleeT = rand() * 3;
      n.rallyTo = st.rally;
    }
    // Someone has to say it.
    const side = best.ox > c.x1 ? 'east' : best.ox < c.x0 ? 'west' : best.oz < c.z0 ? 'north' : 'south';
    const talkers = st.npcs.filter((n) => !n.dead && !n.kid).sort(() => rand() - .5).slice(0, 5);
    talkers.forEach((n, k) => setTimeout(() => { if (!n.dead) this.bark(n, pickOf([`Everyone out the ${side} gate! We go together!`, 'Stay with the group! Nobody runs off on their own!', `Meet outside the ${side} gate, we move as one!`, 'Grab what you can carry and follow the guards!', 'Stick together, it is the only way we make it!', 'Kids in the middle! Guns on the outside!']), 60); }, 600 + k * 1400));
    this.g.campSim.radio(c, `Everybody out the ${side} gate and form up outside. We go together, guns on the outside. Nobody goes alone.`, c.name, true, true);
  }

  // Nobody is following a plan. Each runs for whichever way out they think of first, some of them the long way round,
  // some of them not straight away, and some of them straight into it.
  startFleeing(n, c, exits) {
    if (n.task && n.task.poi && n.task.poi.by === n) n.task.poi.by = null;
    if (n.kind !== 'resident') { n.kind = 'resident'; n.task = { poi: { x: n.x, z: n.z, kind: 'stand' }, kind: 'stand', loose: true, t: 999 }; n.arrived = true; }
    let best = exits[0], bs = 1e12;
    for (const e of exits) {
      // Mostly whatever is near. Holes are only for people who have run out of ideas.
      const score = Math.hypot(e.ix - n.x, e.iz - n.z) * (.35 + rand() * 1.5) * (e.hole ? 1.7 : 1) * (1 - (e.lean || 0) * .6);
      if (score < bs) { bs = score; best = e; }
    }
    n.flee = best;
    n.y = STREET_Y;
    n.evacuee = true;
    n.path = null;
    n.threat = null;
    n.fleeOut = false;
    n.fleeT = rand() * rand() * 22;                     // some stand there for a moment before it lands
    n.fleeK = 1.5 + rand() * 1.4;                       // some of them can really run
    n.weave = (rand() - .5) * 2.4;
    // Home first, or to find someone, or just the wrong way.
    if (rand() < .35) { const p = c.pois[Math.floor(rand() * c.pois.length)]; n.fleeVia = { x: p.x, z: p.z }; } else n.fleeVia = null;
  }

  updateFleeing(n, dt, dp, c) {
    const p = n.flee, g = this.g;
    if (n.fleeT > 0) { n.fleeT -= dt; n.state = rand() < .02 ? 4 : n.state; return; }
    if (n.fleeOut) {
      // Through the gate and out onto the street.
      const dx = p.ox - n.x, dz = p.oz - n.z, d = Math.hypot(dx, dz);
      if (d < 3) { this.intoTheStreet(n, p, c); return; }
      n.x += dx / d * n.speed * n.fleeK * dt; n.z += dz / d * n.speed * n.fleeK * dt;
      n.phase += 5.2 * dt * 2.1; n.yaw = Math.atan2(dx, dz); n.state = .7;
      n.runT = (n.runT || 0) + dt;
      if (n.runT > 12) this.intoTheStreet(n, p, c);
      return;
    }
    if (!n.path) {
      if (this.pathBudget <= 0) { n.state = 0; return; }
      this.pathBudget--;
      const via = n.fleeVia;
      n.path = this.findPath(c, n.x, n.z, via ? via.x : p.ix, via ? via.z : p.iz);
      n.pathI = n.path && n.path.length > 2 ? 2 : 0;
      if (!n.path) {
        if (via) { n.fleeVia = null; return; }
        n.fleeOut = true;
        return;
      }
    }
    const speed = n.speed * n.fleeK;
    let left = speed * dt, hx = 0, hz = 0;
    n.phase += left * 2.1;
    n.state = .7;
    while (left > 0) {
      if (n.pathI >= n.path.length) {
        if (n.fleeVia) { n.fleeVia = null; n.path = null; return; }
        n.fleeOut = true;
        return;
      }
      const tx = n.path[n.pathI], tz = n.path[n.pathI + 1], dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d > .001) { hx = dx / d; hz = dz / d; }
      if (d > left) { n.x += dx / d * left; n.z += dz / d * left; break; }
      n.x = tx; n.z = tz; left -= d; n.pathI += 2;
    }
    if (hx || hz) {
      n.yaw = Math.atan2(hx, hz);
      // Nobody runs a clean line in a panic.
      const sw = Math.sin(g.time * 1.7 + n.phase * .2) * n.weave * dt;
      this.nudge(n, -hz * sw, hx * sw, g.world);
    }
  }

  // Meeting up outside a fallen camp. Everyone headed for the spot waits there, keeping the dead off, until most of them have made it
  // or it has been long enough; then they go on together, in a loose ring round whoever is leading, with the guns spread round it.
  rallyStep(n, dt, dp) {
    const R = n.rally, g = this.g, now = g.time;
    R.members = R.members.filter((m) => !m.dead);
    const here = Math.hypot(n.x - R.x, n.z - R.z) < (R.rw ? R.rw + 4 : 9);
    if (here && !n.atRally) { n.atRally = true; R.at++; if (!R.firstAt) R.firstAt = now; }
    const ready = R.firstAt && (R.at >= Math.max(3, R.members.length * .65) || now - R.firstAt > 35 || now - R.t0 > 80);
    if (ready) {
      // Off they go. The best armed walks in front; everyone else takes a place on a ring round them.
      R.gone = true;
      const group = R.members.filter((m) => m.escort || m.atRally || Math.hypot(m.x - R.x, m.z - R.z) < 30);
      group.sort((a, b) => (b.escort ? 2 : b.armed ? 1 : 0) - (a.escort ? 2 : a.armed ? 1 : 0));
      const q = { members: group, rally: true, toName: R.toName };
      // Nobody leaves empty-handed if they can help it: more than half of those with nothing pick something up on the way out, and
      // together they are a lot harder to bring down than any one of them would be.
      for (const m of group) {
        if (!m.armed && !m.kid && rand() < .45) m.setWeapon(pickOf(['pistol', 'pistol', 'shotgun', 'bat', 'machete']));
        if (!m.toughened) { m.toughened = true; m.maxHp = Math.round((m.maxHp || m.hp) * 1.3); m.hp = Math.max(m.hp, m.maxHp * .9); m.bodyHp = m.maxHp; }
      }
      // Not a formation: a crowd of people sticking together. They trail along behind whoever is in front, spread across the street,
      // and the guns go out on the edges and up near the front.
      // A knot, not a column: everyone has a spot somewhere in an oval behind whoever leads, no wider than a street, and only a couple
      // of times as long as it is wide. Guns on the rim, children towards the middle.
      const N = group.length;
      q.halfW = Math.min(7.5, 2.5 + Math.sqrt(N) * .75);
      q.halfL = Math.max(q.halfW * 1.2, Math.min(18, 2.5 + Math.sqrt(N) * 1.25));
      q.tail = q.halfL * 2 + 2;
      group.forEach((m, k) => {
        m.squad = q; m.rally = null; m.dest = R.to; m.spot = undefined;
        if (k === 0) return;
        const a = rand() * Math.PI * 2, r = m.escort || (m.armed && rand() < .5) ? .78 + rand() * .22 : m.kid ? Math.sqrt(rand()) * .5 : Math.sqrt(rand()) * .9;
        m.trailA = -(q.halfL + 1.5) + Math.cos(a) * r * q.halfL;
        m.trailS = Math.sin(a) * r * q.halfW;
        m.restT = rand() * 1.2;
      });
      const where = R.toName || 'the next settlement';
      if (group[0]) this.bark(group[0], pickOf(['That is everyone we are going to get. Let us go.', 'Right. We move now. Stay together.', `We are going to ${where}. Stick with us.`, 'Time to go. Keep up, and keep quiet.']), 50);
      return false;
    }
    if (!here) {
      // Getting there, steering round what is in the way.
      const dx = R.x - n.x, dz = R.z - n.z, d = Math.hypot(dx, dz) || 1;
      this.walkStep(n, dx / d * 4.6, dz / d * 4.6, dt, dp);
      n.state = .7;
      return true;
    }
    // Waiting. Not lined up round a spot: standing about in little knots with whoever they know, spread over the street, while the ones
    // with guns hang round the edges watching the side streets. The more of them there are, the more room it takes up.
    if (!R.knots) {
      const N = Math.max(6, R.expect || R.members.length), k = Math.max(2, Math.round(N / 6));
      R.rw = 5 + Math.sqrt(N) * 1.5;
      R.knots = [];
      // Out in the open street, never inside a building or up against one.
      for (let i = 0; i < k; i++) {
        for (let t = 0; t < 12; t++) {
          const a = rand() * 6.283, r = R.rw * Math.sqrt(rand()) * .85, x = R.x + Math.cos(a) * r, z = R.z + Math.sin(a) * r;
          if (t < 11 && !this.openGround(x, z, 2)) continue;
          R.knots.push({ x, z, n: 0 });
          break;
        }
      }
      R.edge = 0;
    }
    if (n.spot === undefined) {
      for (let t = 0; t < 10; t++) {
        if (n.escort || (n.armed && rand() < .5)) {
          const a = (R.edge++ * 2.39996 + rand() * .4) % 6.283, r = R.rw + 1.5 + rand() * 3;
          n.spot = [R.x + Math.cos(a) * r, R.z + Math.sin(a) * r]; n.knot = null;
        } else {
          const K = R.knots[Math.floor(rand() * R.knots.length)], s = K.n++, a = s * 2.39996 + rand() * .6, r = 1.2 + Math.sqrt(s) * 1.35;
          n.spot = [K.x + Math.cos(a) * r, K.z + Math.sin(a) * r]; n.knot = K;
        }
        if (this.openGround(n.spot[0], n.spot[1], 1)) break;
      }
      n.lookT = rand() * 4;
    }
    let tx = n.spot[0], tz = n.spot[1];
    const push = this.elbowRoom(n, R.members, 1.5);
    tx += push[0]; tz += push[1];
    const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
    n.restT = 0;
    if (d > .8) { const sp = Math.min(2.6, 1 + d * .5); this.walkStep(n, dx / d * sp, dz / d * sp, dt, dp); n.state = .7; }
    else {
      this.walkStep(n, 0, 0, dt, dp);
      n.state = n.aim > 0 ? 3 : 0;
      // The ones in a knot mostly face each other; now and then anyone glances off down a street. The ones on the edge watch outwards.
      if (n.aim <= 0 && (n.lookT -= dt) <= 0) {
        n.lookT = 2 + rand() * 5;
        const K = n.knot;
        n.wantYaw = K && rand() < .7 ? Math.atan2(K.x - n.x, K.z - n.z) + (rand() - .5) * .8 : Math.atan2(n.x - R.x, n.z - R.z) + (rand() - .5) * 1.6;
      }
      if (n.aim <= 0 && n.wantYaw !== undefined) this.turnTo(n, n.wantYaw, dt);
    }
    const where = R.toName || 'the next settlement';
    if (rand() < dt * .02) this.bark(n, pickOf(n.knot ? ['Is this everyone?', 'Has anyone seen my brother?', 'We wait for the others. Then we go.', 'Keep your voice down.', `Are we really going to ${where}?`, 'Stay together. We are safer as a crowd.', 'Did they all get out?'] : ['Quiet out here. Too quiet.', 'Anything moving your way?', 'We cannot wait much longer.', 'Watch that side street.', 'Come on, come on...']), 30);
    return true;
  }

  // Somewhere out in the open you could stand: walkable street, and nothing solid within a block or two of it.
  openGround(x, z, clear = 1) {
    const w = this.g.world, ix = Math.floor(x), iz = Math.floor(z);
    if (ix < 2 || iz < 2 || ix >= WX - 2 || iz >= WZ - 2 || !w.walk[(ix >> 1) + (iz >> 1) * w.walkW]) return false;
    const y = Math.floor(w.terrainTop(ix, iz));
    for (let dz = -clear; dz <= clear; dz++) for (let dx = -clear; dx <= clear; dx++) if (w.solid(ix + dx, y + 1, iz + dz)) return false;
    return true;
  }

  // A little room to stand: a push away from anyone in this list who is right on top of them.
  elbowRoom(n, list, r) {
    let px = 0, pz = 0;
    for (const m of list) {
      if (m === n || m.dead) continue;
      const dx = n.x - m.x, dz = n.z - m.z, d2 = dx * dx + dz * dz;
      if (d2 > r * r || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), k = (r - d) / r;
      px += dx / d * k * 1.6; pz += dz / d * k * 1.6;
    }
    return [px, pz];
  }

  intoTheStreet(n, p, c) {
    const st = this.camps[c.id], g = this.g;
    st.npcs = st.npcs.filter((m) => m !== n);
    n.kind = 'wanderer';
    n.camp = -1;
    n.dest = p.to;
    n.title = `From ${c.name}`;
    n.fromCamp = c.id;
    n.flee = null; n.fleeOut = false; n.task = null; n.path = null; n.role = null; n.doctor = false;
    n.part = null; n.loreId = null;
    n.squad = null; n.moveT = 0;
    // They made it out with nothing, in whatever state they were already in.
    n.weak = !n.escort;
    if (n.rallyTo && !n.rallyTo.gone) { n.rally = n.rallyTo; n.rally.members.push(n); }
    n.rallyTo = null;
    this.unstick(n);
    n.y = g.world.terrainTop(n.x, n.z);
  }

  // Everyone from this camp who is still on their feet and on the way out, or already on the road.
  stillRunning(id) {
    let n = 0;
    for (const m of this.list) if (!m.dead && ((m.flee && m.camp === id) || (m.kind === 'wanderer' && m.fromCamp === id))) n++;
    return n;
  }

  // --- Update ----------------------------------------------------------------------------------
  // The same people doing the same things, on the menu, with no one to fight: no raiders, no roamers, and nobody hunting them.
  showcaseUpdate(dt) {
    this.raidT = 1e3;
    this.roamTimer = 1e3;
    this.wanderT = 1e3;
    this.update(dt);
    this.g.horde.humans = [];
  }

  update(dt) {
    const g = this.g, P = g.player;
    this.pathBudget = 5;
    this.frameN = (this.frameN || 0) + 1;
    for (const c of g.layout.camps) {
      const d = Math.hypot(c.cx - P.x, c.cz - P.z);
      if (d < 380) this.activateCamp(c);
      else if (d > 470 && !this.showcase) this.deactivateCamp(c);
      if (P.x > c.x0 && P.x < c.x1 && P.z > c.z0 && P.z < c.z1 && !P.discovered[c.id] && g.campSim.state[c.id].status === 'holding') {
        P.discovered[c.id] = true;
        g.ui.banner(c.name, c.blurb);
      }
      const st = this.camps[c.id];
      if (st.active) {
        this.updateGates(c, st, dt);
        st.scanT -= dt;
        if (st.scanT <= 0 && !this.showcase) { st.scanT = .25; this.defendCamp(c, st, .25); this.campRockets(c, st, .25); }
        const S = g.campSim.state[c.id];
        if (st.freshGates) { st.freshGates = false; st.gateWatchT = 10; this.manGates(c, st, true); }
        if ((st.gateWatchT = (st.gateWatchT ?? 2) - dt) <= 0) { st.gateWatchT = 10; this.manGates(c, st); }
        if ((st.fillT = (st.fillT ?? 8) - dt) <= 0) {
          st.fillT = 12 + rand() * 10;
          if (S.status === 'holding' && !S.drawing && !S.evac && !S.raid) this.replenish(c, st, S);
        }
      }
    }
    this.roamTimer -= dt;
    if (this.roamTimer <= 0) {
      // Someone with a debt to settle finds a patrol sooner, and closer.
      const owes = g.layout.camps.some((c) => P.discovered[c.id] && Math.hypot(c.cx - P.x, c.cz - P.z) < 500 && this.owesBail(c.id));
      this.roamTimer = owes ? 8 + rand() * 10 : 5 + rand() * 7;
      // Close to a camp's wall is where its crews are thickest, so that is where they turn up: just out of sight, not across town.
      let wall = 1e9;
      for (const c of g.layout.camps) if (g.campSim.state[c.id].status === 'holding') wall = Math.min(wall, Math.max(c.x0 - P.x, P.x - c.x1, c.z0 - P.z, P.z - c.z1));
      if (owes) this.spawnRoamers(45, 45); else if (wall < 140) this.spawnRoamers(40, 70); else this.spawnRoamers();
    }
    if ((this.bailT = (this.bailT ?? 2) - dt) <= 0) { this.bailT = 4; this.bailCrew(); }
    if ((this.wanderT = (this.wanderT ?? 30) - dt) <= 0) { this.wanderT = 28 + rand() * 40; this.spawnWanderers(); }
    if ((this.roadT = (this.roadT ?? 0) - dt) <= 0) { this.roadT = 2.5; this.pickRoad(); this.journeyStep(); }

    this.coolGrudges(dt);
    this.raidT -= dt;
    if (this.raidT <= 0) { this.raidT = (32 + rand() * 48) / (1 + Math.min(.8, g.day * .03)); this.spawnRaiders(); }
    this.raiders.length = 0;
    // Patrols leave you alone unless you shot at one. A camp only cares once you are back inside its wall.
    const onRoad = P.wanted[-1] > 0;
    const within = g.horde.campAt(P.x, P.z) ? g.horde.inCamp(P.x, P.z) : null;
    const angry = this.angry || (this.angry = []);
    this.watchTrespass(within, dt);
    for (const c of g.layout.camps) angry[c.id] = !!within && within.id === c.id && (this.hostileCamp(c.id) || this.trespassing === c.id);
    const inId = within ? within.id : -1;
    if (inId !== this.lastWithin) {
      this.lastWithin = inId;
      if (inId >= 0 && angry[inId] && this.hostileCamp(inId)) g.ui.banner('You are not welcome here', `They will shoot. Bail is ${this.bailFor(inId)} spades, at their Town Hall or to a patrol outside.`);
    }
    // Who is standing where, near you: people walking through a camp have to get round each other.
    const crowd = this.crowd || (this.crowd = new Map());
    crowd.clear();
    for (const m of this.list) {
      if (m.dead || m.camp < 0 || m.flee || !(m.kind === 'resident' || m.kind === 'guard' || m.kind === 'vendor' || m.kind === 'clerk' || m.kind === 'named' || m.kind === 'boss')) continue;
      if (Math.abs(m.x - P.x) > 80 || Math.abs(m.z - P.z) > 80) continue;
      const key = (Math.floor(m.x) >> 1) + (Math.floor(m.z) >> 1) * 4096;
      const cell = crowd.get(key);
      if (cell) cell.push(m); else crowd.set(key, [m]);
    }
    const humans = this.humans;
    humans.length = 0;
    this.barkGlobal -= dt;
    this.shotsBark -= dt;
    const fN = this.frameN;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      if (n.dead) { this.list.splice(i, 1); continue; }
      const dp = Math.hypot(n.x - P.x, n.z - P.z);
      if (n.leaving) {
        if (((n.tick + this.frameN) & 15) === 0 && this.offCamera(n, dp)) { n.dead = true; this.list.splice(i, 1); }
        continue;
      }
      // Still running when you walked away from it. Out of sight, but still counted among those who got out.
      if (n.flee && dp > 340) { g.campSim.state[n.camp].outOfSight = (g.campSim.state[n.camp].outOfSight || 0) + 1; this.list.splice(i, 1); continue; }
      const hostile = n.kind !== 'follower' && n.kind !== 'wanderer' && (n.camp >= 0 ? angry[n.camp] : onRoad);
      if (n.kind === 'raider') {
        if (dp > 340) {
          // Out of sight, out of the simulation. A bounty's gang is back when you are.
          const j = n.bounty && g.jobs.active.find((a) => a.id === n.bounty);
          if (j) j.spawned = false;
          this.list.splice(i, 1);
          continue;
        }
        humans.push(n);
        this.raiders.push(n);
      } else if (n.kind === 'roamer' || n.kind === 'wanderer') {
        if (dp > 340) {
          if (n.kind === 'wanderer' && n.fromCamp >= 0 && g.campSim.state[n.fromCamp].status === 'holding') g.campSim.state[n.fromCamp].outOfSight = (g.campSim.state[n.fromCamp].outOfSight || 0) + 1;
          this.list.splice(i, 1);
          continue;
        }
        humans.push(n);
      } else if (n.kind === 'follower') humans.push(n);
      else if (n.camp >= 0 && humans.length < 800) {
        const S = g.campSim.state[n.camp];
        if (n.flee || (S.real && S.drawing)) humans.push(n);   // anyone in a camp under attack is on the menu
      }
      // People a long way from you only need a coarse update.
      // The step it works out is then walked over the frames until the next one, not taken in one go, so even a long way off nobody
      // moves in jerks.
      if (dp > 70 && n.kind === 'resident' && !n.alarmed && n.arrived && !n.flee) {
        if (((n.tick + fN) & 3) === 0) {
          if (n.cLeft > 0) { n.x += n.cdx * n.cLeft; n.y += n.cdy * n.cLeft; n.z += n.cdz * n.cLeft; n.phase += n.cdp * n.cLeft; }
          const ox = n.x, oy = n.y, oz = n.z, op = n.phase;
          this.updateNPC(n, dt * 4, dp, hostile); this.hillY(n);
          n.cdx = (n.x - ox) / 4; n.cdy = (n.y - oy) / 4; n.cdz = (n.z - oz) / 4; n.cdp = (n.phase - op) / 4;
          // A jump (sat down, stood up, stepped through a door) is a jump: nothing to spread.
          if (Math.abs(n.cdx) + Math.abs(n.cdz) > .5) n.cLeft = 0;
          else { n.x = ox + n.cdx; n.y = oy + n.cdy; n.z = oz + n.cdz; n.phase = op + n.cdp; n.cLeft = 3; }
        } else if (n.cLeft > 0) { n.x += n.cdx; n.y += n.cdy; n.z += n.cdz; n.phase += n.cdp; n.cLeft--; }
      } else {
        if (n.cLeft > 0) { n.x += n.cdx * n.cLeft; n.y += n.cdy * n.cLeft; n.z += n.cdz * n.cLeft; n.phase += n.cdp * n.cLeft; n.cLeft = 0; }
        this.updateNPC(n, dt, dp, hostile); this.hillY(n);
      }
    }
    g.horde.humans = humans;
    this.frameDt = dt;
    // Everybody turns like a person: whatever they decided this frame, the body gets there at its own pace.
    const now = g.time;
    for (const n of this.list) {
      if (n.busyT > 0) n.busyT -= dt;
      // Shooting at something: the body stays on it for a moment, whatever the legs are doing.
      let da = (n.faceT > now ? n.faceYaw : n.yaw) - n.ys;
      while (da > Math.PI) da -= 6.2832;
      while (da < -Math.PI) da += 6.2832;
      const most = dt * (n.faceT > now ? 9 : n.aim > 0 ? 8 : 5.5), step = da * Math.min(1, dt * 9);
      n.ys += Math.abs(step) > most ? Math.sign(step) * most : step;
    }
    this.flashlights();
    this.updateChatter(dt);
    this.keepApart(dt);
  }

  // --- People talking among themselves ---------------------------------------------------------------
  // Out in the country the ground is not level. Anyone walking it stands on the hill, not inside it, and comes back down with it.
  hillY(n) {
    const t = this.g.world.terrainTop(n.x, n.z);
    if (t > STREET_Y) { if (n.y < t || n.onHill) { n.y = t; n.onHill = true; } } else if (n.onHill) { n.y = STREET_Y; n.onHill = false; }
  }

  updateChatter(dt) {
    const g = this.g, P = g.player;
    // Conversations already running: the next person speaks when the last has had time to be read.
    for (let i = this.convos.length - 1; i >= 0; i--) {
      const c = this.convos[i];
      const broken = c.people.some((n) => n.dead || (!c.urgent && (n.alarmed || n.threat || (n.kind === 'resident' && !n.arrived))) || g.ui.dlgNpc === n);
      const far = Math.hypot(c.people[0].x - P.x, c.people[0].z - P.z) > 44;
      if (broken || far) { for (const n of c.people) n.inConvo = false; this.convos.splice(i, 1); continue; }
      for (const n of c.people) if (n.task && n.task.t < 4) n.task.t = 4;   // nobody walks off mid-sentence
      c.t -= dt;
      if (c.t > 0) continue;
      if (c.i >= c.lines.length) { for (const n of c.people) n.inConvo = false; this.convos.splice(i, 1); continue; }
      const who = c.people[c.i % c.people.length], to = c.people[(c.i + 1) % c.people.length];
      // People use each other's names, some of the time.
      const line = c.lines[c.i++].replace('{name}', to.name.split(' ')[0]);
      g.ui.floatSay(who, line, 2.2 + line.length * .03);
      who.speakT = 1.4 + line.length * .03;
      for (const n of c.people) {
        if (n === who || n.state === 5) continue;
        if (n.kind === 'resident' || n.kind === 'named') n.yaw = Math.atan2(who.x - n.x, who.z - n.z);
      }
      c.t = 1.5 + line.length * .042 + rand() * .5;
    }
    // Start another whenever there is room, with whoever happens to be standing together.
    this.chatT -= dt;
    if (this.chatT > 0 || this.convos.length >= 4 || g.ui.modal) return;
    this.chatT = 1 + rand() * 1.2;
    for (let t = 0; t < 14; t++) {
      const n = this.list[Math.floor(rand() * this.list.length)];
      if (!n || n.dead || n.inConvo || n.kid || n.state === 7) continue;
      const S = n.camp >= 0 ? g.campSim.state[n.camp] : null, urgent = !!(S && S.inside > 5);
      if (Math.hypot(n.x - P.x, n.z - P.z) > 34 || (!urgent && (n.alarmed || (n.kind === 'resident' && !n.arrived)))) continue;
      const group = [n];
      for (const m of this.list) {
        if (m === n || m.dead || m.inConvo || m.kid || m.state === 7 || (m.kind === 'guard') !== (n.kind === 'guard') || (!urgent && m.kind === 'resident' && !m.arrived)) continue;
        if (m.kind === 'raider' !== (n.kind === 'raider') || Math.abs(m.y - n.y) > 2) continue;
        if ((m.x - n.x) ** 2 + (m.z - n.z) ** 2 < 42) { group.push(m); if (group.length >= 4) break; }
      }
      if (group.length < 2) continue;
      const job = n.task && n.task.kind;
      const late = g.tod > .8 || g.tod < .22;
      const kind = urgent ? 'alarm' : n.kind === 'raider' ? 'raider' : n.kind === 'wanderer' ? 'road' : n.kind === 'guard' ? 'guard' : n.kind === 'roamer' || n.kind === 'follower' ? 'patrol'
        : job === 'browse' || job === 'shop' || job === 'market' ? (late ? 'nightmarket' : 'market') : n.state === 5 ? 'fire' : job === 'work' || job === 'farm' ? 'work' : 'general';
      let pool = kind === 'road' ? ROAD_TALK : CONVERSATIONS[kind];
      if (kind === 'general' || kind === 'fire' || kind === 'guard') {
        // What is on their minds depends on where they are, the weather, and the hour.
        if (n.camp >= 0 && g.director.strength(g.layout.camps[n.camp]) < .62 && rand() < .4) pool = DECLINE_TALK;
        else if (g.weather.rain > .25 && rand() < .3) pool = CONVERSATIONS.rain;
        else if ((g.tod > .8 || g.tod < .22) && rand() < .35) pool = CONVERSATIONS.night;
        else if (n.campKey && rand() < .35) pool = CAMP_TALK[n.campKey] || pool;
      }
      const lines = this.freshLine(pool);
      if (kind === 'market' || kind === 'nightmarket') {
        // A price is argued between the customer and whoever is behind the counter.
        const seller = group.find((m) => m.kind === 'vendor');
        if (seller) { group.splice(group.indexOf(seller), 1); group.splice(1, 0, seller); }
      }
      for (const m of group) m.inConvo = true;
      this.convos.push({ people: group.slice(0, Math.max(2, Math.min(group.length, lines.length))), lines, i: 0, t: rand() * .4, urgent });
      return;
    }
  }

  // Something nobody in earshot has just said.
  freshLine(pool) {
    const said = this.said || (this.said = []);
    let line = pickOf(pool);
    for (let t = 0; t < 6 && said.includes(line); t++) line = pickOf(pool);
    said.push(line);
    if (said.length > 40) said.shift();
    return line;
  }

  // Nobody stands inside anybody else. People who are seated or at a post stay put; the others make room.
  keepApart(dt) {
    const g = this.g, P = g.player, w = g.world;
    const grid = this.apartGrid || (this.apartGrid = new Map());
    grid.clear();
    const fixed = (n) => n.kind === 'guard' || n.kind === 'sentry' || n.kind === 'vendor' || n.kind === 'boss' || n.kind === 'clerk' || n.kind === 'named' || n.state === 5 || n.state === 7;
    for (const n of this.list) {
      if (n.dead || Math.abs(n.x - P.x) > 150 || Math.abs(n.z - P.z) > 150) continue;
      const k = (Math.floor(n.x / 2) & 4095) + (Math.floor(n.z / 2) & 4095) * 4096;
      let cell = grid.get(k);
      if (!cell) { cell = []; grid.set(k, cell); }
      cell.push(n);
    }
    const R = 1.25, rate = Math.min(1, dt * 7);
    for (const [k, cell] of grid) {
      for (let a = 0; a < cell.length; a++) {
        const n = cell[a];
        for (const oz of [0, 1]) for (const ox of oz ? [-1, 0, 1] : [0, 1]) {
          const other = ox || oz ? grid.get(k + ox + oz * 4096) : cell;
          if (!other) continue;
          for (let b = other === cell ? a + 1 : 0; b < other.length; b++) {
            const m = other[b];
            if (Math.abs(m.y - n.y) > 2) continue;
            let dx = n.x - m.x, dz = n.z - m.z, d = Math.hypot(dx, dz);
            if (d >= R) continue;
            // Someone walking past a person who stays put can brush by them. Only actually walking into them gets stopped.
            const fn0 = fixed(n), fm0 = fixed(m), brush = (fn0 && m.state === .7) || (fm0 && n.state === .7);
            if (brush && d >= .85) {
              const s = (fm0 ? n : m).tick & 1 ? dt * 1.2 : -dt * 1.2, ux = dx / d, uz = dz / d;
              this.nudge(fm0 ? n : m, -uz * s, ux * s, w);
              continue;
            }
            if (d < .01) { const an = rand() * 6.283; dx = Math.cos(an); dz = Math.sin(an); d = 1; } else { dx /= d; dz /= d; }
            const push = ((brush ? .85 : R) - Math.min(d, brush ? .85 : R)) * rate;
            const fn = fixed(n), fm = fixed(m);
            if (fn && fm) continue;
            const pn = fm ? push : fn ? 0 : push * .5, pm = fn ? push : fm ? 0 : push * .5;
            this.nudge(n, dx * pn, dz * pn, w);
            this.nudge(m, -dx * pm, -dz * pm, w);
            // Pushing back would only leave someone leaning on the other person forever. Whoever is on the move steps round.
            const step = dt * 1.9;
            if (fm && n.state === .7) { const s = n.tick & 1 ? step : -step; this.nudge(n, -dz * s, dx * s, w); }
            else if (fn && m.state === .7) { const s = m.tick & 1 ? step : -step; this.nudge(m, -dz * s, dx * s, w); }
            else if (n.state === .7 && m.state === .7) { this.nudge(n, -dz * step * .5, dx * step * .5, w); this.nudge(m, dz * step * .5, -dx * step * .5, w); }
          }
        }
      }
    }
  }

  nudge(n, dx, dz, w) {
    if (!dx && !dz) return;
    const x = n.x + dx, z = n.z + dz, c = n.camp >= 0 ? this.g.layout.camps[n.camp] : null;
    if (c && c.nav) {
      const cx = (Math.floor(x) - c.x0) >> 1, cz = (Math.floor(z) - c.z0) >> 1;
      if (cx < 0 || cz < 0 || cx >= c.navW || cz >= c.navD || c.nav[cx + cz * c.navW]) return;
    } else if (w.solid(Math.floor(x), Math.floor(n.y + 1), Math.floor(z))) return;
    n.x = x; n.z = z;
  }

  // Where a point on the held weapon really is this frame, by the same pose the body is drawn in. ly and lz are in body
  // units, as in the weapon models: -y runs towards the muzzle, +z is up once the arm is raised.
  // Up or down, eased, and kept at the precision the shader is sent so the drawn gun and anything worked out from it agree exactly.
  easePitch(n, pitch, k) {
    n.tpS = n.tpS === undefined ? pitch : n.tpS + (pitch - n.tpS) * Math.min(1, k * 3);
    n.pitchQ = Math.round((Math.max(-.8, Math.min(.4, n.tpS)) + .8) / 1.2 * 63);
    n.pitchA = n.pitchQ / 63 * 1.2 - .8;
  }

  // Where a point on the right arm, or on what it holds, is drawn this frame. This is the actor vertex shader's own arithmetic for
  // that arm (ACTOR_VS in engine/shaders.js), step for step, so a torch worked out here is where the gun is drawn, not near it. Any change
  // to the arm or the guns there has to be made here as well. Returns the point, and the way the barrel points (mesh -y) from it.
  heldPoint(n, ly, lz, lit = true, firing = false) {
    const w = n.weaponId || 0, gun = w > 0 && w < 8, two = w >= 2 && w <= 7, t = this.g.time;
    let st = firing ? 3 : n.state || 0;
    if (gun && n.readyT > t) lit = true;   // just fired: the gun stays up and ready, as with a torch on it
    if (w >= 8 && st === 3) st = 0;   // a blade is drawn idle between swings
    const walking = Math.abs(st - .7) < .01, sitting = st === 5, asleep = st === 7, swing = Math.sin(n.phase), seed = (n.variant || 0) * .37;
    const aiming = st === 3 || (lit && st < 2.5 && !sitting && !asleep);
    const held = two && !sitting && !asleep && st !== 4 && st !== 6 && st < 9;
    const rx = (a, p) => { const c = Math.cos(a), s = Math.sin(a); return [p[0], c * p[1] - s * p[2], s * p[1] + c * p[2]]; };
    const rz = (a, p) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] - s * p[1], s * p[0] + c * p[1], p[2]]; };
    const about = (f, k, p) => { const q = f([p[0] - k[0], p[1] - k[1], p[2] - k[2]]); return [q[0] + k[0], q[1] + k[1], q[2] + k[2]]; };
    const pose = (p0) => {
      let p = p0;
      if (!gun) {
        // In the hand at the end of the forearm: the elbow bends it.
        let joint = 0;
        if (w > 0) joint = 0;
        else if (asleep) joint = .1;
        else if (sitting) joint = .75;
        else if (st === 4) joint = .22;
        else if (st === 6) joint = .7 + Math.sin(t * 6 + seed) * .55;
        else if (walking) joint = .34;
        else joint = .16 + Math.sin(t * .7 + seed) * .03;
        p = about((q) => rx(-joint, q), [.55, 1.6, .05], p);
      }
      if (gun && held) {
        // C = rotX(1.1)*rotZ(1.3)*rotX(-1.8) when aimed, rotX(-1.7)*rotZ(-1.2) when carried: the right-hand factor goes on first.
        p = about((q) => (aiming ? rx(1.1, rz(1.3, rx(-1.8, q))) : rx(-1.7, rz(-1.2, q))), [.55, 1.1, .05], p);
        p = about((q) => rx(-(aiming ? 1.1 : .4), q), [.55, 1.6, .05], p);
      } else if (w > 0 && st < 10 && !(st === 3 || (aiming && gun))) {
        const carry = w === 1 ? -.4 : w <= 7 ? -.86 : w === 12 ? -1 : -1.1, across = w <= 7 ? -.26 : -.1;
        p = about((q) => rx(carry, rz(across, q)), [.55, 1.1, .05], p);
      }
      let sway = walking ? swing * (w > 0 ? .16 : .42) : Math.sin(t * 1.1 + seed) * .018;
      if (held) sway *= .15;
      let raise = sitting ? -.55 : asleep ? 0 : (st === 3 || (aiming && gun)) ? -1.5 : st === 6 ? -1.05 + Math.sin(t * 6 + seed) * .5 : w > 0 ? (two ? -.62 : -.3) : -.1;
      let inward = -.08;
      if (held) { raise = aiming ? .3 : 0; inward = aiming ? -1.3 : -.08; }
      p = about((q) => rx(raise + sway, rz(inward, q)), [.54, 2.02, 0], p);
      // A lit torch on a gun: both arms and the gun tip up or down together about the shoulders, the way the beam goes.
      if (aiming && gun) p = about((q) => rx(-(n.pitchA || 0), q), [0, 2.02, 0], p);
      if (!sitting && !asleep) {
        if (walking) p = about((q) => rz(swing * .02, rx(.04, q)), [0, 1.2, 0], p);
        else p = about((q) => rz(Math.sin(t * .27 + seed * 1.3) * .022, q), [0, 1.2, 0], p);
      }
      p[1] += Math.abs(swing) * .05;
      const cy = Math.cos(n.ys), sy = Math.sin(n.ys);
      return [n.x + p[0] * cy + p[2] * sy, n.y + p[1], n.z - p[0] * sy + p[2] * cy];
    };
    const o = pose([.55, ly, lz]);
    if (!gun) return o;
    const a = pose([.55, ly - 1, lz]), dx = a[0] - o[0], dy = a[1] - o[1], dz = a[2] - o[2], m = Math.hypot(dx, dy, dz) || 1;
    o.dir = [dx / m, dy / m, dz / m];
    return o;
  }

  // After dark, anyone out on the street is carrying a torch, and so is everyone on watch, on the wall and at the gates.
  // You can see them coming a long way off, sweeping the road ahead of them, and you know what it means when a beam stops on you.
  flashlights() {
    const g = this.g, P = g.player, r = g.renderer, fx = g.particles, w = g.world;
    const night = r.sky.night;
    if (night < .35) return;
    const near = [];
    for (const n of this.list) {
      const watch = n.kind === 'sentry' || n.kind === 'guard';
      if (!watch && n.kind !== 'roamer' && n.kind !== 'raider' && n.kind !== 'follower' && !(n.kind === 'wanderer' && !n.kid) && !(n.kind === 'resident' && n.carriesTorch && n.state !== 7 && !n.kid)) continue;
      // Hands busy at a stall, at a bench, waving them about in a conversation, or sat down: the torch goes off rather than throwing its
      // beam about the sky with every gesture. It comes back on when they pick up and walk on.
      const st = n.state || 0;
      if (st === 4 || st === 5 || st === 6 || st >= 8) continue;
      const d = Math.hypot(n.x - P.x, n.z - P.z);
      // On the menu the camera is leaving, and the beams have to carry after it. The corner towers come first: they are what you see from out there.
      if (d < (this.showcase ? 900 : 130)) near.push([this.showcase && n.post && n.post.sniper ? d - 2000 : d, n, watch]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const k = (night - .35) / .65, rain = g.weather.rain, cam = r.camPos, most = this.showcase ? 60 : 46;
    for (let i = 0; i < near.length && i < most; i++) {
      const [dist, n, watch] = near[i], d = dist < 0 ? dist + 2000 : dist, raider = n.kind === 'raider', up = n.kind === 'guard' && !n.walking;
      const tower = this.showcase && n.post && n.post.sniper;
      // Pointed straight out from the corner, a tower can be looking at the side of the block next door. It settles on the nearest clear view instead.
      if (tower && !n.towerAimed && w.isLoaded(Math.floor(n.x), Math.floor(n.y), Math.floor(n.z))) {
        n.towerAimed = true;
        let best = 0, far = -1;
        for (let t = 0; t <= 16; t++) {
          const off = (t & 1 ? 1 : -1) * Math.ceil(t / 2) * .2, a = n.post.yaw + off, cp = Math.cos(.11), dx = Math.sin(a) * cp, dy = -Math.sin(.11), dz = Math.cos(a) * cp;
          const hit = w.raycast(n.x + dx * 7, n.y + 2.05 + dy * 7, n.z + dz * 7, dx, dy, dz, 46, false), reach = hit ? hit.dist : 46;
          if (reach > far + 6) { far = reach; best = off; }
        }
        n.baseYaw = n.post.yaw + best;
      }
      const sweep = g.time * (raider ? .9 : .55) + n.phase * .1 + n.tick;
      // On the wall they scan with the gun up and the torch on it: it clears the parapet, and it goes where they are looking.
      if (up && n.aim <= 0 && n.baseYaw !== null) {
        n.yaw = n.baseYaw + Math.sin(sweep) * .4 + Math.sin(sweep * 2.7) * .12;
        n.state = 3;
      }
      // Clipped under the barrel of a long gun, or simply held in the hand.
      const mount = TORCH_MOUNT[n.weaponId] || TORCH_MOUNT[0];
      n.torchAim = true;
      n.torchLit = this.frameN;
      // How far up or down it is pointed. The torch is on the gun, so the shader tips the arms and the gun by the same amount (sent with
      // the rest of the pose in draw()), and the beam comes straight out of the barrel: the gun and its light can never part company.
      let pitch;
      if (raider && n.aggro && n.canSee && !n.busy) pitch = Math.atan2(P.y + 1.4 - (n.y + 2), Math.hypot(P.x - n.x, P.z - n.z) || 1);
      // Up a tower, a steep beam only lights the tower: it looks out over the water, well clear of its own walls. Up on a wall it rakes the
      // ground outside; close to you, it is kept down out of your eyes.
      else pitch = tower ? -.11 + Math.sin(sweep * .8) * .05 : up ? -.36 + Math.sin(sweep * .8) * .08 : d < 9 && !raider ? -.42 : -.13 + Math.sin(sweep * 1.4) * .05;
      if (n.readyT > g.time && n.aimPitch !== undefined) pitch = n.aimPitch;
      this.easePitch(n, pitch, this.frameDt || .016);
      const hp = this.heldPoint(n, mount[0], mount[1]);
      const [ox, oy, oz] = hp;
      let ux, uy, uz;
      if (hp.dir) [ux, uy, uz] = hp.dir;
      else {
        // In a free hand it simply points ahead of them.
        const cp = Math.cos(n.pitchA || 0);
        ux = Math.sin(n.ys) * cp; uy = Math.sin(n.pitchA || 0); uz = Math.cos(n.ys) * cp;
      }
      // From up top the first few voxels are the guard's own parapet, which the beam shines out over.
      const skip = tower ? 7 : up ? 3.4 : .3;
      // Nobody's torch is quite like anyone else's. Batteries, lenses, whatever was going: some barely reach the next stall, some carry across the yard.
      if (n.torchPower === undefined) {
        const q = Math.random();
        n.torchPower = q * q * .45 + q * .55;
      }
      const reachOf = .5 + n.torchPower * 1.05, far = 34 * reachOf;
      const hit = w.raycast(ox + ux * skip, oy + uy * skip, oz + uz * skip, ux, uy, uz, far + 12, false);
      let len = hit ? Math.max(.5, hit.dist + skip) : far + 12;
      // Light stops at the water, and lands on it.
      if (uy < -.01) len = Math.min(len, (WATER_Y - oy) / uy);
      // Patrols carry good clean torches. Raiders have what they could find, on batteries that have seen better days.
      const cool = !raider && n.coolTorch;
      const cr = raider ? 1 : cool ? .84 : .92, cg = raider ? .72 : cool ? .91 : .92, cb = raider ? .44 : cool ? 1 : .86;
      const dying = raider ? .86 + .14 * Math.sin(sweep * 11 + n.tick) * Math.sin(sweep * 4.3) : 1;
      if (r.spotN < 4) r.addSpot(ox, oy, oz, ux, uy, uz, len, 2 * k * dying, cr, cg, cb);
      // The camp's own lights wash a beam out, so the watch's are run brighter.
      const b = ((watch ? .16 : n.kind === 'resident' ? .085 : .06) + rain * .08) * k * dying * (this.showcase ? .6 : 1) * (.45 + n.torchPower * 1.1);
      const shown = Math.min(len + .5, far);
      r.addBeam(ox, oy, oz, ux, uy, uz, shown, shown * .2, cr * b, cg * b, cb * b);
      // Can the water see it? Follow a point on the beam down to where its reflection would show, and see if anything is in the way. A few checks a frame is plenty, and it eases in and out.
      if (cam[1] > WATER_Y) {
        if (n.seaSeen === undefined || (this.frameN + i) % 8 === 0) {
          const t = shown * .35, px = ox + ux * t, py = oy + uy * t, pz = oz + uz * t, h = py - WATER_Y;
          let clear = false;
          if (h > 0) {
            const f = h / (h + cam[1] - WATER_Y), qx = (cam[0] - px) * f, qz = (cam[2] - pz) * f, m = Math.hypot(qx, h, qz) || 1;
            clear = !w.raycast(px, py, pz, qx / m, -h / m, qz / m, Math.min(m, 240), false);
          }
          n.seaClear = clear ? 1 : 0;
          if (n.seaSeen === undefined) n.seaSeen = n.seaClear;
        }
        n.seaSeen += (n.seaClear - n.seaSeen) * Math.min(1, (this.frameDt || .016) * 3);
        if (n.seaSeen > .02 && r.waterBeamN < 16) {
          const s = b * n.seaSeen * 2.5;
          r.addWaterBeam(ox, oy, oz, ux, uy, uz, shown, shown * .2, cr * s, cg * s, cb * s);
        }
      }
      // The lens itself. Dim from the side, blinding when it is pointed straight at you.
      const cx = cam[0] - ox, cy = cam[1] - oy, cz = cam[2] - oz, cl = Math.hypot(cx, cy, cz) || 1;
      const facing = Math.max(0, (ux * cx + uy * cy + uz * cz) / cl);
      const g2 = .9 + facing * facing * facing * 2.6;
      fx.sprite(2, ox, oy, oz, 0, 0, 0, .07 + Math.pow(facing, 6) * .26 + cl * .002, 0, cr * g2, cg * g2, cb * g2, .7, .035);
    }
  }

  // --- Raiders -----------------------------------------------------------------------------------
  // Out here, they are one of the main things that will kill you, and there are more of them every week.
  spawnRaiders() {
    const g = this.g, P = g.player;
    if (this.raiders.length >= 36 || g.horde.inCamp(P.x, P.z, 120)) return;
    for (let t = 0; t < 30; t++) {
      const a = rand() * 6.283, r = 110 + rand() * 90;
      const x = Math.floor(P.x + Math.cos(a) * r), z = Math.floor(P.z + Math.sin(a) * r);
      if (this.addGang(x, z, this.gangSize())) return;
    }
  }

  gangSize() {
    const r = rand();
    const base = r < .08 ? 1 + Math.floor(rand() * 2) : r < .5 ? 3 + Math.floor(rand() * 3) : r < .86 ? 6 + Math.floor(rand() * 4) : 10 + Math.floor(rand() * 5);
    return base + Math.min(6, Math.floor(this.g.day / 5));
  }

  pickCrew() {
    const day = this.g.day, crews = RAIDER_CREWS.filter((k) => !k.day || day >= k.day);
    let r = rand() * crews.reduce((a, k) => a + k.w, 0);
    for (const k of crews) { r -= k.w; if (r <= 0) return k; }
    return crews[0];
  }

  addGang(x, z, size, bounty = 0) {
    const g = this.g, w = g.world;
    if (x < 4 || z < 4 || x >= WX - 4 || z >= WZ - 4) return false;
    const gd = g.layout.ground[z * WX + x];
    if (gd !== G.ROAD && gd !== G.WALK && gd !== G.PLAZA && gd !== G.ALLEY) return false;
    if (!w.walk[(x >> 1) + (z >> 1) * w.walkW] || (!bounty && g.horde.inCamp(x, z, 170))) return false;
    const heading = Math.round(rand() * 4) * Math.PI * .5;
    const crew = this.pickCrew(), tough = 1 + Math.min(.9, g.day * .03);
    // Out on a street full of the dead nobody lasts. A crew holes up indoors, on the ground floor of a building near here, and comes out
    // when there is something worth coming out for. Failing that they are on the street, but never stood inside a wreck or a wall.
    const den = this.hideout(x, z, size);
    const clear = (px, pz) => { const y = w.terrainTop(Math.floor(px), Math.floor(pz)); return !w.solid(Math.floor(px), y, Math.floor(pz)) && !w.solid(Math.floor(px), y + 1, Math.floor(pz)) && !w.solid(Math.floor(px), y + 2, Math.floor(pz)) ? y : null; };
    // About a third have heard you, and are coming to see what you have got.
    const hunting = !bounty && rand() < .35;
    for (let i = 0; i < size; i++) {
      const key = crew.boss && i === 0 && size >= 3 ? 'boss' : crew.roles[i % crew.roles.length];
      const role = RAIDER_ROLES[key];
      let nx = x + .5, nz = z + .5, ny = null;
      if (den) { const c = den.cells[(i * 7 + Math.floor(rand() * 3)) % den.cells.length]; nx = c[0] + .5; nz = c[2] + .5; ny = c[1]; }
      else for (let t = 0; t < 12 && ny === null; t++) { nx = x + .5 + (rand() - .5) * (6 + size); nz = z + .5 + (rand() - .5) * (6 + size); ny = clear(nx, nz); }
      if (ny === null) continue;
      const m = new NPC('raider', nx, ny, nz, { weapon: pickOf(role.weapons), variant: wardrobeRow(['raider']), hp: role.hp * tough * (.9 + rand() * .2), name: pickOf(RAIDER_NAMES), title: role.boss ? 'Raider boss' : 'Raider' });
      m.dx = Math.sin(heading); m.dz = Math.cos(heading);
      m.gang = x * 7 + z;
      m.bounty = bounty;
      m.homeX = den ? den.cx : x; m.homeZ = den ? den.cz : z;
      m.den = den ? den.box : null;
      m.raider = role;
      m.maxHp = m.hp;
      m.flank = (i * 2.4 + rand()) % 6.283;
      m.grenades = role.grenades || 0;
      m.hunting = hunting;
      m.crew = size;
      this.list.push(m);
    }
    return den ? { cx: den.cx, cz: den.cz } : true;
  }

  // A building near (x, z) a crew can hole up in: one still standing, not a camp's, with enough clear floor on its ground floor for them
  // all (room to stand, something underfoot, nothing over their heads for three blocks). The nearest that will do, or nothing.
  hideout(x, z, size) {
    const g = this.g, L = g.layout, W = g.world, seen = new Set();
    let best = null, bd = 1e9;
    for (let dz = -40; dz <= 40; dz += 3) for (let dx = -40; dx <= 40; dx += 3) {
      const px = x + dx, pz = z + dz;
      if (px < 0 || pz < 0 || px >= WX || pz >= WZ) continue;
      const lot = L.lot[pz * WX + px];
      if (!lot || seen.has(lot)) continue;
      seen.add(lot);
      const b = L.buildings[lot - 1];
      if (!b || b.gone || b.x1 - b.x0 < 4 || b.z1 - b.z0 < 4 || g.horde.inCamp((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 30)) continue;
      const d = Math.hypot((b.x0 + b.x1) / 2 - x, (b.z0 + b.z1) / 2 - z);
      if (d >= bd) continue;
      const y = STREET_Y + (b.lift || 0), cells = [];
      if (!W.isLoaded(b.x0, y, b.z0) || !W.isLoaded(b.x1, y, b.z1)) continue;
      for (let cz = b.z0 + 1; cz < b.z1 && cells.length < 40; cz += 2) for (let cx = b.x0 + 1; cx < b.x1 && cells.length < 40; cx += 2) {
        if (L.lot[cz * WX + cx] !== lot) continue;
        if (W.get(cx, y, cz) || W.get(cx, y + 1, cz) || W.get(cx, y + 2, cz) || !W.solid(cx, y - 1, cz)) continue;
        cells.push([cx, y, cz]);
      }
      if (cells.length < Math.max(3, size)) continue;
      bd = d;
      best = { cells, cx: (b.x0 + b.x1 + 1) / 2, cz: (b.z0 + b.z1 + 1) / 2, box: { x0: b.x0 + 1, x1: b.x1, z0: b.z0 + 1, z1: b.z1 } };
    }
    return best;
  }

  updateRaider(n, dt, dp) {
    const g = this.g, w = g.world, P = g.player, H = g.horde, role = n.raider;
    n.cd -= dt; n.moveT -= dt; n.barkT -= dt;
    const reach = role.reach || 62;
    if (dp < Math.max(reach, role.sees) + 4 && P.alive && (n.losT = (n.losT || 0) - dt) <= 0) {
      n.losT = .4 + rand() * .3;
      n.canSee = w.los(n.x, n.y + 2.3, n.z, P.x, P.y + 1.8, P.z);
      if (n.canSee && dp < role.sees * (P.crouch ? .7 : 1) && !n.aggro && !n.calm) this.raiderAlert(n);
    }
    if (n.aggro && (dp > 130 || !P.alive)) n.aggro = false;
    // How close are the dead? Nothing else matters as much, whatever they think of you.
    if ((n.zT = (n.zT || 0) - dt) <= 0) {
      n.zT = .25 + rand() * .2;
      let bd = 24 * 24, bi = -1;
      H.forRadius(n.x, n.z, 24, (i) => {
        const dx = H.px[i] - n.x, dz = H.pz[i] - n.z, d = dx * dx + dz * dz;
        if (d < bd && Math.abs(H.py[i] - n.y) < 4) { bd = d; bi = i; }
      });
      n.zd = 99;
      if (bi >= 0 && w.los(n.x, n.y + 2.3, n.z, H.px[bi], H.py[bi] + 1.7, H.pz[bi])) { n.zd = Math.sqrt(bd); n.zx = H.px[bi]; n.zz = H.pz[bi]; }
    }
    const pressed = n.zd < 9, busy = n.zd < 24;
    n.busy = busy;
    // Some of them only signed up for the easy part.
    if (role.breaks && !n.broken && n.hp < n.maxHp * .4) { n.broken = true; g.ui.floatSay(n, pickOf(RAIDER_BREAK), 2.2); }
    const melee = !n.armed;
    let vx = 0, vz = 0;
    if (n.broken) {
      const ux = (n.x - P.x) / (dp || 1), uz = (n.z - P.z) / (dp || 1);
      vx = ux * role.speed * 1.3; vz = uz * role.speed * 1.3;
      n.yaw = Math.atan2(ux, uz);
    } else if (n.aggro) {
      const ux = (P.x - n.x) / (dp || 1), uz = (P.z - n.z) / (dp || 1);
      const want = melee ? 1.8 : role.hold + (n.tick * 3) % 6;
      // Nobody who has lived this long stands still to be shot. They side-step in short bursts one way and the other, and when they
      // can see you have your sights on them they jink harder.
      const f = P.forward(), sighted = n.canSee && dp < 90 && -(ux * f[0] + uz * f[2]) / (Math.hypot(f[0], f[2]) || 1) > .975;
      if ((n.strafeT = (n.strafeT ?? 0) - dt) <= 0) { n.strafeT = (sighted ? .45 : .8) + rand() * (sighted ? .6 : 1.2); n.strafeDir = rand() < .5 ? -1 : 1; }
      const jink = melee ? 0 : (sighted ? .95 : .55) * role.speed * (n.strafeDir || 1);
      if (busy) {
        // Guns give ground and keep firing. Blades go and deal with it.
        const zx = (n.zx - n.x) / (n.zd || 1), zz = (n.zz - n.z) / (n.zd || 1);
        const go = melee ? (n.zd > 1.8 ? role.speed : 0) : pressed ? -role.speed * .9 : 0;
        vx = zx * go; vz = zz * go;
        if (n.aim <= 0) n.yaw = Math.atan2(zx, zz);
      } else if (dp > want + 2) {
        // In sight they fan out around you. Out of it they know the streets as well as the dead do.
        const route = n.canSee ? null : H.flowAt(n.x, n.z);
        const side = n.canSee && dp > 8 ? Math.sin(n.flank) * .55 : 0;
        const hx = route ? route[0] : ux - uz * side, hz = route ? route[1] : uz + ux * side, m = Math.hypot(hx, hz) || 1;
        vx = hx / m * role.speed * 1.25; vz = hz / m * role.speed * 1.25;
        if (sighted && !route) { vx += -uz * jink * .7; vz += ux * jink * .7; }
      } else if (dp < want - 5 && !melee) { vx = -ux * role.speed * .8 - uz * jink * .6; vz = -uz * role.speed * .8 + ux * jink * .6; }
      else { vx = -uz * jink; vz = ux * jink; }
      if (!busy) n.yaw = Math.atan2(ux, uz);
      if (!busy && n.grenades > 0 && n.canSee && dp > 11 && dp < 34 && (n.nadeT = (n.nadeT ?? 4 + rand() * 6) - dt) <= 0) this.throwGrenade(n, dp);
      if (n.cd <= 0) {
        // You only get their attention when the dead leave them a moment for it. Mostly they don't.
        const dealt = (pressed || (busy && rand() < .5)) && this.selfDefence(n, dp, false);
        if (dealt) n.cd = melee ? .9 + rand() * .5 : n.gun.rate * (n.gun.rate < .4 ? 2.2 + rand() : 1.6 + rand());
        else if (pressed) n.cd = .2;
        else if (melee) {
          n.cd = .9 + rand() * .5;
          if (dp < 2.8) {
            P.damage((14 + rand() * 8) * this.raiderHits(), n.x, n.z, 'shot');
            g.audio.simple('swing', n.x, n.y, n.z);
            n.aim = .4;
          }
        } else if (n.canSee && dp < Math.min(reach, (RAIDER_GUN[n.weaponName] || RAIDER_GUN.pistol).range) && this.clearShot(n, P.x, P.y + 1.6, P.z)) {
          n.cd = n.gun.rate * (n.gun.rate < .4 ? 2.6 + rand() * 1.2 : 1.6 + rand());
          this.raiderShoot(n, dp);
          g.horde.noise(n.x, n.z, 24, .4);
        } else n.cd = .3;
      }
    } else {
      if (n.moveT <= 0) {
        n.moveT = 3 + rand() * 7;
        if (rand() < .3) { const a = Math.round(rand() * 4) * Math.PI * .5; n.dx = Math.sin(a); n.dz = Math.cos(a); }
        // Holed up, they keep to their building and mostly keep still. A bounty's gang keeps to its patch, and nobody here goes near a
        // wall full of rifles.
        const D = n.den;
        if (D && rand() < .6) { n.dx = 0; n.dz = 0; }
        const away = D ? n.x < D.x0 || n.x > D.x1 || n.z < D.z0 || n.z > D.z1 : n.bounty ? Math.hypot(n.x - n.homeX, n.z - n.homeZ) > 26 : H.inCamp(n.x, n.z, 150);
        if (away) { const m = Math.hypot(n.homeX - n.x, n.homeZ - n.z) || 1; n.dx = (n.homeX - n.x) / m; n.dz = (n.homeZ - n.z) / m; }
        else if (n.hunting && !D) { const route = H.flowAt(n.x, n.z); if (route) { n.dx = route[0]; n.dz = route[1]; } }
      }
      const pace = n.den ? .35 : n.hunting ? 1 : .75;
      vx = n.dx * role.speed * pace; vz = n.dz * role.speed * pace;
      if (pressed) {
        const zx = (n.zx - n.x) / (n.zd || 1), zz = (n.zz - n.z) / (n.zd || 1);
        const go = melee ? (n.zd > 1.8 ? role.speed : 0) : -role.speed * .9;
        vx = zx * go; vz = zz * go;
      }
      if (n.barkT <= 0 && dp < 30) { n.barkT = 14 + rand() * 20; g.ui.floatSay(n, pickOf(RAIDER_IDLE)); }
      // They shoot what comes at them, like anyone would.
      if (n.cd <= 0) { n.cd = n.gun && n.gun.rate ? n.gun.rate * (1.4 + rand()) : 1; this.selfDefence(n, dp, false); }
    }
    this.walkStep(n, vx, vz, dt, dp);
    n.state = n.aim > 0 || (n.aggro && !melee && dp < 40) ? 3 : (vx || vz) ? .7 : 0;
    n.aim = Math.max(0, n.aim - dt);
  }

  // Nobody out here is a soldier. They hit softer than they used to, though they do get harder to shrug off as the weeks go on.
  raiderHits() { return .88 * (1 + Math.min(.5, this.g.day * .02)); }

  // One raider round at you. Whether it lands is settled first, by the gun, how far, and what you are doing (running, keeping low),
  // and then the shot is drawn to match: at you if it hit, past you if it did not. A big crew gets in its own way a little.
  raiderShoot(n, dp) {
    const P = this.g.player, gun = RAIDER_GUN[n.weaponName] || RAIDER_GUN.pistol;
    const far = Math.min(1, dp / gun.range);
    const p = gun.acc * (1 - Math.pow(far, 1.5) * .8) * (P.sprinting ? .7 : 1) * (P.crouch ? .8 : 1) * Math.max(.6, Math.min(1, Math.sqrt(4.5 / (n.crew || 1))));
    const hit = rand() < p;
    let tx = P.x, ty = P.y + 1.5, tz = P.z;
    if (!hit) { const a = rand() * 6.283, r = .9 + rand() * 1.8; tx += Math.cos(a) * r; tz += Math.sin(a) * r; ty += (rand() - .3) * 1.6; }
    this.fire(n, tx, ty, tz, n.gun, true);
    if (hit) P.damage(gun.dmg * (gun.fall ? Math.max(.35, 1 - dp / gun.fall) : 1) * this.raiderHits(), n.x, n.z, 'shot');
  }

  // A lob that lands about where you are standing now, not where you are going.
  throwGrenade(n, dp) {
    const g = this.g, P = g.player;
    n.grenades--;
    n.nadeT = 5 + rand() * 6;
    n.aim = .6;
    const T = dp / 15, ax = (P.x - n.x) / T, az = (P.z - n.z) / T;
    P.projectiles.push({ kind: 'grenade', hostile: true, x: n.x + Math.sin(n.yaw) * .8, y: n.y + 2.4, z: n.z + Math.cos(n.yaw) * .8, vx: ax, vy: (P.y + .5 - n.y - 2.4) / T + 11 * T, vz: az, t: 0, fuse: Math.max(1.6, T + .9), radius: 3.2, strength: 9, dmg: 150, sticky: false, stuck: false, beep: 0 });
    g.audio.simple('swing', n.x, n.y, n.z);
    if (rand() < .6) g.ui.floatSay(n, pickOf(['Fire in the hole!', 'Catch!', 'Grenade!']), 1.6);
  }

  raiderAlert(n) {
    const g = this.g;
    n.aggro = true;
    g.ui.floatSay(n, pickOf(n.raider.say), 2.6);
    for (const m of this.raiders) {
      if (m.gang !== n.gang || m.aggro) continue;
      m.aggro = true;
      // A beat to react: nobody has their finger on the trigger the moment someone yells.
      m.cd = Math.max(m.cd, .5 + rand() * 1.1);
    }
    n.cd = Math.max(n.cd, .5 + rand() * .6);
  }

  // The common way anyone on foot gets around the open street.
  walkStep(n, vx, vz, dt, dp) {
    const w = this.g.world;
    if (vx || vz) {
      const nx = n.x + vx * dt, nz = n.z + vz * dt;
      const fy = Math.floor(n.y + .05);
      const cx = Math.floor(nx + Math.sign(vx) * .4), cz = Math.floor(nz + Math.sign(vz) * .4);
      const lot = this.g.layout.lot;
      const indoors = n.dest >= 0 && n.kind === 'wanderer' && cx >= 0 && cz >= 0 && cx < WX && cz < WZ && lot[cz * WX + cx] && !lot[Math.floor(n.z) * WX + Math.floor(n.x)];
      if (indoors || w.solid(cx, fy + 1, cz) || w.solid(cx, fy + 2, cz) || !w.walk[(cx >> 1) + (cz >> 1) * w.walkW]) {
        const a = rand() * 6.283;
        n.dx = Math.sin(a); n.dz = Math.cos(a);
        n.moveT = 1 + rand() * 2;
      } else {
        n.x = nx; n.z = nz;
        if (w.solid(cx, fy, cz)) n.y = fy + 1;
        n.phase += Math.hypot(vx, vz) * dt * 2.1;
        if (n.aim <= 0 && !n.aggro) n.yaw = Math.atan2(vx, vz);
      }
    }
    if (dp < 90) {
      const gy = w.groundBelow(n.x, n.y + .6, n.z, 5);
      n.y += Math.sign(gy - n.y) * Math.min(Math.abs(gy - n.y), dt * 12);
    } else n.y = w.terrainTop(n.x, n.z);
  }

  updateGates(c, st, dt) {
    const g = this.g, P = g.player, W = g.world, H = g.horde;
    const sim = g.campSim, S = sim.state[c.id];
    let openGates = 0;
    for (const gate of st.gates) {
      const d = gate.def;
      // Which way is out, and where the door is: the line between its two rows, and how far along it.
      const ox = d.side === 'W' ? -1 : d.side === 'E' ? 1 : 0, oz = d.side === 'N' ? -1 : d.side === 'S' ? 1 : 0;
      const midX = d.horiz ? 0 : d.x0 + 1, midZ = d.horiz ? d.z0 + 1 : 0;
      const outOf = (x, z) => (d.horiz ? (z - midZ) * oz : (x - midX) * ox);
      const along = (x, z) => (d.horiz ? x : z) - d.tc - .5;
      if (gate.broken) {
        // Hanging off its hinges, or no one left to work it. Chunks regenerate with doors shut, so keep checking.
        if (gate.ruinOpen && gate.open >= 1 && W.get(d.cx, d.y0, d.cz) !== 0) gate.open = 0;
        if (gate.ruinOpen && gate.open < 1) { gate.target = 1; } else { if (gate.ruinOpen) openGates++; continue; }
      } else {
        const dist = Math.hypot(P.x - d.cx, P.z - d.cz);
        const near = dist < 11 && Math.abs(P.y - STREET_Y) < 5;
        // Anyone caught inside gets shown the way out. Nobody gets shown the way in without papers.
        const insideNow = P.x > c.x0 && P.x < c.x1 && P.z > c.z0 && P.z < c.z1;
        // Owe them bail and the gate stays shut to you until it is paid. Someone already inside is still let out.
        const owes = this.owesBail(c.id);
        const lets = insideNow || (this.admitted(c.id) && !owes);
        if (near && !lets && dist < 9 && g.time - (this.gateSaid || -99) > 18) {
          this.gateSaid = g.time;
          const watch = st.npcs.find((n) => n.kind === 'sentry');
          if (owes) {
            g.ui.floatSay(watch, pickOf(['Not you. Not till you pay what you owe.', 'Settle your bail with a patrol, then we talk.', "Gate's shut to you. You know why."]), 3);
            g.ui.toast(`${c.name} will not open to you until your bail is paid: ${this.bailFor(c.id).toLocaleString('en-US')} spades, to one of its patrols.`);
          } else {
            g.ui.floatSay(watch, pickOf(['Citizens only.', "Not without papers. Talk to one of the patrols.", "Gate stays shut. You know the rules.", "You got papers? Then keep walking."]), 3);
            g.ui.toast(`${c.name} only opens to citizens. Its patrols sell papers: ${this.citizenFee(c.id).toLocaleString('en-US')} spades.`);
          }
        }
        if (gate.admitT > 0) gate.admitT -= dt;
        // The dead coming in through it. If it is you they are chasing, the gate waits for you; the moment you are in, it is shut on them.
        // A crowd at the wall either side of it counts as much as one walking straight at it. The watch keeps looking once it is shut,
        // too: nobody opens it again while the dead are still standing outside, only once the ground in front has been clear a while.
        // Shut, it looks a little further out, so the ones milling at the edge do not swing it open and shut again.
        const watching = gate.open > 0 || gate.target > 0 || gate.shutT > 0;
        gate.scanT = (gate.scanT || 0) - dt;
        if (!watching) gate.coming = 0;
        else if (gate.open > 0 || gate.scanT <= 0) {
          gate.scanT = .25;
          const wide = gate.shutT > 0 ? 1.35 : 1;
          let coming = 0;
          H.forRadius(d.cx, d.cz, 20 * wide, (i) => {
            const o = outOf(H.px[i], H.pz[i]), idle = H.state[i] === 0;   // 0: wandering, not after anyone
            if (o > -6 && o < (idle ? 8 : 15) * wide && Math.abs(along(H.px[i], H.pz[i])) < (idle ? 9 : 17) * wide && Math.abs(H.py[i] - STREET_Y) < 3) coming++;
          });
          gate.coming = coming;
        }
        // Once it is shut on them it stays shut until they have been gone a few seconds, rather than swinging open the moment the
        // nearest one steps back.
        if (gate.coming) gate.shutT = 4;
        else if (gate.shutT > 0) gate.shutT -= dt;
        // Locked is locked: it does not open for anyone, you included, until the ground in front has been clear for a while.
        const shut = gate.shutT > 0;
        const sideName = { N: 'North', S: 'South', E: 'East', W: 'West' }[d.side];
        const nearCamp = Math.hypot(P.x - (c.x0 + c.x1) / 2, P.z - (c.z0 + c.z1) / 2) < Math.max(c.x1 - c.x0, c.z1 - c.z0) * .5 + 90;
        if (shut && (gate.open > 0 || dist < 40) && !gate.shutSaid) {
          gate.shutSaid = true;
          if (nearCamp) g.ui.gateNote(`${sideName} gate temporarily locked`, false, gate);
          if (gate.open > 0) {
          const watch = st.npcs.find((n) => n.kind === 'sentry' && !n.dead && Math.hypot(n.x - d.cx, n.z - d.cz) < 20);
          if (watch) this.bark(watch, pickOf(['Shut it! Shut the gate!', 'They are coming through, close it!', 'Gate! Get that gate shut!', 'Close it up, now!']), 60);
          }
        }
        // Walked well away while it was locked: the note goes, and comes back if you return before it opens.
        if (gate.shutSaid && !nearCamp && g.ui.gateNoteOwner === gate) g.ui.clearGateNote(gate);
        else if (gate.shutSaid && nearCamp && dist < 40 && g.ui.gateNoteOwner !== gate && !g.ui.gateNoteOwner) g.ui.gateNote(`${sideName} gate temporarily locked`, false, gate);
        if (!(gate.shutT > 0) && gate.shutSaid) {
          gate.shutSaid = false;
          if (nearCamp && !S.locked) g.ui.gateNote(`${sideName} gate unlocked`, true);
          else g.ui.clearGateNote(gate);
        }
        let want = gate.evac ? 1 : S.locked || shut ? 0 : gate.admitT > 0 ? 1 : near && lets ? 1 : (dist > 15 || !lets ? 0 : gate.target);
        // Shutting is instant. Opening waits until it is wanted for a moment, and never straight after it shut, so it does not crack
        // open a column and slam again every time the reasons flicker.
        if (want === 1 && gate.target !== 1 && !gate.evac) {
          gate.openWant = (gate.openWant || 0) + dt;
          if (gate.openWant < .4 || g.time - (gate.closedAt ?? -99) < 1.2) want = gate.target;
        } else if (want !== 1) gate.openWant = 0;
        if (want === 0 && gate.target === 1) gate.closedAt = g.time;
        gate.target = want;
      }
      if (gate.open > 0) openGates++;
      // Bodies in the doorway hold it up for a moment. Then the crew puts their weight into it and it goes shut anyway.
      if (gate.target === 0 && gate.open > 0) {
        let jam = 0;
        H.forRadius(d.cx, d.cz, 8, (i) => { if (Math.abs(outOf(H.px[i], H.pz[i])) < 1.5 && Math.abs(along(H.px[i], H.pz[i])) < 6) jam++; });
        gate.jamT = jam ? (gate.jamT || 0) + dt : 0;
        if (jam && gate.jamT < 1.2) continue;
      }
      if (gate.open === gate.target) continue;
      const before = gate.open;
      gate.open += Math.sign(gate.target - gate.open) * dt * 3;
      if (gate.target === 1 && gate.open > 1) gate.open = 1;
      if (gate.target === 0 && gate.open < 0) gate.open = 0;
      // The door splits down the middle and slides into the wall, a column at a time.
      const half = 5;
      const wasCols = Math.ceil(before * (half + 1)), cols = Math.ceil(gate.open * (half + 1));
      if (wasCols !== cols) {
        // Anyone standing where the door is about to be gets shoved out of its way, back the side they were on. Nobody ends up inside it,
        // or stood on top of it. With no room to be shoved into, they are crushed.
        if (cols < wasCols) H.forRadius(d.cx, d.cz, 8, (i) => {
          const o = outOf(H.px[i], H.pz[i]), t = Math.floor(along(H.px[i], H.pz[i]) + .5);
          if (Math.abs(o) >= 1.4 || Math.abs(t) > half || Math.abs(t) < cols || Math.abs(H.py[i] - STREET_Y) > 2) return;
          const s = o > -.2 ? 1.75 : -1.75, k = s - o;
          const nx = H.px[i] + (d.horiz ? 0 : ox * k), nz = H.pz[i] + (d.horiz ? oz * k : 0);
          if (W.solid(Math.floor(nx), STREET_Y, Math.floor(nz)) || W.solid(Math.floor(nx), STREET_Y + 1, Math.floor(nz))) H.damage(i, 999, false, H.px[i], STREET_Y + 1, H.pz[i], false);
          else { H.px[i] = nx; H.pz[i] = nz; H.py[i] = STREET_Y; H.vx[i] = 0; H.vz[i] = 0; }
        });
        // The bodies lying in the doorway get dragged clear the same way, back the side they fell on.
        if (cols < wasCols) {
          const cs = H.corpses;
          for (let k = 0; k < H.corpseCount; k++) {
            const o8 = k * 8, cx = cs[o8], cz = cs[o8 + 2];
            if (Math.abs(cx - d.cx) > 8 || Math.abs(cz - d.cz) > 8 || Math.abs(cs[o8 + 1] - STREET_Y) > 2) continue;
            const o = outOf(cx, cz), t = Math.floor(along(cx, cz) + .5);
            if (Math.abs(o) >= 1.6 || Math.abs(t) > half || Math.abs(t) < cols) continue;
            const kk = (o > -.2 ? 2.1 : -2.1) - o;
            if (d.horiz) cs[o8 + 2] += oz * kk; else cs[o8] += ox * kk;
            cs[o8 + 1] = STREET_Y;
          }
        }
        for (let t = -half; t <= half; t++) {
          const openHere = Math.abs(t) < cols;
          for (let row = 0; row < 2; row++) for (let y = d.y0; y <= d.y1; y++) {
            const x = d.horiz ? d.tc + t : d.x0 + row;
            const z = d.horiz ? d.z0 + row : d.tc + t;
            W.set(x, y, z, openHere ? 0 : d.mat, false);
          }
        }
        if (before === 0 || gate.open === 0) g.audio.simple('gate', d.cx, STREET_Y + 2, d.cz);
      }
    }
    S.openGates = openGates;
  }

  // The wall's guns: every quarter second, everyone with a clear shot takes it.
  defendCamp(c, st, step) {
    const g = this.g, H = g.horde, W = g.world;
    const reach = 150;
    const sim = g.campSim, S = sim.state[c.id];
    const threats = this.threats || (this.threats = []);
    const insiders = this.insiders || (this.insiders = []);
    threats.length = 0;
    insiders.length = 0;
    const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
    const hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    const sideHot = st.sideHot || (st.sideHot = { N: { sum: 0, sq: 0, n: 0 }, S: { sum: 0, sq: 0, n: 0 }, E: { sum: 0, sq: 0, n: 0 }, W: { sum: 0, sq: 0, n: 0 } });
    for (const k in sideHot) { sideHot[k].sum = 0; sideHot[k].sq = 0; sideHot[k].n = 0; }
    sim.beginPressureScan(S);
    let atWall = 0;
    H.forRadius(cx, cz, Math.max(hx, hz) + reach * .6, (i) => {
      const ox = Math.abs(H.px[i] - cx) - hx, oz = Math.abs(H.pz[i] - cz) - hz;
      const out = Math.max(ox, oz);
      if (out < 0) insiders.push(i);
      // Idle shamblers are left alone until they wander into the kill zone.
      // One that is off on its own errand, not coming at anybody, is not who anyone is watching in all this.
      if ((out < 34 || (H.state[i] && out < 90)) && !H.lure[i]) threats.push(i);
      if (out >= 0 && out < 45 && H.state[i] && H.siege[i]) atWall++;
      if (out >= 0 && out < 30 && H.state[i]) {
        const q = sideHot[ox > oz ? (H.px[i] < cx ? 'W' : 'E') : (H.pz[i] < cz ? 'N' : 'S')];
        const a = ox > oz ? H.pz[i] : H.px[i];
        q.sum += a; q.sq = (q.sq || 0) + a * a;
        q.n++;
      }
      if (out >= 0 && out < 3.5 && H.state[i] && H.py[i] < STREET_Y + 2) sim.addPressure(c, S, H.px[i], H.pz[i], step);
    });
    S.inside = insiders.length;
    // How much of the camp they have got to: the share of its blocks with a real number of them standing in it.
    if (insiders.length) {
      const blocks = this.floodGrid || (this.floodGrid = new Uint16Array(16));
      blocks.fill(0);
      for (const i of insiders) blocks[Math.min(3, Math.floor((H.px[i] - c.x0) / (c.x1 - c.x0) * 4)) + Math.min(3, Math.floor((H.pz[i] - c.z0) / (c.z1 - c.z0) * 4)) * 4]++;
      let full = 0;
      for (const b of blocks) if (b >= 6) full++;
      S.flood = full / 16;
    } else S.flood = 0;
    // Only the ones actually at the wall keep a battle going. A few stuck in a side street a block away do not.
    S.atWall = atWall;
    // Where the trouble actually is: a sample of intruders, and any breach with bodies at it.
    const hot = st.hot || (st.hot = []);
    hot.length = 0;
    const hotStep = Math.max(1, Math.floor(insiders.length / 8));
    for (let k = 0; k < insiders.length; k += hotStep) hot.push({ x: H.px[insiders[k]], z: H.pz[insiders[k]] });
    for (const b of S.breaches) {
      let near = 0;
      H.forRadius(b.x, b.z, 14, () => { near++; });
      if (near) hot.push({ x: b.x, z: b.z });
    }
    // A crew with guns inside the wall is every bit as much trouble.
    const raiders = this.raidHere || (this.raidHere = []);
    raiders.length = 0;
    if (S.raid) {
      for (const r of this.raiders) {
        if (r.dead || r.raidCamp !== c.id) continue;
        raiders.push(r);
        if (hot.length < 24 && H.campAt(r.x, r.z)) hot.push(r);
      }
      // The wall crews come to meet it too.
      for (const r of raiders) {
        const ox = Math.abs(r.x - cx) - hx, oz = Math.abs(r.z - cz) - hz;
        const q = sideHot[ox > oz ? (r.x < cx ? 'W' : 'E') : (r.z < cz ? 'N' : 'S')];
        const a = ox > oz ? r.z : r.x;
        q.sum += a; q.sq = (q.sq || 0) + a * a;
        q.n++;
      }
    }
    if (S.status === 'overrun' || S.status === 'resettling') return;
    sim.endPressureScan(c, S, step);
    if (threats.length > 3 && !S.drawing) { S.drawing = true; S.quiet = 0; }
    st.repairT = (st.repairT || 0) - step;
    if (st.repairT <= 0) { st.repairT = 1; sim.repairs(c, S, 1); }
    if (threats.length > 25 && (st.alarmT -= step) <= 0) {
      st.alarmT = 25;
      this.bark(st.guards[Math.floor(rand() * st.guards.length)], pickOf(COMMON_BARKS.alarm), 90);
    }
    // Gunfire carries. Sustained shooting slowly pulls in everything nearby.
    if (threats.length > 8 && rand() < .01 && S.real) H.drawToCamp(c, 40, .04);
    // The fall: too few left to hold anything, with the dead already among them.
    // A camp this thin that has the dead inside it is fighting its last fight, whatever evening it was meant to be.
    if (S.real && S.inside > 6 && !S.evac && !S.fatal && S.guards + S.folk < (c.guards.length + c.folk) * .14) sim.lastFight(S);
    if (!threats.length && !raiders.length) { for (const n of st.guards) n.cd = Math.max(0, n.cd - step); return; }
    // The dead inside the wall, crowding the foot of a stretch of walkway. The watch up there moves along, away from them; only a
    // crowd that keeps someone pinned in one place long enough finds the ladder. The gate towers are not reached this way at all:
    // they stand outside the wall, and nobody gets up them but by the stairs from inside.
    if (S.inside > 5) {
      for (const n of st.guards.slice()) {
        if (n.post && n.post.gate) continue;
        let under = 0;
        H.forRadius(n.x, n.z, 3.2, (i) => { if (H.campAt(H.px[i], H.pz[i], -1)) under++; });
        if (under < 5) { n.pinT = Math.max(0, (n.pinT || 0) - step * 2); continue; }
        if (n.beat) {
          // Along the walk, the way away from them.
          const along = n.beat.axis === 'x' ? n.x : n.z;
          let sx = 0;
          H.forRadius(n.x, n.z, 6, (i) => { sx += (n.beat.axis === 'x' ? H.px[i] : H.pz[i]) - along; });
          n.fightTo = Math.max(n.beat.lo, Math.min(n.beat.hi, along - Math.sign(sx || 1) * (10 + rand() * 8)));
          n.reT = 4; n.react = 0; n.fighting = true;
        }
        n.pinT = (n.pinT || 0) + step;
        // How long anyone holds out cornered is their own: some go in seconds, some fight it out for half a minute. Not all at once.
        if (n.pinHold === undefined) { n.pinHold = 6 + rand() * 22; n.pinK = .5 + rand() * 1.2; }
        if (n.pinT > n.pinHold && under >= 8) this.hurt(n, (under - 6) * step * 2 * n.pinK);
      }
    }
    let sounds = 0;
    const dry = S.ammo <= 0;
    for (const n of st.guards) {
      n.cd -= step;
      if (n.cd > 0 || !n.gun || !n.gun.range) continue;
      const gun = n.gun;
      // People with guns shoot back. They come first.
      if (raiders.length && (rand() < .7 || !threats.length)) {
        const r = raiders[Math.floor(rand() * raiders.length)];
        if (!r.dead && (r.x - n.x) ** 2 + (r.z - n.z) ** 2 < Math.min(gun.range * 1.4, WATCH_SIGHT) ** 2 && W.sight(n.x, n.y + 2.3, n.z, r.x, r.y + 1.8, r.z)) {
          if (!this.squareUp(n, r.x, r.z)) { n.cd = .1; continue; }
          n.cd = gun.rate * (1 + rand() * .5);
          S.ammo = Math.max(0, S.ammo - .008);
          this.fire(n, r.x, r.y + 1.8, r.z, gun, sounds < 2 && gun.sound && !!++sounds);
          if (rand() < .24) this.hurt(r, gun.dmg * .3);
          continue;
        }
        if (!threats.length) { n.cd = .2; continue; }
      }
      // A thin line on the wall: everyone leans out and shoots along it, well past their own stretch.
      let best = -1, bd = Math.min(gun.range * 1.8, WATCH_SIGHT) ** 2;
      // Anything inside the wall takes priority over what is still outside it,
      // but a guard with nothing inside in range turns back to the wall.
      for (let k = 0; k < 16; k++) {
        const list = insiders.length && k < 8 ? insiders : threats;
        const i = list[Math.floor(rand() * list.length)];
        const dx = H.px[i] - n.x, dz = H.pz[i] - n.z, d = dx * dx + dz * dz;
        if (d < bd && H.hp[i] > 0) { bd = d; best = i; }
        if (best >= 0 && k >= 7 && insiders.length) break;
      }
      if (best < 0) { n.cd = .1; continue; }
      const tx = H.px[best], ty = H.py[best] + 1.7, tz = H.pz[best];
      // Outward shots start past the parapet, or nobody could hit the foot of their own wall.
      const by = n.baseYaw ?? 0;
      const within = H.campAt(tx, tz);
      // Only what they can see from up there: not through a tree, a house, or the far side of a rise. Looking out from just over the
      // parapet, so the foot of the wall can still be seen.
      const off = within ? 0 : 2.2;
      if (!W.sight(n.x + Math.sin(by) * off, n.y + 2.3, n.z + Math.cos(by) * off, tx, ty, tz)) { n.cd = .2; continue; }
      if (!this.squareUp(n, tx, tz)) { n.cd = .1; continue; }
      n.cd = gun.rate * (.8 + rand() * .4) * (dry ? 3 : 1);
      S.ammo = Math.max(0, S.ammo - .008);
      const playAudio = sounds < 2 && gun.sound;
      if (playAudio) sounds++;
      this.fire(n, tx, ty, tz, gun, playAudio);
      if (rand() < .85 * (1 - sim.desperation(S) * .45)) {
        if (H.damage(best, gun.dmg, false, tx, ty, tz, false)) S.tally++;
        g.particles.blood(tx, ty, tz, 0, .4, 0, 3, 3);
      }
    }
  }

  // Everyone off the wall shoots for themselves, one target at a time.
  selfDefence(n, dp, hostile) {
    const g = this.g, H = g.horde, W = g.world, P = g.player;
    if (hostile && P.alive && dp < 40 && n.armed && this.clearShot(n, P.x, P.y + 1.6, P.z)) {
      if (!this.squareUp(n, P.x, P.z)) { n.cd = Math.min(n.cd, .1); return false; }
      this.fire(n, P.x, P.y + 1.6, P.z, n.gun, true);
      if (rand() < .22) P.damage(7, n.x, n.z, 'shot');
      return true;
    }
    // Raiders would rather shoot a patrol than a corpse, and it is mutual.
    if (n.armed && n.kind === 'raider') {
      let foe = null, fd = Math.min(n.gun.range, 44) ** 2;
      for (const r of this.humans) {
        if (r.dead || (r.kind !== 'roamer' && r.kind !== 'follower' && !(n.raidCamp !== undefined && r.camp === n.raidCamp))) continue;
        const d = (r.x - n.x) ** 2 + (r.z - n.z) ** 2;
        if (d < fd) { fd = d; foe = r; }
      }
      if (foe && this.clearShot(n, foe.x, foe.y + 1.8, foe.z)) {
        if (!this.squareUp(n, foe.x, foe.z)) { n.cd = Math.min(n.cd, .1); return false; }
        this.fire(n, foe.x, foe.y + 1.8, foe.z, n.gun, true);
        if (rand() < .35) this.hurt(foe, n.gun.dmg * (dp > 60 ? .1 : .5));
        return true;
      }
    }
    // Patrols, and anyone travelling with you, have no time for raiders.
    if (n.armed && n.kind !== 'raider' && this.raiders.length) {
      let foe = null, fd = Math.min(n.gun.range, 44) ** 2;
      for (const r of this.raiders) {
        const d = (r.x - n.x) ** 2 + (r.z - n.z) ** 2;
        if (d < fd && !r.dead) { fd = d; foe = r; }
      }
      if (foe && this.clearShot(n, foe.x, foe.y + 1.8, foe.z)) {
        if (!this.squareUp(n, foe.x, foe.z)) { n.cd = Math.min(n.cd, .1); return false; }
        this.fire(n, foe.x, foe.y + 1.8, foe.z, n.gun, true);
        // Most of the shots fired at a crew inside the wall come from people who bake bread for a living.
        if (foe.raidCamp !== undefined) { if (rand() < .2) this.hurt(foe, n.gun.dmg * .3); }
        else if (rand() < .4) this.hurt(foe, n.gun.dmg * (dp > 60 ? .1 : .5));
        return true;
      }
    }
    if (!n.armed) {
      // Bats and blades only work up close.
      if (!n.gun) return false;
      let swung = false;
      H.forRadius(n.x, n.z, 2.6, (i) => {
        if (n.swung) return;
        n.swung = true;
        swung = true;
        H.damage(i, n.evacuee ? 100 : 70, false, H.px[i], H.py[i] + 1.5, H.pz[i], false);
        g.particles.blood(H.px[i], H.py[i] + 1.5, H.pz[i], 0, .4, 0, 5, 3);
        n.yaw = Math.atan2(H.px[i] - n.x, H.pz[i] - n.z);
        n.aim = .4;
        n.swingAt = g.time;
        n.busyT = 3;
      });
      n.swung = false;
      return swung;
    }
    const range = Math.min(n.gun.range, 44);
    let best = -1, bd = range * range;
    H.forRadius(n.x, n.z, range, (i) => {
      const dx = H.px[i] - n.x, dz = H.pz[i] - n.z;
      const d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) return false;
    const hx = H.px[best], hy = H.py[best] + 1.7, hz = H.pz[best];
    if (!this.clearShot(n, hx, hy, hz)) return false;
    if (!this.squareUp(n, hx, hz)) { n.cd = Math.min(n.cd, .1); return false; }
    this.fire(n, hx, hy, hz, n.gun, true);
    // Cooks and carpenters with rifles: enough to slow a breach, not to stop one on their own.
    // Anyone running for their life is past saving anything but themselves, and every one of those shots is meant.
    if (rand() < (n.evacuee ? .6 : n.camp >= 0 && n.kind !== 'follower' ? .45 * (1 - g.campSim.desperation(g.campSim.state[n.camp]) * .5) : .85)) {
      H.damage(best, n.evacuee ? n.gun.dmg * 1.5 : n.gun.dmg, false, hx, hy, hz, false);
      g.particles.blood(hx, hy, hz, 0, .4, 0, 3, 3);
    }
    return true;
  }

  updateNPC(n, dt, dp, hostile) {
    const g = this.g, w = g.world, P = g.player;
    // Thrown by a blast: through the air, down, a moment on the ground, and only then back to whatever they were doing.
    if (n.knock) {
      const k = n.knock;
      k.t += dt;
      if (k.t < 1.4) {
        k.vy -= 22 * dt;
        const nx = n.x + k.vx * dt, nz = n.z + k.vz * dt;
        if (!w.solid(Math.floor(nx), Math.floor(n.y + .6), Math.floor(nz)) && !w.solid(Math.floor(nx), Math.floor(n.y + 1.6), Math.floor(nz))) { n.x = nx; n.z = nz; }
        else { k.vx = 0; k.vz = 0; }
        const gy = w.groundBelow(n.x, n.y + .6, n.z, 6);
        n.y = Math.max(gy, n.y + k.vy * dt);
        if (n.y <= gy) { k.vy = 0; k.vx *= 1 - Math.min(1, dt * 6); k.vz *= 1 - Math.min(1, dt * 6); }
        n.state = 10.3;
        return;
      }
      n.knock = null;
    }
    if (n.kind === 'raider') { if (n.raidCamp !== undefined) this.updateRaidRaider(n, dt, dp); else this.updateRaider(n, dt, dp); return; }
    n.aim = Math.max(0, n.aim - dt);
    const talking = g.ui.dlgNpc === n && g.ui.modal === 'dialog';

    // Ambient chatter when you walk past.
    n.barkT -= dt;
    if (n.barkT <= 0 && dp < 24 && this.barkGlobal <= 0 && !talking && !g.ui.modal && n.state !== 7) {
      // The watch has more to say while there is a fight on.
      const fighting = this.defenderCamp(n) >= 0 && this.g.campSim.state[this.defenderCamp(n)].op;
      n.barkT = fighting ? 7 + rand() * 12 : 12 + rand() * 20;
      if (!n.inConvo) { if (n.kind === 'wanderer') this.bark(n, pickOf(WANDERER_BARKS), 30); else this.ambientBark(n); }
    }

    const seated = n.task && n.task.kind === 'sit' && n.arrived;
    if (talking) {
      // Someone sitting down turns in their seat to talk to you, and remembers which way the seat faces.
      if (seated && n.seatYaw === undefined) n.seatYaw = n.yaw;
      n.yaw = Math.atan2(P.x - n.x, P.z - n.z);
      n.state = seated ? 5 : 4;
      return;
    }
    // Done talking: they settle back round to the way they were sitting, unhurried.
    if (n.seatYaw !== undefined) {
      if (!seated) n.seatYaw = undefined;
      else {
        let d = n.seatYaw - n.yaw;
        while (d > Math.PI) d -= 6.2832;
        while (d < -Math.PI) d += 6.2832;
        if (Math.abs(d) < .01) { n.yaw = n.seatYaw; n.seatYaw = undefined; }
        else n.yaw += Math.sign(d) * Math.min(Math.abs(d), dt * (.8 + Math.abs(d) * 1.2));
      }
    }
    const campS = n.camp >= 0 ? g.campSim.state[n.camp] : null;
    // Is there trouble close to this person? Checked a couple of times a second, not every frame.
    if (campS && n.kind !== 'guard' && n.kind !== 'follower') {
      n.dangerT = (n.dangerT || 0) - dt;
      if (n.dangerT <= 0) {
        n.dangerT = .4 + rand() * .4;
        const hot = this.camps[n.camp].hot;
        n.threat = null;
        if (hot && hot.length) {
          const R = campS.inside >= 40 ? 70 : 38;
          let bd = R * R;
          for (const h of hot) {
            const d = (h.x - n.x) ** 2 + (h.z - n.z) ** 2;
            if (d < bd) { bd = d; n.threat = h; }
          }
        }
      }
    }
    if (n.evacuee || n.kind === 'roamer' || n.kind === 'follower' || n.kind === 'wanderer' || (hostile && n.armed) || (n.threat && n.kind !== 'guard')) {
      n.cd -= dt;
      if (n.cd <= 0) {
        n.cd = n.gun && n.gun.rate ? n.gun.rate * (1 + rand() * .5) * (n.evacuee ? 1.6 : campS && n.kind !== 'follower' ? 2 : 1) : .9;
        this.selfDefence(n, dp, hostile);
      }
    }
    // Out in the streets too: a patrol, someone walking with you, anyone on the road. Caught in a crowd, nobody stands still in it.
    if (!n.flee && !n.beat && ((campS && (n.kind === 'guard' || n.kind === 'sentry' || n.kind === 'vendor' || n.kind === 'clerk' || n.kind === 'named' || n.kind === 'boss' || n.kind === 'resident'))
      || (!campS && (n.kind === 'roamer' || n.kind === 'follower' || n.kind === 'wanderer'))) && this.giveGround(n, dt)) return;
    if (n.kind === 'guard') {
      if (n.beat) { this.walkBeat(n, dt); return; }
      if (n.aim <= 0 && n.baseYaw !== null) n.yaw = this.showcase ? this.lookingAbout(n) : n.baseYaw;
      n.state = n.aim > 0 ? 3 : 0;
      return;
    }
    if (n.kind === 'vendor' || n.kind === 'boss' || n.kind === 'clerk' || n.kind === 'named' || n.kind === 'sentry') {
      if (n.busyT > 0 || n.threat) {
        // There is a fight on. They keep their eyes on it, and only look elsewhere once it has moved on.
      } else if (dp < 8 && !n.inConvo) n.yaw = Math.atan2(P.x - n.x, P.z - n.z);
      else if (n.baseYaw !== null) n.yaw = n.baseYaw;
      n.state = n.aim > 0 ? 3 : 0;
      return;
    }
    if (n.kind === 'resident') { this.updateResident(n, dt, dp); return; }
    if (n.kind === 'follower') { this.updateFollower(n, dt, dp); return; }
    if (n.kind === 'wanderer') { this.updateWanderer(n, dt, dp); return; }
    if (n.squad) this.updatePatrol(n, dt, dp);
  }

  // Nobody stands still while the dead close in round them. They back off, still firing, keeping the crowd in front of them;
  // once it is all round them, or they are badly hurt, they turn and run for it. When it has thinned out they go back to where they were.
  giveGround(n, dt) {
    const g = this.g, H = g.horde, w = g.world;
    // Up on a wall walk or a tower they hold where they are; on the ground, wherever that is, they move.
    if (!n.giving && n.y > w.terrainTop(Math.floor(n.x), Math.floor(n.z)) + 1.5) return false;
    const loose = n.kind === 'resident' || n.kind === 'roamer' || n.kind === 'follower' || n.kind === 'wanderer';
    if ((n.swarmT = (n.swarmT || 0) - dt) <= 0) {
      n.swarmT = .15 + rand() * .1;
      let k = 0, close = 0, sx = 0, sz = 0, ring = 0;
      H.forRadius(n.x, n.z, 3.6, (i) => {
        const dx = H.px[i] - n.x, dz = H.pz[i] - n.z, d2 = dx * dx + dz * dz;
        if (d2 > 12.9 || Math.abs(H.py[i] - n.y) > 1.6) return;
        const d = Math.sqrt(d2) + .05;
        k++; sx += dx / d; sz += dz / d;
        if (d2 < 2.6) close++;
        ring |= 1 << (Math.floor((Math.atan2(dz, dx) + Math.PI) / (Math.PI / 4)) & 7);
      });
      n.swarmN = k; n.swarmX = sx; n.swarmZ = sz;
      // How much of the way round them the crowd has got, in eighths.
      let r = 0;
      for (let b = 0; b < 8; b++) if (ring & (1 << b)) r++;
      n.swarmRing = r;
      // Three on you, or two right up close: time to move.
      if (k >= 3 || close >= 2 || (close && n.hp < n.maxHp * .5)) {
        if (!n.giving) {
          n.giving = true;
          if (!loose) { n.homeX = n.x; n.homeZ = n.z; n.homeYaw = n.baseYaw; }
          this.bark(n, pickOf(['Falling back!', 'Too many, too many!', 'Get back, get back!', 'I need help here!', 'Back up, back up!', "They're all over me!"]), 40);
        }
        n.clearT = 0;
      }
    }
    if (!n.giving) return false;
    const k = n.swarmN;
    if (!k) {
      n.clearT = (n.clearT || 0) + dt;
      if (n.clearT < 2.5) { n.state = n.aim > 0 ? 3 : 0; return true; }
      // Clear. Back to it.
      if (n.homeX === undefined || loose) {
        n.giving = false;
        if (!loose || n.kind === 'resident') n.homeX = undefined;
        if (n.kind === 'resident') { n.path = null; n.pathI = 0; n.arrived = false; }
        return false;
      }
      const dx = n.homeX - n.x, dz = n.homeZ - n.z, d = Math.hypot(dx, dz);
      if (d < .3) {
        n.x = n.homeX; n.z = n.homeZ; n.giving = false; n.homeX = undefined;
        if (n.homeYaw !== undefined && n.homeYaw !== null) n.yaw = n.homeYaw;
        return false;
      }
      const sp = Math.min(d / dt, 2.2);
      if (!this.stepTo(n, dx / d * sp * dt, dz / d * sp * dt, w)) { n.x = n.homeX; n.z = n.homeZ; }
      if (n.aim <= 0) n.yaw = Math.atan2(dx, dz);
      n.phase += sp * dt * 2.1;
      n.state = n.aim > 0 ? 3 : .7;
      return true;
    }
    // Away from the weight of them. When they are everywhere, any gap will do, and the camp is behind you.
    const c = g.layout.camps[n.camp];
    let ax = -n.swarmX, az = -n.swarmZ;
    const am = Math.hypot(ax, az);
    const tx = (c.x0 + c.x1) / 2 - n.x, tz = (c.z0 + c.z1) / 2 - n.z, tm = Math.hypot(tx, tz) || 1;
    if (am < .8) { ax = tx / tm; az = tz / tm; } else { ax = ax / am + tx / tm * .35; az = az / am + tz / tm * .35; }
    const m = Math.hypot(ax, az) || 1;
    ax /= m; az /= m;
    const bolt = n.swarmRing >= 5 || n.hp < n.maxHp * .4 || !n.gun || !n.gun.range;
    const sp = (bolt ? 4.4 : 2.4) * (n.kid ? .9 : 1);
    let moved = false;
    for (const turn of [0, .55, -.55, 1.1, -1.1, 1.7, -1.7]) {
      const cs = Math.cos(turn), sn = Math.sin(turn), ux = ax * cs - az * sn, uz = ax * sn + az * cs;
      if (this.stepTo(n, ux * sp * dt, uz * sp * dt, w)) { moved = true; if (bolt || n.aim <= 0) n.yaw = bolt ? Math.atan2(ux, uz) : Math.atan2(-ux, -uz); break; }
    }
    if (bolt) n.aim = 0;
    n.phase += (moved ? sp : 0) * dt * 2.1;
    n.state = !moved ? (n.aim > 0 ? 3 : 0) : n.aim > 0 && !bolt ? 3 : .7;
    return true;
  }

  // A step, if there is floor to take it on and nothing in the way.
  stepTo(n, dx, dz, w) {
    const x = n.x + dx, z = n.z + dz, c = n.camp >= 0 ? this.g.layout.camps[n.camp] : null;
    const lx = x + Math.sign(dx) * .3, lz = z + Math.sign(dz) * .3, fy = Math.floor(n.y + .5);
    if (w.solid(Math.floor(lx), fy, Math.floor(lz)) || w.solid(Math.floor(lx), fy + 1, Math.floor(lz))) return false;
    if (c && c.nav) {
      const cx = (Math.floor(x) - c.x0) >> 1, cz = (Math.floor(z) - c.z0) >> 1;
      if (cx >= 0 && cz >= 0 && cx < c.navW && cz < c.navD && c.nav[cx + cz * c.navW] && !c.nav[((Math.floor(n.x) - c.x0) >> 1) + ((Math.floor(n.z) - c.z0) >> 1) * c.navW]) return false;
    }
    n.x = x; n.z = z;
    return true;
  }

  // Someone standing a watch looks slowly from one side to the other, each in their own time.
  lookingAbout(n) {
    const own = (n.post ? n.post.x * 1.3 + n.post.z * 2.1 : n.x) + (n.spot || 0), t = this.g.time * (.3 + (Math.abs(own) % 1) * .14) + own;
    return n.baseYaw + Math.sin(t) * .62 + Math.sin(t * .37 + 1) * .12;
  }

  // Up and down their own side of the wall, stopping to look out now and then. When something is at the wall they go to
  // it at a run, so the guns on a stretch thicken up where the trouble is, and you can watch it happen from below.
  walkBeat(n, dt) {
    const g = this.g, w = g.world, b = n.beat, st = this.camps[n.camp];
    if (this.showcase && n.holdPost) {
      n.walking = false;
      if (n.aim <= 0 && n.baseYaw !== null) n.yaw = this.lookingAbout(n);
      n.state = n.aim > 0 ? 3 : 0;
      return;
    }
    // Each their own pace, picked once: nobody on a wall moves like the one next to them.
    if (n.pace === undefined) { n.pace = .85 + rand() * .35; n.run = 3.3 + rand() * 1.3; n.v = 0; n.react = 0; }
    const along = b.axis === 'x' ? n.x : n.z;
    // Each guard has a beat of their own, but the ones walking the same side of the wall share the walkway.
    const sameSide = (m) => m.beat && m.beat.side === b.side && m.beat.axis === b.axis && Math.abs(m.y - n.y) < 3;
    const hot = st.sideHot && st.sideHot[b.side];
    const fight = !!hot && hot.n >= 3;
    let to = null, speed = 2 * n.pace;
    if (fight) {
      if (!n.fighting) { n.fighting = true; n.react = .25 + rand() * 1.3; n.fightTo = null; n.reT = 0; }
      // A moment to take in what is happening before anyone moves, and then not all at once.
      if (n.react > 0) n.react -= dt;
      else {
        n.reT -= dt;
        if (n.fightTo === null || n.reT <= 0) {
          // Spread along the trouble, one to every few blocks, in the order they already stand: nobody runs past anyone else.
          const mates = st.guards.filter((m) => sameSide(m) && !m.dead && m.fighting);
          mates.sort((p, q) => (b.axis === 'x' ? p.x - q.x : p.z - q.z));
          // The dead pile up at the gate, but a wall is held along its length: they spread over as much of it as the trouble covers,
          // and never less than a good stretch either side, so the walkway over the gate does not turn into a crowd.
          const rank = Math.max(0, mates.indexOf(n)), count = mates.length || 1;
          const centre = hot.sum / hot.n, sd = Math.sqrt(Math.max(0, (hot.sq || 0) / hot.n - centre * centre));
          const span = Math.min(b.hi - b.lo, Math.max(40, sd * 2.6, (count - 1) * 7));
          let from = centre - span / 2;
          from = Math.max(b.lo, Math.min(b.hi - span, from));
          const jitter = (rand() - .5) * Math.min(3, span / count * .5);
          n.fightTo = Math.max(b.lo, Math.min(b.hi, from + (count === 1 ? .5 : rank / (count - 1)) * span + jitter));
          // They look again every so often, each on their own clock, and shift a step or two for a better shot.
          n.reT = 1.6 + rand() * 2.8;
        }
        to = n.fightTo;
        speed = n.run;
      }
      n.pauseT = 1 + rand() * 2;
      n.beatTo = null;
    } else {
      n.fighting = false;
      const pos = (m) => (b.axis === 'x' ? m.x : m.z);
      let mates = null;
      // Nobody walks up somebody's back: with one of the others just ahead on the walkway, they stop a while, then go somewhere else.
      if (n.beatTo !== null && n.beatTo !== undefined && n.v > .2) {
        mates = st.guards.filter((m) => m !== n && sameSide(m) && !m.dead);
        const dir = Math.sign(n.beatTo - along);
        if (mates.some((m) => { const d = (pos(m) - along) * dir; return d > 0 && d < 3.5; })) { n.beatTo = null; n.pauseT = 1.5 + rand() * 3; n.v = 0; }
      }
      if (n.pauseT > 0) n.pauseT -= dt;
      else {
        if (n.beatTo === null || n.beatTo === undefined) {
          // Somewhere along their side of the wall that nobody else is standing at or making for: the watch spreads itself out.
          mates = mates || st.guards.filter((m) => m !== n && sameSide(m) && !m.dead);
          let pick = along, score = -1;
          for (let k = 0; k < 8; k++) {
            const c2 = k < 4 ? along + (rand() < .5 ? -1 : 1) * (8 + rand() * 40) : b.lo + rand() * (b.hi - b.lo);
            const cand = Math.max(b.lo, Math.min(b.hi, c2));
            let m2 = 1e9;
            for (const m of mates) {
              m2 = Math.min(m2, Math.abs(cand - pos(m)));
              if (m.beatTo !== null && m.beatTo !== undefined && !m.fighting) m2 = Math.min(m2, Math.abs(cand - m.beatTo));
            }
            if (m2 > score) { score = m2; pick = cand; }
          }
          n.beatTo = pick;
        }
        to = n.beatTo;
      }
    }
    n.walking = false;
    // Speeds up and slows down, rather than going from standing to running and back in a single step.
    const left = to === null ? 0 : to - along, want = to === null ? 0 : Math.min(speed, Math.abs(left) * 1.8);
    n.v += (want - n.v) * Math.min(1, dt * (want > n.v ? 3.2 : 5));
    if (to !== null && Math.abs(left) > .15 && n.v > .05) {
      const dir = Math.sign(left), next = along + dir * Math.min(Math.abs(left), n.v * dt);
      const fx = b.axis === 'x' ? next : n.x, fz = b.axis === 'x' ? n.z : next;
      // Someone has knocked a hole in the walkway: go back the other way.
      if (w.isLoaded(Math.floor(fx), Math.floor(n.y) - 1, Math.floor(fz)) && !w.solid(Math.floor(fx), Math.floor(n.y) - 1, Math.floor(fz))) {
        n.beatTo = null; n.fightTo = null; n.pauseT = 2; n.v = 0;
      } else {
        if (b.axis === 'x') n.x = fx; else n.z = fz;
        n.phase += n.v * dt * 2.1;
        n.walking = n.v > .3;
        if (n.aim <= 0) this.turnTo(n, b.axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI), dt);
      }
    } else if (to !== null && !fight) { n.beatTo = null; n.pauseT = this.showcase ? .5 + rand() * 1.5 : 2 + rand() * 9; }
    // Stood still: looking out over the wall, slowly, not snapped to it.
    if (!n.walking && n.aim <= 0 && n.baseYaw !== null) this.turnTo(n, fight ? n.baseYaw : this.lookingAbout(n), dt);
    n.state = n.aim > 0 ? 3 : n.walking ? .7 : 0;
  }

  // Turns a head and shoulders round at a person's speed, the short way.
  turnTo(n, yaw, dt) {
    let d = yaw - n.yaw;
    while (d > Math.PI) d -= 6.2832;
    while (d < -Math.PI) d += 6.2832;
    n.yaw += Math.sign(d) * Math.min(Math.abs(d), dt * (2.6 + Math.abs(d) * 3));
  }

  // Facing it yet? Nobody shoots over their shoulder. Not yet: they turn into it, quickly but at a person's speed, and the shot waits until
  // they are on it. Swinging the whole body round in one frame for every shot is what made a crowd on the move look like it was twitching.
  squareUp(n, x, z) {
    const want = Math.atan2(x - n.x, z - n.z);
    let d = want - n.ys;
    while (d > Math.PI) d -= 6.2832;
    while (d < -Math.PI) d += 6.2832;
    n.faceYaw = want; n.faceT = this.g.time + .7;
    if (Math.abs(d) < .3) return true;
    n.aim = Math.max(n.aim || 0, .9);
    return false;
  }

  // Is there a clean line from the end of this person's gun to the target, right now? Glass doesn't count: a round goes through it.
  clearShot(n, x, y, z) {
    const W = this.g.world, a = Math.atan2(x - n.x, z - n.z);
    const mx = n.x + Math.sin(a) * 1.5, my = n.y + 2.05, mz = n.z + Math.cos(a) * 1.5;
    // A muzzle poked through a wall isn't a shot.
    if (W.solid(Math.floor(mx), Math.floor(my), Math.floor(mz)) || !W.los(n.x, my, n.z, mx, my, mz)) return false;
    const dx = x - mx, dy = y - my, dz = z - mz, d = Math.hypot(dx, dy, dz);
    if (d < .5) return true;
    const hit = W.raycast(mx, my, mz, dx / d, dy / d, dz / d, d, true);
    return !hit || hit.dist >= d - .3;
  }

  fire(n, x, y, z, gun, audio) {
    const g = this.g;
    const dist = Math.hypot(n.x - g.player.x, n.z - g.player.z);
    n.yaw = Math.atan2(x - n.x, z - n.z);
    // Squared up to what they are shooting at, the gun on it: the body is drawn facing the shot, not still turning towards it. Everyone
    // shooting has already turned to within a few degrees of it (squareUp), so this is the last little correction, not a swing.
    n.ys = n.yaw;
    n.faceYaw = n.yaw; n.faceT = g.time + .7;
    n.aimPitch = Math.max(-.8, Math.min(.4, Math.atan2(y - (n.y + 2.02), Math.hypot(x - n.x, z - n.z) || 1)));
    this.easePitch(n, n.aimPitch, 1);
    n.aim = .9;
    n.busyT = 3;
    const mx = n.x + Math.sin(n.yaw) * 1.5, my = n.y + 2.05, mz = n.z + Math.cos(n.yaw) * 1.5;
    if (dist > 240) return;
    // Whatever it was aimed at, a round stops at the first wall. The watch on the wall is the exception:
    // they lean out over a parapet the line from here would clip.
    let struck = null;
    if (n.kind !== 'guard') {
      const dx = x - mx, dy = y - my, dz = z - mz, d = Math.hypot(dx, dy, dz) || 1;
      const hit = g.world.raycast(mx, my, mz, dx / d, dy / d, dz / d, d, true);
      if (hit && hit.dist < d - .3) { x = mx + dx / d * hit.dist; y = my + dy / d * hit.dist; z = mz + dz / d * hit.dist; struck = hit; }
    }
    if (gun.sound && dist < 160) this.roundLands(n, mx, my, mz, x, y, z, struck);
    if (gun.sound) {
      // Out of the end of the barrel as it is drawn this frame, and the gun kept up for a few seconds after.
      const M = MUZZLE[n.weaponId];
      let fx = mx, fy = my, fz = mz;
      if (M) { const h = this.heldPoint(n, M[0], M[1], true, true), d = h.dir || [0, 0, 0]; fx = h[0] + d[0] * .08; fy = h[1] + d[1] * .08; fz = h[2] + d[2] * .08; }
      n.readyT = g.time + 2.5 + rand() * 1.5;
      n.shotAt = g.time;
      g.particles.tracer(fx, fy, fz, x, y, z, 260);
      g.particles.sprite(1, fx, fy, fz, 0, 0, 0, n.weaponId === 3 || n.weaponId === 6 ? .32 : .22, 1.5, 7, 4.2, 1.6, 1, .05);
      if (audio) g.audio.gun(gun.sound, n.x, n.y, n.z, true);
    } else {
      n.swingAt = g.time;
      g.particles.tracer(mx, my, mz, x, y, z, 110);
      if (audio !== false && dist < 30) g.audio.simple('swing', n.x, n.y, n.z);
    }
  }

  // Where a round goes after it leaves the gun: into the wall that stopped it, or, missing now and then, on into whatever is behind what
  // it was aimed at. It chips at what it hits like yours would: windows, buildings, cars, the road. Never a camp's own wall or gate, and
  // nothing inside a camp: they are not going to shoot their own place apart.
  roundLands(n, mx, my, mz, x, y, z, struck) {
    const g = this.g, W = g.world, dx = x - mx, dy = y - my, dz = z - mz, d = Math.hypot(dx, dy, dz) || 1, ux = dx / d, uy = dy / d, uz = dz / d;
    // Glass on the way breaks, about half the time.
    const pane = W.raycast(mx, my, mz, ux, uy, uz, d + .3, false);
    if (pane && pane.dist < d + .2 && isGlassId(pane.id) && rand() < .5 && !g.horde.inCamp(pane.x + .5, pane.z + .5, 4)) g.breakGlass(pane.x, pane.y, pane.z);
    let hit = struck;
    if (!hit && rand() < .28) hit = W.raycast(x, y, z, ux + (rand() - .5) * .06, uy + (rand() - .5) * .06, uz + (rand() - .5) * .06, 30, true);
    if (!hit || g.horde.inCamp(hit.x + .5, hit.z + .5, 4)) return;
    // A rifle round chews a real piece out of brick and plaster, not a scratch.
    const broke = W.hit(hit.x, hit.y, hit.z, 3);
    if (Math.hypot(hit.x - g.player.x, hit.z - g.player.z) < 70) g.particles.debris(hit.x, hit.y, hit.z, hit.id, broke ? 5 : 2, 2);
    if (broke) g.horde.nearDirty = true;
  }

  // People out on the streets know how to keep a bite from landing properly. And a crew you haven't met yet is still
  // there when you arrive: the dead can wear them down, but they don't get to finish them before you get there.
  bitten(n) {
    if (n.raider) {
      if (!n.aggro && n.hp < n.maxHp * .5) return;
      this.hurt(n, 1.5);
    } else if (n.evacuee) this.hurt(n, 35);
    else if (n.camp >= 0) {
      // Early on someone gets to you. By the end of a last stand nobody is coming.
      const d = this.g.campSim.desperation(this.g.campSim.state[n.camp]);
      this.hurt(n, 6 * (1 + d * 3));
    } else this.hurt(n, n.kind === 'roamer' || n.kind === 'follower' ? 3 : 6);
  }

  hurt(n, amount) {
    if (n.dead) return;
    n.hp -= amount;
    if (n.hp <= 0) this.kill(n);
  }

  kill(n, byPlayer = false) {
    if (n.kind === 'wanderer' && n.fromCamp >= 0 && n.dest >= 0) this.g.director.diedOnRoad(n.fromCamp, n.dest);
    const g = this.g;
    n.dead = true;
    if (n.kind === 'raider') {
      if (n.raidCamp !== undefined && g.campSim.state[n.raidCamp].rec) g.campSim.state[n.raidCamp].rec.raiders++;
      g.jobs.onRaiderKilled(n);
      const boss = n.raider && n.raider.boss, gear = RAIDER_LOOT[n.weaponName] || [null, null];
      if (rand() < .75 || boss) g.addPickup(n.x, n.y + .4, n.z, { scrip: (boss ? 60 : 8) + Math.floor(rand() * (boss ? 120 : 34)) });
      if (rand() < .4) g.addPickup(n.x - .5, n.y + .4, n.z, { id: pickOf(['bandage', 'beans', 'smokes', 'water', 'scrap', 'parts', 'antibiotic']), count: 1 });
      if (gear[0] && rand() < .6) g.addPickup(n.x + .5, n.y + .4, n.z - .5, { id: gear[0], count: (gear[0] === 'ammo_shell' ? 3 : 8) + Math.floor(rand() * (gear[0] === 'ammo_shell' ? 7 : 22)) });
      if (gear[1] && (boss || rand() < (gear[1] === 'lmg' ? .06 : .1))) g.addPickup(n.x, n.y + .4, n.z + .5, { id: gear[1], count: 1 });
      if (n.grenades > 0 && rand() < .7) g.addPickup(n.x - .5, n.y + .4, n.z + .5, { id: 'grenade', count: n.grenades });
      if (boss) g.addPickup(n.x + .5, n.y + .4, n.z + .5, { id: pickOf(['riot', 'jacket', 'medkit', 'stim']), count: 1 });
    }
    g.horde.addBody(n.x, n.y, n.z, n.yaw, n.variant, !!n.headless, 0, n.kid);
    if (n.task && n.task.poi && n.task.poi.by === n) n.task.poi.by = null;
    const fi = this.followers.indexOf(n);
    if (fi >= 0) { this.followers.splice(fi, 1); g.ui.toast(`${n.name} is dead.`, 'bad'); }
    // The bitten get back up. In a camp under attack, this is how it comes apart.
    if (n.kind !== 'vendor' && !byPlayer && !n.kid && rand() < .65) {
      const i = g.horde.spawnOne(n.x, Math.max(n.y, STREET_Y), n.z, 1);
      if (i >= 0) { g.horde.variant[i] = Math.floor(rand() * 192); if (n.camp >= 0) g.horde.siege[i] = n.camp + 1; }
    }
    if (n.kind !== 'raider' && (n.camp < 0 || rand() < .2)) g.addPickup(n.x, n.y + .4, n.z, { scrip: 6 + Math.floor(rand() * 30) });
    if (n.kind !== 'raider' && n.armed && rand() < .25) g.addPickup(n.x + .5, n.y + .4, n.z, { id: n.gun && n.gun.sound === 'rifle' ? 'ammo_rifle' : 'ammo_pistol', count: 8 + Math.floor(rand() * 18) });
    if (n.camp >= 0) {
      const s = this.camps[n.camp];
      const S = g.campSim.state[n.camp];
      s.npcs = s.npcs.filter((m) => m !== n);
      s.guards = s.guards.filter((m) => m !== n);
      if (n.kind === 'guard') {
        S.guards = Math.max(0, S.guards - 1);
        if (S.op) {
          if (S.op.gw !== undefined) S.op.gw = Math.max(S.guards, S.op.gw - 1);
          // Named when there is a moment to name them; otherwise they go into the next count of the fallen. Never once it is being abandoned.
          const gsec = g.campSim.now() * 1500;
          if (!S.evac && !(S.collapseT > 0) && gsec - (S.op.lossSaid ?? -1e9) > 25) {
            S.op.lossSaid = gsec;
            g.campSim.radio(g.layout.camps[n.camp], pickOf([`${n.name} is down. Somebody take that post.`, `We lost ${n.name}. Close up the gap.`, `${n.name} is gone. Keep shooting.`]));
          } else S.op.lossPend = (S.op.lossPend || 0) + 1;
        }
      }
      else if (n.kind === 'resident') S.folk = Math.max(0, S.folk - 1);
      if (n.part) {
        g.campSim.dead[n.part.id] = true;
        g.ui.toast(`${n.name} is dead.`, 'bad');
      }
      if (g.ui.dlgNpc === n && g.ui.modal === 'dialog') g.resume();
    }
  }

  // Everyone left in a fallen camp is dead or turned, and the gates hang open.
  campFell(c, refuge = null) {
    const st = this.camps[c.id];
    // Their patrols have nowhere to report back to. They are just people now.
    for (const n of this.list) {
      if (n.kind !== 'roamer' || n.factionId !== c.id + 1) continue;
      n.kind = 'wanderer';
      n.factionId = 0;
      n.title = `From ${c.name}`;
      n.dest = refuge ? refuge.id : -1;
      n.squad = null;
      n.fromCamp = c.id;
    }
    if (!st.active) return;
    // Whoever is still inside keeps running. The watch stays at their posts until nobody is looking.
    const exits = c.gates.map((q) => {
      const ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
      return { ix: q.cx - ox * 12, iz: q.cz - oz * 12, ox: q.cx + ox * 18, oz: q.cz + oz * 18, to: refuge ? refuge.id : -1, from: c };
    });
    for (const n of st.npcs.slice()) {
      if (n.dead) continue;
      if (n.kind === 'guard' || n.kind === 'sentry') { n.leaving = true; n.aim = 0; continue; }
      if (!n.flee && exits.length) this.startFleeing(n, c, exits);
    }
    st.guards = [];
    for (const gate of st.gates) { gate.broken = true; gate.ruinOpen = true; }
  }

  // The watch of a camp that has fallen. They were never going to get down from there. Gone the next time you look away.
  offCamera(n, dp) {
    if (dp > 150) return true;
    const r = this.g.renderer, cam = r.camPos, f = r.camForward;
    const dx = n.x - cam[0], dy = n.y + 2 - cam[1], dz = n.z - cam[2], d = Math.hypot(dx, dy, dz) || 1;
    if ((dx * f[0] + dy * f[1] + dz * f[2]) / d < .35) return true;
    return !this.g.world.los(cam[0], cam[1], cam[2], n.x, n.y + 2, n.z);
  }

  // Does this camp want you dead? A grudge is local, but a bad enough name follows you everywhere.
  // Shooting on sight. Something done outside their wall gets the gate shut on you, but nobody opens fire over it.
  hostileCamp(id) {
    const P = this.g.player, b = P.bail && P.bail[id];
    if (b === 'out') return false;
    return b === 'in' || P.rep <= -30 || this.g.dialogue.standing(id) < -30;
  }

  // Do you owe them? Then the gate is shut to you until it is paid, whether or not they are shooting.
  owesBail(id) {
    const P = this.g.player;
    return !!(P.bail && P.bail[id]) || P.rep <= -30 || this.g.dialogue.standing(id) < -30;
  }

  // --- Citizenship: the strong camps only let in people who have paid. -----------------------------------
  citizenFee(id) { return CITIZENSHIP[this.g.layout.camps[id].key] || 0; }

  // Is the gate open to you? A camp you started in is always home, and a fallen one has nobody left to check.
  admitted(id) {
    const g = this.g, P = g.player;
    return !this.citizenFee(id) || P.home === id || P.count(papersFor(g.layout.camps[id].key)) > 0 || g.campSim.state[id].status !== 'holding';
  }

  buyCitizenship(id) {
    const g = this.g, P = g.player, c = g.layout.camps[id];
    P.scrip -= this.citizenFee(id);
    P.gain(papersFor(c.key), 1);
    P.discovered[id] = true;
    g.audio.simple('coin');
    g.ui.banner(`${c.name}: Citizen`, `Your papers are in your pack. The gate opens for you now, until the day you die.`);
    g.saveGame();
  }

  // Inside the wall without papers. There is a moment to turn around; after that it costs you, and they open fire.
  // When the dead are coming through, nobody has time to check who you are.
  watchTrespass(within, dt) {
    const g = this.g, P = g.player;
    const id = within && P.alive && !this.admitted(within.id) ? within.id : -1;
    if (id < 0) {
      this.trespassT = 0; this.trespassCamp = -1;
      if (this.trespassing !== undefined && this.trespassing >= 0) g.ui.toast('You got out. They will remember it.', 'bad');
      this.trespassing = -1;
      return;
    }
    const S = g.campSim.state[id];
    if (S.inside > 5 || S.pool > 0 || S.breaches.length) { this.trespassing = -1; this.trespassT = 0; return; }
    if (this.trespassCamp !== id) {
      this.trespassCamp = id;
      this.trespassT = 0;
      g.ui.banner('Citizens only', `You have no papers for ${within.name}. Get out, before someone with a rifle notices.`);
    }
    this.trespassT += dt;
    if (this.trespassT > 7 && this.trespassing !== id) {
      this.trespassing = id;
      P.rep -= 4;
      g.dialogue.addStanding(id, -20);
      g.ui.banner('Trespasser', `${within.name} is shooting at you. Word of this will get around.`);
      g.saveGame();
    }
  }

  // Taking the wall apart is a good way to get noticed. Only a camp that would have kept you out takes it personally.
  wallDamaged(x, z, weight = 1) {
    const g = this.g, c = g.horde.inCamp(x, z, 2);
    if (!c || this.admitted(c.id) || Math.max(c.x0 - x, x - c.x1, c.z0 - z, z - c.z1) < -4) return;
    const S = g.campSim.state[c.id];
    if (S.pool > 0 || S.breaches.length) return;
    const hits = this.wallHits || (this.wallHits = {});
    const was = hits[c.id] || 0;
    hits[c.id] = was + weight;
    if (was === 0) g.ui.toast(`${c.name} can see you doing that.`, 'bad');
    if (hits[c.id] >= 4) {
      hits[c.id] = .5;
      g.player.rep -= 3;
      g.dialogue.addStanding(c.id, -15);
      g.ui.banner('Breaking in', `${c.name} will not forget this. Their guns are on you if you come through.`);
    }
  }

  bailFor(id) {
    const c = this.g.layout.camps[id];
    return Math.round(c.folk * (BAIL_WEALTH[c.key] || 1) / 10) * 10;
  }

  // Paid in full: the camp takes you back, and word gets round that you settled up.
  payBail(id) {
    const P = this.g.player;
    P.scrip -= this.bailFor(id);
    P.rep = Math.max(0, P.rep);
    P.campRep[id] = Math.max(0, P.campRep[id] || 0);
    delete P.grief[id];
    delete P.grief[-1];
    delete P.wanted[-1];
    if (P.bail) delete P.bail[id];
    this.warned = false;
    this.g.saveGame();
  }

  // People forget a stray shot in a minute or two. A patrol you shot at calms down eventually; a camp does not.
  coolGrudges(dt) {
    const P = this.g.player;
    for (const k in P.grief) {
      P.grief[k] -= dt * .025;
      if (P.grief[k] <= 0) delete P.grief[k];
    }
    for (const k in P.wanted) {
      P.wanted[k] -= dt;
      if (P.wanted[k] > 0) continue;
      delete P.wanted[k];
      P.grief[k] = 2;
      this.g.ui.toast('The patrols have stopped shooting at you.', 'bad');
    }
  }

  // Bullets go astray in a crowded fight, and people know it. A stray round near the dead or at a
  // breach is shrugged off. The same shots in a quiet street are not, and nor is hosing down the
  // same person with the dead all around. Enough of that and everyone with a gun turns on you.
  playerHit(n, dmg, behead = false) {
    if (n.dead) return;
    const g = this.g, P = g.player;
    // Raiders are fair game, and nobody is keeping score.
    if (n.kind === 'raider') {
      // A crew in the middle of a job only cares about the one you hit, and that one only so much.
      if (n.raidCamp !== undefined || n.calm) { n.aggro = true; n.calm = false; }
      else if (!n.aggro) this.raiderAlert(n);
      // Tough enough to last against a camp full of cooks, and to take a few rounds from you: these are people who live by the gun.
      n.hp -= dmg * (n.raidCamp !== undefined ? 1.5 : .95);
      if (n.hp <= 0) { n.headless = behead; this.kill(n, true); }
      return;
    }
    const S = n.camp >= 0 ? g.campSim.state[n.camp] : null;
    // On high alert, with the siren going or the dead inside, a round in the wrong place is not anybody's business: it is ignored.
    if (n.camp >= 0 && this.campPanic(g.layout.camps[n.camp]) >= .6) {
      if (g.time - (n.ffSaid ?? -99) > 6) { n.ffSaid = g.time; g.ui.floatSay(n, pickOf(['Watch your fire!', 'Other way!', 'Careful!']), 1.4); }
      return;
    }
    // The first stray round in a long while is let go: it finds a sleeve, a pack strap, a near miss, and they only shout. A slip of the
    // finger coming out of a menu should not cost a character. All of one shot (every pellet of it) goes the same way.
    const graceT = P.ffGraceT ?? -1e9;
    if (g.time - graceT > FF_GRACE || g.time - graceT < .06) {
      if (g.time - graceT > FF_GRACE) {
        P.ffGraceT = g.time;
        g.ui.floatSay(n, pickOf(['Hey! Watch it!', 'Whoa! Point that somewhere else!', 'That nearly had me!', 'Careful with that thing!']), 1.8);
      }
      return;
    }
    // Out in the streets everyone is shooting at something, and a round that goes astray is half expected.
    const outside = !g.horde.inCamp(n.x, n.z, 0);
    let close = 0;
    g.horde.forRadius(n.x, n.z, outside ? 24 : 16, () => { close++; });
    const fighting = close >= (outside ? 1 : 2) || !!(S && S.breaches.some((b) => Math.hypot(b.x - n.x, b.z - n.z) < 40));
    const ease = outside ? .45 : 1;
    // A person is a person, whatever their job. Weapon damage counts as a share of what a body can take: a few rounds to the chest, or one to the head.
    // That share comes off however much health this one has, since the camps' own fights run on different numbers.
    n.hp -= dmg * BODY_HIT * Math.max(n.bodyHp || 0, n.hp);
    // A shotgun's pellets are one shot, not eight.
    const now = g.time, sameShot = now - (n.lastHit ?? -99) < .05;
    if (!sameShot) n.hits = now - (n.lastHit ?? -99) < 15 ? (n.hits || 0) + 1 : 1;
    n.lastHit = now;
    // One round in a fight can be an accident. A third one on the same person is not.
    const deliberate = n.hits > (outside ? 3 : 2);
    if (n.hp <= 0) {
      if (!fighting || deliberate) {
        P.rep -= 10;
        if (n.camp >= 0) g.dialogue.addStanding(n.camp, -18);
        g.ui.toast(`You killed ${n.name}. People saw it.`, 'bad');
      }
      n.headless = behead;
      this.kill(n, true);
      this.addGrief(n, (fighting && !deliberate ? 1.5 * ease : 6) + (n.kid ? 4 : 0), outside);
      return;
    }
    if (!sameShot) {
      this.addGrief(n, (fighting && !deliberate ? .15 : 1) * ease, outside);
      const turned = n.camp >= 0 ? this.hostileCamp(n.camp) : P.wanted[-1] > 0;
      if (!turned && (!fighting || n.hits === 1)) g.ui.floatSay(n, fighting ? pickOf(['Watch your fire!', 'Careful! Friendly!', 'Other way!']) : n.hits >= 3 ? 'I mean it. Stop shooting me.' : 'Hey! Watch it!');
    }
  }

  addGrief(n, weight, outside = false) {
    const g = this.g, P = g.player, key = n.camp;
    const before = P.grief[key] || 0, now = before + weight;
    P.grief[key] = now;
    if (key < 0 && P.wanted[-1] > 0) { P.wanted[-1] = Math.max(P.wanted[-1], 60); return; }
    // A patrol reports back to the camp it came from.
    const home = key >= 0 ? key : n.factionId ? n.factionId - 1 : -1;
    if (key >= 0 && this.hostileCamp(key)) return;
    if (home >= 0 && P.bail && P.bail[home] && !(P.bail[home] === 'out' && !outside)) return;
    if (before < 2.5 && now >= 2.5 && now < 5) g.ui.toast('People are reaching for their guns. Put yours down.', 'bad');
    if (now < 5) return;
    const name = home >= 0 ? g.layout.camps[home].name : 'The patrol';
    P.grief[key] = 0;
    if (outside && home >= 0) {
      // Done outside the wall: nobody is shooting back, but the gate is shut to you until you pay up.
      P.bail[home] = 'out';
      P.rep -= 4;
      g.ui.banner('You are on their list', `${name} has shut its gate to you until you pay your bail: ${this.bailFor(home)} spades, at their Town Hall or to one of their patrols.`);
      g.saveGame();
      return;
    }
    P.rep -= 12;
    if (key < 0) P.wanted[-1] = 90;
    if (home >= 0) { P.campRep[home] = Math.min(P.campRep[home] || 0, 0) - 20; P.bail[home] = 'in'; }
    g.ui.banner('They have turned on you', home >= 0 ? `${name} will shoot you inside its wall until you pay your bail: ${this.bailFor(home)} spades.` : `${name} is shooting back.`);
    if (P.rep <= -30 && !this.warned) {
      this.warned = true;
      g.ui.banner('Marked', 'Every settlement will shoot you inside its wall. Patrols will still take your bail.');
    }
    g.saveGame();
  }

  // Someone fired inside the wall. People notice.
  firedInCamp() {
    if (this.shotsBark > 0) return;
    const here = this.g.horde.inCamp(this.g.player.x, this.g.player.z, 0);
    if (here && this.campPanic(here) >= .6) return;
    const P = this.g.player;
    let near = null, bd = 18;
    for (const n of this.list) {
      if (n.camp < 0 || n.kind === 'guard' || n.state === 7) continue;
      const d = Math.abs(n.x - P.x) + Math.abs(n.z - P.z);
      if (d < bd) { bd = d; near = n; }
    }
    const onWall = P.y > STREET_Y + 3;
    const S = near ? this.g.campSim.state[near.camp] : null;
    if (near && !onWall && !(S && (S.drawing || S.inside > 0))) { this.shotsBark = 7; this.g.ui.floatSay(near, pickOf(COMMON_BARKS.shots)); }
  }

  // Which camp someone defends, if they are one of its guards, its sentries or one of its patrols. -1 otherwise.
  defenderCamp(n) {
    if (n.kind === 'guard' || n.kind === 'sentry') return n.camp ?? -1;
    if (n.kind === 'roamer' && n.factionId && n.squad && n.squad.camp) return n.factionId - 1;
    return -1;
  }

  // What the people holding the wall say among themselves about how it is going: the operation dragging on past what they were
  // told, the friends they have lost, holes in the wall, the size of what is coming, the ammunition, and the people who decided
  // all this. Grumbling more than anything. After it is over, how it went. Nothing to say on a quiet day: then it is the usual talk.
  defenderLine(n) {
    const id = this.defenderCamp(n);
    if (id < 0) return null;
    const g = this.g, sim = g.campSim, S = sim.state[id], c = g.layout.camps[id];
    if (S.status !== 'holding') return null;
    const op = S.op, lines = [], add = (w, list) => { for (const l of list) lines.push([w, l]); };
    const lore = LORE[c.key], boss = lore && lore.cast.find((m) => m.role === 'leader'), bossName = boss && !sim.dead[boss.id] ? boss.name.split(' ')[0] : 'the Town Hall';
    const start = c.guards.length || 1, lost = Math.max(0, Math.round(start - S.guards)), share = lost / start;
    const side = (b) => ({ N: 'north', S: 'south', E: 'east', W: 'west' }[b.side] || 'far');
    if (op) {
      const d = sim.opDayOf(op), mag = Math.round(op.mag || 1);
      if (d.over) {
        const over = d.day - d.predict;
        add(3, [`Day ${d.day}. They told us ${d.predict}. Somebody up there can't count.`, `This was meant to be over ${over === 1 ? 'yesterday' : `${over} days ago`}.`, `"${d.predict === 1 ? 'One day' : `${d.predict} days`}," they said. Look at us.`, 'Every day past their estimate is another day of this. Who signs off on these numbers?', `${bossName} promised this would be quick. ${bossName} isn't up here.`, 'We are overextended and everybody knows it except the people giving the orders.', 'How long can we keep this up? Honestly?']);
      } else if (d.day > 1) add(1, [`Day ${d.day} of ${op.name}. Feels like a month.`, 'Nobody has slept properly since this started.']);
      if (mag >= 7) add(2, ['I have never seen this many. Never.', 'There is no end to them. Look at that street.', `Magnitude ${mag}. Remember when a five was a bad night?`, 'If they all come at once, this wall is paper.']);
      else if (mag >= 5) add(1, ['They keep coming. Every time I look up, more of them.', 'Keep your eyes on the street, not on me.']);
      if (S.locked) add(1, ['Gates are shut and we are the ones left out on the wall. Lovely.', 'Locked in with them outside. Feels safe until you think about it.']);
      add(.4, [`Operation ${op.name}. Who even picks these names?`, 'Somebody tell me the Town Hall is paying for this in more than spades.']);
    }
    if (share > .4) add(3, [`${lost} of us gone off this wall. Who's telling their families?`, 'I don\'t know half the faces up here any more. The ones I knew are dead.', 'They keep sending us up and we keep coming down in bags.', `We should have pulled back to the inner yard. ${bossName} wouldn't hear it.`, 'Holding the whole perimeter with this few is madness. Everybody can see it.']);
    else if (share > .15) add(2, [`We've lost ${lost} already. ${lost} people I'd have trusted with my life.`, 'Another empty spot on the wall. You stop learning names after a while.', 'Whose idea was it to hold every metre of this wall with half the people?']);
    if (S.breaches.length) add(3, [...S.breaches.map((b) => `There's a hole on the ${side(b)} and they want us standing here?`), 'If they plug one more hole with people instead of planks, I quit.', 'Breach. Of course. Of course there is.']);
    if (S.ammo < 35) add(2, [`We are down to ${Math.round(S.ammo)} percent on ammunition. Make every one count.`, 'Count your rounds. Nobody is bringing more.', `${bossName} traded away crates we needed. I said so at the time.`]);
    if (S.postBroken) add(1, ['No siren. If they get in, we will hear it from the screaming.']);
    if (!op && S.lastOp && sim.now() < S.lastOp.until) {
      const L = S.lastOp;
      add(2, [`We held ${L.name}. Barely.`, L.peak >= 5 ? `Peak magnitude ${L.peak}. I'll be hearing them in my sleep for a month.` : 'Quieter than I expected. Not complaining.', L.lost ? `${L.lost} dead, and they're calling it a success.` : 'Nobody lost. I didn\'t think I would ever say that.', L.predict && L.days > L.predict ? `${L.days} days, for a ${L.predict}-day operation. Next time I'll believe them when I see it.` : `Done in ${L.days === 1 ? 'a day' : `${L.days} days`}. For once the Town Hall had it right.`, 'Get some sleep while you can. It will come back.']);
    }
    if (!lines.length) return null;
    // Weighted: the worse something is, the more of the talk it is.
    let sum = 0;
    for (const [w] of lines) sum += w;
    let r = rand() * sum, pick = lines[0][1];
    for (const [w, l] of lines) { r -= w; if (r <= 0) { pick = l; break; } }
    return sim.swear(pick, sim.tension(c, S));
  }

  ambientBark(n) {
    // On the wall or out on patrol, with something going on: that is what they talk about.
    const talk = rand() < .75 ? this.defenderLine(n) : null;
    if (talk) { this.bark(n, talk, 30); return; }
    const lore = n.campKey ? LORE[n.campKey] : null;
    const act = n.task && n.arrived ? ACTIVITY_BARKS[n.task.kind] : null;
    let pool;
    if (n.kid) pool = ACTIVITY_BARKS.kid;
    else if (act && rand() < .6) pool = act;
    else if (n.kind === 'guard') pool = lore ? lore.barks.guard.concat(COMMON_BARKS.guard) : COMMON_BARKS.guard;
    else pool = lore ? lore.barks.folk.concat(COMMON_BARKS.folk) : COMMON_BARKS.folk;
    this.bark(n, this.freshLine(pool), 30);
  }

  // How frightened a camp is, 0 to 1: the siren, holes in the wall, the dead inside, the gates locked, a huge attack.
  campPanic(c) {
    const sim = this.g.campSim, S = sim.state[c.id];
    if (S.status !== 'holding') return 0;
    let p = 0;
    if (sim.alarm === c) p = sim.alarmLevel >= 1 ? 1 : .6;
    if (S.breaches.length) p = Math.max(p, .5 + Math.min(.4, S.breaches.length * .15));
    if (S.inside >= 30) p = Math.max(p, .85);
    if (S.locked) p = Math.max(p, .45);
    if (S.op && (S.op.mag || 1) >= 6) p = Math.max(p, .35 + ((S.op.mag || 1) - 6) * .1);
    return Math.min(1, p);
  }

  bark(n, text, range) {
    if (!n) return;
    const P = this.g.player;
    if (Math.hypot(n.x - P.x, n.z - P.z) > range) return;
    this.barkGlobal = .5;
    this.g.ui.floatSay(n, text);
  }

  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let best = null;
    const a = dx * dx + dz * dz;
    if (a < 1e-5) return null;
    for (const n of this.list) {
      if (n.dead) continue;
      const ax = n.x - ox, az = n.z - oz;
      const t = Math.max(0, (ax * dx + az * dz) / a);
      if (t > maxT) continue;
      const hx = ox + dx * t, hz = oz + dz * t;
      const d2 = (hx - n.x) * (hx - n.x) + (hz - n.z) * (hz - n.z);
      if (d2 > .3) continue;
      const hy = oy + dy * t;
      if (hy < n.y || hy > n.y + (n.kid ? 1.9 : 2.8)) continue;
      if (!best || t < best.t) best = { t, n, hx, hy, hz };
    }
    if (best) { const r = best.n; r.t = best.t; r.hx = best.hx; r.hy = best.hy; r.hz = best.hz; return r; }
    return null;
  }

  // Looking at someone's goods is near enough to looking at them, as long as you are standing at their counter.
  acrossCounter(o, f) {
    let best = null, bd = .82;
    for (const n of this.list) {
      if ((n.kind !== 'vendor' && n.kind !== 'clerk') || n.dead) continue;
      const dx = n.x - o[0], dz = n.z - o[2], d = Math.hypot(dx, dz);
      if (d > 4 || d < .1) continue;
      const dot = (dx * f[0] + dz * f[2]) / d;
      if (dot > bd) { bd = dot; best = n; }
    }
    return best;
  }

  lookAt(o, f, range, maxT) {
    const h = this.raycast(o[0], o[1], o[2], f[0], f[1], f[2], Math.min(range, maxT + .5));
    return h && h.t <= range ? h : null;
  }

  draw() {
    const g = this.g, A = g.actors, cam = g.renderer.camPos, fwd = g.renderer.camForward;
    const fl = Math.hypot(fwd[0], fwd[2]) || 1, nx = fwd[0] / fl, nz = fwd[2] / fl;
    // Out under the sky in the rain, people soak through, quicker the harder it comes down. Under a roof, or once it stops, they slowly dry.
    const w = g.weather, map = g.rainMap, now = g.time, wdt = Math.min(.25, now - (this.wetClock ?? now));
    this.wetClock = now;
    for (const n of this.list) {
      if (n.dead) continue;
      const top = map ? map.at(n.x, n.z) : -1, open = top < 0 ? true : top < n.y + 2.2;
      const abed = n.state === 7 || (n.arrived && n.task && n.task.kind === 'sleep');
      const want = open && !abed ? w.rain : 0;
      // Indoors they dry off in a minute or so rather than dripping on the floor for the rest of the evening.
      n.wet = n.wet === undefined ? want : n.wet + (want - n.wet) * Math.min(1, wdt / (want > n.wet ? 18 : abed ? 6 : open ? 160 : 35));
      n.underRoof = !open;
      const dx = n.x - cam[0], dz = n.z - cam[2], d2 = dx * dx + dz * dz;
      if (d2 > 300 * 300) continue;
      if (dx * nx + dz * nz < -6) continue;
      // Bits of the last instance float: 0 headless, 1-4 weapon, 5 child, 6+ faction.
      const faction = n.camp >= 0 ? n.camp + 1 : (n.factionId || 0);
      const lit = n.torchLit === this.frameN ? (n.kind === 'raider' ? 2048 : n.coolTorch ? 3072 : 1024) : 0;
      // Up and ready: a torch on the gun, or a gun fired in the last few seconds. Held up, it is sent the angle it points at, kicked up for
      // an instant by each shot. 42 of 63 is level.
      const ready = n.weaponId > 0 && n.weaponId < 8 && n.readyT > now;
      let q = 42;
      if (lit || ready || n.state === 3) {
        const kick = n.shotAt !== undefined ? Math.max(0, 1 - (now - n.shotAt) / .14) * (n.weaponId === 3 || n.weaponId === 5 ? .2 : .1) : 0;
        q = Math.max(0, Math.min(63, Math.round(((n.pitchA || 0) + kick + .8) / 1.2 * 63)));
      }
      // Put away: in bed, at work round the settlement (the bench, the garden, the class, a seat by the fire), or behind a counter, as
      // long as nothing is happening. The moment there is trouble, or they have just been shooting, it is back in their hands.
      const job = n.arrived && n.task && STOW_TASKS[n.task.kind];
      const calm = !n.alarmed && !n.threat && !n.flee && !n.fighting && !(n.busyT > 0) && !ready && !lit && n.state !== 3;
      const stowed = abed || (calm && n.camp >= 0 && (n.kind === 'resident' ? !!job : n.kind === 'vendor' || n.kind === 'clerk'));
      const wid = stowed ? 0 : n.weaponId;
      const extra = wid * 2 + (n.kid ? 32 : 0) + faction * 64 + lit + Math.min(7, Math.round(n.wet * 8)) * 4096 + q * 32768 + (ready ? 2097152 : 0);
      // A blade or a bat is swung, not pointed: from the moment of the blow, the shader is told how far through the swing they are.
      let st = n.state || 0;
      if (wid >= 8 && (st === 3 || n.swingAt !== undefined) && st !== 7 && st !== 5) {
        const s = n.swingAt !== undefined ? .22 + (now - n.swingAt) / .5 : 1;   // the blow lands as the swing comes down
        if (s >= 0 && s < 1) st = 9 + s * .99;
        else if (st === 3) st = 0;
      }
      A.push(d2 < 50 * 50 ? 0 : 1, n.x, n.y, n.z, n.ys, n.phase, st, n.variant, extra);
    }
  }

  rumor() { return pickOf(RUMORS); }
}

// --- Jobs --------------------------------------------------------------------------------------
const JOB_TITLES = {
  kill: ['Thin the crowd', 'Street sweeping', 'Clear a route', 'Pest control'],
  bounty: ['Bounty', 'Wanted', 'Dead or alive', 'Road agents'],
  fetch: ['Bring back the cache', 'Dead drop recovery', 'Courier run', 'Medical run'],
  hold: ['Hold the relay', 'Light the beacon', 'Radio mast repair'],
};

export class Jobs {
  constructor(game) {
    this.g = game;
    this.offers = {};
    this.offerDay = {};
    this.active = [];
    this.nextId = 1;
  }

  offersFor(campId) {
    if (this.offerDay[campId] !== this.g.day) {
      this.offerDay[campId] = this.g.day;
      const c = this.g.layout.camps[campId];
      // The day's run of each kind of work, and then a second, harder run of the same: further out, more to do, better paid. For
      // whoever wants the hard end of the board before the board would have got round to offering it.
      const types = ['kill', 'fetch', 'hold', 'bounty'];
      this.offers[campId] = [...types.map((t) => this.make(c, t)), ...types.map((t) => this.make(c, t, .3))];
    }
    return this.offers[campId];
  }

  make(c, type, harder = 0) {
    const g = this.g, L = g.layout;
    let x = c.cx, z = c.cz;
    // Someone new to a camp gets errands, not expeditions, and is paid partly in what they lack.
    const green = g.player.loadout !== 'veteran' && g.dialogue.standing(c.id) < 10;
    // How far along you are with this kind of work: the jobs you have done anywhere, and how well this town knows you. The board grows
    // with you, a little at a time: the first jobs are round the corner from the wall, and the ones after them go further out, ask for
    // more, and pay for it. Each offer on a board sits somewhere near that line, a bit either side, so there is a choice.
    const prog = Math.max(0, Math.min(1, (g.stats.jobs + Math.max(0, g.dialogue.standing(c.id)) / 6) / 32));
    const p = Math.max(0, Math.min(1, prog + harder + (rand() - .5) * .3));
    // Measured from the wall. Raiders keep well clear of a wall full of rifles, so a bounty starts further out than the rest; a cull
    // needs to be far enough out that there is something left to cull. Most of how hard a job is, is how far it is.
    const near = (type === 'bounty' ? 80 : type === 'kill' ? 45 : 35) + p * 300, far = near + 50 + p * 220;
    const hx = (c.x1 - c.x0) / 2, hz = (c.z1 - c.z0) / 2;
    for (let t = 0; t < 120; t++) {
      const a = rand() * 6.283, ca = Math.cos(a), sa = Math.sin(a);
      const out = near + rand() * (far - near) + t;
      const r = Math.min(hx / (Math.abs(ca) + .001), hz / (Math.abs(sa) + .001)) + out;
      const nx = Math.floor(c.cx + ca * r), nz = Math.floor(c.cz + sa * r);
      if (nx < 4 || nz < 4 || nx >= WX - 4 || nz >= WZ - 4) continue;
      const gd = L.ground[nz * WX + nx];
      if ((gd === G.ROAD || gd === G.PLAZA) && !g.horde.inCamp(nx, nz, 40)) { x = nx; z = nz; break; }
    }
    const dist = Math.max(c.x0 - x, x - c.x1, c.z0 - z, z - c.z1);
    const place = L.describe(x, z);
    const where = place.cross ? `${place.cross}, ${place.district}` : place.district;
    const title = JOB_TITLES[type][Math.floor(rand() * JOB_TITLES[type].length)];
    // Pay is for the work: so much for every block of the way out (and back), and so much for what has to be done there. A job round the
    // corner pays about what a shift on the wall does; a long way out into the city, with a lot to do, pays several times that.
    const base = 25 + dist * .42;
    let job;
    if (type === 'kill') {
      const n = Math.round(10 + p * 45 + rand() * (8 + p * 12));
      job = { type, title, need: n, got: 0, reward: Math.round(base + n * 2), desc: `Kill ${n} infected around ${where}. We need that block quiet.`, where };
    } else if (type === 'fetch') {
      job = { type, title, reward: Math.round(base * 1.3 + 15), desc: `A cache was left at ${where} when the last team got swarmed. Get it. It is marked on your map.`, where };
    } else if (type === 'bounty') {
      const gang = Math.max(1, Math.min(7, Math.round(1 + p * 4.5 + (rand() - .3) * 1.6)));
      const boss = pickOf(RAIDER_NAMES);
      job = { type, title: `${title}: ${boss}`, gang, left: gang, spawned: false, reward: Math.round(base * 1.1 + gang * 38), desc: `${boss} and ${gang - 1 > 1 ? `${gang - 1} others have` : gang > 1 ? 'one other has' : 'nobody else has'} been robbing our people around ${where}. Put a stop to it.`, where };
    } else {
      job = { type, title, time: 40, held: 0, reward: Math.round(base * 1.35 + 20), desc: `Run a relay at ${where} and keep within range for 40 seconds. The transmitter is loud, so expect company.`, where };
    }
    job.id = this.nextId++;
    job.x = x; job.z = z;
    job.y = STREET_Y;
    job.campId = c.id;
    job.status = 'offer';
    job.bonus = green
      ? pickOf(['ammo_pistol', 'bandage', 'medkit', 'jacket', 'ammo_shell', 'pistol', 'shotgun', 'backpack'])
      : rand() < .35 ? ['medkit', 'grenade', 'antibiotic', 'dynamite', 'ammo_rifle'][Math.floor(rand() * 5)] : null;
    return job;
  }

  accept(job) {
    job.status = 'active';
    this.active.push(job);
    const o = this.offers[job.campId];
    if (o) o.splice(o.indexOf(job), 1);
    this.g.ui.toast(`Commission accepted: ${job.title}`);
    this.refreshCrowds();
  }

  // Changing your mind costs you a little with whoever asked, and nothing else. A personal favour can be picked up again.
  abandon(job) {
    const g = this.g, P = g.player;
    const i = this.active.indexOf(job);
    if (i < 0) return;
    this.active.splice(i, 1);
    if (job.favour && job.campId >= 0) {
      for (const m of LORE[g.layout.camps[job.campId].key].cast) {
        const t = (m.topics || []).find((q) => q.job === job.favour);
        if (t) delete P.dlg.flags[`seen_${m.id}_${t.id}`];
      }
      delete P.dlg.flags[`${job.favour}_done`];
    }
    // Saying yes earns nothing; doing it does. Walking away from something you said you would do costs you with them, and a contract
    // you signed for costs more than an errand you picked off the board.
    const contract = job.type === 'patrol' || job.type === 'night';
    if (job.type !== 'defend' && job.type !== 'defended' && job.type !== 'migrate' && job.type !== 'visit' && job.campId >= 0) {
      g.dialogue.addStanding(job.campId, contract ? -5 : -3);
      P.rep = Math.max(-100, P.rep - (contract ? 3 : 2));
    }
    g.ui.toast(`Abandoned: ${job.title}`);
    // Walking out on a contract breaks it. You still get the same bonus for your kills as anyone who helps.
    if (job.type === 'defend') {
      const s = g.campSim.state[job.campId], c = g.layout.camps[job.campId];
      if (s.op && !job.pending) {
        g.dialogue.addStanding(job.campId, -5);
        P.rep = Math.max(-100, P.rep - 3);
        const back = this.commission(c, s.op);
        back.kills = job.kills || 0;
      }
    }
    this.refreshCrowds();
    g.saveGame();
  }

  // Walking away from a wall that has failed, towards one that hasn't yet.
  // Somebody else's people on the road: walk with them, get them there, and the camp that takes them in pays for it.
  startMigrate(from, to, escort = false) {
    if (!to || this.active.some((a) => a.type === 'migrate' && (a.fromId === from.id || (!escort && !a.escort)))) return;
    this.active.push(escort ? {
      id: this.nextId++, type: 'migrate', escort: true, campId: to.id, fromId: from.id, title: `See ${from.name}'s people to ${to.name}`,
      desc: `${from.name} has fallen. Everyone who got out is on the road to ${to.name}, through whatever lies between. Walk with them, keep them alive, and ${to.name} will pay when you get there.`,
      reward: 320, status: 'active', x: to.cx, z: to.cz, y: STREET_Y,
    } : {
      id: this.nextId++, type: 'migrate', campId: to.id, fromId: from.id, title: `Get to ${to.name}`, desc: `${from.name} is gone. Find a group: everyone who got out is meeting up and making for ${to.name} together. They may take you in.`,
      reward: 0, status: 'active', x: to.cx, z: to.cz, y: STREET_Y,
    });
    this.g.ui.toast(`New objective: ${this.active[this.active.length - 1].title}`, 'good');
  }

  // A favour for someone who is not around any more isn't owed to anyone.
  campFell(c) {
    const g = this.g;
    delete this.offers[c.id];
    delete this.offerDay[c.id];
    for (let i = this.active.length - 1; i >= 0; i--) {
      const j = this.active[i];
      if ((j.type === 'night' || j.type === 'patrol') && j.campId === c.id) {
        this.active.splice(i, 1);
        g.ui.toast(j.earned ? `The ${SPADE} ${j.earned.toLocaleString('en-US')} you had earned on contract went with ${c.name}.` : `${j.title}: there is no wall left to work.`, 'bad');
      } else if (j.type === 'defend' && j.campId === c.id) {
        this.active.splice(i, 1);
        if (j.pending) g.ui.toast(`${j.title}: there is nothing left to sign for.`, 'bad');
      } else if (j.type === 'defended' && j.campId === c.id) {
        this.active.splice(i, 1);
        g.ui.toast(`The ${j.reward.toLocaleString('en-US')} spades ${c.name} owed you went with it.`, 'bad');
      } else if ((j.favour || j.type === 'kill' || j.type === 'fetch' || j.type === 'hold' || j.type === 'bounty') && j.campId === c.id) {
        this.active.splice(i, 1);
        g.ui.toast(`${j.title}: there is nobody left to do it for.`, 'bad');
      }
    }
    this.refreshCrowds();
  }

  // A job to thin out a crowd needs a crowd. However many have already been killed there, the block is allowed to hold enough to finish it.
  refreshCrowds() {
    this.g.horde.setCrowdBoosts(this.active.filter((j) => j.type === 'kill' && j.status === 'active').map((j) => ({ x: j.x, z: j.z, r: 70, n: 2 })));
  }

  // A personal request from a named character.
  startFavour(npc, key) {
    const spec = npc.part.favours[key];
    // Story locations are approximate; pin the marker to the nearest open street.
    const L = this.g.layout;
    let x = Math.round(xU(spec.u)), z = Math.round(zV(spec.v));
    search: for (let r = 0; r < 120; r += 2) for (let a = 0; a < 16; a++) {
      const nx = Math.round(x + Math.cos(a * .3927) * r), nz = Math.round(z + Math.sin(a * .3927) * r);
      if (nx < 4 || nz < 4 || nx >= WX - 4 || nz >= WZ - 4) continue;
      const gd = L.ground[nz * WX + nx];
      if ((gd === G.ROAD || gd === G.WALK || gd === G.PLAZA || gd === G.PROM) && !this.g.horde.inCamp(nx, nz, 10)) { x = nx; z = nz; break search; }
    }
    const job = {
      id: this.nextId++, favour: key, giver: npc.name, campId: npc.camp, type: spec.type, title: spec.title, desc: spec.desc,
      reward: spec.reward, bonus: spec.bonus || null, status: 'active', x, z, y: this.g.world.terrainTop(x, z),
    };
    if (spec.type === 'kill') { job.need = spec.need || 30; job.got = 0; }
    if (spec.type === 'hold') { job.time = 40; job.held = 0; }
    this.active.push(job);
    this.g.ui.toast(`New objective: ${job.title}`, 'good');
    this.refreshCrowds();
  }

  // --- Operations ----------------------------------------------------------------------------------
  // A hard number, on purpose: about an eighth of a big attack, every day. More people in the city means more to shoot at, and more expected.
  quotaFor() {
    const g = this.g, k = Math.sqrt(Math.max(.5, g.horde.settings.horde || 1));
    return Math.floor((110 + 5 * g.day) * k / 10) * 10;
  }

  // What a shift finished right now is worth at this camp.
  shiftPay(campId) { return this.g.campSim.state[campId].op ? OP_PAY.shiftOp : OP_PAY.shift; }

  opJob(campId) { return this.active.find((a) => a.type === 'defend' && a.campId === campId); }

  // You do not sign anything for this. Turn up, fight, and the camp owes you for it if it holds.
  commission(c, op) {
    const j = this.opJob(c.id);
    if (j) return j;
    const nu = {
      id: this.nextId++, type: 'defend', plan: 'commission', campId: c.id, op: op.name, title: `Commission: Operation ${op.name}`,
      desc: `${SPADE} ${OP_PAY.commission} for every infected you put down near the walls of ${c.name}, paid at the Town Hall when the operation succeeds. Nothing if the settlement falls. The clerk has better-paying contracts.`,
      status: 'active', x: c.cx, z: c.cz, y: STREET_Y, kills: 0, vKills: 0,
    };
    this.active.push(nu);
    return nu;
  }

  // Signed and still running. One that is finished and waiting to be paid is not "on patrol" any more.
  patrolOf(campId) { return this.active.find((a) => a.type === 'patrol' && a.status === 'active' && a.campId === campId); }

  // Anything a contract has to tell you goes in the corner, and stays there long enough to read.
  contractNote(c, text, kind = '', title = '', big = null) {
    // A shift starting or a quota met goes up in the middle of the screen; everything else is a note at the side.
    if (big) this.g.ui.bannerNext(big[0], big[1]);
    else this.g.ui.toast(text, kind, 7);
    this.g.campSim.logNews({ kind: 'contract', campId: c.id, title, text: title ? text.replace(/^Contract ended\. /, '') : text, bad: kind === 'bad' });
  }

  // The camp owes you now, in full, across the table at its own town hall. If the camp goes first, so does this.
  finishRun(j, c, head) {
    const g = this.g;
    j.status = 'done';
    j.unmarked = false;
    j.reward = j.earned;
    j.giver = g.campSim.state[c.id].clerkName || 'the clerk';
    j.title = j.type === 'patrol' ? 'Collect pay for Patrol' : 'Collect pay for Night shift';
    j.x = c.clerk.x; j.z = c.clerk.z;
    this.contractNote(c, `${head}. Your ${SPADE} ${j.earned.toLocaleString('en-US')} is ready at the ${c.name} Town Hall.`, 'good');
    g.audio.simple('coin');
  }

  // One miss and the deal is off. Nothing earned on it is paid.
  breakRun(j, c, why) {
    const g = this.g, i = this.active.indexOf(j);
    if (i >= 0) this.active.splice(i, 1);
    j.status = 'ended';
    // A contract broken by not turning up: they had counted on you.
    g.dialogue.addStanding(c.id, -5);
    g.player.rep = Math.max(-100, g.player.rep - 3);
    this.contractNote(c, `Contract ended. ${why}${j.earned ? ` The ${SPADE} ${j.earned.toLocaleString('en-US')} you had earned is gone.` : ''}`, 'bad', `${j.type === 'patrol' ? 'Patrol' : 'Night shift'} contract failed`);
    g.audio.simple('beep');
  }

  nightOf(campId) { return this.active.find((a) => a.type === 'night' && a.campId === campId); }

  // A hard night's work, but less than a day's quota on an operation. More people in the city means more to shoot at, and more expected.
  // The night's quota goes by how many of the dead are actually about: a farm camp out in thin country asks for fewer than a town
  // camp with a city's worth of them in the streets round it, where the guards cannot get them all first.
  nightQuota(c) {
    const g = this.g, k = Math.sqrt(Math.max(.5, g.horde.settings.horde || 1)), base = (35 + g.day * 1.5) * k;
    if (!c) return Math.round(base / 5) * 5;
    const f = Math.max(.4, Math.min(1.3, Math.sqrt(g.horde.popNear(c, NIGHT_RADIUS) / 700)));
    return Math.max(10, Math.round(base * f / 5) * 5);
  }

  onShift(j, now = this.g.campSim.now()) {
    return now >= j.k + OP_PAY.nightStart && now < j.k + OP_PAY.nightStart + OP_PAY.nightLen;
  }

  // An operation you signed up for ahead of time has begun, and so has your first day's quota.
  opOpened(c, op) {
    const j = this.opJob(c.id);
    if (!j || !j.pending) return;
    j.pending = false;
    j.day = 0;
    j.dayFrom = op.start;
    j.dayKills = 0;
    this.contractNote(c, `Operation ${op.name} has started. Your contract is running. Quota today: ${j.quota.toLocaleString('en-US')}.`, '', '', [`Operation ${op.name} has started`, `Your contract is running. Quota today: ${j.quota.toLocaleString('en-US')}`]);
  }

  // Past the day the command post said it would be over, the Town Hall will settle a contract early, at a cut: steep the first day it
  // overruns, less with every day after. Only on a day whose quota you have already met; a commission has no quota to meet.
  earlyPayout(campId) {
    const g = this.g, sim = g.campSim, s = sim.state[campId], op = s.op, j = this.opJob(campId);
    if (!op || !op.predict || !j || j.pending || j.void || s.status !== 'holding') return null;
    const d = sim.opDayOf(op);
    if (!d.over) return null;
    const pay = this.opPay(j);
    if (pay <= 0) return null;
    if (j.plan === 'vanguard' && !(j.dayMet || j.dayKills >= this.quotaDue(j, op, op.start + j.day + 1))) return { locked: true, over: d.day - d.predict };
    const over = d.day - d.predict, cut = Math.max(.15, .6 - .12 * (over - 1));
    return { cut, pay: Math.max(1, Math.floor(pay * (1 - cut))), full: pay, over };
  }

  takeEarlyPayout(campId) {
    const g = this.g, e = this.earlyPayout(campId), j = this.opJob(campId);
    if (!e || e.locked || !j) return 0;
    this.active.splice(this.active.indexOf(j), 1);
    g.player.scrip += e.pay;
    g.stats.ops = (g.stats.ops || 0) + 1;
    g.audio.simple('coin');
    const c = g.layout.camps[campId], op = g.campSim.state[campId].op;
    g.campSim.logNews({ kind: 'contract', campId, title: `Early payout: Operation ${op.name}`, text: `Took ${SPADE} ${e.pay.toLocaleString('en-US')} of ${SPADE} ${e.full.toLocaleString('en-US')} (${Math.round(e.cut * 100)}% cut) at ${c.name}.` });
    return e.pay;
  }

  // Signed for something at this camp, and still working it: an operation, a patrol or a night shift. That buys a free patch-up at the
  // doctor and a small box of supplies from the traders, once a day each.
  underContract(campId) {
    // An operation contract counts from when the operation starts, not from when you signed it. A patrol or a night shift counts on a day
    // that has a shift in it: signed too late for tonight's and pushed to tomorrow, there is nothing free today.
    const today = Math.floor(this.g.campSim.now());
    return this.active.some((a) => a.campId === campId && a.status === 'active' && ((a.type === 'defend' && a.plan === 'vanguard' && !a.void && !a.pending) || ((a.type === 'patrol' || a.type === 'night') && today >= a.k)));
  }

  perkFree(campId, kind) {
    if (!this.underContract(campId)) return false;
    const used = this.g.player.perks || (this.g.player.perks = {});
    return used[`${kind}_${campId}`] !== this.g.day;
  }

  usePerk(campId, kind) {
    const used = this.g.player.perks || (this.g.player.perks = {});
    used[`${kind}_${campId}`] = this.g.day;
  }

  // What is in the box: a little of the ammunition for what you carry, a couple of bandages, and a grenade.
  supplyBox() {
    const P = this.g.player, out = [];
    const guns = P.weapons().filter((id) => ITEMS[id].type === 'gun' && ITEMS[id].ammo && ITEMS[id].ammo !== 'ammo_rocket');
    const ammo = [...new Set(guns.map((id) => ITEMS[id].ammo))].slice(0, 2);
    for (const a of ammo.length ? ammo : ['ammo_pistol']) {
      const n = a === 'ammo_shell' ? 8 : a === 'ammo_rifle' ? 20 : 24;
      P.gain(a, n); out.push(`${n} ${ITEMS[a].name}`);
    }
    P.gain('bandage', 2); out.push('2 Bandages');
    P.gain('grenade', 1); out.push('a Frag Grenade');
    return out;
  }

  // What this contract would be worth right now, for the kills it has.
  opPay(j) {
    const earned = (j.vKills || 0) * OP_PAY.vanguard * (j.dock ?? 1);
    return (j.kills || 0) * OP_PAY.commission + (j.vKills ? Math.max(1, Math.floor(earned)) : 0);
  }

  // The same, as if no quota had ever been missed.
  opFullPay(j) {
    return (j.kills || 0) * OP_PAY.commission + (j.vKills || 0) * OP_PAY.vanguard;
  }

  // How much of its earnings this place would still pay after a missed quota, as things stand today.
  dockRate(c) {
    const rule = DOCK[c.key] || { keep: .25 };
    return Math.max(.05, rule.keep * (.55 + .45 * Math.min(1, this.g.director.strength(c))));
  }

  defendKill(c, op) {
    const g = this.g;
    if (!g.player.discovered[c.id] || g.npcs.hostileCamp(c.id)) return;
    // On patrol you are paid to walk, not to shoot.
    // On a night shift, the kills are already spoken for.
    const nj = this.nightOf(c.id);
    if (nj && nj.status === 'active' && !nj.shiftDone && this.onShift(nj)) return;
    let j = this.opJob(c.id);
    if (!j) j = this.commission(c, op);
    if (j.plan === 'vanguard') {
      j.vKills++; j.dayKills++;
      if (!j.pending && !j.dayMet) {
        const due = this.quotaDue(j, op, op.start + j.day + 1);
        if (due > 0 && j.dayKills >= due) {
          j.dayMet = true;
          this.contractNote(c, `Quota met for day ${j.day + 1} of Operation ${op.name}.`, 'good', '', ['Quota met', `Day ${j.day + 1} of Operation ${op.name}`]);
        }
      }
    } else j.kills++;
  }

  // An operation contract: on the board ahead of time, and open to anyone who walks in partway through. It takes over from the commission;
  // what you had already earned on that still stands.
  signOperation(c) {
    const g = this.g, s = g.campSim.state[c.id], op = s.op || s.opNext, now = g.campSim.now();
    if (!op) return null;
    const j = this.commission(c, op);
    j.plan = 'vanguard';
    j.title = `Operation ${op.name}`;
    j.desc = `${op.quota.toLocaleString('en-US')} infected near the walls of ${c.name} each day of the operation, at ${SPADE} ${OP_PAY.vanguard} each, paid at the Town Hall when it succeeds. Each missed quota docks your pay, and the ${OP_PAY.strikes === 3 ? 'third' : `${OP_PAY.strikes}th`} ends the contract with nothing paid on it. Nothing if the settlement falls.`;
    j.quota = op.quota;
    j.dock = 1;
    j.misses = 0;
    j.vKills = 0;
    j.dayKills = 0;
    j.dayMet = false;
    if (s.op) {
      j.pending = false;
      j.day = Math.floor(now - s.op.start);
      j.dayFrom = now;
    } else j.pending = true;
    g.ui.toast(`Signed: ${j.title}`, 'good');
    g.audio.simple('crate');
    g.saveGame();
    return j;
  }

  // Today counts, as long as there is enough of it left to get round.
  patrolStartsToday(now) { return Math.floor(now - OP_PAY.patrolStart) + 1 + OP_PAY.patrolStart - now >= .25; }

  // Once round the outside of the wall every day, three days running, paid at the town hall at the end. Today counts, unless there is not enough of it left.
  signPatrol(c) {
    const g = this.g, posts = this.patrolPosts(c), now = g.campSim.now();
    let k = Math.floor(now - OP_PAY.patrolStart);
    if (!this.patrolStartsToday(now)) k++;
    const j = {
      id: this.nextId++, type: 'patrol', campId: c.id, title: `Patrol contract: ${c.name}`,
      desc: `Check the ${posts.length} corners outside the wall of ${c.name} once a day, ${OP_PAY.days} days in a row, for ${SPADE} ${OP_PAY.shift} a shift, ${SPADE} ${OP_PAY.shiftOp} during an operation. Collect it all at the Town Hall after the last one. Miss a day and the contract ends with nothing paid. Nothing if the settlement falls.`,
      status: 'active', x: posts[0].x, z: posts[0].z, y: STREET_Y, posts, next: 0, k, told: now < k + OP_PAY.patrolStart ? undefined : k, walked: false, waiting: now < k + OP_PAY.patrolStart, streak: 0, earned: 0,
    };
    this.active.push(j);
    g.ui.toast(`Signed: ${j.title}`, 'good');
    g.audio.simple('crate');
    g.saveGame();
    return j;
  }

  // Three nights in a row near the wall, nine till five, with a quota for each. The first is always the next night to come. Nothing is paid until
  // the third is done, and then only over the table at the town hall, so it is worth exactly as much as the camp's chances of still being there.
  signNight(c) {
    const g = this.g, quota = this.nightQuota(c);
    const j = {
      id: this.nextId++, type: 'night', campId: c.id, title: `Night shift contract: ${c.name}`,
      desc: `${quota} infected near the walls of ${c.name} every night from nine till five, ${OP_PAY.nights} nights in a row, for ${SPADE} ${OP_PAY.shift} a shift, ${SPADE} ${OP_PAY.shiftOp} during an operation. Collect it all at the Town Hall after the last one. Miss a night and the contract ends with nothing paid. Nothing if the settlement falls.`,
      status: 'active', unmarked: true, x: c.cx, z: c.cz, y: STREET_Y, k: Math.floor(g.campSim.now() - OP_PAY.nightStart) + 1, shiftKills: 0, streak: 0, earned: 0, quota,
    };
    this.active.push(j);
    g.ui.toast(`Signed: ${j.title}`, 'good');
    g.audio.simple('crate');
    g.saveGame();
    return j;
  }

  nightKill(c) {
    const j = this.nightOf(c.id);
    if (!j || j.status !== 'active' || j.shiftDone || !this.onShift(j)) return;
    j.shiftKills++;
    if (j.shiftKills >= j.quota) this.completeNight(j, c);
  }

  // Quota met, shift done, and paid for. The last one means the money is ready now, not in the morning.
  completeNight(j, c) {
    j.shiftDone = true;
    j.streak++;
    j.earned += this.shiftPay(j.campId);
    if (j.streak >= OP_PAY.nights) { this.finishRun(j, c, 'Night shifts done'); return; }
    this.contractNote(c, `Night ${j.streak} of ${OP_PAY.nights} complete. Quota met, ${SPADE} ${j.earned.toLocaleString('en-US')} earned so far.`, 'good', '', ['Quota met', `Night ${j.streak} of ${OP_PAY.nights} done. ${SPADE} ${j.earned.toLocaleString('en-US')} earned so far.`]);
  }

  // The end of a night, or of several if you slept through them.
  endNights(j, now) {
    const g = this.g, c = g.layout.camps[j.campId];
    while (j.status === 'active' && now >= j.k + OP_PAY.nightStart + OP_PAY.nightLen) {
      // A save from before a shift ended on its quota.
      if (!j.shiftDone && j.shiftKills >= j.quota) this.completeNight(j, c);
      if (j.status !== 'active') return;
      if (!j.shiftDone) {
        this.breakRun(j, c, `You needed ${j.quota} on the night shift and got ${j.shiftKills}.`);
        return;
      }
      j.shiftDone = false;
      j.shiftKills = 0;
      j.k++;
    }
    if (j.status === 'active' && j.told !== j.k && this.onShift(j, now)) {
      j.told = j.k;
      this.contractNote(c, `Night ${j.streak + 1} of ${OP_PAY.nights} has started. Quota: ${j.quota} by 5 AM.`, '', '', [`Night shift ${j.streak + 1} of ${OP_PAY.nights}`, `Quota: ${j.quota} infected by 5 AM`]);
    }
  }

  // The four outside corners of the wall, in order round the camp, starting from whichever is nearest. You have to go out there to walk them.
  patrolPosts(c) {
    const g = this.g, P = g.player, L = g.layout, H = g.horde;
    const standable = (x, z) => {
      if (x < 4 || z < 4 || x >= WX - 4 || z >= WZ - 4 || H.inCamp(x, z, 8)) return false;
      const i = z * WX + x;
      return L.ground[i] !== G.WATER && !L.lot[i] && !L.lot[i + 1] && !L.lot[i - 1] && !L.lot[i + WX] && !L.lot[i - WX];
    };
    const corner = (cx, cz, sx, sz, name) => {
      // As near the corner as there is somewhere to stand, however the street happens to run there.
      for (let r = 0; r < 60; r += 2) for (let a = 0; a < 16; a++) {
        const x = Math.round(cx + sx * 12 + Math.cos(a * .3927) * r), z = Math.round(cz + sz * 12 + Math.sin(a * .3927) * r);
        if (standable(x, z)) return { x: x + .5, z: z + .5, name };
      }
      return { x: cx + sx * 12 + .5, z: cz + sz * 12 + .5, name };
    };
    const posts = [corner(c.x0, c.z0, -1, -1, 'North-west corner'), corner(c.x1, c.z0, 1, -1, 'North-east corner'), corner(c.x1, c.z1, 1, 1, 'South-east corner'), corner(c.x0, c.z1, -1, 1, 'South-west corner')];
    let first = 0;
    posts.forEach((p, k) => { if (Math.hypot(p.x - P.x, p.z - P.z) < Math.hypot(posts[first].x - P.x, posts[first].z - P.z)) first = k; });
    return posts.slice(first).concat(posts.slice(0, first));
  }

  walkPatrol(j, d) {
    const g = this.g;
    if (j.walked || j.waiting || d > 7) return;
    g.audio.simple('beep');
    j.next++;
    if (j.next < j.posts.length) {
      g.ui.toast(`${j.posts[j.next - 1].name} checked. Next: ${j.posts[j.next].name}.`);
    } else {
      j.next = 0;
      j.walked = true;
      j.streak++;
      j.earned += this.shiftPay(j.campId);
      if (j.streak >= OP_PAY.days) { this.finishRun(j, g.layout.camps[j.campId], 'Patrols done'); return; }
      this.contractNote(g.layout.camps[j.campId], `Patrol ${j.streak} of ${OP_PAY.days} complete. ${SPADE} ${j.earned.toLocaleString('en-US')} earned so far.`, 'good', '', ['Patrol complete', `Day ${j.streak} of ${OP_PAY.days}. ${SPADE} ${j.earned.toLocaleString('en-US')} earned so far.`]);
    }
    j.x = j.posts[j.next].x; j.z = j.posts[j.next].z;
  }

  // The turn of a patrol day, or of several if you slept through them.
  endPatrolDays(j, now) {
    const g = this.g, c = g.layout.camps[j.campId];
    while (j.status === 'active' && now >= j.k + 1 + OP_PAY.patrolStart) {
      if (!j.walked) { this.breakRun(j, c, `You missed a day's patrol at ${c.name}.`); return; }
      j.k++;
      j.walked = false;
      j.next = 0;
      j.x = j.posts[0].x; j.z = j.posts[0].z;
    }
    j.waiting = now < j.k + OP_PAY.patrolStart;
    if (j.status === 'active' && !j.waiting && !j.walked && j.told !== j.k) {
      j.told = j.k;
      this.contractNote(c, `Patrol ${j.streak + 1} of ${OP_PAY.days} has started. Check all ${j.posts.length} corners by 5 AM.`, '', '', [`Patrol ${j.streak + 1} of ${OP_PAY.days}`, `Check all ${j.posts.length} corners by 5 AM`]);
    }
  }

  // How many they need from you by the end of this day of the operation. Signing partway through a day only asks for the part you were there for.
  quotaDue(j, op, until) {
    return Math.floor((j.quota * Math.max(0, Math.min(1, until - j.dayFrom)) + .5) / 10) * 10;
  }

  // A missed quota costs you. Twice they dock it and let you carry on. The third time they tear it up, and nothing on it gets paid.
  missedQuota(j, c, op, missed, day) {
    const g = this.g, rule = DOCK[c.key] || { why: '' };
    j.misses = (j.misses || 0) + 1;
    g.dialogue.addStanding(c.id, -2);
    g.audio.simple('beep');
    if (j.misses >= OP_PAY.strikes) {
      j.plan = 'commission';
      j.void = true;
      j.vKills = 0;
      j.dock = 1;
      j.title = `Commission: Operation ${op.name}`;
      j.desc = `Your operation contract at ${c.name} was torn up. From here on it is ${SPADE} ${OP_PAY.commission} a kill like anyone else, paid at the Town Hall if the operation succeeds.`;
      this.contractNote(c, `Contract ended. That is ${OP_PAY.strikes} missed quotas on Operation ${op.name}, and everything earned on it is gone.`, 'bad', `Operation ${op.name} contract failed`);
      return;
    }
    j.dock = (j.dock ?? 1) * this.dockRate(c);
    const left = OP_PAY.strikes - j.misses;
    this.contractNote(c, `Quota missed: you needed ${missed.toLocaleString('en-US')} on day ${day}. ${rule.why} This contract now pays ${Math.max(1, Math.round(j.dock * 100))}% of what it earns. ${left === 1 ? 'One more and you are off it.' : `${left} more and you are off it.`}`, 'bad');
  }

  // The turn of each day of an operation, and of each shift.
  opTick(c, op, now) {
    const j = this.opJob(c.id);
    if (!j || j.pending || j.plan !== 'vanguard') return;
    const day = Math.floor(now - op.start);
    if (day === j.day) return;
    const need = this.quotaDue(j, op, op.start + j.day + 1);
    if (j.dayKills < need) this.missedQuota(j, c, op, need, j.day + 1);
    j.day = day;
    j.dayFrom = op.start + day;
    j.dayKills = 0;
    j.dayMet = false;
    if (j.plan === 'vanguard') {
      const d = this.g.campSim.opDayOf(op, now);
      this.contractNote(c, `${d.text} of Operation ${op.name} has started${d.over ? ', past the length it was meant to be. An early payout is open at the Town Hall, at a cut, once today\'s quota is met' : ''}. Quota: ${j.quota.toLocaleString('en-US')}.`, d.over ? 'warn' : '', '', [`${d.text} of Operation ${op.name}`, `Quota: ${j.quota.toLocaleString('en-US')}${d.over ? '. Early payout open at the Town Hall' : ''}`]);
    }
  }

  // It held. Whatever day that happened on, the job is done: a day cut short by winning is not a day you missed.
  opWon(c, op) {
    const g = this.g, j = this.opJob(c.id);
    if (!j) return 0;
    this.active.splice(this.active.indexOf(j), 1);
    g.stats.ops = (g.stats.ops || 0) + 1;
    const kills = (j.kills || 0) + (j.vKills || 0), pay = this.opPay(j), full = this.opFullPay(j);
    this.lastOpFull = full;
    // It takes a real part in it to change how long the place has left.
    if (kills >= DEFEND_REAL_HELP) g.director.defended(c);
    if (!pay) return 0;
    // The camp owes you now. You collect it at the town hall, in person, and if the place goes first then so does what it owed you.
    const who = g.campSim.state[c.id].clerkName || 'the clerk';
    // One box for each operation, so the title can say which.
    let owed = this.active.find((a) => a.type === 'defended' && a.campId === c.id && a.op === op.name);
    if (!owed) {
      owed = { id: this.nextId++, type: 'defended', campId: c.id, status: 'done', kills: 0, reward: 0, op: op.name, giver: who, title: `Collect pay for Operation ${op.name}`, x: c.clerk.x, z: c.clerk.z, y: STREET_Y };
      this.active.push(owed);
    }
    owed.kills += kills;
    owed.fullPay = (owed.fullPay ?? owed.reward) + full;
    owed.reward += pay;
    owed.desc = `Operation ${op.name} succeeded. The Town Hall at ${c.name} has your pay, for as long as there is a ${c.name}.${owed.reward < owed.fullPay ? ` Missed quotas docked it from ${SPADE} ${owed.fullPay.toLocaleString('en-US')} to ${SPADE} ${owed.reward.toLocaleString('en-US')}.` : ''}`;
    return pay;
  }

  // Nothing is owed by a place that is not there any more. Patrol wages already paid are yours to keep.
  opLost(c, op) {
    const g = this.g, j = this.opJob(c.id);
    if (!j) return 0;
    this.active.splice(this.active.indexOf(j), 1);
    g.stats.ops = (g.stats.ops || 0) + 1;
    const lost = this.opPay(j);
    if (lost) g.ui.toast(`Operation ${op.name} failed. The ${SPADE} ${lost.toLocaleString('en-US')} you had earned went with it.`, 'bad');
    return 0;
  }

  // Your first stop in a new game: the leader. They hand you one small job, a street to clear outside the gate, and the Town Hall pays
  // it. Only after that does the Town Hall put you on its books for commissions and contracts.
  startVisit(c) {
    if (!c.clerk || this.active.some((a) => a.type === 'visit')) return;
    const P = this.g.player, lead = LORE[c.key].cast.find((m) => m.role === 'leader');
    P.dlg.flags.introStarted = c.id;
    this.active.push({ id: this.nextId++, type: 'visit', leader: true, campId: c.id, title: `Talk to ${lead ? lead.name : 'the leader'}`, desc: `${lead ? lead.name : 'The leader'} runs ${c.name}. Go and introduce yourself.`, reward: 0, status: 'active', x: c.boss.x + .5, z: c.boss.z + .5, y: STREET_Y });
  }

  // Done the leader's job, or never had to (a save from before there was one).
  introDone() {
    const f = this.g.player.dlg.flags;
    return !!f.introDone || f.introStarted === undefined;
  }

  // The leader's job: a few of them, just outside the nearest gate, paid at the Town Hall.
  leaderJob(c) {
    const q = c.gates[0], ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
    const x = Math.floor(q.cx + ox * 50), z = Math.floor(q.cz + oz * 50), need = 15, side = { N: 'north', S: 'south', E: 'east', W: 'west' }[q.side];
    const job = { id: this.nextId++, type: 'kill', intro: true, title: 'Clear the approach', need, got: 0, reward: 50, bonus: 'bandage', side,
      desc: `Put down ${need} infected. Out past the ${side} gate is the place to find them. Then collect your pay at the Town Hall.`, x, z, y: STREET_Y, campId: c.id, status: 'active', where: 'the gate' };
    this.active.push(job);
    return job;
  }

  visited() {
    const i = this.active.findIndex((a) => a.type === 'visit');
    if (i >= 0) this.active.splice(i, 1);
  }

  // What the town hall can settle up with you. Pay for an operation only ever comes from that camp's own clerk.
  reportsFor(n) {
    if (n.kind !== 'clerk') return [];
    return this.active.filter((a) => a.status === 'done' && !a.favour && a.campId === n.camp);
  }

  payFavour(key) {
    const g = this.g, P = g.player;
    const j = this.active.find((a) => a.favour === key);
    P.dlg.flags[`${key}_paid`] = 1;
    if (!j) return null;
    this.active.splice(this.active.indexOf(j), 1);
    P.scrip += j.reward;
    P.rep = Math.min(100, P.rep + 3);
    const out = [`${j.reward} spades`];
    if (j.bonus) { const n = ITEMS[j.bonus].bundle || 1; P.gain(j.bonus, n); out.push(`${n} ${ITEMS[j.bonus].name}`); }
    g.stats.jobs++;
    g.audio.simple('coin');
    return out;
  }

  turnIn(job) {
    const g = this.g, P = g.player, stood = job.type === 'defended';
    if (job.intro) P.dlg.flags.introDone = true;
    P.scrip += job.reward;
    // People remember how much you did.
    P.rep = Math.min(100, P.rep + (stood ? (job.kills >= 25 ? 3 : 1) : 2));
    g.dialogue.addStanding(job.campId, stood ? Math.min(12, Math.ceil(job.kills / 8)) : 6);
    let text = `+${job.reward} spades`;
    if (job.fullPay > job.reward) text += `, docked from ${job.fullPay.toLocaleString('en-US')}`;
    if (job.bonus) {
      const count = ITEMS[job.bonus].bundle ? ITEMS[job.bonus].bundle : 1;
      P.gain(job.bonus, count);
      text += `, ${count}x ${ITEMS[job.bonus].name}`;
    }
    this.active.splice(this.active.indexOf(job), 1);
    g.stats.jobs++;
    g.audio.simple('coin');
    g.ui.toast(`Commission complete: ${text}`, 'good');
  }

  // Anyone's kill counts, the patrols' as much as yours. The block does not care who cleared it.
  onKill(x, z) {
    for (const j of this.active) {
      // The leader's first job is any of them, anywhere: the gate it points you at is only where they are easiest to find.
      if (j.type === 'kill' && j.status === 'active' && (j.intro || Math.hypot(x - j.x, z - j.z) < 70)) {
        j.got++;
        if (j.got >= j.need) this.finish(j);
      }
    }
  }

  onRaiderKilled(n) {
    if (!n.bounty) return;
    const j = this.active.find((a) => a.id === n.bounty);
    if (!j || j.status !== 'active') return;
    j.left = Math.max(0, j.left - 1);
    if (j.left <= 0) this.finish(j);
  }

  finish(j) {
    j.status = 'done';
    if (j.favour) {
      this.g.player.dlg.flags[`${j.favour}_done`] = 1;
      this.g.ui.banner('Objective complete', `${j.title}: return to ${j.giver} at ${this.g.layout.camps[j.campId].name}.`);
    } else {
      const c = this.g.layout.camps[j.campId];
      if (c.clerk) { j.x = c.clerk.x; j.z = c.clerk.z; }
      this.g.ui.banner('Objective complete', `${j.title}: return to the ${c.name} Town Hall for payment.`);
    }
    this.g.audio.simple('coin');
    this.refreshCrowds();
  }

  update(dt) {
    const g = this.g, P = g.player, H = g.horde;
    for (const j of this.active.slice()) {
      if (j.status !== 'active') continue;
      const d = Math.hypot(P.x - j.x, P.z - j.z);
      if (j.type === 'defend') continue;
      if (j.type === 'night') { this.endNights(j, g.campSim.now()); continue; }
      if (j.type === 'patrol') {
        this.endPatrolDays(j, g.campSim.now());
        if (j.status === 'active') this.walkPatrol(j, Math.hypot(P.x - j.x, P.z - j.z));
        continue;
      }
      if (j.type === 'migrate') {
        const to = g.layout.camps[j.campId];
        if (g.campSim.state[to.id].status !== 'holding') {
          // It went while you were on your way. The road goes on.
          const next = g.campSim.refugeFor(to), from = g.layout.camps[j.fromId];
          this.active.splice(this.active.indexOf(j), 1);
          if (next) { this.startMigrate(from, next, j.escort); g.ui.banner(`${to.name} is gone too`, `Keep walking. Next is ${next.name}.`); }
        } else if (j.escort && H.campAt(P.x, P.z, 6) && H.inCamp(P.x, P.z, 6) === to) {
          // You brought them in. The Town Hall pays out, like any other job.
          j.status = 'done';
          if (to.clerk) { j.x = to.clerk.x; j.z = to.clerk.z; }
          P.discovered[to.id] = true;
          g.ui.banner(`${g.layout.camps[j.fromId].name}'s people are safe`, `Collect your pay at the ${to.name} Town Hall.`);
          g.audio.simple('coin');
        } else if (!j.escort && H.campAt(P.x, P.z, 6) && H.inCamp(P.x, P.z, 6) === to) {
          this.active.splice(this.active.indexOf(j), 1);
          P.discovered[to.id] = true;
          g.ui.banner(`You made it to ${to.name}`, g.npcs.admitted(to.id) ? 'The Town Hall can put your name down, if you want a place here.' : `They want ${g.npcs.citizenFee(to.id).toLocaleString('en-US')} spades at the gate. Their patrols sell papers.`);
          g.audio.simple('coin');
        }
        continue;
      }
      // Nothing left on the block? Something will come. The dead move into wherever has gone quiet.
      if (j.type === 'kill' && (j.crowdT = (j.crowdT || 0) - dt) <= 0) {
        j.crowdT = 7;
        const left = j.need - j.got;
        H.ensurePop(j.x, j.z, left * 1.2);
        if (d < 240) {
          let here = 0;
          H.forRadius(j.x, j.z, 70, () => { here++; });
          if (here < Math.min(left + 5, 28)) {
            H.setMigrationTarget(`job${j.id}`, j.x, j.z, 40);
            H.sendMigrants(j.x, j.z, Math.max(6, Math.min(26, left - here + 8)), 90, 170);
          }
        }
      }
      if (j.type === 'bounty' && !j.spawned && d < 200) {
        for (let t = 0; t < 40 && !j.spawned; t++) {
          const a = rand() * 6.283, r = t * .6;
          const got = g.npcs.addGang(Math.floor(j.x + Math.cos(a) * r), Math.floor(j.z + Math.sin(a) * r), j.left, j.id);
          // Holed up in a building: the marker goes to their door, not the street they were last seen on.
          if (got) { j.spawned = true; if (got.cx !== undefined) { j.x = got.cx; j.z = got.cz; } }
        }
      }
      if (j.type === 'hold' && d < 16) {
        j.held += dt;
        j.pulse = (j.pulse || 0) - dt;
        if (j.pulse <= 0) {
          j.pulse = 4;
          g.horde.noise(j.x, j.z, 110, .8);
          g.audio.simple('beep', j.x, STREET_Y + 2, j.z);
        }
        if (j.held >= j.time) this.finish(j);
      }
    }
  }

  nearObjective(x, y, z) {
    for (const j of this.active) {
      if (j.type === 'fetch' && j.status === 'active' && Math.hypot(x - j.x, z - j.z) < 3.4) return { job: j, label: j.favour ? `Take: ${j.title}` : 'Collect the supply cache' };
    }
    return null;
  }

  collect(job) {
    this.finish(job);
  }

  toSave() {
    return { active: this.active, nextId: this.nextId };
  }

  fromSave(s) {
    if (!s) return;
    this.active = s.active || [];
    for (const j of this.active) if (j.type === 'bounty') j.spawned = false;
    this.nextId = s.nextId || 1;
    // A save from before the town halls: whatever was owed moves there, and a defence under way becomes the commission it would be now.
    const sim = this.g.campSim, camps = this.g.layout.camps;
    for (const j of this.active.slice()) {
      const c = camps[j.campId];
      if (j.type === 'defended' && c.clerk) {
        j.x = c.clerk.x; j.z = c.clerk.z;
        // A save from before these named their operation: the description still does.
        const named = j.op || ((j.desc || '').match(/^Operation (\S+) succeeded/) || [])[1];
        if (named) j.op = named;
        j.title = named ? `Collect pay for Operation ${named}` : 'Collect pay for Operation';
      }
      if (j.type === 'night' && j.status === 'done') j.title = 'Collect pay for Night shift';
      if (j.type === 'patrol' && j.status === 'done') j.title = 'Collect pay for Patrol';
      if (j.type === 'defend' && j.plan === 'patrol') {
        j.type = 'patrol';
        j.title = `Patrol contract: ${c.name}`;
      }
      if (j.type === 'clearing') {
        j.type = 'night';
        j.title = `Night shift contract: ${c.name}`;
        j.quota = this.nightQuota(c);
        j.k = Math.floor(this.g.day + this.g.tod - OP_PAY.nightStart) + 1;
        j.shiftKills = 0; j.streak = 0; j.earned = 0;
        j.desc = `${j.quota} infected near the walls of ${c.name} every night from nine till five, ${OP_PAY.nights} nights in a row, for ${SPADE} ${OP_PAY.shift} a shift, ${SPADE} ${OP_PAY.shiftOp} during an operation. Collect it all at the Town Hall after the last one. Miss a night and the contract ends with nothing paid. Nothing if the settlement falls.`;
      }
      // Patrols signed on the old terms start fresh on the new ones. Anything they already paid out stays paid.
      if (j.type === 'patrol' && j.k === undefined) {
        j.posts = this.patrolPosts(c);
        j.next = 0;
        j.x = j.posts[0].x; j.z = j.posts[0].z;
        j.k = Math.floor(this.g.day + this.g.tod - OP_PAY.patrolStart);
        j.walked = false; j.waiting = false; j.streak = 0; j.earned = 0;
        j.desc = `Check the ${j.posts.length} corners outside the wall of ${c.name} once a day, ${OP_PAY.days} days in a row, for ${SPADE} ${OP_PAY.shift} a shift, ${SPADE} ${OP_PAY.shiftOp} during an operation. Collect it all at the Town Hall after the last one. Miss a day and the contract ends with nothing paid. Nothing if the settlement falls.`;
      }
      if (j.type === 'defend' && j.plan === 'vanguard') {
        j.title = j.title.replace('Vanguard contract: ', '').replace('Operation contract: ', 'Operation ');
        if (j.dock === undefined) j.dock = 1;
      }
      if (j.type === 'defend' && !j.plan) {
        const op = sim.state[j.campId].op || (sim.state[j.campId].status === 'holding' ? sim.openOp(c, sim.state[j.campId], true) : null);
        if (!op) { this.active.splice(this.active.indexOf(j), 1); continue; }
        j.plan = 'commission'; j.op = op.name; j.vKills = 0; j.title = `Commission: Operation ${op.name}`;
        j.desc = `${SPADE} ${OP_PAY.commission} for every infected you put down near the walls of ${c.name}, paid at the Town Hall when the operation succeeds.`;
      }
    }
    this.refreshCrowds();
  }
}
