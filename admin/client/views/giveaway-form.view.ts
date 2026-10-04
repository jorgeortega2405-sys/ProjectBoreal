import { navigate } from '../app-router.js';
import { createGiveaway, fetchGiveawayDetail, updateGiveaway } from '../services/giveaways.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { ViewController } from '../types/common.types.js';
import { Giveaway } from '../types/giveaway.types.js';

function formatForDatetimeLocal(isoOrDateString?: string | null): string {
  if (!isoOrDateString) return '';
  const date = new Date(isoOrDateString);
  if (isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

class GiveawayFormViewController implements ViewController {
  private abortController: AbortController | null = null;
  private element: HTMLElement;
  private isSaving = false;
  private secondaryImages: string[] = [];
  private uuid: string | null = null;

  constructor(element: HTMLElement, uuid?: string) {
    this.element = element;
    this.uuid = uuid || null;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();

    if (this.uuid) {
      await this.loadExistingGiveaway(this.uuid);
    } else {
      this.initDefaultDates();
    }

    renderIcons(this.element);
  }

  private initDefaultDates(): void {
    const startInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-start-date"]');
    const endInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-end-date"]');
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    if (startInput && !startInput.value) {
      startInput.value = formatForDatetimeLocal(now.toISOString());
    }
    if (endInput && !endInput.value) {
      endInput.value = formatForDatetimeLocal(inSevenDays.toISOString());
    }
  }

  private async loadExistingGiveaway(uuid: string): Promise<void> {
    const titleEl = this.element.querySelector<HTMLElement>('[data-ref="form-title"]');
    if (titleEl) {
      titleEl.textContent = 'Editar Sorteo';
    }

    const data = await fetchGiveawayDetail(uuid);
    if (!data) {
      this.showError('No se encontró el sorteo especificado para edición.');
      return;
    }

    const titleInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-title"]');
    const descInput = this.element.querySelector<HTMLTextAreaElement>('[data-ref="input-description"]');
    const primaryInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-primary-image"]');
    const totalInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-total-tickets"]');
    const priceInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-ticket-price"]');
    const currencyInput = this.element.querySelector<HTMLSelectElement>('[data-ref="input-currency"]');
    const startInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-start-date"]');
    const endInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-end-date"]');
    const thresholdInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-threshold-pct"]');
    const countdownInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-countdown-hours"]');
    const statusInput = this.element.querySelector<HTMLSelectElement>('[data-ref="input-status"]');

    if (titleInput) titleInput.value = data.title || '';
    if (descInput) descInput.value = data.description || '';
    if (primaryInput) {
      primaryInput.value = data.primary_image_url || '';
      this.updatePrimaryImagePreview(data.primary_image_url);
    }
    if (totalInput) totalInput.value = String(data.total_tickets || 100);
    if (priceInput) priceInput.value = String(data.ticket_price || 0);
    if (currencyInput) currencyInput.value = data.currency || 'USD';
    if (startInput) startInput.value = formatForDatetimeLocal(data.start_date);
    if (endInput) endInput.value = formatForDatetimeLocal(data.end_date);
    if (thresholdInput) thresholdInput.value = String(data.min_threshold_pct || 0);
    if (countdownInput) countdownInput.value = String(data.countdown_hours || 48);
    if (statusInput) statusInput.value = data.status || 'active';

    if (Array.isArray(data.image_urls)) {
      this.secondaryImages = [...data.image_urls];
      this.renderSecondaryImagesList();
    }
  }

  private updatePrimaryImagePreview(url: string): void {
    const previewImg = this.element.querySelector<HTMLImageElement>('[data-ref="primary-preview-img"]');
    const placeholder = this.element.querySelector<HTMLElement>('[data-ref="primary-preview-placeholder"]');

    if (url && url.startsWith('http')) {
      if (previewImg) {
        previewImg.src = url;
        previewImg.style.display = 'block';
        previewImg.onerror = () => {
          previewImg.style.display = 'none';
          if (placeholder) placeholder.style.display = 'block';
        };
      }
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (previewImg) previewImg.style.display = 'none';
      if (placeholder) placeholder.style.display = 'block';
    }
  }

  private renderSecondaryImagesList(): void {
    const container = this.element.querySelector<HTMLElement>('[data-ref="secondary-images-list"]');
    if (!container) return;

    if (this.secondaryImages.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = this.secondaryImages
      .map(
        (url, idx) => `
        <div class="secondary-image-chip" data-ref="secondary-chip-${idx}" style="position: relative; width: 80px; height: 60px; border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color); background: var(--bg-surface-elevated);">
          <img src="${url}" alt="Foto secundaria" style="width: 100%; height: 100%; object-fit: cover;" />
          <button type="button" class="component-button component-button--icon-only secondary-remove-btn" data-ref="btn-remove-secondary-${idx}" data-idx="${idx}" style="position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; min-width: 22px; border-radius: 50%; background: rgba(0, 0, 0, 0.7); border: none; color: #ffffff;" title="Eliminar foto" aria-label="Eliminar foto">
            <svg class="component-icon" aria-hidden="true" style="width: 14px; height: 14px;"><use href="/icons.svg#delete"></use></svg>
          </button>
        </div>
      `
      )
      .join('');

    renderIcons(container);
  }

  private showError(msg: string): void {
    const errorEl = this.element.querySelector<HTMLElement>('[data-ref="form-error"]');
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    }
  }

  private hideError(): void {
    const errorEl = this.element.querySelector<HTMLElement>('[data-ref="form-error"]');
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSaving) return;
    this.hideError();

    const titleInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-title"]');
    const descInput = this.element.querySelector<HTMLTextAreaElement>('[data-ref="input-description"]');
    const primaryInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-primary-image"]');
    const totalInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-total-tickets"]');
    const priceInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-ticket-price"]');
    const currencyInput = this.element.querySelector<HTMLSelectElement>('[data-ref="input-currency"]');
    const startInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-start-date"]');
    const endInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-end-date"]');
    const thresholdInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-threshold-pct"]');
    const countdownInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-countdown-hours"]');
    const statusInput = this.element.querySelector<HTMLSelectElement>('[data-ref="input-status"]');

    const title = titleInput?.value.trim() || '';
    const description = descInput?.value.trim() || '';
    const primaryImageUrl = primaryInput?.value.trim() || '';
    const totalTickets = parseInt(totalInput?.value || '0', 10);
    const ticketPrice = parseFloat(priceInput?.value || '0');
    const currency = currencyInput?.value || 'USD';
    const startDate = startInput?.value ? new Date(startInput.value).toISOString() : '';
    const endDate = endInput?.value ? new Date(endInput.value).toISOString() : '';
    const minThresholdPct = parseInt(thresholdInput?.value || '0', 10);
    const countdownHours = parseInt(countdownInput?.value || '48', 10);
    const status = (statusInput?.value || 'active') as any;

    if (!title) {
      this.showError('Por favor ingresa un título para el sorteo.');
      titleInput?.focus();
      return;
    }

    if (!primaryImageUrl) {
      this.showError('Por favor ingresa la URL de la imagen principal.');
      primaryInput?.focus();
      return;
    }

    if (isNaN(totalTickets) || totalTickets <= 0) {
      this.showError('El total de boletos debe ser un número entero mayor a 0.');
      totalInput?.focus();
      return;
    }

    if (isNaN(ticketPrice) || ticketPrice <= 0) {
      this.showError('El precio por boleto debe ser mayor a 0.');
      priceInput?.focus();
      return;
    }

    if (!startDate || !endDate) {
      this.showError('Las fechas de inicio y finalización son obligatorias.');
      return;
    }

    if (new Date(endDate) <= new Date(startDate)) {
      this.showError('La fecha de finalización debe ser posterior a la fecha de inicio.');
      endInput?.focus();
      return;
    }

    const payload: Partial<Giveaway> = {
      countdown_hours: countdownHours,
      currency,
      description,
      end_date: endDate,
      image_urls: this.secondaryImages,
      min_threshold_pct: minThresholdPct,
      primary_image_url: primaryImageUrl,
      start_date: startDate,
      status,
      ticket_price: ticketPrice,
      title,
      total_tickets: totalTickets,
    };

    this.isSaving = true;
    const saveBtns = this.element.querySelectorAll<HTMLButtonElement>('[data-ref="btn-save-giveaway"], [data-ref="btn-save-bottom"]');
    saveBtns.forEach((btn) => {
      btn.disabled = true;
      btn.textContent = 'Guardando...';
    });

    try {
      if (this.uuid) {
        const result = await updateGiveaway(this.uuid, payload);
        if (result.success) {
          navigate('/sorteos');
        } else {
          this.showError(result.error || 'Fallo al actualizar el sorteo.');
        }
      } else {
        const result = await createGiveaway(payload);
        if (result.success) {
          navigate('/sorteos');
        } else {
          this.showError(result.error || 'Fallo al crear el sorteo.');
        }
      }
    } finally {
      this.isSaving = false;
      saveBtns.forEach((btn) => {
        btn.disabled = false;
        btn.textContent = 'Guardar Sorteo';
      });
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const btnBack = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-back"]');
    const btnCancel = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-cancel"]');
    const btnSaveTop = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-save-giveaway"]');
    const btnSaveBottom = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-save-bottom"]');
    const primaryInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-primary-image"]');
    const secondaryInput = this.element.querySelector<HTMLInputElement>('[data-ref="input-secondary-image"]');
    const btnAddSecondary = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-add-secondary-image"]');
    const secondaryList = this.element.querySelector<HTMLElement>('[data-ref="secondary-images-list"]');

    btnBack?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/sorteos');
      },
      { signal }
    );

    btnCancel?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        navigate('/sorteos');
      },
      { signal }
    );

    btnSaveTop?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        void this.handleSubmit();
      },
      { signal }
    );

    btnSaveBottom?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        void this.handleSubmit();
      },
      { signal }
    );

    primaryInput?.addEventListener(
      'input',
      () => {
        this.updatePrimaryImagePreview(primaryInput.value.trim());
      },
      { signal }
    );

    const addSecondaryImage = () => {
      if (!secondaryInput) return;
      const url = secondaryInput.value.trim();
      if (!url) return;
      this.secondaryImages.push(url);
      secondaryInput.value = '';
      this.renderSecondaryImagesList();
    };

    btnAddSecondary?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        addSecondaryImage();
      },
      { signal }
    );

    secondaryInput?.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addSecondaryImage();
        }
      },
      { signal }
    );

    secondaryList?.addEventListener(
      'click',
      (e) => {
        const btnRemove = (e.target as HTMLElement).closest<HTMLButtonElement>('.secondary-remove-btn');
        if (!btnRemove) return;
        e.preventDefault();
        const idxStr = btnRemove.getAttribute('data-idx');
        if (idxStr !== null) {
          const idx = parseInt(idxStr, 10);
          if (!isNaN(idx) && idx >= 0 && idx < this.secondaryImages.length) {
            this.secondaryImages.splice(idx, 1);
            this.renderSecondaryImagesList();
          }
        }
      },
      { signal }
    );
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createGiveawayFormView(uuid?: string): Promise<HTMLElement> {
  const element = await loadTemplate('/views/giveaways/giveaway-form.html');
  const controller = new GiveawayFormViewController(element, uuid);
  await controller.init();
  (element as any).__controller = controller;
  return element;
}
