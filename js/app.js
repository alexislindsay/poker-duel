// js/app.js - Main Game Application Controller

class PokerDuelApp {
  constructor() {
    this.mode = 'AI'; // 'AI', 'ONLINE', 'PASS_PLAY'
    this.localPlayerId = 0; // 0 = Player 1 / Host, 1 = Player 2 / Guest
    this.isHost = true;
    this.latestState = null;
    
    this.engine = new GameEngine({
      onStateChange: (state) => {
        if (this.mode === 'ONLINE' && this.isHost) {
          this.network.send({ type: 'SYNC_STATE', state: this.engine.getSanitizedStateForPlayer(1) });
          this.renderGameState(this.engine.getSanitizedStateForPlayer(0));
        } else {
          this.renderGameState(state);
        }
        if (this.mode === 'AI') {
          this.triggerAIIfNeeded();
        }
      },
      onEvent: (event) => this.handleGameEvent(event)
    });

    this.ai = new DadBotAI('DadBot', 'balanced');
    this.network = new NetworkManager({
      onConnected: (info) => this.onNetworkConnected(info),
      onDisconnected: () => this.onNetworkDisconnected(),
      onMessage: (msg) => this.onNetworkMessage(msg),
      onError: (err) => this.onNetworkError(err)
    });

    this.initDOM();
    this.bindEvents();
    this.checkUrlParams();
  }

  getCurrentState() {
    if (this.mode === 'ONLINE' && !this.isHost && this.latestState) {
      return this.latestState;
    }
    return this.engine.getStateSnapshot();
  }

  initDOM() {
    // Buttons & Inputs
    this.btnFold = document.getElementById('btn-fold');
    this.btnCheckCall = document.getElementById('btn-check-call');
    this.btnBetRaise = document.getElementById('btn-bet-raise');
    this.btnAllIn = document.getElementById('btn-allin');
    this.betSlider = document.getElementById('bet-slider');

    // Drafting
    this.draftSpotlight = document.getElementById('draft-spotlight');
    this.draftPrompt = document.getElementById('draft-prompt');
    this.draftCardContainer = document.getElementById('draft-card-container');
    this.draftActionButtons = document.getElementById('draft-action-buttons');
    this.draftWaitingMessage = document.getElementById('draft-waiting-message');
    this.btnDraftKeep = document.getElementById('btn-draft-keep');
    this.btnDraftDiscard = document.getElementById('btn-draft-discard');

    // Player Elements
    this.p0CardsContainer = document.getElementById('player-cards');
    this.p1CardsContainer = document.getElementById('opponent-cards');
    this.p0Chips = document.getElementById('player-chips');
    this.p1Chips = document.getElementById('opponent-chips');
    this.p0Name = document.getElementById('player-name');
    this.p1Name = document.getElementById('opponent-name');
    this.p0BetBadge = document.getElementById('player-bet-badge');
    this.p1BetBadge = document.getElementById('opponent-bet-badge');
    this.p0Pod = document.getElementById('player-info-card');
    this.p1Pod = document.getElementById('opponent-info-card');

    // Table & Assist
    this.potDisplay = document.getElementById('pot-amount');
    this.roundBlindsInfo = document.getElementById('round-blinds-info');
    this.assistHandName = document.getElementById('assist-hand-name');
    this.meterSegments = document.querySelectorAll('.meter-segment');
    this.showdownBanner = document.getElementById('showdown-banner');
    this.showdownBannerTitle = document.getElementById('showdown-banner-title');
    this.showdownBannerDesc = document.getElementById('showdown-banner-desc');
    this.btnShowdownNext = document.getElementById('btn-showdown-next');

    // Modals
    this.modalWelcome = document.getElementById('modal-welcome');
    this.modalOnline = document.getElementById('modal-online-room');
    this.modalSummary = document.getElementById('modal-round-summary');
    this.modalRules = document.getElementById('modal-rules');
    this.modalGameOver = document.getElementById('modal-game-over');
    this.gameOverTitle = document.getElementById('game-over-title');
    this.gameOverDesc = document.getElementById('game-over-desc');
    this.gameOverRounds = document.getElementById('game-over-rounds');
    this.btnRematch = document.getElementById('btn-rematch');
    this.btnGameOverMenu = document.getElementById('btn-game-over-menu');

    // Room info
    this.roomBadge = document.getElementById('room-badge');
    this.roomBadgeText = document.getElementById('room-badge-text');
    this.btnShareRoom = document.getElementById('btn-share-room');
    this.displayRoomCode = document.getElementById('display-room-code');
    this.roomStatusMessage = document.getElementById('room-status-message');
    this.inputJoinCode = document.getElementById('input-join-code');
  }

  bindEvents() {
    // Mode Buttons
    document.getElementById('btn-start-ai').addEventListener('click', () => {
      this.startAIMode();
    });

    document.getElementById('btn-start-pass').addEventListener('click', () => {
      this.startPassAndPlay();
    });

    document.getElementById('btn-start-online').addEventListener('click', () => {
      this.openHostRoomModal();
    });

    // Room actions
    document.getElementById('btn-close-room-modal').addEventListener('click', () => {
      this.modalOnline.classList.remove('active');
    });

    document.getElementById('btn-copy-code').addEventListener('click', () => {
      this.copyRoomLink();
    });

    document.getElementById('btn-confirm-join').addEventListener('click', () => {
      const code = this.inputJoinCode.value.trim();
      if (code) this.joinOnlineRoom(code);
    });

    this.btnShareRoom.addEventListener('click', () => {
      this.modalOnline.classList.add('active');
    });

    // Top Controls
    document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
      const enabled = sounds.toggleSound();
      e.target.textContent = enabled ? '🔊' : '🔇';
      this.showToast(enabled ? 'Sound Enabled' : 'Sound Muted');
    });

    document.getElementById('btn-show-rules').addEventListener('click', () => {
      this.modalRules.classList.add('active');
    });

    document.getElementById('btn-close-rules').addEventListener('click', () => {
      this.modalRules.classList.remove('active');
    });
    document.getElementById('btn-dismiss-rules').addEventListener('click', () => {
      this.modalRules.classList.remove('active');
    });

    document.getElementById('btn-main-menu').addEventListener('click', () => {
      this.modalWelcome.classList.add('active');
    });

    // Betting Action Buttons
    this.btnFold.addEventListener('click', () => this.handleAction('fold'));
    this.btnCheckCall.addEventListener('click', () => {
      const state = this.getCurrentState();
      const localPlayer = state.players[this.localPlayerId];
      const callAmount = state.currentBet - localPlayer.currentRoundBet;
      if (callAmount <= 0) {
        this.handleAction('check');
      } else {
        this.handleAction('call', callAmount);
      }
    });

    this.btnBetRaise.addEventListener('click', () => {
      const amount = parseInt(this.betSlider.value, 10);
      this.handleAction('raise', amount);
    });

    this.btnAllIn.addEventListener('click', () => {
      const state = this.getCurrentState();
      const localPlayer = state.players[this.localPlayerId];
      const maxAmount = localPlayer.chips + localPlayer.currentRoundBet;
      this.handleAction('raise', maxAmount);
    });

    // Bet Slider & Preset Chips
    this.betSlider.addEventListener('input', () => {
      this.updateBetRaiseButtonText();
    });

    document.querySelectorAll('.preset-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const valType = e.target.dataset.val;
        const state = this.getCurrentState();
        const localPlayer = state.players[this.localPlayerId];
        const min = Math.max(state.minRaise || state.currentBigBlind, state.currentBet + state.currentBigBlind);
        const max = localPlayer.chips + localPlayer.currentRoundBet;

        let target = min;
        if (valType === 'min') target = min;
        else if (valType === '2bb') target = state.currentBigBlind * 2;
        else if (valType === '3bb') target = state.currentBigBlind * 3;
        else if (valType === 'pot') target = Math.min(max, state.pot + (state.currentBet * 2));
        else if (valType === 'max') target = max;

        this.betSlider.value = Math.min(max, Math.max(min, target));
        this.updateBetRaiseButtonText();
      });
    });

    // Drafting Decision Buttons
    this.btnDraftKeep.addEventListener('click', () => {
      sounds.playCardDeal();
      this.handleDraftDecision('keep');
    });

    this.btnDraftDiscard.addEventListener('click', () => {
      sounds.playCardDiscard();
      this.handleDraftDecision('discard');
    });

    // Next Round & Rematch Buttons (Both Modal & On-Table Banner)
    const advanceToNextRound = () => {
      this.modalSummary.classList.remove('active');
      if (this.showdownBanner) this.showdownBanner.style.display = 'none';

      if (this.engine.phase === GAME_PHASES.GAME_OVER || this.engine.players[0].chips <= 0 || this.engine.players[1].chips <= 0) {
        this.startRematch();
        return;
      }

      if (this.mode === 'ONLINE' && !this.isHost) {
        this.network.send({ type: 'REQUEST_NEXT_ROUND' });
      } else {
        this.engine.startNewRound();
      }
    };

    document.getElementById('btn-next-round').addEventListener('click', advanceToNextRound);
    if (this.btnShowdownNext) {
      this.btnShowdownNext.addEventListener('click', advanceToNextRound);
    }

    // Rematch & Main Menu from Game Over modal
    if (this.btnRematch) {
      this.btnRematch.addEventListener('click', () => {
        this.startRematch();
      });
    }

    if (this.btnGameOverMenu) {
      this.btnGameOverMenu.addEventListener('click', () => {
        this.returnToMainMenu();
      });
    }
  }

  checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const room = urlParams.get('room');
    if (room) {
      this.inputJoinCode.value = room;
      this.joinOnlineRoom(room);
    }
  }

  /* ---------------- Mode Handlers ---------------- */

  startAIMode() {
    this.mode = 'AI';
    this.localPlayerId = 0;
    this.isHost = true;
    this.engine.players[0].name = 'You';
    this.engine.players[1].name = 'DadBot 🤖';
    this.p0Name.textContent = 'You';
    this.p1Name.textContent = 'DadBot 🤖';
    this.modalWelcome.classList.remove('active');
    this.roomBadge.style.display = 'none';
    this.btnShareRoom.style.display = 'none';

    this.engine.resetGame();
    this.engine.startNewRound();
    this.showToast('Game Started vs DadBot!');
  }

  startPassAndPlay() {
    this.mode = 'PASS_PLAY';
    this.localPlayerId = 0;
    this.engine.players[0].name = 'Player 1';
    this.engine.players[1].name = 'Player 2';
    this.p0Name.textContent = 'Player 1';
    this.p1Name.textContent = 'Player 2';
    this.modalWelcome.classList.remove('active');
    this.roomBadge.style.display = 'none';
    this.btnShareRoom.style.display = 'none';

    this.engine.resetGame();
    this.engine.startNewRound();
    this.showToast('Pass & Play Mode Started!');
  }

  async openHostRoomModal() {
    this.modalWelcome.classList.remove('active');
    this.modalOnline.classList.add('active');
    this.roomStatusMessage.textContent = '⏳ Creating private room...';

    try {
      const code = await this.network.createRoom();
      this.mode = 'ONLINE';
      this.isHost = true;
      this.localPlayerId = 0;
      this.engine.players[0].name = 'You (Host)';
      this.engine.players[1].name = 'Dad';
      this.displayRoomCode.textContent = code;
      this.roomStatusMessage.textContent = '⏳ Waiting for your dad to join with this link...';
    } catch (err) {
      this.roomStatusMessage.textContent = `❌ Error: ${err.message}`;
    }
  }

  async joinOnlineRoom(code) {
    this.modalWelcome.classList.remove('active');
    this.modalOnline.classList.add('active');
    this.roomStatusMessage.textContent = `⏳ Connecting to room ${code}...`;

    try {
      await this.network.joinRoom(code);
      this.mode = 'ONLINE';
      this.isHost = false;
      this.localPlayerId = 1;
      this.engine.players[0].name = 'Host';
      this.engine.players[1].name = 'You';
      this.p0Name.textContent = 'Host';
      this.p1Name.textContent = 'You';
      this.roomStatusMessage.textContent = '✅ Connected to room!';
    } catch (err) {
      this.roomStatusMessage.textContent = `❌ Failed to join: ${err.message}`;
    }
  }

  copyRoomLink() {
    const code = this.network.roomId || this.displayRoomCode.textContent;
    const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('📋 Room link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this room link:', url);
    });
  }

  /* ---------------- Network P2P Sync ---------------- */

  onNetworkConnected({ isHost, roomId }) {
    this.modalOnline.classList.remove('active');
    this.roomBadge.style.display = 'flex';
    this.roomBadgeText.innerHTML = `Room: <strong>${roomId}</strong>`;
    this.btnShareRoom.style.display = 'flex';
    this.showToast('✅ Connected to opponent!');

    if (isHost) {
      this.engine.resetGame();
      this.engine.startNewRound();
      this.network.send({ type: 'SYNC_STATE', state: this.engine.getSanitizedStateForPlayer(1) });
    } else {
      this.network.send({ type: 'REQUEST_SYNC' });
    }
  }

  onNetworkDisconnected() {
    this.showToast('⚠️ Opponent disconnected.');
  }

  onNetworkMessage(msg) {
    if (this.isHost) {
      // Host receives guest actions
      if (msg.type === 'ACTION_BET') {
        this.engine.handleBettingAction(1, msg.action, msg.amount);
      } else if (msg.type === 'ACTION_DRAFT') {
        this.engine.handleDraftDecision(1, msg.decision);
      } else if (msg.type === 'REQUEST_NEXT_ROUND') {
        this.engine.startNewRound();
      } else if (msg.type === 'REQUEST_REMATCH') {
        this.engine.startNewDuel();
      } else if (msg.type === 'REQUEST_SYNC') {
        this.network.send({ type: 'SYNC_STATE', state: this.engine.getSanitizedStateForPlayer(1) });
      }
    } else {
      // Guest receives state sync from host
      if (msg.type === 'SYNC_STATE') {
        this.applySyncedState(msg.state);
      }
    }
  }

  onNetworkError(err) {
    console.error('Network Error', err);
  }

  applySyncedState(state) {
    this.latestState = state;
    this.renderGameState(state);
  }

  /* ---------------- Gameplay Actions ---------------- */

  handleAction(action, amount = 0) {
    const activePlayerId = (this.mode === 'PASS_PLAY') ? this.engine.activeTurnPlayer : this.localPlayerId;

    if (this.mode === 'ONLINE' && !this.isHost) {
      this.network.send({ type: 'ACTION_BET', action, amount });
    } else {
      this.engine.handleBettingAction(activePlayerId, action, amount);
      this.triggerAIIfNeeded();
    }
  }

  handleDraftDecision(decision) {
    const activeDraftPlayerId = (this.mode === 'PASS_PLAY') ? this.engine.activeDraftPlayer : this.localPlayerId;

    if (this.mode === 'ONLINE' && !this.isHost) {
      this.network.send({ type: 'ACTION_DRAFT', decision });
    } else {
      this.engine.handleDraftDecision(activeDraftPlayerId, decision);
      this.triggerAIIfNeeded();
    }
  }

  triggerAIIfNeeded() {
    if (this.mode !== 'AI') return;
    if (this.aiTimeout) clearTimeout(this.aiTimeout);

    this.aiTimeout = setTimeout(() => {
      const state = this.engine.getStateSnapshot();

      // Check if it's AI's turn to draft
      if (state.phase === GAME_PHASES.DRAFTING && state.activeDraftPlayer === 1 && state.currentDrawnCard) {
        const decision = this.ai.decideDraft(
          state.currentDrawnCard,
          this.engine.players[1].holeCards,
          state.communityCards
        );
        if (decision === 'keep') sounds.playCardDeal();
        else sounds.playCardDiscard();

        this.engine.handleDraftDecision(1, decision);
        return;
      }

      // Check if it's AI's turn to bet
      if ((state.phase === GAME_PHASES.PRE_DRAFT_BETTING || state.phase === GAME_PHASES.CARD_BETTING) && state.activeTurnPlayer === 1) {
        const decision = this.ai.decideBet(state, 1);
        this.engine.handleBettingAction(1, decision.action, decision.amount || 0);
      }
    }, 750);
  }

  handleGameEvent(event) {
    switch (event.type) {
      case 'ROUND_STARTED':
        sounds.playCardDeal();
        this.showToast(`Round ${event.round} Started!`);
        break;
      case 'CARD_BETTING_STARTED':
        sounds.playChipSound();
        this.showToast(`Space ${event.communityCount} Placed — Betting Turn!`);
        break;
      case 'ACTION_CHECK':
        sounds.playCheckSound();
        break;
      case 'ACTION_CALL':
      case 'ACTION_RAISE':
        sounds.playChipSound();
        break;
      case 'SHOWDOWN_RESULT':
        sounds.playWin();
        if (typeof confetti === 'function') {
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
        this.showRoundSummary(event);
        break;
      case 'HAND_WON_FOLD':
        sounds.playWin();
        this.showRoundSummary({
          reason: this.engine.winReason,
          winner: this.engine.players[event.winnerId]
        });
        break;
      case 'DUEL_GAME_OVER':
        sounds.playWin();
        if (typeof confetti === 'function') {
          confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 } });
        }
        this.showGameOver(event);
        break;
    }

    // If Host in online mode, broadcast sanitized state
    if (this.mode === 'ONLINE' && this.isHost) {
      this.network.send({ type: 'SYNC_STATE', state: this.engine.getSanitizedStateForPlayer(1) });
    }
  }

  showRoundSummary(event) {
    // If duel is over, let showGameOver handle the announcement
    if (this.engine.phase === GAME_PHASES.GAME_OVER) return;

    const isLocalWinner = (event.winner && event.winner.id === this.localPlayerId);
    const wonAmt = this.engine.potWonAmount || this.engine.pot;
    const titleText = isLocalWinner ? `YOU WON $${wonAmt}!` : `${event.winner ? event.winner.name.toUpperCase() : 'ROUND OVER'} WON $${wonAmt}!`;
    const descText = event.reason || this.engine.winReason;

    document.getElementById('round-winner-title').textContent = isLocalWinner ? `🏆 ${titleText}` : `👑 ${titleText}`;
    document.getElementById('round-winner-desc').textContent = descText;

    if (this.showdownBanner) {
      this.showdownBannerTitle.textContent = titleText;
      this.showdownBannerDesc.textContent = descText;
      this.btnShowdownNext.textContent = '▶ NEXT HAND';
      this.showdownBanner.style.display = 'flex';
    }

    const p0 = this.engine.players[0];
    const p1 = this.engine.players[1];

    document.getElementById('summary-p0-name').textContent = p0.name;
    document.getElementById('summary-p0-eval').textContent = p0.handEval ? p0.handEval.name : '';
    document.getElementById('summary-p1-name').textContent = p1.name;
    document.getElementById('summary-p1-eval').textContent = p1.handEval ? p1.handEval.name : '';
  }

  showGameOver(event) {
    const isLocalWinner = (event.winner && event.winner.id === this.localPlayerId);
    const winnerName = event.winner ? event.winner.name : 'Player';

    if (isLocalWinner) {
      this.gameOverTitle.textContent = '👑 YOU WON THE DUEL!';
      this.gameOverDesc.textContent = 'Congratulations! You cleaned out your opponent and won all $2,000!';
    } else {
      this.gameOverTitle.textContent = `👑 ${winnerName.toUpperCase()} WON THE DUEL!`;
      this.gameOverDesc.textContent = `${winnerName} collected all $2,000 in chips! Ready for a rematch?`;
    }

    this.gameOverRounds.textContent = event.rounds || this.engine.roundNumber;
    this.modalGameOver.classList.add('active');

    if (this.showdownBanner) {
      this.showdownBannerTitle.textContent = this.gameOverTitle.textContent;
      this.showdownBannerDesc.textContent = this.gameOverDesc.textContent;
      this.btnShowdownNext.textContent = '🔄 PLAY REMATCH';
      this.showdownBanner.style.display = 'flex';
    }
  }

  startRematch() {
    this.modalGameOver.classList.remove('active');
    this.modalSummary.classList.remove('active');
    if (this.showdownBanner) this.showdownBanner.style.display = 'none';
    this.btnShowdownNext.textContent = '▶ NEXT HAND';

    if (this.mode === 'ONLINE' && !this.isHost) {
      this.network.send({ type: 'REQUEST_REMATCH' });
    } else {
      this.engine.startNewDuel();
      if (this.mode === 'ONLINE' && this.isHost) {
        this.network.send({ type: 'SYNC_STATE', state: this.engine.getSanitizedStateForPlayer(1) });
      }
    }
    this.showToast('New Duel Started — Good Luck!');
  }

  returnToMainMenu() {
    this.modalGameOver.classList.remove('active');
    this.modalSummary.classList.remove('active');
    if (this.showdownBanner) this.showdownBanner.style.display = 'none';
    this.modalWelcome.classList.add('active');
  }

  /* ---------------- UI Rendering ---------------- */

  renderGameState(state) {
    // 1. Showdown / Round Over / Game Over Banner
    if (this.showdownBanner) {
      if (state.phase === GAME_PHASES.GAME_OVER) {
        const isLocalWinner = (state.gameWinner && (state.gameWinner.id === this.localPlayerId || state.gameWinner.name === localPlayer.name));
        const winnerName = state.gameWinner ? state.gameWinner.name : 'Champion';
        this.showdownBannerTitle.textContent = isLocalWinner ? '👑 YOU WON THE DUEL!' : `👑 ${winnerName.toUpperCase()} WON THE DUEL!`;
        this.showdownBannerDesc.textContent = state.winReason || 'All $2,000 in chips collected!';
        this.btnShowdownNext.textContent = '🔄 PLAY REMATCH';
        this.showdownBanner.style.display = 'flex';
      } else if (state.phase === GAME_PHASES.ROUND_OVER || state.phase === GAME_PHASES.SHOWDOWN) {
        const isLocalWinner = (state.roundWinner && (state.roundWinner.id === this.localPlayerId || state.roundWinner.name === localPlayer.name));
        const wonAmt = state.potWonAmount || state.pot;
        const winnerName = state.roundWinner ? (state.roundWinner.name ? state.roundWinner.name.toUpperCase() : 'ROUND OVER') : 'ROUND OVER';
        const titleText = isLocalWinner ? `YOU WON $${wonAmt}!` : `${winnerName} WON $${wonAmt}!`;
        this.showdownBannerTitle.textContent = isLocalWinner ? `🏆 ${titleText}` : `👑 ${titleText}`;
        this.showdownBannerDesc.textContent = state.winReason || '';
        this.btnShowdownNext.textContent = '▶ NEXT HAND';
        this.showdownBanner.style.display = 'flex';
      } else {
        this.showdownBanner.style.display = 'none';
      }
    }

    // 2. Pot & Blinds
    this.potDisplay.textContent = `$${state.pot}`;
    this.roundBlindsInfo.textContent = `Round ${state.roundNumber} • Blinds: $${state.blindLevel.small} / $${state.blindLevel.big}`;

    // 2. Player info (Bottom Pod = Local Player, Top Pod = Opponent)
    const localPlayer = state.players[this.localPlayerId];
    const opponentPlayer = state.players[1 - this.localPlayerId];

    this.p0Chips.textContent = `💰 $${localPlayer.chips}`;
    this.p1Chips.textContent = `💰 $${opponentPlayer.chips}`;
    this.p0Name.textContent = localPlayer.name;
    this.p1Name.textContent = opponentPlayer.name;

    this.p0BetBadge.style.visibility = localPlayer.currentRoundBet > 0 ? 'visible' : 'hidden';
    this.p0BetBadge.textContent = `Bet: $${localPlayer.currentRoundBet}`;
    this.p1BetBadge.style.visibility = opponentPlayer.currentRoundBet > 0 ? 'visible' : 'hidden';
    this.p1BetBadge.textContent = `Bet: $${opponentPlayer.currentRoundBet}`;

    // Active Pod Glow
    const isMyTurn = (state.activeTurnPlayer === this.localPlayerId) || (state.activeDraftPlayer === this.localPlayerId);
    const isOpponentTurn = (state.activeTurnPlayer === (1 - this.localPlayerId)) || (state.activeDraftPlayer === (1 - this.localPlayerId));
    this.p0Pod.classList.toggle('active-turn', isMyTurn);
    this.p1Pod.classList.toggle('active-turn', isOpponentTurn);

    // 3. Render Community Slots (5 spaces)
    for (let i = 0; i < 5; i++) {
      const slotEl = document.getElementById(`slot-${i}`);
      slotEl.innerHTML = '';
      if (state.communityCards[i]) {
        slotEl.classList.add('filled');
        const cardObj = state.communityCards[i];
        // Check if highlighted in best 5
        const isBestCard = localPlayer.handEval && localPlayer.handEval.best5Cards && localPlayer.handEval.best5Cards.some(c => c && c.id === cardObj.id);
        const cardEl = renderCardElement(cardObj, { isHighlighted: isBestCard, cardSize: 'medium' });
        slotEl.appendChild(cardEl);
      } else {
        slotEl.classList.remove('filled');
        slotEl.innerHTML = `<span class="slot-number">${i + 1}</span>`;
      }
    }

    // 4. Render Hole Cards (Bottom = Local Player, Top = Opponent)
    this.renderHoleCards(state);

    // 5. Render 10-Tier Yellow Hand Strength Assist HUD
    const activeEval = localPlayer.handEval;
    if (activeEval) {
      this.assistHandName.textContent = activeEval.name;
      const currentLevel = activeEval.level || 1;
      if (this.meterSegments) {
        this.meterSegments.forEach(seg => {
          const segLevel = parseInt(seg.dataset.level, 10);
          seg.classList.toggle('active', segLevel <= currentLevel);
          seg.classList.toggle('current-tier', segLevel === currentLevel);
        });
      }
    }

    // 6. Render Drafting Spotlight (SECRET: Only the drafting player sees the card face-up!)
    if (state.phase === GAME_PHASES.DRAFTING && state.currentDrawnCard) {
      this.draftSpotlight.style.display = 'flex';
      this.draftCardContainer.innerHTML = '';

      const isMyDraftTurn = (this.mode === 'PASS_PLAY') || (state.activeDraftPlayer === this.localPlayerId);
      const activeDrafterName = state.players[state.activeDraftPlayer].name;

      if (isMyDraftTurn) {
        // Active drafter sees card face-up with Keep / Discard controls
        const cardEl = renderCardElement(state.currentDrawnCard, { cardSize: 'large', faceDown: false });
        this.draftCardContainer.appendChild(cardEl);
        this.draftPrompt.textContent = 'YOUR DRAFT TURN: KEEP OR DISCARD?';
        this.draftActionButtons.style.display = 'flex';
        this.draftWaitingMessage.style.display = 'none';
      } else {
        // Opponent only sees face-down card! Never revealed if discarded!
        const cardEl = renderCardElement(null, { cardSize: 'large', faceDown: true });
        this.draftCardContainer.appendChild(cardEl);
        this.draftPrompt.textContent = `${activeDrafterName.toUpperCase()} IS INSPECTING A CARD...`;
        this.draftActionButtons.style.display = 'none';
        this.draftWaitingMessage.style.display = 'flex';
        document.getElementById('draft-waiting-text').textContent = `${activeDrafterName} is deciding to keep or discard...`;
      }
    } else {
      this.draftSpotlight.style.display = 'none';
    }

    // 7. Update Betting Action Controls
    this.updateActionControls(state);
  }

  renderHoleCards(state) {
    const isShowdown = state.phase === GAME_PHASES.SHOWDOWN || state.phase === GAME_PHASES.ROUND_OVER;
    const localPlayer = state.players[this.localPlayerId];
    const opponentPlayer = state.players[1 - this.localPlayerId];

    // Local Player (Bottom Pod - ALWAYS Visible to Local Player)
    this.p0CardsContainer.innerHTML = '';
    localPlayer.holeCards.forEach(card => {
      const isBest = localPlayer.handEval && localPlayer.handEval.best5Cards && localPlayer.handEval.best5Cards.some(c => c && c.id === card.id);
      const cardEl = renderCardElement(card, { isHighlighted: isBest, cardSize: 'medium', faceDown: false });
      this.p0CardsContainer.appendChild(cardEl);
    });

    // Opponent (Top Pod - FACE DOWN during gameplay, revealed only at Showdown!)
    this.p1CardsContainer.innerHTML = '';
    opponentPlayer.holeCards.forEach(card => {
      const showFace = isShowdown || (this.mode === 'PASS_PLAY');
      const isBest = isShowdown && opponentPlayer.handEval && opponentPlayer.handEval.best5Cards && opponentPlayer.handEval.best5Cards.some(c => c && card && c.id === card.id);
      const cardEl = renderCardElement(card, { faceDown: !showFace, isHighlighted: isBest, cardSize: 'medium' });
      this.p1CardsContainer.appendChild(cardEl);
    });
  }

  updateActionControls(state) {
    const isBettingPhase = (state.phase === GAME_PHASES.PRE_DRAFT_BETTING || state.phase === GAME_PHASES.CARD_BETTING);
    const isMyTurn = isBettingPhase && (this.mode === 'PASS_PLAY' || state.activeTurnPlayer === this.localPlayerId);

    const activePlayer = state.players[this.localPlayerId];
    const callAmount = state.currentBet - activePlayer.currentRoundBet;

    this.btnFold.disabled = !isMyTurn;
    this.btnCheckCall.disabled = !isMyTurn;
    this.btnBetRaise.disabled = !isMyTurn || activePlayer.chips <= 0;
    this.btnAllIn.disabled = !isMyTurn || activePlayer.chips <= 0;

    // Button Labels
    if (callAmount <= 0) {
      this.btnCheckCall.textContent = 'CHECK';
    } else {
      this.btnCheckCall.textContent = `CALL $${Math.min(activePlayer.chips, callAmount)}`;
    }

    // Slider bounds
    const min = Math.max(state.minRaise || state.currentBigBlind, state.currentBet + state.currentBigBlind);
    const max = activePlayer.chips + activePlayer.currentRoundBet;

    this.betSlider.min = min;
    this.betSlider.max = Math.max(min, max);
    if (parseInt(this.betSlider.value, 10) < min) {
      this.betSlider.value = min;
    }
    this.updateBetRaiseButtonText();
  }

  updateBetRaiseButtonText() {
    const val = parseInt(this.betSlider.value, 10);
    const state = this.getCurrentState();
    const actionName = state.currentBet > 0 ? 'RAISE TO' : 'BET';
    this.btnBetRaise.textContent = `${actionName} $${val}`;
  }

  showToast(msg) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }
}

// Launch application on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new PokerDuelApp();
});
