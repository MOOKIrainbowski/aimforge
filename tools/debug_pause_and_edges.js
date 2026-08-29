const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  // deviceScaleFactor 1.5 mimics common Windows display-scaling setups.
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1.5 });

  await page.goto("http://localhost:8123/app/index.html?duration=120000", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click("#scene", { position: { x: 683, y: 384 } });
  await page.waitForTimeout(300);

  const lockedAfterClick = await page.evaluate(() => document.pointerLockElement !== null);
  console.log(`Locked after click: ${lockedAfterClick}`);

  await page.screenshot({ path: __dirname + "/aimforge_dpr_locked.png" });

  // Playwright's synthetic Escape doesn't reliably trigger the browser's
  // native pointer-unlock in headless mode, so call the API directly —
  // this still exercises the same pointerlockchange handler a real Esc
  // press would.
  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(300);

  const hintText = await page.evaluate(() => document.getElementById("lock-hint").textContent);
  console.log(`Hint text after Esc mid-session: "${hintText}"`);

  await page.screenshot({ path: __dirname + "/aimforge_dpr_paused.png" });

  await browser.close();
})();
