# 🃏 Poker Duel

A recreation of the 2-player poker game inspired by Facebook Messenger's "Play Together" card games.

## 🎯 Features

- **2-Player Head-to-Head Duel**:
  - Each player starts with **$1,000 in chips**.
  - **Escalating Blinds** every 3 rounds ($10/$20 -> $20/$40 -> $30/$60 -> $50/$100 -> $100/$200).
- **Unique 3-Card + Keep/Discard Drafting Gameplay**:
  - Each player is dealt **3 private hole cards**.
  - **5 Community Card Spaces** on the table.
  - Players take alternating turns drawing a card from the deck and deciding to **KEEP** (place into a community slot) or **DISCARD** (burn) until all 5 spaces are filled!
- **⚡ Real-Time Hand Strength Assist HUD**:
  - Live poker combination evaluator (e.g. *"Pair of Queens with Ace Kicker"*, *"Flush, King High"*).
  - **Glowing Yellow Strength Meter**: Shows exact tier strength on a 0-100% scale from High Card to Royal Flush.
  - **Gold Glowing Highlights**: Visual aura on the exact 5 cards that make up your best combination.
- **🌐 1-Click Online Multiplayer**:
  - Powered by **PeerJS / WebRTC** for instant browser-to-browser peer connections without needing to set up backend servers.
  - Generates shareable 6-character room codes and 1-click links (e.g. `?room=XYZ123`) so you can send the link to your dad and play together from any phone, tablet, or PC!
- **🤖 Practice Mode vs DadBot (AI)**:
  - Smart AI opponent with simulated human timing and drafting/betting intelligence.
- **👥 Pass & Play Mode**:
  - Play together on a single device screen.
- **🔊 Sound FX & Animations**:
  - Built-in Web Audio API sound effects (card deals, chip clinks, table knocks, winning fanfare).
  - Felt casino styling with responsive UI for mobile and desktop.

## 🚀 How to Run & Play

1. Open [`index.html`](file:///C:/Users/Utente/.gemini/antigravity/scratch/poker-duel/index.html) in any modern web browser (Chrome, Edge, Safari, Firefox).
2. Choose a mode:
   - **Play Online with Dad**: Generates a room code. Copy the link and send it to your dad!
   - **Practice vs DadBot**: Jump straight into a game against the AI.
   - **Pass & Play**: Take turns on the same device.

## 📁 Project Structure

- `index.html`: Main game arena, felt table, 5 card slots, assist HUD, and dialogs.
- `css/styles.css`: Dark casino felt styling, card visuals, yellow assist meter bar, and animations.
- `js/cards.js`: Deck management, 52-card standard deck, and SVG/CSS card rendering.
- `js/poker-evaluator.js`: Full 5-card & best-5-of-8 poker evaluator with tie-breaking and yellow strength calculation.
- `js/game-engine.js`: Duel state machine (blinds, dealing, keep/discard drafting, betting, showdown).
- `js/sound.js`: Web Audio procedural sound synthesizer (chips, cards, check, win fanfare).
- `js/ai-player.js`: AI player logic for practice mode.
- `js/network.js`: PeerJS WebRTC P2P multiplayer room manager.
- `js/app.js`: Main application controller.
- `test/index.html`: Automated test suite for poker evaluation logic.
