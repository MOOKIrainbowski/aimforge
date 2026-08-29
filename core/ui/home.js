import { getAggregateStats } from "../stats.js";
import { t } from "../i18n.js";

const homeScreen = document.getElementById("home-screen");
const modeCards = Array.from(document.querySelectorAll(".mode-card"));
const difficultyButtons = Array.from(document.querySelectorAll("#difficulty-group button"));
const durationButtons = Array.from(document.querySelectorAll("#duration-group button"));
const recoilSwitch = document.getElementById("recoil-switch");
const weaponButtons = Array.from(document.querySelectorAll("#weapon-group button"));
const weaponRow = document.getElementById("weapon-row");
const startButton = document.getElementById("home-start");

// A single difficulty knob drives per-mode parameters: target size for all
// modes, plus tracking speed and switching wave size for the modes that use
// them (Gridshot/Reaction ignore the fields that don't apply to them).
const DIFFICULTY_PRESETS = {
  easy: { targetRadius: 0.5, speedMultiplier: 0.7, waveSize: 3 },
  normal: { targetRadius: 0.35, speedMultiplier: 1.0, waveSize: 4 },
  hard: { targetRadius: 0.22, speedMultiplier: 1.4, waveSize: 5 },
};

let selectedMode = "gridshot";
let selectedDifficulty = "normal";
let selectedDurationMs = 60_000;
let recoilEnabled = false;
let selectedWeapon = "rifle";

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

export function initHome(onStart) {
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
    weaponRow.classList.toggle("hidden", !recoilEnabled);
  });

  for (const btn of weaponButtons) {
    btn.addEventListener("click", () => {
      selectedWeapon = btn.dataset.weapon;
      for (const b of weaponButtons) setPressed(b, b === btn);
    });
  }

  startButton.addEventListener("click", () => {
    onStart({
      mode: selectedMode,
      durationMs: selectedDurationMs,
      ...DIFFICULTY_PRESETS[selectedDifficulty],
      weaponId: recoilEnabled ? selectedWeapon : "none",
    });
  });

  renderBestScores();
}

export function showHome() {
  renderBestScores();
  homeScreen.classList.remove("hidden");
}

export function hideHome() {
  homeScreen.classList.add("hidden");
}
