import { deleteApi, getApi, postApi, putApi } from '../services/api.service.js';
import { getCurrentUser } from '../services/auth.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { generateAvatarDataUri } from '../utils/avatar.util.js';
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
  private container: HTMLElement;
  private editingAdminId: number | null = null;
  private editingRoleId: number | null = null;
  private permissionsCatalogue: PermissionItem[] = [];
  private roleFilter = 'all';
  private searchQuery = '';
  private selectedAdminToDelete: AdminItem | null = null;
  private selectedSessionToRevoke: ActiveSessionItem | null = null;
  private sessionsAdminFilter = 'all';
  private sessionsList: ActiveSessionItem[] = [];
  private statusFilter = 'all';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  async init(): Promise<void> {
    this.abortController = new AbortController();
    this.bindEvents();
    await Promise.all([this.loadAdmins(), this.loadRoles(), this.loadSessions()]);
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.adminsList = [];
    this.availableRoles = [];
    this.permissionsCatalogue = [];
    this.sessionsList = [];
  }

  private bindEvents(): void {
    const tabAdmins = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-admins"]');
    const tabRoles = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-roles"]');
    const tabSessions = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-sessions"]');

    tabAdmins?.addEventListener('click', () => this.switchTab('admins'));
    tabRoles?.addEventListener('click', () => this.switchTab('roles'));
    tabSessions?.addEventListener('click', () => this.switchTab('sessions'));

    const btnRefreshHeader = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-admins"]');
    btnRefreshHeader?.addEventListener('click', () => this.refreshAll());

    const btnRefreshList = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-list"]');
    btnRefreshList?.addEventListener('click', () => this.loadAdmins());

    const btnRefreshSessions = this.container.querySelector<HTMLElement>('[data-ref="btn-refresh-sessions"]');
    btnRefreshSessions?.addEventListener('click', () => this.loadSessions());

    const searchInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-admins"]');
    searchInput?.addEventListener('input', () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderAdminsTable();
    });

    const roleSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-role-filter"]');
    roleSelect?.addEventListener('change', () => {
      this.roleFilter = roleSelect.value;
      this.renderAdminsTable();
    });

    const statusSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-status-filter"]');
    statusSelect?.addEventListener('change', () => {
      this.statusFilter = statusSelect.value;
      this.renderAdminsTable();
    });

    const sessionsAdminSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-sessions-admin-filter"]');
    sessionsAdminSelect?.addEventListener('change', () => {
      this.sessionsAdminFilter = sessionsAdminSelect.value;
      this.renderSessionsTable();
    });

    const btnCreateAdmin = this.container.querySelector<HTMLElement>('[data-ref="btn-create-admin"]');
    btnCreateAdmin?.addEventListener('click', () => this.openCreateAdminModal());

    const btnCloseModalAdmin = this.container.querySelector<HTMLElement>('[data-ref="btn-close-modal-admin"]');
    const btnCancelModalAdmin = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-modal-admin"]');
    btnCloseModalAdmin?.addEventListener('click', () => this.closeAdminModal());
    btnCancelModalAdmin?.addEventListener('click', () => this.closeAdminModal());

    const formAdmin = this.container.querySelector<HTMLFormElement>('[data-ref="form-admin"]');
    formAdmin?.addEventListener('submit', (e) => this.handleSaveAdmin(e));

    const btnCloseModalRole = this.container.querySelector<HTMLElement>('[data-ref="btn-close-modal-role"]');
    const btnCancelModalRole = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-modal-role"]');
    btnCloseModalRole?.addEventListener('click', () => this.closeRoleModal());
    btnCancelModalRole?.addEventListener('click', () => this.closeRoleModal());

    const formRole = this.container.querySelector<HTMLFormElement>('[data-ref="form-role-permissions"]');
    formRole?.addEventListener('submit', (e) => this.handleSaveRolePermissions(e));

    const btnSelectAll = this.container.querySelector<HTMLElement>('[data-ref="btn-select-all-perms"]');
    btnSelectAll?.addEventListener('click', () => this.toggleAllRoleCheckboxes(true));

    const btnDeselectAll = this.container.querySelector<HTMLElement>('[data-ref="btn-deselect-all-perms"]');
    btnDeselectAll?.addEventListener('click', () => this.toggleAllRoleCheckboxes(false));

    const btnCloseRevoke = this.container.querySelector<HTMLElement>('[data-ref="btn-close-modal-revoke"]');
    const btnCancelRevoke = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-modal-revoke"]');
    const btnSubmitRevoke = this.container.querySelector<HTMLElement>('[data-ref="btn-submit-revoke"]');
    btnCloseRevoke?.addEventListener('click', () => this.closeRevokeModal());
    btnCancelRevoke?.addEventListener('click', () => this.closeRevokeModal());
    btnSubmitRevoke?.addEventListener('click', () => this.executeRevokeSession());

    const btnCloseDelete = this.container.querySelector<HTMLElement>('[data-ref="btn-close-modal-delete"]');
    const btnCancelDelete = this.container.querySelector<HTMLElement>('[data-ref="btn-cancel-modal-delete"]');
    const btnSubmitDelete = this.container.querySelector<HTMLElement>('[data-ref="btn-submit-delete"]');
    btnCloseDelete?.addEventListener('click', () => this.closeDeleteModal());
    btnCancelDelete?.addEventListener('click', () => this.closeDeleteModal());
    btnSubmitDelete?.addEventListener('click', () => this.executeDeleteAdmin());
  }

  private switchTab(tab: 'admins' | 'roles' | 'sessions'): void {
    this.activeTab = tab;

    const tabAdmins = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-admins"]');
    const tabRoles = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-roles"]');
    const tabSessions = this.container.querySelector<HTMLElement>('[data-ref="tab-btn-sessions"]');

    tabAdmins?.classList.toggle('is-active', tab === 'admins');
    tabRoles?.classList.toggle('is-active', tab === 'roles');
    tabSessions?.classList.toggle('is-active', tab === 'sessions');

    const paneAdmins = this.container.querySelector<HTMLElement>('[data-ref="pane-admins"]');
    const paneRoles = this.container.querySelector<HTMLElement>('[data-ref="pane-roles"]');
    const paneSessions = this.container.querySelector<HTMLElement>('[data-ref="pane-sessions"]');

    paneAdmins?.classList.toggle('is-active', tab === 'admins');
    paneAdmins?.classList.toggle('is-hidden', tab !== 'admins');

    paneRoles?.classList.toggle('is-active', tab === 'roles');
    paneRoles?.classList.toggle('is-hidden', tab !== 'roles');

    paneSessions?.classList.toggle('is-active', tab === 'sessions');
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
    const roleSelect = this.container.querySelector<HTMLSelectElement>('[data-ref="select-role-filter"]');
    if (!roleSelect) return;
    const currentVal = roleSelect.value;
    roleSelect.innerHTML = '<option value="all">Todos los roles</option>';
    for (const r of this.availableRoles) {
      const opt = document.createElement('option');
      opt.value = r.name;
      opt.textContent = `${r.name} (${r.admin_count})`;
      roleSelect.appendChild(opt);
    }
    if (currentVal) roleSelect.value = currentVal;
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
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
            No se encontraron administradores con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    const rowsHtml = filtered
      .map((admin) => {
        const isActive = Boolean(admin.is_active);
        const avatarUri = generateAvatarDataUri(admin.name);
        const roleBadges =
          admin.roles.length > 0
            ? admin.roles
                .map(
                  (r) => `<span class="admins-badge admins-badge--role">${escapeHtml(r.name)}</span>`
                )
                .join(' ')
            : '<span class="admins-badge admins-badge--neutral">Sin Rol</span>';

        const permCount = admin.effective_permissions ? admin.effective_permissions.length : 0;
        const statusBadge = isActive
          ? '<span class="admins-badge admins-badge--success">Activo</span>'
          : '<span class="admins-badge admins-badge--danger">Inactivo</span>';

        return `
          <tr data-admin-id="${admin.id}">
            <td>
              <div class="admins-user-cell">
                <img class="admins-avatar" src="${avatarUri}" alt="${escapeHtml(admin.name)}" />
                <div class="admins-user-info">
                  <span class="admins-user-name">${escapeHtml(admin.name)}</span>
                  <span class="admins-user-email">${escapeHtml(admin.email)}</span>
                </div>
              </div>
            </td>
            <td>${roleBadges}</td>
            <td>
              <span class="admins-badge admins-badge--neutral" data-tooltip="${admin.effective_permissions ? escapeHtml(admin.effective_permissions.join(', ')) : ''}">
                ${permCount} permisos
              </span>
            </td>
            <td>${statusBadge}</td>
            <td>${formatDate(admin.last_login_at)}</td>
            <td>${formatDate(admin.created_at)}</td>
            <td style="text-align: right;">
              <div style="display: flex; gap: 6px; justify-content: flex-end;">
                <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--ghost" data-action="edit" data-id="${admin.id}" data-tooltip="Editar administrador" aria-label="Editar">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
                </button>
                <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--ghost" data-action="toggle-status" data-id="${admin.id}" data-tooltip="${isActive ? 'Desactivar cuenta' : 'Activar cuenta'}" aria-label="Alternar estado">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#${isActive ? 'block' : 'check_circle'}"></use></svg>
                </button>
                <button type="button" class="component-button component-button--h32 component-button--icon-only component-button--ghost" data-action="delete" data-id="${admin.id}" data-tooltip="Eliminar cuenta" aria-label="Eliminar">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#delete"></use></svg>
                </button>
              </div>
            </td>
          </tr>
        `;
      })
      .join('');

    tbody.innerHTML = rowsHtml;
    renderIcons(tbody);

    tbody.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const id = parseInt(btn.dataset.id || '0', 10);
        const admin = this.adminsList.find((a) => a.id === id);
        if (!admin) return;

        if (action === 'edit') {
          this.openEditAdminModal(admin);
        } else if (action === 'toggle-status') {
          this.toggleAdminStatus(admin);
        } else if (action === 'delete') {
          this.openDeleteAdminModal(admin);
        }
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
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-secondary);">
            No hay sesiones activas en Redis para el filtro seleccionado.
          </td>
        </tr>
      `;
      return;
    }

    const currentUser = getCurrentUser();

    tbody.innerHTML = filtered
      .map((s) => {
        const avatarUri = generateAvatarDataUri(s.name);
        const isCurrent = s.isCurrent || (currentUser && currentUser.email === s.email && s.ip === '127.0.0.1');
        const badgeCurrent = isCurrent
          ? '<span class="admins-badge admins-badge--success">Sesión Actual</span>'
          : '<span class="admins-badge admins-badge--neutral">Remota</span>';

        const ttlText = s.ttlSeconds
          ? `${Math.floor(s.ttlSeconds / 3600)}h ${Math.floor((s.ttlSeconds % 3600) / 60)}m`
          : '24 horas';

        return `
          <tr>
            <td>
              <div class="admins-user-cell">
                <img class="admins-avatar" src="${avatarUri}" alt="${escapeHtml(s.name)}" />
                <div class="admins-user-info">
                  <span class="admins-user-name">${escapeHtml(s.name)}</span>
                  <span class="admins-user-email">${escapeHtml(s.email)}</span>
                </div>
              </div>
            </td>
            <td><code style="font-size: 0.8125rem;">${escapeHtml(s.ip || '127.0.0.1')}</code></td>
            <td style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.75rem; color: var(--text-secondary);" title="${escapeHtml(s.userAgent)}">
              ${escapeHtml(s.userAgent || 'Desconocido')}
            </td>
            <td>${formatDate(s.createdAt)}</td>
            <td>${ttlText}</td>
            <td>${badgeCurrent}</td>
            <td style="text-align: right;">
              <button type="button" class="component-button component-button--h32 component-button--danger" data-action="revoke-session" data-token="${escapeHtml(s.token)}">
                <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#logout"></use></svg>
                <span>Revocar</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);

    tbody.querySelectorAll<HTMLButtonElement>('button[data-action="revoke-session"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const token = btn.dataset.token;
        const session = this.sessionsList.find((s) => s.token === token);
        if (session) {
          this.openRevokeModal(session);
        }
      });
    });
  }

  private openCreateAdminModal(): void {
    this.editingAdminId = null;
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-admin-form"]');
    const title = this.container.querySelector<HTMLElement>('[data-ref="modal-admin-title"]');
    const submitText = this.container.querySelector<HTMLElement>('[data-ref="text-submit-admin"]');
    const passwordLabel = this.container.querySelector<HTMLElement>('[data-ref="label-admin-password"]');
    const passwordHint = this.container.querySelector<HTMLElement>('[data-ref="hint-admin-password"]');
    const inputPass = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-password"]');
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-admin-error"]');

    if (title) title.textContent = 'Nuevo Administrador';
    if (submitText) submitText.textContent = 'Guardar Administrador';
    if (passwordLabel) passwordLabel.textContent = 'Contraseña (Mínimo 8 caracteres) *';
    if (passwordHint) passwordHint.style.display = 'none';
    if (inputPass) inputPass.required = true;
    if (banner) banner.classList.add('is-hidden');

    const form = this.container.querySelector<HTMLFormElement>('[data-ref="form-admin"]');
    form?.reset();

    this.renderAdminRoleCheckboxes([]);
    modal?.classList.remove('is-hidden');
  }

  private openEditAdminModal(admin: AdminItem): void {
    this.editingAdminId = admin.id;
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-admin-form"]');
    const title = this.container.querySelector<HTMLElement>('[data-ref="modal-admin-title"]');
    const submitText = this.container.querySelector<HTMLElement>('[data-ref="text-submit-admin"]');
    const passwordLabel = this.container.querySelector<HTMLElement>('[data-ref="label-admin-password"]');
    const passwordHint = this.container.querySelector<HTMLElement>('[data-ref="hint-admin-password"]');
    const inputPass = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-password"]');
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-admin-error"]');

    if (title) title.textContent = `Editar Administrador: ${admin.name}`;
    if (submitText) submitText.textContent = 'Actualizar Datos';
    if (passwordLabel) passwordLabel.textContent = 'Nueva Contraseña (Opcional)';
    if (passwordHint) passwordHint.style.display = 'block';
    if (inputPass) {
      inputPass.required = false;
      inputPass.value = '';
    }
    if (banner) banner.classList.add('is-hidden');

    const nameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-name"]');
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-email"]');
    const activeCheck = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-active"]');

    if (nameInput) nameInput.value = admin.name;
    if (emailInput) emailInput.value = admin.email;
    if (activeCheck) activeCheck.checked = Boolean(admin.is_active);

    const selectedRoleIds = admin.roles.map((r) => r.id);
    this.renderAdminRoleCheckboxes(selectedRoleIds);

    modal?.classList.remove('is-hidden');
  }

  private renderAdminRoleCheckboxes(selectedIds: number[]): void {
    const container = this.container.querySelector<HTMLElement>('[data-ref="admin-roles-container"]');
    if (!container) return;

    container.innerHTML = this.availableRoles
      .map((r) => {
        const isChecked = selectedIds.includes(r.id);
        return `
          <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; font-weight: 500; cursor: pointer;">
            <input type="checkbox" name="role_ids" value="${r.id}" ${isChecked ? 'checked' : ''} />
            <span>${escapeHtml(r.name)}</span>
          </label>
        `;
      })
      .join('');
  }

  private closeAdminModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-admin-form"]');
    modal?.classList.add('is-hidden');
    this.editingAdminId = null;
  }

  private async handleSaveAdmin(e: Event): Promise<void> {
    e.preventDefault();
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-admin-error"]');
    const bannerText = this.container.querySelector<HTMLElement>('[data-ref="text-admin-error"]');
    banner?.classList.add('is-hidden');

    const nameInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-name"]');
    const emailInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-email"]');
    const passwordInput = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-password"]');
    const activeCheck = this.container.querySelector<HTMLInputElement>('[data-ref="input-admin-active"]');

    const name = nameInput?.value.trim() || '';
    const email = emailInput?.value.trim() || '';
    const password = passwordInput?.value || undefined;
    const is_active = activeCheck?.checked ?? true;

    const checkedRoleInputs = this.container.querySelectorAll<HTMLInputElement>('input[name="role_ids"]:checked');
    const role_ids = Array.from(checkedRoleInputs).map((i) => parseInt(i.value, 10));

    if (!name || !email) {
      if (banner && bannerText) {
        bannerText.textContent = 'Nombre y correo electrónico son obligatorios.';
        banner.classList.remove('is-hidden');
      }
      return;
    }

    if (!this.editingAdminId && (!password || password.length < 8)) {
      if (banner && bannerText) {
        bannerText.textContent = 'La contraseña debe tener al menos 8 caracteres.';
        banner.classList.remove('is-hidden');
      }
      return;
    }

    if (role_ids.length === 0) {
      if (banner && bannerText) {
        bannerText.textContent = 'Debes asignar al menos un rol al administrador.';
        banner.classList.remove('is-hidden');
      }
      return;
    }

    try {
      if (this.editingAdminId) {
        const payload: any = { email, is_active, name, role_ids };
        if (password && password.length >= 8) payload.password = password;

        await putApi(`/api/admins/${this.editingAdminId}`, payload);
        showToast('Administrador actualizado exitosamente', 'success');
      } else {
        await postApi('/api/admins', { email, is_active, name, password, role_ids });
        showToast('Administrador creado exitosamente', 'success');
      }

      this.closeAdminModal();
      await this.loadAdmins();
    } catch (err: any) {
      if (banner && bannerText) {
        bannerText.textContent = err?.message || 'Error al guardar los datos del administrador.';
        banner.classList.remove('is-hidden');
      }
    }
  }

  private async toggleAdminStatus(admin: AdminItem): Promise<void> {
    const nextStatus = !admin.is_active;
    try {
      await putApi(`/api/admins/${admin.id}`, { is_active: nextStatus });
      showToast(`Cuenta ${nextStatus ? 'activada' : 'desactivada'} exitosamente`, 'success');
      await this.loadAdmins();
    } catch (_e) {
      showToast('Error al modificar estado de la cuenta', 'danger');
    }
  }

  private openDeleteAdminModal(admin: AdminItem): void {
    this.selectedAdminToDelete = admin;
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-confirm-delete"]');
    const preview = this.container.querySelector<HTMLElement>('[data-ref="delete-admin-preview"]');
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-delete-error"]');
    banner?.classList.add('is-hidden');

    if (preview) {
      preview.innerHTML = `
        <strong>${escapeHtml(admin.name)}</strong>
        <span style="color: var(--text-secondary);">${escapeHtml(admin.email)}</span>
        <span style="color: var(--text-secondary); font-size: 0.75rem;">ID de Cuenta: #${admin.id}</span>
      `;
    }

    modal?.classList.remove('is-hidden');
  }

  private closeDeleteModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-confirm-delete"]');
    modal?.classList.add('is-hidden');
    this.selectedAdminToDelete = null;
  }

  private async executeDeleteAdmin(): Promise<void> {
    if (!this.selectedAdminToDelete) return;
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-delete-error"]');
    const bannerText = this.container.querySelector<HTMLElement>('[data-ref="text-delete-error"]');

    try {
      await deleteApi(`/api/admins/${this.selectedAdminToDelete.id}`);
      showToast('Administrador eliminado exitosamente', 'success');
      this.closeDeleteModal();
      await Promise.all([this.loadAdmins(), this.loadSessions()]);
    } catch (err: any) {
      if (banner && bannerText) {
        bannerText.textContent = err?.message || 'Error al eliminar el administrador.';
        banner.classList.remove('is-hidden');
      }
    }
  }

  private openRoleModal(role: RoleItem): void {
    this.editingRoleId = role.id;
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-role-permissions"]');
    const title = this.container.querySelector<HTMLElement>('[data-ref="modal-role-title"]');
    const badge = this.container.querySelector<HTMLElement>('[data-ref="modal-role-badge"]');
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-role-error"]');
    banner?.classList.add('is-hidden');

    if (title) title.textContent = `Permisos PBAC: ${role.name}`;
    if (badge) badge.textContent = role.name;

    this.renderRolePermissionsGroups(role.permissions || []);
    modal?.classList.remove('is-hidden');
  }

  private renderRolePermissionsGroups(assignedPerms: string[]): void {
    const container = this.container.querySelector<HTMLElement>('[data-ref="permissions-groups-container"]');
    if (!container) return;

    const assignedSet = new Set(assignedPerms);
    const groupsMap = new Map<string, PermissionItem[]>();

    for (const p of this.permissionsCatalogue) {
      const cat = getPermissionCategory(p.name);
      if (!groupsMap.has(cat)) groupsMap.set(cat, []);
      groupsMap.get(cat)!.push(p);
    }

    let html = '';
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

      html += `
        <div class="admins-perm-group">
          <h4 class="admins-perm-group__title">${escapeHtml(category)}</h4>
          <div class="admins-perm-group__grid">
            ${permsHtml}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
    this.updateRolePermissionsCount();

    container.querySelectorAll<HTMLInputElement>('input[name="role_permission"]').forEach((input) => {
      input.addEventListener('change', () => this.updateRolePermissionsCount());
    });
  }

  private updateRolePermissionsCount(): void {
    const checked = this.container.querySelectorAll<HTMLInputElement>('input[name="role_permission"]:checked');
    const counter = this.container.querySelector<HTMLElement>('[data-ref="text-permissions-count"]');
    if (counter) {
      counter.textContent = `${checked.length} de ${this.permissionsCatalogue.length} permisos seleccionados`;
    }
  }

  private toggleAllRoleCheckboxes(check: boolean): void {
    const inputs = this.container.querySelectorAll<HTMLInputElement>('input[name="role_permission"]');
    inputs.forEach((i) => (i.checked = check));
    this.updateRolePermissionsCount();
  }

  private closeRoleModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-role-permissions"]');
    modal?.classList.add('is-hidden');
    this.editingRoleId = null;
  }

  private async handleSaveRolePermissions(e: Event): Promise<void> {
    e.preventDefault();
    if (!this.editingRoleId) return;
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-role-error"]');
    const bannerText = this.container.querySelector<HTMLElement>('[data-ref="text-role-error"]');
    banner?.classList.add('is-hidden');

    const checkedInputs = this.container.querySelectorAll<HTMLInputElement>('input[name="role_permission"]:checked');
    const permissions = Array.from(checkedInputs).map((i) => i.value);

    try {
      await putApi(`/api/admins/roles/${this.editingRoleId}`, { permissions });
      showToast('Permisos PBAC actualizados exitosamente', 'success');
      this.closeRoleModal();
      await Promise.all([this.loadRoles(), this.loadAdmins()]);
    } catch (err: any) {
      if (banner && bannerText) {
        bannerText.textContent = err?.message || 'Error al guardar los permisos del rol.';
        banner.classList.remove('is-hidden');
      }
    }
  }

  private openRevokeModal(session: ActiveSessionItem): void {
    this.selectedSessionToRevoke = session;
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-confirm-revoke"]');
    const preview = this.container.querySelector<HTMLElement>('[data-ref="revoke-session-preview"]');
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-revoke-error"]');
    banner?.classList.add('is-hidden');

    if (preview) {
      preview.innerHTML = `
        <strong>${escapeHtml(session.name)} (${escapeHtml(session.email)})</strong>
        <span>Dirección IP: <code style="font-size: 0.75rem;">${escapeHtml(session.ip)}</code></span>
        <span style="color: var(--text-secondary); font-size: 0.75rem;">Navegador: ${escapeHtml(session.userAgent)}</span>
        <span style="color: var(--text-secondary); font-size: 0.75rem;">Inicio: ${formatDate(session.createdAt)}</span>
      `;
    }

    modal?.classList.remove('is-hidden');
  }

  private closeRevokeModal(): void {
    const modal = this.container.querySelector<HTMLElement>('[data-ref="modal-confirm-revoke"]');
    modal?.classList.add('is-hidden');
    this.selectedSessionToRevoke = null;
  }

  private async executeRevokeSession(): Promise<void> {
    if (!this.selectedSessionToRevoke) return;
    const banner = this.container.querySelector<HTMLElement>('[data-ref="banner-revoke-error"]');
    const bannerText = this.container.querySelector<HTMLElement>('[data-ref="text-revoke-error"]');

    try {
      await deleteApi(`/api/admins/sessions/${encodeURIComponent(this.selectedSessionToRevoke.token)}`);
      showToast('Sesión revocada inmediatamente en Redis', 'success');
      this.closeRevokeModal();
      await this.loadSessions();
    } catch (err: any) {
      if (banner && bannerText) {
        bannerText.textContent = err?.message || 'Error al revocar la sesión.';
        banner.classList.remove('is-hidden');
      }
    }
  }
}

export async function createAdminsView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/admins/admins.html');
  const controller = new AdminsController(container);
  await controller.init();
  (container as any).__controller = controller;
  return container;
}
