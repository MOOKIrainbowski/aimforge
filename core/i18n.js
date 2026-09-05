import { migrateKey } from "./storage.js";

// Dependency-free i18n. Shared by the landing page and the app — both are
// same-origin, so the persisted language carries across the "Launch
// AimonSite" boundary automatically.
const STORAGE_KEY = "aimonsite:lang";
const DEFAULT_LANGUAGE = "en";

const STRINGS = {
  en: {
    // Common
    "common.back": "Back",
    "common.on": "On",
    "common.off": "Off",
    "common.reset": "Reset to Default",

    // Nav / shared CTAs
    "nav.drills": "Drills",
    "nav.weapons": "Weapons",
    "nav.targets": "Targets",
    "nav.measure": "Measurement",
    "nav.history": "View History",
    "nav.crosshair": "Customize Crosshair",
    "nav.sensitivity": "Sensitivity",
    "nav.backToLanding": "Back to landing page",
    "nav.settingsAria": "Open settings",
    "cta.launchNav": "Launch",
    "cta.launch": "Launch AimonSite \u2192",

    // Landing hero
    "hero.eyebrow": "Free \u00b7 Runs in your browser \u00b7 No install",
    "hero.title.html": 'Real weapons.<br /><span class="gradient">Measured</span> aim.',
    "hero.sub": "Eight weapons that each shoot, kick and sound different. Humanoid targets with head, torso and leg zones. Four drills that score what you actually did, and coach feedback that compares you against your own trend \u2014 all in a browser tab, with your stats kept on your machine.",
    "hero.secondaryBtn": "See what is inside",
    "hero.meta1": "Raw mouse input",
    "hero.meta2": "Sensitivity matched to your game",
    "hero.meta3": "Stats stay on your device",
    "hero.captionMode": "GRIDSHOT \u00b7 RIFLE",
    "hero.captionStat": "HEADSHOT",

    // Landing measurement strip
    "strip.weapons": "weapons, each with its own behaviour",
    "strip.drills": "drills, from flicking to reaction",
    "strip.zones": "hit zones on a humanoid target",
    "strip.installs": "installs, accounts or downloads",

    // Landing: drills
    "drills.eyebrow": "Drills",
    "drills.title": "Four drills, one range",
    "drills.sub": "Each one trains a distinct skill and is scored on its own terms \u2014 not on a single number that flatters everything.",
    "mode.gridshot.name": "Gridshot",
    "mode.gridshot.desc": "Flick to one target at a time",
    "mode.gridshot.landingDesc": "One target at a time. Tracks time-to-kill and whether your flicks overshoot or fall short.",
    "mode.tracking.name": "Tracking",
    "mode.tracking.desc": "Keep crosshair on a moving target",
    "mode.tracking.landingDesc": "Hold your crosshair on a strafing target. Scored continuously, by time on target.",
    "mode.switching.name": "Target Switching",
    "mode.switching.short": "Switching",
    "mode.switching.desc": "Clear waves of multiple targets",
    "mode.switching.landingDesc": "Clear waves of simultaneous targets, training how fast you re-acquire between them.",
    "mode.reaction.name": "Reaction Time",
    "mode.reaction.short": "Reaction",
    "mode.reaction.desc": "Hit targets before they vanish",
    "mode.reaction.landingDesc": "Targets flash and vanish. Measures raw reaction speed, and counts the shots you fired too early.",

    // Landing: weapons
    "weapons.eyebrow": "Weapons",
    "weapons.title": "Eight weapons that disagree with each other",
    "weapons.sub": "Not skins on the same gun. A sniper makes you work the bolt between shots, a shotgun throws nine pellets, and an SMG is the one you can actually shoot from the hip.",
    "weapons.mode.auto": "Automatic",
    "weapons.mode.semi": "Semi-auto",
    "weapons.mode.bolt": "Bolt action",
    "weapons.mode.pump": "Pump \u00b7 9 pellets",
    "weapons.mode.pump2": "Pump \u00b7 12 pellets",
    "weapons.accuracy.tag": "Firing error",
    "weapons.accuracy.title": "Hip fire costs you",
    "weapons.accuracy.desc": "Every weapon has its own error from the hip and when aimed, blended by how far into the sights you are. The sniper misses by half a metre unscoped and is exact through the scope; the SMG barely cares either way.",
    "weapons.bloom.tag": "Bloom",
    "weapons.bloom.title": "Holding the trigger has a price",
    "weapons.bloom.desc": "Sustained fire walks the shot off the crosshair and recovers when you let go. The first shot after any pause is always clean, so tapping stays a pure test of aim.",
    "weapons.recoil.tag": "Recoil",
    "weapons.recoil.title": "A pattern worth learning",
    "weapons.recoil.desc": "Each automatic has a pattern that runs its whole magazine \u2014 climb, walk to one side, swing back. Recoil Control mode scores how well you cancel it, not just whether you hit.",

    // Landing: targets
    "targets.eyebrow": "Targets",
    "targets.title": "Spheres to measure with, figures to practise on",
    "targets.sub": "A sphere is the same size from every angle, which makes it an honest yardstick. Switch to humanoid targets when you want zones \u2014 and headshots that get called out as you land them.",
    "targets.zone.head": "Head",
    "targets.zone.headDesc": "its own sound and marker, counted in the summary",
    "targets.zone.torso": "Torso",
    "targets.zone.torsoDesc": "arms included \u2014 centre mass, where a drill spawns it",
    "targets.zone.legs": "Legs",
    "targets.zone.legsDesc": "the shot that connected but should not have",
    "targets.feel.tag": "Feel",
    "targets.feel.title": "Everything you hear is generated",
    "targets.feel.desc": "No audio files. Each weapon report is synthesized from its own layers \u2014 the leading edge of the blast, the crack, the gas, the low punch you feel, the tail leaving the room, and the action working a beat later. Brass ejects, arcs and settles on the floor. Nothing to download.",

    // Landing: measurement
    "measure.eyebrow": "Measurement",
    "measure.title": "The part that makes it training",
    "measure.sub": "Shooting is the easy half. What matters is what the session tells you afterwards.",
    "measure.coach.title": "Coach feedback, not a tip list",
    "measure.coach.desc": "Rule-based tips compare a session against your own trend: flick bias, tracking consistency, reaction spread, how much of the recoil you actually cancelled.",
    "measure.history.title": "History and hit maps",
    "measure.history.desc": "Every session is kept and charted, with a heatmap of where your shots land relative to target centre \u2014 the fastest way to see a consistent bias.",
    "measure.sens.title": "Real sensitivity conversion",
    "measure.sens.desc": "Enter your DPI and cm/360 and AimonSite matches it across Valorant, CS2, Apex, Overwatch 2 and Fortnite, so practice transfers to the game you actually play.",
    "measure.crosshair.title": "Your crosshair, exactly",
    "measure.crosshair.desc": "Shape, size, thickness, gap, outline, centre dot and colour \u2014 set once and used everywhere, with target colour kept separate so contrast is yours to choose.",
    "measure.range.title": "A range you can tune",
    "measure.range.desc": "Wall and floor colour, brightness, field of view, and whether magazines and reloads exist at all. Off by default: an aim trainer should not interrupt you to reload.",
    "measure.desktop.title": "A desktop build too",
    "measure.desktop.desc": "The same trainer as a lightweight desktop app, with higher-fidelity shadows, bloom and reflections for practice offline.",

    // Landing: how it works
    "how.eyebrow": "How it works",
    "how.title": "From click to coach feedback in about a minute",
    "step1.title": "Pick a drill, then a weapon",
    "step1.desc": "Choose the mode, difficulty and length, then pick what you are carrying on the way in \u2014 each one shoots, reloads and cycles differently.",
    "step2.title": "Step into the range",
    "step2.desc": "Click to lock your mouse and shoot. Raw input, sampled at full rate and applied once per frame, so a fast turn stays smooth.",
    "step3.title": "Read what happened",
    "step3.desc": "Score, accuracy, headshots, time-to-kill and coach tips straight after, then your trend over every session you have run.",

    // Landing: privacy and accounts
    "yours.local.tag": "Private by default",
    "yours.local.title": "Your stats stay on your machine",
    "yours.local.desc": "Every session, setting and crosshair preset lives in your own browser storage. There is no account to make and nothing to upload \u2014 and signing in does not change that.",
    "yours.account.tag": "Optional",
    "yours.account.title": "Sign in only if you want to be heard",
    "yours.account.desc": "There is a suggestion box for ideas and bug reports. Signing in with Google puts your name on what you post and lets replies reach you anywhere. Your drill stats are not part of the deal.",

    // CTA band + footer
    "cta.title": "Your aim is not going to train itself.",
    "cta.sub": "No sign-up, no download. Click, pick a weapon, and start flicking.",
    "footer.tagline": "Runs entirely in your browser. No tracking, no ads.",
    "footer.credit": "Weapon models by Quaternius (CC0); revolver, breacher and casing by Zsky and Poly by Google (CC-BY)",

    // App: home screen
    "app.title": "AimonSite — Range",
    "home.eyebrow": "Training Range",
    "home.heroTitle": "Choose your drill.",
    "home.subtitle": "Pick a drill, tune it, and step into the range.",
    "option.difficulty": "Difficulty",
    "option.duration": "Duration",
    "option.recoil": "Recoil Control",
    "option.recoilNote": "Gridshot & Switching only",
    "difficulty.easy": "Easy",
    "difficulty.normal": "Normal",
    "difficulty.hard": "Hard",
    "duration.30": "30s",
    "duration.60": "60s",
    "duration.90": "90s",
    "cta.enterRange": "Enter the Range",
    "home.best": "Best {value}",
    "start.title": "Click to Start",
    "start.hint": "Esc releases the mouse mid-session",
    "loading.start": "Starting…",
    "loading.renderer": "Preparing renderer…",
    "loading.range": "Building the range…",
    "loading.effects": "Loading effects…",
    "loading.weapons": "Loading weapons…",

    // Pause / summary
    "pause.title": "Paused",
    "pause.hint": "Click anywhere to resume",
    "pause.resume": "Resume",
    "pause.quit": "Quit to Menu",
    "summary.title": "Session Complete",
    "summary.retry": "Retry",
    "summary.menu": "Back to Menu",
    "summary.mode.gridshot": "Gridshot",
    "summary.mode.tracking": "Tracking",
    "summary.mode.switching": "Target Switching",
    "summary.mode.reaction": "Reaction Time",
    "summary.accuracy": "{value}% accuracy",
    "summary.score": "{value} score",
    "summary.gridshot.ttk": "Avg time-to-kill: {value} ms",
    "summary.gridshot.bestStreak": "Best streak: {value}",
    "summary.tracking.onTarget": "Time on target: {value}s",
    "summary.tracking.bestStreak": "Best streak: {value}s",
    "summary.switching.avgSwitch": "Avg switch time: {value} ms",
    "summary.switching.waves": "Waves completed: {value}",
    "summary.reaction.avg": "Avg reaction: {value} ms",
    "summary.reaction.fastestSlowest": "Fastest / slowest: {fastest} / {slowest} ms",
    "summary.reaction.falseStarts": "False starts: {value}",
    "summary.recoil": "Recoil compensation: {value}%",
    "summary.headshots": "Headshots: {value} of {hits}",
    "summary.coachHeading": "Coach Feedback",

    // HUD
    "hud.score": "Score: {value}",
    "hud.streak": "Streak: {value}",

    // History
    "history.title": "Progress",
    "table.date": "Date",
    "table.mode": "Mode",
    "table.score": "Score",
    "table.accuracy": "Accuracy",
    "table.empty": "No sessions recorded yet.",
    "metric.score": "Score",
    "metric.accuracy": "Accuracy",
    "heatmap.heading": "Hit Positions",
    "heatmap.notTracked": "Not tracked for this mode.",
    "heatmap.empty": "No shots recorded yet.",
    "chart.empty": "No sessions yet — play a round to start your trend.",

    // Crosshair editor
    "crosshair.title": "Crosshair",
    "crosshair.shape": "Shape",
    "shape.cross": "Cross",
    "shape.t": "T",
    "shape.circle": "Circle",
    "shape.dot": "Dot",
    "crosshair.color": "Color",
    "crosshair.size": "Size",
    "crosshair.thickness": "Thickness",
    "crosshair.gap": "Gap",
    "crosshair.opacity": "Opacity",
    "crosshair.outline": "Outline",
    "crosshair.centerDot": "Center Dot",
    "aria.crosshairColor": "Crosshair color",

    // Sensitivity
    "sensitivity.title": "Sensitivity",
    "sensitivity.dpi": "Mouse DPI",
    "sensitivity.cm360": "cm/360°",
    "sensitivity.note": "This sets your actual mouse sensitivity in AimonSite. Use the table below to match it in other games.",
    "table.game": "Game",
    "table.sensitivity": "Sensitivity",
    "sensitivity.disclaimer": "Approximate — based on commonly published conversion constants; small differences may remain in-game.",
    "aria.mouseDpi": "Mouse DPI",

    // Settings
    "settings.title": "Settings",
    "settings.theme": "Theme",
    "theme.dark": "Dark",
    "theme.light": "Light",
    "settings.sound": "Sound",
    "settings.magazineLimit": "Magazine Limit",
    "settings.magazineLimitNote": "Off: fire without ever reloading. On: every weapon runs its real magazine, reload and dry-fire. Rate of fire, bolt cycles and accuracy are unaffected either way.",
    "settings.humanTargets": "Human Targets",
    "settings.humanTargetsNote": "Off: spheres, the same size from every angle. On: humanoid figures with head, torso and leg zones — headshots are called out as you land them and counted in the summary.",
    "settings.wallColor": "Wall Color",
    "settings.floorColor": "Floor Color",
    "settings.brightness": "Brightness",
    "settings.fov": "Field of View",
    "aria.wallColor": "Wall color",
    "aria.floorColor": "Floor color",

    // Coach tips (core/coach.js) — {params} interpolated at render time
    "tip.trendUp": "Accuracy is up {delta} points versus your recent average — whatever you just did, keep doing it.",
    "tip.trendDown": "Accuracy dropped {delta} points versus your recent average — maybe warm up a bit longer, or check your sensitivity hasn't drifted.",
    "tip.gridshotLow": "{accuracy}% accuracy is on the low side for Gridshot — try slowing down slightly and confirming each shot before firing.",
    "tip.gridshotHigh": "{accuracy}% accuracy is excellent — try a smaller target radius or shorter duration to raise the difficulty.",
    "tip.gridshotOvershoot": "Your first flick tends to overshoot past the target — try a slightly lower sensitivity or a shorter flick swing.",
    "tip.gridshotUndershoot": "Your first flick tends to fall short of the target — try a slightly higher sensitivity or committing more to the initial swing.",
    "tip.gridshotTtkVariance": "Your time-to-kill varies a lot between targets — focus on a consistent rhythm rather than rushing some shots.",
    "tip.trackingLow": "Only {accuracy}% time-on-target — try reducing target speed or widening the target until tracking feels smooth.",
    "tip.trackingChoppy": "Your on-target time is made of many short bursts rather than one smooth hold — work on small continuous corrections instead of re-acquiring the target.",
    "tip.trackingSmooth": "Great sustained tracking — most of your on-target time comes from one long, uninterrupted hold.",
    "tip.switchingLow": "{accuracy}% accuracy — prioritize picking the right next target over speed between shots.",
    "tip.switchingInconsistent": "Switch times between targets are inconsistent — some transitions are much slower than others. Try scanning the next target before you finish the current one.",
    "tip.switchingConsistent": "Very consistent switch times across targets — your target-to-target rhythm is solid.",
    "tip.reactionFalseStartOne": "{count} false start — you're clicking before the target appears. Try waiting for the flash instead of anticipating it.",
    "tip.reactionFalseStartOther": "{count} false starts — you're clicking before the target appears. Try waiting for the flash instead of anticipating it.",
    "tip.reactionTimeouts": "You're missing the exposure window on a chunk of targets — that's about spotting the flash quickly, not just clicking faster.",
    "tip.reactionInconsistent": "Reaction times are quite spread out rep to rep — try staying relaxed and ready rather than tensing up while waiting.",
    "tip.reactionFast": "Averaging {ms}ms is very fast — strong reaction speed.",
    "tip.solidSession": "Solid session — nothing stands out as an issue. Keep at it.",
    "tip.historyImproved": "Accuracy has improved {delta} points on average since your earliest sessions in this mode.",
    "tip.historyDropped": "Accuracy has dropped {delta} points on average versus your earliest sessions — worth a check on sensitivity or warmup routine.",
    "tip.historyOvershootBias": "Across your history, you overshoot flicks more often than you undershoot ({overshoot} vs {undershoot}) — a small sensitivity reduction may help.",
    "tip.historyUndershootBias": "Across your history, you undershoot flicks more often than you overshoot ({undershoot} vs {overshoot}) — try a slightly higher sensitivity or fuller flicks.",

    // Weapons
    "weapon.rifle": "Rifle",
    "weapon.carbine": "Carbine",
    "weapon.smg": "SMG",
    "weapon.sniper": "Sniper",
    "weapon.shotgun": "Shotgun",
    "weapon.breacher": "Breacher",
    "weapon.pistol": "Pistol",
    "weapon.revolver": "Revolver",

    // Weapon select
    "weaponSelect.title": "Select Weapon",
    "weaponSelect.intro": "Each one shoots, kicks and sounds different. Pick one and find out.",
    "weaponSelect.confirm": "Enter the Range",

    // In-range HUD
    "hud.reloading": "Reloading",
    "hud.cycling": "Cycling",
    "start.reloadHint": "reload",
    "start.adsHint": "aim",
    "start.rmb": "RMB",

    // Suggestion box
    "nav.suggestions": "Suggestion Box",
    "nav.admin": "Admin",
    "suggestions.title": "Suggestion Box",
    "suggestions.localNote": "AimonSite has no server, so posts are stored in this browser only. Nothing is uploaded or shared.",
    "suggestions.category": "Category",
    "suggestions.category.suggestion": "Suggestion",
    "suggestions.category.bug": "Error Correction",
    "suggestions.titlePlaceholder": "Title",
    "suggestions.bodyPlaceholder": "Describe it \u2014 up to 1,000 characters.",
    "suggestions.submit": "Post",
    "suggestions.filter.all": "All",
    "suggestions.filter.mine": "My Posts",
    "suggestions.empty": "Nothing here yet. Post the first one.",
    "suggestions.reply": "Comment",
    "suggestions.replyPlaceholder": "Add a comment\u2026",
    "suggestions.replyCount": "{value} comments",
    "suggestions.newReply": "New reply from the admin",
    "suggestions.you": "You",
    "suggestions.anonymous": "Anonymous",
    "suggestions.adminLabel": "Admin",
    "suggestions.status.open": "Open",
    "suggestions.status.planned": "Planned",
    "suggestions.status.resolved": "Resolved",
    "suggestions.status.declined": "Declined",
    "suggestions.error.empty": "A title and a description are both required.",
    "suggestions.error.storage": "Couldn't save \u2014 browser storage is unavailable.",
    "suggestions.error.signin": "Sign in to post — suggestions on the shared board are posted under your account.",
    "suggestions.error.forbidden": "That isn't something this account is allowed to do.",
    "suggestions.error.backend": "Couldn't reach the server. Your suggestion wasn't saved.",
    "account.signIn": "Sign in with Google",
    "account.signInFailed": "Sign-in is unavailable right now.",
    "account.toastSignedIn": "Signed in as {name}",
    "account.toastSignedOut": "Signed out",
    "home.loadout": "Loadout",
    "home.changeWeapon": "Change",
    "home.humanTargetsNote": "Head, torso and leg zones",
    "home.magazineLimitNote": "Reloads, dry fire and a real magazine",
    "account.signOut": "Sign out",
    "account.needed": "Sign in to post on the shared board.",
    "account.localBoard": "Posts here are kept in this browser only.",
    "account.sharedBoard": "Posting as {name}.",

    // Admin
    "admin.title": "Admin",
    "admin.warning": "This is a local view role, not an authenticated account. With no server there is nothing to authenticate against \u2014 treat it as a preview of the moderation UI.",
    "admin.filter.unanswered": "Needs reply",
    "admin.summary.total": "Posts",
    "admin.summary.needsReply": "Needs reply",
    "admin.summary.bugs": "Error reports",
    "admin.setStatus": "Status",
    "admin.reply": "Reply as admin",
    "admin.replyPlaceholder": "Reply to this post\u2026",
    "admin.delete": "Delete",
    "admin.deleteConfirm": "Click again to delete",
    "admin.empty": "Nothing matches this filter.",
    "admin.signOut": "Leave admin mode",

    // Settings additions
    "settings.targetColor": "Target Color",
    "settings.targetColorNote": "Independent of the crosshair colour \u2014 set that under Customize Crosshair.",
    "crosshair.colorNote": "Target colour is set separately, under Settings.",
    "aria.targetColor": "Target color",
  },

  ko: {
    "common.back": "뒤로",
    "common.on": "켜짐",
    "common.off": "꺼짐",
    "common.reset": "기본값으로 재설정",

    "nav.drills": "훈련 모드",
    "nav.weapons": "무기",
    "nav.targets": "표적",
    "nav.measure": "측정",
    "nav.history": "기록 보기",
    "nav.crosshair": "조준점 커스터마이징",
    "nav.sensitivity": "감도 변환",
    "nav.backToLanding": "소개 페이지로 돌아가기",
    "nav.settingsAria": "설정 열기",
    "cta.launchNav": "실행",
    "cta.launch": "AimonSite 실행 \u2192",

    "hero.eyebrow": "무료 \u00b7 브라우저에서 바로 \u00b7 설치 불필요",
    "hero.title.html": '진짜 총기,<br /><span class="gradient">측정되는</span> 에임.',
    "hero.sub": "발사감과 반동, 소리가 전부 다른 8종의 무기. 머리·몸통·다리로 나뉜 인체형 표적. 실제로 무엇을 했는지 채점하는 4가지 훈련 모드와, 남이 아니라 당신의 지난 기록과 비교해 주는 코치 피드백 \u2014 전부 브라우저 탭 하나에서, 기록은 기기에 남긴 채로.",
    "hero.secondaryBtn": "무엇이 들어있는지 보기",
    "hero.meta1": "Raw 마우스 입력",
    "hero.meta2": "실제 게임 감도에 맞춤",
    "hero.meta3": "기록은 기기에만 저장",
    "hero.captionMode": "GRIDSHOT \u00b7 RIFLE",
    "hero.captionStat": "HEADSHOT",

    "strip.weapons": "종의 무기, 각각 다른 사격 특성",
    "strip.drills": "가지 훈련 모드, 플릭부터 반응 속도까지",
    "strip.zones": "개의 피격 부위로 나뉜 인체형 표적",
    "strip.installs": "설치·계정·다운로드, 전부 필요 없음",

    "drills.eyebrow": "훈련 모드",
    "drills.title": "네 가지 훈련, 하나의 사격장",
    "drills.sub": "각 모드는 서로 다른 능력을 훈련하고, 그에 맞는 방식으로 채점됩니다 \u2014 모든 걸 뭉뚱그린 점수 하나가 아니라.",
    "mode.gridshot.name": "그리드샷",
    "mode.gridshot.desc": "한 번에 하나의 타겟에 플릭",
    "mode.gridshot.landingDesc": "한 번에 하나씩. 처치 시간과 함께, 플릭이 지나쳤는지 모자랐는지를 기록합니다.",
    "mode.tracking.name": "트래킹",
    "mode.tracking.desc": "움직이는 타겟에 조준점 유지",
    "mode.tracking.landingDesc": "좌우로 움직이는 타겟에 조준점을 유지합니다. 명중 유지 시간으로 연속 채점됩니다.",
    "mode.switching.name": "타겟 스위칭",
    "mode.switching.short": "스위칭",
    "mode.switching.desc": "여러 타겟의 웨이브 처리",
    "mode.switching.landingDesc": "동시에 등장하는 표적들을 처리하며, 표적 사이를 얼마나 빨리 재조준하는지 훈련합니다.",
    "mode.reaction.name": "반응 속도",
    "mode.reaction.short": "반응",
    "mode.reaction.desc": "사라지기 전에 타겟 명중",
    "mode.reaction.landingDesc": "타겟이 번쩍 나타났다 사라집니다. 순수 반응 속도를 재고, 너무 일찍 쏜 사격도 함께 셉니다.",

    "weapons.eyebrow": "무기",
    "weapons.title": "서로 완전히 다른 8종의 무기",
    "weapons.sub": "같은 총에 스킨만 씌운 것이 아닙니다. 저격총은 매 발마다 볼트를 당겨야 하고, 산탄총은 한 발에 탄자 9개를 뿌리며, SMG는 허리쏴로 실제로 싸울 수 있는 유일한 무기입니다.",
    "weapons.mode.auto": "완전자동",
    "weapons.mode.semi": "반자동",
    "weapons.mode.bolt": "볼트액션",
    "weapons.mode.pump": "펌프 \u00b7 탄자 9개",
    "weapons.mode.pump2": "펌프 \u00b7 탄자 12개",
    "weapons.accuracy.tag": "사격 오차",
    "weapons.accuracy.title": "허리쏴에는 대가가 따릅니다",
    "weapons.accuracy.desc": "무기마다 허리쏴 오차와 조준 시 오차가 다르고, 얼마나 조준했는지에 따라 그 사이 값이 적용됩니다. 저격총은 비조준 시 8m에서 60cm 가까이 빗나가지만 스코프를 보면 정확하고, SMG는 조준 여부를 거의 따지지 않습니다.",
    "weapons.bloom.tag": "블룸",
    "weapons.bloom.title": "계속 갈기면 그만큼 퍼집니다",
    "weapons.bloom.desc": "연사를 지속하면 탄착이 조준점에서 벗어나고, 손을 떼면 회복됩니다. 잠깐이라도 쉬고 쏜 첫 발은 항상 정확하므로, 점사는 순수한 에임 싸움으로 남습니다.",
    "weapons.recoil.tag": "반동",
    "weapons.recoil.title": "외울 가치가 있는 패턴",
    "weapons.recoil.desc": "자동화기마다 탄창 전체 길이의 반동 패턴이 있습니다 \u2014 수직 상승, 한쪽으로 이동, 그리고 반대로 되돌아오기. 반동 제어 모드는 명중 여부가 아니라 그 반동을 얼마나 잘 상쇄했는지를 채점합니다.",

    "targets.eyebrow": "표적",
    "targets.title": "재기 위한 구체, 연습하기 위한 인체형",
    "targets.sub": "구체는 어느 각도에서 봐도 크기가 같아서 정직한 잣대가 됩니다. 부위 판정이 필요할 때는 인체형 표적으로 바꾸세요 \u2014 헤드샷은 맞히는 즉시 따로 표시됩니다.",
    "targets.zone.head": "머리",
    "targets.zone.headDesc": "전용 효과음과 마커, 결과 화면에 집계",
    "targets.zone.torso": "몸통",
    "targets.zone.torsoDesc": "팔 포함 \u2014 표적이 생성되는 기준점이자 중심",
    "targets.zone.legs": "다리",
    "targets.zone.legsDesc": "맞긴 맞았지만 맞히지 말았어야 할 사격",
    "targets.feel.tag": "감각",
    "targets.feel.title": "들리는 소리는 전부 실시간 합성입니다",
    "targets.feel.desc": "음원 파일이 없습니다. 총성은 무기별 레이어로 합성됩니다 \u2014 폭풍의 선단, 크랙, 가스의 몸통, 몸으로 느끼는 저역, 실내를 빠져나가는 잔향, 그리고 한 박자 뒤 작동하는 기계음. 탄피는 배출되어 포물선을 그리고 바닥에 굴러 멈춥니다. 내려받을 것은 없습니다.",

    "measure.eyebrow": "측정",
    "measure.title": "이것이 있어야 훈련이 됩니다",
    "measure.sub": "쏘는 것은 쉬운 절반입니다. 중요한 건 그 세션이 무엇을 말해주느냐입니다.",
    "measure.coach.title": "뻔한 팁 목록이 아닌 코치 피드백",
    "measure.coach.desc": "규칙 기반 팁이 이번 세션을 당신의 지난 추세와 비교합니다: 플릭 성향, 트래킹 일관성, 반응 속도 편차, 반동을 실제로 얼마나 상쇄했는지.",
    "measure.history.title": "기록과 명중 히트맵",
    "measure.history.desc": "모든 세션이 저장되고 그래프로 그려지며, 표적 중심 대비 탄착 위치를 히트맵으로 보여줍니다 \u2014 일관된 편향을 발견하는 가장 빠른 방법입니다.",
    "measure.sens.title": "실제 감도 변환",
    "measure.sens.desc": "DPI와 cm/360을 입력하면 발로란트, CS2, 에이펙스, 오버워치 2, 포트나이트에 맞춰 변환합니다. 연습이 실제로 하는 게임으로 이어집니다.",
    "measure.crosshair.title": "당신의 조준점 그대로",
    "measure.crosshair.desc": "모양, 크기, 두께, 간격, 외곽선, 중앙 점, 색상 \u2014 한 번 설정하면 어디서나 적용됩니다. 표적 색상은 따로 두어 대비를 직접 고를 수 있습니다.",
    "measure.range.title": "직접 조정하는 사격장",
    "measure.range.desc": "벽과 바닥 색, 밝기, 시야각, 그리고 탄창과 재장전을 아예 없앨지까지. 기본값은 꺼짐입니다 \u2014 에임 트레이너가 재장전으로 흐름을 끊어서는 안 되니까요.",
    "measure.desktop.title": "데스크톱 빌드도 있습니다",
    "measure.desktop.desc": "같은 트레이너를 가벼운 데스크톱 앱으로. 더 높은 품질의 그림자와 블룸, 반사를 오프라인에서 즐길 수 있습니다.",

    "how.eyebrow": "이용 방법",
    "how.title": "클릭부터 코치 피드백까지, 1분이면 충분합니다",
    "step1.title": "훈련을 고르고, 무기를 고르세요",
    "step1.desc": "모드와 난이도, 세션 길이를 정한 뒤 입장 직전에 들고 갈 무기를 선택하세요 \u2014 발사도, 재장전도, 장전 동작도 전부 다릅니다.",
    "step2.title": "사격장에 들어가세요",
    "step2.desc": "클릭해서 마우스를 잠그고 사격하세요. Raw 입력을 최대 주기로 받아 프레임마다 한 번씩 반영하므로, 빠르게 돌려도 끊기지 않습니다.",
    "step3.title": "무슨 일이 있었는지 확인하세요",
    "step3.desc": "점수, 정확도, 헤드샷, 처치 시간, 코치 팁이 곧바로 나오고, 지금까지의 모든 세션에 대한 추세도 함께 볼 수 있습니다.",

    "yours.local.tag": "기본이 비공개",
    "yours.local.title": "기록은 당신의 기기에 남습니다",
    "yours.local.desc": "모든 세션과 설정, 조준점 프리셋은 브라우저 저장소에 보관됩니다. 만들 계정도, 올릴 것도 없습니다 \u2014 로그인해도 마찬가지입니다.",
    "yours.account.tag": "선택 사항",
    "yours.account.title": "목소리를 내고 싶을 때만 로그인하세요",
    "yours.account.desc": "아이디어와 오류 제보를 위한 건의함이 있습니다. Google로 로그인하면 작성한 글에 이름이 붙고, 답변이 어디서든 닿습니다. 훈련 기록은 여기에 포함되지 않습니다.",

    "cta.title": "에임은 저절로 늘지 않습니다.",
    "cta.sub": "회원가입도 다운로드도 없습니다. 클릭하고, 무기를 고르고, 바로 시작하세요.",
    "footer.tagline": "브라우저에서 100% 동작합니다. 추적도, 광고도 없습니다.",
    "footer.credit": "무기 모델 제공: Quaternius (CC0), 리볼버·브리처·탄피는 Zsky 및 Poly by Google (CC-BY)",

    "app.title": "AimonSite — 사격장",
    "home.eyebrow": "훈련 사격장",
    "home.heroTitle": "훈련을 선택하세요.",
    "home.subtitle": "훈련을 선택하고, 설정을 조정한 뒤 사격장으로 들어가세요.",
    "option.difficulty": "난이도",
    "option.duration": "시간",
    "option.recoil": "리코일 컨트롤",
    "option.recoilNote": "그리드샷·스위칭 전용",
    "difficulty.easy": "쉬움",
    "difficulty.normal": "보통",
    "difficulty.hard": "어려움",
    "duration.30": "30초",
    "duration.60": "60초",
    "duration.90": "90초",
    "cta.enterRange": "사격장 입장",
    "home.best": "최고 {value}",
    "start.title": "클릭해서 시작",
    "start.hint": "Esc로 세션 중 마우스 잠금 해제",
    "loading.start": "시작하는 중…",
    "loading.renderer": "렌더러 준비 중…",
    "loading.range": "사격장 구성 중…",
    "loading.effects": "이펙트 로딩 중…",
    "loading.weapons": "무기 로딩 중…",

    "pause.title": "일시정지",
    "pause.hint": "아무 곳이나 클릭하면 재개됩니다",
    "pause.resume": "재개",
    "pause.quit": "메뉴로 나가기",
    "summary.title": "세션 완료",
    "summary.retry": "다시하기",
    "summary.menu": "메뉴로",
    "summary.mode.gridshot": "그리드샷",
    "summary.mode.tracking": "트래킹",
    "summary.mode.switching": "타겟 스위칭",
    "summary.mode.reaction": "반응 속도",
    "summary.accuracy": "정확도 {value}%",
    "summary.score": "점수 {value}",
    "summary.gridshot.ttk": "평균 처치 시간: {value}ms",
    "summary.gridshot.bestStreak": "최고 연속 명중: {value}",
    "summary.tracking.onTarget": "명중 유지 시간: {value}초",
    "summary.tracking.bestStreak": "최고 연속 유지: {value}초",
    "summary.switching.avgSwitch": "평균 전환 시간: {value}ms",
    "summary.switching.waves": "완료한 웨이브: {value}",
    "summary.reaction.avg": "평균 반응 속도: {value}ms",
    "summary.reaction.fastestSlowest": "최고 / 최저: {fastest} / {slowest}ms",
    "summary.reaction.falseStarts": "성급한 클릭: {value}",
    "summary.recoil": "리코일 보정률: {value}%",
    "summary.headshots": "헤드샷: {hits}타 중 {value}타",
    "summary.coachHeading": "코치 피드백",

    "hud.score": "점수: {value}",
    "hud.streak": "연속: {value}",

    "history.title": "진행 상황",
    "table.date": "날짜",
    "table.mode": "모드",
    "table.score": "점수",
    "table.accuracy": "정확도",
    "table.empty": "아직 기록된 세션이 없습니다.",
    "metric.score": "점수",
    "metric.accuracy": "정확도",
    "heatmap.heading": "명중 위치",
    "heatmap.notTracked": "이 모드는 추적되지 않습니다.",
    "heatmap.empty": "아직 기록된 샷이 없습니다.",
    "chart.empty": "아직 세션이 없습니다 — 한 판 플레이하고 추세를 시작해 보세요.",

    "crosshair.title": "조준점",
    "crosshair.shape": "모양",
    "shape.cross": "십자",
    "shape.t": "T자",
    "shape.circle": "원",
    "shape.dot": "점",
    "crosshair.color": "색상",
    "crosshair.size": "크기",
    "crosshair.thickness": "두께",
    "crosshair.gap": "간격",
    "crosshair.opacity": "불투명도",
    "crosshair.outline": "외곽선",
    "crosshair.centerDot": "중앙 점",
    "aria.crosshairColor": "조준점 색상",

    "sensitivity.title": "감도 변환",
    "sensitivity.dpi": "마우스 DPI",
    "sensitivity.cm360": "cm/360°",
    "sensitivity.note": "AimonSite에서 실제로 사용할 마우스 감도를 설정합니다. 아래 표로 다른 게임에서 같은 감도를 맞춰보세요.",
    "table.game": "게임",
    "table.sensitivity": "감도",
    "sensitivity.disclaimer": "근사값입니다 — 널리 알려진 변환 상수를 기준으로 하며, 게임 내에서 약간의 차이가 있을 수 있습니다.",
    "aria.mouseDpi": "마우스 DPI",

    "settings.title": "설정",
    "settings.theme": "테마",
    "theme.dark": "다크",
    "theme.light": "라이트",
    "settings.sound": "효과음",
    "settings.magazineLimit": "탄창 제한",
    "settings.humanTargets": "사람 형태 표적",
    "settings.humanTargetsNote": "끔: 어느 각도에서도 크기가 같은 구체입니다. 켬: 머리·몸·다리 부위가 나뉘어진 인체형 표적이 등장하고, 헤드샷은 즉석에서 표시되며 결과 화면에 집계됩니다.",
    "settings.magazineLimitNote": "끔: 재장전 없이 무제한으로 발사합니다. 켬: 모든 무기가 실제 탄창과 재장전, 불발을 그대로 따릅니다. 연사속도와 볼트 재장전, 명중률은 어느 쪽이든 동일합니다.",
    "settings.wallColor": "벽 색상",
    "settings.floorColor": "바닥 색상",
    "settings.brightness": "밝기",
    "settings.fov": "시야각(FOV)",
    "aria.wallColor": "벽 색상",
    "aria.floorColor": "바닥 색상",

    "tip.trendUp": "최근 평균보다 정확도가 {delta}점 올랐습니다 — 방금 한 대로만 계속하세요.",
    "tip.trendDown": "최근 평균보다 정확도가 {delta}점 떨어졌습니다 — 워밍업을 조금 더 하거나 감도가 흔들리지 않았는지 확인해보세요.",
    "tip.gridshotLow": "그리드샷 기준으로 정확도 {accuracy}%는 다소 낮은 편입니다 — 속도를 살짝 줄이고 발사 전에 조준을 한 번 더 확인해보세요.",
    "tip.gridshotHigh": "정확도 {accuracy}%는 훌륭합니다 — 타겟 반경을 줄이거나 세션 시간을 줄여 난이도를 높여보세요.",
    "tip.gridshotOvershoot": "첫 플릭이 타겟을 지나치는 경향이 있습니다 — 감도를 조금 낮추거나 플릭 스윙을 짧게 가져가보세요.",
    "tip.gridshotUndershoot": "첫 플릭이 타겟에 못 미치는 경향이 있습니다 — 감도를 조금 높이거나 초기 스윙을 더 확실히 해보세요.",
    "tip.gridshotTtkVariance": "타겟마다 처치 시간 편차가 큽니다 — 서두르기보다 일정한 리듬을 유지하는 데 집중해보세요.",
    "tip.trackingLow": "명중 유지 비율이 {accuracy}%로 낮습니다 — 타겟 속도를 줄이거나 트래킹이 매끄러워질 때까지 타겟을 크게 해보세요.",
    "tip.trackingChoppy": "명중 유지 시간이 하나의 매끄러운 유지가 아니라 짧게 끊어져 이어지고 있습니다 — 재조준보다는 작고 연속적인 보정에 집중해보세요.",
    "tip.trackingSmooth": "훌륭한 지속 트래킹입니다 — 대부분의 유지 시간이 하나의 길고 끊김 없는 유지에서 나오고 있습니다.",
    "tip.switchingLow": "정확도 {accuracy}% — 속도보다 다음 타겟을 정확히 고르는 것을 우선하세요.",
    "tip.switchingInconsistent": "타겟 간 전환 시간이 일정하지 않습니다 — 일부 전환이 유독 느립니다. 현재 타겟을 마무리하기 전에 다음 타겟을 미리 스캔해보세요.",
    "tip.switchingConsistent": "타겟 간 전환 시간이 매우 일정합니다 — 타겟 대 타겟 리듬이 탄탄합니다.",
    "tip.reactionFalseStartOne": "성급한 클릭이 {count}회 있었습니다 — 타겟이 나타나기 전에 클릭하고 있습니다. 예측하지 말고 플래시를 보고 반응해보세요.",
    "tip.reactionFalseStartOther": "성급한 클릭이 {count}회 있었습니다 — 타겟이 나타나기 전에 클릭하고 있습니다. 예측하지 말고 플래시를 보고 반응해보세요.",
    "tip.reactionTimeouts": "노출 시간 안에 놓치는 타겟이 꽤 있습니다 — 더 빨리 클릭하는 것보다 플래시를 빨리 포착하는 게 핵심입니다.",
    "tip.reactionInconsistent": "반복마다 반응 속도 편차가 큽니다 — 긴장하기보다 편안하게 준비된 상태를 유지해보세요.",
    "tip.reactionFast": "평균 {ms}ms는 매우 빠릅니다 — 반응 속도가 뛰어납니다.",
    "tip.solidSession": "탄탄한 세션이었습니다 — 특별히 짚을 문제는 없네요. 이대로 계속하세요.",
    "tip.historyImproved": "이 모드의 초기 세션 대비 평균 정확도가 {delta}점 향상되었습니다.",
    "tip.historyDropped": "초기 세션 대비 평균 정확도가 {delta}점 하락했습니다 — 감도나 워밍업 루틴을 점검해볼 만합니다.",
    "tip.historyOvershootBias": "전체 기록을 보면 언더슈트보다 오버슈트가 더 잦습니다 ({overshoot} 대 {undershoot}) — 감도를 살짝 낮추면 도움이 될 수 있습니다.",
    "tip.historyUndershootBias": "전체 기록을 보면 오버슈트보다 언더슈트가 더 잦습니다 ({undershoot} 대 {overshoot}) — 감도를 살짝 높이거나 스윙을 더 확실히 해보세요.",

    // Weapons
    "weapon.rifle": "\ub77c\uc774\ud50c",
    "weapon.carbine": "\uce74\ube48",
    "weapon.smg": "SMG",
    "weapon.sniper": "\uc800\uaca9\ucd1d",
    "weapon.shotgun": "\uc0f7\uac74",
    "weapon.breacher": "\ube0c\ub9ac\ucc98",
    "weapon.pistol": "\uad8c\ucd1d",
    "weapon.revolver": "\ub9ac\ubcfc\ubc84",

    // Weapon select
    "weaponSelect.title": "\ubb34\uae30 \uc120\ud0dd",
    "weaponSelect.intro": "\ubb34\uae30\ub9c8\ub2e4 \ubc1c\uc0ac\uac10\uacfc \ubc18\ub3d9, \uc18c\ub9ac\uac00 \uc804\ubd80 \ub2e4\ub985\ub2c8\ub2e4. \uc9c1\uc811 \uace8\ub77c \uc4f0\uba74\uc11c \ud655\uc778\ud574 \ubcf4\uc138\uc694.",
    "weaponSelect.confirm": "\uc0ac\uaca9\uc7a5 \uc785\uc7a5",

    // In-range HUD
    "hud.reloading": "\uc7ac\uc7a5\uc804 \uc911",
    "hud.cycling": "\uc7a5\uc804 \uc911",
    "start.reloadHint": "\uc7ac\uc7a5\uc804",
    "start.adsHint": "\uc815\ubc00\uc870\uc900",
    "start.rmb": "\uc6b0\ud074\ub9ad",

    // Suggestion box
    "nav.suggestions": "\uac74\uc758\ud568",
    "nav.admin": "\uad00\ub9ac\uc790",
    "suggestions.title": "\uac74\uc758\ud568",
    "suggestions.localNote": "AimonSite\ub294 \uc11c\ubc84\uac00 \uc5c6\uc5b4\uc11c \uae00\uc740 \uc774 \ube0c\ub77c\uc6b0\uc800\uc5d0\ub9cc \uc800\uc7a5\ub429\ub2c8\ub2e4. \uc5b4\ub514\uc5d0\ub3c4 \uc5c5\ub85c\ub4dc\ub418\uac70\ub098 \uacf5\uc720\ub418\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.",
    "suggestions.category": "\ubd84\ub958",
    "suggestions.category.suggestion": "\uac74\uc758\uc0ac\ud56d",
    "suggestions.category.bug": "\uc624\ub958 \uc218\uc815",
    "suggestions.titlePlaceholder": "\uc81c\ubaa9",
    "suggestions.bodyPlaceholder": "\ub0b4\uc6a9\uc744 \uc801\uc5b4\uc8fc\uc138\uc694 \u2014 \ucd5c\ub300 1,000\uc790.",
    "suggestions.submit": "\ub4f1\ub85d",
    "suggestions.filter.all": "\uc804\uccb4",
    "suggestions.filter.mine": "\ub0b4 \uae00",
    "suggestions.empty": "\uc544\uc9c1 \uae00\uc774 \uc5c6\uc2b5\ub2c8\ub2e4. \uccab \uae00\uc744 \ub0a8\uaca8\ubcf4\uc138\uc694.",
    "suggestions.reply": "\ub313\uae00",
    "suggestions.replyPlaceholder": "\ub313\uae00\uc744 \ub0a8\uae30\uc138\uc694\u2026",
    "suggestions.replyCount": "\ub313\uae00 {value}\uac1c",
    "suggestions.newReply": "\uad00\ub9ac\uc790\uc758 \uc0c8 \ub2f5\uae00",
    "suggestions.you": "\ub098",
    "suggestions.anonymous": "\uc775\uba85",
    "suggestions.adminLabel": "\uad00\ub9ac\uc790",
    "suggestions.status.open": "\uc811\uc218\ub428",
    "suggestions.status.planned": "\ubc18\uc601 \uc608\uc815",
    "suggestions.status.resolved": "\ucc98\ub9ac\ub428",
    "suggestions.status.declined": "\ubc18\uc601 \uc548 \ud568",
    "suggestions.error.empty": "\uc81c\ubaa9\uacfc \ub0b4\uc6a9\uc744 \ubaa8\ub450 \uc785\ub825\ud574\uc8fc\uc138\uc694.",
    "suggestions.error.storage": "\uc800\uc7a5\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4 \u2014 \ube0c\ub77c\uc6b0\uc800 \uc800\uc7a5\uc18c\ub97c \uc4f8 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.",
    "suggestions.error.signin": "글을 쓰려면 로그인하세요 — 공용 게시판의 글은 계정 이름으로 등록됩니다.",
    "suggestions.error.forbidden": "이 계정에게 허용되지 않은 작업입니다.",
    "suggestions.error.backend": "서버에 연결하지 못했습니다. 작성한 내용은 저장되지 않았습니다.",
    "account.signIn": "Google로 로그인",
    "account.signInFailed": "지금은 로그인할 수 없습니다.",
    "account.toastSignedIn": "{name} 계정으로 로그인되었습니다",
    "account.toastSignedOut": "로그아웃되었습니다",
    "home.loadout": "장비",
    "home.changeWeapon": "변경",
    "home.humanTargetsNote": "머리·몸통·다리 부위 판정",
    "home.magazineLimitNote": "재장전과 불발, 실제 탄창 적용",
    "account.signOut": "로그아웃",
    "account.needed": "공용 게시판에 글을 쓰려면 로그인하세요.",
    "account.localBoard": "여기에 쓴 글은 이 브라우저에만 저장됩니다.",
    "account.sharedBoard": "{name} 계정으로 작성 중입니다.",

    // Admin
    "admin.title": "\uad00\ub9ac\uc790",
    "admin.warning": "\uc774 \ud654\uba74\uc740 \uc778\uc99d\ub41c \uacc4\uc815\uc774 \uc544\ub2c8\ub77c \ub85c\uceec \ubcf4\uae30 \uc5ed\ud560\uc785\ub2c8\ub2e4. \uc11c\ubc84\uac00 \uc5c6\uc73c\ubbc0\ub85c \uc778\uc99d\ud560 \ub300\uc0c1\ub3c4 \uc5c6\uc2b5\ub2c8\ub2e4 \u2014 \uad00\ub9ac UI \ubbf8\ub9ac\ubcf4\uae30\ub85c \uc0dd\uac01\ud574 \uc8fc\uc138\uc694.",
    "admin.filter.unanswered": "\ub2f5\ubcc0 \ud544\uc694",
    "admin.summary.total": "\uc804\uccb4 \uae00",
    "admin.summary.needsReply": "\ub2f5\ubcc0 \ud544\uc694",
    "admin.summary.bugs": "\uc624\ub958 \uc81c\ubcf4",
    "admin.setStatus": "\uc0c1\ud0dc",
    "admin.reply": "\uad00\ub9ac\uc790\ub85c \ub2f5\ubcc0",
    "admin.replyPlaceholder": "\uc774 \uae00\uc5d0 \ub2f5\ubcc0\ud558\uae30\u2026",
    "admin.delete": "\uc0ad\uc81c",
    "admin.deleteConfirm": "\ud55c \ubc88 \ub354 \ub204\ub974\uba74 \uc0ad\uc81c",
    "admin.empty": "\uc870\uac74\uc5d0 \ub9de\ub294 \uae00\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.",
    "admin.signOut": "\uad00\ub9ac\uc790 \ubaa8\ub4dc \uc885\ub8cc",

    // Settings additions
    "settings.targetColor": "\ud0c0\uac9f \uc0c9\uc0c1",
    "settings.targetColorNote": "\ud06c\ub85c\uc2a4\ud5e4\uc5b4 \uc0c9\uc0c1\uacfc\ub294 \ubcc4\uac1c\uc785\ub2c8\ub2e4 \u2014 \uadf8\ucabd\uc740 \ud06c\ub85c\uc2a4\ud5e4\uc5b4 \uc124\uc815\uc5d0\uc11c \ubc14\uafc9\ub2c8\ub2e4.",
    "crosshair.colorNote": "\ud0c0\uac9f \uc0c9\uc0c1\uc740 \uc124\uc815 \ud654\uba74\uc5d0\uc11c \ub530\ub85c \uc9c0\uc815\ud569\ub2c8\ub2e4.",
    "aria.targetColor": "\ud0c0\uac9f \uc0c9\uc0c1",
  },
};

export function getLanguage() {
  migrateKey("lang");
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "ko" || stored === "en" ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

export function setLanguage(lang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // localStorage unavailable — language choice just won't persist.
  }
  for (const cb of listeners) cb(lang);
}

const listeners = new Set();

export function onLanguageChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function t(key, params) {
  const lang = getLanguage();
  const dict = STRINGS[lang] || STRINGS.en;
  let str = dict[key] ?? STRINGS.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return str;
}

// Walks `[data-i18n]` (textContent), `[data-i18n-html]` (innerHTML — only
// used for the couple of headline strings that need an embedded highlight
// span; every value comes from the static dictionary above, never user
// input) and `[data-i18n-attr]` (comma-separated "attr:key" pairs, e.g.
// aria-label translations) under `root`, plus <html lang>.
export function applyTranslations(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
  for (const el of root.querySelectorAll("[data-i18n-html]")) {
    el.innerHTML = t(el.dataset.i18nHtml);
  }
  for (const el of root.querySelectorAll("[data-i18n-attr]")) {
    for (const pair of el.dataset.i18nAttr.split(",")) {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  }
  document.documentElement.lang = getLanguage();
}
