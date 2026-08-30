// The default single ray straight down the crosshair, shared by every drill
// so the common case allocates nothing. Multi-pellet weapons pass their own
// cone in instead (see core/weaponRuntime.js's buildShotRays).
export const CENTER_RAY = Object.freeze([Object.freeze({ x: 0, y: 0 })]);

// Shared lifecycle every drill mode implements. main.js's game loop drives
// these calls; TargetManager.update() is called centrally by main.js (not
// by the drill itself), and any targets that expired that frame are handed
// to update() so modes that care (reaction, switching) can react.
export class Drill {
  constructor(config, deps) {
    this.config = config;
    this.scene = deps.scene;
    this.camera = deps.camera;
    this.targetManager = deps.targetManager;
    this.controls = deps.controls;
    this.startTime = 0;
  }

  start(now) {
    this.startTime = now;
  }

  update(_dt, _now, _expiredTargets) {}

  // `rays` is the set of screen-space (NDC) offsets this trigger pull fires
  // along — one for most weapons, a cone for shotguns.
  //
  // Return { hit: boolean, positions: THREE.Vector3[], streak?: number,
  // targetRadius?: number } to trigger crosshair/audio/particle feedback in
  // main.js. `positions` holds one entry per target destroyed by this shot
  // (captured before removal), so a single blast that clears three targets
  // produces three bursts. Leave unimplemented (undefined) for modes with no
  // discrete "shot" concept (Tracking is scored continuously; clicking does
  // nothing there).
  handleShot(_now, _rays) {}

  getLiveStats(_now) {
    return { score: 0, accuracy: 0, timeRemainingMs: 0, streak: 0 };
  }

  // main.js polls this every frame; when true it calls end(now).
  isFinished(_now) {
    return false;
  }

  // Called by main.js when pointer lock is regained after a mid-session
  // pause, shifting any stored timestamps forward by the paused duration
  // so elapsed-time math excludes the pause. Subclasses with their own
  // stored timestamps (e.g. a current target's spawn time) should override
  // this and also call super.shiftClock(deltaMs).
  shiftClock(deltaMs) {
    this.startTime += deltaMs;
  }

  end(_now) {
    throw new Error("Drill subclasses must implement end()");
  }
}

export function baseSessionResult(mode, startTime, endTime) {
  return {
    mode,
    timestamp: new Date().toISOString(),
    durationPlanned: 0,
    durationActual: endTime - startTime,
    hits: 0,
    misses: 0,
    shotsTotal: 0,
    accuracy: 0,
    score: 0,
    extra: {},
  };
}
