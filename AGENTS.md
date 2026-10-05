# Instrucciones Maestras del Proyecto para Inteligencias Artificiales y Agentes (AGENTS.md)

Este documento define las reglas estrictas de desarrollo, seguridad, arquitectura y diseño que **TODAS** las Inteligencias Artificiales (Antigravity, Gemini, Claude, Cursor, Copilot, Windsurf, etc.) deben acatar al generar o modificar código en este repositorio.

---

## 1. Regla de Oro de Seguridad: CERO Exposición de Información Sensible al Frontend

1. **Respuestas HTTP Seguras**:
   - **NUNCA** envíes mensajes de error técnicos, consultas SQL, comandos Redis, trazas de depuración (stack traces), rutas de archivos del servidor ni detalles de excepciones internas en las respuestas HTTP hacia el frontend.
   - Si ocurre una excepción o error inesperado (código 500, 400, etc.), envía siempre un mensaje genérico, comprensible y seguro para el usuario final (ej. `"Ha ocurrido un error inesperado al procesar la solicitud. Por favor intenta más tarde."`).
   - Toda información técnica sensible, parámetros detallados y stack traces deben registrarse **exclusivamente** en el sistema de logging centralizado (`Logger`).

2. **Protección de Datos y Secretos**:
   - **NUNCA** incluyas en respuestas al cliente credenciales, hashes de contraseña (`password_hash`), tokens secretos internos, variables de entorno (`.env`) o claves privadas.
   - Sanitizar siempre los objetos de usuario antes de enviarlos (únicamente `id`, `username`, `email`, `avatar_url`).

---

## 2. Prohibición Total de `console.log`, `console.warn`, `console.error`

1. **Cero `console.*` en Código**:
   - Queda estrictamente prohibido utilizar `console.log`, `console.warn`, `console.error`, `console.info` o `console.debug` tanto en el backend (`src/`) como en el frontend (`client/`).
   - **Excepción Única**: Exclusivamente en `client/services/websocket.service.ts` se permite el uso de `console.log`, `console.warn` y `console.error` para monitoreo y depuración en tiempo real del ciclo de vida y eventos de la conexión WebSocket.
2. **Uso Obligatorio de `Logger`**:
   - En el backend, todos los registros deben realizarse a través del servicio centralizado `Logger` ([src/services/logger.service.ts](file:///f:/Spriteboard/src/services/logger.service.ts)), el cual escribe en archivos diarios en el directorio `logs/`.
   - Categorías disponibles:
     - `logger.app`: Eventos generales del ciclo de vida de la aplicación, inicio del servidor, rutas y peticiones.
     - `logger.db`: Conexiones a bases de datos (MySQL, Redis, futuras NoSQL), ejecuciones de queries, migraciones y errores de persistencia.
     - `logger.security`: Intentos de autenticación (éxitos/fallos), ataques o fallos CSRF, validación/consumo de códigos de verificación y accesos restringidos.
   - El logger sanitiza automáticamente campos sensibles como `password`, `token`, `secret`, `cookie`, etc.

---

## 3. Reglas Estrictas de HTML y DOM (CERO IDs)

1. **Prohibido el uso de `id`**:
   - **NUNCA** agregues atributos `id="..."` a ningún elemento HTML.
   - **NUNCA** utilices `document.getElementById(...)` en JavaScript.
   - Para identificar elementos o vincular componentes con JavaScript, utiliza exclusivamente atributos de datos semánticos: `data-ref="..."` (ej. `data-ref="btn-submit-login"`).
   - En JavaScript, selecciona elementos usando `querySelector('[data-ref="..."]')` o `querySelectorAll(...)`.

2. **Campos de Formulario Flotantes**:
   - Para inputs y etiquetas, envuelve el `<input>` dentro de `<label class="field" data-ref="...">`. Esto vincula el campo de forma nativa e inclusiva sin requerir atributos `id` ni `for`.

---

## 4. Orden Estricto de Atributos en HTML

Al escribir o modificar plantillas HTML, los atributos deben ordenarse de acuerdo a las siguientes reglas:

1. **Para botones (`<button>`)**:
   - El atributo `type` **debe ser siempre el primero**, seguido de `class`, luego `data-ref`, y finalmente los demás atributos (`data-tooltip`, `aria-label`, etc.).
   ```html
   <button type="button" class="component-button component-button--h55 component-button--black component-button--w-full" data-ref="btn-submit-stage1">
   <button type="button" class="field__action" data-ref="btn-random-username" data-tooltip="Generar nombre aleatorio" aria-label="Generar nombre aleatorio">
   ```

2. **Para cualquier otro elemento (`<div>`, `<a>`, `<label>`, `<input>`, `<span>`, etc.)**:
   - El atributo `class` **debe ser siempre el primero**, seguido de `data-ref` (o `data-*`), y luego los demás atributos (`type`, `placeholder`, `href`, etc.).
   ```html
   <div class="menu-panel menu-panel--w-285 menu-panel--h-full" data-ref="main-menu">
   <input class="field__input field__input--has-action" data-ref="register-username" type="text" placeholder=" " autocomplete="username" />
   <a class="link" data-ref="btn-forgot-password" href="/forgot-password">
   ```

---

## 5. Diseño de Formularios y Banners de Error

1. **Ubicación de Banners de Notificación/Error**:
   - Los banners de error (`<div class="banner banner--danger" data-ref="...-error">`) deben ubicarse **siempre debajo de los botones de acción** (ej. debajo de los botones de "Continuar", "Continuar con Google" o "Verificar"), nunca en la parte superior del formulario.
2. **Labels Flotantes**:
   - Todos los inputs utilizan la técnica de label flotante con la estructura `.field` > `.field__input` + `.field__label`.

---

## 6. Organización Modular del Código

1. **Estructura Backend (`src/`)**:
   - `src/config/`: Conexiones y configuraciones (`database.ts`, `redis.ts`, `env.ts`, `email-templates.json`).
   - `src/services/`: Lógica de negocio pura (`logger.service.ts`, `auth.service.ts`, `mail.service.ts`, `verification.service.ts`, etc.).
   - `src/controllers/`: Manejadores de rutas HTTP Express.
   - `src/middlewares/`: Middlewares globales y de ruta (`auth.middleware.ts`, `csrf.middleware.ts`).
   - `src/routes/`: Definición y montaje de rutas.
   - `src/types/`: Interfaces y tipos TypeScript.
   - `src/utils/`: Validadores y utilidades puras.

2. **Estructura Frontend TypeScript (`client/`) y Assets (`public/`)**:
   - `client/app-main.ts`: Punto de entrada principal de la SPA frontend.
   - `client/app-router.ts`: Enrutador cliente y ciclo de vida de navegación SPA.
   - `client/views/`: Vistas y controladores TypeScript (`auth.view.ts`, `settings.view.ts`, `home.view.ts`, etc.).
   - `client/components/`: Componentes modulares TypeScript (`layout.component.ts`, `modal.component.ts`).
   - `client/services/`: Servicios cliente TypeScript (`api.service.ts`, `i18n.service.ts`, `websocket.service.ts`, etc.).
   - `client/types/`: Interfaces y tipos TypeScript del frontend (`auth.types.ts`, `subscription.types.ts`, `common.types.ts`).
   - `client/utils/`: Utilidades cliente (`dom.util.ts`, `validators.util.ts`, `languages.util.ts`).
   - `client/config/`: Configuraciones de rutas y skeletons (`skeleton-routes.ts`, `skeleton-templates.ts`).
   - `public/views/`: Archivos de plantilla `.html` puros organizados temáticamente (`auth/`, `settings/`, `home/`, `error/`).
   - `public/css/`: Hojas de estilo modulares con metodología BEM (`root.css` para tokens de diseño y temas, y carpeta `components/` con componentes atómicos `component-buttons.css`, `component-forms.css`, `component-feedback.css`, `component-layout.css`, `component-overlays.css`, y módulos de dominio/canvas cargados bajo demanda).
   - **Compilador / Bundler**: Vite en modo middleware Express para desarrollo (`npm run dev`) y compilación de producción a `dist/client/` (`npm run build`). Verificación de tipos con `npm run typecheck`.

---

## 7. Reglas Estrictas de Imports en JavaScript y TypeScript

1. **Formato Horizontal de Imports**:
   - Cada instrucción `import` debe declararse en **una sola línea horizontal**, sin saltos de línea entre llaves `{ ... }`.
2. **Orden Alfabético por Ruta / Módulo**:
   - Todas las sentencias `import` al inicio del archivo deben ordenarse **alfabéticamente** según la ruta o nombre del módulo origen.
3. **Orden Alfabético de Miembros Nombrados**:
   - Dentro de `{ ... }`, los elementos importados deben listarse estrictamente en **orden alfabético**.

```javascript
import { navigate } from '../app-router.js';
import { clearUserState, currentUser, getApi, postApi, setCurrentUser } from '../services/api.service.js';
import { getCurrentLanguage, setLanguage, t } from '../services/i18n.service.js';
import { showToast } from '../services/toast.service.js';
import { debounce, setupDropdown, withButtonLoading } from '../utils/dom.util.js';
```

---

## 8. Cero Anotaciones y Cero Comentarios Explicativos

1. **Código 100% Auto-documentado**:
   - Queda estrictamente prohibido utilizar JSDoc (`/** ... */`), PHPDoc o anotaciones de parámetros.
   - Queda prohibido incluir bloques de cabecera decorativos (`/* ====== SECCIÓN ====== */`) o comentarios inline que describan código evidente.
   - Todo el código debe ser limpio, conciso y auto-explicativo.

---

## 9. Estructura Estándar de Archivos y Controladores JS

1. **Secuencia de Estructura**:
   - **Imports**: Horizontales y alfabéticos.
   - **Constantes / Estado Encapsulado**: A nivel de módulo.
   - **Clase / Controlador**:
     - `constructor()`: Bind de handlers (`this._boundClick = this.handleClick.bind(this)`), instanciación de servicios.
     - `init()`: AbortController, contenedor DOM (`data-ref`), `this.bindEvents()`, carga de datos.
     - `bindEvents()`: Asocia listeners delimitados al contenedor.
     - `destroy()`: AbortController.abort(), remueve todos los event listeners.
     - Event Handlers (`handleClick`, `handleSubmit`).
     - Métodos Privados / Auxiliares (`_loadData`, `_render`).
   - **Exportaciones Limpias**: Al final del archivo.

---

## 10. Control de Acceso Estricto Basado en Permisos (PBAC)

1. **CERO Autorización por Roles Directos**:
   - **NUNCA** utilices el rol de un usuario (`user.role === '...'`, `roles.includes('...')`, `requireRole(...)`) para controlar acceso a rutas, servicios o lógica de negocio.
   - Los roles existen únicamente como contenedores o agrupadores de permisos en la base de datos (`role_permissions`). Toda verificación de acceso debe realizarse a través de permisos específicos (`hasPermission`, `requirePermission`, `hasAllPermissions`).

2. **CERO Autorización por Nombres de Suscripción Directos**:
   - **NUNCA** concedas o restrinjas funciones comparando cadenas de planes o suscripciones (`subscription_tier === '...'`).
   - El acceso a funciones premium (equipos, kits de marca, herramientas IA, SSO corporativo, etc.) se rige **exclusivamente por los permisos activos** conferidos por la suscripción (`subscription:feature:*`), verificados mediante `hasSubscriptionFeature` o el middleware `requireFeature`.

---

## 11. Esquemas de Base de Datos y Scripts de Arranque (CERO DDL Inline)

1. **Scripts SQL como Única Autoridad**:
   - Toda creación o modificación de tablas, columnas e índices debe residir exclusivamente en los scripts de arranque en `database/` (`database/db_identity.sql`, `database/db_canvas.sql` y `database/db_cassandra.cql`).
   - Queda estrictamente prohibido colocar sentencias DDL (`CREATE TABLE`, `ALTER TABLE`) o migraciones automáticas inline dentro de `src/config/database.config.ts` o servicios backend.
