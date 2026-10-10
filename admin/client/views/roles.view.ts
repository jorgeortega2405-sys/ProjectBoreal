import { openModal } from '../components/modal.component.js';
import { getApi, putApi } from '../services/api.service.js';
import { checkAuth } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { DropdownController, escapeHtml, getEmptyIllustration, setupDropdown } from '../utils/dom.util.js';
import { hasPermission } from '../utils/permission.util.js';

interface RoleMatrixItem {
  category: 'platform' | 'finance' | 'operations' | 'support' | 'data' | 'engineering';
  description: string;
  display_name: string;
  id: number;
  is_system: number;
  name: string;
  permissions: string[];
  user_count: number;
}

interface PermissionDefinition {
  description: string;
  display_name: string;
  id?: number;
  module: string;
  name: string;
}

interface AdminUserWithRoles {
  created_at: string;
  email: string;
  id: number;
  is_active: number;
  last_login_at: string | null;
  name: string;
  permissions: string[];
  roles: string[];
  uuid: string;
}

const MODULE_LABELS: Record<string, string> = {
  bank_accounts: 'Cuentas Bancarias y SPEI',
  customers: 'Clientes, Participantes y Lista Negra',
  dashboard: 'Panel de Control y Analítica',
  giveaways: 'Sorteos, Catálogo y Ciclo Diario',
  orders: 'Pagos, Comprobantes y Conciliación',
  platform: 'Superusuario Global (*)',
  roles: 'Roles, Permisos y Cuentas IAM',
  winners: 'Ganadores y Entrega de Premios',
};

const CATEGORY_LABELS: Record<string, string> = {
  data: 'Data & Privacy',
  engineering: 'Engineering & SRE',
  finance: 'Finance & Billing',
  operations: 'Operations & Workflows',
  platform: 'Platform & IAM',
  support: 'Support & Success',
};

export class RolesController implements ViewController {
  private abortController: AbortController | null = null;
  private accessFilter: 'all' | 'with_access' | 'without_access' = 'all';
  private adminUsers: AdminUserWithRoles[] = [];
  private allPermissions: PermissionDefinition[] = [];
  private allRoles: RoleMatrixItem[] = [];
  private btnActionCopyKey: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionInspect: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnExportRoles: HTMLButtonElement | null = null;
  private btnManageAdmins: HTMLButtonElement | null = null;
  private btnPaginationNext: HTMLButtonElement | null = null;
  private btnPaginationPrev: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private categoryFilter = 'all';
  private container: HTMLElement;
  private currentPage = 1;
  private defaultActions: HTMLElement | null = null;
  private filterDropdownController: DropdownController | null = null;
  private inputPaginationPage: HTMLInputElement | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private pageSize = 15;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedRole: RoleMatrixItem | null = null;
  private totalPages = 1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-roles"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');
    this.btnManageAdmins = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-manage-admins"]');
    this.btnExportRoles = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-export-roles"]');
    this.btnPaginationPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-prev"]');
    this.btnPaginationNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-next"]');
    this.inputPaginationPage = this.container.querySelector<HTMLInputElement>('[data-ref="input-pagination-page"]');

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="roles-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="roles-selected-actions"]');
    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionInspect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-inspect"]');
    this.btnActionCopyKey = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-key"]');

    const filterDropdownWrapper = this.container.querySelector<HTMLElement>('[data-ref="filter-dropdown-wrapper"]');
    if (filterDropdownWrapper) {
      this.filterDropdownController = setupDropdown(filterDropdownWrapper, {
        isSelect: false,
        matchWidth: false,
        placement: 'bottom-end',
      });
    }

    this.bindEvents();
    renderIcons(this.container);

    requestAnimationFrame(() => {
      void this.loadInitialData();
    });
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
          this.btnClearSearch?.classList.add('is-hidden');
          if (this.searchQuery) {
            this.searchQuery = '';
            this.currentPage = 1;
            this.renderRoles();
          }
        }
      },
      { signal }
    );

    this.inputSearch?.addEventListener(
      'input',
      () => {
        const val = (this.inputSearch?.value || '').trim();
        this.btnClearSearch?.classList.toggle('is-hidden', val.length === 0);
        if (this.searchDebounceTimer) {
          clearTimeout(this.searchDebounceTimer);
        }
        this.searchDebounceTimer = setTimeout(() => {
          this.searchQuery = val.toLowerCase();
          this.currentPage = 1;
          this.renderRoles();
        }, 200);
      },
      { signal }
    );

    this.btnClearSearch?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.inputSearch) this.inputSearch.value = '';
        this.btnClearSearch?.classList.add('is-hidden');
        this.searchQuery = '';
        this.currentPage = 1;
        this.renderRoles();
        this.inputSearch?.focus();
      },
      { signal }
    );

    const categoryPills = this.container.querySelectorAll<HTMLButtonElement>('[data-category-pill]');
    categoryPills.forEach((pill) => {
      pill.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const cat = pill.getAttribute('data-category-pill') || 'all';
          this.setCategoryFilter(cat);
        },
        { signal }
      );
    });

    const dropdownCategoryBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-category-filter]');
    dropdownCategoryBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const cat = btn.getAttribute('data-category-filter') || 'all';
          this.setCategoryFilter(cat);
          this.filterDropdownController?.close();
        },
        { signal }
      );
    });

    const dropdownAccessBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-access-filter]');
    dropdownAccessBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          const access = (btn.getAttribute('data-access-filter') || 'all') as 'all' | 'with_access' | 'without_access';
          if (access !== this.accessFilter) {
            this.accessFilter = access;
            dropdownAccessBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-access-filter') === access));
            this.selectedRole = null;
            this.currentPage = 1;
            this.renderRoles();
            this.updateSelectionUi();
          }
          this.filterDropdownController?.close();
        },
        { signal }
      );
    });

    this.btnManageAdmins?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        void this.openManageAdminUsersModal();
      },
      { signal }
    );

    this.btnExportRoles?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.exportMatrixJson();
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
          this.renderRoles();
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
          this.renderRoles();
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
          this.renderRoles();
        }
      },
      { signal }
    );

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedRole = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionInspect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedRole) {
          this.openRoleInspectModal(this.selectedRole);
        }
      },
      { signal }
    );

    this.btnActionCopyKey?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedRole) {
          void navigator.clipboard.writeText(this.selectedRole.name);
          showToast(`Clave "${this.selectedRole.name}" copiada al portapapeles.`, 'success');
        }
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this.selectedRole) {
          this.selectedRole = null;
          this.updateSelectionUi();
        }
      },
      { signal }
    );
  }

  private setCategoryFilter(category: string): void {
    if (category !== this.categoryFilter) {
      this.categoryFilter = category;
      this.selectedRole = null;
      this.currentPage = 1;
      this.syncCategoryUi();
      this.renderRoles();
      this.updateSelectionUi();
    }
  }

  private syncCategoryUi(): void {
    const categoryPills = this.container.querySelectorAll<HTMLButtonElement>('[data-category-pill]');
    categoryPills.forEach((pill) => {
      pill.classList.toggle('is-active', pill.getAttribute('data-category-pill') === this.categoryFilter);
    });

    const dropdownCategoryBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-category-filter]');
    dropdownCategoryBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-category-filter') === this.categoryFilter);
    });
  }

  private resetFilters(): void {
    this.categoryFilter = 'all';
    this.accessFilter = 'all';
    this.searchQuery = '';
    this.selectedRole = null;
    this.currentPage = 1;

    if (this.inputSearch) this.inputSearch.value = '';
    this.btnClearSearch?.classList.add('is-hidden');

    const dropdownAccessBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-access-filter]');
    dropdownAccessBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-access-filter') === 'all'));

    this.syncCategoryUi();
    this.renderRoles();
    this.updateSelectionUi();
  }

  private async loadInitialData(): Promise<void> {
    try {
      const [matrixRes, permsRes, adminsRes] = await Promise.all([
        getApi<RoleMatrixItem[]>('/api/roles/matrix'),
        getApi<PermissionDefinition[]>('/api/roles/permissions'),
        getApi<AdminUserWithRoles[]>('/api/roles/admins'),
      ]);

      if (matrixRes.success && Array.isArray(matrixRes.data)) {
        this.allRoles = matrixRes.data;
      } else {
        showToast(matrixRes.error || 'No se pudo cargar la matriz de roles.', 'danger');
      }

      if (permsRes.success && Array.isArray(permsRes.data)) {
        this.allPermissions = permsRes.data;
      }

      if (adminsRes.success && Array.isArray(adminsRes.data)) {
        this.adminUsers = adminsRes.data;
      }

      if (this.selectedRole) {
        const fresh = this.allRoles.find((r) => r.name === this.selectedRole?.name);
        this.selectedRole = fresh || null;
      }

      this.updateKpisAndCounts();
      this.renderRoles();
      this.updateSelectionUi();
    } catch {
      showToast('Error de conexión al cargar roles y permisos.', 'danger');
    }
  }

  private updateKpisAndCounts(): void {
    const elTotalRoles = this.container.querySelector('[data-ref="kpi-total-roles"]');
    const elActiveRoles = this.container.querySelector('[data-ref="kpi-active-roles"]');
    const elTotalPerms = this.container.querySelector('[data-ref="kpi-total-permissions"]');
    const elAssignedAdmins = this.container.querySelector('[data-ref="kpi-assigned-admins"]');

    const totalRoles = this.allRoles.length;
    const activeRoles = this.allRoles.filter((r) => r.permissions.length > 0).length;
    const totalPerms = this.allPermissions.filter((p) => p.name !== '*').length || 19;
    const assignedAdmins = this.adminUsers.length;

    if (elTotalRoles) elTotalRoles.textContent = String(totalRoles);
    if (elActiveRoles) elActiveRoles.textContent = String(activeRoles);
    if (elTotalPerms) elTotalPerms.textContent = String(totalPerms);
    if (elAssignedAdmins) elAssignedAdmins.textContent = String(assignedAdmins);

    const countAll = this.container.querySelector('[data-ref="pill-count-all"]');
    if (countAll) countAll.textContent = String(totalRoles);

    const categories = ['platform', 'finance', 'operations', 'support', 'data', 'engineering'];
    categories.forEach((cat) => {
      const countEl = this.container.querySelector(`[data-ref="pill-count-${cat}"]`);
      if (countEl) {
        const c = this.allRoles.filter((r) => r.category === cat).length;
        countEl.textContent = String(c);
      }
    });
  }

  private getFilteredRoles(): RoleMatrixItem[] {
    let filtered = [...this.allRoles];

    if (this.categoryFilter !== 'all') {
      filtered = filtered.filter((r) => r.category === this.categoryFilter);
    }

    if (this.accessFilter === 'with_access') {
      filtered = filtered.filter((r) => r.permissions.length > 0);
    } else if (this.accessFilter === 'without_access') {
      filtered = filtered.filter((r) => r.permissions.length === 0);
    }

    if (this.searchQuery) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(this.searchQuery) ||
          r.display_name.toLowerCase().includes(this.searchQuery) ||
          r.description.toLowerCase().includes(this.searchQuery) ||
          r.category.toLowerCase().includes(this.searchQuery) ||
          r.permissions.some((p) => p.toLowerCase().includes(this.searchQuery))
      );
    }

    return filtered;
  }

  private updatePaginationUi(totalCount: number): void {
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

  private renderRoles(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tbody-roles"]');
    if (!tbody) return;

    const filtered = this.getFilteredRoles();
    this.updatePaginationUi(filtered.length);

    if (filtered.length === 0) {
      const isFiltered = this.categoryFilter !== 'all' || this.accessFilter !== 'all' || Boolean(this.searchQuery);
      tbody.innerHTML = `
        <tr class="winners-table__tr-empty">
          <td class="winners-table__td-empty" colspan="6">
            <div class="component-empty-state component-empty-state--table" data-ref="roles-empty-state">
              <div class="component-empty-state-graphic">
                ${getEmptyIllustration('search')}
              </div>
              <h2 class="component-empty-state-title">Sin roles coincidentes</h2>
              <p class="component-empty-state-desc">${
                isFiltered
                  ? 'No se encontraron roles corporativos con los filtros o criterios seleccionados.'
                  : 'No hay roles registrados en la plataforma.'
              }</p>
              ${
                isFiltered
                  ? `<div class="component-empty-state-actions">
                      <button type="button" class="component-button component-button--h36 component-button--secondary component-button--pill" data-ref="btn-empty-reset-roles">Restablecer Filtros</button>
                    </div>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
      renderIcons(tbody);

      const btnReset = tbody.querySelector<HTMLButtonElement>('[data-ref="btn-empty-reset-roles"]');
      btnReset?.addEventListener('click', (e) => {
        e.preventDefault();
        this.resetFilters();
      });
      return;
    }

    const startIndex = (this.currentPage - 1) * this.pageSize;
    const pageItems = filtered.slice(startIndex, startIndex + this.pageSize);

    tbody.innerHTML = pageItems.map((role) => this.buildRoleRowHtml(role)).join('');
    renderIcons(tbody);
    this.attachRowEvents(tbody);
  }

  private buildRoleRowHtml(role: RoleMatrixItem): string {
    const isSelected = this.selectedRole?.name === role.name;
    const isWildcard = role.permissions.includes('*') || role.name === 'SUPER_ADMIN';
    const hasPerms = role.permissions.length > 0;
    const categoryLabel = CATEGORY_LABELS[role.category] || role.category;

    let permsHtml = '';
    if (isWildcard) {
      permsHtml = `<span class="role-perm-chip role-perm-chip--wildcard">Acceso Total Global (${role.permissions.length})</span>`;
    } else if (!hasPerms) {
      permsHtml = `<span class="role-perm-chip role-perm-chip--empty">Sin permisos activos (En reserva)</span>`;
    } else {
      const visiblePerms = role.permissions.slice(0, 3);
      const remaining = role.permissions.length - visiblePerms.length;
      permsHtml =
        visiblePerms.map((p) => `<span class="role-perm-chip">${escapeHtml(p)}</span>`).join('') +
        (remaining > 0 ? `<span class="role-perm-more">+${remaining} más</span>` : '');
    }

    const statusHtml = hasPerms
      ? `<span class="role-status-badge role-status-badge--active">Habilitado (${role.permissions.length})</span>`
      : `<span class="role-status-badge role-status-badge--standby">En Reserva</span>`;

    return `
      <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-ref="tr-role-${escapeHtml(role.name)}" data-role-name="${escapeHtml(role.name)}">
        <td class="winners-table__td">
          <div class="role-cell-identity">
            <span class="role-cell-identity__title">${escapeHtml(role.display_name)}</span>
            <span class="role-cell-identity__code">${escapeHtml(role.name)}</span>
          </div>
        </td>
        <td class="winners-table__td">
          <span class="role-category-badge role-category-badge--${escapeHtml(role.category)}">${escapeHtml(categoryLabel)}</span>
        </td>
        <td class="winners-table__td">
          <span class="role-cell-desc">${escapeHtml(role.description)}</span>
        </td>
        <td class="winners-table__td">
          <span class="component-badge component-badge--sm component-badge--mono-bold">${role.user_count} admin${role.user_count === 1 ? '' : 's'}</span>
        </td>
        <td class="winners-table__td">
          <div class="role-perms-preview">
            ${permsHtml}
          </div>
        </td>
        <td class="winners-table__td">
          ${statusHtml}
        </td>
      </tr>
    `;
  }

  private attachRowEvents(tbody: HTMLElement): void {
    const rows = tbody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const roleName = row.getAttribute('data-role-name');
      if (!roleName) return;
      const role = this.allRoles.find((r) => r.name === roleName);
      if (!role) return;

      row.addEventListener('click', () => {
        this.toggleRoleSelection(role);
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.openRoleInspectModal(role);
      });
    });
  }

  private toggleRoleSelection(role: RoleMatrixItem): void {
    if (this.selectedRole?.name === role.name) {
      this.selectedRole = null;
    } else {
      this.selectedRole = role;
    }
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedRole !== null;
    this.defaultActions?.classList.toggle('is-hidden', isSelected);
    this.selectedActions?.classList.toggle('is-hidden', !isSelected);

    const rows = this.container.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const isThisSelected = row.getAttribute('data-role-name') === this.selectedRole?.name;
      row.classList.toggle('is-selected', isThisSelected);
    });
  }

  private openRoleInspectModal(role: RoleMatrixItem): void {
    const canManage = hasPermission('roles:manage') && role.name !== 'SUPER_ADMIN';
    const isSuperAdmin = role.name === 'SUPER_ADMIN';
    const selectedCodes = new Set<string>(role.permissions);

    const groupedByModule = new Map<string, PermissionDefinition[]>();
    const catalogPerms = this.allPermissions.filter((p) => p.name !== '*');

    for (const perm of catalogPerms) {
      const list = groupedByModule.get(perm.module) || [];
      list.push(perm);
      groupedByModule.set(perm.module, list);
    }

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'role-modal-layout';

    const categoryLabel = CATEGORY_LABELS[role.category] || role.category;

    const modulesHtml = Array.from(groupedByModule.entries())
      .map(([moduleKey, perms]) => {
        const moduleTitle = MODULE_LABELS[moduleKey] || moduleKey.toUpperCase();
        const optionsHtml = perms
          .map((p) => {
            const checked = isSuperAdmin || selectedCodes.has(p.name);
            return `
              <label class="role-perm-option ${checked ? 'is-checked' : ''} ${!canManage ? 'is-disabled' : ''}" data-ref="label-perm-${escapeHtml(p.name)}">
                <input class="role-perm-option__checkbox" data-ref="check-perm-${escapeHtml(p.name)}" data-perm-code="${escapeHtml(p.name)}" type="checkbox" ${checked ? 'checked' : ''} ${!canManage ? 'disabled' : ''} />
                <div class="role-perm-option__info">
                  <span class="role-perm-option__code">${escapeHtml(p.name)} • ${escapeHtml(p.display_name)}</span>
                  <span class="role-perm-option__desc">${escapeHtml(p.description)}</span>
                </div>
              </label>
            `;
          })
          .join('');

        return `
          <div class="role-module-group" data-ref="group-module-${escapeHtml(moduleKey)}">
            <div class="role-module-group__header">
              <span class="role-module-group__title">${escapeHtml(moduleTitle)}</span>
              <span class="role-module-group__count">${perms.length} permisos</span>
            </div>
            <div class="role-module-group__list">
              ${optionsHtml}
            </div>
          </div>
        `;
      })
      .join('');

    bodyContainer.innerHTML = `
      <div class="role-modal-meta">
        <div class="role-modal-meta-box">
          <span class="role-modal-meta-label">Clave Técnica</span>
          <strong class="role-modal-meta-val">${escapeHtml(role.name)}</strong>
        </div>
        <div class="role-modal-meta-box">
          <span class="role-modal-meta-label">Categoría</span>
          <strong class="role-modal-meta-val">${escapeHtml(categoryLabel)}</strong>
        </div>
        <div class="role-modal-meta-box">
          <span class="role-modal-meta-label">Cuentas Asignadas</span>
          <strong class="role-modal-meta-val">${role.user_count} operador${role.user_count === 1 ? '' : 'es'}</strong>
        </div>
        <div class="role-modal-meta-box">
          <span class="role-modal-meta-label">Permisos Activos</span>
          <strong class="role-modal-meta-val" data-ref="modal-active-perms-count">${isSuperAdmin ? '19 (Global)' : String(selectedCodes.size)}</strong>
        </div>
      </div>

      ${
        canManage
          ? `
        <div class="role-modal-toolbar">
          <h4 class="role-modal-toolbar__title">Matriz de Alcances Granulares (PBAC)</h4>
          <div class="role-modal-toolbar__actions">
            <button type="button" class="component-button component-button--h32 component-button--secondary" data-ref="btn-select-all-perms">Seleccionar Todos</button>
            <button type="button" class="component-button component-button--h32 component-button--secondary" data-ref="btn-clear-all-perms">Limpiar Todos</button>
          </div>
        </div>
      `
          : `
        <div class="role-modal-toolbar">
          <h4 class="role-modal-toolbar__title">${
            isSuperAdmin
              ? 'El rol SUPER_ADMIN posee acceso global total a todos los módulos'
              : 'Vista de Auditoría de Permisos (Modo Lectura)'
          }</h4>
        </div>
      `
      }

      ${modulesHtml}
    `;

    const countEl = bodyContainer.querySelector<HTMLElement>('[data-ref="modal-active-perms-count"]');
    const checkboxes = bodyContainer.querySelectorAll<HTMLInputElement>('[data-perm-code]');

    const syncChecksUi = () => {
      checkboxes.forEach((cb) => {
        const code = cb.getAttribute('data-perm-code') || '';
        const isChecked = selectedCodes.has(code);
        cb.checked = isChecked;
        const label = cb.closest('.role-perm-option');
        label?.classList.toggle('is-checked', isChecked);
      });
      if (countEl) {
        countEl.textContent = String(selectedCodes.size);
      }
    };

    if (canManage) {
      checkboxes.forEach((cb) => {
        cb.addEventListener('change', () => {
          const code = cb.getAttribute('data-perm-code') || '';
          if (!code) return;
          if (cb.checked) {
            selectedCodes.add(code);
          } else {
            selectedCodes.delete(code);
          }
          const label = cb.closest('.role-perm-option');
          label?.classList.toggle('is-checked', cb.checked);
          if (countEl) {
            countEl.textContent = String(selectedCodes.size);
          }
        });
      });

      const btnSelectAll = bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-select-all-perms"]');
      const btnClearAll = bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-clear-all-perms"]');

      btnSelectAll?.addEventListener('click', (e) => {
        e.preventDefault();
        catalogPerms.forEach((p) => selectedCodes.add(p.name));
        syncChecksUi();
      });

      btnClearAll?.addEventListener('click', (e) => {
        e.preventDefault();
        selectedCodes.clear();
        syncChecksUi();
      });
    }

    openModal({
      bodyHtml: bodyContainer,
      cancelText: canManage ? 'Cancelar' : 'Cerrar',
      confirmClass: 'component-button--black',
      confirmText: 'Guardar Permisos',
      description: role.description,
      onConfirm: canManage
        ? async () => {
            const updatedPermissions = Array.from(selectedCodes);
            const res = await putApi<RoleMatrixItem>(`/api/roles/${encodeURIComponent(role.name)}/permissions`, {
              permissions: updatedPermissions,
            });
            if (res.success) {
              showToast(`Permisos del rol ${role.display_name} actualizados exitosamente.`, 'success');
              await checkAuth(true);
              await this.loadInitialData();
              return true;
            } else {
              showToast(res.error || 'No se pudieron actualizar los permisos del rol.', 'danger');
              return false;
            }
          }
        : null,
      showConfirm: canManage,
      size: 'lg',
      title: `${role.display_name} (${role.name})`,
    });
  }

  private async openManageAdminUsersModal(): Promise<void> {
    const canManage = hasPermission('roles:manage');
    const adminsRes = await getApi<AdminUserWithRoles[]>('/api/roles/admins');
    if (adminsRes.success && Array.isArray(adminsRes.data)) {
      this.adminUsers = adminsRes.data;
    }

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'admin-accounts-modal-list';

    if (this.adminUsers.length === 0) {
      bodyContainer.innerHTML = `<p class="customer-empty-orders-text">No se encontraron cuentas administrativas registradas.</p>`;
    } else {
      bodyContainer.innerHTML = this.adminUsers
        .map((admin) => {
          const assignedSet = new Set<string>(admin.roles);
          const roleChecksHtml = this.allRoles
            .map((r) => {
              const isChecked = assignedSet.has(r.name);
              return `
                <label class="admin-role-check-item ${isChecked ? 'is-checked' : ''}" data-ref="label-admin-role-${escapeHtml(admin.uuid)}-${escapeHtml(r.name)}">
                  <input class="role-perm-option__checkbox" data-ref="check-admin-role-${escapeHtml(admin.uuid)}-${escapeHtml(r.name)}" data-admin-uuid="${escapeHtml(admin.uuid)}" data-role-code="${escapeHtml(r.name)}" type="checkbox" ${isChecked ? 'checked' : ''} ${!canManage ? 'disabled' : ''} />
                  <div class="admin-role-check-item__info">
                    <span class="admin-role-check-item__title" title="${escapeHtml(r.display_name)}">${escapeHtml(r.display_name)}</span>
                    <span class="admin-role-check-item__code">${escapeHtml(r.name)}</span>
                  </div>
                </label>
              `;
            })
            .join('');

          return `
            <div class="admin-account-card" data-ref="card-admin-${escapeHtml(admin.uuid)}">
              <div class="admin-account-card__header">
                <div class="admin-account-card__identity">
                  <span class="admin-account-card__name">${escapeHtml(admin.name)}</span>
                  <span class="admin-account-card__email">${escapeHtml(admin.email)}</span>
                </div>
                ${
                  canManage
                    ? `<button type="button" class="component-button component-button--h34 component-button--black" data-ref="btn-save-admin-roles-${escapeHtml(admin.uuid)}" data-save-admin-uuid="${escapeHtml(admin.uuid)}">Guardar Roles</button>`
                    : `<span class="component-badge component-badge--sm">${admin.roles.length} roles</span>`
                }
              </div>
              <div class="admin-account-card__roles-grid" data-ref="grid-admin-roles-${escapeHtml(admin.uuid)}">
                ${roleChecksHtml}
              </div>
            </div>
          `;
        })
        .join('');
    }

    const roleCheckInputs = bodyContainer.querySelectorAll<HTMLInputElement>('[data-role-code]');
    roleCheckInputs.forEach((input) => {
      input.addEventListener('change', () => {
        const label = input.closest('.admin-role-check-item');
        label?.classList.toggle('is-checked', input.checked);
      });
    });

    const saveButtons = bodyContainer.querySelectorAll<HTMLButtonElement>('[data-save-admin-uuid]');
    saveButtons.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const adminUuid = btn.getAttribute('data-save-admin-uuid');
        if (!adminUuid) return;

        const checkedInputs = bodyContainer.querySelectorAll<HTMLInputElement>(
          `input[data-admin-uuid="${adminUuid}"]:checked`
        );
        const selectedRoleCodes = Array.from(checkedInputs)
          .map((el) => el.getAttribute('data-role-code') || '')
          .filter(Boolean);

        btn.disabled = true;
        const res = await putApi(`/api/roles/admins/${encodeURIComponent(adminUuid)}/roles`, {
          roles: selectedRoleCodes,
        });
        btn.disabled = false;

        if (res.success) {
          showToast('Roles de la cuenta actualizados exitosamente.', 'success');
          await checkAuth(true);
          await this.loadInitialData();
        } else {
          showToast(res.error || 'Error al actualizar los roles del administrador.', 'danger');
        }
      });
    });

    openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cerrar',
      description: 'Vincula uno o múltiples roles corporativos a cada cuenta administrativa (admin_user_roles).',
      showConfirm: false,
      size: 'lg',
      title: 'Asignación de Roles a Cuentas Administrativas',
    });
  }

  private exportMatrixJson(): void {
    const payload = {
      exportedAt: new Date().toISOString(),
      permissionsCount: this.allPermissions.length,
      roles: this.allRoles,
      rolesCount: this.allRoles.length,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `boreal-roles-matrix-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Matriz de roles y permisos exportada en JSON.', 'success');
  }

  destroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    this.filterDropdownController?.destroy();
    this.filterDropdownController = null;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createRolesView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/roles/roles.html');
  const controller = new RolesController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
