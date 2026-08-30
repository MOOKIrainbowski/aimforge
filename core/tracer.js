import * as THREE from "three";

// A brief glowing beam from the gun to wherever the shot landed. Two thin
// concentric cylinders, no image asset, same "cheap procedural VFX" approach
// as core/particles.js:
//   - an opaque, normally-blended core so the beam stays clearly visible
//     against the range's bright near-white walls/floor (pure additive
//     blending washes out completely over light backgrounds);
//   - a wider additive-blended glow sleeve that only really shows up against
//     darker surfaces, giving the beam some punch on the dark desktop range
//     and the ADS scope vignette without affecting the light range.
// Both are depth-tested normally (not depthTest: false), so a miss shot
// aimed at a wall/floor visually truncates right at that surface for free,
// without this module needing to know the range's geometry or raycast.
const TRACER_LIFETIME_MS = 130;
const CORE_RADIUS = 0.012;
const GLOW_RADIUS = 0.035;
const CORE_OPACITY = 0.95;
const GLOW_OPACITY = 0.55;
const FALLBACK_COLOR = 0xfff2b0;

const UP = new THREE.Vector3(0, 1, 0);
const active = [];

// The core reads as a hot near-white filament tinted toward the shot color;
// the glow carries the full color. Keeps a colored tracer legible even when
// the player picked a dark crosshair color against a dark surface.
function coreColor(color) {
  return new THREE.Color(color ?? FALLBACK_COLOR).lerp(new THREE.Color(0xffffff), 0.6);
}

function buildCylinder(radius, length, material) {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 6, 1, true);
  geometry.translate(0, length / 2, 0); // extends from the origin along +Y before orienting in spawnTracer
  return new THREE.Mesh(geometry, material);
}

export function spawnTracer(scene, start, end, color) {
  const offset = new THREE.Vector3().subVectors(end, start);
  const length = offset.length();
  if (length < 0.01) return;

  const orientation = new THREE.Quaternion().setFromUnitVectors(UP, offset.normalize());

  const coreMat = new THREE.MeshBasicMaterial({
    color: coreColor(color),
    transparent: true,
    opacity: CORE_OPACITY,
    depthWrite: false,
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: color ?? FALLBACK_COLOR,
    transparent: true,
    opacity: GLOW_OPACITY,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const group = new THREE.Group();
  group.position.copy(start);
  group.quaternion.copy(orientation);
  group.add(buildCylinder(GLOW_RADIUS, length, glowMat));
  group.add(buildCylinder(CORE_RADIUS, length, coreMat));
  scene.add(group);

  active.push({ group, coreMat, glowMat, spawnedAt: performance.now() });
}

export function updateTracers() {
  if (active.length === 0) return;
  const now = performance.now();

  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    const age = now - t.spawnedAt;
    if (age >= TRACER_LIFETIME_MS) {
      t.group.parent?.remove(t.group);
      t.group.children.forEach((child) => child.geometry.dispose());
      t.coreMat.dispose();
      t.glowMat.dispose();
      active.splice(i, 1);
      continue;
    }
    const fade = 1 - age / TRACER_LIFETIME_MS;
    t.coreMat.opacity = CORE_OPACITY * fade;
    t.glowMat.opacity = GLOW_OPACITY * fade;
  }
}
