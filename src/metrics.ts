import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const eventsPublished = new Counter({
  name: "pulsegrid_events_published_total",
  help: "Total events published",
  labelNames: ["channel"],
  registers: [registry],
});

export const eventsDelivered = new Counter({
  name: "pulsegrid_events_delivered_total",
  help: "Total successful event deliveries",
  labelNames: ["sink"],
  registers: [registry],
});

export const deliveryFailures = new Counter({
  name: "pulsegrid_delivery_failures_total",
  help: "Total delivery failures (including retries)",
  labelNames: ["sink"],
  registers: [registry],
});

export const activeConnections = new Gauge({
  name: "pulsegrid_ws_connections_active",
  help: "Current active WebSocket connections",
  registers: [registry],
});

export const deliveryDuration = new Histogram({
  name: "pulsegrid_delivery_duration_seconds",
  help: "Event delivery latency in seconds",
  labelNames: ["sink"],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 5],
  registers: [registry],
});
