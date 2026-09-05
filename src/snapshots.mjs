import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ID = /^(?:\d{8}T\d{9}Z|undated)-[a-f0-9]{12}$/;
const FILES = ['index.html', 'roommap3.json', 'roommap.data.json'];
const hash = value => createHash('sha256').update(value).digest('hex');

export function snapshotIdentity(raw) {
  const data = JSON.parse(raw);
  let observation = null;
  if (data.observation != null) {
    const { startedAt, completedAt } = data.observation;
    for (const value of [startedAt, completedAt]) {
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
        throw new Error('Observation dates must be canonical UTC ISO timestamps.');
      }
    }
    if (startedAt > completedAt) throw new Error('Observation interval is reversed.');
    observation = { startedAt, completedAt };
  }
  const dataSha256 = hash(raw);
  const date = observation ? observation.completedAt.replace(/[-:.]/g, '') : 'undated';
  return { id: date + '-' + dataSha256.slice(0, 12), observation, dataSha256 };
}

function readSnapshot(directory) {
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8'));
  if (!ID.test(metadata.id) || path.basename(directory) !== metadata.id) throw new Error('Invalid snapshot directory.');
  for (const name of FILES) {
    const actual = hash(fs.readFileSync(path.join(directory, name)));
    if (actual !== metadata.files?.[name]) throw new Error('Snapshot integrity check failed: ' + metadata.id + '/' + name);
  }
  const identity = snapshotIdentity(fs.readFileSync(path.join(directory, 'roommap3.json'), 'utf8'));
  if (identity.id !== metadata.id || identity.dataSha256 !== metadata.dataSha256 ||
      JSON.stringify(identity.observation) !== JSON.stringify(metadata.observation)) {
    throw new Error('Snapshot metadata does not match its data: ' + metadata.id);
  }
  return metadata;
}

export function preserveSnapshot(root, identity, files) {
  if (!ID.test(identity.id)) throw new Error('Invalid snapshot ID.');
  const archiveRoot = path.resolve(root, 'snapshots');
  const directory = path.join(archiveRoot, identity.id);
  if (fs.existsSync(directory)) {
    const existing = readSnapshot(directory);
    if (existing.dataSha256 !== identity.dataSha256) throw new Error('Snapshot ID collision.');
    // Keep the original renderer and derived data, even after a code upgrade.
    return existing;
  }
  fs.mkdirSync(archiveRoot, { recursive: true });
  const staging = fs.mkdtempSync(path.join(archiveRoot, '.pending-'));
  const metadata = { ...identity, files: Object.fromEntries(FILES.map(name => [name, hash(files[name])])) };
  try {
    for (const name of FILES) fs.writeFileSync(path.join(staging, name), files[name], { flag: 'wx' });
    fs.writeFileSync(path.join(staging, 'snapshot.json'), JSON.stringify(metadata, null, 2), { flag: 'wx' });
    fs.renameSync(staging, directory);
  } catch (error) {
    // Only remove the freshly allocated staging directory in this archive root.
    if (path.dirname(path.resolve(staging)) === archiveRoot && path.basename(staging).startsWith('.pending-')) {
      fs.rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  }
  return metadata;
}

export function writeSnapshotIndex(root) {
  const archiveRoot = path.resolve(root, 'snapshots');
  const snapshots = fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && ID.test(entry.name))
    .map(entry => readSnapshot(path.join(archiveRoot, entry.name)))
    .sort((a, b) => (b.observation?.completedAt || '').localeCompare(a.observation?.completedAt || '') || a.id.localeCompare(b.id));
  fs.writeFileSync(path.join(archiveRoot, 'index.json'), JSON.stringify({ snapshots }, null, 2));
  const rows = snapshots.map(snapshot => {
    const label = snapshot.observation
      ? snapshot.observation.startedAt + ' – ' + snapshot.observation.completedAt
      : '観測日時不明 / Observation time unknown';
    return '<li><a href="' + snapshot.id + '/">' + label + '</a><small>' + snapshot.id + '</small></li>';
  }).join('\n');
  fs.writeFileSync(path.join(archiveRoot, 'index.html'), `<!doctype html>
<html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Past maps — Technocore Room Map</title>
<style>body{color:#e8e8ea;background:#0a0a0b;font:16px/1.7 system-ui;max-width:850px;margin:40px auto;padding:0 22px}a{color:#62d6ec}li{margin:24px 0;overflow-wrap:anywhere}small{display:block;color:#aaa}ul{padding-left:20px}</style>
<h1>過去の地図 / Past maps</h1><a href="../">最新版を見る / View latest</a>
<p>取得時点の部屋・数値・つながりを保存した固定版です。日時はUTCです。<br>
Fixed snapshots of sampled rooms, metrics and connections. Times are UTC.</p>
<p>部屋への外部リンクは現在のTechnocoreを開きます。過去のメッセージ本文は保存していません。<br>
Room links open live Technocore; historical messages are not archived.</p><ul>${rows}</ul></html>`);
  return snapshots;
}
