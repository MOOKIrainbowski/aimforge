import { getAccount, isAuthAvailable, onAccountChange, signIn, signOutAccount } from "../auth.js";
import { showToast } from "./toast.js";
import { t } from "../i18n.js";

// The account control at the top of the home screen: sign in with Google, or
// see who you are and sign out again.
//
// It sits here rather than in the sidebar footer because that is where a
// profile is looked for, and because the footer put it a few pixels from
// Settings — two unrelated things sharing a corner, with the sign-out reduced
// to a text link beside a name.
//
// The whole control renders nothing when no backend is configured. That is
// the point of checking rather than disabling: a greyed-out "Sign in" is a
// promise the build cannot keep, and this project's pitch is that it works
// without one.
const row = document.getElementById("account-row");
const signInButton = document.getElementById("account-signin");
const signedInBox = document.getElementById("account-signed-in");
const menuButton = document.getElementById("account-menu-button");
const avatarEl = document.getElementById("account-avatar");
const nameEl = document.getElementById("account-name");
const menu = document.getElementById("account-menu");
const menuName = document.getElementById("account-menu-name");
const menuEmail = document.getElementById("account-menu-email");
const signOutButton = document.getElementById("account-signout");

// Tracked so a sign-out is announced only when it actually was one — the
// account also arrives as null on a plain page load, and telling somebody
// they were signed out when they were never signed in is worse than silence.
let lastAccountId = null;

function closeMenu() {
  menu.classList.add("hidden");
  menuButton.setAttribute("aria-expanded", "false");
}

function initials(account) {
  const source = (account.name || account.email || "?").trim();
  return source.slice(0, 1).toUpperCase();
}

function render() {
  const available = isAuthAvailable();
  row.classList.toggle("hidden", !available);
  if (!available) return;

  const account = getAccount();
  signInButton.classList.toggle("hidden", Boolean(account));
  signedInBox.classList.toggle("hidden", !account);

  if (!account) {
    closeMenu();
    return;
  }

  nameEl.textContent = account.name;
  menuName.textContent = account.name;
  menuEmail.textContent = account.email;

  // A photo when Google gave us one, the first letter when it did not — an
  // empty circle reads as a failed image rather than as an avatar.
  if (account.avatar) {
    avatarEl.style.backgroundImage = `url("${account.avatar}")`;
    avatarEl.textContent = "";
    avatarEl.classList.add("has-photo");
  } else {
    avatarEl.style.backgroundImage = "";
    avatarEl.textContent = initials(account);
    avatarEl.classList.remove("has-photo");
  }
}

export function initAccount() {
  signInButton.addEventListener("click", async () => {
    signInButton.disabled = true;
    const result = await signIn();
    // On success the browser is already on its way to Google, so re-enabling
    // only matters when it is not.
    if (!result?.ok) {
      signInButton.disabled = false;
      showToast(t("account.signInFailed"));
      console.warn("AimonSite: sign-in unavailable —", result?.error);
    }
  });

  menuButton.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle("hidden") === false;
    menuButton.setAttribute("aria-expanded", String(open));
  });

  // Click-away and Escape both close it, the way a menu is expected to.
  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("hidden") && !menu.contains(e.target)) closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.classList.contains("hidden")) closeMenu();
  });

  signOutButton.addEventListener("click", async () => {
    signOutButton.disabled = true;
    await signOutAccount();
    signOutButton.disabled = false;
    closeMenu();
  });

  onAccountChange((account) => {
    render();
    // Both directions are announced, because both are invisible otherwise:
    // signing in lands you back on a page that looks like the one you left,
    // and signing out changes one small control in a corner.
    if (account && account.id !== lastAccountId) {
      showToast(t("account.toastSignedIn", { name: account.name }), { tone: "accent" });
    } else if (!account && lastAccountId) {
      showToast(t("account.toastSignedOut"));
    }
    lastAccountId = account?.id ?? null;
  });

  render();
  lastAccountId = getAccount()?.id ?? null;
}
