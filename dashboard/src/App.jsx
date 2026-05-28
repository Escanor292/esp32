import React, { useState, useEffect } from 'react';
import {
  Container, Grid, Paper, AppBar, Toolbar,
  Typography, Box, Tabs, Tab, CircularProgress, Chip,
  useMediaQuery, useTheme
} from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import HistoryIcon from '@mui/icons-material/History';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import BarChartIcon from '@mui/icons-material/BarChart';
import KitchenIcon from '@mui/icons-material/Kitchen';

import DeviceStatus from './components/DeviceStatus';
import TransactionHistory from './components/TransactionHistory';
import GenerateQRCode from './components/GenerateQRCode';
import MenuOrder from './components/MenuOrder';
import SalesStats from './components/SalesStats';
import KitchenDisplay from './components/KitchenDisplay';
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

  const currentTheme = useTheme();
  const isMobile = useMediaQuery(currentTheme.breakpoints.down('sm'));

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
    { label: 'Pha Chế', icon: <KitchenIcon fontSize="small" /> },
    { label: 'Lịch Sử', icon: <HistoryIcon fontSize="small" /> },
    { label: 'Doanh Số', icon: <BarChartIcon fontSize="small" /> },
    { label: 'QR', icon: <QrCode2Icon fontSize="small" /> },
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: 'background.default' }}>

        {/* Header */}
        <AppBar position="static" elevation={0} sx={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <Toolbar>
            <Typography variant={isMobile ? "subtitle1" : "h6"} component="div" sx={{ flexGrow: 1, fontWeight: 800, letterSpacing: 0.5 }}>
              🏪 {isMobile ? 'GROUP' : 'Hệ Thống Thu Ngân Thông Minh'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Chip
                label={`${onlineDevices} online`}
                size="small"
                sx={{ background: onlineDevices > 0 ? '#22c55e33' : '#ef444433', color: 'white', fontWeight: 600 }}
              />
              {!isMobile && (
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {new Date().toLocaleTimeString('vi-VN')}
                </Typography>
              )}
            </Box>
          </Toolbar>
        </AppBar>

        <Container maxWidth={isMobile ? false : "xl"} sx={{ py: isMobile ? 1 : 3, flex: 1 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress size={48} /></Box>
          ) : (
            <>
              {/* Summary Cards - responsive */}
              <Grid container spacing={isMobile ? 1 : 2} sx={{ mb: isMobile ? 2 : 3 }}>
                {[
                  { title: 'Doanh thu', value: fmt(orderStats.total_revenue || dashboardData.daily_revenue), color: 'primary', emoji: '💰' },
                  { title: 'Đơn hàng', value: (orderStats.order_count || dashboardData.transaction_count), color: 'success', emoji: '🧾' },
                  { title: 'Online', value: onlineDevices, color: onlineDevices > 0 ? 'success' : 'error', emoji: onlineDevices > 0 ? '📟' : '⚠️' },
                  { title: 'VAT', value: fmt(orderStats.total_vat || 0), color: 'warning', emoji: '🏛️' },
                ].map((card, i) => (
                  <Grid item xs={3} sm={6} md={3} key={i}>
                    <Paper elevation={2} sx={{
                      p: isMobile ? 1 : 2.5, borderRadius: 3,
                      background: `linear-gradient(135deg, ${['#eef2ff','#f0fdf4','#fff7ed','#fefce8'][i]}, white)`,
                      border: '1px solid', borderColor: `${['primary','success','warning','warning'][i]}.light`
                    }}>
                      <Typography variant={isMobile ? "h4" : "h2"} sx={{ mb: 0.5 }}>{card.emoji}</Typography>
                      <Typography variant={isMobile ? "body2" : "h5"} fontWeight={800} color={`${card.color}.main`}>{card.value}</Typography>
                      <Typography variant={isMobile ? "caption" : "caption"} color="text.secondary" fontWeight={600} fontSize={isMobile ? "0.6rem" : "inherit"}>{card.title}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              {/* Tabs - responsive */}
              <Paper elevation={1} sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', backgroundColor: '#f8fafc' }}>
                  <Tabs
                    value={tabValue}
                    onChange={(_, v) => setTabValue(v)}
                    variant={isMobile ? "scrollable" : "fullWidth"}
                    scrollButtons={isMobile ? "auto" : false}
                    sx={{ minHeight: isMobile ? 48 : 56 }}
                  >
                    {TABS.map((tab, i) => (
                      <Tab
                        key={i}
                        icon={tab.icon}
                        iconPosition={isMobile ? "top" : "start"}
                        label={tab.label}
                        id={`tab-${i}`}
                        sx={{ fontWeight: 600, minHeight: isMobile ? 48 : 56, fontSize: isMobile ? "0.75rem" : "inherit" }}
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
                  <KitchenDisplay />
                </TabPanel>

                <TabPanel value={tabValue} index={3}>
                  <TransactionHistory />
                </TabPanel>

                <TabPanel value={tabValue} index={4}>
                  <SalesStats />
                </TabPanel>

                <TabPanel value={tabValue} index={5}>
                  <GenerateQRCode devices={dashboardData.devices} />
                </TabPanel>
              </Paper>
            </>
          )}
        </Container>

        {!isMobile && (
          <Box component="footer" sx={{ py: 2, textAlign: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              © 2026 Hệ Thống Thu Ngân Thông Minh · Powered by ESP32 + SePay
            </Typography>
          </Box>
        )}
      </Box>
    </ThemeProvider>
  );
}

export default App;
