import { z } from 'zod';

export const ideaSchema = z.object({
  idea: z.string().trim().min(20, 'Beschreibe die Geschäftsidee in mindestens 20 Zeichen.').max(6000, 'Die Geschäftsidee ist zu lang.'),
});

export function validateIdea(input: unknown): { ok: true; idea: string } | { ok: false; error: string } {
  const parsed = ideaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Ungültige Eingabe.' };
  return { ok: true, idea: parsed.data.idea };
}
