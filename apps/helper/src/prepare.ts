import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { AssetStateStore } from './asset-state.js';
import { AssetCache } from './cache.js';
import type { ImmichAsset } from './immich-client.js';
import { ImmichClient } from './immich-client.js';
import { generateHls, probeFile } from './media-tools.js';

export function validateInsvAsset(asset: ImmichAsset): void {
  if (asset.type !== 'VIDEO' || !asset.originalFileName.toLowerCase().endsWith('.insv')) {
    throw new Error('Only Insta360 360 .insv video assets are supported');
  }
}

export async function prepareAsset(
  assetId: string,
  client: ImmichClient,
  cache: AssetCache,
  states: AssetStateStore,
): Promise<void> {
  try {
    states.set(assetId, { state: 'downloading', progress: 0.1, message: 'Checking Immich asset' });
    const asset = await client.getAsset(assetId);
    validateInsvAsset(asset);

    const entry = await cache.entryFor(assetId);
    if (!(await cache.hasOriginal(assetId))) {
      states.set(assetId, { state: 'downloading', progress: 0.25, message: 'Downloading original .insv' });
      const source = await client.downloadOriginal(assetId);
      const tempOriginalPath = join(
        entry.assetDir,
        `.${basename(entry.originalPath)}.${process.pid}.${Date.now()}.tmp`,
      );
      try {
        await pipeline(source, createWriteStream(tempOriginalPath));
        await rename(tempOriginalPath, entry.originalPath);
      } catch (error) {
        await rm(tempOriginalPath, { force: true });
        throw error;
      }
    }

    states.set(assetId, { state: 'analyzing', progress: 0.45, message: 'Analyzing .insv streams' });
    await probeFile(entry.originalPath);

    if (!(await cache.hasPlaylist(assetId))) {
      states.set(assetId, { state: 'processing', progress: 0.65, message: 'Generating 360 stream' });
      await generateHls(entry.originalPath, entry.hlsDir);
    }

    states.set(assetId, { state: 'ready', progress: 1, message: 'Ready' });
  } catch (error) {
    states.set(assetId, {
      state: 'failed',
      progress: 0,
      message: 'Preparation failed',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
