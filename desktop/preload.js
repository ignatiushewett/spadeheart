// The one door between the game page and Steam. The page stays sandboxed: it gets these few calls and nothing else of Node or Electron.
// Everything here is for co-op (lobbies, invites and the packets between players); with no Steam, info() says so and the rest do nothing.
const { contextBridge, ipcRenderer } = require('electron');

// The desktop app itself: the game can close it (Quit on the title screen, Exit to desktop when paused).
contextBridge.exposeInMainWorld('desktop', {
  quit: () => ipcRenderer.send('app:quit'),
  config: () => ipcRenderer.invoke('app:config'),
  setVsync: (on) => ipcRenderer.send('app:setVsync', !!on),
});

contextBridge.exposeInMainWorld('steam', {
  info: () => ipcRenderer.invoke('steam:info'),
  host: (visibility, max) => ipcRenderer.invoke('steam:host', visibility, max),
  setData: (data) => ipcRenderer.invoke('steam:setData', data),
  lobbies: () => ipcRenderer.invoke('steam:lobbies'),
  join: (lobbyId) => ipcRenderer.invoke('steam:join', lobbyId),
  leave: () => ipcRenderer.invoke('steam:leave'),
  invite: () => ipcRenderer.invoke('steam:invite'),
  members: () => ipcRenderer.invoke('steam:members'),
  send: (to, data, reliable) => ipcRenderer.send('steam:send', to, data, !!reliable),
  // Lobby changes, invites and packets, as (type, payload).
  on: (fn) => {
    const h = (e, type, payload) => fn(type, payload);
    ipcRenderer.on('steam:event', h);
    return () => ipcRenderer.removeListener('steam:event', h);
  },
});
