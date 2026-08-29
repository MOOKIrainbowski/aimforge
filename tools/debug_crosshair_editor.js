const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("http://localhost:8123/app/index.html", { waitUntil: "load" });
  await page.waitForTimeout(300);

  await page.click("#home-crosshair");
  await page.waitForTimeout(200);

  const screenVisible = await page.evaluate(
    () => !document.getElementById("crosshair-screen").classList.contains("hidden")
  );
  console.log(`Crosshair screen visible: ${screenVisible}`);

  // Change shape, color, and turn on center dot.
  await page.click('#crosshair-shape-group button[data-shape="circle"]');
  await page.fill("#crosshair-color", "#ff3355");
  await page.click('#crosshair-dot-group button[data-dot="on"]');
  await page.waitForTimeout(150);

  const previewSvg = await page.evaluate(() => document.getElementById("crosshair-preview").innerHTML);
  console.log(`Preview contains circle: ${previewSvg.includes("<circle")}`);
  console.log(`Preview contains chosen color: ${previewSvg.includes("#ff3355")}`);

  await page.screenshot({ path: __dirname + "/aimforge_crosshair_editor.png" });

  // Confirm it persisted to localStorage.
  const stored = await page.evaluate(() => localStorage.getItem("aimforge:crosshair"));
  console.log(`Stored config: ${stored}`);

  // Go back, start a session, and confirm the LIVE gameplay crosshair
  // reflects the same customization (not just the editor's preview).
  await page.click("#crosshair-back");
  await page.waitForTimeout(200);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);

  const liveCrosshairSvg = await page.evaluate(() => document.getElementById("crosshair").innerHTML);
  console.log(`Live crosshair contains circle: ${liveCrosshairSvg.includes("<circle")}`);
  console.log(`Live crosshair contains chosen color: ${liveCrosshairSvg.includes("#ff3355")}`);

  await page.screenshot({ path: __dirname + "/aimforge_crosshair_live.png" });

  // Reload the whole page fresh — confirm the customization survives via
  // localStorage without needing the editor to be reopened.
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  const afterReloadHomeSvg = await page.evaluate(() => {
    // The live #crosshair element is rendered on load even before a
    // session starts (renderCrosshairInto runs at boot), so check it here.
    return document.getElementById("crosshair").innerHTML;
  });
  console.log(`After reload, crosshair still customized: ${afterReloadHomeSvg.includes("#ff3355")}`);

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);

  await browser.close();
})();
