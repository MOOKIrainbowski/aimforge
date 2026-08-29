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

  // Return { hit: boolean } to trigger crosshair/audio feedback in main.js,
  // or leave unimplemented (undefined) for modes with no discrete "shot"
  // concept (Tracking is scored continuously; clicking does nothing there).
  handleShot(_now) {}

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
