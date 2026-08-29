// One-time migration for the AimForge -> AimonSite rename: each storage
// module's load function calls migrateKey(suffix) before reading its own
// aimonsite:<suffix> key, so anyone who used the site under the old name
// doesn't silently lose their saved stats/settings/crosshair/language.
const OLD_PREFIX = "aimforge:";
const NEW_PREFIX = "aimonsite:";

export function migrateKey(suffix) {
  try {
    const newKey = NEW_PREFIX + suffix;
    if (localStorage.getItem(newKey) !== null) return;
    const oldKey = OLD_PREFIX + suffix;
    const oldValue = localStorage.getItem(oldKey);
    if (oldValue !== null) {
      localStorage.setItem(newKey, oldValue);
      localStorage.removeItem(oldKey);
    }
  } catch {
    // localStorage unavailable — nothing to migrate.
  }
}
