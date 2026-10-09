// Tiny WebAudio chiptune engine: pulse-wave lead/arp, bass, noise drums + SFX.
const Sound = (() => {
  let ctx = null, master, musicBus, sfxBus, noiseBuf, waves = {};
  let musicOn = true;
  try { musicOn = localStorage.getItem('ballistic.music') !== '0'; } catch (e) {}
  let song = null, songName = null, step = 0, nextTime = 0, timer = null;

  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const toMidi = s => { const m = s.match(/^([A-G]#?)(\d)$/); return 12 * (+m[2] + 1) + NOTE[m[1]]; };

  function parseMelody(bars) {
    const toks = bars.join(' ').trim().split(/\s+/);
    const out = new Array(toks.length).fill(null);
    for (let i = 0; i < toks.length; i++) {
      if (toks[i] === '-' || toks[i] === '.') continue;
      let len = 1;
      while (toks[i + len] === '-') len++;
      out[i] = { m: toMidi(toks[i]), len };
    }
    return out;
  }

  const SONGS = {
    // quirky oom-pah junkyard waltz-ish tune
    menu: {
      bpm: 112, swing: 0.18, root: [48, 48, 41, 43], kind: ['M', 'M', 'M', 'dom'],
      kick: [0, 8], snare: [4, 12], hat: 2, bass: 'oompah', arp: 'stab',
      melody: parseMelody([
        'C5 . E5 . G5 . A5 G5 . E5 . C5 . D5 E5 .',
        'D#5 E5 . C5 . G4 . . C5 . . . . . . .',
        'F5 . A5 . C6 . D6 C6 . A5 . F5 . G5 A5 .',
        'G5 . F5 . D5 . B4 . G4 . A4 . B4 . D5 .',
        'C5 . E5 . G5 . C6 - - . B5 . A5 . G5 .',
        'G#5 A5 . G5 . E5 . . C5 - - - . . . .',
        'F5 . E5 . F5 . A5 . C6 . A5 . F5 . D5 .',
        'G5 - - . F5 . D5 . C5 - - - . . . .',
      ]),
    },
    // greasy swung blues-funk groove for the fights
    battle: {
      bpm: 132, swing: 0.22, root: [40, 40, 45, 47], kind: ['dom', 'dom', 'dom', 'dom'],
      kick: [0, 7, 10], snare: [4, 12], hat: 2, bass: 'funk', arp: 'run',
      melody: parseMelody([
        'E5 . G5 . E5 G5 A5 . A#5 B5 . . A5 . G5 .',
        'E5 - - . D5 . E5 . . . G5 . E5 . D5 .',
        'A5 . C6 . A5 C6 D6 . D#6 E6 . . D6 . C6 .',
        'B5 - - - A5 . F#5 . B4 . D#5 . F#5 . A5 .',
        'E5 . E5 . G5 . E5 . B5 - - . A5 . G5 .',
        'E5 . D5 . B4 . D5 . E5 - - - . . . .',
        'A5 . A5 . C6 . A5 . E6 - - . D6 . C6 .',
        'B5 . A5 . F#5 . D#5 . E5 - - - . . . .',
      ]),
    },
  };
  const CHORD = { M: [0, 4, 7, 12], m: [0, 3, 7, 12], dom: [0, 4, 7, 10] };
  const FUNK = { 0: 0, 3: 12, 6: 0, 7: 10, 10: 0, 12: 12, 14: 7, 15: 10 };

  function pulse(duty) {
    const n = 48, real = new Float32Array(n), imag = new Float32Array(n);
    for (let i = 1; i < n; i++) real[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty);
    return ctx.createPeriodicWave(real, imag);
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.32 : 0; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.7; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    waves = { p12: pulse(0.125), p25: pulse(0.25), p50: pulse(0.5) };
    if (songName) play(songName, true);
  }

  // ---- voices
  function tone(t, freq, dur, o = {}) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    if (waves[o.wave]) osc.setPeriodicWave(waves[o.wave]); else osc.type = o.wave || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + (o.slideT || dur));
    if (o.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 6; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.02, t + dur);
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const v = o.gain ?? 0.2, a = o.attack ?? 0.005, r = o.release ?? 0.05;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v * (o.sustain ?? 0.8), t + Math.max(a, dur - r));
    g.gain.linearRampToValueAtTime(0, t + dur);
    let node = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); node = f; }
    osc.connect(g); node.connect(o.dest || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  function noise(t, dur, o = {}) {
    const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    src.buffer = noiseBuf;
    f.type = o.type || 'highpass'; f.frequency.setValueAtTime(o.freq || 6000, t);
    if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.sweep, t + dur);
    f.Q.value = o.q || 1;
    g.gain.setValueAtTime(o.gain ?? 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }

  function kick(t) { tone(t, 150, 0.16, { wave: 'sine', slide: 40, slideT: 0.12, gain: 0.9, dest: musicBus, release: 0.1 }); }
  function snare(t) {
    noise(t, 0.14, { type: 'bandpass', freq: 2200, gain: 0.45, dest: musicBus });
    tone(t, 220, 0.07, { wave: 'p50', slide: 120, gain: 0.18, dest: musicBus });
  }
  function hat(t, acc) { noise(t, acc ? 0.06 : 0.03, { freq: 8000, gain: acc ? 0.16 : 0.08, dest: musicBus }); }

  // ---- sequencer
  function playStep(s, t) {
    const S = song, sixteenth = 60 / S.bpm / 4;
    const pos = s % 16, bar = Math.floor(s / 16) % 4;
    const root = S.root[bar], ch = CHORD[S.kind[bar]];
    const mel = S.melody[s % S.melody.length];
    if (mel) tone(t, hz(mel.m), mel.len * sixteenth * 0.95, { wave: 'p25', gain: 0.17, dest: musicBus, vib: mel.len >= 3, release: 0.04 });
    if (mel && mel.len <= 2) tone(t + sixteenth * 1.5, hz(mel.m), mel.len * sixteenth * 0.8, { wave: 'p12', gain: 0.05, dest: musicBus });
    if (S.arp === 'stab') {
      if (pos % 4 === 2) for (const n of ch.slice(0, 3)) tone(t, hz(root + 12 + n), sixteenth * 0.8, { wave: 'p25', gain: 0.045, dest: musicBus, release: 0.02 });
    } else tone(t, hz(root + 12 + ch[pos % 4]), sixteenth * 0.9, { wave: 'p12', gain: 0.05, dest: musicBus, release: 0.02 });
    if (S.bass === 'oompah') {
      if (pos % 8 === 0) tone(t, hz(root - 12), sixteenth * 1.6, { wave: 'p50', gain: 0.24, lp: 800, dest: musicBus });
      if (pos % 8 === 4) tone(t, hz(root - 5), sixteenth * 1.6, { wave: 'p50', gain: 0.2, lp: 800, dest: musicBus });
    } else if (FUNK[pos] !== undefined) {
      // slap bass: octave pops get a brighter, shorter pluck
      const pop = FUNK[pos] >= 10;
      tone(t, hz(root - 12 + FUNK[pos]), sixteenth * (pop ? 0.6 : 1.4), { wave: 'sawtooth', gain: pop ? 0.2 : 0.24, lp: pop ? 1800 : 650, dest: musicBus, slide: pop ? undefined : hz(root - 12 + FUNK[pos]) * 0.97 });
    }
    if (S.kick.includes(pos)) kick(t);
    if (S.snare.includes(pos)) snare(t);
    if (pos % S.hat === 0) hat(t, pos === 14);
  }

  function schedule() {
    if (!ctx || !song) return;
    while (nextTime < ctx.currentTime + 0.15) {
      if (musicOn) playStep(step, nextTime + (step % 2 ? (song.swing || 0) * 60 / song.bpm / 4 : 0));
      nextTime += 60 / song.bpm / 4;
      step++;
    }
  }

  function play(name, force) {
    if (songName === name && !force && timer) return;
    songName = name; song = SONGS[name];
    if (!ctx) return;
    step = 0; nextTime = ctx.currentTime + 0.1;
    clearInterval(timer); timer = setInterval(schedule, 25);
  }

  function setMusic(on) {
    musicOn = on;
    try { localStorage.setItem('ballistic.music', on ? '1' : '0'); } catch (e) {}
    if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.32 : 0, ctx.currentTime, 0.05);
  }

  // ---- sound effects
  const now = () => ctx.currentTime;
  const fx = {
    click() { tone(now(), 990, 0.05, { wave: 'p25', gain: 0.12 }); },
    hover() { tone(now(), 660, 0.025, { wave: 'p12', gain: 0.05 }); },
    select() { tone(now(), 660, 0.05, { wave: 'p25', gain: 0.15 }); tone(now() + 0.05, 990, 0.07, { wave: 'p25', gain: 0.15 }); },
    move() { tone(now(), 300, 0.1, { wave: 'p25', slide: 700, gain: 0.12 }); },
    bonk() { tone(now(), 500, 0.18, { wave: 'p50', slide: 90, gain: 0.25 }); noise(now(), 0.08, { type: 'lowpass', freq: 1200, gain: 0.3 }); },
    shoot() {
      tone(now(), 160, 0.25, { wave: 'sawtooth', slide: 900, gain: 0.16, lp: 2500 });
      noise(now() + 0.04, 0.25, { type: 'bandpass', freq: 600, sweep: 3000, q: 4, gain: 0.35 });
    },
    splat() {
      noise(now(), 0.35, { type: 'lowpass', freq: 2500, sweep: 200, gain: 0.5 });
      tone(now(), 220, 0.25, { wave: 'sine', slide: 50, gain: 0.4 });
    },
    hit() {
      tone(now(), 880, 0.3, { wave: 'p25', slide: 110, gain: 0.25, vib: true });
      noise(now(), 0.12, { type: 'bandpass', freq: 1500, gain: 0.3 });
    },
    pickup() { [72, 76, 79, 84].forEach((m, i) => tone(now() + i * 0.05, hz(m + 12), 0.08, { wave: 'p25', gain: 0.15 })); },
    death() { tone(now(), 600, 0.9, { wave: 'sawtooth', slide: 40, gain: 0.22, vib: true, lp: 1800 }); },
    tick() { tone(now(), 1500, 0.03, { wave: 'p50', gain: 0.08 }); },
    turn() { tone(now(), hz(81), 0.06, { wave: 'p25', gain: 0.1 }); tone(now() + 0.07, hz(88), 0.08, { wave: 'p25', gain: 0.1 }); },
    crumble() { noise(now(), 0.9, { type: 'lowpass', freq: 600, sweep: 60, gain: 0.6 }); tone(now(), 80, 0.8, { wave: 'sawtooth', slide: 30, gain: 0.2, lp: 300 }); },
    clang() { [1800, 2400, 3100].forEach(f => tone(now(), f, 0.35, { wave: 'p12', slide: f * 0.97, gain: 0.08 })); noise(now(), 0.1, { freq: 5000, gain: 0.2 }); },
    freeze() { [96, 91, 88, 84].forEach((m, i) => tone(now() + i * 0.04, hz(m), 0.12, { wave: 'p12', gain: 0.1 })); noise(now(), 0.4, { freq: 7000, gain: 0.12 }); },
    power() { [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => tone(now() + i * 0.035, hz(m + 12), 0.07, { wave: 'p25', gain: 0.13 })); },
    ook() { [0, 0.16].forEach(d => tone(now() + d, 420, 0.13, { wave: 'p50', slide: 260, gain: 0.2, lp: 1500 })); },
    fart() { tone(now(), 90, 0.45, { wave: 'sawtooth', slide: 55, gain: 0.35, lp: 400, vib: true }); noise(now(), 0.4, { type: 'lowpass', freq: 300, gain: 0.4 }); },
    win() { [72, 76, 79, 84, 79, 84, 88].forEach((m, i) => tone(now() + i * 0.11, hz(m), i === 6 ? 0.6 : 0.1, { wave: 'p25', gain: 0.18, vib: i === 6 })); },
    lose() { [67, 63, 60, 55].forEach((m, i) => tone(now() + i * 0.18, hz(m), 0.18, { wave: 'p50', gain: 0.15, lp: 2000 })); },
  };

  return {
    init, play, setMusic,
    get musicOn() { return musicOn; },
    sfx(name) { if (ctx && fx[name]) fx[name](); },
  };
})();
