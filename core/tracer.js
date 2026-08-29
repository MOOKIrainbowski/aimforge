import * as THREE from "three";

// A brief glowing beam from the gun to wherever the shot landed — thin
// additive-blended cylinder, no image asset, same "cheap procedural VFX"
// approach as core/particles.js. Depth-tested normally (not depthTest:
// false), so a miss shot aimed at a wall/floor visually truncates right at
// that surface for free, without this module needing to know the range's
// geometry or do its own raycast.
const TRACER_LIFETIME_MS = 90;
const TRACER_RADIUS = 0.01;
const FALLBACK_COLOR = 0xfff2b0;

const UP = new THREE.Vector3(0, 1, 0);
const active = [];

function buildMaterial(color) {
  return new THREE.MeshBasicMaterial({
    color: color ?? FALLBACK_COLOR,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

export function spawnTracer(scene, start, end, color) {
  const offset = new THREE.Vector3().subVectors(end, start);
  const length = offset.length();
  if (length < 0.01) return;

  const geometry = new THREE.CylinderGeometry(TRACER_RADIUS, TRACER_RADIUS, length, 6, 1, true);
  geometry.translate(0, length / 2, 0); // extends from the origin along +Y before orienting below
  const mesh = new THREE.Mesh(geometry, buildMaterial(color));
  mesh.position.copy(start);
  mesh.quaternion.setFromUnitVectors(UP, offset.normalize());
  scene.add(mesh);

  active.push({ mesh, geometry, material: mesh.material, spawnedAt: performance.now() });
}

export function updateTracers() {
  if (active.length === 0) return;
  const now = performance.now();

  for (let i = active.length - 1; i >= 0; i--) {
    const t = active[i];
    const age = now - t.spawnedAt;
    if (age >= TRACER_LIFETIME_MS) {
      t.mesh.parent?.remove(t.mesh);
      t.geometry.dispose();
      t.material.dispose();
      active.splice(i, 1);
      continue;
    }
    t.material.opacity = 0.9 * (1 - age / TRACER_LIFETIME_MS);
  }
}
