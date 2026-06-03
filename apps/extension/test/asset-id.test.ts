import { describe, expect, it } from 'vitest';
import { extractAssetIdFromUrl } from '../src/asset-id.js';

describe('extractAssetIdFromUrl', () => {
  it('extracts the last UUID from an Immich photo URL', () => {
    const url = 'http://localhost:2283/albums/9e/photos/38ce37c8-3dc0-4ab5-a45c-3fcc8e9f65f2';
    expect(extractAssetIdFromUrl(url)).toBe('38ce37c8-3dc0-4ab5-a45c-3fcc8e9f65f2');
  });

  it('returns undefined when no UUID exists', () => {
    expect(extractAssetIdFromUrl('http://localhost:2283/albums')).toBeUndefined();
  });
});
