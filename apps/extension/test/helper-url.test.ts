import { describe, expect, it } from 'vitest';
import { DEFAULT_HELPER_URL, normalizeHelperUrl } from '../src/helper-url.js';

describe('normalizeHelperUrl', () => {
  it('normalizes http and https helper origins', () => {
    expect(normalizeHelperUrl('http://localhost:3560/')).toBe('http://localhost:3560');
    expect(normalizeHelperUrl('https://viewer.example.test/helper/')).toBe(
      'https://viewer.example.test/helper',
    );
  });

  it('removes search and hash parts', () => {
    expect(normalizeHelperUrl('http://localhost:3560/?token=secret#x')).toBe(
      'http://localhost:3560',
    );
  });

  it('falls back for invalid or unsupported URLs', () => {
    expect(normalizeHelperUrl('javascript:alert(1)')).toBe(DEFAULT_HELPER_URL);
    expect(normalizeHelperUrl('not a url')).toBe(DEFAULT_HELPER_URL);
    expect(normalizeHelperUrl(undefined)).toBe(DEFAULT_HELPER_URL);
  });
});
