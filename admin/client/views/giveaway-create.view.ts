import { navigate } from '../app-router.js';
import { RouteContext } from '../config/routes.config.js';
import { getApi, postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, escapeHtml, setupDropdown } from '../utils/dom.util.js';

interface BankAccountItem {
  account_holder: string;
  account_number: string | null;
  account_type: 'clabe' | 'card' | 'both';
  bank_name: string;
  card_number: string | null;
  clabe: string | null;
  currency: string;
  id: number;
  is_active: number;
  uuid: string;
}

interface GiveawayDuplicateData {
  countdown_hours?: number;
  description?: string | null;
  image_urls?: string[];
  min_threshold_pct?: number;
  package_options?: number[];
  primary_image_url?: string;
  prize_amount?: number | null;
  slug?: string;
  ticket_price?: number;
  title?: string;
  total_tickets?: number;
  type?: 'standard' | 'daily';
}

function formatCurrency(amount: number, currency = 'MXN'): string {
  return new Intl.NumberFormat('es-MX', {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-MX').format(num);
}

function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

export class GiveawayCreateController implements ViewController {
  private abortController: AbortController | null = null;
  private bannerError: HTMLElement | null = null;
  private banksContainer: HTMLElement | null = null;
  private btnAddSecondaryImg: HTMLButtonElement | null = null;
  private btnBack: HTMLButtonElement | null = null;
  private btnCancel: HTMLButtonElement | null = null;
  private btnChangeCover: HTMLButtonElement | null = null;
  private btnHeaderCancel: HTMLButtonElement | null = null;
  private btnHeaderSave: HTMLButtonElement | null = null;
  private btnRemoveCover: HTMLButtonElement | null = null;
  private btnSubmit: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private coverDropzone: HTMLElement | null = null;
  private coverPreviewCard: HTMLElement | null = null;
  private coverPreviewName: HTMLElement | null = null;
  private coverPreviewThumb: HTMLImageElement | null = null;
  private form: HTMLFormElement | null = null;
  private inputCountdownHours: HTMLInputElement | null = null;
  private inputCoverFile: HTMLInputElement | null = null;
  private inputEndDate: HTMLInputElement | null = null;
  private inputImageUrl: HTMLInputElement | null = null;
  private inputMinThreshold: HTMLInputElement | null = null;
  private inputPackageOptions: HTMLInputElement | null = null;
  private inputPrizeAmount: HTMLInputElement | null = null;
  private inputSecondaryFiles: HTMLInputElement | null = null;
  private inputSlug: HTMLInputElement | null = null;
  private inputStartDate: HTMLInputElement | null = null;
  private inputTicketPrice: HTMLInputElement | null = null;
  private inputTitle: HTMLInputElement | null = null;
  private inputTotalTickets: HTMLInputElement | null = null;
  private isSubmitting = false;
  private previewBadgePrice: HTMLElement | null = null;
  private previewBadgeStatus: HTMLElement | null = null;
  private previewBadgeType: HTMLElement | null = null;
  private previewImg: HTMLImageElement | null = null;
  private previewImgFallback: HTMLElement | null = null;
  private previewTickets: HTMLElement | null = null;
  private previewTitle: HTMLElement | null = null;
  private routeContext?: RouteContext;
  private secondaryGrid: HTMLElement | null = null;
  private secondaryImages: string[] = [];
  private selectedStatus: 'active' | 'draft' = 'active';
  private statDuration: HTMLElement | null = null;
  private statPrizeAmount: HTMLElement | null = null;
  private statRevenue: HTMLElement | null = null;
  private statThreshold: HTMLElement | null = null;
  private statusDropdownController: DropdownController | null = null;
  private statusSelectedIconUse: SVGUseElement | null = null;
  private statusSelectedText: HTMLElement | null = null;
  private textareaDesc: HTMLTextAreaElement | null = null;

  constructor(container: HTMLElement, routeContext?: RouteContext) {
    this.container = container;
    this.routeContext = routeContext;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();

    this.form = this.container.querySelector<HTMLFormElement>('[data-ref="form-giveaway-create"]');
    this.btnBack = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-back"]');
    this.btnHeaderCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-header-cancel"]');
    this.btnHeaderSave = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-header-save"]');
    this.btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-create"]');
    this.btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-create"]');
    this.bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    this.banksContainer = this.container.querySelector<HTMLElement>('[data-ref="banks-container"]');

    this.inputTitle = this.container.querySelector<HTMLInputElement>('[data-ref="input-title"]');
    this.inputSlug = this.container.querySelector<HTMLInputElement>('[data-ref="input-slug"]');
    this.inputPrizeAmount = this.container.querySelector<HTMLInputElement>('[data-ref="input-prize-amount"]');
    this.textareaDesc = this.container.querySelector<HTMLTextAreaElement>('[data-ref="textarea-description"]');
    this.inputTicketPrice = this.container.querySelector<HTMLInputElement>('[data-ref="input-ticket-price"]');
    this.inputTotalTickets = this.container.querySelector<HTMLInputElement>('[data-ref="input-total-tickets"]');
    this.inputPackageOptions = this.container.querySelector<HTMLInputElement>('[data-ref="input-package-options"]');
    this.inputStartDate = this.container.querySelector<HTMLInputElement>('[data-ref="input-start-date"]');
    this.inputEndDate = this.container.querySelector<HTMLInputElement>('[data-ref="input-end-date"]');
    this.inputMinThreshold = this.container.querySelector<HTMLInputElement>('[data-ref="input-min-threshold"]');
    this.inputCountdownHours = this.container.querySelector<HTMLInputElement>('[data-ref="input-countdown-hours"]');
    this.inputImageUrl = this.container.querySelector<HTMLInputElement>('[data-ref="input-image-url"]');

    this.coverDropzone = this.container.querySelector<HTMLElement>('[data-ref="cover-dropzone"]');
    this.inputCoverFile = this.container.querySelector<HTMLInputElement>('[data-ref="input-cover-file"]');
    this.coverPreviewCard = this.container.querySelector<HTMLElement>('[data-ref="cover-preview-card"]');
    this.coverPreviewThumb = this.container.querySelector<HTMLImageElement>('[data-ref="cover-preview-thumb"]');
    this.coverPreviewName = this.container.querySelector<HTMLElement>('[data-ref="cover-preview-name"]');
    this.btnChangeCover = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-change-cover"]');
    this.btnRemoveCover = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-remove-cover"]');

    this.inputSecondaryFiles = this.container.querySelector<HTMLInputElement>('[data-ref="input-secondary-files"]');
    this.btnAddSecondaryImg = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-add-secondary-img"]');
    this.secondaryGrid = this.container.querySelector<HTMLElement>('[data-ref="secondary-images-grid"]');

    this.statusSelectedText = this.container.querySelector<HTMLElement>('[data-ref="status-selected-text"]');
    this.statusSelectedIconUse = this.container.querySelector<SVGUseElement>('[data-ref="status-selected-icon"] use');

    this.previewImg = this.container.querySelector<HTMLImageElement>('[data-ref="preview-img"]');
    this.previewImgFallback = this.container.querySelector<HTMLElement>('[data-ref="preview-img-fallback"]');
    this.previewBadgeType = this.container.querySelector<HTMLElement>('[data-ref="preview-badge-type"]');
    this.previewBadgePrice = this.container.querySelector<HTMLElement>('[data-ref="preview-badge-price"]');
    this.previewBadgeStatus = this.container.querySelector<HTMLElement>('[data-ref="preview-badge-status"]');
    this.previewTitle = this.container.querySelector<HTMLElement>('[data-ref="preview-title"]');
    this.previewTickets = this.container.querySelector<HTMLElement>('[data-ref="preview-tickets"]');
    this.statPrizeAmount = this.container.querySelector<HTMLElement>('[data-ref="stat-prize-amount"]');
    this.statRevenue = this.container.querySelector<HTMLElement>('[data-ref="stat-potential-revenue"]');
    this.statThreshold = this.container.querySelector<HTMLElement>('[data-ref="stat-threshold-tickets"]');
    this.statDuration = this.container.querySelector<HTMLElement>('[data-ref="stat-duration-days"]');

    const statusWrapper = this.container.querySelector<HTMLElement>('[data-ref="dropdown-wrapper-status"]');
    if (statusWrapper) {
      this.statusDropdownController = setupDropdown(statusWrapper, {
        isSelect: true,
        matchWidth: true,
        placement: 'bottom-start',
      });
    }

    this.initializeDefaultDates();
    this.checkPrefillData();
    this.bindEvents();
    this.updateLivePreview();
    renderIcons(this.container);
    await this.loadBankAccounts();
  }

  private initializeDefaultDates(): void {
    const now = new Date();
    const defaultEnd = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

    if (this.inputStartDate && !this.inputStartDate.value) {
      this.inputStartDate.value = toLocalIso(now);
    }
    if (this.inputEndDate && !this.inputEndDate.value) {
      this.inputEndDate.value = toLocalIso(defaultEnd);
    }
  }

  private checkPrefillData(): void {
    try {
      const stored = sessionStorage.getItem('boreal_duplicate_giveaway');
      if (stored) {
        sessionStorage.removeItem('boreal_duplicate_giveaway');
        const data = JSON.parse(stored) as GiveawayDuplicateData;
        if (data.title && this.inputTitle) this.inputTitle.value = data.title;
        if (data.slug && this.inputSlug) this.inputSlug.value = `${data.slug}-copia`;
        if (typeof data.prize_amount === 'number' && this.inputPrizeAmount) this.inputPrizeAmount.value = String(data.prize_amount);
        if (data.description && this.textareaDesc) this.textareaDesc.value = data.description;
        if (typeof data.ticket_price === 'number' && this.inputTicketPrice) this.inputTicketPrice.value = String(data.ticket_price);
        if (typeof data.total_tickets === 'number' && this.inputTotalTickets) this.inputTotalTickets.value = String(data.total_tickets);
        if (data.package_options && this.inputPackageOptions) this.inputPackageOptions.value = data.package_options.join(', ');
        if (typeof data.min_threshold_pct === 'number' && this.inputMinThreshold) this.inputMinThreshold.value = String(data.min_threshold_pct);
        if (typeof data.countdown_hours === 'number' && this.inputCountdownHours) this.inputCountdownHours.value = String(data.countdown_hours);
        if (data.primary_image_url) {
          this.setCoverImage(data.primary_image_url, 'Imagen duplicada');
        }
        if (data.image_urls && Array.isArray(data.image_urls)) {
          this.secondaryImages = data.image_urls.filter((url) => url !== data.primary_image_url);
          this.renderSecondaryGrid();
        }
      }
    } catch (_) {}
  }

  private setStatus(status: 'active' | 'draft'): void {
    this.selectedStatus = status;
    if (this.statusSelectedText) {
      this.statusSelectedText.textContent = status === 'active'
        ? 'Activo (Publicar en la plataforma inmediatamente)'
        : 'Borrador (Guardar sin publicar)';
    }
    if (this.statusSelectedIconUse) {
      this.statusSelectedIconUse.setAttribute(
        'href',
        status === 'active' ? '/icons.svg#check_circle' : '/icons.svg#edit_note'
      );
    }
    const options = this.container.querySelectorAll<HTMLButtonElement>('[data-status-value]');
    options.forEach((opt) => {
      if (opt.getAttribute('data-status-value') === status) {
        opt.classList.add('is-active');
      } else {
        opt.classList.remove('is-active');
      }
    });
    this.updateLivePreview();
  }

  private setCoverImage(url: string, name = 'Imagen de portada'): void {
    if (this.inputImageUrl) this.inputImageUrl.value = url;
    if (this.coverPreviewThumb) this.coverPreviewThumb.src = url;
    if (this.coverPreviewName) this.coverPreviewName.textContent = name;
    if (this.coverDropzone) this.coverDropzone.classList.add('is-hidden');
    if (this.coverPreviewCard) this.coverPreviewCard.classList.remove('is-hidden');
    this.updateLivePreview();
  }

  private removeCoverImage(): void {
    if (this.inputImageUrl) this.inputImageUrl.value = '';
    if (this.inputCoverFile) this.inputCoverFile.value = '';
    if (this.coverPreviewThumb) this.coverPreviewThumb.src = '';
    if (this.coverPreviewCard) this.coverPreviewCard.classList.add('is-hidden');
    if (this.coverDropzone) this.coverDropzone.classList.remove('is-hidden');
    this.updateLivePreview();
  }

  private async uploadFile(file: File): Promise<string | null> {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const res = await postApi<{ url: string }>('/api/giveaways/upload', {
        fileData: dataUrl,
        fileName: file.name,
      });
      if (res.success && res.data?.url) {
        return res.data.url;
      }
      showToast(res.error || 'Error al subir la imagen.', 'danger');
      return null;
    } catch (err: any) {
      showToast(err?.message || 'Error inesperado al procesar la imagen.', 'danger');
      return null;
    }
  }

  private async handleCoverFile(file: File): Promise<void> {
    if (!file.type.startsWith('image/')) {
      showToast('Por favor selecciona un archivo de imagen válido.', 'danger');
      return;
    }
    const uploadedUrl = await this.uploadFile(file);
    if (uploadedUrl) {
      this.setCoverImage(uploadedUrl, file.name);
      showToast('Imagen de portada subida correctamente.', 'success');
    }
  }

  private async handleSecondaryFiles(files: FileList): Promise<void> {
    const validFiles: File[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('image/')) {
        validFiles.push(f);
      }
    }

    if (validFiles.length === 0) {
      showToast('Por favor selecciona archivos de imagen válidos.', 'danger');
      return;
    }

    let successCount = 0;
    for (const file of validFiles) {
      const uploadedUrl = await this.uploadFile(file);
      if (uploadedUrl) {
        this.secondaryImages.push(uploadedUrl);
        successCount++;
      }
    }

    if (successCount > 0) {
      this.renderSecondaryGrid();
      showToast(`${successCount} ${successCount === 1 ? 'imagen secundaria añadida' : 'imágenes secundarias añadidas'}.`, 'success');
    }
  }

  private renderSecondaryGrid(): void {
    const grid = this.secondaryGrid;
    if (!grid) return;

    const existingItems = grid.querySelectorAll('.giveaway-gallery-item');
    existingItems.forEach((el) => el.remove());

    const addButton = this.btnAddSecondaryImg;

    this.secondaryImages.forEach((url, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'giveaway-gallery-item';
      itemEl.innerHTML = `
        <img class="giveaway-gallery-item__img" src="${escapeHtml(url)}" alt="Foto secundaria ${idx + 1}" loading="lazy" />
        <span class="giveaway-gallery-item__badge">${idx + 1}</span>
        <button type="button" class="giveaway-gallery-item__remove" data-index="${idx}" data-tooltip="Eliminar foto" aria-label="Eliminar foto">
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#close"></use></svg>
        </button>
      `;

      const removeBtn = itemEl.querySelector<HTMLButtonElement>('.giveaway-gallery-item__remove');
      removeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.secondaryImages.splice(idx, 1);
        this.renderSecondaryGrid();
      });

      if (addButton && addButton.parentNode === grid) {
        grid.insertBefore(itemEl, addButton);
      } else {
        grid.appendChild(itemEl);
      }
    });

    renderIcons(grid);
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const navigateBack = () => navigate('/giveaways');
    this.btnBack?.addEventListener('click', navigateBack, { signal });
    this.btnHeaderCancel?.addEventListener('click', navigateBack, { signal });
    this.btnCancel?.addEventListener('click', navigateBack, { signal });

    this.btnHeaderSave?.addEventListener('click', () => void this.handleSubmit(), { signal });
    this.form?.addEventListener('submit', (e) => void this.handleSubmit(e), { signal });

    const handleInput = () => this.updateLivePreview();
    this.inputTitle?.addEventListener('input', handleInput, { signal });
    this.inputSlug?.addEventListener('input', handleInput, { signal });
    this.inputPrizeAmount?.addEventListener('input', handleInput, { signal });
    this.inputTicketPrice?.addEventListener('input', handleInput, { signal });
    this.inputTotalTickets?.addEventListener('input', handleInput, { signal });
    this.inputStartDate?.addEventListener('change', handleInput, { signal });
    this.inputEndDate?.addEventListener('change', handleInput, { signal });
    this.inputMinThreshold?.addEventListener('input', handleInput, { signal });
    this.inputImageUrl?.addEventListener('input', handleInput, { signal });

    this.coverDropzone?.addEventListener('click', () => {
      this.inputCoverFile?.click();
    }, { signal });

    this.coverDropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.coverDropzone?.classList.add('is-dragover');
    }, { signal });

    this.coverDropzone?.addEventListener('dragleave', () => {
      this.coverDropzone?.classList.remove('is-dragover');
    }, { signal });

    this.coverDropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      this.coverDropzone?.classList.remove('is-dragover');
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        void this.handleCoverFile(e.dataTransfer.files[0]);
      }
    }, { signal });

    this.inputCoverFile?.addEventListener('change', () => {
      if (this.inputCoverFile?.files && this.inputCoverFile.files.length > 0) {
        void this.handleCoverFile(this.inputCoverFile.files[0]);
      }
    }, { signal });

    this.btnChangeCover?.addEventListener('click', () => {
      this.inputCoverFile?.click();
    }, { signal });

    this.btnRemoveCover?.addEventListener('click', () => {
      this.removeCoverImage();
    }, { signal });

    this.btnAddSecondaryImg?.addEventListener('click', () => {
      this.inputSecondaryFiles?.click();
    }, { signal });

    this.inputSecondaryFiles?.addEventListener('change', () => {
      if (this.inputSecondaryFiles?.files && this.inputSecondaryFiles.files.length > 0) {
        void this.handleSecondaryFiles(this.inputSecondaryFiles.files);
        this.inputSecondaryFiles.value = '';
      }
    }, { signal });

    const statusOptions = this.container.querySelectorAll<HTMLButtonElement>('[data-status-value]');
    statusOptions.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const val = btn.getAttribute('data-status-value') as 'active' | 'draft';
          if (val) {
            this.setStatus(val);
            this.statusDropdownController?.close();
          }
        },
        { signal }
      );
    });

    if (this.previewImg) {
      this.previewImg.addEventListener(
        'error',
        () => {
          if (this.previewImg) this.previewImg.classList.add('is-hidden');
          if (this.previewImgFallback) this.previewImgFallback.classList.remove('is-hidden');
        },
        { signal }
      );
      this.previewImg.addEventListener(
        'load',
        () => {
          if (this.previewImg) this.previewImg.classList.remove('is-hidden');
          if (this.previewImgFallback) this.previewImgFallback.classList.add('is-hidden');
        },
        { signal }
      );
    }
  }

  private updateLivePreview(): void {
    const titleVal = this.inputTitle?.value.trim() || 'Título del Sorteo';
    const priceVal = Math.max(0, Number(this.inputTicketPrice?.value) || 0);
    const totalVal = Math.max(0, Number(this.inputTotalTickets?.value) || 0);
    const prizeAmountVal = Math.max(0, Number(this.inputPrizeAmount?.value) || 0);
    const imageVal = this.inputImageUrl?.value.trim() || '';
    const statusVal = this.selectedStatus;
    const minThresholdVal = Math.min(100, Math.max(0, Number(this.inputMinThreshold?.value) || 0));

    if (this.previewTitle) {
      this.previewTitle.textContent = titleVal;
      this.previewTitle.title = titleVal;
    }

    if (this.previewBadgeType) {
      this.previewBadgeType.textContent = 'Estándar';
    }

    if (this.previewBadgePrice) {
      this.previewBadgePrice.textContent = formatCurrency(priceVal, 'MXN');
    }

    if (this.previewBadgeStatus) {
      const isActive = statusVal === 'active';
      this.previewBadgeStatus.textContent = isActive ? 'Activo' : 'Borrador';
      this.previewBadgeStatus.classList.toggle('giveaway-card__timer-badge--active', isActive);
      this.previewBadgeStatus.classList.toggle('giveaway-card__timer-badge--draft', !isActive);
    }

    if (this.previewImg) {
      if (imageVal) {
        if (this.previewImg.src !== imageVal) {
          this.previewImg.src = imageVal;
        }
        this.previewImg.classList.remove('is-hidden');
        if (this.previewImgFallback) this.previewImgFallback.classList.add('is-hidden');
      } else {
        this.previewImg.classList.add('is-hidden');
        if (this.previewImgFallback) this.previewImgFallback.classList.remove('is-hidden');
      }
    }

    if (this.previewTickets) {
      this.previewTickets.textContent = `0 / ${formatNumber(totalVal)} boletos (0%)`;
    }

    if (this.statPrizeAmount) {
      this.statPrizeAmount.textContent = prizeAmountVal > 0 ? formatCurrency(prizeAmountVal, 'MXN') : 'Por definir';
    }

    if (this.statRevenue) {
      const revenue = priceVal * totalVal;
      this.statRevenue.textContent = formatCurrency(revenue, 'MXN');
    }

    if (this.statThreshold) {
      if (minThresholdVal > 0) {
        const thresholdTickets = Math.ceil((totalVal * minThresholdVal) / 100);
        this.statThreshold.textContent = `${formatNumber(thresholdTickets)} boletos (${minThresholdVal}%)`;
      } else {
        this.statThreshold.textContent = 'Inmediato (0%)';
      }
    }

    if (this.statDuration && this.inputStartDate?.value && this.inputEndDate?.value) {
      const startMs = new Date(this.inputStartDate.value).getTime();
      const endMs = new Date(this.inputEndDate.value).getTime();
      const diffMs = endMs - startMs;
      if (diffMs > 0) {
        const hours = Math.round(diffMs / (1000 * 3600));
        const days = Math.floor(hours / 24);
        const remHours = hours % 24;
        if (days > 0) {
          this.statDuration.textContent = remHours > 0 ? `${days}d ${remHours}h` : `${days} días`;
        } else {
          this.statDuration.textContent = `${hours} horas`;
        }
      } else {
        this.statDuration.textContent = 'Inválida';
      }
    }
  }

  private async loadBankAccounts(): Promise<void> {
    if (!this.banksContainer) return;
    const res = await getApi<BankAccountItem[]>('/api/giveaways/bank-accounts');
    if (!res.success || !res.data || res.data.length === 0) {
      this.banksContainer.innerHTML = `
        <div class="giveaway-create__empty-banks">
          No hay cuentas bancarias activas registradas en la plataforma.
        </div>
      `;
      return;
    }

    this.banksContainer.innerHTML = res.data
      .map(
        (b) => `
        <label class="giveaway-create__bank-item">
          <input class="giveaway-create__bank-checkbox" name="bank_account" type="checkbox" value="${b.id}" checked />
          <div class="giveaway-create__bank-info">
            <span class="giveaway-create__bank-name">${escapeHtml(b.bank_name)} • ${escapeHtml(b.account_holder)}</span>
            <span class="giveaway-create__bank-meta">${escapeHtml(b.account_type.toUpperCase())} ${b.clabe ? `• CLABE: ${escapeHtml(b.clabe)}` : ''} ${b.card_number ? `• Tarjeta: ${escapeHtml(b.card_number)}` : ''}</span>
          </div>
        </label>
      `
      )
      .join('');
  }

  private showError(msg: string): void {
    if (!this.bannerError) return;
    this.bannerError.textContent = msg;
    this.bannerError.classList.remove('is-hidden');
    this.bannerError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  private hideError(): void {
    if (!this.bannerError) return;
    this.bannerError.textContent = '';
    this.bannerError.classList.add('is-hidden');
  }

  private setButtonsLoading(loading: boolean): void {
    if (this.btnSubmit) {
      this.btnSubmit.disabled = loading;
      this.btnSubmit.style.opacity = loading ? '0.6' : '1';
    }
    if (this.btnHeaderSave) {
      this.btnHeaderSave.disabled = loading;
      this.btnHeaderSave.style.opacity = loading ? '0.6' : '1';
    }
  }

  private async handleSubmit(e?: Event): Promise<void> {
    if (e) e.preventDefault();
    if (this.isSubmitting) return;

    this.hideError();

    const title = this.inputTitle?.value.trim() || '';
    const price = Number(this.inputTicketPrice?.value);
    const totalTickets = Number(this.inputTotalTickets?.value);
    const prizeAmount = Number(this.inputPrizeAmount?.value || 0);
    const primaryImage = this.inputImageUrl?.value.trim() || '';
    const startDate = this.inputStartDate?.value;
    const endDate = this.inputEndDate?.value;

    if (!title) {
      this.showError('Por favor ingresa el título del sorteo.');
      this.inputTitle?.focus();
      return;
    }

    if (isNaN(price) || price <= 0) {
      this.showError('El precio por boleto debe ser un valor numérico mayor a 0 MXN.');
      this.inputTicketPrice?.focus();
      return;
    }

    if (isNaN(totalTickets) || totalTickets < 10) {
      this.showError('La emisión total debe ser de al menos 10 boletos.');
      this.inputTotalTickets?.focus();
      return;
    }

    if (!startDate || !endDate) {
      this.showError('Por favor especifica tanto la fecha de inicio como la fecha de cierre.');
      return;
    }

    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    if (endMs <= startMs) {
      this.showError('La fecha de cierre debe ser posterior a la fecha de inicio.');
      this.inputEndDate?.focus();
      return;
    }

    if (!primaryImage) {
      this.showError('Por favor sube o selecciona la imagen de portada del sorteo.');
      this.coverDropzone?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const selectedBanks: number[] = [];
    this.container.querySelectorAll<HTMLInputElement>('input[name="bank_account"]:checked').forEach((cb) => {
      selectedBanks.push(Number(cb.value));
    });

    const rawPackages = this.inputPackageOptions?.value || '';
    const parsedPackages = rawPackages
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0);

    const allImages = [primaryImage, ...this.secondaryImages];

    const payload = {
      bank_account_ids: selectedBanks,
      countdown_hours: Number(this.inputCountdownHours?.value || 72),
      description: this.textareaDesc?.value.trim() || undefined,
      end_date: new Date(endDate).toISOString(),
      image_urls: allImages,
      min_threshold_pct: Number(this.inputMinThreshold?.value || 0),
      package_options: parsedPackages.length > 0 ? parsedPackages : [1, 5, 10, 20],
      primary_image_url: primaryImage,
      prize_amount: !isNaN(prizeAmount) && prizeAmount > 0 ? prizeAmount : null,
      slug: this.inputSlug?.value.trim() || undefined,
      start_date: new Date(startDate).toISOString(),
      status: this.selectedStatus,
      ticket_price: price,
      title,
      total_tickets: totalTickets,
      type: 'standard',
    };

    this.isSubmitting = true;
    this.setButtonsLoading(true);

    const res = await postApi('/api/giveaways', payload);
    this.isSubmitting = false;
    this.setButtonsLoading(false);

    if (!res.success) {
      this.showError(res.error || 'Error al crear el sorteo en el servidor.');
      return;
    }

    showToast('Sorteo creado exitosamente.', 'success');
    navigate('/giveaways');
  }

  destroy(): void {
    this.statusDropdownController?.destroy();
    this.statusDropdownController = null;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createGiveawayCreateView(ctx?: RouteContext): Promise<HTMLElement> {
  const container = await loadTemplate('/views/giveaways/giveaway-create.html');
  const controller = new GiveawayCreateController(container, ctx);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
