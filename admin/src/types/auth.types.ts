import { RowDataPacket } from 'mysql2';

export type AdminRole =
  | 'AUDITOR'
  | 'BILLING_AGENT'
  | 'BILLING_MANAGER'
  | 'COMPLIANCE_ADMIN'
  | 'CUSTOMER_SUCCESS'
  | 'DATA_ADMIN'
  | 'DATA_ANALYST'
  | 'DATA_AUDITOR'
  | 'DATA_ENGINEER'
  | 'DEVOPS'
  | 'ENGINEER'
  | 'FINANCE_ADMIN'
  | 'HR_MANAGER'
  | 'HR_RECRUITER'
  | 'IAM_ADMIN'
  | 'INCIDENT_MANAGER'
  | 'OPERATIONS_AGENT'
  | 'OPERATIONS_MANAGER'
  | 'PLATFORM_ADMIN'
  | 'PRIVACY_ADMIN'
  | 'READ_ONLY_ADMIN'
  | 'REFUNDS_ADMIN'
  | 'RELEASE_MANAGER'
  | 'SECURITY_ADMIN'
  | 'SENIOR_ENGINEER'
  | 'SRE'
  | 'SUPER_ADMIN'
  | 'SUPPORT_L1'
  | 'SUPPORT_L2'
  | 'SUPPORT_L3'
  | 'SUPPORT_MANAGER'
  | 'SYSTEM_ACCOUNT'
  | 'SYSTEM_OPERATOR'
  | 'WORKFLOW_ADMIN';

export type RoleCategory = 'data' | 'engineering' | 'finance' | 'operations' | 'platform' | 'support';

export interface PermissionDefinition {
  description: string;
  display_name: string;
  id?: number;
  module: string;
  name: string;
}

export interface RoleRecord extends RowDataPacket {
  category: RoleCategory;
  created_at?: Date | string;
  description: string | null;
  display_name: string;
  id: number;
  name: AdminRole;
  updated_at?: Date | string;
  user_count?: number;
}

export interface RoleMatrixItem {
  category: RoleCategory;
  description: string;
  display_name: string;
  id: number;
  name: AdminRole;
  permissions: string[];
  user_count: number;
}

export interface AdminUserWithRoles {
  created_at: Date | string;
  email: string;
  id: number;
  is_active: number;
  last_login_at: Date | string | null;
  name: string;
  permissions: string[];
  roles: string[];
  uuid: string;
}

export interface AdminUser {
  created_at?: Date | string;
  email: string;
  id: number;
  is_active: number;
  last_login_at?: Date | string | null;
  name: string;
  updated_at?: Date | string;
  uuid: string;
}

export interface AdminUserRow extends RowDataPacket {
  created_at: Date;
  email: string;
  id: number;
  is_active: number;
  last_login_at: Date | null;
  name: string;
  password_hash: string;
  updated_at: Date;
  uuid: string;
}

export interface AdminSession {
  createdAt: number;
  email: string;
  id: number;
  ip: string;
  name: string;
  permissions?: string[];
  roles?: string[];
  userAgent: string;
  uuid: string;
}

export interface SafeAdminUser {
  email: string;
  id: number;
  name: string;
  permissions: string[];
  roles: string[];
  uuid: string;
}
