-- Migration: Add humidity column to current_state
-- Supports remote sensors that report relative humidity (e.g. ESP32 + DHT22
-- in the greenhouse), in addition to temperature. NULL for sensors that
-- don't report humidity (e.g. DS18B20).

ALTER TABLE public.current_state ADD COLUMN IF NOT EXISTS humidity real;
