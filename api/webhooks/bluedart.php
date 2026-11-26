<?php
/**
 * api/webhooks/bluedart.php — BlueDart Express Tracking Push Webhook
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

$expectedSecret = trim((string)(getenv('BLUEDART_WEBHOOK_SECRET') ?: ''));
if ($expectedSecret === '' && $pdo !== null && !Database::isMockMode()) {
    try {
        $cfgJson = $pdo->query("SELECT config_json FROM integrations WHERE slug = 'bluedart' LIMIT 1")->fetchColumn();
        $cfg = $cfgJson ? (json_decode((string)$cfgJson, true) ?: []) : [];
        $cand = trim((string)($cfg['webhook_secret'] ?? ''));
        if ($cand !== '' && strpos($cand, '•') === false) {
            $expectedSecret = $cand;
        }
    } catch (\Throwable $e) {}
}

if ($expectedSecret !== '') {
    $providedSig = $_SERVER['HTTP_X_BLUEDART_SIGNATURE'] ?? ($_SERVER['HTTP_X_WEBHOOK_TOKEN'] ?? '');
    $sigValid = hash_equals($expectedSecret, trim((string)$providedSig))
        || hash_equals(hash_hmac('sha256', $rawPayload, $expectedSecret), trim((string)$providedSig));
    if (!$sigValid) {
        http_response_code(401);
        echo json_encode(['success' => false, 'status' => 'INVALID_WEBHOOK_SIGNATURE']);
        exit;
    }
}

$awb = trim((string)($eventData['WaybillNo'] ?? ($eventData['awb'] ?? ($eventData['waybill'] ?? ''))));
$status = strtolower(trim((string)($eventData['Status'] ?? ($eventData['status'] ?? ($eventData['StatusType'] ?? '')))));
$eventId = 'bd_' . ($awb !== '' ? preg_replace('/[^a-zA-Z0-9_-]/', '', $awb) . '_' : '') . substr(md5($rawPayload), 0, 12);

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
            VALUES ('bluedart', ?, ?, 'bluedart', ?, 1, 'processing', NOW())
            ON DUPLICATE KEY UPDATE attempts = attempts + 1, updated_at = NOW()
        ");
        $insStmt->execute([$eventId, 'shipment.' . ($status !== '' ? preg_replace('/[^a-z0-9_]+/', '_', $status) : 'update'), $rawPayload]);

        if ($awb !== '') {
            $newOrderStatus = null;
            if (strpos($status, 'delivered') !== false || $status === 'dl') {
                $newOrderStatus = 'delivered';
            } elseif (strpos($status, 'out for delivery') !== false || strpos($status, 'out_for_delivery') !== false || $status === 'oo') {
                $newOrderStatus = 'out_for_delivery';
            } elseif (strpos($status, 'transit') !== false || strpos($status, 'dispatched') !== false || strpos($status, 'shipped') !== false || $status === 'it') {
                $newOrderStatus = 'dispatched';
            } elseif (strpos($status, 'return') !== false || strpos($status, 'rto') !== false) {
                $newOrderStatus = 'returned';
            }
            if ($newOrderStatus !== null) {
                OrderManager::updateStatus($awb, $newOrderStatus, $awb, 'BlueDart Express', 'BlueDart Webhook');
            }
        }

        $pdo->prepare("UPDATE webhook_events SET status = 'processed', processed_at = NOW() WHERE event_id = ?")->execute([$eventId]);
    } catch (\Throwable $e) {
        error_log('BlueDart webhook error: ' . $e->getMessage());
    }
}

echo json_encode(['success' => true, 'status' => 'BLUEDART_WEBHOOK_PROCESSED', 'event_id' => $eventId]);
