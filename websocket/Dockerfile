# Etapa 1: Compilación en Rust
FROM rust:1.85-slim as builder

WORKDIR /app

# Cachear dependencias de crates.io creando un src dummy
COPY Cargo.toml Cargo.lock ./
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copiar el código fuente real y compilar
COPY src ./src
RUN touch src/main.rs && cargo build --release

# Etapa 2: Imagen mínima de producción
FROM debian:bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/projectboreal-websocket /app/projectboreal-websocket

ENV PORT=3005
ENV REDIS_HOST=boreal-redis
ENV REDIS_PORT=6379
EXPOSE 3005

CMD ["/app/projectboreal-websocket"]
