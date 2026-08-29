import * as THREE from "three";

const HALF_PI = Math.PI / 2;
const PITCH_EPSILON = 0.001;

// Custom pointer-lock + movement controller. We don't use Three.js's
// example PointerLockControls because it hard-codes mouse sensitivity with
// no exposed multiplier — sensitivity needs to be a live, persisted setting
// here (menu slider + the sensitivity converter in a later milestone).
export class PointerLockCameraControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;

    this.sensitivity = options.sensitivity ?? 0.0022; // radians per pixel
    this.acceleration = options.acceleration ?? 60; // units/s^2
    this.friction = options.friction ?? 10; // 1/s decay, higher = brakes faster
    this.maxSpeed = options.maxSpeed ?? 4.2; // units/s (walk)
    this.sprintMultiplier = options.sprintMultiplier ?? 1.6;

    this.roomBounds = options.roomBounds ?? null;

    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector2(0, 0); // x/z plane
    this.keys = new Set();
    // Reused across every mousemove so a high-poll-rate mouse doesn't
    // allocate a new Euler per event.
    this._euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.locked = false;
    this.onLockChange = options.onLockChange ?? (() => {});

    this._onMouseMove = this._onMouseMove.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
  }

  connect() {
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("keydown", this._onKeyDown);
    document.addEventListener("keyup", this._onKeyUp);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
  }

  dispose() {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("keyup", this._onKeyUp);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
  }

  requestLock() {
    this.domElement.requestPointerLock();
  }

  setRoomGeometry({ roomBounds }) {
    this.roomBounds = roomBounds;
  }

  _onPointerLockChange() {
    this.locked = document.pointerLockElement === this.domElement;
    if (!this.locked) {
      this.keys.clear();
    }
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

  _onKeyDown(e) {
    if (!this.locked) return;
    this.keys.add(e.code);
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  update(dt) {
    if (!this.locked) return;

    let moveForward = 0; // +1 = toward camera-forward
    let moveRight = 0; // +1 = toward camera-right
    if (this.keys.has("KeyW")) moveForward += 1;
    if (this.keys.has("KeyS")) moveForward -= 1;
    if (this.keys.has("KeyD")) moveRight += 1;
    if (this.keys.has("KeyA")) moveRight -= 1;

    const hasInput = moveForward !== 0 || moveRight !== 0;
    const sprinting = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const speedCap = this.maxSpeed * (sprinting ? this.sprintMultiplier : 1);

    if (hasInput) {
      const len = Math.hypot(moveForward, moveRight);
      const nf = moveForward / len;
      const nr = moveRight / len;
      // Camera-local forward is -Z and right is +X; rotate both by yaw
      // (Ry) so "forward" always means "the way the camera is looking".
      const forwardX = -Math.sin(this.yaw);
      const forwardZ = -Math.cos(this.yaw);
      const rightX = Math.cos(this.yaw);
      const rightZ = -Math.sin(this.yaw);
      const worldX = nf * forwardX + nr * rightX;
      const worldZ = nf * forwardZ + nr * rightZ;
      this.velocity.x += worldX * this.acceleration * dt;
      this.velocity.y += worldZ * this.acceleration * dt;

      const speed = this.velocity.length();
      if (speed > speedCap) {
        this.velocity.multiplyScalar(speedCap / speed);
      }
    } else {
      // No input: decelerate toward zero — this is the "braking" behavior
      // used for peek-and-stop practice.
      const speed = this.velocity.length();
      const drop = this.friction * dt;
      const newSpeed = Math.max(0, speed - drop);
      if (speed > 0) {
        this.velocity.multiplyScalar(newSpeed / speed);
      }
    }

    if (this.velocity.lengthSq() > 0) {
      const nextX = this.camera.position.x + this.velocity.x * dt;
      const nextZ = this.camera.position.z + this.velocity.y * dt;
      const resolved = this._resolveCollision(nextX, nextZ);
      this.camera.position.x = resolved.x;
      this.camera.position.z = resolved.z;
    }
  }

  _resolveCollision(x, z) {
    if (this.roomBounds) {
      const b = this.roomBounds;
      x = Math.max(b.minX, Math.min(b.maxX, x));
      z = Math.max(b.minZ, Math.min(b.maxZ, z));
    }
    return { x, z };
  }
}
