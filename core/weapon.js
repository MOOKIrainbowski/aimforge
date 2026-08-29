import * as THREE from "three";

// Each pattern is a sequence of per-shot (dx, dy) view-punch offsets in
// radians, applied directly to the pointer-lock controller's yaw/pitch —
// the same units as mouse-look sensitivity, so a punch feels like a real
// camera kick rather than a scripted animation. Once a burst runs past the
// pattern's length, the last step repeats (mimics recoil "settling").
const WEAPON_PRESETS = {
  rifle: {
    name: "Rifle",
    pattern: [
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
  },
  smg: {
    name: "SMG",
    pattern: [
      { dx: 0.002, dy: 0.008 },
      { dx: -0.003, dy: 0.009 },
      { dx: 0.004, dy: 0.01 },
      { dx: -0.005, dy: 0.009 },
      { dx: 0.006, dy: 0.008 },
      { dx: -0.004, dy: 0.007 },
      { dx: 0.003, dy: 0.006 },
      { dx: -0.002, dy: 0.006 },
    ],
  },
};

export function getWeaponPreset(id) {
  return WEAPON_PRESETS[id] ?? null;
}

// Tracks recoil state for a single drill session: applies each shot's punch
// to the camera, and scores how well the player's next aim adjustment
// cancels the previous punch (compensation accuracy), which is the whole
// point of a recoil-control drill — not just "does the view kick."
export class RecoilTracker {
  constructor(weaponId) {
    this.preset = getWeaponPreset(weaponId);
    this.shotIndex = 0;
    this.pending = null; // { idealYaw, idealPitch, yawAtPunch, pitchAtPunch }
    this.compensationRatios = [];
  }

  get enabled() {
    return this.preset !== null;
  }

  // Call before resolving a shot's hit/miss — scores compensation for the
  // *previous* punch based on how the player's aim moved since it landed.
  recordShot(controls) {
    if (!this.pending) return;
    const actualYaw = controls.yaw - this.pending.yawAtPunch;
    const actualPitch = controls.pitch - this.pending.pitchAtPunch;
    const idealYaw = this.pending.idealYaw;
    const idealPitch = this.pending.idealPitch;

    const idealMagSq = idealYaw * idealYaw + idealPitch * idealPitch;
    const ratio = idealMagSq > 0 ? (actualYaw * idealYaw + actualPitch * idealPitch) / idealMagSq : 0;
    this.compensationRatios.push(Math.max(0, Math.min(2, ratio)));
    this.pending = null;
  }

  // Call after a shot resolves — kicks the camera and records what "fully
  // compensated" would look like for the next recordShot() call.
  applyPunch(controls) {
    if (!this.preset) return;
    const step = this.preset.pattern[Math.min(this.shotIndex, this.preset.pattern.length - 1)];
    this.shotIndex++;

    controls.yaw -= step.dx;
    controls.pitch += step.dy;
    controls.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, controls.pitch));
    controls.camera.quaternion.setFromEuler(new THREE.Euler(controls.pitch, controls.yaw, 0, "YXZ"));

    // Fully canceling this punch means moving yaw by +dx and pitch by -dy.
    this.pending = {
      idealYaw: step.dx,
      idealPitch: -step.dy,
      yawAtPunch: controls.yaw,
      pitchAtPunch: controls.pitch,
    };
  }

  getAverageCompensationPercent() {
    if (!this.enabled || this.compensationRatios.length === 0) return null;
    const mean = this.compensationRatios.reduce((sum, r) => sum + r, 0) / this.compensationRatios.length;
    return mean * 100;
  }
}
