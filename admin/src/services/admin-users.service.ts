import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { hashPassword } from '../utils/crypto.util.js';
import { logger } from './logger.service.js';
import { getAdminEffectivePermissions, getAdminRoles, PLATFORM_PERMISSIONS } from './roles.service.js';
import crypto from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export interface AdminUserItem {
  active_sessions_count: number;
  avatar_url: string | null;
  created_at: string;
  email: string;
  id: number;
  is_active: boolean;
  last_login_at: string | null;
  name: string;
  permissions: string[];
  roles: Array<{ display_name: string; id: number; name: string }>;
  uuid: string;
}

export interface RoleDetailItem {
  category: string;
  description: string;
  display_name: string;
  id: number;
  is_system: boolean;
  name: string;
  permissions: string[];
  user_count: number;
}

export interface ActiveSessionItem {
  createdAt: string;
  email: string;
  id: number;
  ip: string;
  name: string;
  roles: string[];
  token: string;
  ttlSeconds: number;
  userAgent: string;
}

export interface SecurityKpis {
  activeAdmins: number;
  activeSessions: number;
  configuredRoles: number;
  totalAdmins: number;
}

export class AdminUsersService {
  async getSecurityKpis(): Promise<SecurityKpis> {
    try {
      const [userRows] = await pool.query<RowDataPacket[]>(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
         FROM admin_users`
      );
      const [roleRows] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM roles');

      let activeSessions = 0;
      if (redis.status === 'ready') {
        const keys = await redis.keys('admin:session:*');
        activeSessions = keys.length;
      }

      const totalAdmins = Number(userRows[0]?.total || 0);
      const activeAdmins = Number(userRows[0]?.active || 0);
      const configuredRoles = Number(roleRows[0]?.total || 0);

      return {
        activeAdmins,
        activeSessions,
        configuredRoles,
        totalAdmins,
      };
    } catch (error) {
      logger.db.error('Error al consultar KPIs de seguridad y administradores', error);
      return {
        activeAdmins: 0,
        activeSessions: 0,
        configuredRoles: 0,
        totalAdmins: 0,
      };
    }
  }

  async listAdmins(search?: string, roleFilter?: string, statusFilter?: string): Promise<AdminUserItem[]> {
    try {
      const [users] = await pool.query<RowDataPacket[]>(
        `SELECT id, uuid, name, email, is_active, NULL AS avatar_url, last_login_at, created_at
         FROM admin_users
         ORDER BY id ASC`
      );

      const [userRolesRows] = await pool.query<RowDataPacket[]>(
        `SELECT aur.admin_user_id, r.id AS role_id, r.name AS role_name, r.display_name AS role_display_name
         FROM admin_user_roles aur
         INNER JOIN roles r ON aur.role_id = r.id
         ORDER BY r.id ASC`
      );

      const rolesByUser = new Map<number, Array<{ display_name: string; id: number; name: string }>>();
      for (const row of userRolesRows) {
        const uid = Number(row.admin_user_id);
        const list = rolesByUser.get(uid) || [];
        list.push({
          display_name: String(row.role_display_name || row.role_name),
          id: Number(row.role_id),
          name: String(row.role_name),
        });
        rolesByUser.set(uid, list);
      }

      const sessionCounts = new Map<number, number>();
      if (redis.status === 'ready') {
        const sessionKeys = await redis.keys('admin:session:*');
        for (const k of sessionKeys) {
          const raw = await redis.get(k);
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.id) {
                const uid = Number(parsed.id);
                sessionCounts.set(uid, (sessionCounts.get(uid) || 0) + 1);
              }
            } catch {}
          }
        }
      }

      const cleanSearch = (search || '').toLowerCase().trim();
      const results: AdminUserItem[] = [];

      for (const u of users) {
        const uid = Number(u.id);
        const uRoles = rolesByUser.get(uid) || [];
        const perms = await getAdminEffectivePermissions(uid);
        const isActive = Boolean(u.is_active);

        if (cleanSearch) {
          const nameMatch = String(u.name || '').toLowerCase().includes(cleanSearch);
          const emailMatch = String(u.email || '').toLowerCase().includes(cleanSearch);
          if (!nameMatch && !emailMatch) continue;
        }

        if (roleFilter && roleFilter !== 'all') {
          const hasRole = uRoles.some((r) => r.name === roleFilter);
          if (!hasRole) continue;
        }

        if (statusFilter && statusFilter !== 'all') {
          if (statusFilter === 'active' && !isActive) continue;
          if (statusFilter === 'inactive' && isActive) continue;
        }

        results.push({
          active_sessions_count: sessionCounts.get(uid) || 0,
          avatar_url: u.avatar_url ? String(u.avatar_url) : null,
          created_at: u.created_at instanceof Date ? u.created_at.toISOString() : String(u.created_at || ''),
          email: String(u.email),
          id: uid,
          is_active: isActive,
          last_login_at: u.last_login_at instanceof Date ? u.last_login_at.toISOString() : (u.last_login_at ? String(u.last_login_at) : null),
          name: String(u.name),
          permissions: perms,
          roles: uRoles,
          uuid: String(u.uuid),
        });
      }

      return results;
    } catch (error) {
      logger.db.error('Error al listar administradores', error);
      return [];
    }
  }

  async createAdmin(data: {
    email: string;
    is_active?: boolean;
    name: string;
    password: string;
    role_ids: number[];
  }): Promise<{ error?: string; id?: number; success: boolean }> {
    const cleanEmail = (data.email || '').toLowerCase().trim();
    const cleanName = (data.name || '').trim();

    if (!cleanName || cleanName.length < 2) {
      return { error: 'El nombre completo debe tener al menos 2 caracteres.', success: false };
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return { error: 'Ingresa un correo electrónico válido.', success: false };
    }
    if (!data.password || data.password.length < 8) {
      return { error: 'La contraseña debe contener al menos 8 caracteres.', success: false };
    }
    if (!Array.isArray(data.role_ids) || data.role_ids.length === 0) {
      return { error: 'Debes asignar al menos un rol al administrador.', success: false };
    }

    try {
      const [existing] = await pool.query<RowDataPacket[]>(
        'SELECT id FROM admin_users WHERE email = ?',
        [cleanEmail]
      );
      if (existing.length > 0) {
        return { error: 'Ya existe un administrador registrado con ese correo electrónico.', success: false };
      }

      const passwordHash = await hashPassword(data.password);
      const uuid = crypto.randomUUID();
      const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;

      const [insertResult] = await pool.query<ResultSetHeader>(
        `INSERT INTO admin_users (uuid, name, email, password_hash, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [uuid, cleanName, cleanEmail, passwordHash, isActive]
      );

      const newId = insertResult.insertId;

      for (const roleId of data.role_ids) {
        await pool.query(
          'INSERT IGNORE INTO admin_user_roles (admin_user_id, role_id) VALUES (?, ?)',
          [newId, Number(roleId)]
        );
      }

      logger.security.info('Nuevo administrador creado exitosamente', {
        adminId: newId,
        email: cleanEmail,
        rolesCount: data.role_ids.length,
      });

      return { id: newId, success: true };
    } catch (error) {
      logger.db.error('Error al insertar administrador', error);
      return { error: 'Error interno al registrar el administrador.', success: false };
    }
  }

  async updateAdmin(
    id: number,
    data: {
      email?: string;
      is_active?: boolean;
      name?: string;
      password?: string;
      role_ids?: number[];
    },
    currentAdminId: number
  ): Promise<{ error?: string; success: boolean }> {
    if (!id || id <= 0) {
      return { error: 'ID de administrador inválido.', success: false };
    }

    try {
      const [userRows] = await pool.query<RowDataPacket[]>(
        'SELECT id, email, is_active FROM admin_users WHERE id = ?',
        [id]
      );
      if (userRows.length === 0) {
        return { error: 'Administrador no encontrado.', success: false };
      }

      if (id === currentAdminId && data.is_active === false) {
        return { error: 'No puedes desactivar tu propia cuenta de administrador.', success: false };
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (data.name !== undefined) {
        const cleanName = data.name.trim();
        if (cleanName.length < 2) {
          return { error: 'El nombre debe contener al menos 2 caracteres.', success: false };
        }
        updates.push('name = ?');
        values.push(cleanName);
      }

      if (data.email !== undefined) {
        const cleanEmail = data.email.toLowerCase().trim();
        if (!cleanEmail.includes('@')) {
          return { error: 'Correo electrónico inválido.', success: false };
        }
        const [emailExists] = await pool.query<RowDataPacket[]>(
          'SELECT id FROM admin_users WHERE email = ? AND id != ?',
          [cleanEmail, id]
        );
        if (emailExists.length > 0) {
          return { error: 'Ese correo ya está registrado por otro administrador.', success: false };
        }
        updates.push('email = ?');
        values.push(cleanEmail);
      }

      if (data.is_active !== undefined) {
        updates.push('is_active = ?');
        values.push(data.is_active ? 1 : 0);
      }

      let passwordChanged = false;
      if (data.password && data.password.trim()) {
        if (data.password.length < 8) {
          return { error: 'La nueva contraseña debe tener al menos 8 caracteres.', success: false };
        }
        const hash = await hashPassword(data.password.trim());
        updates.push('password_hash = ?');
        values.push(hash);
        passwordChanged = true;
      }

      if (updates.length > 0) {
        updates.push('updated_at = NOW()');
        values.push(id);
        await pool.query(
          `UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`,
          values
        );
      }

      if (Array.isArray(data.role_ids)) {
        if (data.role_ids.length === 0) {
          return { error: 'Debes mantener al menos un rol asignado al usuario.', success: false };
        }
        await pool.query('DELETE FROM admin_user_roles WHERE admin_user_id = ?', [id]);
        for (const roleId of data.role_ids) {
          await pool.query(
            'INSERT IGNORE INTO admin_user_roles (admin_user_id, role_id) VALUES (?, ?)',
            [id, Number(roleId)]
          );
        }
      }

      if (data.is_active === false || passwordChanged) {
        await this.revokeAllSessionsForAdmin(id);
      } else {
        await this.syncRedisSessionsForAdmin(id);
      }

      logger.security.info('Administrador actualizado exitosamente', {
        adminId: id,
        passwordChanged,
        updatedBy: currentAdminId,
      });

      return { success: true };
    } catch (error) {
      logger.db.error('Error al actualizar administrador', error);
      return { error: 'Error interno al actualizar administrador.', success: false };
    }
  }

  async deleteAdmin(id: number, currentAdminId: number): Promise<{ error?: string; success: boolean }> {
    if (id === currentAdminId) {
      return { error: 'No puedes eliminar tu propia cuenta de administrador.', success: false };
    }
    if (id === 1) {
      return { error: 'No es posible eliminar el administrador raíz de la plataforma.', success: false };
    }

    try {
      await this.revokeAllSessionsForAdmin(id);
      await pool.query('DELETE FROM admin_user_roles WHERE admin_user_id = ?', [id]);
      const [res] = await pool.query<ResultSetHeader>('DELETE FROM admin_users WHERE id = ?', [id]);

      if (res.affectedRows === 0) {
        return { error: 'El administrador solicitado no existe.', success: false };
      }

      logger.security.warn('Administrador eliminado del sistema', {
        deletedId: id,
        deletedBy: currentAdminId,
      });

      return { success: true };
    } catch (error) {
      logger.db.error('Error al eliminar administrador', error);
      return { error: 'Error al procesar la eliminación del administrador.', success: false };
    }
  }

  async listRoles(): Promise<RoleDetailItem[]> {
    try {
      const [roles] = await pool.query<RowDataPacket[]>(
        `SELECT
           r.id,
           r.name,
           r.display_name,
           r.description,
           r.category,
           (SELECT COUNT(*) FROM admin_user_roles aur WHERE aur.role_id = r.id) AS user_count
         FROM roles r
         ORDER BY r.id ASC`
      );

      const [rolePerms] = await pool.query<RowDataPacket[]>(
        `SELECT rp.role_id, p.name AS perm_name
         FROM role_permissions rp
         INNER JOIN permissions p ON rp.permission_id = p.id
         ORDER BY p.id ASC`
      );

      const permsByRole = new Map<number, string[]>();
      for (const row of rolePerms) {
        const rid = Number(row.role_id);
        const list = permsByRole.get(rid) || [];
        list.push(String(row.perm_name));
        permsByRole.set(rid, list);
      }

      return roles.map((r) => {
        const rid = Number(r.id);
        const isSystem = ['SUPER_ADMIN', 'SECURITY_ADMIN', 'AUDITOR', 'OPERATIONS_MANAGER'].includes(String(r.name));
        return {
          category: String(r.category || 'platform'),
          description: String(r.description || ''),
          display_name: String(r.display_name || r.name),
          id: rid,
          is_system: isSystem,
          name: String(r.name),
          permissions: permsByRole.get(rid) || [],
          user_count: Number(r.user_count || 0),
        };
      });
    } catch (error) {
      logger.db.error('Error al consultar lista de roles', error);
      return [];
    }
  }

  async listPermissionsCatalogue() {
    return PLATFORM_PERMISSIONS;
  }

  async updateRolePermissions(
    roleId: number,
    permissionNames: string[],
    currentAdminId: number
  ): Promise<{ error?: string; success: boolean }> {
    try {
      const [roleRows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM roles WHERE id = ?', [roleId]);
      if (roleRows.length === 0) {
        return { error: 'Rol no encontrado.', success: false };
      }

      const roleName = String(roleRows[0].name);
      if (roleName === 'SUPER_ADMIN') {
        return { error: 'El rol Super Admin posee todos los permisos irrestrictos de forma permanente.', success: false };
      }

      const [allPerms] = await pool.query<RowDataPacket[]>('SELECT id, name FROM permissions');
      const permIdMap = new Map<string, number>();
      for (const p of allPerms) {
        permIdMap.set(String(p.name), Number(p.id));
      }

      await pool.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

      for (const pName of permissionNames) {
        const pid = permIdMap.get(pName);
        if (pid) {
          await pool.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, pid]);
        }
      }

      const [affectedUsers] = await pool.query<RowDataPacket[]>(
        'SELECT admin_user_id FROM admin_user_roles WHERE role_id = ?',
        [roleId]
      );
      for (const u of affectedUsers) {
        await this.syncRedisSessionsForAdmin(Number(u.admin_user_id));
      }

      logger.security.info('Permisos de rol actualizados', {
        adminId: currentAdminId,
        permissionsCount: permissionNames.length,
        roleId,
        roleName,
      });

      return { success: true };
    } catch (error) {
      logger.db.error('Error al actualizar permisos de rol', error);
      return { error: 'Error al actualizar permisos del rol.', success: false };
    }
  }

  async listActiveSessions(adminIdFilter?: number): Promise<ActiveSessionItem[]> {
    if (redis.status !== 'ready') return [];

    try {
      const keys = await redis.keys('admin:session:*');
      const sessions: ActiveSessionItem[] = [];

      for (const k of keys) {
        const token = k.replace('admin:session:', '');
        const raw = await redis.get(k);
        const ttl = await redis.ttl(k);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            const uid = Number(data.id);
            if (adminIdFilter && uid !== adminIdFilter) continue;

            sessions.push({
              createdAt: data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString(),
              email: String(data.email || ''),
              id: uid,
              ip: String(data.ip || 'Desconocida'),
              name: String(data.name || 'Administrador'),
              roles: Array.isArray(data.roles) ? data.roles : [],
              token,
              ttlSeconds: ttl > 0 ? ttl : 0,
              userAgent: String(data.userAgent || 'Navegador Web'),
            });
          } catch {}
        }
      }

      return sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (error) {
      logger.security.error('Error al consultar sesiones activas en Redis', error);
      return [];
    }
  }

  async revokeSession(token: string, revokedBy: number): Promise<{ error?: string; success: boolean }> {
    if (!token) {
      return { error: 'Token de sesión requerido.', success: false };
    }

    try {
      if (redis.status === 'ready') {
        await redis.del(`admin:session:${token}`);
      }

      logger.security.warn('Sesión de administrador revocada remotamente', {
        revokedBy,
        tokenPrefix: token.slice(0, 8),
      });

      return { success: true };
    } catch (error) {
      logger.security.error('Error al revocar sesión en Redis', error);
      return { error: 'Error al revocar la sesión solicitada.', success: false };
    }
  }

  async revokeAllSessionsForAdmin(adminId: number): Promise<void> {
    if (redis.status !== 'ready') return;
    try {
      const keys = await redis.keys('admin:session:*');
      for (const k of keys) {
        const raw = await redis.get(k);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (Number(data.id) === adminId) {
              await redis.del(k);
            }
          } catch {}
        }
      }
    } catch (err) {
      logger.security.error('Error al revocar todas las sesiones del usuario', { adminId, err });
    }
  }

  private async syncRedisSessionsForAdmin(adminId: number): Promise<void> {
    if (redis.status !== 'ready') return;
    try {
      const keys = await redis.keys('admin:session:*');
      const freshPerms = await getAdminEffectivePermissions(adminId);
      const freshRoles = await getAdminRoles(adminId);

      for (const k of keys) {
        const raw = await redis.get(k);
        if (raw) {
          try {
            const data = JSON.parse(raw);
            if (Number(data.id) === adminId) {
              data.permissions = freshPerms;
              data.roles = freshRoles;
              const ttl = await redis.ttl(k);
              await redis.set(k, JSON.stringify(data), 'EX', ttl > 0 ? ttl : 604800);
            }
          } catch {}
        }
      }
    } catch (err) {
      logger.security.error('Error al sincronizar permisos de sesiones en Redis', { adminId, err });
    }
  }
}

export const adminUsersService = new AdminUsersService();
