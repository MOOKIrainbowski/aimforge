const { chromium } = require("playwright");

// Covers the home screen's own surface: that starting a drill goes straight
// into the range, the two range switches mirrored from Settings, and the
// account control — including the thing that prompted it, which is that
// signing out used to leave no trace on screen at all. Run `npm run serve`
// first.
//
// The account half reuses the mocked Supabase from tools/debug_auth.js so it
// runs without a project.

const BASE = "http://localhost:8123/app/index.html?debug=1";
const FAKE_URL = "https://project.supabase.test";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

const USER = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "player@example.com",
  user_metadata: { full_name: "Test Player" },
};

let configured = false;
let loggedOut = false;

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function installRoutes(page) {
  await page.route("**/core/backend/config.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: configured
        ? `export const SUPABASE_URL = ${JSON.stringify(FAKE_URL)};
export const SUPABASE_ANON_KEY = "anon-key";
export function isConfigured() { return true; }
`
        : `export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
export function isConfigured() { return false; }
`,
    })
  );

  await page.route(`${FAKE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/auth/v1/authorize") {
      const back = new URL(url.searchParams.get("redirect_to"));
      back.searchParams.set("code", "auth-code-123");
      return route.fulfill({ status: 302, headers: { location: back.toString() } });
    }
    if (url.pathname === "/auth/v1/token") {
      return json(route, { access_token: "access-token-1", refresh_token: "r1", expires_in: 3600, user: USER });
    }
    if (url.pathname === "/auth/v1/logout") {
      loggedOut = true;
      return json(route, {}, 204);
    }
    if (url.pathname === "/rest/v1/profiles") return json(route, [{ display_name: "Test Player", is_admin: false }]);
    return json(route, []);
  });
}

async function open(page) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  // Every one of these harnesses opens a browser with nothing stored, which
  // is exactly what the guided tour is looking for — it would open over the
  // home screen and swallow the first click. Declaring it seen is the honest
  // way to say "this is not a first-time visitor"; debug_tutorial.js is where
  // the tour itself is driven.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("aimonsite:tutorialSeen", "1");
    } catch {
      // Nothing to do; the tour will open and the run will say so.
    }
  });
  page.on("pageerror", (err) => {
    failures++;
    console.log(`  [FAIL] page error — ${err.message}`);
  });
  await installRoutes(page);

  console.log("\n1. There is nothing about weapons on the home screen");
  await open(page);
  // The loadout row is gone: the weapon is chosen in the range with B, where
  // its handling is the thing you are choosing on. debug_weapons.js section 9
  // covers the picker itself.
  check("no loadout row", await page.$eval("#home-screen", (el) => el.querySelector("#home-loadout") === null));

  console.log("\n2. Starting a drill goes straight into the range");
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(500);
  check("the picker does not stand in the way", await page.$eval("#weapon-screen", (el) => el.classList.contains("hidden")));
  check("the home screen is left", await page.$eval("#home-screen", (el) => el.classList.contains("hidden")));
  check("and the range is waiting to be clicked into", await page.$eval("#start-prompt", (el) => !el.classList.contains("hidden")));

  await open(page);

  console.log("\n3. The two range switches live here and only here");
  await page.click("#home-human-switch");
  await page.waitForTimeout(150);
  check(
    "turning Human Targets on from the home screen persists",
    await page.evaluate(() => JSON.parse(localStorage.getItem("aimonsite:rangeConfig")).humanTargets === true)
  );
  await page.click("#home-magazine-switch");
  await page.waitForTimeout(150);
  check(
    "so does the Magazine Limit",
    await page.evaluate(() => JSON.parse(localStorage.getItem("aimonsite:rangeConfig")).magazineLimit === true)
  );

  // They used to be duplicated under Settings, which meant two switches for
  // one setting and two places to have to look for it.
  await page.click("#home-settings-btn");
  await page.waitForTimeout(200);
  check(
    "Settings no longer carries a second copy of either",
    await page.$eval("#settings-screen", (el) => el.querySelector("#human-targets-switch") === null && el.querySelector("#magazine-switch") === null)
  );

  await page.click("#settings-back");
  await page.waitForTimeout(250);
  check(
    "and the home screen still reads them back correctly",
    (await page.$eval("#home-human-switch", (el) => el.getAttribute("aria-checked"))) === "true" &&
      (await page.$eval("#home-magazine-switch", (el) => el.getAttribute("aria-checked"))) === "true"
  );

  console.log("\n4. With no backend, the account control is absent");
  check("no account row", await page.$eval("#account-row", (el) => el.classList.contains("hidden")));

  console.log("\n5. Signed in, the account sits above Settings");
  configured = true;
  await open(page);
  check(
    "the sign-in button is in the sidebar footer",
    await page.$eval("#account-signin", (el) => el.closest(".sidebar-footer") !== null)
  );
  check(
    "directly above Settings",
    await page.evaluate(() => {
      const footer = document.querySelector(".sidebar-footer");
      const kids = [...footer.children];
      return kids.indexOf(document.getElementById("account-row")) < kids.indexOf(document.getElementById("home-settings-btn"));
    })
  );

  await page.click("#account-signin");
  await page.waitForTimeout(900);
  check("signing in shows the account chip", await page.$eval("#account-signed-in", (el) => !el.classList.contains("hidden")));
  check("with the account name", (await page.$eval("#account-name", (el) => el.textContent)) === "Test Player");
  check(
    "and says so",
    (await page.$eval("#toast-host", (el) => el.textContent)).includes("Test Player"),
    await page.$eval("#toast-host", (el) => el.textContent)
  );

  console.log("\n6. Signing out is visible");
  await page.click("#account-menu-button");
  await page.waitForTimeout(200);
  check("the menu opens with the address in it", await page.$eval("#account-menu-email", (el) => el.textContent === "player@example.com"));

  await page.click("#account-signout");
  await page.waitForTimeout(600);
  check("the server session is revoked", loggedOut);
  check("the chip is replaced by the sign-in button", await page.$eval("#account-signin", (el) => !el.classList.contains("hidden")));
  check("the menu is closed", await page.$eval("#account-menu", (el) => el.classList.contains("hidden")));
  const toast = await page.$eval("#toast-host", (el) => el.textContent.trim());
  check("and a confirmation is shown — the whole point of this pass", toast.length > 0, toast);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
