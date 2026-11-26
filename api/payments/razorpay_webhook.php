<?php
/**
 * api/payments/razorpay_webhook.php — Razorpay Payment Webhook Handler
 * DT Brand's & Jai Hanuman Tex
 *
 * Handles: payment.captured, payment.authorized, payment.failed, order.paid
 * Enforces configured webhook secret (503 if unconfigured), HMAC-SHA256 verification,
 * deterministic replay deduplication, transaction ledger updates, and stock adjustment.
 */

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/../../src/Database.php';
require_once __DIR__ . '/../../src/PaymentManager.php';
require_once __DIR__ . '/../../src/OrderManager.php';

use DTBrand\PaymentManager;
use DTBrand\OrderManager;
use DTBrand\Database;

$rawBody = file_get_contents('php://input');
$signature = $_SERVER['HTTP_X_RAZORPAY_SIGNATURE'] ?? '';

if (empty($rawBody)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Empty webhook payload']);
    exit;
}

$rzpGate = PaymentManager::getGateway('razorpay');
$cfg = $rzpGate['config'] ?? [];
$webhookSecret = trim((string)($cfg['webhook_secret'] ?? (getenv('RAZORPAY_WEBHOOK_SECRET') ?: '')));

if ($webhookSecret === '') {
    http_response_code(503);
    echo json_encode(['success' => false, 'message' => 'Razorpay webhook secret not configured']);
    exit;
}

if (empty($signature)) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Missing webhook signature']);
    exit;
}

// Verify HMAC-SHA256 webhook signature over raw body
if (!PaymentManager::verifyRazorpayWebhookSignature($rawBody, $signature)) {
    error_log('Razorpay webhook: Invalid signature');
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

$event = (string)($payload['event'] ?? '');
$eventId = trim((string)($_SERVER['HTTP_X_RAZORPAY_EVENT_ID'] ?? ($payload['id'] ?? ($payload['event_id'] ?? ''))));
if ($eventId === '') {
    $eventId = 'rzp_' . md5($rawBody);
}

// Replay protection via payment_webhooks ledger
$webhookRec = PaymentManager::recordWebhookEvent('razorpay', $eventId, $event, $signature, $payload, 'PROCESSED');
if (empty($webhookRec['idempotent']) || ($webhookRec['status'] ?? '') === 'REPLAY_IGNORED') {
    echo json_encode([
        'success' => true,
        'note'    => 'REPLAY_IGNORED',
        'message' => 'Duplicate webhook event ignored cleanly'
    ]);
    exit;
}

$entity = $payload['payload'] ?? [];
$paymentEntity = $entity['payment']['entity'] ?? ($entity['payment'] ?? []);
$orderEntity = $entity['order']['entity'] ?? ($entity['order'] ?? []);

$db = Database::getConnection();
if ($db && !Database::isMockMode()) {
    try {
        $stmt = $db->prepare("
            INSERT INTO webhook_events (provider, event_id, event_type, source_gateway, payload, signature_valid, status, received_at, processed_at)
            VALUES ('razorpay', ?, ?, 'razorpay', ?, 1, 'processed', NOW(), NOW())
            ON DUPLICATE KEY UPDATE attempts = attempts + 1
        ");
        $stmt->execute([$eventId, $event ?: 'razorpay.event', json_encode($payload)]);
    } catch (\Throwable $e) {
        error_log('Razorpay webhook event log failed: ' . $e->getMessage());
    }
}

try {
    switch ($event) {
        case 'payment.captured':
        case 'payment.authorized':
            rzp_handle_payment_captured($paymentEntity, $eventId, $event);
            break;

        case 'payment.failed':
            rzp_handle_payment_failed($paymentEntity, $eventId);
            break;

        case 'order.paid':
            rzp_handle_order_paid($orderEntity ?: $paymentEntity, $eventId);
            break;

        default:
            error_log("Razorpay webhook: Unhandled event type: $event");
    }

    echo json_encode(['success' => true, 'event' => $event, 'event_id' => $eventId, 'message' => 'Webhook processed']);
} catch (\Throwable $e) {
    error_log('Razorpay webhook processing error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Processing failed']);
}

function rzp_resolve_order_number(array $entity, string $rzpOrderId): string
{
    $notes = is_array($entity['notes'] ?? null) ? $entity['notes'] : [];
    $orderNumber = trim((string)($entity['receipt'] ?? ($notes['order_number'] ?? '')));
    if ($orderNumber !== '') {
        return $orderNumber;
    }
    if ($rzpOrderId !== '') {
        $db = Database::getConnection();
        if ($db && !Database::isMockMode()) {
            try {
                $stmt = $db->prepare("SELECT order_number FROM orders WHERE gateway_order_id = ? LIMIT 1");
                $stmt->execute([$rzpOrderId]);
                $found = $stmt->fetchColumn();
                if ($found) {
                    return (string)$found;
                }
                $txStmt = $db->prepare("SELECT order_number FROM payment_transactions WHERE gateway_order_id = ? AND gateway = 'razorpay' ORDER BY id DESC LIMIT 1");
                $txStmt->execute([$rzpOrderId]);
                $txFound = $txStmt->fetchColumn();
                if ($txFound) {
                    return (string)$txFound;
                }
            } catch (\Throwable $e) {}
        }
    }
    return '';
}

function rzp_handle_payment_captured(array $payment, string $eventId, string $eventType): void
{
    $rzpOrderId = trim((string)($payment['order_id'] ?? ''));
    $rzpPaymentId = trim((string)($payment['id'] ?? ''));
    $amount = (float)($payment['amount'] ?? 0) / 100;
    $currency = (string)($payment['currency'] ?? 'INR');
    $email = (string)($payment['email'] ?? '');
    $phone = (string)($payment['contact'] ?? '');
    $notes = is_array($payment['notes'] ?? null) ? $payment['notes'] : [];
    $orderNumber = rzp_resolve_order_number($payment, $rzpOrderId);

    if ($orderNumber === '' || $rzpPaymentId === '') {
        error_log("Razorpay webhook: Missing order_number or payment ID (rzp_order={$rzpOrderId})");
        return;
    }

    // Webhook authenticity was already verified via X-Razorpay-Signature HMAC-SHA256 over raw body
    PaymentManager::recordTransaction([
        'order_number'       => $orderNumber,
        'gateway'            => 'razorpay',
        'payment_method'     => $payment['method'] ?? 'online',
        'amount'             => $amount,
        'currency'           => $currency,
        'status'             => ($eventType === 'payment.authorized') ? 'authorized' : 'captured',
        'gateway_order_id'   => $rzpOrderId,
        'gateway_payment_id' => $rzpPaymentId,
        'gateway_event_id'   => $eventId,
        'customer_name'      => (string)($notes['customer_name'] ?? ''),
        'customer_phone'     => $phone,
        'customer_email'     => $email,
        'webhook_payload'    => $payment,
        'notes'              => "Razorpay Webhook: {$eventType}"
    ]);

    if ($eventType === 'payment.captured') {
        PaymentManager::markOrderPaidAndAdjustStock($orderNumber, 'razorpay', $rzpPaymentId, $payment);
        OrderManager::updateStatus($orderNumber, 'processing', null, null, 'Razorpay Webhook');
    }
}

function rzp_handle_payment_failed(array $payment, string $eventId): void
{
    $rzpOrderId = trim((string)($payment['order_id'] ?? ''));
    $rzpPaymentId = trim((string)($payment['id'] ?? ''));
    $errorCode = (string)($payment['error_code'] ?? '');
    $errorDescription = (string)($payment['error_description'] ?? ($payment['error_reason'] ?? 'Payment failed'));
    $orderNumber = rzp_resolve_order_number($payment, $rzpOrderId);

    if ($orderNumber === '') {
        error_log('Razorpay failed payment webhook: No order_number resolved');
        return;
    }

    PaymentManager::recordTransaction([
        'order_number'       => $orderNumber,
        'gateway'            => 'razorpay',
        'payment_method'     => $payment['method'] ?? 'online',
        'amount'             => (float)($payment['amount'] ?? 0) / 100,
        'currency'           => (string)($payment['currency'] ?? 'INR'),
        'status'             => 'failed',
        'failure_reason'     => trim("{$errorCode} {$errorDescription}"),
        'gateway_order_id'   => $rzpOrderId,
        'gateway_payment_id' => $rzpPaymentId,
        'gateway_event_id'   => $eventId,
        'webhook_payload'    => $payment,
        'notes'              => "Error: {$errorCode} - {$errorDescription}",
    ]);

    $db = Database::getConnection();
    if ($db && !Database::isMockMode()) {
        try {
            $stmt = $db->prepare("UPDATE orders SET payment_status = 'failed', updated_at = NOW() WHERE order_number = ? AND payment_status != 'paid'");
            $stmt->execute([$orderNumber]);
        } catch (\Throwable $e) {}
    }
}

function rzp_handle_order_paid(array $order, string $eventId): void
{
    $rzpOrderId = trim((string)($order['id'] ?? ($order['order_id'] ?? '')));
    $orderNumber = rzp_resolve_order_number($order, $rzpOrderId);

    if ($orderNumber === '' || $rzpOrderId === '') {
        return;
    }

    PaymentManager::markOrderPaidAndAdjustStock($orderNumber, 'razorpay', $rzpOrderId, $order);
    OrderManager::updateStatus($orderNumber, 'processing', null, null, 'Razorpay Order Paid Webhook');
}
