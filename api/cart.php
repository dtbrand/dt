<?php
/**
 * api/cart.php — Server-Side Cart Calculation & Lot Validation API
 * Master Specification V2: Section 44 (Cart Audit)
 * DT Brand's & Jai Hanuman Tex
 */

require_once __DIR__ . '/cors.php';
cors_json();

require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/ProductCatalog.php';
require_once __DIR__ . '/../src/PricingCalculator.php';
require_once __DIR__ . '/../src/DiscountEngine.php';
require_once __DIR__ . '/../src/CartManager.php';
require_once __DIR__ . '/../src/WishlistManager.php';
require_once __DIR__ . '/../src/Auth.php';

use DTBrand\ProductCatalog;
use DTBrand\PricingCalculator;
use DTBrand\DiscountEngine;
use DTBrand\CartManager;
use DTBrand\WishlistManager;
use DTBrand\Database;
use DTBrand\Auth;

try {
    $rawInput = file_get_contents('php://input');
    $jsonData = json_decode($rawInput, true);
    $data = is_array($jsonData) ? $jsonData : (!empty($_POST) ? $_POST : $_GET);
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = strtolower(trim((string)($data['action'] ?? ($_GET['action'] ?? ($method === 'GET' ? 'view' : 'recalculate')))));

    // Session-Authoritative Role Resolution (Section 14 & 33: Never trust client-submitted role)
    Auth::initSession();
    $sessionId = session_id();
    $currentUser = Auth::getCurrentUser() ?? ($_SESSION['user'] ?? null);
    $authUserId = !empty($currentUser['id']) ? (int)$currentUser['id'] : 0;
    $rawUserType = strtolower(trim((string)($data['user_type'] ?? '')));
    if (!empty($_SESSION['admin_logged_in'])) {
        $userType = in_array($rawUserType, ['wholesale', 'retailer', 'reseller', 'customer'], true) ? $rawUserType : 'wholesale';
    } elseif ($authUserId > 0) {
        $db = Database::getConnection();
        $verifiedType = 'customer';
        if ($db) {
            try {
                $uStmt = $db->prepare("SELECT type, status FROM customers WHERE id = ? LIMIT 1");
                $uStmt->execute([$authUserId]);
                $uRow = $uStmt->fetch(\PDO::FETCH_ASSOC);
                if ($uRow && ($uRow['status'] ?? '') === 'active') {
                    $verifiedType = strtolower(trim((string)$uRow['type']));
                }
            } catch (\Throwable $e) {}
        }
        if ($verifiedType === 'wholesaler') { $verifiedType = 'wholesale'; }
        if ($verifiedType === 'retail') { $verifiedType = 'customer'; }
        $userType = in_array($verifiedType, ['wholesale', 'retailer', 'reseller'], true) ? $verifiedType : 'customer';
    } else {
        $userType = 'guest';
    }

    // CSRF verification for mutating DB persistence actions
    $writeActions = ['sync', 'save', 'add', 'update', 'remove', 'clear', 'merge'];
    if ($method === 'POST' && in_array($action, $writeActions, true) && !empty($_SESSION['csrf_token'])) {
        $submittedCsrf = $data['csrf_token'] ?? ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
        if (!WishlistManager::validateCsrf($submittedCsrf)) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'Security Token Expired or Invalid. Please refresh the page and try again.'
            ], JSON_PRETTY_PRINT);
            exit;
        }
    }

    $couponCode = trim((string)($data['coupon'] ?? ($data['coupon_code'] ?? '')));
    $gstRate = isset($data['gst_rate']) ? (float)$data['gst_rate'] : 5.0;

    if ($action === 'view') {
        $items = CartManager::getStoredItems($authUserId, $sessionId);
    } elseif ($action === 'clear') {
        CartManager::clearCart($authUserId, $sessionId);
        $items = [];
    } elseif ($action === 'add' || $action === 'update') {
        $singleItem = is_array($data['item'] ?? null) ? $data['item'] : [
            'product_id' => (int)($data['product_id'] ?? ($data['id'] ?? 0)),
            'variant_id' => !empty($data['variant_id']) ? (int)$data['variant_id'] : null,
            'color'      => (string)($data['color'] ?? ''),
            'size'       => (string)($data['size'] ?? ''),
            'lot_type'   => (string)($data['lot_type'] ?? 'single'),
            'qty'        => (int)($data['qty'] ?? ($data['quantity'] ?? 1)),
        ];
        CartManager::addOrUpdateItem($authUserId, $sessionId, $singleItem, $action === 'add');
        $items = CartManager::getStoredItems($authUserId, $sessionId);
    } elseif ($action === 'remove') {
        $pid = (int)($data['product_id'] ?? ($data['id'] ?? 0));
        $vid = !empty($data['variant_id']) ? (int)$data['variant_id'] : null;
        CartManager::removeItem(
            $authUserId,
            $sessionId,
            $pid,
            $vid,
            (string)($data['color'] ?? ''),
            (string)($data['size'] ?? '')
        );
        $items = CartManager::getStoredItems($authUserId, $sessionId);
    } elseif ($action === 'merge') {
        $incomingItems = $data['items'] ?? ($data['cart'] ?? []);
        if (!is_array($incomingItems)) {
            $incomingItems = [];
        }
        if ($authUserId > 0) {
            CartManager::mergeGuestCartToCustomer($sessionId, $authUserId, $incomingItems);
        } elseif (!empty($incomingItems)) {
            $existingGuest = CartManager::getStoredItems(0, $sessionId);
            CartManager::saveCartItems(0, $sessionId, array_merge($existingGuest, $incomingItems));
        }
        $items = CartManager::getStoredItems($authUserId, $sessionId);
    } elseif ($action === 'sync' || $action === 'save') {
        $items = $data['items'] ?? ($data['cart'] ?? []);
        if (!is_array($items)) {
            $items = [];
        }
        CartManager::saveCartItems($authUserId, $sessionId, $items);
    } else {
        // Pure server-side recalculation (side-effect free)
        $items = $data['items'] ?? ($data['cart'] ?? []);
        if (!is_array($items)) {
            $items = [];
        }
    }

    // Call CartManager for authoritative recalculation
    $cartResult = CartManager::validateAndRecalculateCart($items, $userType, $couponCode, $gstRate);

    // If there are validation errors (e.g. MCQ violation, unauthorized Full Set, stale products)
    if (!$cartResult['success'] && !empty($cartResult['errors'])) {
        $hasRoleForbidden = false;
        foreach ($cartResult['errors'] as $err) {
            if (stripos($err, 'exclusively available to verified') !== false) {
                $hasRoleForbidden = true;
                break;
            }
        }

        http_response_code($hasRoleForbidden ? 403 : 400);
        echo json_encode([
            'success'               => false,
            'message'               => implode(' ', $cartResult['errors']),
            'errors'                => $cartResult['errors'],
            'warnings'              => $cartResult['warnings'],
            'user_type'             => $userType,
            'item_count'            => $cartResult['item_count'],
            'total_qty'             => $cartResult['total_physical_pieces'],
            'items'                 => $cartResult['items'],
            'cart'                  => $cartResult['cart'],
            'pricing'               => $cartResult['pricing'],
            'subtotal'              => $cartResult['subtotal'],
            'discount'              => $cartResult['discount'],
            'shipping'              => $cartResult['shipping'],
            'grand_total'           => $cartResult['grand_total'],
            'free_shipping'         => $cartResult['shipping_info']['is_free'],
            'free_shipping_threshold' => $cartResult['shipping_info']['free_at'],
            'shipping_rate'         => $cartResult['shipping_info']['standard_rate']
        ], JSON_PRETTY_PRINT);
        exit;
    }

    // Success response with full authoritative financial breakdown
    echo json_encode([
        'success'                 => true,
        'user_type'               => $userType,
        'item_count'              => $cartResult['item_count'],
        'total_qty'               => $cartResult['total_physical_pieces'],
        'items'                   => $cartResult['items'],
        'cart'                    => $cartResult['cart'],
        'pricing'                 => $cartResult['pricing'],
        'subtotal'                => $cartResult['subtotal'],
        'discount'                => $cartResult['discount'],
        'shipping'                => $cartResult['shipping'],
        'grand_total'             => $cartResult['grand_total'],
        'coupon_info'             => $cartResult['coupon_info'],
        'free_shipping'           => $cartResult['shipping_info']['is_free'],
        'free_shipping_threshold' => $cartResult['shipping_info']['free_at'],
        'shipping_rate'           => $cartResult['shipping_info']['standard_rate'],
        'warnings'                => $cartResult['warnings']
    ], JSON_PRETTY_PRINT);

} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
