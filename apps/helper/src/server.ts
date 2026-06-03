import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AssetStateStore } from './asset-state.js';
import { AssetCache } from './cache.js';
import { loadConfig } from './config.js';
import { ImmichClient } from './immich-client.js';
import { prepareAsset } from './prepare.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

type BuildServerOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: boolean;
  viewerRoot?: string;
  prepare?: typeof prepareAsset;
};

export async function buildServer(options: BuildServerOptions = {}) {
  const config = loadConfig(options.env ?? process.env);
  const app = Fastify({ logger: options.logger ?? true });
  const client = new ImmichClient(config.immichUrl, config.immichApiKey);
  const cache = new AssetCache(config.cacheDir);
  const states = new AssetStateStore();
  const prepare = options.prepare ?? prepareAsset;
  const inFlight = new Map<string, Promise<void>>();
  const verifyViewerToken = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!config.viewerToken) return;

    const headerToken = request.headers['x-viewer-token'];
    const query = request.query as { token?: string } | undefined;
    const token = Array.isArray(headerToken) ? headerToken[0] : headerToken ?? query?.token;

    if (token !== config.viewerToken) {
      return reply.code(401).send({ error: 'Viewer token is required' });
    }
  };

  function startPrepare(assetId: string): void {
    if (inFlight.has(assetId)) return;

    const task = prepare(assetId, client, cache, states)
      .catch(() => undefined)
      .finally(() => {
        inFlight.delete(assetId);
      });
    inFlight.set(assetId, task);
  }

  app.get('/health', async () => ({ status: 'ok', version: '0.1.2' }));

  app.get('/api/assets/:assetId/status', { preHandler: verifyViewerToken }, async (request) => {
    const { assetId } = request.params as { assetId: string };
    return states.get(assetId);
  });

  app.post('/api/assets/:assetId/prepare', { preHandler: verifyViewerToken }, async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    startPrepare(assetId);
    return reply.code(202).send(states.get(assetId));
  });

  app.get('/stream/:assetId/:file', { preHandler: verifyViewerToken }, async (request, reply) => {
    const { assetId, file } = request.params as { assetId: string; file: string };
    const entry = await cache.entryFor(assetId);
    return reply.sendFile(file, entry.hlsDir);
  });

  app.register(fastifyStatic, {
    root: options.viewerRoot ?? join(__dirname, '../viewer-dist'),
    prefix: '/',
  });

  app.get('/view/:assetId', async (_request, reply) => {
    return reply.sendFile('index.html');
  });

  return { app, config };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { app, config } = await buildServer();
  await app.listen({ host: '0.0.0.0', port: config.port });
}
