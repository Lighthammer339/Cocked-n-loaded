// Pixel-art assets, built at runtime from character maps.
const PLAYER_COLORS = [
  { name: 'RED',    b: '#e8433a', l: '#ff8a6b', d: '#9c1f2a', h: '#ff6f8a', css: '#ff5a4a' },
  { name: 'BLUE',   b: '#3a7be8', l: '#86bbff', d: '#1f3d9c', h: '#6fa8ff', css: '#5a9bff' },
  { name: 'GREEN',  b: '#3ec44a', l: '#9cf28a', d: '#1c7a34', h: '#7ae88a', css: '#5ae86a' },
  { name: 'YELLOW', b: '#f2c230', l: '#fff38a', d: '#a8741c', h: '#ffe06a', css: '#ffd84a' },
  { name: 'PURPLE', b: '#a24be8', l: '#d9a6ff', d: '#5e2296', h: '#c68aff', css: '#c27aff' },
  { name: 'ORANGE', b: '#ff8a1f', l: '#ffc47a', d: '#b04a12', h: '#ffaa5a', css: '#ffa04a' },
];
const NEUTRAL = { b: '#f0a0b0', l: '#ffd6de', d: '#a85a70', h: '#f0a0b0' };

// o outline, b body, l light, d dark, h head, w eye white, p pupil, k shine
const DICK = [
  '....oooooo....',
  '..oohhhhhhoo..',
  '.ohhkkhhhhhho.',
  '.ohkwwhhwwhho.',
  'ohhhwphhwphhho',
  'ohhhhhhhhhhhho',
  '.oohhhhhhhhoo.',
  '..oddddddddo..',
  '..oblbbbbbdo..',
  '..oblbbbbbdo..',
  '..oblbbbbbdo..',
  '..oblbbbbbdo..',
  '..oblbbbbbdo..',
  '..obbbbbbbdo..',
  '..obbbbbbbdo..',
];
const BALL = [
  '.oooo.',
  'obbbbo',
  'oblbbo',
  'obbbdo',
  'obddbo',
  '.oooo.',
];

function pixmap(rows, colors) {
  const c = document.createElement('canvas');
  c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    const col = colors[ch];
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }));
  return c;
}

function dickColors(p, variant) {
  const base = { o: '#1a0b1e', b: p.b, l: p.l, d: p.d, h: p.h, w: '#ffffff', p: '#1a0b1e', k: '#ffffff' };
  if (variant === 'blink') { base.w = p.d; base.p = p.d; }
  if (variant === 'angry') { base.w = '#ffffff'; base.p = '#c80000'; }
  if (variant === 'flash') { for (const k in base) base[k] = k === 'o' ? '#ffffff' : '#ffffff'; }
  if (variant === 'ghost') { for (const k in base) base[k] = k === 'o' ? 'rgba(255,255,255,.5)' : 'rgba(200,220,255,.35)'; }
  return base;
}

const SPR = { dick: [], ball: [], neutralBall: null, tiles: [], over: {} };

function buildSprites() {
  PLAYER_COLORS.forEach((p, i) => {
    SPR.dick[i] = {};
    for (const v of ['normal', 'blink', 'angry', 'flash', 'ghost']) SPR.dick[i][v] = pixmap(DICK, dickColors(p, v));
    SPR.ball[i] = pixmap(BALL, { o: '#1a0b1e', b: p.d, l: p.l, d: '#2a0a20' });
  });
  SPR.ballFlash = pixmap(BALL, { o: '#fff', b: '#fff', l: '#fff', d: '#fff' });
  SPR.neutralBall = pixmap(BALL, { o: '#1a0b1e', b: NEUTRAL.b, l: NEUTRAL.l, d: NEUTRAL.d });

  // Grass-top hex platforms (Diamondus style): 3 shades of green, brown checker sides.
  const greens = [['#3fae4f', '#4cc25a'], ['#36a046', '#44b552'], ['#4ab858', '#57cc66']];
  greens.forEach(([a, b]) => SPR.tiles.push(makeTile(a, b, '#8a5a2a', '#5e3618', '#a8f088', '#1d5a2a')));
  SPR.tileWarn = [makeTile('#c8642a', '#d8743a', '#6a3a1a', '#3a1a0a', '#ffd08a', '#6a2a0a'),
                  makeTile('#e8a83a', '#f2b84a', '#7a4a1a', '#4a2a0a', '#fff0a0', '#8a4a0a')];

  SPR.over.move = makeOverlay('rgba(127,247,255,.28)', '#7ff7ff');
  SPR.over.shoot = makeOverlay('rgba(255,70,170,.18)', 'rgba(255,122,242,.65)');
  SPR.over.hover = makeOverlay('rgba(255,255,255,.25)', '#ffffff');
  SPR.over.target = makeOverlay('rgba(255,225,74,.45)', '#ffe14a');
}

// pointy-top hex inside a 24x28 box (1px inset gives the dark grid gaps)
const TILE_W = 24, TILE_H = 28, TILE_DEPTH = 5;
function inHex(x, y) {
  const dx = Math.abs(x + 0.5 - 12), dy = Math.abs(y + 0.5 - 14);
  return dx <= 11 && dy <= 13 - dx * 7 / 12;
}

function makeTile(topA, topB, side, sideDark, edgeLight, edgeDark) {
  const c = document.createElement('canvas');
  c.width = TILE_W; c.height = TILE_H + TILE_DEPTH;
  const g = c.getContext('2d');
  for (let y = 0; y < c.height; y++) for (let x = 0; x < TILE_W; x++) {
    let col = null;
    if (inHex(x, y)) {
      const edge = !inHex(x - 1, y) || !inHex(x + 1, y) || !inHex(x, y - 1) || !inHex(x, y + 1);
      if (edge) col = y < 14 ? edgeLight : edgeDark;
      else col = ((x >> 2) + (y >> 2)) & 1 ? topA : topB;
      if (!edge && ((x * 7 + y * 13) % 29 === 0)) col = edgeLight; // grass sparkle
    } else {
      for (let k = 1; k <= TILE_DEPTH; k++) if (inHex(x, y - k)) {
        col = k === TILE_DEPTH ? sideDark : (((x >> 1) + k) & 1 ? side : sideDark);
        break;
      }
    }
    if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); }
  }
  return c;
}

function makeOverlay(fill, border) {
  const c = document.createElement('canvas');
  c.width = TILE_W; c.height = TILE_H;
  const g = c.getContext('2d');
  for (let y = 0; y < TILE_H; y++) for (let x = 0; x < TILE_W; x++) {
    if (!inHex(x, y)) continue;
    const edge = !inHex(x - 1, y) || !inHex(x + 1, y) || !inHex(x, y - 1) || !inHex(x, y + 1);
    g.fillStyle = edge ? border : fill;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}

// --------------------------------------------------------------- background
const BG = { sky: null, far: null, near: null, stars: [] };

function buildBackground(W, H) {
  const sky = document.createElement('canvas');
  sky.width = W; sky.height = H;
  const g = sky.getContext('2d');
  const bands = ['#0b0326', '#140535', '#1f0846', '#2d0a5c', '#3f0d6c', '#561279', '#701585', '#8c1a88', '#a82284', '#c42f7c', '#dd436f', '#ef5d62', '#f97d58', '#ffa04d'];
  const bh = H * 0.78 / bands.length;
  for (let y = 0; y < H; y++) {
    const f = y / bh, i = Math.min(bands.length - 1, Math.floor(f)), frac = f - i;
    for (let x = 0; x < W; x++) {
      // ordered dither between bands
      const thr = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]][y & 3][x & 3] / 16;
      const idx = frac > 0.5 + thr * 0.5 ? Math.min(bands.length - 1, i + 1) : i;
      g.fillStyle = bands[idx];
      g.fillRect(x, y, 1, 1);
    }
  }
  // synthwave sun with stripes
  const cx = W / 2, cy = H * 0.62, R = 70;
  for (let y = -R; y <= R; y++) {
    const yy = cy + y;
    if (y > 0 && ((y >> 2) % 3 === 0) && y > 10) continue;
    const w = Math.sqrt(R * R - y * y);
    const t = (y + R) / (2 * R);
    g.fillStyle = t < 0.3 ? '#fff6a0' : t < 0.55 ? '#ffd24a' : t < 0.75 ? '#ff9a3a' : '#ff5a6a';
    g.fillRect(Math.round(cx - w), Math.round(yy), Math.round(w * 2), 1);
  }
  BG.sky = sky;
  BG.far = makeHills(W * 2, 120, '#3a0f5e', '#5a1a80', 0.012, 46, 1);
  BG.near = makeHills(W * 2, 90, '#1a0838', '#2c0f56', 0.02, 34, 2);
  for (let i = 0; i < 70; i++) BG.stars.push({ x: Math.random() * W, y: Math.random() * H * 0.45, p: Math.random() * 6.28, s: Math.random() < 0.15 ? 2 : 1 });
}

function makeHills(W, H, col, top, freq, amp, seed) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const per = W; // wrap-around seamless: frequencies are integer cycles of W
  for (let x = 0; x < W; x++) {
    const a = 2 * Math.PI * x / per;
    const h = amp + amp * 0.5 * Math.sin(a * Math.round(freq * per / (2 * Math.PI)) + seed)
            + amp * 0.3 * Math.sin(a * 7 + seed * 3) + amp * 0.15 * Math.sin(a * 19 + seed);
    const yTop = Math.round(H - h - 10);
    g.fillStyle = top; g.fillRect(x, yTop, 1, 2);
    g.fillStyle = col; g.fillRect(x, yTop + 2, 1, H - yTop);
    if ((x + yTop) % 9 === 0) { g.fillStyle = top; g.fillRect(x, yTop + 6 + (x % 13), 1, 1); }
  }
  return c;
}

function drawBackground(g, W, H, t) {
  g.drawImage(BG.sky, 0, 0);
  for (const s of BG.stars) {
    const tw = Math.sin(t * 0.003 + s.p);
    if (tw < -0.3) continue;
    g.fillStyle = tw > 0.7 ? '#ffffff' : '#b9a8ff';
    g.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
  }
  const off1 = Math.floor(t * 0.008) % BG.far.width;
  g.drawImage(BG.far, -off1, H - BG.far.height); g.drawImage(BG.far, BG.far.width - off1, H - BG.far.height);
  const off2 = Math.floor(t * 0.02) % BG.near.width;
  g.drawImage(BG.near, -off2, H - BG.near.height); g.drawImage(BG.near, BG.near.width - off2, H - BG.near.height);
}

// --------------------------------------------------------------- text
// draws on the main canvas context `g` (declared in main.js)
function pixText(str, x, y, color = '#fff', o = {}) {
  g.font = `${o.size || 8}px "Press Start 2P", monospace`;
  g.textAlign = o.align || 'left';
  g.textBaseline = 'top';
  const sh = o.shadow ?? '#1a0b1e';
  if (sh) {
    g.fillStyle = sh;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]]) g.fillText(str, x + dx, y + dy);
  }
  g.fillStyle = color;
  g.fillText(str, x, y);
}
