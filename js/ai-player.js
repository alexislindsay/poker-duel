// js/ai-player.js - AI Opponent logic for Solo Mode & Practice

class DadBotAI {
  constructor(name = "DadBot", style = "balanced") {
    this.name = name;
    this.style = style; // 'friendly', 'balanced', 'aggressive'
  }

  // Decision on whether to KEEP or DISCARD a drawn card
  decideDraft(drawnCard, aiHoleCards = [], communityCards = [], opponentHoleCount = 3) {
    if (!drawnCard) return 'discard';

    const hole = (aiHoleCards || []).filter(c => c && typeof c.value === 'number');
    const comm = (communityCards || []).filter(c => c && typeof c.value === 'number');
    const currentCards = [...hole, ...comm];
    const withNewCard = [...currentCards, drawnCard];

    const currentEval = PokerEvaluator.evaluateBestHand(currentCards);
    const newEval = PokerEvaluator.evaluateBestHand(withNewCard);

    // 1. Direct Hand Improvement (Rank or score increased)
    if (newEval.rankIndex > currentEval.rankIndex) {
      return 'keep';
    }

    if (newEval.score > currentEval.score && newEval.rankIndex >= 1) {
      return 'keep';
    }

    // 2. High value card (Ace or King) can be useful for kickers or high pairs
    if (drawnCard.value >= 13) {
      // 70% chance to keep an Ace or King
      if (Math.random() < 0.70) return 'keep';
    }

    // 3. Potential Flush draw / Straight connector
    const suitMatches = currentCards.filter(c => c.suit === drawnCard.suit).length;
    if (suitMatches >= 2) {
      return 'keep'; // contributes to potential flush
    }

    // 4. Pairs with any card in hand
    const hasRankMatch = hole.some(c => c.rank === drawnCard.rank);
    if (hasRankMatch) {
      return 'keep';
    }

    // 5. If board is almost empty (0 or 1 card), higher willingness to accept decent cards (value >= 9)
    if (comm.length <= 1 && drawnCard.value >= 9) {
      if (Math.random() < 0.60) return 'keep';
    }

    // 6. If we need to fill the last remaining slots and deck is running low
    if (comm.length === 4) {
      // Last card slot: keep if >= 8 or random 50%
      if (drawnCard.value >= 8 || Math.random() < 0.50) return 'keep';
    }

    return 'discard';
  }

  // Decision on Betting Round (Check, Call, Bet, Raise, Fold)
  decideBet(gameState, aiPlayerId) {
    const ai = gameState.players[aiPlayerId];
    if (!ai) return { action: 'check' };
    const opponent = gameState.players[1 - aiPlayerId];
    const currentBet = gameState.currentBet || 0;
    const aiCallAmount = currentBet - (ai.currentRoundBet || 0);
    const pot = gameState.pot || 0;

    const hole = (ai.holeCards || []).filter(c => c && typeof c.value === 'number');
    const comm = (gameState.communityCards || []).filter(c => c && typeof c.value === 'number');
    const allAiCards = [...hole, ...comm];
    const handEval = PokerEvaluator.evaluateBestHand(allAiCards);
    const strength = (handEval && handEval.level) ? (handEval.level * 10) : 10; // 10 to 100

    // No bet to call (can Check or Bet)
    if (aiCallAmount <= 0) {
      const minRaiseTarget = currentBet > 0 ? (currentBet + gameState.currentBigBlind) : gameState.currentBigBlind;
      const maxChips = ai.chips + ai.currentRoundBet;

      if (strength >= 60 && ai.chips >= gameState.currentBigBlind) {
        // Monster / High strength: Value Bet or raise
        const targetAmount = Math.min(maxChips, Math.max(minRaiseTarget, currentBet + Math.floor(pot * 0.5)));
        return { action: 'raise', amount: targetAmount };
      } else if (strength >= 35 && Math.random() < 0.4 && ai.chips >= gameState.currentBigBlind) {
        // Medium strength: Occasional lead bet/raise
        const targetAmount = Math.min(maxChips, minRaiseTarget);
        return { action: 'raise', amount: targetAmount };
      } else if (Math.random() < 0.15 && ai.chips >= gameState.currentBigBlind) {
        // Occasional bluff
        const targetAmount = Math.min(maxChips, minRaiseTarget);
        return { action: 'raise', amount: targetAmount };
      }
      return { action: 'check' };
    }

    // Facing a Bet / Raise (aiCallAmount > 0)
    // All-in situation check
    const isAllInCall = aiCallAmount >= ai.chips;

    if (strength >= 75) {
      // Very strong (Full House, Flush, Straight, Trips) -> Re-raise or Call
      if (Math.random() < 0.5 && ai.chips > aiCallAmount * 2) {
        const raiseAmount = Math.min(ai.chips, currentBet + gameState.currentBigBlind * 2);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    if (strength >= 40) {
      // Good hand (Pair/Two Pair): Call reasonable bets
      if (aiCallAmount <= gameState.currentBigBlind * 4 || aiCallAmount <= pot * 0.4) {
        return { action: 'call' };
      }
      // If bet is huge, fold unless high strength
      return Math.random() < 0.5 ? { action: 'call' } : { action: 'fold' };
    }

    if (strength >= 20) {
      // Low Pair / High Card: Call small blind bets
      if (aiCallAmount <= gameState.currentBigBlind * 1.5) {
        return { action: 'call' };
      }
      return { action: 'fold' };
    }

    // Weak hand (High card only): Fold to bets unless tiny
    if (aiCallAmount <= gameState.currentSmallBlind) {
      return { action: 'call' };
    }

    return { action: 'fold' };
  }

  decideDraftAction(drawnCard, aiHoleCards = [], communityCards = []) {
    const res = this.decideDraft(drawnCard, aiHoleCards, communityCards);
    return res ? res.toUpperCase() : 'KEEP';
  }

  decideBetAction(gameState, aiPlayerId = 1) {
    const dec = this.decideBet(gameState, aiPlayerId);
    return {
      type: (dec && dec.action ? dec.action : 'check').toUpperCase(),
      amount: dec && dec.amount ? dec.amount : 0
    };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { DadBotAI };
}
