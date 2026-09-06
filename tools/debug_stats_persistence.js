const { chromium } = require("playwright");

async function playOneSession(page, mode) {
  await page.click(`.mode-card[data-mode="${mode}"]`);
  await page.click("#home-start");
  await page.waitForTimeout(300);
  await page.waitForTimeout(2300); // duration=2000 override + margin
  await page.click("#summary-menu");
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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

  await page.goto("http://localhost:8123/app/index.html?duration=2000", { waitUntil: "load" });
  await page.waitForTimeout(300);

  await playOneSession(page, "gridshot");
  await playOneSession(page, "reaction");

  const stored = await page.evaluate(() => localStorage.getItem("aimonsite:sessions"));
  const parsed = JSON.parse(stored);
  console.log(`Sessions stored: ${parsed.sessions.length}`);
  console.log(`Modes: ${parsed.sessions.map((s) => s.mode).join(", ")}`);
  console.log(`Schema version: ${parsed.version}`);

  // Reload the page fresh and confirm the data survives (real persistence,
  // not just an in-memory variable).
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  const storedAfterReload = await page.evaluate(() => localStorage.getItem("aimonsite:sessions"));
  const parsedAfterReload = JSON.parse(storedAfterReload);
  console.log(`Sessions after reload: ${parsedAfterReload.sessions.length}`);

  await browser.close();
})();
