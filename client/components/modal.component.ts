import { renderIcons } from '../services/icon.service.js';
import { ModalInstance, ModalOptions } from '../types/common.types.js';

let activeModals: ModalInstance[] = [];

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
  const closeBtn = backdrop.querySelector<HTMLElement>('[data-ref="btn-modal-close"]');
  const cancelBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-modal-cancel"]');
  const confirmBtn = backdrop.querySelector<HTMLButtonElement>('[data-ref="btn-modal-confirm"]');
  const errorBanner = backdrop.querySelector<HTMLElement>('[data-ref="modal-error"]');
  const titleEl = backdrop.querySelector<HTMLElement>('[data-ref="modal-title"]');
  const descEl = backdrop.querySelector<HTMLElement>('[data-ref="modal-desc"]');

  let isClosing = false;

  const modalInstance: ModalInstance = {
    backdrop,
    body: bodyContainer || document.createElement('div'),
    btnCancel: cancelBtn,
    btnConfirm: confirmBtn,
    card,
    close: () => {
      if (isClosing) return;
      isClosing = true;
      window.removeEventListener('keydown', handleKeyDown);
      backdrop.classList.add('is-closing');
      setTimeout(() => {
        backdrop.remove();
        activeModals = activeModals.filter((m) => m !== modalInstance);
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
  activeModals.push(modalInstance);

  requestAnimationFrame(() => {
    backdrop.classList.add('is-open', 'is-visible');
  });

  return modalInstance;
}

export function closeAllModals(): void {
  const modals = [...activeModals];
  modals.forEach((m) => m.close());
}
