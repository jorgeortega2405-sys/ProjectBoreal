import { RowDataPacket } from 'mysql2';

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
  userAgent: string;
  uuid: string;
}

export interface SafeAdminUser {
  email: string;
  id: number;
  name: string;
  permissions?: string[];
  uuid: string;
}
