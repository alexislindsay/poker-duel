// js/games/crazy-eights-engine.js - 2 to 4 Player Crazy Eights Engine with Food Suits & Wild 8s

const CRAZY_EIGHTS_PHASES = {
  NOT_STARTED: 'NOT_STARTED',
  PLAY: 'PLAY',
  CHOOSE_SUIT: 'CHOOSE_SUIT',
  GAME_OVER: 'GAME_OVER'
};

class CrazyEightsEngine {
  constructor(options = {}) {
    this.onStateChange = options.onStateChange || (() => {});
    this.onEvent = options.onEvent || (() => {});
    this.numPlayers = options.numPlayers || 2;
    this.customPlayerConfigs = options.playersConfig || null;

    this.initPlayers();
    this.deck = new Deck();
    this.discardPile = [];
    this.phase = CRAZY_EIGHTS_PHASES.NOT_STARTED;
    this.activePlayerId = 0;
    this.declaredSuit = null;
    this.winner = null;
    this.lastAction = null;
  }

  setPlayerCount(count, playerConfigs = null) {
    this.numPlayers = Math.max(2, Math.min(4, count));
    this.customPlayerConfigs = playerConfigs;
    this.initPlayers();
    this.startNewGame();
  }

  initPlayers() {
    const defaultNames = ['You', 'Dad', 'Mom', 'Bro'];
    const defaultAvatars = ['🤠', '🤖', '👩‍💼', '😎'];

    this.players = [];
    for (let i = 0; i < this.numPlayers; i++) {
      const cfg = (this.customPlayerConfigs && this.customPlayerConfigs[i]) || {};
      this.players.push({
        id: i,
        name: cfg.name || defaultNames[i] || `Player ${i + 1}`,
        avatar: cfg.avatar || defaultAvatars[i] || '👤',
        isAi: cfg.isAi !== undefined ? cfg.isAi : (i > 0),
        hand: []
      });
    }
  }

  configureMultiplayerPlayers(roster = []) {
    const defaultMultiplayerNames = ['Player 1 (Host)', 'Player 2', 'Player 3', 'Player 4'];
    const defaultMultiplayerAvatars = ['🤠', '👩‍💼', '🧑‍💻', '😎'];

    const activePlayers = (roster || []).filter(r => r.role === 'player' && r.seatIndex !== null);
    if (activePlayers.length > this.numPlayers) {
      this.setPlayerCount(activePlayers.length);
    }

    this.players.forEach((p, idx) => {
      const match = activePlayers.find(r => r.seatIndex === idx);
      if (match) {
        p.name = match.name || defaultMultiplayerNames[idx];
        p.avatar = defaultMultiplayerAvatars[idx];
        p.isAi = false;
      }
    });
  }

  startNewGame() {
    this.deck.reset();
    this.discardPile = [];
    this.phase = CRAZY_EIGHTS_PHASES.PLAY;
    this.activePlayerId = 0;
    this.declaredSuit = null;
    this.winner = null;

    for (const p of this.players) {
      p.hand = [];
    }

    // Deal 7 cards each for 2 players, or 5 cards each for 3-4 players
    const cardsPerPlayer = this.numPlayers === 2 ? 7 : 5;
    for (let i = 0; i < cardsPerPlayer; i++) {
      for (const p of this.players) {
        p.hand.push(this.deck.draw());
      }
    }

    // Flip starter card (cannot be an 8 for fair opening)
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

  startNextRound() {
    this.startNewGame();
  }

  getTopCard() {
    return this.discardPile[this.discardPile.length - 1] || null;
  }

  isValidPlay(card, topCard = null, activeSuit = null) {
    if (!card) return false;
    if (card.rank === '8') return true; // 8s are always wild

    const top = topCard || this.getTopCard();
    if (!top) return true;

    const targetSuit = activeSuit || this.declaredSuit || top.suit;
    return (card.suit === targetSuit) || (card.rank === top.rank);
  }

  playCard(playerId, cardId, declaredWildSuit = null) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.PLAY) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return false;

    const card = player.hand[cardIdx];
    if (!this.isValidPlay(card)) return false;

    // Remove from hand and push onto discard pile
    player.hand.splice(cardIdx, 1);
    this.discardPile.push(card);

    if (card.rank === '8') {
      if (declaredWildSuit) {
        this.declaredSuit = declaredWildSuit;
        const food = (typeof SUIT_FOOD_MAP !== 'undefined' && SUIT_FOOD_MAP[declaredWildSuit]) || { emoji: declaredWildSuit, name: declaredWildSuit };
        this.lastAction = {
          playerId,
          card,
          text: `${player.name} played a Wild 8 and declared ${food.name} (${declaredWildSuit})!`
        };
        this.onEvent({ type: 'CRAZY_EIGHTS_CARD_PLAYED', playerId, card, declaredSuit: declaredWildSuit });

        // Check if hand is empty
        if (player.hand.length === 0) {
          this.endGame(player);
          return true;
        }

        // Pass turn
        this.advanceTurn();
        return true;
      } else {
        // Need to ask player to choose suit
        this.phase = CRAZY_EIGHTS_PHASES.CHOOSE_SUIT;
        this.onEvent({ type: 'CRAZY_EIGHTS_CHOOSE_SUIT', playerId });
        this.notifyState();
        return true;
      }
    }

    // Normal non-8 card
    this.declaredSuit = card.suit;
    this.lastAction = {
      playerId,
      card,
      text: `${player.name} played ${card.label} of ${card.suit}.`
    };

    this.onEvent({ type: 'CRAZY_EIGHTS_CARD_PLAYED', playerId, card });

    // Check win
    if (player.hand.length === 0) {
      this.endGame(player);
      return true;
    }

    this.advanceTurn();
    return true;
  }

  setWildSuit(playerId, suit) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.CHOOSE_SUIT) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    this.declaredSuit = suit;
    this.phase = CRAZY_EIGHTS_PHASES.PLAY;

    const food = (typeof SUIT_FOOD_MAP !== 'undefined' && SUIT_FOOD_MAP[suit]) || { emoji: suit, name: suit };
    this.lastAction = {
      playerId,
      text: `${player.name} declared suit ${food.name} (${suit})!`
    };

    this.onEvent({ type: 'CRAZY_EIGHTS_SUIT_DECLARED', playerId, suit });

    if (player.hand.length === 0) {
      this.endGame(player);
      return true;
    }

    this.advanceTurn();
    return true;
  }

  drawCard(playerId) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.PLAY) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];

    // If deck is empty, reshuffle discard pile (except top card)
    if (this.deck.remaining() === 0) {
      if (this.discardPile.length <= 1) {
        // No cards left to draw, skip turn
        this.lastAction = { playerId, text: `Stockpile is empty! ${player.name} passes.` };
        this.advanceTurn();
        return false;
      }

      const top = this.discardPile.pop();
      this.deck.cards = [...this.discardPile];
      this.deck.shuffle();
      this.discardPile = [top];
      this.onEvent({ type: 'CRAZY_EIGHTS_DECK_RESHUFFLED' });
    }

    const card = this.deck.draw();
    if (!card) {
      this.advanceTurn();
      return false;
    }

    player.hand.push(card);
    this.lastAction = { playerId, card, text: `${player.name} drew a card from the stockpile.` };
    this.onEvent({ type: 'CRAZY_EIGHTS_CARD_DRAWN', playerId, card });

    // Check if the drawn card can be played immediately
    if (this.isValidPlay(card)) {
      this.notifyState();
      return true;
    }

    // If not playable, pass turn
    this.advanceTurn();
    return true;
  }

  advanceTurn() {
    this.activePlayerId = (this.activePlayerId + 1) % this.players.length;
    this.notifyState();
  }

  endGame(winner) {
    this.phase = CRAZY_EIGHTS_PHASES.GAME_OVER;
    this.winner = winner;
    this.lastAction = { text: `👑 ${winner.name} emptied their hand and WON the game!` };
    this.onEvent({ type: 'CRAZY_EIGHTS_WON', winnerId: winner.id, winnerName: winner.name });
    this.notifyState();
  }

  getStateSnapshot() {
    return {
      phase: this.phase,
      activePlayerId: this.activePlayerId,
      declaredSuit: this.declaredSuit,
      topCard: this.getTopCard(),
      deckCount: this.deck.remaining(),
      discardCount: this.discardPile.length,
      winner: this.winner ? { id: this.winner.id, name: this.winner.name } : null,
      lastAction: this.lastAction,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isAi: p.isAi,
        cardCount: p.hand.length,
        hand: p.hand
      }))
    };
  }

  restoreStateSnapshot(snapshot) {
    if (!snapshot) return;
    this.phase = snapshot.phase || CRAZY_EIGHTS_PHASES.NOT_STARTED;
    this.activePlayerId = snapshot.activePlayerId !== undefined ? snapshot.activePlayerId : 0;
    this.declaredSuit = snapshot.declaredSuit || null;
    this.winner = snapshot.winner || null;
    this.lastAction = snapshot.lastAction || null;

    if (Array.isArray(snapshot.players)) {
      this.numPlayers = snapshot.players.length;
      this.players = snapshot.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isAi: !!p.isAi,
        hand: p.hand || []
      }));
    }
  }

  notifyState() {
    this.onStateChange(this.getStateSnapshot());
  }
}

if (typeof module !== 'undefined') {
  module.exports = { CrazyEightsEngine, CRAZY_EIGHTS_PHASES };
}
