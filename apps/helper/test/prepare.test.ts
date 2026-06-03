import { describe, expect, it } from 'vitest';
import { validateInsvAsset } from '../src/prepare.js';

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
