import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Redis from "ioredis";
import Fastify from "fastify";
import { WebSocketServer } from "ws";
import WebSocket from "ws";
import http from "node:http";
import { EventBus } from "./bus.js";
import { EventStore } from "./store.js";
import { SubscriptionRegistry } from "./registry.js";
import { DeliveryManager } from "./delivery.js";
import { attachGateway, dispatch, type WsSubscriber } from "./gateway.js";
import { registerRoutes } from "./routes.js";
import { issueToken } from "./auth.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

// Skip entire suite when Redis is unavailable (e.g. CI without Docker).
async function redisAvailable(): Promise<boolean> {
  const r = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 0 });
  try {
    await r.connect();
    await r.ping();
    return true;
  } catch {
    return false;
  } finally {
    r.disconnect();
  }
}

describe.skipIf(!(await redisAvailable()))("integration: publish → WS delivery", () => {
  let pub: Redis;
  let sub: Redis;
  let bus: EventBus;
  let store: EventStore;
  let registry: SubscriptionRegistry<WsSubscriber>;
  let delivery: DeliveryManager;
  let serverUrl: string;
  let closeServer: () => Promise<void>;

  beforeAll(async () => {
    pub = new Redis(REDIS_URL);
    sub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
    store = new EventStore(pub);
    bus = new EventBus(pub, sub);
    registry = new SubscriptionRegistry<WsSubscriber>();
    delivery = new DeliveryManager(3, 50);

    await bus.start();
    bus.onEvent((event) => dispatch(event, registry, delivery));

    const app = Fastify({ logger: false });
    await registerRoutes(app, bus, store);
    await app.ready();

    const wss = new WebSocketServer({ server: app.server as http.Server });
    attachGateway(wss, registry, delivery);

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as { port: number };
    serverUrl = `http://127.0.0.1:${addr.port}`;

    closeServer = async () => {
      delivery.stop();
      wss.close();
      await app.close();
      await pub.quit();
      await sub.quit();
    };
  });

  afterAll(() => closeServer());

  it("delivers published event to subscribed WS client", async () => {
    const token = issueToken({
      sub: "test-user",
      channels: ["alerts"],
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    const ws = new WebSocket(`${serverUrl.replace("http", "ws")}?token=${token}`);

    const received = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout")), 5000);

      ws.on("message", (raw: WebSocket.RawData) => {
        const msg = JSON.parse(raw.toString());
        if (msg.ok) {
          // connected — subscribe then publish
          ws.send(JSON.stringify({ action: "subscribe", channel: "alerts" }));
          fetch(`${serverUrl}/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channel: "alerts", type: "test.event", payload: { hello: "world" } }),
          });
        } else if (msg.subscribed) {
          // subscribed — wait for event
        } else if (msg.event) {
          clearTimeout(timeout);
          ws.close();
          resolve(msg.event);
        }
      });

      ws.on("error", reject);
    });

    expect(received).toMatchObject({
      channel: "alerts",
      type: "test.event",
      payload: { hello: "world" },
    });
  });

  it("GET /events/history returns persisted events", async () => {
    const res = await fetch(`${serverUrl}/events/history?since=0&count=10`);
    const body = await res.json() as { events: unknown[]; count: number };
    expect(res.status).toBe(200);
    expect(body.count).toBeGreaterThan(0);
  });

  it("GET /health returns ok", async () => {
    const res = await fetch(`${serverUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
});
