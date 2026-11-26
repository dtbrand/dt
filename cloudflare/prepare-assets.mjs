/**
 * Prepare Cloudflare Workers Static Assets directory (./cloudflare/public)
 * Runs automatically during `wrangler deploy` / `wrangler preview` via [build].
 */

import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'cloudflare', 'public');
const pagesSrcDir = path.join(rootDir, 'cloudflare', 'pages');
const pagesDestDir = path.join(publicDir, '_pages');
const assetsSrcDir = path.join(rootDir, 'assets');
const assetsDestDir = path.join(publicDir, 'assets');

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(pagesDestDir, { recursive: true });
fs.mkdirSync(assetsDestDir, { recursive: true });

if (fs.existsSync(assetsSrcDir)) {
    fs.cpSync(assetsSrcDir, assetsDestDir, { recursive: true });
}

if (fs.existsSync(pagesSrcDir)) {
    for (const entry of fs.readdirSync(pagesSrcDir)) {
        if (entry.endsWith('.html')) {
            fs.copyFileSync(path.join(pagesSrcDir, entry), path.join(pagesDestDir, entry));
        }
    }
}

for (const file of ['manifest.json', 'robots.txt']) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(publicDir, file));
    }
}

console.log('Prepared cloudflare/public static assets and page templates.');
