// js/cards.js - Card definitions, Deck management, and SVG/HTML Card Rendering

const SUITS = [
  { name: 'spades', symbol: '♠', color: '#1a1a2e', letter: 'S' },
  { name: 'hearts', symbol: '♥', color: '#e63946', letter: 'H' },
  { name: 'diamonds', symbol: '♦', color: '#3a86ff', letter: 'D' }, // or red #e63946
  { name: 'clubs', symbol: '♣', color: '#2a9d8f', letter: 'C' }
];

// Standard 4-color deck suits for great readability
const SUIT_COLORS = {
  '♠': '#181824', // Spades: Obsidian Black
  '♥': '#e63946', // Hearts: Crimson Red
  '♦': '#2563eb', // Diamonds: Sapphire Blue (4-color clarity) or Red
  '♣': '#16a34a'  // Clubs: Emerald Green
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
  { rank: 'J', value: 11, label: 'J' },
  { rank: 'Q', value: 12, label: 'Q' },
  { rank: 'K', value: 13, label: 'K' },
  { rank: 'A', value: 14, label: 'A' }
];

class Card {
  constructor(rank, suit) {
    this.rank = rank; // '2'-'9', 'T', 'J', 'Q', 'K', 'A'
    this.suit = suit; // '♠', '♥', '♦', '♣'
    this.value = RANKS.find(r => r.rank === rank).value;
    this.label = RANKS.find(r => r.rank === rank).label;
    this.id = `${rank}${suit}`;
    this.color = (suit === '♥' || suit === '♦') ? '#e63946' : '#1e293b';
    this.fourColor = SUIT_COLORS[suit] || this.color;
  }

  toString() {
    return `${this.label}${this.suit}`;
  }

  toShortString() {
    return `${this.rank}${this.suit}`;
  }
}

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }

  reset() {
    this.cards = [];
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    for (const s of suits) {
      for (const r of ranks) {
        this.cards.push(new Card(r, s));
      }
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
            <span class="back-logo">♠♥♦♣</span>
          </div>
        </div>
      </div>
    `;
    return el;
  }

  const isRed = card.suit === '♥' || card.suit === '♦';
  const suitClass = isRed ? 'red-suit' : 'black-suit';

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

  return el;
}

if (typeof module !== 'undefined') {
  module.exports = { Card, Deck, SUITS, RANKS, SUIT_COLORS, renderCardElement };
}
