// Run before uploading a Steam build: node desktop/stamp-version.js
// The menu shows the commit the game is at by reading the git folder, which a Steam build does not have. This writes that commit into
// version.txt next to index.html, and the menu reads it from there instead. (version.txt is not committed: it belongs to the build only.)
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const hash = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error(`git gave back "${hash}", not a commit`);
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' }).trim();
fs.writeFileSync(path.join(ROOT, 'version.txt'), `${hash}\n`);
console.log(`version.txt: ${hash.slice(0, 7)}`);
if (dirty) console.log('Note: there are changes not committed yet, so this build has more in it than that commit.');
