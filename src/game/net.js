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
