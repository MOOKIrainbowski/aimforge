import { migrateKey } from "./storage.js";

const STORAGE_KEY = "aimonsite:settings";

const DEFAULT_SETTINGS = {
  sensitivity: 0.0022, // radians per pixel — matches controls.js's original built-in default
  dpi: 800,
  // Last weapon confirmed in the picker, so the choice carries between
  // sessions instead of resetting to the rifle every launch.
  weaponId: "rifle",
};

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

export function loadSettings() {
  migrateKey("settings");
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultSettings();
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return getDefaultSettings();
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable — setting just won't persist across reloads.
  }
}
