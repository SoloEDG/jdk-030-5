import type { TraceEvent } from "../types";

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    if (!audio) audio = new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch {
    return null;
  }
}

function tone(frequency: number, duration = 0.055, type: OscillatorType = "square", gainValue = 0.025) {
  const ctx = context();
  if (!ctx) return;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.value = gainValue;
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();
  oscillator.stop(ctx.currentTime + duration);
}

const DIR_NOTE: Record<string, number> = {
  n: 392,
  e: 440,
  s: 329.6,
  w: 349.2,
};

export function playPunchSound(event: TraceEvent): void {
  if (event.delivered) {
    tone(523.25, 0.09, "triangle", 0.04);
    window.setTimeout(() => tone(659.25, 0.1, "triangle", 0.04), 90);
    window.setTimeout(() => tone(783.99, 0.16, "triangle", 0.045), 180);
    return;
  }
  if (event.blocked) {
    tone(98, 0.11, "sawtooth", 0.04);
    return;
  }
  if (event.kind === "manual") {
    tone(event.dir ? DIR_NOTE[event.dir] / 2 : 220, 0.05, "sine", 0.035);
    return;
  }
  if (event.spawned) {
    tone(587.33, 0.045, "triangle", 0.03);
    return;
  }
  if (event.selectedArm) {
    tone(event.selectedArm === "lit" ? 739.99 : 493.88, 0.05, "triangle", 0.025);
    return;
  }
  if (event.dir) tone(DIR_NOTE[event.dir], 0.045, "square", 0.018);
  else tone(260, 0.03, "square", 0.012);
}

export function unlockAudio(): void {
  context();
}
