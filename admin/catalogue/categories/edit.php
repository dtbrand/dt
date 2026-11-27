<?php
/* DT admin access guard (auto-inserted) */ $__dtg = $_SERVER['DOCUMENT_ROOT'] . '/admin/includes/adminguard.php'; if (is_file($__dtg)) require_once $__dtg;

/**
 * categories/edit.php — Edit Category Page
 * DT Brand's & Jai Hanuman Tex
 */
$page_title = "Edit Category";
$active_nav = "catalogue";
$active_subnav = "categories";

require_once __DIR__ . '/../../../src/Database.php';
use DTBrand\Database;

$cat_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$dbRow = $cat_id > 0 ? Database::fetchOne('SELECT * FROM categories WHERE id = ? LIMIT 1', [$cat_id]) : null;
$category_data = [
    'id' => $dbRow ? (int)$dbRow['id'] : $cat_id,
    'name' => $dbRow ? (string)$dbRow['name'] : '',
    'slug' => $dbRow ? (string)$dbRow['slug'] : '',
    'parent' => '',
    'desc' => $dbRow ? (string)($dbRow['description'] ?? '') : '',
    'short_desc' => '',
    'image' => $dbRow && !empty($dbRow['image']) ? (string)$dbRow['image'] : '/assets/images/no-image.svg',
    'banner' => $dbRow && !empty($dbRow['banner_image']) ? (string)$dbRow['banner_image'] : '/assets/images/no-image.svg',
    'display_style' => 'banner_grid',
    'active' => (!$dbRow || ($dbRow['status'] ?? 'active') === 'active') ? 1 : 0,
    'featured' => 1,
    'show_menu' => 1,
    'show_home' => 1,
    'show_search' => 1,
    'show_filters' => 1
];
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Edit Category: <?php echo htmlspecialchars($category_data['name']); ?> — DT Brand's</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/admin/assets/css/admin.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="/admin/products/assets/css/wordpress-style.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="/admin/catalogue/assets/css/catalogue.css?v=<?php echo time(); ?>">
    <link rel="stylesheet" href="/admin/catalogue/assets/css/categories.css?v=<?php echo time(); ?>">
</head>
<body>
<div class="adm-layout">
    <?php include_once __DIR__ . '/../../includes/adminsidebar.php'; ?>
    <div class="adm-main">
        <?php include_once __DIR__ . '/../../includes/adminheader.php'; ?>
        <main class="adm-content" style="padding: 14px 18px; width: 100%; max-width: 100%; box-sizing: border-box;">
            
            <div class="wp-heading-wrap" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin-bottom:14px;">
                <div>
                    <h1 class="wp-heading-inline" style="font-size:20px; font-weight:800; color:#181512; margin:0;">Edit Category: <?php echo htmlspecialchars($category_data['name']); ?></h1>
                    <p style="font-size:12px; color:#64748b; margin:2px 0 0 0;">Update category metadata, banner imagery, and storefront merchandising rules.</p>
                </div>
                <a href="/admin/catalogue/categories/view.php?id=<?php echo $cat_id; ?>" class="dt-btn-action-sm pale-gold" style="height:30px; padding:0 12px; font-size:11.5px;">View Live Page</a>
            </div>

            <?php include_once __DIR__ . '/../components/category-form.php'; ?>

        </main>
        <?php include_once __DIR__ . '/../../includes/adminfooter.php'; ?>
    </div>
</div>

<script src="/admin/catalogue/assets/js/catalogue.js?v=<?php echo time(); ?>"></script>
<script src="/admin/catalogue/assets/js/categories.js?v=<?php echo time(); ?>"></script>
</body>
</html>
