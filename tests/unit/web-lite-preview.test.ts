import { describe, expect, it } from 'vitest';
import { parseVitePreviewUrl } from '../../src/adapters/web-lite.js';

describe('web-lite preview URL parsing', () => {
  it('finds unstyled localhost preview output', () => {
    expect(parseVitePreviewUrl('  ➜  Local:   http://127.0.0.1:41447/\n')).toBe('http://127.0.0.1:41447/');
  });
  it('handles ANSI styling breaking the URL at the port', () => {
    const chunks = [
      '\x1b[32m➜\x1b[31m  \x1b[1mLocal\x1b[22m:  \x1b[36mhttp://127.0.0.1:',
      '\x1b[1m41447\x1b[22m/\x1b[31m'
    ];
    expect(parseVitePreviewUrl(chunks[0]!)).toBeNull();
    expect(parseVitePreviewUrl(chunks.join(''))).toBe('http://127.0.0.1:41447/');
  });
  it('never infers a preview URL without a complete port and slash', () => {
    expect(parseVitePreviewUrl('http://127.0.0.1:')).toBeNull();
    expect(parseVitePreviewUrl('http://localhost:7777/')).toBe('http://localhost:7777/');
    expect(parseVitePreviewUrl('nothing')).toBeNull();
  });
});
