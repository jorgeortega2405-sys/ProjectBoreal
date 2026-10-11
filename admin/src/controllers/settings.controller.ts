import { logger } from '../services/logger.service.js';
import { settingsService } from '../services/settings.service.js';
import { Request, Response } from 'express';

export async function getSettingsHandler(_req: Request, res: Response): Promise<void> {
  try {
    const settings = await settingsService.getSystemSettings();
    res.status(200).json({
      data: { settings },
      success: true,
    });
  } catch (error) {
    logger.app.error('Error al consultar configuraciones del sistema', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.',
      success: false,
    });
  }
}

export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({
        error: 'Debes proporcionar un objeto válido con las configuraciones a actualizar.',
        success: false,
      });
      return;
    }

    const adminUuid = (req as any).adminUser?.uuid || 'unknown';
    const updated = await settingsService.updateSystemSettings(settings, adminUuid);

    res.status(200).json({
      data: { settings: updated },
      message: 'Configuraciones actualizadas exitosamente.',
      success: true,
    });
  } catch (error: any) {
    logger.app.error('Error al actualizar configuraciones del sistema', error);
    const message = error && error.message && !error.message.includes('SQL')
      ? error.message
      : 'Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde.';
    res.status(400).json({
      error: message,
      success: false,
    });
  }
}
