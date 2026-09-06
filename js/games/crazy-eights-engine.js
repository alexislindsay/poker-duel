// js/games/crazy-eights-engine.js - 2-Player Crazy Eights Engine with Food Suits & Wild 8s

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

    this.players = [
      { id: 0, name: 'You', hand: [] },
      { id: 1, name: 'Dad', hand: [] }
    ];

    this.deck = new Deck();
    this.discardPile = [];
    this.phase = CRAZY_EIGHTS_PHASES.NOT_STARTED;
    this.activePlayerId = 0;
    this.declaredSuit = null;
    this.winner = null;
    this.lastAction = null;
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

    // Deal 7 cards each
    for (let i = 0; i < 7; i++) {
      this.players[0].hand.push(this.deck.draw());
      this.players[1].hand.push(this.deck.draw());
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
    if (card.rank === '8') return true; // 8s are ALWAYS wild!

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
        const food = SUIT_FOOD_MAP[declaredWildSuit] || { emoji: declaredWildSuit, name: declaredWildSuit };
        this.lastAction = {
          playerId,
          action: 'play_wild_8',
          card,
          text: `★ ${player.name} played a WILD 8 and changed suit to ${food.emoji} ${food.name}!`
        };
        this.onEvent({ type: 'SUIT_CHANGED', suit: declaredWildSuit, player: player.name });

        if (player.hand.length === 0) {
          this.finishGame(player);
          return true;
        }

        // Pass turn
        this.activePlayerId = 1 - this.activePlayerId;
        this.notifyState();
        return true;
      } else {
        // Need to choose suit via modal
        this.phase = CRAZY_EIGHTS_PHASES.CHOOSE_SUIT;
        this.lastAction = {
          playerId,
          action: 'play_wild_8',
          card,
          text: `★ ${player.name} played a WILD 8! Choosing new suit...`
        };
        this.onEvent({ type: 'WILD_8_PLAYED', playerId, card });
        this.notifyState();
        return true;
      }
    } else {
      this.declaredSuit = card.suit;
      this.lastAction = {
        playerId,
        action: 'play_card',
        card,
        text: `${player.name} played ${card.label}${card.suit}`
      };
      this.onEvent({ type: 'CARD_PLAYED', playerId, card });

      if (player.hand.length === 0) {
        this.finishGame(player);
        return true;
      }

      // Pass turn to opponent
      this.activePlayerId = 1 - this.activePlayerId;
      this.notifyState();
      return true;
    }
  }

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

    this.onEvent({ type: 'SUIT_CHANGED', playerId, suit, foodName: food.name });

    if (player.hand.length === 0) {
      this.finishGame(player);
      return true;
    }

    // Resume play and pass turn
    this.phase = CRAZY_EIGHTS_PHASES.PLAY;
    this.activePlayerId = 1 - this.activePlayerId;
    this.notifyState();
    return true;
  }

  drawCard(playerId) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.PLAY) return false;
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
      // Stockpile completely empty and no cards to reshuffle: pass turn
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

  drawFromStock(playerId) {
    return this.drawCard(playerId);
  }

  // AI turn automation for DadBot
  aiPlayTurn(aiPlayerId = 1) {
    if (this.phase !== CRAZY_EIGHTS_PHASES.PLAY) return;
    if (this.activePlayerId !== aiPlayerId) return;

    const player = this.players[aiPlayerId];
    if (!player || !player.hand || player.hand.length === 0) return;

    const top = this.getTopCard();
    const activeSuit = this.declaredSuit || (top ? top.suit : '♠');

    // 1. Find all playable regular cards
    const playableRegular = player.hand.filter(c => c && c.rank !== '8' && this.isValidPlay(c, top, activeSuit));

    if (playableRegular.length > 0) {
      // Play regular matching card (prefer suit with most count in hand)
      const suitCounts = {};
      player.hand.forEach(c => { if (c) suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
      playableRegular.sort((a, b) => (suitCounts[b.suit] || 0) - (suitCounts[a.suit] || 0));
      
      const chosen = playableRegular[0];
      this.playCard(aiPlayerId, chosen.id);
      return;
    }

    // 2. If no regular plays, check if Dad holds a Wild 8
    const wild8 = player.hand.find(c => c && c.rank === '8');
    if (wild8) {
      // Pick suit Dad holds the most of
      const suitCounts = { '♠': 0, '♥': 0, '♦': 0, '♣': 0 };
      player.hand.forEach(c => {
        if (c && c.rank !== '8' && suitCounts[c.suit] !== undefined) {
          suitCounts[c.suit]++;
        }
      });
      let bestSuit = '♠';
      let maxCount = -1;
      for (const s of ['♠', '♥', '♦', '♣']) {
        if (suitCounts[s] > maxCount) {
          maxCount = suitCounts[s];
          bestSuit = s;
        }
      }

      this.playCard(aiPlayerId, wild8.id, bestSuit);
      return;
    }

    // 3. Must draw from stockpile
    this.drawCard(aiPlayerId);

    // If newly drawn card is immediately playable, play it after short delay
    const drawn = player.hand[player.hand.length - 1];
    if (drawn && this.isValidPlay(drawn, top, activeSuit)) {
      setTimeout(() => {
        if (drawn.rank === '8') {
          this.playCard(aiPlayerId, drawn.id, activeSuit);
        } else {
          this.playCard(aiPlayerId, drawn.id);
        }
      }, 500);
    }
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
    const top = this.getTopCard();
    const actSuit = this.declaredSuit || (top ? top.suit : '♠');

    return {
      phase: this.phase,
      activeTurnPlayer: this.activePlayerId,
      activePlayerId: this.activePlayerId,
      topCard: top,
      topDiscard: top,
      currentSuit: actSuit,
      declaredSuit: actSuit,
      stockPile: this.deck.cards,
      stockpileCount: this.deck.remaining(),
      discardPile: this.discardPile,
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
