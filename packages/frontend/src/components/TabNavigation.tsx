import { Tabs, Tab, Box } from '@mui/material';

interface TabNavigationProps {
  activeTab: number;
  onTabChange: (newTab: number) => void;
}

/**
 * Two-tab navigation: "Temps" (temperature chart) and "Heatings" (heat period table).
 *
 * Requirements: 8.3, 8.4
 */
export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
      <Tabs
        value={activeTab}
        onChange={(_, newValue: number) => onTabChange(newValue)}
        aria-label="Navigatsioon"
      >
        <Tab label="Temps" id="tab-0" aria-controls="tabpanel-0" />
        <Tab label="Heatings" id="tab-1" aria-controls="tabpanel-1" />
      </Tabs>
    </Box>
  );
}
