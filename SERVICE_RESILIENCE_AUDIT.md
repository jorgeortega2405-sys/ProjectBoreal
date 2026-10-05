# Auditoría de Estabilidad, Resiliencia y Continuidad Operativa (Project Boreal)

**Objetivo del Sistema:** Plataforma web de alta disponibilidad y bajo mantenimiento para sorteos y venta de boletos, diseñada para operar sin interrupciones con únicamente 1 o 2 actualizaciones anuales.

---

## 1. Resumen Ejecutivo de Disponibilidad

Para garantizar que un sistema funcione de forma autónoma durante 6 a 12 meses sin intervención manual, no basta con evitar errores de sintaxis; es imperativo mitigar los **tres grandes destructores silenciosos** de sistemas a largo plazo:
1. **Agotamiento de Recursos Físicos:** Saturación del disco duro por acumulación de logs diarios no rotados y almacenamiento indefinido de comprobantes; fugas de descriptores de archivos (*file descriptors* / `ulimit`) y fugas de memoria en buffers de imagen.
2. **Procesos Zombi y Fallos Desapercibidos:** Procesos que se quedan bloqueados en llamadas de red (Banxico/CEP, OCR o sockets) sin emitir errores fatales, pareciendo "Up" en Docker pero sin procesar órdenes.
3. **Muerte por Excepciones No Atrapadas:** Cierre abrupto del runtime Node.js por promesas rechazadas en temporizadores (`setInterval`) o sockets desconectados abruptamente durante el handshake de WebSockets.

---

## 2. Catálogo de Vectores de Caída Identificados y Mitigaciones

| ID | Componente | Vector de Riesgo | Severidad | Estado | Mitigación Implementada |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **V-01** | Node.js Core | Ausencia de listeners globales `uncaughtException` y `unhandledRejection` en `src/index.ts`. Cualquier error asíncrono no capturado provocaba el cierre del proceso. | **Crítica** | **Mitigado** | Listeners de proceso agregados con registro en `Logger.app.error` y contención. |
| **V-02** | Node.js Crons | Promesas no controladas en `startScheduledTasks()`. `setInterval` recibía callbacks `async` sin `.catch()`. | **Crítica** | **Mitigado** | Clausuras con `try/catch` robusto y `.catch(err => ...)` en cada intervalo. |
| **V-03** | Cassandra Config | Estado de conexión `isCassandraConnected` estático. Si Cassandra caía tras el arranque, la variable quedaba en `true`, intentando lotes fallidos en cada orden. | **Alta** | **Mitigado** | Reseteo reactivo de bandera en fallos de ejecución y política de reconexión exponencial. |
| **V-04** | Python Worker | Fuga de descriptores de archivo en `fitz.open()` (PyMuPDF) dentro de `ocr_engine.py`. Los PDFs no se cerraban, agotando descriptores de SO tras miles de lecturas. | **Alta** | **Mitigado** | Bloques `try/finally` explícitos asegurando `doc.close()` e `img.close()`. |
| **V-05** | Python Worker | Inexistencia de mecanismo Heartbeat / Liveness. Si los hilos se bloqueaban en consultas Banxico o procesamiento OCR, el contenedor no se reiniciaba. | **Crítica** | **Mitigado** | Emisión periódica de Heartbeat en Redis (`boreal:worker:heartbeat`) con TTL estricto. |
| **V-06** | Docker Stack | `boreal-websocket` y `boreal-payment-worker` no contaban con `healthcheck` en `docker-compose.yml`. | **Alta** | **Mitigado** | Healthchecks nativos añadidos a ambos servicios con políticas de reintento automático. |
| **V-07** | Almacenamiento | Acumulación indefinida de logs (`logs/app`, `logs/db`, `logs/security`, `logs/worker`) y comprobantes en `storage/receipts/`. Llenado de disco en 6 meses. | **Crítica** | **Mitigado** | Servicio y script de mantenimiento preventivo (`maintenance.py`) con rotación, compresión y purga (>30 días). |
| **V-08** | Orquestación | Ausencia de un "Servicio de Levante" que supervise en tiempo real la salud de todos los contenedores y puertos y los reactive autónomamente. | **Crítica** | **Mitigado** | Creación del demonio supervisor `watchdog.py`, unidades `systemd` y configuración `ecosystem.config.cjs`. |
| **V-09** | Health Endpoint | `/api/health` no auditaba el microservicio WebSocket, el Payment Worker ni el estado de memoria del sistema. | **Media** | **Mitigado** | Ampliación de `/api/health` para auditar MySQL, Redis, Cassandra, Worker y WebSocket. |

---

## 3. Arquitectura del "Servicio de Levante" (Auto-Recovery Watchdog)

El **Servicio de Levante** (`deployment/scripts/watchdog.py`) actúa como un supervisor centinela que corre de forma continua e independiente.

### Ciclo de Inspección (Cada 15 segundos):
1. **Sonda HTTP Node.js (`/api/health`)**: Verifica que la aplicación principal responda HTTP 200/503. Si no responde tras 3 intentos, ejecuta un reinicio del proceso o contenedor.
2. **Sonda de Microservicio WebSocket (`/health`)**: Verifica conectividad TCP y respuesta HTTP contra el puerto 3008 de Rust. Si falla, reinicia el contenedor `boreal-websocket`.
3. **Sonda de Heartbeat del Payment Worker (`boreal:worker:heartbeat`)**: Lee la clave de Redis emitida por el worker en Python. Si el timestamp tiene más de 60 segundos de antigüedad o la clave no existe, el worker se declara congelado y se fuerza su reinicio automático.
4. **Sonda de Redis y MySQL**: Ejecuta PINGs directos. Si detecta contenedores detenidos, invoca la reactivación inmediata.
5. **Sonda de Umbral de Disco**: Verifica el porcentaje de espacio libre en disco. Si el uso supera el 85%, ejecuta automáticamente una purga de emergencia de logs antiguos y comprobantes temporales.
6. **Desbloqueo de Locks Zombis**: Si un proceso murió mientras sostenía un bloqueo distribuido en Redis (`boreal:lock:*`), el watchdog detecta la anomalía y libera el candado para evitar que las órdenes queden atrapadas.

---

## 4. Manual de Operación y Puesta en Marcha

Los siguientes mecanismos están disponibles para el despliegue del sistema:
- **Docker Compose Integral:** `docker-compose.yml` actualizado con healthchecks y reinicio automático `restart: unless-stopped`.
- **Servicio Systemd para Servidores Linux VPS/Dedicados:**
  - `boreal.service`: Servicio principal de la aplicación Node.js con `Restart=always`.
  - `boreal-watchdog.service`: Demonio supervisor de levante continuo.
  - `boreal-maintenance.timer`: Tarea programada diaria para rotación de logs y limpieza de disco.
- **PM2 Ecosystem:** `ecosystem.config.cjs` para despliegues con Node.js Cluster Mode y reinicio automático por límite de memoria (`max_memory_restart: '1G'`).
