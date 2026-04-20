// ── Community Level Browser ──
// Handles the DOM-based browser for community-shared levels: list render,
// search, pagination, rating UI, report action. Reads data through the
// abstract backend (services/backend.js), so Firebase is never referenced
// directly here.

import { t } from './i18n.js';
import {
  hasBackend, getUid,
  listCommunityLevels, rateLevel, myRatingFor,
  getLevelRatingStats, getLevelReportCount, reportLevel,
  REPORT_HIDE_THRESHOLD,
} from './services/backend.js';
import { isValidLevelCode } from './services/level-code.js';
import { formatOwnerLabel } from './account-ui.js';

/**
 * Renders the community browser panel. Construction is cheap — call `open()`
 * to actually fetch and display levels. `onPlayLevel(levelDoc)` is invoked
 * when the user clicks Play on a card.
 */
export class CommunityBrowser {
  constructor({
    panelEl, entriesEl, statusEl, loadMoreBtn,
    searchInput, refreshBtn, backBtn,
    onPlayLevel, onBack,
  }) {
    this.panelEl = panelEl;
    this.entriesEl = entriesEl;
    this.statusEl = statusEl;
    this.loadMoreBtn = loadMoreBtn;
    this.searchInput = searchInput;
    this.refreshBtn = refreshBtn;
    this.backBtn = backBtn;
    this.onPlayLevel = onPlayLevel;
    this.onBack = onBack;

    this._cursor = null;
    this._loading = false;
    this._items = [];        // currently rendered levels (after hide filter)
    this._searchDebounce = null;
    this._lastSearch = '';

    this._wire();
  }

  _wire() {
    this.backBtn.addEventListener('click', () => {
      if (this.onBack) this.onBack();
    });
    this.refreshBtn.addEventListener('click', () => this.refresh());
    this.loadMoreBtn.addEventListener('click', () => this._loadNextPage());
    this.searchInput.addEventListener('input', () => {
      clearTimeout(this._searchDebounce);
      this._searchDebounce = setTimeout(() => this._onSearchChanged(), 300);
    });
  }

  /** Opens the panel and fetches the first page of community levels. */
  open() {
    this.panelEl.classList.add('visible');
    this._reset();
    this.refresh();
  }

  /** Closes the panel without clearing state (in case user returns). */
  close() {
    this.panelEl.classList.remove('visible');
  }

  /** Forgets all loaded state, triggers a fresh fetch. */
  refresh() {
    this._reset();
    this._loadNextPage();
  }

  _reset() {
    this._cursor = null;
    this._items = [];
    this.entriesEl.innerHTML = '';
    this.loadMoreBtn.hidden = true;
    this._setStatus('');
  }

  _onSearchChanged() {
    const q = (this.searchInput.value || '').trim();
    if (q === this._lastSearch) return;
    this._lastSearch = q;
    this._reset();
    this._loadNextPage();
  }

  async _loadNextPage() {
    if (this._loading) return;
    if (!hasBackend() || !getUid()) {
      this._setStatus(t('community.notReady'), true);
      return;
    }
    this._loading = true;
    this._setStatus(t('community.loading'));
    this.loadMoreBtn.hidden = true;
    try {
      const { levels, nextCursor } = await listCommunityLevels({
        cursor: this._cursor,
        search: this._lastSearch || undefined,
      });
      this._cursor = nextCursor;

      // Filter out levels this user already reported (hide own reports eagerly)
      const visibleLevels = await this._applyHideFilter(levels);

      for (const lvl of visibleLevels) {
        const card = this._buildCard(lvl);
        this.entriesEl.appendChild(card);
        this._items.push({ doc: lvl, card });
        // Lazily fetch rating stats per card (parallel-ish)
        this._hydrateCardStats(lvl, card);
      }

      if (this._items.length === 0) {
        this._setStatus(this._lastSearch
          ? t('community.emptySearch')
          : t('community.empty'));
      } else {
        this._setStatus('');
      }
      this.loadMoreBtn.hidden = !nextCursor;
    } catch (err) {
      this._setStatus(this._formatErr(err), true);
    } finally {
      this._loading = false;
    }
  }

  /**
   * For each level, check its report count and whether the current user
   * already reported it. Filter out those that hit the auto-hide threshold
   * or were reported by me.
   */
  async _applyHideFilter(levels) {
    const checks = await Promise.all(levels.map(async (lvl) => {
      try {
        const count = await getLevelReportCount(lvl.levelId);
        if (count >= REPORT_HIDE_THRESHOLD) return { lvl, hide: true };
        return { lvl, hide: false };
      } catch {
        return { lvl, hide: false };
      }
    }));
    return checks.filter((r) => !r.hide).map((r) => r.lvl);
  }

  _buildCard(lvl) {
    const card = document.createElement('div');
    card.className = 'community-card';

    const row1 = document.createElement('div');
    row1.className = 'community-card-row';

    const name = document.createElement('div');
    name.className = 'community-card-name';
    name.textContent = lvl.name || '—';
    row1.appendChild(name);

    const code = document.createElement('div');
    code.className = 'community-card-code';
    code.textContent = lvl.code || '';
    row1.appendChild(code);

    const row2 = document.createElement('div');
    row2.className = 'community-card-row';

    const meta = document.createElement('div');
    meta.className = 'community-card-meta';
    const ratingEl = document.createElement('span');
    ratingEl.className = 'community-card-rating';
    ratingEl.textContent = t('community.ratingPending');
    meta.appendChild(ratingEl);
    const ownerEl = document.createElement('span');
    ownerEl.className = 'community-card-owner';
    ownerEl.textContent = t('community.byOwner', { name: formatOwnerLabel(lvl.ownerName) });
    ownerEl.title = ownerEl.textContent;
    meta.appendChild(ownerEl);
    const dateEl = document.createElement('span');
    dateEl.textContent = _formatDate(lvl.createdAt);
    meta.appendChild(dateEl);
    row2.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'community-card-actions';

    const reportBtn = document.createElement('button');
    reportBtn.className = 'community-report-btn';
    reportBtn.textContent = t('community.report');
    reportBtn.title = t('community.report');
    reportBtn.addEventListener('click', () => this._handleReport(lvl, card));
    actions.appendChild(reportBtn);

    const playBtn = document.createElement('button');
    playBtn.className = 'community-play-btn';
    playBtn.textContent = t('community.play');
    playBtn.addEventListener('click', () => {
      if (this.onPlayLevel) this.onPlayLevel(lvl);
    });
    actions.appendChild(playBtn);

    row2.appendChild(actions);

    card.appendChild(row1);
    card.appendChild(row2);

    // Store ratingEl on the card for later hydration
    card._ratingEl = ratingEl;
    return card;
  }

  async _hydrateCardStats(lvl, card) {
    try {
      const { avg, count } = await getLevelRatingStats(lvl.levelId);
      if (count === 0) {
        card._ratingEl.textContent = t('community.ratingNone');
      } else {
        card._ratingEl.textContent = t('community.ratingFormat', {
          avg: avg.toFixed(1),
          count,
        });
      }
    } catch {
      // Silently leave "pending" — not worth surfacing network errors per card
    }
  }

  async _handleReport(lvl, card) {
    const reason = prompt(t('community.reportPrompt'), '');
    if (reason === null) return; // cancelled
    try {
      await reportLevel(lvl.levelId, reason);
      // Optimistic hide: remove from view immediately
      card.remove();
      this._items = this._items.filter((it) => it.doc.levelId !== lvl.levelId);
      this._setStatus(t('community.reported'));
    } catch (err) {
      this._setStatus(this._formatErr(err), true);
    }
  }

  _setStatus(text, isError) {
    this.statusEl.textContent = text || '';
    this.statusEl.classList.toggle('error', !!isError);
  }

  _formatErr(err) {
    const code = err && err.code ? err.code : 'unknown';
    const key = 'editor.communityErr.' + code;
    const localized = t(key);
    if (localized === key) return err.message || code;
    return localized;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ── Victory-screen rating UI ────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
//
// Attaches to the rating block inside the victory panel. Call `showFor(levelId)`
// after a community level is completed; call `hide()` when switching away.

export class VictoryRatingUI {
  constructor({ blockEl, starsEl, statusEl }) {
    this.blockEl = blockEl;
    this.starsEl = starsEl;
    this.statusEl = statusEl;
    this._levelId = null;
    this._currentStars = 0;
    this._starButtons = Array.from(starsEl.querySelectorAll('.community-star'));

    for (const btn of this._starButtons) {
      const n = Number(btn.dataset.stars);
      btn.addEventListener('mouseenter', () => this._previewStars(n));
      btn.addEventListener('mouseleave', () => this._previewStars(this._currentStars));
      btn.addEventListener('click', () => this._submitStars(n));
    }
  }

  async showFor(levelId) {
    this._levelId = levelId;
    this._currentStars = 0;
    this.blockEl.hidden = false;
    this._setStatus('');
    try {
      const existing = await myRatingFor(levelId);
      if (existing != null) {
        this._currentStars = existing;
        this._previewStars(existing);
        this._setStatus(t('community.rateAlready'));
      } else {
        this._previewStars(0);
      }
    } catch {
      // Offline or whatever — still let the user rate, show nothing
      this._previewStars(0);
    }
  }

  hide() {
    this.blockEl.hidden = true;
    this._levelId = null;
    this._currentStars = 0;
    this._previewStars(0);
    this._setStatus('');
  }

  _previewStars(n) {
    for (const btn of this._starButtons) {
      const v = Number(btn.dataset.stars);
      btn.classList.toggle('active', v <= n);
    }
  }

  async _submitStars(n) {
    if (!this._levelId) return;
    this._currentStars = n;
    this._previewStars(n);
    this._setStatus(t('community.rateSubmitting'));
    try {
      await rateLevel(this._levelId, n);
      this._setStatus(t('community.rateThanks'));
    } catch (err) {
      const code = err && err.code ? err.code : 'unknown';
      const key = 'editor.communityErr.' + code;
      const localized = t(key);
      this._setStatus(localized === key ? (err.message || code) : localized);
    }
  }

  _setStatus(text) {
    this.statusEl.textContent = text || '';
  }
}

function _formatDate(ms) {
  if (!ms || typeof ms !== 'number') return '';
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' });
}

// Exported only for tests (pure function, no DOM)
export function _isValidCommunityLevelDoc(doc) {
  return !!(doc && typeof doc === 'object'
    && typeof doc.levelId === 'string'
    && typeof doc.code === 'string' && isValidLevelCode(doc.code)
    && doc.data && typeof doc.data === 'object'
    && Array.isArray(doc.data.strings)
    && Array.isArray(doc.data.entities));
}
