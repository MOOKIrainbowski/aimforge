import { migrateKey } from "../storage.js";

// Storage and rules for the suggestion box and the admin view built on top
// of it.
//
// SCOPE, STATED PLAINLY: AimonSite ships as static files with no server and
// no accounts (that is the product's whole pitch — "your stats never leave
// your device"). So this store is localStorage-backed, which means posts,
// replies and notifications are real and persistent, but they are real *on
// this browser*: a suggestion written here is not delivered anywhere, and
// the admin view below is a UI role, not an authenticated one. Anyone who
// opens devtools can flip the flag.
//
// The data shape and every call below is deliberately async and
// backend-shaped so this becomes a genuine multi-user feature the day there
// is somewhere to talk to: swap the read/write pair in `backend` for fetch()
// calls against a real API and nothing above this file has to change. See
// `RemoteBackend` at the bottom for the contract that adapter must meet.
const STORAGE_KEY = "aimonsite:suggestions";
const IDENTITY_KEY = "aimonsite:identity";
const ADMIN_KEY = "aimonsite:adminMode";

export const MAX_BODY_LENGTH = 1000;
export const MAX_TITLE_LENGTH = 120;

export const CATEGORIES = ["suggestion", "bug"];
export const STATUSES = ["open", "planned", "resolved", "declined"];

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    // localStorage unavailable (private browsing, quota) — the caller gets
    // `false` and surfaces it rather than silently losing the post.
    return false;
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// A per-browser pseudonymous id so "my posts", the unread-reply badge and
// authorship all work without an account. No email, no tracking, never
// leaves the device.
export function getIdentity() {
  migrateKey("identity");
  let identity = readJson(IDENTITY_KEY, null);
  if (!identity || !identity.id) {
    identity = { id: newId(), name: "" };
    writeJson(IDENTITY_KEY, identity);
  }
  return identity;
}

export function setDisplayName(name) {
  const identity = getIdentity();
  identity.name = String(name ?? "").slice(0, 40);
  writeJson(IDENTITY_KEY, identity);
  return identity;
}

export function isAdmin() {
  try {
    return localStorage.getItem(ADMIN_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdmin(enabled) {
  try {
    if (enabled) localStorage.setItem(ADMIN_KEY, "1");
    else localStorage.removeItem(ADMIN_KEY);
  } catch {
    // Nothing to do — the admin view just won't persist across reloads.
  }
  notify();
}

const listeners = new Set();

export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notify() {
  for (const cb of listeners) cb();
}

function readAll() {
  migrateKey("suggestions");
  const store = readJson(STORAGE_KEY, null);
  if (!store || !Array.isArray(store.posts)) return { version: 1, posts: [] };
  return store;
}

function writeAll(store) {
  const ok = writeJson(STORAGE_KEY, store);
  if (ok) notify();
  return ok;
}

function clampBody(text) {
  return String(text ?? "").trim().slice(0, MAX_BODY_LENGTH);
}

export function listPosts({ category = "all", status = "all", mine = false } = {}) {
  const me = getIdentity().id;
  return readAll()
    .posts.filter((post) => {
      if (category !== "all" && post.category !== category) return false;
      if (status !== "all" && post.status !== status) return false;
      if (mine && post.authorId !== me) return false;
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function getPost(id) {
  return readAll().posts.find((post) => post.id === id) ?? null;
}

export function createPost({ category, title, body }) {
  const trimmedTitle = String(title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
  const trimmedBody = clampBody(body);
  if (!trimmedTitle || !trimmedBody) return { ok: false, error: "empty" };
  if (!CATEGORIES.includes(category)) return { ok: false, error: "category" };

  const identity = getIdentity();
  const store = readAll();
  store.posts.push({
    id: newId(),
    category,
    title: trimmedTitle,
    body: trimmedBody,
    createdAt: Date.now(),
    authorId: identity.id,
    authorName: identity.name || "",
    status: "open",
    comments: [],
    // Timestamp of the last time the author opened this thread; anything an
    // admin posts after it counts as an unread reply.
    readAt: Date.now(),
  });
  return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
}

export function addComment(postId, body, { asAdmin = false } = {}) {
  const trimmed = clampBody(body);
  if (!trimmed) return { ok: false, error: "empty" };

  const identity = getIdentity();
  const store = readAll();
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return { ok: false, error: "missing" };

  post.comments.push({
    id: newId(),
    body: trimmed,
    createdAt: Date.now(),
    byAdmin: Boolean(asAdmin),
    authorId: asAdmin ? "admin" : identity.id,
    authorName: asAdmin ? "" : identity.name || "",
  });
  // The author is reading their own thread as they reply, so only an admin
  // comment should be able to leave it unread for them.
  if (!asAdmin && post.authorId === identity.id) post.readAt = Date.now();
  return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
}

export function setStatus(postId, status) {
  if (!STATUSES.includes(status)) return { ok: false, error: "status" };
  const store = readAll();
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return { ok: false, error: "missing" };
  post.status = status;
  return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
}

export function deletePost(postId) {
  const store = readAll();
  const index = store.posts.findIndex((p) => p.id === postId);
  if (index === -1) return { ok: false, error: "missing" };
  store.posts.splice(index, 1);
  return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
}

export function markPostRead(postId) {
  const store = readAll();
  const post = store.posts.find((p) => p.id === postId);
  if (!post) return;
  post.readAt = Date.now();
  writeAll(store);
}

// Posts this browser authored that have an admin reply newer than the last
// time the author opened the thread. Drives the sidebar's notification dot.
export function getUnreadReplies() {
  const me = getIdentity().id;
  return readAll().posts.filter(
    (post) =>
      post.authorId === me &&
      post.comments.some((comment) => comment.byAdmin && comment.createdAt > (post.readAt ?? 0))
  );
}

// Posts an admin hasn't answered yet — the admin view's own "needs
// attention" count.
export function getUnansweredCount() {
  return readAll().posts.filter(
    (post) => post.status === "open" && !post.comments.some((comment) => comment.byAdmin)
  ).length;
}

// The contract a real backend would implement to replace localStorage here.
// Kept as documentation rather than a stub implementation so there is no
// dead abstraction layer to maintain until it's actually needed:
//
//   listPosts(filter)            -> Promise<Post[]>
//   createPost({category,title,body}) -> Promise<{ok, error?}>
//   addComment(postId, body, {asAdmin}) -> Promise<{ok, error?}>
//   setStatus(postId, status)    -> Promise<{ok, error?}>
//   deletePost(postId)           -> Promise<{ok, error?}>
//
// Server-side, `asAdmin` and deletion must be authorised from a session, not
// taken from the client's word — the localStorage flag above is a view
// toggle only and carries no authority.
