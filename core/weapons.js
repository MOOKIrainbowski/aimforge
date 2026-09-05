// The single source of truth for every weapon in the range: which model it
// wears, how it shoots, how accurate it is, how it kicks, how it sounds, and
// where it sits in view. Everything else (viewmodel, firing pipeline, HUD,
// select screen, recoil trainer, casing ejection) reads from here, so adding
// a weapon is one entry plus a .glb rather than edits scattered across
// modules.
//
// Model orientation notes — the source .glb files come from two different
// authoring pipelines and do not agree on which axis the barrel runs along:
//   - Quaternius exports (FBX2glTF): Y-up, barrel along +X  -> yaw +90deg
//   - Zsky exports (obj2gltf):       Y-up, barrel along -Z  -> yaw 0
//     ...except the revolver, which is modelled facing +Z   -> yaw 180deg
// `modelYaw` is that correction, measured per file rather than assumed (see
// tools/ for the bounding-box/bulk analysis used to find each barrel end).
// It is a fact about the asset, not a stylistic choice.

const DEG = Math.PI / 180;

// ---------------------------------------------------------------------------
// The four data blocks each weapon carries, and what the numbers mean
// ---------------------------------------------------------------------------
//
// FIRE MODES
//   auto  - hold to keep firing at `rpm`
//   semi  - one shot per click, still rate-limited by `rpm`
//   bolt  - one shot per click plus a mandatory `cycleMs` action afterwards
//   pump  - same as bolt; separate id only so the UI can label it correctly
//
// `spreadDeg` is the half-angle of the pellet cone and only ever applies to
// multi-pellet weapons — it decides how wide a shell's pattern is, and is
// separate from `accuracy` below, which decides where the pattern is centred.
//
// ACCURACY (`accuracy`) — the Valorant-style firing-error model. Total error
// for a shot is a base term plus accumulated bloom:
//
//   base   linear blend from `hipDeg` to `adsDeg` by how far into ADS the
//          player is. This is the knob that makes a weapon demand aiming
//          down sights: the sniper's 6 degrees of hip error is roughly a
//          metre of miss at range, which is the "you cannot shoot this from
//          the hip" the mode is for.
//   bloom  `bloomDeg` added per shot fired in sequence, capped at
//          `maxBloomDeg`, bleeding off at `recoverPerSec` degrees a second
//          once the trigger is released. Bloom starts at zero, so the first
//          shot after any pause carries only the base term — tap-firing
//          stays a test of aim, and only sustained fire is punished.
//
// TUNING NOTE, learned the hard way: recovery runs continuously, including
// during the gap between two shots of sustained fire. So bloom only actually
// accumulates when
//
//     bloomDeg  >  recoverPerSec * (60 / rpm)
//
// Miss that and a weapon's bloom silently does nothing at all — it recovers
// between shots as fast as firing adds it, and the numbers look reasonable
// while having no effect whatsoever. The values below are derived from two
// intentions instead of guessed: reach `maxBloomDeg` after roughly ten
// rounds held down, and recover fully in a little under half a second. That
// is why `bloomDeg` is much larger than the per-shot growth it produces —
// most of it is spent cancelling the recovery that happens in the same
// interval. tools/debug_weapons.js asserts the accumulation actually occurs.
//
// Bolt and pump weapons are the deliberate exception: their action forces a
// gap far longer than the recovery time, so bloom always clears between
// shots and the base term is the whole story for them.
//
// Deliberately, base error is never zero for hip fire but *is* zero (or
// near) in ADS on the precision weapons. A trainer measuring aim must not
// inject randomness into a well-aimed shot; the error here is a cost of
// firing badly, not noise on firing well.
//
// SOUND (`sound`) — the layers of one gunshot, synthesized in
// core/audio/gunshot.js. Sizes are per weapon so a breacher booms, an SMG
// chatters and a revolver bangs, all from the same code:
//   click  ms of very bright noise: the blast's leading edge, "closeness"
//   crack  the report, a band of noise sweeping down as the wave dulls
//   body   the expanding gas, as filtered noise (not a tone — a tone here
//          is what makes a synthesized gunshot sound like a synthesizer)
//   punch  the low sine you feel underneath, 26-170 Hz
//   tail   the shot leaving the room, sent hard into the shared reverb
//   mech   the action working a beat later; null on bolt/pump weapons,
//          whose action is its own sound (see playCycleSound)
//   drive  how hard this weapon's own saturator is pushed
//   reverb how much of it the room gets back
//
// VIEW (`viewLength`, `viewOffsetY`) — `viewLength` scales the normalised
// model so weapons read correctly in size *relative to each other*.
// `viewOffsetY` raises the hip-fire hold; handguns need it because they are
// short enough to hang below the frame at the shared hold height. It applies
// to the hip pose only — the aimed pose is derived from the scope lens and
// must not be nudged out from under it.
export const WEAPONS = {
  rifle: {
    id: "rifle",
    model: "rifle",
    modelYaw: 90 * DEG,
    viewLength: 1.62,
    viewOffsetY: 0,
    fireMode: "auto",
    rpm: 640,
    pellets: 1,
    spreadDeg: 0,
    magazine: 30,
    reloadMs: 2100,
    cycleMs: 0,
    adsFov: 30,
    accuracy: { hipDeg: 0.5, adsDeg: 0.06, bloomDeg: 0.65, maxBloomDeg: 2.1, recoverPerSec: 4.6 },
    // Per-shot (dx, dy) view punches in radians, applied straight to the
    // look controller's yaw/pitch, so a punch feels like a real camera kick
    // rather than a scripted animation. Past the pattern's length the last
    // step repeats, which mimics recoil "settling".
    recoilPattern: [
      { dx: 0.0, dy: 0.01 },
      { dx: 0.001, dy: 0.012 },
      { dx: -0.002, dy: 0.013 },
      { dx: 0.003, dy: 0.014 },
      { dx: -0.004, dy: 0.015 },
      { dx: 0.005, dy: 0.013 },
      { dx: -0.006, dy: 0.012 },
      { dx: 0.006, dy: 0.011 },
      { dx: -0.005, dy: 0.01 },
      { dx: 0.004, dy: 0.009 },
    ],
    kick: { back: 0.055, rise: 0.016, pitch: 0.16, roll: 0.05, settleMs: 165 },
    sound: {
      gain: 0.95,
      drive: 0.48,
      reverb: 0.6,
      click: { hz: 6000, ms: 8, gain: 0.55 },
      crack: { hz: 2300, hzEnd: 620, ms: 46, gain: 0.95, q: 0.85 },
      body: { hz: 760, hzEnd: 190, ms: 120, gain: 0.92 },
      punch: { hz: 124, hzEnd: 46, ms: 155, gain: 0.82 },
      tail: { hz: 1200, hzEnd: 210, ms: 480, gain: 0.34 },
      mech: { hz: 3400, ms: 20, gain: 0.15, delayMs: 32 },
    },
  },

  carbine: {
    id: "carbine",
    model: "carbine",
    modelYaw: 90 * DEG,
    viewLength: 1.55,
    viewOffsetY: 0,
    fireMode: "auto",
    rpm: 780,
    pellets: 1,
    spreadDeg: 0,
    magazine: 25,
    reloadMs: 1950,
    cycleMs: 0,
    adsFov: 32,
    accuracy: { hipDeg: 0.6, adsDeg: 0.09, bloomDeg: 0.63, maxBloomDeg: 2.4, recoverPerSec: 5.3 },
    recoilPattern: [
      { dx: 0.001, dy: 0.009 },
      { dx: -0.002, dy: 0.011 },
      { dx: 0.003, dy: 0.013 },
      { dx: -0.004, dy: 0.014 },
      { dx: 0.005, dy: 0.014 },
      { dx: -0.006, dy: 0.012 },
      { dx: 0.005, dy: 0.011 },
      { dx: -0.004, dy: 0.01 },
    ],
    kick: { back: 0.05, rise: 0.014, pitch: 0.145, roll: 0.06, settleMs: 150 },
    sound: {
      gain: 0.9,
      drive: 0.44,
      reverb: 0.52,
      click: { hz: 6500, ms: 7, gain: 0.55 },
      crack: { hz: 2700, hzEnd: 740, ms: 38, gain: 0.92, q: 0.95 },
      body: { hz: 880, hzEnd: 225, ms: 100, gain: 0.85 },
      punch: { hz: 140, hzEnd: 54, ms: 130, gain: 0.74 },
      tail: { hz: 1350, hzEnd: 240, ms: 400, gain: 0.3 },
      mech: { hz: 3500, ms: 18, gain: 0.15, delayMs: 28 },
    },
  },

  smg: {
    id: "smg",
    model: "smg",
    modelYaw: 90 * DEG,
    viewLength: 1.3,
    viewOffsetY: 0,
    fireMode: "auto",
    rpm: 950,
    pellets: 1,
    spreadDeg: 0,
    magazine: 32,
    reloadMs: 1750,
    cycleMs: 0,
    adsFov: 40,
    accuracy: { hipDeg: 0.85, adsDeg: 0.34, bloomDeg: 0.76, maxBloomDeg: 3.3, recoverPerSec: 8.2 },
    recoilPattern: [
      { dx: 0.002, dy: 0.008 },
      { dx: -0.003, dy: 0.009 },
      { dx: 0.004, dy: 0.01 },
      { dx: -0.005, dy: 0.009 },
      { dx: 0.006, dy: 0.008 },
      { dx: -0.004, dy: 0.007 },
      { dx: 0.003, dy: 0.006 },
      { dx: -0.002, dy: 0.006 },
    ],
    kick: { back: 0.036, rise: 0.01, pitch: 0.11, roll: 0.07, settleMs: 115 },
    // Short and dry on purpose: at 950rpm a long tail on every shot stacks
    // into an undifferentiated roar instead of a rate of fire you can hear.
    sound: {
      gain: 0.72,
      drive: 0.34,
      reverb: 0.3,
      click: { hz: 6800, ms: 5, gain: 0.44 },
      crack: { hz: 3000, hzEnd: 900, ms: 28, gain: 0.78, q: 1.0 },
      body: { hz: 1050, hzEnd: 300, ms: 62, gain: 0.66 },
      punch: { hz: 170, hzEnd: 70, ms: 80, gain: 0.58 },
      tail: { hz: 1600, hzEnd: 320, ms: 180, gain: 0.2 },
      mech: { hz: 3600, ms: 18, gain: 0.16, delayMs: 26 },
    },
  },

  sniper: {
    id: "sniper",
    model: "sniper",
    modelYaw: 90 * DEG,
    viewLength: 1.95,
    viewOffsetY: 0,
    fireMode: "bolt",
    rpm: 60,
    pellets: 1,
    spreadDeg: 0,
    magazine: 5,
    reloadMs: 2900,
    // The requested "reload after every shot" — a bolt cycle the player has
    // to wait out between shots, on top of the magazine reload.
    cycleMs: 1200,
    adsFov: 12,
    // Six degrees of hip error is about a metre of miss at range: this
    // weapon is deliberately unusable unless scoped, and dead-on the moment
    // it is. Bloom recovers well inside the bolt cycle, so a scoped sniper
    // is never fighting its own error.
    accuracy: { hipDeg: 6.0, adsDeg: 0.0, bloomDeg: 0.5, maxBloomDeg: 3.0, recoverPerSec: 1.5 },
    recoilPattern: [{ dx: 0.0, dy: 0.052 }],
    kick: { back: 0.13, rise: 0.03, pitch: 0.34, roll: 0.03, settleMs: 340 },
    // Whipcrack over rolling thunder — the longest tail in the range.
    sound: {
      gain: 1.25,
      drive: 0.66,
      reverb: 1.0,
      click: { hz: 7200, ms: 10, gain: 0.8 },
      crack: { hz: 2050, hzEnd: 380, ms: 105, gain: 1.15, q: 0.65 },
      body: { hz: 560, hzEnd: 125, ms: 260, gain: 1.15 },
      punch: { hz: 86, hzEnd: 30, ms: 330, gain: 1.15 },
      tail: { hz: 1000, hzEnd: 105, ms: 1150, gain: 0.62 },
      mech: null,
    },
  },

  shotgun: {
    id: "shotgun",
    model: "shotgun",
    modelYaw: 90 * DEG,
    viewLength: 1.7,
    viewOffsetY: 0,
    fireMode: "pump",
    rpm: 90,
    pellets: 9,
    spreadDeg: 2.6,
    magazine: 6,
    reloadMs: 3000,
    cycleMs: 720,
    adsFov: 46,
    accuracy: { hipDeg: 0.9, adsDeg: 0.45, bloomDeg: 1.0, maxBloomDeg: 1.8, recoverPerSec: 1.0 },
    recoilPattern: [{ dx: 0.0, dy: 0.04 }],
    kick: { back: 0.11, rise: 0.026, pitch: 0.3, roll: 0.04, settleMs: 300 },
    sound: {
      gain: 1.2,
      drive: 0.6,
      reverb: 0.9,
      click: { hz: 4200, ms: 13, gain: 0.6 },
      crack: { hz: 1300, hzEnd: 320, ms: 80, gain: 1.0, q: 0.6 },
      body: { hz: 480, hzEnd: 120, ms: 215, gain: 1.15 },
      punch: { hz: 80, hzEnd: 30, ms: 300, gain: 1.1 },
      tail: { hz: 780, hzEnd: 130, ms: 820, gain: 0.52 },
      mech: null,
    },
  },

  breacher: {
    id: "breacher",
    model: "breacher",
    modelYaw: 0,
    viewLength: 1.45,
    viewOffsetY: 0,
    fireMode: "pump",
    rpm: 150,
    pellets: 12,
    spreadDeg: 4.4,
    magazine: 2,
    reloadMs: 2100,
    cycleMs: 420,
    adsFov: 52,
    accuracy: { hipDeg: 1.4, adsDeg: 0.9, bloomDeg: 0.9, maxBloomDeg: 2.2, recoverPerSec: 1.4 },
    recoilPattern: [{ dx: 0.0, dy: 0.05 }],
    kick: { back: 0.125, rise: 0.03, pitch: 0.33, roll: 0.02, settleMs: 320 },
    sound: {
      gain: 1.3,
      drive: 0.7,
      reverb: 1.0,
      click: { hz: 3600, ms: 15, gain: 0.62 },
      crack: { hz: 1050, hzEnd: 260, ms: 95, gain: 1.05, q: 0.55 },
      body: { hz: 400, hzEnd: 100, ms: 250, gain: 1.25 },
      punch: { hz: 68, hzEnd: 26, ms: 340, gain: 1.2 },
      tail: { hz: 700, hzEnd: 110, ms: 950, gain: 0.58 },
      mech: null,
    },
  },

  pistol: {
    id: "pistol",
    model: "pistol",
    modelYaw: 90 * DEG,
    viewLength: 0.86,
    // Handguns are short enough to sit below the frame at the shared hold
    // height — they read as dropped rather than carried without this.
    viewOffsetY: 0.11,
    fireMode: "semi",
    rpm: 420,
    pellets: 1,
    spreadDeg: 0,
    magazine: 12,
    reloadMs: 1600,
    cycleMs: 0,
    adsFov: 42,
    accuracy: { hipDeg: 0.45, adsDeg: 0.1, bloomDeg: 1.0, maxBloomDeg: 2.0, recoverPerSec: 5.0 },
    recoilPattern: [
      { dx: 0.0, dy: 0.014 },
      { dx: 0.002, dy: 0.013 },
      { dx: -0.003, dy: 0.012 },
    ],
    kick: { back: 0.04, rise: 0.014, pitch: 0.2, roll: 0.03, settleMs: 145 },
    sound: {
      gain: 0.85,
      drive: 0.4,
      reverb: 0.45,
      click: { hz: 6200, ms: 7, gain: 0.5 },
      crack: { hz: 2600, hzEnd: 780, ms: 40, gain: 0.85, q: 0.9 },
      body: { hz: 900, hzEnd: 240, ms: 95, gain: 0.8 },
      punch: { hz: 150, hzEnd: 58, ms: 120, gain: 0.7 },
      tail: { hz: 1400, hzEnd: 260, ms: 320, gain: 0.26 },
      mech: { hz: 3200, ms: 26, gain: 0.2, delayMs: 42 },
    },
  },

  revolver: {
    id: "revolver",
    model: "revolver",
    modelYaw: 180 * DEG,
    viewLength: 1.05,
    viewOffsetY: 0.09,
    fireMode: "semi",
    rpm: 190,
    pellets: 1,
    spreadDeg: 0,
    magazine: 6,
    reloadMs: 2600,
    cycleMs: 0,
    adsFov: 38,
    // The most accurate weapon in the range, hip or scoped — that is what it
    // trades its six rounds and its rate of fire for.
    accuracy: { hipDeg: 0.35, adsDeg: 0.0, bloomDeg: 1.3, maxBloomDeg: 1.6, recoverPerSec: 3.2 },
    recoilPattern: [{ dx: 0.001, dy: 0.03 }],
    kick: { back: 0.085, rise: 0.024, pitch: 0.29, roll: 0.02, settleMs: 250 },
    // The heavy bang: the lowest punch of any sidearm, the most saturation,
    // and nearly all of it fed back through the room.
    sound: {
      gain: 1.15,
      drive: 0.62,
      reverb: 0.92,
      click: { hz: 5200, ms: 11, gain: 0.62 },
      crack: { hz: 1750, hzEnd: 430, ms: 68, gain: 1.05, q: 0.7 },
      body: { hz: 620, hzEnd: 150, ms: 185, gain: 1.1 },
      punch: { hz: 92, hzEnd: 34, ms: 260, gain: 1.05 },
      tail: { hz: 900, hzEnd: 150, ms: 760, gain: 0.5 },
      mech: { hz: 2400, ms: 30, gain: 0.14, delayMs: 130 },
    },
  },
};

// Display order for the weapon-select popup — roughly light to heavy, so
// the grid reads as a progression rather than object-key order.
export const WEAPON_ORDER = ["pistol", "revolver", "smg", "rifle", "carbine", "shotgun", "breacher", "sniper"];

export const DEFAULT_WEAPON_ID = "rifle";

export function getWeapon(id) {
  return WEAPONS[id] ?? WEAPONS[DEFAULT_WEAPON_ID];
}

export function isWeaponId(id) {
  return Object.prototype.hasOwnProperty.call(WEAPONS, id);
}

// Milliseconds between shots implied by the weapon's cyclic rate.
export function shotIntervalMs(weapon) {
  return 60000 / weapon.rpm;
}

// True for weapons that fire while the trigger is held rather than once per
// click — the only fire mode the per-frame firing loop needs to poll.
export function isAutomatic(weapon) {
  return weapon.fireMode === "auto";
}

// Weapons that run a manual action (bolt/pump) between shots.
export function hasManualAction(weapon) {
  return weapon.cycleMs > 0;
}
