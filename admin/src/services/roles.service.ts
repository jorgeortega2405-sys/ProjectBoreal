import { pool } from '../config/database.config.js';
import { AdminRole, AdminUserWithRoles, PermissionDefinition, RoleCategory, RoleMatrixItem, RoleRecord } from '../types/auth.types.js';
import { logger } from './logger.service.js';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export const PLATFORM_PERMISSIONS: readonly PermissionDefinition[] = [
  { description: 'Acceso al panel principal, KPIs financieros, gráficos y estado de pasarelas SPEI.', display_name: 'Ver Dashboard', module: 'dashboard', name: 'dashboard:read' },
  { description: 'Consultar catálogo de sorteos, progreso de boletos y configuración del ciclo diario.', display_name: 'Ver Sorteos', module: 'giveaways', name: 'giveaways:read' },
  { description: 'Crear nuevos sorteos, duplicar sorteos existentes y subir imágenes de premios.', display_name: 'Crear Sorteos', module: 'giveaways', name: 'giveaways:create' },
  { description: 'Editar sorteos, pausar/reanudar/cancelar ventas y configurar el ciclo diario.', display_name: 'Gestionar Sorteos', module: 'giveaways', name: 'giveaways:manage' },
  { description: 'Ejecutar manualmente la selección de boleto ganador de un sorteo.', display_name: 'Ejecutar Sorteos', module: 'giveaways', name: 'giveaways:draw' },
  { description: 'Eliminar borradores de sorteos sin ventas activas.', display_name: 'Eliminar Sorteos', module: 'giveaways', name: 'giveaways:delete' },
  { description: 'Consultar órdenes, KPIs de pagos, expediente SPEI/Banxico y comprobantes.', display_name: 'Ver Pagos y Órdenes', module: 'orders', name: 'orders:read' },
  { description: 'Aprobar manualmente comprobantes de pago y liquidar boletos.', display_name: 'Aprobar Pagos', module: 'orders', name: 'orders:approve' },
  { description: 'Rechazar comprobantes inválidos y liberar boletos apartados.', display_name: 'Rechazar Pagos', module: 'orders', name: 'orders:reject' },
  { description: 'Modificar clave de rastreo SPEI y reprogramar validación automática en Banxico.', display_name: 'Gestionar Rastreo SPEI', module: 'orders', name: 'orders:manage' },
  { description: 'Consultar cuentas CLABE y tarjetas receptoras y su cobertura en sorteos.', display_name: 'Ver Cuentas Bancarias', module: 'bank_accounts', name: 'bank_accounts:read' },
  { description: 'Registrar, editar, activar/pausar cuentas bancarias y asignarlas a sorteos.', display_name: 'Gestionar Cuentas Bancarias', module: 'bank_accounts', name: 'bank_accounts:manage' },
  { description: 'Eliminar cuentas bancarias del catálogo.', display_name: 'Eliminar Cuentas Bancarias', module: 'bank_accounts', name: 'bank_accounts:delete' },
  { description: 'Consultar directorio de participantes, KPIs e historial de órdenes por teléfono.', display_name: 'Ver Clientes', module: 'customers', name: 'customers:read' },
  { description: 'Agregar o retirar números telefónicos de la lista negra antifraude.', display_name: 'Sancionar Clientes', module: 'customers', name: 'customers:block' },
  { description: 'Consultar padrón de ganadores, KPIs de premios y evidencias de entrega.', display_name: 'Ver Ganadores', module: 'winners', name: 'winners:read' },
  { description: 'Actualizar estado de entrega, notas de contacto, testimonio y evidencias.', display_name: 'Gestionar Entregas de Premios', module: 'winners', name: 'winners:manage' },
  { description: 'Consultar catálogo de roles, permisos y matriz de control de acceso PBAC.', display_name: 'Ver Roles y Permisos', module: 'roles', name: 'roles:read' },
  { description: 'Configurar permisos asignados a cada rol y administrar roles de cuentas admin.', display_name: 'Gestionar Roles y Permisos', module: 'roles', name: 'roles:manage' },
];

export async function getAdminRoles(adminUserId: number): Promise<string[]> {
  if (!adminUserId || adminUserId <= 0) return [];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT r.name
       FROM admin_user_roles aur
       INNER JOIN roles r ON aur.role_id = r.id
       WHERE aur.admin_user_id = ?
       ORDER BY r.id ASC`,
      [adminUserId]
    );
    return rows.map((row) => String(row.name));
  } catch (error) {
    logger.db.error('Error al consultar roles del administrador', { adminUserId, error });
    return [];
  }
}

export async function getAdminEffectivePermissions(adminUserId: number): Promise<string[]> {
  if (!adminUserId || adminUserId <= 0) return [];
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT p.id, p.name
       FROM admin_user_roles aur
       INNER JOIN role_permissions rp ON aur.role_id = rp.role_id
       INNER JOIN permissions p ON rp.permission_id = p.id
       WHERE aur.admin_user_id = ?
       ORDER BY p.id ASC`,
      [adminUserId]
    );
    return rows.map((row) => String(row.name));
  } catch (error) {
    logger.db.error('Error al consultar permisos efectivos del administrador', { adminUserId, error });
    return [];
  }
}

export async function getAllRoles(): Promise<RoleRecord[]> {
  try {
    const [rows] = await pool.query<RoleRecord[]>(
      `SELECT id, name, display_name, description, category, created_at, updated_at
       FROM roles
       ORDER BY FIELD(category, 'platform', 'finance', 'operations', 'support', 'data', 'engineering'), id ASC`
    );
    return rows;
  } catch (error) {
    logger.db.error('Error al listar todos los roles en Admin', error);
    throw error;
  }
}

export async function getAllPermissions(): Promise<PermissionDefinition[]> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, name, display_name, description, module
       FROM permissions
       ORDER BY id ASC`
    );
    if (rows.length === 0) {
      return [...PLATFORM_PERMISSIONS];
    }
    return rows.map((row) => ({
      description: String(row.description || ''),
      display_name: String(row.display_name || row.name),
      id: Number(row.id),
      module: String(row.module || 'general'),
      name: String(row.name),
    }));
  } catch (error) {
    logger.db.error('Error al listar catálogo de permisos en Admin', error);
    return [...PLATFORM_PERMISSIONS];
  }
}

export async function getRolesMatrix(): Promise<RoleMatrixItem[]> {
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
       ORDER BY FIELD(r.category, 'platform', 'finance', 'operations', 'support', 'data', 'engineering'), r.id ASC`
    );

    const [rolePerms] = await pool.query<RowDataPacket[]>(
      `SELECT rp.role_id, p.name AS permission_name
       FROM role_permissions rp
       INNER JOIN permissions p ON rp.permission_id = p.id
       ORDER BY p.id ASC`
    );

    const permsByRoleId = new Map<number, string[]>();
    for (const row of rolePerms) {
      const roleId = Number(row.role_id);
      const list = permsByRoleId.get(roleId) || [];
      list.push(String(row.permission_name));
      permsByRoleId.set(roleId, list);
    }

    return roles.map((r) => {
      const roleId = Number(r.id);
      return {
        category: (r.category || 'operations') as RoleCategory,
        description: String(r.description || ''),
        display_name: String(r.display_name || r.name),
        id: roleId,
        name: r.name as AdminRole,
        permissions: permsByRoleId.get(roleId) || [],
        user_count: Number(r.user_count || 0),
      };
    });
  } catch (error) {
    logger.db.error('Error al obtener matriz de roles y permisos en Admin', error);
    throw error;
  }
}

export async function updateRolePermissions(
  roleName: string,
  permissionNames: string[]
): Promise<RoleMatrixItem> {
  const normalizedRole = (roleName || '').trim().toUpperCase();
  if (!normalizedRole) {
    throw new Error('El identificador del rol es obligatorio.');
  }

  const cleanPerms = Array.from(
    new Set(
      (Array.isArray(permissionNames) ? permissionNames : [])
        .map((p) => String(p).trim())
        .filter(Boolean)
    )
  );

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [roleRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, name, display_name, description, category FROM roles WHERE name = ? LIMIT 1 FOR UPDATE',
      [normalizedRole]
    );

    if (roleRows.length === 0) {
      throw new Error('El rol especificado no existe.');
    }

    const role = roleRows[0];
    const roleId = Number(role.id);

    if (!cleanPerms.includes('roles:manage')) {
      const [otherManageRoles] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT aur.admin_user_id) AS other_admins
         FROM admin_user_roles aur
         INNER JOIN admin_users au ON aur.admin_user_id = au.id AND au.is_active = 1
         INNER JOIN role_permissions rp ON aur.role_id = rp.role_id
         INNER JOIN permissions p ON rp.permission_id = p.id
         WHERE p.name = 'roles:manage' AND aur.role_id != ?`,
        [roleId]
      );
      const otherCount = Number(otherManageRoles[0]?.other_admins || 0);
      if (otherCount === 0) {
        const [currentHasManage] = await conn.query<RowDataPacket[]>(
          `SELECT 1
           FROM role_permissions rp
           INNER JOIN permissions p ON rp.permission_id = p.id
           INNER JOIN admin_user_roles aur ON aur.role_id = rp.role_id
           WHERE rp.role_id = ? AND p.name = 'roles:manage'
           LIMIT 1`,
          [roleId]
        );
        if (currentHasManage.length > 0) {
          throw new Error('No puedes retirar el permiso de gestionar roles (roles:manage) del único rol con administradores activos que lo posee.');
        }
      }
    }

    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);

    if (cleanPerms.length > 0) {
      const [permRows] = await conn.query<RowDataPacket[]>(
        'SELECT id, name FROM permissions WHERE name IN (?)',
        [cleanPerms]
      );

      for (const permRow of permRows) {
        await conn.query<ResultSetHeader>(
          'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
          [roleId, Number(permRow.id)]
        );
      }
    }

    const [countRows] = await conn.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS user_count FROM admin_user_roles WHERE role_id = ?',
      [roleId]
    );

    const [updatedPermRows] = await conn.query<RowDataPacket[]>(
      `SELECT p.name
       FROM role_permissions rp
       INNER JOIN permissions p ON rp.permission_id = p.id
       WHERE rp.role_id = ?
       ORDER BY p.id ASC`,
      [roleId]
    );

    await conn.commit();

    logger.security.info('Permisos de rol actualizados en Admin', {
      permissionsCount: updatedPermRows.length,
      roleName: normalizedRole,
    });

    return {
      category: (role.category || 'operations') as RoleCategory,
      description: String(role.description || ''),
      display_name: String(role.display_name || role.name),
      id: roleId,
      name: role.name as AdminRole,
      permissions: updatedPermRows.map((p) => String(p.name)),
      user_count: Number(countRows[0]?.user_count || 0),
    };
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al actualizar permisos de rol en Admin', { error, roleName: normalizedRole });
    throw error;
  } finally {
    conn.release();
  }
}

export async function getAdminUsersWithRoles(): Promise<AdminUserWithRoles[]> {
  try {
    const [admins] = await pool.query<RowDataPacket[]>(
      `SELECT id, uuid, name, email, is_active, last_login_at, created_at
       FROM admin_users
       ORDER BY id ASC`
    );

    const [userRoles] = await pool.query<RowDataPacket[]>(
      `SELECT aur.admin_user_id, r.name AS role_name
       FROM admin_user_roles aur
       INNER JOIN roles r ON aur.role_id = r.id
       ORDER BY r.id ASC`
    );

    const [userPerms] = await pool.query<RowDataPacket[]>(
      `SELECT DISTINCT aur.admin_user_id, p.id AS permission_id, p.name AS permission_name
       FROM admin_user_roles aur
       INNER JOIN role_permissions rp ON aur.role_id = rp.role_id
       INNER JOIN permissions p ON rp.permission_id = p.id
       ORDER BY p.id ASC`
    );

    const rolesMap = new Map<number, string[]>();
    for (const row of userRoles) {
      const uid = Number(row.admin_user_id);
      const list = rolesMap.get(uid) || [];
      list.push(String(row.role_name));
      rolesMap.set(uid, list);
    }

    const permsMap = new Map<number, string[]>();
    for (const row of userPerms) {
      const uid = Number(row.admin_user_id);
      const list = permsMap.get(uid) || [];
      list.push(String(row.permission_name));
      permsMap.set(uid, list);
    }

    return admins.map((a) => {
      const uid = Number(a.id);
      return {
        created_at: a.created_at,
        email: String(a.email),
        id: uid,
        is_active: Number(a.is_active),
        last_login_at: a.last_login_at || null,
        name: String(a.name),
        permissions: permsMap.get(uid) || [],
        roles: rolesMap.get(uid) || [],
        uuid: String(a.uuid),
      };
    });
  } catch (error) {
    logger.db.error('Error al consultar administradores y sus roles en Admin', error);
    throw error;
  }
}

export async function updateAdminUserRoles(
  adminUuid: string,
  roleNames: string[],
  assignedById?: number
): Promise<AdminUserWithRoles> {
  const cleanUuid = (adminUuid || '').trim();
  if (!cleanUuid) {
    throw new Error('El identificador del administrador es obligatorio.');
  }

  const cleanRoles = Array.from(
    new Set(
      (Array.isArray(roleNames) ? roleNames : [])
        .map((r) => String(r).trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [adminRows] = await conn.query<RowDataPacket[]>(
      'SELECT id, uuid, name, email, is_active, last_login_at, created_at FROM admin_users WHERE uuid = ? LIMIT 1 FOR UPDATE',
      [cleanUuid]
    );

    if (adminRows.length === 0) {
      throw new Error('La cuenta de administrador solicitada no fue encontrada.');
    }

    const admin = adminRows[0];
    const adminId = Number(admin.id);

    let roleIds: number[] = [];
    if (cleanRoles.length > 0) {
      const [foundRoles] = await conn.query<RowDataPacket[]>(
        'SELECT id, name FROM roles WHERE name IN (?)',
        [cleanRoles]
      );
      roleIds = foundRoles.map((r) => Number(r.id));
    }

    let targetWillHaveManage = false;
    if (roleIds.length > 0) {
      const [manageCheck] = await conn.query<RowDataPacket[]>(
        `SELECT 1
         FROM role_permissions rp
         INNER JOIN permissions p ON rp.permission_id = p.id
         WHERE rp.role_id IN (?) AND p.name = 'roles:manage'
         LIMIT 1`,
        [roleIds]
      );
      targetWillHaveManage = manageCheck.length > 0;
    }

    if (!targetWillHaveManage) {
      const [otherAdminsWithManage] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(DISTINCT aur.admin_user_id) AS other_admins
         FROM admin_user_roles aur
         INNER JOIN admin_users au ON aur.admin_user_id = au.id AND au.is_active = 1
         INNER JOIN role_permissions rp ON aur.role_id = rp.role_id
         INNER JOIN permissions p ON rp.permission_id = p.id
         WHERE p.name = 'roles:manage' AND aur.admin_user_id != ?`,
        [adminId]
      );
      const otherCount = Number(otherAdminsWithManage[0]?.other_admins || 0);
      if (otherCount === 0) {
        throw new Error('Debe existir al menos un administrador activo con un rol que otorgue el permiso de gestionar roles (roles:manage).');
      }
    }

    await conn.query('DELETE FROM admin_user_roles WHERE admin_user_id = ?', [adminId]);

    for (const rId of roleIds) {
      await conn.query<ResultSetHeader>(
        'INSERT IGNORE INTO admin_user_roles (admin_user_id, role_id, assigned_by) VALUES (?, ?, ?)',
        [adminId, rId, assignedById || null]
      );
    }

    const [updatedRoleRows] = await conn.query<RowDataPacket[]>(
      `SELECT r.name
       FROM admin_user_roles aur
       INNER JOIN roles r ON aur.role_id = r.id
       WHERE aur.admin_user_id = ?
       ORDER BY r.id ASC`,
      [adminId]
    );

    const [updatedPermRows] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT p.id, p.name
       FROM admin_user_roles aur
       INNER JOIN role_permissions rp ON aur.role_id = rp.role_id
       INNER JOIN permissions p ON rp.permission_id = p.id
       WHERE aur.admin_user_id = ?
       ORDER BY p.id ASC`,
      [adminId]
    );

    await conn.commit();

    logger.security.info('Roles de cuenta administrativa actualizados', {
      adminId,
      adminUuid: cleanUuid,
      assignedById: assignedById || null,
      roles: updatedRoleRows.map((r) => String(r.name)),
    });

    return {
      created_at: admin.created_at,
      email: String(admin.email),
      id: adminId,
      is_active: Number(admin.is_active),
      last_login_at: admin.last_login_at || null,
      name: String(admin.name),
      permissions: updatedPermRows.map((p) => String(p.name)),
      roles: updatedRoleRows.map((r) => String(r.name)),
      uuid: String(admin.uuid),
    };
  } catch (error) {
    await conn.rollback();
    logger.db.error('Error al actualizar roles de cuenta administrativa', { adminUuid: cleanUuid, error });
    throw error;
  } finally {
    conn.release();
  }
}
