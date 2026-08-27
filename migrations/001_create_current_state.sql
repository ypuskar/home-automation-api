-- Migration: Create current_state table
-- This table is used for communication between hardware-agent and API-server.
-- Hardware-agent UPSERTs one row per sensor every 5s.
-- API-server polls this table every 2s to build SSE payloads.
--
-- IMPORTANT: This migration does NOT alter existing "History" or "Heatperiod" tables.

CREATE TABLE IF NOT EXISTS public.current_state (
  sensor_id     varchar(20) PRIMARY KEY,
  temp          real,
  heat          boolean NOT NULL DEFAULT false,
  heat_start    bigint,
  heat_end      bigint,
  last_updated  timestamptz NOT NULL DEFAULT now()
);

-- Verify existing tables are untouched (informational, no-op if they exist)
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'History');
-- SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'Heatperiod');
