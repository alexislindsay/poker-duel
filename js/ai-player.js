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
    const bb = gameState.currentBigBlind || 20;
    const sb = gameState.currentSmallBlind || 10;

    const hole = (ai.holeCards || []).filter(c => c && typeof c.value === 'number');
    const comm = (gameState.communityCards || []).filter(c => c && typeof c.value === 'number');
    const allAiCards = [...hole, ...comm];
    const handEval = PokerEvaluator.evaluateBestHand(allAiCards);
    const isPreDraft = (gameState.phase === 'PRE_DRAFT_BETTING' || comm.length === 0);

    // Calculate Card Quality for 3 Hole Cards during Pre-Draft
    let preDraftPotential = 0;
    if (hole.length > 0) {
      const maxVal = Math.max(...hole.map(c => c.value));
      const hasAce = hole.some(c => c.value === 14);
      const hasKing = hole.some(c => c.value === 13);
      const hasQueen = hole.some(c => c.value === 12);
      const hasPair = (new Set(hole.map(c => c.value)).size < hole.length);
      const suitCounts = {};
      hole.forEach(c => { suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1; });
      const maxSuited = Math.max(...Object.values(suitCounts));

      if (hasPair) preDraftPotential += 45; // Pocket pair is huge in pre-draft
      if (hasAce) preDraftPotential += 25;
      if (hasKing) preDraftPotential += 18;
      if (hasQueen) preDraftPotential += 12;
      if (maxSuited >= 2) preDraftPotential += 15;
      if (maxVal >= 9) preDraftPotential += 10;
    }

    const strength = isPreDraft 
      ? Math.max(preDraftPotential, (handEval && handEval.level) ? handEval.level * 15 : 15) 
      : ((handEval && handEval.level) ? handEval.level * 10 : 10);

    // 1. NO BET TO CALL (Can Check or Bet/Raise)
    if (aiCallAmount <= 0) {
      const minRaiseTarget = currentBet > 0 ? (currentBet + bb) : bb;
      const maxChips = ai.chips + (ai.currentRoundBet || 0);

      if (isPreDraft) {
        if (strength >= 45 && Math.random() < 0.65) {
          const target = Math.min(maxChips, currentBet + bb);
          return { action: 'raise', amount: target };
        } else if (Math.random() < 0.25 && ai.chips >= bb) {
          const target = Math.min(maxChips, currentBet + bb);
          return { action: 'raise', amount: target };
        }
        return { action: 'check' };
      }

      // Post-draft betting
      if (strength >= 60 && ai.chips >= bb) {
        const targetAmount = Math.min(maxChips, Math.max(minRaiseTarget, currentBet + Math.floor(pot * 0.5)));
        return { action: 'raise', amount: targetAmount };
      } else if (strength >= 30 && Math.random() < 0.45 && ai.chips >= bb) {
        const targetAmount = Math.min(maxChips, minRaiseTarget);
        return { action: 'raise', amount: targetAmount };
      } else if (Math.random() < 0.20 && ai.chips >= bb) {
        const targetAmount = Math.min(maxChips, minRaiseTarget);
        return { action: 'raise', amount: targetAmount };
      }
      return { action: 'check' };
    }

    // 2. FACING A BET / RAISE (aiCallAmount > 0)
    if (isPreDraft) {
      // In Pre-draft, Dad is curious and wants to draft cards!
      // Calls standard opening raises (up to 3x-4x BB) with high willingness
      if (aiCallAmount <= bb * 3) {
        if (strength >= 15 || Math.random() < 0.85) {
          return { action: 'call' };
        }
      }
      // If user went big pre-draft
      if (aiCallAmount <= bb * 6) {
        if (strength >= 35 || Math.random() < 0.55) {
          return { action: 'call' };
        }
      }
      // Strong pre-draft hand re-raise
      if (strength >= 50 && Math.random() < 0.4) {
        const reRaise = Math.min(ai.chips, currentBet + bb);
        return { action: 'raise', amount: reRaise };
      }
      if (strength >= 25 || Math.random() < 0.45) {
        return { action: 'call' };
      }
      return { action: 'fold' };
    }

    // Post-Draft facing bet/raise:
    if (strength >= 70) {
      if (Math.random() < 0.55 && ai.chips > aiCallAmount * 2) {
        const raiseAmount = Math.min(ai.chips, currentBet + bb * 2);
        return { action: 'raise', amount: raiseAmount };
      }
      return { action: 'call' };
    }

    if (strength >= 35) {
      if (aiCallAmount <= bb * 5 || aiCallAmount <= pot * 0.5) {
        return { action: 'call' };
      }
      return Math.random() < 0.6 ? { action: 'call' } : { action: 'fold' };
    }

    if (strength >= 20) {
      if (aiCallAmount <= bb * 2 || aiCallAmount <= pot * 0.3) {
        return { action: 'call' };
      }
      return Math.random() < 0.4 ? { action: 'call' } : { action: 'fold' };
    }

    // Weak hand
    if (aiCallAmount <= bb || Math.random() < 0.25) {
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
