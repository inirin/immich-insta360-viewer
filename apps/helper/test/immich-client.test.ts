import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ImmichClient } from '../src/immich-client.js';

const previousDispatcher = getGlobalDispatcher();
let mockAgent: MockAgent;

describe('ImmichClient', () => {
  beforeEach(() => {
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(async () => {
    setGlobalDispatcher(previousDispatcher);
    await mockAgent.close();
  });

  it('fetches asset metadata with API key', async () => {
    const pool = mockAgent.get('http://immich.test');
    pool.intercept({
      path: '/api/assets/asset-1',
      method: 'GET',
      headers: { 'X-API-Key': 'secret' },
    }).reply(200, {
      id: 'asset-1',
      type: 'VIDEO',
      originalFileName: 'clip.insv',
    });

    const client = new ImmichClient('http://immich.test', 'secret');
    const asset = await client.getAsset('asset-1');

    expect(asset.originalFileName).toBe('clip.insv');
  });

  it('encodes asset IDs when building Immich URLs', async () => {
    const pool = mockAgent.get('http://immich.test');
    pool.intercept({
      path: '/api/assets/asset%2F1%3Ftest',
      method: 'GET',
      headers: { 'X-API-Key': 'secret' },
    }).reply(200, {
      id: 'asset/1?test',
      type: 'VIDEO',
      originalFileName: 'clip.insv',
    });

    const client = new ImmichClient('http://immich.test', 'secret');
    const asset = await client.getAsset('asset/1?test');

    expect(asset.id).toBe('asset/1?test');
  });

  it('throws status-specific errors on failed metadata lookup', async () => {
    const pool = mockAgent.get('http://immich.test');
    pool.intercept({
      path: '/api/assets/missing',
      method: 'GET',
      headers: { 'X-API-Key': 'secret' },
    }).reply(404, { message: 'not found' });

    const client = new ImmichClient('http://immich.test', 'secret');

    await expect(client.getAsset('missing')).rejects.toThrow(
      'Immich asset lookup failed with status 404',
    );
  });

  it('returns original download stream and content length', async () => {
    const pool = mockAgent.get('http://immich.test');
    pool.intercept({
      path: '/api/assets/asset-1/original',
      method: 'GET',
      headers: { 'X-API-Key': 'secret' },
    }).reply(200, 'video-bytes', {
      headers: { 'content-length': '11' },
    });

    const client = new ImmichClient('http://immich.test', 'secret');
    const download = await client.downloadOriginal('asset-1');

    expect(download.sizeBytes).toBe(11);
  });
});
