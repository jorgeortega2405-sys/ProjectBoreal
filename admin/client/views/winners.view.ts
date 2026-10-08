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
  private btnActionCopyPhone: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionInspectEvidence: HTMLButtonElement | null = null;
  private btnActionManageDelivery: HTMLButtonElement | null = null;
  private btnActionWhatsapp: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnPaginationNext: HTMLButtonElement | null = null;
  private btnPaginationPrev: HTMLButtonElement | null = null;
  private btnRefresh: HTMLButtonElement | null = null;
  private btnResetSearch: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private currentPage = 1;
  private defaultActions: HTMLElement | null = null;
  private inputPaginationPage: HTMLInputElement | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private pageSize = 10;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedWinner: WinnerItem | null = null;
  private totalPages = 1;
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
    this.btnPaginationPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-prev"]');
    this.btnPaginationNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-next"]');
    this.inputPaginationPage = this.container.querySelector<HTMLInputElement>('[data-ref="input-pagination-page"]');

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="winners-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="winners-selected-actions"]');
    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionManageDelivery = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-manage-delivery"]');
    this.btnActionInspectEvidence = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-inspect-evidence"]');
    this.btnActionWhatsapp = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-whatsapp"]');
    this.btnActionCopyPhone = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-phone"]');

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
            this.currentPage = 1;
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
          this.currentPage = 1;
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
        this.currentPage = 1;
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
        this.selectedWinner = null;
        this.currentPage = 1;
        this.updateSelectionUi();
        void this.loadWinners();
      },
      { signal }
    );

    this.inputPaginationPage?.addEventListener(
      'change',
      () => {
        let page = parseInt(this.inputPaginationPage?.value || '1', 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > this.totalPages) page = this.totalPages;
        if (page !== this.currentPage) {
          this.currentPage = page;
          this.renderWinners();
        } else if (this.inputPaginationPage) {
          this.inputPaginationPage.value = String(this.currentPage);
        }
      },
      { signal }
    );

    this.inputPaginationPage?.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.inputPaginationPage?.blur();
        }
      },
      { signal }
    );

    this.btnPaginationPrev?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderWinners();
        }
      },
      { signal }
    );

    this.btnPaginationNext?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          this.renderWinners();
        }
      },
      { signal }
    );

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedWinner = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionManageDelivery?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedWinner) {
          this.openManageDeliveryModal(this.selectedWinner);
        }
      },
      { signal }
    );

    this.btnActionInspectEvidence?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedWinner) {
          this.openInspectEvidenceModal(this.selectedWinner);
        }
      },
      { signal }
    );

    this.btnActionWhatsapp?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedWinner?.winner_phone) {
          const rawPhone = this.selectedWinner.winner_phone.replace(/\D/g, '');
          window.open(`https://wa.me/52${rawPhone}`, '_blank', 'noopener,noreferrer');
        }
      },
      { signal }
    );

    this.btnActionCopyPhone?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedWinner?.winner_phone) {
          void navigator.clipboard.writeText(this.selectedWinner.winner_phone);
          showToast('Teléfono copiado al portapapeles.', 'success');
        }
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && this.selectedWinner) {
          this.selectedWinner = null;
          this.updateSelectionUi();
        }
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
        if (this.selectedWinner) {
          const fresh = this.winners.find((w) => w.giveaway_uuid === this.selectedWinner?.giveaway_uuid);
          this.selectedWinner = fresh || null;
        }
        this.renderWinners();
        this.updateSelectionUi();
      } else {
        showToast(res.error || 'No se pudieron cargar los ganadores.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar ganadores.', 'danger');
    }
  }

  private toggleWinnerSelection(winner: WinnerItem): void {
    if (this.selectedWinner?.giveaway_uuid === winner.giveaway_uuid) {
      this.selectedWinner = null;
    } else {
      this.selectedWinner = winner;
    }
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedWinner !== null;
    if (this.defaultActions) this.defaultActions.style.display = isSelected ? 'none' : 'flex';
    if (this.selectedActions) this.selectedActions.style.display = isSelected ? 'flex' : 'none';

    const rows = this.container.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const isThisSelected = row.getAttribute('data-uuid') === this.selectedWinner?.giveaway_uuid;
      row.classList.toggle('is-selected', isThisSelected);
    });
  }

  private updatePaginationUi(): void {
    const totalCount = this.winners.length;
    this.totalPages = Math.max(1, Math.ceil(totalCount / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    if (this.inputPaginationPage) {
      this.inputPaginationPage.value = String(this.currentPage);
      this.inputPaginationPage.min = '1';
      this.inputPaginationPage.max = String(Math.max(1, this.totalPages));
      this.inputPaginationPage.disabled = this.totalPages <= 1;
    }

    if (this.btnPaginationPrev) {
      this.btnPaginationPrev.disabled = this.currentPage <= 1;
    }
    if (this.btnPaginationNext) {
      this.btnPaginationNext.disabled = this.currentPage >= this.totalPages;
    }
  }

  private renderWinners(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tbody-winners"]');
    const tableCard = this.container.querySelector<HTMLElement>('[data-ref="winners-table-card"]');
    const emptyState = this.container.querySelector<HTMLElement>('[data-ref="winners-empty-state"]');

    if (!tbody) return;

    if (this.winners.length === 0) {
      tbody.innerHTML = '';
      if (tableCard) tableCard.style.display = 'none';
      if (emptyState) emptyState.style.display = 'block';
      this.updatePaginationUi();
      return;
    }

    if (tableCard) tableCard.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    this.updatePaginationUi();
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageItems = this.winners.slice(startIndex, startIndex + this.pageSize);

    tbody.innerHTML = pageItems.map((w) => this.buildWinnerRowHtml(w)).join('');
    renderIcons(tbody);
    this.attachRowEvents(tbody);
  }

  private buildWinnerRowHtml(w: WinnerItem): string {
    const isDelivered = w.delivery_status === 'delivered';
    const isContacted = w.delivery_status === 'contacted';
    const isClaimed = w.delivery_status === 'claimed';
    const isSelected = this.selectedWinner?.giveaway_uuid === w.giveaway_uuid;

    let statusBadgeHtml = '<span class="component-badge component-badge--sm" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">Por Contactar</span>';

    if (isDelivered) {
      statusBadgeHtml = '<span class="component-badge component-badge--sm" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);">Entregado</span>';
    } else if (isClaimed) {
      statusBadgeHtml = '<span class="component-badge component-badge--sm" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.3);">Reclamado</span>';
    } else if (isContacted) {
      statusBadgeHtml = '<span class="component-badge component-badge--sm" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3);">Contactado</span>';
    }

    const prizeText = w.prize_amount !== null ? formatCurrency(w.prize_amount) : 'En Especie';

    return `
      <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-ref="tr-winner-${w.giveaway_uuid}" data-uuid="${w.giveaway_uuid}">
        <td class="winners-table__td">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-weight: 600; color: var(--text-primary); font-size: 13.5px;">${escapeHtml(w.giveaway_title)}</span>
            <span style="font-size: 11px; color: var(--text-secondary);">${w.giveaway_type === 'daily' ? 'Sorteo Diario' : 'Sorteo Estándar'}</span>
          </div>
        </td>
        <td class="winners-table__td">
          <span style="font-weight: 600; color: var(--text-primary);">${escapeHtml(w.winner_name)}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm" style="font-family: var(--sl-font-mono, monospace); font-weight: 900; color: #10b981; font-size: 13px;">
            #${String(w.winner_ticket_number).padStart(3, '0')}
          </span>
        </td>
        <td class="winners-table__td">
          <span style="font-weight: 700; color: var(--text-primary); font-size: 13px;">${prizeText}</span>
        </td>
        <td class="winners-table__td">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-family: var(--sl-font-mono, monospace); font-size: 12.5px; color: var(--text-secondary);">${formatPhone(w.winner_phone)}</span>
            ${w.winner_state ? `<span style="font-size: 11px; color: var(--text-tertiary);">${escapeHtml(w.winner_state)}</span>` : ''}
          </div>
        </td>
        <td class="winners-table__td">
          ${statusBadgeHtml}
        </td>
        <td class="winners-table__td">
          <span style="font-size: 12px; color: var(--text-secondary);">${formatDate(w.winner_announced_at)}</span>
        </td>
      </tr>
    `;
  }

  private attachRowEvents(tbody: HTMLElement): void {
    const rows = tbody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-uuid');
      if (!uuid) return;
      const winner = this.winners.find((w) => w.giveaway_uuid === uuid);
      if (!winner) return;

      row.addEventListener('click', () => {
        this.toggleWinnerSelection(winner);
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.openManageDeliveryModal(winner);
      });
    });
  }

  private openInspectEvidenceModal(winner: WinnerItem): void {
    const url = winner.evidence_image_url || winner.spei_receipt_url;
    if (!url) {
      showToast('No hay evidencia digital ni comprobante SPEI registrado.', 'info');
      return;
    }

    const modalBody = document.createElement('div');
    modalBody.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 14px; align-items: center; width: 100%;">
        <div style="width: 100%; max-height: 420px; overflow: hidden; border-radius: 12px; background: #000; display: flex; align-items: center; justify-content: center;">
          <img src="${escapeHtml(url)}" alt="Evidencia de entrega" style="max-width: 100%; max-height: 420px; object-fit: contain;" />
        </div>
        ${winner.testimonial ? `<p style="font-style: italic; font-size: 13px; color: var(--text-secondary); text-align: center; margin: 0;">"${escapeHtml(winner.testimonial)}"</p>` : ''}
      </div>
    `;

    openModal({
      bodyHtml: modalBody,
      cancelText: 'Cerrar',
      description: `Ganador: ${winner.winner_name} • ${winner.giveaway_title}`,
      size: 'md',
      title: 'Evidencia de Entrega de Premio',
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

