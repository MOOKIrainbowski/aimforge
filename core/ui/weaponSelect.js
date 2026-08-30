import { WEAPON_ORDER, getWeapon, DEFAULT_WEAPON_ID, isWeaponId } from "../weapons.js";
import { loadWeaponModel } from "../weaponModel.js";
import { t } from "../i18n.js";

// The weapon picker, shown on the way into the range rather than as a row on
// the home screen: the choice belongs next to the moment you use it, and it
// gives each weapon room to explain how it actually behaves instead of being
// three unlabelled words in a segmented control.
const screen = document.getElementById("weapon-screen");
const grid = document.getElementById("weapon-grid");
const confirmButton = document.getElementById("weapon-confirm");
const backButton = document.getElementById("weapon-back");

let selectedId = DEFAULT_WEAPON_ID;
let onConfirm = () => {};
let onCancel = () => {};

// The stat strip under each weapon's name. Rows that don't apply to a
// weapon are dropped rather than shown as zero, so a pistol's card isn't
// padded with "0 pellets / 0ms cycle" noise.
function statRows(weapon) {
  const rows = [
    [t("weaponSelect.stat.fireMode"), t(`weaponSelect.mode.${weapon.fireMode}`)],
    [t("weaponSelect.stat.rpm"), String(weapon.rpm)],
    [t("weaponSelect.stat.magazine"), String(weapon.magazine)],
    [t("weaponSelect.stat.reload"), `${(weapon.reloadMs / 1000).toFixed(1)}s`],
  ];
  if (weapon.pellets > 1) rows.push([t("weaponSelect.stat.pellets"), String(weapon.pellets)]);
  if (weapon.cycleMs > 0) rows.push([t("weaponSelect.stat.cycle"), `${(weapon.cycleMs / 1000).toFixed(2)}s`]);
  return rows;
}

function renderGrid() {
  grid.replaceChildren();

  for (const id of WEAPON_ORDER) {
    const weapon = getWeapon(id);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "weapon-option";
    card.dataset.weapon = id;
    card.setAttribute("aria-pressed", String(id === selectedId));
    card.classList.toggle("selected", id === selectedId);

    const name = document.createElement("span");
    name.className = "weapon-option-name";
    name.textContent = t(`weapon.${id}`);

    const tagline = document.createElement("span");
    tagline.className = "weapon-option-tagline";
    tagline.textContent = t(`weapon.${id}.desc`);

    const stats = document.createElement("dl");
    stats.className = "weapon-option-stats";
    for (const [label, value] of statRows(weapon)) {
      const dt = document.createElement("dt");
      dt.textContent = label;
      const dd = document.createElement("dd");
      dd.textContent = value;
      stats.append(dt, dd);
    }

    card.append(name, tagline, stats);
    card.addEventListener("click", () => select(id));
    grid.append(card);
  }
}

function select(id) {
  if (!isWeaponId(id)) return;
  selectedId = id;
  for (const card of grid.children) {
    const isSelected = card.dataset.weapon === id;
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  }
  // Start fetching the model the moment it's highlighted, so confirming
  // usually has nothing left to wait for.
  loadWeaponModel(id);
}

export function initWeaponSelect({ onConfirm: confirmCallback, onCancel: cancelCallback, initialWeaponId }) {
  onConfirm = confirmCallback;
  onCancel = cancelCallback;
  if (isWeaponId(initialWeaponId)) selectedId = initialWeaponId;

  confirmButton.addEventListener("click", () => onConfirm(selectedId));
  backButton.addEventListener("click", () => onCancel());
}

export function showWeaponSelect() {
  renderGrid();
  screen.classList.remove("hidden");
}

export function hideWeaponSelect() {
  screen.classList.add("hidden");
}

export function getSelectedWeaponId() {
  return selectedId;
}
