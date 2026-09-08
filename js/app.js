// js/app.js - Family Card Arcadia Unified Multi-Game Controller with Live WebRTC Video & Voice Chat

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
    this.seatCount = 2; // Default 2 players, expandable to 3 or 4
    this.localPlayerId = 0; // 0 = Seat 0 (South)
    this.isHost = true;
    this.isSpectator = false;
    this.isGameActive = false;
    this.latestRemoteState = null;
    this.pendingCrazy8CardId = null;
    this.pendingLeftPlayerSeat = null;

    // Initialize Card Theme
    this.currentTheme = localStorage.getItem('poker_duel_deck_theme') || 'family_food';
    if (typeof setDeckTheme !== 'undefined') setDeckTheme(this.currentTheme);

    // Instantiate AI Manager
    this.aiManager = new ArcadeAIManager();

    // Instantiate Engines
    this.initEngines();

    // Media Manager (WebRTC Video & Voice)
    this.media = new MediaManager({
      getDomSeatIndex: (seat) => this.getDomSeatIndex(seat, this.seatCount),
      onStreamAdded: (info) => this.onMediaStreamAdded(info),
      onStreamRemoved: (info) => this.onMediaStreamRemoved(info),
      onSpeakingChange: (info) => this.onSpeakingChange(info),
      onMediaStateChange: (state) => this.onMediaStateChange(state),
      onError: (err) => this.showToast(`Camera/Mic notice: ${err.message || 'Permission needed'}`)
    });

    // Firebase Realtime Database Room Manager
    this.firebaseRoom = new FirebaseRoomManager({
      onStateChange: (state) => this.onFirebaseStateChange(state),
      onRosterChange: (roster) => this.onFirebaseRosterChange(roster),
      onPlayerLeft: (info) => this.onFirebasePlayerLeft(info),
      onActionReceived: (action) => this.onFirebaseActionReceived(action),
      onStatus: (status) => this.onNetworkStatus(status),
      onError: (err) => this.onNetworkError(err)
    });

    // P2P / AV Signaling Networking
    this.network = new NetworkManager({
      onConnected: (info) => this.onNetworkConnected(info),
      onDisconnected: (peerId) => this.onNetworkDisconnected(peerId),
      onMessage: (msg, from) => this.onNetworkMessage(msg, from),
      onRosterChange: (roster) => this.onRosterChange(roster),
      onError: (err) => this.onNetworkError(err),
      onStatus: (status) => this.onNetworkStatus(status),
      getInitialState: () => ({
        activeGame: this.activeGame,
        state: this.getCurrentState(),
        isGameActive: this.isGameActive
      })
    });

    this.initDOM();
    this.bindEvents();
    this.checkUrlParams();
  }

  initEngines() {
    // 1. Poker Engine
    this.pokerEngine = new GameEngine({
      numPlayers: this.seatCount,
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
      numPlayers: this.seatCount,
      onStateChange: (state) => this.onEngineStateChange('CRAZY_EIGHTS', state),
      onEvent: (event) => this.onEngineEvent('CRAZY_EIGHTS', event)
    });

    // 4. Spades Engine
    this.spadesEngine = new SpadesEngine({
      numPlayers: this.seatCount,
      onStateChange: (state) => this.onEngineStateChange('SPADES', state),
      onEvent: (event) => this.onEngineEvent('SPADES', event)
    });
  }

  setSeatCount(count) {
    this.seatCount = Math.max(2, Math.min(4, count));
    this.pokerEngine.setPlayerCount(this.seatCount);
    this.crazy8Engine.setPlayerCount(this.seatCount);
    this.spadesEngine.setPlayerCount(this.seatCount);

    // Update Seat buttons in lobby
    document.querySelectorAll('.seat-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.seats, 10) === this.seatCount);
      btn.style.background = (parseInt(btn.dataset.seats, 10) === this.seatCount) ? '#3b82f6' : '#1e293b';
    });

    this.updateTableLayoutPods();
    this.render();
  }

  updateTableLayoutPods() {
    const podLeft = document.getElementById('pod-seat-1');
    const podTop = document.getElementById('pod-seat-2');
    const podRight = document.getElementById('pod-seat-3');

    if (this.seatCount === 2) {
      if (podLeft) podLeft.style.display = 'none';
      if (podRight) podRight.style.display = 'none';
      if (podTop) podTop.style.display = 'flex';
    } else if (this.seatCount === 3) {
      if (podLeft) podLeft.style.display = 'flex';
      if (podTop) podTop.style.display = 'flex';
      if (podRight) podRight.style.display = 'none';
    } else {
      if (podLeft) podLeft.style.display = 'flex';
      if (podTop) podTop.style.display = 'flex';
      if (podRight) podRight.style.display = 'flex';
    }

    const addBotBtn = document.getElementById('btn-add-bot');
    if (addBotBtn) {
      addBotBtn.style.display = (this.seatCount < 4 && this.isHost) ? 'flex' : 'none';
    }
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
    this.spectatorBadge = document.getElementById('spectator-badge');

    // AV Live Controls
    this.btnToggleMic = document.getElementById('btn-toggle-mic');
    this.btnToggleCam = document.getElementById('btn-toggle-cam');
    this.btnAddBot = document.getElementById('btn-add-bot');

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
    this.modalHostRoom = document.getElementById('modal-host-room');
    this.modalJoinRoom = document.getElementById('modal-join-room');
    this.modalRules = document.getElementById('modal-rules');
    this.modalGameOver = document.getElementById('modal-game-over');
    this.modalCrazy8Suit = document.getElementById('modal-wild-suit');
    this.modalSpadesBid = document.getElementById('modal-spades-bid');

    // Online Host & Join Elements
    this.displayRoomCode = document.getElementById('display-room-code');
    this.btnCopyCode = document.getElementById('btn-copy-code');
    this.inputJoinCode = document.getElementById('input-join-code');
    this.btnConfirmJoin = document.getElementById('btn-confirm-join');
    this.btnJoinSpectator = document.getElementById('btn-join-spectator');
    this.hostStatusMessage = document.getElementById('host-status-message');
    this.joinStatusMessage = document.getElementById('join-status-message');
    this.joinInputSection = document.getElementById('join-input-section');
    this.guestWaitingSection = document.getElementById('guest-waiting-section');
    this.guestRosterList = document.getElementById('guest-roster-list');
    this.guestStatusMessage = document.getElementById('guest-status-message');
    this.roomRosterList = document.getElementById('room-roster-list');
    this.btnHostStartGame = document.getElementById('btn-host-start-game');
    this.btnLobbyAddBot = document.getElementById('btn-lobby-add-bot');
    this.btnLeaveRoom = document.getElementById('btn-leave-room');
    this.btnJoinRoomModal = document.getElementById('btn-join-room-modal');

    // Game Over Elements
    this.gameOverTitle = document.getElementById('game-over-title');
    this.gameOverDesc = document.getElementById('game-over-desc');
    this.btnRematch = document.getElementById('btn-rematch');
    this.btnGameOverMenu = document.getElementById('btn-game-over-menu');

    // Player Left Elements
    this.modalPlayerLeft = document.getElementById('modal-player-left');
    this.playerLeftTitle = document.getElementById('player-left-title');
    this.playerLeftDesc = document.getElementById('player-left-desc');
    this.btnReplaceAi = document.getElementById('btn-replace-ai');
    this.btnPlayerLeftLeave = document.getElementById('btn-player-left-leave');
  }

  bindEvents() {
    // Theme toggle
    if (this.btnToggleTheme) {
      this.btnToggleTheme.addEventListener('click', () => {
        this.currentTheme = this.currentTheme === 'family_food' ? 'classic' : 'family_food';
        if (typeof setDeckTheme !== 'undefined') setDeckTheme(this.currentTheme);
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

    // Mic toggle
    if (this.btnToggleMic) {
      this.btnToggleMic.addEventListener('click', async () => {
        if (!this.media.isMediaActive) {
          try {
            await this.media.startMedia({ video: false, audio: true });
            this.btnToggleMic.textContent = '🎙️';
            this.showToast('Microphone connected!');
          } catch (e) {
            this.showToast('Could not access microphone.');
          }
        } else {
          const isUnmuted = this.media.toggleAudio();
          this.btnToggleMic.textContent = isUnmuted ? '🎙️' : '🔇';
          this.btnToggleMic.style.borderColor = isUnmuted ? '#10b981' : '#ef4444';
          this.showToast(isUnmuted ? 'Microphone unmuted' : 'Microphone muted');
        }
      });
    }

    // Camera toggle
    if (this.btnToggleCam) {
      this.btnToggleCam.addEventListener('click', async () => {
        if (!this.media.isMediaActive || !this.media.localStream || this.media.localStream.getVideoTracks().length === 0) {
          try {
            await this.media.startMedia({ video: true, audio: true });
            this.btnToggleCam.textContent = '📹';
            this.showToast('Camera active!');
          } catch (e) {
            this.showToast('Could not access camera.');
          }
        } else {
          const isVideoOn = this.media.toggleVideo();
          this.btnToggleCam.textContent = isVideoOn ? '📹' : '📷⃠';
          this.btnToggleCam.style.borderColor = isVideoOn ? '#3b82f6' : '#64748b';
          this.showToast(isVideoOn ? 'Camera turned on' : 'Camera turned off');
        }
      });
    }

    // Add Bot Button
    if (this.btnAddBot) {
      this.btnAddBot.addEventListener('click', () => {
        if (this.seatCount < 4) {
          this.setSeatCount(this.seatCount + 1);
          this.showToast(`Expanded table to ${this.seatCount} players with AI bot!`);
        }
      });
    }

    // Seat count picker in Welcome modal
    document.querySelectorAll('.seat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const count = parseInt(btn.dataset.seats, 10);
        if (count) this.setSeatCount(count);
      });
    });

    // Global user interaction listener to resume audio contexts and remote audio elements
    const resumeAudioOnInteract = () => {
      if (this.media && this.media.resumeAllAudio) {
        this.media.resumeAllAudio();
      }
    };
    document.addEventListener('click', resumeAudioOnInteract, { passive: true });
    document.addEventListener('touchstart', resumeAudioOnInteract, { passive: true });

    // Menu / Game Selection
    if (this.btnMainMenu) {
      this.btnMainMenu.addEventListener('click', () => {
        sessionStorage.removeItem('card_arcadia_room_session');
        window.history.replaceState({}, '', window.location.pathname);
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

    // Start Mode Buttons in Welcome Modal
    const btnStartAi = document.getElementById('btn-start-ai');
    if (btnStartAi) {
      btnStartAi.addEventListener('click', () => {
        this.mode = 'AI';
        this.isHost = true;
        this.isSpectator = false;
        this.localPlayerId = 0;
        this.closeModal('modal-welcome');
        this.startActiveGame();
        this.promptMediaAccess();
      });
    }

    const btnStartOnline = document.getElementById('btn-start-online');
    if (btnStartOnline) {
      btnStartOnline.addEventListener('click', () => {
        this.openHostRoomModal();
      });
    }

    if (this.btnJoinRoomModal) {
      this.btnJoinRoomModal.addEventListener('click', () => {
        this.closeModal('modal-welcome');
        this.openModal('modal-join-room');
      });
    }

    if (this.btnLeaveRoom) {
      this.btnLeaveRoom.addEventListener('click', () => {
        this.leaveRoom();
      });
    }

    // Player Left / AI Replacement Buttons
    if (this.btnReplaceAi) {
      this.btnReplaceAi.addEventListener('click', async () => {
        if (this.pendingLeftPlayerSeat !== null && this.pendingLeftPlayerSeat !== undefined) {
          const seat = this.pendingLeftPlayerSeat;
          this.pendingLeftPlayerSeat = null;
          this.closeModal('modal-player-left');
          
          if (this.firebaseRoom) {
            await this.firebaseRoom.replacePlayerWithAi(seat, 'DadBot');
          }
          this.showToast('🤖 AI Bot has stepped in to continue the game!');
          
          const state = this.getCurrentState();
          if (state && state.activeTurnPlayer === seat) {
            this.triggerAiTurnIfNeeded(state);
          }
        }
      });
    }

    if (this.btnPlayerLeftLeave) {
      this.btnPlayerLeftLeave.addEventListener('click', () => {
        this.pendingLeftPlayerSeat = null;
        this.closeModal('modal-player-left');
        this.leaveRoom();
      });
    }

    // Online Join / Spectate Buttons
    if (this.btnConfirmJoin) {
      this.btnConfirmJoin.addEventListener('click', () => {
        const code = this.inputJoinCode ? this.inputJoinCode.value.trim() : '';
        if (code.length >= 4) {
          this.joinOnlineRoom(code, false);
        } else {
          if (this.joinStatusMessage) this.joinStatusMessage.textContent = '⚠️ Please enter a valid room code.';
          this.showToast('Please enter a valid room code.');
        }
      });
    }

    if (this.btnJoinSpectator) {
      this.btnJoinSpectator.addEventListener('click', () => {
        const code = this.inputJoinCode ? this.inputJoinCode.value.trim() : '';
        if (code.length >= 4) {
          this.joinOnlineRoom(code, true);
        } else {
          if (this.joinStatusMessage) this.joinStatusMessage.textContent = '⚠️ Please enter a valid room code.';
          this.showToast('Please enter a valid room code to spectate.');
        }
      });
    }

    if (this.btnCopyCode) {
      this.btnCopyCode.addEventListener('click', () => {
        if (this.network.roomId) {
          const url = `${window.location.origin}${window.location.pathname}?room=${this.network.roomId}`;
          navigator.clipboard.writeText(url).then(() => {
            this.showToast('📋 Room link copied to clipboard!');
          }).catch(() => {
            navigator.clipboard.writeText(this.network.roomId);
            this.showToast('📋 Room Code copied!');
          });
        }
      });
    }

    if (this.btnHostStartGame) {
      this.btnHostStartGame.addEventListener('click', () => {
        this.closeModal('modal-host-room');

        // Configure multiplayer human players across engines
        const roster = this.network ? this.network.getRoster() : [];
        if (this.pokerEngine && this.pokerEngine.configureMultiplayerPlayers) {
          this.pokerEngine.configureMultiplayerPlayers(roster);
        }
        if (this.crazy8Engine && this.crazy8Engine.configureMultiplayerPlayers) {
          this.crazy8Engine.configureMultiplayerPlayers(roster);
        }
        if (this.spadesEngine && this.spadesEngine.configureMultiplayerPlayers) {
          this.spadesEngine.configureMultiplayerPlayers(roster);
        }

        this.startActiveGame();
        if (this.network && this.isHost) {
          this.network.broadcast({
            type: 'GAME_START_SIGNAL',
            gameType: this.activeGame,
            state: this.getCurrentState()
          });
        }
        this.promptMediaAccess();
        this.showToast('🎮 Multiplayer game started! Cards dealt!');
      });
    }

    if (this.btnLobbyAddBot) {
      this.btnLobbyAddBot.addEventListener('click', () => {
        if (this.seatCount < 4) {
          this.setSeatCount(this.seatCount + 1);
          this.showToast(`Added AI Bot to table (${this.seatCount} seats)!`);
          if (this.isHost && this.btnHostStartGame) {
            this.btnHostStartGame.style.display = 'block';
            this.btnHostStartGame.textContent = `▶ START MULTIPLAYER GAME (${this.seatCount} Players)`;
          }
        } else {
          this.showToast('Table is at maximum capacity (4 players).');
        }
      });
    }

    // Poker Action Buttons
    if (this.btnFold) {
      this.btnFold.addEventListener('click', () => this.handleLocalPokerAction('fold'));
    }
    if (this.btnCheckCall) {
      this.btnCheckCall.addEventListener('click', () => {
        const state = this.getCurrentState();
        const me = state.players[this.localPlayerId];
        const callDiff = (state.currentBet || 0) - (me ? me.currentRoundBet || 0 : 0);
        this.handleLocalPokerAction(callDiff > 0 ? 'call' : 'check');
      });
    }
    if (this.btnBetRaise) {
      this.btnBetRaise.addEventListener('click', () => {
        const amount = parseInt(this.betSlider.value, 10);
        this.handleLocalPokerAction('raise', amount);
      });
    }
    if (this.btnAllIn) {
      this.btnAllIn.addEventListener('click', () => this.handleLocalPokerAction('allin'));
    }

    if (this.betSlider) {
      this.betSlider.addEventListener('input', () => {
        const val = this.betSlider.value;
        if (this.btnBetRaise) {
          const state = this.getCurrentState();
          const me = state.players[this.localPlayerId];
          const callDiff = (state.currentBet || 0) - (me ? me.currentRoundBet || 0 : 0);
          this.btnBetRaise.textContent = callDiff > 0 ? `RAISE TO $${val}` : `BET $${val}`;
        }
      });
    }

    // Bet Preset Chips
    document.querySelectorAll('.preset-chip[data-val]').forEach(chip => {
      chip.addEventListener('click', () => {
        const type = chip.dataset.val;
        const state = this.getCurrentState();
        const me = state.players[this.localPlayerId];
        if (!me) return;

        const bb = state.bigBlind || 20;
        const pot = state.pot || 0;
        const minBet = state.currentBet > 0 ? state.currentBet + bb : bb;
        const maxBet = me.chips + (me.currentRoundBet || 0);

        let target = minBet;
        if (type === '2bb') target = bb * 2;
        else if (type === '3bb') target = bb * 3;
        else if (type === 'pot') target = Math.max(minBet, pot);
        else if (type === 'max') target = maxBet;

        target = Math.max(minBet, Math.min(maxBet, target));
        if (this.betSlider) {
          this.betSlider.value = target;
          this.betSlider.dispatchEvent(new Event('input'));
        }
      });
    });

    // Draft Buttons
    if (this.btnDraftKeep) {
      this.btnDraftKeep.addEventListener('click', () => this.handleLocalDraftDecision('keep'));
    }
    if (this.btnDraftDiscard) {
      this.btnDraftDiscard.addEventListener('click', () => this.handleLocalDraftDecision('discard'));
    }

    // Showdown Next
    if (this.btnShowdownNext) {
      this.btnShowdownNext.addEventListener('click', () => {
        this.showdownBanner.style.display = 'none';
        if (this.isHost) {
          this.pokerEngine.startNewRound();
        }
      });
    }

    // Rematch
    if (this.btnRematch) {
      this.btnRematch.addEventListener('click', () => {
        this.closeModal('modal-game-over');
        this.startActiveGame();
      });
    }

    // Wild 8 Suit buttons
    document.querySelectorAll('.btn-wild-suit').forEach(btn => {
      btn.addEventListener('click', () => {
        const suit = btn.dataset.suit;
        if (suit) {
          this.crazy8Engine.setWildSuit(this.localPlayerId, suit);
          this.closeModal('modal-wild-suit');
        }
      });
    });

    // Close Modals
    const btnCloseHost = document.getElementById('btn-close-host-modal');
    if (btnCloseHost) btnCloseHost.addEventListener('click', () => this.leaveRoom());
    const btnCloseJoin = document.getElementById('btn-close-join-modal');
    if (btnCloseJoin) {
      btnCloseJoin.addEventListener('click', () => {
        this.closeModal('modal-join-room');
        this.openModal('modal-welcome');
      });
    }
    const btnCloseRules = document.getElementById('btn-close-rules');
    if (btnCloseRules) btnCloseRules.addEventListener('click', () => this.closeModal('modal-rules'));
    const btnDismissRules = document.getElementById('btn-dismiss-rules');
    if (btnDismissRules) btnDismissRules.addEventListener('click', () => this.closeModal('modal-rules'));
    const btnGameOverMenu = document.getElementById('btn-game-over-menu');
    if (btnGameOverMenu) {
      btnGameOverMenu.addEventListener('click', () => {
        this.closeModal('modal-game-over');
        this.openModal('modal-welcome');
      });
    }
  }

  checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    
    // Check saved session in sessionStorage for auto-reconnect on refresh
    let savedSession = null;
    try {
      const raw = sessionStorage.getItem('card_arcadia_room_session');
      if (raw) savedSession = JSON.parse(raw);
    } catch (e) {}

    if (savedSession && savedSession.roomId) {
      console.log('[App] Restoring previous room session:', savedSession);
      if (savedSession.isHost) {
        this.openHostRoomModal(savedSession.roomId);
      } else {
        this.joinOnlineRoom(savedSession.roomId, savedSession.role === 'spectator', savedSession.seatIndex);
      }
      return;
    }

    if (roomParam) {
      const cleanCode = roomParam.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      this.closeModal('modal-welcome');
      this.openModal('modal-join-room');
      if (this.inputJoinCode) this.inputJoinCode.value = cleanCode;
      if (this.joinStatusMessage) this.joinStatusMessage.textContent = 'Room link detected! Click Join as Player or Spectator.';
    }
  }

  async promptMediaAccess() {
    try {
      await this.media.startMedia({ video: true, audio: true });
      if (this.btnToggleCam) this.btnToggleCam.textContent = '📹';
      if (this.btnToggleMic) this.btnToggleMic.textContent = '🎙️';
    } catch (e) {
      console.log('AV Prompt skipped or denied:', e);
    }
  }

  /* =========================================================================
     AV & MEDIA INTEGRATION
     ========================================================================= */
  onMediaStreamAdded({ peerId, seatIndex, stream }) {
    console.log(`[App AV] Attached stream for peer ${peerId} to seat ${seatIndex}`);
    this.showToast(`Connected video & voice for seat ${seatIndex + 1}!`);
  }

  onMediaStreamRemoved({ peerId, seatIndex }) {
    console.log(`[App AV] Removed stream for peer ${peerId}`);
  }

  onSpeakingChange({ seatIndex, isSpeaking }) {
    // Halo pulse handled in MediaManager
  }

  onMediaStateChange(state) {
    if (this.btnToggleMic) {
      this.btnToggleMic.textContent = state.audioEnabled ? '🎙️' : '🔇';
    }
    if (this.btnToggleCam) {
      this.btnToggleCam.textContent = state.videoEnabled ? '📹' : '📷⃠';
    }
  }

  /* =========================================================================
     MULTIPLAYER NETWORKING & ROOMS
     ========================================================================= */
  updateRoomBadge(roomCode) {
    const code = roomCode || (this.firebaseRoom ? this.firebaseRoom.roomCode : null) || (this.network ? this.network.roomId : null);
    if (code && code !== 'null' && code !== 'undefined' && code !== '------') {
      if (this.roomBadge) this.roomBadge.style.display = 'flex';
      if (this.roomBadgeText) this.roomBadgeText.innerHTML = `Room: <strong>${code}</strong>`;
      if (this.btnLeaveRoom) this.btnLeaveRoom.style.display = 'inline-flex';
    } else {
      if (this.roomBadge) this.roomBadge.style.display = 'none';
      if (this.btnLeaveRoom) this.btnLeaveRoom.style.display = 'none';
    }
  }

  async openHostRoomModal(customCode = null) {
    this.mode = 'ONLINE';
    this.isHost = true;
    this.isSpectator = false;
    this.localPlayerId = 0;

    try {
      this.closeModal('modal-welcome');
      this.closeModal('modal-join-room');
      this.openModal('modal-host-room');
      if (this.hostStatusMessage) this.hostStatusMessage.textContent = '⏳ Creating cloud room...';

      // 1. Create Room in Firebase RTDB (with P2P fallback)
      let code = customCode;
      if (this.firebaseRoom) {
        try {
          code = await this.firebaseRoom.createRoom(customCode, {
            seatCount: this.seatCount,
            gameType: this.activeGame,
            name: 'Player 1',
            initialGameState: this.getCurrentState()
          });
        } catch (fbErr) {
          console.warn('[Firebase Room] Cloud setup notice, continuing with direct P2P:', fbErr);
          code = await this.network.createRoom(customCode, 'Player 1');
        }
      } else {
        code = await this.network.createRoom(customCode, 'Player 1');
      }

      if (this.displayRoomCode) this.displayRoomCode.textContent = code;
      this.updateRoomBadge(code);
      if (this.btnShareRoom) this.btnShareRoom.style.display = 'flex';
      if (this.hostStatusMessage) this.hostStatusMessage.textContent = '⏳ Waiting for other player(s) to join...';

      // 2. Initialize P2P Peer for AV Video & Voice Mesh
      try {
        await this.network.createRoom(code, 'Player 1');
        this.media.attachPeer(this.network.peer, 0, false);
      } catch (peerErr) {
        console.warn('[AV Peer] Notice:', peerErr);
      }

      // Persist session & update URL
      sessionStorage.setItem('card_arcadia_room_session', JSON.stringify({
        roomId: code,
        isHost: true,
        role: 'player',
        seatIndex: 0
      }));
      window.history.replaceState({}, '', `?room=${code}`);
    } catch (err) {
      console.error('[Host Room Error]', err);
      if (this.hostStatusMessage) this.hostStatusMessage.textContent = `⚠️ Error: ${err.message || 'Check connection'}`;
      this.showToast(`Error creating room: ${err.message || 'Check connection'}`);
    }
  }

  async joinOnlineRoom(code, asSpectator = false, preferredSeat = null) {
    this.mode = 'ONLINE';
    this.isHost = false;
    this.isSpectator = asSpectator;

    try {
      this.closeModal('modal-welcome');
      this.openModal('modal-join-room');
      if (this.joinStatusMessage) this.joinStatusMessage.textContent = asSpectator ? 'Joining as spectator...' : 'Connecting to room...';

      let roomId = code;
      // 1. Join Room in Firebase RTDB (with P2P fallback)
      if (this.firebaseRoom) {
        try {
          roomId = await this.firebaseRoom.joinRoom(code, asSpectator ? 'Spectator' : 'Player 2', asSpectator, preferredSeat);
          this.localPlayerId = this.firebaseRoom.mySeatIndex !== null ? this.firebaseRoom.mySeatIndex : 1;
        } catch (fbErr) {
          console.warn('[Firebase Room] Cloud join notice, continuing with direct P2P:', fbErr);
          roomId = await this.network.joinRoom(code, asSpectator ? 'Spectator' : 'Player 2', asSpectator, preferredSeat);
          this.localPlayerId = this.network.mySeatIndex !== null ? this.network.mySeatIndex : 1;
        }
      } else {
        roomId = await this.network.joinRoom(code, asSpectator ? 'Spectator' : 'Player 2', asSpectator, preferredSeat);
        this.localPlayerId = this.network.mySeatIndex !== null ? this.network.mySeatIndex : 1;
      }
      
      this.updateRoomBadge(roomId);
      if (this.spectatorBadge) this.spectatorBadge.style.display = asSpectator ? 'flex' : 'none';

      // 2. Initialize P2P Peer for AV Video & Voice Mesh
      try {
        await this.network.joinRoom(roomId, asSpectator ? 'Spectator' : `Player ${this.localPlayerId + 1}`, asSpectator, this.localPlayerId);
        this.media.attachPeer(this.network.peer, this.localPlayerId, asSpectator);
      } catch (peerErr) {
        console.warn('[AV Peer] Notice:', peerErr);
      }

      // Persist session & update URL
      sessionStorage.setItem('card_arcadia_room_session', JSON.stringify({
        roomId: roomId,
        isHost: false,
        role: asSpectator ? 'spectator' : 'player',
        seatIndex: this.localPlayerId
      }));
      window.history.replaceState({}, '', `?room=${roomId}`);

      // Transition guest modal to waiting state
      if (!this.isGameActive) {
        if (this.joinInputSection) this.joinInputSection.style.display = 'none';
        if (this.guestWaitingSection) this.guestWaitingSection.style.display = 'block';
        if (this.guestStatusMessage) this.guestStatusMessage.textContent = '⏳ Waiting for other player / game start...';
      }

      this.showToast(`Connected to room ${roomId}!`);
    } catch (err) {
      console.error('[Join Room Error]', err);
      if (this.joinStatusMessage) this.joinStatusMessage.textContent = `⚠️ Failed to join: ${err.message || 'Room not found'}`;
      this.showToast(`Failed to join room: ${err.message || 'Room not found'}`);
    }
  }

  async leaveRoom() {
    console.log('[App] Leaving room...');
    sessionStorage.removeItem('card_arcadia_room_session');
    window.history.replaceState({}, '', window.location.pathname);

    if (this.firebaseRoom) {
      await this.firebaseRoom.leaveRoom();
    }
    if (this.media) {
      this.media.destroy();
    }
    if (this.network) {
      this.network.disconnect();
    }

    this.mode = 'AI';
    this.isHost = true;
    this.isSpectator = false;
    this.isGameActive = false;
    this.localPlayerId = 0;
    this.latestRemoteState = null;
    this.pendingLeftPlayerSeat = null;

    this.updateRoomBadge(null);
    if (this.spectatorBadge) this.spectatorBadge.style.display = 'none';
    if (this.btnShareRoom) this.btnShareRoom.style.display = 'none';

    if (this.joinInputSection) this.joinInputSection.style.display = 'block';
    if (this.guestWaitingSection) this.guestWaitingSection.style.display = 'none';
    if (this.inputJoinCode) this.inputJoinCode.value = '';
    if (this.joinStatusMessage) this.joinStatusMessage.textContent = '';

    this.closeModal('modal-host-room');
    this.closeModal('modal-join-room');
    this.closeModal('modal-player-left');
    this.closeModal('modal-game-over');
    this.openModal('modal-welcome');

    this.showToast('🚪 Left room. Returned to Main Menu.');
  }

  onFirebaseStateChange(state) {
    if (!state) return;
    this.latestRemoteState = state;
    
    // Auto-enter game if active round in cloud
    if (state.phase && state.phase !== 'LOBBY' && !this.isGameActive) {
      this.isGameActive = true;
      this.closeModal('modal-join-room');
      this.closeModal('modal-host-room');
      this.closeModal('modal-welcome');
      this.promptMediaAccess();
    }

    this.render();
    this.triggerAiTurnIfNeeded(state);
  }

  onFirebaseRosterChange(roster) {
    this.onRosterChange(roster);
  }

  onFirebasePlayerLeft(info) {
    console.log(`[App] Player at seat ${info.seatIndex} (${info.name}) left.`);
    this.pendingLeftPlayerSeat = info.seatIndex;
    if (this.playerLeftDesc) {
      this.playerLeftDesc.textContent = `${info.name || `Player ${info.seatIndex + 1}`} has left the table. Would you like to replace them with an AI Bot to keep playing, or leave the room?`;
    }
    this.openModal('modal-player-left');
  }

  onFirebaseActionReceived(action) {
    console.log('[App Firebase Action]', action);
  }

  onNetworkConnected(info) {
    console.log('[App] AV Network connected:', info);
    if (info && info.roomId) {
      this.updateRoomBadge(info.roomId);
    }
    if (this.network.peer) {
      const roster = info.roster || [];
      roster.forEach(p => {
        if (p.peerId !== this.network.localPeerId) {
          this.media.callPeer(p.peerId, p.seatIndex);
        }
      });
    }

    // Auto-sync for reconnecting guest into active game
    if (!this.isHost && info && info.joinAckData) {
      const ack = info.joinAckData;
      if (ack.activeGame) this.switchGame(ack.activeGame);
      if (ack.state) this.latestRemoteState = ack.state;
      if (ack.isGameActive) {
        this.isGameActive = true;
        this.closeModal('modal-join-room');
        this.closeModal('modal-host-room');
        this.closeModal('modal-welcome');
        this.promptMediaAccess();
        this.showToast('🎮 Rejoined active game!');
      }
    }

    if (this.isHost) {
      this.network.broadcast({
        type: 'GAME_STATE_UPDATE',
        state: this.getCurrentState()
      });
    }
    this.render();
  }

  onNetworkDisconnected(peerId) {
    console.log('[App] Network peer disconnected:', peerId);
    if (peerId) this.media.cleanupPeer(peerId);
  }

  onNetworkStatus(status) {
    console.log('[App Status]', status);
    if (this.isHost && this.hostStatusMessage) {
      this.hostStatusMessage.textContent = `⏳ ${status}`;
    }
    if (this.joinStatusMessage) {
      this.joinStatusMessage.textContent = `⏳ ${status}`;
    }
    if (this.guestStatusMessage) {
      this.guestStatusMessage.textContent = `⏳ ${status}`;
    }
  }

  onRosterChange(roster) {
    const list = roster || [];
    const rosterHtml = list.map(p => `
      <div class="roster-player-item">
        <span>${p.name}</span>
        <span class="roster-badge ${p.role === 'spectator' ? 'badge-spectator' : 'badge-seat'}">
          ${p.role === 'spectator' ? 'Spectator' : `Seat ${p.seatIndex + 1}`}
        </span>
      </div>
    `).join('');

    if (this.roomRosterList) {
      this.roomRosterList.innerHTML = rosterHtml;
    }
    if (this.guestRosterList) {
      this.guestRosterList.innerHTML = rosterHtml;
    }

    list.forEach(p => {
      if (p.peerId && p.seatIndex !== undefined && p.seatIndex !== null) {
        this.media.setPeerSeat(p.peerId, p.seatIndex);
      }
    });

    const activeSeats = list.filter(p => p.role === 'player' && p.seatIndex !== null).length;
    if (activeSeats >= 2) {
      if (activeSeats > this.seatCount) {
        this.setSeatCount(activeSeats);
      }
      if (this.hostStatusMessage) {
        this.hostStatusMessage.textContent = `✅ Ready (${activeSeats} players connected)`;
      }
      if (this.guestStatusMessage) {
        this.guestStatusMessage.textContent = `✅ ${activeSeats} players connected. Waiting for Host to start...`;
      }
      if (this.isHost && this.btnHostStartGame) {
        this.btnHostStartGame.style.display = 'block';
        this.btnHostStartGame.textContent = `▶ START MULTIPLAYER GAME (${activeSeats} Players)`;
      }
    } else {
      if (this.hostStatusMessage) {
        this.hostStatusMessage.textContent = '⏳ Waiting for other player(s) to join...';
      }
      if (this.isHost && this.btnHostStartGame) {
        this.btnHostStartGame.style.display = 'none';
      }
    }
  }

  onNetworkMessage(data, fromPeerId) {
    if (data.type === 'GAME_START_SIGNAL') {
      this.isGameActive = true;
      this.closeModal('modal-join-room');
      this.closeModal('modal-host-room');
      this.closeModal('modal-welcome');
      if (typeof SoundFX !== 'undefined') SoundFX.play('shuffle');
      if (data.gameType) this.switchGame(data.gameType);
      if (data.state) this.latestRemoteState = data.state;
      this.promptMediaAccess();
      this.showToast('🎮 Multiplayer duel started! Dealing cards...');
      this.render();
      return;
    }

    if (data.type === 'GAME_STATE_UPDATE') {
      this.latestRemoteState = data.state;
      this.render();
      return;
    }

    if (this.isHost && data.type === 'ACTION_REQUEST') {
      this.handleRemoteActionRequest(data, fromPeerId);
    }
  }

  onNetworkError(err) {
    console.error('[App] Network Error:', err);
  }

  /* =========================================================================
     GAME STATE DISPATCHING & RENDERING
     ========================================================================= */
  switchGame(gameType) {
    this.activeGame = gameType;
    if (this.headerGameTitle) {
      const titles = {
        POKER_DUEL: 'POKER DUEL (RING)',
        CRAZY_EIGHTS: 'CRAZY EIGHTS',
        SPADES: 'SPADES',
        GO_FISH: 'GO FISH'
      };
      this.headerGameTitle.textContent = titles[gameType] || 'CARD ARCADIA';
    }
    this.updateTableLayoutPods();
  }

  startActiveGame() {
    this.isGameActive = true;
    this.updateTableLayoutPods();
    const engine = this.getCurrentEngine();
    if (engine.startNewRound) {
      engine.startNewRound();
    } else if (engine.startNewGame) {
      engine.startNewGame();
    }
    this.render();
  }

  onEngineStateChange(gameType, state) {
    if (gameType === this.activeGame) {
      if (this.mode === 'ONLINE') {
        if (this.firebaseRoom && this.firebaseRoom.roomCode) {
          this.firebaseRoom.updateGameState(state);
        }
        if (this.isHost && this.network) {
          this.network.broadcast({
            type: 'GAME_STATE_UPDATE',
            state
          });
        }
      }
      this.render();
      this.triggerAiTurnIfNeeded(state);
    }
  }

  onEngineEvent(gameType, event) {
    console.log(`[Event: ${gameType}]`, event);
    if (event.type === 'PLAYER_CALLED' || event.type === 'PLAYER_RAISED') {
      if (typeof SoundFX !== 'undefined') SoundFX.play('chips');
    } else if (event.type === 'SHOWDOWN_COMPLETED' || event.type === 'CRAZY_EIGHTS_WON' || event.type === 'SPADES_ROUND_COMPLETED') {
      if (typeof SoundFX !== 'undefined') SoundFX.play('win');
      if (typeof confetti !== 'undefined') {
        confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
      }
    }
  }

  triggerAiTurnIfNeeded(state) {
    if (this.mode === 'ONLINE' && !this.isHost) return;

    if (this.activeGame === GAME_TYPES.POKER_DUEL) {
      const activePlayer = state.players[state.activeTurnPlayer];
      if (activePlayer && activePlayer.isAi && (state.phase === 'PRE_DRAFT_BETTING' || state.phase === 'CARD_BETTING')) {
        setTimeout(() => {
          const bot = this.aiManager.getBot(activePlayer.id);
          const decision = bot.decideBet(state, activePlayer.id);
          this.pokerEngine.handleBetAction(activePlayer.id, decision.action, decision.amount || 0);
        }, 900);
      } else if (state.phase === 'DRAFTING') {
        const draftPlayer = state.players[state.activeDraftPlayer];
        if (draftPlayer && draftPlayer.isAi && state.currentDrawnCard) {
          setTimeout(() => {
            const bot = this.aiManager.getBot(draftPlayer.id);
            const decision = bot.decideDraft(state.currentDrawnCard, draftPlayer.holeCards, state.communityCards);
            this.pokerEngine.handleDraftDecision(draftPlayer.id, decision);
          }, 900);
        }
      }
    } else if (this.activeGame === GAME_TYPES.CRAZY_EIGHTS) {
      const activePlayer = state.players[state.activePlayerId];
      if (activePlayer && activePlayer.isAi && state.phase === 'PLAY') {
        setTimeout(() => {
          const bot = this.aiManager.getBot(activePlayer.id);
          const top = this.crazy8Engine.getTopCard();
          const valid = activePlayer.hand.filter(c => this.crazy8Engine.isValidPlay(c, top));
          const decision = bot.decideCrazyEight(state, activePlayer.id, valid);

          if (decision.action === 'play') {
            this.crazy8Engine.playCard(activePlayer.id, decision.cardId, decision.wildSuit);
          } else {
            this.crazy8Engine.drawCard(activePlayer.id);
          }
        }, 800);
      }
    } else if (this.activeGame === GAME_TYPES.SPADES) {
      const activePlayer = state.players[state.activePlayerId];
      if (activePlayer && activePlayer.isAi) {
        if (state.phase === 'BIDDING') {
          setTimeout(() => {
            const bot = this.aiManager.getBot(activePlayer.id);
            const bid = bot.decideSpadesBid(activePlayer.hand);
            this.spadesEngine.submitBid(activePlayer.id, bid);
          }, 800);
        } else if (state.phase === 'TRICK_PLAYING') {
          setTimeout(() => {
            const bot = this.aiManager.getBot(activePlayer.id);
            const valid = activePlayer.hand.filter(c => this.spadesEngine.isValidTrickPlay(activePlayer.id, c));
            const cardToPlay = bot.decideSpadesTrickPlay(state, activePlayer.id, valid);
            if (cardToPlay) {
              this.spadesEngine.playTrickCard(activePlayer.id, cardToPlay.id);
            }
          }, 900);
        }
      }
    }
  }

  handleLocalPokerAction(action, amount = 0) {
    if (this.isSpectator) return;
    if (this.mode === 'ONLINE' && !this.isHost) {
      this.network.send({
        type: 'ACTION_REQUEST',
        game: 'POKER_DUEL',
        action,
        amount,
        playerId: this.localPlayerId
      });
      return;
    }
    this.pokerEngine.handleBetAction(this.localPlayerId, action, amount);
  }

  handleLocalDraftDecision(decision) {
    if (this.isSpectator) return;
    if (this.mode === 'ONLINE' && !this.isHost) {
      this.network.send({
        type: 'ACTION_REQUEST',
        game: 'POKER_DUEL',
        action: 'draft',
        decision,
        playerId: this.localPlayerId
      });
      return;
    }
    this.pokerEngine.handleDraftDecision(this.localPlayerId, decision);
  }

  render() {
    const state = this.getCurrentState();
    if (!state) return;

    if (this.activeGame === GAME_TYPES.POKER_DUEL) {
      this.renderPokerTable(state);
    } else if (this.activeGame === GAME_TYPES.CRAZY_EIGHTS) {
      this.renderCrazy8Table(state);
    } else if (this.activeGame === GAME_TYPES.SPADES) {
      this.renderSpadesTable(state);
    }
  }

  getDomSeatIndex(playerId, totalPlayers) {
    if (this.isSpectator) {
      if (totalPlayers === 2) return (playerId === 0) ? 0 : 2;
      return playerId;
    }
    const relativeSeat = (playerId - this.localPlayerId + totalPlayers) % totalPlayers;
    if (totalPlayers === 2) {
      return (relativeSeat === 0) ? 0 : 2; // 0 = Bottom (You), 2 = Top (Opponent)
    }
    return relativeSeat; // 0 = Bottom (You), 1 = Left, 2 = Top, 3 = Right
  }

  renderPokerTable(state) {
    if (this.pokerCommunityContainer) this.pokerCommunityContainer.style.display = 'block';
    if (this.centerArcadeStage) this.centerArcadeStage.style.display = 'none';
    if (this.handStrengthMeter) this.handStrengthMeter.style.display = 'flex';
    if (this.actionControlsContainer) this.actionControlsContainer.style.display = this.isSpectator ? 'none' : 'flex';

    // Pot & Blinds
    if (this.potAmount) this.potAmount.textContent = `$${state.pot || 0}`;
    if (this.roundBlindsInfo) {
      this.roundBlindsInfo.textContent = `Round ${state.roundNumber || 1} • Blinds: $${state.smallBlind || 10} / $${state.bigBlind || 20}`;
    }

    // Community Cards (5 slots)
    const commCards = state.communityCards || [];
    for (let i = 0; i < 5; i++) {
      const slotEl = document.getElementById(`slot-${i}`);
      if (!slotEl) continue;
      if (commCards[i]) {
        slotEl.innerHTML = createCardHTML(commCards[i], false, this.currentTheme);
      } else {
        slotEl.innerHTML = `<span class="slot-number">${i + 1}</span>`;
      }
    }

    // Render Players Pods with Local Seat Perspective
    const players = state.players || [];
    players.forEach((p) => {
      const domSeatIndex = this.getDomSeatIndex(p.id, players.length);

      const nameEl = document.getElementById(`player-name-${domSeatIndex}`);
      const chipsEl = document.getElementById(`player-chips-${domSeatIndex}`);
      const betBadgeEl = document.getElementById(`bet-badge-${domSeatIndex}`);
      const cardsEl = document.getElementById(`player-cards-${domSeatIndex}`);
      const infoCardEl = document.getElementById(`info-card-${domSeatIndex}`);

      const isSelf = (p.id === this.localPlayerId && !this.isSpectator);

      const avatarIconEl = document.getElementById(`avatar-icon-${domSeatIndex}`);
      if (avatarIconEl) {
        avatarIconEl.textContent = p.avatar || (p.isAi ? '🤖' : (isSelf ? '🤠' : '👩‍💼'));
      }

      let displayName = p.name;
      if (isSelf) {
        displayName = 'You';
      } else {
        if (p.isAi) {
          displayName = p.name;
        } else {
          displayName = (p.name === 'You' || p.name === 'DadBot') ? `Player ${p.id + 1}` : p.name;
        }
      }
      if (nameEl) nameEl.textContent = displayName;
      if (chipsEl) chipsEl.textContent = `💰 $${p.chips}`;

      if (betBadgeEl) {
        if (p.currentRoundBet > 0) {
          betBadgeEl.style.visibility = 'visible';
          betBadgeEl.textContent = `Bet: $${p.currentRoundBet}`;
        } else {
          betBadgeEl.style.visibility = 'hidden';
        }
      }

      if (infoCardEl) {
        const isTurn = (state.activeTurnPlayer === p.id);
        infoCardEl.classList.toggle('active-turn', isTurn);
      }

      if (cardsEl) {
        const isShowdown = (state.phase === 'SHOWDOWN' || state.phase === 'ROUND_OVER');
        const showFaceUp = isSelf || isShowdown;

        cardsEl.innerHTML = (p.holeCards || []).map(card => {
          return createCardHTML(card, !showFaceUp, this.currentTheme);
        }).join('');
      }
    });

    // Update Real-Time Hand Assist HUD for Local Player
    const me = players[this.localPlayerId];
    if (me && me.holeCards && me.holeCards.length > 0 && typeof PokerEvaluator !== 'undefined') {
      const allCards = [...me.holeCards, ...(state.communityCards || [])];
      const evalRes = PokerEvaluator.evaluateBestHand(allCards);
      if (this.assistHandName) {
        this.assistHandName.textContent = evalRes.name || 'High Card';
      }
      const level = evalRes.level || 1;
      if (this.meterSegments) {
        this.meterSegments.forEach(seg => {
          const segLevel = parseInt(seg.dataset.level, 10);
          seg.classList.toggle('active', segLevel <= level);
        });
      }
    } else {
      if (this.assistHandName) {
        this.assistHandName.textContent = 'Waiting for deal...';
      }
      if (this.meterSegments) {
        this.meterSegments.forEach(seg => seg.classList.remove('active'));
      }
    }

    // Drafting Spotlight
    if (this.draftSpotlight) {
      if (state.phase === 'DRAFTING' && state.currentDrawnCard) {
        this.draftSpotlight.style.display = 'flex';
        const isMyDraft = (state.activeDraftPlayer === this.localPlayerId && !this.isSpectator);
        if (this.draftCardContainer) {
          this.draftCardContainer.innerHTML = createCardHTML(state.currentDrawnCard, false, this.currentTheme);
        }
        if (this.draftActionButtons) this.draftActionButtons.style.display = isMyDraft ? 'flex' : 'none';
        if (this.draftWaitingMessage) this.draftWaitingMessage.style.display = isMyDraft ? 'none' : 'flex';
      } else {
        this.draftSpotlight.style.display = 'none';
      }
    }

    // Poker Action Buttons states
    const isMyTurn = (state.activeTurnPlayer === this.localPlayerId && !this.isSpectator);
    const canBet = (state.phase === 'PRE_DRAFT_BETTING' || state.phase === 'CARD_BETTING');

    if (this.btnFold) this.btnFold.disabled = !isMyTurn || !canBet;
    if (this.btnCheckCall) {
      this.btnCheckCall.disabled = !isMyTurn || !canBet;
      if (me) {
        const callDiff = (state.currentBet || 0) - (me.currentRoundBet || 0);
        this.btnCheckCall.textContent = callDiff > 0 ? `CALL $${callDiff}` : 'CHECK';
      }
    }
    if (this.btnBetRaise) {
      this.btnBetRaise.disabled = !isMyTurn || !canBet;
      if (me && this.betSlider) {
        const callDiff = (state.currentBet || 0) - (me.currentRoundBet || 0);
        this.btnBetRaise.textContent = callDiff > 0 ? `RAISE TO $${this.betSlider.value}` : `BET $${this.betSlider.value}`;
      }
    }
    if (this.btnAllIn) this.btnAllIn.disabled = !isMyTurn || !canBet;

    // Showdown Banner
    if (this.showdownBanner && state.phase === 'ROUND_OVER') {
      this.showdownBanner.style.display = 'flex';
      if (this.showdownBannerTitle) this.showdownBannerTitle.textContent = `${state.winReason || 'Round Over'}`;
      if (this.showdownBannerDesc) this.showdownBannerDesc.textContent = `Pot won: $${state.potWonAmount || 0}`;
    }
  }

  renderCrazy8Table(state) {
    if (this.pokerCommunityContainer) this.pokerCommunityContainer.style.display = 'none';
    if (this.handStrengthMeter) this.handStrengthMeter.style.display = 'none';
    if (this.centerArcadeStage) this.centerArcadeStage.style.display = 'flex';

    const topCard = state.topCard;
    const food = (typeof SUIT_FOOD_MAP !== 'undefined' && SUIT_FOOD_MAP[state.declaredSuit]) || { name: state.declaredSuit, emoji: state.declaredSuit };

    this.centerArcadeStage.innerHTML = `
      <div class="crazy8-center-container">
        <div class="crazy8-stock-pile" id="crazy8-stockpile" style="cursor: pointer;">
          <div class="deck-count-badge">🎴 Stock: ${state.deckCount || 0}</div>
          <div class="card-back-stack">🎴 Click to Draw</div>
        </div>
        <div class="crazy8-discard-pile">
          <div class="active-suit-badge">Active Suit: ${food.name} (${state.declaredSuit})</div>
          ${topCard ? createCardHTML(topCard, false, this.currentTheme) : '<div class="card-slot">Empty</div>'}
        </div>
      </div>
    `;

    const stockEl = document.getElementById('crazy8-stockpile');
    if (stockEl) {
      stockEl.addEventListener('click', () => {
        if (state.activePlayerId === this.localPlayerId && !this.isSpectator) {
          this.crazy8Engine.drawCard(this.localPlayerId);
        }
      });
    }

    // Render hands with Local Seat Perspective
    const players = state.players || [];
    players.forEach((p) => {
      const domSeatIndex = this.getDomSeatIndex(p.id, players.length);
      const isSelf = (p.id === this.localPlayerId && !this.isSpectator);

      const avatarIconEl = document.getElementById(`avatar-icon-${domSeatIndex}`);
      if (avatarIconEl) {
        avatarIconEl.textContent = p.avatar || (p.isAi ? '🤖' : (isSelf ? '🤠' : '👩‍💼'));
      }

      const nameEl = document.getElementById(`player-name-${domSeatIndex}`);
      const chipsEl = document.getElementById(`player-chips-${domSeatIndex}`);
      const cardsEl = document.getElementById(`player-cards-${domSeatIndex}`);
      const infoCardEl = document.getElementById(`info-card-${domSeatIndex}`);

      let displayName = p.name;
      if (isSelf) {
        displayName = 'You';
      } else {
        if (p.isAi) {
          displayName = p.name;
        } else {
          displayName = (p.name === 'You' || p.name === 'DadBot') ? `Player ${p.id + 1}` : p.name;
        }
      }
      if (nameEl) nameEl.textContent = displayName;
      if (chipsEl) chipsEl.textContent = `🎴 ${p.cardCount} cards`;
      if (infoCardEl) infoCardEl.classList.toggle('active-turn', state.activePlayerId === p.id);

      if (cardsEl) {
        cardsEl.innerHTML = (p.hand || []).map(c => {
          const isValid = isSelf && (state.activePlayerId === this.localPlayerId) && this.crazy8Engine.isValidPlay(c);
          return `<div class="poker-card-wrapper ${isValid ? 'card-playable-pulse' : ''}" data-card-id="${c.id}">
            ${createCardHTML(c, !isSelf, this.currentTheme)}
          </div>`;
        }).join('');

        if (isSelf) {
          cardsEl.querySelectorAll('.poker-card-wrapper').forEach(wrapper => {
            wrapper.addEventListener('click', () => {
              const cardId = wrapper.dataset.cardId;
              if (cardId) this.crazy8Engine.playCard(this.localPlayerId, cardId);
            });
          });
        }
      }
    });

    if (state.phase === 'CHOOSE_SUIT' && state.activePlayerId === this.localPlayerId) {
      this.openModal('modal-wild-suit');
    }
  }

  renderSpadesTable(state) {
    if (this.pokerCommunityContainer) this.pokerCommunityContainer.style.display = 'none';
    if (this.handStrengthMeter) this.handStrengthMeter.style.display = 'none';
    if (this.centerArcadeStage) this.centerArcadeStage.style.display = 'flex';

    // Center Trick Area
    const currentTrick = state.currentTrick || [];
    this.centerArcadeStage.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 0.8rem; color: #38bdf8; font-weight: 700; margin-bottom: 6px;">
          ♠️ Trick #${state.trickNumber || 1} • Spades ${state.spadesBroken ? 'Broken' : 'Not Broken'}
        </div>
        <div style="display: flex; gap: 8px; justify-content: center; min-height: 80px;">
          ${currentTrick.map(t => `
            <div style="text-align: center;">
              <span style="font-size: 0.7rem; color: #94a3b8;">${state.players[t.playerId]?.name || ''}</span>
              ${createCardHTML(t.card, false, this.currentTheme)}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Render Players with Local Seat Perspective
    const players = state.players || [];
    players.forEach((p) => {
      const domSeatIndex = this.getDomSeatIndex(p.id, players.length);
      const isSelf = (p.id === this.localPlayerId && !this.isSpectator);

      const avatarIconEl = document.getElementById(`avatar-icon-${domSeatIndex}`);
      if (avatarIconEl) {
        avatarIconEl.textContent = p.avatar || (p.isAi ? '🤖' : (isSelf ? '🤠' : '👩‍💼'));
      }

      const nameEl = document.getElementById(`player-name-${domSeatIndex}`);
      const chipsEl = document.getElementById(`player-chips-${domSeatIndex}`);
      const cardsEl = document.getElementById(`player-cards-${domSeatIndex}`);
      const infoCardEl = document.getElementById(`info-card-${domSeatIndex}`);

      let displayName = p.name;
      if (isSelf) {
        displayName = 'You';
      } else {
        if (p.isAi) {
          displayName = p.name;
        } else {
          displayName = (p.name === 'You' || p.name === 'DadBot') ? `Player ${p.id + 1}` : `${p.name} ${state.isPartnership ? `(Team ${p.team})` : ''}`;
        }
      }
      if (nameEl) nameEl.textContent = displayName;
      if (chipsEl) chipsEl.textContent = `Bid: ${p.bid !== null ? p.bid : '-'} | Tricks: ${p.tricksWon}`;
      if (infoCardEl) infoCardEl.classList.toggle('active-turn', state.activePlayerId === p.id);

      if (cardsEl) {
        const isSelf = (p.id === this.localPlayerId && !this.isSpectator);
        cardsEl.innerHTML = (p.hand || []).map(c => {
          const isValid = isSelf && (state.activePlayerId === this.localPlayerId) && (state.phase === 'TRICK_PLAYING') && this.spadesEngine.isValidTrickPlay(this.localPlayerId, c);
          return `<div class="poker-card-wrapper ${isValid ? 'card-playable-pulse' : ''}" data-card-id="${c.id}">
            ${createCardHTML(c, !isSelf, this.currentTheme)}
          </div>`;
        }).join('');

        if (isSelf) {
          cardsEl.querySelectorAll('.poker-card-wrapper').forEach(wrapper => {
            wrapper.addEventListener('click', () => {
              const cardId = wrapper.dataset.cardId;
              if (cardId) this.spadesEngine.playTrickCard(this.localPlayerId, cardId);
            });
          });
        }
      }
    });

    if (state.phase === 'BIDDING' && state.activePlayerId === this.localPlayerId && !this.isSpectator) {
      this.openModal('modal-spades-bid');
      const bidContainer = document.getElementById('spades-bid-buttons');
      if (bidContainer) {
        bidContainer.innerHTML = Array.from({ length: 14 }, (_, i) => `
          <button class="btn-spades-bid" data-bid="${i}">${i === 0 ? 'Nil (0)' : i}</button>
        `).join('');

        bidContainer.querySelectorAll('.btn-spades-bid').forEach(b => {
          b.addEventListener('click', () => {
            const bid = parseInt(b.dataset.bid, 10);
            this.spadesEngine.submitBid(this.localPlayerId, bid);
            this.closeModal('modal-spades-bid');
          });
        });
      }
    }
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
  }

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }
}

// Global App Initialization
window.addEventListener('DOMContentLoaded', () => {
  window.arcadeApp = new FamilyCardArcadeApp();
});
