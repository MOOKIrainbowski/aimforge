const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  // --- Reaction mode: give it real time to complete its rep count ---
  await page.goto("http://localhost:8123/app/index.html?duration=2500", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="reaction"]');
  await page.click("#home-start");
  await page.waitForTimeout(200);

  // Click center repeatedly for up to 20s — targets spawn within the
  // spawn volume which projects roughly to the center of the screen at
  // this camera's default orientation.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const summaryUp = await page.evaluate(
      () => !document.getElementById("summary-screen").classList.contains("hidden")
    );
    if (summaryUp) break;
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.waitForTimeout(30);
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  const reactionSummaryVisible = await page.evaluate(
    () => !document.getElementById("summary-screen").classList.contains("hidden")
  );
  const reactionSummaryText = await page.evaluate(() =>
    document.getElementById("summary-stats").textContent.trim().replace(/\s+/g, " ")
  );
  console.log(`[reaction] summary appeared within 20s: ${reactionSummaryVisible}`);
  console.log(`[reaction] summary: ${reactionSummaryText}`);

  // --- Gridshot: dense grid of aim points to confirm real hit registration ---
  await page.goto("http://localhost:8123/app/index.html?duration=8000", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(200);

  const gridPoints = [];
  for (let gx = 300; gx <= 980; gx += 40) {
    for (let gy = 250; gy <= 550; gy += 40) {
      gridPoints.push([gx, gy]);
    }
  }
  for (const [x, y] of gridPoints) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(15);
    await page.mouse.up();
  }

  const gridshotHud = await page.evaluate(() => document.getElementById("hud").textContent.trim());
  console.log(`[gridshot] HUD after dense sweep: ${gridshotHud.replace(/\s+/g, " ")}`);

  console.log("---- PAGE ERRORS ----");
  for (const e of pageErrors) console.log(e);
  console.log(`Total page errors: ${pageErrors.length}`);

  await browser.close();
})();
