<?php
/**
 * api/payments/cashfree_webhook.php — Cashfree Payment Webhook Handler
 * DT Brand's & Jai Hanuman Tex
 *
 * Handles: ORDER_PAID, PAYMENT_SUCCESS_WEBHOOK, ORDER_FAILED, ORDER_EXPIRED
 * Verifies HMAC-SHA256 signature (503 if secret missing, 401 if invalid),
 * enforces replay deduplication, updates order/payment records cleanly.
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../src/Database.php';
require_once __DIR__ . '/../../src/PaymentManager.php';
require_once __DIR__ . '/../../src/OrderManager.php';

use DTBrand\PaymentManager;
use DTBrand\OrderManager;
use DTBrand\Database;

$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$timestamp = $_SERVER['HTTP_X_WEBHOOK_TIMESTAMP'] ?? '';

if (empty($rawBody)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Empty webhook payload']);
    exit;
}

$cfGate = PaymentManager::getGateway('cashfree');
$cfg = $cfGate['config'] ?? [];
$webhookSecret = trim((string)($cfg['webhook_secret'] ?? ($cfg['secret_key'] ?? (getenv('CASHFREE_WEBHOOK_SECRET') ?: getenv('CASHFREE_SECRET_KEY') ?: ''))));

if (empty($webhookSecret)) {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Cashfree webhook secret not configured']);
    exit;
}

if (empty($signature) || empty($timestamp)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Missing signature or timestamp']);
    exit;
}

if (!PaymentManager::verifyCashfreeWebhookSignature($rawBody, $signature, $timestamp)) {
    error_log('Cashfree webhook: Invalid signature');
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Invalid signature']);
    exit;
}

$payload = json_decode($rawBody, true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Invalid JSON']);
    exit;
}

$eventType = (string)($payload['type'] ?? '');
$data = is_array($payload['data'] ?? null) ? $payload['data'] : [];
$order = is_array($data['order'] ?? null) ? $data['order'] : [];
$payment = is_array($data['payment'] ?? null) ? $data['payment'] : [];

$eventId = trim((string)($payload['id'] ?? ($payment['cf_payment_id'] ?? '')));
if ($eventId === '') {
    $eventId = 'cf_' . md5($rawBody);
}

$webhookRec = PaymentManager::recordWebhookEvent('cashfree', $eventId, $eventType ?: 'cashfree.event', $signature, $payload, 'PROCESSED');
if (empty($webhookRec['idempotent']) || ($webhookRec['status'] ?? '') === 'REPLAY_IGNORED') {
    echo json_encode(['success' => true, 'note' => 'REPLAY_IGNORED', 'message' => 'Duplicate webhook event ignored cleanly']);
    exit;
}

$db = Database::getConnection();
if ($db && !Database::isMockMode()) {
    try {
        $stmt = $db->prepare("
            INSERT INTO webhook_events (provider, event_id, event_type, source_gateway, payload, signature_valid, status, received_at, processed_at)
            VALUES ('cashfree', ?, ?, 'cashfree', ?, 1, 'processed', NOW(), NOW())
            ON DUPLICATE KEY UPDATE attempts = attempts + 1
        ");
        $stmt->execute([$eventId, $eventType ?: 'cashfree.event', json_encode($payload)]);
    } catch (\Throwable $e) {
        error_log('Cashfree webhook event log failed: ' . $e->getMessage());
    }
}

try {
    switch ($eventType) {
        case 'ORDER_PAID':
        case 'PAYMENT_SUCCESS_WEBHOOK':
            cf_handle_order_paid($order, $payment, $eventId);
            break;

        case 'ORDER_FAILED':
        case 'ORDER_EXPIRED':
        case 'PAYMENT_FAILED_WEBHOOK':
            cf_handle_order_failed($order, $payment, $eventType, $eventId);
            break;

        default:
            error_log("Cashfree webhook: Unhandled event type: $eventType");
    }

    echo json_encode(['success' => true, 'event' => $eventType, 'event_id' => $eventId, 'message' => 'Webhook processed']);
} catch (\Throwable $e) {
    error_log('Cashfree webhook processing error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Processing failed']);
}

function cf_resolve_order_number(string $cfOrderId): string
{
    if ($cfOrderId === '') {
        return '';
    }
    $db = Database::getConnection();
    if ($db && !Database::isMockMode()) {
        try {
            $stmt = $db->prepare("SELECT order_number FROM orders WHERE gateway_order_id = ? LIMIT 1");
            $stmt->execute([$cfOrderId]);
            $found = $stmt->fetchColumn();
            if ($found) {
                return (string)$found;
            }
            $txStmt = $db->prepare("SELECT order_number FROM payment_transactions WHERE gateway_order_id = ? AND gateway = 'cashfree' ORDER BY id DESC LIMIT 1");
            $txStmt->execute([$cfOrderId]);
            $txFound = $txStmt->fetchColumn();
            if ($txFound) {
                return (string)$txFound;
            }
        } catch (\Throwable $e) {}
    }
    // Strip trailing _timestamp appended when creating gateway order
    return (string)preg_replace('/_\d{10,}$/', '', $cfOrderId);
}

function cf_handle_order_paid(array $order, array $payment, string $eventId): void
{
    $cfOrderId = trim((string)($order['order_id'] ?? ''));
    $cfPaymentId = trim((string)($payment['cf_payment_id'] ?? ($order['payment_id'] ?? '')));
    $amount = (float)($order['order_amount'] ?? ($payment['payment_amount'] ?? 0));
    $currency = (string)($order['order_currency'] ?? 'INR');
    $customerDetails = is_array($order['customer_details'] ?? null) ? $order['customer_details'] : [];
    $phone = (string)($customerDetails['customer_phone'] ?? '');
    $email = (string)($customerDetails['customer_email'] ?? '');
    $customerName = (string)($customerDetails['customer_name'] ?? '');
    $pmRaw = $payment['payment_group'] ?? ($payment['payment_method'] ?? 'upi');
    $paymentMethod = is_array($pmRaw) ? (string)(array_key_first($pmRaw) ?? 'upi') : (string)$pmRaw;

    $ourOrderNumber = cf_resolve_order_number($cfOrderId);
    if ($ourOrderNumber === '') {
        error_log("Cashfree: Could not extract order number from $cfOrderId");
        return;
    }

    PaymentManager::recordTransaction([
        'order_number'       => $ourOrderNumber,
        'gateway'            => 'cashfree',
        'payment_method'     => $paymentMethod,
        'amount'             => $amount,
        'currency'           => $currency,
        'status'             => 'captured',
        'gateway_order_id'   => $cfOrderId,
        'gateway_payment_id' => $cfPaymentId,
        'gateway_event_id'   => $eventId,
        'customer_name'      => $customerName,
        'customer_phone'     => $phone,
        'customer_email'     => $email,
        'webhook_payload'    => ['order' => $order, 'payment' => $payment],
        'notes'              => 'Cashfree ORDER_PAID webhook'
    ]);

    PaymentManager::markOrderPaidAndAdjustStock($ourOrderNumber, 'cashfree', $cfPaymentId, ['order' => $order, 'payment' => $payment]);
    OrderManager::updateStatus($ourOrderNumber, 'processing', null, null, 'Cashfree Webhook');
}

function cf_handle_order_failed(array $order, array $payment, string $eventType, string $eventId): void
{
    $cfOrderId = trim((string)($order['order_id'] ?? ''));
    $ourOrderNumber = cf_resolve_order_number($cfOrderId);
    if ($ourOrderNumber === '') {
        error_log("Cashfree $eventType: Could not extract order number from $cfOrderId");
        return;
    }

    $errorCode = (string)($order['payment_error_code'] ?? '');
    $errorMessage = (string)($order['payment_error_message'] ?? ($payment['payment_message'] ?? ''));

    PaymentManager::recordTransaction([
        'order_number'       => $ourOrderNumber,
        'gateway'            => 'cashfree',
        'payment_method'     => (string)($order['payment_method'] ?? 'upi'),
        'amount'             => (float)($order['order_amount'] ?? ($payment['payment_amount'] ?? 0)),
        'currency'           => (string)($order['order_currency'] ?? 'INR'),
        'status'             => 'failed',
        'failure_reason'     => trim("{$errorCode} {$errorMessage}"),
        'gateway_order_id'   => $cfOrderId,
        'gateway_event_id'   => $eventId,
        'notes'              => "{$eventType}: {$errorCode} - {$errorMessage}",
    ]);

    $db = Database::getConnection();
    if ($db && !Database::isMockMode()) {
        try {
            $stmt = $db->prepare("UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE order_number = ? AND payment_status != 'paid'");
            $stmt->execute([$ourOrderNumber]);
        } catch (\Throwable $e) {}
    }
}
