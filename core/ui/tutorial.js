import { t } from "../i18n.js";

// A guided first run: what this site is, and where each part of it lives.
//
// It points at the real screen rather than describing it in prose somewhere
// else. Each step spotlights an element that is actually there and says what
// it does, so the thing being explained and the thing being looked at are the
// same thing — and so the tour cannot drift out of date without the selector
// underneath it breaking, which is loud rather than silent.
//
// Shown once, on a first visit, and reachable from the sidebar forever after.
// It never appears over a session: it runs from the home screen only, and
// main.js is what decides when that is true.
const SEEN_KEY = "aimonsite:tutorialSeen";

// `target` is a selector on the home screen, or null for a step that is about
// the whole thing rather than one corner of it. `pad` widens the spotlight
// where a tight ring around the element would read as a highlight on its
// border rather than on the element.
const STEPS = [
  { key: "welcome", target: null },
  { key: "drills", target: ".home-mode-grid", pad: 8 },
  { key: "tune", target: ".home-config", pad: 8 },
  { key: "range", target: "#home-start", pad: 6 },
  { key: "personalise", target: ".sidebar-nav", pad: 6 },
  { key: "progress", target: "#home-history", pad: 4 },
  { key: "account", target: ".sidebar-footer", pad: 6 },
];

const overlay = document.getElementById("tutorial");
const spotlight = document.getElementById("tutorial-spotlight");
const card = document.getElementById("tutorial-card");
const titleEl = document.getElementById("tutorial-title");
const bodyEl = document.getElementById("tutorial-body");
const countEl = document.getElementById("tutorial-count");
const backButton = document.getElementById("tutorial-back");
const nextButton = document.getElementById("tutorial-next");
const skipButton = document.getElementById("tutorial-skip");

let index = 0;
let onClose = () => {};

function hasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // A browser that refuses storage gets the tour every time, which is the
    // safe way round: a first-time visitor who is shown it twice has lost
    // nothing, one who is never shown it has lost the tour.
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Nothing to do — it will offer itself again next visit.
  }
}

// The card goes on whichever side of the spotlight has the most room, and is
// then clamped into the viewport.
//
// One rule rather than a list of cases, and it gives the obvious answer
// wherever there is one — under a button, beside a rail down the left edge.
// Its real value is where there isn't: a highlight too tall for the card to
// clear leaves nowhere that does not overlap, and "most room" is the
// placement that covers the least of the thing being explained. Centring on
// the target, which is the tempting fallback, covers exactly the middle of
// it.
const GAP = 14;
const EDGE = 12;
// A card shorter than this is not worth showing; below it, let the card
// overlap rather than reduce it to a scrolling slit.
const MIN_CARD = 180;

function placeCard(rect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const [side, room] = [
    ["below", vh - rect.bottom],
    ["above", rect.top],
    ["right", vw - rect.right],
    ["left", rect.left],
  ].sort((a, b) => b[1] - a[1])[0];

  // Capped to the room on that side before it is measured, so a card that is
  // taller than the gap it is going into scrolls its own text rather than
  // spilling back over the highlight. Without this, "most room" still leaves
  // an overlap wherever the most room is not quite enough — which is exactly
  // the case that made the placement worth thinking about.
  const vertical = side === "below" || side === "above";
  card.style.maxHeight = `${Math.max(MIN_CARD, (vertical ? room - GAP : vh) - EDGE * 2)}px`;

  const cardWidth = card.offsetWidth;
  const cardHeight = card.offsetHeight;
  const clampX = (value) => Math.max(EDGE, Math.min(value, vw - cardWidth - EDGE));
  const clampY = (value) => Math.max(EDGE, Math.min(value, vh - cardHeight - EDGE));

  if (vertical) {
    card.style.left = `${clampX(rect.left + rect.width / 2 - cardWidth / 2)}px`;
    card.style.top = `${clampY(side === "below" ? rect.bottom + GAP : rect.top - GAP - cardHeight)}px`;
    return;
  }
  card.style.left = `${clampX(side === "right" ? rect.right + GAP : rect.left - GAP - cardWidth)}px`;
  card.style.top = `${clampY(rect.top + rect.height / 2 - cardHeight / 2)}px`;
}

function render() {
  const step = STEPS[index];
  titleEl.textContent = t(`tutorial.${step.key}.title`);
  bodyEl.textContent = t(`tutorial.${step.key}.body`);
  countEl.textContent = `${index + 1} / ${STEPS.length}`;
  backButton.disabled = index === 0;
  nextButton.textContent = t(index === STEPS.length - 1 ? "tutorial.done" : "tutorial.next");

  const element = step.target ? document.querySelector(step.target) : null;
  // With nothing to ring there is no shadow casting the dim, so the overlay
  // carries it for that step instead.
  overlay.classList.toggle("tutorial-dim", !element);
  if (!element) {
    spotlight.classList.add("hidden");
    card.style.maxHeight = `${window.innerHeight - EDGE * 2}px`;
    card.style.left = `${(window.innerWidth - card.offsetWidth) / 2}px`;
    card.style.top = `${(window.innerHeight - card.offsetHeight) / 2}px`;
    return;
  }

  // The dashboard scrolls, so a target further down the page has to be
  // brought into view before it can be measured — the rect is only true
  // where the element currently is.
  element.scrollIntoView({ block: "center", inline: "nearest" });
  const rect = element.getBoundingClientRect();
  const pad = step.pad ?? 6;
  const box = {
    left: rect.left - pad,
    top: rect.top - pad,
    right: rect.right + pad,
    bottom: rect.bottom + pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  spotlight.classList.remove("hidden");
  spotlight.style.left = `${box.left}px`;
  spotlight.style.top = `${box.top}px`;
  spotlight.style.width = `${box.width}px`;
  spotlight.style.height = `${box.height}px`;
  // Measured here rather than read back off the spotlight: the ring slides
  // between steps, so its own rectangle is still the *previous* step's for
  // the length of that transition, and the card would be placed against the
  // element it has just finished explaining.
  placeCard(box);
}

function go(delta) {
  const next = index + delta;
  if (next < 0) return;
  if (next >= STEPS.length) {
    close();
    return;
  }
  index = next;
  render();
}

export function showTutorial() {
  index = 0;
  overlay.classList.remove("hidden");
  // Rendered after the overlay is visible, because a hidden card measures
  // zero and every position here is derived from its size.
  render();
  nextButton.focus();
}

function close() {
  markSeen();
  overlay.classList.add("hidden");
  onClose();
}

export function initTutorial({ onClose: closeCallback } = {}) {
  onClose = closeCallback ?? (() => {});

  backButton.addEventListener("click", () => go(-1));
  nextButton.addEventListener("click", () => go(1));
  skipButton.addEventListener("click", close);

  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowRight") go(1);
    else if (e.key === "ArrowLeft") go(-1);
    else return;
    e.preventDefault();
  });

  // A resized window moves everything the spotlight is measured against.
  window.addEventListener("resize", () => {
    if (!overlay.classList.contains("hidden")) render();
  });
}

// True the first time somebody opens the app. main.js asks this once, on the
// home screen, and never again after the tour has been through.
export function shouldOfferTutorial() {
  return !hasSeen();
}
