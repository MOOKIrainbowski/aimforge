import { loadRangeConfig, saveRangeConfig, getDefaultRangeConfig } from "../rangeConfig.js";
import { t } from "../i18n.js";

const screen = document.getElementById("settings-screen");
const themeSwitch = document.getElementById("theme-switch");
const soundSwitch = document.getElementById("sound-switch");
const targetColorInput = document.getElementById("settings-target-color");
const wallColorInput = document.getElementById("settings-wall-color");
const floorColorInput = document.getElementById("settings-floor-color");
const brightnessInput = document.getElementById("settings-brightness");
const fovInput = document.getElementById("settings-fov");
const resetButton = document.getElementById("settings-reset");

let config = loadRangeConfig();
let onChange = () => {};

function setSwitch(button, checked, onKey, offKey) {
  button.setAttribute("aria-checked", String(checked));
  button.classList.toggle("on", checked);
  const stateEl = button.querySelector(".switch-state");
  if (stateEl) stateEl.textContent = t(checked ? onKey : offKey);
}

function syncControls() {
  setSwitch(themeSwitch, config.theme === "light", "theme.light", "theme.dark");
  setSwitch(soundSwitch, config.soundEnabled, "common.on", "common.off");
  targetColorInput.value = config.targetColor;
  wallColorInput.value = config.wallColor;
  floorColorInput.value = config.floorColor;
  brightnessInput.value = String(Math.round(config.brightness * 100));
  fovInput.value = String(config.fov);
}

function persistAndApply() {
  saveRangeConfig(config);
  onChange(config);
}

export function initSettingsPanel(onChangeCallback) {
  onChange = onChangeCallback;
  syncControls();

  themeSwitch.addEventListener("click", () => {
    config.theme = config.theme === "light" ? "dark" : "light";
    setSwitch(themeSwitch, config.theme === "light", "theme.light", "theme.dark");
    persistAndApply();
  });
  soundSwitch.addEventListener("click", () => {
    config.soundEnabled = !config.soundEnabled;
    setSwitch(soundSwitch, config.soundEnabled, "common.on", "common.off");
    persistAndApply();
  });
  targetColorInput.addEventListener("input", () => {
    config.targetColor = targetColorInput.value;
    persistAndApply();
  });
  wallColorInput.addEventListener("input", () => {
    config.wallColor = wallColorInput.value;
    persistAndApply();
  });
  floorColorInput.addEventListener("input", () => {
    config.floorColor = floorColorInput.value;
    persistAndApply();
  });
  brightnessInput.addEventListener("input", () => {
    config.brightness = Number(brightnessInput.value) / 100;
    persistAndApply();
  });
  fovInput.addEventListener("input", () => {
    config.fov = Number(fovInput.value);
    persistAndApply();
  });
  resetButton.addEventListener("click", () => {
    config = getDefaultRangeConfig();
    syncControls();
    persistAndApply();
  });

  // Apply once at boot too, so main.js's initial theme attribute + range
  // appearance reflect whatever was persisted, not just future changes.
  onChange(config);
}

export function showSettingsPanel() {
  screen.classList.remove("hidden");
}

export function hideSettingsPanel() {
  screen.classList.add("hidden");
}
