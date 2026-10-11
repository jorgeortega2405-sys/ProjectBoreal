import { openModal } from '../components/modal.component.js';
import { getApi, postApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { escapeHtml, removeEmptyState, renderEmptyState } from '../utils/dom.util.js';
import { hasPermission } from '../utils/permission.util.js';

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

  async init(): Promise<void> {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-winners"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
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

    await this.loadInitialData();
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

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
          if (this.btnClearSearch) this.btnClearSearch.classList.add('is-hidden');
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
          this.btnClearSearch.classList.toggle('is-hidden', val.length === 0);
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
        if (this.btnClearSearch) this.btnClearSearch.classList.add('is-hidden');
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
        this.resetSearch();
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
    await this.loadWinners();
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
      } else {
        showToast(res.error || 'No se pudieron cargar los ganadores.', 'danger');
      }
    } catch (_) {
      showToast('Error de conexión al cargar ganadores.', 'danger');
    }
    this.renderWinners();
    this.updateSelectionUi();
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
    if (this.defaultActions) this.defaultActions.classList.toggle('is-hidden', isSelected);
    if (this.selectedActions) this.selectedActions.classList.toggle('is-hidden', !isSelected);

    if (isSelected) {
      this.btnActionManageDelivery?.classList.toggle('is-hidden', !hasPermission('winners:manage'));
    }

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

  private resetSearch(): void {
    if (this.inputSearch) this.inputSearch.value = '';
    if (this.btnClearSearch) this.btnClearSearch.classList.add('is-hidden');
    this.searchQuery = '';
    this.selectedWinner = null;
    this.currentPage = 1;
    this.updateSelectionUi();
    void this.loadWinners();
  }

  private renderWinners(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tbody-winners"]');
    const tableCard = this.container.querySelector<HTMLElement>('[data-ref="winners-table-card"]');
    const wrapper = this.container.querySelector<HTMLElement>('[data-ref="winners-table-wrapper"]');
    if (!tbody || !tableCard || !wrapper) return;

    if (this.winners.length === 0) {
      const isFiltered = Boolean(this.searchQuery);
      tableCard.classList.add('is-hidden');
      tbody.innerHTML = '';
      renderEmptyState({
        actionDataRef: isFiltered ? 'btn-empty-reset-search' : undefined,
        actionLabel: isFiltered ? 'Restablecer Búsqueda' : undefined,
        container: wrapper,
        dataRef: 'winners-empty-state',
        desc: isFiltered
          ? 'No se encontraron registros que coincidan con la búsqueda.'
          : 'Aún no se han ejecutado sorteos concluidos ni asignado ganadores.',
        graphicType: isFiltered ? 'search' : 'winners',
        onAction: isFiltered
          ? (e) => {
              e.preventDefault();
              this.resetSearch();
            }
          : undefined,
        title: 'Sin ganadores registrados',
      });
      this.updatePaginationUi();
      return;
    }

    tableCard.classList.remove('is-hidden');
    removeEmptyState(wrapper, 'winners-empty-state');

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

    let statusText = 'Por Contactar';
    if (isDelivered) {
      statusText = 'Entregado';
    } else if (isClaimed) {
      statusText = 'Reclamado';
    } else if (isContacted) {
      statusText = 'Contactado';
    }

    const prizeText = w.prize_amount !== null ? formatCurrency(w.prize_amount) : 'En Especie';
    const locationText = w.winner_state ? ` • ${escapeHtml(w.winner_state)}` : '';

    return `
      <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-ref="tr-winner-${w.giveaway_uuid}" data-uuid="${w.giveaway_uuid}">
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${escapeHtml(w.giveaway_title)}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${escapeHtml(w.winner_name)}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm component-badge--mono-bold">#${String(w.winner_ticket_number).padStart(3, '0')}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm component-badge--semibold">${prizeText}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${formatPhone(w.winner_phone)}${locationText}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${statusText}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm">${formatDate(w.winner_announced_at)}</span>
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
    const evidenceUrl = winner.evidence_image_url;
    const speiUrl = winner.spei_receipt_url;
    if (!evidenceUrl && !speiUrl && !winner.testimonial) {
      showToast('No hay evidencia digital ni comprobante SPEI registrado.', 'info');
      return;
    }

    const renderPreviewBlock = (url: string, label: string, refPrefix: string): string => {
      const isPdf = url.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        return `
          <div class="winner-evidence-section" data-ref="${refPrefix}-section">
            <span class="winner-evidence-label">${escapeHtml(label)}</span>
            <a class="component-button component-button--h36 component-button--secondary" data-ref="${refPrefix}-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
              <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#description"></use></svg>
              <span>Abrir Documento PDF</span>
            </a>
          </div>
        `;
      }
      return `
        <div class="winner-evidence-section" data-ref="${refPrefix}-section">
          <span class="winner-evidence-label">${escapeHtml(label)}</span>
          <div class="winner-evidence-preview" data-ref="${refPrefix}-preview">
            <img class="winner-evidence-img" data-ref="${refPrefix}-img" src="${escapeHtml(url)}" alt="${escapeHtml(label)}" />
          </div>
        </div>
      `;
    };

    const modalBody = document.createElement('div');
    modalBody.className = 'winner-evidence-modal';
    modalBody.innerHTML = `
      ${evidenceUrl ? renderPreviewBlock(evidenceUrl, 'Evidencia Fotográfica de Entrega', 'evidence') : ''}
      ${speiUrl ? renderPreviewBlock(speiUrl, 'Comprobante de Transferencia SPEI', 'spei') : ''}
      ${winner.testimonial ? `<p class="winner-testimonial-quote" data-ref="winner-testimonial-quote">"${escapeHtml(winner.testimonial)}"</p>` : ''}
    `;
    renderIcons(modalBody);

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
      <div class="winner-delivery-form" data-ref="winner-delivery-form">
        <div class="winner-delivery-info" data-ref="winner-delivery-info">
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
          <textarea class="field__input winner-textarea--notes" data-ref="input-contact-notes" placeholder=" " rows="3">${escapeHtml(winner.contact_notes || '')}</textarea>
          <span class="field__label">Bitácora de Contacto y Notas de la Llamada</span>
        </label>

        <div class="winner-upload-group" data-ref="group-evidence-upload">
          <label class="field winner-upload-group__field" data-ref="field-evidence-url">
            <input class="field__input" data-ref="input-evidence-url" type="text" placeholder=" " value="${escapeHtml(winner.evidence_image_url || '')}" />
            <span class="field__label">Fotografía de Entrega de Premio (URL o Archivo)</span>
          </label>
          <input class="is-hidden" data-ref="file-evidence-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
          <button type="button" class="component-button component-button--h42 component-button--secondary winner-upload-group__btn" data-ref="btn-upload-evidence">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#upload"></use></svg>
            <span>Subir Evidencia</span>
          </button>
        </div>

        <div class="winner-upload-group" data-ref="group-spei-upload">
          <label class="field winner-upload-group__field" data-ref="field-spei-url">
            <input class="field__input" data-ref="input-spei-url" type="text" placeholder=" " value="${escapeHtml(winner.spei_receipt_url || '')}" />
            <span class="field__label">Comprobante SPEI / Liquidación (URL o Archivo)</span>
          </label>
          <input class="is-hidden" data-ref="file-spei-upload" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" />
          <button type="button" class="component-button component-button--h42 component-button--secondary winner-upload-group__btn" data-ref="btn-upload-spei">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#upload"></use></svg>
            <span>Subir SPEI</span>
          </button>
        </div>

        <label class="field" data-ref="field-testimonial">
          <textarea class="field__input winner-textarea--testimonial" data-ref="input-testimonial" placeholder=" " rows="2">${escapeHtml(winner.testimonial || '')}</textarea>
          <span class="field__label">Testimonio o Mensaje del Ganador</span>
        </label>
      </div>
    `;
    renderIcons(bodyContainer);

    const bindUploadTrigger = (
      btnRef: string,
      fileRef: string,
      inputRef: string,
      successLabel: string
    ): void => {
      const btn = bodyContainer.querySelector<HTMLButtonElement>(`[data-ref="${btnRef}"]`);
      const fileInput = bodyContainer.querySelector<HTMLInputElement>(`[data-ref="${fileRef}"]`);
      const urlInput = bodyContainer.querySelector<HTMLInputElement>(`[data-ref="${inputRef}"]`);
      if (!btn || !fileInput || !urlInput) return;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });

      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
          showToast('El archivo excede el límite máximo de 10 MB.', 'danger');
          fileInput.value = '';
          return;
        }

        btn.disabled = true;
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const fileData = typeof reader.result === 'string' ? reader.result : '';
            const res = await postApi<{ url: string }>('/api/winners/upload', {
              fileData,
              fileName: file.name,
            });
            if (res.success && res.data?.url) {
              urlInput.value = res.data.url;
              showToast(`${successLabel} subido exitosamente.`, 'success');
            } else {
              showToast(res.error || 'No se pudo subir el archivo.', 'danger');
            }
          } catch (_) {
            showToast('Error de red al subir el archivo.', 'danger');
          } finally {
            btn.disabled = false;
            fileInput.value = '';
          }
        };
        reader.onerror = () => {
          btn.disabled = false;
          fileInput.value = '';
          showToast('Error al leer el archivo seleccionado.', 'danger');
        };
        reader.readAsDataURL(file);
      });
    };

    bindUploadTrigger('btn-upload-evidence', 'file-evidence-upload', 'input-evidence-url', 'Archivo de evidencia');
    bindUploadTrigger('btn-upload-spei', 'file-spei-upload', 'input-spei-url', 'Comprobante SPEI');

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Guardar Bitácora',
      description: `Sorteo: ${winner.giveaway_title}`,
      onConfirm: async () => {
        const selectStatus = bodyContainer.querySelector<HTMLSelectElement>('[data-ref="select-delivery-status"]');
        const inputNotes = bodyContainer.querySelector<HTMLTextAreaElement>('[data-ref="input-contact-notes"]');
        const inputEvidence = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-evidence-url"]');
        const inputSpei = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-spei-url"]');
        const inputTestimonial = bodyContainer.querySelector<HTMLTextAreaElement>('[data-ref="input-testimonial"]');

        const status = (selectStatus?.value || 'pending_contact') as 'pending_contact' | 'contacted' | 'claimed' | 'delivered';
        const notes = (inputNotes?.value || '').trim();
        const evidence = (inputEvidence?.value || '').trim();
        const spei = (inputSpei?.value || '').trim();
        const testimonial = (inputTestimonial?.value || '').trim();

        const res = await putApi<WinnerItem>(`/api/winners/${winner.giveaway_uuid}/delivery`, {
          contact_notes: notes || null,
          delivery_status: status,
          evidence_image_url: evidence || null,
          spei_receipt_url: spei || null,
          testimonial: testimonial || null,
        });

        if (res.success) {
          showToast('Bitácora y estado de entrega guardados exitosamente.', 'success');
          void this.loadWinners();
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
  await controller.init();
  (container as any).__controller = controller;
  return container;
}

