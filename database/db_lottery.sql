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
  ('SUPER_ADMIN', 'Super Admin', 'Acceso excepcional e irrestricto a toda la plataforma administrativa.', 'platform'),
  ('PLATFORM_ADMIN', 'Platform Admin', 'Administración general de la plataforma y todos sus módulos.', 'platform'),
  ('SECURITY_ADMIN', 'Security Admin', 'IAM, sesiones, políticas de seguridad, prevención de fraude y lista negra.', 'platform'),
  ('IAM_ADMIN', 'IAM Admin', 'Administración de cuentas administrativas, roles, permisos y matriz PBAC.', 'platform'),
  ('COMPLIANCE_ADMIN', 'Compliance Admin', 'Cumplimiento regulatorio, auditoría de sorteos, ganadores y bloqueos.', 'platform'),
  ('AUDITOR', 'Auditor', 'Acceso global de solo lectura a todos los módulos del panel administrativo.', 'platform'),
  ('READ_ONLY_ADMIN', 'Read-Only Admin', 'Administración y diagnóstico de solo lectura en módulos operativos.', 'platform'),
  ('SYSTEM_ACCOUNT', 'System Account', 'Cuenta institucional o de sistema inmutable.', 'platform'),
  ('SUPPORT_L1', 'Support L1', 'Soporte básico de nivel 1 y consulta de sorteos, órdenes, clientes y ganadores.', 'support'),
  ('SUPPORT_L2', 'Support L2', 'Soporte técnico nivel 2 con facultad de prevención y bloqueo de clientes fraudulentos.', 'support'),
  ('SUPPORT_L3', 'Support L3', 'Soporte técnico avanzado nivel 3 con gestión de rastreo SPEI y bloqueos.', 'support'),
  ('SUPPORT_MANAGER', 'Support Manager', 'Supervisión del equipo de soporte, atención a clientes y entrega de premios.', 'support'),
  ('CUSTOMER_SUCCESS', 'Customer Success', 'Atención a participantes y seguimiento integral de entrega de premios a ganadores.', 'support'),
  ('INCIDENT_MANAGER', 'Incident Manager', 'Coordinación y contención de incidentes operativos y antifraude.', 'support'),
  ('ENGINEER', 'Engineer', 'Herramientas técnicas y diagnóstico de ingeniería.', 'engineering'),
  ('SENIOR_ENGINEER', 'Senior Engineer', 'Acceso técnico avanzado de ingeniería.', 'engineering'),
  ('DEVOPS', 'DevOps', 'Infraestructura, despliegues y servicios.', 'engineering'),
  ('SRE', 'SRE', 'Observabilidad, disponibilidad y operaciones de producción.', 'engineering'),
  ('RELEASE_MANAGER', 'Release Manager', 'Gestión de versiones y despliegues controlados.', 'engineering'),
  ('DATA_ANALYST', 'Data Analyst', 'Analítica de ventas, métricas de sorteos y reportes.', 'data'),
  ('DATA_ENGINEER', 'Data Engineer', 'Pipelines e ingeniería de procesamiento de datos.', 'data'),
  ('DATA_ADMIN', 'Data Admin', 'Administración y consulta integral de recursos de datos.', 'data'),
  ('PRIVACY_ADMIN', 'Privacy Admin', 'Privacidad de datos de participantes y gestión de bloqueos.', 'data'),
  ('DATA_AUDITOR', 'Data Auditor', 'Auditoría de integridad de datos de sorteos, órdenes y ganadores.', 'data'),
  ('BILLING_AGENT', 'Billing Agent', 'Verificación de comprobantes SPEI, aprobación/rechazo de órdenes y rastreo.', 'finance'),
  ('BILLING_MANAGER', 'Billing Manager', 'Gestión financiera avanzada de pagos SPEI y cuentas bancarias receptoras.', 'finance'),
  ('FINANCE_ADMIN', 'Finance Admin', 'Configuración financiera total de cuentas bancarias, CLABEs, tarjetas y pagos.', 'finance'),
  ('REFUNDS_ADMIN', 'Refunds Admin', 'Gestión especializada de rechazos, cancelaciones y liberación de boletos.', 'finance'),
  ('OPERATIONS_AGENT', 'Operations Agent', 'Operación diaria de sorteos, consulta de órdenes y seguimiento de ganadores.', 'operations'),
  ('OPERATIONS_MANAGER', 'Operations Manager', 'Supervisión operacional completa de sorteos, tómbola, pagos, clientes y premios.', 'operations'),
  ('WORKFLOW_ADMIN', 'Workflow Admin', 'Administración del ciclo automático del sorteo diario y parámetros de bolsa.', 'operations'),
  ('SYSTEM_OPERATOR', 'System Operator', 'Operaciones técnicas sobre sistemas y procesos programados.', 'operations'),
  ('HR_MANAGER', 'HR Manager', 'Gestión de recursos humanos, contrataciones y compensación.', 'operations'),
  ('HR_RECRUITER', 'HR Recruiter', 'Reclutamiento y altas de talento.', 'operations')
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
  ('roles:read', 'Ver Roles y Permisos', 'Consultar catálogo de roles, permisos y matriz de control de acceso PBAC.', 'roles'),
  ('roles:manage', 'Gestionar Roles y Permisos', 'Configurar permisos asignados a cada rol y administrar roles de cuentas admin.', 'roles')
ON DUPLICATE KEY UPDATE
  `display_name` = VALUES(`display_name`),
  `description` = VALUES(`description`),
  `module` = VALUES(`module`);

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` IN ('SUPER_ADMIN', 'PLATFORM_ADMIN');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'SECURITY_ADMIN'
  AND p.`name` IN ('dashboard:read', 'customers:read', 'customers:block', 'orders:read', 'roles:read', 'roles:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'IAM_ADMIN'
  AND p.`name` IN ('dashboard:read', 'roles:read', 'roles:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'COMPLIANCE_ADMIN'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'customers:read', 'customers:block', 'winners:read', 'roles:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'AUDITOR'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'bank_accounts:read', 'customers:read', 'winners:read', 'roles:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'READ_ONLY_ADMIN'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'bank_accounts:read', 'customers:read', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'FINANCE_ADMIN'
  AND p.`name` IN ('dashboard:read', 'orders:read', 'orders:approve', 'orders:reject', 'orders:manage', 'bank_accounts:read', 'bank_accounts:manage', 'bank_accounts:delete', 'giveaways:read', 'winners:read');

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
WHERE r.`name` = 'REFUNDS_ADMIN'
  AND p.`name` IN ('orders:read', 'orders:reject', 'customers:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'OPERATIONS_MANAGER'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'giveaways:create', 'giveaways:manage', 'giveaways:draw', 'giveaways:delete', 'orders:read', 'orders:approve', 'orders:reject', 'orders:manage', 'bank_accounts:read', 'customers:read', 'customers:block', 'winners:read', 'winners:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'OPERATIONS_AGENT'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'giveaways:create', 'giveaways:manage', 'orders:read', 'customers:read', 'winners:read', 'winners:manage');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'WORKFLOW_ADMIN'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'giveaways:manage');

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
WHERE r.`name` = 'SUPPORT_L3'
  AND p.`name` IN ('giveaways:read', 'orders:read', 'orders:manage', 'customers:read', 'customers:block', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'SUPPORT_L2'
  AND p.`name` IN ('giveaways:read', 'orders:read', 'customers:read', 'customers:block', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'SUPPORT_L1'
  AND p.`name` IN ('giveaways:read', 'orders:read', 'customers:read', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'INCIDENT_MANAGER'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'customers:read', 'customers:block');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'DATA_ADMIN'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'bank_accounts:read', 'customers:read', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'DATA_ANALYST'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'DATA_AUDITOR'
  AND p.`name` IN ('dashboard:read', 'giveaways:read', 'orders:read', 'customers:read', 'winners:read');

INSERT IGNORE INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.`id`, p.`id` FROM `roles` r CROSS JOIN `permissions` p
WHERE r.`name` = 'PRIVACY_ADMIN'
  AND p.`name` IN ('customers:read', 'customers:block');

INSERT IGNORE INTO `admin_user_roles` (`admin_user_id`, `role_id`)
SELECT 1, `id` FROM `roles` WHERE `name` IN ('SUPER_ADMIN', 'PLATFORM_ADMIN');

GRANT SELECT, INSERT, UPDATE, DELETE, INDEX, LOCK TABLES, EXECUTE ON `db_lottery`.* TO 'sprite_user'@'%';
FLUSH PRIVILEGES;


