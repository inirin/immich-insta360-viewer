import { describe, expect, it } from 'vitest';
import { mapDownloadProgress, mapProcessingProgress, validateInsvAsset } from '../src/prepare.js';

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
    expect(mapDownloadProgress(0, 100)).toBe(0.05);
    expect(mapDownloadProgress(50, 100)).toBeCloseTo(0.225);
    expect(mapDownloadProgress(100, 100)).toBeCloseTo(0.4);
  });

  it('clamps invalid byte ratios', () => {
    expect(mapDownloadProgress(-1, 100)).toBe(0.05);
    expect(mapDownloadProgress(200, 100)).toBeCloseTo(0.4);
  });
});

describe('mapProcessingProgress', () => {
  it('maps ffmpeg progress into the processing phase range', () => {
    expect(mapProcessingProgress(0)).toBe(0.45);
    expect(mapProcessingProgress(0.5)).toBe(0.7);
    expect(mapProcessingProgress(1)).toBe(0.95);
  });

  it('clamps invalid processing ratios', () => {
    expect(mapProcessingProgress(-1)).toBe(0.45);
    expect(mapProcessingProgress(2)).toBe(0.95);
  });
});
