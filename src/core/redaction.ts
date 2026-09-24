const API_KEY_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}\b/g;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/gi;

export function redactText(value: string) {
  let redacted = value.replace(API_KEY_PATTERN, '[REDACTED]').replace(BEARER_PATTERN, 'Bearer [REDACTED]');
  const configuredKey = process.env.OPENAI_API_KEY;
  if (configuredKey) redacted = redacted.split(configuredKey).join('[REDACTED]');
  return redacted;
}

export function redactValue(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, /(?:token|secret|authorization|api.?key)/i.test(key) ? '[REDACTED]' : redactValue(item)]));
  return value;
}
