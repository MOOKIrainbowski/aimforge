import * as THREE from "three";
import { getQuality } from "./quality.js";
import { createRenderer, createCamera, applyFov, buildRange, applyRangeAppearance, applyEnvironment } from "./scene.js";
import { PointerLockCameraControls } from "./controls.js";
import { TargetManager } from "./target.js";
import { GridshotDrill } from "./drills/gridshot.js";
import { TrackingDrill } from "./drills/tracking.js";
import { SwitchingDrill } from "./drills/switching.js";
import { ReactionDrill } from "./drills/reaction.js";
import { showHud, hideHud, updateHud } from "./ui/hud.js";
import { showSummary, hideSummary } from "./ui/summary.js";
import { initHome, showHome, hideHome } from "./ui/home.js";
import { initHistory, showHistory, hideHistory } from "./ui/history.js";
import { initCrosshairEditor, showCrosshairEditor, hideCrosshairEditor } from "./ui/crosshairEditor.js";
import { loadCrosshairConfig, renderCrosshairInto } from "./crosshairConfig.js";
import { initSensitivityCalculator, showSensitivityCalculator, hideSensitivityCalculator } from "./ui/sensitivityCalculator.js";
import { initSettingsPanel, showSettingsPanel, hideSettingsPanel } from "./ui/settingsPanel.js";
import { loadSettings } from "./settings.js";
import { loadRangeConfig } from "./rangeConfig.js";
import { saveSession, getSessionsByMode } from "./stats.js";
import { generateCoachTips } from "./coach.js";
import { setSoundEnabled, playHitSound, playMissSound, flashCrosshair } from "./ui/feedback.js";
import { applyTranslations } from "./i18n.js";

applyTranslations(document);

const quality = getQuality();

const canvas = document.getElementById("scene");
const crosshair = document.getElementById("crosshair");
const lockHint = document.getElementById("lock-hint");
const pauseScreen = document.getElementById("pause-screen");

let rangeConfig = loadRangeConfig();
document.documentElement.dataset.theme = rangeConfig.theme;
setSoundEnabled(rangeConfig.soundEnabled);

const renderer = createRenderer(canvas, quality);
const camera = createCamera(rangeConfig.fov);
const scene = new THREE.Scene();
const sceneRefs = buildRange(scene, quality, rangeConfig);
const { roomBounds } = sceneRefs;
const targetManager = new TargetManager(scene, quality);
applyEnvironment(renderer, scene, quality);

// Desktop-quality post-processing (bloom + filmic output) — dynamically
// imported so the web build never fetches these modules. Top-level await is
// safe here: both builds load this file as a native ES module.
let composer = null;
if (quality.postProcessing) {
  const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
    import("three/addons/postprocessing/EffectComposer.js"),
    import("three/addons/postprocessing/RenderPass.js"),
    import("three/addons/postprocessing/UnrealBloomPass.js"),
    import("three/addons/postprocessing/OutputPass.js"),
  ]);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.35, 0.4, 0.85));
  composer.addPass(new OutputPass());
}

// `?duration=<ms>` overrides whatever duration the home screen selected —
// used for fast dev/test iteration instead of waiting out a real session.
const durationOverride = Number(new URLSearchParams(window.location.search).get("duration"));


// appState is the MENU -> PLAYING -> SUMMARY state machine (HISTORY is a
// side-branch reachable from MENU or SUMMARY, always returning to MENU).
// `drill` is only ever non-null while appState === "PLAYING" (and
// pauseStartedAt tracks a mid-session pointer-lock loss within that state).
let appState = "MENU";
let drill = null;
let pauseStartedAt = null;
let lastConfig = null;

const persistedSettings = loadSettings();
const controls = new PointerLockCameraControls(camera, canvas, {
  roomBounds,
  onLockChange: handleLockChange,
  sensitivity: persistedSettings.sensitivity,
});
controls.connect();

// Dev-only inspection hook, opt-in via `?debug=1` — lets test/dev tooling
// read live camera/target/control state without exposing it by default.
if (new URLSearchParams(window.location.search).has("debug")) {
  window.__aimforgeDebug = {
    camera,
    controls,
    targetManager,
    get drill() {
      return drill;
    },
  };
}

function createDrill(config, deps) {
  switch (config.mode) {
    case "tracking":
      return new TrackingDrill(config, deps);
    case "switching":
      return new SwitchingDrill(config, deps);
    case "reaction":
      return new ReactionDrill(config, deps);
    case "gridshot":
    default:
      return new GridshotDrill(config, deps);
  }
}

function beginSession(config) {
  lastConfig = {
    ...config,
    durationMs: durationOverride > 0 ? durationOverride : config.durationMs,
    targetColor: rangeConfig.targetColor,
  };
  appState = "PLAYING";
  hideHome();
  controls.requestLock();
}

function startSession(now) {
  targetManager.clear();
  drill = createDrill(lastConfig, { scene, camera, targetManager, controls });
  drill.start(now);
  showHud();
}

function returnToMenu() {
  appState = "MENU";
  drill = null;
  pauseStartedAt = null;
  targetManager.clear();
  hideHud();
  hideSummary();
  hidePauseScreen();
  showHome();
  if (controls.locked) document.exitPointerLock();
}

function showPauseScreen() {
  pauseScreen.classList.remove("hidden");
}

function hidePauseScreen() {
  pauseScreen.classList.add("hidden");
}

document.getElementById("pause-resume").addEventListener("click", () => {
  if (appState === "PLAYING") controls.requestLock();
});
document.getElementById("pause-quit").addEventListener("click", () => {
  returnToMenu();
});

initHome(beginSession);
initHistory();
renderCrosshairInto(crosshair, loadCrosshairConfig());
initCrosshairEditor((newConfig) => renderCrosshairInto(crosshair, newConfig));

function openHistory() {
  appState = "HISTORY";
  hideHome();
  hideSummary();
  showHistory();
}

document.getElementById("home-history").addEventListener("click", openHistory);
document.getElementById("summary-history").addEventListener("click", openHistory);
document.getElementById("history-back").addEventListener("click", () => {
  hideHistory();
  returnToMenu();
});

document.getElementById("home-crosshair").addEventListener("click", () => {
  appState = "CROSSHAIR";
  hideHome();
  showCrosshairEditor();
});
document.getElementById("crosshair-back").addEventListener("click", () => {
  hideCrosshairEditor();
  returnToMenu();
});

initSensitivityCalculator((newSettings) => {
  controls.sensitivity = newSettings.sensitivity;
});
document.getElementById("home-sensitivity").addEventListener("click", () => {
  appState = "SENSITIVITY";
  hideHome();
  showSensitivityCalculator();
});
document.getElementById("sensitivity-back").addEventListener("click", () => {
  hideSensitivityCalculator();
  returnToMenu();
});

initSettingsPanel((newConfig) => {
  rangeConfig = newConfig;
  document.documentElement.dataset.theme = newConfig.theme;
  setSoundEnabled(newConfig.soundEnabled);
  applyRangeAppearance(sceneRefs, newConfig);
  applyFov(camera, newConfig.fov);
});
document.getElementById("home-settings-btn").addEventListener("click", () => {
  appState = "SETTINGS";
  hideHome();
  showSettingsPanel();
});
document.getElementById("settings-back").addEventListener("click", () => {
  hideSettingsPanel();
  returnToMenu();
});

function handleLockChange(locked) {
  crosshair.classList.toggle("hidden", !locked);
  // The click-to-start hint only applies before a drill's first lock; once
  // a drill is running, a lost lock shows the pause overlay instead.
  lockHint.classList.toggle("hidden", locked || appState !== "PLAYING" || Boolean(drill));

  if (locked) {
    hidePauseScreen();
    if (drill && pauseStartedAt !== null) {
      const pausedDuration = performance.now() - pauseStartedAt;
      drill.shiftClock(pausedDuration);
      targetManager.shiftClock(pausedDuration);
      pauseStartedAt = null;
    } else if (appState === "PLAYING" && !drill) {
      startSession(performance.now());
    }
  } else if (appState === "PLAYING" && drill) {
    pauseStartedAt = performance.now();
    showPauseScreen();
  }
}

canvas.addEventListener("click", () => {
  if (appState === "PLAYING" && !controls.locked) controls.requestLock();
});

canvas.addEventListener("mousedown", () => {
  if (appState === "PLAYING" && controls.locked && drill) {
    const result = drill.handleShot(performance.now());
    if (result) {
      flashCrosshair(crosshair, result.hit);
      if (result.hit) playHitSound();
      else playMissSound();
    }
  }
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

let lastFrameTime = performance.now();
function tick(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  controls.update(dt);

  if (appState === "PLAYING" && controls.locked && drill) {
    const expired = targetManager.update(dt, now);
    drill.update(dt, now, expired);
    updateHud(drill.getLiveStats(now));

    if (drill.isFinished(now)) {
      const result = drill.end(now);
      const priorSessions = getSessionsByMode(result.mode);
      saveSession(result);
      const coachTips = generateCoachTips(result, priorSessions);
      drill = null;
      appState = "SUMMARY";
      hideHud();
      document.exitPointerLock();
      showSummary(
        result,
        coachTips,
        () => {
          appState = "PLAYING";
          controls.requestLock();
        },
        () => returnToMenu()
      );
    }
  }

  if (composer) composer.render();
  else renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

console.log(`AimForge running — quality preset: "${quality.name}"`);
