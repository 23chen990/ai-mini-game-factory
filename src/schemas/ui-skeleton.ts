import { z } from 'zod';

const Text = z.string().trim().min(1);

export const UiScreenSchema = z.object({
  id: z.enum(['gameplay', 'pause', 'result', 'settings']),
  purpose: Text,
  primaryAction: Text,
  feedbackElements: z.array(Text).min(1),
  safeAreaAnchors: z.array(Text).min(1),
}).strict();
export type UiScreen = z.infer<typeof UiScreenSchema>;

export const UiSkeletonSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  experienceProfile: Text,
  screens: z.array(UiScreenSchema).min(2),
  firstViewportPriority: z.array(Text).min(3),
  retryFlow: z.array(Text).min(2),
  adPolicy: z.object({ rewardedOptional: z.boolean(), neverBlocksCore: z.boolean(), frequencyCap: Text }).strict(),
  accessibility: z.array(Text).min(2),
  createdAt: z.string().datetime(),
}).strict();
export type UiSkeleton = z.infer<typeof UiSkeletonSchema>;
