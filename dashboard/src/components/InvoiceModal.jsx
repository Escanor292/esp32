import React, { useRef } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Divider, Chip
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const fmt = (n) => (n || 0).toLocaleString('vi-VN');

export default function InvoiceModal({ open, onClose, order }) {
  const invoiceRef = useRef();

  if (!order) return null;

  const isPaid = order.status === 'confirmed';

  const handlePrint = () => {
    const content = invoiceRef.current.innerHTML;
    const win = window.open('', '_blank', 'width=420,height=700');
    win.document.write(`
      <html>
      <head>
        <title>Hóa đơn ${order.transaction_code}</title>
        <style>
          body { font-family: 'Courier New', monospace; padding: 20px; font-size: 13px; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .line { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .paid-stamp { border: 3px solid #4caf50; color: #4caf50; padding: 4px 10px; font-size: 22px; font-weight: 900; transform: rotate(-20deg); display: inline-block; margin-top: 10px; letter-spacing: 2px; }
        </style>
      </head>
      <body onload="window.print(); window.close()">
        ${content}
      </body>
      </html>
    `);
    win.document.close();
  };

  const now = new Date(order.created_at);
  const dateStr = now.toLocaleDateString('vi-VN');
  const timeStr = now.toLocaleTimeString('vi-VN');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 0 }}>
        🧾 Hóa đơn bán hàng
        {isPaid && <Chip icon={<CheckCircleIcon />} label="ĐÃ THANH TOÁN" color="success" size="small" />}
      </DialogTitle>
      <DialogContent>
        {/* Invoice Content for both display and print */}
        <Box ref={invoiceRef} sx={{ fontFamily: '"Courier New", monospace', fontSize: 13 }}>
          {/* Header */}
          <Box className="center" sx={{ textAlign: 'center', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={800} className="bold center">QUÁN CÀ PHÊ</Typography>
            <Typography variant="caption" display="block" className="center">Địa chỉ: 123 Đường ABC, TP.HCM</Typography>
            <Typography variant="caption" display="block" className="center">ĐT: 0909 xxx xxx</Typography>
            <Divider sx={{ my: 1, borderStyle: 'dashed' }} />
            <Typography variant="subtitle2" fontWeight={800} className="bold center">HÓA ĐƠN BÁN HÀNG</Typography>
            <Typography variant="caption" display="block" className="center">Số: {order.transaction_code}</Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'text.secondary', mb: 1 }}>
            <span>Ngày: {dateStr}</span>
            <span>Giờ: {timeStr}</span>
          </Box>

          <Divider sx={{ borderStyle: 'dashed', mb: 1 }} />

          {/* Items */}
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" fontWeight={700} color="text.secondary">TÊN MÓN</Typography>
              <Typography variant="caption" fontWeight={700} color="text.secondary">THÀNH TIỀN</Typography>
            </Box>
            {order.items.map((item, i) => (
              <Box key={i} sx={{ mb: 0.5 }}>
                <Typography variant="body2" fontWeight={600}>{item.name}</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', pl: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    {fmt(item.price)}đ × {item.quantity}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>{fmt(item.price * item.quantity)}đ</Typography>
                </Box>
              </Box>
            ))}
          </Box>

          <Divider sx={{ borderStyle: 'dashed', mb: 1 }} />

          {/* Totals */}
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2">Tạm tính</Typography>
              <Typography variant="body2">{fmt(order.subtotal)}đ</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" color="warning.dark">Thuế GTGT (10%)</Typography>
              <Typography variant="body2" color="warning.dark">+ {fmt(order.vat)}đ</Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 1 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle1" fontWeight={800}>TỔNG CỘNG</Typography>
            <Typography variant="subtitle1" fontWeight={800} color="primary">{fmt(order.total)}đ</Typography>
          </Box>

          {/* Payment Method */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Hình thức TT</Typography>
            <Typography variant="caption" fontWeight={600}>Chuyển khoản QR</Typography>
          </Box>
          {order.transaction_code && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary">Mã giao dịch</Typography>
              <Typography variant="caption" fontWeight={600}>{order.transaction_code}</Typography>
            </Box>
          )}

          <Divider sx={{ borderStyle: 'dashed', mt: 1.5, mb: 1 }} />

          {/* Stamp */}
          <Box sx={{ textAlign: 'center', my: 1 }}>
            {isPaid ? (
              <Box sx={{
                border: '3px solid',
                borderColor: 'success.main',
                color: 'success.main',
                display: 'inline-block',
                px: 2, py: 0.5,
                transform: 'rotate(-15deg)',
                fontWeight: 900,
                fontSize: '1.2rem',
                letterSpacing: 2,
                borderRadius: 1
              }}>
                ĐÃ THANH TOÁN
              </Box>
            ) : (
              <Box sx={{
                border: '3px solid',
                borderColor: 'warning.main',
                color: 'warning.main',
                display: 'inline-block',
                px: 2, py: 0.5,
                fontWeight: 900,
                fontSize: '1rem',
                borderRadius: 1
              }}>
                CHỜ THANH TOÁN
              </Box>
            )}
          </Box>

          <Divider sx={{ borderStyle: 'dashed', mt: 1 }} />
          <Typography variant="caption" display="block" sx={{ textAlign: 'center', mt: 1, color: 'text.secondary' }}>
            Cảm ơn quý khách! Hẹn gặp lại 😊
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions sx={{ gap: 1, px: 2, pb: 2 }}>
        <Button onClick={onClose} variant="outlined" size="small">Đóng</Button>
        <Button
          startIcon={<PrintIcon />}
          variant="contained"
          size="small"
          onClick={handlePrint}
        >
          In hóa đơn
        </Button>
      </DialogActions>
    </Dialog>
  );
}
