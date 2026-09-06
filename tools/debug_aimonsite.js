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
