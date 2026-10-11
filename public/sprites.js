// Pixel-art assets, all built at runtime from pixel functions / character maps.
// Junkyard + gross-out cartoon look (Earthworm Jim / New Junk City vibes).
const OUT = '#1a0b10';
// Player colors = TMNT-style bandana colors
const PLAYER_COLORS = [
  { name: 'RED',    b: '#e8433a', l: '#ff8a6b', d: '#9c1f2a', css: '#ff5a4a' },
  { name: 'BLUE',   b: '#3a7be8', l: '#86bbff', d: '#1f3d9c', css: '#5a9bff' },
  { name: 'GREEN',  b: '#3ec44a', l: '#9cf28a', d: '#1c7a34', css: '#5ae86a' },
  { name: 'YELLOW', b: '#f2c230', l: '#fff38a', d: '#a8741c', css: '#ffd84a' },
  { name: 'PURPLE', b: '#a24be8', l: '#d9a6ff', d: '#5e2296', css: '#c27aff' },
  { name: 'ORANGE', b: '#ff8a1f', l: '#ffc47a', d: '#b04a12', css: '#ffa04a' },
];

// Character classes (rules mirrored in server.py CLASSES)
const CLASS_ORDER = ['turtle', 'johnson', 'longdong', 'quickie', 'doc', 'punk'];
const CLASS_INFO = {
  turtle:   { name: 'TURTLENECK', skin: '#7ab84a', shape: { sw: 11, sh: 13, hw: 7, hh: 8.5, hood: true }, ball: [13, 12],
              ability: 'SHELL UP', lines: ['STAY PUT = BLOCK EVERY HIT THAT TURN', 'UNCUT, GREEN, LOVES PIZZA'],
              stats: { balls: 2, rng: 0, move: 1, minr: 1 } },
  johnson:  { name: 'BIG JOHNSON', skin: '#d8746a', shape: { sw: 14, sh: 13, hw: 10, hh: 7 }, ball: [15, 13],
              ability: 'HEAVY SACK', lines: ['STARTS WITH 3 BALLS', '-1 RANGE. ALL MEAT, NO AIM'],
              stats: { balls: 3, rng: -1, move: 1, minr: 1 } },
  longdong: { name: 'LONG DONG', skin: '#c8905a', shape: { sw: 8, sh: 20, hw: 6.5, hh: 6 }, ball: [12, 11],
              ability: 'SNIPER', lines: ['+2 RANGE', "CAN'T SHOOT ADJACENT TILES"],
              stats: { balls: 2, rng: 2, move: 1, minr: 2 } },
  quickie:  { name: 'QUICKIE', skin: '#f0a090', shape: { sw: 9, sh: 8, hw: 7.5, hh: 6 }, ball: [12, 11],
              ability: 'PREMATURE', lines: ['MOVES UP TO 2 TILES PER TURN', '-1 RANGE. DONE IN 2 SECONDS'],
              stats: { balls: 2, rng: -1, move: 2, minr: 1 } },
  doc:      { name: 'DR. CLAP', skin: '#d0c8a8', shape: { sw: 11, sh: 13, hw: 8.5, hh: 6.5 }, ball: [13, 12],
              ability: 'PATIENT ZERO', lines: ['IMMUNE TO THE CLAP', 'EVERY 3RD LOAD GIVES THE CLAP'],
              stats: { balls: 2, rng: 0, move: 1, minr: 1 } },
  punk:     { name: 'PIERCED PUNK', skin: '#e0849a', shape: { sw: 11, sh: 13, hw: 8.5, hh: 6.5 }, ball: [13, 12],
              ability: 'METALHEAD', lines: ['STARTS WITH A PRINCE ALBERT RING', 'RINGS STACK UP TO 3'],
              stats: { balls: 2, rng: 0, move: 1, minr: 1 } },
};

// Items carried by balls. Powers help you, curses hurt you - both still give +1 ball.
const ITEMS = {
  bomb:    { name: 'BUKKAKE BOMB', kind: 'POWER - NEXT LOAD', color: '#fffbe8',
             lines: ['SPLASHES TARGET + ALL 6 TILES AROUND IT', "FRIENDLY FIRE: YES. DON'T AIM NEXT TO YOU"] },
  monkey:  { name: 'GONORRHEA MONKEY', kind: 'POWER - NEXT LOAD', color: '#8aef4a',
             lines: ['VICTIM GETS THE CLAP: -1 BALL IN 3 TURNS', 'CONTAGIOUS: SPREADS TO DICKS NEXT TO THEM'] },
  blue:    { name: 'BLUE BALLS', kind: 'POWER - NEXT LOAD', color: '#7ff7ff',
             lines: ['VICTIM IS FROZEN SOLID FOR 1 TURN', "FROZEN = CAN'T MOVE OR SHOOT"] },
  dp:      { name: 'DOUBLE PENETRATION', kind: 'POWER - NEXT LOAD', color: '#ff7af2',
             lines: ['GOES STRAIGHT THROUGH JUNK', 'HITS EVERY DICK ALONG THE LINE'] },
  albert:  { name: 'PRINCE ALBERT', kind: 'POWER - ARMOR', color: '#ffd84a',
             lines: ['RING THROUGH THE TIP. BLOCKS 1 HIT', 'STACKS TO 2 (PUNK: 3)', 'USELESS AGAINST THE CLAP AND HOLES'] },
  viagra:  { name: 'VIAGRA', kind: 'POWER - 3 TURNS', color: '#5a9bff',
             lines: ['+3 RANGE', 'SEE A DOCTOR AFTER 4 HOURS'] },
  lube:    { name: 'LUBE', kind: 'POWER - 3 TURNS', color: '#c8eaff',
             lines: ['+1 MOVE: SLIDE ONE TILE FURTHER'] },
  whiskey: { name: 'WHISKEY DICK', kind: 'CURSE - 2 TURNS', color: '#e0a050', curse: true,
             lines: ["CAN'T SHOOT AT ALL", 'TOO DRUNK TO PERFORM'] },
  shrink:  { name: 'SHRINKAGE', kind: 'CURSE - 3 TURNS', color: '#8fd0ff', curse: true,
             lines: ['RANGE DROPS TO 1', 'I WAS IN THE POOL!'] },
  crabs:   { name: 'CRABS', kind: 'CURSE - 2 TURNS', color: '#ff5a4a', curse: true,
             lines: ['YOUR MOVES GO IN A RANDOM DIRECTION', 'SCRATCH SCRATCH SCRATCH'] },
};
const STATUS = {
  infected: { name: 'THE CLAP', color: '#8aef4a', icon: 'clap', lines: ['LOSE 1 BALL WHEN THE COUNTER HITS 0', 'INFECTS DICKS STANDING NEXT TO YOU'] },
  immune:   { name: 'IMMUNE', color: '#8aef4a', icon: 'immune', lines: ["JUST HAD THE CLAP - CAN'T CATCH IT AGAIN YET"] },
  frozen:   { name: 'FROZEN', color: '#7ff7ff', icon: 'blue', lines: ['BLUE BALLS: SKIPS THIS TURN'] },
};
const JUNK_INFO = {
  fridge: ['BUSTED FRIDGE', 'BLOCKS MOVING AND SHOTS'], tires: ['TIRE STACK', 'BLOCKS MOVING AND SHOTS'],
  pile: ['TRASH HEAP', 'BLOCKS MOVING AND SHOTS'], toilet: ['USED TOILET', 'BLOCKS MOVING. SHOTS ARC OVER'],
  tire: ['OLD TIRE', 'BLOCKS MOVING. SHOTS ARC OVER'], bag: ['TRASH BAG', 'BLOCKS MOVING. SHOTS ARC OVER'],
};
const TALL_JUNK = ['fridge', 'tires', 'pile'];

const ICONS = {
  bomb:    { rows: ['....y..', '...o.y.', '.ooooo.', 'owwwwwo', 'owkwwwo', 'owwwwwo', '.ooooo.'], pal: { y: '#ffd84a', w: '#fffbe8', k: '#ffffff' } },
  monkey:  { rows: ['.o...o.', 'obo.obo', '.obbbo.', 'obwbwbo', 'obbbbbo', 'obgggbo', '.ooooo.'], pal: { b: '#8a5a2a', w: '#ffffff', g: '#8aef4a' } },
  blue:    { rows: ['...c...', '.c.c.c.', '..ccc..', 'ccccccc', '..ccc..', '.c.c.c.', '...c...'], pal: { c: '#7ff7ff' } },
  dp:      { rows: ['.......', 'r..r...', '.r..r..', '..r..r.', '.r..r..', 'r..r...', '.......'], pal: { r: '#ff7af2' } },
  albert:  { rows: ['..yyy..', '.y...y.', 'y.....y', 'y.....y', 'y.....y', '.y...y.', '..yry..'], pal: { y: '#ffd84a', r: '#ff5a4a' } },
  viagra:  { rows: ['...o...', '..obo..', '.obbbo.', 'obblbbo', '.obbbo.', '..obo..', '...o...'], pal: { b: '#3a7be8', l: '#bfe0ff' } },
  lube:    { rows: ['...o...', '..owo..', '..olo..', '.olllo.', 'olllllo', 'ollwllo', '.ooooo.'], pal: { l: '#8fd0ff', w: '#ffffff' } },
  whiskey: { rows: ['..ooo..', '..obo..', '.obbbo.', 'obbbbbo', 'obyyybo', 'obbbbbo', '.ooooo.'], pal: { b: '#a8642a', y: '#f0e0a0' } },
  shrink:  { rows: ['...s...', '...s...', '.s.s.s.', '..sss..', '...s...', '.......', '.sssss.'], pal: { s: '#8fd0ff' } },
  crabs:   { rows: ['r.....r', '.r...r.', 'r.rrr.r', '.rwrwr.', 'rrrrrrr', '.r.r.r.', 'r.....r'], pal: { r: '#ff5a4a', w: '#ffffff' } },
  clap:    { rows: ['...g...', '..ggg..', '.ggggg.', 'ggggggg', 'ggwgggg', '.ggggg.', '..ggg..'], pal: { g: '#8aef4a', w: '#e8ffd0' } },
  immune:  { rows: ['.......', '..ggg..', '..ggg..', 'ggggggg', '..ggg..', '..ggg..', '.......'], pal: { g: '#8aef4a' } },
  shell:   { rows: ['..ooo..', '.obybo.', 'obybybo', 'oyyyyyo', 'obybybo', '.obybo.', '..ooo..'], pal: { b: '#5a4418', y: '#a8843a' } },
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
const rgbOf = h => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
function mix(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function whiteOut(src, fill) {   // silhouette of a sprite in one color (hit flash / ghost)
  const c = canvasOf(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in';
  x.fillStyle = fill; x.fillRect(0, 0, c.width, c.height);
  return c;
}

// --------------------------------------------------------------- characters
// Bodies are generated from a few shape numbers, shaded, auto-outlined, then dressed.
const CW = 32, CH = 40, CX = 16, BASE = 37;   // sprite box; BASE = shaft bottom row
const CHAR_META = {}, charCache = new Map(), ballCache = new Map();

function getChar(cls, color, variant = 'normal') {
  const k = cls + color + variant;
  if (!charCache.has(k)) {
    charCache.set(k, variant === 'flash' ? whiteOut(getChar(cls, color), '#ffffff')
      : variant === 'ghost' ? whiteOut(getChar(cls, color), 'rgba(210,235,255,.5)')
      : buildChar(cls, color, variant));
  }
  return charCache.get(k);
}

function buildChar(cls, color, variant) {
  const info = CLASS_INFO[cls], S = info.shape, band = PLAYER_COLORS[color];
  const skin = variant === 'sick' ? mix(info.skin, '#8ab840', 0.6) : info.skin;
  const head = S.hood ? skin : mix(skin, '#ff7a94', 0.3);
  const px = Array.from({ length: CH }, () => Array(CW).fill(null));
  const body = Array.from({ length: CH }, () => Array(CW).fill(false));
  const acc = Array.from({ length: CH }, () => Array(CW).fill(false));
  const put = (x, y, c, isAcc = true) => { if (x >= 0 && x < CW && y >= 0 && y < CH) { px[y][x] = c; if (isAcc) acc[y][x] = true; } };
  const shaftTop = BASE - S.sh, sx0 = Math.round(CX - S.sw / 2), sx1 = sx0 + S.sw;
  const hy = shaftTop - S.hh * 0.6;
  const isHead = (x, y) => { const dx = (x + 0.5 - CX) / S.hw, dy = (y + 0.5 - hy) / S.hh; return dx * dx + dy * dy <= 1 && y <= shaftTop + 1; };

  // TMNT shell behind the turtle
  if (cls === 'turtle') {
    const scy = shaftTop + S.sh * 0.45;
    const inShell = (x, y) => { const dx = (x + 0.5 - CX) / (S.sw / 2 + 5), dy = (y + 0.5 - scy) / (S.sh * 0.75); return dx * dx + dy * dy <= 1; };
    for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) if (inShell(x, y)) {
      const edge = !inShell(x - 1, y) || !inShell(x + 1, y) || !inShell(x, y - 1) || !inShell(x, y + 1);
      px[y][x] = edge ? OUT : ((x + y) % 5 === 0 || (x - y) % 5 === 0) ? '#5a4418' : y < scy ? '#b8943e' : '#8a6a2a';
    }
  }

  // body: shaft + head, shaded left-light / right-dark
  let headTop = CH;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    let mat = null;
    if (y >= shaftTop && y <= BASE && x >= sx0 && x < sx1) mat = 'S';
    if (isHead(x, y)) mat = y >= shaftTop && !S.hood ? 'R' : 'H';
    if (!mat) continue;
    body[y][x] = true;
    if (mat !== 'S') headTop = Math.min(headTop, y);
    const w = mat === 'S' ? S.sw : 2 * S.hw, x0 = mat === 'S' ? sx0 : CX - S.hw;
    const rel = (x + 0.5 - x0) / w;
    const base = mat === 'S' ? skin : mat === 'R' ? mix(skin, '#000000', 0.3) : head;
    let c = rel < 0.28 ? mix(base, '#ffffff', 0.28) : rel > 0.72 ? mix(base, '#000000', 0.22) : base;
    const dx = (x + 0.5 - CX) / S.hw, dy = (y + 0.5 - hy) / S.hh;
    if (mat === 'H' && dx < -0.15 && dx > -0.65 && dy < -0.3 && dy > -0.9) c = mix(head, '#ffffff', 0.5);   // gloss
    if (mat === 'S' && rel > 0.3 && rel < 0.72 && hash(x, y, 7) % 11 === 0) c = mix(skin, '#7a2050', 0.45); // veins
    if (mat === 'S' && y === BASE) c = mix(skin, '#000000', 0.25);
    px[y][x] = c;
  }
  if (cls === 'johnson') for (let y = shaftTop + 2; y < BASE; y++) px[y][CX - 1 + Math.round(Math.sin(y * 0.9) * 2)] = mix(skin, '#6a1a50', 0.55);
  if (S.hood) {   // foreskin folds and a puckered tip
    for (const fy of [shaftTop - 1, headTop + 2]) for (let x = 0; x < CW; x++)
      if (body[fy] && body[fy][x] && Math.abs(x + 0.5 - CX) < S.hw - 1.5) px[fy][x] = mix(skin, '#000000', 0.3);
    px[headTop][CX - 1] = '#c05a6a'; px[headTop][CX] = '#c05a6a';
  }
  // outline around the body
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (body[y][x]) continue;
    if ((body[y - 1] && body[y - 1][x]) || (body[y + 1] && body[y + 1][x]) || body[y][x - 1] || body[y][x + 1]) px[y][x] = OUT;
  }

  // face: TMNT bandana with googly eye holes
  const ey = Math.round(hy) - 1;
  for (let y = ey - 2; y <= ey + 1; y++) for (let x = 0; x < CW; x++)
    if (body[y][x] && y < shaftTop) px[y][x] = y === ey - 2 ? band.l : y === ey + 1 ? band.d : band.b;
  const eyes = S.hw >= 7 ? [CX - 5, CX + 2] : [CX - 4, CX + 1];
  if (cls === 'longdong') {   // sniper shades
    for (const ex of eyes) for (let y = ey - 1; y <= ey + 1; y++) for (let x = ex - 1; x < ex + 4; x++) px[y][x] = '#141418';
    for (let x = eyes[0] + 3; x < eyes[1] - 1; x++) px[ey - 1][x] = '#141418';
    for (const ex of eyes) { px[ey - 1][ex] = '#ffffff'; px[ey][ex - 1] = '#3a3a48'; }
  } else for (const [i, ex] of eyes.entries()) {
    for (let y = ey - 1; y <= ey + 1; y++) for (let x = ex; x < ex + 3; x++) px[y][x] = variant === 'blink' ? (y === ey ? band.d : band.b) : '#ffffff';
    if (variant !== 'blink') {
      const pupil = variant === 'angry' ? '#d01010' : OUT, pxx = ex + (i === 0 ? 0 : 1);
      px[ey][pxx] = pupil; px[ey + 1][pxx] = pupil;      // googly: looking in different directions
      if (i === 1) px[ey][pxx + 1] = pupil;
    }
  }

  // mouth (or mask / mustache)
  const my = ey + 2, mw = S.hw >= 8 ? 8 : 6, mx0 = CX - mw / 2;
  if (cls === 'doc') {
    for (let y = my; y <= my + 1; y++) for (let x = 0; x < CW; x++)
      if (body[y][x] && y < shaftTop) px[y][x] = y === my ? '#e0f0f6' : '#a8c8d8';
    for (let x = 0; x < CW; x++) if (body[my][x] && !body[my][x - 1]) { put(x - 1, my, '#e0f0f6'); put(x - 2, my - 1, '#e0f0f6'); }
    for (let x = CW - 1; x >= 0; x--) if (body[my][x] && !body[my][x + 1]) { put(x + 1, my, '#e0f0f6'); put(x + 2, my - 1, '#e0f0f6'); }
    for (let y = ey - 5; y <= ey - 3; y++) for (let x = CX - 6; x <= CX - 3; x++) if (body[y] && body[y][x]) px[y][x] = y === ey - 5 && x === CX - 5 ? '#ffffff' : y === ey - 3 ? '#8a98a8' : '#c8d4e0';
  } else {
    if (my < shaftTop) for (let x = mx0; x < mx0 + mw; x++) px[my][x] = x % 2 ? '#fff8d0' : '#3a0a14';
    if (my + 1 < shaftTop + (S.hood ? 0 : 1)) for (let x = mx0 + 1; x < mx0 + mw - 1; x++) px[my + 1][x] = '#3a0a14';
    if (cls === 'johnson') {   // macho mustache
      for (let x = mx0 - 1; x < mx0 + mw + 1; x++) px[my][x] = '#3a2010';
      px[my - 1][mx0 - 1] = '#3a2010'; px[my - 1][mx0 + mw] = '#3a2010';
    }
    if (cls === 'quickie') { put(CX + 1, my + 2, '#ff6a8a'); put(CX + 1, my + 3, OUT); put(CX + 2, my + 2, OUT); }
  }

  // class gear
  if (cls === 'quickie') {   // sweatband
    for (let x = 0; x < CW; x++) {
      if (body[headTop + 1] && body[headTop + 1][x]) px[headTop + 1][x] = '#f4f4f4';
      if (body[headTop + 2] && body[headTop + 2][x] && headTop + 2 < ey - 2) px[headTop + 2][x] = '#e8433a';
    }
  }
  if (cls === 'punk') {      // pink mohawk + piercings
    for (let i = 0; i < 5; i++) {
      const sx = CX - 5 + i * 2, h = 4 + (i % 2) * 2;
      for (let k = 0; k < h; k++) {
        put(sx, headTop - 1 - k, k === h - 1 ? '#ff8ad0' : '#ff3aa0');
        if (k < h - 1) put(sx + 1, headTop - 1 - k, '#c01070');
      }
    }
    for (const ry of [shaftTop + 3, shaftTop + 7]) { put(sx0 - 1, ry, '#ffd84a'); put(sx0 - 2, ry, '#ffd84a'); put(sx0 - 1, ry + 1, '#c8a020'); }
    put(CX + 5, ey - 3, '#ffd84a'); put(CX + 6, ey - 3, '#ffd84a');
    for (let k = 0; k < 4; k++) put(sx1 - 3, shaftTop + 4 + k, '#2a1a3a', false);   // tattoo
  }
  // outline around gear that sticks out
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) {
    if (px[y][x] !== null || body[y][x]) continue;
    if ((acc[y - 1] && acc[y - 1][x]) || (acc[y + 1] && acc[y + 1][x]) || acc[y][x - 1] || acc[y][x + 1]) px[y][x] = OUT;
  }

  CHAR_META[cls] = { headTop, ey, shaftTop, hood: !!S.hood };
  return paint(CW, CH, (x, y) => px[y][x]);
}

function getBall(cls, variant = 'normal', small = false) {
  const k = cls + variant + small;
  if (!ballCache.has(k)) ballCache.set(k, variant === 'flash' ? whiteOut(getBall(cls, 'normal', small), '#ffffff') : buildBall(cls, variant, small));
  return ballCache.get(k);
}

// wrinkly, slightly hairy balls
function buildBall(cls, variant, small) {
  const info = CLASS_INFO[cls] || { skin: '#e89a8a', ball: [9, 8] };
  const [w, h] = small ? [9, 8] : info.ball;
  const skin = variant === 'sick' ? mix(info.skin, '#8ab840', 0.6) : variant === 'loose' ? '#e89a8a' : info.skin;
  const base = mix(skin, '#7a2a3a', 0.22), W2 = w + 2, H2 = h + 2, cx = W2 / 2, cy = H2 / 2;
  const inside = (x, y) => { const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - cy) / (h / 2); return dx * dx + dy * dy <= 1; };
  return paint(W2, H2, (x, y) => {
    if (!inside(x, y)) {
      if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) return OUT;
      return null;
    }
    const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - cy) / (h / 2);
    if (dx < -0.2 && dx > -0.7 && dy < -0.15 && dy > -0.75) return mix(base, '#ffffff', 0.35);
    if (!small && Math.abs(Math.sin(x * 1.3 + y * 0.6)) < 0.13 && dy > -0.4) return mix(base, '#000000', 0.28);   // wrinkles
    if (!small && hash(x, y, 5) % 17 === 0) return OUT;   // hairs
    return dx > 0.45 || dy > 0.55 ? mix(base, '#000000', 0.2) : base;
  });
}

const SPR = { icons: {}, tiles: [], tileWarn: [], over: {}, junk: {} };

function buildSprites() {
  for (const k in ICONS) SPR.icons[k] = pixmap(ICONS[k].rows, { o: OUT, ...ICONS[k].pal });
  SPR.looseBall = getBall('_', 'loose');

  // dirt platforms with junk debris - 6 variants so the pattern doesn't visibly repeat
  [['#8a5a32', '#7a4e2a'], ['#946238', '#84552e'], ['#7e5230', '#704628'],
   ['#8a5a32', '#80522c'], ['#90603a', '#7e5230'], ['#865830', '#784c2a']].forEach(([a, b], i) =>
    SPR.tiles.push(makeTile(a, b, '#5a3418', '#3a200e', '#b07c48', '#4a2a14', i * 13 + 1)));
  SPR.tileWarn = [makeTile('#a8402a', '#983a26', '#5a2010', '#3a1008', '#ff9a6a', '#4a1408', 9),
                  makeTile('#c85a2a', '#b84e26', '#6a2a10', '#3a1408', '#ffc08a', '#5a1a08', 9)];
  SPR.hole = makeHole();
  SPR.crack = makeCrack();

  SPR.over.move = makeOverlay('rgba(154,255,90,.28)', '#9aff5a');
  SPR.over.shoot = makeOverlay('rgba(255,70,120,.16)', 'rgba(255,110,150,.7)');
  SPR.over.splash = makeOverlay('rgba(255,250,220,.35)', '#fffbe8');
  SPR.over.hover = makeOverlay('rgba(255,255,255,.25)', '#ffffff');
  SPR.over.target = makeOverlay('rgba(255,216,74,.45)', '#ffd84a');

  SPR.junk = { fridge: makeFridge(), tires: makeTireStack(), pile: makePile(), tire: makeTire(),
    toilet: pixmap(TOILET, { o: OUT, w: '#e8e8dc', g: '#a8a89a', y: '#c8b030' }),
    bag: pixmap(BAG, { o: OUT, K: '#2a2a32', k: '#5a5a6a', y: '#e8c030', d: '#141418' }) };
}

function makeHole() {
  return paint(24, 28, (x, y) => {
    if (!inHex(x, y)) return null;
    const dx = (x + 0.5 - 12) / 10, dy = (y + 0.5 - 15) / 10, d = dx * dx + dy * dy;
    if (d > 1) return !inHex(x, y - 1) || !inHex(x - 1, y) ? '#b07c48' : '#6a4020';   // dirt rim
    if (d > 0.82) return OUT;
    if (d > 0.6) return y < 15 ? '#3a2010' : '#2a1608';
    return d > 0.3 ? '#12070a' : '#05020a';
  });
}

function makeCrack() {
  const c = canvasOf(24, 28), x = c.getContext('2d'), r = rng(3);
  for (let i = 0; i < 4; i++) {
    let px = 12, py = 14;
    const a = i * 1.6 + r();
    for (let s = 0; s < 9; s++) {
      px += Math.cos(a) + (r() - 0.5); py += Math.sin(a) * 0.8 + (r() - 0.5) * 0.6;
      if (!inHex(Math.round(px), Math.round(py))) break;
      x.fillStyle = OUT; x.fillRect(Math.round(px), Math.round(py), 1, 1);
      x.fillStyle = '#ffb060'; x.fillRect(Math.round(px), Math.round(py) + 1, 1, 1);
    }
  }
  return c;
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
