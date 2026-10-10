import { requirePermission } from '../middlewares/auth.middleware.js';
import { logger } from '../services/logger.service.js';
import { getAdminUsersWithRoles, getAllPermissions, getAllRoles, getRolesMatrix, updateAdminUserRoles, updateRolePermissions } from '../services/roles.service.js';
import { getSafeErrorMessage } from '../utils/error.util.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/all', requirePermission('roles:read', 'roles:manage'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const roles = await getAllRoles();
    res.status(200).json({
      data: roles,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar catálogo de roles en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/permissions', requirePermission('roles:read', 'roles:manage'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const permissions = await getAllPermissions();
    res.status(200).json({
      data: permissions,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al listar catálogo de permisos en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/matrix', requirePermission('roles:read', 'roles:manage'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const [matrix, permissions] = await Promise.all([
      getRolesMatrix(),
      getAllPermissions(),
    ]);
    res.status(200).json({
      data: matrix,
      permissions,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener matriz de roles y permisos en admin:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.put('/:roleName/permissions', requirePermission('roles:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { roleName } = req.params;
    const { permissions } = req.body || {};
    if (!Array.isArray(permissions)) {
      res.status(400).json({
        error: 'La lista de permisos enviada no es válida.',
        success: false,
      });
      return;
    }

    const updated = await updateRolePermissions(roleName, permissions);
    res.status(200).json({
      data: updated,
      message: 'Permisos del rol actualizados exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Validación o error al actualizar permisos de rol en admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'No se pudieron actualizar los permisos del rol.'),
      success: false,
    });
  }
});

router.get('/admins', requirePermission('roles:read', 'roles:manage'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const admins = await getAdminUsersWithRoles();
    res.status(200).json({
      data: admins,
      success: true,
    });
  } catch (err) {
    logger.app.error('Error al obtener lista de administradores y sus roles:', err);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.put('/admins/:uuid/roles', requirePermission('roles:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { uuid } = req.params;
    const { roles } = req.body || {};
    if (!Array.isArray(roles)) {
      res.status(400).json({
        error: 'La lista de roles enviada no es válida.',
        success: false,
      });
      return;
    }

    const updated = await updateAdminUserRoles(uuid, roles, req.adminUser?.id);
    res.status(200).json({
      data: updated,
      message: 'Roles de la cuenta administrativa actualizados exitosamente.',
      success: true,
    });
  } catch (err: any) {
    logger.app.warn('Validación o error al actualizar roles de cuenta admin:', err);
    res.status(400).json({
      error: getSafeErrorMessage(err, 'No se pudieron actualizar los roles de la cuenta administrativa.'),
      success: false,
    });
  }
});

export default router;
