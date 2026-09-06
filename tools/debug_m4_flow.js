const { chromium } = require("playwright");

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

  const messages = [];
  page.on("pageerror", (err) => messages.push(`[pageerror] ${err.message}`));

  await page.goto("http://localhost:8123/app/index.html?duration=2000", { waitUntil: "load" });
  await page.waitForTimeout(300);

  // 1. Home screen should be visible initially, canvas should NOT be locked yet.
  const homeVisibleInitially = await page.evaluate(
    () => !document.getElementById("home-screen").classList.contains("hidden")
  );
  messages.push(`Home screen visible on load: ${homeVisibleInitially}`);

  await page.screenshot({ path: __dirname + "/aimonsite_m4_home.png" });

  // 2. Pick Hard difficulty + 30s duration, then Start.
  await page.click('#difficulty-group button[data-difficulty="hard"]');
  await page.click('#duration-group button[data-duration="30000"]');
  await page.click("#home-start");
  await page.waitForTimeout(400);

  const lockedAfterStart = await page.evaluate(() => document.pointerLockElement !== null);
  const homeHiddenAfterStart = await page.evaluate(() =>
    document.getElementById("home-screen").classList.contains("hidden")
  );
  messages.push(`Locked after clicking Start: ${lockedAfterStart}`);
  messages.push(`Home hidden after Start: ${homeHiddenAfterStart}`);

  await page.screenshot({ path: __dirname + "/aimonsite_m4_playing.png" });

  // 3. Wait past the (duration-overridden) 2s session length -> summary appears.
  await page.waitForTimeout(2300);
  const summaryVisible = await page.evaluate(
    () => !document.getElementById("summary-screen").classList.contains("hidden")
  );
  messages.push(`Summary visible after session end: ${summaryVisible}`);

  await page.screenshot({ path: __dirname + "/aimonsite_m4_summary.png" });

  // 4. Click "Back to Menu" and confirm we land back on MENU cleanly.
  await page.click("#summary-menu");
  await page.waitForTimeout(300);

  const homeVisibleAfterMenu = await page.evaluate(
    () => !document.getElementById("home-screen").classList.contains("hidden")
  );
  const stillLockedAfterMenu = await page.evaluate(() => document.pointerLockElement !== null);
  messages.push(`Home visible after Back to Menu: ${homeVisibleAfterMenu}`);
  messages.push(`Still locked after Back to Menu: ${stillLockedAfterMenu}`);

  await page.screenshot({ path: __dirname + "/aimonsite_m4_back_to_menu.png" });

  console.log("---- RESULTS ----");
  for (const m of messages) console.log(m);
  console.log("---- END ----");

  await browser.close();
})();
