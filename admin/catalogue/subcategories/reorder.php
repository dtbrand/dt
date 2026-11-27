<?php
/* DT admin access guard (auto-inserted) */ $__dtg = $_SERVER['DOCUMENT_ROOT'] . '/admin/includes/adminguard.php'; if (is_file($__dtg)) require_once $__dtg;

/**
 * subcategories/reorder.php — Reorder Subcategories
 * DT Brand's & Jai Hanuman Tex
 */
$page_title = "Reorder Subcategories";
$active_nav = "catalogue";
$active_subnav = "subcategories";
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reorder Subcategories — DT Brand's Catalogue</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/admin/assets/css/admin.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="/admin/products/assets/css/wordpress-style.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="/admin/catalogue/assets/css/catalogue.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="/admin/catalogue/assets/css/hierarchy.css?v=<?php echo time(); ?>">
</head>
<body>
<div class="adm-layout">
    <?php include_once __DIR__ . '/../../includes/adminsidebar.php'; ?>
    <div class="adm-main">
        <?php include_once __DIR__ . '/../../includes/adminheader.php'; ?>
        <main class="adm-content" style="padding: 14px 18px; width: 100%; max-width: 100%; box-sizing: border-box;">
            
            <div class="wp-heading-wrap" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
                <div>
                    <h1 class="wp-heading-inline" style="font-size:20px; font-weight:800; color:#181512; margin:0;">Reorder Subcategories</h1>
                    <p style="font-size:12px; color:#64748b; margin:2px 0 0 0;">Move subcategories up or down within their parent categories.</p>
                </div>
                <button type="button" class="dt-btn-action-sm gold" onclick="window.dtSaveSubcategoryOrder()" style="height:30px; padding:0 14px; font-size:11.5px;">Save Order</button>
            </div>
            <script>
            window.dtSaveSubcategoryOrder = function() {
                var items = Array.from(document.querySelectorAll('.dt-tree-root > .dt-tree-node')).map(function(n, idx) {
                    return { id: Number(String(n.dataset.catId || idx + 1)), display_order: idx + 1 };
                });
                fetch('/api/categories.php', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'reorder', items: items })
                })
                .then(function(r) { return r.json(); })
                .then(function(res) { if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast((res && res.message) || 'Subcategory sort order saved!'); })
                .catch(function() { if (window.DT_CATALOGUE) window.DT_CATALOGUE.showToast('Network error saving order.'); });
            };
            </script>

            <?php include_once __DIR__ . '/../components/hierarchy-tree.php'; ?>

        </main>
        <?php include_once __DIR__ . '/../../includes/adminfooter.php'; ?>
    </div>
</div>

<script src="/admin/catalogue/assets/js/catalogue.js?v=<?php echo time(); ?>"></script>
<script src="/admin/catalogue/assets/js/hierarchy.js?v=<?php echo time(); ?>"></script>
</body>
</html>
