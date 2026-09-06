const { chromium } = require("playwright");

// Exercises the suggestion box through its real screens, and the backend
// seam underneath them. Run `npm run serve` first.
//
// The seam is the point of this file. Everything above core/suggestions/
// backend.js is written against one async contract, so this swaps a stand-in
// "remote" backend in at runtime — exactly what signing in does — and drives
// the real screens against it. If the UI has smuggled in an assumption that
// a read is instant, it fails here rather than the first time someone signs
// in.
//
// The board is also gated on having one of those: a suggestion is the start
// of a conversation and a reply needs somewhere to arrive, so with no
// account there is nothing to read and nowhere to write. Sections 1 and 6
// cover both sides of that gate.

const BASE = "http://localhost:8123/app/index.html?debug=1&admin=1";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

async function openSuggestions(page) {
  await page.click("#home-suggestions");
  await page.waitForTimeout(150);
}

// A backend that answers slowly and keeps its posts in memory: the shape a
// network-backed one has, without a network.
const FAKE_REMOTE = `
  class FakeRemote {
    constructor() { this.posts = []; this.calls = []; }
    get id() { return "remote"; }
    async delay() { await new Promise((r) => setTimeout(r, 30)); }
    async listPosts(filter, actor) {
      this.calls.push("listPosts");
      await this.delay();
      return this.posts
        .filter((p) => (filter.category && filter.category !== "all" ? p.category === filter.category : true))
        .filter((p) => (filter.mine ? p.authorId === actor.id : true))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    async createPost({ category, title, body }, actor) {
      this.calls.push("createPost");
      await this.delay();
      this.posts.push({
        id: String(this.posts.length + 1), category, title, body,
        createdAt: Date.now(), authorId: actor.id, authorName: actor.name || "",
        status: "open", comments: [], readAt: 0,
      });
      return { ok: true };
    }
    async addComment(postId, body, { asAdmin } = {}, actor) {
      this.calls.push("addComment");
      await this.delay();
      const post = this.posts.find((p) => p.id === postId);
      if (!post) return { ok: false, error: "missing" };
      post.comments.push({
        id: String(post.comments.length + 1), body, createdAt: Date.now(),
        byAdmin: Boolean(asAdmin), authorId: asAdmin ? "admin" : actor.id, authorName: "",
      });
      return { ok: true };
    }
    async setStatus(postId, status) {
      this.calls.push("setStatus");
      await this.delay();
      const post = this.posts.find((p) => p.id === postId);
      if (!post) return { ok: false, error: "missing" };
      post.status = status;
      return { ok: true };
    }
    async deletePost(postId) {
      this.calls.push("deletePost");
      await this.delay();
      const i = this.posts.findIndex((p) => p.id === postId);
      if (i === -1) return { ok: false, error: "missing" };
      this.posts.splice(i, 1);
      return { ok: true };
    }
    async markPostRead(postId) {
      await this.delay();
      const post = this.posts.find((p) => p.id === postId);
      if (post) post.readAt = Date.now();
      return { ok: true };
    }
    // Deliberately not implemented: a write that rejects, to prove the store
    // turns a thrown backend error into a reported failure.
    breakWrites() { this.createPost = async () => { throw new Error("offline"); }; }
  }
  new FakeRemote();
`;

async function post(page, { title, body, category = "suggestion" }) {
  await page.click(`#suggestion-category-group button[data-category="${category}"]`);
  await page.fill("#suggestion-title", title);
  await page.fill("#suggestion-body", body);
  await page.click("#suggestion-form button[type=submit]");
  await page.waitForTimeout(200);
}

async function titles(page, selector) {
  return page.$$eval(`${selector} .board-post-title`, (els) => els.map((el) => el.textContent));
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
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
  page.on("pageerror", (err) => {
    failures++;
    console.log(`  [FAIL] page error — ${err.message}`);
  });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });

  console.log("\n1. Signed out, the box is an invitation rather than a board");
  await openSuggestions(page);
  check("the gate is what is on screen", await page.$eval("#suggestion-gate", (el) => !el.classList.contains("hidden")));
  check("the form is not", await page.$eval("#suggestion-board", (el) => el.classList.contains("hidden")));
  check(
    "with a sentence saying why and a way to fix it",
    (await page.$eval("#suggestion-gate-note", (el) => el.textContent.trim().length > 20)) &&
      (await page.$eval("#suggestion-gate-signin", (el) => !el.classList.contains("hidden")))
  );

  console.log("\n2. Posting, on the shared board");
  const swappedIn = await page.evaluate(async (source) => {
    const base = new URL("../core/", location.href).href;
    const { setBackend, isRemote } = await import(`${base}suggestions/backend.js`);
    // eslint-disable-next-line no-eval
    window.__fakeRemote = eval(source);
    setBackend(window.__fakeRemote);
    return isRemote();
  }, FAKE_REMOTE);
  check("a backend that outlives the tab opens the board", swappedIn);
  await page.waitForTimeout(200);
  check("the gate is gone", await page.$eval("#suggestion-gate", (el) => el.classList.contains("hidden")));
  check("and the form is there", await page.$eval("#suggestion-board", (el) => !el.classList.contains("hidden")));

  await post(page, { title: "Add a metronome mode", body: "For pacing flicks to a beat." });
  check("the post appears in the list", (await titles(page, "#suggestion-list")).includes("Add a metronome mode"));
  check(
    "and it went to the backend, not to localStorage",
    await page.evaluate(
      () =>
        window.__fakeRemote.posts.length === 1 &&
        !(localStorage.getItem("aimonsite:suggestions") ?? "").includes("Add a metronome mode")
    )
  );

  await post(page, { title: "", body: "no title" });
  check(
    "an empty title is refused, with a reason on screen",
    await page.$eval("#suggestion-error", (el) => el.textContent.trim().length > 0 && !el.classList.contains("hidden"))
  );

  console.log("\n3. An admin reply raises the author's dot");
  await page.click("#suggestions-back");
  await page.click("#home-admin");
  await page.waitForTimeout(200);
  // "Needs reply" is the default filter and drops a thread the moment it is
  // answered, so the rest of this section works from the full list.
  await page.click('#admin-filter-group button[data-filter="all"]');
  await page.waitForTimeout(150);
  await page.click("#admin-list .board-post-header");
  await page.waitForTimeout(150);
  await page.fill("#admin-list .board-textarea", "Good idea — planned for the next pass.");
  await page.click("#admin-list .board-reply .btn-primary");
  await page.waitForTimeout(250);
  check(
    "the reply is stored on the thread",
    await page.$$eval("#admin-list .board-comment-admin", (els) => els.length > 0)
  );

  const badge = await page.evaluate(() => {
    const el = document.getElementById("suggestions-badge");
    return { text: el.textContent, hidden: el.classList.contains("hidden") };
  });
  check("the sidebar dot shows one unread reply", !badge.hidden && badge.text === "1", JSON.stringify(badge));

  // The other way onto this screen: ?admin=1, which is what this file uses.
  // It has to say so, because it is not the same thing as being an admin.
  check(
    "the preview role says what it is",
    await page.$eval("#admin-warning", (el) => !el.classList.contains("hidden"))
  );
  check(
    "and offers a way back out of it",
    await page.$eval("#admin-signout", (el) => !el.classList.contains("hidden"))
  );

  console.log("\n4. Status and deletion");
  await page.click('#admin-list .admin-status-row .option-group button:nth-child(2)');
  await page.waitForTimeout(250);
  check(
    "a status change sticks",
    await page.evaluate(async () => {
      const base = new URL("../core/", location.href).href;
      const { listPosts } = await import(`${base}suggestions/store.js`);
      const posts = await listPosts({});
      return posts.some((p) => p.status === "planned");
    })
  );

  console.log("\n5. A backend that fails is reported, not swallowed");
  await page.click("#admin-back");
  await openSuggestions(page);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__fakeRemote.breakWrites());
  await post(page, { title: "This will not save", body: "The backend is going to throw." });
  check(
    "a thrown write surfaces as an error on the form",
    await page.$eval("#suggestion-error", (el) => !el.classList.contains("hidden") && el.textContent.trim().length > 0)
  );
  check(
    "and nothing was added",
    (await titles(page, "#suggestion-list")).length === 1,
    JSON.stringify(await titles(page, "#suggestion-list"))
  );

  console.log("\n6. Losing the account closes the board again");
  await page.evaluate(async () => {
    const base = new URL("../core/", location.href).href;
    const { setBackend } = await import(`${base}suggestions/backend.js`);
    setBackend(null);
  });
  await page.waitForTimeout(250);
  check("the gate is back on an open screen", await page.$eval("#suggestion-gate", (el) => !el.classList.contains("hidden")));
  check("the board is hidden with it", await page.$eval("#suggestion-board", (el) => el.classList.contains("hidden")));
  check(
    "and the unread dot is cleared — there is no 'yours' to count",
    await page.$eval("#suggestions-badge", (el) => el.classList.contains("hidden"))
  );

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
