// ── Game State Machine ──
// Centralized state management for all app/editor/game transitions.
// Pure logic — no DOM references. Hooks registered from game.js handle side effects.

export const STATE = Object.freeze({
  MENU:             'MENU',
  MENU_EDITOR:      'MENU_EDITOR',
  GAME_PLAYING:     'GAME_PLAYING',
  GAME_PAUSED:      'GAME_PAUSED',
  GAME_EDITOR:      'GAME_EDITOR',
  EDITOR_PLAYTEST:  'EDITOR_PLAYTEST',
  GAME_OVER:        'GAME_OVER',
  VICTORY:          'VICTORY',
  AQUARIUM:         'AQUARIUM',
  SETTINGS:         'SETTINGS',
  ABOUT:            'ABOUT',
  CODEX:            'CODEX',
  COMMUNITY:        'COMMUNITY',
});

// ── Allowed transitions (whitelist) ──
const TRANSITIONS = {
  [STATE.MENU]:            [STATE.MENU_EDITOR, STATE.GAME_PLAYING, STATE.AQUARIUM, STATE.SETTINGS, STATE.ABOUT, STATE.CODEX, STATE.COMMUNITY],
  [STATE.MENU_EDITOR]:     [STATE.MENU],
  [STATE.GAME_PLAYING]:    [STATE.GAME_EDITOR, STATE.GAME_PAUSED, STATE.GAME_OVER, STATE.VICTORY, STATE.MENU, STATE.COMMUNITY],
  [STATE.GAME_PAUSED]:     [STATE.GAME_PLAYING, STATE.MENU, STATE.COMMUNITY],
  [STATE.GAME_EDITOR]:     [STATE.GAME_PLAYING, STATE.EDITOR_PLAYTEST],
  [STATE.EDITOR_PLAYTEST]: [STATE.GAME_EDITOR, STATE.EDITOR_PLAYTEST], // restart = self-transition
  [STATE.GAME_OVER]:       [STATE.GAME_PLAYING, STATE.MENU, STATE.COMMUNITY],
  [STATE.VICTORY]:         [STATE.GAME_PLAYING, STATE.MENU, STATE.COMMUNITY],
  [STATE.AQUARIUM]:        [STATE.MENU],
  [STATE.SETTINGS]:        [STATE.MENU],
  [STATE.ABOUT]:           [STATE.MENU],
  [STATE.CODEX]:           [STATE.MENU],
  [STATE.COMMUNITY]:       [STATE.MENU, STATE.GAME_PLAYING],
};

export class GameStateMachine {
  constructor() {
    this.current = STATE.MENU;
    this._hooks = {};   // { [state]: { onEnter, onExit } }
  }

  /**
   * Register enter/exit hooks for a state.
   * @param {string} state - One of STATE values
   * @param {{ onEnter?: (prev: string) => void, onExit?: (next: string) => void }} hooks
   */
  registerHooks(state, hooks) {
    this._hooks[state] = hooks;
  }

  /**
   * Transition to a new state. Calls exit hook on current, enter hook on new.
   * @param {string} newState - Target state
   * @returns {boolean} true if transition succeeded
   */
  transition(newState) {
    const allowed = TRANSITIONS[this.current];
    if (!allowed || !allowed.includes(newState)) {
      console.warn(`[GameState] Invalid transition: ${this.current} → ${newState}`);
      return false;
    }
    const prev = this.current;
    this._hooks[prev]?.onExit?.(newState);
    this.current = newState;
    this._hooks[newState]?.onEnter?.(prev);
    return true;
  }

  /**
   * Force-set state without transition validation. Use sparingly (e.g. init).
   * @param {string} newState
   */
  forceState(newState) {
    const prev = this.current;
    this._hooks[prev]?.onExit?.(newState);
    this.current = newState;
    this._hooks[newState]?.onEnter?.(prev);
  }

  /**
   * Check if current state is one of the given states.
   * @param {...string} states
   * @returns {boolean}
   */
  is(...states) {
    return states.includes(this.current);
  }

  /** True when in any editor state */
  get inEditor() {
    return this.is(STATE.MENU_EDITOR, STATE.GAME_EDITOR);
  }

  /** True when in a game state (playing, paused, editor, playtest, game over, victory) */
  get inGame() {
    return this.is(STATE.GAME_PLAYING, STATE.GAME_PAUSED, STATE.GAME_EDITOR,
                   STATE.EDITOR_PLAYTEST, STATE.GAME_OVER, STATE.VICTORY);
  }
}
