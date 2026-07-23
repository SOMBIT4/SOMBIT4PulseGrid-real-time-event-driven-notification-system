import type Redis from "ioredis";
import { type Event, eventSchema } from "./events.js";
import { logger } from "./logger.js";

const CHANNEL_PREFIX = "pulsegrid:ch:";

// EventBus fans events out across every server instance via Redis pub/sub.
// Publish → Redis → every instance's subscriber → local handler → WS clients.
export class EventBus {
  private handlers = new Set<(event: Event) => void>();

  constructor(
    private readonly pub: Redis,
    private readonly sub: Redis,
  ) {
    this.sub.on("pmessage", (_pattern, channel, message) => {
      const parsed = eventSchema.safeParse(JSON.parse(message));
      if (!parsed.success) {
        logger.warn({ channel, err: parsed.error }, "dropped malformed event");
        return;
      }
      for (const handler of this.handlers) handler(parsed.data);
    });
  }

  async start(): Promise<void> {
    await this.sub.psubscribe(`${CHANNEL_PREFIX}*`);
    logger.info("event bus subscribed");
  }

  async publish(event: Event): Promise<void> {
    await this.pub.publish(
      `${CHANNEL_PREFIX}${event.channel}`,
      JSON.stringify(event),
    );
  }

  // Register a local handler invoked for every event on any channel. The
  // subscription registry decides which WS clients actually receive it.
  onEvent(handler: (event: Event) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}
