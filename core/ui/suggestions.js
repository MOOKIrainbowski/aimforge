import {
  MAX_BODY_LENGTH,
  createPost,
  addComment,
  listPosts,
  markPostRead,
  getUnreadReplies,
  getIdentity,
  subscribe,
  onBackendChange,
} from "../suggestions/store.js";
import { t, getLanguage } from "../i18n.js";

// The player-facing suggestion box: post a suggestion or an error report,
// read the thread, and see when an admin has replied.
//
// Every piece of post/comment text below goes in through textContent, never
// innerHTML. This is user-authored content rendered back into the page, so
// building markup from it by string concatenation would be an XSS hole; the
// crosshair SVG elsewhere in the project can get away with a template string
// only because every value feeding it comes from a browser-validated colour
// or range input.
const screen = document.getElementById("suggestions-screen");
const form = document.getElementById("suggestion-form");
const categoryGroup = document.getElementById("suggestion-category-group");
const titleInput = document.getElementById("suggestion-title");
const bodyInput = document.getElementById("suggestion-body");
const counter = document.getElementById("suggestion-counter");
const errorEl = document.getElementById("suggestion-error");
const filterGroup = document.getElementById("suggestion-filter-group");
const listEl = document.getElementById("suggestion-list");
const badge = document.getElementById("suggestions-badge");

let selectedCategory = "suggestion";
let selectedFilter = "all";
let expandedId = null;

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(getLanguage(), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function setPressed(button, pressed) {
  button.classList.toggle("selected", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function updateCounter() {
  counter.textContent = `${bodyInput.value.length} / ${MAX_BODY_LENGTH}`;
}

function showError(key) {
  errorEl.textContent = t(key);
  errorEl.classList.remove("hidden");
}

function clearError() {
  errorEl.classList.add("hidden");
}

// A post's thread, built as DOM nodes. `unread` marks threads where an admin
// replied since the author last opened it.
function buildPost(post, me) {
  const article = document.createElement("article");
  article.className = "board-post";
  const adminReplies = post.comments.filter((comment) => comment.byAdmin);
  const unread = post.authorId === me && adminReplies.some((c) => c.createdAt > (post.readAt ?? 0));
  article.classList.toggle("unread", unread);

  const header = document.createElement("button");
  header.type = "button";
  header.className = "board-post-header";
  header.setAttribute("aria-expanded", String(expandedId === post.id));

  const tag = document.createElement("span");
  tag.className = `board-tag board-tag-${post.category}`;
  tag.textContent = t(`suggestions.category.${post.category}`);

  const title = document.createElement("span");
  title.className = "board-post-title";
  title.textContent = post.title;

  const meta = document.createElement("span");
  meta.className = "board-post-meta";
  const authorLabel = post.authorId === me ? t("suggestions.you") : post.authorName || t("suggestions.anonymous");
  meta.textContent = `${authorLabel} · ${formatDate(post.createdAt)}`;

  const status = document.createElement("span");
  status.className = `board-status board-status-${post.status}`;
  status.textContent = t(`suggestions.status.${post.status}`);

  header.append(tag, title, status, meta);
  if (post.comments.length > 0) {
    const count = document.createElement("span");
    count.className = "board-post-count";
    count.textContent = t("suggestions.replyCount", { value: post.comments.length });
    header.append(count);
  }
  if (unread) {
    const dot = document.createElement("span");
    dot.className = "board-unread-dot";
    dot.setAttribute("aria-label", t("suggestions.newReply"));
    header.append(dot);
  }

  header.addEventListener("click", () => {
    expandedId = expandedId === post.id ? null : post.id;
    // Rendered straight away rather than after the read is stored: opening a
    // thread must not wait on a round trip, and the dot it clears is a local
    // reading of data the next render reloads anyway.
    if (expandedId === post.id) markPostRead(post.id);
    render();
  });
  article.append(header);

  if (expandedId !== post.id) return article;

  const body = document.createElement("p");
  body.className = "board-post-body";
  body.textContent = post.body;
  article.append(body);

  for (const comment of post.comments) {
    const row = document.createElement("div");
    row.className = comment.byAdmin ? "board-comment board-comment-admin" : "board-comment";

    const who = document.createElement("span");
    who.className = "board-comment-who";
    who.textContent = comment.byAdmin
      ? t("suggestions.adminLabel")
      : comment.authorId === me
        ? t("suggestions.you")
        : comment.authorName || t("suggestions.anonymous");

    const when = document.createElement("span");
    when.className = "board-comment-when";
    when.textContent = formatDate(comment.createdAt);

    const text = document.createElement("p");
    text.className = "board-comment-body";
    text.textContent = comment.body;

    row.append(who, when, text);
    article.append(row);
  }

  const replyWrap = document.createElement("div");
  replyWrap.className = "board-reply";
  const replyInput = document.createElement("textarea");
  replyInput.className = "board-textarea";
  replyInput.rows = 3;
  replyInput.maxLength = MAX_BODY_LENGTH;
  replyInput.placeholder = t("suggestions.replyPlaceholder");

  const replyFooter = document.createElement("div");
  replyFooter.className = "board-form-footer";
  const replyCounter = document.createElement("span");
  replyCounter.className = "board-counter";
  replyCounter.textContent = `0 / ${MAX_BODY_LENGTH}`;
  replyInput.addEventListener("input", () => {
    replyCounter.textContent = `${replyInput.value.length} / ${MAX_BODY_LENGTH}`;
  });

  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.className = "secondary";
  replyButton.textContent = t("suggestions.reply");
  replyButton.addEventListener("click", async () => {
    replyButton.disabled = true;
    const result = await addComment(post.id, replyInput.value);
    replyButton.disabled = false;
    if (result.ok) {
      replyInput.value = "";
      render();
    }
  });

  replyFooter.append(replyCounter, replyButton);
  replyWrap.append(replyInput, replyFooter);
  article.append(replyWrap);

  return article;
}

// Each render is tagged so a slow load that resolves after the player has
// already changed the filter cannot overwrite the newer view with the older
// one — the only ordering hazard the async backends introduce.
let renderToken = 0;

async function render() {
  const token = ++renderToken;
  const me = getIdentity().id;
  const filter =
    selectedFilter === "mine"
      ? { mine: true }
      : selectedFilter === "all"
        ? {}
        : { category: selectedFilter };
  const posts = await listPosts(filter);
  if (token !== renderToken) return;

  listEl.replaceChildren();
  if (posts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "board-empty";
    empty.textContent = t("suggestions.empty");
    listEl.append(empty);
    return;
  }
  for (const post of posts) listEl.append(buildPost(post, me));
}

// The sidebar dot: how many of this browser's own posts have an admin reply
// it hasn't seen yet.
export async function refreshSuggestionBadge() {
  const count = (await getUnreadReplies()).length;
  badge.textContent = String(count);
  badge.classList.toggle("hidden", count === 0);
}

export function initSuggestions() {
  for (const button of categoryGroup.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      selectedCategory = button.dataset.category;
      for (const b of categoryGroup.querySelectorAll("button")) setPressed(b, b === button);
    });
  }

  for (const button of filterGroup.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      selectedFilter = button.dataset.filter;
      for (const b of filterGroup.querySelectorAll("button")) setPressed(b, b === button);
      render();
    });
  }

  bodyInput.addEventListener("input", updateCounter);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const submitButton = form.querySelector("button[type=submit]");
    if (submitButton) submitButton.disabled = true;
    const result = await createPost({
      category: selectedCategory,
      title: titleInput.value,
      body: bodyInput.value,
    });
    if (submitButton) submitButton.disabled = false;
    if (!result.ok) {
      showError(
        result.error === "empty" || result.error === "category"
          ? "suggestions.error.empty"
          : "suggestions.error.storage"
      );
      return;
    }
    titleInput.value = "";
    bodyInput.value = "";
    updateCounter();
    render();
  });

  subscribe(refreshSuggestionBadge);
  // Signing in or out replaces the board wholesale, so an open screen has to
  // reload rather than keep showing the other backend's posts.
  onBackendChange(() => {
    if (!screen.classList.contains("hidden")) render();
    refreshSuggestionBadge();
  });
  updateCounter();
  refreshSuggestionBadge();
}

export function showSuggestions() {
  render();
  refreshSuggestionBadge();
  screen.classList.remove("hidden");
}

export function hideSuggestions() {
  screen.classList.add("hidden");
}
