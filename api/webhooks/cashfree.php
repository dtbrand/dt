<?php
/**
 * cashfree.php — Official Cashfree Server-to-Server Webhook Receiver
 * Handles PAYMENT_SUCCESS_WEBHOOK, ORDER_PAID, ORDER_FAILED, ORDER_EXPIRED, PAYMENT_FAILED_WEBHOOK
 * DT Brand's & Jai Hanuman Tex
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../src/Database.php';
require_once __DIR__ . '/../../src/PaymentManager.php';
require_once __DIR__ . '/../../src/OrderManager.php';

use DTBrand\Database;
use DTBrand\PaymentManager;
use DTBrand\OrderManager;

$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$timestamp = $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? '';

if (empty($rawBody)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Empty webhook payload']);
    exit;
}

$cfGate = PaymentManager::getGateway('cashfree');
$cfg = $cfGate['config'] ?? [];
$webhookSecret = trim((string)($cfg['webhook_secret'] ?? ($cfg['secret_key'] ?? (getenv('CASHFREE_WEBHOOK_SECRET') ?: getenv('CASHFREE_SECRET_KEY') ?: ''))));

if (empty($webhookSecret)) {
    http_response_code(503);
    echo json_encode(['status' => 'error', 'message' => 'Cashfree webhook secret not configured']);
    exit;
}

if (empty($signature) || empty($timestamp)) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Missing Cashfree webhook signature or timestamp']);
    exit;
}

if (!PaymentManager::verifyCashfreeWebhookSignature($rawBody, $signature, $timestamp)) {
    http_response_code(401);
    echo json_encode(['status' => 'error', 'message' => 'Invalid Cashfree webhook signature']);
    exit;
}

$event = json_decode($rawBody, true);
if (!is_array($event)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Invalid JSON payload']);
    exit;
}

$eventData = $event['data'] ?? [];
$orderData = $eventData['order'] ?? [];
$paymentData = $eventData['payment'] ?? [];
$eventType = (string)($event['type'] ?? ($paymentData['payment_status'] ?? 'cashfree.webhook'));

$cfOrderId = trim((string)($orderData['order_id'] ?? ''));
$cfPaymentId = trim((string)($paymentData['cf_payment_id'] ?? ''));
$eventId = trim((string)($event['id'] ?? ($cfPaymentId !== '' ? 'cf_' . $cfPaymentId . '_' . $eventType : 'cf_' . md5($rawBody))));

// Replay protection & idempotency ledger
$webhookRec = PaymentManager::recordWebhookEvent('cashfree', $eventId, $eventType, $signature, $event, 'PROCESSED');
if (empty($webhookRec['idempotent']) || ($webhookRec['status'] ?? '') === 'REPLAY_IGNORED') {
    http_response_code(200);
    echo json_encode([
        'status'  => 'success',
        'event'   => $eventType,
        'note'    => 'REPLAY_IGNORED',
        'message' => 'Duplicate Cashfree webhook event ignored cleanly'
    ]);
    exit;
}

$db = Database::getConnection();
$orderNumber = '';
if ($cfOrderId !== '') {
    if ($db && !Database::isMockMode()) {
        try {
            $st = $db->prepare("SELECT order_number FROM payment_transactions WHERE gateway_order_id = ? AND gateway = 'cashfree' ORDER BY id DESC LIMIT 1");
            $st->execute([$cfOrderId]);
            $found = $st->fetchColumn();
            if ($found) {
                $orderNumber = (string)$found;
            }
        } catch (\Throwable $e) {}
    }
    if ($orderNumber === '') {
        $orderNumber = preg_replace('/_\d{10,}$/', '', $cfOrderId);
    }
}

$amount = (float)($orderData['order_amount'] ?? ($paymentData['payment_amount'] ?? 0));
$paymentStatus = strtoupper((string)($paymentData['payment_status'] ?? ($event['type'] ?? '')));
$pmRaw = $paymentData['payment_group'] ?? ($paymentData['payment_method'] ?? 'cashfree_pg');
$paymentMethod = is_array($pmRaw) ? (string)(array_key_first($pmRaw) ?? 'cashfree_pg') : (string)$pmRaw;

if ($orderNumber !== '') {
    try {
        if (in_array($paymentStatus, ['SUCCESS', 'PAYMENT_SUCCESS_WEBHOOK', 'ORDER_PAID'], true)) {
            PaymentManager::markOrderPaidAndAdjustStock($orderNumber, 'cashfree', $cfPaymentId, $event);
            PaymentManager::recordTransaction([
                'order_number'       => $orderNumber,
                'gateway'            => 'cashfree',
                'payment_method'     => $paymentMethod,
                'amount'             => $amount,
                'currency'           => $orderData['order_currency'] ?? 'INR',
                'status'             => 'captured',
                'gateway_order_id'   => $cfOrderId,
                'gateway_payment_id' => $cfPaymentId,
                'gateway_event_id'   => $eventId,
                'webhook_payload'    => $event,
                'notes'              => "Cashfree webhook: {$paymentStatus}"
            ]);
            OrderManager::updateStatus($orderNumber, 'processing', null, null, 'Cashfree Webhook');
        } elseif (in_array($paymentStatus, ['FAILED', 'USER_DROPPED', 'ORDER_FAILED', 'ORDER_EXPIRED', 'PAYMENT_FAILED_WEBHOOK'], true)) {
            PaymentManager::recordTransaction([
                'order_number'       => $orderNumber,
                'gateway'            => 'cashfree',
                'payment_method'     => $paymentMethod,
                'amount'             => $amount,
                'currency'           => $orderData['order_currency'] ?? 'INR',
                'status'             => 'failed',
                'failure_reason'     => (string)($paymentData['payment_message'] ?? $paymentStatus),
                'gateway_order_id'   => $cfOrderId,
                'gateway_payment_id' => $cfPaymentId,
                'gateway_event_id'   => $eventId,
                'webhook_payload'    => $event,
                'notes'              => "Cashfree webhook failure: {$paymentStatus}"
            ]);
            if ($db && !Database::isMockMode()) {
                $db->prepare("UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE order_number = ? AND payment_status != 'paid'")
                   ->execute([$orderNumber]);
            }
        }
    } catch (\Throwable $e) {
        error_log("Cashfree webhook error: " . $e->getMessage());
    }
}

http_response_code(200);
echo json_encode(['status' => 'success', 'event_id' => $eventId]);
