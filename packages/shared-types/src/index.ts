// Shared types for home-automation-api (backend + frontend)
// Canonical source — hardware-agent maintains a local copy in src/types.ts

export interface SensorConfig {
  id: string;
  name: string;
  gpioPin?: number;
  hasHeating: boolean;
}

export interface SensorReading {
  sensorId: string;
  temperature: number;
  timestamp: number;
}

export interface RoomState {
  temp: number;
  heat: boolean;
  HeatStart?: number;
  HeatEnd?: number;
  stale?: boolean;
}

export interface SSEPayload {
  [sensorId: string]: RoomState;
}

export interface HeatingState {
  isOn: boolean;
  startTime: number;
  endTime: number;
}

export interface HeatPeriodRecord {
  room: string;
  period: number;
  start: number;
  end: number;
}

export interface HistoryRecord {
  Temp_garaaz: number;
  Kyte_garaaz: boolean;
  Temp_Leiliruum: number;
  Temp_Eesruum: number;
  Kyte_eesruum: boolean;
  Temp_valjas: number;
  TimeStamp: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface CurrentStateRecord {
  sensorId: string;
  temp: number;
  heat: boolean;
  heatStart: number | null;
  heatEnd: number | null;
  lastUpdated: Date;
}
