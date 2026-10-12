import { openModal } from '../components/modal.component.js';
import { deleteApi, getApi, postApi, putApi } from '../services/api.service.js';
import { getCurrentUser } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { generateAvatarDataUri } from '../utils/avatar.util.js';
import { DropdownController, setupDropdown } from '../utils/dom.util.js';
import { hasPermission } from '../utils/permission.util.js';

interface AdminRole {
  description: string;
  id: number;
  name: string;
}

interface AdminItem {
  created_at: string;
  effective_permissions: string[];
  email: string;
  id: number;
  is_active: number | boolean;
  last_login_at: string | null;
  name: string;
  roles: AdminRole[];
  updated_at: string;
}

interface RoleItem {
  admin_count: number;
  created_at: string;
  description: string;
  id: number;
  name: string;
  permissions: string[];
  updated_at: string;
}

interface PermissionItem {
  description: string;
  id: number;
  name: string;
}

interface ActiveSessionItem {
  createdAt: string;
  email: string;
  id: number;
  ip: string;
  isCurrent?: boolean;
  name: string;
  permissions: string[];
  roles: string[];
  token: string;
  ttlSeconds?: number;
  userAgent: string;
  uuid?: string;
}

interface SecurityKpis {
  activeAdmins: number;
  activeSessions: number;
  totalAdmins: number;
  totalRoles: number;
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Nunca';
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

function getPermissionCategory(perm: string): string {
  const prefix = perm.split(':')[0] || 'general';
  switch (prefix) {
    case 'dashboard':
      return 'Tableros y Analítica';
    case 'giveaways':
      return 'Sorteos y Rifas';
    case 'orders':
    case 'payments':
      return 'Pagos y Órdenes';
    case 'bank_accounts':
      return 'Cuentas Bancarias';
    case 'customers':
      return 'Clientes y Participantes';
    case 'winners':
      return 'Ganadores y Premios';
    case 'hr':
      return 'Recursos Humanos';
    case 'admins':
      return 'Administradores y PBAC';
    case 'audit':
      return 'Auditoría Forense Cassandra';
    case 'backups':
      return 'Copias de Seguridad y S3';
    default:
      return 'Otras Funciones';
  }
}

export class AdminsController implements ViewController {
  private abortController: AbortController | null = null;
  private activeTab: 'admins' | 'roles' | 'sessions' = 'admins';
  private adminsList: AdminItem[] = [];
  private availableRoles: RoleItem[] = [];
  private btnClearSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private defaultActions: HTMLElement | null = null;
  private filterDropdownController: DropdownController | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private permissionsCatalogue: PermissionItem[] = [];
  private roleFilter = 'all';
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private sectionDropdownController: DropdownController | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedAdmin: AdminItem | null = null;
  private selectedSession: ActiveSessionItem | null = null;
  private sessionsAdminFilter = 'all';
  private sessionsList: ActiveSessionItem[] = [];
  private statusFilter = 'all';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.setupDropdowns();
    this.bindEvents();
    renderIcons(this.container);
    await Promise.all([this.loadAdmins(), this.loadRoles(), this.loadSessions()]);
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
    this.adminsList = [];
    this.availableRoles = [];
    this.permissionsCatalogue = [];
    this.sessionsList = [];
    this.selectedAdmin = null;
    this.selectedSession = null;
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
    const sectionButtons = this.container.querySelectorAll<HTMLButtonElement>('[data-section]');
    sectionButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sec = btn.getAttribute('data-section') as 'admins' | 'roles' | 'sessions';
        if (sec) {
          sectionButtons.forEach((b) => b.classList.toggle('is-active', b === btn));
          this.sectionDropdownController?.close();
          this.switchTab(sec);
        }
      });
    });

    const statusBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-status-filter]');
    statusBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const st = btn.getAttribute('data-status-filter') || 'all';
        this.statusFilter = st;
        statusBtns.forEach((b) => b.classList.toggle('is-active', b === btn));
        this.filterDropdownController?.close();
        this.renderAdminsTable();
      });
    });

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-admins"]');
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
          this.renderAdminsTable();
        }
      }
    });

    this.inputSearch?.addEventListener('input', () => {
      const val = this.inputSearch?.value.trim() || '';
      this.btnClearSearch?.classList.toggle('is-hidden', val.length === 0);
      if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.searchQuery = val.toLowerCase();
        this.renderAdminsTable();
      }, 250);
    });

    this.btnClearSearch?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.inputSearch) this.inputSearch.value = '';
      this.btnClearSearch?.classList.add('is-hidden');
      this.searchQuery = '';
      this.renderAdminsTable();
    });

    const btnRefreshHeader = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-admins"]');
    btnRefreshHeader?.addEventListener('click', () => this.refreshAll());

    const btnCreateAdmin = this.container.querySelector<HTMLElement>('[data-ref="btn-create-admin"]');
    btnCreateAdmin?.addEventListener('click', () => this.openCreateAdminModal());

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="admins-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="admins-selected-actions"]');

    const btnDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    btnDeselect?.addEventListener('click', (e) => {
      e.preventDefault();
      this.deselectAll();
    });

    const btnEdit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-edit"]');
    btnEdit?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedAdmin) this.openEditAdminModal(this.selectedAdmin);
    });

    const btnToggleStatus = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-toggle-status"]');
    btnToggleStatus?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedAdmin) void this.toggleAdminStatus(this.selectedAdmin);
    });

    const btnDelete = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-delete"]');
    btnDelete?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedAdmin) this.openDeleteAdminModal(this.selectedAdmin);
    });

    const btnRevokeSession = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-revoke-session"]');
    btnRevokeSession?.addEventListener('click', (e) => {
      e.preventDefault();
      if (this.selectedSession) this.openRevokeModal(this.selectedSession);
    });
  }

  private deselectAll(): void {
    this.selectedAdmin = null;
    this.selectedSession = null;
    this.updateSelectionUi();
  }

  private updateSelectionUi(): void {
    const isSelected = this.selectedAdmin !== null || this.selectedSession !== null;
    this.defaultActions?.classList.toggle('is-hidden', isSelected);
    this.selectedActions?.classList.toggle('is-hidden', !isSelected);

    const btnEdit = this.container.querySelector<HTMLElement>('[data-ref="btn-action-edit"]');
    const btnToggleStatus = this.container.querySelector<HTMLElement>('[data-ref="btn-action-toggle-status"]');
    const btnDelete = this.container.querySelector<HTMLElement>('[data-ref="btn-action-delete"]');
    const btnRevoke = this.container.querySelector<HTMLElement>('[data-ref="btn-action-revoke-session"]');

    if (this.selectedAdmin) {
      btnEdit?.classList.remove('is-hidden');
      btnToggleStatus?.classList.remove('is-hidden');
      btnDelete?.classList.remove('is-hidden');
      btnRevoke?.classList.add('is-hidden');

      const iconToggle = this.container.querySelector<SVGUseElement>('[data-ref="icon-toggle-status"] use');
      if (iconToggle) {
        iconToggle.setAttribute('href', this.selectedAdmin.is_active ? '/icons.svg#block' : '/icons.svg#check_circle');
      }
      btnToggleStatus?.setAttribute('data-tooltip', this.selectedAdmin.is_active ? 'Desactivar cuenta' : 'Activar cuenta');
      btnToggleStatus?.setAttribute('aria-label', this.selectedAdmin.is_active ? 'Desactivar cuenta' : 'Activar cuenta');
    } else if (this.selectedSession) {
      btnEdit?.classList.add('is-hidden');
      btnToggleStatus?.classList.add('is-hidden');
      btnDelete?.classList.add('is-hidden');
      btnRevoke?.classList.remove('is-hidden');
    }

    const rows = this.container.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((r) => {
      const adminId = r.getAttribute('data-admin-id');
      const sessionToken = r.getAttribute('data-session-token');
      const isSel = (this.selectedAdmin && adminId === String(this.selectedAdmin.id)) ||
                    (this.selectedSession && sessionToken === this.selectedSession.token);
      r.classList.toggle('is-selected', Boolean(isSel));
    });
  }

  private switchTab(tab: 'admins' | 'roles' | 'sessions'): void {
    this.deselectAll();
    this.activeTab = tab;

    const sectionButtons = this.container.querySelectorAll<HTMLElement>('[data-section]');
    sectionButtons.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-section') === tab));

    const paneAdmins = this.container.querySelector<HTMLElement>('[data-ref="pane-admins"]');
    const paneRoles = this.container.querySelector<HTMLElement>('[data-ref="pane-roles"]');
    const paneSessions = this.container.querySelector<HTMLElement>('[data-ref="pane-sessions"]');

    paneAdmins?.classList.toggle('is-hidden', tab !== 'admins');
    paneRoles?.classList.toggle('is-hidden', tab !== 'roles');
    paneSessions?.classList.toggle('is-hidden', tab !== 'sessions');

    if (tab === 'sessions') {
      this.loadSessions();
    }
  }

  private async refreshAll(): Promise<void> {
    await Promise.all([this.loadAdmins(), this.loadRoles(), this.loadSessions()]);
    showToast('Directorio de seguridad actualizado', 'info');
  }

  private async loadAdmins(): Promise<void> {
    try {
      const res = await getApi<{ admins: AdminItem[]; kpis: SecurityKpis }>('/api/admins');
      if (res?.data) {
        this.adminsList = res.data.admins || [];
        this.updateKpis(res.data.kpis);
        this.populateRoleFilter();
        this.renderAdminsTable();
      }
    } catch (_e) {
      showToast('Error al cargar directorio de administradores', 'danger');
    }
  }

  private async loadRoles(): Promise<void> {
    try {
      const res = await getApi<{ catalogue: PermissionItem[]; roles: RoleItem[] }>('/api/admins/roles');
      if (res?.data) {
        this.availableRoles = res.data.roles || [];
        this.permissionsCatalogue = res.data.catalogue || [];
        this.populateRoleFilter();
        this.renderRolesGrid();
      }
    } catch (_e) {
      showToast('Error al cargar roles y permisos PBAC', 'danger');
    }
  }

  private async loadSessions(): Promise<void> {
    try {
      const res = await getApi<{ sessions: ActiveSessionItem[] }>('/api/admins/sessions');
      if (res?.data) {
        this.sessionsList = res.data.sessions || [];
        this.populateSessionsAdminFilter();
        this.renderSessionsTable();
      }
    } catch (_e) {
      showToast('Error al cargar sesiones en memoria', 'danger');
    }
  }

  private updateKpis(kpis?: SecurityKpis): void {
    if (!kpis) return;
    const totalEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-total-admins"]');
    const activeEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-active-admins"]');
    const sessionsEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-active-sessions"]');
    const rolesEl = this.container.querySelector<HTMLElement>('[data-ref="kpi-val-roles-count"]');

    if (totalEl) totalEl.textContent = String(kpis.totalAdmins ?? this.adminsList.length);
    if (activeEl) activeEl.textContent = String(kpis.activeAdmins ?? 0);
    if (sessionsEl) sessionsEl.textContent = String(kpis.activeSessions ?? 0);
    if (rolesEl) rolesEl.textContent = String(kpis.totalRoles ?? this.availableRoles.length);
  }

  private populateRoleFilter(): void {
    const list = this.container.querySelector<HTMLElement>('[data-ref="filter-roles-list"]');
    if (!list) return;

    list.innerHTML = `
      <button type="button" class="menu-item ${this.roleFilter === 'all' ? 'is-active' : ''}" data-ref="btn-filter-role-all" data-role-filter="all">
        <span class="menu-item__text">Todos los roles</span>
      </button>
      ${this.availableRoles
        .map(
          (r) => `
        <button type="button" class="menu-item ${this.roleFilter === r.name ? 'is-active' : ''}" data-role-filter="${escapeHtml(r.name)}">
          <span class="menu-item__text">${escapeHtml(r.name)} (${r.admin_count})</span>
        </button>
      `
        )
        .join('')}
    `;

    list.querySelectorAll<HTMLButtonElement>('[data-role-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const rf = btn.getAttribute('data-role-filter') || 'all';
        this.roleFilter = rf;
        list.querySelectorAll('[data-role-filter]').forEach((b) => b.classList.toggle('is-active', b === btn));
        this.filterDropdownController?.close();
        this.renderAdminsTable();
      });
    });
  }

  private populateSessionsAdminFilter(): void {
    const select = this.container.querySelector<HTMLSelectElement>('[data-ref="select-sessions-admin-filter"]');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="all">Todas las sesiones de operadores</option>';
    const seen = new Set<number>();
    for (const s of this.sessionsList) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        const opt = document.createElement('option');
        opt.value = String(s.id);
        opt.textContent = `${s.name} (${s.email})`;
        select.appendChild(opt);
      }
    }
    if (currentVal) select.value = currentVal;
  }

  private renderAdminsTable(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="admins-table-body"]');
    if (!tbody) return;

    let filtered = this.adminsList;

    if (this.searchQuery) {
      filtered = filtered.filter(
        (a) =>
          a.name.toLowerCase().includes(this.searchQuery) ||
          a.email.toLowerCase().includes(this.searchQuery)
      );
    }

    if (this.roleFilter !== 'all') {
      filtered = filtered.filter((a) => a.roles.some((r) => r.name === this.roleFilter));
    }

    if (this.statusFilter === 'active') {
      filtered = filtered.filter((a) => Boolean(a.is_active));
    } else if (this.statusFilter === 'inactive') {
      filtered = filtered.filter((a) => !a.is_active);
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr class="winners-table__tr winners-tr--empty">
          <td class="winners-table__td winners-td--empty" colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            No se encontraron administradores con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = filtered
      .map((admin) => {
        const isSelected = this.selectedAdmin?.id === admin.id;
        const isActive = Boolean(admin.is_active);
        const roleNames = admin.roles.length > 0 ? admin.roles.map((r) => r.name).join(', ') : 'Sin Rol';
        const permCount = admin.effective_permissions ? admin.effective_permissions.length : 0;

        return `
          <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-admin-id="${admin.id}">
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml(admin.name)}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml(roleNames)}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${permCount} permisos</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${isActive ? 'Activo' : 'Inactivo'}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${admin.last_login_at ? formatDate(admin.last_login_at) : 'Nunca'}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${formatDate(admin.created_at)}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.innerHTML = rowsHtml;
    renderIcons(tbody);

    const rows = tbody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const id = parseInt(row.getAttribute('data-admin-id') || '0', 10);
      const admin = this.adminsList.find((a) => a.id === id);
      if (!admin) return;

      row.addEventListener('click', () => {
        if (this.selectedAdmin?.id === admin.id) {
          this.selectedAdmin = null;
        } else {
          this.selectedAdmin = admin;
          this.selectedSession = null;
        }
        this.updateSelectionUi();
      });

      row.addEventListener('dblclick', () => {
        this.openEditAdminModal(admin);
      });
    });
  }

  private renderRolesGrid(): void {
    const grid = this.container.querySelector<HTMLElement>('[data-ref="roles-grid"]');
    if (!grid) return;

    if (this.availableRoles.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">No hay roles configurados.</p>';
      return;
    }

    grid.innerHTML = this.availableRoles
      .map((role) => {
        const permsHtml =
          role.permissions && role.permissions.length > 0
            ? role.permissions.map((p) => `<span class="admins-perm-pill">${escapeHtml(p)}</span>`).join('')
            : '<span style="font-size: 0.75rem; color: var(--text-secondary);">Sin permisos asignados</span>';

        return `
          <div class="admins-role-card">
            <div class="admins-role-card__header">
              <div>
                <h3 class="admins-role-card__name">${escapeHtml(role.name)}</h3>
                <p class="admins-role-card__desc">${escapeHtml(role.description || 'Contenedor PBAC')}</p>
              </div>
              <span class="admins-badge admins-badge--neutral">
                ${role.admin_count} operador${role.admin_count === 1 ? '' : 'es'}
              </span>
            </div>

            <div class="admins-role-card__perms-box">
              ${permsHtml}
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto;">
              <span style="font-size: 0.75rem; color: var(--text-secondary);">
                ${role.permissions ? role.permissions.length : 0} privilegios
              </span>
              <button type="button" class="component-button component-button--h32 component-button--secondary" data-action="edit-role-perms" data-role-id="${role.id}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#security"></use></svg>
                <span>Gestionar Permisos</span>
              </button>
            </div>
          </div>
        `;
      })
      .join('');

    renderIcons(grid);

    grid.querySelectorAll<HTMLButtonElement>('button[data-action="edit-role-perms"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const roleId = parseInt(btn.dataset.roleId || '0', 10);
        const role = this.availableRoles.find((r) => r.id === roleId);
        if (role) {
          this.openRoleModal(role);
        }
      });
    });
  }

  private renderSessionsTable(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="sessions-table-body"]');
    if (!tbody) return;

    let filtered = this.sessionsList;
    if (this.sessionsAdminFilter !== 'all') {
      const adminId = parseInt(this.sessionsAdminFilter, 10);
      filtered = filtered.filter((s) => s.id === adminId);
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr class="winners-table__tr winners-tr--empty">
          <td class="winners-table__td winners-td--empty" colspan="6" style="text-align: center; padding: 48px 16px; color: var(--text-secondary);">
            No hay sesiones activas en Redis para el filtro seleccionado.
          </td>
        </tr>
      `;
      return;
    }

    const currentUser = getCurrentUser();

    tbody.innerHTML = filtered
      .map((s) => {
        const isSelected = this.selectedSession?.token === s.token;
        const isCurrent = s.isCurrent || (currentUser && currentUser.email === s.email && s.ip === '127.0.0.1');
        const badgeCurrent = isCurrent ? 'Sesión Actual' : 'Remota';

        const ttlText = s.ttlSeconds
          ? `${Math.floor(s.ttlSeconds / 3600)}h ${Math.floor((s.ttlSeconds % 3600) / 60)}m`
          : '24 horas';

        return `
          <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-session-token="${escapeHtml(s.token)}">
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml(s.name)} (${escapeHtml(s.email)})</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(s.ip || '127.0.0.1')}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml(s.userAgent || 'Desconocido')}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${formatDate(s.createdAt)}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${ttlText}</span>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${badgeCurrent}</span>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);

    const rows = tbody.querySelectorAll<HTMLElement>('.winners-table__tr');
    rows.forEach((row) => {
      const token = row.getAttribute('data-session-token');
      const session = this.sessionsList.find((s) => s.token === token);
      if (!session) return;

      row.addEventListener('click', () => {
        if (this.selectedSession?.token === session.token) {
          this.selectedSession = null;
        } else {
          this.selectedSession = session;
          this.selectedAdmin = null;
        }
        this.updateSelectionUi();
      });

      row.addEventListener('dblclick', () => {
        this.openRevokeModal(session);
      });
    });
  }

  private openCreateAdminModal(): void {
    this.openAdminModal();
  }

  private openEditAdminModal(admin: AdminItem): void {
    this.openAdminModal(admin);
  }

  private openAdminModal(admin?: AdminItem): void {
    const isEdit = Boolean(admin);
    const selectedRoleIds = admin ? admin.roles.map((r) => r.id) : [];

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'admins-modal-form-content';
    bodyContainer.innerHTML = `
      <label class="field" data-ref="field-admin-name">
        <input class="field__input" data-ref="input-admin-name" type="text" placeholder=" " value="${escapeHtml(admin?.name || '')}" required autocomplete="off" />
        <span class="field__label">Nombre Completo *</span>
      </label>

      <label class="field" data-ref="field-admin-email" style="margin-top: 14px;">
        <input class="field__input" data-ref="input-admin-email" type="email" placeholder=" " value="${escapeHtml(admin?.email || '')}" required autocomplete="off" />
        <span class="field__label">Correo Electrónico Corporativo *</span>
      </label>

      <label class="field" data-ref="field-admin-password" style="margin-top: 14px;">
        <input class="field__input" data-ref="input-admin-password" type="password" placeholder=" " autocomplete="new-password" />
        <span class="field__label">${isEdit ? 'Nueva Contraseña (Opcional)' : 'Contraseña (Mínimo 8 caracteres) *'}</span>
      </label>
      ${isEdit ? '<span style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 4px; display: block;">Dejar en blanco para conservar la contraseña actual.</span>' : ''}

      <div class="admins-form-section" style="margin-top: 18px;">
        <span class="admins-form-section__title" style="font-size: 0.8125rem; font-weight: 700; color: var(--text-primary); margin-bottom: 8px; display: block;">Roles y Contenedores PBAC *</span>
        <div class="admins-roles-checkboxes" style="display: flex; flex-direction: column; gap: 8px;">
          ${this.availableRoles
            .map((r) => {
              const isChecked = selectedRoleIds.includes(r.id);
              return `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; font-weight: 500; cursor: pointer;">
                  <input type="checkbox" name="modal_role_ids" value="${r.id}" ${isChecked ? 'checked' : ''} />
                  <span>${escapeHtml(r.name)}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      </div>

      <div class="admins-checkbox-row" style="margin-top: 16px;">
        <label class="admins-switch-label" style="display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; cursor: pointer;">
          <input class="field__checkbox" data-ref="input-admin-active" type="checkbox" ${admin ? (admin.is_active ? 'checked' : '') : 'checked'} />
          <span class="admins-switch-text">Cuenta activa (Permitir acceso al panel de administración)</span>
        </label>
      </div>
    `;

    const nameInput = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-admin-name"]');
    const emailInput = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-admin-email"]');
    const passwordInput = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-admin-password"]');
    const activeCheck = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-admin-active"]');

    const modal = openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cancelar',
      confirmClass: 'component-button--black',
      confirmText: isEdit ? 'Actualizar Administrador' : 'Crear Administrador',
      description: isEdit
        ? `Modificar credenciales y roles asignados a ${admin!.name}`
        : 'Registrar un nuevo operador con privilegios de acceso PBAC',
      onConfirm: async () => {
        const name = nameInput?.value.trim() || '';
        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value || undefined;
        const is_active = activeCheck?.checked ?? true;

        const checkedRoleInputs = bodyContainer.querySelectorAll<HTMLInputElement>('input[name="modal_role_ids"]:checked');
        const role_ids = Array.from(checkedRoleInputs).map((i) => parseInt(i.value, 10));

        if (!name || !email) {
          modal.setError('Nombre y correo electrónico son obligatorios.');
          return false;
        }

        if (!admin && (!password || password.length < 8)) {
          modal.setError('La contraseña debe tener al menos 8 caracteres.');
          return false;
        }

        if (password && password.length < 8) {
          modal.setError('La nueva contraseña debe tener al menos 8 caracteres.');
          return false;
        }

        if (role_ids.length === 0) {
          modal.setError('Debes asignar al menos un rol al administrador.');
          return false;
        }

        try {
          if (admin) {
            const payload: any = { email, is_active, name, role_ids };
            if (password && password.length >= 8) payload.password = password;
            await putApi(`/api/admins/${admin.id}`, payload);
            showToast('Administrador actualizado exitosamente', 'success');
          } else {
            await postApi('/api/admins', { email, is_active, name, password, role_ids });
            showToast('Administrador creado exitosamente', 'success');
          }
          this.deselectAll();
          await this.loadAdmins();
          return true;
        } catch (err: any) {
          modal.setError(err?.message || 'Error al guardar los datos del administrador.');
          return false;
        }
      },
      size: 'md',
      title: isEdit ? `Editar Administrador: ${admin!.name}` : 'Nuevo Administrador',
    });
  }

  private async toggleAdminStatus(admin: AdminItem): Promise<void> {
    const nextStatus = !admin.is_active;
    try {
      await putApi(`/api/admins/${admin.id}`, { is_active: nextStatus });
      showToast(`Cuenta ${nextStatus ? 'activada' : 'desactivada'} exitosamente`, 'success');
      this.deselectAll();
      await this.loadAdmins();
    } catch (_e) {
      showToast('Error al modificar estado de la cuenta', 'danger');
    }
  }

  private openDeleteAdminModal(admin: AdminItem): void {
    const bodyHtml = `
      <p style="margin: 0 0 16px; font-size: 0.875rem; color: var(--text-secondary);">
        ¿Confirmas la eliminación permanente de este administrador? Sus sesiones activas en Redis serán revocadas de inmediato.
      </p>
      <div class="admins-session-preview" style="padding: 12px; border-radius: 8px; background: var(--bg-surface-elevated, rgba(255,255,255,0.04)); display: flex; flex-direction: column; gap: 4px;">
        <strong style="font-size: 0.875rem;">${escapeHtml(admin.name)}</strong>
        <span style="color: var(--text-secondary); font-size: 0.8125rem;">${escapeHtml(admin.email)}</span>
        <span style="color: var(--text-secondary); font-size: 0.75rem;">ID de Cuenta: #${admin.id}</span>
      </div>
    `;

    const modal = openModal({
      bodyHtml,
      cancelText: 'Cancelar',
      confirmClass: 'component-button--danger',
      confirmText: 'Eliminar Administrador',
      description: 'Acción permanente e irreversible.',
      onConfirm: async () => {
        try {
          await deleteApi(`/api/admins/${admin.id}`);
          showToast('Administrador eliminado exitosamente', 'success');
          this.deselectAll();
          await Promise.all([this.loadAdmins(), this.loadSessions()]);
          return true;
        } catch (err: any) {
          modal.setError(err?.message || 'Error al eliminar el administrador.');
          return false;
        }
      },
      size: 'sm',
      title: 'Eliminar Administrador',
    });
  }

  private openRoleModal(role: RoleItem): void {
    const assignedSet = new Set(role.permissions || []);
    const groupsMap = new Map<string, PermissionItem[]>();

    for (const p of this.permissionsCatalogue) {
      const cat = getPermissionCategory(p.name);
      if (!groupsMap.has(cat)) groupsMap.set(cat, []);
      groupsMap.get(cat)!.push(p);
    }

    let groupsHtml = '';
    for (const [category, perms] of groupsMap.entries()) {
      const permsHtml = perms
        .map((p) => {
          const checked = assignedSet.has(p.name);
          return `
            <label class="admins-perm-item">
              <input type="checkbox" name="role_permission" value="${escapeHtml(p.name)}" ${checked ? 'checked' : ''} />
              <div class="admins-perm-item__info">
                <span class="admins-perm-item__name">${escapeHtml(p.name)}</span>
                <span class="admins-perm-item__desc">${escapeHtml(p.description || '')}</span>
              </div>
            </label>
          `;
        })
        .join('');

      groupsHtml += `
        <div class="admins-perm-group">
          <h4 class="admins-perm-group__title">${escapeHtml(category)}</h4>
          <div class="admins-perm-group__grid">
            ${permsHtml}
          </div>
        </div>
      `;
    }

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'admins-role-modal-container';
    bodyContainer.innerHTML = `
      <div class="admins-role-modal-toolbar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <span class="admins-role-modal-summary" data-ref="text-modal-perms-count" style="font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary);">
          ${assignedSet.size} de ${this.permissionsCatalogue.length} permisos seleccionados
        </span>
        <div style="display: flex; gap: 8px;">
          <button type="button" class="component-button component-button--h32 component-button--ghost" data-ref="btn-select-all-modal-perms">
            <span>Seleccionar todos</span>
          </button>
          <button type="button" class="component-button component-button--h32 component-button--ghost" data-ref="btn-deselect-all-modal-perms">
            <span>Deseleccionar</span>
          </button>
        </div>
      </div>
      <div class="admins-permissions-groups">${groupsHtml}</div>
    `;

    const countEl = bodyContainer.querySelector<HTMLElement>('[data-ref="text-modal-perms-count"]');
    const updateCount = () => {
      const checkedCount = bodyContainer.querySelectorAll<HTMLInputElement>('input[name="role_permission"]:checked').length;
      if (countEl) countEl.textContent = `${checkedCount} de ${this.permissionsCatalogue.length} permisos seleccionados`;
    };

    bodyContainer.querySelector('[data-ref="btn-select-all-modal-perms"]')?.addEventListener('click', () => {
      bodyContainer.querySelectorAll<HTMLInputElement>('input[name="role_permission"]').forEach((i) => (i.checked = true));
      updateCount();
    });

    bodyContainer.querySelector('[data-ref="btn-deselect-all-modal-perms"]')?.addEventListener('click', () => {
      bodyContainer.querySelectorAll<HTMLInputElement>('input[name="role_permission"]').forEach((i) => (i.checked = false));
      updateCount();
    });

    bodyContainer.querySelectorAll<HTMLInputElement>('input[name="role_permission"]').forEach((i) => {
      i.addEventListener('change', updateCount);
    });

    const modal = openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cancelar',
      confirmClass: 'component-button--black',
      confirmText: 'Guardar Privilegios PBAC',
      description: `Rol: ${role.name} • Políticas y capacidades efectivas`,
      onConfirm: async () => {
        const checkedInputs = bodyContainer.querySelectorAll<HTMLInputElement>('input[name="role_permission"]:checked');
        const permissions = Array.from(checkedInputs).map((i) => i.value);

        try {
          await putApi(`/api/admins/roles/${role.id}`, { permissions });
          showToast('Permisos PBAC actualizados exitosamente', 'success');
          await Promise.all([this.loadRoles(), this.loadAdmins()]);
          return true;
        } catch (err: any) {
          modal.setError(err?.message || 'Error al guardar los permisos del rol.');
          return false;
        }
      },
      size: 'lg',
      title: `Asignar Permisos PBAC: ${role.name}`,
    });
  }

  private openRevokeModal(session: ActiveSessionItem): void {
    const bodyHtml = `
      <p style="margin: 0 0 16px; font-size: 0.875rem; color: var(--text-secondary);">
        ¿Estás seguro de que deseas revocar inmediatamente esta sesión en Redis? El operador será desconectado en su próxima petición HTTP.
      </p>
      <div class="admins-session-preview" style="padding: 12px; border-radius: 8px; background: var(--bg-surface-elevated, rgba(255,255,255,0.04)); display: flex; flex-direction: column; gap: 4px;">
        <strong style="font-size: 0.875rem;">${escapeHtml(session.name)} (${escapeHtml(session.email)})</strong>
        <span style="font-size: 0.8125rem;">Dirección IP: <code>${escapeHtml(session.ip)}</code></span>
        <span style="color: var(--text-secondary); font-size: 0.75rem;">Navegador: ${escapeHtml(session.userAgent)}</span>
        <span style="color: var(--text-secondary); font-size: 0.75rem;">Inicio de Sesión: ${formatDate(session.createdAt)}</span>
      </div>
    `;

    const modal = openModal({
      bodyHtml,
      cancelText: 'Cancelar',
      confirmClass: 'component-button--danger',
      confirmText: 'Revocar Sesión',
      description: 'Terminar sesión activa en memoria Redis.',
      onConfirm: async () => {
        try {
          await deleteApi(`/api/admins/sessions/${encodeURIComponent(session.token)}`);
          showToast('Sesión revocada inmediatamente en Redis', 'success');
          this.deselectAll();
          await this.loadSessions();
          return true;
        } catch (err: any) {
          modal.setError(err?.message || 'Error al revocar la sesión activa.');
          return false;
        }
      },
      size: 'sm',
      title: 'Revocar Sesión Activa',
    });
  }
}

export async function createAdminsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/admins/admins.html');
  const controller = new AdminsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
