import type Redis from "ioredis";
import type { Event } from "./events.js";
import { logger } from "./logger.js";

const STREAM_KEY = "pulsegrid:events";
const MAX_STREAM_LEN = 10_000; // ponytail: fixed cap, use XAUTOCLAIM + consumer groups if you need durable replay

export class EventStore {
  constructor(private readonly redis: Redis) {}

  async append(event: Event): Promise<void> {
    await this.redis.xadd(
      STREAM_KEY,
      "MAXLEN",
      "~",
      MAX_STREAM_LEN,
      "*",
      "data",
      JSON.stringify(event),
    );
  }

  // Returns events published after `sinceId` (exclusive). Pass "0" for all history.
  async since(sinceId: string, count = 100): Promise<Event[]> {
    const results = await this.redis.xrange(STREAM_KEY, sinceId, "+", "COUNT", count);
    return results.flatMap(([, fields]) => {
      const raw = fields[fields.indexOf("data") + 1];
      if (!raw) return [];
      try {
        return [JSON.parse(raw) as Event];
      } catch {
        logger.warn({ raw }, "skipped malformed stream entry");
        return [];
      }
    });
  }

  // Returns the last stream entry ID (used by WS gateway to replay missed events on reconnect).
  async lastId(): Promise<string> {
    const info = await this.redis.xinfo("STREAM", STREAM_KEY).catch(() => null);
    if (!info) return "0";
    const arr = info as (string | number)[];
    const idx = arr.indexOf("last-generated-id");
    return idx >= 0 ? String(arr[idx + 1]) : "0";
  }
}
