// Shared types for home-automation-api (backend + frontend)
// Canonical source — hardware-agent maintains a local copy in src/types.ts

export interface SensorConfig {
  id: string;
  name: string;
  gpioPin?: number;
  hasHeating: boolean;
  /** 'onewire' (default) = read locally on the hardware-agent host; 'remote' = pushed via HTTP ingest (e.g. ESP32) */
  source?: 'onewire' | 'remote';
  /** true if this sensor also reports relative humidity (e.g. DHT22) */
  hasHumidity?: boolean;
}

export interface SensorReading {
  sensorId: string;
  temperature: number;
  humidity?: number;
  timestamp: number;
}

export interface RoomState {
  temp: number;
  humidity?: number;
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
  Temp_kasvuhoone: number | null;
  Niiskus_kasvuhoone: number | null;
  Temp_elutuba: number | null;
  Niiskus_elutuba: number | null;
  TimeStamp: Date;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface CurrentStateRecord {
  sensorId: string;
  temp: number;
  humidity: number | null;
  heat: boolean;
  heatStart: number | null;
  heatEnd: number | null;
  lastUpdated: Date;
}
