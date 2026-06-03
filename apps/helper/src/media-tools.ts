import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const DEFAULT_MAX_STDOUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;

export type ProbeResult = {
  videoStreamIndexes: [number, number];
  audioStreamIndex?: number;
  durationSeconds?: number;
};

type ProcessStream = {
  on(event: 'data', listener: (chunk: unknown) => void): void;
};

type SpawnedProcess = {
  stdout: ProcessStream | null;
  stderr: ProcessStream | null;
  on(event: 'close', listener: (code: number | null) => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
};

export type SpawnProcess = (
  command: string,
  args: string[],
  options: { stdio: ['ignore', 'ignore' | 'pipe', 'pipe'] },
) => SpawnedProcess;

type RunOptions = {
  spawnImpl?: SpawnProcess;
  maxStdoutBytes?: number;
  maxStderrBytes?: number;
  onStdout?: (text: string) => void;
};

type GenerateHlsOptions = RunOptions & {
  durationSeconds?: number;
  encoder?: string;
  onProgress?: (progress: number) => void;
  preset?: string;
};

type WaitForPlayableHlsOptions = {
  timeoutMs?: number | null;
  pollIntervalMs?: number;
};

export function parseProbeJson(json: string): ProbeResult {
  const parsed = JSON.parse(json) as {
    streams: Array<{ index: number; codec_type: string; width?: number; height?: number }>;
    format?: { duration?: string };
  };
  const videos = parsed.streams.filter((stream) => stream.codec_type === 'video');
  const audio = parsed.streams.find((stream) => stream.codec_type === 'audio');
  const duration = parsed.format?.duration === undefined
    ? undefined
    : Number.parseFloat(parsed.format.duration);

  if (videos.length < 2) {
    throw new Error('Expected at least two video streams for a 360 .insv file');
  }

  return {
    videoStreamIndexes: [videos[0].index, videos[1].index],
    audioStreamIndex: audio?.index,
    durationSeconds: duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

export async function probeFile(inputPath: string, options: RunOptions = {}): Promise<ProbeResult> {
  const output = await runCapture('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-of', 'json',
    inputPath,
  ], options);
  return parseProbeJson(output);
}

export async function generateHls(
  inputPath: string,
  outputDir: string,
  options: GenerateHlsOptions = {},
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const playlist = join(outputDir, 'master.m3u8');
  const encoder = options.encoder ?? 'libx264';
  const preset = options.preset ?? (encoder === 'libx264' ? 'superfast' : 'p1');
  const progressParser = createFfmpegProgressParser((processedSeconds) => {
    if (options.durationSeconds === undefined || options.onProgress === undefined) {
      return;
    }

    options.onProgress(Math.max(0, Math.min(1, processedSeconds / options.durationSeconds)));
  });

  const args = [
    '-y',
    '-i', inputPath,
    '-filter_complex',
    '[0:v:0][0:v:1]hstack=inputs=2,format=yuv420p[v]',
    '-map', '[v]',
    '-map', '0:a:0?',
    '-c:v', encoder,
    '-preset', preset,
    ...videoQualityArgs(encoder),
    '-c:a', 'aac',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', join(outputDir, 'segment-%05d.ts'),
    '-progress', 'pipe:1',
    '-nostats',
    playlist,
  ];

  await runProcessForTest('ffmpeg', args, {
    ...options,
    onStdout: progressParser,
  });

  return playlist;
}

function videoQualityArgs(encoder: string): string[] {
  if (encoder === 'libx264') {
    return ['-crf', '23'];
  }

  if (encoder.includes('nvenc')) {
    return ['-cq', '23', '-b:v', '0'];
  }

  return [];
}

export function parseFfmpegProgressSeconds(line: string): number | null {
  const [key, value] = line.trim().split('=', 2);

  if (!key || !value) {
    return null;
  }

  if (key === 'out_time_us' || key === 'out_time_ms') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed / 1_000_000 : null;
  }

  if (key === 'out_time') {
    return parseTimestampSeconds(value);
  }

  return null;
}

function createFfmpegProgressParser(onProgressSeconds: (seconds: number) => void): (text: string) => void {
  let buffer = '';

  return (text) => {
    buffer += text;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const seconds = parseFfmpegProgressSeconds(line);
      if (seconds !== null) {
        onProgressSeconds(seconds);
      }
    }
  };
}

function parseTimestampSeconds(value: string): number | null {
  const match = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseFloat(match[3]);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}

export async function waitForPlayableHls(
  outputDir: string,
  options: WaitForPlayableHlsOptions = {},
): Promise<string> {
  const playlist = join(outputDir, 'master.m3u8');
  const timeoutMs = options.timeoutMs ?? null;
  const pollIntervalMs = options.pollIntervalMs ?? 500;
  const deadline = timeoutMs === null ? Number.POSITIVE_INFINITY : Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    try {
      const content = await readFile(playlist, 'utf8');

      if (isPlayableHlsPlaylist(content)) {
        return playlist;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    await delay(pollIntervalMs);
  }

  throw new Error(`Timed out waiting for playable HLS at ${playlist}`);
}

export function isPlayableHlsPlaylist(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('#') && trimmed.endsWith('.ts');
    });
}

export function isCompleteHlsPlaylist(content: string): boolean {
  return content
    .split(/\r?\n/)
    .some((line) => line.trim() === '#EXT-X-ENDLIST');
}

export function runProcessForTest(
  command: string,
  args: string[],
  options: RunOptions & { captureStdout?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const spawnImpl = options.spawnImpl ?? (spawn as SpawnProcess);
    const captureStdout = options.captureStdout ?? false;
    const pipeStdout = captureStdout || options.onStdout !== undefined;
    const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
    const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    const child = spawnImpl(command, args, {
      stdio: ['ignore', pipeStdout ? 'pipe' : 'ignore', 'pipe'],
    });

    let stdout = '';
    let stdoutBytes = 0;
    let stderr = '';
    let stderrTruncated = false;
    let settled = false;

    function rejectOnce(error: Error): void {
      if (settled) return;
      settled = true;
      reject(error);
    }

    function resolveOnce(output: string): void {
      if (settled) return;
      settled = true;
      resolve(output);
    }

    child.stdout?.on('data', (chunk) => {
      const text = String(chunk);
      options.onStdout?.(text);

      if (!captureStdout) {
        return;
      }

      stdoutBytes += Buffer.byteLength(text);
      if (stdoutBytes > maxStdoutBytes) {
        rejectOnce(new Error(`${command} stdout exceeded ${maxStdoutBytes} bytes`));
        return;
      }
      stdout += text;
    });

    child.stderr?.on('data', (chunk) => {
      const combined = stderr + String(chunk);
      if (Buffer.byteLength(combined) > maxStderrBytes) {
        stderr = combined.slice(-maxStderrBytes);
        stderrTruncated = true;
        return;
      }
      stderr = combined;
    });

    child.on('error', rejectOnce);

    child.on('close', (code) => {
      if (code === 0) {
        resolveOnce(stdout);
        return;
      }

      const diagnostic = stderrTruncated ? `[stderr truncated]\n${stderr}` : stderr;
      rejectOnce(new Error(`${command} exited with ${code}: ${diagnostic}`));
    });
  });
}

function runCapture(command: string, args: string[], options: RunOptions): Promise<string> {
  return runProcessForTest(command, args, { ...options, captureStdout: true });
}
