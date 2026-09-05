import { migrateKey } from "../storage.js";

// The localStorage implementation of the suggestion-box backend contract
// (see backend.js). This is what AimonSite has always run on, lifted out of
// store.js unchanged in behaviour so a second implementation can sit beside
// it rather than replace it.
//
// It stays the fallback forever, not a stepping stone: a player with no
// account, no network, or a browser that blocks third-party anything still
// gets a working suggestion box. It is local to one browser — a post written
// here is not delivered anywhere — which is exactly why the remote backend
// exists, and exactly why this one has to keep working when that is
// unreachable.
const STORAGE_KEY = "aimonsite:suggestions";

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

function readAll() {
  migrateKey("suggestions");
  const store = readJson(STORAGE_KEY, null);
  if (!store || !Array.isArray(store.posts)) return { version: 1, posts: [] };
  return store;
}

function writeAll(store) {
  return writeJson(STORAGE_KEY, store);
}

export class LocalBackend {
  // Named so the UI can say where a post went without knowing what it is
  // talking to.
  get id() {
    return "local";
  }

  async listPosts({ category = "all", status = "all", mine = false } = {}, actor) {
    return readAll()
      .posts.filter((post) => {
        if (category !== "all" && post.category !== category) return false;
        if (status !== "all" && post.status !== status) return false;
        if (mine && post.authorId !== actor.id) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async createPost({ category, title, body }, actor) {
    const store = readAll();
    store.posts.push({
      id: newId(),
      category,
      title,
      body,
      createdAt: Date.now(),
      authorId: actor.id,
      authorName: actor.name || "",
      status: "open",
      comments: [],
      // When this browser last opened the thread; anything an admin posts
      // after it counts as an unread reply.
      readAt: Date.now(),
    });
    return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
  }

  async addComment(postId, body, { asAdmin = false } = {}, actor) {
    const store = readAll();
    const post = store.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: "missing" };

    post.comments.push({
      id: newId(),
      body,
      createdAt: Date.now(),
      byAdmin: Boolean(asAdmin),
      authorId: asAdmin ? "admin" : actor.id,
      authorName: asAdmin ? "" : actor.name || "",
    });
    // The author is reading their own thread as they reply, so only an admin
    // comment should be able to leave it unread for them.
    if (!asAdmin && post.authorId === actor.id) post.readAt = Date.now();
    return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
  }

  async setStatus(postId, status) {
    const store = readAll();
    const post = store.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: "missing" };
    post.status = status;
    return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
  }

  async deletePost(postId) {
    const store = readAll();
    const index = store.posts.findIndex((p) => p.id === postId);
    if (index === -1) return { ok: false, error: "missing" };
    store.posts.splice(index, 1);
    return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
  }

  async markPostRead(postId) {
    const store = readAll();
    const post = store.posts.find((p) => p.id === postId);
    if (!post) return { ok: false, error: "missing" };
    post.readAt = Date.now();
    return writeAll(store) ? { ok: true } : { ok: false, error: "storage" };
  }
}
