import { Request } from 'express';

export interface AdminUser {
  created_at?: Date;
  email: string;
  id: number;
  is_active: number;
  name: string;
  password_hash: string;
  updated_at?: Date;
  uuid: string;
}

export interface AdminSafeUser {
  email: string;
  id: number;
  name: string;
  uuid: string;
}

export interface AdminSessionPayload {
  email: string;
  exp: number;
  iat: number;
  id: number;
  name: string;
  uuid: string;
}

export interface AuthenticatedAdminRequest extends Request {
  adminUser?: AdminSafeUser;
}
