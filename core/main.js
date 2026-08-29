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
import {
  setSoundEnabled,
  playShotSound,
  playHitSound,
  playMissSound,
  playTargetExpireSound,
  playCompletionSound,
  playMenuSound,
  initGlobalClickSounds,
  flashCrosshair,
  showHitMarker,
} from "./ui/feedback.js";
import { spawnKillBurst, updateParticles } from "./particles.js";
import { spawnTracer, updateTracers } from "./tracer.js";
import { loadWeaponModels, Viewmodel } from "./weaponModel.js";
import { applyTranslations, t } from "./i18n.js";

applyTranslations(document);
initGlobalClickSounds();

const loadingScreen = document.getElementById("loading-screen");
const loadingProgressText = document.getElementById("loading-progress-text");
function setLoadingProgress(key) {
  loadingProgressText.textContent = t(key);
}

const quality = getQuality();

const canvas = document.getElementById("scene");
const crosshair = document.getElementById("crosshair");
const hitmarker = document.getElementById("hitmarker");
const scopeOverlay = document.getElementById("scope-overlay");
const startPrompt = document.getElementById("start-prompt");
const pauseScreen = document.getElementById("pause-screen");

let rangeConfig = loadRangeConfig();
document.documentElement.dataset.theme = rangeConfig.theme;
setSoundEnabled(rangeConfig.soundEnabled);

setLoadingProgress("loading.renderer");
const renderer = createRenderer(canvas, quality);
const camera = createCamera(rangeConfig.fov);
const scene = new THREE.Scene();
// The renderer only traverses/renders scene.render(scene, camera)'s `scene`
// graph — the camera itself is just used for its view/projection matrices.
// Camera-attached objects (the weapon viewmodel, via camera.add() below)
// only render if the camera is itself part of that graph.
scene.add(camera);

setLoadingProgress("loading.range");
const sceneRefs = buildRange(scene, quality, rangeConfig);
const targetManager = new TargetManager(scene, quality);
applyEnvironment(renderer, scene, quality);

// Desktop-quality post-processing (bloom + filmic output) — dynamically
// imported so the web build never fetches these modules. Top-level await is
// safe here: both builds load this file as a native ES module.
let composer = null;
if (quality.postProcessing) {
  setLoadingProgress("loading.effects");
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

setLoadingProgress("loading.weapons");
const weaponModels = await loadWeaponModels();
const viewmodel = new Viewmodel(camera);
viewmodel.setWeapon("rifle", weaponModels);

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
  onLockChange: handleLockChange,
  sensitivity: persistedSettings.sensitivity,
});
controls.connect();

// Right-mouse ADS/zoom: `zoomed` is the discrete "is RMB held" state,
// `zoomT` eases toward it each frame (see tick()) so FOV/sensitivity/the
// viewmodel's aim pose all transition smoothly together instead of
// snapping. `hipSensitivity` is the un-zoomed baseline to scale from and
// restore to — kept in sync with the Sensitivity screen below.
const ZOOM_FOV = 28;
let zoomed = false;
let zoomT = 0;
let hipSensitivity = persistedSettings.sensitivity;

function setZoomed(next) {
  if (next === zoomed) return;
  zoomed = next;
  viewmodel.setAimed(zoomed);
  scopeOverlay.classList.toggle("hidden", !zoomed);
}

// Dev-only inspection hook, opt-in via `?debug=1` — lets test/dev tooling
// read live camera/target/control state without exposing it by default.
if (new URLSearchParams(window.location.search).has("debug")) {
  window.__aimonsiteDebug = {
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

// Entering a drill no longer grabs pointer lock instantly — the range shows
// with the start-prompt overlay, and the player locks in explicitly by
// clicking (see the canvas `click` listener below), matching a deliberate
// "click to start" flow rather than an immediate lock on the menu click.
function beginSession(config) {
  lastConfig = {
    ...config,
    durationMs: durationOverride > 0 ? durationOverride : config.durationMs,
    // Targets always match whatever crosshair color the player has set —
    // see currentCrosshairColor below — rather than a separate setting.
    targetColor: currentCrosshairColor,
  };
  appState = "PLAYING";
  hideHome();
  // No pointerlockchange event fires just from entering this state (lock
  // hasn't been requested yet), so the prompt needs to be shown directly
  // rather than relying on handleLockChange()'s usual toggle.
  startPrompt.classList.remove("hidden");
}

function startSession(now) {
  targetManager.clear();
  drill = createDrill(lastConfig, { scene, camera, targetManager, controls });
  drill.start(now);
  showHud();
  viewmodel.setWeapon(lastConfig.viewmodelWeapon, weaponModels);
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
  playMenuSound();
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
// Live-tracked so target color always matches whatever the player currently
// has set on the Crosshair screen — see beginSession() above.
let currentCrosshairColor = loadCrosshairConfig().color;
renderCrosshairInto(crosshair, loadCrosshairConfig());
initCrosshairEditor((newConfig) => {
  renderCrosshairInto(crosshair, newConfig);
  currentCrosshairColor = newConfig.color;
});

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
  hipSensitivity = newSettings.sensitivity;
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
  // The click-to-start prompt only applies before a drill's first lock;
  // once a drill is running, a lost lock shows the pause overlay instead.
  startPrompt.classList.toggle("hidden", locked || appState !== "PLAYING" || Boolean(drill));

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
  // Losing pointer lock (pause, Esc, session end) always drops zoom
  // immediately — no lingering narrowed FOV/sensitivity across a pause.
  if (!locked) setZoomed(false);
}

canvas.addEventListener("click", () => {
  if (appState === "PLAYING" && !controls.locked) controls.requestLock();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// How far a missed shot's tracer travels before fading out — comfortably
// past anything in the range, so it visually clips at whatever wall/floor
// the renderer's own depth test hits rather than this needing its own
// raycast against the range geometry.
const MISS_TRACER_DISTANCE = 30;
const tracerDirection = new THREE.Vector3();

// Draws the tracer from an approximate muzzle position (the viewmodel's
// current camera-local pose, converted to world space, so it follows the
// hip/aim pose blend) to the shot's actual landing point — the target's
// position on a hit, or a far point straight down the crosshair's aim
// direction on a miss.
function fireTracer(result) {
  camera.updateMatrixWorld();
  const muzzle = camera.localToWorld(viewmodel.group.position.clone());
  const end =
    result.hit && result.position
      ? result.position.clone()
      : camera.position.clone().addScaledVector(camera.getWorldDirection(tracerDirection), MISS_TRACER_DISTANCE);
  spawnTracer(scene, muzzle, end, currentCrosshairColor);
}

canvas.addEventListener("mousedown", (e) => {
  if (!(appState === "PLAYING" && controls.locked && drill)) return;

  if (e.button === 2) {
    setZoomed(true);
    return;
  }
  if (e.button !== 0) return;

  const result = drill.handleShot(performance.now());
  if (result) {
    viewmodel.kick();
    playShotSound();
    fireTracer(result);
    flashCrosshair(crosshair, result.hit);
    if (result.hit) {
      playHitSound();
      showHitMarker(hitmarker);
      spawnKillBurst(scene, result.position, result.streak);
    } else {
      playMissSound();
    }
  }
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button === 2) setZoomed(false);
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

let lastFrameTime = performance.now();
let firstFrameRendered = false;
function tick(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  // Eases FOV/sensitivity toward the zoomed or hip target together so ADS
  // reads as one smooth transition rather than snapping to the scope.
  const zoomTarget = zoomed ? 1 : 0;
  if (zoomT !== zoomTarget) {
    const zoomStep = dt / 0.15;
    zoomT += Math.sign(zoomTarget - zoomT) * Math.min(Math.abs(zoomTarget - zoomT), zoomStep);
    applyFov(camera, rangeConfig.fov + (ZOOM_FOV - rangeConfig.fov) * zoomT);
    controls.sensitivity = hipSensitivity * (1 + (ZOOM_FOV / rangeConfig.fov - 1) * zoomT);
  }

  controls.update(dt);
  updateParticles(dt);
  updateTracers();
  viewmodel.update(dt);

  if (appState === "PLAYING" && controls.locked && drill) {
    const expired = targetManager.update(dt, now);
    if (expired.length > 0) playTargetExpireSound();
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
      playCompletionSound();
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

  if (!firstFrameRendered) {
    firstFrameRendered = true;
    loadingScreen.classList.add("hidden");
  }

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

console.log(`AimonSite running — quality preset: "${quality.name}"`);
