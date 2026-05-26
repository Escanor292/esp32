/*
 * Personal Income Management Routes
 * Quản lý thu nhập cá nhân
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const mysql = require('mysql2/promise');

// ============ MIDDLEWARE ============

// Xác thực người dùng
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // Simplified - implement proper JWT verification
  req.userId = 'user_001'; // From JWT token
  next();
};

router.use(authenticateUser);

// ============ GIAO DỊCH ============

// 1. Ghi Nhận Giao Dịch
router.post('/transactions/record', async (req, res) => {
  try {
    const {
      amount,
      transaction_type,
      category,
      description,
      payment_method,
      bank_reference_id,
      notes
    } = req.body;

    const connection = await pool.getConnection();
    const transactionId = uuidv4();
    const transactionCode = generateTransactionCode();

    // Ghi giao dịch
    await connection.query(
      `INSERT INTO personal_transactions 
       (id, user_id, transaction_code, amount, transaction_type, category, 
        description, payment_method, bank_reference_id, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        transactionId,
        req.userId,
        transactionCode,
        amount,
        transaction_type,
        category,
        description,
        payment_method,
        bank_reference_id,
        'confirmed',
        notes
      ]
    );

    // Cập nhật tóm tắt hàng ngày
    await updateDailySummary(connection, req.userId, new Date());

    connection.release();

    res.json({
      success: true,
      transaction_id: transactionId,
      transaction_code: transactionCode,
      amount,
      status: 'confirmed',
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Record transaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Lấy Lịch Sử Giao Dịch
router.get('/transactions', async (req, res) => {
  try {
    const { date_from, date_to, type, category, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const connection = await pool.getConnection();

    // Xây dựng query
    let query = `
      SELECT * FROM personal_transactions 
      WHERE user_id = ?
    `;
    const params = [req.userId];

    if (date_from) {
      query += ` AND created_at >= ?`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND created_at <= ?`;
      params.push(date_to);
    }

    if (type) {
      query += ` AND transaction_type = ?`;
      params.push(type);
    }

    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [transactions] = await connection.query(query, params);

    // Tính tổng
    const totalQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expense
      FROM personal_transactions
      WHERE user_id = ?
    `;
    const totalParams = [req.userId];

    if (date_from) totalQuery += ` AND created_at >= ?`;
    if (date_to) totalQuery += ` AND created_at <= ?`;
    if (type) totalQuery += ` AND transaction_type = ?`;
    if (category) totalQuery += ` AND category = ?`;

    const [summary] = await connection.query(totalQuery, totalParams);

    connection.release();

    res.json({
      transactions,
      total: summary[0].total,
      page,
      limit,
      summary: {
        total_income: summary[0].total_income || 0,
        total_expense: summary[0].total_expense || 0,
        net_income: (summary[0].total_income || 0) - (summary[0].total_expense || 0)
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Lấy Tóm Tắt Hàng Ngày
router.get('/daily-summary', async (req, res) => {
  try {
    const { date } = req.query;
    const summaryDate = date || new Date().toISOString().split('T')[0];

    const connection = await pool.getConnection();

    // Lấy tóm tắt
    const [summary] = await connection.query(
      `SELECT * FROM daily_income_summary 
       WHERE user_id = ? AND summary_date = ?`,
      [req.userId, summaryDate]
    );

    // Lấy chi tiết giao dịch
    const [transactions] = await connection.query(
      `SELECT 
        TIME(created_at) as time,
        amount,
        category,
        description,
        transaction_type
       FROM personal_transactions
       WHERE user_id = ? AND DATE(created_at) = ?
       ORDER BY created_at ASC`,
      [req.userId, summaryDate]
    );

    connection.release();

    res.json({
      date: summaryDate,
      total_income: summary[0]?.total_income || 0,
      total_expense: summary[0]?.total_expense || 0,
      net_income: summary[0]?.net_income || 0,
      transaction_count: transactions.length,
      transactions
    });
  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Lấy Báo Cáo Tháng
router.get('/monthly-report', async (req, res) => {
  try {
    const { month } = req.query;
    const reportMonth = month || new Date().toISOString().substring(0, 7);

    const connection = await pool.getConnection();

    // Lấy báo cáo tháng
    const [report] = await connection.query(
      `SELECT * FROM monthly_income_report 
       WHERE user_id = ? AND DATE_FORMAT(report_month, '%Y-%m') = ?`,
      [req.userId, reportMonth]
    );

    // Lấy chi tiết theo danh mục
    const [categoryBreakdown] = await connection.query(
      `SELECT 
        category,
        transaction_type,
        COUNT(*) as count,
        SUM(amount) as total
       FROM personal_transactions
       WHERE user_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?
       GROUP BY category, transaction_type`,
      [req.userId, reportMonth]
    );

    // Lấy ngày tốt nhất
    const [topDays] = await connection.query(
      `SELECT 
        DATE(created_at) as date,
        SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income
       FROM personal_transactions
       WHERE user_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = ?
       GROUP BY DATE(created_at)
       ORDER BY income DESC
       LIMIT 5`,
      [req.userId, reportMonth]
    );

    connection.release();

    res.json({
      month: reportMonth,
      total_income: report[0]?.total_income || 0,
      total_expense: report[0]?.total_expense || 0,
      net_income: report[0]?.net_income || 0,
      transaction_count: report[0]?.transaction_count || 0,
      daily_average: report[0]?.total_income ? Math.round(report[0].total_income / 30) : 0,
      category_breakdown: categoryBreakdown,
      top_days: topDays
    });
  } catch (error) {
    console.error('Get monthly report error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Xuất CSV
router.get('/export', async (req, res) => {
  try {
    const { format = 'csv', date_from, date_to } = req.query;

    const connection = await pool.getConnection();

    let query = `
      SELECT * FROM personal_transactions 
      WHERE user_id = ?
    `;
    const params = [req.userId];

    if (date_from) {
      query += ` AND created_at >= ?`;
      params.push(date_from);
    }

    if (date_to) {
      query += ` AND created_at <= ?`;
      params.push(date_to);
    }

    query += ` ORDER BY created_at DESC`;

    const [transactions] = await connection.query(query, params);
    connection.release();

    if (format === 'csv') {
      const csv = generateCSV(transactions);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="report.csv"');
      res.send(csv);
    } else if (format === 'json') {
      res.json(transactions);
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ DANH MỤC ============

// 6. Thêm Danh Mục
router.post('/categories', async (req, res) => {
  try {
    const { category_name, description, color_code } = req.body;

    const connection = await pool.getConnection();
    const categoryId = uuidv4();

    await connection.query(
      `INSERT INTO income_categories 
       (id, user_id, category_name, description, color_code)
       VALUES (?, ?, ?, ?, ?)`,
      [categoryId, req.userId, category_name, description, color_code]
    );

    connection.release();

    res.json({
      success: true,
      category_id: categoryId,
      category_name
    });
  } catch (error) {
    console.error('Add category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. Lấy Danh Mục
router.get('/categories', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [categories] = await connection.query(
      `SELECT * FROM income_categories WHERE user_id = ? ORDER BY created_at DESC`,
      [req.userId]
    );

    connection.release();

    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ THỐNG KÊ ============

// 8. Lấy Thống Kê Tổng Quát
router.get('/statistics', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Tổng thu nhập
    const [totalStats] = await connection.query(
      `SELECT 
        SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as total_income,
        SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expense,
        COUNT(*) as total_transactions
       FROM personal_transactions
       WHERE user_id = ?`,
      [req.userId]
    );

    // Thu nhập tháng này
    const [monthStats] = await connection.query(
      `SELECT 
        SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expense
       FROM personal_transactions
       WHERE user_id = ? AND DATE_FORMAT(created_at, '%Y-%m') = DATE_FORMAT(NOW(), '%Y-%m')`,
      [req.userId]
    );

    // Thu nhập hôm nay
    const [todayStats] = await connection.query(
      `SELECT 
        SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as expense
       FROM personal_transactions
       WHERE user_id = ? AND DATE(created_at) = CURDATE()`,
      [req.userId]
    );

    connection.release();

    res.json({
      total: {
        income: totalStats[0].total_income || 0,
        expense: totalStats[0].total_expense || 0,
        net: (totalStats[0].total_income || 0) - (totalStats[0].total_expense || 0),
        transactions: totalStats[0].total_transactions || 0
      },
      month: {
        income: monthStats[0].income || 0,
        expense: monthStats[0].expense || 0,
        net: (monthStats[0].income || 0) - (monthStats[0].expense || 0)
      },
      today: {
        income: todayStats[0].income || 0,
        expense: todayStats[0].expense || 0,
        net: (todayStats[0].income || 0) - (todayStats[0].expense || 0)
      }
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ HELPER FUNCTIONS ============

function generateTransactionCode() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN${timestamp}${random}`;
}

async function updateDailySummary(connection, userId, date) {
  const summaryDate = date.toISOString().split('T')[0];

  // Tính tổng
  const [totals] = await connection.query(
    `SELECT 
      SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN transaction_type = 'expense' THEN amount ELSE 0 END) as total_expense,
      COUNT(*) as transaction_count
     FROM personal_transactions
     WHERE user_id = ? AND DATE(created_at) = ?`,
    [userId, summaryDate]
  );

  const totalIncome = totals[0].total_income || 0;
  const totalExpense = totals[0].total_expense || 0;
  const netIncome = totalIncome - totalExpense;

  // Upsert tóm tắt
  await connection.query(
    `INSERT INTO daily_income_summary 
     (id, user_id, summary_date, total_income, total_expense, net_income, transaction_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
     total_income = ?, total_expense = ?, net_income = ?, transaction_count = ?`,
    [
      uuidv4(),
      userId,
      summaryDate,
      totalIncome,
      totalExpense,
      netIncome,
      totals[0].transaction_count,
      totalIncome,
      totalExpense,
      netIncome,
      totals[0].transaction_count
    ]
  );
}

function generateCSV(transactions) {
  const headers = ['Ngày', 'Thời Gian', 'Loại', 'Số Tiền', 'Danh Mục', 'Mô Tả'];
  const rows = transactions.map(t => [
    new Date(t.created_at).toLocaleDateString('vi-VN'),
    new Date(t.created_at).toLocaleTimeString('vi-VN'),
    t.transaction_type,
    t.amount,
    t.category,
    t.description
  ]);

  return [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
}

module.exports = router;
