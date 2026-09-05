// js/sound.js - Procedural Web Audio API sound effects for Family Card Arcade

class SoundController {
  constructor() {
    this.enabled = true;
    this.ctx = null;
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  ensureContext() {
    if (!this.ctx) {
      this.initAudioContext();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  toggle(force) {
    this.enabled = force !== undefined ? force : !this.enabled;
    return this.enabled;
  }

  play(name) {
    if (!this.enabled) return;
    try {
      switch (name) {
        case 'button':
          this.playButtonClick();
          break;
        case 'card_slide':
        case 'card_deal':
        case 'draft_deal':
          this.playCardDeal();
          break;
        case 'card_flip':
        case 'card_discard':
          this.playCardDiscard();
          break;
        case 'chips':
        case 'chip':
          this.playChipSound();
          break;
        case 'check':
          this.playCheckSound();
          break;
        case 'chime':
        case 'your_turn':
          this.playYourTurn();
          break;
        case 'pot_win':
        case 'win':
          this.playWin();
          break;
        case 'bluff_caught':
          this.playBluffCaught();
          break;
        case 'powerup':
          this.playPowerup();
          break;
        default:
          this.playButtonClick();
          break;
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Button Click (subtle UI tap)
  playButtonClick() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Card Deal / Flip sound (soft paper friction / snap)
  playCardDeal() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.08);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Card Discard / Whoosh
  playCardDiscard() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  // Chip Bet / Stack Clink
  playChipSound() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    [0, 0.04].forEach(delay => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800 + Math.random() * 400, now + delay);
      osc.frequency.exponentialRampToValueAtTime(600, now + delay + 0.05);

      gain.gain.setValueAtTime(0.25, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.05);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.06);
    });
  }

  // Check / Table Knock
  playCheckSound() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    [0, 0.07].forEach(delay => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, now + delay);
      osc.frequency.exponentialRampToValueAtTime(40, now + delay + 0.06);

      gain.gain.setValueAtTime(0.4, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + delay);
      osc.stop(now + delay + 0.07);
    });
  }

  // Turn alert chime
  playYourTurn() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const notes = [523.25, 659.25]; // C5, E5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);

      gain.gain.setValueAtTime(0.25, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.26);
    });
  }

  // Siren / Caught in a Lie
  playBluffCaught() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(800, now + 0.15);
    osc.frequency.linearRampToValueAtTime(300, now + 0.3);
    osc.frequency.linearRampToValueAtTime(800, now + 0.45);
    osc.frequency.linearRampToValueAtTime(200, now + 0.6);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.66);
  }

  // Powerup / Wild 8 effect
  playPowerup() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const notes = [330, 440, 554.37, 659.25];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.06);

      gain.gain.setValueAtTime(0.25, now + i * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.22);
    });
  }

  // Victory fanfare
  playWin() {
    if (!this.enabled || !this.ctx) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const notes = [440, 554.37, 659.25, 880]; // A4, C#5, E5, A5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);

      gain.gain.setValueAtTime(0.3, now + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.42);
    });
  }
}

// Global singletons exposed for both naming conventions
const sounds = new SoundController();
const SoundFX = sounds;

// Attach to window so it's guaranteed globally available
if (typeof window !== 'undefined') {
  window.SoundController = SoundController;
  window.sounds = sounds;
  window.SoundFX = SoundFX;
}

if (typeof module !== 'undefined') {
  module.exports = { SoundController, sounds, SoundFX };
}
