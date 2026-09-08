// js/media-manager.js - WebRTC Video & Voice Chat System for Poker Duel / Card Arcadia

class MediaManager {
  constructor(options = {}) {
    this.localStream = null;
    this.peer = null;
    this.calls = new Map(); // peerId -> MediaConnection
    this.remoteStreams = new Map(); // peerId -> MediaStream
    this.peerSeatMap = new Map(); // peerId -> seatIndex (0..3) or 'spectator'
    this.getDomSeatIndex = options.getDomSeatIndex || ((s) => s);
    
    // Audio Activity Detection
    this.audioContext = null;
    this.localAnalyser = null;
    this.remoteAnalysers = new Map(); // peerId -> AnalyserNode
    this.remoteAudioElements = new Map(); // peerId -> HTMLAudioElement
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

  // Request user camera & mic permissions and start stream with graceful fallbacks
  async startMedia(constraints = { video: true, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[AV] getUserMedia not supported in this browser/context');
      return null;
    }

    try {
      if (this.localStream) {
        this.stopMedia();
      }

      const audioConfig = (typeof constraints.audio === 'object') ? constraints.audio : { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: constraints.video ? true : false,
          audio: audioConfig
        });
      } catch (videoErr) {
        console.warn('[AV] Video+Audio capture failed, trying audio-only...', videoErr);
        if (constraints.video) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: audioConfig, video: false });
          } catch (audioErr) {
            console.warn('[AV] Audio-only capture also failed:', audioErr);
          }
        }
      }

      if (!stream) {
        return null;
      }

      this.localStream = stream;
      this.isMediaActive = true;
      this.isAudioEnabled = stream.getAudioTracks().some(t => t.enabled);
      this.isVideoEnabled = stream.getVideoTracks().some(t => t.enabled);

      this.setupLocalAudioAnalyser();
      this.startVoiceActivityDetection();

      // Render local video preview in local seat pod
      this.attachStreamToSeat(this.mySeatIndex, this.localStream, true);

      // Renegotiate active calls with real audio/video tracks
      if (this.calls.size > 0 && this.localStream) {
        const videoTrack = this.localStream.getVideoTracks()[0];
        const audioTrack = this.localStream.getAudioTracks()[0];

        this.calls.forEach((call, peerId) => {
          if (call && call.peerConnection) {
            try {
              const senders = call.peerConnection.getSenders();
              let hasVideoSender = false;
              let hasAudioSender = false;
              senders.forEach(sender => {
                if (sender.track && sender.track.kind === 'video' && videoTrack) {
                  hasVideoSender = true;
                  sender.replaceTrack(videoTrack).catch(e => console.warn('[AV] replaceTrack video notice:', e));
                }
                if (sender.track && sender.track.kind === 'audio' && audioTrack) {
                  hasAudioSender = true;
                  sender.replaceTrack(audioTrack).catch(e => console.warn('[AV] replaceTrack audio notice:', e));
                }
              });
              if (!hasAudioSender && audioTrack) {
                try { call.peerConnection.addTrack(audioTrack, this.localStream); } catch (e) {}
              }
              if (!hasVideoSender && videoTrack) {
                try { call.peerConnection.addTrack(videoTrack, this.localStream); } catch (e) {}
              }
            } catch (e) {
              console.warn('[AV] Track replacement notice:', e);
            }
          }
        });
      }

      // Call any uncalled connected peers
      this.callAllConnectedPeers();

      this.onMediaStateChange({
        active: true,
        audioEnabled: this.isAudioEnabled,
        videoEnabled: this.isVideoEnabled
      });

      return stream;
    } catch (err) {
      console.warn('[AV] Media initialization notice:', err);
      return null;
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
    if (targetSeatIndex !== null) {
      this.peerSeatMap.set(peerId, targetSeatIndex);
    }
    const existingCall = this.calls.get(peerId);
    if (existingCall) {
      if (existingCall.open) {
        console.log(`[AV] Call already active with ${peerId}`);
        return;
      } else {
        try { existingCall.close(); } catch (e) {}
        this.calls.delete(peerId);
      }
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

      // Dedicated audio element to guarantee remote voice chat plays reliably
      try {
        let audioEl = this.remoteAudioElements.get(peerId);
        if (!audioEl) {
          audioEl = document.createElement('audio');
          audioEl.id = `remote-audio-${peerId}`;
          audioEl.autoplay = true;
          audioEl.playsInline = true;
          audioEl.style.display = 'none';
          document.body.appendChild(audioEl);
          this.remoteAudioElements.set(peerId, audioEl);
        }
        audioEl.srcObject = remoteStream;
        audioEl.muted = false;
        audioEl.volume = 1.0;
        audioEl.play().catch(e => console.warn(`[AV] Remote audio autoplay notice for ${peerId}:`, e));
      } catch (err) {
        console.warn(`[AV] Failed to setup dedicated audio element for ${peerId}:`, err);
      }
      
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
    const domSeat = this.getDomSeatIndex ? this.getDomSeatIndex(seatIndex) : seatIndex;
    const videoEl = document.getElementById(`player-video-${domSeat}`);
    const podEl = document.getElementById(`pod-seat-${domSeat}`);
    const avatarEl = document.getElementById(`pod-avatar-${domSeat}`);
    
    if (!videoEl) return;

    try {
      videoEl.srcObject = stream;
      const isSelf = (seatIndex === this.mySeatIndex) || (domSeat === 0);
      videoEl.muted = isSelf ? true : isMuted; // Strictly mute self to prevent echo/feedback, unmute remote players
      videoEl.volume = isSelf ? 0 : 1.0;

      const updateVideoDisplay = () => {
        const hasLiveVideo = stream && stream.getVideoTracks && stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled);
        if (hasLiveVideo) {
          videoEl.style.display = 'block';
          if (podEl) podEl.classList.add('has-video');
          if (avatarEl) avatarEl.classList.add('avatar-video-active');
        } else {
          videoEl.style.display = 'none';
          if (podEl) podEl.classList.remove('has-video');
          if (avatarEl) avatarEl.classList.remove('avatar-video-active');
        }
      };

      videoEl.onloadedmetadata = () => {
        updateVideoDisplay();
        videoEl.play().catch(e => console.warn(`[AV] Autoplay blocked for seat ${seatIndex}:`, e));
      };
      videoEl.onplaying = updateVideoDisplay;

      if (stream) {
        if (stream.onaddtrack !== undefined) stream.onaddtrack = updateVideoDisplay;
        if (stream.onremovetrack !== undefined) stream.onremovetrack = updateVideoDisplay;
      }

      updateVideoDisplay();
      videoEl.play().catch(e => console.warn(`[AV] Autoplay blocked for seat ${seatIndex} (DOM ${domSeat}):`, e));
    } catch (e) {
      console.error(`[AV] Failed to attach stream to seat ${seatIndex} (DOM ${domSeat}):`, e);
    }
  }

  detachStreamFromSeat(seatIndex) {
    const domSeat = this.getDomSeatIndex ? this.getDomSeatIndex(seatIndex) : seatIndex;
    const videoEl = document.getElementById(`player-video-${domSeat}`);
    const podEl = document.getElementById(`pod-seat-${domSeat}`);
    const avatarEl = document.getElementById(`pod-avatar-${domSeat}`);

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
    const domSeat = this.getDomSeatIndex ? this.getDomSeatIndex(seatIndex) : seatIndex;
    const videoEl = document.getElementById(`player-video-${domSeat}`);
    const avatarEl = document.getElementById(`pod-avatar-${domSeat}`);
    if (videoEl) {
      videoEl.style.opacity = isVisible ? '1' : '0';
      videoEl.style.display = isVisible ? 'block' : 'none';
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
    const domSeat = this.getDomSeatIndex ? this.getDomSeatIndex(seatIndex) : seatIndex;
    const pod = document.getElementById(`pod-seat-${domSeat}`);
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
      const stream = canvas.captureStream(1);

      // Add a silent audio track so WebRTC SDP negotiates both audio and video transceivers
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          const audioCtx = new AudioCtx();
          const osc = audioCtx.createOscillator();
          const dst = audioCtx.createMediaStreamDestination();
          const gain = audioCtx.createGain();
          gain.gain.value = 0; // Silent
          osc.connect(gain);
          gain.connect(dst);
          osc.start();
          const audioTrack = dst.stream.getAudioTracks()[0];
          if (audioTrack) stream.addTrack(audioTrack);
        } catch (audioErr) {
          console.warn('[AV] Synthetic audio track notice:', audioErr);
        }
      }
      return stream;
    } catch (e) {
      return new MediaStream();
    }
  }

  resumeAllAudio() {
    this.initAudioContext();
    this.remoteAudioElements.forEach((audioEl, peerId) => {
      if (audioEl && audioEl.srcObject) {
        audioEl.muted = false;
        audioEl.volume = 1.0;
        audioEl.play().catch(e => console.warn(`[AV] Audio play notice for ${peerId}:`, e));
      }
    });

    // Also resume remote video audio playback for seats 1..3
    [1, 2, 3].forEach(seat => {
      const videoEl = document.getElementById(`player-video-${seat}`);
      if (videoEl && videoEl.srcObject) {
        videoEl.muted = false;
        videoEl.volume = 1.0;
        videoEl.play().catch(e => {});
      }
    });
  }

  cleanupPeer(peerId) {
    const seatIndex = this.peerSeatMap.get(peerId);
    if (seatIndex !== undefined && seatIndex !== null && seatIndex !== 'spectator') {
      this.detachStreamFromSeat(seatIndex);
    }
    const audioEl = this.remoteAudioElements.get(peerId);
    if (audioEl) {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl);
      } catch (e) {}
      this.remoteAudioElements.delete(peerId);
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

    this.remoteAudioElements.forEach(audioEl => {
      try {
        audioEl.pause();
        audioEl.srcObject = null;
        if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl);
      } catch (e) {}
    });
    this.remoteAudioElements.clear();
  }
}

if (typeof module !== 'undefined') {
  module.exports = { MediaManager };
}
