// server/setup-db.js — Run once: node server/setup-db.js
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

async function setup() {
  let pool;
  try {
    // Connect — for cloud DBs the DB already exists, no need to CREATE DATABASE
    const cfg = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
      : {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT) || 5432,
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          database: process.env.DB_NAME || 'sap_cpi_blog',
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        };

    pool = new Pool(cfg);
    console.log('\n🔧 Setting up PostgreSQL database...\n');

    // ── Users ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id           SERIAL PRIMARY KEY,
        username     VARCHAR(50)  NOT NULL UNIQUE,
        password     VARCHAR(255) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        bio          TEXT,
        avatar       VARCHAR(10),
        role         VARCHAR(20)  NOT NULL DEFAULT 'author' CHECK (role IN ('admin','author')),
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    console.log('✅ users table ready');

    // ── Blogs ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blogs (
        id           SERIAL PRIMARY KEY,
        slug         VARCHAR(255) NOT NULL UNIQUE,
        title        VARCHAR(500) NOT NULL,
        excerpt      TEXT,
        content      TEXT NOT NULL,
        cover_image  VARCHAR(500),
        category     VARCHAR(100) NOT NULL DEFAULT 'General',
        author_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        read_time    INT NOT NULL DEFAULT 1,
        views        INT NOT NULL DEFAULT 0,
        likes        INT NOT NULL DEFAULT 0,
        published    BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blogs_slug     ON blogs(slug)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blogs_category ON blogs(category)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blogs_author   ON blogs(author_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_blogs_created  ON blogs(created_at DESC)`);
    console.log('✅ blogs table ready');

    // ── Tags ───────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id   SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_tags (
        blog_id INT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
        tag_id  INT NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
        PRIMARY KEY (blog_id, tag_id)
      )
    `);
    console.log('✅ tags tables ready');

    // ── Likes ──────────────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS blog_likes (
        blog_id    INT NOT NULL REFERENCES blogs(id) ON DELETE CASCADE,
        user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (blog_id, user_id)
      )
    `);
    console.log('✅ blog_likes table ready');

    // ── Updated_at trigger ─────────────────────────────────────────
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    for (const tbl of ['users', 'blogs']) {
      await pool.query(`DROP TRIGGER IF EXISTS set_updated_at ON ${tbl}`);
      await pool.query(`
        CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON ${tbl}
        FOR EACH ROW EXECUTE FUNCTION update_updated_at()
      `);
    }
    console.log('✅ auto updated_at triggers ready');

    // ── Seed admin ─────────────────────────────────────────────────
    const { rows: existing } = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    if (existing.length === 0) {
      const hash = await bcrypt.hash('admin123', 12);
      await pool.query(
        `INSERT INTO users (username, password, display_name, role, bio, avatar)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        ['admin', hash, 'Administrator', 'admin', 'SAP CPI Expert & Blog Administrator', 'A']
      );
      console.log('✅ Admin user created  (username: admin, password: admin123)');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    // ── Seed sample blogs ──────────────────────────────────────────
    const { rows: admRows } = await pool.query('SELECT id FROM users WHERE username = $1', ['admin']);
    const adminId = admRows[0].id;

    const { rows: cnt } = await pool.query('SELECT COUNT(*) AS c FROM blogs');
    if (parseInt(cnt[0].c) === 0) {
      const blog1 = `<h2>What is SAP CPI?</h2>
<p>SAP Cloud Platform Integration (SAP CPI), now part of SAP Integration Suite, is an integration platform-as-a-service (iPaaS) that allows enterprises to connect cloud and on-premise applications.</p>
<h2>Key Components</h2>
<ul>
  <li><strong>Integration Flows (iFlows)</strong> — Core building blocks</li>
  <li><strong>Adapters</strong> — Connectors for HTTP, SOAP, REST, SFTP and more</li>
  <li><strong>Message Transformations</strong> — Mapping and converting data formats</li>
  <li><strong>Security Features</strong> — OAuth, certificates, and encryption</li>
</ul>
<h2>Why Use SAP CPI?</h2>
<p>SAP CPI provides a robust, scalable platform for enterprise integration. It supports pre-built content packages, reducing development time significantly.</p>`;

      const { rows: [b1] } = await pool.query(
        `INSERT INTO blogs (slug,title,excerpt,content,category,author_id,read_time,views,likes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        ['getting-started-sap-cpi', "Getting Started with SAP CPI: A Beginner's Guide",
         'SAP Cloud Platform Integration is a powerful middleware solution. In this guide we explore the fundamentals.',
         blog1, 'Beginner', adminId, 5, 342, 24]
      );
      for (const name of ['SAP CPI','Integration','Getting Started','iPaaS']) {
        await pool.query('INSERT INTO tags(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [name]);
        const { rows:[t] } = await pool.query('SELECT id FROM tags WHERE name=$1', [name]);
        await pool.query('INSERT INTO blog_tags(blog_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [b1.id, t.id]);
      }

      const blog2 = `<h2>Introduction to Message Mapping</h2>
<p>Message mapping in SAP CPI transforms data from a source structure to a target structure — essential when integrating systems that use different data formats.</p>
<h2>Types of Mapping</h2>
<ul>
  <li><strong>Message Mapping</strong> — Graphical drag-and-drop mapping</li>
  <li><strong>XSLT Mapping</strong> — XML Stylesheet Language Transformations</li>
  <li><strong>Groovy Script</strong> — Custom scripting for complex transformations</li>
</ul>
<h2>Best Practices</h2>
<p>Always validate your mappings with test data before deploying to production. Use modular mapping functions to improve reusability.</p>`;

      const { rows: [b2] } = await pool.query(
        `INSERT INTO blogs (slug,title,excerpt,content,category,author_id,read_time,views,likes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        ['mastering-message-mapping-sap-cpi', 'Mastering Message Mapping in SAP CPI',
         'Message mapping is one of the most critical skills in SAP CPI. Learn how to transform data.',
         blog2, 'Advanced', adminId, 8, 489, 31]
      );
      for (const name of ['Message Mapping','Groovy','XSLT','Transformation']) {
        await pool.query('INSERT INTO tags(name) VALUES($1) ON CONFLICT(name) DO NOTHING', [name]);
        const { rows:[t] } = await pool.query('SELECT id FROM tags WHERE name=$1', [name]);
        await pool.query('INSERT INTO blog_tags(blog_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [b2.id, t.id]);
      }
      console.log('✅ Sample blogs seeded');
    }

    console.log('\n🎉 PostgreSQL setup complete!\n');
    console.log('Next steps:');
    console.log('  1. npm install');
    console.log('  2. npm start');
    console.log('  3. Open http://localhost:' + (process.env.PORT || 3000) + '\n');

  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    console.error('\nCheck your DATABASE_URL or DB_* settings in .env and try again.\n');
    process.exit(1);
  } finally {
    if (pool) await pool.end();
  }
}

setup();
