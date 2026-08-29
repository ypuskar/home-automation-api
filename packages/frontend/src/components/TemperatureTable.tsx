import { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
} from '@mui/material';
import type { SSEPayload } from '@home-automation/shared-types';
import { timeConversion } from '../utils/timeConversion';
import { ROOM_NAMES } from './Dashboard';

/** Ordered sensor IDs for consistent table row order */
const SENSOR_ORDER = [
  '28-0517c3a351ff', // Garaaž
  '28-0417c2a85dff', // Eesruum
  '28-0417c28ee3ff', // Õues
  '28-0417c2da95ff', // Leiliruum
];

/** Chart line colors per sensor — must match TemperatureChart */
const ROOM_COLORS: Record<string, string> = {
  '28-0517c3a351ff': '#64b5f6', // Garaaž — light blue
  '28-0417c2a85dff': '#1565c0', // Eesruum — dark blue
  '28-0417c28ee3ff': '#d4a76a', // Õues — sand
  '28-0417c2da95ff': '#00838f', // Leiliruum — dark cyan
};

interface TemperatureTableProps {
  data: SSEPayload | null;
  hiddenRooms: Set<string>;
  onToggleRoom: (sensorId: string) => void;
}

/**
 * Real-time temperature table showing room name, temperature, heat status,
 * and heat cycle info. Click room name to toggle chart visibility.
 *
 * Requirements: 8.5, 8.6, 8.7, 9.8, 9.9
 */
export function TemperatureTable({ data, hiddenRooms, onToggleRoom }: TemperatureTableProps) {
  const [now, setNow] = useState(Date.now());

  // Update "now" every second for elapsed time calculations
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        Ühendamine...
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} sx={{ mb: 2 }}>
      <Table size="small" aria-label="Temperatuuride tabel">
        <TableHead>
          <TableRow>
            <TableCell>Ruum</TableCell>
            <TableCell align="right">Temp °C</TableCell>
            <TableCell>Küte</TableCell>
            <TableCell>Kütetsükkel</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {SENSOR_ORDER.map((sensorId) => {
            const room = data[sensorId];
            if (!room) return null;

            const isHidden = hiddenRooms.has(sensorId);
            const roomName = ROOM_NAMES[sensorId] ?? sensorId;

            return (
              <TableRow
                key={sensorId}
                sx={{ opacity: isHidden ? 0.5 : 1 }}
              >
                <TableCell>
                  <Typography
                    component="span"
                    sx={{
                      cursor: 'pointer',
                      userSelect: 'none',
                      color: ROOM_COLORS[sensorId] ?? 'inherit',
                      fontWeight: 600,
                      textDecoration: isHidden ? 'line-through' : 'none',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                    onClick={() => onToggleRoom(sensorId)}
                  >
                    {roomName}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {room.temp.toFixed(1)}
                </TableCell>
                <TableCell>
                  {room.heat ? '🔥 ON' : 'OFF'}
                </TableCell>
                <TableCell>
                  <HeatCycleInfo room={room} now={now} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

/** Heat cycle info cell content */
function HeatCycleInfo({ room, now }: { room: SSEPayload[string]; now: number }) {
  if (room.heat && room.HeatStart) {
    // Heating is ON — show elapsed duration
    const elapsed = now - room.HeatStart;
    return <span>Heater On: {timeConversion(elapsed)}</span>;
  }

  if (!room.heat && room.HeatEnd && room.HeatEnd > 0 && room.HeatStart && room.HeatStart > 0) {
    // Heating is OFF — show last period duration and how long ago it ended
    const duration = room.HeatEnd - room.HeatStart;
    const ago = now - room.HeatEnd;
    return (
      <span>
        {timeConversion(duration)} ({timeConversion(ago)} tagasi)
      </span>
    );
  }

  // No heat data (non-heated room or no history)
  return <span>—</span>;
}
