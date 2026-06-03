import { describe, expect, it } from 'vitest';
import { mapDownloadProgress, validateInsvAsset } from '../src/prepare.js';

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
    expect(mapDownloadProgress(0, 100)).toBe(0.1);
    expect(mapDownloadProgress(50, 100)).toBeCloseTo(0.25);
    expect(mapDownloadProgress(100, 100)).toBe(0.4);
  });

  it('clamps invalid byte ratios', () => {
    expect(mapDownloadProgress(-1, 100)).toBe(0.1);
    expect(mapDownloadProgress(200, 100)).toBe(0.4);
  });
});
