import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { issueToken } from "./auth.js";
import type { EventBus } from "./bus.js";
import { publishInputSchema } from "./events.js";
import { config } from "./config.js";

// POST /events — producer endpoint; publishes an event onto the bus.
// POST /tokens — issues a signed subscriber token (dev/internal use).
// GET  /health — liveness probe.
export async function registerRoutes(app: FastifyInstance, bus: EventBus): Promise<void> {
  app.post("/events", async (req, reply) => {
    const parsed = publishInputSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const event = {
      id: randomUUID(),
      ts: Date.now(),
      ...parsed.data,
    };
    await bus.publish(event);
    return reply.status(202).send({ id: event.id });
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
