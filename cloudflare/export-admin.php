<?php
/**
 * Local helper script to export all real PHP admin panel pages into
 * `cloudflare/admin_pages/*.html` (and `_redirects.json`) using an in-memory SQLite DB.
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$adminRoot = $root . '/admin';
$outRoot = __DIR__ . '/admin_pages';

if (is_dir($outRoot)) {
    $cleanIt = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($outRoot, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($cleanIt as $item) {
        $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
    }
}
@mkdir($outRoot, 0775, true);

$it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($adminRoot));
$pages = [];
foreach ($it as $f) {
    if (!$f->isFile()) {
        continue;
    }
    $rel = str_replace('\\', '/', substr($f->getPathname(), strlen($adminRoot) + 1));
    if (
        !str_ends_with($rel, '.php') ||
        str_contains($rel, 'includes/') ||
        str_contains($rel, '/components/') ||
        str_starts_with($rel, '_') ||
        str_contains($rel, '/_') ||
        $rel === 'adminguard.php'
    ) {
        continue;
    }
    $pages[] = $rel;
}
sort($pages);

$workerScript = sys_get_temp_dir() . '/dt_export_admin_worker.php';
$workerCode = <<<'PHP'
<?php
$root = $argv[1];
$rel = $argv[2];

$pdo = new PDO('sqlite::memory:');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec(file_get_contents($root . '/cloudflare/schema.sql'));
$pdo->exec("
    CREATE TABLE IF NOT EXISTS product_brands (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT, tagline TEXT, description TEXT DEFAULT '', tier TEXT DEFAULT 'Primary Flagship', logo_url TEXT DEFAULT '', status TEXT DEFAULT 'active');
    INSERT OR IGNORE INTO product_brands (id, name, slug, tagline, status) VALUES (1, 'DT Brand''s', 'dt-brands', 'Direct Surat Handloom', 'active');
    CREATE TABLE IF NOT EXISTS product_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT, status TEXT DEFAULT 'active');
    INSERT OR IGNORE INTO product_categories (id, name, slug, status) VALUES (1, 'Kanjivaram Silk', 'kanjivaram-silk', 'active');
    CREATE TABLE IF NOT EXISTS product_attributes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, slug TEXT, type TEXT DEFAULT 'Text Badge / Pill', values_json TEXT DEFAULT '[]', status TEXT DEFAULT 'active');
    INSERT OR IGNORE INTO product_attributes (id, name, slug, type, values_json) VALUES (1, 'Fabric', 'fabric', 'Text Badge / Pill', '[{\"name\":\"Pure Mulberry Silk\",\"hex\":null}]');
    CREATE TABLE IF NOT EXISTS notification_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, recipient TEXT, template_key TEXT, subject TEXT, content TEXT, status TEXT DEFAULT 'sent', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS system_settings (key_name TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS courier_configs (id INTEGER PRIMARY KEY AUTOINCREMENT, carrier TEXT, status TEXT DEFAULT 'active');
    CREATE TABLE IF NOT EXISTS admin_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, ip_address TEXT, user_agent TEXT, last_activity TEXT);
    CREATE TABLE IF NOT EXISTS webhook_events (id INTEGER PRIMARY KEY AUTOINCREMENT, provider TEXT, event_type TEXT, status_code INTEGER DEFAULT 200, payload_json TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    INSERT OR IGNORE INTO customers (id, name, phone, email, password_hash, type, city, state, status) VALUES (1, 'Radhika Sarees Emporium', '9876543210', 'radhika@example.com', 'hash', 'wholesale', 'Surat', 'Gujarat', 'active');
    INSERT OR IGNORE INTO subcategories (id, category_id, name, slug, description, status) VALUES (1, 1, 'Bridal Korvai', 'bridal-korvai', 'Pure silk korvai weaves', 'active');
    INSERT OR IGNORE INTO curated_collections (id, title, slug, description, product_ids_json, status) VALUES (1, 'Bridal Silk Heritage', 'bridal-silk-heritage', 'Curated wedding collection', '[1,2,3]', 'active');
    INSERT OR IGNORE INTO product_variants (id, product_id, color_name, size_name, sku, stock_qty, retail_price, wholesale_price, reseller_price) VALUES (1, 1, 'Royal Blue', 'Free Size', 'KLN-SR-111-RB', 25, 4899, 1399, 2100);
    INSERT OR IGNORE INTO addresses (id, customer_id, recipient_name, phone, address_line1, city, state, pincode, is_default) VALUES (1, 1, 'Radhika Sarees Emporium', '9876543210', 'Ring Road Textile Market', 'Surat', 'Gujarat', '395002', 1);
");

require_once $root . '/src/Database.php';
DTBrand\Database::setPdo($pdo, false);
require_once $root . '/config/session.php';
if (function_exists('dt_session_start')) {
    @dt_session_start();
}

$isLogin = ($rel === 'login.php' || $rel === 'login/index.php');
$_SESSION['admin_logged_in'] = !$isLogin;
$_SESSION['admin_user'] = ['id' => 1, 'name' => 'DT Brand Admin', 'email' => 'admin@yourdomain.com', 'role' => 'super_admin'];

$_SERVER['DOCUMENT_ROOT'] = $root;
$_SERVER['HTTP_HOST'] = 'yourdomain.com';
$_SERVER['HTTPS'] = 'on';
$_SERVER['SERVER_PORT'] = '443';
$_SERVER['REQUEST_METHOD'] = 'GET';
$_SERVER['REQUEST_URI'] = '/admin/' . $rel;
$_SERVER['SCRIPT_NAME'] = '/admin/' . $rel;

$_GET = ['id' => '1', 'order_id' => '1', 'customer_id' => '1', 'category_id' => '1', 'variant_id' => '1', 'collection_id' => '1', 'banner_id' => '1', 'attribute_id' => '1', 'subcategory_id' => '1'];

ob_start();
chdir(dirname($root . '/admin/' . $rel));
include $root . '/admin/' . $rel;
$out = ob_get_clean();

$headers = headers_list();
$location = '';
foreach ($headers as $h) {
    if (stripos($h, 'Location:') === 0) {
        $location = trim(substr($h, 9));
    }
}

echo json_encode([
    'len' => strlen($out),
    'location' => $location,
    'html' => $out,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
PHP;
file_put_contents($workerScript, $workerCode);

$queue = $pages;
$pool = [];
$maxWorkers = 8;
$exported = 0;
$redirects = [];
$skipped = [];
$totalBytes = 0;

$spawn = function (string $rel) use ($workerScript, $root) {
    $cmd = 'php -d max_execution_time=8 ' . escapeshellarg($workerScript) . ' ' . escapeshellarg($root) . ' ' . escapeshellarg($rel);
    $desc = [0 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $proc = proc_open($cmd, $desc, $pipes);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);
    return ['rel' => $rel, 'proc' => $proc, 'pipes' => $pipes, 'out' => '', 'err' => ''];
};

while (!empty($queue) || !empty($pool)) {
    while (count($pool) < $maxWorkers && !empty($queue)) {
        $pool[] = $spawn(array_shift($queue));
    }
    usleep(20000);
    foreach ($pool as $i => &$item) {
        $item['out'] .= stream_get_contents($item['pipes'][1]);
        $item['err'] .= stream_get_contents($item['pipes'][2]);
        $status = proc_get_status($item['proc']);
        if (!$status['running']) {
            $item['out'] .= stream_get_contents($item['pipes'][1]);
            $item['err'] .= stream_get_contents($item['pipes'][2]);
            fclose($item['pipes'][1]);
            fclose($item['pipes'][2]);
            $rc = proc_close($item['proc']);
            $rel = $item['rel'];
            unset($pool[$i]);

            $payload = json_decode($item['out'], true);
            $html = is_array($payload) ? (string)($payload['html'] ?? '') : '';
            $loc = is_array($payload) ? (string)($payload['location'] ?? '') : '';

            if ($loc !== '' && strlen($html) < 400) {
                $redirects['/admin/' . $rel] = $loc;
                continue;
            }
            if (strlen($html) > 300 && str_contains($html, '<html')) {
                // Normalize dynamic timestamps in cache-busters so rebuilds stay deterministic
                $html = preg_replace('/(\.(?:css|js)\?v=)\d{8,}/i', '$1cf', $html);
                $targetRel = preg_replace('/\.php$/i', '.html', $rel);
                $dest = $outRoot . '/' . $targetRel;
                @mkdir(dirname($dest), 0775, true);
                file_put_contents($dest, $html);
                $exported++;
                $totalBytes += strlen($html);
            } else {
                $skipped[] = "$rel (rc=$rc len=" . strlen($html) . ' err=' . substr(trim($item['err']), 0, 120) . ')';
            }
        }
    }
    unset($item);
}

@unlink($workerScript);
file_put_contents($outRoot . '/_redirects.json', json_encode($redirects, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo "EXPORTED={$exported} REDIRECTS=" . count($redirects) . " SKIPPED=" . count($skipped) . " TOTAL_MB=" . round($totalBytes / 1048576, 2) . "\n";
foreach ($skipped as $s) {
    echo "SKIP: $s\n";
}
