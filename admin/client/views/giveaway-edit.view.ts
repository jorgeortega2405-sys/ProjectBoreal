import { navigate } from '../app-router.js';
import { RouteContext } from '../config/routes.config.js';
import { getApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

interface AdminGiveawayDetail {
  available_tickets: number;
  bank_accounts: Array<{
    account_holder: string;
    account_type: string;
    bank_name: string;
    id: number;
  }>;
  countdown_hours: number;
  currency: string;
  description: string | null;
  draw_date: string | null;
  end_date: string;
  id: number;
  image_urls: string[];
  min_threshold_pct: number;
  package_options: number[];
  paid_tickets: number;
  primary_image_url: string;
  prize_amount: number | null;
  progress_pct: number;
  slug: string;
  start_date: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled';
  threshold_reached_at: string | null;
  ticket_price: number;
  title: string;
  total_tickets: number;
  type: 'standard' | 'daily';
  uuid: string;
}

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

export class GiveawayEditController implements ViewController {
  private abortController: AbortController | null = null;
  private bannerCompletedInfo: HTMLElement | null = null;
  private bannerError: HTMLElement | null = null;
  private bannerSalesWarning: HTMLElement | null = null;
  private banksContainer: HTMLElement | null = null;
  private btnBack: HTMLButtonElement | null = null;
  private btnCancel: HTMLButtonElement | null = null;
  private btnHeaderCancel: HTMLButtonElement | null = null;
  private btnHeaderSave: HTMLButtonElement | null = null;
  private btnSubmit: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private form: HTMLFormElement | null = null;
  private giveaway: AdminGiveawayDetail | null = null;
  private hasSales = false;
  private inputCountdownHours: HTMLInputElement | null = null;
  private inputEndDate: HTMLInputElement | null = null;
  private inputImageUrl: HTMLInputElement | null = null;
  private inputMinThreshold: HTMLInputElement | null = null;
  private inputPackageOptions: HTMLInputElement | null = null;
  private inputSlug: HTMLInputElement | null = null;
  private inputStartDate: HTMLInputElement | null = null;
  private inputTicketPrice: HTMLInputElement | null = null;
  private inputTitle: HTMLInputElement | null = null;
  private inputTotalTickets: HTMLInputElement | null = null;
  private inputTypeDisplay: HTMLInputElement | null = null;
  private isCompleted = false;
  private isSubmitting = false;
  private labelTicketPrice: HTMLElement | null = null;
  private labelTotalTickets: HTMLElement | null = null;
  private previewBadgePrice: HTMLElement | null = null;
  private previewBadgeStatus: HTMLElement | null = null;
  private previewBadgeType: HTMLElement | null = null;
  private previewImg: HTMLImageElement | null = null;
  private previewImgFallback: HTMLElement | null = null;
  private previewTickets: HTMLElement | null = null;
  private previewTitle: HTMLElement | null = null;
  private routeContext?: RouteContext;
  private statCurrentRevenue: HTMLElement | null = null;
  private statDuration: HTMLElement | null = null;
  private statPotentialRevenue: HTMLElement | null = null;
  private statThreshold: HTMLElement | null = null;
  private textPaidCount: HTMLElement | null = null;
  private textareaDesc: HTMLTextAreaElement | null = null;
  private uuid: string | null = null;
  private viewTitle: HTMLElement | null = null;

  constructor(container: HTMLElement, routeContext?: RouteContext) {
    this.container = container;
    this.routeContext = routeContext;
  }

  init(): void {
    this.abortController = new AbortController();

    this.uuid =
      this.routeContext?.params?.uuid ||
      this.extractUuidFromPath(window.location.pathname) ||
      this.routeContext?.query.get('uuid') ||
      null;

    if (!this.uuid) {
      showToast('Identificador de sorteo no válido.', 'danger');
      navigate('/giveaways');
      return;
    }

    this.form = this.container.querySelector<HTMLFormElement>('[data-ref="form-giveaway-edit"]');
    this.viewTitle = this.container.querySelector<HTMLElement>('[data-ref="edit-title"]');
    this.btnBack = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-back"]');
    this.btnHeaderCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-header-cancel"]');
    this.btnHeaderSave = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-header-save"]');
    this.btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-edit"]');
    this.btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-edit"]');
    this.bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');
    this.bannerSalesWarning = this.container.querySelector<HTMLElement>('[data-ref="banner-sales-warning"]');
    this.bannerCompletedInfo = this.container.querySelector<HTMLElement>('[data-ref="banner-completed-info"]');
    this.textPaidCount = this.container.querySelector<HTMLElement>('[data-ref="text-paid-count"]');
    this.banksContainer = this.container.querySelector<HTMLElement>('[data-ref="banks-container"]');

    this.inputTitle = this.container.querySelector<HTMLInputElement>('[data-ref="input-title"]');
    this.inputSlug = this.container.querySelector<HTMLInputElement>('[data-ref="input-slug"]');
    this.inputTypeDisplay = this.container.querySelector<HTMLInputElement>('[data-ref="input-type-display"]');
    this.textareaDesc = this.container.querySelector<HTMLTextAreaElement>('[data-ref="textarea-description"]');
    this.inputTicketPrice = this.container.querySelector<HTMLInputElement>('[data-ref="input-ticket-price"]');
    this.inputTotalTickets = this.container.querySelector<HTMLInputElement>('[data-ref="input-total-tickets"]');
    this.labelTicketPrice = this.container.querySelector<HTMLElement>('[data-ref="label-ticket-price"]');
    this.labelTotalTickets = this.container.querySelector<HTMLElement>('[data-ref="label-total-tickets"]');
    this.inputPackageOptions = this.container.querySelector<HTMLInputElement>('[data-ref="input-package-options"]');
    this.inputStartDate = this.container.querySelector<HTMLInputElement>('[data-ref="input-start-date"]');
    this.inputEndDate = this.container.querySelector<HTMLInputElement>('[data-ref="input-end-date"]');
    this.inputMinThreshold = this.container.querySelector<HTMLInputElement>('[data-ref="input-min-threshold"]');
    this.inputCountdownHours = this.container.querySelector<HTMLInputElement>('[data-ref="input-countdown-hours"]');
    this.inputImageUrl = this.container.querySelector<HTMLInputElement>('[data-ref="input-image-url"]');

    this.previewImg = this.container.querySelector<HTMLImageElement>('[data-ref="preview-img"]');
    this.previewImgFallback = this.container.querySelector<HTMLElement>('[data-ref="preview-img-fallback"]');
    this.previewBadgeType = this.container.querySelector<HTMLElement>('[data-ref="preview-badge-type"]');
    this.previewBadgePrice = this.container.querySelector<HTMLElement>('[data-ref="preview-badge-price"]');
    this.previewBadgeStatus = this.container.querySelector<HTMLElement>('[data-ref="preview-badge-status"]');
    this.previewTitle = this.container.querySelector<HTMLElement>('[data-ref="preview-title"]');
    this.previewTickets = this.container.querySelector<HTMLElement>('[data-ref="preview-tickets"]');
    this.statCurrentRevenue = this.container.querySelector<HTMLElement>('[data-ref="stat-current-revenue"]');
    this.statPotentialRevenue = this.container.querySelector<HTMLElement>('[data-ref="stat-potential-revenue"]');
    this.statThreshold = this.container.querySelector<HTMLElement>('[data-ref="stat-threshold-tickets"]');
    this.statDuration = this.container.querySelector<HTMLElement>('[data-ref="stat-duration-days"]');

    this.bindEvents();
    renderIcons(this.container);
    void this.loadData();
  }

  private extractUuidFromPath(pathname: string): string | null {
    const editMatch = pathname.match(/^\/(?:giveaways|sorteos)\/([a-zA-Z0-9_-]+)\/edit$/);
    if (editMatch) return editMatch[1];
    const altMatch = pathname.match(/^\/(?:giveaways|sorteos)\/edit\/([a-zA-Z0-9_-]+)$/);
    if (altMatch) return altMatch[1];
    return null;
  }

  private async loadData(): Promise<void> {
    if (!this.uuid) return;

    const [giveawayRes, banksRes] = await Promise.all([
      getApi<AdminGiveawayDetail>(`/api/giveaways/${this.uuid}`),
      getApi<BankAccountItem[]>('/api/giveaways/bank-accounts'),
    ]);

    if (!giveawayRes.success || !giveawayRes.data) {
      showToast(giveawayRes.error || 'No se pudo cargar la información del sorteo.', 'danger');
      navigate('/giveaways');
      return;
    }

    const g = giveawayRes.data;
    this.giveaway = g;
    this.hasSales = g.paid_tickets > 0;
    this.isCompleted = g.status === 'completed';

    if (this.viewTitle) {
      this.viewTitle.textContent = this.isCompleted ? `Detalle: ${g.title}` : `Editar: ${g.title}`;
    }

    if (this.inputTitle) this.inputTitle.value = g.title;
    if (this.inputSlug) this.inputSlug.value = g.slug;
    if (this.inputTypeDisplay) {
      this.inputTypeDisplay.value = g.type === 'daily' ? 'Sorteo Diario 50/50' : 'Sorteo Estándar';
    }
    if (this.textareaDesc) this.textareaDesc.value = g.description || '';
    if (this.inputTicketPrice) this.inputTicketPrice.value = String(g.ticket_price);
    if (this.inputTotalTickets) this.inputTotalTickets.value = String(g.total_tickets);
    if (this.inputPackageOptions) this.inputPackageOptions.value = g.package_options ? g.package_options.join(', ') : '';
    if (this.inputStartDate && g.start_date) this.inputStartDate.value = toLocalIso(new Date(g.start_date));
    if (this.inputEndDate && g.end_date) this.inputEndDate.value = toLocalIso(new Date(g.end_date));
    if (this.inputMinThreshold) this.inputMinThreshold.value = String(g.min_threshold_pct);
    if (this.inputCountdownHours) this.inputCountdownHours.value = String(g.countdown_hours);
    if (this.inputImageUrl) this.inputImageUrl.value = g.primary_image_url;

    if (this.hasSales && this.bannerSalesWarning) {
      this.bannerSalesWarning.classList.remove('is-hidden');
      if (this.textPaidCount) {
        this.textPaidCount.textContent = `${formatNumber(g.paid_tickets)} boletos vendidos`;
      }
      if (this.inputSlug) this.inputSlug.disabled = true;
      if (this.inputTicketPrice) this.inputTicketPrice.disabled = true;
      if (this.inputTotalTickets) this.inputTotalTickets.disabled = true;
      if (this.labelTicketPrice) this.labelTicketPrice.textContent = 'Precio por Boleto (MXN) (Bloqueado)';
      if (this.labelTotalTickets) this.labelTotalTickets.textContent = 'Total de Boletos (Bloqueado)';
    }

    if (this.isCompleted) {
      if (this.bannerCompletedInfo) this.bannerCompletedInfo.classList.remove('is-hidden');
      this.disableAllInputs();
      if (this.btnSubmit) {
        this.btnSubmit.style.display = 'none';
      }
      if (this.btnHeaderSave) {
        this.btnHeaderSave.style.display = 'none';
      }
    }

    const assignedBankIds = new Set(g.bank_accounts.map((b) => b.id));
    this.renderBankAccounts(banksRes.data || [], assignedBankIds);

    this.highlightActivePreset(g.primary_image_url);
    this.updateLivePreview();
  }

  private disableAllInputs(): void {
    if (this.inputTitle) this.inputTitle.disabled = true;
    if (this.inputSlug) this.inputSlug.disabled = true;
    if (this.textareaDesc) this.textareaDesc.disabled = true;
    if (this.inputTicketPrice) this.inputTicketPrice.disabled = true;
    if (this.inputTotalTickets) this.inputTotalTickets.disabled = true;
    if (this.inputPackageOptions) this.inputPackageOptions.disabled = true;
    if (this.inputStartDate) this.inputStartDate.disabled = true;
    if (this.inputEndDate) this.inputEndDate.disabled = true;
    if (this.inputMinThreshold) this.inputMinThreshold.disabled = true;
    if (this.inputCountdownHours) this.inputCountdownHours.disabled = true;
    if (this.inputImageUrl) this.inputImageUrl.disabled = true;
  }

  private renderBankAccounts(allBanks: BankAccountItem[], assignedIds: Set<number>): void {
    if (!this.banksContainer) return;
    if (allBanks.length === 0) {
      this.banksContainer.innerHTML = `
        <div class="giveaway-create__empty-banks">
          No hay cuentas bancarias activas registradas en la plataforma.
        </div>
      `;
      return;
    }

    this.banksContainer.innerHTML = allBanks
      .map(
        (b) => `
        <label class="giveaway-create__bank-item">
          <input class="giveaway-create__bank-checkbox" name="bank_account" type="checkbox" value="${b.id}" ${assignedIds.has(b.id) ? 'checked' : ''} ${this.isCompleted ? 'disabled' : ''} />
          <div class="giveaway-create__bank-info">
            <span class="giveaway-create__bank-name">${escapeHtml(b.bank_name)} • ${escapeHtml(b.account_holder)}</span>
            <span class="giveaway-create__bank-meta">${escapeHtml(b.account_type.toUpperCase())} ${b.clabe ? `• CLABE: ${escapeHtml(b.clabe)}` : ''} ${b.card_number ? `• Tarjeta: ${escapeHtml(b.card_number)}` : ''}</span>
          </div>
        </label>
      `
      )
      .join('');
  }

  private highlightActivePreset(url: string): void {
    const presetButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-preset-"]');
    presetButtons.forEach((btn) => {
      if (btn.getAttribute('data-url') === url) {
        btn.classList.add('is-active');
      } else {
        btn.classList.remove('is-active');
      }
    });
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
    this.inputTicketPrice?.addEventListener('input', handleInput, { signal });
    this.inputTotalTickets?.addEventListener('input', handleInput, { signal });
    this.inputStartDate?.addEventListener('change', handleInput, { signal });
    this.inputEndDate?.addEventListener('change', handleInput, { signal });
    this.inputMinThreshold?.addEventListener('input', handleInput, { signal });
    this.inputImageUrl?.addEventListener('input', () => {
      this.highlightActivePreset(this.inputImageUrl?.value.trim() || '');
      this.updateLivePreview();
    }, { signal });

    const presetButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-preset-"]');
    presetButtons.forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          if (this.isCompleted) return;
          const url = btn.getAttribute('data-url');
          if (!url || !this.inputImageUrl) return;
          this.inputImageUrl.value = url;
          presetButtons.forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          this.updateLivePreview();
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
    const titleVal = this.inputTitle?.value.trim() || (this.giveaway ? this.giveaway.title : 'Título del Sorteo');
    const typeVal = this.giveaway ? this.giveaway.type : 'standard';
    const priceVal = Math.max(0, Number(this.inputTicketPrice?.value) || (this.giveaway ? this.giveaway.ticket_price : 0));
    const totalVal = Math.max(1, Number(this.inputTotalTickets?.value) || (this.giveaway ? this.giveaway.total_tickets : 1000));
    const paidVal = this.giveaway ? this.giveaway.paid_tickets : 0;
    const progressPct = totalVal > 0 ? Math.min(100, Math.round((paidVal / totalVal) * 100)) : 0;
    const imageVal = this.inputImageUrl?.value.trim() || (this.giveaway ? this.giveaway.primary_image_url : '/images/giveaways/standard/cash-cartoon-3d/cash-cartoon-3d-main.svg');
    const minThresholdVal = Math.min(100, Math.max(0, Number(this.inputMinThreshold?.value) || 0));

    if (this.previewTitle) {
      this.previewTitle.textContent = titleVal;
      this.previewTitle.title = titleVal;
    }

    if (this.previewBadgeType) {
      this.previewBadgeType.textContent = typeVal === 'daily' ? 'Diario 50/50' : 'Estándar';
    }

    if (this.previewBadgePrice) {
      this.previewBadgePrice.textContent = formatCurrency(priceVal, this.giveaway?.currency || 'MXN');
    }

    if (this.previewBadgeStatus && this.giveaway) {
      const isPaused = this.giveaway.status === 'paused';
      const isDraft = this.giveaway.status === 'draft';
      const isCompleted = this.giveaway.status === 'completed';
      const isCancelled = this.giveaway.status === 'cancelled';
      const isActive = !isPaused && !isDraft && !isCompleted && !isCancelled;

      this.previewBadgeStatus.classList.remove(
        'giveaway-card__timer-badge--active',
        'giveaway-card__timer-badge--paused',
        'giveaway-card__timer-badge--draft',
        'giveaway-card__timer-badge--completed',
        'giveaway-card__timer-badge--cancelled'
      );

      if (isPaused) {
        this.previewBadgeStatus.textContent = 'Pausado';
        this.previewBadgeStatus.classList.add('giveaway-card__timer-badge--paused');
      } else if (isDraft) {
        this.previewBadgeStatus.textContent = 'Borrador';
        this.previewBadgeStatus.classList.add('giveaway-card__timer-badge--draft');
      } else if (isCompleted) {
        this.previewBadgeStatus.textContent = 'Concluido';
        this.previewBadgeStatus.classList.add('giveaway-card__timer-badge--completed');
      } else if (isCancelled) {
        this.previewBadgeStatus.textContent = 'Cancelado';
        this.previewBadgeStatus.classList.add('giveaway-card__timer-badge--cancelled');
      } else {
        this.previewBadgeStatus.textContent = 'Activo';
        this.previewBadgeStatus.classList.add('giveaway-card__timer-badge--active');
      }
    }

    if (this.previewImg && this.previewImg.src !== imageVal) {
      this.previewImg.src = imageVal;
    }

    if (this.previewTickets) {
      this.previewTickets.textContent = `${formatNumber(paidVal)} / ${formatNumber(totalVal)} boletos (${progressPct}%)`;
    }

    if (this.statCurrentRevenue) {
      const currentRev = paidVal * priceVal;
      this.statCurrentRevenue.textContent = formatCurrency(currentRev, this.giveaway?.currency || 'MXN');
    }

    if (this.statPotentialRevenue) {
      const potential = totalVal * priceVal;
      this.statPotentialRevenue.textContent = formatCurrency(potential, this.giveaway?.currency || 'MXN');
    }

    if (this.statThreshold) {
      if (minThresholdVal > 0) {
        const thresholdTickets = Math.ceil((totalVal * minThresholdVal) / 100);
        this.statThreshold.textContent = `${formatNumber(thresholdTickets)} boletos (${minThresholdVal}%)`;
      } else {
        this.statThreshold.textContent = 'Inmediato (0%)';
      }
    }

    if (this.statDuration && this.inputEndDate?.value) {
      const nowMs = Date.now();
      const endMs = new Date(this.inputEndDate.value).getTime();
      const diffMs = endMs - nowMs;
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
        this.statDuration.textContent = 'Finalizado';
      }
    }
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
    if (this.isSubmitting || this.isCompleted || !this.uuid) return;

    this.hideError();

    const title = this.inputTitle?.value.trim() || '';
    const primaryImage = this.inputImageUrl?.value.trim() || '';
    const startDate = this.inputStartDate?.value;
    const endDate = this.inputEndDate?.value;

    if (!title) {
      this.showError('Por favor ingresa el título del sorteo.');
      this.inputTitle?.focus();
      return;
    }

    if (!endDate) {
      this.showError('Por favor especifica la fecha de cierre del sorteo.');
      this.inputEndDate?.focus();
      return;
    }

    if (startDate && endDate) {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      if (endMs <= startMs) {
        this.showError('La fecha de cierre debe ser posterior a la fecha de inicio.');
        this.inputEndDate?.focus();
        return;
      }
    }

    if (!primaryImage) {
      this.showError('Por favor define la URL de la imagen principal del sorteo.');
      this.inputImageUrl?.focus();
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

    const payload: any = {
      bank_account_ids: selectedBanks,
      countdown_hours: Number(this.inputCountdownHours?.value || 72),
      description: this.textareaDesc?.value.trim() || undefined,
      end_date: new Date(endDate).toISOString(),
      image_urls: [primaryImage],
      min_threshold_pct: Number(this.inputMinThreshold?.value || 0),
      package_options: parsedPackages.length > 0 ? parsedPackages : undefined,
      primary_image_url: primaryImage,
      start_date: startDate ? new Date(startDate).toISOString() : undefined,
      title,
    };

    if (!this.hasSales) {
      payload.slug = this.inputSlug?.value.trim() || undefined;
      const price = Number(this.inputTicketPrice?.value);
      const totalTickets = Number(this.inputTotalTickets?.value);
      if (isNaN(price) || price <= 0) {
        this.showError('El precio por boleto debe ser mayor a 0 MXN.');
        this.inputTicketPrice?.focus();
        return;
      }
      if (isNaN(totalTickets) || totalTickets < 10) {
        this.showError('La emisión total debe ser de al menos 10 boletos.');
        this.inputTotalTickets?.focus();
        return;
      }
      payload.ticket_price = price;
      payload.total_tickets = totalTickets;
    }

    this.isSubmitting = true;
    this.setButtonsLoading(true);

    const res = await putApi(`/api/giveaways/${this.uuid}`, payload);
    this.isSubmitting = false;
    this.setButtonsLoading(false);

    if (!res.success) {
      this.showError(res.error || 'Error al actualizar el sorteo.');
      return;
    }

    showToast('Sorteo actualizado correctamente.', 'success');
    navigate('/giveaways');
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createGiveawayEditView(ctx?: RouteContext): Promise<HTMLElement> {
  const container = await loadTemplate('/views/giveaways/giveaway-edit.html');
  const controller = new GiveawayEditController(container, ctx);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
