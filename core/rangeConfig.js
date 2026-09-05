import { migrateKey } from "./storage.js";

const STORAGE_KEY = "aimonsite:rangeConfig";

// `theme` controls only the 2D UI chrome (menus/HUD/summary/etc.) — the 3D
// range's own appearance (wall/floor color, brightness) is configured
// independently below, since a player might want a light-mode UI with a
// dark range or vice versa.
//
// `targetColor` lives here rather than being derived from the crosshair.
// Target colour used to be assigned from the crosshair colour at session
// start (main.js's beginSession), which meant recolouring the crosshair
// silently recoloured every target too and the two could not be set apart —
// exactly backwards for contrast, since a crosshair usually wants to stand
// out *against* the targets.
// `magazineLimit` off is the default: this is an aim trainer first, and
// having a session interrupted by a reload is a cost most drills should not
// pay. Switched on, every weapon runs its real magazine, reload and dry-fire
// behaviour. Note it removes only the ammunition bookkeeping — rate of fire,
// the bolt/pump cycle and firing accuracy are unaffected, since those are
// what distinguish the weapons from each other.
const DEFAULT_CONFIG = {
  theme: "light", // "dark" | "light"
  soundEnabled: true,
  magazineLimit: false,
  wallColor: "#ffffff",
  floorColor: "#ffffff",
  targetColor: "#ff5c5c",
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
