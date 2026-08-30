// The single source of truth for every weapon in the range: which model it
// wears, how it shoots, how it kicks, how it sounds, and where it sits in
// view. Everything else (viewmodel, firing pipeline, HUD, select screen,
// recoil trainer, casing ejection) reads from here, so adding a weapon is
// one entry plus a .glb rather than edits scattered across modules.
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

// `spreadDeg` is the half-angle of the pellet cone and only ever applies to
// multi-pellet weapons. Single-pellet weapons are deliberately pinpoint: a
// random cone on a rifle would inject noise into the exact thing this trainer
// measures, so their spread is 0 rather than a small-but-nonzero flavour value.
//
// Fire modes:
//   auto  - hold to keep firing at `rpm`
//   semi  - one shot per click, still rate-limited by `rpm`
//   bolt  - one shot per click plus a mandatory `cycleMs` action afterwards
//   pump  - same as bolt; separate id only so the UI can label it correctly
export const WEAPONS = {
  rifle: {
    id: "rifle",
    model: "rifle",
    modelYaw: 90 * DEG,
    viewLength: 1.62,
    fireMode: "auto",
    rpm: 640,
    pellets: 1,
    spreadDeg: 0,
    magazine: 30,
    reloadMs: 2100,
    cycleMs: 0,
    adsFov: 30,
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
    sound: { body: 132, crack: 3000, noiseMs: 95, gain: 0.24, tailMs: 150 },
  },

  carbine: {
    id: "carbine",
    model: "carbine",
    modelYaw: 90 * DEG,
    viewLength: 1.55,
    fireMode: "auto",
    rpm: 780,
    pellets: 1,
    spreadDeg: 0,
    magazine: 25,
    reloadMs: 1950,
    cycleMs: 0,
    adsFov: 32,
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
    sound: { body: 148, crack: 3300, noiseMs: 85, gain: 0.23, tailMs: 130 },
  },

  smg: {
    id: "smg",
    model: "smg",
    modelYaw: 90 * DEG,
    viewLength: 1.3,
    fireMode: "auto",
    rpm: 950,
    pellets: 1,
    spreadDeg: 0,
    magazine: 32,
    reloadMs: 1750,
    cycleMs: 0,
    adsFov: 40,
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
    sound: { body: 176, crack: 3600, noiseMs: 62, gain: 0.19, tailMs: 95 },
  },

  sniper: {
    id: "sniper",
    model: "sniper",
    modelYaw: 90 * DEG,
    viewLength: 1.95,
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
    recoilPattern: [{ dx: 0.0, dy: 0.052 }],
    kick: { back: 0.13, rise: 0.03, pitch: 0.34, roll: 0.03, settleMs: 340 },
    sound: { body: 88, crack: 2100, noiseMs: 190, gain: 0.3, tailMs: 460 },
  },

  shotgun: {
    id: "shotgun",
    model: "shotgun",
    modelYaw: 90 * DEG,
    viewLength: 1.7,
    fireMode: "pump",
    rpm: 90,
    pellets: 9,
    spreadDeg: 2.6,
    magazine: 6,
    reloadMs: 3000,
    cycleMs: 720,
    adsFov: 46,
    recoilPattern: [{ dx: 0.0, dy: 0.04 }],
    kick: { back: 0.11, rise: 0.026, pitch: 0.3, roll: 0.04, settleMs: 300 },
    sound: { body: 96, crack: 1700, noiseMs: 165, gain: 0.3, tailMs: 380 },
  },

  breacher: {
    id: "breacher",
    model: "breacher",
    modelYaw: 0,
    viewLength: 1.45,
    fireMode: "pump",
    rpm: 150,
    pellets: 12,
    spreadDeg: 4.4,
    magazine: 2,
    reloadMs: 2100,
    cycleMs: 420,
    adsFov: 52,
    recoilPattern: [{ dx: 0.0, dy: 0.05 }],
    kick: { back: 0.125, rise: 0.03, pitch: 0.33, roll: 0.02, settleMs: 320 },
    sound: { body: 78, crack: 1400, noiseMs: 200, gain: 0.32, tailMs: 430 },
  },

  pistol: {
    id: "pistol",
    model: "pistol",
    modelYaw: 90 * DEG,
    viewLength: 0.86,
    fireMode: "semi",
    rpm: 420,
    pellets: 1,
    spreadDeg: 0,
    magazine: 12,
    reloadMs: 1600,
    cycleMs: 0,
    adsFov: 42,
    recoilPattern: [
      { dx: 0.0, dy: 0.014 },
      { dx: 0.002, dy: 0.013 },
      { dx: -0.003, dy: 0.012 },
    ],
    kick: { back: 0.04, rise: 0.014, pitch: 0.2, roll: 0.03, settleMs: 145 },
    sound: { body: 190, crack: 3100, noiseMs: 78, gain: 0.21, tailMs: 120 },
  },

  revolver: {
    id: "revolver",
    model: "revolver",
    modelYaw: 180 * DEG,
    viewLength: 1.05,
    fireMode: "semi",
    rpm: 190,
    pellets: 1,
    spreadDeg: 0,
    magazine: 6,
    reloadMs: 2600,
    cycleMs: 0,
    adsFov: 38,
    recoilPattern: [{ dx: 0.001, dy: 0.03 }],
    kick: { back: 0.085, rise: 0.024, pitch: 0.29, roll: 0.02, settleMs: 250 },
    sound: { body: 112, crack: 2400, noiseMs: 140, gain: 0.28, tailMs: 300 },
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
