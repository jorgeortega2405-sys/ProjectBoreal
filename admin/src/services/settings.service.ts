import { pool } from '../config/database.config.js';
import { redis } from '../config/redis.config.js';
import { logger } from './logger.service.js';
import { RowDataPacket } from 'mysql2/promise';

export interface SystemSettingItem {
  description: string | null;
  key: string;
  updated_at: string;
  value: string;
}

export class SettingsService {
  async getSystemSettings(): Promise<SystemSettingItem[]> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT setting_key, setting_value, description, updated_at
       FROM system_settings
       ORDER BY setting_key ASC`
    );

    return rows.map((r) => ({
      description: r.description ? String(r.description) : null,
      key: String(r.setting_key),
      updated_at: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at || ''),
      value: String(r.setting_value),
    }));
  }

  async updateSystemSettings(updates: Record<string, string>, adminUuid: string): Promise<SystemSettingItem[]> {
    const allowedKeys = [
      'active_payment_gateways',
      'admin_alert_emails',
      'daily_giveaway_paused_next',
      'daily_giveaway_pot_percentage',
      'daily_giveaway_ticket_price',
      'daily_giveaway_total_tickets',
      'order_reservation_timeout_minutes',
      'support_whatsapp_phone',
    ];

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const [key, rawVal] of Object.entries(updates)) {
        if (!allowedKeys.includes(key)) continue;

        let val = String(rawVal).trim();

        if (key === 'daily_giveaway_paused_next') {
          val = val === '1' || val === 'true' ? '1' : '0';
        } else if (key === 'daily_giveaway_pot_percentage') {
          const num = Number(val);
          if (isNaN(num) || num < 1 || num > 100) {
            throw new Error('El porcentaje de la bolsa acumulada debe ser un número entre 1 y 100.');
          }
          val = String(Math.round(num));
        } else if (key === 'daily_giveaway_ticket_price') {
          const num = Number(val);
          if (isNaN(num) || num <= 0) {
            throw new Error('El precio por boleto debe ser mayor a cero.');
          }
          val = String(num);
        } else if (key === 'daily_giveaway_total_tickets') {
          const num = Math.floor(Number(val));
          if (isNaN(num) || num < 100 || num > 1000000) {
            throw new Error('La emisión de boletos debe ser un número entero entre 100 y 1,000,000.');
          }
          val = String(num);
        } else if (key === 'order_reservation_timeout_minutes') {
          const num = Math.floor(Number(val));
          if (isNaN(num) || num < 1 || num > 1440) {
            throw new Error('El tiempo de tolerancia para reservas debe ser entre 1 y 1440 minutos.');
          }
          val = String(num);
        } else if (key === 'support_whatsapp_phone') {
          val = val.slice(0, 30);
        } else if (key === 'admin_alert_emails') {
          val = val.slice(0, 255);
        } else if (key === 'active_payment_gateways') {
          val = val.slice(0, 255);
        }

        await conn.query(
          `INSERT INTO system_settings (setting_key, setting_value, updated_at)
           VALUES (?, ?, NOW())
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = NOW()`,
          [key, val]
        );
      }

      await conn.commit();

      try {
        await redis.del(
          'boreal:settings:daily_giveaway_paused_next',
          'boreal:settings:daily_giveaway_pot_percentage',
          'boreal:settings:daily_giveaway_ticket_price',
          'boreal:settings:daily_giveaway_total_tickets',
          'boreal:settings:order_reservation_timeout_minutes'
        );
      } catch (cacheErr) {
        logger.app.warn('Advertencia al invalidar caché Redis de settings:', cacheErr);
      }

      logger.app.info(`Configuraciones del sistema actualizadas por administrador ${adminUuid}`);
      return await this.getSystemSettings();
    } catch (error) {
      await conn.rollback();
      logger.db.error('Error al actualizar configuraciones del sistema', error);
      throw error;
    } finally {
      conn.release();
    }
  }
}

export const settingsService = new SettingsService();
