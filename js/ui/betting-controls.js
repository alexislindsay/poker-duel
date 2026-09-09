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
        const maxBet = me.chips + (me.currentRoundBet || 0);
        if (maxBet <= currentBet) return; // Cannot raise

        const minBet = Math.min(maxBet, currentBet > 0 ? currentBet + minRaise : bb);

        let target = minBet;
        if (type === 'min') target = minBet;
        else if (type === '2bb') target = currentBet > 0 ? currentBet + (bb * 2) : bb * 2;
        else if (type === '3bb') target = currentBet > 0 ? currentBet + (bb * 3) : bb * 3;
        else if (type === 'pot') target = Math.max(minBet, currentBet + Math.max(bb, pot));
        else if (type === 'max') target = maxBet;

        // Strict clamp to never exceed maxBet:
        target = Math.min(maxBet, Math.max(minBet, target));
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
      const currentBet = state.currentBet || 0;
      const totalStack = me.chips + (me.currentRoundBet || 0);
      if (val >= totalStack && totalStack > currentBet) {
        this.btnBetRaise.textContent = `ALL IN $${totalStack}`;
      } else if (currentBet > 0) {
        const raiseBy = val - currentBet;
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

    const me = state.players ? state.players[localPlayerId] : null;
    const canPlayerAct = me && !me.folded && !me.isAllIn && me.chips > 0;
    const isMyTurn = (state.activeTurnPlayer === localPlayerId && !isSpectator && canPlayerAct);
    const canBet = (state.phase === 'PRE_DRAFT_BETTING' || state.phase === 'CARD_BETTING') && isMyTurn;

    if (this.btnFold) this.btnFold.disabled = !canBet;

    if (this.btnCheckCall) {
      this.btnCheckCall.disabled = !canBet;
      if (me) {
        const callDiff = (state.currentBet || 0) - (me.currentRoundBet || 0);
        if (callDiff > 0) {
          const actualCall = Math.min(me.chips, callDiff);
          this.btnCheckCall.textContent = (actualCall < callDiff || me.chips <= callDiff)
            ? `CALL ALL-IN $${actualCall}`
            : `CALL $${callDiff}`;
        } else {
          this.btnCheckCall.textContent = 'CHECK';
        }
      }
    }

    if (this.btnBetRaise) {
      const currentBet = state.currentBet || 0;
      const totalStack = me ? (me.chips + (me.currentRoundBet || 0)) : 0;
      const canRaise = canBet && totalStack > currentBet;

      this.btnBetRaise.disabled = !canRaise;

      if (canRaise && this.betSlider) {
        const bb = state.bigBlind || 20;
        const minRaiseInc = state.minRaise || bb;
        const nominalMin = currentBet > 0 ? currentBet + minRaiseInc : bb;
        const sliderMin = Math.min(nominalMin, totalStack);
        const sliderMax = totalStack;

        this.betSlider.min = sliderMin;
        this.betSlider.max = sliderMax;
        this.betSlider.step = Math.min(bb, Math.max(1, sliderMax - sliderMin));

        let currentVal = parseInt(this.betSlider.value, 10);
        if (isNaN(currentVal) || currentVal < sliderMin) {
          this.betSlider.value = sliderMin;
        } else if (currentVal > sliderMax) {
          this.betSlider.value = sliderMax;
        }

        this.updateRaiseButtonText();
      }
    }

    if (this.btnAllIn) {
      this.btnAllIn.disabled = !canBet;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { BettingControlsController };
}
