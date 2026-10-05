# Original User Request

## 2026-10-05T00:40:56Z

Auditoría de seguridad integral 360° y análisis exhaustivo de vulnerabilidades y bugs en el sistema de compra y validación de boletos (órdenes, pagos SPEI/Banxico, concurrencia y doble reserva de números) y en la seguridad global de la aplicación web (gestión de claves, tokens, secretos, middlewares y directivas de seguridad).

Working directory: f:/ProjectBoreal
Integrity mode: development

## Requirements

### R1. Auditoría del Ciclo de Pagos y Boletos
Analizar a fondo el flujo completo de reserva, compra y confirmación de boletos:
- Lógica de validación de pagos SPEI y CEP en Banxico (`banxico.service.ts`, `orders.service.ts`, `orders.controller.ts`).
- Detección de condiciones de carrera (Race Conditions / TOCTOU) y transacciones concurrentes en la reserva o compra simultánea del mismo número de boleto.
- Bypasses de validación de montos, alteraciones de referencias de pago, repetición de comprobantes (Replay Attacks) y transiciones de estado inválidas en órdenes.

### R2. Auditoría de Seguridad Web General, Tokens y Manejo de Claves
Auditar la superficie global de seguridad de la aplicación:
- Manejo y ciclo de vida de tokens de autenticación/sesión, cookies, cabeceras de seguridad y autenticación en WebSockets.
- Gestión de secretos y variables de entorno: detección de claves API, credenciales hardcodeadas o fugas accidentales hacia el cliente o bundles de Vite.
- Revisión de middlewares de autorización, control de acceso basado en permisos (PBAC) y prevención de inyecciones (SQL/NoSQL) y ataques CSRF/CORS.

### R3. Cumplimiento de Políticas de Seguridad del Repositorio
Verificar el cumplimiento estricto de las directivas de seguridad del proyecto (`AGENTS.md` / `GEMINI.md`):
- Regla de oro de CERO fuga de información técnica o sensible (stack traces, queries SQL, rutas internas) en respuestas HTTP al frontend.
- Sanitización de logs a través del servicio centralizado (`Logger`) y ausencia de `console.*` en código de producción.

### R4. Informe Técnico Integral de Auditoría
Elaborar un informe formal y detallado (`SECURITY_AUDIT_REPORT.md` en el directorio de trabajo) estructurado con:
- Resumen ejecutivo de la postura de seguridad.
- Catálogo de hallazgos clasificados por severidad (Crítica, Alta, Media, Baja, Informativa).
- Para cada hallazgo: componente y archivo afectado, descripción del fallo, análisis de causa raíz, vector de riesgo teórico y propuesta de solución con código de parche de remediación.

## Acceptance Criteria

### Flujo de Pagos y Concurrencia
- [ ] Se auditan exhaustivamente todos los métodos de `orders.service.ts`, `orders.controller.ts` y `banxico.service.ts` identificando cualquier vector de manipulación de estado, doble reserva o bypass de validación CEP.
- [ ] Se verifica la integridad transaccional de la base de datos (bloqueos, niveles de aislamiento, rollbacks) frente a peticiones simultáneas de compra sobre los mismos boletos.

### Autenticación, Secretos y Web
- [ ] Se analizan todos los middlewares de autenticación, control de permisos y WebSockets para detectar omisiones de autorización o suplantación.
- [ ] Se audita el archivo `.env`, `.env.example`, configuraciones de base de datos y scripts de cliente para garantizar la ausencia de exposición de credenciales o secretos privados.
- [ ] Se verifica que ninguna respuesta de error en los controladores exponga excepciones internas, trazas o errores de bases de datos hacia el frontend.

### Entregable del Reporte
- [ ] El archivo `SECURITY_AUDIT_REPORT.md` se genera en la raíz del proyecto conteniendo todos los hallazgos documentados con severidad, archivo de referencia, impacto y solución recomendada con código de remediación.
- [ ] Ningún archivo fuente de la aplicación es modificado sin autorización previa (análisis estático y dinámico no destructivo).
