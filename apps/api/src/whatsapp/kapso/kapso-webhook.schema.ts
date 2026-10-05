import { z } from 'zod';

export const MESSAGE_RECEIVED_EVENT = 'whatsapp.message.received';

const messageSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  timestamp: z.string().optional(),
  from: z.string().optional(),
  text: z.object({ body: z.string() }).optional(),
  image: z.object({ id: z.string().min(1), caption: z.string().nullish() }).optional(),
  kapso: z.object({ direction: z.string().optional() }).optional(),
});

export const kapsoMessageEventSchema = z.object({
  message: messageSchema,
  conversation: z.object({ phone_number: z.string().optional() }).optional(),
  phone_number_id: z.string().optional(),
});

export const kapsoBatchSchema = z.object({
  type: z.string(),
  batch: z.literal(true),
  data: z.array(z.unknown()),
});

export type KapsoMessageEvent = z.infer<typeof kapsoMessageEventSchema>;
