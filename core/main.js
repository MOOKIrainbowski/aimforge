import * as THREE from "three";
import { getQuality } from "./quality.js";
import { createRenderer, createCamera, applyFov, buildRange, applyRangeAppearance, applyEnvironment } from "./scene.js";
import { PointerLockCameraControls } from "./controls.js";
import { TargetManager } from "./target.js";
import { GridshotDrill } from "./drills/gridshot.js";
import { TrackingDrill } from "./drills/tracking.js";
import { SwitchingDrill } from "./drills/switching.js";
import { ReactionDrill } from "./drills/reaction.js";
import { showHud, hideHud, updateHud, updateWeaponHud, resetWeaponHud } from "./ui/hud.js";
import { showSummary, hideSummary } from "./ui/summary.js";
import { initHome, showHome, hideHome } from "./ui/home.js";
import { initHistory, showHistory, hideHistory } from "./ui/history.js";
import { initCrosshairEditor, showCrosshairEditor, hideCrosshairEditor } from "./ui/crosshairEditor.js";
import { loadCrosshairConfig, renderCrosshairInto } from "./crosshairConfig.js";
import { initSensitivityCalculator, showSensitivityCalculator, hideSensitivityCalculator } from "./ui/sensitivityCalculator.js";
import { initSettingsPanel, showSettingsPanel, hideSettingsPanel } from "./ui/settingsPanel.js";
import { initWeaponSelect, showWeaponSelect, hideWeaponSelect } from "./ui/weaponSelect.js";
import { initSuggestions, showSuggestions, hideSuggestions, refreshSuggestionBadge } from "./ui/suggestions.js";
import { initAdmin, showAdmin, hideAdmin, refreshAdminBadge } from "./ui/admin.js";
import { setAdmin, isAdmin } from "./suggestions/store.js";
import { loadSettings, saveSettings } from "./settings.js";
import { loadRangeConfig } from "./rangeConfig.js";
import { saveSession, getSessionsByMode } from "./stats.js";
import { generateCoachTips } from "./coach.js";
import {
  setSoundEnabled,
  playShotSound,
  playKillSound,
  playMissSound,
  playTargetExpireSound,
  playCompletionSound,
  playMenuSound,
  playReloadSound,
  playCycleSound,
  playDryFireSound,
  initGlobalClickSounds,
  flashCrosshair,
  showHitMarker,
} from "./ui/feedback.js";
import { spawnKillBurst, updateParticles, clearParticles } from "./particles.js";
import { spawnTracer, updateTracers } from "./tracer.js";
import { loadCasingModel, ejectCasing, updateCasings, clearCasings } from "./casings.js";
import { Viewmodel, loadWeaponModel, prefetchWeaponModels } from "./weaponModel.js";
import { getWeapon, isWeaponId, isAutomatic, hasManualAction, DEFAULT_WEAPON_ID, WEAPON_ORDER } from "./weapons.js";
import { WeaponRuntime, buildShotRays } from "./weaponRuntime.js";
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

const persistedSettings = loadSettings();

setLoadingProgress("loading.weapons");
const viewmodel = new Viewmodel(camera);
// Only the weapon the player is actually going to carry blocks the loading
// screen; the other seven and the casing are fetched in the background so
// the range opens as fast as it did when there were three models total.
let selectedWeaponId = isWeaponId(persistedSettings.weaponId) ? persistedSettings.weaponId : DEFAULT_WEAPON_ID;
await viewmodel.setWeapon(selectedWeaponId);
loadCasingModel();
prefetchWeaponModels(WEAPON_ORDER.filter((id) => id !== selectedWeaponId));

// `?duration=<ms>` overrides whatever duration the home screen selected —
// used for fast dev/test iteration instead of waiting out a real session.
const params = new URLSearchParams(window.location.search);
const durationOverride = Number(params.get("duration"));
// `?admin=1` is how the admin view is entered. There is no server and so no
// real account to sign in to — see core/suggestions/store.js for why this is
// a view role rather than an authorisation check.
if (params.get("admin") === "1") setAdmin(true);

// appState is the MENU -> WEAPON -> PLAYING -> SUMMARY state machine (the
// side screens — HISTORY, CROSSHAIR, SENSITIVITY, SETTINGS, SUGGESTIONS,
// ADMIN — are reachable from MENU and always return to it).
// `drill` is only ever non-null while appState === "PLAYING" (and
// pauseStartedAt tracks a mid-session pointer-lock loss within that state).
let appState = "MENU";
let drill = null;
let pauseStartedAt = null;
let lastConfig = null;
let pendingConfig = null;

// Live firing state for the carried weapon. Non-null only during a session.
let weapon = getWeapon(selectedWeaponId);
let weaponRuntime = null;
let triggerHeld = false;
// Bolt/pump weapons throw their brass when the action is worked, not at the
// instant of the shot; this is when that is due.
let pendingEjectAt = null;

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
let zoomed = false;
let zoomT = 0;
let hipSensitivity = persistedSettings.sensitivity;

function setZoomed(next) {
  if (next === zoomed) return;
  zoomed = next;
  viewmodel.setAimed(zoomed);
  // Only weapons with real glass get the scope vignette; on everything else
  // ADS is just a tighter FOV and a raised weapon.
  scopeOverlay.classList.toggle("hidden", !zoomed || weapon.adsFov > 20);
}

// Dev-only inspection hook, opt-in via `?debug=1` — lets test/dev tooling
// read live camera/target/control state without exposing it by default.
if (params.has("debug")) {
  window.__aimonsiteDebug = {
    camera,
    controls,
    targetManager,
    renderer,
    scene,
    viewmodel,
    get composer() {
      return composer;
    },
    get drill() {
      return drill;
    },
    get weaponRuntime() {
      return weaponRuntime;
    },
    // Advances the loop by one frame on demand. A backgrounded or headless
    // tab never fires requestAnimationFrame, so dev tooling that wants to
    // render and screenshot a specific state has no other way to make the
    // game loop run.
    step: () => tick(performance.now()),
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

// Home screen -> weapon picker. The drill config is parked here until a
// weapon is chosen, since the weapon decides the recoil pattern that goes
// into it.
function beginSession(config) {
  pendingConfig = config;
  appState = "WEAPON";
  hideHome();
  showWeaponSelect();
}

// Weapon chosen -> the range itself. Entering a drill doesn't grab pointer
// lock instantly: the range shows with the start-prompt overlay, and the
// player locks in explicitly by clicking (see the canvas `click` listener
// below), matching a deliberate "click to start" flow.
async function enterRange(weaponId) {
  selectedWeaponId = weaponId;
  weapon = getWeapon(weaponId);
  saveSettings({ ...loadSettings(), weaponId });

  lastConfig = {
    ...pendingConfig,
    durationMs: durationOverride > 0 ? durationOverride : pendingConfig.durationMs,
    // Target colour is its own setting now. It used to be assigned from the
    // crosshair colour here, which is what made the two impossible to set
    // apart — see core/rangeConfig.js.
    targetColor: rangeConfig.targetColor,
    // weaponId gates the Recoil Control training pattern (core/weapon.js);
    // the carried weapon applies regardless of that toggle, so a player can
    // shoot a sniper without also fighting its recoil pattern.
    weaponId: pendingConfig.recoilEnabled ? weaponId : "none",
  };

  hideWeaponSelect();
  appState = "PLAYING";
  await viewmodel.setWeapon(weaponId);
  // No pointerlockchange event fires just from entering this state (lock
  // hasn't been requested yet), so the prompt needs to be shown directly
  // rather than relying on handleLockChange()'s usual toggle.
  startPrompt.classList.remove("hidden");
}

function startSession(now) {
  targetManager.clear();
  drill = createDrill(lastConfig, { scene, camera, targetManager, controls });
  drill.start(now);
  weaponRuntime = new WeaponRuntime(weapon, { magazineLimit: rangeConfig.magazineLimit });
  triggerHeld = false;
  lastBlockKind = null;
  pendingEjectAt = null;
  resetWeaponHud();
  showHud();
}

function returnToMenu() {
  appState = "MENU";
  drill = null;
  weaponRuntime = null;
  triggerHeld = false;
  pendingEjectAt = null;
  pauseStartedAt = null;
  targetManager.clear();
  clearParticles();
  clearCasings();
  hideHud();
  resetWeaponHud();
  hideSummary();
  hidePauseScreen();
  hideWeaponSelect();
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
initWeaponSelect({
  onConfirm: (weaponId) => enterRange(weaponId),
  onCancel: () => {
    hideWeaponSelect();
    pendingConfig = null;
    appState = "MENU";
    showHome();
  },
  initialWeaponId: selectedWeaponId,
});

// Live-tracked so the in-game crosshair repaints as the editor changes it.
renderCrosshairInto(crosshair, loadCrosshairConfig());
let tracerColor = loadCrosshairConfig().color;
initCrosshairEditor((newConfig) => {
  renderCrosshairInto(crosshair, newConfig);
  // The tracer follows the crosshair (it is the player's own shot, and
  // reading it against the crosshair is the point); targets deliberately do
  // not — that is a separate setting under Settings.
  tracerColor = newConfig.color;
});

// Every side screen follows the same pattern: leave MENU, show the screen,
// and come back to MENU on Back.
function openScreen(state, show) {
  appState = state;
  hideHome();
  hideSummary();
  show();
}

function closeScreen(hide) {
  hide();
  returnToMenu();
}

document.getElementById("home-history").addEventListener("click", () => openScreen("HISTORY", showHistory));
document.getElementById("summary-history").addEventListener("click", () => openScreen("HISTORY", showHistory));
document.getElementById("history-back").addEventListener("click", () => closeScreen(hideHistory));

document.getElementById("home-crosshair").addEventListener("click", () => openScreen("CROSSHAIR", showCrosshairEditor));
document.getElementById("crosshair-back").addEventListener("click", () => closeScreen(hideCrosshairEditor));

initSensitivityCalculator((newSettings) => {
  controls.sensitivity = newSettings.sensitivity;
  hipSensitivity = newSettings.sensitivity;
});
document.getElementById("home-sensitivity").addEventListener("click", () =>
  openScreen("SENSITIVITY", showSensitivityCalculator)
);
document.getElementById("sensitivity-back").addEventListener("click", () => closeScreen(hideSensitivityCalculator));

initSettingsPanel((newConfig) => {
  rangeConfig = newConfig;
  document.documentElement.dataset.theme = newConfig.theme;
  setSoundEnabled(newConfig.soundEnabled);
  applyRangeAppearance(sceneRefs, newConfig);
  applyFov(camera, newConfig.fov);
});
document.getElementById("home-settings-btn").addEventListener("click", () => openScreen("SETTINGS", showSettingsPanel));
document.getElementById("settings-back").addEventListener("click", () => closeScreen(hideSettingsPanel));

initSuggestions();
document.getElementById("home-suggestions").addEventListener("click", () => openScreen("SUGGESTIONS", showSuggestions));
document.getElementById("suggestions-back").addEventListener("click", () => {
  refreshSuggestionBadge();
  closeScreen(hideSuggestions);
});

initAdmin({
  onSignOut: () => {
    hideAdmin();
    returnToMenu();
  },
});
document.getElementById("home-admin").addEventListener("click", () => openScreen("ADMIN", showAdmin));
document.getElementById("admin-back").addEventListener("click", () => {
  refreshSuggestionBadge();
  closeScreen(hideAdmin);
});
refreshAdminBadge();

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
      weaponRuntime?.shiftClock(pausedDuration);
      if (pendingEjectAt !== null) pendingEjectAt += pausedDuration;
      pauseStartedAt = null;
    } else if (appState === "PLAYING" && !drill) {
      startSession(performance.now());
    }
  } else if (appState === "PLAYING" && drill) {
    pauseStartedAt = performance.now();
    showPauseScreen();
  }
  // Losing pointer lock (pause, Esc, session end) always drops zoom and the
  // trigger immediately — no lingering narrowed FOV or held fire across a
  // pause.
  if (!locked) {
    setZoomed(false);
    triggerHeld = false;
  }
}

canvas.addEventListener("click", () => {
  if (appState === "PLAYING" && !controls.locked) controls.requestLock();
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// How far a shot's tracer travels before fading out — comfortably past
// anything in the range. The beam is depth-tested, so it visually stops at
// whatever wall, floor or target it runs into, without this needing its own
// raycast against the range geometry.
const TRACER_DISTANCE = 30;
const _muzzle = new THREE.Vector3();
const _eject = new THREE.Vector3();
const _rayPoint = new THREE.Vector3();

// One beam per ray fired, drawn from the barrel tip out along that ray. For
// a shotgun that means the whole cone is visible; for everything else it's
// the single shot. Because the beams are depth-tested, a pellet that hits a
// target is simply occluded past it, so hits and misses need no special
// casing here.
function fireTracers(rays) {
  const muzzle = viewmodel.getMuzzleWorld(_muzzle).clone();
  for (const ray of rays) {
    // Unprojecting the ray's NDC gives the exact world direction the
    // raycaster used, so the beam and the shot agree even under ADS zoom.
    _rayPoint.set(ray.x, ray.y, 0.5).unproject(camera).sub(camera.position).normalize();
    spawnTracer(scene, muzzle, _rayPoint.clone().multiplyScalar(TRACER_DISTANCE).add(camera.position), tracerColor);
  }
}

function tryReload(now) {
  weaponRuntime?.startReload(now);
}

function tryFire(now) {
  if (!(appState === "PLAYING" && controls.locked && drill && weaponRuntime)) return;
  if (!weaponRuntime.canFire(now)) {
    // Distinguish "empty" from "still cycling": clicking a dry weapon should
    // click back, but a bolt gun mid-cycle is already saying so on the HUD.
    if (weaponRuntime.magazineLimit && weaponRuntime.ammo === 0 && !weaponRuntime.reloading) playDryFireSound();
    return;
  }

  // Input is applied on the frame clock (see core/controls.js); flushing
  // here means the shot resolves against the aim the player has *now*
  // rather than as of the last rendered frame.
  controls.flush();

  // Where the shot goes is the crosshair plus this weapon's firing error:
  // the hip/ADS base term (hence zoomT, the eased aim progress, rather than
  // the discrete `zoomed` flag — a shot fired halfway into ADS gets halfway
  // between the two) plus whatever bloom sustained fire has accumulated.
  // Read before consume(), so the first shot after a pause carries no bloom.
  const rays = buildShotRays(weapon, camera, { aimT: zoomT, bloomDeg: weaponRuntime.getBloomDeg(now) });
  // The drill's own recoil punch moves the camera at the end of handleShot,
  // so tracer directions are taken first, while the camera still holds the
  // orientation the shot was actually aimed with.
  fireTracers(rays);

  const result = drill.handleShot(now, rays);
  if (!result) return;

  weaponRuntime.consume(now);
  viewmodel.kick();
  playShotSound(weapon);
  flashCrosshair(crosshair, result.hit);

  // Brass leaves an automatic or semi-auto the instant it fires, but a bolt
  // or pump only ejects when the action is worked partway through the cycle.
  if (hasManualAction(weapon)) pendingEjectAt = now + weapon.cycleMs * 0.35;
  else ejectCasing(scene, camera, viewmodel.getEjectionWorld(_eject));

  if (result.hit) {
    playKillSound(result.streak ?? 0);
    showHitMarker(hitmarker);
    for (const position of result.positions) {
      spawnKillBurst(scene, position, result.streak ?? 0, rangeConfig.targetColor, result.targetRadius);
    }
  } else {
    playMissSound();
  }
}

canvas.addEventListener("mousedown", (e) => {
  if (!(appState === "PLAYING" && controls.locked && drill)) return;

  if (e.button === 2) {
    setZoomed(true);
    return;
  }
  if (e.button !== 0) return;

  triggerHeld = true;
  tryFire(performance.now());
});

canvas.addEventListener("mouseup", (e) => {
  if (e.button === 2) setZoomed(false);
  if (e.button === 0) triggerHeld = false;
});

window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyR") return;
  if (appState === "PLAYING" && controls.locked) tryReload(performance.now());
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  // Re-read the device pixel ratio too: dragging the window to a display
  // with a different DPR changes it, and a stale ratio renders the whole
  // scene at the wrong resolution until reload.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatioCap));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (composer) composer.setSize(window.innerWidth, window.innerHeight);
});

let lastFrameTime = performance.now();
let firstFrameRendered = false;
let lastBlockKind = null;

function tick(now) {
  const dt = Math.min((now - lastFrameTime) / 1000, 0.1);
  lastFrameTime = now;

  // Eases FOV/sensitivity toward the zoomed or hip target together so ADS
  // reads as one smooth transition rather than snapping to the scope. The
  // zoomed FOV is per-weapon: a sniper's scope pulls in far harder than a
  // shotgun's bead.
  const zoomTarget = zoomed ? 1 : 0;
  if (zoomT !== zoomTarget) {
    const zoomStep = dt / 0.15;
    zoomT += Math.sign(zoomTarget - zoomT) * Math.min(Math.abs(zoomTarget - zoomT), zoomStep);
    applyFov(camera, rangeConfig.fov + (weapon.adsFov - rangeConfig.fov) * zoomT);
    // Scaling sensitivity with the zoom keeps cm/360 consistent in the
    // scope instead of the aim becoming twitchy the further you zoom.
    controls.sensitivity = hipSensitivity * (1 + (weapon.adsFov / rangeConfig.fov - 1) * zoomT);
  }

  controls.update(dt);
  updateParticles(dt);
  updateTracers();
  updateCasings(dt);
  viewmodel.update(dt);

  if (appState === "PLAYING" && controls.locked && drill) {
    weaponRuntime.update(now);

    if (pendingEjectAt !== null && now >= pendingEjectAt) {
      pendingEjectAt = null;
      ejectCasing(scene, camera, viewmodel.getEjectionWorld(_eject));
    }

    // Full-auto keeps firing for as long as the trigger is down; every other
    // fire mode already fired on mousedown and is gated out by canFire().
    if (triggerHeld && isAutomatic(weapon)) tryFire(now);

    // One place decides the reload/cycle sounds, keyed off the transition
    // into each state rather off the action that caused it — a magazine that
    // runs dry reloads on its own, and that has to sound the same as pressing
    // R for it.
    const block = weaponRuntime.getBlockProgress(now);
    const blockKind = block?.kind ?? null;
    if (blockKind !== lastBlockKind) {
      if (blockKind === "reload") playReloadSound(weapon.reloadMs);
      else if (blockKind === "cycle") playCycleSound();
      lastBlockKind = blockKind;
    }

    viewmodel.setActionProgress(block?.kind === "cycle" ? block.t : null);
    viewmodel.setReloadProgress(block?.kind === "reload" ? block.t : null);
    updateWeaponHud({
      weaponId: weapon.id,
      ammo: weaponRuntime.ammo,
      capacity: weaponRuntime.magazine,
      magazineLimit: weaponRuntime.magazineLimit,
      block,
    });

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
      weaponRuntime = null;
      triggerHeld = false;
      appState = "SUMMARY";
      hideHud();
      resetWeaponHud();
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

console.log(`AimonSite running — quality preset: "${quality.name}"${isAdmin() ? " (admin view)" : ""}`);
