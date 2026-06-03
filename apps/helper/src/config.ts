import { z } from 'zod';

const schema = z.object({
  IMMICH_URL: z.string().url(),
  IMMICH_API_KEY: z.string().min(1),
  VIEWER_TOKEN: z.string().optional(),
  CACHE_DIR: z.string().default('/cache'),
  CACHE_MAX_GB: z.coerce.number().positive().default(20),
  CACHE_TTL_HOURS: z.coerce.number().positive().default(72),
  FFMPEG_ENCODER: z.string().min(1).default('libx264'),
  FFMPEG_PRESET: z.string().min(1).default('superfast'),
  PORT: z.coerce.number().int().positive().default(3560),
});

export type HelperConfig = {
  immichUrl: string;
  immichApiKey: string;
  viewerToken?: string;
  cacheDir: string;
  cacheMaxGb: number;
  cacheTtlHours: number;
  ffmpegEncoder: string;
  ffmpegPreset: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv): HelperConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first.path[0] === 'IMMICH_URL') throw new Error('IMMICH_URL is required');
    if (first.path[0] === 'IMMICH_API_KEY') throw new Error('IMMICH_API_KEY is required');
    throw new Error(first.message);
  }

  return {
    immichUrl: parsed.data.IMMICH_URL.replace(/\/$/, ''),
    immichApiKey: parsed.data.IMMICH_API_KEY,
    viewerToken: parsed.data.VIEWER_TOKEN,
    cacheDir: parsed.data.CACHE_DIR,
    cacheMaxGb: parsed.data.CACHE_MAX_GB,
    cacheTtlHours: parsed.data.CACHE_TTL_HOURS,
    ffmpegEncoder: parsed.data.FFMPEG_ENCODER,
    ffmpegPreset: parsed.data.FFMPEG_PRESET,
    port: parsed.data.PORT,
  };
}
