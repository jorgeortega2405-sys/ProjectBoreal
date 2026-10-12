import { openModal } from '../components/modal.component.js';
import { deleteApi, getApi, postApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, setupDropdown } from '../utils/dom.util.js';
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
  private btnCatalogNext: HTMLButtonElement | null = null;
  private btnCatalogPrev: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private catalogItems: BackupItem[] = [];
  private container: HTMLElement;
  private currentPage = 1;
  private engineFilter = 'all';
  private filterDropdownController: DropdownController | null = null;
  private inputPaginationPage: HTMLInputElement | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private inventoryData: any = null;
  private isCreating = false;
  private isRestoring = false;
  private isSearchActive = false;
  private restoreItems: RestoreItem[] = [];
  private restoreMode: 'merge' | 'replace' = 'merge';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private sectionDropdownController: DropdownController | null = null;
  private defaultActions: HTMLElement | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedBackup: BackupItem | null = null;
  private selectedBackupForRestore: BackupItem | null = null;
  private selectedRestore: RestoreItem | null = null;
  private statusFilter = 'all';
  private totalPages = 1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.setupDropdowns();
    this.bindEvents();
    renderIcons(this.container);
    await Promise.all([
      this.loadCatalog(),
      this.loadInventory(),
    ]);
  }

  private setupDropdowns(): void {
    const filterWrapper = this.container.querySelector<HTMLElement>('[data-ref="filter-dropdown-wrapper"]');
    if (filterWrapper) {
      this.filterDropdownController = setupDropdown(filterWrapper, {
        isSelect: false,
        matchWidth: false,
        placement: 'bottom-end',
      });
    }

    const sectionWrapper = this.container.querySelector<HTMLElement>('[data-ref="section-dropdown-wrapper"]');
    if (sectionWrapper) {
      this.sectionDropdownController = setupDropdown(sectionWrapper, {
        isSelect: false,
        matchWidth: false,
        placement: 'bottom-end',
      });
    }
  }

  private bindEvents(): void {
    const signal = this.abortController?.signal;

    const sectionButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-section]');
    sectionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sec = btn.getAttribute('data-section') as 'catalog' | 'inventory' | 'restores';
        if (sec) {
          sectionButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
          this.sectionDropdownController?.close();
          this.switchTab(sec);
        }
      }, { signal });
    });

    const btnSync = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-sync-catalog"]');
    btnSync?.addEventListener('click', () => this.handleSyncCatalog(), { signal });

    const btnSchedule = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-schedule-settings"]');
    btnSchedule?.addEventListener('click', () => this.openScheduleModal(), { signal });

    const btnCreate = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-create-backup"]');
    btnCreate?.addEventListener('click', () => this.openCreateModal(), { signal });

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-backup"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');

    const btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    btnToggleSearch?.addEventListener('click', (e) => {
      e.preventDefault();
      if (!this.searchToolbar) return;
      this.isSearchActive = !this.isSearchActive;
      if (this.isSearchActive) {
        this.searchToolbar.classList.remove('is-hidden');
        this.inputSearch?.focus();
      } else {
        this.searchToolbar.classList.add('is-hidden');
        if (this.inputSearch) this.inputSearch.value = '';
        this.btnClearSearch?.classList.add('is-hidden');
        if (this.searchQuery) {
          this.searchQuery = '';
          this.currentPage = 1;
          void this.loadCatalog();
        }
      }
    }, { signal });

    this.inputSearch?.addEventListener('input', () => {
      const val = this.inputSearch?.value.trim() || '';
      this.btnClearSearch?.classList.toggle('is-hidden', val.length === 0);
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.searchQuery = val;
        this.currentPage = 1;
        void this.loadCatalog();
      }, 250);
    }, { signal });

    this.btnClearSearch?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.inputSearch) this.inputSearch.value = '';
      this.btnClearSearch?.classList.add('is-hidden');
      this.searchQuery = '';
      this.currentPage = 1;
      void this.loadCatalog();
    }, { signal });

    const statusBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-status-filter]');
    statusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const st = btn.getAttribute('data-status-filter') || 'all';
        this.statusFilter = st;
        statusBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        this.currentPage = 1;
        this.filterDropdownController?.close();
        void this.loadCatalog();
      }, { signal });
    });

    const engineBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-engine-filter]');
    engineBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const eg = btn.getAttribute('data-engine-filter') || 'all';
        this.engineFilter = eg;
        engineBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        this.currentPage = 1;
        this.filterDropdownController?.close();
        void this.loadCatalog();
      }, { signal });
    });

    this.inputPaginationPage = this.container.querySelector<HTMLInputElement>('[data-ref="input-pagination-page"]');
    this.btnCatalogPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-catalog-prev"]');
    this.btnCatalogNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-catalog-next"]');

    this.btnCatalogPrev?.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        void this.loadCatalog();
      }
    }, { signal });

    this.btnCatalogNext?.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        void this.loadCatalog();
      }
    }, { signal });

    this.inputPaginationPage?.addEventListener('change', () => {
      if (!this.inputPaginationPage) return;
      let val = parseInt(this.inputPaginationPage.value, 10);
      if (isNaN(val) || val < 1) val = 1;
      if (val > this.totalPages) val = this.totalPages;
      this.currentPage = val;
      this.inputPaginationPage.value = String(val);
      void this.loadCatalog();
    }, { signal });

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="backups-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="backups-selected-actions"]');

    const btnDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    btnDeselect?.addEventListener('click', (e) => {
      e.preventDefault();
      this.deselectAll();
    }, { signal });

    const btnRestore = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-restore"]');
    btnRestore?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedBackup) this.openRestoreModal(this.selectedBackup);
    }, { signal });

    const btnVerify = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-verify-hash"]');
    btnVerify?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedBackup) this.handleVerifyHash(this.selectedBackup.uuid);
    }, { signal });

    const btnDownload = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-download"]');
    btnDownload?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedBackup) window.open(`/api/backups/download/${this.selectedBackup.uuid}`, '_blank');
    }, { signal });

    const btnManifest = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-manifest"]');
    btnManifest?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedBackup) this.openManifestModal(this.selectedBackup.uuid);
      else if (this.selectedRestore) this.openForensicDetailsModal('Reporte de Restauración', this.selectedRestore.restore_report || this.selectedRestore);
    }, { signal });

    const btnPin = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-pin"]');
    btnPin?.addEventListener('click', async (e) => {
      e.preventDefault();
      if (this.selectedBackup) {
        await this.handleTogglePin(this.selectedBackup.uuid, this.selectedBackup.is_pinned !== 1);
      }
    }, { signal });

    const btnDelete = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-delete"]');
    btnDelete?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedBackup) this.handleDeleteBackup(this.selectedBackup.uuid);
    }, { signal });
  }


  private deselectAll(): void {
    this.selectedBackup = null;
    this.selectedRestore = null;
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedBackup !== null || this.selectedRestore !== null;
    this.defaultActions?.classList.toggle('is-hidden', isSelected);
    this.selectedActions?.classList.toggle('is-hidden', !isSelected);

    const btnRestore = this.container.querySelector<HTMLElement>('[data-ref="btn-action-restore"]');
    const btnVerify = this.container.querySelector<HTMLElement>('[data-ref="btn-action-verify-hash"]');
    const btnDownload = this.container.querySelector<HTMLElement>('[data-ref="btn-action-download"]');
    const btnPin = this.container.querySelector<HTMLElement>('[data-ref="btn-action-pin"]');
    const btnDelete = this.container.querySelector<HTMLElement>('[data-ref="btn-action-delete"]');

    if (this.selectedBackup) {
      btnRestore?.classList.remove('is-hidden');
      btnVerify?.classList.remove('is-hidden');
      btnDownload?.classList.remove('is-hidden');
      btnPin?.classList.remove('is-hidden');
      btnDelete?.classList.toggle('is-hidden', this.selectedBackup.is_pinned === 1);
    } else if (this.selectedRestore) {
      btnRestore?.classList.add('is-hidden');
      btnVerify?.classList.add('is-hidden');
      btnDownload?.classList.add('is-hidden');
      btnPin?.classList.add('is-hidden');
      btnDelete?.classList.add('is-hidden');
    }

    const rows = this.container.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((r) => {
      const u = r.getAttribute('data-uuid');
      const isSel = (this.selectedBackup && u === this.selectedBackup.uuid) || (this.selectedRestore && u === this.selectedRestore.uuid);
      r.classList.toggle('is-selected', Boolean(isSel));
    });
  }

  private switchTab(tab: 'catalog' | 'inventory' | 'restores'): void {
    this.deselectAll();
    this.activeTab = tab;
    const sectionButtons = this.container.querySelectorAll<HTMLElement>('[data-section]');
    sectionButtons.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-section') === tab));

    const paneCatalog = this.container.querySelector<HTMLElement>('[data-ref="pane-catalog"]');
    const paneRestores = this.container.querySelector<HTMLElement>('[data-ref="pane-restores"]');
    const paneInventory = this.container.querySelector<HTMLElement>('[data-ref="pane-inventory"]');

    paneCatalog?.classList.toggle('is-hidden', tab !== 'catalog');
    paneRestores?.classList.toggle('is-hidden', tab !== 'restores');
    paneInventory?.classList.toggle('is-hidden', tab !== 'inventory');

    if (tab === 'restores') {
      void this.loadRestores();
    } else if (tab === 'inventory' && !this.inventoryData) {
      void this.loadInventory();
    }
  }

  private async loadKpis(): Promise<void> {}

  private async loadCatalog(): Promise<void> {
    const tableBody = this.container.querySelector<HTMLElement>('[data-ref="catalog-table-body"]');
    if (tableBody) {
      tableBody.innerHTML = `
        <tr class="winners-table__tr winners-tr--empty">
          <td class="winners-table__td winners-td--empty" colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
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
          <tr class="winners-table__tr winners-tr--empty">
            <td class="winners-table__td winners-td--empty" colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
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
        <tr class="winners-table__tr winners-tr--empty">
          <td class="winners-table__td winners-td--empty" colspan="8" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            No se encontraron copias de seguridad coincidentes.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.catalogItems.map((item) => {
      const isSelected = this.selectedBackup?.uuid === item.uuid;
      const isPinned = item.is_pinned === 1;
      let statusLabel = 'Completado';
      if (item.status === 'in_progress') statusLabel = 'En curso';
      else if (item.status === 'failed') statusLabel = 'Fallido';

      const shortSha = item.sha256_checksum ? `${item.sha256_checksum.substring(0, 10)}...` : 'Pendiente';

      return `
        <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-uuid="${escapeHtml(item.uuid)}">
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(item.backup_name)}</span>
          </td>
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm">${statusLabel}</span>
          </td>
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm">${escapeHtml(item.engines || 'MySQL')}</span>
          </td>
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm component-badge--mono-bold">${formatBytes(item.size_bytes)}</span>
          </td>
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm component-badge--mono-bold">${formatNumber(item.total_rows)} filas</span>
          </td>
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm component-badge--mono-bold">${shortSha}</span>
          </td>
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm component-badge--mono-bold">${formatDate(item.created_at)}</span>
          </td>
          <td class="winners-table__td">
            <span class="component-badge component-badge--sm">${item.retention_days}d ${isPinned ? '• Fijado' : ''}</span>
          </td>
        </tr>
      `;
    }).join('');

    renderIcons(tableBody);

    const rows = tableBody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-uuid');
      const item = this.catalogItems.find((x) => x.uuid === uuid);
      if (!item) return;

      row.addEventListener('click', () => {
        if (this.selectedBackup?.uuid === item.uuid) {
          this.selectedBackup = null;
        } else {
          this.selectedBackup = item;
          this.selectedRestore = null;
        }
        this.updateSelectionUi();
      });

      row.addEventListener('dblclick', () => {
        this.openRestoreModal(item);
      });
    });
  }

  private renderPagination(_total: number): void {
    if (this.inputPaginationPage) {
      this.inputPaginationPage.value = String(this.currentPage);
      this.inputPaginationPage.max = String(Math.max(1, this.totalPages));
    }
    if (this.btnCatalogPrev) this.btnCatalogPrev.disabled = this.currentPage <= 1;
    if (this.btnCatalogNext) this.btnCatalogNext.disabled = this.currentPage >= this.totalPages;
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
          <tr class="winners-table__tr winners-tr--empty">
            <td class="winners-table__td winners-td--empty" colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
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
        <tr class="winners-table__tr winners-tr--empty">
          <td class="winners-table__td winners-td--empty" colspan="8" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            No hay operaciones de restauración registradas aún.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = this.restoreItems.map((r) => {
      const isSelected = this.selectedRestore?.uuid === r.uuid;
      const isMerge = r.restore_mode === 'merge';
      const modeLabel = isMerge ? 'Fusión (Upsert)' : 'Sobrescritura (Replace)';

      return `
        <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-uuid="${escapeHtml(r.uuid)}">
          <td class="winners-table__td"><span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(r.uuid.substring(0, 10))}...</span></td>
          <td class="winners-table__td"><span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(r.backup_uuid.substring(0, 8))}...</span></td>
          <td class="winners-table__td"><span class="component-badge component-badge--sm">${modeLabel}</span></td>
          <td class="winners-table__td"><span class="component-badge component-badge--sm">${escapeHtml(r.selected_engines)}</span></td>
          <td class="winners-table__td"><span class="component-badge component-badge--sm">${r.status === 'completed' ? 'Exitoso' : 'Fallido'}</span></td>
          <td class="winners-table__td"><span class="component-badge component-badge--sm component-badge--mono-bold">${(r.execution_duration_ms / 1000).toFixed(1)}s</span></td>
          <td class="winners-table__td"><span class="component-badge component-badge--sm component-badge--mono-bold">${formatDate(r.created_at)}</span></td>
          <td class="winners-table__td"><span class="component-badge component-badge--sm">${escapeHtml(r.restored_by_name)}</span></td>
        </tr>
      `;
    }).join('');

    renderIcons(tableBody);

    const rows = tableBody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-uuid');
      const item = this.restoreItems.find((x) => x.uuid === uuid);
      if (!item) return;

      row.addEventListener('click', () => {
        if (this.selectedRestore?.uuid === item.uuid) {
          this.selectedRestore = null;
        } else {
          this.selectedRestore = item;
          this.selectedBackup = null;
        }
        this.updateSelectionUi();
      });

      row.addEventListener('dblclick', () => {
        this.openForensicDetailsModal('Reporte de Restauración', item.restore_report || item);
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

  private openCreateModal(): void {
    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'backups-modal-form-content';

    const mysqlTables = Array.isArray(this.inventoryData?.mysql?.tables) ? this.inventoryData.mysql.tables : [];
    const s3Prefixes = Array.isArray(this.inventoryData?.s3?.prefixes) ? this.inventoryData.s3.prefixes : [];

    bodyContainer.innerHTML = `
      <label class="field" data-ref="field-backup-name">
        <input class="field__input" data-ref="input-backup-name" type="text" placeholder=" " />
        <span class="field__label">Nombre descriptivo del respaldo (opcional)</span>
      </label>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px;">
        <label class="field field--select" data-ref="field-backup-type">
          <select class="field__input" data-ref="select-backup-type">
            <option value="full">Respaldo Integral (Full Dump)</option>
            <option value="selective">Respaldo Selectivo Personalizado</option>
          </select>
          <span class="field__label">Modalidad de Respaldo</span>
        </label>
        <label class="field" data-ref="field-retention-days">
          <input class="field__input" data-ref="input-retention-days" type="number" value="30" min="1" max="3650" />
          <span class="field__label">Días de Retención en S3</span>
        </label>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; margin-top: 14px;">
        <input class="field__checkbox" data-ref="check-is-pinned" type="checkbox" />
        <span style="font-size: 0.8125rem; font-weight: 500; color: var(--text-primary);">
          Fijar y Proteger Respaldo (Evita purgas automáticas por retención)
        </span>
      </div>

      <div style="margin-top: 16px;">
        <span style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; display: block;">
          Motores de Almacenamiento a Incluir
        </span>
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; cursor: pointer;">
            <input class="field__checkbox" data-ref="engine-check-mysql" type="checkbox" checked />
            <span class="component-badge component-badge--sm">MySQL</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; cursor: pointer;">
            <input class="field__checkbox" data-ref="engine-check-cassandra" type="checkbox" checked />
            <span class="component-badge component-badge--sm">Cassandra</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; cursor: pointer;">
            <input class="field__checkbox" data-ref="engine-check-s3" type="checkbox" checked />
            <span class="component-badge component-badge--sm">S3 MinIO</span>
          </label>
          <label style="display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; cursor: pointer;">
            <input class="field__checkbox" data-ref="engine-check-redis" type="checkbox" checked />
            <span class="component-badge component-badge--sm">Redis</span>
          </label>
        </div>
      </div>

      <div class="selective-engines-box is-hidden" data-ref="selective-details-box" style="margin-top: 16px; border-top: 1px solid var(--border-color); padding-top: 14px;">
        <div class="selective-details" data-ref="selective-details-mysql" style="margin-bottom: 12px;">
          <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; display: block;">
            Tablas MySQL (db_lottery)
          </span>
          <div class="backup-selection-box" data-ref="mysql-tables-selection-box" style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border-color); padding: 8px; border-radius: var(--radius-sm);">
            ${mysqlTables.length > 0 ? mysqlTables.map((t: any) => `
              <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; cursor: pointer;">
                <span style="display: flex; align-items: center; gap: 6px;">
                  <input class="field__checkbox" type="checkbox" data-table="${escapeHtml(t.name)}" checked />
                  <span>${escapeHtml(t.name)}</span>
                </span>
                <span style="color: var(--text-secondary);">${formatNumber(t.row_count)} filas</span>
              </label>
            `).join('') : '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin tablas registradas</span>'}
          </div>
        </div>

        <div class="selective-details" data-ref="selective-details-s3">
          <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; display: block;">
            Prefijos de Almacenamiento S3
          </span>
          <div class="backup-selection-box" data-ref="s3-prefixes-selection-box" style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; border: 1px solid var(--border-color); padding: 8px; border-radius: var(--radius-sm);">
            ${s3Prefixes.length > 0 ? s3Prefixes.map((p: string) => `
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                <input class="field__checkbox" type="checkbox" data-prefix="${escapeHtml(p)}" checked />
                <span>${escapeHtml(p)}</span>
              </label>
            `).join('') : '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin prefijos registrados</span>'}
          </div>
        </div>
      </div>

      <div class="banner banner--danger is-hidden" data-ref="banner-create-error" style="margin-top: 14px;">
        <span data-ref="text-create-error"></span>
      </div>
    `;

    const selectType = bodyContainer.querySelector<HTMLSelectElement>('[data-ref="select-backup-type"]');
    const selectiveBox = bodyContainer.querySelector<HTMLElement>('[data-ref="selective-details-box"]');
    selectType?.addEventListener('change', () => {
      selectiveBox?.classList.toggle('is-hidden', selectType.value !== 'selective');
    });

    openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cancelar',
      confirmText: 'Ejecutar Respaldo',
      description: 'Generación manual de copias de seguridad de los motores de persistencia',
      onConfirm: async () => {
        const bannerError = bodyContainer.querySelector<HTMLElement>('[data-ref="banner-create-error"]');
        const textError = bodyContainer.querySelector<HTMLElement>('[data-ref="text-create-error"]');
        bannerError?.classList.add('is-hidden');

        const inputName = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-backup-name"]');
        const inputRetention = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-retention-days"]');
        const checkPinned = bodyContainer.querySelector<HTMLInputElement>('[data-ref="check-is-pinned"]');

        const checkMysql = bodyContainer.querySelector<HTMLInputElement>('[data-ref="engine-check-mysql"]');
        const checkCassandra = bodyContainer.querySelector<HTMLInputElement>('[data-ref="engine-check-cassandra"]');
        const checkS3 = bodyContainer.querySelector<HTMLInputElement>('[data-ref="engine-check-s3"]');
        const checkRedis = bodyContainer.querySelector<HTMLInputElement>('[data-ref="engine-check-redis"]');

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
          return false;
        }

        const isSelective = selectType?.value === 'selective';
        const selectedMysql: string[] = [];
        const selectedS3: string[] = [];

        if (isSelective) {
          bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="mysql-tables-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
            const tbl = c.getAttribute('data-table');
            if (tbl) selectedMysql.push(tbl);
          });
          bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="s3-prefixes-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
            const pfx = c.getAttribute('data-prefix');
            if (pfx) selectedS3.push(pfx);
          });
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
            await this.loadCatalog();
            return true;
          }
          if (bannerError && textError) {
            textError.textContent = res.error || 'Error al generar la copia de seguridad.';
            bannerError.classList.remove('is-hidden');
          }
          return false;
        } catch {
          if (bannerError && textError) {
            textError.textContent = 'Error inesperado de comunicación con el motor de copias.';
            bannerError.classList.remove('is-hidden');
          }
          return false;
        }
      },
      size: 'lg',
      title: 'Generar Copia de Seguridad',
    });
  }

  private openRestoreModal(backup: BackupItem): void {
    this.selectedBackupForRestore = backup;
    const meta = backup.metadata || {};
    const tables = meta.mysql?.tables || {};
    const tKeys = Object.keys(tables);
    const cassTables = meta.cassandra?.tables || {};
    const cKeys = Object.keys(cassTables);

    const s3Objs: Array<{ key: string }> = meta.s3?.objects || [];
    const prefixesSet = new Set<string>();
    for (const o of s3Objs) {
      const parts = o.key.split('/');
      if (parts.length > 1) prefixesSet.add(parts[0] + '/');
    }
    const pList = Array.from(prefixesSet);

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'backups-modal-form-content';
    bodyContainer.innerHTML = `
      <div class="banner banner--warning" style="margin-bottom: 16px;">
        <strong>Precaución Operativa:</strong> La restauración sobreescribirá los datos del sistema con el estado archivado en la copia seleccionada.
      </div>

      <div style="background: var(--bg-sunken); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 16px;">
        <div style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(backup.backup_name)}</div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; font-family: monospace;">
          UUID: ${escapeHtml(backup.uuid)} • Creado: ${formatDate(backup.created_at)} • Tamaño: ${formatBytes(backup.size_bytes)}
        </div>
      </div>

      <span style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; display: block;">
        Modo de Aplicación de la Restauración
      </span>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
        <label class="restore-mode-card" style="padding: 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="restore-mode" value="merge" checked data-ref="radio-restore-merge" />
            <span style="font-size: 0.8125rem; font-weight: 600;">Fusión / Upsert (Recomendado)</span>
          </div>
          <span style="font-size: 0.6875rem; color: var(--text-secondary);">Preserva registros existentes e inserta o actualiza por clave primaria.</span>
        </label>
        <label class="restore-mode-card" style="padding: 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); cursor: pointer; display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <input type="radio" name="restore-mode" value="replace" data-ref="radio-restore-replace" />
            <span style="font-size: 0.8125rem; font-weight: 600; color: #d32f2f;">Sobrescritura Total (Replace)</span>
          </div>
          <span style="font-size: 0.6875rem; color: var(--text-secondary);">Vacía las tablas antes de restaurar para replicar el respaldo. Destructivo.</span>
        </label>
      </div>

      <span style="font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px; display: block;">
        Selección Granular de Componentes a Restaurar
      </span>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Tablas MySQL (${tKeys.length})</span>
            <button type="button" class="component-button component-button--link" data-ref="btn-toggle-all-restore-mysql" style="font-size: 0.6875rem;">Alternar todas</button>
          </div>
          <div class="backup-selection-box" data-ref="restore-mysql-selection-box" style="max-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); padding: 8px; border-radius: var(--radius-sm);">
            ${tKeys.length > 0 ? tKeys.map((k) => `
              <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; cursor: pointer;">
                <span style="display: flex; align-items: center; gap: 6px;">
                  <input class="field__checkbox" type="checkbox" data-restore-mysql="${escapeHtml(k)}" checked />
                  <span>${escapeHtml(k)}</span>
                </span>
                <span style="color: var(--text-secondary);">${formatNumber(tables[k].row_count || 0)} filas</span>
              </label>
            `).join('') : '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin datos MySQL en este archivo</span>'}
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Tablas Cassandra (${cKeys.length})</span>
            <button type="button" class="component-button component-button--link" data-ref="btn-toggle-all-restore-cass" style="font-size: 0.6875rem;">Alternar todas</button>
          </div>
          <div class="backup-selection-box" data-ref="restore-cass-selection-box" style="max-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); padding: 8px; border-radius: var(--radius-sm);">
            ${cKeys.length > 0 ? cKeys.map((k) => `
              <label style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; cursor: pointer;">
                <span style="display: flex; align-items: center; gap: 6px;">
                  <input class="field__checkbox" type="checkbox" data-restore-cass="${escapeHtml(k)}" checked />
                  <span>${escapeHtml(k)}</span>
                </span>
                <span style="color: var(--text-secondary);">${formatNumber(cassTables[k].row_count || 0)} registros</span>
              </label>
            `).join('') : '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin datos Cassandra en este archivo</span>'}
          </div>
        </div>

        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-secondary);">Prefijos de Archivos S3 MinIO (${pList.length})</span>
            <button type="button" class="component-button component-button--link" data-ref="btn-toggle-all-restore-s3" style="font-size: 0.6875rem;">Alternar todos</button>
          </div>
          <div class="backup-selection-box" data-ref="restore-s3-selection-box" style="max-height: 100px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border-color); padding: 8px; border-radius: var(--radius-sm);">
            ${pList.length > 0 ? pList.map((p) => `
              <label style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; cursor: pointer;">
                <input class="field__checkbox" type="checkbox" data-restore-s3="${escapeHtml(p)}" checked />
                <span>${escapeHtml(p)}</span>
              </label>
            `).join('') : '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin archivos S3 en este respaldo</span>'}
          </div>
        </div>

        <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; font-weight: 500; cursor: pointer;">
          <input class="field__checkbox" data-ref="restore-check-redis" type="checkbox" />
          <span>Restaurar estado y llaves Redis</span>
        </label>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; margin-top: 14px; background: rgba(255, 152, 0, 0.08); padding: 10px; border-radius: var(--radius-sm); border: 1px solid rgba(255, 152, 0, 0.25);">
        <input class="field__checkbox" data-ref="check-pre-restore-snapshot" type="checkbox" checked />
        <span style="font-size: 0.8125rem; font-weight: 500; color: var(--text-primary);">
          Crear snapshot automático de seguridad antes de ejecutar la restauración (Recomendado)
        </span>
      </div>

      <div class="banner banner--danger is-hidden" data-ref="banner-restore-error" style="margin-top: 14px;">
        <span data-ref="text-restore-error"></span>
      </div>
    `;

    const btnToggleMysql = bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-all-restore-mysql"]');
    btnToggleMysql?.addEventListener('click', () => {
      const inputs = bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="restore-mysql-selection-box"] input[type="checkbox"]');
      const allChecked = Array.from(inputs).every((i) => i.checked);
      inputs.forEach((i) => { i.checked = !allChecked; });
    });

    const btnToggleCass = bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-all-restore-cass"]');
    btnToggleCass?.addEventListener('click', () => {
      const inputs = bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="restore-cass-selection-box"] input[type="checkbox"]');
      const allChecked = Array.from(inputs).every((i) => i.checked);
      inputs.forEach((i) => { i.checked = !allChecked; });
    });

    const btnToggleS3 = bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-all-restore-s3"]');
    btnToggleS3?.addEventListener('click', () => {
      const inputs = bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="restore-s3-selection-box"] input[type="checkbox"]');
      const allChecked = Array.from(inputs).every((i) => i.checked);
      inputs.forEach((i) => { i.checked = !allChecked; });
    });

    openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cancelar',
      confirmText: 'Ejecutar Restauración',
      description: `Restauración de datos archivados • ${backup.uuid.substring(0, 8)}...`,
      onConfirm: async () => {
        const bannerError = bodyContainer.querySelector<HTMLElement>('[data-ref="banner-restore-error"]');
        const textError = bodyContainer.querySelector<HTMLElement>('[data-ref="text-restore-error"]');
        const checkSnapshot = bodyContainer.querySelector<HTMLInputElement>('[data-ref="check-pre-restore-snapshot"]');
        const checkRedis = bodyContainer.querySelector<HTMLInputElement>('[data-ref="restore-check-redis"]');
        const isReplace = bodyContainer.querySelector<HTMLInputElement>('[data-ref="radio-restore-replace"]')?.checked;
        const mode = isReplace ? 'replace' : 'merge';

        bannerError?.classList.add('is-hidden');

        const selectedMysql: string[] = [];
        const selectedCass: string[] = [];
        const selectedS3: string[] = [];

        bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="restore-mysql-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
          const t = c.getAttribute('data-restore-mysql');
          if (t) selectedMysql.push(t);
        });

        bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="restore-cass-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
          const t = c.getAttribute('data-restore-cass');
          if (t) selectedCass.push(t);
        });

        bodyContainer.querySelectorAll<HTMLInputElement>('[data-ref="restore-s3-selection-box"] input[type="checkbox"]:checked').forEach((c) => {
          const p = c.getAttribute('data-restore-s3');
          if (p) selectedS3.push(p);
        });

        if (selectedMysql.length === 0 && selectedCass.length === 0 && selectedS3.length === 0 && !checkRedis?.checked) {
          if (bannerError && textError) {
            textError.textContent = 'Debes seleccionar al menos un componente para restaurar.';
            bannerError.classList.remove('is-hidden');
          }
          return false;
        }

        if (mode === 'replace') {
          const msg = 'ATENCIÓN: Has seleccionado el modo "Sobrescritura Total (Replace)". Las tablas seleccionadas serán vaciadas antes de insertar los datos del respaldo. ¿Deseas continuar?';
          if (!confirm(msg)) return false;
        }

        try {
          showToast('Descargando y verificando integridad del respaldo en S3...');
          const res = await postApi<any>('/api/backups/restore', {
            backup_uuid: backup.uuid,
            create_pre_restore_backup: Boolean(checkSnapshot?.checked),
            restore_mode: mode,
            selected_components: {
              cassandra_tables: selectedCass,
              mysql_tables: selectedMysql,
              redis: Boolean(checkRedis?.checked),
              s3_prefixes: selectedS3,
            },
          });

          if (res.success && res.data) {
            showToast('Restauración selectiva completada con éxito');
            this.switchTab('restores');
            return true;
          }
          if (bannerError && textError) {
            textError.textContent = res.error || 'Falla durante la restauración.';
            bannerError.classList.remove('is-hidden');
          }
          return false;
        } catch {
          if (bannerError && textError) {
            textError.textContent = 'Error de comunicación durante la restauración.';
            bannerError.classList.remove('is-hidden');
          }
          return false;
        }
      },
      size: 'lg',
      title: 'Restauración Granular Selectiva',
    });
  }

  private async openManifestModal(uuid: string): Promise<void> {
    const item = this.catalogItems.find((b) => b.uuid === uuid);
    showToast('Cargando manifiesto forense desde S3...');

    let manifestData: any = item?.metadata || {};
    try {
      const res = await getApi<any>(`/api/backups/catalog/${uuid}`);
      if (res.success && res.data) {
        manifestData = res.data.metadata || res.data;
      }
    } catch {
      // Usar datos existentes
    }

    const shaText = item?.sha256_checksum || 'No registrado';
    const sizeText = item ? formatBytes(item.size_bytes) : '-';
    const s3Path = item?.s3_archive_key ? `${item.s3_bucket}/${item.s3_archive_key}` : '-';

    const bodyHtml = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
        <div style="padding: 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div style="font-size: 11px; color: var(--text-secondary);">Estado de Integridad</div>
          <div style="font-weight: 600; margin-top: 4px;">
            <span class="component-badge component-badge--sm">${item?.sha256_checksum ? 'Verificado SHA-256' : 'Pendiente'}</span>
          </div>
        </div>
        <div style="padding: 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div style="font-size: 11px; color: var(--text-secondary);">Tamaño Comprimido</div>
          <div style="font-weight: 600; margin-top: 4px;">
            <span class="component-badge component-badge--sm component-badge--mono-bold">${sizeText}</span>
          </div>
        </div>
        <div style="padding: 10px; border: 1px solid var(--border-color); border-radius: var(--radius-sm);">
          <div style="font-size: 11px; color: var(--text-secondary);">Almacenamiento S3</div>
          <div style="font-weight: 600; margin-top: 4px; font-size: 11px; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(s3Path)}">
            ${escapeHtml(s3Path)}
          </div>
        </div>
      </div>

      <div style="margin-bottom: 6px; font-weight: 600; font-size: 13px;">Hash de Verificación SHA-256:</div>
      <div style="padding: 8px 12px; background: var(--bg-surface-secondary); border-radius: var(--radius-sm); font-family: monospace; font-size: 12px; word-break: break-all; margin-bottom: 16px;">
        ${escapeHtml(shaText)}
      </div>

      <div style="margin-bottom: 6px; font-weight: 600; font-size: 13px;">Contenido del Manifiesto JSON:</div>
      <pre class="audit-detail-json" style="max-height: 280px; overflow-y: auto;">${escapeHtml(JSON.stringify(manifestData, null, 2))}</pre>
    `;

    openModal({
      bodyHtml,
      cancelText: 'Cerrar',
      description: `UUID: ${uuid}`,
      showConfirm: false,
      size: 'lg',
      title: 'Manifiesto & Verificación de Integridad',
    });
  }

  private openForensicDetailsModal(titleText: string, data: any): void {
    const bodyHtml = `
      <pre class="audit-detail-json" style="max-height: 380px; overflow-y: auto;">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    `;

    openModal({
      bodyHtml,
      cancelText: 'Cerrar',
      description: 'Reporte forense detallado',
      showConfirm: false,
      size: 'lg',
      title: titleText,
    });
  }


  private async openScheduleModal(): Promise<void> {
    let settings = {
      backup_auto_enabled: '1',
      backup_default_retention_days: '30',
      backup_schedule_frequency: 'daily',
      backup_schedule_time: '03:00',
    };

    try {
      const res = await getApi<any>('/api/backups/schedule');
      if (res.success && res.data) {
        settings = { ...settings, ...res.data };
      }
    } catch {
      // Ignorar fallo inicial
    }

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'backups-modal-form-content';
    bodyContainer.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input class="field__checkbox" data-ref="schedule-check-enabled" type="checkbox" ${settings.backup_auto_enabled === '1' ? 'checked' : ''} />
          <span style="font-size: 0.875rem; font-weight: 500; color: var(--text-primary);">Ejecutar respaldos automáticos programados hacia S3 MinIO</span>
        </label>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <label class="field field--select" data-ref="field-schedule-frequency">
          <select class="field__input" data-ref="select-schedule-frequency">
            <option value="daily" ${settings.backup_schedule_frequency === 'daily' ? 'selected' : ''}>Diario (Cada 24 horas)</option>
            <option value="every_12h" ${settings.backup_schedule_frequency === 'every_12h' ? 'selected' : ''}>Cada 12 horas</option>
            <option value="every_6h" ${settings.backup_schedule_frequency === 'every_6h' ? 'selected' : ''}>Cada 6 horas</option>
            <option value="weekly" ${settings.backup_schedule_frequency === 'weekly' ? 'selected' : ''}>Semanal</option>
          </select>
          <span class="field__label">Frecuencia Programada</span>
        </label>

        <label class="field" data-ref="field-schedule-time">
          <input class="field__input" data-ref="input-schedule-time" type="time" value="${escapeHtml(settings.backup_schedule_time || '03:00')}" />
          <span class="field__label">Hora Programada (24h)</span>
        </label>
      </div>

      <label class="field" data-ref="field-default-retention" style="margin-top: 14px;">
        <input class="field__input" data-ref="input-default-retention" type="number" min="1" max="3650" value="${escapeHtml(settings.backup_default_retention_days || '30')}" />
        <span class="field__label">Días Predeterminados de Retención en S3</span>
      </label>

      <div class="banner banner--danger is-hidden" data-ref="banner-schedule-error" style="margin-top: 14px;">
        <span data-ref="text-schedule-error"></span>
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cancelar',
      confirmText: 'Guardar Política',
      description: 'Configuración de copias de seguridad automáticas y retención en S3',
      onConfirm: async () => {
        const checkEnabled = bodyContainer.querySelector<HTMLInputElement>('[data-ref="schedule-check-enabled"]');
        const selectFreq = bodyContainer.querySelector<HTMLSelectElement>('[data-ref="select-schedule-frequency"]');
        const inputTime = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-schedule-time"]');
        const inputRet = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-default-retention"]');
        const bannerError = bodyContainer.querySelector<HTMLElement>('[data-ref="banner-schedule-error"]');
        const textError = bodyContainer.querySelector<HTMLElement>('[data-ref="text-schedule-error"]');

        bannerError?.classList.add('is-hidden');

        try {
          const res = await putApi<any>('/api/backups/schedule', {
            backup_auto_enabled: checkEnabled?.checked ? '1' : '0',
            backup_default_retention_days: inputRet?.value || '30',
            backup_schedule_frequency: selectFreq?.value || 'daily',
            backup_schedule_time: inputTime?.value || '03:00',
          });

          if (res.success) {
            showToast('Política de retención y programación guardada con éxito');
            return true;
          }
          if (bannerError && textError) {
            textError.textContent = res.error || 'Error al guardar la configuración.';
            bannerError.classList.remove('is-hidden');
          }
          return false;
        } catch {
          if (bannerError && textError) {
            textError.textContent = 'Error inesperado al guardar la programación.';
            bannerError.classList.remove('is-hidden');
          }
          return false;
        }
      },
      size: 'md',
      title: 'Automatizar Copias de Seguridad',
    });
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (this.filterDropdownController) {
      this.filterDropdownController.destroy();
      this.filterDropdownController = null;
    }
    if (this.sectionDropdownController) {
      this.sectionDropdownController.destroy();
      this.sectionDropdownController = null;
    }
    this.catalogItems = [];
    this.restoreItems = [];
    this.inventoryData = null;
    this.selectedBackup = null;
    this.selectedBackupForRestore = null;
    this.selectedRestore = null;
  }
}

export async function createBackupsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/backups/backups.html');
  const controller = new BackupsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
