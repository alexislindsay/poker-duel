// js/network.js - PeerJS WebRTC P2P Multiplayer Manager

class NetworkManager {
  constructor(options = {}) {
    this.isHost = false;
    this.peer = null;
    this.conn = null;
    this.roomId = null;
    this.connected = false;
    this.onConnected = options.onConnected || (() => {});
    this.onDisconnected = options.onDisconnected || (() => {});
    this.onMessage = options.onMessage || (() => {});
    this.onError = options.onError || (() => {});
  }

  // Generate a friendly 6-char alphanumeric room code
  static generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  getPrefix() {
    return 'pokerduel-v1-';
  }

  // Host a new game room
  createRoom(customCode = null) {
    return new Promise((resolve, reject) => {
      this.isHost = true;
      this.roomId = customCode || NetworkManager.generateRoomCode();
      const peerId = `${this.getPrefix()}${this.roomId.toUpperCase()}`;

      try {
        if (typeof Peer === 'undefined') {
          return reject(new Error('PeerJS library is not loaded.'));
        }

        this.peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
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
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log(`[P2P] Room created with code: ${this.roomId} (Peer ID: ${id})`);
          resolve(this.roomId);
        });

        this.peer.on('connection', (conn) => {
          console.log('[P2P] Incoming connection from opponent...');
          this.setupConnection(conn);
        });

        this.peer.on('error', (err) => {
          console.error('[P2P] Peer error:', err);
          this.onError(err);
          // If code already taken, regenerate
          if (err.type === 'unavailable-id') {
            const newCode = NetworkManager.generateRoomCode();
            this.createRoom(newCode).then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  // Join an existing game room by code
  joinRoom(roomCode) {
    return new Promise((resolve, reject) => {
      this.isHost = false;
      this.roomId = roomCode.trim().toUpperCase();
      const hostPeerId = `${this.getPrefix()}${this.roomId}`;

      try {
        if (typeof Peer === 'undefined') {
          return reject(new Error('PeerJS library is not loaded.'));
        }

        this.peer = new Peer({
          debug: 1,
          config: {
            iceServers: [
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
            ]
          }
        });

        this.peer.on('open', () => {
          console.log(`[P2P] Connecting to host: ${hostPeerId}...`);
          const conn = this.peer.connect(hostPeerId, { reliable: true });
          this.setupConnection(conn);
          
          conn.on('open', () => {
            console.log('[P2P] Connected to host!');
            resolve(this.roomId);
          });
        });

        this.peer.on('error', (err) => {
          console.error('[P2P] Join error:', err);
          this.onError(err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  setupConnection(conn) {
    this.conn = conn;

    conn.on('open', () => {
      this.connected = true;
      this.onConnected({ isHost: this.isHost, roomId: this.roomId });
    });

    conn.on('data', (data) => {
      this.onMessage(data);
    });

    conn.on('close', () => {
      console.log('[P2P] Connection closed');
      this.connected = false;
      this.onDisconnected();
    });

    conn.on('error', (err) => {
      console.error('[P2P] Connection error:', err);
      this.onError(err);
    });
  }

  send(data) {
    if (this.conn && this.connected) {
      this.conn.send(data);
    }
  }

  disconnect() {
    if (this.conn) {
      this.conn.close();
    }
    if (this.peer) {
      this.peer.destroy();
    }
    this.connected = false;
    this.roomId = null;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { NetworkManager };
}
