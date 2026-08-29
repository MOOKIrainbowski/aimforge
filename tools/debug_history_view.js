const { chromium } = require("playwright");

async function playAndReturn(page, mode) {
  await page.click(`.mode-card[data-mode="${mode}"]`);
  await page.click("#home-start");
  await page.waitForTimeout(2400);
  await page.click("#summary-menu");
  await page.waitForTimeout(200);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("http://localhost:8123/app/index.html?duration=2000", { waitUntil: "load" });
  await page.waitForTimeout(300);

  // Play a few gridshot sessions so the trend chart has multiple points.
  await playAndReturn(page, "gridshot");
  await playAndReturn(page, "gridshot");
  await playAndReturn(page, "gridshot");

  // Open history from the home screen.
  await page.click("#home-history");
  await page.waitForTimeout(300);

  const historyVisible = await page.evaluate(
    () => !document.getElementById("history-screen").classList.contains("hidden")
  );
  console.log(`History screen visible: ${historyVisible}`);

  await page.screenshot({ path: __dirname + "/aimonsite_history.png" });

  // Hover over the chart to trigger the tooltip.
  await page.hover("#history-chart", { position: { x: 300, y: 100 } });
  await page.waitForTimeout(150);
  const tooltipVisible = await page.evaluate(
    () => !document.getElementById("history-tooltip").classList.contains("hidden")
  );
  console.log(`Tooltip visible on hover: ${tooltipVisible}`);
  await page.screenshot({ path: __dirname + "/aimonsite_history_tooltip.png" });

  // Switch metric to accuracy and confirm the chart redraws without error.
  await page.click('#history-metric-group button[data-metric="accuracy"]');
  await page.waitForTimeout(150);

  // Switch mode to a mode with zero sessions and confirm the empty state renders.
  await page.click('#history-mode-group button[data-mode="tracking"]');
  await page.waitForTimeout(150);
  await page.screenshot({ path: __dirname + "/aimonsite_history_empty.png" });

  // Back button returns to the home screen cleanly.
  await page.click("#history-back");
  await page.waitForTimeout(200);
  const homeVisibleAfterBack = await page.evaluate(
    () => !document.getElementById("home-screen").classList.contains("hidden")
  );
  console.log(`Home visible after history Back: ${homeVisibleAfterBack}`);

  console.log(`Page errors: ${pageErrors.length}`);
  for (const e of pageErrors) console.log(e);

  await browser.close();
})();
