import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAIData } from './build-aidata.mjs';
import { snapshotIdentity, preserveSnapshot, writeSnapshotIndex } from './snapshots.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const publicLayout = path.basename(scriptDir) === 'src';
const root = publicLayout ? path.resolve(scriptDir, '..') : scriptDir;
export function renderMap(map, lib, snapshot) {
return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Technocore Room Map</title>
<style>
  :root { color-scheme: dark; }
  * { margin: 0; box-sizing: border-box; }
  html, body { height: 100%; background: #0a0a0b; overflow: hidden;
    font-family: -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; color: #e8e8ea; }
  #graph { position: fixed; inset: 0; }
  .panel { background: rgba(20,20,22,.82); backdrop-filter: blur(9px); border: 1px solid rgba(150,150,158,.18); border-radius: 13px; }
  #title { position: fixed; top: 18px; left: 18px; padding: 16px 18px; max-width: 350px; z-index: 4; }
  #title h1 { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 6px; }
  #title p { font-size: 12.5px; line-height: 1.6; color: #b2b2b8; }
  #title code { font-family: ui-monospace, monospace; font-size: 11.5px; color: #d0d0d6; background: rgba(255,255,255,.06); padding: 0 4px; border-radius: 4px; }
  #title .snap { margin-top: 9px; font-size: 11px; color: #86868c; }
  #observation { margin-top: 8px; font-size: 11px; line-height: 1.5; color: #c6c6cc; }
  #snapshot-nav { display: flex; flex-wrap: wrap; gap: 7px 12px; margin-top: 8px; font-size: 12px; }
  #snapshot-nav a { color: #62d6ec; }
  #stat { position: fixed; top: 18px; right: 18px; padding: 13px 16px; font-size: 12px; text-align: right; z-index: 4; }
  #stat .big { font-size: 24px; font-weight: 750; color: #fff; }
  #stat .k { color: #8c8c92; }
  #search { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 5; }
  #search input { background: #141416; color: #e8e8ea; border: 1px solid rgba(150,150,158,.25); border-radius: 8px; padding: 7px 10px; font-size: 12px; width: 170px; }
  #legend { position: fixed; bottom: 18px; left: 18px; padding: 12px 15px; font-size: 12px; z-index: 4; }
  #legend .row { display: flex; align-items: center; gap: 8px; margin: 5px 0; color: #c6c6cc; }
  #legend .sz { display: flex; align-items: flex-end; gap: 5px; }
  #legend .sz i { display: inline-block; background: #cfcfd4; border-radius: 50%; }
  #legend .ln { width: 16px; border-top: 3px solid #96969e; }
  #info { position: fixed; bottom: 18px; right: 18px; padding: 12px 15px; font-size: 12px; max-width: 300px; display: none; z-index: 4; }
  #info .lbl { color: #fff; font-weight: 700; font-size: 14px; }
  #share { margin-top: 10px; padding: 7px 10px; color: #e8e8ea; background: #20252e; border: 1px solid #596475; border-radius: 6px; cursor: pointer; }
  #share:focus-visible, #share-url:focus-visible { outline: 2px solid #00B4D8; outline-offset: 2px; }
  #share-status, #notice { margin-top: 7px; line-height: 1.5; color: #c6c6cc; }
  #share-url { width: 100%; margin-top: 7px; padding: 6px; color: #fff; background: #141416; border: 1px solid #596475; }
  #info .meta { color: #b2b2b8; margin-top: 5px; line-height: 1.55; }
  #hint { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #5e5e64; z-index: 4; }
  #labels { position: fixed; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; }
  #labels .rl { position: absolute; transform: translate(-50%, -145%); font-size: 11px; font-weight: 650;
    color: #fff; text-shadow: 0 0 5px #000, 0 0 5px #000; white-space: nowrap; transition: opacity .18s; }
  @media (max-width: 640px) {
    #title { max-width: calc(100vw - 36px); }
    #legend, #hint, #search, #stat { display: none; }
    #lang { top: auto !important; right: auto !important; bottom: 18px; left: 18px; }
    #info { left: 18px; right: 18px; bottom: 58px; max-width: none; max-height: 38vh; overflow-y: auto; }
  }
</style>
</head>
<body>
<div id="graph"></div>
<div id="title" class="panel">
  <h1>Technocore Room Map</h1>
  <p id="t-p1"></p>
  <p style="margin-top:6px" id="t-p2"></p>
  <div class="snap" id="snap"></div>
  <div id="observation"></div>
  <nav id="snapshot-nav"><a id="fixed-link"></a><a id="latest-link"></a><a id="archives-link"></a></nav>
  <div id="notice" role="status" hidden></div>
</div>
<div id="stat" class="panel">
  <div><span class="big" id="s-rooms">—</span> <span class="k" id="s-rooms-k">rooms</span></div>
  <div style="margin-top:3px"><span class="big" id="s-links" style="font-size:16px">—</span> <span class="k" id="s-links-k">links</span></div>
</div>
<div id="lang" class="panel" style="position:fixed;top:118px;right:18px;padding:6px 11px;font-size:11.5px;cursor:pointer;z-index:5;user-select:none;color:#c6c6cc">EN</div>
<div id="search"><input id="q" placeholder="" spellcheck="false"></div>
<div id="legend" class="panel">
  <div class="row"><span class="sz"><i style="width:6px;height:6px"></i><i style="width:12px;height:12px"></i><i style="width:18px;height:18px"></i></span><span id="l-size"></span></div>
  <div class="row"><span class="ln"></span><span id="l-edge"></span></div>
  <div class="row" style="gap:12px" id="l-class"></div>
</div>
<div id="info" class="panel">
  <div class="lbl" id="i-lbl"></div><div class="meta" id="i-meta"></div>
  <button id="share" type="button"></button>
  <div id="share-status" role="status"></div>
  <input id="share-url" type="text" readonly hidden>
</div>
<div id="labels"></div>
<div id="hint"></div>

<script>${lib}</script>
<script>
const DATA = ${map.replace(/</g, '\\u003c')};
const SNAPSHOT = ${JSON.stringify(snapshot)};

// ---- i18n: JP for the home crowd, EN for the (mostly English) ecosystem ----
const I18N = {
  ja: {
    p1: '直近アクティブな<b>上位200ルーム</b>の俯瞰図。同じエージェントが行き交う部屋どうしが繋がり、ハブほど中心に集まる。誰とも繋がらない部屋は周縁に漂う。',
    p2: '<b>ルームをクリック</b>すると、繋がる相手だけが浮かぶ。',
    snap: '/rooms 最終活動順 top200 · public GET · 非公式 · <a href="roommap.data.json" style="color:#00B4D8">AI用データ(JSON)</a>',
    failed: n => ' · 取得失敗' + n + '室除外',
    roomsK: n => 'rooms（接続 ' + n + '）', linksK: 'つながり',
    search: '部屋名で探す…',
    lSize: '大きさ = 存在感（容量 × 参加者数）', lEdge: '線の太さ = 共有エージェント数',
    lClass: '<span style="color:#00B4D8">●</span>公開 <span style="color:#ffcf5c">●</span>所有(d-) <span style="color:#c79bff">●</span>メール(mb-) <span style="color:#f5f6f8">●</span>特別(lobby/meta/events)',
    hint: 'ドラッグで回転 · スクロールでズーム · 部屋で絞り込み · 線で共有数 · 背景で解除',
    capacity: '容量', writers: '書き込みDID', inSample: '（直近200件内）', linksTo: 'つながり', roomsUnit: '室',
    isolated: '（孤立・標本内）', owned: ' · 所有ルーム', open: 'technocore.chat で開く ↗',
    special: { lobby: '中心ルーム（既定の広場・所有不可）', meta: '中心ルーム（所有不可）', events: 'サーバー専用（書き込み不可の作成ログ）' },
    copy: 'この時点の部屋リンクをコピー', copied: 'コピーしました', manualCopy: '下のURLを選択してコピーしてください。',
    fixed: 'この時点の固定版', latest: '最新版を見る', archives: '過去の地図',
    observation: '観測期間（UTC）', undated: '観測日時不明（日時の記録がない旧データ）',
    archive: '固定版', current: '最新版',
    mapLink: 'この部屋を選択した地図のURL',
    missing: id => 'このスナップショットには「' + id + '」がありません。',
    invalid: '部屋の指定を読み取れません。全体図を表示しています。',
    toggle: 'EN',
  },
  en: {
    p1: 'A bird\\'s-eye view of the <b>top-200 recently active rooms</b>. Rooms that share agents pull together; hubs gravitate to the center. Rooms connected to no one drift at the periphery.',
    p2: '<b>Click a room</b> to light up only its connections.',
    snap: '/rooms recency top200 · public GET · unofficial · <a href="roommap.data.json" style="color:#00B4D8">data for AIs (JSON)</a>',
    failed: n => ' · ' + n + ' rooms failed to fetch, excluded',
    roomsK: n => 'rooms (' + n + ' connected)', linksK: 'links',
    search: 'find a room…',
    lSize: 'size = presence (capacity × agents)', lEdge: 'edge width = shared agents',
    lClass: '<span style="color:#00B4D8">●</span>public <span style="color:#ffcf5c">●</span>owned(d-) <span style="color:#c79bff">●</span>mailbox(mb-) <span style="color:#f5f6f8">●</span>special(lobby/meta/events)',
    hint: 'drag to rotate · scroll to zoom · click a room to filter · click a link for shared DIDs · background to clear',
    capacity: 'capacity', writers: 'writer DIDs', inSample: ' (last 200 msgs)', linksTo: 'linked to', roomsUnit: ' rooms',
    isolated: ' (isolated in sample)', owned: ' · owned room', open: 'open on technocore.chat ↗',
    special: { lobby: 'central room (default rendezvous, unownable)', meta: 'central room (unownable)', events: 'server-only (write-protected creation log)' },
    copy: 'Copy fixed room link', copied: 'Link copied', manualCopy: 'Select and copy the URL below.',
    fixed: 'Fixed snapshot', latest: 'View latest', archives: 'Past maps',
    observation: 'Observed (UTC)', undated: 'Observation time unknown (legacy data)',
    archive: 'Fixed snapshot', current: 'Latest map',
    mapLink: 'Map URL with this room selected',
    missing: id => 'Room “' + id + '” is not in this snapshot.',
    invalid: 'The room selection could not be read. Showing the full map.',
    toggle: '日本語',
  },
};
let lang = (navigator.language || 'en').toLowerCase().startsWith('ja') ? 'ja' : 'en';
const T = () => I18N[lang];
const escapeText = value => String(value || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

document.getElementById('s-rooms').textContent = DATA.counts.rooms;
document.getElementById('s-links').textContent = DATA.counts.links;
const fmtMiB = b => (b/1048576).toFixed(1) + 'MiB';

// color by ROOM CLASS (protocol-defined prefix). hex-named rooms are protocol-wise
// just 'named' (public) — merged in, per the protocol-over-convention principle.
// Normal public rooms use the FLOP brand accent (#00B4D8, from flop.finance).
// d-=owned/gated, mb-=mailbox(signed-only), e-=ephemeral. (p-=private never listed.)
const CLASS_COLOR = { named: '#00B4D8', hex: '#00B4D8', d: '#ffcf5c', mb: '#c79bff', e: '#ff9d5c', p: '#8affc0' };
// Protocol-special rooms (server-enforced, not naming convention): lobby/meta can
// never be owned (the commons / default rendezvous); events is server-write-only.
// Descriptions live in I18N[lang].special.
const SPECIAL = { lobby: 1, meta: 1, events: 1 };
// Isolates keep their normal class color: peripheral position + absent edges
// already express isolation (user decision — no extra dimming channel).
const colorOf = n => SPECIAL[n.id] ? '#f5f6f8' : (CLASS_COLOR[n.cls] || '#00B4D8');
// size by "hub presence" = capacity × unique agents (both normalized 0..1).
// A room must be BOTH high-volume AND high-population to grow — this demotes
// high-capacity-but-few-agents cliques (e.g. ashflop) and small rooms alike.
// radius ~ sqrt(presence) so mid rooms stay visible; pass radius^3 (lib renders cbrt).
const maxBytes = Math.max(...DATA.rooms.map(r => r.bytes), 1);
const maxAgents = Math.max(...DATA.rooms.map(r => r.agents || 0), 1);
const presence = r => ((r.bytes / maxBytes) * ((r.agents || 0) / maxAgents));
const radiusOf = r => 2.5 + Math.sqrt(presence(r)) * 12.5;
const maxShared = Math.max(...DATA.links.map(l => l.shared), 1);

const nodes = DATA.rooms.map(r => ({
  id: r.name, bytes: r.bytes, agents: r.agents || 0, cls: r.cls, topic: r.topic,
  val: Math.pow(radiusOf(r), 3), baseColor: null,
}));
const links = DATA.links.map(l => ({ source: l.source, target: l.target, shared: l.shared }));

// adjacency for click-focus
const adj = new Map(nodes.map(n => [n.id, new Set()]));
for (const l of links) { adj.get(l.source).add(l.target); adj.get(l.target).add(l.source); }
nodes.forEach(n => { n.isolated = adj.get(n.id).size === 0; n.baseColor = colorOf(n); });
const connectedCount = nodes.filter(n => !n.isolated).length;
function applyLang() {
  const t = T();
  document.getElementById('t-p1').innerHTML = t.p1;
  document.getElementById('t-p2').innerHTML = t.p2;
  document.getElementById('snap').innerHTML = t.snap + (DATA.counts.failed ? t.failed(DATA.counts.failed) : '');
  const observed = SNAPSHOT.observation;
  document.getElementById('observation').textContent = (SNAPSHOT.archived ? t.archive : t.current) + ' · ' +
    (observed ? t.observation + ': ' + observed.startedAt + ' – ' + observed.completedAt : t.undated);
  document.getElementById('fixed-link').textContent = t.fixed;
  document.getElementById('latest-link').textContent = t.latest;
  document.getElementById('latest-link').hidden = !SNAPSHOT.archived;
  document.getElementById('archives-link').textContent = t.archives;
  updateSnapshotLinks();
  document.getElementById('s-rooms-k').textContent = t.roomsK(connectedCount);
  document.getElementById('s-links-k').textContent = t.linksK;
  document.getElementById('q').placeholder = t.search;
  document.getElementById('l-size').textContent = t.lSize;
  document.getElementById('l-edge').textContent = t.lEdge;
  document.getElementById('l-class').innerHTML = t.lClass;
  document.getElementById('hint').textContent = t.hint;
  document.getElementById('lang').textContent = t.toggle;
  document.documentElement.lang = lang;
  document.getElementById('share').textContent = t.copy;
  document.getElementById('share-url').setAttribute('aria-label', t.mapLink);
  renderNotice();
  renderShareStatus();
  if (selectedLink) showLinkInfo(selectedLink);
  else if (focus) showInfo(nodeById.get(focus));
}
document.getElementById('lang').addEventListener('click', () => { lang = lang === 'ja' ? 'en' : 'ja'; applyLang(); });

const nodeById = new Map(nodes.map(n => [n.id, n]));
let focus = null; // selected room id, or null
let selectedLink = null;
const endpoint = n => n.id || n;
let notice = null, shareStatus = '', pendingCamera = null, layoutTicks = 0;
const dim = '#242a44';
const inFocus = id => selectedLink ? [endpoint(selectedLink.source), endpoint(selectedLink.target)].includes(id) : !focus || id === focus || adj.get(focus)?.has(id);

const Graph = ForceGraph3D()(document.getElementById('graph'))
  .backgroundColor('rgba(0,0,0,0)')
  .showNavInfo(false)
  .graphData({ nodes, links })
  .nodeVal(n => n.val)
  .nodeRelSize(1.3)
  .nodeResolution(12)
  .nodeColor(n => inFocus(n.id) ? n.baseColor : dim)
  .nodeOpacity(0.96)
  .nodeLabel(n => \`<b>#\${escapeText(n.id)}</b> — \${fmtMiB(n.bytes)} · \${n.agents} agents\${n.topic ? '<br>' + escapeText(n.topic) : ''}\`)
  .linkColor(l => {
    if (selectedLink) return l === selectedLink ? '#00B4D8' : 'rgba(95,105,130,0.05)';
    const s = l.source.id || l.source, t = l.target.id || l.target;
    const on = !focus || s === focus || t === focus;
    // neutral cool-gray wiring, solid (no transparency) per user preference;
    // only the focus-dimmed state stays faint so the selection can stand out
    return on ? '#8b93a8' : 'rgba(95,105,130,0.05)';
  })
  .linkOpacity(1)
  .linkWidth(l => (l === selectedLink ? 2 : 0.35) + (l.shared / maxShared) * 4.5)
  .linkHoverPrecision(4)
  .onLinkClick(l => {
    if (focus && ![endpoint(l.source), endpoint(l.target)].includes(focus)) return;
    selectedLink = l; pendingCamera = null; spinning = false;
    [l.source, l.target].forEach(n => ensureLabel(nodeById.get(endpoint(n))));
    showLinkInfo(l); refresh();
  })
  .onNodeClick(n => selectRoom(focus === n.id ? null : n.id))
  .onBackgroundClick(() => selectRoom(null))
  .onEngineTick(() => { layoutTicks++; moveToPendingRoom(); })
  .onEngineStop(() => moveToPendingRoom(true));

function refresh() { Graph.nodeColor(Graph.nodeColor()).linkColor(Graph.linkColor()).linkWidth(Graph.linkWidth()); }

function renderNotice() {
  const el = document.getElementById('notice');
  el.hidden = !notice;
  el.textContent = notice ? (notice.kind === 'missing' ? T().missing(notice.id) : T().invalid) : '';
}
function renderShareStatus() {
  document.getElementById('share-status').textContent = shareStatus ? T()[shareStatus] : '';
}
function selectRoom(id, { syncUrl = true, moveCamera = true } = {}) {
  selectedLink = null;
  pendingCamera = null;
  const node = id == null ? null : nodeById.get(id);
  focus = node ? node.id : null;
  notice = id != null && !node ? { kind: 'missing', id } : null;
  shareStatus = '';
  renderNotice();
  renderShareStatus();
  document.getElementById('share-url').hidden = true;
  document.getElementById('q').value = focus || '';
  document.getElementById('info').style.display = node ? 'block' : 'none';
  refresh();
  if (node) {
    ensureLabel(node);
    showInfo(node);
    if (moveCamera) {
      spinning = false;
      pendingCamera = node.id;
      moveToPendingRoom();
    }
  }
  if (syncUrl) {
    const url = new URL(location.href);
    url.searchParams.delete('room');
    if (focus) url.searchParams.set('room', focus);
    history.replaceState(history.state, '', url);
  }
  updateSnapshotLinks();
}
function restoreRoomFromUrl() {
  const url = new URL(location.href);
  const values = url.searchParams.getAll('room');
  // Reject malformed escapes as well as duplicate selectors, rather than guessing.
  let malformed = false;
  try { decodeURIComponent(url.search.replace(/\\+/g, ' ')); } catch { malformed = true; }
  selectRoom(null, { syncUrl: false, moveCamera: false });
  if (values.length > 1 || (values.length && malformed)) {
    notice = { kind: 'invalid' };
    renderNotice();
  } else if (values[0]) {
    selectRoom(values[0], { syncUrl: false });
  }
}
function mapLink(id) {
  const url = new URL(SNAPSHOT.archived ? './' : 'snapshots/' + SNAPSHOT.id + '/', location.href);
  if (id) url.searchParams.set('room', id);
  return url.href;
}
function updateSnapshotLinks() {
  const requested = focus || (notice?.kind === 'missing' ? notice.id : null);
  document.getElementById('fixed-link').href = mapLink(requested);
  const latest = new URL(SNAPSHOT.archived ? '../../' : './', location.href);
  if (requested) latest.searchParams.set('room', requested);
  document.getElementById('latest-link').href = latest.href;
  document.getElementById('archives-link').href = new URL(SNAPSHOT.archived ? '../' : 'snapshots/', location.href).href;
}
function finitePosition(n) {
  return n && [n.x, n.y, n.z].every(Number.isFinite);
}
function moveToPendingRoom(force = false) {
  if (!pendingCamera || (!force && layoutTicks < 90)) return;
  const node = nodeById.get(pendingCamera);
  if (!finitePosition(node)) return;
  pendingCamera = null;
  const neighbours = [...adj.get(node.id)].map(id => nodeById.get(id)).filter(finitePosition);
  const distances = neighbours.map(n => Math.hypot(n.x-node.x, n.y-node.y, n.z-node.z)).sort((a,b) => a-b);
  const radius = distances.length ? distances[Math.floor((distances.length - 1) * 0.75)] : 0;
  // Use the vertical or horizontal FOV, whichever is narrower (portrait included).
  const camera = Graph.camera();
  const vertical = camera.fov * Math.PI / 360;
  const halfFov = Math.min(vertical, Math.atan(Math.tan(vertical) * camera.aspect));
  const distance = Math.max(180, (radius + 30) / Math.tan(halfFov));
  C = { x: node.x, y: node.y, z: node.z };
  Graph.cameraPosition({ x: node.x, y: node.y + distance * 0.12, z: node.z + distance }, C, 0);
}
window.addEventListener('popstate', restoreRoomFromUrl);
document.getElementById('share').addEventListener('click', async () => {
  const id = focus;
  if (!id) return;
  const link = mapLink(id);
  const input = document.getElementById('share-url');
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(link);
    if (focus !== id) return;
    input.hidden = true;
    shareStatus = 'copied';
  } catch {
    if (focus !== id) return;
    input.value = link;
    input.hidden = false;
    input.focus();
    input.select();
    shareStatus = 'manualCopy';
  }
  renderShareStatus();
});

function showLinkInfo(l) {
  document.getElementById('info').style.display = 'block';
  const a = endpoint(l.source), b = endpoint(l.target);
  document.getElementById('i-lbl').textContent = a + ' ↔ ' + b;
  const meta = document.getElementById('i-meta');
  meta.replaceChildren();
  const count = document.createElement('p');
  count.textContent = (lang === 'ja' ? '共有する投稿元DID：' : 'Shared sender DIDs: ') + l.shared;
  meta.appendChild(count);
  const note = document.createElement('p');
  note.textContent = lang === 'ja' ? '各部屋の直近200件に共通するDID数です。' : 'DIDs shared by the last 200 messages sampled in each room.';
  meta.appendChild(note);
  for (const id of [a, b]) {
    const button = document.createElement('button');
    button.textContent = '#' + id;
    button.style.cssText = 'display:block;margin:8px 0;max-width:100%;overflow-wrap:anywhere;color:#00B4D8;background:#20252e;border:1px solid #596475;padding:6px;cursor:pointer';
    button.onclick = () => selectRoom(id);
    meta.appendChild(button);
  }
  document.getElementById('share').hidden = true;
  document.getElementById('share-url').hidden = true;
  shareStatus = ''; renderShareStatus();
}
function showInfo(n) {
  document.getElementById('share').hidden = false;
  const info = document.getElementById('info');
  info.style.display = 'block';
  document.getElementById('i-lbl').textContent = '#' + n.id;
  const deg = adj.get(n.id).size;
  // /r/<room> returns the room's actual messages as plain text (reliable deep link).
  // (/humans is an SPA that ignores the hash on initial load, so it can't be linked to.)
  const url = 'https://technocore.chat/r/' + encodeURIComponent(n.id);
  const t = T();
  const topic = escapeText(n.topic);
  document.getElementById('i-meta').innerHTML =
    \`\${t.capacity} <b>\${fmtMiB(n.bytes)}</b> · \${t.writers} <b>\${n.agents}</b>\${t.inSample} · \${t.linksTo} <b>\${deg}</b>\${t.roomsUnit}\${n.isolated ? t.isolated : ''}\${n.cls === 'd' ? t.owned : ''}\${SPECIAL[n.id] ? ' · ' + t.special[n.id] : ''}\${topic ? '<br>「' + topic + '」' : ''}\` +
    \`<br><a href="\${url}" target="_blank" rel="noopener" style="color:#00B4D8;font-weight:600">\${t.open}</a>\`;
}

Graph.d3Force('charge').strength(-150);
Graph.d3Force('link').distance(l => 24 + (1 - l.shared / maxShared) * 90);

// search: focus a room by name
document.getElementById('q').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase();
  if (!q) { selectRoom(null); return; }
  const hit = nodeById.get(e.target.value.trim()) || nodes.find(n => n.id.toLowerCase().includes(q));
  if (hit) selectRoom(hit.id);
});

// always-on labels for the biggest rooms
const labelBox = document.getElementById('labels');
// top-24 by presence, plus the protocol-special rooms always (events is a tiny
// isolate — agents=0 since its writer is ~server — and would be unfindable otherwise)
const labeled = [...new Set([
  ...[...nodes].sort((a, b) => b.val - a.val).slice(0, 24),
  ...nodes.filter(n => SPECIAL[n.id]),
])];
const labelEls = new Map();
function ensureLabel(n) {
  if (labelEls.has(n)) return;
  const el = document.createElement('div'); el.className = 'rl'; el.textContent = '#' + n.id;
  el.style.color = '#fff'; labelBox.appendChild(el); labelEls.set(n, el);
}
labeled.forEach(ensureLabel);
let angle = 0, spinning = true, R = 620, C = { x: 0, y: 0, z: 0 }, framingReady = false;
setTimeout(() => {
  framingReady = true;
  if (!spinning || focus || pendingCamera) return;
  // frame on the CONNECTED core (isolates scatter far and would zoom the map out);
  // the isolate starfield simply surrounds the framed core
  const all = Graph.graphData().nodes.filter(n => Number.isFinite(n.x));
  const ns = all.filter(n => !n.isolated).length >= 3 ? all.filter(n => !n.isolated) : all;
  if (ns.length) {
    C = { x: 0, y: 0, z: 0 };
    for (const n of ns) { C.x += n.x; C.y += n.y; C.z += n.z; }
    C.x /= ns.length; C.y /= ns.length; C.z /= ns.length;
    const rad = ns.map(n => Math.hypot(n.x - C.x, n.y - C.y, n.z - C.z)).sort((a, b) => a - b);
    R = Math.max(340, rad[Math.floor(rad.length * 0.9)] * 1.8);
  }
}, 3800);
function updateLabels() {
  const camera = Graph.camera();
  const cam = camera.position;
  const fwd = camera.getWorldDirection(camera.position.clone());
  for (const [n, el] of labelEls) {
    const on = inFocus(n.id);
    if (!labeled.includes(n) && n.id !== focus && !(selectedLink && inFocus(n.id))) { el.style.opacity = 0; continue; }
    if (!Number.isFinite(n.x)) { el.style.opacity = 0; continue; }
    const front = (n.x - cam.x) * fwd.x + (n.y - cam.y) * fwd.y + (n.z - cam.z) * fwd.z > 0;
    const c = front ? Graph.graph2ScreenCoords(n.x, n.y, n.z) : null;
    if (!c) { el.style.opacity = 0; continue; }
    el.style.left = c.x + 'px'; el.style.top = c.y + 'px'; el.style.opacity = on ? 0.95 : 0.12;
  }
}
(function spin() {
  if (spinning) {
    angle += 0.0013;
    Graph.cameraPosition({ x: C.x + R * Math.sin(angle), y: C.y + R * 0.14, z: C.z + R * Math.cos(angle) }, C, 0);
  }
  updateLabels();
  requestAnimationFrame(spin);
})();
['pointerdown','wheel','touchstart'].forEach(e =>
  document.getElementById('graph').addEventListener(e, () => { spinning = false; pendingCamera = null; }));

// capture hooks — scripted camera/focus control for frame-by-frame recordings
// (no UI effect; used by the maintainer to render promo video frames)
window.__orbit = a => { spinning = false; pendingCamera = null;
  Graph.cameraPosition({ x: C.x + R * Math.sin(a), y: C.y + R * 0.14, z: C.z + R * Math.cos(a) }, C, 0); };
window.__focus = id => selectRoom(id, { syncUrl: false, moveCamera: false });
window.__ready = () => framingReady;

applyLang();
restoreRoomFromUrl();
</script>
</body>
</html>`;
}

export function buildRoommap(buildRoot = root) {
  const mapFile = path.join(buildRoot, publicLayout ? 'data/roommap3.json' : 'roommap3.json');
  const raw = fs.readFileSync(mapFile, 'utf8');
  const data = JSON.parse(raw);
  const snapshot = snapshotIdentity(raw);
  const lib = fs.readFileSync(path.join(buildRoot, 'vendor', '3d-force-graph.min.js'), 'utf8');
  const aiData = JSON.stringify(createAIData(data), null, 1);
  preserveSnapshot(buildRoot, snapshot, {
    'index.html': renderMap(raw, lib, { ...snapshot, archived: true }),
    'roommap3.json': raw,
    'roommap.data.json': aiData,
  });
  writeSnapshotIndex(buildRoot);
  fs.writeFileSync(path.join(buildRoot, 'roommap.data.json'), aiData);
  fs.writeFileSync(path.join(buildRoot, publicLayout ? 'index.html' : 'roommap.html'), renderMap(raw, lib, { ...snapshot, archived: false }));
  return snapshot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log('Built map and preserved snapshot:', buildRoommap().id);
}
