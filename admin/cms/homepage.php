<?php
/* DT admin access guard (auto-inserted) */ $__dtg = $_SERVER['DOCUMENT_ROOT'] . '/admin/includes/adminguard.php'; if (is_file($__dtg)) require_once $__dtg;

/**
 * homepage.php - DT Brand's Admin Homepage Layout & Section Manager
 * DT Brand's & Jai Hanuman Tex
 */
$page_title = "Homepage Layout & Section Manager";
$active_nav = "cms";

require_once __DIR__ . '/../../src/Database.php';
use DTBrand\Database;

$sections = [];
try {
    $sections = Database::query("SELECT id, section_key, title, subtitle, section_type, display_order, is_active FROM homepage_sections ORDER BY display_order ASC, id ASC");
} catch (\Throwable $e) {
    $sections = [];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Homepage Layout & Section Manager - DT Brand's Admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
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
                        <span>Homepage Layout & Section Manager</span>
                        <span class="adm-badge gold">Page Builder</span>
                    </h1>
                    <p class="adm-page-subtitle">Arrange featured collections, trending reels, and customer testimonials.</p>
                </div>
                <div class="adm-page-actions">
                    <a href="/admin/cms/" class="dt-btn dt-btn-pale" style="display:inline-flex; align-items:center; gap:5px; text-decoration:none; height:32px; padding:0 12px; font-size:12px; font-weight:700;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        <span>Back to CMS Suite</span>
                    </a>
                    <a href="/admin" class="dt-btn dt-btn-pale" style="text-decoration:none; height:32px; padding:0 12px; font-size:12px; font-weight:700;">Main Console</a>
                </div>
            </div>

            <!-- Page Specific Content -->
            
        <div class="adm-card">
            <div class="adm-card-head">
                <h3 class="adm-card-title" style="display:inline-flex; align-items:center; gap:8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                    <span>Homepage Sections Manager (<?= count($sections) ?> Live Rows)</span>
                </h3>
                <button type="button" id="saveHomepageLayoutBtn" class="dt-btn dt-btn-gold" style="display:inline-flex; align-items:center; gap:6px; height:34px; padding:0 14px; font-size:12.5px; font-weight:800;" onclick="window.saveHomepageLayout(this)">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.8"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Save Layout</span>
                </button>
            </div>
            <div style="padding:14px 16px;" id="hpSectionsList">
                <?php if (empty($sections)): ?>
                    <p style="color:#64748B; font-size:0.85rem;">No homepage sections found in `homepage_sections` table.</p>
                <?php else: ?>
                    <?php foreach ($sections as $idx => $sec): ?>
                        <div class="hp-sec-row" data-id="<?= (int)$sec['id'] ?>" style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 12px; border:1px solid #EAE5D9; border-radius:8px; margin-bottom:8px; background:#fff;">
                            <div style="display:flex; align-items:center; gap:10px; min-width:0;">
                                <span class="hp-order-num adm-badge gold" style="min-width:26px; text-align:center;">#<?= $idx + 1 ?></span>
                                <div style="min-width:0;">
                                    <strong style="font-size:0.86rem; color:#181512; display:block;"><?= htmlspecialchars((string)$sec['title'], ENT_QUOTES, 'UTF-8') ?></strong>
                                    <small style="color:#78716C; font-size:0.74rem;"><?= htmlspecialchars((string)($sec['subtitle'] ?: $sec['section_key']), ENT_QUOTES, 'UTF-8') ?> (<code><?= htmlspecialchars((string)$sec['section_key'], ENT_QUOTES, 'UTF-8') ?></code>)</small>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                                <label style="display:inline-flex; align-items:center; gap:5px; font-size:0.76rem; font-weight:700; cursor:pointer;">
                                    <input type="checkbox" class="hp-active-chk" <?= !empty($sec['is_active']) ? 'checked' : '' ?>>
                                    <span>Visible</span>
                                </label>
                                <button type="button" class="dt-btn dt-btn-pale" style="height:26px; padding:0 8px; font-size:11px;" onclick="window.moveHpSection(this, -1)" title="Move Up">Up</button>
                                <button type="button" class="dt-btn dt-btn-pale" style="height:26px; padding:0 8px; font-size:11px;" onclick="window.moveHpSection(this, 1)" title="Move Down">Down</button>
                            </div>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>
        
        </main>
        <?php include_once __DIR__ . '/../includes/adminfooter.php'; ?>
    </div>
</div>
<script src="/admin/assets/js/admin.js?v=<?php echo time(); ?>"></script>
<script>
window.refreshHpOrders = function() {
    document.querySelectorAll('#hpSectionsList .hp-sec-row').forEach(function(row, idx) {
        var badge = row.querySelector('.hp-order-num');
        if (badge) badge.textContent = '#' + (idx + 1);
    });
};
window.moveHpSection = function(btn, dir) {
    var row = btn.closest('.hp-sec-row');
    var list = document.getElementById('hpSectionsList');
    if (!row || !list) return;
    if (dir < 0 && row.previousElementSibling) {
        list.insertBefore(row, row.previousElementSibling);
    } else if (dir > 0 && row.nextElementSibling) {
        list.insertBefore(row.nextElementSibling, row);
    }
    window.refreshHpOrders();
};
window.saveHomepageLayout = function(btn) {
    var rows = Array.from(document.querySelectorAll('#hpSectionsList .hp-sec-row'));
    var sections = rows.map(function(row, idx) {
        var chk = row.querySelector('.hp-active-chk');
        return {
            id: Number(row.dataset.id),
            display_order: idx + 1,
            is_active: chk && chk.checked ? 1 : 0
        };
    });
    if (btn) btn.disabled = true;
    fetch('/api/content.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reorder_sections', sections: sections })
    })
    .then(function(r) { return r.json().catch(function(){return {};}).then(function(d){ return { ok: r.ok, d: d }; }); })
    .then(function(res) {
        if (btn) btn.disabled = false;
        if (!res.ok || !res.d || !res.d.success) {
            if (typeof window.showToast === 'function') window.showToast((res.d && res.d.message) || 'Failed to save layout.');
            return;
        }
        if (typeof window.showToast === 'function') window.showToast(res.d.message || 'Homepage layout saved to MariaDB!');
    })
    .catch(function() {
        if (btn) btn.disabled = false;
        if (typeof window.showToast === 'function') window.showToast('Network error saving layout.');
    });
};
</script>
</body>
</html>
