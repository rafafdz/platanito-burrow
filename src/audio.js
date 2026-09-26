import { Soundtrack } from './music.js';

// Tiny procedural sound kit: everything is synthesised with WebAudio, no assets.
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
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
    this.music = new Soundtrack(ctx, this.master, this.noise);
    if (this.zone) this.music.setSection(this.zone === 'surface' ? 'garden' : this.zone);
    this.music.start();
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

  // zone -> soundtrack section (Garden / House / Burrow); the change lands on the next bar line
  setZone(zone) {
    this.zone = zone;
    this.music?.setSection(zone === 'surface' ? 'garden' : zone);
  }

  get musicPlaying() { return !!this.music?.playing; }
  get musicStep() { return this.music?.step ?? 0; }

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
