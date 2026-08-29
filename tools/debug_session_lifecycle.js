const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const messages = [];
  page.on("pageerror", (err) => messages.push(`[pageerror] ${err.message}`));

  await page.goto("http://localhost:8123/app/index.html?duration=3000", { waitUntil: "load" });
  await page.waitForTimeout(300);

  await page.click("#scene", { position: { x: 640, y: 400 } });
  await page.waitForTimeout(200);

  // Fire a few shots at slightly different points to exercise handleShot,
  // hit or miss doesn't matter for this test — we're checking the
  // session-end -> summary -> retry lifecycle.
  for (const [x, y] of [[640, 400], [600, 380], [680, 420]]) {
    await page.mouse.move(x, y, { steps: 3 });
    await page.mouse.down();
    await page.waitForTimeout(50);
    await page.mouse.up();
  }

  // Wait past the 3s session duration.
  await page.waitForTimeout(3200);

  const summaryVisible = await page.evaluate(() => {
    const el = document.getElementById("summary-screen");
    return el && !el.classList.contains("hidden");
  });
  messages.push(`Summary screen visible after duration elapsed: ${summaryVisible}`);

  const summaryText = await page.evaluate(() => document.getElementById("summary-stats").textContent.trim());
  messages.push(`Summary content: ${summaryText.replace(/\s+/g, " ")}`);

  await page.screenshot({ path: __dirname + "/aimforge_summary.png" });

  // Click Retry and confirm a new session starts (pointer re-locks, HUD resets).
  await page.click("#summary-retry");
  await page.waitForTimeout(400);

  const relocked = await page.evaluate(() => document.pointerLockElement !== null);
  const summaryHiddenAgain = await page.evaluate(() => {
    const el = document.getElementById("summary-screen");
    return el.classList.contains("hidden");
  });
  messages.push(`Re-locked after Retry click: ${relocked}`);
  messages.push(`Summary hidden again after Retry: ${summaryHiddenAgain}`);

  console.log("---- RESULTS ----");
  for (const m of messages) console.log(m);
  console.log("---- END ----");

  await browser.close();
})();
