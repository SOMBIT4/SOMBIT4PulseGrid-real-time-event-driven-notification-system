import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { createRedis } from "./redis.js";
import { EventBus } from "./bus.js";
import { SubscriptionRegistry } from "./registry.js";
import { DeliveryManager } from "./delivery.js";
import { attachGateway, dispatch, type WsSubscriber } from "./gateway.js";
import { registerRoutes } from "./routes.js";
import { EventStore } from "./store.js";
import http from "node:http";

async function main() {
  const pub = createRedis("client");
  const sub = createRedis("subscriber");
  const store = new EventStore(pub);
  const bus = new EventBus(pub, sub);
  const registry = new SubscriptionRegistry<WsSubscriber>();
  const delivery = new DeliveryManager();

  await bus.start();
  bus.onEvent((event) => dispatch(event, registry, delivery));

  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      transport:
        process.env.NODE_ENV !== "production"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });
  await registerRoutes(app, bus, store);

  await app.ready();
  const wss = new WebSocketServer({ server: app.server as http.Server });
  attachGateway(wss, registry, delivery);

  await app.listen({ port: config.PORT, host: config.HOST });
  logger.info({ port: config.PORT }, "pulsegrid started");

  const shutdown = async () => {
    logger.info("shutting down");
    delivery.stop();
    wss.close();
    await app.close();
    await pub.quit();
    await sub.quit();
    process.exit(0);
  };

  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((err) => {
  logger.error(err, "fatal startup error");
  process.exit(1);
});
