// Spadeheart's co-op relay. When two browsers cannot connect to each other directly (a strict router, a phone hotspot, a school or
// work network), both connect here instead and this passes their messages between them. It knows nothing about the game: it keeps
// rooms by their code, and forwards each message to the one player it is addressed to.
//
// Run it with `npm install` then `node server.js` (Render does this for you; see the README in this folder). It listens on $PORT.
//
// A client connects to wss://<this server>/?room=CODE&id=PLAYER&role=host|guest. Text frames are this server talking:
//   {"k":"ready"} you are in; {"k":"error","why":"no-room"|"taken"|"full"} you are not; {"k":"gone","id":...} that player left.
// Binary frames are players talking: [1 byte n][n bytes: who][the message]. Sent, "who" is who it is for; received, who it is from.
const http = require('http');
const { WebSocketServer } = require('ws');

const MAX_ROOM = 8;
const rooms = new Map();   // code -> { host: id, members: Map(id -> socket) }

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`Spadeheart relay: ${rooms.size} room${rooms.size === 1 ? '' : 's'} open.\n`);
});
const wss = new WebSocketServer({ server, maxPayload: 1 << 20 });

const say = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };

wss.on('connection', (ws, req) => {
  const q = new URL(req.url, 'http://relay').searchParams;
  const code = (q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const id = (q.get('id') || '').slice(0, 100);
  const role = q.get('role') === 'host' ? 'host' : 'guest';
  if (!code || !id) { ws.close(1008, 'room and id are needed'); return; }
  let room = rooms.get(code);
  if (role === 'host') {
    const other = room && room.members.get(room.host);
    if (room && room.host !== id && other && other.readyState === 1) { say(ws, { k: 'error', why: 'taken' }); ws.close(); return; }
    if (!room) { room = { host: id, members: new Map() }; rooms.set(code, room); }
    room.host = id;
  } else {
    const host = room && room.members.get(room.host);
    if (!host || host.readyState !== 1) { say(ws, { k: 'error', why: 'no-room' }); ws.close(); return; }
    if (room.members.size >= MAX_ROOM) { say(ws, { k: 'error', why: 'full' }); ws.close(); return; }
  }
  const old = room.members.get(id);
  if (old && old !== ws) old.terminate();
  room.members.set(id, ws);
  ws.alive = true;
  say(ws, { k: 'ready' });

  const from = Buffer.from(id);
  ws.on('message', (data, binary) => {
    if (!binary) return;
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (b.length < 1) return;
    const n = b[0], to = b.subarray(1, 1 + n).toString(), dest = room.members.get(to);
    if (!dest || dest.readyState !== 1 || dest === ws) return;
    dest.send(Buffer.concat([Buffer.from([from.length]), from, b.subarray(1 + n)]), { binary: true });
  });
  ws.on('pong', () => { ws.alive = true; });
  ws.on('close', () => {
    if (room.members.get(id) !== ws) return;
    room.members.delete(id);
    for (const other of room.members.values()) say(other, { k: 'gone', id });
    // The host gone, the room goes with them.
    if (id === room.host) {
      for (const other of room.members.values()) other.close();
      if (rooms.get(code) === room) rooms.delete(code);
    } else if (!room.members.size && rooms.get(code) === room) rooms.delete(code);
  });
});

// Anyone silent through two rounds of these is gone. They also keep idle connections from being cut by anything in between.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
}, 20000);

const port = Number(process.env.PORT || 10000);
server.listen(port, () => console.log(`Spadeheart relay listening on ${port}`));
