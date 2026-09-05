// js/games/crazy-eights-engine.js - 2-Player Crazy Eights Engine with Food Suits & Wild 8s

const CRAZY_EIGHTS_PHASES = {
  NOT_STARTED: 'NOT_STARTED',
  PLAYER_TURN: 'PLAYER_TURN',
  CHOOSE_SUIT: 'CHOOSE_SUIT',    // Player played an 8 and is choosing new suit
  GAME_OVER: 'GAME_OVER'
};

class CrazyEightsEngine {
  constructor(options = {}) {
    this.onStateChange = options.onStateChange || (() => {});
    this.onEvent = options.onEvent || (() => {});

    this.players = [
      { id: 0, name: 'Player 1', hand: [] },
      { id: 1, name: 'Player 2', hand: [] }
    ];

    this.deck = new Deck();
    this.discardPile = [];
    this.phase = CRAZY_EIGHTS_PHASES.NOT_STARTED;
    this.activePlayerId = 0;
    this.declaredSuit = null;     // Current active suit (from an 8)
    this.winner = null;
    this.lastAction = null;
  }

  startNewGame() {
    this.deck.reset();
    this.discardPile = [];
    this.phase = CRAZY_EIGHTS_PHASES.PLAYER_TURN;
    this.activePlayerId = 0;
    this.declaredSuit = null;
    this.winner = null;

    for (const p of this.players) {
      p.hand = [];
    }

    // Deal 7 cards each
    for (let i = 0; i < 7; i++) {
      this.players[0].hand.push(this.deck.draw());
      this.players[1].hand.push(this.deck.draw());
    }

    // Flip starter card (cannot be an 8 for fair start)
    let starter = this.deck.draw();
    while (starter && starter.rank === '8') {
      this.deck.cards.unshift(starter);
      this.deck.shuffle();
      starter = this.deck.draw();
    }
    this.discardPile.push(starter);
    this.declaredSuit = starter.suit;

    this.lastAction = { text: `Game started! Top card is ${starter.label} of ${starter.suit}.` };
    this.onEvent({ type: 'CRAZY_EIGHTS_STARTED', starter });
    this.notifyState();
  }

  getTopCard() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }

  isValidPlay(card) {
    if (!card) return false;
    if (card.rank === '8') return true; // 8s are always wild!
    const top = this.getTopCard();
    if (!top) return true;

    const targetSuit = this.declaredSuit || top.suit;
    return (card.suit === targetSuit) || (card.rank === top.rank);
  }

  playCard(playerId, cardId) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.PLAYER_TURN) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return false;

    const card = player.hand[cardIdx];
    if (!this.isValidPlay(card)) return false;

    // Remove from hand and put on discard pile
    player.hand.splice(cardIdx, 1);
    this.discardPile.push(card);

    if (card.rank === '8') {
      // Wild 8 played!
      this.lastAction = {
        playerId,
        action: 'play_wild_8',
        card,
        text: `★ ${player.name} played a WILD 8! Choosing new suit...`
      };
      this.phase = CRAZY_EIGHTS_PHASES.CHOOSE_SUIT;
      this.onEvent({ type: 'WILD_8_PLAYED', playerId, card });
    } else {
      this.declaredSuit = card.suit;
      this.lastAction = {
        playerId,
        action: 'play_card',
        card,
        text: `${player.name} played ${card.label} of ${card.suit}`
      };
      this.onEvent({ type: 'CARD_PLAYED', playerId, card });

      if (player.hand.length === 0) {
        this.finishGame(player);
        return true;
      }

      // Pass turn to opponent
      this.activePlayerId = 1 - this.activePlayerId;
    }

    this.notifyState();
    return true;
  }

  // Player chooses suit after playing an 8
  chooseWildSuit(playerId, suit) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.CHOOSE_SUIT) return false;
    if (playerId !== this.activePlayerId) return false;

    this.declaredSuit = suit;
    const player = this.players[playerId];
    const food = SUIT_FOOD_MAP[suit] || { name: suit, emoji: suit };

    this.lastAction = {
      playerId,
      action: 'suit_chosen',
      suit,
      text: `${player.name} declared new suit: ${food.emoji} ${food.name}!`
    };

    this.onEvent({ type: 'SUIT_CHOSEN', playerId, suit, foodName: food.name });

    if (player.hand.length === 0) {
      this.finishGame(player);
      return true;
    }

    // Resume turns
    this.phase = CRAZY_EIGHTS_PHASES.PLAYER_TURN;
    this.activePlayerId = 1 - this.activePlayerId;
    this.notifyState();
    return true;
  }

  // Player draws from the Stockpile
  drawCard(playerId) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.PLAYER_TURN) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    let card = this.deck.draw();

    if (!card) {
      // Stockpile empty: reshuffle discards (except top card)
      if (this.discardPile.length > 1) {
        const top = this.discardPile.pop();
        this.deck.cards = [...this.discardPile];
        this.deck.shuffle();
        this.discardPile = [top];
        card = this.deck.draw();
      }
    }

    if (card) {
      player.hand.push(card);
      this.lastAction = {
        playerId,
        action: 'draw',
        text: `${player.name} drew a card from the stockpile.`
      };
      this.onEvent({ type: 'CARD_DRAWN', playerId });
    } else {
      // No cards left to draw, turn passes
      this.lastAction = {
        playerId,
        action: 'pass',
        text: `Stockpile empty! ${player.name} passed.`
      };
      this.activePlayerId = 1 - this.activePlayerId;
    }

    this.notifyState();
    return true;
  }

  finishGame(winnerPlayer) {
    this.phase = CRAZY_EIGHTS_PHASES.GAME_OVER;
    this.winner = winnerPlayer;
    this.lastAction = {
      text: `👑 ${winnerPlayer.name.toUpperCase()} EMPTIED THEIR HAND AND WON CRAZY EIGHTS!`
    };
    this.onEvent({ type: 'CRAZY_EIGHTS_GAME_OVER', winner: winnerPlayer });
    this.notifyState();
  }

  notifyState() {
    this.onStateChange(this.getStateSnapshot());
  }

  getStateSnapshot() {
    return {
      phase: this.phase,
      activePlayerId: this.activePlayerId,
      topCard: this.getTopCard(),
      declaredSuit: this.declaredSuit,
      stockpileCount: this.deck.remaining(),
      lastAction: this.lastAction,
      winner: this.winner,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        hand: p.hand,
        handCount: p.hand.length
      }))
    };
  }

  getSanitizedStateForPlayer(playerId) {
    const raw = this.getStateSnapshot();
    const sanitizedPlayers = raw.players.map((p, idx) => {
      if (idx === playerId || raw.phase === CRAZY_EIGHTS_PHASES.GAME_OVER) {
        return p;
      }
      return {
        ...p,
        hand: p.hand.map(() => null)
      };
    });

    return {
      ...raw,
      players: sanitizedPlayers
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { CrazyEightsEngine, CRAZY_EIGHTS_PHASES };
}
