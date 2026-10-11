import { pool } from '../config/database.config.js';
import { PermissionDefinition } from '../types/auth.types.js';
import { logger } from './logger.service.js';
import type { RowDataPacket } from 'mysql2';

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
  { description: 'Consultar plantilla de empleados, expediente laboral, KPIs de talento, nómina y calendario de vacaciones.', display_name: 'Ver Recursos Humanos', module: 'hr', name: 'hr:read' },
  { description: 'Registrar nuevas contrataciones, altas de personal y asignar condiciones laborales.', display_name: 'Contratar Empleados', module: 'hr', name: 'hr:create' },
  { description: 'Editar expedientes, aprobar o rechazar vacaciones y permisos, ajustar compensación, registrar promociones y bajas.', display_name: 'Gestionar Personal y Vacaciones', module: 'hr', name: 'hr:manage' },
  { description: 'Eliminar expedientes o solicitudes registradas por error en Recursos Humanos.', display_name: 'Eliminar Registros de RRHH', module: 'hr', name: 'hr:delete' },
  { description: 'Consultar catálogo de respaldos en S3 (MinIO), manifiestos, integridad SHA-256, estado de motores e historial de restauraciones.', display_name: 'Ver Copias de Seguridad', module: 'backups', name: 'backups:read' },
  { description: 'Generar respaldos completos o selectivos de MySQL, Cassandra, S3 (MinIO) y Redis hacia almacenamiento S3.', display_name: 'Crear Copias de Seguridad', module: 'backups', name: 'backups:create' },
  { description: 'Ejecutar restauraciones selectivas o completas de bases de datos (MySQL, Cassandra), objetos S3 (MinIO) y estado Redis.', display_name: 'Restaurar Copias de Seguridad', module: 'backups', name: 'backups:restore' },
  { description: 'Fijar/proteger respaldos, sincronizar catálogo con S3 (MinIO), verificar integridad y configurar programación automática.', display_name: 'Gestionar Política y Retención de Respaldos', module: 'backups', name: 'backups:manage' },
  { description: 'Eliminar archivos de respaldo almacenados en S3 (MinIO) no protegidos.', display_name: 'Eliminar Copias de Seguridad', module: 'backups', name: 'backups:delete' },
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

