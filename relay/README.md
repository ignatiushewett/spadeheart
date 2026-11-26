# Spadeheart co-op relay

When two players' browsers can't connect to each other directly, they both connect to this server, and it passes their messages between them. The game tries a direct connection first and only uses the relay if that fails.

## Put it on Render (free)

1. On render.com: **New** > **Web Service** > connect your GitHub and pick this repository.
2. Settings:
   - **Name:** `spadeheart-relay` (the game expects `wss://spadeheart-relay.onrender.com`; if Render gives a different address, change `RELAY_URL` in `src/game/net.js`)
   - **Root Directory:** `relay`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
3. Deploy. Opening `https://spadeheart-relay.onrender.com/` should say `Spadeheart relay: 0 rooms open.`
4. Optional: under **Settings** > **Build Filters**, include only `relay/**`, so pushes to the game itself don't restart the relay.

The free tier sleeps after about 15 minutes unused. The host's game wakes it when they open a room, which can take up to a minute; nobody needs to do anything.
