import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';
import type { prepareAsset } from '../src/prepare.js';

let cacheDir: string;
let viewerRoot: string;

describe('buildServer', () => {
  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'insta360-helper-cache-'));
    viewerRoot = await mkdtemp(join(tmpdir(), 'insta360-viewer-root-'));
    await writeFile(join(viewerRoot, 'index.html'), '<!doctype html><title>viewer</title>');
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    await rm(viewerRoot, { recursive: true, force: true });
  });

  it('responds to health checks', async () => {
    const { app } = await buildServer({
      env: testEnv(),
      logger: false,
      viewerRoot,
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', version: '0.1.4' });
    } finally {
      await app.close();
    }
  });

  it('starts only one preparation per asset while a preparation is in flight', async () => {
    let calls = 0;
    let release!: () => void;
    const prepare: typeof prepareAsset = async (_assetId, _client, _cache, states) => {
      calls += 1;
      states.set('asset-1', {
        state: 'processing',
        progress: 0.65,
        message: 'Generating 360 stream',
      });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    };
    const { app } = await buildServer({
      env: testEnv(),
      logger: false,
      viewerRoot,
      prepare,
    });

    try {
      const first = await app.inject({ method: 'POST', url: '/api/assets/asset-1/prepare' });
      const second = await app.inject({ method: 'POST', url: '/api/assets/asset-1/prepare' });

      expect(first.statusCode).toBe(202);
      expect(second.statusCode).toBe(202);
      expect(calls).toBe(1);
      expect(second.json()).toEqual({
        state: 'processing',
        progress: 0.65,
        message: 'Generating 360 stream',
      });
    } finally {
      release();
      await app.close();
    }
  });

  it('requires viewer token for protected API routes when configured', async () => {
    const { app } = await buildServer({
      env: { ...testEnv(), VIEWER_TOKEN: 'viewer-secret' },
      logger: false,
      viewerRoot,
    });

    try {
      const unauthorized = await app.inject({
        method: 'GET',
        url: '/api/assets/asset-1/status',
      });
      const authorized = await app.inject({
        method: 'GET',
        url: '/api/assets/asset-1/status',
        headers: { 'X-Viewer-Token': 'viewer-secret' },
      });

      expect(unauthorized.statusCode).toBe(401);
      expect(authorized.statusCode).toBe(200);
      expect(authorized.json()).toEqual({
        state: 'unknown',
        progress: 0,
        message: 'Asset has not been prepared',
      });
    } finally {
      await app.close();
    }
  });

  it('serves flat HLS files from the asset cache', async () => {
    const hlsDir = join(cacheDir, 'asset-1', 'hls');
    await mkdir(hlsDir, { recursive: true });
    await writeFile(join(hlsDir, 'master.m3u8'), '#EXTM3U');
    const { app } = await buildServer({
      env: testEnv(),
      logger: false,
      viewerRoot,
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/stream/asset-1/master.m3u8' });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('#EXTM3U');
    } finally {
      await app.close();
    }
  });

  it('serves the viewer for asset view routes', async () => {
    const { app } = await buildServer({
      env: testEnv(),
      logger: false,
      viewerRoot,
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/view/asset-1' });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('<title>viewer</title>');
    } finally {
      await app.close();
    }
  });
});

function testEnv(): NodeJS.ProcessEnv {
  return {
    IMMICH_URL: 'http://immich.test',
    IMMICH_API_KEY: 'secret',
    CACHE_DIR: cacheDir,
  };
}
