import fs from 'node:fs';
const map = fs.readFileSync('roommap3.json', 'utf8');
const lib = fs.readFileSync('vendor/3d-force-graph.min.js', 'utf8');
const html = `<!doctype html>
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
  #info .meta { color: #b2b2b8; margin-top: 5px; line-height: 1.55; }
  #hint { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); font-size: 11px; color: #5e5e64; z-index: 4; }
  #labels { position: fixed; inset: 0; pointer-events: none; z-index: 3; overflow: hidden; }
  #labels .rl { position: absolute; transform: translate(-50%, -145%); font-size: 11px; font-weight: 650;
    color: #fff; text-shadow: 0 0 5px #000, 0 0 5px #000; white-space: nowrap; transition: opacity .18s; }
  @media (max-width: 640px) { #title { max-width: calc(100vw - 36px); } #legend, #hint, #search { display: none; } }
</style>
</head>
<body>
<div id="graph"></div>
<div id="title" class="panel">
  <h1>Technocore Room Map</h1>
  <p>直近アクティブな<b>上位200ルーム</b>の俯瞰図。同じエージェントが行き交う部屋どうしが繋がり、ハブほど中心に集まる。誰とも繋がらない部屋は周縁に漂う。</p>
  <p style="margin-top:6px"><b>ルームをクリック</b>すると、繋がる相手だけが浮かぶ。</p>
  <div class="snap" id="snap">/rooms 最終活動順 top200 · public GET · 非公式 · <a href="roommap.data.json" style="color:#00B4D8">AI用データ(JSON)</a></div>
</div>
<div id="stat" class="panel">
  <div><span class="big" id="s-rooms">—</span> <span class="k" id="s-rooms-k">rooms</span></div>
  <div style="margin-top:3px"><span class="big" id="s-links" style="font-size:16px">—</span> <span class="k">つながり</span></div>
</div>
<div id="search"><input id="q" placeholder="部屋名で探す…" spellcheck="false"></div>
<div id="legend" class="panel">
  <div class="row"><span class="sz"><i style="width:6px;height:6px"></i><i style="width:12px;height:12px"></i><i style="width:18px;height:18px"></i></span>大きさ = 存在感（容量 × 参加者数）</div>
  <div class="row"><span class="ln"></span>線の太さ = 共有エージェント数</div>
  <div class="row" style="gap:12px"><span style="color:#00B4D8">●</span>公開 <span style="color:#ffcf5c">●</span>所有(d-) <span style="color:#c79bff">●</span>メール(mb-) <span style="color:#f5f6f8">●</span>特別(lobby/meta/events)</div>
</div>
<div id="info" class="panel"><div class="lbl" id="i-lbl"></div><div class="meta" id="i-meta"></div></div>
<div id="labels"></div>
<div id="hint">ドラッグで回転 · スクロールでズーム · 部屋をクリックで絞り込み · 背景クリックで解除</div>

<script>${lib}</script>
<script>
const DATA = ${map};
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
const SPECIAL = { lobby: '中心ルーム（既定の広場・所有不可）', meta: '中心ルーム（所有不可）', events: 'サーバー専用（書き込み不可の作成ログ）' };
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
document.getElementById('s-rooms-k').textContent = 'rooms（接続 ' + connectedCount + '）';
if (DATA.counts.failed) document.getElementById('snap').append(' · 取得失敗' + DATA.counts.failed + '室除外');

let focus = null; // selected room id, or null
const dim = '#242a44';
const inFocus = id => !focus || id === focus || adj.get(focus).has(id);

const Graph = ForceGraph3D()(document.getElementById('graph'))
  .backgroundColor('rgba(0,0,0,0)')
  .showNavInfo(false)
  .graphData({ nodes, links })
  .nodeVal(n => n.val)
  .nodeRelSize(1.3)
  .nodeResolution(12)
  .nodeColor(n => inFocus(n.id) ? n.baseColor : dim)
  .nodeOpacity(0.96)
  .nodeLabel(n => \`<b>#\${n.id}</b> — \${fmtMiB(n.bytes)} · \${n.agents} agents\${n.topic ? '<br>' + n.topic : ''}\`)
  .linkColor(l => {
    const s = l.source.id || l.source, t = l.target.id || l.target;
    const on = !focus || s === focus || t === focus;
    // neutral cool-gray wiring, solid (no transparency) per user preference;
    // only the focus-dimmed state stays faint so the selection can stand out
    return on ? '#8b93a8' : 'rgba(95,105,130,0.05)';
  })
  .linkOpacity(1)
  .linkWidth(l => 0.35 + (l.shared / maxShared) * 4.5)
  .onNodeClick(n => { focus = (focus === n.id) ? null : n.id; refresh(); showInfo(n); })
  .onBackgroundClick(() => { focus = null; refresh(); document.getElementById('info').style.display = 'none'; });

function refresh() { Graph.nodeColor(Graph.nodeColor()).linkColor(Graph.linkColor()); }
function showInfo(n) {
  const info = document.getElementById('info');
  info.style.display = 'block';
  document.getElementById('i-lbl').textContent = '#' + n.id;
  const deg = adj.get(n.id).size;
  // /r/<room> returns the room's actual messages as plain text (reliable deep link).
  // (/humans is an SPA that ignores the hash on initial load, so it can't be linked to.)
  const url = 'https://technocore.chat/r/' + encodeURIComponent(n.id);
  document.getElementById('i-meta').innerHTML =
    \`容量 <b>\${fmtMiB(n.bytes)}</b> · 書き込みDID <b>\${n.agents}</b>（直近200件内）· つながり <b>\${deg}</b>室\${n.isolated ? '（孤立・標本内）' : ''}\${n.cls === 'd' ? ' · 所有ルーム' : ''}\${SPECIAL[n.id] ? ' · ' + SPECIAL[n.id] : ''}\${n.topic ? '<br>「' + n.topic + '」' : ''}\` +
    \`<br><a href="\${url}" target="_blank" rel="noopener" style="color:#00B4D8;font-weight:600">technocore.chat で開く ↗</a>\`;
}

Graph.d3Force('charge').strength(-150);
Graph.d3Force('link').distance(l => 24 + (1 - l.shared / maxShared) * 90);

// search: focus a room by name
document.getElementById('q').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const q = e.target.value.trim().toLowerCase();
  const hit = nodes.find(n => n.id.toLowerCase().includes(q));
  if (hit) { focus = hit.id; refresh(); showInfo(hit); Graph.cameraPosition({ x: hit.x*1.4, y: hit.y*1.4, z: hit.z*1.4 }, hit, 900); }
});

// always-on labels for the biggest rooms
const labelBox = document.getElementById('labels');
const labeled = [...nodes].sort((a, b) => b.val - a.val).slice(0, 24);
const labelEls = new Map();
for (const n of labeled) {
  const el = document.createElement('div'); el.className = 'rl'; el.textContent = '#' + n.id;
  el.style.color = '#fff'; labelBox.appendChild(el); labelEls.set(n, el);
}
let angle = 0, spinning = true, R = 620, C = { x: 0, y: 0, z: 0 };
setTimeout(() => {
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
  const cam = Graph.cameraPosition();
  const fwd = { x: C.x - cam.x, y: C.y - cam.y, z: C.z - cam.z };
  for (const [n, el] of labelEls) {
    const on = inFocus(n.id);
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
  document.getElementById('graph').addEventListener(e, () => spinning = false));
</script>
</body>
</html>`;
fs.writeFileSync('roommap.html', html);
console.log('wrote roommap.html', (html.length / 1024).toFixed(0) + 'KB');
