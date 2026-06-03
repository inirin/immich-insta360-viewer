import { describe, expect, test } from 'vitest';

import { formatPrepareStatus, getAssetIdFromPath } from './main';

describe('getAssetIdFromPath', () => {
  test('returns the last path segment as the asset ID', () => {
    expect(getAssetIdFromPath('/view/asset-123')).toBe('asset-123');
  });

  test('returns null when the path has no asset ID segment', () => {
    expect(getAssetIdFromPath('/view/')).toBeNull();
  });
});

describe('formatPrepareStatus', () => {
  test('includes message and progress when both are available', () => {
    expect(formatPrepareStatus({ message: 'Transcoding', progress: 0.42 })).toBe('Transcoding (42%)');
  });
});
