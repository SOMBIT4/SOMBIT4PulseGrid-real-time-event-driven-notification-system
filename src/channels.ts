import { z } from "zod";

// Channel configs stored per-subscriber. Each channel type has its own sink
// implementation in delivery.ts. WebSocket is the default; webhook and email
// are opt-in extras configured at token-issue time.

export const webhookChannelSchema = z.object({
  type: z.literal("webhook"),
  url: z.string().url(),
  secret: z.string().optional(), // HMAC-SHA256 signature header if set
});

export const emailChannelSchema = z.object({
  type: z.literal("email"),
  address: z.string().email(),
});

export const wsChannelSchema = z.object({
  type: z.literal("ws"),
});

export const channelConfigSchema = z.discriminatedUnion("type", [
  webhookChannelSchema,
  emailChannelSchema,
  wsChannelSchema,
]);

export type ChannelConfig = z.infer<typeof channelConfigSchema>;
export type WebhookChannel = z.infer<typeof webhookChannelSchema>;
export type EmailChannel = z.infer<typeof emailChannelSchema>;
