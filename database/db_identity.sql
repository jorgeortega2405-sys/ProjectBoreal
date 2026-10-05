-- ============================================================================
-- Project Boreal - Identity Database Schema (MySQL)
-- Archivo: database/db_identity.sql
-- Dominio: Seguridad, Autenticación, Roles y Permisos PBAC
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `db_identity`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `db_identity`;

-- ============================================================================
-- Tabla de Administradores del Sistema
-- ============================================================================
CREATE TABLE IF NOT EXISTS `admin_users` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_admin_users_email` (`email`),
  INDEX `idx_admin_users_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Roles de Administrador
-- ============================================================================
CREATE TABLE IF NOT EXISTS `roles` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(50) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla de Catálogo de Permisos Atómicos (PBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `slug` VARCHAR(100) NOT NULL UNIQUE,
  `module` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_permissions_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla Intermedia: Permisos por Rol
-- ============================================================================
CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` INT UNSIGNED NOT NULL,
  `permission_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`, `permission_id`),
  CONSTRAINT `fk_rp_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_rp_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Tabla Intermedia: Roles por Administrador
-- ============================================================================
CREATE TABLE IF NOT EXISTS `admin_user_roles` (
  `admin_user_id` INT UNSIGNED NOT NULL,
  `role_id` INT UNSIGNED NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`admin_user_id`, `role_id`),
  CONSTRAINT `fk_aur_user` FOREIGN KEY (`admin_user_id`) REFERENCES `admin_users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_aur_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Datos Semilla Iniciales
-- ============================================================================

-- 1. Permisos del Sistema
INSERT INTO `permissions` (`id`, `slug`, `module`, `description`)
VALUES
  (1, 'admin:access', 'system', 'Acceso al panel de administración'),
  (2, 'lottery:create', 'lottery', 'Crear nuevos sorteos'),
  (3, 'lottery:edit', 'lottery', 'Modificar información de sorteos existentes'),
  (4, 'lottery:delete', 'lottery', 'Cancelar o eliminar sorteos'),
  (5, 'orders:view', 'orders', 'Consultar órdenes de compra y clientes'),
  (6, 'orders:review', 'orders', 'Aprobar y verificar comprobantes de pago'),
  (7, 'bank_accounts:manage', 'finance', 'Administrar cuentas bancarias receptoras'),
  (8, 'audit:view', 'audit', 'Consultar bitácora inmutable de auditoría'),
  (9, 'users:manage', 'system', 'Administrar usuarios administradores y permisos')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);

-- 2. Roles Estándar
INSERT INTO `roles` (`id`, `slug`, `name`, `description`)
VALUES
  (1, 'superadmin', 'Super Administrador', 'Acceso total sin restricciones al sistema'),
  (2, 'operator', 'Operador de Sorteos', 'Gestión de sorteos, órdenes y comprobantes bancarios'),
  (3, 'auditor', 'Auditor de Seguridad', 'Acceso de solo lectura a auditoría y finanzas')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `description` = VALUES(`description`);

-- 3. Asignación de Permisos a Roles
-- Superadmin (todos los permisos 1 al 9)
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
VALUES
  (1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (1, 9)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- Operador (acceso, lotería y órdenes)
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
VALUES
  (2, 1), (2, 2), (2, 3), (2, 5), (2, 6)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- Auditor (acceso y bitácora)
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
VALUES
  (3, 1), (3, 5), (3, 8)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- 4. Usuario Administrador Maestro Inicial
INSERT INTO `admin_users` (`id`, `uuid`, `email`, `password_hash`, `name`, `is_active`)
VALUES (
  1,
  'c0a80101-0000-4000-8000-000000000001',
  'admin@projectboreal.com',
  '$2a$10$JMUr6kdrTUakrOuj/ECUr.N/rOzN53jkw5mqDI4nRuxdpCs2EFbL.',
  'Administrador General',
  1
)
ON DUPLICATE KEY UPDATE
  `password_hash` = VALUES(`password_hash`),
  `name` = VALUES(`name`),
  `is_active` = VALUES(`is_active`);

-- 5. Asignar Rol de Superadmin al Usuario Maestro
INSERT INTO `admin_user_roles` (`admin_user_id`, `role_id`)
VALUES (1, 1)
ON DUPLICATE KEY UPDATE `role_id` = VALUES(`role_id`);

-- 6. Garantizar Privilegios al Usuario de Aplicación
GRANT ALL PRIVILEGES ON `db_identity`.* TO 'sprite_user'@'%';
FLUSH PRIVILEGES;
