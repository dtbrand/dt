/**
 * Cloudflare Edge Admin Console (/admin) backed directly by Cloudflare D1, KV/R2, and Email APIs.
 */

export function renderAdminConsoleHtml(origin) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Console — DT Brand's &amp; Jai Hanuman Tex</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
    <style>
        *, *::before, *::after { box-sizing: border-box; }
        body {
            margin: 0;
            background: #FAF5E8;
            color: #111827;
            font-family: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
            -webkit-font-smoothing: antialiased;
            letter-spacing: -0.011em;
        }
        .adm-topbar {
            background: linear-gradient(135deg, #181512 0%, #2A241E 100%);
            color: #FAF5E8;
            padding: 14px 24px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #D4AF37;
            flex-wrap: wrap;
            gap: 12px;
        }
        .adm-brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 1.05rem; }
        .adm-badge {
            display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
            border-radius: 999px; font-size: 0.72rem; font-weight: 700;
            background: rgba(212,175,55,0.18); color: #F5D77A; border: 1px solid #8A681F;
        }
        .adm-wrap { max-width: 1240px; margin: 0 auto; padding: 24px 18px 60px; }
        .adm-card {
            background: #FFFFFF; border: 1px solid #E5DEC9; border-radius: 14px;
            padding: 20px; box-shadow: 0 6px 24px rgba(17,24,39,0.05); margin-bottom: 18px;
        }
        .adm-btn-gold {
            display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px;
            border-radius: 9px; border: 1px solid #8A681F; cursor: pointer;
            background: linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #E6CA65 100%);
            color: #111827; font-weight: 800; font-size: 0.85rem; text-decoration: none;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 8px rgba(184,134,11,0.35);
        }
        .adm-btn-dark {
            display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px;
            border-radius: 9px; border: 1.2px solid #8A681F; cursor: pointer;
            background: linear-gradient(135deg, #181512 0%, #2A241E 100%);
            color: #FAF5E8; font-weight: 700; font-size: 0.85rem; text-decoration: none;
        }
        .adm-btn-pale {
            display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px;
            border-radius: 8px; border: 1px solid #D4AF37; cursor: pointer;
            background: #FAF5E8; color: #705114; font-weight: 700; font-size: 0.8rem;
        }
        .adm-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 18px; }
        .adm-kpi { background: #FFFFFF; border: 1px solid #E5DEC9; border-radius: 12px; padding: 16px; }
        .adm-kpi-label { font-size: 0.75rem; color: #64748B; font-weight: 600; text-transform: uppercase; }
        .adm-kpi-val { font-size: 1.45rem; font-weight: 800; color: #111827; margin-top: 6px; display: flex; align-items: center; gap: 4px; }
        .adm-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
        .adm-tab.active { background: linear-gradient(135deg, #B8860B, #D4AF37); color: #111827; border-color: #8A681F; }
        .adm-table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; min-width: 700px; font-size: 0.85rem; }
        th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #EFEADF; }
        th { font-size: 0.75rem; text-transform: uppercase; color: #64748B; font-weight: 700; background: #FDFBF5; }
        input, select, textarea {
            width: 100%; padding: 10px 12px; border: 1.5px solid #D6CCB5; border-radius: 8px;
            font-family: inherit; font-size: 0.88rem; color: #111827; background: #FFFFFF;
        }
        .adm-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 12px; }
        .adm-pill-ok { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; background: #DCFCE7; color: #15803D; }
        .adm-pill-warn { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; background: #FEF3C7; color: #B45309; }
    </style>
</head>
<body>
<header class="adm-topbar">
    <div class="adm-brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
        <span>DT Brand's — Cloudflare Edge Admin</span>
        <span class="adm-badge">D1 SQL + KV Storage</span>
    </div>
    <div style="display:flex;gap:10px;align-items:center;">
        <a class="adm-btn-pale" href="${origin}/">View Storefront</a>
        <button id="btnAdminLogout" class="adm-btn-dark" style="display:none;" onclick="adminLogout()">Sign Out</button>
    </div>
</header>

<main class="adm-wrap">
    <section id="authCard" class="adm-card" style="max-width:460px;margin:40px auto;display:none;">
        <h2 id="authHeading" style="margin:0 0 6px;">Admin Sign In</h2>
        <p id="authSub" style="margin:0 0 18px;font-size:0.86rem;color:#64748B;">Manage your Cloudflare D1 database, products, orders, storage, and email.</p>
        <form id="adminAuthForm" onsubmit="submitAdminAuth(event)">
            <div id="nameGroup" style="margin-bottom:12px;display:none;">
                <label style="font-size:0.78rem;font-weight:700;display:block;margin-bottom:4px;">Admin Name</label>
                <input id="admName" type="text" value="DT Brand Admin" />
            </div>
            <div style="margin-bottom:12px;">
                <label style="font-size:0.78rem;font-weight:700;display:block;margin-bottom:4px;">Email</label>
                <input id="admEmail" type="email" placeholder="admin@yourdomain.com" required />
            </div>
            <div style="margin-bottom:16px;">
                <label style="font-size:0.78rem;font-weight:700;display:block;margin-bottom:4px;">Password</label>
                <input id="admPass" type="password" placeholder="Minimum 8 characters" required />
            </div>
            <button type="submit" class="adm-btn-gold" style="width:100%;justify-content:center;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                <span id="authBtnText">Sign In</span>
            </button>
            <div id="authMsg" style="margin-top:10px;font-size:0.84rem;color:#DC2626;font-weight:600;"></div>
        </form>
    </section>

    <section id="dashPanel" style="display:none;">
        <div class="adm-grid" id="kpiGrid"></div>

        <div class="adm-tabs">
            <button class="adm-btn-pale adm-tab active" onclick="showTab('products', this)">Products &amp; SQL</button>
            <button class="adm-btn-pale adm-tab" onclick="showTab('orders', this)">Orders &amp; Dispatch</button>
            <button class="adm-btn-pale adm-tab" onclick="showTab('storage', this)">Cloud Storage (KV/R2)</button>
            <button class="adm-btn-pale adm-tab" onclick="showTab('email', this)">Email &amp; Notifications</button>
            <button class="adm-btn-pale adm-tab" onclick="showTab('system', this)">D1 Tables &amp; API Map</button>
        </div>

        <div id="tab-products" class="adm-card">
            <h3 style="margin:0 0 12px;">Add New Product (Writes directly to D1 SQL)</h3>
            <form onsubmit="createProduct(event)" class="adm-form-grid">
                <input id="pTitle" placeholder="Product Title" required />
                <input id="pSku" placeholder="SKU (e.g. KJR-101)" required />
                <input id="pCat" placeholder="Category (e.g. Kanjivaram Silk)" value="Kanjivaram Silk" required />
                <input id="pRetail" type="number" placeholder="Retail Price (₹)" required />
                <input id="pWholesale" type="number" placeholder="Wholesale Price (₹)" required />
                <input id="pStock" type="number" placeholder="Stock Qty" value="50" required />
                <button type="submit" class="adm-btn-gold">+ Add Product</button>
            </form>
            <div class="adm-table-wrap" id="productsTable"></div>
        </div>

        <div id="tab-orders" class="adm-card" style="display:none;">
            <h3 style="margin:0 0 12px;">Live Orders (Cloudflare D1)</h3>
            <div class="adm-table-wrap" id="ordersTable"></div>
        </div>

        <div id="tab-storage" class="adm-card" style="display:none;">
            <h3 style="margin:0 0 12px;">Cloudflare Storage Upload &amp; Backups</h3>
            <form onsubmit="uploadMediaFile(event)" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px;">
                <input id="mediaFileInput" type="file" accept="image/*,application/pdf" style="max-width:320px;" required />
                <button type="submit" class="adm-btn-gold">Upload to Cloud Storage</button>
                <button type="button" class="adm-btn-dark" onclick="runCloudBackup()">Create D1 Cloud Backup</button>
            </form>
            <div id="storageStatus" style="margin-bottom:12px;font-size:0.85rem;"></div>
            <div class="adm-table-wrap" id="mediaTable"></div>
        </div>

        <div id="tab-email" class="adm-card" style="display:none;">
            <h3 style="margin:0 0 12px;">Transactional Email &amp; Outbox</h3>
            <form onsubmit="sendTestEmail(event)" class="adm-form-grid">
                <input id="emTo" type="email" placeholder="Recipient Email" required />
                <input id="emSubject" placeholder="Subject" value="DT Brand's Storefront Test Email" required />
                <input id="emBody" placeholder="Message body" value="Live transactional email check from Cloudflare Workers." required />
                <button type="submit" class="adm-btn-gold">Dispatch Email</button>
            </form>
            <div id="emailStatus" style="margin-bottom:12px;font-size:0.85rem;"></div>
            <div class="adm-table-wrap" id="emailTable"></div>
        </div>

        <div id="tab-system" class="adm-card" style="display:none;">
            <h3 style="margin:0 0 12px;">Cloudflare Services, D1 Tables &amp; API Directory</h3>
            <div id="systemStats"></div>
        </div>
    </section>
</main>

<script>
const ORIGIN = ${JSON.stringify(origin)};
let needsSetup = false;

async function initAdmin() {
    const res = await fetch('/api/auth.php?action=admin_status', { credentials: 'same-origin' }).then(r => r.json());
    if (res.admin_authenticated) {
        document.getElementById('authCard').style.display = 'none';
        document.getElementById('dashPanel').style.display = 'block';
        document.getElementById('btnAdminLogout').style.display = 'inline-flex';
        loadDashboard();
    } else {
        needsSetup = Boolean(res.needs_setup);
        document.getElementById('authCard').style.display = 'block';
        if (needsSetup) {
            document.getElementById('authHeading').textContent = 'Create Super Admin Account';
            document.getElementById('authSub').textContent = 'One-time setup stored securely in Cloudflare D1.';
            document.getElementById('nameGroup').style.display = 'block';
            document.getElementById('authBtnText').textContent = 'Initialize Admin';
        }
    }
}

async function submitAdminAuth(e) {
    e.preventDefault();
    const action = needsSetup ? 'admin_setup' : 'admin_login';
    const payload = {
        name: document.getElementById('admName').value,
        email: document.getElementById('admEmail').value,
        password: document.getElementById('admPass').value
    };
    const res = await fetch('/api/auth.php?action=' + action, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(r => r.json());
    if (res.success) { location.reload(); }
    else { document.getElementById('authMsg').textContent = res.message || 'Authentication failed'; }
}

async function adminLogout() {
    await fetch('/api/auth.php?action=admin_logout', { method: 'POST', credentials: 'same-origin' });
    location.reload();
}

function showTab(name, btn) {
    document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');
    document.getElementById('tab-' + name).style.display = 'block';
    document.querySelectorAll('.adm-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

const rupeeSvg = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3a4 4 0 0 0 0-8"></path></svg>';

async function loadDashboard() {
    const [rep, prods, ords, media, notif, dbAudit] = await Promise.all([
        fetch('/api/reports.php?action=stats', { credentials: 'same-origin' }).then(r => r.json()),
        fetch('/api/products.php', { credentials: 'same-origin' }).then(r => r.json()),
        fetch('/api/orders.php', { credentials: 'same-origin' }).then(r => r.json()),
        fetch('/api/media/index.php', { credentials: 'same-origin' }).then(r => r.json()),
        fetch('/api/notifications.php', { credentials: 'same-origin' }).then(r => r.json()),
        fetch('/api/db_audit.php', { credentials: 'same-origin' }).then(r => r.json()),
    ]);
    const d = rep.data || {};
    document.getElementById('kpiGrid').innerHTML =
        '<div class="adm-kpi"><div class="adm-kpi-label">Revenue (D1)</div><div class="adm-kpi-val">' + rupeeSvg + Number(d.revenue || 0).toLocaleString('en-IN') + '</div></div>' +
        '<div class="adm-kpi"><div class="adm-kpi-label">Total Orders</div><div class="adm-kpi-val">' + (d.total_orders || 0) + '</div></div>' +
        '<div class="adm-kpi"><div class="adm-kpi-label">Active Products</div><div class="adm-kpi-val">' + (d.total_products || 0) + '</div></div>' +
        '<div class="adm-kpi"><div class="adm-kpi-label">D1 SQL Tables</div><div class="adm-kpi-val">' + (dbAudit.table_count || 0) + '</div></div>';

    document.getElementById('productsTable').innerHTML = '<table><thead><tr><th>ID</th><th>SKU</th><th>Title</th><th>Category</th><th>Retail</th><th>Wholesale</th><th>Stock</th><th>Action</th></tr></thead><tbody>' +
        (prods.products || []).map(p => '<tr><td>' + p.id + '</td><td>' + p.sku + '</td><td>' + p.title + '</td><td>' + p.category_name + '</td><td>₹' + p.retail_price + '</td><td>₹' + (p.wholesale_price || p.retail_price) + '</td><td>' + p.stock_qty + '</td><td><button class="adm-btn-pale" onclick="delProduct(' + p.id + ')">Delete</button></td></tr>').join('') + '</tbody></table>';

    document.getElementById('ordersTable').innerHTML = '<table><thead><tr><th>Order #</th><th>Customer</th><th>Phone</th><th>Channel</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>' +
        (ords.orders || []).map(o => '<tr><td>' + o.order_number + '</td><td>' + o.customer_name + '</td><td>' + o.customer_phone + '</td><td>' + o.channel + '</td><td>₹' + o.total_amount + '</td><td><span class="adm-pill-ok">' + o.fulfillment_status + '</span></td><td><button class="adm-btn-pale" onclick="markDispatched(\'' + o.order_number + '\')">Mark Dispatched</button></td></tr>').join('') + '</tbody></table>';

    const svc = media.services || {};
    document.getElementById('storageStatus').innerHTML = 'Active backends: D1=<b>' + svc.d1 + '</b> | KV=<b>' + svc.kv + '</b> | R2=<b>' + svc.r2 + '</b>';
    document.getElementById('mediaTable').innerHTML = '<table><thead><tr><th>Key</th><th>Filename</th><th>Type</th><th>Size</th><th>Backend</th><th>URL</th></tr></thead><tbody>' +
        (media.files || []).map(f => '<tr><td>' + f.file_key + '</td><td>' + f.filename + '</td><td>' + f.content_type + '</td><td>' + f.size_bytes + ' B</td><td>' + f.storage_backend + '</td><td><a href="' + f.public_url + '" target="_blank">Open</a></td></tr>').join('') + '</tbody></table>';

    document.getElementById('emailTable').innerHTML = '<table><thead><tr><th>To</th><th>Subject</th><th>Provider</th><th>Status</th><th>Note</th></tr></thead><tbody>' +
        (notif.outbox || []).map(e => '<tr><td>' + e.to_email + '</td><td>' + e.subject + '</td><td>' + e.provider + '</td><td><span class="' + (e.status === 'sent' ? 'adm-pill-ok' : 'adm-pill-warn') + '">' + e.status + '</span></td><td>' + (e.error_message || 'Delivered') + '</td></tr>').join('') + '</tbody></table>';

    document.getElementById('systemStats').innerHTML = '<p><strong>D1 Tables (' + (dbAudit.table_count || 0) + '):</strong></p><table><thead><tr><th>Table Name</th><th>Rows</th></tr></thead><tbody>' +
        (dbAudit.tables || []).map(t => '<tr><td>' + t.table + '</td><td>' + t.rows + '</td></tr>').join('') + '</tbody></table>';
}

async function createProduct(e) {
    e.preventDefault();
    await fetch('/api/products.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'create',
            title: document.getElementById('pTitle').value,
            sku: document.getElementById('pSku').value,
            category_name: document.getElementById('pCat').value,
            retail_price: Number(document.getElementById('pRetail').value),
            wholesale_price: Number(document.getElementById('pWholesale').value),
            stock_qty: Number(document.getElementById('pStock').value)
        })
    });
    loadDashboard();
}

async function delProduct(id) {
    await fetch('/api/products.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
    });
    loadDashboard();
}

async function markDispatched(orderNumber) {
    await fetch('/api/orders.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_status', order_number: orderNumber, status: 'dispatched' })
    });
    loadDashboard();
}

async function uploadMediaFile(e) {
    e.preventDefault();
    const file = document.getElementById('mediaFileInput').files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload.php', { method: 'POST', credentials: 'same-origin', body: fd }).then(r => r.json());
    document.getElementById('storageStatus').innerHTML = res.success ? 'Uploaded: <a href="' + res.url + '" target="_blank">' + res.url + '</a> (' + res.storage_backend + ')' : (res.message || 'Upload failed');
    loadDashboard();
}

async function runCloudBackup() {
    const res = await fetch('/api/system/backup.php', { method: 'POST', credentials: 'same-origin' }).then(r => r.json());
    document.getElementById('storageStatus').innerHTML = res.success ? 'Backup saved: <a href="' + res.backup.url + '" target="_blank">' + res.backup.file_key + '</a>' : 'Backup failed';
    loadDashboard();
}

async function sendTestEmail(e) {
    e.preventDefault();
    const res = await fetch('/api/notifications.php', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'send_test',
            recipient: document.getElementById('emTo').value,
            subject: document.getElementById('emSubject').value,
            content: document.getElementById('emBody').value
        })
    }).then(r => r.json());
    document.getElementById('emailStatus').textContent = 'Status: ' + res.status + ' (' + res.provider + ')' + (res.note ? ' — ' + res.note : '');
    loadDashboard();
}

initAdmin();
</script>
</body>
</html>`;
}
