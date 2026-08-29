import { loadSettings, saveSettings } from "../settings.js";
import { aimforgeSensitivityToCm360, cm360ToAimforgeSensitivity, cm360ToGameSensitivity, GAME_LABELS } from "../sensitivity.js";

const screen = document.getElementById("sensitivity-screen");
const dpiInput = document.getElementById("sens-dpi");
const cm360Input = document.getElementById("sens-cm360");
const cm360Value = document.getElementById("sens-cm360-value");
const tableBody = document.getElementById("sensitivity-table-body");

let onChange = () => {};

function render() {
  const dpi = Number(dpiInput.value);
  const cm360 = Number(cm360Input.value);
  cm360Value.textContent = cm360.toFixed(1);

  tableBody.innerHTML = "";
  for (const [gameId, label] of Object.entries(GAME_LABELS)) {
    const sens = cm360ToGameSensitivity(cm360, dpi, gameId);
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = label;
    const tdValue = document.createElement("td");
    tdValue.textContent = sens.toFixed(3);
    tdValue.className = "sensitivity-value";
    tr.appendChild(tdLabel);
    tr.appendChild(tdValue);
    tableBody.appendChild(tr);
  }
}

function persistAndApply() {
  const dpi = Number(dpiInput.value);
  const cm360 = Number(cm360Input.value);
  const settings = { dpi, sensitivity: cm360ToAimforgeSensitivity(cm360, dpi) };
  saveSettings(settings);
  onChange(settings);
  render();
}

export function initSensitivityCalculator(onChangeCallback) {
  onChange = onChangeCallback;
  const settings = loadSettings();
  dpiInput.value = String(settings.dpi);
  cm360Input.value = aimforgeSensitivityToCm360(settings.sensitivity, settings.dpi).toFixed(1);
  render();

  dpiInput.addEventListener("input", persistAndApply);
  cm360Input.addEventListener("input", persistAndApply);
}

export function showSensitivityCalculator() {
  screen.classList.remove("hidden");
}

export function hideSensitivityCalculator() {
  screen.classList.add("hidden");
}
