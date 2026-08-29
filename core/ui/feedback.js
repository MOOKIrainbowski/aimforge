// Shot feedback: a brief crosshair flash plus a synthesized click (no audio
// asset files — a handful of WebAudio oscillator envelopes cover hit/miss,
// target-expire, session-complete, menu-exit, and generic button clicks,
// keeping the project dependency-free). Muted independently via
// rangeConfig.soundEnabled; the crosshair flash always plays since it costs
// nothing and reads as instant confirmation the click registered.
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

// Schedules one oscillator against `ctx`'s own timeline (rather than
// wall-clock setTimeout) so multi-note sequences (chime()) stay tightly and
// consistently spaced regardless of browser timer throttling.
function scheduleTone(ctx, startTime, freq, durationMs, peakGain, freqEnd) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  const durationSec = durationMs / 1000;

  if (freqEnd != null) {
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.linearRampToValueAtTime(freqEnd, startTime + durationSec);
  } else {
    osc.frequency.value = freq;
  }

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

function beep(freq, durationMs, peakGain) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleTone(ctx, ctx.currentTime, freq, durationMs, peakGain);
}

function sweep(freqStart, freqEnd, durationMs, peakGain) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleTone(ctx, ctx.currentTime, freqStart, durationMs, peakGain, freqEnd);
}

function chime(notes, stepMs, durationMs, peakGain) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  notes.forEach((freq, i) => {
    scheduleTone(ctx, ctx.currentTime + (i * stepMs) / 1000, freq, durationMs, peakGain);
  });
}

// One second of static noise generated once per AudioContext and reused
// (sliced via a fresh BufferSource) for every shot — cheaper than
// regenerating random samples on every trigger-pull.
let noiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

// The "crack" half of a synthesized gunshot: filtered noise burst, gated
// through the same style of gain envelope as scheduleTone() above.
function scheduleNoiseBurst(ctx, startTime, durationMs, peakGain, filterFreq) {
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  const durationSec = durationMs / 1000;

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(startTime);
  source.stop(startTime + durationSec + 0.02);
}

// Fires on every trigger-pull, independent of hit/miss (those play their
// own sound on top) — a filtered noise "crack" plus a fast pitch-dropping
// low thump underneath, the standard cheap synthesized-gunshot recipe.
export function playShotSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  scheduleNoiseBurst(ctx, now, 90, 0.22, 3200);
  scheduleTone(ctx, now, 150, 60, 0.16, 70);
}

export function playHitSound() {
  beep(920, 70, 0.18);
}

export function playMissSound() {
  beep(160, 90, 0.12);
}

// A target's exposure window ran out unhit (currently only Reaction mode —
// Gridshot/Switching targets only ever leave play via a hit).
export function playTargetExpireSound() {
  sweep(500, 280, 110, 0.09);
}

// A drill finished and the summary screen is about to show.
export function playCompletionSound() {
  chime([660, 880, 1320], 90, 130, 0.14);
}

// Leaving a session/screen back to the home menu.
export function playMenuSound() {
  sweep(380, 160, 160, 0.09);
}

// Generic light tick for button presses in general — see
// initGlobalClickSounds() below.
export function playClickSound() {
  beep(500, 35, 0.06);
}

// One delegated listener covers every button on the page instead of wiring
// each ui/*.js module individually. Buttons that also trigger a more
// specific sound (e.g. Quit to Menu also firing playMenuSound()) just layer
// the light click under it — a common, deliberate pattern for UI feedback.
export function initGlobalClickSounds(root = document) {
  root.addEventListener("click", (e) => {
    if (e.target.closest("button")) playClickSound();
  });
}

export function flashCrosshair(el, hit) {
  el.classList.remove("crosshair-flash-hit", "crosshair-flash-miss");
  // Force a reflow so re-adding the same class restarts the animation on
  // back-to-back shots instead of being a no-op.
  void el.offsetWidth;
  el.classList.add(hit ? "crosshair-flash-hit" : "crosshair-flash-miss");
}

// A more pronounced "confirmed kill" marker layered on top of the subtle
// flashCrosshair() glow — the classic FPS X hit-marker, not tied to sound
// (the caller decides whether to also play a hit sound).
export function showHitMarker(el) {
  el.classList.remove("hitmarker-pop");
  void el.offsetWidth;
  el.classList.add("hitmarker-pop");
}
