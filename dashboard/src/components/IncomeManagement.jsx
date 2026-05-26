import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  CircularProgress,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import AddIcon from '@mui/icons-material/Add';
import api from '../services/api';

// ============ INCOME STATISTICS CARD ============
function IncomeStatisticsCard({ title, value, color = 'primary', subtitle }) {
  const colorMap = {
    primary: '#1976d2',
    success: '#4caf50',
    error: '#f44336',
    warning: '#ff9800',
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `4px solid ${colorMap[color]}`,
      }}
    >
      <CardContent>
        <Typography color="textSecondary" gutterBottom>
          {title}
        </Typography>
        <Typography variant="h5" component="div" sx={{ fontWeight: 'bold', mb: 1 }}>
          {typeof value === 'number' ? `₫ ${value.toLocaleString()}` : value}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="textSecondary">
            {subtitle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

// ============ INCOME MANAGEMENT COMPONENT ============
function IncomeManagement() {
  const [statistics, setStatistics] = useState({
    total: { income: 0, expense: 0, net: 0 },
    month: { income: 0, expense: 0, net: 0 },
    today: { income: 0, expense: 0, net: 0 },
  });

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [dateFrom, setDateFrom] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  const [formData, setFormData] = useState({
    amount: '',
    transaction_type: 'income',
    category: 'Bán hàng',
    description: '',
    payment_method: 'bank_transfer',
  });

  // Fetch statistics
  useEffect(() => {
    fetchStatistics();
    fetchTransactions();
  }, []);

  const fetchStatistics = async () => {
    try {
      const response = await api.get('/personal/statistics');
      setStatistics(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const response = await api.get('/personal/transactions', {
        params: {
          date_from: dateFrom,
          date_to: dateTo,
        },
      });
      setTransactions(response.data.transactions || []);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
    setLoading(false);
  };

  const handleAddTransaction = async () => {
    try {
      await api.post('/personal/transactions/record', formData);
      setOpenDialog(false);
      setFormData({
        amount: '',
        transaction_type: 'income',
        category: 'Bán hàng',
        description: '',
        payment_method: 'bank_transfer',
      });
      fetchStatistics();
      fetchTransactions();
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/personal/export', {
        params: {
          format: 'csv',
          date_from: dateFrom,
          date_to: dateTo,
        },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report_${dateFrom}_${dateTo}.csv`);
      document.body.appendChild(link);
      link.click();
      link.parentElement.removeChild(link);
    } catch (error) {
      console.error('Error exporting:', error);
    }
  };

  const getTransactionTypeColor = (type) => {
    return type === 'income' ? 'success' : 'error';
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Quản Lý Thu Nhập
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setOpenDialog(true)}
        >
          Thêm Giao Dịch
        </Button>
      </Box>

      {/* Statistics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Today */}
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Hôm Nay - Thu Nhập"
            value={statistics.today.income}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Hôm Nay - Chi Phí"
            value={statistics.today.expense}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Hôm Nay - Lợi Nhuận"
            value={statistics.today.net}
            color="primary"
          />
        </Grid>

        {/* Month */}
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Tháng Này - Thu Nhập"
            value={statistics.month.income}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Tháng Này - Chi Phí"
            value={statistics.month.expense}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Tháng Này - Lợi Nhuận"
            value={statistics.month.net}
            color="primary"
          />
        </Grid>

        {/* Total */}
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Tổng Cộng - Thu Nhập"
            value={statistics.total.income}
            color="success"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Tổng Cộng - Chi Phí"
            value={statistics.total.expense}
            color="error"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Tổng Cộng - Lợi Nhuận"
            value={statistics.total.net}
            color="primary"
          />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <IncomeStatisticsCard
            title="Tổng Giao Dịch"
            value={statistics.total.transactions}
            color="warning"
          />
        </Grid>
      </Grid>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={5}>
            <TextField
              label="Từ Ngày"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={5}>
            <TextField
              label="Đến Ngày"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={2}>
            <Button
              variant="contained"
              onClick={fetchTransactions}
              fullWidth
              sx={{ height: '56px' }}
            >
              Lọc
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Export Button */}
      <Box sx={{ mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={handleExport}
          disabled={transactions.length === 0}
        >
          Xuất CSV
        </Button>
      </Box>

      {/* Transactions Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                <TableCell>Ngày</TableCell>
                <TableCell>Thời Gian</TableCell>
                <TableCell>Loại</TableCell>
                <TableCell align="right">Số Tiền</TableCell>
                <TableCell>Danh Mục</TableCell>
                <TableCell>Mô Tả</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {transactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                    Không có giao dịch
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((transaction) => (
                  <TableRow key={transaction.id} hover>
                    <TableCell>
                      {new Date(transaction.created_at).toLocaleDateString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      {new Date(transaction.created_at).toLocaleTimeString('vi-VN')}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={transaction.transaction_type === 'income' ? 'Thu' : 'Chi'}
                        color={getTransactionTypeColor(transaction.transaction_type)}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      {transaction.transaction_type === 'income' ? '+' : '-'}
                      {transaction.amount.toLocaleString()} VND
                    </TableCell>
                    <TableCell>{transaction.category}</TableCell>
                    <TableCell>{transaction.description}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Add Transaction Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Thêm Giao Dịch</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Số Tiền"
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) })}
            fullWidth
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Loại</InputLabel>
            <Select
              value={formData.transaction_type}
              onChange={(e) => setFormData({ ...formData, transaction_type: e.target.value })}
              label="Loại"
            >
              <MenuItem value="income">Thu Nhập</MenuItem>
              <MenuItem value="expense">Chi Phí</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="Danh Mục"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            fullWidth
            sx={{ mb: 2 }}
          />

          <TextField
            label="Mô Tả"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={3}
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth>
            <InputLabel>Phương Thức Thanh Toán</InputLabel>
            <Select
              value={formData.payment_method}
              onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              label="Phương Thức Thanh Toán"
            >
              <MenuItem value="bank_transfer">Chuyển Khoản</MenuItem>
              <MenuItem value="cash">Tiền Mặt</MenuItem>
              <MenuItem value="card">Thẻ</MenuItem>
              <MenuItem value="qr_code">Mã QR</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Hủy</Button>
          <Button onClick={handleAddTransaction} variant="contained">
            Thêm
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default IncomeManagement;
