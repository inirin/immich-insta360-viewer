import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateHls, parseProbeJson, probeFile, runProcessForTest, type SpawnProcess } from '../src/media-tools.js';

describe('parseProbeJson', () => {
  it('accepts two video streams and one audio stream', () => {
    const result = parseProbeJson(JSON.stringify({
      streams: [
        { index: 0, codec_type: 'video', width: 3840, height: 3840 },
        { index: 1, codec_type: 'video', width: 3840, height: 3840 },
        { index: 2, codec_type: 'audio' },
      ],
    }));

    expect(result.videoStreamIndexes).toEqual([0, 1]);
    expect(result.audioStreamIndex).toBe(2);
  });

  it('rejects files without two video streams', () => {
    expect(() => parseProbeJson(JSON.stringify({
      streams: [{ index: 0, codec_type: 'video', width: 3840, height: 3840 }],
    }))).toThrow('Expected at least two video streams for a 360 .insv file');
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
        }));
        child.emit('close', 0);
      });
      return child;
    };

    await probeFile('clip.insv', { spawnImpl });

    expect(calls).toEqual([{
      command: 'ffprobe',
      args: ['-v', 'error', '-show_streams', '-of', 'json', 'clip.insv'],
    }]);
  });

  it('passes the expected ffmpeg HLS arguments to generateHls', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'insta360-hls args-'));
    try {
      const child = createFakeChild();
      const calls: Array<{ command: string; args: string[] }> = [];
      const spawnImpl: SpawnProcess = (command, args) => {
        calls.push({ command, args });
        queueMicrotask(() => {
          child.emit('close', 0);
        });
        return child;
      };

      const playlist = await generateHls('C:\\input clips\\clip.insv', dir, { spawnImpl });

      expect(playlist).toBe(join(dir, 'master.m3u8'));
      expect(calls).toHaveLength(1);
      expect(calls[0].command).toBe('ffmpeg');
      expect(calls[0].args).toContain('[0:v:0][0:v:1]hstack=inputs=2,format=yuv420p[v]');
      expect(calls[0].args).toContain(join(dir, 'segment-%05d.ts'));
      expect(calls[0].args.at(-1)).toBe(join(dir, 'master.m3u8'));
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
