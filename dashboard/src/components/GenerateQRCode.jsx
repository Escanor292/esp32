import React, { useState } from 'react';
import {
  Box,
  TextField,
  Button,
  Grid,
  Paper,
  Typography,
  Alert,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PrintIcon from '@mui/icons-material/Print';

// ============ BANK CONFIG (SePay VietQR) ============
const BANK_CONFIG = {
  accountNumber: '0932299701',
  bankCode: 'MBBank',
  accountName: 'NGUYEN QUACH PHU TAI',
};

// Generate VietQR URL using SePay API
const generateQRUrl = (amount, content) => {
  return `https://qr.sepay.vn/img?acc=${BANK_CONFIG.accountNumber}&bank=${BANK_CONFIG.bankCode}&amount=${amount}&des=${encodeURIComponent(content)}&template=compact`;
};

// Generate transaction code
const generateTransactionCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `QR_${timestamp}${random}`;
};

function GenerateQRCode({ devices }) {
  const [amount, setAmount] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [selectedDevice, setSelectedDevice] = useState(
    devices.length > 0 ? devices[0].id : ''
  );
  const [showQR, setShowQR] = useState(false);
  const [transactionCode, setTransactionCode] = useState('');
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

  const handleGenerate = () => {
    if (!amount) {
      setError('Vui lòng nhập số tiền');
      return;
    }

    if (parseFloat(amount) <= 0) {
      setError('Số tiền phải lớn hơn 0');
      return;
    }

    setError('');
    const txnCode = generateTransactionCode();
    setTransactionCode(txnCode);
    setShowQR(true);
  };

  const handleDownload = () => {
    const qrUrl = generateQRUrl(amount, transactionCode);
    const link = document.createElement('a');
    link.href = qrUrl;
    link.download = `qr_${transactionCode}.png`;
    link.target = '_blank';
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open('', '', 'height=600,width=800');
    const qrUrl = generateQRUrl(amount, transactionCode);
    printWindow.document.write(`
      <html>
        <head>
          <title>In mã QR - ${transactionCode}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 20px;
            }
            h2 { margin-bottom: 10px; }
            img { margin: 20px 0; border: 2px solid #333; padding: 10px; }
            .info { margin: 10px 0; font-size: 14px; }
          </style>
        </head>
        <body>
          <h2>Mã thanh toán QR</h2>
          <div class="info"><strong>Mã giao dịch:</strong> ${transactionCode}</div>
          ${serviceName ? `<div class="info"><strong>Dịch vụ:</strong> ${serviceName}</div>` : ''}
          <div class="info"><strong>Số tiền:</strong> ${parseFloat(amount).toLocaleString('vi-VN')}đ</div>
          <div class="info"><strong>Ngân hàng:</strong> ${BANK_CONFIG.bankCode} - ${BANK_CONFIG.accountNumber}</div>
          <div class="info"><strong>Chủ tài khoản:</strong> ${BANK_CONFIG.accountName}</div>
          <img src="${qrUrl}" alt="QR Code" width="300" height="300" />
          <div class="info" style="margin-top: 20px; color: #666;">Quét mã QR bằng app ngân hàng để thanh toán</div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleReset = () => {
    setShowQR(false);
    setAmount('');
    setServiceName('');
    setTransactionCode('');
    setError('');
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
              placeholder="Ví dụ: Phí dịch vụ, Nạp tiền..."
              disabled={showQR}
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              label="Số tiền (VNĐ)"
              type="text"
              value={formatAmount(amount)}
              onChange={handleAmountChange}
              fullWidth
              placeholder="Ví dụ: 100.000"
              disabled={showQR}
              required
            />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              select
              label="Thiết bị"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              fullWidth
              disabled={showQR}
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
            {!showQR ? (
              <Button
                variant="contained"
                onClick={handleGenerate}
                fullWidth
                sx={{ py: 1.5 }}
              >
                TẠO MÃ QR
              </Button>
            ) : (
              <Button
                variant="outlined"
                onClick={handleReset}
                fullWidth
                sx={{ py: 1.5 }}
              >
                Tạo mã QR mới
              </Button>
            )}
          </Grid>
        </Grid>

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </Paper>

      {/* QR Code Display */}
      {showQR && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="h6" sx={{ mb: 1 }}>
            Mã giao dịch: <strong>{transactionCode}</strong>
          </Typography>

          {serviceName && (
            <Typography variant="subtitle1" sx={{ mb: 1, color: 'text.secondary' }}>
              Dịch vụ: {serviceName}
            </Typography>
          )}

          <Typography variant="h5" color="primary" fontWeight={700} sx={{ mb: 2 }}>
            Số tiền: {parseFloat(amount).toLocaleString('vi-VN')}đ
          </Typography>

          <Box
            sx={{
              display: 'inline-block',
              p: 2,
              border: '3px solid',
              borderColor: 'primary.main',
              borderRadius: '12px',
              mb: 3,
              backgroundColor: 'white'
            }}
          >
            <img 
              src={generateQRUrl(amount, transactionCode)}
              alt="QR thanh toán"
              style={{ width: 280, height: 280, display: 'block' }}
            />
          </Box>

          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            Nội dung chuyển khoản: <strong>{transactionCode}</strong>
          </Typography>

          <Paper variant="outlined" sx={{ p: 2, mb: 3, textAlign: 'left', maxWidth: 400, mx: 'auto' }}>
            <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
              <strong>Ngân hàng:</strong> {BANK_CONFIG.bankCode}
            </Typography>
            <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
              <strong>Số tài khoản:</strong> {BANK_CONFIG.accountNumber}
            </Typography>
            <Typography variant="caption" display="block">
              <strong>Chủ tài khoản:</strong> {BANK_CONFIG.accountName}
            </Typography>
          </Paper>

          <Grid container spacing={2} justifyContent="center">
            <Grid item>
              <Button
                variant="contained"
                startIcon={<DownloadIcon />}
                onClick={handleDownload}
              >
                Tải xuống
              </Button>
            </Grid>
            <Grid item>
              <Button
                variant="contained"
                color="secondary"
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
