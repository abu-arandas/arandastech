/** The pipeline, in order. A lead moves forward through it; lost ends it. */
export const STAGES = [
  'new',
  'contacted',
  'replied',
  'meeting',
  'qualified',
  'proposal_sent',
  'won',
  'lost',
  'in_delivery',
  'delivered',
  'paid',
  'retained',
] as const;
export type Stage = (typeof STAGES)[number];
