// js/cards.js - Card definitions, Deck management, and SVG/HTML Card Rendering with Family & Food Deck Theme

const SUITS = [
  { name: 'spades', symbol: '?', foodEmoji: '??', foodName: 'Burgers', color: '#1a1a2e', letter: 'S' },
  { name: 'hearts', symbol: '?', foodEmoji: '??', foodName: 'Cherries', color: '#e63946', letter: 'H' },
  { name: 'diamonds', symbol: '?', foodEmoji: '??', foodName: 'Pizzas', color: '#ea580c', letter: 'D' },
  { name: 'clubs', symbol: '?', foodEmoji: '??', foodName: 'Veggies', color: '#16a34a', letter: 'C' }
];

const SUIT_FOOD_MAP = {
  '?': { emoji: '??', name: 'Burgers', icon: '??' },
  '?': { emoji: '??', name: 'Cherries', icon: '??' },
  '?': { emoji: '??', name: 'Pizzas', icon: '??' },
  '?': { emoji: '??', name: 'Veggies', icon: '??' }
};

const SUIT_COLORS = {
  '?': '#181824',
  '?': '#dc2626',
  '?': '#d97706',
  '?': '#16a34a'
};

const RANKS = [
  { rank: '2', value: 2, label: '2' },
  { rank: '3', value: 3, label: '3' },
  { rank: '4', value: 4, label: '4' },
  { rank: '5', value: 5, label: '5' },
  { rank: '6', value: 6, label: '6' },
  { rank: '7', value: 7, label: '7' },
  { rank: '8', value: 8, label: '8' },
  { rank: '9', value: 9, label: '9' },
  { rank: 'T', value: 10, label: '10' },
  { rank: 'J', value: 11, label: 'J', title: 'The John' },
  { rank: 'Q', value: 12, label: 'Q', title: 'Grandma' },
  { rank: 'K', value: 13, label: 'K', title: 'Grandpa' },
  { rank: 'A', value: 14, label: 'A', title: 'Ace Crest' }
];

// Custom Illustrated Card Artworks
const CARD_ART_MAP = {
  'A?': 'assets/cards/as.jpg',
  'A?': 'assets/cards/ad.jpg',
  'A?': 'assets/cards/ah.jpg',
  'A?': 'assets/cards/ac.jpg',
  'K?': 'assets/cards/ks.jpg',
  'Q?': 'assets/cards/qs.jpg',
  'J?': 'assets/cards/js.jpg',
  'K?': 'assets/cards/kd.jpg',
  'Q?': 'assets/cards/qd.jpg',
  'J?': 'assets/cards/jd.jpg',
  'K?': 'assets/cards/kh.jpg',
  'Q?': 'assets/cards/qh.jpg',
  'J?': 'assets/cards/jh.jpg',
  'K?': 'assets/cards/kc.jpg',
  'Q?': 'assets/cards/qc.jpg',
  'J?': 'assets/cards/jc.jpg',
  'JOKER_BIG': 'assets/cards/joker_big.jpg',
  'JOKER_LITTLE': 'assets/cards/joker_little.jpg'
};

// Global Active Theme ('family_food' or 'classic')
let activeDeckTheme = localStorage.getItem('poker_duel_deck_theme') || 'family_food';

function setDeckTheme(theme) {
  activeDeckTheme = theme;
  localStorage.setItem('poker_duel_deck_theme', theme);
  const event = new CustomEvent('deckThemeChanged', { detail: { theme } });
  window.dispatchEvent(event);
}

function getDeckTheme() {
  return activeDeckTheme;
}

class Card {
  constructor(rank, suit) {
    this.rank = rank; // '2'-'9', 'T', 'J', 'Q', 'K', 'A', 'JOKER'
    this.suit = suit; // '?', '?', '?', '?'
    const rankObj = RANKS.find(r => r.rank === rank) || { value: 0, label: rank };
    this.value = rankObj.value;
    this.label = rankObj.label;
    this.id = `${rank}${suit}`;
    this.color = (suit === '?' || suit === '?') ? '#dc2626' : '#1e293b';
    this.fourColor = SUIT_COLORS[suit] || this.color;
    this.foodInfo = SUIT_FOOD_MAP[suit] || { emoji: suit, name: suit };
    this.customArt = CARD_ART_MAP[this.id] || null;
  }

  toString() {
    return `${this.label}${this.suit}`;
  }

  toShortString() {
    return `${this.rank}${this.suit}`;
  }
}

class Deck {
  constructor(includeJokers = false) {
    this.cards = [];
    this.includeJokers = includeJokers;
    this.reset();
  }

  reset() {
    this.cards = [];
    const suits = ['?', '?', '?', '?'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    for (const s of suits) {
      for (const r of ranks) {
        this.cards.push(new Card(r, s));
      }
    }
    if (this.includeJokers) {
      const bigJoker = new Card('JOKER', 'BIG');
      bigJoker.label = '? JOKER';
      bigJoker.value = 15;
      bigJoker.customArt = CARD_ART_MAP['JOKER_BIG'];
      const littleJoker = new Card('JOKER', 'LITTLE');
      littleJoker.label = 'JOKER';
      littleJoker.value = 14.5;
      littleJoker.customArt = CARD_ART_MAP['JOKER_LITTLE'];
      this.cards.push(bigJoker, littleJoker);
    }
    this.shuffle();
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw() {
    if (this.cards.length === 0) return null;
    return this.cards.pop();
  }

  remaining() {
    return this.cards.length;
  }
}

// Utility to render card HTML element
function renderCardElement(card, options = {}) {
  const { faceDown = false, isHighlighted = false, isDimmed = false, extraClasses = '', cardSize = 'medium' } = options;
  const el = document.createElement('div');
  el.className = `poker-card ${cardSize} ${extraClasses} ${faceDown ? 'face-down' : ''} ${isHighlighted ? 'highlighted' : ''} ${isDimmed ? 'dimmed' : ''}`;
  
  if (card) {
    el.dataset.cardId = card.id;
    el.dataset.rank = card.rank;
    el.dataset.suit = card.suit;
  }

  if (faceDown || !card) {
    el.innerHTML = `
      <div class="card-inner">
        <div class="card-back">
          <div class="card-pattern">
            <span class="back-logo">????</span>
          </div>
        </div>
      </div>
    `;
    return el;
  }

  const isRed = card.suit === '?' || card.suit === '?';
  const suitClass = isRed ? 'red-suit' : 'black-suit';
  const isFamilyTheme = (activeDeckTheme === 'family_food');
  const food = SUIT_FOOD_MAP[card.suit] || { emoji: card.suit };
  const hasArt = isFamilyTheme && card.customArt;

  if (hasArt) {
    // Custom Illustrated Art Card (Face Card / Ace / Joker)
    el.innerHTML = `
      <div class="card-inner">
        <div class="card-front custom-art-card ${suitClass}" style="background-image: url('${card.customArt}');">
          <div class="corner top-left">
            <span class="card-rank">${card.label}</span>
            <span class="card-suit">${isFamilyTheme ? food.emoji : card.suit}</span>
          </div>
          <div class="corner bottom-right">
            <span class="card-rank">${card.label}</span>
            <span class="card-suit">${isFamilyTheme ? food.emoji : card.suit}</span>
          </div>
        </div>
      </div>
    `;
  } else if (isFamilyTheme) {
    // Numbered Food Card (2-10)
    el.innerHTML = `
      <div class="card-inner">
        <div class="card-front food-card ${suitClass}">
          <div class="corner top-left">
            <span class="card-rank">${card.label}</span>
            <span class="card-suit">${food.emoji}</span>
          </div>
          <div class="card-center">
            <span class="center-food">${food.emoji}</span>
          </div>
          <div class="corner bottom-right">
            <span class="card-rank">${card.label}</span>
            <span class="card-suit">${food.emoji}</span>
          </div>
        </div>
      </div>
    `;
  } else {
    // Standard Classic Casino Card
    el.innerHTML = `
      <div class="card-inner">
        <div class="card-front ${suitClass}">
          <div class="corner top-left">
            <span class="card-rank">${card.label}</span>
            <span class="card-suit">${card.suit}</span>
          </div>
          <div class="card-center">
            <span class="center-suit">${card.suit}</span>
          </div>
          <div class="corner bottom-right">
            <span class="card-rank">${card.label}</span>
            <span class="card-suit">${card.suit}</span>
          </div>
        </div>
      </div>
    `;
  }

  return el;
}

if (typeof module !== 'undefined') {
  module.exports = { Card, Deck, SUITS, RANKS, SUIT_COLORS, SUIT_FOOD_MAP, CARD_ART_MAP, renderCardElement, setDeckTheme, getDeckTheme };
}
