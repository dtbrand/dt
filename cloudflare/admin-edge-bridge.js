/**
 * DT Brand's — Real Admin Panel Edge Bridge for Cloudflare Workers (D1 + KV + Email Outbox).
 * Runs alongside all real admin assets (`admin.js`, `products.js`, `order-status.js`, etc.)
 * to wire login, first-time super-admin setup, live D1 KPI hydration, legacy form POSTs,
 * and dashboard CRUD directly into Cloudflare D1 APIs.
 */

(function () {
    'use strict';

    // 1. Login Page Handler (/admin/login/)
    function initLoginBridge() {
        const loginForm = document.querySelector('form.adm-login-form');
        if (!loginForm) return;

        const needsSetup = Boolean(window.DT_ADMIN_NEEDS_SETUP);
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const emailGroup = loginForm.querySelector('.adm-field-group');
        const subtitleEl = document.querySelector('.adm-login-sub, .adm-card-subtitle, .adm-login-header p');
        let setupMode = needsSetup;

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

    // 2. Patch `window.DT_DASH` actions (in admin.js) so Product/Order/Settings writes go straight to D1 SQL
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
                        if (window.showToast) window.showToast(data.message || 'Saved to Cloudflare D1!');
                        if (window.closeAdmModal) window.closeAdmModal('admProductModal');
                        setTimeout(() => window.location.reload(), 450);
                        return;
                    }
                    if (window.showToast) window.showToast((data && data.message) || 'Save failed', 'error');
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
                    if (window.showToast) window.showToast('Product deleted from Cloudflare D1.');
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
                if (window.showToast) window.showToast('Partner status set to Active in D1.');
                setTimeout(() => window.location.reload(), 400);
            };
        }
    }

    // 3. Map remaining PHP-POST forms cleanly to Cloudflare APIs
    function wireLegacyForms() {
        const path = window.location.pathname;
        document.querySelectorAll('form').forEach((form) => {
            if (form.classList.contains('adm-login-form')) return;
            if (form.getAttribute('onsubmit')) {
                // Upgrade inline demo settings form inside admin/index.php
                const subAttr = form.getAttribute('onsubmit') || '';
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
                            credentials: 'same-origin',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        }).then((r) => r.json());
                        if (window.showToast) window.showToast(res.message || 'Store settings saved to D1.');
                    });
                }
                return;
            }
            const method = (form.getAttribute('method') || 'GET').toUpperCase();
            if (method !== 'POST') return;

            form.addEventListener('submit', async function (e) {
                let endpoint = '';
                if (path.endsWith('/admin/products.php')) endpoint = '/api/products.php';
                else if (path.endsWith('/admin/categories.php')) endpoint = '/api/categories.php';
                else if (path.includes('/admin/settings')) endpoint = '/api/settings.php';
                else if (path.includes('/admin/marketing/')) endpoint = '/api/coupons.php';
                if (!endpoint) return;

                e.preventDefault();
                const body = {};
                new FormData(form).forEach((v, k) => {
                    body[k] = v;
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
                if (window.showToast) {
                    window.showToast((res && res.message) || 'Saved in D1!', res && res.success ? 'success' : 'error');
                }
                if (res && res.success) setTimeout(() => window.location.reload(), 500);
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

    // 5. Dynamic `?id=...` hydration for Product Edit / View pages when opened from catalogue
    async function hydrateDetailPage() {
        const params = new URLSearchParams(window.location.search);
        const pid = Number(params.get('id') || 0);
        if (pid <= 1) return;
        const p = window.location.pathname;
        if (p.includes('/admin/products/edit.php') || p.includes('/admin/products/view.php')) {
            try {
                const res = await fetch('/api/products.php?id=' + encodeURIComponent(pid), {
                    credentials: 'same-origin',
                });
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
    });
})();
