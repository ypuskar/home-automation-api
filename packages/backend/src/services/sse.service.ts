/**
 * SSE broadcaster service for the API-server backend.
 * Manages connected SSE clients and broadcasts current state from the poller
 * at a configurable interval (default 5s).
 *
 * - Starts broadcast cycle when first client connects (0→1)
 * - Stops broadcast cycle when last client disconnects (1→0)
 * - Uses the poller's getLatest() to source data (does not maintain own state)
 *
 * Requirements: 3.2, 3.5, 3.6
 */

import type { FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import type { ICurrentStatePoller } from './current-state-poller.service.js';
import type { SSEPayload } from '@home-automation/shared-types';

export interface ISSEService {
  addClient(reply: FastifyReply): void;
  removeClient(reply: FastifyReply): void;
  broadcast(payload: SSEPayload): void;
  getClientCount(): number;
  start(interval: number): void;
  stop(): void;
}

export class SSEService implements ISSEService {
  private readonly clients: Set<FastifyReply> = new Set();
  private readonly poller: ICurrentStatePoller;
  private readonly logger: Logger;

  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private broadcastInterval: number = 5000;

  constructor(poller: ICurrentStatePoller, logger: Logger) {
    this.poller = poller;
    this.logger = logger;
  }

  /**
   * Add a new SSE client. If this is the first client (0→1),
   * starts the broadcast cycle.
   */
  addClient(reply: FastifyReply): void {
    this.clients.add(reply);
    this.logger.info({ clientCount: this.clients.size }, 'SSE client connected');

    // Start broadcast cycle when first client connects
    if (this.clients.size === 1) {
      this.start(this.broadcastInterval);
    }
  }

  /**
   * Remove an SSE client. If this was the last client (1→0),
   * stops the broadcast cycle.
   */
  removeClient(reply: FastifyReply): void {
    this.clients.delete(reply);
    this.logger.info({ clientCount: this.clients.size }, 'SSE client disconnected');

    // Stop broadcast cycle when last client disconnects
    if (this.clients.size === 0) {
      this.stop();
    }
  }

  /**
   * Broadcast an SSEPayload to all connected clients.
   * Uses the standard SSE format: `data: <json>\n\n`
   * Removes clients that fail to write (broken connections).
   */
  broadcast(payload: SSEPayload): void {
    if (this.clients.size === 0) return;

    const message = `data: ${JSON.stringify(payload)}\n\n`;

    for (const client of this.clients) {
      try {
        client.raw.write(message);
      } catch (err) {
        this.logger.error({ err }, 'Error writing to SSE client, removing');
        this.clients.delete(client);
      }
    }
  }

  /**
   * Returns the number of currently connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Start the broadcast cycle at the given interval (ms).
   * Each tick fetches the latest payload from the poller and broadcasts it.
   */
  start(interval: number): void {
    if (this.broadcastTimer !== null) {
      this.logger.warn('SSE broadcast cycle already running, ignoring start()');
      return;
    }

    this.broadcastInterval = interval;
    this.logger.info({ interval }, 'Starting SSE broadcast cycle');

    this.broadcastTimer = setInterval(() => {
      const payload = this.poller.getLatest();
      this.broadcast(payload);
    }, interval);
  }

  /**
   * Stop the broadcast cycle and close all client connections.
   */
  stop(): void {
    if (this.broadcastTimer !== null) {
      clearInterval(this.broadcastTimer);
      this.broadcastTimer = null;
      this.logger.info('SSE broadcast cycle stopped');
    }

    // Close all remaining client connections
    for (const client of this.clients) {
      try {
        client.raw.end();
      } catch {
        // Client may already be closed — ignore
      }
    }
    this.clients.clear();
  }
}
