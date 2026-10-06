use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State,
    },
    http::{HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    net::SocketAddr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tokio::sync::{mpsc, RwLock};
use tower_http::cors::{Any, CorsLayer};

type ClientMap = Arc<RwLock<HashMap<String, mpsc::Sender<Message>>>>;

#[derive(Clone)]
struct AppState {
    clients: ClientMap,
    next_conn_id: Arc<AtomicU64>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
enum ClientInboundMessage {
    #[serde(rename = "PING")]
    Ping,
    #[serde(other)]
    Unknown,
}

#[tokio::main]
async fn main() {
    let port = env::var("PORT")
        .unwrap_or_else(|_| "3008".to_string())
        .parse::<u16>()
        .unwrap_or(3008);

    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| {
        let host = env::var("REDIS_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
        let port = env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
        match env::var("REDIS_PASSWORD") {
            Ok(pass) if !pass.trim().is_empty() => format!("redis://:{}@{}:{}", pass.trim(), host, port),
            _ => format!("redis://{}:{}", host, port),
        }
    });

    let state = AppState {
        clients: Arc::new(RwLock::new(HashMap::new())),
        next_conn_id: Arc::new(AtomicU64::new(1)),
    };

    let redis_clients = state.clients.clone();
    let redis_url_clone = redis_url.clone();
    tokio::spawn(async move {
        run_redis_subscriber(redis_url_clone, redis_clients).await;
    });

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_check))
        .route("/ws", get(ws_handler))
        .route("/", get(ws_handler))
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(&addr).await.expect("Failed to bind TCP listener");

    axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .expect("Server failed to run");
}

async fn health_check() -> impl IntoResponse {
    "healthy"
}

async fn ws_handler(
    headers: HeaderMap,
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
) -> Response {
    if let Some(origin) = headers.get("origin").and_then(|v| v.to_str().ok()) {
        let is_allowed = origin.starts_with("http://localhost:")
            || origin.starts_with("https://localhost:")
            || origin.starts_with("http://127.0.0.1:")
            || origin == "http://localhost"
            || origin == "https://localhost"
            || origin == "http://127.0.0.1"
            || origin.ends_with(".projectboreal.internal")
            || origin == "https://projectboreal.com"
            || origin == "https://www.projectboreal.com"
            || origin == "https://boreal.com"
            || origin == "https://www.boreal.com"
            || origin == "http://boreal.local"
            || origin == "https://boreal.local"
            || origin == "http://www.boreal.local"
            || origin == "https://www.boreal.local";
        if !is_allowed {
            return (StatusCode::FORBIDDEN, "Origen no autorizado").into_response();
        }
    }

    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    let conn_id = format!(
        "conn_{}_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
        state.next_conn_id.fetch_add(1, Ordering::Relaxed)
    );

    let (mut ws_sender, mut ws_receiver) = socket.split();
    let (tx, mut rx) = mpsc::channel::<Message>(128);

    {
        let mut clients = state.clients.write().await;
        clients.insert(conn_id.clone(), tx.clone());
    }

    let welcome_msg = serde_json::json!({
        "type": "CONNECTED",
        "connId": conn_id
    });
    let _ = tx.send(Message::Text(welcome_msg.to_string())).await;

    let mut send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if ws_sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let clients_clone = state.clients.clone();
    let conn_id_clone = conn_id.clone();
    let tx_clone = tx.clone();

    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            match msg {
                Message::Text(text) => {
                    if let Ok(ClientInboundMessage::Ping) = serde_json::from_str::<ClientInboundMessage>(&text) {
                        let pong = serde_json::json!({ "type": "PONG" });
                        let _ = tx_clone.send(Message::Text(pong.to_string())).await;
                    }
                }
                Message::Ping(bytes) => {
                    let _ = tx_clone.send(Message::Pong(bytes)).await;
                }
                Message::Close(_) => {
                    break;
                }
                _ => {}
            }
        }
    });

    tokio::select! {
        _ = (&mut send_task) => recv_task.abort(),
        _ = (&mut recv_task) => send_task.abort(),
    }

    let mut clients = clients_clone.write().await;
    clients.remove(&conn_id_clone);
}

async fn run_redis_subscriber(redis_url: String, clients: ClientMap) {
    loop {
        match redis::Client::open(redis_url.as_str()) {
            Ok(client) => match client.get_async_connection().await {
                Ok(conn) => {
                    let mut pubsub = conn.into_pubsub();
                    if let Ok(_) = pubsub.subscribe("boreal:giveaways").await {
                        let mut stream = pubsub.into_on_message();
                        while let Some(msg) = stream.next().await {
                            let payload: Result<String, _> = msg.get_payload();
                            if let Ok(text) = payload {
                                broadcast_to_clients(&clients, text).await;
                            }
                        }
                    }
                }
                Err(_) => {}
            },
            Err(_) => {}
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}

async fn broadcast_to_clients(clients: &ClientMap, text: String) {
    let msg = Message::Text(text.into());
    let mut dead_clients = Vec::new();
    {
        let guard = clients.read().await;
        for (id, tx) in guard.iter() {
            if let Err(_) = tx.try_send(msg.clone()) {
                if tx.is_closed() {
                    dead_clients.push(id.clone());
                }
            }
        }
    }

    if !dead_clients.is_empty() {
        let mut guard = clients.write().await;
        for id in dead_clients {
            guard.remove(&id);
        }
    }
}

