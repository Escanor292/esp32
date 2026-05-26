import React, { useState, useEffect, useCallback } from 'react';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Chip, Box, TextField, Button, Grid, Typography,
  CircularProgress, IconButton, Tooltip
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import ReceiptIcon from '@mui/icons-material/Receipt';
import api from '../services/api';
import InvoiceModal from './InvoiceModal';

function TransactionHistory() {
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState(null);
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [txRes, ordRes] = await Promise.all([
        api.get('/transactions', { params: { date_from: dateFrom, date_to: dateTo } }).catch(() => ({ data: { transactions: [] } })),
        api.get('/orders').catch(() => ({ data: { orders: [] } }))
      ]);
      setTransactions(txRes.data.transactions || []);
      // Filter orders within date range
      const from = new Date(dateFrom).getTime();
      const to = new Date(dateTo + 'T23:59:59').getTime();
      const filteredOrders = (ordRes.data.orders || []).filter(o => {
        const t = new Date(o.created_at).getTime();
        return t >= from && t <= to;
      });
      setOrders(filteredOrders);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
    setLoading(false);
  }, [dateFrom, dateTo]);

  const handleExport = () => {
    const csvRows = [
      ['Loại', 'Mã giao dịch', 'Các món', 'Tạm tính', 'VAT', 'Tổng tiền', 'Trạng thái', 'Thời gian'],
      ...orders.map(o => [
        'Đơn món',
        o.transaction_code,
        o.items.map(i => `${i.name}×${i.quantity}`).join(' | '),
        o.subtotal,
        o.vat,
        o.total,
        o.status === 'confirmed' ? 'Đã TT' : 'Chờ TT',
        new Date(o.created_at).toLocaleString()
      ]),
      ...transactions.filter(t => !orders.find(o => o.transaction_code === t.transaction_code)).map(t => [
        'Dịch vụ ngoài',
        t.transaction_code,
        t.description || 'Dịch vụ ngoài / Khác',
        t.amount,
        0,
        t.amount,
        t.status === 'confirmed' ? 'Đã TT' : 'Chờ TT',
        new Date(t.created_at).toLocaleString()
      ])
    ].map(row => row.map(c => `"${c}"`).join(',')).join('\n');

    const blob = new Blob(['\uFEFF' + csvRows], { type: 'text/csv;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `giao_dich_${dateFrom}_${dateTo}.csv`;
    a.click();
  };

  const fmt = (n) => (n || 0).toLocaleString('vi-VN') + 'đ';

  // Combine orders and custom transactions
  const combinedHistory = [
    ...orders.map(o => ({ ...o, isOrder: true })),
    ...transactions
      .filter(t => !orders.find(o => o.transaction_code === t.transaction_code))
      .map(t => ({
        id: t.id,
        transaction_code: t.transaction_code,
        items: [{ name: t.description || 'Dịch vụ ngoài / Khác', price: t.amount, quantity: 1 }],
        subtotal: t.amount,
        vat: 0,
        total: t.amount,
        status: t.status,
        created_at: t.created_at,
        isCustomTx: true
      }))
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return (
    <Box>
      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextField label="Từ ngày" type="date" value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Grid>
          <Grid item xs={12} sm={5}>
            <TextField label="Đến ngày" type="date" value={dateTo}
              onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button variant="contained" onClick={fetchAll} fullWidth sx={{ height: '56px' }}>Lọc</Button>
          </Grid>
        </Grid>
      </Paper>

      <Box sx={{ mb: 2 }}>
        <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport}
          disabled={orders.length === 0 && transactions.length === 0}>
          Xuất CSV
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'primary.main' }}>
                {['Mã đơn hàng', 'Các món', 'Tạm tính', 'VAT', 'Tổng tiền', 'Trạng thái', 'Thời gian', 'Hóa đơn'].map(h => (
                  <TableCell key={h} sx={{ color: 'white', fontWeight: 700 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {combinedHistory.length > 0 ? combinedHistory.map((order) => (
                <TableRow key={order.id} hover>
                  <TableCell sx={{ fontWeight: 'bold', fontFamily: 'monospace', fontSize: 12 }}>{order.transaction_code}</TableCell>
                  <TableCell>
                    <Box sx={{ maxWidth: 200 }}>
                      {order.items.map((item, i) => (
                        <Typography key={i} variant="caption" display="block" noWrap>
                          {item.name} {item.quantity > 1 ? `× ${item.quantity}` : ''}
                        </Typography>
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>{fmt(order.subtotal)}</TableCell>
                  <TableCell sx={{ color: 'warning.dark' }}>{order.vat > 0 ? `+${fmt(order.vat)}` : '0đ'}</TableCell>
                  <TableCell><Typography fontWeight={800} color="primary">{fmt(order.total)}</Typography></TableCell>
                  <TableCell>
                    <Chip
                      label={order.status === 'confirmed' ? 'Đã TT' : 'Chờ TT'}
                      color={order.status === 'confirmed' ? 'success' : 'warning'}
                      size="small" variant="outlined"
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {new Date(order.created_at).toLocaleString('vi-VN')}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Xem & In hóa đơn">
                      <IconButton size="small" color="primary" onClick={() => setInvoiceOrder(order)}>
                        <ReceiptIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={8} sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">Chưa có đơn hàng hoặc giao dịch nào trong khoảng thời gian này</Typography>
                    <Typography variant="caption" color="text.secondary">Hãy thử tạo đơn hàng từ tab "Gọi Món" hoặc tạo mã QR dịch vụ ngoài</Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <InvoiceModal open={!!invoiceOrder} onClose={() => setInvoiceOrder(null)} order={invoiceOrder} />
    </Box>
  );
}

export default TransactionHistory;
