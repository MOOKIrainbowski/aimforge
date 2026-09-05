const { chromium } = require("playwright");

// Covers the home screen's own surface: the loadout row, the two range
// switches mirrored from Settings, and the account control — including the
// thing that prompted it, which is that signing out used to leave no trace on
// screen at all. Run `npm run serve` first.
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
  page.on("pageerror", (err) => {
    failures++;
    console.log(`  [FAIL] page error — ${err.message}`);
  });
  await installRoutes(page);

  console.log("\n1. The loadout row");
  await open(page);
  const loadout = await page.evaluate(() => ({
    visible: !document.getElementById("home-loadout").classList.contains("hidden"),
    name: document.getElementById("loadout-name").textContent,
    meta: document.getElementById("loadout-meta").textContent,
  }));
  check("the equipped weapon is shown on the home screen", loadout.visible && loadout.name.length > 0, JSON.stringify(loadout));
  check("with its fire mode", loadout.meta.length > 0, loadout.meta);

  await page.waitForTimeout(2500);
  check(
    "and a picture rendered from the model",
    await page.$eval("#loadout-image", (el) => el.naturalWidth > 0)
  );

  console.log("\n2. Changing the loadout does not start a session");
  await page.click("#home-loadout");
  await page.waitForTimeout(300);
  check("the picker opens", await page.$eval("#weapon-screen", (el) => !el.classList.contains("hidden")));

  await page.click('.weapon-option[data-weapon="sniper"]');
  await page.click("#weapon-confirm");
  await page.waitForTimeout(400);
  check("confirming returns to the home screen", await page.$eval("#home-screen", (el) => !el.classList.contains("hidden")));
  check("rather than entering the range", await page.$eval("#hud-weapon", (el) => el.classList.contains("hidden")));
  check(
    "and the row shows the new weapon",
    (await page.$eval("#loadout-name", (el) => el.textContent)).toLowerCase().includes("sniper"),
    await page.$eval("#loadout-name", (el) => el.textContent)
  );
  check(
    "which is remembered",
    await page.evaluate(() => JSON.parse(localStorage.getItem("aimonsite:settings")).weaponId === "sniper")
  );

  console.log("\n3. Range switches, mirrored from Settings");
  await page.click("#home-human-switch");
  await page.waitForTimeout(150);
  check(
    "turning Human Targets on from the home screen persists",
    await page.evaluate(() => JSON.parse(localStorage.getItem("aimonsite:rangeConfig")).humanTargets === true)
  );

  await page.click("#home-settings-btn");
  await page.waitForTimeout(200);
  check(
    "and Settings agrees",
    await page.$eval("#magazine-switch", () => true) &&
      (await page.$eval("#human-targets-switch", (el) => el.getAttribute("aria-checked") === "true"))
  );

  await page.click("#human-targets-switch");
  await page.click("#settings-back");
  await page.waitForTimeout(250);
  check(
    "changing it back in Settings is reflected on the home screen",
    await page.$eval("#home-human-switch", (el) => el.getAttribute("aria-checked") === "false")
  );

  console.log("\n4. With no backend, the account control is absent");
  check("no account row", await page.$eval("#account-row", (el) => el.classList.contains("hidden")));

  console.log("\n5. Signed in, the account sits at the top of the page");
  configured = true;
  await open(page);
  check("the sign-in button is in the top bar", await page.$eval("#account-signin", (el) => el.closest(".home-topbar") !== null));

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
