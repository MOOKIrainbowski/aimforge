# AimonSite — working log

A running record of what has been asked for, what was built, and what is
still open. Updated at the end of each working session so the next one
starts with context instead of re-deriving it.

---

## Session — 2026-08-30

### Asked for

A batch of fixes and additions:

**Fixes** — screen stutter on fast view rotation; replace the sniper model;
bigger elimination particles; more varied gunfire/kill sounds; bigger,
lower weapon; weapon centred under the scope when aiming; separate the
target colour from the crosshair colour.

**Additions** — admin page; suggestion box with notifications; more weapon
types from the supplied poly.pizza links; per-weapon characteristics;
weapon selection popup on entering the game; sidebar; better recoil
animation; ejected-casing animation.

### What was done

**Stutter (`core/controls.js`).** Measured first: rendering costs 0.05–0.3 ms
a frame with 9 draw calls and no shader-program churn, so it was never a
throughput problem. The cause is input timing, and the fix is threefold —
input is now sampled on `pointerrawupdate` (unthrottled, full-rate) and
*applied* once per rendered frame instead of inside the event handler, so
each frame consumes exactly the input that accrued since the last one;
implausible single samples (>900px, the known Chromium pointer-lock spike)
are dropped rather than rotated through; and yaw wraps to ±π. `flush()` is
called before a shot resolves so deferring input costs no click accuracy.
Wide FOV amplifies the judder, which is why it showed up on big swings.

**Weapons.** New `core/weapons.js` catalogue is the single source of truth
for all eight weapons (pistol, revolver, SMG, rifle, carbine, shotgun,
breacher, sniper). `core/weaponRuntime.js` owns ammo, rate of fire, the
bolt/pump cycle, reloads, and pellet-cone generation. Characteristics are
real: shotguns fire 9–12 pellets in a cone, the sniper must work its bolt
between shots, automatics fire while held, semis are click-limited.

**Models.** All seven new `.glb` files pulled from the supplied poly.pizza
links; sniper replaced. Barrel-axis orientation was measured per file (the
two source pipelines disagree) rather than assumed — see `modelYaw`.

**Viewmodel (`core/weaponModel.js`).** Rebuilt: per-weapon size and pose,
damped-spring recoil (impulses stack under sustained fire instead of
restarting a fixed animation), bolt/pump and reload animations, and
FOV-compensated placement so ADS no longer balloons the gun — it now tucks
centred directly under the scope lens, derived from the lens radius and each
model's own height.

**Casings (`core/casings.js`).** Brass ejects from the ejection port, arcs,
tumbles, bounces once and settles on the floor. Bolt/pump weapons eject when
the action is worked, not at the shot.

**Effects.** Particles are ~2.5× bigger with a flash, gravity and the
destroyed target's own colour. Sounds are per-weapon (three layers built
from each weapon's `sound` block) with per-shot detuning, plus four rotating
kill sounds and new reload/cycle/dry-fire sounds.

**Target colour.** Was assigned from the crosshair colour at session start,
which is why the two moved together. Now its own persisted setting under
Settings.

**UI.** Sidebar replaces the top nav (History, Crosshair, Sensitivity,
Suggestion Box, Admin, Settings). Weapon picker moved to a popup on the way
into the range. New ammo/action HUD.

**Suggestion box + admin.** `core/suggestions/store.js` plus two screens:
post suggestions or error reports (1,000-char limit), comment, and get a
sidebar notification when an admin replies. Admin can reply, set status, and
delete.

### Known limitation, stated deliberately

The suggestion box and admin page are **localStorage-backed**. AimonSite
ships as static files with no server and no accounts, so posts are real and
persistent but local to one browser: a suggestion is not delivered anywhere,
and "admin" (entered via `?admin=1`) is a view role, not an authenticated
one. The store is written backend-shaped so swapping in a real API is a
change to one file — the contract is documented at the bottom of
`core/suggestions/store.js`. Making this genuinely multi-user needs a
backend decision (host, database, auth) that hasn't been made yet.

### Verification

`tools/debug_weapons.js` covers the picker, rate of fire, magazine/reload,
the bolt cycle, pellet cones, hit accounting, effect cleanup, and a live
pointer-locked session through main.js's own firing pipeline — all passing.
`tools/debug_all_modes.js` runs all four drills with zero page errors.

---

## Session — 2026-09-05

Three stages, each verified and deployed before the next began.

### Stage 1 — finished and shipped the work already in the tree

A large uncommitted change was sitting in the working tree: per-weapon
firing accuracy (a hip/ADS base error blended by aim progress, plus bloom
that accumulates under sustained fire and recovers at each weapon's own
rate), gunshots re-synthesized as six layers through a per-weapon
saturator and a shared reverb in the new `core/audio/`, a weapon picker
reduced to a rendered picture of the gun and its name, and a Magazine
Limit setting that is off by default.

`tools/build_desktop_shell.js` was part of it and did not run: every rule
was written against `\n`, and git checks the shells out with CRLF here, so
the head rule matched nothing and the script threw. It now normalises on
read and restores the source file's own ending on write.

The Korean weapon-select intro still described the stat table that had
been removed; rewritten to match the English copy.

### Stage 2 — the two dev tools that had quietly stopped working

`debug_settings.js` drove `#home-settings` and a `#theme-group` button;
both changed with the sidebar. `debug_crosshair_editor.js` drove
`#crosshair-dot-group`. Both had been failing on their first click ever
since, so neither had checked anything in a while. Repaired and passing.

### Stage 3 — humanoid targets

`Human Targets` is a new Settings switch, off by default. On, every drill
spawns a figure built from primitives with three hit zones — head, torso
(arms included) and legs — using a real body's proportions, so the head
stays the small deliberate target it should be. Raycasts recurse into the
zone meshes and record which one was struck.

Headshots get their own sound and a red hitmarker, and are counted in the
Gridshot and Switching summaries. Reaction calls them out on the shot but
does not tally them: that mode scores how fast you reacted, and a headshot
count would invite trading away the thing being measured.

One non-obvious fix: the zones emit a fraction of their own colour. The
range is lit from above, which a sphere catches across its whole curve but
a figure's flat vertical faces do not — without it a humanoid rendered as
a dark silhouette in exactly the colour chosen for visibility.

Spheres stay the default. They are the same size from every angle, which
is what makes them a fair measuring stick for pure aim.

### Verification

`tools/debug_human_targets.js` is new and covers the setting, the figure's
construction, which zone each shot reports, headshot accounting, that
spheres are unchanged, and that a figure is added and removed as one
object. `debug_weapons.js`, `debug_all_modes.js`, `debug_settings.js` and
`debug_crosshair_editor.js` all pass with zero page errors.

---

## Session — 2026-09-05, second half

The two blocked items were unblocked by a decision: **Supabase**, and
accounts that carry suggestions and a PvP identity while drill stats stay
local. Three more stages, each verified and deployed before the next.

### Stage 4 — recoil and accuracy, measured

`tools/tune_weapons.js` is new and prints what the numbers actually do —
first-shot deviation in degrees and centimetres at 8m, bloom really
accumulated per shot, the recoil pattern summed over a full magazine —
then asserts the intentions behind them. It found three things.

The automatics' patterns were shorter than their magazines, so the rifle
fired 10 authored shots and 20 identical ones straight up. All three now
run the full magazine in a three-act shape: vertical climb, a walk to one
side, then a swing back with the vertical spent.

`maxBloomDeg` is never what a shot carries — one interval of recovery
comes off before the next round leaves, so the rifle's real ceiling is
1.67°, not 2.1. Tune against the felt number; the tool prints it.

The SMG was the *worst* hip-fire automatic, backwards for the weapon you
shoot while moving. It is now the most forgiving from the hip, barely
improved by aiming, and pays for its volume in bloom instead.

`tools/debug_recoil.js` had been failing on its first click since the
sidebar rework — a third instance of the same rot. Rewritten with real
assertions about the mechanic rather than prints.

### Stage 5 — a backend seam under the suggestion box

Split in three: `backend.js` holds the contract and picks the
implementation, `localBackend.js` is the existing localStorage behaviour
lifted out unchanged, `store.js` keeps the rules so both implementations
enforce the same ones. Every read and write is a promise now; both screens
guard renders with a token and disable submits in flight.
`tools/debug_suggestions.js` drives the real screens against a slow
in-memory "remote" backend, which caught the one thing the refactor
missed: a backend swap left the previous board on screen.

### Stage 6 — Google sign-in and the shared board

The Supabase client is written out (~200 lines: authorize, token, logout,
PostgREST) rather than vendoring ~120KB of SDK for four endpoints. PKCE,
so no token ever appears in a URL. Authorisation lives in
`supabase/schema.sql` — a static client can lie about anything it is
trusted to decide, so authorship, `by_admin` and deletion are settled by
row-level security against `auth.uid()`, and a column grant is what stops
an account promoting itself.

With `core/backend/config.js` empty, as it ships, none of this exists: no
sign-in button, no network calls, the local board as before.
`tools/debug_auth.js` covers the whole flow against a mocked Supabase that
refuses things the way the real policies do.

---

## Still open

**Stage 7 — needs the project only you can create**

Follow `supabase/README.md`: create the project, run `schema.sql`, enable
Google, then paste the URL and anon key into `core/backend/config.js`.
Once those two lines are filled in, what remains is: verify a real sign-in
end to end, confirm the RLS check the mock cannot answer (the README ends
with it), promote your own account to admin, and decide whether local
posts made before sign-in should be offered for migration to the shared
board.

**Open work**

- Humanoid targets are static figures. PvP will want them moving and
  animated, and the zones sized against a real player model rather than
  against the sphere they replaced.
- The recoil patterns now hold up arithmetically. Whether they *feel*
  right is still a question only play answers.
