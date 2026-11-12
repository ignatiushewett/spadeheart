// First-person player: movement, voxel collision, weapons, inventory and vitals.
import { WATER_Y, WX, WZ } from '../shared/constants.js';
import { M, FLAGS, F_GLASS, isLoot, isBed } from '../shared/materials.js';
import { ITEMS, WEAPON_ORDER, startingGear } from './items.js';
import { clamp, damp } from '../engine/math.js';
import { SKIN_TONE_COUNT } from './viewmodel.js';

const R = .34;
const HEIGHT = 2.72, CROUCH_H = 1.8;
const EYE = 2.45, CROUCH_EYE = 1.5;
const rand = Math.random;
// Full to empty in about three in-game days.
const HUNGER_RATE = 100 / 4000;
// Rest runs down while you are awake: a full night's sleep lasts about a day and a half before you are running on nothing.
const REST_RATE = 100 / 2400;

export class Player {
  constructor(game) {
    this.g = game;
    this.reset();
  }

  reset() {
    this.skin = Math.floor(Math.random() * SKIN_TONE_COUNT);
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.crouch = false;
    this.height = HEIGHT;
    this.eye = EYE;
    this.eyeSmooth = 0;      // eases the camera over steps
    this.swim = false;
    this.health = 100;
    this.stamina = 100;
    this.infection = 0;
    this.hunger = 100;
    this.rest = 100;
    this.sedated = false;
    this.home = -1;
    this.stim = 0;
    this.scrip = 60;
    this.alive = true;
    this.inventory = {};
    this.mags = {};
    this.weapon = null;
    this.perks = {};   // the free things a contract buys, and the day each was last used
    this.armor = null;
    this.rep = 0;
    this.kills = 0;
    this.headshots = 0;
    this.voxelsBroken = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.fireCd = 0;
    this.reloadT = 0;
    this.swapT = 0;
    this.spread = 0;
    this.recoil = 0;
    this.kickY = 0;
    this.kickX = 0;
    this.ads = 0;
    this.aiming = false;
    this.flash = 0;
    this.hurtFlash = 0;
    this.shake = 0;
    this.swing = 0;
    this.hitStop = 0;
    this.cook = 0;
    this.flashlight = false;
    this.exposure = 1;
    this.skyVis = 1;
    this.lastHitT = 0;
    this.stepDist = 0;
    this.projectiles = [];
    this.fallPeak = 0;
    this.rayOut = [];
    this.highlight = null;
    this.placeColor = 0;
    this.discovered = {};
    this.campRep = {};
    this.grief = {};
    this.wanted = {};
    // Camps you owe bail to: 'in' if you did it inside their wall (they shoot), 'out' if it was outside (they only shut the gate).
    this.bail = {};
    this.dlg = { flags: {}, met: {}, day: {} };
    this.sanctuary = false;
    this.jobs = [];
    this.vmKick = 0;
  }

  // Arrive with nothing: the kit you would have started with is waiting with the camp's leader.
  holdKit(kit = 'veteran', campKey = 'bryant') {
    this.loadout = kit;
    this.pendingKit = { kit, campKey };
    this.scrip = 0;
    this.weapon = null;
  }

  // Something put into your hands: into the pack, and a line in the corner for it, the same as anything picked up off the street.
  gain(id, n = 1) {
    if (!n || !ITEMS[id]) return;
    this.add(id, n);
    this.g.ui.toast(`+${n} ${ITEMS[id].name}`);
  }

  // Handed over by the leader. What it was, for the message. Survival gets the gear but not the money.
  takeKit() {
    const k = this.pendingKit;
    if (!k) return [];
    this.pendingKit = null;
    const before = { ...this.inventory };
    this.giveStarterKit(k.kit, k.campKey);
    if (k.kit === 'survival') this.scrip = 0;
    // Said out loud, so short: the weapons by name, the rest in a word.
    const out = [];
    let rest = false;
    for (const id in this.inventory) {
      const n = this.inventory[id] - (before[id] || 0);
      if (n <= 0 || !ITEMS[id]) continue;
      this.g.ui.toast(`+${n} ${ITEMS[id].name}`);
      if (ITEMS[id].type === 'gun' || ITEMS[id].type === 'melee') out.push(`a${/^(?:[AEIOU]|M\d)/i.test(ITEMS[id].name) ? 'n' : ''} ${ITEMS[id].name}`);
      else rest = true;
    }
    if (rest) out.push('ammunition and supplies');
    if (this.scrip > 0) out.push(`${this.scrip} spades`);
    return out.length > 1 ? [`${out.slice(0, -1).join(', ')} and ${out[out.length - 1]}`] : out;
  }

  giveStarterKit(kit = 'veteran', campKey = 'bryant') {
    const gear = startingGear(kit, campKey);
    this.loadout = kit;
    for (const [id, n] of gear.items) this.add(id, n);
    // Everyone else has one to hand. In Survival it is something you go and find.
    if (kit !== 'survival') this.add('flashlight', 1);
    this.scrip = gear.scrip;
    for (const id of ['tactical', 'riot', 'jacket']) if (this.count(id)) { this.armor = id; break; }
    this.weapon = ['rifle', 'shotgun', 'pistol', 'revolver', 'axe', 'crowbar'].find((id) => this.count(id));
    for (const [id] of gear.items) if (ITEMS[id] && ITEMS[id].type === 'gun') this.mags[id] = Math.min(ITEMS[id].mag, this.count(ITEMS[id].ammo));
    for (const [id] of gear.items) if (ITEMS[id] && ITEMS[id].type === 'gun') this.remove(ITEMS[id].ammo, this.mags[id]);
  }

  // --- Inventory ---------------------------------------------------------------------------
  count(id) { return this.inventory[id] || 0; }

  add(id, n = 1) {
    const it = ITEMS[id];
    if (!it) return;
    this.inventory[id] = (this.inventory[id] || 0) + n;
    if (it.type === 'gun' && this.mags[id] === undefined) this.mags[id] = it.mag;
  }

  remove(id, n = 1) {
    const c = this.count(id);
    const r = Math.min(c, n);
    if (c - r <= 0) delete this.inventory[id]; else this.inventory[id] = c - r;
    if (this.count(id) === 0) {
      if (id === 'flashlight') this.flashlight = false;
      if (this.weapon === id) this.selectNext(1);
      if (this.armor === id) this.armor = null;
    }
    return r;
  }

  carryWeight() {
    let w = 0;
    for (const id in this.inventory) w += (ITEMS[id]?.weight || 0) * this.inventory[id];
    return w;
  }

  // B cycles through whatever building materials you have.
  selectBlocks() {
    const kinds = ['block_wood', 'block_conc', 'block_steel'].filter((id) => this.count(id));
    if (!kinds.length) { this.g.ui.toast('No building materials'); return; }
    const i = kinds.indexOf(this.weapon);
    this.selectWeapon(kinds[(i + 1) % kinds.length]);
  }

  carryCap() { return 70 + (this.count('backpack') ? ITEMS.backpack.carry : 0); }

  weapons() {
    return WEAPON_ORDER.filter((id) => this.count(id) > 0);
  }

  selectWeapon(id) {
    if (this.weapon === id || !this.count(id)) return;
    this.weapon = id;
    this.swapT = .3;
    this.reloadT = 0;
    this.cook = 0;
    this.g.audio.simple('click');
    this.g.ui.hudDirty = true;
  }

  selectIndex(i) {
    const list = this.weapons();
    if (list[i]) this.selectWeapon(list[i]);
  }

  selectNext(dir) {
    const list = this.weapons();
    if (!list.length) { this.weapon = null; return; }
    const i = list.indexOf(this.weapon);
    this.selectWeapon(list[(i + dir + list.length) % list.length]);
    if (!this.count(this.weapon)) this.weapon = list[0];
  }

  useItem(id) {
    const it = ITEMS[id];
    if (!it || !this.count(id)) return false;
    if (it.type === 'tool') { this.toggleFlashlight(); return true; }
    if (it.type === 'armor') {
      this.armor = this.armor === id ? null : id;
      this.g.audio.simple('crate');
      return true;
    }
    if (it.sedative) {
      if (this.sedated) { this.g.ui.toast('You have already taken one. Find a bed.'); return true; }
      this.sedated = true;
      this.remove(id, 1);
      this.g.audio.simple('pickup');
      this.g.ui.toast('You take a pill. Your next sleep will be a deep one.');
      return true;
    }
    if (it.type === 'med' || it.type === 'food') {
      if (it.heal) this.health = Math.min(100, this.health + it.heal);
      if (it.food) this.hunger = Math.min(100, this.hunger + it.food);
      if (it.cure) this.infection = Math.max(0, this.infection - it.cure);
      if (it.stim) this.stim = it.stim;
      this.remove(id, 1);
      this.g.audio.simple('pickup');
      return true;
    }
    if (it.type === 'gun' || it.type === 'melee' || it.type === 'throw' || it.type === 'block') {
      this.selectWeapon(id);
      return true;
    }
    return false;
  }

  toggleFlashlight() {
    if (!this.count('flashlight')) { this.g.ui.toast('You have no flashlight. Traders sell them.'); return; }
    this.flashlight = !this.flashlight;
    this.g.audio.simple('click');
  }

  quickHeal() {
    for (const id of ['medkit', 'bandage', 'beans', 'water']) {
      if (this.count(id) && this.health < 100) {
        this.useItem(id);
        this.g.ui.toast(`Used ${ITEMS[id].name}`);
        return;
      }
    }
    if (this.health < 100) { this.g.ui.toast('Nothing to heal with'); return; }
    if (this.loadout === 'survival' && this.hunger < 70) {
      const food = ['beans', 'water', 'whiskey'].find((id) => this.count(id));
      if (food) { this.useItem(food); this.g.ui.toast(`Ate ${ITEMS[food].name}`); }
      else this.g.ui.toast('Nothing to eat');
    }
  }

  // --- Movement -----------------------------------------------------------------------------------
  collides(x, y, z, h) {
    const w = this.g.world;
    const x0 = Math.floor(x - R), x1 = Math.floor(x + R), z0 = Math.floor(z - R), z1 = Math.floor(z + R);
    const y0 = Math.floor(y), y1 = Math.floor(y + h - .001);
    for (let yy = y0; yy <= y1; yy++) for (let zz = z0; zz <= z1; zz++) for (let xx = x0; xx <= x1; xx++) {
      if (w.solid(xx, yy, zz)) return true;
    }
    return false;
  }

  update(dt, input, locked) {
    const g = this.g, w = g.world;
    if (!this.alive) { this.deadUpdate(dt); return; }
    // Standing in a fire burns: a hurt every half second for as long as you are touching it.
    {
      let burning = false;
      for (const ox of [-R, R]) for (const oz of [-R, R]) for (let y = Math.floor(this.y - .5); y <= Math.floor(this.y + 1.6) && !burning; y++) {
        if (w.get(Math.floor(this.x + ox), y, Math.floor(this.z + oz)) === M.FIRE) burning = true;
      }
      if (burning) { this.fireT = (this.fireT || 0) + dt; if (this.fireT >= .5) { this.fireT -= .5; this.damage(5, null, null, 'fire'); } } else this.fireT = .45;
    }
    if (locked) {
      const sens = input.sens * (1 + ((input.adsSens ?? 1) - 1) * (this.ads || 0));
      this.yaw += input.mouseDX * sens;
      this.pitch = clamp(this.pitch - input.mouseDY * sens * (input.invertY ? -1 : 1), -1.54, 1.54);
    }
    input.mouseDX = 0; input.mouseDY = 0;

    // Wish direction. yaw 0 looks up -z (north).
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let fw = 0, st = 0;
    if (locked) {
      if (input.keys.KeyW) fw += 1;
      if (input.keys.KeyS) fw -= 1;
      if (input.keys.KeyD) st += 1;
      if (input.keys.KeyA) st -= 1;
    }
    const len = Math.hypot(fw, st) || 1;
    fw /= len; st /= len;
    const wishX = s * fw + c * st, wishZ = -c * fw + s * st;

    // Sitting: stay put until you try to move.
    if (this.sitting && (fw !== 0 || st !== 0 || (locked && input.keys.Space))) { this.sitting = false; }
    if (this.sitting) { fw = 0; st = 0; if (this.loadout !== 'survival') this.health = Math.min(100, this.health + dt * 1.5); }
    // Held, or tapped on and off if that is how you like it.
    if (input.toggleCrouch) { if (locked && input.pressed.KeyC) this.crouchOn = !this.crouchOn; } else this.crouchOn = false;
    this.crouch = locked && (input.toggleCrouch ? !!this.crouchOn : !!input.keys.KeyC) || !!this.sitting;
    const wantH = this.crouch ? CROUCH_H : HEIGHT;
    if (wantH > this.height && this.collides(this.x, this.y, this.z, wantH)) this.crouch = true;
    else this.height = wantH;
    this.eye = damp(this.eye, this.crouch ? CROUCH_EYE : EYE, 14, dt);

    this.swim = this.y + 1.0 < WATER_Y && !this.onGround || this.y + 1.2 < WATER_Y;
    const moving = fw !== 0 || st !== 0;
    const over = this.carryWeight() > this.carryCap();
    // Run dry and you are winded until you have properly got your breath back, however hard you hold the key.
    if (this.stamina <= 0 && this.stim <= 0) this.winded = true;
    else if (this.stamina >= 25 || this.stim > 0) this.winded = false;
    let sprint = locked && input.keys.ShiftLeft && moving && fw > 0 && !this.crouch && !this.aiming && !this.winded && !over;
    let speed = this.swim ? 3.2 : this.crouch ? 2.5 : sprint ? 7.4 : 4.9;
    if (this.aiming) speed *= .6;
    if (over) speed *= .55;
    if (g.isNight && this.infection > 60) speed *= .9;
    speed *= 1 - this.infection * .0015;
    const need = this.needs();
    speed *= need.speed;

    if (sprint && this.stim <= 0) this.stamina = Math.max(0, this.stamina - dt * 6);
    else if (this.swim && moving && this.stim <= 0) this.stamina = Math.max(0, this.stamina - dt * 4);
    else this.stamina = Math.min(need.cap, this.stamina + dt * (moving ? 10 : 20) * need.regen);
    if (this.stamina > need.cap) this.stamina = Math.max(need.cap, this.stamina - dt * 15);
    this.stim = Math.max(0, this.stim - dt);
    this.sprinting = sprint;
    this.sprintK = damp(this.sprintK || 0, sprint ? 1 : 0, 9, dt);

    const accel = this.onGround ? 42 : this.swim ? 8 : 7;
    const tx = wishX * speed, tz = wishZ * speed;
    const k = Math.min(1, accel * dt / Math.max(speed, 1));
    this.vx += (tx - this.vx) * (moving || this.onGround ? k * 2.2 : 0);
    this.vz += (tz - this.vz) * (moving || this.onGround ? k * 2.2 : 0);

    if (this.swim) {
      this.vy += (input.keys.Space && locked ? 3.4 : -.6) * dt * 6;
      this.vy *= 1 - 2.5 * dt;
      if (input.keys.Space && locked && this.y + 1.2 >= WATER_Y - .25) this.vy = Math.max(this.vy, 3.2);
    } else {
      this.vy -= 26 * dt;
      if (locked && input.keys.Space && this.onGround) {
        this.vy = 8.6;
        this.onGround = false;
        this.stamina = Math.max(0, this.stamina - 4);
      }
    }
    if (this.vy < -60) this.vy = -60;

    if (this.fly) {
      // Dev flight: straight where you are looking, through anything. Space up, Ctrl down, Shift to hurry.
      const fast = locked && input.keys.ShiftLeft ? 60 : 20, cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const mx = s * cp * fw + c * st, mz = -c * cp * fw + s * st;
      let my = sp * fw;
      if (locked && input.keys.Space) my += 1;
      if (locked && (input.keys.ControlLeft || input.keys.ControlRight)) my -= 1;
      this.vx = mx * fast; this.vy = my * fast; this.vz = mz * fast;
      this.x += this.vx * dt; this.z += this.vz * dt;
      this.y = clamp(this.y + this.vy * dt, 1, 250);
      this.onGround = false;
    } else if (!w.isLoaded(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)) && this.y <= w.L.height[Math.floor(this.z) * WX + Math.floor(this.x)] + 2) {
      // The chunk under us is still streaming in. Hold still rather than fall through.
      // Open sky over a low roof may never stream in, and there is nothing up there to fall through.
      this.vy = 0;
    } else {
      this.moveAxis(0, this.vx * dt);
      this.moveAxis(2, this.vz * dt);
      if (this.onGround && this.vy <= 0 && !this.swim) this.stepDown();
      this.moveAxis(1, this.vy * dt);
    }
    this.x = clamp(this.x, 2, WX - 2);
    this.z = clamp(this.z, 2, WZ - 2);

    this.eyeSmooth = damp(this.eyeSmooth, 0, 12, dt);

    const groundSpeed = Math.hypot(this.vx, this.vz);
    if (this.onGround && groundSpeed > .5) {
      this.bob += groundSpeed * dt * 1.55;
      this.stepDist += groundSpeed * dt;
      if (this.stepDist > (sprint ? 3 : 2.3)) {
        this.stepDist = 0;
        // In a real downpour, out under the sky, every step lands in water.
        if (!this.crouch) g.audio.simple(g.weather.rain > .45 && this.skyVis > .5 ? 'splash' : 'step');
        if (sprint) g.horde.noise(this.x, this.z, 18, .35);
      }
    }
    this.bobAmt = damp(this.bobAmt, this.onGround ? Math.min(1, groundSpeed / 6) * (this.g.settings.bob ?? 1) : 0, 10, dt);

    // Vitals
    if (this.infection > 0) {
      this.infection = Math.min(100, this.infection + dt * .03);
      if (this.infection > 75) this.health -= dt * .45 * (this.infection - 75) / 25;
    }
    if (this.loadout === 'survival') { this.updateHunger(dt); this.updateRest(dt); }
    else {
      const restCap = this.sanctuary ? 100 : 55;
      if (this.health < restCap && (g.time - this.lastHitT > 6 || this.lastHitT > g.time)) this.health = Math.min(restCap, this.health + dt * (this.sanctuary ? 2.5 : 1));
    }
    if (this.sanctuary) this.infection = Math.max(0, this.infection - dt * .05);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.4);
    this.flash = Math.max(0, this.flash - dt * (this.flashRate || 12));
    this.shake = Math.max(0, this.shake - dt * 2.2);
    if (this.health <= 0) this.die();

    // Exposure adapts when you walk inside.
    const ix = Math.floor(this.x), iz = Math.floor(this.z);
    let roof = 0;
    for (let y = Math.floor(this.y + this.height + 1); y < Math.floor(this.y + 80); y++) {
      if (y > 255) break;
      if (w.get(ix, y, iz)) { roof = 1; break; }
    }
    this.roofed = roof;
    this.skyVis = damp(this.skyVis, roof ? .08 : 1, 2.2, dt);
    const night = g.renderer.sky.night;
    this.exposure = damp(this.exposure, roof ? 1 + (1 - night) * .6 : 1, 1.8, dt);

    this.updateWeapon(dt, input, locked);
    this.updateProjectiles(dt);
    this.updateInteract();
  }

  // Slow enough to forget about. Running out only wears you down: it never finishes the job on its own.
  updateHunger(dt) {
    const was = this.hunger;
    this.hunger = Math.max(0, was - dt * HUNGER_RATE);
    if (was > 25 && this.hunger <= 25) this.g.ui.toast('You could do with something to eat.');
    if (was > 0 && this.hunger <= 0) this.g.ui.toast('You are starving. You tire quickly and it is wearing you down.', 'bad');
    if (this.hunger <= 0 && this.health > 40) this.health = Math.max(40, this.health - dt * .03);
  }

  // The same for sleep. A long day is fine; a day and a half on your feet is not, and it shows in everything you do.
  updateRest(dt) {
    const was = this.rest;
    this.rest = Math.max(0, was - dt * REST_RATE);
    if (was > 35 && this.rest <= 35) this.g.ui.toast('You are getting tired. Find somewhere to sleep.');
    if (was > 0 && this.rest <= 0) this.g.ui.toast('You are exhausted. Your hands are shaking and you are slowing down.', 'bad');
    if (this.rest <= 0 && this.health > 50) this.health = Math.max(50, this.health - dt * .025);
  }

  // What going without food and sleep is doing to you, survival only: a little when hungry or tired, a lot when starving or exhausted.
  // regen scales how fast stamina comes back, cap is the most it comes back to, speed scales how fast you move, aim scales your spread.
  needs() {
    const out = this.needsOut || (this.needsOut = { regen: 1, cap: 100, speed: 1, aim: 1, starving: false, hungry: false, exhausted: false, tired: false });
    const s = this.loadout === 'survival';
    out.starving = s && this.hunger <= 0; out.hungry = s && this.hunger <= 25;
    out.exhausted = s && this.rest <= 0; out.tired = s && this.rest <= 35;
    out.regen = (out.starving ? .55 : out.hungry ? .85 : 1) * (out.exhausted ? .5 : out.tired ? .8 : 1);
    out.cap = Math.min(out.starving ? 70 : 100, out.exhausted ? 55 : 100);
    out.speed = (out.starving ? .94 : 1) * (out.exhausted ? .9 : out.tired ? .97 : 1);
    out.aim = (out.starving ? 1.15 : out.hungry ? 1.05 : 1) * (out.exhausted ? 1.35 : out.tired ? 1.12 : 1);
    return out;
  }

  moveAxis(axis, d) {
    if (d === 0) return;
    const nx = axis === 0 ? this.x + d : this.x;
    const ny = axis === 1 ? this.y + d : this.y;
    const nz = axis === 2 ? this.z + d : this.z;
    if (!this.collides(nx, ny, nz, this.height)) {
      this.x = nx; this.y = ny; this.z = nz;
      if (axis === 1) this.onGround = false;
      return;
    }
    if (axis === 1) {
      if (d < 0) {
        const speed = -this.vy;
        // Floors are 5 voxels. Four blocks is nothing, two storeys hurts, five takes most of you, eight kills anyone.
        if (speed > 15) {
          const over = speed - 15;
          const dmg = over * .8 + over * over * .12;
          this.damage(dmg, null, null, 'fall');
          this.g.audio.simple('land');
          this.shake = Math.min(1, this.shake + .35);
        } else if (speed > 6) this.g.audio.simple('step');
        this.y = Math.ceil(ny);
        // Settle exactly on the voxel surface.
        if (this.collides(this.x, this.y, this.z, this.height)) this.y = Math.floor(this.y) + 1;
        this.onGround = true;
      } else {
        this.y = Math.floor(ny + this.height) - this.height - .002;
      }
      this.vy = 0;
      return;
    }
    // Auto-step up one voxel, so kerbs and stairs just work.
    const stepY = Math.floor(this.y) + 1 + (this.y - Math.floor(this.y) > .01 ? 1 : 0);
    const canStep = (this.onGround || this.swim) && stepY - this.y <= 1.05;
    if (canStep && !this.collides(nx, stepY, nz, this.height) && !this.collides(this.x, stepY, this.z, this.height)) {
      this.eyeSmooth -= stepY - this.y;
      this.x = nx; this.z = nz; this.y = stepY;
      return;
    }
    // Clipped by a corner or an edge (the rim of the floor above a stair, a doorframe): ease sideways round it rather than stop dead.
    // Only if a short way to one side the move is clear, so a real wall still stops you. And it is a slide, no faster than you were
    // walking: taking the whole sideways step at once read as a little teleport every time you clipped a corner.
    if (this.onGround || this.swim) {
      const most = Math.abs(d);
      for (const o of [.1, -.1, .2, -.2, .32, -.32]) {
        const sx = axis === 2 ? this.x + o : this.x, sz = axis === 0 ? this.z + o : this.z;
        const ax = axis === 0 ? nx : sx, az = axis === 2 ? nz : sz;
        if (this.collides(sx, this.y, sz, this.height)) continue;
        const clear = !this.collides(ax, this.y, az, this.height) || (canStep && !this.collides(ax, stepY, az, this.height) && !this.collides(sx, stepY, sz, this.height));
        if (!clear) continue;
        const step = Math.sign(o) * Math.min(Math.abs(o), most);
        if (axis === 2) this.x += step; else this.z += step;
        return;   // keep the way you are going: the next frames carry on round it
      }
    }
    if (axis === 0) this.vx = 0; else this.vz = 0;
  }

  // Down a step: onto it, the way you walk down stairs, not off it like a ledge. Falling the block took long enough for the head to still
  // be up at the old height as the body moved on, and on a stair under a landing it caught on the floor above: a bump at the bottom of
  // every flight. The camera eases down after the body so it does not jolt.
  stepDown() {
    if (this.collides(this.x, this.y - .05, this.z, this.height)) return;   // still standing on something
    const base = Math.floor(this.y + .001), ty = this.y - base < .01 ? base - 1 : base;
    if (this.y - ty > 1.05 || this.collides(this.x, ty, this.z, this.height) || !this.collides(this.x, ty - .05, this.z, this.height)) return;
    this.eyeSmooth += this.y - ty;
    this.y = ty;
    this.vy = 0;
  }

  // --- Damage --------------------------------------------------------------------------------------------
  damage(amount, sx, sz, type = 'bite') {
    if (!this.alive || (this.g.cheats && this.g.cheats.god)) return;
    const armor = this.armor ? ITEMS[this.armor].armor : 0;
    // No vest helps with the pavement.
    const mul = type === 'fall' ? 1 : type === 'bite' ? 1 - armor : 1 - armor * .5;
    const d = amount * mul;
    this.health -= d;
    this.hurtFlash = Math.min(1, this.hurtFlash + d / 28);
    this.lastHitT = this.g.time;
    this.shake = Math.min(1, this.shake + d / 55);
    if (type === 'bite' && rand() < .05 * (1 - armor)) {
      this.infection = Math.min(100, this.infection + 2 + rand() * 5);
    }
    this.g.audio.simple('hurt');
    if (sx !== null && sx !== undefined) this.g.ui.damageIndicator(sx - this.x, sz - this.z, this.yaw);
    if (this.health <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.health = 0;
    this.deadT = 0;
    this.g.onPlayerDeath();
  }

  deadUpdate(dt) {
    this.deadT += dt;
    this.vy -= 26 * dt;
    this.moveAxis(1, this.vy * dt);
    this.eye = damp(this.eye, .35, 2.4, dt);
    this.pitch = damp(this.pitch, .35, 1.5, dt);
    this.hurtFlash = damp(this.hurtFlash, 1, 3, dt);
  }

  // --- Weapons ---------------------------------------------------------------------------------------------
  eyePos() {
    const bobY = Math.sin(this.bob * 2) * .045 * this.bobAmt;
    return [this.x, this.y + this.eye + this.eyeSmooth + bobY, this.z];
  }

  forward() {
    const cp = Math.cos(this.pitch);
    return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  updateWeapon(dt, input, locked) {
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.swapT = Math.max(0, this.swapT - dt);
    // A blow that lands holds the swing for an instant, so you feel it connect.
    if (this.hitStop > 0) this.hitStop -= dt;
    else this.swing = Math.max(0, this.swing - dt);
    this.recoil = damp(this.recoil, 0, 9, dt);
    // The climb settles back, quick at first.
    if (this.recoilBack > 0 && this.fireCd <= 0.02) {
      const back = Math.min(this.recoilBack, dt * (.4 + this.recoilBack * 9));
      this.recoilBack -= back;
      this.pitch = clamp(this.pitch - back, -1.54, 1.54);
    }
    this.vmKick = damp(this.vmKick, 0, 13, dt);
    this.kickY = damp(this.kickY, 0, 6, dt);
    this.kickX = damp(this.kickX, 0, 6, dt);
    this.spread = damp(this.spread, 0, 4.5, dt);
    const id = this.weapon;
    const it = id ? ITEMS[id] : null;
    if (!it) { this.aiming = false; return; }

    const lmb = locked && input.mouse[0];
    const rmb = locked && input.mouse[2];
    const pressed = locked && input.mousePressed[0];
    const rPressed = locked && input.mousePressed[2];

    this.aiming = false;
    if (it.type === 'gun') {
      if (input.toggleAim) { if (rPressed) this.aimOn = !this.aimOn; if (this.sprinting) this.aimOn = false; } else this.aimOn = false;
      this.aiming = !!(input.toggleAim ? this.aimOn : rmb) && this.reloadT <= 0 && !this.sprinting;
      if (this.reloadT > 0) {
        this.reloadT -= dt;
        if (this.reloadT <= 0) this.finishReload(it, id);
      } else if (this.swapT <= 0 && this.fireCd <= 0 && (it.auto ? lmb : pressed)) {
        if ((this.mags[id] || 0) > 0) this.fireGun(it, id);
        else {
          if (pressed) this.g.audio.simple('click');
          this.startReload(it, id);
        }
      }
      if (locked && input.pressed.KeyR) this.startReload(it, id);
    } else if (it.type === 'melee') {
      if (this.swapT <= 0 && this.fireCd <= 0 && lmb) this.swingMelee(it);
    } else if (it.type === 'throw') {
      if (this.swapT <= 0 && this.fireCd <= 0) {
        if (lmb) this.cook = Math.min(this.cook + dt, it.fuse - .3);
        else if (this.cook > 0) this.throwItem(it, id);
      }
    } else if (it.type === 'block') {
      if (this.swapT <= 0 && this.fireCd <= 0 && (rmb || lmb)) this.placeBlock(it, id);
    }
    // The melee tools and fists double as block cutters on RMB; placing uses the block kit.
    if (it.type === 'melee' && rPressed) this.selectBlocks();
    this.ads = damp(this.ads, this.aiming ? 1 : 0, 14, dt);
  }

  startReload(it, id) {
    if (this.reloadT > 0 || !it.ammo) return;
    if ((this.mags[id] || 0) >= it.mag || !this.count(it.ammo)) {
      if (!this.count(it.ammo) && (this.mags[id] || 0) === 0) this.g.ui.toast(`No ${ITEMS[it.ammo].name}`);
      return;
    }
    // A revolver is swung open and the empties shaken out first, then loaded a round at a time, then snapped shut.
    if (it.cylinder) { this.reloadPhase = 'open'; this.reloadT = it.cylinder.open; this.g.audio.simple('reload'); return; }
    this.reloadT = it.reload;
    this.g.audio.simple('reload');
  }

  finishReload(it, id) {
    const m = this.mags[id] || 0;
    if (it.cylinder) {
      const C = it.cylinder;
      if (this.reloadPhase === 'open' || this.reloadPhase === 'load') {
        if (this.reloadPhase === 'load' && m < it.mag && this.count(it.ammo)) { this.remove(it.ammo, 1); this.mags[id] = m + 1; }
        if ((this.mags[id] || 0) < it.mag && this.count(it.ammo)) { this.reloadPhase = 'load'; this.reloadT = C.each; if (this.mags[id] > m) this.g.audio.simple('click'); }
        else { this.reloadPhase = 'close'; this.reloadT = C.close; }
        return;
      }
      this.reloadPhase = null;
      this.g.audio.simple('reload');
      return;
    }
    if (it.perShell) {
      if (m < it.mag && this.count(it.ammo)) {
        this.remove(it.ammo, 1);
        this.mags[id] = m + 1;
        this.g.audio.simple('reload');
        if (this.mags[id] < it.mag && this.count(it.ammo)) this.reloadT = it.reload;
      }
    } else {
      const take = this.remove(it.ammo, it.mag - m);
      this.mags[id] = m + take;
    }
  }

  fireGun(it, id) {
    const g = this.g;
    if (!(g.cheats && g.cheats.ammo)) this.mags[id]--;
    this.fireCd = it.rate;
    this.flash = 1;
    this.flashRate = it.pellets ? 8 : 12;   // a shotgun's flash hangs a moment longer
    const o = this.eyePos(), f = this.forward();
    const spreadBase = (it.spread * (this.aiming ? (it.scope ? .05 : .4) : 1) + this.spread * .03 + (this.sprinting ? .03 : 0) + (this.onGround ? 0 : .02)) * this.needs().aim;
    const pellets = it.pellets || 1;
    let muzzleX = o[0] + f[0] * 1.2 + Math.cos(this.yaw) * .2 * (1 - this.ads);
    let muzzleY = o[1] + f[1] * 1.2 - .14;
    let muzzleZ = o[2] + f[2] * 1.2 + Math.sin(this.yaw) * .2 * (1 - this.ads);
    // Better: out along the line of sight to where the gun's muzzle is drawn, so tracer, smoke and flash leave the barrel you see.
    const ms = g.viewModel && g.viewModel.muzzleScreen, R = g.renderer;
    if (ms && ms.id === id && R.screenRay && R.camPos) {
      const d = R.screenRay(Math.max(-1, Math.min(1, ms.x)), Math.max(-1, Math.min(1, ms.y)));
      const along = 1.2 / Math.max(.3, d[0] * f[0] + d[1] * f[1] + d[2] * f[2]);
      muzzleX = R.camPos[0] + d[0] * along; muzzleY = R.camPos[1] + d[1] * along; muzzleZ = R.camPos[2] + d[2] * along;
    }
    if (it.projectile === 'rocket') {
      this.projectiles.push({ kind: 'rocket', x: muzzleX, y: muzzleY, z: muzzleZ, vx: f[0] * 62, vy: f[1] * 62, vz: f[2] * 62, t: 0, fuse: 8, radius: 7, strength: 45, dmg: 420 });
    } else {
      let anyHit = false;
      for (let p = 0; p < pellets; p++) {
        const sx = (rand() - .5) * spreadBase * 2, sy = (rand() - .5) * spreadBase * 2, sz = (rand() - .5) * spreadBase * 2;
        let dx = f[0] + sx, dy = f[1] + sy, dz = f[2] + sz;
        const l = Math.hypot(dx, dy, dz);
        dx /= l; dy /= l; dz /= l;
        anyHit = this.traceBullet(o, dx, dy, dz, it, muzzleX, muzzleY, muzzleZ, p === 0 || p % 3 === 0) || anyHit;
      }
      if (anyHit) g.ui.hitMarker();
    }
    // The flash itself is drawn at the muzzle of the gun in your hands. Out here there is only the smoke, and the light it throws for an
    // instant on everything round you.
    g.particles.muzzleSmoke(muzzleX, muzzleY, muzzleZ, f[0], f[1], f[2], it.pellets ? 1.5 : it.mag > 50 ? 1.2 : 1);
    const big = it.pellets ? 1.8 : it.kick > .03 ? 1.35 : 1;
    g.tempLights.push({ x: muzzleX, y: muzzleY, z: muzzleZ, r: 16 * big, cr: 7 * big, cg: 4.2 * big, cb: 1.6 * big, t: .07, max: .07 });
    g.audio.gun(it.sound);
    if (it.type === 'gun' && !it.projectile) {
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      g.particles.cube(o[0] + f[0] * .5 + c * .3, o[1] - .2, o[2] + f[2] * .5 + s * .3, c * 2.4 + (rand() - .5), 1.8 + rand(), s * 2.4 + (rand() - .5), .05, .75, .6, .25, 1.1, 0, 1);
    }
    // Recoil: the muzzle climbs and wanders, mostly up and a little to the right, and most of the climb comes back down on its own
    // once you stop. A big gun knocks your whole head about; a pistol barely moves it.
    const kick = it.kick * (this.aiming ? .55 : 1) * (this.crouch ? .75 : 1);
    const climb = kick * .34 * (.85 + rand() * .3);
    this.pitch = clamp(this.pitch + climb, -1.54, 1.54);
    this.recoilBack = (this.recoilBack || 0) + climb * .6;
    this.yaw += ((rand() - .35) * kick * .5);
    this.kickY += kick * .7;
    this.shotN = (this.shotN || 0) + 1;
    this.shotKick = it.kick;
    this.shake = Math.min(1, this.shake + .04 + it.kick * 3.5);
    this.recoil = Math.min(1.2, this.recoil + kick * 11);
    this.vmKick = Math.min(1, this.vmKick + .28 + kick * 5);
    this.spread = Math.min(1.6, this.spread + kick * 5);
    g.horde.noise(this.x, this.z, it.noise * (this.sanctuary ? .2 : .55), .9);
    g.stats.shots++;
    if (this.sanctuary) g.npcs.firedInCamp();
    if (id === 'shotgun' || id === 'hunting') setTimeout(() => g.audio.simple('pump'), it.rate * 450);
  }

  traceBullet(o, dx, dy, dz, it, mx, my, mz, tracer) {
    const g = this.g, w = g.world;
    let hit = null, ox = o[0], oy = o[1], oz = o[2], travelled = 0;
    // Bullets punch through glass and keep going.
    for (let guard = 0; guard < 4; guard++) {
      hit = w.raycast(ox, oy, oz, dx, dy, dz, it.range - travelled, false);
      if (!hit) break;
      if (FLAGS[hit.id] & F_GLASS) {
        g.breakGlass(hit.x, hit.y, hit.z);
        travelled += hit.dist + .6;
        ox = o[0] + dx * travelled; oy = o[1] + dy * travelled; oz = o[2] + dz * travelled;
        hit = null;
        continue;
      }
      hit.dist += travelled;
      break;
    }
    const maxD = hit ? hit.dist : it.range;
    const zs = g.horde.raycast(o[0], o[1], o[2], dx, dy, dz, maxD, it.pierce, this.rayOut);
    let any = false, dmgMul = 1, endT = maxD;
    for (let k = 0; k < zs.length; k++) {
      const h = zs[k];
      const dmg = it.dmg * (h.head ? 2.6 : 1) * dmgMul;
      const killed = g.horde.damage(h.i, dmg, h.head && dmg > 60, h.x, h.y, h.z);
      g.particles.blood(h.x, h.y, h.z, dx, dy, dz, h.head ? 12 : 6, 4);
      if (h.head && dmg > 60 && killed) g.particles.gore(h.x, h.y, h.z, 10);
      if (killed) { this.kills++; if (h.head) this.headshots++; }
      g.audio.simple(h.head ? 'head' : 'flesh', h.x, h.y, h.z);
      any = true;
      dmgMul *= .72;
      if (k === zs.length - 1 && zs.length >= it.pierce) endT = h.t;
    }
    const npcHit = g.npcs.raycast(o[0], o[1], o[2], dx, dy, dz, Math.min(maxD, endT));
    if (npcHit) {
      const raider = npcHit.kind === 'raider', head = npcHit.hy > npcHit.y + (npcHit.kid ? 1.5 : 2.25);
      // A round through the head that would take a zombie's head off takes a person's off too.
      g.npcs.playerHit(npcHit, it.dmg * (head ? (raider ? 2.2 : 3) : 1), head && it.dmg * 2.6 > 60);
      g.particles.blood(npcHit.hx, npcHit.hy, npcHit.hz, dx, dy, dz, head ? 12 : 8, 4);
      if (npcHit.dead && npcHit.headless) g.particles.gore(npcHit.hx, npcHit.hy, npcHit.hz, 10);
      endT = npcHit.t;
      hit = null;
    }
    if (hit && endT >= hit.dist - .01) {
      const px = o[0] + dx * hit.dist, py = o[1] + dy * hit.dist, pz = o[2] + dz * hit.dist;
      g.particles.spark(px, py, pz, hit.nx, hit.ny, hit.nz, 3);
      g.particles.debris(hit.x, hit.y, hit.z, hit.id, 2, 2.4);
      g.particles.dust(px, py, pz, 1, .5);
      g.audio.simple('block', px, py, pz);
      if (it.blockDmg) {
        const broke = w.hit(hit.x, hit.y, hit.z, it.blockDmg);
        if (broke) { g.onVoxelBroken(hit.x, hit.y, hit.z, broke); }
      }
    }
    if (tracer) g.particles.tracer(mx, my, mz, o[0] + dx * endT, o[1] + dy * endT, o[2] + dz * endT);
    return any;
  }

  swingMelee(it) {
    const g = this.g, w = g.world;
    this.fireCd = it.rate;
    // The swing is quick. Getting your balance back for the next one is what takes the time.
    this.swing = it.rate * .58;
    this.swingDur = it.rate * .58;
    g.audio.simple('swing');
    const o = this.eyePos(), f = this.forward();
    // Cone sweep through the crowd.
    let hits = 0;
    const cx = o[0] + f[0] * it.range * .5, cz = o[2] + f[2] * it.range * .5;
    const list = [];
    g.horde.forRadius(cx, cz, it.range, (i) => {
      const dx = g.horde.px[i] - o[0], dy = g.horde.py[i] + 1.4 - o[1], dz = g.horde.pz[i] - o[2];
      const d = Math.hypot(dx, dy, dz);
      if (d > it.range + .4) return;
      const along = (dx * f[0] + dy * f[1] + dz * f[2]) / (d + .01);
      if (along < .55) return;
      list.push([d, i]);
    });
    list.sort((a, b) => a[0] - b[0]);
    // How hard it lands, from a crowbar's crack to a sledge that stops you dead.
    const heft = Math.min(1.3, it.dmg / 85);
    for (const [, i] of list.slice(0, it.cleave)) {
      const H = g.horde, hx = H.px[i], hy = H.py[i] + 1.5, hz = H.pz[i];
      if (!w.los(o[0], o[1], o[2], hx, hy, hz)) continue;
      H.blowX = f[0]; H.blowZ = f[2];
      const killed = H.damage(i, it.dmg, false, hx, hy, hz);
      H.blowX = 0; H.blowZ = 0;
      g.particles.blood(hx, hy, hz, f[0], f[1], f[2], Math.round((killed ? 26 : 16) * (.8 + heft * .5)), 4 + heft * 3.6);
      g.audio.simple('flesh', hx, hy, hz);
      if (killed) {
        this.kills++;
        g.particles.gore(hx, hy, hz, 4 + Math.round(heft * 5));
        g.audio.simple('head', hx, hy, hz);
      } else {
        // Anyone still standing reels back a step and needs a moment before they can bite. It is a shove, not a jump:
        // their own movement carries it out, and walls stop it.
        // Then it slides back a step under the blow, not walking, before it gets its footing (knockT: drag only, walls still stop it).
        const shove = 4.5 + heft * 5;
        H.vx[i] = f[0] * shove; H.vz[i] = f[2] * shove;
        H.knockT[i] = .14 + heft * .1;
        H.flinch[i] = H.flinchTime; H.flx[i] = f[0]; H.flz[i] = f[2];
        H.hurtT[i] = .45;
        g.audio.simple('thump', hx, hy, hz);
        H.atk[i] = Math.max(H.atk[i], .5 + heft * .5);
      }
      hits++;
    }
    // Nothing infected in reach, but somebody is.
    if (!hits) {
      const who = g.npcs.raycast(o[0], o[1], o[2], f[0], f[1], f[2], it.range);
      if (who && w.los(o[0], o[1], o[2], who.hx, who.hy, who.hz)) {
        g.npcs.playerHit(who, it.dmg);
        g.particles.blood(who.hx, who.hy, who.hz, f[0], f[1], f[2], 14, 4 + heft * 3);
        g.audio.simple('flesh', who.hx, who.hy, who.hz);
        hits++;
      }
    }
    if (hits) {
      // A lighter version of what a gunshot does to your view: the kick comes back up your arms.
      g.ui.hitMarker(true);
      g.horde.noise(this.x, this.z, 8, .4);
      this.shake = Math.min(1, this.shake + .1 + heft * .1);
      this.kickY += .009 + heft * .012;
      this.kickX += (rand() - .5) * .022 * heft;
      this.vmKick = Math.min(1, this.vmKick + .25 + heft * .25);
      this.hitStop = .035 + heft * .04;
      return;
    }
    const hit = w.raycast(o[0], o[1], o[2], f[0], f[1], f[2], it.range);
    if (hit && (FLAGS[hit.id] & F_GLASS)) {
      g.breakGlass(hit.x, hit.y, hit.z);
      g.horde.noise(this.x, this.z, 18, .5);
    } else if (hit) {
      const px = o[0] + f[0] * hit.dist, py = o[1] + f[1] * hit.dist, pz = o[2] + f[2] * hit.dist;
      g.particles.debris(hit.x, hit.y, hit.z, hit.id, 4, 3);
      g.particles.dust(px, py, pz, 1, .4);
      g.audio.simple('block', px, py, pz);
      // Boards come away from a frame far easier than they give to teeth.
      const broke = w.hit(hit.x, hit.y, hit.z, it.blockDmg * (hit.id === M.BARRICADE || hit.id === M.BARRICADE2 ? 2 : 1));
      if (broke) { g.onVoxelBroken(hit.x, hit.y, hit.z, broke); g.salvage(broke, 1); }
      g.horde.noise(this.x, this.z, 18, .5);
    }
  }

  throwItem(it, id) {
    const o = this.eyePos(), f = this.forward();
    const v = it.sticky ? 11 : 17;
    this.projectiles.push({
      kind: id, x: o[0] + f[0] * .6, y: o[1] + f[1] * .6, z: o[2] + f[2] * .6,
      vx: f[0] * v + this.vx * .4, vy: f[1] * v + 3 + this.vy * .3, vz: f[2] * v + this.vz * .4,
      t: this.cook, fuse: it.fuse, radius: it.radius, strength: it.strength, dmg: it.dmg, sticky: !!it.sticky, stuck: false, beep: 0,
    });
    this.cook = 0;
    this.fireCd = .55;
    this.swing = .3;
    this.swingDur = .3;
    this.remove(id, 1);
    this.g.audio.simple('swing');
  }

  placeBlock(it, id) {
    const g = this.g, w = g.world;
    const o = this.eyePos(), f = this.forward();
    const hit = w.raycast(o[0], o[1], o[2], f[0], f[1], f[2], 9);
    if (!hit) return;
    const x = hit.x + hit.nx, y = hit.y + hit.ny, z = hit.z + hit.nz;
    if (w.get(x, y, z)) return;
    // Refuse a block inside the player's own box.
    if (x + 1 > this.x - R && x < this.x + R && z + 1 > this.z - R && z < this.z + R && y + 1 > this.y && y < this.y + this.height) return;
    if (w.set(x, y, z, it.mat)) {
      this.remove(id, 1);
      this.fireCd = .2;
      g.audio.simple('place', x, y, z);
      g.horde.nearDirty = true;
      g.stats.placed++;
    }
  }

  updateProjectiles(dt) {
    const g = this.g, w = g.world;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.kind === 'rocket') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        g.particles.sprite(0, p.x, p.y, p.z, 0, .5, 0, .5, 1.4, .5, .5, .5, .3, 1.2);
        g.particles.fire(p.x, p.y, p.z, 1.6);
        g.renderer.addLight(p.x, p.y, p.z, 16, 4, 2.2, .8);
        let boom = p.t > p.fuse || w.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        if (!boom) {
          const list = [];
          g.horde.forRadius(p.x, p.z, 1.4, (j) => { if (Math.abs(g.horde.py[j] + 1.4 - p.y) < 1.6) list.push(j); });
          if (list.length) boom = true;
        }
        if (boom) {
          this.projectiles.splice(i, 1);
          g.explode(p.x - p.vx * dt * .5, p.y - p.vy * dt * .5, p.z - p.vz * dt * .5, p.radius, p.strength, p.dmg, !!p.hostile, !!p.loud);
        }
        continue;
      }
      if (!p.stuck) {
        p.vy -= 22 * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
        // A charge seats itself flat against the face it hit.
        const seat = (axis, dir) => {
          if (!p.sticky || p.stuck) return;
          p.stuck = true;
          p.nrm = [0, 0, 0];
          p.nrm[axis] = dir;
          const c = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
          p[c] = (dir > 0 ? Math.floor(p[c]) : Math.floor(p[c]) + 1) + dir * .07;
        };
        if (w.solid(Math.floor(nx), Math.floor(p.y), Math.floor(p.z))) { seat(0, -Math.sign(p.vx) || 1); p.vx *= -.35; }
        else p.x = nx;
        if (w.solid(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))) { seat(1, -Math.sign(p.vy) || 1); p.vy *= -.35; p.vx *= .7; p.vz *= .7; }
        else p.y = ny;
        if (w.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(nz))) { seat(2, -Math.sign(p.vz) || 1); p.vz *= -.35; }
        else p.z = nz;
        if (p.stuck) g.audio.simple('place', p.x, p.y, p.z);
      }
      p.beep -= dt;
      if (p.sticky && p.beep <= 0) { p.beep = Math.max(.12, (p.fuse - p.t) * .22); g.audio.simple('beep', p.x, p.y, p.z); g.particles.sprite(2, p.x, p.y, p.z, 0, 0, 0, .3, 0, 8, .6, .4, 1, .08); }
      if (p.t >= p.fuse) {
        this.projectiles.splice(i, 1);
        g.explode(p.x, p.y, p.z, p.radius, p.strength, p.dmg, !!p.hostile);
      }
    }
  }

  drawProjectiles() {
    const fx = this.g.particles;
    for (const p of this.projectiles) {
      if (p.kind === 'rocket') fx.cube(p.x, p.y, p.z, 0, 0, 0, .2, .28, .3, .22, .0001, 0, 3);
    }
  }

  // What is the player looking at?
  updateInteract() {
    const g = this.g;
    const o = this.eyePos(), f = this.forward();
    const hit = g.world.raycast(o[0], o[1], o[2], f[0], f[1], f[2], 4.6);
    this.highlight = hit && hit.dist < 4.6 ? hit : null;
    this.interact = null;
    // On a bike there is only getting off. Said once you have slowed down; E does it at any speed.
    if (g.bikes && g.bikes.ride) { if (Math.abs(g.bikes.ride.v) < 2) this.interact = { kind: 'bikeoff', label: 'Get off the motorbike' }; return; }
    const n = g.npcs.lookAt(o, f, 4.2, hit ? hit.dist : 4.2) || g.npcs.acrossCounter(o, f);
    // Facing the hole, the hole wins over a guard who happens to be standing in front of it. Look away to talk to them.
    const br = g.campSim.breachNear(this.x, this.y, this.z);
    let atHole = false;
    if (br) {
      const hx = br.b.x + .5 - this.x, hz = br.b.z + .5 - this.z, d = Math.hypot(hx, hz), fl = Math.hypot(f[0], f[2]) || 1;
      atHole = d < 3 || (f[0] * hx + f[2] * hz) / (d * fl) > .6;
    }
    const open = atHole && !br.busy;
    if (n && n.kind !== 'raider' && !open) { this.interact = { kind: 'npc', npc: n, label: n.promptLabel() }; return; }
    const dog = !open && g.dogs ? g.dogs.lookAt(o, f, Math.min(3.4, hit ? hit.dist : 3.4)) : null;
    if (dog) { this.interact = { kind: 'dog', dog, label: `Pet ${dog.name}` }; return; }
    const bike = !open && g.bikes ? g.bikes.lookAt(o, f, Math.min(3.8, hit ? hit.dist + .8 : 3.8)) : null;
    if (bike) { this.interact = { kind: 'bike', bike, label: 'Ride the motorbike' }; return; }
    if (atHole) {
      const done = Math.round(Math.min(1, br.progress) * 100);
      this.interact = { kind: 'breach', breach: br, label: br.busy ? 'Breach: cannot repair while they are coming through' : done > 0 ? `Hold to repair the breach: ${done}%` : 'Hold to repair the breach' };
      return;
    }
    if (hit && isLoot(hit.id) && hit.dist < 3.9) {
      const label = hit.id === M.CRATE_MED ? 'Search Medical Crate' : hit.id === M.CRATE_AMMO ? 'Search Ammo Crate' : hit.id === M.TRUNK_LOOT ? 'Search Trunk' : 'Search Crate';
      this.interact = { kind: 'loot', hit, label };
      return;
    }
    if (hit && this.sanctuary && !this.sitting && hit.dist < 3.9) {
      if (isBed(hit.id)) {
        const no = g.noSleep();
        this.interact = { kind: 'bed', label: no || `${g.sleepingUntilNight() ? 'Sleep until night' : 'Sleep until morning'}${this.sedated ? ' (pills)' : ''}` };
        return;
      }
      if (hit.id === M.LOG || hit.id === M.WOOD_D) { if (this.g.world.get(hit.x, hit.y + 1, hit.z) === 0 && hit.y === 12) { this.interact = { kind: 'seat', label: 'Sit down', hit }; return; } }
    }
    // A fire somebody let go out, or the rain did.
    if (hit && hit.id === M.BURNT && hit.dist < 3.9) {
      for (const c of g.layout.camps) {
        if (Math.abs(c.cx - this.x) > 200 || Math.abs(c.cz - this.z) > 200) continue;
        const f = c.fires.find((q) => q.out && Math.hypot(q.x - hit.x, q.z - hit.z) < 5);
        if (f) {
          const wet = g.weather.rain > .6 && !f.sheltered;
          this.interact = { kind: 'fire', fire: f, camp: c, wet, label: wet ? 'Too wet to light' : 'Relight the fire' };
          return;
        }
      }
    }
    const obj = g.jobs.nearObjective(this.x, this.y, this.z);
    if (obj) this.interact = { kind: 'cache', label: obj.label, obj };
  }

  toSave() {
    return {
      x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch, health: this.health, infection: this.infection, stamina: this.stamina, hunger: this.hunger, rest: this.rest, sedated: this.sedated, home: this.home, torchItem: true,
      scrip: this.scrip, inventory: this.inventory, mags: this.mags, weapon: this.weapon, armor: this.armor, rep: this.rep,
      loadout: this.loadout, charName: this.charName, skin: this.skin, bornDay: this.bornDay, kills: this.kills, headshots: this.headshots, voxelsBroken: this.voxelsBroken, discovered: this.discovered, campRep: this.campRep, grief: this.grief, wanted: this.wanted, bail: this.bail || {}, dlg: this.dlg, perks: this.perks || {}, pendingKit: this.pendingKit || null,
    };
  }

  fromSave(s) {
    Object.assign(this, s);
    this.bail = s.bail || {};
    if (typeof this.rest !== 'number') this.rest = 100;
    this.alive = true;
    // From before the flashlight was something you carried.
    if (!s.torchItem && this.loadout !== 'survival' && !this.count('flashlight')) this.add('flashlight', 1);
    this.torchItem = true;
  }
}
