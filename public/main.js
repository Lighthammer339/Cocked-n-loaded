'use strict';
// BALLISTIC client: menus, networking, rendering, input.
const W = 640, H = 360;
const $ = s => document.querySelector(s);
const cv = $('#screen'), g = cv.getContext('2d');
g.imageSmoothingEnabled = false;

function resize() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = Math.floor(W * s) + 'px';
  cv.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ helpers
const key = (q, r) => q + ',' + r;
const hexDist = (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
const tileDist = (q, r) => Math.hypot(Math.sqrt(3) * (q + r / 2), 1.5 * r) / Math.sqrt(3);
const shotRange = b => Math.min(1 + b, 7);
const BX = 320, BY = 184;
const tx = (q, r) => BX + 24 * (q + r / 2);
const ty = (q, r) => BY + 21 * r;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = t => Math.max(0, Math.min(1, t));
const now = () => performance.now();

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

// ------------------------------------------------------------------ app / net
const App = { screen: 'menu', myId: null, name: '', room: null, ws: null, connected: false, lastOver: null };
let G = null;

function connect() {
  return new Promise((res, rej) => {
    if (App.ws && App.ws.readyState === 1) return res();
    if (!location.host) return rej(new Error('Open the game via the server: run "python server.py" then visit http://localhost:8080'));
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    App.ws = ws;
    ws.onopen = () => { App.connected = true; res(); };
    ws.onerror = () => rej(new Error('Could not reach the server'));
    ws.onclose = () => {
      const was = App.connected;
      App.connected = false; App.ws = null; App.room = null; G = null;
      if (was) { toast('DISCONNECTED FROM SERVER'); show('menu'); Sound.play('menu'); }
    };
    ws.onmessage = e => onMessage(JSON.parse(e.data));
  });
}
const send = o => { if (App.ws && App.ws.readyState === 1) App.ws.send(JSON.stringify(o)); };
setInterval(() => send({ t: 'ping' }), 25000); // keeps hosting proxies from dropping idle sockets

function onMessage(m) {
  switch (m.t) {
    case 'welcome': App.myId = m.id; App.name = m.name; break;
    case 'rooms': renderRoomList(m.rooms); break;
    case 'room':
      App.room = m.room;
      if (['menu', 'how', 'lobby'].includes(App.screen)) { show('room'); $('#chatLog').innerHTML = ''; }
      if (App.screen === 'room') renderRoom();
      break;
    case 'left': App.room = null; show('lobby'); break;
    case 'error': toast(m.msg.toUpperCase()); break;
    case 'chat': addChat(m); break;
    case 'gameStart': startGame(m); break;
    case 'turn': if (G) onTurn(m); break;
    case 'locked': if (G) G.players.forEach(p => (p.locked = m.ids.includes(p.id))); break;
    case 'result': if (G) onResult(m); break;
    case 'over': if (G) onOver(m); break;
  }
}

// ------------------------------------------------------------------ screens
const SCREENS = ['menu', 'how', 'lobby', 'room', 'over'];
function show(name) {
  App.screen = name;
  SCREENS.forEach(s => ($('#' + s).hidden = s !== name));
}

const nick = $('#nick');
try { nick.value = localStorage.getItem('ballistic.nick') || ''; } catch (e) {}

document.addEventListener('pointerdown', () => { Sound.init(); Sound.play(G ? 'battle' : 'menu'); });
document.addEventListener('click', e => { if (e.target.closest('button')) Sound.sfx('click'); });

function updateMusicLabels() {
  $('#btnMusic').textContent = 'MUSIC: ' + (Sound.musicOn ? 'ON' : 'OFF');
  $('#muteBtn').classList.toggle('off', !Sound.musicOn);
}
$('#btnMusic').onclick = $('#muteBtn').onclick = () => { Sound.init(); Sound.setMusic(!Sound.musicOn); updateMusicLabels(); };
updateMusicLabels();

$('#btnPlay').onclick = async () => {
  Sound.init(); Sound.play('menu');
  const name = nick.value.trim() || 'Dick' + Math.floor(Math.random() * 900 + 100);
  nick.value = name;
  try { localStorage.setItem('ballistic.nick', name); } catch (e) {}
  try {
    await connect();
    send({ t: 'hello', name });
    $('#roomName').value = `${name}'s room`;
    show('lobby');
  } catch (err) { toast(err.message.toUpperCase(), 5000); }
};
nick.addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnPlay').click(); });
$('#btnHow').onclick = () => { Sound.init(); Sound.play('menu'); show('how'); };
document.querySelectorAll('.back').forEach(b => (b.onclick = () => show('menu')));

// lobby
let createTurnSec = 4;
$('#turnSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  createTurnSec = +b.dataset.v;
  $('#turnSeg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
});
$('#btnCreate').onclick = () => send({ t: 'create', name: $('#roomName').value, turnSec: createTurnSec, public: $('#roomPublic').checked });
$('#btnJoin').onclick = () => { const c = $('#joinCode').value.trim(); if (c) send({ t: 'join', code: c }); };
$('#joinCode').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btnJoin').click(); });

function renderRoomList(rooms) {
  const el = $('#roomList');
  el.innerHTML = '';
  if (!rooms.length) {
    const d = document.createElement('div');
    d.className = 'empty'; d.textContent = 'NO ROOMS YET. CREATE ONE!';
    el.appendChild(d); return;
  }
  for (const r of rooms) {
    const d = document.createElement('div');
    d.className = 'item clickable';
    const name = document.createElement('span'); name.className = 'grow'; name.textContent = r.name;
    const info = document.createElement('span'); info.className = 'tag' + (r.state !== 'lobby' ? ' busy' : '');
    info.textContent = r.state !== 'lobby' ? 'IN GAME' : `${r.count}/${r.max} ${r.turnSec}s`;
    d.append(name, info);
    d.onclick = () => send({ t: 'join', code: r.code });
    el.appendChild(d);
  }
}

// room
function makeIcon(color) {
  const c = document.createElement('canvas');
  c.width = 14; c.height = 19;
  const x = c.getContext('2d');
  x.drawImage(SPR.ball[color], 0, 13); x.drawImage(SPR.ball[color], 8, 13);
  x.drawImage(SPR.dick[color].normal, 0, 0);
  return c;
}

function renderRoom() {
  const r = App.room; if (!r) return;
  const host = r.host === App.myId;
  $('#roomTitle').textContent = r.name.toUpperCase();
  $('#roomCode').textContent = r.code;
  document.querySelectorAll('.hostonly').forEach(e => (e.hidden = !host));
  document.querySelectorAll('.guestonly').forEach(e => (e.hidden = host));
  $('#turnInfo').textContent = `TURN TIME: ${r.turnSec}s`;
  $('#roomTurnSeg').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === r.turnSec));
  $('#btnStart').disabled = r.players.length < 2;
  $('#btnBot').disabled = r.players.length >= 6;
  const el = $('#playerList');
  el.innerHTML = '';
  for (const p of r.players) {
    const d = document.createElement('div');
    d.className = 'item';
    const name = document.createElement('span'); name.className = 'grow';
    name.textContent = p.name + (p.id === App.myId ? ' (YOU)' : '');
    name.style.color = PLAYER_COLORS[p.color].css;
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = p.id === r.host ? 'HOST' : p.bot ? 'BOT' : '';
    d.append(makeIcon(p.color), name, tag);
    if (p.bot && host) {
      const k = document.createElement('button'); k.textContent = 'X';
      k.onclick = () => send({ t: 'kick', id: p.id });
      d.appendChild(k);
    }
    el.appendChild(d);
  }
  for (let i = r.players.length; i < 6; i++) {
    const d = document.createElement('div'); d.className = 'item'; d.style.opacity = .35;
    d.textContent = 'EMPTY SLOT'; el.appendChild(d);
  }
}
$('#btnBot').onclick = () => send({ t: 'addBot' });
$('#btnStart').onclick = () => send({ t: 'start' });
$('#btnLeave').onclick = () => send({ t: 'leave' });
$('#roomTurnSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) send({ t: 'settings', turnSec: +b.dataset.v }); });
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault();
  const v = $('#chatInput').value.trim();
  if (v) send({ t: 'chat', text: v });
  $('#chatInput').value = '';
});
function addChat(m) {
  const log = $('#chatLog');
  const d = document.createElement('div');
  if (m.sys) { d.className = 'sys'; d.textContent = '* ' + m.text; }
  else {
    const n = document.createElement('span');
    n.textContent = m.name + ': '; n.style.color = PLAYER_COLORS[m.color].css;
    d.append(n, document.createTextNode(m.text));
  }
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}

$('#btnBackRoom').onclick = () => {
  G = null;
  Sound.play('menu');
  if (App.room) { show('room'); renderRoom(); } else show('lobby');
};

// ------------------------------------------------------------------ game state
function startGame(m) {
  G = {
    tiles: [], tileMap: new Map(), players: new Map(), loose: new Map(),
    radius: 6.8, warn: null, turn: 0, turnMs: m.turnSec * 1000, turnEnd: 0,
    phase: 'wait', mode: 'move', choice: null, hover: null,
    projectiles: [], particles: [], texts: [], splats: [], flying: [], falling: [], timeline: [],
    banner: null, shake: 0, suddenDeath: m.suddenDeath, lastSec: 0,
  };
  m.tiles.forEach(([q, r]) => {
    const t = { q, r, x: tx(q, r), y: ty(q, r), shade: (((q - r) % 3) + 3) % 3, dist: tileDist(q, r) };
    G.tiles.push(t); G.tileMap.set(key(q, r), t);
  });
  G.tiles.sort((a, b) => a.r - b.r || a.q - b.q);
  m.players.forEach(p => G.players.set(p.id, {
    ...p, q: 0, r: 0, balls: 2, alive: true, x: 0, y: 0, hop: 0,
    anim: null, flash: 0, squash: 0, locked: false, dying: null, blink: Math.random() * 3000,
  }));
  syncState(m.state);
  banner('GET READY!', 2200);
  show('game');
  Sound.play('battle');
}

function syncState(s) {
  for (const sp of s.players) {
    const p = G.players.get(sp.id); if (!p) continue;
    if (p.alive && !sp.alive && !p.dying) p.dying = { t0: now(), how: 'nuts' };
    Object.assign(p, { q: sp.q, r: sp.r, balls: sp.balls, alive: sp.alive });
    p.anim = null; p.x = tx(p.q, p.r); p.y = ty(p.q, p.r); p.hop = 0;
  }
  G.loose = new Map(s.loose.map(([q, r, c]) => [key(q, r), c]));
  G.radius = s.radius; G.warn = s.warn;
  G.tiles = G.tiles.filter(t => t.dist <= s.radius);
  G.tileMap = new Map(G.tiles.map(t => [key(t.q, t.r), t]));
}

function flushTimeline() {
  G.timeline.sort((a, b) => a.t - b.t).forEach(e => e.fn());
  G.timeline = [];
}

function onTurn(m) {
  flushTimeline();
  syncState(m.state);
  G.turn = m.n; G.turnEnd = now() + m.ms; G.phase = 'plan'; G.choice = null; G.lastSec = 0;
  G.players.forEach(p => (p.locked = false));
  const me = myPlayer();
  if (me && me.alive) Sound.sfx('turn');
  if (m.n === G.suddenDeath) banner('SUDDEN DEATH!', 1800, '#ff9a1f');
  else if (m.state.warn != null) banner('ARENA CRUMBLING!', 1200, '#ff9a1f');
}

function onResult(m) {
  G.phase = 'anim';
  G.choice = null;
  G.players.forEach(p => (p.locked = false));
  const T = now();
  const at = (ms, fn) => G.timeline.push({ t: T + ms, fn });
  const P = id => G.players.get(id);

  for (const mv of m.moves) {
    const p = P(mv.id);
    p.anim = { fx: tx(...mv.from), fy: ty(...mv.from), tx: tx(...mv.to), ty: ty(...mv.to), t0: T, dur: 340, blocked: mv.blocked };
    if (mv.blocked) at(150, () => {
      const x = lerp(p.anim ? p.anim.fx : p.x, tx(...mv.to), 0.45), y = lerp(p.anim ? p.anim.fy : p.y, ty(...mv.to), 0.45) - 12;
      floatText('BONK!', x, y, '#ffe14a'); burst(x, y, '#ffe14a', 6); Sound.sfx('bonk'); G.shake = Math.max(G.shake, 2);
    });
  }
  if (m.moves.length) Sound.sfx('move');
  at(345, () => G.players.forEach(p => { if (p.anim) { p.x = p.anim.blocked ? p.anim.fx : p.anim.tx; p.y = p.anim.blocked ? p.anim.fy : p.anim.ty; p.anim = null; p.hop = 0; } }));

  for (const pk of m.pickups) at(350, () => {
    const p = P(pk.id);
    G.loose.delete(key(...pk.at)); p.balls += pk.count;
    floatText(`+${pk.count} BALL`, tx(...pk.at), ty(...pk.at) - 24, '#7ff7ff');
    burst(tx(...pk.at), ty(...pk.at), '#7ff7ff', 10);
    Sound.sfx('pickup');
  });

  if (m.shots.length) at(380, () => {
    Sound.sfx('shoot');
    for (const s of m.shots) {
      const p = P(s.id); p.squash = now();
      G.projectiles.push({ fx: tx(...s.from), fy: ty(...s.from) - 14, tx: tx(...s.to), ty: ty(...s.to), t0: now(), dur: 450, h: 18 + hexDist({ q: s.from[0], r: s.from[1] }, { q: s.to[0], r: s.to[1] }) * 7 });
    }
  });

  if (m.shots.length) at(830, () => {
    let anyHit = false;
    for (const s of m.shots) {
      const x = tx(...s.to), y = ty(...s.to);
      addSplat(x, y);
      burst(x, y - 4, '#fffbe8', 14, 2.2);
      for (const vid of s.hits) {
        const v = P(vid); anyHit = true;
        v.flash = now(); v.balls = Math.max(0, v.balls - 1);
        floatText('SPLAT!', x, y - 30, '#ff7af2');
      }
    }
    Sound.sfx(anyHit ? 'hit' : 'splat');
    if (anyHit) { Sound.sfx('splat'); G.shake = Math.max(G.shake, 4); }
    for (const d of m.drops) {
      const v = P(d.id), fx = tx(...d.from), fy = ty(...d.from);
      const out = !d.to, dir = Math.random() < 0.5 ? -1 : 1;
      G.flying.push({ fx, fy, tx: out ? fx + dir * 140 : tx(...d.to), ty: out ? fy - 60 : ty(...d.to), t0: now(), dur: out ? 700 : 480, color: v.color, arc: out ? 70 : 26 });
    }
  });
  for (const d of m.drops) if (d.to) at(830 + 490, () => { const k = key(...d.to); G.loose.set(k, (G.loose.get(k) || 0) + 1); });

  if (m.deaths.length || m.collapsed) at(1250, () => {
    if (m.collapsed) {
      const keep = [];
      for (const t of G.tiles) (t.dist > m.state.radius ? G.falling.push({ ...t, t0: now() + Math.random() * 250 }) : keep.push(t));
      G.tiles = keep;
      G.tileMap = new Map(keep.map(t => [key(t.q, t.r), t]));
      Sound.sfx('crumble'); G.shake = 7;
    }
    for (const d of m.deaths) {
      const p = P(d.id);
      p.dying = { t0: now(), how: d.how }; p.alive = false;
      floatText(d.how === 'fell' ? 'AAAAAH!' : 'NUTLESS!', p.x, p.y - 30, '#ff5a4a');
      if (d.id === App.myId) banner('YOU GOT CASTRATED', 1600, '#ff5a4a');
    }
    if (m.deaths.length) Sound.sfx('death');
  });

  at(1500, () => { syncState(m.state); G.phase = 'wait'; });
}

function onOver(m) {
  flushTimeline();
  App.lastOver = m;
  const won = m.winner && m.winner.id === App.myId;
  banner(won ? 'YOU WIN!' : m.winner ? `${m.winner.name.toUpperCase()} WINS!` : 'DRAW!', 4000, won ? '#ffe14a' : '#ff7af2');
  Sound.sfx(won ? 'win' : 'lose');
  setTimeout(() => {
    if (!G) return;
    $('#overTitle').textContent = won ? 'YOU WIN!' : m.winner ? `${m.winner.name} WINS!` : 'DRAW!';
    const ol = $('#ranking'); ol.innerHTML = '';
    for (const p of m.ranking) {
      const li = document.createElement('li');
      li.textContent = `${p.name}${p.died ? ` - out T${p.died}` : ` - ${p.balls} balls`}`;
      li.style.color = PLAYER_COLORS[p.color].css;
      ol.appendChild(li);
    }
    show('over');
  }, 2200);
}

const myPlayer = () => G && G.players.get(App.myId);

// ------------------------------------------------------------------ effects
function floatText(text, x, y, color) { G.texts.push({ text, x, y, color, t0: now(), dur: 1000 }); }
function banner(text, dur, color = '#ffe14a') { if (G) G.banner = { text, t0: now(), dur, color }; }
function burst(x, y, color, n, spd = 1.5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * spd + 0.5;
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 1, color });
  }
}
function addSplat(x, y) {
  const c = document.createElement('canvas'); c.width = 20; c.height = 12;
  const s = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.7) * 7;
    const px = Math.round(10 + Math.cos(a) * r * 1.3), py = Math.round(6 + Math.sin(a) * r * 0.6);
    s.fillStyle = Math.random() < 0.2 ? '#d8d2c0' : '#fffbe8';
    s.fillRect(px, py, 1, 1);
  }
  G.splats.push({ c, x: x - 10, y: y - 6, t0: now() });
}

// ------------------------------------------------------------------ input
let mouse = { x: -1, y: -1 };
let hudButtons = [];

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
function tileAt(x, y) {
  if (!G) return null;
  let best = null, bd = 13;
  for (const t of G.tiles) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } }
  return best;
}
cv.addEventListener('mousemove', e => {
  mouse = canvasPos(e);
  if (G) G.hover = tileAt(mouse.x, mouse.y);
});
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (!G || App.screen !== 'game') return;
  const p = canvasPos(e);
  const btn = hudButtons.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
  if (btn) { btn.fn(); return; }
  const t = tileAt(p.x, p.y);
  if (t) choose(e.button === 2 ? 'shoot' : G.mode, t);
});
addEventListener('keydown', e => {
  if (!G || App.screen !== 'game') return;
  const k = e.key.toLowerCase();
  if (k === 'q' || k === '1') setMode('move');
  else if (k === 'e' || k === '2') setMode('shoot');
  else if (k === ' ') { e.preventDefault(); setMode(G.mode === 'move' ? 'shoot' : 'move'); }
  else if (k === 's') { const me = myPlayer(); if (me) choose('stay', me); }
});
function setMode(m) { if (G.mode !== m) { G.mode = m; Sound.sfx('hover'); } }

function choose(mode, t) {
  const me = myPlayer();
  if (!me || !me.alive || G.phase !== 'plan') return;
  const d = hexDist(me, t), range = shotRange(me.balls);
  let a = null;
  if (d === 0 || mode === 'stay') a = { type: 'stay', q: me.q, r: me.r };
  else if (mode === 'move' && d === 1) a = { type: 'move', q: t.q, r: t.r };
  else if (d <= range) a = { type: 'shoot', q: t.q, r: t.r };
  if (!a) { Sound.sfx('bonk'); return; }
  G.choice = a;
  send({ t: 'act', a });
  Sound.sfx('select');
}

// ------------------------------------------------------------------ rendering
function bevelBox(x, y, w, h) {
  g.fillStyle = 'rgba(20,8,56,.88)'; g.fillRect(x, y, w, h);
  g.fillStyle = '#8f7bff'; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
  g.fillStyle = '#2a0f6e'; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
}

function drawDick(p, x, y, t, o = {}) {
  let variant = 'normal';
  if (p.flash && t - p.flash < 450 && Math.floor((t - p.flash) / 60) % 2 === 0) variant = 'flash';
  else if (p.squash && t - p.squash < 350) variant = 'angry';
  else if ((t + p.blink) % 3200 < 120) variant = 'blink';
  if (o.ghost) variant = 'ghost';
  const bob = o.noBob ? 0 : Math.round(Math.sin(t * 0.006 + p.color * 1.3));
  let top = Math.round(y - 14 + bob - (o.hop || 0));
  x = Math.round(x);
  if (!o.noShadow) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 6, Math.round(y) + 4, 12, 2); }
  const nb = Math.min(p.balls, 2), ballImg = variant === 'flash' ? SPR.ballFlash : SPR.ball[p.color];
  if (nb >= 1) g.drawImage(ballImg, x - 7, top + 13);
  if (nb >= 2) g.drawImage(ballImg, x + 1, top + 13);
  const spr = SPR.dick[p.color][variant];
  if (p.squash && t - p.squash < 200) g.drawImage(spr, x - 8, top + 3, 16, 12);
  else g.drawImage(spr, x - 7, top);
  if (p.balls > 2 && !o.ghost) pixText('x' + p.balls, x + 8, top + 12, '#ffe14a', { size: 8 });
  return top;
}

function drawCheck(x, y, col) {
  g.fillStyle = '#1a0b1e'; g.fillRect(x - 1, y - 1, 9, 7);
  g.fillStyle = col;
  [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]].forEach(([a, b]) => g.fillRect(x + a, y + b, 1, 1));
}

function drawGame(t, dt) {
  const me = myPlayer();
  // timeline
  while (G.timeline.length) {
    G.timeline.sort((a, b) => a.t - b.t);
    if (G.timeline[0].t > t) break;
    G.timeline.shift().fn();
  }
  // shake
  G.shake *= Math.pow(0.85, dt);
  const sx = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake * 2) : 0;
  const sy = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake * 2) : 0;
  g.save(); g.translate(sx, sy);

  // board base shadow
  g.fillStyle = 'rgba(10,2,30,.45)';
  g.beginPath(); g.ellipse(BX, BY + 12, 24 * G.radius + 18, 21 * G.radius + 18, 0, 0, Math.PI * 2); g.fill();

  // falling tiles
  G.falling = G.falling.filter(f => {
    const k = clamp01((t - f.t0) / 900);
    if (k >= 1) return false;
    if (k <= 0) { g.drawImage(SPR.tileWarn[0], f.x - 12, f.y - 14); return true; }
    g.globalAlpha = 1 - k;
    g.drawImage(SPR.tileWarn[0], f.x - 12, Math.round(f.y - 14 + k * k * 220));
    g.globalAlpha = 1;
    return true;
  });

  // tiles
  const warnOn = Math.floor(t / 220) % 2;
  for (const tile of G.tiles) {
    const warned = G.warn != null && tile.dist > G.warn;
    const img = warned ? SPR.tileWarn[warnOn] : SPR.tiles[tile.shade];
    const jig = warned && warnOn ? (Math.random() < 0.5 ? -1 : 1) : 0;
    g.drawImage(img, tile.x - 12 + jig, tile.y - 14);
  }

  // planning overlays
  const planning = G.phase === 'plan' && me && me.alive;
  if (planning) {
    const range = shotRange(me.balls);
    for (const tile of G.tiles) {
      const d = hexDist(me, tile);
      if (G.mode === 'move' && d === 1) g.drawImage(SPR.over.move, tile.x - 12, tile.y - 14);
      else if (G.mode === 'shoot' && d >= 1 && d <= range) g.drawImage(SPR.over.shoot, tile.x - 12, tile.y - 14);
    }
    if (G.hover && hexDist(me, G.hover) <= range) g.drawImage(SPR.over.hover, G.hover.x - 12, G.hover.y - 14);
    if (G.choice && G.choice.type !== 'stay') g.drawImage(SPR.over.target, tx(G.choice.q, G.choice.r) - 12, ty(G.choice.q, G.choice.r) - 14);
  }

  // splats (fade out)
  G.splats = G.splats.filter(s => {
    const a = 1 - (t - s.t0) / 9000;
    if (a <= 0) return false;
    g.globalAlpha = Math.min(1, a * 1.5); g.drawImage(s.c, s.x, s.y); g.globalAlpha = 1;
    return true;
  });

  // loose balls + players depth-sorted
  const ents = [];
  for (const [k, c] of G.loose) {
    const [q, r] = k.split(',').map(Number);
    ents.push({ y: ty(q, r), draw: () => {
      const x = tx(q, r), y = ty(q, r), b = Math.round(Math.abs(Math.sin(t * 0.005 + q + r)) * 4);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 3, y + 3, 6, 2);
      g.drawImage(SPR.neutralBall, x - 3, y - 4 - b);
      if (c > 1) pixText('x' + c, x + 4, y - 10, '#ffe14a');
    } });
  }
  for (const p of G.players.values()) {
    if (p.anim) {
      const a = p.anim, k = clamp01((t - a.t0) / a.dur);
      const m = a.blocked ? (k < 0.5 ? k * 2 : (1 - k) * 2) * 0.45 : ease(k);
      p.x = lerp(a.fx, a.tx, m); p.y = lerp(a.fy, a.ty, m); p.hop = Math.sin(Math.PI * k) * (a.blocked ? 5 : 9);
    }
    if (!p.alive) {
      if (!p.dying) continue;
      const k = (t - p.dying.t0) / 1600;
      if (k >= 1) continue;
      ents.push({ y: p.y + 100, draw: () => {
        g.globalAlpha = 1 - k;
        if (p.dying.how === 'fell') drawDick(p, p.x, p.y + k * k * 220, t, { noShadow: true, noBob: true });
        else drawDick({ ...p, balls: 0 }, p.x + Math.sin(k * 12) * 4, p.y - k * 40, t, { ghost: true, noShadow: true });
        g.globalAlpha = 1;
      } });
      continue;
    }
    ents.push({ y: p.y, draw: () => {
      // move preview ghost
      if (planning && p === me && G.choice && G.choice.type === 'move') {
        g.globalAlpha = 0.4; drawDick(p, tx(G.choice.q, G.choice.r), ty(G.choice.q, G.choice.r), t, { noShadow: true }); g.globalAlpha = 1;
      }
      const top = drawDick(p, p.x, p.y, t, { hop: p.hop });
      if (p.id === App.myId) {
        const ay = top - 9 + Math.round(Math.sin(t * 0.01) * 2);
        g.fillStyle = '#1a0b1e'; g.fillRect(p.x - 4, ay - 1, 9, 3); g.fillRect(p.x - 3, ay + 2, 7, 2); g.fillRect(p.x - 1, ay + 4, 3, 2);
        g.fillStyle = '#ffffff'; g.fillRect(p.x - 3, ay, 7, 1); g.fillRect(p.x - 2, ay + 1, 5, 2); g.fillRect(p.x - 1, ay + 3, 3, 1); g.fillRect(p.x, ay + 4, 1, 1);
      } else if (G.phase === 'plan' && p.locked) drawCheck(p.x - 3, top - 8, '#7ff7ff');
      if (planning && p === me && G.choice && G.choice.type === 'stay') pixText('ZZ', p.x + 7, top - 4, '#b9a8ff');
    } });
  }
  ents.sort((a, b) => a.y - b.y).forEach(e => e.draw());

  // shot preview arc + crosshair
  if (planning && G.choice && G.choice.type === 'shoot') {
    const fx = me.x, fy = me.y - 14, gx = tx(G.choice.q, G.choice.r), gy = ty(G.choice.q, G.choice.r);
    const h = 18 + hexDist(me, G.choice) * 7;
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let i = 1; i < 12; i++) {
      const k = i / 12 + ((t / 600) % (1 / 12));
      g.fillRect(Math.round(lerp(fx, gx, k)), Math.round(lerp(fy, gy, k) - Math.sin(Math.PI * k) * h), 1, 1);
    }
    const pulse = Math.floor(t / 150) % 2;
    g.fillStyle = pulse ? '#ff7af2' : '#ffffff';
    g.fillRect(gx - 7, gy, 4, 1); g.fillRect(gx + 4, gy, 4, 1); g.fillRect(gx, gy - 7, 1, 4); g.fillRect(gx, gy + 4, 1, 4);
  }

  // projectiles
  G.projectiles = G.projectiles.filter(pr => {
    const k = (t - pr.t0) / pr.dur;
    if (k >= 1) return false;
    for (let i = 0; i < 5; i++) {
      const kk = Math.max(0, k - i * 0.03);
      const x = Math.round(lerp(pr.fx, pr.tx, kk)), y = Math.round(lerp(pr.fy, pr.ty, kk) - Math.sin(Math.PI * kk) * pr.h);
      const s = i === 0 ? 4 : i < 3 ? 2 : 1;
      g.fillStyle = i === 0 ? '#1a0b1e' : '#e8e2d0';
      if (i === 0) g.fillRect(x - 3, y - 3, s + 2, s + 2);
      g.fillStyle = i === 0 ? '#fffbe8' : '#e8e2d0';
      g.fillRect(x - s / 2 - (i === 0 ? 0 : 0), y - s / 2, s, s);
    }
    return true;
  });

  // flying (knocked off) balls
  G.flying = G.flying.filter(f => {
    const k = (t - f.t0) / f.dur;
    if (k >= 1) return false;
    const x = lerp(f.fx, f.tx, k), y = lerp(f.fy, f.ty, k) - Math.sin(Math.PI * k) * f.arc;
    g.drawImage(SPR.ball[f.color], Math.round(x - 3), Math.round(y - 6));
    return true;
  });

  // particles
  G.particles = G.particles.filter(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.12 * dt; p.life -= 0.025 * dt;
    if (p.life <= 0) return false;
    g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.life > 0.5 ? 2 : 1, p.life > 0.5 ? 2 : 1);
    return true;
  });

  // floating texts
  G.texts = G.texts.filter(ft => {
    const k = (t - ft.t0) / ft.dur;
    if (k >= 1) return false;
    pixText(ft.text, Math.round(ft.x), Math.round(ft.y - k * 18), ft.color, { align: 'center' });
    return true;
  });
  g.restore();

  drawHud(t, me);
}

function drawHud(t, me) {
  hudButtons = [];
  // timer bar
  if (G.phase === 'plan') {
    const rem = Math.max(0, G.turnEnd - t), k = rem / G.turnMs;
    g.fillStyle = '#1a0b1e'; g.fillRect(218, 5, 204, 10);
    g.fillStyle = '#3a1f8a'; g.fillRect(220, 7, 200, 6);
    g.fillStyle = rem < 1000 ? (Math.floor(t / 100) % 2 ? '#ff5a4a' : '#ffe14a') : k < 0.5 ? '#ffc21f' : '#7ff7ff';
    g.fillRect(220, 7, Math.round(200 * k), 6);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(220, 7, Math.round(200 * k), 1);
    const sec = Math.ceil(rem / 1000);
    pixText(String(sec), 430, 6, rem < 1000 ? '#ff5a4a' : '#ffffff');
    if (sec !== G.lastSec) { if (G.lastSec && sec <= 3 && sec > 0) Sound.sfx('tick'); G.lastSec = sec; }
  } else if (G.turn > 0) {
    pixText('RESOLVING...', 320, 6, '#b9a8ff', { align: 'center' });
  }

  // left panel: players
  const ps = [...G.players.values()].sort((a, b) => a.color - b.color);
  bevelBox(4, 22, 144, 18 + ps.length * 28);
  pixText('PLAYERS', 12, 29, '#ffe14a');
  ps.forEach((p, i) => {
    const y = 44 + i * 28;
    g.globalAlpha = p.alive ? 1 : 0.35;
    g.drawImage(SPR.dick[p.color][p.alive ? 'normal' : 'ghost'], 10, y);
    if (p.balls >= 1) g.drawImage(SPR.ball[p.color], 10, y + 13);
    if (p.balls >= 2) g.drawImage(SPR.ball[p.color], 18, y + 13);
    pixText(p.name.slice(0, 11).toUpperCase(), 30, y + 2, PLAYER_COLORS[p.color].css);
    if (p.alive) for (let b = 0; b < Math.min(p.balls, 12); b++) g.drawImage(SPR.neutralBall, 30 + b * 7, y + 13);
    else pixText('OUT', 30, y + 13, '#ff5a4a');
    g.globalAlpha = 1;
    if (G.phase === 'plan' && p.locked && p.alive) drawCheck(136, y + 3, '#7ff7ff');
  });

  // right panel
  const X = 492;
  bevelBox(X, 22, 144, 228);
  pixText(`TURN ${G.turn}`, X + 8, 29, '#ffe14a');
  if (G.turn < G.suddenDeath) pixText(`SD IN ${G.suddenDeath - G.turn}`, X + 8, 41, '#b9a8ff');
  else pixText('SUDDEN DEATH', X + 8, 41, Math.floor(t / 300) % 2 ? '#ff9a1f' : '#ff5a4a');
  if (me && me.alive) {
    pixText(`BALLS ${me.balls}`, X + 8, 57, '#ffffff');
    pixText(`RANGE ${shotRange(me.balls)}`, X + 8, 69, '#ffffff');
    const btn = (label, y, active, col, fn) => {
      g.fillStyle = '#1a0b1e'; g.fillRect(X + 7, y - 1, 130, 20);
      g.fillStyle = active ? col : '#3a1f8a'; g.fillRect(X + 8, y, 128, 18);
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(X + 8, y, 128, 2);
      pixText(label, X + 72, y + 5, active ? '#1a0b1e' : '#b9a8ff', { align: 'center', shadow: active ? null : '#1a0b1e' });
      hudButtons.push({ x: X + 8, y, w: 128, h: 18, fn });
    };
    btn('[Q] MOVE', 86, G.mode === 'move', '#7ff7ff', () => setMode('move'));
    btn('[E] SHOOT', 108, G.mode === 'shoot', '#ff7af2', () => setMode('shoot'));
    btn('[S] STAY', 130, G.choice && G.choice.type === 'stay', '#b9a8ff', () => choose('stay', me));
    const c = G.choice;
    pixText('ORDERS:', X + 8, 158, '#ffe14a');
    pixText(!c ? (G.phase === 'plan' ? '...' : '-') : c.type === 'move' ? 'MOVE' : c.type === 'shoot' ? 'SHOOT LOAD' : 'STAY PUT',
      X + 8, 170, c ? (c.type === 'shoot' ? '#ff7af2' : '#7ff7ff') : '#8070c0');
    pixText('LMB: ACT', X + 8, 194, '#8070c0');
    pixText('RMB: SHOOT', X + 8, 206, '#8070c0');
    pixText('SPC: MODE', X + 8, 218, '#8070c0');
    pixText('CLICK SELF', X + 8, 230, '#8070c0');
  } else if (me) {
    pixText('YOU ARE', X + 8, 70, '#ff5a4a');
    pixText('NUTLESS.', X + 8, 82, '#ff5a4a');
    pixText('SPECTATING', X + 8, 106, '#b9a8ff');
  }

  // banner
  if (G.banner) {
    const k = (t - G.banner.t0) / G.banner.dur;
    if (k >= 1) G.banner = null;
    else {
      const pop = k < 0.12 ? 1 + (0.12 - k) * 6 : 1;
      const size = Math.round(16 * pop / 8) * 8;
      g.fillStyle = 'rgba(11,3,38,.6)'; g.fillRect(0, 160, W, 34);
      pixText(G.banner.text, 320, 169 + (16 - size) / 2, Math.floor(t / 120) % 2 ? G.banner.color : '#ffffff', { align: 'center', size });
    }
  }
}

// menu attract mode: a little parade marching along the hills
const parade = PLAYER_COLORS.map((_, i) => ({ id: 'm' + i, color: i, balls: 2, blink: i * 500, x: -40 - i * 70, flash: 0, squash: 0 }));
const menuShots = [];
function drawMenuScene(t, dt) {
  for (const p of parade) {
    p.x += 0.5 * dt;
    if (p.x > W + 30) p.x -= W + 70;
    const hop = Math.abs(Math.sin(t * 0.008 + p.color)) * 6;
    drawDick(p, p.x, 346, t, { hop, noBob: true });
    if (Math.random() < 0.002 * dt) {
      p.squash = t;
      menuShots.push({ fx: p.x, fy: 332, tx: p.x + 80 + Math.random() * 60, ty: 350, t0: t });
    }
  }
  for (let i = menuShots.length - 1; i >= 0; i--) {
    const s = menuShots[i], k = (t - s.t0) / 700;
    if (k >= 1) { menuShots.splice(i, 1); continue; }
    g.fillStyle = '#fffbe8';
    g.fillRect(Math.round(lerp(s.fx, s.tx, k)), Math.round(lerp(s.fy, s.ty, k) - Math.sin(Math.PI * k) * 40), 3, 3);
  }
}

let last = now();
function frame(t) {
  const dt = Math.min(3, (t - last) / 16.67);
  last = t;
  drawBackground(g, W, H, t);
  if (G && (App.screen === 'game' || App.screen === 'over')) drawGame(t, dt);
  else drawMenuScene(t, dt);
  requestAnimationFrame(frame);
}

buildSprites();
buildBackground(W, H);
show('menu');
requestAnimationFrame(frame);
