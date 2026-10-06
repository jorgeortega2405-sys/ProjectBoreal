-- ============================================================================
-- Project Boreal - Migración: Agregar columna `prize_amount` a tabla `giveaways`
-- Archivo: database/migrate_add_giveaway_prize_amount.sql
-- Dominio: Almacenamiento del premio liquidado en sorteos diarios 50/50 y estándar
-- ============================================================================

USE `db_lottery`;

SET @exist_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'db_lottery'
    AND TABLE_NAME = 'giveaways'
    AND COLUMN_NAME = 'prize_amount'
);

SET @sql := IF(
  @exist_col = 0,
  'ALTER TABLE `giveaways` ADD COLUMN `prize_amount` DECIMAL(12, 2) NULL DEFAULT NULL AFTER `winner_announced_at`',
  'SELECT "Columna prize_amount ya existe en giveaways" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
