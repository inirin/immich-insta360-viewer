import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AssetCache } from '../src/cache.js';

let dir: string;

describe('AssetCache', () => {
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'insta360-cache-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns deterministic paths for an asset', async () => {
    const cache = new AssetCache(dir);
    const entry = await cache.entryFor('asset-1');

    expect(entry.originalPath.endsWith('asset-1/original.insv')).toBe(true);
    expect(entry.hlsDir.endsWith('asset-1/hls')).toBe(true);
  });

  it('detects a cached original', async () => {
    const cache = new AssetCache(dir);
    const entry = await cache.entryFor('asset-1');
    await writeFile(entry.originalPath, 'data');

    expect(await cache.hasOriginal('asset-1')).toBe(true);
  });

  it('detects a complete HLS playlist', async () => {
    const cache = new AssetCache(dir);
    const entry = await cache.entryFor('asset-1');
    await writeFile(entry.playlistPath, '#EXTM3U\n#EXT-X-ENDLIST\n');

    expect(await cache.hasCompletePlaylist('asset-1')).toBe(true);
  });

  it('clears partial HLS files', async () => {
    const cache = new AssetCache(dir);
    const entry = await cache.entryFor('asset-1');
    await writeFile(entry.playlistPath, '#EXTM3U\nsegment-00000.ts\n');

    await cache.clearHls('asset-1');

    expect(await cache.hasPlaylist('asset-1')).toBe(false);
  });
});
