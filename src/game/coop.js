// Tethered co-op. One player hosts: their game is the real one, with the horde, the people, the camps and the save. Everyone else is a
// guest who walks the same city on their own copy of the map, kept within reach of the host, and is shown what the host's game is doing
// around them: the dead, the living, dogs and corpses as snapshots several times a second, every change to the voxels, the time and the
// weather. A guest's shots, blows and explosions are sent to the host to be worked out there, and the bites come back. All players are in
// the one group, with the host's crew.
//
// None of this runs unless a co-op game is going: the main game and the sandbox never set game.coop, and every hook into them checks it.
import { CW, CD, WY, WX, WZ } from '../shared/constants.js';
import { ITEMS, START_CAMP } from './items.js';
import { WARDROBE, HUMAN_VARIANT_START } from '../engine/actors.js';
import { CREW_GUN_NAMES } from './npcs.js';
import { Player } from './player.js';
import { SteamNet, LocalNet } from './net.js';

const TETHER = 40;          // how far from the host a guest can go, in voxels: inside the host's full-detail zone, where the dead can reach them
const TETHER_FAR = 64;      // further than this (the host travelled, or the guest got stuck behind something): put back beside the host
const SNAP_HZ = 15;         // snapshots of who is about, to each guest
const POSE_HZ = 20;         // where each player is and which way they face
const WORLD_HZ = 2;         // time, weather, the camps and the group
const SNAP_R = 110;         // how far round a guest the snapshot reaches
const SNAP_MAX = 640;       // the most bodies in one snapshot, nearest first
const REVIVE_S = 8;         // seconds down before getting back up beside someone still standing
const TIMEOUT_S = 12;       // silence after which a player is taken to have gone
const COL = CW * CD;

// Packets: the first byte says what follows.
const P_JSON = 1, P_SNAP = 2, P_POSE = 3;
const INST = 22, SNAP_HEAD = 14, PER_PACKET = Math.floor((1200 - SNAP_HEAD) / INST);
const enc = new TextEncoder(), dec = new TextDecoder();
const jsonPacket = (m) => { const b = enc.encode(JSON.stringify(m)); const out = new Uint8Array(b.length + 1); out[0] = P_JSON; out.set(b, 1); return out; };
const r2 = (v) => Math.round(v * 100) / 100;

// Player weapons as the body model draws them (see NPC_WEAPON in actors.js).
const BODY_WEAPON = { pistol: 1, revolver: 1, rifle: 2, rocket: 2, shotgun: 3, smg: 4, deer: 5, hunting: 5, lmg: 6, crowbar: 8, sledge: 8, axe: 11 };
const ITEM_ID = new Map(Object.entries(ITEMS).map(([k, v]) => [v, k]));
const hashId = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const bodyVariant = (id) => WARDROBE.civ[0] + (hashId(id) % WARDROBE.civ[1]);
const wrapPi = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// Collects what the host's own drawing code would put on screen, round one point, so the same code that draws the city for the host
// describes it for a guest: the horde, the people and the dogs all go through here unchanged.
class Recorder {
  constructor() { this.cap = 8192; this.d = new Float32Array(this.cap * 10); this.n = 0; }
  begin(x, z, r) { this.cx = x; this.cz = z; this.r2 = r * r; this.n = 0; }
  add(kind, x, y, z, yaw, phase, state, variant, extra) {
    const dx = x - this.cx, dz = z - this.cz, d2 = dx * dx + dz * dz;
    if (d2 > this.r2 || this.n >= this.cap) return;
    const d = this.d, k = this.n++ * 10;
    d[k] = x; d[k + 1] = y; d[k + 2] = z; d[k + 3] = yaw; d[k + 4] = phase; d[k + 5] = state; d[k + 6] = variant; d[k + 7] = extra; d[k + 8] = kind; d[k + 9] = d2;
  }
  push(lod, x, y, z, yaw, phase, state, variant, extra) { this.add(0, x, y, z, yaw, phase, state, variant, extra); }
  pushDog(x, y, z, yaw, phase, state, variant, extra = 0) { this.add(1, x, y, z, yaw, phase, state, variant, extra); }
}

export class Coop {
  constructor(g, version) {
    this.g = g;
    this.version = version;   // () => string: players on different builds have different maps
    this.net = null;
    this.role = null;         // 'host' or 'guest' while in a lobby or a game
    this.inGame = false;
    this.peers = new Map();   // the host's view of the guests: id -> peer
    this.restore = [];
    this.view = 'closed';
    this.status = '';
    this.found = [];
    this.setupMenu();
  }

  get guest() { return this.role === 'guest'; }
  get host() { return this.role === 'host'; }

  // --- Lobby screen -----------------------------------------------------------------------------------------------------------------
  setupMenu() {
    const b = document.getElementById('m-coop');
    if (b) b.addEventListener('click', () => { this.g.audio.simple('ui'); this.openMenu(); });
  }

  async ensureNet() {
    if (this.net) return this.net;
    this.net = await SteamNet.open();
    if (!this.net) {
      let name = '';
      try { name = localStorage.getItem('spadeheart.coopName') || ''; } catch { /* private mode */ }
      this.net = new LocalNet(name || `Player ${1 + Math.floor(Math.random() * 90)}`);
    }
    this.net.onPacket = (from, data) => this.onPacket(from, data);
    this.net.onLobby = (l) => this.onLobby(l);
    this.net.onInvite = (id) => this.acceptInvite(id);
    return this.net;
  }

  async openMenu(note = '') {
    this.status = note;
    this.g.ui.open('coop');
    await this.ensureNet();
    if (!this.role) { this.view = 'browse'; this.refresh(); } else this.view = 'lobby';
    this.render();
  }

  async refresh() {
    this.found = null;
    this.render();
    try { this.found = await this.net.list(); } catch (e) { this.found = []; this.status = `Could not list games: ${e.message}`; }
    if (this.view === 'browse') this.render();
  }

  render() {
    const body = document.getElementById('coop-body'), foot = document.getElementById('coop-foot'), via = document.getElementById('coop-via');
    if (!body || this.g.ui.modal !== 'coop') return;
    const n = this.net, esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    via.textContent = n ? `${n.label}: ${n.selfName}` : '';
    let html = '', ft = '';
    if (this.view === 'browse') {
      if (n && n.kind === 'local') {
        html += `<div class="coop-note">Steam is not running, so co-op works between copies of the game open on this computer, at this same address. Open it in another tab or window to join. For co-op over the internet, play from the desktop app with Steam open.</div>`;
        html += `<div class="coop-name"><label for="coop-name">Your name</label><input id="coop-name" maxlength="20" value="${esc(n.selfName)}"></div>`;
      }
      html += '<div class="ng-label">Open games</div>';
      if (this.found === null) html += '<div class="coop-note">Looking...</div>';
      else if (!this.found.length) html += `<div class="coop-note">None found.${n && n.kind === 'steam' ? ' A friend\'s private game shows up as an invite instead: accept it in Steam, or join from your friends list.' : ''}</div>`;
      else {
        for (const l of this.found) {
          const same = !l.v || l.v === this.version();
          html += `<div class="coop-row"><div><b>${esc(l.name)}</b><small>${l.n} of ${l.max} players${same ? '' : ', a different version'}</small></div><button class="btn" data-join="${esc(l.id)}"${same && l.n < l.max ? '' : ' disabled'}>Join</button></div>`;
        }
      }
      if (this.status) html += `<div class="coop-status">${esc(this.status)}</div>`;
      ft = '<button class="btn" id="coop-back">Back</button><span style="flex:1"></span><button class="btn" id="coop-refresh">Refresh</button>';
      if (n && n.kind === 'steam') ft += '<select id="coop-vis" class="btn"><option value="friends">Friends only</option><option value="public">Public</option></select>';
      ft += '<button class="btn primary" id="coop-host">Host a game</button>';
    } else {
      const L = n.lobby, ids = L ? L.members : [];
      html += `<div class="ng-label" style="margin-top:0">${this.host ? 'Your game' : 'Players'}</div>`;
      for (const id of ids) {
        const me = id === n.selfId, isHost = L && id === L.owner;
        const name = me ? n.selfName : (this.names && this.names[id]) || (isHost ? (L.data && L.data.name) : '') || 'Joining...';
        const tag = [isHost ? 'Host' : '', me ? 'You' : ''].filter(Boolean).join(', ');
        html += `<div class="coop-row"><div><b>${esc(name)}</b>${tag ? `<small>${tag}</small>` : ''}</div></div>`;
      }
      if (this.host) {
        html += '<div class="coop-note">Everyone starts as a survivor in the same group, waking up in the same settlement. Guests stay within about forty steps of you: the dead are only worked out in full round the host. Guests can join while the game is going, from the lobby list or an invite.</div>';
        if (this.coopSave) html += `<div class="coop-note">There is a co-op city from before, on day ${this.coopSave.day}.</div>`;
      } else html += `<div class="coop-note">${this.hostStarted ? 'The host is in the city. Bringing you in...' : 'Waiting for the host to start.'}</div>`;
      if (this.status) html += `<div class="coop-status">${esc(this.status)}</div>`;
      ft = '<button class="btn" id="coop-leave">Leave</button><span style="flex:1"></span>';
      if (n.canInvite) ft += '<button class="btn" id="coop-invite">Invite friends</button>';
      if (this.host) {
        if (this.coopSave) ft += '<button class="btn" id="coop-continue">Continue that city</button>';
        ft += '<button class="btn primary" id="coop-start">Start a new city</button>';
      }
    }
    body.innerHTML = html;
    foot.innerHTML = ft;
    const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', () => { this.g.audio.simple('ui'); fn(); }); };
    on('coop-back', () => this.g.ui.open('menu', false));
    on('coop-refresh', () => this.refresh());
    on('coop-host', () => this.hostLobby());
    on('coop-leave', () => this.leaveLobby());
    on('coop-invite', () => n.invite());
    on('coop-start', () => this.startHost(true));
    on('coop-continue', () => this.startHost(false));
    body.querySelectorAll('[data-join]').forEach((el) => el.addEventListener('click', () => this.joinLobby(el.dataset.join)));
    const nm = document.getElementById('coop-name');
    if (nm) nm.addEventListener('change', () => {
      const v = nm.value.trim().slice(0, 20);
      if (!v) return;
      n.selfName = v;
      try { localStorage.setItem('spadeheart.coopName', v); } catch { /* private mode */ }
      via.textContent = `${n.label}: ${n.selfName}`;
    });
  }

  async hostLobby() {
    const vis = document.getElementById('coop-vis');
    try {
      await this.net.host(vis ? vis.value : 'friends', { v: this.version(), open: '1' });
    } catch (e) { this.status = `Could not open a game: ${e.message}`; this.render(); return; }
    this.role = 'host';
    this.names = {};
    this.peers.clear();
    this.view = 'lobby';
    this.status = '';
    this.coopSave = await this.g.coopSaveInfo();
    this.render();
  }

  async joinLobby(id) {
    this.status = 'Joining...';
    this.render();
    try { await this.net.join(id); } catch (e) { this.status = `Could not join: ${e.message}`; this.render(); return; }
    this.role = 'guest';
    this.names = {};
    this.hostId = this.net.hostId();
    this.hostStarted = false;
    this.view = 'lobby';
    this.status = '';
    this.lastHeard = performance.now();
    this.render();
    this.hello();
  }

  // From Steam: an invite accepted, or Join Game from the friends list. Only from the title screen.
  async acceptInvite(id) {
    if (this.inGame || this.g.state !== 'menu') return;
    if (this.role) await this.leaveLobby(true);
    await this.openMenu();
    this.joinLobby(id);
  }

  async leaveLobby(quiet = false) {
    if (this.inGame) return;
    if (this.host) for (const id of this.peers.keys()) this.send(id, { t: 'bye' });
    else if (this.guest && this.hostId) this.send(this.hostId, { t: 'bye' });
    await this.net.leave().catch(() => {});
    this.role = null;
    this.peers.clear();
    this.view = 'browse';
    if (!quiet) { this.refresh(); this.render(); }
  }

  onLobby(l) {
    if (!this.role) return;
    // The host has gone: Steam hands an abandoned lobby to someone else, and the local one empties.
    if (this.guest && (!l || l.owner !== this.hostId || !l.members.includes(this.net.selfId))) { this.lost('The host left the game.'); return; }
    if (this.host) for (const id of [...this.peers.keys()]) if (!l.members.includes(id)) this.dropPeer(id, 'left');
    if (this.view === 'lobby') this.render();
  }

  // Guests say hello until the host answers; the host answers with the lobby, or with the world if the game is going.
  hello() {
    if (!this.guest || this.inGame || this.welcomeAt) return;
    this.send(this.hostId, { t: 'hello', name: this.net.selfName, v: this.version() });
    clearTimeout(this.helloTimer);
    this.helloTimer = setTimeout(() => this.hello(), 1500);
  }

  // --- Starting -----------------------------------------------------------------------------------------------------------------
  async startHost(fresh) {
    const g = this.g;
    this.inGame = true;
    g.coop = this;
    this.beginSession();
    this.installHost();
    g.slot = 'coop';
    if (fresh || !this.coopSave) g.newGame(g.ui.readDifficulty(), 0, 'survival');
    else await g.continueGame('coop', true);
    g.player.charName = this.net.selfName;
    this.net.setData({ started: '1' }).catch(() => {});
    for (const id of this.peers.keys()) this.send(id, { t: 'starting' });
  }

  // The world as the host has it, for a guest coming in: in several parts if it has been dug about a lot.
  welcome(peer) {
    const g = this.g, P = g.player, parts = [];
    let cur = [], size = 0;
    for (const [i, arr] of g.world.exportEdits()) {
      cur.push([i, Array.from(arr)]);
      size += arr.length;
      if (size > 60000) { parts.push(cur); cur = []; size = 0; }
    }
    parts.push(cur);
    const spot = this.besideHost();
    this.send(peer.id, {
      t: 'welcome', v: this.version(), host: this.net.selfName, diff: g.difficulty, tod: g.tod, day: g.day, wx: g.weather.toSave(),
      spawn: spot, cs: g.campSim.state.map((s) => s.status), lightsGone: [...(g.lightsGone || [])], parts: parts.length,
    });
    parts.forEach((list, k) => this.send(peer.id, { t: 'base', k, list }));
    peer.welcomed = true;
    peer.lastHeard = performance.now();
    g.ui.toast(`${peer.name} joined the game.`, 'good');
  }

  // A guest arriving: the same city, a survivor of their own with the survival kit already on them (the settlement's people only
  // deal with the host), standing beside the host.
  startGuest() {
    const g = this.g, P = g.player, w = this.welcomeMsg;
    this.inGame = true;
    g.coop = this;
    this.beginSession();
    g.slot = null;
    g.difficulty = w.diff;
    g.horde.applyDifficulty(w.diff);
    g.horde.menu = false;
    g.horde.resetPopulation();
    g.world.importEdits(this.baseParts.flat().map(([i, a]) => [i, Int32Array.from(a)]));
    g.lightsGone = new Set(w.lightsGone || []);
    g.lightChecks = [];
    g.lotHurt = new Map();
    g.lotDirty = new Set();
    g.clearLoadedWorld();
    g.jobs.active = [];
    g.jobs.offerDay = {};
    g.campSim.reset();
    g.director.reset();
    w.cs.forEach((s, i) => { if (g.campSim.state[i]) g.campSim.state[i].status = s; });
    g.npcs.list.length = 0;
    g.dogs.reset();
    g.npcs.followers.length = 0;
    g.npcs.camps.forEach((c) => { c.active = false; c.npcs = []; c.guards = []; });
    g.stats = { shots: 0, jobs: 0, placed: 0 };
    P.reset();
    const c = g.layout.camps.find((k) => k.key === START_CAMP);
    P.holdKit('survival', c.key);
    P.takeKit();
    P.campRep[c.id] = 10;
    P.home = c.id;
    P.discovered[c.id] = true;
    P.charName = this.net.selfName;
    P.x = w.spawn.x; P.y = w.spawn.y; P.z = w.spawn.z; P.yaw = w.spawn.yaw || 0;
    g.freshStart();
    g.weather.fromSave(w.wx);
    g.tod = w.tod;
    g.day = w.day;
    g.time = 0;
    g.lastBite = -1e9;
    g.pickups = [];
    g.spawnPending = false;
    this.installGuest();
    g.beginLoad(`Joining ${w.host}`, () => g.ui.banner('Co-op', `With ${w.host}. Stay close: you cannot go far from them.`));
  }

  beginSession() {
    this.fxOut = [];
    this.editsOut = [];
    this.outEdits = [];
    this.shots = [];
    this.puppets = [];
    this.rx = null;
    this.snapT = 0; this.poseT = 0; this.worldT = 0; this.meT = 0;
    this.seq = 0;
    this.downT = 0;
    this.roster = [];
    this.crew = [];
    this.hostPose = null;
    this.hostPhase = 0;
    this.anchors = new Map();
    this.setupChat();
    this.rec = this.rec || new Recorder();
    // A window in the background still has to keep the game going for everyone else. Animation frames stop there (sometimes even while
    // the page says it is visible), so when none has come for a while a worker's clock stands in.
    if (!this.ticker) {
      const src = 'let t=null;onmessage=(e)=>{clearInterval(t);if(e.data)t=setInterval(()=>postMessage(0),16);};';
      try {
        this.ticker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        this.ticker.onmessage = () => {
          const now = performance.now();
          if (this.inGame && now - (this.g.rafAt || 0) > 120) this.g.loop(now);
        };
      } catch { this.ticker = null; }
    }
    if (this.ticker) this.ticker.postMessage(1);
  }

  // --- Hooks into the game, put in for a session and taken out after it -------------------------------------------------------------
  hook(obj, key, value) {
    this.restore.push([obj, key, Object.prototype.hasOwnProperty.call(obj, key), obj[key]]);
    obj[key] = value;
  }

  unhook() {
    for (let i = this.restore.length - 1; i >= 0; i--) {
      const [obj, key, own, prev] = this.restore[i];
      if (own) obj[key] = prev; else delete obj[key];
    }
    this.restore.length = 0;
  }

  installHost() {
    const g = this, G = this.g, W = G.world, H = G.horde, fx = G.particles, au = G.audio;
    // Every lasting change to the voxels goes out to the guests.
    const set = W.set;
    this.hook(W, 'set', function (x, y, z, id, record = true) {
      const ok = set.call(this, x, y, z, id, record);
      if (ok && record) g.editsOut.push(x, y, z, id);
      return ok;
    });
    // The guests are people the dead go for, and a bite on one is sent to them.
    const hitHuman = H.onHitHuman;
    this.hook(H, 'onHitHuman', (h) => (h.coopPeer ? this.bite(h.coopPeer) : hitHuman(h)));
    // A blast hurts any player near it, not only the host.
    const explode = G.explode;
    this.hook(G, 'explode', function (x, y, z, radius, strength, dmg, hostile = false, loud = false) {
      const out = explode.call(this, x, y, z, radius, strength, dmg, hostile, loud);
      for (const p of g.peers.values()) {
        const q = p.pose;
        if (!p.welcomed || !q || !q.alive) continue;
        const d = Math.hypot(q.x - x, q.y + 1.2 - y, q.z - z);
        if (d < radius * 2.1 && W.los(x, y, z, q.x, q.y + 1.2, q.z)) g.send(p.id, { t: 'hurt', d: dmg * .24 * (1 - d / (radius * 2.1)), x, z, k: 'blast' });
      }
      return out;
    });
    // What a guest would see and hear of the fight round them.
    const rec = (k, args, n) => {
      if (this.fxOut.length > 900 || (this.quiet && (k === 'k' || k === 't'))) return;
      const x = args[0], z = args[2];
      if (x === undefined || !this.nearPeer(x, z)) return;
      const e = [k];
      for (let i = 0; i < n; i++) e.push(typeof args[i] === 'number' ? r2(args[i]) : args[i]);
      this.fxOut.push(e);
    };
    const wrap = (obj, key, k, n) => { const f = obj[key]; this.hook(obj, key, function (...a) { rec(k, a, n); return f.apply(this, a); }); };
    wrap(fx, 'blood', 'b', 8); wrap(fx, 'gore', 'g', 4); wrap(fx, 'explosion', 'x', 4); wrap(fx, 'debris', 'd', 6);
    wrap(fx, 'tracer', 't', 6); wrap(fx, 'spark', 'k', 7);
    wrap(au, 'explosion', 'X', 5); wrap(au, 'moan', 'm', 4); wrap(au, 'bodyFall', 'f', 4);
    const gun = au.gun, simple = au.simple;
    this.hook(au, 'gun', function (kind, x, y, z, npc = false) {
      // Your own shots have no place: they are where you are.
      if (x === undefined) { const e = G.player.eyePos(); rec('G', [e[0], e[1], e[2], kind], 4); } else rec('G', [x, y, z, kind, npc], 5);
      return gun.call(this, kind, x, y, z, npc);
    });
    const loudSimple = new Set(['flesh', 'head', 'thump', 'glass', 'block', 'crate']);
    this.hook(au, 'simple', function (kind, x, y, z) {
      if (x !== undefined && loudSimple.has(kind)) rec('s', [x, y, z, kind], 4);
      return simple.call(this, kind, x, y, z);
    });
    H.foci = [];
  }

  installGuest() {
    const c = this, G = this.g, P = G.player, W = G.world;
    // The guest's own changes to the voxels (building, digging, opening a crate) go to the host; the host's come in and are not sent back.
    const set = W.set;
    this.hook(W, 'set', function (x, y, z, id, record = true) {
      const ok = set.call(this, x, y, z, id, record);
      if (ok && record && !c.applying) c.outEdits.push(x, y, z, id);
      return ok;
    });
    // Nothing falls down or burns out here on its own: the host's world decides, and the edits follow.
    this.hook(W, 'onRemoved', null);
    this.hook(W, 'onCollapse', null);
    // Shots: drawn here at once, worked out against the dead on the host.
    this.hook(P, 'traceBullet', (o, dx, dy, dz, it, mx, my, mz, tracer) => {
      const hit = W.raycast(o[0], o[1], o[2], dx, dy, dz, it.range, true), end = hit ? hit.dist : it.range;
      if (hit) G.particles.spark(o[0] + dx * end, o[1] + dy * end, o[2] + dz * end, hit.nx, hit.ny, hit.nz, 3);
      if (tracer) G.particles.tracer(mx, my, mz, o[0] + dx * end, o[1] + dy * end, o[2] + dz * end);
      c.shots.push(r2(dx), r2(dy), r2(dz));
      c.shotO = [r2(o[0]), r2(o[1]), r2(o[2])];
      c.shotW = ITEM_ID.get(it) || P.weapon;
      return false;
    });
    this.hook(P, 'swingMelee', (it) => {
      P.fireCd = it.rate;
      P.swing = it.rate * .58;
      P.swingDur = it.rate * .58;
      G.audio.simple('swing');
      const o = P.eyePos(), f = P.forward();
      c.sendHost({ t: 'melee', w: ITEM_ID.get(it) || P.weapon, o: o.map(r2), f: f.map((v) => Math.round(v * 1000) / 1000) });
    });
    // A grenade or a rocket going off: the host blows the hole, and the blast comes back as sights and sounds.
    this.hook(G, 'explode', (x, y, z, radius, strength, dmg, hostile = false, loud = false) => {
      c.sendHost({ t: 'boom', a: [r2(x), r2(y), r2(z), radius, strength, dmg, hostile, loud] });
    });
  }

  // --- Ending ----------------------------------------------------------------------------------------------------------------------
  // Leaving a game, for whatever reason. Called from quitToMenu once the host has saved.
  endSession() {
    if (!this.inGame) return;
    if (this.host) for (const p of this.peers.values()) this.send(p.id, { t: 'bye' });
    else if (this.hostId) this.send(this.hostId, { t: 'bye' });
    this.closeChat(true);
    if (this.logEl) this.logEl.innerHTML = '';
    this.unhook();
    this.g.horde.foci = null;
    this.inGame = false;
    this.g.coop = null;
    this.g.sleepFx = false;
    this.puppets = [];
    if (this.ticker) this.ticker.postMessage(0);
    clearTimeout(this.helloTimer);
    this.welcomeAt = 0;
    this.welcomeMsg = null;
    this.baseParts = null;
    this.peers.clear();
    this.role = null;
    this.net.leave().catch(() => {});
  }

  // The other side is gone. A guest goes back to the title screen; the host carries on.
  lost(why) {
    if (!this.guest) return;
    if (this.inGame) {
      this.g.quitToMenu();
      this.openMenu(why);
    } else {
      this.role = null;
      this.net.leave().catch(() => {});
      this.view = 'browse';
      this.status = why;
      this.render();
    }
  }

  dropPeer(id, why) {
    const p = this.peers.get(id);
    if (!p) return;
    this.peers.delete(id);
    if (this.inGame && p.welcomed) this.g.ui.toast(`${p.name} ${why === 'timeout' ? 'lost connection' : 'left the game'}.`, 'bad');
    if (this.view === 'lobby') this.render();
  }

  // --- Messages ----------------------------------------------------------------------------------------------------------------------
  send(to, m) { if (to && this.net) this.net.send(to, jsonPacket(m), true); }
  sendHost(m) { if (this.hostId) this.send(this.hostId, m); }
  sendAll(m) { const b = jsonPacket(m); for (const p of this.peers.values()) if (p.welcomed) this.net.send(p.id, b, true); }

  onPacket(from, data) {
    if (!this.role || !data || !data.length) return;
    if (this.guest && from !== this.hostId) return;
    if (this.guest) this.lastHeard = performance.now();
    const peer = this.host ? this.peers.get(from) : null;
    if (peer) peer.lastHeard = performance.now();
    if (data[0] === P_JSON) {
      let m;
      try { m = JSON.parse(dec.decode(data.subarray(1))); } catch { return; }
      if (this.host) this.hostMsg(from, m); else this.guestMsg(m);
    } else if (data[0] === P_SNAP && this.guest && this.inGame) this.snapChunk(data);
    else if (data[0] === P_POSE) {
      const q = this.readPose(data);
      if (this.guest) this.hostPose = q;
      else if (peer) { peer.pose = q; if (!peer.draw) peer.draw = { x: q.x, y: q.y, z: q.z, yaw: q.yaw, phase: 0 }; }
    }
  }

  hostMsg(from, m) {
    const g = this.g;
    if (m.t === 'hello') {
      if (m.v !== this.version()) { this.send(from, { t: 'refused', why: 'That game is on a different version of Spadeheart.' }); return; }
      let p = this.peers.get(from);
      if (!p) { p = { id: from, name: String(m.name || 'Player').slice(0, 20), welcomed: false, lastHeard: performance.now(), state: {} }; this.peers.set(from, p); }
      this.names[from] = p.name;
      if (this.inGame && g.state === 'play') { if (!p.welcomed) this.welcome(p); } else this.send(from, { t: 'lobby', started: this.inGame });
      if (this.view === 'lobby') this.render();
      return;
    }
    const p = this.peers.get(from);
    if (!p) return;
    if (m.t === 'bye') { this.dropPeer(from, 'left'); return; }
    if (!p.welcomed || !this.inGame) return;
    if (m.t === 'me') { p.state = m; p.name = String(m.name || p.name).slice(0, 20); }
    else if (m.t === 'edits') {
      const e = m.e || [];
      for (let k = 0; k + 3 < e.length; k += 4) g.world.set(e[k] | 0, e[k + 1] | 0, e[k + 2] | 0, e[k + 3] | 0);
    } else if (m.t === 'say') {
      const text = String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!text || g.time - (p.saidAt ?? -9) < .4) return;
      p.saidAt = g.time;
      this.heard(p.id, p.name, text);
      for (const o of this.peers.values()) if (o !== p && o.welcomed) this.send(o.id, { t: 'say', id: p.id, name: p.name, text });
    } else if (m.t === 'fire') this.remoteFire(p, m);
    else if (m.t === 'melee') this.remoteMelee(p, m);
    else if (m.t === 'boom' && Array.isArray(m.a)) {
      const got = this.remote(() => g.explode(...m.a));
      if (got.length) this.send(p.id, { t: 'hit', any: false, kills: 0, salv: got });
    }
  }

  guestMsg(m) {
    const g = this.g;
    if (m.t === 'lobby' || m.t === 'starting') {
      this.hostStarted = m.t === 'starting' || !!m.started;
      if (this.view === 'lobby') this.render();
    } else if (m.t === 'refused') this.lost(m.why);
    else if (m.t === 'bye') this.lost('The host left the game.');
    else if (m.t === 'welcome') {
      if (this.inGame) return;
      this.welcomeAt = performance.now();
      this.welcomeMsg = m;
      this.baseParts = new Array(m.parts).fill(null);
      clearTimeout(this.helloTimer);
    } else if (m.t === 'base') {
      if (!this.baseParts || this.inGame) return;
      this.baseParts[m.k] = m.list;
      if (this.baseParts.every((q) => q)) this.startGuest();
    }
    if (!this.inGame) return;
    if (m.t === 'e') this.applyEdits(m.e);
    else if (m.t === 'fx') this.playFx(m.l);
    else if (m.t === 'w') this.worldState(m);
    else if (m.t === 'hurt') { if (g.player.alive) g.player.damage(m.d, m.x ?? null, m.z ?? null, m.k || 'bite'); }
    else if (m.t === 'hit') {
      if (m.any) g.ui.hitMarker(!!m.melee);
      g.player.kills += m.kills || 0;
      for (const [id, n] of m.salv || []) g.salvage(id, n);
    } else if (m.t === 'sleep') {
      g.sleepFx = true;
      g.ui.sleepVeil(true);
      g.audio.duck(true);
    } else if (m.t === 'woke') this.wokeWithHost(m);
    else if (m.t === 'say') this.heard(m.id, String(m.name || '').slice(0, 20), String(m.text || '').slice(0, 120));
  }

  // --- Chat: T to say something --------------------------------------------------------------------------------------------------------
  // Said out loud, as the people of the city talk: over the speaker's head, a letter at a time, for anyone near enough to hear. A short
  // log in the corner keeps the last few lines, for when they are out of sight.
  setupChat() {
    if (this.chatEl) return;
    this.chatEl = document.getElementById('coop-chat');
    this.logEl = document.getElementById('coop-log');
    const input = this.chatEl && this.chatEl.querySelector('input');
    if (!input) return;
    this.chatInput = input;
    // Keys typed here are words, not moves: none of them reach the game.
    const stop = (e) => e.stopPropagation();
    input.addEventListener('keyup', stop);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') { e.preventDefault(); this.say(input.value); this.closeChat(); }
      else if (e.code === 'Escape') { e.preventDefault(); this.closeChat(); }
    });
    input.addEventListener('blur', () => { if (this.chatting) this.closeChat(); });
  }

  openChat() {
    const g = this.g;
    this.setupChat();
    if (!this.chatInput || this.chatting || !this.inGame || g.state !== 'play' || g.ui.modal) return;
    this.chatting = true;
    g.chatting = true;
    g.input.keys = {};
    g.input.mouse = [false, false, false];
    this.chatInput.value = '';
    this.chatEl.classList.add('on');
    this.chatInput.focus();
  }

  closeChat(quiet = false) {
    if (!this.chatting) return;
    this.chatting = false;
    this.chatEl.classList.remove('on');
    this.chatInput.blur();
    const g = this.g;
    g.input.keys = {};
    // Escape may have let go of the mouse on the way out; take it back, and only then count the chat as over.
    if (!quiet && g.state === 'play' && !g.ui.modal) g.lock();
    setTimeout(() => { g.chatting = false; }, 300);
  }

  say(raw) {
    const text = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text || !this.inGame) return;
    const name = this.g.player.charName || this.net.selfName;
    this.chatLine(name, text);
    if (this.host) this.sendAll({ t: 'say', id: this.net.selfId, name, text });
    else this.sendHost({ t: 'say', text });
  }

  heard(id, name, text) {
    if (!text) return;
    this.chatLine(name, text);
    const a = this.anchorFor(id, name);
    if (a) this.g.ui.floatSay(a, text, 4.5);
  }

  chatLine(name, text) {
    const log = this.logEl;
    if (!log) return;
    const line = document.createElement('div'), b = document.createElement('b');
    b.textContent = name;
    line.append(b, document.createTextNode(text));
    log.appendChild(line);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => line.classList.add('old'), 9000);
    setTimeout(() => line.remove(), 10500);
  }

  // Something for the words to hang over: where that player's body is drawn here.
  anchorFor(id, name) {
    if (this.host) {
      const p = this.peers.get(id);
      if (!p || !p.draw) return null;
      Object.assign(p.draw, { name: p.name, dead: false, state: 0 });
      return p.draw;
    }
    let a = this.anchors.get(id);
    if (!a) {
      const r = this.roster.find((q) => q.id === id), h = id === this.hostId ? this.hostPose : null, at = h || (r && r.x !== undefined ? r : null);
      if (!at) return null;
      a = { id, name, x: at.x, y: at.y, z: at.z, yaw: 0, state: 0, dead: false };
      this.anchors.set(id, a);
    }
    return a;
  }

  // Each speaker's place, followed every frame: the host from their pose; another guest from the body of theirs in the snapshot.
  updateAnchors(dt) {
    const k = 1 - Math.exp(-dt * 14);
    for (const [id, a] of this.anchors) {
      let t = id === this.hostId ? this.hostPose : null;
      if (!t) {
        const r = this.roster.find((q) => q.id === id), v = bodyVariant(id);
        let best = null, bd = 64;
        for (const p of this.puppets) {
          if (p.variant !== v || p.kind !== 0) continue;
          const d = r && r.x !== undefined ? (p.x - r.x) ** 2 + (p.z - r.z) ** 2 : 0;
          if (d < bd) { bd = d; best = p; }
        }
        t = best || (r && r.x !== undefined ? r : null);
      }
      if (!t) continue;
      if (Math.hypot(t.x - a.x, t.z - a.z) > 8) { a.x = t.x; a.y = t.y; a.z = t.z; } else { a.x += (t.x - a.x) * k; a.y += (t.y - a.y) * k; a.z += (t.z - a.z) * k; }
    }
  }

  // --- Host: working out a guest's actions ---------------------------------------------------------------------------------------
  // Runs the host's own code for it, as if a player stood where the guest is: no hit marker, no swing sound or salvage for the host.
  remote(fn) {
    const g = this.g, au = g.audio, simple = au.simple, hm = g.ui.hitMarker, sal = g.salvage, got = [];
    au.simple = function (kind, x, y, z) { if (x === undefined) return; return simple.call(this, kind, x, y, z); };
    g.ui.hitMarker = () => {};
    g.salvage = (id, n) => { got.push([id, n]); };
    this.quiet = true;
    try { fn(); } catch (e) { console.warn('co-op: remote action failed', e); } finally { au.simple = simple; g.ui.hitMarker = hm; g.salvage = sal; this.quiet = false; }
    return got;
  }

  stand(o, f) {
    const p = Object.create(Player.prototype);
    Object.assign(p, { g: this.g, kills: 0, headshots: 0, rayOut: [], x: o[0], y: o[1] - 2.4, z: o[2], sanctuary: false, shake: 0, kickX: 0, kickY: 0, vmKick: 0, hitStop: 0, swing: 0, swingDur: 0, fireCd: 0 });
    p.eyePos = () => o.slice();
    p.forward = () => f.slice();
    return p;
  }

  remoteFire(peer, m) {
    const g = this.g, it = ITEMS[m.w], r = m.r || [], o = m.o;
    if (!it || it.type !== 'gun' || !Array.isArray(o) || r.length > 3 * 16) return;
    const stand = this.stand(o, [r[0], r[1], r[2]]);
    let any = false;
    this.remote(() => {
      for (let k = 0; k + 2 < r.length; k += 3) any = stand.traceBullet(o, r[k], r[k + 1], r[k + 2], it, o[0], o[1], o[2], false) || any;
      g.audio.gun(it.sound, o[0], o[1], o[2], true);
      g.horde.noise(o[0], o[2], it.noise * .55, .9);
    });
    this.send(peer.id, { t: 'hit', any, kills: stand.kills });
  }

  remoteMelee(peer, m) {
    const it = ITEMS[m.w];
    if (!it || it.type !== 'melee' || !Array.isArray(m.o) || !Array.isArray(m.f)) return;
    const stand = this.stand(m.o, m.f);
    const got = this.remote(() => stand.swingMelee(it));
    this.send(peer.id, { t: 'hit', any: stand.hitStop > 0, melee: true, kills: stand.kills, salv: got });
  }

  bite(peer) {
    const g = this.g, now = g.time;
    if (!peer.pose || !peer.pose.alive || now - (peer.lastBite ?? -9) < .8) return;
    peer.lastBite = now;
    this.send(peer.id, { t: 'hurt', d: r2((4.2 + Math.random() * 4.2) * g.horde.settings.damage), k: 'bite' });
  }

  nearPeer(x, z) {
    for (const p of this.peers.values()) { const q = p.pose; if (q && Math.abs(q.x - x) < 120 && Math.abs(q.z - z) < 120) return true; }
    return false;
  }

  // Somewhere free beside the host, for a guest arriving or brought back.
  besideHost(from = this.g.player) {
    const P = this.g.player;
    for (let k = 0; k < 16; k++) {
      const a = k * 2.4, r = 1.6 + (k >> 3);
      const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
      if (!P.collides(x, from.y, z, P.height || 2.6) && P.collides(x, from.y - .3, z, .2)) return { x, y: from.y, z, yaw: from.yaw || 0 };
    }
    return { x: from.x, y: from.y, z: from.z, yaw: from.yaw || 0 };
  }

  // --- Poses ---------------------------------------------------------------------------------------------------------------------
  poseOf(P) {
    const it = P.weapon ? ITEMS[P.weapon] : null, moving = Math.hypot(P.vx, P.vz) > .6;
    const ready = !!it && it.type === 'gun' && (P.ads > .3 || P.fireCd > 0);
    return { x: P.x, y: P.y, z: P.z, yaw: P.yaw, pitch: P.pitch, alive: P.alive, moving, crouch: !!P.crouch, ready, swing: P.swing > 0, w: BODY_WEAPON[P.weapon] || 0, hp: Math.max(0, Math.round(P.health)) };
  }

  writePose(q) {
    const b = new Uint8Array(24), v = new DataView(b.buffer);
    b[0] = P_POSE;
    v.setFloat32(1, q.x, true); v.setFloat32(5, q.y, true); v.setFloat32(9, q.z, true); v.setFloat32(13, q.yaw, true); v.setFloat32(17, q.pitch, true);
    b[21] = (q.alive ? 1 : 0) | (q.moving ? 2 : 0) | (q.crouch ? 4 : 0) | (q.ready ? 8 : 0) | (q.swing ? 16 : 0);
    b[22] = q.w; b[23] = Math.min(255, q.hp);
    return b;
  }

  readPose(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength), f = b[21];
    return { x: v.getFloat32(1, true), y: v.getFloat32(5, true), z: v.getFloat32(9, true), yaw: v.getFloat32(13, true), pitch: v.getFloat32(17, true), alive: !!(f & 1), moving: !!(f & 2), crouch: !!(f & 4), ready: !!(f & 8), swing: !!(f & 16), w: b[22], hp: b[23], t: performance.now() };
  }

  // A player's body, as the people of the city are drawn. Facing: a player's yaw points along (sin, -cos), a body's along (sin, cos).
  pushBody(A, id, d, q) {
    const st = !q.alive ? 10 + Math.min(60, this.g.time - (d.downAt ?? this.g.time)) : q.moving ? .7 : 0;
    const aim = q.ready ? Math.max(0, Math.min(63, Math.round((q.pitch + .8) / 1.2 * 63))) : 42;
    const extra = q.w * 2 + aim * 32768 + (q.ready ? 2097152 : 0);
    if (A.add) A.push(0, d.x, d.y, d.z, Math.PI - d.yaw, d.phase, st, bodyVariant(id), extra);
    else {
      const cam = this.g.renderer.camPos, dx = d.x - cam[0], dz = d.z - cam[2];
      A.push(dx * dx + dz * dz < 50 * 50 ? 0 : 1, d.x, d.y, d.z, Math.PI - d.yaw, d.phase, st, bodyVariant(id), extra);
    }
  }

  // Smoothly after the last pose heard: walking, turning, and down if they are down.
  follow(d, q, dt) {
    const k = 1 - Math.exp(-dt * 14), ox = d.x, oz = d.z;
    if (Math.hypot(q.x - d.x, q.z - d.z) > 8) { d.x = q.x; d.y = q.y; d.z = q.z; } else { d.x += (q.x - d.x) * k; d.y += (q.y - d.y) * k; d.z += (q.z - d.z) * k; }
    d.yaw += wrapPi(q.yaw - d.yaw) * k;
    const sp = Math.min(9, Math.hypot(d.x - ox, d.z - oz) / Math.max(dt, 1e-3));
    d.phase += sp * dt * 2.1;
    if (!q.alive && d.downAt === undefined) d.downAt = this.g.time;
    if (q.alive) d.downAt = undefined;
  }

  // --- Every frame -----------------------------------------------------------------------------------------------------------------
  // Always, in any state: who has gone quiet. Called from Game.step.
  frame() {
    if (!this.role) return;
    const now = performance.now();
    // Still here, even through a loading screen.
    if ((this.inGame || this.welcomeAt) && now - (this.kaAt || 0) > 2000) {
      this.kaAt = now;
      if (this.host) { for (const p of this.peers.values()) if (p.welcomed) this.send(p.id, { t: 'ka' }); } else this.sendHost({ t: 'ka' });
    }
    if (this.host) {
      for (const p of [...this.peers.values()]) if (now - p.lastHeard > TIMEOUT_S * 1000) this.dropPeer(p.id, 'timeout');
    } else if (this.guest && (this.inGame || this.welcomeAt) && now - (this.lastHeard || now) > TIMEOUT_S * 1000) this.lost('Lost the connection to the host.');
  }

  // In play, once the rest of the frame has run. Called from Game.updatePlay.
  tick(dt) {
    if (this.host) this.hostTick(dt); else this.guestTick(dt);
    this.downTick(dt);
  }

  hostTick(dt) {
    const g = this.g, P = g.player, H = g.horde;
    const foci = H.foci || (H.foci = []);
    foci.length = 0;
    for (const p of this.peers.values()) {
      if (!p.welcomed) continue;
      if (p.welcomedSent === undefined) p.welcomedSent = true;
      const q = p.pose;
      if (!q) continue;
      this.follow(p.draw, q, dt);
      // The dead go for them like anyone else in the street.
      const h = p.human || (p.human = { coopPeer: p, kind: 'player', x: 0, y: 0, z: 0, dead: false });
      h.x = q.x; h.y = q.y; h.z = q.z; h.dead = !q.alive;
      if (q.alive) { if (!H.humans.includes(h)) H.humans.push(h); foci.push(q); }
    }
    this.hostPhase += Math.min(9, Math.hypot(P.vx, P.vz)) * dt * 2.1;
    if ((this.poseT -= dt) <= 0) {
      this.poseT = 1 / POSE_HZ;
      const b = this.writePose(this.poseOf(P));
      for (const p of this.peers.values()) if (p.welcomed) this.net.send(p.id, b, false);
    }
    if ((this.snapT -= dt) <= 0) {
      this.snapT = 1 / SNAP_HZ;
      for (const p of this.peers.values()) if (p.welcomed && p.pose) this.sendSnapshot(p);
      if (this.editsOut.length) { this.sendAll({ t: 'e', e: this.editsOut }); this.editsOut = []; }
      if (this.fxOut.length) { this.sendAll({ t: 'fx', l: this.fxOut }); this.fxOut = []; }
    }
    if ((this.worldT -= dt) <= 0) {
      this.worldT = 1 / WORLD_HZ;
      if ([...this.peers.values()].some((p) => p.welcomed)) this.sendAll(this.worldMsg());
    }
  }

  worldMsg() {
    const g = this.g, P = g.player, it = P.weapon && ITEMS[P.weapon];
    const ros = [{ id: this.net.selfId, name: P.charName, host: true, health: P.alive ? P.health : 0, alive: P.alive, kills: P.kills || 0, scrip: P.scrip || 0, weapon: it && (it.type === 'gun' || it.type === 'melee') ? it.name : 'Unarmed', armour: !!P.armor, days: Math.max(1, g.day - (P.bornDay || g.day) + 1), home: P.home, x: r2(P.x), y: r2(P.y), z: r2(P.z) }];
    for (const p of this.peers.values()) if (p.welcomed) ros.push({ id: p.id, name: p.name, ...this.peerCard(p), ...(p.pose ? { x: r2(p.pose.x), y: r2(p.pose.y), z: r2(p.pose.z) } : {}) });
    const crew = g.npcs.followers.filter((f) => !f.dead).map((f) => ({ name: f.name, hp: f.hp, maxHp: f.maxHp, bond: f.bond || 'Member', weapon: CREW_GUN_NAMES[f.weaponName] || 'Unarmed', away: !!(f.order && f.order !== 'call' && f.order !== 'gate') }));
    return { t: 'w', tod: g.tod, day: g.day, wx: g.weather.toSave(), cs: g.campSim.state.map((s) => s.status), rep: P.crewRep || 0, ros, crew };
  }

  peerCard(p) {
    const s = p.state || {}, q = p.pose;
    return { health: q ? (q.alive ? q.hp : 0) : s.health ?? 100, alive: q ? q.alive : true, kills: s.kills || 0, scrip: s.scrip || 0, weapon: s.weapon || 'Unarmed', armour: !!s.armour, days: s.days || 1, home: s.home ?? -1 };
  }

  sendSnapshot(peer) {
    const g = this.g, H = g.horde, R = g.renderer, rec = this.rec, q = peer.pose;
    rec.begin(q.x, q.z, SNAP_R);
    const keepA = H.actors, keepG = g.actors, keepPos = R.camPos, keepF = R.camForward, keepVis = H.visibleCount;
    H.actors = rec; g.actors = rec;
    R.camPos = [q.x, q.y + 2, q.z]; R.camForward = [0, 0, 0];
    try {
      H.fillInstances(R.camPos, R.camForward, 1, 1);
      g.npcs.draw();
      g.dogs.draw(rec);
    } finally { H.actors = keepA; g.actors = keepG; R.camPos = keepPos; R.camForward = keepF; H.visibleCount = keepVis; }
    // The host, and any other guest.
    const P = g.player;
    this.pushBody(rec, this.net.selfId, { x: P.x, y: P.y, z: P.z, yaw: P.yaw, phase: this.hostPhase, downAt: this.hostDownAt }, this.poseOf(P));
    for (const o of this.peers.values()) if (o !== peer && o.welcomed && o.pose && o.draw) this.pushBody(rec, o.id, o.draw, o.pose);
    // Nearest first, if there are more than a snapshot carries.
    let order = null, n = rec.n;
    if (n > SNAP_MAX) {
      order = Array.from({ length: n }, (_, i) => i).sort((a, b) => rec.d[a * 10 + 9] - rec.d[b * 10 + 9]);
      n = SNAP_MAX;
    }
    const ox = Math.round(q.x), oz = Math.round(q.z), parts = Math.max(1, Math.ceil(n / PER_PACKET)), seq = (this.seq = (this.seq + 1) & 255);
    for (let part = 0; part < parts; part++) {
      const from = part * PER_PACKET, cnt = Math.min(PER_PACKET, n - from);
      const b = new Uint8Array(SNAP_HEAD + cnt * INST), v = new DataView(b.buffer);
      b[0] = P_SNAP; b[1] = seq; b[2] = part; b[3] = parts;
      v.setFloat32(4, ox, true); v.setFloat32(8, oz, true); v.setUint16(12, cnt, true);
      for (let j = 0; j < cnt; j++) {
        const i = order ? order[from + j] : from + j, k = i * 10, d = rec.d, o = SNAP_HEAD + j * INST;
        v.setInt16(o, Math.max(-32767, Math.min(32767, Math.round((d[k] - ox) * 32))), true);
        v.setInt16(o + 2, Math.max(-32767, Math.min(32767, Math.round(d[k + 1] * 32))), true);
        v.setInt16(o + 4, Math.max(-32767, Math.min(32767, Math.round((d[k + 2] - oz) * 32))), true);
        const yaw = ((d[k + 3] % 6.283185) + 6.283185) % 6.283185;
        b[o + 6] = Math.round(yaw / 6.283185 * 256) & 255;
        b[o + 7] = d[k + 8];
        v.setFloat32(o + 8, d[k + 4], true);
        v.setFloat32(o + 12, d[k + 5], true);
        v.setUint16(o + 16, d[k + 6], true);
        v.setFloat32(o + 18, d[k + 7], true);
      }
      this.net.send(peer.id, b, false);
    }
  }

  // --- Guest: the world as the host sends it -------------------------------------------------------------------------------------
  snapChunk(b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength), seq = b[1], part = b[2], parts = b[3];
    // Anything older than the snapshot being put together is too late to use.
    if (this.rx && seq !== this.rx.seq && ((seq - this.rx.seq) & 255) > 128) return;
    if (!this.rx || this.rx.seq !== seq) this.rx = { seq, parts: new Array(parts).fill(null), got: 0 };
    if (this.rx.parts[part]) return;
    this.rx.parts[part] = b;
    if (++this.rx.got < parts) return;
    const list = [];
    for (const p of this.rx.parts) {
      const w = new DataView(p.buffer, p.byteOffset, p.byteLength), ox = w.getFloat32(4, true), oz = w.getFloat32(8, true), cnt = w.getUint16(12, true);
      for (let j = 0; j < cnt; j++) {
        const o = SNAP_HEAD + j * INST;
        list.push({
          x: ox + w.getInt16(o, true) / 32, y: w.getInt16(o + 2, true) / 32, z: oz + w.getInt16(o + 4, true) / 32, yaw: p[o + 6] / 256 * 6.283185,
          kind: p[o + 7], phase: w.getFloat32(o + 8, true), state: w.getFloat32(o + 12, true), variant: w.getUint16(o + 16, true), extra: w.getFloat32(o + 18, true),
        });
      }
    }
    void v;
    this.applySnapshot(list);
  }

  // Each body in the new snapshot is matched to the one it was in the last (same look, close by), so it walks there rather than jumps.
  applySnapshot(list) {
    const now = this.g.time, gap = Math.max(.02, Math.min(.5, now - (this.snapAt ?? now - 1 / SNAP_HZ)));
    this.snapAt = now;
    const old = this.puppets, cells = new Map(), key = (x, z) => (Math.floor(x / 4) + 4096) * 8192 + Math.floor(z / 4) + 4096;
    for (const p of old) { const k = key(p.tx, p.tz); const c = cells.get(k); if (c) c.push(p); else cells.set(k, [p]); }
    const out = [];
    for (const s of list) {
      let best = null, bd = 9;
      const cx = Math.floor(s.x / 4), cz = Math.floor(s.z / 4);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const c = cells.get((cx + dx + 4096) * 8192 + cz + dz + 4096);
        if (!c) continue;
        for (const p of c) {
          if (p.used || p.variant !== s.variant || p.kind !== s.kind) continue;
          const d = (p.tx - s.x) ** 2 + (p.ty - s.y) ** 2 + (p.tz - s.z) ** 2;
          if (d < bd) { bd = d; best = p; }
        }
      }
      if (best) {
        best.used = true;
        best.prate = Math.max(0, Math.min(40, (s.phase - best.tphase) / gap));
        best.tx = s.x; best.ty = s.y; best.tz = s.z; best.tyaw = s.yaw; best.tphase = s.phase; best.state = s.state; best.extra = s.extra;
        out.push(best);
      } else out.push({ x: s.x, y: s.y, z: s.z, yaw: s.yaw, phase: s.phase, tx: s.x, ty: s.y, tz: s.z, tyaw: s.yaw, tphase: s.phase, prate: 0, state: s.state, variant: s.variant, extra: s.extra, kind: s.kind });
    }
    for (const p of out) p.used = false;
    this.puppets = out;
  }

  applyEdits(e) {
    const W = this.g.world;
    this.applying = true;
    try {
      for (let k = 0; k + 3 < e.length; k += 4) {
        const x = e[k], y = e[k + 1], z = e[k + 2], id = e[k + 3];
        if (W.set(x, y, z, id)) continue;
        // Not loaded here yet (or already so): kept with the rest, for when it is.
        if (y < 0 || y >= WY || x < 0 || z < 0 || x >= WX || z >= WZ) continue;
        const cx = x >> 5, cy = y >> 5, cz = z >> 5, i = cx + cz * CW + cy * COL, col = cx + cz * CW;
        let m = W.edits.get(i);
        if (!m) { m = new Map(); W.edits.set(i, m); }
        m.set((x & 31) | ((y & 31) << 5) | ((z & 31) << 10), id);
        if (cy > W.editTop[col]) W.editTop[col] = cy;
      }
    } finally { this.applying = false; }
  }

  playFx(list) {
    const g = this.g, fx = g.particles, au = g.audio;
    for (const e of list || []) {
      const [k, x, y, z, a, b, c, d, f] = e;
      switch (k) {
        case 'b': fx.blood(x, y, z, a, b, c, d, f); break;
        case 'g': fx.gore(x, y, z, a); break;
        case 'x': fx.explosion(x, y, z, a); g.tempLights.push({ x, y: y + 1, z, r: a * 10, cr: 22, cg: 12, cb: 4, t: .55, max: .55 }); break;
        case 'd': fx.debris(x, y, z, a, b, c); break;
        case 't': fx.tracer(x, y, z, a, b, c); break;
        case 'k': fx.spark(x, y, z, a, b, c, d); break;
        case 'X': au.explosion(x, y, z, a, b); { const P = g.player, dd = Math.hypot(P.x - x, P.y + 1.2 - y, P.z - z); g.explFlash = Math.max(g.explFlash, Math.min(1, 25 / (dd * dd + 5))); P.shake = Math.min(1.4, P.shake + Math.min(1, a * 35 / (dd + 2))); } break;
        case 'm': au.moan(x, y, z, a); break;
        case 'f': au.bodyFall(x, y, z, a); break;
        case 'G': au.gun(a, x, y, z, true); break;
        case 's': au.simple(a, x, y, z); break;
        default: break;
      }
    }
  }

  worldState(m) {
    const g = this.g, P = g.player;
    // Small differences in the clock are let go; a big one (the host slept) is taken at once.
    if (Math.abs(((m.tod - g.tod + 1.5) % 1) - .5) > .002 || m.day !== g.day) { g.tod = m.tod; g.day = m.day; }
    g.weather.fromSave(m.wx);
    let lights = false;
    (m.cs || []).forEach((s, i) => { const st = g.campSim.state[i]; if (st && st.status !== s) { st.status = s; lights = true; } });
    if (lights) g.refreshCityLights();
    P.crewRep = m.rep || 0;
    this.roster = m.ros || [];
    this.crew = m.crew || [];
    const h = this.roster.find((r) => r.host);
    this.hostName = h ? h.name : this.hostName;
  }

  wokeWithHost(m) {
    const g = this.g, P = g.player, share = m.share || 0, slept = m.slept || 0;
    if (P.alive) {
      P.stamina = 100;
      P.infection = Math.max(0, P.infection - 15 * share);
      P.health = Math.min(100, P.health + 18 * share);
      P.hunger = Math.max(0, P.hunger - slept * 100 / 4500);
      P.rest = Math.min(100, P.rest + 100 * share);
    }
    g.tod = m.tod; g.day = m.day;
    setTimeout(() => g.wake(), 600);
  }

  guestTick(dt) {
    const g = this.g, P = g.player, H = g.horde;
    // Sent at once, as they happen.
    if (this.shots.length) { this.sendHost({ t: 'fire', w: this.shotW, o: this.shotO, r: this.shots }); this.shots = []; }
    if (this.outEdits.length) { this.sendHost({ t: 'edits', e: this.outEdits }); this.outEdits = []; }
    if ((this.poseT -= dt) <= 0) { this.poseT = 1 / POSE_HZ; this.net.send(this.hostId, this.writePose(this.poseOf(P)), false); }
    if ((this.meT -= dt) <= 0) {
      this.meT = 1;
      const it = P.weapon && ITEMS[P.weapon];
      this.sendHost({ t: 'me', name: P.charName, health: P.alive ? P.health : 0, alive: P.alive, kills: P.kills || 0, scrip: P.scrip || 0, weapon: it && (it.type === 'gun' || it.type === 'melee') ? it.name : 'Unarmed', armour: !!P.armor, days: Math.max(1, g.day - (P.bornDay || g.day) + 1), home: P.home });
    }
    // The bodies walk on between snapshots towards where they were last seen.
    const k = 1 - Math.exp(-dt * 14), age = Math.min(.25, g.time - (this.snapAt ?? g.time));
    let near = 0, chasing = 0;
    for (const p of this.puppets) {
      if (Math.abs(p.tx - p.x) + Math.abs(p.tz - p.z) > 6) { p.x = p.tx; p.y = p.ty; p.z = p.tz; } else { p.x += (p.tx - p.x) * k; p.y += (p.ty - p.y) * k; p.z += (p.tz - p.z) * k; }
      p.yaw += wrapPi(p.tyaw - p.yaw) * k;
      p.phase = p.tphase + p.prate * age;
      if (p.kind === 0 && p.variant < HUMAN_VARIANT_START && p.state < 10 && Math.abs(p.x - P.x) + Math.abs(p.z - P.z) < 56) { near++; if (p.state >= 1) chasing++; }
    }
    H.nearCount = near; H.chasers = chasing;
    this.updateAnchors(dt);
    this.tether();
  }

  // A guest goes only so far from the host: held at the edge, or brought back if they get properly separated.
  tether() {
    const g = this.g, P = g.player, h = this.hostPose;
    if (!h || !P.alive || g.sleepFx) return;
    const dx = P.x - h.x, dz = P.z - h.z, d = Math.hypot(dx, dz);
    if (d > TETHER_FAR || Math.abs(P.y - h.y) > 40) {
      const s = this.besideHost(h);
      P.x = s.x; P.y = s.y; P.z = s.z; P.vx = P.vy = P.vz = 0;
      g.world.lastCX = -999;
      g.ui.toast(`Back with ${this.hostName || 'the host'}.`);
      return;
    }
    if (d <= TETHER) return;
    const ux = dx / d, uz = dz / d, out = P.vx * ux + P.vz * uz;
    if (out > 0) { P.vx -= ux * out; P.vz -= uz * out; }
    const nx = h.x + ux * TETHER, nz = h.z + uz * TETHER;
    if (!P.collides(nx, P.y, nz, P.height || 2.6)) { P.x = nx; P.z = nz; }
    if (g.time - (this.tetherSaid ?? -9) > 4) { this.tetherSaid = g.time; g.ui.toast(`Too far from ${this.hostName || 'the host'}.`, 'bad'); }
  }

  // --- Down and back up ------------------------------------------------------------------------------------------------------------
  // In co-op nobody dies for good: down for a few seconds, then up again beside whoever is still standing. If nobody is, the host
  // comes round at a settlement, and the guests with them.
  onDeath() {
    const g = this.g;
    this.downT = 0;
    if (this.host) this.hostDownAt = g.time;
    g.ui.banner('Down', 'Back on your feet in a few seconds, if anyone is still standing.');
  }

  downTick(dt) {
    const g = this.g, P = g.player;
    if (P.alive || g.state !== 'play') return;
    this.downT += dt;
    if (this.downT < REVIVE_S) return;
    if (this.guest) {
      const h = this.hostPose;
      if (h && h.alive) this.revive(this.besideHost(h));
      return;
    }
    const up = [...this.peers.values()].find((p) => p.welcomed && p.pose && p.pose.alive);
    if (up) { this.revive(this.besideHost(up.pose)); return; }
    // Everyone is down.
    const L = g.layout, home = P.home >= 0 ? L.camps[P.home] : null;
    const camp = home && g.campSim.state[home.id].status === 'holding' ? home : g.nearestCamp();
    this.revive(null);
    g.travelTo(camp);
  }

  revive(at) {
    const g = this.g, P = g.player;
    P.alive = true;
    P.health = 50;
    P.deadT = 0;
    P.stamina = 100;
    P.hurtFlash = 0;
    P.eye = 2.45;
    P.pitch = 0;
    P.vx = P.vy = P.vz = 0;
    this.hostDownAt = undefined;
    if (at) { P.x = at.x; P.y = at.y; P.z = at.z; }
    g.audio.deathMusic(false);
    g.ui.toast('Back on your feet.', 'good');
  }

  // --- Host sleeping: the host decides when the group sleeps -----------------------------------------------------------------------
  onSleep() { this.sendAll({ t: 'sleep' }); }
  onWake(share = 0, slept = 0) { this.sendAll({ t: 'woke', share, slept, tod: this.g.tod, day: this.g.day }); }

  // --- Drawing -----------------------------------------------------------------------------------------------------------------------
  // Into the frame alongside the host's own: the guests' bodies for the host; for a guest, everyone the host's game says is about.
  draw() {
    const g = this.g, A = g.actors, cam = g.renderer.camPos;
    if (this.host) {
      for (const p of this.peers.values()) if (p.welcomed && p.pose && p.draw) this.pushBody(A, p.id, p.draw, p.pose);
      return;
    }
    for (const p of this.puppets) {
      const dx = p.x - cam[0], dz = p.z - cam[2], d2 = dx * dx + dz * dz;
      if (p.kind === 1) { A.pushDog(p.x, p.y, p.z, p.yaw, p.phase, p.state, p.variant, p.extra); continue; }
      let lod = d2 < 28 * 28 ? 0 : d2 < 90 * 90 ? 1 : 2;
      if (p.state >= 10 && lod > 1) lod = 1;
      A.push(lod, p.x, p.y, p.z, p.yaw, p.phase, p.state, p.variant, p.extra);
    }
  }

  // A moan for the sound beds, from one of the dead near a guest.
  sampleMoan(P) {
    const list = this.puppets;
    for (let t = 0; t < 6 && list.length; t++) {
      const p = list[Math.floor(Math.random() * list.length)];
      if (p.kind === 0 && p.variant < HUMAN_VARIANT_START && p.state < 10 && Math.hypot(p.x - P.x, p.z - P.z) < 60) return [p.x, p.y + 2, p.z, p.state > 0];
    }
    return null;
  }

  // --- The group panel ---------------------------------------------------------------------------------------------------------------
  // Everyone else in the group: the other players, and (for a guest) the host's crew.
  crewPlayers() {
    const g = this.g, P = g.player, out = [];
    const where = (x, z) => { const d = Math.hypot(x - P.x, z - P.z); return d > 60 ? `${Math.round(d)} m away` : 'With you'; };
    if (this.host) {
      for (const p of this.peers.values()) {
        if (!p.welcomed) continue;
        const c = this.peerCard(p), q = p.pose;
        out.push({ key: `p:${p.id}`, name: p.name, ...c, where: !c.alive ? 'Down' : q ? where(q.x, q.z) : 'Joining' });
      }
      return out;
    }
    for (const r of this.roster) {
      if (r.id === this.net.selfId) continue;
      const q = r.host ? this.hostPose : null;
      const at = q || (r.x !== undefined ? r : null);
      out.push({ key: `p:${r.id}`, name: r.name, health: r.health, alive: r.alive, kills: r.kills, scrip: r.scrip, weapon: r.weapon, armour: r.armour, days: r.days, home: r.home ?? -1, where: !r.alive ? 'Down' : at ? where(at.x, at.z) : 'In the city' });
    }
    this.crew.forEach((f, i) => out.push({ key: `c:${i}:${f.name}`, name: f.name, health: f.maxHp ? f.hp / f.maxHp * 100 : 100, alive: true, kills: 0, scrip: 0, weapon: f.weapon, armour: false, days: 0, home: -1, tag: f.bond, crew: true, owner: this.hostName, where: f.away ? 'Away' : `With ${this.hostName || 'the group'}` }));
    return out;
  }
}
