import { useState, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { timeConversion } from '../utils/timeConversion';

interface HealthResponse {
  node: number;   // Node.js process uptime in ms
  server: number; // OS uptime in ms
}

/**
 * Displays Node.js process uptime and server OS uptime.
 * Fetches once from /api/health, then increments locally every 1s.
 *
 * Requirements: 8.8, 8.9, 11.1, 11.2
 */
export function UptimeHeader() {
  const [nodeUptime, setNodeUptime] = useState<number | null>(null);
  const [serverUptime, setServerUptime] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) return;
        const data: HealthResponse = await res.json();
        if (!cancelled) {
          setNodeUptime(data.node);
          setServerUptime(data.server);
        }
      } catch {
        // Will retry on next interval
      }
    }

    fetchHealth();

    // Increment uptimes locally every 1s
    const interval = setInterval(() => {
      setNodeUptime((prev) => (prev !== null ? prev + 1000 : null));
      setServerUptime((prev) => (prev !== null ? prev + 1000 : null));
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', py: 1, px: 2 }}>
      <Typography variant="body2" color="text.secondary">
        Node: {nodeUptime !== null ? timeConversion(nodeUptime) : '—'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Server: {serverUptime !== null ? timeConversion(serverUptime) : '—'}
      </Typography>
    </Box>
  );
}
