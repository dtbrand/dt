<?php
/**
 * api/_b2b_helpers.php — Shared Wallet, Role & Order-Auth Helpers for B2B Portal APIs
 * Used by api/retailer.php, api/reseller.php, and api/wholesale.php.
 */

if (!function_exists('dt_b2b_get_wallet')) {
    /**
     * Fetch live wallet summary and recent ledger entries for a customer from DB.
     */
    function dt_b2b_get_wallet(?\PDO $pdo, int $customerId): array
    {
        $summary = [
            'balance'         => 0.0,
            'pending_payout'  => 0.0,
            'lifetime_earned' => 0.0,
            'transactions'    => []
        ];

        if ($pdo === null || $customerId <= 0) {
            return $summary;
        }

        try {
            $wStmt = $pdo->prepare("SELECT id, balance, pending_payout, lifetime_earned FROM `wallets` WHERE customer_id = ? LIMIT 1");
            $wStmt->execute([$customerId]);
            $w = $wStmt->fetch(\PDO::FETCH_ASSOC);
            if ($w) {
                $summary['balance']         = (float)($w['balance'] ?? 0);
                $summary['pending_payout']  = (float)($w['pending_payout'] ?? 0);
                $summary['lifetime_earned'] = (float)($w['lifetime_earned'] ?? 0);
            }

            $tStmt = $pdo->prepare("
                SELECT id, order_id, transaction_type, amount, balance_after, reference_note, status, created_at
                FROM `wallet_transactions`
                WHERE customer_id = ?
                ORDER BY id DESC
                LIMIT 25
            ");
            $tStmt->execute([$customerId]);
            $rows = $tStmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
            foreach ($rows as &$r) {
                $r['id'] = (int)$r['id'];
                $r['amount'] = (float)$r['amount'];
                $r['balance_after'] = (float)$r['balance_after'];
            }
            unset($r);
            $summary['transactions'] = $rows;
        } catch (\Throwable $e) {
            error_log('dt_b2b_get_wallet error: ' . $e->getMessage());
        }

        return $summary;
    }
}

if (!function_exists('dt_b2b_submit_wallet_request')) {
    /**
     * Record a pending wallet top-up verification or payout withdrawal request in DB.
     * Actual balance credits occur only after payment gateway/admin settlement.
     */
    function dt_b2b_submit_wallet_request(\PDO $pdo, int $customerId, string $kind, float $amount, string $note = ''): array
    {
        if ($customerId <= 0 || $amount <= 0) {
            return ['success' => false, 'error' => 'Valid customer and positive amount are required.'];
        }

        try {
            $pdo->beginTransaction();

            $wStmt = $pdo->prepare("SELECT id, balance, pending_payout FROM `wallets` WHERE customer_id = ? FOR UPDATE");
            $wStmt->execute([$customerId]);
            $wallet = $wStmt->fetch(\PDO::FETCH_ASSOC);

            if (!$wallet) {
                $insW = $pdo->prepare("INSERT INTO `wallets` (customer_id, balance, pending_payout, lifetime_earned) VALUES (?, 0.00, 0.00, 0.00)");
                $insW->execute([$customerId]);
                $walletId = (int)$pdo->lastInsertId();
                $balance = 0.0;
            } else {
                $walletId = (int)$wallet['id'];
                $balance = (float)$wallet['balance'];
            }

            if ($kind === 'withdraw') {
                if ($amount > $balance) {
                    $pdo->rollBack();
                    return ['success' => false, 'error' => 'Requested payout exceeds available wallet balance (₹' . number_format($balance, 2) . ').'];
                }
                $pdo->prepare("UPDATE `wallets` SET pending_payout = pending_payout + ? WHERE id = ?")->execute([$amount, $walletId]);
                $txType = 'payout';
                $refNote = $note !== '' ? $note : 'Bank payout withdrawal request';
            } else {
                $txType = 'credit';
                $refNote = $note !== '' ? $note : 'Prepaid wallet recharge request (awaiting payment verification)';
            }

            $txStmt = $pdo->prepare("
                INSERT INTO `wallet_transactions` (wallet_id, customer_id, transaction_type, amount, balance_after, reference_note, status)
                VALUES (?, ?, ?, ?, ?, ?, 'pending')
            ");
            $txStmt->execute([$walletId, $customerId, $txType, round($amount, 2), $balance, $refNote]);

            $pdo->commit();
            return [
                'success' => true,
                'wallet'  => dt_b2b_get_wallet($pdo, $customerId),
            ];
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            return ['success' => false, 'error' => 'Wallet ledger update failed: ' . $e->getMessage()];
        }
    }
}

if (!function_exists('dt_b2b_authorize_order_view')) {
    /**
     * Authorize viewing a single order across get_order_details and track_order.
     * - get_order_details: requires admin OR logged-in order owner (never unauthenticated phone)
     * - track_order: allows admin OR logged-in owner OR matching 10-digit phone ONLY with non-numeric order_number
     */
    function dt_b2b_authorize_order_view(string $action, string $rawOrderKey, array $order, ?array $currentUser, bool $isAdmin, string $inputPhone): bool
    {
        if ($isAdmin) {
            return true;
        }

        $authUserId = (int)($currentUser['id'] ?? 0);
        $orderCustId = (int)($order['customer_id'] ?? 0);
        if ($authUserId > 0 && $orderCustId === $authUserId) {
            return true;
        }

        $digits = static function ($v): string {
            $d = preg_replace('/\D+/', '', (string)$v);
            return strlen($d) > 10 ? substr($d, -10) : $d;
        };

        $orderPhone = $digits((string)($order['customer_phone'] ?? ''));

        // Logged-in customer with verified session phone matching order phone
        $authPhone = $digits((string)($currentUser['phone'] ?? ''));
        if ($authUserId > 0 && $authPhone !== '' && $orderPhone !== '' && hash_equals($orderPhone, $authPhone)) {
            return true;
        }

        // Public tracking requires non-sequential order_number + exact 10-digit phone match
        if ($action === 'track_order' && $rawOrderKey !== '' && !ctype_digit($rawOrderKey)) {
            $inDigits = $digits($inputPhone);
            if (strlen($inDigits) === 10 && $orderPhone !== '' && hash_equals($orderPhone, $inDigits)) {
                return true;
            }
        }

        return false;
    }
}
