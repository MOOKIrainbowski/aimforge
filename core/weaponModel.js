import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Real, CC0-licensed low-poly weapon models (Quaternius, via poly.pizza) —
// generic/original designs, not replicas of any branded weapon. Resolved
// against this module's own URL (not the page's) so the same relative path
// works whether this loads from app/index.html or desktop/renderer/index.html.
const MODEL_PATHS = {
  rifle: "../vendor/models/rifle.glb",
  smg: "../vendor/models/smg.glb",
  sniper: "../vendor/models/sniper.glb",
};

// Every model swapped to this length (its longest bounding-box axis) so the
// three differently-authored, differently-scaled source files all read as a
// consistent size in view-space without hand-tuned per-model constants.
const TARGET_LENGTH = 0.44;

function normalizeModel(root) {
  root.traverse((child) => {
    // A camera-attached viewmodel casting a shadow onto the world would
    // read as a shadow appearing from empty space — suppress it.
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  root.scale.multiplyScalar(TARGET_LENGTH / maxDim);

  root.updateMatrixWorld(true);
  const centered = new THREE.Box3().setFromObject(root);
  const center = centered.getCenter(new THREE.Vector3());
  root.position.sub(center);

  return root;
}

// Loads all three weapon models in parallel. `onProgress(loaded, total)` —
// in bytes, aggregated across all three requests — lets the caller drive a
// real loading-screen progress readout instead of a simulated one.
export function loadWeaponModels(onProgress) {
  const manager = new THREE.LoadingManager();
  if (onProgress) {
    manager.onProgress = (_url, loaded, total) => onProgress(loaded, total);
  }
  const loader = new GLTFLoader(manager);

  const load = (relPath) =>
    new Promise((resolve, reject) => {
      loader.load(new URL(relPath, import.meta.url).href, (gltf) => resolve(gltf.scene), undefined, reject);
    });

  return Promise.all(Object.entries(MODEL_PATHS).map(([id, path]) => load(path).then((scene) => [id, scene]))).then(
    (entries) => {
      const models = {};
      for (const [id, scene] of entries) {
        models[id] = normalizeModel(scene);
      }
      return models;
    }
  );
}

// Fixed view-space placement (bottom-right, classic FPS viewmodel position)
// — this is a known simplification: the viewmodel renders through the same
// camera/FOV as the world rather than a separate narrower-FOV pass, so it
// may look slightly stretched at the FOV slider's extremes.
const VIEW_OFFSET = new THREE.Vector3(0.3, -0.18, -0.62);
const VIEW_ROTATION = new THREE.Euler(0, Math.PI / 2, 0);

const IDLE_SWAY_AMPLITUDE = 0.006;
const IDLE_SWAY_SPEED = 1.6;
const KICK_DURATION_MS = 120;
const KICK_OFFSET = 0.05;
const KICK_ROTATION = 0.09;

// Owns the camera-attached weapon mesh: which gun is currently shown, its
// idle sway, and the per-shot kick punch. Purely cosmetic — separate from
// core/weapon.js's RecoilTracker, which actually rotates the camera for the
// Recoil Control training mechanic.
export class Viewmodel {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.position.copy(VIEW_OFFSET);
    this.group.rotation.copy(VIEW_ROTATION);
    camera.add(this.group);

    this.currentMesh = null;
    this.elapsed = 0;
    this.kickStartedAt = null;
  }

  setWeapon(id, models) {
    if (this.currentMesh) this.group.remove(this.currentMesh);
    const source = models?.[id] ?? models?.rifle;
    if (!source) return;
    this.currentMesh = source.clone();
    this.group.add(this.currentMesh);
  }

  kick() {
    this.kickStartedAt = performance.now();
  }

  update(dt) {
    this.elapsed += dt;
    if (!this.currentMesh) return;

    this.currentMesh.position.y = Math.sin(this.elapsed * IDLE_SWAY_SPEED) * IDLE_SWAY_AMPLITUDE;

    if (this.kickStartedAt === null) return;
    const age = performance.now() - this.kickStartedAt;
    if (age >= KICK_DURATION_MS) {
      this.kickStartedAt = null;
      this.currentMesh.position.z = 0;
      this.currentMesh.rotation.x = 0;
      return;
    }
    const t = 1 - age / KICK_DURATION_MS;
    this.currentMesh.position.z = KICK_OFFSET * t;
    this.currentMesh.rotation.x = -KICK_ROTATION * t;
  }
}
