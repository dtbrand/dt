/**
 * Shared crypto, cookie, session, normalization, and SQL helpers for Cloudflare Workers.
 */

export const SESSION_COOKIE = 'dt_cf_session';
export const ADMIN_COOKIE = 'dt_cf_admin';
export const SID_COOKIE = 'dt_cf_sid';

export function jsonResponse(payload, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            ...extraHeaders,
        },
    });
}

export function parseCookies(request) {
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

export function toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) {
        bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

export async function getSigningSecret(env) {
    if (env.SESSION_SECRET && String(env.SESSION_SECRET).length >= 16) {
        return String(env.SESSION_SECRET);
    }
    if (env.KV) {
        const kvVal = await env.KV.get('cfg:session_secret');
        if (kvVal) return kvVal;
    }
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS app_config (key TEXT PRIMARY KEY, value TEXT NOT NULL)').run();
    const row = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('session_secret').first();
    if (row && row.value) {
        if (env.KV) await env.KV.put('cfg:session_secret', row.value);
        return row.value;
    }
    const rand = new Uint8Array(32);
    crypto.getRandomValues(rand);
    const generated = toBase64Url(rand);
    await env.DB.prepare('INSERT OR IGNORE INTO app_config (key, value) VALUES (?, ?)')
        .bind('session_secret', generated)
        .run();
    const stored = await env.DB.prepare('SELECT value FROM app_config WHERE key = ?').bind('session_secret').first();
    const finalSecret = stored ? stored.value : generated;
    if (env.KV) await env.KV.put('cfg:session_secret', finalSecret);
    return finalSecret;
}

export async function signToken(payloadObj, secret) {
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

export async function verifyToken(token, secret) {
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

export async function hashPassword(password) {
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

export async function verifyPassword(password, storedHash) {
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

export async function verifyHmacHex(payloadText, secret, signatureHex) {
    if (!secret || !signatureHex) return false;
    try {
        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadText));
        const actualHex = Array.from(new Uint8Array(sigBuf))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        const expected = String(signatureHex).trim().toLowerCase();
        if (actualHex.length !== expected.length) return false;
        let diff = 0;
        for (let i = 0; i < actualHex.length; i++) {
            diff |= actualHex.charCodeAt(i) ^ expected.charCodeAt(i);
        }
        return diff === 0;
    } catch {
        return false;
    }
}

export function safeParseJsonArray(raw, fallback = []) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

export function normalizePhone10(phone) {
    const d = String(phone || '').replace(/\D+/g, '');
    return d.length > 10 ? d.slice(-10) : d;
}

export function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function buildCookieHeader(name, value, maxAgeSeconds = 86400 * 7, httpOnly = true) {
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

export async function readRequestBody(request) {
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

export function normalizeProduct(row, userRole = 'guest') {
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

export async function getSessionContext(request, env) {
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
    let admin = null;
    const secret = await getSigningSecret(env);

    if (cookies[SESSION_COOKIE]) {
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

    if (cookies[ADMIN_COOKIE]) {
        const adminData = await verifyToken(cookies[ADMIN_COOKIE], secret);
        if (adminData && adminData.aid) {
            const dbAdmin = await env.DB.prepare('SELECT id, name, email, role, status FROM users WHERE id = ? LIMIT 1')
                .bind(Number(adminData.aid))
                .first();
            if (dbAdmin && dbAdmin.status === 'active') {
                admin = {
                    id: Number(dbAdmin.id),
                    name: dbAdmin.name,
                    email: dbAdmin.email,
                    role: dbAdmin.role || 'admin',
                };
            }
        }
    }

    const userRole = admin
        ? 'admin'
        : user
          ? user.type === 'wholesaler'
              ? 'wholesale'
              : user.type === 'retail'
                ? 'customer'
                : user.type
          : 'guest';

    return { sid, sidNew, user, admin, isAdmin: admin !== null, userRole };
}

export async function logAudit(env, actor, action, entityType, entityId, details, request) {
    try {
        const ip = request?.headers.get('cf-connecting-ip') || '0.0.0.0';
        await env.DB.prepare(
            'INSERT INTO audit_logs (actor, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)'
        )
            .bind(String(actor), String(action), String(entityType), String(entityId), String(details), ip)
            .run();
    } catch {
        // Non-blocking audit logging
    }
}
