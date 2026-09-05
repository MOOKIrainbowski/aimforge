import * as THREE from "three";
import { Drill, baseSessionResult, CENTER_RAY } from "./base.js";
import { getSpawnVolume } from "../scene.js";
import { randRange, mean } from "../utils.js";
import { RecoilTracker } from "../weapon.js";
import { TargetPart } from "../target.js";

const MIN_TARGET_SEPARATION = 1.4;
const MAX_PLACEMENT_ATTEMPTS = 20;

// Target Switching: N targets spawn simultaneously as a "wave"; the player
// must clear all of them before the next wave spawns, training fast
// re-acquisition between targets.
export class SwitchingDrill extends Drill {
  constructor(config, deps) {
    super(config, deps);
    this.hits = 0;
    // See gridshot: null rather than 0 when the session ran against spheres.
    this.headshots = 0;
    this.shotsTotal = 0;
    // See gridshot: targets destroyed vs. trigger pulls that connected.
    this.shotsHit = 0;
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.wavesCompleted = 0;
    this.switchTimes = [];
    this.currentWaveIds = new Set();
    this.lastHitTime = 0;
    this.recoil = new RecoilTracker(config.weaponId);
  }

  start(now) {
    super.start(now);
    this._spawnWave(now);
  }

  _spawnWave(now) {
    const vol = getSpawnVolume();
    const radius = this.config.targetRadius ?? 0.35;
    const waveSize = this.config.waveSize ?? 4;
    const placed = [];

    for (let i = 0; i < waveSize; i++) {
      let position;
      let attempts = 0;
      do {
        position = new THREE.Vector3(randRange(vol.minX, vol.maxX), randRange(vol.minY, vol.maxY), vol.z);
        attempts++;
      } while (
        placed.some((p) => p.distanceTo(position) < MIN_TARGET_SEPARATION) &&
        attempts < MAX_PLACEMENT_ATTEMPTS
      );
      placed.push(position);

      const target = this.targetManager.spawn({
        position,
        radius,
        ttl: Infinity,
        color: this.config.targetColor,
        shape: this.config.targetShape,
        now,
      });
      this.currentWaveIds.add(target.id);
    }
    this.lastHitTime = now;
  }

  handleShot(now, rays = CENTER_RAY) {
    if (this.recoil.enabled) this.recoil.recordShot(this.controls);

    this.shotsTotal++;
    const positions = [];
    let headshot = false;
    for (const ray of rays) {
      const hit = this.targetManager.raycastHit(this.camera, ray.x, ray.y);
      if (!hit || !this.currentWaveIds.has(hit.id)) continue;

      positions.push(hit.mesh.position.clone());
      if (hit.lastHitPart === TargetPart.HEAD) {
        headshot = true;
        this.headshots++;
      }
      hit.markHit();
      this.targetManager.remove(hit);
      this.currentWaveIds.delete(hit.id);
      this.hits++;
      // Only the first target a blast clears times a real re-acquisition;
      // the rest died to the same trigger pull and would otherwise log ~0ms
      // switches and flatter the average.
      if (positions.length === 1) {
        this.switchTimes.push(now - this.lastHitTime);
        this.lastHitTime = now;
      }
      this.currentStreak++;
      this.bestStreak = Math.max(this.bestStreak, this.currentStreak);

      if (this.currentWaveIds.size === 0) {
        this.wavesCompleted++;
        this._spawnWave(now);
        // Stop here so leftover pellets can't reach into the fresh wave.
        break;
      }
    }

    if (positions.length > 0) this.shotsHit++;
    else this.currentStreak = 0;

    if (this.recoil.enabled) this.recoil.applyPunch(this.controls);
    return {
      hit: positions.length > 0,
      headshot,
      positions,
      streak: this.currentStreak,
      targetRadius: this.config.targetRadius ?? 0.35,
    };
  }

  getLiveStats(now) {
    const elapsed = now - this.startTime;
    return {
      score: this.hits,
      accuracy: this.shotsTotal > 0 ? (this.shotsHit / this.shotsTotal) * 100 : 0,
      timeRemainingMs: Math.max(0, this.config.durationMs - elapsed),
      streak: this.currentStreak,
    };
  }

  isFinished(now) {
    return now - this.startTime >= this.config.durationMs;
  }

  shiftClock(deltaMs) {
    super.shiftClock(deltaMs);
    this.lastHitTime += deltaMs;
  }

  end(now) {
    const result = baseSessionResult("switching", this.startTime, now);
    result.durationPlanned = this.config.durationMs;
    result.hits = this.hits;
    result.misses = this.shotsTotal - this.shotsHit;
    result.shotsTotal = this.shotsTotal;
    result.accuracy = this.shotsTotal > 0 ? (this.shotsHit / this.shotsTotal) * 100 : 0;
    result.score = this.hits;
    result.extra = {
      avgSwitchTimeMs: mean(this.switchTimes),
      wavesCompleted: this.wavesCompleted,
      bestStreak: this.bestStreak,
      headshots: this.config.targetShape === "human" ? this.headshots : null,
      avgRecoilCompensation: this.recoil.getAverageCompensationPercent(),
      switchTimes: this.switchTimes,
    };
    this.targetManager.clear();
    return result;
  }
}
