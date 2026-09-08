// js/games/spades-engine.js - 2 to 4 Player Spades Engine (Drafting Duel & 4-Player Partnership)

const SPADES_PHASES = {
  NOT_STARTED: 'NOT_STARTED',
  DRAFTING: 'DRAFTING',          // For 2-player mode
  BIDDING: 'BIDDING',            // All players enter trick bids
  TRICK_PLAYING: 'TRICK_PLAYING',// Trick rounds (13 tricks)
  ROUND_OVER: 'ROUND_OVER',
  GAME_OVER: 'GAME_OVER'
};

class SpadesEngine {
  constructor(options = {}) {
    this.onStateChange = options.onStateChange || (() => {});
    this.onEvent = options.onEvent || (() => {});
    this.numPlayers = options.numPlayers || 2;
    this.customPlayerConfigs = options.playersConfig || null;
    this.isPartnership = (this.numPlayers === 4); // 4-player default to partnership

    this.initPlayers();
    this.deck = new Deck(true); // Deck with Jokers
    this.phase = SPADES_PHASES.NOT_STARTED;
    this.activePlayerId = 0;
    this.spadesBroken = false;
    this.currentDraftCard = null;
    this.currentTrick = []; // [{ playerId, card }]
    this.trickLeaderId = 0;
    this.trickNumber = 1;
    this.winner = null;
    this.lastAction = null;
    this.teamScores = { team1: 0, team2: 0, bags1: 0, bags2: 0 };
  }

  setPlayerCount(count, playerConfigs = null, isPartnership = true) {
    this.numPlayers = Math.max(2, Math.min(4, count));
    this.customPlayerConfigs = playerConfigs;
    this.isPartnership = (this.numPlayers === 4) && isPartnership;
    this.initPlayers();
    this.startNewGame();
  }

  initPlayers() {
    const defaultNames = ['You', 'Player 2', 'Player 3', 'Player 4'];
    const defaultAvatars = ['🤠', '🤖', '👩‍💼', '😎'];

    this.players = [];
    for (let i = 0; i < this.numPlayers; i++) {
      const cfg = (this.customPlayerConfigs && this.customPlayerConfigs[i]) || {};
      this.players.push({
        id: i,
        name: cfg.name || defaultNames[i] || `Player ${i + 1}`,
        avatar: cfg.avatar || defaultAvatars[i] || '👤',
        isAi: cfg.isAi !== undefined ? cfg.isAi : (i > 0),
        team: (i % 2 === 0) ? 1 : 2, // Seat 0 & 2 Team 1 (South/North), Seat 1 & 3 Team 2 (West/East)
        hand: [],
        bid: null,
        tricksWon: 0,
        score: 0,
        bags: 0
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

    if (this.numPlayers === 2) {
      // 2-Player Draft Mode
      this.phase = SPADES_PHASES.DRAFTING;
      this.drawNextDraftCard();
      this.lastAction = { text: '2-Player Drafting started! Inspect cards and choose KEEP or DISCARD.' };
      this.onEvent({ type: 'SPADES_DRAFT_STARTED' });
    } else {
      // 3 or 4 Players: Direct Deal!
      const cardsPerPlayer = Math.floor(52 / this.numPlayers);
      for (let i = 0; i < cardsPerPlayer; i++) {
        for (const p of this.players) {
          p.hand.push(this.deck.draw());
        }
      }
      this.sortHands();
      this.phase = SPADES_PHASES.BIDDING;
      this.activePlayerId = 0;
      this.lastAction = { text: `${this.numPlayers}-Player Spades started! Enter your trick bids.` };
      this.onEvent({ type: 'SPADES_BIDDING_STARTED' });
    }

    this.notifyState();
  }

  sortHands() {
    const suitOrder = { '♠': 4, '♥': 3, '♣': 2, '♦': 1 };
    for (const p of this.players) {
      p.hand.sort((a, b) => {
        if (a.suit !== b.suit) return suitOrder[b.suit] - suitOrder[a.suit];
        return b.value - a.value;
      });
    }
  }

  drawNextDraftCard() {
    if (this.players.every(p => p.hand.length >= 13)) {
      this.sortHands();
      this.phase = SPADES_PHASES.BIDDING;
      this.currentDraftCard = null;
      this.lastAction = { text: 'Drafting complete. Enter your trick bids!' };
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
      player.hand.push(card);
      this.deck.draw(); // Burn next card
      this.lastAction = { playerId, action: 'keep', text: `${player.name} kept a card.` };
    } else {
      const mystery = this.deck.draw();
      if (mystery) player.hand.push(mystery);
      this.lastAction = { playerId, action: 'discard', text: `${player.name} discarded and took mystery card.` };
    }

    this.currentDraftCard = null;
    this.activePlayerId = (this.activePlayerId + 1) % this.numPlayers;
    this.drawNextDraftCard();
    return true;
  }

  submitBid(playerId, bid) {
    if (this.phase !== SPADES_PHASES.BIDDING) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    player.bid = Math.max(0, Math.min(13, parseInt(bid, 10) || 0));

    const bidLabel = player.bid === 0 ? 'NIL (0 tricks)' : `${player.bid} tricks`;
    this.lastAction = { playerId, bid: player.bid, text: `${player.name} bid ${bidLabel}.` };
    this.onEvent({ type: 'SPADES_BID_SUBMITTED', playerId, bid: player.bid });

    // Check if all players have bid
    const nextUnbid = this.players.findIndex(p => p.bid === null);
    if (nextUnbid === -1) {
      // All bids in! Start trick playing
      this.phase = SPADES_PHASES.TRICK_PLAYING;
      this.activePlayerId = 0;
      this.trickLeaderId = 0;
      this.trickNumber = 1;
      this.currentTrick = [];
      this.onEvent({ type: 'SPADES_TRICKS_STARTED' });
    } else {
      this.activePlayerId = nextUnbid;
    }

    this.notifyState();
    return true;
  }

  isValidTrickPlay(playerId, card) {
    const player = this.players[playerId];
    if (!player || !card) return false;

    if (this.currentTrick.length === 0) {
      // Leading trick
      if (card.suit === '♠' && !this.spadesBroken) {
        // Can only lead spades if spades broken or only has spades
        const hasNonSpades = player.hand.some(c => c.suit !== '♠');
        return !hasNonSpades;
      }
      return true;
    }

    // Following trick
    const leadCard = this.currentTrick[0].card;
    const hasLeadSuit = player.hand.some(c => c.suit === leadCard.suit);

    if (hasLeadSuit) {
      return card.suit === leadCard.suit;
    }

    return true; // Out of lead suit, can play trump or slough
  }

  playTrickCard(playerId, cardId) {
    if (this.phase !== SPADES_PHASES.TRICK_PLAYING) return false;
    if (playerId !== this.activePlayerId) return false;

    const player = this.players[playerId];
    const cardIdx = player.hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return false;

    const card = player.hand[cardIdx];
    if (!this.isValidTrickPlay(playerId, card)) return false;

    player.hand.splice(cardIdx, 1);
    this.currentTrick.push({ playerId, card });

    if (card.suit === '♠') {
      this.spadesBroken = true;
    }

    this.lastAction = { playerId, card, text: `${player.name} played ${card.label} of ${card.suit}.` };
    this.onEvent({ type: 'SPADES_CARD_PLAYED', playerId, card });

    if (this.currentTrick.length === this.numPlayers) {
      // Trick complete!
      this.notifyState();
      setTimeout(() => this.resolveTrick(), 900);
      return true;
    }

    // Move to next player in trick
    this.activePlayerId = (this.activePlayerId + 1) % this.numPlayers;
    this.notifyState();
    return true;
  }

  resolveTrick() {
    const leadSuit = this.currentTrick[0].card.suit;
    let winningPlay = this.currentTrick[0];

    for (let i = 1; i < this.currentTrick.length; i++) {
      const play = this.currentTrick[i];
      const winCard = winningPlay.card;
      const curCard = play.card;

      if (curCard.suit === '♠' && winCard.suit !== '♠') {
        winningPlay = play;
      } else if (curCard.suit === winCard.suit && curCard.value > winCard.value) {
        winningPlay = play;
      }
    }

    const winner = this.players[winningPlay.playerId];
    winner.tricksWon++;

    this.lastAction = {
      playerId: winner.id,
      card: winningPlay.card,
      text: `🏆 ${winner.name} won Trick #${this.trickNumber} with ${winningPlay.card.label} of ${winningPlay.card.suit}!`
    };

    this.onEvent({
      type: 'SPADES_TRICK_WON',
      winnerId: winner.id,
      trickNumber: this.trickNumber,
      winningCard: winningPlay.card
    });

    this.currentTrick = [];
    this.trickNumber++;
    this.activePlayerId = winner.id;
    this.trickLeaderId = winner.id;

    // Check if round over (all hands empty)
    if (this.players.every(p => p.hand.length === 0)) {
      this.resolveRoundScore();
    } else {
      this.notifyState();
    }
  }

  resolveRoundScore() {
    this.phase = SPADES_PHASES.ROUND_OVER;

    if (this.isPartnership && this.numPlayers === 4) {
      // Partnership calculation
      const t1Bid = (this.players[0].bid || 0) + (this.players[2].bid || 0);
      const t1Won = this.players[0].tricksWon + this.players[2].tricksWon;
      const t2Bid = (this.players[1].bid || 0) + (this.players[3].bid || 0);
      const t2Won = this.players[1].tricksWon + this.players[3].tricksWon;

      let t1ScoreDelta = 0;
      if (t1Won >= t1Bid) {
        const bags = t1Won - t1Bid;
        t1ScoreDelta += (t1Bid * 10) + bags;
        this.teamScores.bags1 += bags;
      } else {
        t1ScoreDelta -= (t1Bid * 10);
      }

      let t2ScoreDelta = 0;
      if (t2Won >= t2Bid) {
        const bags = t2Won - t2Bid;
        t2ScoreDelta += (t2Bid * 10) + bags;
        this.teamScores.bags2 += bags;
      } else {
        t2ScoreDelta -= (t2Bid * 10);
      }

      this.teamScores.team1 += t1ScoreDelta;
      this.teamScores.team2 += t2ScoreDelta;

      this.winner = this.teamScores.team1 >= this.teamScores.team2
        ? { id: 0, name: `Team South/North (${this.players[0].name} & ${this.players[2].name})` }
        : { id: 1, name: `Team West/East (${this.players[1].name} & ${this.players[3].name})` };
    } else {
      // Individual scoring
      for (const p of this.players) {
        const bid = p.bid || 0;
        if (p.tricksWon >= bid) {
          const bags = p.tricksWon - bid;
          p.score += (bid * 10) + bags;
          p.bags += bags;
        } else {
          p.score -= (bid * 10);
        }
      }

      const sorted = [...this.players].sort((a, b) => b.score - a.score);
      this.winner = sorted[0];
    }

    this.lastAction = { text: `Round completed! Champion: ${this.winner.name}` };
    this.onEvent({ type: 'SPADES_ROUND_COMPLETED', winner: this.winner });
    this.notifyState();
  }

  getStateSnapshot() {
    return {
      phase: this.phase,
      activePlayerId: this.activePlayerId,
      trickLeaderId: this.trickLeaderId,
      trickNumber: this.trickNumber,
      spadesBroken: this.spadesBroken,
      currentDraftCard: this.currentDraftCard,
      currentTrick: this.currentTrick,
      winner: this.winner,
      lastAction: this.lastAction,
      isPartnership: this.isPartnership,
      teamScores: this.teamScores,
      players: this.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isAi: p.isAi,
        team: p.team,
        cardCount: p.hand.length,
        hand: p.hand,
        bid: p.bid,
        tricksWon: p.tricksWon,
        score: p.score,
        bags: p.bags
      }))
    };
  }

  restoreStateSnapshot(snapshot) {
    if (!snapshot) return;
    this.phase = snapshot.phase || SPADES_PHASES.NOT_STARTED;
    this.activePlayerId = snapshot.activePlayerId !== undefined ? snapshot.activePlayerId : 0;
    this.trickLeaderId = snapshot.trickLeaderId !== undefined ? snapshot.trickLeaderId : 0;
    this.trickNumber = snapshot.trickNumber || 1;
    this.spadesBroken = !!snapshot.spadesBroken;
    this.currentDraftCard = snapshot.currentDraftCard || null;
    this.currentTrick = snapshot.currentTrick || [];
    this.winner = snapshot.winner || null;
    this.lastAction = snapshot.lastAction || null;
    this.isPartnership = snapshot.isPartnership !== undefined ? snapshot.isPartnership : (snapshot.players && snapshot.players.length === 4);
    if (snapshot.teamScores) this.teamScores = { ...snapshot.teamScores };

    if (Array.isArray(snapshot.players)) {
      this.numPlayers = snapshot.players.length;
      this.players = snapshot.players.map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isAi: !!p.isAi,
        team: p.team !== undefined ? p.team : ((p.id % 2 === 0) ? 1 : 2),
        hand: p.hand || [],
        bid: p.bid,
        tricksWon: p.tricksWon || 0,
        score: p.score || 0,
        bags: p.bags || 0
      }));
    }
  }

  notifyState() {
    this.onStateChange(this.getStateSnapshot());
  }
}

if (typeof module !== 'undefined') {
  module.exports = { SpadesEngine, SPADES_PHASES };
}
