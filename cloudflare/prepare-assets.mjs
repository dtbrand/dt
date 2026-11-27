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
const adminPagesSrcDir = path.join(rootDir, 'cloudflare', 'admin_pages');
const adminPagesDestDir = path.join(publicDir, '_admin_pages');
const assetsSrcDir = path.join(rootDir, 'assets');
const assetsDestDir = path.join(publicDir, 'assets');
const adminSrcDir = path.join(rootDir, 'admin');
const adminAssetsDestDir = path.join(publicDir, 'admin');

const STATIC_EXTS = new Set([
    '.css',
    '.js',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.svg',
    '.gif',
    '.woff',
    '.woff2',
    '.json',
]);

function copyFilteredStaticTree(src, dest) {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const sPath = path.join(src, entry.name);
        const dPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyFilteredStaticTree(sPath, dPath);
        } else if (entry.isFile() && STATIC_EXTS.has(path.extname(entry.name).toLowerCase())) {
            fs.copyFileSync(sPath, dPath);
        }
    }
}

fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(pagesDestDir, { recursive: true });
fs.mkdirSync(adminPagesDestDir, { recursive: true });
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

if (fs.existsSync(adminPagesSrcDir)) {
    fs.cpSync(adminPagesSrcDir, adminPagesDestDir, { recursive: true });
}

copyFilteredStaticTree(adminSrcDir, adminAssetsDestDir);

const edgeBridgeSrc = path.join(rootDir, 'cloudflare', 'admin-edge-bridge.js');
if (fs.existsSync(edgeBridgeSrc)) {
    fs.mkdirSync(path.join(adminAssetsDestDir, 'assets', 'js'), { recursive: true });
    fs.copyFileSync(edgeBridgeSrc, path.join(adminAssetsDestDir, 'assets', 'js', 'admin-edge-bridge.js'));
}

for (const file of ['manifest.json', 'robots.txt']) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(publicDir, file));
    }
}

console.log('Prepared cloudflare/public static assets, storefront pages, and real admin templates/assets.');
