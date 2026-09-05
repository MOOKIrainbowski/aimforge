import { getAudioContext, getMasterBus, getReverbBus, isSoundEnabled, saturationCurve, scheduleNoise, scheduleTone, vary } from "./engine.js";

// One gunshot, layered from each weapon's own `sound` block in weapons.js.
//
// The layers follow what a real shot actually is, in order of arrival:
//
//   click  the muzzle blast's leading edge — a few milliseconds of very
//          bright noise. This is the "snap" that places the shot close to
//          you; without it a shot sounds like it happened next door.
//   crack  the report proper: a short band of noise sweeping downward as
//          the blast wave loses its high end.
//   body   the expanding gas, as *filtered noise* rather than a tone. This
//          is the single biggest realism fix over the previous version —
//          a pure oscillator for the body is what made every weapon in the
//          range read as a synthesizer beep with a hiss on top.
//   punch  a fast downward sine under everything, 40-190 Hz. Noise alone
//          has no pitch centre and lands weightless; this is the part you
//          feel, and the difference between a revolver that bangs and one
//          that pops.
//   tail   a long, quiet, darkening burst — the shot leaving the room. Sent
//          hard into the shared convolution reverb.
//   mech   the action doing its work a beat later (slide, hammer, cylinder).
//          Small, but its absence is conspicuous: guns are machines.
//
// Every layer is detuned and re-gained per shot, and each weapon runs the
// whole thing through its own saturator, so a breacher clips into the room
// while an SMG stays tight and dry.

// One saturator chain per weapon, built on first shot and reused. Driving a
// tanh harder adds harmonics, which is what separates "a loud sound" from
// "a sound that was loud where it happened"; `trim` gives back the level the
// drive adds so a heavier weapon doesn't simply become a louder one.
const busCache = new Map();

function getWeaponBus(ctx, weapon, sound) {
  const cached = busCache.get(weapon.id);
  if (cached && cached.ctx === ctx) return cached.input;

  const input = ctx.createGain();
  input.gain.value = 1 + sound.drive * 2.2;

  const shaper = ctx.createWaveShaper();
  shaper.curve = saturationCurve(sound.drive);
  shaper.oversample = "2x";

  const trim = ctx.createGain();
  trim.gain.value = sound.gain / (1 + sound.drive * 1.5);

  input.connect(shaper).connect(trim).connect(getMasterBus());
  busCache.set(weapon.id, { ctx, input });
  return input;
}

// A weapon whose `sound` block is missing or partial still has to make a
// noise rather than throw — a shot that silently fails is far worse than a
// generic one.
const FALLBACK = {
  gain: 0.9,
  drive: 0.35,
  reverb: 0.5,
  click: { hz: 5000, ms: 9, gain: 0.45 },
  crack: { hz: 2000, hzEnd: 600, ms: 50, gain: 0.9, q: 0.8 },
  body: { hz: 700, hzEnd: 180, ms: 120, gain: 0.9 },
  punch: { hz: 110, hzEnd: 42, ms: 170, gain: 0.85 },
  tail: { hz: 1100, hzEnd: 200, ms: 460, gain: 0.35 },
  mech: null,
};

export function playGunshot(weapon) {
  if (!isSoundEnabled()) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const s = { ...FALLBACK, ...(weapon?.sound ?? {}) };
  const bus = getWeaponBus(ctx, weapon ?? { id: "_fallback" }, s);
  const verb = getReverbBus();
  const now = ctx.currentTime;
  // One jitter value shared across the layers of a single shot, so the whole
  // report shifts together rather than each layer wandering independently
  // (which smears the transient and sounds like two guns, not one).
  const p = vary(0.045);
  const level = vary(0.07);

  if (s.click) {
    scheduleNoise(ctx, now, s.click.ms, s.click.gain * level, {
      type: "highpass",
      freq: s.click.hz * p,
      q: 0.5,
      dest: bus,
      attack: 0.0004,
    });
  }

  if (s.crack) {
    scheduleNoise(ctx, now, s.crack.ms * vary(0.08), s.crack.gain * level, {
      type: "bandpass",
      freq: s.crack.hz * p,
      freqEnd: s.crack.hzEnd,
      q: s.crack.q ?? 0.8,
      dest: bus,
      send: verb ? s.reverb * 0.35 : 0,
    });
  }

  if (s.body) {
    scheduleNoise(ctx, now + 0.002, s.body.ms * vary(0.08), s.body.gain * level, {
      type: "lowpass",
      freq: s.body.hz * p,
      freqEnd: s.body.hzEnd,
      q: 1.1,
      dest: bus,
      send: verb ? s.reverb * 0.5 : 0,
    });
  }

  if (s.punch) {
    scheduleTone(ctx, now, s.punch.hz * p, s.punch.ms * vary(0.06), s.punch.gain * level, {
      freqEnd: s.punch.hzEnd,
      type: "sine",
      dest: bus,
      attack: 0.002,
      send: verb ? s.reverb * 0.3 : 0,
    });
  }

  if (s.tail) {
    scheduleNoise(ctx, now + 0.014, s.tail.ms * vary(0.12), s.tail.gain * level, {
      type: "lowpass",
      freq: s.tail.hz * p,
      freqEnd: s.tail.hzEnd,
      q: 0.4,
      dest: bus,
      send: verb ? s.reverb : 0,
    });
  }

  if (s.mech) {
    scheduleNoise(ctx, now + s.mech.delayMs / 1000, s.mech.ms, s.mech.gain * level, {
      type: "bandpass",
      freq: s.mech.hz * vary(0.12),
      q: 2.6,
      dest: bus,
    });
  }
}

// Dropped when the context is torn down or a weapon's voicing changes; kept
// exported so dev tooling can force a rebuild without a page reload.
export function resetGunshotBuses() {
  busCache.clear();
}
