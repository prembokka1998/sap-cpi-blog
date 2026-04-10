// ═══════════════════════════════════════════════════════
//   SAP CPI BLOG — Frontend App (MySQL backend)
// ═══════════════════════════════════════════════════════
const App = {
  state: {
    user: null,
    blogs: [],
    stats: { totalBlogs: 0, totalAuthors: 0, totalViews: 0, totalUsers: 0, categories: [], tags: [] },
    filter: { category: 'all', tag: '', search: '' },
    currentBlog: null,
    editingBlog: null,
    view: 'home',
  },

  // ─── API helper ─────────────────────────────────────
  async api(method, path, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch('/api' + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // ─── Init ────────────────────────────────────────────
  async init() {
    // Restore session
    try {
      const { user } = await this.api('GET', '/auth/me');
      this.state.user = user;
    } catch(e) {}

    this.updateNavbar();
    await this.loadStats();
    await this.showView('home');

    // Search debounce
    let searchTimer;
    document.getElementById('search-input').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.state.filter.search = e.target.value.trim();
        this.loadBlogs();
      }, 350);
    });

    // Editor events
    document.getElementById('editor-body').addEventListener('keyup',  () => this.updateToolbarState());
    document.getElementById('editor-body').addEventListener('mouseup', () => this.updateToolbarState());
    document.getElementById('editor-body').addEventListener('input', () => {
      const words = (document.getElementById('editor-body').innerText || '').trim().split(/\s+/).filter(Boolean).length;
      document.getElementById('word-count').textContent = `${words} word${words !== 1 ? 's' : ''}`;
    });
    document.getElementById('editor-body').addEventListener('drop', e => {
      const f = e.dataTransfer?.files[0];
      if (f?.type.startsWith('image/')) { e.preventDefault(); this.uploadAndInsertImage(f); }
    });
    document.getElementById('editor-body').addEventListener('dragover', e => e.preventDefault());

    // Keyboard shortcuts in editor
    document.addEventListener('keydown', e => {
      if (document.activeElement.id !== 'editor-body') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); this.fmt('bold'); }
        if (e.key === 'i') { e.preventDefault(); this.fmt('italic'); }
        if (e.key === 'u') { e.preventDefault(); this.fmt('underline'); }
        if (e.key === 'k') { e.preventDefault(); this.insertLink(); }
        if (e.key === 's') { e.preventDefault(); this.saveBlog(); }
      }
    });

    // Cover upload
    document.getElementById('cover-file').addEventListener('change', e => {
      this.handleCoverFile(e.target.files[0]);
    });
    document.getElementById('cover-area').addEventListener('click', () => {
      document.getElementById('cover-file').click();
    });
    document.getElementById('cover-area')._src = '';
  },

  // ─── Views ──────────────────────────────────────────
  async showView(view, data) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`v-${view}`)?.classList.add('active');
    this.state.view = view;
    window.scrollTo(0, 0);

    if (view === 'home') {
      await this.loadBlogs();
      this.renderSidebar();
    } else if (view === 'blog' && data) {
      await this.renderBlog(data);
    } else if (view === 'editor') {
      this.setupEditor(data);
    } else if (view === 'admin') {
      await this.renderAdmin();
    }
  },

  // ─── Stats ──────────────────────────────────────────
  async loadStats() {
    try {
      this.state.stats = await this.api('GET', '/blogs/stats');
      document.getElementById('s-blogs').textContent   = this.state.stats.totalBlogs;
      document.getElementById('s-authors').textContent = this.state.stats.totalAuthors;
      const v = this.state.stats.totalViews;
      document.getElementById('s-views').textContent   = v > 999 ? (v/1000).toFixed(1)+'k' : v;
      document.getElementById('s-users').textContent   = this.state.stats.totalUsers;
    } catch(e) {}
  },

  // ─── Blog List ──────────────────────────────────────
  async loadBlogs() {
    const list = document.getElementById('blog-list');
    list.innerHTML = '<div class="loading">⏳ Loading blogs...</div>';
    try {
      const params = new URLSearchParams();
      if (this.state.filter.category !== 'all') params.set('category', this.state.filter.category);
      if (this.state.filter.tag)    params.set('tag', this.state.filter.tag);
      if (this.state.filter.search) params.set('search', this.state.filter.search);

      const { blogs } = await this.api('GET', '/blogs?' + params);
      this.state.blogs = blogs;

      if (blogs.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="ei">📝</div><h3>No blogs found</h3><p>Be the first to write about SAP CPI!</p>${this.state.user ? `<br><button class="btn btn-primary" onclick="App.showView('editor')">✍️ Write a Blog</button>` : ''}</div>`;
        return;
      }
      list.innerHTML = blogs.map(b => this.blogCardHTML(b)).join('');
    } catch(e) {
      list.innerHTML = `<div class="empty-state"><div class="ei">❌</div><h3>Failed to load blogs</h3><p>${e.message}</p></div>`;
    }
  },

  blogCardHTML(b) {
    return `<article class="blog-card" onclick="App.showView('blog','${b.slug}')">
      ${b.cover_image ? `<img class="card-cover" src="${b.cover_image}" alt="${b.title}" loading="lazy" onerror="this.style.display='none'">` : ''}
      <div class="card-meta">
        <span class="card-category">${b.category}</span>
        <span class="card-date">📅 ${this.fmtDate(b.created_at)}</span>
        <span class="card-readtime">⏱ ${b.read_time} min</span>
      </div>
      <h2 class="card-title">${b.title}</h2>
      <p class="card-excerpt">${b.excerpt || ''}</p>
      <div class="card-tags">${(b.tags||[]).slice(0,4).map(t=>`<span class="tag">#${t}</span>`).join('')}</div>
      <div class="card-footer" onclick="event.stopPropagation()">
        <div class="card-author">
          <div class="author-avatar-sm">${(b.author_display||'A')[0]}</div>
          <span>${b.author_display}</span>
        </div>
        <div class="card-stats">
          <span>👁 ${b.views}</span>
          <span>❤️ ${b.likes}</span>
        </div>
      </div>
    </article>`;
  },

  // ─── Sidebar ────────────────────────────────────────
  renderSidebar() {
    const { categories, tags } = this.state.stats;

    const catHtml = `<li class="cat-item ${this.state.filter.category==='all'?'active':''}" onclick="App.filterCat('all')">
      <span>All Posts</span><span class="cat-count">${this.state.stats.totalBlogs}</span></li>` +
      (categories||[]).map(c => `<li class="cat-item ${this.state.filter.category===c.category?'active':''}" onclick="App.filterCat('${c.category}')">
        <span>${c.category}</span><span class="cat-count">${c.c}</span></li>`).join('');
    document.getElementById('cat-list').innerHTML = catHtml;

    document.getElementById('tags-cloud').innerHTML = (tags||[]).map(t =>
      `<span class="tag-cloud-item" onclick="App.filterTag('${t}')">#${t}</span>`).join('');
  },

  filterCat(cat) { this.state.filter.category = cat; this.state.filter.tag = ''; this.loadBlogs(); this.renderSidebar(); },
  filterTag(tag) {
    this.state.filter.tag = this.state.filter.tag === tag ? '' : tag;
    this.state.filter.category = 'all';
    this.loadBlogs();
    this.renderSidebar();
  },

  // ─── Blog View ──────────────────────────────────────
  async renderBlog(slug) {
    const el = document.getElementById('blog-view-content');
    el.innerHTML = '<div class="loading">⏳ Loading...</div>';
    try {
      const { blog } = await this.api('GET', `/blogs/${slug}`);
      this.state.currentBlog = blog;

      const isOwner = this.state.user && (blog.author_username === this.state.user.username || this.state.user.role === 'admin');

      el.innerHTML = `
        <button class="back-btn" onclick="App.showView('home')">← Back to Blogs</button>
        <span class="blog-view-category">${blog.category}</span>
        <h1 class="blog-view-title">${blog.title}</h1>
        <div class="blog-view-meta">
          <div class="blog-view-author">
            <div class="author-avatar">${(blog.author_display||'A')[0]}</div>
            <div class="author-info">
              <div class="author-name">${blog.author_display}</div>
              <div class="author-date">Published ${this.fmtDate(blog.created_at)}${blog.updated_at!==blog.created_at?' · Updated '+this.fmtDate(blog.updated_at):''}</div>
            </div>
          </div>
          <span style="color:var(--text3);font-size:.8rem">⏱ ${blog.read_time} min read</span>
          <span style="color:var(--text3);font-size:.8rem">👁 ${blog.views} views</span>
          ${isOwner ? `<button class="btn btn-sm btn-secondary" onclick="App.editBlog()">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" onclick="App.deleteBlog('${blog.id}')">🗑 Delete</button>` : ''}
        </div>
        ${blog.cover_image ? `<img class="blog-view-cover" src="${blog.cover_image}" alt="${blog.title}" onerror="this.style.display='none'">` : ''}
        <div class="blog-view-content">${blog.content}</div>
        <div class="blog-view-tags">${(blog.tags||[]).map(t=>`<span class="tag">#${t}</span>`).join('')}</div>
        <div class="blog-view-actions">
          <button class="like-btn ${blog.liked?'liked':''}" id="like-btn" onclick="App.toggleLike('${blog.id}')">
            ${blog.liked?'❤️':'🤍'} <span id="like-count">${blog.likes}</span> Likes
          </button>
          <span style="margin-left:auto;color:var(--text3);font-size:.8rem">Share:</span>
          <button class="btn btn-sm btn-ghost" onclick="App.copyLink()">🔗 Copy Link</button>
        </div>`;
    } catch(e) {
      el.innerHTML = `<div class="empty-state"><div class="ei">❌</div><h3>Failed to load blog</h3><p>${e.message}</p><br><button class="btn btn-secondary" onclick="App.showView('home')">Go Back</button></div>`;
    }
  },

  async toggleLike(id) {
    if (!this.state.user) { this.openModal('login'); return; }
    try {
      const { liked, likes } = await this.api('POST', `/blogs/${id}/like`);
      const btn   = document.getElementById('like-btn');
      const count = document.getElementById('like-count');
      if (btn) { btn.className = `like-btn ${liked?'liked':''}`;  btn.innerHTML = `${liked?'❤️':'🤍'} <span id="like-count">${likes}</span> Likes`; }
    } catch(e) { this.toast(e.message, 'error'); }
  },

  copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => this.toast('Link copied!', 'success'));
  },

  editBlog() {
    if (!this.state.currentBlog) return;
    this.showView('editor', this.state.currentBlog);
  },

  async deleteBlog(id) {
    if (!confirm('Delete this blog? This cannot be undone.')) return;
    try {
      await this.api('DELETE', `/blogs/${id}`);
      this.toast('Blog deleted', 'info');
      await loadStats();
      this.showView('home');
    } catch(e) { this.toast(e.message, 'error'); }
  },

  // ─── Editor ─────────────────────────────────────────
  setupEditor(blog) {
    if (!this.state.user) { this.openModal('login'); return; }
    this.state.editingBlog = blog || null;

    document.getElementById('editor-heading').textContent = blog ? 'Edit Blog' : 'Write a New Blog';
    document.getElementById('save-btn-label').textContent = blog ? '💾 Update Blog' : '🚀 Publish Blog';

    document.getElementById('editor-title').value    = blog?.title    || '';
    document.getElementById('editor-cat').value      = blog?.category || 'General';
    document.getElementById('editor-tags-inp').value = blog ? (blog.tags||[]).join(', ') : '';
    document.getElementById('editor-excerpt').value  = blog?.excerpt  || '';
    document.getElementById('editor-body').innerHTML = blog?.content  || '';
    document.getElementById('word-count').textContent = '0 words';

    // Cover image
    const area = document.getElementById('cover-area');
    area._src = '';
    if (blog?.cover_image) {
      this.setCoverPreview(blog.cover_image);
    } else {
      this.clearCoverPreview();
    }
  },

  // Toolbar
  fmt(cmd, val) { document.getElementById('editor-body').focus(); document.execCommand(cmd, false, val || null); this.updateToolbarState(); },
  updateToolbarState() {
    ['bold','italic','underline','strikeThrough','insertUnorderedList','insertOrderedList'].forEach(cmd => {
      const btn = document.querySelector(`[data-cmd="${cmd}"]`);
      if (btn) btn.classList.toggle('active', document.queryCommandState(cmd));
    });
  },
  insertLink() {
    const url = prompt('Enter URL:', 'https://');
    if (url) this.fmt('createLink', url);
  },
  insertImgUrl() {
    const url = prompt('Image URL:', 'https://');
    if (url) this.fmt('insertHTML', `<img src="${url}" alt="image" style="max-width:100%"><p></p>`);
  },
  insertCode()  { this.fmt('insertHTML', '<pre><code>// code here</code></pre><p></p>'); },
  insertTable() { this.fmt('insertHTML', '<table><thead><tr><th>Col 1</th><th>Col 2</th><th>Col 3</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td><td>Cell</td></tr></tbody></table><p></p>'); },
  insertQuote() { this.fmt('insertHTML', '<blockquote>Quote here</blockquote><p></p>'); },
  insertHR()    { this.fmt('insertHTML', '<hr><p></p>'); },

  async uploadAndInsertImage(file) {
    if (!file?.type.startsWith('image/')) return;
    const form = new FormData();
    form.append('image', file);
    try {
      const res = await fetch('/api/upload/image', { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json();
      if (data.url) {
        document.getElementById('editor-body').focus();
        document.execCommand('insertHTML', false, `<img src="${data.url}" alt="image" style="max-width:100%"><p></p>`);
        this.toast('Image uploaded!', 'success');
      }
    } catch(e) { this.toast('Image upload failed', 'error'); }
  },

  handleEditorFileInput(input) {
    const f = input.files[0];
    if (f) this.uploadAndInsertImage(f);
  },

  async handleCoverFile(file) {
    if (!file?.type.startsWith('image/')) return;
    const form = new FormData();
    form.append('image', file);
    try {
      const res = await fetch('/api/upload/image', { method: 'POST', body: form, credentials: 'include' });
      const data = await res.json();
      if (data.url) this.setCoverPreview(data.url);
    } catch(e) { this.toast('Cover upload failed', 'error'); }
  },

  setCoverPreview(src) {
    const area = document.getElementById('cover-area');
    area._src = src;
    area.classList.add('has-img');
    area.innerHTML = `<img src="${src}" alt="Cover"><div style="text-align:center;padding:.4rem;font-size:.76rem;color:var(--text3)">Click to change</div>`;
  },

  clearCoverPreview() {
    const area = document.getElementById('cover-area');
    area._src = '';
    area.classList.remove('has-img');
    area.innerHTML = `<div style="font-size:1.8rem;margin-bottom:.4rem">🖼️</div><div class="cover-upload-hint"><strong>Click to upload</strong> a cover image</div><div class="cover-upload-hint" style="font-size:.72rem;margin-top:.2rem">PNG, JPG, GIF, WebP — max 5 MB</div>`;
  },

  async saveBlog() {
    const title   = document.getElementById('editor-title').value.trim();
    const content = document.getElementById('editor-body').innerHTML.trim();
    const category = document.getElementById('editor-cat').value;
    const tagsRaw = document.getElementById('editor-tags-inp').value;
    const excerpt = document.getElementById('editor-excerpt').value.trim();
    const cover   = document.getElementById('cover-area')._src || '';
    const tags    = tagsRaw.split(',').map(t=>t.trim()).filter(Boolean);

    if (!title)   { this.toast('Please add a title', 'error'); return; }
    if (!content || content === '<br>') { this.toast('Please write some content', 'error'); return; }

    const btn = document.getElementById('save-btn');
    btn.disabled = true;
    const orig = btn.innerHTML;
    btn.innerHTML = '⏳ Saving...';

    try {
      const payload = { title, content, category, tags, excerpt, cover_image: cover };
      let blog;
      if (this.state.editingBlog) {
        ({ blog } = await this.api('PUT', `/blogs/${this.state.editingBlog.id}`, payload));
        this.toast('Blog updated! ✨', 'success');
      } else {
        ({ blog } = await this.api('POST', '/blogs', payload));
        this.toast('Blog published! 🎉', 'success');
      }
      await this.loadStats();
      this.showView('blog', blog.slug);
    } catch(e) {
      this.toast(e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = orig;
    }
  },

  // ─── Admin ──────────────────────────────────────────
  async renderAdmin() {
    if (!this.state.user || this.state.user.role !== 'admin') { this.showView('home'); return; }
    try {
      const { blogs, users } = await this.api('GET', '/blogs/admin/all');
      await this.loadStats();
      const s = this.state.stats;

      document.getElementById('admin-stats').innerHTML = `
        <div class="admin-stat"><div class="stat-num">${s.totalBlogs}</div><div class="stat-label">Total Blogs</div></div>
        <div class="admin-stat"><div class="stat-num">${s.totalUsers}</div><div class="stat-label">Members</div></div>
        <div class="admin-stat"><div class="stat-num">${s.totalViews}</div><div class="stat-label">Total Views</div></div>
        <div class="admin-stat"><div class="stat-num">${blogs.reduce((a,b)=>a+b.likes,0)}</div><div class="stat-label">Total Likes</div></div>`;

      document.getElementById('admin-blogs-body').innerHTML = blogs.length === 0
        ? `<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:2rem">No blogs yet</td></tr>`
        : blogs.map(b => `<tr>
            <td style="color:var(--text);font-weight:500;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.title}</td>
            <td>${b.author_display}</td>
            <td><span class="badge badge-green">Published</span></td>
            <td style="text-align:center">${b.views}</td>
            <td style="text-align:center">${b.likes}</td>
            <td><div style="display:flex;gap:.35rem">
              <button class="btn btn-sm btn-secondary" onclick="App.adminEditBlog('${b.slug}')">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="App.adminDelBlog('${b.id}')">Delete</button>
            </div></td></tr>`).join('');

      document.getElementById('admin-users-body').innerHTML = users.map(u => `<tr>
        <td style="color:var(--text);font-weight:500">${u.display_name}</td>
        <td style="color:var(--text3)">@${u.username}</td>
        <td><span class="badge ${u.role==='admin'?'badge-green':'badge-amber'}">${u.role}</span></td>
        <td>${this.fmtDate(u.created_at)}</td>
        <td>${u.id !== this.state.user.id
          ? `<button class="btn btn-sm btn-danger" onclick="App.adminDelUser(${u.id},'${u.username}')">Remove</button>`
          : '<span style="color:var(--text3);font-size:.76rem">You</span>'}</td></tr>`).join('');
    } catch(e) {
      this.toast('Admin load error: ' + e.message, 'error');
    }
  },

  async adminEditBlog(slug) {
    try {
      const { blog } = await this.api('GET', `/blogs/${slug}`);
      this.showView('editor', blog);
    } catch(e) { this.toast(e.message, 'error'); }
  },

  async adminDelBlog(id) {
    if (!confirm('Delete this blog?')) return;
    try { await this.api('DELETE', `/blogs/${id}`); this.toast('Deleted', 'info'); this.renderAdmin(); }
    catch(e) { this.toast(e.message, 'error'); }
  },

  async adminDelUser(id, name) {
    if (!confirm(`Remove @${name}?`)) return;
    try { await this.api('DELETE', `/blogs/admin/user/${id}`); this.toast('User removed', 'info'); this.renderAdmin(); }
    catch(e) { this.toast(e.message, 'error'); }
  },

  // ─── Auth Modal ─────────────────────────────────────
  openModal(tab) {
    document.getElementById('auth-overlay').classList.add('open');
    this.switchTab(tab || 'login');
    document.getElementById('auth-err').textContent = '';
    document.getElementById('auth-err').className = 'form-error';
  },
  closeModal() { document.getElementById('auth-overlay').classList.remove('open'); },

  switchTab(tab) {
    document.getElementById('tab-login').classList.toggle('active', tab==='login');
    document.getElementById('tab-register').classList.toggle('active', tab==='register');
    document.getElementById('login-form').style.display   = tab==='login'    ? 'block' : 'none';
    document.getElementById('register-form').style.display = tab==='register' ? 'block' : 'none';
    document.getElementById('auth-err').textContent = '';
  },

  async handleLogin() {
    const username = document.getElementById('l-user').value.trim();
    const password = document.getElementById('l-pass').value;
    const err = document.getElementById('auth-err');
    if (!username || !password) { err.textContent='Please fill in all fields'; err.className='form-error show'; return; }
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Logging in...';
    try {
      const { user } = await this.api('POST', '/auth/login', { username, password });
      this.state.user = user;
      this.updateNavbar();
      this.closeModal();
      this.toast(`Welcome back, ${user.display_name}! 👋`, 'success');
      this.loadBlogs(); this.renderSidebar();
    } catch(e) { err.textContent = e.message; err.className = 'form-error show'; }
    finally { btn.disabled = false; btn.textContent = 'Login'; }
  },

  async handleRegister() {
    const username = document.getElementById('r-user').value.trim();
    const display  = document.getElementById('r-name').value.trim();
    const password = document.getElementById('r-pass').value;
    const confirm  = document.getElementById('r-conf').value;
    const bio      = document.getElementById('r-bio').value.trim();
    const err = document.getElementById('auth-err');
    if (!username||!password||!confirm) { err.textContent='Fill in required fields'; err.className='form-error show'; return; }
    if (password !== confirm) { err.textContent='Passwords do not match'; err.className='form-error show'; return; }
    const btn = document.getElementById('register-btn');
    btn.disabled=true; btn.textContent='Creating...';
    try {
      const { user } = await this.api('POST', '/auth/register', { username, password, display_name: display, bio });
      this.state.user = user;
      this.updateNavbar();
      this.closeModal();
      this.toast(`Welcome, ${user.display_name}! 🎉`, 'success');
      await this.loadStats(); this.loadBlogs(); this.renderSidebar();
    } catch(e) { err.textContent=e.message; err.className='form-error show'; }
    finally { btn.disabled=false; btn.textContent='Create Account'; }
  },

  async logout() {
    try { await this.api('POST', '/auth/logout'); } catch(e) {}
    this.state.user = null;
    this.updateNavbar();
    this.showView('home');
    this.toast('Logged out', 'info');
  },

  // ─── Navbar ─────────────────────────────────────────
  updateNavbar() {
    const area = document.getElementById('nav-user-area');
    const u = this.state.user;
    const writeBtn = document.getElementById('write-nav-btn');
    if (writeBtn) writeBtn.style.display = u ? 'inline-block' : 'none';

    if (u) {
      area.innerHTML = `<div class="nav-user">
        ${u.role==='admin' ? `<button style="background:none;border:none;color:var(--text3);font-family:'Sora',sans-serif;font-size:.85rem;font-weight:500;padding:.4rem .85rem;border-radius:8px;cursor:pointer" onmouseover="this.style.color='var(--text)';this.style.background='var(--surface)'" onmouseout="this.style.color='var(--text3)';this.style.background='none'" onclick="App.showView('admin')">⚙ Admin</button>` : ''}
        <div class="nav-avatar" title="${u.display_name}">${u.avatar || u.display_name[0]}</div>
        <button class="btn btn-sm btn-secondary" onclick="App.logout()">Logout</button>
      </div>`;
    } else {
      area.innerHTML = `<div style="display:flex;gap:.5rem">
        <button class="btn btn-sm btn-ghost" onclick="App.openModal('login')">Login</button>
        <button class="btn btn-sm btn-primary" onclick="App.openModal('register')">Sign Up</button>
      </div>`;
    }
  },

  // ─── Toast ──────────────────────────────────────────
  toast(msg, type='info') {
    const icons = { success:'✅', error:'❌', info:'ℹ️' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type]||'ℹ️'}</span><span>${msg}</span>`;
    document.getElementById('toast-wrap').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  },

  // ─── Helpers ────────────────────────────────────────
  fmtDate(iso) {
    return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' });
  },
};

window.App = App;
document.addEventListener('DOMContentLoaded', () => App.init());
