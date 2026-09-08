// js/firebase-room.js - Decentralized Firebase Realtime Database Virtual Dealer & Room Manager

class FirebaseRoomManager {
  constructor(options = {}) {
    this.db = null;
    this.roomRef = null;
    this.roomCode = null;
    this.mySeatIndex = 0;
    this.myRole = 'player'; // 'player' or 'spectator'
    this.localName = options.localName || 'Player 1';
    this.clientId = this.getOrCreateClientId();
    
    this.onStateChange = options.onStateChange || (() => {});
    this.onRosterChange = options.onRosterChange || (() => {});
    this.onPlayerLeft = options.onPlayerLeft || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onActionReceived = options.onActionReceived || (() => {});

    this.listeners = [];
    this.roster = [];
    this.isAttached = false;
    this.initFirebase();
  }

  getOrCreateClientId() {
    let id = sessionStorage.getItem('card_arcadia_client_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).substring(2, 11);
      sessionStorage.setItem('card_arcadia_client_id', id);
    }
    return id;
  }

  static generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  initFirebase() {
    try {
      if (typeof firebase === 'undefined') {
        console.warn('[Firebase] SDK not loaded yet.');
        return;
      }
      if (!firebase.apps.length) {
        // Resolve database URL (checking custom override if set)
        const customDbUrl = localStorage.getItem('card_arcadia_firebase_rtdb_url') || 
                            new URLSearchParams(window.location.search).get('rtdb_url');
        const rawDbUrl = customDbUrl || "https://card-arcadia-default-rtdb.firebaseio.com";
        const dbUrl = rawDbUrl.trim().replace(/[\\\/]+$/, '');

        firebase.initializeApp({
          projectId: "card-arcadia",
          authDomain: "card-arcadia.firebaseapp.com",
          databaseURL: dbUrl
        });
        console.log(`[Firebase] Initialized with databaseURL: ${dbUrl}`);
      }
      this.db = firebase.database();
      console.log('[Firebase] Realtime Database ready.');
    } catch (err) {
      console.error('[Firebase] Init error:', err);
    }
  }

  // Promise timeout helper
  withTimeout(promise, ms = 6000, errorMsg = 'Database operation timed out') {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
    ]);
  }

  ensureDb() {
    if (!this.db && typeof firebase !== 'undefined') {
      this.initFirebase();
    }
    if (!this.db) {
      throw new Error('Firebase Realtime Database is not initialized.');
    }
    return this.db;
  }

  // Create a new room with Virtual Dealer state
  async createRoom(customCode = null, options = {}) {
    const db = this.ensureDb();
    this.roomCode = (customCode || FirebaseRoomManager.generateRoomCode()).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    this.mySeatIndex = 0;
    this.myRole = 'player';
    this.localName = options.name || 'Player 1';

    const seatCount = options.seatCount || 2;
    const gameType = options.gameType || 'POKER_DUEL';

    this.roomRef = db.ref(`rooms/${this.roomCode}`);

    const initialSeats = {
      0: {
        clientId: this.clientId,
        name: this.localName,
        role: 'player',
        seatIndex: 0,
        isAi: false,
        status: 'online',
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      }
    };

    // Pre-populate other seats as open / AI
    for (let i = 1; i < seatCount; i++) {
      initialSeats[i] = {
        clientId: null,
        name: `Seat ${i + 1}`,
        role: 'player',
        seatIndex: i,
        isAi: false,
        status: 'vacant',
        lastSeen: firebase.database.ServerValue.TIMESTAMP
      };
    }

    const roomData = {
      meta: {
        roomCode: this.roomCode,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        initiatorId: this.clientId,
        gameType: gameType,
        seatCount: seatCount,
        status: 'waiting' // 'waiting', 'in_game'
      },
      seats: initialSeats,
      gameState: options.initialGameState || null,
      lastAction: null
    };

    this.onStatus('⏳ Setting up room on cloud...');
    await this.withTimeout(
      this.roomRef.set(roomData),
      6000,
      'Could not reach database. Please verify Realtime Database is enabled in Firebase Console.'
    );

    this.setupPresence(this.mySeatIndex);
    this.subscribeToRoom();

    console.log(`[Firebase Room] Created room ${this.roomCode}`);
    return this.roomCode;
  }

  // Join an existing room atomically via transaction
  async joinRoom(roomCode, playerName = 'Player 2', asSpectator = false, preferredSeat = null) {
    const db = this.ensureDb();
    this.roomCode = (roomCode || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
    this.localName = playerName;
    this.myRole = asSpectator ? 'spectator' : 'player';
    this.roomRef = db.ref(`rooms/${this.roomCode}`);

    this.onStatus('⏳ Connecting to room...');

    // Verify room exists with timeout
    const snap = await this.withTimeout(
      this.roomRef.child('meta').once('value'),
      6000,
      'Could not reach cloud room. Check connection.'
    );
    if (!snap.exists()) {
      throw new Error(`Room ${this.roomCode} does not exist.`);
    }

    const meta = snap.val() || {};
    this.meta = meta;
    this.isInitiator = (meta.initiatorId === this.clientId);

    if (asSpectator) {
      this.mySeatIndex = null;
      // Register in spectators node
      const spectatorRef = this.roomRef.child(`spectators/${this.clientId}`);
      await spectatorRef.set({
        clientId: this.clientId,
        name: this.localName,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });
      spectatorRef.onDisconnect().remove();
    } else {
      // Atomic seat assignment transaction
      const seatsRef = this.roomRef.child('seats');
      const result = await seatsRef.transaction((currentSeats) => {
        if (!currentSeats) return currentSeats;

        const maxSeats = 4;
        let assigned = null;

        // 1. If returning with same clientId or preferred seat
        if (preferredSeat !== null && preferredSeat !== undefined && currentSeats[preferredSeat]) {
          const s = currentSeats[preferredSeat];
          if (s.clientId === this.clientId || s.status === 'vacant' || s.status === 'offline' || s.isAi) {
            assigned = preferredSeat;
          }
        }

        // 2. Check if already occupying a seat
        if (assigned === null) {
          for (let i = 0; i < maxSeats; i++) {
            if (currentSeats[i] && currentSeats[i].clientId === this.clientId) {
              assigned = i;
              break;
            }
          }
        }

        // 3. Find first vacant / open seat
        if (assigned === null) {
          for (let i = 0; i < maxSeats; i++) {
            if (currentSeats[i] && (currentSeats[i].status === 'vacant' || currentSeats[i].status === 'offline')) {
              assigned = i;
              break;
            }
          }
        }

        if (assigned !== null) {
          currentSeats[assigned] = {
            clientId: this.clientId,
            peerId: this.peerId || (currentSeats[assigned] && currentSeats[assigned].peerId) || null,
            name: this.localName,
            role: 'player',
            seatIndex: assigned,
            isAi: false,
            status: 'online',
            lastSeen: firebase.database.ServerValue.TIMESTAMP
          };
        }

        return currentSeats;
      });

      if (!result.committed) {
        throw new Error('Could not secure a seat at the table.');
      }

      // Determine which seat was assigned to this client
      const updatedSeats = result.snapshot.val();
      let foundSeat = null;
      for (const [seatKey, seatData] of Object.entries(updatedSeats || {})) {
        if (seatData && seatData.clientId === this.clientId) {
          foundSeat = parseInt(seatKey, 10);
          break;
        }
      }

      if (foundSeat === null) {
        // Table full, fallback to spectator
        this.myRole = 'spectator';
        this.mySeatIndex = null;
      } else {
        this.mySeatIndex = foundSeat;
        this.setupPresence(this.mySeatIndex);
      }
    }

    this.subscribeToRoom();
    console.log(`[Firebase Room] Joined room ${this.roomCode} as ${this.myRole} (Seat ${this.mySeatIndex})`);
    return this.roomCode;
  }

  // Setup presence with onDisconnect hook
  setupPresence(seatIndex) {
    if (!this.db || !this.roomRef || seatIndex === null) return;

    const connectedRef = this.db.ref('.info/connected');
    const mySeatRef = this.roomRef.child(`seats/${seatIndex}`);

    connectedRef.on('value', (snap) => {
      if (snap.val() === true) {
        const updateData = {
          status: 'online',
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        };
        if (this.peerId) updateData.peerId = this.peerId;
        mySeatRef.update(updateData);

        // When tab is closed or window drops, mark as offline after disconnect
        mySeatRef.onDisconnect().update({
          status: 'offline',
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      }
    });
  }

  updatePeerId(peerId) {
    this.peerId = peerId;
    if (!this.roomRef || this.mySeatIndex === null) return;
    this.roomRef.child(`seats/${this.mySeatIndex}`).update({
      peerId: peerId
    }).catch(err => console.warn('[Firebase] Update peerId notice:', err));
  }

  // Realtime room listener
  subscribeToRoom() {
    if (this.isAttached || !this.roomRef) return;
    this.isAttached = true;

    // 1. Listen to Seats / Roster
    const seatsListener = this.roomRef.child('seats').on('value', (snap) => {
      const seats = snap.val() || {};
      const roster = Object.values(seats).filter(s => s && s.status !== 'vacant');
      this.roster = roster;
      this.onRosterChange(roster);

      // Check if another human player left
      Object.entries(seats).forEach(([seatIdx, seatInfo]) => {
        const sIndex = parseInt(seatIdx, 10);
        if (sIndex !== this.mySeatIndex && seatInfo) {
          if (seatInfo.status === 'left' && !seatInfo.isAi && seatInfo.clientId) {
            this.onPlayerLeft({
              seatIndex: sIndex,
              name: seatInfo.name,
              clientId: seatInfo.clientId
            });
          }
        }
      });
    });
    this.listeners.push({ ref: this.roomRef.child('seats'), type: 'value', listener: seatsListener });

    // 2. Listen to Game State
    const stateListener = this.roomRef.child('gameState').on('value', (snap) => {
      const state = snap.val();
      if (state) {
        this.onStateChange(state);
      }
    });
    this.listeners.push({ ref: this.roomRef.child('gameState'), type: 'value', listener: stateListener });

    // 3. Listen to Actions
    const actionListener = this.roomRef.child('lastAction').on('value', (snap) => {
      const action = snap.val();
      if (action && action.clientId !== this.clientId) {
        this.onActionReceived(action);
      }
    });
    this.listeners.push({ ref: this.roomRef.child('lastAction'), type: 'value', listener: actionListener });
  }

  // Update Game State in Cloud RTDB
  updateGameState(state, metaUpdate = null) {
    if (!this.roomRef) return;
    const updates = {};
    if (state) updates['gameState'] = state;
    if (metaUpdate) {
      Object.keys(metaUpdate).forEach(k => {
        updates[`meta/${k}`] = metaUpdate[k];
      });
    }
    this.roomRef.update(updates).catch(err => {
      console.warn('[Firebase] GameState update error:', err);
    });
  }

  // Submit action to cloud
  submitAction(actionData) {
    if (!this.roomRef) return;
    const action = {
      ...actionData,
      clientId: this.clientId,
      seatIndex: this.mySeatIndex,
      timestamp: firebase.database.ServerValue.TIMESTAMP
    };
    this.roomRef.child('lastAction').set(action).catch(err => {
      console.warn('[Firebase] Action submit error:', err);
    });
  }

  // Replace a player with an AI Bot
  async replacePlayerWithAi(seatIndex, botName = 'DadBot') {
    if (!this.roomRef || seatIndex === null) return;

    const updates = {};
    updates[`seats/${seatIndex}/isAi`] = true;
    updates[`seats/${seatIndex}/name`] = botName;
    updates[`seats/${seatIndex}/status`] = 'bot';
    updates[`seats/${seatIndex}/clientId`] = 'bot_' + Math.random().toString(36).substring(2, 7);
    updates[`gameState/players/${seatIndex}/isAi`] = true;
    updates[`gameState/players/${seatIndex}/name`] = botName;

    await this.roomRef.update(updates);
    console.log(`[Firebase Room] Seat ${seatIndex} replaced with AI bot ${botName}`);
  }

  // Explicit leave room
  async leaveRoom() {
    if (this.roomRef && this.mySeatIndex !== null) {
      try {
        await this.roomRef.child(`seats/${this.mySeatIndex}`).update({
          status: 'left',
          lastSeen: firebase.database.ServerValue.TIMESTAMP
        });
      } catch (e) {}
    }

    this.disconnect();
  }

  disconnect() {
    this.listeners.forEach(({ ref, type, listener }) => {
      try { ref.off(type, listener); } catch (e) {}
    });
    this.listeners = [];
    this.roster = [];
    this.peerId = null;
    this.meta = null;
    this.isAttached = false;
    this.roomRef = null;
    this.roomCode = null;
    this.mySeatIndex = null;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { FirebaseRoomManager };
}
