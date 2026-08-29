/**
 * PostgreSQL database service for the API-server backend.
 * Handles all DB read operations: temperature history, heat periods,
 * and current_state polling.
 *
 * Implements exponential backoff on connection loss — the service will NOT crash
 * the process on DB errors.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 17.3, 17.5
 */

import { Pool, type PoolConfig } from 'pg';
import type { Logger } from 'pino';
import type { BackendConfig } from '../config.js';
import type { PaginationParams, HistoryRecord, HeatPeriodRecord, CurrentStateRecord } from '@home-automation/shared-types';

export interface IBackendDBService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getTemperatureHistory(params: PaginationParams): Promise<HistoryRecord[]>;
  getHeatPeriods(params: PaginationParams): Promise<HeatPeriodRecord[]>;
  getCurrentState(): Promise<CurrentStateRecord[]>;
}

/** Max backoff delay in ms for reconnection attempts */
const MAX_BACKOFF_MS = 30_000;
/** Base backoff delay in ms */
const BASE_BACKOFF_MS = 1_000;

export class BackendDBService implements IBackendDBService {
  private pool: Pool | null = null;
  private readonly config: BackendConfig['database'];
  private readonly logger: Logger;
  private connected = false;
  private reconnecting = false;
  private reconnectAttempt = 0;

  constructor(config: BackendConfig['database'], logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Create and connect the connection pool.
   * Uses exponential backoff if initial connection fails.
   */
  async connect(): Promise<void> {
    await this.createPool();
  }

  /**
   * Gracefully close the connection pool.
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        this.logger.info('Database pool closed');
      } catch (err) {
        this.logger.error({ err }, 'Error closing database pool');
      }
      this.pool = null;
      this.connected = false;
    }
  }

  /**
   * Query temperature history with day-range pagination.
   * Pagination: start = page × limit days ago, end = (page × limit + limit) days ago.
   * So page=0, limit=7 returns last 7 days; page=1, limit=7 returns 7–14 days ago.
   *
   * Requirements: 6.1, 6.3, 6.6
   */
  async getTemperatureHistory(params: PaginationParams): Promise<HistoryRecord[]> {
    if (!this.isReady()) {
      this.logger.warn('getTemperatureHistory skipped — DB not connected');
      return [];
    }

    const startDays = params.page * params.limit;
    const endDays = params.page * params.limit + params.limit;

    const query = `
      SELECT * FROM "History"
      WHERE "TimeStamp" BETWEEN NOW() - ($2 || ' days')::interval
                            AND NOW() - ($1 || ' days')::interval
      ORDER BY "TimeStamp" DESC
    `;

    try {
      const result = await this.pool!.query(query, [String(startDays), String(endDays)]);
      return result.rows as HistoryRecord[];
    } catch (err) {
      this.logger.error({ err }, 'Failed to query temperature history');
      this.handleConnectionError(err);
      return [];
    }
  }

  /**
   * Query heat periods with day-range pagination.
   * Same pagination logic as getTemperatureHistory.
   *
   * Requirements: 6.2, 6.3, 6.6
   */
  async getHeatPeriods(params: PaginationParams): Promise<HeatPeriodRecord[]> {
    if (!this.isReady()) {
      this.logger.warn('getHeatPeriods skipped — DB not connected');
      return [];
    }

    const startDays = params.page * params.limit;
    const endDays = params.page * params.limit + params.limit;

    const query = `
      SELECT * FROM "Heatperiod"
      WHERE "TimeStamp" BETWEEN NOW() - ($2 || ' days')::interval
                            AND NOW() - ($1 || ' days')::interval
      ORDER BY "TimeStamp" DESC
    `;

    try {
      const result = await this.pool!.query(query, [String(startDays), String(endDays)]);
      return result.rows.map((row: any) => ({
        room: row.Room,
        period: row.Period,
        start: Number(row.Start),
        end: Number(row.End),
      }));
    } catch (err) {
      this.logger.error({ err }, 'Failed to query heat periods');
      this.handleConnectionError(err);
      return [];
    }
  }

  /**
   * Poll current_state table — returns all sensor rows.
   * Used by the current_state poller service every 2s.
   *
   * Requirements: 17.5 (localhost connection)
   */
  async getCurrentState(): Promise<CurrentStateRecord[]> {
    if (!this.isReady()) {
      this.logger.warn('getCurrentState skipped — DB not connected');
      return [];
    }

    const query = `
      SELECT sensor_id, temp, heat, heat_start, heat_end, last_updated
      FROM current_state
    `;

    try {
      const result = await this.pool!.query(query);
      return result.rows.map((row: any) => ({
        sensorId: row.sensor_id,
        temp: row.temp,
        heat: row.heat,
        heatStart: row.heat_start !== null ? Number(row.heat_start) : null,
        heatEnd: row.heat_end !== null ? Number(row.heat_end) : null,
        lastUpdated: new Date(row.last_updated),
      }));
    } catch (err) {
      this.logger.error({ err }, 'Failed to query current_state');
      this.handleConnectionError(err);
      return [];
    }
  }

  // --- Private methods ---

  /**
   * Check if the pool exists and is connected.
   */
  private isReady(): boolean {
    return this.pool !== null && this.connected;
  }

  /**
   * Create the pg Pool and verify connectivity.
   * On failure, schedules reconnection with exponential backoff.
   */
  private async createPool(): Promise<void> {
    const poolConfig: PoolConfig = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      max: this.config.maxConnections,
      // Connection timeout 10s — fail fast, let backoff retry
      connectionTimeoutMillis: 10_000,
      // Idle timeout 30s
      idleTimeoutMillis: 30_000,
    };

    try {
      this.pool = new Pool(poolConfig);

      // Attach error handler to prevent unhandled errors crashing the process
      this.pool.on('error', (err) => {
        this.logger.error({ err }, 'Unexpected pool error');
        this.handleConnectionError(err);
      });

      // Verify connectivity with a test query
      const client = await this.pool.connect();
      client.release();

      this.connected = true;
      this.reconnectAttempt = 0;
      this.logger.info(
        { host: this.config.host, port: this.config.port, database: this.config.database },
        'Database connected'
      );
    } catch (err) {
      this.logger.error({ err }, 'Failed to connect to database');
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Handle a connection-level error: mark as disconnected, schedule reconnect.
   */
  private handleConnectionError(err: unknown): void {
    if (this.isConnectionError(err)) {
      this.connected = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Determine if an error is a connection-level issue that warrants reconnection.
   */
  private isConnectionError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const code = (err as any).code;
    const connectionCodes = [
      'ECONNREFUSED',
      'ECONNRESET',
      'EPIPE',
      'ENOTFOUND',
      'ETIMEDOUT',
      'CONNECTION_LOST',
      '57P01', // admin_shutdown
      '57P02', // crash_shutdown
      '57P03', // cannot_connect_now
      '08000', // connection_exception
      '08001', // sqlclient_unable_to_establish_sqlconnection
      '08003', // connection_does_not_exist
      '08006', // connection_failure
    ];
    return connectionCodes.includes(code);
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Delay: min(BASE * 2^attempt, MAX_BACKOFF).
   */
  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    const delay = Math.min(
      BASE_BACKOFF_MS * Math.pow(2, this.reconnectAttempt),
      MAX_BACKOFF_MS
    );
    this.reconnectAttempt++;

    this.logger.info(
      { delay, attempt: this.reconnectAttempt },
      'Scheduling database reconnection'
    );

    setTimeout(async () => {
      this.reconnecting = false;
      // Clean up old pool if it exists
      if (this.pool) {
        try {
          await this.pool.end();
        } catch {
          // Ignore errors on cleanup
        }
        this.pool = null;
      }
      await this.createPool();
    }, delay);
  }
}
