import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { ICurrentStatePoller } from '../../src/services/current-state-poller.service.js';
import type { SSEPayload } from '@home-automation/shared-types';
import healthRoute from '../../src/routes/health.route.js';

function createMockPoller(payload: SSEPayload = {}): ICurrentStatePoller {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getLatest: vi.fn().mockReturnValue(payload),
    onUpdate: vi.fn(),
  };
}

describe('Health Route (GET /api/health)', () => {
  let app: FastifyInstance;
  let poller: ICurrentStatePoller;
  const staleAfterMs = 15000;

  beforeEach(async () => {
    poller = createMockPoller({
      '28-0517c3a351ff': { temp: 6.5, heat: true, HeatStart: 1700000000000, HeatEnd: 0 },
      '28-0417c28ee3ff': { temp: -1.2, heat: false },
    });

    app = Fastify();
    await app.register(healthRoute, { poller, staleAfterMs });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with health data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty('node');
    expect(body).toHaveProperty('server');
    expect(body).toHaveProperty('hardwareAgent');
    expect(body.hardwareAgent).toHaveProperty('lastUpdate');
    expect(body.hardwareAgent).toHaveProperty('stale');
  });

  it('returns node uptime as positive integer (ms)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const body = response.json();
    expect(body.node).toBeGreaterThan(0);
    expect(Number.isInteger(body.node)).toBe(true);
  });

  it('returns server (OS) uptime as positive integer (ms)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const body = response.json();
    expect(body.server).toBeGreaterThan(0);
    expect(Number.isInteger(body.server)).toBe(true);
  });

  it('reports stale=false when no sensors have stale flag', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const body = response.json();
    expect(body.hardwareAgent.stale).toBe(false);
  });

  it('reports stale=true when any sensor has stale flag', async () => {
    const stalePoller = createMockPoller({
      '28-0517c3a351ff': { temp: 6.5, heat: true, HeatStart: 1700000000000, HeatEnd: 0, stale: true },
      '28-0417c28ee3ff': { temp: -1.2, heat: false },
    });

    const staleApp = Fastify();
    await staleApp.register(healthRoute, { poller: stalePoller, staleAfterMs });

    const response = await staleApp.inject({
      method: 'GET',
      url: '/api/health',
    });

    const body = response.json();
    expect(body.hardwareAgent.stale).toBe(true);

    await staleApp.close();
  });

  it('reports stale=true and epoch timestamp when poller has no data (empty state)', async () => {
    const emptyPoller = createMockPoller({});

    const emptyApp = Fastify();
    await emptyApp.register(healthRoute, { poller: emptyPoller, staleAfterMs });

    const response = await emptyApp.inject({
      method: 'GET',
      url: '/api/health',
    });

    const body = response.json();
    expect(body.hardwareAgent.stale).toBe(true);
    expect(body.hardwareAgent.lastUpdate).toBe('1970-01-01T00:00:00.000Z');

    await emptyApp.close();
  });

  it('returns valid ISO date-time for lastUpdate', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    const body = response.json();
    const parsed = new Date(body.hardwareAgent.lastUpdate);
    expect(parsed.toISOString()).toBe(body.hardwareAgent.lastUpdate);
  });
});
