import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  AUTH_SECRET: z.string().min(1).default("dev-secret-change-me"),
  DELIVERY_MAX_RETRIES: z.coerce.number().default(5),
  DELIVERY_BASE_DELAY_MS: z.coerce.number().default(500),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof schema>;

export const config: Config = schema.parse(process.env);
