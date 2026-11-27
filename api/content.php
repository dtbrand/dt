<?php
/**
 * api/content.php — Storefront Dynamic Content & Marketing Hydration API
 * DT Brand's & Jai Hanuman Tex
 * 
 * Central public REST endpoint powering dynamic storefront rendering:
 * - Homepage layout & sections
 * - Hero sliders & promotional banners
 * - Announcements marquee
 * - Curated collections & pinned product lists
 * - SEO metadata & OpenGraph tags
 * - Reseller / WhatsApp share templates with placeholder resolution
 * - Social channels & official WhatsApp concierge
 */

declare(strict_types=1);

require_once __DIR__ . '/cors.php';
cors_preflight();
cors_headers();

if (!headers_sent()) {
    header('Content-Type: application/json; charset=UTF-8');
}

require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/ContentManager.php';
require_once __DIR__ . '/../src/ProductCatalog.php';
require_once __DIR__ . '/_guard.php';

use DTBrand\ContentManager;
use DTBrand\Database;
use DTBrand\ProductCatalog;

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$rawInput = $method === 'GET' ? '' : (string)file_get_contents('php://input');
$jsonBody = $rawInput !== '' ? (json_decode($rawInput, true) ?: []) : [];
$postData = array_merge($_POST, is_array($jsonBody) ? $jsonBody : []);
$action = trim((string)($postData['action'] ?? ($_GET['action'] ?? 'homepage')));

if ($method === 'POST' || $method === 'PUT' || $method === 'DELETE') {
    dt_api_require_admin('manage storefront content and merchandising');
    $pdo = Database::getConnection();
    if ($pdo === null || Database::isMockMode()) {
        http_response_code(503);
        echo json_encode(['success' => false, 'message' => 'Database unavailable — content changes require live MariaDB.']);
        exit;
    }

    try {
        switch ($action) {
            case 'save_banner':
                $bid = (int)($postData['id'] ?? 0);
                $title = trim((string)($postData['title'] ?? ''));
                if ($title === '') {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Banner title is required.']);
                    exit;
                }
                $subtitle = trim((string)($postData['subtitle'] ?? ''));
                $ctaText = trim((string)($postData['cta_text'] ?? ($postData['cta'] ?? 'Explore')));
                $ctaLink = trim((string)($postData['cta_link'] ?? ($postData['link'] ?? '/shop')));
                $placement = trim((string)($postData['placement'] ?? ($postData['slot'] ?? 'hero')));
                $deskImg = trim((string)($postData['image'] ?? ($postData['desk_img'] ?? '/assets/images/product1.png')));
                $mobImg = trim((string)($postData['image_mobile'] ?? ($postData['mobile_img'] ?? $deskImg)));
                $priority = max(1, (int)($postData['display_order'] ?? ($postData['priority'] ?? 1)));
                $rawStatus = strtolower(trim((string)($postData['status'] ?? 'active')));
                $status = (strpos($rawStatus, 'inactive') !== false || strpos($rawStatus, 'draft') !== false || strpos($rawStatus, 'hidden') !== false) ? 'inactive' : 'active';

                if ($bid > 0) {
                    $st = $pdo->prepare("UPDATE banners SET title=?, subtitle=?, cta_text=?, cta_link=?, cta_url=?, placement=?, image=?, image_url=?, image_mobile=?, display_order=?, status=?, updated_at=NOW() WHERE id=?");
                    $st->execute([$title, $subtitle, $ctaText, $ctaLink, $ctaLink, $placement, $deskImg, $deskImg, $mobImg, $priority, $status, $bid]);
                } else {
                    $st = $pdo->prepare("INSERT INTO banners (banner_type, placement, title, subtitle, cta_text, cta_link, cta_url, image, image_url, image_mobile, status, display_order, created_at, updated_at) VALUES ('hero', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
                    $st->execute([$placement, $title, $subtitle, $ctaText, $ctaLink, $ctaLink, $deskImg, $deskImg, $mobImg, $status, $priority]);
                    $bid = (int)$pdo->lastInsertId();
                }
                echo json_encode(['success' => true, 'id' => $bid, 'message' => 'Banner saved live to MariaDB.']);
                exit;

            case 'toggle_banner':
                $bid = (int)($postData['id'] ?? 0);
                if ($bid <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Valid banner ID required.']);
                    exit;
                }
                $cur = $pdo->prepare("SELECT status FROM banners WHERE id = ? LIMIT 1");
                $cur->execute([$bid]);
                $row = $cur->fetch(\PDO::FETCH_ASSOC);
                if (!$row) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'message' => 'Banner not found.']);
                    exit;
                }
                $next = $row['status'] === 'active' ? 'inactive' : 'active';
                $pdo->prepare("UPDATE banners SET status = ?, updated_at = NOW() WHERE id = ?")->execute([$next, $bid]);
                echo json_encode(['success' => true, 'id' => $bid, 'status' => $next, 'message' => 'Banner status set to ' . $next . '.']);
                exit;

            case 'delete_banner':
                $bid = (int)($postData['id'] ?? 0);
                if ($bid <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Valid banner ID required.']);
                    exit;
                }
                $pdo->prepare("DELETE FROM banners WHERE id = ?")->execute([$bid]);
                echo json_encode(['success' => true, 'id' => $bid, 'message' => 'Banner deleted from database.']);
                exit;

            case 'reorder_banners':
                $orderIds = $postData['order'] ?? [];
                if (is_string($orderIds)) { $orderIds = json_decode($orderIds, true) ?: []; }
                foreach (array_values((array)$orderIds) as $idx => $idVal) {
                    $pdo->prepare("UPDATE banners SET display_order = ?, updated_at = NOW() WHERE id = ?")->execute([$idx + 1, (int)$idVal]);
                }
                echo json_encode(['success' => true, 'message' => 'Banner sequence updated in database.']);
                exit;

            case 'toggle_section':
                $sid = (int)($postData['id'] ?? 0);
                if ($sid <= 0) {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'Valid section ID required.']);
                    exit;
                }
                $isActive = !empty($postData['is_active']) ? 1 : 0;
                $pdo->prepare("UPDATE homepage_sections SET is_active = ?, updated_at = NOW() WHERE id = ?")->execute([$isActive, $sid]);
                echo json_encode(['success' => true, 'id' => $sid, 'is_active' => $isActive, 'message' => 'Homepage section updated live.']);
                exit;

            case 'reorder_sections':
                $sections = $postData['sections'] ?? [];
                if (is_string($sections)) { $sections = json_decode($sections, true) ?: []; }
                $pdo->beginTransaction();
                foreach ((array)$sections as $idx => $sec) {
                    $sid = (int)($sec['id'] ?? 0);
                    if ($sid <= 0) continue;
                    $active = !empty($sec['is_active']) ? 1 : 0;
                    $ord = (int)($sec['display_order'] ?? ($idx + 1));
                    $pdo->prepare("UPDATE homepage_sections SET display_order = ?, is_active = ?, updated_at = NOW() WHERE id = ?")->execute([$ord, $active, $sid]);
                }
                $pdo->commit();
                echo json_encode(['success' => true, 'message' => 'Homepage layout sequence saved to MariaDB.']);
                exit;

            case 'save_seo':
                $route = trim((string)($postData['page_route'] ?? ($postData['slug'] ?? '/')));
                $title = trim((string)($postData['meta_title'] ?? ''));
                $desc = trim((string)($postData['meta_description'] ?? ''));
                $kw = trim((string)($postData['meta_keywords'] ?? ''));
                if ($route === '') { $route = '/'; }
                $ex = $pdo->prepare("SELECT id FROM seo_metadata WHERE page_route = ? LIMIT 1");
                $ex->execute([$route]);
                $rowId = $ex->fetchColumn();
                if ($rowId) {
                    $pdo->prepare("UPDATE seo_metadata SET meta_title=?, meta_description=?, meta_keywords=?, og_title=?, og_description=?, updated_at=NOW() WHERE id=?")
                        ->execute([$title, $desc, $kw, $title, $desc, (int)$rowId]);
                } else {
                    $pdo->prepare("INSERT INTO seo_metadata (page_route, meta_title, meta_description, meta_keywords, og_title, og_description, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW())")
                        ->execute([$route, $title, $desc, $kw, $title, $desc]);
                }
                echo json_encode(['success' => true, 'page_route' => $route, 'message' => 'SEO metadata saved to database.']);
                exit;

            case 'save_menu':
                $items = $postData['items'] ?? [];
                if (is_string($items)) { $items = json_decode($items, true) ?: []; }
                $jsonVal = json_encode(array_values((array)$items), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $pdo->prepare("INSERT INTO settings (`key_name`, `value`) VALUES ('store_navigation_menu', ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute([$jsonVal]);
                echo json_encode(['success' => true, 'count' => count((array)$items), 'message' => 'Navigation menu saved live to database.']);
                exit;

            case 'save_merchandising':
                $catKey = preg_replace('/[^a-z0-9_-]/i', '_', (string)($postData['category'] ?? 'default'));
                $items = $postData['items'] ?? [];
                $jsonVal = json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                $settingKey = 'merchandising_order_' . strtolower($catKey);
                $pdo->prepare("INSERT INTO settings (`key_name`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)")->execute([$settingKey, $jsonVal]);
                echo json_encode(['success' => true, 'message' => 'Merchandising positions & pins saved to MariaDB.']);
                exit;

            case 'save_cms_page':
                $slug = trim((string)($postData['slug'] ?? ''));
                $title = trim((string)($postData['title'] ?? ''));
                $content = (string)($postData['content'] ?? '');
                $status = in_array(strtolower((string)($postData['status'] ?? 'published')), ['draft', 'published', 'archived'], true)
                    ? strtolower((string)$postData['status']) : 'published';
                if ($slug === '' || $title === '') {
                    http_response_code(400);
                    echo json_encode(['success' => false, 'message' => 'CMS slug and title are required.']);
                    exit;
                }
                $ex = $pdo->prepare("SELECT id FROM cms_pages WHERE slug = ? LIMIT 1");
                $ex->execute([$slug]);
                $cid = $ex->fetchColumn();
                if ($cid) {
                    $pdo->prepare("UPDATE cms_pages SET title=?, content=?, status=?, updated_at=NOW() WHERE id=?")->execute([$title, $content, $status, (int)$cid]);
                } else {
                    $pdo->prepare("INSERT INTO cms_pages (slug, title, content, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())")->execute([$slug, $title, $content, $status]);
                }
                echo json_encode(['success' => true, 'slug' => $slug, 'message' => 'CMS page "' . $title . '" saved live.']);
                exit;

            case 'publish_all_cms':
                $pdo->exec("UPDATE cms_pages SET status = 'published', updated_at = NOW()");
                echo json_encode(['success' => true, 'message' => 'All CMS pages synchronized and published live.']);
                exit;

            default:
                http_response_code(400);
                echo json_encode(['success' => false, 'message' => 'Unsupported content write action: ' . $action]);
                exit;
        }
    } catch (\Throwable $e) {
        if ($pdo->inTransaction()) { $pdo->rollBack(); }
        http_response_code(500);
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        exit;
    }
}

try {
    switch ($action) {
        case 'homepage':
            $sections = ContentManager::getHomepageSections(true);
            $banners = ContentManager::getBanners(true, 'hero');
            $promoBanners = ContentManager::getBanners(true, 'promo_strip');
            $announcements = ContentManager::getAnnouncements(true, 'topbar');
            $collections = ContentManager::getCuratedCollections(true);
            $featuredProducts = ContentManager::getCuratedProducts('featured', true);
            $bestSellers = ContentManager::getCuratedProducts('bestseller', true);
            $newArrivals = ContentManager::getCuratedProducts('new_arrival', true);
            $seo = ContentManager::getSeoMetadata('/');
            $socials = ContentManager::getSocialChannels(true);

            echo json_encode([
                'success' => true,
                'data' => [
                    'sections' => $sections,
                    'hero_banners' => $banners,
                    'promo_banners' => $promoBanners,
                    'announcements' => $announcements,
                    'collections' => $collections,
                    'curated_products' => [
                        'featured' => $featuredProducts,
                        'bestseller' => $bestSellers,
                        'new_arrival' => $newArrivals,
                    ],
                    'seo' => $seo,
                    'social_channels' => $socials,
                ],
                'timestamp' => time()
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'banners':
            $placement = isset($_GET['placement']) && $_GET['placement'] !== '' ? (string)$_GET['placement'] : null;
            $banners = ContentManager::getBanners(true, $placement);
            echo json_encode([
                'success' => true,
                'placement' => $placement ?? 'all',
                'count' => count($banners),
                'banners' => $banners
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'sliders':
            $sliders = ContentManager::getHeroSliders(true);
            echo json_encode([
                'success' => true,
                'count' => count($sliders),
                'sliders' => $sliders
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'sections':
            $sections = ContentManager::getHomepageSections(true);
            echo json_encode([
                'success' => true,
                'count' => count($sections),
                'sections' => $sections
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'collections':
            $slug = trim((string)($_GET['slug'] ?? ''));
            if ($slug !== '') {
                $collection = ContentManager::getCuratedCollectionBySlug($slug);
                if (!$collection) {
                    http_response_code(404);
                    echo json_encode(['success' => false, 'error' => 'Collection not found'], JSON_UNESCAPED_SLASHES);
                    exit;
                }
                echo json_encode(['success' => true, 'collection' => $collection], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            } else {
                $collections = ContentManager::getCuratedCollections(true);
                echo json_encode([
                    'success' => true,
                    'count' => count($collections),
                    'collections' => $collections
                ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            }
            break;

        case 'curated_products':
            $listType = trim((string)($_GET['type'] ?? 'featured'));
            $products = ContentManager::getCuratedProducts($listType, true);
            echo json_encode([
                'success' => true,
                'type' => $listType,
                'count' => count($products),
                'products' => $products
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'announcements':
            $placement = trim((string)($_GET['placement'] ?? 'topbar'));
            $announcements = ContentManager::getAnnouncements(true, $placement);
            echo json_encode([
                'success' => true,
                'placement' => $placement,
                'count' => count($announcements),
                'announcements' => $announcements
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'seo':
            $pageRoute = trim((string)($_GET['route'] ?? '/'));
            $seo = ContentManager::getSeoMetadata($pageRoute);
            echo json_encode([
                'success' => true,
                'route' => $pageRoute,
                'seo' => $seo
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'share_template':
            $templateKey = trim((string)($_GET['key'] ?? 'reseller_product_card'));
            $template = ContentManager::getShareTemplateByKey($templateKey);
            if (!$template) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => 'Share template not found'], JSON_UNESCAPED_SLASHES);
                exit;
            }

            // Optional placeholder replacements
            $vars = [
                'product_title' => (string)($_GET['product_title'] ?? 'Banarasi Silk Saree'),
                'mrp' => (string)($_GET['mrp'] ?? '3499'),
                'reseller_price' => (string)($_GET['reseller_price'] ?? '1899'),
                'reseller_margin' => (string)($_GET['reseller_margin'] ?? '1600'),
                'shop_url' => (string)($_GET['shop_url'] ?? 'https://jaihanumantex.in/shop'),
                'order_link' => (string)($_GET['order_link'] ?? 'https://jaihanumantex.in/shop?ref=reseller'),
                'phone' => (string)($_GET['phone'] ?? '+91 70463 63528'),
            ];

            $rendered = ContentManager::renderShareTemplate($template['content_body'] ?? '', $vars);

            echo json_encode([
                'success' => true,
                'template' => $template,
                'rendered' => $rendered,
                'whatsapp_url' => 'https://api.whatsapp.com/send?text=' . rawurlencode($rendered)
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        case 'social_links':
            $socials = ContentManager::getSocialChannels(true);
            echo json_encode([
                'success' => true,
                'count' => count($socials),
                'channels' => $socials
            ], JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
            break;

        default:
            http_response_code(400);
            echo json_encode([
                'success' => false,
                'error' => 'Invalid action parameter',
                'supported_actions' => [
                    'homepage', 'banners', 'sliders', 'sections',
                    'collections', 'curated_products', 'announcements',
                    'seo', 'share_template', 'social_links'
                ]
            ], JSON_UNESCAPED_SLASHES);
            break;
    }
} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Server error: ' . $e->getMessage()
    ], JSON_UNESCAPED_SLASHES);
}
