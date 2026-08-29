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
    "nav.why": "Why AimonSite",
    "nav.drills": "Drills",
    "nav.how": "How it works",
    "nav.history": "View History",
    "nav.crosshair": "Customize Crosshair",
    "nav.sensitivity": "Sensitivity",
    "nav.backToLanding": "Back to landing page",
    "nav.settingsAria": "Open settings",
    "cta.launchNav": "Launch AimonSite",
    "cta.launch": "Launch AimonSite →",

    // Landing hero
    "hero.eyebrow": "Free · No install · No account",
    "hero.title.html": 'Sharpen your <span class="gradient">aim</span>,<br />right in your browser.',
    "hero.sub": "AimonSite is a fast, distraction-free FPS aim trainer that runs entirely client-side. Four drill types, a real mouse-sensitivity converter, and rule-based coach feedback — no download, no login, and your stats never leave your device.",
    "hero.secondaryBtn": "Why it's different",
    "hero.meta1": "🖱️ Raw mouse input, sensitivity-matched to your main game",
    "hero.meta2": "💾 Stats stored locally",
    "hero.captionMode": "GRIDSHOT",
    "hero.captionPreview": "LIVE PREVIEW",

    // Why section
    "why.eyebrow": "Why AimonSite",
    "why.title": "Built like a tool, not a funnel",
    "why.sub": "Most browser aim trainers push you toward an account, a leaderboard, or a paid tier before you've even taken a shot. AimonSite skips all of that.",
    "feature.instant.title": "Instant, zero-install play",
    "feature.instant.desc": "WebGL in your browser — click Launch and you're on the range in seconds. No client, no updates, no wasted disk space.",
    "feature.privacy.title": "Your data stays yours",
    "feature.privacy.desc": "Every session, every stat, every crosshair preset is saved to your device's local storage — never uploaded to a server you don't control.",
    "feature.sens.title": "Real sensitivity conversion",
    "feature.sens.desc": "Set your actual DPI and cm/360, and AimonSite instantly matches it across Valorant, CS2, Apex, Overwatch 2, and Fortnite.",
    "feature.coach.title": "Coach feedback that isn't generic",
    "feature.coach.desc": "After every session, rule-based tips compare you against your own trend — overshoot bias, tracking consistency, reaction spread — not a canned tip list.",
    "feature.recoil.title": "Recoil control training",
    "feature.recoil.desc": "Practice canceling real per-shot recoil patterns on Rifle and SMG presets, scored on how well you compensate — not just whether you hit.",
    "feature.desktop.title": "A free desktop app, too",
    "feature.desktop.desc": "The exact same trainer as a lightweight desktop build with higher-fidelity shadows, bloom, and reflections for offline practice.",

    // Modes (shared between landing tiles and the app's home screen)
    "modes.eyebrow": "Drills",
    "modes.title": "Four drills, one range",
    "modes.sub": "Each mode trains a distinct aiming skill, with difficulty presets that scale target size, speed, and wave size together.",
    "mode.gridshot.name": "Gridshot",
    "mode.gridshot.desc": "Flick to one target at a time",
    "mode.gridshot.landingDesc": "Flick to one target at a time. Tracks flick overshoot/undershoot bias and time-to-kill.",
    "mode.tracking.name": "Tracking",
    "mode.tracking.desc": "Keep crosshair on a moving target",
    "mode.tracking.landingDesc": "Hold your crosshair on a strafing target. Scored by continuous time-on-target.",
    "mode.switching.name": "Target Switching",
    "mode.switching.short": "Switching",
    "mode.switching.desc": "Clear waves of multiple targets",
    "mode.switching.landingDesc": "Clear waves of simultaneous targets, training fast re-acquisition between them.",
    "mode.reaction.name": "Reaction Time",
    "mode.reaction.short": "Reaction",
    "mode.reaction.desc": "Hit targets before they vanish",
    "mode.reaction.landingDesc": "Targets flash briefly and vanish. Measures raw reaction speed and false starts.",

    // How it works
    "how.eyebrow": "How it works",
    "how.title": "From click to coach feedback in seconds",
    "step1.title": "Pick a drill & tune it",
    "step1.desc": "Choose a mode, difficulty, and session length. Turn on recoil control if you want a weapon pattern to fight.",
    "step2.title": "Step into the range",
    "step2.desc": "Click to lock your mouse and shoot — raw input, matched to the sensitivity you set.",
    "step3.title": "Review & improve",
    "step3.desc": "See your score, accuracy, and coach tips instantly, then track trends and hit-position heatmaps over time.",

    // CTA band + footer
    "cta.title": "Your aim isn't going to train itself.",
    "cta.sub": "No sign-up. No download. Just click, and start flicking.",
    "footer.tagline": "Runs entirely in your browser. No accounts, no tracking, no ads.",

    // App: home screen
    "app.title": "AimonSite — Range",
    "home.eyebrow": "Training Range",
    "home.heroTitle": "Choose your drill.",
    "home.subtitle": "Pick a drill, tune it, and step into the range.",
    "option.difficulty": "Difficulty",
    "option.duration": "Duration",
    "option.recoil": "Recoil Control",
    "option.recoilNote": "Gridshot & Switching only",
    "option.weapon": "Weapon",
    "difficulty.easy": "Easy",
    "difficulty.normal": "Normal",
    "difficulty.hard": "Hard",
    "duration.30": "30s",
    "duration.60": "60s",
    "duration.90": "90s",
    "weapon.rifle": "Rifle",
    "weapon.smg": "SMG",
    "cta.enterRange": "Enter the Range",
    "home.best": "Best {value}",
    "hint.start": "Click to enter the range · Esc to release mouse",

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
    "settings.targetColor": "Target Color",
    "settings.wallColor": "Wall Color",
    "settings.floorColor": "Floor Color",
    "settings.brightness": "Brightness",
    "settings.fov": "Field of View",
    "aria.targetColor": "Target color",
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
  },

  ko: {
    "common.back": "뒤로",
    "common.on": "켜짐",
    "common.off": "꺼짐",
    "common.reset": "기본값으로 재설정",

    "nav.why": "왜 AimonSite인가",
    "nav.drills": "훈련 모드",
    "nav.how": "이용 방법",
    "nav.history": "기록 보기",
    "nav.crosshair": "조준점 커스터마이징",
    "nav.sensitivity": "감도 변환",
    "nav.backToLanding": "랜딩 페이지로 돌아가기",
    "nav.settingsAria": "설정 열기",
    "cta.launchNav": "AimonSite 실행",
    "cta.launch": "AimonSite 실행하기 →",

    "hero.eyebrow": "무료 · 설치 불필요 · 계정 불필요",
    "hero.title.html": '브라우저에서 바로<br /><span class="gradient">에임</span>을 갈고닦으세요.',
    "hero.sub": "AimonSite는 브라우저에서 100% 클라이언트 측으로 동작하는 빠르고 군더더기 없는 FPS 에임 트레이너입니다. 4가지 훈련 모드, 실제 마우스 감도 변환기, 규칙 기반 코치 피드백까지 — 다운로드도, 로그인도 필요 없고 기록은 절대 기기 밖으로 나가지 않습니다.",
    "hero.secondaryBtn": "무엇이 다른가요",
    "hero.meta1": "🖱️ 본인 게임 감도에 맞춘 raw 마우스 입력",
    "hero.meta2": "💾 모든 기록은 기기에 저장",
    "hero.captionMode": "그리드샷",
    "hero.captionPreview": "실시간 미리보기",

    "why.eyebrow": "왜 AimonSite인가",
    "why.title": "깔때기가 아니라 도구로 만들었습니다",
    "why.sub": "대부분의 브라우저 에임 트레이너는 첫 샷을 쏘기도 전에 회원가입, 리더보드, 유료 등급부터 요구합니다. AimonSite는 그런 것 없이 바로 시작합니다.",
    "feature.instant.title": "설치 없이 즉시 플레이",
    "feature.instant.desc": "브라우저에서 바로 실행되는 WebGL — Launch를 누르면 몇 초 안에 사격장에 들어갑니다. 클라이언트도, 업데이트도, 낭비되는 저장공간도 없습니다.",
    "feature.privacy.title": "내 데이터는 내 것",
    "feature.privacy.desc": "모든 세션, 통계, 조준점 프리셋은 기기의 로컬 저장소에만 저장됩니다 — 통제할 수 없는 서버로 업로드되지 않습니다.",
    "feature.sens.title": "실제 감도 변환",
    "feature.sens.desc": "실제 DPI와 cm/360을 입력하면 Valorant, CS2, Apex, Overwatch 2, Fortnite 감도로 즉시 변환해 드립니다.",
    "feature.coach.title": "뻔하지 않은 코치 피드백",
    "feature.coach.desc": "세션이 끝날 때마다 오버슈트 성향, 트래킹 안정성, 반응속도 편차 등 '자신의' 최근 추세와 비교한 규칙 기반 팁을 제공합니다 — 정해진 문구 목록이 아닙니다.",
    "feature.recoil.title": "리코일 컨트롤 훈련",
    "feature.recoil.desc": "라이플·SMG 프리셋의 실제 샷별 반동 패턴을 상쇄하는 연습을 하고, 명중 여부뿐 아니라 보정 정확도까지 채점받습니다.",
    "feature.desktop.title": "무료 데스크톱 앱도 제공",
    "feature.desktop.desc": "동일한 트레이너를 더 고품질의 그림자·블룸·반사 효과가 적용된 가벼운 데스크톱 빌드로 오프라인에서도 연습할 수 있습니다.",

    "modes.eyebrow": "훈련 모드",
    "modes.title": "하나의 사격장, 네 가지 훈련",
    "modes.sub": "각 모드는 서로 다른 에임 능력을 훈련하며, 난이도 프리셋이 타겟 크기·속도·웨이브 규모를 함께 조절합니다.",
    "mode.gridshot.name": "그리드샷",
    "mode.gridshot.desc": "한 번에 하나의 타겟에 플릭",
    "mode.gridshot.landingDesc": "한 번에 하나의 타겟에 플릭합니다. 플릭의 오버슈트/언더슈트 성향과 처치 시간을 기록합니다.",
    "mode.tracking.name": "트래킹",
    "mode.tracking.desc": "움직이는 타겟에 조준점 유지",
    "mode.tracking.landingDesc": "좌우로 움직이는 타겟에 조준점을 유지합니다. 연속 명중 유지 시간으로 채점됩니다.",
    "mode.switching.name": "타겟 스위칭",
    "mode.switching.short": "스위칭",
    "mode.switching.desc": "여러 타겟의 웨이브 처리",
    "mode.switching.landingDesc": "동시에 등장하는 여러 타겟의 웨이브를 처리하며 빠른 재조준을 훈련합니다.",
    "mode.reaction.name": "반응 속도",
    "mode.reaction.short": "반응",
    "mode.reaction.desc": "사라지기 전에 타겟 명중",
    "mode.reaction.landingDesc": "타겟이 짧게 나타났다 사라집니다. 순수 반응 속도와 성급한 클릭(false start)을 측정합니다.",

    "how.eyebrow": "이용 방법",
    "how.title": "클릭부터 코치 피드백까지, 단 몇 초",
    "step1.title": "훈련 선택 및 설정",
    "step1.desc": "모드, 난이도, 세션 길이를 선택하세요. 반동 패턴과 싸우고 싶다면 리코일 컨트롤을 켜세요.",
    "step2.title": "사격장 입장",
    "step2.desc": "클릭해서 마우스를 잠그고 사격하세요 — 설정한 감도에 맞춘 raw 입력입니다.",
    "step3.title": "점검 및 향상",
    "step3.desc": "점수, 정확도, 코치 팁을 즉시 확인하고, 추세와 명중 위치 히트맵으로 장기적인 변화를 추적하세요.",

    "cta.title": "에임은 저절로 늘지 않습니다.",
    "cta.sub": "회원가입도, 다운로드도 필요 없습니다. 클릭 한 번으로 바로 플릭을 시작하세요.",
    "footer.tagline": "브라우저에서 100% 동작합니다. 계정도, 추적도, 광고도 없습니다.",

    "app.title": "AimonSite — 사격장",
    "home.eyebrow": "훈련 사격장",
    "home.heroTitle": "훈련을 선택하세요.",
    "home.subtitle": "훈련을 선택하고, 설정을 조정한 뒤 사격장으로 들어가세요.",
    "option.difficulty": "난이도",
    "option.duration": "시간",
    "option.recoil": "리코일 컨트롤",
    "option.recoilNote": "그리드샷·스위칭 전용",
    "option.weapon": "무기",
    "difficulty.easy": "쉬움",
    "difficulty.normal": "보통",
    "difficulty.hard": "어려움",
    "duration.30": "30초",
    "duration.60": "60초",
    "duration.90": "90초",
    "weapon.rifle": "라이플",
    "weapon.smg": "SMG",
    "cta.enterRange": "사격장 입장",
    "home.best": "최고 {value}",
    "hint.start": "클릭해서 사격장 입장 · Esc로 마우스 잠금 해제",

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
    "settings.targetColor": "타겟 색상",
    "settings.wallColor": "벽 색상",
    "settings.floorColor": "바닥 색상",
    "settings.brightness": "밝기",
    "settings.fov": "시야각(FOV)",
    "aria.targetColor": "타겟 색상",
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
