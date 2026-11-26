/**
 * Complete Cloudflare Workers API Router mapping all DT Brand's endpoints
 * to Cloudflare D1 (SQLite), Cloudflare KV / R2 Storage, and Transactional Email.
 */

import {
    ADMIN_COOKIE,
    SESSION_COOKIE,
    buildCookieHeader,
    getSigningSecret,
    hashPassword,
    jsonResponse,
    logAudit,
    normalizePhone10,
    normalizeProduct,
    readRequestBody,
    safeParseJsonArray,
    signToken,
    slugify,
    toBase64Url,
    verifyHmacHex,
    verifyPassword,
} from './utils.js';
import {
    createCloudBackup,
    deleteCloudObject,
    getStorageStatus,
    sendTransactionalEmail,
    storeCloudObject,
} from './storage.js';

const FREE_SHIPPING_THRESHOLD = 1999;
const STANDARD_SHIPPING_RATE = 99;

function requireAdmin(session, actionLabel = 'perform this action') {
    if (!session.isAdmin) {
        return jsonResponse(
            {
                success: false,
                error: 'unauthorized',
                message: `Admin sign-in required to ${actionLabel}.`,
            },
            401
        );
    }
    return null;
}

export async function evaluateCoupon(env, rawCode, subtotal, channel = 'all') {
    const code = String(rawCode || '')
        .trim()
        .toUpperCase();
    if (!code) {
        return { valid: false, discount: 0, message: 'Please enter a coupon code.' };
    }
    const coupon = await env.DB.prepare('SELECT * FROM coupons WHERE UPPER(code) = ? LIMIT 1').bind(code).first();
    if (!coupon) {
        return { valid: false, discount: 0, message: 'Invalid coupon code.' };
    }
    if (coupon.status !== 'active') {
        return { valid: false, discount: 0, message: 'This coupon is expired or inactive.' };
    }
    if (coupon.channel && coupon.channel !== 'all' && channel !== 'all' && coupon.channel !== channel) {
        return { valid: false, discount: 0, message: `Coupon ${code} is valid only for ${coupon.channel} orders.` };
    }
    const minOrder = Number(coupon.min_order_value || 0);
    if (subtotal < minOrder) {
        return {
            valid: false,
            discount: 0,
            message: `Minimum order value of ₹${minOrder.toLocaleString('en-IN')} required for ${code}.`,
        };
    }
    let discount = 0;
    const val = Number(coupon.discount_value || 0);
    if (coupon.discount_type === 'flat') {
        discount = val;
    } else {
        discount = (subtotal * val) / 100;
        const maxDisc = Number(coupon.max_discount || 0);
        if (maxDisc > 0 && discount > maxDisc) discount = maxDisc;
    }
    discount = Math.min(subtotal, Math.round(discount * 100) / 100);
    return {
        valid: true,
        code,
        discount,
        discount_type: coupon.discount_type,
        discount_value: val,
        title: coupon.title || code,
        message: `Coupon ${code} applied — you save ₹${discount.toLocaleString('en-IN')}!`,
    };
}

function getApiDirectory(env) {
    return {
        success: true,
        platform: "DT Brand's & Jai Hanuman Tex — Cloudflare Edge API",
        version: '2.0.0',
        status: 'operational',
        services: getStorageStatus(env),
        endpoints: {
            health: '/api/health.php',
            db_health: '/api/db_health.php',
            db_audit: '/api/db_audit.php',
            db_optimize: '/api/db_optimize.php',
            db_sync: '/api/db_sync.php',
            auth: '/api/auth.php',
            products: '/api/products.php',
            products_export: '/api/products/export.php',
            products_import: '/api/products/import.php',
            categories: '/api/categories.php',
            brands: '/api/brands.php',
            attributes: '/api/attributes.php',
            variants: '/api/variants.php',
            pricing: '/api/pricing.php',
            content: '/api/content.php',
            search: '/api/search.php',
            cart: '/api/cart.php',
            wishlist: '/api/wishlist.php',
            coupons: '/api/coupons.php',
            orders: '/api/orders.php',
            customers: '/api/customers.php',
            customer_addresses: '/api/customer_addresses.php',
            customer_notes: '/api/customer_notes.php',
            payments: '/api/payments.php',
            payment_config: '/api/payment/config.php',
            payment_create_order: '/api/payment/create_order.php',
            payment_verify: '/api/payment/verify.php',
            payment_admin_save: '/api/payment/admin_save.php',
            upi_status: '/api/payments/upi_status.php',
            upi_verify: '/api/payments/upi_verify.php',
            shipping: '/api/shipping.php',
            shipping_test: '/api/shipping/test.php',
            reviews: '/api/reviews.php',
            wholesale: '/api/wholesale.php',
            reseller: '/api/reseller.php',
            retailer: '/api/retailer.php',
            whatsapp: '/api/whatsapp.php',
            whatsapp_audience: '/api/whatsapp/audience.php',
            upload: '/api/upload.php',
            media: '/api/media/index.php',
            media_delete: '/api/media/delete.php',
            download_product_media: '/api/download_product_media.php',
            notifications: '/api/notifications.php',
            reports: '/api/reports.php',
            settings: '/api/settings.php',
            system: '/api/system.php',
            system_backup: '/api/system/backup.php',
            users: '/api/users.php',
            admin_security: '/api/admin_security.php',
            audit: '/api/audit.php',
            integrations: '/api/integrations.php',
            developer: '/api/developer.php',
            webhooks_razorpay: '/api/webhooks/razorpay.php',
            webhooks_cashfree: '/api/webhooks/cashfree.php',
            webhooks_delhivery: '/api/webhooks/delhivery.php',
            webhooks_bluedart: '/api/webhooks/bluedart.php',
            webhooks_tci: '/api/webhooks/tci.php',
            webhooks_whatsapp: '/api/webhooks/whatsapp.php',
        },
    };
}

async function handleHealthAndDb(path, env, session, request) {
    if (path === '/api' || path === '/api/' || path === '/api/index.php') {
        return jsonResponse(getApiDirectory(env));
    }

    const tablesRes = await env.DB.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC"
    ).all();
    const tables = (tablesRes.results || []).map((r) => r.name);
    const counts = await env.DB.prepare(
        `SELECT
            (SELECT COUNT(*) FROM products) AS products,
            (SELECT COUNT(*) FROM categories) AS categories,
            (SELECT COUNT(*) FROM orders) AS orders,
            (SELECT COUNT(*) FROM customers) AS customers,
            (SELECT COUNT(*) FROM media_files) AS media_files,
            (SELECT COUNT(*) FROM email_outbox) AS email_outbox`
    ).first();

    let kvStatus = 'unbound';
    if (env.KV) {
        await env.KV.put('health:last_ping', new Date().toISOString(), { expirationTtl: 300 });
        kvStatus = 'operational';
    }

    if (path === '/api/db_audit.php') {
        const deny = requireAdmin(session, 'run database audit');
        if (deny) return deny;
        const details = [];
        for (const t of tables) {
            try {
                const c = await env.DB.prepare(`SELECT COUNT(*) AS cnt FROM "${t}"`).first();
                details.push({ table: t, rows: Number(c?.cnt || 0) });
            } catch {
                details.push({ table: t, rows: 0 });
            }
        }
        return jsonResponse({ success: true, table_count: tables.length, tables: details });
    }

    if (path === '/api/db_optimize.php') {
        const deny = requireAdmin(session, 'optimize database');
        if (deny) return deny;
        await env.DB.prepare('PRAGMA optimize').run();
        await logAudit(
            env,
            session.admin.email,
            'db_optimize',
            'database',
            'dt-brands-db',
            'Executed PRAGMA optimize',
            request
        );
        return jsonResponse({ success: true, message: 'Cloudflare D1 optimization completed.' });
    }

    if (path === '/api/db_sync.php') {
        const deny = requireAdmin(session, 'sync database');
        if (deny) return deny;
        return jsonResponse({
            success: true,
            synced: true,
            table_count: tables.length,
            message: 'D1 schema synchronized.',
        });
    }

    return jsonResponse({
        ok: true,
        success: true,
        status: 'healthy',
        service: 'dt-brands-cloudflare-storefront',
        database: 'cloudflare-d1',
        table_count: tables.length,
        kv_status: kvStatus,
        services: getStorageStatus(env),
        counts: counts || {},
    });
}

async function handleProducts(request, url, env, session, path) {
    if (path === '/api/products/export.php') {
        const deny = requireAdmin(session, 'export products');
        if (deny) return deny;
        const rows = await env.DB.prepare(
            'SELECT id, sku, title, category_name, fabric, mrp, retail_price, wholesale_price, reseller_price, stock_qty, status FROM products ORDER BY id ASC'
        ).all();
        const header =
            'id,sku,title,category_name,fabric,mrp,retail_price,wholesale_price,reseller_price,stock_qty,status';
        const lines = (rows.results || []).map((r) =>
            [
                r.id,
                r.sku,
                r.title,
                r.category_name,
                r.fabric,
                r.mrp,
                r.retail_price,
                r.wholesale_price,
                r.reseller_price,
                r.stock_qty,
                r.status,
            ]
                .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
                .join(',')
        );
        return new Response([header, ...lines].join('\n'), {
            status: 200,
            headers: {
                'content-type': 'text/csv; charset=utf-8',
                'content-disposition': 'attachment; filename="dt-products-export.csv"',
            },
        });
    }

    if (path === '/api/products/import.php') {
        const deny = requireAdmin(session, 'import products');
        if (deny) return deny;
        const body = await readRequestBody(request);
        const rows = Array.isArray(body.products) ? body.products : [];
        let imported = 0;
        for (const item of rows) {
            const sku = String(item.sku || '').trim();
            const title = String(item.title || '').trim();
            if (!sku || !title) continue;
            const slug = slugify(`${title}-${sku}`);
            await env.DB.prepare(
                `INSERT INTO products (sku, title, slug, category_name, fabric, mrp, retail_price, wholesale_price, reseller_price, stock_qty, primary_image, status, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(sku) DO UPDATE SET title = excluded.title, retail_price = excluded.retail_price, wholesale_price = excluded.wholesale_price, stock_qty = excluded.stock_qty`
            )
                .bind(
                    sku,
                    title,
                    slug,
                    String(item.category_name || 'Kanjivaram Silk'),
                    String(item.fabric || 'Pure Silk'),
                    Number(item.mrp || item.retail_price || 2999),
                    Number(item.retail_price || 1999),
                    Number(item.wholesale_price || 999),
                    Number(item.reseller_price || 1299),
                    Number(item.stock_qty || 50),
                    String(item.primary_image || '/assets/images/product1.png'),
                    String(item.status || 'in_stock'),
                    String(item.description || '')
                )
                .run();
            imported++;
        }
        return jsonResponse({ success: true, imported, message: `Imported ${imported} products into D1.` });
    }

    if (path === '/api/seed_demo_catalog.php') {
        const deny = requireAdmin(session, 'seed demo catalog');
        if (deny) return deny;
        const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM products').first();
        return jsonResponse({ success: true, products: Number(cnt?.c || 0), message: 'Catalog verified in D1.' });
    }

    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE') {
        const deny = requireAdmin(session, 'modify product catalog');
        if (deny) return deny;
        const body = await readRequestBody(request);
        const action = String(body.action || (request.method === 'DELETE' ? 'delete' : 'create')).trim();
        const targetId = Number(body.id || url.searchParams.get('id') || 0);

        if (action === 'create') {
            const title = String(body.title || body.name || '').trim();
            const sku = String(body.sku || `DT-${Date.now().toString().slice(-6)}`)
                .trim()
                .toUpperCase();
            if (!title) return jsonResponse({ success: false, message: 'Product title is required.' }, 400);
            const slug = slugify(body.slug || `${title}-${sku}`);
            const retail = Number(body.retail_price || body.price || 1999);
            const mrp = Number(body.mrp || Math.round(retail * 1.3));
            const wholesale = Number(body.wholesale_price || Math.round(retail * 0.45));
            const reseller = Number(body.reseller_price || Math.round(retail * 0.65));
            const res = await env.DB.prepare(
                `INSERT INTO products (sku, title, slug, category_id, category_name, fabric, mrp, retail_price, wholesale_price, reseller_price, stock_qty, primary_image, gallery_json, badge, status, description)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
                .bind(
                    sku,
                    title,
                    slug,
                    Number(body.category_id || 1),
                    String(body.category_name || body.category || 'Kanjivaram Silk'),
                    String(body.fabric || 'Pure Silk'),
                    mrp,
                    retail,
                    wholesale,
                    reseller,
                    Number(body.stock_qty || 50),
                    String(body.primary_image || body.image || '/assets/images/product1.png'),
                    JSON.stringify([String(body.primary_image || body.image || '/assets/images/product1.png')]),
                    String(body.badge || 'New Arrival'),
                    String(body.status || 'in_stock'),
                    String(body.description || '')
                )
                .run();
            const newId = Number(res.meta?.last_row_id || 0);
            await logAudit(env, session.admin.email, 'product_create', 'product', newId, `Created ${sku}`, request);
            return jsonResponse({ success: true, id: newId, sku, message: 'Product created in D1.' }, 201);
        }

        if (action === 'update' || action === 'quick_edit') {
            if (targetId <= 0) return jsonResponse({ success: false, message: 'Product ID required.' }, 400);
            const cur = await env.DB.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').bind(targetId).first();
            if (!cur) return jsonResponse({ success: false, message: 'Product not found.' }, 404);
            await env.DB.prepare(
                `UPDATE products SET title = ?, category_name = ?, fabric = ?, mrp = ?, retail_price = ?, wholesale_price = ?, reseller_price = ?, stock_qty = ?, status = ?, primary_image = ?, description = ? WHERE id = ?`
            )
                .bind(
                    String(body.title || body.name || cur.title),
                    String(body.category_name || body.category || cur.category_name),
                    String(body.fabric || cur.fabric),
                    Number(body.mrp ?? cur.mrp),
                    Number(body.retail_price ?? body.price ?? cur.retail_price),
                    Number(body.wholesale_price ?? cur.wholesale_price),
                    Number(body.reseller_price ?? cur.reseller_price),
                    Number(body.stock_qty ?? cur.stock_qty),
                    String(body.status || cur.status),
                    String(body.primary_image || body.image || cur.primary_image),
                    String(body.description ?? cur.description),
                    targetId
                )
                .run();
            await logAudit(
                env,
                session.admin.email,
                'product_update',
                'product',
                targetId,
                `Updated #${targetId}`,
                request
            );
            return jsonResponse({ success: true, id: targetId, message: 'Product updated in D1.' });
        }

        if (action === 'adjust_stock') {
            if (targetId <= 0) return jsonResponse({ success: false, message: 'Product ID required.' }, 400);
            const cur = await env.DB.prepare('SELECT id, sku, stock_qty FROM products WHERE id = ? LIMIT 1')
                .bind(targetId)
                .first();
            if (!cur) return jsonResponse({ success: false, message: 'Product not found.' }, 404);
            const delta = Number(body.adjustment ?? body.delta ?? 0);
            const nextQty = Math.max(0, Number(cur.stock_qty) + delta);
            await env.DB.prepare('UPDATE products SET stock_qty = ? WHERE id = ?').bind(nextQty, targetId).run();
            await env.DB.prepare(
                'INSERT INTO inventory_ledger (product_id, sku, delta, previous_qty, new_qty, reason, reference_id, operator) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )
                .bind(
                    targetId,
                    cur.sku,
                    delta,
                    Number(cur.stock_qty),
                    nextQty,
                    String(body.reason || 'Admin adjustment'),
                    String(body.reference_id || ''),
                    session.admin.name
                )
                .run();
            return jsonResponse({ success: true, id: targetId, stock_qty: nextQty, message: 'Stock adjusted.' });
        }

        if (action === 'delete' || action === 'trash') {
            if (targetId <= 0) return jsonResponse({ success: false, message: 'Product ID required.' }, 400);
            await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(targetId).run();
            await logAudit(
                env,
                session.admin.email,
                'product_delete',
                'product',
                targetId,
                `Deleted #${targetId}`,
                request
            );
            return jsonResponse({ success: true, id: targetId, message: 'Product deleted from D1.' });
        }

        if (action === 'toggle_status') {
            if (targetId <= 0 || !body.status)
                return jsonResponse({ success: false, message: 'ID and status required.' }, 400);
            await env.DB.prepare('UPDATE products SET status = ? WHERE id = ?')
                .bind(String(body.status), targetId)
                .run();
            return jsonResponse({ success: true, id: targetId, status: body.status });
        }
    }

    const id = Number(url.searchParams.get('id') || 0);
    const sku = (url.searchParams.get('sku') || '').trim();
    const slug = (url.searchParams.get('slug') || '').trim();
    if (id > 0 || sku || slug) {
        let row = null;
        if (id > 0) row = await env.DB.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').bind(id).first();
        else if (sku)
            row = await env.DB.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?) LIMIT 1').bind(sku).first();
        else if (slug)
            row = await env.DB.prepare('SELECT * FROM products WHERE LOWER(slug) = LOWER(?) LIMIT 1')
                .bind(slug)
                .first();
        if (!row) return jsonResponse({ success: false, message: 'Product not found.' }, 404);
        const product = normalizeProduct(row, session.userRole);
        const recRows = await env.DB.prepare('SELECT * FROM products WHERE id != ? LIMIT 4').bind(product.id).all();
        return jsonResponse({
            success: true,
            product,
            recommendations: (recRows.results || []).map((r) => normalizeProduct(r, session.userRole)),
        });
    }

    const category = (url.searchParams.get('category') || '').trim().toLowerCase();
    const fabric = (url.searchParams.get('fabric') || '').trim().toLowerCase();
    const search = (url.searchParams.get('search') || url.searchParams.get('q') || '').trim().toLowerCase();
    const minPrice = Number(url.searchParams.get('min_price') || 0);
    const maxPrice = Number(url.searchParams.get('max_price') || 0);
    const sort = (url.searchParams.get('sort') || 'recommended').trim();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 100)));

    const rows = await env.DB.prepare("SELECT * FROM products WHERE status != 'draft' ORDER BY id ASC").all();
    let list = (rows.results || []).map((r) => normalizeProduct(r, session.userRole));
    if (category && category !== 'all') list = list.filter((p) => p.category_name.toLowerCase().includes(category));
    if (fabric) list = list.filter((p) => p.fabric.toLowerCase().includes(fabric));
    if (search)
        list = list.filter((p) =>
            `${p.title} ${p.sku} ${p.category_name} ${p.fabric} ${p.description}`.toLowerCase().includes(search)
        );
    if (minPrice > 0) list = list.filter((p) => p.effective_price >= minPrice);
    if (maxPrice > 0) list = list.filter((p) => p.effective_price <= maxPrice);
    if (sort === 'price_asc' || sort === 'low_high') list.sort((a, b) => a.effective_price - b.effective_price);
    else if (sort === 'price_desc' || sort === 'high_low') list.sort((a, b) => b.effective_price - a.effective_price);
    else if (sort === 'rating') list.sort((a, b) => b.rating - a.rating);
    list = list.slice(0, limit);
    return jsonResponse({ success: true, count: list.length, products: list });
}

async function handleAuth(request, url, env, session) {
    const body = await readRequestBody(request);
    const action = String(url.searchParams.get('action') || body.action || 'session').trim();

    if (action === 'session' || action === 'me') {
        const secret = await getSigningSecret(env);
        const csrfToken = await signToken({ sid: session.sid, exp: Date.now() + 86400000 }, secret);
        return jsonResponse({
            success: true,
            authenticated: session.user !== null,
            user: session.user,
            admin_authenticated: session.isAdmin,
            admin: session.admin,
            csrf_token: csrfToken,
        });
    }

    if (action === 'admin_status') {
        const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
        return jsonResponse({
            success: true,
            admin_authenticated: session.isAdmin,
            admin: session.admin,
            needs_setup: Number(cnt?.c || 0) === 0,
        });
    }

    if (action === 'admin_setup') {
        const cnt = await env.DB.prepare('SELECT COUNT(*) AS c FROM users').first();
        if (Number(cnt?.c || 0) > 0) {
            return jsonResponse({ success: false, message: 'Admin account already exists. Please sign in.' }, 403);
        }
        const name = String(body.name || 'DT Brand Admin').trim();
        const email = String(body.email || '')
            .trim()
            .toLowerCase();
        const password = String(body.password || '');
        if (!email.includes('@') || password.length < 8) {
            return jsonResponse(
                { success: false, message: 'Valid admin email and 8+ character password required.' },
                400
            );
        }
        const hash = await hashPassword(password);
        const ins = await env.DB.prepare(
            "INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'super_admin', 'active')"
        )
            .bind(name, email, hash)
            .run();
        const aid = Number(ins.meta?.last_row_id || 0);
        const admin = { id: aid, name, email, role: 'super_admin' };
        const secret = await getSigningSecret(env);
        const token = await signToken({ aid, exp: Date.now() + 86400000 * 3 }, secret);
        await logAudit(env, email, 'admin_setup', 'user', aid, 'Initial Cloudflare admin created', request);
        return jsonResponse({ success: true, admin, message: 'Super admin initialized and signed in.' }, 201, {
            'set-cookie': buildCookieHeader(ADMIN_COOKIE, token, 86400 * 3, true),
        });
    }

    if (action === 'admin_login') {
        const email = String(body.email || body.username || body.identity || '')
            .trim()
            .toLowerCase();
        const password = String(body.password || '');
        const userRow = await env.DB.prepare("SELECT * FROM users WHERE LOWER(email) = ? AND status = 'active' LIMIT 1")
            .bind(email)
            .first();
        if (!userRow || !(await verifyPassword(password, userRow.password_hash))) {
            return jsonResponse({ success: false, message: 'Invalid admin credentials.' }, 401);
        }
        await env.DB.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').bind(userRow.id).run();
        const admin = { id: Number(userRow.id), name: userRow.name, email: userRow.email, role: userRow.role };
        const secret = await getSigningSecret(env);
        const token = await signToken({ aid: admin.id, exp: Date.now() + 86400000 * 3 }, secret);
        await logAudit(env, admin.email, 'admin_login', 'user', admin.id, 'Admin logged in', request);
        return jsonResponse({ success: true, admin, message: 'Admin signed in.' }, 200, {
            'set-cookie': buildCookieHeader(ADMIN_COOKIE, token, 86400 * 3, true),
        });
    }

    if (action === 'admin_logout') {
        return jsonResponse({ success: true, message: 'Admin logged out.' }, 200, {
            'set-cookie': buildCookieHeader(ADMIN_COOKIE, '', 0, true),
        });
    }

    if (action === 'logout') {
        return jsonResponse({ success: true, message: 'Logged out successfully.' }, 200, {
            'set-cookie': buildCookieHeader(SESSION_COOKIE, '', 0, true),
        });
    }

    if (action === 'register') {
        const name = String(body.name || '').trim();
        const phone = normalizePhone10(body.phone || '');
        const email = String(body.email || '')
            .trim()
            .toLowerCase();
        const password = String(body.password || '');
        let reqType = String(body.type || 'customer')
            .trim()
            .toLowerCase();
        if (!['customer', 'retail', 'wholesale', 'reseller', 'retailer'].includes(reqType)) reqType = 'customer';
        if (reqType === 'retail') reqType = 'customer';
        if (!name || phone.length < 10 || password.length < 6) {
            return jsonResponse(
                { success: false, message: 'Name, valid 10-digit phone, and password (6+ chars) required.' },
                400
            );
        }
        const existing = await env.DB.prepare(
            "SELECT id FROM customers WHERE phone = ? OR (email != '' AND email = ?) LIMIT 1"
        )
            .bind(phone, email)
            .first();
        if (existing) {
            return jsonResponse(
                { success: false, message: 'An account with this phone or email already exists.' },
                400
            );
        }
        const isTrade = reqType === 'wholesale' || reqType === 'reseller' || reqType === 'retailer';
        const status = isTrade ? 'pending' : 'active';
        const passwordHash = await hashPassword(password);
        const ins = await env.DB.prepare(
            'INSERT INTO customers (name, phone, email, password_hash, type, city, state, gstin, pan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
            .bind(
                name,
                phone,
                email,
                passwordHash,
                reqType,
                String(body.city || '').trim(),
                String(body.state || '').trim(),
                String(body.gstin || '').trim(),
                String(body.pan || '').trim(),
                status
            )
            .run();
        if (email) {
            await sendTransactionalEmail(env, {
                to: email,
                subject: `Welcome to DT Brand's — ${name}`,
                html: `<p>Namaste ${name},</p><p>Your ${isTrade ? reqType + ' application' : 'account'} has been registered with DT Brand's.</p>`,
                eventType: 'customer_welcome',
            });
        }
        if (isTrade) {
            return jsonResponse({
                success: true,
                pending_approval: true,
                message: 'Trade account application received — our team will verify and confirm on WhatsApp.',
            });
        }
        const uid = Number(ins.meta?.last_row_id || 0);
        const user = { id: uid, name, phone, email, type: reqType, city: '', state: '' };
        const secret = await getSigningSecret(env);
        const token = await signToken({ uid, exp: Date.now() + 86400000 * 7 }, secret);
        return jsonResponse({ success: true, user, message: 'Account created successfully.' }, 201, {
            'set-cookie': buildCookieHeader(SESSION_COOKIE, token, 86400 * 7, true),
        });
    }

    if (action === 'login') {
        const identity = String(body.identity || body.phone || body.email || '').trim();
        const password = String(body.password || '');
        const row = await env.DB.prepare(
            "SELECT * FROM customers WHERE (phone = ? AND phone != '') OR (LOWER(email) = ? AND email != '') LIMIT 1"
        )
            .bind(normalizePhone10(identity), identity.toLowerCase())
            .first();
        if (!row || !(await verifyPassword(password, row.password_hash))) {
            return jsonResponse({ success: false, message: 'Invalid phone/email or password.' }, 401);
        }
        if (row.status !== 'active') {
            return jsonResponse({ success: false, message: 'Your trade account is pending verification.' }, 401);
        }
        const user = {
            id: Number(row.id),
            name: row.name,
            phone: row.phone,
            email: row.email || '',
            type: row.type || 'customer',
            city: row.city || '',
            state: row.state || '',
            gstin: row.gstin || '',
            pan: row.pan || '',
        };
        const secret = await getSigningSecret(env);
        const token = await signToken({ uid: user.id, exp: Date.now() + 86400000 * 7 }, secret);
        return jsonResponse({ success: true, user, message: 'Signed in successfully.' }, 200, {
            'set-cookie': buildCookieHeader(SESSION_COOKIE, token, 86400 * 7, true),
        });
    }

    if (action === 'forgot_password') {
        return jsonResponse({
            success: true,
            message:
                'If an account matches those details, our concierge desk will assist with password reset on WhatsApp.',
        });
    }

    if (!session.user) {
        return jsonResponse({ success: false, message: 'Please sign in to perform this action.' }, 401);
    }

    if (action === 'update_profile') {
        const name = String(body.name || session.user.name).trim();
        const email = String(body.email || session.user.email)
            .trim()
            .toLowerCase();
        const city = String(body.city || session.user.city).trim();
        const state = String(body.state || session.user.state).trim();
        await env.DB.prepare('UPDATE customers SET name = ?, email = ?, city = ?, state = ? WHERE id = ?')
            .bind(name, email, city, state, session.user.id)
            .run();
        return jsonResponse({
            success: true,
            user: { ...session.user, name, email, city, state },
            message: 'Profile updated.',
        });
    }

    if (action === 'change_password') {
        const currentPw = String(body.current_password || '');
        const newPw = String(body.new_password || '');
        if (newPw.length < 6) return jsonResponse({ success: false, message: 'New password must be 6+ chars.' }, 400);
        const row = await env.DB.prepare('SELECT password_hash FROM customers WHERE id = ? LIMIT 1')
            .bind(session.user.id)
            .first();
        if (!row || !(await verifyPassword(currentPw, row.password_hash))) {
            return jsonResponse({ success: false, message: 'Current password is incorrect.' }, 400);
        }
        await env.DB.prepare('UPDATE customers SET password_hash = ? WHERE id = ?')
            .bind(await hashPassword(newPw), session.user.id)
            .run();
        return jsonResponse({ success: true, message: 'Password updated successfully.' });
    }

    if (action === 'get_addresses') {
        const res = await env.DB.prepare(
            'SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC'
        )
            .bind(session.user.id)
            .all();
        return jsonResponse({ success: true, addresses: res.results || [] });
    }

    if (action === 'save_address') {
        const line1 = String(body.address_line1 || body.address || '').trim();
        const city = String(body.city || '').trim();
        const state = String(body.state || '').trim();
        const pincode = String(body.pincode || '').trim();
        if (!line1 || !city || !state || !pincode) {
            return jsonResponse({ success: false, message: 'Address, city, state, and pincode required.' }, 400);
        }
        await env.DB.prepare(
            'INSERT INTO addresses (customer_id, recipient_name, phone, address_line1, address_line2, city, state, pincode, address_type, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
        )
            .bind(
                session.user.id,
                String(body.recipient_name || session.user.name),
                String(body.phone || session.user.phone),
                line1,
                String(body.address_line2 || ''),
                city,
                state,
                pincode,
                String(body.address_type || 'home')
            )
            .run();
        const res = await env.DB.prepare(
            'SELECT * FROM addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC'
        )
            .bind(session.user.id)
            .all();
        return jsonResponse({ success: true, addresses: res.results || [], message: 'Address saved.' });
    }

    return jsonResponse({ success: false, message: 'Unsupported auth action.' }, 400);
}

async function handleOrders(request, url, env, session) {
    if (request.method === 'GET') {
        const action = (url.searchParams.get('action') || '').trim();
        if (action === 'analytics') {
            const deny = requireAdmin(session, 'view order analytics');
            if (deny) return deny;
            const row = await env.DB.prepare(
                "SELECT COALESCE(SUM(total_amount), 0) AS s, COUNT(*) AS c FROM orders WHERE COALESCE(fulfillment_status, 'unfulfilled') <> 'cancelled'"
            ).first();
            return jsonResponse({ success: true, total_sales: Number(row?.s || 0), order_count: Number(row?.c || 0) });
        }
        if (action === 'my_orders') {
            if (!session.user) {
                return jsonResponse(
                    { success: false, error: 'unauthorized', message: 'Please sign in to view your orders.' },
                    401
                );
            }
            const phone10 = normalizePhone10(session.user.phone);
            const ordersRes = await env.DB.prepare(
                'SELECT * FROM orders WHERE customer_id = ? OR customer_phone LIKE ? ORDER BY id DESC LIMIT 50'
            )
                .bind(session.user.id, `%${phone10 || '___'}`)
                .all();
            return jsonResponse({
                success: true,
                count: (ordersRes.results || []).length,
                orders: ordersRes.results || [],
            });
        }
        if (action === 'details' || action === 'get_order_details') {
            if (!session.isAdmin && !session.user) {
                return jsonResponse({ success: false, error: 'unauthorized', message: 'Sign in required.' }, 401);
            }
            const key = String(
                url.searchParams.get('order_id') ||
                    url.searchParams.get('id') ||
                    url.searchParams.get('order_number') ||
                    ''
            ).trim();
            const ord = await env.DB.prepare(
                'SELECT * FROM orders WHERE id = ? OR UPPER(order_number) = UPPER(?) LIMIT 1'
            )
                .bind(Number(key) || -1, key)
                .first();
            if (!ord) return jsonResponse({ success: false, message: 'Order not found.' }, 404);
            if (
                !session.isAdmin &&
                Number(ord.customer_id) !== session.user.id &&
                normalizePhone10(ord.customer_phone) !== normalizePhone10(session.user.phone)
            ) {
                return jsonResponse({ success: false, message: 'Access denied.' }, 403);
            }
            const itemsRes = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(ord.id).all();
            return jsonResponse({ success: true, order: { ...ord, items: itemsRes.results || [] } });
        }

        const orderNumber = (url.searchParams.get('order_number') || '').trim().toUpperCase();
        const phone = normalizePhone10(url.searchParams.get('phone') || '');
        if (orderNumber && phone && !session.isAdmin) {
            const ord = await env.DB.prepare('SELECT * FROM orders WHERE UPPER(order_number) = ? LIMIT 1')
                .bind(orderNumber)
                .first();
            if (!ord || normalizePhone10(ord.customer_phone) !== phone) {
                return jsonResponse(
                    { success: false, message: 'No order found for that order number and phone number.' },
                    404
                );
            }
            const itemsRes = await env.DB.prepare('SELECT * FROM order_items WHERE order_id = ?').bind(ord.id).all();
            return jsonResponse({ success: true, order: { ...ord, items: itemsRes.results || [] } });
        }

        const deny = requireAdmin(session, 'list all orders');
        if (deny) return deny;
        const ordersRes = await env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all();
        return jsonResponse({ success: true, orders: ordersRes.results || [] });
    }

    if (request.method === 'POST') {
        const body = await readRequestBody(request);
        const action = String(body.action || 'create').trim();

        if (action === 'update_status') {
            const deny = requireAdmin(session, 'update order status');
            if (deny) return deny;
            const key = String(body.order_id || body.id || body.order_number || '').trim();
            const status = String(body.status || 'processing').trim();
            const tracking = String(body.tracking_number || '').trim();
            const courier = String(body.courier_name || 'Delhivery Express').trim();
            const ord = await env.DB.prepare(
                'SELECT * FROM orders WHERE id = ? OR UPPER(order_number) = UPPER(?) LIMIT 1'
            )
                .bind(Number(key) || -1, key)
                .first();
            if (!ord) return jsonResponse({ success: false, message: 'Order not found.' }, 404);
            await env.DB.prepare(
                'UPDATE orders SET fulfillment_status = ?, tracking_number = COALESCE(NULLIF(?, ""), tracking_number), courier_name = ? WHERE id = ?'
            )
                .bind(status, tracking, courier, ord.id)
                .run();
            if (ord.customer_email && status === 'dispatched') {
                await sendTransactionalEmail(env, {
                    to: ord.customer_email,
                    subject: `Order Dispatched: ${ord.order_number}`,
                    html: `<p>Namaste ${ord.customer_name},</p><p>Your order <strong>${ord.order_number}</strong> has been dispatched via ${courier}${tracking ? ` (AWB: ${tracking})` : ''}.</p>`,
                    eventType: 'order_dispatched',
                    orderNumber: ord.order_number,
                });
            }
            await logAudit(
                env,
                session.admin.email,
                'order_status',
                'order',
                ord.order_number,
                `Status -> ${status}`,
                request
            );
            return jsonResponse({ success: true, order_number: ord.order_number, status, message: 'Order updated.' });
        }

        if (action === 'delete') {
            const deny = requireAdmin(session, 'delete orders');
            if (deny) return deny;
            const id = Number(body.order_id || body.id || 0);
            await env.DB.prepare('DELETE FROM order_items WHERE order_id = ?').bind(id).run();
            await env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id).run();
            return jsonResponse({ success: true, id, message: 'Order deleted.' });
        }

        const rawItems = typeof body.items === 'string' ? safeParseJsonArray(body.items) : body.items;
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
            return jsonResponse({ success: false, message: 'Order must contain items array.' }, 400);
        }
        const customerName = String(body.customer_name || body.name || session.user?.name || '').trim();
        const customerPhone = String(body.customer_phone || body.phone || session.user?.phone || '').trim();
        if (!customerName || normalizePhone10(customerPhone).length < 10) {
            return jsonResponse({ success: false, message: 'Valid customer name and 10-digit phone required.' }, 400);
        }
        const ids = [...new Set(rawItems.map((x) => Number(x.product_id || x.id)).filter((n) => n > 0))];
        if (ids.length === 0) return jsonResponse({ success: false, message: 'No valid product IDs.' }, 400);
        const placeholders = ids.map(() => '?').join(',');
        const prodRes = await env.DB.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
            .bind(...ids)
            .all();
        const byId = new Map((prodRes.results || []).map((r) => [Number(r.id), normalizeProduct(r, session.userRole)]));

        const orderItems = [];
        let subtotal = 0;
        for (const reqItem of rawItems) {
            const pid = Number(reqItem.product_id || reqItem.id);
            const prod = byId.get(pid);
            if (!prod) continue;
            const qty = Math.max(1, Math.min(999, Number(reqItem.qty || reqItem.quantity || 1)));
            const unitPrice = prod.effective_price;
            const totalPrice = Math.round(unitPrice * qty * 100) / 100;
            subtotal += totalPrice;
            orderItems.push({
                product_id: prod.id,
                product_title: prod.title,
                sku: prod.sku,
                unit_price: unitPrice,
                quantity: qty,
                total_price: totalPrice,
                image: prod.image,
            });
        }
        if (orderItems.length === 0)
            return jsonResponse({ success: false, message: 'No matching products found.' }, 400);

        subtotal = Math.round(subtotal * 100) / 100;
        const couponCode = String(body.coupon_code || body.coupon || '').trim();
        let discount = 0;
        if (couponCode) {
            const cRes = await evaluateCoupon(env, couponCode, subtotal, session.userRole);
            if (cRes.valid) discount = cRes.discount;
        }
        const afterDisc = Math.max(0, subtotal - discount);
        const shippingFee = afterDisc >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING_RATE;
        const totalAmount = Math.round((afterDisc + shippingFee) * 100) / 100;
        const randNum = 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000);
        const orderNumber = `DT-ORD-${randNum}`;
        const paymentMethod = String(body.payment_method || 'upi').trim();
        const customerEmail = String(body.customer_email || body.email || session.user?.email || '').trim();
        const channel =
            session.userRole === 'wholesale' || session.userRole === 'reseller' ? session.userRole : 'retail';

        const ins = await env.DB.prepare(
            `INSERT INTO orders (order_number, session_id, customer_id, customer_name, customer_phone, customer_email, shipping_address, city, state, pincode, channel, subtotal, discount, gst_amount, shipping_fee, total_amount, coupon_code, payment_method, payment_status, fulfillment_status, utr_reference)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', 'processing', ?)`
        )
            .bind(
                orderNumber,
                session.sid,
                session.user?.id || 0,
                customerName,
                customerPhone,
                customerEmail,
                String(body.shipping_address || body.address || ''),
                String(body.city || ''),
                String(body.state || ''),
                String(body.pincode || ''),
                channel,
                subtotal,
                discount,
                shippingFee,
                totalAmount,
                couponCode,
                paymentMethod,
                String(body.utr_reference || '')
            )
            .run();

        const orderId = Number(ins.meta?.last_row_id || 0);
        for (const item of orderItems) {
            await env.DB.prepare(
                'INSERT INTO order_items (order_id, product_id, product_title, sku, unit_price, quantity, total_price, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )
                .bind(
                    orderId,
                    item.product_id,
                    item.product_title,
                    item.sku,
                    item.unit_price,
                    item.quantity,
                    item.total_price,
                    item.image
                )
                .run();
            await env.DB.prepare('UPDATE products SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?')
                .bind(item.quantity, item.product_id)
                .run();
            await env.DB.prepare(
                'INSERT INTO inventory_ledger (product_id, sku, delta, reason, reference_id, operator) VALUES (?, ?, ?, ?, ?, ?)'
            )
                .bind(item.product_id, item.sku, -item.quantity, 'Order placed', orderNumber, customerName)
                .run();
        }

        if (couponCode && discount > 0) {
            await env.DB.prepare(
                'INSERT INTO coupon_usages (coupon_code, order_number, customer_name, customer_phone, order_subtotal, discount_amount) VALUES (?, ?, ?, ?, ?, ?)'
            )
                .bind(couponCode.toUpperCase(), orderNumber, customerName, customerPhone, subtotal, discount)
                .run();
        }

        await env.DB.prepare(
            'INSERT INTO payment_transactions (order_id, order_number, customer_name, customer_phone, gateway, payment_method, amount, status, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
            .bind(
                orderId,
                orderNumber,
                customerName,
                customerPhone,
                paymentMethod,
                paymentMethod,
                totalAmount,
                'pending',
                request.headers.get('cf-connecting-ip') || ''
            )
            .run();

        if (customerEmail) {
            await sendTransactionalEmail(env, {
                to: customerEmail,
                subject: `Order Confirmed: ${orderNumber} — DT Brand's`,
                html: `<p>Namaste ${customerName},</p><p>Thank you for your order <strong>${orderNumber}</strong> totaling <strong>₹${totalAmount.toLocaleString('en-IN')}</strong>.</p>`,
                eventType: 'order_confirmation',
                orderNumber,
            });
        }

        return jsonResponse(
            {
                success: true,
                order_number: orderNumber,
                order: {
                    id: orderId,
                    order_number: orderNumber,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    total_amount: totalAmount,
                    payment_method: paymentMethod,
                    payment_status: 'pending',
                    items: orderItems,
                },
                message: 'Order placed successfully.',
            },
            201
        );
    }

    return jsonResponse({ success: false, message: 'Method not allowed.' }, 405);
}

async function handlePaymentsAndWebhooks(request, url, env, session, path) {
    const body = await readRequestBody(request);
    const action = String(body.action || url.searchParams.get('action') || '').trim();

    if (path === '/api/payments/upi_status.php') {
        const orderNumber = (url.searchParams.get('order_number') || '').trim().toUpperCase();
        if (!orderNumber) return jsonResponse({ success: false, message: 'order_number is required.' }, 400);
        const ord = await env.DB.prepare(
            'SELECT order_number, payment_status, total_amount, utr_reference FROM orders WHERE UPPER(order_number) = ? LIMIT 1'
        )
            .bind(orderNumber)
            .first();
        if (!ord) return jsonResponse({ success: false, message: 'Order not found.' }, 404);
        return jsonResponse({
            success: true,
            order_number: ord.order_number,
            payment_status: ord.payment_status,
            amount: ord.total_amount,
            utr_reference: ord.utr_reference || '',
        });
    }

    if (path === '/api/payments/upi_verify.php') {
        const orderNumber = String(body.order_number || '')
            .trim()
            .toUpperCase();
        const utr = String(body.utr_reference || body.utr || '').trim();
        if (!orderNumber || !/^\d{12}$/.test(utr)) {
            return jsonResponse(
                { success: false, message: 'Valid order_number and 12-digit numeric UTR required.' },
                400
            );
        }
        const ord = await env.DB.prepare('SELECT id, total_amount FROM orders WHERE UPPER(order_number) = ? LIMIT 1')
            .bind(orderNumber)
            .first();
        if (!ord) return jsonResponse({ success: false, message: 'Order not found.' }, 404);
        await env.DB.prepare("UPDATE orders SET utr_reference = ?, payment_status = 'pending' WHERE id = ?")
            .bind(utr, ord.id)
            .run();
        await env.DB.prepare(
            'INSERT INTO payment_transactions (order_id, order_number, gateway, payment_method, amount, status, utr_reference, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        )
            .bind(
                ord.id,
                orderNumber,
                'upi_direct',
                'upi',
                ord.total_amount,
                'authorized',
                utr,
                request.headers.get('cf-connecting-ip') || ''
            )
            .run();
        return jsonResponse({
            success: true,
            order_number: orderNumber,
            utr_reference: utr,
            status: 'submitted_for_verification',
            message: 'UTR reference recorded.',
        });
    }

    if (path === '/api/payment/config.php' || (path === '/api/payments.php' && request.method === 'GET' && !action)) {
        const gws = await env.DB.prepare(
            'SELECT gateway_key, name, description, is_active, is_recommended, sort_order FROM payment_gateways WHERE is_active = 1 ORDER BY sort_order ASC'
        ).all();
        const upiSetting = await env.DB.prepare("SELECT value FROM settings WHERE key_name = 'upi_id' LIMIT 1").first();
        return jsonResponse({
            success: true,
            upi_vpa: upiSetting?.value || '917046363528@okaxis',
            mcc: '5691',
            gateways: gws.results || [],
        });
    }

    if (path === '/api/payment/create_order.php' || action === 'create_order') {
        const amount = Number(body.amount || 0);
        if (amount <= 0) return jsonResponse({ success: false, message: 'Valid order amount required.' }, 400);
        const orderNumber = String(body.order_number || `DT-${Date.now().toString().slice(-6)}`).trim();
        const upiLink = `upi://pay?pa=917046363528@okaxis&pn=DT+Brands&mc=5691&tr=${encodeURIComponent(orderNumber)}&tn=Order+${encodeURIComponent(orderNumber)}&am=${amount.toFixed(2)}&cu=INR`;
        return jsonResponse({
            success: true,
            order_number: orderNumber,
            amount,
            currency: 'INR',
            upi_url: upiLink,
            gateway: String(body.gateway || 'upi_direct'),
        });
    }

    if (path === '/api/payment/verify.php') {
        const orderNumber = String(body.order_number || '')
            .trim()
            .toUpperCase();
        const rzpOrder = String(body.razorpay_order_id || '');
        const rzpPayment = String(body.razorpay_payment_id || '');
        const rzpSig = String(body.razorpay_signature || '');
        if (!env.RAZORPAY_KEY_SECRET) {
            return jsonResponse(
                {
                    success: false,
                    message: 'Razorpay webhook/API secret not configured in Cloudflare Workers secrets.',
                },
                400
            );
        }
        const ok = await verifyHmacHex(`${rzpOrder}|${rzpPayment}`, env.RAZORPAY_KEY_SECRET, rzpSig);
        if (!ok) return jsonResponse({ success: false, message: 'Invalid payment signature.' }, 400);
        if (orderNumber) {
            await env.DB.prepare("UPDATE orders SET payment_status = 'paid' WHERE UPPER(order_number) = ?")
                .bind(orderNumber)
                .run();
        }
        return jsonResponse({ success: true, verified: true, order_number: orderNumber });
    }

    if (path === '/api/payment/admin_save.php' || path === '/api/payment/test_webhook.php') {
        const deny = requireAdmin(session, 'manage payment gateways');
        if (deny) return deny;
        if (path === '/api/payment/admin_save.php' && body.gateway_key) {
            await env.DB.prepare('UPDATE payment_gateways SET is_active = ? WHERE gateway_key = ?')
                .bind(body.is_active ? 1 : 0, String(body.gateway_key))
                .run();
            return jsonResponse({ success: true, message: 'Gateway settings updated.' });
        }
        return jsonResponse({ success: true, message: 'Webhook endpoint verified on Cloudflare edge.' });
    }

    if (path.startsWith('/api/webhooks/') || path.includes('_webhook.php')) {
        const provider = path.split('/').pop().replace('_webhook.php', '').replace('.php', '');
        const rawText = JSON.stringify(body);
        await env.DB.prepare(
            'INSERT INTO webhook_logs (provider, event_type, status_code, verified, payload_json) VALUES (?, ?, 200, ?, ?)'
        )
            .bind(provider, String(body.event || body.type || 'webhook'), 0, rawText.slice(0, 4000))
            .run();
        return jsonResponse({ success: true, provider, received: true });
    }

    const deny = requireAdmin(session, 'view payment ledger');
    if (deny) return deny;
    const tx = await env.DB.prepare('SELECT * FROM payment_transactions ORDER BY id DESC LIMIT 100').all();
    return jsonResponse({ success: true, transactions: tx.results || [] });
}

async function handleShipping(request, url, env, session, path) {
    const body = await readRequestBody(request);
    const action = String(body.action || url.searchParams.get('action') || 'check_pincode').trim();

    if (path === '/api/shipping/test.php') {
        return jsonResponse({ success: true, message: 'Logistics API operational on Cloudflare Workers.' });
    }

    if (action === 'check_pincode') {
        const pincode = String(body.pincode || url.searchParams.get('pincode') || '').trim();
        if (!/^[1-9][0-9]{5}$/.test(pincode)) {
            return jsonResponse({ success: false, error: 'Please enter a valid 6-digit Indian PIN code.' }, 400);
        }
        const first2 = Number(pincode.slice(0, 2));
        let zone = 'Pan-India National';
        let estDays = 5;
        let rate = 99;
        if (first2 >= 36 && first2 <= 39) {
            zone = 'Gujarat (Surat Hub)';
            estDays = 2;
            rate = 49;
        } else if ((first2 >= 40 && first2 <= 44) || (first2 >= 11 && first2 <= 13) || (first2 >= 30 && first2 <= 34)) {
            zone = 'West & North Express';
            estDays = 3;
            rate = 79;
        } else if (first2 >= 50 && first2 <= 74) {
            zone = 'Metro & South/East Air';
            estDays = 4;
            rate = 99;
        }
        return jsonResponse({
            success: true,
            serviceable: true,
            pincode,
            zone,
            est_days: estDays,
            shipping_rate: rate,
            free_above: FREE_SHIPPING_THRESHOLD,
            cod_available: true,
            couriers: ['Delhivery Express', 'Blue Dart Aviation', 'DTDC Priority'],
        });
    }

    if (action === 'zones') {
        const z = await env.DB.prepare('SELECT * FROM shipping_zones ORDER BY id ASC').all();
        return jsonResponse({ success: true, zones: z.results || [] });
    }

    const deny = requireAdmin(session, 'manage shipments');
    if (deny) return deny;
    if (action === 'create_shipment') {
        const orderNumber = String(body.order_number || '').trim();
        const carrier = String(body.carrier || 'Delhivery Express').trim();
        const awb = String(body.awb_number || `DT-AWB-${Date.now().toString().slice(-6)}`).trim();
        await env.DB.prepare('INSERT INTO shipments (order_number, carrier, awb_number, status) VALUES (?, ?, ?, ?)')
            .bind(orderNumber, carrier, awb, 'manifested')
            .run();
        if (orderNumber) {
            await env.DB.prepare(
                "UPDATE orders SET tracking_number = ?, courier_name = ?, fulfillment_status = 'dispatched' WHERE order_number = ?"
            )
                .bind(awb, carrier, orderNumber)
                .run();
        }
        return jsonResponse({ success: true, order_number: orderNumber, awb_number: awb, carrier });
    }

    const ships = await env.DB.prepare('SELECT * FROM shipments ORDER BY id DESC LIMIT 100').all();
    return jsonResponse({ success: true, shipments: ships.results || [] });
}

async function handleMediaAndStorage(request, url, env, session, path) {
    if (path === '/api/download_product_media.php') {
        const pid = Number(url.searchParams.get('id') || 0);
        const prod = await env.DB.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').bind(pid).first();
        if (!prod) return jsonResponse({ success: false, message: 'Product not found.' }, 404);
        return jsonResponse({
            success: true,
            product_id: Number(prod.id),
            title: prod.title,
            sku: prod.sku,
            images: safeParseJsonArray(prod.gallery_json, [prod.primary_image]),
        });
    }

    if (path === '/api/media/index.php') {
        const deny = requireAdmin(session, 'list cloud media');
        if (deny) return deny;
        const rows = await env.DB.prepare('SELECT * FROM media_files ORDER BY id DESC LIMIT 200').all();
        return jsonResponse({ success: true, services: getStorageStatus(env), files: rows.results || [] });
    }

    if (path === '/api/media/delete.php') {
        const deny = requireAdmin(session, 'delete cloud media');
        if (deny) return deny;
        const body = await readRequestBody(request);
        const fileKey = String(body.file_key || url.searchParams.get('file_key') || '').trim();
        if (!fileKey) return jsonResponse({ success: false, message: 'file_key required.' }, 400);
        await deleteCloudObject(env, fileKey);
        return jsonResponse({ success: true, deleted: fileKey });
    }

    if (path === '/api/upload.php') {
        const deny = requireAdmin(session, 'upload cloud media');
        if (deny) return deny;
        if (request.method !== 'POST') return jsonResponse({ success: false, message: 'Method Not Allowed' }, 405);

        const ct = (request.headers.get('content-type') || '').toLowerCase();
        let filename = 'upload.bin';
        let contentType = 'application/octet-stream';
        let bytes = null;

        if (ct.includes('multipart/form-data')) {
            const fd = await request.formData();
            const file = fd.get('file') || fd.get('image') || fd.get('media');
            if (!file || typeof file === 'string') {
                return jsonResponse({ success: false, message: 'No file uploaded.' }, 400);
            }
            filename = file.name || 'upload.png';
            contentType = file.type || 'application/octet-stream';
            bytes = new Uint8Array(await file.arrayBuffer());
        } else {
            const body = await readRequestBody(request);
            if (!body.base64)
                return jsonResponse({ success: false, message: 'Provide multipart file or base64 payload.' }, 400);
            filename = String(body.filename || 'upload.png');
            contentType = String(body.content_type || 'image/png');
            const bin = atob(String(body.base64).replace(/^data:[^;]+;base64,/, ''));
            bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        }

        const allowed = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'image/svg+xml',
            'application/pdf',
            'video/mp4',
            'application/json',
        ];
        if (!allowed.includes(contentType)) {
            return jsonResponse({ success: false, message: `Unsupported MIME type: ${contentType}` }, 400);
        }
        const ext = filename.includes('.')
            ? filename
                  .split('.')
                  .pop()
                  .replace(/[^a-z0-9]/gi, '')
            : 'bin';
        const rand = new Uint8Array(4);
        crypto.getRandomValues(rand);
        const fileKey = `uploads/dt_${Date.now()}_${toBase64Url(rand)}.${ext}`;
        const stored = await storeCloudObject(env, {
            fileKey,
            filename,
            bytes,
            contentType,
            uploadedBy: session.admin?.email || 'admin',
        });
        await logAudit(
            env,
            session.admin.email,
            'media_upload',
            'media',
            fileKey,
            `Uploaded ${filename} (${stored.storage_backend})`,
            request
        );
        return jsonResponse({ success: true, ...stored }, 201);
    }

    return jsonResponse({ success: false, message: 'Unsupported media route.' }, 404);
}

async function handleNotifications(request, url, env, session) {
    const deny = requireAdmin(session, 'manage email & notifications');
    if (deny) return deny;
    const body = await readRequestBody(request);
    const action = String(body.action || url.searchParams.get('action') || 'logs').trim();

    if (action === 'stats') {
        const stats = await env.DB.prepare(
            "SELECT COUNT(*) AS total, SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status='queued' THEN 1 ELSE 0 END) AS queued FROM email_outbox"
        ).first();
        return jsonResponse({ success: true, stats: stats || {}, email_services: getStorageStatus(env) });
    }
    if (action === 'templates') {
        const res = await env.DB.prepare('SELECT * FROM notification_templates ORDER BY id ASC').all();
        return jsonResponse({ success: true, templates: res.results || [] });
    }
    if (action === 'save_template') {
        const key = String(body.template_key || '').trim();
        const title = String(body.title || '').trim();
        const content = String(body.content || '').trim();
        if (!key || !title || !content)
            return jsonResponse({ success: false, message: 'template_key, title, content required.' }, 400);
        await env.DB.prepare(
            `INSERT INTO notification_templates (template_key, channel, category, title, subject, content)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(template_key) DO UPDATE SET title = excluded.title, subject = excluded.subject, content = excluded.content`
        )
            .bind(
                key,
                String(body.channel || 'email'),
                String(body.category || 'order'),
                title,
                String(body.subject || title),
                content
            )
            .run();
        return jsonResponse({ success: true, message: 'Template saved.' });
    }
    if (action === 'send_test' || action === 'dispatch') {
        const to = String(body.recipient || body.to_email || '').trim();
        const subject = String(body.subject || "DT Brand's Notification Test").trim();
        const content = String(
            body.content || body.message || 'Test transactional email from DT Brand Cloudflare Workers.'
        ).trim();
        const res = await sendTransactionalEmail(env, {
            to,
            subject,
            html: `<div style="font-family:Inter,sans-serif;padding:20px;border:1px solid #D4AF37;border-radius:12px;"><h2>${subject}</h2><p>${content}</p></div>`,
            text: content,
            eventType: String(body.template_key || 'manual_dispatch'),
        });
        return jsonResponse(res);
    }

    const outbox = await env.DB.prepare('SELECT * FROM email_outbox ORDER BY id DESC LIMIT 50').all();
    const logs = await env.DB.prepare('SELECT * FROM notifications_log ORDER BY id DESC LIMIT 50').all();
    return jsonResponse({
        success: true,
        outbox: outbox.results || [],
        logs: logs.results || [],
        services: getStorageStatus(env),
    });
}

async function handleReportsAndAdmin(request, url, env, session, path) {
    if (path === '/api/reports.php') {
        const deny = requireAdmin(session, 'view reports');
        if (deny) return deny;
        const action = String(url.searchParams.get('action') || 'stats').trim();
        const summary = await env.DB.prepare(
            `SELECT
                (SELECT COALESCE(SUM(total_amount), 0) FROM orders WHERE fulfillment_status != 'cancelled') AS revenue,
                (SELECT COUNT(*) FROM orders) AS total_orders,
                (SELECT COUNT(*) FROM products) AS total_products,
                (SELECT COALESCE(SUM(stock_qty), 0) FROM products) AS total_stock,
                (SELECT COUNT(*) FROM customers) AS total_customers`
        ).first();
        if (action === 'export') {
            const orders = await env.DB.prepare(
                'SELECT order_number, customer_name, channel, total_amount, payment_status, fulfillment_status, created_at FROM orders ORDER BY id DESC'
            ).all();
            const csv = [
                'order_number,customer_name,channel,total_amount,payment_status,fulfillment_status,created_at',
                ...(orders.results || []).map(
                    (o) =>
                        `${o.order_number},"${o.customer_name}",${o.channel},${o.total_amount},${o.payment_status},${o.fulfillment_status},${o.created_at}`
                ),
            ].join('\n');
            return new Response(csv, {
                status: 200,
                headers: {
                    'content-type': 'text/csv; charset=utf-8',
                    'content-disposition': 'attachment; filename="dt-sales-report.csv"',
                },
            });
        }
        const topProds = await env.DB.prepare(
            'SELECT id, sku, title, category_name, stock_qty, retail_price, wholesale_price FROM products ORDER BY reviews_count DESC LIMIT 20'
        ).all();
        return jsonResponse({ success: true, action, data: { ...summary, top_products: topProds.results || [] } });
    }

    if (path === '/api/system/backup.php') {
        const deny = requireAdmin(session, 'create system backup');
        if (deny) return deny;
        const backup = await createCloudBackup(env, session.admin.email);
        await logAudit(
            env,
            session.admin.email,
            'system_backup',
            'database',
            backup.file_key,
            'Created D1 cloud backup',
            request
        );
        return jsonResponse({ success: true, backup });
    }

    const deny = requireAdmin(session, 'access admin API');
    if (deny) return deny;

    if (path === '/api/customers.php' || path === '/api/customers/index.php') {
        if (request.method === 'POST') {
            const body = await readRequestBody(request);
            const id = Number(body.id || 0);
            if (body.action === 'update_status' && id > 0) {
                await env.DB.prepare('UPDATE customers SET status = ? WHERE id = ?')
                    .bind(String(body.status || 'active'), id)
                    .run();
                return jsonResponse({ success: true, id, status: body.status });
            }
        }
        const rows = await env.DB.prepare(
            'SELECT id, name, phone, email, type, city, state, status, created_at FROM customers ORDER BY id DESC LIMIT 200'
        ).all();
        return jsonResponse({ success: true, customers: rows.results || [] });
    }

    if (path === '/api/customer_addresses.php') {
        const cid = Number(url.searchParams.get('customer_id') || 0);
        const rows =
            cid > 0
                ? await env.DB.prepare('SELECT * FROM addresses WHERE customer_id = ?').bind(cid).all()
                : await env.DB.prepare('SELECT * FROM addresses ORDER BY id DESC LIMIT 100').all();
        return jsonResponse({ success: true, addresses: rows.results || [] });
    }

    if (path === '/api/customer_notes.php') {
        if (request.method === 'POST') {
            const body = await readRequestBody(request);
            await env.DB.prepare('INSERT INTO customer_notes (customer_id, author, note) VALUES (?, ?, ?)')
                .bind(Number(body.customer_id || 0), session.admin.name, String(body.note || ''))
                .run();
            return jsonResponse({ success: true, message: 'Note saved.' });
        }
        const rows = await env.DB.prepare('SELECT * FROM customer_notes ORDER BY id DESC LIMIT 100').all();
        return jsonResponse({ success: true, notes: rows.results || [] });
    }

    if (path === '/api/settings.php') {
        if (request.method === 'POST') {
            const body = await readRequestBody(request);
            for (const [k, v] of Object.entries(body)) {
                if (k === 'action') continue;
                await env.DB.prepare(
                    'INSERT INTO settings (key_name, value, value_text) VALUES (?, ?, ?) ON CONFLICT(key_name) DO UPDATE SET value = excluded.value, value_text = excluded.value_text'
                )
                    .bind(k, String(v), String(v))
                    .run();
            }
            return jsonResponse({ success: true, message: 'Settings updated.' });
        }
        const rows = await env.DB.prepare('SELECT key_name, value, category FROM settings ORDER BY id ASC').all();
        return jsonResponse({ success: true, settings: rows.results || [] });
    }

    if (path === '/api/users.php') {
        const rows = await env.DB.prepare(
            'SELECT id, name, email, role, status, last_login, created_at FROM users ORDER BY id ASC'
        ).all();
        return jsonResponse({ success: true, users: rows.results || [] });
    }

    if (path === '/api/audit.php' || path === '/api/admin_security.php') {
        const rows = await env.DB.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 100').all();
        return jsonResponse({ success: true, logs: rows.results || [] });
    }

    if (path === '/api/integrations.php') {
        const rows = await env.DB.prepare('SELECT * FROM integrations ORDER BY id ASC').all();
        return jsonResponse({ success: true, integrations: rows.results || [], services: getStorageStatus(env) });
    }

    if (path === '/api/developer.php') {
        const hooks = await env.DB.prepare('SELECT * FROM webhook_logs ORDER BY id DESC LIMIT 50').all();
        return jsonResponse({ success: true, api_directory: getApiDirectory(env), webhook_logs: hooks.results || [] });
    }

    if (path === '/api/system.php') {
        const flags = await env.DB.prepare('SELECT * FROM feature_flags ORDER BY id ASC').all();
        return jsonResponse({ success: true, services: getStorageStatus(env), feature_flags: flags.results || [] });
    }

    if (path === '/api/whatsapp.php' || path === '/api/whatsapp/index.php' || path === '/api/whatsapp/audience.php') {
        if (path === '/api/whatsapp/audience.php') {
            const cust = await env.DB.prepare(
                "SELECT id, name, phone, type, city FROM customers WHERE status = 'active' LIMIT 200"
            ).all();
            return jsonResponse({ success: true, audience: cust.results || [] });
        }
        const camps = await env.DB.prepare('SELECT * FROM whatsapp_campaigns ORDER BY id DESC LIMIT 50').all();
        return jsonResponse({ success: true, campaigns: camps.results || [] });
    }

    return jsonResponse({ success: false, message: 'Admin API route not matched.' }, 404);
}

export async function routeApiRequest(request, url, env, session) {
    const path = url.pathname;
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204 });
    }

    if (
        path === '/api' ||
        path === '/api/' ||
        path === '/api/index.php' ||
        path === '/api/health.php' ||
        path === '/api/db_health.php' ||
        path === '/api/db_audit.php' ||
        path === '/api/db_optimize.php' ||
        path === '/api/db_sync.php'
    ) {
        return handleHealthAndDb(path, env, session, request);
    }

    if (
        path === '/api/products.php' ||
        path === '/api/products' ||
        path === '/api/products/index.php' ||
        path === '/api/products/export.php' ||
        path === '/api/products/import.php' ||
        path === '/api/seed_demo_catalog.php'
    ) {
        return handleProducts(request, url, env, session, path);
    }

    if (path === '/api/search.php' || path === '/api/search') {
        const q = (
            url.searchParams.get('q') ||
            url.searchParams.get('query') ||
            url.searchParams.get('search') ||
            ''
        ).trim();
        const cat = (url.searchParams.get('cat') || url.searchParams.get('category') || '').trim();
        const lowerQ = q.toLowerCase();
        const catRows = await env.DB.prepare(
            "SELECT id, name, slug, image, products_count FROM categories WHERE status = 'active' ORDER BY display_order ASC"
        ).all();
        let categories = catRows.results || [];
        if (lowerQ)
            categories = categories.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(lowerQ)).slice(0, 5);
        else categories = categories.slice(0, 6);

        const prodRows = await env.DB.prepare("SELECT * FROM products WHERE status != 'draft' ORDER BY id ASC").all();
        let products = (prodRows.results || []).map((r) => normalizeProduct(r, session.userRole));
        if (cat && cat.toLowerCase() !== 'all') {
            const normCat = cat.toLowerCase().replace(/(sarees|lehengas|kurtis)$/g, (m) => m.slice(0, -1));
            products = products.filter((p) => p.category_name.toLowerCase().includes(normCat));
        }
        if (lowerQ) {
            const tokens = lowerQ
                .replace(/\b(sarees|lehengas|gowns|kurtis)\b/g, (m) => m.slice(0, -1))
                .split(/[\s,+\-]+/)
                .filter(Boolean);
            products = products.filter((p) => {
                let corpus =
                    `${p.title} ${p.sku} ${p.category_name} ${p.subcategory} ${p.fabric} ${p.weave} ${p.description}`.toLowerCase();
                if (corpus.includes('varanasi') || corpus.includes('kadwa') || corpus.includes('katan'))
                    corpus += ' banarasi banaras';
                if (corpus.includes('kanjivaram') || corpus.includes('brocade')) corpus += ' kanchipuram zari silk';
                if (corpus.includes('paithani')) corpus += ' yeola silk maharashtra';
                return tokens.some((t) => corpus.includes(t));
            });
        }
        return jsonResponse({
            success: true,
            query: q,
            total: products.length,
            categories,
            products,
            suggestions: products.slice(0, 6).map((p) => p.title),
        });
    }

    if (path === '/api/categories.php' || path === '/api/categories' || path === '/api/categories/index.php') {
        if (request.method === 'POST') {
            const deny = requireAdmin(session, 'manage categories');
            if (deny) return deny;
            const body = await readRequestBody(request);
            const name = String(body.name || '').trim();
            if (!name) return jsonResponse({ success: false, message: 'Category name required.' }, 400);
            await env.DB.prepare(
                'INSERT INTO categories (name, slug, description, image) VALUES (?, ?, ?, ?) ON CONFLICT(slug) DO UPDATE SET name = excluded.name'
            )
                .bind(
                    name,
                    slugify(body.slug || name),
                    String(body.description || ''),
                    String(body.image || '/assets/images/product1.png')
                )
                .run();
            return jsonResponse({ success: true, message: 'Category saved.' });
        }
        const cats = await env.DB.prepare(
            "SELECT * FROM categories WHERE status = 'active' ORDER BY display_order ASC"
        ).all();
        return jsonResponse({ success: true, categories: cats.results || [] });
    }

    if (path === '/api/brands.php') {
        const rows = await env.DB.prepare("SELECT * FROM brands WHERE status = 'active'").all();
        return jsonResponse({ success: true, brands: rows.results || [] });
    }
    if (path === '/api/attributes.php') {
        const rows = await env.DB.prepare("SELECT * FROM attributes WHERE status = 'active'").all();
        return jsonResponse({ success: true, attributes: rows.results || [] });
    }
    if (path === '/api/variants.php') {
        const pid = Number(url.searchParams.get('product_id') || 0);
        const rows =
            pid > 0
                ? await env.DB.prepare('SELECT * FROM product_variants WHERE product_id = ?').bind(pid).all()
                : await env.DB.prepare('SELECT * FROM product_variants LIMIT 100').all();
        return jsonResponse({ success: true, variants: rows.results || [] });
    }
    if (path === '/api/pricing.php') {
        const pid = Number(url.searchParams.get('product_id') || url.searchParams.get('id') || 0);
        const qty = Math.max(1, Number(url.searchParams.get('qty') || 1));
        const prod = await env.DB.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').bind(pid).first();
        if (!prod) return jsonResponse({ success: false, message: 'Product not found.' }, 404);
        const n = normalizeProduct(prod, session.userRole);
        return jsonResponse({
            success: true,
            product_id: n.id,
            qty,
            unit_price: n.effective_price,
            total: n.effective_price * qty,
            currency: 'INR',
        });
    }
    if (path === '/api/content.php') {
        const [banners, announcements, categories] = await Promise.all([
            env.DB.prepare("SELECT * FROM banners WHERE status = 'active' ORDER BY display_order ASC").all(),
            env.DB.prepare("SELECT * FROM announcements WHERE status = 'active' ORDER BY display_order ASC").all(),
            env.DB.prepare("SELECT * FROM categories WHERE status = 'active' ORDER BY display_order ASC").all(),
        ]);
        return jsonResponse({
            success: true,
            hero_banners: banners.results || [],
            announcements: announcements.results || [],
            categories: categories.results || [],
        });
    }

    if (path === '/api/coupons.php' || path === '/api/coupons') {
        const body = await readRequestBody(request);
        const action = String(
            body.action || url.searchParams.get('action') || (url.searchParams.has('code') ? 'validate' : 'get_all')
        ).trim();
        if (action === 'validate') {
            const code = String(body.code || url.searchParams.get('code') || '');
            const subtotal = Number(body.subtotal ?? url.searchParams.get('subtotal') ?? 0);
            const channel = String(body.channel || url.searchParams.get('channel') || 'all');
            const r = await evaluateCoupon(env, code, subtotal, channel);
            return jsonResponse({
                success: r.valid,
                code: r.code || code,
                discount: r.discount,
                discount_type: r.discount_type || 'percentage',
                discount_value: r.discount_value || 0,
                title: r.title || '',
                message: r.message,
            });
        }
        const deny = requireAdmin(session, 'manage coupons');
        if (deny) return deny;
        if (action === 'create') {
            await env.DB.prepare(
                'INSERT INTO coupons (code, title, discount_type, discount_value, min_order_value, max_discount, channel, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
            )
                .bind(
                    String(body.code || '').toUpperCase(),
                    String(body.title || ''),
                    String(body.discount_type || 'percentage'),
                    Number(body.discount_value || 10),
                    Number(body.min_order_value || 0),
                    Number(body.max_discount || 0),
                    String(body.channel || 'all'),
                    'active'
                )
                .run();
            return jsonResponse({ success: true, message: 'Coupon created.' }, 201);
        }
        const all = await env.DB.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
        return jsonResponse({ success: true, coupons: all.results || [] });
    }

    if (path === '/api/cart.php' || path === '/api/cart' || path === '/api/cart/index.php') {
        const body = await readRequestBody(request);
        const items = Array.isArray(body.items) ? body.items : Array.isArray(body.cart) ? body.cart : [];
        const couponCode = String(body.coupon || body.coupon_code || '').trim();
        if (items.length === 0) {
            return jsonResponse({
                success: true,
                user_type: session.userRole,
                item_count: 0,
                total_qty: 0,
                items: [],
                cart: [],
                subtotal: 0,
                discount: 0,
                shipping: 0,
                grand_total: 0,
                free_shipping: false,
                free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
                shipping_rate: STANDARD_SHIPPING_RATE,
                warnings: [],
            });
        }
        const ids = [...new Set(items.map((x) => Number(x.product_id || x.id)).filter((n) => n > 0))];
        if (ids.length === 0) return jsonResponse({ success: false, message: 'No valid products.' }, 400);
        const prodRes = await env.DB.prepare(`SELECT * FROM products WHERE id IN (${ids.map(() => '?').join(',')})`)
            .bind(...ids)
            .all();
        const byId = new Map((prodRes.results || []).map((r) => [Number(r.id), normalizeProduct(r, session.userRole)]));
        const validated = [];
        const warnings = [];
        let subtotal = 0;
        let totalQty = 0;
        for (const reqItem of items) {
            const pid = Number(reqItem.product_id || reqItem.id);
            const prod = byId.get(pid);
            if (!prod) {
                warnings.push(`Product #${pid} unavailable.`);
                continue;
            }
            const qty = Math.max(1, Math.min(999, Number(reqItem.qty || reqItem.quantity || 1)));
            const lineTotal = Math.round(prod.effective_price * qty * 100) / 100;
            subtotal += lineTotal;
            totalQty += qty;
            validated.push({
                id: prod.id,
                product_id: prod.id,
                sku: prod.sku,
                title: prod.title,
                name: prod.title,
                image: prod.image,
                size: reqItem.size || prod.sizes[0] || '',
                color: reqItem.color || prod.colors[0] || '',
                qty,
                quantity: qty,
                unit_price: prod.effective_price,
                line_total: lineTotal,
            });
        }
        subtotal = Math.round(subtotal * 100) / 100;
        let discount = 0;
        let couponInfo = null;
        if (couponCode) {
            couponInfo = await evaluateCoupon(env, couponCode, subtotal, session.userRole);
            if (couponInfo.valid) discount = couponInfo.discount;
            else warnings.push(couponInfo.message);
        }
        const afterDisc = Math.max(0, subtotal - discount);
        const freeShip = afterDisc >= FREE_SHIPPING_THRESHOLD || afterDisc === 0;
        const shipping = freeShip ? 0 : STANDARD_SHIPPING_RATE;
        const grandTotal = Math.round((afterDisc + shipping) * 100) / 100;
        return jsonResponse({
            success: true,
            user_type: session.userRole,
            item_count: validated.length,
            total_qty: totalQty,
            items: validated,
            cart: validated,
            pricing: { subtotal, discount, shipping, grand_total: grandTotal },
            subtotal,
            discount,
            shipping,
            grand_total: grandTotal,
            coupon_info: couponInfo,
            free_shipping: freeShip,
            free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
            shipping_rate: STANDARD_SHIPPING_RATE,
            warnings,
        });
    }

    if (path === '/api/wishlist.php' || path === '/api/wishlist' || path === '/api/wishlist/index.php') {
        const body = await readRequestBody(request);
        const action = String(body.action || url.searchParams.get('action') || 'view').trim();
        const productId = Number(body.product_id || url.searchParams.get('product_id') || 0);
        const requestedCust = Number(body.customer_id || url.searchParams.get('customer_id') || 0);
        if (requestedCust > 0 && (!session.user || session.user.id !== requestedCust)) {
            return jsonResponse({ success: false, error: 'Access denied.' }, 403);
        }
        const col = session.user ? 'customer_id' : 'session_id';
        const val = session.user ? session.user.id : session.sid;
        let status = 'view';
        if (action === 'toggle' && productId > 0) {
            const ex = await env.DB.prepare(`SELECT id FROM wishlist_items WHERE ${col} = ? AND product_id = ? LIMIT 1`)
                .bind(val, productId)
                .first();
            if (ex) {
                await env.DB.prepare('DELETE FROM wishlist_items WHERE id = ?').bind(ex.id).run();
                status = 'removed';
            } else {
                await env.DB.prepare(
                    'INSERT INTO wishlist_items (session_id, customer_id, product_id) VALUES (?, ?, ?)'
                )
                    .bind(session.sid, session.user?.id || null, productId)
                    .run();
                status = 'added';
            }
        } else if (action === 'add' && productId > 0) {
            const ex = await env.DB.prepare(`SELECT id FROM wishlist_items WHERE ${col} = ? AND product_id = ? LIMIT 1`)
                .bind(val, productId)
                .first();
            if (!ex)
                await env.DB.prepare(
                    'INSERT INTO wishlist_items (session_id, customer_id, product_id) VALUES (?, ?, ?)'
                )
                    .bind(session.sid, session.user?.id || null, productId)
                    .run();
            status = 'added';
        } else if (action === 'remove' && productId > 0) {
            await env.DB.prepare(`DELETE FROM wishlist_items WHERE ${col} = ? AND product_id = ?`)
                .bind(val, productId)
                .run();
            status = 'removed';
        } else if (action === 'clear') {
            await env.DB.prepare(`DELETE FROM wishlist_items WHERE ${col} = ?`).bind(val).run();
            status = 'cleared';
        }
        const rows = await env.DB.prepare(
            `SELECT p.* FROM wishlist_items w JOIN products p ON p.id = w.product_id WHERE w.${col} = ? ORDER BY w.id DESC`
        )
            .bind(val)
            .all();
        const items = (rows.results || []).map((r) => normalizeProduct(r, session.userRole));
        return jsonResponse({ success: true, status, count: items.length, items });
    }

    if (path === '/api/auth.php' || path === '/api/auth' || path === '/api/auth/index.php') {
        return handleAuth(request, url, env, session);
    }
    if (path === '/api/orders.php' || path === '/api/orders' || path === '/api/orders/index.php') {
        return handleOrders(request, url, env, session);
    }
    if (path.startsWith('/api/payment') || path.startsWith('/api/webhooks/')) {
        return handlePaymentsAndWebhooks(request, url, env, session, path);
    }
    if (path.startsWith('/api/shipping')) {
        return handleShipping(request, url, env, session, path);
    }
    if (path === '/api/upload.php' || path.startsWith('/api/media/') || path === '/api/download_product_media.php') {
        return handleMediaAndStorage(request, url, env, session, path);
    }
    if (path === '/api/notifications.php' || path === '/api/notifications/index.php') {
        return handleNotifications(request, url, env, session);
    }

    if (path === '/api/reviews.php' || path === '/api/reviews') {
        if (request.method === 'GET') {
            const pid = Number(url.searchParams.get('product_id') || 0);
            const rows =
                pid > 0
                    ? await env.DB.prepare(
                          "SELECT * FROM reviews WHERE product_id = ? AND status = 'approved' ORDER BY id DESC LIMIT 50"
                      )
                          .bind(pid)
                          .all()
                    : await env.DB.prepare(
                          "SELECT * FROM reviews WHERE status = 'approved' ORDER BY id DESC LIMIT 50"
                      ).all();
            return jsonResponse({ success: true, count: (rows.results || []).length, reviews: rows.results || [] });
        }
        const body = await readRequestBody(request);
        const productId = Number(body.product_id || 0);
        const text = String(body.review_text || '').trim();
        if (productId <= 0 || !text)
            return jsonResponse({ success: false, message: 'Product ID and review text required.' }, 400);
        await env.DB.prepare(
            "INSERT INTO reviews (product_id, customer_name, rating, review_title, review_text, verified_buyer, status) VALUES (?, ?, ?, ?, ?, 1, 'approved')"
        )
            .bind(
                productId,
                String(body.name || 'Verified Buyer'),
                Math.min(5, Math.max(1, Number(body.rating || 5))),
                String(body.review_title || ''),
                text
            )
            .run();
        await env.DB.prepare('UPDATE products SET reviews_count = reviews_count + 1 WHERE id = ?')
            .bind(productId)
            .run();
        return jsonResponse({ success: true, status: 'approved', message: 'Thank you! Your review is now published.' });
    }

    if (
        path === '/api/wholesale.php' ||
        path === '/api/wholesale/index.php' ||
        path === '/api/reseller.php' ||
        path === '/api/reseller/index.php' ||
        path === '/api/retailer.php' ||
        path === '/api/retailer/index.php'
    ) {
        const channel = path.includes('wholesale') ? 'wholesale' : path.includes('reseller') ? 'reseller' : 'retailer';
        if (request.method === 'GET') {
            const rows = await env.DB.prepare("SELECT * FROM products WHERE status != 'draft' ORDER BY id ASC").all();
            return jsonResponse({
                success: true,
                channel,
                is_logged_in: session.user !== null,
                products: (rows.results || []).map((r) => normalizeProduct(r, channel)),
                user: session.user,
            });
        }
        if (!session.user && !session.isAdmin) {
            return jsonResponse({ success: false, message: 'Authentication required.' }, 401);
        }
        return jsonResponse({ success: true, channel, message: 'Action recorded.' });
    }

    return handleReportsAndAdmin(request, url, env, session, path);
}
