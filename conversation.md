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

## Still open

**Blocked on a decision, not on work**

- Login / sign-up (Google). Needs a host and an auth provider chosen
  first. Wanted for PvP.
- The suggestion box needs a backend to be more than a local notepad —
  same decision, same blocker. Until then the admin page is a view role,
  not an authenticated one.

**Open work**

- Per-weapon recoil patterns are first drafts — worth tuning against real
  play, especially the sniper's single heavy punch. The same is now true
  of the firing-accuracy numbers.
- Humanoid targets are static figures. PvP will want them moving and
  animated, and the zones sized against a real player model rather than
  against the sphere they replaced.
