// Lightweight Web Audio sound effects — synthesised, no asset files needed.
// All functions are no-ops if the browser has no AudioContext yet.

let ctx: AudioContext | null = null;
let muted = false;

function ac(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", gain = 0.15) {
  const c = ac();
  if (!c || muted) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

function noise(start: number, dur: number, gain = 0.08) {
  const c = ac();
  if (!c || muted) return;
  const bufferSize = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const g = c.createGain();
  g.gain.value = gain;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 1200;
  src.connect(filter).connect(g).connect(c.destination);
  src.start(c.currentTime + start);
}

export function playSpin() {
  // rapid mechanical clicks + whoosh
  for (let i = 0; i < 6; i++) tone(220 + i * 30, i * 0.05, 0.05, "square", 0.06);
  noise(0, 0.5, 0.05);
}

export function playReelStop(i: number) {
  tone(180 - i * 20, 0, 0.08, "square", 0.1);
  noise(0, 0.05, 0.06);
}

export function playWin(mult: number) {
  // ascending arpeggio, longer/brighter for bigger prizes
  const notes = [523, 659, 784, 1047];
  if (mult >= 100) notes.push(1319, 1568);
  notes.forEach((n, i) => tone(n, i * 0.09, 0.18, "triangle", 0.16));
}

export function playJackpot() {
  // fanfare
  const seq = [523, 659, 784, 1047, 1319, 1568, 2093];
  seq.forEach((n, i) => tone(n, i * 0.11, 0.25, "triangle", 0.18));
  // sparkle
  for (let i = 0; i < 12; i++) tone(2000 + Math.random() * 1500, 0.8 + i * 0.07, 0.12, "sine", 0.08);
  noise(0, 1.2, 0.04);
}

export function playFreeSpin() {
  tone(880, 0, 0.1, "sine", 0.12);
  tone(1320, 0.1, 0.14, "sine", 0.12);
}

export function playButton() {
  tone(440, 0, 0.05, "square", 0.08);
}

export function playLose() {
  tone(200, 0, 0.12, "sawtooth", 0.06);
  tone(150, 0.1, 0.16, "sawtooth", 0.06);
}

export function playPay() {
  // cash register-ish
  tone(700, 0, 0.08, "square", 0.12);
  tone(900, 0.08, 0.08, "square", 0.12);
  tone(1100, 0.16, 0.18, "triangle", 0.14);
}
