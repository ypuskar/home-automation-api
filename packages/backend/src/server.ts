/**
 * Fastify server setup for the API-server backend.
 * Creates an HTTPS Fastify instance, registers CORS, static file serving,
 * Swagger/OpenAPI docs, and all route plugins.
 *
 * Requirements: 12.1, 12.2, 12.3, 8.1, 8.2
 */

import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';

import swaggerPlugin from './plugins/swagger.js';
import sseRoute from './routes/sse.route.js';
import tempsRoute from './routes/temps.route.js';
import periodsRoute from './routes/periods.route.js';
import healthRoute from './routes/health.route.js';

import type { BackendConfig } from './config.js';
import type { ISSEService } from './services/sse.service.js';
import type { ICurrentStatePoller } from './services/current-state-poller.service.js';
import type { IBackendDBService } from './services/db.service.js';

export interface BuildServerOptions {
  config: BackendConfig;
  sseService: ISSEService;
  poller: ICurrentStatePoller;
  dbService: IBackendDBService;
}

/**
 * Build and configure the Fastify server with HTTPS, CORS, static files,
 * OpenAPI docs, and all route plugins.
 *
 * Does NOT call listen() — the caller is responsible for starting the server.
 */
export async function buildServer(opts: BuildServerOptions): Promise<FastifyInstance> {
  const { config, sseService, poller, dbService } = opts;

  // Use HTTPS if TLS certs exist, otherwise fall back to HTTP (debug/dev mode)
  let httpsOpts: { key: Buffer; cert: Buffer } | undefined;
  try {
    httpsOpts = {
      key: fs.readFileSync(config.tls.keyPath),
      cert: fs.readFileSync(config.tls.certPath),
    };
  } catch {
    // TLS certs not found — run as HTTP (acceptable for development)
  }

  const fastify = Fastify({
    logger: true,
    ...(httpsOpts ? { https: httpsOpts } : {}),
  });

  // CORS: allow all origins (Nõue 12.3)
  await fastify.register(cors, { origin: true });

  // Serve frontend dist/ at GET / (Nõue 8.1, 8.2)
  const frontendDistPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../frontend/dist'
  );
  await fastify.register(staticFiles, {
    root: frontendDistPath,
    prefix: '/',
    // Don't throw if dist/ doesn't exist yet (frontend not built)
    decorateReply: true,
  });

  // OpenAPI docs (Nõue 7a.1, 7a.2, 7a.3)
  await fastify.register(swaggerPlugin);

  // Route plugins
  await fastify.register(sseRoute, { sseService, poller });
  await fastify.register(tempsRoute, { dbService });
  await fastify.register(periodsRoute, { dbService });
  await fastify.register(healthRoute, { poller, staleAfterMs: config.staleAfterMs });

  // SPA fallback: serve index.html for any non-API, non-file GET requests (Nõue 8.1, 14.8)
  fastify.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api/') && !request.url.startsWith('/sse')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });

  return fastify;
}
