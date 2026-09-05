import { getAudioContext, getReverbBus, isSoundEnabled, scheduleNoise, scheduleTone, setSoundEnabled, vary } from "../audio/engine.js";
import { playGunshot } from "../audio/gunshot.js";

// Shot and UI feedback: a brief crosshair flash plus synthesized audio. The
// WebAudio graph, its primitives and the gunshot synthesizer itself live in
// core/audio/ — this module is the UI-facing surface: what a kill, a miss, a
// reload or a button press sounds like.
//
// Muted independently via rangeConfig.soundEnabled; the crosshair flash
// always plays since it costs nothing and reads as instant confirmation the
// click registered.
export { setSoundEnabled };

function ui(fn) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  fn(ctx, ctx.currentTime);
}

function beep(freq, durationMs, peakGain, type = "sine") {
  ui((ctx, now) => scheduleTone(ctx, now, freq, durationMs, peakGain, { type }));
}

function sweep(freqStart, freqEnd, durationMs, peakGain, type = "sine") {
  ui((ctx, now) => scheduleTone(ctx, now, freqStart, durationMs, peakGain, { freqEnd, type }));
}

function chime(notes, stepMs, durationMs, peakGain, type = "sine") {
  ui((ctx, now) => {
    notes.forEach((freq, i) => {
      scheduleTone(ctx, now + (i * stepMs) / 1000, freq, durationMs, peakGain, { type });
    });
  });
}

// Fires on every trigger pull, voiced from the weapon's own `sound` block.
export function playShotSound(weapon) {
  playGunshot(weapon);
}

// Four distinct kill sounds, advanced in rotation so consecutive kills never
// repeat, each detuned per play. `streak` lifts the pitch a little as a
// streak builds, so a run of kills climbs instead of flatlining.
const KILL_VARIANTS = [
  // Bright two-note confirm.
  (ctx, now, p, g) => {
    scheduleTone(ctx, now, 880 * p, 60, g, { type: "triangle" });
    scheduleTone(ctx, now + 0.045, 1320 * p, 90, g * 0.8, { type: "triangle" });
  },
  // Glassy shatter: a short noise tick under a fast upward chirp.
  (ctx, now, p, g) => {
    scheduleNoise(ctx, now, 55, g * 0.5, { type: "highpass", freq: 2600 * p, q: 0.6 });
    scheduleTone(ctx, now, 640 * p, 110, g, { freqEnd: 1560 * p });
  },
  // Hollow "thock" — low body with a quick click on top.
  (ctx, now, p, g) => {
    scheduleTone(ctx, now, 420 * p, 95, g, { freqEnd: 210 * p });
    scheduleNoise(ctx, now, 30, g * 0.45, { type: "bandpass", freq: 1900 * p, q: 1.4 });
  },
  // Metallic ping with a short overtone.
  (ctx, now, p, g) => {
    scheduleTone(ctx, now, 1180 * p, 130, g * 0.9, { type: "square" });
    scheduleTone(ctx, now + 0.02, 1770 * p, 70, g * 0.35);
  },
];
let killVariantIndex = 0;

export function playKillSound(streak = 0) {
  ui((ctx, now) => {
    const variant = KILL_VARIANTS[killVariantIndex % KILL_VARIANTS.length];
    killVariantIndex++;
    // Capped so a long streak brightens the tone without turning it shrill.
    const streakLift = 1 + Math.min(streak, 12) * 0.018;
    variant(ctx, now, streakLift * vary(0.02), 0.17 * vary(0.1));
  });
}

export function playMissSound() {
  // A dull thud into the wall rather than a tone, so a miss doesn't compete
  // with the kill sounds for attention. Sent lightly into the room so it
  // lands in the same space the gunshot did.
  ui((ctx, now) => {
    scheduleNoise(ctx, now, 85 * vary(0.15), 0.09, {
      type: "lowpass",
      freq: 700 * vary(0.15),
      freqEnd: 180,
      send: getReverbBus() ? 0.35 : 0,
    });
  });
}

// A target's exposure window ran out unhit (currently only Reaction mode —
// Gridshot/Switching targets only ever leave play via a hit).
export function playTargetExpireSound() {
  sweep(500 * vary(0.04), 280, 110, 0.09);
}

// The manual action between shots on a bolt/pump weapon: the mechanism
// unlocking and travelling back, then slamming home. Two clacks with real
// space between them, because that wait is the mechanic.
export function playCycleSound() {
  ui((ctx, now) => {
    const send = getReverbBus() ? 0.4 : 0;
    scheduleNoise(ctx, now, 26, 0.1, { type: "bandpass", freq: 1900 * vary(0.1), q: 3.2, send });
    scheduleNoise(ctx, now + 0.045, 40, 0.07, { type: "bandpass", freq: 1150 * vary(0.1), q: 2.4, send });
    scheduleNoise(ctx, now + 0.115, 55, 0.12, { type: "bandpass", freq: 780 * vary(0.08), q: 1.8, send });
    scheduleTone(ctx, now + 0.115, 190, 70, 0.06, { freqEnd: 90 });
  });
}

// Magazine change, spread across the reload's real duration: the old
// magazine released and dropped, the new one seated, the action closing.
export function playReloadSound(durationMs) {
  ui((ctx, now) => {
    const d = durationMs / 1000;
    const send = getReverbBus() ? 0.35 : 0;
    scheduleNoise(ctx, now + d * 0.05, 30, 0.08, { type: "bandpass", freq: 1450, q: 2.6, send });
    scheduleNoise(ctx, now + d * 0.28, 70, 0.05, { type: "lowpass", freq: 620, freqEnd: 180, send });
    scheduleNoise(ctx, now + d * 0.62, 45, 0.11, { type: "bandpass", freq: 900, q: 2.0, send });
    scheduleTone(ctx, now + d * 0.62, 160, 60, 0.06, { freqEnd: 80 });
    scheduleNoise(ctx, now + d * 0.88, 35, 0.1, { type: "bandpass", freq: 1750, q: 3.0, send });
  });
}

// Trigger pulled with an empty magazine.
export function playDryFireSound() {
  ui((ctx, now) => {
    scheduleNoise(ctx, now, 22, 0.09, { type: "bandpass", freq: 2400 * vary(0.08), q: 3.4 });
  });
}

// A drill finished and the summary screen is about to show.
export function playCompletionSound() {
  chime([660, 880, 1320], 90, 130, 0.14, "triangle");
}

// Leaving a session/screen back to the home menu.
export function playMenuSound() {
  sweep(380, 160, 160, 0.09);
}

// Generic light tick for button presses in general — see
// initGlobalClickSounds() below.
export function playClickSound() {
  beep(500 * vary(0.03), 35, 0.06);
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
