-- Migration: Add Elutuba (living room) columns to "History"
-- Supports the second remote sensor (ESP32 + DHT22 in the living room),
-- pushed via hardware-agent's ingest endpoint (sensor id 'dht22-elutuba'),
-- alongside the existing Kasvuhoone columns. NULL when not reported (same
-- pattern as Temp_kasvuhoone/Niiskus_kasvuhoone).
--
-- NOTE: already applied directly against the production DB on 2026-09-16
-- while debugging the Elutuba ingest 404s — this file documents/replays
-- that change (IF NOT EXISTS makes it a safe no-op if run again).

ALTER TABLE public."History" ADD COLUMN IF NOT EXISTS "Temp_elutuba" real;
ALTER TABLE public."History" ADD COLUMN IF NOT EXISTS "Niiskus_elutuba" real;
