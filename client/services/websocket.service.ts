type WebSocketHandler = (payload: any) => void;

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

function computeReconnectDelay(): number {
  const baseDelay = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts));
  const jitter = 0.5 + Math.random();
  return Math.floor(baseDelay * jitter);
}

const eventHandlers: Map<string, Set<WebSocketHandler>> = new Map();
const pendingMessages: any[] = [];

export function initWebSocket(): void {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  try {
    console.log('[WebSocket] Conectando a:', wsUrl);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[WebSocket] Conexión establecida exitosamente con el servidor Rust.');
      reconnectAttempts = 0;

      while (pendingMessages.length > 0 && ws?.readyState === WebSocket.OPEN) {
        const msg = pendingMessages.shift();
        try {
          ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
        } catch (_) {}
      }

      if (heartbeatTimer) clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'PING' }));
        }
      }, 30000);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'PONG') {
          return;
        }

        console.log('[WebSocket] Evento recibido:', data.type, data);

        const handlers = eventHandlers.get(data.type);
        if (handlers) {
          handlers.forEach((handler) => {
            try {
              handler(data);
            } catch (err) {
              console.error('[WebSocket] Error en handler para evento', data.type, err);
            }
          });
        }

        const allHandlers = eventHandlers.get('*');
        if (allHandlers) {
          allHandlers.forEach((handler) => {
            try {
              handler(data);
            } catch (err) {
              console.error('[WebSocket] Error en handler wildcard', err);
            }
          });
        }
      } catch (err) {
        console.warn('[WebSocket] Error al deserializar mensaje:', event.data, err);
      }
    };

    ws.onerror = (err) => {
      console.warn('[WebSocket] Error en la conexión WebSocket:', err);
    };

    ws.onclose = (event) => {
      console.log('[WebSocket] Conexión cerrada (code:', event.code, 'clean:', event.wasClean, ').');
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      ws = null;
      scheduleReconnect();
    };
  } catch (err) {
    console.error('[WebSocket] Error al inicializar conexión:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  const delay = computeReconnectDelay();
  reconnectAttempts++;
  console.log(`[WebSocket] Intentando reconexión en ${delay}ms (intento #${reconnectAttempts})...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initWebSocket();
  }, delay);
}

export function onWebSocketEvent(type: string, handler: WebSocketHandler): () => void {
  if (!eventHandlers.has(type)) {
    eventHandlers.set(type, new Set());
  }
  eventHandlers.get(type)!.add(handler);

  return () => {
    const handlers = eventHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        eventHandlers.delete(type);
      }
    }
  };
}

export function sendWebSocketMessage(data: any): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    } catch (err) {
      console.warn('[WebSocket] Error al enviar mensaje:', err);
    }
  } else {
    if (pendingMessages.length >= 50) {
      pendingMessages.shift();
    }
    pendingMessages.push(data);
  }
}
