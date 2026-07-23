import { createHmac } from "node:crypto";
import type { Event } from "./events.js";
import type { WebhookChannel, EmailChannel } from "./channels.js";
import { logger } from "./logger.js";

// Webhook sink: POST event JSON to the configured URL with optional HMAC signature.
export async function webhookSink(channel: WebhookChannel, event: Event): Promise<void> {
  const body = JSON.stringify({ event });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (channel.secret) {
    headers["x-pulsegrid-signature"] = createHmac("sha256", channel.secret)
      .update(body)
      .digest("hex");
  }
  const res = await fetch(channel.url, { method: "POST", headers, body });
  if (!res.ok) throw new Error(`webhook ${channel.url} responded ${res.status}`);
}

// Email sink: logs the event (swap for nodemailer/SES/etc when ready).
// ponytail: stub logger sink, replace with real mailer when email infra is set up.
export async function emailSink(channel: EmailChannel, event: Event): Promise<void> {
  logger.info(
    { to: channel.address, eventId: event.id, channel: event.channel },
    "email notification (stub)",
  );
}
