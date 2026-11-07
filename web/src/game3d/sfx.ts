// Synthesized battle sounds. No audio files.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let amb: { stop: () => void } | null = null;
let noiseBuf: AudioBuffer | null = null;

try {
  muted = localStorage.getItem("so-muted") === "1";
} catch {}

const ac = () => {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
};

const nbuf = () => {
  const a = ac();
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
};

function tone(freq: number, dur: number, type: OscillatorType, vol = 0.12, slide = 0, delay = 0, pan = 0) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  const p = a.createStereoPanner();
  p.pan.value = pan;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(p).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function burst(dur: number, vol: number, freq: number, type: BiquadFilterType, pan = 0, delay = 0, q = 0.7) {
  if (muted) return;
  const a = ac();
  const t = a.currentTime + delay;
  const s = a.createBufferSource();
  s.buffer = nbuf();
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = a.createStereoPanner();
  p.pan.value = pan;
  s.connect(f).connect(g).connect(p).connect(master!);
  s.start(t, Math.random() * 1.5, dur + 0.05);
}

let lastShot = 0;
export const sfx = {
  unlock() {
    if (!muted) ac();
  },
  get muted() {
    return muted;
  },
  setMuted(m: boolean) {
    muted = m;
    try {
      localStorage.setItem("so-muted", m ? "1" : "0");
    } catch {}
    if (m) {
      amb?.stop();
      amb = null;
    } else this.ambience();
  },
  /** One rifle shot. vol 0..1 from camera distance, pan -1..1. */
  shot(vol = 1, pan = 0) {
    if (muted || !ctx) return;
    const now = performance.now();
    if (now - lastShot < 35) return;
    lastShot = now;
    const v = 0.05 + 0.3 * vol;
    burst(0.09, v, 1800 + Math.random() * 900, "bandpass", pan, 0, 0.9);
    burst(0.22, v * 0.8, 420, "lowpass", pan);
    tone(140 + Math.random() * 30, 0.09, "triangle", v * 0.5, -80, 0, pan);
  },
  hit(pan = 0) {
    burst(0.05, 0.08, 3200, "highpass", pan);
  },
  death(pan = 0) {
    tone(120, 0.35, "sine", 0.18, -70, 0, pan);
    burst(0.25, 0.12, 300, "lowpass", pan);
  },
  capture(mine: boolean) {
    const notes = mine ? [523, 659, 784, 1047] : [440, 370, 311];
    notes.forEach((n, i) => tone(n, 0.28, "triangle", 0.11, 0, i * 0.1));
  },
  alert() {
    tone(880, 0.12, "square", 0.06);
    tone(1175, 0.16, "square", 0.06, 0, 0.13);
  },
  contact() {
    tone(1400, 0.08, "sine", 0.1);
    tone(1400, 0.08, "sine", 0.1, 0, 0.12);
    tone(700, 0.25, "sine", 0.06, -200, 0.24);
  },
  radio() {
    burst(0.06, 0.07, 2500, "bandpass");
    tone(1200, 0.07, "sine", 0.07, 0, 0.06);
    tone(1600, 0.09, "sine", 0.07, 0, 0.14);
  },
  select() {
    tone(660, 0.06, "triangle", 0.07);
    tone(990, 0.08, "triangle", 0.06, 0, 0.05);
  },
  error() {
    tone(220, 0.2, "sawtooth", 0.06, -60);
  },
  victory() {
    [523, 659, 784, 1047, 1319].forEach((n, i) => tone(n, 0.5, "triangle", 0.12, 0, i * 0.14));
  },
  defeat() {
    [392, 330, 262, 196].forEach((n, i) => tone(n, 0.6, "sawtooth", 0.06, 0, i * 0.22));
  },
  /** Wind bed plus the odd bird. */
  ambience() {
    if (muted || amb) return;
    const a = ac();
    const s = a.createBufferSource();
    s.buffer = nbuf();
    s.loop = true;
    const f = a.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 380;
    const g = a.createGain();
    g.gain.value = 0.035;
    const lfo = a.createOscillator();
    const lg = a.createGain();
    lfo.frequency.value = 0.08;
    lg.gain.value = 160;
    lfo.connect(lg).connect(f.frequency);
    s.connect(f).connect(g).connect(master!);
    s.start();
    lfo.start();
    const bird = setInterval(() => {
      if (Math.random() < 0.5) return;
      const base = 2400 + Math.random() * 1200;
      for (let i = 0; i < 3; i++) tone(base + i * 120, 0.07, "sine", 0.015, 600, i * 0.11);
    }, 3500);
    amb = {
      stop() {
        clearInterval(bird);
        s.stop();
        lfo.stop();
      },
    };
  },
  stopAmbience() {
    amb?.stop();
    amb = null;
  },
};
