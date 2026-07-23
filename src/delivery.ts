import { config } from "./config.js";
import type { Event } from "./events.js";
import { logger } from "./logger.js";
import { eventsDelivered, deliveryFailures, deliveryDuration } from "./metrics.js";

export type Sink = (event: Event) => Promise<void>;

interface Attempt {
  event: Event;
  sink: Sink;
  subscriberId: string;
  retries: number;
  sinkLabel: string;
}

// ponytail: in-memory retry queue, lost on crash. Add Redis-backed queue if
// deliveries must survive restarts.
export class DeliveryManager {
  private timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly maxRetries = config.DELIVERY_MAX_RETRIES,
    private readonly baseDelayMs = config.DELIVERY_BASE_DELAY_MS,
  ) {}

  deliver(subscriberId: string, event: Event, sink: Sink, sinkLabel = "ws"): void {
    void this.attempt({ event, sink, subscriberId, retries: 0, sinkLabel });
  }

  private async attempt(a: Attempt): Promise<void> {
    const end = deliveryDuration.startTimer({ sink: a.sinkLabel });
    try {
      await a.sink(a.event);
      end();
      eventsDelivered.inc({ sink: a.sinkLabel });
    } catch (err) {
      end();
      deliveryFailures.inc({ sink: a.sinkLabel });
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

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }
}
