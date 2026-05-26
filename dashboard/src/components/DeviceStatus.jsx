import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Box,
  Typography,
} from '@mui/material';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

function DeviceStatus({ devices }) {
  const getStatusColor = (status) => {
    return status === 'online' ? 'success' : 'error';
  };

  const getStatusIcon = (status) => {
    return (
      <FiberManualRecordIcon
        sx={{
          fontSize: '12px',
          color: status === 'online' ? '#4caf50' : '#f44336',
          mr: 1,
        }}
      />
    );
  };

  if (devices.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography color="textSecondary">Chưa có thiết bị nào</Typography>
      </Box>
    );
  }

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
            <TableCell>Mã thiết bị</TableCell>
            <TableCell>Vị trí</TableCell>
            <TableCell>Trạng thái</TableCell>
            <TableCell>Hoạt động cuối</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {devices.map((device) => (
            <TableRow key={device.id} hover>
              <TableCell sx={{ fontWeight: 'bold' }}>{device.id}</TableCell>
              <TableCell>{device.location_name || 'N/A'}</TableCell>
              <TableCell>
                <Chip
                  icon={getStatusIcon(device.status)}
                  label={device.status.toUpperCase()}
                  color={getStatusColor(device.status)}
                  size="small"
                  variant="outlined"
                />
              </TableCell>
              <TableCell>
                {device.last_heartbeat
                  ? new Date(device.last_heartbeat).toLocaleString()
                  : 'Chưa từng'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default DeviceStatus;
