/**
 * Memory monitor service for the API-server backend.
 * Periodically checks process heap usage and triggers graceful shutdown
 * if memory exceeds the configured limit (default 512 MB).
 *
 * Same pattern as hardware-agent's memory.service.ts, adapted threshold.
 *
 * Requirements: 16.2, 16.4
 */

import type { Logger } from 'pino';

export interface IMemoryMonitor {
  start(checkInterval: number): void;
  stop(): void;
  getCurrentUsage(): number;
}

export interface MemoryMonitorOptions {
  memoryLimitMb: number;
  logger: Logger;
  onExceeded?: () => void;
}

export class MemoryMonitor implements IMemoryMonitor {
  private readonly memoryLimitBytes: number;
  private readonly logger: Logger;
  private readonly onExceeded?: () => void;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(options: MemoryMonitorOptions) {
    this.memoryLimitBytes = options.memoryLimitMb * 1024 * 1024;
    this.logger = options.logger;
    this.onExceeded = options.onExceeded;
  }

  /**
   * Start periodic memory usage checks at the given interval (ms).
   */
  start(checkInterval: number): void {
    if (this.intervalHandle) {
      this.logger.warn('MemoryMonitor already started, ignoring duplicate start()');
      return;
    }

    this.logger.info(
      { checkInterval, limitMb: this.memoryLimitBytes / 1024 / 1024 },
      'MemoryMonitor started'
    );

    this.intervalHandle = setInterval(() => {
      this.check();
    }, checkInterval);
  }

  /**
   * Stop periodic memory checks.
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.info('MemoryMonitor stopped');
    }
  }

  /**
   * Returns current heap usage in bytes.
   */
  getCurrentUsage(): number {
    return process.memoryUsage().heapUsed;
  }

  // --- Private methods ---

  private check(): void {
    const heapUsed = this.getCurrentUsage();
    const heapUsedMb = heapUsed / 1024 / 1024;

    if (heapUsed > this.memoryLimitBytes) {
      this.logger.warn(
        { heapUsedMb: Math.round(heapUsedMb * 10) / 10, limitMb: this.memoryLimitBytes / 1024 / 1024 },
        'Memory limit exceeded — triggering graceful shutdown'
      );

      if (this.onExceeded) {
        this.onExceeded();
      } else {
        // Default: send SIGTERM to self for graceful shutdown via systemd restart
        process.kill(process.pid, 'SIGTERM');
      }
    }
  }
}
