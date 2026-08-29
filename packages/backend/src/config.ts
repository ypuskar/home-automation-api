/**
 * Configuration loader for the API-server backend.
 * Loads all settings from environment variables with sensible defaults.
 * Validates that required config is present at startup.
 *
 * Requirements: 14.1, 14.2, 14.3, 14.6
 */

export interface BackendConfig {
  port: number;
  nodeEnv: 'production' | 'debug';
  database: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    maxConnections: number;
  };
  tls: {
    keyPath: string;
    certPath: string;
  };
  intervals: {
    currentStatePoll: number;  // 2000ms — see Nõue 3.7
    sseBroadcast: number;      // 5000ms
  };
  staleAfterMs: number;       // default 15000 — see Nõue 3.8
  memoryLimitMb: number;      // default 512 — see Nõue 16.4
}

/** Required environment variables that must be present for DB connection */
const REQUIRED_ENV_VARS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
] as const;

/**
 * Validates that all required environment variables are present.
 * Throws with a clear error listing all missing vars.
 */
function validateRequiredEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Ensure these are set in .env or the process environment.`
    );
  }
}

/**
 * Parses a numeric env var, returning the default if not set or invalid.
 */
function parseIntEnv(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

/**
 * Loads and validates the backend configuration from environment variables.
 * Call this once at startup — throws if required config is missing.
 */
export function loadConfig(): BackendConfig {
  validateRequiredEnv();

  const nodeEnv = process.env.NODE_ENV === 'debug' ? 'debug' : 'production';

  // Port: 4001 in dev/debug, 4000 in production (matches systemd Environment=PORT=4000)
  const defaultPort = nodeEnv === 'debug' ? 4001 : 4000;

  const config: BackendConfig = {
    port: parseIntEnv('PORT', defaultPort),
    nodeEnv,
    database: {
      host: process.env.DB_HOST!,
      port: parseIntEnv('DB_PORT', 5432),
      database: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      maxConnections: parseIntEnv('DB_MAX_CONNECTIONS', 10),
    },
    tls: {
      keyPath: process.env.TLS_KEY_PATH || '/etc/letsencrypt/live/kilde27.hopto.org/privkey.pem',
      certPath: process.env.TLS_CERT_PATH || '/etc/letsencrypt/live/kilde27.hopto.org/fullchain.pem',
    },
    intervals: {
      currentStatePoll: parseIntEnv('CURRENT_STATE_POLL_INTERVAL', 2000),
      sseBroadcast: parseIntEnv('SSE_BROADCAST_INTERVAL', 5000),
    },
    staleAfterMs: parseIntEnv('STALE_AFTER_MS', 15000),
    memoryLimitMb: parseIntEnv('MEMORY_LIMIT_MB', 512),
  };

  return config;
}
