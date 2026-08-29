const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("http://localhost:8123/app/index.html", { waitUntil: "load" });
  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + "/aimforge_home_polish.png" });

  await page.click("#home-history");
  await page.waitForTimeout(250);
  await page.screenshot({ path: __dirname + "/aimforge_history_polish.png" });

  const backBtnStyle = await page.evaluate(() => {
    const el = document.getElementById("history-back");
    const cs = getComputedStyle(el);
    return { background: cs.backgroundColor, border: cs.border, borderRadius: cs.borderRadius, padding: cs.padding };
  });
  console.log("history-back computed style:", JSON.stringify(backBtnStyle));

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);
  await browser.close();
})();
