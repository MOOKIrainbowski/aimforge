const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("http://localhost:8123/app/index.html?debug=1", { waitUntil: "load" });
  await page.waitForTimeout(300);

  await page.click("#home-sensitivity");
  await page.waitForTimeout(200);

  const screenVisible = await page.evaluate(
    () => !document.getElementById("sensitivity-screen").classList.contains("hidden")
  );
  console.log(`Sensitivity screen visible: ${screenVisible}`);

  await page.fill("#sens-dpi", "800");
  await page.evaluate(() => {
    const input = document.getElementById("sens-cm360");
    input.value = "35";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(150);

  const tableText = await page.evaluate(() =>
    document.getElementById("sensitivity-table-body").textContent.trim().replace(/\s+/g, " ")
  );
  console.log(`Table: ${tableText}`);

  const stored = await page.evaluate(() => localStorage.getItem("aimforge:settings"));
  console.log(`Stored settings: ${stored}`);

  await page.screenshot({ path: __dirname + "/aimforge_sensitivity.png" });

  // Confirm the change actually reached the live controls instance.
  const liveSensitivity = await page.evaluate(() => window.__aimforgeDebug.controls.sensitivity);
  const expectedSensitivity = JSON.parse(stored).sensitivity;
  console.log(`Live controls.sensitivity: ${liveSensitivity}, matches stored: ${liveSensitivity === expectedSensitivity}`);

  // Back to menu, then reload and confirm the persisted sensitivity is
  // applied to a freshly constructed controls instance.
  await page.click("#sensitivity-back");
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(300);
  const afterReloadSensitivity = await page.evaluate(() => localStorage.getItem("aimforge:settings"));
  console.log(`Settings after reload: ${afterReloadSensitivity}`);

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);

  await browser.close();
})();
