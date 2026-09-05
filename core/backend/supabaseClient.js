import { SUPABASE_URL, SUPABASE_ANON_KEY, isConfigured } from "./config.js";

// A small Supabase client: OAuth sign-in, session keeping, and authenticated
// REST calls. About two hundred lines instead of a vendored SDK.
//
// WHY NOT THE SDK. AimonSite ships as static files with no build step and no
// dependencies it doesn't vendor — the gunshots are synthesized rather than
// sampled for the same reason. The official client is ~120KB to every
// visitor, almost none of whom will sign in, for four endpoints: authorize,
// token, the REST surface, and logout. Those four are plain HTTP and are
// written out below, where they can be read.
//
// The flow is PKCE, not implicit. The difference matters: implicit returns
// the access token in the URL fragment, where it lands in history and in
// anything that reads a URL. PKCE returns a single-use code that is worthless
// without the verifier this browser generated and never sent, so the token
// only ever exists in a response body.
//
// Everything here is a no-op when core/backend/config.js is empty, so an
// unconfigured build makes no network calls at all.
const SESSION_KEY = "aimonsite:session";
const VERIFIER_KEY = "aimonsite:pkceVerifier";

// Refresh this far before the token actually expires, so a request is never
// the thing that discovers the session died.
const REFRESH_MARGIN_MS = 60_000;

let session = null;
let refreshTimer = null;
const listeners = new Set();

function readSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(next) {
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // A browser that refuses storage still gets a working session for this
    // page's lifetime; it just won't survive a reload.
  }
}

function setSession(next) {
  session = next;
  writeSession(next);
  scheduleRefresh();
  for (const listener of listeners) listener(next);
}

export function onSessionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSession() {
  return session;
}

// ---------------------------------------------------------------------------
// PKCE
// ---------------------------------------------------------------------------

function randomVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return base64Url(bytes);
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function challengeFor(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

async function authFetch(path, { method = "GET", body, headers = {}, token } = {}) {
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error_description || data?.msg || `HTTP ${response.status}`);
    error.status = response.status;
    error.body = data;
    throw error;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

// Sends the browser to Google. Returns nothing useful — the answer arrives as
// a redirect back to `redirectTo`, which completeSignIn() below picks up.
export async function signInWithGoogle(redirectTo = window.location.href.split("#")[0].split("?")[0]) {
  if (!isConfigured()) return { ok: false, error: "unconfigured" };

  const verifier = randomVerifier();
  try {
    localStorage.setItem(VERIFIER_KEY, verifier);
  } catch {
    // Without somewhere to keep the verifier the code cannot be exchanged, so
    // this is worth failing loudly rather than bouncing through Google first.
    return { ok: false, error: "storage" };
  }

  const params = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: "s256",
  });
  window.location.assign(`${SUPABASE_URL}/auth/v1/authorize?${params}`);
  return { ok: true };
}

// Call once on load. If this page is the redirect target, swaps the code for
// a session and cleans the URL; otherwise restores whatever was stored.
export async function completeSignIn() {
  if (!isConfigured()) return null;

  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error_description") ?? url.searchParams.get("error");

  if (error) {
    // Google refused, or the user backed out. Not an app error; drop the
    // parameters so a reload doesn't replay it.
    cleanUrl(url);
    console.warn("AimonSite: sign-in was not completed —", error);
  }

  if (code) {
    const verifier = localStorage.getItem(VERIFIER_KEY);
    cleanUrl(url);
    localStorage.removeItem(VERIFIER_KEY);
    if (!verifier) return null;
    try {
      const data = await authFetch("/auth/v1/token?grant_type=pkce", {
        method: "POST",
        body: { auth_code: code, code_verifier: verifier },
      });
      setSession(sessionFrom(data));
      return session;
    } catch (err) {
      console.warn("AimonSite: could not complete sign-in", err);
      return null;
    }
  }

  const stored = readSession();
  if (!stored) return null;
  session = stored;
  // An expired stored session is refreshed before anything is allowed to use
  // it, so callers never see a token that is already dead.
  if (stored.expiresAt - Date.now() < REFRESH_MARGIN_MS) return refreshSession();
  scheduleRefresh();
  return session;
}

function cleanUrl(url) {
  for (const key of ["code", "error", "error_description", "error_code", "state"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function sessionFrom(data) {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    user: {
      id: data.user?.id ?? null,
      email: data.user?.email ?? "",
      name: data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? "",
      avatar: data.user?.user_metadata?.avatar_url ?? "",
    },
  };
}

async function refreshSession() {
  if (!session?.refreshToken) return null;
  try {
    const data = await authFetch("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refreshToken },
    });
    setSession(sessionFrom(data));
    return session;
  } catch (err) {
    // A refresh token that no longer works means the session is genuinely
    // over — signed out elsewhere, revoked, or expired past recovery.
    console.warn("AimonSite: session expired", err);
    setSession(null);
    return null;
  }
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!session) return;
  const delay = Math.max(5_000, session.expiresAt - Date.now() - REFRESH_MARGIN_MS);
  refreshTimer = setTimeout(refreshSession, delay);
}

export async function signOut() {
  const token = session?.accessToken;
  setSession(null);
  if (!token) return;
  try {
    await authFetch("/auth/v1/logout", { method: "POST", token, body: {} });
  } catch {
    // The local session is already gone, which is what the player asked for.
    // A failed server-side revoke is not something to show them.
  }
}

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

// One authenticated PostgREST call. `path` is everything after /rest/v1,
// including the query string, e.g. "/posts?select=*&order=created_at.desc".
export async function rest(path, options = {}) {
  if (!isConfigured()) throw new Error("backend not configured");
  if (session && session.expiresAt - Date.now() < REFRESH_MARGIN_MS) await refreshSession();

  return authFetch(`/rest/v1${path}`, {
    ...options,
    token: session?.accessToken ?? SUPABASE_ANON_KEY,
    headers: {
      // Writes come back as the created row so the caller doesn't have to
      // re-read to find out what the server decided.
      Prefer: options.method && options.method !== "GET" ? "return=representation" : "",
      ...options.headers,
    },
  });
}
