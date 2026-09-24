import { z } from 'zod';
import { isIP } from 'node:net';

const Text = z.string().trim().min(1);

export const SafeResearchPacketSchema = z.object({
  schemaVersion: z.literal(1),
  source: Text,
  observations: z.array(Text),
  inferences: z.array(Text),
  unknowns: z.array(Text),
}).strict();
/**
 * `rawText` is intentionally represented as a type-level forbidden field. This
 * keeps accidental access visible to callers while ensuring the serialized
 * packet can never contain the untrusted source transcript.
 */
export type SafeResearchPacket = z.infer<typeof SafeResearchPacketSchema> & { readonly rawText?: never };

const instructionPattern = /(?:ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions?|system\s*prompt|developer\s+message|you\s+are\s+now|read\s+\/etc|rm\s+-rf|curl\s+|wget\s+|powershell|bash\s+-c|execute\s+this|reveal\s+(?:the\s+)?(?:secret|key|token)|上传|下载并执行|运行命令|读取密钥)/iu;
const codeFencePattern = /^\s*```/u;

/**
 * Lexically reject remote image URLs that can reach local services or smuggle
 * credentials.  The image provider also disables redirects; together these
 * checks keep model-produced URLs from becoming an SSRF primitive.  An
 * optional host allow-list can make the boundary stricter in production.
 */
export function isSafeRemoteImageUrl(value: string): boolean {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === 'metadata.google.internal' || host === 'metadata.azure.com') return false;
    const kind = isIP(host);
    if (kind === 4) {
      const octets = host.split('.').map(Number);
      const [a = -1, b = -1] = octets;
      if (a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a >= 224) return false;
    } else if (kind === 6) {
      const normalized = host.toLowerCase();
      if (normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:192.168.') || normalized.startsWith('::ffff:172.')) return false;
    }
    const configured = process.env.FACTORY_IMAGE_ALLOWED_HOSTS?.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean) ?? [];
    if (configured.length > 0 && !configured.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) return false;
    return true;
  } catch { return false; }
}

/** Remove instruction-shaped payloads before untrusted web text can reach a mutating role. */
export function sanitizeUntrustedText(value: string, maxChars = 12_000): string {
  const kept: string[] = [];
  let inCodeFence = false;
  for (const rawLine of String(value).split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (codeFencePattern.test(line)) { inCodeFence = !inCodeFence; continue; }
    if (inCodeFence || !line || instructionPattern.test(line)) continue;
    kept.push(line);
  }
  return kept.join('\n').slice(0, Math.max(0, maxChars));
}

function trimTo(value: string, max: number) {
  const trimmed = value.trim();
  return trimmed.slice(0, Math.max(1, max)).trim() || 'not provided';
}

/** Build a bounded, schema-validated packet. Raw source text is intentionally not forwarded. */
export function buildSafeResearchPacket(input: {
  source: string;
  observations: string[];
  inferences: string[];
  unknowns: string[];
  rawText?: string;
  maxChars?: number;
}): SafeResearchPacket {
  const maxChars = Math.max(180, Math.trunc(input.maxChars ?? 12_000));
  const clean = (items: string[]) => items.map((item) => sanitizeUntrustedText(item, 2_000)).filter(Boolean);
  let packet: SafeResearchPacket = SafeResearchPacketSchema.parse({
    schemaVersion: 1,
    source: trimTo(sanitizeUntrustedText(input.source, 500), 500),
    observations: clean(input.observations),
    inferences: clean(input.inferences),
    unknowns: clean(input.unknowns),
  });
  const serializedLength = () => JSON.stringify(packet).length;
  if (serializedLength() <= maxChars) return packet;

  // Preserve all unknowns first; progressively trim optional observations and inferences.
  const shrink = (items: string[], limit: number) => items.map((item) => trimTo(item, limit)).filter(Boolean);
  for (const limit of [240, 120, 64, 32, 16]) {
    packet = SafeResearchPacketSchema.parse({ ...packet, observations: shrink(packet.observations, limit), inferences: shrink(packet.inferences, limit), unknowns: shrink(packet.unknowns, limit), source: trimTo(packet.source, Math.min(240, limit * 2)) });
    if (serializedLength() <= maxChars) return packet;
  }

  // A very small budget still gets a truthful, bounded packet rather than raw text leakage.
  packet = SafeResearchPacketSchema.parse({ schemaVersion: 1, source: trimTo(packet.source, 24), observations: packet.observations.slice(0, 1).map((item) => trimTo(item, 24)), inferences: [], unknowns: packet.unknowns.slice(0, 4).map((item) => trimTo(item, 24)) });
  while (serializedLength() > maxChars && packet.observations.length > 0) packet.observations.pop();
  while (serializedLength() > maxChars && packet.unknowns.length > 0) packet.unknowns.pop();
  return SafeResearchPacketSchema.parse(packet);
}
