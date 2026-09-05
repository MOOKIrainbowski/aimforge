// Transient confirmations for things that otherwise leave no trace.
//
// This exists because signing out was silent: the button was in the sidebar,
// the sidebar changed a little, and nothing told you it had worked — which
// reads as "the click did nothing" rather than "you are signed out". A state
// change the player asked for and cannot see is a bug, not a missing polish
// pass.
//
// Deliberately small: one line of text, one at a time, gone in a few seconds
// and dismissible by clicking. Anything that needs a decision belongs in a
// screen, not here.
const host = document.getElementById("toast-host");

const VISIBLE_MS = 3200;
let current = null;
let timer = null;

function dismiss(el) {
  if (!el || el.dataset.leaving === "1") return;
  el.dataset.leaving = "1";
  el.classList.remove("in");
  // Removed on the way out rather than immediately, so the exit animation
  // has something to animate.
  el.addEventListener("transitionend", () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 400);
  if (current === el) current = null;
}

// `tone` is "default" or "accent" — accent for something that has just been
// gained (signed in), default for something released (signed out).
export function showToast(message, { tone = "default" } = {}) {
  if (!host || !message) return;

  clearTimeout(timer);
  dismiss(current);

  const el = document.createElement("div");
  el.className = `toast toast-${tone}`;
  el.textContent = message;
  el.addEventListener("click", () => dismiss(el));
  host.append(el);
  current = el;

  // One frame before adding the class, so the entrance transition runs from
  // the starting state rather than being skipped.
  requestAnimationFrame(() => el.classList.add("in"));
  timer = setTimeout(() => dismiss(el), VISIBLE_MS);
}
