import { config } from "./config.js";
import type { Event } from "./events.js";
import { logger } from "./logger.js";

// A sink is the transport that actually pushes an event to one subscriber.
// Returns/throws: resolve = delivered, reject = failed (will retry).
export type Sink = (event: Event) => Promise<void>;

interface Attempt {
  event: Event;
  sink: Sink;
  subscriberId: string;
  retries: number;
}

// DeliveryManager guarantees at-least-once local delivery with exponential
// backoff. If a sink keeps failing past DELIVERY_MAX_RETRIES, the event is
// dropped and logged (dead-letter).
// ponytail: in-memory retry queue, lost on crash. Add Redis-backed queue if
// deliveries must survive restarts.
export class DeliveryManager {
  private timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly maxRetries = config.DELIVERY_MAX_RETRIES,
    private readonly baseDelayMs = config.DELIVERY_BASE_DELAY_MS,
  ) {}

  deliver(subscriberId: string, event: Event, sink: Sink): void {
    void this.attempt({ event, sink, subscriberId, retries: 0 });
  }

  private async attempt(a: Attempt): Promise<void> {
    try {
      await a.sink(a.event);
    } catch (err) {
      if (a.retries >= this.maxRetries) {
        logger.error(
          { err, subscriberId: a.subscriberId, eventId: a.event.id },
          "delivery failed, dropping (dead-letter)",
        );
        return;
      }
      const delay = this.baseDelayMs * 2 ** a.retries;
      const timer = setTimeout(() => {
        this.timers.delete(timer);
        void this.attempt({ ...a, retries: a.retries + 1 });
      }, delay);
      this.timers.add(timer);
    }
  }

  // Cancel pending retries — used on shutdown so timers don't keep the process alive.
  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
