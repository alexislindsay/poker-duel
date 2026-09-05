// js/games/spades-engine.js - 2-Player Spades Duel with Drafting & Jokers

const SPADES_PHASES = {
  NOT_STARTED: 'NOT_STARTED',
  DRAFTING: 'DRAFTING',          // 13-card 2-player Keep/Discard draft
  BIDDING: 'BIDDING',            // Both players enter trick bids
  TRICK_PLAYING: 'TRICK_PLAYING',// 13 trick rounds
  ROUND_OVER: 'ROUND_OVER',
  GAME_OVER: 'GAME_OVER'
};

class SpadesEngine {
  constructor(options = {}) {
    this.onStateChange = options.onStateChange || (() => {});
    this.onEvent = options.onEvent || (() => {});

    this.players = [
      { id: 0, name: 'Player 1', hand: [], bid: 0, tricksWon: 0, score: 0, bags: 0 },
      { id: 1, name: 'Player 2', hand: [], bid: 0, tricksWon: 0, score: 0, bags: 0 }
    ];

    this.deck = new Deck(true); // Deck with Jokers!
    this.phase = SPADES_PHASES.NOT_STARTED;
    this.activePlayerId = 0;
    this.spadesBroken = false;
    this.currentDraftCard = null;
    this.currentTrick = []; // [{ playerId, card }]
    this.trickLeaderId = 0;
    this.trickNumber = 1;
    this.winner = null;
    this.lastAction = null;
  }

  startNewGame() {
    this.deck.reset();
    this.phase = SPADES_PHASES.DRAFTING;
    this.activePlayerId = 0;
    this.spadesBroken = false;
    this.currentTrick = [];
    this.trickNumber = 1;
    this.winner = null;

    for (const p of this.players) {
      p.hand = [];
      p.bid = null;
      p.tricksWon = 0;
    }

    this.drawNextDraftCard();
    this.lastAction = { text: 'Drafting started! Inspect the card and choose to KEEP or DISCARD.' };
    this.onEvent({ type: 'SPADES_DRAFT_STARTED' });
    this.notifyState();
  }

  drawNextDraftCard() {
    if (this.players[0].hand.length >= 13 && this.players[1].hand.length >= 13) {
      // Draft complete! Proceed to Bidding Phase
      this.sortHands();
      this.phase = SPADES_PHASES.BIDDING;
      this.currentDraftCard = null;
      this.lastAction = { text: 'Drafting complete (13 cards each). Enter your trick bids!' };
      this.onEvent({ type: 'SPADES_BIDDING_STARTED' });
      this.notifyState();
      return;
    }

    const card = this.deck.draw();
    this.currentDraftCard = card;
    this.onEvent({ type: 'SPADES_DRAFT_CARD_DRAWN', card, activePlayerId: this.activePlayerId });
    this.notifyState();
  }

  handleDraftDecision(playerId, decision) {
    if (this.phase !== SPADES_PHASES.DRAFTING) return false;
    if (playerId !== this.activePlayerId) return false;
    if (!this.currentDraftCard) return false;

    const player = this.players[playerId];
    const card = this.currentDraftCard;

    if (decision === 'keep') {
      // Player keeps this card
      player.hand.push(card);
      // Burn the next card face-down
      this.deck.draw();
      this.lastAction = { playerId, action: 'keep', text: `${player.name} kept a card.` };
    } else {
      // Player discards this card, and is forced to take the next mystery card!
      const mystery = this.deck.draw();
      if (mystery) player.hand.push(mystery);
      this.lastAction = { playerId, action: 'discard', text: `${player.name} discarded and took the mystery card.` };
    }

    this.currentDraftCard = null;
    // Alternate turn
    this.activePlayerId = 1 - this.activePlayerId;
    this.drawNextDraftCard();
    return true;
  }

  sortHands() {
    const suitOrder = { '♠': 4, '♥': 3, '♦': 2, '♣': 1, 'BIG': 5, 'LITTLE': 5 };
    for (const p of this.players) {
      p.hand.sort((a, b) => {
        const sA = suitOrder[a.suit] || 0;
        const sB = suitOrder[b.suit] || 0;
        if (sA !== sB) return sB - sA;
        return b.value - a.value;
      });
    }
  }

  // Set trick bid (0 to 13)
  submitBid(playerId, bidAmount) {
    if (this.phase !== SPADES_PHASES.BIDDING) return false;
    const player = this.players[playerId];
    player.bid = Math.max(0, Math.min(13, parseInt(bidAmount, 10)));

    this.onEvent({ type: 'BID_SUBMITTED', playerId, bid: player.bid });

    // When both players have bid, start tricks!
    if (this.players[0].bid !== null && this.players[1].bid !== null) {
      this.phase = SPADES_PHASES.TRICK_PLAYING;
      this.activePlayerId = 0;
      this.trickLeaderId = 0;
      this.trickNumber = 1;
      this.currentTrick = [];
      this.spadesBroken = false;
      this.lastAction = { text: `Bids locked: ${this.players[0].name} (${this.players[0].bid}) vs ${this.players[1].name} (${this.players[1].bid}). Trick 1 starts!` };
      this.onEvent({ type: 'TRICKS_STARTED' });
    }

    this.notifyState();
    return true;
  }

  isSpadeOrTrump(card) {
    return card.suit === '♠' || card.rank === 'JOKER';
  }

  isValidCardPlay(playerId, card) {
    if (this.phase !== SPADES_PHASES.TRICK_PLAYING) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    const isLead = this.currentTrick.length === 0;

    if (isLead) {
      // Leading a card: cannot lead Spades/Trump unless Spades are broken OR player has only Spades
      if (this.isSpadeOrTrump(card) && !this.spadesBroken) {
        const hasNonSpades = player.hand.some(c => !this.isSpadeOrTrump(c));
        if (hasNonSpades) return false; // Must lead non-spade if available
      }
      return true;
    }

    // Following a lead: must follow suit if held
    const leadCard = this.currentTrick[0].card;
    const leadSuit = leadCard.suit;

    if (leadSuit === '♠' || leadCard.rank === 'JOKER') {
      // Lead was a Spade/Trump -> must play Spade/Trump if held
      const hasTrump = player.hand.some(c => this.isSpadeOrTrump(c));
      if (hasTrump && !this.isSpadeOrTrump(card)) return false;
    } else {
      // Lead was a regular suit (♥, ♦, ♣)
      const hasLeadSuit = player.hand.some(c => c.suit === leadSuit && c.rank !== 'JOKER');
      if (hasLeadSuit && card.suit !== leadSuit) return false; // Strict Anti-Reneging Check!
    }

    return true;
  }

  playTrickCard(playerId, cardId) {
    if (this.phase !== SPADES_PHASES.TRICK_PLAYING) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return false;

    const card = player.hand[cardIdx];
    if (!this.isValidCardPlay(playerId, card)) return false;

    // Remove from hand and add to trick
    player.hand.splice(cardIdx, 1);
    this.currentTrick.push({ playerId, card });

    if (this.isSpadeOrTrump(card)) {
      this.spadesBroken = true;
    }

    this.lastAction = { playerId, action: 'play_trick', card, text: `${player.name} played ${card.label} of ${card.suit}` };
    this.onEvent({ type: 'TRICK_CARD_PLAYED', playerId, card });

    if (this.currentTrick.length === 2) {
      // Both players played: resolve trick winner!
      this.resolveTrick();
    } else {
      this.activePlayerId = 1 - this.activePlayerId;
    }

    this.notifyState();
    return true;
  }

  resolveTrick() {
    const [play1, play2] = this.currentTrick;
    const c1 = play1.card;
    const c2 = play2.card;
    let winnerPlayerId = play1.playerId;

    const isTrump1 = this.isSpadeOrTrump(c1);
    const isTrump2 = this.isSpadeOrTrump(c2);

    if (isTrump1 && !isTrump2) {
      winnerPlayerId = play1.playerId;
    } else if (!isTrump1 && isTrump2) {
      winnerPlayerId = play2.playerId;
    } else if (isTrump1 && isTrump2) {
      // Both trumps: compare value (Big Joker > Little Joker > A♠ > K♠ ...)
      winnerPlayerId = (c1.value >= c2.value) ? play1.playerId : play2.playerId;
    } else {
      // Neither trump: if second player followed suit and had higher rank, they win; otherwise leader wins
      if (c2.suit === c1.suit && c2.value > c1.value) {
        winnerPlayerId = play2.playerId;
      } else {
        winnerPlayerId = play1.playerId;
      }
    }

    const winner = this.players[winnerPlayerId];
    winner.tricksWon++;

    this.lastAction = {
      text: `🏆 ${winner.name} won Trick ${this.trickNumber}!`
    };

    this.onEvent({ type: 'TRICK_RESOLVED', winnerId: winnerPlayerId, trickNumber: this.trickNumber });

    setTimeout(() => {
      this.currentTrick = [];
      this.trickNumber++;

      if (this.trickNumber > 13) {
        this.scoreRound();
      } else {
        this.activePlayerId = winnerPlayerId;
        this.trickLeaderId = winnerPlayerId;
        this.notifyState();
      }
    }, 1800);
  }

  scoreRound() {
    this.phase = SPADES_PHASES.GAME_OVER;

    for (const p of this.players) {
      if (p.tricksWon >= p.bid) {
        const base = p.bid * 10;
        const overtricks = p.tricksWon - p.bid;
        p.score += (base + overtricks);
        p.bags += overtricks;
      } else {
        p.score -= (p.bid * 10);
      }
    }

    const p0 = this.players[0];
    const p1 = this.players[1];

    if (p0.score > p1.score) {
      this.winner = p0;
    } else if (p1.score > p0.score) {
      this.winner = p1;
    } else {
      this.winner = null; // Tie
    }

    this.lastAction = {
      text: `👑 SPADES MATCH FINISHED! ${this.winner ? this.winner.name + ' WINS!' : 'IT IS A TIE!'}`
    };

    this.onEvent({ type: 'SPADES_GAME_OVER', winner: this.winner });
    this.notifyState();
  }

  notifyState() {
    this.onStateChange(this.getStateSnapshot());
  }

  getStateSnapshot() {
    return {
      phase: this.phase,
      activePlayerId: this.activePlayerId,
      currentDraftCard: this.currentDraftCard,
      spadesBroken: this.spadesBroken,
      currentTrick: this.currentTrick,
      trickNumber: this.trickNumber,
      winner: this.winner,
      lastAction: this.lastAction,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        hand: p.hand,
        handCount: p.hand.length,
        bid: p.bid,
        tricksWon: p.tricksWon,
        score: p.score,
        bags: p.bags
      }))
    };
  }

  getSanitizedStateForPlayer(playerId) {
    const raw = this.getStateSnapshot();
    const sanitizedPlayers = raw.players.map((p, idx) => {
      if (idx === playerId || raw.phase === SPADES_PHASES.GAME_OVER) {
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
  module.exports = { SpadesEngine, SPADES_PHASES };
}
