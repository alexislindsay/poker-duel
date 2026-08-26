// js/game-engine.js - Core Poker Duel State Machine with Betting Per Card Kept

const BLIND_LEVELS = [
  { level: 1, small: 10, big: 20 },
  { level: 2, small: 20, big: 40 },
  { level: 3, small: 30, big: 60 },
  { level: 4, small: 50, big: 100 },
  { level: 5, small: 100, big: 200 },
  { level: 6, small: 200, big: 400 },
  { level: 7, small: 500, big: 1000 }
];

const GAME_PHASES = {
  LOBBY: 'LOBBY',
  DEALING: 'DEALING',
  PRE_DRAFT_BETTING: 'PRE_DRAFT_BETTING',
  DRAFTING: 'DRAFTING',
  CARD_BETTING: 'CARD_BETTING',
  SHOWDOWN: 'SHOWDOWN',
  ROUND_OVER: 'ROUND_OVER',
  GAME_OVER: 'GAME_OVER'
};

class GameEngine {
  constructor(options = {}) {
    this.initialChips = options.initialChips || 1000;
    this.blindRoundsInterval = options.blindRoundsInterval || 3;
    this.onStateChange = options.onStateChange || (() => {});
    this.onEvent = options.onEvent || (() => {});

    this.resetGame();
  }

  resetGame() {
    this.roundNumber = 0;
    this.blindLevelIndex = 0;
    this.dealerIndex = 0; // 0 = Player 1, 1 = Player 2
    this.activeTurnPlayer = 0;
    this.activeDraftPlayer = 0;
    this.phase = GAME_PHASES.LOBBY;
    
    this.players = [
      {
        id: 0,
        name: 'Player 1',
        chips: this.initialChips,
        holeCards: [],
        currentRoundBet: 0,
        totalHandBet: 0,
        folded: false,
        isAllIn: false,
        handEval: null
      },
      {
        id: 1,
        name: 'Player 2',
        chips: this.initialChips,
        holeCards: [],
        currentRoundBet: 0,
        totalHandBet: 0,
        folded: false,
        isAllIn: false,
        handEval: null
      }
    ];

    this.deck = new Deck();
    this.communityCards = [];
    this.discardPile = [];
    this.currentDrawnCard = null;
    this.pot = 0;
    this.currentBet = 0;
    this.minRaise = 0;
    this.betActedSet = new Set();
    this.lastAction = null;
    this.roundWinner = null;
    this.gameWinner = null;
    this.potWonAmount = 0;
    this.winReason = '';
  }

  get currentBlindLevel() {
    return BLIND_LEVELS[Math.min(this.blindLevelIndex, BLIND_LEVELS.length - 1)];
  }

  get currentSmallBlind() {
    return this.currentBlindLevel.small;
  }

  get currentBigBlind() {
    return this.currentBlindLevel.big;
  }

  startNewRound() {
    // Check elimination
    if (this.players[0].chips <= 0) {
      this.phase = GAME_PHASES.GAME_OVER;
      this.gameWinner = this.players[1];
      this.notifyState();
      return;
    }
    if (this.players[1].chips <= 0) {
      this.phase = GAME_PHASES.GAME_OVER;
      this.gameWinner = this.players[0];
      this.notifyState();
      return;
    }

    this.roundNumber++;
    this.blindLevelIndex = Math.floor((this.roundNumber - 1) / this.blindRoundsInterval);

    // Rotate dealer button
    if (this.roundNumber > 1) {
      this.dealerIndex = 1 - this.dealerIndex;
    }

    const sbPlayer = this.players[this.dealerIndex];
    const bbPlayer = this.players[1 - this.dealerIndex];

    // Reset round state
    this.deck.reset();
    this.communityCards = [];
    this.discardPile = [];
    this.currentDrawnCard = null;
    this.pot = 0;
    this.currentBet = 0;
    this.betActedSet = new Set();
    this.lastAction = null;
    this.roundWinner = null;
    this.potWonAmount = 0;
    this.winReason = '';

    for (const p of this.players) {
      p.holeCards = [];
      p.currentRoundBet = 0;
      p.totalHandBet = 0;
      p.folded = false;
      p.isAllIn = false;
      p.handEval = null;
    }

    // Post Blinds
    const sbAmount = Math.min(sbPlayer.chips, this.currentSmallBlind);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentRoundBet = sbAmount;
    sbPlayer.totalHandBet = sbAmount;
    sbPlayer.isAllIn = (sbPlayer.chips === 0);

    const bbAmount = Math.min(bbPlayer.chips, this.currentBigBlind);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentRoundBet = bbAmount;
    bbPlayer.totalHandBet = bbAmount;
    bbPlayer.isAllIn = (bbPlayer.chips === 0);

    this.pot = sbAmount + bbAmount;
    this.currentBet = this.currentBigBlind;
    this.minRaise = this.currentBigBlind * 2;

    // Deal 3 hole cards to each player
    for (let i = 0; i < 3; i++) {
      this.players[0].holeCards.push(this.deck.draw());
      this.players[1].holeCards.push(this.deck.draw());
    }

    this.updateEvaluations();

    // Small blind acts first in pre-draft betting
    this.activeTurnPlayer = this.dealerIndex;
    this.phase = GAME_PHASES.PRE_DRAFT_BETTING;
    this.betActedSet.clear();

    this.onEvent({ type: 'ROUND_STARTED', round: this.roundNumber, dealer: this.dealerIndex });
    this.notifyState();
  }

  updateEvaluations() {
    for (const p of this.players) {
      const allCards = [...p.holeCards, ...this.communityCards];
      p.handEval = PokerEvaluator.evaluateBestHand(allCards);
    }
  }

  // Handle player betting actions
  handleBettingAction(playerId, action, amount = 0) {
    if (playerId !== this.activeTurnPlayer) return false;
    const isBettingPhase = (this.phase === GAME_PHASES.PRE_DRAFT_BETTING || this.phase === GAME_PHASES.CARD_BETTING);
    if (!isBettingPhase) return false;

    const player = this.players[playerId];
    const opponent = this.players[1 - playerId];
    const callAmount = this.currentBet - player.currentRoundBet;

    switch (action) {
      case 'check':
        if (callAmount > 0) return false; // cannot check if bet uncalled
        this.betActedSet.add(playerId);
        this.lastAction = { playerId, action: 'check', text: `${player.name} checks` };
        this.onEvent({ type: 'ACTION_CHECK', playerId });
        this.advanceBettingTurn(playerId, 'check');
        break;

      case 'call':
        const actualCall = Math.min(player.chips, callAmount);
        player.chips -= actualCall;
        player.currentRoundBet += actualCall;
        player.totalHandBet += actualCall;
        this.pot += actualCall;
        if (player.chips === 0) player.isAllIn = true;

        this.betActedSet.add(playerId);
        this.lastAction = { playerId, action: 'call', amount: actualCall, text: `${player.name} calls $${actualCall}` };
        this.onEvent({ type: 'ACTION_CALL', playerId, amount: actualCall });
        this.advanceBettingTurn(playerId, 'call');
        break;

      case 'bet':
      case 'raise':
        let targetBet = Math.min(player.chips + player.currentRoundBet, amount);
        let additionalChips = targetBet - player.currentRoundBet;
        if (additionalChips <= 0) {
          if (callAmount <= 0) {
            return this.handleBettingAction(playerId, 'check');
          } else {
            return this.handleBettingAction(playerId, 'call');
          }
        }

        player.chips -= additionalChips;
        player.currentRoundBet = targetBet;
        player.totalHandBet += additionalChips;
        this.pot += additionalChips;
        this.currentBet = targetBet;
        this.minRaise = targetBet + Math.max(additionalChips, this.currentBigBlind);
        if (player.chips === 0) player.isAllIn = true;

        // When a player raises, opponent must act
        this.betActedSet.clear();
        this.betActedSet.add(playerId);

        this.lastAction = { playerId, action: 'raise', amount: targetBet, text: `${player.name} raises to $${targetBet}` };
        this.onEvent({ type: 'ACTION_RAISE', playerId, amount: targetBet });
        this.advanceBettingTurn(playerId, 'raise');
        break;

      case 'fold':
        player.folded = true;
        this.lastAction = { playerId, action: 'fold', text: `${player.name} folds` };
        this.onEvent({ type: 'ACTION_FOLD', playerId });
        this.endHandFold(1 - playerId);
        return true;
    }

    this.notifyState();
    return true;
  }

  advanceBettingTurn(lastPlayerId, lastActionType) {
    const p0 = this.players[0];
    const p1 = this.players[1];

    const betsEqual = p0.currentRoundBet === p1.currentRoundBet;
    const bothActed = this.betActedSet.has(0) && this.betActedSet.has(1);

    // Betting round ends when both players have acted and bets are equalized or all-in
    const bettingRoundDone = (bothActed && betsEqual) || p0.isAllIn || p1.isAllIn;

    if (bettingRoundDone) {
      this.resetRoundBets();

      // If all 5 community cards are locked in, proceed to Showdown!
      if (this.communityCards.length >= 5) {
        this.resolveShowdown();
      } else {
        // Proceed to Draft next community card!
        this.phase = GAME_PHASES.DRAFTING;
        if (this.communityCards.length === 0) {
          this.activeDraftPlayer = 1 - this.dealerIndex;
        } else {
          this.activeDraftPlayer = 1 - this.activeDraftPlayer;
        }
        this.drawNextDraftCard();
      }
    } else {
      // Pass turn to other player to respond to bet/check
      this.activeTurnPlayer = 1 - lastPlayerId;
    }
  }

  resetRoundBets() {
    this.currentBet = 0;
    this.minRaise = this.currentBigBlind;
    this.betActedSet.clear();
    this.players[0].currentRoundBet = 0;
    this.players[1].currentRoundBet = 0;
  }

  // Draw card for the drafting phase
  drawNextDraftCard() {
    if (this.communityCards.length >= 5) {
      this.resolveShowdown();
      return;
    }

    let card = this.deck.draw();
    if (!card) {
      // Deck empty: reshuffle discards
      this.deck.cards = [...this.discardPile];
      this.deck.shuffle();
      this.discardPile = [];
      card = this.deck.draw();
    }

    this.currentDrawnCard = card;
    this.onEvent({ type: 'CARD_DRAWN_FOR_DRAFT', card, activeDraftPlayer: this.activeDraftPlayer });
    this.notifyState();
  }

  // Player chooses to KEEP or DISCARD the drawn card
  handleDraftDecision(playerId, decision) {
    if (this.phase !== GAME_PHASES.DRAFTING) return false;
    if (playerId !== this.activeDraftPlayer) return false;
    if (!this.currentDrawnCard) return false;

    const card = this.currentDrawnCard;
    const player = this.players[playerId];

    if (decision === 'keep') {
      this.communityCards.push(card);
      this.lastAction = { playerId, action: 'keep', card, text: `${player.name} KEPT a card for Space ${this.communityCards.length}` };
      this.onEvent({ type: 'DRAFT_KEEP', playerId, card, slotIndex: this.communityCards.length - 1 });
      this.currentDrawnCard = null;
      this.updateEvaluations();

      // A card was KEPT! Start a new BETTING ROUND on this new card!
      this.startCardBettingRound();
    } else {
      // DISCARD: Card is burned face-down. Next player draws!
      this.discardPile.push(card);
      this.lastAction = { playerId, action: 'discard', text: `${player.name} DISCARDED a card` };
      this.onEvent({ type: 'DRAFT_DISCARD', playerId });
      this.currentDrawnCard = null;
      this.updateEvaluations();

      // Alternate draft turn to opponent to draw next card
      this.activeDraftPlayer = 1 - this.activeDraftPlayer;
      this.drawNextDraftCard();
    }

    this.notifyState();
    return true;
  }

  // Start betting round after a card is kept into the community spaces
  startCardBettingRound() {
    // If either player has 0 chips left (All-In), betting is completed
    if (this.players[0].isAllIn || this.players[1].isAllIn || this.players[0].chips === 0 || this.players[1].chips === 0) {
      if (this.communityCards.length >= 5) {
        this.resolveShowdown();
      } else {
        this.phase = GAME_PHASES.DRAFTING;
        this.activeDraftPlayer = 1 - this.activeDraftPlayer;
        this.drawNextDraftCard();
      }
      return;
    }

    this.phase = GAME_PHASES.CARD_BETTING;
    this.resetRoundBets();

    // Non-dealer acts first in post-deal betting rounds
    this.activeTurnPlayer = 1 - this.dealerIndex;

    this.onEvent({ 
      type: 'CARD_BETTING_STARTED', 
      communityCount: this.communityCards.length,
      activeTurnPlayer: this.activeTurnPlayer 
    });
  }

  // End hand due to fold
  endHandFold(winnerId) {
    this.phase = GAME_PHASES.ROUND_OVER;
    const winner = this.players[winnerId];
    const loser = this.players[1 - winnerId];
    
    // Check if duel is over (someone reached $0)
    if (this.players[0].chips <= 0 || this.players[1].chips <= 0) {
      this.phase = GAME_PHASES.GAME_OVER;
      this.gameWinner = this.players[0].chips > 0 ? this.players[0] : this.players[1];
      this.winReason = `👑 ${this.gameWinner.name.toUpperCase()} WON THE DUEL! All $${this.initialChips * 2} in chips collected!`;
      this.onEvent({
        type: 'DUEL_GAME_OVER',
        winner: this.gameWinner,
        reason: this.winReason,
        rounds: this.roundNumber
      });
    }

    this.notifyState();
  }

  // Resolve Showdown when all 5 cards are dealt and final betting is done
  resolveShowdown() {
    this.phase = GAME_PHASES.SHOWDOWN;
    this.updateEvaluations();

    const p0Eval = this.players[0].handEval;
    const p1Eval = this.players[1].handEval;

    const cmp = PokerEvaluator.compare(p0Eval, p1Eval);

    if (cmp > 0) {
      // Player 0 Wins
      this.players[0].chips += this.pot;
      this.roundWinner = this.players[0];
      this.potWonAmount = this.pot;
      this.winReason = `${this.players[0].name} wins $${this.pot} with ${p0Eval.name}!`;
    } else if (cmp < 0) {
      // Player 1 Wins
      this.players[1].chips += this.pot;
      this.roundWinner = this.players[1];
      this.potWonAmount = this.pot;
      this.winReason = `${this.players[1].name} wins $${this.pot} with ${p1Eval.name}!`;
    } else {
      // Split Pot
      const split = Math.floor(this.pot / 2);
      this.players[0].chips += split;
      this.players[1].chips += (this.pot - split);
      this.roundWinner = 'SPLIT';
      this.potWonAmount = split;
      this.winReason = `Split pot! Both have ${p0Eval.name}! ($${split} each)`;
    }

    this.onEvent({
      type: 'SHOWDOWN_RESULT',
      winner: this.roundWinner,
      reason: this.winReason,
      pot: this.pot,
      eval0: p0Eval,
      eval1: p1Eval
    });

    this.phase = GAME_PHASES.ROUND_OVER;

    // Check if duel is over (someone reached $0)
    if (this.players[0].chips <= 0 || this.players[1].chips <= 0) {
      this.phase = GAME_PHASES.GAME_OVER;
      this.gameWinner = this.players[0].chips > 0 ? this.players[0] : this.players[1];
      this.winReason = `👑 ${this.gameWinner.name.toUpperCase()} WON THE DUEL! All $${this.initialChips * 2} in chips collected!`;
      this.onEvent({
        type: 'DUEL_GAME_OVER',
        winner: this.gameWinner,
        reason: this.winReason,
        rounds: this.roundNumber
      });
    }

    this.notifyState();
  }

  // Reset chips and start a brand new duel (Rematch)
  startNewDuel() {
    this.players[0].chips = this.initialChips;
    this.players[1].chips = this.initialChips;
    this.roundNumber = 0;
    this.blindLevelIndex = 0;
    this.gameWinner = null;
    this.startNewRound();
  }

  notifyState() {
    this.onStateChange(this.getStateSnapshot());
  }

  getStateSnapshot() {
    return {
      phase: this.phase,
      roundNumber: this.roundNumber,
      blindLevel: this.currentBlindLevel,
      dealerIndex: this.dealerIndex,
      activeTurnPlayer: this.activeTurnPlayer,
      activeDraftPlayer: this.activeDraftPlayer,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      communityCards: this.communityCards,
      currentDrawnCard: this.currentDrawnCard,
      lastAction: this.lastAction,
      roundWinner: this.roundWinner,
      gameWinner: this.gameWinner,
      potWonAmount: this.potWonAmount,
      winReason: this.winReason,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        holeCards: p.holeCards,
        currentRoundBet: p.currentRoundBet,
        totalHandBet: p.totalHandBet,
        folded: p.folded,
        isAllIn: p.isAllIn,
        handEval: p.handEval
      }))
    };
  }

  // Sanitized snapshot for network privacy
  getSanitizedStateForPlayer(playerId) {
    const raw = this.getStateSnapshot();
    const isShowdown = raw.phase === GAME_PHASES.SHOWDOWN || raw.phase === GAME_PHASES.ROUND_OVER;

    const sanitizedPlayers = raw.players.map((p, idx) => {
      if (idx === playerId || isShowdown) {
        return p;
      }
      return {
        ...p,
        holeCards: p.holeCards.map(() => null),
        handEval: null
      };
    });

    let sanitizedDrawnCard = raw.currentDrawnCard;
    if (raw.phase === GAME_PHASES.DRAFTING && raw.activeDraftPlayer !== playerId) {
      sanitizedDrawnCard = raw.currentDrawnCard ? { faceDown: true, rank: '?', suit: '?' } : null;
    }

    return {
      ...raw,
      players: sanitizedPlayers,
      currentDrawnCard: sanitizedDrawnCard
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { GameEngine, GAME_PHASES, BLIND_LEVELS };
}
