import type { IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { verifyToken } from "./auth.js";
import type { DeliveryManager } from "./delivery.js";
import type { Event } from "./events.js";
import { logger } from "./logger.js";
import type { SubscriptionRegistry, Subscriber } from "./registry.js";
import { webhookSink, emailSink } from "./sinks.js";
import type { ChannelConfig } from "./channels.js";
import { activeConnections } from "./metrics.js";

export interface WsSubscriber extends Subscriber {
  socket: WebSocket;
  allowed: Set<string>;
  delivery: ChannelConfig[]; // extra sinks beyond WebSocket
}

type ClientMessage =
  | { action: "subscribe"; channel: string }
  | { action: "unsubscribe"; channel: string };

export function attachGateway(
  wss: WebSocketServer,
  registry: SubscriptionRegistry<WsSubscriber>,
  delivery: DeliveryManager,
): void {
  wss.on("connection", (socket, req) => {
    const claims = authenticate(req);
    if (!claims) {
      socket.close(4401, "unauthorized");
      return;
    }

    const sub: WsSubscriber = {
      id: claims.sub,
      channels: new Set(),
      allowed: new Set(claims.channels),
      socket,
      delivery: claims.delivery ?? [],
    };
    registry.add(sub);
    activeConnections.inc();
    logger.info({ subscriberId: sub.id }, "ws connected");

    socket.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(socket, { error: "invalid json" });
      }
      handleControl(sub, msg, registry, socket);
    });

    socket.on("close", () => {
      registry.remove(sub.id);
      activeConnections.dec();
      logger.info({ subscriberId: sub.id }, "ws disconnected");
    });

    send(socket, { ok: true, subscriberId: sub.id, allowed: [...sub.allowed] });
  });
}

export function dispatch(
  event: Event,
  registry: SubscriptionRegistry<WsSubscriber>,
  delivery: DeliveryManager,
): void {
  for (const sub of registry.subscribersFor(event.channel)) {
    // WebSocket sink
    delivery.deliver(sub.id, event, (e) => pushToSocket(sub.socket, e));

    // Extra sinks (webhook, email)
    for (const ch of sub.delivery) {
      if (ch.type === "webhook") {
        const cfg = ch;
        delivery.deliver(`${sub.id}:webhook`, event, (e) => webhookSink(cfg, e));
      } else if (ch.type === "email") {
        const cfg = ch;
        delivery.deliver(`${sub.id}:email`, event, (e) => emailSink(cfg, e));
      }
    }
  }
}

function handleControl(
  sub: WsSubscriber,
  msg: ClientMessage,
  registry: SubscriptionRegistry<WsSubscriber>,
  socket: WebSocket,
): void {
  if (msg.action === "subscribe") {
    if (!sub.allowed.has(msg.channel)) {
      return send(socket, { error: "forbidden channel", channel: msg.channel });
    }
    registry.subscribe(sub.id, msg.channel);
    send(socket, { subscribed: msg.channel });
  } else if (msg.action === "unsubscribe") {
    registry.unsubscribe(sub.id, msg.channel);
    send(socket, { unsubscribed: msg.channel });
  }
}

function authenticate(req: IncomingMessage) {
  const url = new URL(req.url ?? "", "http://localhost");
  const fromQuery = url.searchParams.get("token");
  const header = req.headers.authorization;
  const fromHeader = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = fromQuery ?? fromHeader;
  return token ? verifyToken(token) : null;
}

function pushToSocket(socket: WebSocket, event: Event): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState !== socket.OPEN) return reject(new Error("socket not open"));
    socket.send(JSON.stringify({ event }), (err) => (err ? reject(err) : resolve()));
  });
}

function send(socket: WebSocket, data: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(data));
}
