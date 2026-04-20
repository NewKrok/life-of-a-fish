// ── Account UI (#23) ──
// DOM controller for the Account section inside the Settings panel and the
// top-right user chip. Talks to the abstract backend (services/backend.js),
// so Firebase is never referenced directly here.
//
// Flow:
//   - Anonymous user sees "Sign in with Google" / "Sign in with Apple".
//   - On success, UID is preserved (linkWithPopup) so owned levels stay tied
//     to the same identity, and the UI swaps to "Signed in as <name> — [Sign out]".
//   - On `credential-already-in-use` (the Google account already belongs to a
//     different user), a modal offers to "Switch to that account"; if the
//     user confirms we call signInWith* with allowMerge=true and the current
//     anon UID is orphaned (its data stays, but is no longer reachable).

import { t } from './i18n.js';
import {
  hasBackend,
  getCurrentUser, onAuthStateChange,
  linkGoogle, linkApple,
  signInWithGoogle, signInWithApple, signOut,
  PROVIDER_GOOGLE, PROVIDER_APPLE,
} from './services/backend.js';

export class AccountUI {
  constructor({
    // user chip (main menu, top-right)
    chipEl, chipNameEl, chipAvatarEl,
    // settings block
    statusEl, actionsEl, msgEl,
    linkGoogleBtn, linkAppleBtn, signOutBtn,
    // modal
    modalEl, modalTitleEl, modalBodyEl, modalConfirmBtn, modalCancelBtn,
    // callbacks
    onOpenSettings, playClickSfx,
  }) {
    this.chipEl = chipEl;
    this.chipNameEl = chipNameEl;
    this.chipAvatarEl = chipAvatarEl;
    this.statusEl = statusEl;
    this.actionsEl = actionsEl;
    this.msgEl = msgEl;
    this.linkGoogleBtn = linkGoogleBtn;
    this.linkAppleBtn = linkAppleBtn;
    this.signOutBtn = signOutBtn;
    this.modalEl = modalEl;
    this.modalTitleEl = modalTitleEl;
    this.modalBodyEl = modalBodyEl;
    this.modalConfirmBtn = modalConfirmBtn;
    this.modalCancelBtn = modalCancelBtn;
    this.onOpenSettings = onOpenSettings;
    this.playClickSfx = playClickSfx || (() => {});

    this._user = null;
    this._busy = false;
    this._pendingModalAction = null;

    this._wire();
    this._render();
  }

  /** Kick off the initial auth-state subscription. Safe to call before
   *  the backend finishes initialising — no-ops until then. */
  start() {
    if (!hasBackend()) {
      this._render();
      return;
    }
    // Subscribe; cb fires immediately with current (possibly null) state.
    try {
      this._unsub = onAuthStateChange((user) => {
        this._user = user;
        this._render();
      });
    } catch {
      // Backend not initialised yet — retry periodically via small timer.
      setTimeout(() => this.start(), 500);
    }
  }

  _wire() {
    this.chipEl.addEventListener('click', () => {
      this.playClickSfx();
      if (this.onOpenSettings) this.onOpenSettings();
    });
    this.linkGoogleBtn.addEventListener('click', () => this._handleGoogle());
    this.linkAppleBtn.addEventListener('click', () => this._handleApple());
    this.signOutBtn.addEventListener('click', () => this._handleSignOut());
    this.modalCancelBtn.addEventListener('click', () => this._closeModal());
    this.modalConfirmBtn.addEventListener('click', () => this._confirmModal());
  }

  _render() {
    const u = this._user;
    const isAnon = !u || u.isAnonymous;
    const name = !isAnon && u && u.displayName ? u.displayName : t('account.guest');

    // Chip (main-menu top-right)
    this.chipNameEl.textContent = name;
    if (u && u.photoURL) {
      this.chipAvatarEl.innerHTML = '';
      const img = document.createElement('img');
      img.src = u.photoURL;
      img.alt = '';
      this.chipAvatarEl.appendChild(img);
    } else {
      this.chipAvatarEl.textContent = (name || '?').slice(0, 1).toUpperCase();
    }

    // Settings status line
    if (isAnon) {
      this.statusEl.textContent = t('account.statusAnonymous');
    } else {
      const providerLabel = _providerLabel(u && u.providerId);
      this.statusEl.textContent = t('account.statusSignedIn', { name, provider: providerLabel });
    }

    // Buttons: show link buttons when anon, sign-out when linked.
    const showLink = isAnon;
    this.linkGoogleBtn.classList.toggle('hidden', !showLink);
    this.linkAppleBtn.classList.toggle('hidden', !showLink);
    this.signOutBtn.classList.toggle('hidden', showLink);

    // Update link-button labels to say "Sign in" while anon; when not
    // anonymous the buttons are hidden anyway.
    this.linkGoogleBtn.textContent = t('account.linkGoogle');
    this.linkAppleBtn.textContent = t('account.linkApple');
    this.signOutBtn.textContent = t('account.signOut');
  }

  /** Toggle the user chip visibility (shown only on the main menu). */
  setChipVisible(visible) {
    this.chipEl.classList.toggle('visible', !!visible);
  }

  _setBusy(busy) {
    this._busy = busy;
    this.linkGoogleBtn.disabled = busy;
    this.linkAppleBtn.disabled = busy;
    this.signOutBtn.disabled = busy;
  }

  _setMsg(text, isError) {
    this.msgEl.textContent = text || '';
    this.msgEl.classList.toggle('error', !!isError);
  }

  async _handleGoogle() {
    this.playClickSfx();
    if (this._busy) return;
    this._setBusy(true);
    this._setMsg(t('account.working'));
    try {
      await linkGoogle();
      this._setMsg(t('account.linkedOk'));
    } catch (err) {
      await this._onAuthError(err, 'google');
    } finally {
      this._setBusy(false);
    }
  }

  async _handleApple() {
    this.playClickSfx();
    if (this._busy) return;
    this._setBusy(true);
    this._setMsg(t('account.working'));
    try {
      await linkApple();
      this._setMsg(t('account.linkedOk'));
    } catch (err) {
      await this._onAuthError(err, 'apple');
    } finally {
      this._setBusy(false);
    }
  }

  async _handleSignOut() {
    this.playClickSfx();
    if (this._busy) return;
    // Confirm — signing out creates a fresh anonymous identity. Levels stay
    // on the old account but won't be listed as "mine" until the user signs
    // back in.
    const ok = await this._showModal({
      titleKey: 'account.signOutTitle',
      bodyKey: 'account.signOutBody',
      confirmKey: 'account.signOut',
      cancelKey: 'account.modalCancel',
    });
    if (!ok) return;
    this._setBusy(true);
    this._setMsg(t('account.working'));
    try {
      await signOut();
      this._setMsg(t('account.signedOutOk'));
    } catch (err) {
      this._setMsg(_formatErr(err), true);
    } finally {
      this._setBusy(false);
    }
  }

  async _onAuthError(err, provider) {
    const code = err && err.code ? err.code : 'unknown';
    if (code === 'cancelled') {
      // User closed the popup — silent.
      this._setMsg('');
      return;
    }
    if (code === 'already-linked') {
      this._setMsg(t('account.alreadyLinked'));
      return;
    }
    if (code === 'credential-already-in-use') {
      // Offer to switch to the existing account (drops anon progress).
      const ok = await this._showModal({
        titleKey: 'account.conflictTitle',
        bodyKey: 'account.conflictBody',
        confirmKey: 'account.conflictConfirm',
        cancelKey: 'account.modalCancel',
      });
      if (!ok) {
        this._setMsg('');
        return;
      }
      this._setMsg(t('account.working'));
      try {
        if (provider === 'google') await signInWithGoogle({ allowMerge: true });
        else await signInWithApple({ allowMerge: true });
        this._setMsg(t('account.linkedOk'));
      } catch (err2) {
        this._setMsg(_formatErr(err2), true);
      }
      return;
    }
    this._setMsg(_formatErr(err), true);
  }

  // ── Modal helpers ──
  _showModal({ titleKey, bodyKey, confirmKey, cancelKey }) {
    this.modalTitleEl.textContent = t(titleKey);
    this.modalBodyEl.textContent = t(bodyKey);
    this.modalConfirmBtn.textContent = t(confirmKey);
    this.modalCancelBtn.textContent = t(cancelKey);
    this.modalEl.classList.add('visible');
    return new Promise((resolve) => {
      this._pendingModalAction = resolve;
    });
  }

  _closeModal() {
    this.modalEl.classList.remove('visible');
    if (this._pendingModalAction) {
      const r = this._pendingModalAction;
      this._pendingModalAction = null;
      r(false);
    }
  }

  _confirmModal() {
    this.modalEl.classList.remove('visible');
    if (this._pendingModalAction) {
      const r = this._pendingModalAction;
      this._pendingModalAction = null;
      r(true);
    }
  }
}

function _providerLabel(providerId) {
  if (providerId === PROVIDER_GOOGLE) return t('account.provider.google');
  if (providerId === PROVIDER_APPLE) return t('account.provider.apple');
  return t('account.provider.anonymous');
}

function _formatErr(err) {
  const code = err && err.code ? err.code : 'unknown';
  const key = 'account.err.' + code;
  const localized = t(key);
  if (localized === key) {
    // Fall back to the shared community-error table (shared codes).
    const shared = t('editor.communityErr.' + code);
    if (shared && shared !== 'editor.communityErr.' + code) return shared;
    return err && err.message ? err.message : code;
  }
  return localized;
}

/** Format a level-card owner label: username when present, "Anon" otherwise. */
export function formatOwnerLabel(ownerName) {
  if (ownerName && typeof ownerName === 'string' && ownerName.trim()) {
    return ownerName.trim();
  }
  return t('account.anonOwner');
}
