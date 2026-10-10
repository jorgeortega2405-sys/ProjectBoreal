import { requirePermission } from '../middlewares/auth.middleware.js';
import { createEmployee, createEmployeeEvent, createLeaveRequest, deleteEmployee, getAllEmployees, getAllLeaveRequests, getEmployeeDetail, getHrKpis, reviewLeaveRequest, updateEmployee, updateEmployeeStatus } from '../services/hr.service.js';
import { logger } from '../services/logger.service.js';
import { getSafeErrorMessage } from '../utils/error.util.js';
import { Request, Response, Router } from 'express';

const router = Router();

router.get(
  '/kpis',
  requirePermission('hr:read', 'hr:create', 'hr:manage'),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const kpis = await getHrKpis();
      res.status(200).json({
        data: kpis,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al obtener KPIs de Recursos Humanos en admin:', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/employees',
  requirePermission('hr:read', 'hr:create', 'hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const department = typeof req.query.department === 'string' ? req.query.department : undefined;
      const modality = typeof req.query.modality === 'string' ? req.query.modality : undefined;
      const employmentType =
        typeof req.query.employmentType === 'string' ? req.query.employmentType : undefined;

      const employees = await getAllEmployees({
        department,
        employmentType,
        modality,
        search,
        status,
      });

      res.status(200).json({
        data: employees,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al listar empleados en admin:', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.get(
  '/employees/:uuid',
  requirePermission('hr:read', 'hr:create', 'hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const detail = await getEmployeeDetail(uuid);
      if (!detail) {
        res.status(404).json({
          error: 'El expediente del colaborador solicitado no fue encontrado.',
          success: false,
        });
        return;
      }
      res.status(200).json({
        data: detail,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al obtener expediente del empleado en admin:', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.post(
  '/employees',
  requirePermission('hr:create', 'hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const actorName = req.adminUser?.name || 'Recursos Humanos';
      const created = await createEmployee(req.body || {}, actorName);
      logger.security.info('Nuevo colaborador contratado en Recursos Humanos', {
        adminEmail: req.adminUser?.email,
        adminId: req.adminUser?.id,
        department: created.department,
        employeeCode: created.employee_code,
        employeeUuid: created.uuid,
        position: created.position_title,
      });
      res.status(201).json({
        data: created,
        message: 'Colaborador contratado y dado de alta exitosamente.',
        success: true,
      });
    } catch (err: any) {
      logger.app.warn('Error de validación al contratar empleado en admin:', err);
      res.status(400).json({
        error: getSafeErrorMessage(err, 'No se pudo completar el alta del colaborador.'),
        success: false,
      });
    }
  }
);

router.put(
  '/employees/:uuid',
  requirePermission('hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const actorName = req.adminUser?.name || 'Recursos Humanos';
      const updated = await updateEmployee(uuid, req.body || {}, actorName);
      logger.security.info('Expediente de colaborador actualizado en Recursos Humanos', {
        adminEmail: req.adminUser?.email,
        adminId: req.adminUser?.id,
        employeeCode: updated.employee_code,
        employeeUuid: updated.uuid,
      });
      res.status(200).json({
        data: updated,
        message: 'Expediente del colaborador actualizado exitosamente.',
        success: true,
      });
    } catch (err: any) {
      logger.app.warn('Error al actualizar expediente del empleado en admin:', err);
      res.status(400).json({
        error: getSafeErrorMessage(err, 'No se pudo actualizar el expediente del colaborador.'),
        success: false,
      });
    }
  }
);

router.patch(
  '/employees/:uuid/status',
  requirePermission('hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const { reason, status } = req.body || {};
      const actorName = req.adminUser?.name || 'Recursos Humanos';
      const updated = await updateEmployeeStatus(uuid, status, reason || null, actorName);
      logger.security.info('Estatus laboral de colaborador modificado en Recursos Humanos', {
        adminEmail: req.adminUser?.email,
        adminId: req.adminUser?.id,
        employeeCode: updated.employee_code,
        employeeUuid: updated.uuid,
        newStatus: updated.status,
      });
      res.status(200).json({
        data: updated,
        message: 'Estatus laboral actualizado correctamente.',
        success: true,
      });
    } catch (err: any) {
      logger.app.warn('Error al cambiar estatus laboral en admin:', err);
      res.status(400).json({
        error: getSafeErrorMessage(err, 'No se pudo modificar el estatus laboral.'),
        success: false,
      });
    }
  }
);

router.delete(
  '/employees/:uuid',
  requirePermission('hr:delete'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      await deleteEmployee(uuid);
      logger.security.info('Expediente de colaborador eliminado en Recursos Humanos', {
        adminEmail: req.adminUser?.email,
        adminId: req.adminUser?.id,
        employeeUuid: uuid,
      });
      res.status(200).json({
        message: 'Expediente del colaborador eliminado permanentemente.',
        success: true,
      });
    } catch (err: any) {
      logger.app.warn('Error al eliminar colaborador en admin:', err);
      res.status(400).json({
        error: getSafeErrorMessage(err, 'No se pudo eliminar el expediente del colaborador.'),
        success: false,
      });
    }
  }
);

router.post(
  '/employees/:uuid/events',
  requirePermission('hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const actorName = req.adminUser?.name || 'Recursos Humanos';
      const eventRecord = await createEmployeeEvent(uuid, req.body || {}, actorName);
      logger.security.info('Movimiento registrado en kárdex de colaborador', {
        adminEmail: req.adminUser?.email,
        adminId: req.adminUser?.id,
        employeeUuid: uuid,
        eventType: eventRecord.event_type,
      });
      res.status(201).json({
        data: eventRecord,
        message: 'Registro agregado al historial laboral exitosamente.',
        success: true,
      });
    } catch (err: any) {
      logger.app.warn('Error al registrar evento en kárdex de empleado:', err);
      res.status(400).json({
        error: getSafeErrorMessage(err, 'No se pudo registrar el movimiento en el expediente.'),
        success: false,
      });
    }
  }
);

router.get(
  '/leaves',
  requirePermission('hr:read', 'hr:create', 'hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const leaveType = typeof req.query.leaveType === 'string' ? req.query.leaveType : undefined;
      const employeeUuid =
        typeof req.query.employeeUuid === 'string' ? req.query.employeeUuid : undefined;

      const leaves = await getAllLeaveRequests({
        employeeUuid,
        leaveType,
        search,
        status,
      });

      res.status(200).json({
        data: leaves,
        success: true,
      });
    } catch (err) {
      logger.app.error('Error al listar solicitudes de vacaciones en admin:', err);
      res.status(500).json({
        error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
        success: false,
      });
    }
  }
);

router.post(
  '/leaves',
  requirePermission('hr:create', 'hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const actorName = req.adminUser?.name || 'Recursos Humanos';
      const canManage =
        req.adminUser?.permissions.includes('*') ||
        req.adminUser?.permissions.includes('hr:manage');
      const payload = {
        ...(req.body || {}),
        auto_approve: Boolean(req.body?.auto_approve && canManage),
      };
      const created = await createLeaveRequest(payload, actorName);
      logger.security.info('Solicitud de vacaciones o permiso registrada en RRHH', {
        adminEmail: req.adminUser?.email,
        adminId: req.adminUser?.id,
        daysCount: created.days_count,
        employeeCode: created.employee_code,
        leaveType: created.leave_type,
        leaveUuid: created.uuid,
        status: created.status,
      });
      res.status(201).json({
        data: created,
        message:
          created.status === 'approved'
            ? 'Periodo de vacaciones o permiso registrado y aprobado exitosamente.'
            : 'Solicitud de vacaciones o permiso registrada exitosamente.',
        success: true,
      });
    } catch (err: any) {
      logger.app.warn('Error al registrar solicitud de vacaciones en admin:', err);
      res.status(400).json({
        error: getSafeErrorMessage(err, 'No se pudo registrar la solicitud de vacaciones o permiso.'),
        success: false,
      });
    }
  }
);

router.patch(
  '/leaves/:uuid/review',
  requirePermission('hr:manage'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { uuid } = req.params;
      const { action, review_notes } = req.body || {};
      if (!['approve', 'cancel', 'reject'].includes(action)) {
        res.status(400).json({
          error: 'La acción solicitada sobre el permiso no es válida.',
          success: false,
        });
        return;
      }

      const actorName = req.adminUser?.name || 'Recursos Humanos';
      const updated = await reviewLeaveRequest(uuid, action, review_notes || null, actorName);
      logger.security.info('Dictamen de vacaciones o permiso procesado en RRHH', {
        action,
        adminEmail: req.adminUser?.email,
        adminId: req.adminUser?.id,
        employeeCode: updated.employee_code,
        leaveUuid: updated.uuid,
        newStatus: updated.status,
      });

      const msgMap: Record<string, string> = {
        approve: 'Solicitud aprobada y días descontados del saldo vacacional.',
        cancel: 'Solicitud cancelada y saldo vacacional restituido.',
        reject: 'Solicitud rechazada.',
      };

      res.status(200).json({
        data: updated,
        message: msgMap[action] || 'Solicitud procesada exitosamente.',
        success: true,
      });
    } catch (err: any) {
      logger.app.warn('Error al dictaminar solicitud de vacaciones en admin:', err);
      res.status(400).json({
        error: getSafeErrorMessage(err, 'No se pudo procesar el dictamen de la solicitud.'),
        success: false,
      });
    }
  }
);

export default router;
