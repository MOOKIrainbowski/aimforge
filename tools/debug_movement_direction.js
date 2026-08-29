const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  await page.goto("http://localhost:8123/app/index.html?duration=120000", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.click("#scene", { position: { x: 640, y: 400 } });
  await page.waitForTimeout(200);

  const zBefore = await page.evaluate(() => {
    // main.js doesn't expose camera globally; read it back via a hack:
    // we can't reach module-scoped vars, so instead just screenshot and
    // compare visually. Placeholder kept for clarity.
    return null;
  });

  await page.screenshot({ path: __dirname + "/aimforge_before_w.png" });

  await page.keyboard.down("KeyW");
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(200);

  await page.screenshot({ path: __dirname + "/aimforge_after_w_only.png" });

  console.log("Screenshots written: aimforge_before_w.png, aimforge_after_w_only.png");
  await browser.close();
})();
