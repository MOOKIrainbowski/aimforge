import { WEAPON_ORDER, DEFAULT_WEAPON_ID, isWeaponId } from "../weapons.js";
import { loadWeaponModel } from "../weaponModel.js";
import { getWeaponThumbnail } from "../weaponThumb.js";
import { t } from "../i18n.js";

// The weapon picker, shown on the way into the range rather than as a row on
// the home screen: the choice belongs next to the moment you use it.
//
// Each card is a picture of the gun and its name, and nothing else. It used
// to carry a tagline plus a six-row stat table per weapon, which turned a
// choice you make in two seconds into eight paragraphs to read — and the
// numbers were the least useful part of it, since fire mode and rate of fire
// are things you feel in the first magazine rather than compare in a table.
// The full stats still exist and still matter; they belong on a card you can
// open, not in the way of picking one up.
const screen = document.getElementById("weapon-screen");
const grid = document.getElementById("weapon-grid");
const confirmButton = document.getElementById("weapon-confirm");
const backButton = document.getElementById("weapon-back");

let selectedId = DEFAULT_WEAPON_ID;
let onConfirm = () => {};
let onCancel = () => {};

function buildCard(id) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "weapon-option";
  card.dataset.weapon = id;
  card.setAttribute("aria-pressed", String(id === selectedId));
  card.classList.toggle("selected", id === selectedId);

  const figure = document.createElement("span");
  figure.className = "weapon-option-figure";

  const image = document.createElement("img");
  image.className = "weapon-option-image";
  image.alt = "";
  // Decorative: the name below it already labels the card, so announcing the
  // picture too would just read every weapon's name twice.
  image.setAttribute("aria-hidden", "true");
  figure.append(image);

  const name = document.createElement("span");
  name.className = "weapon-option-name";
  name.textContent = t(`weapon.${id}`);

  card.append(figure, name);
  card.addEventListener("click", () => select(id));

  // The card is complete and clickable before its picture arrives; the
  // figure holds its own space so nothing reflows when one lands.
  getWeaponThumbnail(id).then((url) => {
    if (url) image.src = url;
    else figure.classList.add("weapon-option-figure-empty");
  });

  return card;
}

function renderGrid() {
  grid.replaceChildren(...WEAPON_ORDER.map(buildCard));
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
