import { requireAuth, requirePermission } from '../middlewares/auth.middleware.js';
import { adminUsersService } from '../services/admin-users.service.js';
import { logger } from '../services/logger.service.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.use(requireAuth);

router.get('/', requirePermission('admins:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;

    const [admins, kpis] = await Promise.all([
      adminUsersService.listAdmins(search, role, status),
      adminUsersService.getSecurityKpis(),
    ]);

    res.status(200).json({
      data: {
        admins,
        kpis,
      },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al obtener lista de administradores', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.post('/', requirePermission('admins:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, is_active, name, password, role_ids } = req.body || {};
    const result = await adminUsersService.createAdmin({
      email,
      is_active,
      name,
      password,
      role_ids,
    });

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'No se pudo crear el administrador.',
        success: false,
      });
      return;
    }

    res.status(201).json({
      data: { id: result.id },
      message: 'Administrador creado exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al crear administrador', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.put('/:id', requirePermission('admins:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const currentAdminId = req.adminUser?.id || 0;
    const { email, is_active, name, password, role_ids } = req.body || {};

    const result = await adminUsersService.updateAdmin(
      id,
      { email, is_active, name, password, role_ids },
      currentAdminId
    );

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'No se pudo actualizar el administrador.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      message: 'Administrador actualizado exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al actualizar administrador', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.delete('/:id', requirePermission('admins:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const currentAdminId = req.adminUser?.id || 0;

    const result = await adminUsersService.deleteAdmin(id, currentAdminId);

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'No se pudo eliminar el administrador.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      message: 'Administrador eliminado exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al eliminar administrador', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/roles', requirePermission('admins:read'), async (_req: Request, res: Response): Promise<void> => {
  try {
    const [roles, catalogue] = await Promise.all([
      adminUsersService.listRoles(),
      adminUsersService.listPermissionsCatalogue(),
    ]);

    res.status(200).json({
      data: {
        catalogue,
        roles,
      },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al listar roles y catálogo PBAC', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.put('/roles/:id', requirePermission('admins:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10);
    const currentAdminId = req.adminUser?.id || 0;
    const { permissions } = req.body || {};

    if (!Array.isArray(permissions)) {
      res.status(400).json({
        error: 'El campo permissions debe ser un arreglo de strings.',
        success: false,
      });
      return;
    }

    const result = await adminUsersService.updateRolePermissions(id, permissions, currentAdminId);

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'No se pudo actualizar los permisos del rol.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      message: 'Permisos del rol actualizados exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al actualizar permisos de rol', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.get('/sessions', requirePermission('admins:read'), async (req: Request, res: Response): Promise<void> => {
  try {
    const adminId = typeof req.query.adminId === 'string' ? parseInt(req.query.adminId, 10) : undefined;
    const sessions = await adminUsersService.listActiveSessions(adminId);

    res.status(200).json({
      data: { sessions },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al consultar sesiones activas', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

router.delete('/sessions/:token', requirePermission('admins:manage'), async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.params.token;
    const currentAdminId = req.adminUser?.id || 0;

    const result = await adminUsersService.revokeSession(token, currentAdminId);

    if (!result.success) {
      res.status(400).json({
        error: result.error || 'No se pudo revocar la sesión.',
        success: false,
      });
      return;
    }

    res.status(200).json({
      message: 'Sesión revocada exitosamente.',
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al revocar sesión en Redis', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
});

export default router;
