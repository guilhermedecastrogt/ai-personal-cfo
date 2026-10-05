import { z } from 'zod';
import { deterministicUuid } from './deterministic-uuid.js';

describe('deterministicUuid', () => {
  it('produces a valid uuid', () => {
    expect(z.uuid().safeParse(deterministicUuid('household', 'Demo')).success).toBe(true);
  });

  it('produces the same identifier for the same parts', () => {
    expect(deterministicUuid('member', 'A')).toBe(deterministicUuid('member', 'A'));
  });

  it('produces different identifiers for different parts', () => {
    expect(deterministicUuid('member', 'A')).not.toBe(deterministicUuid('member', 'B'));
  });

  it('distinguishes where one part ends and the next begins', () => {
    expect(deterministicUuid('ab', 'c')).not.toBe(deterministicUuid('a', 'bc'));
  });
});
