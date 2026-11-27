/**
 * Cloudflare Cloud Storage (R2 + KV + D1 metadata) and Transactional Email Service.
 */

import { toBase64Url } from './utils.js';

export function getStorageStatus(env) {
    return {
        d1: Boolean(env.DB),
        kv: Boolean(env.KV),
        r2: Boolean(env.MEDIA_BUCKET),
        email_binding: Boolean(env.EMAIL),
        email_api: Boolean(env.RESEND_API_KEY),
    };
}

/**
 * Store a binary/text object in Cloudflare R2 (when enabled & bound) and/or Cloudflare KV,
 * and register searchable metadata in D1 `media_files`.
 */
export async function storeCloudObject(env, { fileKey, filename, bytes, contentType, uploadedBy = 'admin' }) {
    const sizeBytes = bytes.byteLength;
    let backend = 'd1_metadata';

    if (env.MEDIA_BUCKET) {
        await env.MEDIA_BUCKET.put(fileKey, bytes, {
            httpMetadata: { contentType },
            customMetadata: { filename, uploadedBy },
        });
        backend = 'cloudflare_r2';
    } else if (env.KV) {
        await env.KV.put(`blob:${fileKey}`, bytes, {
            metadata: { contentType, filename, sizeBytes },
        });
        backend = 'cloudflare_kv';
    }

    const publicUrl = `/media/${encodeURIComponent(fileKey)}`;
    await env.DB.prepare(
        `INSERT INTO media_files (file_key, filename, content_type, size_bytes, storage_backend, public_url, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_key) DO UPDATE SET
           filename = excluded.filename,
           content_type = excluded.content_type,
           size_bytes = excluded.size_bytes,
           storage_backend = excluded.storage_backend`
    )
        .bind(fileKey, filename, contentType, sizeBytes, backend, publicUrl, uploadedBy)
        .run();

    return {
        file_key: fileKey,
        filename,
        content_type: contentType,
        size_bytes: sizeBytes,
        storage_backend: backend,
        url: publicUrl,
    };
}

export async function readCloudObject(env, fileKey) {
    const meta = await env.DB.prepare('SELECT * FROM media_files WHERE file_key = ? LIMIT 1').bind(fileKey).first();

    if (env.MEDIA_BUCKET) {
        const obj = await env.MEDIA_BUCKET.get(fileKey);
        if (obj) {
            return {
                body: obj.body,
                contentType: obj.httpMetadata?.contentType || meta?.content_type || 'application/octet-stream',
            };
        }
    }

    if (env.KV) {
        const res = await env.KV.getWithMetadata(`blob:${fileKey}`, { type: 'arrayBuffer' });
        if (res && res.value) {
            return {
                body: res.value,
                contentType: res.metadata?.contentType || meta?.content_type || 'application/octet-stream',
            };
        }
    }

    return null;
}

export async function deleteCloudObject(env, fileKey) {
    if (env.MEDIA_BUCKET) {
        await env.MEDIA_BUCKET.delete(fileKey);
    }
    if (env.KV) {
        await env.KV.delete(`blob:${fileKey}`);
    }
    await env.DB.prepare('DELETE FROM media_files WHERE file_key = ?').bind(fileKey).run();
    return true;
}

/**
 * Generate and store a live D1 SQL/JSON snapshot backup in Cloudflare KV / R2.
 */
export async function createCloudBackup(env, actor = 'admin') {
    const tables = [
        'categories',
        'products',
        'customers',
        'orders',
        'order_items',
        'coupons',
        'reviews',
        'settings',
        'media_files',
        'notifications_log',
        'email_outbox',
    ];
    const snapshot = {
        created_at: new Date().toISOString(),
        actor,
        database: 'dt-brands-db',
        tables: {},
    };
    for (const tbl of tables) {
        try {
            const res = await env.DB.prepare(`SELECT * FROM ${tbl} LIMIT 5000`).all();
            snapshot.tables[tbl] = res.results || [];
        } catch {
            snapshot.tables[tbl] = [];
        }
    }

    const bytes = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = new Uint8Array(4);
    crypto.getRandomValues(rand);
    const key = `backups/dt-d1-backup-${stamp}-${toBase64Url(rand)}.json`;

    const saved = await storeCloudObject(env, {
        fileKey: key,
        filename: key.split('/').pop(),
        bytes,
        contentType: 'application/json; charset=utf-8',
        uploadedBy: actor,
    });

    return { ...saved, record_counts: Object.fromEntries(tables.map((t) => [t, snapshot.tables[t].length])) };
}

/**
 * Dispatch transactional email via Cloudflare Email Service (`env.EMAIL`),
 * fallback Resend API (`env.RESEND_API_KEY`), and always record in D1 `email_outbox`
 * & `notifications_log`.
 */
export async function sendTransactionalEmail(
    env,
    { to, from = 'noreply@yourdomain.com', subject, html, text = '', eventType = 'transactional', orderNumber = '' }
) {
    const cleanTo = String(to || '').trim();
    const cleanText =
        text ||
        html
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    let provider = 'd1_outbox';
    let status = 'queued';
    let messageId = '';
    let errorMessage = '';

    if (!cleanTo || !cleanTo.includes('@')) {
        return { success: false, status: 'invalid_recipient', message: 'Valid recipient email required.' };
    }

    if (env.EMAIL && typeof env.EMAIL.send === 'function') {
        provider = 'cloudflare_email_service';
        try {
            const res = await env.EMAIL.send({
                from: { email: from, name: "DT Brand's & Jai Hanuman Tex" },
                to: [cleanTo],
                subject,
                html,
                text: cleanText,
            });
            status = 'sent';
            messageId = res?.messageId || '';
        } catch (err) {
            status = 'failed';
            errorMessage = err instanceof Error ? err.message : String(err);
        }
    } else if (env.RESEND_API_KEY) {
        provider = 'resend_api';
        try {
            const resp = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${env.RESEND_API_KEY}`,
                    'content-type': 'application/json',
                },
                body: JSON.stringify({ from, to: [cleanTo], subject, html, text: cleanText }),
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok) {
                status = 'sent';
                messageId = data.id || '';
            } else {
                status = 'failed';
                errorMessage = data.message || `HTTP ${resp.status}`;
            }
        } catch (err) {
            status = 'failed';
            errorMessage = err instanceof Error ? err.message : String(err);
        }
    } else {
        provider = 'cloudflare_outbox_pending_domain';
        status = 'queued';
        errorMessage =
            'Bind a verified domain to Cloudflare Email Service (`send_email`) or set RESEND_API_KEY secret for external delivery.';
    }

    await env.DB.prepare(
        `INSERT INTO email_outbox (to_email, from_email, subject, html_body, text_body, event_type, order_number, provider, status, provider_message_id, error_message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(
            cleanTo,
            from,
            subject,
            html,
            cleanText,
            eventType,
            orderNumber,
            provider,
            status,
            messageId,
            errorMessage
        )
        .run();

    await env.DB.prepare(
        `INSERT INTO notifications_log (channel, recipient, template_key, subject, content, provider, status, error_message)
         VALUES ('email', ?, ?, ?, ?, ?, ?, ?)`
    )
        .bind(cleanTo, eventType, subject, cleanText.slice(0, 500), provider, status, errorMessage)
        .run();

    return {
        success: status !== 'failed',
        status,
        provider,
        message_id: messageId,
        note: errorMessage || undefined,
    };
}
