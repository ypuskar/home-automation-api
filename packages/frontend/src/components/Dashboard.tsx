import { useState } from 'react';
import { Container, Box, Typography } from '@mui/material';
import { UptimeHeader } from './UptimeHeader';
import { TabNavigation } from './TabNavigation';
import { TemperatureTable } from './TemperatureTable';
import { TemperatureChart } from './TemperatureChart';
import { HeatperiodTable } from './HeatperiodTable';
import { useSSE } from '../hooks/useSSE';
import type { SSEPayload } from '@home-automation/shared-types';

/** Sensor ID → Estonian room name mapping */
export const ROOM_NAMES: Record<string, string> = {
  '28-0517c3a351ff': 'Garaaž',
  '28-0417c2a85dff': 'Eesruum',
  '28-0417c28ee3ff': 'Õues',
  '28-0417c2da95ff': 'Leiliruum',
};

/**
 * Main layout: SSE connection, state distribution, tabs.
 * Manages legend visibility state shared between table and chart.
 *
 * Requirements: 8.3, 8.4, 8.5, 11.1, 11.2
 */
export function Dashboard() {
  const [activeTab, setActiveTab] = useState(0);
  const [hiddenRooms, setHiddenRooms] = useState<Set<string>>(new Set());
  const sseData: SSEPayload | null = useSSE();

  const toggleRoom = (sensorId: string) => {
    setHiddenRooms((prev) => {
      const next = new Set(prev);
      if (next.has(sensorId)) {
        next.delete(sensorId);
      } else {
        next.add(sensorId);
      }
      return next;
    });
  };

  return (
    <Container maxWidth="lg" sx={{ py: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5" component="h1">
          Koduautomaatika
        </Typography>
        <UptimeHeader />
      </Box>

      <TemperatureTable
        data={sseData}
        hiddenRooms={hiddenRooms}
        onToggleRoom={toggleRoom}
      />

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      <Box role="tabpanel" id="tabpanel-0" hidden={activeTab !== 0} sx={{ pt: 2 }}>
        {activeTab === 0 && (
          <TemperatureChart hiddenRooms={hiddenRooms} />
        )}
      </Box>

      <Box role="tabpanel" id="tabpanel-1" hidden={activeTab !== 1} sx={{ pt: 2 }}>
        {activeTab === 1 && (
          <HeatperiodTable />
        )}
      </Box>
    </Container>
  );
}
