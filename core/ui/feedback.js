// Shot feedback: a brief crosshair flash plus a synthesized click (no audio
// asset files — a couple of WebAudio oscillator envelopes are enough for a
// hit/miss tick and keep the project dependency-free). Muted independently
// via rangeConfig.soundEnabled; the flash always plays since it costs nothing
// and reads as instant confirmation the click registered.
let soundEnabled = true;
let audioCtx = null;

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}

function getAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function beep(freq, durationMs, peakGain) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;

  const now = ctx.currentTime;
  const durationSec = durationMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + durationSec + 0.02);
}

export function playHitSound() {
  beep(920, 70, 0.18);
}

export function playMissSound() {
  beep(160, 90, 0.12);
}

export function flashCrosshair(el, hit) {
  el.classList.remove("crosshair-flash-hit", "crosshair-flash-miss");
  // Force a reflow so re-adding the same class restarts the animation on
  // back-to-back shots instead of being a no-op.
  void el.offsetWidth;
  el.classList.add(hit ? "crosshair-flash-hit" : "crosshair-flash-miss");
}
