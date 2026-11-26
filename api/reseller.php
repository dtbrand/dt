<?php
/**
 * api/reseller.php — Reseller Margin Sharing, CRM Customer Management & Database API
 * DT Brand's & Jai Hanuman Tex — Live Production Standard
 */

require_once __DIR__ . '/cors.php';
cors_json();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../src/Database.php';
require_once __DIR__ . '/../src/Auth.php';
require_once __DIR__ . '/../src/CustomerManager.php';
require_once __DIR__ . '/../src/OrderManager.php';
require_once __DIR__ . '/../src/ProductCatalog.php';
require_once __DIR__ . '/../src/PricingCalculator.php';
require_once __DIR__ . '/_guard.php';
require_once __DIR__ . '/_b2b_helpers.php';

use DTBrand\Database;
use DTBrand\Auth;
use DTBrand\CustomerManager;
use DTBrand\OrderManager;
use DTBrand\ProductCatalog;
use DTBrand\PricingCalculator;

try {
    Auth::initSession();
    $pdo = Database::getConnection();
    $rawInput = file_get_contents('php://input');
    $jsonData = json_decode($rawInput, true) ?: [];
    $data = !empty($jsonData) ? $jsonData : $_REQUEST;

    $action = $data['action'] ?? ($_GET['action'] ?? 'get_dashboard');
    $currentUser = Auth::getCurrentUser();
    $allowedPortalRoles = ['reseller'];

    // ── 1. GET RESELLER DASHBOARD & REAL DATABASE ORDERS (GET/POST) ──
    if ($action === 'get_dashboard') {
        $isAdmin = dt_api_is_admin();
        $authUserId = (int)($currentUser['id'] ?? 0);
        if (!$isAdmin && $authUserId > 0) {
            $roleUser = dt_api_require_role($allowedPortalRoles, 'access the Reseller B2B dashboard');
            $authUserId = (int)($roleUser['id'] ?? $authUserId);
        }
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($_GET['user_id'] ?? $authUserId)) : $authUserId;
        $cust = null;
        $orders = [];
        $crmContacts = [];
        $wallet = dt_b2b_get_wallet(null, 0);
        $kpis = [
            'total_orders' => 0,
            'lifetime_spend' => 0.0,
            'total_earnings' => 0.0,
            'pending_orders' => 0,
            'tier' => 'Verified Reseller Partner',
            'commission_rate' => 15.0
        ];

        if ($isAdmin && $userId <= 0 && $pdo !== null && !Database::isMockMode()) {
            $phoneInput = trim((string)($data['phone'] ?? ($_GET['phone'] ?? '')));
            if (!empty($phoneInput)) {
                $digits = preg_replace('/\D+/', '', $phoneInput);
                if (strlen($digits) >= 10) {
                    $pStmt = $pdo->prepare("SELECT id FROM customers WHERE phone LIKE ? AND type = 'reseller' LIMIT 1");
                    $pStmt->execute(['%' . substr($digits, -10)]);
                    $pRow = $pStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($pRow && !empty($pRow['id'])) {
                        $userId = (int)$pRow['id'];
                    }
                }
            }
        }

        if ($userId > 0 && $pdo !== null && !Database::isMockMode()) {
            try {
                $stmt = $pdo->prepare("SELECT id, name, business_name, phone, email, type, city, state, tier, gstin, gst_verified, pan, commission_rate, kyc_status, created_at FROM customers WHERE id = ? LIMIT 1");
                $stmt->execute([$userId]);
                $cust = $stmt->fetch(\PDO::FETCH_ASSOC);

                if ($cust) {
                    $orders = OrderManager::getByCustomerOrPhone($userId, $cust['phone'] ?? '');
                    $wallet = dt_b2b_get_wallet($pdo, $userId);

                    $crmStmt = $pdo->prepare("SELECT id, name, phone AS mobile, phone AS whatsapp, email, city, state, pincode, address, notes, next_followup_at, status, created_at, updated_at FROM reseller_customers WHERE reseller_id = ? ORDER BY updated_at DESC, id DESC LIMIT 200");
                    $crmStmt->execute([$userId]);
                    $crmContacts = $crmStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
                    foreach ($crmContacts as &$cc) {
                        $cc['id'] = (int)$cc['id'];
                        $decodedNotes = json_decode((string)($cc['notes'] ?? ''), true);
                        if (is_array($decodedNotes)) {
                            $cc['notes'] = $decodedNotes['notes'] ?? [];
                            $cc['followups'] = $decodedNotes['followups'] ?? [];
                            $cc['tags'] = $decodedNotes['tags'] ?? ['Regular'];
                        } else {
                            $cc['notes'] = !empty($cc['notes']) ? [['id' => 1, 'text' => (string)$cc['notes'], 'date' => $cc['created_at'] ?? '']] : [];
                            $cc['followups'] = !empty($cc['next_followup_at']) ? [['id' => 1, 'date' => substr((string)$cc['next_followup_at'], 0, 10), 'time' => '11:00', 'note' => 'Scheduled Follow-Up', 'status' => 'Pending']] : [];
                            $cc['tags'] = ['Regular'];
                        }
                    }
                    unset($cc);

                    $spend = 0.0;
                    $pending = 0;
                    $commRate = (float)($cust['commission_rate'] ?? 15.0);
                    if ($commRate <= 0) $commRate = 15.0;

                    foreach ($orders as &$ro) {
                        $amt = (float)($ro['total_amount'] ?? 0);
                        $spend += $amt;
                        $ro['channel'] = 'reseller';
                        $ro['estimated_margin'] = round($amt * ($commRate / 100), 2);
                        $st = strtolower((string)($ro['status'] ?? ''));
                        if (in_array($st, ['pending', 'processing', 'unfulfilled', 'in_transit', 'dispatched', 'shipped'], true)) {
                            $pending++;
                        }
                    }
                    unset($ro);

                    $kpis['total_orders'] = count($orders);
                    $kpis['lifetime_spend'] = round($spend, 2);
                    $kpis['total_earnings'] = round($spend * ($commRate / 100), 2);
                    $kpis['pending_orders'] = $pending;
                    $kpis['tier'] = !empty($cust['tier']) ? $cust['tier'] : 'Verified Reseller Partner';
                    $kpis['commission_rate'] = $commRate;
                }
            } catch (\Throwable $e) {
                error_log('Reseller get_dashboard error: ' . $e->getMessage());
            }
        }

        echo json_encode([
            'success' => true,
            'is_logged_in' => ($cust !== null),
            'user' => $cust,
            'kpis' => $kpis,
            'orders' => $orders,
            'wallet' => $wallet,
            'crm_customers' => $crmContacts
        ]);
        exit;
    }

    // ── 1B. GET RESELLER ORDERS (GET/POST) ──
    if ($action === 'get_orders') {
        $isAdmin = dt_api_is_admin();
        $authUserId = (int)($currentUser['id'] ?? 0);
        if (!$isAdmin && $authUserId <= 0) {
            echo json_encode([
                'success' => true,
                'count' => 0,
                'orders' => []
            ]);
            exit;
        }
        $roleUser = dt_api_require_role($allowedPortalRoles, 'view Reseller orders');
        $authUserId = $isAdmin ? $authUserId : (int)($roleUser['id'] ?? $authUserId);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($_GET['user_id'] ?? $authUserId)) : $authUserId;
        $userPhone = $isAdmin ? (string)($data['phone'] ?? ($_GET['phone'] ?? ($currentUser['phone'] ?? ''))) : (string)($roleUser['phone'] ?? '');

        $orders = OrderManager::getByCustomerOrPhone($userId, $userPhone);
        $commRate = (float)($roleUser['commission_rate'] ?? 15.0);
        if ($commRate <= 0) $commRate = 15.0;
        foreach ($orders as &$ro) {
            $amt = (float)($ro['total_amount'] ?? 0);
            $ro['channel'] = 'reseller';
            $ro['estimated_margin'] = round($amt * ($commRate / 100), 2);
        }
        unset($ro);
        echo json_encode([
            'success' => true,
            'count' => count($orders),
            'orders' => $orders
        ]);
        exit;
    }

    // ── 1C. GET SINGLE ORDER DETAILS WITH LINE ITEMS & TIMELINE (GET/POST) ──
    if ($action === 'get_order_details' || $action === 'track_order') {
        $orderId = trim($data['order_id'] ?? ($data['id'] ?? ($_GET['id'] ?? ($_GET['order_id'] ?? ($_GET['order_number'] ?? '')))));
        if (empty($orderId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Order ID or order number is required']);
            exit;
        }

        $order = OrderManager::getOrderDetails($orderId);
        if (!$order) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Order not found']);
            exit;
        }

        $isAdmin = dt_api_is_admin();
        $inputPhone = trim((string)($data['phone'] ?? ($_GET['phone'] ?? '')));
        if (!dt_b2b_authorize_order_view($action, $orderId, $order, $currentUser, $isAdmin, $inputPhone)) {
            http_response_code(403);
            echo json_encode(['success' => false, 'error' => 'Access denied. Order details are restricted to the verified order owner.']);
            exit;
        }

        echo json_encode([
            'success' => true,
            'order' => $order
        ]);
        exit;
    }

    // ── 2. CALCULATE MARGIN & GENERATE SMART SHARE LINK (GET/POST) ──
    if ($action === 'calculate' || $action === 'calculate_margin') {
        $productId = (int)($data['product_id'] ?? ($_GET['product_id'] ?? 0));
        $marginPercent = max(5, min(50, (float)($data['margin_percent'] ?? ($_GET['margin_percent'] ?? 15.0))));

        if ($productId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'message' => 'Product ID is required']);
            exit;
        }

        $product = ProductCatalog::getById($productId);
        if (!$product) {
            http_response_code(404);
            echo json_encode(['success' => false, 'message' => 'Product not found']);
            exit;
        }

        if (($product['selling_type'] ?? 'single_piece') === 'full_set' || !empty($product['is_full_set'])) {
            http_response_code(403);
            echo json_encode([
                'success' => false,
                'message' => 'Full Set products are exclusive to Wholesale & Retail trade channels. Reseller partners can only calculate margins and share single piece catalog.'
            ]);
            exit;
        }

        $resellerBase = (float)($product['effective_reseller_price'] ?? ($product['reseller_price'] ?? 0));
        if ($resellerBase <= 0) {
            $resellerBase = (float)($product['retail_price'] ?? 0);
        }

        $marginAmount = round($resellerBase * ($marginPercent / 100), 2);
        $finalSellingPrice = $resellerBase + $marginAmount;
        $userName = $currentUser['name'] ?? 'Reseller Partner';

        $siteHost = !empty($_SERVER['HTTP_HOST']) ? (($_SERVER['HTTPS'] ?? 'off') !== 'off' ? 'https://' : 'http://') . $_SERVER['HTTP_HOST'] : (getenv('APP_URL') ?: 'https://jaihanumantex.in');
        $shareUrl = rtrim($siteHost, '/') . "/product.php?id={$product['id']}&ref=reseller_" . ($currentUser['id'] ?? 'vip');

        echo json_encode([
            'success' => true,
            'product' => [
                'id' => $product['id'],
                'name' => $product['name'] ?? ($product['title'] ?? ''),
                'reseller_base_price' => $resellerBase,
                'margin_percent' => $marginPercent,
                'reseller_profit' => $marginAmount,
                'final_customer_price' => $finalSellingPrice,
                'smart_share_url' => $shareUrl,
                'whatsapp_share_text' => "🌟 *Exclusive Pure Silk Handloom Collection* 🌟\n\n🛍️ *Product:* " . ($product['name'] ?? 'Silk Saree') . "\n✨ *Fabric:* " . ($product['fabric'] ?? 'Pure Silk') . "\n💰 *Special Boutique Price:* ₹" . number_format($finalSellingPrice) . " / pc (Free Delivery)\n\n📦 *Order Directly via WhatsApp:*\nhttps://wa.me/917046363528?text=" . urlencode("Hello, I want to order " . ($product['name'] ?? 'product') . " at Rs " . $finalSellingPrice . " via Reseller Partner.") . "\n\n— {$userName} (DT Brand's Verified Partner)"
            ]
        ]);
        exit;
    }

    // ── 3. UPDATE PROFILE & PASSWORD (POST) ──
    if ($action === 'update_profile') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'update Reseller profile');
        dt_api_require_csrf(null, $data);
        $isAdmin = !empty($roleUser['is_admin']);
        $authUserId = (int)($roleUser['id'] ?? 0);
        $userId = $isAdmin ? (int)($data['user_id'] ?? $authUserId) : $authUserId;
        if ($userId <= 0) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Please sign in to update profile']);
            exit;
        }

        $name = trim((string)($data['name'] ?? ($data['company_name'] ?? '')));
        $phone = trim((string)($data['phone'] ?? ''));
        $email = trim((string)($data['email'] ?? ''));
        $city = trim((string)($data['city'] ?? ''));
        $state = trim((string)($data['state'] ?? ''));
        $gstin = strtoupper(trim((string)($data['gstin'] ?? '')));
        $pan = strtoupper(trim((string)($data['pan'] ?? '')));

        if (empty($name) && (!empty($gstin) || isset($data['company_name']))) {
            $name = trim((string)($data['company_name'] ?? ($currentUser['name'] ?? '')));
        }

        if (empty($name)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Full Name / Enterprise Name is required']);
            exit;
        }

        $res = Auth::updateProfile($userId, [
            'name' => $name,
            'phone' => $phone,
            'email' => $email,
            'city' => $city,
            'state' => $state,
            'gstin' => $gstin,
            'pan' => $pan
        ]);

        if (!$res['success']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => $res['message']]);
            exit;
        }

        $newPass = trim((string)($data['new_password'] ?? ''));
        $curPass = trim((string)($data['current_password'] ?? ''));
        if (!empty($newPass)) {
            $pRes = Auth::changePassword($userId, $curPass, $newPass);
            if (!$pRes['success']) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => $pRes['message']]);
                exit;
            }
        }

        $freshUser = CustomerManager::getById($userId);

        echo json_encode([
            'success' => true,
            'message' => 'Reseller partner profile updated successfully in live database',
            'user' => $freshUser
        ]);
        exit;
    }

    // ── 3B. UPDATE GST & TAX PROFILE (POST) ──
    if ($action === 'update_gst' || $action === 'save_tax_profile') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'update Reseller tax profile');
        dt_api_require_csrf(null, $data);
        $isAdmin = !empty($roleUser['is_admin']);
        $authUserId = (int)($roleUser['id'] ?? 0);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($data['customer_id'] ?? $authUserId)) : $authUserId;
        if ($userId <= 0) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Please sign in to update GST details']);
            exit;
        }

        $compName = trim((string)($data['company_name'] ?? ($data['name'] ?? '')));
        $gstin = strtoupper(preg_replace('/\s+/', '', (string)($data['gstin'] ?? ($data['gst_number'] ?? ''))));
        $pan = strtoupper(preg_replace('/\s+/', '', (string)($data['pan'] ?? '')));

        if (!empty($gstin) && !preg_match('/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/', $gstin)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Invalid GSTIN format (e.g. 24AAAAA0000A1Z5)']);
            exit;
        }

        $updateData = ['gstin' => $gstin, 'pan' => $pan];
        if (!empty($compName)) {
            $updateData['name'] = $compName;
        }

        $res = Auth::updateProfile($userId, $updateData);
        if (!$res['success']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => $res['message']]);
            exit;
        }

        $freshUser = CustomerManager::getById($userId);

        echo json_encode([
            'success' => true,
            'message' => 'GST & Business Tax credentials verified and updated',
            'gstin' => $gstin,
            'pan' => $pan,
            'company_name' => $compName,
            'user' => $freshUser
        ]);
        exit;
    }

    // ── 3C. SAVE ADDRESS BOOK (POST) ──
    if ($action === 'save_address') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'save Reseller address');
        dt_api_require_csrf(null, $data);
        $isAdmin = !empty($roleUser['is_admin']);
        $authUserId = (int)($roleUser['id'] ?? 0);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($data['customer_id'] ?? $authUserId)) : $authUserId;

        if ($userId <= 0) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Please sign in to save address']);
            exit;
        }

        $res = Auth::saveAddress($userId, $data);
        if (!$res['success']) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => $res['message']]);
            exit;
        }

        $freshUser = CustomerManager::getById($userId);
        $addresses = Auth::getCustomerAddresses($userId);

        echo json_encode([
            'success' => true,
            'message' => 'Address book updated successfully in live database!',
            'address' => $res['address'] ?? null,
            'addresses' => $addresses,
            'user' => $freshUser
        ]);
        exit;
    }

    // ── 3C-1. SET DEFAULT SHIPPING DESTINATION (POST) ──
    if ($action === 'set_default_shipping' || $action === 'set_default_address') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'update default shipping address');
        dt_api_require_csrf(null, $data);
        $isAdmin = !empty($roleUser['is_admin']);
        $authUserId = (int)($roleUser['id'] ?? 0);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($data['customer_id'] ?? $authUserId)) : $authUserId;
        $addressId = (int)($data['id'] ?? ($data['address_id'] ?? 0));
        if ($userId <= 0 || $addressId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Valid user and address ID required']);
            exit;
        }
        if ($pdo !== null) {
            $pdo->prepare("UPDATE addresses SET is_default = 0 WHERE customer_id = ? AND address_type != 'billing'")->execute([$userId]);
            $pdo->prepare("UPDATE addresses SET is_default = 1 WHERE id = ? AND customer_id = ?")->execute([$addressId, $userId]);
        }
        $addresses = Auth::getCustomerAddresses($userId);
        echo json_encode(['success' => true, 'message' => 'Default shipping address updated successfully!', 'addresses' => $addresses]);
        exit;
    }

    // ── 3C-2. DELETE ADDRESS (POST) ──
    if ($action === 'delete_address' || $action === 'delete') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'delete Reseller address');
        dt_api_require_csrf(null, $data);
        $isAdmin = !empty($roleUser['is_admin']);
        $authUserId = (int)($roleUser['id'] ?? 0);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($data['customer_id'] ?? $authUserId)) : $authUserId;
        $addressId = (int)($data['id'] ?? ($data['address_id'] ?? 0));
        if ($userId <= 0 || $addressId <= 0) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Valid user and address ID required']);
            exit;
        }
        if ($pdo !== null) {
            $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM addresses WHERE customer_id = ?");
            $cntStmt->execute([$userId]);
            $total = (int)$cntStmt->fetchColumn();
            if ($total <= 1) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => 'Cannot delete the only saved address. At least one registered address is required.']);
                exit;
            }

            $pdo->prepare("DELETE FROM addresses WHERE id = ? AND customer_id = ? AND address_type != 'billing'")->execute([$addressId, $userId]);

            $defCheck = $pdo->prepare("SELECT id FROM addresses WHERE customer_id = ? AND is_default = 1 AND address_type != 'billing' LIMIT 1");
            $defCheck->execute([$userId]);
            if (!$defCheck->fetchColumn()) {
                $promoteStmt = $pdo->prepare("UPDATE addresses SET is_default = 1 WHERE customer_id = ? AND address_type != 'billing' ORDER BY id DESC LIMIT 1");
                $promoteStmt->execute([$userId]);
            }
        }
        $addresses = Auth::getCustomerAddresses($userId);
        echo json_encode(['success' => true, 'message' => 'Address deleted successfully!', 'addresses' => $addresses]);
        exit;
    }

    // ── 3C-3. GET ADDRESSES (GET/POST) ──
    if ($action === 'get_addresses') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'view Reseller addresses');
        $isAdmin = !empty($roleUser['is_admin']);
        $authUserId = (int)($roleUser['id'] ?? 0);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($_GET['user_id'] ?? $authUserId)) : $authUserId;
        if ($isAdmin && $userId <= 0 && $pdo !== null && !Database::isMockMode()) {
            $phoneInput = trim((string)($data['phone'] ?? ($_GET['phone'] ?? '')));
            if (!empty($phoneInput)) {
                $digits = preg_replace('/\D+/', '', $phoneInput);
                if (strlen($digits) >= 10) {
                    $pStmt = $pdo->prepare("SELECT id FROM customers WHERE phone LIKE ? AND type = 'reseller' LIMIT 1");
                    $pStmt->execute(['%' . substr($digits, -10)]);
                    $pRow = $pStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($pRow && !empty($pRow['id'])) $userId = (int)$pRow['id'];
                }
            }
        }
        if ($userId <= 0) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Please sign in to view addresses']);
            exit;
        }
        $addresses = Auth::getCustomerAddresses($userId);
        echo json_encode(['success' => true, 'addresses' => $addresses]);
        exit;
    }

    // ── 3D. GET FRESH PROFILE DATA (GET/POST) ──
    if ($action === 'get_profile') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'view Reseller profile');
        $isAdmin = !empty($roleUser['is_admin']);
        $authUserId = (int)($roleUser['id'] ?? 0);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($_GET['user_id'] ?? $authUserId)) : $authUserId;
        if ($isAdmin && $userId <= 0 && $pdo !== null && !Database::isMockMode()) {
            $phoneInput = trim((string)($data['phone'] ?? ($_GET['phone'] ?? '')));
            if (!empty($phoneInput)) {
                $digits = preg_replace('/\D+/', '', $phoneInput);
                if (strlen($digits) >= 10) {
                    $pStmt = $pdo->prepare("SELECT id FROM customers WHERE phone LIKE ? AND type = 'reseller' LIMIT 1");
                    $pStmt->execute(['%' . substr($digits, -10)]);
                    $pRow = $pStmt->fetch(\PDO::FETCH_ASSOC);
                    if ($pRow && !empty($pRow['id'])) $userId = (int)$pRow['id'];
                }
            }
        }
        if ($userId <= 0) {
            http_response_code(401);
            echo json_encode(['success' => false, 'error' => 'Please sign in to view profile']);
            exit;
        }

        $freshUser = CustomerManager::getById($userId);
        $addresses = Auth::getCustomerAddresses($userId);

        echo json_encode([
            'success' => true,
            'user' => $freshUser,
            'addresses' => $addresses
        ]);
        exit;
    }

    // ── 4. RESELLER END-BUYER CRM CRUD (BACKED BY reseller_customers TABLE) ──
    if ($action === 'get_crm_customers') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'view Reseller CRM customers');
        $isAdmin = !empty($roleUser['is_admin']);
        $userId = $isAdmin ? (int)($data['user_id'] ?? ($_GET['user_id'] ?? 0)) : (int)($roleUser['id'] ?? 0);
        $rows = [];
        if ($userId > 0 && $pdo !== null && !Database::isMockMode()) {
            $stmt = $pdo->prepare("SELECT id, name, phone AS mobile, phone AS whatsapp, email, city, state, pincode, address, notes, next_followup_at, status, created_at, updated_at FROM reseller_customers WHERE reseller_id = ? ORDER BY updated_at DESC, id DESC LIMIT 200");
            $stmt->execute([$userId]);
            $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            foreach ($rows as &$r) {
                $r['id'] = (int)$r['id'];
                $decoded = json_decode((string)($r['notes'] ?? ''), true);
                $r['notes'] = is_array($decoded) ? ($decoded['notes'] ?? []) : [];
                $r['followups'] = is_array($decoded) ? ($decoded['followups'] ?? []) : [];
                $r['tags'] = is_array($decoded) ? ($decoded['tags'] ?? ['Regular']) : ['Regular'];
            }
            unset($r);
        }
        echo json_encode(['success' => true, 'customers' => $rows]);
        exit;
    }

    if ($action === 'save_crm_customer') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'save Reseller CRM customer');
        dt_api_require_csrf(null, $data);
        $userId = (int)($roleUser['id'] ?? 0);
        if ($userId <= 0 || $pdo === null || Database::isMockMode()) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Authenticated reseller session required']);
            exit;
        }
        $custId = (int)($data['id'] ?? 0);
        $cName = trim((string)($data['name'] ?? ''));
        $cPhone = trim((string)($data['whatsapp'] ?? ($data['phone'] ?? ($data['mobile'] ?? ''))));
        if ($cName === '' || $cPhone === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Customer name and phone/WhatsApp are required']);
            exit;
        }
        $metaPayload = json_encode([
            'tags'      => is_array($data['tags'] ?? null) ? $data['tags'] : ['Regular'],
            'notes'     => is_array($data['notes'] ?? null) ? $data['notes'] : [],
            'followups' => is_array($data['followups'] ?? null) ? $data['followups'] : []
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $nextFollow = null;
        if (!empty($data['followups']) && is_array($data['followups'])) {
            foreach ($data['followups'] as $fu) {
                if (strtolower((string)($fu['status'] ?? '')) !== 'completed' && !empty($fu['date'])) {
                    $nextFollow = trim((string)$fu['date']) . ' ' . (trim((string)($fu['time'] ?? '11:00')) . ':00');
                    break;
                }
            }
        }

        if ($custId > 0) {
            $upd = $pdo->prepare("
                UPDATE reseller_customers
                SET name = ?, phone = ?, email = ?, city = ?, state = ?, pincode = ?, address = ?, notes = ?, next_followup_at = ?
                WHERE id = ? AND reseller_id = ?
            ");
            $upd->execute([
                $cName, $cPhone,
                trim((string)($data['email'] ?? '')) ?: null,
                trim((string)($data['city'] ?? '')),
                trim((string)($data['state'] ?? '')),
                trim((string)($data['pincode'] ?? '')),
                trim((string)($data['address'] ?? '')),
                $metaPayload, $nextFollow, $custId, $userId
            ]);
        } else {
            $ins = $pdo->prepare("
                INSERT INTO reseller_customers (reseller_id, name, phone, email, city, state, pincode, address, notes, next_followup_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $ins->execute([
                $userId, $cName, $cPhone,
                trim((string)($data['email'] ?? '')) ?: null,
                trim((string)($data['city'] ?? '')),
                trim((string)($data['state'] ?? '')),
                trim((string)($data['pincode'] ?? '')),
                trim((string)($data['address'] ?? '')),
                $metaPayload, $nextFollow
            ]);
            $custId = (int)$pdo->lastInsertId();
        }
        echo json_encode(['success' => true, 'id' => $custId, 'message' => 'CRM customer synced to database.']);
        exit;
    }

    if ($action === 'delete_crm_customer') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'delete Reseller CRM customer');
        dt_api_require_csrf(null, $data);
        $userId = (int)($roleUser['id'] ?? 0);
        $custId = (int)($data['id'] ?? 0);
        if ($userId <= 0 || $custId <= 0 || $pdo === null) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Valid CRM customer ID required']);
            exit;
        }
        $pdo->prepare("DELETE FROM reseller_customers WHERE id = ? AND reseller_id = ?")->execute([$custId, $userId]);
        echo json_encode(['success' => true, 'message' => 'Customer removed from CRM']);
        exit;
    }

    // ── 5. RESELLER WALLET LEDGER ──
    if ($action === 'get_wallet') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'view Reseller wallet');
        $userId = (int)($roleUser['id'] ?? 0);
        echo json_encode(['success' => true, 'wallet' => dt_b2b_get_wallet($pdo, $userId)]);
        exit;
    }

    if ($action === 'wallet_topup_request' || $action === 'wallet_withdraw_request') {
        $roleUser = dt_api_require_role($allowedPortalRoles, 'manage Reseller wallet');
        dt_api_require_csrf(null, $data);
        $userId = (int)($roleUser['id'] ?? 0);
        if ($userId <= 0 || $pdo === null || Database::isMockMode()) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Wallet unavailable']);
            exit;
        }
        $amount = (float)($data['amount'] ?? 0);
        $kind = ($action === 'wallet_withdraw_request') ? 'withdraw' : 'topup';
        $note = trim((string)($data['note'] ?? ($kind === 'topup' ? 'Reseller wallet top-up request' : 'Reseller margin payout request')));
        $wRes = dt_b2b_submit_wallet_request($pdo, $userId, $kind, $amount, $note);
        if (empty($wRes['success'])) {
            http_response_code(400);
            echo json_encode($wRes);
            exit;
        }
        echo json_encode(['success' => true, 'message' => 'Wallet request recorded in live ledger.', 'wallet' => $wRes['wallet']]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid reseller action specified']);
    exit;

} catch (\Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Reseller API error: ' . $e->getMessage()]);
    exit;
}
