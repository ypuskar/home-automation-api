import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ISSEService } from '../../src/services/sse.service.js';
import type { ICurrentStatePoller } from '../../src/services/current-state-poller.service.js';
import type { SSEPayload } from '@home-automation/shared-types';
import sseRoute from '../../src/routes/sse.route.js';

function createMockSSEService(): ISSEService {
  return {
    addClient: vi.fn(),
    removeClient: vi.fn(),
    broadcast: vi.fn(),
    getClientCount: vi.fn().mockReturnValue(0),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function createMockPoller(payload: SSEPayload = {}): ICurrentStatePoller {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getLatest: vi.fn().mockReturnValue(payload),
    onUpdate: vi.fn(),
  };
}

describe('SSE Route (GET /sse)', () => {
  let app: FastifyInstance;
  let sseService: ISSEService;
  let poller: ICurrentStatePoller;
  const latestPayload: SSEPayload = {
    '28-0517c3a351ff': { temp: 6.5, heat: true, HeatStart: 1700000000000, HeatEnd: 0 },
    '28-0417c28ee3ff': { temp: -1.2, heat: false },
  };

  beforeEach(async () => {
    sseService = createMockSSEService();
    poller = createMockPoller(latestPayload);

    app = Fastify();
    await app.register(sseRoute, { sseService, poller });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('calls poller.getLatest() on connect to send immediate first message', async () => {
    // Use a real HTTP connection to test SSE since inject() hangs on hijacked responses
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const controller = new AbortController();
    const fetchPromise = fetch(`${address}/sse`, { signal: controller.signal });

    // Wait briefly for the connection to establish
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(poller.getLatest).toHaveBeenCalledTimes(1);

    controller.abort();
    try { await fetchPromise; } catch { /* aborted */ }
  });

  it('adds client to SSE service on connect', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const controller = new AbortController();
    const fetchPromise = fetch(`${address}/sse`, { signal: controller.signal });

    await new Promise(resolve => setTimeout(resolve, 100));

    expect(sseService.addClient).toHaveBeenCalledTimes(1);

    controller.abort();
    try { await fetchPromise; } catch { /* aborted */ }
  });

  it('removes client from SSE service on disconnect', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const controller = new AbortController();
    const fetchPromise = fetch(`${address}/sse`, { signal: controller.signal });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Abort the connection (simulates client disconnect)
    controller.abort();
    try { await fetchPromise; } catch { /* aborted */ }

    // Wait for the close event to propagate
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(sseService.removeClient).toHaveBeenCalledTimes(1);
  });

  it('sends SSE-formatted data with correct headers and immediate payload', async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });

    const controller = new AbortController();
    const response = await fetch(`${address}/sse`, { signal: controller.signal });

    // Verify SSE headers
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('connection')).toBe('keep-alive');
    expect(response.status).toBe(200);

    // Read the first chunk from the stream
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toBe(`data: ${JSON.stringify(latestPayload)}\n\n`);

    await reader.cancel();
    controller.abort();
  });

  it('sends empty payload when poller has no data', async () => {
    const emptyApp = Fastify();
    const emptyPoller = createMockPoller({});
    await emptyApp.register(sseRoute, { sseService, poller: emptyPoller });

    const address = await emptyApp.listen({ port: 0, host: '127.0.0.1' });

    const controller = new AbortController();
    const response = await fetch(`${address}/sse`, { signal: controller.signal });

    const reader = response.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);

    expect(text).toBe('data: {}\n\n');

    await reader.cancel();
    controller.abort();
    await emptyApp.close();
  });
});
