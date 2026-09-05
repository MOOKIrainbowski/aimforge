// Where the backend lives. Empty means there isn't one, and AimonSite runs
// exactly as it always has: local suggestion box, no sign-in button, no
// network calls made or attempted.
//
// Both values below are *publishable*. The anon key is designed to ship in a
// client — it identifies the project, not a person, and grants nothing on its
// own. Every table it can reach is protected by row-level security, which is
// evaluated against the signed-in user's JWT on the server. See
// supabase/schema.sql for the policies that do the actual protecting, and
// supabase/README.md for how to fill these in.
//
// What must NEVER go here: the `service_role` key. That one bypasses RLS
// entirely, and this file is served to every visitor.
// The bare project URL, with no path and no trailing slash: this client adds
// `/auth/v1/...` and `/rest/v1/...` itself, so anything past .co here ends up
// duplicated in every request.
export const SUPABASE_URL = "https://ldjkfvhotlyounncgxoj.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_Ewa74pTVz4RfEPg6KfRk9Q_Ma-MdXAR";

// The one admin bootstrap that cannot come from the client: an account is an
// admin because its `profiles.is_admin` column says so, set once by hand in
// the SQL editor. The app never writes that column — see the schema.
export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
