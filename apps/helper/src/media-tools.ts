import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MAX_STDOUT_BYTES = 1024 * 1024;
const DEFAULT_MAX_STDERR_BYTES = 64 * 1024;

export type ProbeResult = {
  videoStreamIndexes: [number, number];
  audioStreamIndex?: number;
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
};

export function parseProbeJson(json: string): ProbeResult {
  const parsed = JSON.parse(json) as {
    streams: Array<{ index: number; codec_type: string; width?: number; height?: number }>;
  };
  const videos = parsed.streams.filter((stream) => stream.codec_type === 'video');
  const audio = parsed.streams.find((stream) => stream.codec_type === 'audio');

  if (videos.length < 2) {
    throw new Error('Expected at least two video streams for a 360 .insv file');
  }

  return {
    videoStreamIndexes: [videos[0].index, videos[1].index],
    audioStreamIndex: audio?.index,
  };
}

export async function probeFile(inputPath: string, options: RunOptions = {}): Promise<ProbeResult> {
  const output = await runCapture('ffprobe', [
    '-v', 'error',
    '-show_streams',
    '-of', 'json',
    inputPath,
  ], options);
  return parseProbeJson(output);
}

export async function generateHls(
  inputPath: string,
  outputDir: string,
  options: RunOptions = {},
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const playlist = join(outputDir, 'master.m3u8');

  await run('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-filter_complex',
    '[0:v:0][0:v:1]hstack=inputs=2,format=yuv420p[v]',
    '-map', '[v]',
    '-map', '0:a:0?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-c:a', 'aac',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(outputDir, 'segment-%05d.ts'),
    playlist,
  ], options);

  return playlist;
}

export function runProcessForTest(
  command: string,
  args: string[],
  options: RunOptions & { captureStdout?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const spawnImpl = options.spawnImpl ?? (spawn as SpawnProcess);
    const captureStdout = options.captureStdout ?? false;
    const maxStdoutBytes = options.maxStdoutBytes ?? DEFAULT_MAX_STDOUT_BYTES;
    const maxStderrBytes = options.maxStderrBytes ?? DEFAULT_MAX_STDERR_BYTES;
    const child = spawnImpl(command, args, {
      stdio: ['ignore', captureStdout ? 'pipe' : 'ignore', 'pipe'],
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

function run(command: string, args: string[], options: RunOptions): Promise<void> {
  return runProcessForTest(command, args, options).then(() => undefined);
}

function runCapture(command: string, args: string[], options: RunOptions): Promise<string> {
  return runProcessForTest(command, args, { ...options, captureStdout: true });
}
