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
  `status` ENUM('draft', 'active', 'paused', 'completed', 'cancelled') NOT NULL DEFAULT 'active',
  `start_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `end_date` DATETIME NOT NULL,
  `draw_date` DATETIME NULL,
  `min_threshold_pct` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `countdown_hours` INT UNSIGNED NOT NULL DEFAULT 48,
  `threshold_reached_at` DATETIME NULL,
  `winner_ticket_number` INT UNSIGNED NULL,
  `winner_name` VARCHAR(150) NULL,
  `winner_order_id` BIGINT UNSIGNED NULL,
  `winner_announced_at` DATETIME NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_giveaways_status` (`status`),
  INDEX `idx_giveaways_end_date` (`end_date`),
  INDEX `idx_giveaways_threshold` (`min_threshold_pct`, `threshold_reached_at`),
  INDEX `idx_giveaways_winner_ticket` (`winner_ticket_number`),
  INDEX `idx_giveaways_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Datos Semilla de Sorteos
-- ============================================================================
INSERT INTO `giveaways` (
  `id`, `uuid`, `title`, `slug`, `description`, `primary_image_url`, `image_urls`, `ticket_price`, `total_tickets`, `available_tickets`, `currency`, `status`, `start_date`, `end_date`, `min_threshold_pct`, `countdown_hours`, `threshold_reached_at`
) VALUES
(
  1,
  'e7b1a2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
  'Gran Sorteo $1,000,000 MXN en Efectivo',
  'sorteo-1-millon-mxn-en-efectivo',
  '¡Llévate $1,000,000 de pesos en efectivo directo a tu cuenta bancaria! Emisión limitada de 100,000 boletos del 00000 al 99999. Selección 100% transparente y aleatoria por sistema.',
  'https://images.unsplash.com/photo-1580519542036-c47de6196ba5?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1580519542036-c47de6196ba5?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1567427017947-545c5f8d16ad?auto=format&fit=crop&w=800&q=80"]',
  10.00,
  100000,
  100000,
  'MXN',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 7 DAY),
  0,
  48,
  NULL
)
ON DUPLICATE KEY UPDATE
  `title` = VALUES(`title`),
  `description` = VALUES(`description`),
  `image_urls` = VALUES(`image_urls`),
  `ticket_price` = VALUES(`ticket_price`),
  `total_tickets` = VALUES(`total_tickets`),
  `available_tickets` = VALUES(`available_tickets`),
  `min_threshold_pct` = VALUES(`min_threshold_pct`),
  `countdown_hours` = VALUES(`countdown_hours`),
  `threshold_reached_at` = VALUES(`threshold_reached_at`),
  `end_date` = VALUES(`end_date`);

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
  `bank_reference` VARCHAR(100) NULL,
  `is_winner` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_orders_customer_phone` (`customer_phone`),
  INDEX `idx_orders_concept_reference` (`concept_reference`),
  INDEX `idx_orders_status` (`status`),
  INDEX `idx_orders_expires_at` (`expires_at`),
  INDEX `idx_orders_tracking_key` (`tracking_key`),
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
(1, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Mercado Pago', 'JORGE LUIS ORTEGA AGUILAR', 'clabe', '722969028909564682', NULL, NULL, 'MXN', 1)
ON DUPLICATE KEY UPDATE `bank_name` = VALUES(`bank_name`), `account_holder` = VALUES(`account_holder`), `clabe` = VALUES(`clabe`);

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

INSERT INTO `giveaway_bank_accounts` (`giveaway_id`, `bank_account_id`, `is_active`)
VALUES
(1, 1, 1)
ON DUPLICATE KEY UPDATE `is_active` = VALUES(`is_active`);

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

GRANT ALL PRIVILEGES ON `db_lottery`.* TO 'sprite_user'@'%';
FLUSH PRIVILEGES;

