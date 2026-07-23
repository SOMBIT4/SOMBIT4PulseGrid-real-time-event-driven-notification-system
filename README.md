# PulseGrid

Real-time event-driven notification system. Producers publish events over HTTP; subscribers receive them instantly over WebSocket.

## Architecture

```
Producer → POST /events → EventBus (Redis pub/sub) → DeliveryManager → WebSocket subscribers
```

- **EventBus** — Redis pub/sub fan-out across instances
- **SubscriptionRegistry** — in-process map of subscriber → channels
- **DeliveryManager** — at-least-once delivery with exponential backoff retry
- **Auth** — HMAC-signed stateless tokens (no JWT dependency)

## Quick start

```bash
cp .env.example .env
docker compose up -d          # start Redis
npm install
npm run dev
```

## API

### Issue a subscriber token

```bash
curl -X POST http://localhost:3000/tokens \
  -H 'Content-Type: application/json' \
  -d '{"sub":"user-1","channels":["alerts","news"],"ttlSeconds":3600}'
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
