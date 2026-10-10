import { pool } from '../config/database.config.js';
import { logger } from './logger.service.js';
import crypto from 'crypto';
import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export type HrDepartment =
  | 'data'
  | 'engineering'
  | 'executive'
  | 'finance'
  | 'hr'
  | 'legal'
  | 'marketing'
  | 'operations'
  | 'support';

export type HrEmploymentType = 'contractor' | 'full_time' | 'intern' | 'part_time';

export type HrWorkModality = 'hybrid' | 'onsite' | 'remote';

export type HrPaymentFrequency = 'biweekly' | 'monthly' | 'weekly';

export type HrEmployeeStatus = 'active' | 'on_leave' | 'probation' | 'suspended' | 'terminated';

export type HrLeaveType =
  | 'bereavement'
  | 'maternity_paternity'
  | 'personal'
  | 'sick_leave'
  | 'unpaid'
  | 'vacation';

export type HrLeaveStatus = 'approved' | 'cancelled' | 'pending' | 'rejected';

export type HrEventType =
  | 'department_transfer'
  | 'hired'
  | 'leave_approved'
  | 'performance_review'
  | 'promotion'
  | 'salary_adjustment'
  | 'status_change'
  | 'terminated'
  | 'warning';

export interface HrEmployeeRecord {
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

export interface HrLeaveRequestRecord {
  created_at: string;
  days_count: number;
  employee_id: number;
  end_date: string;
  id: number;
  leave_type: HrLeaveType;
  reason: string | null;
  review_notes: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  start_date: string;
  status: HrLeaveStatus;
  updated_at: string;
  uuid: string;
}

export interface HrLeaveRequestWithEmployee extends HrLeaveRequestRecord {
  department: HrDepartment;
  employee_code: string;
  employee_email: string;
  employee_name: string;
  employee_phone: string;
  employee_status: HrEmployeeStatus;
  employee_uuid: string;
  position_title: string;
  vacation_days_available: number;
  vacation_days_total: number;
  vacation_days_used: number;
}

export interface HrEmployeeEventRecord {
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

export interface HrEmployeeDossier {
  employee: HrEmployeeRecord;
  events: HrEmployeeEventRecord[];
  leaveRequests: HrLeaveRequestRecord[];
}

export interface HrKpis {
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

export interface CreateEmployeeInput {
  bank_name?: string | null;
  clabe?: string | null;
  curp?: string | null;
  department: HrDepartment;
  email: string;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  employment_type?: HrEmploymentType;
  full_name: string;
  hire_date: string;
  location_state?: string | null;
  monthly_salary: number;
  notes?: string | null;
  nss?: string | null;
  payment_frequency?: HrPaymentFrequency;
  phone: string;
  position_title: string;
  rfc?: string | null;
  status?: HrEmployeeStatus;
  vacation_days_total?: number;
  work_modality?: HrWorkModality;
}

export interface UpdateEmployeeInput {
  bank_name?: string | null;
  clabe?: string | null;
  curp?: string | null;
  department?: HrDepartment;
  email?: string;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  employment_type?: HrEmploymentType;
  full_name?: string;
  hire_date?: string;
  location_state?: string | null;
  monthly_salary?: number;
  notes?: string | null;
  nss?: string | null;
  payment_frequency?: HrPaymentFrequency;
  phone?: string;
  position_title?: string;
  rfc?: string | null;
  status?: HrEmployeeStatus;
  vacation_days_total?: number;
  vacation_days_used?: number;
  work_modality?: HrWorkModality;
}

export interface CreateLeaveRequestInput {
  auto_approve?: boolean;
  days_count: number;
  employee_uuid: string;
  end_date: string;
  leave_type: HrLeaveType;
  reason?: string | null;
  start_date: string;
}

export interface CreateEmployeeEventInput {
  description?: string | null;
  event_type: HrEventType;
  new_salary?: number;
  new_value?: string | null;
  previous_value?: string | null;
  title: string;
}

const VALID_DEPARTMENTS: readonly HrDepartment[] = [
  'data',
  'engineering',
  'executive',
  'finance',
  'hr',
  'legal',
  'marketing',
  'operations',
  'support',
];

const VALID_EMPLOYMENT_TYPES: readonly HrEmploymentType[] = [
  'contractor',
  'full_time',
  'intern',
  'part_time',
];

const VALID_MODALITIES: readonly HrWorkModality[] = ['hybrid', 'onsite', 'remote'];

const VALID_FREQUENCIES: readonly HrPaymentFrequency[] = ['biweekly', 'monthly', 'weekly'];

const VALID_STATUSES: readonly HrEmployeeStatus[] = [
  'active',
  'on_leave',
  'probation',
  'suspended',
  'terminated',
];

const VALID_LEAVE_TYPES: readonly HrLeaveType[] = [
  'bereavement',
  'maternity_paternity',
  'personal',
  'sick_leave',
  'unpaid',
  'vacation',
];

const VALID_EVENT_TYPES: readonly HrEventType[] = [
  'department_transfer',
  'hired',
  'leave_approved',
  'performance_review',
  'promotion',
  'salary_adjustment',
  'status_change',
  'terminated',
  'warning',
];

const fallbackEmployees: HrEmployeeRecord[] = [
  {
    admin_user_id: 1,
    bank_name: 'BBVA México',
    clabe: '012580001234567891',
    created_at: '2023-03-15T09:00:00.000Z',
    currency: 'MXN',
    curp: 'GAEA880512HNLRLA01',
    department: 'executive',
    email: 'agarza@projectboreal.com',
    emergency_contact_name: 'Valeria Elizondo',
    emergency_contact_phone: '8187654321',
    employee_code: 'EMP-0001',
    employment_type: 'full_time',
    full_name: 'Alejandro Garza Elizondo',
    hire_date: '2023-03-15',
    id: 1,
    location_state: 'Nuevo León',
    monthly_salary: 85000,
    notes: 'Responsable general de operaciones de sorteos, tesorería y cumplimiento.',
    nss: '43128809123',
    payment_frequency: 'biweekly',
    pending_leaves_count: 0,
    phone: '8112345678',
    position_title: 'Director de Operaciones (COO)',
    rfc: 'GAEA880512HNL',
    status: 'active',
    termination_date: null,
    termination_reason: null,
    updated_at: '2026-07-01T09:15:00.000Z',
    uuid: 'a1100001-b220-4c30-8d40-e55000000001',
    vacation_days_available: 12,
    vacation_days_total: 16,
    vacation_days_used: 4,
    work_modality: 'hybrid',
  },
  {
    admin_user_id: null,
    bank_name: 'Santander',
    clabe: '014180009876543210',
    created_at: '2023-08-01T09:00:00.000Z',
    currency: 'MXN',
    curp: 'MEVS911024MDFNNS04',
    department: 'hr',
    email: 'smendoza@projectboreal.com',
    emergency_contact_name: 'Roberto Mendoza',
    emergency_contact_phone: '5511223344',
    employee_code: 'EMP-0002',
    employment_type: 'full_time',
    full_name: 'Sofía Mendoza Villaseñor',
    hire_date: '2023-08-01',
    id: 2,
    location_state: 'Ciudad de México',
    monthly_salary: 54000,
    notes: 'Líder de atracción de talento, clima organizacional, nómina y administración de vacaciones.',
    nss: '11919123456',
    payment_frequency: 'biweekly',
    pending_leaves_count: 0,
    phone: '5543219876',
    position_title: 'HR Manager & People Partner',
    rfc: 'MEVS911024MDF',
    status: 'active',
    termination_date: null,
    termination_reason: null,
    updated_at: '2026-08-01T09:00:00.000Z',
    uuid: 'a1100002-b220-4c30-8d40-e55000000002',
    vacation_days_available: 12,
    vacation_days_total: 14,
    vacation_days_used: 2,
    work_modality: 'hybrid',
  },
  {
    admin_user_id: null,
    bank_name: 'Nu México',
    clabe: '698180005544332211',
    created_at: '2023-06-10T09:00:00.000Z',
    currency: 'MXN',
    curp: 'RETD930218HJCRYD08',
    department: 'engineering',
    email: 'dreyes@projectboreal.com',
    emergency_contact_name: 'Lucía Treviño',
    emergency_contact_phone: '3312340987',
    employee_code: 'EMP-0003',
    employment_type: 'full_time',
    full_name: 'Diego Emiliano Reyes Treviño',
    hire_date: '2023-06-10',
    id: 3,
    location_state: 'Jalisco',
    monthly_salary: 72000,
    notes: 'Arquitecto principal de la plataforma de sorteos en tiempo real y motores antifraude.',
    nss: '54149308765',
    payment_frequency: 'biweekly',
    pending_leaves_count: 1,
    phone: '3398765432',
    position_title: 'Lead Full-Stack & Architecture Engineer',
    rfc: 'RETD930218HJC',
    status: 'active',
    termination_date: null,
    termination_reason: null,
    updated_at: '2025-06-01T12:00:00.000Z',
    uuid: 'a1100003-b220-4c30-8d40-e55000000003',
    vacation_days_available: 8,
    vacation_days_total: 14,
    vacation_days_used: 6,
    work_modality: 'remote',
  },
  {
    admin_user_id: null,
    bank_name: 'Banorte',
    clabe: '072180001122334455',
    created_at: '2024-01-15T09:00:00.000Z',
    currency: 'MXN',
    curp: 'OICM940709MDFRTC02',
    department: 'finance',
    email: 'mortiz@projectboreal.com',
    emergency_contact_name: 'Carlos Ortiz',
    emergency_contact_phone: '5599887766',
    employee_code: 'EMP-0004',
    employment_type: 'full_time',
    full_name: 'Mariana Fernanda Ortiz Cano',
    hire_date: '2024-01-15',
    id: 4,
    location_state: 'Ciudad de México',
    monthly_salary: 46000,
    notes: 'Supervisión de dispersión de premios, liquidación Banxico CEP y cuentas receptoras.',
    nss: '12169455432',
    payment_frequency: 'biweekly',
    pending_leaves_count: 0,
    phone: '5587651234',
    position_title: 'Coordinadora de Conciliación SPEI y Tesorería',
    rfc: 'OICM940709MDF',
    status: 'on_leave',
    termination_date: null,
    termination_reason: null,
    updated_at: '2026-09-25T11:30:00.000Z',
    uuid: 'a1100004-b220-4c30-8d40-e55000000004',
    vacation_days_available: 9,
    vacation_days_total: 14,
    vacation_days_used: 5,
    work_modality: 'onsite',
  },
  {
    admin_user_id: null,
    bank_name: 'BBVA México',
    clabe: '012580006677889900',
    created_at: '2024-05-20T09:00:00.000Z',
    currency: 'MXN',
    curp: 'NAPR951130HNLVRD05',
    department: 'support',
    email: 'rnavarro@projectboreal.com',
    emergency_contact_name: 'Elena Paz',
    emergency_contact_phone: '8133445566',
    employee_code: 'EMP-0005',
    employment_type: 'full_time',
    full_name: 'Rodrigo Sebastián Navarro Paz',
    hire_date: '2024-05-20',
    id: 5,
    location_state: 'Nuevo León',
    monthly_salary: 38500,
    notes: 'Coordinación de atención VIP a participantes y entrega certificada de premios a ganadores.',
    nss: '43189567890',
    payment_frequency: 'biweekly',
    pending_leaves_count: 1,
    phone: '8123459876',
    position_title: 'Customer Success & Winner Delivery Lead',
    rfc: 'NAPR951130HNL',
    status: 'active',
    termination_date: null,
    termination_reason: null,
    updated_at: '2024-05-20T09:00:00.000Z',
    uuid: 'a1100005-b220-4c30-8d40-e55000000005',
    vacation_days_available: 12,
    vacation_days_total: 12,
    vacation_days_used: 0,
    work_modality: 'hybrid',
  },
  {
    admin_user_id: null,
    bank_name: 'Citibanamex',
    clabe: '002680004455667788',
    created_at: '2026-08-18T10:00:00.000Z',
    currency: 'MXN',
    curp: 'HESC970414MQTRRC09',
    department: 'data',
    email: 'cherrera@projectboreal.com',
    emergency_contact_name: 'Jorge Herrera',
    emergency_contact_phone: '4429876543',
    employee_code: 'EMP-0006',
    employment_type: 'full_time',
    full_name: 'Camila Valentina Herrera Solís',
    hire_date: '2026-08-18',
    id: 6,
    location_state: 'Querétaro',
    monthly_salary: 42000,
    notes: 'Monitoreo estadístico de conversión de boletos, modelos antifraude y auditoría Cassandra.',
    nss: '66199712345',
    payment_frequency: 'biweekly',
    pending_leaves_count: 0,
    phone: '4423456789',
    position_title: 'Analista de Datos y Riesgo Transaccional',
    rfc: 'HESC970414MQT',
    status: 'probation',
    termination_date: null,
    termination_reason: null,
    updated_at: '2026-08-18T10:00:00.000Z',
    uuid: 'a1100006-b220-4c30-8d40-e55000000006',
    vacation_days_available: 12,
    vacation_days_total: 12,
    vacation_days_used: 0,
    work_modality: 'remote',
  },
];

const fallbackLeaveRequests: HrLeaveRequestRecord[] = [
  {
    created_at: '2026-09-20T10:00:00.000Z',
    days_count: 5,
    employee_id: 4,
    end_date: '2026-10-11',
    id: 1,
    leave_type: 'vacation',
    reason: 'Periodo vacacional anual programado con cobertura de turno en tesorería SPEI.',
    review_notes: 'Aprobado. Guardia cubierta por el equipo de finanzas.',
    reviewed_at: '2026-09-25T11:30:00.000Z',
    reviewed_by_name: 'Sofía Mendoza Villaseñor',
    start_date: '2026-10-05',
    status: 'approved',
    updated_at: '2026-09-25T11:30:00.000Z',
    uuid: 'b2200001-c330-4d40-9e50-f66000000001',
  },
  {
    created_at: '2026-10-08T14:20:00.000Z',
    days_count: 5,
    employee_id: 3,
    end_date: '2026-11-20',
    id: 2,
    leave_type: 'vacation',
    reason: 'Vacaciones de mitad de noviembre tras cierre de despliegue trimestral.',
    review_notes: null,
    reviewed_at: null,
    reviewed_by_name: null,
    start_date: '2026-11-16',
    status: 'pending',
    updated_at: '2026-10-08T14:20:00.000Z',
    uuid: 'b2200002-c330-4d40-9e50-f66000000002',
  },
  {
    created_at: '2026-10-09T16:10:00.000Z',
    days_count: 2,
    employee_id: 5,
    end_date: '2026-10-23',
    id: 3,
    leave_type: 'personal',
    reason: 'Trámites notariales y personales en Monterrey.',
    review_notes: null,
    reviewed_at: null,
    reviewed_by_name: null,
    start_date: '2026-10-22',
    status: 'pending',
    updated_at: '2026-10-09T16:10:00.000Z',
    uuid: 'b2200003-c330-4d40-9e50-f66000000003',
  },
  {
    created_at: '2026-06-28T09:00:00.000Z',
    days_count: 4,
    employee_id: 1,
    end_date: '2026-07-16',
    id: 4,
    leave_type: 'vacation',
    reason: 'Descanso familiar de verano.',
    review_notes: 'Autorizado conforme a calendario anual ejecutivo.',
    reviewed_at: '2026-07-01T09:15:00.000Z',
    reviewed_by_name: 'Sofía Mendoza Villaseñor',
    start_date: '2026-07-13',
    status: 'approved',
    updated_at: '2026-07-01T09:15:00.000Z',
    uuid: 'b2200004-c330-4d40-9e50-f66000000004',
  },
];

const fallbackEvents: HrEmployeeEventRecord[] = [
  {
    created_at: '2023-03-15T09:00:00.000Z',
    description: 'Alta oficial como Director de Operaciones (COO) liderando la estrategia operativa de sorteos.',
    employee_id: 1,
    event_type: 'hired',
    id: 1,
    new_value: 'Director de Operaciones (COO)',
    previous_value: null,
    recorded_by_name: 'Administrador General',
    title: 'Contratación e Ingreso Ejecutivo',
    uuid: 'c3300001-d440-4e50-8f60-a77000000001',
  },
  {
    created_at: '2023-08-01T09:00:00.000Z',
    description: 'Incorporación para encabezar el departamento de Recursos Humanos y Capital Humano.',
    employee_id: 2,
    event_type: 'hired',
    id: 2,
    new_value: 'HR Manager & People Partner',
    previous_value: null,
    recorded_by_name: 'Alejandro Garza Elizondo',
    title: 'Ingreso como HR Manager',
    uuid: 'c3300002-d440-4e50-8f60-a77000000002',
  },
  {
    created_at: '2025-06-01T12:00:00.000Z',
    description: 'Ascenso por mérito técnico tras liderar la arquitectura de conciliación SPEI y alta concurrencia.',
    employee_id: 3,
    event_type: 'promotion',
    id: 3,
    new_value: 'Lead Full-Stack & Architecture Engineer ($72,000 MXN)',
    previous_value: 'Senior Software Engineer ($62,000 MXN)',
    recorded_by_name: 'Alejandro Garza Elizondo',
    title: 'Promoción a Lead Full-Stack Engineer',
    uuid: 'c3300003-d440-4e50-8f60-a77000000003',
  },
  {
    created_at: '2026-09-25T11:30:00.000Z',
    description: 'Periodo vacacional autorizado del 05/10/2026 al 11/10/2026.',
    employee_id: 4,
    event_type: 'leave_approved',
    id: 4,
    new_value: '5 días tomados',
    previous_value: '0 días tomados',
    recorded_by_name: 'Sofía Mendoza Villaseñor',
    title: 'Vacaciones Autorizadas (5 días)',
    uuid: 'c3300004-d440-4e50-8f60-a77000000004',
  },
  {
    created_at: '2026-08-18T10:00:00.000Z',
    description: 'Ingreso al equipo de Datos y Riesgo Transaccional bajo esquema remoto.',
    employee_id: 6,
    event_type: 'hired',
    id: 5,
    new_value: 'Analista de Datos y Riesgo Transaccional',
    previous_value: null,
    recorded_by_name: 'Sofía Mendoza Villaseñor',
    title: 'Contratación e Inicio de Periodo de Prueba',
    uuid: 'c3300005-d440-4e50-8f60-a77000000005',
  },
];

function isDbOfflineOrMissingTableError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  return (
    code === 'ECONNREFUSED' ||
    code === 'PROTOCOL_CONNECTION_LOST' ||
    code === 'ER_NO_SUCH_TABLE' ||
    code === 'ER_BAD_DB_ERROR' ||
    code === 'ETIMEDOUT'
  );
}

function formatDateOnly(val: unknown): string | null {
  if (!val) return null;
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  const str = String(val);
  return str.length >= 10 ? str.slice(0, 10) : str;
}

function mapRowToEmployee(row: RowDataPacket): HrEmployeeRecord {
  const totalVac = Number(row.vacation_days_total ?? 12);
  const usedVac = Number(row.vacation_days_used ?? 0);
  return {
    admin_user_id: row.admin_user_id ? Number(row.admin_user_id) : null,
    bank_name: row.bank_name || null,
    clabe: row.clabe || null,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    currency: row.currency || 'MXN',
    curp: row.curp || null,
    department: (row.department as HrDepartment) || 'operations',
    email: String(row.email || ''),
    emergency_contact_name: row.emergency_contact_name || null,
    emergency_contact_phone: row.emergency_contact_phone || null,
    employee_code: String(row.employee_code || ''),
    employment_type: (row.employment_type as HrEmploymentType) || 'full_time',
    full_name: String(row.full_name || ''),
    hire_date: formatDateOnly(row.hire_date) || new Date().toISOString().slice(0, 10),
    id: Number(row.id),
    location_state: row.location_state || null,
    monthly_salary: Number(row.monthly_salary || 0),
    notes: row.notes || null,
    nss: row.nss || null,
    payment_frequency: (row.payment_frequency as HrPaymentFrequency) || 'biweekly',
    pending_leaves_count: Number(row.pending_leaves_count || 0),
    phone: String(row.phone || ''),
    position_title: String(row.position_title || ''),
    rfc: row.rfc || null,
    status: (row.status as HrEmployeeStatus) || 'active',
    termination_date: formatDateOnly(row.termination_date),
    termination_reason: row.termination_reason || null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    uuid: String(row.uuid || ''),
    vacation_days_available: Math.max(0, totalVac - usedVac),
    vacation_days_total: totalVac,
    vacation_days_used: usedVac,
    work_modality: (row.work_modality as HrWorkModality) || 'hybrid',
  };
}

function mapRowToLeave(row: RowDataPacket): HrLeaveRequestRecord {
  return {
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    days_count: Number(row.days_count || 1),
    employee_id: Number(row.employee_id),
    end_date: formatDateOnly(row.end_date) || '',
    id: Number(row.id),
    leave_type: (row.leave_type as HrLeaveType) || 'vacation',
    reason: row.reason || null,
    review_notes: row.review_notes || null,
    reviewed_at: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    reviewed_by_name: row.reviewed_by_name || null,
    start_date: formatDateOnly(row.start_date) || '',
    status: (row.status as HrLeaveStatus) || 'pending',
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
    uuid: String(row.uuid || ''),
  };
}

function mapRowToEvent(row: RowDataPacket): HrEmployeeEventRecord {
  return {
    created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    description: row.description || null,
    employee_id: Number(row.employee_id),
    event_type: (row.event_type as HrEventType) || 'status_change',
    id: Number(row.id),
    new_value: row.new_value || null,
    previous_value: row.previous_value || null,
    recorded_by_name: row.recorded_by_name || null,
    title: String(row.title || ''),
    uuid: String(row.uuid || ''),
  };
}

function syncFallbackEmployeeCounters(): void {
  for (const emp of fallbackEmployees) {
    emp.vacation_days_available = Math.max(0, emp.vacation_days_total - emp.vacation_days_used);
    emp.pending_leaves_count = fallbackLeaveRequests.filter(
      (l) => l.employee_id === emp.id && l.status === 'pending'
    ).length;
  }
}

export async function getHrKpis(): Promise<HrKpis> {
  try {
    const [empStats] = await pool.query<RowDataPacket[]>(
      `SELECT
        COUNT(*) AS total_employees,
        SUM(CASE WHEN status IN ('active', 'probation') THEN 1 ELSE 0 END) AS active_employees,
        SUM(CASE WHEN status = 'on_leave' THEN 1 ELSE 0 END) AS on_leave_employees,
        SUM(CASE WHEN status = 'probation' THEN 1 ELSE 0 END) AS probation_employees,
        SUM(CASE WHEN status = 'terminated' THEN 1 ELSE 0 END) AS terminated_employees,
        COALESCE(SUM(CASE WHEN status IN ('active', 'on_leave', 'probation') THEN monthly_salary ELSE 0 END), 0) AS monthly_payroll,
        COALESCE(AVG(CASE WHEN status IN ('active', 'on_leave', 'probation') THEN monthly_salary END), 0) AS avg_salary,
        COUNT(DISTINCT CASE WHEN status != 'terminated' THEN department END) AS departments_count,
        SUM(CASE WHEN hire_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) AND status != 'terminated' THEN 1 ELSE 0 END) AS new_hires_30d
       FROM hr_employees`
    );

    const [leaveStats] = await pool.query<RowDataPacket[]>(
      `SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_requests,
        COALESCE(SUM(CASE WHEN status = 'approved' AND YEAR(start_date) = YEAR(CURDATE()) THEN days_count ELSE 0 END), 0) AS approved_days_year
       FROM hr_leave_requests`
    );

    const e = empStats[0] || {};
    const l = leaveStats[0] || {};

    return {
      activeEmployees: Number(e.active_employees || 0),
      approvedLeaveDaysThisYear: Number(l.approved_days_year || 0),
      averageMonthlySalary: Math.round(Number(e.avg_salary || 0)),
      departmentsCount: Number(e.departments_count || 0),
      monthlyPayrollTotal: Number(e.monthly_payroll || 0),
      newHiresLast30Days: Number(e.new_hires_30d || 0),
      onLeaveEmployees: Number(e.on_leave_employees || 0),
      pendingLeaveRequests: Number(l.pending_requests || 0),
      probationEmployees: Number(e.probation_employees || 0),
      terminatedEmployees: Number(e.terminated_employees || 0),
      totalEmployees: Number(e.total_employees || 0),
    };
  } catch (error) {
    if (isDbOfflineOrMissingTableError(error)) {
      syncFallbackEmployeeCounters();
      const nonTerminated = fallbackEmployees.filter((e) => e.status !== 'terminated');
      const activeList = fallbackEmployees.filter((e) => e.status === 'active' || e.status === 'probation');
      const payroll = nonTerminated.reduce((acc, e) => acc + e.monthly_salary, 0);
      const avgSal = nonTerminated.length > 0 ? Math.round(payroll / nonTerminated.length) : 0;
      const depts = new Set(nonTerminated.map((e) => e.department)).size;
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const newHires = nonTerminated.filter((e) => e.hire_date >= thirtyDaysAgo).length;
      const pendingLeaves = fallbackLeaveRequests.filter((l) => l.status === 'pending').length;
      const approvedDays = fallbackLeaveRequests
        .filter((l) => l.status === 'approved')
        .reduce((acc, l) => acc + l.days_count, 0);

      return {
        activeEmployees: activeList.length,
        approvedLeaveDaysThisYear: approvedDays,
        averageMonthlySalary: avgSal,
        departmentsCount: depts,
        monthlyPayrollTotal: payroll,
        newHiresLast30Days: newHires,
        onLeaveEmployees: fallbackEmployees.filter((e) => e.status === 'on_leave').length,
        pendingLeaveRequests: pendingLeaves,
        probationEmployees: fallbackEmployees.filter((e) => e.status === 'probation').length,
        terminatedEmployees: fallbackEmployees.filter((e) => e.status === 'terminated').length,
        totalEmployees: fallbackEmployees.length,
      };
    }

    logger.db.error('Error al obtener KPIs de Recursos Humanos:', error);
    return {
      activeEmployees: 0,
      approvedLeaveDaysThisYear: 0,
      averageMonthlySalary: 0,
      departmentsCount: 0,
      monthlyPayrollTotal: 0,
      newHiresLast30Days: 0,
      onLeaveEmployees: 0,
      pendingLeaveRequests: 0,
      probationEmployees: 0,
      terminatedEmployees: 0,
      totalEmployees: 0,
    };
  }
}

export async function getAllEmployees(filters?: {
  department?: string;
  employmentType?: string;
  modality?: string;
  search?: string;
  status?: string;
}): Promise<HrEmployeeRecord[]> {
  try {
    let whereClause = '1=1';
    const params: unknown[] = [];

    if (filters?.status && filters.status !== 'all') {
      whereClause += ' AND e.status = ?';
      params.push(filters.status);
    }

    if (filters?.department && filters.department !== 'all') {
      whereClause += ' AND e.department = ?';
      params.push(filters.department);
    }

    if (filters?.modality && filters.modality !== 'all') {
      whereClause += ' AND e.work_modality = ?';
      params.push(filters.modality);
    }

    if (filters?.employmentType && filters.employmentType !== 'all') {
      whereClause += ' AND e.employment_type = ?';
      params.push(filters.employmentType);
    }

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      whereClause +=
        ' AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.email LIKE ? OR e.phone LIKE ? OR e.position_title LIKE ? OR e.location_state LIKE ?)';
      params.push(q, q, q, q, q, q);
    }

    const query = `
      SELECT
        e.*,
        COUNT(CASE WHEN lr.status = 'pending' THEN 1 END) AS pending_leaves_count
      FROM hr_employees e
      LEFT JOIN hr_leave_requests lr ON lr.employee_id = e.id
      WHERE ${whereClause}
      GROUP BY e.id
      ORDER BY
        CASE e.status
          WHEN 'active' THEN 1
          WHEN 'probation' THEN 2
          WHEN 'on_leave' THEN 3
          WHEN 'suspended' THEN 4
          WHEN 'terminated' THEN 5
          ELSE 6
        END ASC,
        e.id ASC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows.map(mapRowToEmployee);
  } catch (error) {
    if (isDbOfflineOrMissingTableError(error)) {
      syncFallbackEmployeeCounters();
      let list = [...fallbackEmployees];
      if (filters?.status && filters.status !== 'all') {
        list = list.filter((e) => e.status === filters.status);
      }
      if (filters?.department && filters.department !== 'all') {
        list = list.filter((e) => e.department === filters.department);
      }
      if (filters?.modality && filters.modality !== 'all') {
        list = list.filter((e) => e.work_modality === filters.modality);
      }
      if (filters?.employmentType && filters.employmentType !== 'all') {
        list = list.filter((e) => e.employment_type === filters.employmentType);
      }
      if (filters?.search && filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        list = list.filter(
          (e) =>
            e.full_name.toLowerCase().includes(q) ||
            e.employee_code.toLowerCase().includes(q) ||
            e.email.toLowerCase().includes(q) ||
            e.phone.toLowerCase().includes(q) ||
            e.position_title.toLowerCase().includes(q) ||
            (e.location_state || '').toLowerCase().includes(q)
        );
      }
      return list;
    }

    logger.db.error('Error al listar empleados de Recursos Humanos:', error);
    return [];
  }
}

export async function getEmployeeDetail(uuid: string): Promise<HrEmployeeDossier | null> {
  const cleanUuid = (uuid || '').trim();
  if (!cleanUuid) return null;

  try {
    const [empRows] = await pool.query<RowDataPacket[]>(
      `SELECT
        e.*,
        COUNT(CASE WHEN lr.status = 'pending' THEN 1 END) AS pending_leaves_count
       FROM hr_employees e
       LEFT JOIN hr_leave_requests lr ON lr.employee_id = e.id
       WHERE e.uuid = ?
       GROUP BY e.id`,
      [cleanUuid]
    );

    if (empRows.length === 0) return null;
    const employee = mapRowToEmployee(empRows[0]);

    const [leaveRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM hr_leave_requests WHERE employee_id = ? ORDER BY start_date DESC, created_at DESC`,
      [employee.id]
    );

    const [eventRows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM hr_employee_events WHERE employee_id = ? ORDER BY created_at DESC, id DESC`,
      [employee.id]
    );

    return {
      employee,
      events: eventRows.map(mapRowToEvent),
      leaveRequests: leaveRows.map(mapRowToLeave),
    };
  } catch (error) {
    if (isDbOfflineOrMissingTableError(error)) {
      syncFallbackEmployeeCounters();
      const employee = fallbackEmployees.find((e) => e.uuid === cleanUuid);
      if (!employee) return null;
      const leaveRequests = fallbackLeaveRequests
        .filter((l) => l.employee_id === employee.id)
        .sort((a, b) => b.start_date.localeCompare(a.start_date));
      const events = fallbackEvents
        .filter((ev) => ev.employee_id === employee.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return {
        employee: { ...employee },
        events,
        leaveRequests,
      };
    }

    logger.db.error('Error al obtener expediente del empleado:', error);
    return null;
  }
}

export async function createEmployee(
  input: CreateEmployeeInput,
  actorName: string
): Promise<HrEmployeeRecord> {
  const fullName = (input.full_name || '').trim();
  const email = (input.email || '').trim().toLowerCase();
  const phone = (input.phone || '').replace(/\D/g, '');
  const positionTitle = (input.position_title || '').trim();
  const department = VALID_DEPARTMENTS.includes(input.department) ? input.department : 'operations';
  const employmentType = VALID_EMPLOYMENT_TYPES.includes(input.employment_type as HrEmploymentType)
    ? (input.employment_type as HrEmploymentType)
    : 'full_time';
  const workModality = VALID_MODALITIES.includes(input.work_modality as HrWorkModality)
    ? (input.work_modality as HrWorkModality)
    : 'hybrid';
  const paymentFrequency = VALID_FREQUENCIES.includes(input.payment_frequency as HrPaymentFrequency)
    ? (input.payment_frequency as HrPaymentFrequency)
    : 'biweekly';
  const status: HrEmployeeStatus =
    input.status && VALID_STATUSES.includes(input.status) ? input.status : 'active';
  const hireDate = (input.hire_date || '').trim() || new Date().toISOString().slice(0, 10);
  const monthlySalary = Number(input.monthly_salary || 0);
  const vacationDaysTotal = Math.max(0, Number(input.vacation_days_total ?? 12));
  const clabe = input.clabe ? input.clabe.replace(/\D/g, '') : null;

  if (!fullName || fullName.length < 3) {
    throw new Error('El nombre completo del colaborador es obligatorio (mínimo 3 caracteres).');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Ingresa un correo electrónico corporativo o personal válido.');
  }
  if (!phone || phone.length < 10) {
    throw new Error('El teléfono del colaborador debe contener al menos 10 dígitos.');
  }
  if (!positionTitle) {
    throw new Error('El puesto o cargo del colaborador es obligatorio.');
  }
  if (isNaN(monthlySalary) || monthlySalary < 0) {
    throw new Error('El salario mensual bruto debe ser un monto válido.');
  }
  if (clabe && clabe.length !== 18) {
    throw new Error('La CLABE interbancaria de nómina debe tener exactamente 18 dígitos.');
  }

  const uuid = crypto.randomUUID();

  try {
    const [existingEmail] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM hr_employees WHERE email = ? LIMIT 1`,
      [email]
    );
    if (existingEmail.length > 0) {
      throw new Error('Ya existe un colaborador registrado con ese correo electrónico.');
    }

    const [maxRow] = await pool.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(id), 0) + 1 AS next_num FROM hr_employees`
    );
    const nextNum = Number(maxRow[0]?.next_num || 1);
    const employeeCode = `EMP-${String(nextNum).padStart(4, '0')}`;

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO hr_employees (
        uuid, employee_code, full_name, email, phone, department, position_title,
        employment_type, work_modality, location_state, hire_date, monthly_salary,
        currency, payment_frequency, bank_name, clabe, rfc, curp, nss,
        vacation_days_total, vacation_days_used, emergency_contact_name,
        emergency_contact_phone, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MXN', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
      [
        uuid,
        employeeCode,
        fullName,
        email,
        phone,
        department,
        positionTitle,
        employmentType,
        workModality,
        input.location_state?.trim() || null,
        hireDate,
        monthlySalary,
        paymentFrequency,
        input.bank_name?.trim() || null,
        clabe,
        input.rfc?.trim().toUpperCase() || null,
        input.curp?.trim().toUpperCase() || null,
        input.nss?.trim() || null,
        vacationDaysTotal,
        input.emergency_contact_name?.trim() || null,
        input.emergency_contact_phone?.trim() || null,
        status,
        input.notes?.trim() || null,
      ]
    );

    const newEmployeeId = result.insertId;

    await pool.query(
      `INSERT INTO hr_employee_events (
        uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name
      ) VALUES (?, ?, 'hired', ?, ?, NULL, ?, ?)`,
      [
        crypto.randomUUID(),
        newEmployeeId,
        'Contratación y Alta de Colaborador',
        `Ingreso oficial al departamento de ${department.toUpperCase()} como ${positionTitle}.`,
        `${positionTitle} ($${monthlySalary.toLocaleString('es-MX')} MXN/mes)`,
        actorName || 'Recursos Humanos',
      ]
    );

    const detail = await getEmployeeDetail(uuid);
    if (!detail) {
      throw new Error('Error al recuperar el expediente del colaborador recién contratado.');
    }
    return detail.employee;
  } catch (error: any) {
    if (isDbOfflineOrMissingTableError(error)) {
      if (fallbackEmployees.some((e) => e.email.toLowerCase() === email)) {
        throw new Error('Ya existe un colaborador registrado con ese correo electrónico.');
      }
      const nextId = fallbackEmployees.reduce((max, e) => Math.max(max, e.id), 0) + 1;
      const employeeCode = `EMP-${String(nextId).padStart(4, '0')}`;
      const nowIso = new Date().toISOString();

      const newRecord: HrEmployeeRecord = {
        admin_user_id: null,
        bank_name: input.bank_name?.trim() || null,
        clabe,
        created_at: nowIso,
        currency: 'MXN',
        curp: input.curp?.trim().toUpperCase() || null,
        department,
        email,
        emergency_contact_name: input.emergency_contact_name?.trim() || null,
        emergency_contact_phone: input.emergency_contact_phone?.trim() || null,
        employee_code: employeeCode,
        employment_type: employmentType,
        full_name: fullName,
        hire_date: hireDate,
        id: nextId,
        location_state: input.location_state?.trim() || null,
        monthly_salary: monthlySalary,
        notes: input.notes?.trim() || null,
        nss: input.nss?.trim() || null,
        payment_frequency: paymentFrequency,
        pending_leaves_count: 0,
        phone,
        position_title: positionTitle,
        rfc: input.rfc?.trim().toUpperCase() || null,
        status,
        termination_date: null,
        termination_reason: null,
        updated_at: nowIso,
        uuid,
        vacation_days_available: vacationDaysTotal,
        vacation_days_total: vacationDaysTotal,
        vacation_days_used: 0,
        work_modality: workModality,
      };

      fallbackEmployees.push(newRecord);
      fallbackEvents.unshift({
        created_at: nowIso,
        description: `Ingreso oficial al departamento de ${department.toUpperCase()} como ${positionTitle}.`,
        employee_id: nextId,
        event_type: 'hired',
        id: fallbackEvents.length + 1,
        new_value: `${positionTitle} ($${monthlySalary.toLocaleString('es-MX')} MXN/mes)`,
        previous_value: null,
        recorded_by_name: actorName || 'Recursos Humanos',
        title: 'Contratación y Alta de Colaborador',
        uuid: crypto.randomUUID(),
      });

      return newRecord;
    }

    logger.db.error('Error al contratar colaborador en Recursos Humanos:', error);
    throw error;
  }
}

export async function updateEmployee(
  uuid: string,
  input: UpdateEmployeeInput,
  actorName: string
): Promise<HrEmployeeRecord> {
  const existingDossier = await getEmployeeDetail(uuid);
  if (!existingDossier) {
    throw new Error('El colaborador especificado no fue encontrado.');
  }
  const current = existingDossier.employee;

  const fullName = input.full_name !== undefined ? input.full_name.trim() : current.full_name;
  const email = input.email !== undefined ? input.email.trim().toLowerCase() : current.email;
  const phone = input.phone !== undefined ? input.phone.replace(/\D/g, '') : current.phone;
  const positionTitle = input.position_title !== undefined ? input.position_title.trim() : current.position_title;
  const department =
    input.department && VALID_DEPARTMENTS.includes(input.department) ? input.department : current.department;
  const employmentType =
    input.employment_type && VALID_EMPLOYMENT_TYPES.includes(input.employment_type)
      ? input.employment_type
      : current.employment_type;
  const workModality =
    input.work_modality && VALID_MODALITIES.includes(input.work_modality)
      ? input.work_modality
      : current.work_modality;
  const paymentFrequency =
    input.payment_frequency && VALID_FREQUENCIES.includes(input.payment_frequency)
      ? input.payment_frequency
      : current.payment_frequency;
  const status =
    input.status && VALID_STATUSES.includes(input.status) ? input.status : current.status;
  const hireDate = input.hire_date ? input.hire_date.trim() : current.hire_date;
  const monthlySalary =
    input.monthly_salary !== undefined ? Number(input.monthly_salary) : current.monthly_salary;
  const vacationDaysTotal =
    input.vacation_days_total !== undefined
      ? Math.max(0, Number(input.vacation_days_total))
      : current.vacation_days_total;
  const vacationDaysUsed =
    input.vacation_days_used !== undefined
      ? Math.max(0, Number(input.vacation_days_used))
      : current.vacation_days_used;
  const clabe =
    input.clabe !== undefined ? (input.clabe ? input.clabe.replace(/\D/g, '') : null) : current.clabe;

  if (!fullName || fullName.length < 3) {
    throw new Error('El nombre completo del colaborador es obligatorio.');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El correo electrónico proporcionado no es válido.');
  }
  if (!phone || phone.length < 10) {
    throw new Error('El teléfono debe contener al menos 10 dígitos.');
  }
  if (!positionTitle) {
    throw new Error('El puesto o cargo es obligatorio.');
  }
  if (clabe && clabe.length !== 18) {
    throw new Error('La CLABE interbancaria debe tener exactamente 18 dígitos.');
  }

  try {
    const [dupEmail] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM hr_employees WHERE email = ? AND uuid != ? LIMIT 1`,
      [email, uuid]
    );
    if (dupEmail.length > 0) {
      throw new Error('Otro colaborador ya tiene asignado ese correo electrónico.');
    }

    await pool.query(
      `UPDATE hr_employees SET
        full_name = ?,
        email = ?,
        phone = ?,
        department = ?,
        position_title = ?,
        employment_type = ?,
        work_modality = ?,
        location_state = ?,
        hire_date = ?,
        monthly_salary = ?,
        payment_frequency = ?,
        bank_name = ?,
        clabe = ?,
        rfc = ?,
        curp = ?,
        nss = ?,
        vacation_days_total = ?,
        vacation_days_used = ?,
        emergency_contact_name = ?,
        emergency_contact_phone = ?,
        status = ?,
        notes = ?
       WHERE uuid = ?`,
      [
        fullName,
        email,
        phone,
        department,
        positionTitle,
        employmentType,
        workModality,
        input.location_state !== undefined ? input.location_state?.trim() || null : current.location_state,
        hireDate,
        monthlySalary,
        paymentFrequency,
        input.bank_name !== undefined ? input.bank_name?.trim() || null : current.bank_name,
        clabe,
        input.rfc !== undefined ? input.rfc?.trim().toUpperCase() || null : current.rfc,
        input.curp !== undefined ? input.curp?.trim().toUpperCase() || null : current.curp,
        input.nss !== undefined ? input.nss?.trim() || null : current.nss,
        vacationDaysTotal,
        vacationDaysUsed,
        input.emergency_contact_name !== undefined
          ? input.emergency_contact_name?.trim() || null
          : current.emergency_contact_name,
        input.emergency_contact_phone !== undefined
          ? input.emergency_contact_phone?.trim() || null
          : current.emergency_contact_phone,
        status,
        input.notes !== undefined ? input.notes?.trim() || null : current.notes,
        uuid,
      ]
    );

    if (positionTitle !== current.position_title) {
      await pool.query(
        `INSERT INTO hr_employee_events (uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name)
         VALUES (?, ?, 'promotion', 'Cambio de Puesto / Promoción', 'Actualización de cargo en el expediente laboral.', ?, ?, ?)`,
        [crypto.randomUUID(), current.id, current.position_title, positionTitle, actorName]
      );
    }

    if (Math.abs(monthlySalary - current.monthly_salary) >= 1) {
      await pool.query(
        `INSERT INTO hr_employee_events (uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name)
         VALUES (?, ?, 'salary_adjustment', 'Ajuste de Compensación Mensual', 'Actualización salarial registrada en nómina.', ?, ?, ?)`,
        [
          crypto.randomUUID(),
          current.id,
          `$${current.monthly_salary.toLocaleString('es-MX')} MXN`,
          `$${monthlySalary.toLocaleString('es-MX')} MXN`,
          actorName,
        ]
      );
    }

    if (department !== current.department) {
      await pool.query(
        `INSERT INTO hr_employee_events (uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name)
         VALUES (?, ?, 'department_transfer', 'Transferencia de Departamento', 'Reubicación organizacional de área.', ?, ?, ?)`,
        [crypto.randomUUID(), current.id, current.department, department, actorName]
      );
    }

    const updated = await getEmployeeDetail(uuid);
    if (!updated) {
      throw new Error('No se pudo obtener el colaborador actualizado.');
    }
    return updated.employee;
  } catch (error: any) {
    if (isDbOfflineOrMissingTableError(error)) {
      const idx = fallbackEmployees.findIndex((e) => e.uuid === uuid);
      if (idx === -1) throw new Error('Colaborador no encontrado.');
      const nowIso = new Date().toISOString();
      const updatedRecord: HrEmployeeRecord = {
        ...fallbackEmployees[idx],
        bank_name: input.bank_name !== undefined ? input.bank_name?.trim() || null : current.bank_name,
        clabe,
        curp: input.curp !== undefined ? input.curp?.trim().toUpperCase() || null : current.curp,
        department,
        email,
        emergency_contact_name:
          input.emergency_contact_name !== undefined
            ? input.emergency_contact_name?.trim() || null
            : current.emergency_contact_name,
        emergency_contact_phone:
          input.emergency_contact_phone !== undefined
            ? input.emergency_contact_phone?.trim() || null
            : current.emergency_contact_phone,
        employment_type: employmentType,
        full_name: fullName,
        hire_date: hireDate,
        location_state:
          input.location_state !== undefined ? input.location_state?.trim() || null : current.location_state,
        monthly_salary: monthlySalary,
        notes: input.notes !== undefined ? input.notes?.trim() || null : current.notes,
        nss: input.nss !== undefined ? input.nss?.trim() || null : current.nss,
        payment_frequency: paymentFrequency,
        phone,
        position_title: positionTitle,
        rfc: input.rfc !== undefined ? input.rfc?.trim().toUpperCase() || null : current.rfc,
        status,
        updated_at: nowIso,
        vacation_days_available: Math.max(0, vacationDaysTotal - vacationDaysUsed),
        vacation_days_total: vacationDaysTotal,
        vacation_days_used: vacationDaysUsed,
        work_modality: workModality,
      };
      fallbackEmployees[idx] = updatedRecord;
      return updatedRecord;
    }

    logger.db.error('Error al actualizar colaborador en RRHH:', error);
    throw error;
  }
}

export async function updateEmployeeStatus(
  uuid: string,
  status: HrEmployeeStatus,
  reason: string | null,
  actorName: string
): Promise<HrEmployeeRecord> {
  if (!VALID_STATUSES.includes(status)) {
    throw new Error('El estatus laboral proporcionado no es válido.');
  }

  const existingDossier = await getEmployeeDetail(uuid);
  if (!existingDossier) {
    throw new Error('El colaborador no fue encontrado.');
  }
  const current = existingDossier.employee;
  const cleanReason = reason?.trim() || null;
  const isTerminated = status === 'terminated';
  const terminationDate = isTerminated ? new Date().toISOString().slice(0, 10) : null;

  try {
    await pool.query(
      `UPDATE hr_employees
       SET status = ?, termination_date = ?, termination_reason = ?
       WHERE uuid = ?`,
      [status, terminationDate, isTerminated ? cleanReason : null, uuid]
    );

    await pool.query(
      `INSERT INTO hr_employee_events (uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        current.id,
        isTerminated ? 'terminated' : 'status_change',
        isTerminated ? 'Baja Laboral / Terminación de Contrato' : 'Actualización de Estatus Laboral',
        cleanReason || `Cambio de estatus laboral de ${current.status} a ${status}.`,
        current.status,
        status,
        actorName,
      ]
    );

    const updated = await getEmployeeDetail(uuid);
    if (!updated) throw new Error('Error al consultar colaborador actualizado.');
    return updated.employee;
  } catch (error: any) {
    if (isDbOfflineOrMissingTableError(error)) {
      const idx = fallbackEmployees.findIndex((e) => e.uuid === uuid);
      if (idx === -1) throw new Error('Colaborador no encontrado.');
      fallbackEmployees[idx].status = status;
      fallbackEmployees[idx].termination_date = terminationDate;
      fallbackEmployees[idx].termination_reason = isTerminated ? cleanReason : null;
      fallbackEmployees[idx].updated_at = new Date().toISOString();
      fallbackEvents.unshift({
        created_at: new Date().toISOString(),
        description: cleanReason || `Cambio de estatus laboral de ${current.status} a ${status}.`,
        employee_id: current.id,
        event_type: isTerminated ? 'terminated' : 'status_change',
        id: fallbackEvents.length + 1,
        new_value: status,
        previous_value: current.status,
        recorded_by_name: actorName,
        title: isTerminated ? 'Baja Laboral / Terminación de Contrato' : 'Actualización de Estatus Laboral',
        uuid: crypto.randomUUID(),
      });
      return fallbackEmployees[idx];
    }

    logger.db.error('Error al cambiar estatus laboral del colaborador:', error);
    throw error;
  }
}

export async function deleteEmployee(uuid: string): Promise<void> {
  const existing = await getEmployeeDetail(uuid);
  if (!existing) {
    throw new Error('El colaborador especificado no existe.');
  }

  try {
    await pool.query(`DELETE FROM hr_employees WHERE uuid = ?`, [uuid]);
  } catch (error: any) {
    if (isDbOfflineOrMissingTableError(error)) {
      const idx = fallbackEmployees.findIndex((e) => e.uuid === uuid);
      if (idx !== -1) fallbackEmployees.splice(idx, 1);
      return;
    }
    logger.db.error('Error al eliminar colaborador de RRHH:', error);
    throw error;
  }
}

export async function getAllLeaveRequests(filters?: {
  employeeUuid?: string;
  leaveType?: string;
  search?: string;
  status?: string;
}): Promise<HrLeaveRequestWithEmployee[]> {
  try {
    let whereClause = '1=1';
    const params: unknown[] = [];

    if (filters?.status && filters.status !== 'all') {
      whereClause += ' AND lr.status = ?';
      params.push(filters.status);
    }

    if (filters?.leaveType && filters.leaveType !== 'all') {
      whereClause += ' AND lr.leave_type = ?';
      params.push(filters.leaveType);
    }

    if (filters?.employeeUuid) {
      whereClause += ' AND e.uuid = ?';
      params.push(filters.employeeUuid);
    }

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      whereClause +=
        ' AND (e.full_name LIKE ? OR e.employee_code LIKE ? OR e.position_title LIKE ? OR lr.reason LIKE ?)';
      params.push(q, q, q, q);
    }

    const query = `
      SELECT
        lr.*,
        e.uuid AS employee_uuid,
        e.employee_code,
        e.full_name AS employee_name,
        e.email AS employee_email,
        e.phone AS employee_phone,
        e.department,
        e.position_title,
        e.status AS employee_status,
        e.vacation_days_total,
        e.vacation_days_used
      FROM hr_leave_requests lr
      INNER JOIN hr_employees e ON e.id = lr.employee_id
      WHERE ${whereClause}
      ORDER BY
        CASE lr.status
          WHEN 'pending' THEN 1
          WHEN 'approved' THEN 2
          WHEN 'rejected' THEN 3
          WHEN 'cancelled' THEN 4
          ELSE 5
        END ASC,
        lr.start_date DESC,
        lr.id DESC
    `;

    const [rows] = await pool.query<RowDataPacket[]>(query, params);
    return rows.map((row) => {
      const base = mapRowToLeave(row);
      const totalVac = Number(row.vacation_days_total ?? 12);
      const usedVac = Number(row.vacation_days_used ?? 0);
      return {
        ...base,
        department: (row.department as HrDepartment) || 'operations',
        employee_code: String(row.employee_code || ''),
        employee_email: String(row.employee_email || ''),
        employee_name: String(row.employee_name || ''),
        employee_phone: String(row.employee_phone || ''),
        employee_status: (row.employee_status as HrEmployeeStatus) || 'active',
        employee_uuid: String(row.employee_uuid || ''),
        position_title: String(row.position_title || ''),
        vacation_days_available: Math.max(0, totalVac - usedVac),
        vacation_days_total: totalVac,
        vacation_days_used: usedVac,
      };
    });
  } catch (error) {
    if (isDbOfflineOrMissingTableError(error)) {
      syncFallbackEmployeeCounters();
      let joined: HrLeaveRequestWithEmployee[] = fallbackLeaveRequests
        .map((lr) => {
          const emp = fallbackEmployees.find((e) => e.id === lr.employee_id);
          if (!emp) return null;
          return {
            ...lr,
            department: emp.department,
            employee_code: emp.employee_code,
            employee_email: emp.email,
            employee_name: emp.full_name,
            employee_phone: emp.phone,
            employee_status: emp.status,
            employee_uuid: emp.uuid,
            position_title: emp.position_title,
            vacation_days_available: emp.vacation_days_available,
            vacation_days_total: emp.vacation_days_total,
            vacation_days_used: emp.vacation_days_used,
          };
        })
        .filter((item): item is HrLeaveRequestWithEmployee => item !== null);

      if (filters?.status && filters.status !== 'all') {
        joined = joined.filter((item) => item.status === filters.status);
      }
      if (filters?.leaveType && filters.leaveType !== 'all') {
        joined = joined.filter((item) => item.leave_type === filters.leaveType);
      }
      if (filters?.employeeUuid) {
        joined = joined.filter((item) => item.employee_uuid === filters.employeeUuid);
      }
      if (filters?.search && filters.search.trim()) {
        const q = filters.search.trim().toLowerCase();
        joined = joined.filter(
          (item) =>
            item.employee_name.toLowerCase().includes(q) ||
            item.employee_code.toLowerCase().includes(q) ||
            item.position_title.toLowerCase().includes(q) ||
            (item.reason || '').toLowerCase().includes(q)
        );
      }
      return joined;
    }

    logger.db.error('Error al listar solicitudes de vacaciones y permisos:', error);
    return [];
  }
}

export async function createLeaveRequest(
  input: CreateLeaveRequestInput,
  actorName: string
): Promise<HrLeaveRequestWithEmployee> {
  const employeeUuid = (input.employee_uuid || '').trim();
  const leaveType = VALID_LEAVE_TYPES.includes(input.leave_type) ? input.leave_type : 'vacation';
  const startDate = (input.start_date || '').trim();
  const endDate = (input.end_date || '').trim();
  const daysCount = Math.max(1, Number(input.days_count || 1));
  const reason = input.reason?.trim() || null;
  const autoApprove = Boolean(input.auto_approve);

  if (!employeeUuid) {
    throw new Error('Debes seleccionar un colaborador para registrar la ausencia.');
  }
  if (!startDate || !endDate) {
    throw new Error('Las fechas de inicio y fin son obligatorias.');
  }
  if (endDate < startDate) {
    throw new Error('La fecha de término no puede ser anterior a la fecha de inicio.');
  }

  const dossier = await getEmployeeDetail(employeeUuid);
  if (!dossier) {
    throw new Error('El colaborador seleccionado no existe.');
  }
  const employee = dossier.employee;

  if (employee.status === 'terminated') {
    throw new Error('No se pueden registrar vacaciones o permisos para un colaborador dado de baja.');
  }

  if (leaveType === 'vacation' && daysCount > employee.vacation_days_available) {
    throw new Error(
      `El colaborador solo cuenta con ${employee.vacation_days_available} días de vacaciones disponibles (solicitados: ${daysCount}).`
    );
  }

  const uuid = crypto.randomUUID();
  const initialStatus: HrLeaveStatus = autoApprove ? 'approved' : 'pending';
  const reviewedBy = autoApprove ? actorName : null;
  const reviewNotes = autoApprove ? 'Aprobación directa al registrar solicitud en RRHH.' : null;
  const todayStr = new Date().toISOString().slice(0, 10);

  try {
    await pool.query(
      `INSERT INTO hr_leave_requests (
        uuid, employee_id, leave_type, start_date, end_date, days_count,
        reason, status, reviewed_by_name, review_notes, reviewed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        employee.id,
        leaveType,
        startDate,
        endDate,
        daysCount,
        reason,
        initialStatus,
        reviewedBy,
        reviewNotes,
        autoApprove ? new Date() : null,
      ]
    );

    if (autoApprove) {
      if (leaveType === 'vacation') {
        await pool.query(
          `UPDATE hr_employees SET vacation_days_used = vacation_days_used + ? WHERE id = ?`,
          [daysCount, employee.id]
        );
      }

      if (startDate <= todayStr && endDate >= todayStr && employee.status === 'active') {
        await pool.query(`UPDATE hr_employees SET status = 'on_leave' WHERE id = ?`, [employee.id]);
      }

      await pool.query(
        `INSERT INTO hr_employee_events (uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name)
         VALUES (?, ?, 'leave_approved', ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          employee.id,
          `Ausencia Aprobada (${daysCount} día${daysCount === 1 ? '' : 's'})`,
          `Periodo del ${startDate} al ${endDate}. ${reason || ''}`.trim(),
          `${employee.vacation_days_used} días usados`,
          leaveType === 'vacation'
            ? `${employee.vacation_days_used + daysCount} días usados`
            : `${daysCount} días (${leaveType})`,
          actorName,
        ]
      );
    }

    const all = await getAllLeaveRequests({ employeeUuid });
    const created = all.find((l) => l.uuid === uuid);
    if (!created) {
      throw new Error('Error al recuperar la solicitud recién registrada.');
    }
    return created;
  } catch (error: any) {
    if (isDbOfflineOrMissingTableError(error)) {
      const nowIso = new Date().toISOString();
      const newLeave: HrLeaveRequestRecord = {
        created_at: nowIso,
        days_count: daysCount,
        employee_id: employee.id,
        end_date: endDate,
        id: fallbackLeaveRequests.length + 1,
        leave_type: leaveType,
        reason,
        review_notes: reviewNotes,
        reviewed_at: autoApprove ? nowIso : null,
        reviewed_by_name: reviewedBy,
        start_date: startDate,
        status: initialStatus,
        updated_at: nowIso,
        uuid,
      };
      fallbackLeaveRequests.unshift(newLeave);

      const empObj = fallbackEmployees.find((e) => e.id === employee.id);
      if (empObj && autoApprove) {
        if (leaveType === 'vacation') {
          empObj.vacation_days_used += daysCount;
        }
        if (startDate <= todayStr && endDate >= todayStr && empObj.status === 'active') {
          empObj.status = 'on_leave';
        }
      }
      syncFallbackEmployeeCounters();

      return {
        ...newLeave,
        department: employee.department,
        employee_code: employee.employee_code,
        employee_email: employee.email,
        employee_name: employee.full_name,
        employee_phone: employee.phone,
        employee_status: empObj?.status || employee.status,
        employee_uuid: employee.uuid,
        position_title: employee.position_title,
        vacation_days_available: empObj?.vacation_days_available ?? employee.vacation_days_available,
        vacation_days_total: employee.vacation_days_total,
        vacation_days_used: empObj?.vacation_days_used ?? employee.vacation_days_used,
      };
    }

    logger.db.error('Error al crear solicitud de vacaciones o permiso:', error);
    throw error;
  }
}

export async function reviewLeaveRequest(
  uuid: string,
  action: 'approve' | 'cancel' | 'reject',
  reviewNotes: string | null,
  actorName: string
): Promise<HrLeaveRequestWithEmployee> {
  const cleanUuid = (uuid || '').trim();
  const cleanNotes = reviewNotes?.trim() || null;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT lr.*, e.uuid AS employee_uuid, e.vacation_days_total, e.vacation_days_used, e.status AS employee_status
       FROM hr_leave_requests lr
       INNER JOIN hr_employees e ON e.id = lr.employee_id
       WHERE lr.uuid = ? LIMIT 1`,
      [cleanUuid]
    );

    if (rows.length === 0) {
      throw new Error('La solicitud de ausencia no fue encontrada.');
    }

    const reqRow = rows[0];
    const currentStatus = reqRow.status as HrLeaveStatus;
    const leaveType = reqRow.leave_type as HrLeaveType;
    const daysCount = Number(reqRow.days_count || 1);
    const employeeId = Number(reqRow.employee_id);
    const totalVac = Number(reqRow.vacation_days_total ?? 12);
    const usedVac = Number(reqRow.vacation_days_used ?? 0);
    const availVac = Math.max(0, totalVac - usedVac);

    if (action === 'approve') {
      if (currentStatus !== 'pending') {
        throw new Error('Solo se pueden aprobar solicitudes que se encuentran pendientes.');
      }
      if (leaveType === 'vacation' && daysCount > availVac) {
        throw new Error(
          `El colaborador solo dispone de ${availVac} días de vacaciones (solicitados: ${daysCount}).`
        );
      }

      await pool.query(
        `UPDATE hr_leave_requests
         SET status = 'approved', reviewed_by_name = ?, review_notes = ?, reviewed_at = NOW()
         WHERE uuid = ?`,
        [actorName, cleanNotes || 'Solicitud aprobada por Recursos Humanos.', cleanUuid]
      );

      if (leaveType === 'vacation') {
        await pool.query(
          `UPDATE hr_employees SET vacation_days_used = vacation_days_used + ? WHERE id = ?`,
          [daysCount, employeeId]
        );
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const startStr = formatDateOnly(reqRow.start_date) || '';
      const endStr = formatDateOnly(reqRow.end_date) || '';
      if (startStr <= todayStr && endStr >= todayStr && reqRow.employee_status === 'active') {
        await pool.query(`UPDATE hr_employees SET status = 'on_leave' WHERE id = ?`, [employeeId]);
      }

      await pool.query(
        `INSERT INTO hr_employee_events (uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name)
         VALUES (?, ?, 'leave_approved', ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          employeeId,
          `Vacaciones / Permiso Autorizado (${daysCount} día${daysCount === 1 ? '' : 's'})`,
          cleanNotes || `Periodo autorizado del ${startStr} al ${endStr}.`,
          `${usedVac} días tomados`,
          leaveType === 'vacation' ? `${usedVac + daysCount} días tomados` : `${daysCount} días (${leaveType})`,
          actorName,
        ]
      );
    } else if (action === 'reject') {
      if (currentStatus !== 'pending') {
        throw new Error('Solo se pueden rechazar solicitudes en estado pendiente.');
      }
      await pool.query(
        `UPDATE hr_leave_requests
         SET status = 'rejected', reviewed_by_name = ?, review_notes = ?, reviewed_at = NOW()
         WHERE uuid = ?`,
        [actorName, cleanNotes || 'Solicitud rechazada.', cleanUuid]
      );
    } else if (action === 'cancel') {
      if (currentStatus === 'cancelled') {
        throw new Error('La solicitud ya se encuentra cancelada.');
      }
      await pool.query(
        `UPDATE hr_leave_requests
         SET status = 'cancelled', reviewed_by_name = ?, review_notes = ?, reviewed_at = NOW()
         WHERE uuid = ?`,
        [actorName, cleanNotes || 'Solicitud cancelada.', cleanUuid]
      );

      if (currentStatus === 'approved' && leaveType === 'vacation') {
        await pool.query(
          `UPDATE hr_employees SET vacation_days_used = GREATEST(0, vacation_days_used - ?) WHERE id = ?`,
          [daysCount, employeeId]
        );
      }
    }

    const updatedList = await getAllLeaveRequests({ employeeUuid: String(reqRow.employee_uuid) });
    const updatedItem = updatedList.find((l) => l.uuid === cleanUuid);
    if (!updatedItem) {
      throw new Error('No se pudo recuperar la solicitud actualizada.');
    }
    return updatedItem;
  } catch (error: any) {
    if (isDbOfflineOrMissingTableError(error)) {
      const leave = fallbackLeaveRequests.find((l) => l.uuid === cleanUuid);
      if (!leave) throw new Error('Solicitud no encontrada.');
      const emp = fallbackEmployees.find((e) => e.id === leave.employee_id);
      if (!emp) throw new Error('Colaborador no encontrado.');

      if (action === 'approve') {
        if (leave.status !== 'pending') throw new Error('Solo se pueden aprobar solicitudes pendientes.');
        if (leave.leave_type === 'vacation' && leave.days_count > emp.vacation_days_available) {
          throw new Error(`El colaborador solo dispone de ${emp.vacation_days_available} días de vacaciones.`);
        }
        leave.status = 'approved';
        leave.reviewed_by_name = actorName;
        leave.review_notes = cleanNotes || 'Solicitud aprobada por Recursos Humanos.';
        leave.reviewed_at = new Date().toISOString();
        if (leave.leave_type === 'vacation') {
          emp.vacation_days_used += leave.days_count;
        }
      } else if (action === 'reject') {
        leave.status = 'rejected';
        leave.reviewed_by_name = actorName;
        leave.review_notes = cleanNotes || 'Solicitud rechazada.';
        leave.reviewed_at = new Date().toISOString();
      } else if (action === 'cancel') {
        if (leave.status === 'approved' && leave.leave_type === 'vacation') {
          emp.vacation_days_used = Math.max(0, emp.vacation_days_used - leave.days_count);
        }
        leave.status = 'cancelled';
        leave.reviewed_by_name = actorName;
        leave.review_notes = cleanNotes || 'Solicitud cancelada.';
        leave.reviewed_at = new Date().toISOString();
      }
      syncFallbackEmployeeCounters();
      return {
        ...leave,
        department: emp.department,
        employee_code: emp.employee_code,
        employee_email: emp.email,
        employee_name: emp.full_name,
        employee_phone: emp.phone,
        employee_status: emp.status,
        employee_uuid: emp.uuid,
        position_title: emp.position_title,
        vacation_days_available: emp.vacation_days_available,
        vacation_days_total: emp.vacation_days_total,
        vacation_days_used: emp.vacation_days_used,
      };
    }

    logger.db.error('Error al dictaminar solicitud de vacaciones o permiso:', error);
    throw error;
  }
}

export async function createEmployeeEvent(
  employeeUuid: string,
  input: CreateEmployeeEventInput,
  actorName: string
): Promise<HrEmployeeEventRecord> {
  const dossier = await getEmployeeDetail(employeeUuid);
  if (!dossier) {
    throw new Error('El colaborador especificado no existe.');
  }

  const eventType = VALID_EVENT_TYPES.includes(input.event_type)
    ? input.event_type
    : 'performance_review';
  const title = (input.title || '').trim();
  if (!title) {
    throw new Error('El título del registro o evaluación es obligatorio.');
  }

  const eventUuid = crypto.randomUUID();
  const description = input.description?.trim() || null;
  const newSalary = Number(input.new_salary || 0);
  const previousValue =
    input.previous_value?.trim() ||
    (newSalary > 0 ? `$${dossier.employee.monthly_salary} MXN` : null);
  const newValue =
    input.new_value?.trim() || (newSalary > 0 ? `$${newSalary} MXN` : null);

  try {
    if (newSalary > 0) {
      await pool.query(`UPDATE hr_employees SET monthly_salary = ? WHERE id = ?`, [
        newSalary,
        dossier.employee.id,
      ]);
    }

    const [res] = await pool.query<ResultSetHeader>(
      `INSERT INTO hr_employee_events (
        uuid, employee_id, event_type, title, description, previous_value, new_value, recorded_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventUuid,
        dossier.employee.id,
        eventType,
        title,
        description,
        previousValue,
        newValue,
        actorName,
      ]
    );

    return {
      created_at: new Date().toISOString(),
      description,
      employee_id: dossier.employee.id,
      event_type: eventType,
      id: res.insertId,
      new_value: newValue,
      previous_value: previousValue,
      recorded_by_name: actorName,
      title,
      uuid: eventUuid,
    };
  } catch (error: any) {
    if (isDbOfflineOrMissingTableError(error)) {
      if (newSalary > 0) {
        const emp = fallbackEmployees.find((e) => e.id === dossier.employee.id);
        if (emp) emp.monthly_salary = newSalary;
      }
      const newEv: HrEmployeeEventRecord = {
        created_at: new Date().toISOString(),
        description,
        employee_id: dossier.employee.id,
        event_type: eventType,
        id: fallbackEvents.length + 1,
        new_value: newValue,
        previous_value: previousValue,
        recorded_by_name: actorName,
        title,
        uuid: eventUuid,
      };
      fallbackEvents.unshift(newEv);
      return newEv;
    }

    logger.db.error('Error al registrar evento en el expediente del colaborador:', error);
    throw error;
  }
}
