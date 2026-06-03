import { describe, expect, test } from 'vitest';

import { formatPrepareStatus, getAssetIdFromPath, getProgressPercent } from './main';

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

describe('getProgressPercent', () => {
  test('converts progress to a rounded percentage', () => {
    expect(getProgressPercent(0.426)).toBe(43);
  });

  test('clamps progress to the visible range', () => {
    expect(getProgressPercent(-1)).toBe(0);
    expect(getProgressPercent(2)).toBe(100);
  });

  test('returns null when progress is unknown', () => {
    expect(getProgressPercent(null)).toBeNull();
    expect(getProgressPercent(undefined)).toBeNull();
  });
});
