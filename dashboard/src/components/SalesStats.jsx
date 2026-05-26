import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Grid, Typography, Paper, Card, CardContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButton, ToggleButtonGroup, Chip,
  LinearProgress, Tooltip
} from '@mui/material';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import BarChartIcon from '@mui/icons-material/BarChart';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip as CTooltip, Legend } from 'chart.js';
import { Bar } from 'react-chartjs-2';
import api from '../services/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, CTooltip, Legend);

const fmt = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';
const TODAY = new Date().toISOString().split('T')[0];
const THIS_MONTH = new Date().toISOString().substring(0, 7);
const THIS_YEAR = new Date().getFullYear().toString();

export default function SalesStats() {
  const [period, setPeriod] = useState('day');
  const [dateTarget, setDateTarget] = useState(TODAY);
  const [summary, setSummary] = useState(null);
  const [monthly, setMonthly] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      if (period === 'month') {
        const [sumRes, monthRes] = await Promise.all([
          api.get('/orders/stats/summary', { params: { period: 'month', date: dateTarget } }),
          api.get('/orders/stats/monthly', { params: { year: THIS_YEAR } })
        ]);
        setSummary(sumRes.data);
        setMonthly(monthRes.data);
      } else {
        const res = await api.get('/orders/stats/summary', { params: { date: dateTarget } });
        setSummary(res.data);
        setMonthly(null);
      }
    } catch (err) {
      console.error('Stats fetch error:', err);
      setSummary({ order_count: 0, total_subtotal: 0, total_vat: 0, total_revenue: 0, item_stats: [] });
    }
    setLoading(false);
  }, [period, dateTarget]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const handlePeriod = (_, val) => {
    if (!val) return;
    setPeriod(val);
    setDateTarget(val === 'day' ? TODAY : THIS_MONTH);
  };

  const chartData = monthly ? {
    labels: monthly.months.map(m => m.label),
    datasets: [
      {
        label: 'Doanh thu (đ)',
        data: monthly.months.map(m => m.revenue),
        backgroundColor: 'rgba(99, 102, 241, 0.7)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 2,
        borderRadius: 6,
      }
    ]
  } : null;

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: true, text: `Doanh thu theo tháng - Năm ${THIS_YEAR}` },
      tooltip: { callbacks: { label: (ctx) => ' ' + ctx.raw.toLocaleString('vi-VN') + 'đ' } }
    },
    scales: { y: { ticks: { callback: (v) => (v / 1000000).toFixed(1) + 'M' } } }
  };

  const maxRevenue = summary?.item_stats?.[0]?.revenue || 1;

  return (
    <Box>
      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 3, flexWrap: 'wrap' }}>
        <ToggleButtonGroup value={period} exclusive onChange={handlePeriod} size="small">
          <ToggleButton value="day">Theo ngày</ToggleButton>
          <ToggleButton value="month">Theo tháng</ToggleButton>
        </ToggleButtonGroup>
        <input
          type={period === 'day' ? 'date' : 'month'}
          value={dateTarget}
          onChange={e => setDateTarget(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ccc', fontSize: 14 }}
        />
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {[
          { label: 'Số đơn hàng', value: summary?.order_count || 0, icon: <BarChartIcon />, color: '#6366f1', unit: 'đơn' },
          { label: 'Doanh thu thuần', value: fmt(summary?.total_subtotal), icon: <TrendingUpIcon />, color: '#22c55e', unit: '' },
          { label: 'Thuế VAT (10%)', value: fmt(summary?.total_vat), icon: <TrendingUpIcon />, color: '#f59e0b', unit: '' },
          { label: 'Tổng doanh thu', value: fmt(summary?.total_revenue), icon: <EmojiEventsIcon />, color: '#ef4444', unit: '' },
        ].map((card, i) => (
          <Grid item xs={6} md={3} key={i}>
            <Card elevation={2} sx={{ borderLeft: `4px solid ${card.color}`, borderRadius: 2 }}>
              <CardContent sx={{ pb: '12px !important' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: card.color, mb: 0.5 }}>
                  {card.icon}
                  <Typography variant="caption" fontWeight={600}>{card.label}</Typography>
                </Box>
                <Typography variant="h5" fontWeight={800} sx={{ color: card.color }}>
                  {card.value}{card.unit && <Typography component="span" variant="caption" ml={0.5}>{card.unit}</Typography>}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3}>
        {/* Item Stats Table */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" fontWeight={700} gutterBottom>
              🏆 Món bán chạy
            </Typography>
            {!summary?.item_stats?.length ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                Chưa có dữ liệu trong kỳ này
              </Typography>
            ) : (
              <Box>
                {summary.item_stats.map((item, i) => (
                  <Box key={item.name} sx={{ mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {i === 0 && <Typography fontSize="1rem">🥇</Typography>}
                        {i === 1 && <Typography fontSize="1rem">🥈</Typography>}
                        {i === 2 && <Typography fontSize="1rem">🥉</Typography>}
                        {i > 2 && <Typography fontSize="0.8rem" color="text.secondary" width={20} textAlign="center">{i + 1}</Typography>}
                        <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                        <Chip label={`×${item.quantity}`} size="small" variant="outlined" />
                      </Box>
                      <Typography variant="body2" fontWeight={700} color="primary">{fmt(item.revenue)}</Typography>
                    </Box>
                    <Tooltip title={`${Math.round((item.revenue / maxRevenue) * 100)}%`}>
                      <LinearProgress
                        variant="determinate"
                        value={(item.revenue / maxRevenue) * 100}
                        sx={{ height: 6, borderRadius: 3 }}
                      />
                    </Tooltip>
                  </Box>
                ))}
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Monthly Chart */}
        <Grid item xs={12} md={6}>
          <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
            {monthly && chartData ? (
              <Bar data={chartData} options={chartOptions} />
            ) : (
              <Box>
                <Typography variant="subtitle1" fontWeight={700} gutterBottom>📊 Biểu đồ tháng</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'text.secondary' }}>
                  <Typography variant="body2">Chọn chế độ "Theo tháng" để xem biểu đồ theo tháng trong năm</Typography>
                </Box>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* Detail Table */}
        {summary?.item_stats?.length > 0 && (
          <Grid item xs={12}>
            <Paper elevation={2} sx={{ borderRadius: 2, overflow: 'hidden' }}>
              <Box sx={{ p: 2, pb: 0 }}>
                <Typography variant="subtitle1" fontWeight={700}>📋 Bảng chi tiết sản phẩm</Typography>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'primary.main' }}>
                      {['#', 'Tên món', 'Đơn giá', 'Số lượng', 'Doanh thu', 'Tỷ lệ'].map(h => (
                        <TableCell key={h} sx={{ color: 'white', fontWeight: 700 }}>{h}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {summary.item_stats.map((item, i) => (
                      <TableRow key={item.name} hover>
                        <TableCell>{i + 1}</TableCell>
                        <TableCell><Typography fontWeight={600}>{item.name}</Typography></TableCell>
                        <TableCell>{fmt(item.price)}</TableCell>
                        <TableCell><Chip label={item.quantity} size="small" color="primary" /></TableCell>
                        <TableCell><Typography fontWeight={700} color="primary">{fmt(item.revenue)}</Typography></TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary">
                            {summary.total_subtotal > 0 ? Math.round((item.revenue / summary.total_subtotal) * 100) : 0}%
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>
        )}
      </Grid>
    </Box>
  );
}
