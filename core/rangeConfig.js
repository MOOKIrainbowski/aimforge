import { migrateKey } from "./storage.js";

const STORAGE_KEY = "aimonsite:rangeConfig";

// `theme` controls only the 2D UI chrome (menus/HUD/summary/etc.) — the 3D
// range's own appearance (wall/floor color, brightness) is configured
// independently below, since a player might want a light-mode UI with a
// dark range or vice versa.
const DEFAULT_CONFIG = {
  theme: "light", // "dark" | "light"
  soundEnabled: true,
  wallColor: "#ffffff",
  floorColor: "#ffffff",
  brightness: 1.0,
  fov: 96,
};

export function getDefaultRangeConfig() {
  return { ...DEFAULT_CONFIG };
}

export function loadRangeConfig() {
  migrateKey("rangeConfig");
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultRangeConfig();
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return getDefaultRangeConfig();
  }
}

export function saveRangeConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // localStorage unavailable — settings just won't persist across reloads.
  }
}
