import { getAccount, isAuthAvailable, onAccountChange, signIn, signOutAccount } from "../auth.js";
import { t } from "../i18n.js";

// The account corner of the sidebar: sign in with Google, or see who you are
// signed in as and sign out again.
//
// It renders nothing at all when no backend is configured. That is the point
// of checking rather than disabling: a greyed-out "Sign in" is a promise the
// build cannot keep, and this project's whole pitch is that it works without
// one.
const row = document.getElementById("account-row");
const signInButton = document.getElementById("account-signin");
const signedInBox = document.getElementById("account-signed-in");
const nameEl = document.getElementById("account-name");
const signOutButton = document.getElementById("account-signout");

function render() {
  const available = isAuthAvailable();
  row.classList.toggle("hidden", !available);
  if (!available) return;

  const account = getAccount();
  signInButton.classList.toggle("hidden", Boolean(account));
  signedInBox.classList.toggle("hidden", !account);
  if (account) {
    nameEl.textContent = account.name;
    nameEl.title = account.email;
  }
}

export function initAccount() {
  signInButton.addEventListener("click", async () => {
    signInButton.disabled = true;
    const result = await signIn();
    // On success the browser is already on its way to Google, so re-enabling
    // only matters when it isn't.
    if (!result?.ok) {
      signInButton.disabled = false;
      console.warn("AimonSite: sign-in unavailable —", result?.error);
    }
  });

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    await signOutAccount();
    signOutButton.disabled = false;
  });

  onAccountChange(render);
  render();
}

// Shown on the suggestion screen when a post needs an account that isn't
// there — the one place the difference is worth explaining rather than just
// enforcing.
export function signInPrompt() {
  return t("account.needed");
}
