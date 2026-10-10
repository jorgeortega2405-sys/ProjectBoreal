-- ============================================================================
-- Project Boreal - Lottery Core Database Schema (MySQL)
-- Archivo: database/db_lottery.sql
-- Dominio: Catálogo de Sorteos, Boletos, Órdenes, Cuentas Bancarias y Pasarela SPEI
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `db_lottery`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `db_lottery`;

-- ============================================================================
-- Tabla de Sorteos (Catálogo y Ciclo de Vida)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `giveaways` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `description` TEXT,
  `primary_image_url` VARCHAR(500) NOT NULL,
  `image_urls` JSON NULL,
  `package_options` JSON NULL,
  `ticket_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_tickets` INT UNSIGNED NOT NULL DEFAULT 100,
  `available_tickets` INT UNSIGNED NOT NULL DEFAULT 100,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'MXN',
  `type` ENUM('standard', 'daily') NOT NULL DEFAULT 'standard',
  `status` ENUM('draft', 'active', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
  `start_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_date` DATETIME NOT NULL,
  `draw_date` DATETIME NULL,
  `min_threshold_pct` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `countdown_hours` INT UNSIGNED NOT NULL DEFAULT 72,
  `threshold_reached_at` DATETIME NULL,
  `winner_ticket_number` INT UNSIGNED NULL,
  `winner_name` VARCHAR(150) NULL,
  `winner_order_id` BIGINT UNSIGNED NULL,
  `winner_announced_at` DATETIME NULL,
  `prize_amount` DECIMAL(12, 2) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_giveaways_type_status` (`type`, `status`),
  INDEX `idx_giveaways_status` (`status`),
  INDEX `idx_giveaways_end_date` (`end_date`),
  INDEX `idx_giveaways_threshold` (`min_threshold_pct`, `threshold_reached_at`),
  INDEX `idx_giveaways_winner_ticket` (`winner_ticket_number`),
  INDEX `idx_giveaways_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Órdenes y Apartados de Boletos
-- ============================================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `giveaway_id` BIGINT UNSIGNED NOT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(30) NOT NULL,
  `customer_state` VARCHAR(100) NULL,
  `ticket_count` INT UNSIGNED NOT NULL,
  `ticket_numbers` JSON NOT NULL,
  `total_amount` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'MXN',
  `concept_reference` VARCHAR(150) NOT NULL,
  `status` ENUM('pending_payment', 'in_review', 'completed', 'expired', 'cancelled') NOT NULL DEFAULT 'pending_payment',
  `expires_at` DATETIME NOT NULL,
  `receipt_url` VARCHAR(500) NULL,
  `receipt_filename` VARCHAR(255) NULL,
  `tracking_key` VARCHAR(50) NULL,
  `active_tracking_key` VARCHAR(50) GENERATED ALWAYS AS (
    CASE WHEN `status` IN ('completed', 'in_review') THEN `tracking_key` ELSE NULL END
  ) VIRTUAL,
  `bank_reference` VARCHAR(100) NULL,
  `is_winner` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_orders_customer_phone` (`customer_phone`),
  INDEX `idx_orders_concept_reference` (`concept_reference`),
  INDEX `idx_orders_status` (`status`),
  INDEX `idx_orders_expires_at` (`expires_at`),
  INDEX `idx_orders_status_expires` (`status`, `expires_at`),
  INDEX `idx_orders_tracking_key` (`tracking_key`),
  UNIQUE INDEX `idx_orders_active_tracking_key` (`active_tracking_key`),
  INDEX `idx_orders_is_winner` (`is_winner`),
  CONSTRAINT `fk_orders_giveaway` FOREIGN KEY (`giveaway_id`) REFERENCES `giveaways` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Boletos Individuales por Sorteo
-- ============================================================================
CREATE TABLE IF NOT EXISTS `giveaway_tickets` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `giveaway_id` BIGINT UNSIGNED NOT NULL,
  `ticket_number` INT UNSIGNED NOT NULL,
  `order_id` BIGINT UNSIGNED NULL,
  `status` ENUM('available', 'reserved', 'paid') NOT NULL DEFAULT 'available',
  `reserved_until` DATETIME NULL,
  `is_winner` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `idx_giveaway_ticket_num` (`giveaway_id`, `ticket_number`),
  INDEX `idx_giveaway_tickets_status` (`status`),
  INDEX `idx_gt_giveaway_status` (`giveaway_id`, `status`),
  INDEX `idx_gt_order_status` (`order_id`, `status`),
  INDEX `idx_giveaway_tickets_reserved_until` (`reserved_until`),
  INDEX `idx_giveaway_tickets_is_winner` (`is_winner`),
  CONSTRAINT `fk_tickets_giveaway` FOREIGN KEY (`giveaway_id`) REFERENCES `giveaways` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tickets_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Cuentas Bancarias y Tarjetas para Pagos y Transferencias
-- ============================================================================
CREATE TABLE IF NOT EXISTS `bank_accounts` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `bank_name` VARCHAR(100) NOT NULL,
  `account_holder` VARCHAR(150) NOT NULL,
  `account_type` ENUM('clabe', 'card', 'both') NOT NULL DEFAULT 'clabe',
  `clabe` VARCHAR(18) NULL UNIQUE,
  `card_number` VARCHAR(30) NULL,
  `account_number` VARCHAR(30) NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'MXN',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_bank_accounts_active` (`is_active`),
  INDEX `idx_bank_accounts_type` (`account_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `bank_accounts` (`id`, `uuid`, `bank_name`, `account_holder`, `account_type`, `clabe`, `account_number`, `card_number`, `currency`, `is_active`)
VALUES
(1, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Mercado Pago', 'PROJECT BOREAL S.A. DE C.V.', 'clabe', '722969000000000001', NULL, NULL, 'MXN', 1),
(2, 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'BBVA', 'PROJECT BOREAL S.A. DE C.V.', 'both', '012180000000000002', NULL, '4152310000000002', 'MXN', 1),
(3, 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'Santander', 'PROJECT BOREAL S.A. DE C.V.', 'clabe', '014818000000000003', NULL, NULL, 'MXN', 1)
ON DUPLICATE KEY UPDATE
  `bank_name` = VALUES(`bank_name`),
  `account_holder` = VALUES(`account_holder`),
  `account_type` = VALUES(`account_type`),
  `clabe` = VALUES(`clabe`),
  `card_number` = VALUES(`card_number`),
  `currency` = VALUES(`currency`),
  `is_active` = VALUES(`is_active`);

-- ============================================================================
-- Tabla Intermedia: Cuentas y Tarjetas Activas por Sorteo
-- ============================================================================
CREATE TABLE IF NOT EXISTS `giveaway_bank_accounts` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `giveaway_id` BIGINT UNSIGNED NOT NULL,
  `bank_account_id` INT UNSIGNED NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `idx_giveaway_bank_account` (`giveaway_id`, `bank_account_id`),
  INDEX `idx_gba_giveaway_active` (`giveaway_id`, `is_active`),
  CONSTRAINT `fk_gba_giveaway` FOREIGN KEY (`giveaway_id`) REFERENCES `giveaways` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_gba_bank_account` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Cola de Validación SPEI Banxico por Lotes
-- ============================================================================
CREATE TABLE IF NOT EXISTS `spei_validation_queue` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `order_id` BIGINT UNSIGNED NOT NULL,
  `tracking_key` VARCHAR(50) NOT NULL,
  `expected_amount` DECIMAL(10, 2) NOT NULL,
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` INT UNSIGNED NOT NULL DEFAULT 6,
  `next_retry_at` DATETIME NOT NULL,
  `last_checked_at` DATETIME NULL,
  `banxico_response` JSON NULL,
  `status` ENUM('pending', 'verifying', 'matched', 'failed', 'expired') NOT NULL DEFAULT 'pending',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX `idx_spei_queue_order_id` (`order_id`),
  INDEX `idx_spei_queue_status_retry` (`status`, `next_retry_at`),
  CONSTRAINT `fk_spei_queue_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Configuraciones del Sistema (Settings Globales)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `system_settings` (
  `setting_key` VARCHAR(100) NOT NULL PRIMARY KEY,
  `setting_value` TEXT NOT NULL,
  `description` VARCHAR(255) NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `system_settings` (`setting_key`, `setting_value`, `description`)
VALUES 
  ('daily_giveaway_paused_next', '0', 'Indica si la regeneración automática del sorteo diario está en pausa'),
  ('daily_giveaway_pot_percentage', '50', 'Porcentaje de la recaudación destinado a la bolsa acumulada del ganador')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- ============================================================================
-- Tabla de Clientes Bloqueados / Lista Negra (Fraude o Comprobantes Inválidos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `blocked_customers` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `phone` VARCHAR(30) NOT NULL UNIQUE,
  `customer_name` VARCHAR(150) NULL,
  `reason` VARCHAR(255) NOT NULL,
  `blocked_by` VARCHAR(100) NOT NULL DEFAULT 'admin',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_blocked_phone` (`phone`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Entregas de Premios y Testimonios de Ganadores
-- ============================================================================
CREATE TABLE IF NOT EXISTS `winner_deliveries` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `giveaway_id` BIGINT UNSIGNED NOT NULL UNIQUE,
  `delivery_status` ENUM('pending_contact', 'contacted', 'claimed', 'delivered') NOT NULL DEFAULT 'pending_contact',
  `contact_notes` TEXT NULL,
  `evidence_image_url` VARCHAR(500) NULL,
  `spei_receipt_url` VARCHAR(500) NULL,
  `testimonial` TEXT NULL,
  `delivered_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_deliveries_status` (`delivery_status`),
  CONSTRAINT `fk_deliveries_giveaway` FOREIGN KEY (`giveaway_id`) REFERENCES `giveaways` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Usuarios Administradores (Panel Admin)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_admin_users_email` (`email`),
  INDEX `idx_admin_users_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `admin_users` (`id`, `uuid`, `name`, `email`, `password_hash`, `is_active`)
VALUES (
  1,
  'e1a2b3c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c',
  'Administrador General',
  'admin@projectboreal.com',
  'scrypt$16384$8$1$a7160b258a0111fb673fafdd8a9ace1d$ee6541a3fce37d9b20a8cbf4ed465504d3a0dd6b8a58952c494a0b3ac0c1156824de616048be2bb2ce62ce590896147f1450d54506337189aa62032348d307ec',
  1
)
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `is_active` = VALUES(`is_active`);

-- ============================================================================
-- Tablas de Control de Acceso Basado en Permisos (PBAC / RBAC Administrativo)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(50) NOT NULL UNIQUE,
  `display_name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `category` VARCHAR(50) NOT NULL DEFAULT 'operations',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_roles_name` (`name`),
  INDEX `idx_roles_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(100) NOT NULL UNIQUE,
  `display_name` VARCHAR(150) NOT NULL,
  `description` VARCHAR(255) NULL,
  `module` VARCHAR(50) NOT NULL DEFAULT 'general',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_permissions_name` (`name`),
  INDEX `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `role_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `uq_role_permission` (`role_id`, `permission_id`),
  INDEX `idx_rp_role` (`role_id`),
  INDEX `idx_rp_permission` (`permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `admin_user_roles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `admin_user_id` INT UNSIGNED NOT NULL,
  `role_id` INT UNSIGNED NOT NULL,
  `assigned_by` INT UNSIGNED NULL,
  `assigned_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX `uq_admin_user_role` (`admin_user_id`, `role_id`),
  INDEX `idx_aur_admin_user` (`admin_user_id`),
  INDEX `idx_aur_role` (`role_id`),
  CONSTRAINT `fk_aur_admin_user` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aur_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `roles` (`name`, `display_name`, `description`, `category`) VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Acceso total e irrestricto a toda la plataforma administrativa.', 'platform'),
  ('SECURITY_ADMIN', 'Security Admin', 'Prevención de fraude, políticas de seguridad, bloqueo de participantes y lista negra.', 'platform'),
  ('COMPLIANCE_ADMIN', 'Compliance Admin', 'Cumplimiento regulatorio, auditoría de sorteos, ganadores y bloqueos.', 'platform'),
  ('AUDITOR', 'Auditor', 'Acceso global de solo lectura a todos los módulos del panel administrativo.', 'platform'),
  ('SUPPORT_MANAGER', 'Support Manager', 'Supervisión de atención a participantes, gestión de rastreo SPEI, bloqueos y premios.', 'support'),
  ('CUSTOMER_SUCCESS', 'Customer Success', 'Atención a participantes y seguimiento integral de entrega de premios a ganadores.', 'support'),
  ('DATA_ANALYST', 'Data Analyst', 'Analítica de ventas, métricas de sorteos, órdenes y reportes de ganadores.', 'data'),
  ('BILLING_AGENT', 'Billing Agent', 'Verificación de comprobantes SPEI, aprobación/rechazo de órdenes y rastreo Banxico.', 'finance'),
  ('BILLING_MANAGER', 'Billing Manager', 'Gestión financiera avanzada de pagos SPEI y cuentas bancarias receptoras.', 'finance'),
  ('FINANCE_ADMIN', 'Finance Admin', 'Configuración financiera total de cuentas bancarias, CLABEs, tarjetas y pagos.', 'finance'),
  ('OPERATIONS_AGENT', 'Operations Agent', 'Operación diaria de sorteos, consulta de órdenes y seguimiento de ganadores.', 'operations'),
  ('OPERATIONS_MANAGER', 'Operations Manager', 'Supervisión operacional completa de sorteos, tómbola, pagos, clientes, premios y personal.', 'operations'),
  ('HR_MANAGER', 'HR Manager', 'Gestión integral de recursos humanos, contrataciones, nómina y vacaciones.', 'operations'),
  ('HR_RECRUITER', 'HR Recruiter', 'Reclutamiento, altas de talento y consulta de plantilla laboral.', 'operations')
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `description` = VALUES(`description`),
  `category` = VALUES(`category`);

INSERT INTO `permissions` (`name`, `display_name`, `description`, `module`) VALUES
  ('dashboard:read', 'Ver Dashboard', 'Acceso al panel principal, KPIs financieros, gráficos y estado de pasarelas SPEI.', 'dashboard'),
  ('giveaways:read', 'Ver Sorteos', 'Consultar catálogo de sorteos, progreso de boletos y configuración del ciclo diario.', 'giveaways'),
  ('giveaways:create', 'Crear Sorteos', 'Crear nuevos sorteos, duplicar sorteos existentes y subir imágenes de premios.', 'giveaways'),
  ('giveaways:manage', 'Gestionar Sorteos', 'Editar sorteos, pausar/reanudar/cancelar ventas y configurar el ciclo diario.', 'giveaways'),
  ('giveaways:draw', 'Ejecutar Sorteos', 'Ejecutar manualmente la selección de boleto ganador de un sorteo.', 'giveaways'),
  ('giveaways:delete', 'Eliminar Sorteos', 'Eliminar borradores de sorteos sin ventas activas.', 'giveaways'),
  ('orders:read', 'Ver Pagos y Órdenes', 'Consultar órdenes, KPIs de pagos, expediente SPEI/Banxico y comprobantes.', 'orders'),
  ('orders:approve', 'Aprobar Pagos', 'Aprobar manualmente comprobantes de pago y liquidar boletos.', 'orders'),
  ('orders:reject', 'Rechazar Pagos', 'Rechazar comprobantes inválidos y liberar boletos apartados.', 'orders'),
  ('orders:manage', 'Gestionar Rastreo SPEI', 'Modificar clave de rastreo SPEI y reprogramar validación automática en Banxico.', 'orders'),
  ('bank_accounts:read', 'Ver Cuentas Bancarias', 'Consultar cuentas CLABE y tarjetas receptoras y su cobertura en sorteos.', 'bank_accounts'),
  ('bank_accounts:manage', 'Gestionar Cuentas Bancarias', 'Registrar, editar, activar/pausar cuentas bancarias y asignarlas a sorteos.', 'bank_accounts'),
  ('bank_accounts:delete', 'Eliminar Cuentas Bancarias', 'Eliminar cuentas bancarias del catálogo.', 'bank_accounts'),
  ('customers:read', 'Ver Clientes', 'Consultar directorio de participantes, KPIs e historial de órdenes por teléfono.', 'customers'),
  ('customers:block', 'Sancionar Clientes', 'Agregar o retirar números telefónicos de la lista negra antifraude.', 'customers'),
  ('winners:read', 'Ver Ganadores', 'Consultar padrón de ganadores, KPIs de premios y evidencias de entrega.', 'winners'),
  ('winners:manage', 'Gestionar Entregas de Premios', 'Actualizar estado de entrega, notas de contacto, testimonio y evidencias.', 'winners'),
  ('hr:read', 'Ver Recursos Humanos', 'Consultar plantilla de empleados, expediente laboral, KPIs de talento, nómina y calendario de vacaciones.', 'hr'),
  ('hr:create', 'Contratar Empleados', 'Registrar nuevas contrataciones, altas de personal y asignar condiciones laborales.', 'hr'),
  ('hr:manage', 'Gestionar Personal y Vacaciones', 'Editar expedientes, aprobar o rechazar vacaciones y permisos, ajustar compensación, registrar promociones y bajas.', 'hr'),
  ('hr:delete', 'Eliminar Registros de RRHH', 'Eliminar expedientes o solicitudes registradas por error en Recursos Humanos.', 'hr')
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `description` = VALUES(`description`),
  `module` = VALUES(`module`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'SUPER_ADMIN';

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'SECURITY_ADMIN'
  AND p.`name` IN ('dashboard:read', 'customers:read', 'customers:block', 'orders:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'COMPLIANCE_ADMIN'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'customers:read', 'customers:block', 'winners:read', 'hr:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'AUDITOR'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'bank_accounts:read', 'customers:read', 'winners:read', 'hr:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'FINANCE_ADMIN'
  AND p.`name` IN ('dashboard:read', 'orders:read', 'orders:approve', 'orders:reject', 'orders:manage', 'bank_accounts:read', 'bank_accounts:manage', 'bank_accounts:delete', 'giveaways:read', 'winners:read', 'hr:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'BILLING_MANAGER'
  AND p.`name` IN ('dashboard:read', 'orders:read', 'orders:approve', 'orders:reject', 'orders:manage', 'bank_accounts:read', 'bank_accounts:manage', 'customers:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'BILLING_AGENT'
  AND p.`name` IN ('orders:read', 'orders:approve', 'orders:reject', 'orders:manage', 'bank_accounts:read', 'customers:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'OPERATIONS_MANAGER'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'giveaways:create', 'giveaways:manage', 'giveaways:draw', 'giveaways:delete', 'orders:read', 'orders:approve', 'orders:reject', 'orders:manage', 'bank_accounts:read', 'customers:read', 'customers:block', 'winners:read', 'winners:manage', 'hr:read', 'hr:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'OPERATIONS_AGENT'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'giveaways:create', 'giveaways:manage', 'orders:read', 'customers:read', 'winners:read', 'winners:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'SUPPORT_MANAGER'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'orders:manage', 'customers:read', 'customers:block', 'winners:read', 'winners:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'CUSTOMER_SUCCESS'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'customers:read', 'winners:read', 'winners:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'DATA_ANALYST'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'HR_MANAGER'
  AND p.`name` IN ('dashboard:read', 'hr:read', 'hr:create', 'hr:manage', 'hr:delete');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'HR_RECRUITER'
  AND p.`name` IN ('dashboard:read', 'hr:read', 'hr:create');

INSERT IGNORE INTO `admin_user_roles` (`admin_user_id`, `role_id`)
SELECT 1, `id` FROM `roles` WHERE `name` = 'SUPER_ADMIN';

CREATE TABLE IF NOT EXISTS `hr_employees` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `employee_code` VARCHAR(20) NOT NULL UNIQUE,
  `admin_user_id` INT UNSIGNED NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `phone` VARCHAR(30) NOT NULL,
  `department` ENUM('operations', 'finance', 'engineering', 'support', 'data', 'hr', 'executive', 'marketing', 'legal') NOT NULL DEFAULT 'operations',
  `position_title` VARCHAR(120) NOT NULL,
  `employment_type` ENUM('full_time', 'part_time', 'contractor', 'intern') NOT NULL DEFAULT 'full_time',
  `work_modality` ENUM('remote', 'hybrid', 'onsite') NOT NULL DEFAULT 'hybrid',
  `location_state` VARCHAR(80) NULL,
  `hire_date` DATE NOT NULL,
  `termination_date` DATE NULL,
  `termination_reason` VARCHAR(255) NULL,
  `monthly_salary` DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'MXN',
  `payment_frequency` ENUM('biweekly', 'monthly', 'weekly') NOT NULL DEFAULT 'biweekly',
  `bank_name` VARCHAR(80) NULL,
  `clabe` VARCHAR(18) NULL,
  `rfc` VARCHAR(13) NULL,
  `curp` VARCHAR(18) NULL,
  `nss` VARCHAR(15) NULL,
  `vacation_days_total` INT UNSIGNED NOT NULL DEFAULT 12,
  `vacation_days_used` INT UNSIGNED NOT NULL DEFAULT 0,
  `emergency_contact_name` VARCHAR(150) NULL,
  `emergency_contact_phone` VARCHAR(30) NULL,
  `status` ENUM('active', 'on_leave', 'probation', 'suspended', 'terminated') NOT NULL DEFAULT 'active',
  `notes` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_hr_emp_department` (`department`),
  INDEX `idx_hr_emp_status` (`status`),
  INDEX `idx_hr_emp_hire_date` (`hire_date`),
  CONSTRAINT `fk_hr_emp_admin_user` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hr_leave_requests` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `employee_id` INT UNSIGNED NOT NULL,
  `leave_type` ENUM('vacation', 'sick_leave', 'personal', 'maternity_paternity', 'unpaid', 'bereavement') NOT NULL DEFAULT 'vacation',
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `days_count` INT UNSIGNED NOT NULL DEFAULT 1,
  `reason` VARCHAR(500) NULL,
  `status` ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  `reviewed_by_name` VARCHAR(150) NULL,
  `review_notes` VARCHAR(500) NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_hr_leave_emp` (`employee_id`),
  INDEX `idx_hr_leave_status` (`status`),
  INDEX `idx_hr_leave_dates` (`start_date`, `end_date`),
  CONSTRAINT `fk_hr_leave_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hr_employee_events` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `employee_id` INT UNSIGNED NOT NULL,
  `event_type` ENUM('hired', 'promotion', 'salary_adjustment', 'department_transfer', 'leave_approved', 'performance_review', 'warning', 'status_change', 'terminated') NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NULL,
  `previous_value` VARCHAR(180) NULL,
  `new_value` VARCHAR(180) NULL,
  `recorded_by_name` VARCHAR(150) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_hr_event_emp` (`employee_id`),
  INDEX `idx_hr_event_type` (`event_type`),
  CONSTRAINT `fk_hr_event_employee` FOREIGN KEY (`employee_id`) REFERENCES `hr_employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `hr_employees` (
  `id`, `uuid`, `employee_code`, `admin_user_id`, `full_name`, `email`, `phone`,
  `department`, `position_title`, `employment_type`, `work_modality`, `location_state`,
  `hire_date`, `monthly_salary`, `currency`, `payment_frequency`, `bank_name`, `clabe`,
  `rfc`, `curp`, `nss`, `vacation_days_total`, `vacation_days_used`,
  `emergency_contact_name`, `emergency_contact_phone`, `status`, `notes`
) VALUES
  (
    1, 'a1100001-b220-4c30-8d40-e55000000001', 'EMP-0001', 1,
    'Alejandro Garza Elizondo', 'agarza@projectboreal.com', '8112345678',
    'executive', 'Director de Operaciones (COO)', 'full_time', 'hybrid', 'Nuevo León',
    '2023-03-15', 85000.00, 'MXN', 'biweekly', 'BBVA México', '012580001234567891',
    'GAEA880512HNL', 'GAEA880512HNLRLA01', '43128809123', 16, 4,
    'Valeria Elizondo', '8187654321', 'active',
    'Responsable general de operaciones de sorteos, tesorería y cumplimiento.'
  ),
  (
    2, 'a1100002-b220-4c30-8d40-e55000000002', 'EMP-0002', NULL,
    'Sofía Mendoza Villaseñor', 'smendoza@projectboreal.com', '5543219876',
    'hr', 'HR Manager & People Partner', 'full_time', 'hybrid', 'Ciudad de México',
    '2023-08-01', 54000.00, 'MXN', 'biweekly', 'Santander', '014180009876543210',
    'MEVS911024MDF', 'MEVS911024MDFNNS04', '11919123456', 14, 2,
    'Roberto Mendoza', '5511223344', 'active',
    'Líder de atracción de talento, clima organizacional, nómina y administración de vacaciones.'
  ),
  (
    3, 'a1100003-b220-4c30-8d40-e55000000003', 'EMP-0003', NULL,
    'Diego Emiliano Reyes Treviño', 'dreyes@projectboreal.com', '3398765432',
    'engineering', 'Lead Full-Stack & Architecture Engineer', 'full_time', 'remote', 'Jalisco',
    '2023-06-10', 72000.00, 'MXN', 'biweekly', 'Nu México', '698180005544332211',
    'RETD930218HJC', 'RETD930218HJCRYD08', '54149308765', 14, 6,
    'Lucía Treviño', '3312340987', 'active',
    'Arquitecto principal de la plataforma de sorteos en tiempo real y motores antifraude.'
  ),
  (
    4, 'a1100004-b220-4c30-8d40-e55000000004', 'EMP-0004', NULL,
    'Mariana Fernanda Ortiz Cano', 'mortiz@projectboreal.com', '5587651234',
    'finance', 'Coordinadora de Conciliación SPEI y Tesorería', 'full_time', 'onsite', 'Ciudad de México',
    '2024-01-15', 46000.00, 'MXN', 'biweekly', 'Banorte', '072180001122334455',
    'OICM940709MDF', 'OICM940709MDFRTC02', '12169455432', 14, 5,
    'Carlos Ortiz', '5599887766', 'on_leave',
    'Supervisión de dispersión de premios, liquidación Banxico CEP y cuentas receptoras.'
  ),
  (
    5, 'a1100005-b220-4c30-8d40-e55000000005', 'EMP-0005', NULL,
    'Rodrigo Sebastián Navarro Paz', 'rnavarro@projectboreal.com', '8123459876',
    'support', 'Customer Success & Winner Delivery Lead', 'full_time', 'hybrid', 'Nuevo León',
    '2024-05-20', 38500.00, 'MXN', 'biweekly', 'BBVA México', '012580006677889900',
    'NAPR951130HNL', 'NAPR951130HNLVRD05', '43189567890', 12, 0,
    'Elena Paz', '8133445566', 'active',
    'Coordinación de atención VIP a participantes y entrega certificada de premios a ganadores.'
  ),
  (
    6, 'a1100006-b220-4c30-8d40-e55000000006', 'EMP-0006', NULL,
    'Camila Valentina Herrera Solís', 'cherrera@projectboreal.com', '4423456789',
    'data', 'Analista de Datos y Riesgo Transaccional', 'full_time', 'remote', 'Querétaro',
    '2026-08-18', 42000.00, 'MXN', 'biweekly', 'Citibanamex', '002680004455667788',
    'HESC970414MQT', 'HESC970414MQTRRC09', '66199712345', 12, 0,
    'Jorge Herrera', '4429876543', 'probation',
    'Monitoreo estadístico de conversión de boletos, modelos antifraude y auditoría Cassandra.'
  )
ON DUPLICATE KEY UPDATE
  `full_name` = VALUES(`full_name`),
  `position_title` = VALUES(`position_title`),
  `department` = VALUES(`department`),
  `monthly_salary` = VALUES(`monthly_salary`),
  `status` = VALUES(`status`);

INSERT INTO `hr_leave_requests` (
  `id`, `uuid`, `employee_id`, `leave_type`, `start_date`, `end_date`, `days_count`,
  `reason`, `status`, `reviewed_by_name`, `review_notes`, `reviewed_at`
) VALUES
  (
    1, 'b2200001-c330-4d40-9e50-f66000000001', 4,
    'vacation', '2026-10-05', '2026-10-11', 5,
    'Periodo vacacional anual programado con cobertura de turno en tesorería SPEI.',
    'approved', 'Sofía Mendoza Villaseñor', 'Aprobado. Guardia cubierta por el equipo de finanzas.', '2026-09-25 11:30:00'
  ),
  (
    2, 'b2200002-c330-4d40-9e50-f66000000002', 3,
    'vacation', '2026-11-16', '2026-11-20', 5,
    'Vacaciones de mitad de noviembre tras cierre de despliegue trimestral.',
    'pending', NULL, NULL, NULL
  ),
  (
    3, 'b2200003-c330-4d40-9e50-f66000000003', 5,
    'personal', '2026-10-22', '2026-10-23', 2,
    'Trámites notariales y personales en Monterrey.',
    'pending', NULL, NULL, NULL
  ),
  (
    4, 'b2200004-c330-4d40-9e50-f66000000004', 1,
    'vacation', '2026-07-13', '2026-07-16', 4,
    'Descanso familiar de verano.',
    'approved', 'Sofía Mendoza Villaseñor', 'Autorizado conforme a calendario anual ejecutivo.', '2026-07-01 09:15:00'
  )
ON DUPLICATE KEY UPDATE
  `status` = VALUES(`status`),
  `days_count` = VALUES(`days_count`);

INSERT INTO `hr_employee_events` (
  `id`, `uuid`, `employee_id`, `event_type`, `title`, `description`,
  `previous_value`, `new_value`, `recorded_by_name`, `created_at`
) VALUES
  (
    1, 'c3300001-d440-4e50-8f60-a77000000001', 1,
    'hired', 'Contratación e Ingreso Ejecutivo',
    'Alta oficial como Director de Operaciones (COO) liderando la estrategia operativa de sorteos.',
    NULL, 'Director de Operaciones (COO)', 'Administrador General', '2023-03-15 09:00:00'
  ),
  (
    2, 'c3300002-d440-4e50-8f60-a77000000002', 2,
    'hired', 'Ingreso como HR Manager',
    'Incorporación para encabezar el departamento de Recursos Humanos y Capital Humano.',
    NULL, 'HR Manager & People Partner', 'Alejandro Garza Elizondo', '2023-08-01 09:00:00'
  ),
  (
    3, 'c3300003-d440-4e50-8f60-a77000000003', 3,
    'promotion', 'Promoción a Lead Full-Stack Engineer',
    'Ascenso por mérito técnico tras liderar la arquitectura de conciliación SPEI y alta concurrencia.',
    'Senior Software Engineer ($62,000 MXN)', 'Lead Full-Stack & Architecture Engineer ($72,000 MXN)', 'Alejandro Garza Elizondo', '2025-06-01 12:00:00'
  ),
  (
    4, 'c3300004-d440-4e50-8f60-a77000000004', 4,
    'leave_approved', 'Vacaciones Autorizadas (5 días)',
    'Periodo vacacional autorizado del 05/10/2026 al 11/10/2026.',
    '0 días tomados', '5 días tomados', 'Sofía Mendoza Villaseñor', '2026-09-25 11:30:00'
  ),
  (
    5, 'c3300005-d440-4e50-8f60-a77000000005', 6,
    'hired', 'Contratación e Inicio de Periodo de Prueba',
    'Ingreso al equipo de Datos y Riesgo Transaccional bajo esquema remoto.',
    NULL, 'Analista de Datos y Riesgo Transaccional', 'Sofía Mendoza Villaseñor', '2026-08-18 10:00:00'
  )
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `description` = VALUES(`description`);

GRANT SELECT, INSERT, UPDATE, DELETE, INDEX, LOCK TABLES, EXECUTE ON `db_lottery`.* TO 'sprite_user'@'%';
FLUSH PRIVILEGES;


