CREATE DATABASE IF NOT EXISTS `db_boreal`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `db_boreal`;

CREATE TABLE IF NOT EXISTS `giveaways` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `title` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL UNIQUE,
  `description` TEXT,
  `primary_image_url` VARCHAR(500) NOT NULL,
  `image_urls` JSON NULL,
  `ticket_price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total_tickets` INT UNSIGNED NOT NULL DEFAULT 100,
  `available_tickets` INT UNSIGNED NOT NULL DEFAULT 100,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'USD',
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

INSERT INTO `giveaways` (
  `uuid`, `title`, `slug`, `description`, `primary_image_url`, `image_urls`, `ticket_price`, `total_tickets`, `available_tickets`, `currency`, `status`, `start_date`, `end_date`, `min_threshold_pct`, `countdown_hours`, `threshold_reached_at`
) VALUES
(
  'e7b1a2c3-4d5e-6f7a-8b9c-0d1e2f3a4b5c',
  'PlayStation 5 Pro Edición Limitada + 2 Mandos DualSense',
  'playstation-5-pro-edicion-limitada',
  'Consola PlayStation 5 Pro con 2TB SSD de alta velocidad, mando DualSense inalámbrico adicional y juego Astro Bot incluido.',
  'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1622297845775-5ff3fef71d13?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1592840496694-26d035b52b48?auto=format&fit=crop&w=800&q=80"]',
  5.00,
  500,
  379,
  'USD',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 48 HOUR),
  30,
  48,
  NOW()
),
(
  'f8c2b3d4-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
  'iPhone 16 Pro Max 256GB Titanio Natural',
  'iphone-16-pro-max-256gb-titanio-natural',
  'El smartphone insignia de Apple con chip A18 Pro, pantalla Super Retina XDR de 6.9 pulgadas y acabado en titanio de grado aeroespacial.',
  'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1592750475338-74b7b21085ab?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80"]',
  8.00,
  400,
  145,
  'USD',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 10 DAY),
  50,
  72,
  NULL
),
(
  'a1d2e3f4-6a7b-8c9d-0e1f-2a3b4c5d6e7f',
  'MacBook Pro 16" M3 Max 36GB RAM 1TB SSD',
  'macbook-pro-16-m3-max',
  'Potencia extrema para creadores profesionales. Pantalla Liquid Retina XDR de 120Hz con autonomía de hasta 22 horas.',
  'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1541807084-5c52b6b3adef?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?auto=format&fit=crop&w=800&q=80"]',
  12.00,
  600,
  490,
  'USD',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 48 HOUR),
  25,
  48,
  NOW()
),
(
  'b2e3f4a5-7b8c-9d0e-1f2a-3b4c5d6e7f8a',
  'Setup Gamer Ultimate: RTX 4090 + Monitor OLED 240Hz',
  'setup-gamer-ultimate-rtx-4090',
  'Torre con procesador Ryzen 9 7950X3D, GeForce RTX 4090, 64GB DDR5, refrigeración líquida y monitor curvo OLED de 34 pulgadas.',
  'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1547394765-185e1e68f34e?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1598550476439-6847785fcea6?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=800&q=80"]',
  15.00,
  500,
  210,
  'USD',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 18 DAY),
  60,
  48,
  NULL
),
(
  'c3f4a5b6-8c9d-0e1f-2a3b-4c5d6e7f8a9b',
  'Viaje Todo Incluido a Tokio, Japón para 2 Personas (10 Días)',
  'viaje-todo-incluido-tokio-japon',
  'Vuelos en clase ejecutiva, estancia en hotel de 5 estrellas en Shinjuku, pases JR ilimitados y guía privado por Akihabara, Shibuya y Kioto.',
  'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1536098561742-ca998e48cbcc?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=800&q=80"]',
  20.00,
  750,
  620,
  'USD',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 30 DAY),
  40,
  72,
  NULL
),
(
  'd4a5b6c7-9d0e-1f2a-3b4c-5d6e7f8a9b0c',
  'Cámara Sony Alpha 7 IV + Lente 24-70mm f/2.8 GM II',
  'sony-alpha-7-iv-lente-24-70-gm-ii',
  'Cámara mirrorless full-frame de 33MP con grabación 4K 60p, enfoque en tiempo real por IA y lente zoom estándar profesional.',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80',
  '["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=800&q=80", "https://images.unsplash.com/photo-1512790182412-b19e6d62bc39?auto=format&fit=crop&w=800&q=80"]',
  10.00,
  450,
  335,
  'USD',
  'active',
  NOW(),
  DATE_ADD(NOW(), INTERVAL 15 DAY),
  0,
  48,
  NULL
)
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`), `description` = VALUES(`description`), `image_urls` = VALUES(`image_urls`), `min_threshold_pct` = VALUES(`min_threshold_pct`), `countdown_hours` = VALUES(`countdown_hours`), `threshold_reached_at` = VALUES(`threshold_reached_at`), `end_date` = VALUES(`end_date`);

-- ============================================================================
-- Tabla de Órdenes y Apartados de Boletos
-- ============================================================================
CREATE TABLE IF NOT EXISTS `orders` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `giveaway_id` BIGINT UNSIGNED NOT NULL,
  `customer_name` VARCHAR(150) NOT NULL,
  `customer_phone` VARCHAR(30) NOT NULL,
  `ticket_count` INT UNSIGNED NOT NULL,
  `ticket_numbers` JSON NOT NULL,
  `total_amount` DECIMAL(10, 2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL DEFAULT 'MXN',
  `concept_reference` VARCHAR(50) NOT NULL,
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
(1, 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'BBVA México', 'ProjectBoreal S.A. de C.V.', 'both', '012180004567890123', '0456789012', '4152313412345678', 'MXN', 1),
(2, 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', 'STP (Transferencias SPEI)', 'ProjectBoreal S.A. de C.V.', 'clabe', '646180123456789012', '1234567890', NULL, 'MXN', 1),
(3, 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f', 'Banorte', 'ProjectBoreal S.A. de C.V.', 'card', NULL, NULL, '4915667812349988', 'MXN', 1)
ON DUPLICATE KEY UPDATE `bank_name` = VALUES(`bank_name`), `account_type` = VALUES(`account_type`), `card_number` = VALUES(`card_number`);

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
(1, 1, 1),
(1, 2, 1),
(2, 1, 1),
(2, 3, 1),
(3, 2, 1),
(4, 1, 1),
(4, 2, 1),
(4, 3, 1)
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

-- ============================================================================
-- Tabla de Auditoría Inmutable de Usuarios y Pagos
-- ============================================================================
CREATE TABLE IF NOT EXISTS `user_audit_logs` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uuid` CHAR(36) NOT NULL UNIQUE,
  `order_id` BIGINT UNSIGNED NULL,
  `order_uuid` CHAR(36) NULL,
  `customer_phone` VARCHAR(30) NULL,
  `customer_name` VARCHAR(150) NULL,
  `action` VARCHAR(60) NOT NULL,
  `actor_type` ENUM('customer', 'system', 'admin') NOT NULL DEFAULT 'customer',
  `ip_address` VARCHAR(45) NOT NULL DEFAULT '',
  `user_agent` VARCHAR(500) NOT NULL DEFAULT '',
  `previous_status` VARCHAR(50) NULL,
  `new_status` VARCHAR(50) NULL,
  `amount` DECIMAL(10, 2) NULL,
  `currency` VARCHAR(10) NULL,
  `details` JSON NULL,
  `created_at` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `idx_ual_order_id` (`order_id`),
  INDEX `idx_ual_order_uuid` (`order_uuid`),
  INDEX `idx_ual_customer_phone` (`customer_phone`),
  INDEX `idx_ual_action` (`action`),
  INDEX `idx_ual_created_at` (`created_at`),
  CONSTRAINT `fk_ual_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

