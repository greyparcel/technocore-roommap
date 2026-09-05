// Preserve the previous snapshot before fetching. Failed fetches never truncate it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { buildRoommap } from './build-roommap3.mjs';
import { snapshotIdentity } from './snapshots.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
console.log('Preserved previous snapshot:', buildRoommap(root).id);
const raw = execFileSync(process.execPath, [path.join(scriptDir, 'fetch-rooms3.mjs')], {
  encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true,
});
const data = JSON.parse(raw);
const identity = snapshotIdentity(raw);
if (!identity.observation || !Array.isArray(data.rooms) || !data.rooms.length || !Array.isArray(data.links)) {
  throw new Error('Fetch produced no valid dated snapshot; previous input retained.');
}
const temporary = path.join(root, 'data', '.roommap-' + randomUUID() + '.json');
try {
  fs.writeFileSync(temporary, raw, { flag: 'wx' });
  fs.renameSync(temporary, path.join(root, 'data', 'roommap3.json'));
} finally {
  if (path.dirname(path.resolve(temporary)) === path.join(root, 'data')) fs.rmSync(temporary, { force: true });
}
console.log('Built latest snapshot:', buildRoommap(root).id);
