// "Platanito's Garden": a procedural soundtrack in C major at a steady 92 BPM.
// Everything is synthesised with Web Audio: soft pad, round bass, plucked arpeggio,
// a lead melody with a recurring rabbit "hop" motif, and light percussion.
// Each zone (Garden / House / Burrow) is an arrangement of the same song: the switch
// happens on the next bar line, and a filter sweep crossfades the colour of the mix.

const BPM = 92;
const STEPS_PER_BAR = 16; // sixteenth notes
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// chords as MIDI note numbers (root in octave 3); all diatonic to C major
const CH = {
  C: [48, 52, 55], G: [43, 47, 50], Am: [45, 48, 52], F: [41, 45, 48],
  Em: [40, 43, 47], Dm: [38, 41, 45], G7: [43, 47, 50, 53], Fmaj7: [41, 45, 48, 52], Cadd9: [48, 50, 52, 55],
};

// melody: one entry per 8th note (8 per bar), MIDI or null for rest. 8 bars.
// Bar 7 is the rabbit motif: G-C'-G-E' "hop-hop-boing" leaps, played bouncy and staccato.
const THEME = [
  [76, null, 79, null, 81, null, 79, 76],
  [74, null, null, null, 72, null, 74, null],
  [76, null, 79, null, 81, null, 84, null],
  [83, null, 81, null, 79, null, null, null],
  [76, null, 79, null, 81, null, 79, 76],
  [74, null, 72, null, 74, null, 76, null],
  'HOP',
  [72, null, null, null, null, null, null, null],
];
const THEME_B = [
  [81, null, 79, null, 77, null, 76, null],
  [74, null, 76, null, 77, null, null, null],
  [79, null, 77, null, 76, null, 74, null],
  [72, null, 74, null, 76, null, null, null],
  [81, null, 84, null, 83, null, 81, null],
  [79, null, 77, null, 76, null, 74, null],
  'HOP',
  [72, null, null, null, 67, null, 72, null],
];
const HOP_MOTIF = [[0, 79], [3, 84], [6, 79], [8, 88], [12, 84]]; // [sixteenth, midi]

export const SECTIONS = {
  garden: {
    label: 'Garden',
    progression: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C', 'F', 'G', 'Em', 'Am', 'F', 'G', 'G7', 'C'],
    tone: 16000, reverb: 0.16, pad: 0.05, bass: 0.16, arp: 0.055, lead: 0.07, kick: 0.22, shaker: 0.018, wood: 0.05,
    arpPattern: [0, 1, 2, 3, 2, 1, 0, 1], arpEvery: 2, bassPattern: 'bounce', leadWave: 'triangle', leadOct: 0,
  },
  house: {
    label: 'House',
    progression: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G', 'Fmaj7', 'Em', 'Dm', 'G', 'C', 'Am', 'Dm', 'G7'],
    tone: 5200, reverb: 0.2, pad: 0.06, bass: 0.14, arp: 0.05, lead: 0.06, kick: 0.1, shaker: 0.011, wood: 0.0,
    arpPattern: [0, 2, 1, 2], arpEvery: 4, bassPattern: 'walk', leadWave: 'sine', leadOct: -12,
  },
  burrow: {
    label: 'Burrow',
    progression: ['F', 'C', 'G', 'Am', 'F', 'C', 'Dm', 'G', 'F', 'Cadd9', 'G', 'Am', 'Fmaj7', 'C', 'G', 'G'],
    tone: 2400, reverb: 0.38, pad: 0.07, bass: 0.13, arp: 0.045, lead: 0.05, kick: 0.0, shaker: 0.0, wood: 0.04,
    arpPattern: [2, 0, 3, 1], arpEvery: 4, bassPattern: 'drone', leadWave: 'sine', leadOct: 0, sparseLead: true,
  },
};

export class Soundtrack {
  constructor(ctx, destination, noise) {
    this.ctx = ctx;
    this.noise = noise;
    this.playing = false;
    this.step = 0; // absolute sixteenth counter
    this.section = 'garden';
    this.pending = null;
    this.sections = Object.keys(SECTIONS);
    this.bars = { garden: 0, house: 0, burrow: 0 };

    // --- mix: voices -> (dry + delay + reverb sends) -> tone filter -> compressor -> volume -> out
    this.out = ctx.createGain();
    this.out.gain.value = 0.42;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20; this.comp.knee.value = 12; this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01; this.comp.release.value = 0.25;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass'; this.tone.frequency.value = SECTIONS.garden.tone; this.tone.Q.value = 0.5;
    this.tone.connect(this.comp).connect(this.out).connect(destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.tone);

    // dotted-eighth echo, darkened in the feedback loop
    const sixteenth = 60 / BPM / 4;
    this.delay = ctx.createDelay(2);
    this.delay.delayTime.value = sixteenth * 3;
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const fbf = ctx.createBiquadFilter(); fbf.type = 'lowpass'; fbf.frequency.value = 2600;
    this.delaySend = ctx.createGain(); this.delaySend.gain.value = 0.22;
    this.delaySend.connect(this.delay);
    this.delay.connect(fbf).connect(fb).connect(this.delay);
    fbf.connect(this.tone);

    // small generated hall reverb
    this.reverb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = SECTIONS.garden.reverb;
    this.reverbSend.connect(this.reverb).connect(this.tone);
  }

  start() {
    if (this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  // Zones switch on the next bar line; the tone filter and reverb glide there over ~2 s.
  setSection(name) {
    if (!SECTIONS[name] || (name === this.section && !this.pending)) return;
    this.pending = name;
    const s = SECTIONS[name], t = this.ctx.currentTime;
    this.tone.frequency.cancelScheduledValues(t);
    this.tone.frequency.setTargetAtTime(s.tone, t, 0.7);
    this.reverbSend.gain.setTargetAtTime(s.reverb, t, 0.7);
  }

  schedule() {
    const sixteenth = 60 / BPM / 4;
    // If the page stalled (background tab, slow frame), don't replay the missed notes in a
    // burst: skip them silently and keep counting so the song stays in time and in place.
    const behind = this.ctx.currentTime - this.nextTime;
    if (behind > 0.05) {
      const missed = Math.ceil(behind / sixteenth);
      for (let i = 0; i < missed; i++) {
        if (this.step % STEPS_PER_BAR === 0 && this.pending) { this.section = this.pending; this.pending = null; }
        this.step++;
      }
      this.nextTime += missed * sixteenth;
      this.skipped = (this.skipped || 0) + missed;
    }
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const inBar = this.step % STEPS_PER_BAR;
      if (inBar === 0 && this.pending) { this.section = this.pending; this.pending = null; }
      if (inBar === 0) this.bars[this.section]++;
      this.playStep(this.nextTime, inBar);
      this.step++;
      this.nextTime += sixteenth;
    }
  }

  get bar() { return Math.floor(this.step / STEPS_PER_BAR); }

  playStep(t, s) {
    const S = SECTIONS[this.section];
    const bar = this.bar % 16;
    const chord = CH[S.progression[bar]];
    const beat = s % 4 === 0;

    // pad: whole-bar chord, slow swell, notes spread across the stereo field
    if (s === 0) chord.forEach((m, i) => this.voice(t, m + 12, (60 / BPM) * 4.4, { wave: 'sawtooth', gain: S.pad / chord.length, attack: 0.7, release: 1.4, pan: (i - 1) * 0.4, cutoff: 900, detune: (i % 2 ? 7 : -7), reverb: 0.5 }));

    // bass
    const root = chord[0] - 12;
    if (S.bassPattern === 'bounce' && (s === 0 || s === 8 || s === 14)) this.voice(t, s === 8 ? root + 7 : root, 0.35, { wave: 'sine', gain: S.bass, attack: 0.01, release: 0.3, cutoff: 600, sub: true });
    if (S.bassPattern === 'walk' && beat) this.voice(t, root + [0, 7, 9, 7][s / 4], 0.45, { wave: 'triangle', gain: S.bass, attack: 0.02, release: 0.3, cutoff: 500 });
    if (S.bassPattern === 'drone' && s === 0) this.voice(t, root, (60 / BPM) * 3.8, { wave: 'sine', gain: S.bass, attack: 0.3, release: 1.0, cutoff: 400 });

    // arpeggio / broken chord, alternating left-right, echoed
    if (s % S.arpEvery === 0) {
      const tones = [...chord.slice(0, 3), chord[0] + 12];
      const idx = S.arpPattern[(s / S.arpEvery) % S.arpPattern.length];
      const pan = ((s / S.arpEvery) % 2 ? 0.35 : -0.35);
      this.voice(t, tones[idx] + 24, 0.25, { wave: this.section === 'house' ? 'sine' : 'triangle', gain: S.arp, attack: 0.005, release: 0.22, pan, cutoff: 3200, delay: 0.6, reverb: 0.4, bell: this.section !== 'garden' });
    }

    // lead: the theme alternates A and B every 8 bars; bar 7 of each phrase is the rabbit hop
    const phrase = Math.floor(this.bar / 8) % 2 ? THEME_B : THEME;
    const line = phrase[bar % 8];
    if (line === 'HOP') {
      for (const [at, m] of HOP_MOTIF) if (at === s) this.hop(t, m + S.leadOct, S.lead);
    } else if (s % 2 === 0) {
      const m = line[s / 2];
      const skip = S.sparseLead && (bar % 2 === 1);
      if (m && !skip) this.voice(t, m + S.leadOct, S.sparseLead ? 0.6 : 0.3, { wave: S.leadWave, gain: S.lead, attack: 0.02, release: S.sparseLead ? 0.7 : 0.28, pan: 0.08, cutoff: 4200, vibrato: true, delay: S.sparseLead ? 0.7 : 0.3, reverb: 0.4 });
    }

    // percussion
    if (S.kick && (s === 0 || (s === 8 && this.section === 'garden'))) this.kick(t, S.kick);
    if (S.shaker && s % 2 === 1) this.shaker(t, S.shaker * (s % 4 === 3 ? 1.3 : 0.8));
    if (S.wood && (this.section === 'garden' ? s === 12 || s === 6 : s === 0 && bar % 2 === 0)) this.woodblock(t, S.wood, this.section === 'burrow' ? 1400 : 2200);
  }

  // one synth note: oscillator(s) -> lowpass -> envelope -> pan -> dry/delay/reverb
  voice(t, midi, dur, o) {
    const ctx = this.ctx;
    const f = midiHz(midi);
    const osc = ctx.createOscillator();
    osc.type = o.wave;
    osc.frequency.setValueAtTime(f, t);
    if (o.detune) osc.detune.value = o.detune;
    let lfo;
    if (o.vibrato) {
      lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
      const depth = ctx.createGain(); depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.25);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + (o.release ?? 0.2) + 0.1);
    }
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = o.cutoff ?? 3000;
    const g = ctx.createGain();
    const a = o.attack ?? 0.01, r = o.release ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + a);
    if (o.bell) g.gain.exponentialRampToValueAtTime(o.gain * 0.25, t + a + 0.08);
    g.gain.setValueAtTime(o.bell ? o.gain * 0.25 : o.gain, t + Math.max(a, dur - r * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
    osc.connect(lp).connect(g);
    let node = g;
    if (o.sub) {
      const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.setValueAtTime(f / 2, t);
      const sg = ctx.createGain(); sg.gain.value = 0.5;
      sub.connect(sg).connect(g);
      sub.start(t); sub.stop(t + dur + r + 0.05);
    }
    if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; node = node.connect(p); }
    node.connect(this.dry);
    if (o.delay) { const d = ctx.createGain(); d.gain.value = o.delay; node.connect(d).connect(this.delaySend); }
    if (o.reverb) { const rv = ctx.createGain(); rv.gain.value = o.reverb; node.connect(rv).connect(this.reverbSend); }
    osc.start(t); osc.stop(t + dur + r + 0.05);
  }

  // the rabbit motif: bouncy plucks that spring up into pitch, with a soft woodblock "paw" under each
  hop(t, midi, gain) {
    const ctx = this.ctx, f = midiHz(midi);
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    osc.frequency.setValueAtTime(f * 0.84, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.045);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * 1.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    const p = ctx.createStereoPanner(); p.pan.value = (midi % 2 ? 0.25 : -0.25);
    osc.connect(g).connect(p);
    p.connect(this.dry);
    const d = ctx.createGain(); d.gain.value = 0.5; p.connect(d).connect(this.delaySend);
    osc.start(t); osc.stop(t + 0.25);
    this.woodblock(t, 0.03, 1800);
  }

  kick(t, gain) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.dry);
    o.start(t); o.stop(t + 0.3);
  }

  shaker(t, gain) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 6500;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    const p = ctx.createStereoPanner(); p.pan.value = 0.4;
    src.connect(f).connect(g).connect(p).connect(this.dry);
    src.start(t, Math.random()); src.stop(t + 0.06);
  }

  woodblock(t, gain, freq) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * 0.8, t + 0.05);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    const p = ctx.createStereoPanner(); p.pan.value = -0.3;
    o.connect(g).connect(p).connect(this.dry);
    const rv = ctx.createGain(); rv.gain.value = 0.3; p.connect(rv).connect(this.reverbSend);
    o.start(t); o.stop(t + 0.08);
  }

  info() {
    return { playing: this.playing, skipped: this.skipped || 0, bpm: BPM, key: 'C major', section: this.section, pending: this.pending, sections: this.sections, step: this.step, bar: this.bar, barsPlayed: { ...this.bars } };
  }
}
