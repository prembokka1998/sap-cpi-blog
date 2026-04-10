// server/index.js
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path    = require('path');
const fs      = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Ensure upload directory exists ──────────────────
const uploadDir = path.join(__dirname, '../client/public/images/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// ── Middleware ───────────────────────────────────────
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use(session({
  secret:            process.env.SESSION_SECRET || 'sap-cpi-blog-secret-change-me',
  resave:            false,
  saveUninitialized: false,
  cookie: {
    secure:   false,          // set true if using HTTPS
    httpOnly: true,
    maxAge:   7 * 24 * 60 * 60 * 1000   // 7 days
  }
}));

// ── Static files ─────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client/public')));

// ── API Routes ───────────────────────────────────────
app.use('/api/auth',   require('./routes/auth'));
app.use('/api/blogs',  require('./routes/blogs'));
app.use('/api/upload', require('./routes/upload'));

// ── Health check ─────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ── SPA fallback ─────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/public/index.html'));
});

// ── Start ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 SAP CPI Blog running at http://localhost:${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
});
