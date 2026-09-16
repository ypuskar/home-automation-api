import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import type { Logger } from 'pino';
import type { BackendConfig } from '../../src/config.js';

// Mock pg module before importing the service
vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockConnect = vi.fn();
  const mockEnd = vi.fn();
  const mockOn = vi.fn();
  const mockRelease = vi.fn();

  const MockPool = vi.fn(() => ({
    query: mockQuery,
    connect: mockConnect.mockResolvedValue({ release: mockRelease }),
    end: mockEnd.mockResolvedValue(undefined),
    on: mockOn,
  }));

  return { Pool: MockPool };
});

import { Pool } from 'pg';
import { BackendDBService } from '../../src/services/db.service.js';

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
}

function createDbConfig(): BackendConfig['database'] {
  return {
    host: 'localhost',
    port: 5432,
    database: 'pi',
    user: 'user',
    password: 'secret',
    maxConnections: 10,
  };
}

describe('BackendDBService', () => {
  let service: BackendDBService;
  let logger: Logger;
  let config: BackendConfig['database'];
  let mockPoolInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createMockLogger();
    config = createDbConfig();

    service = new BackendDBService(config, logger);

    // Get a reference to the mock pool instance that will be created
    mockPoolInstance = {
      query: vi.fn(),
      connect: vi.fn().mockResolvedValue({ release: vi.fn() }),
      end: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };
    (Pool as unknown as Mock).mockImplementation(() => mockPoolInstance);
  });

  describe('connect()', () => {
    it('creates a pool and verifies connectivity', async () => {
      await service.connect();

      expect(Pool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 5432,
        database: 'pi',
        user: 'user',
        password: 'secret',
        max: 10,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
      });
      expect(mockPoolInstance.connect).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'localhost', port: 5432, database: 'pi' }),
        'Database connected'
      );
    });

    it('registers a pool error handler', async () => {
      await service.connect();
      expect(mockPoolInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('handles connection failure gracefully (schedules reconnect)', async () => {
      mockPoolInstance.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await service.connect();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to connect to database'
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ delay: 1000, attempt: 1 }),
        'Scheduling database reconnection'
      );
    });
  });

  describe('disconnect()', () => {
    it('closes the pool', async () => {
      await service.connect();
      await service.disconnect();

      expect(mockPoolInstance.end).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Database pool closed');
    });

    it('does nothing if not connected', async () => {
      await service.disconnect();
      expect(mockPoolInstance.end).not.toHaveBeenCalled();
    });
  });

  describe('getTemperatureHistory()', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('returns empty array when not connected', async () => {
      await service.disconnect();
      const result = await service.getTemperatureHistory({ page: 0, limit: 7 });
      expect(result).toEqual([]);
    });

    it('queries with correct day-range pagination for page 0', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getTemperatureHistory({ page: 0, limit: 7 });

      expect(mockPoolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "History"'),
        ['0', '7']
      );
    });

    it('queries with correct day-range pagination for page 1', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getTemperatureHistory({ page: 1, limit: 7 });

      // page=1, limit=7: startDays=7, endDays=14
      expect(mockPoolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "History"'),
        ['7', '14']
      );
    });

    it('queries with correct day-range pagination for page 2, limit 10', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getTemperatureHistory({ page: 2, limit: 10 });

      // page=2, limit=10: startDays=20, endDays=30
      expect(mockPoolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "History"'),
        ['20', '30']
      );
    });

    it('uses parameterized query with INTERVAL casting', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getTemperatureHistory({ page: 0, limit: 7 });

      const queryText = mockPoolInstance.query.mock.calls[0][0];
      // Verify parameterized INTERVAL syntax
      expect(queryText).toContain("($2 || ' days')::interval");
      expect(queryText).toContain("($1 || ' days')::interval");
    });

    it('orders results by TimeStamp DESC', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getTemperatureHistory({ page: 0, limit: 7 });

      const queryText = mockPoolInstance.query.mock.calls[0][0];
      expect(queryText).toContain('ORDER BY "TimeStamp" DESC');
    });

    it('returns rows as HistoryRecord array', async () => {
      const mockRows = [
        {
          Temp_garaaz: 6.5,
          Kyte_garaaz: true,
          Temp_Leiliruum: 45.0,
          Temp_Eesruum: 7.2,
          Kyte_eesruum: false,
          Temp_valjas: -2.1,
          TimeStamp: new Date('2024-01-15T12:00:00Z'),
        },
      ];
      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getTemperatureHistory({ page: 0, limit: 7 });

      expect(result).toEqual(mockRows);
    });

    it('returns empty array and logs on query error', async () => {
      mockPoolInstance.query.mockRejectedValueOnce(new Error('query failed'));

      const result = await service.getTemperatureHistory({ page: 0, limit: 7 });

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to query temperature history'
      );
    });
  });

  describe('getHeatPeriods()', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('returns empty array when not connected', async () => {
      await service.disconnect();
      const result = await service.getHeatPeriods({ page: 0, limit: 7 });
      expect(result).toEqual([]);
    });

    it('queries with correct day-range pagination for page 0', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getHeatPeriods({ page: 0, limit: 7 });

      expect(mockPoolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "Heatperiod"'),
        ['0', '7']
      );
    });

    it('queries with correct day-range pagination for page 1', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getHeatPeriods({ page: 1, limit: 7 });

      expect(mockPoolInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM "Heatperiod"'),
        ['7', '14']
      );
    });

    it('uses parameterized query with INTERVAL casting', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getHeatPeriods({ page: 0, limit: 7 });

      const queryText = mockPoolInstance.query.mock.calls[0][0];
      expect(queryText).toContain("($2 || ' days')::interval");
      expect(queryText).toContain("($1 || ' days')::interval");
    });

    it('maps DB column names to HeatPeriodRecord interface', async () => {
      const mockRows = [
        { Room: 'Garaaž', Period: 120000, Start: 1700000000000, End: 1700000120000 },
        { Room: 'Eesruum', Period: 60000, Start: 1700000200000, End: 1700000260000 },
      ];
      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getHeatPeriods({ page: 0, limit: 7 });

      expect(result).toEqual([
        { room: 'Garaaž', period: 120000, start: 1700000000000, end: 1700000120000 },
        { room: 'Eesruum', period: 60000, start: 1700000200000, end: 1700000260000 },
      ]);
    });

    it('converts bigint Start/End to Number', async () => {
      const mockRows = [
        { Room: 'Garaaž', Period: 5000, Start: BigInt(1700000000000), End: BigInt(1700000005000) },
      ];
      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getHeatPeriods({ page: 0, limit: 7 });

      expect(result[0].start).toBe(1700000000000);
      expect(result[0].end).toBe(1700000005000);
      expect(typeof result[0].start).toBe('number');
      expect(typeof result[0].end).toBe('number');
    });

    it('returns empty array and logs on query error', async () => {
      mockPoolInstance.query.mockRejectedValueOnce(new Error('query failed'));

      const result = await service.getHeatPeriods({ page: 0, limit: 7 });

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to query heat periods'
      );
    });
  });

  describe('getCurrentState()', () => {
    beforeEach(async () => {
      await service.connect();
    });

    it('returns empty array when not connected', async () => {
      await service.disconnect();
      const result = await service.getCurrentState();
      expect(result).toEqual([]);
    });

    it('queries the current_state table', async () => {
      mockPoolInstance.query.mockResolvedValueOnce({ rows: [] });

      await service.getCurrentState();

      const queryText = mockPoolInstance.query.mock.calls[0][0];
      expect(queryText).toContain('SELECT sensor_id, temp, humidity, heat, heat_start, heat_end, last_updated');
      expect(queryText).toContain('FROM current_state');
    });

    it('maps DB column names to CurrentStateRecord interface', async () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const mockRows = [
        { sensor_id: '28-0517c3a351ff', temp: 6.5, humidity: null, heat: true, heat_start: 1700000000000, heat_end: null, last_updated: now },
        { sensor_id: '28-0417c28ee3ff', temp: -2.1, humidity: null, heat: false, heat_start: null, heat_end: null, last_updated: now },
      ];
      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getCurrentState();

      expect(result).toEqual([
        { sensorId: '28-0517c3a351ff', temp: 6.5, humidity: null, heat: true, heatStart: 1700000000000, heatEnd: null, lastUpdated: now },
        { sensorId: '28-0417c28ee3ff', temp: -2.1, humidity: null, heat: false, heatStart: null, heatEnd: null, lastUpdated: now },
      ]);
    });

    it('maps humidity through for sensors that report it (e.g. DHT22)', async () => {
      const now = new Date('2024-01-15T12:00:00Z');
      const mockRows = [
        { sensor_id: 'dht22-kasvuhoone', temp: 22.4, humidity: 61.2, heat: false, heat_start: null, heat_end: null, last_updated: now },
      ];
      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getCurrentState();

      expect(result).toEqual([
        { sensorId: 'dht22-kasvuhoone', temp: 22.4, humidity: 61.2, heat: false, heatStart: null, heatEnd: null, lastUpdated: now },
      ]);
    });

    it('converts bigint heat_start/heat_end to Number', async () => {
      const now = new Date();
      const mockRows = [
        { sensor_id: '28-0517c3a351ff', temp: 7.0, humidity: null, heat: true, heat_start: BigInt(1700000000000), heat_end: BigInt(1700000120000), last_updated: now },
      ];
      mockPoolInstance.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await service.getCurrentState();

      expect(result[0].heatStart).toBe(1700000000000);
      expect(result[0].heatEnd).toBe(1700000120000);
      expect(typeof result[0].heatStart).toBe('number');
      expect(typeof result[0].heatEnd).toBe('number');
    });

    it('returns empty array and logs on query error', async () => {
      mockPoolInstance.query.mockRejectedValueOnce(new Error('connection lost'));

      const result = await service.getCurrentState();

      expect(result).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to query current_state'
      );
    });
  });

  describe('exponential backoff on connection error', () => {
    it('triggers reconnect on ECONNREFUSED error during query', async () => {
      await service.connect();

      const connError = new Error('connection refused');
      (connError as any).code = 'ECONNREFUSED';
      mockPoolInstance.query.mockRejectedValueOnce(connError);

      await service.getTemperatureHistory({ page: 0, limit: 7 });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ delay: 1000, attempt: 1 }),
        'Scheduling database reconnection'
      );
    });

    it('does not trigger reconnect on non-connection query errors', async () => {
      await service.connect();

      const queryError = new Error('syntax error at position 42');
      (queryError as any).code = '42601'; // syntax_error
      mockPoolInstance.query.mockRejectedValueOnce(queryError);

      await service.getTemperatureHistory({ page: 0, limit: 7 });

      // Should not schedule reconnect for a syntax error
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ delay: expect.any(Number), attempt: expect.any(Number) }),
        'Scheduling database reconnection'
      );
    });
  });

  describe('pagination calculation', () => {
    beforeEach(async () => {
      await service.connect();
      mockPoolInstance.query.mockResolvedValue({ rows: [] });
    });

    it('page=0, limit=7 → startDays=0, endDays=7', async () => {
      await service.getTemperatureHistory({ page: 0, limit: 7 });
      expect(mockPoolInstance.query).toHaveBeenCalledWith(expect.any(String), ['0', '7']);
    });

    it('page=1, limit=7 → startDays=7, endDays=14', async () => {
      await service.getTemperatureHistory({ page: 1, limit: 7 });
      expect(mockPoolInstance.query).toHaveBeenCalledWith(expect.any(String), ['7', '14']);
    });

    it('page=0, limit=10 → startDays=0, endDays=10', async () => {
      await service.getTemperatureHistory({ page: 0, limit: 10 });
      expect(mockPoolInstance.query).toHaveBeenCalledWith(expect.any(String), ['0', '10']);
    });

    it('page=3, limit=5 → startDays=15, endDays=20', async () => {
      await service.getTemperatureHistory({ page: 3, limit: 5 });
      expect(mockPoolInstance.query).toHaveBeenCalledWith(expect.any(String), ['15', '20']);
    });
  });
});
