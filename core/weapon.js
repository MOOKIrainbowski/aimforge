import * as THREE from "three";
import { WEAPONS } from "./weapons.js";

// Recoil patterns now live with the rest of each weapon's data in
// weapons.js; this module keeps only the training mechanic built on top of
// them. A weaponId of "none" (Recoil Control switched off on the home
// screen) resolves to no preset, which disables the tracker entirely.
export function getWeaponPreset(id) {
  const weapon = WEAPONS[id];
  return weapon && weapon.recoilPattern?.length ? { name: weapon.id, pattern: weapon.recoilPattern } : null;
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
