# AUDITORÍA TÉCNICA INTEGRAL DE CONSISTENCIA Y ARQUITECTURA
## Reporte Maestro de Diagnóstico, Alucinaciones de IA y Plan de Remediación
### Monorepo ProjectBoreal (Puerto 3000 — Aplicación Pública | Puerto 3001 — Panel Administrativo)

---

**Fecha de Emisión**: 9 de Octubre de 2026  
**Versión del Informe**: 1.0.0 (Master Comprehensive Synthesis)  
**Autoría de Auditoría**: Master Report Synthesizer (`worker_report`) con insumos de `explorer_frontend`, `explorer_backend` y `explorer_crossapi`  
**Directivas Gobernantes**: `AGENTS.md` y `GEMINI.md`  
**Estado de Modificación de Código**: **0 ARCHIVOS FUENTE MODIFICADOS** (Modo estricto de auditoría de solo lectura)

---

## 1. RESUMEN EJECUTIVO

### 1.1 Postura Arquitectónica Global del Monorepo
ProjectBoreal opera bajo una arquitectura desacoplada de monorepo compuesta por dos servicios web basados en Node.js/Express y TypeScript, un microservicio de WebSockets de alto rendimiento en Rust (puerto 3008) y un worker de conciliación de pagos en segundo plano desarrollado en Python:
1. **Aplicación Pública Principal (Puerto 3000)**: Servidor Express (`src/`) y Single Page Application modular en TypeScript (`client/`) con plantillas estáticas y estilos BEM (`public/`). Gestiona la visualización de sorteos, la reserva concurrente de boletos y la carga de comprobantes de pago SPEI.
2. **Panel de Control Administrativo (Puerto 3001)**: Servidor Express dedicado (`admin/src/`) y SPA administrativa (`admin/client/`, `admin/public/`). Gobierna la gestión de cuentas bancarias receptoras, conciliación y aprobación de órdenes, clientes y ejecución de sorteos.
3. **Capa de Persistencia y Auditoría**: Base de datos relacional MySQL (`database/db_lottery.sql`) como fuente de verdad transaccional, clúster Apache Cassandra (`database/db_cassandra.cql`) para almacenamiento inmutable de auditoría y Redis para semáforos distribuidos, caché y sesiones.

La auditoría técnica integral confirma una **sólida disciplina arquitectónica general**: el sistema compila al 100% sin errores de tipos (`npm run typecheck` limpio con código de salida 0 en ambos proyectos), implementa DOM 100% libre de atributos `id`, centraliza sus logs y DDL, y no presenta rutas fantasma (`ghost routes = 0`). 

No obstante, la auditoría identificó **12 anomalías técnicas específicas** generadas primordialmente por alucinaciones puntuales de código asistido por IA, inconsistencias de ciclo de vida del frontend, fugas potenciales de recursos en la gestión de transacciones de base de datos y exposición de errores internos en el panel administrativo.

### 1.2 Declaración Explícita de Cero Modificaciones de Código Fuente
> **CERTIFICACIÓN DE INTEGRIDAD**: De conformidad estricta con los requerimientos de la fase de diagnóstico, **ningún archivo de código fuente** ubicado en `src/`, `client/`, `admin/`, `public/`, `database/` o `payment_worker/` ha sido alterado, añadido o eliminado durante la realización de este estudio. El presente documento y los metadatos de agentes en `.agents/` constituyen los únicos artefactos generados.

### 1.3 Métricas Maestras de Auditoría

| Métrica Auditada | Valor Observado | Estado / Evaluación |
|---|:---:|---|
| **Rutas Express Registradas (Puerto 3000)** | 13 HTTP + 1 WS Proxy | 100% Catalogadas |
| **Rutas Express Registradas (Puerto 3001)** | 39 HTTP | 100% Catalogadas |
| **Invocaciones HTTP Cliente (Puerto 3000)** | 11 Llamadas | 100% Sincronizadas |
| **Invocaciones HTTP Cliente (Puerto 3001)** | 37 Llamadas | 100% Sincronizadas |
| **Rutas Fantasma (Llamadas a endpoints inexistentes)** | **0** | **ÓPTIMO (Zero Ghost Routes)** |
| **Rutas Backend Huérfanas (Sin consumo en SPA propia)** | 2 Endpoints | Documentadas (1 segura, 1 optimizable) |
| **Violaciones a Regla Cero IDs (`id="..."`)** | **0** | **100% Cumplimiento** |
| **Violaciones de Logging (`console.*` no autorizados)** | **0** | **100% Cumplimiento** (11 en WS autorizados por AGENTS.md §2.1) |
| **Violaciones de DDL Inline (`CREATE/ALTER TABLE` en código)** | **0** | **100% Cumplimiento** |
| **Riesgos de Fuga de Conexiones DB (Pool Starvation)** | 3 Métodos | **CRÍTICO (Corregible)** |
| **Fugas de Memoria / Detachments en Ciclo de Vida Frontend** | 2 Puntos | **CRÍTICO / MEDIO** |
| **Filtraciones de Errores Internos (`err?.message` en HTTP)** | 12 Rutas | **CRÍTICO / ALTO** |
| **Iconos SVG Alucinados (Símbolos inexistentes en UI)** | 11 Referencias | **ALTO (Iconos invisibles)** |
| **Claves de Traducción i18n Faltantes** | 5 Claves | **MEDIO (Textos vacíos en Términos)** |
| **Desalineación de Contratos de Tipos Genéricos** | 3 Peticiones | **MEDIO** |
| **Infracciones de Orden de Atributos HTML** | 7 Etiquetas | **BAJO / MEJORA** |
| **Componentes Muertos / Huérfanos** | 1 Archivo | **BAJO / MEJORA** |

---

## 2. MATRIZ DE CUMPLIMIENTO DE POLÍTICAS DEL REPOSITORIO (AGENTS.md & GEMINI.md)

| Directiva del Proyecto | Evaluación | Detalle Técnico |
|---|:---:|---|
| **1. Cero Información Sensible al Frontend** | **NO CONFORME** | 12 endpoints administrativos devuelven `err?.message` al frontend, permitiendo la filtración de errores MySQL (`ER_DUP_ENTRY`, nombres de llaves foráneas). |
| **2. Cero `console.*` / Logging Centralizado** | **CONFORME** | Cero `console.*` en backend (`src/`, `admin/src/`). Las únicas llamadas en cliente residen en `websocket.service.ts` (excepción permitida expresamente en `AGENTS.md` §2.1). |
| **3. Cero Atributos `id` en DOM** | **CONFORME** | Cero `id="..."` en templates HTML. Cero `document.getElementById`. Todo selector utiliza semántica `data-ref="..."`. |
| **4. Orden Estricto de Atributos HTML** | **PARCIAL** | Templates `.html` limpios (0 infracciones). 7 cadenas de template literal en archivos TypeScript de admin violan la regla al no posicionar `class` primero en tags no `<button>`. |
| **5. Banners de Error Debajo de Botones** | **NO CONFORME** | En `bank-info-modal.component.ts:59`, el banner de error está colocado por encima del contenedor de botones de acción. |
| **6. Organización Modular del Código** | **CONFORME** | Estructura de carpetas limpia y coherente en ambos puertos (`src/`, `client/`, `admin/`, `public/`). |
| **7. Imports Horizontales y Alfabéticos** | **CONFORME** | Imports formateados en una sola línea horizontal con ordenación estricta de rutas y miembros desestructurados. |
| **8. Cero Anotaciones y Comentarios Obvios** | **CONFORME** | Ausencia de bloques JSDoc, comentarios obvios o decoraciones redundantes. Código auto-documentado. |
| **9. Ciclo de Vida Estándar en Vistas JS** | **PARCIAL** | `WinnersView` en `client/views/winners.view.ts` no asigna `(root as any).__controller = view`, rompiendo la llamada al método `destroy()` por parte de `app-router.ts`. |
| **10. Control de Acceso Basado en Permisos (PBAC)** | **PARCIAL** | No se utilizan comparaciones directas de roles ni strings de planes, pero el panel administrativo carece de un modelo PBAC granular; opera con un modelo binario `requireAuth`. |
| **11. Cero DDL Inline en Código** | **CONFORME** | Todos los esquemas y modificaciones residen exclusivamente en `database/db_lottery.sql` y `database/db_cassandra.cql`. |

---

## 3. CATÁLOGO MAESTRO DE HALLAZGOS CLASIFICADOS POR CRITICIDAD

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             RESUMEN DE GRAVEDAD                                  │
├───────────────────┬──────────────────────────────────────────────────────────────┤
│ 🔴 CRÍTICO (3)    │ BOR-CONS-01, BOR-CONS-02, BOR-CONS-03                        │
│ 🟠 ALTO (2)       │ BOR-CONS-04, BOR-CONS-05                                     │
│ 🟡 MEDIO (4)      │ BOR-CONS-06, BOR-CONS-07, BOR-CONS-08, BOR-CONS-09           │
│ 🟢 BAJO / MEJORA  │ BOR-CONS-10, BOR-CONS-11, BOR-CONS-12                        │
└───────────────────┴──────────────────────────────────────────────────────────────┘
```

### Tabla Resumen del Catálogo

| ID | Severidad | Módulo / Componente | Archivo y Líneas | Resumen del Defecto |
|---|:---:|---|---|---|
| **BOR-CONS-01** | **CRÍTICO** | Admin DB Transactions | `admin/src/services/giveaways.service.ts`: 362-365, 492-495, 687-690 | `conn.beginTransaction()` fuera de `try/finally`; riesgo de fuga de conexiones al pool. |
| **BOR-CONS-02** | **CRÍTICO** | Client Router Lifecycle | `client/views/winners.view.ts`: 227-230 | Omisión de asignación de `__controller`; `destroy()` nunca se ejecuta al navegar; fuga de memoria. |
| **BOR-CONS-03** | **CRÍTICO** | Admin Security / Info Leak | `admin/src/routes/*.routes.ts`: 12 endpoints | `err?.message` reflejado en JSON de error HTTP; fuga de errores internos de MySQL al cliente. |
| **BOR-CONS-04** | **ALTO** | Admin Security / PBAC | `admin/src/index.ts`: 160-165, `auth.middleware.ts` | Ausencia de granularidad PBAC; modelo de autenticación binaria sin segregación de facultades. |
| **BOR-CONS-05** | **ALTO** | UI Assets / SVG Symbols | 10 vistas en `client/`, `admin/`, `public/` (11 usos) | Iconos SVG invisibles debido a nombres de símbolos inexistentes alucinados por IA (`#call`, etc.). |
| **BOR-CONS-06** | **MEDIO** | Admin Client Memory Leak | `admin/client/components/layout.component.ts`: 181-184 | Listener `themechange` global en `window` sin desuscribir en `unmountSidebar()`; fuga entre sesiones. |
| **BOR-CONS-07** | **MEDIO** | Client Form Layout Rule | `client/components/bank-info-modal.component.ts`: 59 | Banner de error posicionado por encima de los botones de acción (violación de AGENTS.md §5.1). |
| **BOR-CONS-08** | **MEDIO** | Client-Server Contract | `admin/client/views/bank-accounts.view.ts`: 662, `payments.view.ts`: 866, 912 | Tipos genéricos de respuesta desalineados con el payload devuelto por el backend en peticiones POST. |
| **BOR-CONS-09** | **MEDIO** | UI Internationalization | `public/translations/es-MX.json`, `terms.html`: 75-76 | 5 claves i18n faltantes en diccionario; renderizado de elementos `<li>` vacíos en términos legales. |
| **BOR-CONS-10** | **BAJO** | HTML Attribute Order | 5 vistas en `admin/client/views/*.ts` (7 casos) | `class` no está posicionado como primer atributo en elementos no botón dentro de templates inline. |
| **BOR-CONS-11** | **BAJO** | Dead Code / Component | `client/components/daily-giveaway-card.component.ts` | Componente abandonado, nunca importado ni instanciado; contiene referencias a claves i18n huérfanas. |
| **BOR-CONS-12** | **BAJO** | API Architecture / Cleanliness | `admin/src/routes/winners.routes.ts`: 42, `src/routes/orders.routes.ts`: 42 | Endpoints huérfanos sin consumo desde la SPA correspondiente. |

---

## 4. FICHAS TÉCNICAS EXHAUSTIVAS POR HALLAZGO INDIVIDUAL

---

### BOR-CONS-01: Riesgo Crítico de Agotamiento de Conexiones por Transacciones Fuera del Bloque Try

- **Severidad**: **CRÍTICO**
- **Componente**: Capa de Servicios de Base de Datos Administrativa (`admin/src/services/giveaways.service.ts`)
- **Ubicación Exacta**:
  - `admin/src/services/giveaways.service.ts`: Líneas 362–365 (en `createGiveaway`)
  - `admin/src/services/giveaways.service.ts`: Líneas 492–495 (en `updateGiveaway`)
  - `admin/src/services/giveaways.service.ts`: Líneas 687–690 (en `executeManualDraw`)
- **Descripción Técnica**:
  En los tres métodos transaccionales indicados, se adquiere una conexión del pool y se invoca inmediatamente `await conn.beginTransaction()` de manera síncrona antes del inicio del bloque `try { ... }`.
  ```typescript
  // Código actual vulnerable:
  const conn = await pool.getConnection();
  await conn.beginTransaction(); // <-- Si falla aquí, nunca entra a try/finally

  try {
    // Operaciones transaccionales...
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
  ```
- **Causa Raíz**:
  Alucinación en el patrón de control de flujo transaccional. En el servicio principal de órdenes (`src/services/orders.service.ts`), la llamada a `await conn.beginTransaction()` está correctamente encapsulada dentro del bloque `try`, mientras que en el servicio administrativo de sorteos quedó fuera.
- **Vector de Impacto / Riesgo**:
  Si el servidor MySQL experimenta micro-desconexiones, timeouts de red en el handshake de transacción o si la sesión del pool es cerrada durante `beginTransaction()`, se lanzará una excepción antes de registrar el bloque `finally`. La conexión adquirida nunca será devuelta al pool (`conn.release()` se omite por completo), acumulando conexiones zombi hasta agotar el límite de `connectionLimit` del pool, provocando una denegación de servicio (DoS) interna en el panel administrativo.
- **Parche de Remediación Propuesto**:
  Reubicar la llamada a `await conn.beginTransaction()` inmediatamente dentro del bloque `try`, garantizando que ante cualquier falla síncrona o asíncrona, el bloque `finally` libere la conexión de vuelta al pool.

```diff
--- a/admin/src/services/giveaways.service.ts
+++ b/admin/src/services/giveaways.service.ts
@@ -362,4 +362,4 @@
   const conn = await pool.getConnection();
-  await conn.beginTransaction();
-
   try {
+    await conn.beginTransaction();
     const [slugCheck]: any = await conn.query(
@@ -492,4 +492,4 @@
   const conn = await pool.getConnection();
-  await conn.beginTransaction();
-
   try {
+    await conn.beginTransaction();
     const [current]: any = await conn.query('SELECT * FROM giveaways WHERE id = ? FOR UPDATE', [id]);
@@ -687,4 +687,4 @@
   const conn = await pool.getConnection();
-  await conn.beginTransaction();
-
   try {
+    await conn.beginTransaction();
     const [giveaways]: any = await conn.query('SELECT * FROM giveaways WHERE uuid = ? FOR UPDATE', [uuid]);
```

---

### BOR-CONS-02: Desconexión del Ciclo de Vida del Router y Fuga de Memoria en Vista de Ganadores

- **Severidad**: **CRÍTICO**
- **Componente**: Enrutador SPA y Controlador de Vista del Cliente (`client/views/winners.view.ts`)
- **Ubicación Exacta**: `client/views/winners.view.ts`: Líneas 227–230
- **Descripción Técnica**:
  El enrutador SPA de ProjectBoreal (`client/app-router.ts`) gestiona la recolección de basura y la liberación de recursos de cada vista al cambiar de ruta mediante el siguiente protocolo de desmontaje (líneas 94–99 y 133–138):
  ```typescript
  const controller = (activeViewElement as any)?.__controller as ViewController | undefined;
  if (controller && typeof controller.destroy === 'function') {
    try {
      controller.destroy();
    } catch {}
  }
  ```
  Sin embargo, en `client/views/winners.view.ts`, la función fábrica exportada `createWinnersView` fue implementada de la siguiente forma:
  ```typescript
  export async function createWinnersView(_initialTab?: string): Promise<HTMLElement> {
    const view = new WinnersView();
    return await view.init();
  }
  ```
  Al no adjuntar la instancia `view` a la propiedad `__controller` del elemento raíz devuelto, el enrutador nunca detecta la existencia del controlador.
- **Causa Raíz**:
  Omisión en la función fábrica durante la refactorización TypeScript. Todas las demás vistas (`home.view.ts`, `giveaway-detail.view.ts`, etc.) ejecutan `(root as any).__controller = view;`.
- **Vector de Impacto / Riesgo**:
  Cuando el usuario entra a `/winners` y luego navega a cualquier otra sección (ej. detalle de sorteo o configuración), el método `WinnersView.prototype.destroy()` **nunca se ejecuta**. En consecuencia:
  1. Su `this.abortController` interno no emite la señal `abort()`, manteniendo peticiones HTTP activas si estaban en curso.
  2. Los arreglos masivos en memoria `allWinners` y `filteredWinners` quedan referenciados por closures de listeners no desmontados.
  3. En navegaciones repetidas, se instancian nuevos objetos `WinnersView`, consumiendo memoria de forma incremental hasta degradar el rendimiento del navegador en dispositivos móviles.
- **Parche de Remediación Propuesto**:

```diff
--- a/client/views/winners.view.ts
+++ b/client/views/winners.view.ts
@@ -227,4 +227,6 @@ export class WinnersView {
 export async function createWinnersView(_initialTab?: string): Promise<HTMLElement> {
   const view = new WinnersView();
-  return await view.init();
+  const root = await view.init();
+  (root as any).__controller = view;
+  return root;
 }
```

---

### BOR-CONS-03: Filtración Masiva de Errores Técnicos de Base de Datos en Respuestas HTTP del Administrador

- **Severidad**: **CRÍTICO**
- **Componente**: Rutas Express del Panel Administrativo (`admin/src/routes/`)
- **Ubicación Exacta**: 12 endpoints en 4 archivos de rutas:
  1. `admin/src/routes/bank-accounts.routes.ts`: Líneas 77, 95, 121, 147, 164
  2. `admin/src/routes/customers.routes.ts`: Líneas 78, 95
  3. `admin/src/routes/giveaways.routes.ts`: Líneas 115, 133, 159, 177, 194
  4. `admin/src/routes/winners.routes.ts`: Línea 78
- **Descripción Técnica**:
  En los controladores y rutas administrativas, los bloques `catch (err: any)` capturan excepciones y devuelven respuestas HTTP con la estructura:
  ```typescript
  res.status(400).json({
    error: err?.message || 'Mensaje de fallback...',
    success: false,
  });
  ```
  Al mismo tiempo, los servicios subyacentes (`bank-accounts.service.ts`, `giveaways.service.ts`, `customers.service.ts`, `winners.service.ts`) propagan excepciones de MySQL directamente mediante `throw err;` o `throw error;`.
- **Causa Raíz**:
  Inconsistencia entre el backend principal (`src/`, donde todos los errores pasan por respuestas genéricas seguras) y el backend del panel administrativo (`admin/src/`), donde se asumió erróneamente que por ser un panel interno era aceptable retornar `err.message`. Esto viola explícitamente la **Regla de Oro 1 de `AGENTS.md`** y la **Directiva 1 de `GEMINI.md`**.
- **Vector de Impacto / Riesgo**:
  Un error de base de datos provocado (por ejemplo, registrar una clave CLABE duplicada o intentar eliminar una cuenta bancaria con llaves foráneas asignadas en `giveaway_bank_accounts`) devolverá cadenas verbatim del motor MySQL:
  `Cannot delete or update a parent row: a foreign key constraint fails (\`db_lottery\`.\`giveaway_bank_accounts\`, CONSTRAINT \`fk_gba_bank_account\` ...)` o `ER_DUP_ENTRY: Duplicate entry '12345' for key 'clabe'`.
  Esta fuga de información revela nombres de esquemas, tablas, restricciones, versiones y estructura interna a través del tráfico de red, facilitando ataques dirigidos si una sesión es interceptada.
- **Parche de Remediación Propuesto**:
  Sanitizar sistemáticamente las respuestas HTTP en los 12 endpoints afectados. Si el error es una instancia de validación de negocio conocida se transmite el mensaje seguro, de lo contrario se responde siempre con un mensaje genérico predeterminado, registrando los detalles técnicos exclusivamente en `logger.app.warn` o `logger.app.error`.

```diff
--- a/admin/src/routes/bank-accounts.routes.ts
+++ b/admin/src/routes/bank-accounts.routes.ts
@@ -74,6 +74,8 @@ router.post('/', async (req: Request, res: Response): Promise<void> => {
   } catch (err: any) {
-    logger.app.warn('Validación o error al crear cuenta bancaria en admin:', err?.message || err);
+    logger.app.warn('Validación o error al crear cuenta bancaria en admin:', err);
+    const isSafeMsg = err instanceof Error && !('code' in err) && !err.message.includes('SQL') && !err.message.includes('ER_');
     res.status(400).json({
-      error: err?.message || 'Error al validar los datos de la cuenta bancaria.',
+      error: isSafeMsg ? err.message : 'Error al validar los datos de la cuenta bancaria.',
       success: false,
     });
   }
@@ -92,6 +94,8 @@ router.put('/:uuid', async (req: Request, res: Response): Promise<void> => {
   } catch (err: any) {
-    logger.app.warn('Validación o error al actualizar cuenta bancaria en admin:', err?.message || err);
+    logger.app.warn('Validación o error al actualizar cuenta bancaria en admin:', err);
+    const isSafeMsg = err instanceof Error && !('code' in err) && !err.message.includes('SQL') && !err.message.includes('ER_');
     res.status(400).json({
-      error: err?.message || 'Error al actualizar la cuenta bancaria.',
+      error: isSafeMsg ? err.message : 'Error al actualizar la cuenta bancaria.',
       success: false,
     });
   }
```
*(Idéntico tratamiento de sanitización aplica para `customers.routes.ts`, `giveaways.routes.ts` y `winners.routes.ts`).*

---

### BOR-CONS-04: Ausencia de Control de Acceso Granular Basado en Permisos (PBAC) en el Administrador

- **Severidad**: **ALTO**
- **Componente**: Capa de Autorización y Middlewares (`admin/src/middlewares/auth.middleware.ts`, `admin/src/index.ts`)
- **Ubicación Exacta**:
  - `admin/src/index.ts`: Líneas 160–165
  - `admin/src/middlewares/auth.middleware.ts`: Líneas 14–46
  - `database/db_lottery.sql`: Definición de tabla `admin_users`
- **Descripción Técnica**:
  Todas las rutas del panel administrativo están protegidas exclusivamente por un middleware de autenticación binaria `requireAuth`:
  ```typescript
  app.use('/api/bank-accounts', requireAuth, bankAccountsRoutes);
  app.use('/api/customers', requireAuth, customersRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/giveaways', requireAuth, giveawaysRoutes);
  app.use('/api/orders', requireAuth, ordersRoutes);
  app.use('/api/winners', requireAuth, winnersRoutes);
  ```
  La tabla `admin_users` solo almacena `(id, uuid, name, email, password_hash, is_active...)`. No existen tablas de roles, permisos, ni asignación `role_permissions` en la base de datos, y en consecuencia no existe ningún middleware de validación granular como `requirePermission('giveaways:create')` o `requirePermission('bank_accounts:manage')`.
- **Causa Raíz**:
  El proyecto implementó una seguridad perimetral de tipo "todo o nada" orientada a un único superadministrador. Si bien no se viola la regla negativa de `AGENTS.md` (no existen `user.role === 'admin'` en el código), no se implementó el modelo PBAC positivo exigido en la Sección 10 de `AGENTS.md`.
- **Vector de Impacto / Riesgo**:
  Cualquier cuenta administrativa autenticada (por ejemplo, un operador de soporte asignado a verificar comprobantes) adquiere capacidad técnica ilimitada para eliminar sorteos, alterar cuentas bancarias destino para cobros de boletos o ejecutar sorteos manuales no autorizados.
- **Parche de Remediación Propuesto**:
  Crear el middleware estándar `requirePermission` en `admin/src/middlewares/auth.middleware.ts` preparado para validar permisos en la sesión del usuario o tokens asociados:

```typescript
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.adminUser as any;
    if (!user) {
      res.status(401).json({ error: 'Sesión no autorizada.', success: false });
      return;
    }
    // Si el usuario cuenta con lista de permisos asignada:
    if (user.permissions && Array.isArray(user.permissions)) {
      const hasPermission = user.permissions.includes(permission) || user.permissions.includes('*');
      if (!hasPermission) {
        res.status(403).json({ error: 'Acceso denegado: permisos insuficientes para esta operación.', success: false });
        return;
      }
    }
    next();
  };
}
```

---

### BOR-CONS-05: Degradación Visual por 11 Iconos SVG Rotos con Símbolos Alucinados

- **Severidad**: **ALTO**
- **Componente**: Capa Gráfica / Iconografía SVG (`public/icons.svg`, `admin/public/icons.svg` vs Vistas y Plantillas)
- **Ubicación Exacta**: 11 ocurrencias en 10 archivos:
  1. `client/views/giveaway-detail.view.ts`: Línea 1667 (`#call`)
  2. `public/views/legal/responsible-gaming.html`: Línea 79 (`#call`)
  3. `admin/client/views/bank-accounts.view.ts`: Línea 415 (`#account_balance`)
  4. `admin/client/views/bank-accounts.view.ts`: Línea 420 (`#contactless`)
  5. `admin/client/views/customers.view.ts`: Línea 601 (`#call`)
  6. `admin/client/views/payments.view.ts`: Línea 675 (`#hourglass_empty`)
  7. `admin/public/views/customers/customers.html`: Línea 43 (`#call`)
  8. `admin/public/views/giveaways/giveaway-create.html`: Línea 144 (`#attach_money`)
  9. `admin/public/views/giveaways/giveaway-edit.html`: Línea 126 (`#attach_money`)
  10. `admin/public/views/giveaways/giveaways.html`: Línea 89 (`#casino`)
  11. `admin/public/views/winners/winners.html`: Línea 43 (`#call`)
- **Descripción Técnica**:
  Las vistas y plantillas invocan iconos mediante elementos `<use href="/icons.svg#NOMBRE"></use>`. Ambos archivos de sprite (`public/icons.svg` y `admin/public/icons.svg`) contienen 391 símbolos perfectamente definidos. Sin embargo, los 6 nombres listados (`call`, `account_balance`, `contactless`, `hourglass_empty`, `attach_money`, `casino`) **no existen** en el catálogo de símbolos de `icons.svg`.
- **Causa Raíz**:
  Alucinación típica de desarrollo con IA generativa, que asumió nombres comunes de Google Material Icons sin contrastar la existencia real de los IDs dentro del archivo SVG del repositorio.
- **Vector de Impacto / Riesgo**:
  Los navegadores son incapaces de resolver el fragmento del símbolo SVG externo, provocando que los botones de acción (ej. botón de llamada a clientes, badges de método de pago por tarjeta/CLABE, indicadores de sorteo o insignias de casino) se muestren como **espacios totalmente vacíos o invisibles**, afectando la usabilidad y la estética visual de la plataforma.
- **Parche de Remediación Propuesto**:
  Sustituir los símbolos alucinados por sus equivalentes exactos existentes dentro de `icons.svg`:
  - Cambiar `#call` por `#smartphone`
  - Cambiar `#account_balance` por `#account_balance_wallet`
  - Cambiar `#contactless` por `#credit_card`
  - Cambiar `#hourglass_empty` por `#schedule`
  - Cambiar `#attach_money` por `#paid`
  - Cambiar `#casino` por `#confirmation_number`

```diff
--- a/admin/client/views/bank-accounts.view.ts
+++ b/admin/client/views/bank-accounts.view.ts
@@ -415,2 +415,2 @@
-          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#account_balance"></use></svg>
+          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#account_balance_wallet"></use></svg>
@@ -420,2 +420,2 @@
-          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#contactless"></use></svg>
+          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#credit_card"></use></svg>
--- a/admin/client/views/payments.view.ts
+++ b/admin/client/views/payments.view.ts
@@ -675,2 +675,2 @@
-          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#hourglass_empty"></use></svg>
+          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#schedule"></use></svg>
--- a/admin/public/views/giveaways/giveaways.html
+++ b/admin/public/views/giveaways/giveaways.html
@@ -89,2 +89,2 @@
-          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#casino"></use></svg>
+          <svg class="component-icon" aria-hidden="true"><use href="/icons.svg#confirmation_number"></use></svg>
```

---

### BOR-CONS-06: Fuga de Memoria por Listener Global en Window sin Limpieza en la Barra Lateral del Admin

- **Severidad**: **MEDIO**
- **Componente**: Componente de Layout y Barra Lateral (`admin/client/components/layout.component.ts`)
- **Ubicación Exacta**: `admin/client/components/layout.component.ts`: Líneas 181–184 y 186–192
- **Descripción Técnica**:
  En la función `setupRailNavigation`, se suscribe un listener de eventos directamente sobre el objeto global `window`:
  ```typescript
  window.addEventListener('themechange', () => {
    updateThemeButtonState(sidebar);
  });
  ```
  Sin embargo, en la función `unmountSidebar()`, que se ejecuta cuando el usuario cierra sesión:
  ```typescript
  export function unmountSidebar(): void {
    if (sidebarInstance) {
      sidebarInstance.remove();
      sidebarInstance = null;
    }
    sidebarInitPromise = null;
  }
  ```
  No se invoca `window.removeEventListener`.
- **Causa Raíz**:
  Manejo incompleto del ciclo de vida de componentes desacoplados. Se destruyó el nodo DOM pero se dejó el listener global adjunto a `window`.
- **Vector de Impacto / Riesgo**:
  Dado que la función anónima mantiene en su closure la referencia al elemento `sidebar`, este elemento y todos sus nodos hijos quedan retenidos en el Garbage Collector de V8. Si un administrador inicia y cierra sesión reiteradas veces en la misma pestaña del navegador, se acumulan copias en memoria de la barra lateral.
- **Parche de Remediación Propuesto**:
  Almacenar la referencia al handler a nivel de módulo o asociar un `AbortController` y removerlo explícitamente en `unmountSidebar()`.

```diff
--- a/admin/client/components/layout.component.ts
+++ b/admin/client/components/layout.component.ts
@@ -166,2 +166,4 @@ function setupRailNavigation(sidebar: HTMLElement): void {
 
+  let themeChangeHandler: (() => void) | null = null;
+
   const handleToggleTheme = (e: Event) => {
@@ -181,3 +183,4 @@ function setupRailNavigation(sidebar: HTMLElement): void {
-  window.addEventListener('themechange', () => {
+  themeChangeHandler = () => {
     updateThemeButtonState(sidebar);
-  });
+  };
+  window.addEventListener('themechange', themeChangeHandler);
 }
@@ -186,2 +189,6 @@ export function unmountSidebar(): void {
+  if (themeChangeHandler) {
+    window.removeEventListener('themechange', themeChangeHandler);
+    themeChangeHandler = null;
+  }
   if (sidebarInstance) {
     sidebarInstance.remove();
     sidebarInstance = null;
```

---

### BOR-CONS-07: Violación de la Directiva de Posicionamiento de Banners de Error en Formulario Modal

- **Severidad**: **MEDIO**
- **Componente**: Componente Modal de Pago (`client/components/bank-info-modal.component.ts`)
- **Ubicación Exacta**: `client/components/bank-info-modal.component.ts`: Líneas 59–69
- **Descripción Técnica**:
  El banner de error del modal de pago está renderizado **arriba** de las acciones del formulario:
  ```html
  59:         <div class="banner banner--danger is-hidden" data-ref="split-modal-error"></div>
  60: 
  61:         <div class="payment-split__actions" data-ref="payment-actions">
  62:           <button type="button" class="component-button component-button--black component-button--h45 component-button--w-full" data-ref="btn-modal-upload-receipt">
  ...
  66:           <button type="button" class="component-button component-button--ghost component-button--h38 component-button--w-full" data-ref="btn-modal-close-split">
  ```
  Esto infringe frontalmente la regla de diseño definida en `AGENTS.md` Sección 5.1 y `GEMINI.md` Directiva 5: *"Los banners de error deben ubicarse siempre debajo de los botones de acción, nunca en la parte superior del formulario."*
- **Causa Raíz**:
  Descuido de maquetación UI al estructurar el layout flexbox del modal.
- **Vector de Impacto / Riesgo**:
  Inconsistencia visual y de experiencia de usuario en la aplicación principal, donde todos los demás formularios muestran el feedback de error inmediatamente al final del contenedor de acciones.
- **Parche de Remediación Propuesto**:
  Desplazar la etiqueta `<div class="banner banner--danger is-hidden" data-ref="split-modal-error"></div>` para que se posicione debajo de `<div class="payment-split__actions">`.

```diff
--- a/client/components/bank-info-modal.component.ts
+++ b/client/components/bank-info-modal.component.ts
@@ -58,4 +58,2 @@
         </div>
-
-        <div class="banner banner--danger is-hidden" data-ref="split-modal-error"></div>
 
         <div class="payment-split__actions" data-ref="payment-actions">
@@ -68,3 +66,5 @@
         </div>
+
+        <div class="banner banner--danger is-hidden" data-ref="split-modal-error"></div>
       </div>
```

---

### BOR-CONS-08: Desalineación de Tipos Genéricos de Respuesta en Peticiones POST del Administrador

- **Severidad**: **MEDIO**
- **Componente**: Servicios y Vistas del Cliente Administrativo (`admin/client/views/`)
- **Ubicación Exacta**:
  - `admin/client/views/bank-accounts.view.ts`: Línea 662
  - `admin/client/views/payments.view.ts`: Línea 866
  - `admin/client/views/payments.view.ts`: Línea 912
- **Descripción Técnica**:
  En las tres peticiones mencionadas, el cliente tipifica la llamada a la API esperando una propiedad envuelta dentro del payload `data`:
  1. En `bank-accounts.view.ts:662`: `postApi<{ account: BankAccountDetail }>('/api/bank-accounts', ...)`
     Pero el backend (`admin/src/routes/bank-accounts.routes.ts:114`) devuelve `{ success: true, data: created, message: '...' }`, donde `data` es directamente la cuenta `BankAccountDetail`.
  2. En `payments.view.ts:866` y `line 912`: `postApi<{ order: AdminOrderDetail }>(/api/orders/${uuid}/approve, ...)`
     Pero el backend (`admin/src/controllers/orders.controller.ts:105, 149`) devuelve `{ success: true, data: result.order, message: '...' }`, donde `data` es directamente la orden `AdminOrderDetail`.
- **Causa Raíz**:
  Discrepancia de convención entre desarrolladores frontend y backend respecto a si las respuestas `POST` debían envolver la entidad en un nombre semántico (`{ account: ... }`) o entregar la entidad raíz en `data`.
- **Vector de Impacto / Riesgo**:
  Actualmente las vistas solo verifican `if (res.success) { this._loadData(); }`. Sin embargo, si en cualquier refactorización futura o extensión de lógica se intenta leer `res.data.account` o `res.data.order`, el valor evaluará a `undefined`, introduciendo errores silenciosos en tiempo de ejecución.
- **Parche de Remediación Propuesto**:
  Alinear los parámetros genéricos en los controladores del cliente para que coincidan con la estructura real del payload:

```diff
--- a/admin/client/views/bank-accounts.view.ts
+++ b/admin/client/views/bank-accounts.view.ts
@@ -662,1 +662,1 @@
-    const res = await postApi<{ account: BankAccountDetail }>('/api/bank-accounts', {
+    const res = await postApi<BankAccountDetail>('/api/bank-accounts', {
--- a/admin/client/views/payments.view.ts
+++ b/admin/client/views/payments.view.ts
@@ -866,1 +866,1 @@
-    const res = await postApi<{ order: AdminOrderDetail }>(`/api/orders/${orderUuid}/approve`, {
+    const res = await postApi<AdminOrderDetail>(`/api/orders/${orderUuid}/approve`, {
@@ -912,1 +912,1 @@
-    const res = await postApi<{ order: AdminOrderDetail }>(`/api/orders/${orderUuid}/reject`, {
+    const res = await postApi<AdminOrderDetail>(`/api/orders/${orderUuid}/reject`, {
```

---

### BOR-CONS-09: Claves de Traducción Faltantes en el Diccionario Internacional (`es-MX.json`)

- **Severidad**: **MEDIO**
- **Componente**: Módulo de Internacionalización y Plantillas Legales (`public/translations/es-MX.json`, `public/views/legal/terms.html`)
- **Ubicación Exacta**:
  - `public/views/legal/terms.html`: Líneas 75–76 (`legal.terms_sec6_item1`, `legal.terms_sec6_item2`)
  - `client/components/layout.component.ts`: Línea 44 (`legal.subtitle`)
  - `client/components/daily-giveaway-card.component.ts`: Líneas 216, 221 (`daily.live_pot_badge`, `daily.pot_label`)
- **Descripción Técnica**:
  El motor de traducción `i18n.service.ts` inspecciona los atributos `data-i18n` en las plantillas HTML para inyectar las cadenas correspondientes. En la página de términos legales (`terms.html`), los elementos:
  ```html
  <li data-i18n="legal.terms_sec6_item1"></li>
  <li data-i18n="legal.terms_sec6_item2"></li>
  ```
  no encuentran sus claves en `public/translations/es-MX.json`.
- **Causa Raíz**:
  Adición de nuevas secciones legales en HTML sin registrar las cadenas correspondientes en el diccionario de localización en español.
- **Vector de Impacto / Riesgo**:
  Los puntos 1 y 2 de la Sección 6 en los Términos y Condiciones oficiales se renderizan en el navegador como viñetas vacías sin ningún texto visible, generando una impresión de sitio web incompleto o descuidado.
- **Parche de Remediación Propuesto**:
  Incorporar las definiciones faltantes en `public/translations/es-MX.json`:

```json
{
  "legal": {
    "subtitle": "Información regulatoria, bases de sorteos y políticas de servicio.",
    "terms_sec6_item1": "Subir el comprobante de transferencia bancaria oficial a través de la plataforma.",
    "terms_sec6_item2": "Verificación automática contra la infraestructura CEP del Banco de México (Banxico)."
  }
}
```

---

### BOR-CONS-10: Infracción del Orden Estricto de Atributos HTML en Plantillas TypeScript Inline

- **Severidad**: **BAJO / MEJORA**
- **Componente**: Vistas Administrativas en TypeScript (`admin/client/views/`)
- **Ubicación Exacta**: 7 instancias identificadas:
  1. `admin/client/views/bank-accounts.view.ts:623`: `<input type="checkbox" class="bank-checkbox-input" ...>`
  2. `admin/client/views/bank-accounts.view.ts:809`: `<input type="checkbox" ...>` (falta `class` como primer atributo)
  3. `admin/client/views/customers.view.ts:600`: `<a href="${whatsappLink}" class="component-button ...">`
  4. `admin/client/views/dashboard.view.ts:439`: `<td colspan="7" class="dashboard-table-empty">`
  5. `admin/client/views/giveaway-create.view.ts:423`: `<input type="checkbox" ...>` (falta `class`)
  6. `admin/client/views/giveaway-edit.view.ts:295`: `<input type="checkbox" ...>` (falta `class`)
  7. `admin/client/views/payments.view.ts:667`: `<a href="/api/orders/..." class="action-btn" ...>`
- **Descripción Técnica**:
  La regla de orden de atributos de `AGENTS.md` Sección 4 especifica que para todo elemento que no sea `<button>`, el atributo `class` **debe ser siempre el primero**. En los literales de plantilla indicados, atributos como `type`, `href` o `colspan` preceden a `class`.
- **Causa Raíz**:
  Generación manual o asistida por IA de plantillas literales de string en TypeScript sin verificación del linter de atributos HTML.
- **Vector de Impacto / Riesgo**:
  No provoca fallas funcionales en el navegador, pero representa un incumplimiento de la convención de estilo y uniformidad del monorepo.
- **Parche de Remediación Propuesto**:
  Reordenar los atributos para garantizar que `class` encabece la declaración:
  - En `bank-accounts.view.ts:623`: `<input class="bank-checkbox-input" type="checkbox" data-ref="check-apply-all-giveaways" checked />`
  - En `customers.view.ts:600`: `<a class="component-button component-button--outline component-button--sm" href="${whatsappLink}" target="_blank" rel="noopener noreferrer">`
  - En `dashboard.view.ts:439`: `<td class="dashboard-table-empty" colspan="7">`
  - En `payments.view.ts:667`: `<a class="action-btn" href="/api/orders/${order.uuid}/receipt" target="_blank" download="${order.receipt_filename || 'comprobante'}" data-tooltip="Descargar comprobante" aria-label="Descargar comprobante">`

---

### BOR-CONS-11: Código Muerto y Abandonado en Componente `DailyGiveawayCardComponent`

- **Severidad**: **BAJO / MEJORA**
- **Componente**: Componente UI del Cliente (`client/components/daily-giveaway-card.component.ts`)
- **Ubicación Exacta**: Archivo completo `client/components/daily-giveaway-card.component.ts` (230 líneas)
- **Descripción Técnica**:
  El archivo define la clase `DailyGiveawayCardComponent`. Un análisis de referencias cruzadas en todo el proyecto demostró que esta clase no es importada ni instanciada en ningún punto del cliente ni del panel administrativo.
- **Causa Raíz**:
  El componente de sorteo diario fue reimplementado e integrado directamente dentro de `client/views/home.view.ts`, dejando el archivo original como código remanente.
- **Vector de Impacto / Riesgo**:
  Incrementa innecesariamente el peso del repositorio, confunde a futuros desarrolladores e introduce advertencias potenciales de internacionalización debido a que utiliza claves no presentes en `es-MX.json`.
- **Parche de Remediación Propuesto**:
  Eliminar de forma segura el archivo `client/components/daily-giveaway-card.component.ts` del árbol de código fuente.

---

### BOR-CONS-12: Endpoints Backend Huérfanos sin Consumo en SPA Propia

- **Severidad**: **BAJO / MEJORA**
- **Componente**: Controladores de Rutas Express (`admin/src/routes/winners.routes.ts`, `src/routes/orders.routes.ts`)
- **Ubicación Exacta**:
  - `admin/src/routes/winners.routes.ts`: Línea 42 (`GET /api/winners/:uuid`)
  - `src/routes/orders.routes.ts`: Línea 42 (`GET /api/orders/:uuid/receipt`)
- **Descripción Técnica**:
  1. `GET /api/winners/:uuid` (Admin): La vista administrativa `admin/client/views/winners.view.ts` descarga la colección completa mediante `GET /api/winners` y maneja el modal de detalles filtrando el objeto en el arreglo local en memoria `this.winners`, sin llegar a invocar el endpoint unitario.
  2. `GET /api/orders/:uuid/receipt` (App Principal Puerto 3000): En la SPA pública, los campos `receipt_url` y `receipt_filename` son enmascarados con `null` por privacidad. La descarga del comprobante es una función operada exclusivamente por el panel administrativo en el puerto 3001.
- **Causa Raíz**:
  Endpoints implementados para completar operaciones CRUD estándar, pero que la lógica de las interfaces cliente no requiere consumir directamente.
- **Vector de Impacto / Riesgo**:
  Bajo. En el caso de `GET /api/winners/:uuid`, puede conservarse para posibles integraciones de API futuras o eliminarse para reducir la superficie de ataque. En el caso de `GET /api/orders/:uuid/receipt`, si no está previsto que los usuarios finales descarguen comprobantes en la app pública, el endpoint puede ser deprecado.
- **Parche de Remediación Propuesto**:
  Documentar los endpoints en la especificación OpenAPI o deprecar `GET /api/orders/:uuid/receipt` en el puerto 3000 si la descarga del comprobante se mantiene como función exclusiva del puerto 3001.

---

## 5. CERTIFICACIONES DE CUMPLIMIENTO ARQUITECTÓNICO (VERIFICACIONES POSITIVAS)

Durante la auditoría se verificaron rigurosamente los siguientes pilares clave de la arquitectura, certificando su pleno cumplimiento con las directivas del monorepo:

### 5.1 Certificación de Cero IDs y Cero `getElementById`
- **Inspección**: Búsqueda global de expresiones regulares `id="` en plantillas HTML (`public/views/**/*.html`, `admin/public/views/**/*.html`, `index.html`, `admin/index.html`).
- **Resultado**: **0 ocurrencias** en elementos DOM estándar. La única presencia de identificadores corresponde a `<linearGradient id="...">` dentro de etiquetas `<defs>` en archivos de diseño vectorial SVG (`client/graphics/empty-illustrations.graphics.ts`), lo cual cumple estrictamente con el estándar W3C SVG.
- **Inspección JS/TS**: Búsqueda global de `document.getElementById` en `client/` y `admin/client/`.
- **Resultado**: **0 ocurrencias**. Todo el código utiliza de forma unificada `querySelector('[data-ref="..."]')` y `querySelectorAll`.

### 5.2 Certificación de Prohibición de `console.*` y Logging Centralizado
- **Inspección Backend**: Búsqueda de `console\.(log|warn|error|info|debug)` en `src/` y `admin/src/`.
- **Resultado**: **0 ocurrencias**. El 100% de los logs de backend se canalizan a través del servicio centralizado `Logger` (`logger.app`, `logger.db`, `logger.security`), con sanitización automática de datos sensibles y rotación diaria en `logs/`.
- **Inspección Frontend**: Búsqueda en `client/` y `admin/client/`.
- **Resultado**: En `admin/client/` existen **0 ocurrencias**. En `client/` existen exactamente 11 llamadas, todas concentradas exclusivamente en `client/services/websocket.service.ts` para depuración de la conexión en tiempo real, lo cual está autorizado explícitamente como la única excepción por la Sección 2.1 de `AGENTS.md`.

### 5.3 Certificación de Cero DDL Inline
- **Inspección**: Búsqueda de comandos DDL (`CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `CREATE KEYSPACE`) en código TypeScript.
- **Resultado**: **0 ocurrencias**. La totalidad de los esquemas, tablas, índices y procedimientos residen exclusivamente en los archivos fuente correspondientes: `database/db_lottery.sql` para MySQL y `database/db_cassandra.cql` para Apache Cassandra.

### 5.4 Certificación de Seguridad en Cassandra y Tolerancia a Fallos
- **Inspección**: Revisión de sentencias CQL en `src/services/audit.service.ts`.
- **Resultado**: El 100% de las consultas a Cassandra utilizan sentencias preparadas (`{ prepare: true }`) y batching tipado. Ante indisponibilidad del nodo o fallas de conexión, el servicio registra la desconexión mediante `markCassandraDisconnected()`, escribe el evento en `logger.db.error` y degrada elegantemente sin interrumpir las peticiones HTTP del usuario.

### 5.5 Certificación de Concurrencia en Conciliación de Pagos (`payment_worker/main.py`)
- **Inspección**: Revisión del worker en Python para el procesamiento de pagos y verificación SPEI.
- **Resultado**: Las reservas por lote emplean `SELECT ... FOR UPDATE SKIP LOCKED` para prevenir condiciones de carrera entre múltiples workers. Cada orden procesada adquiere un bloqueo distribuido en Redis (`boreal:lock:order:{order_id}`) con expiración de 180 segundos liberado en bloque `finally`, y cuenta con validación anti-repetición de claves de rastreo de Banxico (`tracking_key`).

---

## 6. MATRIZ EXHAUSTIVA DE MAPEO DE RUTAS EXPRESS VS INVOCACIONES CLIENTE

### 6.1 Catálogo de Rutas en Puerto 3000: Aplicación Pública (`src/` vs `client/`)
Cobertura: **14 Rutas** (13 Endpoints HTTP en Express + 1 Upgrade Handler a WebSocket).

| # | Método | Ruta / Endpoint | Controlador Backend (Archivo:Línea) | Método Cliente (Archivo:Línea) | Parámetros / Payload | Contrato de Respuesta | Estado de Sincronización |
|:---:|:---:|---|---|---|---|---|:---:|
| **1** | `GET` | `/api/giveaways` | `src/controllers/giveaways.controller.ts:6` (`listActiveGiveaways`) | `client/services/giveaways.service.ts:16` (`fetchActiveGiveaways`) | Ninguno | `{ success: true, data: Giveaway[] }` | **100% Sincronizado** |
| **2** | `GET` | `/api/giveaways/daily` | `src/controllers/giveaways.controller.ts:105` (`getDailyGiveawayHandler`) | `client/services/giveaways.service.ts:62` (`fetchDailyGiveaway`) | Ninguno | `{ success: true, data: { giveaway, recentWinners } }` | **100% Sincronizado** |
| **3** | `GET` | `/api/giveaways/daily/winners` | `src/controllers/giveaways.controller.ts:134` (`getDailyWinnersHandler`) | `client/services/giveaways.service.ts:67` (`fetchDailyWinners`) | Query: `limit` (opcional, default 5) | `{ success: true, data: DailyGiveawayWinnerItem[] }` | **100% Sincronizado** |
| **4** | `GET` | `/api/giveaways/winners` | `src/controllers/giveaways.controller.ts:22` (`listWinnersHandler`) | `client/services/giveaways.service.ts:21` (`fetchWinnersGiveaways`) | Ninguno | `{ success: true, data: WinnerGiveawayItem[] }` | **100% Sincronizado** |
| **5** | `GET` | `/api/giveaways/:uuid/tickets` | `src/controllers/giveaways.controller.ts:72` (`getGiveawayTicketsHandler`) | `client/services/giveaways.service.ts:57` (`fetchGiveawayTickets`) | Path: `:uuid` | `{ success: true, data: GiveawayTicketsData }` | **100% Sincronizado** |
| **6** | `GET` | `/api/giveaways/:uuid` | `src/controllers/giveaways.controller.ts:39` (`getGiveawayDetail`) | `client/services/giveaways.service.ts:52` (`fetchGiveawayDetail`) | Path: `:uuid` | `{ success: true, data: Giveaway }` | **100% Sincronizado** |
| **7** | `POST` | `/api/orders/reserve` | `src/controllers/orders.controller.ts:28` (`reserveOrderHandler`) | `client/services/orders.service.ts:17` (`reserveTicketsApi`) | Body: `{ customerName, customerPhone, customerState, giveawayUuid, ticketNumbers }` | `{ success: true, data: { order, bankAccounts } }` | **100% Sincronizado** |
| **8** | `POST` | `/api/orders/lookup` | `src/controllers/orders.controller.ts:202` (`lookupOrdersHandler`) | `client/services/orders.service.ts:30` (`lookupOrdersApi`) | Body: `{ phone }` | `{ success: true, data: Order[] }` | **100% Sincronizado** |
| **9** | `POST` | `/api/orders/upload-receipt` | `src/controllers/orders.controller.ts:309` (`uploadReceiptHandler`) | `client/services/orders.service.ts:40` (`uploadReceiptApi`) | Body: `{ imageBase64, orderUuid, trackingKey?, bankReference? }` | `{ success: true, data: Order, message: string }` | **100% Sincronizado** |
| **10** | `GET` | `/api/orders/bank-accounts` | `src/controllers/orders.controller.ts:292` (`getBankAccountsHandler`) | `client/services/orders.service.ts:49` (`fetchBankAccountsApi`) | Query: `giveaway` (UUID opcional) | `{ success: true, data: BankAccount[] }` | **100% Sincronizado** |
| **11** | `GET` | `/api/orders/:uuid` | `src/controllers/orders.controller.ts:241` (`getOrderDetailHandler`) | `client/services/orders.service.ts:56` (`fetchOrderDetailApi`) | Path: `:uuid` | `{ success: true, data: Order }` | **100% Sincronizado** |
| **12** | `GET` | `/api/orders/:uuid/receipt` | `src/controllers/orders.controller.ts:464` (`getOrderReceiptHandler`) | **Ninguno en SPA** | Path: `:uuid`, Query: `phone` | Stream binario PDF/Imagen | **Endpoint Huérfano en Puerto 3000** |
| **13** | `GET` | `/api/health` | `src/controllers/health.controller.ts:4` (`getHealthStatus`) | `deployment/scripts/boreal_watchdog.py:38` | Ninguno | `{ status: 'healthy', timestamp }` | **Sonda de Monitoreo Operativo** |
| **14** | `WS` | `/ws` | `src/index.ts:213` (Upgrade -> Rust Microservice en puerto 3008) | `client/services/websocket.service.ts:30` (`initWebSocket`) | Protocolo WebSocket | Tramas de eventos JSON | **100% Sincronizado** |

---

### 6.2 Catálogo de Rutas en Puerto 3001: Panel Administrativo (`admin/src/` vs `admin/client/`)
Cobertura: **39 Rutas Express**.

| # | Método | Ruta / Endpoint | Controlador Backend (Archivo:Línea) | Invocación Cliente (Archivo:Línea) | Parámetros / Payload | Contrato de Respuesta | Estado de Sincronización |
|:---:|:---:|---|---|---|---|---|:---:|
| **1** | `POST` | `/api/auth/login` | `admin/src/controllers/auth.controller.ts:19` | `admin/client/services/auth.service.ts:38` | Body: `{ email, password }` | `{ success, data: { token, user }, message }` | **100% Sincronizado** |
| **2** | `GET` | `/api/auth/me` | `admin/src/controllers/auth.controller.ts:75` | `admin/client/services/auth.service.ts:19` | Header Cookie/Bearer | `{ success, data: { user } }` | **100% Sincronizado** |
| **3** | `POST` | `/api/auth/logout` | `admin/src/controllers/auth.controller.ts:108` | `admin/client/services/auth.service.ts:54` | Header Cookie/Bearer | `{ success, message }` | **100% Sincronizado** |
| **4** | `GET` | `/api/health` | `admin/src/routes/health.routes.ts:8` | **Ninguno en SPA** | Ninguno | `{ status, services: { database, redis } }` | **Sonda de Monitoreo** |
| **5** | `GET` | `/api/bank-accounts/kpis` | `admin/src/routes/bank-accounts.routes.ts:7` | `admin/client/views/bank-accounts.view.ts:338` | Ninguno | `{ success, data: BankAccountsKpis }` | **100% Sincronizado** |
| **6** | `GET` | `/api/bank-accounts` | `admin/src/routes/bank-accounts.routes.ts:23` | `admin/client/views/bank-accounts.view.ts:360` | Query: `search`, `status` | `{ success, data: BankAccountDetail[] }` | **100% Sincronizado** |
| **7** | `GET` | `/api/bank-accounts/:uuid` | `admin/src/routes/bank-accounts.routes.ts:42` | `admin/client/views/bank-accounts.view.ts:777` | Path: `:uuid` | `{ success, data: { account, giveaways } }` | **100% Sincronizado** |
| **8** | `POST` | `/api/bank-accounts` | `admin/src/routes/bank-accounts.routes.ts:66` | `admin/client/views/bank-accounts.view.ts:662` | Body: `CreateBankAccountInput` | `{ success, data: BankAccountDetail, message }` | **Desalineación de Tipo** (Cliente espera `{ account: ... }`) |
| **9** | `PUT` | `/api/bank-accounts/:uuid` | `admin/src/routes/bank-accounts.routes.ts:83` | `admin/client/views/bank-accounts.view.ts:752` | Path: `:uuid`, Body: `UpdateBankAccountInput` | `{ success, data: BankAccountDetail, message }` | **100% Sincronizado** |
| **10** | `PATCH` | `/api/bank-accounts/:uuid/status` | `admin/src/routes/bank-accounts.routes.ts:101` | `admin/client/views/bank-accounts.view.ts:578` | Path: `:uuid`, Body: `{ isActive }` | `{ success, data: BankAccountDetail, message }` | **100% Sincronizado** |
| **11** | `PUT` | `/api/bank-accounts/:uuid/giveaways` | `admin/src/routes/bank-accounts.routes.ts:127` | `admin/client/views/bank-accounts.view.ts:850` | Path: `:uuid`, Body: `{ assignments }` | `{ success, data: BankAccountGiveawayAssignment[], message }` | **100% Sincronizado** |
| **12** | `DELETE` | `/api/bank-accounts/:uuid` | `admin/src/routes/bank-accounts.routes.ts:153` | `admin/client/views/bank-accounts.view.ts:885` | Path: `:uuid` | `{ success, message }` | **100% Sincronizado** |
| **13** | `GET` | `/api/customers/kpis` | `admin/src/routes/customers.routes.ts:7` | `admin/client/views/customers.view.ts:348` | Ninguno | `{ success, data: CustomersKpis }` | **100% Sincronizado** |
| **14** | `GET` | `/api/customers` | `admin/src/routes/customers.routes.ts:23` | `admin/client/views/customers.view.ts:370` | Query: `search`, `status` | `{ success, data: CustomerSummary[] }` | **100% Sincronizado** |
| **15** | `GET` | `/api/customers/:phone` | `admin/src/routes/customers.routes.ts:42` | `admin/client/views/customers.view.ts:535` | Path: `:phone` | `{ success, data: { customer, orders } }` | **100% Sincronizado** |
| **16** | `POST` | `/api/customers/:phone/block` | `admin/src/routes/customers.routes.ts:66` | `admin/client/views/customers.view.ts:647` | Path: `:phone`, Body: `{ customerName, reason }` | `{ success, message }` | **100% Sincronizado** |
| **17** | `DELETE` | `/api/customers/:phone/block` | `admin/src/routes/customers.routes.ts:84` | `admin/client/views/customers.view.ts:524` | Path: `:phone` | `{ success, message }` | **100% Sincronizado** |
| **18** | `GET` | `/api/dashboard/stats` | `admin/src/routes/dashboard.routes.ts:7` | `admin/client/views/dashboard.view.ts:142` | Query: `period` (`7d`, `30d`, `90d`, `year`) | `{ success, data: DashboardStatsData }` | **100% Sincronizado** |
| **19** | `GET` | `/api/giveaways` | `admin/src/routes/giveaways.routes.ts:7` | `admin/client/views/giveaways.view.ts:423` | Query: `search`, `status`, `type` | `{ success, data: AdminGiveawayItem[] }` | **100% Sincronizado** |
| **20** | `GET` | `/api/giveaways/config/daily` | `admin/src/routes/giveaways.routes.ts:27` | `admin/client/views/giveaways.view.ts:424` | Ninguno | `{ success, data: { isPaused } }` | **100% Sincronizado** |
| **21** | `POST` | `/api/giveaways/config/daily/schedule-pause` | `admin/src/routes/giveaways.routes.ts:43` | `admin/client/views/giveaways.view.ts:727` | Body: `{ pause: boolean }` | `{ success, data: { isPaused }, message }` | **100% Sincronizado** |
| **22** | `GET` | `/api/giveaways/bank-accounts` | `admin/src/routes/giveaways.routes.ts:64` | `admin/client/views/giveaways.view.ts:425` | Ninguno | `{ success, data: BankAccountItem[] }` | **100% Sincronizado** |
| **23** | `GET` | `/api/giveaways/:uuid` | `admin/src/routes/giveaways.routes.ts:80` | `admin/client/views/giveaway-edit.view.ts:202` | Path: `:uuid` | `{ success, data: AdminGiveawayItem }` | **100% Sincronizado** |
| **24** | `POST` | `/api/giveaways` | `admin/src/routes/giveaways.routes.ts:104` | `admin/client/views/giveaway-create.view.ts:540` | Body: `CreateGiveawayInput` | `{ success, data: AdminGiveawayItem, message }` | **100% Sincronizado** |
| **25** | `PUT` | `/api/giveaways/:uuid` | `admin/src/routes/giveaways.routes.ts:121` | `admin/client/views/giveaway-edit.view.ts:588` | Path: `:uuid`, Body: `UpdateGiveawayInput` | `{ success, data: AdminGiveawayItem, message }` | **100% Sincronizado** |
| **26** | `PATCH` | `/api/giveaways/:uuid/status` | `admin/src/routes/giveaways.routes.ts:139` | `admin/client/views/giveaways.view.ts:739, 807` | Path: `:uuid`, Body: `{ status, forceWithSales? }` | `{ success, data: AdminGiveawayItem, message }` | **100% Sincronizado** |
| **27** | `POST` | `/api/giveaways/:uuid/draw` | `admin/src/routes/giveaways.routes.ts:165` | `admin/client/views/giveaways.view.ts:760` | Path: `:uuid` | `{ success, data: AdminGiveawayItem, message }` | **100% Sincronizado** |
| **28** | `DELETE` | `/api/giveaways/:uuid` | `admin/src/routes/giveaways.routes.ts:183` | `admin/client/views/giveaways.view.ts:835` | Path: `:uuid` | `{ success, message }` | **100% Sincronizado** |
| **29** | `GET` | `/api/orders` | `admin/src/routes/orders.routes.ts:6` | `admin/client/views/payments.view.ts:489` | Query: `giveawayUuid`, `limit`, `page`, `search`, `status` | `{ success, data: AdminOrderSummary[], pagination }` | **100% Sincronizado** |
| **30** | `GET` | `/api/orders/kpis` | `admin/src/routes/orders.routes.ts:7` | `admin/client/views/payments.view.ts:446` | Ninguno | `{ success, data: PaymentKpis }` | **100% Sincronizado** |
| **31** | `GET` | `/api/orders/:uuid` | `admin/src/routes/orders.controller.ts:49` | `admin/client/views/payments.view.ts:637` | Path: `:uuid` | `{ success, data: AdminOrderDetail }` | **100% Sincronizado** |
| **32** | `GET` | `/api/orders/:uuid/receipt` | `admin/src/controllers/orders.controller.ts:206` | `admin/client/views/payments.view.ts:655, 667` | Path: `:uuid` | Stream binario PDF/Imagen | **100% Sincronizado** |
| **33** | `POST` | `/api/orders/:uuid/approve` | `admin/src/controllers/orders.controller.ts:82` | `admin/client/views/payments.view.ts:866` | Path: `:uuid`, Body: `{ notes }` | `{ success, data: AdminOrderDetail, message }` | **Desalineación de Tipo** (Cliente espera `{ order: ... }`) |
| **34** | `POST` | `/api/orders/:uuid/reject` | `admin/src/controllers/orders.controller.ts:118` | `admin/client/views/payments.view.ts:912` | Path: `:uuid`, Body: `{ reason }` | `{ success, data: AdminOrderDetail, message }` | **Desalineación de Tipo** (Cliente espera `{ order: ... }`) |
| **35** | `PATCH` | `/api/orders/:uuid/tracking-key` | `admin/src/controllers/orders.controller.ts:162` | `admin/client/views/payments.view.ts:814` | Path: `:uuid`, Body: `{ trackingKey }` | `{ success, data: AdminOrderDetail, message }` | **100% Sincronizado** |
| **36** | `GET` | `/api/winners/kpis` | `admin/src/routes/winners.routes.ts:7` | `admin/client/views/winners.view.ts:328` | Ninguno | `{ success, data: WinnersKpis }` | **100% Sincronizado** |
| **37** | `GET` | `/api/winners` | `admin/src/routes/winners.routes.ts:23` | `admin/client/views/winners.view.ts:350` | Query: `search`, `deliveryStatus` | `{ success, data: WinnerItem[] }` | **100% Sincronizado** |
| **38** | `GET` | `/api/winners/:uuid` | `admin/src/routes/winners.routes.ts:42` | **Ninguno en SPA** | Path: `:uuid` | `{ success, data: WinnerItem }` | **Endpoint Huérfano en Puerto 3001** |
| **39** | `PUT` | `/api/winners/:uuid/delivery` | `admin/src/routes/winners.routes.ts:66` | `admin/client/views/winners.view.ts:580` | Path: `:uuid`, Body: `UpdateWinnerDeliveryInput` | `{ success, data: WinnerItem, message }` | **100% Sincronizado** |

---

## 7. PLAN ESTRUCTURADO DE REMEDIACIÓN EN FASES

Para ejecutar la resolución de las observaciones detectadas de manera segura y sin interrumpir la operación del sistema, se propone la siguiente hoja de ruta secuencial:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       HOJA DE RUTA DE REMEDIACIÓN                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ FASE 1: Estabilidad Crítica y Seguridad de Datos                            │
│  - Reparar beginTransaction() dentro de try/finally (BOR-CONS-01)          │
│  - Adjuntar __controller en createWinnersView (BOR-CONS-02)                │
│  - Sanitizar err?.message en los 12 endpoints admin (BOR-CONS-03)           │
├─────────────────────────────────────────────────────────────────────────────┤
│ FASE 2: Integridad Visual de la UI y Experiencia de Usuario                │
│  - Sustituir los 11 iconos SVG rotos con símbolos válidos (BOR-CONS-05)     │
│  - Mover banner de error en bank-info-modal debajo de botones (BOR-CONS-07)│
│  - Añadir 5 claves faltantes a es-MX.json (BOR-CONS-09)                    │
│  - Limpiar listener global themechange en unmountSidebar (BOR-CONS-06)      │
├─────────────────────────────────────────────────────────────────────────────┤
│ FASE 3: Consistencia de Contratos de API y Arquitectura PBAC                │
│  - Corregir tipos genéricos en llamadas admin POST (BOR-CONS-08)            │
│  - Diseñar e incorporar middleware requirePermission PBAC (BOR-CONS-04)    │
├─────────────────────────────────────────────────────────────────────────────┤
│ FASE 4: Limpieza de Código y Formato Estricto                               │
│  - Reordenar atributos HTML en templates TS inline (BOR-CONS-10)            │
│  - Purgar componente muerto daily-giveaway-card.component.ts (BOR-CONS-11)  │
│  - Evaluar retención o deprecación de rutas huérfanas (BOR-CONS-12)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Metodología de Verificación Post-Remediación
Tras aplicar los parches descritos en cada fase, deberán ejecutarse los siguientes comandos de aseguramiento de calidad:

1. **Verificación de Tipos Estricta**:
   ```powershell
   npm run typecheck
   npm --prefix admin run typecheck
   ```
   *Criterio de Aceptación*: 0 errores de compilación TypeScript.
2. **Auditoría Automatizada de Iconos SVG**:
   ```powershell
   node f:/ProjectBoreal/.agents/explorer_frontend/check_icons.cjs
   ```
   *Criterio de Aceptación*: 0 iconos rotos o ausentes en cliente y admin.
3. **Auditoría de Atributos HTML y Cero IDs**:
   ```powershell
   node f:/ProjectBoreal/.agents/explorer_frontend/check_ts_html.cjs
   ```
   *Criterio de Aceptación*: 0 infracciones de orden de atributos.
4. **Verificación de Ausencia de Fuga de Errores de BD**:
   ```powershell
   Select-String -Path "admin/src/routes/*.ts" -Pattern "error:\s*err\?\.message"
   ```
   *Criterio de Aceptación*: 0 ocurrencias en todo el directorio de rutas.

---
**Fin del Documento Técnico de Auditoría.**
