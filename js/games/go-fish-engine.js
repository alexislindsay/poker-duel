// js/games/go-fish-engine.js - 2-Player Go Fish with Automated "Liar's Trap" Penalty

const GO_FISH_PHASES = {
  NOT_STARTED: 'NOT_STARTED',
  ASKING: 'ASKING',              // Active player choosing rank to ask
  RESPONDING: 'RESPONDING',      // Opponent deciding honest transfer vs claiming Go Fish
  CAUGHT_LYING: 'CAUGHT_LYING',  // Automatic penalty animation sequence
  FISHING: 'FISHING',            // Drawing from Ocean
  GAME_OVER: 'GAME_OVER'
};

class GoFishEngine {
  constructor(options = {}) {
    this.onStateChange = options.onStateChange || (() => {});
    this.onEvent = options.onEvent || (() => {});
    
    this.players = [
      { id: 0, name: 'Player 1', hand: [], books: [], penaltyCount: 0 },
      { id: 1, name: 'Player 2', hand: [], books: [], penaltyCount: 0 }
    ];
    
    this.deck = new Deck();
    this.phase = GO_FISH_PHASES.NOT_STARTED;
    this.activePlayerId = 0;
    this.currentAskRank = null;
    this.lastAction = null;
    this.winner = null;
    this.revealedCards = []; // Cards temporarily revealed due to penalties
  }

  startNewGame() {
    this.deck.reset();
    this.phase = GO_FISH_PHASES.ASKING;
    this.activePlayerId = 0;
    this.currentAskRank = null;
    this.lastAction = { text: 'Game started! 7 cards dealt to each player.' };
    this.winner = null;
    this.revealedCards = [];

    for (const p of this.players) {
      p.hand = [];
      p.books = [];
      p.penaltyCount = 0;
    }

    // Deal 7 cards each
    for (let i = 0; i < 7; i++) {
      this.players[0].hand.push(this.deck.draw());
      this.players[1].hand.push(this.deck.draw());
    }

    this.sortHands();
    this.checkBooks(0);
    this.checkBooks(1);

    this.onEvent({ type: 'GO_FISH_STARTED' });
    this.notifyState();
  }

  sortHands() {
    for (const p of this.players) {
      p.hand.sort((a, b) => a.value - b.value);
    }
  }

  // Active player asks opponent for a rank
  askRank(playerId, rank) {
    if (this.phase !== GO_FISH_PHASES.ASKING) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    const hasRank = player.hand.some(c => c.rank === rank);
    if (!hasRank) return false; // Must hold at least one card of that rank

    this.currentAskRank = rank;
    this.phase = GO_FISH_PHASES.RESPONDING;
    const opponent = this.players[1 - playerId];

    const rankLabel = RANKS.find(r => r.rank === rank)?.label || rank;
    this.lastAction = {
      playerId,
      action: 'ask',
      rank,
      text: `${player.name} asked: "Do you have any ${rankLabel}s?"`
    };

    this.onEvent({ type: 'PLAYER_ASKED_RANK', playerId, rank, rankLabel });
    this.notifyState();
    return true;
  }

  // Opponent responds: 'hand_over' (honest) OR 'go_fish' (claim none)
  respondToAsk(opponentId, responseType) {
    if (this.phase !== GO_FISH_PHASES.RESPONDING) return false;
    if (opponentId !== (1 - this.activePlayerId)) return false;

    const asker = this.players[this.activePlayerId];
    const opponent = this.players[opponentId];
    const targetRank = this.currentAskRank;
    const matchingCards = opponent.hand.filter(c => c.rank === targetRank);
    const hasMatching = matchingCards.length > 0;
    const rankLabel = RANKS.find(r => r.rank === targetRank)?.label || targetRank;

    if (responseType === 'hand_over') {
      // Honest Handover
      if (hasMatching) {
        opponent.hand = opponent.hand.filter(c => c.rank !== targetRank);
        asker.hand.push(...matchingCards);
        this.sortHands();
        const formedBooks = this.checkBooks(this.activePlayerId);

        this.lastAction = {
          action: 'hand_over',
          text: `🤝 ${opponent.name} gave ${matchingCards.length} ${rankLabel}(s) to ${asker.name}!`
        };

        this.onEvent({ type: 'CARDS_TRANSFERRED', count: matchingCards.length, rank: targetRank });

        // Asker gets another turn!
        this.checkEmptyHands();
        this.phase = this.checkGameEnd() ? GO_FISH_PHASES.GAME_OVER : GO_FISH_PHASES.ASKING;
      } else {
        // Opponent clicked hand_over but didn't actually have it -> Go Fish
        return this.respondToAsk(opponentId, 'go_fish');
      }
    } else if (responseType === 'go_fish') {
      // Opponent claims: "GO FISH!"
      // AUTOMATED INVISIBLE REFEREE VERIFICATION:
      if (hasMatching) {
        // 🚨 CAUGHT IN A LIE!
        opponent.penaltyCount++;
        opponent.hand = opponent.hand.filter(c => c.rank !== targetRank);
        asker.hand.push(...matchingCards);

        // PENALTY 1: Draw 2 extra cards from ocean
        const penaltyCards = [];
        for (let i = 0; i < 2; i++) {
          const c = this.deck.draw();
          if (c) {
            opponent.hand.push(c);
            penaltyCards.push(c);
          }
        }

        // PENALTY 2: Reveal 1 random card to asker
        let revealed = null;
        if (opponent.hand.length > 0) {
          revealed = opponent.hand[Math.floor(Math.random() * opponent.hand.length)];
          this.revealedCards = [revealed];
        }

        this.sortHands();
        this.checkBooks(this.activePlayerId);
        this.checkBooks(opponentId);

        this.lastAction = {
          action: 'caught_lying',
          text: `🚨 BUSTED! ${opponent.name} lied about having ${rankLabel}s! Surrendered all ${matchingCards.length} ${rankLabel}(s) + drew 2 penalty cards!`
        };

        this.phase = GO_FISH_PHASES.CAUGHT_LYING;
        this.onEvent({
          type: 'CAUGHT_IN_LIE',
          liarId: opponentId,
          rank: targetRank,
          transferred: matchingCards,
          revealedCard: revealed
        });

        // Resume after penalty
        setTimeout(() => {
          this.checkEmptyHands();
          this.phase = this.checkGameEnd() ? GO_FISH_PHASES.GAME_OVER : GO_FISH_PHASES.ASKING;
          this.notifyState();
        }, 3000);

      } else {
        // TRUTHFUL GO FISH: Asker draws from ocean
        const fishedCard = this.deck.draw();
        if (fishedCard) {
          asker.hand.push(fishedCard);
          this.sortHands();
          const gotDesired = (fishedCard.rank === targetRank);
          this.checkBooks(this.activePlayerId);

          if (gotDesired) {
            this.lastAction = {
              action: 'lucky_fish',
              text: `🎣 Lucky Fish! ${asker.name} fished the ${rankLabel} they asked for! Turn continues!`
            };
            this.onEvent({ type: 'LUCKY_FISH', card: fishedCard });
            this.phase = this.checkGameEnd() ? GO_FISH_PHASES.GAME_OVER : GO_FISH_PHASES.ASKING;
          } else {
            this.lastAction = {
              action: 'go_fish',
              text: `${opponent.name} said: "GO FISH!" ${asker.name} drew a card.`
            };
            this.onEvent({ type: 'WENT_FISHING' });
            // Turn passes to opponent
            this.activePlayerId = 1 - this.activePlayerId;
            this.phase = this.checkGameEnd() ? GO_FISH_PHASES.GAME_OVER : GO_FISH_PHASES.ASKING;
          }
        } else {
          // Ocean empty
          this.activePlayerId = 1 - this.activePlayerId;
          this.phase = this.checkGameEnd() ? GO_FISH_PHASES.GAME_OVER : GO_FISH_PHASES.ASKING;
        }
      }
    }

    this.notifyState();
    return true;
  }

  // Check if hand contains 4 of the same rank (a Book)
  checkBooks(playerId) {
    const player = this.players[playerId];
    const rankCounts = {};
    for (const card of player.hand) {
      rankCounts[card.rank] = (rankCounts[card.rank] || 0) + 1;
    }

    const formed = [];
    for (const [rank, count] of Object.entries(rankCounts)) {
      if (count === 4) {
        player.hand = player.hand.filter(c => c.rank !== rank);
        player.books.push(rank);
        formed.push(rank);
        const rankLabel = RANKS.find(r => r.rank === rank)?.label || rank;
        this.onEvent({ type: 'BOOK_COMPLETED', playerId, rank, rankLabel });
      }
    }
    return formed;
  }

  // If a player has 0 cards but deck has cards, draw up to 1
  checkEmptyHands() {
    for (const p of this.players) {
      if (p.hand.length === 0 && this.deck.remaining() > 0) {
        const c = this.deck.draw();
        if (c) p.hand.push(c);
      }
    }
  }

  checkGameEnd() {
    const totalBooks = this.players[0].books.length + this.players[1].books.length;
    const deckEmpty = this.deck.remaining() === 0;
    const handsEmpty = this.players[0].hand.length === 0 && this.players[1].hand.length === 0;

    if (totalBooks === 13 || handsEmpty || (deckEmpty && (this.players[0].hand.length === 0 || this.players[1].hand.length === 0))) {
      this.phase = GO_FISH_PHASES.GAME_OVER;
      const b0 = this.players[0].books.length;
      const b1 = this.players[1].books.length;

      if (b0 > b1) {
        this.winner = this.players[0];
      } else if (b1 > b0) {
        this.winner = this.players[1];
      } else {
        this.winner = null; // Tie
      }

      this.onEvent({ type: 'GO_FISH_GAME_OVER', winner: this.winner, b0, b1 });
      return true;
    }
    return false;
  }

  notifyState() {
    this.onStateChange(this.getStateSnapshot());
  }

  getStateSnapshot() {
    return {
      phase: this.phase,
      activePlayerId: this.activePlayerId,
      currentAskRank: this.currentAskRank,
      oceanRemaining: this.deck.remaining(),
      lastAction: this.lastAction,
      winner: this.winner,
      revealedCards: this.revealedCards,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        handCount: p.hand.length,
        hand: p.hand,
        books: p.books,
        penaltyCount: p.penaltyCount
      }))
    };
  }

  getSanitizedStateForPlayer(playerId) {
    const raw = this.getStateSnapshot();
    const sanitizedPlayers = raw.players.map((p, idx) => {
      if (idx === playerId || raw.phase === GO_FISH_PHASES.GAME_OVER) {
        return p;
      }
      return {
        ...p,
        hand: p.hand.map(() => null) // Opponent cards face down
      };
    });

    return {
      ...raw,
      players: sanitizedPlayers
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { GoFishEngine, GO_FISH_PHASES };
}
