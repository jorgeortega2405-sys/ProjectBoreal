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

## 2026-10-09T20:23:27Z

Realizar una auditoría técnica ultra exhaustiva y análisis de consistencia en todo el monorepo de ProjectBoreal (Aplicación Principal en puerto 3000 y Panel Administrativo en puerto 3001) para identificar alucinaciones de IA, inconsistencias arquitectónicas, discrepancias entre API frontend/backend, vulnerabilidades y violaciones a las reglas maestras de AGENTS.md, entregando un reporte detallado sin modificar código aún.

Working directory: f:/ProjectBoreal
Integrity mode: development

## Requirements

### R1. Auditoría Frontend y Cumplimiento de Reglas UI
Analizar a fondo el frontend de la app principal (`client/`, `public/`) y del panel admin (`admin/client/`, `admin/public/`). Identificar violaciones a las reglas maestras (uso indebido de IDs, `console.log` no autorizados, orden incorrecto de atributos HTML, banners de error en posiciones no estándar), selectores DOM rotos, desalineación de templates `.html` y controladores `.view.ts`, y memory leaks por listeners sin desuscribir.

### R2. Auditoría Backend, Seguridad y PBAC
Examinar minuciosamente los servicios, controladores y middlewares de backend (`src/` y `admin/src/`). Detectar violaciones del modelo PBAC (uso directo de roles o tiers en lugar de permisos), fugas de información técnica/sensible en respuestas HTTP, transacciones SQL/Cassandra inseguras o desincronizadas, DDL inline prohibido y manejo inadecuado de errores.

### R3. Verificación Cruzada Frontend ↔ Backend (Detección de Alucinaciones y Rutas Huérfanas)
Mapear exhaustivamente cada petición HTTP (`fetch`, `api.service`) emitida desde el frontend contra las rutas y controladores registrados en Express en ambos puertos (3000 y 3001). Identificar endpoints inexistentes, discordancias en nombres de parámetros o contratos de datos JSON, endpoints backend huérfanos/zombi y llamadas a métodos obsoletos generados por alucinaciones de IA.

### R4. Informe Estructurado de Diagnóstico y Plan de Remediación
Elaborar un informe exhaustivo clasificado por criticidad (Crítico, Alto, Medio, Bajo/Mejora), con ubicación precisa de archivos, explicación del sinsentido/inconsistencia detectada y la recomendación técnica para solucionarlo, asegurando explícitamente CERO modificaciones en el código fuente en esta fase.

## Acceptance Criteria

### Integridad y Cobertura
- [ ] Cobertura completa de análisis estático y lógico sobre el 100% de los módulos de `src/`, `client/`, `admin/src/`, `admin/client/`, `public/` y `admin/public/`.
- [ ] Verificación cruzada exhaustiva de todos los endpoints cliente vs backend para ambos puertos (3000 y 3001).

### Detección de Violaciones y Alucinaciones
- [ ] Detección y listado de todas las discrepancias de contrato de datos, rutas fantasmas y lógica rota generada por IA.
- [ ] Auditoría de seguridad y PBAC conforme a las directivas de `AGENTS.md` y `GEMINI.md`.

### Calidad del Entregable
- [ ] Reporte final estructurado con referencias precisas (rutas de archivos y funciones), severidad y solución recomendada sin haber alterado el código fuente.

