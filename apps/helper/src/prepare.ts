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

export type PrepareAssetOptions = {
  ffmpegEncoder?: string;
  ffmpegPreset?: string;
};

export function validateInsvAsset(asset: ImmichAsset): void {
  if (asset.type !== 'VIDEO' || !asset.originalFileName.toLowerCase().endsWith('.insv')) {
    throw new Error('Only Insta360 360 .insv video assets are supported');
  }
}

export function mapDownloadProgress(downloadedBytes: number, totalBytes: number): number {
  const ratio = Math.max(0, Math.min(1, downloadedBytes / totalBytes));
  return ratio * 0.3;
}

export function mapProcessingProgress(processedRatio: number): number {
  const ratio = Math.max(0, Math.min(1, processedRatio));
  return 0.3 + ratio * 0.65;
}

export function parseImmichDurationSeconds(duration: string | undefined): number | undefined {
  if (!duration) {
    return undefined;
  }

  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(duration);
  if (!match) {
    return undefined;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);
  const total = hours * 3600 + minutes * 60 + seconds;

  return Number.isFinite(total) && total > 0 ? total : undefined;
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
  options: PrepareAssetOptions = {},
): Promise<void> {
  try {
    states.set(assetId, { state: 'downloading', progress: null, message: 'Checking Immich asset' });
    const asset = await client.getAsset(assetId);
    validateInsvAsset(asset);

    const entry = await cache.entryFor(assetId);
    if (await cache.hasCompletePlaylist(assetId)) {
      states.set(assetId, { state: 'ready', progress: 1, message: 'Ready' });
      return;
    }

    const assetDurationSeconds = parseImmichDurationSeconds(asset.duration);

    if (await cache.hasOriginal(assetId)) {
      states.set(assetId, { state: 'analyzing', progress: null, message: 'Analyzing .insv streams' });
      const probe = await probeFile(entry.originalPath);
      await cache.clearHls(assetId);
      states.set(assetId, { state: 'processing', progress: null, message: 'Generating 360 stream' });
      const generation = generateHls(entry.originalPath, entry.hlsDir, {
        durationSeconds: probe.durationSeconds ?? assetDurationSeconds,
        encoder: options.ffmpegEncoder,
        preset: options.ffmpegPreset,
        onProgress(progress) {
          states.set(assetId, {
            state: 'processing',
            progress: mapProcessingProgress(progress),
            message: 'Generating 360 stream',
          });
        },
      });
      await Promise.race([
        waitForPlayableHls(entry.hlsDir),
        generation,
      ]);
      states.set(assetId, {
        state: 'playable',
        progress: 1,
        message: 'Starting playback while finishing conversion',
      });
      await generation;
      states.set(assetId, { state: 'ready', progress: 1, message: 'Ready' });
      return;
    }

    states.set(assetId, { state: 'downloading', progress: null, message: 'Downloading original .insv' });

    const download = await client.downloadOriginal(assetId);
    const tempOriginalPath = join(
      entry.assetDir,
      `.${basename(entry.originalPath)}.${process.pid}.${Date.now()}.tmp`,
    );
    try {
      const progress = createProgressStream(download.sizeBytes, (downloadedBytes, totalBytes) => {
        if (totalBytes !== undefined) {
          states.set(assetId, {
            state: 'downloading',
            progress: mapDownloadProgress(downloadedBytes, totalBytes),
            message: 'Downloading original .insv',
          });
          return;
        }

        states.set(assetId, {
          state: 'downloading',
          progress: null,
          message: `Downloading original .insv (${Math.round(downloadedBytes / 1024 / 1024)} MB)`,
        });
      });

      await pipeline(download.stream, progress, createWriteStream(tempOriginalPath));
      await rename(tempOriginalPath, entry.originalPath);

      states.set(assetId, { state: 'analyzing', progress: 0.3, message: 'Analyzing .insv streams' });
      const probe = await probeFile(entry.originalPath);
      await cache.clearHls(assetId);
      states.set(assetId, { state: 'processing', progress: 0.3, message: 'Generating 360 stream' });
      const generation = generateHls(entry.originalPath, entry.hlsDir, {
        durationSeconds: probe.durationSeconds ?? assetDurationSeconds,
        encoder: options.ffmpegEncoder,
        preset: options.ffmpegPreset,
        onProgress(progressValue) {
          states.set(assetId, {
            state: 'processing',
            progress: mapProcessingProgress(progressValue),
            message: 'Generating 360 stream',
          });
        },
      });

      await Promise.race([
        waitForPlayableHls(entry.hlsDir),
        generation,
      ]);
      states.set(assetId, {
        state: 'playable',
        progress: 1,
        message: 'Starting playback while finishing conversion',
      });
      await generation;
    } catch (error) {
      await rm(tempOriginalPath, { force: true });
      throw error;
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
