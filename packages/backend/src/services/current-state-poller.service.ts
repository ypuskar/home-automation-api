/**
 * Current-state poller service for the API-server backend.
 * Polls the current_state table (written by the hardware-agent on the old Pi)
 * every 2s (configurable) and builds an SSEPayload with staleness detection.
 *
 * Requirements: 3.7, 3.8, 18.4, 18.5
 */

import type { Logger } from 'pino';
import type { IBackendDBService } from './db.service.js';
import type { SSEPayload, RoomState, CurrentStateRecord } from '@home-automation/shared-types';

export interface ICurrentStatePoller {
  start(pollInterval: number): void;
  stop(): void;
  getLatest(): SSEPayload;
  onUpdate(cb: (payload: SSEPayload) => void): void;
}

/**
 * Sensor IDs that have heating capability.
 * Used to determine which sensors get HeatStart/HeatEnd fields in the payload.
 */
const HEATED_SENSOR_IDS = new Set([
  '28-0517c3a351ff', // Garaaž
  '28-0417c2a85dff', // Eesruum
]);

export class CurrentStatePoller implements ICurrentStatePoller {
  private readonly dbService: IBackendDBService;
  private readonly staleAfterMs: number;
  private readonly logger: Logger;
  private readonly callbacks: Array<(payload: SSEPayload) => void> = [];

  private latestPayload: SSEPayload = {};
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(dbService: IBackendDBService, staleAfterMs: number, logger: Logger) {
    this.dbService = dbService;
    this.staleAfterMs = staleAfterMs;
    this.logger = logger;
  }

  /**
   * Start polling the current_state table at the given interval (ms).
   * Performs an immediate first poll, then continues at the interval.
   */
  start(pollInterval: number): void {
    if (this.pollTimer !== null) {
      this.logger.warn('Poller already running, ignoring start()');
      return;
    }

    this.logger.info({ pollInterval, staleAfterMs: this.staleAfterMs }, 'Starting current_state poller');

    // Immediate first poll
    void this.poll();

    this.pollTimer = setInterval(() => {
      void this.poll();
    }, pollInterval);
  }

  /**
   * Stop polling.
   */
  stop(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
      this.logger.info('Current_state poller stopped');
    }
  }

  /**
   * Returns the latest SSEPayload (may be empty {} if table is empty or never polled).
   */
  getLatest(): SSEPayload {
    return this.latestPayload;
  }

  /**
   * Register a callback to be notified on every poll update.
   */
  onUpdate(cb: (payload: SSEPayload) => void): void {
    this.callbacks.push(cb);
  }

  /**
   * Execute a single poll cycle: read DB, build payload, notify callbacks.
   */
  private async poll(): Promise<void> {
    try {
      const records = await this.dbService.getCurrentState();

      const payload = this.buildPayload(records);
      this.latestPayload = payload;

      // Notify all registered callbacks
      for (const cb of this.callbacks) {
        try {
          cb(payload);
        } catch (err) {
          this.logger.error({ err }, 'Error in poller update callback');
        }
      }
    } catch (err) {
      this.logger.error({ err }, 'Error polling current_state');
      // Keep the last known payload — do not crash
    }
  }

  /**
   * Build an SSEPayload from the DB records.
   * - Heated rooms: include temp, heat, HeatStart, HeatEnd
   * - Non-heated rooms: include temp, heat (always false)
   * - Stale detection: if now - lastUpdated > staleAfterMs → stale: true
   * - Empty table: returns {}
   */
  private buildPayload(records: CurrentStateRecord[]): SSEPayload {
    if (records.length === 0) {
      return {};
    }

    const now = Date.now();
    const payload: SSEPayload = {};

    for (const record of records) {
      const isStale = (now - record.lastUpdated.getTime()) > this.staleAfterMs;
      const isHeated = HEATED_SENSOR_IDS.has(record.sensorId);

      const roomState: RoomState = {
        temp: record.temp,
        heat: record.heat,
      };

      if (isHeated) {
        roomState.HeatStart = record.heatStart ?? 0;
        roomState.HeatEnd = record.heatEnd ?? 0;
      }

      if (isStale) {
        roomState.stale = true;
      }

      payload[record.sensorId] = roomState;
    }

    return payload;
  }
}
