import { describe, expect, test } from 'vitest';

import {
  formatPlaybackTime,
  formatPrepareStatus,
  getAssetIdFromPath,
  getProgressPercent,
  getSeekValue,
  isPlayableState,
} from './main';

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

describe('isPlayableState', () => {
  test('allows playback when HLS is playable or ready', () => {
    expect(isPlayableState('playable')).toBe(true);
    expect(isPlayableState('ready')).toBe(true);
  });

  test('keeps waiting for preparation states', () => {
    expect(isPlayableState('processing')).toBe(false);
    expect(isPlayableState(undefined)).toBe(false);
  });
});

describe('formatPlaybackTime', () => {
  test('formats seconds as minutes and seconds', () => {
    expect(formatPlaybackTime(0)).toBe('0:00');
    expect(formatPlaybackTime(65.9)).toBe('1:05');
  });
});

describe('getSeekValue', () => {
  test('maps current time to a stable range input value', () => {
    expect(getSeekValue(5, 10)).toBe(500);
  });

  test('returns zero when duration is unknown', () => {
    expect(getSeekValue(5, 0)).toBe(0);
  });
});
