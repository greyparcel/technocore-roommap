// v3 (new spec): overview map, not a value judgement.
//   - scope: the recency-sorted top-200 active rooms
//   - visual node SIZE = presence (normalized capacity × sampled unique DIDs)
//   - edge WIDTH = shared DIDs between rooms (co-membership)
//   - hubs emerge from structure (force layout)
//   - DID collection: last 200 messages per room (single read; test depth)
//   - keep every successfully fetched top-200 room, including sample isolates
// Public GET only.
const BASE = 'https://technocore.chat';
const observationStartedAt = new Date().toISOString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path) {
  for (let a = 1; a <= 5; a++) {
    const res = await fetch(BASE + path, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
    if (res.ok) return res;
    if (res.status !== 503 && res.status !== 429) return res;
    await sleep(600 * a);
  }
  return null;
}
// parse "8.5M" / "512K" / "1.2G" / "938" → bytes (binary units, matching the 10MiB ring cap)
function parseBytes(tok) {
  const m = tok.match(/^([\d.]+)([KMGB]?)$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = { '': 1, B: 1, K: 1024, M: 1048576, G: 1073741824 }[m[2].toUpperCase()] || 1;
  return Math.round(n * u);
}
const isHex = n => /^[0-9a-f]{8,}$/.test(n);
const cls = n => n.startsWith('mb-') ? 'mb' : n.startsWith('p-') ? 'p' : n.startsWith('d-') ? 'd'
  : n.startsWith('e-') ? 'e' : isHex(n) ? 'hex' : 'named';

// 1) enumerate top-200, capture bytes + topic
let list, listEvidence;
for (const limit of [200, 199, 198, 197, 196, 195]) {
  const url = `/rooms?limit=${limit}`;
  const response = await get(url);
  if (!response?.ok) continue;
  const modified = Date.parse(response.headers.get('last-modified'));
  const retrievedAt = new Date().toISOString();
  if (!Number.isFinite(modified) || Date.now() - modified > 120000 || modified > Date.now() + 60000) {
    console.error(`Rejected stale/unverifiable list: ${url}, Last-Modified=${response.headers.get('last-modified')}`);
    await response.body.cancel();
    continue;
  }
  list = await response.text();
  listEvidence = { url: BASE + url, retrievedAt, headers: Object.fromEntries(['last-modified', 'date', 'age', 'cache-control', 'cf-cache-status'].map(k => [k, response.headers.get(k)])) };
  break;
}
if (!list) throw new Error('No room list with verified freshness; previous observation retained.');
const entries = list.split('\n').filter(l => l.startsWith('/r/')).map(l => {
  const parts = l.trim().split(/\s+/);            // /r/name seq <n> <size> <age> ago · topic
  const name = parts[0].slice(3);
  const seqIdx = parts.indexOf('seq');
  const seq = seqIdx >= 0 ? +parts[seqIdx + 1] : 0;
  const bytes = seqIdx >= 0 ? parseBytes(parts[seqIdx + 2]) : 0;
  const topicM = l.match(/·\s+(.*)$/);
  return { name, seq, bytes, cls: cls(name), topic: topicM ? topicM[1].trim().slice(0, 80) : '' };
});
console.error(`top rooms: ${entries.length}`);

// 2) collect DIDs (last 200 msgs) for every room
const roomDids = new Map();
for (const e of entries) {
  const res = await get(`/r/${e.name}?format=json&limit=200`);
  if (!res || !res.ok) { console.error(`  FAILED ${e.name}`); e.failed = true; roomDids.set(e.name, new Set()); continue; }
  const data = await res.json();
  if (data.last_seq < e.seq) throw new Error(`Stale room response for ${e.name}: ${data.last_seq} < listed ${e.seq}`);
  const dids = new Set((data.messages ?? []).map(m => m.from).filter(f => f && f.startsWith('did:key:')));
  roomDids.set(e.name, dids);
  e.agents = dids.size;
  console.error(`  ${e.name}: ${dids.size} dids, ${(e.bytes/1048576).toFixed(1)}MiB`);
  await sleep(200);
}

// 3) shared-DID edges
const links = [];
const names = entries.map(e => e.name);
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
  const a = roomDids.get(names[i]), b = roomDids.get(names[j]);
  if (!a.size || !b.size) continue;
  let shared = 0; for (const d of a) if (b.has(d)) shared++;
  if (shared > 0) links.push({ source: names[i], target: names[j], shared });
}

// 4) keep ALL successfully-fetched rooms — isolates included (their presence at
// the periphery is itself information: the long tail of solo/anchor rooms).
// Only fetch failures are excluded, and they are counted explicitly.
const rooms = entries.filter(e => !e.failed);
const keepNames = new Set(rooms.map(r => r.name));
const keptLinks = links.filter(l => keepNames.has(l.source) && keepNames.has(l.target));

const out = {
  listEvidence,
  observation: { startedAt: observationStartedAt, completedAt: new Date().toISOString() },
  generatedFor: 'Technocore room map v3 — overview (size=presence, edge=shared DIDs, isolates included)',
  scopeNote: `all successfully fetched top-${entries.length} recency-active rooms; DIDs from last 200 msgs/room; isolation is sample-relative`,
  counts: { rooms: rooms.length, links: keptLinks.length, allTop: entries.length,
    failed: entries.filter(e => e.failed).length },
  rooms, links: keptLinks,
};
console.log(JSON.stringify(out));
console.error(`\nTOTAL: ${rooms.length} rooms kept (of ${entries.length}), ${keptLinks.length} links`);
