const { chromium } = require("playwright");

// The guided first run. Run `npm run serve` first.
//
// Two things are worth checking here and they pull in opposite directions.
// It has to appear on its own for someone who has never been here — that is
// the entire point of it — and it has to never appear again after that, or it
// stops being a welcome and becomes a nag. Everything else is about the tour
// pointing at the right things: each step rings a real element on the home
// screen, and the card has to clear the thing it is explaining rather than
// sit on top of it.

const BASE = "http://localhost:8123/app/index.html?debug=1";
const STEPS = 7;

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

async function open(page) {
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.waitForTimeout(800);
}

const visible = (page, selector) => page.$eval(selector, (el) => !el.classList.contains("hidden"));

// Does the card overlap the ring it is placed against? Every step but the
// first has one, and covering the element being explained is the one way this
// screen can be actively unhelpful.
async function overlap(page) {
  return page.evaluate(() => {
    const spot = document.getElementById("tutorial-spotlight");
    if (spot.classList.contains("hidden")) return null;
    const a = document.getElementById("tutorial-card").getBoundingClientRect();
    const b = spot.getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return w > 0 && h > 0 ? Math.round(w * h) : 0;
  });
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  // No seeded "seen" flag here, unlike every other harness: a browser with
  // nothing stored is the subject of this file rather than an obstacle to it.
  page.on("pageerror", (err) => {
    failures++;
    console.log(`  [FAIL] page error — ${err.message}`);
  });

  console.log("\n1. A first-time visitor is shown it without asking");
  await open(page);
  check("the tour is open", await visible(page, "#tutorial"));
  check("on the first step", (await page.$eval("#tutorial-count", (el) => el.textContent)) === `1 / ${STEPS}`);
  check("with nowhere to go back to", await page.$eval("#tutorial-back", (el) => el.disabled === true));

  console.log("\n2. Every step points at something that is really there");
  const nextLabel = await page.$eval("#tutorial-next", (el) => el.textContent.trim());
  for (let step = 1; step <= STEPS; step++) {
    const state = await page.evaluate(() => ({
      count: document.getElementById("tutorial-count").textContent,
      title: document.getElementById("tutorial-title").textContent.trim(),
      body: document.getElementById("tutorial-body").textContent.trim(),
      ringed: !document.getElementById("tutorial-spotlight").classList.contains("hidden"),
    }));
    check(`step ${step} is numbered and written`, state.count === `${step} / ${STEPS}` && state.title.length > 0 && state.body.length > 40, `${state.count} "${state.title}"`);
    // The opening step is about the whole page, so it has nothing to ring.
    if (step > 1) {
      check(`step ${step} rings an element`, state.ringed);
      check(`step ${step}'s card clears it`, (await overlap(page)) === 0, `overlap=${await overlap(page)}px²`);
    }
    if (step < STEPS) {
      await page.click("#tutorial-next");
      await page.waitForTimeout(400);
    }
  }
  check(
    "the last step offers a way in rather than another Next",
    (await page.$eval("#tutorial-next", (el) => el.textContent.trim())) !== nextLabel,
    await page.$eval("#tutorial-next", (el) => el.textContent.trim())
  );

  console.log("\n3. Back walks it in reverse");
  await page.click("#tutorial-back");
  await page.waitForTimeout(300);
  check("one step back", (await page.$eval("#tutorial-count", (el) => el.textContent)) === `${STEPS - 1} / ${STEPS}`);

  console.log("\n4. Finishing it is the end of it");
  await page.click("#tutorial-next");
  await page.waitForTimeout(300);
  await page.click("#tutorial-next");
  await page.waitForTimeout(300);
  check("the tour closes", (await visible(page, "#tutorial")) === false);
  check("and says so where it will be looked for", await page.evaluate(() => localStorage.getItem("aimonsite:tutorialSeen") === "1"));
  check("the home screen is usable again", await visible(page, "#home-screen"));

  await open(page);
  check("a second visit is not interrupted", (await visible(page, "#tutorial")) === false);

  console.log("\n5. But it stays reachable");
  await page.click("#home-tutorial");
  await page.waitForTimeout(400);
  check("the sidebar reopens it", await visible(page, "#tutorial"));
  check("from the beginning", (await page.$eval("#tutorial-count", (el) => el.textContent)) === `1 / ${STEPS}`);

  await page.click("#tutorial-skip");
  await page.waitForTimeout(300);
  check("and Skip leaves at once", (await visible(page, "#tutorial")) === false);

  console.log("\n6. Skipping on a first visit still counts as answered");
  await page.evaluate(() => localStorage.removeItem("aimonsite:tutorialSeen"));
  await open(page);
  check("it is offered again to a browser that has forgotten", await visible(page, "#tutorial"));
  await page.click("#tutorial-skip");
  await page.waitForTimeout(300);
  await open(page);
  check("skipping is not 'ask me later'", (await visible(page, "#tutorial")) === false);

  console.log("\n7. It never opens over a session");
  await page.evaluate(() => localStorage.removeItem("aimonsite:tutorialSeen"));
  await open(page);
  await page.click("#tutorial-skip");
  await page.waitForTimeout(200);
  await page.click('.mode-card[data-mode="gridshot"]');
  await page.click("#home-start");
  await page.waitForTimeout(300);
  await page.mouse.click(640, 400);
  await page.waitForTimeout(400);
  check("a drill is running", await page.evaluate(() => Boolean(window.__aimonsiteDebug.drill)));
  check("with no tour over it", (await visible(page, "#tutorial")) === false);

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
