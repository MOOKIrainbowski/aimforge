import { isConfigured } from "./backend/config.js";
import { completeSignIn, signInWithGoogle, signOut, getSession, onSessionChange, rest } from "./backend/supabaseClient.js";
import { setAccount } from "./suggestions/store.js";
import { setBackend } from "./suggestions/backend.js";
import { RemoteBackend } from "./suggestions/remoteBackend.js";

// Accounts: who is signed in, and what that changes.
//
// Signing in changes exactly two things, and deliberately no more. Your
// suggestions become yours rather than this browser's — posted under your
// name, answerable anywhere you sign in — and an admin account gets the
// moderation screen for real rather than as a view toggle. It is also the
// identity PvP will be built on when there is PvP.
//
// What it does not change: drill stats. Sessions, history and settings stay
// in localStorage, on this machine, signed in or not. The landing page's
// promise that "your stats never leave your device" is a promise, not a
// default that an account quietly overrides.
//
// With no backend configured (core/backend/config.js empty) every function
// here is inert and the app behaves exactly as it did before accounts
// existed.
let account = null;
const listeners = new Set();

export function getAccount() {
  return account;
}

export function isSignedIn() {
  return account !== null;
}

export function isAuthAvailable() {
  return isConfigured();
}

export function onAccountChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce() {
  // The store owns who a post is written as; the backend seam owns where it
  // goes. Both follow the account, in that order, before anything re-renders.
  setAccount(account);
  setBackend(account ? new RemoteBackend() : null);
  for (const listener of listeners) listener(account);
}

// The profile row carries the two things the session token doesn't: the
// display name the player can change, and whether this account moderates.
// `is_admin` is read from the server every time rather than remembered,
// because it is an authorisation fact and this is a client.
async function loadProfile(session) {
  try {
    const rows = await rest(`/profiles?select=display_name,is_admin&id=eq.${session.user.id}`);
    const profile = rows?.[0] ?? {};
    return {
      id: session.user.id,
      email: session.user.email,
      name: profile.display_name || session.user.name || session.user.email.split("@")[0],
      avatar: session.user.avatar,
      admin: Boolean(profile.is_admin),
    };
  } catch (err) {
    // A profile that can't be read (offline, or the row hasn't been created
    // yet) still leaves a usable signed-in account — just not an admin one,
    // since admin is exactly the claim that must never be assumed.
    console.warn("AimonSite: could not load profile", err);
    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name || session.user.email.split("@")[0],
      avatar: session.user.avatar,
      admin: false,
    };
  }
}

async function adopt(session) {
  account = session ? await loadProfile(session) : null;
  announce();
}

// Called once at startup, before the UI reads any account state. Resolves
// after a redirect back from Google has been exchanged, so the first render
// already knows whether anyone is signed in.
export async function initAuth() {
  if (!isConfigured()) return null;

  onSessionChange((session) => {
    // Fired by a refresh or an expiry rather than by a sign-in click, so the
    // account is rebuilt rather than assumed unchanged.
    if (!session) {
      account = null;
      announce();
    } else if (!account || account.id !== session.user.id) {
      adopt(session);
    }
  });

  const session = await completeSignIn();
  await adopt(session);
  return account;
}

export async function signIn() {
  return signInWithGoogle();
}

export async function signOutAccount() {
  await signOut();
  account = null;
  announce();
}

export function getCurrentSession() {
  return getSession();
}
