import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { IBackendDBService } from '../../src/services/db.service.js';
import type { HeatPeriodRecord } from '@home-automation/shared-types';
import periodsRoute from '../../src/routes/periods.route.js';

function createMockDBService(records: HeatPeriodRecord[] = []): IBackendDBService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getTemperatureHistory: vi.fn().mockResolvedValue([]),
    getHeatPeriods: vi.fn().mockResolvedValue(records),
    getCurrentState: vi.fn().mockResolvedValue([]),
  };
}

describe('Periods Route (GET /api/periods)', () => {
  let app: FastifyInstance;
  let dbService: IBackendDBService;

  const sampleRecords: HeatPeriodRecord[] = [
    { room: 'Garaaž', period: 1800000, start: 1700000000000, end: 1700001800000 },
    { room: 'Eesruum', period: 900000, start: 1700002000000, end: 1700002900000 },
  ];

  beforeEach(async () => {
    dbService = createMockDBService(sampleRecords);
    app = Fastify();
    await app.register(periodsRoute, { dbService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with records when data exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/periods',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(2);
    expect(body[0].room).toBe('Garaaž');
    expect(body[0].period).toBe(1800000);
  });

  it('uses default pagination (page=0, limit=10) when no params given', async () => {
    await app.inject({ method: 'GET', url: '/api/periods' });

    expect(dbService.getHeatPeriods).toHaveBeenCalledWith({ page: 0, limit: 10 });
  });

  it('passes custom pagination params to dbService', async () => {
    await app.inject({ method: 'GET', url: '/api/periods?page=3&limit=5' });

    expect(dbService.getHeatPeriods).toHaveBeenCalledWith({ page: 3, limit: 5 });
  });

  it('returns 400 when no records found for the range', async () => {
    const emptyDbService = createMockDBService([]);
    const emptyApp = Fastify();
    await emptyApp.register(periodsRoute, { dbService: emptyDbService });

    const response = await emptyApp.inject({
      method: 'GET',
      url: '/api/periods?page=99&limit=10',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'No records found for the requested range' });

    await emptyApp.close();
  });

  it('returns 400 for invalid page parameter (negative)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/periods?page=-1',
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for invalid limit parameter (zero)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/periods?limit=0',
    });

    expect(response.statusCode).toBe(400);
  });
});
