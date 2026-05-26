import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';

function RevenueCard({ title, value, color = 'primary' }) {
  const colorMap = {
    primary: '#1976d2',
    success: '#4caf50',
    error: '#f44336',
    info: '#2196f3',
    secondary: '#dc004e',
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderTop: `4px solid ${colorMap[color]}`,
      }}
    >
      <CardContent>
        <Typography color="textSecondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h5" component="div" sx={{ fontWeight: 'bold' }}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}

export default RevenueCard;
