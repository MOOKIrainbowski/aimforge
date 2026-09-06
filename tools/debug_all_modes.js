const { chromium } = require("playwright");

const MODES = ["gridshot", "tracking", "switching", "reaction"];

async function playMode(page, mode) {
  await page.goto("http://localhost:8123/app/index.html?duration=2500", { waitUntil: "load" });
  await page.waitForTimeout(300);

  await page.click(`.mode-card[data-mode="${mode}"]`);
  await page.click("#home-start");
  await page.waitForTimeout(300);

  const locked = await page.evaluate(() => document.pointerLockElement !== null);

  // Fire a bunch of shots at varying points across the exposed target area
  // so every mode (click-based or not) gets exercised.
  const points = [
    [640, 360], [600, 340], [680, 380], [620, 400], [660, 340],
    [600, 380], [700, 360], [640, 400], [580, 360], [660, 400],
  ];
  for (const [x, y] of points) {
    await page.mouse.move(x, y, { steps: 2 });
    await page.mouse.down();
    await page.waitForTimeout(40);
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  await page.waitForTimeout(2500);

  const summaryVisible = await page.evaluate(
    () => !document.getElementById("summary-screen").classList.contains("hidden")
  );
  const summaryText = await page.evaluate(() =>
    document.getElementById("summary-stats").textContent.trim().replace(/\s+/g, " ")
  );

  return { mode, locked, summaryVisible, summaryText };
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  for (const mode of MODES) {
    const result = await playMode(page, mode);
    console.log(`[${mode}] locked=${result.locked} summaryVisible=${result.summaryVisible}`);
    console.log(`[${mode}] summary: ${result.summaryText}`);
  }

  console.log("---- PAGE ERRORS ----");
  for (const e of pageErrors) console.log(e);
  console.log(`Total page errors: ${pageErrors.length}`);

  await browser.close();
})();
