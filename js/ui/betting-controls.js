// js/ui/betting-controls.js - Encapsulated Poker Betting Controls & Slider Controller

class BettingControlsController {
  constructor(options = {}) {
    this.onAction = options.onAction || (() => {});
    this.getCurrentState = options.getCurrentState || (() => null);
    this.getLocalPlayerId = options.getLocalPlayerId || (() => 0);

    // Cache DOM Elements
    this.btnFold = document.getElementById('btn-fold');
    this.btnCheckCall = document.getElementById('btn-check-call');
    this.btnBetRaise = document.getElementById('btn-bet-raise');
    this.btnAllIn = document.getElementById('btn-allin');
    this.betSlider = document.getElementById('bet-slider');
    this.presetChips = document.querySelectorAll('.preset-chip[data-val]');

    this.initActionButtons();
    this.initSliderEvents();
    this.initPresetChips();
  }

  initActionButtons() {
    if (this.btnFold) {
      this.btnFold.addEventListener('click', () => {
        this.onAction('fold');
      });
    }

    if (this.btnCheckCall) {
      this.btnCheckCall.addEventListener('click', () => {
        const state = this.getCurrentState();
        const localId = this.getLocalPlayerId();
        const me = state && state.players ? state.players[localId] : null;
        const callDiff = (state && state.currentBet ? state.currentBet : 0) - (me && me.currentRoundBet ? me.currentRoundBet : 0);
        this.onAction(callDiff > 0 ? 'call' : 'check');
      });
    }

    if (this.btnBetRaise) {
      this.btnBetRaise.addEventListener('click', () => {
        const amount = this.betSlider ? parseInt(this.betSlider.value, 10) : 0;
        this.onAction('raise', amount);
      });
    }

    if (this.btnAllIn) {
      this.btnAllIn.addEventListener('click', () => {
        this.onAction('allin');
      });
    }
  }

  initSliderEvents() {
    if (!this.betSlider) return;

    this.betSlider.addEventListener('input', () => {
      this.updateRaiseButtonText();
    });
  }

  initPresetChips() {
    if (!this.presetChips) return;

    this.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const type = chip.dataset.val;
        const state = this.getCurrentState();
        const localId = this.getLocalPlayerId();
        const me = state && state.players ? state.players[localId] : null;
        if (!me) return;

        const bb = state.bigBlind || 20;
        const pot = state.pot || 0;
        const minRaise = state.minRaise || bb;
        const currentBet = state.currentBet || 0;
        const minBet = currentBet > 0 ? currentBet + minRaise : bb;
        const maxBet = me.chips + (me.currentRoundBet || 0);

        let target = minBet;
        if (type === 'min') target = minBet;
        else if (type === '2bb') target = currentBet > 0 ? currentBet + (bb * 2) : bb * 2;
        else if (type === '3bb') target = currentBet > 0 ? currentBet + (bb * 3) : bb * 3;
        else if (type === 'pot') target = Math.max(minBet, currentBet + Math.max(bb, pot));
        else if (type === 'max') target = maxBet;

        target = Math.max(minBet, Math.min(maxBet, target));
        if (this.betSlider) {
          this.betSlider.value = target;
          this.updateRaiseButtonText();
        }
      });
    });
  }

  updateRaiseButtonText() {
    if (!this.btnBetRaise || !this.betSlider) return;

    const val = parseInt(this.betSlider.value, 10);
    const state = this.getCurrentState();
    const localId = this.getLocalPlayerId();
    const me = state && state.players ? state.players[localId] : null;

    if (me && state) {
      const callDiff = (state.currentBet || 0) - (me.currentRoundBet || 0);
      if (callDiff > 0 && state.currentBet > 0) {
        const raiseBy = val - state.currentBet;
        this.btnBetRaise.textContent = `RAISE $${raiseBy}`;
      } else {
        this.btnBetRaise.textContent = `BET $${val}`;
      }
    } else {
      this.btnBetRaise.textContent = `BET $${val}`;
    }
  }

  render(state, localPlayerId, isSpectator = false) {
    if (!state) return;

    const isMyTurn = (state.activeTurnPlayer === localPlayerId && !isSpectator);
    const canBet = (state.phase === 'PRE_DRAFT_BETTING' || state.phase === 'CARD_BETTING');
    const me = state.players ? state.players[localPlayerId] : null;

    if (this.btnFold) this.btnFold.disabled = !isMyTurn || !canBet;

    if (this.btnCheckCall) {
      this.btnCheckCall.disabled = !isMyTurn || !canBet;
      if (me) {
        const callDiff = (state.currentBet || 0) - (me.currentRoundBet || 0);
        this.btnCheckCall.textContent = callDiff > 0 ? `CALL $${callDiff}` : 'CHECK';
      }
    }

    if (this.btnBetRaise) {
      this.btnBetRaise.disabled = !isMyTurn || !canBet;
      if (me && this.betSlider) {
        const bb = state.bigBlind || 20;
        const minRaiseInc = state.minRaise || bb;
        const minTargetBet = state.currentBet > 0 ? state.currentBet + minRaiseInc : bb;
        const maxTargetBet = me.chips + (me.currentRoundBet || 0);

        this.betSlider.min = minTargetBet;
        this.betSlider.max = Math.max(minTargetBet, maxTargetBet);
        this.betSlider.step = bb;

        const currentVal = parseInt(this.betSlider.value, 10);
        if (currentVal < minTargetBet) {
          this.betSlider.value = minTargetBet;
        } else if (currentVal > maxTargetBet) {
          this.betSlider.value = maxTargetBet;
        }

        this.updateRaiseButtonText();
      }
    }

    if (this.btnAllIn) {
      this.btnAllIn.disabled = !isMyTurn || !canBet;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { BettingControlsController };
}
