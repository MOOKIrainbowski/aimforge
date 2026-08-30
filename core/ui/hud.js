import { t } from "../i18n.js";

const hudEl = document.getElementById("hud");
const scoreEl = document.getElementById("hud-score");
const accuracyEl = document.getElementById("hud-accuracy");
const timeEl = document.getElementById("hud-time");
const streakEl = document.getElementById("hud-streak");

const weaponEl = document.getElementById("hud-weapon");
const weaponNameEl = document.getElementById("hud-weapon-name");
const ammoMagEl = document.getElementById("hud-ammo-mag");
const ammoCapEl = document.getElementById("hud-ammo-cap");
const actionEl = document.getElementById("hud-action");
const actionLabelEl = document.getElementById("hud-action-label");
const actionFillEl = document.getElementById("hud-action-fill");

export function showHud() {
  hudEl.classList.remove("hidden");
  weaponEl.classList.remove("hidden");
}

export function hideHud() {
  hudEl.classList.add("hidden");
  weaponEl.classList.add("hidden");
}

export function updateHud(stats) {
  scoreEl.textContent = t("hud.score", { value: stats.score });
  accuracyEl.textContent = `${stats.accuracy.toFixed(1)}%`;
  timeEl.textContent = `${(stats.timeRemainingMs / 1000).toFixed(1)}s`;
  streakEl.textContent = t("hud.streak", { value: stats.streak });
}

let lastAmmo = -1;
let lastCapacity = -1;
let lastName = "";
let lastBlockKind = null;

// Ammo, magazine size, and whichever wait is currently blocking the trigger.
// Called every frame, so each write is guarded by a comparison — the values
// only change a few times a second, and repainting unchanged text on a
// pointer-locked page at 144Hz is pure layout churn.
export function updateWeaponHud({ weaponId, ammo, capacity, block }) {
  if (weaponId !== lastName) {
    lastName = weaponId;
    weaponNameEl.textContent = t(`weapon.${weaponId}`);
  }
  if (ammo !== lastAmmo) {
    lastAmmo = ammo;
    ammoMagEl.textContent = String(ammo);
    ammoMagEl.classList.toggle("hud-ammo-empty", ammo === 0);
  }
  if (capacity !== lastCapacity) {
    lastCapacity = capacity;
    ammoCapEl.textContent = String(capacity);
  }

  if (!block) {
    if (lastBlockKind !== null) {
      lastBlockKind = null;
      actionEl.classList.add("hidden");
    }
    return;
  }
  if (block.kind !== lastBlockKind) {
    lastBlockKind = block.kind;
    actionEl.classList.remove("hidden");
    actionLabelEl.textContent = t(block.kind === "reload" ? "hud.reloading" : "hud.cycling");
  }
  actionFillEl.style.transform = `scaleX(${Math.max(0, Math.min(1, block.t))})`;
}

// Cleared when a session ends so the next one repaints from scratch rather
// than trusting stale comparison state.
export function resetWeaponHud() {
  lastAmmo = -1;
  lastCapacity = -1;
  lastName = "";
  lastBlockKind = null;
  actionEl.classList.add("hidden");
}
