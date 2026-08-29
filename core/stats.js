const STORAGE_KEY = "aimforge:sessions";
const SCHEMA_VERSION = 1;
const MAX_SESSIONS = 500;

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: SCHEMA_VERSION, sessions: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sessions)) return { version: SCHEMA_VERSION, sessions: [] };
    return parsed;
  } catch {
    return { version: SCHEMA_VERSION, sessions: [] };
  }
}

function writeStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full or unavailable (e.g. private browsing) — stats just
    // won't persist this session; nothing in gameplay depends on the write
    // succeeding.
  }
}

export function saveSession(result) {
  const store = readStore();
  store.sessions.push(result);
  if (store.sessions.length > MAX_SESSIONS) {
    store.sessions = store.sessions.slice(store.sessions.length - MAX_SESSIONS);
  }
  writeStore(store);
}

export function getAllSessions() {
  return readStore().sessions;
}

export function getSessionsByMode(mode) {
  return getAllSessions().filter((s) => s.mode === mode);
}

export function getAggregateStats(mode) {
  const sessions = getSessionsByMode(mode);
  if (sessions.length === 0) {
    return { count: 0, bestScore: 0, avgAccuracy: 0 };
  }
  const bestScore = Math.max(...sessions.map((s) => s.score));
  const avgAccuracy = sessions.reduce((sum, s) => sum + s.accuracy, 0) / sessions.length;
  return { count: sessions.length, bestScore, avgAccuracy };
}

export function clearHistory() {
  writeStore({ version: SCHEMA_VERSION, sessions: [] });
}
