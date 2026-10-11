'use strict';
// BALLISTIC client: menus, networking, rendering, input.
const $ = s => document.querySelector(s);
const cv = $('#screen'), g = cv.getContext('2d');

// 640x360-ish internal resolution, integer-scaled: chunky 3x pixels on 1080p, whole field visible.
let W = 640, H = 360, SCALE = 3;
function resize() {
  SCALE = Math.max(1, Math.min(Math.floor(innerWidth / 640), Math.floor(innerHeight / 360)));
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
const unkey = k => k.split(',').map(Number);
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
    case 'locked': if (G) setReady(m.ids); break;
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
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('button')) Sound.sfx('click'); });

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
let createTurnSec = 30;
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
function makeIcon(cls, color, scale = 2) {
  const c = document.createElement('canvas');
  c.width = CW; c.height = CH + 4;
  const x = c.getContext('2d');
  const [bw, bh] = CLASS_INFO[cls].ball, ball = getBall(cls);
  x.drawImage(getChar(cls, color), 0, CH + 4 - Math.round(bh * 0.4) - BASE);
  x.drawImage(ball, CX - bw + 1, CH + 4 - bh - 1); x.drawImage(ball, CX - 1, CH + 4 - bh - 1);
  c.style.width = CW * scale + 'px'; c.style.height = (CH + 4) * scale + 'px';
  return c;
}

function renderRoom() {
  const r = App.room; if (!r) return;
  const host = r.host === App.myId;
  const me = r.players.find(p => p.id === App.myId);
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
    const sub = document.createElement('div'); sub.className = 'tag'; sub.textContent = CLASS_INFO[p.cls].name;
    name.appendChild(sub);
    const tag = document.createElement('span'); tag.className = 'tag';
    tag.textContent = p.id === r.host ? 'HOST' : p.bot ? 'BOT' : '';
    d.append(makeIcon(p.cls, p.color, 1), name, tag);
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
  // class picker
  const grid = $('#classGrid');
  grid.innerHTML = '';
  if (!me) return;
  for (const cls of CLASS_ORDER) {
    const info = CLASS_INFO[cls], s = info.stats;
    const b = document.createElement('button');
    b.className = 'classcard' + (me.cls === cls ? ' on' : '');
    const nm = document.createElement('b'); nm.textContent = info.name;
    const ab = document.createElement('i'); ab.textContent = info.ability;
    const ln = document.createElement('span'); ln.textContent = info.lines.join('. ');
    const st = document.createElement('small');
    st.textContent = `BALLS ${s.balls}  RANGE ${s.rng >= 0 ? '+' : ''}${s.rng}  MOVE ${s.move}`;
    b.append(makeIcon(cls, me.color, 2), nm, ab, ln, st);
    b.onclick = () => send({ t: 'class', cls });
    grid.appendChild(b);
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
const stats = p => CLASS_INFO[p.cls].stats;
const walkable = t => G.tileMap.has(key(t.q, t.r)) && !G.junk.has(key(t.q, t.r)) && !G.holes.has(key(t.q, t.r));
const rangeOf = p => (p.fx.shrink ? 1 : clamp(1 + p.balls + stats(p).rng + (p.fx.viagra ? 3 : 0), 1, 9));
const moveOf = p => stats(p).move + (p.fx.lube ? 1 : 0);
const clearShot = (a, b) => hexLine(a, b).every(t => !TALL_JUNK.includes(G.junk.get(key(t.q, t.r))));
function reach(p) {
  const steps = moveOf(p), dist = new Map([[key(p.q, p.r), 0]]), todo = [{ q: p.q, r: p.r }];
  for (const t of todo) {
    const d = dist.get(key(t.q, t.r));
    if (d === steps) continue;
    for (const [dq, dr] of DIRS) {
      const n = { q: t.q + dq, r: t.r + dr }, k = key(n.q, n.r);
      if (walkable(n) && !dist.has(k)) { dist.set(k, d + 1); todo.push(n); }
    }
  }
  return dist;
}
const canMove = (p, t, rch = reach(p)) => !(t.q === p.q && t.r === p.r) && walkable(t) && rch.has(key(t.q, t.r));
function canShoot(p, t) {
  const d = hexDist(p, t);
  return !p.fx.whiskey && walkable(t) && d >= stats(p).minr && d <= rangeOf(p) && (p.special === 'dp' || clearShot(p, t));
}
function shotArea(p, t) {
  if (p.special === 'bomb') return [t, ...DIRS.map(([dq, dr]) => ({ q: t.q + dq, r: t.r + dr })).filter(walkable)];
  if (p.special === 'dp') return [...hexLine(p, t).filter(walkable), t];
  return [t];
}

// ------------------------------------------------------------------ game state
function startGame(m) {
  G = {
    tiles: [], tileMap: new Map(), players: new Map(), loose: new Map(), junk: new Map(), holes: new Map(), cracks: new Set(),
    radius: 6.8, warn: null, turn: 0, turnMs: m.turnSec * 1000, turnEnd: 0, maxBalls: 99,
    phase: 'wait', mode: 'move', choice: null, hover: null, ready: false,
    projectiles: [], particles: [], texts: [], splats: [], flying: [], falling: [], timeline: [],
    banner: null, shake: 0, suddenDeath: m.suddenDeath, lastSec: 0, off: { x: 0, y: 0 }, tip: null,
  };
  m.tiles.forEach(([q, r]) => {
    const t = { q, r, x: tx(q, r), y: ty(q, r), shade: hash(q + 50, r + 50, 3) % SPR.tiles.length, dist: tileDist(q, r), worm: hash(q + 50, r + 50, 9) % 11 === 0 };
    G.tiles.push(t); G.tileMap.set(key(q, r), t);
  });
  G.tiles.sort((a, b) => a.r - b.r || a.q - b.q);
  m.players.forEach(p => G.players.set(p.id, {
    ...p, q: 0, r: 0, balls: 2, alive: true, x: 0, y: 0, hop: 0, armor: 0, special: null, fx: {}, shots: 0,
    anim: null, flash: 0, squash: 0, sink: 0, locked: false, dying: null, blink: Math.random() * 3000,
  }));
  syncState(m.state);
  banner('WELCOME TO THE DUMP!', 2600);
  show('game');
  Sound.play('battle');
}

function syncState(s) {
  for (const sp of s.players) {
    const p = G.players.get(sp.id); if (!p) continue;
    if (p.alive && !sp.alive && !p.dying) p.dying = { t0: now(), how: 'nuts' };
    Object.assign(p, sp);
    p.anim = null; p.x = tx(p.q, p.r); p.y = ty(p.q, p.r); p.hop = 0; p.sink = 0;
  }
  G.loose = new Map(s.loose.map(([q, r, items]) => [key(q, r), items]));
  G.junk = new Map(s.junk.map(([q, r, k]) => [key(q, r), k]));
  G.holes = new Map(s.holes.map(([q, r, n]) => [key(q, r), n]));
  G.cracks = new Set(s.cracks.map(([q, r]) => key(q, r)));
  G.radius = s.radius; G.warn = s.warn; G.maxBalls = s.maxBalls;
  G.tiles = G.tiles.filter(t => t.dist <= s.radius);
  G.tileMap = new Map(G.tiles.map(t => [key(t.q, t.r), t]));
}

function flushTimeline() {
  G.timeline.sort((a, b) => a.t - b.t).forEach(e => e.fn());
  G.timeline = [];
}

function setReady(ids) {
  G.players.forEach(p => (p.locked = ids.includes(p.id)));
  G.ready = ids.includes(App.myId);
}

function onTurn(m) {
  flushTimeline();
  syncState(m.state);
  G.turn = m.n; G.turnMs = m.ms; G.turnEnd = now() + m.ms; G.phase = 'plan'; G.choice = null; G.lastSec = 0;
  setReady(m.ready || []);
  const me = myPlayer();
  if (me && me.alive) Sound.sfx(me.fx.frozen ? 'freeze' : 'turn');
  if (me && me.alive && me.fx.frozen) banner('BLUE BALLS! YOU ARE FROZEN', 1800, '#7ff7ff');
  else if (m.n === G.suddenDeath) banner('SUDDEN DEATH!', 2000, '#ff9a1f');
  else if (m.state.warn != null) banner('THE DUMP IS COLLAPSING!', 1500, '#ff9a1f');
  else if (G.cracks.size && me && G.cracks.has(key(me.q, me.r))) banner('THE GROUND IS CRACKING UNDER YOU!', 1800, '#ffb060');
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
    const p = P(mv.id), far = hexDist(P2(mv.from), P2(mv.to)) > 1;
    p.anim = { fx: tx(...mv.from), fy: ty(...mv.from), tx: tx(...mv.to), ty: ty(...mv.to), t0: T, dur: far ? 620 : 480, blocked: mv.blocked, far };
    if (far && !mv.blocked) at(80, () => burst(p.x, p.y + 4, '#c8eaff', 8));
    if (mv.crabs) at(60, () => { floatText('CRABS! SCRATCH...', p.x, p.y - 34, '#ff5a4a'); Sound.sfx('bonk'); });
    if (mv.blocked) at(220, () => {
      const x = lerp(tx(...mv.from), tx(...mv.to), 0.45), y = lerp(ty(...mv.from), ty(...mv.to), 0.45) - 16;
      floatText('BONK!', x, y, '#ffd84a'); burst(x, y, '#ffd84a', 6); Sound.sfx('bonk'); G.shake = Math.max(G.shake, 2);
    });
  }
  if (m.moves.length) Sound.sfx('move');
  at(640, () => G.players.forEach(p => { if (p.anim) { p.x = p.anim.blocked ? p.anim.fx : p.anim.tx; p.y = p.anim.blocked ? p.anim.fy : p.anim.ty; p.anim = null; p.hop = 0; } }));

  for (const pk of m.pickups) at(520, () => {
    const p = P(pk.id), x = tx(...pk.at), y = ty(...pk.at);
    if (!pk.balls) { floatText(`SACK FULL! MAX ${G.maxBalls}`, x, y - 34, '#ff9a1f'); return; }
    const pile = G.loose.get(key(...pk.at)) || [];
    if (pk.full) G.loose.set(key(...pk.at), pile.slice(pk.balls)); else G.loose.delete(key(...pk.at));
    p.balls += pk.balls;
    floatText(`+${pk.balls} BALL${pk.balls > 1 ? 'S' : ''}`, x, y - 30, '#ffc8b8');
    burst(x, y, '#ffc8b8', 10);
    pk.items.forEach((it, i) => {
      const I = ITEMS[it];
      floatText((I.curse ? 'CURSED: ' : '') + I.name + '!', x, y - 40 - i * 8, I.color, 1800);
      if (pk.id === App.myId) { banner((I.curse ? 'CURSED! ' : '') + I.name, 1700, I.color); G.tip = { it, until: now() + 6000 }; }
    });
    Sound.sfx(pk.items.some(i => ITEMS[i].curse) ? 'fart' : pk.items.length ? 'power' : 'pickup');
  });

  if (m.shots.length) at(620, () => {
    Sound.sfx('shoot');
    for (const s of m.shots) {
      const p = P(s.id); p.squash = now();
      const d = hexDist(P2(s.from), P2(s.to));
      G.projectiles.push({ fx: tx(...s.from), fy: ty(...s.from) - 26, tx: tx(...s.to), ty: ty(...s.to), t0: now(), dur: 620, special: s.special, h: s.special === 'dp' ? 6 : 20 + d * 7 });
      if (s.special) floatText(ITEMS[s.special].name, p.x, p.y - 36, ITEMS[s.special].color);
    }
  });

  if (m.shots.length) at(1250, () => {
    let anyHit = false;
    for (const s of m.shots) {
      for (const t of s.tiles) {
        const x = tx(...t), y = ty(...t);
        addSplat(x, y, SPLAT_COL[s.special] || '#fffbe8');
        burst(x, y - 4, SPLAT_COL[s.special] || '#fffbe8', s.special === 'bomb' ? 8 : 14, 2.2);
      }
      for (const h of s.hits) {
        const v = P(h.id);
        if (h.block === 'shell') {
          floatText('SHELL UP! NO DAMAGE', v.x, v.y - 36, '#7ab84a');
          burst(v.x, v.y - 14, '#b8943e', 12, 2.5); Sound.sfx('clang');
        } else if (h.block === 'armor') {
          v.armor = Math.max(0, v.armor - 1);
          floatText('CLANG! PRINCE ALBERT', v.x, v.y - 36, '#ffd84a');
          burst(v.x, v.y - 22, '#ffd84a', 12, 2.5); Sound.sfx('clang');
        } else {
          anyHit = true;
          v.flash = now(); v.balls = Math.max(0, v.balls - 1);
          floatText('SPLAT! -1 BALL', v.x, v.y - 36, '#ff7af2');
        }
      }
      if (s.special === 'bomb') G.shake = Math.max(G.shake, 6);
    }
    for (const inf of m.infections) if (inf.phase === 'shot') {
      const v = P(inf.id); v.fx = { ...v.fx, infected: 3 };
      floatText('GOT THE CLAP!', v.x, v.y - 46, '#8aef4a'); Sound.sfx('ook');
    }
    for (const id of m.freezes) { const v = P(id); v.fx = { ...v.fx, frozen: 1 }; floatText('BLUE BALLS!', v.x, v.y - 46, '#7ff7ff'); Sound.sfx('freeze'); }
    Sound.sfx(anyHit ? 'hit' : 'splat');
    if (anyHit) { Sound.sfx('splat'); G.shake = Math.max(G.shake, 4); }
    launchDrops(m.drops.filter(d => d.phase === 'shot'));
  });

  if (m.claps.length || m.infections.some(i => i.phase === 'spread')) at(1700, () => {
    for (const id of m.claps) {
      const p = P(id);
      p.balls = Math.max(0, p.balls - 1); p.fx = { ...p.fx, infected: 0 }; p.flash = now();
      floatText('DRIP... THE CLAP! -1 BALL', p.x, p.y - 36, '#8aef4a'); burst(p.x, p.y, '#8aef4a', 12);
    }
    for (const inf of m.infections) if (inf.phase === 'spread') {
      const v = P(inf.id), c = P(inf.from);
      v.fx = { ...v.fx, infected: 3 };
      floatText('INFECTED!', v.x, v.y - 46, '#8aef4a');
      for (let i = 0; i < 6; i++) G.particles.push({ x: c.x, y: c.y - 12, vx: (v.x - c.x) / 30 + (Math.random() - 0.5), vy: (v.y - c.y) / 30 - 1, life: 1, color: '#8aef4a' });
    }
    if (m.claps.length) Sound.sfx('fart');
    launchDrops(m.drops.filter(d => d.phase === 'clap'));
  });

  if (m.holes.length || m.falls.length) at(2000, () => {
    for (const h of m.holes) { G.holes.set(key(...h), 4); G.cracks.delete(key(...h)); G.loose.delete(key(...h)); burst(tx(...h), ty(...h), '#8a5a32', 14, 2); }
    if (m.holes.length) { Sound.sfx('crumble'); G.shake = Math.max(G.shake, 4); }
    for (const f of m.falls) {
      const p = P(f.id);
      p.sink = now();
      floatText(f.lost ? 'FELL IN A HOLE! -1 BALL' : 'FELL IN A HOLE!', p.x, p.y - 36, '#ffb060');
      G.timeline.push({ t: now() + 380, fn: () => {
        p.sink = 0; p.x = tx(...f.to); p.y = ty(...f.to); if (f.lost) p.balls = Math.max(0, p.balls - 1);
        burst(p.x, p.y, '#8a5a32', 10); Sound.sfx('bonk');
      } });
    }
  });

  if (m.deaths.length || m.collapsed) at(2200, () => {
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
      floatText(d.how === 'fell' ? 'AAAAAH!' : 'NUTLESS!', p.x, p.y - 36, '#ff5a4a');
      if (d.id === App.myId) banner('YOU GOT CASTRATED', 2000, '#ff5a4a');
    }
    if (m.deaths.length) Sound.sfx('death');
  });

  at(2500, () => { syncState(m.state); G.phase = 'wait'; });
}

function launchDrops(drops) {
  for (const d of drops) {
    const v = G.players.get(d.id), fx = tx(...d.from), fy = ty(...d.from);
    const out = !d.to, dir = Math.random() < 0.5 ? -1 : 1;
    G.flying.push({ fx, fy, tx: out ? fx + dir * 160 : tx(...d.to), ty: out ? fy - 70 : ty(...d.to), t0: now(), dur: out ? 800 : 560, cls: v.cls, arc: out ? 80 : 30 });
    // the landed ball's item (if any) shows up at the end-of-turn sync
    if (d.to) G.timeline.push({ t: now() + 570, fn: () => { const k = key(...d.to); G.loose.set(k, [...(G.loose.get(k) || []), null]); } });
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
      li.textContent = `${p.name} (${CLASS_INFO[p.cls].name})${p.died ? ` - out T${p.died}` : ` - ${p.balls} balls`}`;
      li.style.color = PLAYER_COLORS[p.color].css;
      ol.appendChild(li);
    }
    show('over');
  }, 2400);
}

const myPlayer = () => G && G.players.get(App.myId);

// ------------------------------------------------------------------ effects
function floatText(text, x, y, color, dur = 1400) { G.texts.push({ text, x, y, color, t0: now(), dur }); }
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
let hudButtons = [], hudRects = [], hudTips = [];

function canvasPos(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}
const inRect = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function tileAt(p) {
  if (!G || hudRects.some(b => inRect(p, b))) return null;
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
  const btn = hudButtons.find(b => inRect(p, b));
  if (btn) { btn.fn(); return; }
  const t = tileAt(p);
  if (t) choose(e.button === 2 ? 'shoot' : G.mode, t);
});
addEventListener('keydown', e => {
  if (!G || App.screen !== 'game') return;
  const k = e.key.toLowerCase();
  if (k === 'q' || k === '1') setMode('move');
  else if (k === 'e' || k === '2') setMode('shoot');
  else if (k === ' ' || k === 'enter') { e.preventDefault(); endTurn(); }
  else if (k === 's') { const me = myPlayer(); if (me) choose('stay', me); }
  else if (k === 'm') { Sound.setMusic(!Sound.musicOn); updateMusicLabels(); }
});
function setMode(m) { if (G.mode !== m) { G.mode = m; Sound.sfx('hover'); } }
const canAct = me => me && me.alive && !me.fx.frozen && G.phase === 'plan';

function choose(mode, t) {
  const me = myPlayer();
  if (!canAct(me)) return;
  let a = null;
  if (hexDist(me, t) === 0 || mode === 'stay') a = { type: 'stay', q: me.q, r: me.r };
  else if (mode === 'move' && canMove(me, t)) a = { type: 'move', q: t.q, r: t.r };
  else if (canShoot(me, t)) a = { type: 'shoot', q: t.q, r: t.r };
  if (!a) { Sound.sfx('bonk'); return; }
  G.choice = a;
  send({ t: 'act', a });
  Sound.sfx('select');
}
function endTurn() {
  const me = myPlayer();
  if (!canAct(me)) return;
  if (!G.choice) { G.choice = { type: 'stay', q: me.q, r: me.r }; send({ t: 'act', a: G.choice }); }
  send({ t: 'ready', v: !G.ready });
  Sound.sfx(G.ready ? 'hover' : 'power');
}

// ------------------------------------------------------------------ rendering
function panel(x, y, w, h) {
  g.fillStyle = OUT; g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = 'rgba(42,24,14,.94)'; g.fillRect(x, y, w, h);
  g.fillStyle = '#a8784a'; g.fillRect(x, y, w, 1); g.fillRect(x, y, 1, h);
  g.fillStyle = '#2a1408'; g.fillRect(x, y + h - 1, w, 1); g.fillRect(x + w - 1, y, 1, h);
  g.fillStyle = '#d8b080';
  for (const [rx, ry] of [[2, 2], [w - 3, 2], [2, h - 3], [w - 3, h - 3]]) g.fillRect(x + rx, y + ry, 1, 1);
  hudRects.push({ x, y, w, h });
}

function staple(x, y) {   // a little silver office staple: [___]
  g.fillStyle = OUT; g.fillRect(x - 1, y - 1, 7, 1); g.fillRect(x - 1, y, 1, 3); g.fillRect(x + 5, y, 1, 3);
  g.fillStyle = '#f0f0f8'; g.fillRect(x, y, 5, 1);
  g.fillStyle = '#9a9aa8'; g.fillRect(x, y + 1, 1, 2); g.fillRect(x + 4, y + 1, 1, 2);
}

// Draws a character standing on ground point (x, y). Returns the y of the head top.
function drawChar(p, x, y, t, o = {}) {
  let variant = 'normal';
  if (p.flash && t - p.flash < 450 && Math.floor((t - p.flash) / 60) % 2 === 0) variant = 'flash';
  else if (p.squash && t - p.squash < 350) variant = 'angry';
  else if (p.fx && p.fx.infected > 0) variant = 'sick';
  else if ((t + p.blink) % 3400 < 130) variant = 'blink';
  if (o.ghost) variant = 'ghost';
  const frozen = p.fx && p.fx.frozen && !o.ghost;
  const bob = o.noBob || frozen ? 0 : Math.round(Math.sin(t * 0.006 + p.color * 1.3));
  const stiff = p.fx && p.fx.viagra ? 3 : 0;
  const [bw, bh] = CLASS_INFO[p.cls].ball;
  x = Math.round(x);
  const gy = Math.round(y + 7 + bob - (o.hop || 0));
  if (!o.noShadow) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - bw, Math.round(y) + 6, bw * 2, 2); }
  // shaft first, then the sack in front of its base so it rises from between the balls
  const spr = getChar(p.cls, p.color, variant);
  const top = gy - Math.round(bh * 0.4) - BASE - stiff;
  if (p.squash && t - p.squash < 200) g.drawImage(spr, x - CX - 1, top + 5, CW + 2, CH - 5);
  else g.drawImage(spr, x - CX, top, CW, CH + stiff);
  const ballImg = getBall(p.cls, variant === 'flash' ? 'flash' : variant === 'sick' ? 'sick' : 'normal');
  const by = gy - bh - 1;
  // extra balls hang off the sack, stapled on: [ball x, ball y, staple x, staple y]
  const extra = Math.max(0, p.balls - 2), small = getBall(p.cls, variant === 'flash' ? 'flash' : 'normal', true);
  const spots = [[-bw + 2, -3, -bw + 4, -3], [1, -3, 3, -3], [-bw - 8, -bh + 2, -bw - 2, -bh + 5],
                 [bw - 2, -bh + 2, bw - 3, -bh + 5], [-5, 3, -2, 2]];
  for (let i = 0; i < Math.min(extra, spots.length); i++) g.drawImage(small, x + spots[i][0], gy + spots[i][1]);
  if (p.balls >= 1) g.drawImage(ballImg, x - bw + 1, by);
  if (p.balls >= 2) g.drawImage(ballImg, x - 1, by);
  for (let i = 0; i < Math.min(extra, spots.length); i++) staple(x + spots[i][2], gy + spots[i][3]);
  if (extra > spots.length) pixText('+' + (extra - spots.length), x + bw + 6, gy - 4, '#ffd84a');
  const meta = CHAR_META[p.cls], headTop = top + meta.headTop;
  // bandana tails flapping behind the head
  if (!o.ghost) {
    const band = PLAYER_COLORS[p.color], wave = Math.round(Math.sin(t * 0.012 + p.color) * 1.5);
    for (let i = 0; i < 4; i++) {
      g.fillStyle = OUT; g.fillRect(x + 6 + i, top + meta.ey - 1 + (i > 1 ? wave : 0), 1, 3);
      g.fillStyle = i % 2 ? band.d : band.b; g.fillRect(x + 6 + i, top + meta.ey + (i > 1 ? wave : 0), 1, 1);
    }
  }
  for (let i = 0; i < (p.armor || 0); i++) {   // Prince Albert: gold rings through the tip
    const rx = x - 2 + (i - (p.armor - 1) / 2) * 4, ry = headTop - 2;
    g.fillStyle = OUT; g.fillRect(rx - 1, ry - 1, 5, 5);
    g.fillStyle = '#ffd84a'; g.fillRect(rx, ry, 3, 3);
    g.fillStyle = '#fff8c0'; g.fillRect(rx, ry, 1, 1);
    g.fillStyle = OUT; g.fillRect(rx + 1, ry + 1, 1, 1);
  }
  if (frozen) {
    const fy = headTop - 3, fh = gy - fy + 1;
    g.fillStyle = 'rgba(127,247,255,.35)'; g.fillRect(x - 12, fy, 24, fh);
    g.fillStyle = '#e0ffff'; g.fillRect(x - 12, fy, 24, 1); g.fillRect(x - 12, fy, 1, fh);
    g.fillRect(x - 9, fy + 3, 1, 5); g.fillRect(x - 8, fy + 2, 2, 1);
    g.fillStyle = '#4ab8d8'; g.fillRect(x + 11, fy, 1, fh); g.fillRect(x - 12, fy + fh - 1, 24, 1);
  }
  if (p.special && !o.ghost && !o.noIcons) g.drawImage(SPR.icons[p.special], x + 9, headTop - 4 + Math.round(Math.sin(t * 0.008) * 1.5));
  return headTop;
}

function drawCheck(x, y, col) {
  g.fillStyle = OUT; g.fillRect(x - 1, y - 1, 9, 7);
  g.fillStyle = col;
  [[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]].forEach(([a, b]) => g.fillRect(x + a, y + b, 1, 1));
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
    p.x = lerp(a.fx, a.tx, m); p.y = lerp(a.fy, a.ty, m); p.hop = Math.sin(Math.PI * k) * (a.blocked ? 5 : a.far ? 16 : 9);
  }
  G.shake *= Math.pow(0.85, dt);
  const sx = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake * 2) : 0;
  const sy = G.shake > 0.3 ? Math.round((Math.random() - 0.5) * G.shake * 2) : 0;
  G.off.x = Math.round(W / 2); G.off.y = Math.round(H / 2) + 8;
  G.hover = mouse.x >= 0 ? tileAt(mouse) : null;
  const rch = me && me.alive ? reach(me) : new Map();

  g.save(); g.translate(G.off.x + sx, G.off.y + sy);

  G.falling = G.falling.filter(f => {
    const k = clamp((t - f.t0) / 900, 0, 1);
    if (t - f.t0 >= 900) return false;
    g.globalAlpha = 1 - k;
    g.drawImage(SPR.tileWarn[0], f.x - 12, Math.round(f.y - 14 + k * k * 220));
    g.globalAlpha = 1;
    return true;
  });

  // tiles, holes, cracks, worms
  const warnOn = Math.floor(t / 220) % 2;
  for (const tile of G.tiles) {
    const k = key(tile.q, tile.r), warned = G.warn != null && tile.dist > G.warn;
    const jig = warned && warnOn ? (Math.random() < 0.5 ? -1 : 1) : 0;
    g.drawImage(warned ? SPR.tileWarn[warnOn] : SPR.tiles[tile.shade], tile.x - 12 + jig, tile.y - 14);
    if (G.holes.has(k)) {
      g.drawImage(SPR.hole, tile.x - 12, tile.y - 14);
      if ((t / 900 + tile.q) % 4 > 0.4) {   // something lives down there
        g.fillStyle = '#ffd84a'; g.fillRect(tile.x - 3, tile.y + 1, 1, 1); g.fillRect(tile.x + 2, tile.y + 1, 1, 1);
      }
    } else if (G.cracks.has(k)) {
      if (warnOn) g.drawImage(SPR.crack, tile.x - 12, tile.y - 14);
      else { g.globalAlpha = 0.5; g.drawImage(SPR.crack, tile.x - 12, tile.y - 14); g.globalAlpha = 1; }
    } else if (tile.worm && !warned && !G.junk.has(k) && !G.loose.has(k)) {
      for (let i = 0; i < 5; i++) {
        const wx = tile.x - 7 + i, wy = tile.y + 5 + Math.round(Math.sin(t * 0.006 + i * 1.2 + tile.q));
        g.fillStyle = OUT; g.fillRect(wx, wy + 1, 1, 1);
        g.fillStyle = i === 4 ? '#ffb0c0' : '#f08aa0'; g.fillRect(wx, wy, 1, 1);
      }
    }
  }

  // planning overlays
  const planning = canAct(me);
  if (planning) {
    for (const tile of G.tiles) {
      const img = G.mode === 'move' ? (canMove(me, tile, rch) ? SPR.over.move : null) : (canShoot(me, tile) ? SPR.over.shoot : null);
      if (img) g.drawImage(img, tile.x - 12, tile.y - 14);
    }
    if (G.hover && (canMove(me, G.hover, rch) || canShoot(me, G.hover))) {
      if (G.mode === 'shoot' || !canMove(me, G.hover, rch)) for (const a of shotArea(me, G.hover)) g.drawImage(SPR.over.splash, tx(a.q, a.r) - 12, ty(a.q, a.r) - 14);
      g.drawImage(SPR.over.hover, G.hover.x - 12, G.hover.y - 14);
    }
    if (G.choice && G.choice.type !== 'stay') g.drawImage(SPR.over.target, tx(G.choice.q, G.choice.r) - 12, ty(G.choice.q, G.choice.r) - 14);
  }

  G.splats = G.splats.filter(s => {
    const a = 1 - (t - s.t0) / 12000;
    if (a <= 0) return false;
    g.globalAlpha = Math.min(1, a * 1.5); g.drawImage(s.c, s.x, s.y); g.globalAlpha = 1;
    return true;
  });

  // depth-sorted entities: junk, loose balls, characters
  const ents = [];
  for (const [k, kind] of G.junk) {
    const [q, r] = unkey(k), x = tx(q, r), y = ty(q, r), img = SPR.junk[kind];
    ents.push({ y, draw: () => {
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x - 8, y + 4, 16, 3);
      g.drawImage(img, Math.round(x - img.width / 2), y + 7 - img.height);
      if (kind === 'pile' || kind === 'bag') drawFlies(g, x, y + 2 - img.height, t, 3, q * 3 + r);
    } });
  }
  for (const [k, items] of G.loose) {
    if (!items.length) continue;
    const [q, r] = unkey(k);
    ents.push({ y: ty(q, r), draw: () => {
      const x = tx(q, r), y = ty(q, r), b = Math.round(Math.abs(Math.sin(t * 0.005 + q + r)) * 4);
      const it = items.find(Boolean);
      if (it) {   // glowing aura (purple & flickering for curses) + icon above
        const I = ITEMS[it], pulse = Math.floor(t / 180) % 2;
        g.fillStyle = I.curse ? (pulse ? '#b04aff' : '#5a1a8a') : I.color;
        for (let a = 0; a < 14; a++) {
          const an = a / 14 * Math.PI * 2 + t * (I.curse ? -0.003 : 0.002);
          if ((a + pulse) % 2) g.fillRect(Math.round(x + Math.cos(an) * 9), Math.round(y - 1 + Math.sin(an) * 4), 1, 1);
        }
        g.drawImage(SPR.icons[it], x - 3, y - 22 - b);
        if (I.curse && pulse) { g.fillStyle = '#b04aff'; g.fillRect(x - 5, y - 23 - b, 1, 1); g.fillRect(x + 4, y - 17 - b, 1, 1); }
      }
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 4, y + 3, 9, 2);
      g.drawImage(SPR.looseBall, x - 5, y - 7 - b);
      if (items.length > 1) pixText('x' + items.length, x + 6, y - 12, '#ffd84a');
    } });
  }
  for (const p of G.players.values()) {
    if (!p.alive) {
      if (!p.dying) continue;
      const k = (t - p.dying.t0) / 1800;
      if (k >= 1) continue;
      ents.push({ y: p.y + 100, draw: () => {
        g.globalAlpha = 1 - k;
        if (p.dying.how === 'fell') drawChar(p, p.x, p.y + k * k * 220, t, { noShadow: true, noBob: true });
        else drawChar({ ...p, balls: 0, armor: 0, special: null, fx: {} }, p.x + Math.sin(k * 12) * 4, p.y - k * 44, t, { ghost: true, noShadow: true });
        g.globalAlpha = 1;
      } });
      continue;
    }
    if (p.fx.infected > 0 && Math.random() < 0.06 * dt) G.particles.push({ x: p.x + (Math.random() - 0.5) * 10, y: p.y - 12, vx: 0, vy: -0.6, life: 1, color: '#8aef4a', float: true });
    if (p.fx.lube && Math.random() < 0.05 * dt) G.particles.push({ x: p.x + (Math.random() - 0.5) * 12, y: p.y - 4, vx: 0, vy: 0.3, life: 1, color: '#c8eaff' });
    ents.push({ y: p.y, draw: () => {
      if (planning && p === me && G.choice && G.choice.type === 'move') {
        g.globalAlpha = 0.4; drawChar(p, tx(G.choice.q, G.choice.r), ty(G.choice.q, G.choice.r), t, { noShadow: true, noIcons: true }); g.globalAlpha = 1;
      }
      let sinkK = 0;
      if (p.sink) { sinkK = clamp((t - p.sink) / 350, 0, 1); g.globalAlpha = 1 - sinkK; }
      const top = drawChar(p, p.x, p.y + sinkK * 14, t, { hop: p.hop });
      g.globalAlpha = 1;
      if (p.fx.infected > 0) { drawFlies(g, p.x, top - 2, t, 2, p.color); pixText(String(p.fx.infected), p.x - 14, top + 2, '#8aef4a'); }
      if (p.fx.crabs) for (let i = 0; i < 2; i++) { g.fillStyle = '#ff5a4a'; g.fillRect(Math.round(p.x - 6 + Math.sin(t * 0.02 + i * 3) * 6), Math.round(p.y + 2 + i * 2), 2, 1); }
      if (p.id === App.myId) {
        const ay = top - 14 + Math.round(Math.sin(t * 0.01) * 2), ax = Math.round(p.x);
        g.fillStyle = OUT; g.fillRect(ax - 4, ay - 1, 9, 3); g.fillRect(ax - 3, ay + 2, 7, 2); g.fillRect(ax - 1, ay + 4, 3, 2);
        g.fillStyle = '#ffffff'; g.fillRect(ax - 3, ay, 7, 1); g.fillRect(ax - 2, ay + 1, 5, 2); g.fillRect(ax - 1, ay + 3, 3, 1); g.fillRect(ax, ay + 4, 1, 1);
      } else if (G.phase === 'plan' && p.locked) drawCheck(Math.round(p.x) - 3, top - 12, '#9aff5a');
      if (planning && p === me && G.choice && G.choice.type === 'stay') pixText(p.cls === 'turtle' ? 'SHELL' : 'ZZZ', p.x + 10, top, '#c8a070');
    } });
  }
  ents.sort((a, b) => a.y - b.y).forEach(e => e.draw());

  // shot preview arc + crosshair
  if (planning && G.choice && G.choice.type === 'shoot') {
    const fx = me.x, fy = me.y - 26, gx = tx(G.choice.q, G.choice.r), gy = ty(G.choice.q, G.choice.r);
    const h = me.special === 'dp' ? 6 : 20 + hexDist(me, G.choice) * 7;
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 1; i < 14; i++) {
      const k = i / 14 + ((t / 600) % (1 / 14));
      g.fillRect(Math.round(lerp(fx, gx, k)), Math.round(lerp(fy, gy, k) - Math.sin(Math.PI * k) * h), 1, 1);
    }
    g.fillStyle = Math.floor(t / 150) % 2 ? '#ff6e96' : '#ffffff';
    g.fillRect(gx - 8, gy, 5, 1); g.fillRect(gx + 4, gy, 5, 1); g.fillRect(gx, gy - 8, 1, 5); g.fillRect(gx, gy + 4, 1, 5);
  }

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

  G.flying = G.flying.filter(f => {
    const k = (t - f.t0) / f.dur;
    if (k >= 1) return false;
    const x = lerp(f.fx, f.tx, k), y = lerp(f.fy, f.ty, k) - Math.sin(Math.PI * k) * f.arc;
    g.drawImage(getBall(f.cls), Math.round(x - 5), Math.round(y - 8));
    return true;
  });

  G.particles = G.particles.filter(p => {
    p.x += p.vx * dt; p.y += p.vy * dt; if (!p.float) p.vy += 0.12 * dt; p.life -= 0.022 * dt;
    if (p.life <= 0) return false;
    g.fillStyle = p.color; g.fillRect(Math.round(p.x), Math.round(p.y), p.life > 0.5 ? 2 : 1, p.life > 0.5 ? 2 : 1);
    return true;
  });

  G.texts = G.texts.filter(ft => {
    const k = (t - ft.t0) / ft.dur;
    if (k >= 1) return false;
    pixText(ft.text, ft.x, ft.y - k * 18, ft.color, { align: 'center' });
    return true;
  });
  g.restore();

  drawHud(t, me);
}

// ---- tooltips: every power, curse, status and class has readable stats
const itemTip = it => { const I = ITEMS[it]; return [[I.name, I.color], [I.kind, I.curse ? '#b04aff' : '#c8a070'], ...I.lines.map(l => [l, '#f6e8c8'])]; };
function classTip(cls) {
  const I = CLASS_INFO[cls], s = I.stats;
  return [[I.name, '#ffd84a'], [`ABILITY: ${I.ability}`, '#9aff5a'], ...I.lines.map(l => [l, '#f6e8c8']),
    [`START BALLS ${s.balls}  RANGE ${s.rng >= 0 ? '+' : ''}${s.rng}  MOVE ${s.move}`, '#c8a070']];
}
function effectList(p) {   // [icon, tooltip lines, label]
  const out = [];
  if (p.armor) out.push(['albert', itemTip('albert'), 'x' + p.armor]);
  for (const k of ['viagra', 'lube', 'whiskey', 'shrink', 'crabs']) if (p.fx[k]) out.push([k, [...itemTip(k), [`${p.fx[k]} TURN(S) LEFT`, '#ffd84a']], String(p.fx[k])]);
  for (const k of ['infected', 'immune', 'frozen']) if (p.fx[k]) {
    const S = STATUS[k];
    out.push([S.icon, [[S.name, S.color], ...S.lines.map(l => [l, '#f6e8c8']), [`${p.fx[k]} TURN(S) LEFT`, '#ffd84a']], String(p.fx[k])]);
  }
  if (p.special) out.push([p.special, [...itemTip(p.special), ['LOADED - FIRES WITH YOUR NEXT SHOT', '#ffd84a']], 'L']);
  return out;
}
function drawEffects(p, x, y, maxW) {
  let cx = x;
  for (const [icon, lines, label] of effectList(p)) {
    if (cx + 12 > x + maxW) break;
    g.drawImage(SPR.icons[icon], cx, y);
    pixText(label, cx + 8, y + 2, '#ffd84a');
    hudTips.push({ x: cx, y, w: 12, h: 8, lines });
    cx += 9 + textWidth(label) + 2;
  }
}

function drawHud(t, me) {
  hudButtons = []; hudRects = []; hudTips = [];

  // ---- left: all players
  const ps = [...G.players.values()].sort((a, b) => a.color - b.color);
  const LW = 138, rowH = Math.min(52, Math.floor((H - 30) / ps.length));
  panel(2, 2, LW, 16 + ps.length * rowH);
  pixText('THE DICKS', 7, 6, '#ffd84a');
  pixText(`SACK LIMIT ${G.maxBalls}`, LW - 3, 6, '#c8a070', { align: 'right' });
  hudTips.push({ x: 2, y: 2, w: LW, h: 12, lines: [['SACK LIMIT', '#ffd84a'], ['NOBODY CAN HOLD MORE THAN HALF', '#f6e8c8'], ['OF THE BALLS THE GAME STARTED WITH', '#f6e8c8']] });
  ps.forEach((p, i) => {
    const y = 16 + i * rowH;
    g.globalAlpha = p.alive ? 1 : 0.35;
    drawChar({ ...p, special: null, armor: 0, fx: p.alive ? p.fx : {} }, 19, y + rowH - 14, t, { noBob: true, noShadow: true, noIcons: true, ghost: !p.alive });
    pixText(p.name.slice(0, 14), 38, y + 4, PLAYER_COLORS[p.color].css);
    pixText(CLASS_INFO[p.cls].name, 38, y + 11, '#c8a070');
    hudTips.push({ x: 4, y, w: LW - 4, h: 18, lines: [[p.name, PLAYER_COLORS[p.color].css], ...classTip(p.cls)] });
    if (p.alive) {
      pixText(`BALLS ${p.balls}/${G.maxBalls} RNG ${rangeOf(p)}`, 38, y + 18, '#f6e8c8');
      drawEffects(p, 38, y + 25, LW - 40);
    } else pixText('NUTLESS', 38, y + 18, '#ff5a4a');
    g.globalAlpha = 1;
    if (G.phase === 'plan' && p.locked && p.alive) drawCheck(LW - 10, y + 4, '#9aff5a');
  });

  // ---- right: me
  const RX = W - 140, RW = 138;
  panel(RX, 2, RW, H - 4);
  let y = 6;
  pixText(`TURN ${G.turn}`, RX + 5, y, '#ffd84a');
  pixText(G.turn < G.suddenDeath ? `SUDDEN DEATH IN ${G.suddenDeath - G.turn}` : 'SUDDEN DEATH!', RX + RW - 4, y,
    G.turn < G.suddenDeath ? '#c8a070' : (Math.floor(t / 300) % 2 ? '#ff9a1f' : '#ff5a4a'), { align: 'right' });
  y += 9;
  if (G.phase === 'plan') {
    const rem = Math.max(0, G.turnEnd - t), k = rem / G.turnMs, bw = RW - 24;
    g.fillStyle = OUT; g.fillRect(RX + 4, y - 1, bw + 2, 7);
    g.fillStyle = '#3a2010'; g.fillRect(RX + 5, y, bw, 5);
    g.fillStyle = rem < 3000 ? (Math.floor(t / 100) % 2 ? '#ff5a4a' : '#ffd84a') : k < 0.4 ? '#ffc21f' : '#9aff5a';
    g.fillRect(RX + 5, y, Math.round(bw * k), 5);
    const sec = Math.ceil(rem / 1000);
    pixText(String(sec), RX + RW - 5, y, rem < 3000 ? '#ff5a4a' : '#ffffff', { align: 'right' });
    if (sec !== G.lastSec) { if (G.lastSec && sec <= 3 && sec > 0) Sound.sfx('tick'); G.lastSec = sec; }
  } else pixText(G.turn ? 'SPLURTING...' : 'GET READY...', RX + RW / 2, y, '#c8a070', { align: 'center' });
  y += 10;

  if (me) {
    const info = CLASS_INFO[me.cls];
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(RX + 4, y, 40, 50);
    drawChar({ ...me, special: null, fx: me.alive ? me.fx : {} }, RX + 24, y + 38, t, { noShadow: true, noIcons: true, ghost: !me.alive });
    pixText(me.name.slice(0, 16), RX + 48, y + 4, PLAYER_COLORS[me.color].css);
    pixText(info.name, RX + 48, y + 14, '#ffd84a');
    pixText(info.ability, RX + 48, y + 24, '#9aff5a');
    pixText('(HOVER: INFO)', RX + 48, y + 34, '#7a4e2a');
    hudTips.push({ x: RX + 4, y, w: RW - 8, h: 50, lines: classTip(me.cls) });
    y += 54;
    if (me.alive) {
      pixText(`BALLS ${me.balls}/${G.maxBalls}`, RX + 5, y, '#ffffff');
      pixText(`RANGE ${rangeOf(me)}`, RX + 62, y, '#ffffff');
      pixText(`MOVE ${moveOf(me)}`, RX + 104, y, '#ffffff');
      y += 10;
      pixText('LOAD:', RX + 5, y, '#c8a070');
      if (me.special) {
        g.drawImage(SPR.icons[me.special], RX + 26, y - 1);
        pixText(ITEMS[me.special].name, RX + 36, y, ITEMS[me.special].color);
        hudTips.push({ x: RX + 4, y: y - 2, w: RW - 8, h: 9, lines: itemTip(me.special) });
      } else pixText(me.cls === 'doc' ? `REGULAR (${3 - (me.shots % 3)} TO CLAP)` : 'REGULAR', RX + 26, y, '#f6e8c8');
      y += 10;
      pixText('EFFECTS:', RX + 5, y, '#c8a070');
      if (effectList(me).length) drawEffects(me, RX + 40, y - 2, RW - 44); else pixText('NONE', RX + 40, y, '#7a4e2a');
      y += 12;

      const btn = (label, by, h, active, col, fn, disabled) => {
        g.fillStyle = OUT; g.fillRect(RX + 4, by - 1, RW - 8, h + 2);
        g.fillStyle = disabled ? '#3a2010' : active ? col : '#5a3418'; g.fillRect(RX + 5, by, RW - 10, h);
        g.fillStyle = active ? 'rgba(255,255,255,.5)' : '#7a4e2a'; g.fillRect(RX + 5, by, RW - 10, 1);
        pixText(label, RX + RW / 2, by + Math.round(h / 2) - 2, disabled ? '#5a3418' : active ? OUT : '#c8a070', { align: 'center', shadow: active ? null : OUT });
        hudButtons.push({ x: RX + 5, y: by, w: RW - 10, h, fn });
      };
      const can = canAct(me);
      btn('[Q] MOVE', y, 13, G.mode === 'move', '#9aff5a', () => setMode('move'), !can);
      btn(me.fx.whiskey ? "[E] SHOOT - TOO DRUNK" : '[E] SHOOT', y + 16, 13, G.mode === 'shoot', '#ff6e96', () => setMode('shoot'), !can || me.fx.whiskey);
      btn(me.cls === 'turtle' ? '[S] STAY - SHELL UP' : '[S] STAY PUT', y + 32, 13, G.choice && G.choice.type === 'stay', '#c8a070', () => choose('stay', me), !can);
      y += 50;
      const c = G.choice;
      pixText('ORDERS:', RX + 5, y, '#c8a070');
      pixText(me.fx.frozen ? 'FROZEN - SKIPPING TURN' : !c ? 'PICK A TILE...' : c.type === 'move' ? 'MOVE THERE' : c.type === 'shoot' ? 'SHOOT YOUR LOAD' : 'STAY PUT',
        RX + 40, y, me.fx.frozen ? '#7ff7ff' : c ? '#9aff5a' : '#7a4e2a');
      y += 10;
      const pulse = Math.floor(t / 400) % 2;
      btn(G.ready ? 'READY! CLICK TO UNDO' : '[ENTER] END TURN', y, 20, G.ready || (can && pulse && c), G.ready ? '#9aff5a' : '#ffd84a', endTurn, !can);
      y += 24;
      const waiting = [...G.players.values()].filter(p => p.alive && !p.locked).length;
      if (G.phase === 'plan') pixText(G.ready ? `WAITING FOR ${waiting} DICK${waiting === 1 ? '' : 'S'}...` : 'TAKE YOUR TIME. THINK.', RX + RW / 2, y, '#c8a070', { align: 'center' });
      y += 12;
    } else {
      pixText('YOU ARE NUTLESS.', RX + 5, y, '#ff5a4a');
      pixText('SPECTATING...', RX + 5, y + 9, '#c8a070');
      y += 24;
    }
    // controls help at the bottom of the panel
    const help = ['LMB: ACT IN MODE', 'RMB: SHOOT', 'SPACE/ENTER: END TURN', 'HOVER ANYTHING FOR STATS', 'M: MUSIC'];
    help.forEach((l, i) => pixText(l, RX + 5, H - 8 - (help.length - i) * 8, '#7a4e2a'));
  }

  // power tip after a pickup
  if (G.tip && t < G.tip.until) {
    const lines = itemTip(G.tip.it), w = Math.max(...lines.map(l => textWidth(l[0]))) + 16, x = Math.round(W / 2 - w / 2), y0 = H - 12 - lines.length * 8;
    panel(x, y0, w, lines.length * 8 + 6);
    g.drawImage(SPR.icons[G.tip.it], x + 3, y0 + 3);
    lines.forEach(([s, c], i) => pixText(s, x + 13, y0 + 4 + i * 8, c));
  }

  drawTooltip();

  if (G.banner) {
    const k = (t - G.banner.t0) / G.banner.dur;
    if (k >= 1) G.banner = null;
    else {
      const s = k < 0.08 ? 3 : 2, by = Math.round(H / 2 - 40);
      g.fillStyle = 'rgba(26,11,16,.75)'; g.fillRect(0, by - 6, W, 5 * s + 12);
      pixText(G.banner.text, W / 2, by, Math.floor(t / 120) % 2 ? G.banner.color : '#ffffff', { align: 'center', scale: s });
    }
  }
}

function drawTooltip() {
  if (mouse.x < 0) return;
  let lines = null;
  const hud = hudTips.find(b => inRect(mouse, b));
  if (hud) lines = hud.lines;
  else if (G.hover) {
    lines = [];
    const k = key(G.hover.q, G.hover.r);
    for (const p of G.players.values()) if (p.alive && p.q === G.hover.q && p.r === G.hover.r) {
      lines.push([`${p.name} - ${CLASS_INFO[p.cls].name}`, PLAYER_COLORS[p.color].css]);
      lines.push([`BALLS ${p.balls}/${G.maxBalls}  RANGE ${rangeOf(p)}  MOVE ${moveOf(p)}`, '#f6e8c8']);
      lines.push([`ABILITY: ${CLASS_INFO[p.cls].ability} - ${CLASS_INFO[p.cls].lines[0]}`, '#9aff5a']);
      for (const [, l] of effectList(p)) lines.push([`- ${l[0][0]}${l[l.length - 1][0].includes('LEFT') ? ' (' + l[l.length - 1][0] + ')' : ''}`, l[0][1]]);
    }
    const items = G.loose.get(k);
    if (items) for (const it of items) {
      if (lines.length) lines.push(['', '#000']);
      if (it) lines.push(...itemTip(it), ['GRAB IT: +1 BALL AND ' + (ITEMS[it].curse ? 'THE CURSE' : 'THE POWER'), '#ffd84a']);
      else lines.push(['PLAIN BALL', '#ffc8b8'], ['+1 BALL. NO SURPRISES', '#f6e8c8']);
    }
    const j = G.junk.get(k);
    if (j) lines.push([JUNK_INFO[j][0], '#c8a070'], [JUNK_INFO[j][1], '#f6e8c8']);
    if (G.holes.has(k)) lines.push(['HOLE', '#ffb060'], ["CAN'T WALK HERE. SHOTS FLY OVER", '#f6e8c8'], [`CLOSES IN ${G.holes.get(k)} TURN(S)`, '#ffd84a']);
    if (G.cracks.has(k)) lines.push(['CRACKED GROUND!', '#ffb060'], ['OPENS INTO A HOLE AT THE END OF THIS TURN', '#f6e8c8'], ["ANYONE ON IT FALLS IN: -1 BALL", '#ff5a4a']);
    if (G.warn != null && G.hover.dist > G.warn) lines.push(['CRUMBLING EDGE!', '#ff9a1f'], ['FALLS AWAY THIS TURN. GET OFF!', '#f6e8c8']);
    if (!lines.length) lines = null;
  }
  if (!lines) return;
  const w = Math.max(...lines.map(l => textWidth(l[0]))) + 8, h = lines.length * 8 + 5;
  const x = clamp(Math.round(mouse.x + 10), 2, W - w - 2), y = clamp(Math.round(mouse.y - h - 6), 2, H - h - 2);
  panel(x, y, w, h);
  lines.forEach(([s, c], i) => pixText(s, x + 4, y + 3 + i * 8, c));
}

// menu attract mode: the six classes parading through the junkyard
const parade = CLASS_ORDER.map((cls, i) => ({ id: 'm' + i, cls, color: i, balls: 2 + (i % 3), blink: i * 500, x: -40 - i * 70, flash: 0, squash: 0, armor: cls === 'punk' ? 1 : 0, special: null, fx: {} }));
const menuShots = [];
function drawMenuScene(t, dt) {
  const gy = H - 14;
  for (const p of parade) {
    p.x += 0.5 * dt;
    if (p.x > W + 40) p.x -= W + 80;
    const hop = Math.abs(Math.sin(t * 0.008 + p.color)) * (p.cls === 'quickie' ? 9 : 5);
    drawChar(p, p.x, gy, t, { hop, noBob: true });
    if (p.cls === 'doc') drawFlies(g, p.x, gy - 30, t, 2, p.color);
    if (Math.random() < 0.002 * dt) {
      p.squash = t;
      menuShots.push({ fx: p.x, fy: gy - 20, tx: p.x + 80 + Math.random() * 60, ty: gy + 4, t0: t });
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
  drawBackground(g, W, H, t, 0);
  if (inGame) drawGame(t, dt);
  else drawMenuScene(t, dt);
  requestAnimationFrame(frame);
}

buildSprites();
resize();
buildBackground(W, H);
show('menu');
requestAnimationFrame(frame);
