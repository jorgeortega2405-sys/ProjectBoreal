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
-- Sorteo Diario Inicial Activo (50/50)
-- ============================================================================
INSERT INTO `giveaways` (
  `id`,
  `uuid`,
  `title`,
  `slug`,
  `description`,
  `primary_image_url`,
  `image_urls`,
  `package_options`,
  `ticket_price`,
  `total_tickets`,
  `available_tickets`,
  `currency`,
  `type`,
  `status`,
  `start_date`,
  `end_date`,
  `draw_date`,
  `min_threshold_pct`,
  `countdown_hours`,
  `prize_amount`
) VALUES (
  1,
  'd1a11111-e222-3333-4444-555555555555',
  'Sorteo Diario: Bolsa Acumulada en Efectivo',
  'sorteo-diario-activo',
  '¡Sorteo diario! 20,000 boletos disponibles a solo $2 MXN cada uno. El ganador se lleva una parte del acumulado en efectivo al finalizar el día.',
  '/images/giveaways/daily/daily-cash-1000-main.jpg',
  '["/images/giveaways/daily/daily-cash-1000-main.jpg"]',
  '[5, 10, 25, 50, 100]',
  2.00,
  20000,
  20000,
  'MXN',
  'daily',
  'active',
  CURRENT_TIMESTAMP,
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR),
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR),
  0,
  24,
  NULL
)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `status` = 'active',
  `ticket_price` = VALUES(`ticket_price`),
  `primary_image_url` = VALUES(`primary_image_url`),
  `image_urls` = VALUES(`image_urls`),
  `type` = 'daily';

INSERT INTO `giveaway_bank_accounts` (`giveaway_id`, `bank_account_id`, `is_active`)
SELECT 1, `id`, 1 FROM `bank_accounts` WHERE `is_active` = 1
ON DUPLICATE KEY UPDATE `is_active` = 1;

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
VALUES ('daily_giveaway_paused_next', '0', 'Indica si la regeneración automática del sorteo diario está en pausa')
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

GRANT SELECT, INSERT, UPDATE, DELETE, INDEX, LOCK TABLES, EXECUTE ON `db_lottery`.* TO 'sprite_user'@'%';
FLUSH PRIVILEGES;

