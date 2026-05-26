import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Paper, AppBar, Toolbar,
  Typography, Box, Tabs, Tab, CircularProgress, Chip
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HistoryIcon from '@mui/icons-material/History';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import BarChartIcon from '@mui/icons-material/BarChart';

import DeviceStatus from './components/DeviceStatus';
import TransactionHistory from './components/TransactionHistory';
import GenerateQRCode from './components/GenerateQRCode';
import MenuOrder from './components/MenuOrder';
import SalesStats from './components/SalesStats';
import api from './services/api';

// ============ THEME ============
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#6366f1' },
    secondary: { main: '#ec4899' },
    success: { main: '#22c55e' },
    warning: { main: '#f59e0b' },
    error: { main: '#ef4444' },
    background: { default: '#f8fafc', paper: '#ffffff' },
  },
  typography: {
    fontFamily: '"Inter", "Outfit", sans-serif',
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCard: { styleOverrides: { root: { borderRadius: 12 } } },
    MuiPaper: { styleOverrides: { root: { borderRadius: 12 } } },
  }
});

function TabPanel({ children, value, index }) {
  return (
    <div role="tabpanel" hidden={value !== index} id={`tabpanel-${index}`}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const fmt = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';

function App() {
  const [tabValue, setTabValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    devices: [], daily_revenue: 0, transaction_count: 0,
  });
  const [orderStats, setOrderStats] = useState({ order_count: 0, total_revenue: 0 });

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [dashRes, statsRes] = await Promise.all([
        api.get('/dashboard').catch(() => ({ data: { devices: [], daily_revenue: 0, transaction_count: 0 } })),
        api.get('/orders/stats/summary').catch(() => ({ data: { order_count: 0, total_revenue: 0 } }))
      ]);
      setDashboardData(dashRes.data);
      setOrderStats(statsRes.data);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    }
    setLoading(false);
  };

  const onlineDevices = dashboardData.devices.filter(d => d.status === 'online').length;

  const TABS = [
    { label: 'Tổng Quan', icon: <DashboardIcon fontSize="small" /> },
    { label: 'Gọi Món', icon: <RestaurantMenuIcon fontSize="small" /> },
    { label: 'Lịch Sử & Hóa Đơn', icon: <HistoryIcon fontSize="small" /> },
    { label: 'Doanh Số', icon: <BarChartIcon fontSize="small" /> },
    { label: 'Tạo Mã QR', icon: <QrCode2Icon fontSize="small" /> },
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'background.default' }}>

        {/* Header */}
        <AppBar position="static" elevation={0} sx={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 800, letterSpacing: 0.5 }}>
              🏪 Hệ Thống Thu Ngân Thông Minh
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Chip
                label={`${onlineDevices} thiết bị online`}
                size="small"
                sx={{ background: onlineDevices > 0 ? '#22c55e33' : '#ef444433', color: 'white', fontWeight: 600 }}
              />
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                {new Date().toLocaleTimeString('vi-VN')}
              </Typography>
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth="xl" sx={{ py: 3, flex: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={48} /></Box>
          ) : (
            <>
              {/* Summary Cards - always visible */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                {[
                  { title: 'Doanh thu hôm nay', value: fmt(orderStats.total_revenue || dashboardData.daily_revenue), color: 'primary', emoji: '💰' },
                  { title: 'Số đơn hàng hôm nay', value: (orderStats.order_count || dashboardData.transaction_count) + ' đơn', color: 'success', emoji: '🧾' },
                  { title: 'Thiết bị Online', value: onlineDevices + ' / ' + dashboardData.devices.length, color: onlineDevices > 0 ? 'success' : 'error', emoji: onlineDevices > 0 ? '📟' : '⚠️' },
                  { title: 'Thuế VAT hôm nay', value: fmt(orderStats.total_vat || 0), color: 'warning', emoji: '🏛️' },
                ].map((card, i) => (
                  <Grid item xs={6} md={3} key={i}>
                    <Paper elevation={2} sx={{
                      p: 2.5, borderRadius: 3,
                      background: `linear-gradient(135deg, ${['#eef2ff','#f0fdf4','#fff7ed','#fefce8'][i]}, white)`,
                      border: '1px solid', borderColor: `${['primary','success','warning','warning'][i]}.light`
                    }}>
                      <Typography variant="h2" sx={{ mb: 0.5 }}>{card.emoji}</Typography>
                      <Typography variant="h5" fontWeight={800} color={`${card.color}.main`}>{card.value}</Typography>
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>{card.title}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              {/* Tabs */}
              <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#f8fafc' }}>
                  <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} variant="scrollable" scrollButtons="auto">
                    {TABS.map((tab, i) => (
                      <Tab
                        key={i}
                        icon={tab.icon}
                        iconPosition="start"
                        label={tab.label}
                        id={`tab-${i}`}
                        sx={{ fontWeight: 600, minHeight: 56 }}
                      />
                    ))}
                  </Tabs>
                </Box>

                <TabPanel value={tabValue} index={0}>
                  <DeviceStatus devices={dashboardData.devices} />
                </TabPanel>

                <TabPanel value={tabValue} index={1}>
                  <MenuOrder />
                </TabPanel>

                <TabPanel value={tabValue} index={2}>
                  <TransactionHistory />
                </TabPanel>

                <TabPanel value={tabValue} index={3}>
                  <SalesStats />
                </TabPanel>

                <TabPanel value={tabValue} index={4}>
                  <GenerateQRCode devices={dashboardData.devices} />
                </TabPanel>
              </Paper>
            </>
          )}
        </Container>

        <Box component="footer" sx={{ py: 2, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="caption" color="text.secondary">
            © 2026 Hệ Thống Thu Ngân Thông Minh · Powered by ESP32 + SePay
          </Typography>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;
