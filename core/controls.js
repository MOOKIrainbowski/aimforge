import * as THREE from "three";

const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;
const PITCH_EPSILON = 0.001;

// Pointer-lock `movementX/Y` is not always trustworthy: Chromium can emit a
// single event carrying an implausible jump (a few thousand pixels) when the
// OS re-centers the hidden cursor, when the window regains focus, or when a
// high-DPI mouse's raw packets get mis-scaled. One such event mid-swing reads
// exactly like the "screen stutters when I whip the view around" report — the
// camera lurches a frame's worth of extra rotation and snaps back. No real
// hand moves this far inside one input sample at any poll rate, so anything
// past this is dropped rather than rotated through.
const MAX_SAMPLE_PX = 900;

// Custom pointer-lock look controller. We don't use Three.js's example
// PointerLockControls because it hard-codes mouse sensitivity with no
// exposed multiplier — sensitivity needs to be a live, persisted setting
// here (menu slider + the sensitivity converter). The camera is fixed at
// its spawn position: this is a stationary aim range, not a walkable one,
// so there's no movement/collision to handle — just mouse-look.
//
// Input is *sampled* on every pointer event but only *applied* once per
// rendered frame (update(), driven by main.js's rAF loop) or on demand
// (flush(), before a shot resolves). Rotating the camera inside the event
// handler instead — as this used to — makes each frame consume whatever
// arbitrary slice of input the browser happened to deliver before it, so a
// fast swing renders as uneven angular steps: judder that gets more visible
// the wider the FOV, since the same rotation sweeps more of the world past
// the screen. Accumulating and applying on the frame clock gives every frame
// exactly the input that accrued since the previous one.
export class PointerLockCameraControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;

    this.sensitivity = options.sensitivity ?? 0.0022; // radians per pixel

    this.yaw = 0;
    this.pitch = 0;
    // Pixels of un-applied mouse travel, drained by flush().
    this._pendingX = 0;
    this._pendingY = 0;
    // Reused across every sample so a high-poll-rate mouse doesn't allocate
    // a new Euler per event.
    this._euler = new THREE.Euler(0, 0, 0, "YXZ");
    this.locked = false;
    this.onLockChange = options.onLockChange ?? (() => {});

    // `pointerrawupdate` delivers un-coalesced, un-throttled samples where
    // it exists (Chromium); `mousemove` is the portable fallback. Only one
    // is ever bound, so movement is never counted twice.
    this._rawEvent = typeof window !== "undefined" && "onpointerrawupdate" in window ? "pointerrawupdate" : "mousemove";

    this._onMove = this._onMove.bind(this);
    this._onPointerLockChange = this._onPointerLockChange.bind(this);
  }

  connect() {
    document.addEventListener(this._rawEvent, this._onMove);
    document.addEventListener("pointerlockchange", this._onPointerLockChange);
  }

  dispose() {
    document.removeEventListener(this._rawEvent, this._onMove);
    document.removeEventListener("pointerlockchange", this._onPointerLockChange);
  }

  requestLock() {
    this.domElement.requestPointerLock();
  }

  _onPointerLockChange() {
    this.locked = document.pointerLockElement === this.domElement;
    // Whatever arrived during the transition belongs to a different aim
    // context (menu cursor, a pause) — starting fresh avoids a lurch on the
    // first frame back under lock.
    this._pendingX = 0;
    this._pendingY = 0;
    this.onLockChange(this.locked);
  }

  _sample(movementX, movementY) {
    if (Math.abs(movementX) > MAX_SAMPLE_PX || Math.abs(movementY) > MAX_SAMPLE_PX) return;
    this._pendingX += movementX;
    this._pendingY += movementY;
  }

  _onMove(e) {
    if (!this.locked) return;
    // A coalesced pointer event hides the individual samples that produced
    // it; reading them back keeps the per-sample spike guard meaningful
    // instead of letting one bad packet poison a whole frame's movement.
    const coalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (coalesced && coalesced.length > 0) {
      for (const sample of coalesced) this._sample(sample.movementX, sample.movementY);
    } else {
      this._sample(e.movementX, e.movementY);
    }
  }

  // Applies everything sampled since the last call. Called once per frame by
  // update(), and directly by main.js immediately before a shot resolves so
  // the raycast tests against the aim the player actually has right now
  // rather than the previous frame's — deferring input must not cost the
  // trainer any click accuracy.
  flush() {
    if (this._pendingX === 0 && this._pendingY === 0) return;

    this.yaw -= this._pendingX * this.sensitivity;
    this.pitch -= this._pendingY * this.sensitivity;
    this._pendingX = 0;
    this._pendingY = 0;

    // Yaw is unbounded otherwise: a long session of same-direction flicks
    // walks it far enough that the trig below loses precision.
    if (this.yaw > Math.PI || this.yaw < -Math.PI) {
      this.yaw -= TWO_PI * Math.round(this.yaw / TWO_PI);
    }
    this.pitch = Math.max(-HALF_PI + PITCH_EPSILON, Math.min(HALF_PI - PITCH_EPSILON, this.pitch));

    this._euler.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(this._euler);
  }

  update(_dt) {
    this.flush();
  }
}
