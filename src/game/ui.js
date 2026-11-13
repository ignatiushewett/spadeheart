// HTML overlay: HUD, menus, inventory, trading, dialogue, maps.
import { WX, WZ, CS } from '../shared/constants.js';
import { ROLES } from '../shared/layout.js';
import { ITEMS, WEAPON_ORDER, KITS, CAMP_START, TRUST_LOCK, START_CAMP, startingGear } from './items.js';
import { DIFFICULTY } from './horde.js';
import { standingName, LORE } from './dialogue.js';
import { OP_PAY } from './npcs.js';
import { OUTBREAK_DAYS } from './campsim.js';
import { opBanner } from './opbanner.js';
import { MODELS as VM_MODELS, LMG_COVER, LMG_BOX } from './viewmodel.js';

const $ = (id) => document.getElementById(id);
// The water as the map canvas paints it, so nothing shows where the map runs out.
const OCEAN = '#152c37';
const SHOW_INFECTED_ON_MAP = false;   // the red wash and the dots for the dead, on the big map
const SHOW_WORLD_MARKERS = false;    // quest markers floating in the 3D view (the compass and the map carry them instead)
const fmt = (n) => Math.round(n).toLocaleString('en-US');
// A camp with nothing happening at it, as the player reads it.
// A day's patrol that is done has nothing left to point at until tomorrow, and a night shift never has one spot to point at.
// An operation is fought all round the settlement you are standing in: a marker in the middle of it points nowhere useful.
const unpointed = (j) => j.unmarked || j.type === 'defend' || (j.type === 'patrol' && j.status === 'active' && (j.walked || j.waiting));
const opBannerHtml = (name) => `<div class="op-banner" style="background-image:url(${opBanner(name)})"><small>Operation</small><span>${name}</span></div>`;
// The camp line in the top left ("Carver Yard: Quiet"). Hidden for now; set true to bring it back.
const SHOW_CAMP_LINE = false;
const statusWord = (line) => (line === 'Holding' ? 'Quiet' : line);
// Getting back on its feet is not an emergency.
const recovering = (line) => line === 'Rebuilding' || line === 'Resettling';
// The currency's mark. The second character stops it being drawn as a coloured emoji.
const SP = '\u2660\uFE0E';
let clock24 = false;
const clockOf = (t) => {
  const h = Math.floor(t * 24) % 24, m = Math.floor((t * 24 - Math.floor(t * 24)) * 60), mm = String(m).padStart(2, '0');
  return clock24 ? `${String(h).padStart(2, '0')}:${mm}` : `${h % 12 || 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
};

// The hotbar shows what you are carrying as a white silhouette: pixel rectangles on a 16 by 8 grid, [x, y, w, h].
// Hotbar icons: the weapon's own first-person model, seen from the side and filled in as a silhouette, so the icon is the thing you
// hold and not a drawing of it. Guns and throwables lie muzzle to the right; a hand tool lies along its handle with the head to the right.
// Worked out once per weapon from the model's boxes. Blocks are a swatch of what they are made of.
const BLOCK_COL = { block_wood: '#b08a55', block_conc: '#9a9a94', block_steel: '#7d8a96' };
const ICON_W = 32, ICON_H = 16, iconCache = {};
const silhouette = (id) => {
  const boxes = (VM_MODELS[id] || []).concat(id === 'lmg' ? LMG_COVER.concat(LMG_BOX) : []);
  if (!boxes.length) return '';
  const tool = (ITEMS[id] || {}).type === 'melee';
  // Side on: across the icon is the length of the thing (-z for a gun, up the handle for a tool), down the icon is its height.
  const span = (b) => tool
    ? [b[1] - b[4] / 2, b[1] + b[4] / 2, b[2] - b[5] / 2, b[2] + b[5] / 2]
    : [-(b[2] + b[5] / 2), -(b[2] - b[5] / 2), -(b[1] + b[4] / 2), -(b[1] - b[4] / 2)];
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
  for (const b of boxes) { const [a0, a1, c0, c1] = span(b); u0 = Math.min(u0, a0); u1 = Math.max(u1, a1); v0 = Math.min(v0, c0); v1 = Math.max(v1, c1); }
  const s = Math.min((ICON_W - 1) / (u1 - u0), (ICON_H - 1) / (v1 - v0));
  const ou = (ICON_W - (u1 - u0) * s) / 2, ov = (ICON_H - (v1 - v0) * s) / 2;
  const grid = new Uint8Array(ICON_W * ICON_H);
  for (const b of boxes) {
    const [a0, a1, c0, c1] = span(b);
    // Every part shows, however thin: at least a pixel each way.
    let x0 = Math.floor((a0 - u0) * s + ou), x1 = Math.round((a1 - u0) * s + ou), y0 = Math.floor((c0 - v0) * s + ov), y1 = Math.round((c1 - v0) * s + ov);
    if (x1 <= x0) x1 = x0 + 1; if (y1 <= y0) y1 = y0 + 1;
    for (let y = Math.max(0, y0); y < Math.min(ICON_H, y1); y++) for (let x = Math.max(0, x0); x < Math.min(ICON_W, x1); x++) grid[x + y * ICON_W] = 1;
  }
  // Runs of filled pixels along each row, as one path.
  let d = '';
  for (let y = 0; y < ICON_H; y++) for (let x = 0; x < ICON_W; x++) {
    if (!grid[x + y * ICON_W]) continue;
    let w = 1;
    while (x + w < ICON_W && grid[x + w + y * ICON_W]) w++;
    d += `M${x} ${y}h${w}v1h${-w}z`;
    x += w - 1;
  }
  return d;
};
const iconFor = (id) => {
  const it = ITEMS[id] || {};
  const path = (rects) => rects.map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}z`).join('');
  if (it.type === 'block') {
    const col = BLOCK_COL[id] || '#999';
    return `<svg viewBox="0 0 32 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="${col}" d="${path([[10, 2, 12, 12]])}"/><path fill="#000" fill-opacity=".28" d="${path(id === 'block_wood' ? [[10, 6, 12, 1], [10, 10, 12, 1]] : id === 'block_conc' ? [[10, 7, 12, 1], [15, 2, 1, 5], [18, 8, 1, 6]] : [[11, 3, 1, 1], [20, 3, 1, 1], [11, 12, 1, 1], [20, 12, 1, 1]])}"/></svg>`;
  }
  if (iconCache[id] === undefined) iconCache[id] = silhouette(id);
  return `<svg viewBox="0 0 32 16" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="${iconCache[id]}"/></svg>`;
};

// Real time spent on a character, the way a person would say it.
function playTime(secs) {
  const m = Math.floor(secs / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : m ? `${m}m` : 'under a minute';
}

function playedAgo(at) {
  const mins = Math.floor((Date.now() - at) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export class UI {
  constructor(game) {
    this.g = game;
    this.modal = null;
    this.hudT = 0;
    this.mapT = 0;
    this.prevModal = [];
    this.bannerT = 0;
    this.mapView = { x: WX / 2, z: WZ / 2, zoom: 0 };
    this.markerEls = [];
    this.bind();
    this.floaters = [];
    this.bindSettings();
  }

  bind() {
    const g = this.g;
    // Every button in every menu, however it got there.
    const live = (e) => {
      const b = e.target && e.target.closest ? e.target.closest('button') : null;
      return b && !b.disabled && !b.classList.contains('off') ? b : null;
    };
    document.addEventListener('click', (e) => { if (live(e)) { g.audio.init(); g.audio.simple('ui'); } }, true);
    document.addEventListener('pointerover', (e) => {
      const b = live(e);
      if (b !== this.overButton) { this.overButton = b; if (b) g.audio.simple('uiOver'); }
    });
    document.addEventListener('change', (e) => { if (e.target && e.target.type === 'range') g.audio.simple('uiOver'); }, true);
    const click = (id, fn) => $(id).addEventListener('click', () => { g.audio.init(); fn(); });
    click('m-chars', () => this.openCharacters());
    click('m-continue', () => g.continueGame());
    click('ch-back', () => this.open('menu'));
    click('m-settings', () => { this.fillSettings?.(); this.open('settings'); });
    click('m-controls', () => this.open('controls'));
    click('ng-back', () => this.open('menu'));
    click('m-sandbox', () => this.openSandbox());
    click('ng-continue', () => g.continueGame('sandbox'));
    // Starting over replaces the sandbox there is. That takes a second press.
    click('ng-start', () => {
      const b = $('ng-start');
      if (g.sandboxSave && !g.sandboxSave.empty && !this.replaceArmed) {
        this.replaceArmed = setTimeout(() => { this.replaceArmed = 0; b.textContent = 'Enter the city'; b.classList.remove('really'); }, 3000);
        b.textContent = 'Replace your sandbox?';
        b.classList.add('really');
        return;
      }
      clearTimeout(this.replaceArmed); this.replaceArmed = 0;
      b.textContent = 'Enter the city'; b.classList.remove('really');
      g.slot = 'sandbox';
      g.newGame(this.readDifficulty(), this.campId, this.kitKey);
    });
    click('s-close', () => this.back());
    click('c-close', () => this.back());
    click('p-resume', () => g.resume());
    click('p-save', () => { g.saveGame(); this.toast('Game saved'); });
    click('p-settings', () => { this.fillSettings?.(); this.open('settings'); });
    click('p-controls', () => this.open('controls'));
    click('p-menu', () => g.quitToMenu());
    click('death-respawn', () => g.respawn());
    document.querySelectorAll('#devmenu [data-dev]').forEach((b) => b.addEventListener('click', () => g.devAction(b.dataset.dev)));
    click('death-menu', () => g.quitToMenu());
    click('death-restart', () => g.restartSurvival());
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { g.resume(); }));
    const map = $('bigmap');
    let drag = null;
    map.addEventListener('mousedown', (e) => { drag = [e.clientX, e.clientY, this.mapView.x, this.mapView.z]; });
    window.addEventListener('mouseup', () => { drag = null; });
    window.addEventListener('mousemove', (e) => {
      if (!drag || this.modal !== 'map') return;
      const s = this.mapScale();
      this.mapView.x = drag[2] - (e.clientX - drag[0]) / s;
      this.mapView.z = drag[3] - (e.clientY - drag[1]) / s;
      this.drawBigMap();
    });
    map.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.mapView.zoom = Math.max(0, Math.min(this.mapZoomMax(), this.mapView.zoom - Math.sign(e.deltaY) * .35));
      this.drawBigMap();
    }, { passive: false });
    // The rail runs the length of the island, north at the top.
    const rail = $('map-rail');
    let sliding = false;
    const slide = (e) => {
      const b = rail.getBoundingClientRect();
      this.mapView.z = (e.clientY - b.top) / b.height * WZ;
      this.drawBigMap();
    };
    rail.addEventListener('mousedown', (e) => { sliding = true; slide(e); });
    window.addEventListener('mousemove', (e) => { if (sliding && this.modal === 'map') slide(e); });
    window.addEventListener('mouseup', () => { sliding = false; });
    rail.addEventListener('wheel', (e) => { e.preventDefault(); this.panMap(Math.sign(e.deltaY)); }, { passive: false });
  }

  panMap(dir) {
    this.mapView.z += dir * $('bigmap').height * .22 / this.mapScale();
    this.drawBigMap();
  }

  // --- Screens ---------------------------------------------------------------------------
  open(name, remember = true) {
    if (remember && this.modal && this.modal !== name) this.prevModal.push(this.modal);
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    this.modal = name;
    if (name) $(name).classList.add('on');
  }

  back() {
    const prev = this.prevModal.pop();
    if (this.modal === 'settings') this.g.applySettings(true);
    this.open(prev || 'menu', false);
  }

  closeAll() {
    this.hideContractPage();
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('on'));
    document.body.classList.remove('talking');
    clearInterval(this.typeTimer);
    clearTimeout(this.typeTimer);
    this.typeTimer = null;
    this.modal = null;
    this.prevModal.length = 0;
  }

  showHUD(on) { $('hud').classList.toggle('on', on); if (!on) $('hud').classList.remove('hud-off'); }

  loading(title, pct, sub = '', soft = false, boot = false) {
    if (this.modal !== 'loading') this.open('loading', false);
    $('loading').classList.toggle('boot', boot);
    $('load-title').textContent = title;
    $('load-bar').firstElementChild.style.width = `${Math.round(pct * 100)}%`;
    $('load-sub').textContent = sub;
    $('loading').classList.toggle('soft', soft);
  }

  fatal(msg) {
    this.closeAll();
    $('error').classList.add('on');
    $('error-text').textContent = msg;
  }

  // --- New game -----------------------------------------------------------------------
  // Built on first use: the camps only exist once the city has been laid out.
  buildCamps() {
    const grid = $('camp-grid');
    if (grid.children.length) return;
    const kits = $('kit-grid');
    for (const k of Object.keys(KITS)) {
      if (k === 'survival') continue;   // Survival is what the Characters screen is for
      const b = document.createElement('button');
      b.className = 'kit';
      b.dataset.k = k;
      b.innerHTML = `<b>${KITS[k].name}</b><span>${KITS[k].desc}</span>`;
      b.addEventListener('click', () => { this.g.audio.init(); this.pickKit(k); });
      kits.appendChild(b);
    }
    this.kitKey = 'veteran';
    for (const c of this.g.layout.camps) {
      const b = document.createElement('button');
      b.className = 'camp';
      b.dataset.id = c.id;
      b.innerHTML = `${c.name}<small>${CAMP_START[c.key].tier}</small>`;
      b.addEventListener('click', () => { this.g.audio.init(); this.pickCamp(c.id); });
      grid.appendChild(b);
    }
    this.pickCamp(0);
  }

  pickCamp(id) {
    this.campId = id;
    document.querySelectorAll('.camp').forEach((b) => b.classList.toggle('sel', +b.dataset.id === id));
    this.describeStart();
  }

  pickKit(k) {
    this.kitKey = k;
    this.describeStart();
  }

  describeStart() {
    document.querySelectorAll('.kit').forEach((b) => b.classList.toggle('sel', b.dataset.k === this.kitKey));
    const survival = this.kitKey === 'survival';
    $('camp-grid').style.display = survival ? 'none' : '';
    $('camp-label').style.display = survival ? 'none' : '';
    if (survival) {
      const home = this.g.layout.camps.find((k) => k.key === START_CAMP);
      $('camp-blurb').innerHTML = `${home.name} takes you in and gives you its basic gear.<br><b>You only get one life.</b> When you die the save is gone and you carry on as someone new, in another of the poorer settlements, with nothing.`;
      return;
    }
    const c = this.g.layout.camps[this.campId];
    const gear = startingGear(this.kitKey, c.key);
    const list = gear.items.filter(([id]) => !ITEMS[id] || ITEMS[id].type !== 'ammo').slice(0, 7).map(([id]) => ITEMS[id].name).join(', ');
    $('camp-blurb').innerHTML = `${c.blurb}<br><b>You start with:</b> ${list}. ${gear.scrip} spades.${gear.standing ? ' You are known here.' : ''}`;
  }

  readDifficulty() { return { ...DIFFICULTY.hard }; }

  // --- Settings ---------------------------------------------------------------------------
  bindSettings() {
    const g = this.g, s = g.settings;
    // Pages: one subject at a time, and the last one you looked at is where it opens next.
    const tabs = [...document.querySelectorAll('#settings .s-tab')], pages = [...document.querySelectorAll('#settings .s-page')];
    const hint = $('s-hint');
    const show = (key) => {
      for (const t of tabs) t.classList.toggle('on', t.dataset.page === key);
      for (const p of pages) p.classList.toggle('on', p.dataset.page === key);
      hint.textContent = '';
      this.settingsPage = key;
    };
    for (const t of tabs) t.addEventListener('click', () => show(t.dataset.page));
    // What the setting under the pointer does, at the foot of the panel.
    for (const r of document.querySelectorAll('#settings .row[data-hint]')) {
      const say = () => { hint.textContent = r.dataset.hint; };
      r.addEventListener('mouseenter', say);
      r.addEventListener('focusin', say);
    }

    const pct = (v) => `${Math.round(v * 100)}%`;
    const shows = {
      view: (v) => `${v}`, scale: pct, cap: (v) => fmt(v), fov: (v) => `${v}`, sens: (v) => v.toFixed(2), volume: pct, music: pct,
      grain: (v) => (v > 0 ? pct(v) : 'Off'), uiScale: pct, uiAlpha: pct, brightness: pct, bob: (v) => (v > 0 ? pct(v) : 'Off'), shake: (v) => (v > 0 ? pct(v) : 'Off'),
      adsSens: (v) => `×${v.toFixed(2)}`,
    };
    // After any change: what has to happen beyond storing the value.
    const after = {
      minimap: () => $('hud').classList.toggle('no-map', !s.minimap),
      chatterNoHud: () => $('hud').classList.toggle('keep-chatter', !!s.chatterNoHud),
      uiScale: () => document.documentElement.style.setProperty('--ui-scale', s.uiScale),
      uiAlpha: () => document.documentElement.style.setProperty('--ui-alpha', s.uiAlpha ?? 1),
      drips: () => { if (!s.drips) g.drips.clear(); },
      view: () => g.applySettings(false), scale: () => g.applySettings(false), motion: () => g.applySettings(false), dof: () => g.applySettings(false),
    };
    // Every range and checkbox carries the name of its setting; they all work the same way.
    const controls = [...document.querySelectorAll('#settings [data-k]')];
    for (const el of controls) {
      const k = el.dataset.k, out = $(`${el.id}-o`);
      if (el.type === 'checkbox') {
        el.addEventListener('change', () => { s[k] = el.checked; g.saveSettings(); after[k]?.(); });
      } else {
        el.addEventListener('input', () => { s[k] = +el.value; if (out) out.textContent = (shows[k] || String)(s[k]); g.saveSettings(); after[k]?.(); });
      }
    }
    const q = $('s-quality');
    q.addEventListener('change', () => { g.setQualityPreset(q.value); fill(); });
    $('s-fps').addEventListener('change', (e) => { s.fpsCap = +e.target.value; g.saveSettings(); });
    $('s-clock').addEventListener('change', (e) => { clock24 = s.clock24 = e.target.value === '24'; g.saveSettings(); });
    // Puts every control in step with the settings, for opening the panel and after a reset or a preset.
    const fill = () => {
      for (const el of controls) {
        const k = el.dataset.k, out = $(`${el.id}-o`);
        if (el.type === 'checkbox') el.checked = !!s[k];
        else { el.value = s[k]; if (out) out.textContent = (shows[k] || String)(s[k]); }
      }
      q.value = s.quality;
      $('s-fps').value = String(s.fpsCap);
      clock24 = !!s.clock24;
      $('s-clock').value = clock24 ? '24' : '12';
      for (const k in after) if (k === 'minimap' || k === 'uiScale' || k === 'uiAlpha' || k === 'chatterNoHud') after[k]();
    };
    this.fillSettings = fill;
    fill();

    // Both resets take a second press, and the first press wears off, the same as deleting a character.
    const twice = (id, label, act) => {
      let armed = 0;
      $(id).addEventListener('click', async () => {
        const b = $(id);
        if (!armed) {
          b.textContent = 'Really?';
          b.classList.add('really');
          armed = setTimeout(() => { armed = 0; b.textContent = label; b.classList.remove('really'); }, 3000);
          return;
        }
        clearTimeout(armed); armed = 0;
        b.textContent = label; b.classList.remove('really');
        await act();
      });
    };
    twice('s-reset-settings', 'Reset settings', () => {
      // In place, so everything already holding the settings sees the new values.
      const d = g.defaultSettings();
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, d);
      fill();
      if (g.drips && !s.drips) g.drips.clear();
      g.saveSettings();
      g.applySettings(true);
      this.toast('Settings are back to their defaults.');
    });
    twice('s-reset-saves', 'Delete all saves', async () => {
      if (!(await g.deleteAllSaves())) { this.toast('Quit to the title screen first to delete your saves.', 'bad'); return; }
      this.toast('Every save has been deleted.');
    });
  }

  setContinue(who) {
    const b = $('m-continue');
    b.disabled = !who;
    b.textContent = 'Continue';
    if (who) { const name = document.createElement('small'); name.textContent = who.name; b.appendChild(name); }
  }

  async openSandbox() {
    this.buildCamps();
    await this.g.refreshContinue();
    const s = this.g.sandboxSave, b = $('ng-continue');
    b.style.display = s && !s.empty && !s.dead ? '' : 'none';
    if (s && !s.empty) b.textContent = `Continue sandbox (${s.name}, day ${s.day})`;
    this.open('newgame', false);
  }

  async openCharacters() {
    const list = $('char-list'), slots = await this.g.slotInfo();
    list.textContent = '';
    for (const s of slots) if (s.n !== 'sandbox') list.appendChild(this.characterCard(s));
    this.open('characters', false);
  }

  characterCard(s) {
    const g = this.g, card = document.createElement('div'), text = document.createElement('div'), acts = document.createElement('div');
    card.className = 'char';
    acts.className = 'char-acts';
    const line = (tag, words) => { const e = document.createElement(tag); e.textContent = words; text.appendChild(e); };
    const button = (words, primary, fn) => {
      const b = document.createElement('button');
      b.className = primary ? 'btn primary' : 'btn';
      b.textContent = words;
      b.addEventListener('click', () => { g.audio.init(); fn(b); });
      acts.appendChild(b);
    };
    if (s.empty) {
      card.classList.add('empty');
      line('b', 'Empty');
      // Every character is a survivor: straight into a bed in Carver Yard.
      button('New character', true, () => { g.slot = s.n; g.newGame(this.readDifficulty(), 0, 'survival'); });
    } else {
      const kills = `${s.kills.toLocaleString('en-US')} infected down`;
      if (s.dead) {
        card.classList.add('dead');
        line('b', `${s.name} is dead`);
        line('small', `${s.lived === 1 ? 'One day' : `${s.lived} days`} in the city, ${kills}.`);
      } else {
        line('b', s.name);
        line('small', `${(KITS[s.kit] || { name: 'Unknown' }).name}, day ${s.day}, ${kills}, ${s.scrip.toLocaleString('en-US')} \u2660`);
        button('Play', true, () => g.continueGame(s.n));
      }
      if (s.playSecs) line('small', `Played for ${playTime(s.playSecs)}`);
      if (s.savedAt) line('small', `Last played ${playedAgo(s.savedAt)}`);
      // Deleting takes a second press, and the first press wears off.
      let armed = 0;
      button('Delete', false, async (b) => {
        // The dead go without asking. Anyone still alive gets a second press.
        if (!armed && !s.dead) {
          b.textContent = 'Really?';
          b.classList.add('really');
          armed = setTimeout(() => { armed = 0; b.textContent = 'Delete'; b.classList.remove('really'); }, 3000);
          return;
        }
        clearTimeout(armed);
        await g.deleteSlot(s.n);
        this.openCharacters();
      });
    }
    card.prepend(text);
    card.appendChild(acts);
    return card;
  }

  // --- HUD ------------------------------------------------------------------------------------
  toast(text, kind = '', secs = 3.8) {
    const box = $('toasts');
    const d = document.createElement('div');
    d.textContent = text;
    if (kind) d.className = kind;
    if (secs !== 3.8) { d.style.animationDuration = `${secs}s`; d.style.maxWidth = '420px'; }
    box.appendChild(d);
    while (box.children.length > 7) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), secs * 1000);
  }

  banner(title, text) {
    const b = $('banner');
    b.children[0].textContent = title;
    b.children[1].textContent = text || '';
    b.style.opacity = 1;
    this.bannerOn = true;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      b.style.opacity = 0;
      this.bannerOn = false;
      const next = this.bannerQ && this.bannerQ.shift();
      if (next) this.bannerTimer = setTimeout(() => this.banner(next[0], next[1]), 700);
    }, 4200);
  }

  // After whatever is up there now has had its turn.
  bannerNext(title, text) {
    if (this.bannerOn) (this.bannerQ || (this.bannerQ = [])).push([title, text]);
    else this.banner(title, text);
  }

  sleepVeil(on) { $('sleep-veil').classList.toggle('on', on); }

  // During an operation: how big it is, and what that means for the gates. It sits over the breach notice.
  updateMagBar() {
    const g = this.g, sim = g.campSim, P = g.player, el = $('mag-bar');
    let c = null, bd = 1e9;
    for (const k of g.layout.camps) {
      const s = sim.state[k.id];
      // A settlement that has fallen has no magnitude to report, whatever is left on its books.
      if (!s.op || s.status !== 'holding') continue;
      const d = Math.hypot(k.cx - P.x, k.cz - P.z);
      if (d < 420 && d < bd) { bd = d; c = k; }
    }
    let text = '', cls = '';
    if (c) {
      const s = sim.state[c.id], mag = Math.round(s.op.mag || 1);
      if (s.evac) { text = 'Evacuation<i class="sep"></i>All gates are open'; cls = 'evac'; }
      else if (s.locked) { text = `Magnitude ${mag}<i class="sep"></i>Gates are locked`; cls = 'locked'; }
      else if (s.lockAt != null) { text = `Magnitude ${mag}<i class="sep"></i>Gates lock in ${Math.max(0, Math.ceil(s.lockAt - g.time))}s`; cls = 'warn'; }
      else text = `Magnitude ${mag}`;
    }
    if (text !== this.magText || cls !== this.magCls) {
      this.magText = text; this.magCls = cls;
      el.innerHTML = text;
      el.style.display = text ? 'block' : 'none';
      el.className = cls;
    }
  }

  // While the siren is going: why, and how bad. It says so whether or not you have muted the sound.
  updateSirenBar() {
    const sim = this.g.campSim, c = sim.alarm, el = $('siren-bar');
    let text = '';
    if (c && sim.state[c.id].status === 'holding') {
      const s = sim.state[c.id], n = s.breaches.length, parts = [];
      if (n) parts.push(`${n} active ${n === 1 ? 'breach' : 'breaches'}`);
      if (s.inside > 0) parts.push(`${s.inside.toLocaleString('en-US')} inside`);
      // Just the numbers now: the order to get out goes on the magnitude notice above.
      text = parts.join(', ');
    }
    if (text !== this.sirenText) {
      this.sirenText = text;
      el.innerHTML = text;
      el.style.display = text ? 'block' : 'none';
      el.classList.toggle('evac', !!c && sim.alarmLevel === 2);
      el.classList.toggle('slow', !!c && sim.alarmLevel === 0);
    }
  }

  // The count after a battle. Stays up long enough to read, and one at a time if several land together.
  battleReport(r) {
    if (!r.opEnd) this.g.campSim.logNews({ kind: 'report', campId: r.campId, at: r.clock, title: r.title, camp: r.camp, sub: r.sub, rows: r.rows, note: r.note, fell: r.fell, win: r.win });
    (this.reportQ || (this.reportQ = [])).push(r);
    if (!this.reportOn) this.nextReport();
  }

  nextReport() {
    const box = $('battle-report'), r = this.reportQ.shift();
    if (!r) { this.reportOn = false; box.style.opacity = 0; return; }
    this.reportOn = true;
    box.classList.toggle('win', !!r.win);
    box.innerHTML = '';
    const h = document.createElement('b');
    h.textContent = r.title;
    h.className = r.fell ? 'fell' : '';
    box.appendChild(h);
    const where = document.createElement('small');
    where.textContent = r.camp || '';
    box.appendChild(where);
    // A third line, for a report that has one. The gap under the heading goes under whichever comes last.
    if (r.sub) {
      where.style.marginBottom = '0';
      const sub = document.createElement('small');
      sub.textContent = r.sub;
      box.appendChild(sub);
    }
    if (r.rows.length) {
      const table = document.createElement('div');
      table.className = 'rows';
      for (const [k, v] of r.rows) {
        const a = document.createElement('span'), b = document.createElement('span');
        a.textContent = k; b.textContent = v;
        table.appendChild(a); table.appendChild(b);
      }
      box.appendChild(table);
    } else where.style.marginBottom = '0';
    if (r.note) {
      const p = document.createElement('p');
      p.textContent = r.note;
      box.appendChild(p);
    }
    box.style.opacity = 1;
    this.g.audio.simple('beep');
    clearTimeout(this.reportTimer);
    this.reportTimer = setTimeout(() => {
      box.style.opacity = 0;
      this.reportTimer = setTimeout(() => this.nextReport(), 700);
    }, 13000);
  }

  // Under the compass, for a few seconds: a gate shut in a hurry, and when it opens again.
  // A gate locking stays up until it unlocks (owner is the gate it is about); anything else fades after a few seconds.
  gateNote(text, open = false, owner = null) {
    const el = $('gate-note');
    el.textContent = text;
    el.className = open ? 'on open' : 'on';
    clearTimeout(this.gateNoteT);
    this.gateNoteOwner = owner;
    if (!owner) this.gateNoteT = setTimeout(() => { el.className = ''; }, open ? 3500 : 6000);
  }

  clearGateNote(owner) {
    if (this.gateNoteOwner !== owner) return;
    this.gateNoteOwner = null;
    $('gate-note').className = '';
  }

  hitMarker(heavy = false) {
    if (!this.g.settings.hitmarker) return;
    const h = $('hitmark');
    h.getAnimations().forEach((a) => a.cancel());
    // A blow that lands with a club or a blade gets a bigger, longer mark than a bullet: there is no other way to tell it from a miss.
    if (heavy) h.animate([{ opacity: 1, transform: 'scale(1.6)' }, { opacity: 0, transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
    else h.animate([{ opacity: .95 }, { opacity: 0 }], { duration: 140, easing: 'ease-out' });
  }

  damageIndicator(dx, dz, yaw) {
    const a = Math.atan2(dx, -dz) - yaw;
    const box = $('dmg');
    const i = document.createElement('i');
    i.style.transform = `rotate(${a}rad)`;
    box.appendChild(i);
    setTimeout(() => i.remove(), 900);
  }

  // The maps take the light of the hour and the weather: the colour each is multiplied by, worked out from how dark it is, how low the
  // sun sits (warm at sunrise and sunset, a little warm through the afternoon), and the rain. Never so dark the map stops being useful.
  mapGrade() {
    const g = this.g, sky = g.renderer.sky, night = Math.min(1, sky.night || 0), elev = sky.sunDir ? sky.sunDir[1] : .5, rain = Math.min(1, g.weather.rain || 0);
    const low = Math.max(0, 1 - Math.max(0, elev) / .32) * (1 - night), noonish = g.tod > .52 && g.tod < .72 ? Math.sin((g.tod - .52) / .2 * Math.PI) : 0;
    let r = 1, gg = 1, b = 1;
    const mix = (c, k) => { r *= 1 + (c[0] - 1) * k; gg *= 1 + (c[1] - 1) * k; b *= 1 + (c[2] - 1) * k; };
    // The hue is the game's own: the colour the haze is right now (orange at sunset, blue-black at night, grey in rain), brought to full
    // brightness and taken a good way back towards white, so the map has the same cast as the view without losing its colours.
    const fog = sky.fog || [1, 1, 1], f = [Math.sqrt(Math.max(0, fog[0])), Math.sqrt(Math.max(0, fog[1])), Math.sqrt(Math.max(0, fog[2]))], top = Math.max(f[0], f[1], f[2], 1e-4);
    mix([f[0] / top, f[1] / top, f[2] / top], .5);
    // How light it is: dimmer at night, and a touch in rain and with the sun low, but never so dark it stops being a map.
    const lit = Math.max(.58, 1 - night * .4 - rain * .1 - low * .06);
    r *= lit; gg *= lit; b *= lit;
    mix([1, .97, .92], noonish * .5 * (1 - low));
    const col = `rgb(${Math.round(r * 255)},${Math.round(gg * 255)},${Math.round(b * 255)})`;
    if (col !== this.gradeCol) { this.gradeCol = col; for (const el of document.querySelectorAll('.map-grade')) el.style.background = col; }
  }

  updateHUD(dt) {
    this.mapGrade();
    {
      const P = this.g.player, k = P.shotFx || 0;
      if (k > 0) P.shotFx = Math.max(0, k - dt * 1);
      const o = Math.min(1, k * 1.15).toFixed(2);
      if (o !== this.shotFxO) { this.shotFxO = o; $('shot-fx').style.opacity = o; }
    }
    const g = this.g, P = g.player;
    const it = P.weapon ? ITEMS[P.weapon] : null;
    const scoped = it && it.scope && P.ads > .85;
    $('scope').style.display = scoped ? 'block' : 'none';
    $('crosshair').style.display = (g.settings.crosshair === false || (P.ads > .6 && it?.type === 'gun')) ? 'none' : 'block';
    $('weapon-box').style.opacity = scoped ? 0 : 1;

    const pr = $('prompt');
    if (!this.g.locked && !this.modal && P.alive) { pr.style.display = 'block'; pr.textContent = 'Click to play'; }
    else if (P.interact && P.alive) { pr.style.display = 'block'; pr.innerHTML = `<span class="kbd">E</span> ${P.interact.label}`; }
    else pr.style.display = 'none';

    this.updateMagBar();
    this.updateSirenBar();
    this.updateMarkers();
    this.updateFloaters(dt);
    this.updateNpcMarks(dt);

    // These turn with the player, so they get every frame. Everything else on the HUD can wait.
    this.drawCompass();
    if (g.settings.minimap) this.drawMinimap();

    this.hudT -= dt;
    if (this.hudT > 0) return;
    this.hudT = .1;
    $('hp-num').textContent = Math.max(0, Math.ceil(P.health));
    $('bar-hp').firstElementChild.style.width = `${Math.max(0, P.health)}%`;
    $('bar-hp').classList.toggle('low', P.health < 30);
    $('bar-st').firstElementChild.style.width = `${P.stamina}%`;
    const eats = P.loadout === 'survival';
    $('bar-food').style.display = eats ? 'block' : 'none';
    if (eats) {
      $('bar-food').firstElementChild.style.width = `${P.hunger}%`;
      $('bar-food').classList.toggle('low', P.hunger <= 25);
    }
    $('bar-inf').style.display = P.infection > 0 ? 'block' : 'none';
    $('bar-inf').firstElementChild.style.width = `${P.infection}%`;
    const over = P.carryWeight() > P.carryCap();
    // The armour and status line under your health is off for now: the corner up top says what matters.
    if (false) $('armor-tag').textContent = [P.armor ? ITEMS[P.armor].name : '', P.infection > 0 ? `Infected ${Math.round(P.infection)}%` : '', over ? 'Overloaded' : '', P.stim > 0 ? 'Adrenaline' : '', eats && P.hunger <= 0 ? 'Starving' : eats && P.hunger <= 25 ? 'Hungry' : '', eats && P.rest <= 0 ? 'Exhausted' : eats && P.rest <= 35 ? 'Tired' : ''].filter(Boolean).join(' / ');
    if (it) {
      $('wname').textContent = it.name;
      if (it.type === 'gun') {
        $('ammo').innerHTML = `${P.reloadT > 0 ? '<small>reloading</small>' : P.mags[P.weapon] ?? 0} <small>/ ${P.count(it.ammo)}</small>`;
      } else if (it.type === 'throw' || it.type === 'block') {
        $('ammo').innerHTML = `${P.count(P.weapon)}`;
      } else $('ammo').innerHTML = '';
    } else { $('wname').textContent = ''; $('ammo').innerHTML = ''; }
    const list = P.weapons();
    const hb = $('hotbar');
    const key = list.join() + P.weapon;
    if (hb.dataset.key !== key) {
      hb.dataset.key = key;
      hb.innerHTML = list.slice(0, 9).map((id, k) => `<div class="${id === P.weapon ? 'on' : ''}" title="${ITEMS[id].name}"><i>${k + 1}</i>${iconFor(id)}</div>`).join('');
    }
    const loc = g.layout.describe(P.x, P.z);
    // Under the compass is always where you are: the district out in the city, and inside a wall the settlement's name, set apart from it.
    const inWall = loc.cross === 'Inside the wall' || g.horde.inCamp(P.x, P.z, 0);
    const campHere = inWall ? g.horde.inCamp(P.x, P.z, 2) : null;
    const locHtml = campHere ? `<span class="settlement">${campHere.name}</span>` : loc.district;
    const locEl = $('loc');
    if (locEl.dataset.v !== locHtml) { locEl.dataset.v = locHtml; locEl.innerHTML = locHtml; }
    // No day counter, unless an operation is on. Then it is that operation's count.
    let status = `<div><b class="spades">${SP} ${fmt(P.scrip)}</b></div><div><b>${clockOf(g.tod)}</b></div>`;
    // The faction you are standing in, or the one you belong to. Anyone who lives there knows when an operation is on, whether or not they are in it.
    const here = g.horde.inCamp(P.x, P.z, 0), sim = g.campSim;
    if (here) sim.lastCamp = here.id;
    const fid = here ? here.id : sim.lastCamp >= 0 ? sim.lastCamp : P.home, faction = fid >= 0 ? g.layout.camps[fid] : null;
    // The camp's name and how it is doing used to sit here. It is off for now (SHOW_CAMP_LINE); the camp is still worked out, since
    // the operation box and the rest of the HUD go by it.
    if (faction && SHOW_CAMP_LINE) {
      const line = sim.statusLine(faction.id);
      status += `<div class="faction"><b>${faction.name}:</b><span${line === 'Holding' ? '' : recovering(line) ? ' class="calm"' : ' class="bad"'}>${statusWord(line)}</span></div>`;
    }
    // Starving or out on your feet: up here in the corner where it cannot be missed, with what it is doing to you, until it is dealt with.
    const need = P.needs();
    if (need.starving) status += `<div class="need"><b>Starving</b><span>Stamina recovers slowly and runs out early. You are losing health. Eat something.</span></div>`;
    else if (need.hungry) status += `<div class="need"><b>Hungry</b><span>Health and stamina recover a little slower. Eat something.</span></div>`;
    if (need.exhausted) status += `<div class="need"><b>Exhausted</b><span>Slower, shakier aim, and you tire fast. You are losing health. Find a bed.</span></div>`;
    else if (need.tired) status += `<div class="need"><b>Tired</b><span>A little slower, and your aim wanders. Find somewhere to sleep.</span></div>`;
    const ride = g.bikes && g.bikes.ride;
    if (ride) status += `<div class="need"><b>${ride.fuel <= 0 ? 'Out of petrol' : ride.fuel <= .1 ? 'Low petrol' : 'Petrol'}</b><span>${Math.round(ride.fuel * 100)}% in the tank.${ride.fuel <= .1 ? ' A mechanic will fill it up.' : ''}</span></div>`;
    if (P.carryWeight() > P.carryCap()) status += `<div class="need"><b>Overweight</b><span>${P.carryWeight().toFixed(1)} / ${P.carryCap()} kg. You are slowed down. Drop or stash something.</span></div>`;
    this.hudCamp = faction;
    $('status').innerHTML = status;
    this.renderTracker();
  }

  // An operation at your camp is on the list whether you signed for anything or not. It is the news of it, the bonus for helping, and the word that
  // there is a contract going. Once you have signed, the contract's own box takes over. This one cannot be abandoned: it is not something you took on.
  operationQuest() {
    const g = this.g, c = this.hudCamp, sim = g.campSim;
    if (!c) return '';
    const s = sim.state[c.id], j = g.jobs.opJob(c.id);
    if (j && j.plan === 'vanguard') return '';
    const grid = (list, cls) => `<div class="rows ${cls}">${list.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>`;
    if (s.op) {
      const lost = s.evac || s.collapseT > 0, kills = j ? j.kills || 0 : 0, pay = j ? g.jobs.opPay(j) : 0;
      const main = [['Day', sim.opDayHtml(s.op).replace('Day ', '')], ['Bonus', `${SP} ${OP_PAY.commission} a kill`], ['Your kills', fmt(kills)], ['Pay if it holds', `${SP} ${fmt(pay)}`]];
      const foot = lost ? 'The settlement is being lost.' : j && j.void ? 'Your contract was ended. The bonus still pays.' : `Contract at the Town Hall: ${SP} ${OP_PAY.vanguard} a kill`;
      return `<div class="trk op${lost ? ' lost' : ''}">${opBannerHtml(s.op.name)}${grid(main, 'main')}${grid(sim.opBrief(c), 'more')}<div class="bonus">${foot}</div>${this.contractExtras(c.id, false)}</div>`;
    }
    if (s.opNext) {
      const main = [['Starts in', `About ${sim.opNoticeHours(s)}h`], ['Expected', `${s.opNext.predict || '?'} day${s.opNext.predict === 1 ? '' : 's'}`], ['Bonus', `${SP} ${OP_PAY.commission} a kill`]];
      return `<div class="trk op">${opBannerHtml(s.opNext.name)}${grid(main, 'main')}<div class="bonus">Contract at the Town Hall: ${SP} ${OP_PAY.vanguard} a kill</div></div>`;
    }
    if (s.opFailed && sim.now() < s.opFailed.until) return `<div class="trk op lost">${opBannerHtml(s.opFailed.name)}${grid([['Status', 'Failed']], 'main')}</div>`;
    return '';
  }

  // Right, under the minimap: what you have taken on. An operation contract also gets the command post's picture of how it is going.
  renderTracker() {
    const g = this.g, box = $('tracker');
    let html = this.operationQuest();
    for (const j of g.jobs.active) {
      if (j.plan === 'commission') continue;
      const camp = g.layout.camps[j.campId], op = j.type === 'defend' ? g.campSim.state[j.campId].op : null;
      if (j.type === 'defend' && j.plan === 'vanguard') {
        // What you have to do comes first, on its own. Everything else is a glance further down.
        const rows = [], more = [];
        if (op && !j.pending) {
          const end = op.start + j.day + 1;
          const met = j.dayMet || j.dayKills >= g.jobs.quotaDue(j, op, end);
          rows.push(['Day', g.campSim.opDayHtml(op).replace('Day ', '')], ['Quota', met ? `<i class="met">\u2713 Met</i> ${fmt(j.dayKills)} / ${fmt(g.jobs.quotaDue(j, op, end))}` : `${fmt(j.dayKills)} / ${fmt(g.jobs.quotaDue(j, op, end))}`], ['Time left', `${Math.max(0, Math.ceil((end - g.campSim.now()) * 24))}h`]);
          if (met) j.metShown = true;
          const payNow = g.jobs.opPay(j), payFull = g.jobs.opFullPay(j);
          if (j.misses) more.push(['Missed quotas', `<em>${j.misses} of ${OP_PAY.strikes}</em>`]);
          more.push(['Pay if it holds', payNow < payFull ? `<em>${SP} ${fmt(payNow)}, docked</em>` : `${SP} ${fmt(payNow)}`]);
          if (payNow < payFull) more.push(['Before docking', `${SP} ${fmt(payFull)}`]);
          more.push(...g.campSim.opBrief(camp));
        } else {
          const next = g.campSim.state[j.campId].opNext;
          rows.push(['Starts in', next ? `About ${g.campSim.opNoticeHours(g.campSim.state[j.campId])}h` : 'Soon'], ['Daily quota', fmt(j.quota)]);
        }
        const grid = (list, cls) => (list.length ? `<div class="rows ${cls}">${list.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>` : '');
        const elsewhere = g.horde.inCamp(g.player.x, g.player.z, 0) !== camp && g.player.home !== camp.id;
        const lostNow = g.campSim.state[j.campId].evac || g.campSim.state[j.campId].collapseT > 0;
        const metNow = op && !j.pending && (j.dayMet || j.dayKills >= g.jobs.quotaDue(j, op, op.start + j.day + 1));
        html += `<div class="trk op${lostNow ? ' lost' : ''}${metNow ? ' met' : ''}">${opBannerHtml(j.op || j.title.replace('Operation ', ''))}${elsewhere ? `<small>${camp.name}</small>` : ''}${grid(rows, 'main')}${grid(more, 'more')}${this.contractExtras(j.campId, j.plan === 'vanguard')}</div>`;
      } else if ((j.type === 'patrol' || j.type === 'night') && j.status === 'active') {
        // A contract of either kind runs in shifts, so that is how it reads.
        const now = g.campSim.now();
        const row = (list, cls) => `<div class="rows ${cls}">${list.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('')}</div>`;
        let main, more;
        if (j.type === 'patrol') {
          const here = j.walked || j.waiting ? null : j.posts[j.next], metres = here ? Math.round(Math.hypot(here.x - g.player.x, here.z - g.player.z)) : 0;
          const left = Math.max(1, Math.ceil((j.k + 1 + OP_PAY.patrolStart - now) * 24));
          main = [['Day', `${j.streak + (j.walked ? 0 : 1)} of ${OP_PAY.days}`]];
          if (here) main.push(['Next post', here.name], ['Distance', `${metres}m`], ['Posts checked', `${j.next} of ${j.posts.length}`], ['Time left', `${left}h`]);
          else if (j.walked) main.push(['Today', 'Round walked'], ['Next patrol', clockOf(OP_PAY.patrolStart + .0001)]);
          else main.push(['Starts', clockOf(OP_PAY.patrolStart + .0001)]);
          more = [['Earned', `${SP} ${fmt(j.earned)}`], ['Per shift', `${SP} ${g.jobs.shiftPay(j.campId)}`]];
        } else {
          const on = g.jobs.onShift(j, now), endsIn = Math.max(1, Math.ceil((j.k + OP_PAY.nightStart + OP_PAY.nightLen - now) * 24));
          main = [['Night', `${j.streak + (j.shiftDone ? 0 : 1)} of ${OP_PAY.nights}`]];
          if (j.shiftDone) main.push(['Tonight', 'Quota met'], ['Next shift', clockOf(OP_PAY.nightStart)]);
          else if (on) main.push(['Quota', `${fmt(j.shiftKills)} / ${fmt(j.quota)}`], ['Time left', `${endsIn}h`]);
          else main.push(['Quota', fmt(j.quota)], ['Next shift', clockOf(OP_PAY.nightStart)]);
          more = [['Earned', `${SP} ${fmt(j.earned)}`], ['Per shift', `${SP} ${g.jobs.shiftPay(j.campId)}`]];
        }
        // One square a shift. A night's is ticked as soon as its quota is met, not when the night is over.
        // The line goes green while this shift's work is done, and back to blue when the next one comes round.
        const met = j.type === 'patrol' ? j.walked : j.shiftDone;
        const shifts = j.type === 'patrol' ? OP_PAY.days : OP_PAY.nights, ticked = j.streak;
        const squares = Array.from({ length: shifts }, (_, k) => `<i${k < ticked ? ' class="on"' : ''}></i>`).join('');
        html += `<div class="trk op contract${met ? ' met' : ''}"><div class="head"><b>${j.type === 'patrol' ? 'Patrol contract' : 'Night shift contract'}</b><span class="shifts">${squares}</span></div>${row(main, 'main')}${row(more, 'more')}${g.campSim.state[j.campId].op ? `<div class="bonus">Operation bonus added (+${SP} ${OP_PAY.shiftOp - OP_PAY.shift})</div>` : ''}${this.contractExtras(j.campId)}</div>`;
      } else html += `<div class="trk${j.status === 'done' ? ' done' : ''}${j.fullPay > j.reward ? ' docked' : ''}"><b>${j.title}</b><span>${this.jobLine(j)}</span></div>`;
    }
    if (html !== this.trackerHtml) { this.trackerHtml = html; box.innerHTML = html; }
  }

  // At the foot of a contract's box: what it gets you today that you have not used yet, and, once an operation has run long, what the
  // Town Hall would settle it for now.
  contractExtras(campId, perks = true) {
    const g = this.g, J = g.jobs, out = [];
    const e = J.earlyPayout(campId);
    if (e && !e.locked) out.push(`<div class="bonus early">Early payout: ${SP} ${fmt(e.pay)} at the Town Hall<br><small>${Math.round(e.cut * 100)}% cut from ${SP} ${fmt(e.full)}</small></div>`);
    else if (e && e.locked) out.push('<div class="bonus early dim">Early payout once today\'s quota is met</div>');
    if (perks && J.underContract(campId)) {
      const free = [];
      if (J.perkFree(campId, 'doc')) free.push('Treatment at the doctor');
      if (J.perkFree(campId, 'box')) free.push('Supply package from a trader');
      if (free.length) out.push(`<div class="bonus perk">Free today with contract:<ul>${free.map((f) => `<li>${f}</li>`).join('')}</ul></div>`);
    }
    return out.join('');
  }

  // Where a job stands, in a few words.
  jobLine(j) {
    const g = this.g, opNow = j.type === 'defend' ? g.campSim.state[j.campId].op : null;
    // Money waiting at a Town Hall: how much, and which one.
    if (j.type === 'defended' || ((j.type === 'night' || j.type === 'patrol') && j.status === 'done')) return `${SP} ${fmt(j.reward)}${j.fullPay > j.reward ? ', docked,' : ''} at ${g.layout.camps[j.campId].name}`;
    const progress = j.status === 'done' ? (j.favour ? `Done. Return to ${j.giver}.` : `Done. Report to the ${g.layout.camps[j.campId].name} Town Hall.`) : j.type === 'visit' ? (j.leader ? 'Talk to the leader' : 'Talk to the clerk') : j.type === 'patrol' ? this.patrolLine(j) : j.type === 'night' ? (j.shiftDone ? `Night ${j.streak} of ${OP_PAY.nights}, quota met` : `Night ${j.streak + 1} of ${OP_PAY.nights}, ${g.jobs.onShift(j) ? `${j.shiftKills} / ${j.quota} killed` : `starts ${clockOf(OP_PAY.nightStart)}`}`) : j.type === 'defend' ? (opNow ? this.opJobLine(j, opNow) : j.pending ? 'Not started yet' : statusWord(g.campSim.statusLine(j.campId))) : j.type === 'migrate' ? 'Keep moving' : j.type === 'bounty' ? `${j.left} left to find` : j.type === 'kill' ? `${j.got} / ${j.need} killed` : j.type === 'hold' ? `${Math.floor(j.held)} / ${j.time}s held` : 'Find the cache';
    // Finished and waiting to be paid: how much, and where, in one line.
    if (j.status === 'done' && !j.favour && j.reward) return `Collect ${SP} ${fmt(j.reward)} at the ${g.layout.camps[j.campId].name} Town Hall`;
    const pay = j.type === 'defend' ? (j.plan === 'vanguard' && g.jobs.opPay(j) < g.jobs.opFullPay(j) ? ` / pay docked to ${SP} ${fmt(g.jobs.opPay(j))}, was ${SP} ${fmt(g.jobs.opFullPay(j))}` : '') : (j.type === 'night' || j.type === 'patrol') && j.status === 'active' ? (j.earned ? ` / ${SP} ${fmt(j.earned)} earned` : '') : j.reward ? ` / ${SP} ${fmt(j.reward)}` : '';
    return progress + pay;
  }

  patrolLine(j) {
    return `Day ${j.streak + (j.walked ? 0 : 1)} of ${OP_PAY.days}, ${j.walked ? 'round walked' : j.waiting ? `starts ${clockOf(OP_PAY.patrolStart + .0001)}` : `next: ${j.posts[j.next].name}`}`;
  }

  // Where you stand on the job at hand, in a few words.
  opJobLine(j, op) {
    const g = this.g;
    if (j.plan === 'vanguard') {
      const end = op.start + j.day + 1, due = g.jobs.quotaDue(j, op, end), left = Math.max(0, Math.ceil((end - g.campSim.now()) * 24));
      return `Quota ${fmt(j.dayKills)} / ${fmt(due)}, ${left}h left`;
    }
    return `${fmt(j.kills)} kills, ${SP} ${fmt(g.jobs.opPay(j))} if it succeeds`;
  }

  drawCompass() {
    const c = $('compass'), x = c.getContext('2d'), P = this.g.player;
    // The strip itself is the top 52; how far things are is written underneath it, under each mark.
    const W = c.width, H = 52, LY = 70;
    x.clearRect(0, 0, W, c.height);
    const yaw = P.yaw;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const fov = Math.PI * .75;
    const labels = [['N', 0], ['NE', .25], ['E', .5], ['SE', .75], ['S', 1], ['SW', 1.25], ['W', 1.5], ['NW', 1.75]];
    for (let d = 0; d < 72; d++) {
      const a = d / 72 * Math.PI * 2;
      let r = a - yaw;
      while (r > Math.PI) r -= Math.PI * 2;
      while (r < -Math.PI) r += Math.PI * 2;
      if (Math.abs(r) > fov) continue;
      const px = W / 2 + r / fov * W / 2;
      x.fillStyle = `rgba(233,228,216,${.5 * (1 - Math.abs(r) / fov)})`;
      x.fillRect(px - 1, H - 14, 2, d % 9 === 0 ? 12 : 6);
    }
    x.font = '600 24px Quantico, Bahnschrift, Segoe UI, sans-serif';
    for (const [l, t] of labels) {
      let r = t * Math.PI - yaw;
      while (r > Math.PI) r -= Math.PI * 2;
      while (r < -Math.PI) r += Math.PI * 2;
      if (Math.abs(r) > fov * .95) continue;
      const px = W / 2 + r / fov * W / 2;
      x.fillStyle = l === 'N' ? `rgba(232,176,74,${1 - Math.abs(r) / fov})` : `rgba(233,228,216,${1 - Math.abs(r) / fov})`;
      x.fillText(l, px, 18);
    }
    // Where the work is: a blue square on the compass, and how far, the way a breach is shown. Nothing is drawn out in the world itself.
    x.font = '600 17px Quantico, Bahnschrift, Segoe UI, sans-serif';
    for (const j of this.g.jobs.active) {
      if (j.status !== 'active' || unpointed(j)) continue;
      let r = Math.atan2(j.x - P.x, -(j.z - P.z)) - yaw;
      while (r > Math.PI) r -= Math.PI * 2;
      while (r < -Math.PI) r += Math.PI * 2;
      if (Math.abs(r) > fov) continue;
      const px = W / 2 + r / fov * W / 2, dist = Math.round(Math.hypot(j.x - P.x, j.z - P.z));
      x.fillStyle = '#6ec6ff';
      x.fillRect(px - 6, 5, 12, 12);
      x.strokeStyle = 'rgba(8,14,20,.9)'; x.lineWidth = 2; x.strokeRect(px - 6, 5, 12, 12);
      const label = j.type === 'patrol' && j.posts ? `${j.posts[j.next].name}, ${dist}m` : `${dist}m`;
      x.font = '600 21px Quantico, Bahnschrift, Segoe UI, sans-serif';
      x.lineWidth = 4; x.strokeStyle = 'rgba(10,8,6,.8)';
      x.strokeText(label, px, LY);
      x.fillStyle = '#a8dcff';
      x.fillText(label, px, LY);
    }
    // Holes in the wall of any camp you know of, nearby: a red diamond, and how far.
    const g = this.g;
    x.font = '600 17px Quantico, Bahnschrift, Segoe UI, sans-serif';
    for (const c of g.layout.camps) {
      if (!P.discovered[c.id] || Math.hypot(c.cx - P.x, c.cz - P.z) > 400) continue;
      for (const b of g.campSim.state[c.id].breaches) {
        let r = Math.atan2(b.x - P.x, -(b.z - P.z)) - yaw;
        while (r > Math.PI) r -= Math.PI * 2;
        while (r < -Math.PI) r += Math.PI * 2;
        if (Math.abs(r) > fov) continue;
        const px = W / 2 + r / fov * W / 2, dist = Math.round(Math.hypot(b.x - P.x, b.z - P.z));
        const a = Math.max(.45, 1 - dist / 500), pulse = .75 + .25 * Math.sin(performance.now() / 180);
        x.save();
        x.translate(px, 11);
        x.rotate(.785);
        x.fillStyle = `rgba(232,72,58,${a * pulse})`;
        x.fillRect(-7, -7, 14, 14);
        x.strokeStyle = `rgba(20,10,8,${a})`;
        x.lineWidth = 2;
        x.strokeRect(-7, -7, 14, 14);
        x.restore();
        x.font = '600 21px Quantico, Bahnschrift, Segoe UI, sans-serif';
        x.lineWidth = 4; x.strokeStyle = 'rgba(10,8,6,.8)';
        x.strokeText(`${dist}m`, px, LY);
        x.fillStyle = `rgba(255,150,130,${a})`;
        x.fillText(`${dist}m`, px, LY);
      }
    }
    x.fillStyle = '#e8b04a';
    x.fillRect(W / 2 - 1, H - 20, 2, 18);
  }

  drawMinimap() {
    const g = this.g, P = g.player, c = $('minimap'), x = c.getContext('2d');
    const W = c.width, cx = W / 2;
    x.save();
    x.clearRect(0, 0, W, W);
    x.fillStyle = OCEAN;
    x.fillRect(0, 0, W, W);
    x.translate(cx, cx);
    x.rotate(-P.yaw);
    // Close in: about eighty blocks to the rim, the street you are on and the next few round it. Bodies are drawn at their own size in
    // the world, so they grow with the zoom; marks that are just marks (jobs, outlines) stay the same size on screen (px).
    const scale = 2.4, px = 1.25 / scale;
    x.scale(scale, scale);
    // Map canvas is half resolution of the world. Filtered, or the streets shimmer as it turns.
    x.imageSmoothingEnabled = true;
    const sur = g.mapSurround;
    // The surround is square, 16 to the pixel: drawn at its own size, so its country lines up with the map's.
    if (sur) x.drawImage(sur, -P.x - sur.span, -P.z - sur.span, sur.width * 16, sur.height * 16);
    const mg = g.mapMargin;
    if (mg) x.drawImage(mg, mg.x0 - P.x, mg.z0 - P.z, mg.width * 2, mg.height * 2);
    x.drawImage(g.mapCanvas, -P.x, -P.z, WX, WZ);
    const H = g.horde;
    const rim = cx / scale, range = rim * 1.42;
    // Every one of them in range: this close in there are few enough to draw, and thinning them out hid half a crowd.
    for (let i = 0; i < H.n; i++) {
      const dx = H.px[i] - P.x, dz = H.pz[i] - P.z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      x.fillStyle = H.state[i] ? 'rgba(235,70,50,.85)' : 'rgba(190,110,90,.5)';
      x.fillRect(dx - .42, dz - .42, .85, .85);
    }
    for (const n of g.npcs.list) {
      const dx = n.x - P.x, dz = n.z - P.z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      if (n.kind === 'raider' && !n.aggro && Math.hypot(dx, dz) > 45) continue;
      x.fillStyle = n.kind === 'raider' ? '#f0963c' : n.kind === 'wanderer' ? '#d8d2a0' : '#8fd27a';
      x.fillRect(dx - .65, dz - .65, 1.3, 1.3);
    }
    for (const c2 of g.layout.camps) {
      const dx = c2.cx - P.x, dz = c2.cz - P.z;
      if (Math.hypot(dx, dz) < range * 1.4 + Math.max(c2.x1 - c2.x0, c2.z1 - c2.z0)) { x.strokeStyle = '#e8b04a'; x.lineWidth = 1.5 * px; x.strokeRect(c2.x0 - P.x, c2.z0 - P.z, c2.x1 - c2.x0, c2.z1 - c2.z0); }
    }
    this.drawGates(x, (gx) => gx - P.x, (gz) => gz - P.z, px, range * 1.6, P);
    for (const j of g.jobs.active) {
      if (j.status !== 'active' || unpointed(j)) continue;
      const dx = j.x - P.x, dz = j.z - P.z, d = Math.hypot(dx, dz);
      const k = d > rim * .95 ? rim * .95 / d : 1;
      x.fillStyle = '#6ec6ff';
      x.fillRect(dx * k - 3 * px, dz * k - 3 * px, 6 * px, 6 * px);
    }
    x.restore();
    x.fillStyle = '#e8b04a';
    x.beginPath(); x.moveTo(cx, cx - 11); x.lineTo(cx + 7, cx + 8); x.lineTo(cx, cx + 4); x.lineTo(cx - 7, cx + 8); x.closePath(); x.fill();
    const na = -P.yaw;
    x.fillStyle = '#e9e4d8';
    x.font = '600 24px Quantico, Bahnschrift, Segoe UI, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('N', cx + Math.sin(na) * (cx - 20), cx - Math.cos(na) * (cx - 20));
    // Named places nearby, always upright.
    const cosY = Math.cos(-P.yaw), sinY = Math.sin(-P.yaw);
    x.font = '500 17px Quantico, Bahnschrift, Segoe UI, sans-serif';
    x.shadowColor = '#000';
    x.shadowBlur = 4;
    let shown = 0;
    for (const p of g.layout.places) {
      const dx = (p.x - P.x) * scale, dz = (p.z - P.z) * scale;
      if (dx * dx + dz * dz > (cx - 18) * (cx - 18)) continue;
      if (shown++ >= 5) break;
      const sx = cx + dx * cosY - dz * sinY, sy = cx + dx * sinY + dz * cosY;
      if (p.kind === 'area' || p.kind === 'town') { x.fillStyle = 'rgba(233,228,216,.62)'; x.fillText(p.name, sx, sy); continue; }
      x.fillStyle = p.kind === 'park' ? '#9fd08a' : '#e9e4d8';
      x.save();
      x.translate(sx, sy);
      x.rotate(.785);
      x.fillRect(-4, -4, 8, 8);
      x.restore();
      x.fillText(p.name, sx, sy - 15);
    }
    x.shadowBlur = 0;
  }

  updateMarkers() {
    // Quest markers live on the compass and the map now, not hanging in the air.
    if (SHOW_WORLD_MARKERS === false) { for (const el of this.markerEls) el.style.display = 'none'; return; }
    const g = this.g, r = g.renderer;
    const host = $('markers');
    const vp = r.viewProj;
    let idx = 0;
    for (const j of g.jobs.active) {
      if (j.status !== 'active' || unpointed(j)) continue;
      const x = j.x, y = j.y + 3, z = j.z;
      const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      if (w <= 0) continue;
      const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w, ny = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
      if (Math.abs(nx) > .96 || Math.abs(ny) > .96) continue;
      let el = this.markerEls[idx];
      if (!el) { el = document.createElement('div'); el.className = 'marker'; host.appendChild(el); this.markerEls[idx] = el; }
      el.style.display = 'block';
      el.style.left = `${(nx * .5 + .5) * 100}%`;
      el.style.top = `${(.5 - ny * .5) * 100}%`;
      const metres = `${Math.round(Math.hypot(x - g.player.x, z - g.player.z))}m`;
      el.textContent = j.type === 'patrol' ? `${j.posts[j.next].name}, ${metres}` : metres;
      idx++;
    }
    for (; idx < this.markerEls.length; idx++) this.markerEls[idx].style.display = 'none';
  }

  setFPS(text, on) {
    const f = $('fps');
    f.style.display = on ? 'block' : 'none';
    if (on) f.textContent = text;
  }

  // --- Inventory ---------------------------------------------------------------------------------
  openInventory() {
    this.open('inventory', false);
    this.renderInventory();
    const sim = this.g.campSim;
    this.radioCamp = sim.lastCamp >= 0 ? sim.lastCamp : this.g.player.home;
    this.renderNews();
  }

  // One camp's radio at a time: everything that has gone past while you were looking the other way, newest first, a day at a time.
  renderNews() {
    const g = this.g, sim = g.campSim, camps = g.layout.camps.filter((c) => g.player.discovered[c.id]);
    if (!camps.some((c) => c.id === this.radioCamp)) this.radioCamp = camps.length ? camps[0].id : -1;
    const at = camps.findIndex((c) => c.id === this.radioCamp), here = camps[at];
    const bar = $('radio-camps');
    bar.innerHTML = here ? `<button data-step="-1"${camps.length < 2 ? ' disabled' : ''}>&lsaquo;</button><span>${here.name} Radio${sim.state[here.id].status === 'overrun' ? ' (fallen)' : ''}</span><button data-step="1"${camps.length < 2 ? ' disabled' : ''}>&rsaquo;</button>` : '';
    bar.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      this.radioCamp = camps[(at + Number(b.dataset.step) + camps.length) % camps.length].id;
      this.renderNews();
    }));
    const list = sim.news.filter((n) => n.campId === undefined ? this.radioCamp === (sim.lastCamp >= 0 ? sim.lastCamp : g.player.home) : n.campId === this.radioCamp).map((n, i) => [n, i]).sort((a, b) => (b[0].at - a[0].at) || (b[1] - a[1])).map((q) => q[0]);
    let html = '', day = -1;
    for (const n of list) {
      const d = Math.floor(n.at), when = clockOf(n.at - d);
      if (d !== day) { day = d; html += `<div class="list-title">Day ${OUTBREAK_DAYS + d}</div>`; }
      if (n.kind === 'report') {
        const rows = (n.rows || []).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
        html += `<div class="news-item report${n.fell ? ' fell' : ''}${n.win ? ' win' : ''}"><b>${n.title}</b><small>${[when, n.camp, n.sub].filter(Boolean).join(', ')}</small>${rows ? `<div class="rows">${rows}</div>` : ''}${n.note ? `<p>${n.note}</p>` : ''}</div>`;
      } else if (n.kind === 'op') {
        const rows = (n.rows || []).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
        html += `<div class="news-item op ${n.stage.toLowerCase().replace(/\s.*/, '')}">${opBannerHtml(n.name)}<b>${n.stage}</b><small>${when}, ${g.layout.camps[n.campId].name}</small><p>${n.text}</p>${rows ? `<div class="rows">${rows}</div>` : ''}</div>`;
      } else if (n.kind === 'contract') {
        html += `<div class="news-item contract${n.bad ? ' fell' : ''}">${n.title ? `<b>${n.title}</b>` : ''}<small>${when}, Contract</small><p>${n.text}</p></div>`;
      } else {
        const station = n.campId !== undefined && g.layout.camps[n.campId] ? g.layout.camps[n.campId].name : null;
        const by = station ? (n.who && n.who !== station ? `${station} Radio, ${n.who}` : `${station} Radio`) : n.who;
        html += `<div class="news-item radio"><small>${when}, ${by}</small><p>${n.text}</p></div>`;
      }
    }
    $('news-list').innerHTML = html || '<div style="color:var(--dim);font-size:13px">Nothing from this settlement yet. Radio calls, day reports and operations will collect here.</div>';
    $('news-list').scrollTop = 0;
  }

  renderInventory(detail) {
    const P = this.g.player;
    const groups = [['Weapons and tools', ['melee', 'gun', 'throw', 'block', 'tool']], ['Armour', ['armor', 'pack']], ['Medicine and food', ['med', 'food']], ['Ammunition', ['ammo']], ['Papers and keys', ['papers', 'keys']], ['Junk', ['junk']]];
    const box = $('inv-list');
    box.innerHTML = '';
    for (const [title, types] of groups) {
      const ids = Object.keys(P.inventory).filter((id) => types.includes(ITEMS[id]?.type));
      if (!ids.length) continue;
      const t = document.createElement('div');
      t.className = 'list-title';
      t.textContent = title;
      box.appendChild(t);
      ids.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b));
      for (const id of ids) {
        const it = ITEMS[id];
        const b = document.createElement('button');
        b.className = `item ${P.weapon === id || P.armor === id ? 'eq' : ''}`;
        const mag = it.type === 'gun' ? ` ${P.mags[id] ?? 0}/${it.mag}` : '';
        b.innerHTML = `<span>${it.name}${P.count(id) > 1 ? ` <small>x${P.count(id)}</small>` : ''}</span><small>${mag}</small>`;
        b.addEventListener('mouseenter', () => this.itemDetail('inv-detail', id));
        b.addEventListener('click', () => { P.useItem(id); this.renderInventory(id); });
        b.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (it.type === 'papers' || it.type === 'keys') { this.toast('You are keeping those.'); return; }
          if (P.remove(id, 1)) { this.g.addPickup(P.x, P.y + .5, P.z, { id, count: 1 }); this.renderInventory(id); }
        });
        box.appendChild(b);
      }
    }
    $('inv-sum').textContent = `${P.carryWeight().toFixed(1)} / ${P.carryCap()} kg    ${SP} ${fmt(P.scrip)}`;
    const A = P.armor ? ITEMS[P.armor] : null;
    $('inv-stats').innerHTML = [
      ['Health', `${Math.ceil(P.health)} / 100`], ['Infection', `${Math.round(P.infection)}%`], ['Armour', A ? `${A.name}, ${Math.round(A.armor * 100)}%` : 'None'],
      ['Reputation', P.rep <= -30 ? 'Marked' : P.rep < 0 ? 'Distrusted' : P.rep < 25 ? 'Neutral' : P.rep < 60 ? 'Respected' : 'Well known'],
      ['Zombies killed', fmt(P.kills)], ['Headshots', fmt(P.headshots)], ['Voxels broken', fmt(P.voxelsBroken)], ['Commissions', fmt(this.g.stats.jobs)], ['Time played', playTime(this.g.stats.playSecs || 0)], ['Operations', fmt(this.g.stats.ops || 0)],
    ].map(([a, b]) => `${a.padEnd(16, ' ')}<b>${b}</b>`).join('<br>');
    if (detail) this.itemDetail('inv-detail', detail);
  }

  itemDetail(host, id) {
    const it = ITEMS[id];
    if (!it) return;
    const parts = [];
    if (it.type === 'gun') parts.push(`${it.pellets ? `${it.pellets} x ` : ''}${it.dmg || 'blast'} damage`, `${Math.round(60 / it.rate)} rpm`, `${it.mag} rounds`, `${ITEMS[it.ammo].name}`);
    if (it.type === 'melee') parts.push(`${it.dmg} damage`, `hits ${it.cleave}`, `${it.blockDmg} block damage`);
    if (it.weight) parts.push(`${it.weight} kg`);
    $(host).innerHTML = `<b>${it.name}</b><br>${it.desc}<br><span class="mono" style="font-size:12px">${parts.join(' / ')}</span>`;
  }

  // --- Trade ------------------------------------------------------------------------------------------
  // Your standing with this trader's camp sets their prices.
  tradeStanding() {
    const n = this.tradeNpc, D = this.g.dialogue;
    return n && n.camp >= 0 ? D.standing(n.camp) : this.g.player.rep;
  }

  priceBuy(id) {
    const mod = 1.3 - Math.max(-30, Math.min(60, this.tradeStanding())) * .005;
    return Math.max(1, Math.ceil(ITEMS[id].value * mod));
  }

  priceSell(id, role) {
    const it = ITEMS[id];
    if (it.type === 'block' || it.type === 'papers' || it.type === 'keys') return 0;
    const bonus = role === 'junk' && it.type === 'junk' ? 1.45 : 1;
    const mod = (.42 + Math.max(-30, Math.min(60, this.tradeStanding())) * .003) * bonus;
    return Math.max(1, Math.floor(it.value * mod));
  }

  openTrade(npc) {
    this.tradeNpc = npc;
    this.open('trade', false);
    this.renderTrade();
  }

  renderTrade() {
    const g = this.g, P = g.player, n = this.tradeNpc;
    const role = n.role || 'general';
    const stock = g.npcs.stockFor(n.camp, role, n.stockKey);
    $('trade-title').textContent = `${n.name}, ${n.title && n.part ? n.title : ROLES[role].title}`;
    $('trade-sum').textContent = `${SP} ${fmt(P.scrip)}    ${P.carryWeight().toFixed(1)} / ${P.carryCap()} kg`;
    const buy = $('trade-buy'), sell = $('trade-sell');
    buy.innerHTML = '<div class="list-title">For sale</div>';
    sell.innerHTML = '<div class="list-title">Your goods</div>';
    const row = (id, count, price, onClick) => {
      const it = ITEMS[id];
      const b = document.createElement('button');
      b.className = 'item';
      const lot = it.bundle || 1;
      if (price === 0) b.style.display = 'none';
      b.innerHTML = `<span>${it.name} <small>x${count}</small></span><small>${lot > 1 ? `${lot} for ` : ''}${price * lot}</small>`;
      b.addEventListener('mouseenter', () => this.itemDetail('trade-detail', id));
      b.addEventListener('click', (e) => onClick(id, lot * (e.shiftKey ? 10 : 1)));
      return b;
    };
    const ids = Object.keys(stock).filter((id) => stock[id] > 0);
    ids.sort((a, b) => ITEMS[a].type.localeCompare(ITEMS[b].type) || ITEMS[b].value - ITEMS[a].value);
    for (const id of ids) {
      const b = row(id, stock[id], this.priceBuy(id), (i, amount) => this.buy(i, amount, stock));
      // The good stuff goes to people the camp knows, unless you started out as someone they would know already.
      const need = n.camp >= 0 && P.loadout !== 'veteran' ? (TRUST_LOCK[id] || 0) : 0;
      if (need > g.dialogue.standing(n.camp)) {
        b.disabled = true;
        b.classList.add('locked');
        b.title = `Only for people who are ${standingName(need)} here`;
        b.querySelector('small:last-child').textContent = standingName(need);
      }
      buy.appendChild(b);
    }
    if (!ids.length) buy.insertAdjacentHTML('beforeend', '<div style="color:var(--dim);padding:8px">Sold out until tomorrow.</div>');
    const mine = Object.keys(P.inventory).filter((id) => ITEMS[id]);
    mine.sort((a, b) => ITEMS[a].type.localeCompare(ITEMS[b].type) || ITEMS[b].value - ITEMS[a].value);
    for (const id of mine) sell.appendChild(row(id, P.count(id), this.priceSell(id, role), (i, amount) => this.sell(i, amount, stock, role)));
  }

  buy(id, amount, stock) {
    const P = this.g.player;
    const take = Math.min(amount, stock[id]);
    const price = this.priceBuy(id);
    const can = Math.min(take, Math.floor(P.scrip / price));
    if (can <= 0) { this.g.audio.simple('bonk'); this.toast('Not enough spades', 'bad'); return; }
    P.scrip -= can * price;
    P.gain(id, can);
    stock[id] -= can;
    if (ITEMS[id].type === 'keys') {
      for (let i = 0; i < can; i++) this.g.bikes.deliver(this.tradeNpc);
      this.toast('It is out in the street in front of the garage.');
    }
    this.g.audio.simple('coin');
    this.renderTrade();
  }

  sell(id, amount, stock, role) {
    const P = this.g.player;
    const n = P.remove(id, amount);
    if (!n) return;
    P.scrip += n * this.priceSell(id, role);
    stock[id] = (stock[id] || 0) + n;
    this.g.audio.simple('coin');
    this.renderTrade();
  }

  // --- Dialogue --------------------------------------------------------------------------------------------
  openDialog(npc) {
    const g = this.g;
    this.dlgNpc = npc;
    document.body.classList.add('talking');
    this.open('dialog', false);
    try {
      this.say(g.dialogue.greeting(npc));
      this.renderOptions();
    } catch (e) {
      // Whatever went wrong in there, the way out is always on the screen.
      console.error('[dialogue]', e);
      $('dlg-opts').innerHTML = '';
      this.optionButton('Leave', () => g.resume(), 'seen');
    }
  }

  backToDialog() {
    document.body.classList.add('talking');
    this.open('dialog', false);
    this.say(this.smallTalk());
    this.renderOptions();
  }

  // Lines type out, as if spoken. Any key or click finishes the line.
  // Spoken, a letter at a time, each letter a little blip in the speaker's own voice: higher or lower, the same every time you talk
  // to them. Only in conversation; what people say over their heads as you pass is silent.
  say(text) {
    const el = $('dlg-text');
    clearInterval(this.typeTimer);
    this.typeFull = text;
    const n = this.dlgNpc, g = this.g;
    if (n) this.voiceOf(n);
    let i = 0;
    el.textContent = '';
    this.typeTimer = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      const ch = text[i - 1];
      if (n && /[A-Za-z0-9]/.test(ch || '') && i % 2 === 0) g.audio.voice(n.voice);
      // A beat at the end of a sentence.
      if (ch === '.' || ch === '?' || ch === '!') { clearInterval(this.typeTimer); this.typeTimer = setTimeout(() => this.resumeType(text, i, el), 140); return; }
      if (i >= text.length) { clearInterval(this.typeTimer); this.typeTimer = null; }
    }, 22);
  }

  resumeType(text, from, el) {
    if (this.typeFull !== text || from >= text.length) { this.typeTimer = null; return; }
    const n = this.dlgNpc, g = this.g;
    let i = from;
    this.typeTimer = setInterval(() => {
      i += 1;
      el.textContent = text.slice(0, i);
      const ch = text[i - 1];
      if (n && /[A-Za-z0-9]/.test(ch || '') && i % 2 === 0) g.audio.voice(n.voice);
      if ((ch === '.' || ch === '?' || ch === '!') && i < text.length) { clearInterval(this.typeTimer); this.typeTimer = setTimeout(() => this.resumeType(text, i, el), 140); return; }
      if (i >= text.length) { clearInterval(this.typeTimer); this.typeTimer = null; }
    }, 22);
  }

  finishLine() {
    if (!this.typeTimer) return;
    clearInterval(this.typeTimer);
    clearTimeout(this.typeTimer);
    this.typeTimer = null;
    $('dlg-text').textContent = this.typeFull;
  }

  setHeader(n) {
    const g = this.g;
    const camp = n.camp >= 0 ? g.layout.camps[n.camp] : null;
    $('dlg-name').textContent = n.name;
    $('dlg-role').textContent = [n.title, camp ? camp.name : n.campName].filter(Boolean).join(', ');
    if (n.camp >= 0) {
      const v = g.dialogue.standing(n.camp);
      $('dlg-standing').textContent = `Standing: ${standingName(v)}`;
    } else $('dlg-standing').textContent = '';
  }

  optionButton(label, fn, cls = '', off = false) {
    const opts = $('dlg-opts');
    const b = document.createElement('button');
    const n = opts.children.length + 1;
    b.className = off ? 'off' : cls;
    b.innerHTML = `<span class="kbd">${n}</span> ${label}`;
    if (off) b.disabled = true;
    else b.addEventListener('click', () => { this.finishLine(); fn(); });
    opts.appendChild(b);
    return b;
  }

  // Never more than four things to say: three choices across the top and the way out at the bottom.
  // Anything longer turns into pages behind a "More".
  setChoices(list, back, page = 0) {
    const box = $('dlg-opts');
    box.innerHTML = '';
    const per = 3;
    let shown = list, more = false;
    if (list.length > per) {
      const size = per - 1, pages = Math.ceil(list.length / size);
      const p = page % pages;
      shown = list.slice(p * size, p * size + size);
      more = true;
      this.choicePage = p;
    }
    for (const c of shown) this.optionButton(c.label, c.fn, c.cls || '', !!c.off);
    if (more) this.optionButton('More', () => this.setChoices(list, back, page + 1), 'seen');
    while (box.children.length < per) {
      const gap = document.createElement('span');
      gap.className = 'gap';
      box.appendChild(gap);
    }
    // No way out to offer: the slot stays, empty, so the four always sit in the same places.
    if (back) this.optionButton(back.label, back.fn, 'seen');
    else { const gap = document.createElement('span'); gap.className = 'gap'; box.appendChild(gap); }
  }

  renderOptions(thread) {
    const g = this.g, P = g.player, n = this.dlgNpc;
    this.setHeader(n);
    this.hideContractPage();
    $('dlg-jobs').innerHTML = '';
    const owedTo = n.kind === 'follower' ? -1 : n.camp >= 0 ? n.camp : n.factionId ? n.factionId - 1 : -1;
    const leave = { label: 'Leave', fn: () => g.resume() };
    if (owedTo >= 0 && g.npcs.owesBail(owedTo) && (g.npcs.hostileCamp(owedTo) || n.kind === 'clerk' || n.kind === 'roamer')) {
      const list = [];
      if (n.kind === 'clerk' || n.kind === 'roamer') {
        const bail = g.npcs.bailFor(owedTo);
        list.push({ label: `Pay my bail (${bail} spades)`, cls: 'quest', fn: () => {
          if (P.scrip < bail) { this.toast('Not enough spades', 'bad'); return; }
          g.npcs.payBail(owedTo);
          this.say(n.kind === 'clerk' ? 'Fine. It is in the book. Everybody gets one of these. Do not make me regret it.' : `That squares it. Word will reach ${g.layout.camps[owedTo].name} before you do.`);
          this.renderOptions();
        } });
      }
      this.setChoices(list, leave);
      return;
    }
    if (thread) { this.talkMenu(thread); return; }
    if (n.kind === 'clerk') {
      if (!g.jobs.active.some((a) => a.type === 'visit' && a.leader)) g.jobs.visited();
      this.setChoices(this.clerkRoot(n), leave);
      return;
    }

    const topics = g.dialogue.topics(n);
    const isWork = (t) => t.job || t.pay;
    const isDeed = (t) => t.recruit || t.dismiss || t.food || t.give || t.scrip || t.rest;
    // What they are for comes first, one key away. Chatting is what is left after that.
    const root = this.actionsFor(n, topics.filter(isDeed), topics.some(isWork));
    root.push({ label: 'Talk', fn: () => this.talkMenu() });
    this.setChoices(root, leave);
  }

  // Everything you can do with this person, as opposed to say to them. Most useful first.
  actionsFor(n, deeds, hasWork) {
    const g = this.g, P = g.player;
    const list = [];
    if (n.doctor) list.push(this.treatment(n));
    if (n.role) list.push({ label: n.doctor ? 'Buy medicine' : 'Trade', cls: n.doctor ? '' : 'primary', fn: () => this.openTrade(n) });
    if (n.role === 'mechanic') list.push(this.refuel(n));
    // Anyone working a contract for the camp gets a box from the traders, once a day.
    if (n.role && !n.doctor && n.camp >= 0 && g.jobs.perkFree(n.camp, 'box')) list.push({ label: 'Contract supplies (free today)', cls: 'quest', fn: () => {
      g.jobs.usePerk(n.camp, 'box');
      const got = g.jobs.supplyBox();
      g.audio.simple('crate');
      this.say(`Settlement's paying. ${got.join(', ')}. Same again tomorrow, if you are still on the books.`);
      this.renderOptions();
    } });
    if (n.kind !== 'clerk' && hasWork) list.push({ label: 'A personal matter', cls: 'quest', fn: () => this.workMenu() });
    // A new arrival's first conversation with whoever runs the place.
    const intro = n.kind === 'boss' && g.jobs.active.find((a) => a.type === 'visit' && a.leader && a.campId === n.camp);
    if (intro) list.unshift({ label: 'I\'m new here', cls: 'quest', fn: () => {
      // First the job. Then, once you have said you will do it, what you will need to do it with.
      const c = g.layout.camps[n.camp];
      g.jobs.visited();
      const job = g.jobs.leaderJob(c), side = job.side;
      $('dlg-jobs').innerHTML = '';
      this.say(`Then you can start by being useful. There are always a few of them outside the ${side} gate. Put ${job.need} of them down, then go to the Town Hall and they will pay you. After that, they will have real work for you.`);
      this.setChoices([{ label: 'Understood.', cls: 'primary', fn: () => {
        const got = P.takeKit();
        if (!got.length) { g.resume(); return; }
        g.audio.simple('crate');
        this.say(`One more thing. You came in with nothing, and you are no use to me like that. Take this: ${got.join(', ')}.`);
        this.setChoices([{ label: 'Thanks.', cls: 'primary', fn: () => g.resume() }], null);
      } }], null);
    } });
    if (n.kind === 'boss' && P.home !== n.camp && g.campSim.state[n.camp].status === 'holding' && g.npcs.admitted(n.camp)) {
      list.push({ label: 'Ask to join', cls: 'primary', fn: () => {
        const homeless = P.home < 0 || g.campSim.state[P.home].status !== 'holding';
        if (g.dialogue.standing(n.camp) < (homeless ? -5 : 10)) { this.say(homeless ? 'Not after what you did here. Square things with us first.' : 'You have people of your own. Do some work for us and ask me again.'); return; }
        g.npcs.join(n.camp);
        this.say(homeless ? 'Then you are one of ours now. Find a bunk, there are more of them free than I would like. We will need you on that wall.' : 'All right. You are one of ours. Find a bunk, and get on the wall when the horn goes.');
        this.renderOptions();
      } });
    }
    const papers = n.kind === 'roamer' && n.factionId ? n.factionId - 1 : -1;
    if (papers >= 0 && !g.npcs.admitted(papers)) {
      const fee = g.npcs.citizenFee(papers);
      list.push({ label: `Buy citizenship (${fee.toLocaleString('en-US')} spades)`, cls: 'quest', fn: () => {
        if (g.dialogue.standing(papers) < -5) { this.say('Not with your name, you are not. Square things with them first.'); return; }
        if (P.scrip < fee) { this.say(`${fee.toLocaleString('en-US')}. Exactly that, and not a coin less. Come back when you have got it.`); return; }
        g.npcs.buyCitizenship(papers);
        this.say(`Okay. I will radio your name in, and the gate will open for you from now on. That is good until the day you die, and not a day after.`);
        this.renderOptions();
      } });
    }
    if (n.kind === 'boss') {
      // Your ammunition can keep their guns firing.
      const spare = ['ammo_rifle', 'ammo_pistol', 'ammo_shell'].find((id) => P.count(id) >= 30);
      if (spare && g.campSim.state[n.camp].ammo < 90) {
        list.push({ label: `Give 30 ${ITEMS[spare].name}`, cls: 'quest', fn: () => {
          P.remove(spare, 30);
          const S = g.campSim.state[n.camp];
          S.ammo = Math.min(100, S.ammo + 12);
          g.dialogue.addStanding(n.camp, 2);
          g.audio.simple('crate');
          this.say(`That helps. We are at ${Math.round(S.ammo)} percent now. People will remember this.`);
          this.renderOptions();
        } });
      }
    }
    for (const t of deeds) list.push(this.topicChoice(n, t, () => this.renderOptions()));
    return list;
  }

  // Patching people up is the job. It costs what the supplies cost, and less if they know you.
  // The mechanic fills whatever bike you have brought round to the garage, by the litre.
  refuel(n) {
    const g = this.g, P = g.player;
    const bike = g.bikes.needingFuel(n.x, n.z)[0];
    if (!bike) return { label: 'Fill up a motorbike', cls: 'seen', fn: () => this.say('Fill up what? Bring it round the front where I can get the can to it.') };
    const fee = Math.max(8, Math.ceil((1 - bike.fuel) * 140));
    return { label: `Fill up the motorbike (${fee} spades)`, cls: 'primary', fn: () => {
      if (P.scrip < fee) { this.say(`That is ${fee} for a full tank. Petrol does not grow on trees. Nothing grows on trees any more.`); return; }
      P.scrip -= fee;
      bike.fuel = 1;
      bike.dryTold = false;
      g.audio.simple('coin');
      this.say(((l) => l[Math.floor(Math.random() * l.length)])(['There. Full. Try not to run it dry out in the middle of nowhere, I am not coming to get you.', 'Brim full. It drinks, that one. Go easy on the throttle if you want it to last.', 'Done. Do not tell anyone where I keep the cans.']));
      this.renderOptions();
    } };
  }

  treatment(n) {
    const g = this.g, P = g.player;
    const v = g.dialogue.standing(n.camp), hurt = 100 - P.health, bad = P.infection;
    const fee = Math.ceil((hurt * .7 + bad * 1.1) * (v >= 25 ? .6 : v >= 10 ? .8 : 1));
    if (hurt < 1 && bad < 1) return { label: 'Check me over', cls: 'seen', fn: () => this.say('You are fine. Better than most who come through here. Go on, I have people waiting.') };
    // On contract here: once a day, the camp pays for it.
    const free = g.jobs.perkFree(n.camp, 'doc');
    return { label: free ? 'Treat me (free today, on contract)' : `Treat me (${fee} spades)`, cls: 'primary', fn: () => {
      if (free) {
        g.jobs.usePerk(n.camp, 'doc');
        P.health = 100;
        P.infection = 0;
        g.audio.simple('crate');
        this.say('You are on the books, so this one is on the settlement. Once a day, mind. After that you pay like everyone else.');
        this.renderOptions();
        return;
      }
      if (P.scrip < fee) { this.say(`I need ${fee} for the supplies, and I know what you are going to say. I cannot run this place on promises.`); return; }
      P.scrip -= fee;
      P.health = 100;
      P.infection = 0;
      g.audio.simple('crate');
      this.say(bad > 5 ? 'That should stop the infection for now. Keep it clean. You were closer than you think.' : 'There. Stitched and cleaned. Try to keep your insides inside for a few days.');
      this.renderOptions();
    } };
  }

  topicChoice(n, t, after) {
    const g = this.g, P = g.player;
    const seen = n.part && P.dlg.flags[`seen_${n.part.id}_${t.id}`];
    return { label: t.ask, cls: t.recruit || t.food || t.dismiss ? 'quest' : seen ? 'seen' : (t.job || t.pay ? 'quest' : ''), fn: () => {
      const r = g.dialogue.choose(n, t);
      this.say(r.text);
      // Said yes to coming along, or agreed to head home: that is the conversation over. One key and you are on your way.
      if ((t.recruit && n.kind === 'follower') || t.dismiss) {
        this.setChoices([{ label: t.dismiss ? 'Take care.' : 'Let\'s go.', cls: 'primary', fn: () => g.resume() }], null);
        return;
      }
      if (r.then) this.talkMenu(r.then); else after();
    } };
  }

  talkMenu(thread) {
    const g = this.g, n = this.dlgNpc;
    const isDeed = (t) => t.recruit || t.dismiss || t.food || t.give || t.scrip || t.rest;
    const topics = g.dialogue.topics(n, thread).filter((t) => thread || !(t.job || t.pay || isDeed(t)));
    const list = topics.map((t) => this.topicChoice(n, t, () => this.talkMenu()));
    if (!thread) {
      if (n.kind === 'boss') {
        // What a leader is for now: how the place works, and how it is doing.
        const c = g.layout.camps[n.camp], side = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(Math.atan2(c.clerk.doorX - n.x, -(c.clerk.doorZ - n.z)) / (Math.PI / 4) + 8) % 8];
        const clerk = g.campSim.state[n.camp].clerkName;
        list.push({ label: 'Where do I find work?', cls: 'seen', fn: () => { this.say(`The Town Hall, ${c.key === 'garvey' ? `the church ${side} of the square` : `${side} of here`}. ${clerk} keeps the board and pays out. I do not hand out work myself. I would never get anything else done.`); this.talkMenu(); } });
        list.push({ label: 'What is an operation?', cls: 'seen', fn: () => { this.say(`When a big attack is coming we give it a name, because it will not be over by morning. It can run for days. Anyone who fights gets a little for each kill if we hold. If you want more, sign a contract at the Town Hall. The board goes up before it starts, and you can sign on partway through too. An operation contract pays well, but there is a quota to meet every day: miss it and they dock you, miss it three times and you are off the job with nothing. Patrol means walking the outside of the wall once a day for three days, and a night shift means three nights in a row with a quota. Miss one of those and the contract is over. If we fall, nobody collects what they are still owed.`); this.talkMenu(); } });
        list.push({ label: 'How is the wall holding?', cls: 'seen', fn: () => { this.say(g.campSim.report(n.camp)); this.talkMenu(); } });
      }
      if (!n.kid) list.push({ label: 'Heard anything?', cls: 'seen', fn: () => { this.say(g.npcs.rumor()); this.talkMenu(); } });
    }
    this.setChoices(list, thread
      ? { label: 'Something else', fn: () => { this.say(this.smallTalk()); this.talkMenu(); } }
      : { label: 'Back', fn: () => { this.say(this.smallTalk()); this.renderOptions(); } });
  }

  // Three things you come to a town hall for, always in the same place.
  clerkRoot(n) {
    const g = this.g, reports = g.jobs.reportsFor(n), total = reports.reduce((a, j) => a + (j.reward || 0), 0), docked = reports.find((j) => j.fullPay > j.reward);
    if (!g.jobs.introDone()) {
      const lead = LORE[g.layout.camps[n.camp].key].cast.find((m) => m.role === 'leader');
      const intro = g.jobs.active.find((a) => a.intro && a.campId === n.camp);
      return [
        { label: `Commissions (see ${lead ? lead.name.split(' ')[0] : 'the leader'} first)`, off: true },
        { label: `Contracts (see ${lead ? lead.name.split(' ')[0] : 'the leader'} first)`, off: true },
        { label: reports.length ? `Accept rewards (+${SP} ${fmt(total)})` : 'Accept rewards', cls: 'quest', off: !reports.length, fn: () => {
          for (const j of reports) g.jobs.turnIn(j);
          this.say(intro ? 'That is the approach clear. Good. You are on the books now: come back when you want work.' : 'You are on the books now. Come back when you want work.');
          this.renderOptions();
        } },
      ];
    }
    return [
      { label: 'Commissions', cls: 'quest', fn: () => this.workMenu() },
      { label: 'Contracts', cls: 'quest', fn: () => this.contractsMenu(n) },
      ...this.earlyChoice(n),
      { label: reports.length ? `Accept rewards (+${SP} ${fmt(total)}${docked ? ', docked' : ''})` : 'Accept rewards', cls: 'quest', off: !reports.length, fn: () => {
        const stood = reports.some((j) => j.type === 'defended');
        for (const j of reports) g.jobs.turnIn(j);
        this.say(docked ? `Missed quotas docked your pay. ${SP} ${fmt(docked.reward)} of the ${SP} ${fmt(docked.fullPay)} it would have been. It is all in the book.` : stood ? 'You were on the wall when it counted, and it is all in the book. Here. You earned every one.' : 'Good work. That is what people here eat on.');
        this.renderOptions();
      } },
    ];
  }

  // Settling an operation contract before it is over, for less than it is worth. Only offered once it has run long.
  earlyChoice(n) {
    const g = this.g, e = g.jobs.earlyPayout(n.camp);
    if (!e) return [];
    if (e.locked) return [{ label: 'Early payout (meet today\'s quota first)', off: true }];
    return [{ label: `Early payout (+${SP} ${fmt(e.pay)}, ${Math.round(e.cut * 100)}% cut from ${SP} ${fmt(e.full)})`, cls: 'quest', fn: () => {
      const op = g.campSim.state[n.camp].op, paid = g.jobs.takeEarlyPayout(n.camp);
      if (!paid) { this.renderOptions(); return; }
      this.say(`It was meant to be over ${e.over === 1 ? 'yesterday' : `${e.over} days ago`}, and I would rather pay you now than owe you later. ${SP} ${fmt(paid)}. Your contract on Operation ${op.name} is done.`);
      this.renderOptions();
    } }];
  }

  contractsMenu(n) {
    this.hideContractPage();
    const g = this.g, c = g.layout.camps[n.camp], s = g.campSim.state[n.camp], op = s.op, next = s.opNext, j = g.jobs.opJob(n.camp), patJob = g.jobs.active.find((a) => a.type === 'patrol' && a.campId === n.camp), pat = patJob && patJob.status === 'active', nightJob = g.jobs.nightOf(n.camp), clr = nightJob && nightJob.status === 'active';
    $('dlg-jobs').innerHTML = '';
    const signed = j && j.plan === 'vanguard', target = op || next;
    const dd = op ? g.campSim.opDayOf(op) : null;
    this.say(op ? `Operation ${op.name}, ${dd.text.toLowerCase()}.${dd.over ? ' It is running long. Anyone on a contract can take an early payout from me, at a cut.' : ` It is ${g.campSim.opLength(op.predict)}, if it goes to plan.`} It is not too late to sign on. Patrols and night shifts are always open.` : next ? `Operation ${next.name} is on the board, ${g.campSim.opLength(next.predict)}. It starts in about ${g.campSim.opNoticeHours(s)} hours, and you can sign for it now. Patrols and night shifts are always open.` : 'Nothing on the board for an operation yet. You will hear when there is. Patrols and night shifts are always open.');
    const shift = `${SP} ${OP_PAY.shift} a shift`;
    const cards = [
      { tag: '', title: 'Patrol contract', pay: shift, meta: 'Walk the corners round the settlement and keep them clear.',
        state: pat ? 'Signed' : patJob ? 'Pay waiting' : signed || clr ? 'Under contract' : '', off: pat || !!patJob || signed || clr, fn: () => this.contractCard(n, 'patrol') },
      { tag: '', title: 'Night shift contract', pay: shift, meta: 'Hold the wall through the night and make your quota.',
        state: clr ? 'Signed' : nightJob ? 'Pay waiting' : signed || pat ? 'Under contract' : '', off: clr || !!nightJob || signed || pat, fn: () => this.contractCard(n, 'night') },
      { tag: '', title: target ? `Operation ${target.name}` : 'No operation posted', pay: target ? `${SP} ${OP_PAY.vanguard} a kill` : '',
        meta: target ? (op ? 'Under way now.' : `Starts in about ${g.campSim.opNoticeHours(s)} hours.`) : 'You will hear on the radio when there is one.',
        state: signed ? 'Joined' : !target ? '' : pat || clr ? 'Under contract' : j && j.void ? 'Terminated' : '', off: !target || signed || pat || clr || !!(j && j.void), fn: () => this.contractCard(n, 'vanguard') },
    ];
    this.board(cards);
    this.setChoices([], { label: 'Back', fn: () => { $('dlg-jobs').innerHTML = ''; this.say(this.smallTalk()); this.renderOptions(); } });
  }

  workMenu() {
    const g = this.g, n = this.dlgNpc;
    $('dlg-jobs').innerHTML = '';
    const back = { label: 'Back', fn: () => { $('dlg-jobs').innerHTML = ''; this.say(this.smallTalk()); this.renderOptions(); } };
    const list = n.kind === 'clerk' ? [] : g.dialogue.topics(n).filter((q) => q.job || q.pay).map((t) => this.topicChoice(n, t, () => this.workMenu()));
    if (n.kind === 'clerk') {
      const c = g.layout.camps[n.camp], op = g.campSim.state[n.camp].op, j = g.jobs.opJob(n.camp), words = [];
      const nightOn = g.jobs.nightOf(n.camp);
      if (op && !j && !g.jobs.patrolOf(n.camp) && !(nightOn && nightOn.status === 'active')) {
        words.push(`Operation ${op.name}, ${g.campSim.opDayOf(op).text.toLowerCase()}. Anyone who fights gets ${SP} ${OP_PAY.commission} a kill if we hold.`);
      }
      const offers = g.jobs.offersFor(n.camp);
      // Operation pay is not something you take on, so it does not fill your hands.
      const full = g.jobs.active.filter((a) => a.type !== 'defend' && a.type !== 'defended' && a.type !== 'visit' && a.type !== 'migrate').length >= 5;
      if (full) words.push('You already have your hands full. Finish something first.');
      else if (!op) words.push(offers.length ? (g.dialogue.loreOf(n)?.jobIntro || 'Here is what the board says today.') : 'Nothing else until tomorrow.');
      const TAG = { kill: 'Cull', fetch: 'Fetch', hold: 'Relay', bounty: 'Bounty' };
      const out = (job) => Math.max(0, Math.round(Math.max(c.x0 - job.x, job.x - c.x1, c.z0 - job.z, job.z - c.z1)));
      const task = (job) => job.type === 'kill' ? `${job.need} infected` : job.type === 'bounty' ? (job.gang > 1 ? `${job.gang} raiders` : 'one raider') : job.type === 'hold' ? `${job.time} seconds on the relay` : 'one cache';
      this.board(offers.map((job) => ({ tag: TAG[job.type] || 'Work', state: `${out(job)}m`, title: job.title, pay: `${SP} ${fmt(job.reward)}${job.bonus ? ` + ${ITEMS[job.bonus].name}` : ''}`,
        meta: `${task(job)}, ${job.where}`, off: full, fn: () => this.jobCard(n, job) })));
      this.say(words.join(' '));
    }
    this.setChoices(list, back);
  }

  // A board of cards in the dialog: one for each thing on offer, laid out side by side, as many as there are. Each card is
  // { tag, state, title, pay, meta, off, fn }: what kind of work, a word on where it stands, what it is, what it pays, and the details.
  board(cards) {
    const box = $('dlg-jobs');
    box.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'board';
    for (const c of cards) {
      const b = document.createElement('button');
      b.className = `card${c.off ? ' off' : ''}`;
      // The small line over the title only when it says something the title does not: the kind of job, or where it stands.
      const head = c.tag || c.state ? `<span class="tag"><span>${c.tag || ''}</span>${c.state ? `<i>${c.state}</i>` : ''}</span>` : '';
      b.innerHTML = `${head}<b>${c.title}</b>${c.pay ? `<span class="pay">${c.pay}</span>` : ''}${c.meta ? `<span class="meta">${c.meta}</span>` : ''}`;
      if (c.off) b.disabled = true;
      else b.addEventListener('click', () => { this.finishLine(); this.g.audio.simple('ui'); c.fn(); });
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }

  // What you would be signing, in writing, before you sign it.
  showContractPage(p) {
    const rows = (list) => list.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    $('contract-page').innerHTML = `${p.banner ? opBannerHtml(p.banner) : ''}<h2>${p.title}</h2><p class="what">${p.job}</p><div class="money"><b>${p.pay.big}</b><span>${p.pay.unit}</span><p>${p.pay.sub}</p>${p.pay.full ? `<p>${p.pay.full}</p>` : ''}</div><div class="terms">${rows(p.terms)}</div>${p.perks ? `<div class="terms perks"><h4>While you are on it${p.perkNote ? ` <small>(${p.perkNote.toLowerCase()})</small>` : ''}</h4>${rows(p.perks)}</div>` : ''}<div class="terms risk">${rows(p.risks)}</div>`;
    $('dialog').classList.add('with-page');
    document.body.classList.add('reading-contract');
  }

  hideContractPage() {
    $('dialog').classList.remove('with-page');
    document.body.classList.remove('reading-contract');
  }

  contractCard(n, plan) {
    const g = this.g, c = g.layout.camps[n.camp], s = g.campSim.state[n.camp], op = s.op || s.opNext;
    const backTo = () => this.contractsMenu(n);
    if (plan === 'vanguard' && !op) { backTo(); return; }
    $('dlg-jobs').innerHTML = '';
    const now = g.campSim.now(), full = `${SP} ${fmt(OP_PAY.shift * OP_PAY.nights)} to ${SP} ${fmt(OP_PAY.shiftOp * OP_PAY.nights)}`;
    const rate = { big: `${SP} ${OP_PAY.shift}`, unit: 'a shift', sub: `${SP} ${OP_PAY.shiftOp} a shift during an operation`, full: `${full} for the full contract` };
    const collect = ['Collect', 'Here, after the last shift'];
    let page;
    if (plan === 'vanguard') {
      page = {
        title: `Join Operation ${op.name}`,
        job: 'Kill infected near the walls until the operation ends. Meet the quota every day.',
        banner: op.name, pay: { big: `${SP} ${OP_PAY.vanguard}`, unit: 'a kill', sub: 'Paid here when it succeeds', full: '' },
        terms: [['Daily quota', `${fmt(op.quota)} kills`], ['Expected length', `${op.predict || '?'} day${op.predict === 1 ? '' : 's'}`], ['Starts', s.op ? 'Now' : `In about ${g.campSim.opNoticeHours(s)} hours`]],
        perks: [['Doctor', 'One free treatment a day'], ['Traders', 'One free supply package a day'], ['Runs long?', 'Take an early payout, at a cut']],
        perkNote: s.op ? '' : 'From when the operation starts',
        risks: [['Miss a quota', `Pay docked to about ${Math.round(g.jobs.dockRate(c) * 100)}%`], ['Miss three', 'Contract ends, nothing paid']],
      };
    } else if (plan === 'night') {
      page = {
        title: 'Night shift contract',
        job: `Kill infected near the walls every night for ${OP_PAY.nights} nights.`,
        pay: rate,
        terms: [['Nightly quota', `${g.jobs.nightQuota(c)} kills`], ['Hours', `${clockOf(OP_PAY.nightStart)} to ${clockOf((OP_PAY.nightStart + OP_PAY.nightLen + .0001) % 1)}`], ['Starts', 'The next night'], collect],
        perks: [['Doctor', 'One free treatment a day'], ['Traders', 'One free supply package a day']],
        risks: [['Miss a quota', 'Contract ends, nothing paid']],
      };
    } else {
      const start = g.jobs.patrolStartsToday(now);
      page = {
        title: 'Patrol contract',
        job: `Walk to the four marked corners outside the wall once a day, for ${OP_PAY.days} days.`,
        pay: rate,
        terms: [['A day runs', `${clockOf(OP_PAY.patrolStart + .0001)} to ${clockOf(OP_PAY.patrolStart + .0001)}`], ['Starts', start ? 'Today' : `Tomorrow, ${clockOf(OP_PAY.patrolStart + .0001)}`], collect],
        perks: [['Doctor', 'One free treatment a day'], ['Traders', 'One free supply package a day']],
        risks: [['Miss a day', 'Contract ends, nothing paid']],
      };
    }
    this.showContractPage(page);
    this.say('Read it through before you sign. I am not going to read it to you.');
    this.setChoices([{ label: 'Sign it', cls: 'quest', fn: () => {
      if (plan === 'vanguard') { if (!g.jobs.signOperation(c)) { backTo(); return; } }
      else if (plan === 'night') g.jobs.signNight(c);
      else g.jobs.signPatrol(c);
      backTo();
      this.say(plan === 'patrol' ? 'Signed. The corners are marked on your map.' : 'Signed. I will be counting.');
    } }], { label: 'Back', fn: backTo });
  }

  jobCard(n, job) {
    const g = this.g;
    const box = $('dlg-jobs');
    box.innerHTML = '';
    const d = document.createElement('div');
    d.className = 'job';
    d.innerHTML = `<b>${job.title}</b><p>${job.desc}</p><span class="pay">${SP} ${job.reward}${job.bonus ? ` + ${ITEMS[job.bonus].name}` : ''}</span>`;
    box.appendChild(d);
    this.setChoices([{ label: 'I will take it', cls: 'quest', fn: () => { g.jobs.accept(job); this.workMenu(); } }], { label: 'Back', fn: () => this.workMenu() });
  }

  smallTalk() {
    const lines = ['What else?', 'Go on.', 'Sure. What is it?', 'Mm. Anything else on your mind?'];
    return lines[Math.floor(Math.random() * lines.length)];
  }

  // Radio traffic between the camps, heard wherever you are.
  radio(who, text, station = null) {
    const box = $('toasts');
    const d = document.createElement('div');
    d.className = 'radio';
    if (station) d.dataset.station = station;
    const b = document.createElement('b');
    b.textContent = station ? (who && who !== station ? `${station} Radio, ${who}: ` : `${station} Radio: `) : `${who}: `;
    d.appendChild(b);
    d.appendChild(document.createTextNode(text));
    box.appendChild(d);
    while (box.children.length > 7) box.removeChild(box.firstChild);
    setTimeout(() => d.remove(), 9000);
    this.g.audio.simple('beep');
  }

  // Once a settlement is going under, what it was saying on the radio a few seconds ago (man down, fill the gap) is no longer true.
  clearRadio(station) {
    for (const d of [...$('toasts').querySelectorAll('.radio')]) if (d.dataset.station === station) d.remove();
  }

  // Overheard speech hangs above whoever said it, and fades with distance. Only the people
  // you are actually talking to get the panel at the bottom of the screen.
  // Everyone's voice is their own pitch, the same every time, from their name.
  voiceOf(n) {
    if (n.voice === undefined) {
      let h = 0;
      for (const ch of n.name || `${n.kind || 'x'}${Math.round(n.x)}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      n.voice = 150 + (h % 210) + (n.kid ? 140 : 0);
    }
    return n.voice;
  }

  floatSay(n, text, seconds = 3.6) {
    if (!n) return;
    const host = $('overhead');
    const old = this.floaters.find((f) => f.n === n);
    if (old) { old.el.remove(); this.floaters.splice(this.floaters.indexOf(old), 1); }
    while (this.floaters.length >= 10) this.floaters.shift().el.remove();
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    host.appendChild(el);
    // The words are up all at once, but they are said at the speed you would hear them: the same blips as someone talking to you,
    // softer, and from where they are standing.
    // Up at least as long as it takes them to say it.
    this.floaters.push({ n, el, t: Math.max(seconds + text.length * .025, text.length * .042 + 1), los: 0, seen: true, text, said: n === this.dlgNpc ? text.length : 0, sayT: 0 });
  }

  updateFloaters(dt) {
    const g = this.g, vp = g.renderer.viewProj, P = g.player;
    const busy = this.floatVis > 4 ? Math.max(.38, 4 / this.floatVis) : 1;
    let vis = 0;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i], n = f.n;
      f.t -= dt;
      if (f.t <= 0 || n.dead) { f.el.remove(); this.floaters.splice(i, 1); continue; }
      if (f.said < f.text.length && (f.sayT -= dt) <= 0) {
        const near = Math.hypot(n.x - P.x, n.z - P.z) < 24;
        while (f.said < f.text.length && f.sayT <= 0) {
          const ch = f.text[f.said++];
          // Slower than someone talking to you: muttered, half to themselves, a beat at the end of each sentence.
          f.sayT += ch === '.' || ch === '?' || ch === '!' ? .25 : .036;
          if (near && f.said % 2 === 0 && /[A-Za-z0-9]/.test(ch)) g.audio.voiceAt(this.voiceOf(n), n.x, n.y + 2.4, n.z);
        }
      }
      const y = n.y + (n.kid ? 2.5 : 3.4) + (n.state === 5 ? -.7 : 0), x = n.x, z = n.z;
      const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      const dist = Math.hypot(x - P.x, y - P.y, z - P.z);
      f.los -= dt;
      if (f.los <= 0) { f.los = .35; f.seen = g.world.los(P.x, P.y + 2.4, P.z, x, y - .4, z); }
      if (w <= 0 || !f.seen || dist > 34) { f.el.style.display = 'none'; continue; }
      const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w, ny = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
      if (Math.abs(nx) > 1.05 || Math.abs(ny) > 1.05) { f.el.style.display = 'none'; continue; }
      f.el.style.display = 'block';
      f.el.style.left = `${(nx * .5 + .5) * 100}%`;
      f.el.style.top = `${(.5 - ny * .5) * 100}%`;
      vis++;
      f.el.style.opacity = Math.min(1, f.t * 2.5) * Math.min(1, (36 - dist) / 14) * (dist < 6 ? 1 : busy);
      f.el.style.fontSize = `${Math.round(Math.max(12, 17 - dist * .16))}px`;
    }
    this.floatVis = vis;
  }

  // A small mark over the people who matter, once you are close enough to care: who runs the place, who can patch you up,
  // who is selling, and who has something for you to do. It is meant to be easy to miss from across the plaza.
  updateNpcMarks(dt) {
    const g = this.g, P = g.player, vp = g.renderer.viewProj, host = $('overhead');
    if (!this.marks) {
      this.marks = Array.from({ length: 16 }, () => {
        const el = document.createElement('div');
        el.className = 'npc-mark';
        host.appendChild(el);
        return { el, n: null };
      });
      this.markT = 0;
      this.marked = [];
    }
    this.markT -= dt;
    if (this.markT <= 0 && !this.modal) {
      this.markT = .4;
      const near = [];
      for (const n of g.npcs.list) {
        if (n.dead || n.flee || (n.kind !== 'boss' && n.kind !== 'clerk' && n.kind !== 'vendor' && n.kind !== 'named' && !n.role)) continue;
        const d = Math.hypot(n.x - P.x, n.z - P.z);
        if (d < 42) near.push([d, n]);
      }
      near.sort((a, b) => a[0] - b[0]);
      this.marked = near.slice(0, this.marks.length).filter(([, n]) => g.world.los(P.x, P.y + 2.4, P.z, n.x, n.y + 2.6, n.z)).map(([, n]) => {
        const glyph = n.kind === 'clerk' ? SP : n.kind === 'boss' ? '\u25C6' : n.doctor ? '+' : n.role ? '\u2022' : '\u25C7';
        const work = !!n.part && n.kind !== 'boss' && g.dialogue.topics(n).some((t) => t.job || t.pay);
        return { n, glyph, cls: n.kind === 'clerk' ? 'work' : n.kind === 'boss' ? 'lead' : n.doctor ? 'doc' : work ? 'work' : n.role ? 'sell' : 'named' };
      });
    }
    for (let i = 0; i < this.marks.length; i++) {
      const m = this.marks[i], t = this.modal ? null : this.marked[i];
      const n = t && t.n;
      if (!n || n.dead) { m.el.style.display = 'none'; continue; }
      const x = n.x, y = n.y + (n.state === 5 ? 3 : 3.5), z = n.z;
      const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
      const nx = (vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w, ny = (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w;
      if (w <= 0 || Math.abs(nx) > 1.02 || Math.abs(ny) > 1.02) { m.el.style.display = 'none'; continue; }
      const d = Math.hypot(x - P.x, z - P.z);
      m.el.style.display = 'block';
      m.el.style.left = `${(nx * .5 + .5) * 100}%`;
      m.el.style.top = `${(.5 - ny * .5) * 100}%`;
      m.el.style.opacity = Math.min(.8, (42 - d) / 22) * (d < 5 ? Math.max(.25, d / 5) : 1);
      if (m.n !== t.glyph + t.cls) {
        m.n = t.glyph + t.cls;
        m.el.textContent = t.glyph;
        m.el.className = `npc-mark ${t.cls}`;
      }
    }
  }

  // A line of overheard speech, shown at the bottom of the screen.
  caption(name, text) {
    const el = $('caption');
    el.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = name;
    el.appendChild(b);
    el.appendChild(document.createTextNode(` ${text}`));
    el.style.opacity = 1;
    clearTimeout(this.captionTimer);
    this.captionTimer = setTimeout(() => { el.style.opacity = 0; }, 3400);
  }

  // --- Map -------------------------------------------------------------------------------------------------------
  openMap() {
    this.open('map', false);
    const P = this.g.player;
    const c = $('bigmap');
    const r = c.parentElement.getBoundingClientRect();
    c.width = r.width; c.height = r.height;
    // Opens with the island's full width across the screen, on wherever you are.
    this.mapView.zoom = Math.log2(this.mapFitWidth() / this.mapFitAll());
    this.mapView.x = P.x; this.mapView.z = P.z;
    this.drawBigMap();
    this.renderMapSide();
  }

  // All of the island on screen, the lowest it goes.
  mapFitAll() { const c = $('bigmap'); return Math.min(c.width / WX, c.height / WZ); }

  mapFitWidth() { return $('bigmap').width / WX; }

  mapZoomMax() { return Math.log2(this.mapFitWidth() * 6 / this.mapFitAll()); }

  mapScale() { return this.mapFitAll() * Math.pow(2, this.mapView.zoom); }

  // Never off the edge of the map. Whatever fits on screen sits in the middle.
  clampMapView() {
    const c = $('bigmap'), v = this.mapView, s = this.mapScale();
    const hw = c.width / 2 / s, hh = c.height / 2 / s;
    v.x = hw * 2 >= WX ? WX / 2 : Math.max(hw, Math.min(WX - hw, v.x));
    v.z = hh * 2 >= WZ ? WZ / 2 : Math.max(hh, Math.min(WZ - hh, v.z));
  }

  drawMapRail() {
    const c = $('bigmap'), v = this.mapView, s = this.mapScale(), thumb = $('map-thumb');
    const hh = Math.min(WZ / 2, c.height / 2 / s);
    thumb.style.top = `${(v.z - hh) / WZ * 100}%`;
    thumb.style.height = `${hh * 2 / WZ * 100}%`;
    $('map-you').style.top = `${this.g.player.z / WZ * 100}%`;
  }

  drawBigMap() {
    this.clampMapView();
    this.drawMapRail();
    const g = this.g, c = $('bigmap'), x = c.getContext('2d'), v = this.mapView, s = this.mapScale();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = OCEAN;
    x.fillRect(0, 0, c.width, c.height);
    x.setTransform(s, 0, 0, s, c.width / 2 - v.x * s, c.height / 2 - v.z * s);
    x.imageSmoothingEnabled = s > 1 ? false : true;
    const sur = g.mapSurround;
    if (sur) { x.imageSmoothingEnabled = true; x.drawImage(sur, -sur.span, -sur.span, sur.width * 16, sur.height * 16); x.imageSmoothingEnabled = s > 1 ? false : true; }
    const mg = g.mapMargin;
    if (mg) x.drawImage(mg, mg.x0, mg.z0, mg.width * 2, mg.height * 2);
    x.drawImage(g.mapCanvas, 0, 0, WX, WZ);
    x.setTransform(1, 0, 0, 1, 0, 0);
    const P = g.player;
    const tx = (px) => c.width / 2 + (px - v.x) * s, tz = (pz) => c.height / 2 + (pz - v.z) * s;
    // The chunk grid: every chunk close in, every second, fourth and so on further out, so the lines never crowd.
    {
      let step = CS;
      while (step * s < 9) step *= 2;
      // Out over the country past the edges as well, so the squares carry on across all of it.
      const x0 = Math.floor((v.x - c.width / 2 / s) / step) * step, x1 = v.x + c.width / 2 / s;
      const z0 = Math.floor((v.z - c.height / 2 / s) / step) * step, z1 = v.z + c.height / 2 / s;
      const top = 0, bot = c.height, lef = 0, rig = c.width;
      x.lineWidth = 1;
      for (let gx = x0; gx <= x1; gx += step) { x.strokeStyle = gx % (step * 8) === 0 ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.06)'; const p = Math.round(tx(gx)) + .5; x.beginPath(); x.moveTo(p, top); x.lineTo(p, bot); x.stroke(); }
      for (let gz = z0; gz <= z1; gz += step) { x.strokeStyle = gz % (step * 8) === 0 ? 'rgba(255,255,255,.13)' : 'rgba(255,255,255,.06)'; const p = Math.round(tz(gz)) + .5; x.beginPath(); x.moveTo(lef, p); x.lineTo(rig, p); x.stroke(); }
    }
    this.drawGates(x, tx, tz, s);
    x.textBaseline = 'middle';
    // Camps and jobs get first claim on the space. The city's own names only go where that leaves room.
    const labels = this.layoutMapLabels(x, c, tx, tz);
    const taken = (ax, ay, w, h) => labels.boxes.some((b) => ax < b.x + b.w && ax + w > b.x && ay < b.y + b.h && ay + h > b.y);
    // Street numbers, neighbourhoods at any zoom, landmarks as you look closer. Drawn once the crowd is down, so no name ends up underneath it.
    const towns = [];
    const drawCity = () => {
    x.textBaseline = 'middle';
    x.font = '12px Quantico, Bahnschrift, Segoe UI, sans-serif';
    for (const r of g.layout.rows) {
      if (!r.major) continue;
      x.fillStyle = 'rgba(233,228,216,.45)';
      x.fillText(`${r.num}`, tx(g.layout.aves[6].x) + 3, tz(r.z));
    }
    x.textAlign = 'center';
    x.lineJoin = 'round';
    x.lineWidth = 3;
    x.strokeStyle = 'rgba(8,10,12,.7)';
    for (const p of g.layout.places) {
      // Every name at every zoom, where there is room for it.
      const px = tx(p.x), pz = tz(p.z);
      if (px < -60 || pz < -20 || px > c.width + 60 || pz > c.height + 20) continue;
      // The five towns, big enough to read from across the map.
      // The five towns, big enough to read from across the map, and written over everything else: kept for the very end.
      if (p.kind === 'town') {
        x.font = `700 ${Math.round(Math.max(18, Math.min(30, 20 * Math.sqrt(s * 2.2))))}px Quantico, Bahnschrift, Segoe UI, sans-serif`;
        const name = p.name.toUpperCase(), w = x.measureText(name).width;
        labels.boxes.push({ x: px - w / 2 - 4, y: pz - 14, w: w + 8, h: 28 });
        towns.push([name, px, pz, x.font]);
        continue;
      }
      if (p.kind === 'area') {
        x.font = '600 10px Quantico, Bahnschrift, Segoe UI, sans-serif';
        const name = p.name.toUpperCase(), w = x.measureText(name).width;
        if (taken(px - w / 2, pz - 6, w, 12)) continue;
        labels.boxes.push({ x: px - w / 2 - 3, y: pz - 6, w: w + 6, h: 12 });
        x.fillStyle = 'rgba(233,228,216,.58)';
        x.strokeText(name, px, pz);
        x.fillText(name, px, pz);
        continue;
      }
      if (taken(px - 5, pz - 5, 10, 10)) continue;
      x.fillStyle = p.kind === 'park' ? '#9fd08a' : p.kind === 'bridge' ? '#b8c6d0' : '#e9e4d8';
      x.save();
      x.translate(px, pz);
      x.rotate(.785);
      x.fillRect(-3, -3, 6, 6);
      x.restore();
      x.font = '11px Quantico, Bahnschrift, Segoe UI, sans-serif';
      const w = x.measureText(p.name).width;
      if (taken(px - w / 2, pz - 18, w, 14)) continue;
      labels.boxes.push({ x: px - w / 2 - 3, y: pz - 18, w: w + 6, h: 14 });
      x.strokeText(p.name, px, pz - 11);
      x.fillText(p.name, px, pz - 11);
    }
    x.textAlign = 'left';
    };
    // Horde density as a soft red wash. (Off for now, along with the infected themselves: the map shows the country, not the dead.)
    const H = g.horde;
    x.fillStyle = 'rgba(230,60,40,.04)';
    if (SHOW_INFECTED_ON_MAP) for (let cz = 0; cz < H.popD; cz++) for (let cx = 0; cx < H.popW; cx++) {
      const p = H.pop[cx + cz * H.popW];
      if (p < 20) continue;
      x.globalAlpha = Math.min(.2, p / 1500);
      x.fillStyle = '#d6402c';
      x.fillRect(tx(cx * 64), tz(cz * 64), 64 * s, 64 * s);
    }
    x.globalAlpha = 1;
    // The same marks as the minimap: everyone you can actually know about around you.
    const dot = Math.max(2, Math.min(5, s * 2.4));
    const seen = (wx, wz) => { const a = tx(wx), b = tz(wz); return a > -6 && b > -6 && a < c.width + 6 && b < c.height + 6; };
    const step = Math.max(1, Math.floor(H.n / 5000));
    if (SHOW_INFECTED_ON_MAP) for (let i = 0; i < H.n; i += step) {
      if (!seen(H.px[i], H.pz[i])) continue;
      // The idle crowd stays quiet, or it would bury the streets. What is hunting you stands out.
      const size = H.state[i] ? dot : Math.max(1.2, dot * .55);
      x.fillStyle = H.state[i] ? 'rgba(235,70,50,.95)' : 'rgba(190,110,90,.38)';
      x.fillRect(tx(H.px[i]) - size / 2, tz(H.pz[i]) - size / 2, size, size);
    }
    for (const n of g.npcs.list) {
      if (n.dead || !seen(n.x, n.z)) continue;
      if (n.kind === 'raider' && !n.aggro && Math.hypot(n.x - P.x, n.z - P.z) > 45) continue;
      x.fillStyle = n.kind === 'raider' ? '#f0963c' : n.kind === 'wanderer' ? '#d8d2a0' : '#8fd27a';
      // People shrink with the map: a speck each when the whole island is on screen, a proper marker close in. Raiders stay a little
      // bigger, so trouble still shows.
      const d = n.kind === 'raider' ? Math.max(2.2, Math.min(6, s * 2.6)) : Math.max(1.1, Math.min(6, s * 2.4));
      x.fillRect(tx(n.x) - d / 2, tz(n.z) - d / 2, d, d);
    }
    x.globalAlpha = 1;
    drawCity();
    const ax = tx(P.x), az = tz(P.z);
    x.save();
    x.translate(ax, az);
    x.rotate(P.yaw);
    x.fillStyle = '#fff';
    x.beginPath(); x.moveTo(0, -11); x.lineTo(7, 8); x.lineTo(0, 4); x.lineTo(-7, 8); x.closePath(); x.fill();
    x.restore();
    // The whole round, so you can see where it goes: done, and still to do.
    for (const j of g.jobs.active) {
      if (j.type !== 'patrol' || j.status !== 'active') continue;
      j.posts.forEach((q, k) => {
        const done = j.walked || k < j.next;
        x.fillStyle = done ? 'rgba(127,176,105,.9)' : '#6ec6ff';
        x.fillRect(tx(q.x) - 3.5, tz(q.z) - 3.5, 7, 7);
        x.strokeStyle = 'rgba(0,0,0,.8)';
        x.lineWidth = 1;
        x.strokeRect(tx(q.x) - 3.5, tz(q.z) - 3.5, 7, 7);
      });
    }
    // Close enough in, a camp you know shows you who to go and see: where to buy a gun, where to get patched up, and who has work.
    const sc = this.mapScale();
    if (sc >= 1.1) {
      const pins = [];
      const pin = (px, pz, mark, col, label) => {
        const ax2 = tx(px), az2 = tz(pz);
        if (ax2 < -20 || az2 < -20 || ax2 > c.width + 20 || az2 > c.height + 20) return;
        pins.push({ ax2, az2, mark, col, label });
      };
      const drawPin = ({ ax2, az2, mark, col }) => {
        x.beginPath(); x.arc(ax2, az2, 8, 0, 6.2832);
        x.fillStyle = 'rgba(12,12,12,.85)'; x.fill();
        x.lineWidth = 1.5; x.strokeStyle = col; x.stroke();
        x.fillStyle = col; x.font = '700 11px Quantico, Bahnschrift, Segoe UI, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(mark, ax2, az2 + .5);
      };
      for (const c2 of g.layout.camps) {
        if (!P.discovered[c2.id] || g.campSim.state[c2.id].status !== 'holding') continue;
        // The ones there is only one of get their names first.
        if (c2.clerk) pin(c2.clerk.x, c2.clerk.z, '!', '#6ec6ff', 'Town Hall');
        for (const v of c2.vendors) if (v.doctor) pin(v.x, v.z, '+', '#ff8a7a', 'Doctor');
        for (const v of c2.vendors) if (v.role === 'arms') pin(v.x, v.z, 'W', '#f0b35a', 'Weapons');
        for (const v of c2.vendors) if (v.role === 'mechanic') pin(v.x, v.z, 'M', '#c9d27a', 'Mechanic');
        // A leader with a favour still to ask of you.
        const lead = LORE[c2.key].cast.find((m) => m.role === 'leader');
        if (lead && lead.favours && !g.campSim.dead[lead.id] && Object.keys(lead.favours).some((k) => !P.dlg.flags[`${k}_paid`])) pin(c2.boss.x + .5, c2.boss.z + .5, '!', '#6ec6ff', lead.name);
      }
      for (const b of g.bikes.list) if (b.owned) pin(b.x, b.z, 'B', '#9fd4ff', 'Your motorbike');
      for (const q of pins) drawPin(q);
      // Then the names, on top of the pins, and only where one fits without covering another pin or name. The pin is there either way.
      if (sc >= 2) {
        x.font = '600 11px Quantico, Bahnschrift, Segoe UI, sans-serif'; x.textAlign = 'left';
        const taken = [];
        for (const q of pins) {
          const w = x.measureText(q.label).width, a0 = q.ax2 + 11, a1 = a0 + w;
          const clash = pins.some((o) => o !== q && o.ax2 + 8 > a0 && o.ax2 - 8 < a1 && Math.abs(o.az2 - q.az2) < 13) || taken.some((t) => t[0] < a1 && t[1] > a0 && Math.abs(t[2] - q.az2) < 13);
          if (clash) continue;
          taken.push([a0, a1, q.az2]);
          x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,.8)'; x.strokeText(q.label, a0, q.az2 + .5);
          x.fillStyle = '#efe7d2'; x.fillText(q.label, a0, q.az2 + .5);
        }
      }
      x.textBaseline = 'middle';
      x.textAlign = 'left';
    }
    // Last of all, so nothing on the map ever ends up on top of the words.
    this.drawMapLabels(x, labels);
    // And the towns over even those.
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (const [name, px, pz, font] of towns) {
      x.font = font;
      x.lineWidth = 5; x.strokeStyle = 'rgba(8,10,12,.82)';
      x.strokeText(name, px, pz);
      x.fillStyle = '#f3ecd9';
      x.fillText(name, px, pz);
    }
    x.textAlign = 'left';
  }

  // The way in and out of every camp: a bar across the wall where the gate is, and a notch pointing out. Red while it will not open
  // to you: locked down for a horde, or shut to you until your bail is paid. Faded once it is off its hinges.
  // tx, tz turn world into this map's pixels, and s is pixels per block.
  drawGates(x, tx, tz, s, near = 0, P = null) {
    const g = this.g;
    for (const c of g.layout.camps) {
      if (near && Math.hypot(c.cx - P.x, c.cz - P.z) > near) continue;
      const S = g.campSim.state[c.id], st = g.npcs.camps[c.id];
      const lost = S.status === 'overrun' || S.status === 'resettling';
      c.gates.forEach((q, i) => {
        const live = st && st.gates[i], broken = live && live.broken;
        // Locked down for the whole camp, shut on the dead coming through this gate, or shut to you over bail.
        const shut = S.locked || (live && live.shutT > 0) || g.npcs.owesBail(c.id);
        const col = lost || broken ? 'rgba(232,176,74,.45)' : shut ? '#e0503f' : '#f4c35a';
        const ox = q.side === 'W' ? -1 : q.side === 'E' ? 1 : 0, oz = q.side === 'N' ? -1 : q.side === 'S' ? 1 : 0;
        // At least a few pixels thick, however far out the map is zoomed.
        const thick = Math.max(3, s * 2.2) / 2;
        let x0 = tx(q.x0), x1 = tx(q.x1 + 1), z0 = tz(q.z0), z1 = tz(q.z1 + 1);
        if (q.horiz) { const m = (z0 + z1) / 2; z0 = m - thick; z1 = m + thick; if (x1 - x0 < 6) { const c0 = (x0 + x1) / 2; x0 = c0 - 3; x1 = c0 + 3; } }
        else { const m = (x0 + x1) / 2; x0 = m - thick; x1 = m + thick; if (z1 - z0 < 6) { const c0 = (z0 + z1) / 2; z0 = c0 - 3; z1 = c0 + 3; } }
        x.fillStyle = 'rgba(10,10,10,.85)';
        x.fillRect(x0 - 1, z0 - 1, x1 - x0 + 2, z1 - z0 + 2);
        x.fillStyle = col;
        x.fillRect(x0, z0, x1 - x0, z1 - z0);
        // The notch, once there is room for one.
        if (s >= .5) {
          const mx = (x0 + x1) / 2 + ox * (thick + 1), mz = (z0 + z1) / 2 + oz * (thick + 1), w = Math.max(3, s * 2.2), l = Math.max(3, s * 2);
          x.beginPath();
          x.moveTo(mx + ox * l, mz + oz * l);
          x.lineTo(mx + oz * w, mz + ox * w);
          x.lineTo(mx - oz * w, mz - ox * w);
          x.closePath();
          x.fill();
        }
      });
    }
  }

  // Where every camp and job label goes on this view of the map: beside its marker wherever there is room, and clear of all the
  // others. A status always sits on its own line under the name.
  layoutMapLabels(x, c, tx, tz) {
    const g = this.g, P = g.player, items = [];
    const NAME = '600 13px Quantico, Bahnschrift, Segoe UI, sans-serif', STATUS = '11px Quantico, Bahnschrift, Segoe UI, sans-serif', JOB = '12px Quantico, Bahnschrift, Segoe UI, sans-serif';
    for (const c2 of g.layout.camps) {
      const known = P.discovered[c2.id], line = g.campSim.statusLine(c2.id);
      const trouble = known && line !== 'Holding', shut = known && !trouble && !g.npcs.admitted(c2.id);
      const color = line === 'Overrun' && known ? '#d8493b' : trouble && recovering(line) ? '#6aa6c8' : trouble ? '#f08a3c' : known ? '#e8b04a' : 'rgba(232,176,74,.7)';
      const lines = [{ text: c2.name, font: NAME, color: known ? '#f0dfb4' : 'rgba(240,223,180,.8)' }];
      if (!known) lines.push({ text: '(Unknown)', font: STATUS, color: 'rgba(233,228,216,.68)' });
      else if (trouble) lines.push({ text: `(${line})`, font: STATUS, color: line === 'Overrun' ? '#ff8a7a' : recovering(line) ? '#9cc8e0' : '#ffb26b' });
      else if (shut) lines.push({ text: '(Citizens only)', font: STATUS, color: 'rgba(233,228,216,.68)' });
      if (known && g.campSim.state[c2.id].op) lines.push({ text: `Operation ${g.campSim.state[c2.id].op.name}`, font: STATUS, color: '#ffd089' });
      items.push({ x: tx(c2.cx), y: tz(c2.cz), r: 4, color, lines });
    }
    const clip = (text, font, most) => {
      x.font = font;
      if (x.measureText(text).width <= most) return text;
      let t = text;
      while (t.length > 3 && x.measureText(`${t}...`).width > most) t = t.slice(0, -1);
      return `${t.trimEnd()}...`;
    };
    for (const j of g.jobs.active) {
      // An operation you are in already says so under the camp's name. A second marker on the same camp only gets in the way.
      if (j.type === 'defend' || unpointed(j)) continue;
      const it = { x: tx(j.x), y: tz(j.z), r: 5, color: j.status === 'done' ? '#7fb069' : '#6ec6ff', job: true, lines: [{ text: clip(j.type === 'patrol' && j.status === 'active' ? `Patrol: ${j.posts[j.next].name}` : j.fullPay > j.reward ? j.title.replace('Collect pay:', 'Docked pay:') : j.title, JOB, 260), font: JOB, color: j.status === 'done' ? '#b6dca4' : '#a9defc' }] };
      // Two markers on the same spot would hide one of them: step this one aside, just enough to see both.
      for (let k = 0; k < 8 && items.some((o) => Math.abs(o.x - it.x) < 11 && Math.abs(o.y - it.y) < 11); k++) it.y += 12;
      items.push(it);
    }
    const seen = items.filter((it) => it.x > -40 && it.y > -40 && it.x < c.width + 40 && it.y < c.height + 40);
    const boxes = seen.map((it) => ({ x: it.x - it.r - 1, y: it.y - it.r - 1, w: it.r * 2 + 2, h: it.r * 2 + 2 }));
    const hits = (b) => boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
    for (const it of seen) {
      let w = 0, h = 0;
      for (const l of it.lines) { x.font = l.font; w = Math.max(w, x.measureText(l.text).width); h += l.font === NAME ? 15 : 13; }
      w += 4; h += 2;
      const cand = [[it.x + it.r + 5, it.y - h / 2], [it.x - it.r - 5 - w, it.y - h / 2], [it.x - w / 2, it.y - it.r - 4 - h], [it.x - w / 2, it.y + it.r + 4]];
      for (let k = 1; k <= 8; k++) for (const dir of [1, -1]) {
        const y = it.y - h / 2 + dir * k * (h + 3);
        cand.push([it.x + it.r + 5, y], [it.x - it.r - 5 - w, y]);
      }
      const on = (a) => a[0] >= 3 && a[1] >= 3 && a[0] + w <= c.width - 3 && a[1] + h <= c.height - 3;
      const pick = cand.find((a) => on(a) && !hits({ x: a[0], y: a[1], w, h })) || cand.find(on) || cand[0];
      it.bx = pick[0]; it.by = pick[1]; it.bw = w; it.bh = h;
      boxes.push({ x: pick[0], y: pick[1], w, h });
    }
    return { items, seen, boxes };
  }

  drawMapLabels(x, labels) {
    x.textAlign = 'left';
    x.textBaseline = 'top';
    x.lineJoin = 'round';
    for (const it of labels.seen) {
      // Moved a long way from its marker: a thin line back, so there is no doubt whose it is.
      const near = Math.abs(it.by + it.bh / 2 - it.y) <= it.bh * .75 + it.r + 6;
      if (!near) {
        x.strokeStyle = it.color;
        x.lineWidth = 1;
        x.globalAlpha = .7;
        x.beginPath();
        x.moveTo(it.x, it.y);
        x.lineTo(it.bx < it.x ? it.bx + it.bw : it.bx, it.by + it.bh / 2);
        x.stroke();
        x.globalAlpha = 1;
      }
      x.fillStyle = 'rgba(8,10,12,.9)';
      x.fillRect(it.x - it.r - 1.5, it.y - it.r - 1.5, it.r * 2 + 3, it.r * 2 + 3);
      x.fillStyle = it.color;
      x.fillRect(it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
      let y = it.by + 1;
      for (const l of it.lines) {
        x.font = l.font;
        x.lineWidth = 3.5;
        x.strokeStyle = 'rgba(8,10,12,.92)';
        x.strokeText(l.text, it.bx + 2, y);
        x.fillStyle = l.color;
        x.fillText(l.text, it.bx + 2, y);
        y += l.font.startsWith('600') ? 15 : 13;
      }
    }
    x.textBaseline = 'middle';
  }

  renderMapSide() {
    const g = this.g, P = g.player;
    const box = $('map-side');
    const total = g.horde.totalPopulation();
    const home = P.home >= 0 ? g.layout.camps[P.home].name : 'Nowhere';
    let html = `<div class="list-title">City</div><div class="stats"><b>${fmt(total)}</b> infected<br><b>${fmt(g.horde.n)}</b> around you<br><b>${OUTBREAK_DAYS + g.day}</b> days since the outbreak<br>${clockOf(g.tod)}<br>Home: <b>${home}</b></div>`;
    const ops = g.layout.camps.filter((c) => P.discovered[c.id] && g.campSim.state[c.id].op);
    if (ops.length) {
      html += '<div class="list-title">Events</div>';
      for (const c of ops) {
        const op = g.campSim.state[c.id].op;
        html += `<div style="font-size:13px;display:flex;justify-content:space-between;gap:8px"><span style="color:var(--ink)">Operation ${op.name}<br><span style="color:var(--dim)">${c.name}</span></span><span style="color:var(--amber);white-space:nowrap">${g.campSim.opDayHtml(op)}</span></div>`;
      }
    }
    html += '<div class="list-title">Commissions</div>';
    const listed = g.jobs.active.filter((j) => j.plan !== 'commission');
    if (!listed.length) html += '<div style="color:var(--dim);font-size:13px">None. Every Town Hall has a board.</div>';
    for (const j of listed) {
      html += `<div class="job"><b>${j.title}</b><p>${j.desc}</p><span class="pay">${this.jobLine(j)}</span><button class="abandon" data-abandon="${j.id}">Abandon</button></div>`;
    }
    const last = g.campSim.lastReport;
    if (last) {
      html += `<div class="list-title">${last.op ? 'Latest operation report' : 'Latest report'}</div><div class="job"><b>${last.title}</b><p>${last.camp ? `${last.camp}<br>` : ''}${last.sub ? `${last.sub}<br>` : ''}${last.rows.map(([k, v]) => `${k}: ${v}`).join('<br>')}</p></div>`;
    }
    html += '<div class="list-title">Key</div><div class="map-key"><i style="background:#fff"></i><span>You</span><i style="background:#8fd27a"></i><span>Friendly</span><i style="background:#d8d2a0"></i><span>Wanderers</span><i style="background:#f0963c"></i><span>Raiders</span><i style="background:#6ec6ff"></i><span>Commission</span><i style="background:none;color:#6ec6ff;font-style:normal;text-align:center;line-height:10px">!</i><span>Work, zoomed in</span><i style="background:none;color:#f0b35a;font-style:normal;text-align:center;line-height:10px">W</i><span>Weapons, zoomed in</span><i style="background:none;color:#ff8a7a;font-style:normal;text-align:center;line-height:10px">+</i><span>Doctor, zoomed in</span></div>';
    html += '<div class="list-title">Settlements</div>';
    for (const c of g.layout.camps) {
      const known = P.discovered[c.id];
      html += `<div style="color:${known ? 'var(--ink)' : 'var(--faint)'};font-size:13px;display:flex;justify-content:space-between;gap:8px"><span>${c.name}</span>${known ? `<span style="color:${g.campSim.statusLine(c.id) === 'Holding' ? 'var(--dim)' : recovering(g.campSim.statusLine(c.id)) ? 'var(--blue)' : 'var(--red)'}">${g.campSim.statusLine(c.id) === 'Holding' ? standingName(g.dialogue.standing(c.id)) : g.campSim.statusLine(c.id)}</span>` : ''}</div>`;
    }
    box.innerHTML = html;
    // First click asks. Second click means it.
    box.querySelectorAll('[data-abandon]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.sure) {
        const j = g.jobs.active.find((a) => a.id === +b.dataset.abandon);
        if (j) g.jobs.abandon(j);
        this.renderMapSide();
        return;
      }
      b.dataset.sure = '1';
      b.textContent = 'Really abandon?';
    }));
  }
}
