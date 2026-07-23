import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { issueToken } from "./auth.js";
import type { EventBus } from "./bus.js";
import type { EventStore } from "./store.js";
import { publishInputSchema } from "./events.js";

// POST /events          — publish event onto bus + persist to stream
// POST /tokens          — issue signed subscriber token
// GET  /events/history  — replay events since a cursor (Redis stream ID)
// GET  /health          — liveness probe
export async function registerRoutes(
  app: FastifyInstance,
  bus: EventBus,
  store: EventStore,
): Promise<void> {
  app.post("/events", async (req, reply) => {
    const parsed = publishInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const event = { id: randomUUID(), ts: Date.now(), ...parsed.data };
    await store.append(event);
    await bus.publish(event);
    return reply.status(202).send({ id: event.id });
  });

  app.get("/events/history", async (req, reply) => {
    const { since = "0", count = "100" } = req.query as { since?: string; count?: string };
    const events = await store.since(since, Math.min(Number(count), 500));
    return reply.send({ events, count: events.length });
  });

  app.post("/tokens", async (req, reply) => {
    const body = req.body as { sub?: string; channels?: string[]; ttlSeconds?: number };
    const sub = body.sub ?? randomUUID();
    const channels = body.channels ?? [];
    const ttl = body.ttlSeconds ?? 3600;
    const token = issueToken({ sub, channels, exp: Math.floor(Date.now() / 1000) + ttl });
    return reply.send({ token, sub, channels, expiresIn: ttl });
  });

  app.get("/health", async (_req, reply) => reply.send({ ok: true }));
}
