<?php
/* DT admin access guard (auto-inserted) */ $__dtg = $_SERVER['DOCUMENT_ROOT'] . '/admin/includes/adminguard.php'; if (is_file($__dtg)) require_once $__dtg;

/**
 * banner-manager.php — Category & Collection Banner Manager Component
 * DT Brand's & Jai Hanuman Tex
 */
require_once __DIR__ . '/../../../src/Database.php';
use DTBrand\Database;

$bannersList = [];
try {
    $bannersList = Database::query("SELECT id, title, subtitle, placement, cta_text, cta_link, image, image_mobile, status, display_order FROM banners ORDER BY display_order ASC, id ASC");
} catch (\Throwable $e) {
    $bannersList = [];
}
?>
<div class="dt-cat-card">
    <div class="dt-cat-card-header">
        <h3 class="dt-cat-card-title">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8A681F" stroke-width="2.2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            <span>Hero &amp; Storefront Banners (<?= count($bannersList) ?> Live Rows)</span>
        </h3>
        <div style="display:flex; gap:6px; align-items:center;">
            <a href="/admin/catalogue/banners/reorder.php" class="dt-btn-action-sm pale-gold" style="height:28px; padding:0 10px; font-size:11px; text-decoration:none;">Reorder Banners</a>
            <a href="/admin/catalogue/banners/add.php" class="dt-btn-action-sm gold" style="height:28px; padding:0 12px; font-size:11px; text-decoration:none;">+ Add Banner</a>
        </div>
    </div>

    <div style="padding:16px;">
        <div class="dt-banner-grid" id="dtBannerGridList">
            <?php if (empty($bannersList)): ?>
                <p style="color:#64748b; font-size:12.5px;">No banners found in database yet. Click <strong>+ Add Banner</strong> to publish one live.</p>
            <?php else: ?>
                <?php foreach ($bannersList as $b): ?>
                    <?php
                    $bid = (int)$b['id'];
                    $bTitle = (string)($b['title'] ?? 'Untitled Banner');
                    $bImg = !empty($b['image']) ? (string)$b['image'] : '/assets/images/no-image.svg';
                    $bLink = (string)($b['cta_link'] ?? '/shop');
                    $bSlot = (string)($b['placement'] ?? 'hero');
                    $bOrd = (int)($b['display_order'] ?? 1);
                    $isActive = strtolower((string)($b['status'] ?? 'active')) === 'active';
                    ?>
                    <div class="dt-banner-card" data-banner-id="<?= $bid ?>">
                        <div class="dt-banner-preview-box">
                            <img src="<?= htmlspecialchars($bImg, ENT_QUOTES, 'UTF-8') ?>" class="dt-banner-preview" alt="<?= htmlspecialchars($bTitle, ENT_QUOTES, 'UTF-8') ?>" onerror="this.src='/assets/images/no-image.svg';">
                        </div>
                        <div class="dt-banner-content">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong style="font-size:13px; color:#181512;"><?= htmlspecialchars($bTitle, ENT_QUOTES, 'UTF-8') ?></strong>
                                <span class="dt-badge <?= $isActive ? 'green' : 'red' ?>" style="cursor:pointer;" onclick="window.dtToggleBannerStatus(this, <?= $bid ?>)"><?= $isActive ? 'Active' : 'Inactive' ?></span>
                            </div>
                            <div class="dt-size-badge-wrap">
                                <span class="dt-size-pill desktop">Desktop Hero</span>
                                <span class="dt-size-pill mobile">Mobile Fit</span>
                            </div>
                            <div style="font-size:11px; color:#64748b; margin:2px 0;">Target: <code><?= htmlspecialchars($bLink, ENT_QUOTES, 'UTF-8') ?></code></div>
                            <div class="dt-banner-meta">
                                <span>Slot: <?= htmlspecialchars($bSlot, ENT_QUOTES, 'UTF-8') ?></span>
                                <span style="color:#15803D; font-weight:700;">Priority #<?= $bOrd ?></span>
                            </div>
                            <div style="display:flex; gap:6px; margin-top:10px;">
                                <a href="/admin/catalogue/banners/edit.php?id=<?= $bid ?>" class="dt-btn-action-sm pale-gold" style="flex:1; height:26px; font-size:11px; justify-content:center; text-decoration:none;">
                                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>Edit Banner</span>
                                </a>
                                <button type="button" class="dt-btn-action-sm danger" onclick="window.dtDeleteBannerCard(this, <?= $bid ?>, '<?= htmlspecialchars(addslashes($bTitle), ENT_QUOTES, 'UTF-8') ?>')" style="height:26px; padding:0 8px; font-size:11px;">
                                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>
</div>
<script>
window.dtToggleBannerStatus = function(badgeEl, bannerId) {
    fetch('/api/content.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle_banner', id: Number(bannerId) })
    })
    .then(function(r) { return r.json(); })
    .then(function(res) {
        if (!res || !res.success) {
            if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast((res && res.message) || 'Failed to update banner.');
            return;
        }
        var isLive = res.status === 'active';
        badgeEl.className = 'dt-badge ' + (isLive ? 'green' : 'red');
        badgeEl.textContent = isLive ? 'Active' : 'Inactive';
        if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast(res.message || 'Banner status saved.');
    })
    .catch(function() { if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast('Network error updating banner.'); });
};
window.dtDeleteBannerCard = function(btn, bannerId, title) {
    var doDel = function() {
        fetch('/api/content.php', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete_banner', id: Number(bannerId) })
        })
        .then(function(r) { return r.json(); })
        .then(function(res) {
            if (!res || !res.success) {
                if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast((res && res.message) || 'Failed to delete banner.');
                return;
            }
            var card = btn.closest('.dt-banner-card');
            if (card) card.remove();
            if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast(res.message || 'Banner deleted from database!');
        })
        .catch(function() { if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast('Network error deleting banner.'); });
    };
    if (window.DT_CATALOGUE && typeof window.DT_CATALOGUE._confirm === 'function') {
        window.DT_CATALOGUE._confirm('Delete banner "' + title + '" permanently from database?', doDel);
    } else {
        doDel();
    }
};
</script>
