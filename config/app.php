<?php
/**
 * config/app.php — Application Global Configuration
 * DT Brand's & Jai Hanuman Tex
 */

return [
    'name' => getenv('APP_NAME') ?: "DT Brand's (Jai Hanuman Tex)",
    'env' => getenv('APP_ENV') ?: 'production',
    'debug' => (bool)(getenv('APP_DEBUG') ?: false),
    'url' => getenv('APP_URL') ?: (!empty($_SERVER['HTTP_HOST']) ? (((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https://' : 'http://') . $_SERVER['HTTP_HOST']) : 'https://yourdomain.com'),
    'timezone' => 'Asia/Kolkata',
    'locale' => 'en_IN',
    'currency' => 'INR',
    'currency_symbol' => '₹',
    'version' => '1.0.0'
];
