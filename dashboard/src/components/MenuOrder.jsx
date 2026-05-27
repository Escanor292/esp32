import React, { useState, useCallback } from 'react';
import {
  Box, Grid, Typography, Card, CardContent, CardActionArea,
  IconButton, Button, Chip, Divider, Paper, Dialog, DialogContent,
  DialogTitle, DialogActions, Snackbar, Alert, Badge
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import QRCode from 'qrcode.react';
import api from '../services/api';

// ============ MENU DATA ============
const MENU_ITEMS = [
  { id: 1, name: 'Cà phê đen', price: 25000, category: 'Cà phê', emoji: '☕', color: '#6F4E37' },
  { id: 2, name: 'Cà phê sữa đá', price: 29000, category: 'Cà phê', emoji: '🥤', color: '#8B6914' },
  { id: 3, name: 'Bạc xỉu', price: 32000, category: 'Cà phê', emoji: '🥛', color: '#C4A35A' },
  { id: 4, name: 'Cappuccino', price: 45000, category: 'Cà phê', emoji: '☕', color: '#7B3F00' },
  { id: 5, name: 'Trà đào', price: 35000, category: 'Trà', emoji: '🍑', color: '#FF6B35' },
  { id: 6, name: 'Trà sữa trân châu', price: 40000, category: 'Trà', emoji: '🧋', color: '#DEB887' },
  { id: 7, name: 'Trà xanh matcha', price: 42000, category: 'Trà', emoji: '🍵', color: '#4CAF50' },
  { id: 8, name: 'Nước cam tươi', price: 38000, category: 'Nước ép', emoji: '🍊', color: '#FF9800' },
  { id: 9, name: 'Sinh tố dâu', price: 45000, category: 'Sinh tố', emoji: '🍓', color: '#E91E63' },
  { id: 10, name: 'Bánh croissant', price: 28000, category: 'Bánh', emoji: '🥐', color: '#D4A017' },
  { id: 11, name: 'Bánh mì sandwich', price: 35000, category: 'Bánh', emoji: '🥪', color: '#F5A623' },
  { id: 12, name: 'Bánh flan', price: 22000, category: 'Bánh', emoji: '🍮', color: '#F4D03F' },
];

const CATEGORIES = ['Tất cả', ...new Set(MENU_ITEMS.map(i => i.category))];
const VAT_RATE = 0.10;

// ============ BANK CONFIG (SePay VietQR) ============
const BANK_CONFIG = {
  accountNumber: '0123456789',  // TODO: Thay bằng số tài khoản thật
  bankCode: 'MBBank',           // TODO: Thay bằng mã ngân hàng thật (VCB, TCB, ACB, MBBank...)
  accountName: 'NGUYEN VAN A',  // TODO: Thay bằng tên chủ tài khoản
};

const fmt = (n) => n.toLocaleString('vi-VN') + 'đ';

// Generate VietQR URL using SePay API
const generateQRUrl = (amount, content) => {
  return `https://qr.sepay.vn/img?acc=${BANK_CONFIG.accountNumber}&bank=${BANK_CONFIG.bankCode}&amount=${amount}&des=${encodeURIComponent(content)}&template=compact`;
};

export default function MenuOrder() {
  const [cart, setCart] = useState({});
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  const filtered = activeCategory === 'Tất cả'
    ? MENU_ITEMS
    : MENU_ITEMS.filter(i => i.category === activeCategory);

  const addItem = useCallback((item) => {
    setCart(prev => ({ ...prev, [item.id]: { ...item, quantity: (prev[item.id]?.quantity || 0) + 1 } }));
  }, []);

  const removeItem = useCallback((itemId) => {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[itemId]?.quantity > 1) updated[itemId] = { ...updated[itemId], quantity: updated[itemId].quantity - 1 };
      else delete updated[itemId];
      return updated;
    });
  }, []);

  const deleteItem = useCallback((itemId) => {
    setCart(prev => { const u = { ...prev }; delete u[itemId]; return u; });
  }, []);

  const cartItems = Object.values(cart);
  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.quantity, 0);
  const vat = Math.round(subtotal * VAT_RATE);
  const total = subtotal + vat;

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    setLoading(true);
    try {
      const payload = {
        store_name: 'Quán Cà Phê',
        items: cartItems.map(i => ({ name: i.name, price: i.price, quantity: i.quantity }))
      };
      const res = await api.post('/orders', payload);
      setCurrentOrder(res.data.order);
      setCheckoutOpen(true);
    } catch (err) {
      console.error('Checkout error:', err);
    }
    setLoading(false);
  };

  const handlePaymentConfirmed = () => {
    setCheckoutOpen(false);
    setCart({});
    setSuccessOpen(true);
    setCurrentOrder(null);
  };

  return (
    <Box sx={{ display: 'flex', gap: 2, height: 'calc(100vh - 200px)', minHeight: 500 }}>
      {/* LEFT: Menu */}
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Category Filter */}
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {CATEGORIES.map(cat => (
            <Chip
              key={cat}
              label={cat}
              onClick={() => setActiveCategory(cat)}
              color={activeCategory === cat ? 'primary' : 'default'}
              variant={activeCategory === cat ? 'filled' : 'outlined'}
              sx={{ fontWeight: activeCategory === cat ? 700 : 400 }}
            />
          ))}
        </Box>

        {/* Menu Grid */}
        <Box sx={{ overflowY: 'auto', flex: 1, pr: 1 }}>
          <Grid container spacing={1.5}>
            {filtered.map(item => {
              const qty = cart[item.id]?.quantity || 0;
              return (
                <Grid item xs={6} sm={4} md={3} key={item.id}>
                  <Card
                    elevation={qty > 0 ? 6 : 1}
                    sx={{
                      border: qty > 0 ? '2px solid' : '1px solid',
                      borderColor: qty > 0 ? 'primary.main' : 'divider',
                      transition: 'all 0.2s',
                      position: 'relative'
                    }}
                  >
                    {qty > 0 && (
                      <Chip
                        label={`x${qty}`}
                        color="primary"
                        size="small"
                        sx={{ position: 'absolute', top: 6, right: 6, zIndex: 1, fontWeight: 700 }}
                      />
                    )}
                    <CardActionArea onClick={() => addItem(item)}>
                      <Box sx={{
                        height: 80,
                        background: `linear-gradient(135deg, ${item.color}22, ${item.color}44)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '2.5rem'
                      }}>
                        {item.emoji}
                      </Box>
                      <CardContent sx={{ p: 1.5, pb: '8px !important' }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                        <Typography variant="body2" color="primary" fontWeight={700}>{fmt(item.price)}</Typography>
                        <Typography variant="caption" color="text.secondary">{item.category}</Typography>
                      </CardContent>
                    </CardActionArea>
                    {qty > 0 && (
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1, pb: 1 }}>
                        <IconButton size="small" onClick={() => removeItem(item.id)} color="error"><RemoveIcon fontSize="small" /></IconButton>
                        <Typography fontWeight={700}>{qty}</Typography>
                        <IconButton size="small" onClick={() => addItem(item)} color="primary"><AddIcon fontSize="small" /></IconButton>
                      </Box>
                    )}
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      </Box>

      {/* RIGHT: Cart */}
      <Paper elevation={3} sx={{ width: 300, display: 'flex', flexDirection: 'column', p: 2, borderRadius: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <Badge badgeContent={totalItems} color="primary">
            <ShoppingCartIcon color="action" />
          </Badge>
          <Typography variant="h6" fontWeight={700}>Giỏ hàng</Typography>
        </Box>

        {cartItems.length === 0 ? (
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'text.secondary' }}>
            <Typography variant="body2" textAlign="center">Chưa có món nào.<br />Bấm vào món để thêm vào giỏ.</Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {cartItems.map(item => (
              <Box key={item.id} sx={{ display: 'flex', alignItems: 'center', mb: 1.5, gap: 1 }}>
                <Box sx={{ fontSize: '1.4rem' }}>{item.emoji}</Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" fontWeight={600} noWrap>{item.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{fmt(item.price)} × {item.quantity}</Typography>
                </Box>
                <Typography variant="body2" fontWeight={700} color="primary">{fmt(item.price * item.quantity)}</Typography>
                <IconButton size="small" onClick={() => deleteItem(item.id)} sx={{ color: 'error.light' }}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Box>
        )}

        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">Tạm tính</Typography>
          <Typography variant="body2">{fmt(subtotal)}</Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">Thuế VAT (10%)</Typography>
          <Typography variant="body2" color="warning.main">+ {fmt(vat)}</Typography>
        </Box>
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="subtitle1" fontWeight={800}>TỔNG CỘNG</Typography>
          <Typography variant="subtitle1" fontWeight={800} color="primary">{fmt(total)}</Typography>
        </Box>

        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<QrCode2Icon />}
          onClick={handleCheckout}
          disabled={cartItems.length === 0 || loading}
          sx={{ borderRadius: 2, py: 1.5, fontWeight: 700, fontSize: '1rem' }}
        >
          {loading ? 'Đang xử lý...' : 'Thanh Toán QR'}
        </Button>
        {cartItems.length > 0 && (
          <Button variant="text" color="error" size="small" fullWidth sx={{ mt: 1 }} onClick={() => setCart({})}>
            Xóa giỏ hàng
          </Button>
        )}
      </Paper>

      {/* Checkout QR Dialog */}
      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 700, pb: 0 }}>
          🔰 Quét mã để thanh toán
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', pt: 2 }}>
          {currentOrder && (
            <>
              <Box sx={{ display: 'inline-block', p: 2, background: 'white', borderRadius: 2, border: '3px solid', borderColor: 'primary.main', mb: 2 }}>
                <img 
                  src={generateQRUrl(currentOrder.total, currentOrder.transaction_code)}
                  alt="QR thanh toán"
                  style={{ width: 200, height: 200, display: 'block' }}
                />
              </Box>
              <Typography variant="h4" fontWeight={800} color="primary" gutterBottom>
                {fmt(currentOrder.total)}
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Nội dung CK: <strong>{currentOrder.transaction_code}</strong>
              </Typography>

              <Paper variant="outlined" sx={{ p: 1.5, mt: 1.5, textAlign: 'left', borderRadius: 2 }}>
                {currentOrder.items.map((item, i) => (
                  <Box key={i} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption">{item.name} × {item.quantity}</Typography>
                    <Typography variant="caption">{fmt(item.price * item.quantity)}</Typography>
                  </Box>
                ))}
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" color="text.secondary">VAT 10%</Typography>
                  <Typography variant="caption" color="warning.main">+{fmt(currentOrder.vat)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="caption" fontWeight={700}>Tổng</Typography>
                  <Typography variant="caption" fontWeight={700} color="primary">{fmt(currentOrder.total)}</Typography>
                </Box>
              </Paper>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
                Màn hình OLED trên thiết bị cũng hiển thị số tiền này
              </Typography>
            </>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2, gap: 1 }}>
          <Button variant="outlined" onClick={() => setCheckoutOpen(false)}>Huỷ</Button>
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={handlePaymentConfirmed}
          >
            Đã nhận tiền
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={successOpen} autoHideDuration={4000} onClose={() => setSuccessOpen(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" sx={{ fontWeight: 700 }}>✅ Thanh toán thành công! Đơn hàng đã được ghi nhận.</Alert>
      </Snackbar>
    </Box>
  );
}
