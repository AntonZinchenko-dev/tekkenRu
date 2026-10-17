// Короткие звуки тренажёра, синтезируются на лету (без файлов)
let ctx: AudioContext | null = null;
let volume = 0.5;

function ac() {
  if (!ctx) ctx = new AudioContext({ latencyHint: 'interactive' });
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0) {
  if (volume <= 0) return;
  const a = ac();
  const t = a.currentTime + when;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain * volume, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const sfx = {
  /** правильное нажатие */
  hit: () => tone(1760, 0.045, 'square', 0.18),
  /** точно в метроном */
  perfect: () => {
    tone(1760, 0.04, 'square', 0.16);
    tone(2637, 0.05, 'sine', 0.14, 0.012);
  },
  /** ошибка */
  miss: () => tone(130, 0.18, 'sawtooth', 0.22),
  /** метроном / показ */
  tick: (accent = false) => tone(accent ? 1320 : 990, 0.025, 'sine', accent ? 0.3 : 0.2),
  /** комбо пройдено */
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.18, i * 0.07)),
};

export function primeAudio() {
  ac();
}
