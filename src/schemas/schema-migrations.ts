import { z } from 'zod';

export const ArtifactVersionEnvelopeSchema = z.object({ schemaVersion: z.number().int().positive() }).passthrough();
export type ArtifactVersionEnvelope = z.infer<typeof ArtifactVersionEnvelopeSchema>;
