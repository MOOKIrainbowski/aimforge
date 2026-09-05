import { migrateKey } from "../storage.js";
import { getBackend, onBackendChange, isRemote } from "./backend.js";

// The suggestion box's rules, and the identity a post is written under.
// Where posts are actually kept is backend.js's business — this file decides
// what a valid post is, who is writing it, and what the rest of the app is
// allowed to ask for.
//
// Everything that touches storage is async. That is not speculative: the
// local backend resolves immediately, but a remote one cannot, and having
// the callers already written for a promise is what lets the two swap under
// them without a second rewrite of the screens.
const IDENTITY_KEY = "aimonsite:identity";
const ADMIN_KEY = "aimonsite:adminMode";

export { isRemote, onBackendChange } from "./backend.js";

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
    return false;
  }
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// The signed-in account, when there is one. Set by core/auth.js; null means
// this browser is posting as itself.
let account = null;

export function setAccount(next) {
  account = next;
  notify();
}

export function getAccount() {
  return account;
}

// Who a post is written as. An account wins when there is one; otherwise a
// per-browser pseudonymous id, so "my posts", the unread-reply badge and
// authorship all work without one. That local id is no email and no
// tracking, and never leaves the device.
export function getIdentity() {
  if (account) return { id: account.id, name: account.name, account: true };

  migrateKey("identity");
  let identity = readJson(IDENTITY_KEY, null);
  if (!identity || !identity.id) {
    identity = { id: newId(), name: "" };
    writeJson(IDENTITY_KEY, identity);
  }
  return { ...identity, account: false };
}

export function setDisplayName(name) {
  const identity = readJson(IDENTITY_KEY, null) ?? { id: newId(), name: "" };
  identity.name = String(name ?? "").slice(0, 40);
  writeJson(IDENTITY_KEY, identity);
  return identity;
}

// Local admin view toggle, entered via `?admin=1`. It carries no authority:
// with a remote backend the server decides what an admin may do, and this
// only decides whether the moderation screen is on screen. See
// core/suggestions/backend.js.
export function isAdmin() {
  if (account) return Boolean(account.admin);
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

// A backend swap is as much a change to what is on screen as a new post is.
onBackendChange(notify);

function clampBody(text) {
  return String(text ?? "").trim().slice(0, MAX_BODY_LENGTH);
}

// Both backends are handed content that is already valid, so neither has to
// re-implement these rules and they cannot drift apart.
export async function listPosts(filter = {}) {
  try {
    return await getBackend().listPosts(filter, getIdentity());
  } catch (err) {
    console.warn("AimonSite: could not load suggestions", err);
    return [];
  }
}

export async function getPost(id) {
  const posts = await listPosts({});
  return posts.find((post) => post.id === id) ?? null;
}

export async function createPost({ category, title, body }) {
  const trimmedTitle = String(title ?? "").trim().slice(0, MAX_TITLE_LENGTH);
  const trimmedBody = clampBody(body);
  if (!trimmedTitle || !trimmedBody) return { ok: false, error: "empty" };
  if (!CATEGORIES.includes(category)) return { ok: false, error: "category" };

  const result = await guard(() =>
    getBackend().createPost({ category, title: trimmedTitle, body: trimmedBody }, getIdentity())
  );
  if (result.ok) notify();
  return result;
}

export async function addComment(postId, body, { asAdmin = false } = {}) {
  const trimmed = clampBody(body);
  if (!trimmed) return { ok: false, error: "empty" };

  const result = await guard(() => getBackend().addComment(postId, trimmed, { asAdmin }, getIdentity()));
  if (result.ok) notify();
  return result;
}

export async function setStatus(postId, status) {
  if (!STATUSES.includes(status)) return { ok: false, error: "status" };
  const result = await guard(() => getBackend().setStatus(postId, status));
  if (result.ok) notify();
  return result;
}

export async function deletePost(postId) {
  const result = await guard(() => getBackend().deletePost(postId));
  if (result.ok) notify();
  return result;
}

export async function markPostRead(postId) {
  const result = await guard(() => getBackend().markPostRead(postId, getIdentity()));
  if (result.ok) notify();
  return result;
}

// A backend that throws — an offline fetch, a rejected write — must reach the
// caller as the same `{ ok: false, error }` a refused write does, since the
// screens have exactly one way of reporting that something didn't save.
async function guard(fn) {
  try {
    return (await fn()) ?? { ok: false, error: "backend" };
  } catch (err) {
    console.warn("AimonSite: suggestion write failed", err);
    return { ok: false, error: "backend" };
  }
}

// Posts this reader authored that have an admin reply newer than the last
// time they opened the thread. Drives the sidebar's notification dot.
export async function getUnreadReplies() {
  const me = getIdentity().id;
  const posts = await listPosts({});
  return posts.filter(
    (post) =>
      post.authorId === me &&
      post.comments.some((comment) => comment.byAdmin && comment.createdAt > (post.readAt ?? 0))
  );
}

// Posts an admin hasn't answered yet — the admin view's own "needs
// attention" count.
export async function getUnansweredCount() {
  const posts = await listPosts({});
  return posts.filter((post) => post.status === "open" && !post.comments.some((c) => c.byAdmin)).length;
}
