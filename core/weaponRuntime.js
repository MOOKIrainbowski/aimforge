import * as THREE from "three";
import { shotIntervalMs, hasManualAction } from "./weapons.js";

// Per-session firing state for one weapon: ammo, the rate-of-fire gate, the
// bolt/pump action between shots, and reloading. Kept separate from the
// static catalogue in weapons.js (which never changes) and from the cosmetic
// Viewmodel, so the "can I shoot right now" question has exactly one owner.
//
// Every timestamp is a performance.now() value and is shifted wholesale by
// shiftClock() when a session is paused, the same contract the drills use.
export class WeaponRuntime {
  constructor(weapon) {
    this.weapon = weapon;
    this.ammo = weapon.magazine;
    this.nextShotAt = 0;
    this.cycleUntil = 0;
    this.reloadUntil = 0;
  }

  get reloading() {
    return this.reloadUntil > 0;
  }

  // True while a bolt/pump weapon is working its action between shots. Drives
  // the HUD's "cycling" readout and the viewmodel's action animation.
  cycling(now) {
    return this.cycleUntil > now;
  }

  get magazine() {
    return this.weapon.magazine;
  }

  canFire(now) {
    return !this.reloading && this.ammo > 0 && now >= this.nextShotAt && now >= this.cycleUntil;
  }

  // Consumes a round and arms whatever delay comes next. Callers must have
  // checked canFire() first.
  consume(now) {
    this.ammo--;
    this.nextShotAt = now + shotIntervalMs(this.weapon);
    if (hasManualAction(this.weapon)) {
      this.cycleUntil = now + this.weapon.cycleMs;
    }
    // Running dry starts the reload on its own, so an empty magazine is
    // never a dead end the player has to notice and fix manually.
    if (this.ammo === 0) this.startReload(now);
  }

  startReload(now) {
    if (this.reloading || this.ammo === this.weapon.magazine) return false;
    this.reloadUntil = now + this.weapon.reloadMs;
    return true;
  }

  update(now) {
    if (this.reloadUntil > 0 && now >= this.reloadUntil) {
      this.reloadUntil = 0;
      this.ammo = this.weapon.magazine;
    }
  }

  shiftClock(deltaMs) {
    if (this.nextShotAt > 0) this.nextShotAt += deltaMs;
    if (this.cycleUntil > 0) this.cycleUntil += deltaMs;
    if (this.reloadUntil > 0) this.reloadUntil += deltaMs;
  }

  // 0..1 progress of whichever wait is currently blocking the trigger, for
  // the HUD's action bar. Returns null when the weapon is ready.
  getBlockProgress(now) {
    if (this.reloading) {
      const total = this.weapon.reloadMs;
      return { kind: "reload", t: 1 - Math.max(0, this.reloadUntil - now) / total };
    }
    if (this.cycling(now)) {
      const total = this.weapon.cycleMs;
      return { kind: "cycle", t: 1 - Math.max(0, this.cycleUntil - now) / total };
    }
    return null;
  }
}

// Screen-space (NDC) offsets for one trigger pull. A single-pellet weapon
// fires exactly down the crosshair; a shotgun adds a cone of pellets around
// it. The first pellet is always dead-centre so a well-aimed blast is never
// robbed by the random draw — the spread decides how much *extra* a shot
// covers, not whether the aimed pellet lands.
//
// The conversion from an angle to NDC has to go through the camera's actual
// projection: at NDC y the ray's angle off-axis satisfies
// tan(theta) = y * tan(fov/2), and x additionally scales by the aspect
// ratio. Doing it this way keeps a shotgun's real-world cone constant while
// the FOV slider and ADS zoom move underneath it.
const RAY_SCRATCH = [];

export function buildShotRays(weapon, camera) {
  const count = Math.max(1, weapon.pellets);
  RAY_SCRATCH.length = 0;
  RAY_SCRATCH.push({ x: 0, y: 0 });
  if (count === 1 || weapon.spreadDeg <= 0) return RAY_SCRATCH;

  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const spreadTan = Math.tan(THREE.MathUtils.degToRad(weapon.spreadDeg));

  for (let i = 1; i < count; i++) {
    // sqrt() on the radius keeps pellets area-uniform across the disc rather
    // than bunching them toward the middle.
    const r = Math.sqrt(Math.random()) * spreadTan;
    const theta = Math.random() * Math.PI * 2;
    RAY_SCRATCH.push({
      x: (r * Math.cos(theta)) / (halfFovTan * camera.aspect),
      y: (r * Math.sin(theta)) / halfFovTan,
    });
  }
  return RAY_SCRATCH;
}
