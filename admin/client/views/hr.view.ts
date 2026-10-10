import { navigate } from '../app-router.js';
import { openModal } from '../components/modal.component.js';
import { deleteApi, getApi, patchApi, postApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { buildDatePickerDropdownHtml, DatePickerDropdownController, DropdownController, escapeHtml, getEmptyIllustration, setupDatePickerDropdown, setupDropdown } from '../utils/dom.util.js';
import { hasPermission } from '../utils/permission.util.js';

type HrDepartment =
  | 'data'
  | 'engineering'
  | 'executive'
  | 'finance'
  | 'hr'
  | 'legal'
  | 'marketing'
  | 'operations'
  | 'support';

type HrEmploymentType = 'contractor' | 'full_time' | 'intern' | 'part_time';
type HrWorkModality = 'hybrid' | 'onsite' | 'remote';
type HrPaymentFrequency = 'biweekly' | 'monthly' | 'weekly';
type HrEmployeeStatus = 'active' | 'on_leave' | 'probation' | 'suspended' | 'terminated';
type HrLeaveType =
  | 'bereavement'
  | 'maternity_paternity'
  | 'personal'
  | 'sick_leave'
  | 'unpaid'
  | 'vacation';
type HrLeaveStatus = 'approved' | 'cancelled' | 'pending' | 'rejected';
type HrEventType =
  | 'department_transfer'
  | 'hired'
  | 'leave_approved'
  | 'performance_review'
  | 'promotion'
  | 'salary_adjustment'
  | 'status_change'
  | 'terminated'
  | 'warning';

interface HrEmployee {
  admin_user_id: number | null;
  bank_name: string | null;
  clabe: string | null;
  created_at: string;
  currency: string;
  curp: string | null;
  department: HrDepartment;
  email: string;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  employee_code: string;
  employment_type: HrEmploymentType;
  full_name: string;
  hire_date: string;
  id: number;
  location_state: string | null;
  monthly_salary: number;
  notes: string | null;
  nss: string | null;
  payment_frequency: HrPaymentFrequency;
  pending_leaves_count: number;
  phone: string;
  position_title: string;
  rfc: string | null;
  status: HrEmployeeStatus;
  termination_date: string | null;
  termination_reason: string | null;
  updated_at: string;
  uuid: string;
  vacation_days_available: number;
  vacation_days_total: number;
  vacation_days_used: number;
  work_modality: HrWorkModality;
}

interface HrLeaveRequest {
  created_at: string;
  days_count: number;
  department?: HrDepartment;
  employee_code?: string;
  employee_email?: string;
  employee_id: number;
  employee_name?: string;
  employee_phone?: string;
  employee_status?: HrEmployeeStatus;
  employee_uuid?: string;
  end_date: string;
  id: number;
  leave_type: HrLeaveType;
  position_title?: string;
  reason: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  start_date: string;
  status: HrLeaveStatus;
  updated_at: string;
  uuid: string;
  vacation_days_available?: number;
  vacation_days_total?: number;
  vacation_days_used?: number;
}

interface HrEmployeeEvent {
  created_at: string;
  description: string | null;
  employee_id: number;
  event_type: HrEventType;
  id: number;
  new_value: string | null;
  previous_value: string | null;
  recorded_by_name: string | null;
  title: string;
  uuid: string;
}

interface HrEmployeeDetail {
  employee: HrEmployee;
  events: HrEmployeeEvent[];
  leaveRequests: HrLeaveRequest[];
}

interface HrKpis {
  activeEmployees: number;
  approvedLeaveDaysThisYear: number;
  averageMonthlySalary: number;
  departmentsCount: number;
  monthlyPayrollTotal: number;
  newHiresLast30Days: number;
  onLeaveEmployees: number;
  pendingLeaveRequests: number;
  probationEmployees: number;
  terminatedEmployees: number;
  totalEmployees: number;
}

interface SelectOption {
  icon: string;
  label: string;
  value: string;
}

const DEPARTMENT_OPTIONS: SelectOption[] = [
  { icon: 'work', label: 'Dirección Ejecutiva', value: 'executive' },
  { icon: 'confirmation_number', label: 'Operaciones y Sorteos', value: 'operations' },
  { icon: 'desktop_windows', label: 'Ingeniería y Plataforma', value: 'engineering' },
  { icon: 'account_balance_wallet', label: 'Finanzas y Conciliación SPEI', value: 'finance' },
  { icon: 'smartphone', label: 'Atención a Clientes y Soporte', value: 'support' },
  { icon: 'campaign', label: 'Marketing y Crecimiento', value: 'marketing' },
  { icon: 'badge', label: 'Recursos Humanos y Talento', value: 'hr' },
  { icon: 'verified_user', label: 'Legal y Cumplimiento', value: 'legal' },
  { icon: 'trending_up', label: 'Datos y Analítica', value: 'data' },
];

const LEAVE_TYPE_OPTIONS: SelectOption[] = [
  { icon: 'flight_takeoff', label: 'Vacaciones Anuales', value: 'vacation' },
  { icon: 'medical_services', label: 'Incapacidad Médica (IMSS)', value: 'sick_leave' },
  { icon: 'event_note', label: 'Permiso Personal con Goce', value: 'personal' },
  { icon: 'favorite', label: 'Maternidad / Paternidad', value: 'maternity_paternity' },
  { icon: 'money_off', label: 'Permiso sin Goce de Sueldo', value: 'unpaid' },
  { icon: 'info', label: 'Permiso por Luto / Especial', value: 'bereavement' },
];

const EMPLOYMENT_STATUS_OPTIONS: SelectOption[] = [
  { icon: 'check_circle', label: 'Activo en Operación', value: 'active' },
  { icon: 'flight_takeoff', label: 'En Vacaciones / Ausencia', value: 'on_leave' },
  { icon: 'schedule', label: 'En Periodo de Prueba', value: 'probation' },
  { icon: 'pause', label: 'Suspendido Temporalmente', value: 'suspended' },
  { icon: 'person_off', label: 'Baja Laboral (Terminado)', value: 'terminated' },
];

const EVENT_TYPE_OPTIONS: SelectOption[] = [
  { icon: 'trending_up', label: 'Promoción / Ascenso de Puesto', value: 'promotion' },
  { icon: 'payments', label: 'Ajuste Salarial / Compensación', value: 'salary_adjustment' },
  { icon: 'verified', label: 'Evaluación de Desempeño / Bono', value: 'performance_review' },
  { icon: 'sync_alt', label: 'Cambio de Departamento / Área', value: 'department_transfer' },
  { icon: 'warning', label: 'Acta Administrativa / Amonestación', value: 'warning' },
];

function formatCurrency(amount: number, currency = 'MXN'): string {
  return (
    new Intl.NumberFormat('es-MX', {
      currency,
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      style: 'currency',
    }).format(Number(amount || 0)) + ` ${currency}`
  );
}

function formatPhone(phone: string | null): string {
  if (!phone) return '—';
  const clean = phone.replace(/\D/g, '');
  if (clean.length === 10) {
    return `${clean.slice(0, 3)} ${clean.slice(3, 6)} ${clean.slice(6)}`;
  }
  return phone;
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '—';
  const raw = dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function calculateTenure(hireDateStr: string | null): string {
  if (!hireDateStr) return 'Reciente';
  const raw = hireDateStr.length === 10 ? `${hireDateStr}T12:00:00` : hireDateStr;
  const hireDate = new Date(raw);
  if (isNaN(hireDate.getTime())) return 'Reciente';
  const now = new Date();
  const monthsTotal = Math.max(
    0,
    (now.getFullYear() - hireDate.getFullYear()) * 12 + (now.getMonth() - hireDate.getMonth())
  );
  const years = Math.floor(monthsTotal / 12);
  const months = monthsTotal % 12;
  if (years > 0 && months > 0) return `${years}a ${months}m`;
  if (years > 0) return `${years} ${years === 1 ? 'año' : 'años'}`;
  if (months > 0) return `${months} ${months === 1 ? 'mes' : 'meses'}`;
  return 'Nuevo ingreso';
}

function getInitials(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'RH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

function getDepartmentLabel(dept?: HrDepartment | string): string {
  const found = DEPARTMENT_OPTIONS.find((d) => d.value === dept);
  return found ? found.label : dept || 'Operaciones';
}

function getEmploymentStatusLabel(status: HrEmployeeStatus): string {
  switch (status) {
    case 'active':
      return 'Activo';
    case 'on_leave':
      return 'En Vacaciones / Ausencia';
    case 'probation':
      return 'En Prueba';
    case 'suspended':
      return 'Suspendido';
    case 'terminated':
      return 'Baja Laboral';
    default:
      return 'Activo';
  }
}

function getContractLabel(contract: HrEmploymentType): string {
  switch (contract) {
    case 'full_time':
      return 'Tiempo Completo';
    case 'part_time':
      return 'Medio Tiempo';
    case 'contractor':
      return 'Honorarios';
    case 'intern':
      return 'Prácticas';
    default:
      return 'Tiempo Completo';
  }
}

function getModalityLabel(modality: HrWorkModality): string {
  switch (modality) {
    case 'onsite':
      return 'Presencial';
    case 'hybrid':
      return 'Híbrido';
    case 'remote':
      return 'Remoto';
    default:
      return 'Híbrido';
  }
}

function getFrequencyLabel(freq: HrPaymentFrequency): string {
  switch (freq) {
    case 'weekly':
      return 'Semanal';
    case 'biweekly':
      return 'Quincenal';
    case 'monthly':
      return 'Mensual';
    default:
      return 'Quincenal';
  }
}

function getLeaveTypeLabel(type: HrLeaveType): string {
  switch (type) {
    case 'vacation':
      return 'Vacaciones';
    case 'sick_leave':
      return 'Incapacidad Médica';
    case 'personal':
      return 'Permiso Personal';
    case 'maternity_paternity':
      return 'Maternidad / Paternidad';
    case 'unpaid':
      return 'Sin Goce de Sueldo';
    case 'bereavement':
      return 'Permiso por Luto';
    default:
      return 'Permiso Especial';
  }
}

function getLeaveStatusLabel(status: HrLeaveStatus): string {
  switch (status) {
    case 'pending':
      return 'Pendiente';
    case 'approved':
      return 'Aprobada';
    case 'rejected':
      return 'Rechazada';
    case 'cancelled':
      return 'Cancelada';
    default:
      return 'Pendiente';
  }
}

function computeDaysBetween(startStr: string, endStr: string): number {
  if (!startStr || !endStr) return 1;
  const s = new Date(`${startStr}T12:00:00`);
  const e = new Date(`${endStr}T12:00:00`);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 1;
  const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff);
}

export class HrController implements ViewController {
  private abortController: AbortController | null = null;
  private activeTab: 'employees' | 'leaves' = 'employees';
  private btnActionCopyPhone: HTMLButtonElement | null = null;
  private btnActionDelete: HTMLButtonElement | null = null;
  private btnActionDeselect: HTMLButtonElement | null = null;
  private btnActionDossier: HTMLButtonElement | null = null;
  private btnActionEdit: HTMLButtonElement | null = null;
  private btnActionEvent: HTMLButtonElement | null = null;
  private btnActionStatus: HTMLButtonElement | null = null;
  private btnActionVacation: HTMLButtonElement | null = null;
  private btnActionWhatsapp: HTMLButtonElement | null = null;
  private btnClearSearch: HTMLButtonElement | null = null;
  private btnHireEmployee: HTMLButtonElement | null = null;
  private btnLeaveApprove: HTMLButtonElement | null = null;
  private btnLeaveDeselect: HTMLButtonElement | null = null;
  private btnLeaveDetail: HTMLButtonElement | null = null;
  private btnLeaveReject: HTMLButtonElement | null = null;
  private btnPaginationNext: HTMLButtonElement | null = null;
  private btnPaginationPrev: HTMLButtonElement | null = null;
  private btnQuickHire: HTMLButtonElement | null = null;
  private btnQuickLeave: HTMLButtonElement | null = null;
  private btnRequestLeave: HTMLButtonElement | null = null;
  private btnTabEmployees: HTMLButtonElement | null = null;
  private btnTabLeaves: HTMLButtonElement | null = null;
  private btnToggleSearch: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private currentPage = 1;
  private defaultActions: HTMLElement | null = null;
  private departmentFilter = 'all';
  private employees: HrEmployee[] = [];
  private employeesSection: HTMLElement | null = null;
  private filterDropdownController: DropdownController | null = null;
  private inputPaginationPage: HTMLInputElement | null = null;
  private inputSearch: HTMLInputElement | null = null;
  private isSearchActive = false;
  private leaveRequests: HrLeaveRequest[] = [];
  private leaveSelectedActions: HTMLElement | null = null;
  private leavesSection: HTMLElement | null = null;
  private pageSize = 10;
  private searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private searchQuery = '';
  private searchToolbar: HTMLElement | null = null;
  private selectedActions: HTMLElement | null = null;
  private selectedEmployee: HrEmployee | null = null;
  private selectedLeave: HrLeaveRequest | null = null;
  private statusFilter = 'all';
  private totalPages = 1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  init(): void {
    this.abortController = new AbortController();

    this.searchToolbar = this.container.querySelector<HTMLElement>('[data-ref="search-toolbar"]');
    this.btnToggleSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-toggle-search"]');
    this.inputSearch = this.container.querySelector<HTMLInputElement>('[data-ref="input-search-hr"]');
    this.btnClearSearch = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-clear-search"]');

    this.btnPaginationPrev = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-prev"]');
    this.btnPaginationNext = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-pagination-next"]');
    this.inputPaginationPage = this.container.querySelector<HTMLInputElement>('[data-ref="input-pagination-page"]');

    this.defaultActions = this.container.querySelector<HTMLElement>('[data-ref="hr-default-actions"]');
    this.selectedActions = this.container.querySelector<HTMLElement>('[data-ref="hr-selected-actions"]');
    this.leaveSelectedActions = this.container.querySelector<HTMLElement>('[data-ref="hr-leave-selected-actions"]');

    this.btnHireEmployee = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-hire-employee"]');
    this.btnRequestLeave = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-request-leave"]');
    this.btnQuickHire = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-quick-hire"]');
    this.btnQuickLeave = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-quick-leave"]');

    this.btnActionDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-deselect"]');
    this.btnActionDossier = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-dossier"]');
    this.btnActionEdit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-edit"]');
    this.btnActionVacation = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-vacation"]');
    this.btnActionEvent = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-event"]');
    this.btnActionWhatsapp = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-whatsapp"]');
    this.btnActionCopyPhone = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-copy-phone"]');
    this.btnActionStatus = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-status"]');
    this.btnActionDelete = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-action-delete"]');

    this.btnLeaveDeselect = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-leave-deselect"]');
    this.btnLeaveDetail = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-leave-detail"]');
    this.btnLeaveApprove = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-leave-approve"]');
    this.btnLeaveReject = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-leave-reject"]');

    this.btnTabEmployees = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-employees"]');
    this.btnTabLeaves = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-tab-leaves"]');
    this.employeesSection = this.container.querySelector<HTMLElement>('[data-ref="hr-employees-section"]');
    this.leavesSection = this.container.querySelector<HTMLElement>('[data-ref="hr-leaves-section"]');

    const filterDropdownWrapper = this.container.querySelector<HTMLElement>('[data-ref="filter-dropdown-wrapper"]');
    if (filterDropdownWrapper) {
      this.filterDropdownController = setupDropdown(filterDropdownWrapper, {
        isSelect: false,
        matchWidth: false,
        placement: 'bottom-end',
      });
    }

    this.applyPermissionsUi();
    this.bindEvents();
    renderIcons(this.container);

    requestAnimationFrame(() => {
      void this.loadAllData();
    });
  }

  private applyPermissionsUi(): void {
    const canCreate = hasPermission('hr:create') || hasPermission('hr:manage');
    if (this.btnHireEmployee) this.btnHireEmployee.classList.toggle('is-hidden', !canCreate);
    if (this.btnRequestLeave) this.btnRequestLeave.classList.toggle('is-hidden', !canCreate);
    if (this.btnQuickHire) this.btnQuickHire.classList.toggle('is-hidden', !canCreate);
    if (this.btnQuickLeave) this.btnQuickLeave.classList.toggle('is-hidden', !canCreate);
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
            void this.loadAllData();
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
          void this.loadAllData();
        }, 280);
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
        void this.loadAllData();
        this.inputSearch?.focus();
      },
      { signal }
    );

    const statusBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-status-filter]');
    statusBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          this.statusFilter = btn.getAttribute('data-status-filter') || 'all';
          statusBtns.forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          this.currentPage = 1;
          this.filterDropdownController?.close();
          void this.loadAllData();
        },
        { signal }
      );
    });

    const deptBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-dept-filter]');
    deptBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          this.departmentFilter = btn.getAttribute('data-dept-filter') || 'all';
          deptBtns.forEach((b) => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          this.currentPage = 1;
          this.filterDropdownController?.close();
          void this.loadAllData();
        },
        { signal }
      );
    });

    this.btnTabEmployees?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.switchTab('employees');
      },
      { signal }
    );

    this.btnTabLeaves?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.switchTab('leaves');
      },
      { signal }
    );

    this.inputPaginationPage?.addEventListener(
      'change',
      () => {
        let page = parseInt(this.inputPaginationPage?.value || '1', 10);
        if (isNaN(page) || page < 1) page = 1;
        if (page > this.totalPages) page = this.totalPages;
        this.currentPage = page;
        this.renderActiveTab();
      },
      { signal }
    );

    this.btnPaginationPrev?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.currentPage > 1) {
          this.currentPage--;
          this.renderActiveTab();
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
          this.renderActiveTab();
        }
      },
      { signal }
    );

    const openHireHandler = (e: Event): void => {
      e.preventDefault();
      navigate('/hr/create');
    };
    this.btnHireEmployee?.addEventListener('click', openHireHandler, { signal });
    this.btnQuickHire?.addEventListener('click', openHireHandler, { signal });

    const openLeaveHandler = (e: Event): void => {
      e.preventDefault();
      this.openCreateLeaveModal(this.selectedEmployee || undefined);
    };
    this.btnRequestLeave?.addEventListener('click', openLeaveHandler, { signal });
    this.btnQuickLeave?.addEventListener('click', openLeaveHandler, { signal });

    this.btnActionDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedEmployee = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnActionDossier?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee) {
          void this.openEmployeeDossierModal(this.selectedEmployee.uuid);
        }
      },
      { signal }
    );

    this.btnActionEdit?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee) {
          navigate(`/hr/${this.selectedEmployee.uuid}/edit`);
        }
      },
      { signal }
    );

    this.btnActionVacation?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee) {
          this.openCreateLeaveModal(this.selectedEmployee);
        }
      },
      { signal }
    );

    this.btnActionEvent?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee) {
          this.openCreateEventModal(this.selectedEmployee);
        }
      },
      { signal }
    );

    this.btnActionWhatsapp?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee?.phone) {
          const digits = this.selectedEmployee.phone.replace(/\D/g, '');
          window.open(`https://wa.me/52${digits}`, '_blank', 'noopener,noreferrer');
        }
      },
      { signal }
    );

    this.btnActionCopyPhone?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee?.phone) {
          void navigator.clipboard.writeText(this.selectedEmployee.phone);
          showToast('Teléfono del colaborador copiado al portapapeles.', 'success');
        }
      },
      { signal }
    );

    this.btnActionStatus?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee) {
          this.openStatusChangeModal(this.selectedEmployee);
        }
      },
      { signal }
    );

    this.btnActionDelete?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedEmployee) {
          this.openDeleteEmployeeModal(this.selectedEmployee);
        }
      },
      { signal }
    );

    this.btnLeaveDeselect?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        this.selectedLeave = null;
        this.updateSelectionUi();
      },
      { signal }
    );

    this.btnLeaveDetail?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedLeave) {
          this.openLeaveDetailModal(this.selectedLeave);
        }
      },
      { signal }
    );

    this.btnLeaveApprove?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedLeave) {
          this.openReviewLeaveModal(this.selectedLeave, 'approve');
        }
      },
      { signal }
    );

    this.btnLeaveReject?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        if (this.selectedLeave) {
          this.openReviewLeaveModal(this.selectedLeave, 'reject');
        }
      },
      { signal }
    );

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape' && (this.selectedEmployee || this.selectedLeave)) {
          this.selectedEmployee = null;
          this.selectedLeave = null;
          this.updateSelectionUi();
        }
      },
      { signal }
    );
  }

  private switchTab(tab: 'employees' | 'leaves'): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.currentPage = 1;
    this.selectedEmployee = null;
    this.selectedLeave = null;

    this.btnTabEmployees?.classList.toggle('is-active', tab === 'employees');
    this.btnTabLeaves?.classList.toggle('is-active', tab === 'leaves');
    this.employeesSection?.classList.toggle('is-hidden', tab !== 'employees');
    this.leavesSection?.classList.toggle('is-hidden', tab !== 'leaves');

    this.updateSelectionUi();
    this.renderActiveTab();
  }

  private async loadAllData(): Promise<void> {
    await Promise.all([this.loadKpis(), this.loadEmployees(), this.loadLeaveRequests()]);
  }

  private async loadKpis(): Promise<void> {
    const res = await getApi<HrKpis>('/api/hr/kpis');
    if (!res.success || !res.data) return;
    const kpis = res.data;

    const elActiveVal = this.container.querySelector<HTMLElement>('[data-ref="kpi-active-staff-value"]');
    const elActiveDesc = this.container.querySelector<HTMLElement>('[data-ref="kpi-active-staff-desc"]');
    const elVacVal = this.container.querySelector<HTMLElement>('[data-ref="kpi-vacation-value"]');
    const elVacDesc = this.container.querySelector<HTMLElement>('[data-ref="kpi-vacation-desc"]');
    const elPendingVal = this.container.querySelector<HTMLElement>('[data-ref="kpi-pending-leaves-value"]');
    const elPendingDesc = this.container.querySelector<HTMLElement>('[data-ref="kpi-pending-leaves-desc"]');
    const elPayrollVal = this.container.querySelector<HTMLElement>('[data-ref="kpi-payroll-value"]');

    if (elActiveVal) elActiveVal.textContent = String(kpis.activeEmployees);
    if (elActiveDesc) {
      elActiveDesc.textContent = `${kpis.totalEmployees} en plantilla • ${kpis.departmentsCount} departamentos`;
    }
    if (elVacVal) {
      elVacVal.textContent = String(kpis.onLeaveEmployees);
    }
    if (elVacDesc) {
      elVacDesc.textContent = `${kpis.probationEmployees} en periodo de prueba • ${kpis.newHiresLast30Days} nuevos (30d)`;
    }
    if (elPendingVal) elPendingVal.textContent = String(kpis.pendingLeaveRequests);
    if (elPendingDesc) {
      elPendingDesc.textContent = `${kpis.approvedLeaveDaysThisYear} días aprobados en el año`;
    }
    if (elPayrollVal) elPayrollVal.textContent = formatCurrency(kpis.monthlyPayrollTotal);
  }

  private async loadEmployees(): Promise<void> {
    const params = new URLSearchParams();
    if (this.searchQuery) params.set('search', this.searchQuery);
    if (this.statusFilter !== 'all') params.set('status', this.statusFilter);
    if (this.departmentFilter !== 'all') params.set('department', this.departmentFilter);

    const res = await getApi<HrEmployee[]>(`/api/hr/employees?${params.toString()}`);
    if (res.success && Array.isArray(res.data)) {
      this.employees = res.data;
      if (this.selectedEmployee) {
        this.selectedEmployee = this.employees.find((e) => e.uuid === this.selectedEmployee?.uuid) || null;
      }
      const badgeEmp = this.container.querySelector<HTMLElement>('[data-ref="badge-count-employees"]');
      if (badgeEmp) badgeEmp.textContent = String(this.employees.length);
      if (this.activeTab === 'employees') {
        this.renderEmployeesTable();
        this.updateSelectionUi();
      }
    }
  }

  private async loadLeaveRequests(): Promise<void> {
    const params = new URLSearchParams();
    if (this.searchQuery) params.set('search', this.searchQuery);
    const res = await getApi<HrLeaveRequest[]>(`/api/hr/leaves?${params.toString()}`);
    if (res.success && Array.isArray(res.data)) {
      let list = res.data;
      if (this.departmentFilter !== 'all') {
        list = list.filter((l) => l.department === this.departmentFilter);
      }
      this.leaveRequests = list;
      if (this.selectedLeave) {
        this.selectedLeave = this.leaveRequests.find((l) => l.uuid === this.selectedLeave?.uuid) || null;
      }
      const badgeLeaves = this.container.querySelector<HTMLElement>('[data-ref="badge-count-leaves"]');
      if (badgeLeaves) badgeLeaves.textContent = String(this.leaveRequests.length);
      if (this.activeTab === 'leaves') {
        this.renderLeavesTable();
        this.updateSelectionUi();
      }
    }
  }

  private renderActiveTab(): void {
    if (this.activeTab === 'employees') {
      this.renderEmployeesTable();
    } else {
      this.renderLeavesTable();
    }
  }

  private updatePaginationUi(totalItems: number): void {
    this.totalPages = Math.max(1, Math.ceil(totalItems / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }

    if (this.inputPaginationPage) {
      this.inputPaginationPage.value = String(this.currentPage);
      this.inputPaginationPage.min = '1';
      this.inputPaginationPage.max = String(this.totalPages);
      this.inputPaginationPage.disabled = this.totalPages <= 1;
    }
    if (this.btnPaginationPrev) {
      this.btnPaginationPrev.disabled = this.currentPage <= 1;
    }
    if (this.btnPaginationNext) {
      this.btnPaginationNext.disabled = this.currentPage >= this.totalPages;
    }
  }

  private updateSelectionUi(): void {
    const hasEmpSelected = this.activeTab === 'employees' && this.selectedEmployee !== null;
    const hasLeaveSelected = this.activeTab === 'leaves' && this.selectedLeave !== null;

    const canCreate = hasPermission('hr:create') || hasPermission('hr:manage');
    const canManage = hasPermission('hr:manage');
    const canDelete = hasPermission('hr:delete');

    if (this.defaultActions) {
      this.defaultActions.classList.toggle('is-hidden', hasEmpSelected || hasLeaveSelected);
    }
    if (this.selectedActions) {
      this.selectedActions.classList.toggle('is-hidden', !hasEmpSelected);
    }
    if (this.leaveSelectedActions) {
      this.leaveSelectedActions.classList.toggle('is-hidden', !hasLeaveSelected);
    }

    if (hasEmpSelected) {
      if (this.btnActionEdit) this.btnActionEdit.classList.toggle('is-hidden', !canManage);
      if (this.btnActionVacation) this.btnActionVacation.classList.toggle('is-hidden', !canCreate);
      if (this.btnActionEvent) this.btnActionEvent.classList.toggle('is-hidden', !canManage);
      if (this.btnActionStatus) this.btnActionStatus.classList.toggle('is-hidden', !canManage);
      if (this.btnActionDelete) this.btnActionDelete.classList.toggle('is-hidden', !canDelete);
    }

    if (hasLeaveSelected && this.selectedLeave) {
      const isPending = this.selectedLeave.status === 'pending';
      if (this.btnLeaveApprove) this.btnLeaveApprove.classList.toggle('is-hidden', !canManage || !isPending);
      if (this.btnLeaveReject) this.btnLeaveReject.classList.toggle('is-hidden', !canManage || !isPending);
    }

    const empRows = this.container.querySelectorAll<HTMLElement>('[data-employee-uuid]');
    empRows.forEach((row) => {
      const isSelected = row.getAttribute('data-employee-uuid') === this.selectedEmployee?.uuid;
      row.classList.toggle('is-selected', isSelected);
    });

    const leaveRows = this.container.querySelectorAll<HTMLElement>('[data-leave-uuid]');
    leaveRows.forEach((row) => {
      const isSelected = row.getAttribute('data-leave-uuid') === this.selectedLeave?.uuid;
      row.classList.toggle('is-selected', isSelected);
    });
  }

  private resetFilters(): void {
    this.searchQuery = '';
    this.statusFilter = 'all';
    this.departmentFilter = 'all';
    this.currentPage = 1;
    if (this.inputSearch) this.inputSearch.value = '';
    if (this.btnClearSearch) this.btnClearSearch.classList.add('is-hidden');

    const statusBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-status-filter]');
    statusBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-status-filter') === 'all'));

    const deptBtns = this.container.querySelectorAll<HTMLButtonElement>('[data-dept-filter]');
    deptBtns.forEach((b) => b.classList.toggle('is-active', b.getAttribute('data-dept-filter') === 'all'));

    void this.loadAllData();
  }

  private renderEmployeesTable(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tbody-hr-employees"]');
    if (!tbody) return;

    this.updatePaginationUi(this.employees.length);

    if (this.employees.length === 0) {
      const isFiltered = Boolean(
        this.searchQuery || this.statusFilter !== 'all' || this.departmentFilter !== 'all'
      );
      tbody.innerHTML = `
        <tr class="winners-table__tr-empty" data-ref="tr-hr-employees-empty">
          <td class="winners-table__td-empty" colspan="7">
            <div class="component-empty-state component-empty-state--table" data-ref="hr-employees-empty-state">
              <div class="component-empty-state-graphic">
                ${getEmptyIllustration(isFiltered ? 'search' : 'hr')}
              </div>
              <h2 class="component-empty-state-title">Sin colaboradores encontrados</h2>
              <p class="component-empty-state-desc">${
                isFiltered
                  ? 'No se encontraron colaboradores que coincidan con los filtros seleccionados.'
                  : 'Aún no hay colaboradores dados de alta en el directorio de Recursos Humanos.'
              }</p>
              ${
                isFiltered
                  ? `<div class="component-empty-state-actions">
                      <button type="button" class="component-button component-button--h36 component-button--secondary component-button--pill" data-ref="btn-empty-reset-hr">Restablecer Filtros</button>
                    </div>`
                  : ''
              }
            </div>
          </td>
        </tr>
      `;
      const btnReset = tbody.querySelector<HTMLButtonElement>('[data-ref="btn-empty-reset-hr"]');
      btnReset?.addEventListener('click', (e) => {
        e.preventDefault();
        this.resetFilters();
      });
      return;
    }

    const start = (this.currentPage - 1) * this.pageSize;
    const pageItems = this.employees.slice(start, start + this.pageSize);

    tbody.innerHTML = pageItems.map((emp) => this.buildEmployeeRowHtml(emp)).join('');
    renderIcons(tbody);

    const rows = tbody.querySelectorAll<HTMLElement>('[data-employee-uuid]');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-employee-uuid');
      if (!uuid) return;
      const emp = this.employees.find((item) => item.uuid === uuid);
      if (!emp) return;

      row.addEventListener('click', () => {
        if (this.selectedEmployee?.uuid === emp.uuid) {
          this.selectedEmployee = null;
        } else {
          this.selectedEmployee = emp;
        }
        this.updateSelectionUi();
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        void this.openEmployeeDossierModal(emp.uuid);
      });
    });
  }

  private buildEmployeeRowHtml(emp: HrEmployee): string {
    const isSelected = this.selectedEmployee?.uuid === emp.uuid;
    const initials = getInitials(emp.full_name);
    const allowance = Math.max(1, emp.vacation_days_total || 12);
    const available = Math.max(0, emp.vacation_days_available);
    const pct = Math.min(100, Math.round((available / allowance) * 100));
    const barClass =
      pct <= 20 ? 'hr-vacation-bar__fill--low' : pct <= 50 ? 'hr-vacation-bar__fill--warn' : '';

    return `
      <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-ref="tr-emp-${escapeHtml(emp.uuid)}" data-employee-uuid="${escapeHtml(emp.uuid)}">
        <td class="winners-table__td">
          <div class="hr-employee-cell">
            <div class="hr-employee-avatar">${escapeHtml(initials)}</div>
            <div class="hr-employee-info">
              <div class="hr-employee-name-row">
                <span class="hr-employee-name">${escapeHtml(emp.full_name)}</span>
                <span class="hr-employee-code">${escapeHtml(emp.employee_code)}</span>
              </div>
              <span class="hr-employee-sub">${escapeHtml(emp.email)} • ${escapeHtml(formatPhone(emp.phone))}</span>
            </div>
          </div>
        </td>
        <td class="winners-table__td">
          <div class="hr-job-cell">
            <span class="hr-job-title">${escapeHtml(emp.position_title)}</span>
            <span class="hr-job-dept">${escapeHtml(getDepartmentLabel(emp.department))}</span>
          </div>
        </td>
        <td class="winners-table__td">
          <div class="hr-job-cell">
            <span class="hr-job-title">${escapeHtml(getContractLabel(emp.employment_type))}</span>
            <span class="hr-job-dept">${escapeHtml(getModalityLabel(emp.work_modality))} • ${escapeHtml(emp.location_state || 'México')}</span>
          </div>
        </td>
        <td class="winners-table__td">
          <div class="hr-job-cell">
            <span class="hr-job-title">${escapeHtml(formatCurrency(emp.monthly_salary, emp.currency))}</span>
            <span class="hr-job-dept">Pago ${escapeHtml(getFrequencyLabel(emp.payment_frequency))}</span>
          </div>
        </td>
        <td class="winners-table__td">
          <div class="hr-vacation-cell">
            <div class="hr-vacation-top">
              <span class="hr-vacation-days">${available} disp.</span>
              <span class="hr-vacation-total">de ${emp.vacation_days_total} días</span>
            </div>
            <div class="hr-vacation-bar">
              <div class="hr-vacation-bar__fill ${barClass}" style="width: ${pct}%"></div>
            </div>
          </div>
        </td>
        <td class="winners-table__td">
          <span class="hr-status-badge hr-status-badge--${escapeHtml(emp.status)}">${escapeHtml(getEmploymentStatusLabel(emp.status))}</span>
        </td>
        <td class="winners-table__td">
          <div class="hr-job-cell">
            <span class="hr-job-title">${escapeHtml(formatDateShort(emp.hire_date))}</span>
            <span class="hr-job-dept">${escapeHtml(calculateTenure(emp.hire_date))}</span>
          </div>
        </td>
      </tr>
    `;
  }

  private renderLeavesTable(): void {
    const tbody = this.container.querySelector<HTMLElement>('[data-ref="tbody-hr-leaves"]');
    if (!tbody) return;

    this.updatePaginationUi(this.leaveRequests.length);

    if (this.leaveRequests.length === 0) {
      tbody.innerHTML = `
        <tr class="winners-table__tr-empty" data-ref="tr-hr-leaves-empty">
          <td class="winners-table__td-empty" colspan="8">
            <div class="component-empty-state component-empty-state--table" data-ref="hr-leaves-empty-state">
              <div class="component-empty-state-graphic">
                ${getEmptyIllustration('leaves')}
              </div>
              <h2 class="component-empty-state-title">Sin solicitudes de vacaciones o permisos</h2>
              <p class="component-empty-state-desc">No existen solicitudes registradas con los criterios actuales.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const start = (this.currentPage - 1) * this.pageSize;
    const pageItems = this.leaveRequests.slice(start, start + this.pageSize);
    const canManage = hasPermission('hr:manage');

    tbody.innerHTML = pageItems
      .map((leave) => {
        const isSelected = this.selectedLeave?.uuid === leave.uuid;
        const folio = `VAC-${leave.uuid.slice(0, 6).toUpperCase()}`;
        const isPending = leave.status === 'pending';

        const actionCellHtml =
          isPending && canManage
            ? `
              <div class="hr-inline-actions" data-ref="inline-leave-actions-${escapeHtml(leave.uuid)}">
                <button type="button" class="component-button component-button--h32 component-button--secondary hr-btn-approve" data-ref="btn-inline-approve-${escapeHtml(leave.uuid)}" data-inline-approve="${escapeHtml(leave.uuid)}">Aprobar</button>
                <button type="button" class="component-button component-button--h32 component-button--secondary" data-ref="btn-inline-reject-${escapeHtml(leave.uuid)}" data-inline-reject="${escapeHtml(leave.uuid)}">Rechazar</button>
              </div>
            `
            : `<span class="hr-job-dept">${escapeHtml(leave.reviewed_by_name ? `Por ${leave.reviewed_by_name}` : 'En revisión')}</span>`;

        return `
          <tr class="winners-table__tr ${isSelected ? 'is-selected' : ''}" data-ref="tr-leave-${escapeHtml(leave.uuid)}" data-leave-uuid="${escapeHtml(leave.uuid)}">
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${escapeHtml(folio)}</span>
            </td>
            <td class="winners-table__td">
              <div class="hr-job-cell">
                <span class="hr-job-title">${escapeHtml(leave.employee_name || 'Colaborador')}</span>
                <span class="hr-job-dept">${escapeHtml(leave.employee_code || '')} • ${escapeHtml(getDepartmentLabel(leave.department))}</span>
              </div>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm">${escapeHtml(getLeaveTypeLabel(leave.leave_type))}</span>
            </td>
            <td class="winners-table__td">
              <div class="hr-job-cell">
                <span class="hr-job-title">${escapeHtml(formatDateShort(leave.start_date))} — ${escapeHtml(formatDateShort(leave.end_date))}</span>
                <span class="hr-job-dept">Solicitado ${escapeHtml(formatDateShort(leave.created_at))}</span>
              </div>
            </td>
            <td class="winners-table__td">
              <span class="component-badge component-badge--sm component-badge--mono-bold">${leave.days_count} ${leave.days_count === 1 ? 'día' : 'días'}</span>
            </td>
            <td class="winners-table__td">
              <span class="hr-job-dept">${escapeHtml(leave.reason || 'Sin observaciones adicionales')}</span>
            </td>
            <td class="winners-table__td">
              <span class="hr-status-badge hr-status-badge--${escapeHtml(leave.status)}">${escapeHtml(getLeaveStatusLabel(leave.status))}</span>
            </td>
            <td class="winners-table__td">
              ${actionCellHtml}
            </td>
          </tr>
        `;
      })
      .join('');

    renderIcons(tbody);

    const rows = tbody.querySelectorAll<HTMLElement>('[data-leave-uuid]');
    rows.forEach((row) => {
      const uuid = row.getAttribute('data-leave-uuid');
      if (!uuid) return;
      const leave = this.leaveRequests.find((item) => item.uuid === uuid);
      if (!leave) return;

      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        if (this.selectedLeave?.uuid === leave.uuid) {
          this.selectedLeave = null;
        } else {
          this.selectedLeave = leave;
        }
        this.updateSelectionUi();
      });

      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        this.openLeaveDetailModal(leave);
      });
    });

    const approveBtns = tbody.querySelectorAll<HTMLButtonElement>('[data-inline-approve]');
    approveBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uuid = btn.getAttribute('data-inline-approve');
        const leave = this.leaveRequests.find((item) => item.uuid === uuid);
        if (leave) this.openReviewLeaveModal(leave, 'approve');
      });
    });

    const rejectBtns = tbody.querySelectorAll<HTMLButtonElement>('[data-inline-reject]');
    rejectBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const uuid = btn.getAttribute('data-inline-reject');
        const leave = this.leaveRequests.find((item) => item.uuid === uuid);
        if (leave) this.openReviewLeaveModal(leave, 'reject');
      });
    });
  }

  private buildCustomDropdownHtml(
    key: string,
    label: string,
    options: SelectOption[],
    selectedValue: string
  ): string {
    const current = options.find((o) => o.value === selectedValue) || options[0];
    const itemsHtml = options
      .map(
        (opt) => `
          <button type="button" class="menu-item ${opt.value === current.value ? 'is-active' : ''}" data-ref="option-${key}-${escapeHtml(opt.value)}" data-select-key="${key}" data-select-value="${escapeHtml(opt.value)}">
            <svg class="component-icon menu-item__icon" aria-hidden="true"><use href="/icons.svg#${opt.icon}"></use></svg>
            <span class="menu-item__text">${escapeHtml(opt.label)}</span>
          </button>
        `
      )
      .join('');

    return `
      <div class="field field--dropdown" data-ref="field-dropdown-${key}">
        <span class="field__label">${escapeHtml(label)}</span>
        <div class="settings-dropdown-wrapper dropdown-wrapper dropdown-wrapper--full" data-ref="dropdown-wrapper-${key}">
          <button type="button" class="dropdown-trigger dropdown-trigger--full" data-ref="btn-trigger-${key}" aria-label="${escapeHtml(label)}">
            <div class="dropdown-trigger__left">
              <svg class="component-icon dropdown-trigger__icon" data-ref="icon-selected-${key}" aria-hidden="true"><use href="/icons.svg#${current.icon}"></use></svg>
              <span class="dropdown-trigger__text" data-ref="text-selected-${key}">${escapeHtml(current.label)}</span>
            </div>
            <svg class="component-icon dropdown-trigger__chevron" aria-hidden="true"><use href="/icons.svg#expand_more"></use></svg>
          </button>
          <div class="dropdown-backdrop" data-ref="dropdown-backdrop-${key}">
            <div class="menu-panel menu-panel--dropdown menu-panel--w-full menu-panel--h-auto" data-ref="dropdown-menu-${key}">
              <div class="menu-panel__list menu-panel__list--scrollable" data-ref="list-options-${key}">
                ${itemsHtml}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private wireCustomDropdown(
    container: HTMLElement,
    key: string,
    options: SelectOption[],
    onChange: (val: string) => void
  ): DropdownController | null {
    const wrapper = container.querySelector<HTMLElement>(`[data-ref="dropdown-wrapper-${key}"]`);
    if (!wrapper) return null;
    const controller = setupDropdown(wrapper, {
      isSelect: true,
      matchWidth: true,
      placement: 'bottom-start',
    });
    const textEl = container.querySelector<HTMLElement>(`[data-ref="text-selected-${key}"]`);
    const iconUse = container.querySelector<SVGUseElement>(`[data-ref="icon-selected-${key}"] use`);
    const optionBtns = container.querySelectorAll<HTMLButtonElement>(`[data-select-key="${key}"]`);

    optionBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const val = btn.getAttribute('data-select-value') || '';
        const found = options.find((o) => o.value === val);
        if (found) {
          if (textEl) textEl.textContent = found.label;
          if (iconUse) iconUse.setAttribute('href', `/icons.svg#${found.icon}`);
        }
        optionBtns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        onChange(val);
        controller.close();
      });
    });

    return controller;
  }

  private async openEmployeeDossierModal(uuid: string): Promise<void> {
    const res = await getApi<HrEmployeeDetail>(`/api/hr/employees/${uuid}`);
    if (!res.success || !res.data) {
      showToast(res.error || 'No se pudo cargar el expediente del colaborador.', 'danger');
      return;
    }

    const { employee, events, leaveRequests: leaves } = res.data;
    const initials = getInitials(employee.full_name);
    const canManage = hasPermission('hr:manage');
    const canCreate = hasPermission('hr:create') || canManage;

    const leavesHtml =
      leaves.length > 0
        ? leaves
            .map(
              (lv) => `
                <div class="hr-timeline-item" data-ref="dossier-leave-${escapeHtml(lv.uuid)}">
                  <div class="hr-timeline-dot"></div>
                  <div class="hr-timeline-content">
                    <div class="hr-dossier-data-row">
                      <span class="hr-timeline-title">${escapeHtml(getLeaveTypeLabel(lv.leave_type))} (${lv.days_count} ${lv.days_count === 1 ? 'día' : 'días'})</span>
                      <span class="hr-status-badge hr-status-badge--${escapeHtml(lv.status)}">${escapeHtml(getLeaveStatusLabel(lv.status))}</span>
                    </div>
                    <span class="hr-timeline-desc">${escapeHtml(formatDateShort(lv.start_date))} al ${escapeHtml(formatDateShort(lv.end_date))} • ${escapeHtml(lv.reason || 'Sin motivo especificado')}</span>
                    <span class="hr-timeline-meta">${escapeHtml(lv.reviewed_by_name ? `Dictaminado por ${lv.reviewed_by_name}` : 'En revisión por RRHH')}</span>
                  </div>
                </div>
              `
            )
            .join('')
        : '<span class="hr-job-dept">Sin historial de vacaciones o permisos registrados.</span>';

    const eventsHtml =
      events.length > 0
        ? events
            .map(
              (ev) => `
                <div class="hr-timeline-item" data-ref="dossier-event-${escapeHtml(ev.uuid)}">
                  <div class="hr-timeline-dot"></div>
                  <div class="hr-timeline-content">
                    <span class="hr-timeline-title">${escapeHtml(ev.title)}</span>
                    <span class="hr-timeline-desc">${escapeHtml(ev.description || '')}${ev.new_value ? ` (${escapeHtml(ev.previous_value || '—')} → ${escapeHtml(ev.new_value)})` : ''}</span>
                    <span class="hr-timeline-meta">${escapeHtml(formatDateShort(ev.created_at))} • Registrado por ${escapeHtml(ev.recorded_by_name || 'RRHH')}</span>
                  </div>
                </div>
              `
            )
            .join('')
        : '<span class="hr-job-dept">Sin movimientos registrados en el kárdex.</span>';

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'hr-dossier-layout';
    bodyContainer.innerHTML = `
      <div class="hr-dossier-hero" data-ref="dossier-hero">
        <div class="hr-dossier-hero__left">
          <div class="hr-dossier-avatar">${escapeHtml(initials)}</div>
          <div class="hr-dossier-hero__info">
            <h3 class="hr-dossier-hero__name">${escapeHtml(employee.full_name)}</h3>
            <span class="hr-dossier-hero__role">${escapeHtml(employee.position_title)} • ${escapeHtml(getDepartmentLabel(employee.department))}</span>
            <div class="hr-dossier-hero__badges">
              <span class="hr-employee-code">${escapeHtml(employee.employee_code)}</span>
              <span class="hr-status-badge hr-status-badge--${escapeHtml(employee.status)}">${escapeHtml(getEmploymentStatusLabel(employee.status))}</span>
              <span class="component-badge component-badge--sm">${escapeHtml(getContractLabel(employee.employment_type))} (${escapeHtml(getModalityLabel(employee.work_modality))})</span>
            </div>
          </div>
        </div>
        <div class="hr-dossier-hero__actions">
          ${
            canCreate
              ? `<button type="button" class="component-button component-button--h32 component-button--secondary" data-ref="btn-dossier-vacation">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#flight_takeoff"></use></svg>
                  <span>Vacaciones</span>
                </button>`
              : ''
          }
          ${
            canManage
              ? `<button type="button" class="component-button component-button--h32 component-button--secondary" data-ref="btn-dossier-event">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#event_note"></use></svg>
                  <span>Registrar Evento</span>
                </button>
                <button type="button" class="component-button component-button--h32 component-button--black" data-ref="btn-dossier-edit">
                  <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#edit"></use></svg>
                  <span>Editar Ficha</span>
                </button>`
              : ''
          }
        </div>
      </div>

      <div class="hr-dossier-stats-grid" data-ref="dossier-stats">
        <div class="hr-dossier-stat-card">
          <span class="hr-dossier-stat-label">Salario Base (${escapeHtml(getFrequencyLabel(employee.payment_frequency))})</span>
          <strong class="hr-dossier-stat-value hr-dossier-stat-value--accent">${escapeHtml(formatCurrency(employee.monthly_salary, employee.currency))}</strong>
        </div>
        <div class="hr-dossier-stat-card">
          <span class="hr-dossier-stat-label">Vacaciones Disponibles</span>
          <strong class="hr-dossier-stat-value">${employee.vacation_days_available} de ${employee.vacation_days_total} días</strong>
        </div>
        <div class="hr-dossier-stat-card">
          <span class="hr-dossier-stat-label">Fecha de Ingreso</span>
          <strong class="hr-dossier-stat-value">${escapeHtml(formatDateShort(employee.hire_date))} (${escapeHtml(calculateTenure(employee.hire_date))})</strong>
        </div>
        <div class="hr-dossier-stat-card">
          <span class="hr-dossier-stat-label">Ubicación Laboral</span>
          <strong class="hr-dossier-stat-value">${escapeHtml(employee.location_state || 'México')}</strong>
        </div>
      </div>

      <div class="hr-dossier-columns" data-ref="dossier-info-columns">
        <div class="hr-dossier-panel">
          <div class="hr-dossier-panel__header">
            <h4 class="hr-dossier-panel__title">Datos Fiscales y Dispersión de Nómina</h4>
          </div>
          <div class="hr-dossier-data-list">
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">RFC (SAT)</span>
              <span class="hr-dossier-data-val hr-dossier-data-val--mono">${escapeHtml(employee.rfc || 'No registrado')}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">CURP</span>
              <span class="hr-dossier-data-val hr-dossier-data-val--mono">${escapeHtml(employee.curp || 'No registrado')}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">NSS (IMSS)</span>
              <span class="hr-dossier-data-val hr-dossier-data-val--mono">${escapeHtml(employee.nss || 'No registrado')}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Institución Bancaria</span>
              <span class="hr-dossier-data-val">${escapeHtml(employee.bank_name || 'Por asignar')}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">CLABE Interbancaria</span>
              <span class="hr-dossier-data-val hr-dossier-data-val--mono">${escapeHtml(employee.clabe || '—')}</span>
            </div>
          </div>
        </div>

        <div class="hr-dossier-panel">
          <div class="hr-dossier-panel__header">
            <h4 class="hr-dossier-panel__title">Contacto Directo y Emergencias</h4>
          </div>
          <div class="hr-dossier-data-list">
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Correo Corporativo</span>
              <span class="hr-dossier-data-val">${escapeHtml(employee.email)}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Teléfono Móvil</span>
              <span class="hr-dossier-data-val hr-dossier-data-val--mono">${escapeHtml(formatPhone(employee.phone))}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Contacto de Emergencia</span>
              <span class="hr-dossier-data-val">${escapeHtml(employee.emergency_contact_name || 'No especificado')}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Tel. de Emergencia</span>
              <span class="hr-dossier-data-val hr-dossier-data-val--mono">${escapeHtml(formatPhone(employee.emergency_contact_phone))}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Notas RRHH</span>
              <span class="hr-dossier-data-val">${escapeHtml(employee.notes || 'Sin notas')}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="hr-dossier-columns" data-ref="dossier-history-columns">
        <div class="hr-dossier-panel">
          <div class="hr-dossier-panel__header">
            <h4 class="hr-dossier-panel__title">Historial de Vacaciones y Ausencias (${leaves.length})</h4>
          </div>
          <div class="hr-timeline-list">
            ${leavesHtml}
          </div>
        </div>

        <div class="hr-dossier-panel">
          <div class="hr-dossier-panel__header">
            <h4 class="hr-dossier-panel__title">Kárdex y Trayectoria Laboral (${events.length})</h4>
          </div>
          <div class="hr-timeline-list">
            ${eventsHtml}
          </div>
        </div>
      </div>
    `;

    const modal = openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cerrar Expediente',
      description: `Expediente integral y kárdex de auditoría • ${employee.employee_code}`,
      size: 'lg',
      title: `Expediente Laboral: ${employee.full_name}`,
    });

    renderIcons(bodyContainer);

    bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-dossier-edit"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.close();
      navigate(`/hr/${employee.uuid}/edit`);
    });

    bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-dossier-vacation"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.close();
      this.openCreateLeaveModal(employee);
    });

    bodyContainer.querySelector<HTMLButtonElement>('[data-ref="btn-dossier-event"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      modal.close();
      this.openCreateEventModal(employee);
    });
  }

  private openCreateLeaveModal(preselectedEmployee?: HrEmployee): void {
    const activeStaff = this.employees.filter((e) => e.status !== 'terminated');
    if (activeStaff.length === 0) {
      showToast('No hay colaboradores activos para registrar vacaciones o permisos.', 'warning');
      return;
    }

    const empOptions: SelectOption[] = activeStaff.map((e) => ({
      icon: 'badge',
      label: `${e.full_name} (${e.employee_code}) • ${e.vacation_days_available} días disp.`,
      value: e.uuid,
    }));

    let selectedEmpUuid = preselectedEmployee?.uuid || empOptions[0].value;
    let selectedLeaveType: HrLeaveType = 'vacation';

    const today = new Date().toISOString().slice(0, 10);
    const canManage = hasPermission('hr:manage');

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="hr-modal-form" data-ref="hr-leave-modal-form">
        ${this.buildCustomDropdownHtml('leave-emp', 'Colaborador Solicitante', empOptions, selectedEmpUuid)}
        ${this.buildCustomDropdownHtml('leave-type', 'Tipo de Ausencia o Permiso', LEAVE_TYPE_OPTIONS, selectedLeaveType)}

        <div class="hr-form-grid-2">
          ${buildDatePickerDropdownHtml({
            fieldRef: 'field-leave-start',
            initialValue: today,
            inputRef: 'input-leave-start',
            key: 'leave-start',
            label: 'Fecha de Inicio *',
          })}
          ${buildDatePickerDropdownHtml({
            fieldRef: 'field-leave-end',
            initialValue: today,
            inputRef: 'input-leave-end',
            key: 'leave-end',
            label: 'Fecha de Fin (Regreso al día siguiente) *',
          })}
        </div>

        <div class="hr-leave-calc-banner" data-ref="leave-calc-banner">
          <span>Días solicitados a descontar / registrar:</span>
          <strong data-ref="leave-calc-days">1 día</strong>
        </div>

        <label class="field" data-ref="field-leave-reason">
          <input class="field__input" data-ref="input-leave-reason" type="text" placeholder=" " maxlength="300" value="Periodo vacacional programado" />
          <span class="field__label">Motivo o Justificación</span>
        </label>

        ${
          canManage
            ? `<label class="bank-checkbox-label" data-ref="label-leave-auto-approve">
                <input class="bank-checkbox-input" data-ref="check-leave-auto-approve" type="checkbox" checked />
                <span>Autorizar inmediatamente y actualizar saldo de vacaciones del colaborador</span>
              </label>`
            : ''
        }
      </div>
    `;

    renderIcons(bodyContainer);

    const inputStart = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-leave-start"]');
    const inputEnd = bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-leave-end"]');
    const calcDaysEl = bodyContainer.querySelector<HTMLElement>('[data-ref="leave-calc-days"]');

    const updateCalc = (): void => {
      const days = computeDaysBetween(inputStart?.value || '', inputEnd?.value || '');
      const emp = this.employees.find((e) => e.uuid === selectedEmpUuid);
      if (calcDaysEl) {
        const balanceInfo =
          emp && selectedLeaveType === 'vacation'
            ? ` (Saldo actual: ${emp.vacation_days_available} días)`
            : '';
        calcDaysEl.textContent = `${days} ${days === 1 ? 'día' : 'días'}${balanceInfo}`;
      }
    };

    const empDropdown = this.wireCustomDropdown(bodyContainer, 'leave-emp', empOptions, (val) => {
      selectedEmpUuid = val;
      updateCalc();
    });
    const typeDropdown = this.wireCustomDropdown(bodyContainer, 'leave-type', LEAVE_TYPE_OPTIONS, (val) => {
      selectedLeaveType = val as HrLeaveType;
      updateCalc();
    });

    let endDateDropdown: DatePickerDropdownController | null = null;
    const startDateDropdown = setupDatePickerDropdown(bodyContainer, {
      fieldRef: 'field-leave-start',
      initialValue: today,
      inputRef: 'input-leave-start',
      key: 'leave-start',
      label: 'Fecha de Inicio *',
      onChange: (newStart) => {
        if (endDateDropdown && endDateDropdown.getValue() < newStart) {
          endDateDropdown.setValue(newStart, true);
        }
        updateCalc();
      },
      placement: 'bottom-start',
    });
    endDateDropdown = setupDatePickerDropdown(bodyContainer, {
      fieldRef: 'field-leave-end',
      initialValue: today,
      inputRef: 'input-leave-end',
      key: 'leave-end',
      label: 'Fecha de Fin (Regreso al día siguiente) *',
      onChange: () => {
        updateCalc();
      },
      placement: 'bottom-end',
    });

    inputStart?.addEventListener('change', updateCalc);
    inputEnd?.addEventListener('change', updateCalc);
    updateCalc();

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Registrar Solicitud',
      description: 'Registra un periodo de vacaciones, permiso con goce o incapacidad médica.',
      onClose: () => {
        empDropdown?.destroy();
        typeDropdown?.destroy();
        startDateDropdown?.destroy();
        endDateDropdown?.destroy();
      },
      onConfirm: async () => {
        const startDate = inputStart?.value || '';
        const endDate = inputEnd?.value || '';
        const reason = (
          bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-leave-reason"]')?.value || ''
        ).trim();
        const autoApprove = Boolean(
          bodyContainer.querySelector<HTMLInputElement>('[data-ref="check-leave-auto-approve"]')?.checked
        );

        if (!startDate || !endDate || endDate < startDate) {
          showToast('La fecha de fin debe ser igual o posterior a la fecha de inicio.', 'warning');
          return false;
        }

        const daysCount = computeDaysBetween(startDate, endDate);
        const res = await postApi<HrLeaveRequest>('/api/hr/leaves', {
          auto_approve: autoApprove,
          days_count: daysCount,
          employee_uuid: selectedEmpUuid,
          end_date: endDate,
          leave_type: selectedLeaveType,
          reason: reason || null,
          start_date: startDate,
        });

        if (res.success) {
          showToast(
            autoApprove
              ? 'Vacaciones / permiso autorizado y aplicado al expediente.'
              : 'Solicitud de ausencia registrada para revisión.',
            'success'
          );
          await this.loadAllData();
          return true;
        } else {
          showToast(res.error || 'No se pudo registrar la solicitud de ausencia.', 'danger');
          return false;
        }
      },
      size: 'md',
      title: 'Registrar Vacaciones o Permiso',
    });
  }

  private openReviewLeaveModal(leave: HrLeaveRequest, action: 'approve' | 'reject'): void {
    const isApprove = action === 'approve';
    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="hr-modal-form" data-ref="hr-review-leave-form">
        <div class="hr-leave-calc-banner">
          <span><strong>${escapeHtml(leave.employee_name || 'Colaborador')}</strong> (${escapeHtml(leave.employee_code || '')})</span>
          <strong>${escapeHtml(getLeaveTypeLabel(leave.leave_type))} • ${leave.days_count} días</strong>
        </div>
        <p class="customer-block-modal-subtext">
          Periodo solicitado: <strong>${escapeHtml(formatDateShort(leave.start_date))}</strong> al <strong>${escapeHtml(formatDateShort(leave.end_date))}</strong>.
          ${isApprove && leave.leave_type === 'vacation' ? 'Al aprobarse, los días se descontarán automáticamente del saldo anual del colaborador.' : ''}
        </p>
        <label class="field" data-ref="field-review-notes">
          <input class="field__input" data-ref="input-review-notes" type="text" placeholder=" " value="${isApprove ? 'Autorizado por Recursos Humanos' : 'No procede en las fechas solicitadas por carga operativa'}" maxlength="250" />
          <span class="field__label">Dictamen / Observaciones de RRHH</span>
        </label>
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: isApprove ? 'component-button--black' : 'component-button--danger',
      confirmText: isApprove ? 'Confirmar Aprobación' : 'Rechazar Solicitud',
      description: `Folio VAC-${leave.uuid.slice(0, 6).toUpperCase()}`,
      onConfirm: async () => {
        const notes = (
          bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-review-notes"]')?.value || ''
        ).trim();
        const res = await patchApi<HrLeaveRequest>(`/api/hr/leaves/${leave.uuid}/review`, {
          action,
          review_notes: notes || null,
        });
        if (res.success) {
          showToast(
            isApprove ? 'Solicitud aprobada exitosamente.' : 'Solicitud rechazada.',
            isApprove ? 'success' : 'warning'
          );
          await this.loadAllData();
          return true;
        } else {
          showToast(res.error || 'Error al dictaminar la solicitud.', 'danger');
          return false;
        }
      },
      size: 'sm',
      title: isApprove ? 'Aprobar Vacaciones / Permiso' : 'Rechazar Solicitud',
    });
  }

  private openLeaveDetailModal(leave: HrLeaveRequest): void {
    const canManage = hasPermission('hr:manage');
    const isPending = leave.status === 'pending';

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="hr-dossier-layout" data-ref="leave-detail-layout">
        <div class="hr-dossier-panel">
          <div class="hr-dossier-data-list">
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Colaborador</span>
              <span class="hr-dossier-data-val">${escapeHtml(leave.employee_name || 'Colaborador')} (${escapeHtml(leave.employee_code || '')})</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Departamento y Puesto</span>
              <span class="hr-dossier-data-val">${escapeHtml(getDepartmentLabel(leave.department))} • ${escapeHtml(leave.position_title || '')}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Tipo de Solicitud</span>
              <span class="hr-dossier-data-val">${escapeHtml(getLeaveTypeLabel(leave.leave_type))}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Periodo</span>
              <span class="hr-dossier-data-val">${escapeHtml(formatDateShort(leave.start_date))} al ${escapeHtml(formatDateShort(leave.end_date))} (${leave.days_count} días)</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Estado Actual</span>
              <span class="hr-status-badge hr-status-badge--${escapeHtml(leave.status)}">${escapeHtml(getLeaveStatusLabel(leave.status))}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Motivo del Colaborador</span>
              <span class="hr-dossier-data-val">${escapeHtml(leave.reason || 'Sin observaciones')}</span>
            </div>
            <div class="hr-dossier-data-row">
              <span class="hr-dossier-data-label">Dictamen RRHH</span>
              <span class="hr-dossier-data-val">${escapeHtml(leave.review_notes || 'Pendiente de dictamen')}</span>
            </div>
          </div>
        </div>
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      cancelText: 'Cerrar',
      confirmClass: 'component-button--black',
      confirmText: 'Aprobar Solicitud',
      description: `Folio VAC-${leave.uuid.slice(0, 6).toUpperCase()}`,
      onConfirm: async () => {
        this.openReviewLeaveModal(leave, 'approve');
        return true;
      },
      showConfirm: canManage && isPending,
      size: 'md',
      title: 'Detalle de Solicitud de Ausencia',
    });
  }

  private openCreateEventModal(employee: HrEmployee): void {
    let selectedEventType: HrEventType = 'promotion';

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="hr-modal-form" data-ref="hr-event-modal-form">
        <div class="hr-leave-calc-banner">
          <span>Colaborador: <strong>${escapeHtml(employee.full_name)}</strong></span>
          <strong>${escapeHtml(formatCurrency(employee.monthly_salary, employee.currency))}</strong>
        </div>

        ${this.buildCustomDropdownHtml('event-type', 'Categoría del Evento en Kárdex', EVENT_TYPE_OPTIONS, selectedEventType)}

        <label class="field" data-ref="field-event-title">
          <input class="field__input" data-ref="input-event-title" type="text" placeholder=" " maxlength="150" value="Reconocimiento y Revisión de Desempeño" />
          <span class="field__label">Título del Evento *</span>
        </label>

        <label class="field" data-ref="field-event-salary">
          <input class="field__input" data-ref="input-event-salary" type="number" step="0.01" min="0" placeholder=" " value="" />
          <span class="field__label">Nuevo Salario Base Mensual MXN (Opcional, dejar vacío si no cambia)</span>
        </label>

        <label class="field" data-ref="field-event-desc">
          <input class="field__input" data-ref="input-event-desc" type="text" placeholder=" " maxlength="350" value="Cumplimiento sobresaliente de metas operativas trimestrales." />
          <span class="field__label">Descripción / Detalle en Expediente</span>
        </label>
      </div>
    `;

    renderIcons(bodyContainer);

    const typeDropdown = this.wireCustomDropdown(bodyContainer, 'event-type', EVENT_TYPE_OPTIONS, (val) => {
      selectedEventType = val as HrEventType;
    });

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Registrar en Kárdex',
      description: `Se añadirá un registro permanente de auditoría laboral a ${employee.employee_code}.`,
      onClose: () => {
        typeDropdown?.destroy();
      },
      onConfirm: async () => {
        const title = (
          bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-event-title"]')?.value || ''
        ).trim();
        const salaryRaw = (
          bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-event-salary"]')?.value || ''
        ).trim();
        const description = (
          bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-event-desc"]')?.value || ''
        ).trim();

        if (!title) {
          showToast('Ingresa el título del evento laboral.', 'warning');
          return false;
        }

        const payload: Record<string, any> = {
          description: description || null,
          event_type: selectedEventType,
          title,
        };
        if (salaryRaw && Number(salaryRaw) > 0) {
          payload.new_salary = Number(salaryRaw);
        }

        const res = await postApi<HrEmployeeEvent>(`/api/hr/employees/${employee.uuid}/events`, payload);
        if (res.success) {
          showToast('Evento registrado en el kárdex del colaborador.', 'success');
          await this.loadAllData();
          return true;
        } else {
          showToast(res.error || 'No se pudo registrar el evento.', 'danger');
          return false;
        }
      },
      size: 'md',
      title: 'Registrar Evento / Ajuste Salarial',
    });
  }

  private openStatusChangeModal(employee: HrEmployee): void {
    let selectedStatus: HrEmployeeStatus = employee.status;

    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="hr-modal-form" data-ref="hr-status-modal-form">
        <div class="hr-leave-calc-banner">
          <span>Colaborador: <strong>${escapeHtml(employee.full_name)}</strong></span>
          <span class="hr-status-badge hr-status-badge--${escapeHtml(employee.status)}">${escapeHtml(getEmploymentStatusLabel(employee.status))}</span>
        </div>

        ${this.buildCustomDropdownHtml('emp-status', 'Nuevo Estado Laboral', EMPLOYMENT_STATUS_OPTIONS, selectedStatus)}

        <label class="field" data-ref="field-status-reason">
          <input class="field__input" data-ref="input-status-reason" type="text" placeholder=" " maxlength="250" value="${escapeHtml(employee.termination_reason || '')}" />
          <span class="field__label">Motivo del Cambio / Causa de Baja (Requerido para bajas o suspensiones)</span>
        </label>
      </div>
    `;

    renderIcons(bodyContainer);

    const statusDropdown = this.wireCustomDropdown(
      bodyContainer,
      'emp-status',
      EMPLOYMENT_STATUS_OPTIONS,
      (val) => {
        selectedStatus = val as HrEmployeeStatus;
      }
    );

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--black',
      confirmText: 'Actualizar Estado Laboral',
      description: `Cambio de estatus operativo en plantilla para ${employee.employee_code}.`,
      onClose: () => {
        statusDropdown?.destroy();
      },
      onConfirm: async () => {
        const reason = (
          bodyContainer.querySelector<HTMLInputElement>('[data-ref="input-status-reason"]')?.value || ''
        ).trim();

        const res = await patchApi<HrEmployee>(`/api/hr/employees/${employee.uuid}/status`, {
          reason: reason || null,
          status: selectedStatus,
        });

        if (res.success) {
          showToast('Estado laboral actualizado correctamente.', 'success');
          await this.loadAllData();
          return true;
        } else {
          showToast(res.error || 'No se pudo actualizar el estado laboral.', 'danger');
          return false;
        }
      },
      size: 'sm',
      title: 'Cambiar Estado / Baja Laboral',
    });
  }

  private openDeleteEmployeeModal(employee: HrEmployee): void {
    const bodyContainer = document.createElement('div');
    bodyContainer.innerHTML = `
      <div class="customer-block-modal-content" data-ref="hr-delete-modal-content">
        <p class="customer-block-modal-text">
          ¿Estás seguro de que deseas eliminar permanentemente el expediente de <strong>${escapeHtml(employee.full_name)}</strong> (${escapeHtml(employee.employee_code)})?
        </p>
        <p class="customer-block-modal-subtext">
          Si deseas conservar el historial para auditoría de nómina, te recomendamos cambiar su estado a <strong>Baja Laboral</strong> en lugar de eliminar el registro.
        </p>
      </div>
    `;

    openModal({
      bodyHtml: bodyContainer,
      confirmClass: 'component-button--danger',
      confirmText: 'Eliminar Definitivamente',
      description: 'Esta acción eliminará el expediente y sus solicitudes asociadas.',
      onConfirm: async () => {
        const res = await deleteApi(`/api/hr/employees/${employee.uuid}`);
        if (res.success) {
          showToast('Registro de colaborador eliminado.', 'warning');
          this.selectedEmployee = null;
          await this.loadAllData();
          return true;
        } else {
          showToast(res.error || 'No se pudo eliminar el registro.', 'danger');
          return false;
        }
      },
      size: 'sm',
      title: 'Eliminar Registro de Personal',
    });
  }

  destroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (this.filterDropdownController) {
      this.filterDropdownController.destroy();
      this.filterDropdownController = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createHrView(): Promise<HTMLElement> {
  const container = await loadTemplate('/views/hr/hr.html');
  const controller = new HrController(container);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
