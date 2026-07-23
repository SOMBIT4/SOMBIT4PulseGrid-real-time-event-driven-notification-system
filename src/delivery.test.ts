import { describe, it, expect, vi } from "vitest";
import { DeliveryManager } from "./delivery.js";
import type { Event } from "./events.js";

const event: Event = { id: "e1", channel: "ch", type: "test", payload: {}, ts: Date.now() };

describe("DeliveryManager", () => {
  it("calls sink once on success", async () => {
    const dm = new DeliveryManager(3, 10);
    const sink = vi.fn().mockResolvedValue(undefined);
    dm.deliver("sub-1", event, sink);
    await new Promise((r) => setTimeout(r, 20));
    expect(sink).toHaveBeenCalledTimes(1);
    dm.stop();
  });

  it("retries on failure then succeeds", async () => {
    const dm = new DeliveryManager(3, 10);
    const sink = vi.fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue(undefined);
    dm.deliver("sub-1", event, sink);
    await new Promise((r) => setTimeout(r, 100));
    expect(sink).toHaveBeenCalledTimes(2);
    dm.stop();
  });

  it("drops after max retries", async () => {
    const dm = new DeliveryManager(2, 10);
    const sink = vi.fn().mockRejectedValue(new Error("always fail"));
    dm.deliver("sub-1", event, sink);
    await new Promise((r) => setTimeout(r, 200));
    expect(sink).toHaveBeenCalledTimes(3); // initial + 2 retries
    dm.stop();
  });
});
