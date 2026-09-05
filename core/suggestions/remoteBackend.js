import { rest } from "../backend/supabaseClient.js";

// The suggestion-box contract (see backend.js) over Supabase's REST surface.
//
// Everything this file asks for, it asks for as the signed-in user, and every
// rule that matters is enforced on the server by row-level security rather
// than here — see supabase/schema.sql. In particular: authorship comes from
// auth.uid() and not from the `actor` handed in, `by_admin` is refused unless
// the account really is an admin, and deletion is admins only. Nothing below
// can grant itself any of that by asking nicely, which is the whole reason
// the admin view was worth moving off localStorage.
//
// One round trip loads a board: PostgREST embeds the comments, both authors'
// display names, and this reader's own read-marker in a single select.
const POST_SELECT =
  "id,category,title,body,status,created_at,author_id," +
  "author:profiles!posts_author_id_fkey(display_name)," +
  "comments(id,body,by_admin,created_at,author_id,author:profiles!comments_author_id_fkey(display_name))," +
  "post_reads(read_at)";

const ms = (timestamp) => (timestamp ? new Date(timestamp).getTime() : 0);

// The wire shape is snake_case rows with embedded relations; the app's shape
// is the Post in backend.js. This is the only place that knows both.
function toPost(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    createdAt: ms(row.created_at),
    authorId: row.author_id,
    authorName: row.author?.display_name ?? "",
    status: row.status,
    // post_reads is filtered by RLS to this reader's own row, so an empty
    // array means "never opened" rather than "nobody has opened it".
    readAt: ms(row.post_reads?.[0]?.read_at),
    comments: (row.comments ?? [])
      .map((comment) => ({
        id: comment.id,
        body: comment.body,
        createdAt: ms(comment.created_at),
        byAdmin: comment.by_admin,
        authorId: comment.author_id,
        authorName: comment.by_admin ? "" : (comment.author?.display_name ?? ""),
      }))
      .sort((a, b) => a.createdAt - b.createdAt),
  };
}

// PostgREST answers a violated policy with 401/403, or with an empty result
// for a write that matched no permitted row. Both mean the same thing to a
// player and get one message.
function failure(err) {
  if (err?.status === 401 || err?.status === 403) return { ok: false, error: "forbidden" };
  return { ok: false, error: "backend" };
}

export class RemoteBackend {
  get id() {
    return "remote";
  }

  async listPosts({ category = "all", status = "all", mine = false } = {}, actor) {
    const params = [`select=${POST_SELECT}`, "order=created_at.desc"];
    if (category !== "all") params.push(`category=eq.${encodeURIComponent(category)}`);
    if (status !== "all") params.push(`status=eq.${encodeURIComponent(status)}`);
    if (mine && actor?.id) params.push(`author_id=eq.${encodeURIComponent(actor.id)}`);

    const rows = await rest(`/posts?${params.join("&")}`);
    return (rows ?? []).map(toPost);
  }

  async createPost({ category, title, body }, actor) {
    if (!actor?.account) return { ok: false, error: "signin" };
    try {
      await rest("/posts", { method: "POST", body: { category, title, body, author_id: actor.id } });
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  async addComment(postId, body, { asAdmin = false } = {}, actor) {
    if (!actor?.account) return { ok: false, error: "signin" };
    try {
      await rest("/comments", {
        method: "POST",
        body: { post_id: postId, body, by_admin: asAdmin, author_id: actor.id },
      });
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }

  async setStatus(postId, status) {
    try {
      const rows = await rest(`/posts?id=eq.${encodeURIComponent(postId)}`, {
        method: "PATCH",
        body: { status },
      });
      // An update the policy refused comes back as an empty set rather than
      // an error, so an unchanged row is a refusal, not a success.
      return rows?.length ? { ok: true } : { ok: false, error: "forbidden" };
    } catch (err) {
      return failure(err);
    }
  }

  async deletePost(postId) {
    try {
      const rows = await rest(`/posts?id=eq.${encodeURIComponent(postId)}`, { method: "DELETE" });
      return rows?.length ? { ok: true } : { ok: false, error: "forbidden" };
    } catch (err) {
      return failure(err);
    }
  }

  async markPostRead(postId, actor) {
    if (!actor?.account) return { ok: false, error: "signin" };
    try {
      // Upsert: one row per (post, reader), rewritten each time it is opened.
      await rest("/post_reads", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: { post_id: postId, user_id: actor.id, read_at: new Date().toISOString() },
      });
      return { ok: true };
    } catch (err) {
      return failure(err);
    }
  }
}
