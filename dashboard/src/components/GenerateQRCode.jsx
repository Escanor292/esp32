import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Grid,
  Paper,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material';
import QRCode from 'qrcode.react';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';
import api from '../services/api';

// ============ BANK CONFIG (SePay VietQR) ============
const BANK_CONFIG = {
  accountNumber: '0123456789',  // TODO: Thay bằng số tài khoản thật
  bankCode: 'MBBank',           // TODO: Thay bằng mã ngân hàng thật (VCB, TCB, ACB, MBBank...)
  accountName: 'NGUYEN VAN A',  // TODO: Thay bằng tên chủ tài khoản
};

// Generate VietQR URL using SePay API
const generateQRUrl = (amount, content) => {
  return `https://qr.sepay.vn/img?acc=${BANK_CONFIG.accountNumber}&bank=${BANK_CONFIG.bankCode}&amount=${amount}&des=${encodeURIComponent(content)}&template=compact`;
};

function GenerateQRCode({ devices }) {
  const [amount, setAmount] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [selectedDevice, setSelectedDevice] = useState(
    devices.length > 0 ? devices[0].id : ''
  );
  const [qrData, setQrData] = useState(null);
  const [transactionCode, setTransactionCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const formatAmount = (val) => {
    if (!val) return '';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  const handleAmountChange = (e) => {
    const rawVal = e.target.value;
    const cleanVal = rawVal.replace(/\D/g, '');
    setAmount(cleanVal);
  };

  const handleGenerate = async () => {
    if (!amount || !selectedDevice) {
      setError('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await api.post('/transactions/request', {
        device_id: selectedDevice,
        amount: parseFloat(amount),
        currency: 'VND',
        description: serviceName || 'Dịch vụ ngoài'
      });

      setQrData(response.data.qr_data);
      setTransactionCode(response.data.transaction_code);
    } catch (err) {
      setError('Lỗi tạo mã QR');
      console.error('Error:', err);
    }

    setLoading(false);
  };

  const handleDownload = () => {
    const element = document.getElementById('qr-code');
    const canvas = element.querySelector('canvas');
    const url = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = url;
    link.download = `qr_${transactionCode}.png`;
    link.click();
  };

  const handlePrint = () => {
    const element = document.getElementById('qr-code');
    const printWindow = window.open('', '', 'height=400,width=600');
    printWindow.document.write(element.innerHTML);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Box>
      {/* Input Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Tên dịch vụ / Sản phẩm"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              fullWidth
              placeholder="Ví dụ: Phí dịch vụ ngoài, Nạp tiền..."
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Số tiền (VNĐ)"
              type="text"
              value={formatAmount(amount)}
              onChange={handleAmountChange}
              fullWidth
              placeholder="Ví dụ: 1.000"
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              select
              label="Thiết bị"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              fullWidth
              SelectProps={{
                native: true,
              }}
            >
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.id} - {device.location_name}
                </option>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12}>
            <Button
              variant="contained"
              onClick={handleGenerate}
              disabled={loading}
              fullWidth
              sx={{ py: 1.5 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Tạo mã QR'}
            </Button>
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* QR Code Display */}
      {qrData && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            Mã giao dịch: {transactionCode}
          </Typography>

          <Box
            id="qr-code"
            sx={{
              display: 'inline-block',
              p: 2,
              border: '1px solid #ddd',
              borderRadius: '8px',
              mb: 3,
              backgroundColor: 'white'
            }}
          >
            <img 
              src={generateQRUrl(amount, transactionCode)}
              alt="QR thanh toán"
              style={{ width: 256, height: 256, display: 'block' }}
            />
          </Box>

          {serviceName && (
            <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 0.5 }}>
              Sản phẩm / Dịch vụ: {serviceName}
            </Typography>
          )}
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Số tiền: {parseFloat(amount).toLocaleString('vi-VN')}đ
          </Typography>

          <Grid container spacing={2} justifyContent="center">
            <Grid item>
              <Button
                variant="outlined"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
              >
                Tải xuống
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="outlined"
                startIcon={<PrintIcon />}
                onClick={handlePrint}
              >
                In
              </Button>
            </Grid>
          </Grid>
        </Paper>
      )}
    </Box>
  );
}

export default GenerateQRCode;
