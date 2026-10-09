// Pixel-art assets, all built at runtime from character maps / pixel functions.
// Junkyard + gross-out cartoon look (Earthworm Jim / New Junk City vibes).
const OUT = '#1a0b10';
const PLAYER_COLORS = [
  { name: 'RED',    b: '#e8433a', l: '#ff8a6b', d: '#9c1f2a', h: '#ff6f8a', css: '#ff5a4a' },
  { name: 'BLUE',   b: '#3a7be8', l: '#86bbff', d: '#1f3d9c', h: '#6fa8ff', css: '#5a9bff' },
  { name: 'GREEN',  b: '#3ec44a', l: '#9cf28a', d: '#1c7a34', h: '#7ae88a', css: '#5ae86a' },
  { name: 'YELLOW', b: '#f2c230', l: '#fff38a', d: '#a8741c', h: '#ffe06a', css: '#ffd84a' },
  { name: 'PURPLE', b: '#a24be8', l: '#d9a6ff', d: '#5e2296', h: '#c68aff', css: '#c27aff' },
  { name: 'ORANGE', b: '#ff8a1f', l: '#ffc47a', d: '#b04a12', h: '#ffaa5a', css: '#ffa04a' },
];
const FLESH = { b: '#e89a8a', l: '#ffc8b8', d: '#a85a5a', h: '#f0a8a0' };
const SICK = { b: '#8ab840', l: '#c0e878', d: '#4a7a20', h: '#a8d060' };

// Power metadata (names shown in game). Every power comes from a ball.
const POWERS = {
  bomb:   { name: 'BUKKAKE BOMB',       desc: 'NEXT LOAD SPLASHES 7 TILES', color: '#fffbe8' },
  monkey: { name: 'GONORRHEA MONKEY',   desc: 'NEXT LOAD GIVES THE CLAP - CONTAGIOUS', color: '#8aef4a' },
  blue:   { name: 'BLUE BALLS',         desc: 'NEXT LOAD FREEZES VICTIM 1 TURN', color: '#7ff7ff' },
  dp:     { name: 'DOUBLE PENETRATION', desc: 'NEXT LOAD PIERCES JUNK + HITS ALL IN LINE', color: '#ff7af2' },
  albert: { name: 'PRINCE ALBERT',      desc: 'ARMOR - BLOCKS ONE HIT', color: '#ffd84a' },
  viagra: { name: 'VIAGRA',             desc: '+3 RANGE FOR 3 TURNS', color: '#5a9bff' },
  lube:   { name: 'LUBE',               desc: 'DASH 2 TILES FOR 3 TURNS', color: '#c8eaff' },
};
const JUNK_INFO = {
  fridge: 'BUSTED FRIDGE - BLOCKS SHOTS', tires: 'TIRE STACK - BLOCKS SHOTS', pile: 'TRASH HEAP - BLOCKS SHOTS',
  toilet: 'USED TOILET - SHOTS ARC OVER', tire: 'OLD TIRE - SHOTS ARC OVER', bag: 'TRASH BAG - SHOTS ARC OVER',
};
const TALL_JUNK = ['fridge', 'tires', 'pile'];

// o outline, h head, k shine, w eye white, p pupil, m mouth, t teeth, b shaft, l light, d dark, v vein
// googly eye-stalks on a mushroom glans, toothy grin, veiny shaft; balls are drawn separately
const DICK = [
  '..oooo....oooo..',
  '.owwwwo..owwwwo.',
  '.owwppo..owpwwo.',
  '.owwppoooowpwwo.',
  '..oooohhhhoooo..',
  '.ohhhhhhhhhhkho.',
  'ohhhhhhhhhhhhhho',
  'ohhhhmtmtmthhhho',
  'ohhhhhmmmmhhhhho',
  '.oohhhhhhhhhhoo.',
  '..oooddddddooo..',
  '....oblbbbdo....',
  '....oblbvbdo....',
  '....oblbbvdo....',
  '....oblvbbdo....',
  '....oblbbbdo....',
  '....obbvbbdo....',
  '....obbbbbdo....',
  '....obbbbbdo....',
];
const BALL = [
  '.oooooo.',
  'obbbbbbo',
  'oblbbbbo',
  'obbbbbdo',
  'obbbvbdo',
  'obbbbddo',
  '.oooooo.',
];
const MINI = [
  '.ooooo.',
  'ohhhhho',
  'ohwhwho',
  'ohhhhho',
  '.odddo.',
  '.obbbo.',
  '.obbbo.',
  'oobbboo',
  'obbobbo',
  '.oo.oo.',
];

const ICONS = {
  bomb:   { rows: ['....y..', '...o.y.', '.ooooo.', 'owwwwwo', 'owkwwwo', 'owwwwwo', '.ooooo.'], pal: { y: '#ffd84a', w: '#fffbe8', k: '#ffffff' } },
  monkey: { rows: ['.o...o.', 'obo.obo', '.obbbo.', 'obwbwbo', 'obbbbbo', 'obgggbo', '.ooooo.'], pal: { b: '#8a5a2a', w: '#ffffff', g: '#8aef4a' } },
  blue:   { rows: ['...c...', '.c.c.c.', '..ccc..', 'ccccccc', '..ccc..', '.c.c.c.', '...c...'], pal: { c: '#7ff7ff' } },
  dp:     { rows: ['.......', 'r..r...', '.r..r..', '..r..r.', '.r..r..', 'r..r...', '.......'], pal: { r: '#ff7af2' } },
  albert: { rows: ['..yyy..', '.y...y.', 'y.....y', 'y.....y', 'y.....y', '.y...y.', '..yry..'], pal: { y: '#ffd84a', r: '#ff5a4a' } },
  viagra: { rows: ['...o...', '..obo..', '.obbbo.', 'obblbbo', '.obbbo.', '..obo..', '...o...'], pal: { b: '#3a7be8', l: '#bfe0ff' } },
  lube:   { rows: ['...o...', '..owo..', '..olo..', '.olllo.', 'olllllo', 'ollwllo', '.ooooo.'], pal: { l: '#8fd0ff', w: '#ffffff' } },
};

const TOILET = [
  '..oooooooo..', '..owwwwwwo..', '..owwwwwgo..', '..oooooooo..', '.oooooooooo.', 'owwwwwwwwwwo', 'owyyyyyyyywo',
  '.owyyyyyywo.', '..owwwwwwo..', '...owwwwo...', '...owwwgo...', '..oowwwgoo..', '..owwwwwgo..', '..oooooooo..',
];
const BAG = [
  '.....yy.....', '....oyyo....', '....oKKo....', '...oKKKKo...', '..oKKkKKKo..', '.oKKkKKKKKo.', '.oKkKKKKKKo.',
  'oKKKKKKKKKKo', 'oKKKKKKKKKKo', 'oKKKKKKKKKdo', '.oKKKKKKKdo.', '..oooooooo..',
];

function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function pixmap(rows, colors) {
  const c = canvasOf(rows[0].length, rows.length), x = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, i) => {
    const col = colors[ch];
    if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
  }));
  return c;
}

// per-pixel painter: fn(x, y) -> color | null
function paint(w, h, fn) {
  const c = canvasOf(w, h), x = c.getContext('2d');
  for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
    const col = fn(i, y);
    if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
  }
  return c;
}

const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; };
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function dickColors(p, variant) {
  const c = { o: OUT, h: p.h, k: '#ffffff', w: '#ffffff', p: OUT, m: '#3a0a14', t: '#fff8d0', b: p.b, l: p.l, d: p.d, v: p.d };
  if (variant === 'blink') { c.w = p.d; c.p = p.d; }
  if (variant === 'angry') c.p = '#d01010';
  if (variant === 'sick') Object.assign(c, { h: SICK.h, b: SICK.b, l: SICK.l, d: SICK.d, v: '#2a5a10', w: '#e8f0a0' });
  if (variant === 'flash') for (const k in c) c[k] = '#ffffff';
  if (variant === 'ghost') for (const k in c) c[k] = k === 'o' ? 'rgba(255,255,255,.55)' : 'rgba(200,230,255,.35)';
  return c;
}

const SPR = { dick: [], ball: [], mini: [], icons: {}, tiles: [], tileWarn: [], over: {}, junk: {} };

function buildSprites() {
  PLAYER_COLORS.forEach((p, i) => {
    SPR.dick[i] = {};
    for (const v of ['normal', 'blink', 'angry', 'flash', 'ghost', 'sick']) SPR.dick[i][v] = pixmap(DICK, dickColors(p, v));
    SPR.ball[i] = pixmap(BALL, { o: OUT, b: p.d, l: p.l, d: '#2a0a20', v: p.b });
    SPR.mini[i] = pixmap(MINI, { o: OUT, h: p.h, w: '#fff', d: p.d, b: p.b });
  });
  SPR.ballFlash = pixmap(BALL, { o: '#fff', b: '#fff', l: '#fff', d: '#fff', v: '#fff' });
  SPR.fleshBall = pixmap(BALL, { o: OUT, b: FLESH.b, l: FLESH.l, d: FLESH.d, v: '#c06a7a' });
  for (const k in ICONS) SPR.icons[k] = pixmap(ICONS[k].rows, { o: OUT, ...ICONS[k].pal });

  // dirt platforms with junk debris - 6 variants so the pattern doesn't visibly repeat
  [['#8a5a32', '#7a4e2a'], ['#946238', '#84552e'], ['#7e5230', '#704628'],
   ['#8a5a32', '#80522c'], ['#90603a', '#7e5230'], ['#865830', '#784c2a']].forEach(([a, b], i) =>
    SPR.tiles.push(makeTile(a, b, '#5a3418', '#3a200e', '#b07c48', '#4a2a14', i * 13 + 1)));
  SPR.tileWarn = [makeTile('#a8402a', '#983a26', '#5a2010', '#3a1008', '#ff9a6a', '#4a1408', 9),
                  makeTile('#c85a2a', '#b84e26', '#6a2a10', '#3a1408', '#ffc08a', '#5a1a08', 9)];

  SPR.over.move = makeOverlay('rgba(154,255,90,.28)', '#9aff5a');
  SPR.over.dash = makeOverlay('rgba(143,208,255,.22)', '#8fd0ff');
  SPR.over.shoot = makeOverlay('rgba(255,70,120,.16)', 'rgba(255,110,150,.7)');
  SPR.over.splash = makeOverlay('rgba(255,250,220,.35)', '#fffbe8');
  SPR.over.hover = makeOverlay('rgba(255,255,255,.25)', '#ffffff');
  SPR.over.target = makeOverlay('rgba(255,216,74,.45)', '#ffd84a');

  SPR.junk = { fridge: makeFridge(), tires: makeTireStack(), pile: makePile(), tire: makeTire(),
    toilet: pixmap(TOILET, { o: OUT, w: '#e8e8dc', g: '#a8a89a', y: '#c8b030' }),
    bag: pixmap(BAG, { o: OUT, K: '#2a2a32', k: '#5a5a6a', y: '#e8c030', d: '#141418' }) };
}

// pointy-top hex in a 24x28 box (1px inset leaves dark grid gaps)
const TILE_W = 24, TILE_H = 28, TILE_DEPTH = 6;
function inHex(x, y) {
  const dx = Math.abs(x + 0.5 - 12), dy = Math.abs(y + 0.5 - 14);
  return dx <= 11 && dy <= 13 - dx * 7 / 12;
}

function makeTile(topA, topB, side, sideDark, edgeLight, edgeDark, seed) {
  const debris = ['#9a9a9a', '#b0502a', '#4a8a3a', '#d8d0b0', '#3a2a1a'];
  return paint(TILE_W, TILE_H + TILE_DEPTH, (x, y) => {
    if (inHex(x, y)) {
      const edge = !inHex(x - 1, y) || !inHex(x + 1, y) || !inHex(x, y - 1) || !inHex(x, y + 1);
      if (edge) return y < 14 ? edgeLight : edgeDark;
      const h = hash(x, y, seed);
      if (h % 47 === 0) return debris[h % debris.length];
      return h % 3 ? topA : topB;
    }
    for (let k = 1; k <= TILE_DEPTH; k++) if (inHex(x, y - k)) {
      if (k === TILE_DEPTH) return OUT;
      return hash(x, k, seed) % 7 === 0 ? '#9a7a5a' : (((x >> 1) + k) & 1 ? side : sideDark);
    }
    return null;
  });
}

function makeOverlay(fill, border) {
  return paint(TILE_W, TILE_H, (x, y) => {
    if (!inHex(x, y)) return null;
    const edge = !inHex(x - 1, y) || !inHex(x + 1, y) || !inHex(x, y - 1) || !inHex(x, y + 1);
    return edge ? border : fill;
  });
}

function makeFridge() {
  return paint(14, 24, (x, y) => {
    if (x === 0 || x === 13 || y === 0 || y === 23) return OUT;
    if (y === 8) return '#6a6658';
    if (x === 2 && ((y >= 3 && y <= 6) || (y >= 11 && y <= 16))) return '#7a7a7a';
    if (hash(x, y, 7) % 13 === 0 || (x > 8 && y > 17 && hash(x, y, 3) % 3 === 0)) return '#a0502a';
    if (x >= 11) return '#b8b4a0';
    if (x === 1 || y === 1 || y === 9) return '#fffcf0';
    return '#e0dcc8';
  });
}

function makeTireStack() {
  const tire = (x, y, cy) => {
    const dx = (x + 0.5 - 9) / 8.6, dy = (y + 0.5 - cy) / 4;
    const d = dx * dx + dy * dy;
    if (d > 1) return null;
    if (d > 0.82) return OUT;
    const ix = (x + 0.5 - 9) / 3.6, iy = (y + 0.5 - cy + 0.6) / 1.6;
    if (ix * ix + iy * iy < 1) return '#0e0c0a';
    return y < cy - 1 ? '#5a5650' : (x + y) % 3 ? '#2e2a26' : '#3a3632';
  };
  return paint(18, 20, (x, y) => tire(x, y, 5) || tire(x, y, 10) || tire(x, y, 15));
}

function makeTire() {
  return paint(12, 12, (x, y) => {
    const d = Math.hypot(x + 0.5 - 6, y + 0.5 - 6);
    if (d > 6) return null;
    if (d > 5.3) return OUT;
    if (d < 2.2) return null;
    if (d < 2.9) return OUT;
    if (d > 4.3) return (Math.atan2(y - 6, x - 6) * 4 | 0) & 1 ? '#3a3632' : '#2a2622';
    return y < 6 ? '#5a5650' : '#3a3632';
  });
}

function makePile() {
  const r = rng(42), junkCols = ['#6a5a4a', '#8a3a2a', '#4a6a5a', '#9a8a6a', '#3a3a4a', '#a87a3a', '#5a4a6a', '#c8c0a0'];
  const blobs = Array.from({ length: 18 }, () => ({ x: 2 + r() * 18, y: 6 + r() * 12, s: 1 + r() * 2.5, c: junkCols[(r() * junkCols.length) | 0] }));
  const inside = (x, y) => { const dx = (x + 0.5 - 11) / 11, dy = (y + 0.5 - 18) / 14; return dx * dx + dy * dy <= 1 && y < 18; };
  return paint(22, 18, (x, y) => {
    if (x >= 3 && x <= 4 && y >= 1 && y <= 7) return y === 1 ? OUT : '#8a8a8a';      // pipe
    if (Math.abs(Math.hypot(x - 16, y - 6) - 2.6) < 0.8) return OUT;                   // wheel
    if (!inside(x, y)) return null;
    if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1)) return OUT;
    for (const b of blobs) if (Math.abs(x - b.x) < b.s && Math.abs(y - b.y) < b.s) return b.c;
    return hash(x, y, 5) % 2 ? '#4a3a2a' : '#3a2c20';
  });
}

// --------------------------------------------------------------- bitmap font (3x5)
const FONT = (() => {
  const g = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '111101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
    9: '111101111001110', '!': '010010010000010', '?': '110001010000010', '.': '000000000000010', ',': '000000000010100',
    ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', "'": '010010000000000',
    '(': '001010010010001', ')': '100010010010100', '%': '101001010100101', '>': '100010001010100', '<': '001010100010001',
    '=': '000111000111000', '*': '101010101000000', '#': '101111101111101', '[': '011010010010011', ']': '110010010010110',
    '_': '000000000000111', '&': '010101010101011', ' ': '000000000000000',
  };
  return g;
})();
const textWidth = (s, scale = 1) => (s.length * 4 - 1) * scale;

// draws on the main canvas context `g` (declared in main.js)
function pixText(str, x, y, color = '#fff', o = {}) {
  const s = o.scale || 1;
  str = String(str).toUpperCase();
  const w = textWidth(str, s);
  x = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
  y = Math.round(y);
  const shadow = o.shadow === undefined ? OUT : o.shadow;
  const pass = (ox, oy, col) => {
    g.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const bits = FONT[str[i]] || FONT['?'];
      for (let b = 0; b < 15; b++) if (bits[b] === '1') g.fillRect(x + (i * 4 + b % 3) * s + ox, y + ((b / 3) | 0) * s + oy, s, s);
    }
  };
  if (shadow) { pass(s, 0, shadow); pass(0, s, shadow); pass(s, s, shadow); pass(-s, 0, shadow); pass(0, -s, shadow); }
  pass(0, 0, color);
  return w;
}

// --------------------------------------------------------------- background (junkyard dusk)
const BG = { sky: null, far: null, near: null, w: 0, h: 0 };

function buildBackground(W, H) {
  if (BG.w === W && BG.h === H) return;
  BG.w = W; BG.h = H;
  const bands = ['#1c0f1f', '#2a1428', '#3d1a2c', '#55222e', '#6e2c2e', '#8a3a2c', '#a64e2a', '#c0662a', '#d6802e', '#e69a38', '#f0b44a', '#f6cc66'];
  const bh = H * 0.8 / bands.length;
  const D = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const sunX = W * 0.68, sunY = H * 0.55, sunR = H * 0.2;
  const r = rng(7);
  const clouds = Array.from({ length: 7 }, () => ({ x: r() * W, y: H * (0.15 + r() * 0.35), w: 30 + r() * 70, h: 4 + r() * 6 }));
  BG.sky = paint(W, H, (x, y) => {
    const f = y / bh, i = Math.min(bands.length - 1, Math.floor(f)), frac = f - i;
    let col = bands[frac > 0.5 + D[y & 3][x & 3] / 32 ? Math.min(bands.length - 1, i + 1) : i];
    const sd = Math.hypot(x - sunX, (y - sunY) * 1.1);
    if (sd < sunR) col = sd < sunR - 2 ? (y % 6 < 2 && y > sunY ? '#f0b44a' : '#fae0a0') : '#f6cc66';
    // dithered smog clouds drifting in front of the sun
    for (const c of clouds) {
      const dx = (x - c.x) / c.w, dy = (y - c.y) / c.h, d = dx * dx + dy * dy;
      if (d < 1) { col = d < 0.55 ? '#7a3a34' : ((x + y) & 1 ? '#7a3a34' : col); break; }
    }
    return col;
  });
  BG.far = makeJunkLayer(W * 2, Math.round(H * 0.5), '#3a1a26', '#5a2a30', 11, 0.35);
  BG.near = makeJunkLayer(W * 2, Math.round(H * 0.4), '#1e0c14', '#3a1a20', 23, 0.25);
}

function makeJunkLayer(w, h, col, rim, seed, amp) {
  const r = rng(seed), A = h * amp;
  const top = new Array(w);
  for (let x = 0; x < w; x++) {
    const a = 2 * Math.PI * x / w;
    top[x] = h - A - A * 0.5 * Math.sin(a * 3 + seed) - A * 0.3 * Math.sin(a * 11 + seed * 2) - A * 0.12 * Math.sin(a * 37);
  }
  const shapes = [];
  for (let i = 0; i < w / 28; i++) {
    const x = r() * w, base = top[Math.floor(x)];
    const k = r();
    if (k < 0.35) shapes.push({ t: 'tire', x, y: base - 3, rr: 4 + r() * 4 });
    else if (k < 0.6) shapes.push({ t: 'box', x, y: base, w: 8 + r() * 10, h: 10 + r() * 14 });
    else if (k < 0.8) shapes.push({ t: 'car', x, y: base, w: 26 + r() * 10 });
    else if (k < 0.88) shapes.push({ t: 'crane', x, y: base, h: h * 0.7 });
  }
  const solid = (x, y) => {
    if (y >= top[((x % w) + w) % w]) return true;
    for (const s of shapes) {
      const dx = x - s.x;
      if (s.t === 'tire' && Math.hypot(dx, y - s.y) < s.rr && Math.hypot(dx, y - s.y) > s.rr * 0.45) return true;
      if (s.t === 'box' && dx >= 0 && dx < s.w && y > s.y - s.h && y <= s.y) return true;
      if (s.t === 'car' && dx >= 0 && dx < s.w && ((y > s.y - 7 && y <= s.y) || (y > s.y - 12 && dx > s.w * 0.25 && dx < s.w * 0.7))) return true;
      if (s.t === 'crane' && ((dx >= 0 && dx < 3 && y > s.y - s.h) || (y > s.y - s.h - 2 && y <= s.y - s.h && dx > -30 && dx < 12) || (dx === -24 && y > s.y - s.h && y < s.y - s.h + 18))) return true;
    }
    return false;
  };
  return paint(w, h, (x, y) => {
    if (!solid(x, y)) return null;
    if (!solid(x, y - 1)) return rim;
    if (hash(x, y, seed) % 61 === 0) return rim;
    return col;
  });
}

function drawBackground(g, W, H, t, camX = 0) {
  g.drawImage(BG.sky, 0, 0);
  const off1 = (((Math.round(camX * 0.15 + t * 0.002)) % BG.far.width) + BG.far.width) % BG.far.width;
  g.drawImage(BG.far, -off1, H - BG.far.height); g.drawImage(BG.far, BG.far.width - off1, H - BG.far.height);
  const off2 = (((Math.round(camX * 0.35 + t * 0.005)) % BG.near.width) + BG.near.width) % BG.near.width;
  g.drawImage(BG.near, -off2, H - BG.near.height); g.drawImage(BG.near, BG.near.width - off2, H - BG.near.height);
}

// buzzing flies around a point (pure function of time, no state)
function drawFlies(g, x, y, t, n = 2, seed = 0) {
  for (let i = 0; i < n; i++) {
    const k = seed * 7.3 + i * 2.1;
    const fx = Math.round(x + Math.sin(t * 0.004 * (1 + i * 0.3) + k) * 9 + Math.sin(t * 0.017 + k) * 2);
    const fy = Math.round(y + Math.cos(t * 0.006 * (1 + i * 0.2) + k) * 5 + Math.sin(t * 0.021 + k) * 2);
    g.fillStyle = OUT; g.fillRect(fx, fy, 1, 1);
    g.fillStyle = (t / 40 + i) % 2 < 1 ? '#d8e0e8' : '#8a9098'; g.fillRect(fx, fy - 1, 1, 1);
  }
}
