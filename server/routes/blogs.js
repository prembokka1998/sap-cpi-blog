// server/routes/blogs.js — PostgreSQL version
const express  = require('express');
const slugify  = require('slugify');
const db       = require('../db');
const router   = express.Router();

// ── Middleware ──────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

// ── Helpers ─────────────────────────────────────────
async function getBlogById(id) {
  const { rows } = await db.query(`
    SELECT b.*, u.display_name AS author_display, u.username AS author_username, u.avatar AS author_avatar
    FROM blogs b JOIN users u ON b.author_id = u.id
    WHERE b.id = $1
  `, [id]);
  if (rows.length === 0) return null;
  const blog = rows[0];
  const { rows: tagRows } = await db.query(
    'SELECT t.name FROM tags t JOIN blog_tags bt ON t.id=bt.tag_id WHERE bt.blog_id=$1 ORDER BY t.name',
    [id]
  );
  blog.tags = tagRows.map(r => r.name);
  return blog;
}

async function getBlogBySlug(slug) {
  const { rows } = await db.query(`
    SELECT b.*, u.display_name AS author_display, u.username AS author_username, u.avatar AS author_avatar
    FROM blogs b JOIN users u ON b.author_id = u.id
    WHERE b.slug = $1
  `, [slug]);
  if (rows.length === 0) return null;
  const blog = rows[0];
  const { rows: tagRows } = await db.query(
    'SELECT t.name FROM tags t JOIN blog_tags bt ON t.id=bt.tag_id WHERE bt.blog_id=$1 ORDER BY t.name',
    [blog.id]
  );
  blog.tags = tagRows.map(r => r.name);
  return blog;
}

async function saveTags(blogId, tags) {
  await db.query('DELETE FROM blog_tags WHERE blog_id=$1', [blogId]);
  for (const raw of tags) {
    const name = raw.trim().slice(0, 100);
    if (!name) continue;
    await db.query('INSERT INTO tags(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [name]);
    const { rows:[t] } = await db.query('SELECT id FROM tags WHERE name=$1', [name]);
    await db.query('INSERT INTO blog_tags(blog_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [blogId, t.id]);
  }
}

function makeSlug(title) {
  return slugify(title, { lower: true, strict: true, trim: true }).slice(0, 180) + '-' + Date.now().toString(36);
}

function extractExcerpt(html) {
  const text = html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  return text.slice(0, 220) + (text.length > 220 ? '…' : '');
}

function calcReadTime(html) {
  const words = html.replace(/<[^>]+>/g,' ').trim().split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

// ═══════════════════════════════════════════════════
// GET /api/blogs — list with filters
// ═══════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { category, tag, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE dynamically — PostgreSQL positional params
    const conditions = ['b.published = TRUE'];
    const params = [];
    let p = 1;

    if (category && category !== 'all') {
      conditions.push(`b.category = $${p++}`);
      params.push(category);
    }
    if (tag) {
      conditions.push(`EXISTS (SELECT 1 FROM blog_tags bt JOIN tags t ON bt.tag_id=t.id WHERE bt.blog_id=b.id AND t.name=$${p++})`);
      params.push(tag);
    }
    if (search) {
      conditions.push(`(b.title ILIKE $${p} OR b.excerpt ILIKE $${p} OR u.display_name ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS total FROM blogs b JOIN users u ON b.author_id=u.id ${where}`,
      params
    );

    const { rows } = await db.query(`
      SELECT b.id, b.slug, b.title, b.excerpt, b.cover_image, b.category,
             b.read_time, b.views, b.likes, b.created_at, b.updated_at,
             u.display_name AS author_display, u.username AS author_username, u.avatar AS author_avatar
      FROM blogs b JOIN users u ON b.author_id=u.id
      ${where}
      ORDER BY b.created_at DESC
      LIMIT $${p} OFFSET $${p+1}
    `, [...params, parseInt(limit), offset]);

    for (const blog of rows) {
      const { rows: tagRows } = await db.query(
        'SELECT t.name FROM tags t JOIN blog_tags bt ON t.id=bt.tag_id WHERE bt.blog_id=$1',
        [blog.id]
      );
      blog.tags = tagRows.map(r => r.name);
    }

    res.json({ blogs: rows, total: parseInt(countRows[0].total), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('List blogs error:', err);
    res.status(500).json({ error: 'Failed to fetch blogs' });
  }
});

// GET /api/blogs/stats
router.get('/stats', async (req, res) => {
  try {
    const { rows: [{ totalblogs }] }   = await db.query(`SELECT COUNT(*) AS totalblogs FROM blogs WHERE published=TRUE`);
    const { rows: [{ totalauthors }] } = await db.query(`SELECT COUNT(DISTINCT author_id) AS totalauthors FROM blogs WHERE published=TRUE`);
    const { rows: [{ totalviews }] }   = await db.query(`SELECT COALESCE(SUM(views),0) AS totalviews FROM blogs WHERE published=TRUE`);
    const { rows: [{ totalusers }] }   = await db.query(`SELECT COUNT(*) AS totalusers FROM users`);
    const { rows: cats }  = await db.query(`SELECT category, COUNT(*) AS c FROM blogs WHERE published=TRUE GROUP BY category ORDER BY c DESC`);
    const { rows: tags }  = await db.query(`
      SELECT t.name, COUNT(*) AS c FROM tags t
      JOIN blog_tags bt ON t.id=bt.tag_id
      JOIN blogs b ON bt.blog_id=b.id
      WHERE b.published=TRUE
      GROUP BY t.name ORDER BY c DESC LIMIT 30
    `);
    res.json({
      totalBlogs:   parseInt(totalblogs),
      totalAuthors: parseInt(totalauthors),
      totalViews:   parseInt(totalviews),
      totalUsers:   parseInt(totalusers),
      categories:   cats,
      tags:         tags.map(t => t.name),
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Stats error' });
  }
});

// GET /api/blogs/admin/all
router.get('/admin/all', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { rows: blogs } = await db.query(`
      SELECT b.id, b.slug, b.title, b.category, b.views, b.likes, b.created_at,
             u.display_name AS author_display
      FROM blogs b JOIN users u ON b.author_id=u.id
      ORDER BY b.created_at DESC
    `);
    const { rows: users } = await db.query(
      'SELECT id, username, display_name, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ blogs, users });
  } catch (err) {
    res.status(500).json({ error: 'Admin data error' });
  }
});

// DELETE /api/blogs/admin/user/:id
router.delete('/admin/user/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.session.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
    await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Delete user error' });
  }
});

// GET /api/blogs/:slug
router.get('/:slug', async (req, res) => {
  try {
    const blog = await getBlogBySlug(req.params.slug);
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    await db.query('UPDATE blogs SET views=views+1 WHERE id=$1', [blog.id]);
    blog.views++;
    if (req.session.userId) {
      const { rows } = await db.query('SELECT 1 FROM blog_likes WHERE blog_id=$1 AND user_id=$2', [blog.id, req.session.userId]);
      blog.liked = rows.length > 0;
    } else {
      blog.liked = false;
    }
    res.json({ blog });
  } catch (err) {
    console.error('Get blog error:', err);
    res.status(500).json({ error: 'Failed to fetch blog' });
  }
});

// POST /api/blogs
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, content, category, tags = [], excerpt, cover_image } = req.body;
    if (!title?.trim())   return res.status(400).json({ error: 'Title is required' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const slug         = makeSlug(title);
    const finalExcerpt = excerpt?.trim() || extractExcerpt(content);
    const readTime     = calcReadTime(content);

    const { rows: [blog] } = await db.query(
      `INSERT INTO blogs (slug,title,excerpt,content,cover_image,category,author_id,read_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [slug, title.trim(), finalExcerpt, content, cover_image || null, category || 'General', req.session.userId, readTime]
    );
    await saveTags(blog.id, Array.isArray(tags) ? tags : String(tags).split(','));
    const full = await getBlogById(blog.id);
    res.status(201).json({ blog: full });
  } catch (err) {
    console.error('Create blog error:', err);
    res.status(500).json({ error: 'Failed to create blog' });
  }
});

// PUT /api/blogs/:id
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, tags = [], excerpt, cover_image } = req.body;

    const { rows } = await db.query('SELECT author_id FROM blogs WHERE id=$1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Blog not found' });
    if (rows[0].author_id !== req.session.userId && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to edit this blog' });
    }
    if (!title?.trim())   return res.status(400).json({ error: 'Title is required' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    const finalExcerpt = excerpt?.trim() || extractExcerpt(content);
    const readTime     = calcReadTime(content);

    await db.query(
      `UPDATE blogs SET title=$1,excerpt=$2,content=$3,cover_image=$4,category=$5,read_time=$6
       WHERE id=$7`,
      [title.trim(), finalExcerpt, content, cover_image || null, category || 'General', readTime, id]
    );
    await saveTags(id, Array.isArray(tags) ? tags : String(tags).split(','));
    const full = await getBlogById(id);
    res.json({ blog: full });
  } catch (err) {
    console.error('Update blog error:', err);
    res.status(500).json({ error: 'Failed to update blog' });
  }
});

// DELETE /api/blogs/:id
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT author_id FROM blogs WHERE id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Blog not found' });
    if (rows[0].author_id !== req.session.userId && req.session.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    await db.query('DELETE FROM blogs WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete blog' });
  }
});

// POST /api/blogs/:id/like
router.post('/:id/like', requireAuth, async (req, res) => {
  try {
    const blogId = req.params.id;
    const userId = req.session.userId;
    const { rows } = await db.query('SELECT 1 FROM blog_likes WHERE blog_id=$1 AND user_id=$2', [blogId, userId]);

    if (rows.length > 0) {
      await db.query('DELETE FROM blog_likes WHERE blog_id=$1 AND user_id=$2', [blogId, userId]);
      await db.query('UPDATE blogs SET likes=GREATEST(0,likes-1) WHERE id=$1', [blogId]);
      const { rows:[b] } = await db.query('SELECT likes FROM blogs WHERE id=$1', [blogId]);
      return res.json({ liked: false, likes: b.likes });
    } else {
      await db.query('INSERT INTO blog_likes(blog_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [blogId, userId]);
      await db.query('UPDATE blogs SET likes=likes+1 WHERE id=$1', [blogId]);
      const { rows:[b] } = await db.query('SELECT likes FROM blogs WHERE id=$1', [blogId]);
      return res.json({ liked: true, likes: b.likes });
    }
  } catch (err) {
    res.status(500).json({ error: 'Like error' });
  }
});

module.exports = router;
