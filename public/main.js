'use strict';
// BALLISTIC client: menus, networking, rendering, input.
const $ = s => document.querySelector(s);
const cv = $('#screen'), g = cv.getContext('2d');

// Low internal resolution, integer-scaled to the window -> big chunky pixels.
let W = 480, H = 270, SCALE = 4;
function resize() {
  SCALE = Math.max(1, Math.round(innerHeight / 216));   // ~5x pixels on a 1080p screen
  W = Math.ceil(innerWidth / SCALE);
  H = Math.ceil(innerHeight / SCALE);
  cv.width = W; cv.height = H;
  cv.style.width = W * SCALE + 'px';
  cv.style.height = H * SCALE + 'px';
  g.imageSmoothingEnabled = false;
  if (SPR.tiles.length) buildBackground(W, H);
}
let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });

// ------------------------------------------------------------------ helpers
const key = (q, r) => q + ',' + r;
const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const hexDist = (a, b) => { const dq = a.q - b.q, dr = a.r - b.r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2; };
const tileDist = (q, r) => Math.hypot(Math.sqrt(3) * (q + r / 2), 1.5 * r) / Math.sqrt(3);
const tx = (q, r) => 24 * (q + r / 2);
const ty = (q, r) => 21 * r;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const now = () => performance.now();
const P2 = a => ({ q: a[0], r: a[1] });

// tiles strictly between a and b - identical to hex_line() in server.py
function hexLine(a, b) {
  const n = hexDist(a, b), out = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const q = a.q + (b.q - a.q) * t + 1e-6, r = a.r + (b.r - a.r) * t + 2e-6, s = -q - r;
    let rq = Math.round(q), rr = Math.round(r);
    const rs = Math.round(s), dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
    out.push({ q: rq, r: rr });
  }
  return out;
}

function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), ms);
}

// ------------------------------------------------------------------ app / net
const App = { screen: 'menu', myId: null, name: '', room: null, ws: null, connected: false };
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
  $('#muteBtn').hidden = name === 'game';   // in game: M key
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
    $('#roomName').value = `${name}'s dump`;
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
  c.width = 16; c.height = 22;
  const x = c.getContext('2d');
  x.drawImage(SPR.ball[color], 0, 15); x.drawImage(SPR.ball[color], 8, 15);
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

// ------------------------------------------------------------------ rules (mirror server.py)
const walkable = t => G.tileMap.has(key(t.q, t.r)) && !G.junk.has(key(t.q, t.r));
const rangeOf = p => Math.min(1 + p.balls + (p.viagra > 0 ? 3 : 0), 9);
const clearShot = (a, b) => hexLine(a, b).every(t => !TALL_JUNK.includes(G.junk.get(key(t.q, t.r))));
function canMove(p, t) {
  if (!walkable(t)) return false;
  const d = hexDist(p, t);
  if (d === 1) return true;
  return d === 2 && p.lube > 0 && DIRS.some(([dq, dr]) => { const m = { q: p.q + dq, r: p.r + dr }; return walkable(m) && hexDist(m, t) === 1; });
}
function canShoot(p, t) {
  const d = hexDist(p, t);
  return walkable(t) && d >= 1 && d <= rangeOf(p) && (p.special === 'dp' || clearShot(p, t));
}
function shotArea(p, t) {
  if (p.special === 'bomb') return [t, ...DIRS.map(([dq, dr]) => ({ q: t.q + dq, r: t.r + dr })).filter(walkable)];
  if (p.special === 'dp') return [...hexLine(p, t).filter(walkable), t];
  return [t];
}

// ------------------------------------------------------------------ game state
function startGame(m) {
  G = {
    tiles: [], tileMap: new Map(), players: new Map(), loose: new Map(), junk: new Map(),
    radius: 6.8, warn: null, turn: 0, turnMs: m.turnSec * 1000, turnEnd: 0,
    phase: 'wait', mode: 'move', choice: null, hover: null,
    projectiles: [], particles: [], texts: [], splats: [], flying: [], falling: [], timeline: [],
    banner: null, shake: 0, suddenDeath: m.suddenDeath, lastSec: 0, cam: { x: 0, y: 0 }, off: { x: 0, y: 0 }, tip: null,
  };
  m.tiles.forEach(([q, r]) => {
    const t = { q, r, x: tx(q, r), y: ty(q, r), shade: hash(q + 50, r + 50, 3) % SPR.tiles.length, dist: tileDist(q, r), worm: hash(q + 50, r + 50, 9) % 11 === 0 };
    G.tiles.push(t); G.tileMap.set(key(q, r), t);
  });
  G.tiles.sort((a, b) => a.r - b.r || a.q - b.q);
  m.players.forEach(p => G.players.set(p.id, {
    ...p, q: 0, r: 0, balls: 2, alive: true, x: 0, y: 0, hop: 0, armor: 0, viagra: 0, lube: 0, infected: 0, frozen: false, special: null,
    anim: null, flash: 0, squash: 0, locked: false, dying: null, blink: Math.random() * 3000,
  }));
  syncState(m.state);
  const me = myPlayer();
  if (me) { G.cam.x = me.x; G.cam.y = me.y; }
  banner('WELCOME TO THE DUMP!', 2300);
  show('game');
  Sound.play('battle');
}

function syncState(s) {
  for (const sp of s.players) {
    const p = G.players.get(sp.id); if (!p) continue;
    if (p.alive && !sp.alive && !p.dying) p.dying = { t0: now(), how: 'nuts' };
    Object.assign(p, sp);
    p.anim = null; p.x = tx(p.q, p.r); p.y = ty(p.q, p.r); p.hop = 0;
  }
  G.loose = new Map(s.loose.map(([q, r, pw]) => [key(q, r), pw]));
  G.junk = new Map(s.junk.map(([q, r, k]) => [key(q, r), k]));
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
  if (me && me.alive) Sound.sfx(me.frozen ? 'freeze' : 'turn');
  if (me && me.alive && me.frozen) banner('BLUE BALLS! YOU ARE FROZEN', 1600, '#7ff7ff');
  else if (m.n === G.suddenDeath) banner('SUDDEN DEATH!', 1800, '#ff9a1f');
  else if (m.state.warn != null) banner('THE DUMP IS COLLAPSING!', 1200, '#ff9a1f');
}

const SPLAT_COL = { monkey: '#b8f080', blue: '#c8ffff', dp: '#ffc8f0' };

function onResult(m) {
  G.phase = 'anim';
  G.choice = null;
  G.players.forEach(p => (p.locked = false));
  const T = now();
  const at = (ms, fn) => G.timeline.push({ t: T + ms, fn });
  const P = id => G.players.get(id);

  for (const mv of m.moves) {
    const p = P(mv.id);
    p.anim = { fx: tx(...mv.from), fy: ty(...mv.from), tx: tx(...mv.to), ty: ty(...mv.to), t0: T, dur: mv.dash ? 420 : 340, blocked: mv.blocked, dash: mv.dash };
    if (mv.dash && !mv.blocked) at(60, () => burst(p.x, p.y + 4, '#c8eaff', 8));
    if (mv.blocked) at(150, () => {
      const x = lerp(tx(...mv.from), tx(...mv.to), 0.45), y = lerp(ty(...mv.from), ty(...mv.to), 0.45) - 14;
      floatText('BONK!', x, y, '#ffd84a'); burst(x, y, '#ffd84a', 6); Sound.sfx('bonk'); G.shake = Math.max(G.shake, 2);
    });
  }
  if (m.moves.length) Sound.sfx('move');
  at(430, () => G.players.forEach(p => { if (p.anim) { p.x = p.anim.blocked ? p.anim.fx : p.anim.tx; p.y = p.anim.blocked ? p.anim.fy : p.anim.ty; p.anim = null; p.hop = 0; } }));

  for (const pk of m.pickups) at(350, () => {
    const p = P(pk.id), x = tx(...pk.at), y = ty(...pk.at);
    G.loose.delete(key(...pk.at)); p.balls += pk.balls;
    floatText(`+${pk.balls} BALL`, x, y - 26, '#ffc8b8');
    burst(x, y, '#ffc8b8', 10);
    pk.powers.forEach((pw, i) => {
      floatText(POWERS[pw].name + '!', x, y - 36 - i * 8, POWERS[pw].color, 1600);
      if (pk.id === App.myId) { banner(POWERS[pw].name + '!', 1500, POWERS[pw].color); G.tip = { pw, until: now() + 5000 }; }
    });
    Sound.sfx(pk.powers.length ? 'power' : 'pickup');
  });

  if (m.shots.length) at(400, () => {
    Sound.sfx('shoot');
    for (const s of m.shots) {
      const p = P(s.id); p.squash = now();
      const d = hexDist(P2(s.from), P2(s.to));
      G.projectiles.push({ fx: tx(...s.from), fy: ty(...s.from) - 16, tx: tx(...s.to), ty: ty(...s.to), t0: now(), dur: 450, special: s.special, h: s.special === 'dp' ? 6 : 18 + d * 7 });
      if (s.special) floatText(POWERS[s.special].name, p.x, p.y - 30, POWERS[s.special].color);
    }
  });

  if (m.shots.length) at(850, () => {
    let anyHit = false;
    for (const s of m.shots) {
      for (const t of s.tiles) {
        const x = tx(...t), y = ty(...t);
        addSplat(x, y, SPLAT_COL[s.special] || '#fffbe8');
        burst(x, y - 4, SPLAT_COL[s.special] || '#fffbe8', s.special === 'bomb' ? 8 : 14, 2.2);
      }
      for (const h of s.hits) {
        const v = P(h.id);
        if (h.armor) {
          v.armor = Math.max(0, v.armor - 1);
          floatText('CLANG! PRINCE ALBERT', v.x, v.y - 30, '#ffd84a');
          burst(v.x, v.y - 18, '#ffd84a', 12, 2.5); Sound.sfx('clang');
        } else {
          anyHit = true;
          v.flash = now(); v.balls = Math.max(0, v.balls - 1);
          floatText('SPLAT!', v.x, v.y - 30, '#ff7af2');
        }
      }
      if (s.special === 'bomb') G.shake = Math.max(G.shake, 6);
    }
    for (const inf of m.infections) if (inf.phase === 'shot') {
      const v = P(inf.id); v.infected = 3;
      floatText('GOT THE CLAP!', v.x, v.y - 40, '#8aef4a'); Sound.sfx('ook');
    }
    for (const id of m.freezes) { const v = P(id); v.frozen = true; floatText('BLUE BALLS!', v.x, v.y - 40, '#7ff7ff'); Sound.sfx('freeze'); }
    Sound.sfx(anyHit ? 'hit' : 'splat');
    if (anyHit) { Sound.sfx('splat'); G.shake = Math.max(G.shake, 4); }
    launchDrops(m.drops.filter(d => d.phase === 'shot'));
  });

  if (m.claps.length || m.infections.some(i => i.phase === 'spread')) at(1200, () => {
    for (const id of m.claps) {
      const p = P(id);
      p.balls = Math.max(0, p.balls - 1); p.infected = 0; p.flash = now();
      floatText('DRIP... THE CLAP!', p.x, p.y - 30, '#8aef4a'); burst(p.x, p.y, '#8aef4a', 12);
    }
    for (const inf of m.infections) if (inf.phase === 'spread') {
      const v = P(inf.id), c = P(inf.from);
      v.infected = 3;
      floatText('INFECTED!', v.x, v.y - 40, '#8aef4a');
      for (let i = 0; i < 6; i++) G.particles.push({ x: c.x, y: c.y - 10, vx: (v.x - c.x) / 30 + (Math.random() - 0.5), vy: (v.y - c.y) / 30 - 1, life: 1, color: '#8aef4a' });
    }
    if (m.claps.length) Sound.sfx('fart');
    launchDrops(m.drops.filter(d => d.phase === 'clap'));
  });

  if (m.deaths.length || m.collapsed) at(1400, () => {
    if (m.collapsed) {
      const keep = [];
      for (const t of G.tiles) (t.dist > m.state.radius ? G.falling.push({ ...t, t0: now() + Math.random() * 250 }) : keep.push(t));
      G.tiles = keep;
      G.tileMap = new Map(keep.map(t => [key(t.q, t.r), t]));
      for (const k of [...G.junk.keys()]) if (!G.tileMap.has(k)) G.junk.delete(k);
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

  at(1700, () => { syncState(m.state); G.phase = 'wait'; });
}

function launchDrops(drops) {
  for (const d of drops) {
    const v = G.players.get(d.id), fx = tx(...d.from), fy = ty(...d.from);
    const out = !d.to, dir = Math.random() < 0.5 ? -1 : 1;
    const f = { fx, fy, tx: out ? fx + dir * 140 : tx(...d.to), ty: out ? fy - 60 : ty(...d.to), t0: now(), dur: out ? 700 : 480, color: v.color, arc: out ? 70 : 26 };
    G.flying.push(f);
    // the landed ball's power (if any) shows up at the end-of-turn sync
    if (d.to) G.timeline.push({ t: now() + 490, fn: () => { const k = key(...d.to); G.loose.set(k, [...(G.loose.get(k) || []), null]); } });
  }
}

function onOver(m) {
  flushTimeline();
  const won = m.winner && m.winner.id === App.myId;
  banner(won ? 'YOU WIN! KING OF THE DUMP' : m.winner ? `${m.winner.name.toUpperCase()} WINS!` : 'DRAW!', 4000, won ? '#ffd84a' : '#ff7af2');
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
function floatText(text, x, y, color, dur = 1100) { G.texts.push({ text, x, y, color, t0: now(), dur }); }
function banner(text, dur, color = '#ffd84a') { if (G) G.banner = { text, t0: now(), dur, color }; }
function burst(x, y, color, n, spd = 1.5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = Math.random() * spd + 0.5;
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1.5, life: 1, color });
  }
}
function addSplat(x, y, col) {
  const c = canvasOf(20, 12), s = c.getContext('2d');
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.pow(Math.random(), 0.7) * 7;
    s.fillStyle = Math.random() < 0.2 ? '#d8d2c0' : col;
    s.fillRect(Math.round(10 + Math.cos(a) * r * 1.3), Math.round(6 + Math.sin(a) * r * 0.6), 1, 1);
  }
  G.splats.push({ c, x: x - 10, y: y - 6, t0: now() });
}

// ------------------------------------------------------------------ input
let mouse = { x: -1, y: -1 };
let hudButtons = [], hudRects = [];

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
const overHud = p => hudRects.some(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
function tileAt(p) {
  if (!G || overHud(p)) return null;
  const x = p.x - G.off.x, y = p.y - G.off.y;
  let best = null, bd = 13;
  for (const t of G.tiles) { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } }
  return best;
}
cv.addEventListener('mousemove', e => { mouse = canvasPos(e); });
cv.addEventListener('mouseleave', () => { mouse = { x: -1, y: -1 }; });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('mousedown', e => {
  if (!G || App.screen !== 'game') return;
  const p = canvasPos(e);
  const btn = hudButtons.find(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
  if (btn) { btn.fn(); return; }
  const t = tileAt(p);
  if (t) choose(e.button === 2 ? 'shoot' : G.mode, t);
});
addEventListener('keydown', e => {
  if (!G || App.screen !== 'game') return;
  const k = e.key.toLowerCase();
  if (k === 'q' || k === '1') setMode('move');
  else if (k === 'e' || k === '2') setMode('shoot');
  else if (k === ' ') { e.preventDefault(); setMode(G.mode === 'move' ? 'shoot' : 'move'); }
  else if (k === 's') { const me = myPlayer(); if (me) choose('stay', me); }
  else if (k === 'm') { Sound.setMusic(!Sound.musicOn); updateMusicLabels(); }
});
function setMode(m) { if (G.mode !== m) { G.mode = m; Sound.sfx('hover'); } }

function choose(mode, t) {
  const me = myPlayer();
  if (!me || !me.alive || me.frozen || G.phase !== 'plan') return;
  let a = null;
  if (hexDist(me, t) === 0 || mode === 'stay') a = { type: 'stay', q: me.q, r: me.r };
  else if (mode === 'move' && canMove(me, t)) a = { type: 'move', q: t.q, r: t.r };
  else if (canShoot(me, t)) a = { type: 'shoot', q: t.q, r: t.r };
  if (!a) { Sound.sfx('bonk'); return; }
  G.choice = a;
  send({ t: 'act', a });
  Sound.sfx('select');
}

// ------------------------------------------------------------------ rendering
function panel(x, y, w, h) {
  g.fillStyle = OUT; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = 'rgba(42,24,14,.92)'; g.fillRect(x, y, w, h);
  g.fillStyle = '#a8784a'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
  g.fillStyle = '#2a1408'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = '#d8b080';
  for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) g.fillRect(x + rx, y + ry, 1, 1);
  hudRects.push({ x, y, w, h });
}

function drawDick(p, x, y, t, o = {}) {
  let variant = 'normal';
  if (p.flash && t - p.flash < 450 && Math.floor((t - p.flash) / 60) % 2 === 0) variant = 'flash';
  else if (p.squash && t - p.squash < 350) variant = 'angry';
  else if (p.infected > 0) variant = 'sick';
  else if ((t + p.blink) % 3200 < 120) variant = 'blink';
  if (o.ghost) variant = 'ghost';
  const frozen = p.frozen && !o.ghost;
  const bob = o.noBob || frozen ? 0 : Math.round(Math.sin(t * 0.006 + p.color * 1.3));
  const stiff = p.viagra > 0 ? 3 : 0;
  x = Math.round(x);
  const top = Math.round(y - 15 + bob - (o.hop || 0));
  if (!o.noShadow) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 7, Math.round(y) + 5, 14, 2); }
  const nb = Math.min(p.balls, 2), ballImg = variant === 'flash' ? SPR.ballFlash : SPR.ball[p.color];
  if (nb >= 1) g.drawImage(ballImg, x - 8, top + 15);
  if (nb >= 2) g.drawImage(ballImg, x, top + 15);
  const spr = SPR.dick[p.color][variant];
  if (p.squash && t - p.squash < 200) g.drawImage(spr, x - 9, top + 4, 18, 15);
  else g.drawImage(spr, x - 8, top - stiff, 16, 19 + stiff);
  const headTop = top - stiff;
  for (let i = 0; i < p.armor; i++) {   // Prince Albert: a gold ring through the tip
    const rx = x - 1 - i * 3, ry = headTop + 4;
    g.fillStyle = OUT; g.fillRect(rx - 1, ry - 1, 5, 5);
    g.fillStyle = '#ffd84a'; g.fillRect(rx, ry, 3, 3);
    g.fillStyle = '#fff8c0'; g.fillRect(rx, ry, 1, 1);
    g.fillStyle = OUT; g.fillRect(rx + 1, ry + 1, 1, 1);
  }
  if (frozen) {
    g.fillStyle = 'rgba(127,247,255,.35)'; g.fillRect(x - 10, headTop - 2, 20, 26 + stiff);
    g.fillStyle = '#e0ffff'; g.fillRect(x - 10, headTop - 2, 20, 1); g.fillRect(x - 10, headTop - 2, 1, 26 + stiff);
    g.fillRect(x - 7, headTop + 2, 1, 4); g.fillRect(x - 6, headTop + 1, 2, 1);
    g.fillStyle = '#4ab8d8'; g.fillRect(x + 9, headTop - 2, 1, 26 + stiff); g.fillRect(x - 10, headTop + 23 + stiff, 20, 1);
  }
  if (p.balls > 2 && !o.ghost) pixText('x' + p.balls, x + 9, top + 17, '#ffd84a');
  if (p.special && !o.ghost) g.drawImage(SPR.icons[p.special], x + 7, headTop - 3 + Math.round(Math.sin(t * 0.008) * 1.5));
  return headTop;
}

function drawCheck(x, y, col) {
  g.fillStyle = OUT; g.fillRect(x - 1, y - 1, 9, 7);
  g.fillStyle = col;
  [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]].forEach(([a, b]) => g.fillRect(x + a, y + b, 1, 1));
}

function updateCamera(dt, me) {
  let fx = 0, fy = 0, look = 0.8;
  if (me && (me.alive || (me.dying && now() - me.dying.t0 < 1600))) { fx = me.x; fy = me.y; look = me.alive ? 0.35 : 0.8; }
  const mx = mouse.x >= 0 ? mouse.x - W / 2 : 0, my = mouse.y >= 0 ? mouse.y - H / 2 : 0;
  const maxX = Math.max(0, 24 * G.radius + 24 - W / 2), maxY = Math.max(0, 21 * G.radius + 46 - H / 2);
  const cx = clamp(fx + mx * look, -maxX, maxX), cy = clamp(fy + my * look, -maxY, maxY);
  const k = Math.min(1, 0.1 * dt);
  G.cam.x += (cx - G.cam.x) * k; G.cam.y += (cy - G.cam.y) * k;
}

function drawGame(t, dt) {
  const me = myPlayer();
  while (G.timeline.length) {
    G.timeline.sort((a, b) => a.t - b.t);
    if (G.timeline[0].t > t) break;
    G.timeline.shift().fn();
  }
  for (const p of G.players.values()) if (p.anim) {
    const a = p.anim, k = clamp((t - a.t0) / a.dur, 0, 1);
    const m = a.blocked ? (k < 0.5 ? k * 2 : (1 - k) * 2) * 0.45 : ease(k);
    p.x = lerp(a.fx, a.tx, m); p.y = lerp(a.fy, a.ty, m); p.hop = Math.sin(Math.PI * k) * (a.blocked ? 5 : a.dash ? 16 : 9);
  }
  updateCamera(dt, me);
  G.shake *= Math.pow(0.85, dt);
  const sx = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake * 2) : 0;
  const sy = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake * 2) : 0;
  G.off.x = Math.round(W / 2 - G.cam.x); G.off.y = Math.round(H / 2 - G.cam.y);
  hudRects = [];
  drawHudFrame();     // registers HUD rects first so hovering the HUD doesn't pick tiles
  G.hover = mouse.x >= 0 ? tileAt(mouse) : null;

  g.save(); g.translate(G.off.x + sx, G.off.y + sy);

  // falling tiles
  G.falling = G.falling.filter(f => {
    const k = clamp((t - f.t0) / 900, 0, 1);
    if (t - f.t0 >= 900) return false;
    g.globalAlpha = 1 - k;
    g.drawImage(SPR.tileWarn[0], f.x - 12, Math.round(f.y - 14 + k * k * 220));
    g.globalAlpha = 1;
    return true;
  });

  // tiles
  const warnOn = Math.floor(t / 220) % 2;
  for (const tile of G.tiles) {
    const warned = G.warn != null && tile.dist > G.warn;
    const jig = warned && warnOn ? (Math.random() < 0.5 ? -1 : 1) : 0;
    g.drawImage(warned ? SPR.tileWarn[warnOn] : SPR.tiles[tile.shade], tile.x - 12 + jig, tile.y - 14);
    if (tile.worm && !warned) {   // a little pink worm wiggling in the dirt
      const k = key(tile.q, tile.r);
      if (!G.junk.has(k) && !G.loose.has(k)) for (let i = 0; i < 5; i++) {
        const wx = tile.x - 7 + i, wy = tile.y + 5 + Math.round(Math.sin(t * 0.006 + i * 1.2 + tile.q));
        g.fillStyle = OUT; g.fillRect(wx, wy + 1, 1, 1);
        g.fillStyle = i === 4 ? '#ffb0c0' : '#f08aa0'; g.fillRect(wx, wy, 1, 1);
      }
    }
  }

  // planning overlays
  const planning = G.phase === 'plan' && me && me.alive && !me.frozen;
  if (planning) {
    for (const tile of G.tiles) {
      const img = G.mode === 'move'
        ? (canMove(me, tile) ? (hexDist(me, tile) === 2 ? SPR.over.dash : SPR.over.move) : null)
        : (canShoot(me, tile) ? SPR.over.shoot : null);
      if (img) g.drawImage(img, tile.x - 12, tile.y - 14);
    }
    if (G.hover && (canMove(me, G.hover) || canShoot(me, G.hover))) {
      if (G.mode === 'shoot' || !canMove(me, G.hover)) for (const a of shotArea(me, G.hover)) g.drawImage(SPR.over.splash, tx(a.q, a.r) - 12, ty(a.q, a.r) - 14);
      g.drawImage(SPR.over.hover, G.hover.x - 12, G.hover.y - 14);
    }
    if (G.choice && G.choice.type !== 'stay') g.drawImage(SPR.over.target, tx(G.choice.q, G.choice.r) - 12, ty(G.choice.q, G.choice.r) - 14);
  }

  // splats
  G.splats = G.splats.filter(s => {
    const a = 1 - (t - s.t0) / 9000;
    if (a <= 0) return false;
    g.globalAlpha = Math.min(1, a * 1.5); g.drawImage(s.c, s.x, s.y); g.globalAlpha = 1;
    return true;
  });

  // depth-sorted entities: junk, loose balls, players
  const ents = [];
  for (const [k, kind] of G.junk) {
    const [q, r] = k.split(',').map(Number), x = tx(q, r), y = ty(q, r), img = SPR.junk[kind];
    ents.push({ y, draw: () => {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 8, y + 4, 16, 3);
      g.drawImage(img, Math.round(x - img.width / 2), y + 7 - img.height);
      if (kind === 'pile' || kind === 'bag') drawFlies(g, x, y + 2 - img.height, t, 3, q * 3 + r);
    } });
  }
  for (const [k, powers] of G.loose) {
    const [q, r] = k.split(',').map(Number);
    ents.push({ y: ty(q, r), draw: () => {
      const x = tx(q, r), y = ty(q, r), b = Math.round(Math.abs(Math.sin(t * 0.005 + q + r)) * 4);
      const pw = powers.find(Boolean);
      if (pw) {   // glowing aura + icon above the ball
        const pulse = Math.floor(t / 180) % 2;
        g.fillStyle = POWERS[pw].color;
        for (let a = 0; a < 12; a++) {
          const an = a / 12 * Math.PI * 2 + t * 0.002;
          if ((a + pulse) % 2) g.fillRect(Math.round(x + Math.cos(an) * 8), Math.round(y - 1 + Math.sin(an) * 4), 1, 1);
        }
        g.drawImage(SPR.icons[pw], x - 3, y - 20 - b);
      }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 3, y + 3, 7, 2);
      g.drawImage(SPR.fleshBall, x - 4, y - 5 - b);
      if (powers.length > 1) pixText('x' + powers.length, x + 5, y - 10, '#ffd84a');
    } });
  }
  for (const p of G.players.values()) {
    if (!p.alive) {
      if (!p.dying) continue;
      const k = (t - p.dying.t0) / 1600;
      if (k >= 1) continue;
      ents.push({ y: p.y + 100, draw: () => {
        g.globalAlpha = 1 - k;
        if (p.dying.how === 'fell') drawDick(p, p.x, p.y + k * k * 220, t, { noShadow: true, noBob: true });
        else drawDick({ ...p, balls: 0, armor: 0, special: null, viagra: 0 }, p.x + Math.sin(k * 12) * 4, p.y - k * 40, t, { ghost: true, noShadow: true });
        g.globalAlpha = 1;
      } });
      continue;
    }
    if (p.infected > 0 && Math.random() < 0.06 * dt) G.particles.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y - 10, vx: 0, vy: -0.6, life: 1, color: '#8aef4a', float: true });
    if (p.lube > 0 && Math.random() < 0.05 * dt) G.particles.push({ x: p.x + (Math.random() - 0.5) * 12, y: p.y - 4, vx: 0, vy: 0.3, life: 1, color: '#c8eaff' });
    ents.push({ y: p.y, draw: () => {
      if (planning && p === me && G.choice && G.choice.type === 'move') {
        g.globalAlpha = 0.4; drawDick(p, tx(G.choice.q, G.choice.r), ty(G.choice.q, G.choice.r), t, { noShadow: true }); g.globalAlpha = 1;
      }
      const top = drawDick(p, p.x, p.y, t, { hop: p.hop });
      if (p.infected > 0) { drawFlies(g, p.x, top - 2, t, 2, p.color); pixText(String(p.infected), p.x - 11, top + 2, '#8aef4a'); }
      if (p.id === App.myId) {
        const ay = top - 9 + Math.round(Math.sin(t * 0.01) * 2), ax = Math.round(p.x);
        g.fillStyle = OUT; g.fillRect(ax - 4, ay - 1, 9, 3); g.fillRect(ax - 3, ay + 2, 7, 2); g.fillRect(ax - 1, ay + 4, 3, 2);
        g.fillStyle = '#ffffff'; g.fillRect(ax - 3, ay, 7, 1); g.fillRect(ax - 2, ay + 1, 5, 2); g.fillRect(ax - 1, ay + 3, 3, 1); g.fillRect(ax, ay + 4, 1, 1);
      } else if (G.phase === 'plan' && p.locked) drawCheck(Math.round(p.x) - 3, top - 9, '#9aff5a');
      if (planning && p === me && G.choice && G.choice.type === 'stay') pixText('ZZZ', p.x + 9, top - 2, '#c8a070');
    } });
  }
  ents.sort((a, b) => a.y - b.y).forEach(e => e.draw());

  // shot preview arc + crosshair
  if (planning && G.choice && G.choice.type === 'shoot') {
    const fx = me.x, fy = me.y - 16, gx = tx(G.choice.q, G.choice.r), gy = ty(G.choice.q, G.choice.r);
    const h = me.special === 'dp' ? 6 : 18 + hexDist(me, G.choice) * 7;
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 1; i < 14; i++) {
      const k = i / 14 + ((t / 600) % (1 / 14));
      g.fillRect(Math.round(lerp(fx, gx, k)), Math.round(lerp(fy, gy, k) - Math.sin(Math.PI * k) * h), 1, 1);
    }
    g.fillStyle = Math.floor(t / 150) % 2 ? '#ff6e96' : '#ffffff';
    g.fillRect(gx - 8, gy, 5, 1); g.fillRect(gx + 4, gy, 5, 1); g.fillRect(gx, gy - 8, 1, 5); g.fillRect(gx, gy + 4, 1, 5);
  }

  // projectiles
  G.projectiles = G.projectiles.filter(pr => {
    const k = (t - pr.t0) / pr.dur;
    if (k >= 1) return false;
    const col = SPLAT_COL[pr.special] || '#fffbe8', big = pr.special === 'bomb' ? 2 : 0;
    const blobs = pr.special === 'dp' ? [0, 0.12] : [0];
    for (const lag of blobs) for (let i = 0; i < 5; i++) {
      const kk = Math.max(0, k - lag - i * 0.03);
      const x = Math.round(lerp(pr.fx, pr.tx, kk)), y = Math.round(lerp(pr.fy, pr.ty, kk) - Math.sin(Math.PI * kk) * pr.h);
      const s = (i === 0 ? 4 : i < 3 ? 2 : 1) + (i === 0 ? big : 0);
      if (i === 0) { g.fillStyle = OUT; g.fillRect(x - s / 2 - 1, y - s / 2 - 1, s + 2, s + 2); }
      g.fillStyle = i === 0 ? col : '#e8e2d0';
      g.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
    }
    return true;
  });

  // knocked-off balls
  G.flying = G.flying.filter(f => {
    const k = (t - f.t0) / f.dur;
    if (k >= 1) return false;
    const x = lerp(f.fx, f.tx, k), y = lerp(f.fy, f.ty, k) - Math.sin(Math.PI * k) * f.arc;
    g.drawImage(SPR.ball[f.color], Math.round(x - 4), Math.round(y - 6));
    return true;
  });

  // particles
  G.particles = G.particles.filter(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; if (!p.float) p.vy += 0.12 * dt; p.life -= 0.025 * dt;
    if (p.life <= 0) return false;
    g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.life > 0.5 ? 2 : 1, p.life > 0.5 ? 2 : 1);
    return true;
  });

  // floating texts
  G.texts = G.texts.filter(ft => {
    const k = (t - ft.t0) / ft.dur;
    if (k >= 1) return false;
    pixText(ft.text, ft.x, ft.y - k * 18, ft.color, { align: 'center' });
    return true;
  });
  g.restore();

  drawHud(t, me);
}

// HUD geometry (also used for hit-testing before the world is drawn)
const BAR_H = 26;
function drawHudFrame() {
  const n = G.players.size;
  hudRects.push({ x: 2, y: 2, w: 104, h: 12 + n * 14 }, { x: W - 52, y: 2, w: 50, h: 46 }, { x: 0, y: H - BAR_H, w: W, h: BAR_H });
}

function drawHud(t, me) {
  hudButtons = [];
  hudRects = [];

  // timer
  if (G.phase === 'plan') {
    const rem = Math.max(0, G.turnEnd - t), k = rem / G.turnMs, bw = 120, bx = Math.round(W / 2 - bw / 2);
    g.fillStyle = OUT; g.fillRect(bx - 2, 3, bw + 4, 8);
    g.fillStyle = '#3a2010'; g.fillRect(bx, 5, bw, 4);
    g.fillStyle = rem < 1000 ? (Math.floor(t / 100) % 2 ? '#ff5a4a' : '#ffd84a') : k < 0.5 ? '#ffc21f' : '#9aff5a';
    g.fillRect(bx, 5, Math.round(bw * k), 4);
    g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(bx, 5, Math.round(bw * k), 1);
    const sec = Math.ceil(rem / 1000);
    pixText(String(sec), bx + bw + 6, 4, rem < 1000 ? '#ff5a4a' : '#ffffff');
    pixText(`TURN ${G.turn}`, W / 2, 13, '#c8a070', { align: 'center' });
    if (sec !== G.lastSec) { if (G.lastSec && sec <= 3 && sec > 0) Sound.sfx('tick'); G.lastSec = sec; }
  } else if (G.turn > 0) pixText('SPLURTING...', W / 2, 4, '#c8a070', { align: 'center' });

  // players
  const ps = [...G.players.values()].sort((a, b) => a.color - b.color);
  panel(2, 2, 104, 12 + ps.length * 14);
  pixText(G.turn < G.suddenDeath ? `SUDDEN DEATH IN ${G.suddenDeath - G.turn}` : 'SUDDEN DEATH!', 6, 5,
    G.turn < G.suddenDeath ? '#c8a070' : (Math.floor(t / 300) % 2 ? '#ff9a1f' : '#ff5a4a'));
  ps.forEach((p, i) => {
    const y = 13 + i * 14;
    g.globalAlpha = p.alive ? 1 : 0.35;
    g.drawImage(SPR.mini[p.color], 5, y);
    pixText(p.name.slice(0, 14), 15, y + 1, PLAYER_COLORS[p.color].css);
    let x = 15;
    if (p.alive) {
      for (let b = 0; b < Math.min(p.balls, 9); b++, x += 3) { g.fillStyle = OUT; g.fillRect(x - 1, y + 7, 4, 4); g.fillStyle = '#ffc8b8'; g.fillRect(x, y + 8, 2, 2); }
      x += 3;
      const st = [[p.armor > 0, '#ffd84a'], [p.infected > 0, '#8aef4a'], [p.frozen, '#7ff7ff'], [p.viagra > 0, '#5a9bff'], [p.lube > 0, '#c8eaff']];
      for (const [on, col] of st) if (on) { g.fillStyle = OUT; g.fillRect(x - 1, y + 7, 5, 5); g.fillStyle = col; g.fillRect(x, y + 8, 3, 3); x += 5; }
      if (p.special) g.drawImage(SPR.icons[p.special], 94, y + 1);
    } else pixText('NUTLESS', 15, y + 7, '#ff5a4a');
    g.globalAlpha = 1;
    if (G.phase === 'plan' && p.locked && p.alive && p.id !== App.myId) drawCheck(85, y + 2, '#9aff5a');
  });

  drawMinimap(t, me);

  // bottom bar
  const y0 = H - BAR_H;
  panel(0, y0, W, BAR_H);
  if (me && me.alive) {
    const btn = (label, x, w, active, col, fn) => {
      g.fillStyle = OUT; g.fillRect(x - 1, y0 + 4, w + 2, 18);
      g.fillStyle = active ? col : '#5a3418'; g.fillRect(x, y0 + 5, w, 16);
      g.fillStyle = active ? 'rgba(255,255,255,.5)' : '#7a4e2a'; g.fillRect(x, y0 + 5, w, 1);
      pixText(label, x + w / 2, y0 + 11, active ? OUT : '#c8a070', { align: 'center', shadow: active ? null : OUT });
      hudButtons.push({ x, y: y0 + 5, w, h: 16, fn });
    };
    btn('Q MOVE', 4, 40, G.mode === 'move', '#9aff5a', () => setMode('move'));
    btn('E SHOOT', 47, 44, G.mode === 'shoot', '#ff6e96', () => setMode('shoot'));
    btn('S STAY', 94, 38, G.choice && G.choice.type === 'stay', '#c8a070', () => choose('stay', me));
    let x = 140;
    pixText(`BALLS ${me.balls}  RANGE ${rangeOf(me)}`, x, y0 + 5, '#ffffff');
    const fx = [];
    if (me.armor) fx.push([`ALBERT x${me.armor}`, '#ffd84a']);
    if (me.viagra) fx.push([`VIAGRA ${me.viagra}`, '#5a9bff']);
    if (me.lube) fx.push([`LUBE ${me.lube}`, '#c8eaff']);
    if (me.infected) fx.push([`CLAP ${me.infected}!`, '#8aef4a']);
    if (me.frozen) fx.push(['FROZEN', '#7ff7ff']);
    let fxX = x;
    for (const [s, c] of fx) fxX += pixText(s, fxX, y0 + 15, c) + 6;
    if (!fx.length) pixText('NO EFFECTS', x, y0 + 15, '#7a4e2a');
    x = Math.max(250, fxX + 6);
    const sp = me.special;
    if (sp) { g.drawImage(SPR.icons[sp], x, y0 + 5); pixText(POWERS[sp].name, x + 10, y0 + 5, POWERS[sp].color); pixText(POWERS[sp].desc, x, y0 + 15, '#c8a070'); }
    else pixText('LOAD: REGULAR', x, y0 + 5, '#c8a070');
    const c = G.choice;
    if (W > 430) pixText(me.frozen ? 'FROZEN' : !c ? (G.phase === 'plan' ? '...' : '') : c.type === 'move' ? '> MOVE' : c.type === 'shoot' ? '> SHOOT' : '> STAY',
      W - 6, y0 + 5, me.frozen ? '#7ff7ff' : c ? '#9aff5a' : '#7a4e2a', { align: 'right' });
  } else if (me) {
    pixText('YOU ARE NUTLESS - SPECTATING. MOVE MOUSE TO LOOK AROUND.', W / 2, y0 + 10, '#ff5a4a', { align: 'center' });
  }

  // power tip after pickup
  if (G.tip && t < G.tip.until) {
    const pw = POWERS[G.tip.pw], s = `${pw.name}: ${pw.desc}`, w = textWidth(s) + 18;
    panel(Math.round(W / 2 - w / 2), y0 - 16, w, 13);
    g.drawImage(SPR.icons[G.tip.pw], Math.round(W / 2 - w / 2) + 3, y0 - 13);
    pixText(s, Math.round(W / 2 - w / 2) + 13, y0 - 12, pw.color);
  }

  drawTooltip();

  // banner
  if (G.banner) {
    const k = (t - G.banner.t0) / G.banner.dur;
    if (k >= 1) G.banner = null;
    else {
      const s = k < 0.1 ? 3 : 2, by = Math.round(H / 2 - 30);
      g.fillStyle = 'rgba(26,11,16,.7)'; g.fillRect(0, by - 6, W, 5 * s + 12);
      pixText(G.banner.text, W / 2, by, Math.floor(t / 120) % 2 ? G.banner.color : '#ffffff', { align: 'center', scale: s });
    }
  }
}

function drawMinimap(t, me) {
  const x0 = W - 52, y0 = 2, cx = x0 + 25, cy = y0 + 23;
  panel(x0, y0, 50, 46);
  const mm = (q, r) => [cx + Math.round(3 * (q + r / 2)), cy + Math.round(2.6 * r)];
  for (const tile of G.tiles) {
    const [x, y] = mm(tile.q, tile.r), j = G.junk.get(key(tile.q, tile.r));
    g.fillStyle = j ? (TALL_JUNK.includes(j) ? '#140608' : '#3a2010') : (G.warn != null && tile.dist > G.warn ? '#c85a2a' : '#8a5a32');
    g.fillRect(x - 1, y - 1, 2, 2);
  }
  for (const [k, pw] of G.loose) {
    const [q, r] = k.split(',').map(Number), [x, y] = mm(q, r), p = pw.find(Boolean);
    g.fillStyle = p ? POWERS[p].color : '#ffc8b8'; g.fillRect(x - 1, y - 1, 2, 2);
  }
  for (const p of G.players.values()) if (p.alive) {
    const [x, y] = mm(p.q, p.r);
    g.fillStyle = p === me && Math.floor(t / 250) % 2 ? '#ffffff' : PLAYER_COLORS[p.color].b;
    g.fillRect(x - 1, y - 1, 3, 3);
  }
  g.fillStyle = 'rgba(255,255,255,.35)';
  const vx = cx + Math.round((G.cam.x - W / 2) / 8), vy = cy + Math.round((G.cam.y - H / 2) / 8.08), vw = Math.round(W / 8), vh = Math.round(H / 8.08);
  g.fillRect(Math.max(x0, vx), Math.max(y0, vy), Math.min(vw, 50), 1);
  g.fillRect(Math.max(x0, vx), Math.min(y0 + 45, vy + vh), Math.min(vw, 50), 1);
}

function drawTooltip() {
  if (!G.hover || mouse.x < 0) return;
  const k = key(G.hover.q, G.hover.r), lines = [];
  const pws = G.loose.get(k);
  if (pws) for (const pw of pws) lines.push(pw ? [`${POWERS[pw].name}: ${POWERS[pw].desc}`, POWERS[pw].color] : ['PLAIN BALL: +1 BALL', '#ffc8b8']);
  const j = G.junk.get(k);
  if (j) lines.push([JUNK_INFO[j], '#c8a070']);
  for (const p of G.players.values()) if (p.alive && p.q === G.hover.q && p.r === G.hover.r) {
    lines.push([`${p.name} - ${p.balls} BALLS`, PLAYER_COLORS[p.color].css]);
    if (p.special) lines.push([`LOADED: ${POWERS[p.special].name}`, POWERS[p.special].color]);
  }
  if (!lines.length) return;
  const w = Math.max(...lines.map(l => textWidth(l[0]))) + 8, h = lines.length * 8 + 5;
  const x = clamp(Math.round(mouse.x + 8), 2, W - w - 2), y = clamp(Math.round(mouse.y - h - 6), 2, H - h - 2);
  panel(x, y, w, h);
  lines.forEach(([s, c], i) => pixText(s, x + 4, y + 3 + i * 8, c));
}

// menu attract mode: a parade marching through the junkyard
const parade = PLAYER_COLORS.map((_, i) => ({ id: 'm' + i, color: i, balls: 2, blink: i * 500, x: -40 - i * 70, flash: 0, squash: 0, armor: i === 2 ? 1 : 0, infected: i === 4 ? 2 : 0, viagra: i === 0 ? 1 : 0, special: null, frozen: false }));
const menuShots = [];
function drawMenuScene(t, dt) {
  const gy = H - 10;
  for (const p of parade) {
    p.x += 0.5 * dt;
    if (p.x > W + 30) p.x -= W + 70;
    const hop = Math.abs(Math.sin(t * 0.008 + p.color)) * 6;
    drawDick(p, p.x, gy, t, { hop, noBob: true });
    if (p.infected) drawFlies(g, p.x, gy - 22, t, 2, p.color);
    if (Math.random() < 0.002 * dt) {
      p.squash = t;
      menuShots.push({ fx: p.x, fy: gy - 16, tx: p.x + 80 + Math.random() * 60, ty: gy + 4, t0: t });
    }
  }
  for (let i = menuShots.length - 1; i >= 0; i--) {
    const s = menuShots[i], k = (t - s.t0) / 700;
    if (k >= 1) { menuShots.splice(i, 1); continue; }
    g.fillStyle = OUT; g.fillRect(Math.round(lerp(s.fx, s.tx, k)) - 1, Math.round(lerp(s.fy, s.ty, k) - Math.sin(Math.PI * k) * 40) - 1, 5, 5);
    g.fillStyle = '#fffbe8'; g.fillRect(Math.round(lerp(s.fx, s.tx, k)), Math.round(lerp(s.fy, s.ty, k) - Math.sin(Math.PI * k) * 40), 3, 3);
  }
}

let last = now();
function frame(t) {
  const dt = Math.min(3, (t - last) / 16.67);
  last = t;
  const inGame = G && (App.screen === 'game' || App.screen === 'over');
  drawBackground(g, W, H, t, inGame ? G.cam.x : 0);
  if (inGame) drawGame(t, dt);
  else drawMenuScene(t, dt);
  requestAnimationFrame(frame);
}

buildSprites();
resize();
buildBackground(W, H);
show('menu');
requestAnimationFrame(frame);
