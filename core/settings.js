const STORAGE_KEY = "aimforge:settings";

const DEFAULT_SETTINGS = {
  sensitivity: 0.0022, // radians per pixel — matches controls.js's original built-in default
  dpi: 800,
};

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

export function loadSettings() {
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
