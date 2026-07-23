import { describe, it, expect, beforeEach } from "vitest";
import { SubscriptionRegistry, type Subscriber } from "./registry.js";

describe("SubscriptionRegistry", () => {
  let reg: SubscriptionRegistry;

  beforeEach(() => {
    reg = new SubscriptionRegistry();
  });

  it("adds and finds subscriber by channel", () => {
    reg.add({ id: "a", channels: new Set(["ch1"]) });
    expect(reg.subscribersFor("ch1").map((s: Subscriber) => s.id)).toEqual(["a"]);
  });

  it("removes subscriber from all channels", () => {
    reg.add({ id: "a", channels: new Set(["ch1", "ch2"]) });
    reg.remove("a");
    expect(reg.subscribersFor("ch1")).toHaveLength(0);
    expect(reg.subscribersFor("ch2")).toHaveLength(0);
    expect(reg.size).toBe(0);
  });

  it("subscribe/unsubscribe after add", () => {
    reg.add({ id: "a", channels: new Set() });
    reg.subscribe("a", "ch1");
    expect(reg.subscribersFor("ch1")).toHaveLength(1);
    reg.unsubscribe("a", "ch1");
    expect(reg.subscribersFor("ch1")).toHaveLength(0);
  });

  it("returns empty array for unknown channel", () => {
    expect(reg.subscribersFor("nope")).toEqual([]);
  });
});
