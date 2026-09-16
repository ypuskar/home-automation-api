import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { IBackendDBService } from '../../src/services/db.service.js';
import type { HistoryRecord } from '@home-automation/shared-types';
import tempsRoute from '../../src/routes/temps.route.js';

function createMockDBService(records: HistoryRecord[] = []): IBackendDBService {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
    getTemperatureHistory: vi.fn().mockResolvedValue(records),
    getHeatPeriods: vi.fn().mockResolvedValue([]),
    getCurrentState: vi.fn().mockResolvedValue([]),
  };
}

describe('Temps Route (GET /api/temps)', () => {
  let app: FastifyInstance;
  let dbService: IBackendDBService;

  const sampleRecords: HistoryRecord[] = [
    {
      Temp_garaaz: 6.5,
      Kyte_garaaz: true,
      Temp_Leiliruum: 45.1,
      Temp_Eesruum: 7.2,
      Kyte_eesruum: false,
      Temp_valjas: -2.3,
      Temp_kasvuhoone: 22.4,
      Niiskus_kasvuhoone: 61.2,
      Temp_elutuba: 21.3,
      Niiskus_elutuba: 48.7,
      TimeStamp: new Date('2024-01-15T12:00:00.000Z'),
    },
    {
      Temp_garaaz: 7.0,
      Kyte_garaaz: false,
      Temp_Leiliruum: 44.8,
      Temp_Eesruum: 7.5,
      Kyte_eesruum: false,
      Temp_valjas: -1.8,
      Temp_kasvuhoone: null,
      Niiskus_kasvuhoone: null,
      Temp_elutuba: null,
      Niiskus_elutuba: null,
      TimeStamp: new Date('2024-01-15T11:00:00.000Z'),
    },
  ];

  beforeEach(async () => {
    dbService = createMockDBService(sampleRecords);
    app = Fastify();
    await app.register(tempsRoute, { dbService });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 200 with records when data exists', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/temps',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(2);
    expect(body[0].Temp_garaaz).toBe(6.5);
  });

  it('includes Temp_kasvuhoone and Niiskus_kasvuhoone (null when not reported)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/temps' });

    const body = response.json();
    expect(body[0].Temp_kasvuhoone).toBe(22.4);
    expect(body[0].Niiskus_kasvuhoone).toBe(61.2);
    expect(body[1].Temp_kasvuhoone).toBeNull();
    expect(body[1].Niiskus_kasvuhoone).toBeNull();
  });

  it('includes Temp_elutuba and Niiskus_elutuba (null when not reported)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/temps' });

    const body = response.json();
    expect(body[0].Temp_elutuba).toBe(21.3);
    expect(body[0].Niiskus_elutuba).toBe(48.7);
    expect(body[1].Temp_elutuba).toBeNull();
    expect(body[1].Niiskus_elutuba).toBeNull();
  });

  it('uses default pagination (page=0, limit=10) when no params given', async () => {
    await app.inject({ method: 'GET', url: '/api/temps' });

    expect(dbService.getTemperatureHistory).toHaveBeenCalledWith({ page: 0, limit: 10 });
  });

  it('passes custom pagination params to dbService', async () => {
    await app.inject({ method: 'GET', url: '/api/temps?page=2&limit=7' });

    expect(dbService.getTemperatureHistory).toHaveBeenCalledWith({ page: 2, limit: 7 });
  });

  it('returns 400 when no records found for the range', async () => {
    const emptyDbService = createMockDBService([]);
    const emptyApp = Fastify();
    await emptyApp.register(tempsRoute, { dbService: emptyDbService });

    const response = await emptyApp.inject({
      method: 'GET',
      url: '/api/temps?page=99&limit=10',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'No records found for the requested range' });

    await emptyApp.close();
  });

  it('returns 400 for invalid page parameter (negative)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/temps?page=-1',
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for invalid limit parameter (zero)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/temps?limit=0',
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 400 for non-integer page parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/temps?page=1.5',
    });

    expect(response.statusCode).toBe(400);
  });
});
