import { deleteApi, getApi, postApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { hasPermission } from '../utils/permission.util.js';

interface BackupItem {
  backup_name: string;
  backup_type: 'automated' | 'full' | 'selective';
  created_at: string;
  created_by_name: string;
  engines: string;
  error_message: string | null;
  execution_duration_ms: number;
  expires_at: string | null;
  id: number;
  is_pinned: number;
  metadata: any | null;
  retention_days: number;
  s3_archive_key: string | null;
  s3_bucket: string;
  s3_manifest_key: string | null;
  sha256_checksum: string | null;
  size_bytes: number;
  status: 'completed' | 'failed' | 'in_progress';
  total_redis_keys: number;
  total_rows: number;
  total_s3_objects: number;
  total_tables: number;
  uncompressed_size_bytes: number;
  updated_at: string;
  uuid: string;
}

interface RestoreItem {
  backup_uuid: string;
  created_at: string;
  error_message: string | null;
  execution_duration_ms: number;
  id: number;
  pre_restore_backup_uuid: string | null;
  restore_mode: 'merge' | 'replace';
  restore_report: any | null;
  restored_by_name: string;
  selected_components: any;
  selected_engines: string;
  status: 'completed' | 'failed' | 'in_progress' | 'pending';
  updated_at: string;
  uuid: string;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('es-MX').format(num);
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleString('es-MX', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class BackupsController implements ViewController {
  private abortController: AbortController | null = null;
  private activeTab: 'catalog' | 'inventory' | 'restores' = 'catalog';
  private catalogItems: BackupItem[] = [];
  private container: HTMLElement;
  private currentPage = 1;
  private engineFilter = 'all';
  private inventoryData: any = null;
  private isCreating = false;
  private isRestoring = false;
  private restoreItems: RestoreItem[] = [];
  private restoreMode: 'merge' | 'replace' = 'merge';
  private searchQuery = '';
  private selectedBackupForRestore: BackupItem | null = null;
  private statusFilter = 'all';
  private totalPages = 1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    await Promise.all([
      this.loadKpis(),
      this.loadCatalog(),
      this.loadInventory(),
    ]);
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const btnTabCatalog = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-btn-catalog"]');
    const btnTabRestores = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-btn-restores"]');
    const btnTabInventory = this.container.querySelector<HTMLButtonElement>('[data-ref="tab-btn-inventory"]');

    btnTabCatalog?.addEventListener('click', () => this.switchTab('catalog'), { signal });
    btnTabRestores?.addEventListener('click', () => this.switchTab('restores'), { signal });
    btnTabInventory?.addEventListener('click', () => this.switchTab('inventory'), { signal });

    const btnSync = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sync-catalog"]');
    btnSync?.addEventListener('click', () => this.handleSyncCatalog(), { signal });

    const btnSchedule = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-schedule-settings"]');
    btnSchedule?.addEventListener('click', () => this.openScheduleModal(), { signal });

    const btnCreate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-create-backup"]');
    btnCreate?.addEventListener('click', () => this.openCreateModal(), { signal });

    const btnRefreshCatalog = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-catalog"]');
    btnRefreshCatalog?.addEventListener('click', () => this.loadCatalog(), { signal });

    const btnRefreshRestores = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-restores"]');
    btnRefreshRestores?.addEventListener('click', () => this.loadRestores(), { signal });

    const btnRefreshInventory = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-refresh-inventory"]');
    btnRefreshInventory?.addEventListener('click', () => this.loadInventory(true), { signal });

    const inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-backup"]');
    inputSearch?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.currentPage = 1;
      this.loadCatalog();
    }, { signal });

    const selectStatus = this.container.querySelector<HTMLSelectElement>('[data-ref="select-status-filter"]');
    selectStatus?.addEventListener('change', (e) => {
      this.statusFilter = (e.target as HTMLSelectElement).value;
      this.currentPage = 1;
      this.loadCatalog();
    }, { signal });

    const selectEngine = this.container.querySelector<HTMLSelectElement>('[data-ref="select-engine-filter"]');
    selectEngine?.addEventListener('change', (e) => {
      this.engineFilter = (e.target as HTMLSelectElement).value;
      this.currentPage = 1;
      this.loadCatalog();
    }, { signal });

    const btnPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-catalog-prev"]');
    btnPrev?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.loadCatalog();
      }
    }, { signal });

    const btnNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-catalog-next"]');
    btnNext?.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.loadCatalog();
      }
    }, { signal });

    this.bindCreateModalEvents(signal);
    this.bindRestoreModalEvents(signal);
    this.bindDetailsModalEvents(signal);
    this.bindScheduleModalEvents(signal);
  }

  private switchTab(tab: 'catalog' | 'inventory' | 'restores'): void {
    this.activeTab = tab;
    const btnCatalog = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-catalog"]');
    const btnRestores = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-restores"]');
    const btnInventory = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-inventory"]');

    const paneCatalog = this.container.querySelector<HTMLElement>('[data-ref="pane-catalog"]');
    const paneRestores = this.container.querySelector<HTMLElement>('[data-ref="pane-restores"]');
    const paneInventory = this.container.querySelector<HTMLElement>('[data-ref="pane-inventory"]');

    btnCatalog?.classList.toggle('is-active', tab === 'catalog');
    btnRestores?.classList.toggle('is-active', tab === 'restores');
    btnInventory?.classList.toggle('is-active', tab === 'inventory');

    paneCatalog?.classList.toggle('is-hidden', tab !== 'catalog');
    paneRestores?.classList.toggle('is-hidden', tab !== 'restores');
    paneInventory?.classList.toggle('is-hidden', tab !== 'inventory');

    if (tab === 'restores') {
      this.loadRestores();
    } else if (tab === 'inventory' && !this.inventoryData) {
      this.loadInventory();
    }
  }

  private async loadKpis(): Promise<void> {
    try {
      const res = await getApi<any>('/api/backups/kpis');
      if (res.success && res.data) {
        const kpis = res.data;
        const valTotal = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-total-backups"]');
        const valSize = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-storage-size"]');
        const subSize = this.container.querySelector<HTMLElement>('[data-ref="kpi-sub-storage-size"]');
        const valRecords = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-records-archived"]');
        const valRestores = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-restores-count"]');

        if (valTotal) valTotal.textContent = formatNumber(kpis.completed_backups || 0);
        if (valSize) valSize.textContent = formatBytes(kpis.total_size_bytes || 0);
        if (subSize) subSize.textContent = `Desc. ${formatBytes(kpis.total_uncompressed_bytes || 0)}`;
        if (valRecords) valRecords.textContent = `${formatNumber(kpis.total_archived_rows || 0)} / ${formatNumber(kpis.total_archived_s3_objects || 0)}`;
        if (valRestores) valRestores.textContent = formatNumber(kpis.completed_restores || 0);
      }
    } catch {
      // Ignorar fallo de KPIs silenciosamente
    }
  }

  private async loadCatalog(): Promise<void> {
    const tableBody = this.container.querySelector<HTMLElement>('[data-ref="catalog-table-body"]');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-secondary);">
            Cargando catálogo de copias de seguridad...
          </td>
        </tr>
      `;
    }

    try {
      const params = new URLSearchParams({
        limit: '15',
        page: String(this.currentPage),
      });
      if (this.statusFilter !== 'all') params.append('status', this.statusFilter);
      if (this.engineFilter !== 'all') params.append('engine', this.engineFilter);
      if (this.searchQuery.trim()) params.append('search', this.searchQuery.trim());

      const res = await getApi<any>(`/api/backups/catalog?${params.toString()}`);
      if (res.success && res.data) {
        this.catalogItems = res.data.items || [];
        this.totalPages = res.data.totalPages || 1;
        this.renderCatalogTable();
        this.renderPagination(res.data.total || 0);
      }
    } catch {
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 32px; color: #d32f2f;">
              Error al consultar el catálogo de copias de seguridad.
            </td>
          </tr>
        `;
      }
    }
  }

  private renderCatalogTable(): void {
    const tableBody = this.container.querySelector<HTMLElement>('[data-ref="catalog-table-body"]');
    if (!tableBody) return;

    if (this.catalogItems.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            No se encontraron copias de seguridad coincidentes.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.catalogItems.map((item) => {
      const enginesList = item.engines ? item.engines.split(',') : [];
      const engineTagsHtml = enginesList.map((e) => {
        const clean = e.trim().toLowerCase();
        let label = clean.toUpperCase();
        if (clean === 's3') label = 'S3 MinIO';
        return `<span class="engine-tag engine-tag--${clean}">${label}</span>`;
      }).join('');

      let statusBadgeClass = 'badge-status--completed';
      let statusLabel = 'Completado';
      if (item.status === 'in_progress') {
        statusBadgeClass = 'badge-status--in_progress';
        statusLabel = 'En curso';
      } else if (item.status === 'failed') {
        statusBadgeClass = 'badge-status--failed';
        statusLabel = 'Fallido';
      }

      const shortSha = item.sha256_checksum ? `${item.sha256_checksum.substring(0, 10)}...` : 'Pendiente';
      const isPinned = item.is_pinned === 1;

      return `
        <tr data-uuid="${escapeHtml(item.uuid)}">
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 700; color: var(--text-primary);">${escapeHtml(item.backup_name)}</span>
              <span style="font-family: monospace; font-size: 0.6875rem; color: var(--text-tertiary);">${escapeHtml(item.uuid)}</span>
            </div>
          </td>
          <td>
            <span class="badge-status ${statusBadgeClass}">${statusLabel}</span>
          </td>
          <td>
            <div class="engine-tags">${engineTagsHtml}</div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span style="font-weight: 600;">${formatBytes(item.size_bytes)}</span>
              <span style="font-size: 0.6875rem; color: var(--text-tertiary);">Desc: ${formatBytes(item.uncompressed_size_bytes)}</span>
            </div>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span>${formatNumber(item.total_rows)} filas</span>
              <span style="font-size: 0.6875rem; color: var(--text-tertiary);">${formatNumber(item.total_s3_objects)} archivos</span>
            </div>
          </td>
          <td>
            <span class="hash-pill" data-action="copy-hash" data-hash="${escapeHtml(item.sha256_checksum || '')}" title="Click para copiar SHA-256 completo">
              <svg class="component-icon" style="width: 12px; height: 12px;" aria-hidden="true"><use href="/icons.svg#shield"></use></svg>
              <span>${shortSha}</span>
            </span>
          </td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span>${formatDate(item.created_at)}</span>
              <span style="font-size: 0.6875rem; color: var(--text-tertiary);">Por: ${escapeHtml(item.created_by_name)}</span>
            </div>
          </td>
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <button type="button" class="component-button component-button--icon-only component-button--ghost" data-action="toggle-pin" data-uuid="${escapeHtml(item.uuid)}" data-pinned="${isPinned ? '1' : '0'}" title="${isPinned ? 'Desproteger de purga' : 'Proteger y fijar'}">
                <svg class="component-icon" style="width: 16px; height: 16px; color: ${isPinned ? '#f59e0b' : 'var(--text-tertiary)'};" aria-hidden="true"><use href="/icons.svg#bookmark"></use></svg>
              </button>
              <span style="font-size: 0.75rem;">${item.retention_days}d</span>
            </div>
          </td>
          <td style="text-align: right;">
            <div style="display: inline-flex; align-items: center; gap: 4px;">
              <button type="button" class="component-button component-button--h32 component-button--primary" data-action="open-restore" data-uuid="${escapeHtml(item.uuid)}" title="Restaurar de forma granular">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#history"></use></svg>
                <span>Restaurar</span>
              </button>
              <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--ghost" data-action="verify-hash" data-uuid="${escapeHtml(item.uuid)}" title="Verificar integridad criptográfica SHA-256 en S3">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#verified"></use></svg>
              </button>
              <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--ghost" data-action="download-tar" data-uuid="${escapeHtml(item.uuid)}" title="Descargar paquete .tar.gz">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#download"></use></svg>
              </button>
              <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--ghost" data-action="view-manifest" data-uuid="${escapeHtml(item.uuid)}" title="Ver Manifiesto Forense">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#article"></use></svg>
              </button>
              ${!isPinned ? `
                <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--danger-ghost" data-action="delete-backup" data-uuid="${escapeHtml(item.uuid)}" title="Eliminar de S3">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');

    renderIcons(tableBody);
    this.bindTableActionEvents(tableBody);
  }

  private bindTableActionEvents(tbody: HTMLElement): void {
    tbody.querySelectorAll<HTMLElement>('[data-action="copy-hash"]').forEach((el) => {
      el.addEventListener('click', () => {
        const h = el.getAttribute('data-hash');
        if (h) {
          navigator.clipboard.writeText(h);
          showToast('Checksum SHA-256 copiado al portapapeles');
        }
      });
    });

    tbody.querySelectorAll<HTMLButtonElement>('[data-action="toggle-pin"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const u = btn.getAttribute('data-uuid');
        const p = btn.getAttribute('data-pinned') === '1';
        if (u) {
          await this.handleTogglePin(u, !p);
        }
      });
    });

    tbody.querySelectorAll<HTMLButtonElement>('[data-action="open-restore"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-uuid');
        const item = this.catalogItems.find((x) => x.uuid === u);
        if (item) this.openRestoreModal(item);
      });
    });

    tbody.querySelectorAll<HTMLButtonElement>('[data-action="verify-hash"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-uuid');
        if (u) this.handleVerifyHash(u);
      });
    });

    tbody.querySelectorAll<HTMLButtonElement>('[data-action="download-tar"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-uuid');
        if (u) window.open(`/api/backups/download/${u}`, '_blank');
      });
    });

    tbody.querySelectorAll<HTMLButtonElement>('[data-action="view-manifest"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-uuid');
        if (u) this.openManifestModal(u);
      });
    });

    tbody.querySelectorAll<HTMLButtonElement>('[data-action="delete-backup"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-uuid');
        if (u) this.handleDeleteBackup(u);
      });
    });
  }

  private renderPagination(total: number): void {
    const info = this.container.querySelector<HTMLElement>('[data-ref="catalog-pagination-info"]');
    const btnPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-catalog-prev"]');
    const btnNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-catalog-next"]');

    if (info) {
      info.textContent = `Página ${this.currentPage} de ${this.totalPages} (${formatNumber(total)} registros)`;
    }
    if (btnPrev) btnPrev.disabled = this.currentPage <= 1;
    if (btnNext) btnNext.disabled = this.currentPage >= this.totalPages;
  }

  private async loadRestores(): Promise<void> {
    const tableBody = this.container.querySelector<HTMLElement>('[data-ref="restores-table-body"]');
    try {
      const res = await getApi<any>('/api/backups/restores?limit=25');
      if (res.success && res.data) {
        this.restoreItems = res.data.items || [];
        this.renderRestoresTable();
      }
    } catch {
      if (tableBody) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="9" style="text-align: center; padding: 32px; color: #d32f2f;">
              Error al consultar el historial de restauraciones.
            </td>
          </tr>
        `;
      }
    }
  }

  private renderRestoresTable(): void {
    const tableBody = this.container.querySelector<HTMLElement>('[data-ref="restores-table-body"]');
    if (!tableBody) return;

    if (this.restoreItems.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            No hay operaciones de restauración registradas aún.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.restoreItems.map((r) => {
      const isMerge = r.restore_mode === 'merge';
      const modeLabel = isMerge ? 'Fusión / Upsert' : 'Sobrescritura (Replace)';
      const modeBadgeColor = isMerge ? '#0288d1' : '#d32f2f';

      return `
        <tr>
          <td><span style="font-family: monospace; font-size: 0.75rem;">${escapeHtml(r.uuid)}</span></td>
          <td><span style="font-family: monospace; font-size: 0.75rem; color: var(--text-secondary);">${escapeHtml(r.backup_uuid.substring(0, 8))}...</span></td>
          <td><span style="font-size: 0.6875rem; font-weight: 700; color: ${modeBadgeColor};">${modeLabel}</span></td>
          <td><span style="font-size: 0.75rem;">${escapeHtml(r.selected_engines)}</span></td>
          <td><span class="badge-status badge-status--${r.status === 'completed' ? 'completed' : 'failed'}">${r.status === 'completed' ? 'Exitoso' : 'Fallido'}</span></td>
          <td><span style="font-size: 0.75rem;">${(r.execution_duration_ms / 1000).toFixed(1)}s</span></td>
          <td><span style="font-size: 0.75rem;">${formatDate(r.created_at)}</span></td>
          <td><span style="font-size: 0.75rem;">${escapeHtml(r.restored_by_name)}</span></td>
          <td style="text-align: right;">
            <button type="button" class="component-button component-button--h32 component-button--secondary" data-action="view-restore-report" data-uuid="${escapeHtml(r.uuid)}">
              <span>Detalles</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tableBody.querySelectorAll<HTMLButtonElement>('[data-action="view-restore-report"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.getAttribute('data-uuid');
        const item = this.restoreItems.find((x) => x.uuid === u);
        if (item) {
          this.openForensicDetailsModal('Reporte de Restauración', item.restore_report || item);
        }
      });
    });
  }

  private async loadInventory(showToastOnDone = false): Promise<void> {
    try {
      const res = await getApi<any>('/api/backups/inventory');
      if (res.success && res.data) {
        this.inventoryData = res.data;
        this.renderInventory();
        if (showToastOnDone) {
          showToast('Diagnóstico e inventario de motores sincronizado');
        }
      }
    } catch {
      // Ignorar fallo de inventario silenciosamente
    }
  }

  private renderInventory(): void {
    if (!this.inventoryData) return;
    const inv = this.inventoryData;

    const elMysqlTables = this.container.querySelector<HTMLElement>('[data-ref="mysql-tables-count"]');
    const elMysqlRows = this.container.querySelector<HTMLElement>('[data-ref="mysql-rows-count"]');
    const elMysqlList = this.container.querySelector<HTMLElement>('[data-ref="mysql-tables-list"]');

    if (elMysqlTables) elMysqlTables.textContent = formatNumber(inv.mysql?.total_tables || 0);
    if (elMysqlRows) elMysqlRows.textContent = formatNumber(inv.mysql?.total_rows || 0);
    if (elMysqlList && Array.isArray(inv.mysql?.tables)) {
      elMysqlList.innerHTML = inv.mysql.tables.map((t: any) => `
        <div class="inventory-sub-item">
          <span style="font-weight: 600;">${escapeHtml(t.name)}</span>
          <span style="color: var(--text-secondary);">${formatNumber(t.row_count)} filas</span>
        </div>
      `).join('');
    }

    const elCassTables = this.container.querySelector<HTMLElement>('[data-ref="cassandra-tables-count"]');
    const elCassRows = this.container.querySelector<HTMLElement>('[data-ref="cassandra-rows-count"]');
    const elCassList = this.container.querySelector<HTMLElement>('[data-ref="cassandra-tables-list"]');

    if (elCassTables) elCassTables.textContent = formatNumber(inv.cassandra?.total_tables || 0);
    if (elCassRows) elCassRows.textContent = formatNumber(inv.cassandra?.total_rows || 0);
    if (elCassList && Array.isArray(inv.cassandra?.tables)) {
      elCassList.innerHTML = inv.cassandra.tables.map((t: any) => `
        <div class="inventory-sub-item">
          <span style="font-weight: 600;">${escapeHtml(t.name)}</span>
          <span style="color: var(--text-secondary);">${formatNumber(t.row_count)} registros</span>
        </div>
      `).join('');
    }

    const elS3Objs = this.container.querySelector<HTMLElement>('[data-ref="s3-objects-count"]');
    const elS3Size = this.container.querySelector<HTMLElement>('[data-ref="s3-size-count"]');
    const elS3List = this.container.querySelector<HTMLElement>('[data-ref="s3-prefixes-list"]');

    if (elS3Objs) elS3Objs.textContent = formatNumber(inv.s3?.total_objects || 0);
    if (elS3Size) elS3Size.textContent = formatBytes(inv.s3?.total_size_bytes || 0);
    if (elS3List && Array.isArray(inv.s3?.prefixes)) {
      elS3List.innerHTML = inv.s3.prefixes.map((p: string) => `
        <div class="inventory-sub-item">
          <span style="font-weight: 600;">${escapeHtml(p)}</span>
          <span style="color: var(--text-secondary);">Directorio S3</span>
        </div>
      `).join('');
    }

    const elRedisKeys = this.container.querySelector<HTMLElement>('[data-ref="redis-keys-count"]');
    const elRedisMem = this.container.querySelector<HTMLElement>('[data-ref="redis-memory-count"]');
    const elRedisClients = this.container.querySelector<HTMLElement>('[data-ref="redis-clients-count"]');

    if (elRedisKeys) elRedisKeys.textContent = formatNumber(inv.redis?.key_count || 0);
    if (elRedisMem) elRedisMem.textContent = inv.redis?.memory_used_human || '0B';
    if (elRedisClients) elRedisClients.textContent = formatNumber(inv.redis?.connected_clients || 0);
  }

  private async handleSyncCatalog(): Promise<void> {
    const btnSync = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sync-catalog"]');
    if (btnSync) btnSync.disabled = true;

    try {
      showToast('Escaneando almacenamiento S3 MinIO en segundo plano...');
      const res = await postApi<any>('/api/backups/sync');
      if (res.success && res.data) {
        showToast(`Catálogo reconciliado: ${res.data.synced_count} manifiestos sincronizados`);
        await Promise.all([this.loadKpis(), this.loadCatalog()]);
      } else {
        showToast('No se encontraron nuevos manifiestos para sincronizar');
      }
    } catch {
      showToast('Error al conectar con S3 MinIO');
    } finally {
      if (btnSync) btnSync.disabled = false;
    }
  }

  private async handleTogglePin(uuid: string, isPinned: boolean): Promise<void> {
    try {
      const res = await postApi<any>(`/api/backups/pin/${uuid}`, { is_pinned: isPinned });
      if (res.success) {
        showToast(isPinned ? 'Respaldo protegido y fijado' : 'Respaldo desprotegido');
        await this.loadCatalog();
      }
    } catch {
      showToast('Error al modificar protección del respaldo');
    }
  }

  private async handleVerifyHash(uuid: string): Promise<void> {
    try {
      showToast('Validando checksum SHA-256 en S3 MinIO...');
      const res = await postApi<any>(`/api/backups/verify/${uuid}`);
      if (res.success && res.data) {
        const v = res.data;
        if (v.hash_matches && v.is_valid_archive) {
          showToast(`Integridad verificada con éxito (SHA-256: ${v.actual_sha256.substring(0, 12)}...)`);
        } else {
          showToast('Falla de integridad SHA-256 o archivo corrupto en S3');
        }
      }
    } catch {
      showToast('Error al verificar integridad en S3');
    }
  }

  private async handleDeleteBackup(uuid: string): Promise<void> {
    if (!confirm('¿Deseas eliminar definitivamente este paquete de respaldo de S3 MinIO? Esta acción es irreversible.')) {
      return;
    }

    try {
      const res = await deleteApi<any>(`/api/backups/${uuid}`);
      if (res.success) {
        showToast('Copia de seguridad eliminada de S3');
        await Promise.all([this.loadKpis(), this.loadCatalog()]);
      } else {
        showToast(res.error || 'No se pudo eliminar el respaldo');
      }
    } catch {
      showToast('Error de conexión al eliminar');
    }
  }

  private bindCreateModalEvents(signal?: AbortSignal): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-create-backup"]');
    const overlay = this.container.querySelector<HTMLElement>('[data-ref="modal-create-overlay"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-create"]');
    const btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-modal-create"]');
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-create-backup"]');
    const selectType = this.container.querySelector<HTMLSelectElement>('[data-ref="select-backup-type"]');
    const checkMysql = this.container.querySelector<HTMLInputElement>('[data-ref="engine-check-mysql"]');
    const checkS3 = this.container.querySelector<HTMLInputElement>('[data-ref="engine-check-s3"]');

    const closeModal = () => {
      modal?.classList.add('is-hidden');
    };

    overlay?.addEventListener('click', closeModal, { signal });
    btnClose?.addEventListener('click', closeModal, { signal });
    btnCancel?.addEventListener('click', closeModal, { signal });

    selectType?.addEventListener('change', () => {
      const isSelective = selectType.value === 'selective';
      const detailsMysql = this.container.querySelector<HTMLElement>('[data-ref="selective-details-mysql"]');
      const detailsS3 = this.container.querySelector<HTMLElement>('[data-ref="selective-details-s3"]');
      detailsMysql?.classList.toggle('is-hidden', !isSelective || !checkMysql?.checked);
      detailsS3?.classList.toggle('is-hidden', !isSelective || !checkS3?.checked);
    }, { signal });

    checkMysql?.addEventListener('change', () => {
      const isSelective = selectType?.value === 'selective';
      const detailsMysql = this.container.querySelector<HTMLElement>('[data-ref="selective-details-mysql"]');
      detailsMysql?.classList.toggle('is-hidden', !isSelective || !checkMysql.checked);
    }, { signal });

    checkS3?.addEventListener('change', () => {
      const isSelective = selectType?.value === 'selective';
      const detailsS3 = this.container.querySelector<HTMLElement>('[data-ref="selective-details-s3"]');
      detailsS3?.classList.toggle('is-hidden', !isSelective || !checkS3.checked);
    }, { signal });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmitCreateBackup();
    }, { signal });
  }

  private openCreateModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-create-backup"]');
    const bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-create-error"]');
    bannerError?.classList.add('is-hidden');

    if (this.inventoryData) {
      const mysqlBox = this.container.querySelector<HTMLElement>('[data-ref="mysql-tables-selection-box"]');
      if (mysqlBox && Array.isArray(this.inventoryData.mysql?.tables)) {
        mysqlBox.innerHTML = this.inventoryData.mysql.tables.map((t: any) => `
          <div class="backup-selection-item">
            <label>
              <input type="checkbox" data-table="${escapeHtml(t.name)}" checked />
              <span>${escapeHtml(t.name)}</span>
            </label>
            <span style="font-size: 0.6875rem; color: var(--text-secondary);">${formatNumber(t.row_count)} filas</span>
          </div>
        `).join('');
      }

      const s3Box = this.container.querySelector<HTMLElement>('[data-ref="s3-prefixes-selection-box"]');
      if (s3Box && Array.isArray(this.inventoryData.s3?.prefixes)) {
        s3Box.innerHTML = this.inventoryData.s3.prefixes.map((p: string) => `
          <div class="backup-selection-item">
            <label>
              <input type="checkbox" data-prefix="${escapeHtml(p)}" checked />
              <span>${escapeHtml(p)}</span>
            </label>
            <span style="font-size: 0.6875rem; color: var(--text-secondary);">Directorio</span>
          </div>
        `).join('');
      }
    }

    modal?.classList.remove('is-hidden');
  }

  private async handleSubmitCreateBackup(): Promise<void> {
    if (this.isCreating) return;
    const bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-create-error"]');
    const textError = this.container.querySelector<HTMLElement>('[data-ref="text-create-error"]');
    const btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-create-backup"]');

    bannerError?.classList.add('is-hidden');

    const inputName = this.container.querySelector<HTMLInputElement>('[data-ref="input-backup-name"]');
    const selectType = this.container.querySelector<HTMLSelectElement>('[data-ref="select-backup-type"]');
    const inputRetention = this.container.querySelector<HTMLInputElement>('[data-ref="input-retention-days"]');
    const checkPinned = this.container.querySelector<HTMLInputElement>('[data-ref="check-is-pinned"]');

    const checkMysql = this.container.querySelector<HTMLInputElement>('[data-ref="engine-check-mysql"]');
    const checkCassandra = this.container.querySelector<HTMLInputElement>('[data-ref="engine-check-cassandra"]');
    const checkS3 = this.container.querySelector<HTMLInputElement>('[data-ref="engine-check-s3"]');
    const checkRedis = this.container.querySelector<HTMLInputElement>('[data-ref="engine-check-redis"]');

    const engines: string[] = [];
    if (checkMysql?.checked) engines.push('mysql');
    if (checkCassandra?.checked) engines.push('cassandra');
    if (checkS3?.checked) engines.push('s3');
    if (checkRedis?.checked) engines.push('redis');

    if (engines.length === 0) {
      if (bannerError && textError) {
        textError.textContent = 'Debes seleccionar al menos un motor de almacenamiento para el respaldo.';
        bannerError.classList.remove('is-hidden');
      }
      return;
    }

    const isSelective = selectType?.value === 'selective';
    const selectedMysql: string[] = [];
    const selectedS3: string[] = [];

    if (isSelective) {
      this.container.querySelectorAll<HTMLInputElement>('[data-ref="mysql-tables-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
        const tbl = c.getAttribute('data-table');
        if (tbl) selectedMysql.push(tbl);
      });
      this.container.querySelectorAll<HTMLInputElement>('[data-ref="s3-prefixes-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
        const pfx = c.getAttribute('data-prefix');
        if (pfx) selectedS3.push(pfx);
      });
    }

    this.isCreating = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>Empaquetando en S3...</span>';
    }

    try {
      showToast('Iniciando procesamiento de copia de seguridad en Python...');
      const res = await postApi<any>('/api/backups/create', {
        backup_name: inputName?.value.trim() || undefined,
        backup_type: selectType?.value || 'full',
        engines,
        is_pinned: Boolean(checkPinned?.checked),
        retention_days: parseInt(inputRetention?.value || '30', 10),
        selected_mysql_tables: isSelective ? selectedMysql : undefined,
        selected_s3_prefixes: isSelective ? selectedS3 : undefined,
      });

      if (res.success && res.data) {
        showToast('Copia de seguridad creada y subida a S3 MinIO con éxito');
        this.container.querySelector<HTMLElement>('[data-ref="modal-create-backup"]')?.classList.add('is-hidden');
        await Promise.all([this.loadKpis(), this.loadCatalog()]);
      } else {
        if (bannerError && textError) {
          textError.textContent = res.error || 'Error al generar la copia de seguridad.';
          bannerError.classList.remove('is-hidden');
        }
      }
    } catch {
      if (bannerError && textError) {
        textError.textContent = 'Error inesperado de comunicación con el motor de copias.';
        bannerError.classList.remove('is-hidden');
      }
    } finally {
      this.isCreating = false;
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#save"></use></svg>
          <span>Ejecutar Respaldo</span>
        `;
        renderIcons(btnSubmit);
      }
    }
  }

  private bindRestoreModalEvents(signal?: AbortSignal): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-restore-backup"]');
    const overlay = this.container.querySelector<HTMLElement>('[data-ref="modal-restore-overlay"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-restore"]');
    const btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-modal-restore"]');
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-restore-backup"]');

    const optMerge = this.container.querySelector<HTMLElement>('[data-ref="opt-restore-merge"]');
    const optReplace = this.container.querySelector<HTMLElement>('[data-ref="opt-restore-replace"]');

    optMerge?.addEventListener('click', () => {
      this.restoreMode = 'merge';
      optMerge.classList.add('is-selected');
      optReplace?.classList.remove('is-selected');
    }, { signal });

    optReplace?.addEventListener('click', () => {
      this.restoreMode = 'replace';
      optReplace.classList.add('is-selected');
      optMerge?.classList.remove('is-selected');
    }, { signal });

    const btnToggleMysql = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-all-restore-mysql"]');
    btnToggleMysql?.addEventListener('click', () => {
      const inputs = this.container.querySelectorAll<HTMLInputElement>('[data-ref="restore-mysql-selection-box"] input[type="checkbox"]');
      const allChecked = Array.from(inputs).every((i) => i.checked);
      inputs.forEach((i) => { i.checked = !allChecked; });
    }, { signal });

    const btnToggleCass = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-all-restore-cass"]');
    btnToggleCass?.addEventListener('click', () => {
      const inputs = this.container.querySelectorAll<HTMLInputElement>('[data-ref="restore-cass-selection-box"] input[type="checkbox"]');
      const allChecked = Array.from(inputs).every((i) => i.checked);
      inputs.forEach((i) => { i.checked = !allChecked; });
    }, { signal });

    const btnToggleS3 = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-all-restore-s3"]');
    btnToggleS3?.addEventListener('click', () => {
      const inputs = this.container.querySelectorAll<HTMLInputElement>('[data-ref="restore-s3-selection-box"] input[type="checkbox"]');
      const allChecked = Array.from(inputs).every((i) => i.checked);
      inputs.forEach((i) => { i.checked = !allChecked; });
    }, { signal });

    const closeModal = () => {
      modal?.classList.add('is-hidden');
    };

    overlay?.addEventListener('click', closeModal, { signal });
    btnClose?.addEventListener('click', closeModal, { signal });
    btnCancel?.addEventListener('click', closeModal, { signal });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmitRestoreBackup();
    }, { signal });
  }

  private openRestoreModal(backup: BackupItem): void {
    this.selectedBackupForRestore = backup;
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-restore-backup"]');
    const targetName = this.container.querySelector<HTMLElement>('[data-ref="restore-target-name"]');
    const targetUuid = this.container.querySelector<HTMLElement>('[data-ref="restore-target-uuid"]');
    const bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-restore-error"]');

    bannerError?.classList.add('is-hidden');
    if (targetName) targetName.textContent = backup.backup_name;
    if (targetUuid) targetUuid.textContent = `UUID: ${backup.uuid} • Creado: ${formatDate(backup.created_at)} • Tamaño: ${formatBytes(backup.size_bytes)}`;

    const meta = backup.metadata || {};

    const mysqlBox = this.container.querySelector<HTMLElement>('[data-ref="restore-mysql-selection-box"]');
    if (mysqlBox) {
      const tables = meta.mysql?.tables || {};
      const tKeys = Object.keys(tables);
      if (tKeys.length > 0) {
        mysqlBox.innerHTML = tKeys.map((k) => `
          <div class="backup-selection-item">
            <label>
              <input type="checkbox" data-restore-mysql="${escapeHtml(k)}" checked />
              <span>${escapeHtml(k)}</span>
            </label>
            <span style="font-size: 0.6875rem; color: var(--text-secondary);">${formatNumber(tables[k].row_count || 0)} filas</span>
          </div>
        `).join('');
      } else {
        mysqlBox.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin datos MySQL en este archivo</span>';
      }
    }

    const cassBox = this.container.querySelector<HTMLElement>('[data-ref="restore-cass-selection-box"]');
    if (cassBox) {
      const cassTables = meta.cassandra?.tables || {};
      const cKeys = Object.keys(cassTables);
      if (cKeys.length > 0) {
        cassBox.innerHTML = cKeys.map((k) => `
          <div class="backup-selection-item">
            <label>
              <input type="checkbox" data-restore-cass="${escapeHtml(k)}" checked />
              <span>${escapeHtml(k)}</span>
            </label>
            <span style="font-size: 0.6875rem; color: var(--text-secondary);">${formatNumber(cassTables[k].row_count || 0)} registros</span>
          </div>
        `).join('');
      } else {
        cassBox.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin datos Cassandra en este archivo</span>';
      }
    }

    const s3Box = this.container.querySelector<HTMLElement>('[data-ref="restore-s3-selection-box"]');
    if (s3Box) {
      const s3Objs: Array<{ key: string }> = meta.s3?.objects || [];
      const prefixesSet = new Set<string>();
      for (const o of s3Objs) {
        const parts = o.key.split('/');
        if (parts.length > 1) prefixesSet.add(parts[0] + '/');
      }
      const pList = Array.from(prefixesSet);
      if (pList.length > 0) {
        s3Box.innerHTML = pList.map((p) => `
          <div class="backup-selection-item">
            <label>
              <input type="checkbox" data-restore-s3="${escapeHtml(p)}" checked />
              <span>${escapeHtml(p)}</span>
            </label>
            <span style="font-size: 0.6875rem; color: var(--text-secondary);">Directorio</span>
          </div>
        `).join('');
      } else {
        s3Box.innerHTML = '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin archivos S3 en este respaldo</span>';
      }
    }

    modal?.classList.remove('is-hidden');
  }

  private async handleSubmitRestoreBackup(): Promise<void> {
    if (this.isRestoring || !this.selectedBackupForRestore) return;
    const bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-restore-error"]');
    const textError = this.container.querySelector<HTMLElement>('[data-ref="text-restore-error"]');
    const btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-restore-backup"]');
    const checkSnapshot = this.container.querySelector<HTMLInputElement>('[data-ref="check-pre-restore-snapshot"]');
    const checkRedis = this.container.querySelector<HTMLInputElement>('[data-ref="restore-check-redis"]');

    bannerError?.classList.add('is-hidden');

    const selectedMysql: string[] = [];
    const selectedCass: string[] = [];
    const selectedS3: string[] = [];

    this.container.querySelectorAll<HTMLInputElement>('[data-ref="restore-mysql-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
      const t = c.getAttribute('data-restore-mysql');
      if (t) selectedMysql.push(t);
    });

    this.container.querySelectorAll<HTMLInputElement>('[data-ref="restore-cass-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
      const t = c.getAttribute('data-restore-cass');
      if (t) selectedCass.push(t);
    });

    this.container.querySelectorAll<HTMLInputElement>('[data-ref="restore-s3-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
      const p = c.getAttribute('data-restore-s3');
      if (p) selectedS3.push(p);
    });

    if (selectedMysql.length === 0 && selectedCass.length === 0 && selectedS3.length === 0 && !checkRedis?.checked) {
      if (bannerError && textError) {
        textError.textContent = 'Debes seleccionar al menos un componente para restaurar.';
        bannerError.classList.remove('is-hidden');
      }
      return;
    }

    if (this.restoreMode === 'replace') {
      const msg = 'ATENCIÓN: Has seleccionado el modo "Sobrescritura Total (Replace)". Las tablas seleccionadas serán vaciadas antes de insertar los datos del respaldo. ¿Deseas continuar?';
      if (!confirm(msg)) return;
    }

    this.isRestoring = true;
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span>Restaurando datos...</span>';
    }

    try {
      showToast('Descargando y verificando integridad del respaldo en S3...');
      const res = await postApi<any>('/api/backups/restore', {
        backup_uuid: this.selectedBackupForRestore.uuid,
        create_pre_restore_backup: Boolean(checkSnapshot?.checked),
        restore_mode: this.restoreMode,
        selected_components: {
          cassandra_tables: selectedCass,
          mysql_tables: selectedMysql,
          redis: Boolean(checkRedis?.checked),
          s3_prefixes: selectedS3,
        },
      });

      if (res.success && res.data) {
        showToast('Restauración selectiva completada con éxito');
        this.container.querySelector<HTMLElement>('[data-ref="modal-restore-backup"]')?.classList.add('is-hidden');
        this.switchTab('restores');
        await this.loadKpis();
      } else {
        if (bannerError && textError) {
          textError.textContent = res.error || 'Falla durante la restauración.';
          bannerError.classList.remove('is-hidden');
        }
      }
    } catch {
      if (bannerError && textError) {
        textError.textContent = 'Error de comunicación durante la restauración.';
        bannerError.classList.remove('is-hidden');
      }
    } finally {
      this.isRestoring = false;
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `
          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#history"></use></svg>
          <span>Iniciar Restauración</span>
        `;
        renderIcons(btnSubmit);
      }
    }
  }

  private bindDetailsModalEvents(signal?: AbortSignal): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-details-backup"]');
    const overlay = this.container.querySelector<HTMLElement>('[data-ref="modal-details-overlay"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-details"]');
    const btnCloseView = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-details-view"]');

    const closeModal = () => modal?.classList.add('is-hidden');

    overlay?.addEventListener('click', closeModal, { signal });
    btnClose?.addEventListener('click', closeModal, { signal });
    btnCloseView?.addEventListener('click', closeModal, { signal });
  }

  private async openManifestModal(uuid: string): Promise<void> {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-details-backup"]');
    const title = this.container.querySelector<HTMLElement>('[data-ref="modal-details-title"]');
    const content = this.container.querySelector<HTMLElement>('[data-ref="details-manifest-content"]');

    if (title) title.textContent = `Manifiesto Forense • ${uuid}`;
    if (content) content.textContent = 'Recuperando manifiesto desde S3 MinIO...';
    modal?.classList.remove('is-hidden');

    try {
      const res = await getApi<any>(`/api/backups/catalog/${uuid}`);
      if (res.success && res.data) {
        if (content) {
          content.textContent = JSON.stringify(res.data.metadata || res.data, null, 2);
        }
      } else {
        if (content) content.textContent = 'No se pudo cargar el manifiesto.';
      }
    } catch {
      if (content) content.textContent = 'Error al cargar detalles del manifiesto.';
    }
  }

  private openForensicDetailsModal(titleText: string, data: any): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-details-backup"]');
    const title = this.container.querySelector<HTMLElement>('[data-ref="modal-details-title"]');
    const content = this.container.querySelector<HTMLElement>('[data-ref="details-manifest-content"]');

    if (title) title.textContent = titleText;
    if (content) content.textContent = JSON.stringify(data, null, 2);
    modal?.classList.remove('is-hidden');
  }

  private bindScheduleModalEvents(signal?: AbortSignal): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-schedule-settings"]');
    const overlay = this.container.querySelector<HTMLElement>('[data-ref="modal-schedule-overlay"]');
    const btnClose = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-close-modal-schedule"]');
    const btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-modal-schedule"]');
    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-schedule-settings"]');

    const closeModal = () => modal?.classList.add('is-hidden');

    overlay?.addEventListener('click', closeModal, { signal });
    btnClose?.addEventListener('click', closeModal, { signal });
    btnCancel?.addEventListener('click', closeModal, { signal });

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.handleSubmitScheduleSettings();
    }, { signal });
  }

  private async openScheduleModal(): Promise<void> {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-schedule-settings"]');
    const bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-schedule-error"]');
    bannerError?.classList.add('is-hidden');

    try {
      const res = await getApi<any>('/api/backups/schedule');
      if (res.success && res.data) {
        const s = res.data;
        const checkEnabled = this.container.querySelector<HTMLInputElement>('[data-ref="schedule-check-enabled"]');
        const selectFreq = this.container.querySelector<HTMLSelectElement>('[data-ref="select-schedule-frequency"]');
        const inputTime = this.container.querySelector<HTMLInputElement>('[data-ref="input-schedule-time"]');
        const inputRet = this.container.querySelector<HTMLInputElement>('[data-ref="input-default-retention"]');

        if (checkEnabled) checkEnabled.checked = s.backup_auto_enabled === '1';
        if (selectFreq) selectFreq.value = s.backup_schedule_frequency || 'daily';
        if (inputTime) inputTime.value = s.backup_schedule_time || '03:00';
        if (inputRet) inputRet.value = s.backup_default_retention_days || '30';
      }
    } catch {
      // Ignorar fallo de carga de settings
    }

    modal?.classList.remove('is-hidden');
  }

  private async handleSubmitScheduleSettings(): Promise<void> {
    const bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-schedule-error"]');
    const textError = this.container.querySelector<HTMLElement>('[data-ref="text-schedule-error"]');
    const btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-schedule-settings"]');

    bannerError?.classList.add('is-hidden');

    const checkEnabled = this.container.querySelector<HTMLInputElement>('[data-ref="schedule-check-enabled"]');
    const selectFreq = this.container.querySelector<HTMLSelectElement>('[data-ref="select-schedule-frequency"]');
    const inputTime = this.container.querySelector<HTMLInputElement>('[data-ref="input-schedule-time"]');
    const inputRet = this.container.querySelector<HTMLInputElement>('[data-ref="input-default-retention"]');

    if (btnSubmit) btnSubmit.disabled = true;

    try {
      const res = await putApi<any>('/api/backups/schedule', {
        backup_auto_enabled: checkEnabled?.checked ? '1' : '0',
        backup_default_retention_days: inputRet?.value || '30',
        backup_schedule_frequency: selectFreq?.value || 'daily',
        backup_schedule_time: inputTime?.value || '03:00',
      });

      if (res.success) {
        showToast('Política de retención y programación guardada');
        this.container.querySelector<HTMLElement>('[data-ref="modal-schedule-settings"]')?.classList.add('is-hidden');
      } else {
        if (bannerError && textError) {
          textError.textContent = res.error || 'Error al guardar la configuración.';
          bannerError.classList.remove('is-hidden');
        }
      }
    } catch {
      if (bannerError && textError) {
        textError.textContent = 'Error inesperado al guardar la programación.';
        bannerError.classList.remove('is-hidden');
      }
    } finally {
      if (btnSubmit) btnSubmit.disabled = false;
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.catalogItems = [];
    this.restoreItems = [];
    this.inventoryData = null;
    this.selectedBackupForRestore = null;
  }
}

export async function createBackupsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/backups/backups.html');
  const controller = new BackupsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
