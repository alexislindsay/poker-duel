// js/network.js - PeerJS WebRTC P2P Multiplayer & Multi-Peer Room Manager

class NetworkManager {
  constructor(options = {}) {
    this.isHost = false;
    this.peer = null;
    this.connections = new Map(); // peerId -> DataConnection
    this.peerInfoMap = new Map(); // peerId -> { name, role, seatIndex }
    this.roomId = null;
    this.localPeerId = null;
    this.localName = options.localName || 'Player 1';
    this.myRole = 'player'; // 'player' or 'spectator'
    this.mySeatIndex = 0;
    this.maxPlayers = 4;

    this.onConnected = options.onConnected || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    this.onMessage = options.onMessage || (() => {});
    this.onRosterChange = options.onRosterChange || (() => {});
    this.onError = options.onError || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.getInitialState = options.getInitialState || null;

    this.setupUnloadHandlers();
  }

  setupUnloadHandlers() {
    const cleanup = () => {
      try {
        if (this.peer && !this.peer.destroyed) {
          this.disconnect();
        }
      } catch (e) {}
    };
    window.addEventListener('beforeunload', cleanup);
    window.addEventListener('pagehide', cleanup);
  }

  static generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getPrefix() {
    return 'pokerduel-v2-';
  }

  getIceServers() {
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ];
  }

  // Host creates a room
  createRoom(customCode = null, hostName = 'Host', retryCount = 0) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.localName = hostName;
      this.myRole = 'player';
      this.mySeatIndex = 0;
      this.roomId = (customCode || this.roomId || NetworkManager.generateRoomCode()).toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      const peerId = `${this.getPrefix()}${this.roomId}`;

      try {
        if (typeof Peer === 'undefined') {
          return reject(new Error('PeerJS library is not loaded.'));
        }

        if (this.peer && !this.peer.destroyed) {
          try { this.peer.destroy(); } catch (e) {}
          this.peer = null;
        }

        let isResolved = false;
        const maxRetries = 6;

        const timer = setTimeout(() => {
          if (!isResolved) {
            console.warn('[P2P] Room creation timed out, attempting retry...');
            if (retryCount < maxRetries) {
              this.createRoom(this.roomId, hostName, retryCount + 1).then(resolve).catch(reject);
            } else {
              const freshCode = NetworkManager.generateRoomCode();
              this.createRoom(freshCode, hostName).then(resolve).catch(reject);
            }
          }
        }, 8000);

        this.peer = new Peer(peerId, {
          debug: 1,
          config: { iceServers: this.getIceServers() }
        });

        this.peer.on('open', (id) => {
          isResolved = true;
          clearTimeout(timer);
          this.localPeerId = id;
          console.log(`[P2P] Multi-peer room created: ${this.roomId} (Host ID: ${id})`);
          
          this.peerInfoMap.set(id, {
            peerId: id,
            name: this.localName,
            role: 'player',
            seatIndex: 0
          });

          resolve(this.roomId);
        });

        this.peer.on('connection', (conn) => {
          console.log(`[P2P Host] Incoming connection from: ${conn.peer}`);
          this.setupHostConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.error('[P2P] Host peer error:', err);
          this.onError(err);
          if (err.type === 'unavailable-id') {
            clearTimeout(timer);
            if (customCode && retryCount < maxRetries) {
              const msg = `Room ID busy at signaling broker (reconnecting host), retrying in 1.5s (${retryCount + 1}/${maxRetries})...`;
              console.log(`[P2P] ${msg}`);
              this.onStatus(msg);
              setTimeout(() => {
                this.createRoom(customCode, hostName, retryCount + 1).then(resolve).catch(reject);
              }, 1500);
            } else {
              const newCode = NetworkManager.generateRoomCode();
              this.createRoom(newCode, hostName).then(resolve).catch(reject);
            }
          } else if (!isResolved) {
            clearTimeout(timer);
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Join an existing room (as player or spectator) with auto-retry
  joinRoom(roomCode, playerName = 'Guest', asSpectator = false, preferredSeat = null, retryCount = 0) {
    if (retryCount === 0) {
      this.currentJoinAttempt = (this.currentJoinAttempt || 0) + 1;
      if (this.joinRetryTimer) {
        clearTimeout(this.joinRetryTimer);
        this.joinRetryTimer = null;
      }
    }
    const attemptId = this.currentJoinAttempt;

    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.roomId = (roomCode || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
      this.localName = playerName;
      this.myRole = asSpectator ? 'spectator' : 'player';
      this.mySeatIndex = (preferredSeat !== null && preferredSeat !== undefined) ? preferredSeat : 1;
      this.explicitlyDisconnected = false;

      const hostPeerId = `${this.getPrefix()}${this.roomId}`;
      this.onStatus(`Connecting to room ${this.roomId}...`);

      try {
        if (typeof Peer === 'undefined') {
          return reject(new Error('PeerJS library is not loaded.'));
        }

        if (this.peer && !this.peer.destroyed) {
          try { this.peer.destroy(); } catch (e) {}
          this.peer = null;
        }

        let isResolved = false;
        const maxRetries = 6;

        const attemptRetry = (err) => {
          if (isResolved || this.currentJoinAttempt !== attemptId || this.explicitlyDisconnected) return;
          isResolved = true;
          if (this.peer && !this.peer.destroyed) {
            try { this.peer.destroy(); } catch (e) {}
            this.peer = null;
          }
          if (retryCount < maxRetries) {
            const delay = Math.min(1500 + retryCount * 500, 3000);
            const msg = `Host is connecting or room is starting up. Retrying (${retryCount + 1}/${maxRetries})...`;
            console.log(`[P2P] ${msg}`);
            this.onStatus(msg);
            this.joinRetryTimer = setTimeout(() => {
              this.joinRetryTimer = null;
              if (this.currentJoinAttempt !== attemptId || this.explicitlyDisconnected) return;
              this.joinRoom(roomCode, playerName, asSpectator, preferredSeat, retryCount + 1)
                .then(resolve)
                .catch(reject);
            }, delay);
          } else {
            console.error('[P2P] Guest join failed after retries:', err);
            this.onError(err);
            reject(err);
          }
        };

        const timeoutTimer = setTimeout(() => {
          if (!isResolved && this.currentJoinAttempt === attemptId && !this.explicitlyDisconnected) {
            console.warn('[P2P Guest] Connection attempt timed out, retrying...');
            attemptRetry(new Error('Connection timed out'));
          }
        }, 8000);

        this.peer = new Peer({
          debug: 1,
          config: { iceServers: this.getIceServers() }
        });

        this.peer.on('open', (id) => {
          this.localPeerId = id;
          console.log(`[P2P Guest] Connected with ID: ${id}, joining host: ${hostPeerId} (attempt ${retryCount + 1})...`);
          
          const conn = this.peer.connect(hostPeerId, {
            reliable: true,
            metadata: {
              name: this.localName,
              role: this.myRole,
              preferredSeat: preferredSeat
            }
          });

          this.setupGuestConnection(conn, (roomId) => {
            isResolved = true;
            clearTimeout(timeoutTimer);
            resolve(roomId);
          }, (err) => {
            clearTimeout(timeoutTimer);
            attemptRetry(err);
          });
        });

        // Also allow other guests to connect directly for mesh AV if needed
        this.peer.on('connection', (conn) => {
          console.log(`[P2P Guest] Direct mesh connection from: ${conn.peer}`);
          this.setupDirectMeshConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.error('[P2P] Guest peer error:', err);
          clearTimeout(timeoutTimer);
          attemptRetry(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // HOST: Setup incoming guest connection
  setupHostConnection(conn) {
    this.connections.set(conn.peer, conn);

    conn.on('open', () => {
      const meta = conn.metadata || {};
      const requestedRole = meta.role || 'player';
      let assignedSeat = null;
      let assignedRole = requestedRole;

      if (requestedRole === 'player') {
        const occupiedSeats = new Set();
        this.peerInfoMap.forEach(info => {
          if (info.role === 'player' && info.seatIndex !== null) {
            occupiedSeats.add(info.seatIndex);
          }
        });

        // Check if client requested their previously assigned seat (reconnect)
        if (meta.preferredSeat !== null && meta.preferredSeat !== undefined && !occupiedSeats.has(meta.preferredSeat) && meta.preferredSeat > 0 && meta.preferredSeat < this.maxPlayers) {
          assignedSeat = meta.preferredSeat;
        } else {
          // Find next open seat 1, 2, 3
          for (let s = 1; s < this.maxPlayers; s++) {
            if (!occupiedSeats.has(s)) {
              assignedSeat = s;
              break;
            }
          }
        }

        if (assignedSeat === null) {
          // Table full, assign as spectator
          assignedRole = 'spectator';
        }
      }

      const clientInfo = {
        peerId: conn.peer,
        name: meta.name || `Player ${this.peerInfoMap.size + 1}`,
        role: assignedRole,
        seatIndex: assignedSeat
      };

      this.peerInfoMap.set(conn.peer, clientInfo);

      // Build welcome assignment to new/reconnecting client
      const joinAck = {
        type: 'ROOM_JOIN_ACK',
        roomId: this.roomId,
        yourInfo: clientInfo,
        roster: Array.from(this.peerInfoMap.values())
      };

      if (this.getInitialState) {
        const extra = this.getInitialState();
        if (extra) {
          Object.assign(joinAck, extra);
        }
      }

      conn.send(joinAck);

      // Broadcast roster update to all clients
      this.broadcastRoster();

      this.onConnected({
        peerId: conn.peer,
        info: clientInfo,
        roster: Array.from(this.peerInfoMap.values())
      });
    });

    conn.on('data', (data) => {
      this.handleIncomingData(conn.peer, data);
    });

    conn.on('close', () => {
      console.log(`[P2P Host] Peer disconnected: ${conn.peer}`);
      this.handlePeerDisconnect(conn.peer);
    });

    conn.on('error', (err) => {
      console.error(`[P2P Host] Error with peer ${conn.peer}:`, err);
      this.handlePeerDisconnect(conn.peer);
    });
  }

  // GUEST: Setup connection with host
  setupGuestConnection(conn, resolve, reject) {
    this.connections.set(conn.peer, conn);

    let ackReceived = false;
    const ackTimer = setTimeout(() => {
      if (!ackReceived) {
        console.warn('[P2P Guest] Timed out waiting for ROOM_JOIN_ACK');
        if (reject) reject(new Error('Timed out waiting for host response'));
      }
    }, 7000);

    conn.on('open', () => {
      console.log('[P2P Guest] Connected to Host channel.');
    });

    conn.on('data', (data) => {
      if (data && data.type === 'ROOM_JOIN_ACK') {
        ackReceived = true;
        clearTimeout(ackTimer);
        this.myRole = data.yourInfo.role;
        this.mySeatIndex = data.yourInfo.seatIndex;
        console.log(`[P2P Guest] Joined room ${data.roomId} as ${this.myRole} (Seat ${this.mySeatIndex})`);
        
        this.updateRoster(data.roster);
        if (resolve) resolve(this.roomId);
        this.onConnected({
          isHost: false,
          roomId: this.roomId,
          yourInfo: data.yourInfo,
          roster: data.roster,
          joinAckData: data
        });
        return;
      }

      this.handleIncomingData(conn.peer, data);
    });

    conn.on('close', () => {
      console.log('[P2P Guest] Lost connection to Host.');
      clearTimeout(ackTimer);
      this.connections.delete(conn.peer);
      this.onDisconnected(conn.peer);
      if (!this.isHost && this.roomId && !this.explicitlyDisconnected) {
        this.scheduleAutoReconnect();
      }
    });

    conn.on('error', (err) => {
      console.error('[P2P Guest] Connection error:', err);
      clearTimeout(ackTimer);
      if (reject) reject(err);
      this.onError(err);
      if (!this.isHost && this.roomId && !this.explicitlyDisconnected) {
        this.scheduleAutoReconnect();
      }
    });
  }

  scheduleAutoReconnect() {
    if (this.reconnectTimeout || this.isHost || !this.roomId || this.explicitlyDisconnected) return;
    console.log(`[P2P Guest] Scheduling auto-reconnect to Host for room ${this.roomId}...`);
    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      if (!this.isHost && this.roomId && !this.explicitlyDisconnected) {
        try {
          const hostPeerId = `${this.getPrefix()}${this.roomId}`;
          if (!this.peer || this.peer.destroyed) {
            this.peer = new Peer({ debug: 1, config: { iceServers: this.getIceServers() } });
            await new Promise((res) => this.peer.on('open', (id) => { this.localPeerId = id; res(); }));
          }
          console.log(`[P2P Guest] Attempting auto-reconnect to ${hostPeerId}...`);
          const conn = this.peer.connect(hostPeerId, {
            reliable: true,
            metadata: {
              name: this.localName,
              role: this.myRole,
              preferredSeat: this.mySeatIndex
            }
          });
          this.setupGuestConnection(conn, () => {
            console.log('[P2P Guest] Successfully reconnected to Host!');
          }, () => {
            this.scheduleAutoReconnect();
          });
        } catch (e) {
          console.warn('[P2P Guest] Reconnect error:', e);
          this.scheduleAutoReconnect();
        }
      }
    }, 2000);
  }

  // Direct mesh connection between guests
  setupDirectMeshConnection(conn) {
    this.connections.set(conn.peer, conn);
    conn.on('data', (data) => {
      this.handleIncomingData(conn.peer, data);
    });
    conn.on('close', () => {
      this.connections.delete(conn.peer);
    });
  }

  handleIncomingData(fromPeerId, data) {
    if (!data) return;

    if (data.type === 'ROSTER_UPDATE') {
      this.updateRoster(data.roster);
      return;
    }

    if (this.isHost && data.type === 'ACTION_REQUEST') {
      // Host receives client action and processes it
      this.onMessage(data, fromPeerId);
      return;
    }

    this.onMessage(data, fromPeerId);
  }

  handlePeerDisconnect(peerId) {
    this.connections.delete(peerId);
    this.peerInfoMap.delete(peerId);
    this.broadcastRoster();
    this.onDisconnected(peerId);
  }

  broadcastRoster() {
    const roster = Array.from(this.peerInfoMap.values());
    this.broadcast({
      type: 'ROSTER_UPDATE',
      roster: roster
    });
    this.onRosterChange(roster);
  }

  updateRoster(roster) {
    this.peerInfoMap.clear();
    roster.forEach(info => {
      this.peerInfoMap.set(info.peerId, info);
      if (info.peerId === this.localPeerId) {
        this.myRole = info.role;
        this.mySeatIndex = info.seatIndex;
      }
    });
    this.onRosterChange(roster);
  }

  getRoster() {
    return Array.from(this.peerInfoMap.values());
  }

  getPlayers() {
    return this.getRoster().filter(p => p.role === 'player' && p.seatIndex !== null);
  }

  getSpectators() {
    return this.getRoster().filter(p => p.role === 'spectator');
  }

  // Send message to all connected peers
  broadcast(data) {
    const json = (typeof data === 'object') ? data : { message: data };
    this.connections.forEach(conn => {
      if (conn.open) {
        try {
          conn.send(json);
        } catch (e) {
          console.warn('[P2P] Broadcast send failed:', e);
        }
      }
    });
  }

  // Send to host or specific peer
  send(data) {
    if (this.isHost) {
      this.broadcast(data);
    } else {
      // Send to host connection
      this.connections.forEach(conn => {
        if (conn.open) {
          try {
            conn.send(data);
          } catch (e) {}
        }
      });
    }
  }

  disconnect() {
    this.explicitlyDisconnected = true;
    this.currentJoinAttempt = (this.currentJoinAttempt || 0) + 1;
    if (this.joinRetryTimer) {
      clearTimeout(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.connections.forEach(conn => {
      try { conn.close(); } catch (e) {}
    });
    this.connections.clear();
    this.peerInfoMap.clear();

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }

    this.roomId = null;
    this.localPeerId = null;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { NetworkManager };
}
