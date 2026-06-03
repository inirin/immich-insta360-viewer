import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('loads required settings and defaults', () => {
    const config = loadConfig({
      IMMICH_URL: 'http://immich-server:2283',
      IMMICH_API_KEY: 'secret',
    });

    expect(config.immichUrl).toBe('http://immich-server:2283');
    expect(config.immichApiKey).toBe('secret');
    expect(config.port).toBe(3560);
    expect(config.cacheDir).toBe('/cache');
    expect(config.cacheMaxGb).toBe(20);
    expect(config.cacheTtlHours).toBe(72);
  });

  it('rejects missing Immich URL', () => {
    expect(() => loadConfig({ IMMICH_API_KEY: 'secret' })).toThrow('IMMICH_URL is required');
  });
});
