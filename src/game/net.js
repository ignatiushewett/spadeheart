// How co-op players reach each other. Two ways, behind one shape:
//  - Steam (the desktop app): a lobby to find each other and carry invites, then packets peer to peer through Steam's relays.
//  - Local (any browser): every copy of the game open on this computer, at the same address, talking over a BroadcastChannel. For
//    trying co-op out, or working on it, without two Steam accounts.
// Either way the game only sees: a lobby list, hosting, joining, leaving, the members, and send(to, bytes, reliable) / onPacket.

export class SteamNet {
  constructor(info) {
    this.kind = 'steam';
    this.label = 'Steam';
    this.selfId = info.id;
    this.selfName = info.name;
    this.lobby = null;
    this.onPacket = null;      // (fromId, Uint8Array)
    this.onLobby = null;       // (lobby) whenever who is in it changes
    this.onInvite = null;      // (lobbyId) accepted from the friends list or an invite
    this.off = window.steam.on((type, p) => {
      if (type === 'packet') { if (this.onPacket) this.onPacket(p.from, p.data); }
      else if (type === 'lobby') { this.lobby = p; if (this.onLobby) this.onLobby(p); }
      else if (type === 'invite') { if (this.onInvite) this.onInvite(p.lobby); }
    });
  }

  static async open() {
    if (!window.steam) return null;
    const info = await window.steam.info().catch(() => null);
    return info && info.available ? new SteamNet(info) : null;
  }

  get canInvite() { return true; }
  async host(visibility, data) {
    this.lobby = await window.steam.host(visibility, 4);
    if (data) await window.steam.setData(data);
    this.lobby = await window.steam.members();
    return this.lobby;
  }
  async setData(data) { await window.steam.setData(data); }
  async list() {
    const all = (await window.steam.lobbies()) || [];
    return all.map((l) => ({ id: l.id, name: l.data.name || 'Someone', n: l.n, max: l.max, v: l.data.v || '', open: l.data.open !== '0' }));
  }
  async join(id) { this.lobby = await window.steam.join(id); return this.lobby; }
  async leave() { this.lobby = null; await window.steam.leave(); }
  invite() { window.steam.invite(); }
  hostId() { return this.lobby ? this.lobby.owner : null; }
  send(to, bytes, reliable) { window.steam.send(to, bytes, reliable); }
}

// Online in any browser: WebRTC, peer to peer. PeerJS's free public server introduces the two browsers (it sees the room code and
// connection details, nothing of the game), and Google's public STUN servers help them find a way through each other's routers. The host
// is "spadeheart-<code>" there; guests connect to it with the code. Everything then goes straight between the players.
// Where they cannot reach each other directly (a strict router, a phone hotspot, a school or work network), they both connect to
// Spadeheart's relay server instead, and it passes the messages between them (relay/ in this repository).
const PEERJS = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/+esm';
const ROOM_PREFIX = 'spadeheart-coop-';
// STUN finds a way through each router for a direct connection.
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
// The relay: Spadeheart's own, on Render. (For testing, localStorage spadeheart.relay points elsewhere, and spadeheart.forceRelay = 1
// skips the direct connection.)
const RELAY_URL = 'wss://spadeheart-relay.onrender.com';
const stored = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const relayUrl = () => stored('spadeheart.relay') || RELAY_URL;
const RELAY_WAIT = 75000;   // the free server sleeps when nobody has played for a while, and takes up to a minute to wake
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CTRL = 0, FRAG = 240, FRAG_SIZE = 48000;
const txt = new TextEncoder(), untxt = new TextDecoder();

export class WebNet {
  constructor(Peer, name) {
    this.Peer = Peer;
    this.kind = 'web';
    this.label = 'Online';
    this.selfId = null;
    this.selfName = name;
    this.lobby = null;
    this.onPacket = null;
    this.onLobby = null;
    this.onInvite = null;
    this.conns = new Map();   // peer id -> { r, u } data connections
    this.frags = new Map();
    this.fragId = 1;
  }

  static async open(name) {
    try {
      const m = await import(PEERJS);
      return new WebNet(m.Peer || m.default, name);
    } catch (e) { console.warn('co-op: could not load PeerJS, so no online play', e); return null; }
  }

  get canInvite() { return false; }
  get usesCodes() { return true; }

  // A peer on the introducing server, under the given name (or one it makes up).
  openPeer(id) {
    return new Promise((resolve, reject) => {
      const opts = { debug: 0, config: { iceServers: ICE } };
      const peer = id ? new this.Peer(id, opts) : new this.Peer(opts);
      const fail = (e) => { peer.destroy(); reject(new Error(e && e.type === 'unavailable-id' ? 'That room code is taken.' : e && e.type === 'peer-unavailable' ? 'No game with that code.' : (e && e.message) || 'Could not reach the server.')); };
      peer.once('open', (pid) => { peer.off('error', fail); resolve(peer); void pid; });
      peer.once('error', fail);
    });
  }

  watch(peer) {
    this.peer = peer;
    this.selfId = peer.id;
    peer.on('connection', (c) => this.adopt(c));
    peer.on('error', (e) => console.warn('co-op: peer error', e && e.type));
    peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
    // A browser can drop a page's link to the introducing server (a tab left in the background, a laptop lid, a network blip), and then
    // nobody can find the room. It keeps trying to get it back, and the lobby says whether the room is open.
    clearInterval(this.keep);
    this.keep = setInterval(() => {
      if (this.peer !== peer || peer.destroyed) { clearInterval(this.keep); return; }
      if (peer.disconnected) { try { peer.reconnect(); } catch { /* tried again next time */ } }
    }, 3000);
  }

  // The room can be found by others: this page is registered with the introducing server.
  get roomOpen() { return !!(this.peer && this.peer.open && !this.peer.disconnected && !this.peer.destroyed) || !!this.relayOpen; }

  // --- The relay ----------------------------------------------------------------------------------------------------------------------
  relayConnect(code, role) {
    return new Promise((resolve, reject) => {
      let ws, done = false;
      const finish = (fn, v) => { if (!done) { done = true; clearTimeout(timer); fn(v); } };
      try { ws = new WebSocket(`${relayUrl()}/?room=${encodeURIComponent(code)}&id=${encodeURIComponent(this.selfId)}&role=${role}`); } catch (e) { reject(e); return; }
      ws.binaryType = 'arraybuffer';
      const timer = setTimeout(() => { finish(reject, new Error('The relay server did not answer.')); try { ws.close(); } catch { /* gone */ } }, RELAY_WAIT);
      ws.onmessage = (e) => {
        if (typeof e.data === 'string') {
          let m;
          try { m = JSON.parse(e.data); } catch { return; }
          if (m.k === 'ready') {
            // A word every 45 seconds, so the free server never takes a quiet lobby for nobody being there and goes to sleep.
            const ka = setInterval(() => { if (ws.readyState === 1) ws.send('ka'); else clearInterval(ka); }, 45000);
            finish(resolve, ws);
          }
          else if (m.k === 'error') { const err = new Error(m.why); err.why = m.why; finish(reject, err); }
          else if (m.k === 'gone') { const s = this.conns.get(m.id); if (s && s.relay) this.drop(m.id); }
          return;
        }
        const b = new Uint8Array(e.data), n = b[0], from = untxt.decode(b.subarray(1, 1 + n));
        // Whoever talks through the relay is answered through it, even if a direct connection to them was half made.
        const s = this.conns.get(from) || {};
        s.relay = true;
        this.conns.set(from, s);
        this.receive(from, b.subarray(1 + n));
      };
      ws.onclose = () => {
        finish(reject, new Error('The relay server closed the connection.'));
        if (this.relay !== ws) return;
        this.relay = null;
        this.relayOpen = false;
        // Everyone reached through it is gone with it.
        for (const [id, s] of [...this.conns]) if (s.relay) this.drop(id);
        if (this.relayCode) setTimeout(() => this.hostRelay(this.relayCode), 5000);
      };
      ws.onerror = () => {};
    });
  }

  relaySend(to, b) {
    const ws = this.relay;
    if (!ws || ws.readyState !== 1) return;
    const id = txt.encode(to), out = new Uint8Array(1 + id.length + b.length);
    out[0] = id.length; out.set(id, 1); out.set(b, 1 + id.length);
    ws.send(out);
  }

  // A host keeps its room open on the relay too, for anyone who cannot reach it directly, and gets it back if it drops.
  async hostRelay(code) {
    if (this.relayCode !== code || this.relay) return;
    try {
      const ws = await this.relayConnect(code, 'host');
      if (this.relayCode !== code) { ws.close(); return; }
      this.relay = ws;
      this.relayOpen = true;
    } catch (e) {
      if (this.relayCode === code && !this.relay) setTimeout(() => this.hostRelay(code), 10000);
    }
  }

  adopt(c) {
    const id = c.peer, slot = this.conns.get(id) || {};
    slot[c.label === 'u' ? 'u' : 'r'] = c;
    this.conns.set(id, slot);
    c.on('data', (d) => this.receive(id, d));
    c.on('close', () => this.lost(id, c));
    c.on('error', () => this.lost(id, c));
  }

  lost(id, c) {
    const slot = this.conns.get(id);
    if (!slot || (slot.r !== c && slot.u !== c)) return;
    // Still reached through the relay: only the direct connection is gone.
    if (slot.relay) { if (slot.r === c) slot.r = null; if (slot.u === c) slot.u = null; return; }
    this.drop(id);
  }

  drop(id) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    if (!this.lobby) return;
    if (this.lobby.owner === this.selfId) {
      this.lobby.members = this.lobby.members.filter((q) => q !== id);
      this.shareLobby();
    } else if (id === this.lobby.owner) {
      this.lobby = { ...this.lobby, members: [] };
      if (this.onLobby) this.onLobby(this.lobby);
    }
  }

  receive(from, data) {
    const b = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (!b.length) return;
    if (b[0] === FRAG) { this.fragment(from, b); return; }
    if (b[0] !== CTRL) { if (this.onPacket) this.onPacket(from, b); return; }
    let m;
    try { m = JSON.parse(untxt.decode(b.subarray(1))); } catch { return; }
    const L = this.lobby, hosting = L && L.owner === this.selfId;
    if (m.k === 'enter' && hosting) {
      if (!L.members.includes(from) && L.members.length < 4) L.members.push(from);
      this.shareLobby();
    } else if (m.k === 'lobby' && L && from === L.owner) {
      this.lobby = m.lobby.members.includes(this.selfId) ? m.lobby : { ...m.lobby, members: [] };
      if (this.onLobby) this.onLobby(this.lobby);
    }
  }

  // Big messages (the world as it stands, for someone joining) go in pieces: a channel only takes so much at once.
  fragment(from, b) {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength), id = v.getUint32(1, true), k = v.getUint16(5, true), n = v.getUint16(7, true);
    const key = `${from}:${id}`;
    let f = this.frags.get(key);
    if (!f) { f = { parts: new Array(n), got: 0 }; this.frags.set(key, f); }
    if (!f.parts[k]) { f.parts[k] = b.slice(9); f.got++; }
    if (f.got < n) return;
    this.frags.delete(key);
    const size = f.parts.reduce((s, p) => s + p.length, 0), out = new Uint8Array(size);
    let o = 0;
    for (const p of f.parts) { out.set(p, o); o += p.length; }
    if (this.onPacket) this.onPacket(from, out);
  }

  ctrl(to, m) {
    const body = txt.encode(JSON.stringify(m)), b = new Uint8Array(body.length + 1);
    b[0] = CTRL; b.set(body, 1);
    this.raw(to, b, true);
  }

  raw(to, b, reliable) {
    const slot = this.conns.get(to);
    if (slot && slot.relay) { this.relaySend(to, b); return; }
    const c = slot && (!reliable && slot.u && slot.u.open ? slot.u : slot.r);
    if (!c || !c.open) return;
    try { c.send(b); } catch (e) { console.warn('co-op: send failed', e && e.message); }
  }

  shareLobby() {
    for (const id of this.lobby.members) if (id !== this.selfId) this.ctrl(id, { k: 'lobby', lobby: this.lobby });
    if (this.onLobby) this.onLobby(this.lobby);
  }

  async host(visibility, data) {
    await this.leave();
    let peer = null, code = '', err = null;
    for (let t = 0; t < 4 && !peer; t++) {
      code = Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
      try { peer = await this.openPeer(ROOM_PREFIX + code); } catch (e) { err = e; }
    }
    if (!peer) throw err || new Error('Could not open a room.');
    this.watch(peer);
    this.code = code;
    this.lobby = { id: code, code, owner: this.selfId, members: [this.selfId], data: { name: this.selfName, ...(data || {}) } };
    this.relayCode = code;
    this.hostRelay(code);
    return this.lobby;
  }

  async setData(data) { if (this.lobby && this.lobby.owner === this.selfId) { Object.assign(this.lobby.data, data); this.shareLobby(); } }
  async list() { return []; }

  async join(code) {
    await this.leave();
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) throw new Error('Type the room code you were given.');
    let peer = null;
    try { peer = await this.openPeer(null); this.watch(peer); } catch { /* the introducing server is out of reach: the relay may still do */ }
    if (!peer) this.selfId = `relay-${Math.random().toString(36).slice(2, 12)}`;
    const hostId = ROOM_PREFIX + code, noGame = `No game with the code ${code} is open. Check the code, and that the host's game is open on their screen.`;
    this.code = code;
    this.lobby = { id: code, code, owner: hostId, members: [], data: {} };
    const open = (label, reliable, wait) => new Promise((resolve, reject) => {
      const c = peer.connect(hostId, { label, reliable, serialization: 'raw' });
      const timer = setTimeout(() => reject(new Error('timeout')), wait);
      c.once('open', () => { clearTimeout(timer); resolve(c); });
      c.once('error', (e) => { clearTimeout(timer); reject(e); });
      peer.once('error', (e) => { clearTimeout(timer); reject(new Error(e && e.type === 'peer-unavailable' ? 'no-room' : 'failed')); });
    });
    // Directly first: quickest, and nothing in between.
    let direct = false;
    if (peer && stored('spadeheart.forceRelay') !== '1') {
      try {
        this.adopt(await open('r', true, 9000));
        direct = true;
        try { this.adopt(await open('u', false, 4000)); } catch { /* everything can go on the first channel */ }
      } catch { direct = false; }
    }
    // Then through the relay.
    if (!direct) {
      try {
        if (this.status) this.status('Connecting through the relay...');
        this.relay = await this.relayConnect(code, 'guest');
        this.conns.set(hostId, { relay: true });
      } catch (e) {
        await this.leave();
        throw new Error(e.why === 'no-room' ? noGame : e.why === 'full' ? 'That game is full.' : 'Could not connect to that game, directly or through the relay.');
      }
    }
    this.ctrl(hostId, { k: 'enter', name: this.selfName });
    for (let t = 0; t < 40 && !this.lobby.members.includes(this.selfId); t++) await new Promise((r) => setTimeout(r, 100));
    if (!this.lobby.members.includes(this.selfId)) { await this.leave(); throw new Error('That game did not let you in. It may be full.'); }
    return this.lobby;
  }

  async leave() {
    const L = this.lobby;
    this.lobby = null;
    if (L && L.owner === this.selfId) for (const id of L.members) if (id !== this.selfId) this.ctrl(id, { k: 'lobby', lobby: { ...L, members: [] } });
    for (const slot of this.conns.values()) { try { if (slot.r) slot.r.close(); if (slot.u) slot.u.close(); } catch { /* already gone */ } }
    this.conns.clear();
    clearInterval(this.keep);
    this.relayCode = null;
    this.relayOpen = false;
    if (this.relay) { const r = this.relay; this.relay = null; try { r.close(); } catch { /* gone */ } }
    if (this.peer) { const p = this.peer; this.peer = null; setTimeout(() => { try { p.destroy(); } catch { /* gone */ } }, 300); }
  }

  invite() {}
  hostId() { return this.lobby ? this.lobby.owner : null; }

  send(to, bytes, reliable) {
    if (!reliable || bytes.length <= FRAG_SIZE) { this.raw(to, bytes, reliable); return; }
    const id = this.fragId++, n = Math.ceil(bytes.length / FRAG_SIZE);
    for (let k = 0; k < n; k++) {
      const part = bytes.subarray(k * FRAG_SIZE, (k + 1) * FRAG_SIZE), b = new Uint8Array(part.length + 9), v = new DataView(b.buffer);
      b[0] = FRAG; v.setUint32(1, id, true); v.setUint16(5, k, true); v.setUint16(7, n, true);
      b.set(part, 9);
      this.raw(to, b, true);
    }
  }
}

// Every open copy of the game in this browser hears every message; each keeps only what is addressed to it.
export class LocalNet {
  constructor(name) {
    this.kind = 'local';
    this.label = 'This computer';
    this.selfId = `L${Math.random().toString(36).slice(2, 10)}`;
    this.selfName = name;
    this.lobby = null;
    this.onPacket = null;
    this.onLobby = null;
    this.onInvite = null;
    this.found = new Map();
    this.ch = new BroadcastChannel('spadeheart-coop');
    this.ch.onmessage = (e) => this.receive(e.data);
  }

  get canInvite() { return false; }

  receive(m) {
    if (!m || m.from === this.selfId) return;
    if (m.k === 'pkt') { if (m.to === this.selfId && this.onPacket) this.onPacket(m.from, m.data); return; }
    if (m.k === 'ping') { if (this.lobby && this.lobby.owner === this.selfId) this.ch.postMessage(this.advert()); return; }
    if (m.k === 'ad') { this.found.set(m.from, { id: m.from, name: m.name, n: m.n, max: 4, v: m.v, open: m.open, seen: performance.now() }); return; }
    // Membership: the host keeps the list and tells everyone in it when it changes.
    if (m.k === 'enter' && this.lobby && this.lobby.owner === this.selfId && m.to === this.selfId) {
      if (!this.lobby.members.includes(m.from) && this.lobby.members.length < 4) this.lobby.members.push(m.from);
      this.shareLobby();
      return;
    }
    if (m.k === 'exit' && this.lobby && this.lobby.owner === this.selfId) {
      this.lobby.members = this.lobby.members.filter((q) => q !== m.from);
      this.shareLobby();
      return;
    }
    if (m.k === 'lobby' && this.lobby && this.lobby.owner === m.from) {
      // Dropped from it (the host left, or let us go): out of the lobby.
      this.lobby = m.lobby.members.includes(this.selfId) ? m.lobby : { ...m.lobby, members: [] };
      if (this.onLobby) this.onLobby(this.lobby);
    }
  }

  advert() { return { k: 'ad', from: this.selfId, name: this.selfName, n: this.lobby.members.length, v: this.lobby.data.v || '', open: this.lobby.data.open !== '0' }; }
  shareLobby() {
    this.ch.postMessage({ k: 'lobby', from: this.selfId, lobby: this.lobby });
    if (this.onLobby) this.onLobby(this.lobby);
  }

  async host(visibility, data) {
    this.lobby = { id: this.selfId, owner: this.selfId, members: [this.selfId], data: { name: this.selfName, ...(data || {}) } };
    return this.lobby;
  }
  async setData(data) { if (this.lobby) { Object.assign(this.lobby.data, data); this.shareLobby(); } }
  async list() {
    this.found.clear();
    this.ch.postMessage({ k: 'ping', from: this.selfId });
    await new Promise((r) => setTimeout(r, 400));
    return [...this.found.values()];
  }
  async join(id) {
    this.lobby = { id, owner: id, members: [], data: {} };
    this.ch.postMessage({ k: 'enter', from: this.selfId, to: id });
    // The host answers with the lobby as it now stands.
    for (let t = 0; t < 20 && !this.lobby.members.includes(this.selfId); t++) await new Promise((r) => setTimeout(r, 100));
    if (!this.lobby.members.includes(this.selfId)) { this.lobby = null; throw new Error('No answer from that game.'); }
    return this.lobby;
  }
  async leave() {
    if (!this.lobby) return;
    if (this.lobby.owner === this.selfId) { this.lobby.members = []; this.shareLobby(); } else this.ch.postMessage({ k: 'exit', from: this.selfId });
    this.lobby = null;
  }
  invite() {}
  hostId() { return this.lobby ? this.lobby.owner : null; }
  send(to, bytes, reliable) { this.ch.postMessage({ k: 'pkt', from: this.selfId, to, data: bytes }); }
}
