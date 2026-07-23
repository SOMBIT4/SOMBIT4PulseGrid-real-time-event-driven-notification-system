# PulseGrid

Real-time event-driven notification system. Producers publish events over HTTP; subscribers receive them instantly over WebSocket.

## Architecture

```
Producer → POST /events → EventStore (Redis stream) + EventBus (Redis pub/sub)
                                                          ↓
                                    DeliveryManager → WebSocket / webhook / email sinks
```

- **EventBus** — Redis pub/sub fan-out across instances
- **EventStore** — Redis stream for event history + replay
- **SubscriptionRegistry** — in-process map of subscriber → channels
- **DeliveryManager** — at-least-once delivery with exponential backoff retry, instrumented
- **Sinks** — WebSocket (default), webhook (HMAC-signed POST), email (stub)
- **Auth** — HMAC-signed stateless tokens (no JWT dependency)
- **Rate limiting** — per-producer, Redis-backed (100 req/min default)
- **Metrics** — Prometheus at `/metrics`

## Quick start

```bash
cp .env.example .env
docker compose up -d          # start Redis (+ app if you want the full stack)
npm install
npm run dev
```

Run the whole stack (app + Redis) in Docker:

```bash
docker compose up -d --build
```

## API

### Issue a subscriber token

```bash
curl -X POST http://localhost:3000/tokens \
  -H 'Content-Type: application/json' \
  -d '{"sub":"user-1","channels":["alerts","news"],"ttlSeconds":3600}'
```

Optionally include extra delivery sinks in the token:

```json
{
  "sub": "user-1",
  "channels": ["alerts"],
  "delivery": [
    { "type": "webhook", "url": "https://example.com/hook", "secret": "hmac-secret" },
    { "type": "email", "address": "user@example.com" }
  ]
}
```

### Connect as subscriber (WebSocket)

```
ws://localhost:3000?token=<token>
```

Send control messages:

```json
{ "action": "subscribe",   "channel": "alerts" }
{ "action": "unsubscribe", "channel": "alerts" }
```

### Publish an event

```bash
curl -X POST http://localhost:3000/events \
  -H 'Content-Type: application/json' \
  -d '{"channel":"alerts","type":"alert.created","payload":{"msg":"hello"}}'
```

### Replay missed events

```bash
curl "http://localhost:3000/events/history?since=0&count=100"
# since = Redis stream ID (use last received event cursor for incremental replay)
```

### Prometheus metrics

```bash
curl http://localhost:3000/metrics
```

### Health check

```bash
curl http://localhost:3000/health
```

## Development

```bash
npm run typecheck   # TypeScript check
npm test            # Vitest unit tests
npm run build       # compile to dist/
npm start           # run compiled output
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP/WS listen port |
| `HOST` | `0.0.0.0` | Bind address |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `AUTH_SECRET` | `dev-secret-change-me` | HMAC signing secret |
| `DELIVERY_MAX_RETRIES` | `5` | Max delivery retry attempts |
| `DELIVERY_BASE_DELAY_MS` | `500` | Base backoff delay (doubles each retry) |
| `LOG_LEVEL` | `info` | `debug`\|`info`\|`warn`\|`error` |
