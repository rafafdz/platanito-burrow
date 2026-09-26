// Tiny procedural sound kit: everything is synthesised with WebAudio, no assets.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicPlaying = false;
  }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // soft breeze
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise; wind.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.12;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.03;
    lfo.connect(lfoG).connect(wg.gain);
    wind.connect(lp).connect(wg).connect(this.master);
    wind.start(); lfo.start();

    this.scheduleBirds();
    this.scheduleMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
  }

  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(type, f0, f1, dur, vol, when = 0, pan = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    this.env(g, t, 0.01, vol, dur);
    let node = o.connect(g);
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p);
    }
    node.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  burst(dur, vol, type, freq, q = 1, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, vol, dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  scheduleBirds() {
    const loop = () => {
      if (this.ctx && !this.muted) {
        const pan = Math.random() * 1.6 - 0.8, base = 2600 + Math.random() * 1800, n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone('sine', base, base * (1.2 + Math.random() * 0.4), 0.07, 0.035, i * 0.11, pan);
      }
      setTimeout(loop, 1800 + Math.random() * 4500);
    };
    setTimeout(loop, 1500);
  }

  // "Rabbit Hop": a bouncy 4-bar loop. Bass "boings" on the beat, woodblock ticks,
  // a pentatonic melody with a skipping rhythm, and an upward hop-glide every other bar.
  scheduleMusic() {
    const ctx = this.ctx;
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 18000;
    this.musicBus.connect(this.musicFilter).connect(this.master);
    const bpm = 116, eighth = 60 / bpm / 2;
    const chords = [[261.63, 329.63, 392.0], [220.0, 261.63, 329.63], [174.61, 220.0, 261.63], [196.0, 246.94, 293.66]];
    const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5];
    // skipping rhythm: 1 = note, 0 = rest (per eighth), fixed so the loop is recognisable
    const rhythm = [1, 0, 1, 1, 0, 1, 1, 0];
    const melody = [];
    let idx = 2;
    for (let bar = 0; bar < 4; bar++) {
      for (let e = 0; e < 8; e++) {
        idx = Math.max(0, Math.min(scale.length - 1, idx + [-1, 1, 2, -2, 1, 0, -1, 1][(bar * 3 + e) % 8]));
        melody.push(rhythm[e] ? scale[idx] : 0);
      }
    }
    this.musicStep = 0;
    this.musicPlaying = true;
    let next = ctx.currentTime + 0.1;
    const voice = (type, f0, f1, t, dur, vol) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.musicBus);
      o.start(t); o.stop(t + dur + 0.05);
    };
    const tick = () => {
      while (next < ctx.currentTime + 0.25) {
        const st = this.musicStep % 32, bar = Math.floor(st / 8), e = st % 8, chord = chords[bar];
        if (e === 0 || e === 4) voice('sine', chord[0] / 2 * 1.5, chord[0] / 2, next, 0.28, 0.16); // bass boing
        if (e === 2 || e === 6) voice('triangle', chord[1], chord[1], next, 0.18, 0.05);
        if (e === 2 || e === 6) voice('triangle', chord[2], chord[2], next, 0.18, 0.04);
        if (e % 2 === 1) { // woodblock tick
          const src = ctx.createBufferSource(); src.buffer = this.noise;
          const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 6;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.12, next); g.gain.exponentialRampToValueAtTime(0.0001, next + 0.04);
          src.connect(f).connect(g).connect(this.musicBus); src.start(next, Math.random()); src.stop(next + 0.05);
        }
        if (melody[st]) voice('square', melody[st], melody[st], next, 0.16, 0.025);
        if (melody[st]) voice('sine', melody[st], melody[st], next, 0.22, 0.05);
        if (bar % 2 === 1 && e === 7) voice('sine', 400, 1400, next, 0.22, 0.05); // the hop
        this.musicStep++;
        next += eighth;
      }
    };
    tick();
    this.musicTimer = setInterval(tick, 60);
  }

  // muffle the music indoors, and more so underground
  setZone(zone) {
    const f = { burrow: 650, house: 2600 }[zone] ?? 18000;
    if (this.musicFilter) this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.3);
  }

  step() { this.burst(0.05, 0.035, 'bandpass', 900 + Math.random() * 500, 1.2); }
  land() { this.burst(0.12, 0.08, 'lowpass', 500); }
  dig() { for (let i = 0; i < 3; i++) this.burst(0.07, 0.09, 'bandpass', 700 + Math.random() * 600, 0.8, i * 0.06); }
  sniff() { for (let i = 0; i < 3; i++) this.burst(0.09, 0.07, 'highpass', 2500, 0.7, i * 0.13); }
  boop() { this.tone('sine', 620, 980, 0.12, 0.2); }
  whoosh() { this.burst(0.35, 0.08, 'bandpass', 1200, 0.6); }
  tweet() { for (let i = 0; i < 3; i++) this.tone('sine', 3400, 4600, 0.06, 0.06, i * 0.07); }
  crunch() { for (let i = 0; i < 5; i++) this.burst(0.05, 0.1, 'bandpass', 1800 + Math.random() * 1500, 1, i * 0.09); }
  collect() { [783.99, 1046.5, 1318.5, 1567.98].forEach((f, i) => this.tone('triangle', f, f, 0.35, 0.1, i * 0.06)); }
  chime() { [659.25, 783.99, 1046.5].forEach((f, i) => this.tone('sine', f, f, 0.5, 0.12, i * 0.08)); }
  meh() { this.tone('triangle', 330, 250, 0.25, 0.08); }

  // a rabbit foot-thump: a deep thud with a little dusty rustle
  thump() {
    if (!this.ctx) return;
    this.tone('sine', 120, 45, 0.25, 0.45);
    this.tone('triangle', 80, 40, 0.18, 0.2);
    this.burst(0.12, 0.08, 'lowpass', 400);
  }

  fanfare() {
    [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      this.tone('triangle', f, f, 0.6, 0.12, i * 0.13);
      this.tone('sine', f / 2, f / 2, 0.6, 0.06, i * 0.13);
    });
  }
}
