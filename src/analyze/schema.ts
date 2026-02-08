import { z } from "zod";

export const AnalyzeModelOutputSchema = z.object({
  score: z.coerce.number().min(0).max(1),
  summary: z.string(),
  tags: z.array(z.string()).optional().default([]),
  missing: z.array(z.string()).optional().default([]),
  extra: z.array(z.string()).optional().default([]),
  reasons: z.array(z.string()).optional().default([]),
});

export type AnalyzeModelOutput = z.infer<typeof AnalyzeModelOutputSchema>;
