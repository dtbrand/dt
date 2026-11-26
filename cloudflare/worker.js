/**
 * Cloudflare Worker Edge Proxy for DT Brand's & Jai Hanuman Tex
 *
 * This project runs on PHP 8.2 + MySQL + Apache (Hostinger Business).
 * Because Cloudflare Workers cannot execute PHP/MySQL directly, this Worker
 * acts as a transparent reverse proxy to ORIGIN_URL (default: https://jaihanumantex.in),
 * preserving redirects, session cookies, API requests, and webhook payloads.
 */

const DEFAULT_ORIGIN = 'https://jaihanumantex.in';

/**
 * Render a branded 502 fallback page when the origin is unreachable.
 *
 * @param {string} origin
 * @returns {string}
 */
function renderUpstreamErrorHtml(origin) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Temporarily Unavailable — DT Brand's &amp; Jai Hanuman Tex</title>
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            background: #FAF5E8;
            color: #111827;
            font-family: 'Inter', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            -webkit-font-smoothing: antialiased;
        }
        .dt-card {
            max-width: 480px;
            width: 100%;
            background: #FFFFFF;
            border: 1px solid #D4AF37;
            border-radius: 16px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 12px 32px rgba(18, 16, 12, 0.08);
        }
        .dt-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 52px;
            height: 52px;
            border-radius: 12px;
            background: #FAF5E8;
            color: #8A681F;
            border: 1px solid #D4AF37;
            margin-bottom: 16px;
        }
        h1 {
            margin: 0 0 10px;
            font-size: 1.25rem;
            font-weight: 800;
            letter-spacing: -0.011em;
            color: #111827;
        }
        p {
            margin: 0 0 24px;
            font-size: 0.95rem;
            line-height: 1.55;
            color: #334155;
        }
        .dt-btn-gold {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 11px 20px;
            border-radius: 10px;
            border: 1px solid #8A681F;
            background: linear-gradient(135deg, #B8860B 0%, #D4AF37 50%, #E6CA65 100%);
            color: #111827;
            font-weight: 800;
            font-size: 0.9rem;
            text-decoration: none;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 2px 8px rgba(184, 134, 11, 0.35);
        }
    </style>
</head>
<body>
    <main class="dt-card">
        <div class="dt-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
            </svg>
        </div>
        <h1>Origin Connection Unavailable</h1>
        <p>The Cloudflare edge proxy could not reach the storefront origin at this moment. Please retry shortly or visit the primary storefront directly.</p>
        <a class="dt-btn-gold" href="${origin}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
            Open Primary Storefront
        </a>
    </main>
</body>
</html>`;
}

/**
 * Rewrite Location headers so redirects stay on the Worker origin when applicable.
 *
 * @param {Headers} responseHeaders
 * @param {URL} originUrl
 * @param {URL} incomingUrl
 */
function rewriteLocationHeader(responseHeaders, originUrl, incomingUrl) {
    const location = responseHeaders.get('location');
    if (!location) {
        return;
    }

    try {
        const parsed = new URL(location, originUrl);
        if (parsed.origin === originUrl.origin) {
            parsed.protocol = incomingUrl.protocol;
            parsed.host = incomingUrl.host;
            responseHeaders.set('location', parsed.toString());
        }
    } catch {
        // Leave non-standard Location headers untouched.
    }
}

/**
 * Strip origin Domain attributes from Set-Cookie when proxying across hostnames
 * so PHP session and CSRF cookies remain valid on *.workers.dev.
 *
 * @param {Headers} responseHeaders
 * @param {URL} originUrl
 * @param {URL} incomingUrl
 */
function rewriteCookieDomains(responseHeaders, originUrl, incomingUrl) {
    if (incomingUrl.hostname === originUrl.hostname) {
        return;
    }

    const cookies = typeof responseHeaders.getSetCookie === 'function' ? responseHeaders.getSetCookie() : [];
    if (cookies.length === 0) {
        return;
    }

    responseHeaders.delete('set-cookie');
    for (const cookie of cookies) {
        const rewritten = cookie.replace(/;\s*domain=[^;]+/gi, '');
        responseHeaders.append('set-cookie', rewritten);
    }
}

export default {
    /**
     * Handle incoming HTTP requests and proxy them to ORIGIN_URL.
     *
     * @param {Request} request
     * @param {{ ORIGIN_URL?: string }} env
     * @returns {Promise<Response>}
     */
    async fetch(request, env) {
        const originBase = (env && env.ORIGIN_URL) || DEFAULT_ORIGIN;
        const originUrl = new URL(originBase);
        const incomingUrl = new URL(request.url);

        if (incomingUrl.pathname === '/_worker/health') {
            return Response.json(
                {
                    ok: true,
                    service: 'dt-brands-edge-proxy',
                    origin: originUrl.origin,
                },
                {
                    headers: { 'cache-control': 'no-store' },
                }
            );
        }

        if (request.headers.get('x-dt-worker-proxy') === '1') {
            return Response.json(
                {
                    ok: false,
                    error: 'Proxy loop detected: ORIGIN_URL must point to your Hostinger origin, not this Worker route.',
                },
                { status: 508 }
            );
        }

        const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, originUrl);
        const upstreamHeaders = new Headers(request.headers);
        upstreamHeaders.delete('host');
        upstreamHeaders.set('x-forwarded-host', incomingUrl.host);
        upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));
        upstreamHeaders.set('x-dt-worker-proxy', '1');

        const clientIp = request.headers.get('cf-connecting-ip');
        if (clientIp && !upstreamHeaders.has('x-real-ip')) {
            upstreamHeaders.set('x-real-ip', clientIp);
        }

        const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

        try {
            const upstreamResponse = await fetch(targetUrl.toString(), {
                method: request.method,
                headers: upstreamHeaders,
                body: hasBody ? request.body : undefined,
                redirect: 'manual',
            });

            const responseHeaders = new Headers(upstreamResponse.headers);
            rewriteLocationHeader(responseHeaders, originUrl, incomingUrl);
            rewriteCookieDomains(responseHeaders, originUrl, incomingUrl);
            responseHeaders.set('x-dt-edge-proxy', 'cloudflare-worker');

            return new Response(upstreamResponse.body, {
                status: upstreamResponse.status,
                statusText: upstreamResponse.statusText,
                headers: responseHeaders,
            });
        } catch {
            const acceptsJson = (request.headers.get('accept') || '').includes('application/json');
            if (acceptsJson) {
                return Response.json(
                    {
                        ok: false,
                        error: 'Origin unreachable from Cloudflare Worker proxy.',
                    },
                    { status: 502 }
                );
            }

            return new Response(renderUpstreamErrorHtml(originUrl.origin), {
                status: 502,
                headers: {
                    'content-type': 'text/html; charset=UTF-8',
                    'cache-control': 'no-store',
                },
            });
        }
    },
};
