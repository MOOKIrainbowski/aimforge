import * as THREE from "three";

export const TargetState = Object.freeze({
  ALIVE: "alive",
  HIT: "hit",
  EXPIRED: "expired",
});

// Signed yaw/pitch angle (degrees) from the camera's current aim direction
// to a world position — positive yaw means the position is to the right of
// the crosshair, positive pitch means above it. Used by Gridshot to classify
// a flick as overshoot/undershoot: compare the offset remaining at the
// moment of the shot against the direction the flick had to travel.
export function getAngularOffsetDeg(camera, position) {
  const forward = camera.getWorldDirection(new THREE.Vector3());
  const dir = new THREE.Vector3().subVectors(position, camera.position).normalize();

  const yawForward = Math.atan2(forward.x, -forward.z);
  const yawDir = Math.atan2(dir.x, -dir.z);
  const yawOffset = Math.atan2(Math.sin(yawDir - yawForward), Math.cos(yawDir - yawForward));

  const pitchForward = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
  const pitchDir = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));

  return {
    yawDeg: THREE.MathUtils.radToDeg(yawOffset),
    pitchDeg: THREE.MathUtils.radToDeg(pitchDir - pitchForward),
  };
}

// Where a shot landed relative to a target's center, normalized by the
// target's on-screen angular radius so it's comparable across difficulty
// sizes and distances: {x: 0, y: 0} is dead center, magnitude ~1 is the
// target's edge. Positive x = right of center, positive y = above center.
// Only meaningful for a shot fired at a *known* single target (Gridshot,
// Reaction) — feeds the history screen's hit-position heatmap.
export function getShotOffsetFromTargetCenter(camera, target) {
  const { yawDeg, pitchDeg } = getAngularOffsetDeg(camera, target.mesh.position);
  const distance = camera.position.distanceTo(target.mesh.position);
  const angularRadiusDeg = THREE.MathUtils.radToDeg(Math.atan(target.radius / Math.max(distance, 0.01)));
  const safeRadius = Math.max(angularRadiusDeg, 0.01);
  return { x: -yawDeg / safeRadius, y: -pitchDeg / safeRadius };
}

let nextTargetId = 1;

// A single spawned target. Drills configure behavior entirely through the
// config object passed at spawn time — this class itself has no notion of
// which drill mode it belongs to.
export class Target {
  constructor(config, quality) {
    this.id = nextTargetId++;
    this.radius = config.radius ?? 0.35;
    this.ttl = config.ttl ?? Infinity;
    this.movementFn = config.movementFn ?? null;
    this.color = config.color ?? 0xff5c5c;

    this.spawnTime = config.now;
    this.state = TargetState.ALIVE;
    this.basePosition = config.position.clone();

    const geometry = new THREE.SphereGeometry(this.radius, quality.targetSegments, quality.targetSegments / 2);
    const material = new THREE.MeshStandardMaterial({
      color: this.color,
      roughness: 0.3,
      metalness: 0.15,
      envMapIntensity: quality.envMap ? 1 : 0,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.copy(this.basePosition);
    this.mesh.userData.targetId = this.id;
    this.mesh.castShadow = quality.shadows;
  }

  update(dt, now) {
    if (this.state !== TargetState.ALIVE) return;

    const age = now - this.spawnTime;
    if (this.movementFn) {
      const offset = this.movementFn(age / 1000, this.basePosition);
      this.mesh.position.copy(this.basePosition).add(offset);
    }

    if (age >= this.ttl) {
      this.state = TargetState.EXPIRED;
    }
  }

  markHit() {
    this.state = TargetState.HIT;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

// Owns the set of currently-active targets for a session: spawning,
// per-frame updates, raycast hit-testing, and cleanup. Reused unmodified
// by every drill mode.
export class TargetManager {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.active = new Map(); // id -> Target
    this.raycaster = new THREE.Raycaster();
    // Reused per raycast so a shotgun's dozen pellets don't allocate a
    // dozen throwaway objects on every trigger pull.
    this._ndc = new THREE.Vector2();
    // Kept in sync with `active` (added in spawn(), removed in remove()) so
    // raycastHit() — called every frame in Tracking mode — never rebuilds an
    // array from the map on the hot path.
    this.meshes = [];
  }

  spawn(config) {
    const target = new Target(config, this.quality);
    this.active.set(target.id, target);
    this.meshes.push(target.mesh);
    this.scene.add(target.mesh);
    // Raycasting transforms the ray into each mesh's own space using its
    // matrixWorld, which is otherwise only refreshed by the renderer on the
    // next frame. Without this, a target raycast in the same frame it
    // spawned is tested against an identity matrix — it is effectively at
    // the origin, so the shot always misses.
    target.mesh.updateMatrixWorld();
    return target;
  }

  // Called by main.js when pointer lock is regained after a mid-session
  // pause. A target's TTL expiry is based on `now - spawnTime`; without
  // this, a finite-TTL target (e.g. Reaction mode's exposure window) would
  // instantly read as expired the moment `now` resumes advancing, since the
  // entire real-world pause duration would count as elapsed target age.
  shiftClock(deltaMs) {
    for (const target of this.active.values()) {
      target.spawnTime += deltaMs;
    }
  }

  // Advances all targets and returns any that expired this frame so the
  // drill can react (e.g. count a miss, spawn a replacement).
  update(dt, now) {
    const expired = [];
    for (const target of this.active.values()) {
      target.update(dt, now);
      if (target.state === TargetState.EXPIRED) {
        expired.push(target);
      }
    }
    for (const target of expired) {
      this.remove(target);
    }
    return expired;
  }

  // Raycasts against all currently alive target meshes. Defaults to screen
  // centre (matching the fixed DOM crosshair) — used for click-to-hit and,
  // in Tracking mode, per-frame continuous on-target checks. `ndcX`/`ndcY`
  // offset the ray for shotgun pellets, which fire in a cone around the
  // crosshair rather than straight down it.
  //
  // camera.matrixWorld is normally only refreshed inside renderer.render(),
  // but shots fire from the mousedown handler, independent of the render
  // loop — without this, every raycast would check against the previous
  // frame's camera orientation instead of the one the mouse just moved to.
  raycastHit(camera, ndcX = 0, ndcY = 0) {
    camera.updateMatrixWorld();
    this._ndc.x = ndcX;
    this._ndc.y = ndcY;
    this.raycaster.setFromCamera(this._ndc, camera);
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    if (hits.length === 0) return null;
    const hitMesh = hits[0].object;
    return this.active.get(hitMesh.userData.targetId) ?? null;
  }

  remove(target) {
    if (!this.active.has(target.id)) return;
    this.scene.remove(target.mesh);
    target.dispose();
    this.active.delete(target.id);
    const idx = this.meshes.indexOf(target.mesh);
    if (idx !== -1) this.meshes.splice(idx, 1);
  }

  clear() {
    for (const target of Array.from(this.active.values())) {
      this.remove(target);
    }
  }
}
