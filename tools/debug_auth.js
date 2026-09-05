const { chromium } = require("playwright");

// Exercises accounts end to end against a stand-in Supabase: the PKCE
// handshake, the session surviving a reload, the remote suggestion board a
// signed-in player writes to, what the server refusing a write looks like on
// screen, admin rights coming from the server rather than the client, and
// signing out. Run `npm run serve` first.
//
// Supabase itself is mocked at the network boundary with Playwright routing,
// so this tests every line AimonSite owns — core/backend/supabaseClient.js,
// core/auth.js, core/suggestions/remoteBackend.js — without an account or a
// project. What it deliberately cannot test is whether the row-level security
// in supabase/schema.sql is written correctly; that is verified against the
// real project, and the mock takes care to *refuse* things the way the real
// policies do so the client is at least written against honest answers.
//
// The config is empty in the repo, so this injects one before any module
// runs — the same thing filling in core/backend/config.js does.

const BASE = "http://localhost:8123/app/index.html?debug=1";
const FAKE_URL = "https://project.supabase.test";

let failures = 0;
function check(label, condition, detail) {
  if (!condition) failures++;
  console.log(`  [${condition ? "PASS" : "FAIL"}] ${label}${detail === undefined ? "" : ` — ${detail}`}`);
}

// The mock's whole state, kept in Node so it survives page reloads.
const db = {
  admin: false,
  posts: [],
  comments: [],
  reads: [],
  authorizeCalls: [],
  tokenCalls: [],
  loggedOut: false,
};

const USER = {
  id: "11111111-2222-3333-4444-555555555555",
  email: "player@example.com",
  user_metadata: { full_name: "Test Player" },
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  });
}

// Rebuilds the embedded shape PostgREST returns for the client's select.
function postRows() {
  return db.posts
    .map((post) => ({
      ...post,
      author: { display_name: post.author_id === USER.id ? "Test Player" : "Someone Else" },
      comments: db.comments
        .filter((c) => c.post_id === post.id)
        .map((c) => ({ ...c, author: { display_name: "Test Player" } })),
      // RLS restricts this to the reader's own rows, so the mock does too.
      post_reads: db.reads.filter((r) => r.post_id === post.id && r.user_id === USER.id).map((r) => ({ read_at: r.read_at })),
    }))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function installMock(page) {
  await page.route(`${FAKE_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const body = request.postData() ? JSON.parse(request.postData()) : null;

    // --- auth ---------------------------------------------------------
    if (path === "/auth/v1/authorize") {
      db.authorizeCalls.push(Object.fromEntries(url.searchParams));
      // Google's redirect back, with the single-use code.
      const back = new URL(url.searchParams.get("redirect_to"));
      back.searchParams.set("code", "auth-code-123");
      return route.fulfill({ status: 302, headers: { location: back.toString() } });
    }

    if (path === "/auth/v1/token") {
      db.tokenCalls.push({ grant: url.searchParams.get("grant_type"), body });
      if (url.searchParams.get("grant_type") === "pkce" && body?.auth_code !== "auth-code-123") {
        return json(route, { message: "invalid code" }, 400);
      }
      return json(route, {
        access_token: "access-token-1",
        refresh_token: "refresh-token-1",
        expires_in: 3600,
        user: USER,
      });
    }

    if (path === "/auth/v1/logout") {
      db.loggedOut = true;
      return json(route, {}, 204);
    }

    // --- rest ---------------------------------------------------------
    const authorized = (request.headers().authorization ?? "").includes("access-token");

    if (path === "/rest/v1/profiles") {
      return json(route, [{ display_name: "Test Player", is_admin: db.admin }]);
    }

    if (path === "/rest/v1/posts") {
      if (request.method() === "GET") return json(route, postRows());
      if (request.method() === "POST") {
        // The policy that matters: authorship is the session's, not the
        // client's claim. A mismatch is refused rather than accepted.
        if (!authorized || body.author_id !== USER.id) return json(route, { message: "row-level security" }, 403);
        const post = {
          id: `post-${db.posts.length + 1}`,
          author_id: USER.id,
          category: body.category,
          title: body.title,
          body: body.body,
          status: "open",
          created_at: new Date().toISOString(),
        };
        db.posts.push(post);
        return json(route, [post], 201);
      }
      if (request.method() === "PATCH") {
        if (!db.admin) return json(route, []); // refused: no rows matched
        for (const post of db.posts) post.status = body.status;
        return json(route, db.posts);
      }
      if (request.method() === "DELETE") {
        if (!db.admin) return json(route, []);
        const removed = db.posts.splice(0, db.posts.length);
        return json(route, removed);
      }
    }

    if (path === "/rest/v1/comments" && request.method() === "POST") {
      // by_admin is the other claim the server must not take on trust.
      if (body.by_admin && !db.admin) return json(route, { message: "row-level security" }, 403);
      const comment = {
        id: `comment-${db.comments.length + 1}`,
        post_id: body.post_id,
        author_id: USER.id,
        body: body.body,
        by_admin: Boolean(body.by_admin),
        created_at: new Date().toISOString(),
      };
      db.comments.push(comment);
      return json(route, [comment], 201);
    }

    if (path === "/rest/v1/post_reads" && request.method() === "POST") {
      db.reads = db.reads.filter((r) => !(r.post_id === body.post_id && r.user_id === body.user_id));
      db.reads.push({ ...body });
      return json(route, [body], 201);
    }

    return json(route, { message: `unhandled ${request.method()} ${path}` }, 500);
  });
}

// Stands in for a filled-in core/backend/config.js. The module is fetched, so
// rewriting the response is exactly what pasting keys into the file does.
async function configure(page) {
  await page.route("**/core/backend/config.js", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `export const SUPABASE_URL = ${JSON.stringify(FAKE_URL)};
export const SUPABASE_ANON_KEY = "anon-key";
export function isConfigured() { return true; }
`,
    })
  );
}

async function open(page, url = BASE) {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => Boolean(window.__aimonsiteDebug), null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

(async () => {
  const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (err) => {
    failures++;
    console.log(`  [FAIL] page error — ${err.message}`);
  });

  console.log("\n1. With no backend configured, accounts do not exist");
  await open(page);
  check("the sign-in row is hidden", await page.$eval("#account-row", (el) => el.classList.contains("hidden")));
  check(
    "and the board says posts stay in this browser",
    (await page.$eval("#suggestion-scope", (el) => el.textContent)).includes("browser")
  );

  console.log("\n2. Signing in with Google");
  await configure(page);
  await installMock(page);
  await open(page);
  check("the sign-in row appears once configured", await page.$eval("#account-row", (el) => !el.classList.contains("hidden")));

  await page.click("#account-signin");
  await page.waitForTimeout(800);

  const authorize = db.authorizeCalls[0] ?? {};
  check("the handshake is PKCE, not implicit", authorize.code_challenge_method === "s256" && Boolean(authorize.code_challenge), JSON.stringify(authorize.code_challenge_method));
  // A SHA-256 digest in base64url is exactly 43 characters. The verifier
  // itself is 64 random bytes and so is 86 — this is what catches a client
  // that "supports PKCE" by sending the verifier as its own challenge.
  check(
    "the challenge is a digest, not the verifier sent in the clear",
    /^[A-Za-z0-9_-]{43}$/.test(authorize.code_challenge ?? ""),
    `${(authorize.code_challenge ?? "").length} chars`
  );
  check(
    "the code is exchanged for a session",
    db.tokenCalls.some((call) => call.grant === "pkce" && call.body.code_verifier),
    JSON.stringify(db.tokenCalls.map((c) => c.grant))
  );
  check(
    "the code is scrubbed from the address bar",
    !(await page.evaluate(() => window.location.search)).includes("code="),
    await page.evaluate(() => window.location.search)
  );
  check("the sidebar shows who is signed in", (await page.$eval("#account-name", (el) => el.textContent)) === "Test Player");

  console.log("\n3. The shared board");
  await page.click("#home-suggestions");
  await page.waitForTimeout(300);
  check(
    "the board says posts go out under the account",
    (await page.$eval("#suggestion-scope", (el) => el.textContent)).includes("Test Player")
  );

  await page.fill("#suggestion-title", "Shared board post");
  await page.fill("#suggestion-body", "Written while signed in.");
  await page.click("#suggestion-form button[type=submit]");
  await page.waitForTimeout(500);
  check("a post reaches the server", db.posts.length === 1, JSON.stringify(db.posts.map((p) => p.title)));
  check(
    "and comes back rendered from it",
    (await page.$$eval("#suggestion-list .board-post-title", (els) => els.map((e) => e.textContent))).includes("Shared board post")
  );
  check(
    "nothing was written to localStorage",
    await page.evaluate(() => !(localStorage.getItem("aimonsite:suggestions") ?? "").includes("Shared board post"))
  );

  console.log("\n4. A refused write is reported, not hidden");
  const refused = await page.evaluate(async () => {
    const base = new URL("../core/", location.href).href;
    const { addComment } = await import(`${base}suggestions/store.js`);
    // Claiming to be an admin while the server says otherwise: exactly the
    // lie a static client is able to tell.
    const posts = await (await import(`${base}suggestions/store.js`)).listPosts({});
    return addComment(posts[0].id, "I am an admin", { asAdmin: true });
  });
  check("the server refuses an admin reply from a non-admin", !refused.ok && refused.error === "forbidden", JSON.stringify(refused));
  check("and no admin comment was stored", db.comments.every((c) => !c.by_admin), JSON.stringify(db.comments.map((c) => c.by_admin)));

  console.log("\n5. The session survives a reload");
  await open(page);
  check("still signed in after a full reload", (await page.$eval("#account-name", (el) => el.textContent)) === "Test Player");
  check("without going back to Google", db.authorizeCalls.length === 1, `${db.authorizeCalls.length} authorize calls`);

  console.log("\n6. Admin comes from the server");
  check("not an admin yet", await page.$eval("#home-admin", (el) => el.classList.contains("hidden")));
  db.admin = true;
  await open(page);
  check("the admin entry appears once the profile says so", await page.$eval("#home-admin", (el) => !el.classList.contains("hidden")));

  await page.click("#home-admin");
  await page.waitForTimeout(300);
  await page.click('#admin-filter-group button[data-filter="all"]');
  await page.waitForTimeout(300);
  await page.click("#admin-list .board-post-header");
  await page.waitForTimeout(200);
  await page.fill("#admin-list .board-textarea", "Answered.");
  await page.click("#admin-list .board-reply .btn-primary");
  await page.waitForTimeout(500);
  check("an admin reply is accepted now", db.comments.some((c) => c.by_admin), JSON.stringify(db.comments.map((c) => c.by_admin)));

  console.log("\n7. Signing out");
  await page.click("#admin-back");
  await page.waitForTimeout(200);
  await page.click("#account-signout");
  await page.waitForTimeout(500);
  check("the server session is revoked", db.loggedOut);
  check("the sign-in button is back", await page.$eval("#account-signin", (el) => !el.classList.contains("hidden")));
  check("the stored session is gone", await page.evaluate(() => localStorage.getItem("aimonsite:session") === null));

  await page.click("#home-suggestions");
  await page.waitForTimeout(300);
  check(
    "and the board is the local one again",
    (await page.$eval("#suggestion-scope", (el) => el.textContent)).includes("browser")
  );

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  await browser.close();
  process.exit(failures === 0 ? 0 : 1);
})();
