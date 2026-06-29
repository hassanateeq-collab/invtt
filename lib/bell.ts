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

function ding(c: AudioContext, at: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(880, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.12, at + 0.02); // soft, not loud
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.35);
  o.connect(g); g.connect(c.destination);
  o.start(at); o.stop(at + 0.37);
}

export function playBell() {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  const now = c.currentTime;
  ding(c, now);          // once
  ding(c, now + 0.28);   // …and twice
}
