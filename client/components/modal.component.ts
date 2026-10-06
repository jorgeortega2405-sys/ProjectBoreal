import { renderIcons } from '../services/icon.service.js';
import { ModalInstance, ModalOptions } from '../types/common.types.js';

let activeModals: ModalInstance[] = [];

function setupModalDragToDismiss(
  card: HTMLElement,
  dragZone: HTMLElement | null,
  header: HTMLElement | null,
  backdrop: HTMLElement,
  closeBtn: HTMLElement | null,
  closeFn: () => void
): () => void {
  let isDragging = false;
  let startY = 0;
  let currentY = 0;
  let startTime = 0;
  let activePointerId: number | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const isMobile = window.innerWidth <= 768;
    const target = e.target as HTMLElement | null;

    if (!isMobile && !target?.closest('[data-ref="modal-drag-zone"]')) {
      return;
    }

    if (target?.closest('button, a, input, select, textarea, .component-button, .modal-close-btn')) {
      return;
    }

    isDragging = true;
    activePointerId = e.pointerId;
    startY = e.clientY;
    currentY = e.clientY;
    startTime = Date.now();

    card.style.transition = 'none';
    card.classList.add('is-dragging');
    if (closeBtn && isMobile) {
      closeBtn.style.transition = 'none';
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isDragging || e.pointerId !== activePointerId) return;

    const isMobile = window.innerWidth <= 768;
    currentY = e.clientY;
    const deltaY = currentY - startY;

    if (deltaY < 0) {
      const resisted = deltaY * 0.2;
      card.style.transform = `translateY(${resisted}px)`;
      if (closeBtn && isMobile) {
        closeBtn.style.transform = `translateY(${resisted}px)`;
      }
    } else {
      card.style.transform = `translateY(${deltaY}px)`;
      if (closeBtn && isMobile) {
        closeBtn.style.transform = `translateY(${deltaY}px)`;
      }
      const cardHeight = card.offsetHeight || 300;
      const progress = Math.min(1, deltaY / cardHeight);
      backdrop.style.opacity = String(Math.max(0.2, 1 - progress * 0.8));
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isDragging || e.pointerId !== activePointerId) return;
    isDragging = false;
    activePointerId = null;
    card.classList.remove('is-dragging');

    const isMobile = window.innerWidth <= 768;
    const deltaY = currentY - startY;
    const duration = Math.max(1, Date.now() - startTime);
    const velocity = deltaY / duration;

    const shouldDismiss = deltaY > 90 || (deltaY > 40 && velocity > 0.35);

    if (shouldDismiss) {
      card.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
      card.style.transform = 'translateY(100%)';
      if (closeBtn && isMobile) {
        closeBtn.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
        closeBtn.style.transform = 'translateY(100%)';
      }
      backdrop.style.transition = 'opacity 0.22s ease';
      backdrop.style.opacity = '0';
      setTimeout(() => {
        closeFn();
      }, 200);
    } else {
      card.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.transform = '';
      if (closeBtn && isMobile) {
        closeBtn.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
        closeBtn.style.transform = '';
      }
      backdrop.style.transition = 'opacity 0.25s ease';
      backdrop.style.opacity = '';
      setTimeout(() => {
        if (!isDragging) {
          card.style.transition = '';
          backdrop.style.transition = '';
          if (closeBtn) closeBtn.style.transition = '';
        }
      }, 260);
    }
  };

  const onPointerCancel = (e: PointerEvent) => {
    if (!isDragging || e.pointerId !== activePointerId) return;
    isDragging = false;
    activePointerId = null;
    card.classList.remove('is-dragging');
    const isMobile = window.innerWidth <= 768;
    card.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
    card.style.transform = '';
    if (closeBtn && isMobile) {
      closeBtn.style.transition = 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)';
      closeBtn.style.transform = '';
    }
    backdrop.style.transition = 'opacity 0.25s ease';
    backdrop.style.opacity = '';
    setTimeout(() => {
      card.style.transition = '';
      backdrop.style.transition = '';
      if (closeBtn) closeBtn.style.transition = '';
    }, 260);
  };

  dragZone?.addEventListener('pointerdown', onPointerDown);
  header?.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  return () => {
    dragZone?.removeEventListener('pointerdown', onPointerDown);
    header?.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };
}

export function openModal(options: ModalOptions = {}): ModalInstance {
  const {
    bodyHtml = '',
    cancelText = 'Cancelar',
    confirmClass = 'component-button--black',
    confirmText = 'Continuar',
    description = '',
    onCancel = null,
    onClose = null,
    onConfirm = null,
    showCancel = true,
    showConfirm = true,
    size = 'sm',
    title = '',
  } = options;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('data-ref', 'modal-backdrop');

  backdrop.innerHTML = `
    <div class="modal-container" data-ref="modal-container">
      <button type="button" class="modal-close-btn" data-ref="btn-modal-close" aria-label="Cerrar">
        <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
      </button>
      <div class="modal-card modal-card--${size}" data-ref="modal-card">
        <div class="modal-card__drag-zone" data-ref="modal-drag-zone" aria-hidden="true">
          <div class="modal-card__drag-handle"></div>
        </div>
        ${title || description ? `
        <div class="modal-card__header" data-ref="modal-header">
          ${title ? `<h2 class="modal-card__title" data-ref="modal-title">${title}</h2>` : ''}
          ${description ? `<p class="modal-card__desc" data-ref="modal-desc">${description}</p>` : ''}
        </div>` : ''}
        <div class="modal-card__body" data-ref="modal-body"></div>
        ${showCancel || showConfirm ? `
        <div class="modal-card__footer" data-ref="modal-footer">
          <div class="modal-card__actions" data-ref="modal-actions">
            ${showCancel ? `<button type="button" class="component-button component-button--h34" data-ref="btn-modal-cancel">${cancelText}</button>` : ''}
            ${showConfirm ? `<button type="button" class="component-button component-button--h34 ${confirmClass}" data-ref="btn-modal-confirm">${confirmText}</button>` : ''}
          </div>
          <div class="banner banner--danger" data-ref="modal-error" style="display: none;"></div>
        </div>` : ''}
      </div>
    </div>
  `;

  const bodyContainer = backdrop.querySelector<HTMLElement>('[data-ref="modal-body"]');
  if (bodyContainer) {
    if (typeof bodyHtml === 'string') {
      bodyContainer.innerHTML = bodyHtml;
    } else if (bodyHtml instanceof HTMLElement) {
      bodyContainer.appendChild(bodyHtml);
    }
  }

  renderIcons(backdrop);

  const card = backdrop.querySelector<HTMLElement>('[data-ref="modal-card"]');
  const dragZone = backdrop.querySelector<HTMLElement>('[data-ref="modal-drag-zone"]');
  const header = backdrop.querySelector<HTMLElement>('[data-ref="modal-header"]');
  const closeBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-modal-close"]');
  const cancelBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-modal-cancel"]');
  const confirmBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-modal-confirm"]');
  const errorBanner = backdrop.querySelector<HTMLElement>('[data-ref="modal-error"]');
  const titleEl = backdrop.querySelector<HTMLElement>('[data-ref="modal-title"]');
  const descEl = backdrop.querySelector<HTMLElement>('[data-ref="modal-desc"]');

  let isClosing = false;
  let cleanupDrag: (() => void) | null = null;

  const modalInstance: ModalInstance = {
    backdrop,
    body: bodyContainer || document.createElement('div'),
    btnCancel: cancelBtn,
    btnConfirm: confirmBtn,
    card,
    close: () => {
      if (isClosing) return;
      isClosing = true;
      if (cleanupDrag) cleanupDrag();
      window.removeEventListener('keydown', handleKeyDown);
      backdrop.classList.add('is-closing');
      setTimeout(() => {
        backdrop.remove();
        activeModals = activeModals.filter((m) => m !== modalInstance);
        if (activeModals.length === 0) {
          document.body.classList.remove('modal-open');
        }
        if (onClose) onClose();
      }, 200);
    },
    closeBtn,
    errorBanner,
    setDescription: (desc: string) => {
      if (descEl) descEl.textContent = desc;
    },
    setError: (msg: string) => {
      if (!errorBanner) return;
      if (msg) {
        errorBanner.textContent = msg;
        errorBanner.style.display = 'block';
      } else {
        errorBanner.textContent = '';
        errorBanner.style.display = 'none';
      }
    },
    setTitle: (newTitle: string) => {
      if (titleEl) titleEl.textContent = newTitle;
    },
  };

  if (card) {
    cleanupDrag = setupModalDragToDismiss(card, dragZone, header, backdrop, closeBtn, () => {
      modalInstance.close();
    });
  }

  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    modalInstance.close();
  });

  cancelBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (onCancel) {
      const res = await onCancel();
      if (res === false) return;
    }
    modalInstance.close();
  });

  confirmBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (onConfirm) {
      const res = await onConfirm();
      if (res === false) return;
    }
    modalInstance.close();
  });

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) {
      modalInstance.close();
    }
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && activeModals[activeModals.length - 1] === modalInstance) {
      modalInstance.close();
    }
  };
  window.addEventListener('keydown', handleKeyDown);

  document.body.appendChild(backdrop);
  document.body.classList.add('modal-open');
  activeModals.push(modalInstance);

  requestAnimationFrame(() => {
    backdrop.classList.add('is-open', 'is-visible');
  });

  return modalInstance;
}

export function closeAllModals(): void {
  const modals = [...activeModals];
  modals.forEach((m) => m.close());
  document.body.classList.remove('modal-open');
}
