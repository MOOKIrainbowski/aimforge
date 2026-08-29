import { migrateKey } from "./storage.js";

const STORAGE_KEY = "aimonsite:crosshair";

const DEFAULT_CONFIG = {
  shape: "cross", // "cross" | "t" | "circle" | "dot"
  color: "#f2f4f8",
  size: 9, // arm length (cross/t) or radius (circle), px
  thickness: 2,
  gap: 4,
  outline: true,
  centerDot: false,
  opacity: 1,
};

export function getDefaultCrosshairConfig() {
  return { ...DEFAULT_CONFIG };
}

export function loadCrosshairConfig() {
  migrateKey("crosshair");
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultCrosshairConfig();
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return getDefaultCrosshairConfig();
  }
}

export function saveCrosshairConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage unavailable — the crosshair just won't persist, harmless.
  }
}

// Shared renderer used both by the live gameplay crosshair and the editor's
// preview element, so the two can never drift out of sync. Values feeding
// this (hex from <input type=color>, numbers from <input type=range>) are
// browser-validated, so building the SVG via a template string is safe here
// — this is never raw user-typed text.
export function renderCrosshairInto(el, config) {
  const { shape, color, size, thickness, gap, outline, centerDot, opacity } = config;
  const half = size + gap + thickness;
  const view = half * 2;
  const c = half;

  const strokePairs = (d) =>
    outline
      ? `<path d="${d}" stroke="rgba(0,0,0,0.85)" stroke-width="${thickness + 2}" stroke-linecap="round" fill="none"/>` +
        `<path d="${d}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" fill="none"/>`
      : `<path d="${d}" stroke="${color}" stroke-width="${thickness}" stroke-linecap="round" fill="none"/>`;

  let shapeMarkup = "";
  if (shape === "cross" || shape === "t") {
    const arms = [
      `M ${c + gap} ${c} L ${c + gap + size} ${c}`, // right
      `M ${c - gap} ${c} L ${c - gap - size} ${c}`, // left
      `M ${c} ${c - gap} L ${c} ${c - gap - size}`, // up
    ];
    if (shape === "cross") {
      arms.push(`M ${c} ${c + gap} L ${c} ${c + gap + size}`); // down (omitted for the classic "T")
    }
    shapeMarkup = arms.map(strokePairs).join("");
  } else if (shape === "circle") {
    shapeMarkup = outline
      ? `<circle cx="${c}" cy="${c}" r="${size}" stroke="rgba(0,0,0,0.85)" stroke-width="${thickness + 2}" fill="none"/>` +
        `<circle cx="${c}" cy="${c}" r="${size}" stroke="${color}" stroke-width="${thickness}" fill="none"/>`
      : `<circle cx="${c}" cy="${c}" r="${size}" stroke="${color}" stroke-width="${thickness}" fill="none"/>`;
  }

  const dotRadius = Math.max(1.5, thickness * 0.9);
  const dotMarkup =
    centerDot || shape === "dot"
      ? outline
        ? `<circle cx="${c}" cy="${c}" r="${dotRadius + 1}" fill="rgba(0,0,0,0.85)"/><circle cx="${c}" cy="${c}" r="${dotRadius}" fill="${color}"/>`
        : `<circle cx="${c}" cy="${c}" r="${dotRadius}" fill="${color}"/>`
      : "";

  el.innerHTML = `<svg width="${view}" height="${view}" viewBox="0 0 ${view} ${view}" style="opacity:${opacity}">${shapeMarkup}${dotMarkup}</svg>`;
  el.style.width = `${view}px`;
  el.style.height = `${view}px`;
}
