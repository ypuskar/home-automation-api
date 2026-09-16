import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import type { IBackendDBService } from '../../src/services/db.service.js';
import type { CurrentStateRecord } from '@home-automation/shared-types';
import { CurrentStatePoller } from '../../src/services/current-state-poller.service.js';

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

function createMockDbService(records: CurrentStateRecord[] = []): IBackendDBService {
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getTemperatureHistory: vi.fn().mockResolvedValue([]),
    getHeatPeriods: vi.fn().mockResolvedValue([]),
    getCurrentState: vi.fn().mockResolvedValue(records),
  };
}

/**
 * Helper to create a CurrentStateRecord with sensible defaults.
 */
function makeRecord(overrides: Partial<CurrentStateRecord> & { sensorId: string }): CurrentStateRecord {
  return {
    temp: 20.0,
    humidity: null,
    heat: false,
    heatStart: null,
    heatEnd: null,
    lastUpdated: new Date(),
    ...overrides,
  };
}

describe('CurrentStatePoller', () => {
  let poller: CurrentStatePoller;
  let logger: Logger;
  let dbService: IBackendDBService;

  const STALE_AFTER_MS = 15000;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
  });

  afterEach(() => {
    poller?.stop();
    vi.useRealTimers();
  });

  describe('getLatest()', () => {
    it('returns empty object before first poll', () => {
      dbService = createMockDbService();
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      expect(poller.getLatest()).toEqual({});
    });

    it('returns empty object when table is empty (Nõue 18.5)', async () => {
      dbService = createMockDbService([]);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(poller.getLatest()).toEqual({});
    });
  });

  describe('start() / stop()', () => {
    it('performs an immediate poll on start', async () => {
      const now = new Date();
      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 6.5, heat: true, heatStart: 1700000000000, heatEnd: 0, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(dbService.getCurrentState).toHaveBeenCalledTimes(1);
      expect(poller.getLatest()).not.toEqual({});
    });

    it('polls at the configured interval', async () => {
      dbService = createMockDbService([]);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(dbService.getCurrentState).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(2000);
      expect(dbService.getCurrentState).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2000);
      expect(dbService.getCurrentState).toHaveBeenCalledTimes(3);
    });

    it('stops polling when stop() is called', async () => {
      dbService = createMockDbService([]);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      poller.stop();
      await vi.advanceTimersByTimeAsync(4000);

      // Only the initial poll should have happened
      expect(dbService.getCurrentState).toHaveBeenCalledTimes(1);
    });

    it('ignores duplicate start() calls', async () => {
      dbService = createMockDbService([]);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(logger.warn).toHaveBeenCalledWith('Poller already running, ignoring start()');
    });
  });

  describe('SSEPayload building', () => {
    it('builds payload for heated rooms with HeatStart/HeatEnd', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 6.5, heat: true, heatStart: 1700000000000, heatEnd: 0, lastUpdated: now }),
        makeRecord({ sensorId: '28-0417c2a85dff', temp: 7.2, heat: false, heatStart: 0, heatEnd: 1700000120000, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['28-0517c3a351ff']).toEqual({
        temp: 6.5,
        heat: true,
        HeatStart: 1700000000000,
        HeatEnd: 0,
      });
      expect(payload['28-0417c2a85dff']).toEqual({
        temp: 7.2,
        heat: false,
        HeatStart: 0,
        HeatEnd: 1700000120000,
      });
    });

    it('builds payload for non-heated rooms with temp/heat only', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0417c28ee3ff', temp: -2.1, heat: false, lastUpdated: now }),
        makeRecord({ sensorId: '28-0417c2da95ff', temp: 45.3, heat: false, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['28-0417c28ee3ff']).toEqual({ temp: -2.1, heat: false });
      expect(payload['28-0417c2da95ff']).toEqual({ temp: 45.3, heat: false });
      // No HeatStart/HeatEnd on non-heated rooms
      expect(payload['28-0417c28ee3ff']).not.toHaveProperty('HeatStart');
      expect(payload['28-0417c28ee3ff']).not.toHaveProperty('HeatEnd');
    });

    it('includes humidity for sensors that report it (e.g. DHT22)', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: 'dht22-kasvuhoone', temp: 22.4, humidity: 61.2, heat: false, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['dht22-kasvuhoone']).toEqual({ temp: 22.4, humidity: 61.2, heat: false });
    });

    it('omits humidity for sensors that do not report it', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0417c28ee3ff', temp: -2.1, humidity: null, heat: false, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['28-0417c28ee3ff']).not.toHaveProperty('humidity');
    });

    it('includes all 4 sensors in the payload', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 6.5, heat: true, heatStart: 1700000000000, heatEnd: 0, lastUpdated: now }),
        makeRecord({ sensorId: '28-0417c2a85dff', temp: 7.2, heat: false, heatStart: 0, heatEnd: 0, lastUpdated: now }),
        makeRecord({ sensorId: '28-0417c28ee3ff', temp: -2.1, heat: false, lastUpdated: now }),
        makeRecord({ sensorId: '28-0417c2da95ff', temp: 45.3, heat: false, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(Object.keys(payload)).toHaveLength(4);
    });

    it('uses 0 as default for null heatStart/heatEnd on heated rooms', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 7.0, heat: false, heatStart: null, heatEnd: null, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['28-0517c3a351ff'].HeatStart).toBe(0);
      expect(payload['28-0517c3a351ff'].HeatEnd).toBe(0);
    });
  });

  describe('staleness detection (Nõue 3.8)', () => {
    it('marks sensor as stale when lastUpdated exceeds staleAfterMs', async () => {
      const staleTime = new Date(Date.now() - 20000); // 20s ago, threshold is 15s
      vi.setSystemTime(new Date());

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 6.5, heat: true, heatStart: 1700000000000, heatEnd: 0, lastUpdated: staleTime }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['28-0517c3a351ff'].stale).toBe(true);
    });

    it('does not mark sensor as stale when lastUpdated is within threshold', async () => {
      const freshTime = new Date(Date.now() - 5000); // 5s ago, threshold is 15s
      vi.setSystemTime(new Date());

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 6.5, heat: true, heatStart: 1700000000000, heatEnd: 0, lastUpdated: freshTime }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['28-0517c3a351ff'].stale).toBeUndefined();
    });

    it('handles per-sensor staleness (some stale, some fresh)', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const freshTime = new Date(now.getTime() - 5000);  // 5s ago
      const staleTime = new Date(now.getTime() - 20000); // 20s ago

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 6.5, heat: true, heatStart: 1700000000000, heatEnd: 0, lastUpdated: freshTime }),
        makeRecord({ sensorId: '28-0417c28ee3ff', temp: -2.1, heat: false, lastUpdated: staleTime }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      expect(payload['28-0517c3a351ff'].stale).toBeUndefined();
      expect(payload['28-0417c28ee3ff'].stale).toBe(true);
    });

    it('marks as stale at exactly staleAfterMs + 1ms boundary', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      // Exactly at threshold: not stale
      const atThreshold = new Date(now.getTime() - STALE_AFTER_MS);
      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0517c3a351ff', temp: 6.5, heat: false, heatStart: 0, heatEnd: 0, lastUpdated: atThreshold }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      const payload = poller.getLatest();
      // At exactly the threshold (diff === staleAfterMs), NOT stale (uses >)
      expect(payload['28-0517c3a351ff'].stale).toBeUndefined();
    });
  });

  describe('onUpdate() callbacks', () => {
    it('notifies registered callbacks on each poll', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0417c28ee3ff', temp: 10.0, heat: false, lastUpdated: now }),
      ];
      dbService = createMockDbService(records);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      const callback = vi.fn();
      poller.onUpdate(callback);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ '28-0417c28ee3ff': { temp: 10.0, heat: false } });
    });

    it('notifies multiple callbacks', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      dbService = createMockDbService([makeRecord({ sensorId: '28-0417c28ee3ff', temp: 5.0, heat: false, lastUpdated: now })]);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      const cb1 = vi.fn();
      const cb2 = vi.fn();
      poller.onUpdate(cb1);
      poller.onUpdate(cb2);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(cb1).toHaveBeenCalledTimes(1);
      expect(cb2).toHaveBeenCalledTimes(1);
    });

    it('continues even if a callback throws', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      dbService = createMockDbService([makeRecord({ sensorId: '28-0417c28ee3ff', temp: 5.0, heat: false, lastUpdated: now })]);
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      const errorCb = vi.fn(() => { throw new Error('callback error'); });
      const goodCb = vi.fn();
      poller.onUpdate(errorCb);
      poller.onUpdate(goodCb);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      expect(errorCb).toHaveBeenCalledTimes(1);
      expect(goodCb).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Error in poller update callback'
      );
    });
  });

  describe('error handling', () => {
    it('does not crash when DB query fails', async () => {
      dbService = createMockDbService();
      (dbService.getCurrentState as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DB down'));
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      // Should log error but not throw
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Error polling current_state'
      );
      // Keeps the last known payload (empty initially)
      expect(poller.getLatest()).toEqual({});
    });

    it('preserves last known payload when a subsequent poll fails', async () => {
      const now = new Date();
      vi.setSystemTime(now);

      const records: CurrentStateRecord[] = [
        makeRecord({ sensorId: '28-0417c28ee3ff', temp: 10.0, heat: false, lastUpdated: now }),
      ];
      const mockGetCurrentState = vi.fn()
        .mockResolvedValueOnce(records)
        .mockRejectedValueOnce(new Error('connection lost'));

      dbService = {
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        getTemperatureHistory: vi.fn().mockResolvedValue([]),
        getHeatPeriods: vi.fn().mockResolvedValue([]),
        getCurrentState: mockGetCurrentState,
      };
      poller = new CurrentStatePoller(dbService, STALE_AFTER_MS, logger);

      poller.start(2000);
      await vi.advanceTimersByTimeAsync(0);

      // First poll succeeds
      expect(poller.getLatest()).toEqual({ '28-0417c28ee3ff': { temp: 10.0, heat: false } });

      // Second poll fails
      await vi.advanceTimersByTimeAsync(2000);
      // Should still return the last successful payload
      expect(poller.getLatest()).toEqual({ '28-0417c28ee3ff': { temp: 10.0, heat: false } });
    });
  });
});
