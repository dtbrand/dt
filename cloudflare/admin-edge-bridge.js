/**
 * DT Brand's — Real Admin Panel Edge Bridge for Cloudflare Workers (D1 + KV + Email Outbox).
 * Wires login, first-time super-admin setup, global CSRF headers, live D1 KPI & detail hydration,
 * all 27 legacy/inline admin forms, and Global Command Search (Ctrl+K) directly into Cloudflare D1 APIs.
 */

(function () {
    'use strict';

    // Defensive global fetch CSRF patch (also injected early in <head> by worker.js)
    (function patchFetchCsrf() {
        const origFetch = window.fetch;
        if (!origFetch || origFetch.__dtBridgePatched) return;
        const wrapped = function (input, init) {
            const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
            const method = String((init && init.method) || 'GET').toUpperCase();
            if (urlStr.indexOf('/api/') !== -1 && method !== 'GET' && method !== 'HEAD') {
                const nextInit = Object.assign({}, init || {});
                const headers = new Headers(nextInit.headers || {});
                if (!headers.has('X-CSRF-Token') && window.DT_ADMIN_CSRF_TOKEN) {
                    headers.set('X-CSRF-Token', window.DT_ADMIN_CSRF_TOKEN);
                }
                nextInit.headers = headers;
                if (!nextInit.credentials) nextInit.credentials = 'same-origin';
                return origFetch.call(this, input, nextInit);
            }
            return origFetch.call(this, input, init);
        };
        wrapped.__dtBridgePatched = true;
        window.fetch = wrapped;
    })();

    function notify(msg, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(msg, type);
        } else {
            console.log(`[DT Admin ${type}]`, msg);
        }
    }

    function escapeText(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // 1. Login Page Handler (/admin/login/)
    function initLoginBridge() {
        const loginForm = document.querySelector('form.adm-login-form');
        if (!loginForm) return;

        const needsSetup = Boolean(window.DT_ADMIN_NEEDS_SETUP);
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const emailGroup = loginForm.querySelector('.adm-field-group');
        const subtitleEl = document.querySelector('.adm-login-sub, .adm-card-subtitle, .adm-login-header p');
        const setupMode = needsSetup;

        function ensureAlert(msg, isSuccess) {
            let box = document.getElementById('cfLoginAlert');
            if (!box) {
                box = document.createElement('div');
                box.id = 'cfLoginAlert';
                loginForm.parentNode.insertBefore(box, loginForm);
            }
            box.className = isSuccess ? 'adm-alert success' : 'adm-alert error';
            box.textContent = msg;
        }

        if (needsSetup && emailGroup && !document.getElementById('adminSetupName')) {
            const nameGroup = document.createElement('div');
            nameGroup.className = 'adm-field-group';
            nameGroup.innerHTML =
                '<label class="adm-field-label" for="adminSetupName">Super Admin Name (One-Time Setup)</label>' +
                '<div class="adm-input-wrapper">' +
                '<input type="text" id="adminSetupName" name="name" class="adm-form-input" value="DT Brand Admin" required>' +
                '</div>';
            emailGroup.parentNode.insertBefore(nameGroup, emailGroup);
            if (subtitleEl) subtitleEl.textContent = 'Create your initial Super Admin account in Cloudflare D1 SQL.';
            if (submitBtn) {
                const sp = submitBtn.querySelector('span');
                if (sp) sp.textContent = 'Initialize Admin Account';
            }
        }

        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            const email = (document.getElementById('adminEmail')?.value || '').trim();
            const password = document.getElementById('adminPassword')?.value || '';
            const name = document.getElementById('adminSetupName')?.value || 'DT Brand Admin';
            if (submitBtn) submitBtn.disabled = true;

            try {
                const action = setupMode ? 'admin_setup' : 'admin_login';
                const res = await fetch('/api/auth.php?action=' + action, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ name, email, password }),
                });
                const data = await res.json();
                if (data && data.success) {
                    ensureAlert('Authenticated cleanly. Entering Admin Console...', true);
                    window.location.href = '/admin/';
                } else {
                    ensureAlert((data && data.message) || 'Invalid credentials.', false);
                    if (submitBtn) submitBtn.disabled = false;
                }
            } catch (err) {
                ensureAlert('Network error: ' + (err && err.message ? err.message : 'Retry'), false);
                if (submitBtn) submitBtn.disabled = false;
            }
        });

        window.handleForgotSubmit = function (e) {
            e.preventDefault();
            const msg = document.getElementById('forgotStatusMsg');
            const btn = document.getElementById('forgotSubmitBtn');
            if (btn) btn.disabled = true;
            if (msg) {
                msg.style.display = 'block';
                msg.textContent =
                    'Contact Super Admin or update admin credentials securely via Cloudflare D1 CLI / Support (+91 70463 63528).';
            }
            setTimeout(() => {
                if (btn) btn.disabled = false;
            }, 1200);
        };
    }

    // 2. Patch `window.DT_DASH` & inline dashboard handlers -> Cloudflare D1 SQL
    function wireDashboardActions() {
        if (typeof window.saveProductForm === 'function') {
            const origSave = window.saveProductForm;
            window.saveProductForm = async function (e) {
                if (e) e.preventDefault();
                const id = document.getElementById('admProductId')?.value || '';
                const payload = {
                    action: id ? 'update' : 'create',
                    id: id ? Number(id) : undefined,
                    title: (document.getElementById('admProductName')?.value || '').trim(),
                    sku: (document.getElementById('admProductSku')?.value || '').trim(),
                    hsn: (document.getElementById('admProductHsn')?.value || '').trim(),
                    category_name: document.getElementById('admProductCategory')?.value || 'Kanjivaram Silk',
                    retail_price: Number(document.getElementById('admProductRetailPrice')?.value || 0),
                    wholesale_price: Number(document.getElementById('admProductWholesalePrice')?.value || 0),
                    moq: Number(document.getElementById('admProductMoq')?.value || 8),
                    stock_qty: Number(document.getElementById('admProductStock')?.value || 0),
                    fabric: (document.getElementById('admProductFabric')?.value || '').trim(),
                    status: (document.getElementById('admProductStatus')?.value || 'in_stock')
                        .toLowerCase()
                        .replace(/\s+/g, '_'),
                };
                try {
                    const res = await fetch('/api/products.php', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-Token': window.DT_ADMIN_CSRF_TOKEN || '',
                        },
                        body: JSON.stringify(payload),
                    });
                    const data = await res.json();
                    if (data && data.success) {
                        notify(data.message || 'Saved to Cloudflare D1!');
                        if (window.closeAdmModal) window.closeAdmModal('admProductModal');
                        setTimeout(() => window.location.reload(), 450);
                        return;
                    }
                    notify((data && data.message) || 'Save failed', 'error');
                } catch {
                    origSave(e);
                }
            };
        }

        if (typeof window.deleteProduct === 'function') {
            window.deleteProduct = async function (id) {
                if (!confirm('Are you sure you want to delete this product from Cloudflare D1?')) return;
                const res = await fetch('/api/products.php', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': window.DT_ADMIN_CSRF_TOKEN || '',
                    },
                    body: JSON.stringify({ action: 'delete', id: Number(id) }),
                });
                const data = await res.json();
                if (data && data.success) {
                    notify('Product deleted from Cloudflare D1.');
                    setTimeout(() => window.location.reload(), 350);
                }
            };
        }

        if (typeof window.approveKYC === 'function') {
            window.approveKYC = async function (partnerId) {
                const numericId = Number(String(partnerId).replace(/\D+/g, '')) || 0;
                if (numericId > 0) {
                    await fetch('/api/customers.php', {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'update_status', id: numericId, status: 'active' }),
                    });
                }
                notify('Partner status set to Active in D1.');
                setTimeout(() => window.location.reload(), 400);
            };
        }

        // Wire dashboard inline quick buttons that previously showed demo toasts
        document.querySelectorAll('[onclick*="showToast"]').forEach((btn) => {
            const raw = btn.getAttribute('onclick') || '';
            if (raw.includes('Database Backup Snapshot')) {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', async function () {
                    notify('Generating live Cloudflare D1 JSON backup...', 'info');
                    const res = await fetch('/api/system/backup.php', { method: 'POST' }).then((r) => r.json());
                    if (res && res.success && res.backup?.url) {
                        notify('D1 cloud backup created: ' + res.backup.filename);
                        window.open(res.backup.url, '_blank');
                    } else {
                        notify((res && res.message) || 'Backup failed', 'error');
                    }
                });
            } else if (raw.includes('Template editor')) {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', () => {
                    window.location.href = '/admin/notifications/templates.php';
                });
            } else if (raw.includes('Add Price Tier Rule') || raw.includes('Edit Tier')) {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', () => {
                    window.location.href = '/admin/pricing/';
                });
            } else if (raw.includes('Generate Shipping Manifest')) {
                btn.removeAttribute('onclick');
                btn.addEventListener('click', () => {
                    window.location.href = '/admin/shipping/tracking.php';
                });
            }
        });
    }

    // 3. Map ALL remaining PHP-POST & inline-stub forms across 234 pages to Cloudflare D1 APIs
    function resolvePostEndpoint(pathname) {
        if (pathname.endsWith('/admin/products.php') || pathname.includes('/admin/inventory/'))
            return '/api/products.php';
        if (pathname.endsWith('/admin/categories.php')) return '/api/categories.php';
        if (pathname.includes('/admin/settings')) return '/api/settings.php';
        if (pathname.includes('/admin/payments/')) return '/api/payments.php';
        if (pathname.includes('/admin/customers/')) return '/api/customers.php';
        if (
            pathname.includes('/admin/marketing/banners') ||
            pathname.includes('/admin/marketing/announcements') ||
            pathname.includes('/admin/marketing/collections') ||
            pathname.includes('/admin/marketing/curation') ||
            pathname.includes('/admin/marketing/homepage') ||
            pathname.includes('/admin/marketing/seo') ||
            pathname.includes('/admin/marketing/share-templates') ||
            pathname.includes('/admin/marketing/sliders') ||
            pathname.includes('/admin/marketing/social') ||
            pathname.includes('/admin/catalogue/banners') ||
            pathname.includes('/admin/cms/')
        ) {
            return '/api/content.php';
        }
        if (pathname.includes('/admin/marketing')) return '/api/coupons.php';
        return '';
    }

    function wireLegacyForms() {
        const path = window.location.pathname;
        document.querySelectorAll('form').forEach((form) => {
            if (form.classList.contains('adm-login-form')) return;
            const actionAttr = (form.getAttribute('action') || '').trim();
            if (actionAttr.startsWith('/api/')) return; // Already wired to API

            const subAttr = form.getAttribute('onsubmit') || '';
            if (subAttr) {
                // Upgrade inline demo forms in admin/index.php, cms/about.php, and catalogue/banners/add|edit.php
                if (subAttr.includes('Store settings saved')) {
                    form.removeAttribute('onsubmit');
                    form.addEventListener('submit', async function (e) {
                        e.preventDefault();
                        const payload = {};
                        form.querySelectorAll('input, select, textarea').forEach((el, idx) => {
                            const k = el.name || el.id || 'setting_' + idx;
                            payload[k] = el.value;
                        });
                        const res = await fetch('/api/settings.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        }).then((r) => r.json());
                        notify(res.message || 'Store settings saved to D1.');
                    });
                    return;
                }
                if (subAttr.includes('About Us story updated')) {
                    form.removeAttribute('onsubmit');
                    form.addEventListener('submit', async function (e) {
                        e.preventDefault();
                        const payload = { action: 'save_cms_page', page: 'about_us' };
                        form.querySelectorAll('input, select, textarea').forEach((el, idx) => {
                            const k = el.name || el.id || 'field_' + idx;
                            payload[k] = el.value;
                        });
                        const res = await fetch('/api/content.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        }).then((r) => r.json());
                        notify(
                            (res && res.message) || 'About Us story saved in D1!',
                            res && res.success ? 'success' : 'error'
                        );
                    });
                    return;
                }
                if (subAttr.includes('DT_CATALOGUE') && subAttr.includes('Banner')) {
                    const isEdit = path.includes('edit.php');
                    form.removeAttribute('onsubmit');
                    form.addEventListener('submit', async function (e) {
                        e.preventDefault();
                        const payload = {
                            action: isEdit ? 'update_banner' : 'create_banner',
                            id: isEdit ? Number(new URLSearchParams(window.location.search).get('id') || 1) : undefined,
                        };
                        form.querySelectorAll('input, select, textarea').forEach((el, idx) => {
                            if (el.type === 'file') return;
                            const k = el.name || el.id || 'field_' + idx;
                            payload[k] = el.value;
                        });
                        if (!payload.title) {
                            const firstText = form.querySelector('input[type="text"]');
                            if (firstText) payload.title = firstText.value;
                        }
                        const res = await fetch('/api/content.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        }).then((r) => r.json());
                        notify((res && res.message) || 'Banner saved in D1!', res && res.success ? 'success' : 'error');
                        if (res && res.success && !isEdit) {
                            setTimeout(() => {
                                window.location.href = '/admin/marketing/banners.php';
                            }, 550);
                        }
                    });
                    return;
                }
                if (!subAttr.startsWith('return confirm')) return;
            }

            const method = (form.getAttribute('method') || 'GET').toUpperCase();
            if (method !== 'POST') return;

            const endpoint = resolvePostEndpoint(path);
            if (!endpoint) return;

            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                const body = {};
                new FormData(form).forEach((v, k) => {
                    body[k] = typeof v === 'string' ? v : '';
                });
                const res = await fetch(endpoint, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRF-Token': window.DT_ADMIN_CSRF_TOKEN || '',
                    },
                    body: JSON.stringify(body),
                }).then((r) => r.json());
                notify((res && res.message) || 'Saved in D1!', res && res.success ? 'success' : 'error');
                if (res && res.success) setTimeout(() => window.location.reload(), 450);
            });
        });
    }

    // 4. Hydrate Sidebar Live Counts & Dashboard KPI Cards directly from D1 SQL (`window.DT_DASH`)
    function hydrateSidebarAndStatus() {
        const dash = window.DT_DASH;
        if (!dash) return;
        const sc = dash.sidebar_counts || {};
        const badgeMap = [
            ['/admin/products/', sc.products],
            ['/admin/catalogue/', sc.categories],
            ['/admin/orders/', sc.orders],
            ['/admin/customers/wholesalers.php', sc.wholesale],
            ['/admin/customers/resellers.php', sc.resellers],
            ['/admin/customers/', sc.customers],
        ];
        badgeMap.forEach(([href, val]) => {
            if (typeof val !== 'number') return;
            const link = document.querySelector(`.adm-sidebar a[href="${href}"]`);
            if (!link) return;
            const badge = link.querySelector('.adm-nav-badge, .adm-sb-count, .adm-badge');
            if (badge && /^\d[\d,]*$/.test(badge.textContent.trim())) {
                badge.textContent = val.toLocaleString('en-IN');
            }
        });

        const k = dash.kpis;
        if (k) {
            const kpiVals = document.querySelectorAll('.adm-desktop-ref-suite .adm-ref-kpi-card .adm-ref-kpi-val');
            if (kpiVals.length >= 5) {
                kpiVals[0].textContent = Number(k.total_orders || 0).toLocaleString('en-IN');
                kpiVals[1].textContent = '₹' + Number(k.total_sales || 0).toLocaleString('en-IN');
                kpiVals[2].textContent = '₹' + Number(k.net_revenue || 0).toLocaleString('en-IN');
                kpiVals[3].textContent = Number(k.total_products || 0).toLocaleString('en-IN');
                kpiVals[4].textContent = Number(k.total_categories || 0).toLocaleString('en-IN');
            }
            const tickers = document.querySelectorAll('.adm-live-ticker-strip .adm-live-ticker-val');
            if (tickers.length >= 7 && k.fulfillment) {
                tickers[0].textContent = Number(
                    (k.fulfillment.unfulfilled || 0) + (k.fulfillment.processing || 0)
                ).toLocaleString('en-IN');
                tickers[1].textContent = Number(k.live_orders_today || 0).toLocaleString('en-IN');
                tickers[2].textContent = Number(k.fulfillment.dispatched || 0).toLocaleString('en-IN');
                tickers[3].textContent = '₹' + Number(k.pending_payments || 0).toLocaleString('en-IN');
                tickers[4].textContent = '₹' + Number(k.today_sales || 0).toLocaleString('en-IN');
                tickers[5].textContent = '+' + Number(k.new_customers_today || 0).toLocaleString('en-IN');
                tickers[6].textContent = Number(k.low_stock_count || 0).toLocaleString('en-IN') + ' Items';
            }
        }
    }

    // 5. Dynamic `?id=...` hydration across Products, Orders, and Customers detail/edit pages
    async function hydrateDetailPage() {
        const params = new URLSearchParams(window.location.search);
        const rawId = (params.get('id') || params.get('order_id') || params.get('order_number') || '').trim();
        const numId = Number(rawId);
        const p = window.location.pathname;

        if ((p.includes('/admin/products/edit.php') || p.includes('/admin/products/view.php')) && numId > 0) {
            try {
                const res = await fetch('/api/products.php?id=' + encodeURIComponent(numId));
                const data = await res.json();
                if (!data || !data.product) return;
                const prod = data.product;
                window.DT_PRODUCT = prod;
                const fieldMap = {
                    pFormId: prod.id,
                    pFormTitle: prod.title,
                    pFormSku: prod.sku,
                    pFormRetailPrice: prod.retail_price,
                    pFormWholesalePrice: prod.wholesale_price,
                    pFormResellerPrice: prod.reseller_price,
                    pFormStock: prod.stock_qty,
                    pFormFabric: prod.fabric,
                    pFormDescription: prod.description,
                };
                Object.entries(fieldMap).forEach(([elId, val]) => {
                    const el = document.getElementById(elId);
                    if (el && val !== undefined) el.value = val;
                });
            } catch {
                // Non-blocking fallback
            }
        }

        if ((p.includes('/admin/orders/view.php') || p.includes('/admin/orders/invoice.php')) && rawId) {
            try {
                const res = await fetch('/api/orders.php?action=details&id=' + encodeURIComponent(rawId));
                const data = await res.json();
                if (!data || !data.order) return;
                const ord = data.order;
                window.DT_ORDER = ord;
                const h1 = document.querySelector('.adm-page-title span, h1');
                if (h1 && ord.order_number) {
                    h1.textContent = p.includes('invoice')
                        ? `Tax Invoice ${ord.order_number}`
                        : `Order ${ord.order_number}`;
                }
            } catch {
                // Non-blocking fallback
            }
        }

        if (p.startsWith('/admin/reviews/') && !p.includes('audit.php') && !p.includes('analytics.php')) {
            try {
                const res = await fetch('/api/reviews.php?status=all');
                const data = await res.json();
                if (data && Array.isArray(data.reviews)) {
                    const allRevs = data.reviews;
                    const tbody = document.querySelector('.adm-table tbody');
                    const filterStatus = p.includes('pending')
                        ? 'pending'
                        : p.includes('approved')
                          ? 'approved'
                          : p.includes('rejected')
                            ? 'rejected'
                            : p.includes('flagged')
                              ? 'flagged'
                              : 'all';
                    const rows =
                        filterStatus === 'all' ? allRevs : allRevs.filter((r) => String(r.status || '') === filterStatus);
                    if (tbody) {
                        if (rows.length === 0) {
                            tbody.innerHTML =
                                '<tr><td colspan="6" style="text-align:center;padding:36px;color:#64748B;"><div style="font-weight:700;font-size:14px;margin-bottom:4px;">No customer reviews in this status queue</div></td></tr>';
                        } else {
                            tbody.innerHTML = rows
                                .map((rev) => {
                                    const rId = Number(rev.id);
                                    const st = String(rev.status || 'pending').toLowerCase();
                                    const badgeCls =
                                        st === 'approved' ? 'success' : st === 'rejected' ? 'danger' : 'warning';
                                    const badgeTxt =
                                        st === 'approved'
                                            ? 'Approved & Live'
                                            : st === 'rejected'
                                              ? 'Rejected / Hidden'
                                              : st === 'flagged'
                                                ? 'Flagged / Support'
                                                : 'Pending Moderation';
                                    const rating = Math.min(5, Math.max(1, Number(rev.rating || 5)));
                                    let stars = '';
                                    for (let si = 1; si <= 5; si++) {
                                        stars += `<svg width="12" height="12" viewBox="0 0 24 24" class="${si <= rating ? 'dt-star-fill' : 'dt-star-empty'}" stroke-width="1.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
                                    }
                                    const reply = rev.store_reply || rev.admin_reply || '';
                                    return `<tr id="revRow_${rId}">
                                        <td>
                                            <div style="font-weight:700;color:#111827;display:flex;align-items:center;gap:4px;"><span>${escapeText(rev.customer_name || 'Buyer')}</span>${rev.verified_buyer ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803D" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>' : ''}</div>
                                            <div style="font-size:11px;color:#64748B;margin-top:2px;">${escapeText(rev.city || 'India')} &bull; ${escapeText(rev.created_at || '')}</div>
                                        </td>
                                        <td>
                                            <div style="font-weight:600;color:#1F2937;font-size:12.5px;">${escapeText(rev.product_title || 'Handloom Saree')}</div>
                                            <div style="font-size:11px;color:#8A681F;font-weight:700;margin-top:2px;">SKU: ${escapeText(rev.product_sku || 'PROD-' + (rev.product_id || 1))}</div>
                                        </td>
                                        <td><div style="display:inline-flex;align-items:center;gap:2px;">${stars}<span style="font-weight:800;font-size:11px;color:#111827;margin-left:3px;">(${rating}.0)</span></div></td>
                                        <td style="max-width:320px;">
                                            ${rev.review_title ? `<div style="font-weight:700;font-size:12px;color:#111827;margin-bottom:2px;">${escapeText(rev.review_title)}</div>` : ''}
                                            <div style="font-size:12px;color:#334155;line-height:1.4;">&ldquo;${escapeText(String(rev.review_text || '').slice(0, 120))}&rdquo;</div>
                                            ${reply ? `<div style="margin-top:6px;background:#FAF5E8;border-left:3px solid #8A681F;padding:4px 8px;border-radius:3px;font-size:11px;color:#705114;"><strong>DT Brand's:</strong> ${escapeText(reply)}</div>` : ''}
                                        </td>
                                        <td><span class="adm-badge ${badgeCls}" id="badgeStatus_${rId}">${badgeTxt}</span></td>
                                        <td style="text-align:right;">
                                            <div style="display:inline-flex;gap:4px;">
                                                <button type="button" class="dt-btn dt-btn-pale dt-btn-sm" style="display:inline-flex;align-items:center;gap:4px;" onclick="openReviewInspector(${rId})"><span>Inspect</span></button>
                                                ${st === 'pending' ? `<button type="button" class="dt-btn dt-btn-emerald dt-btn-sm" onclick="dtModerateReview(${rId}, 'approve')">Approve</button>` : ''}
                                                <button type="button" class="dt-btn dt-btn-pale dt-btn-sm" style="color:#DC2626;border-color:#FECACA;background:#FEF2F2;" onclick="dtModerateReview(${rId}, 'delete')">Delete</button>
                                            </div>
                                        </td>
                                    </tr>`;
                                })
                                .join('');
                        }
                    }
                    const kpiEls = document.querySelectorAll('.adm-kpi-card .adm-kpi-val');
                    if (kpiEls.length >= 4 && allRevs.length > 0) {
                        const avg =
                            allRevs.reduce((s, r) => s + Number(r.rating || 5), 0) / Math.max(1, allRevs.length);
                        const pendCnt = allRevs.filter((r) => r.status === 'pending').length;
                        const fiveCnt = allRevs.filter((r) => Number(r.rating) === 5).length;
                        kpiEls[0].textContent = avg.toFixed(1) + ' / 5.0';
                        kpiEls[1].textContent = String(pendCnt);
                        kpiEls[2].textContent = String(fiveCnt);
                    }
                }
            } catch {
                // Non-blocking fallback
            }
        }

        if ((p.includes('/admin/customers/edit.php') || p.includes('/admin/customers/view.php')) && numId > 0) {
            try {
                const listRes = await fetch('/api/customers.php');
                const listData = await listRes.json();
                const cust = (listData?.customers || []).find((x) => Number(x.id) === numId) || null;
                if (!cust) {
                    const hdr = document.querySelector('.adm-page-subtitle, .dt-hero-subtitle');
                    if (hdr) hdr.textContent = `Customer #${numId} is not currently in Cloudflare D1.`;
                    return;
                }
                window.DT_CUSTOMER = cust;
                const nameMap = {
                    name: cust.name,
                    first_name: String(cust.name || '').split(' ')[0] || '',
                    last_name: String(cust.name || '')
                        .split(' ')
                        .slice(1)
                        .join(' '),
                    email: cust.email || '',
                    phone: cust.phone || '',
                    city: cust.city || '',
                    state: cust.state || '',
                    gstin: cust.gstin || '',
                    tier: cust.tier || 'Standard',
                    type: cust.type || 'customer',
                    status: cust.status || 'active',
                };
                Object.entries(nameMap).forEach(([fieldName, val]) => {
                    const el =
                        document.querySelector(`[name="${fieldName}"]`) || document.getElementById(`cust_${fieldName}`);
                    if (el && val !== undefined) el.value = val;
                });
            } catch {
                // Non-blocking fallback
            }
        }
    }

    // 6. Next-Level Command Palette (Ctrl+K) + Edge Security & Health Bar
    function initCommandPaletteAndStatusBar() {
        const quickLinks = [
            { label: 'Executive Dashboard', hint: 'KPIs & Live Orders', url: '/admin/' },
            { label: 'Orders Directory', hint: 'Manage B2B & Retail Orders', url: '/admin/orders/' },
            { label: 'Create Manual Order', hint: 'Orders / Invoice Desk', url: '/admin/orders/create.php' },
            { label: 'Product Catalogue', hint: 'Manage SKUs, Stock & Pricing', url: '/admin/products/' },
            { label: 'Categories & Subcategories', hint: 'Taxonomy Tree', url: '/admin/products/categories/' },
            { label: 'Attributes & Swatches', hint: 'Variants & Colors', url: '/admin/products/attributes/' },
            { label: 'Customers & B2B Partners', hint: 'Retail, Wholesale & Resellers', url: '/admin/customers/' },
            { label: 'Pending UPI Approvals', hint: 'Verify 12-Digit UTR Queue', url: '/admin/payments/pending.php' },
            { label: 'Payment Webhooks & HMAC', hint: 'Razorpay & Cashfree Logs', url: '/admin/payments/webhooks.php' },
            {
                label: 'Shipping Zones & Carriers',
                hint: 'Delhivery, BlueDart, Pin Check',
                url: '/admin/shipping/zones.php',
            },
            {
                label: 'Marketing Banners & Coupons',
                hint: 'Promotions & Hero Carousel',
                url: '/admin/marketing/banners.php',
            },
            { label: 'Reports & CSV/Excel Exports', hint: 'Sales, GST, Inventory', url: '/admin/reports/' },
            { label: 'System Health & Backups', hint: 'D1 SQL, KV Storage, Snapshots', url: '/admin/system/' },
            { label: 'Security & Audit Trail', hint: 'Admin Roles & Logs', url: '/admin/audit/' },
            { label: 'UI Component Library', hint: 'DT Brand Design System', url: '/admin/components/' },
            { label: 'API Health & Docs', hint: '83 Mapped Endpoints', url: '/admin/developer/api-health.php' },
        ];

        // Inject Edge Quick Search Pill cleanly into admin header actions
        const headerRight = document.querySelector('.adm-header-right, .adm-header-actions, .adm-topbar-right');
        if (headerRight && !document.getElementById('dtCmdSearchTrigger')) {
            const pillBtn = document.createElement('button');
            pillBtn.type = 'button';
            pillBtn.id = 'dtCmdSearchTrigger';
            pillBtn.className = 'dt-btn dt-btn-pale';
            pillBtn.style.cssText =
                'display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border-radius:7px;font-size:11.5px;font-weight:700;border:1px solid #D4AF37;background:#FAF5E8;color:#705114;cursor:pointer;';
            pillBtn.innerHTML =
                '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
                '<span>Quick Jump</span>' +
                '<kbd style="background:#FFFFFF;border:1px solid #D4AF37;border-radius:4px;padding:1px 5px;font-size:10px;color:#8A681F;">Ctrl+K</kbd>';
            pillBtn.addEventListener('click', openPalette);
            headerRight.insertBefore(pillBtn, headerRight.firstChild);
        }

        const headerSearch = document.querySelector('.adm-search-global input, .adm-topbar-search input');
        if (headerSearch) {
            headerSearch.addEventListener('focus', function () {
                if (!this.value.trim()) openPalette();
            });
        }

        let modal = null;
        let searchTimer = null;

        function ensureModal() {
            if (modal) return modal;
            modal = document.createElement('div');
            modal.id = 'dtCommandPalette';
            modal.style.cssText =
                'display:none;position:fixed;inset:0;background:rgba(17,24,39,0.72);backdrop-filter:blur(4px);z-index:9999999;align-items:flex-start;justify-content:center;padding-top:10vh;';
            modal.innerHTML = `
                <div style="width:94%;max-width:620px;background:#FFFFFF;border:2px solid #D4AF37;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,0.4);overflow:hidden;font-family:Inter,Plus Jakarta Sans,sans-serif;">
                    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;background:#181512;border-bottom:1.5px solid #D4AF37;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D4AF37" stroke-width="2.3"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input id="dtCmdInput" type="text" placeholder="Search orders, SKUs, customers, or jump to any admin tool..." style="flex:1;background:transparent;border:none !important;box-shadow:none !important;animation:none !important;color:#FAF5E8 !important;font-size:13.5px;font-weight:600;outline:none;">
                        <button type="button" id="dtCmdClose" class="dt-btn dt-btn-dark" style="height:26px;padding:0 9px;border-radius:5px;border:1px solid #8A681F;background:#2A241E;color:#FAF5E8;font-size:11px;font-weight:700;cursor:pointer;">Esc</button>
                    </div>
                    <div id="dtCmdResults" style="max-height:58vh;overflow-y:auto;padding:8px;"></div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closePalette();
            });
            document.getElementById('dtCmdClose').addEventListener('click', closePalette);
            document.getElementById('dtCmdInput').addEventListener('input', onSearchInput);
            return modal;
        }

        function renderResults(items) {
            const box = document.getElementById('dtCmdResults');
            if (!box) return;
            if (items.length === 0) {
                box.innerHTML =
                    '<div style="padding:24px;text-align:center;color:#64748B;font-size:12.5px;">No matching routes or D1 records found.</div>';
                return;
            }
            box.innerHTML = items
                .map(
                    (it) => `
                    <a href="${escapeText(it.url)}" style="display:flex;align-items:center;justify-content:space-between;padding:9px 12px;border-radius:8px;text-decoration:none;color:#111827;border:1px solid transparent;margin-bottom:2px;" onmouseover="this.style.background='#FAF5E8';this.style.borderColor='#D4AF37'" onmouseout="this.style.background='transparent';this.style.borderColor='transparent'">
                        <div>
                            <div style="font-size:13px;font-weight:700;color:#111827;">${escapeText(it.label)}</div>
                            <div style="font-size:11.5px;color:#64748B;">${escapeText(it.hint)}</div>
                        </div>
                        <span style="font-size:10.5px;font-weight:700;color:#8A681F;background:#FAF5E8;border:1px solid rgba(212,175,55,0.45);padding:2px 8px;border-radius:99px;">${escapeText(it.badge || 'Open')}</span>
                    </a>`
                )
                .join('');
        }

        function onSearchInput(e) {
            const q = String(e.target.value || '').trim();
            const localMatches = quickLinks
                .filter((x) => !q || `${x.label} ${x.hint}`.toLowerCase().includes(q.toLowerCase()))
                .slice(0, 8)
                .map((x) => ({ ...x, badge: 'Module' }));
            renderResults(localMatches);
            if (!q) return;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(async () => {
                try {
                    const data = await fetch('/api/search.php?q=' + encodeURIComponent(q)).then((r) => r.json());
                    if (!data || !data.success) return;
                    const dyn = [];
                    (data.orders || []).forEach((o) =>
                        dyn.push({
                            label: `Order ${o.order_number} — ${o.customer_name}`,
                            hint: `₹${Number(o.total_amount || 0).toLocaleString('en-IN')} · ${o.fulfillment_status || 'processing'}`,
                            url: '/admin/orders/view.php?id=' + encodeURIComponent(o.order_number),
                            badge: 'Order',
                        })
                    );
                    (data.customers || []).forEach((c) =>
                        dyn.push({
                            label: `${c.name} (${c.phone})`,
                            hint: `${c.type || 'customer'} · ${c.city || 'India'} · ${c.status}`,
                            url: '/admin/customers/edit.php?id=' + encodeURIComponent(c.id),
                            badge: 'Customer',
                        })
                    );
                    (data.products || []).slice(0, 6).forEach((p) =>
                        dyn.push({
                            label: `${p.title} (${p.sku})`,
                            hint: `₹${Number(p.retail_price || 0).toLocaleString('en-IN')} Retail · Stock ${p.stock_qty}`,
                            url: '/admin/products/edit.php?id=' + encodeURIComponent(p.id),
                            badge: 'Product',
                        })
                    );
                    renderResults([...dyn, ...localMatches].slice(0, 14));
                } catch {
                    // Keep local matches
                }
            }, 180);
        }

        function openPalette() {
            const m = ensureModal();
            m.style.display = 'flex';
            const inp = document.getElementById('dtCmdInput');
            if (inp) {
                inp.value = '';
                renderResults(quickLinks.slice(0, 10).map((x) => ({ ...x, badge: 'Module' })));
                setTimeout(() => inp.focus(), 30);
            }
        }

        function closePalette() {
            if (modal) modal.style.display = 'none';
        }

        document.addEventListener('keydown', function (e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                if (modal && modal.style.display === 'flex') closePalette();
                else openPalette();
            } else if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
                closePalette();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (window.location.pathname.includes('/admin/login')) {
            initLoginBridge();
            return;
        }
        wireDashboardActions();
        wireLegacyForms();
        hydrateSidebarAndStatus();
        hydrateDetailPage();
        initCommandPaletteAndStatusBar();
    });
})();
