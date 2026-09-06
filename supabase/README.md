# Backend setup

> 한국어 상세 안내: [README.ko.md](./README.ko.md) — 화면 단위로 더 자세히,
> 자주 겪는 오류와 해결까지 포함한 판입니다.

AimonSite works with no backend at all: the suggestion box falls back to this
browser's localStorage and no sign-in button is shown. Everything below is
what turns that into a shared board with real accounts.

It is about fifteen minutes of clicking, once. Nothing here needs a build
step, a server, or a secret in the repository.

## 1. Create the project

1. Sign in at <https://supabase.com> and create a project. Any region; the
   free tier is enough.
2. Open **SQL Editor** and run [`schema.sql`](./schema.sql) in full. It is
   re-runnable, so applying it again later is safe.

## 2. Let Google sign people in

1. In the [Google Cloud console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** of type *Web application*.
2. As the **authorised redirect URI**, use the callback Supabase shows you
   under *Authentication → Providers → Google*. It looks like
   `https://<project-ref>.supabase.co/auth/v1/callback`.
3. Paste the client ID and secret into that Supabase page and enable the
   provider.
4. Under *Authentication → URL Configuration*, add the addresses the app is
   served from to **Redirect URLs** — the deployed site, and
   `http://localhost:8123/app/index.html` if you want sign-in to work while
   developing.

## 3. Point the app at it

In Supabase, *Project Settings → API* gives you two values. Put them in
[`core/backend/config.js`](../core/backend/config.js):

```js
export const SUPABASE_URL = "https://<project-ref>.supabase.co";
export const SUPABASE_ANON_KEY = "<the anon / public key>";
```

Both are meant to be public — the anon key identifies the project, not a
person, and grants nothing on its own. Every table it can reach is behind
row-level security evaluated against the signed-in user's token.

**Never put the `service_role` key here.** That one bypasses RLS, and this
file is served to every visitor.

## 4. Admins

Admin is one boolean in one row — `public.profiles.is_admin` — and it is set
in the SQL editor, never from the app. [`admin.sql`](./admin.sql) holds every
statement you need: grant, revoke, list the current admins, and list everyone
who has ever signed in (for when a grant comes back with 0 rows because the
address was spelled differently).

To grant, sign in through the app once with the address being promoted so the
account exists, then run this with that address:

```sql
update public.profiles p
   set is_admin = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('you@example.com')
returning p.id, u.email, p.is_admin;
```

The `returning` line is the point: one row back means it worked, no rows means
that address has never signed in. Revoking is the same statement with `false`.

It lands on the next page load. `core/auth.js` re-reads `is_admin` from the
profile every time it loads a session rather than remembering it, because it
is an authorisation fact and this is a client — so no sign-out is needed,
though a reload is.

Why it is only ever done here: there is no first-user promotion, no invite
link, and nothing in the client that can reach this column. `schema.sql`
revokes `update` on `profiles` from `authenticated` and grants it back on
`display_name` alone — a column privilege, because a policy can only say
which *rows* you may touch, never which columns. That one line is what stops
a signed-in account promoting itself.

## What signing in changes

Suggestions become yours rather than this browser's — posted under your name,
answerable from anywhere you sign in — and an admin account gets the
moderation screen for real rather than as a local view toggle.

Drill stats are untouched: sessions, history and settings stay in
localStorage, on the machine that made them, signed in or not.

## Verifying it

`node tools/debug_auth.js` covers everything AimonSite owns — the PKCE
handshake, session persistence and refresh, the remote board, and refused
writes — against a mocked Supabase, so it runs with no project at all.

What it cannot check is whether the policies in `schema.sql` are actually
applied to your project. Those are worth confirming by hand once, from the
browser console of a signed-in session:

```js
// Should return an empty array or an error, never a promoted account.
await (await import("/core/backend/supabaseClient.js"))
  .rest("/profiles?id=eq.<your-user-id>", { method: "PATCH", body: { is_admin: true } });
```

If that succeeds, the column grant in `schema.sql` did not apply and anyone
can make themselves an admin.
