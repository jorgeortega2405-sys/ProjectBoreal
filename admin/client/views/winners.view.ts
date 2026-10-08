import { openModal } from '../components/modal.component.js';
import { getApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml } from '../utils/dom.util.js';

interface WinnerItem {
  contact_notes: string | null;
  delivered_at: string | null;
  delivery_status: 'pending_contact' | 'contacted' | 'claimed' | 'delivered';
  evidence_image_url: string | null;
  giveaway_id: number;
  giveaway_primary_image_url: string;
  giveaway_title: string;
  giveaway_type: 'standard' | 'daily';
  giveaway_uuid: string;
  prize_amount: number | null;
  spei_receipt_url: string | null;
  testimonial: string | null;
  ticket_price: number;
  winner_announced_at: string;
  winner_name: string;
  winner_order_id: number | null;
  winner_order_uuid: string | null;
  winner_phone: string | null;
  winner_state: string | null;
  winner_ticket_number: number;
}

interface WinnersKpis {
  deliveredCount: number;
  pendingDeliveryCount: number;
  totalPrizesDistributedAmount: number;
  totalWinnersCount: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(amount) + ' MXN';
}

function formatPhone(phone: string | null): string {
  if (!phone) return '•••• ----';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return phone;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'N/A';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export class WinnersController implements ViewController {
  private abortController: AbortController | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnRefresh: HTMLButtonElement | null = null;
  private btnResetSearch: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private winners: WinnerItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-winners"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    this.btnRefresh = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-winners"]');
    this.btnResetSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-reset-search"]');

    this.bindEvents();
    renderIcons(this.container);

    requestAnimationFrame(() => {
      void this.loadInitialData();
    });
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

    this.btnRefresh?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        const icon = this.btnRefresh?.querySelector('[data-ref="icon-refresh"]');
        icon?.classList.add('admin-refresh-spin');
        void this.loadWinners().finally(() => {
          setTimeout(() => {
            icon?.classList.remove('admin-refresh-spin');
          }, 600);
        });
        void this.loadKpis();
      },
      { signal }
    );

    this.btnToggleSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (!this.searchToolbar) return;
        this.isSearchActive = !this.isSearchActive;
        if (this.isSearchActive) {
          this.searchToolbar.classList.remove('is-hidden');
          this.inputSearch?.focus();
        } else {
          this.searchToolbar.classList.add('is-hidden');
          if (this.inputSearch) this.inputSearch.value = '';
          if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';
          if (this.searchQuery) {
            this.searchQuery = '';
            void this.loadWinners();
          }
        }
      },
      { signal }
    );

    this.inputSearch?.addEventListener(
      'input',
      () => {
        const val = (this.inputSearch?.value || '').trim();
        if (this.btnClearSearch) {
          this.btnClearSearch.style.display = val.length > 0 ? 'inline-flex' : 'none';
        }
        if (this.searchDebounceTimer) {
          clearTimeout(this.searchDebounceTimer);
        }
        this.searchDebounceTimer = setTimeout(() => {
          this.searchQuery = val;
          void this.loadWinners();
        }, 300);
      },
      { signal }
    );

    this.btnClearSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.inputSearch) this.inputSearch.value = '';
        if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';
        this.searchQuery = '';
        void this.loadWinners();
        this.inputSearch?.focus();
      },
      { signal }
    );

    this.btnResetSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.inputSearch) this.inputSearch.value = '';
        if (this.btnClearSearch) this.btnClearSearch.style.display = 'none';
        this.searchQuery = '';
        void this.loadWinners();
      },
      { signal }
    );
  }

  private async loadInitialData(): Promise<void> {
    await Promise.all([this.loadKpis(), this.loadWinners()]);
  }

  private async loadKpis(): Promise<void> {
    try {
      const res = await getApi<WinnersKpis>('/api/winners/kpis');
      if (res.success && res.data) {
        const kpi = res.data;
        const elTotal = this.container.querySelector('[data-ref="kpi-total-winners"]');
        const elPrizes = this.container.querySelector('[data-ref="kpi-prizes-amount"]');
        const elDelivered = this.container.querySelector('[data-ref="kpi-delivered-count"]');
        const elPending = this.container.querySelector('[data-ref="kpi-pending-delivery-count"]');

        if (elTotal) elTotal.textContent = String(kpi.totalWinnersCount);
        if (elPrizes) elPrizes.textContent = formatCurrency(kpi.totalPrizesDistributedAmount);
        if (elDelivered) elDelivered.textContent = String(kpi.deliveredCount);
        if (elPending) elPending.textContent = String(kpi.pendingDeliveryCount);
      }
    } catch (_) {}
  }

  private async loadWinners(): Promise<void> {
    try {
      const queryParams = new URLSearchParams();
      if (this.searchQuery) {
        queryParams.set('search', this.searchQuery);
      }
      const res = await getApi<WinnerItem[]>(`/api/winners?${queryParams.toString()}`);
      if (res.success && Array.isArray(res.data)) {
        this.winners = res.data;
        this.renderWinners();
      } else {
        showToast(res.error || 'No se pudieron cargar los ganadores.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar ganadores.', 'danger');
    }
  }

  private renderWinners(): void {
    const gridContainer = this.container.querySelector<HTMLElement>('[data-ref="winners-grid-container"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="winners-empty-state"]');

    if (!gridContainer) return;

    if (this.winners.length === 0) {
      gridContainer.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    gridContainer.innerHTML = this.winners.map((w) => this.buildWinnerCardHtml(w)).join('');
    renderIcons(gridContainer);
    this.attachCardEvents(gridContainer);
  }

  private buildWinnerCardHtml(w: WinnerItem): string {
    const isDelivered = w.delivery_status === 'delivered';
    const isContacted = w.delivery_status === 'contacted';
    const isClaimed = w.delivery_status === 'claimed';

    let statusLabel = 'Pendiente Contacto';
    let statusColor = '#f59e0b';

    if (isDelivered) {
      statusLabel = 'Premio Entregado';
      statusColor = '#10b981';
    } else if (isClaimed) {
      statusLabel = 'Reclamado / En Envío';
      statusColor = '#3b82f6';
    } else if (isContacted) {
      statusLabel = 'Ganador Contactado';
      statusColor = '#8b5cf6';
    }

    const prizeText = w.prize_amount !== null ? formatCurrency(w.prize_amount) : 'Premio en Especie';

    return `
      <div class="winner-card" data-ref="card-winner-${w.giveaway_uuid}" data-uuid="${w.giveaway_uuid}">
        <div class="winner-card__banner">
          <div class="winner-card__giveaway-info">
            <img src="${escapeHtml(w.giveaway_primary_image_url || '/images/giveaways/daily/daily-cash-1000-main.jpg')}" alt="Sorteo" class="winner-card__thumb" onerror="this.src='/images/giveaways/daily/daily-cash-1000-main.jpg';" />
            <div class="winner-card__title-box">
              <h3 class="winner-card__giveaway-title">${escapeHtml(w.giveaway_title)}</h3>
              <span style="font-size: 11.5px; color: var(--text-secondary);">${w.giveaway_type === 'daily' ? 'Sorteo Diario' : 'Sorteo Estándar'} • ${formatDate(w.winner_announced_at)}</span>
            </div>
          </div>
          <span class="giveaway-badge" style="background: ${statusColor}15; color: ${statusColor}; border: 1px solid ${statusColor}40;">${statusLabel}</span>
        </div>

        <div class="winner-card__body">
          <div class="winner-card__hero-box">
            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase;">Boleto Ganador</span>
              <div class="winner-card__ticket-badge">#${String(w.winner_ticket_number).padStart(3, '0')}</div>
            </div>
            <div>
              <span style="font-size: 11px; color: var(--text-tertiary); font-weight: 600; text-transform: uppercase; display: block; text-align: right;">Bolsa / Premio</span>
              <div class="winner-card__prize-amount">${prizeText}</div>
            </div>
          </div>

          <div class="winner-card__contact-row">
            <span><strong>Ganador:</strong> ${escapeHtml(w.winner_name)}</span>
            <span>${w.winner_state ? `• ${escapeHtml(w.winner_state)}` : ''}</span>
          </div>

          <div class="winner-card__contact-row">
            <span><strong>Teléfono:</strong> ${formatPhone(w.winner_phone)}</span>
            ${w.winner_order_uuid ? `<span style="font-family: var(--sl-font-mono, monospace); font-size: 11.5px;">ORD-${w.winner_order_uuid.slice(0, 8).toUpperCase()}</span>` : ''}
          </div>
        </div>

        <div class="winner-card__footer">
          <button type="button" class="component-button component-button--black component-button--h34" data-ref="btn-manage-delivery-${w.giveaway_uuid}" data-uuid="${w.giveaway_uuid}">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
            <span>Gestionar Entrega</span>
          </button>

          ${
            w.winner_phone
              ? `
                <a href="https://wa.me/52${w.winner_phone.replace(/\D/g, '')}" target="_blank" rel="noopener noreferrer" class="component-button component-button--secondary component-button--h34" style="color: #22c55e;">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#call"></use></svg>
                  <span>Llamar / WhatsApp</span>
                </a>
              `
              : ''
          }
        </div>
      </div>
    `;
  }

  private attachCardEvents(container: HTMLElement): void {
    const manageBtns = container.querySelectorAll<HTMLButtonElement>('[data-ref^="btn-manage-delivery-"]');
    manageBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const uuid = btn.getAttribute('data-uuid');
        const winner = this.winners.find((w) => w.giveaway_uuid === uuid);
        if (winner) this.openManageDeliveryModal(winner);
      });
    });
  }

  private openManageDeliveryModal(winner: WinnerItem): void {
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'winner-delivery-modal';

    bodyContainer.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px; width: 100%; box-sizing: border-box;">
        <div style="padding: 12px 14px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 12px; font-size: 13px;">
          <strong>Ganador:</strong> ${escapeHtml(winner.winner_name)} • <strong>Boleto #${String(winner.winner_ticket_number).padStart(3, '0')}</strong><br/>
          <strong>Teléfono:</strong> ${formatPhone(winner.winner_phone)} • <strong>Sorteo:</strong> ${escapeHtml(winner.giveaway_title)}
        </div>

        <label class="field" data-ref="field-delivery-status">
          <select class="field__input" data-ref="select-delivery-status">
            <option value="pending_contact" ${winner.delivery_status === 'pending_contact' ? 'selected' : ''}>Pendiente de Contacto</option>
            <option value="contacted" ${winner.delivery_status === 'contacted' ? 'selected' : ''}>Ganador Contactado por Teléfono / WhatsApp</option>
            <option value="claimed" ${winner.delivery_status === 'claimed' ? 'selected' : ''}>Identificación Verificada / Reclamado</option>
            <option value="delivered" ${winner.delivery_status === 'delivered' ? 'selected' : ''}>Premio Liquidado / Entregado con Éxito</option>
          </select>
          <span class="field__label">Estado de Entrega del Premio</span>
        </label>

        <label class="field" data-ref="field-contact-notes">
          <textarea class="field__input" data-ref="input-contact-notes" placeholder=" " rows="3" style="resize: vertical; min-height: 70px;">${escapeHtml(winner.contact_notes || '')}</textarea>
          <span class="field__label">Bitácora de Contacto y Notas de la Llamada</span>
        </label>

        <label class="field" data-ref="field-evidence-url">
          <input class="field__input" data-ref="input-evidence-url" type="text" placeholder=" " value="${escapeHtml(winner.evidence_image_url || '')}" />
          <span class="field__label">URL de Fotografía de Entrega / Comprobante SPEI</span>
        </label>

        <label class="field" data-ref="field-testimonial">
          <textarea class="field__input" data-ref="input-testimonial" placeholder=" " rows="2" style="resize: vertical;">${escapeHtml(winner.testimonial || '')}</textarea>
          <span class="field__label">Testimonio o Mensaje del Ganador</span>
        </label>
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Guardar Bitácora',
      description: `Sorteo: ${winner.giveaway_title}`,
      onConfirm: async () => {
        const selectStatus = bodyContainer.querySelector<HTMLSelectElement>('[data-ref="select-delivery-status"]');
        const inputNotes = bodyContainer.querySelector<HTMLTextAreaElement>('[data-ref="input-contact-notes"]');
        const inputEvidence = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-evidence-url"]');
        const inputTestimonial = bodyContainer.querySelector<HTMLTextAreaElement>('[data-ref="input-testimonial"]');

        const status = (selectStatus?.value || 'pending_contact') as 'pending_contact' | 'contacted' | 'claimed' | 'delivered';
        const notes = (inputNotes?.value || '').trim();
        const evidence = (inputEvidence?.value || '').trim();
        const testimonial = (inputTestimonial?.value || '').trim();

        const res = await putApi<WinnerItem>(`/api/winners/${winner.giveaway_uuid}/delivery`, {
          contact_notes: notes || null,
          delivery_status: status,
          evidence_image_url: evidence || null,
          testimonial: testimonial || null,
        });

        if (res.success) {
          showToast('Bitácora y estado de entrega guardados exitosamente.', 'success');
          void this.loadWinners();
          void this.loadKpis();
          return true;
        } else {
          showToast(res.error || 'Error al guardar entrega.', 'danger');
          return false;
        }
      },
      size: 'md',
      title: 'Gestión y Entrega de Premio',
    });
  }

  destroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createWinnersView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/winners/winners.html');
  const controller = new WinnersController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
