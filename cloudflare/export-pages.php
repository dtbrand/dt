<?php
/**
 * Local helper script to export clean domain-agnostic HTML templates from the
 * PHP storefront pages into cloudflare/pages/*.html using an in-memory SQLite DB.
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$outDir = __DIR__ . '/pages';
if (!is_dir($outDir)) {
    mkdir($outDir, 0775, true);
}

$pages = [
    'index' => 'index.php',
    'shop' => 'shop.php',
    'wholesale' => 'wholesale.php',
    'reseller' => 'reseller.php',
    'retailer' => 'retailer.php',
    'cart' => 'cart.php',
    'checkout' => 'checkout.php',
    'wishlist' => 'wishlist.php',
    'account' => 'account.php',
    'track' => 'track.php',
    'about-us' => 'about-us.php',
    'contact' => 'contact.php',
    'privacy' => 'privacy.php',
    'shipping' => 'shipping.php',
    'terms' => 'terms.php',
];

function renderPage(string $root, string $phpFile, array $getParams = []): string
{
    $runner = <<<'PHP'
$root = $argv[1];
$phpFile = $argv[2];
$getParams = json_decode(base64_decode($argv[3] ?? ''), true) ?: [];

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec(file_get_contents($root . '/cloudflare/schema.sql'));
$pdo->exec("
    CREATE TABLE IF NOT EXISTS product_media (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, image_url TEXT NOT NULL, is_primary INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS product_colors (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, hex_code TEXT DEFAULT '#8A681F', swatch_image TEXT DEFAULT NULL, status TEXT DEFAULT 'active');
    CREATE TABLE IF NOT EXISTS product_sizes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sort_order INTEGER DEFAULT 1, status TEXT DEFAULT 'active');
    CREATE TABLE IF NOT EXISTS product_variants (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, color_id INTEGER DEFAULT NULL, color_name TEXT DEFAULT NULL, size_id INTEGER DEFAULT NULL, size_name TEXT DEFAULT NULL, sku TEXT DEFAULT '', stock_qty INTEGER DEFAULT 10, mrp REAL DEFAULT NULL, price REAL DEFAULT NULL, retail_price REAL DEFAULT NULL, wholesale_price REAL DEFAULT NULL, reseller_price REAL DEFAULT NULL, image TEXT DEFAULT NULL);
    CREATE TABLE IF NOT EXISTS banners (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, subtitle TEXT, tagline TEXT, badge TEXT, cta_text TEXT, cta_link TEXT, image_url TEXT, status TEXT DEFAULT 'active', display_order INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS announcements (id INTEGER PRIMARY KEY AUTOINCREMENT, message TEXT, link_url TEXT, bg_color TEXT, text_color TEXT, status TEXT DEFAULT 'active', display_order INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS seo_metadata (id INTEGER PRIMARY KEY AUTOINCREMENT, page_route TEXT UNIQUE, meta_title TEXT, meta_description TEXT, meta_keywords TEXT, og_title TEXT, og_description TEXT, canonical_url TEXT, og_image_url TEXT, og_image TEXT);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY AUTOINCREMENT, key_name TEXT UNIQUE, value TEXT DEFAULT '', value_text TEXT DEFAULT '', category TEXT DEFAULT 'general');
    CREATE TABLE IF NOT EXISTS subcategories (id INTEGER PRIMARY KEY AUTOINCREMENT, category_id INTEGER, name TEXT, slug TEXT, description TEXT, status TEXT DEFAULT 'active');
    CREATE TABLE IF NOT EXISTS payment_gateways (id INTEGER PRIMARY KEY AUTOINCREMENT, gateway_key TEXT UNIQUE, name TEXT, description TEXT, is_active INTEGER DEFAULT 1, is_test_mode INTEGER DEFAULT 0, is_recommended INTEGER DEFAULT 0, config_json TEXT DEFAULT '{}', sort_order INTEGER DEFAULT 0);
    INSERT OR IGNORE INTO payment_gateways (gateway_key, name, description, is_active, is_recommended, sort_order) VALUES
      ('upi_direct', 'Instant UPI & QR Pay', 'Pay instantly via GPay, PhonePe, Paytm or any UPI app', 1, 1, 1),
      ('cod', 'Cash on Delivery (COD)', 'Pay via Cash or UPI at doorstep', 1, 0, 2),
      ('whatsapp_pay', 'WhatsApp Order & Pay', 'Confirm your order directly with our Surat desk', 1, 0, 3);
");

require_once $root . '/src/Database.php';
DTBrand\Database::setPdo($pdo, false);

$_SERVER['HTTP_HOST'] = 'yourdomain.com';
$_SERVER['HTTPS'] = 'on';
$_SERVER['SERVER_PORT'] = '443';
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/' . $phpFile . (!empty($getParams) ? '?' . http_build_query($getParams) : '');
$_GET = $getParams;

ob_start();
include $root . '/' . $phpFile;
echo ob_get_clean();
PHP;

    $tmp = tempnam(sys_get_temp_dir(), 'dt_exp_');
    $outTmp = tempnam(sys_get_temp_dir(), 'dt_out_');
    $errTmp = tempnam(sys_get_temp_dir(), 'dt_err_');
    file_put_contents($tmp, "<?php\n" . $runner);
    $cmd = 'php ' . escapeshellarg($tmp) . ' ' . escapeshellarg($root) . ' ' . escapeshellarg($phpFile) . ' ' . escapeshellarg(base64_encode(json_encode($getParams)));
    $descriptors = [
        0 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'],
        1 => ['file', $outTmp, 'w'],
        2 => ['file', $errTmp, 'w'],
    ];
    $proc = proc_open($cmd, $descriptors, $pipes);
    $rc = proc_close($proc);
    $stdout = (string)@file_get_contents($outTmp);
    $stderr = (string)@file_get_contents($errTmp);
    @unlink($tmp);
    @unlink($outTmp);
    @unlink($errTmp);

    if (trim($stderr) !== '') {
        fwrite(STDERR, "[{$phpFile} stderr] " . trim($stderr) . "\n");
    }
    if ($rc !== 0 || strlen($stdout) < 500) {
        fwrite(STDERR, "Failed exporting {$phpFile} (rc={$rc}, len=" . strlen($stdout) . ")\n");
        exit(1);
    }
    return $stdout;
}

foreach ($pages as $slug => $phpFile) {
    $html = renderPage($root, $phpFile);
    file_put_contents($outDir . '/' . $slug . '.html', $html);
    printf("Exported %-18s (%d bytes)\n", $slug . '.html', strlen($html));
}

for ($id = 1; $id <= 8; $id++) {
    $html = renderPage($root, 'product.php', ['id' => (string)$id]);
    file_put_contents($outDir . '/product-' . $id . '.html', $html);
    printf("Exported %-18s (%d bytes)\n", 'product-' . $id . '.html', strlen($html));
}
