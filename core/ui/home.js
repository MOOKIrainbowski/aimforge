import { getAggregateStats } from "../stats.js";
import { loadRangeConfig, saveRangeConfig } from "../rangeConfig.js";
import { getWeapon, DEFAULT_WEAPON_ID, isWeaponId } from "../weapons.js";
import { getWeaponThumbnail } from "../weaponThumb.js";
import { loadSettings } from "../settings.js";
import { t } from "../i18n.js";

const homeScreen = document.getElementById("home-screen");
const modeCards = Array.from(document.querySelectorAll(".mode-card"));
const difficultyButtons = Array.from(document.querySelectorAll("#difficulty-group button"));
const durationButtons = Array.from(document.querySelectorAll("#duration-group button"));
const recoilSwitch = document.getElementById("recoil-switch");
const startButton = document.getElementById("home-start");
const loadoutButton = document.getElementById("home-loadout");
const loadoutImage = document.getElementById("loadout-image");
const loadoutName = document.getElementById("loadout-name");
const loadoutMeta = document.getElementById("loadout-meta");
const humanSwitch = document.getElementById("home-human-switch");
const magazineSwitch = document.getElementById("home-magazine-switch");

// A single difficulty knob drives per-mode parameters: target size for all
// modes, plus tracking speed and switching wave size for the modes that use
// them (Gridshot/Reaction ignore the fields that don't apply to them).
const DIFFICULTY_PRESETS = {
  easy: { targetRadius: 0.5, speedMultiplier: 0.7, waveSize: 3 },
  normal: { targetRadius: 0.35, speedMultiplier: 1.0, waveSize: 4 },
  hard: { targetRadius: 0.22, speedMultiplier: 1.4, waveSize: 5 },
};

let onChangeWeapon = () => {};

let selectedMode = "gridshot";
let selectedDifficulty = "normal";
let selectedDurationMs = 60_000;
let recoilEnabled = false;

function setPressed(button, pressed) {
  button.classList.toggle("selected", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function setSwitch(button, checked, onKey, offKey) {
  button.setAttribute("aria-checked", String(checked));
  button.classList.toggle("on", checked);
  const stateEl = button.querySelector(".switch-state");
  if (stateEl) stateEl.textContent = t(checked ? onKey : offKey);
}

// Tracking's score is seconds-on-target (already fractional); every other
// mode's score is a plain hit count.
function formatBestScore(mode, value) {
  return mode === "tracking" ? `${value.toFixed(1)}s` : String(Math.round(value));
}

function renderBestScores() {
  for (const card of modeCards) {
    const badge = card.querySelector(".mode-best");
    if (!badge) continue;
    const mode = badge.dataset.bestFor;
    const stats = getAggregateStats(mode);
    badge.textContent = stats.count > 0 ? t("home.best", { value: formatBestScore(mode, stats.bestScore) }) : "";
  }
}

// The weapon carried into the range, read back from the same persisted
// setting the picker writes, so the two can never disagree about what is
// currently equipped.
function currentWeaponId() {
  const stored = loadSettings().weaponId;
  return isWeaponId(stored) ? stored : DEFAULT_WEAPON_ID;
}

function renderLoadout() {
  const weapon = getWeapon(currentWeaponId());
  loadoutName.textContent = t(`weapon.${weapon.id}`);
  loadoutMeta.textContent = t(`weapons.mode.${weapon.fireMode}`);
  // The same rendered-from-the-model thumbnail the picker uses, so this row
  // never shows a weapon the picker would draw differently.
  getWeaponThumbnail(weapon.id).then((url) => {
    if (url) loadoutImage.src = url;
  });
}

// Human targets and the magazine limit live in rangeConfig and are mirrored
// here. They are read on every show rather than cached, so changing one in
// Settings is reflected the next time this screen is opened.
function renderRangeSwitches() {
  const config = loadRangeConfig();
  setSwitch(humanSwitch, config.humanTargets, "common.on", "common.off");
  setSwitch(magazineSwitch, config.magazineLimit, "common.on", "common.off");
}

function toggleRangeConfig(key, button) {
  const config = loadRangeConfig();
  config[key] = !config[key];
  saveRangeConfig(config);
  setSwitch(button, config[key], "common.on", "common.off");
}

export function initHome(onStart, { onChangeWeapon: changeWeaponCallback } = {}) {
  onChangeWeapon = changeWeaponCallback ?? (() => {});

  loadoutButton.addEventListener("click", () => onChangeWeapon());
  humanSwitch.addEventListener("click", () => toggleRangeConfig("humanTargets", humanSwitch));
  magazineSwitch.addEventListener("click", () => toggleRangeConfig("magazineLimit", magazineSwitch));

  for (const card of modeCards) {
    if (card.disabled) continue;
    card.addEventListener("click", () => {
      selectedMode = card.dataset.mode;
      for (const c of modeCards) setPressed(c, c === card);
    });
  }

  for (const btn of difficultyButtons) {
    btn.addEventListener("click", () => {
      selectedDifficulty = btn.dataset.difficulty;
      for (const b of difficultyButtons) setPressed(b, b === btn);
    });
  }

  for (const btn of durationButtons) {
    btn.addEventListener("click", () => {
      selectedDurationMs = Number(btn.dataset.duration);
      for (const b of durationButtons) setPressed(b, b === btn);
    });
  }

  recoilSwitch.addEventListener("click", () => {
    recoilEnabled = !recoilEnabled;
    setSwitch(recoilSwitch, recoilEnabled, "common.on", "common.off");
  });

  startButton.addEventListener("click", () => {
    onStart({
      mode: selectedMode,
      durationMs: selectedDurationMs,
      ...DIFFICULTY_PRESETS[selectedDifficulty],
      // Which weapon is carried is no longer decided here — the picker on
      // the way into the range owns that. This only reports whether the
      // Recoil Control training pattern should be armed for it; main.js
      // combines the two once the weapon is chosen.
      recoilEnabled,
    });
  });

  renderBestScores();
  renderLoadout();
  renderRangeSwitches();
}

export function showHome() {
  renderBestScores();
  renderLoadout();
  renderRangeSwitches();
  homeScreen.classList.remove("hidden");
}

export function hideHome() {
  homeScreen.classList.add("hidden");
}
