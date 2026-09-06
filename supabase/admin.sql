-- AimonSite — granting and revoking admin.
--
-- Admin is one boolean in one row: public.profiles.is_admin. It is set here,
-- in the SQL editor, and nowhere else. That is deliberate and it is the whole
-- security model for moderation:
--
--   * The app is static files. Anything the client is trusted to decide, it
--     can be made to lie about, so it decides nothing about who moderates.
--   * schema.sql revokes UPDATE on public.profiles from `authenticated` and
--     grants it back on the display_name column alone. A column privilege,
--     not a policy — a policy can only say which *rows* you may touch, never
--     which columns — so no signed-in account can write is_admin, including
--     its own, no matter what it sends.
--   * public.is_admin() reads that column, and the policies on posts and
--     comments call it. So the server decides what an admin may do, every
--     time, from the database rather than from anything the browser claims.
--
-- Which means: there is no first-user promotion, no invite link, and nothing
-- to reach from inside the app. Granting admin is a person with database
-- access typing an address. Run any block below on its own.
--
--   Supabase dashboard -> SQL Editor -> New query -> paste -> Run
--
-- The account must exist first: sign in through the app once with the address
-- being promoted, otherwise there is no row to update and the grant reports
-- 0 rows. Re-running any of this is safe.

-- ---------------------------------------------------------------------------
-- Grant
-- ---------------------------------------------------------------------------
-- Change the address and run. `returning` is what tells you it worked: one
-- row back means done, no rows means that address has never signed in.

update public.profiles p
   set is_admin = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('code.rainbow.ski@gmail.com')
returning p.id, u.email, p.is_admin;

-- ---------------------------------------------------------------------------
-- Revoke
-- ---------------------------------------------------------------------------
-- The same statement with false. Worth knowing it exists before you need it.

-- update public.profiles p
--    set is_admin = false
--   from auth.users u
--  where u.id = p.id
--    and lower(u.email) = lower('someone@example.com')
-- returning p.id, u.email, p.is_admin;

-- ---------------------------------------------------------------------------
-- Who is an admin right now
-- ---------------------------------------------------------------------------
-- Run this after any change. It is the only honest answer to "am I an admin"
-- — the app reads this same column on every sign-in and never caches it.

-- select u.email, p.display_name, p.is_admin, p.created_at
--   from public.profiles p
--   join auth.users u on u.id = p.id
--  where p.is_admin
--  order by p.created_at;

-- ---------------------------------------------------------------------------
-- Everyone who has ever signed in
-- ---------------------------------------------------------------------------
-- For when you have the wrong spelling of an address and the grant above
-- came back with 0 rows.

-- select u.email, p.display_name, p.is_admin, u.created_at
--   from auth.users u
--   left join public.profiles p on p.id = u.id
--  order by u.created_at desc;

-- ---------------------------------------------------------------------------
-- Taking effect
-- ---------------------------------------------------------------------------
-- The app reads is_admin from the profile row each time it loads a session
-- (core/auth.js, loadProfile) rather than remembering it, because it is an
-- authorisation fact and this is a client. So a grant lands on the promoted
-- account's next page load — no sign-out required, though a reload is.
