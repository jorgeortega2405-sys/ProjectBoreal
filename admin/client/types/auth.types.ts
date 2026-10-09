export interface AdminUser {
  email: string;
  id: number;
  name: string;
  uuid: string;
}

export interface LoginResponseData {
  token?: string;
  user: AdminUser;
}

export interface MeResponseData {
  user: AdminUser;
}
