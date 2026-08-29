import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import type { Logger } from 'pino';
import type { ICurrentStatePoller } from '../../src/services/current-state-poller.service.js';
import type { SSEPayload } from '@home-automation/shared-types';
import { SSEService } from '../../src/services/sse.service.js';

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

function createMockPoller(payload: SSEPayload = {}): ICurrentStatePoller {
  return {
    start: vi.fn(),
    stop: vi.fn(),
    getLatest: vi.fn().mockReturnValue(payload),
    onUpdate: vi.fn(),
  };
}

function createMockReply(): FastifyReply {
  return {
    raw: {
      write: vi.fn(),
      end: vi.fn(),
    },
  } as unknown as FastifyReply;
}

describe('SSEService', () => {
  let sseService: SSEService;
  let logger: Logger;
  let poller: ICurrentStatePoller;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = createMockLogger();
    poller = createMockPoller();
    sseService = new SSEService(poller, logger);
  });

  afterEach(() => {
    sseService.stop();
    vi.useRealTimers();
  });

  describe('addClient()', () => {
    it('adds a client to the tracked set', () => {
      const reply = createMockReply();
      sseService.addClient(reply);
      expect(sseService.getClientCount()).toBe(1);
    });

    it('starts broadcast cycle when first client connects (0→1)', () => {
      const reply = createMockReply();
      sseService.addClient(reply);

      // Verify the broadcast cycle is running by advancing time
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).toHaveBeenCalled();
    });

    it('does not restart broadcast cycle when second client connects', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      sseService.addClient(reply1);
      sseService.addClient(reply2);

      expect(sseService.getClientCount()).toBe(2);
      expect(logger.warn).not.toHaveBeenCalledWith('SSE broadcast cycle already running, ignoring start()');
    });
  });

  describe('removeClient()', () => {
    it('removes a client from the tracked set', () => {
      const reply = createMockReply();
      sseService.addClient(reply);
      sseService.removeClient(reply);
      expect(sseService.getClientCount()).toBe(0);
    });

    it('stops broadcast cycle when last client disconnects (1→0)', () => {
      const reply = createMockReply();
      sseService.addClient(reply);
      sseService.removeClient(reply);

      // Reset mock to track calls after removal
      (poller.getLatest as ReturnType<typeof vi.fn>).mockClear();

      // Advance time — broadcast should NOT fire
      vi.advanceTimersByTime(10000);
      expect(poller.getLatest).not.toHaveBeenCalled();
    });

    it('does not stop broadcast cycle when other clients remain', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      sseService.addClient(reply1);
      sseService.addClient(reply2);
      sseService.removeClient(reply1);

      expect(sseService.getClientCount()).toBe(1);

      // Broadcast should still fire
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).toHaveBeenCalled();
    });

    it('handles removing a client that was never added', () => {
      const reply = createMockReply();
      // Should not throw
      sseService.removeClient(reply);
      expect(sseService.getClientCount()).toBe(0);
    });
  });

  describe('broadcast()', () => {
    it('sends SSE-formatted message to all connected clients', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      sseService.addClient(reply1);
      sseService.addClient(reply2);

      const payload: SSEPayload = {
        '28-0517c3a351ff': { temp: 6.5, heat: true, HeatStart: 1700000000000, HeatEnd: 0 },
      };

      sseService.broadcast(payload);

      const expected = `data: ${JSON.stringify(payload)}\n\n`;
      expect(reply1.raw.write).toHaveBeenCalledWith(expected);
      expect(reply2.raw.write).toHaveBeenCalledWith(expected);
    });

    it('does nothing when no clients are connected', () => {
      const payload: SSEPayload = { '28-0517c3a351ff': { temp: 6.5, heat: false } };
      // Should not throw
      sseService.broadcast(payload);
    });

    it('removes clients that fail to write', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      // Make reply1 throw on write
      (reply1.raw.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('broken pipe');
      });

      sseService.addClient(reply1);
      sseService.addClient(reply2);

      sseService.broadcast({ '28-0417c28ee3ff': { temp: -2.1, heat: false } });

      // reply1 should have been removed
      expect(sseService.getClientCount()).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Error writing to SSE client, removing'
      );
    });

    it('broadcasts empty payload correctly', () => {
      const reply = createMockReply();
      sseService.addClient(reply);

      sseService.broadcast({});

      expect(reply.raw.write).toHaveBeenCalledWith('data: {}\n\n');
    });
  });

  describe('getClientCount()', () => {
    it('returns 0 when no clients connected', () => {
      expect(sseService.getClientCount()).toBe(0);
    });

    it('reflects the correct number of connected clients', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();
      const reply3 = createMockReply();

      sseService.addClient(reply1);
      sseService.addClient(reply2);
      sseService.addClient(reply3);

      expect(sseService.getClientCount()).toBe(3);

      sseService.removeClient(reply2);
      expect(sseService.getClientCount()).toBe(2);
    });
  });

  describe('start() / stop()', () => {
    it('broadcasts poller payload at the configured interval', () => {
      const payload: SSEPayload = {
        '28-0517c3a351ff': { temp: 6.5, heat: true, HeatStart: 1700000000000, HeatEnd: 0 },
        '28-0417c28ee3ff': { temp: -2.1, heat: false },
      };
      poller = createMockPoller(payload);
      sseService = new SSEService(poller, logger);

      const reply = createMockReply();
      sseService.addClient(reply);

      // First broadcast at 5s
      vi.advanceTimersByTime(5000);
      expect(reply.raw.write).toHaveBeenCalledTimes(1);
      expect(reply.raw.write).toHaveBeenCalledWith(`data: ${JSON.stringify(payload)}\n\n`);

      // Second broadcast at 10s
      vi.advanceTimersByTime(5000);
      expect(reply.raw.write).toHaveBeenCalledTimes(2);
    });

    it('uses custom interval when specified', () => {
      const reply = createMockReply();
      poller = createMockPoller({ '28-0417c28ee3ff': { temp: 10.0, heat: false } });
      sseService = new SSEService(poller, logger);

      // Manually start with custom interval (addClient would use default)
      sseService.start(3000);
      sseService.addClient(reply);

      vi.advanceTimersByTime(3000);
      expect(reply.raw.write).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(3000);
      expect(reply.raw.write).toHaveBeenCalledTimes(2);
    });

    it('ignores duplicate start() calls', () => {
      sseService.start(5000);
      sseService.start(5000);

      expect(logger.warn).toHaveBeenCalledWith('SSE broadcast cycle already running, ignoring start()');
    });

    it('stop() clears the broadcast interval', () => {
      const reply = createMockReply();
      sseService.addClient(reply);

      // Clear any writes from broadcast cycle setup
      (reply.raw.write as ReturnType<typeof vi.fn>).mockClear();
      (poller.getLatest as ReturnType<typeof vi.fn>).mockClear();

      sseService.stop();

      vi.advanceTimersByTime(10000);
      expect(poller.getLatest).not.toHaveBeenCalled();
    });

    it('stop() closes all client connections', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      sseService.addClient(reply1);
      sseService.addClient(reply2);
      sseService.stop();

      expect(reply1.raw.end).toHaveBeenCalled();
      expect(reply2.raw.end).toHaveBeenCalled();
      expect(sseService.getClientCount()).toBe(0);
    });

    it('stop() handles already-closed clients gracefully', () => {
      const reply = createMockReply();
      (reply.raw.end as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('already closed');
      });

      sseService.addClient(reply);
      // Should not throw
      sseService.stop();

      expect(sseService.getClientCount()).toBe(0);
    });

    it('stop() is safe to call when not running', () => {
      // Should not throw
      sseService.stop();
      expect(sseService.getClientCount()).toBe(0);
    });
  });

  describe('lifecycle integration (Nõue 3.5, 3.6)', () => {
    it('starts and stops broadcast cycle as clients connect/disconnect', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      // No clients — no broadcasting
      (poller.getLatest as ReturnType<typeof vi.fn>).mockClear();
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).not.toHaveBeenCalled();

      // First client connects — cycle starts
      sseService.addClient(reply1);
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).toHaveBeenCalledTimes(1);

      // Second client connects — cycle keeps running (not restarted)
      sseService.addClient(reply2);
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).toHaveBeenCalledTimes(2);

      // First client disconnects — cycle still running (1 client remains)
      sseService.removeClient(reply1);
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).toHaveBeenCalledTimes(3);

      // Last client disconnects — cycle stops
      sseService.removeClient(reply2);
      (poller.getLatest as ReturnType<typeof vi.fn>).mockClear();
      vi.advanceTimersByTime(10000);
      expect(poller.getLatest).not.toHaveBeenCalled();
    });

    it('restarts broadcast cycle when new client connects after all disconnected', () => {
      const reply1 = createMockReply();
      const reply2 = createMockReply();

      // Connect and disconnect first client
      sseService.addClient(reply1);
      sseService.removeClient(reply1);

      // Broadcast should be stopped
      (poller.getLatest as ReturnType<typeof vi.fn>).mockClear();
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).not.toHaveBeenCalled();

      // New client connects — cycle restarts
      sseService.addClient(reply2);
      vi.advanceTimersByTime(5000);
      expect(poller.getLatest).toHaveBeenCalledTimes(1);
    });
  });
});
