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
  page.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") return;
    messages.push(`[console.${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => messages.push(`[pageerror] ${err.message}`));

  await page.goto("http://localhost:8123/app/index.html", { waitUntil: "load" });
  await page.waitForTimeout(500);

  await page.click("#scene", { position: { x: 640, y: 400 } });
  await page.waitForTimeout(300);

  const lockedAfterClick = await page.evaluate(() => document.pointerLockElement !== null);
  messages.push(`pointerLockElement set after click: ${lockedAfterClick}`);

  await page.screenshot({ path: __dirname + "/aimonsite_locked.png" });

  await page.mouse.move(700, 400, { steps: 5 });
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();

  await page.waitForTimeout(300);
  await page.screenshot({ path: __dirname + "/aimonsite_after_move.png" });

  const hudText = await page.evaluate(() => {
    const hud = document.getElementById("hud");
    return hud ? hud.textContent : "(no #hud element)";
  });
  messages.push(`HUD text: ${hudText}`);

  console.log("---- RESULTS ----");
  for (const m of messages) console.log(m);
  console.log("---- END ----");

  await browser.close();
})();
