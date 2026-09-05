import * as THREE from "three";
import { Drill, baseSessionResult, CENTER_RAY } from "./base.js";
import { getSpawnVolume } from "../scene.js";
import { randRange, mean } from "../utils.js";
import { RecoilTracker } from "../weapon.js";
import { getAngularOffsetDeg, getShotOffsetFromTargetCenter, TargetPart } from "../target.js";

const MIN_RESPAWN_DISPLACEMENT = 1.2;

// A flick shorter than this isn't a meaningful direction to classify against
// (the new target spawned almost where the old one was).
const MIN_FLICK_DEG = 3;
// A remaining offset this small at the moment of the shot counts as "on
// target" rather than a directional miss.
const ACCURATE_DEADZONE_DEG = 2;
// Caps how many hit-position samples a single session stores for the
// history heatmap — enough to see a shape, small enough to keep
// localStorage light across hundreds of saved sessions.
const MAX_STORED_OFFSETS = 200;

// Clicking/Flicking: one target alive at a time. Hit -> destroy + spawn
// next immediately. Miss -> target stays alive, counts against accuracy.
export class GridshotDrill extends Drill {
  constructor(config, deps) {
    super(config, deps);
    this.hits = 0;
    // Kills that landed on a humanoid target's head. Reported as null rather
    // than 0 when the session ran against spheres, which have no zones: a
    // flat "Headshots: 0" would read as a failure rather than as a stat that
    // does not apply.
    this.headshots = 0;
    this.shotsTotal = 0;
    // Shots that connected, as distinct from targets destroyed: a shotgun
    // blast is one shot however many pellets land, so accuracy stays a
    // percentage of trigger pulls and can never exceed 100%.
    this.shotsHit = 0;
    this.currentStreak = 0;
    this.bestStreak = 0;
    this.timeToKillList = [];
    this.currentTarget = null;
    this.currentSpawnTime = 0;
    this.recoil = new RecoilTracker(config.weaponId);

    // Flick-bias tracking: classifies the first shot fired at each newly
    // spawned target as overshoot (rotated past it), undershoot (didn't
    // rotate far enough), or accurate — based on the required flick
    // direction captured at spawn time vs. the offset remaining at the shot.
    this.requiredFlickYaw = 0;
    this.firstShotPending = false;
    this.flickBias = { overshoot: 0, undershoot: 0, accurate: 0 };
    this.hitOffsets = [];
  }

  start(now) {
    super.start(now);
    this._spawnTarget(now);
  }

  _randomSpawnPosition() {
    const vol = getSpawnVolume();
    let pos;
    let attempts = 0;
    do {
      pos = new THREE.Vector3(randRange(vol.minX, vol.maxX), randRange(vol.minY, vol.maxY), vol.z);
      attempts++;
    } while (
      this.currentTarget &&
      pos.distanceTo(this.currentTarget.basePosition) < MIN_RESPAWN_DISPLACEMENT &&
      attempts < 10
    );
    return pos;
  }

  _spawnTarget(now) {
    const position = this._randomSpawnPosition();
    this.requiredFlickYaw = getAngularOffsetDeg(this.camera, position).yawDeg;
    this.firstShotPending = true;
    this.currentTarget = this.targetManager.spawn({
      position,
      radius: this.config.targetRadius ?? 0.35,
      ttl: Infinity,
      color: this.config.targetColor,
      shape: this.config.targetShape,
      now,
    });
    this.currentSpawnTime = now;
  }

  _classifyFlick() {
    if (Math.abs(this.requiredFlickYaw) < MIN_FLICK_DEG) return;
    const offsetYaw = getAngularOffsetDeg(this.camera, this.currentTarget.mesh.position).yawDeg;
    if (Math.abs(offsetYaw) < ACCURATE_DEADZONE_DEG) {
      this.flickBias.accurate++;
    } else if (Math.sign(offsetYaw) === Math.sign(this.requiredFlickYaw)) {
      this.flickBias.undershoot++;
    } else {
      this.flickBias.overshoot++;
    }
  }

  handleShot(now, rays = CENTER_RAY) {
    if (this.recoil.enabled) this.recoil.recordShot(this.controls);

    this.shotsTotal++;
    if (this.firstShotPending) {
      this._classifyFlick();
      this.firstShotPending = false;
    }

    // Recorded from the crosshair, not from whichever pellet landed — the
    // heatmap is about where the player aimed, not where the cone scattered.
    if (this.hitOffsets.length < MAX_STORED_OFFSETS) {
      this.hitOffsets.push(getShotOffsetFromTargetCenter(this.camera, this.currentTarget));
    }

    const positions = [];
    let headshot = false;
    for (const ray of rays) {
      const hit = this.targetManager.raycastHit(this.camera, ray.x, ray.y);
      if (!hit || hit !== this.currentTarget) continue;
      positions.push(hit.mesh.position.clone());
      if (hit.lastHitPart === TargetPart.HEAD) {
        headshot = true;
        this.headshots++;
      }
      hit.markHit();
      this.targetManager.remove(hit);
      this.hits++;
      this.timeToKillList.push(now - this.currentSpawnTime);
      this.currentStreak++;
      this.bestStreak = Math.max(this.bestStreak, this.currentStreak);
      this._spawnTarget(now);
      // Only one target is ever alive here, and it has just been replaced —
      // letting the rest of a shotgun's pellets through would let one blast
      // clear two consecutive targets.
      break;
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
    this.currentSpawnTime += deltaMs;
  }

  end(now) {
    const result = baseSessionResult("gridshot", this.startTime, now);
    result.durationPlanned = this.config.durationMs;
    result.hits = this.hits;
    result.misses = this.shotsTotal - this.shotsHit;
    result.shotsTotal = this.shotsTotal;
    result.accuracy = this.shotsTotal > 0 ? (this.shotsHit / this.shotsTotal) * 100 : 0;
    result.score = this.hits;
    result.extra = {
      avgTimeToKillMs: mean(this.timeToKillList),
      bestStreak: this.bestStreak,
      headshots: this.config.targetShape === "human" ? this.headshots : null,
      timeToKillList: this.timeToKillList,
      avgRecoilCompensation: this.recoil.getAverageCompensationPercent(),
      flickBias: this.flickBias,
      hitOffsets: this.hitOffsets,
    };
    this.targetManager.clear();
    return result;
  }
}
