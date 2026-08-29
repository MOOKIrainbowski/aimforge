import * as THREE from "three";

const HALF_PI = Math.PI / 2;
const PITCH_EPSILON = 0.001;

// Custom pointer-lock look controller. We don't use Three.js's example
// PointerLockControls because it hard-codes mouse sensitivity with no
// exposed multiplier — sensitivity needs to be a live, persisted setting
// here (menu slider + the sensitivity converter). The camera is fixed at
// its spawn position: this is a stationary aim range, not a walkable one,
// so there's no movement/collision to handle — just mouse-look.
export class PointerLockCameraControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;

    this.sensitivity = options.sensitivity ?? 0.0022; // radians per pixel

    this.yaw = 0;
    this.pitch = 0;
    // Reused across every mousemove so a high-poll-rate mouse doesn't
    // allocate a new Euler per event.
    this._euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.locked = false;
    this.onLockChange = options.onLockChange ?? (() => {});

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
  }

  connect() {
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
  }

  dispose() {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
  }

  requestLock() {
    this.domElement.requestPointerLock();
  }

  _onPointerLockChange() {
    this.locked = document.pointerLockElement === this.domElement;
    this.onLockChange(this.locked);
  }

  _onMouseMove(e) {
    if (!this.locked) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch -= e.movementY * this.sensitivity;
    this.pitch = Math.max(-HALF_PI + PITCH_EPSILON, Math.min(HALF_PI - PITCH_EPSILON, this.pitch));
    this._euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this._euler);
  }

  // No-op: kept so main.js's per-frame `controls.update(dt)` call doesn't
  // need a special case now that there's no movement to integrate.
  update(_dt) {}
}
