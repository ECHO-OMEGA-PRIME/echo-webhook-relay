import { z } from 'zod';

const requestSchema = z.object({
  id: z.string(),
  data: z.object({
    message: z.string(),
  }),
});

export function validateRequest(request: any) {
  try {
    requestSchema.parse(request);
  } catch (error) {
    throw new Error('Invalid request');
  }
}