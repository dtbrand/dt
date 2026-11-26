<?php
/**
 * api/_guard.php — Admin authorisation guard for JSON API endpoints.
 * DT Brand's & Jai Hanuman Tex
 *
 * The admin console pages are protected by admin/includes/adminguard.php, which
 * redirects a browser to /admin/login.php. That is the wrong behaviour for an
 * API: a fetch() would silently receive a login page as its "JSON" response.
 * This guard is the API-shaped equivalent — it answers 401 with a JSON body and
 * stops the script.
 *
 * Every endpoint that can WRITE admin-owned data must call dt_api_require_admin()
 * before doing so. Endpoints that mix public reads with admin writes (products,
 * coupons) call it per action rather than at the top of the file, so the
 * storefront keeps working.
 *
 * It reads the same session keys the console guard sets, so one admin login
 * covers both.
 */

if (!function_exists('dt_api_is_admin')) {
    /**
     * True only when this request carries a real, logged-in admin session.
     */
    function dt_api_is_admin(): bool
    {
        // 1. Ensure centralized session configuration is loaded
        $sessConfig = __DIR__ . '/../config/session.php';
        if (file_exists($sessConfig)) {
            require_once $sessConfig;
        }

        if (function_exists('dt_session_start')) {
            dt_session_start();
        } elseif (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }

        // 2. Check standard admin session indicators
        if (!empty($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true) {
            return true;
        }
        if (!empty($_SESSION['admin_user']['id'])) {
            return true;
        }
        if (!empty($_SESSION['user']['role']) && in_array(strtolower((string)$_SESSION['user']['role']), ['admin', 'super_admin'], true)) {
            return true;
        }
        if (!empty($_SESSION['admin']) && is_array($_SESSION['admin'])) {
            return true;
        }
        if (!empty($_SESSION['admin_user_id']) || !empty($_SESSION['admin_id'])) {
            return true;
        }

        // 3. Check if standard PHPSESSID has the session if different session_name was active
        if (!empty($_COOKIE['PHPSESSID']) && session_name() !== 'PHPSESSID') {
            $currName = session_name();
            @session_write_close();
            session_name('PHPSESSID');
            @session_start();
            $phOk = (!empty($_SESSION['admin_logged_in']) && $_SESSION['admin_logged_in'] === true)
                 || (!empty($_SESSION['admin_user']['id']))
                 || (!empty($_SESSION['user']['role']) && in_array(strtolower((string)$_SESSION['user']['role']), ['admin', 'super_admin'], true));
            if ($phOk) {
                return true;
            }
            @session_write_close();
            session_name($currName);
            @session_start();
        }

        return false;
    }
}

if (!function_exists('dt_api_require_admin')) {
    /**
     * Stop the request with a JSON 401 unless an admin is signed in.
     */
    function dt_api_require_admin(string $what = ''): void
    {
        if (dt_api_is_admin()) {
            return;
        }

        if (!headers_sent()) {
            http_response_code(401);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'success' => false,
            'error'   => 'unauthorized',
            'message' => 'Admin sign-in required' . ($what !== '' ? ' to ' . $what : '') . '. Please sign in at /admin/login.php and try again.'
        ]);
        exit;
    }
}

if (!function_exists('dt_api_require_csrf')) {
    /**
     * Enforce CSRF token verification on mutating requests.
     * Checks input payload ('csrf_token', '_csrf'), POST params, or HTTP headers.
     */
    function dt_api_require_csrf(?string $token = null, ?array $payload = null): void
    {
        $sessConfig = __DIR__ . '/../config/session.php';
        if (file_exists($sessConfig)) {
            require_once $sessConfig;
        }

        if ($token === null) {
            if (!empty($payload['csrf_token'])) {
                $token = (string)$payload['csrf_token'];
            } elseif (!empty($payload['_csrf'])) {
                $token = (string)$payload['_csrf'];
            } elseif (!empty($_POST['csrf_token'])) {
                $token = (string)$_POST['csrf_token'];
            } elseif (!empty($_POST['_csrf'])) {
                $token = (string)$_POST['_csrf'];
            } elseif (!empty($_SERVER['HTTP_X_CSRF_TOKEN'])) {
                $token = (string)$_SERVER['HTTP_X_CSRF_TOKEN'];
            } elseif (!empty($_SERVER['HTTP_X_XSRF_TOKEN'])) {
                $token = (string)$_SERVER['HTTP_X_XSRF_TOKEN'];
            }
        }

        $isValid = false;
        if (function_exists('dt_csrf_validate')) {
            $isValid = dt_csrf_validate($token);
        } elseif (class_exists('DTBrand\\Auth')) {
            $isValid = \DTBrand\Auth::validateCsrfToken($token);
        } elseif (!empty($_SESSION['csrf_token']) && !empty($token)) {
            $isValid = hash_equals((string)$_SESSION['csrf_token'], (string)$token);
        }

        if ($isValid) {
            return;
        }

        if (!headers_sent()) {
            http_response_code(403);
            header('Content-Type: application/json; charset=utf-8');
        }
        echo json_encode([
            'success' => false,
            'error'   => 'csrf_invalid',
            'message' => 'Invalid or missing CSRF security token. Please refresh and try again.'
        ]);
        exit;
    }
}

if (!function_exists('dt_api_error_response')) {
    /**
     * Return a standardized, safe JSON error response for uncaught exceptions.
     * Generates a correlation request ID, logs diagnostic details internally,
     * and guarantees that database credentials, SQL queries, and filesystem paths
     * are never leaked to the public response.
     */
    function dt_api_error_response(\Throwable $e, int $httpCode = 500, string $context = '', bool $exit = true): void
    {
        $requestId = 'req_' . substr(md5(uniqid((string)mt_rand(), true)), 0, 12);
        error_log("[{$requestId}] API Error in {$context}: " . $e->getMessage() . " at " . $e->getFile() . ":" . $e->getLine());

        if (!headers_sent()) {
            http_response_code($httpCode);
            header('Content-Type: application/json; charset=utf-8');
        }

        $isDev = in_array(strtolower((string)(getenv('APP_ENV') ?: (getenv('ENVIRONMENT') ?: ''))), ['local', 'development', 'dev', 'testing'], true);

        echo json_encode([
            'success'    => false,
            'error'      => 'server_error',
            'message'    => 'An unexpected system error occurred. Please try again shortly, or message our official WhatsApp concierge at +91 70463 63528.',
            'request_id' => $requestId,
            'detail'     => $isDev ? $e->getMessage() : null
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

        if ($exit) {
            exit;
        }
    }
}

if (!function_exists('dt_api_normalize_role')) {
    /**
     * Canonicalize customer account roles across aliases.
     */
    function dt_api_normalize_role(?string $role): string
    {
        $r = strtolower(trim((string)$role));
        if ($r === 'wholesaler') {
            return 'wholesale';
        }
        if ($r === 'customer') {
            return 'retail';
        }
        return $r;
    }
}

if (!function_exists('dt_api_require_customer')) {
    /**
     * Require an authenticated, active customer session backed by live DB row.
     * Halts with 401/403 JSON when unauthenticated or inactive.
     */
    function dt_api_require_customer(bool $requireActive = true): array
    {
        $sessConfig = __DIR__ . '/../config/session.php';
        if (file_exists($sessConfig)) {
            require_once $sessConfig;
        }
        if (function_exists('dt_session_start')) {
            dt_session_start();
        } elseif (session_status() === PHP_SESSION_NONE) {
            @session_start();
        }

        $user = $_SESSION['user'] ?? null;
        $userId = is_array($user) ? (int)($user['id'] ?? 0) : 0;
        if ($userId <= 0) {
            if (!headers_sent()) {
                http_response_code(401);
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode([
                'success' => false,
                'error'   => 'unauthorized',
                'message' => 'Authentication required. Please sign in to continue.'
            ]);
            exit;
        }

        require_once __DIR__ . '/../src/Database.php';
        $pdo = \DTBrand\Database::getConnection();
        if ($pdo !== null && !\DTBrand\Database::isMockMode()) {
            try {
                $stmt = $pdo->prepare("SELECT id, name, business_name, phone, email, type, city, state, tier, gstin, gst_verified, pan, kyc_status, credit_limit, outstanding_balance, commission_rate, status FROM customers WHERE id = ? LIMIT 1");
                $stmt->execute([$userId]);
                $row = $stmt->fetch(\PDO::FETCH_ASSOC);
                if (!$row) {
                    unset($_SESSION['user'], $_SESSION['user_type']);
                    if (!headers_sent()) {
                        http_response_code(401);
                        header('Content-Type: application/json; charset=utf-8');
                    }
                    echo json_encode([
                        'success' => false,
                        'error'   => 'account_not_found',
                        'message' => 'Account session is no longer valid. Please sign in again.'
                    ]);
                    exit;
                }
                if ($requireActive && strtolower((string)($row['status'] ?? 'active')) !== 'active') {
                    if (!headers_sent()) {
                        http_response_code(403);
                        header('Content-Type: application/json; charset=utf-8');
                    }
                    echo json_encode([
                        'success' => false,
                        'error'   => 'account_inactive',
                        'message' => 'Your account is currently ' . ($row['status'] ?? 'inactive') . '. Contact support to reactivate.'
                    ]);
                    exit;
                }
                $_SESSION['user'] = array_merge($user, [
                    'id'                  => (int)$row['id'],
                    'name'                => (string)$row['name'],
                    'business_name'       => (string)($row['business_name'] ?? ''),
                    'phone'               => (string)$row['phone'],
                    'email'               => (string)($row['email'] ?? ''),
                    'type'                => (string)($row['type'] ?? 'retail'),
                    'city'                => (string)($row['city'] ?? ''),
                    'state'               => (string)($row['state'] ?? ''),
                    'tier'                => (string)($row['tier'] ?? 'Standard'),
                    'gstin'               => (string)($row['gstin'] ?? ''),
                    'gst_verified'        => (bool)($row['gst_verified'] ?? false),
                    'pan'                 => (string)($row['pan'] ?? ''),
                    'kyc_status'          => (string)($row['kyc_status'] ?? 'unverified'),
                    'credit_limit'        => (float)($row['credit_limit'] ?? 0),
                    'outstanding_balance' => (float)($row['outstanding_balance'] ?? 0),
                    'commission_rate'     => (float)($row['commission_rate'] ?? 0),
                    'status'              => (string)($row['status'] ?? 'active'),
                ]);
                $_SESSION['user_type'] = $_SESSION['user']['type'];
                return $_SESSION['user'];
            } catch (\Throwable $e) {
                error_log('dt_api_require_customer DB error: ' . $e->getMessage());
            }
        }

        return $user;
    }
}

if (!function_exists('dt_api_require_role')) {
    /**
     * Enforce that the caller holds one of the allowed B2B/customer roles (or admin if $allowAdmin).
     * Returns authenticated user/admin context array; halts with 401/403 JSON otherwise.
     */
    function dt_api_require_role(array $allowedRoles, string $what = '', bool $allowAdmin = true): array
    {
        if ($allowAdmin && dt_api_is_admin()) {
            return [
                'id'       => (int)($_SESSION['admin_user']['id'] ?? ($_SESSION['admin_user_id'] ?? 0)),
                'type'     => 'admin',
                'is_admin' => true,
            ];
        }

        $user = dt_api_require_customer(true);
        $rawType = strtolower(trim((string)($user['type'] ?? '')));
        $normType = dt_api_normalize_role($rawType);

        $permitted = false;
        foreach ($allowedRoles as $r) {
            $rLow = strtolower(trim((string)$r));
            $rNorm = dt_api_normalize_role($rLow);
            if ($rawType === $rLow || $normType === $rNorm) {
                $permitted = true;
                break;
            }
        }

        if (!$permitted) {
            if (!headers_sent()) {
                http_response_code(403);
                header('Content-Type: application/json; charset=utf-8');
            }
            echo json_encode([
                'success'       => false,
                'error'         => 'forbidden_role',
                'required_role' => array_values($allowedRoles),
                'current_role'  => $rawType,
                'message'       => 'Access restricted' . ($what !== '' ? ' to ' . $what : '') . '. Your account tier (' . $rawType . ') is not authorized for this portal.'
            ]);
            exit;
        }

        $user['is_admin'] = false;
        return $user;
    }
}


