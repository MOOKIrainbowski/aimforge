// The contract every suggestion-box backend implements, and the one place
// that decides which one is in use.
//
// This used to be a comment at the bottom of store.js describing what a real
// backend "would" implement. It is a real seam now because there is about to
// be a second implementation behind it (Supabase), and the point of the seam
// is that nothing above it — not the suggestion screen, not the admin screen,
// not the sidebar badge — has to know which one answered.
//
// ---------------------------------------------------------------------------
// THE CONTRACT
// ---------------------------------------------------------------------------
//
// Every method is async and every write returns `{ ok: boolean, error? }`
// rather than throwing, because the caller's job on failure is to tell the
// player something specific, not to unwind.
//
//   get id                             -> "local" | "remote", for the UI to
//                                         say where a post actually went
//   listPosts(filter, actor)           -> Promise<Post[]>, newest first
//   createPost({category,title,body}, actor)      -> Promise<Result>
//   addComment(postId, body, {asAdmin}, actor)    -> Promise<Result>
//   setStatus(postId, status)          -> Promise<Result>
//   deletePost(postId)                 -> Promise<Result>
//   markPostRead(postId, actor)        -> Promise<Result>
//
// `actor` is `{ id, name }` — who is doing this. A local backend takes it at
// its word because there is nobody else to lie to. A remote one must not:
// authorship, `asAdmin` and deletion are authorised from the session on the
// server, and the actor passed here is a hint for optimistic rendering, never
// an authorisation claim. Validation of the *content* (lengths, categories,
// statuses) happens above this line in store.js, so both backends enforce the
// same rules and neither has to repeat them.
//
// A Post is:
//   { id, category, title, body, createdAt, authorId, authorName, status,
//     readAt, comments: [{ id, body, createdAt, byAdmin, authorId,
//     authorName }] }
//
// `readAt` is per-viewer — when *this* reader last opened the thread — which
// is why markPostRead takes an actor. The local backend can store it on the
// post because there is only ever one reader.
import { LocalBackend } from "./localBackend.js";

let current = new LocalBackend();
const listeners = new Set();

export function getBackend() {
  return current;
}

// Swapping the backend re-renders everything: posts that were local are not
// the posts that are remote, so every view has to reload rather than keep
// showing what it had. Signing in and signing out both come through here.
export function setBackend(backend) {
  current = backend ?? new LocalBackend();
  for (const listener of listeners) listener(current);
}

export function onBackendChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isRemote() {
  return current.id === "remote";
}
