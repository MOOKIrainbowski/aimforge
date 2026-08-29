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
const TARGET_LENGTH = 0.68;

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

// Hip-fire pose: anchored toward the bottom-right corner (past the edge on
// the stock side) so it reads as held rather than floating mid-screen. Aim
// pose: pulled toward center and closer to camera, simulating raising the
// weapon to eye — triggered by the right-mouse ADS zoom in core/main.js.
// Rotation is the same in both poses (it's the mandatory correction for the
// source models' own export axis convention, not a stylistic cant, so it
// isn't something that should shift when aiming).
const HIP_OFFSET = new THREE.Vector3(0.38, -0.5, -0.62);
const AIM_OFFSET = new THREE.Vector3(0.04, -0.07, -0.3);
const VIEW_ROTATION = new THREE.Euler(0, Math.PI / 2, 0);
const AIM_SCALE_MULT = 1.5;
const POSE_LERP_SEC = 0.15;

const IDLE_SWAY_AMPLITUDE = 0.006;
const IDLE_SWAY_SPEED = 1.6;
const KICK_DURATION_MS = 120;
const KICK_OFFSET = 0.05;
const KICK_ROTATION = 0.09;

// Owns the camera-attached weapon mesh: which gun is currently shown, its
// idle sway, the per-shot kick punch, and the hip/aim pose blend. Purely
// cosmetic — separate from core/weapon.js's RecoilTracker, which actually
// rotates the camera for the Recoil Control training mechanic.
export class Viewmodel {
  constructor(camera) {
    this.group = new THREE.Group();
    this.group.position.copy(HIP_OFFSET);
    this.group.rotation.copy(VIEW_ROTATION);
    camera.add(this.group);

    // A light that travels with the weapon so it's always lit consistently
    // regardless of which way the camera is facing. The range's own lights
    // are aimed at the range, not at the player's face, and the models'
    // materials are quite dark by design — without this the gun reads as a
    // flat black silhouette instead of showing its real wood/metal tones.
    // Low intensity + short range so it has negligible effect on the range
    // itself, which is much farther away.
    const fillLight = new THREE.PointLight(0xfff2e0, 1.2, 2.5, 2);
    fillLight.position.set(0, 0.2, 0.35);
    this.group.add(fillLight);

    this.currentMesh = null;
    this.baseScale = 1;
    this.elapsed = 0;
    this.kickStartedAt = null;
    this.aimed = false;
    this.aimT = 0; // 0 = hip, 1 = fully aimed; eased toward `aimed` each frame
  }

  setWeapon(id, models) {
    if (this.currentMesh) this.group.remove(this.currentMesh);
    const source = models?.[id] ?? models?.rifle;
    if (!source) return;
    this.currentMesh = source.clone();
    this.baseScale = this.currentMesh.scale.x;
    this.group.add(this.currentMesh);
  }

  setAimed(aimed) {
    this.aimed = aimed;
  }

  kick() {
    this.kickStartedAt = performance.now();
  }

  update(dt) {
    this.elapsed += dt;

    const target = this.aimed ? 1 : 0;
    const step = POSE_LERP_SEC > 0 ? dt / POSE_LERP_SEC : 1;
    const diff = target - this.aimT;
    this.aimT += Math.sign(diff) * Math.min(Math.abs(diff), step);

    this.group.position.lerpVectors(HIP_OFFSET, AIM_OFFSET, this.aimT);

    if (!this.currentMesh) return;

    this.currentMesh.scale.setScalar(this.baseScale * (1 + (AIM_SCALE_MULT - 1) * this.aimT));
    // Sway settles down as the weapon comes up to a steadier aimed hold.
    this.currentMesh.position.y =
      Math.sin(this.elapsed * IDLE_SWAY_SPEED) * IDLE_SWAY_AMPLITUDE * (1 - this.aimT * 0.7);

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
