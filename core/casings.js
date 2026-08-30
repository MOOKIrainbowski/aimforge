import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Spent brass thrown clear of the ejection port on every shot, using the
// same glTF pipeline as the weapons (vendor/models/casing.glb - "Bullet" by
// Poly by Google, CC-BY). Casings live in world space rather than on the
// camera, so they arc away, tumble, hit the floor and stay where they land
// instead of following the player's view around.
//
// Deliberately cheap: no collision beyond a floor plane, no bounce physics
// past a single damped rebound, and a hard cap on how many exist at once.
const CASING_LENGTH = 0.085; // world units ~= metres; a rifle case is ~7cm
const GRAVITY = -11.5;
const LIFETIME_MS = 2600;
const FADE_MS = 500;
const MAX_LIVE = 40;
const FLOOR_Y = 0.012;
const RESTITUTION = 0.34;

let template = null;
let templatePromise = null;
const active = [];

// Loaded once, lazily, and shared: every casing is a clone of this. Failure
// is non-fatal - shooting still works, there's just no brass.
export function loadCasingModel() {
  if (templatePromise) return templatePromise;
  const loader = new GLTFLoader();
  const url = new URL("../vendor/models/casing.glb", import.meta.url).href;
  templatePromise = loader
    .loadAsync(url)
    .then((gltf) => {
      const root = gltf.scene;
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      root.scale.multiplyScalar(CASING_LENGTH / (Math.max(size.x, size.y, size.z) || 1));
      root.updateMatrixWorld(true);
      const centered = new THREE.Box3().setFromObject(root);
      root.position.sub(centered.getCenter(new THREE.Vector3()));

      root.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = false;
        child.receiveShadow = false;
        // The source material is a flat diffuse brown; a little metalness
        // and low roughness make it read as brass catching the range light.
        child.material = new THREE.MeshStandardMaterial({
          color: 0xc9922f,
          roughness: 0.34,
          metalness: 0.85,
        });
      });
      template = root;
      return root;
    })
    .catch((err) => {
      console.warn("AimonSite: could not load casing model", err);
      return null;
    });
  return templatePromise;
}

function disposeCasing(c) {
  c.mesh.parent?.remove(c.mesh);
  c.mesh.traverse((child) => {
    if (child.isMesh) child.material.dispose();
  });
}

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _forward = new THREE.Vector3();

// Ejects one casing from `position`, thrown to the shooter's right and up
// relative to `camera`'s current orientation, so it always flies away from
// the weapon regardless of which way the player is facing.
export function ejectCasing(scene, camera, position) {
  if (!template || !position) return;

  if (active.length >= MAX_LIVE) {
    disposeCasing(active.shift());
  }

  camera.matrixWorld.extractBasis(_right, _up, _forward);

  const mesh = template.clone();
  // Object3D.clone() shares material references, but each casing fades on
  // its own schedule - without a private material every casing on screen
  // would fade together as soon as the first one aged out.
  mesh.traverse((child) => {
    if (child.isMesh) child.material = child.material.clone();
  });
  mesh.position.copy(position);
  mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
  scene.add(mesh);

  const velocity = new THREE.Vector3()
    .addScaledVector(_right, 1.5 + Math.random() * 0.9)
    .addScaledVector(_up, 1.5 + Math.random() * 0.7)
    // `_forward` is the camera's +Z, i.e. behind the player, so a small
    // positive term throws the brass slightly back past the shoulder.
    .addScaledVector(_forward, 0.25 + Math.random() * 0.35);

  active.push({
    mesh,
    velocity,
    spin: new THREE.Vector3(
      (Math.random() - 0.5) * 22,
      (Math.random() - 0.5) * 22,
      (Math.random() - 0.5) * 22
    ),
    bornAt: performance.now(),
    settled: false,
  });
}

export function updateCasings(dt) {
  if (active.length === 0) return;
  const now = performance.now();

  for (let i = active.length - 1; i >= 0; i--) {
    const c = active[i];
    const age = now - c.bornAt;
    if (age >= LIFETIME_MS) {
      disposeCasing(c);
      active.splice(i, 1);
      continue;
    }

    if (!c.settled) {
      c.velocity.y += GRAVITY * dt;
      c.mesh.position.addScaledVector(c.velocity, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;

      if (c.mesh.position.y <= FLOOR_Y && c.velocity.y < 0) {
        c.mesh.position.y = FLOOR_Y;
        c.velocity.y *= -RESTITUTION;
        c.velocity.x *= 0.55;
        c.velocity.z *= 0.55;
        c.spin.multiplyScalar(0.4);
        // Below this the rebound is imperceptible and only costs frames.
        if (c.velocity.y < 0.45) {
          c.settled = true;
          c.velocity.set(0, 0, 0);
          c.mesh.rotation.x = Math.PI / 2;
        }
      }
    }

    // Fade out at the end of the lifetime instead of vanishing mid-view.
    const remaining = LIFETIME_MS - age;
    if (remaining < FADE_MS) {
      const opacity = remaining / FADE_MS;
      c.mesh.traverse((child) => {
        if (!child.isMesh) return;
        child.material.transparent = true;
        child.material.opacity = opacity;
      });
    }
  }
}

// Called when a session ends or the range is cleared.
export function clearCasings() {
  for (const c of active) disposeCasing(c);
  active.length = 0;
}
