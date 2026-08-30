import * as THREE from "three";
import { Drill, baseSessionResult, CENTER_RAY } from "./base.js";
import { getSpawnVolume } from "../scene.js";
import { randRange, mean } from "../utils.js";
import { getShotOffsetFromTargetCenter } from "../target.js";

const MAX_STORED_OFFSETS = 200;

// Average full cycle (random delay + exposure window) — used only to size
// the rep count to the duration the player picked on the home screen; the
// drill itself ends on rep count, not on a clock.
const AVG_REP_MS = 2300;
const MIN_DELAY_MS = 500;
const MAX_DELAY_MS = 2500;
const EXPOSURE_MS = 800;

// Reaction Time: targets appear after a randomized delay and vanish after a
// short exposure window if not hit. Early clicks before a target has
// spawned are logged as false starts.
export class ReactionDrill extends Drill {
  constructor(config, deps) {
    super(config, deps);
    this.targetReps = Math.max(5, Math.round(this.config.durationMs / AVG_REP_MS));
    this.estimatedDurationMs = this.targetReps * AVG_REP_MS;
    this.repIndex = 0;
    this.reactionTimes = [];
    this.falseStarts = 0;
    this.timeouts = 0;
    this.phase = "waiting"; // "waiting" | "armed"
    this.nextSpawnAt = 0;
    this.spawnedAt = 0;
    this.currentTarget = null;
    this.hitOffsets = [];
  }

  start(now) {
    super.start(now);
    this._scheduleNext(now);
  }

  _scheduleNext(now) {
    this.phase = "waiting";
    this.currentTarget = null;
    this.nextSpawnAt = now + randRange(MIN_DELAY_MS, MAX_DELAY_MS);
  }

  _spawnTarget(now) {
    const vol = getSpawnVolume();
    const position = new THREE.Vector3(randRange(vol.minX, vol.maxX), randRange(vol.minY, vol.maxY), vol.z);
    this.currentTarget = this.targetManager.spawn({
      position,
      radius: this.config.targetRadius ?? 0.35,
      ttl: EXPOSURE_MS,
      color: this.config.targetColor,
      now,
    });
    this.spawnedAt = now;
    this.phase = "armed";
  }

  update(_dt, now, expiredTargets) {
    if (this.phase === "waiting" && now >= this.nextSpawnAt && this.repIndex < this.targetReps) {
      this._spawnTarget(now);
      return;
    }
    if (this.phase === "armed" && expiredTargets.some((t) => t === this.currentTarget)) {
      this.timeouts++;
      this.repIndex++;
      if (this.repIndex < this.targetReps) this._scheduleNext(now);
    }
  }

  handleShot(now, rays = CENTER_RAY) {
    if (this.phase === "waiting") {
      this.falseStarts++;
      return { hit: false, positions: [] };
    }
    if (this.hitOffsets.length < MAX_STORED_OFFSETS) {
      this.hitOffsets.push(getShotOffsetFromTargetCenter(this.camera, this.currentTarget));
    }

    const positions = [];
    for (const ray of rays) {
      const hit = this.targetManager.raycastHit(this.camera, ray.x, ray.y);
      if (!hit || hit !== this.currentTarget) continue;
      positions.push(hit.mesh.position.clone());
      hit.markHit();
      this.targetManager.remove(hit);
      this.reactionTimes.push(now - this.spawnedAt);
      this.repIndex++;
      if (this.repIndex < this.targetReps) this._scheduleNext(now);
      break;
    }
    // A stray click that misses the armed target doesn't end the rep —
    // it stays live until hit or its exposure window times out above.
    return {
      hit: positions.length > 0,
      positions,
      targetRadius: this.config.targetRadius ?? 0.35,
    };
  }

  getLiveStats(now) {
    const elapsed = now - this.startTime;
    const attempts = this.reactionTimes.length + this.timeouts;
    return {
      score: this.reactionTimes.length,
      accuracy: attempts > 0 ? (this.reactionTimes.length / attempts) * 100 : 0,
      timeRemainingMs: Math.max(0, this.estimatedDurationMs - elapsed),
      streak: 0,
    };
  }

  isFinished(_now) {
    return this.repIndex >= this.targetReps;
  }

  shiftClock(deltaMs) {
    super.shiftClock(deltaMs);
    this.nextSpawnAt += deltaMs;
    this.spawnedAt += deltaMs;
  }

  end(now) {
    const attempts = this.reactionTimes.length + this.timeouts;
    const result = baseSessionResult("reaction", this.startTime, now);
    result.durationPlanned = this.config.durationMs;
    result.hits = this.reactionTimes.length;
    result.misses = this.timeouts;
    result.shotsTotal = attempts;
    result.accuracy = attempts > 0 ? (this.reactionTimes.length / attempts) * 100 : 0;
    result.score = this.reactionTimes.length;
    result.extra = {
      avgReactionTimeMs: mean(this.reactionTimes),
      fastestMs: this.reactionTimes.length ? Math.min(...this.reactionTimes) : 0,
      slowestMs: this.reactionTimes.length ? Math.max(...this.reactionTimes) : 0,
      falseStarts: this.falseStarts,
      timeouts: this.timeouts,
      reactionTimes: this.reactionTimes,
      hitOffsets: this.hitOffsets,
    };
    this.targetManager.clear();
    return result;
  }
}
