// js/game-engine.js - Core Poker State Machine with 2 to 4 Player Ring Table Support

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
    this.numPlayers = options.numPlayers || 2; // 2, 3, or 4

    this.resetGame();
  }

  setPlayerCount(count, playerConfigs = null) {
    this.numPlayers = Math.max(2, Math.min(4, count));
    this.customPlayerConfigs = playerConfigs;
    this.resetGame();
  }

  resetGame() {
    this.roundNumber = 0;
    this.blindLevelIndex = 0;
    this.dealerIndex = 0;
    this.activeTurnPlayer = 0;
    this.activeDraftPlayer = 0;
    this.phase = GAME_PHASES.LOBBY;

    const defaultNames = ['You', 'DadBot', 'MomBot', 'BroBot'];
    const defaultAvatars = ['🤠', '🤖', '👩‍💼', '😎'];

    this.players = [];
    for (let i = 0; i < this.numPlayers; i++) {
      const config = (this.customPlayerConfigs && this.customPlayerConfigs[i]) || {};
      this.players.push({
        id: i,
        name: config.name || defaultNames[i] || `Player ${i + 1}`,
        avatar: config.avatar || defaultAvatars[i] || '👤',
        isAi: config.isAi !== undefined ? config.isAi : (i > 0),
        chips: config.chips || this.initialChips,
        holeCards: [],
        currentRoundBet: 0,
        totalHandBet: 0,
        folded: false,
        isAllIn: false,
        handEval: null
      });
    }

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

  configureMultiplayerPlayers(roster = []) {
    const defaultMultiplayerNames = ['Player 1 (Host)', 'Player 2', 'Player 3', 'Player 4'];
    const defaultMultiplayerAvatars = ['🤠', '👩‍💼', '🧑‍💻', '😎'];

    const activePlayers = (roster || []).filter(r => r.role === 'player' && r.seatIndex !== null);
    const targetCount = Math.max(2, Math.min(4, activePlayers.length || this.numPlayers));
    if (this.numPlayers !== targetCount) {
      this.setPlayerCount(targetCount);
    }

    this.players.forEach((p, idx) => {
      const match = activePlayers.find(r => r.seatIndex === idx);
      if (match) {
        p.name = match.name || defaultMultiplayerNames[idx];
        p.avatar = defaultMultiplayerAvatars[idx];
        p.isAi = false;
      } else {
        if (!p.isAi) {
          p.name = defaultMultiplayerNames[idx];
          p.avatar = defaultMultiplayerAvatars[idx];
        }
      }
    });
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

  getActivePlayers() {
    return this.players.filter(p => !p.folded && p.chips + p.currentRoundBet > 0);
  }

  getNonFoldedPlayers() {
    return this.players.filter(p => !p.folded);
  }

  getNextActiveSeat(fromSeat) {
    const total = this.players.length;
    for (let offset = 1; offset < total; offset++) {
      const idx = (fromSeat + offset) % total;
      const p = this.players[idx];
      if (!p.folded && !p.isAllIn && p.chips > 0) {
        return idx;
      }
    }
    return fromSeat;
  }

  startNewRound() {
    // Only allow starting a new round if previous hand has finished, or if starting game (roundNumber 0)
    if (this.phase !== GAME_PHASES.ROUND_OVER && this.roundNumber > 0) {
      console.warn(`[GameEngine] startNewRound ignored: current phase is '${this.phase}', expected 'ROUND_OVER'`);
      return;
    }

    // Filter players with chips
    const playersWithChips = this.players.filter(p => p.chips > 0);
    if (playersWithChips.length <= 1) {
      this.phase = GAME_PHASES.GAME_OVER;
      this.gameWinner = playersWithChips[0] || this.players[0];
      this.notifyState();
      return;
    }

    this.roundNumber++;
    this.blindLevelIndex = Math.floor((this.roundNumber - 1) / this.blindRoundsInterval);

    // Rotate dealer button
    if (this.roundNumber > 1) {
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    }

    // Determine SB and BB positions
    let sbIdx, bbIdx;
    if (this.players.length === 2) {
      sbIdx = this.dealerIndex;
      bbIdx = 1 - this.dealerIndex;
    } else {
      sbIdx = (this.dealerIndex + 1) % this.players.length;
      bbIdx = (this.dealerIndex + 2) % this.players.length;
    }

    const sbPlayer = this.players[sbIdx];
    const bbPlayer = this.players[bbIdx];

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
      p.folded = (p.chips <= 0);
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
    this.currentBet = Math.max(sbAmount, bbAmount);
    this.minRaise = this.currentBigBlind;

    // Deal 3 Hole Cards to each active player
    for (let c = 0; c < 3; c++) {
      for (const p of this.players) {
        if (!p.folded) {
          p.holeCards.push(this.deck.draw());
        }
      }
    }

    // Evaluate initial hands
    this.evaluateAllHands();

    this.phase = GAME_PHASES.PRE_DRAFT_BETTING;

    // First to act in pre-draft
    if (this.players.length === 2) {
      this.activeTurnPlayer = sbIdx;
    } else {
      this.activeTurnPlayer = (bbIdx + 1) % this.players.length;
    }

    this.activeDraftPlayer = this.dealerIndex;

    this.onEvent({
      type: 'ROUND_STARTED',
      roundNumber: this.roundNumber,
      dealerIndex: this.dealerIndex,
      smallBlind: this.currentSmallBlind,
      bigBlind: this.currentBigBlind
    });

    this.notifyState();
  }

  evaluateAllHands() {
    for (const p of this.players) {
      if (!p.folded && p.holeCards.length > 0) {
        const allCards = [...p.holeCards, ...this.communityCards].filter(c => c && typeof c.value === 'number');
        p.handEval = PokerEvaluator.evaluateBestHand(allCards);
      }
    }
  }

  handleBetAction(playerId, action, amount = 0) {
    if (this.phase !== GAME_PHASES.PRE_DRAFT_BETTING && this.phase !== GAME_PHASES.CARD_BETTING) {
      return false;
    }

    if (playerId !== this.activeTurnPlayer) {
      return false;
    }

    const player = this.players[playerId];
    if (player.folded || player.isAllIn) {
      return false;
    }

    const callDifference = this.currentBet - player.currentRoundBet;

    switch (action) {
      case 'fold': {
        player.folded = true;
        this.lastAction = { playerId, action: 'fold', amount: 0, text: `${player.name} folded.` };
        this.onEvent({ type: 'PLAYER_FOLDED', playerId });

        const nonFolded = this.getNonFoldedPlayers();
        if (nonFolded.length === 1) {
          this.awardPotUncontested(nonFolded[0]);
          return true;
        }
        break;
      }

      case 'check': {
        if (callDifference > 0) return false;
        this.lastAction = { playerId, action: 'check', amount: 0, text: `${player.name} checked.` };
        this.onEvent({ type: 'PLAYER_CHECKED', playerId });
        break;
      }

      case 'call': {
        const chipsToPay = Math.min(player.chips, callDifference);
        player.chips -= chipsToPay;
        player.currentRoundBet += chipsToPay;
        player.totalHandBet += chipsToPay;
        this.pot += chipsToPay;
        if (player.chips === 0) player.isAllIn = true;

        this.lastAction = { playerId, action: 'call', amount: chipsToPay, text: `${player.name} called $${chipsToPay}.` };
        this.onEvent({ type: 'PLAYER_CALLED', playerId, amount: chipsToPay });
        break;
      }

      case 'bet':
      case 'raise': {
        const totalTargetBet = Math.max(amount, this.currentBet + this.currentBigBlind);
        const addedChips = totalTargetBet - player.currentRoundBet;
        const actualAdd = Math.min(player.chips, addedChips);

        player.chips -= actualAdd;
        player.currentRoundBet += actualAdd;
        player.totalHandBet += actualAdd;
        this.pot += actualAdd;
        if (player.chips === 0) player.isAllIn = true;

        const raiseIncrement = player.currentRoundBet - this.currentBet;
        if (raiseIncrement > 0) {
          this.minRaise = Math.max(this.currentBigBlind, raiseIncrement);
          this.currentBet = player.currentRoundBet;
          this.betActedSet.clear(); // Reset others' action status
        }

        const actionName = (action === 'bet' && callDifference === 0) ? 'bet' : 'raised';
        const displayAmount = (action === 'bet' && callDifference === 0) ? player.currentRoundBet : raiseIncrement;
        this.lastAction = { playerId, action, amount: player.currentRoundBet, text: `${player.name} ${actionName} $${displayAmount}.` };
        this.onEvent({ type: 'PLAYER_RAISED', playerId, amount: player.currentRoundBet });
        break;
      }

      case 'allin': {
        const allInAmount = player.chips;
        player.chips = 0;
        player.currentRoundBet += allInAmount;
        player.totalHandBet += allInAmount;
        this.pot += allInAmount;
        player.isAllIn = true;

        if (player.currentRoundBet > this.currentBet) {
          this.currentBet = player.currentRoundBet;
          this.betActedSet.clear();
        }

        this.lastAction = { playerId, action: 'allin', amount: player.currentRoundBet, text: `${player.name} went ALL-IN with $${player.currentRoundBet}!` };
        this.onEvent({ type: 'PLAYER_ALL_IN', playerId, amount: player.currentRoundBet });
        break;
      }

      default:
        return false;
    }

    this.betActedSet.add(playerId);
    this.advanceBettingRound();
    this.notifyState();
    return true;
  }

  advanceBettingRound() {
    const activePlayers = this.getActivePlayers();
    const nonFolded = this.getNonFoldedPlayers();

    if (nonFolded.length <= 1) return;

    // Check if betting round is complete
    const allActed = activePlayers.every(p => this.betActedSet.has(p.id) && p.currentRoundBet === this.currentBet);
    const onlyOneCanAct = activePlayers.filter(p => !p.isAllIn).length <= 1;

    if (allActed || (onlyOneCanAct && activePlayers.every(p => p.currentRoundBet === this.currentBet || p.isAllIn))) {
      // Betting round concluded!
      this.resetRoundBets();

      if (this.phase === GAME_PHASES.PRE_DRAFT_BETTING) {
        this.phase = GAME_PHASES.DRAFTING;
        this.activeDraftPlayer = this.dealerIndex;
        this.drawDraftCard();
      } else if (this.phase === GAME_PHASES.CARD_BETTING) {
        if (this.communityCards.length < 5) {
          this.phase = GAME_PHASES.DRAFTING;
          this.activeDraftPlayer = (this.activeDraftPlayer + 1) % this.players.length;
          this.drawDraftCard();
        } else {
          this.phase = GAME_PHASES.SHOWDOWN;
          this.resolveShowdown();
        }
      }
    } else {
      // Move to next active player
      this.activeTurnPlayer = this.getNextActiveSeat(this.activeTurnPlayer);
    }
  }

  resetRoundBets() {
    for (const p of this.players) {
      p.currentRoundBet = 0;
    }
    this.currentBet = 0;
    this.minRaise = this.currentBigBlind;
    this.betActedSet.clear();
  }

  drawDraftCard() {
    if (this.communityCards.length >= 5) {
      this.phase = GAME_PHASES.SHOWDOWN;
      this.resolveShowdown();
      this.notifyState();
      return;
    }

    const nextCard = this.deck.draw();
    if (!nextCard) {
      this.phase = GAME_PHASES.SHOWDOWN;
      this.resolveShowdown();
      this.notifyState();
      return;
    }

    this.currentDrawnCard = nextCard;
    this.onEvent({
      type: 'DRAFT_CARD_DRAWN',
      card: nextCard,
      activeDraftPlayer: this.activeDraftPlayer,
      slotIndex: this.communityCards.length
    });
    this.notifyState();
  }

  handleDraftDecision(playerId, decision) {
    if (this.phase !== GAME_PHASES.DRAFTING) return false;
    if (playerId !== this.activeDraftPlayer) return false;
    if (!this.currentDrawnCard) return false;

    const player = this.players[playerId];
    const card = this.currentDrawnCard;

    if (decision === 'keep') {
      this.communityCards.push(card);
      this.currentDrawnCard = null;
      this.evaluateAllHands();

      this.lastAction = {
        playerId,
        action: 'draft_keep',
        card,
        text: `${player.name} KEPT ${card.label}${card.suit} on the Board!`
      };

      this.onEvent({
        type: 'DRAFT_CARD_KEPT',
        playerId,
        card,
        slotIndex: this.communityCards.length - 1,
        boardLength: this.communityCards.length
      });

      // After card is kept, trigger a CARD_BETTING round
      this.phase = GAME_PHASES.CARD_BETTING;
      this.resetRoundBets();
      this.activeTurnPlayer = playerId; // Drafting player who kept card acts first
      this.notifyState();
      return true;
    } else {
      // Discarded
      this.discardPile.push(card);
      this.currentDrawnCard = null;

      this.lastAction = {
        playerId,
        action: 'draft_discard',
        card,
        text: `${player.name} DISCARDED ${card.label}${card.suit}.`
      };

      this.onEvent({
        type: 'DRAFT_CARD_DISCARDED',
        playerId,
        card
      });

      // Pass draft turn to next active player
      this.activeDraftPlayer = (this.activeDraftPlayer + 1) % this.players.length;
      this.drawDraftCard();
      return true;
    }
  }

  awardPotUncontested(winner) {
    this.phase = GAME_PHASES.ROUND_OVER;
    this.roundWinner = winner;
    this.potWonAmount = this.pot;
    winner.chips += this.pot;
    this.winReason = 'All other players folded';

    this.onEvent({
      type: 'ROUND_WON_UNCONTESTED',
      winnerId: winner.id,
      winnerName: winner.name,
      amount: this.potWonAmount
    });
    this.notifyState();
  }

  resolveShowdown() {
    this.phase = GAME_PHASES.SHOWDOWN;
    this.evaluateAllHands();

    const contenders = this.getNonFoldedPlayers();
    if (contenders.length === 0) return;

    // Find best hand score
    let bestScore = -1;
    let winners = [];

    for (const c of contenders) {
      const score = c.handEval ? c.handEval.score : 0;
      if (score > bestScore) {
        bestScore = score;
        winners = [c];
      } else if (score === bestScore) {
        winners.push(c);
      }
    }

    const splitAmount = Math.floor(this.pot / winners.length);
    for (const w of winners) {
      w.chips += splitAmount;
    }

    this.roundWinner = winners[0];
    this.potWonAmount = this.pot;
    this.winReason = winners.length > 1
      ? `Split Pot! ${winners.map(w => w.name).join(' & ')} with ${winners[0].handEval.rankName}`
      : `${winners[0].name} wins with ${winners[0].handEval.rankName}`;

    this.phase = GAME_PHASES.ROUND_OVER;

    this.onEvent({
      type: 'SHOWDOWN_COMPLETED',
      winners: winners.map(w => ({ id: w.id, name: w.name, eval: w.handEval })),
      pot: this.potWonAmount,
      winReason: this.winReason
    });

    this.notifyState();
  }

  getStateSnapshot() {
    return {
      roundNumber: this.roundNumber,
      blindLevelIndex: this.blindLevelIndex,
      smallBlind: this.currentSmallBlind,
      bigBlind: this.currentBigBlind,
      dealerIndex: this.dealerIndex,
      activeTurnPlayer: this.activeTurnPlayer,
      activeDraftPlayer: this.activeDraftPlayer,
      phase: this.phase,
      pot: this.pot,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      communityCards: this.communityCards,
      currentDrawnCard: this.currentDrawnCard,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isAi: p.isAi,
        chips: p.chips,
        holeCards: p.holeCards,
        currentRoundBet: p.currentRoundBet,
        totalHandBet: p.totalHandBet,
        folded: p.folded,
        isAllIn: p.isAllIn,
        handEval: p.handEval
      })),
      roundWinner: this.roundWinner ? { id: this.roundWinner.id, name: this.roundWinner.name } : null,
      potWonAmount: this.potWonAmount,
      winReason: this.winReason,
      lastAction: this.lastAction
    };
  }

  restoreStateSnapshot(snapshot) {
    if (!snapshot) return;
    this.roundNumber = snapshot.roundNumber || 0;
    this.blindLevelIndex = snapshot.blindLevelIndex || 0;
    this.dealerIndex = snapshot.dealerIndex || 0;
    this.activeTurnPlayer = snapshot.activeTurnPlayer !== undefined ? snapshot.activeTurnPlayer : 0;
    this.activeDraftPlayer = snapshot.activeDraftPlayer !== undefined ? snapshot.activeDraftPlayer : 0;
    this.phase = snapshot.phase || GAME_PHASES.LOBBY;
    this.pot = snapshot.pot || 0;
    this.currentBet = snapshot.currentBet || 0;
    this.minRaise = snapshot.minRaise || 0;
    this.communityCards = snapshot.communityCards || [];
    this.currentDrawnCard = snapshot.currentDrawnCard || null;
    this.potWonAmount = snapshot.potWonAmount || 0;
    this.winReason = snapshot.winReason || '';
    this.lastAction = snapshot.lastAction || null;
    this.roundWinner = snapshot.roundWinner || null;

    if (Array.isArray(snapshot.players)) {
      this.numPlayers = snapshot.players.length;
      this.players = snapshot.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isAi: !!p.isAi,
        chips: p.chips,
        holeCards: p.holeCards || [],
        currentRoundBet: p.currentRoundBet || 0,
        totalHandBet: p.totalHandBet || 0,
        folded: !!p.folded,
        isAllIn: !!p.isAllIn,
        handEval: p.handEval || null
      }));
    }
  }

  notifyState() {
    this.onStateChange(this.getStateSnapshot());
  }
}

if (typeof module !== 'undefined') {
  module.exports = { GameEngine, GAME_PHASES, BLIND_LEVELS };
}
