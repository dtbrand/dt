<?php
/**
 * api/webhooks/delhivery.php — Delhivery Logistics Push Tracking Webhook
 * DT Brand's & Jai Hanuman Tex
 */

if (!headers_sent()) {
    header('Content-Type: application/json; charset=utf-8');
}

require_once __DIR__ . '/../../src/Database.php';
require_once __DIR__ . '/../../src/OrderManager.php';

use DTBrand\Database;
use DTBrand\OrderManager;

$rawPayload = file_get_contents('php://input');
if (empty($rawPayload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'status' => 'EMPTY_PAYLOAD']);
    exit;
}

$eventData = json_decode($rawPayload, true);
if (!is_array($eventData)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'status' => 'INVALID_JSON']);
    exit;
}

$pdo = Database::getConnection();

// Verify configured shared webhook secret/token if set in environment or integrations
$expectedSecret = trim((string)(getenv('DELHIVERY_WEBHOOK_SECRET') ?: ''));
if ($expectedSecret === '' && $pdo !== null && !Database::isMockMode()) {
    try {
        $cfgJson = $pdo->query("SELECT config_json FROM integrations WHERE slug = 'delhivery' LIMIT 1")->fetchColumn();
        $cfg = $cfgJson ? (json_decode((string)$cfgJson, true) ?: []) : [];
        $cand = trim((string)($cfg['webhook_secret'] ?? ''));
        if ($cand !== '' && strpos($cand, '•') === false) {
            $expectedSecret = $cand;
        }
    } catch (\Throwable $e) {}
}

if ($expectedSecret !== '') {
    $providedSig = $_SERVER['HTTP_X_DELHIVERY_SIGNATURE'] ?? ($_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? ''));
    $sigValid = hash_equals($expectedSecret, trim((string)$providedSig))
        || hash_equals(hash_hmac('sha256', $rawPayload, $expectedSecret), trim((string)$providedSig));
    if (!$sigValid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'status' => 'INVALID_WEBHOOK_SIGNATURE']);
        exit;
    }
}

$awb = trim((string)($eventData['Shipment']['AWB'] ?? ($eventData['waybill'] ?? ($eventData['awb'] ?? ''))));
$status = strtolower(trim((string)($eventData['Shipment']['Status']['Status'] ?? ($eventData['status'] ?? ''))));
$eventId = 'dlv_' . ($awb !== '' ? preg_replace('/[^a-zA-Z0-9_-]/', '', $awb) . '_' : '') . substr(md5($rawPayload), 0, 12);

if ($pdo !== null && !Database::isMockMode()) {
    try {
        $dupStmt = $pdo->prepare("SELECT id, status FROM webhook_events WHERE event_id = ? LIMIT 1");
        $dupStmt->execute([$eventId]);
        $dup = $dupStmt->fetch(\PDO::FETCH_ASSOC);
        if ($dup && ($dup['status'] ?? '') === 'processed') {
            $pdo->prepare("UPDATE webhook_events SET attempts = attempts + 1, updated_at = NOW() WHERE id = ?")->execute([(int)$dup['id']]);
            echo json_encode(['success' => true, 'status' => 'REPLAY_IGNORED', 'event_id' => $eventId]);
            exit;
        }

        $insStmt = $pdo->prepare("
            INSERT INTO webhook_events (provider, event_id, event_type, source_gateway, payload, signature_valid, status, received_at)
            VALUES ('delhivery', ?, ?, 'delhivery', ?, 1, 'processing', NOW())
            ON DUPLICATE KEY UPDATE attempts = attempts + 1, updated_at = NOW()
        ");
        $insStmt->execute([$eventId, 'shipment.' . ($status !== '' ? preg_replace('/[^a-z0-9_]+/', '_', $status) : 'update'), $rawPayload]);

        if ($awb !== '') {
            $newOrderStatus = null;
            if (strpos($status, 'delivered') !== false) {
                $newOrderStatus = 'delivered';
            } elseif (strpos($status, 'out for delivery') !== false || strpos($status, 'out_for_delivery') !== false) {
                $newOrderStatus = 'out_for_delivery';
            } elseif (strpos($status, 'in transit') !== false || strpos($status, 'dispatched') !== false || strpos($status, 'shipped') !== false) {
                $newOrderStatus = 'dispatched';
            } elseif (strpos($status, 'cancel') !== false) {
                $newOrderStatus = 'cancelled';
            } elseif (strpos($status, 'rto') !== false || strpos($status, 'return') !== false) {
                $newOrderStatus = 'returned';
            }

            if ($newOrderStatus !== null) {
                OrderManager::updateStatus($awb, $newOrderStatus, $awb, 'Delhivery Express', 'Delhivery Webhook');
            }
        }

        $markStmt = $pdo->prepare("UPDATE webhook_events SET status = 'processed', processed_at = NOW() WHERE event_id = ?");
        $markStmt->execute([$eventId]);
    } catch (\Throwable $e) {
        error_log('Delhivery webhook error: ' . $e->getMessage());
    }
}

echo json_encode(['success' => true, 'status' => 'DELHIVERY_WEBHOOK_PROCESSED', 'event_id' => $eventId]);
