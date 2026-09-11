import { describe, expect, it } from 'vitest';
import { assertSafeGeneratedFiles } from '../server/security';

describe('secret guard', () => {
  it('allows .env.example placeholders', () => {
    expect(() => assertSafeGeneratedFiles([{ path: '.env.example', content: 'OPENAI_API_KEY=\n' }])).not.toThrow();
  });

  it('blocks real env files', () => {
    expect(() => assertSafeGeneratedFiles([{ path: 'apps/web/.env.local', content: 'TOKEN=x' }])).toThrow(/forbidden/i);
  });

  it('blocks leaked token patterns', () => {
    expect(() => assertSafeGeneratedFiles([{ path: 'config.ts', content: 'const x="ghp_123456789012345678901234567890"' }])).toThrow(/secret/i);
  });

  it('blocks traversal and duplicate paths', () => {
    expect(() => assertSafeGeneratedFiles([{ path: '../oops.txt', content: 'x' }])).toThrow(/unsafe/i);
    expect(() => assertSafeGeneratedFiles([{ path: 'A.txt', content: 'x' }, { path: 'a.txt', content: 'y' }])).toThrow(/duplicate/i);
  });
});
