import {
  MAX_BODY_LENGTH,
  STATUSES,
  listPosts,
  addComment,
  setStatus,
  deletePost,
  setAdmin,
  isAdmin,
  getUnansweredCount,
  subscribe,
} from "../suggestions/store.js";
import { t, getLanguage } from "../i18n.js";

// The moderation side of the suggestion box: read everything that came in,
// reply to a thread (which raises the notification dot on the author's
// sidebar), and move a post through open -> planned -> resolved/declined.
//
// As the on-screen warning says, "admin" here is a local view role. There is
// no server to authenticate against, so this is the moderation UI made real
// and usable, with the authorisation left for whenever a backend exists —
// see the contract note at the bottom of core/suggestions/store.js.
const screen = document.getElementById("admin-screen");
const listEl = document.getElementById("admin-list");
const filterGroup = document.getElementById("admin-filter-group");
const summaryEl = document.getElementById("admin-summary");
const signOutButton = document.getElementById("admin-signout");
// The sidebar entry point, shown only while the admin view role is on.
const sidebarEntry = document.getElementById("home-admin");
const badge = document.getElementById("admin-badge");

let selectedFilter = "unanswered";
let expandedId = null;
let onSignOut = () => {};

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(getLanguage(), { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(timestamp)
  );
}

function setPressed(button, pressed) {
  button.classList.toggle("selected", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function visiblePosts() {
  if (selectedFilter === "unanswered") {
    return listPosts({}).filter((post) => !post.comments.some((c) => c.byAdmin));
  }
  if (selectedFilter === "all") return listPosts({});
  return listPosts({ category: selectedFilter });
}

function buildPost(post) {
  const article = document.createElement("article");
  article.className = "board-post";

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

  const status = document.createElement("span");
  status.className = `board-status board-status-${post.status}`;
  status.textContent = t(`suggestions.status.${post.status}`);

  const meta = document.createElement("span");
  meta.className = "board-post-meta";
  meta.textContent = `${post.authorName || t("suggestions.anonymous")} · ${formatDate(post.createdAt)}`;

  header.append(tag, title, status, meta);
  header.addEventListener("click", () => {
    expandedId = expandedId === post.id ? null : post.id;
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
    who.textContent = comment.byAdmin ? t("suggestions.adminLabel") : comment.authorName || t("suggestions.anonymous");
    const when = document.createElement("span");
    when.className = "board-comment-when";
    when.textContent = formatDate(comment.createdAt);
    const text = document.createElement("p");
    text.className = "board-comment-body";
    text.textContent = comment.body;
    row.append(who, when, text);
    article.append(row);
  }

  const statusRow = document.createElement("div");
  statusRow.className = "admin-status-row";
  const statusLabel = document.createElement("span");
  statusLabel.className = "option-label";
  statusLabel.textContent = t("admin.setStatus");
  const statusGroup = document.createElement("div");
  statusGroup.className = "option-group";
  for (const value of STATUSES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = t(`suggestions.status.${value}`);
    setPressed(button, post.status === value);
    button.addEventListener("click", () => {
      setStatus(post.id, value);
      render();
    });
    statusGroup.append(button);
  }
  statusRow.append(statusLabel, statusGroup);
  article.append(statusRow);

  const replyWrap = document.createElement("div");
  replyWrap.className = "board-reply";
  const replyInput = document.createElement("textarea");
  replyInput.className = "board-textarea";
  replyInput.rows = 3;
  replyInput.maxLength = MAX_BODY_LENGTH;
  replyInput.placeholder = t("admin.replyPlaceholder");

  const footer = document.createElement("div");
  footer.className = "board-form-footer";
  const counter = document.createElement("span");
  counter.className = "board-counter";
  counter.textContent = `0 / ${MAX_BODY_LENGTH}`;
  replyInput.addEventListener("input", () => {
    counter.textContent = `${replyInput.value.length} / ${MAX_BODY_LENGTH}`;
  });

  const replyButton = document.createElement("button");
  replyButton.type = "button";
  replyButton.className = "btn-primary";
  replyButton.textContent = t("admin.reply");
  replyButton.addEventListener("click", () => {
    if (addComment(post.id, replyInput.value, { asAdmin: true }).ok) {
      replyInput.value = "";
      render();
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "link-button board-delete";
  deleteButton.textContent = t("admin.delete");
  // Two-step rather than a confirm() dialog: a native modal inside a
  // pointer-locked page is a bad idea, and this makes the destructive step
  // deliberate without blocking anything.
  let armed = false;
  deleteButton.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      deleteButton.textContent = t("admin.deleteConfirm");
      deleteButton.classList.add("board-delete-armed");
      return;
    }
    deletePost(post.id);
    expandedId = null;
    render();
  });

  footer.append(counter, deleteButton, replyButton);
  replyWrap.append(replyInput, footer);
  article.append(replyWrap);

  return article;
}

function render() {
  const posts = visiblePosts();
  const all = listPosts({});
  summaryEl.replaceChildren();
  for (const [label, value] of [
    [t("admin.summary.total"), all.length],
    [t("admin.summary.needsReply"), getUnansweredCount()],
    [t("admin.summary.bugs"), all.filter((p) => p.category === "bug").length],
  ]) {
    const cell = document.createElement("div");
    cell.className = "admin-summary-cell";
    const v = document.createElement("strong");
    v.textContent = String(value);
    const l = document.createElement("span");
    l.textContent = label;
    cell.append(v, l);
    summaryEl.append(cell);
  }

  listEl.replaceChildren();
  if (posts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "board-empty";
    empty.textContent = t("admin.empty");
    listEl.append(empty);
    return;
  }
  for (const post of posts) listEl.append(buildPost(post));
}

// Sidebar badge for the admin: how many posts are still waiting on a reply.
export function refreshAdminBadge() {
  sidebarEntry.classList.toggle("hidden", !isAdmin());
  const count = getUnansweredCount();
  badge.textContent = String(count);
  badge.classList.toggle("hidden", !isAdmin() || count === 0);
}

export function initAdmin({ onSignOut: signOutCallback }) {
  onSignOut = signOutCallback;

  for (const button of filterGroup.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      selectedFilter = button.dataset.filter;
      for (const b of filterGroup.querySelectorAll("button")) setPressed(b, b === button);
      render();
    });
  }

  signOutButton.addEventListener("click", () => {
    setAdmin(false);
    refreshAdminBadge();
    onSignOut();
  });

  subscribe(refreshAdminBadge);
  refreshAdminBadge();
}

export function showAdmin() {
  render();
  screen.classList.remove("hidden");
}

export function hideAdmin() {
  screen.classList.add("hidden");
}
