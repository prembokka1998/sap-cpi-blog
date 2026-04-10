// server/routes/auth.js — PostgreSQL version ($1,$2,... placeholders)
const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const router  = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, password, display_name, bio } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3)    return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 6)    return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!/^[a-zA-Z0-9_]+$/.test(username)) return res.status(400).json({ error: 'Username: letters, numbers, underscores only' });

    const { rows: existing } = await db.query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
    if (existing.length > 0) return res.status(409).json({ error: 'Username already taken' });

    const hash    = await bcrypt.hash(password, 12);
    const display = (display_name || username).slice(0, 100);
    const avatar  = display[0].toUpperCase();

    const { rows } = await db.query(
      `INSERT INTO users (username, password, display_name, bio, avatar, role)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, username, display_name, role, avatar, bio`,
      [username.toLowerCase(), hash, display, bio || '', avatar, 'author']
    );
    const user = rows[0];
    req.session.userId = user.id;
    req.session.user   = user;
    res.json({ success: true, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username.toLowerCase()]);
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid username or password' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid username or password' });

    delete user.password;
    req.session.userId = user.id;
    req.session.user   = user;
    res.json({ success: true, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  try {
    const { rows } = await db.query(
      'SELECT id, username, display_name, role, avatar, bio FROM users WHERE id = $1',
      [req.session.userId]
    );
    res.json({ user: rows[0] || null });
  } catch (err) {
    res.json({ user: null });
  }
});

module.exports = router;
