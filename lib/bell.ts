"use client";
// A gentle "ding-ding" played when a new request arrives. Uses the Web Audio
// API (no audio file needed). Browsers block sound before the user interacts,
// so we resume the audio context on the first click.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

if (typeof window !== "undefined") {
  const unlock = () => { getCtx()?.resume?.().catch(() => {}); window.removeEventListener("pointerdown", unlock); };
  window.addEventListener("pointerdown", unlock);
}

function ding(c: AudioContext, at: number, freq: number, peak: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
  g.connect(c.destination);

  // fundamental + a softer octave on top = fuller, louder-sounding chime
  const o1 = c.createOscillator();
  o1.type = "sine"; o1.frequency.setValueAtTime(freq, at);
  o1.connect(g); o1.start(at); o1.stop(at + 0.47);

  const o2 = c.createOscillator();
  const g2 = c.createGain(); g2.gain.setValueAtTime(0.4, at);
  o2.type = "triangle"; o2.frequency.setValueAtTime(freq * 2, at);
  o2.connect(g2); g2.connect(g); o2.start(at); o2.stop(at + 0.47);
}

// gain ~0.05 (low) … ~0.5 (high). 0 = silent.
export function playBell(gain = 0.22) {
  if (gain <= 0) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  ding(c, now, 880, gain);          // once
  ding(c, now + 0.3, 988, gain);    // …and twice (a step up — pleasant, noticeable)
}
