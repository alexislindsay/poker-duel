// js/media-manager.js - WebRTC Video & Voice Chat System for Poker Duel / Card Arcadia

class MediaManager {
  constructor(options = {}) {
    this.localStream = null;
    this.peer = null;
    this.calls = new Map(); // peerId -> MediaConnection
    this.remoteStreams = new Map(); // peerId -> MediaStream
    this.peerSeatMap = new Map(); // peerId -> seatIndex (0..3) or 'spectator'
    
    // Audio Activity Detection
    this.audioContext = null;
    this.localAnalyser = null;
    this.remoteAnalysers = new Map(); // peerId -> AnalyserNode
    this.analyserInterval = null;

    // State
    this.isAudioEnabled = true;
    this.isVideoEnabled = true;
    this.isMediaActive = false;
    this.mySeatIndex = 0;
    this.isSpectator = false;

    // Callbacks
    this.onStreamAdded = options.onStreamAdded || (() => {});
    this.onStreamRemoved = options.onStreamRemoved || (() => {});
    this.onSpeakingChange = options.onSpeakingChange || (() => {});
    this.onMediaStateChange = options.onMediaStateChange || (() => {});
    this.onError = options.onError || (() => {});
  }

  // Initialize and attach to PeerJS instance
  attachPeer(peer, mySeatIndex = 0, isSpectator = false) {
    this.peer = peer;
    this.mySeatIndex = mySeatIndex;
    this.isSpectator = isSpectator;

    if (!this.peer) return;

    // Listen for incoming calls
    this.peer.on('call', (call) => {
      console.log(`[AV] Incoming media call from: ${call.peer}`);
      this.handleIncomingCall(call);
    });
  }

  // Request user camera & mic permissions and start stream
  async startMedia(constraints = { video: true, audio: true }) {
    try {
      if (this.localStream) {
        this.stopMedia();
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.localStream = stream;
      this.isMediaActive = true;
      this.isAudioEnabled = stream.getAudioTracks().some(t => t.enabled);
      this.isVideoEnabled = stream.getVideoTracks().some(t => t.enabled);

      this.setupLocalAudioAnalyser();
      this.startVoiceActivityDetection();

      // Render local video preview in local seat pod
      this.attachStreamToSeat(this.mySeatIndex, this.localStream, true);

      // Call all already connected peers with our local stream
      this.callAllConnectedPeers();

      this.onMediaStateChange({
        active: true,
        audioEnabled: this.isAudioEnabled,
        videoEnabled: this.isVideoEnabled
      });

      return stream;
    } catch (err) {
      console.error('[AV] Failed to access media devices:', err);
      this.onError(err);
      throw err;
    }
  }

  // Toggle Microphone Mute/Unmute
  toggleAudio() {
    if (!this.localStream) return false;
    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    this.isAudioEnabled = !this.isAudioEnabled;
    audioTracks.forEach(track => {
      track.enabled = this.isAudioEnabled;
    });

    this.onMediaStateChange({
      active: this.isMediaActive,
      audioEnabled: this.isAudioEnabled,
      videoEnabled: this.isVideoEnabled
    });

    return this.isAudioEnabled;
  }

  // Toggle Camera On/Off
  toggleVideo() {
    if (!this.localStream) return false;
    const videoTracks = this.localStream.getVideoTracks();
    if (videoTracks.length === 0) return false;

    this.isVideoEnabled = !this.isVideoEnabled;
    videoTracks.forEach(track => {
      track.enabled = this.isVideoEnabled;
    });

    this.onMediaStateChange({
      active: this.isMediaActive,
      audioEnabled: this.isAudioEnabled,
      videoEnabled: this.isVideoEnabled
    });

    // Update local video element visibility
    this.updateSeatVideoDisplay(this.mySeatIndex, this.isVideoEnabled);

    return this.isVideoEnabled;
  }

  // Call a specific peer
  callPeer(peerId, targetSeatIndex = null) {
    if (!this.peer || !peerId || peerId === this.peer.id) return;
    if (this.calls.has(peerId)) {
      console.log(`[AV] Already have call with ${peerId}`);
      return;
    }

    if (targetSeatIndex !== null) {
      this.peerSeatMap.set(peerId, targetSeatIndex);
    }

    // Even if localStream is not yet started, create an empty audio/video stream or call with stream
    const streamToSend = this.localStream || this.createEmptyMediaStream();

    console.log(`[AV] Calling peer ${peerId}...`);
    try {
      const call = this.peer.call(peerId, streamToSend);
      this.setupCallEvents(call, peerId);
    } catch (e) {
      console.warn(`[AV] Error placing call to ${peerId}:`, e);
    }
  }

  // Handle incoming call
  handleIncomingCall(call) {
    const peerId = call.peer;
    const streamToSend = this.localStream || this.createEmptyMediaStream();

    call.answer(streamToSend);
    this.setupCallEvents(call, peerId);
  }

  setupCallEvents(call, peerId) {
    this.calls.set(peerId, call);

    call.on('stream', (remoteStream) => {
      console.log(`[AV] Received remote stream from peer: ${peerId}`);
      this.remoteStreams.set(peerId, remoteStream);
      
      const seatIndex = this.peerSeatMap.get(peerId);
      this.setupRemoteAudioAnalyser(peerId, remoteStream);

      this.onStreamAdded({ peerId, seatIndex, stream: remoteStream });

      if (seatIndex !== undefined && seatIndex !== null && seatIndex !== 'spectator') {
        this.attachStreamToSeat(seatIndex, remoteStream, false);
      }
    });

    call.on('close', () => {
      console.log(`[AV] Call with peer ${peerId} closed.`);
      this.cleanupPeer(peerId);
    });

    call.on('error', (err) => {
      console.error(`[AV] Call error with ${peerId}:`, err);
      this.cleanupPeer(peerId);
    });
  }

  callAllConnectedPeers(peerIds = []) {
    if (!this.peer) return;
    for (const peerId of peerIds) {
      this.callPeer(peerId);
    }
  }

  setPeerSeat(peerId, seatIndex) {
    this.peerSeatMap.set(peerId, seatIndex);
    const stream = this.remoteStreams.get(peerId);
    if (stream && seatIndex !== 'spectator' && seatIndex !== undefined && seatIndex !== null) {
      this.attachStreamToSeat(seatIndex, stream, false);
    }
  }

  // Attach a MediaStream to a Player Pod video element
  attachStreamToSeat(seatIndex, stream, isMuted = false) {
    const videoEl = document.getElementById(`player-video-${seatIndex}`);
    const podEl = document.getElementById(`pod-seat-${seatIndex}`);
    const avatarEl = document.getElementById(`pod-avatar-${seatIndex}`);
    
    if (!videoEl) return;

    try {
      videoEl.srcObject = stream;
      videoEl.muted = isMuted; // Mute self, unmute others
      videoEl.play().catch(e => console.warn(`[AV] Autoplay blocked for seat ${seatIndex}:`, e));
      videoEl.style.display = 'block';

      if (podEl) {
        podEl.classList.add('has-video');
      }
      if (avatarEl) {
        avatarEl.classList.add('avatar-video-active');
      }
    } catch (e) {
      console.error(`[AV] Failed to attach stream to seat ${seatIndex}:`, e);
    }
  }

  detachStreamFromSeat(seatIndex) {
    const videoEl = document.getElementById(`player-video-${seatIndex}`);
    const podEl = document.getElementById(`pod-seat-${seatIndex}`);
    const avatarEl = document.getElementById(`pod-avatar-${seatIndex}`);

    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.style.display = 'none';
    }
    if (podEl) {
      podEl.classList.remove('has-video');
      podEl.classList.remove('is-speaking');
    }
    if (avatarEl) {
      avatarEl.classList.remove('avatar-video-active');
    }
  }

  updateSeatVideoDisplay(seatIndex, isVisible) {
    const videoEl = document.getElementById(`player-video-${seatIndex}`);
    const avatarEl = document.getElementById(`pod-avatar-${seatIndex}`);
    if (videoEl) {
      videoEl.style.opacity = isVisible ? '1' : '0';
    }
    if (avatarEl) {
      if (isVisible) {
        avatarEl.classList.add('avatar-video-active');
      } else {
        avatarEl.classList.remove('avatar-video-active');
      }
    }
  }

  // Audio Analysers & Voice Activity Detection
  initAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  setupLocalAudioAnalyser() {
    if (!this.localStream) return;
    this.initAudioContext();
    if (!this.audioContext) return;

    try {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const source = this.audioContext.createMediaStreamSource(this.localStream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      this.localAnalyser = analyser;
    } catch (e) {
      console.warn('[AV] Failed to setup local audio analyser:', e);
    }
  }

  setupRemoteAudioAnalyser(peerId, stream) {
    this.initAudioContext();
    if (!this.audioContext) return;

    try {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) return;

      const source = this.audioContext.createMediaStreamSource(stream);
      const analyser = this.audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);
      this.remoteAnalysers.set(peerId, analyser);
    } catch (e) {
      console.warn(`[AV] Failed to setup remote audio analyser for ${peerId}:`, e);
    }
  }

  startVoiceActivityDetection() {
    if (this.analyserInterval) clearInterval(this.analyserInterval);

    const THRESHOLD = 18; // Audio volume threshold (0..255)

    this.analyserInterval = setInterval(() => {
      // Local check
      if (this.localAnalyser && this.isAudioEnabled) {
        const data = new Uint8Array(this.localAnalyser.frequencyBinCount);
        this.localAnalyser.getByteFrequencyData(data);
        const average = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeaking = average > THRESHOLD;
        this.setSeatSpeaking(this.mySeatIndex, isSpeaking);
      } else {
        this.setSeatSpeaking(this.mySeatIndex, false);
      }

      // Remote checks
      this.remoteAnalysers.forEach((analyser, peerId) => {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const average = data.reduce((a, b) => a + b, 0) / data.length;
        const isSpeaking = average > THRESHOLD;
        const seatIndex = this.peerSeatMap.get(peerId);
        if (seatIndex !== undefined && seatIndex !== null && seatIndex !== 'spectator') {
          this.setSeatSpeaking(seatIndex, isSpeaking);
        }
      });
    }, 120);
  }

  setSeatSpeaking(seatIndex, isSpeaking) {
    const pod = document.getElementById(`pod-seat-${seatIndex}`);
    if (pod) {
      if (isSpeaking) {
        pod.classList.add('is-speaking');
      } else {
        pod.classList.remove('is-speaking');
      }
    }
  }

  createEmptyMediaStream() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 16;
      canvas.height = 16;
      const ctx = canvas.getContext('2d');
      ctx.fillRect(0, 0, 16, 16);
      return canvas.captureStream(1);
    } catch (e) {
      return new MediaStream();
    }
  }

  cleanupPeer(peerId) {
    const seatIndex = this.peerSeatMap.get(peerId);
    if (seatIndex !== undefined && seatIndex !== null && seatIndex !== 'spectator') {
      this.detachStreamFromSeat(seatIndex);
    }
    this.calls.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.remoteAnalysers.delete(peerId);
    this.peerSeatMap.delete(peerId);
    this.onStreamRemoved({ peerId, seatIndex });
  }

  stopMedia() {
    if (this.analyserInterval) {
      clearInterval(this.analyserInterval);
      this.analyserInterval = null;
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    this.isMediaActive = false;
    this.detachStreamFromSeat(this.mySeatIndex);

    this.onMediaStateChange({
      active: false,
      audioEnabled: false,
      videoEnabled: false
    });
  }

  destroy() {
    this.stopMedia();
    this.calls.forEach(call => {
      try { call.close(); } catch (e) {}
    });
    this.calls.clear();
    this.remoteStreams.clear();
    this.peerSeatMap.clear();
  }
}

if (typeof module !== 'undefined') {
  module.exports = { MediaManager };
}
