const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto("http://localhost:8123/app/index.html", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.waitForTimeout(150);
  await page.screenshot({ path: __dirname + "/aimforge_home_light.png" });
  await browser.close();
})();
