import { useState, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  DataGrid,
  type GridColDef,
  type GridSortModel,
  type GridRenderCellParams,
} from '@mui/x-data-grid';
import { useApi } from '../hooks/useApi';
import { timeConversion } from '../utils/timeConversion';
import type { HeatPeriodRecord } from '@home-automation/shared-types';

/** Format Unix ms timestamp as Estonian date-time: dd.MM.yyyy HH:mm */
function formatEstonianDate(unixMs: number): string {
  const date = new Date(unixMs);
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleString('et-EE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const columns: GridColDef[] = [
  {
    field: 'room',
    headerName: 'Ruum',
    flex: 1,
    minWidth: 100,
    filterable: true,
  },
  {
    field: 'start',
    headerName: 'Algus',
    flex: 1.5,
    minWidth: 150,
    renderCell: (params: GridRenderCellParams<HeatPeriodRecord, number>) =>
      formatEstonianDate(params.value ?? 0),
    filterable: false,
  },
  {
    field: 'period',
    headerName: 'Kestus',
    flex: 1,
    minWidth: 110,
    renderCell: (params: GridRenderCellParams<HeatPeriodRecord, number>) =>
      timeConversion(params.value ?? 0),
    filterable: false,
  },
  {
    field: 'end',
    headerName: 'Lõpp',
    flex: 1.5,
    minWidth: 150,
    renderCell: (params: GridRenderCellParams<HeatPeriodRecord, number>) =>
      formatEstonianDate(params.value ?? 0),
    filterable: false,
  },
];

const DEFAULT_SORT: GridSortModel = [{ field: 'start', sort: 'desc' }];

const PAGE_SIZE_OPTIONS = [10, 25, 50];

/**
 * Heatperiod history table using MUI DataGrid.
 * Sortable, filterable by room, paginated, with footer showing total heat duration.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
export function HeatperiodTable() {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [sortModel, setSortModel] = useState<GridSortModel>(DEFAULT_SORT);

  // Fetch a large batch — DataGrid handles client-side pagination/sorting/filtering
  const { data, loading, error } = useApi<HeatPeriodRecord[]>('/api/periods', {
    page: 0,
    limit: 30,
  });

  // Assign unique IDs to rows (DataGrid requires `id` or `getRowId`)
  const rows = useMemo(
    () => (data ?? []).map((row, index) => ({ ...row, id: index })),
    [data],
  );

  // Compute total heat duration across all rows for footer
  const totalDuration = useMemo(
    () => rows.reduce((sum, row) => sum + (row.period ?? 0), 0),
    [rows],
  );

  if (error) {
    return (
      <Typography color="text.secondary" sx={{ py: 2 }}>
        Kütteperioode ei leitud.
      </Typography>
    );
  }

  return (
    <Box>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        paginationModel={{ page, pageSize }}
        onPaginationModelChange={(model) => {
          setPage(model.page);
          setPageSize(model.pageSize);
        }}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        disableRowSelectionOnClick
        autoHeight
        sx={{ minHeight: 300 }}
      />

      {/* Footer: total heat duration sum */}
      {rows.length > 0 && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1, pr: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Kokku kütteaeg: <strong>{timeConversion(totalDuration)}</strong>
          </Typography>
        </Box>
      )}
    </Box>
  );
}
