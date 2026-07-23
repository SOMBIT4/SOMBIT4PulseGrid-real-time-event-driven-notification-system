import { z } from "zod";

// An Event is what producers publish. `channel` is the topic subscribers filter
// on; `payload` is opaque JSON delivered as-is.
export const eventSchema = z.object({
  id: z.string(),
  channel: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown(),
  ts: z.number(),
});

export type Event = z.infer<typeof eventSchema>;

// Input a producer sends over HTTP — server assigns id + ts.
export const publishInputSchema = z.object({
  channel: z.string().min(1),
  type: z.string().min(1),
  payload: z.unknown().default({}),
});

export type PublishInput = z.infer<typeof publishInputSchema>;
