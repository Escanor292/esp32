/*
 * Payment Integration Module
 * Tích hợp các phương thức thanh toán
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// ============ CONFIGURATION ============

const PAYMENT_CONFIG = {
  vietqr: {
    bankCode: 'VCB',
    accountNumber: '0123456789',
    accountName: 'SHOP ABC',
    webhookUrl: process.env.WEBHOOK_URL || 'https://your-domain.com/webhook/vietqr'
  },
  momo: {
    partnerCode: process.env.MOMO_PARTNER_CODE,
    accessKey: process.env.MOMO_ACCESS_KEY,
    secretKey: process.env.MOMO_SECRET_KEY,
    webhookUrl: process.env.WEBHOOK_URL || 'https://your-domain.com/webhook/momo'
  },
  zalopay: {
    appId: process.env.ZALOPAY_APP_ID || 2553,
    key1: process.env.ZALOPAY_KEY1,
    key2: process.env.ZALOPAY_KEY2,
    webhookUrl: process.env.WEBHOOK_URL || 'https://your-domain.com/webhook/zalopay'
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
  }
};

// ============ VIETQR PAYMENT ============

// 1. Tạo mã QR VietQR
router.post('/vietqr/create', async (req, res) => {
  try {
    const { amount, description, device_id } = req.body;
    const transactionCode = generateTransactionCode();

    // Tạo dữ liệu VietQR
    const vietqrData = {
      bankCode: PAYMENT_CONFIG.vietqr.bankCode,
      accountNumber: PAYMENT_CONFIG.vietqr.accountNumber,
      accountName: PAYMENT_CONFIG.vietqr.accountName,
      amount: amount,
      description: description || transactionCode,
      transactionCode: transactionCode
    };

    // Mã hóa thành QR string
    const qrString = encodeVietQR(vietqrData);

    // Lưu transaction
    await saveTransaction({
      transaction_code: transactionCode,
      device_id: device_id,
      amount: amount,
      payment_method: 'vietqr',
      status: 'pending'
    });

    res.json({
      success: true,
      transaction_code: transactionCode,
      qr_data: qrString,
      amount: amount,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    });
  } catch (error) {
    console.error('VietQR create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Webhook VietQR
router.post('/webhook/vietqr', async (req, res) => {
  try {
    const paymentData = req.body;

    // Xác thực chữ ký
    if (!verifyVietQRSignature(paymentData)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Tìm transaction
    const transaction = await findTransaction(paymentData.transactionCode);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Kiểm tra số tiền
    if (transaction.amount !== paymentData.amount) {
      return res.status(400).json({ error: 'Amount mismatch' });
    }

    // Xác nhận thanh toán
    await confirmPayment(transaction, paymentData);

    res.json({ success: true });
  } catch (error) {
    console.error('VietQR webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ MOMO PAYMENT ============

// 1. Tạo payment link Momo
router.post('/momo/create', async (req, res) => {
  try {
    const { amount, description, device_id } = req.body;
    const transactionCode = generateTransactionCode();
    const requestId = uuidv4();

    // Tạo payment request
    const momoPayment = {
      partnerCode: PAYMENT_CONFIG.momo.partnerCode,
      accessKey: PAYMENT_CONFIG.momo.accessKey,
      requestId: requestId,
      orderId: transactionCode,
      orderInfo: description || transactionCode,
      redirectUrl: `${process.env.FRONTEND_URL}/payment/success`,
      ipnUrl: PAYMENT_CONFIG.momo.webhookUrl,
      amount: amount,
      lang: 'vi',
      requestType: 'captureWallet',
      extraData: JSON.stringify({
        transaction_code: transactionCode,
        device_id: device_id
      })
    };

    // Tạo signature
    const signature = createMomoSignature(momoPayment);

    // Gửi request đến Momo
    const response = await axios.post(
      'https://test-payment.momo.vn/v2/gateway/api/create',
      { ...momoPayment, signature }
    );

    if (response.data.resultCode === 0) {
      // Lưu transaction
      await saveTransaction({
        transaction_code: transactionCode,
        device_id: device_id,
        amount: amount,
        payment_method: 'momo',
        status: 'pending',
        bank_reference_id: response.data.requestId
      });

      res.json({
        success: true,
        transaction_code: transactionCode,
        pay_url: response.data.payUrl,
        qr_code: response.data.qrCodeUrl,
        amount: amount
      });
    } else {
      res.status(400).json({ error: response.data.message });
    }
  } catch (error) {
    console.error('Momo create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Webhook Momo
router.post('/webhook/momo', async (req, res) => {
  try {
    const paymentData = req.body;

    // Xác thực chữ ký
    if (!verifyMomoSignature(paymentData)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Kiểm tra kết quả
    if (paymentData.resultCode !== 0) {
      return res.json({ success: false });
    }

    // Tìm transaction
    const extraData = JSON.parse(paymentData.extraData);
    const transaction = await findTransaction(extraData.transaction_code);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Xác nhận thanh toán
    await confirmPayment(transaction, paymentData);

    res.json({ success: true });
  } catch (error) {
    console.error('Momo webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ ZALOPAY PAYMENT ============

// 1. Tạo payment link ZaloPay
router.post('/zalopay/create', async (req, res) => {
  try {
    const { amount, description, device_id } = req.body;
    const transactionCode = generateTransactionCode();
    const appTransId = `${Math.floor(Date.now() / 1000)}_${transactionCode}`;

    // Tạo payment request
    const zalopayPayment = {
      app_id: PAYMENT_CONFIG.zalopay.appId,
      app_user: device_id,
      app_trans_id: appTransId,
      apptime: Math.floor(Date.now() / 1000),
      amount: amount,
      description: description || transactionCode,
      bank_code: 'zalopayapp',
      item: '[]',
      embed_data: JSON.stringify({
        transaction_code: transactionCode,
        device_id: device_id
      }),
      callback_url: PAYMENT_CONFIG.zalopay.webhookUrl
    };

    // Tạo MAC
    const mac = createZaloPayMAC(zalopayPayment);

    // Gửi request
    const response = await axios.post(
      'https://sandbox.zalopay.com.vn/api/v2/create',
      { ...zalopayPayment, mac }
    );

    if (response.data.return_code === 1) {
      // Lưu transaction
      await saveTransaction({
        transaction_code: transactionCode,
        device_id: device_id,
        amount: amount,
        payment_method: 'zalopay',
        status: 'pending',
        bank_reference_id: appTransId
      });

      res.json({
        success: true,
        transaction_code: transactionCode,
        return_url: response.data.return_url,
        qr_code: response.data.qr_code,
        amount: amount
      });
    } else {
      res.status(400).json({ error: response.data.return_message });
    }
  } catch (error) {
    console.error('ZaloPay create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Webhook ZaloPay
router.post('/webhook/zalopay', async (req, res) => {
  try {
    const paymentData = req.body;

    // Xác thực MAC
    if (!verifyZaloPayMAC(paymentData)) {
      return res.status(401).json({ error: 'Invalid MAC' });
    }

    // Kiểm tra kết quả
    if (paymentData.return_code !== 1) {
      return res.json({ success: false });
    }

    // Tìm transaction
    const embedData = JSON.parse(paymentData.embed_data);
    const transaction = await findTransaction(embedData.transaction_code);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Xác nhận thanh toán
    await confirmPayment(transaction, paymentData);

    res.json({ success: true });
  } catch (error) {
    console.error('ZaloPay webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ STRIPE PAYMENT ============

// 1. Tạo checkout session
router.post('/stripe/create', async (req, res) => {
  try {
    const stripe = require('stripe')(PAYMENT_CONFIG.stripe.secretKey);
    const { amount, description, device_id } = req.body;
    const transactionCode = generateTransactionCode();

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'vnd',
            product_data: {
              name: description || 'Payment',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      metadata: {
        transaction_code: transactionCode,
        device_id: device_id
      }
    });

    // Lưu transaction
    await saveTransaction({
      transaction_code: transactionCode,
      device_id: device_id,
      amount: amount,
      payment_method: 'stripe',
      status: 'pending',
      bank_reference_id: session.id
    });

    res.json({
      success: true,
      transaction_code: transactionCode,
      checkout_url: session.url,
      session_id: session.id,
      amount: amount
    });
  } catch (error) {
    console.error('Stripe create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Webhook Stripe
router.post('/webhook/stripe', async (req, res) => {
  try {
    const stripe = require('stripe')(PAYMENT_CONFIG.stripe.secretKey);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        PAYMENT_CONFIG.stripe.webhookSecret
      );
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const transactionCode = session.metadata.transaction_code;

      // Tìm transaction
      const transaction = await findTransaction(transactionCode);
      if (!transaction) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      // Xác nhận thanh toán
      await confirmPayment(transaction, {
        amount: session.amount_total / 100,
        bank_reference_id: session.id
      });
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ HELPER FUNCTIONS ============

function generateTransactionCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN${timestamp}${random}`;
}

function encodeVietQR(data) {
  // Simplified VietQR encoding
  return `00020101021138570010A000000727${data.bankCode}${data.accountNumber}${data.amount}`;
}

function verifyVietQRSignature(data) {
  // Implement VietQR signature verification
  return true;
}

function createMomoSignature(data) {
  const rawSignature = `accessKey=${data.accessKey}&amount=${data.amount}&extraData=${data.extraData}&ipnUrl=${data.ipnUrl}&orderId=${data.orderId}&orderInfo=${data.orderInfo}&partnerCode=${data.partnerCode}&redirectUrl=${data.redirectUrl}&requestId=${data.requestId}&requestType=${data.requestType}`;
  
  return crypto
    .createHmac('sha256', PAYMENT_CONFIG.momo.secretKey)
    .update(rawSignature)
    .digest('hex');
}

function verifyMomoSignature(data) {
  const signature = data.signature;
  delete data.signature;
  
  const calculatedSignature = createMomoSignature(data);
  return signature === calculatedSignature;
}

function createZaloPayMAC(data) {
  const rawMAC = `${data.app_id}|${data.app_trans_id}|${data.apptime}|${data.amount}|${data.app_user}|${data.embed_data}`;
  
  return crypto
    .createHmac('sha256', PAYMENT_CONFIG.zalopay.key1)
    .update(rawMAC)
    .digest('hex');
}

function verifyZaloPayMAC(data) {
  const mac = data.mac;
  delete data.mac;
  
  const calculatedMAC = createZaloPayMAC(data);
  return mac === calculatedMAC;
}

async function saveTransaction(data) {
  // Implement database save
  console.log('Saving transaction:', data);
}

async function findTransaction(transactionCode) {
  // Implement database find
  return { transaction_code: transactionCode, amount: 500000 };
}

async function confirmPayment(transaction, paymentData) {
  // 1. Cập nhật transaction status
  console.log('Confirming payment:', transaction.transaction_code);
  
  // 2. Ghi vào personal_transactions
  // 3. Gửi thông báo real-time
  // 4. Cập nhật dashboard
}

module.exports = router;
