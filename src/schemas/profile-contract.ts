import { z } from 'zod';
import { ExperienceContractSchema, NaturalPlayPlanSchema } from './experience-contract.js';
import { PrimaryExperienceProfileSchema, ProfileExperienceContractSchema } from './experience-profile.js';
import { ProductionLineDecisionLineSchema as ProductionLineSchema } from './production-line.js';

const Text = z.string().trim().min(1);
const Sha256 = z.string().regex(/^[a-f0-9]{64}$/u, 'expected a SHA-256 hex digest');

/**
 * The profile bundle is the immutable handoff between experience design and
 * production.  Keeping the generic contract, profile-specific contract and
 * oracle-free play plan together prevents Builder/QA from silently falling
 * back to a one-size-fits-all loop.
 */
export const ProfileExperienceBundleSchema = z.object({
  schemaVersion: z.literal(1),
  gameId: Text,
  title: Text,
  theme: Text,
  line: ProductionLineSchema,
  profile: PrimaryExperienceProfileSchema,
  blueprintHash: Sha256,
  profileContract: ProfileExperienceContractSchema,
  experienceContract: ExperienceContractSchema,
  naturalPlayPlan: NaturalPlayPlanSchema,
  createdAt: z.string().datetime(),
}).strict().superRefine((bundle, context) => {
  if (bundle.profileContract.profile !== bundle.profile) {
    context.addIssue({ code: 'custom', path: ['profileContract', 'profile'], message: 'profile contract does not match bundle profile' });
  }
  if (bundle.experienceContract.contractId !== bundle.naturalPlayPlan.contractId) {
    context.addIssue({ code: 'custom', path: ['naturalPlayPlan', 'contractId'], message: 'natural-play plan must reference the same experience contract' });
  }
  if (!bundle.experienceContract.contractId.includes(bundle.gameId)) {
    context.addIssue({ code: 'custom', path: ['experienceContract', 'contractId'], message: 'experience contract id must be bound to the game' });
  }
});
export type ProfileExperienceBundle = z.infer<typeof ProfileExperienceBundleSchema>;
