import { navigate } from '../app-router.js';
import { RouteContext } from '../config/routes.config.js';
import { getApi, postApi, putApi } from '../services/api.service.js';
import { renderIcons } from '../services/icon.service.js';
import { loadTemplate } from '../services/template.service.js';
import { showToast } from '../services/toast.service.js';
import { ViewController } from '../types/common.types.js';
import { buildDatePickerDropdownHtml, DatePickerDropdownController, DropdownController, escapeHtml, formatDateTriggerLabel, setupDatePickerDropdown, setupDropdown } from '../utils/dom.util.js';

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

interface HrEmployeeRecord {
  bank_name: string | null;
  clabe: string | null;
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
  location_state: string | null;
  monthly_salary: number;
  notes: string | null;
  nss: string | null;
  payment_frequency: HrPaymentFrequency;
  phone: string;
  position_title: string;
  rfc: string | null;
  status: HrEmployeeStatus;
  uuid: string;
  vacation_days_available: number;
  vacation_days_total: number;
  work_modality: HrWorkModality;
}

interface HrEmployeeDetailResponse {
  employee: HrEmployeeRecord;
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

const CONTRACT_TYPE_OPTIONS: SelectOption[] = [
  { icon: 'work', label: 'Tiempo Completo (Indeterminado)', value: 'full_time' },
  { icon: 'schedule', label: 'Medio Tiempo', value: 'part_time' },
  { icon: 'receipt_long', label: 'Honorarios / Servicios Profesionales', value: 'contractor' },
  { icon: 'school', label: 'Becario / Prácticas Profesionales', value: 'intern' },
];

const WORK_MODALITY_OPTIONS: SelectOption[] = [
  { icon: 'home', label: 'Híbrido', value: 'hybrid' },
  { icon: 'desktop_windows', label: 'Remoto (Home Office)', value: 'remote' },
  { icon: 'work', label: 'Presencial en Oficina', value: 'onsite' },
];

const PAYMENT_FREQUENCY_OPTIONS: SelectOption[] = [
  { icon: 'payments', label: 'Quincenal', value: 'biweekly' },
  { icon: 'calendar_month', label: 'Mensual', value: 'monthly' },
  { icon: 'schedule', label: 'Semanal', value: 'weekly' },
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

function getInitials(fullName: string): string {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'RH';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
}

function getContractShortLabel(contract: HrEmploymentType): string {
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

function getModalityShortLabel(modality: HrWorkModality): string {
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

function getStatusLabel(status: HrEmployeeStatus): string {
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

export class HrEmployeeFormController implements ViewController {
  private abortController: AbortController | null = null;
  private bannerError: HTMLElement | null = null;
  private btnBack: HTMLButtonElement | null = null;
  private btnCancel: HTMLButtonElement | null = null;
  private btnHeaderCancel: HTMLButtonElement | null = null;
  private btnHeaderSave: HTMLButtonElement | null = null;
  private btnSubmit: HTMLButtonElement | null = null;
  private container: HTMLElement;
  private dropdownControllers: Array<DropdownController | null> = [];
  private form: HTMLFormElement | null = null;
  private hireDateDropdown: DatePickerDropdownController | null = null;
  private inputBankName: HTMLInputElement | null = null;
  private inputClabe: HTMLInputElement | null = null;
  private inputCurp: HTMLInputElement | null = null;
  private inputEmail: HTMLInputElement | null = null;
  private inputEmergName: HTMLInputElement | null = null;
  private inputEmergPhone: HTMLInputElement | null = null;
  private inputFullName: HTMLInputElement | null = null;
  private inputHireDate: HTMLInputElement | null = null;
  private inputJobTitle: HTMLInputElement | null = null;
  private inputNotes: HTMLInputElement | null = null;
  private inputNss: HTMLInputElement | null = null;
  private inputPhone: HTMLInputElement | null = null;
  private inputRfc: HTMLInputElement | null = null;
  private inputSalary: HTMLInputElement | null = null;
  private inputState: HTMLInputElement | null = null;
  private inputVacAllowance: HTMLInputElement | null = null;
  private isSubmitting = false;
  private mode: 'create' | 'edit';
  private routeContext?: RouteContext;
  private selectedContract: HrEmploymentType = 'full_time';
  private selectedDepartment: HrDepartment = 'operations';
  private selectedFrequency: HrPaymentFrequency = 'biweekly';
  private selectedModality: HrWorkModality = 'hybrid';
  private uuid: string | null = null;

  constructor(container: HTMLElement, mode: 'create' | 'edit', routeContext?: RouteContext) {
    this.container = container;
    this.mode = mode;
    this.routeContext = routeContext;
  }

  init(): void {
    this.abortController = new AbortController();

    this.form = this.container.querySelector<HTMLFormElement>('[data-ref="form-hr-employee"]');
    this.btnBack = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-back"]');
    this.btnHeaderCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-header-cancel"]');
    this.btnHeaderSave = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-header-save"]');
    this.btnCancel = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-cancel-hr"]');
    this.btnSubmit = this.container.querySelector<HTMLButtonElement>('[data-ref="btn-submit-hr"]');
    this.bannerError = this.container.querySelector<HTMLElement>('[data-ref="banner-error"]');

    this.mountDropdownSlots();

    this.inputFullName = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-full-name"]');
    this.inputEmail = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-email"]');
    this.inputPhone = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-phone"]');
    this.inputState = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-state"]');
    this.inputJobTitle = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-job-title"]');
    this.inputHireDate = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-hire-date"]');
    this.inputSalary = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-salary"]');
    this.inputVacAllowance = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-vac-allowance"]');
    this.inputBankName = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-bank-name"]');
    this.inputClabe = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-bank-clabe"]');
    this.inputRfc = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-rfc"]');
    this.inputCurp = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-curp"]');
    this.inputNss = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-nss"]');
    this.inputEmergName = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-emerg-name"]');
    this.inputEmergPhone = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-emerg-phone"]');
    this.inputNotes = this.container.querySelector<HTMLInputElement>('[data-ref="input-emp-notes"]');

    renderIcons(this.container);
    this.bindEvents();
    this.updateLivePreview();

    if (this.mode === 'edit') {
      this.uuid =
        this.routeContext?.params?.uuid ||
        this.extractUuidFromPath(window.location.pathname) ||
        this.routeContext?.query.get('uuid') ||
        null;

      if (!this.uuid) {
        showToast('Identificador de colaborador no válido.', 'danger');
        navigate('/hr', true);
        return;
      }

      void this.loadEmployeeForEdit(this.uuid);
    }
  }

  private extractUuidFromPath(pathname: string): string | null {
    const m1 = pathname.match(/^\/(?:hr|recursos-humanos|empleados|personal)\/([a-zA-Z0-9_-]+)\/edit$/);
    if (m1) return m1[1];
    const m2 = pathname.match(/^\/(?:hr|recursos-humanos|empleados|personal)\/edit\/([a-zA-Z0-9_-]+)$/);
    if (m2) return m2[1];
    return null;
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
              <div class="menu-panel__drag-zone" data-ref="dropdown-drag-zone-${key}" aria-hidden="true">
                <div class="menu-panel__drag-handle" data-ref="dropdown-drag-handle-${key}"></div>
              </div>
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
    key: string,
    options: SelectOption[],
    onChange: (val: string) => void
  ): DropdownController | null {
    const wrapper = this.container.querySelector<HTMLElement>(`[data-ref="dropdown-wrapper-${key}"]`);
    if (!wrapper) return null;
    const controller = setupDropdown(wrapper, {
      isSelect: true,
      matchWidth: true,
      placement: 'bottom-start',
    });
    const textEl = this.container.querySelector<HTMLElement>(`[data-ref="text-selected-${key}"]`);
    const iconUse = this.container.querySelector<SVGUseElement>(`[data-ref="icon-selected-${key}"] use`);
    const optionBtns = this.container.querySelectorAll<HTMLButtonElement>(`[data-select-key="${key}"]`);

    optionBtns.forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
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
        },
        { signal: this.abortController?.signal }
      );
    });

    return controller;
  }

  private setCustomDropdownValue(key: string, options: SelectOption[], value: string): void {
    const found = options.find((o) => o.value === value);
    if (!found) return;
    const textEl = this.container.querySelector<HTMLElement>(`[data-ref="text-selected-${key}"]`);
    const iconUse = this.container.querySelector<SVGUseElement>(`[data-ref="icon-selected-${key}"] use`);
    const optionBtns = this.container.querySelectorAll<HTMLButtonElement>(`[data-select-key="${key}"]`);
    if (textEl) textEl.textContent = found.label;
    if (iconUse) iconUse.setAttribute('href', `/icons.svg#${found.icon}`);
    optionBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-select-value') === value);
    });
  }

  private mountDropdownSlots(): void {
    const today = new Date().toISOString().slice(0, 10);

    const slotDept = this.container.querySelector<HTMLElement>('[data-ref="slot-dropdown-dept"]');
    const slotContract = this.container.querySelector<HTMLElement>('[data-ref="slot-dropdown-contract"]');
    const slotModality = this.container.querySelector<HTMLElement>('[data-ref="slot-dropdown-modality"]');
    const slotHireDate = this.container.querySelector<HTMLElement>('[data-ref="slot-dropdown-hire-date"]');
    const slotFrequency = this.container.querySelector<HTMLElement>('[data-ref="slot-dropdown-frequency"]');

    if (slotDept) {
      slotDept.innerHTML = this.buildCustomDropdownHtml(
        'dept',
        'Departamento *',
        DEPARTMENT_OPTIONS,
        this.selectedDepartment
      );
    }
    if (slotContract) {
      slotContract.innerHTML = this.buildCustomDropdownHtml(
        'contract',
        'Tipo de Contrato *',
        CONTRACT_TYPE_OPTIONS,
        this.selectedContract
      );
    }
    if (slotModality) {
      slotModality.innerHTML = this.buildCustomDropdownHtml(
        'modality',
        'Modalidad *',
        WORK_MODALITY_OPTIONS,
        this.selectedModality
      );
    }
    if (slotHireDate) {
      slotHireDate.innerHTML = buildDatePickerDropdownHtml({
        fieldRef: 'field-emp-hire-date',
        initialValue: today,
        inputRef: 'input-emp-hire-date',
        key: 'emp-hire-date',
        label: 'Fecha de Ingreso *',
      });
    }
    if (slotFrequency) {
      slotFrequency.innerHTML = this.buildCustomDropdownHtml(
        'frequency',
        'Frecuencia de Pago *',
        PAYMENT_FREQUENCY_OPTIONS,
        this.selectedFrequency
      );
    }

    this.hireDateDropdown = setupDatePickerDropdown(this.container, {
      fieldRef: 'field-emp-hire-date',
      initialValue: today,
      inputRef: 'input-emp-hire-date',
      key: 'emp-hire-date',
      label: 'Fecha de Ingreso *',
      onChange: () => {
        this.updateLivePreview();
      },
      placement: 'bottom-end',
    });

    this.dropdownControllers = [
      this.wireCustomDropdown('dept', DEPARTMENT_OPTIONS, (v) => {
        this.selectedDepartment = v as HrDepartment;
        this.updateLivePreview();
      }),
      this.wireCustomDropdown('contract', CONTRACT_TYPE_OPTIONS, (v) => {
        this.selectedContract = v as HrEmploymentType;
        this.updateLivePreview();
      }),
      this.wireCustomDropdown('modality', WORK_MODALITY_OPTIONS, (v) => {
        this.selectedModality = v as HrWorkModality;
        this.updateLivePreview();
      }),
      this.wireCustomDropdown('frequency', PAYMENT_FREQUENCY_OPTIONS, (v) => {
        this.selectedFrequency = v as HrPaymentFrequency;
        this.updateLivePreview();
      }),
      this.hireDateDropdown,
    ];
  }

  bindEvents(): void {
    const signal = this.abortController?.signal;

    const handleGoBack = (e: Event) => {
      e.preventDefault();
      navigate('/hr');
    };

    this.btnBack?.addEventListener('click', handleGoBack, { signal });
    this.btnHeaderCancel?.addEventListener('click', handleGoBack, { signal });
    this.btnCancel?.addEventListener('click', handleGoBack, { signal });

    this.btnHeaderSave?.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        void this.handleSubmit();
      },
      { signal }
    );

    this.form?.addEventListener(
      'submit',
      (e) => {
        e.preventDefault();
        void this.handleSubmit();
      },
      { signal }
    );

    this.inputClabe?.addEventListener(
      'input',
      () => {
        if (this.inputClabe) {
          this.inputClabe.value = this.inputClabe.value.replace(/\D/g, '').slice(0, 18);
        }
      },
      { signal }
    );

    this.inputRfc?.addEventListener(
      'input',
      () => {
        if (this.inputRfc) {
          this.inputRfc.value = this.inputRfc.value.toUpperCase().slice(0, 13);
        }
      },
      { signal }
    );

    this.inputCurp?.addEventListener(
      'input',
      () => {
        if (this.inputCurp) {
          this.inputCurp.value = this.inputCurp.value.toUpperCase().slice(0, 18);
        }
      },
      { signal }
    );

    const liveInputs = [
      this.inputFullName,
      this.inputJobTitle,
      this.inputSalary,
      this.inputVacAllowance,
      this.inputBankName,
      this.inputHireDate,
    ];

    liveInputs.forEach((inp) => {
      inp?.addEventListener(
        'input',
        () => {
          this.updateLivePreview();
        },
        { signal }
      );
      inp?.addEventListener(
        'change',
        () => {
          this.updateLivePreview();
        },
        { signal }
      );
    });
  }

  private async loadEmployeeForEdit(uuid: string): Promise<void> {
    const res = await getApi<HrEmployeeDetailResponse>(`/api/hr/employees/${uuid}`);
    if (!res.success || !res.data?.employee) {
      showToast(res.error || 'No se pudo cargar la ficha laboral del colaborador.', 'danger');
      navigate('/hr', true);
      return;
    }

    const emp = res.data.employee;
    const titleEl = this.container.querySelector<HTMLElement>('[data-ref="hr-edit-title"]');
    if (titleEl) {
      titleEl.textContent = `Editar Ficha: ${emp.full_name}`;
    }

    if (this.inputFullName) this.inputFullName.value = emp.full_name || '';
    if (this.inputEmail) this.inputEmail.value = emp.email || '';
    if (this.inputPhone) this.inputPhone.value = emp.phone || '';
    if (this.inputState) this.inputState.value = emp.location_state || 'Ciudad de México';
    if (this.inputJobTitle) this.inputJobTitle.value = emp.position_title || '';
    if (this.inputSalary) this.inputSalary.value = String(emp.monthly_salary ?? 25000);
    if (this.inputVacAllowance) this.inputVacAllowance.value = String(emp.vacation_days_total ?? 12);
    if (this.inputBankName) this.inputBankName.value = emp.bank_name || '';
    if (this.inputClabe) this.inputClabe.value = emp.clabe || '';
    if (this.inputRfc) this.inputRfc.value = emp.rfc || '';
    if (this.inputCurp) this.inputCurp.value = emp.curp || '';
    if (this.inputNss) this.inputNss.value = emp.nss || '';
    if (this.inputEmergName) this.inputEmergName.value = emp.emergency_contact_name || '';
    if (this.inputEmergPhone) this.inputEmergPhone.value = emp.emergency_contact_phone || '';
    if (this.inputNotes) this.inputNotes.value = emp.notes || '';

    this.selectedDepartment = emp.department || 'operations';
    this.selectedContract = emp.employment_type || 'full_time';
    this.selectedModality = emp.work_modality || 'hybrid';
    this.selectedFrequency = emp.payment_frequency || 'biweekly';

    this.setCustomDropdownValue('dept', DEPARTMENT_OPTIONS, this.selectedDepartment);
    this.setCustomDropdownValue('contract', CONTRACT_TYPE_OPTIONS, this.selectedContract);
    this.setCustomDropdownValue('modality', WORK_MODALITY_OPTIONS, this.selectedModality);
    this.setCustomDropdownValue('frequency', PAYMENT_FREQUENCY_OPTIONS, this.selectedFrequency);

    if (emp.hire_date && this.hireDateDropdown) {
      this.hireDateDropdown.setValue(emp.hire_date.slice(0, 10), true);
    }

    const codeEl = this.container.querySelector<HTMLElement>('[data-ref="preview-code"]');
    if (codeEl) {
      codeEl.textContent = emp.employee_code || 'EMP';
    }

    const statusEl = this.container.querySelector<HTMLElement>('[data-ref="preview-status"]');
    if (statusEl) {
      statusEl.className = `hr-status-badge hr-status-badge--${emp.status || 'active'}`;
      statusEl.textContent = getStatusLabel(emp.status || 'active');
    }

    this.updateLivePreview();
  }

  private updateLivePreview(): void {
    const fullName = (this.inputFullName?.value || '').trim();
    const jobTitle = (this.inputJobTitle?.value || '').trim();
    const salary = Math.max(0, Number(this.inputSalary?.value || 0));
    const vacDays = Math.max(0, Number(this.inputVacAllowance?.value || 0));
    const bankName = (this.inputBankName?.value || '').trim();
    const hireDateIso = this.hireDateDropdown?.getValue() || this.inputHireDate?.value || '';

    const avatarEl = this.container.querySelector<HTMLElement>('[data-ref="preview-avatar"]');
    const nameEl = this.container.querySelector<HTMLElement>('[data-ref="preview-name"]');
    const roleEl = this.container.querySelector<HTMLElement>('[data-ref="preview-role"]');
    const deptEl = this.container.querySelector<HTMLElement>('[data-ref="preview-dept"]');
    const modalityEl = this.container.querySelector<HTMLElement>('[data-ref="preview-modality"]');
    const statSalaryEl = this.container.querySelector<HTMLElement>('[data-ref="stat-monthly-salary"]');
    const statPeriodPayEl = this.container.querySelector<HTMLElement>('[data-ref="stat-period-pay"]');
    const statVacEl = this.container.querySelector<HTMLElement>('[data-ref="stat-vacation-days"]');
    const statHireEl = this.container.querySelector<HTMLElement>('[data-ref="stat-hire-date"]');
    const statBankEl = this.container.querySelector<HTMLElement>('[data-ref="stat-bank-name"]');

    if (avatarEl) {
      avatarEl.textContent = getInitials(fullName || 'Nuevo Colaborador');
    }
    if (nameEl) {
      nameEl.textContent = fullName || (this.mode === 'edit' ? 'Colaborador' : 'Nuevo Colaborador');
    }
    if (roleEl) {
      roleEl.textContent = jobTitle || 'Puesto por asignar';
    }
    if (deptEl) {
      const deptOpt = DEPARTMENT_OPTIONS.find((d) => d.value === this.selectedDepartment);
      deptEl.textContent = deptOpt ? deptOpt.label : 'Operaciones';
    }
    if (modalityEl) {
      modalityEl.textContent = `${getContractShortLabel(this.selectedContract)} • ${getModalityShortLabel(this.selectedModality)}`;
    }
    if (statSalaryEl) {
      statSalaryEl.textContent = formatCurrency(salary);
    }
    if (statPeriodPayEl) {
      let periodAmount = salary / 2;
      let freqLabel = 'Quincenal';
      if (this.selectedFrequency === 'weekly') {
        periodAmount = salary / 4.3333;
        freqLabel = 'Semanal';
      } else if (this.selectedFrequency === 'monthly') {
        periodAmount = salary;
        freqLabel = 'Mensual';
      }
      statPeriodPayEl.textContent = `${formatCurrency(periodAmount)} (${freqLabel})`;
    }
    if (statVacEl) {
      statVacEl.textContent = `${vacDays} ${vacDays === 1 ? 'día' : 'días'}`;
    }
    if (statHireEl) {
      statHireEl.textContent = hireDateIso ? formatDateTriggerLabel(hireDateIso) : '—';
    }
    if (statBankEl) {
      statBankEl.textContent = bankName || 'Por asignar';
    }
  }

  private setError(msg: string): void {
    if (!this.bannerError) return;
    if (msg) {
      this.bannerError.textContent = msg;
      this.bannerError.classList.remove('is-hidden');
    } else {
      this.bannerError.textContent = '';
      this.bannerError.classList.add('is-hidden');
    }
  }

  private async handleSubmit(): Promise<void> {
    if (this.isSubmitting) return;
    this.setError('');

    const fullName = (this.inputFullName?.value || '').trim();
    const email = (this.inputEmail?.value || '').trim();
    const phone = (this.inputPhone?.value || '').trim();
    const locationState = (this.inputState?.value || '').trim();
    const positionTitle = (this.inputJobTitle?.value || '').trim();
    const hireDate = (this.hireDateDropdown?.getValue() || this.inputHireDate?.value || '').trim();
    const monthlySalary = Number(this.inputSalary?.value || 0);
    const vacationDaysTotal = Number(this.inputVacAllowance?.value || 12);
    const bankName = (this.inputBankName?.value || '').trim();
    const clabe = (this.inputClabe?.value || '').trim();
    const rfc = (this.inputRfc?.value || '').trim();
    const curp = (this.inputCurp?.value || '').trim();
    const nss = (this.inputNss?.value || '').trim();
    const emergencyName = (this.inputEmergName?.value || '').trim();
    const emergencyPhone = (this.inputEmergPhone?.value || '').trim();
    const notes = (this.inputNotes?.value || '').trim();

    if (!fullName || fullName.length < 3) {
      const msg = 'Ingresa el nombre completo del colaborador.';
      this.setError(msg);
      showToast(msg, 'warning');
      this.inputFullName?.focus();
      return;
    }
    if (!email || !email.includes('@')) {
      const msg = 'Ingresa un correo electrónico corporativo válido.';
      this.setError(msg);
      showToast(msg, 'warning');
      this.inputEmail?.focus();
      return;
    }
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      const msg = 'Ingresa un teléfono móvil válido de 10 dígitos.';
      this.setError(msg);
      showToast(msg, 'warning');
      this.inputPhone?.focus();
      return;
    }
    if (!positionTitle) {
      const msg = 'Ingresa el puesto o cargo del colaborador.';
      this.setError(msg);
      showToast(msg, 'warning');
      this.inputJobTitle?.focus();
      return;
    }

    this.isSubmitting = true;
    if (this.btnSubmit) this.btnSubmit.disabled = true;
    if (this.btnHeaderSave) this.btnHeaderSave.disabled = true;

    const payload = {
      bank_name: bankName || null,
      clabe: clabe || null,
      curp: curp || null,
      department: this.selectedDepartment,
      email,
      emergency_contact_name: emergencyName || null,
      emergency_contact_phone: emergencyPhone || null,
      employment_type: this.selectedContract,
      full_name: fullName,
      hire_date: hireDate,
      location_state: locationState || null,
      monthly_salary: monthlySalary,
      notes: notes || null,
      nss: nss || null,
      payment_frequency: this.selectedFrequency,
      phone,
      position_title: positionTitle,
      rfc: rfc || null,
      vacation_days_total: vacationDaysTotal,
      work_modality: this.selectedModality,
    };

    try {
      const res =
        this.mode === 'edit' && this.uuid
          ? await putApi<HrEmployeeRecord>(`/api/hr/employees/${this.uuid}`, payload)
          : await postApi<HrEmployeeRecord>('/api/hr/employees', payload);

      if (res.success) {
        showToast(
          this.mode === 'edit'
            ? 'Ficha laboral actualizada correctamente.'
            : 'Colaborador contratado e integrado a la plantilla.',
          'success'
        );
        navigate('/hr');
      } else {
        const errMsg = res.error || 'No se pudo guardar la información del colaborador.';
        this.setError(errMsg);
        showToast(errMsg, 'danger');
      }
    } finally {
      this.isSubmitting = false;
      if (this.btnSubmit) this.btnSubmit.disabled = false;
      if (this.btnHeaderSave) this.btnHeaderSave.disabled = false;
    }
  }

  destroy(): void {
    this.dropdownControllers.forEach((c) => c?.destroy());
    this.dropdownControllers = [];
    this.hireDateDropdown = null;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

export async function createHrCreateView(ctx?: RouteContext): Promise<HTMLElement> {
  const container = await loadTemplate('/views/hr/hr-create.html');
  const controller = new HrEmployeeFormController(container, 'create', ctx);
  controller.init();
  (container as any).__controller = controller;
  return container;
}

export async function createHrEditView(ctx?: RouteContext): Promise<HTMLElement> {
  const container = await loadTemplate('/views/hr/hr-edit.html');
  const controller = new HrEmployeeFormController(container, 'edit', ctx);
  controller.init();
  (container as any).__controller = controller;
  return container;
}
