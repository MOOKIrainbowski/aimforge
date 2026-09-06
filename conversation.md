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

## Session — 2026-09-06

Six stages, each verified and pushed before the next began.

### Stage 1 — the landing hero is a sphere again

The animation at the top of the landing page was flicking between three
humanoid figures. Spheres are the range's default and the thing the whole
pitch is measured against — the same size from every angle — so that is what
the loop demonstrates now. The humanoid still has its own hit-zone diagram
further down the page, where its zones can actually be labelled. The hero
caption follows the shape it sits over: `ELIMINATED`, not `HEADSHOT`.

### Stage 2 — the weapon is chosen in the range, on B

The picker was a screen on the way in, and before that a row on the home
screen. Both asked the question before it meant anything: what separates
eight guns is how they handle, and a card with a picture on it cannot say.

Enter the Range now goes straight in carrying whatever is equipped, and B
opens the picker inside the range — from the start prompt or mid-session.
The picker holds the session open the way the pause screen does: pointer
lock is released so the mouse works, the drill clock is shifted by the time
spent in there, and the pause overlay steps aside for it. What the old gun
owned is left behind — fresh magazine, rate gate, recoil pattern re-armed
from shot one while keeping the compensation already scored. Closing shows
the pause overlay first and hides it once the lock is granted, so a browser
refusing the request cannot strand you.

`RecoilTracker.setWeapon()` and a `Drill.setWeapon()` hook are new; every
tool that used to click through the picker no longer needs to, and the two
that wanted a specific weapon seed it the way the magazine limit is seeded.

### Stage 3 — the account moved, two switches stopped being duplicated

Sign in with Google is in the sidebar directly above Settings now, full
width, its menu opening upward. Human Targets and Magazine Limit are off the
Settings screen: they decide what a session *is*, which is why they are on
the home screen, and a second copy was one more thing to keep in step. That
also removed a stray line in the magazine handler that repainted the
human-targets switch from the magazine one's state.

Found on the way: the `max-width: 900px` block sat *above* the sidebar CSS
it was meant to override, so at equal specificity the later base rules won
and none of the narrow-viewport layout had ever taken effect — at 760px the
rail stayed a 232px column. Moved below what it overrides, plus the
flex-basis reset it needed.

### Stage 4 — the suggestion box needs an account

A suggestion starts a conversation and a reply needs somewhere to arrive.
Posting as this browser left the answer sitting in a browser. Signed out,
the box is now one sentence and the way in.

The gate asks the backend seam whether there is a board that outlives the
tab, not whether someone is signed in, because that is the fact it depends
on. A build with no backend configured says there is nowhere for a
suggestion to go and offers no button rather than a dead one.

### Stage 5 — admin

`supabase/admin.sql` is new and holds the whole procedure: grant, revoke,
who is an admin now, and everyone who has ever signed in (the query you want
when a grant returns 0 rows because the address was spelled differently).
The grant returns the row it changed, so "did that work" has an answer.

The admin screen also stopped lying to whoever earned it. Two things put it
on the sidebar — an account the server says is an admin, and `?admin=1`, a
local preview over this browser's own board — and the warning and the "leave
admin mode" link describe only the second.

### Stage 6 — a guided first run

Seven steps, shown once, reachable from the sidebar afterwards. Each rings a
real control on the home screen and says what it does, rather than
describing the app somewhere the app is not — which also means a step whose
selector stops matching stops ringing anything, loudly.

The card goes on whichever side of the ring has the most room and is capped
to that room, so it always clears what it is explaining, including where the
highlight is a panel too tall to clear at all. The ring is measured from the
target rather than read back off itself: it slides between steps, so its own
rectangle is the previous step's until that transition ends.

Every other harness opens a browser with nothing stored, which is exactly
what the tour looks for, so they now declare it seen. `debug_tutorial.js`
does not, and drives it.

### Verification

`debug_tutorial.js` is new. `debug_weapons.js` gained section 9 (the
mid-session swap: the picker pauses rather than ends, the clock does not run
under it, the new gun's magazine is its own). `debug_home.js`,
`debug_suggestions.js` and `debug_auth.js` were reworked around the new
flows. All of those pass, along with `debug_recoil.js`,
`debug_human_targets.js`, `debug_crosshair_editor.js`, and the smoke tools
`debug_all_modes.js`, `debug_settings.js`, `debug_tracking_switching.js`,
`debug_reaction_and_hits.js` and `debug_quality_web.js` — zero page errors.

## Still open

**The one step that cannot be done from here**

Run the first statement in `supabase/admin.sql` in the Supabase SQL editor
to make `code.rainbow.ski@gmail.com` an admin. It is written and ready; it
cannot be run from this side, because `is_admin` is reachable only with
database access — which is the entire point of the column grant in
`schema.sql`. The address must have signed in through the app once first, or
the grant comes back with 0 rows. It takes effect on that account's next
page load.

The project itself is up: `schema.sql` is applied (both tables answer
PostgREST) and `core/backend/config.js` is filled in. What has still never
been checked against the real project is the RLS confirmation the README
ends with — the one thing a mocked Supabase cannot answer.

**Six dev tools that stopped working some time ago**

`debug_coach.js`, `debug_m4_flow.js`, `debug_history_view.js`,
`debug_stats_persistence.js`, `debug_hit_math.js` and `debug_hit_math2.js`
all fail, and all for the same reason: none of them ever clicks the canvas
to take pointer lock, so no drill is ever created and everything after that
reads from `null`. Confirmed pre-existing — they fail identically on the
commit before this session — so this is the same rot that `debug_settings`,
`debug_crosshair_editor` and `debug_recoil` had, caught late again. A canvas
click after `#home-start` is most of the fix.

**Open work**

- The local suggestion backend is now unreachable from the UI: it is the
  fallback for a build with no backend configured, and the gate closes over
  it. It is still exercised through the seam by `debug_suggestions.js`.
  Whether to keep it at all is a decision, not an accident.
- Humanoid targets are static figures. PvP will want them moving and
  animated, and the zones sized against a real player model rather than
  against the sphere they replaced.
- The recoil patterns now hold up arithmetically. Whether they *feel*
  right is still a question only play answers.
