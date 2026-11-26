/**
 * DT Brand's & Jai Hanuman Tex — Cloudflare Workers Edge Storefront,
 * D1 SQL API Gateway, KV/R2 Cloud Storage & Transactional Email Service.
 */

import { renderAdminConsoleHtml } from './lib/admin-ui.js';
import { routeApiRequest } from './lib/api-handlers.js';
import { getStorageStatus, readCloudObject, sendTransactionalEmail } from './lib/storage.js';
import {
    SID_COOKIE,
    buildCookieHeader,
    getSessionContext,
    getSigningSecret,
    jsonResponse,
    normalizeProduct,
    readRequestBody,
    signToken,
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

const ADMIN_ROUTES = new Set([
    '/admin',
    '/admin/',
    '/admin.php',
    '/adminlogin.php',
    '/admin/login.php',
    '/admin/index.php',
]);

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
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

    let html = await assetRes.text();
    const origin = url.origin;
    html = html.replace(/https:\/\/yourdomain\.com/gi, origin).replace(/http:\/\/yourdomain\.com/gi, origin);

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
</script></head>`;

    if (html.includes('</head>')) {
        html = html.replace('</head>', hydrationScript);
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
            // 1. Static assets & robots.txt
            if (path.startsWith('/assets/') || path === '/manifest.json') {
                return env.ASSETS.fetch(request);
            }
            if (path === '/robots.txt') {
                const res = await env.ASSETS.fetch(request);
                const text = (await res.text()).replace(/https:\/\/yourdomain\.com/gi, url.origin);
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

            const session = await getSessionContext(request, env);

            // 5. Complete REST & Legacy API Mapping (/api & /api/*)
            if (path === '/api' || path.startsWith('/api/')) {
                return routeApiRequest(request, url, env, session);
            }

            // 6. Edge Admin Console (/admin*)
            if (ADMIN_ROUTES.has(path)) {
                return new Response(renderAdminConsoleHtml(url.origin), {
                    status: 200,
                    headers: {
                        'content-type': 'text/html; charset=utf-8',
                        'cache-control': 'no-store',
                        'x-content-type-options': 'nosniff',
                        'x-frame-options': 'SAMEORIGIN',
                        'referrer-policy': 'strict-origin-when-cross-origin',
                    },
                });
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
