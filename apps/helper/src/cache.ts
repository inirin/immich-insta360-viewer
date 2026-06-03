import { access, mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type CacheEntry = {
  assetDir: string;
  originalPath: string;
  hlsDir: string;
  playlistPath: string;
};

export class AssetCache {
  constructor(private readonly cacheDir: string) {}

  async entryFor(assetId: string): Promise<CacheEntry> {
    const safeId = assetId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const assetDir = toPortablePath(join(this.cacheDir, safeId));
    const hlsDir = toPortablePath(join(assetDir, 'hls'));
    await mkdir(hlsDir, { recursive: true });

    return {
      assetDir,
      originalPath: toPortablePath(join(assetDir, 'original.insv')),
      hlsDir,
      playlistPath: toPortablePath(join(hlsDir, 'master.m3u8')),
    };
  }

  async hasOriginal(assetId: string): Promise<boolean> {
    const entry = await this.entryFor(assetId);
    try {
      const info = await stat(entry.originalPath);
      return info.size > 0;
    } catch {
      return false;
    }
  }

  async hasPlaylist(assetId: string): Promise<boolean> {
    const entry = await this.entryFor(assetId);
    try {
      await access(entry.playlistPath);
      return true;
    } catch {
      return false;
    }
  }
}

function toPortablePath(path: string): string {
  return path.replace(/\\/g, '/');
}
