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

## Still open

**From the original list**

- Login / sign-up (Google) — deferred by the user; wanted for PvP.
- Human models split into head / torso+arms / legs, as PvP preparation.

**Follow-ups this session created**

- The suggestion box needs a backend to be more than a local notepad. That
  is the blocking decision before the admin page means anything.
- Two dev tools reference IDs that no longer exist and were already broken
  before this session: `tools/debug_settings.js` (`#home-settings`, now
  `#home-settings-btn`) and `tools/debug_crosshair_editor.js`
  (`#crosshair-dot-group`, now `#dot-switch`).
- `app/index.html` and `desktop/renderer/index.html` are near-duplicate
  shells; the desktop copy is currently regenerated from the web one by
  hand. Worth making that a build step before it drifts again.
- Per-weapon recoil patterns are first drafts — worth tuning against real
  play, especially the sniper's single heavy punch.
