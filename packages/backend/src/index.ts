/**
 * Entry point for the home-automation API-server backend.
 *
 * Initialization order:
 * 1. Load config
 * 2. Create and connect DB service
 * 3. Create and start current_state poller
 * 4. Create SSE service (takes poller)
 * 5. Create and start memory monitor (512 MB threshold)
 * 6. Build Fastify server (HTTPS, routes, static)
 * 7. Listen on configured port
 *
 * Graceful shutdown on SIGTERM/SIGINT:
 * - Stop memory monitor
 * - Stop poller
 * - Stop SSE service (closes all client connections)
 * - Disconnect DB pool
 * - Close Fastify server
 *
 * Requirements: 15.2, 16.1
 */

import { loadConfig } from './config.js';
import { BackendDBService } from './services/db.service.js';
import { CurrentStatePoller } from './services/current-state-poller.service.js';
import { SSEService } from './services/sse.service.js';
import { MemoryMonitor } from './services/memory.service.js';
import { buildServer } from './server.js';
import { pino } from 'pino';

async function main(): Promise<void> {
  // 1. Load configuration
  const config = loadConfig();

  // 2. Create logger (standalone pino for startup, Fastify will use its own)
  const logger = pino({ level: config.nodeEnv === 'debug' ? 'debug' : 'info' });
  logger.info({ nodeEnv: config.nodeEnv, port: config.port }, 'Starting API-server');

  // 3. Create and connect DB service
  const dbService = new BackendDBService(config.database, logger);
  await dbService.connect();

  // 4. Create and start current_state poller
  const poller = new CurrentStatePoller(dbService, config.staleAfterMs, logger);
  poller.start(config.intervals.currentStatePoll);

  // 5. Create SSE service (uses poller for data)
  const sseService = new SSEService(poller, logger);

  // 6. Create and start memory monitor
  const memoryMonitor = new MemoryMonitor({
    memoryLimitMb: config.memoryLimitMb,
    logger,
  });
  memoryMonitor.start(30_000); // Check every 30s

  // 7. Build Fastify server
  const fastify = await buildServer({ config, sseService, poller, dbService });

  // 8. Listen on configured port
  try {
    await fastify.listen({ port: config.port, host: '0.0.0.0' });
    logger.info({ port: config.port }, 'API-server listening');
  } catch (err) {
    logger.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }

  // 9. Graceful shutdown handler
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info({ signal }, 'Graceful shutdown initiated');

    // Stop memory monitor
    memoryMonitor.stop();

    // Stop poller (stops DB polling)
    poller.stop();

    // Stop SSE service (closes all client connections)
    sseService.stop();

    // Disconnect DB pool
    await dbService.disconnect();

    // Close Fastify server
    await fastify.close();

    logger.info('Shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Fatal error during startup:', err);
  process.exit(1);
});
