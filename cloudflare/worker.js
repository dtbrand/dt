/**
 * DT Brand's & Jai Hanuman Tex — Cloudflare Workers Storefront & D1 API
 *
 * Serves static assets from Workers Assets (`env.ASSETS`), storefront HTML pages
 * hydrated with live origin URLs and session state, and REST API endpoints
 * backed by Cloudflare D1 (`env.DB`).
 */

const SESSION_COOKIE = 'dt_cf_session';
const SID_COOKIE = 'dt_cf_sid';
const FREE_SHIPPING_THRESHOLD = 1999;
const STANDARD_SHIPPING_RATE = 99;

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

function jsonResponse(payload, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            ...extraHeaders,
        },
    });
}

function parseCookies(request) {
    const raw = request.headers.get('cookie') || '';
    const map = {};
    for (const part of raw.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k) {
            try {
                map[k] = decodeURIComponent(v);
            } catch {
                map[k] = v;
            }
        }
    }
    return map;
}

function toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

async function getSigningSecret(env) {
    if (env.SESSION_SECRET && String(env.SESSION_SECRET).length >= 16) {
        return String(env.SESSION_SECRET);
    }
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
    const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('session_secret').first();
    if (row && row.value) {
        return row.value;
    }
    const rand = new Uint8Array(32);
    crypto.getRandomValues(rand);
    const generated = toBase64Url(rand);
    await env.DB.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)')
        .bind('session_secret', generated)
        .run();
    const stored = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('session_secret').first();
    return stored ? stored.value : generated;
}

async function signToken(payloadObj, secret) {
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payloadObj));
    const payloadB64 = toBase64Url(payloadBytes);
    const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
    return `${payloadB64}.${toBase64Url(new Uint8Array(sigBuf))}`;
}

async function verifyToken(token, secret) {
    if (!token || !token.includes('.')) return null;
    const [payloadB64, sigB64] = token.split('.', 2);
    if (!payloadB64 || !sigB64) return null;
    try {
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );
        const ok = await crypto.subtle.verify('HMAC', key, fromBase64Url(sigB64), new TextEncoder().encode(payloadB64));
        if (!ok) return null;
        const parsed = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
        if (parsed.exp && Date.now() > parsed.exp) return null;
        return parsed;
    } catch {
        return null;
    }
}

async function hashPassword(password) {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
        'deriveBits',
    ]);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    return `pbkdf2$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

async function verifyPassword(password, storedHash) {
    if (!storedHash || !storedHash.startsWith('pbkdf2$')) return false;
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const salt = fromBase64Url(parts[1]);
    const expected = fromBase64Url(parts[2]);
    const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
        'deriveBits',
    ]);
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
        keyMaterial,
        256
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i++) {
        diff |= actual[i] ^ expected[i];
    }
    return diff === 0;
}

function safeParseJsonArray(raw, fallback = []) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function normalizeProduct(row, userRole = 'guest') {
    const mrp = Number(row.mrp) || 0;
    const retail = Number(row.retail_price) || 0;
    const wholesale = Number(row.wholesale_price) || retail;
    const reseller = Number(row.reseller_price) || retail;

    let effectivePrice = retail;
    let priceLabel = 'Retail Price';
    if (userRole === 'wholesale') {
        effectivePrice = wholesale;
        priceLabel = 'Wholesale Price';
    } else if (userRole === 'reseller') {
        effectivePrice = reseller;
        priceLabel = 'Reseller Price';
    }

    const discount = mrp > effectivePrice ? Math.round(((mrp - effectivePrice) / mrp) * 100) : 0;
    const gallery = safeParseJsonArray(row.gallery_json, [row.primary_image]);
    const colors = safeParseJsonArray(row.colors_json, ['Signature Gold']);
    const sizes = safeParseJsonArray(row.sizes_json, ['Free Size']);

    const out = {
        id: Number(row.id),
        sku: row.sku,
        title: row.title,
        name: row.title,
        slug: row.slug,
        category_id: Number(row.category_id),
        category: row.category_name,
        category_name: row.category_name,
        subcategory: row.subcategory || '',
        fabric: row.fabric || 'Pure Silk',
        weave: row.weave || '',
        zari_type: row.zari_type || '',
        pallu_style: row.pallu_style || '',
        blouse_piece: row.blouse_piece || '',
        occasion: row.occasion || '',
        mrp,
        old_price: mrp,
        retail_price: retail,
        price: effectivePrice,
        base_price: mrp,
        sale_price: effectivePrice,
        effective_price: effectivePrice,
        show_sale: mrp > effectivePrice,
        price_label: priceLabel,
        discount,
        moq_single: Number(row.moq_single || 1),
        moq_half_set: Number(row.moq_half_set || 4),
        moq_full_set: Number(row.moq_full_set || 8),
        moq_master_bale: Number(row.moq_master_bale || 24),
        stock_qty: Number(row.stock_qty || 0),
        rating: Number(row.rating || 4.9),
        reviews_count: Number(row.reviews_count || 0),
        image: row.primary_image,
        primary_image: row.primary_image,
        images: gallery,
        gallery,
        colors,
        color: colors[0] || '',
        size: sizes,
        sizes,
        badge: row.badge || '',
        selling_type: row.selling_type || 'single_piece',
        status: row.status || 'in_stock',
        description: row.description || '',
    };

    // Mask wholesale/reseller rates for unauthenticated retail/guest requests
    if (userRole === 'guest' || userRole === 'customer') {
        delete out.wholesale_price;
        delete out.reseller_price;
    } else if (userRole === 'reseller') {
        out.reseller_price = reseller;
        delete out.wholesale_price;
    } else if (userRole === 'wholesale' || userRole === 'retailer' || userRole === 'admin') {
        out.wholesale_price = wholesale;
        out.reseller_price = reseller;
    }

    return out;
}

async function getSessionContext(request, env) {
    const cookies = parseCookies(request);
    let sid = cookies[SID_COOKIE];
    let sidNew = false;
    if (!sid || !/^[a-zA-Z0-9_-]{12,64}$/.test(sid)) {
        const rand = new Uint8Array(18);
        crypto.getRandomValues(rand);
        sid = toBase64Url(rand);
        sidNew = true;
    }

    let user = null;
    if (cookies[SESSION_COOKIE]) {
        const secret = await getSigningSecret(env);
        const tokenData = await verifyToken(cookies[SESSION_COOKIE], secret);
        if (tokenData && tokenData.uid) {
            const dbUser = await env.DB.prepare(
                'SELECT id, name, phone, email, type, city, state, gstin, pan, status FROM customers WHERE id = ? LIMIT 1'
            )
                .bind(Number(tokenData.uid))
                .first();
            if (dbUser && dbUser.status === 'active') {
                user = {
                    id: Number(dbUser.id),
                    name: dbUser.name,
                    phone: dbUser.phone,
                    email: dbUser.email || '',
                    type: dbUser.type || 'customer',
                    city: dbUser.city || '',
                    state: dbUser.state || '',
                    gstin: dbUser.gstin || '',
                    pan: dbUser.pan || '',
                };
            }
        }
    }

    const userRole = user
        ? user.type === 'wholesaler'
            ? 'wholesale'
            : user.type === 'retail'
              ? 'customer'
              : user.type
        : 'guest';

    return { sid, sidNew, user, userRole };
}

function buildCookieHeader(name, value, maxAgeSeconds = 86400 * 7, httpOnly = true) {
    const parts = [
        `${name}=${encodeURIComponent(value)}`,
        'Path=/',
        `Max-Age=${maxAgeSeconds}`,
        'SameSite=Lax',
        'Secure',
    ];
    if (httpOnly) parts.push('HttpOnly');
    return parts.join('; ');
}

async function readRequestBody(request) {
    if (request.method === 'GET' || request.method === 'HEAD') return {};
    const ct = (request.headers.get('content-type') || '').toLowerCase();
    try {
        if (ct.includes('application/json')) {
            const parsed = await request.json();
            return parsed && typeof parsed === 'object' ? parsed : {};
        }
        if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
            const fd = await request.formData();
            const obj = {};
            for (const [k, v] of fd.entries()) {
                obj[k] = typeof v === 'string' ? v : '';
            }
            return obj;
        }
        const text = await request.text();
        if (!text) return {};
        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            const params = new URLSearchParams(text);
            const obj = {};
            for (const [k, v] of params.entries()) obj[k] = v;
            return obj;
        }
    } catch {
        return {};
    }
}

async function evaluateCoupon(env, rawCode, subtotal, channel = 'all') {
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
        return {
            valid: false,
            discount: 0,
            message: `Coupon ${code} is valid only for ${coupon.channel} orders.`,
        };
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
        if (maxDisc > 0 && discount > maxDisc) {
            discount = maxDisc;
        }
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

function normalizePhone10(phone) {
    const d = String(phone || '').replace(/\D+/g, '');
    return d.length > 10 ? d.slice(-10) : d;
}

async function handleProductsApi(url, env, session) {
    const id = Number(url.searchParams.get('id') || 0);
    const sku = (url.searchParams.get('sku') || '').trim();
    const slug = (url.searchParams.get('slug') || '').trim();

    if (id > 0 || sku || slug) {
        let row = null;
        if (id > 0) {
            row = await env.DB.prepare('SELECT * FROM products WHERE id = ? LIMIT 1').bind(id).first();
        } else if (sku) {
            row = await env.DB.prepare('SELECT * FROM products WHERE LOWER(sku) = LOWER(?) LIMIT 1').bind(sku).first();
        } else if (slug) {
            row = await env.DB.prepare('SELECT * FROM products WHERE LOWER(slug) = LOWER(?) LIMIT 1')
                .bind(slug)
                .first();
        }
        if (!row) {
            return jsonResponse({ success: false, message: 'Product not found.' }, 404);
        }
        const product = normalizeProduct(row, session.userRole);
        const recRows = await env.DB.prepare('SELECT * FROM products WHERE id != ? LIMIT 4').bind(product.id).all();
        const recommendations = (recRows.results || []).map((r) => normalizeProduct(r, session.userRole));
        return jsonResponse({ success: true, product, recommendations });
    }

    const category = (url.searchParams.get('category') || '').trim().toLowerCase();
    const fabric = (url.searchParams.get('fabric') || '').trim().toLowerCase();
    const search = (url.searchParams.get('search') || url.searchParams.get('q') || '').trim().toLowerCase();
    const minPrice = Number(url.searchParams.get('min_price') || 0);
    const maxPrice = Number(url.searchParams.get('max_price') || 0);
    const sort = (url.searchParams.get('sort') || 'recommended').trim();
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 50)));

    const rows = await env.DB.prepare("SELECT * FROM products WHERE status != 'draft' ORDER BY id ASC").all();
    let list = (rows.results || []).map((r) => normalizeProduct(r, session.userRole));

    if (category && category !== 'all') {
        list = list.filter((p) => p.category_name.toLowerCase().includes(category));
    }
    if (fabric) {
        list = list.filter((p) => p.fabric.toLowerCase().includes(fabric));
    }
    if (search) {
        list = list.filter((p) =>
            `${p.title} ${p.sku} ${p.category_name} ${p.fabric} ${p.description}`.toLowerCase().includes(search)
        );
    }
    if (minPrice > 0) {
        list = list.filter((p) => p.effective_price >= minPrice);
    }
    if (maxPrice > 0) {
        list = list.filter((p) => p.effective_price <= maxPrice);
    }
    if (sort === 'price_asc' || sort === 'low_high') {
        list.sort((a, b) => a.effective_price - b.effective_price);
    } else if (sort === 'price_desc' || sort === 'high_low') {
        list.sort((a, b) => b.effective_price - a.effective_price);
    } else if (sort === 'rating') {
        list.sort((a, b) => b.rating - a.rating);
    }

    list = list.slice(0, limit);
    return jsonResponse({ success: true, count: list.length, products: list });
}

async function handleSearchApi(url, env, session) {
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
    if (lowerQ) {
        categories = categories.filter((c) => `${c.name} ${c.slug}`.toLowerCase().includes(lowerQ)).slice(0, 5);
    } else {
        categories = categories.slice(0, 6);
    }

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
            if (corpus.includes('varanasi') || corpus.includes('kadwa') || corpus.includes('katan')) {
                corpus += ' banarasi banaras';
            }
            if (corpus.includes('kanjivaram') || corpus.includes('brocade')) {
                corpus += ' kanchipuram zari silk';
            }
            if (corpus.includes('paithani')) {
                corpus += ' yeola silk maharashtra';
            }
            return tokens.some((t) => corpus.includes(t));
        });
    }

    const suggestions = products.slice(0, 6).map((p) => p.title);
    return jsonResponse({
        success: true,
        query: q,
        total: products.length,
        categories,
        products,
        suggestions,
    });
}

async function handleCartApi(request, env, session) {
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
    if (ids.length === 0) {
        return jsonResponse({ success: false, message: 'No valid products in cart.' }, 400);
    }

    const placeholders = ids.map(() => '?').join(',');
    const prodRes = await env.DB.prepare(`SELECT * FROM products WHERE id IN (${placeholders})`)
        .bind(...ids)
        .all();
    const byId = new Map((prodRes.results || []).map((r) => [Number(r.id), normalizeProduct(r, session.userRole)]));

    const validatedItems = [];
    const warnings = [];
    let subtotal = 0;
    let totalQty = 0;

    for (const reqItem of items) {
        const pid = Number(reqItem.product_id || reqItem.id);
        const prod = byId.get(pid);
        if (!prod) {
            warnings.push(`Product #${pid} is no longer available.`);
            continue;
        }
        const qty = Math.max(1, Math.min(999, Number(reqItem.qty || reqItem.quantity || 1)));
        const unitPrice = prod.effective_price;
        const lineTotal = Math.round(unitPrice * qty * 100) / 100;
        subtotal += lineTotal;
        totalQty += qty;
        validatedItems.push({
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
            unit_price: unitPrice,
            line_total: lineTotal,
        });
    }

    subtotal = Math.round(subtotal * 100) / 100;
    let discount = 0;
    let couponInfo = null;
    if (couponCode) {
        couponInfo = await evaluateCoupon(env, couponCode, subtotal, session.userRole);
        if (couponInfo.valid) {
            discount = couponInfo.discount;
        } else {
            warnings.push(couponInfo.message);
        }
    }

    const afterDiscount = Math.max(0, subtotal - discount);
    const isFreeShipping = afterDiscount >= FREE_SHIPPING_THRESHOLD || afterDiscount === 0;
    const shipping = isFreeShipping ? 0 : STANDARD_SHIPPING_RATE;
    const grandTotal = Math.round((afterDiscount + shipping) * 100) / 100;

    return jsonResponse({
        success: true,
        user_type: session.userRole,
        item_count: validatedItems.length,
        total_qty: totalQty,
        items: validatedItems,
        cart: validatedItems,
        pricing: { subtotal, discount, shipping, grand_total: grandTotal },
        subtotal,
        discount,
        shipping,
        grand_total: grandTotal,
        coupon_info: couponInfo,
        free_shipping: isFreeShipping,
        free_shipping_threshold: FREE_SHIPPING_THRESHOLD,
        shipping_rate: STANDARD_SHIPPING_RATE,
        warnings,
    });
}

async function handleWishlistApi(request, url, env, session) {
    const body = await readRequestBody(request);
    const action = String(body.action || url.searchParams.get('action') || 'view').trim();
    const productId = Number(body.product_id || url.searchParams.get('product_id') || 0);
    const requestedCust = Number(body.customer_id || url.searchParams.get('customer_id') || 0);

    if (requestedCust > 0 && (!session.user || session.user.id !== requestedCust)) {
        return jsonResponse({ success: false, error: 'Access denied to another customer wishlist.' }, 403);
    }

    const ownerCol = session.user ? 'customer_id' : 'session_id';
    const ownerVal = session.user ? session.user.id : session.sid;
    let status = 'view';

    if (action === 'toggle' && productId > 0) {
        const existing = await env.DB.prepare(
            `SELECT id FROM wishlist_items WHERE ${ownerCol} = ? AND product_id = ? LIMIT 1`
        )
            .bind(ownerVal, productId)
            .first();
        if (existing) {
            await env.DB.prepare('DELETE FROM wishlist_items WHERE id = ?').bind(existing.id).run();
            status = 'removed';
        } else {
            await env.DB.prepare('INSERT INTO wishlist_items (session_id, customer_id, product_id) VALUES (?, ?, ?)')
                .bind(session.sid, session.user ? session.user.id : null, productId)
                .run();
            status = 'added';
        }
    } else if (action === 'add' && productId > 0) {
        const existing = await env.DB.prepare(
            `SELECT id FROM wishlist_items WHERE ${ownerCol} = ? AND product_id = ? LIMIT 1`
        )
            .bind(ownerVal, productId)
            .first();
        if (!existing) {
            await env.DB.prepare('INSERT INTO wishlist_items (session_id, customer_id, product_id) VALUES (?, ?, ?)')
                .bind(session.sid, session.user ? session.user.id : null, productId)
                .run();
        }
        status = 'added';
    } else if (action === 'remove' && productId > 0) {
        await env.DB.prepare(`DELETE FROM wishlist_items WHERE ${ownerCol} = ? AND product_id = ?`)
            .bind(ownerVal, productId)
            .run();
        status = 'removed';
    } else if (action === 'clear') {
        await env.DB.prepare(`DELETE FROM wishlist_items WHERE ${ownerCol} = ?`).bind(ownerVal).run();
        status = 'cleared';
    }

    const rows = await env.DB.prepare(
        `SELECT p.* FROM wishlist_items w JOIN products p ON p.id = w.product_id WHERE w.${ownerCol} = ? ORDER BY w.id DESC`
    )
        .bind(ownerVal)
        .all();
    const items = (rows.results || []).map((r) => normalizeProduct(r, session.userRole));
    return jsonResponse({ success: true, status, count: items.length, items });
}

async function handleOrdersApi(request, url, env, session) {
    if (request.method === 'GET') {
        const action = (url.searchParams.get('action') || '').trim();
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

        const orderNumber = (url.searchParams.get('order_number') || '').trim().toUpperCase();
        const phone = normalizePhone10(url.searchParams.get('phone') || '');
        if (orderNumber && phone) {
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

        return jsonResponse({ success: false, message: 'Order number and phone number are required.' }, 401);
    }

    if (request.method === 'POST') {
        const body = await readRequestBody(request);
        const action = String(body.action || 'create').trim();
        if (
            action === 'update_status' ||
            action === 'delete' ||
            action === 'bulk_delete' ||
            action === 'bulk_update_status'
        ) {
            return jsonResponse({ success: false, message: 'Admin authentication required.' }, 401);
        }

        const rawItems = typeof body.items === 'string' ? safeParseJsonArray(body.items) : body.items;
        if (!Array.isArray(rawItems) || rawItems.length === 0) {
            return jsonResponse({ success: false, message: 'Order must contain items array.' }, 400);
        }

        const customerName = String(body.customer_name || body.name || session.user?.name || '').trim();
        const customerPhone = String(body.customer_phone || body.phone || session.user?.phone || '').trim();
        if (!customerName || normalizePhone10(customerPhone).length < 10) {
            return jsonResponse(
                { success: false, message: 'Valid customer name and 10-digit phone are required.' },
                400
            );
        }

        const ids = [...new Set(rawItems.map((x) => Number(x.product_id || x.id)).filter((n) => n > 0))];
        if (ids.length === 0) {
            return jsonResponse({ success: false, message: 'Order contains no valid product IDs.' }, 400);
        }

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

        if (orderItems.length === 0) {
            return jsonResponse({ success: false, message: 'No matching products found for order.' }, 400);
        }

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
        const channel =
            session.userRole === 'wholesale' || session.userRole === 'reseller' ? session.userRole : 'retail';

        const insertRes = await env.DB.prepare(
            `INSERT INTO orders (
                order_number, session_id, customer_id, customer_name, customer_phone, customer_email,
                shipping_address, city, state, pincode, channel, subtotal, discount, gst_amount,
                shipping_fee, total_amount, coupon_code, payment_method, payment_status, fulfillment_status,
                utr_reference
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', 'processing', ?)`
        )
            .bind(
                orderNumber,
                session.sid,
                session.user ? session.user.id : 0,
                customerName,
                customerPhone,
                String(body.customer_email || body.email || session.user?.email || '').trim(),
                String(body.shipping_address || body.address || '').trim(),
                String(body.city || '').trim(),
                String(body.state || '').trim(),
                String(body.pincode || '').trim(),
                channel,
                subtotal,
                discount,
                shippingFee,
                totalAmount,
                couponCode,
                paymentMethod,
                String(body.utr_reference || '').trim()
            )
            .run();

        const orderId = Number(insertRes.meta?.last_row_id || 0);
        for (const item of orderItems) {
            await env.DB.prepare(
                `INSERT INTO order_items (order_id, product_id, product_title, sku, unit_price, quantity, total_price, image)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
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

async function handleAuthApi(request, url, env, session) {
    const body = await readRequestBody(request);
    const action = String(url.searchParams.get('action') || body.action || 'session').trim();

    if (action === 'session') {
        const secret = await getSigningSecret(env);
        const csrfToken = await signToken({ sid: session.sid, exp: Date.now() + 86400000 }, secret);
        return jsonResponse({
            authenticated: session.user !== null,
            user: session.user,
            admin_authenticated: false,
            admin: null,
            csrf_token: csrfToken,
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
        if (!['customer', 'retail', 'wholesale', 'reseller', 'retailer'].includes(reqType)) {
            reqType = 'customer';
        }
        if (reqType === 'retail') reqType = 'customer';

        if (!name || phone.length < 10 || password.length < 6) {
            return jsonResponse(
                { success: false, message: 'Name, valid 10-digit phone, and password (6+ chars) are required.' },
                400
            );
        }

        const existing = await env.DB.prepare(
            'SELECT id FROM customers WHERE phone = ? OR (email != "" AND email = ?) LIMIT 1'
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
            `INSERT INTO customers (name, phone, email, password_hash, type, city, state, gstin, pan, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        const phone10 = normalizePhone10(identity);
        const emailLower = identity.toLowerCase();

        const row = await env.DB.prepare(
            'SELECT * FROM customers WHERE (phone = ? AND phone != "") OR (LOWER(email) = ? AND email != "") LIMIT 1'
        )
            .bind(phone10, emailLower)
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
        const updated = { ...session.user, name, email, city, state };
        return jsonResponse({ success: true, user: updated, message: 'Profile updated successfully.' });
    }

    if (action === 'change_password') {
        const currentPw = String(body.current_password || '');
        const newPw = String(body.new_password || '');
        if (newPw.length < 6) {
            return jsonResponse({ success: false, message: 'New password must be at least 6 characters.' }, 400);
        }
        const row = await env.DB.prepare('SELECT password_hash FROM customers WHERE id = ? LIMIT 1')
            .bind(session.user.id)
            .first();
        if (!row || !(await verifyPassword(currentPw, row.password_hash))) {
            return jsonResponse({ success: false, message: 'Current password is incorrect.' }, 400);
        }
        const newHash = await hashPassword(newPw);
        await env.DB.prepare('UPDATE customers SET password_hash = ? WHERE id = ?')
            .bind(newHash, session.user.id)
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
            return jsonResponse(
                { success: false, message: 'Complete address, city, state, and pincode are required.' },
                400
            );
        }
        await env.DB.prepare(
            `INSERT INTO addresses (customer_id, recipient_name, phone, address_line1, address_line2, city, state, pincode, address_type, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        )
            .bind(
                session.user.id,
                String(body.recipient_name || session.user.name).trim(),
                String(body.phone || session.user.phone).trim(),
                line1,
                String(body.address_line2 || '').trim(),
                city,
                state,
                pincode,
                String(body.address_type || 'home').trim()
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

async function handleReviewsApi(request, url, env) {
    if (request.method === 'GET') {
        const action = (url.searchParams.get('action') || '').trim();
        if (action === 'stats') {
            const row = await env.DB.prepare(
                "SELECT COUNT(*) AS total, COALESCE(AVG(rating), 5) AS avg_rating FROM reviews WHERE status = 'approved'"
            ).first();
            return jsonResponse({ success: true, stats: row || { total: 0, avg_rating: 5 } });
        }
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
        const reviews = rows.results || [];
        return jsonResponse({ success: true, count: reviews.length, reviews });
    }

    if (request.method === 'POST') {
        const body = await readRequestBody(request);
        const productId = Number(body.product_id || 0);
        const name = String(body.name || body.customer_name || 'Verified Buyer').trim();
        const rating = Math.min(5, Math.max(1, Number(body.rating || 5)));
        const title = String(body.review_title || '').trim();
        const text = String(body.review_text || '').trim();
        if (productId <= 0 || !text) {
            return jsonResponse({ success: false, message: 'Product ID and review text are required.' }, 400);
        }
        await env.DB.prepare(
            `INSERT INTO reviews (product_id, customer_name, rating, review_title, review_text, verified_buyer, status)
             VALUES (?, ?, ?, ?, ?, 1, 'approved')`
        )
            .bind(productId, name, rating, title, text)
            .run();
        await env.DB.prepare('UPDATE products SET reviews_count = reviews_count + 1 WHERE id = ?')
            .bind(productId)
            .run();
        return jsonResponse({
            success: true,
            status: 'approved',
            message: 'Thank you! Your review is now published.',
        });
    }

    return jsonResponse({ success: false, message: 'Method not allowed.' }, 405);
}

async function handleB2bApi(request, env, session, channel) {
    if (request.method === 'GET') {
        const rows = await env.DB.prepare("SELECT * FROM products WHERE status != 'draft' ORDER BY id ASC").all();
        const products = (rows.results || []).map((r) => normalizeProduct(r, channel));
        return jsonResponse({ success: true, channel, products, user: session.user });
    }
    const body = await readRequestBody(request);
    const action = String(body.action || '').trim();
    if (!session.user) {
        return jsonResponse({ success: false, message: 'Authentication required for B2B account actions.' }, 401);
    }
    if (action === 'update_profile') {
        const name = String(body.name || session.user.name).trim();
        await env.DB.prepare('UPDATE customers SET name = ? WHERE id = ?').bind(name, session.user.id).run();
        return jsonResponse({ success: true, message: 'Profile updated.' });
    }
    return jsonResponse({ success: true, channel, message: 'Action recorded.' });
}

async function servePageTemplate(request, url, env, session, templateName) {
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

    // Inject live D1 products/categories and fresh CSRF + session state
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
    headers.set('x-dt-edge', 'cloudflare-workers-d1');
    if (session.sidNew) {
        headers.append('set-cookie', buildCookieHeader(SID_COOKIE, session.sid, 86400 * 30, true));
    }

    return new Response(html, { status: 200, headers });
}

async function handleSitemap(url, env) {
    const prodRes = await env.DB.prepare("SELECT id, slug FROM products WHERE status != 'draft' ORDER BY id ASC").all();
    const catRes = await env.DB.prepare(
        "SELECT slug FROM categories WHERE status = 'active' ORDER BY display_order ASC"
    ).all();
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

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        console.log(JSON.stringify({ event: 'request', method: request.method, path }));

        try {
            // 1. Direct static asset routes
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

            // 2. Health checks (verified against live D1)
            if (
                path === '/_worker/health' ||
                path === '/health.php' ||
                path === '/api/health.php' ||
                path === '/api/db_health.php'
            ) {
                const row = await env.DB.prepare('SELECT COUNT(*) AS product_count FROM products').first();
                return jsonResponse({
                    ok: true,
                    success: true,
                    status: 'healthy',
                    service: 'dt-brands-cloudflare-storefront',
                    database: 'cloudflare-d1',
                    products: Number(row?.product_count || 0),
                });
            }

            // 3. Sitemap
            if (path === '/sitemap.xml' || path === '/sitemap.php') {
                return handleSitemap(url, env);
            }

            const session = await getSessionContext(request, env);

            // 4. API Routes (D1-backed)
            if (path.startsWith('/api/')) {
                if (request.method === 'OPTIONS') {
                    return new Response(null, { status: 204 });
                }
                if (path === '/api/products.php' || path === '/api/products' || path === '/api/products/index.php') {
                    return handleProductsApi(url, env, session);
                }
                if (path === '/api/search.php' || path === '/api/search') {
                    return handleSearchApi(url, env, session);
                }
                if (
                    path === '/api/categories.php' ||
                    path === '/api/categories' ||
                    path === '/api/categories/index.php'
                ) {
                    const cats = await env.DB.prepare(
                        "SELECT * FROM categories WHERE status = 'active' ORDER BY display_order ASC"
                    ).all();
                    return jsonResponse({ success: true, categories: cats.results || [] });
                }
                if (path === '/api/coupons.php' || path === '/api/coupons') {
                    const code = url.searchParams.get('code') || '';
                    const subtotal = Number(url.searchParams.get('subtotal') || 0);
                    const channel = url.searchParams.get('channel') || 'all';
                    const result = await evaluateCoupon(env, code, subtotal, channel);
                    return jsonResponse({
                        success: result.valid,
                        code: result.code || code,
                        discount: result.discount,
                        discount_type: result.discount_type || 'percentage',
                        discount_value: result.discount_value || 0,
                        title: result.title || '',
                        message: result.message,
                    });
                }
                if (path === '/api/cart.php' || path === '/api/cart' || path === '/api/cart/index.php') {
                    return handleCartApi(request, env, session);
                }
                if (path === '/api/wishlist.php' || path === '/api/wishlist' || path === '/api/wishlist/index.php') {
                    return handleWishlistApi(request, url, env, session);
                }
                if (path === '/api/orders.php' || path === '/api/orders' || path === '/api/orders/index.php') {
                    return handleOrdersApi(request, url, env, session);
                }
                if (path === '/api/auth.php' || path === '/api/auth' || path === '/api/auth/index.php') {
                    return handleAuthApi(request, url, env, session);
                }
                if (path === '/api/reviews.php' || path === '/api/reviews') {
                    return handleReviewsApi(request, url, env);
                }
                if (path === '/api/wholesale.php' || path === '/api/wholesale/index.php') {
                    return handleB2bApi(request, env, session, 'wholesale');
                }
                if (path === '/api/reseller.php' || path === '/api/reseller/index.php') {
                    return handleB2bApi(request, env, session, 'reseller');
                }
                if (path === '/api/retailer.php' || path === '/api/retailer/index.php') {
                    return handleB2bApi(request, env, session, 'retailer');
                }
                return jsonResponse({ success: false, message: 'API endpoint not found.' }, 404);
            }

            // 5. Contact form POST submission
            if ((path === '/contact' || path === '/contact.php') && request.method === 'POST') {
                const body = await readRequestBody(request);
                const name = String(body.name || '').trim();
                const message = String(body.message || '').trim();
                if (!name || !message) {
                    return jsonResponse({ success: false, message: 'Name and message are required.' }, 400);
                }
                await env.DB.prepare(
                    'INSERT INTO contact_messages (name, phone, email, subject, message) VALUES (?, ?, ?, ?, ?)'
                )
                    .bind(
                        name,
                        String(body.phone || '').trim(),
                        String(body.email || '').trim(),
                        String(body.subject || 'Storefront Enquiry').trim(),
                        message
                    )
                    .run();
                return jsonResponse({
                    success: true,
                    message: 'Thank you! Our Surat concierge team will reply shortly.',
                });
            }

            // 6. Product Detail Page (/product, /product.php, /product/<slug>)
            if (path === '/product' || path === '/product.php' || path.startsWith('/product/')) {
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
                return servePageTemplate(request, url, env, session, tplName);
            }

            // 7. Storefront HTML Pages
            const cleanPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
            if (Object.prototype.hasOwnProperty.call(PAGE_ROUTES, cleanPath)) {
                return servePageTemplate(request, url, env, session, PAGE_ROUTES[cleanPath]);
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
