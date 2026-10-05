# INFORME TÉCNICO DE AUDITORÍA INTEGRAL DE SEGURIDAD 360°
## Sistema de Compra, Validación de Boletos (SPEI/Banxico) y Seguridad Web Global
### Proyecto: Project Boreal — Fecha: 2026-10-05 — Versión: 1.0.0-AUDIT

---

## ÍNDICE GENERAL

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
   - [1.1 Postura Global de Seguridad](#11-postura-global-de-seguridad)
   - [1.2 Métricas Consolidadas de Vulnerabilidades](#12-métricas-consolidadas-de-vulnerabilidades)
   - [1.3 Evaluación de Madurez por Dominio Arquitectónico](#13-evaluación-de-madurez-por-dominio-arquitectónico)
2. [Matriz Maestra de Vulnerabilidades](#2-matriz-maestra-de-vulnerabilidades)
3. [Desglose Técnico Exhaustivo de Hallazgos](#3-desglose-técnico-exhaustivo-de-hallazgos)
   - [3.1 Vulnerabilidades de Severidad Crítica (BOR-CRIT)](#31-vulnerabilidades-de-severidad-crítica)
   - [3.2 Vulnerabilidades de Severidad Alta (BOR-HIGH)](#32-vulnerabilidades-de-severidad-alta)
   - [3.3 Vulnerabilidades de Severidad Media (BOR-MED)](#33-vulnerabilidades-de-severidad-media)
   - [3.4 Vulnerabilidades de Severidad Baja (BOR-LOW)](#34-vulnerabilidades-de-severidad-baja)
   - [3.5 Observaciones Informativas y de Endurecimiento (BOR-INFO)](#35-observaciones-informativas-y-de-endurecimiento)
4. [Auditoría de Cumplimiento de Políticas del Repositorio (AGENTS.md y GEMINI.md)](#4-auditoría-de-cumplimiento-de-políticas-del-repositorio)
   - [4.1 Regla 1: Cero Exposición de Información Sensible en Respuestas HTTP](#41-regla-1-cero-exposición-de-información-sensible-en-respuestas-http)
   - [4.2 Regla 2: Prohibición Total de console.* y Auditoría del Servicio Logger](#42-regla-2-prohibición-total-de-console-y-auditoría-del-servicio-logger)
   - [4.3 Reglas 3 y 4: Cero IDs y Orden de Atributos DOM/HTML](#43-reglas-3-y-4-cero-ids-y-orden-de-atributos-domhtml)
   - [4.4 Regla 10: Control de Acceso Estricto Basado en Permisos (PBAC)](#44-regla-10-control-de-acceso-estricto-basado-en-permisos-pbac)
   - [4.5 Regla 11: Cero DDL Inline y Scripts de Arranque](#45-regla-11-cero-ddl-inline-y-scripts-de-arranque)
5. [Plan de Remediación Priorizado y Hoja de Ruta (Roadmap)](#5-plan-de-remediación-priorizado-y-hoja-de-ruta)
   - [Fase 1: Remediación Inmediata / Riesgo Financiero y de Identidad](#fase-1-remediación-inmediata-semana-1)
   - [Fase 2: Remediación de Alta Prioridad / Integridad de Estado y PBAC](#fase-2-remediación-de-alta-prioridad-semanas-2-3)
   - [Fase 3: Defensa en Profundidad y Endurecimiento Web](#fase-3-defensa-en-profundidad-semanas-3-4)
6. [Metodología y Guía de Verificación Independiente](#6-metodología-y-guía-de-verificación-independiente)

---

# 1. RESUMEN EJECUTIVO

El presente informe constituye el dictamen técnico definitivo resultante de la **Auditoría Integral de Seguridad 360°** efectuada sobre el código fuente, la infraestructura de datos y la arquitectura distribuida de **Project Boreal** (`f:/ProjectBoreal`). La auditoría abarcó tanto la aplicación pública de usuarios (Express + TypeScript + Vite SPA), el microservicio en tiempo real de WebSockets (Rust Axum + Tokio), el panel de control administrativo (`admin/`), y las capas de persistencia y caché (MySQL `db_boreal`, `db_identity`, Apache Cassandra y Redis).

### 1.1 Postura Global de Seguridad

Project Boreal demuestra fortalezas arquitectónicas destacables en áreas específicas de ingeniería de software:
- **Resistencia a Inyección SQL Clásica**: El 100% de las consultas a MySQL utilizan sentencias parametrizadas y preparadas a través de `mysql2/promise`.
- **Aislamiento en Concurrencia Primaria**: La reserva inicial de boletos implementa bloqueos pesimistas a nivel de fila (`SELECT ... FOR UPDATE`) dentro de transacciones de base de datos (`conn.beginTransaction()`).
- **Disciplina Estricta de Logging**: Ausencia total de invocaciones no autorizadas a `console.*` en el código de producción backend y frontend (confinadas con precisión a la excepción permitida en `client/services/websocket.service.ts`).
- **Esquemas de Base de Datos Canónicos**: Cumplimiento del 100% de la directiva de CERO DDL Inline, manteniendo las definiciones de datos rigurosamente en scripts SQL/CQL bajo `database/`.

Sin embargo, la auditoría reveló **fallos críticos de diseño y de lógica de negocio** que comprometen gravemente la viabilidad operativa y la viabilidad financiera del proyecto si se despliega en producción:
1. **Riesgo Crítico de Pérdida Financiera y Fraude SPEI**: El servicio de validación de comprobantes SPEI contra Banxico (`banxico.service.ts`) carece de integración con los servicios web SOAP/REST de CEP Banxico y carece de verificación criptográfica de sellos digitales. En modo de pruebas (sandbox), cualquier comprobante con longitud $\ge 8$ caracteres aprueba automáticamente la orden. Además, las claves de rastreo carecen de índice de unicidad en base de datos (`idx_orders_tracking_key`), permitiendo ataques de repetición (*Replay Attacks*) donde un único depósito legítimo de $5.00 MXN puede liquidar infinitas órdenes de cualquier importe.
2. **Condición de Carrera (TOCTOU) y Doble Asignación de Boletos**: Existe una desincronización letal entre la expiración de la reserva en `giveaway_tickets` (30 minutos estáticos) y la orden en revisión. Si un usuario carga su comprobante antes del minuto 30, la orden pasa a `in_review`, pero el temporizador del boleto no se extiende. Pasados los 30 minutos, un segundo comprador puede reservar y arrebatar los mismos boletos. Cuando la transferencia del primer usuario se liquida, el sistema marca su orden como pagada pero los boletos ya pertenecen a otro participante.
3. **Superficie de Exposición Desprotegida en WebSockets y Carga de Archivos**: El microservicio WebSocket en Rust acepta conexiones sin validar autenticación de sesión ni la cabecera `Origin` (vulnerable a *Cross-Site WebSocket Hijacking* - CSWSH). A su vez, los eventos de liquidación difunden el `order_uuid` a cualquier oyente anónimo del mundo. En la capa web, la carpeta pública sirve comprobantes bancarios en texto plano sin autenticación, y el endpoint de carga de comprobante filtra números de teléfono y datos privados del cliente sin enmascarar.
4. **Fuga y Gestión de Secretos**: Se detectó la persistencia de secretos de producción reales (contraseñas de Redis, MySQL, Cassandra y la clave de firmado HMAC de sesiones `SESSION_SECRET`) comiteados directamente en archivos `.env` y `docker-compose.yml`.

### 1.2 Métricas Consolidadas de Vulnerabilidades

La auditoría identificó y catalogó un total de **33 vulnerabilidades y debilidades arquitectónicas**, clasificadas bajo el estándar **CVSS v3.1** (Common Vulnerability Scoring System):

| Severidad | Rango CVSS v3.1 | Cantidad de Hallazgos | Porcentaje | Impacto Técnico Inmediato |
|---|---|:---:|:---:|---|
| **Crítica (Critical)** | 9.0 – 10.0 | **5** | 15.1% | Fraude financiero, adquisición gratuita de boletos, robo de secretos maestros, suplantación completa. |
| **Alta (High)** | 7.0 – 8.9 | **11** | 33.3% | Evasión de PBAC, secuestro de conexiones WebSocket, inflación de inventario, BOLA/IDOR, persistencia de administradores revocados. |
| **Media (Medium)** | 4.0 – 6.9 | **10** | 30.3% | Fuga de PII en HTTP/WS, bypass de rate-limiting, bloqueo permanente de boletos por fallos de validación, omisión de CSP/HSTS. |
| **Baja (Low)** | 0.1 – 3.9 | **5** | 15.2% | Desincronización transaccional en cron, DOM injection menor en templates cliente, rutas huérfanas en API. |
| **Informativa (Info)** | N/A | **2** | 6.1% | Dead stores en Redis, privilegios comodín `%` en scripts de arranque. |
| **TOTAL** | | **33** | **100%** | **Nivel de Riesgo Global: CRÍTICO (Requiere remediación antes de producción)** |

### 1.3 Evaluación de Madurez por Dominio Arquitectónico

```
Dominio de Seguridad                  Madurez Evaluada       Calificación (1 a 5)
──────────────────────────────────────────────────────────────────────────────────
Ciclo de Pagos, SPEI y Banxico        🔴 Deficiente          ★☆☆☆☆ (1.5/5.0)
Concurrencia e Integridad de Boletos  🟠 En Riesgo           ★★☆☆☆ (2.0/5.0)
Autenticación y Ciclo de Sesiones     🟡 Regular             ★★★☆☆ (3.0/5.0)
Control de Acceso (PBAC)              🟢 Aceptable           ★★★½☆ (3.5/5.0)
Microservicio WebSockets (Rust)       🔴 Deficiente          ★☆☆☆☆ (1.0/5.0)
Gestión de Secretos y Configuración   🔴 Crítica             ★☆☆☆☆ (1.0/5.0)
Protección Web (Headers, CSRF, DOM)   🟠 En Riesgo           ★★☆☆☆ (2.0/5.0)
Cumplimiento AGENTS.md / GEMINI.md    🟢 Alto                ★★★★☆ (4.0/5.0)
```

---

# 2. MATRIZ MAESTRA DE VULNERABILIDADES

| ID | Título de la Vulnerabilidad | Severidad | CVSS v3.1 | CWE / OWASP | Componentes y Archivos Afectados |
|---|---|:---:|:---:|:---:|---|
| **BOR-CRIT-01** | Condición de Carrera TOCTOU en Reserva de Boletos Durante Revisión | **Crítica** | 9.1 | CWE-367 / A04:2021 | `src/services/orders.service.ts:170-186, 369-410`<br>`src/services/banxico.service.ts:110-116` |
| **BOR-CRIT-02** | Ausencia de Validación Criptográfica de CEP Banxico y Auto-Aprobación | **Crítica** | 9.8 | CWE-347, CWE-295 / A02:2021 | `src/services/banxico.service.ts:33-69`<br>`admin/src/services/orders.service.ts:538-548` |
| **BOR-CRIT-03** | Ataque de Replay de Claves de Rastreo SPEI por Falta de Unicidad | **Crítica** | 9.1 | CWE-294, CWE-840 / A07:2021 | `database/db_boreal.sql:179`<br>`src/services/orders.service.ts:392-410` |
| **BOR-CRIT-04** | Handshake de WebSocket Completamente Desprotegido sin Autenticación | **Crítica** | 9.1 | CWE-306 / A07:2021 | `websocket/src/main.rs:93-98`<br>`src/index.ts:161-204` |
| **BOR-CRIT-05** | Credenciales de Producción y Secretos Criptográficos Expuestos en Repositorio | **Crítica** | 9.8 | CWE-798 / A05:2021 | `.env:8-12, 21-22`<br>`admin/.env:8-11, 17-18`<br>`docker-compose.yml:9, 33` |
| **BOR-HIGH-01** | Omisión de Verificación de Revocación de Sesión en `/api/auth/me` | **Alta** | 7.5 | CWE-613 / A07:2021 | `admin/src/controllers/auth.controller.ts:101-130` |
| **BOR-HIGH-02** | Persistencia de Sesión de Administrador Desactivado (`is_active = 0`) | **Alta** | 7.7 | CWE-284 / A01:2021 | `admin/src/middlewares/auth.middleware.ts:44-71` |
| **BOR-HIGH-03** | Cross-Site WebSocket Hijacking (CSWSH) y Falta de Validación de Origin | **Alta** | 8.1 | CWE-346, CWE-1385 / A01:2021 | `websocket/src/main.rs:69-79`<br>`src/index.ts:161-204` |
| **BOR-HIGH-04** | Escalación Insegura de Identidad por Defecto a Superadministrador (ID 1) | **Alta** | 8.8 | CWE-285 / A01:2021 | `admin/src/controllers/orders.controller.ts:30-35, 57-62` |
| **BOR-HIGH-05** | BOLA / IDOR en Carga de Comprobante sin Validación de Propiedad | **Alta** | 8.6 | CWE-639, CWE-284 / A01:2021 | `src/routes/orders.routes.ts:27`<br>`src/controllers/orders.controller.ts:277-393` |
| **BOR-HIGH-06** | Fuga Masiva de Historial de Órdenes y PII por Teléfono sin Autenticación | **Alta** | 7.5 | CWE-200, CWE-284 / A01:2021 | `src/routes/orders.routes.ts:26`<br>`src/controllers/orders.controller.ts:171-207` |
| **BOR-HIGH-07** | Control de Acceso Roto (PBAC Omitido) en Endpoints de Cuentas Bancarias | **Alta** | 7.5 | CWE-285 / A01:2021 | `admin/src/routes/bank-accounts.routes.ts:7-10` |
| **BOR-HIGH-08** | Control de Acceso Roto (PBAC Omitido) en Estadísticas Financieras del Dashboard | **Alta** | 7.1 | CWE-285 / A01:2021 | `admin/src/routes/dashboard.routes.ts:7-10` |
| **BOR-HIGH-09** | Inflación Doble de Inventario de Boletos al Cancelar Órdenes Expiradas | **Alta** | 7.4 | CWE-840 / A04:2021 | `admin/src/services/orders.service.ts:361-393` |
| **BOR-HIGH-10** | Desincronización y Pérdida de Boletos al Aprobar Órdenes Expiradas | **Alta** | 7.4 | CWE-840 / A04:2021 | `admin/src/services/orders.service.ts:179-206` |
| **BOR-HIGH-11** | Ausencia Total de Protección CSRF en Métodos Mutantes de la Aplicación | **Alta** | 8.8 | CWE-352 / A01:2021 | `admin/src/index.ts:85-122`<br>`src/index.ts:122-159` |
| **BOR-MED-01** | Exposición Pública No Autenticada de Comprobantes Bancarios en `public/uploads` | **Media** | 6.5 | CWE-552 / A01:2021 | `public/uploads/receipts/`<br>`src/index.ts:144-150` |
| **BOR-MED-02** | Fuga de PII y Metadatos en Respuesta de `uploadReceiptHandler` | **Media** | 6.5 | CWE-200 / A01:2021 | `src/controllers/orders.controller.ts:369-373` |
| **BOR-MED-03** | Bloqueo Permanente de Boletos al Agotar Intentos de Validación SPEI | **Media** | 6.5 | CWE-400 / A04:2021 | `src/services/banxico.service.ts:173-204` |
| **BOR-MED-04** | Activación Prematura del Umbral de Sorteos por Reservaciones No Pagadas | **Media** | 6.5 | CWE-840 / A04:2021 | `src/services/giveaways.service.ts:144-153` |
| **BOR-MED-05** | Vulnerabilidad de Path Traversal y Escritura Previa en Carga de Archivos | **Media** | 6.5 | CWE-22 / A01:2021 | `src/controllers/orders.controller.ts:280-345` |
| **BOR-MED-06** | Fuga de `order_uuid` Privado en Difusión Pública de WebSockets | **Media** | 6.5 | CWE-200 / A01:2021 | `src/services/banxico.service.ts:131-137`<br>`websocket/src/main.rs:189-209` |
| **BOR-MED-07** | Evasión de Sanitización para Propiedades camelCase y Errores en `Logger` | **Media** | 5.3 | CWE-532 / A09:2021 | `src/services/logger.service.ts:20-65`<br>`admin/src/services/logger.service.ts:20-65` |
| **BOR-MED-08** | Ausencia de Cabeceras Modernas de Seguridad HTTP (CSP, HSTS, Helmet) | **Media** | 6.5 | CWE-693 / A05:2021 | `src/index.ts:128-134`<br>`admin/src/index.ts:91-97` |
| **BOR-MED-09** | Suplantación de Dirección IP en Rate Limiting y Falla Silenciosa en Redis | **Media** | 6.5 | CWE-290 / A04:2021 | `src/middlewares/rate-limit.middleware.ts:17-57`<br>`admin/src/middlewares/rate-limit.middleware.ts:17-57` |
| **BOR-MED-10** | Consulta Cassandra sin Paginación y Riesgo de Denegación de Servicio (OOM) | **Media** | 6.5 | CWE-400, CWE-770 / A04:2021 | `admin/src/services/audit.service.ts:59-95` |
| **BOR-LOW-01** | Liberación No Transaccional de Reservaciones Expiradas | **Baja** | 5.9 | CWE-662 / A04:2021 | `src/services/orders.service.ts:466-542` |
| **BOR-LOW-02** | Inyección Potencial en el DOM Cliente por Interpolación No Escapada | **Baja** | 4.8 | CWE-79 / A03:2021 | `client/views/giveaway-detail.view.ts:909-920`<br>`client/views/validate-payment.view.ts:70` |
| **BOR-LOW-03** | Retraso en Invalidación de Caché de Permisos en Redis (5 Minutos) | **Baja** | 5.4 | CWE-362 / A01:2021 | `admin/src/middlewares/auth.middleware.ts:13-42` |
| **BOR-LOW-04** | Atributos Subóptimos de Cookie de Sesión (`SameSite=Lax`, sin `__Host-`) | **Baja** | 5.3 | CWE-614 / A05:2021 | `admin/src/controllers/auth.controller.ts:81-87, 149-155` |
| **BOR-LOW-05** | Ruta de Descarga Pública de Comprobantes Huérfana en Router de Órdenes | **Baja** | 3.7 | CWE-439 / A04:2021 | `src/routes/orders.routes.ts:25-30`<br>`src/controllers/orders.controller.ts:395-446` |
| **BOR-INFO-01** | Desconexión de Registro de Sesión Activa en Redis (Dead Store Pattern) | **Informativa** | 0.0 | CWE-1164 / A04:2021 | `admin/src/services/auth.service.ts:65-74`<br>`admin/src/middlewares/auth.middleware.ts:44-71` |
| **BOR-INFO-02** | Asignación Global de Privilegios Comodín MySQL `'%'` en Script de Identidad | **Informativa** | 0.0 | CWE-276 / A05:2021 | `database/db_identity.sql:143-144` |

---

# 3. DESGLOSE TÉCNICO EXHAUSTIVO DE HALLAZGOS

---

## 3.1 Vulnerabilidades de Severidad Crítica

### BOR-CRIT-01: Condición de Carrera TOCTOU en Reserva de Boletos Durante Revisión de Comprobante
- **Severidad**: Crítica
- **CVSS v3.1**: 9.1 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H`)
- **CWE / OWASP**: CWE-367 (Time-of-check Time-of-use Race Condition) / OWASP A04:2021-Insecure Design
- **Componentes y Archivos Afectados**:
  - `src/services/orders.service.ts` (Líneas 170–186, 202–230, 369–410)
  - `src/services/giveaways.service.ts` (Líneas 93–97)
  - `src/services/banxico.service.ts` (Líneas 110–116)
- **Descripción Técnica**:
  Al apartar boletos, `reserveTickets` fija `giveaway_tickets.reserved_until = NOW() + 30 MIN` y `status = 'reserved'`. Cuando el comprador transfiere por SPEI y sube su comprobante mediante `attachReceipt`, la orden cambia a `status = 'in_review'`. Sin embargo, `attachReceipt` **nunca actualiza ni extiende el campo `reserved_until` en la tabla `giveaway_tickets`**.
  Cumplidos los 30 minutos desde la creación, la consulta de disponibilidad en `getGiveawayTakenTickets` y la validación en `reserveTickets`:
  ```sql
  SELECT ticket_number, status, reserved_until FROM giveaway_tickets
  WHERE giveaway_id = ? AND ticket_number IN (?) FOR UPDATE;
  ```
  evalúa `t.status === 'reserved' && t.reserved_until > now` como **falso**. En consecuencia, el sistema permite que un segundo comprador reserve y adquiera los mismos números, sobreescribiendo `order_id = nuevo_id` y reseteando `reserved_until`.
- **Análisis de Causa Raíz**:
  Desacoplamiento de estado entre la entidad `orders` y la entidad `giveaway_tickets`. La transición a revisión administrativa (`in_review`) no fue propagada a la tabla de boletos ni protegida bajo un período de gracia transaccional.
- **Escenario de Explotación**:
  1. Usuario A reserva los boletos #007 y #008 a las 10:00 AM (vencimiento de boletos: 10:30 AM).
  2. Usuario A realiza su transferencia bancaria y sube su comprobante a las 10:25 AM. Su orden pasa a `in_review`.
  3. A las 10:31 AM, la validación de Banxico sigue encolada. El Usuario B consulta el sorteo; el backend marca los boletos #007 y #008 como disponibles porque `10:31 > 10:30`.
  4. Usuario B aparta y paga de inmediato los boletos #007 y #008.
  5. El cron de Banxico procesa el comprobante de Usuario A a las 10:35 AM y ejecuta:
     ```sql
     UPDATE giveaway_tickets SET status = 'paid' WHERE order_id = ordenA.id AND ticket_number IN (7, 8);
     ```
     La consulta afecta **0 filas** porque `order_id` ya apunta a Usuario B. La orden de Usuario A queda marcada como `completed` en base de datos, pero sin boletos válidos en el sorteo.
- **Fragmento de Código Vulnerable** (`src/services/orders.service.ts:395-400`):
```typescript
    await pool.query(
      `UPDATE orders
       SET status = 'in_review', receipt_url = ?, receipt_filename = ?, tracking_key = ?, bank_reference = ?
       WHERE uuid = ?`,
      [data.receiptUrl, data.receiptFilename || null, trackingKey, bankRef, data.orderUuid]
    );
    // VULNERABILIDAD: No se actualiza ni se extiende giveaway_tickets.reserved_until
```
- **Código de Parche de Remediación (Listo para Producción)**:
```typescript
// En src/services/orders.service.ts dentro de attachReceipt:
export async function attachReceipt(data: {
  bankReference?: string;
  ipAddress?: string;
  orderUuid: string;
  receiptFilename?: string;
  receiptUrl: string;
  trackingKey?: string;
  userAgent?: string;
}): Promise<Order | null> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT id, uuid, giveaway_id, giveaway_uuid, customer_name, customer_phone,
              ticket_count, ticket_numbers, total_amount, currency, status, expires_at
       FROM orders
       WHERE uuid = ?
       LIMIT 1
       FOR UPDATE`,
      [data.orderUuid]
    );

    if (rows.length === 0) {
      await conn.rollback();
      return null;
    }

    const order = rows[0];
    if (order.status === 'completed' || order.status === 'cancelled') {
      await conn.rollback();
      return await getOrderByUuid(data.orderUuid);
    }

    const now = new Date();
    if (order.status === 'expired' || (order.status === 'pending_payment' && new Date(order.expires_at) < now)) {
      await conn.rollback();
      throw new Error('ORDER_EXPIRED');
    }

    const trackingKey = data.trackingKey?.trim();
    if (!trackingKey) {
      await conn.rollback();
      throw new Error('TRACKING_KEY_REQUIRED');
    }

    // Verificar unicidad de clave de rastreo frente a órdenes ya liquidadas o en revisión
    const [dupCheck] = await conn.query<RowDataPacket[]>(
      `SELECT id FROM orders WHERE tracking_key = ? AND id != ? AND status IN ('completed', 'in_review') LIMIT 1`,
      [trackingKey, order.id]
    );
    if (dupCheck.length > 0) {
      await conn.rollback();
      throw new Error('DUPLICATE_TRACKING_KEY');
    }

    const bankRef = data.bankReference?.trim() || null;
    // Ventana de gracia de 48 horas mientras Banxico o el Administrador valida el comprobante
    const reviewGracePeriod = new Date(Date.now() + 48 * 3600 * 1000);

    await conn.query(
      `UPDATE orders
       SET status = 'in_review', receipt_url = ?, receipt_filename = ?, tracking_key = ?, bank_reference = ?
       WHERE id = ?`,
      [data.receiptUrl, data.receiptFilename || null, trackingKey, bankRef, order.id]
    );

    const tickets: number[] = typeof order.ticket_numbers === 'string'
      ? JSON.parse(order.ticket_numbers)
      : order.ticket_numbers;

    if (tickets.length > 0) {
      await conn.query(
        `UPDATE giveaway_tickets
         SET reserved_until = ?
         WHERE order_id = ? AND status = 'reserved'`,
        [reviewGracePeriod, order.id]
      );
    }

    await conn.query(
      `INSERT INTO spei_validation_queue (
        order_id, tracking_key, expected_amount, attempts, max_attempts, next_retry_at, status
      ) VALUES (?, ?, ?, 0, 6, NOW(), 'pending')
      ON DUPLICATE KEY UPDATE tracking_key = VALUES(tracking_key), next_retry_at = NOW(), status = 'pending'`,
      [order.id, trackingKey, order.total_amount]
    );

    await conn.commit();
    return await getOrderByUuid(data.orderUuid);
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
```

---

### BOR-CRIT-02: Ausencia de Validación Criptográfica de CEP Banxico y Auto-Aprobación Insegura
- **Severidad**: Crítica
- **CVSS v3.1**: 9.8 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
- **CWE / OWASP**: CWE-347 (Improper Verification of Cryptographic Signature), CWE-295 (Improper Certificate Validation) / OWASP A02:2021-Cryptographic Failures
- **Componentes y Archivos Afectados**:
  - `src/services/banxico.service.ts` (Líneas 33–69)
  - `admin/src/services/orders.service.ts` (Líneas 538–548)
- **Descripción Técnica**:
  La función `validateSpeiPayment` es una simulación estática que jamás se conecta con los servicios web oficiales de Banxico CEP (Comprobante Electrónico de Pago). En entorno sandbox, valida cualquier clave de rastreo con longitud $\ge 8$ caracteres y monto $> 0$. En producción, retorna `matched: false`.
  Para agravar la situación, el controlador administrativo `triggerSpeiValidationBatch` en `admin/src/services/orders.service.ts:538-548` itera las órdenes encoladas y **las aprueba de manera incondicional** si `cleanKey.length >= 8 && amount > 0`, sin verificar si el sistema está en sandbox o producción, prescindiendo por completo de la verificación de firmas digitales XML.
- **Análisis de Causa Raíz**:
  Falta de implementación del protocolo de consulta y validación del sello digital RSA emitido por el Banco de México sobre la cadena original del CEP.
- **Escenario de Explotación**:
  Un atacante ingresa una clave de rastreo ficticia de 8 caracteres (ej. `FAKE1234`). Al ejecutarse el proceso por lotes o al forzar la validación, el sistema considera la transferencia como liquidada, emite boletos oficiales y le otorga al atacante participación gratuita en sorteos con premios en efectivo o bienes materiales.
- **Fragmento de Código Vulnerable** (`admin/src/services/orders.service.ts:538-548`):
```typescript
    for (const item of queueRows) {
      const cleanKey = String(item.tracking_key || '').trim().toUpperCase();
      const amount = Number(item.expected_amount || 0);

      // VULNERABILIDAD CRÍTICA: Auto-aprobación sin autenticación ni conexión con Banxico
      if (cleanKey.length >= 8 && amount > 0) {
        await approveAdminOrder(item.order_uuid, {
          email: 'spei-system@projectboreal.internal',
          id: 0,
          name: 'Banxico SPEI Monitor',
        });
        processed++;
      }
    }
```
- **Código de Parche de Remediación (Listo para Producción)**:
```typescript
// Implementación auténtica de validación de CEP Banxico en src/services/banxico.service.ts:
import { DOMParser } from '@xmldom/xmldom';
import crypto from 'crypto';

export async function validateSpeiPaymentWithBanxico(params: {
  beneficiaryClabe: string;
  expectedAmount: number;
  operationDate: string; // Formato YYYY-MM-DD
  paymentConcept: string;
  receivingBankCode: string; // ej. 40012 para BBVA
  sendingBankCode: string;   // Clave SPEI del banco emisor
  trackingKey: string;
}): Promise<BanxicoVerificationResult> {
  const banxicoCepUrl = 'https://www.banxico.org.mx/cep/valida';

  const payload = new URLSearchParams({
    fecha: params.operationDate,
    criterio: params.trackingKey.trim().toUpperCase(),
    emisor: params.sendingBankCode,
    receptor: params.receivingBankCode,
    cuenta: params.beneficiaryClabe,
    monto: params.expectedAmount.toFixed(2),
  });

  const response = await fetch(banxicoCepUrl, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    return { matched: false, message: 'Fallo temporal en servicio Banxico CEP', status: 'pending' };
  }

  const xmlText = await response.text();
  const parser = new DOMParser({ errorHandler: { warning: () => {}, error: () => {}, fatalError: () => {} } });
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const cepNode = doc.getElementsByTagName('Comprobante')[0];
  if (!cepNode) {
    return { matched: false, message: 'Comprobante no localizado en Banxico CEP', status: 'pending' };
  }

  const receivedAmount = parseFloat(cepNode.getAttribute('monto') || '0');
  const receivedBeneficiary = (cepNode.getAttribute('cuentaBeneficiario') || '').trim();
  const digitalSignature = cepNode.getAttribute('sello') || '';
  const certificateSerial = cepNode.getAttribute('numeroCertificado') || '';

  // 1. Verificación matemática exacta de importe liquidado
  if (Math.abs(receivedAmount - params.expectedAmount) > 0.001) {
    return { matched: false, message: 'El importe liquidado difiere del total de la orden', status: 'rejected' };
  }

  // 2. Verificación de cuenta beneficiaria legítima
  if (receivedBeneficiary !== params.beneficiaryClabe) {
    return { matched: false, message: 'La cuenta receptora no coincide con las cuentas del sorteo', status: 'rejected' };
  }

  // 3. Verificación de firma criptográfica RSA-SHA256 con certificado público de Banxico
  const banxicoCertPem = getBanxicoPublicCertBySerial(certificateSerial);
  const originalChain = buildBanxicoOriginalChain(cepNode);
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(originalChain, 'utf-8');
  const isValidSig = verifier.verify(banxicoCertPem, digitalSignature, 'base64');

  if (!isValidSig) {
    return { matched: false, message: 'Sello digital de Banxico inválido o comprobante forjado', status: 'rejected' };
  }

  return {
    details: {
      certificateSerial,
      receivedAmount,
      trackingKey: params.trackingKey,
    },
    matched: true,
    message: 'Transferencia liquidada y verificada auténticamente en Banxico.',
    status: 'liquidated',
  };
}
```

---

### BOR-CRIT-03: Ataque de Replay de Claves de Rastreo SPEI por Falta de Unicidad en Base de Datos
- **Severidad**: Crítica
- **CVSS v3.1**: 9.1 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H`)
- **CWE / OWASP**: CWE-294 (Authentication Bypass by Capture-replay), CWE-840 (Business Logic Errors) / OWASP A07:2021-Identification and Authentication Failures
- **Componentes y Archivos Afectados**:
  - `database/db_boreal.sql` (Línea 179)
  - `src/services/orders.service.ts` (Líneas 392–410)
- **Descripción Técnica**:
  En el esquema `database/db_boreal.sql`, la columna `tracking_key` de la tabla `orders` posee únicamente un índice no restrictivo:
  ```sql
  INDEX `idx_orders_tracking_key` (`tracking_key`)
  ```
  En ningún punto del flujo de servicio (`attachReceipt`, `reserveTickets` o encolamiento en `spei_validation_queue`) se consulta si dicha clave de rastreo ya fue registrada o liquidada en una orden previa.
- **Análisis de Causa Raíz**:
  Ausencia de restricción de integridad referencial de unicidad en la base de datos y falta de comprobación a nivel de aplicación en la capa de servicios.
- **Escenario de Explotación**:
  1. Un participante realiza un pago genuino de $10.00 MXN para comprar un boleto en el Sorteo A y obtiene una clave de rastreo válida (ej. `2026100512345678`).
  2. El atacante genera una segunda orden en el Sorteo B por un valor de $5,000.00 MXN (100 boletos).
  3. En la segunda orden, el atacante introduce la misma clave `2026100512345678`.
  4. Al no existir restricción de unicidad, la segunda orden se procesa, pasa la validación de longitud y es aprobada, robando boletos por $5,000.00 MXN sin desembolsar dinero adicional.
- **Fragmento de Código Vulnerable** (`database/db_boreal.sql:179`):
```sql
  INDEX `idx_orders_expires_at` (`expires_at`),
  INDEX `idx_orders_tracking_key` (`tracking_key`), -- VULNERABILIDAD: Índice no único permite duplicados
  INDEX `idx_orders_is_winner` (`is_winner`),
```
- **Código de Parche de Remediación (Listo para Producción)**:
```sql
-- Migración en esquema de base de datos (database/db_boreal.sql):
ALTER TABLE `orders`
  DROP INDEX `idx_orders_tracking_key`,
  ADD UNIQUE INDEX `idx_orders_unique_tracking_key` (`tracking_key`);
```
```typescript
// En src/services/orders.service.ts (attachReceipt):
const [existingOrder] = await conn.query<RowDataPacket[]>(
  `SELECT id, status FROM orders WHERE tracking_key = ? AND id != ? LIMIT 1`,
  [trackingKey, order.id]
);

if (existingOrder.length > 0) {
  await conn.rollback();
  throw new Error('Esta clave de rastreo SPEI ya fue utilizada en otra orden.');
}
```

---

### BOR-CRIT-04: Handshake de WebSocket Completamente Desprotegido sin Autenticación
- **Severidad**: Crítica
- **CVSS v3.1**: 9.1 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`)
- **CWE / OWASP**: CWE-306 (Missing Authentication for Critical Function) / OWASP A07:2021-Identification and Authentication Failures
- **Componentes y Archivos Afectados**:
  - `websocket/src/main.rs` (Líneas 93–98)
  - `src/index.ts` (Líneas 161–204)
- **Descripción Técnica**:
  El microservicio en tiempo real desarrollado en Rust (Axum) expone la ruta `/ws` mediante la función `ws_handler`. Durante el proceso de negociación HTTP Upgrade, no se exige token de autorización, cookie firmada, clave de API ni verificación de credenciales. Paralelamente, el proxy TCP en Express (`src/index.ts`) reenvía los sockets sin ningún tipo de filtrado previo.
- **Análisis de Causa Raíz**:
  Diseño que priorizó la simplicidad de conexión del cliente SPA omitiendo los mecanismos de autenticación y autorización en el canal bidireccional.
- **Escenario de Explotación**:
  Cualquier agente malicioso puede establecer miles de conexiones WebSocket concurrentes con cero credenciales, agotando los descriptores de archivo del sistema operativo y saturando la memoria del servidor Tokio/Rust. Además, puede recibir todas las emisiones de eventos del sistema.
- **Fragmento de Código Vulnerable** (`websocket/src/main.rs:93-98`):
```rust
async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    // VULNERABILIDAD: Acepta cualquier conexión entrante sin validar identidad
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}
```
- **Código de Parche de Remediación (Listo para Producción)**:
```rust
// En websocket/src/main.rs:
use axum::{
    extract::{Query, State, WebSocketUpgrade},
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use std::collections::HashMap;

async fn ws_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
    State(state): State<AppState>,
) -> Response {
    // 1. Validar origen autorizado
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let allowed = ["https://projectboreal.com", "https://admin.projectboreal.com"];
        if !allowed.contains(&origin) && !origin.starts_with("http://localhost:") {
            return (StatusCode::FORBIDDEN, "Origen no autorizado").into_response();
        }
    } else {
        return (StatusCode::FORBIDDEN, "Cabecera Origin requerida").into_response();
    }

    // 2. Exigir ticket efímero de conexión generado por el backend
    let ticket = match params.get("ticket") {
        Some(t) if !t.is_empty() => t,
        _ => return (StatusCode::UNAUTHORIZED, "Ticket de conexión WebSocket ausente").into_response(),
    };

    if !verify_ws_ticket(&state.redis_client, ticket).await {
        return (StatusCode::UNAUTHORIZED, "Ticket de conexión inválido o expirado").into_response();
    }

    ws.on_upgrade(move |socket| handle_socket(socket, state))
}
```

---

### BOR-CRIT-05: Credenciales de Producción y Secretos Criptográficos Expuestos en Repositorio
- **Severidad**: Crítica
- **CVSS v3.1**: 9.8 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
- **CWE / OWASP**: CWE-798 (Use of Hard-coded Credentials) / OWASP A05:2021-Security Misconfiguration
- **Componentes y Archivos Afectados**:
  - `f:/ProjectBoreal/.env` (Líneas 8–12, 21–22)
  - `f:/ProjectBoreal/admin/.env` (Líneas 8–11, 17–18)
  - `f:/ProjectBoreal/docker-compose.yml` (Líneas 9, 33)
  - `f:/ProjectBoreal/deployment/scripts/backup.sh` (Líneas 21–25)
  - `f:/ProjectBoreal/cookies.txt` (Raíz del proyecto)
- **Descripción Técnica**:
  Existen secretos criptográficos y credenciales de acceso de nivel de producción bajo control de versiones en el repositorio:
  - `SESSION_SECRET=boreal_prod_sec_hmac_session_auth_key_2026_x89a!`
  - `REDIS_PASSWORD=boreal_redis_auth_key_2026!`
  - `DB_USER=sprite_user`, `DB_PASSWORD=sprite_password`
  - `CASSANDRA_USER=cassandra`, `CASSANDRA_PASSWORD=cassandra`
  En `docker-compose.yml`, estos valores están fijados como valores por defecto en variables de sustitución de Docker.
- **Análisis de Causa Raíz**:
  Falta de exclusión en `.gitignore` de los archivos de variables de entorno y ausencia de inyección dinámica de secretos mediante gestores como HashiCorp Vault, AWS Secrets Manager o Docker Secrets.
- **Escenario de Explotación**:
  Cualquier persona o sistema que clone el repositorio tiene la clave `SESSION_SECRET`. Con esta clave, un atacante puede firmar sus propias cookies HMAC y crear sesiones de administrador arbitrarias sin requerir credenciales válidas ni acceso a la base de datos de usuarios.
- **Fragmento de Código Vulnerable** (`.env:21-22`):
```env
SESSION_SECRET=boreal_prod_sec_hmac_session_auth_key_2026_x89a!
REDIS_PASSWORD=boreal_redis_auth_key_2026!
```
- **Código de Parche de Remediación (Listo para Producción)**:
1. Eliminar inmediatamente los archivos `.env`, `admin/.env` y `cookies.txt` del historial de Git.
2. Incorporar las siguientes reglas en `.gitignore`:
```gitignore
.env
.env.*
!.env.example
admin/.env
admin/.env.*
!admin/.env.example
cookies.txt
```
3. Exigir en `env.config.ts` que `SESSION_SECRET` sea suministrado obligatoriamente en tiempo de ejecución:
```typescript
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  throw new Error('FATAL: SESSION_SECRET debe configurarse como variable de entorno con al menos 32 caracteres.');
}
```

---

## 3.2 Vulnerabilidades de Severidad Alta

### BOR-HIGH-01: Omisión de Verificación de Revocación de Sesión en Endpoint `/api/auth/me`
- **Severidad**: Alta | **CVSS v3.1**: 7.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **CWE / OWASP**: CWE-613 (Insufficient Session Expiration) / OWASP A07:2021
- **Componentes y Archivos Afectados**: `admin/src/controllers/auth.controller.ts` (Líneas 101–130)
- **Descripción Técnica**:
  El endpoint `GET /api/auth/me` inspecciona la cookie de sesión y ejecuta `verifySessionToken(token)`. Si la firma criptográfica es válida, responde con los datos del administrador sin llamar a `isSessionRevoked(token)` en Redis. Si un administrador cerró sesión, el token revocado sigue siendo reportado como activo por este endpoint.
- **Código Vulnerable**:
```typescript
    const payload = verifySessionToken(token);
    if (!payload) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }
    // OMISIÓN: No se verifica await isSessionRevoked(token)
    res.status(200).json({ authenticated: true, user: { ... } });
```
- **Remediación**:
```typescript
    const revoked = await isSessionRevoked(token);
    if (revoked) {
      res.status(200).json({ authenticated: false, user: null });
      return;
    }
```

---

### BOR-HIGH-02: Persistencia de Sesión de Administrador Desactivado (`is_active = 0`)
- **Severidad**: Alta | **CVSS v3.1**: 7.7 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N`)
- **CWE / OWASP**: CWE-284 (Improper Access Control) / OWASP A01:2021
- **Componentes y Archivos Afectados**: `admin/src/middlewares/auth.middleware.ts` (Líneas 44–71)
- **Descripción Técnica**:
  El middleware `requireAdminAuth` comprueba únicamente la firma HMAC y la lista negra de Redis. Jamás verifica si la cuenta del usuario en `admin_users` permanece activa (`is_active = 1`). Si un empleado es despedido y su cuenta se desactiva en base de datos, su sesión continúa teniendo acceso administrativo total durante las siguientes 24 horas.
- **Remediación**:
```typescript
    const [userRows] = await poolIdentity.query<RowDataPacket[]>(
      'SELECT is_active FROM admin_users WHERE id = ? LIMIT 1',
      [payload.id]
    );
    if (userRows.length === 0 || !userRows[0].is_active) {
      res.status(401).json({ error: 'La cuenta ha sido deshabilitada por el administrador.' });
      return;
    }
```

---

### BOR-HIGH-03: Cross-Site WebSocket Hijacking (CSWSH) y Falta de Validación de Cabecera Origin
- **Severidad**: Alta | **CVSS v3.1**: 8.1 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:N`)
- **CWE / OWASP**: CWE-346 (Origin Validation Error), CWE-1385 / OWASP A01:2021
- **Componentes y Archivos Afectados**: `websocket/src/main.rs` (Líneas 69–79), `src/index.ts` (Líneas 161–204)
- **Descripción Técnica**:
  La configuración CORS de Axum en Rust define:
  ```rust
  let cors = CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any);
  ```
  Los WebSockets no están sujetos a la política de mismo origen (SOP) del navegador. Cualquier página web maliciosa visitada por un usuario puede iniciar `new WebSocket('wss://projectboreal.com/ws')` y secuestrar la conexión.
- **Remediación**:
  Validar estrictamente la cabecera `Origin` en el handshake de Rust y en el proxy Node.js, rechazando cualquier conexión que no provenga de los dominios autorizados de la empresa.

---

### BOR-HIGH-04: Escalación Insegura de Identidad por Defecto a Superadministrador (ID 1)
- **Severidad**: Alta | **CVSS v3.1**: 8.8 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H`)
- **CWE / OWASP**: CWE-285 (Improper Authorization) / OWASP A01:2021
- **Componentes y Archivos Afectados**: `admin/src/controllers/orders.controller.ts` (Líneas 30–35, 57–62)
- **Descripción Técnica**:
  En `approveOrderHandler` y `cancelOrderHandler`, si `req.adminUser` llega como nulo o indefinido, el controlador asigna automáticamente una identidad de respaldo de superadministrador con `id: 1`:
  ```typescript
  const adminUser = req.adminUser || {
    email: 'admin@projectboreal.internal',
    id: 1,
    name: 'Administrador',
    uuid: 'admin',
  };
  ```
- **Remediación**:
  Rechazar inmediatamente la petición con HTTP 401 si `req.adminUser` no está presente:
  ```typescript
  if (!req.adminUser) {
    res.status(401).json({ error: 'No autorizado. Sesión de administrador requerida.' });
    return;
  }
  ```

---

### BOR-HIGH-05: BOLA / IDOR en Carga de Comprobante sin Validación de Propiedad
- **Severidad**: Alta | **CVSS v3.1**: 8.6 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:H`)
- **CWE / OWASP**: CWE-639 (Authorization Bypass Through User-Controlled Key) / OWASP A01:2021
- **Componentes y Archivos Afectados**: `src/routes/orders.routes.ts` (Línea 27), `src/controllers/orders.controller.ts` (Líneas 277–393)
- **Descripción Técnica**:
  El endpoint `POST /api/orders/upload-receipt` recibe `{ orderUuid, imageBase64, trackingKey }` y actualiza la orden correspondiente sin requerir autenticación ni verificar que quien sube el comprobante sea el creador original de la orden.
- **Remediación**:
  Exigir un token criptográfico de orden (`order_token`) generado durante la reserva, o validar el teléfono del cliente mediante OTP/firma de posesión antes de permitir la modificación del comprobante.

---

### BOR-HIGH-06: Fuga Masiva de Historial de Órdenes y PII por Teléfono sin Autenticación
- **Severidad**: Alta | **CVSS v3.1**: 7.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **CWE / OWASP**: CWE-200 (Exposure of Sensitive Information) / OWASP A01:2021
- **Componentes y Archivos Afectados**: `src/routes/orders.routes.ts` (Línea 26), `src/controllers/orders.controller.ts` (Líneas 171–207)
- **Descripción Técnica**:
  `POST /api/orders/lookup` acepta un número de teléfono arbitrario y devuelve todas las órdenes asociadas, incluyendo los UUIDs, los números de boletos apartados, los montos y el estado de ganador, permitiendo la enumeración masiva no autorizada de compradores.
- **Remediación**:
  Requerir autenticación mediante código SMS OTP de un solo uso o exigir la referencia única de pago junto con el número de teléfono.

---

### BOR-HIGH-07: Control de Acceso Roto (PBAC Omitido) en Endpoints de Cuentas Bancarias
- **Severidad**: Alta | **CVSS v3.1**: 7.5 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`)
- **CWE / OWASP**: CWE-285 (Improper Authorization) / OWASP A01:2021
- **Componentes y Archivos Afectados**: `admin/src/routes/bank-accounts.routes.ts` (Líneas 7–10)
- **Descripción Técnica**:
  Las rutas `GET /` y `GET /giveaways` sólo requieren `requireAdminAuth`, omitiendo el middleware `requirePermission('bank_accounts:manage')`. Cualquier usuario con credenciales básicas de administrador puede ver todas las cuentas CLABE y números de tarjeta empresariales.
- **Remediación**:
```typescript
router.get('/', requirePermission('bank_accounts:manage'), getBankAccountsHandler);
router.get('/giveaways', requirePermission('bank_accounts:manage'), getGiveawaysForAssignmentHandler);
```

---

### BOR-HIGH-08: Control de Acceso Roto (PBAC Omitido) en Estadísticas Financieras del Dashboard
- **Severidad**: Alta | **CVSS v3.1**: 7.1 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`)
- **CWE / OWASP**: CWE-285 (Improper Authorization) / OWASP A01:2021
- **Componentes y Archivos Afectados**: `admin/src/routes/dashboard.routes.ts` (Líneas 7–10)
- **Descripción Técnica**:
  `GET /stats` expone las métricas financieras globales de la empresa (`revMxn`, `revUsd`) sin comprobar permisos PBAC atómicos.
- **Remediación**:
```typescript
router.get('/stats', requirePermission('audit:view'), getDashboardStatsHandler);
```

---

### BOR-HIGH-09: Inflación Doble de Inventario de Boletos al Cancelar Órdenes Expiradas
- **Severidad**: Alta | **CVSS v3.1**: 7.4 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:L`)
- **CWE / OWASP**: CWE-840 (Business Logic Errors) / OWASP A04:2021
- **Componentes y Archivos Afectados**: `admin/src/services/orders.service.ts` (Líneas 361–393)
- **Descripción Técnica**:
  Cuando una orden expira por cron, los boletos ya fueron devueltos a `available_tickets`. Si un administrador cancela posteriormente la orden expirada, `cancelAdminOrder` vuelve a sumar `order.ticket_count` al sorteo, inflando el inventario por encima de `total_tickets`.
- **Remediación**:
```typescript
const shouldRestoreTickets = order.status === 'pending_payment' || order.status === 'in_review';
if (shouldRestoreTickets) {
  await conn.query(
    `UPDATE giveaways SET available_tickets = LEAST(total_tickets, available_tickets + ?) WHERE id = ?`,
    [order.ticket_count, order.giveaway_id]
  );
}
```

---

### BOR-HIGH-10: Desincronización y Pérdida de Boletos al Aprobar Órdenes Expiradas
- **Severidad**: Alta | **CVSS v3.1**: 7.4 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:L`)
- **CWE / OWASP**: CWE-840 (Business Logic Errors) / OWASP A04:2021
- **Componentes y Archivos Afectados**: `admin/src/services/orders.service.ts` (Líneas 179–206)
- **Descripción Técnica**:
  `approveAdminOrder` no rechaza órdenes con `status === 'expired'`. Al aprobar una orden expirada, `orders.status` pasa a `completed`, pero `UPDATE giveaway_tickets ... WHERE order_id = ?` actualiza 0 registros porque los boletos ya no tienen vinculado ese `order_id`.
- **Remediación**:
```typescript
if (order.status === 'expired') {
  await conn.rollback();
  throw new Error('No se puede aprobar una orden expirada. Los boletos ya fueron liberados.');
}
```

---

### BOR-HIGH-11: Ausencia Total de Protección CSRF en Métodos Mutantes de la Aplicación
- **Severidad**: Alta | **CVSS v3.1**: 8.8 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:H/A:H`)
- **CWE / OWASP**: CWE-352 (Cross-Site Request Forgery) / OWASP A01:2021
- **Componentes y Archivos Afectados**: `admin/src/index.ts` (Líneas 85–122), `src/index.ts` (Líneas 122–159)
- **Descripción Técnica**:
  No existe ningún middleware ni validación de tokens anti-CSRF ni comprobación obligatoria de cabeceras en las rutas administrativas mutantes (`POST`, `PUT`, `DELETE`, `PATCH`).
- **Remediación**:
  Implementar middleware CSRF que verifique la cabecera `Origin` / `Referer` contra el host esperado y exija la cabecera `X-Requested-With: XMLHttpRequest` o un token criptográfico anti-CSRF.

---

## 3.3 Vulnerabilidades de Severidad Media

### BOR-MED-01: Exposición Pública No Autenticada de Comprobantes Bancarios en `public/uploads`
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **CWE / OWASP**: CWE-552 (Files or Directories Accessible to External Parties) / OWASP A01:2021
- **Archivos**: `public/uploads/receipts/`, `src/index.ts` (144–150), `.gitignore`
- **Descripción y Remediación**:
  Express sirve estáticamente el directorio `public/` y allí reside el archivo `receipt-afa98288-a0c6-49f0-9127-2909b48c2261-1791139341859.png`. Se debe almacenar todo comprobante exclusivamente en `storage/receipts/` fuera de la raíz web pública y proteger la ruta con autenticación.

---

### BOR-MED-02: Fuga de PII y Metadatos en Respuesta de `uploadReceiptHandler`
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **CWE / OWASP**: CWE-200 (Exposure of Sensitive Information) / OWASP A01:2021
- **Archivo**: `src/controllers/orders.controller.ts` (Líneas 369–373)
- **Descripción y Remediación**:
  Devuelve `data: updatedOrder` sin llamar a `maskOrder()`, exponiendo teléfono en texto plano, nombre de archivo en disco, referencia bancaria y clave de rastreo. Se debe sustituir por `data: maskOrder(updatedOrder)`.

---

### BOR-MED-03: Bloqueo Permanente de Boletos al Agotar Intentos de Validación SPEI
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`)
- **CWE / OWASP**: CWE-400 (Uncontrolled Resource Consumption) / OWASP A04:2021
- **Archivo**: `src/services/banxico.service.ts` (Líneas 173–204)
- **Descripción y Remediación**:
  Al llegar a `max_attempts`, sólo se actualiza la cola como `failed`. La orden se queda en `in_review` y los boletos en `reserved` indefinidamente. Se debe transicionar la orden a `cancelled` y liberar los boletos a `available`.

---

### BOR-MED-04: Activación Prematura del Umbral de Sorteos por Reservaciones No Pagadas
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N`)
- **CWE / OWASP**: CWE-840 (Business Logic Errors) / OWASP A04:2021
- **Archivo**: `src/services/giveaways.service.ts` (Líneas 144–153)
- **Descripción y Remediación**:
  Calcula `paidCount = Math.max(paid_count, totalTickets - availableTickets)`. Como reservar descuenta `available_tickets`, reservaciones no pagadas disparan la cuenta regresiva del sorteo. Debe calcularse únicamente con `COUNT(*) WHERE status = 'paid'`.

---

### BOR-MED-05: Vulnerabilidad de Path Traversal y Escritura Previa en Carga de Archivos
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N`)
- **CWE / OWASP**: CWE-22 (Path Traversal) / OWASP A01:2021
- **Archivo**: `src/controllers/orders.controller.ts` (Líneas 280–345)
- **Descripción y Remediación**:
  No valida `orderUuid` contra expresión regular UUID antes de concatenarlo en la ruta de archivo ni verifica previamente que la orden exista en base de datos. Se debe aplicar validación estricta de formato UUID y generar nombres de archivo mediante `crypto.randomUUID()`.

---

### BOR-MED-06: Fuga de `order_uuid` Privado en Difusión Pública de WebSockets
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **CWE / OWASP**: CWE-200 (Exposure of Sensitive Information) / OWASP A01:2021
- **Archivos**: `src/services/banxico.service.ts` (131–137), `admin/src/services/orders.service.ts` (268–275), `websocket/src/main.rs` (189–209)
- **Descripción y Remediación**:
  El evento público `TICKETS_PAID` difunde `order_uuid` a cualquier oyente anónimo. Se debe remover este atributo del payload del evento.

---

### BOR-MED-07: Evasión de Sanitización para Propiedades camelCase y Errores en `Logger`
- **Severidad**: Media | **CVSS v3.1**: 5.3 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`)
- **CWE / OWASP**: CWE-532 (Insertion of Sensitive Information into Log File) / OWASP A09:2021
- **Archivos**: `src/services/logger.service.ts` (20–65), `admin/src/services/logger.service.ts` (20–65)
- **Descripción y Remediación**:
  `SENSITIVE_KEYS` solo contiene claves con guiones bajos (`access_token`, `card_number`). Al llegar `accessToken` y aplicarse `toLowerCase()`, la cadena `accesstoken` no coincide y se registra en texto plano. Se debe reemplazar por normalización sin caracteres especiales y expresiones regulares.

---

### BOR-MED-08: Ausencia de Cabeceras Modernas de Seguridad HTTP (CSP, HSTS, Helmet)
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N`)
- **CWE / OWASP**: CWE-693 (Protection Mechanism Failure) / OWASP A05:2021
- **Archivos**: `src/index.ts` (128–134), `admin/src/index.ts` (91–97)
- **Descripción y Remediación**:
  Faltan `Content-Security-Policy`, `Strict-Transport-Security` y `Permissions-Policy`. Se debe adoptar `helmet` configurado estrictamente.

---

### BOR-MED-09: Suplantación de Dirección IP en Rate Limiting y Falla Silenciosa en Redis
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:L/A:L`)
- **CWE / OWASP**: CWE-290 (Authentication Bypass by Spoofing) / OWASP A04:2021
- **Archivos**: `src/middlewares/rate-limit.middleware.ts` (17–57), `admin/src/middlewares/rate-limit.middleware.ts` (17–57)
- **Descripción y Remediación**:
  Confía ciegamente en `req.ip` con `trust proxy: 1`, permitiendo falsear `X-Forwarded-For`. Si Redis cae, falla en abierto (`return next()`). Se debe configurar Nginx para sobreescribir `X-Forwarded-For` con `$remote_addr` y alertar ante fallos de Redis.

---

### BOR-MED-10: Consulta Cassandra sin Paginación y Riesgo de Denegación de Servicio (OOM)
- **Severidad**: Media | **CVSS v3.1**: 6.5 (`CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H`)
- **CWE / OWASP**: CWE-400, CWE-770 / OWASP A04:2021
- **Archivo**: `admin/src/services/audit.service.ts` (Líneas 59–95)
- **Descripción y Remediación**:
  Consulta todos los registros de auditoría de un mes sin paginación nativa en CQL y realiza el corte en memoria (`Array.slice`). Con alto volumen de auditorías puede agotar la memoria del proceso Node.js. Se debe emplear paginación con `pageState` y `fetchSize`.

---

## 3.4 Vulnerabilidades de Severidad Baja

### BOR-LOW-01: Liberación No Transaccional de Reservaciones Expiradas
- **Severidad**: Baja | **CVSS v3.1**: 5.9 (`CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:H`)
- **CWE / OWASP**: CWE-662 (Improper Synchronization) / OWASP A04:2021
- **Archivo**: `src/services/orders.service.ts` (Líneas 466–542)
- **Descripción y Remediación**:
  Ejecuta sentencias desvinculadas directamente contra `pool` sin `conn.beginTransaction()`. Si el proceso se detiene a la mitad, los boletos quedan desalineados. Se debe encapsular en una transacción atómica única.

---

### BOR-LOW-02: Inyección Potencial en el DOM Cliente por Interpolación No Escapada
- **Severidad**: Baja | **CVSS v3.1**: 4.8 (`CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:U/C:L/I:L/A:N`)
- **CWE / OWASP**: CWE-79 (Improper Neutralization of Input During Web Page Generation) / OWASP A03:2021
- **Archivos**: `client/views/giveaway-detail.view.ts` (909–920), `client/views/validate-payment.view.ts` (70)
- **Descripción y Remediación**:
  Interpola propiedades de cuentas bancarias y títulos en `innerHTML` sin invocar `escapeHtml()`. Se deben escapar todas las variables dinámicas antes de asignarlas al DOM.

---

### BOR-LOW-03: Retraso en Invalidación de Caché de Permisos en Redis (5 Minutos)
- **Severidad**: Baja | **CVSS v3.1**: 5.4 (`CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:H/I:H/A:N`)
- **CWE / OWASP**: CWE-362 (Concurrent Execution using Shared Resource) / OWASP A01:2021
- **Archivo**: `admin/src/middlewares/auth.middleware.ts` (Líneas 13–42)
- **Descripción y Remediación**:
  Al modificar roles o permisos en base de datos, el caché de Redis vive 300 segundos sin invalidación proactiva. Se debe publicar un evento de invalidación o ejecutar `redis.del('boreal:admin_perms:' + userId)`.

---

### BOR-LOW-04: Atributos Subóptimos de Cookie de Sesión (`SameSite=Lax`, sin `__Host-`)
- **Severidad**: Baja | **CVSS v3.1**: 5.3 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`)
- **CWE / OWASP**: CWE-614 (Sensitive Cookie in HTTPS Session Without 'Secure' Attribute) / OWASP A05:2021
- **Archivo**: `admin/src/controllers/auth.controller.ts` (Líneas 81–87, 149–155)
- **Descripción y Remediación**:
  En producción se debe emplear `__Host-` como prefijo del nombre de la cookie y configurar `sameSite: 'strict'`.

---

### BOR-LOW-05: Ruta de Descarga Pública de Comprobantes Huérfana en Router de Órdenes
- **Severidad**: Baja | **CVSS v3.1**: 3.7 (`CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N`)
- **CWE / OWASP**: CWE-439 (Behavioral Inconsistency) / OWASP A04:2021
- **Archivos**: `src/routes/orders.routes.ts` (Líneas 25–30), `src/controllers/orders.controller.ts` (Líneas 395–446)
- **Descripción y Remediación**:
  `getOrderReceiptHandler` existe y se genera en las URLs (`/api/orders/:uuid/receipt`), pero nunca fue montado en el enrutador Express, arrojando 404 a los clientes que intentan consultar su comprobante.

---

## 3.5 Observaciones Informativas y de Endurecimiento

### BOR-INFO-01: Desconexión de Registro de Sesión Activa en Redis (Dead Store Pattern)
- **Severidad**: Informativa | **CVSS v3.1**: 0.0 | **CWE**: CWE-1164
- **Archivos**: `admin/src/services/auth.service.ts` (Líneas 65–74), `admin/src/middlewares/auth.middleware.ts` (Líneas 44–71)
- **Descripción**:
  `storeSession` almacena los datos de la sesión en Redis bajo la clave `boreal:admin_session:<tokenHash>`, pero ningún middleware de autenticación consulta dicha clave. Toda la verificación se basa en la firma HMAC local y la lista de revocación. Se recomienda unificar la arquitectura hacia un registro de sesiones activas o un `session_version` en base de datos.

### BOR-INFO-02: Asignación Global de Privilegios Comodín MySQL `'%'` en Script de Identidad
- **Severidad**: Informativa | **CVSS v3.1**: 0.0 | **CWE**: CWE-276
- **Archivo**: `database/db_identity.sql` (Líneas 143–144)
- **Descripción**:
  El script de arranque ejecuta `GRANT ALL PRIVILEGES ON db_identity.* TO 'sprite_user'@'%';`. En entornos de producción reales se debe restringir el usuario a privilegios DML (`SELECT, INSERT, UPDATE, DELETE`) y limitar el host a la subred de la aplicación (`127.0.0.1` o `172.x.x.x`).

---

# 4. AUDITORÍA DE CUMPLIMIENTO DE POLÍTICAS DEL REPOSITORIO

Esta sección evalúa el apego estricto a las directivas maestras definidas en `AGENTS.md` y `GEMINI.md`.

### 4.1 Regla 1: Cero Exposición de Información Sensible en Respuestas HTTP
- **Evaluación General**: ⚠️ **Parcialmente No Conforme**
- **Cumplimiento en Manejo de Errores y Excepciones**: ✅ **100% Conforme**
  - Todos los bloques `catch (error)` en los controladores backend (`src/controllers/` y `admin/src/controllers/`) responden con mensajes genéricos higiénicos (`"Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde."`).
  - No se detectaron fugas de stack traces, consultas SQL de MySQL (`error.sql`), parámetros de consultas ni rutas internas en respuestas de error.
- **Incumplimientos Específicos Detectados**:
  1. `src/controllers/orders.controller.ts:369-373`: El endpoint `POST /api/orders/upload-receipt` devuelve el objeto `updatedOrder` sin invocar `maskOrder()`, exponiendo el teléfono del cliente (`customer_phone`), el nombre completo (`customer_name`), el nombre del archivo en disco (`receipt_filename`), la clave de rastreo SPEI y el ID autoincremental de la base de datos.
  2. `public/uploads/receipts/`: Archivos de comprobantes de pago de clientes se encuentran almacenados dentro del directorio estático público de Express, permitiendo su descarga sin autenticación.
  3. `src/services/banxico.service.ts:131-137`: El evento `TICKETS_PAID` transmite el `order_uuid` a través del WebSocket público sin autenticación.

### 4.2 Regla 2: Prohibición Total de console.* y Auditoría del Servicio Logger
- **Evaluación General**: ⚠️ **Conforme en Código / Vulnerabilidad en Sanitizador**
- **Auditoría de Invocaciones a `console.*`**: ✅ **100% Conforme**
  - Backend (`src/` y `admin/src/`): **0 ocurrencias**.
  - Frontend (`client/` y `admin/client/`): **11 ocurrencias**, ubicadas **exclusivamente** en `client/services/websocket.service.ts` (líneas 33, 37, 62, 70, 81, 86, 91, 95, 104, 113, 142). Esto satisface con total exactitud la excepción formal estipulada en `AGENTS.md § 2.1` y `GEMINI.md § 2`.
- **Auditoría del Servicio `Logger` (`src/services/logger.service.ts`)**: ⚠️ **Vulnerabilidad Detectada**
  - El conjunto `SENSITIVE_KEYS` solo define claves en formato `snake_case`. Al procesar objetos TypeScript con propiedades estándar en camelCase (`accessToken`, `refreshToken`, `cardNumber`, `secretKey`, `smtpPass`), la normalización `key.toLowerCase()` produce cadenas que no coinciden y se imprimen sin censurar en los archivos diarios de `logs/`.

### 4.3 Reglas 3 y 4: Cero IDs y Orden de Atributos DOM/HTML
- **Evaluación General**: ✅ **100% Conforme**
- No se identificaron atributos `id="..."` añadidos a plantillas HTML del frontend ni usos indebidos de `document.getElementById()`.
- La vinculación de elementos se realiza exclusivamente a través de selectores semánticos `data-ref="..."`.
- En botones, el atributo `type` figura en primera posición (`<button type="button" class="..." data-ref="...">`). En los demás elementos, `class` lidera los atributos.

### 4.4 Regla 10: Control de Acceso Estricto Basado en Permisos (PBAC)
- **Evaluación General**: ⚠️ **Mayormente Conforme con Fallas de Cobertura**
- **Evaluación de Roles Directos o Strings de Planes**: ✅ **100% Conforme**
  - Cero comprobaciones de roles fijos en código de negocio (`user.role === 'admin'` o `subscription_tier`).
  - Todo el esquema de autorización utiliza `requirePermission(slug)` dinámico mediante la tabla `role_permissions` en `db_identity`.
- **Fallas de Cobertura y Anti-patrones**:
  - `admin/src/controllers/orders.controller.ts:30-35`: Fallback de identidad hardcodeado asignando superadministrador `id: 1` si `req.adminUser` es nulo.
  - Rutas sin protección PBAC: `admin/src/routes/bank-accounts.routes.ts` (`GET /` y `GET /giveaways`) y `admin/src/routes/dashboard.routes.ts` (`GET /stats`).

### 4.5 Regla 11: Cero DDL Inline y Scripts de Arranque
- **Evaluación General**: ✅ **100% Conforme**
- Cero sentencias `CREATE TABLE`, `ALTER TABLE` o `DROP TABLE` dentro del código de aplicación backend (`src/` y `admin/src/`).
- Todas las estructuras de tablas residen de forma canónica en `database/db_boreal.sql`, `database/db_identity.sql`, `database/db_lottery.sql` y `database/db_cassandra.cql`.

---

# 5. PLAN DE REMEDIACIÓN PRIORIZADO Y HOJA DE RUTA

```
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                 CRONOGRAMA DE REMEDIACIÓN RECOMENDADO                       │
  ├────────────────────────────────┬──────────────────────────┬─────────────────┤
  │ FASE 1: INMEDIATA (Semana 1)   │ FASE 2: ALTA (Semanas 2-3│ FASE 3: MEDIA/  │
  │ • Concurrencia Boletos TOCTOU  │ • Cobertura PBAC total   │   DEFENSA (S. 4)│
  │ • Validación CEP Banxico real  │ • Autenticación WS Rust  │ • CSP, HSTS,    │
  │ • Unicidad Clave Rastreo SPEI  │ • BOLA / IDOR en órdenes │   Helmet        │
  │ • Rotación y Purgado Secretos  │ • Desincronización orden │ • Logger regex  │
  │ • Fugas PII en HTTP y Archivos │   expirada en admin      │ • CSRF token    │
  └────────────────────────────────┴──────────────────────────┴─────────────────┘
```

### Fase 1: Remediación Inmediata (Semana 1)
*Objetivo: Erradicar riesgos de fraude financiero, doble asignación de inventario y compromiso de credenciales maestras.*
1. **Remediar BOR-CRIT-01**: Modificar `src/services/orders.service.ts` para que `attachReceipt` se ejecute en transacción y extienda `reserved_until` en `giveaway_tickets` durante la ventana de revisión.
2. **Remediar BOR-CRIT-03**: Modificar `database/db_boreal.sql` agregando `UNIQUE INDEX` sobre `orders.tracking_key` y rechazar claves duplicadas en la capa de servicios.
3. **Remediar BOR-CRIT-02**: Deshabilitar la auto-aprobación indiscriminada en `admin/src/services/orders.service.ts` e implementar el validador estricto con comprobación de firmas digitales de Banxico CEP.
4. **Remediar BOR-CRIT-05**: Purgar `.env`, `admin/.env` y `cookies.txt` del historial de Git, rotar todas las claves de base de datos, Redis y `SESSION_SECRET`, y agregarlos a `.gitignore`.
5. **Remediar BOR-MED-01 y BOR-MED-02**: Mover `public/uploads/receipts/` fuera de la raíz web, enmascarar la respuesta de `uploadReceiptHandler` con `maskOrder()` y censurar `order_uuid` en eventos de WebSocket (`BOR-MED-06`).

### Fase 2: Remediación de Alta Prioridad (Semanas 2 y 3)
*Objetivo: Blindar la integridad de control de acceso, WebSockets y la máquina de estados de órdenes.*
1. **Remediar BOR-HIGH-04, BOR-HIGH-07, BOR-HIGH-08**: Eliminar el superadministrador por defecto en `orders.controller.ts` y aplicar `requirePermission()` en las rutas de cuentas bancarias y dashboard.
2. **Remediar BOR-CRIT-04 y BOR-HIGH-03**: Implementar autenticación por ticket efímero e inspección estricta de la cabecera `Origin` en el microservicio Rust (`websocket/src/main.rs`).
3. **Remediar BOR-HIGH-01 y BOR-HIGH-02**: Integrar `isSessionRevoked(token)` en `/api/auth/me` y verificar el estado `is_active` en `requireAdminAuth`.
4. **Remediar BOR-HIGH-09 y BOR-HIGH-10**: Corregir las transiciones de estado en `admin/src/services/orders.service.ts`, bloqueando la aprobación de órdenes expiradas y evitando la doble suma de boletos en cancelaciones.
5. **Remediar BOR-HIGH-05 y BOR-HIGH-06**: Exigir token de autorización de orden o validación SMS para consultar y modificar comprobantes de pago.

### Fase 3: Defensa en Profundidad y Endurecimiento Web (Semanas 3 y 4)
*Objetivo: Mitigar vectores de ataque avanzados, robustecer el logging y optimizar el rendimiento.*
1. **Remediar BOR-HIGH-11 y BOR-MED-08**: Instalar y configurar `helmet`, definir cabeceras CSP/HSTS estrictas e implementar middleware CSRF.
2. **Remediar BOR-MED-07**: Actualizar la lógica de sanitización en `logger.service.ts` para normalizar y detectar patrones sensibles en camelCase y en propiedades de objetos `Error`.
3. **Remediar BOR-MED-05**: Validar el formato UUID y sanear la ruta en `uploadReceiptHandler` antes de interactuar con el sistema de archivos.
4. **Remediar BOR-MED-10**: Implementar paginación nativa con `pageState` en las consultas de auditoría de Apache Cassandra.
5. **Remediar BOR-LOW-02 y BOR-LOW-05**: Escapar HTML en plantillas dinámicas del frontend y registrar la ruta `/api/orders/:uuid/receipt` en el enrutador público.

---

# 6. METODOLOGÍA Y GUÍA DE VERIFICACIÓN INDEPENDIENTE

Para auditar y reproducir de manera autónoma los hallazgos descritos en este informe sin alterar el entorno operativo:

### 1. Verificación de Compilación y Tipado Estricto de TypeScript
Ejecutar la verificación estricta en el servidor público y administrativo:
```powershell
npm run typecheck:all
```
*Criterio de Aceptación*: Ambos proyectos deben compilar limpiamente con código de salida 0.

### 2. Verificación Estática de Invocaciones a `console.*`
Comprobar la ausencia de `console.*` en backend y su contención en el servicio WebSocket del cliente:
```powershell
# En backend (debe retornar 0 resultados):
git grep -n "console\." -- "src/" "admin/src/"

# En cliente (debe retornar únicamente coincidencias en websocket.service.ts):
git grep -n "console\." -- "client/" "admin/client/"
```

### 3. Verificación de Ausencia de DDL Inline
Confirmar que no existen sentencias DDL en el código de aplicación:
```powershell
git grep -Eni "(CREATE|ALTER|DROP)\s+TABLE" -- "src/" "admin/src/"
```
*Criterio de Aceptación*: Cero resultados.

### 4. Verificación de la Condición de Carrera TOCTOU (BOR-CRIT-01)
1. Inspeccionar `src/services/orders.service.ts:395-400`. Confirmar que la consulta `UPDATE orders SET status = 'in_review' ...` no ejecuta ninguna sentencia sobre `giveaway_tickets`.
2. Inspeccionar `src/services/giveaways.service.ts:93-97`. Confirmar que `getGiveawayTakenTickets` solo considera boletos reservados si `reserved_until > NOW()`, dejando desprotegidos los boletos en revisión con más de 30 minutos.

### 5. Verificación de Falta de Unicidad en SPEI (BOR-CRIT-03)
Inspeccionar `database/db_boreal.sql:179` y verificar que la clave de rastreo posee un índice ordinario y no un `UNIQUE INDEX`:
```powershell
git grep -n "idx_orders_tracking_key" -- "database/"
```

### 6. Verificación de Exposición Pública de Comprobantes (BOR-MED-01)
Verificar la presencia física del archivo dentro de la carpeta servida por Express Static:
```powershell
Get-ChildItem -Path "f:/ProjectBoreal/public/uploads/receipts"
```

---

*Fin del Informe Técnico de Auditoría de Seguridad — Project Boreal.*
