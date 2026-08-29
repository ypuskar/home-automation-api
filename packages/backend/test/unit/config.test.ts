import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('config.ts - loadConfig()', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    // Reset env to a clean state with required vars
    process.env = {
      ...ORIGINAL_ENV,
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'pi',
      DB_USER: 'user',
      DB_PASSWORD: 'secret',
    };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('required environment variables', () => {
    it('throws when DB_HOST is missing', () => {
      delete process.env.DB_HOST;
      expect(() => loadConfig()).toThrow('Missing required environment variables: DB_HOST');
    });

    it('throws when DB_PASSWORD is missing', () => {
      delete process.env.DB_PASSWORD;
      expect(() => loadConfig()).toThrow('Missing required environment variables: DB_PASSWORD');
    });

    it('throws listing all missing vars when multiple are absent', () => {
      delete process.env.DB_HOST;
      delete process.env.DB_USER;
      delete process.env.DB_PASSWORD;
      expect(() => loadConfig()).toThrow('DB_HOST, DB_USER, DB_PASSWORD');
    });

    it('loads successfully when all required vars are present', () => {
      expect(() => loadConfig()).not.toThrow();
    });
  });

  describe('port configuration', () => {
    it('defaults to 4000 in production', () => {
      process.env.NODE_ENV = 'production';
      const config = loadConfig();
      expect(config.port).toBe(4000);
    });

    it('defaults to 4001 in debug mode', () => {
      process.env.NODE_ENV = 'debug';
      const config = loadConfig();
      expect(config.port).toBe(4001);
    });

    it('uses PORT env var when set (overrides default)', () => {
      process.env.NODE_ENV = 'debug';
      process.env.PORT = '3000';
      const config = loadConfig();
      expect(config.port).toBe(3000);
    });
  });

  describe('nodeEnv', () => {
    it('defaults to production when NODE_ENV is not set', () => {
      delete process.env.NODE_ENV;
      const config = loadConfig();
      expect(config.nodeEnv).toBe('production');
    });

    it('returns debug when NODE_ENV=debug', () => {
      process.env.NODE_ENV = 'debug';
      const config = loadConfig();
      expect(config.nodeEnv).toBe('debug');
    });

    it('treats any value other than debug as production', () => {
      process.env.NODE_ENV = 'development';
      const config = loadConfig();
      expect(config.nodeEnv).toBe('production');
    });
  });

  describe('database configuration', () => {
    it('reads DB connection params from env', () => {
      const config = loadConfig();
      expect(config.database).toEqual({
        host: 'localhost',
        port: 5432,
        database: 'pi',
        user: 'user',
        password: 'secret',
        maxConnections: 10,
      });
    });

    it('uses custom DB_MAX_CONNECTIONS when set', () => {
      process.env.DB_MAX_CONNECTIONS = '20';
      const config = loadConfig();
      expect(config.database.maxConnections).toBe(20);
    });

    it('defaults maxConnections to 10 when not set', () => {
      const config = loadConfig();
      expect(config.database.maxConnections).toBe(10);
    });
  });

  describe('TLS configuration', () => {
    it('defaults keyPath to Let\'s Encrypt path', () => {
      const config = loadConfig();
      expect(config.tls.keyPath).toBe('/etc/letsencrypt/live/kilde27.hopto.org/privkey.pem');
    });

    it('defaults certPath to Let\'s Encrypt path', () => {
      const config = loadConfig();
      expect(config.tls.certPath).toBe('/etc/letsencrypt/live/kilde27.hopto.org/fullchain.pem');
    });

    it('reads custom TLS paths from env', () => {
      process.env.TLS_KEY_PATH = '/custom/key.pem';
      process.env.TLS_CERT_PATH = '/custom/cert.pem';
      const config = loadConfig();
      expect(config.tls.keyPath).toBe('/custom/key.pem');
      expect(config.tls.certPath).toBe('/custom/cert.pem');
    });
  });

  describe('intervals', () => {
    it('defaults currentStatePoll to 2000ms', () => {
      const config = loadConfig();
      expect(config.intervals.currentStatePoll).toBe(2000);
    });

    it('defaults sseBroadcast to 5000ms', () => {
      const config = loadConfig();
      expect(config.intervals.sseBroadcast).toBe(5000);
    });

    it('reads custom intervals from env', () => {
      process.env.CURRENT_STATE_POLL_INTERVAL = '1000';
      process.env.SSE_BROADCAST_INTERVAL = '3000';
      const config = loadConfig();
      expect(config.intervals.currentStatePoll).toBe(1000);
      expect(config.intervals.sseBroadcast).toBe(3000);
    });
  });

  describe('staleAfterMs', () => {
    it('defaults to 15000ms', () => {
      const config = loadConfig();
      expect(config.staleAfterMs).toBe(15000);
    });

    it('reads custom value from env', () => {
      process.env.STALE_AFTER_MS = '30000';
      const config = loadConfig();
      expect(config.staleAfterMs).toBe(30000);
    });
  });

  describe('memoryLimitMb', () => {
    it('defaults to 512 MB', () => {
      const config = loadConfig();
      expect(config.memoryLimitMb).toBe(512);
    });

    it('reads custom limit from env', () => {
      process.env.MEMORY_LIMIT_MB = '1024';
      const config = loadConfig();
      expect(config.memoryLimitMb).toBe(1024);
    });
  });

  describe('invalid numeric values', () => {
    it('falls back to defaults when env vars are not numbers', () => {
      process.env.DB_PORT = 'abc';
      process.env.PORT = 'xyz';
      process.env.MEMORY_LIMIT_MB = '';
      process.env.STALE_AFTER_MS = 'nope';
      const config = loadConfig();
      expect(config.database.port).toBe(5432);
      expect(config.port).toBe(4000); // production default
      expect(config.memoryLimitMb).toBe(512);
      expect(config.staleAfterMs).toBe(15000);
    });
  });
});
