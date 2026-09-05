// js/app.js - Family Card Arcade Unified Multi-Game Controller

const GAME_TYPES = {
  POKER_DUEL: 'POKER_DUEL',
  GO_FISH: 'GO_FISH',
  CRAZY_EIGHTS: 'CRAZY_EIGHTS',
  SPADES: 'SPADES'
};

class FamilyCardArcadeApp {
  constructor() {
    this.activeGame = GAME_TYPES.POKER_DUEL;
    this.mode = 'AI'; // 'AI', 'ONLINE', 'PASS_PLAY'
    this.localPlayerId = 0; // 0 = P1/Host, 1 = P2/Guest
    this.isHost = true;
    this.latestRemoteState = null;
    this.pendingCrazy8CardId = null;

    // Initialize Card Theme
    this.currentTheme = localStorage.getItem('poker_duel_deck_theme') || 'family_food';
    setDeckTheme(this.currentTheme);

    // Instantiate Engines
    this.initEngines();

    // Networking
    this.network = new NetworkManager({
      onConnected: (info) => this.onNetworkConnected(info),
      onDisconnected: () => this.onNetworkDisconnected(),
      onMessage: (msg) => this.onNetworkMessage(msg),
      onError: (err) => this.onNetworkError(err)
    });

    // AI Bots
    this.pokerAI = new DadBotAI('Dad', 'balanced');

    this.initDOM();
    this.bindEvents();
    this.checkUrlParams();
  }

  initEngines() {
    // 1. Poker Duel Engine
    this.pokerEngine = new GameEngine({
      onStateChange: (state) => this.onEngineStateChange('POKER_DUEL', state),
      onEvent: (event) => this.onEngineEvent('POKER_DUEL', event)
    });

    // 2. Go Fish Engine
    this.goFishEngine = new GoFishEngine({
      onStateChange: (state) => this.onEngineStateChange('GO_FISH', state),
      onEvent: (event) => this.onEngineEvent('GO_FISH', event)
    });

    // 3. Crazy 8s Engine
    this.crazy8Engine = new CrazyEightsEngine({
      onStateChange: (state) => this.onEngineStateChange('CRAZY_EIGHTS', state),
      onEvent: (event) => this.onEngineEvent('CRAZY_EIGHTS', event)
    });

    // 4. Spades Engine
    this.spadesEngine = new SpadesEngine({
      onStateChange: (state) => this.onEngineStateChange('SPADES', state),
      onEvent: (event) => this.onEngineEvent('SPADES', event)
    });
  }

  getCurrentEngine() {
    switch (this.activeGame) {
      case GAME_TYPES.GO_FISH: return this.goFishEngine;
      case GAME_TYPES.CRAZY_EIGHTS: return this.crazy8Engine;
      case GAME_TYPES.SPADES: return this.spadesEngine;
      default: return this.pokerEngine;
    }
  }

  getCurrentState() {
    if (this.mode === 'ONLINE' && !this.isHost && this.latestRemoteState) {
      return this.latestRemoteState;
    }
    return this.getCurrentEngine().getStateSnapshot();
  }

  /* =========================================================================
     DOM INITIALIZATION & BINDINGS
     ========================================================================= */
  initDOM() {
    // Header & Navigation
    this.headerGameIcon = document.getElementById('header-game-icon');
    this.headerGameTitle = document.getElementById('header-game-title');
    this.btnToggleTheme = document.getElementById('btn-toggle-theme');
    this.btnToggleSound = document.getElementById('btn-toggle-sound');
    this.btnShowRules = document.getElementById('btn-show-rules');
    this.btnMainMenu = document.getElementById('btn-main-menu');
    this.btnShareRoom = document.getElementById('btn-share-room');
    this.roomBadge = document.getElementById('room-badge');
    this.roomBadgeText = document.getElementById('room-badge-text');

    // Poker Action Controls
    this.btnFold = document.getElementById('btn-fold');
    this.btnCheckCall = document.getElementById('btn-check-call');
    this.btnBetRaise = document.getElementById('btn-bet-raise');
    this.btnAllIn = document.getElementById('btn-allin');
    this.betSlider = document.getElementById('bet-slider');
    this.actionControlsContainer = document.getElementById('action-controls');

    // Drafting Spotlight
    this.draftSpotlight = document.getElementById('draft-spotlight');
    this.draftPrompt = document.getElementById('draft-prompt');
    this.draftCardContainer = document.getElementById('draft-card-container');
    this.draftActionButtons = document.getElementById('draft-action-buttons');
    this.draftWaitingMessage = document.getElementById('draft-waiting-message');
    this.btnDraftKeep = document.getElementById('btn-draft-keep');
    this.btnDraftDiscard = document.getElementById('btn-draft-discard');

    // Players Pods
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

    // Table Areas
    this.mainTable = document.getElementById('main-table');
    this.potDisplayWrapper = document.getElementById('pot-display-wrapper');
    this.potAmount = document.getElementById('pot-amount');
    this.potLabel = document.getElementById('pot-label');
    this.pokerCommunityContainer = document.getElementById('poker-community-container');
    this.centerArcadeStage = document.getElementById('center-arcade-stage');
    this.roundBlindsInfo = document.getElementById('round-blinds-info');
    this.handStrengthMeter = document.getElementById('poker-assist-hud');
    this.assistHandName = document.getElementById('assist-hand-name');
    this.meterSegments = document.querySelectorAll('.meter-segment');
    this.showdownBanner = document.getElementById('showdown-banner');
    this.showdownBannerTitle = document.getElementById('showdown-banner-title');
    this.showdownBannerDesc = document.getElementById('showdown-banner-desc');
    this.btnShowdownNext = document.getElementById('btn-showdown-next');
    this.bustedBanner = document.getElementById('busted-banner');

    // Modals
    this.modalWelcome = document.getElementById('modal-welcome');
    this.modalOnline = document.getElementById('modal-online-room');
    this.modalRules = document.getElementById('modal-rules');
    this.modalGameOver = document.getElementById('modal-game-over');
    this.modalGoFishAsk = document.getElementById('modal-gofish-ask');
    this.modalGoFishRespond = document.getElementById('modal-gofish-respond');
    this.modalCrazy8Suit = document.getElementById('modal-wild-suit') || document.getElementById('modal-crazy8-suit');
    this.modalSpadesBid = document.getElementById('modal-spades-bid');

    // Game Over Elements
    this.gameOverTitle = document.getElementById('game-over-title');
    this.gameOverDesc = document.getElementById('game-over-desc');
    this.btnRematch = document.getElementById('btn-rematch');
    this.btnGameOverMenu = document.getElementById('btn-game-over-menu');
  }

  bindEvents() {
    // Theme toggle
    if (this.btnToggleTheme) {
      this.btnToggleTheme.addEventListener('click', () => {
        this.currentTheme = this.currentTheme === 'family_food' ? 'classic' : 'family_food';
        setDeckTheme(this.currentTheme);
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.showToast(`Switched to ${this.currentTheme === 'family_food' ? 'Family Food & The Johns 🍔' : 'Classic Vegas ♠️'} Deck!`);
        this.render();
      });
    }

    // Sound toggle
    if (this.btnToggleSound) {
      this.btnToggleSound.addEventListener('click', () => {
        const enabled = typeof SoundFX !== 'undefined' ? SoundFX.toggle() : true;
        this.btnToggleSound.textContent = enabled ? '🔊' : '🔇';
      });
    }

    // Menu / Game Selection
    if (this.btnMainMenu) {
      this.btnMainMenu.addEventListener('click', () => {
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.openModal('modal-welcome');
      });
    }

    // Game Selection Cards in Welcome Modal
    document.querySelectorAll('.game-select-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.game-select-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const game = card.dataset.game;
        if (game) {
          if (typeof SoundFX !== 'undefined') SoundFX.play('button');
          this.switchGame(game);
        }
      });
    });

    // Rules Modal
    if (this.btnShowRules) {
      this.btnShowRules.addEventListener('click', () => {
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.updateRulesContent();
        this.openModal('modal-rules');
      });
    }

    const btnCloseRules = document.getElementById('btn-close-rules');
    const btnDismissRules = document.getElementById('btn-dismiss-rules');
    if (btnCloseRules) btnCloseRules.addEventListener('click', () => this.closeModal('modal-rules'));
    if (btnDismissRules) btnDismissRules.addEventListener('click', () => this.closeModal('modal-rules'));

    // Welcome Mode Buttons
    const btnStartAi = document.getElementById('btn-start-ai') || document.getElementById('btn-mode-ai');
    const btnStartPass = document.getElementById('btn-start-pass') || document.getElementById('btn-mode-pass');
    const btnStartOnline = document.getElementById('btn-start-online') || document.getElementById('btn-mode-online');

    if (btnStartAi) {
      btnStartAi.addEventListener('click', () => {
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.mode = 'AI';
        this.localPlayerId = 0;
        this.isHost = true;
        this.closeModal('modal-welcome');
        this.startNewMatch();
      });
    }

    if (btnStartPass) {
      btnStartPass.addEventListener('click', () => {
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.mode = 'PASS_PLAY';
        this.localPlayerId = 0;
        this.isHost = true;
        this.closeModal('modal-welcome');
        this.startNewMatch();
      });
    }

    if (btnStartOnline) {
      btnStartOnline.addEventListener('click', async () => {
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.closeModal('modal-welcome');
        this.openModal('modal-online-room');
        
        const roomCodeDisplay = document.getElementById('display-room-code');
        const roomStatusMsg = document.getElementById('room-status-message');
        if (roomCodeDisplay) roomCodeDisplay.textContent = 'GENERATING...';
        if (roomStatusMsg) roomStatusMsg.textContent = '⏳ Creating room on peer network...';

        try {
          const roomId = await this.network.createRoom();
          this.mode = 'ONLINE';
          this.isHost = true;
          this.localPlayerId = 0;
          if (roomCodeDisplay) roomCodeDisplay.textContent = roomId;
          if (roomStatusMsg) roomStatusMsg.textContent = `⏳ Waiting for your dad to join (Room: ${roomId})...`;
          this.updateRoomBadge(roomId);
        } catch (err) {
          console.error('Room create error:', err);
          if (roomCodeDisplay) roomCodeDisplay.textContent = 'ERROR';
          if (roomStatusMsg) roomStatusMsg.textContent = '❌ Failed to connect to peer network: ' + (err.message || 'Unknown error');
        }
      });
    }

    // Close Online Room Modal Button
    const btnCloseRoomModal = document.getElementById('btn-close-room-modal');
    if (btnCloseRoomModal) {
      btnCloseRoomModal.addEventListener('click', () => {
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.closeModal('modal-online-room');
        this.openModal('modal-welcome');
      });
    }

    // Copy Code / Share Link in Modal
    const btnCopyCode = document.getElementById('btn-copy-code');
    if (btnCopyCode) {
      btnCopyCode.addEventListener('click', () => {
        if (this.network.roomId) {
          const url = `${window.location.origin}${window.location.pathname}?room=${this.network.roomId}&game=${this.activeGame}`;
          navigator.clipboard.writeText(url).then(() => {
            this.showToast('📋 Room invite link copied to clipboard!');
          }).catch(() => {
            prompt('Copy this room link to share:', url);
          });
        }
      });
    }

    // Online Lobby Buttons
    const btnJoinRoom = document.getElementById('btn-confirm-join') || document.getElementById('btn-join-room');
    const inputJoinCode = document.getElementById('input-join-code') || document.getElementById('input-room-code');

    if (btnJoinRoom) {
      btnJoinRoom.addEventListener('click', async () => {
        const code = (inputJoinCode ? inputJoinCode.value : '').trim().toUpperCase();
        if (!code) return alert('Please enter a 6-letter room code.');
        btnJoinRoom.disabled = true;
        btnJoinRoom.textContent = 'Connecting...';
        try {
          await this.network.joinRoom(code);
          this.mode = 'ONLINE';
          this.isHost = false;
          this.localPlayerId = 1;
          this.closeModal('modal-online-room');
          this.updateRoomBadge(code);
          this.showToast(`Connected to Room ${code}!`);
        } catch (err) {
          alert('Could not join room: ' + err.message);
          btnJoinRoom.disabled = false;
          btnJoinRoom.textContent = 'Join';
        }
      });
    }

    // Share link in Header
    if (this.btnShareRoom) {
      this.btnShareRoom.addEventListener('click', () => {
        if (this.network.roomId) {
          const url = `${window.location.origin}${window.location.pathname}?room=${this.network.roomId}&game=${this.activeGame}`;
          navigator.clipboard.writeText(url).then(() => {
            this.showToast('📋 Room invite link copied to clipboard!');
          }).catch(() => {
            prompt('Copy this room link to share:', url);
          });
        }
      });
    }

    // Poker Action Buttons
    if (this.btnFold) this.btnFold.addEventListener('click', () => this.handlePokerAction('FOLD'));
    if (this.btnCheckCall) this.btnCheckCall.addEventListener('click', () => this.handlePokerAction('CHECK_CALL'));
    if (this.btnBetRaise) this.btnBetRaise.addEventListener('click', () => this.handlePokerAction('BET_RAISE', parseInt(this.betSlider.value, 10)));
    if (this.btnAllIn) this.btnAllIn.addEventListener('click', () => {
      const state = this.getCurrentState();
      const p = state.players[this.localPlayerId];
      this.handlePokerAction('BET_RAISE', p.chips + p.currentRoundBet);
    });
    if (this.betSlider) {
      this.betSlider.addEventListener('input', () => this.updateBetRaiseButtonText());
    }

    // Poker / Spades Draft Buttons
    if (this.btnDraftKeep) {
      this.btnDraftKeep.addEventListener('click', () => {
        if (this.activeGame === GAME_TYPES.SPADES) {
          this.spadesEngine.playerKeepDraftCard(this.localPlayerId);
        } else {
          this.pokerEngine.playerKeepDraftCard(this.localPlayerId);
        }
      });
    }
    if (this.btnDraftDiscard) {
      this.btnDraftDiscard.addEventListener('click', () => {
        if (this.activeGame === GAME_TYPES.SPADES) {
          this.spadesEngine.playerDiscardDraftCard(this.localPlayerId);
        } else {
          this.pokerEngine.playerDiscardDraftCard(this.localPlayerId);
        }
      });
    }

    // Showdown Next Hand
    if (this.btnShowdownNext) {
      this.btnShowdownNext.addEventListener('click', () => {
        if (this.showdownBanner) this.showdownBanner.style.display = 'none';
        if (this.mode === 'ONLINE' && !this.isHost) {
          this.network.send({ type: 'REQUEST_NEXT_HAND' });
        } else {
          this.getCurrentEngine().startNextRound();
        }
      });
    }

    // Rematch / Game Over
    if (this.btnRematch) {
      this.btnRematch.addEventListener('click', () => {
        this.closeModal('modal-game-over');
        this.startNewMatch();
      });
    }
    if (this.btnGameOverMenu) {
      this.btnGameOverMenu.addEventListener('click', () => {
        this.closeModal('modal-game-over');
        this.openModal('modal-welcome');
      });
    }

    // Close Modals buttons
    document.querySelectorAll('.modal-close-btn, .btn-close-modal').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const modal = e.target.closest('.modal-overlay');
        if (modal) {
          modal.classList.remove('active');
          modal.style.display = 'none';
        }
      });
    });

    // Go Fish Respond Buttons
    const btnGiveFish = document.getElementById('btn-gofish-handover') || document.getElementById('btn-gofish-give');
    const btnClaimGoFish = document.getElementById('btn-gofish-claimfish') || document.getElementById('btn-gofish-claim');
    if (btnGiveFish) {
      btnGiveFish.addEventListener('click', () => {
        this.closeModal('modal-gofish-respond');
        this.goFishEngine.respondHonest(this.localPlayerId);
      });
    }
    if (btnClaimGoFish) {
      btnClaimGoFish.addEventListener('click', () => {
        this.closeModal('modal-gofish-respond');
        this.goFishEngine.respondGoFish(this.localPlayerId);
      });
    }

    // Crazy 8s Suit Chooser
    document.querySelectorAll('.btn-wild-suit, .suit-choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const chosenSuit = btn.dataset.suit;
        this.closeModal('modal-wild-suit');
        this.closeModal('modal-crazy8-suit');
        if (this.pendingCrazy8CardId) {
          this.crazy8Engine.playCard(this.localPlayerId, this.pendingCrazy8CardId, chosenSuit);
          this.pendingCrazy8CardId = null;
        }
      });
    });
  }

  /* =========================================================================
     GAME SWITCHING & INITIALIZATION
     ========================================================================= */
  switchGame(gameType) {
    this.activeGame = gameType;
    
    // Update Header
    switch (gameType) {
      case GAME_TYPES.GO_FISH:
        if (this.headerGameIcon) this.headerGameIcon.textContent = '🎣';
        if (this.headerGameTitle) this.headerGameTitle.textContent = 'GO FISH (LIAR\'S TRAP)';
        break;
      case GAME_TYPES.CRAZY_EIGHTS:
        if (this.headerGameIcon) this.headerGameIcon.textContent = '🎴';
        if (this.headerGameTitle) this.headerGameTitle.textContent = 'CRAZY EIGHTS';
        break;
      case GAME_TYPES.SPADES:
        if (this.headerGameIcon) this.headerGameIcon.textContent = '♠️';
        if (this.headerGameTitle) this.headerGameTitle.textContent = 'SPADES DUEL';
        break;
      default:
        if (this.headerGameIcon) this.headerGameIcon.textContent = '🃏';
        if (this.headerGameTitle) this.headerGameTitle.textContent = 'POKER DUEL';
        break;
    }

    // Toggle Stage Containers
    if (gameType === GAME_TYPES.POKER_DUEL) {
      if (this.pokerCommunityContainer) this.pokerCommunityContainer.style.display = 'flex';
      if (this.centerArcadeStage) this.centerArcadeStage.style.display = 'none';
      if (this.actionControlsContainer) this.actionControlsContainer.style.display = 'flex';
      if (this.potDisplayWrapper) this.potDisplayWrapper.style.display = 'flex';
      if (this.handStrengthMeter) this.handStrengthMeter.style.display = 'block';
    } else {
      if (this.pokerCommunityContainer) this.pokerCommunityContainer.style.display = 'none';
      if (this.centerArcadeStage) this.centerArcadeStage.style.display = 'flex';
      if (this.actionControlsContainer) this.actionControlsContainer.style.display = 'none';
      if (this.potDisplayWrapper) this.potDisplayWrapper.style.display = (gameType === GAME_TYPES.SPADES) ? 'flex' : 'none';
      if (this.handStrengthMeter) this.handStrengthMeter.style.display = 'none';
    }
  }

  startNewMatch() {
    if (this.showdownBanner) this.showdownBanner.style.display = 'none';
    if (this.bustedBanner) this.bustedBanner.style.display = 'none';

    const engine = this.getCurrentEngine();
    if (engine.players && engine.players.length >= 2) {
      if (this.mode === 'AI') {
        engine.players[0].name = 'You';
        engine.players[1].name = 'Dad';
      } else if (this.mode === 'PASS_PLAY') {
        engine.players[0].name = 'Player 1';
        engine.players[1].name = 'Player 2';
      } else if (this.mode === 'ONLINE') {
        engine.players[0].name = 'You (Host)';
        engine.players[1].name = 'Dad (Guest)';
      }
    }
    engine.startNewGame();
    this.render();
  }

  /* =========================================================================
     STATE & EVENT DISPATCH
     ========================================================================= */
  onEngineStateChange(game, state) {
    if (game !== this.activeGame) return;

    if (this.mode === 'ONLINE' && this.isHost) {
      this.network.send({
        type: 'SYNC_STATE',
        game: this.activeGame,
        state: this.getCurrentEngine().getSanitizedStateForPlayer(1)
      });
      this.renderGameState(this.getCurrentEngine().getSanitizedStateForPlayer(0));
    } else {
      this.renderGameState(state);
    }

    if (this.mode === 'AI') {
      this.triggerAIIfNeeded();
    }
  }

  onEngineEvent(game, event) {
    if (game !== this.activeGame) return;

    switch (event.type) {
      case 'DRAFT_CARD_DEALT':
        if (typeof SoundFX !== 'undefined') SoundFX.play('draft_deal');
        break;
      case 'DRAFT_KEPT':
        if (typeof SoundFX !== 'undefined') SoundFX.play('card_slide');
        break;
      case 'DRAFT_DISCARDED':
        if (typeof SoundFX !== 'undefined') SoundFX.play('card_flip');
        break;
      case 'BET_PLACED':
        if (typeof SoundFX !== 'undefined') SoundFX.play('chips');
        break;
      case 'POT_WON':
        if (typeof SoundFX !== 'undefined') SoundFX.play('pot_win');
        if (event.winnerId === 0 && window.confetti) {
          window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
        break;
      case 'CAUGHT_IN_LIE':
        if (typeof SoundFX !== 'undefined') SoundFX.play('bluff_caught');
        this.triggerBustedAlarm(event.player, event.cards);
        break;
      case 'BOOK_COMPLETED':
        if (typeof SoundFX !== 'undefined') SoundFX.play('chime');
        this.showToast(`${event.playerName} completed a 4-of-a-kind Book of ${event.rank}s! 🏆`);
        break;
      case 'CARD_PLAYED':
        if (typeof SoundFX !== 'undefined') SoundFX.play('card_slide');
        break;
      case 'CARD_DRAWN':
        if (typeof SoundFX !== 'undefined') SoundFX.play('card_flip');
        break;
      case 'SUIT_CHANGED':
        if (typeof SoundFX !== 'undefined') SoundFX.play('powerup');
        this.showToast(`Wild 8! Active suit changed to ${getSuitSymbol(event.suit)} ${event.suit.toUpperCase()}!`);
        break;
    }
  }

  triggerBustedAlarm(liarPlayer, stolenCards) {
    if (!this.bustedBanner) return;
    this.bustedBanner.style.display = 'flex';
    this.bustedBanner.classList.add('busted-pulse');
    const msg = `${liarPlayer.name} secretly held ${stolenCards.length} matching card(s)! PENALTY: Surrendered + 2 Penalty Cards!`;
    this.showToast(`🚨 ${msg}`);

    setTimeout(() => {
      if (this.bustedBanner) {
        this.bustedBanner.style.display = 'none';
        this.bustedBanner.classList.remove('busted-pulse');
      }
    }, 4500);
  }

  /* =========================================================================
     RENDERING ROUTERS
     ========================================================================= */
  render() {
    this.renderGameState(this.getCurrentState());
  }

  renderGameState(state) {
    if (!state) return;

    switch (this.activeGame) {
      case GAME_TYPES.GO_FISH:
        this.renderGoFish(state);
        break;
      case GAME_TYPES.CRAZY_EIGHTS:
        this.renderCrazy8s(state);
        break;
      case GAME_TYPES.SPADES:
        this.renderSpades(state);
        break;
      default:
        this.renderPokerDuel(state);
        break;
    }
  }

  /* =========================================================================
     POKER DUEL RENDERER
     ========================================================================= */
  renderPokerDuel(state) {
    const isShowdown = state.phase === 'SHOWDOWN' || state.phase === 'HAND_COMPLETE';
    const localPlayer = state.players[this.localPlayerId];
    const opponentPlayer = state.players[1 - this.localPlayerId];

    // Info cards
    if (this.p0Name) this.p0Name.textContent = localPlayer.name;
    if (this.p0Chips) this.p0Chips.textContent = `💰 $${localPlayer.chips}`;
    if (this.p1Name) this.p1Name.textContent = opponentPlayer.name;
    if (this.p1Chips) this.p1Chips.textContent = `💰 $${opponentPlayer.chips}`;

    // Active Pod Glow
    if (state.activeTurnPlayer === this.localPlayerId) {
      if (this.p0Pod) this.p0Pod.classList.add('active-turn');
      if (this.p1Pod) this.p1Pod.classList.remove('active-turn');
    } else {
      if (this.p1Pod) this.p1Pod.classList.add('active-turn');
      if (this.p0Pod) this.p0Pod.classList.remove('active-turn');
    }

    // Bets
    if (this.p0BetBadge) {
      this.p0BetBadge.textContent = `Bet: $${localPlayer.currentRoundBet}`;
      this.p0BetBadge.style.visibility = localPlayer.currentRoundBet > 0 ? 'visible' : 'hidden';
    }
    if (this.p1BetBadge) {
      this.p1BetBadge.textContent = `Bet: $${opponentPlayer.currentRoundBet}`;
      this.p1BetBadge.style.visibility = opponentPlayer.currentRoundBet > 0 ? 'visible' : 'hidden';
    }

    // Pot & Blinds
    if (this.potAmount) this.potAmount.textContent = `$${state.pot}`;
    const small = state.currentSmallBlind || (state.blindLevel ? state.blindLevel.small : 10);
    const big = state.currentBigBlind || (state.blindLevel ? state.blindLevel.big : 20);
    if (this.roundBlindsInfo) this.roundBlindsInfo.textContent = `Round ${state.roundNumber || 1} • Blinds: $${small} / $${big}`;

    // Community Cards (5 slots)
    for (let i = 0; i < 5; i++) {
      const slotEl = document.getElementById(`slot-${i}`);
      if (!slotEl) continue;
      slotEl.innerHTML = '';
      const card = state.communityCards[i];
      if (card) {
        const isBest = isShowdown && localPlayer.handEval && localPlayer.handEval.best5Cards && localPlayer.handEval.best5Cards.some(c => c && c.id === card.id);
        const cardEl = renderCardElement(card, { isHighlighted: isBest, cardSize: 'medium' });
        slotEl.appendChild(cardEl);
      } else {
        slotEl.innerHTML = `<span class="slot-number">${i + 1}</span>`;
      }
    }

    // Player Cards (Bottom Pod)
    if (this.p0CardsContainer) {
      this.p0CardsContainer.innerHTML = '';
      localPlayer.holeCards.forEach(card => {
        const isBest = localPlayer.handEval && localPlayer.handEval.best5Cards && localPlayer.handEval.best5Cards.some(c => c && c.id === card.id);
        const cardEl = renderCardElement(card, { isHighlighted: isBest, cardSize: 'medium', faceDown: false });
        this.p0CardsContainer.appendChild(cardEl);
      });
    }

    // Opponent Cards (Top Pod)
    if (this.p1CardsContainer) {
      this.p1CardsContainer.innerHTML = '';
      opponentPlayer.holeCards.forEach(card => {
        const showFace = isShowdown || (this.mode === 'PASS_PLAY');
        const isBest = isShowdown && opponentPlayer.handEval && opponentPlayer.handEval.best5Cards && opponentPlayer.handEval.best5Cards.some(c => c && card && c.id === card.id);
        const cardEl = renderCardElement(card, { faceDown: !showFace, isHighlighted: isBest, cardSize: 'medium' });
        this.p1CardsContainer.appendChild(cardEl);
      });
    }

    // Drafting Spotlight
    if (state.phase === 'DRAFTING') {
      if (this.draftSpotlight) this.draftSpotlight.style.display = 'flex';
      const draftPlayerId = (typeof state.activeDraftPlayer === 'number') ? state.activeDraftPlayer : (typeof state.draftingPlayer === 'number' ? state.draftingPlayer : 0);
      const isMyDraft = (this.mode === 'PASS_PLAY' || draftPlayerId === this.localPlayerId);
      const draftCard = state.currentDraftCard || state.currentDrawnCard;
      const draftingPlayerObj = (state.players && state.players[draftPlayerId]) ? state.players[draftPlayerId] : { name: `Player ${draftPlayerId + 1}` };
      const slotNum = state.communityCards ? (state.communityCards.length + 1) : 1;

      if (isMyDraft && draftCard) {
        if (this.draftPrompt) this.draftPrompt.textContent = `${draftingPlayerObj.name}'s Pick: Slot ${slotNum}/5`;
        if (this.draftCardContainer) {
          this.draftCardContainer.innerHTML = '';
          const draftEl = renderCardElement(draftCard, { cardSize: 'large', faceDown: false });
          this.draftCardContainer.appendChild(draftEl);
        }
        if (this.draftActionButtons) this.draftActionButtons.style.display = 'flex';
        if (this.draftWaitingMessage) this.draftWaitingMessage.style.display = 'none';
      } else {
        if (this.draftPrompt) this.draftPrompt.textContent = `${draftingPlayerObj.name} is choosing...`;
        if (this.draftCardContainer) {
          this.draftCardContainer.innerHTML = '';
          const backEl = renderCardElement({ suit: 's', rank: 'A' }, { cardSize: 'large', faceDown: true });
          this.draftCardContainer.appendChild(backEl);
        }
        if (this.draftActionButtons) this.draftActionButtons.style.display = 'none';
        if (this.draftWaitingMessage) this.draftWaitingMessage.style.display = 'block';
      }
    } else {
      if (this.draftSpotlight) this.draftSpotlight.style.display = 'none';
    }

    // Assist Meter
    if (localPlayer.handEval) {
      if (this.assistHandName) this.assistHandName.textContent = localPlayer.handEval.handName || 'High Card';
      this.updateStrengthMeter(localPlayer.handEval.rankCategory || 0);
    }

    // Showdown Banner
    if (isShowdown && state.winnerInfo) {
      if (this.showdownBanner) this.showdownBanner.style.display = 'flex';
      if (this.showdownBannerTitle) this.showdownBannerTitle.textContent = state.winnerInfo.isTie ? 'SPLIT POT!' : `${state.winnerInfo.winnerName.toUpperCase()} WINS $${state.winnerInfo.potAmount}!`;
      if (this.showdownBannerDesc) this.showdownBannerDesc.textContent = state.winnerInfo.winningHandName || '';
    } else {
      if (this.showdownBanner) this.showdownBanner.style.display = 'none';
    }

    // Poker Action Controls
    this.updatePokerActionControls(state);
  }

  updatePokerActionControls(state) {
    if (!this.btnFold || !this.btnCheckCall || !this.btnBetRaise || !this.btnAllIn) return;

    const isBettingPhase = (state.phase === 'PRE_DRAFT_BETTING' || state.phase === 'CARD_BETTING');
    const isMyTurn = isBettingPhase && (this.mode === 'PASS_PLAY' || state.activeTurnPlayer === this.localPlayerId);

    const activePlayer = state.players[this.localPlayerId];
    const callAmount = state.currentBet - activePlayer.currentRoundBet;

    this.btnFold.disabled = !isMyTurn;
    this.btnCheckCall.disabled = !isMyTurn;
    this.btnBetRaise.disabled = !isMyTurn || activePlayer.chips <= 0;
    this.btnAllIn.disabled = !isMyTurn || activePlayer.chips <= 0;

    if (callAmount <= 0) {
      this.btnCheckCall.textContent = 'CHECK';
    } else {
      this.btnCheckCall.textContent = `CALL $${Math.min(activePlayer.chips, callAmount)}`;
    }

    const min = Math.max(state.minRaise || state.currentBigBlind, state.currentBet + state.currentBigBlind);
    const max = activePlayer.chips + activePlayer.currentRoundBet;

    if (this.betSlider) {
      this.betSlider.min = min;
      this.betSlider.max = Math.max(min, max);
      if (parseInt(this.betSlider.value, 10) < min) {
        this.betSlider.value = min;
      }
    }
    this.updateBetRaiseButtonText();
  }

  updateBetRaiseButtonText() {
    if (!this.btnBetRaise || !this.betSlider) return;
    const val = parseInt(this.betSlider.value, 10);
    const state = this.getCurrentState();
    const actionName = state.currentBet > 0 ? 'RAISE TO' : 'BET';
    this.btnBetRaise.textContent = `${actionName} $${val}`;
  }

  handlePokerAction(type, amount = 0) {
    if (typeof SoundFX !== 'undefined') SoundFX.play('button');
    if (this.mode === 'ONLINE' && !this.isHost) {
      this.network.send({ type: 'POKER_ACTION', action: type, amount });
    } else {
      this.pokerEngine.handlePlayerAction(this.localPlayerId, type, amount);
    }
  }

  /* =========================================================================
     GO FISH RENDERER (LIAR'S TRAP)
     ========================================================================= */
  renderGoFish(state) {
    const localPlayer = state.players[this.localPlayerId];
    const opponentPlayer = state.players[1 - this.localPlayerId];

    if (this.p0Name) this.p0Name.textContent = localPlayer.name;
    if (this.p0Chips) this.p0Chips.textContent = `🏆 Books: ${localPlayer.books.length} (${localPlayer.books.join(', ') || 'None'})`;
    if (this.p1Name) this.p1Name.textContent = opponentPlayer.name;
    if (this.p1Chips) this.p1Chips.textContent = `🏆 Books: ${opponentPlayer.books.length} (${opponentPlayer.books.join(', ') || 'None'})`;

    // Active glow
    if (state.activeTurnPlayer === this.localPlayerId) {
      if (this.p0Pod) this.p0Pod.classList.add('active-turn');
      if (this.p1Pod) this.p1Pod.classList.remove('active-turn');
    } else {
      if (this.p1Pod) this.p1Pod.classList.add('active-turn');
      if (this.p0Pod) this.p0Pod.classList.remove('active-turn');
    }

    // Center Stage: Ocean Pond
    if (this.centerArcadeStage) {
      this.centerArcadeStage.innerHTML = `
        <div class="ocean-pond-container">
          <div class="ocean-pond-graphic">🌊 🐟 🎣</div>
          <div class="ocean-pond-count">Ocean Stock: <strong>${state.oceanDeck.length}</strong> cards remaining</div>
          <div class="turn-announcement">${state.turnMessage || (state.activeTurnPlayer === this.localPlayerId ? 'Your turn! Click a card below to ask Dad!' : 'Dad is thinking...')}</div>
        </div>
      `;
    }

    // Player Cards (Click to Ask)
    if (this.p0CardsContainer) {
      this.p0CardsContainer.innerHTML = '';
      const isMyTurn = (state.activeTurnPlayer === this.localPlayerId && state.phase === 'ASKING');

      localPlayer.hand.forEach(card => {
        const cardEl = renderCardElement(card, { cardSize: 'medium', faceDown: false });
        if (isMyTurn) {
          cardEl.style.cursor = 'pointer';
          cardEl.title = `Ask Dad for ${card.rank}s!`;
          cardEl.classList.add('card-playable-pulse');
          cardEl.addEventListener('click', () => {
            this.promptGoFishAsk(card.rank);
          });
        }
        this.p0CardsContainer.appendChild(cardEl);
      });
    }

    // Opponent Cards (Face Down)
    if (this.p1CardsContainer) {
      this.p1CardsContainer.innerHTML = '';
      opponentPlayer.hand.forEach(card => {
        const cardEl = renderCardElement(card, { cardSize: 'medium', faceDown: true });
        this.p1CardsContainer.appendChild(cardEl);
      });
    }

    // Handle Opponent Asking You (Response Modal with Liar's Trap)
    if (state.phase === 'WAITING_RESPONSE' && state.askedPlayerId === this.localPlayerId) {
      this.showGoFishRespondModal(state.currentAskedRank, localPlayer);
    }
  }

  promptGoFishAsk(rank) {
    if (typeof SoundFX !== 'undefined') SoundFX.play('button');
    if (this.mode === 'ONLINE' && !this.isHost) {
      this.network.send({ type: 'GOFISH_ASK', askerId: this.localPlayerId, rank });
    } else {
      this.goFishEngine.askForRank(this.localPlayerId, rank);
    }
  }

  showGoFishRespondModal(rank, player) {
    const matchingCount = player.hand.filter(c => c.rank === rank).length;
    const modalPrompt = document.getElementById('gofish-respond-title') || document.getElementById('gofish-respond-prompt');
    const btnGive = document.getElementById('btn-gofish-handover') || document.getElementById('btn-gofish-give');
    const btnGoFish = document.getElementById('btn-gofish-claimfish') || document.getElementById('btn-gofish-claim');

    if (modalPrompt) {
      modalPrompt.innerHTML = `Dad asks: <strong>"Do you have any ${rank}s?"</strong><br><small style="font-size: 0.8rem; color: #facc15;">(You hold ${matchingCount} of them)</small>`;
    }
    if (btnGive) {
      btnGive.textContent = matchingCount > 0 ? `🤝 HERE ARE MY ${matchingCount} ${rank}(s)` : `I DON'T HAVE ANY (HONEST)`;
    }
    if (btnGoFish) {
      btnGoFish.textContent = matchingCount > 0 ? `CLAIM "GO FISH!" (RISK LIAR'S TRAP!)` : `TELL DAD TO "GO FISH!" 🎣`;
    }

    this.openModal('modal-gofish-respond');
  }

  /* =========================================================================
     CRAZY EIGHTS RENDERER
     ========================================================================= */
  renderCrazy8s(state) {
    const localPlayer = state.players[this.localPlayerId];
    const opponentPlayer = state.players[1 - this.localPlayerId];

    if (this.p0Name) this.p0Name.textContent = localPlayer.name;
    if (this.p0Chips) this.p0Chips.textContent = `🎴 Cards: ${localPlayer.hand.length}`;
    if (this.p1Name) this.p1Name.textContent = opponentPlayer.name;
    if (this.p1Chips) this.p1Chips.textContent = `🎴 Cards: ${opponentPlayer.hand.length}`;

    // Active Pod Glow
    if (state.activeTurnPlayer === this.localPlayerId) {
      if (this.p0Pod) this.p0Pod.classList.add('active-turn');
      if (this.p1Pod) this.p1Pod.classList.remove('active-turn');
    } else {
      if (this.p1Pod) this.p1Pod.classList.add('active-turn');
      if (this.p0Pod) this.p0Pod.classList.remove('active-turn');
    }

    // Center Stage: Draw Pile + Discard Pile
    const topDiscard = state.discardPile[state.discardPile.length - 1];
    const isMyTurn = (state.activeTurnPlayer === this.localPlayerId && state.phase === 'PLAY');

    if (this.centerArcadeStage) {
      this.centerArcadeStage.innerHTML = '';
      const crazy8Stage = document.createElement('div');
      crazy8Stage.className = 'crazy8-center-container';

      // Draw Stockpile
      const drawDeckEl = document.createElement('div');
      drawDeckEl.className = 'crazy8-stock-pile';
      drawDeckEl.innerHTML = `
        <div class="deck-count-badge">${state.stockPile.length} cards</div>
      `;
      const backCard = renderCardElement({ suit: 's', rank: 'A' }, { cardSize: 'medium', faceDown: true });
      if (isMyTurn) {
        backCard.style.cursor = 'pointer';
        backCard.title = 'Click to Draw from Stock';
        backCard.addEventListener('click', () => {
          if (typeof SoundFX !== 'undefined') SoundFX.play('button');
          this.crazy8Engine.drawFromStock(this.localPlayerId);
        });
      }
      drawDeckEl.appendChild(backCard);

      // Discard Pile
      const discardPileEl = document.createElement('div');
      discardPileEl.className = 'crazy8-discard-pile';
      discardPileEl.innerHTML = `
        <div class="active-suit-badge">Active Suit: ${getSuitSymbol(state.currentSuit)} ${state.currentSuit.toUpperCase()}</div>
      `;
      if (topDiscard) {
        const discardCard = renderCardElement(topDiscard, { cardSize: 'medium', faceDown: false });
        discardPileEl.appendChild(discardCard);
      }

      crazy8Stage.appendChild(drawDeckEl);
      crazy8Stage.appendChild(discardPileEl);
      this.centerArcadeStage.appendChild(crazy8Stage);
    }

    // Player Cards (Playable cards highlighted)
    if (this.p0CardsContainer) {
      this.p0CardsContainer.innerHTML = '';
      localPlayer.hand.forEach(card => {
        const isValid = this.crazy8Engine.isValidPlay(card, topDiscard, state.currentSuit);
        const cardEl = renderCardElement(card, {
          cardSize: 'medium',
          faceDown: false,
          isHighlighted: isMyTurn && isValid
        });

        if (isMyTurn && isValid) {
          cardEl.style.cursor = 'pointer';
          cardEl.classList.add('card-playable-pulse');
          cardEl.addEventListener('click', () => {
            if (card.rank === '8') {
              this.pendingCrazy8CardId = card.id;
              this.openModal('modal-wild-suit');
            } else {
              this.crazy8Engine.playCard(this.localPlayerId, card.id);
            }
          });
        }
        this.p0CardsContainer.appendChild(cardEl);
      });
    }

    // Opponent Cards (Face down)
    if (this.p1CardsContainer) {
      this.p1CardsContainer.innerHTML = '';
      opponentPlayer.hand.forEach(card => {
        const cardEl = renderCardElement(card, { cardSize: 'medium', faceDown: true });
        this.p1CardsContainer.appendChild(cardEl);
      });
    }

    // Game Over Banner
    if (state.phase === 'GAME_OVER' && state.winner) {
      this.showGameOver(state.winner.name, `Won Crazy Eights by shedding all cards!`);
    }
  }

  /* =========================================================================
     SPADES DUEL RENDERER
     ========================================================================= */
  renderSpades(state) {
    const localPlayer = state.players[this.localPlayerId];
    const opponentPlayer = state.players[1 - this.localPlayerId];

    if (this.p0Name) this.p0Name.textContent = localPlayer.name;
    if (this.p0Chips) this.p0Chips.textContent = `♠️ Tricks: ${localPlayer.tricksWon}/${localPlayer.bid || 0} (Score: ${localPlayer.totalScore})`;
    if (this.p1Name) this.p1Name.textContent = opponentPlayer.name;
    if (this.p1Chips) this.p1Chips.textContent = `♠️ Tricks: ${opponentPlayer.tricksWon}/${opponentPlayer.bid || 0} (Score: ${opponentPlayer.totalScore})`;

    // Active Pod Glow
    if (state.activeTurnPlayer === this.localPlayerId) {
      if (this.p0Pod) this.p0Pod.classList.add('active-turn');
      if (this.p1Pod) this.p1Pod.classList.remove('active-turn');
    } else {
      if (this.p1Pod) this.p1Pod.classList.add('active-turn');
      if (this.p0Pod) this.p0Pod.classList.remove('active-turn');
    }

    // Spades Center Stage: Current Trick Area
    if (this.centerArcadeStage) {
      this.centerArcadeStage.innerHTML = '';
      const spadesStage = document.createElement('div');
      spadesStage.className = 'spades-center-stage';
      spadesStage.innerHTML = `
        <div class="spades-status-ribbon">
          ${state.spadesBroken ? '♠️ Spades are BROKEN!' : '🛡️ Spades not yet broken'}
        </div>
        <div class="spades-trick-cards" id="spades-trick-cards"></div>
      `;
      this.centerArcadeStage.appendChild(spadesStage);

      const trickContainer = document.getElementById('spades-trick-cards');
      if (state.currentTrick && state.currentTrick.length > 0 && trickContainer) {
        state.currentTrick.forEach(trickEntry => {
          const cardEl = renderCardElement(trickEntry.card, { cardSize: 'medium', faceDown: false });
          const label = document.createElement('div');
          label.className = 'trick-player-label';
          label.textContent = state.players[trickEntry.playerId].name;
          const wrapper = document.createElement('div');
          wrapper.className = 'trick-card-wrapper';
          wrapper.appendChild(label);
          wrapper.appendChild(cardEl);
          trickContainer.appendChild(wrapper);
        });
      }
    }

    // Drafting Phase
    if (state.phase === 'DRAFTING') {
      if (this.draftSpotlight) this.draftSpotlight.style.display = 'flex';
      const isMyDraft = (state.draftingPlayer === this.localPlayerId);
      if (isMyDraft && state.currentDraftCard) {
        if (this.draftPrompt) this.draftPrompt.textContent = `Spades Draft: Card ${state.draftTurnCount}/13`;
        if (this.draftCardContainer) {
          this.draftCardContainer.innerHTML = '';
          const draftEl = renderCardElement(state.currentDraftCard, { cardSize: 'large', faceDown: false });
          this.draftCardContainer.appendChild(draftEl);
        }
        if (this.draftActionButtons) this.draftActionButtons.style.display = 'flex';
        if (this.draftWaitingMessage) this.draftWaitingMessage.style.display = 'none';
      } else {
        if (this.draftPrompt) this.draftPrompt.textContent = `${state.players[state.draftingPlayer].name} is drafting...`;
        if (this.draftCardContainer) {
          this.draftCardContainer.innerHTML = '';
          const backEl = renderCardElement({ suit: 's', rank: 'A' }, { cardSize: 'large', faceDown: true });
          this.draftCardContainer.appendChild(backEl);
        }
        if (this.draftActionButtons) this.draftActionButtons.style.display = 'none';
        if (this.draftWaitingMessage) this.draftWaitingMessage.style.display = 'block';
      }
    } else {
      if (this.draftSpotlight) this.draftSpotlight.style.display = 'none';
    }

    // Bidding Phase Modal
    if (state.phase === 'BIDDING' && state.activeTurnPlayer === this.localPlayerId) {
      this.populateSpadesBidButtons();
      this.openModal('modal-spades-bid');
    }

    // Trick Playing Phase
    if (this.p0CardsContainer) {
      this.p0CardsContainer.innerHTML = '';
      const isMyTrickTurn = (state.phase === 'TRICK_PLAY' && state.activeTurnPlayer === this.localPlayerId);

      localPlayer.hand.forEach(card => {
        const isValid = this.spadesEngine.isValidSpadesPlay(card, localPlayer.hand, state.leadSuit, state.spadesBroken);
        const cardEl = renderCardElement(card, { cardSize: 'medium', faceDown: false, isHighlighted: isMyTrickTurn && isValid });

        if (isMyTrickTurn && isValid) {
          cardEl.style.cursor = 'pointer';
          cardEl.classList.add('card-playable-pulse');
          cardEl.addEventListener('click', () => {
            this.spadesEngine.playTrickCard(this.localPlayerId, card.id);
          });
        }
        this.p0CardsContainer.appendChild(cardEl);
      });
    }

    // Opponent Cards
    if (this.p1CardsContainer) {
      this.p1CardsContainer.innerHTML = '';
      opponentPlayer.hand.forEach(card => {
        const cardEl = renderCardElement(card, { cardSize: 'medium', faceDown: true });
        this.p1CardsContainer.appendChild(cardEl);
      });
    }
  }

  populateSpadesBidButtons() {
    const container = document.getElementById('spades-bid-buttons');
    if (!container) return;
    container.innerHTML = '';
    for (let bid = 0; bid <= 13; bid++) {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.style.width = 'auto';
      btn.style.padding = '8px 14px';
      btn.textContent = bid === 0 ? '0 (Nil)' : `${bid}`;
      btn.addEventListener('click', () => {
        if (typeof SoundFX !== 'undefined') SoundFX.play('button');
        this.closeModal('modal-spades-bid');
        this.spadesEngine.submitBid(this.localPlayerId, bid);
      });
      container.appendChild(btn);
    }
  }

  /* =========================================================================
     AI BOT TURN DISPATCHER
     ========================================================================= */
  triggerAIIfNeeded() {
    const state = this.getCurrentState();
    if (!state) return;

    if (this.activeGame === GAME_TYPES.POKER_DUEL) {
      const draftPlayer = (typeof state.activeDraftPlayer === 'number') ? state.activeDraftPlayer : state.draftingPlayer;
      if (state.phase === 'DRAFTING' && draftPlayer === 1) {
        setTimeout(() => {
          try {
            const card = state.currentDraftCard || state.currentDrawnCard;
            const holeCards = state.players && state.players[1] ? state.players[1].holeCards : [];
            const action = this.pokerAI.decideDraftAction(card, holeCards, state.communityCards || []);
            if (action === 'KEEP') this.pokerEngine.playerKeepDraftCard(1);
            else this.pokerEngine.playerDiscardDraftCard(1);
          } catch (e) {
            console.error('AI draft error:', e);
            this.pokerEngine.playerKeepDraftCard(1);
          }
        }, 600);
      } else if ((state.phase === 'PRE_DRAFT_BETTING' || state.phase === 'CARD_BETTING') && state.activeTurnPlayer === 1) {
        setTimeout(() => {
          try {
            const action = this.pokerAI.decideBetAction(state, 1);
            this.pokerEngine.handlePlayerAction(1, action.type, action.amount);
          } catch (e) {
            console.error('AI bet error:', e);
            this.pokerEngine.handlePlayerAction(1, 'CHECK_CALL', 0);
          }
        }, 800);
      }
    } else if (this.activeGame === GAME_TYPES.GO_FISH) {
      if (state.phase === 'ASKING' && state.activeTurnPlayer === 1) {
        setTimeout(() => {
          try {
            const dadHand = state.players && state.players[1] ? state.players[1].hand : [];
            if (dadHand && dadHand.length > 0) {
              const randomCard = dadHand[Math.floor(Math.random() * dadHand.length)];
              this.goFishEngine.askForRank(1, randomCard.rank);
            }
          } catch (e) {
            console.error('Go fish AI error:', e);
          }
        }, 900);
      }
    } else if (this.activeGame === GAME_TYPES.CRAZY_EIGHTS) {
      if (state.phase === 'PLAY' && state.activeTurnPlayer === 1) {
        setTimeout(() => {
          try {
            this.crazy8Engine.aiPlayTurn(1);
          } catch (e) {
            console.error('Crazy8 AI error:', e);
          }
        }, 800);
      }
    } else if (this.activeGame === GAME_TYPES.SPADES) {
      const draftPlayer = (typeof state.activeDraftPlayer === 'number') ? state.activeDraftPlayer : state.draftingPlayer;
      if (state.phase === 'DRAFTING' && draftPlayer === 1) {
        setTimeout(() => {
          try {
            this.spadesEngine.aiDraftTurn(1);
          } catch (e) {
            console.error('Spades AI draft error:', e);
          }
        }, 500);
      } else if (state.phase === 'BIDDING' && state.activeTurnPlayer === 1) {
        setTimeout(() => {
          try {
            this.spadesEngine.aiBidTurn(1);
          } catch (e) {
            console.error('Spades AI bid error:', e);
          }
        }, 600);
      } else if (state.phase === 'TRICK_PLAY' && state.activeTurnPlayer === 1) {
        setTimeout(() => {
          try {
            this.spadesEngine.aiTrickTurn(1);
          } catch (e) {
            console.error('Spades AI trick error:', e);
          }
        }, 700);
      }
    }
  }

  /* =========================================================================
     HELPERS & MODALS
     ========================================================================= */
  updateStrengthMeter(categoryIndex) {
    if (!this.meterSegments) return;
    this.meterSegments.forEach((seg, idx) => {
      if (idx <= categoryIndex) {
        seg.className = `meter-segment active cat-${categoryIndex}`;
      } else {
        seg.className = 'meter-segment';
      }
    });
  }

  openModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (modal) {
      modal.classList.add('active');
      modal.style.display = 'flex';
    }
  }

  closeModal(modalId) {
    const modal = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  }

  showToast(msg) {
    const container = document.getElementById('toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3200);
  }

  updateRulesContent() {
    const rulesBody = document.getElementById('rules-content') || document.getElementById('rules-modal-body');
    if (!rulesBody) return;

    if (this.activeGame === GAME_TYPES.GO_FISH) {
      rulesBody.innerHTML = `
        <h3 style="color: #60a5fa;">🎣 Go Fish (with Liar's Trap)</h3>
        <p>1. On your turn, ask your opponent for any rank you hold in your hand.</p>
        <p>2. If they have it, they surrender all matching cards to you.</p>
        <p>3. <strong style="color: #ef4444;">🚨 THE LIAR'S TRAP:</strong> If a player clicks "GO FISH!" but secretly holds the asked card, the automated referee instantly catches them! The liar surrenders the cards, takes 2 penalty cards, and reveals a card.</p>
        <p>4. Collect all 4 cards of a rank to form a Book. Most books wins!</p>
      `;
    } else if (this.activeGame === GAME_TYPES.CRAZY_EIGHTS) {
      rulesBody.innerHTML = `
        <h3 style="color: #facc15;">🎴 Crazy Eights</h3>
        <p>1. Match the top discard card by <strong>Rank</strong> or <strong>Food Suit</strong> (🍔 Burgers, 🍕 Pizzas, 🍒 Cherries, 🥦 Veggies).</p>
        <p>2. <strong>All 8s are WILD!</strong> Play an 8 anytime to choose the active suit.</p>
        <p>3. If you can't play, draw from the stockpile until you can.</p>
        <p>4. First player to empty their hand wins!</p>
      `;
    } else if (this.activeGame === GAME_TYPES.SPADES) {
      rulesBody.innerHTML = `
        <h3 style="color: #a855f7;">♠️ 2-Player Spades Duel</h3>
        <p>1. <strong>Drafting Phase:</strong> Take turns looking at the top card. Keep it or discard face-down to take a mystery card.</p>
        <p>2. <strong>Bidding:</strong> Predict how many tricks you will win (0 to 13).</p>
        <p>3. <strong>Cosmic Jokers:</strong> Big Joker & Little Joker are the highest trumps in the deck!</p>
        <p>4. Must follow lead suit. Spades cannot lead until Spades are broken.</p>
      `;
    } else {
      rulesBody.innerHTML = `
        <h3 style="color: #fbbf24;">🃏 2-Player Poker Duel</h3>
        <p>1. Pre-Draft Betting: Blinds posted, initial betting round.</p>
        <p>2. 4-Round Draft Phase: 1-card draft alternating keep/discard, followed by betting.</p>
        <p>3. Best 5-card Texas Hold'em hand using your 2 hole cards + 5 community cards wins!</p>
      `;
    }
  }

  showGameOver(winnerName, description) {
    if (this.gameOverTitle) this.gameOverTitle.textContent = `${winnerName.toUpperCase()} WINS!`;
    if (this.gameOverDesc) this.gameOverDesc.textContent = description;
    this.openModal('modal-game-over');
    if (window.confetti) {
      window.confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
    }
  }

  /* =========================================================================
     NETWORK & URL SHARING
     ========================================================================= */
  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    const game = params.get('game');

    if (game && GAME_TYPES[game]) {
      this.switchGame(game);
    }

    if (room) {
      const code = room.toUpperCase();
      this.network.joinRoom(code).then(() => {
        this.mode = 'ONLINE';
        this.isHost = false;
        this.localPlayerId = 1;
        this.closeModal('modal-welcome');
        this.updateRoomBadge(code);
      }).catch(err => {
        this.showToast('Failed to join room from URL link');
      });
    } else {
      this.openModal('modal-welcome');
    }
  }

  showHostLobby(roomId) {
    const hostLobby = document.getElementById('host-lobby-view');
    const defaultOnline = document.getElementById('online-initial-view');
    const roomCodeDisplay = document.getElementById('display-room-code');

    if (hostLobby) hostLobby.style.display = 'block';
    if (defaultOnline) defaultOnline.style.display = 'none';
    if (roomCodeDisplay) roomCodeDisplay.textContent = roomId;
    this.updateRoomBadge(roomId);
  }

  updateRoomBadge(code) {
    if (this.roomBadge && this.roomBadgeText) {
      this.roomBadge.style.display = 'flex';
      this.roomBadgeText.innerHTML = `Room: <strong>${code}</strong>`;
    }
    if (this.btnShareRoom) this.btnShareRoom.style.display = 'inline-flex';
  }

  onNetworkConnected(info) {
    this.showToast(`Connected to opponent! Starting match...`);
    this.closeModal('modal-online-room');
    if (this.isHost) {
      this.startNewMatch();
    }
  }

  onNetworkDisconnected() {
    this.showToast('Opponent disconnected.');
  }

  onNetworkMessage(msg) {
    if (!msg) return;
    if (msg.type === 'SYNC_STATE') {
      this.latestRemoteState = msg.state;
      this.renderGameState(msg.state);
    } else if (msg.type === 'POKER_ACTION' && this.isHost) {
      this.pokerEngine.handlePlayerAction(1, msg.action, msg.amount);
    } else if (msg.type === 'GOFISH_ASK' && this.isHost) {
      this.goFishEngine.askForRank(1, msg.rank);
    } else if (msg.type === 'REQUEST_NEXT_HAND' && this.isHost) {
      this.getCurrentEngine().startNextRound();
    }
  }

  onNetworkError(err) {
    console.error('Network Error:', err);
  }
}

// Global initialization on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.app = new FamilyCardArcadeApp();
});
