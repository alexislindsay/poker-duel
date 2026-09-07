// js/ai-player.js - Multi-Bot AI Personalities for Solo Practice & Dynamic Seat Fill

class BotPersonality {
  constructor(name, style, avatar) {
    this.name = name;
    this.style = style; // 'balanced', 'conservative', 'aggressive'
    this.avatar = avatar;
  }
}

class ArcadeAIManager {
  constructor() {
    this.bots = [
      new DadBotAI('DadBot', 'balanced', '🤖'),
      new MomBotAI('MomBot', 'conservative', '👩‍💼'),
      new BroBotAI('BroBot', 'aggressive', '😎')
    ];
  }

  getBot(index = 0) {
    return this.bots[index % this.bots.length];
  }
}

class DadBotAI {
  constructor(name = "DadBot", style = "balanced", avatar = "🤖") {
    this.name = name;
    this.style = style;
    this.avatar = avatar;
  }

  decideDraft(drawnCard, aiHoleCards = [], communityCards = []) {
    if (!drawnCard) return 'discard';
    const hole = (aiHoleCards || []).filter(c => c && typeof c.value === 'number');
    const comm = (communityCards || []).filter(c => c && typeof c.value === 'number');
    const currentCards = [...hole, ...comm];
    const withNewCard = [...currentCards, drawnCard];

    const currentEval = PokerEvaluator.evaluateBestHand(currentCards);
    const newEval = PokerEvaluator.evaluateBestHand(withNewCard);

    if (newEval.rankIndex > currentEval.rankIndex) return 'keep';
    if (newEval.score > currentEval.score && newEval.rankIndex >= 1) return 'keep';
    if (drawnCard.value >= 13 && Math.random() < 0.70) return 'keep';
    if (hole.some(c => c.rank === drawnCard.rank)) return 'keep';
    if (comm.length <= 1 && drawnCard.value >= 9 && Math.random() < 0.60) return 'keep';
    if (comm.length === 4 && (drawnCard.value >= 8 || Math.random() < 0.50)) return 'keep';

    return 'discard';
  }

  decideBet(gameState, aiPlayerId) {
    const ai = gameState.players[aiPlayerId];
    if (!ai) return { action: 'check' };
    const currentBet = gameState.currentBet || 0;
    const aiCallAmount = currentBet - (ai.currentRoundBet || 0);
    const bb = gameState.currentBigBlind || 20;

    const hole = (ai.holeCards || []).filter(c => c && typeof c.value === 'number');
    const comm = (gameState.communityCards || []).filter(c => c && typeof c.value === 'number');
    const handEval = PokerEvaluator.evaluateBestHand([...hole, ...comm]);
    const strength = (handEval && handEval.level) ? handEval.level * 12 : 10;

    if (aiCallAmount <= 0) {
      if (strength >= 40 && Math.random() < 0.5 && ai.chips >= bb) {
        return { action: 'raise', amount: currentBet + bb };
      }
      return { action: 'check' };
    }

    if (aiCallAmount <= bb * 2) {
      return (strength >= 15 || Math.random() < 0.8) ? { action: 'call' } : { action: 'fold' };
    }

    if (strength >= 50) return { action: 'call' };
    return Math.random() < 0.3 ? { action: 'call' } : { action: 'fold' };
  }

  decideCrazyEight(state, botId, validCards) {
    if (!validCards || validCards.length === 0) return { action: 'draw' };
    // Prefer non-8 cards first, save wild 8 for emergencies
    const nonEight = validCards.find(c => c.rank !== '8');
    if (nonEight) return { action: 'play', cardId: nonEight.id };
    // Play 8
    const suits = ['♠', '♥', '♦', '♣'];
    return { action: 'play', cardId: validCards[0].id, wildSuit: suits[Math.floor(Math.random() * suits.length)] };
  }

  decideSpadesBid(hand) {
    if (!hand || hand.length === 0) return 2;
    let bid = 0;
    for (const c of hand) {
      if (c.suit === '♠' && c.value >= 12) bid++;
      else if (c.value === 14) bid++;
    }
    return Math.max(1, Math.min(10, bid));
  }

  decideSpadesTrickPlay(state, botId, validCards) {
    if (!validCards || validCards.length === 0) return null;
    // Play lowest valid winning card or lowest card
    return validCards[0];
  }
}

class MomBotAI extends DadBotAI {
  constructor(name = "MomBot", style = "conservative", avatar = "👩‍💼") {
    super(name, style, avatar);
  }

  decideBet(gameState, aiPlayerId) {
    const ai = gameState.players[aiPlayerId];
    if (!ai) return { action: 'check' };
    const currentBet = gameState.currentBet || 0;
    const aiCallAmount = currentBet - (ai.currentRoundBet || 0);
    const bb = gameState.currentBigBlind || 20;

    const hole = (ai.holeCards || []).filter(c => c && typeof c.value === 'number');
    const comm = (gameState.communityCards || []).filter(c => c && typeof c.value === 'number');
    const handEval = PokerEvaluator.evaluateBestHand([...hole, ...comm]);
    const level = handEval ? handEval.level : 1;

    if (aiCallAmount <= 0) {
      if (level >= 3 && ai.chips >= bb * 2) {
        return { action: 'raise', amount: currentBet + bb * 2 };
      }
      return { action: 'check' };
    }

    if (level >= 3) return { action: 'call' };
    if (level >= 2 && aiCallAmount <= bb) return { action: 'call' };
    return { action: 'fold' };
  }
}

class BroBotAI extends DadBotAI {
  constructor(name = "BroBot", style = "aggressive", avatar = "😎") {
    super(name, style, avatar);
  }

  decideBet(gameState, aiPlayerId) {
    const ai = gameState.players[aiPlayerId];
    if (!ai) return { action: 'check' };
    const currentBet = gameState.currentBet || 0;
    const aiCallAmount = currentBet - (ai.currentRoundBet || 0);
    const bb = gameState.currentBigBlind || 20;

    if (aiCallAmount <= 0) {
      if (Math.random() < 0.6 && ai.chips >= bb) {
        return { action: 'raise', amount: currentBet + bb * 2 };
      }
      return { action: 'check' };
    }

    if (Math.random() < 0.75) return { action: 'call' };
    if (Math.random() < 0.3 && ai.chips > bb * 4) return { action: 'raise', amount: currentBet + bb * 3 };
    return { action: 'fold' };
  }
}

if (typeof module !== 'undefined') {
  module.exports = { DadBotAI, MomBotAI, BroBotAI, ArcadeAIManager };
}
