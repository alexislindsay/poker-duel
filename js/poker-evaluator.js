// js/poker-evaluator.js - Exact Poker Hand Evaluation & 10-Tier Rank Calculator

const HAND_RANKS = [
  { id: 'HIGH_CARD', name: 'High Card', level: 1 },
  { id: 'ONE_PAIR', name: 'One Pair', level: 2 },
  { id: 'TWO_PAIR', name: 'Two Pair', level: 3 },
  { id: 'THREE_OF_A_KIND', name: 'Three of a Kind', level: 4 },
  { id: 'STRAIGHT', name: 'Straight', level: 5 },
  { id: 'FLUSH', name: 'Flush', level: 6 },
  { id: 'FULL_HOUSE', name: 'Full House', level: 7 },
  { id: 'FOUR_OF_A_KIND', name: 'Four of a Kind', level: 8 },
  { id: 'STRAIGHT_FLUSH', name: 'Straight Flush', level: 9 },
  { id: 'ROYAL_FLUSH', name: 'Royal Flush', level: 10 }
];

const RANK_NAMES = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9',
  10: '10', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace'
};

const RANK_PLURALS = {
  2: '2s', 3: '3s', 4: '4s', 5: '5s', 6: '6s', 7: '7s', 8: '8s', 9: '9s',
  10: '10s', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces'
};

class PokerEvaluator {
  // Helper to generate combinations of k cards
  static getCombinations(arr, k) {
    if (k > arr.length || k <= 0) return [];
    if (k === arr.length) return [arr];
    if (k === 1) return arr.map(el => [el]);
    
    const combos = [];
    for (let i = 0; i <= arr.length - k; i++) {
      const head = arr[i];
      const tailCombos = PokerEvaluator.getCombinations(arr.slice(i + 1), k - 1);
      for (const tc of tailCombos) {
        combos.push([head, ...tc]);
      }
    }
    return combos;
  }

  // Evaluates exactly 5 cards
  static evaluate5Cards(cards) {
    if (!cards || cards.length !== 5) {
      throw new Error('Must provide exactly 5 cards to evaluate5Cards');
    }

    // Sort descending by value (14 -> 2)
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const values = sorted.map(c => c.value);
    const suits = sorted.map(c => c.suit);

    const isFlush = suits.every(s => s === suits[0]);

    // Count rank frequencies
    const freq = {};
    for (const v of values) {
      freq[v] = (freq[v] || 0) + 1;
    }

    // Sort unique ranks by frequency descending, then by value descending
    const uniqueRanks = Object.keys(freq).map(Number).sort((a, b) => {
      if (freq[b] !== freq[a]) return freq[b] - freq[a];
      return b - a;
    });

    // Check straight
    let isStraight = false;
    let straightHigh = 0;

    const isRegularStraight = uniqueRanks.length === 5 && (values[0] - values[4] === 4);
    const isWheel = uniqueRanks.length === 5 && 
                    values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2;

    if (isRegularStraight) {
      isStraight = true;
      straightHigh = values[0];
    } else if (isWheel) {
      isStraight = true;
      straightHigh = 5; // 5-high straight (A-2-3-4-5)
    }

    // 10: Royal Flush & 9: Straight Flush
    if (isFlush && isStraight) {
      if (straightHigh === 14) {
        return {
          rankIndex: 9,
          level: 10,
          id: 'ROYAL_FLUSH',
          shortName: 'Royal Flush',
          name: 'Royal Flush 👑',
          score: 9 * 1e10,
          cards: sorted,
          best5Cards: sorted
        };
      }
      return {
        rankIndex: 8,
        level: 9,
        id: 'STRAIGHT_FLUSH',
        shortName: 'Straight Flush',
        name: `Straight Flush (${RANK_NAMES[straightHigh]} High)`,
        score: 8 * 1e10 + straightHigh * 1e8,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 8: Four of a Kind
    if (freq[uniqueRanks[0]] === 4) {
      const quadRank = uniqueRanks[0];
      const kicker = uniqueRanks[1];
      return {
        rankIndex: 7,
        level: 8,
        id: 'FOUR_OF_A_KIND',
        shortName: 'Four of a Kind',
        name: `Four of a Kind (${RANK_PLURALS[quadRank]})`,
        score: 7 * 1e10 + quadRank * 1e8 + kicker * 1e6,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 7: Full House
    if (freq[uniqueRanks[0]] === 3 && freq[uniqueRanks[1]] === 2) {
      const tripRank = uniqueRanks[0];
      const pairRank = uniqueRanks[1];
      return {
        rankIndex: 6,
        level: 7,
        id: 'FULL_HOUSE',
        shortName: 'Full House',
        name: `Full House (${RANK_PLURALS[tripRank]} over ${RANK_PLURALS[pairRank]})`,
        score: 6 * 1e10 + tripRank * 1e8 + pairRank * 1e6,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 6: Flush
    if (isFlush) {
      let tieScore = 0;
      for (let i = 0; i < 5; i++) {
        tieScore += values[i] * Math.pow(15, 4 - i);
      }
      return {
        rankIndex: 5,
        level: 6,
        id: 'FLUSH',
        shortName: 'Flush',
        name: `Flush (${RANK_NAMES[values[0]]} High)`,
        score: 5 * 1e10 + tieScore * 10,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 5: Straight
    if (isStraight) {
      const lowRank = straightHigh === 5 ? 'Ace' : RANK_NAMES[straightHigh - 4];
      return {
        rankIndex: 4,
        level: 5,
        id: 'STRAIGHT',
        shortName: 'Straight',
        name: `Straight (${lowRank} to ${RANK_NAMES[straightHigh]})`,
        score: 4 * 1e10 + straightHigh * 1e8,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 4: Three of a Kind
    if (freq[uniqueRanks[0]] === 3) {
      const tripRank = uniqueRanks[0];
      const k1 = uniqueRanks[1];
      const k2 = uniqueRanks[2];
      return {
        rankIndex: 3,
        level: 4,
        id: 'THREE_OF_A_KIND',
        shortName: 'Three of a Kind',
        name: `Three of a Kind (${RANK_PLURALS[tripRank]})`,
        score: 3 * 1e10 + tripRank * 1e8 + k1 * 1e6 + k2 * 1e4,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 3: Two Pair
    if (freq[uniqueRanks[0]] === 2 && freq[uniqueRanks[1]] === 2) {
      const highPair = uniqueRanks[0];
      const lowPair = uniqueRanks[1];
      const kicker = uniqueRanks[2];
      return {
        rankIndex: 2,
        level: 3,
        id: 'TWO_PAIR',
        shortName: 'Two Pair',
        name: `Two Pair (${RANK_PLURALS[highPair]} & ${RANK_PLURALS[lowPair]})`,
        score: 2 * 1e10 + highPair * 1e8 + lowPair * 1e6 + kicker * 1e4,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 2: One Pair
    if (freq[uniqueRanks[0]] === 2) {
      const pairRank = uniqueRanks[0];
      const k1 = uniqueRanks[1];
      const k2 = uniqueRanks[2];
      const k3 = uniqueRanks[3];
      return {
        rankIndex: 1,
        level: 2,
        id: 'ONE_PAIR',
        shortName: 'One Pair',
        name: `Pair of ${RANK_PLURALS[pairRank]}`,
        score: 1 * 1e10 + pairRank * 1e8 + k1 * 1e6 + k2 * 1e4 + k3 * 1e2,
        cards: sorted,
        best5Cards: sorted
      };
    }

    // 1: High Card
    let tieScore = 0;
    for (let i = 0; i < 5; i++) {
      tieScore += values[i] * Math.pow(15, 4 - i);
    }
    return {
      rankIndex: 0,
      level: 1,
      id: 'HIGH_CARD',
      shortName: 'High Card',
      name: `High Card (${RANK_NAMES[values[0]]} High)`,
      score: tieScore * 10,
      cards: sorted,
      best5Cards: sorted
    };
  }

  // Evaluates any number of cards (3 to 8 cards)
  static evaluateBestHand(cards) {
    if (!cards || cards.length === 0) {
      return {
        rankIndex: 0,
        level: 0,
        id: 'HIGH_CARD',
        shortName: 'No Cards',
        name: 'Waiting for cards...',
        score: 0,
        cards: [],
        best5Cards: []
      };
    }

    // If exactly 5 cards:
    if (cards.length === 5) {
      return PokerEvaluator.evaluate5Cards(cards);
    }

    // If more than 5 cards (e.g. 6, 7, 8 cards):
    if (cards.length > 5) {
      const combinations = PokerEvaluator.getCombinations(cards, 5);
      let bestResult = null;

      for (const combo of combinations) {
        const result = PokerEvaluator.evaluate5Cards(combo);
        if (!bestResult || result.score > bestResult.score) {
          bestResult = result;
        }
      }
      return bestResult;
    }

    // If fewer than 5 cards (e.g. 3 or 4 cards): Evaluate current exact partial hand
    return PokerEvaluator.evaluatePartialHand(cards);
  }

  // Evaluates partial hands (1 to 4 cards) so the HUD works immediately on deal
  static evaluatePartialHand(cards) {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const values = sorted.map(c => c.value);
    const freq = {};
    for (const v of values) {
      freq[v] = (freq[v] || 0) + 1;
    }

    const uniqueRanks = Object.keys(freq).map(Number).sort((a, b) => {
      if (freq[b] !== freq[a]) return freq[b] - freq[a];
      return b - a;
    });

    const highestFreq = freq[uniqueRanks[0]] || 1;

    // Check Three of a Kind
    if (highestFreq >= 3) {
      const tripRank = uniqueRanks[0];
      return {
        rankIndex: 3,
        level: 4,
        id: 'THREE_OF_A_KIND',
        shortName: 'Three of a Kind',
        name: `Three of a Kind (${RANK_PLURALS[tripRank]})`,
        score: 3 * 1e10 + tripRank * 1e8,
        cards: sorted,
        best5Cards: sorted.filter(c => c.value === tripRank)
      };
    }

    // Check Two Pair (if 4 cards)
    if (highestFreq === 2 && freq[uniqueRanks[1]] === 2) {
      const highPair = uniqueRanks[0];
      const lowPair = uniqueRanks[1];
      return {
        rankIndex: 2,
        level: 3,
        id: 'TWO_PAIR',
        shortName: 'Two Pair',
        name: `Two Pair (${RANK_PLURALS[highPair]} & ${RANK_PLURALS[lowPair]})`,
        score: 2 * 1e10 + highPair * 1e8 + lowPair * 1e6,
        cards: sorted,
        best5Cards: sorted.filter(c => c.value === highPair || c.value === lowPair)
      };
    }

    // Check One Pair
    if (highestFreq === 2) {
      const pairRank = uniqueRanks[0];
      return {
        rankIndex: 1,
        level: 2,
        id: 'ONE_PAIR',
        shortName: 'One Pair',
        name: `Pair of ${RANK_PLURALS[pairRank]}`,
        score: 1 * 1e10 + pairRank * 1e8,
        cards: sorted,
        best5Cards: sorted.filter(c => c.value === pairRank)
      };
    }

    // High Card
    const highVal = values[0];
    return {
      rankIndex: 0,
      level: 1,
      id: 'HIGH_CARD',
      shortName: 'High Card',
      name: `High Card (${RANK_NAMES[highVal]} High)`,
      score: highVal * 1e7,
      cards: sorted,
      best5Cards: sorted.filter(c => c.value === highVal)
    };
  }

  // Compare two evaluated hands: 1 if A wins, -1 if B wins, 0 if tie
  static compare(handA, handB) {
    if (handA.score > handB.score) return 1;
    if (handB.score > handA.score) return -1;
    return 0;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { PokerEvaluator, HAND_RANKS, RANK_NAMES, RANK_PLURALS };
}
