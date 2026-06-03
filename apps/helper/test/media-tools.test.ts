import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  generateHls,
  isCompleteHlsPlaylist,
  isPlayableHlsPlaylist,
  parseProbeJson,
  parseFfmpegProgressSeconds,
  probeFile,
  runProcessForTest,
  waitForPlayableHls,
  type SpawnProcess,
} from '../src/media-tools.js';

describe('parseProbeJson', () => {
  it('accepts two video streams and one audio stream', () => {
    const result = parseProbeJson(JSON.stringify({
      streams: [
        { index: 0, codec_type: 'video', width: 3840, height: 3840 },
        { index: 1, codec_type: 'video', width: 3840, height: 3840 },
        { index: 2, codec_type: 'audio' },
      ],
      format: { duration: '40.5' },
    }));

    expect(result.videoStreamIndexes).toEqual([0, 1]);
    expect(result.audioStreamIndex).toBe(2);
    expect(result.durationSeconds).toBe(40.5);
  });

  it('rejects files without two video streams', () => {
    expect(() => parseProbeJson(JSON.stringify({
      streams: [{ index: 0, codec_type: 'video', width: 3840, height: 3840 }],
    }))).toThrow('Expected at least two video streams for a 360 .insv file');
  });
});

describe('parseFfmpegProgressSeconds', () => {
  it('parses ffmpeg timestamp progress', () => {
    expect(parseFfmpegProgressSeconds('out_time=00:01:02.500000')).toBe(62.5);
  });

  it('parses ffmpeg microsecond progress fields', () => {
    expect(parseFfmpegProgressSeconds('out_time_us=2500000')).toBe(2.5);
    expect(parseFfmpegProgressSeconds('out_time_ms=2500000')).toBe(2.5);
  });

  it('ignores non-progress lines', () => {
    expect(parseFfmpegProgressSeconds('progress=continue')).toBeNull();
  });
});

describe('HLS playlist predicates', () => {
  it('detects playable playlists with at least one segment', () => {
    expect(isPlayableHlsPlaylist('#EXTM3U\n#EXTINF:2,\nsegment-00000.ts\n')).toBe(true);
    expect(isPlayableHlsPlaylist('#EXTM3U\n#EXT-X-TARGETDURATION:2\n')).toBe(false);
  });

  it('detects complete playlists with an end marker', () => {
    expect(isCompleteHlsPlaylist('#EXTM3U\n#EXT-X-ENDLIST\n')).toBe(true);
    expect(isCompleteHlsPlaylist('#EXTM3U\nsegment-00000.ts\n')).toBe(false);
  });
});

describe('process-backed media tools', () => {
  it('rejects when a process fails to spawn', async () => {
    const child = createFakeChild();
    const run = runProcessForTest('ffprobe', [], {
      captureStdout: true,
      spawnImpl: () => child,
    });

    child.emit('error', new Error('ffprobe not found'));
    child.emit('close', 0);

    await expect(run).rejects.toThrow('ffprobe not found');
  });

  it('rejects non-zero exits with stderr diagnostics', async () => {
    const child = createFakeChild();
    const run = runProcessForTest('ffmpeg', [], {
      spawnImpl: () => child,
    });

    child.stderr.emit('data', 'conversion failed');
    child.emit('close', 2);

    await expect(run).rejects.toThrow('ffmpeg exited with 2: conversion failed');
  });

  it('caps captured stdout', async () => {
    const child = createFakeChild();
    const run = runProcessForTest('ffprobe', [], {
      captureStdout: true,
      maxStdoutBytes: 4,
      spawnImpl: () => child,
    });

    child.stdout.emit('data', '12345');
    child.emit('close', 0);

    await expect(run).rejects.toThrow('ffprobe stdout exceeded 4 bytes');
  });

  it('passes the expected ffprobe arguments to probeFile', async () => {
    const child = createFakeChild();
    const calls: Array<{ command: string; args: string[] }> = [];
    const spawnImpl: SpawnProcess = (command, args) => {
      calls.push({ command, args });
      queueMicrotask(() => {
        child.stdout.emit('data', JSON.stringify({
          streams: [
            { index: 0, codec_type: 'video' },
            { index: 1, codec_type: 'video' },
          ],
          format: { duration: '12.5' },
        }));
        child.emit('close', 0);
      });
      return child;
    };

    await probeFile('clip.insv', { spawnImpl });

    expect(calls).toEqual([{
      command: 'ffprobe',
      args: ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', 'clip.insv'],
    }]);
  });

  it('passes the expected ffmpeg HLS arguments to generateHls', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'insta360-hls args-'));
    try {
      const child = createFakeChild();
      const calls: Array<{ command: string; args: string[] }> = [];
      const reportedProgress: number[] = [];
      const spawnImpl: SpawnProcess = (command, args) => {
        calls.push({ command, args });
        queueMicrotask(() => {
          child.stdout.emit('data', 'out_time=00:00:05.000000\nprogress=continue\n');
          child.emit('close', 0);
        });
        return child;
      };

      const playlist = await generateHls('C:\\input clips\\clip.insv', dir, {
        durationSeconds: 10,
        onProgress(progress) {
          reportedProgress.push(progress);
        },
        spawnImpl,
      });

      expect(playlist).toBe(join(dir, 'master.m3u8'));
      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('ffmpeg');
      expect(calls[0].args).toContain('[0:v:0][0:v:1]hstack=inputs=2,format=yuv420p[v]');
      expect(calls[0].args).toContain('superfast');
      expect(calls[0].args).toContain('event');
      expect(calls[0].args).toContain('independent_segments');
      expect(calls[0].args).toContain('pipe:1');
      expect(calls[0].args).toContain('-nostats');
      expect(calls[0].args).toContain(join(dir, 'segment-%05d.ts'));
      expect(calls[0].args.at(-1)).toBe(join(dir, 'master.m3u8'));
      expect(reportedProgress).toEqual([0.5]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('waitForPlayableHls', () => {
  it('resolves when the playlist contains a segment', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'insta360-hls playable-'));
    try {
      await writeFile(join(dir, 'master.m3u8'), [
        '#EXTM3U',
        '#EXT-X-TARGETDURATION:2',
        '#EXTINF:2.000000,',
        'segment-00000.ts',
      ].join('\n'));

      await expect(waitForPlayableHls(dir, { timeoutMs: 50, pollIntervalMs: 1 }))
        .resolves.toBe(join(dir, 'master.m3u8'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects when the playlist does not become playable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'insta360-hls timeout-'));
    try {
      await expect(waitForPlayableHls(dir, { timeoutMs: 1, pollIntervalMs: 1 }))
        .rejects.toThrow('Timed out waiting for playable HLS');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function createFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}
