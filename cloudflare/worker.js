/**
 * DT Brand's & Jai Hanuman Tex — Cloudflare Workers Edge Storefront,
 * Real Enterprise Admin Panel (230+ pages), D1 SQL API Gateway, KV/R2 Cloud Storage & Email Service.
 */

import { buildAdminDashboardPayload } from './lib/admin-data.js';
import { routeApiRequest } from './lib/api-handlers.js';
import { getStorageStatus, readCloudObject, sendTransactionalEmail } from './lib/storage.js';
import {
    ADMIN_COOKIE,
    SID_COOKIE,
    buildCookieHeader,
    checkRateLimit,
    clearRateLimit,
    ensureRuntimeSchema,
    escapeHtml,
    getSessionContext,
    getSigningSecret,
    jsonResponse,
    normalizeProduct,
    readRequestBody,
    signToken,
    verifyPassword,
} from './lib/utils.js';

const PAGE_ROUTES = {
    '/': 'index.html',
    '/index.php': 'index.html',
    '/index.html': 'index.html',
    '/shop': 'shop.html',
    '/shop.php': 'shop.html',
    '/wholesale': 'wholesale.html',
    '/wholesale.php': 'wholesale.html',
    '/reseller': 'reseller.html',
    '/reseller.php': 'reseller.html',
    '/retailer': 'retailer.html',
    '/retailer.php': 'retailer.html',
    '/cart': 'cart.html',
    '/cart.php': 'cart.html',
    '/checkout': 'checkout.html',
    '/checkout.php': 'checkout.html',
    '/wishlist': 'wishlist.html',
    '/wishlist.php': 'wishlist.html',
    '/account': 'account.html',
    '/account.php': 'account.html',
    '/track': 'track.html',
    '/track.php': 'track.html',
    '/about-us': 'about-us.html',
    '/about-us.php': 'about-us.html',
    '/contact': 'contact.html',
    '/contact.php': 'contact.html',
    '/privacy': 'privacy.html',
    '/privacy.php': 'privacy.html',
    '/shipping': 'shipping.html',
    '/shipping.php': 'shipping.html',
    '/terms': 'terms.html',
    '/terms.php': 'terms.html',
};

const ADMIN_REDIRECTS = {
    '/admin.php': '/admin/',
    '/admin': '/admin/',
    '/adminlogin.php': '/admin/login/',
    '/admin/notifications/whatsapp.php': '/admin/whatsapp/templates.php',
    '/admin/products/categories.php': '/admin/products/categories/',
    '/admin/products/attributes/add.php': '/admin/products/attributes/index.php?action=new_attribute',
    '/admin/products/attributes/edit.php': '/admin/products/attributes/index.php',
    '/admin/products/duplicate.php': '/admin/products/',
    '/admin/products/exports/history.php': '/admin/products/exports/index.php?tab=history',
    '/admin/products/imports/errors.php': '/admin/products/imports/index.php?tab=errors',
    '/admin/products/imports/history.php': '/admin/products/imports/index.php?tab=history',
    '/admin/products/imports/preview.php': '/admin/products/imports/index.php?tab=preview',
    '/admin/products/imports/upload.php': '/admin/products/imports/index.php?tab=upload',
    '/admin/products/media/gallery.php': '/admin/products/media/index.php?view=gallery',
    '/admin/products/reviews/approved.php': '/admin/products/reviews/index.php?status=approved',
    '/admin/products/reviews/rejected.php': '/admin/products/reviews/index.php?status=rejected',
    '/admin/products/reviews/reported.php': '/admin/products/reviews/index.php?status=reported',
    '/admin/products/variants/add.php': '/admin/products/variants/index.php?action=new_variant',
    '/admin/products/variants/edit.php': '/admin/products/variants/index.php',
    '/admin/products/variants/view.php': '/admin/products/variants/index.php',
};

const ADMIN_STATIC_EXT_RE = /\.(css|js|png|jpg|jpeg|webp|svg|gif|woff2?|json)$/i;

function safeJsonInline(data) {
    return JSON.stringify(data).replace(/</g, '\\u003c');
}

function injectBeforeLastTag(html, tag, snippet) {
    const idx = html.toLowerCase().lastIndexOf(tag.toLowerCase());
    if (idx === -1) return `${html}\n${snippet}`;
    return html.slice(0, idx) + snippet + '\n' + html.slice(idx);
}

function rewriteOriginUrls(text, url) {
    return String(text || '')
        .replace(/https?:\/\/yourdomain\.com/gi, () => url.origin)
        .replace(/yourdomain\.com/gi, () => url.host);
}

async function fetchAdminAssetHtml(url, env, candidates) {
    for (const rel of candidates) {
        const assetReq = new Request(new URL(`/_admin_pages/${rel}`, url.origin), {
            method: 'GET',
            headers: { accept: 'text/html' },
        });
        const res = await env.ASSETS.fetch(assetReq);
        if (res.ok) return res;
    }
    return null;
}

function resolveAdminTemplateCandidates(path) {
    if (
        path === '/admin/' ||
        path === '/admin/index.php' ||
        path === '/admin/admin.php' ||
        path === '/admin/dashboard' ||
        path === '/admin/dashboard/' ||
        path === '/admin/dashboard/index.php'
    ) {
        return ['index.html'];
    }
    if (
        path === '/admin/login' ||
        path === '/admin/login/' ||
        path === '/admin/login.php' ||
        path === '/admin/login/index.php'
    ) {
        return ['login.html', 'login/index.html'];
    }

    const rel = path.replace(/^\/admin\//, '');
    if (!rel) return ['index.html'];
    if (rel.endsWith('/')) {
        return [`${rel}index.html`, `${rel.slice(0, -1)}.html`];
    }
    if (rel.endsWith('.php')) {
        return [rel.replace(/\.php$/i, '.html')];
    }
    if (rel.endsWith('.html')) {
        return [rel];
    }
    return [`${rel}/index.html`, `${rel}.html`];
}

async function handleAdminRoutes(request, url, env, session) {
    const path = url.pathname;

    // 1. Static CSS/JS/images under /admin/*
    if (path.startsWith('/admin/') && ADMIN_STATIC_EXT_RE.test(path)) {
        return env.ASSETS.fetch(request);
    }

    // 2. Logout
    if (
        path === '/admin/logout.php' ||
        path === '/admin/logout/' ||
        ((path.startsWith('/admin/login') || path === '/adminlogin.php') && url.searchParams.get('action') === 'logout')
    ) {
        return new Response(null, {
            status: 302,
            headers: {
                location: new URL('/admin/login/?logged_out=1', url.origin).toString(),
                'set-cookie': buildCookieHeader(ADMIN_COOKIE, '', 0, true),
            },
        });
    }

    // 3. Direct redirects for PHP shim / helper routes
    if (Object.prototype.hasOwnProperty.call(ADMIN_REDIRECTS, path)) {
        const dest = ADMIN_REDIRECTS[path];
        if (!session.isAdmin && dest !== '/admin/login/') {
            return Response.redirect(new URL('/admin/login/', url.origin).toString(), 302);
        }
        return Response.redirect(new URL(dest, url.origin).toString(), 302);
    }

    // 4. Admin Login Portal (/admin/login/)
    const isLoginRoute =
        path === '/admin/login' ||
        path === '/admin/login/' ||
        path === '/admin/login.php' ||
        path === '/admin/login/index.php';

    if (isLoginRoute) {
        if (request.method === 'POST') {
            const body = await readRequestBody(request);
            const email = String(body.email || '')
                .trim()
                .toLowerCase();
            const password = String(body.password || '');
            const ip = request.headers.get('cf-connecting-ip') || 'unknown';
            const rl = await checkRateLimit(env, `admin_login:${ip}:${email}`, 5, 300);
            if (rl.limited) {
                return Response.redirect(new URL('/admin/login/?error=rate_limited', url.origin).toString(), 302);
            }
            const userRow = await env.DB.prepare(
                "SELECT * FROM users WHERE LOWER(email) = ? AND status = 'active' LIMIT 1"
            )
                .bind(email)
                .first();
            if (userRow && (await verifyPassword(password, userRow.password_hash))) {
                await clearRateLimit(env, `admin_login:${ip}:${email}`);
                const secret = await getSigningSecret(env);
                const token = await signToken({ aid: Number(userRow.id), exp: Date.now() + 86400000 * 3 }, secret);
                return new Response(null, {
                    status: 302,
                    headers: {
                        location: new URL('/admin/', url.origin).toString(),
                        'set-cookie': buildCookieHeader(ADMIN_COOKIE, token, 86400 * 3, true),
                    },
                });
            }
            return Response.redirect(new URL('/admin/login/?error=1', url.origin).toString(), 302);
        }

        if (session.isAdmin) {
            return Response.redirect(new URL('/admin/', url.origin).toString(), 302);
        }

        const assetRes = await fetchAdminAssetHtml(url, env, ['login.html', 'login/index.html']);
        if (!assetRes) {
            return new Response('Admin login template not found.', { status: 404 });
        }
        let html = rewriteOriginUrls(await assetRes.text(), url);
        const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
        const needsSetup = Number(cnt?.c || 0) === 0;
        const inject = `<script>window.DT_ADMIN_NEEDS_SETUP=${needsSetup ? 'true' : 'false'};</script><script src="/admin/assets/js/admin-edge-bridge.js?v=cf"></script>`;
        html = injectBeforeLastTag(html, '</body>', inject);
        return new Response(html, {
            status: 200,
            headers: {
                'content-type': 'text/html; charset=utf-8',
                'cache-control': 'no-store',
                'x-frame-options': 'SAMEORIGIN',
                'x-content-type-options': 'nosniff',
            },
        });
    }

    // 5. Auth Guard for all authenticated Real Admin Panel routes
    if (!session.isAdmin) {
        return Response.redirect(new URL('/admin/login/', url.origin).toString(), 302);
    }

    const candidates = resolveAdminTemplateCandidates(path);
    let assetRes = await fetchAdminAssetHtml(url, env, candidates);
    if (!assetRes) {
        return new Response(
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Admin Page Not Found — DT Brand's</title></head><body style="font-family:Inter,sans-serif;text-align:center;padding:60px 20px;background:#FAF5E8;color:#111827;"><h1>Admin Route Not Found</h1><p>${escapeHtml(path)}</p><p><a href="/admin/" style="color:#8A681F;font-weight:700;">Return to Admin Dashboard</a></p></body></html>`,
            { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
        );
    }

    let html = rewriteOriginUrls(await assetRes.text(), url);

    const [secret, dash] = await Promise.all([getSigningSecret(env), buildAdminDashboardPayload(env)]);
    const adminCsrf = await signToken(
        { sid: session.sid, aid: session.admin?.id || 0, exp: Date.now() + 86400000 },
        secret
    );

    const dashJson = safeJsonInline(dash);
    const csrfJson = safeJsonInline(adminCsrf);
    const prodsJson = safeJsonInline(dash.products);
    const ordersJson = safeJsonInline(dash.orders);
    const partnersJson = safeJsonInline(dash.partners);
    const catsJson = safeJsonInline(dash.categories_list);

    html = html
        .replace(/window\.DT_ADMIN_CSRF_TOKEN\s*=\s*'[^']*';/g, () => `window.DT_ADMIN_CSRF_TOKEN = ${csrfJson};`)
        .replace(/window\.DT_DASH\s*=\s*\{[^\r\n]*\};/g, () => `window.DT_DASH = ${dashJson};`)
        .replace(/window\.DT_GLOBAL_PRODS\s*=\s*\[[^\r\n]*\];/g, () => `window.DT_GLOBAL_PRODS = ${prodsJson};`)
        .replace(/window\.DT_GLOBAL_ORDERS\s*=\s*\[[^\r\n]*\];/g, () => `window.DT_GLOBAL_ORDERS = ${ordersJson};`)
        .replace(
            /window\.DT_GLOBAL_PARTNERS\s*=\s*\[[^\r\n]*\];/g,
            () => `window.DT_GLOBAL_PARTNERS = ${partnersJson};`
        )
        .replace(/window\.SERVER_ORDERS\s*=\s*\[[^\r\n]*\];/g, () => `window.SERVER_ORDERS = ${ordersJson};`)
        .replace(/window\.DT_ORDER_PRODUCTS\s*=\s*\[[^\r\n]*\];/g, () => `window.DT_ORDER_PRODUCTS = ${prodsJson};`)
        .replace(/window\.DT_SHIPPING_ORDERS\s*=\s*\[[^\r\n]*\];/g, () => `window.DT_SHIPPING_ORDERS = ${ordersJson};`)
        .replace(
            /window\.DT_AVAILABLE_CATEGORIES\s*=\s*\[[^\r\n]*\];/g,
            () => `window.DT_AVAILABLE_CATEGORIES = ${catsJson};`
        );

    const bridgeHeadScript = `<script>window.DT_ADMIN_USER=${safeJsonInline(session.admin)};window.DT_ADMIN_CSRF_TOKEN=${csrfJson};window.DT_DASH=window.DT_DASH||${dashJson};(function(){var f=window.fetch;if(!f||f.__dtCsrfPatched)return;var w=function(u,o){var s=typeof u==="string"?u:(u&&u.url)||"";var m=((o&&o.method)||"GET").toUpperCase();if(s.indexOf("/api/")!==-1&&m!=="GET"&&m!=="HEAD"){o=Object.assign({},o||{});var h=new Headers(o.headers||{});if(!h.has("X-CSRF-Token")&&window.DT_ADMIN_CSRF_TOKEN)h.set("X-CSRF-Token",window.DT_ADMIN_CSRF_TOKEN);o.headers=h;if(!o.credentials)o.credentials="same-origin";}return f.call(this,u,o);};w.__dtCsrfPatched=true;window.fetch=w;})();</script>`;
    if (html.toLowerCase().includes('</head>')) {
        html = injectBeforeLastTag(html, '</head>', bridgeHeadScript);
    }
    const bridgeTag = `<script src="/admin/assets/js/admin-edge-bridge.js?v=cf"></script>`;
    html = html.toLowerCase().includes('</body>')
        ? injectBeforeLastTag(html, '</body>', bridgeTag)
        : `${bridgeHeadScript}\n${html}\n${bridgeTag}`;

    return new Response(html, {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'x-frame-options': 'SAMEORIGIN',
            'referrer-policy': 'strict-origin-when-cross-origin',
            'x-dt-edge': 'cloudflare-workers-admin-d1',
        },
    });
}

async function servePageTemplate(url, env, session, templateName) {
    const assetReq = new Request(new URL(`/_pages/${templateName}`, url.origin), {
        method: 'GET',
        headers: { accept: 'text/html' },
    });
    const assetRes = await env.ASSETS.fetch(assetReq);
    if (!assetRes.ok) {
        return new Response('Storefront template not found.', { status: 404 });
    }

    let html = rewriteOriginUrls(await assetRes.text(), url);

    const [prodRes, catRes] = await Promise.all([
        env.DB.prepare("SELECT * FROM products WHERE status != 'draft' ORDER BY id ASC").all(),
        env.DB.prepare("SELECT * FROM categories WHERE status = 'active' ORDER BY display_order ASC").all(),
    ]);
    const products = (prodRes.results || []).map((r) => normalizeProduct(r, session.userRole));
    const categories = (catRes.results || []).map((c) => ({
        id: Number(c.id),
        name: c.name,
        slug: c.slug,
        image: c.image,
        description: c.description,
        count: Number(c.products_count || 0),
    }));

    const secret = await getSigningSecret(env);
    const csrfToken = await signToken({ sid: session.sid, exp: Date.now() + 86400000 }, secret);
    const userPayload = session.user ? { id: session.user.id, name: session.user.name, type: session.userRole } : null;

    const hydrationScript = `<script>
window.DT_CSRF_TOKEN = ${JSON.stringify(csrfToken)};
window.DT_CURRENT_USER = ${JSON.stringify(userPayload)};
window.shopProductsData = ${JSON.stringify(products)};
window.allProducts = window.shopProductsData;
window.products = window.allProducts;
window.catalogProducts = window.allProducts;
window.allCategories = ${JSON.stringify(categories)};
</script>`;

    if (html.toLowerCase().includes('</head>')) {
        html = injectBeforeLastTag(html, '</head>', hydrationScript);
    }

    const headers = new Headers(assetRes.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'no-store');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('x-frame-options', 'SAMEORIGIN');
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
    headers.set('x-dt-edge', 'cloudflare-workers-d1-kv');
    if (session.sidNew) {
        headers.append('set-cookie', buildCookieHeader(SID_COOKIE, session.sid, 86400 * 30, true));
    }

    return new Response(html, { status: 200, headers });
}

async function handleSitemap(url, env) {
    const [prodRes, catRes] = await Promise.all([
        env.DB.prepare("SELECT id, slug FROM products WHERE status != 'draft' ORDER BY id ASC").all(),
        env.DB.prepare("SELECT slug FROM categories WHERE status = 'active' ORDER BY display_order ASC").all(),
    ]);
    const origin = url.origin;

    const urls = [
        '/',
        '/shop',
        '/wholesale',
        '/reseller',
        '/retailer',
        '/about-us',
        '/contact',
        '/track',
        '/privacy',
        '/shipping',
        '/terms',
        ...(catRes.results || []).map((c) => `/shop?category=${encodeURIComponent(c.slug)}`),
        ...(prodRes.results || []).map((p) => `/product.php?id=${p.id}`),
    ];

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((u) => `  <url><loc>${origin}${u}</loc></url>`),
        '</urlset>',
    ].join('\n');

    return new Response(xml, {
        status: 200,
        headers: { 'content-type': 'application/xml; charset=utf-8' },
    });
}

async function handleProductPage(url, env, session) {
    const path = url.pathname;
    const idParam = Number(url.searchParams.get('id') || 0);
    const slugParam = path.startsWith('/product/')
        ? decodeURIComponent(path.slice('/product/'.length))
        : (url.searchParams.get('slug') || '').trim();
    const skuParam = (url.searchParams.get('sku') || '').trim();

    if (idParam === 0 && !slugParam && !skuParam) {
        return Response.redirect(new URL('/shop.php', url.origin).toString(), 302);
    }

    let prod = null;
    if (skuParam) {
        prod = await env.DB.prepare('SELECT id FROM products WHERE LOWER(sku) = LOWER(?) LIMIT 1')
            .bind(skuParam)
            .first();
    } else if (slugParam) {
        prod = await env.DB.prepare('SELECT id FROM products WHERE LOWER(slug) = LOWER(?) LIMIT 1')
            .bind(slugParam)
            .first();
    } else if (idParam > 0) {
        prod = await env.DB.prepare('SELECT id FROM products WHERE id = ? LIMIT 1').bind(idParam).first();
    }

    if (!prod) {
        return new Response(
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Product Not Found — DT Brand's</title></head><body style="font-family:Inter,sans-serif;text-align:center;padding:60px 20px;background:#FAF5E8;color:#111827;"><h1>Product Not Found</h1><p>This item is not in our catalogue.</p><p><a href="/shop.php" style="color:#8A681F;font-weight:700;">Browse Collection</a> &middot; <a href="/" style="color:#8A681F;font-weight:700;">Back to Home</a></p></body></html>`,
            { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
        );
    }

    const pid = Number(prod.id);
    const tplName = pid >= 1 && pid <= 8 ? `product-${pid}.html` : 'product-1.html';
    return servePageTemplate(url, env, session, tplName);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        console.log(JSON.stringify({ event: 'request', method: request.method, path }));

        try {
            // 1. Storefront static assets, favicon & robots.txt
            if (path === '/favicon.ico') {
                return env.ASSETS.fetch(new Request(new URL('/assets/images/logo.png', url.origin), { method: 'GET' }));
            }
            if (path.startsWith('/assets/') || path === '/manifest.json') {
                return env.ASSETS.fetch(request);
            }
            if (path === '/robots.txt') {
                const res = await env.ASSETS.fetch(request);
                const text = rewriteOriginUrls(await res.text(), url);
                return new Response(text, {
                    status: 200,
                    headers: { 'content-type': 'text/plain; charset=utf-8' },
                });
            }

            // 2. Cloud Storage public media delivery (/media/<key>)
            if (path.startsWith('/media/')) {
                const fileKey = decodeURIComponent(path.slice('/media/'.length));
                if (!fileKey) {
                    return jsonResponse({ success: false, message: 'Media key is required.' }, 400);
                }
                const obj = await readCloudObject(env, fileKey);
                if (!obj) {
                    return new Response('Media object not found.', { status: 404 });
                }
                return new Response(obj.body, {
                    status: 200,
                    headers: {
                        'content-type': obj.contentType || 'application/octet-stream',
                        'cache-control': 'public, max-age=31536000, immutable',
                        'x-content-type-options': 'nosniff',
                    },
                });
            }

            // 3. Edge Health Probes
            if (path === '/_worker/health' || path === '/health.php') {
                const [prodRow, tblRow] = await Promise.all([
                    env.DB.prepare('SELECT COUNT(*) AS cnt FROM products').first(),
                    env.DB.prepare(
                        "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'"
                    ).first(),
                ]);
                let kvReady = false;
                if (env.KV) {
                    try {
                        await env.KV.get('health:ping');
                        kvReady = true;
                    } catch {
                        kvReady = false;
                    }
                }
                return jsonResponse({
                    ok: true,
                    success: true,
                    status: 'healthy',
                    service: 'dt-brands-cloudflare-storefront',
                    database: 'cloudflare-d1',
                    tables: Number(tblRow?.cnt || 0),
                    products: Number(prodRow?.cnt || 0),
                    kv_ready: kvReady,
                    services: getStorageStatus(env),
                });
            }

            // 4. Dynamic Sitemap from D1
            if (path === '/sitemap.xml' || path === '/sitemap.php') {
                return handleSitemap(url, env);
            }

            // Fast-path static admin assets before session parsing
            if (path.startsWith('/admin/') && ADMIN_STATIC_EXT_RE.test(path)) {
                return env.ASSETS.fetch(request);
            }

            await ensureRuntimeSchema(env);
            const session = await getSessionContext(request, env);

            // 5. Complete REST & Legacy API Mapping (/api & /api/*)
            if (path === '/api' || path.startsWith('/api/')) {
                return routeApiRequest(request, url, env, session);
            }

            // 6. Real Enterprise Admin Panel (/admin/*, /admin.php, /adminlogin.php)
            if (path.startsWith('/admin') || path === '/admin.php' || path === '/adminlogin.php') {
                return handleAdminRoutes(request, url, env, session);
            }

            // 7. Contact Form Submission -> D1 + Email Outbox
            if ((path === '/contact' || path === '/contact.php') && request.method === 'POST') {
                const body = await readRequestBody(request);
                const name = String(body.name || '').trim();
                const message = String(body.message || '').trim();
                const email = String(body.email || '').trim();
                const phone = String(body.phone || '').trim();
                const subject = String(body.subject || 'Storefront Enquiry').trim();
                if (!name || !message) {
                    return jsonResponse({ success: false, message: 'Name and message are required.' }, 400);
                }
                await env.DB.prepare(
                    'INSERT INTO contact_messages (name, phone, email, subject, message) VALUES (?, ?, ?, ?, ?)'
                )
                    .bind(name, phone, email, subject, message)
                    .run();

                let emailNotification = null;
                if (email && email.includes('@')) {
                    emailNotification = await sendTransactionalEmail(env, {
                        to: email,
                        from: `noreply@${url.hostname}`,
                        subject: `Enquiry Received: ${subject}`,
                        html: `<p>Dear ${escapeHtml(name)},</p><p>Thank you for contacting DT Brand's &amp; Jai Hanuman Tex. Our Surat concierge team will reply shortly.</p>`,
                        eventType: 'contact_enquiry',
                    });
                }

                return jsonResponse({
                    success: true,
                    message: 'Thank you! Our Surat concierge team will reply shortly.',
                    email_notification: emailNotification,
                });
            }

            // 8. Product Detail Pages
            if (path === '/product' || path === '/product.php' || path.startsWith('/product/')) {
                return handleProductPage(url, env, session);
            }

            // 9. Storefront HTML Pages
            const cleanPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
            if (Object.prototype.hasOwnProperty.call(PAGE_ROUTES, cleanPath)) {
                return servePageTemplate(url, env, session, PAGE_ROUTES[cleanPath]);
            }

            return new Response(
                `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>404 — DT Brand's</title></head><body style="font-family:Inter,sans-serif;text-align:center;padding:60px 20px;background:#FAF5E8;color:#111827;"><h1>Page Not Found</h1><p><a href="/" style="color:#8A681F;font-weight:700;">Return to Storefront</a></p></body></html>`,
                { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } }
            );
        } catch (err) {
            console.error(
                JSON.stringify({
                    event: 'worker_error',
                    path,
                    error: err instanceof Error ? err.message : String(err),
                })
            );
            return jsonResponse({ success: false, message: 'Internal server error.' }, 500);
        }
    },
};
