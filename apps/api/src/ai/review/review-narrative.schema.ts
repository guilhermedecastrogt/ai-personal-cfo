import { z } from 'zod';

export const reviewNarrativeWireSchema = z.object({
  summary: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  recommendations: z.array(z.string()),
  priorities: z.array(z.string()),
});

export type ReviewNarrative = z.infer<typeof reviewNarrativeWireSchema>;

export const REVIEW_NARRATIVE_SCHEMA_NAME = 'monthly_review_narrative';

export function reviewNarrativeJsonSchema(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(reviewNarrativeWireSchema)).filter(
      ([keyword]) => keyword !== '$schema',
    ),
  );
}
