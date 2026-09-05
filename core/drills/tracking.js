import * as THREE from "three";
import { Drill, baseSessionResult } from "./base.js";
import { getSpawnVolume } from "../scene.js";

function makeStrafeMovement(amplitudeX, speed) {
  const freqA = speed * 0.6;
  const freqB = speed * 0.37;
  return (t) =>
    new THREE.Vector3(
      amplitudeX * (0.65 * Math.sin(t * freqA) + 0.35 * Math.sin(t * freqB + 1.3)),
      0,
      0
    );
}

// Tracking: a single persistent target strafes back and forth; the player
// must keep the crosshair on it. Scored by time-on-target, checked via a
// per-frame raycast rather than discrete clicks.
export class TrackingDrill extends Drill {
  constructor(config, deps) {
    super(config, deps);
    this.onTargetTimeMs = 0;
    this.bestStreakMs = 0;
    this.streakStartTime = null;
    this.target = null;
  }

  start(now) {
    super.start(now);
    const vol = getSpawnVolume();
    const radius = this.config.targetRadius ?? 0.35;
    const basePosition = new THREE.Vector3(0, (vol.minY + vol.maxY) / 2, vol.z);
    const amplitude = (vol.maxX - vol.minX) / 2 - radius;
    const speed = 1.2 * (this.config.speedMultiplier ?? 1);

    this.target = this.targetManager.spawn({
      position: basePosition,
      radius,
      ttl: Infinity,
      color: this.config.targetColor,
      shape: this.config.targetShape,
      movementFn: makeStrafeMovement(amplitude, speed),
      now,
    });
  }

  update(dt, now) {
    const hit = this.targetManager.raycastHit(this.camera);
    if (hit && hit === this.target) {
      this.onTargetTimeMs += dt * 1000;
      if (this.streakStartTime === null) this.streakStartTime = now;
    } else if (this.streakStartTime !== null) {
      this.bestStreakMs = Math.max(this.bestStreakMs, now - this.streakStartTime);
      this.streakStartTime = null;
    }
  }

  getLiveStats(now) {
    const elapsed = now - this.startTime;
    const currentStreakMs = this.streakStartTime !== null ? now - this.streakStartTime : 0;
    return {
      score: Math.round((this.onTargetTimeMs / 1000) * 10) / 10,
      accuracy: elapsed > 0 ? (this.onTargetTimeMs / elapsed) * 100 : 0,
      timeRemainingMs: Math.max(0, this.config.durationMs - elapsed),
      streak: Math.round((currentStreakMs / 1000) * 10) / 10,
    };
  }

  isFinished(now) {
    return now - this.startTime >= this.config.durationMs;
  }

  shiftClock(deltaMs) {
    super.shiftClock(deltaMs);
    if (this.streakStartTime !== null) this.streakStartTime += deltaMs;
  }

  end(now) {
    if (this.streakStartTime !== null) {
      this.bestStreakMs = Math.max(this.bestStreakMs, now - this.streakStartTime);
    }
    const elapsed = now - this.startTime;
    const result = baseSessionResult("tracking", this.startTime, now);
    result.durationPlanned = this.config.durationMs;
    result.accuracy = elapsed > 0 ? (this.onTargetTimeMs / elapsed) * 100 : 0;
    result.score = Math.round((this.onTargetTimeMs / 1000) * 10) / 10;
    result.extra = {
      onTargetTimeMs: this.onTargetTimeMs,
      bestStreakMs: this.bestStreakMs,
    };
    this.targetManager.clear();
    return result;
  }
}
