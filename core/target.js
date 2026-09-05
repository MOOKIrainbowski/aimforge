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
  const angularRadiusDeg = THREE.MathUtils.radToDeg(Math.atan(target.aimRadius / Math.max(distance, 0.01)));
  const safeRadius = Math.max(angularRadiusDeg, 0.01);
  return { x: -yawDeg / safeRadius, y: -pitchDeg / safeRadius };
}

// A humanoid target's three hit zones. Arms belong to the torso rather than
// being their own zone: they sit in front of it from the shooter's side, and
// a separate "arm" result would mostly report which way the model happened
// to be standing.
export const TargetPart = Object.freeze({
  HEAD: "head",
  TORSO: "torso",
  LEGS: "legs",
});

// Humanoid proportions, as fractions of the figure's total height, measured
// from the feet. They are a real body's ratios rather than invented ones, so
// the head stays the small, deliberate target it is meant to be — roughly a
// seventh of the height and a fifth of the width.
const HUMAN = {
  heightPerRadius: 4.8, // 1.68m at the default 0.35 radius: a person's height
  head: { r: 0.075, y: 0.935 },
  torso: { w: 0.28, h: 0.3, d: 0.15, y: 0.72 },
  arm: { w: 0.065, h: 0.3, x: 0.185 },
  leg: { w: 0.085, h: 0.53, d: 0.14, x: 0.087, y: 0.285 },
};

// Drills place a target by a single point, and every consumer — spawn
// spacing, kill bursts, the flick-offset maths — treats that point as the
// thing being aimed at. So the figure hangs from its torso centre rather
// than standing on its feet: the point a drill spawns is centre mass, which
// is both what a shooter aims at and where a body's mass actually is.
const ORIGIN_Y = HUMAN.torso.y;

// The zones are shaded apart rather than coloured differently: the target
// colour is the player's own setting, and three unrelated hues would throw
// away a contrast choice they made deliberately.
//
// The emissive term is not decoration. The range is lit from above by a
// hemisphere light and one overhead key (core/scene.js), which a sphere
// catches across its whole curve — a figure is flat vertical faces, and
// without this it turns into a dark silhouette at exactly the colour the
// player chose for visibility. Emitting a fraction of its own colour gives
// every face the same reading regardless of which way it points.
function zoneMaterial(color, lightnessShift, quality) {
  const shade = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  shade.getHSL(hsl);
  shade.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + lightnessShift, 0.06, 0.94));
  return new THREE.MeshStandardMaterial({
    color: shade,
    emissive: shade,
    emissiveIntensity: 0.5,
    roughness: 0.55,
    metalness: 0.05,
    envMapIntensity: quality.envMap ? 1 : 0,
  });
}

function buildHumanFigure(radius, color, quality) {
  const h = radius * HUMAN.heightPerRadius;
  const group = new THREE.Group();
  const materials = {
    [TargetPart.HEAD]: zoneMaterial(color, 0.2, quality),
    [TargetPart.TORSO]: zoneMaterial(color, 0, quality),
    [TargetPart.LEGS]: zoneMaterial(color, -0.18, quality),
  };

  const add = (part, geometry, x, y) => {
    const mesh = new THREE.Mesh(geometry, materials[part]);
    mesh.position.set(x, y - ORIGIN_Y * h, 0);
    mesh.userData.part = part;
    mesh.castShadow = quality.shadows;
    group.add(mesh);
  };

  const segments = Math.max(8, quality.targetSegments);
  add(TargetPart.HEAD, new THREE.SphereGeometry(HUMAN.head.r * h, segments, segments / 2), 0, HUMAN.head.y * h);
  add(
    TargetPart.TORSO,
    new THREE.BoxGeometry(HUMAN.torso.w * h, HUMAN.torso.h * h, HUMAN.torso.d * h),
    0,
    HUMAN.torso.y * h
  );
  for (const side of [-1, 1]) {
    add(
      TargetPart.TORSO,
      new THREE.BoxGeometry(HUMAN.arm.w * h, HUMAN.arm.h * h, HUMAN.arm.w * h),
      side * HUMAN.arm.x * h,
      HUMAN.torso.y * h
    );
    add(
      TargetPart.LEGS,
      new THREE.BoxGeometry(HUMAN.leg.w * h, HUMAN.leg.h * h, HUMAN.leg.d * h),
      side * HUMAN.leg.x * h,
      HUMAN.leg.y * h
    );
  }

  return group;
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
    this.shape = config.shape === "human" ? "human" : "sphere";
    // Which zone the most recent ray struck, or null on a sphere, which has
    // no zones. Set by TargetManager.raycastHit() so drills can ask what a
    // shot hit without every caller having to thread a second return value
    // through — a shot is resolved and read in the same breath.
    this.lastHitPart = null;

    this.spawnTime = config.now;
    this.state = TargetState.ALIVE;
    this.basePosition = config.position.clone();

    if (this.shape === "human") {
      this.mesh = buildHumanFigure(this.radius, this.color, quality);
      // Half the torso's width: the narrowest thing a shooter is actually
      // aiming at, and so the right yardstick for the hit-position heatmap.
      // The sphere's radius would flatter every shot on a figure this tall.
      this.aimRadius = (HUMAN.torso.w * this.radius * HUMAN.heightPerRadius) / 2;
      for (const part of this.mesh.children) part.userData.targetId = this.id;
    } else {
      const geometry = new THREE.SphereGeometry(this.radius, quality.targetSegments, quality.targetSegments / 2);
      const material = new THREE.MeshStandardMaterial({
        color: this.color,
        roughness: 0.3,
        metalness: 0.15,
        envMapIntensity: quality.envMap ? 1 : 0,
      });
      this.mesh = new THREE.Mesh(geometry, material);
      this.aimRadius = this.radius;
      this.mesh.castShadow = quality.shadows;
    }

    this.mesh.position.copy(this.basePosition);
    this.mesh.userData.targetId = this.id;
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
    // A figure's zones share three materials between eight meshes, so
    // materials are collected before being disposed rather than disposed
    // per mesh.
    const materials = new Set();
    this.mesh.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      materials.add(node.material);
    });
    for (const material of materials) material.dispose();
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
    // Recursive: a humanoid target is a group of zone meshes rather than one
    // mesh, and the zone that was struck is the whole point of hitting it.
    const hits = this.raycaster.intersectObjects(this.meshes, true);
    if (hits.length === 0) return null;
    const hitMesh = hits[0].object;
    const target = this.active.get(hitMesh.userData.targetId) ?? null;
    if (target) target.lastHitPart = hitMesh.userData.part ?? null;
    return target;
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
