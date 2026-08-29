import {
  loadCrosshairConfig,
  saveCrosshairConfig,
  getDefaultCrosshairConfig,
  renderCrosshairInto,
} from "../crosshairConfig.js";

const screen = document.getElementById("crosshair-screen");
const preview = document.getElementById("crosshair-preview");
const shapeButtons = Array.from(document.querySelectorAll("#crosshair-shape-group button"));
const outlineButtons = Array.from(document.querySelectorAll("#crosshair-outline-group button"));
const dotButtons = Array.from(document.querySelectorAll("#crosshair-dot-group button"));
const colorInput = document.getElementById("crosshair-color");
const sizeInput = document.getElementById("crosshair-size");
const thicknessInput = document.getElementById("crosshair-thickness");
const gapInput = document.getElementById("crosshair-gap");
const opacityInput = document.getElementById("crosshair-opacity");
const resetButton = document.getElementById("crosshair-reset");

let config = loadCrosshairConfig();
let onChange = () => {};

function setPressed(button, pressed) {
  button.classList.toggle("selected", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function syncControlsFromConfig() {
  for (const b of shapeButtons) setPressed(b, b.dataset.shape === config.shape);
  for (const b of outlineButtons) {
    setPressed(b, (b.dataset.outline === "on") === config.outline);
  }
  for (const b of dotButtons) {
    setPressed(b, (b.dataset.dot === "on") === config.centerDot);
  }
  colorInput.value = config.color;
  sizeInput.value = String(config.size);
  thicknessInput.value = String(config.thickness);
  gapInput.value = String(config.gap);
  opacityInput.value = String(Math.round(config.opacity * 100));
}

function applyAndPersist() {
  renderCrosshairInto(preview, config);
  saveCrosshairConfig(config);
  onChange(config);
}

export function initCrosshairEditor(onChangeCallback) {
  onChange = onChangeCallback;
  syncControlsFromConfig();
  renderCrosshairInto(preview, config);

  for (const btn of shapeButtons) {
    btn.addEventListener("click", () => {
      config.shape = btn.dataset.shape;
      for (const b of shapeButtons) setPressed(b, b === btn);
      applyAndPersist();
    });
  }
  for (const btn of outlineButtons) {
    btn.addEventListener("click", () => {
      config.outline = btn.dataset.outline === "on";
      for (const b of outlineButtons) setPressed(b, b === btn);
      applyAndPersist();
    });
  }
  for (const btn of dotButtons) {
    btn.addEventListener("click", () => {
      config.centerDot = btn.dataset.dot === "on";
      for (const b of dotButtons) setPressed(b, b === btn);
      applyAndPersist();
    });
  }
  colorInput.addEventListener("input", () => {
    config.color = colorInput.value;
    applyAndPersist();
  });
  sizeInput.addEventListener("input", () => {
    config.size = Number(sizeInput.value);
    applyAndPersist();
  });
  thicknessInput.addEventListener("input", () => {
    config.thickness = Number(thicknessInput.value);
    applyAndPersist();
  });
  gapInput.addEventListener("input", () => {
    config.gap = Number(gapInput.value);
    applyAndPersist();
  });
  opacityInput.addEventListener("input", () => {
    config.opacity = Number(opacityInput.value) / 100;
    applyAndPersist();
  });
  resetButton.addEventListener("click", () => {
    config = getDefaultCrosshairConfig();
    syncControlsFromConfig();
    applyAndPersist();
  });
}

export function showCrosshairEditor() {
  screen.classList.remove("hidden");
}

export function hideCrosshairEditor() {
  screen.classList.add("hidden");
}
