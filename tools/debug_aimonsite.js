const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const messages = [];
  page.on("console", (msg) => messages.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on("pageerror", (err) => messages.push(`[pageerror] ${err.message}\n${err.stack}`));
  page.on("requestfailed", (req) =>
    messages.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`)
  );

  await page.goto("http://localhost:8123/app/index.html", { waitUntil: "load" });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: __dirname + "/aimonsite_screenshot.png" });

  console.log("---- CONSOLE / ERRORS ----");
  for (const m of messages) console.log(m);
  console.log("---- END ----");

  await browser.close();
})();
