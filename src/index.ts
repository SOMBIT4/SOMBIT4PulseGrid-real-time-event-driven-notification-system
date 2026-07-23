import Fastify from "fastify";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { createRedis } from "./redis.js";
import { EventBus } from "./bus.js";
import { SubscriptionRegistry } from "./registry.js";
import { DeliveryManager } from "./delivery.js";
import { attachGateway, dispatch } from "./gateway.js";
import { registerRoutes } from "./routes.js";

async function main() {
  const pub = createRedis("client");
  const sub = createRedis("subscriber");
  const bus = new EventBus(pub, sub);
  const registry = new SubscriptionRegistry();
  const delivery = new DeliveryManager();

  await bus.start();
  bus.onEvent((event) => dispatch(event, registry, delivery));

  const app = Fastify({ loggerInstance: logger });
  await registerRoutes(app, bus);

  const wss = new WebSocketServer({ server: app.server });
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
