import { describe, expect, it } from 'vitest';
import {
  mapDownloadProgress,
  mapProcessingProgress,
  parseImmichDurationSeconds,
  validateInsvAsset,
} from '../src/prepare.js';

describe('validateInsvAsset', () => {
  it('accepts .insv videos', () => {
    expect(() => validateInsvAsset({
      id: 'a',
      type: 'VIDEO',
      originalFileName: 'clip.insv',
    })).not.toThrow();
  });

  it('rejects non-insv videos', () => {
    expect(() => validateInsvAsset({
      id: 'a',
      type: 'VIDEO',
      originalFileName: 'clip.mp4',
    })).toThrow('Only Insta360 360 .insv video assets are supported');
  });
});

describe('mapDownloadProgress', () => {
  it('maps byte progress into the download phase range', () => {
    expect(mapDownloadProgress(0, 100)).toBe(0);
    expect(mapDownloadProgress(50, 100)).toBeCloseTo(0.15);
    expect(mapDownloadProgress(100, 100)).toBeCloseTo(0.3);
  });

  it('clamps invalid byte ratios', () => {
    expect(mapDownloadProgress(-1, 100)).toBe(0);
    expect(mapDownloadProgress(200, 100)).toBeCloseTo(0.3);
  });
});

describe('mapProcessingProgress', () => {
  it('maps ffmpeg progress into the processing phase range', () => {
    expect(mapProcessingProgress(0)).toBe(0.3);
    expect(mapProcessingProgress(0.5)).toBe(0.625);
    expect(mapProcessingProgress(1)).toBe(0.95);
  });

  it('clamps invalid processing ratios', () => {
    expect(mapProcessingProgress(-1)).toBe(0.3);
    expect(mapProcessingProgress(2)).toBe(0.95);
  });
});

describe('parseImmichDurationSeconds', () => {
  it('parses Immich duration strings', () => {
    expect(parseImmichDurationSeconds('00:00:40.173')).toBeCloseTo(40.173);
    expect(parseImmichDurationSeconds('01:02:03.500')).toBeCloseTo(3723.5);
  });

  it('rejects missing or invalid duration strings', () => {
    expect(parseImmichDurationSeconds(undefined)).toBeUndefined();
    expect(parseImmichDurationSeconds('bad')).toBeUndefined();
  });
});
