// Spadeheart as a desktop app: its own window, no browser around it. No tabs, no address bar, no right-click menu, no shortcuts that
// close or reload the page by accident, and no "press Esc to show your cursor" bubble. It runs the very same files the web version
// does, straight from the folder above this one, so GitHub Pages and `node server.js` carry on exactly as before.
const { app, BrowserWindow, protocol, net, Menu, shell, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

// The game is served from app://spadeheart/ rather than file://, so its modules and workers load the way they do on the web, with the two
// headers server.js sends (they let the chunk workers share the city layout instead of each holding a copy).
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

// One copy at a time. Two windows would share the same saves and trip over each other, so a second launch just brings the first one back.
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

// On a laptop with two graphics chips, use the fast one.
app.commandLine.appendSwitch('force_high_performance_gpu');

// Steam. Run with --steam (put it in the game's launch options in Steam) and the window is drawn the way Steam's overlay (Shift+Tab) can
// draw on top of. That costs a little, so it stays off otherwise. Steam's own launch variables switch it on too, as a fallback.
const STEAM = process.argv.includes('--steam') || !!(process.env.SteamGameId || +process.env.SteamAppId);
let steamClient = null;
if (STEAM) {
  app.commandLine.appendSwitch('in-process-gpu');
  app.commandLine.appendSwitch('disable-direct-composition');
  // The game also signs in to Steam through steamworks.js, so it shows as Spadeheart and its playtime counts. The App ID comes from Steam
  // itself when the store build is launched from your library (no steam_appid.txt needed, and none should ship in the depot); for a test
  // run outside Steam, put it in desktop/steam_appid.txt. With no ID, or Steam closed, sign-in fails quietly and the game runs as normal.
  // Never fall back to 480 (Steam's test game, Spacewar): that would log the hours against your real account under the wrong game.
  let appId = +process.env.SteamAppId || 0;
  try { appId = appId || +fs.readFileSync(path.join(__dirname, 'steam_appid.txt'), 'utf8').trim() || 0; } catch {}
  let steamworks = null;
  try { steamworks = require('steamworks.js'); } catch (e) { console.warn('Steam: steamworks.js is missing, overlay only.', e && e.message); }
  if (steamworks) {
    // Repaints the window even when the page is still (a menu, say), so the overlay always has a frame to draw on.
    steamworks.electronEnableSteamOverlay();
    // Signs in and runs Steam's callbacks 30 times a second. Given no ID, it asks Steam which game launched it.
    try { steamClient = steamworks.init(appId || undefined); } catch (e) { console.warn('Steam: not signed in, running without it.', e && e.message); }
  }
}

// Its own name and icon on the taskbar, not Electron's. (icon.ico and icon.png are drawn from the web page's favicon by make-icon.js.)
app.setAppUserModelId('com.spadeheart.game');

app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const p = decodeURIComponent(new URL(req.url).pathname);
    const file = path.normalize(path.join(ROOT, p === '/' ? 'index.html' : p));
    if (!file.startsWith(ROOT) || file.includes(`${path.sep}desktop${path.sep}`)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString()).catch(() => null);
    if (!res || !res.ok) return new Response('Not found', { status: 404 });
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cache-Control': 'no-store',
      },
    });
  });

  // No menu bar, and with it none of the browser's shortcuts (Ctrl+R, Ctrl+W and the rest).
  Menu.setApplicationMenu(null);
  const win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 600,
    backgroundColor: '#000000', title: 'Spadeheart', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, spellcheck: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('app://spadeheart/index.html');
  // Launching it again brings this window back instead of opening a second one.
  app.on('second-instance', () => { if (win.isMinimized()) win.restore(); win.show(); win.focus(); });
  // The screen does not go to sleep mid-game (on a controller, say, with the mouse and keyboard untouched).
  const awake = powerSaveBlocker.start('prevent-display-sleep');
  win.on('closed', () => { if (powerSaveBlocker.isStarted(awake)) powerSaveBlocker.stop(awake); });
  // F11 for full screen, and the game's own title on the window.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  win.on('page-title-updated', (e) => { e.preventDefault(); win.setTitle('Spadeheart'); });
  // Any link out (the GitHub page, say) opens in your normal browser, never in the game window.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://spadeheart/')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
});

app.on('window-all-closed', () => app.quit());
