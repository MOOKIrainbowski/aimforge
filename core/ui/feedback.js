// Shot feedback: a brief crosshair flash plus synthesized audio (no audio
// asset files — WebAudio oscillator/noise envelopes cover every sound in the
// app, keeping the project dependency-free). Muted independently via
// rangeConfig.soundEnabled; the crosshair flash always plays since it costs
// nothing and reads as instant confirmation the click registered.
//
// Everything here is built from three primitives — a tone, a filtered noise
// burst, and a scheduled sequence of either — layered and varied per event.
// The variation matters: a trainer session is hundreds of shots and kills,
// and one identical sample on repeat is the fastest way to make a range feel
// cheap. Every trigger pull and every kill is detuned and re-gained slightly,
// each weapon has its own voice built from its own `sound` block in
// weapons.js, and kills rotate through four distinct sounds.
let soundEnabled = true;
let audioCtx = null;
let masterGain = null;

export function setSoundEnabled(enabled) {
  soundEnabled = enabled;
}

function getAudioContext() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    // One shared output stage keeps the layered gunshots (three voices per
    // shot, on an automatic weapon) from clipping into distortion when they
    // stack during sustained fire.
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.85;
    masterGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

// Random multiplier around 1 — the per-event jitter that stops repeated
// sounds from being bit-identical.
function vary(amount) {
  return 1 + (Math.random() * 2 - 1) * amount;
}

// Schedules one oscillator against `ctx`'s own timeline (rather than
// wall-clock setTimeout) so multi-note sequences stay tightly and
// consistently spaced regardless of browser timer throttling.
function scheduleTone(ctx, startTime, freq, durationMs, peakGain, freqEnd, type = "sine") {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  const durationSec = durationMs / 1000;

  if (freqEnd != null) {
    osc.frequency.setValueAtTime(freq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), startTime + durationSec);
  } else {
    osc.frequency.value = freq;
  }

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  osc.connect(gain).connect(masterGain);
  osc.start(startTime);
  osc.stop(startTime + durationSec + 0.02);
}

function beep(freq, durationMs, peakGain, type = "sine") {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleTone(ctx, ctx.currentTime, freq, durationMs, peakGain, null, type);
}

function sweep(freqStart, freqEnd, durationMs, peakGain, type = "sine") {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleTone(ctx, ctx.currentTime, freqStart, durationMs, peakGain, freqEnd, type);
}

function chime(notes, stepMs, durationMs, peakGain, type = "sine") {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  notes.forEach((freq, i) => {
    scheduleTone(ctx, ctx.currentTime + (i * stepMs) / 1000, freq, durationMs, peakGain, null, type);
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

// A filtered noise burst — the "crack"/"hiss" half of most of these sounds.
// `filterEnd` sweeps the cutoff over the burst, which is what turns a flat
// hiss into a gunshot's tail collapsing into the room.
function scheduleNoise(ctx, startTime, durationMs, peakGain, options = {}) {
  const { type = "lowpass", freq = 3000, freqEnd = null, q = 0.7 } = options;
  const source = ctx.createBufferSource();
  source.buffer = getNoiseBuffer(ctx);
  // Starting at a random point in the shared buffer means two shots fired a
  // frame apart don't play the identical noise waveform.
  const offset = Math.random() * 0.5;

  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const gain = ctx.createGain();
  const durationSec = durationMs / 1000;

  if (freqEnd != null) {
    filter.frequency.setValueAtTime(freq, startTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + durationSec);
  } else {
    filter.frequency.value = freq;
  }

  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

  source.connect(filter).connect(gain).connect(masterGain);
  source.start(startTime, offset);
  source.stop(startTime + durationSec + 0.02);
}

// Fires on every trigger-pull. Three layers, all sized from the weapon's own
// `sound` block in weapons.js, so a breacher booms, an SMG chatters and a
// sniper cracks with a long tail — instead of every gun in the range sharing
// one noise:
//   crack — a bright, very short filtered burst (the muzzle report)
//   body  — a fast pitch-dropping low tone (the punch you feel)
//   tail  — a longer, quieter burst sweeping downward (the room)
export function playShotSound(weapon) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const s = weapon?.sound ?? { body: 140, crack: 3000, noiseMs: 90, gain: 0.22, tailMs: 150 };
  const now = ctx.currentTime;
  const g = s.gain * vary(0.08);

  scheduleNoise(ctx, now, s.noiseMs * vary(0.1), g, {
    type: "bandpass",
    freq: s.crack * vary(0.06),
    freqEnd: s.crack * 0.32,
    q: 0.9,
  });
  scheduleTone(ctx, now, s.body * vary(0.05), Math.max(45, s.noiseMs * 0.7), g * 0.8, s.body * 0.45);
  scheduleNoise(ctx, now + 0.012, s.tailMs * vary(0.12), g * 0.3, {
    type: "lowpass",
    freq: s.crack * 0.5,
    freqEnd: 220,
    q: 0.4,
  });
}

// Four distinct kill sounds, advanced in rotation so consecutive kills never
// repeat, each detuned per play. `streak` lifts the pitch a little as a
// streak builds, so a run of kills climbs instead of flatlining.
const KILL_VARIANTS = [
  // Bright two-note confirm.
  (ctx, now, p, g) => {
    scheduleTone(ctx, now, 880 * p, 60, g, null, "triangle");
    scheduleTone(ctx, now + 0.045, 1320 * p, 90, g * 0.8, null, "triangle");
  },
  // Glassy shatter: a short noise tick under a fast upward chirp.
  (ctx, now, p, g) => {
    scheduleNoise(ctx, now, 55, g * 0.5, { type: "highpass", freq: 2600 * p, q: 0.6 });
    scheduleTone(ctx, now, 640 * p, 110, g, 1560 * p, "sine");
  },
  // Hollow "thock" — low body with a quick click on top.
  (ctx, now, p, g) => {
    scheduleTone(ctx, now, 420 * p, 95, g, 210 * p, "sine");
    scheduleNoise(ctx, now, 30, g * 0.45, { type: "bandpass", freq: 1900 * p, q: 1.4 });
  },
  // Metallic ping with a short overtone.
  (ctx, now, p, g) => {
    scheduleTone(ctx, now, 1180 * p, 130, g * 0.9, null, "square");
    scheduleTone(ctx, now + 0.02, 1770 * p, 70, g * 0.35, null, "sine");
  },
];
let killVariantIndex = 0;

export function playKillSound(streak = 0) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const variant = KILL_VARIANTS[killVariantIndex % KILL_VARIANTS.length];
  killVariantIndex++;
  // Capped so a long streak brightens the tone without turning it shrill.
  const streakLift = 1 + Math.min(streak, 12) * 0.018;
  variant(ctx, ctx.currentTime, streakLift * vary(0.02), 0.17 * vary(0.1));
}

export function playMissSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  // A dull thud into the wall rather than a tone, so a miss doesn't compete
  // with the kill sounds for attention.
  scheduleNoise(ctx, ctx.currentTime, 85 * vary(0.15), 0.09, {
    type: "lowpass",
    freq: 700 * vary(0.15),
    freqEnd: 180,
  });
}

// A target's exposure window ran out unhit (currently only Reaction mode —
// Gridshot/Switching targets only ever leave play via a hit).
export function playTargetExpireSound() {
  sweep(500 * vary(0.04), 280, 110, 0.09);
}

// The manual action between shots on a bolt/pump weapon.
export function playCycleSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  scheduleNoise(ctx, now, 45, 0.075, { type: "bandpass", freq: 1500 * vary(0.1), q: 2.2 });
  scheduleNoise(ctx, now + 0.09, 60, 0.09, { type: "bandpass", freq: 900 * vary(0.1), q: 2.0 });
}

// Magazine change: a clack out, a clack in, and the action closing.
export function playReloadSound(durationMs) {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const d = durationMs / 1000;
  scheduleNoise(ctx, now + d * 0.05, 55, 0.08, { type: "bandpass", freq: 1200, q: 2.0 });
  scheduleNoise(ctx, now + d * 0.55, 65, 0.09, { type: "bandpass", freq: 820, q: 1.8 });
  scheduleNoise(ctx, now + d * 0.85, 50, 0.085, { type: "bandpass", freq: 1650, q: 2.4 });
}

// Trigger pulled with an empty magazine.
export function playDryFireSound() {
  if (!soundEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  scheduleNoise(ctx, ctx.currentTime, 35, 0.07, { type: "bandpass", freq: 2200, q: 3.0 });
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
