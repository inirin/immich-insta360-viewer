import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AssetStateStore } from './asset-state.js';
import { AssetCache } from './cache.js';
import type { ImmichAsset } from './immich-client.js';
import { ImmichClient } from './immich-client.js';
import { generateHls, probeFile, waitForPlayableHls } from './media-tools.js';

export function validateInsvAsset(asset: ImmichAsset): void {
  if (asset.type !== 'VIDEO' || !asset.originalFileName.toLowerCase().endsWith('.insv')) {
    throw new Error('Only Insta360 360 .insv video assets are supported');
  }
}

export function mapDownloadProgress(downloadedBytes: number, totalBytes: number): number {
  const ratio = Math.max(0, Math.min(1, downloadedBytes / totalBytes));
  return 0.1 + ratio * 0.3;
}

function createProgressStream(
  totalBytes: number | undefined,
  onProgress: (downloadedBytes: number, totalBytes: number | undefined) => void,
): Transform {
  let downloadedBytes = 0;
  let lastReportedPercent = -1;

  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      downloadedBytes += chunk.length;

      if (totalBytes === undefined) {
        onProgress(downloadedBytes, undefined);
      } else {
        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          onProgress(downloadedBytes, totalBytes);
        }
      }

      callback(null, chunk);
    },
  });
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
      states.set(assetId, { state: 'downloading', progress: 0.1, message: 'Downloading original .insv' });
      const download = await client.downloadOriginal(assetId);
      const tempOriginalPath = join(
        entry.assetDir,
        `.${basename(entry.originalPath)}.${process.pid}.${Date.now()}.tmp`,
      );
      try {
        const progress = createProgressStream(download.sizeBytes, (downloadedBytes, totalBytes) => {
          states.set(assetId, {
            state: 'downloading',
            progress: totalBytes === undefined ? 0.1 : mapDownloadProgress(downloadedBytes, totalBytes),
            message: totalBytes === undefined
              ? `Downloading original .insv (${Math.round(downloadedBytes / 1024 / 1024)} MB)`
              : 'Downloading original .insv',
          });
        });
        await pipeline(download.stream, progress, createWriteStream(tempOriginalPath));
        await rename(tempOriginalPath, entry.originalPath);
      } catch (error) {
        await rm(tempOriginalPath, { force: true });
        throw error;
      }
    }

    states.set(assetId, { state: 'analyzing', progress: 0.45, message: 'Analyzing .insv streams' });
    await probeFile(entry.originalPath);

    if (!(await cache.hasCompletePlaylist(assetId))) {
      await cache.clearHls(assetId);
      states.set(assetId, { state: 'processing', progress: 0.65, message: 'Generating 360 stream' });
      const generation = generateHls(entry.originalPath, entry.hlsDir);
      await Promise.race([
        waitForPlayableHls(entry.hlsDir),
        generation,
      ]);
      states.set(assetId, {
        state: 'playable',
        progress: 0.82,
        message: 'Starting playback while finishing conversion',
      });
      await generation;
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
