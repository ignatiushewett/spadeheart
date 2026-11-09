// Item catalogue, loot tables and vendor stock. No levels and no XP: your power is what you carry.
import { M } from '../shared/materials.js';

export const ITEMS = {
  // Melee and tools
  crowbar: { name: 'Crowbar', type: 'melee', value: 45, weight: 3, dmg: 42, rate: .78, range: 4.1, cleave: 1, blockDmg: 3, desc: 'Opens barricades, skulls and most arguments.' },
  axe: { name: 'Fire Axe', type: 'melee', value: 150, weight: 5, dmg: 85, rate: 1.1, range: 4.5, cleave: 3, blockDmg: 5, desc: 'Off the wall of FDNY Engine 7.' },
  sledge: { name: 'Sledgehammer', type: 'melee', value: 240, weight: 8, dmg: 110, rate: 1.55, range: 4.7, cleave: 5, blockDmg: 16, desc: 'The best tool in town for rearranging walls.' },
  // Guns
  pistol: { name: '9mm Pistol', type: 'gun', ammo: 'ammo_pistol', value: 160, weight: 2, dmg: 30, rate: .17, mag: 15, reload: 1.2, spread: .011, kick: .013, range: 170, pierce: 1, noise: 80, blockDmg: 1, sound: 'pistol', desc: 'Sidearm from a dead cop. Reliable.' },
  revolver: { name: '.357 Revolver', type: 'gun', ammo: 'ammo_pistol', value: 320, weight: 3, dmg: 78, rate: .44, mag: 6, reload: 2.1, cylinder: { open: .5, each: .26, close: .32 }, spread: .006, kick: .036, range: 200, pierce: 2, noise: 110, blockDmg: 2, sound: 'magnum', desc: 'Loud, slow, final.' },
  smg: { name: 'MP5 SMG', type: 'gun', ammo: 'ammo_pistol', auto: true, value: 520, weight: 4, dmg: 22, rate: .075, mag: 30, reload: 1.9, spread: .02, kick: .009, range: 150, pierce: 1, noise: 90, blockDmg: 1, sound: 'smg', desc: 'ESU issue. Burns ammo quickly.' },
  shotgun: { name: 'Pump Shotgun', type: 'gun', ammo: 'ammo_shell', value: 440, weight: 6, dmg: 19, pellets: 10, rate: .85, mag: 7, reload: .5, perShell: true, spread: .055, kick: .05, range: 70, pierce: 2, noise: 130, blockDmg: 1, sound: 'shotgun', desc: 'Clears a doorway. Wakes the block.' },
  rifle: { name: 'M4 Carbine', type: 'gun', ammo: 'ammo_rifle', auto: true, value: 980, weight: 6, dmg: 38, rate: .095, mag: 30, reload: 2.2, spread: .012, kick: .012, range: 320, pierce: 3, noise: 150, blockDmg: 2, sound: 'rifle', desc: 'National Guard surplus, as of this spring.' },
  hunting: { name: 'Scoped Rifle', type: 'gun', ammo: 'ammo_rifle', value: 760, weight: 7, dmg: 170, rate: 1.05, mag: 5, reload: 2.6, spread: .001, kick: .06, range: 500, pierce: 7, noise: 170, blockDmg: 5, scope: true, sound: 'sniper', desc: 'One round through a whole conga line.' },
  lmg: { name: 'M249 LMG', type: 'gun', ammo: 'ammo_rifle', auto: true, value: 2100, weight: 14, dmg: 34, rate: .08, mag: 100, reload: 4.2, spread: .026, kick: .013, range: 300, pierce: 3, noise: 180, blockDmg: 2, sound: 'rifle', desc: 'For when the street is the target.' },
  rocket: { name: 'M72 Launcher', type: 'gun', ammo: 'ammo_rocket', value: 2800, weight: 12, dmg: 0, rate: 1.5, mag: 1, reload: 2.7, spread: .002, kick: .08, range: 400, pierce: 0, noise: 400, blockDmg: 0, projectile: 'rocket', sound: 'rocket', desc: 'Everything you always wanted to do to Midtown.' },
  // Throwables
  grenade: { name: 'Frag Grenade', type: 'throw', value: 70, weight: 1, fuse: 2.6, radius: 4.2, strength: 22, dmg: 340, desc: 'Cook it, throw it, cover your ears.' },
  dynamite: { name: 'Demolition Charge', type: 'throw', value: 140, weight: 2, fuse: 4.5, radius: 7.5, strength: 60, dmg: 600, sticky: true, desc: 'Sticks to walls. Take out enough columns and the building comes with it.' },
  // Building
  block_wood: { name: 'Planks', type: 'block', mat: M.BLOCK_WOOD, value: 1, weight: .01, stack: true, bundle: 20, desc: 'Place to barricade a doorway. Weak.' },
  block_conc: { name: 'Cinder Blocks', type: 'block', mat: M.BLOCK_CONC, value: 1, weight: .02, stack: true, bundle: 20, desc: 'Solid. Takes real work to chew through.' },
  block_steel: { name: 'Steel Plates', type: 'block', mat: M.BLOCK_STEEL, value: 3, weight: .03, stack: true, bundle: 10, desc: 'The zombies will get bored first.' },
  // Ammunition
  ammo_pistol: { name: 'Pistol Rounds', type: 'ammo', value: 1, weight: .02, stack: true, bundle: 24, desc: 'Fits the 9mm, .357 and MP5.' },
  ammo_shell: { name: '12ga Shells', type: 'ammo', value: 3, weight: .04, stack: true, bundle: 8, desc: 'Double-aught.' },
  ammo_rifle: { name: 'Rifle Rounds', type: 'ammo', value: 2, weight: .03, stack: true, bundle: 30, desc: '5.56, mostly.' },
  ammo_rocket: { name: 'Rocket', type: 'ammo', value: 180, weight: 2, stack: true, bundle: 1, desc: 'Do not stand behind this.' },
  // Medicine and food
  bandage: { name: 'Bandage', type: 'med', heal: 18, value: 12, weight: .1, stack: true, desc: 'Stops the worst of it. +18 health.' },
  medkit: { name: 'Trauma Kit', type: 'med', heal: 60, value: 60, weight: .6, stack: true, desc: 'Proper field dressing. +60 health.' },
  sleeping_pills: { name: 'Sleeping Pills', type: 'med', sedative: true, value: 42, weight: .05, stack: true, desc: 'Take one before you lie down. You will sleep through the siren and most of what sets it off, and only wake if the settlement is really going under.' },
  antibiotic: { name: 'Antibiotics', type: 'med', cure: 55, value: 75, weight: .1, stack: true, desc: 'Pushes infection back by 55%.' },
  stim: { name: 'Adrenaline Shot', type: 'med', heal: 15, stim: 30, value: 90, weight: .1, stack: true, desc: 'Thirty seconds of unlimited sprint.' },
  beans: { name: 'Canned Beans', type: 'food', heal: 9, food: 45, value: 6, weight: .3, stack: true, desc: 'Cold, but filling. +9 health.' },
  water: { name: 'Bottled Water', type: 'food', heal: 5, food: 15, value: 4, weight: .3, stack: true, desc: 'Not from the taps. +5 health.' },
  whiskey: { name: 'Rye Whiskey', type: 'food', heal: 12, food: 5, value: 18, weight: .6, stack: true, desc: 'Cures nothing. +12 health.' },
  // Armour
  jacket: { name: 'Leather Jacket', type: 'armor', armor: .14, value: 90, weight: 3, desc: 'Bites have to work for it. 14% protection.' },
  riot: { name: 'Riot Gear', type: 'armor', armor: .3, value: 420, weight: 7, desc: 'NYPD surplus. 30% protection.' },
  tactical: { name: 'Plate Carrier', type: 'armor', armor: .45, value: 1200, weight: 10, desc: 'Guard issue with ceramic plates. 45% protection.' },
  // Upgrades
  flashlight: { name: 'Flashlight', type: 'tool', value: 38, weight: .4, desc: 'Press F to switch it on. Batteries are the least of your problems.' },
  backpack: { name: 'Hiking Pack', type: 'pack', carry: 40, value: 200, weight: 1, desc: 'Adds 40 carry capacity while you own it.' },
  // Junk, valuable only to traders
  scrap: { name: 'Scrap Metal', type: 'junk', value: 5, weight: .8, stack: true, desc: 'Scrap merchants pay well.' },
  parts: { name: 'Electronics', type: 'junk', value: 14, weight: .4, stack: true, desc: 'Radios, boards, batteries.' },
  cloth: { name: 'Clean Cloth', type: 'junk', value: 3, weight: .2, stack: true, desc: 'Good for bandages.' },
  smokes: { name: 'Cigarettes', type: 'junk', value: 11, weight: .05, stack: true, desc: 'Close enough to money.' },
  jewelry: { name: 'Jewelry', type: 'junk', value: 34, weight: .05, stack: true, desc: 'From 47th Street. Worth less every day.' },
  papers_bryant: { name: 'Bryant Park Papers', type: 'papers', value: 0, weight: .01, desc: 'Bought and stamped. Bryant Park Market opens its gates to you. Good until you die, and no use to anyone else.' },
  papers_union: { name: 'Fort Union Papers', type: 'papers', value: 0, weight: .01, desc: 'Bought and stamped. Fort Union opens its gates to you. Good until you die, and no use to anyone else.' },
  papers_sheep: { name: 'Sheep Meadow Papers', type: 'papers', value: 0, weight: .01, desc: 'Bought and stamped. Sheep Meadow Bastion opens its gates to you. Good until you die, and no use to anyone else.' },
  metrocard: { name: 'MetroCard', type: 'junk', value: 1, weight: .01, stack: true, desc: 'Insufficient fare.' },
};

export const WEAPON_ORDER = ['crowbar', 'axe', 'sledge', 'pistol', 'revolver', 'smg', 'shotgun', 'rifle', 'hunting', 'lmg', 'rocket', 'grenade', 'dynamite', 'block_wood', 'block_conc', 'block_steel'];

const pick = (table) => {
  let total = 0;
  for (const [, w] of table) total += w;
  let r = Math.random() * total;
  for (const [id, w, lo, hi] of table) {
    r -= w;
    if (r <= 0) return [id, lo === undefined ? 1 : lo + Math.floor(Math.random() * (hi - lo + 1))];
  }
  return null;
};

const SUPPLY = [
  ['beans', 12, 1, 2], ['water', 12, 1, 2], ['bandage', 9, 1, 2], ['cloth', 8, 1, 3], ['scrap', 12, 1, 4], ['parts', 6, 1, 2], ['smokes', 7, 1, 2],
  ['whiskey', 3], ['jewelry', 2], ['metrocard', 3], ['ammo_pistol', 16, 10, 28], ['ammo_shell', 10, 4, 10], ['ammo_rifle', 12, 10, 28], ['grenade', 1.2],
  ['block_wood', 16, 12, 36], ['block_conc', 12, 9, 24], ['block_steel', 3, 3, 9], ['medkit', 1.2], ['flashlight', 1], ['crowbar', .8], ['pistol', .6], ['jacket', .6], ['backpack', .25],
];
const MEDICAL = [
  ['bandage', 14, 1, 4], ['medkit', 7, 1, 2], ['antibiotic', 7, 1, 2], ['sleeping_pills', 3, 1, 2], ['stim', 2.5], ['water', 3, 1, 2],
];
const AMMO = [
  ['ammo_pistol', 12, 20, 54], ['ammo_shell', 8, 8, 20], ['ammo_rifle', 11, 20, 60], ['grenade', 3, 1, 2], ['dynamite', 1.4], ['ammo_rocket', .35],
  ['pistol', 1.2], ['revolver', .6], ['shotgun', .8], ['smg', .5], ['rifle', .4], ['hunting', .3], ['riot', .4], ['tactical', .08], ['lmg', .05], ['rocket', .03],
];
const TRUNK = [
  ['scrap', 8, 1, 3], ['parts', 5, 1, 2], ['water', 5, 1, 1], ['smokes', 4, 1, 2], ['ammo_pistol', 9, 8, 20], ['ammo_rifle', 6, 6, 18], ['ammo_shell', 4, 3, 8], ['crowbar', .7], ['block_wood', 10, 9, 24], ['block_steel', 5, 4, 10], ['jewelry', 1], ['bandage', 3],
];

// Rolls a container's contents as [{id,count}], plus spades.
export function rollLoot(id, lootMul = 1) {
  const table = id === M.CRATE_MED ? MEDICAL : id === M.CRATE_AMMO ? AMMO : id === M.TRUNK_LOOT ? TRUNK : SUPPLY;
  const rolls = Math.max(1, Math.round((1 + Math.random() * 2.3) * lootMul));
  const out = new Map();
  for (let i = 0; i < rolls; i++) {
    const r = pick(table);
    if (r) out.set(r[0], (out.get(r[0]) || 0) + r[1]);
  }
  const scrip = Math.random() < .42 ? Math.round((4 + Math.random() * 22) * lootMul) : 0;
  return { items: [...out].map(([k, count]) => ({ id: k, count })), scrip };
}

export function rollZombieDrop(lootMul = 1) {
  const r = Math.random() / lootMul;
  const n = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  if (r < .05) return { scrip: n(1, 7) };
  if (r < .065) return { id: 'smokes', count: 1 };
  // A lot of them died holding a gun.
  if (r < .125) return { id: 'ammo_pistol', count: n(4, 10) };
  if (r < .175) return { id: 'ammo_rifle', count: n(4, 10) };
  if (r < .205) return { id: 'ammo_shell', count: n(2, 5) };
  if (r < .22) return { id: 'cloth', count: 1 };
  if (r < .23) return { id: 'bandage', count: 1 };
  if (r < .235) return { id: 'jewelry', count: 1 };
  // Plenty of the rest were carrying something you can nail to something else.
  if (r < .31) return { id: 'block_wood', count: n(2, 5) };
  if (r < .35) return { id: 'block_conc', count: n(1, 3) };
  return null;
}

// Stock rebuilt each in-game day: [item, chance, min, max].
export const VENDOR_STOCK = {
  general: [['flashlight', .9, 1, 3], ['beans', 1, 4, 10], ['water', 1, 4, 10], ['bandage', 1, 3, 8], ['ammo_pistol', 1, 40, 120], ['ammo_shell', .8, 8, 24], ['block_wood', 1, 120, 300], ['block_conc', .8, 60, 180], ['crowbar', .9, 1, 1], ['grenade', .5, 1, 3], ['backpack', .4, 1, 1], ['jacket', .5, 1, 1], ['whiskey', .6, 1, 3], ['pistol', .6, 1, 1]],
  arms: [['ammo_pistol', 1, 80, 200], ['ammo_shell', 1, 24, 60], ['ammo_rifle', 1, 60, 180], ['ammo_rocket', .5, 1, 3], ['grenade', 1, 3, 8], ['dynamite', .9, 2, 5], ['pistol', 1, 1, 1], ['revolver', .8, 1, 1], ['shotgun', .9, 1, 1], ['smg', .7, 1, 1], ['rifle', .7, 1, 1], ['hunting', .6, 1, 1], ['lmg', .25, 1, 1], ['rocket', .2, 1, 1], ['riot', .6, 1, 1], ['tactical', .25, 1, 1], ['axe', .7, 1, 1], ['sledge', .7, 1, 1], ['block_steel', .7, 36, 120]],
  medic: [['sleeping_pills', .9, 2, 5], ['bandage', 1, 6, 14], ['medkit', 1, 2, 6], ['antibiotic', 1, 2, 6], ['stim', .8, 1, 4], ['water', 1, 4, 8], ['beans', .7, 2, 6]],
  food: [['beans', 1, 8, 24], ['water', 1, 8, 24], ['whiskey', .7, 2, 6], ['smokes', .6, 2, 8], ['bandage', .4, 2, 5]],
  builder: [['flashlight', .5, 1, 2], ['block_wood', 1, 240, 540], ['block_conc', 1, 180, 420], ['block_steel', 1, 60, 180], ['sledge', .7, 1, 1], ['axe', .7, 1, 1], ['crowbar', 1, 1, 2], ['dynamite', .5, 1, 3]],
  junk: [['flashlight', .7, 1, 2], ['block_wood', 1, 120, 300], ['block_conc', 1, 90, 240], ['block_steel', .8, 24, 72], ['sledge', .6, 1, 1], ['axe', .6, 1, 1], ['dynamite', .5, 1, 3], ['scrap', .7, 4, 12], ['parts', .5, 2, 6], ['backpack', .4, 1, 1]],
};

// What one trader has on the counter today. Every trader has a few lines they are known for (focus: picked once per trader, kept from day
// to day), which they always have and have plenty of; the rest of the trade they carry when they can get it, which is not always.
export function buildStock(role, focus = null) {
  const out = {};
  const list = VENDOR_STOCK[role] || [];
  for (const [id, chance, lo, hi] of list) {
    const known = focus && focus.includes(id);
    const p = known ? 1 : focus ? chance * .6 : chance;
    if (Math.random() >= p) continue;
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    out[id] = known && hi > 1 ? Math.round(n * 1.6) : n;
  }
  // A gun dealer with nothing to put in a gun is no gun dealer: there is always a box of something on the counter.
  if (role === 'arms' && !Object.keys(out).some((k) => k.startsWith('ammo_') && k !== 'ammo_rocket')) {
    const rows = list.filter((r) => r[0].startsWith('ammo_') && r[0] !== 'ammo_rocket');
    const r = rows[Math.floor(Math.random() * rows.length)];
    if (r) out[r[0]] = r[2] + Math.floor(Math.random() * (r[3] - r[2] + 1));
  }
  return out;
}

// The few lines a new trader of this kind specialises in, at random: one dealer is the shotgun man, another always has rifle rounds.
export function pickFocus(role) {
  const list = (VENDOR_STOCK[role] || []).map((r) => r[0]).sort(() => Math.random() - .5);
  return list.slice(0, Math.min(list.length, 3 + Math.floor(Math.random() * 3)));
}

// How you begin. Easy has everything from the first minute; the others have it to earn.
export const KITS = {
  veteran: { name: 'Easy', desc: 'Full kit from the start.' },
  regular: { name: 'Medium', desc: 'Basic gear from your faction.' },
  drifter: { name: 'Hard', desc: 'A crowbar and nothing else.' },
  survival: { name: 'Survival', desc: 'Garvey Yard, basic gear. No natural healing, and you need to eat. One life.' },
};
export const SURVIVAL_TIERS = ['Poor', 'Middling'];
// Where Survival begins: a modest camp with a lot of city around it, a long way from the strong ones.
export const START_CAMP = 'garvey';
// The strong camps only open their gates to people who have bought their way in, once, for life.
export const CITIZENSHIP = { bryant: 4500, union: 3500, sheep: 3000 };
export const papersFor = (campKey) => `papers_${campKey}`;
// What each faction can put in your hands. The poor ones make for the longest climb.
export const CAMP_START = {
  bryant: { tier: 'Wealthy', scrip: 220, items: [['crowbar', 1], ['pistol', 1], ['ammo_pistol', 60], ['jacket', 1], ['bandage', 3], ['beans', 2], ['block_wood', 30]] },
  battery: { tier: 'Middling', scrip: 120, items: [['crowbar', 1], ['shotgun', 1], ['ammo_shell', 12], ['bandage', 3], ['water', 2], ['block_wood', 30]] },
  wash: { tier: 'Poor', scrip: 70, items: [['crowbar', 1], ['pistol', 1], ['ammo_pistol', 24], ['bandage', 4], ['beans', 3], ['block_wood', 20]] },
  union: { tier: 'Strong', scrip: 120, items: [['crowbar', 1], ['rifle', 1], ['ammo_rifle', 60], ['jacket', 1], ['bandage', 3], ['beans', 2], ['block_conc', 20]] },
  sheep: { tier: 'Strong', scrip: 150, items: [['crowbar', 1], ['shotgun', 1], ['ammo_shell', 16], ['bandage', 3], ['beans', 6], ['water', 4], ['block_wood', 30]] },
  tompkins: { tier: 'Poor', scrip: 40, items: [['crowbar', 1], ['revolver', 1], ['ammo_pistol', 12], ['bandage', 2], ['smokes', 4], ['block_wood', 20]] },
  morning: { tier: 'Middling', scrip: 110, items: [['crowbar', 1], ['pistol', 1], ['ammo_pistol', 30], ['medkit', 3], ['bandage', 8], ['antibiotic', 2]] },
  garvey: { tier: 'Middling', scrip: 90, items: [['crowbar', 1], ['revolver', 1], ['ammo_pistol', 24], ['bandage', 3], ['beans', 3], ['block_wood', 24]] },
  tryon: { tier: 'Middling', scrip: 100, items: [['axe', 1], ['pistol', 1], ['ammo_pistol', 20], ['bandage', 3], ['water', 3], ['block_conc', 16]] },
};
export function startingGear(kit, campKey) {
  if (kit === 'survival') {
    // Whatever was lying by the bed: a crowbar or an axe, no telling which.
    const c = CAMP_START[campKey], melee = Math.random() < .5 ? 'crowbar' : 'axe';
    const items = c.items.filter(([id]) => id !== 'crowbar' && id !== 'axe');
    return { items: [[melee, 1], ...items, ['beans', 2]], scrip: c.scrip, standing: 10 };
  }
  if (kit === 'regular') { const c = CAMP_START[campKey]; return { items: c.items, scrip: c.scrip, standing: 10 }; }
  if (kit === 'drifter') return { items: [['crowbar', 1], ['bandage', 2], ['water', 1]], scrip: 25, standing: 0 };
  return {
    items: [['axe', 1], ['pistol', 1], ['rifle', 1], ['shotgun', 1], ['ammo_pistol', 90], ['ammo_rifle', 180], ['ammo_shell', 32], ['grenade', 4], ['dynamite', 2], ['riot', 1], ['backpack', 1], ['medkit', 3], ['bandage', 6], ['antibiotic', 2], ['stim', 1], ['water', 3], ['beans', 3], ['block_wood', 144], ['block_conc', 72], ['block_steel', 18]],
    scrip: 300, standing: 0,
  };
}
// Standing needed before a camp's traders will part with their best kit.
export const TRUST_LOCK = { smg: 5, shotgun: 5, revolver: 5, rifle: 10, hunting: 10, riot: 10, dynamite: 10, grenade: 5, lmg: 25, rocket: 25, ammo_rocket: 25, tactical: 25 };

export const RUMORS = [
  'Sound carries between the towers. Fire one shot on 42nd and half of Hell\'s Kitchen comes to see.',
  'Crates are worth checking on the lower floors. Pharmacies and offices got picked over last, up high.',
  'The Guard pulled out of the 34th Street checkpoints in a hurry. Trucks still have rounds in them.',
  'Walk, don\'t run. They mostly track you by the racket you make. Crouching helps.',
  'Night is worse. They move faster and see further, and it is hard to say why.',
  'A guy on Delancey brought a whole walk-up down with four charges. Took about sixty of them with it.',
  'Take the columns and the rest follows. A wall with nothing holding it up does not stay a wall.',
  'Someone is still running the generator for the Times Square signs. Nobody knows who.',
  'Plank up a stairwell and you can sleep. For a while. They chew through wood eventually.',
  'The piers on the Hudson are quiet. Water keeps them off, but they will wait on the shore.',
  'They say the Bastion in Sheep Meadow has fresh tomatoes. Actual tomatoes.',
  'If you get bitten, get antibiotics. It does not cure it, but it buys you time.',
  'I saw the Statue from the Battery yesterday. Torch was lit. Who is up there?',
  'Nobody crosses the bridges. The Army dropped the middle of every span the first week.',
  'Morningside still has doctors. Fort Tryon still has guns. Nobody has both.',
];

// New York, as it was: everyone who had come here from everywhere else, and whoever is left of them.
export const SURVIVOR_NAMES = [
  'Marcus', 'Dee', 'Ana', 'Tomasz', 'Priya', 'Leon', 'Yuki', 'Rosa', 'Sam', 'Ike', 'Noor', 'Gil', 'Fatima', 'Eddie', 'Mei', 'Darnell', 'Kasia', 'Hector', 'Jo', 'Ravi', 'Nadia', 'Otis', 'Lena', 'Vince',
  'Aaliyah', 'Abe', 'Adaeze', 'Adrian', 'Agnes', 'Ahmed', 'Aiko', 'Alba', 'Aleksei', 'Alma', 'Amara', 'Amir', 'Andre', 'Angelo', 'Anika', 'Anton', 'Arjun', 'Armando', 'Asha', 'Astrid', 'Aurelio', 'Ayesha',
  'Bao', 'Basil', 'Bea', 'Benji', 'Bernard', 'Bianca', 'Bilal', 'Birdie', 'Bo', 'Bohdan', 'Brigid', 'Bruno', 'Caleb', 'Camille', 'Carmen', 'Cass', 'Cedric', 'Celia', 'Chidi', 'Chloe', 'Cleo', 'Clyde', 'Colm', 'Connie', 'Corey', 'Cruz',
  'Dalia', 'Damian', 'Dana', 'Dante', 'Dao', 'Darius', 'Dariusz', 'Delia', 'Dembe', 'Desmond', 'Devi', 'Diego', 'Dimitri', 'Dolores', 'Dominic', 'Dorothy', 'Duc', 'Dwayne', 'Ebony', 'Edith', 'Efua', 'Elias', 'Elif', 'Elena', 'Emeka', 'Emil', 'Esther', 'Ezra',
  'Farah', 'Felix', 'Femi', 'Fern', 'Fiona', 'Flora', 'Frankie', 'Gabe', 'Gemma', 'Gideon', 'Gloria', 'Goran', 'Grace', 'Greta', 'Gus', 'Hana', 'Hank', 'Hassan', 'Hattie', 'Helen', 'Henrik', 'Hiro', 'Holly', 'Hugo', 'Hyun',
  'Ibrahim', 'Ida', 'Ilya', 'Imani', 'Inez', 'Ines', 'Irene', 'Isaac', 'Ivan', 'Ivy', 'Jada', 'Jamal', 'Janusz', 'Jasper', 'Javier', 'Jia', 'Jimmy', 'Joaquin', 'Joelle', 'Jonah', 'Josie', 'Juan', 'June', 'Junior',
  'Kai', 'Kamal', 'Kareem', 'Katya', 'Kavya', 'Keisha', 'Kelvin', 'Kenji', 'Khalid', 'Kofi', 'Kwame', 'Lamar', 'Lara', 'Lars', 'Leila', 'Leroy', 'Lian', 'Liam', 'Lily', 'Lin', 'Lionel', 'Lorenzo', 'Lou', 'Lucia', 'Luther', 'Lydia',
  'Mabel', 'Mads', 'Magda', 'Malik', 'Manny', 'Mara', 'Marisol', 'Marta', 'Mateo', 'Maya', 'Mehmet', 'Mila', 'Milo', 'Minh', 'Miriam', 'Moses', 'Musa', 'Nabil', 'Nasir', 'Nate', 'Neela', 'Nell', 'Nico', 'Nikolai', 'Nina', 'Nkechi', 'Nora',
  'Obi', 'Odessa', 'Olga', 'Olu', 'Omar', 'Oona', 'Orlando', 'Oscar', 'Pablo', 'Paolo', 'Paz', 'Pearl', 'Pedro', 'Petra', 'Pilar', 'Quentin', 'Quincy', 'Rafael', 'Rahul', 'Ramona', 'Rashid', 'Raquel', 'Reuben', 'Rhea', 'Rocco', 'Roman', 'Ruth',
  'Sabina', 'Sadie', 'Salim', 'Salma', 'Santiago', 'Sasha', 'Seamus', 'Selma', 'Sergei', 'Shanice', 'Silas', 'Simone', 'Sione', 'Sofia', 'Solomon', 'Soo', 'Stella', 'Sunil', 'Svetlana', 'Tai', 'Talia', 'Tamika', 'Tariq', 'Teddy', 'Tess', 'Thabo', 'Thea', 'Theo', 'Tobias', 'Trina', 'Tunde',
  'Uma', 'Uri', 'Valentina', 'Vera', 'Viktor', 'Vivian', 'Wade', 'Walt', 'Wanda', 'Wei', 'Wendell', 'Willa', 'Winston', 'Xavier', 'Xiomara', 'Yara', 'Yasmin', 'Yusuf', 'Yvonne', 'Zaid', 'Zainab', 'Zara', 'Zeke', 'Zofia', 'Zora',
];
export const SURVIVOR_SURNAMES = [
  'Abbott', 'Abreu', 'Acheampong', 'Adeyemi', 'Agarwal', 'Ahn', 'Ali', 'Alvarez', 'Amato', 'Andersen', 'Baker', 'Banerjee', 'Barnes', 'Bello', 'Berg', 'Bianchi', 'Bishop', 'Blum', 'Boateng', 'Brody', 'Burke',
  'Caban', 'Campbell', 'Cardona', 'Carter', 'Castillo', 'Chan', 'Chaudhry', 'Chen', 'Cho', 'Cohen', 'Colon', 'Conti', 'Cruz', 'Dang', 'Davis', 'DeLuca', 'Diallo', 'Diaz', 'Dolan', 'Dubois', 'Dunn', 'Duong',
  'Eze', 'Farrell', 'Feldman', 'Fernandez', 'Fitzgerald', 'Flores', 'Fofana', 'Franklin', 'Garcia', 'Gallagher', 'Goldberg', 'Gomez', 'Greene', 'Gupta', 'Haddad', 'Hall', 'Hayes', 'Herrera', 'Hoang', 'Horowitz', 'Hussain',
  'Ibrahim', 'Iyer', 'Jackson', 'Jankowski', 'Jean-Baptiste', 'Jenkins', 'Johnson', 'Jones', 'Kaplan', 'Katz', 'Kelly', 'Khan', 'Kim', 'Kowalski', 'Kumar', 'Lee', 'Levy', 'Li', 'Liu', 'Lombardi', 'Lopez', 'Lowe',
  'Madison', 'Mahmoud', 'Malone', 'Marino', 'Martinez', 'Mbeki', 'McCoy', 'Medina', 'Mendoza', 'Miller', 'Mitchell', 'Molina', 'Moreno', 'Murphy', 'Nakamura', 'Ndiaye', 'Nguyen', 'Novak', 'Nunez',
  "O'Brien", "O'Connor", 'Okafor', 'Okoye', 'Oliveira', 'Ortiz', 'Owens', 'Park', 'Patel', 'Pena', 'Perez', 'Petrov', 'Pierre', 'Popov', 'Quinn', 'Rahman', 'Ramirez', 'Reyes', 'Rivera', 'Robinson', 'Rodriguez', 'Rosen', 'Rossi', 'Russo',
  'Saito', 'Salazar', 'Sanchez', 'Santos', 'Schwartz', 'Shah', 'Sharma', 'Silva', 'Singh', 'Smith', 'Sokolov', 'Soto', 'Stein', 'Sullivan', 'Sun', 'Tanaka', 'Taylor', 'Thomas', 'Tran', 'Torres', 'Traore', 'Ventura', 'Vargas', 'Vega', 'Volkov',
  'Walker', 'Wang', 'Washington', 'Weiss', 'Williams', 'Wilson', 'Wong', 'Wu', 'Yang', 'Yoon', 'Young', 'Zapata', 'Zhang', 'Zielinski',
];
const SURVIVOR_NICKNAMES = ['Big', 'Little', 'Old', 'Doc', 'Sarge', 'Cowboy', 'Pops', 'Red', 'Slim', 'Ma', 'Teach', 'Coach'];

// Most people go by a first name out here. Some still use the whole thing, and a few got given something else.
export function randomName(full = false) {
  const first = SURVIVOR_NAMES[Math.floor(Math.random() * SURVIVOR_NAMES.length)];
  // Everyone you meet in passing goes by a first name. Only you get a surname.
  if (full) return `${first} ${SURVIVOR_SURNAMES[Math.floor(Math.random() * SURVIVOR_SURNAMES.length)]}`;
  return first;
}
