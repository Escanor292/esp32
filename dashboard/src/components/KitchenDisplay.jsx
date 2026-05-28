import React, { useState, useEffect } from 'react';
import {
  Box, Paper, Typography, Button, Grid, Card, CardContent,
  Chip, CircularProgress, Alert, useMediaQuery, useTheme
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import api from '../services/api';

function KitchenDisplay() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const fetchKitchenOrders = async () => {
    try {
      setLoading(true);
      const response = await api.get('/kitchen/orders');
      setOrders(response.data || []);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch kitchen orders:', err);
      setError('Không thể tải đơn pha chế');
    } finally {
      setLoading(false);
    }
  };

  const completeOrder = async (orderId) => {
    try {
      await api.patch(`/kitchen/orders/${orderId}`, { kitchen_status: 'completed' });
      setOrders(orders.filter(o => o.id !== orderId));
    } catch (err) {
      console.error('Failed to complete order:', err);
      alert('Không thể hoàn thành đơn');
    }
  };

  useEffect(() => {
    fetchKitchenOrders();
    const interval = setInterval(fetchKitchenOrders, 8000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant={isMobile ? "h6" : "h5"} fontWeight={800}>
          🍳 Đơn Pha Chế
        </Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={fetchKitchenOrders}
          size={isMobile ? "small" : "medium"}
          variant="outlined"
        >
          Làm mới
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {loading && orders.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3 }}>
          <Typography variant="h6" color="text.secondary">
            Không có đơn pha chế
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={isMobile ? 1 : 2}>
          {orders.map((order) => (
            <Grid item xs={12} sm={6} md={4} key={order.id}>
              <Card elevation={2} sx={{ borderRadius: 3, height: '100%' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant={isMobile ? "body2" : "subtitle1"} fontWeight={800} color="primary">
                        {order.transaction_code}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {formatTime(order.confirmed_at || order.created_at)}
                      </Typography>
                    </Box>
                    <Chip
                      label="Chờ pha chế"
                      size="small"
                      color="warning"
                      sx={{ fontWeight: 600 }}
                    />
                  </Box>

                  <Box sx={{ mb: 2 }}>
                    {order.items && order.items.map((item, idx) => (
                      <Box key={idx} sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant={isMobile ? "caption" : "body2"}>
                          {item.name} x{item.quantity}
                        </Typography>
                        <Typography variant={isMobile ? "caption" : "body2"} fontWeight={600}>
                          {item.price * item.quantity.toLocaleString('vi-VN')}đ
                        </Typography>
                      </Box>
                    ))}
                  </Box>

                  <Typography variant="subtitle2" fontWeight={800} color="success.main" sx={{ mb: 2 }}>
                    Tổng: {order.total.toLocaleString('vi-VN')}đ
                  </Typography>

                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<CheckCircleIcon />}
                    onClick={() => completeOrder(order.id)}
                    size={isMobile ? "small" : "medium"}
                    sx={{
                      background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                      '&:hover': {
                        background: 'linear-gradient(135deg, #16a34a, #15803d)',
                      }
                    }}
                  >
                    Hoàn thành
                  </Button>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}

export default KitchenDisplay;
