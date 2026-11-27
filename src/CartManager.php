<?php
namespace DTBrand;

require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/ProductCatalog.php';
require_once __DIR__ . '/PricingCalculator.php';
require_once __DIR__ . '/DiscountEngine.php';
require_once __DIR__ . '/Money.php';
require_once __DIR__ . '/Auth.php';

/**
 * CartManager — Authoritative Server-Side Cart Audit & Calculation Engine
 * Master Specification V2: Section 44 (Cart Audit)
 * 
 * Rules:
 * 1. Cart is NEVER the authoritative financial source — every price, discount, tax, and total is recomputed server-side.
 * 2. Stale, drafted, deleted or out-of-stock products are rejected with clear error reports.
 * 3. Disabled variants or requested quantities exceeding available inventory are flagged.
 * 4. Full Set products are strictly restricted to verified Retailer and Wholesaler accounts.
 * 5. Wholesaler Single Piece orders MUST strictly adhere to MCQ (Available Colors × Available Sizes).
 * 6. All monetary calculations are performed in integer paise using Money to prevent floating-point drift.
 *
 * DT Brand's & Jai Hanuman Tex
 */
class CartManager
{
    /**
     * Authoritatively validate and recalculate a cart bag
     *
     * @param array $rawItems Raw items submitted by the browser
     * @param string $userRole Session-authoritative user role
     * @param string|null $couponCode Optional coupon code
     * @param float $gstRate Applicable GST rate (default 5.0%)
     * @return array Authoritative cart payload with validated items and exact financial breakdown
     */
    public static function validateAndRecalculateCart(
        array $rawItems,
        string $userRole = 'guest',
        ?string $couponCode = null,
        float $gstRate = 5.0
    ): array {
        // Normalize user role
        $role = strtolower(trim($userRole));
        if ($role === 'wholesaler') { $role = 'wholesale'; }
        if ($role === 'retail' || $role === '') { $role = 'customer'; }
        $isTradeUser = in_array($role, ['wholesale', 'retailer'], true);

        $validatedItems = [];
        $errors = [];
        $warnings = [];
        $subtotalMoney = Money::zero();
        $totalPhysicalPieces = 0;
        $allValid = true;

        foreach ($rawItems as $index => $item) {
            $pid = (int)($item['id'] ?? ($item['product_id'] ?? 0));
            $requestedQty = max(1, (int)($item['qty'] ?? ($item['quantity'] ?? 1)));
            $lotType = strtolower(trim((string)($item['lot_type'] ?? 'single')));

            if ($pid <= 0) {
                $errors[] = "Line item #" . ($index + 1) . ": Invalid or missing product ID.";
                $allValid = false;
                continue;
            }

            // 1. Look up live product from database
            $p = ProductCatalog::getById($pid);
            if (!$p) {
                $errors[] = "Product ID #{$pid} is no longer available in the catalogue.";
                $allValid = false;
                continue;
            }

            // 2. Check product status (stale / draft / out_of_stock / inactive / deleted handling)
            $productStatus = strtolower((string)($p['status'] ?? 'in_stock'));
            if (!in_array($productStatus, ['active', 'in_stock', 'low_stock'], true)) {
                $errors[] = "'{$p['name']}' is currently unavailable ({$productStatus}). Please remove it from your cart.";
                $allValid = false;
                continue;
            }

            // 3. Check live product inventory stock
            $productStock = (int)($p['stock_qty'] ?? ($p['stock_quantity'] ?? 0));
            if ($productStock <= 0) {
                $errors[] = "'{$p['name']}' is currently out of stock.";
                $allValid = false;
                continue;
            }

            $pSellingType = trim((string)($p['selling_type'] ?? 'single_piece')) ?: 'single_piece';
            $isFullSet = ($pSellingType === 'full_set' || $lotType === 'full_set');

            if ($isFullSet) {
                // 4. Full Set Role Security: Strictly Wholesaler or Retailer only
                if (!$isTradeUser) {
                    $errors[] = "Full Set product '{$p['name']}' is exclusively available to verified Retailer and Wholesaler trade accounts.";
                    $allValid = false;
                    continue;
                }

                // Authoritative Unit Price for Full Set
                $unitPrice = ProductCatalog::resolvePrice($p, $role);
                $variants = $p['full_set_variants'] ?? $p['variants'] ?? [];
                $fullSetPieces = max(1, count($variants));
                $physicalQty = $fullSetPieces * $requestedQty;

                // Check physical stock for full set
                if ($physicalQty > $productStock) {
                    $errors[] = "Requested {$requestedQty} Full Set(s) ({$physicalQty} pieces) for '{$p['name']}', but only {$productStock} pieces are available in stock.";
                    $allValid = false;
                    continue;
                }

                $setPriceMoney = Money::fromFloat($unitPrice)->multiply($fullSetPieces);
                $lineTotalMoney = $setPriceMoney->multiply($requestedQty);
                $subtotalMoney = $subtotalMoney->add($lineTotalMoney);
                $totalPhysicalPieces += $physicalQty;

                $validatedItems[] = [
                    'id'                  => $p['id'],
                    'product_id'          => $p['id'],
                    'variant_id'          => null,
                    'product_type'        => 'full_set',
                    'selling_type'        => 'full_set',
                    'name'                => $p['name'],
                    'sku'                 => $p['sku'],
                    'image'               => $p['image'],
                    'lot_type'            => 'full_set',
                    'full_set_pieces'     => $fullSetPieces,
                    'color'               => 'All Configured Colors (' . count($p['colors']) . ')',
                    'size'                => 'All Configured Sizes (' . count($p['sizes']) . ')',
                    'qty'                 => $requestedQty,
                    'quantity'            => $requestedQty,
                    'pieces_count'        => $physicalQty,
                    'unit_price'          => $unitPrice,
                    'set_price'           => $setPriceMoney->toFloat(),
                    'subtotal'            => $lineTotalMoney->toFloat(),
                    'total_price'         => $lineTotalMoney->toFloat(),
                    'is_valid'            => true,
                    'in_stock'            => true,
                    'stock_available'     => $productStock,
                    'error'               => null
                ];
            } else {
                // 5. Single Piece Role Pricing
                $unitPrice = ProductCatalog::resolvePrice($p, $role);

                // 6. Wholesaler MCQ Validation for Single Piece
                if ($role === 'wholesale') {
                    $mcqResult = ProductCatalog::calculateWholesalerMcq($p);
                    $requiredMcq = (int)($mcqResult['mcq'] ?? 0);
                    $colorsCount = (int)($mcqResult['color_count'] ?? 0);
                    $sizesCount = (int)($mcqResult['size_count'] ?? 0);

                    if ($requiredMcq > 0) {
                        if ($requestedQty < $requiredMcq || ($requestedQty % $requiredMcq !== 0)) {
                            $errors[] = "Wholesale MCQ for '{$p['name']}' requires ordering in full lot multiples of {$requiredMcq} pieces ({$colorsCount} Colours × {$sizesCount} Sizes), but {$requestedQty} requested.";
                            $allValid = false;
                            continue;
                        }
                    }
                }

                // 7. Variant Validation & Stock Check
                $chosenColor = trim((string)($item['color'] ?? ($p['colors'][0] ?? $p['color'] ?? '')));
                $chosenSize  = trim((string)($item['size'] ?? ($p['size'][0] ?? 'Free Size')));
                $reqVarId    = !empty($item['variant_id']) ? (int)$item['variant_id'] : 0;

                $matchedVariant = null;
                $variants = $p['variants'] ?? [];

                if ($reqVarId > 0) {
                    foreach ($variants as $v) {
                        if ((int)($v['id'] ?? 0) === $reqVarId) {
                            $matchedVariant = $v;
                            break;
                        }
                    }
                }
                if (!$matchedVariant && ($chosenColor !== '' || $chosenSize !== '')) {
                    foreach ($variants as $v) {
                        if (strcasecmp((string)($v['color'] ?? ''), $chosenColor) === 0 && strcasecmp((string)($v['size'] ?? ''), $chosenSize) === 0) {
                            $matchedVariant = $v;
                            break;
                        }
                    }
                }

                // Check disabled variant status if variant was matched
                if ($matchedVariant) {
                    $vStatus = strtolower((string)($matchedVariant['status'] ?? 'active'));
                    if ($vStatus !== 'active') {
                        $errors[] = "Selected variant ({$chosenColor} / {$chosenSize}) for '{$p['name']}' is disabled or unavailable.";
                        $allValid = false;
                        continue;
                    }
                    $vStock = isset($matchedVariant['stock_qty']) ? (int)$matchedVariant['stock_qty'] : $productStock;
                    if ($vStock <= 0) {
                        $errors[] = "Selected variant ({$chosenColor} / {$chosenSize}) for '{$p['name']}' is out of stock.";
                        $allValid = false;
                        continue;
                    }
                    if ($requestedQty > $vStock) {
                        $errors[] = "Requested {$requestedQty} of '{$p['name']}' ({$chosenColor} / {$chosenSize}), but only {$vStock} available.";
                        $allValid = false;
                        continue;
                    }
                } else {
                    // Check general product stock
                    if ($requestedQty > $productStock) {
                        $errors[] = "Requested {$requestedQty} of '{$p['name']}', but only {$productStock} available in stock.";
                        $allValid = false;
                        continue;
                    }
                }

                $varId = $matchedVariant ? (int)($matchedVariant['id'] ?? 0) : ($reqVarId > 0 ? $reqVarId : null);
                $itemSku = ($matchedVariant && !empty($matchedVariant['sku'])) ? $matchedVariant['sku'] : $p['sku'];
                $itemColor = $matchedVariant ? ($matchedVariant['color'] ?? $chosenColor) : $chosenColor;
                $itemSize = $matchedVariant ? ($matchedVariant['size'] ?? $chosenSize) : $chosenSize;

                $lineTotalMoney = Money::fromFloat($unitPrice)->multiply($requestedQty);
                $subtotalMoney = $subtotalMoney->add($lineTotalMoney);
                $totalPhysicalPieces += $requestedQty;

                $validatedItems[] = [
                    'id'              => $p['id'],
                    'product_id'      => $p['id'],
                    'variant_id'      => $varId,
                    'product_type'    => 'single_piece',
                    'selling_type'    => 'single_piece',
                    'name'            => $p['name'],
                    'sku'             => $itemSku,
                    'image'           => $p['image'],
                    'color'           => $itemColor,
                    'size'            => $itemSize,
                    'lot_type'        => 'single',
                    'qty'             => $requestedQty,
                    'quantity'        => $requestedQty,
                    'pieces_count'    => $requestedQty,
                    'unit_price'      => $unitPrice,
                    'subtotal'        => $lineTotalMoney->toFloat(),
                    'total_price'     => $lineTotalMoney->toFloat(),
                    'is_valid'        => true,
                    'in_stock'        => true,
                    'stock_available' => $productStock,
                    'error'           => null
                ];
            }
        }

        // 8. Server-Side Authoritative Coupon Discount Calculation
        $discountMoney = Money::zero();
        $couponMessage = '';
        $couponValid = false;

        $cleanCoupon = strtoupper(trim((string)$couponCode));
        if ($cleanCoupon !== '' && $subtotalMoney->toPaise() > 0) {
            $couponResult = DiscountEngine::applyCoupon($cleanCoupon, $subtotalMoney->toFloat(), null, $role);
            if (!empty($couponResult['valid'])) {
                $discountMoney = Money::fromFloat((float)($couponResult['discount'] ?? 0.0));
                $couponValid = true;
                $couponMessage = $couponResult['message'] ?? 'Coupon applied successfully.';
            } else {
                $couponMessage = $couponResult['message'] ?? 'Invalid coupon code.';
                $warnings[] = $couponMessage;
            }
        }

        // 9. Shipping Freight Calculation (from config/shipping.php)
        $shipCfgFile = dirname(__DIR__) . '/config/shipping.php';
        $shipCfg = is_file($shipCfgFile) ? require $shipCfgFile : [];
        if (!is_array($shipCfg)) { $shipCfg = []; }

        $shipRate = max(0.0, (float)($shipCfg['standard_rate'] ?? 150.0));
        $shipFreeAt = max(0.0, (float)($shipCfg['free_shipping_threshold'] ?? 0.0));
        $qualifiesFree = ($shipFreeAt > 0 && $subtotalMoney->toFloat() >= $shipFreeAt);
        $shippingRate = ($subtotalMoney->toPaise() <= 0 || $qualifiesFree) ? 0.0 : $shipRate;
        $shippingMoney = Money::fromFloat($shippingRate);

        // 10. Grand Total Calculation via PricingCalculator / Money
        $pricing = PricingCalculator::calculateOrderTotal(
            $subtotalMoney->toFloat(),
            $discountMoney->toFloat(),
            $shippingMoney->toFloat(),
            $gstRate
        );

        return [
            'success'                 => $allValid && empty($errors),
            'user_role'               => $role,
            'is_trade_user'           => $isTradeUser,
            'item_count'              => count($validatedItems),
            'total_physical_pieces'   => $totalPhysicalPieces,
            'items'                   => $validatedItems,
            'cart'                    => $validatedItems,
            'pricing'                 => $pricing,
            'subtotal'                => $subtotalMoney->toFloat(),
            'discount'                => $discountMoney->toFloat(),
            'shipping'                => $shippingMoney->toFloat(),
            'gst_rate'                => $gstRate,
            'gst_amount'              => (float)($pricing['gst_amount'] ?? 0.0),
            'grand_total'             => (float)($pricing['grand_total'] ?? $subtotalMoney->toFloat()),
            'coupon_info'             => [
                'code'    => $cleanCoupon,
                'valid'   => $couponValid,
                'message' => $couponMessage,
                'amount'  => $discountMoney->toFloat()
            ],
            'shipping_info'           => [
                'standard_rate' => $shipRate,
                'free_at'       => $shipFreeAt,
                'is_free'       => $qualifiesFree
            ],
            'errors'                  => $errors,
            'warnings'                => $warnings
        ];
    }

    /**
     * Ensure `cart_items` table exists with variant_id and lot_type columns (idempotent)
     */
    public static function ensureCartSchema(\PDO $pdo): void
    {
        static $checked = false;
        if ($checked) {
            return;
        }
        $checked = true;

        try {
            $driver = $pdo->getAttribute(\PDO::ATTR_DRIVER_NAME);
            if ($driver === 'sqlite') {
                $pdo->exec("
                    CREATE TABLE IF NOT EXISTS cart_items (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        customer_id INTEGER NULL,
                        session_id TEXT NOT NULL,
                        product_id INTEGER NOT NULL,
                        variant_id INTEGER NULL,
                        color TEXT NULL,
                        size TEXT NULL,
                        lot_type TEXT NOT NULL DEFAULT 'single',
                        quantity INTEGER NOT NULL DEFAULT 1,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                ");
                return;
            }

            $colsStmt = $pdo->query("SHOW COLUMNS FROM `cart_items`");
            $cols = $colsStmt ? $colsStmt->fetchAll(\PDO::FETCH_COLUMN, 0) : [];
            if (!in_array('variant_id', $cols, true)) {
                $pdo->exec("ALTER TABLE `cart_items` ADD COLUMN `variant_id` INT(11) NULL AFTER `product_id`");
            }
            if (!in_array('lot_type', $cols, true)) {
                $pdo->exec("ALTER TABLE `cart_items` ADD COLUMN `lot_type` VARCHAR(24) NOT NULL DEFAULT 'single' AFTER `size`");
            }
        } catch (\Throwable $e) {
            error_log('[CartManager::ensureCartSchema] ' . $e->getMessage());
        }
    }

    /**
     * Load raw persisted cart rows for a logged-in customer or guest session
     */
    public static function getStoredItems(int $customerId, string $sessionId): array
    {
        if (session_status() === PHP_SESSION_NONE) {
            Auth::initSession();
        }
        $sid = $sessionId !== '' ? $sessionId : session_id();
        $pdo = Database::getConnection();

        if ($pdo !== null && !Database::isMockMode()) {
            try {
                self::ensureCartSchema($pdo);
                if ($customerId > 0) {
                    $stmt = $pdo->prepare("SELECT product_id, variant_id, color, size, lot_type, quantity FROM `cart_items` WHERE `customer_id` = ? ORDER BY `id` ASC");
                    $stmt->execute([$customerId]);
                } else {
                    $stmt = $pdo->prepare("SELECT product_id, variant_id, color, size, lot_type, quantity FROM `cart_items` WHERE (`customer_id` IS NULL OR `customer_id` = 0) AND `session_id` = ? ORDER BY `id` ASC");
                    $stmt->execute([$sid]);
                }
                $rows = $stmt->fetchAll(\PDO::FETCH_ASSOC) ?: [];
                return array_map(static function (array $r): array {
                    return [
                        'id'         => (int)$r['product_id'],
                        'product_id' => (int)$r['product_id'],
                        'variant_id' => !empty($r['variant_id']) ? (int)$r['variant_id'] : null,
                        'color'      => (string)($r['color'] ?? ''),
                        'size'       => (string)($r['size'] ?? ''),
                        'lot_type'   => (string)($r['lot_type'] ?? 'single'),
                        'qty'        => max(1, (int)($r['quantity'] ?? 1)),
                    ];
                }, $rows);
            } catch (\Throwable $e) {
                error_log('[CartManager::getStoredItems] ' . $e->getMessage());
            }
        }

        return is_array($_SESSION['cart_items'] ?? null) ? $_SESSION['cart_items'] : [];
    }

    /**
     * Normalize & deduplicate incoming cart items by (product_id, variant_id, color, size, lot_type)
     */
    private static function normalizeForStorage(array $items): array
    {
        $merged = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $pid = (int)($item['product_id'] ?? ($item['id'] ?? 0));
            if ($pid <= 0) {
                continue;
            }
            $vid = !empty($item['variant_id']) ? (int)$item['variant_id'] : null;
            $color = substr(trim((string)($item['color'] ?? '')), 0, 50);
            $size = substr(trim((string)($item['size'] ?? '')), 0, 50);
            $lotRaw = strtolower(trim((string)($item['lot_type'] ?? ($item['selling_type'] ?? ($item['product_type'] ?? 'single')))));
            $lotType = ($lotRaw === 'full_set' || $lotRaw === 'set') ? 'full_set' : 'single';
            $qty = max(1, (int)($item['qty'] ?? ($item['quantity'] ?? 1)));

            $key = $pid . '|' . ($vid ?? '0') . '|' . strtolower($color) . '|' . strtolower($size) . '|' . $lotType;
            if (isset($merged[$key])) {
                $merged[$key]['quantity'] += $qty;
            } else {
                $merged[$key] = [
                    'product_id' => $pid,
                    'variant_id' => $vid,
                    'color'      => $color,
                    'size'       => $size,
                    'lot_type'   => $lotType,
                    'quantity'   => $qty,
                ];
            }
        }
        return array_values($merged);
    }

    /**
     * Replace a customer's or guest session's persisted `cart_items` rows cleanly
     */
    public static function saveCartItems(int $customerId, string $sessionId, array $items): bool
    {
        if (session_status() === PHP_SESSION_NONE) {
            Auth::initSession();
        }
        $sid = $sessionId !== '' ? $sessionId : session_id();
        $normalized = self::normalizeForStorage($items);

        $_SESSION['cart_items'] = array_map(static function (array $r): array {
            return [
                'id'         => $r['product_id'],
                'product_id' => $r['product_id'],
                'variant_id' => $r['variant_id'],
                'color'      => $r['color'],
                'size'       => $r['size'],
                'lot_type'   => $r['lot_type'],
                'qty'        => $r['quantity'],
            ];
        }, $normalized);

        $pdo = Database::getConnection();
        if ($pdo === null || Database::isMockMode()) {
            return true;
        }

        try {
            self::ensureCartSchema($pdo);
            $pdo->beginTransaction();
            if ($customerId > 0) {
                $pdo->prepare("DELETE FROM `cart_items` WHERE `customer_id` = ?")->execute([$customerId]);
            } else {
                $pdo->prepare("DELETE FROM `cart_items` WHERE (`customer_id` IS NULL OR `customer_id` = 0) AND `session_id` = ?")->execute([$sid]);
            }

            if (!empty($normalized)) {
                $ins = $pdo->prepare("
                    INSERT INTO `cart_items` (`customer_id`, `session_id`, `product_id`, `variant_id`, `color`, `size`, `lot_type`, `quantity`)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ");
                $cidVal = $customerId > 0 ? $customerId : null;
                foreach ($normalized as $row) {
                    $ins->execute([
                        $cidVal,
                        $sid,
                        $row['product_id'],
                        $row['variant_id'],
                        $row['color'],
                        $row['size'],
                        $row['lot_type'],
                        $row['quantity'],
                    ]);
                }
            }
            $pdo->commit();
            return true;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('[CartManager::saveCartItems] ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Add or update a single item in persisted `cart_items`
     */
    public static function addOrUpdateItem(int $customerId, string $sessionId, array $item, bool $increment = true): bool
    {
        $pid = (int)($item['product_id'] ?? ($item['id'] ?? 0));
        if ($pid <= 0) {
            return false;
        }
        $existing = self::getStoredItems($customerId, $sessionId);
        $vid = !empty($item['variant_id']) ? (int)$item['variant_id'] : null;
        $color = strtolower(trim((string)($item['color'] ?? '')));
        $size = strtolower(trim((string)($item['size'] ?? '')));
        $lotRaw = strtolower(trim((string)($item['lot_type'] ?? ($item['selling_type'] ?? 'single'))));
        $lotType = ($lotRaw === 'full_set' || $lotRaw === 'set') ? 'full_set' : 'single';
        $qty = max(0, (int)($item['qty'] ?? ($item['quantity'] ?? 1)));

        $found = false;
        foreach ($existing as $idx => $row) {
            $sameProd = (int)$row['product_id'] === $pid;
            $sameVar = ($vid && $row['variant_id'])
                ? ((int)$row['variant_id'] === $vid)
                : ((int)($row['variant_id'] ?? 0) === (int)($vid ?? 0)
                    && strtolower((string)($row['color'] ?? '')) === $color
                    && strtolower((string)($row['size'] ?? '')) === $size
                    && strtolower((string)($row['lot_type'] ?? 'single')) === $lotType);
            if ($sameProd && $sameVar) {
                $found = true;
                if ($qty <= 0 && !$increment) {
                    unset($existing[$idx]);
                } else {
                    $existing[$idx]['qty'] = $increment ? ((int)$row['qty'] + max(1, $qty)) : max(1, $qty);
                }
                break;
            }
        }
        if (!$found && $qty > 0) {
            $item['qty'] = $qty;
            $existing[] = $item;
        }
        return self::saveCartItems($customerId, $sessionId, array_values($existing));
    }

    /**
     * Remove a specific item (or all variants of a product) from persisted `cart_items`
     */
    public static function removeItem(int $customerId, string $sessionId, int $productId, ?int $variantId = null, string $color = '', string $size = ''): bool
    {
        if ($productId <= 0) {
            return false;
        }
        $existing = self::getStoredItems($customerId, $sessionId);
        $targetColor = strtolower(trim($color));
        $targetSize = strtolower(trim($size));

        $filtered = array_values(array_filter($existing, static function (array $row) use ($productId, $variantId, $targetColor, $targetSize): bool {
            if ((int)$row['product_id'] !== $productId) {
                return true;
            }
            if ($variantId !== null && (int)($row['variant_id'] ?? 0) !== $variantId) {
                return true;
            }
            if ($targetColor !== '' && strtolower((string)($row['color'] ?? '')) !== $targetColor) {
                return true;
            }
            if ($targetSize !== '' && strtolower((string)($row['size'] ?? '')) !== $targetSize) {
                return true;
            }
            return false;
        }));

        return self::saveCartItems($customerId, $sessionId, $filtered);
    }

    /**
     * Clear all persisted cart items for a customer or guest session
     */
    public static function clearCart(int $customerId, string $sessionId): bool
    {
        return self::saveCartItems($customerId, $sessionId, []);
    }

    /**
     * Merge guest session cart rows into authenticated customer cart on login/register
     */
    public static function mergeGuestCartToCustomer(string $guestSessionId, int $customerId, ?array $extraLocalItems = null): array
    {
        if ($customerId <= 0) {
            return [];
        }
        if (session_status() === PHP_SESSION_NONE) {
            Auth::initSession();
        }
        $guestItems = $guestSessionId !== '' ? self::getStoredItems(0, $guestSessionId) : [];
        $customerItems = self::getStoredItems($customerId, session_id());
        $combined = array_merge($customerItems, $guestItems);
        if (is_array($extraLocalItems) && !empty($extraLocalItems)) {
            $combined = array_merge($combined, $extraLocalItems);
        }

        self::saveCartItems($customerId, session_id(), $combined);
        if ($guestSessionId !== '') {
            $pdo = Database::getConnection();
            if ($pdo !== null && !Database::isMockMode()) {
                try {
                    $pdo->prepare("DELETE FROM `cart_items` WHERE (`customer_id` IS NULL OR `customer_id` = 0) AND `session_id` = ?")->execute([$guestSessionId]);
                } catch (\Throwable $e) {
                    error_log('[CartManager::mergeGuestCartToCustomer cleanup] ' . $e->getMessage());
                }
            }
        }
        return self::getStoredItems($customerId, session_id());
    }
}
