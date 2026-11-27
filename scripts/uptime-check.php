<?php
/**
 * uptime-check.php — Production Uptime & Endpoint Readiness Health Sentinel
 * DT Brand's & Jai Hanuman Tex
 */

$endpoints = [
    'Homepage' => 'https://yourdomain.com/index.php',
    'Shop Catalog' => 'https://yourdomain.com/shop.php',
    'Single Saree' => 'https://yourdomain.com/product.php',
    'Admin Portal' => 'https://yourdomain.com/admin/login/',
    'Health Check' => 'https://yourdomain.com/health.php',
];

$failed = [];
echo "=== DT Brand's Production Uptime Sentinel ===\n";

foreach ($endpoints as $name => $url) {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status === 200) {
        echo " [OK 200] {$name} ({$url})\n";
    } else {
        echo " [FAIL {$status}] {$name} ({$url})\n";
        $failed[] = "{$name} (HTTP {$status})";
    }
}

if (!empty($failed)) {
    echo "ALERT: " . count($failed) . " endpoint(s) failed health verification!\n";
    exit(1);
} else {
    echo "SUCCESS: All endpoints responding healthy (100% Uptime).\n";
    exit(0);
}
