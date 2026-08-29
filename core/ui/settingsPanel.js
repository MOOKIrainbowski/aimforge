import { loadRangeConfig, saveRangeConfig, getDefaultRangeConfig } from "../rangeConfig.js";

const screen = document.getElementById("settings-screen");
const themeButtons = Array.from(document.querySelectorAll("#theme-group button"));
const soundButtons = Array.from(document.querySelectorAll("#sound-group button"));
const targetColorInput = document.getElementById("settings-target-color");
const wallColorInput = document.getElementById("settings-wall-color");
const floorColorInput = document.getElementById("settings-floor-color");
const brightnessInput = document.getElementById("settings-brightness");
const fovInput = document.getElementById("settings-fov");
const resetButton = document.getElementById("settings-reset");

let config = loadRangeConfig();
let onChange = () => {};

function setPressed(button, pressed) {
  button.classList.toggle("selected", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function syncControls() {
  for (const b of themeButtons) setPressed(b, b.dataset.theme === config.theme);
  for (const b of soundButtons) setPressed(b, (b.dataset.sound === "on") === config.soundEnabled);
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

  for (const btn of themeButtons) {
    btn.addEventListener("click", () => {
      config.theme = btn.dataset.theme;
      for (const b of themeButtons) setPressed(b, b === btn);
      persistAndApply();
    });
  }
  for (const btn of soundButtons) {
    btn.addEventListener("click", () => {
      config.soundEnabled = btn.dataset.sound === "on";
      for (const b of soundButtons) setPressed(b, b === btn);
      persistAndApply();
    });
  }
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
