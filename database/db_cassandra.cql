-- ============================================================================
-- Project Boreal - Audit & Telemetry Schema (Apache Cassandra CQL)
-- Archivo: database/db_cassandra.cql
-- Dominio: Auditoría Inmutable, Logs de Transacciones y Trazabilidad Forense
-- ============================================================================

-- 1. Creación del Keyspace
CREATE KEYSPACE IF NOT EXISTS boreal_audit
  WITH replication = {
    'class': 'SimpleStrategy',
    'replication_factor': 1
  }
  AND durable_writes = true;

USE boreal_audit;

-- ============================================================================
-- Tabla 1: Registro Maestro de Auditoría por UUID
-- Uso: Búsqueda directa por UUID del evento de auditoría
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  uuid text,
  id timeuuid,
  order_id bigint,
  order_uuid text,
  customer_phone text,
  customer_name text,
  action text,
  actor_type text,
  ip_address text,
  user_agent text,
  previous_status text,
  new_status text,
  amount decimal,
  currency text,
  details text,
  created_at timestamp,
  PRIMARY KEY (uuid)
);

-- ============================================================================
-- Tabla 2: Trazabilidad de Auditoría por Orden
-- Uso: getOrderAuditTrail(orderUuid) - Consulta cronológica instantánea
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs_by_order (
  order_uuid text,
  created_at timestamp,
  id timeuuid,
  uuid text,
  order_id bigint,
  customer_phone text,
  customer_name text,
  action text,
  actor_type text,
  ip_address text,
  user_agent text,
  previous_status text,
  new_status text,
  amount decimal,
  currency text,
  details text,
  PRIMARY KEY ((order_uuid), created_at, id)
) WITH CLUSTERING ORDER BY (created_at DESC, id DESC);

-- ============================================================================
-- Tabla 3: Historial de Auditoría por Teléfono de Cliente
-- Uso: getCustomerAuditHistory(phone) - Línea de tiempo de compras y reservas
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs_by_customer (
  customer_phone text,
  created_at timestamp,
  id timeuuid,
  uuid text,
  order_id bigint,
  order_uuid text,
  customer_name text,
  action text,
  actor_type text,
  ip_address text,
  user_agent text,
  previous_status text,
  new_status text,
  amount decimal,
  currency text,
  details text,
  PRIMARY KEY ((customer_phone), created_at, id)
) WITH CLUSTERING ORDER BY (created_at DESC, id DESC);

-- ============================================================================
-- Tabla 4: Bitácora Cronológica Mensual (Admin Timeline)
-- Uso: Panel de administración para paginación y revisión por períodos
-- Clave de partición 'bucket_month' con formato 'YYYY-MM' (ej. '2026-10')
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs_timeline (
  bucket_month text,
  created_at timestamp,
  id timeuuid,
  uuid text,
  order_id bigint,
  order_uuid text,
  customer_phone text,
  customer_name text,
  action text,
  actor_type text,
  ip_address text,
  user_agent text,
  previous_status text,
  new_status text,
  amount decimal,
  currency text,
  details text,
  PRIMARY KEY ((bucket_month), created_at, id)
) WITH CLUSTERING ORDER BY (created_at DESC, id DESC);
