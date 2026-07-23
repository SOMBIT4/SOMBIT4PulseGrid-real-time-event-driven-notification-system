import Redis from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";

// A pub/sub subscriber connection cannot issue normal commands, so callers that
// need both must create two connections. This factory makes that explicit.
export function createRedis(role: "client" | "subscriber" = "client"): Redis {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: role === "subscriber" ? null : 3,
    lazyConnect: false,
  });
  redis.on("error", (err) => logger.error({ err, role }, "redis error"));
  redis.on("connect", () => logger.debug({ role }, "redis connected"));
  return redis;
}
