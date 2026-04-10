# 🔗 SAP CPI Blog Platform — PostgreSQL Cloud Edition

Full-stack blog platform for the SAP CPI community.
**Node.js + Express + PostgreSQL** — works with any cloud Postgres provider.

---

## ☁️ Supported Cloud PostgreSQL Providers

| Provider  | Free Tier | URL Format |
|-----------|-----------|-----------|
| **Neon**     | ✅ 0.5 GB free | `postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require` |
| **Supabase** | ✅ 500 MB free | `postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres` |
| **Railway**  | ✅ $5 credit   | `postgresql://postgres:pass@host.railway.app:PORT/railway` |
| **Render**   | ✅ 90-day free | `postgresql://user:pass@host.render.com/dbname` |
| **Aiven**    | Trial        | `postgresql://user:pass@host.aivencloud.com:PORT/dbname?sslmode=require` |

---

## 🚀 Setup in 5 Steps

### Step 1 — Get a Free PostgreSQL Database

**Recommended: Neon (https://neon.tech)**
1. Sign up at neon.tech → Create Project → Copy the **Connection String**

**Or Supabase (https://supabase.com)**
1. New Project → Settings → Database → Copy **Connection string (URI)**

---

### Step 2 — Install Dependencies

```bash
cd sap-cpi-blog
npm install
```

---

### Step 3 — Configure `.env`

```env
# Paste your cloud connection string here:
DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@YOUR_HOST/YOUR_DB?sslmode=require

PORT=3000
SESSION_SECRET=pick-any-long-random-string-here-abc123
```

---

### Step 4 — Initialize Database

```bash
node server/setup-db.js
```

This creates all tables and seeds sample data automatically.

---

### Step 5 — Start

```bash
npm start
# or for development with auto-restart:
npm run dev
```

Open: **http://localhost:3000**

---

## 🔐 Default Login

| Username | Password  | Role  |
|----------|-----------|-------|
| admin    | admin123  | Admin |

> ⚠️ Change the password after first login via Admin Panel!

---

## 📁 Project Structure

```
sap-cpi-blog/
├── server/
│   ├── index.js          # Express entry point
│   ├── db.js             # PostgreSQL pool (pg)
│   ├── setup-db.js       # Table creation + seed
│   └── routes/
│       ├── auth.js       # Login / Register / Logout
│       ├── blogs.js      # Blog CRUD + likes + admin
│       └── upload.js     # Image uploads (Multer)
├── client/public/
│   ├── index.html        # Single-page app
│   ├── css/style.css
│   ├── js/app.js
│   └── images/uploads/   # Uploaded images
├── .env                  # ← Your DB config goes here
└── package.json
```

---

## 🗄️ Database Schema (PostgreSQL)

```sql
users      — id SERIAL, username, password (bcrypt), display_name, bio, avatar, role
blogs      — id SERIAL, slug UNIQUE, title, excerpt, content, cover_image, category,
             author_id FK, read_time, views, likes, published, timestamps
tags       — id SERIAL, name UNIQUE
blog_tags  — blog_id FK, tag_id FK  (many-to-many junction)
blog_likes — blog_id FK, user_id FK  (per-user like tracking)
```

---

## 🔧 API Reference

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login |
| POST | /api/auth/register | Register |
| POST | /api/auth/logout | Logout |
| GET  | /api/auth/me | Current session |

### Blogs
| Method | Path | Auth |
|--------|------|------|
| GET    | /api/blogs | Public |
| GET    | /api/blogs/stats | Public |
| GET    | /api/blogs/:slug | Public |
| POST   | /api/blogs | 🔒 Login |
| PUT    | /api/blogs/:id | 🔒 Owner/Admin |
| DELETE | /api/blogs/:id | 🔒 Owner/Admin |
| POST   | /api/blogs/:id/like | 🔒 Login |
| GET    | /api/blogs/admin/all | 🔒 Admin |
| DELETE | /api/blogs/admin/user/:id | 🔒 Admin |

### Upload
| Method | Path | Auth |
|--------|------|------|
| POST | /api/upload/image | 🔒 Login |

---

## 🌐 Deploying to Render / Railway

### Render (https://render.com)
1. Connect your GitHub repo
2. New → Web Service → select repo
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Add environment variables: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`

### Railway (https://railway.app)
1. New Project → Deploy from GitHub
2. Add a PostgreSQL plugin → copy `DATABASE_URL`
3. Set env vars in Variables tab
4. Deploy automatically on push

---

## ✨ Features

- 📝 Rich text editor (bold, italic, tables, code blocks, images, colors)
- 🖼️ Image uploads — cover images + inline in editor
- 🔍 Search & filter by category, tag, author
- ❤️ Per-user like tracking (stored in PostgreSQL)
- 👁️ View counter (auto-incremented)
- 🔒 bcrypt password hashing + session auth
- ⚙️ Admin dashboard — manage blogs & users
- 📱 Fully responsive dark UI

---

## 📄 License

MIT — Free to use and modify.
