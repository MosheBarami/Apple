// What this device keeps for the account that is signed in, dropped when that account stops being the one using it.
//
// lib/auth.tsx clears these on the SIGNED_OUT event, which covers the button, a token expiry and a sign-out. A session that is
// REPLACED by another account's (verifyOtp over an existing session) sends SIGNED_IN, not SIGNED_OUT, so the previous account's
// unsent drafts, recent searches and open-project preferences would be waiting for whoever is signed in next. The Roblox landing
// page, the one place a session is replaced on purpose, calls this when the account really did change.
//
// The three families are the same three auth.tsx clears; tests/roblox-signin.test.mjs fails if the two lists drift apart.
import { clearAllDrafts } from './draft.ts';
import { clearAllSearchHistory } from './search-history.ts';
import { clearAllViewState } from './view-state.ts';

export function clearAccountState(): void {
  clearAllDrafts();
  clearAllSearchHistory();
  clearAllViewState();
}
