import { useState, useEffect, useMemo } from 'react';
import { Box, Button, Typography, CircularProgress } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useApi } from '../hooks/useApi';
import { ROOM_NAMES } from './Dashboard';
import type { HistoryRecord } from '@home-automation/shared-types';

/** Chart line colors per sensor/room */
const LINE_COLORS: Record<string, string> = {
  Temp_garaaz: '#64b5f6',      // Garaaž — light blue
  Temp_Eesruum: '#1565c0',     // Eesruum — dark blue
  Temp_valjas: '#d4a76a',      // Õues — sand
  Temp_Leiliruum: '#00838f',   // Leiliruum — dark cyan
  Temp_kasvuhoone: '#2e7d32',  // Magamistuba (kasvuhoone DHT22) — green
  Temp_elutuba: '#ef6c00',     // Elutuba — orange
};

/** Map HistoryRecord temp field names → sensor IDs for legend toggle */
const FIELD_TO_SENSOR: Record<string, string> = {
  Temp_garaaz: '28-0517c3a351ff',
  Temp_Eesruum: '28-0417c2a85dff',
  Temp_valjas: '28-0417c28ee3ff',
  Temp_Leiliruum: '28-0417c2da95ff',
  Temp_kasvuhoone: 'dht22-kasvuhoone',
  Temp_elutuba: 'dht22-elutuba',
};

/** Temp field keys from HistoryRecord */
const TEMP_FIELDS = ['Temp_garaaz', 'Temp_Eesruum', 'Temp_valjas', 'Temp_Leiliruum', 'Temp_kasvuhoone', 'Temp_elutuba'] as const;

/** Get display name for a temp field */
function fieldDisplayName(field: string): string {
  const sensorId = FIELD_TO_SENSOR[field];
  return sensorId ? (ROOM_NAMES[sensorId] ?? field) : field;
}

/** Format a Date/string timestamp in Estonian locale (dd.MM HH:mm) */
function formatTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString('et-EE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ~1 rendered point per this many px of width — keeps the line legible without oversampling. */
const PX_PER_POINT = 12;
/** Reference density (points/day) — matches the original fixed desktop default (100 points / 10 days). */
const POINTS_PER_DAY = 10;
const MIN_POINTS = 15;
/** Caps around MUI Container maxWidth="lg"'s effective content width — window.innerWidth keeps
 *  growing past that on wide monitors, but the chart's actual rendered width does not. */
const MAX_POINTS = 100;

/**
 * Determine the responsive chart window from viewport width: how many days
 * of history to request from the API, and how many points to sample for
 * display. pointLimit scales continuously with width (not a two-bucket
 * switch), and dayLimit is derived to keep points-per-day roughly constant
 * across all widths — a narrow screen shows a shorter, equally-dense recent
 * window instead of the same wide span squeezed into far fewer points
 * (which buried the most recent, densely-sampled readings under a handful
 * of samples spread mostly across older, sparser history).
 */
function useChartWindow(): { dayLimit: number; pointLimit: number } {
  const compute = () => {
    const pointLimit = Math.min(
      MAX_POINTS,
      Math.max(MIN_POINTS, Math.round(window.innerWidth / PX_PER_POINT)),
    );
    const dayLimit = Math.max(1, Math.round(pointLimit / POINTS_PER_DAY));
    return { dayLimit, pointLimit };
  };
  const [chartWindow, setChartWindow] = useState(compute);

  useEffect(() => {
    const handleResize = () => setChartWindow(compute());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return chartWindow;
}

interface TemperatureChartProps {
  hiddenRooms: Set<string>;
}

/**
 * Recharts LineChart displaying temperature history for 4 rooms.
 * Supports pagination, responsive data point limits, and legend toggle.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7
 */
export function TemperatureChart({ hiddenRooms }: TemperatureChartProps) {
  const [page, setPage] = useState(0);
  const { dayLimit, pointLimit } = useChartWindow();

  // Reset to page 0 when the day-range changes (e.g. resize) — page N means
  // a different date range under a different dayLimit, so keeping it would
  // silently jump the visible window.
  useEffect(() => {
    setPage(0);
  }, [dayLimit]);

  const { data, loading, error } = useApi<HistoryRecord[]>('/api/temps', {
    page,
    limit: dayLimit,
  });

  // Downsample data to pointLimit, sorted chronologically (oldest first for chart)
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    // API returns newest first — reverse for chronological chart display
    const sorted = [...data].sort(
      (a, b) => new Date(a.TimeStamp).getTime() - new Date(b.TimeStamp).getTime(),
    );

    if (sorted.length <= pointLimit) return sorted;

    // Evenly sample pointLimit data points
    const step = (sorted.length - 1) / (pointLimit - 1);
    const sampled: HistoryRecord[] = [];
    for (let i = 0; i < pointLimit; i++) {
      sampled.push(sorted[Math.round(i * step)]);
    }
    return sampled;
  }, [data, pointLimit]);

  return (
    <Box>
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {error && (
        <Typography color="error" sx={{ py: 2 }}>
          Viga andmete laadimisel: {error.message}
        </Typography>
      )}

      {!loading && !error && chartData.length === 0 && (
        <Typography color="text.secondary" sx={{ py: 2 }}>
          Andmeid ei leitud selle perioodi kohta.
        </Typography>
      )}

      {!loading && chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="TimeStamp"
              tickFormatter={formatTimestamp}
              tick={{ fontSize: 12 }}
            />
            <YAxis
              unit=" °C"
              tick={{ fontSize: 12 }}
            />
            <Tooltip
              labelFormatter={formatTimestamp}
              formatter={(value: number, name: string) => [
                `${value.toFixed(1)} °C`,
                fieldDisplayName(name),
              ]}
            />
            {TEMP_FIELDS.map((field) => {
              const sensorId = FIELD_TO_SENSOR[field];
              const isHidden = hiddenRooms.has(sensorId);
              return (
                <Line
                  key={field}
                  type="monotone"
                  dataKey={field}
                  name={field}
                  stroke={LINE_COLORS[field]}
                  strokeWidth={2}
                  strokeOpacity={isHidden ? 0 : 1}
                  dot={false}
                  hide={isHidden}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      )}

      {/* Pagination controls */}
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setPage((p) => p + 1)}
        >
          Eelmine leht
        </Button>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
        >
          Järgmine leht
        </Button>
      </Box>
    </Box>
  );
}
