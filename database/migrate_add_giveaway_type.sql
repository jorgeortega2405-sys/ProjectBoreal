-- ============================================================================
-- Project Boreal - Migración: Agregar columna `type` a tabla `giveaways`
-- Archivo: database/migrate_add_giveaway_type.sql
-- Dominio: Sorteos Diarios (Daily) y Sorteos Estándar (Standard)
-- ============================================================================

USE `db_lottery`;

SET @exist_col := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = 'db_lottery'
    AND TABLE_NAME = 'giveaways'
    AND COLUMN_NAME = 'type'
);

SET @sql := IF(
  @exist_col = 0,
  'ALTER TABLE `giveaways` ADD COLUMN `type` ENUM(\'standard\', \'daily\') NOT NULL DEFAULT \'standard\' AFTER `currency`, ADD INDEX `idx_giveaways_type_status` (`type`, `status`)',
  'SELECT "Columna type ya existe en giveaways" AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
