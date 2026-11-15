// Spadeheart as a desktop app: its own window, no browser around it. No tabs, no address bar, no right-click menu, no shortcuts that
// close or reload the page by accident, and no "press Esc to show your cursor" bubble. It runs the very same files the web version
// does, straight from the folder above this one, so GitHub Pages and `node server.js` carry on exactly as before.
const { app, BrowserWindow, protocol, net, Menu, shell } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };

// The game is served from app://spadeheart/ rather than file://, so its modules and workers load the way they do on the web, with the two
// headers server.js sends (they let the chunk workers share the city layout instead of each holding a copy).
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

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
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadURL('app://spadeheart/index.html');
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
