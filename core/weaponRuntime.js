import * as THREE from "three";
import { shotIntervalMs, hasManualAction } from "./weapons.js";

// Per-session firing state for one weapon: ammo, the rate-of-fire gate, the
// bolt/pump action between shots, reloading, and accumulated firing error.
// Kept separate from the static catalogue in weapons.js (which never changes)
// and from the cosmetic Viewmodel, so the "can I shoot right now, and where
// does the shot actually go" question has exactly one owner.
//
// Every timestamp is a performance.now() value and is shifted wholesale by
// shiftClock() when a session is paused, the same contract the drills use.
export class WeaponRuntime {
  // `magazineLimit` off (the default, see core/settings.js) means the weapon
  // never runs dry and never reloads. Everything else about how it fires —
  // rate, the bolt/pump cycle, accuracy — is unchanged, because those are
  // firing mechanics rather than ammunition ones: switching the limit off
  // should remove the bookkeeping, not turn every weapon into the same gun.
  constructor(weapon, { magazineLimit = false } = {}) {
    this.weapon = weapon;
    this.magazineLimit = magazineLimit;
    this.ammo = weapon.magazine;
    this.nextShotAt = 0;
    this.cycleUntil = 0;
    this.reloadUntil = 0;

    // Firing error accumulated by shooting in sequence, in degrees, together
    // with when it was last added to. Bloom is derived from those two rather
    // than decayed per frame: there is no dt to plumb through, a pause
    // shifts it with everything else, and the value is exact at whatever
    // instant it happens to be read.
    this.bloomDeg = 0;
    this.bloomAt = 0;
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
    if (this.magazineLimit && (this.reloading || this.ammo <= 0)) return false;
    return now >= this.nextShotAt && now >= this.cycleUntil;
  }

  // Current firing error from sustained fire, in degrees, bled off at the
  // weapon's own recovery rate since the last shot.
  getBloomDeg(now) {
    const accuracy = this.weapon.accuracy;
    if (!accuracy || this.bloomDeg <= 0) return 0;
    const recovered = (accuracy.recoverPerSec * Math.max(0, now - this.bloomAt)) / 1000;
    return Math.max(0, this.bloomDeg - recovered);
  }

  // Consumes a round and arms whatever delay comes next. Callers must have
  // checked canFire() first.
  consume(now) {
    const accuracy = this.weapon.accuracy;
    if (accuracy) {
      this.bloomDeg = Math.min(accuracy.maxBloomDeg, this.getBloomDeg(now) + accuracy.bloomDeg);
      this.bloomAt = now;
    }

    this.nextShotAt = now + shotIntervalMs(this.weapon);
    if (hasManualAction(this.weapon)) {
      this.cycleUntil = now + this.weapon.cycleMs;
    }
    if (!this.magazineLimit) return;

    this.ammo--;
    // Running dry starts the reload on its own, so an empty magazine is
    // never a dead end the player has to notice and fix manually.
    if (this.ammo === 0) this.startReload(now);
  }

  startReload(now) {
    if (!this.magazineLimit) return false;
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
    if (this.bloomAt > 0) this.bloomAt += deltaMs;
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

// Screen-space (NDC) offsets for one trigger pull: where the shot actually
// goes, and — for a shell — where each pellet in it goes.
//
// Two independent errors stack here, and keeping them separate is what makes
// the model legible:
//
//   The shot's own deviation, from weapons.js's `accuracy` block: the base
//   hip/ADS error blended by `aimT`, plus whatever bloom sustained fire has
//   built up. This moves the *whole* pattern off the crosshair, and is the
//   mechanic that makes a sniper demand ADS and a held trigger punish you.
//
//   The pellet cone, from `spreadDeg`: how wide a shell's pattern is around
//   wherever that centre landed. Single-pellet weapons have no cone at all.
//
// The conversion from an angle to NDC has to go through the camera's actual
// projection: at NDC y the ray's angle off-axis satisfies
// tan(theta) = y * tan(fov/2), and x additionally scales by the aspect
// ratio. Doing it this way keeps a real-world angle constant while the FOV
// slider and ADS zoom move underneath it — a cone authored in degrees stays
// that many degrees at every zoom level.
const RAY_SCRATCH = [];

// sqrt() on the radius keeps draws area-uniform across the disc rather than
// bunching them toward the middle.
function randomOffsetIn(tanRadius, halfFovTan, aspect) {
  const r = Math.sqrt(Math.random()) * tanRadius;
  const theta = Math.random() * Math.PI * 2;
  return {
    x: (r * Math.cos(theta)) / (halfFovTan * aspect),
    y: (r * Math.sin(theta)) / halfFovTan,
  };
}

export function buildShotRays(weapon, camera, { aimT = 0, bloomDeg = 0 } = {}) {
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

  const accuracy = weapon.accuracy;
  const baseDeg = accuracy ? accuracy.hipDeg + (accuracy.adsDeg - accuracy.hipDeg) * aimT : 0;
  const errorDeg = Math.max(0, baseDeg) + Math.max(0, bloomDeg);

  const center =
    errorDeg > 0
      ? randomOffsetIn(Math.tan(THREE.MathUtils.degToRad(errorDeg)), halfFovTan, camera.aspect)
      : { x: 0, y: 0 };

  RAY_SCRATCH.length = 0;
  RAY_SCRATCH.push(center);

  const count = Math.max(1, weapon.pellets);
  if (count === 1 || weapon.spreadDeg <= 0) return RAY_SCRATCH;

  const spreadTan = Math.tan(THREE.MathUtils.degToRad(weapon.spreadDeg));
  for (let i = 1; i < count; i++) {
    const pellet = randomOffsetIn(spreadTan, halfFovTan, camera.aspect);
    RAY_SCRATCH.push({ x: center.x + pellet.x, y: center.y + pellet.y });
  }
  return RAY_SCRATCH;
}
