/**
 * SSE route plugin for Fastify.
 * GET /sse — establishes a Server-Sent Events connection.
 *
 * - Sets SSE headers (Content-Type: text/event-stream, Cache-Control: no-cache, Connection: keep-alive)
 * - On connect: sends immediate first message (latest state from poller), adds client to SSE service
 * - On disconnect: removes client from broadcast list
 *
 * Requirements: 3.1, 3.2
 */

import type { FastifyPluginAsync } from 'fastify';
import type { ISSEService } from '../services/sse.service.js';
import type { ICurrentStatePoller } from '../services/current-state-poller.service.js';

export interface SSERouteOptions {
  sseService: ISSEService;
  poller: ICurrentStatePoller;
}

const sseRoute: FastifyPluginAsync<SSERouteOptions> = async (fastify, opts) => {
  fastify.get('/sse', async (request, reply) => {
    // Set SSE headers via raw response (we're hijacking Fastify's response handling)
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send immediate first message with the latest known state (Nõue 3.1)
    const latest = opts.poller.getLatest();
    reply.raw.write(`data: ${JSON.stringify(latest)}\n\n`);

    // Add client to SSE service for subsequent broadcasts (Nõue 3.2)
    opts.sseService.addClient(reply);

    // On disconnect: remove client from broadcast list
    request.raw.on('close', () => {
      opts.sseService.removeClient(reply);
    });

    // Prevent Fastify from auto-sending a response — we're streaming
    reply.hijack();
  });
};

export default sseRoute;
