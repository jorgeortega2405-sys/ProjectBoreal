import { AuditActorType, AuditLogRecord } from '../types/audit.types.js';
import { fetchAuditLogs } from '../services/audit.service.js';
import { loadTemplate } from '../services/template.service.js';
import { renderIcons } from '../services/icon.service.js';
import { ViewController } from '../types/common.types.js';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getActorBadge(actorType: AuditActorType): { bg: string; color: string; label: string } {
  switch (actorType) {
    case 'admin':
      return { bg: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', label: 'Admin' };
    case 'customer':
      return { bg: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', label: 'Cliente' };
    case 'system':
    default:
      return { bg: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', label: 'Sistema' };
  }
}

function getActionBadge(action: string): { bg: string; color: string; label: string } {
  if (action.includes('APPROVED') || action.includes('MATCHED') || action.includes('SUCCESS')) {
    return { bg: 'rgba(16, 185, 129, 0.15)', color: '#10b981', label: action };
  }
  if (action.includes('CANCEL') || action.includes('FAILED') || action.includes('EXPIRED')) {
    return { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: action };
  }
  if (action.includes('RECEIPT') || action.includes('REVIEW')) {
    return { bg: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', label: action };
  }
  return { bg: 'rgba(100, 116, 139, 0.15)', color: '#64748b', label: action };
}

class AuditViewController implements ViewController {
  private abortController: AbortController | null = null;
  private currentActor = 'all';
  private currentPage = 1;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private element: HTMLElement;
  private logs: AuditLogRecord[] = [];
  private searchTerm = '';
  private totalPages = 1;

  constructor(element: HTMLElement) {
    this.element = element;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    renderIcons(this.element);
    await this.loadLogs();
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const tabs = this.element.querySelectorAll<HTMLElement>('.orders-tab');
    tabs.forEach((tab) => {
      tab.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          tabs.forEach((t) => t.classList.remove('is-active'));
          tab.classList.add('is-active');
          this.currentActor = tab.getAttribute('data-actor') || 'all';
          this.currentPage = 1;
          this.loadLogs();
        },
        { signal }
      );
    });

    const searchInput = this.element.querySelector<HTMLInputElement>('[data-ref="audit-search-input"]');
    searchInput?.addEventListener(
      'input',
      () => {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.searchTerm = searchInput.value.trim();
          this.currentPage = 1;
          this.loadLogs();
        }, 300);
      },
      { signal }
    );

    const btnRefresh = this.element.querySelector<HTMLElement>('[data-ref="btn-refresh-audit"]');
    btnRefresh?.addEventListener(
      'click',
      () => {
        this.loadLogs();
      },
      { signal }
    );

    const btnPrev = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-audit-prev"]');
    btnPrev?.addEventListener(
      'click',
      () => {
        if (this.currentPage > 1) {
          this.currentPage--;
          this.loadLogs();
        }
      },
      { signal }
    );

    const btnNext = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-audit-next"]');
    btnNext?.addEventListener(
      'click',
      () => {
        if (this.currentPage < this.totalPages) {
          this.currentPage++;
          this.loadLogs();
        }
      },
      { signal }
    );

    const tableBody = this.element.querySelector<HTMLElement>('[data-ref="audit-table-body"]');
    tableBody?.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const btnInspect = target.closest<HTMLElement>('.btn-inspect-audit');
        if (btnInspect) {
          const uuid = btnInspect.getAttribute('data-uuid');
          const log = this.logs.find((l) => l.uuid === uuid);
          if (log) {
            this.openModal(log);
          }
        }
      },
      { signal }
    );

    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-audit-detail"]');
    const btnCloseModal = this.element.querySelector<HTMLElement>('[data-ref="btn-close-audit-modal"]');

    btnCloseModal?.addEventListener(
      'click',
      () => {
        this.closeModal();
      },
      { signal }
    );

    modal?.addEventListener(
      'click',
      (e) => {
        if (e.target === modal) {
          this.closeModal();
        }
      },
      { signal }
    );
  }

  private async loadLogs(): Promise<void> {
    const skeleton = this.element.querySelector<HTMLElement>('[data-ref="audit-skeleton"]');
    const tableWrapper = this.element.querySelector<HTMLElement>('[data-ref="audit-table-wrapper"]');
    const emptyState = this.element.querySelector<HTMLElement>('[data-ref="audit-empty"]');
    const pagination = this.element.querySelector<HTMLElement>('[data-ref="audit-pagination"]');
    const tableBody = this.element.querySelector<HTMLElement>('[data-ref="audit-table-body"]');

    if (skeleton) skeleton.style.display = 'flex';
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (emptyState) emptyState.style.display = 'none';
    if (pagination) pagination.style.display = 'none';

    try {
      const result = await fetchAuditLogs({
        actorType: this.currentActor,
        limit: 30,
        page: this.currentPage,
        search: this.searchTerm,
      });

      this.logs = result.logs;
      this.totalPages = result.totalPages;

      if (skeleton) skeleton.style.display = 'none';

      if (this.logs.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }

      if (tableBody) {
        tableBody.innerHTML = this.logs.map((l) => this.renderTableRow(l)).join('');
        renderIcons(tableBody);
      }

      if (tableWrapper) tableWrapper.style.display = 'block';
      if (pagination && this.totalPages > 1) {
        pagination.style.display = 'flex';
        const paginationInfo = this.element.querySelector<HTMLElement>('[data-ref="audit-pagination-info"]');
        const btnPrev = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-audit-prev"]');
        const btnNext = this.element.querySelector<HTMLButtonElement>('[data-ref="btn-audit-next"]');
        if (paginationInfo) paginationInfo.textContent = `Página ${result.page} de ${result.totalPages} (${result.total} eventos)`;
        if (btnPrev) btnPrev.disabled = result.page <= 1;
        if (btnNext) btnNext.disabled = result.page >= result.totalPages;
      }
    } catch {
      if (skeleton) skeleton.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
    }
  }

  private renderTableRow(log: AuditLogRecord): string {
    const actBadge = getActionBadge(log.action);
    const actorBadge = getActorBadge(log.actor_type);

    const transition = log.previous_status || log.new_status
      ? `${log.previous_status || 'null'} &rarr; ${log.new_status || 'null'}`
      : '-';

    return `
      <tr class="order-row" data-ref="audit-row-${log.uuid}">
        <td class="order-cell-date">
          <span class="order-ref-main">${new Date(log.created_at).toLocaleDateString()}</span>
          <span class="order-cell-sub">${new Date(log.created_at).toLocaleTimeString()}</span>
        </td>
        <td class="order-cell-action">
          <span class="order-badge" style="background-color: ${actBadge.bg}; color: ${actBadge.color}; font-size: 11px;">
            ${escapeHtml(actBadge.label)}
          </span>
        </td>
        <td class="order-cell-actor">
          <span class="order-badge" style="background-color: ${actorBadge.bg}; color: ${actorBadge.color}; font-size: 11px;">
            ${actorBadge.label}
          </span>
        </td>
        <td class="order-cell-order">
          ${log.order_uuid ? `
            <span class="order-cell-sub account-data-value--mono" title="${log.order_uuid}">${log.order_uuid.substring(0, 8)}...</span>
          ` : `
            <span class="order-cell-sub">-</span>
          `}
        </td>
        <td class="order-cell-customer">
          <span class="order-customer-name">${escapeHtml(log.customer_name || 'N/A')}</span>
          <span class="order-cell-sub">${escapeHtml(log.customer_phone || '')}</span>
        </td>
        <td class="order-cell-ip">
          <span class="order-cell-sub account-data-value--mono">${escapeHtml(log.ip_address || '127.0.0.1')}</span>
        </td>
        <td class="order-cell-status">
          <span class="order-cell-sub">${transition}</span>
        </td>
        <td class="order-cell-amount">
          ${log.amount !== null ? `
            <span class="order-amount-text">$${log.amount.toFixed(2)} ${escapeHtml(log.currency || '')}</span>
          ` : `
            <span class="order-cell-sub">-</span>
          `}
        </td>
        <td class="order-cell-actions">
          <button type="button" class="component-button component-button--h32 component-button--secondary btn-inspect-audit" data-ref="btn-inspect-${log.uuid}" data-uuid="${log.uuid}" data-tooltip="Inspeccionar detalles" aria-label="Inspeccionar detalles">
            <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#visibility"></use></svg>
            <span>Ver</span>
          </button>
        </td>
      </tr>
    `;
  }

  private openModal(log: AuditLogRecord): void {
    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-audit-detail"]');
    const uuidEl = this.element.querySelector<HTMLElement>('[data-ref="audit-modal-uuid"]');
    const badgeEl = this.element.querySelector<HTMLElement>('[data-ref="audit-modal-action-badge"]');
    const timeEl = this.element.querySelector<HTMLElement>('[data-ref="audit-detail-timestamp"]');
    const actorEl = this.element.querySelector<HTMLElement>('[data-ref="audit-detail-actor"]');
    const ipEl = this.element.querySelector<HTMLElement>('[data-ref="audit-detail-ip"]');
    const uaEl = this.element.querySelector<HTMLElement>('[data-ref="audit-detail-useragent"]');
    const orderEl = this.element.querySelector<HTMLElement>('[data-ref="audit-detail-order"]');
    const customerEl = this.element.querySelector<HTMLElement>('[data-ref="audit-detail-customer"]');
    const jsonViewer = this.element.querySelector<HTMLElement>('[data-ref="audit-json-viewer"]');

    if (uuidEl) uuidEl.textContent = `UUID: ${log.uuid}`;
    if (badgeEl) {
      const b = getActionBadge(log.action);
      badgeEl.textContent = b.label;
      badgeEl.style.backgroundColor = b.bg;
      badgeEl.style.color = b.color;
    }

    if (timeEl) timeEl.textContent = new Date(log.created_at).toLocaleString();
    if (actorEl) actorEl.textContent = log.actor_type.toUpperCase();
    if (ipEl) ipEl.textContent = log.ip_address || '127.0.0.1';
    if (uaEl) uaEl.textContent = log.user_agent || 'ProjectBoreal/System';
    if (orderEl) orderEl.textContent = log.order_uuid || log.order_id ? String(log.order_uuid || log.order_id) : 'Ninguna';
    if (customerEl) customerEl.textContent = `${log.customer_name || 'N/A'} ${log.customer_phone ? `(${log.customer_phone})` : ''}`;

    if (jsonViewer) {
      jsonViewer.textContent = JSON.stringify(log.details || {}, null, 2);
    }

    if (modal) {
      modal.style.display = 'flex';
      requestAnimationFrame(() => modal.classList.add('is-visible'));
    }
  }

  private closeModal(): void {
    const modal = this.element.querySelector<HTMLElement>('[data-ref="modal-audit-detail"]');
    if (modal) {
      modal.classList.remove('is-visible');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 200);
    }
  }
}

export async function createAuditView(): Promise<HTMLElement> {
  const element = await loadTemplate('/views/audit/audit.html');
  const controller = new AuditViewController(element);
  await controller.init();
  (element as any).__controller = controller;
  return element;
}
