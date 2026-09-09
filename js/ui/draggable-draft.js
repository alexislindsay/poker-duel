// js/ui/draggable-draft.js - Encapsulated Draft Spotlight UI & Drag Controller

class DraftSpotlightController {
  constructor(options = {}) {
    this.onDecision = options.onDecision || (() => {});

    // Cache DOM elements
    this.tray = document.getElementById('draft-spotlight');
    this.dragHandle = document.getElementById('draft-drag-handle');
    this.cardContainer = document.getElementById('draft-card-container');
    this.prompt = document.getElementById('draft-prompt');
    this.actionButtons = document.getElementById('draft-action-buttons');
    this.waitingMessage = document.getElementById('draft-waiting-message');
    this.waitingText = document.getElementById('draft-waiting-text');
    this.btnKeep = document.getElementById('btn-draft-keep');
    this.btnDiscard = document.getElementById('btn-draft-discard');

    this.hasMoved = false;

    this.initDragAndDrop();
    this.initActionButtons();
  }

  initDragAndDrop() {
    if (!this.dragHandle || !this.tray) return;

    let isDragging = false;
    let startPointerX = 0, startPointerY = 0;
    let startTrayX = 0, startTrayY = 0;

    this.dragHandle.addEventListener('pointerdown', (e) => {
      const rect = this.tray.getBoundingClientRect();
      isDragging = true;
      this.hasMoved = true;
      startPointerX = e.clientX;
      startPointerY = e.clientY;
      startTrayX = rect.left;
      startTrayY = rect.top;

      // Switch from CSS transform-based centering to exact pixel coordinates
      this.tray.style.transform = 'none';
      this.tray.style.left = `${startTrayX}px`;
      this.tray.style.top = `${startTrayY}px`;

      this.tray.classList.add('is-dragging');
      this.dragHandle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    this.dragHandle.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startPointerX;
      const dy = e.clientY - startPointerY;
      const trayRect = this.tray.getBoundingClientRect();

      const maxX = window.innerWidth - trayRect.width;
      const maxY = window.innerHeight - trayRect.height;
      const newX = Math.min(Math.max(0, startTrayX + dx), maxX);
      const newY = Math.min(Math.max(0, startTrayY + dy), maxY);

      this.tray.style.left = `${newX}px`;
      this.tray.style.top = `${newY}px`;
      e.preventDefault();
    });

    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      this.tray.classList.remove('is-dragging');
    };

    this.dragHandle.addEventListener('pointerup', stopDrag);
    this.dragHandle.addEventListener('pointercancel', stopDrag);
  }

  initActionButtons() {
    if (this.btnKeep) {
      this.btnKeep.addEventListener('click', () => {
        this.onDecision('keep');
      });
    }
    if (this.btnDiscard) {
      this.btnDiscard.addEventListener('click', () => {
        this.onDecision('discard');
      });
    }
  }

  resetPosition() {
    if (!this.tray) return;
    this.hasMoved = false;
    this.tray.style.left = '50%';
    this.tray.style.top = '24%';
    this.tray.style.transform = 'translateX(-50%)';
  }

  hide() {
    if (this.tray) {
      this.tray.style.display = 'none';
    }
  }

  render(state, localPlayerId, isSpectator = false, currentTheme = 'default') {
    if (!this.tray) return;

    const isDrafting = (state && state.phase === 'DRAFTING' && state.currentDrawnCard);
    if (!isDrafting) {
      this.hide();
      return;
    }

    this.tray.style.display = 'flex';

    const isMyDraft = (state.activeDraftPlayer === localPlayerId && !isSpectator);
    const draftingPlayer = state.players ? state.players[state.activeDraftPlayer] : null;
    const draftingPlayerName = draftingPlayer ? (draftingPlayer.name || `Player ${state.activeDraftPlayer + 1}`) : 'Opponent';

    if (this.cardContainer && typeof createCardHTML === 'function') {
      // The active drafting player sees the card face-up; others see face-down card back
      this.cardContainer.innerHTML = createCardHTML(state.currentDrawnCard, !isMyDraft, currentTheme);
    }

    if (this.prompt) {
      this.prompt.textContent = isMyDraft ? 'DRAFT TURN: KEEP OR DISCARD?' : `${draftingPlayerName.toUpperCase()}'S DRAFT TURN`;
    }

    if (this.actionButtons) {
      this.actionButtons.style.display = isMyDraft ? 'flex' : 'none';
    }
    if (this.waitingMessage) {
      this.waitingMessage.style.display = isMyDraft ? 'none' : 'flex';
    }
    if (this.waitingText) {
      this.waitingText.textContent = `${draftingPlayerName} is deciding...`;
    }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { DraftSpotlightController };
}
