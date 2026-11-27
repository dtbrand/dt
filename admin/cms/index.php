<?php
/* DT admin access guard (auto-inserted) */ $__dtg = $_SERVER['DOCUMENT_ROOT'] . '/admin/includes/adminguard.php'; if (is_file($__dtg)) require_once $__dtg;

/**
 * index.php - DT Brand's Admin Cms Module
 * DT Brand's & Jai Hanuman Tex
 */
require_once __DIR__ . '/../../src/Database.php';

use DTBrand\Database;

$page_title = "CMS Content & Policy Pages Manager";
$active_nav = "cms";

$cmsPages = [
    [
        'title' => "About DT Brand's & Jai Hanuman Tex",
        'slug' => '/about-us',
        'type' => 'Brand Story',
        'content' => "DT Brand's & Jai Hanuman Tex heritage manufacturer of Surat pure silk & wedding bridal wear.",
    ],
    [
        'title' => 'Wholesale B2B Terms & MOQ Bale Policy',
        'slug' => '/wholesale-policy',
        'type' => 'B2B Policy',
        'content' => 'Direct Surat Mill B2B MOQ rules, bale billing, and GST invoicing policy.',
    ],
    [
        'title' => 'Return, Exchange & Damage Replacement',
        'slug' => '/return-policy',
        'type' => 'Customer Policy',
        'content' => '7-day transit damage and manufacturing defect replacement policy.',
    ],
    [
        'title' => 'Privacy Policy & Data Security',
        'slug' => '/privacy-policy',
        'type' => 'Compliance',
        'content' => 'Customer personal information protection and payment encryption standards.',
    ],
    [
        'title' => 'Shipping & Delhivery Courier SLAs',
        'slug' => '/shipping-policy',
        'type' => 'Logistics',
        'content' => '24-48h dispatch and pan-India courier delivery SLAs.',
    ]
];
try {
    $dbRows = Database::query("SELECT id, slug, title, content, status, updated_at FROM cms_pages ORDER BY id ASC");
    if (empty($dbRows)) {
        $pdo = Database::getConnection();
        if ($pdo) {
            $ins = $pdo->prepare("INSERT INTO cms_pages (slug, title, content, status, created_at, updated_at) VALUES (?, ?, ?, 'published', NOW(), NOW())");
            foreach ($cmsPages as $seed) {
                $ins->execute([$seed['slug'], $seed['title'], $seed['content']]);
            }
            $dbRows = Database::query("SELECT id, slug, title, content, status, updated_at FROM cms_pages ORDER BY id ASC");
        }
    }
    if (!empty($dbRows)) {
        $typeLookup = array_column($cmsPages, 'type', 'slug');
        $cmsPages = array_map(static function ($r) use ($typeLookup) {
            return [
                'id' => (int)$r['id'],
                'title' => (string)$r['title'],
                'slug' => (string)$r['slug'],
                'content' => (string)($r['content'] ?? ''),
                'type' => $typeLookup[$r['slug']] ?? 'CMS Page',
                'last_modified' => !empty($r['updated_at']) ? date('d M Y', strtotime($r['updated_at'])) : date('d M Y'),
                'status' => ucfirst((string)($r['status'] ?? 'published'))
            ];
        }, $dbRows);
    }
} catch (\Throwable $e) {}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CMS Content &amp; Policy Pages Manager - DT Brand's Admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/admin/assets/css/admin.css?v=<?php echo time(); ?>">
</head>
<body>
<div class="adm-layout">
    <?php include_once __DIR__ . '/../includes/adminsidebar.php'; ?>
    <div class="adm-main">
        <?php include_once __DIR__ . '/../includes/adminheader.php'; ?>
        <main class="adm-content">
            <div class="adm-page-head">
                <div class="adm-page-title-group">
                    <h1 class="adm-page-title">
                        <span>CMS Content &amp; Policy Pages Manager</span>
                        <span class="adm-badge gold"><?= count($cmsPages) ?> Pages Live</span>
                    </h1>
                    <p class="adm-page-subtitle">Edit About Us, Wholesale Terms, Return Policy, and SEO Meta tags.</p>
                </div>
                <div class="adm-page-actions">
                    <a href="/admin" class="adm-btn-secondary dt-btn dt-btn-pale"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="margin-right:4px;"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Back to Main Console</a>
                </div>
            </div>

            <!-- KPI Metric Cards -->
            <div class="adm-kpi-grid">
                <div class="adm-kpi-card">
                    <div class="adm-kpi-top">
                        <span class="adm-kpi-label">CMS Pages</span>
                        <div class="adm-kpi-icon-box">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A681F" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        </div>
                    </div>
                    <div class="adm-kpi-val"><?= count($cmsPages) ?> Live Pages</div>
                    <div class="adm-kpi-bottom">
                        <span class="adm-kpi-delta up">100% SEO Optimized</span>
                    </div>
                </div>
                
                <div class="adm-kpi-card">
                    <div class="adm-kpi-top">
                        <span class="adm-kpi-label">Hero Banners</span>
                        <div class="adm-kpi-icon-box">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A681F" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        </div>
                    </div>
                    <div class="adm-kpi-val">4 Banners</div>
                    <div class="adm-kpi-bottom">
                        <span class="adm-kpi-delta up">High-Res WebP Slider</span>
                    </div>
                </div>
                
                <div class="adm-kpi-card">
                    <div class="adm-kpi-top">
                        <span class="adm-kpi-label">Legal Policies</span>
                        <div class="adm-kpi-icon-box">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A681F" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                        </div>
                    </div>
                    <div class="adm-kpi-val">Updated <?= date('Y') ?></div>
                    <div class="adm-kpi-bottom">
                        <span class="adm-kpi-delta up">Compliant with GST Rules</span>
                    </div>
                </div>
                
                <div class="adm-kpi-card">
                    <div class="adm-kpi-top">
                        <span class="adm-kpi-label">SEO Indexing</span>
                        <div class="adm-kpi-icon-box">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A681F" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        </div>
                    </div>
                    <div class="adm-kpi-val">Google Indexed</div>
                    <div class="adm-kpi-bottom">
                        <span class="adm-kpi-delta up">Clean OpenGraph Metadata</span>
                    </div>
                </div>
            </div>

            <!-- Module Specific Interactive Content -->
            <div class="adm-card">
                <div class="adm-card-head" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 class="adm-card-title"><span>Static &amp; Policy Content Pages</span></h3>
                    <button type="button" class="dt-btn dt-btn-gold" style="font-weight:800; font-size:12px; height:32px; padding:0 14px;" onclick="window.publishAllCmsPages(this)">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#111827" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Publish All Changes</span>
                    </button>
                </div>
                <div class="adm-table-responsive">
                    <table class="adm-table">
                        <thead>
                            <tr>
                                <th>Page Title</th>
                                <th>URL Slug</th>
                                <th>Policy Category</th>
                                <th>Last Modified</th>
                                <th>Status</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($cmsPages as $p): ?>
                                <tr>
                                    <td><strong><?= htmlspecialchars($p['title']) ?></strong></td>
                                    <td><code style="font-size:11.5px; background:#FAF5E8; padding:2px 6px; border-radius:4px; color:#8A681F; font-weight:700; border:1px solid #D4AF37;"><?= htmlspecialchars($p['slug']) ?></code></td>
                                    <td><span class="adm-badge gold"><?= htmlspecialchars($p['type']) ?></span></td>
                                    <td><small style="color:#7A7266;"><?= htmlspecialchars($p['last_modified']) ?></small></td>
                                    <td><span class="adm-badge success"><?= htmlspecialchars($p['status']) ?></span></td>
                                    <td>
                                        <div style="display:flex; gap:6px;">
                                            <a href="<?= htmlspecialchars($p['slug']) ?>" target="_blank" class="dt-btn dt-btn-pale" style="height:26px; padding:0 8px; font-size:11px; text-decoration:none;">View</a>
                                            <button type="button" class="dt-btn dt-btn-pale" style="height:26px; padding:0 8px; font-size:11px;"
                                                data-slug="<?= htmlspecialchars($p['slug'], ENT_QUOTES, 'UTF-8') ?>"
                                                data-title="<?= htmlspecialchars($p['title'], ENT_QUOTES, 'UTF-8') ?>"
                                                data-content="<?= htmlspecialchars((string)($p['content'] ?? ''), ENT_QUOTES, 'UTF-8') ?>"
                                                data-status="<?= htmlspecialchars(strtolower((string)($p['status'] ?? 'published')), ENT_QUOTES, 'UTF-8') ?>"
                                                onclick="window.openCmsPageModal(this)">Edit</button>
                                        </div>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            </div>
        </main>
        <?php include_once __DIR__ . '/../includes/adminfooter.php'; ?>
    </div>
</div>
<div id="cmsPageEditorModal" style="display:none; position:fixed; inset:0; background:rgba(17,24,39,0.55); z-index:99999; align-items:center; justify-content:center; padding:16px;">
    <div style="background:#fff; border-radius:12px; max-width:560px; width:100%; border:1.5px solid #D4AF37; overflow:hidden; box-shadow:0 24px 50px rgba(0,0,0,0.3);">
        <div style="padding:14px 18px; background:#181512; color:#D4AF37; display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:14px;">Edit CMS Page</strong>
            <button type="button" onclick="document.getElementById('cmsPageEditorModal').style.display='none'" style="background:none;border:none;color:#FAF5E8;font-size:20px;cursor:pointer;">&times;</button>
        </div>
        <form onsubmit="return window.saveCmsPageModal(event)" style="padding:18px; display:flex; flex-direction:column; gap:12px;">
            <input type="hidden" id="cmsEditSlug">
            <div>
                <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Page Title</label>
                <input type="text" id="cmsEditTitle" class="adm-form-input" required>
            </div>
            <div>
                <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Content Body</label>
                <textarea id="cmsEditContent" class="adm-form-textarea" rows="5"></textarea>
            </div>
            <div>
                <label style="font-size:12px; font-weight:700; display:block; margin-bottom:4px;">Status</label>
                <select id="cmsEditStatus" class="adm-form-select">
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                </select>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:6px;">
                <button type="button" class="dt-btn dt-btn-pale" onclick="document.getElementById('cmsPageEditorModal').style.display='none'">Cancel</button>
                <button type="submit" class="dt-btn dt-btn-gold">Save CMS Page</button>
            </div>
        </form>
    </div>
</div>
<script src="/admin/assets/js/admin.js?v=<?php echo time(); ?>"></script>
<script>
window.openCmsPageModal = function(btn) {
    document.getElementById('cmsEditSlug').value = btn.dataset.slug || '';
    document.getElementById('cmsEditTitle').value = btn.dataset.title || '';
    document.getElementById('cmsEditContent').value = btn.dataset.content || '';
    var st = (btn.dataset.status || 'published').toLowerCase();
    document.getElementById('cmsEditStatus').value = (st === 'draft' || st === 'archived') ? st : 'published';
    document.getElementById('cmsPageEditorModal').style.display = 'flex';
};
window.saveCmsPageModal = function(e) {
    if (e) e.preventDefault();
    fetch('/api/content.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'save_cms_page',
            slug: document.getElementById('cmsEditSlug').value,
            title: document.getElementById('cmsEditTitle').value.trim(),
            content: document.getElementById('cmsEditContent').value,
            status: document.getElementById('cmsEditStatus').value
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (!res || !res.success) {
            if (typeof window.showToast === 'function') window.showToast((res && res.message) || 'Failed to save CMS page.');
            return;
        }
        document.getElementById('cmsPageEditorModal').style.display = 'none';
        if (typeof window.showToast === 'function') window.showToast(res.message || 'CMS page saved.');
        setTimeout(function() { window.location.reload(); }, 500);
    })
    .catch(function() { if (typeof window.showToast === 'function') window.showToast('Network error saving CMS page.'); });
    return false;
};
window.publishAllCmsPages = function(btn) {
    if (btn) btn.disabled = true;
    fetch('/api/content.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'publish_all_cms' })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (btn) btn.disabled = false;
        if (typeof window.showToast === 'function') window.showToast((res && res.message) || 'Published all CMS pages.');
    })
    .catch(function() { if (btn) btn.disabled = false; if (typeof window.showToast === 'function') window.showToast('Network error publishing CMS pages.'); });
};
</script>
</body>
</html>
