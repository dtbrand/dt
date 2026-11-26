import urllib.request
import json
import ssl
import sys

sys.stdout.reconfigure(line_buffering=True)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

urls = [
    ('https://yourdomain.com/wholesale.php', 200, 'html'),
    ('https://yourdomain.com/retailer.php', 200, 'html'),
    ('https://yourdomain.com/reseller.php', 200, 'html'),
    ('https://yourdomain.com/api/wholesale.php?action=get_dashboard', 200, 'json'),
    ('https://yourdomain.com/api/wholesale.php?action=get_orders', 200, 'json'),
    ('https://yourdomain.com/api/retailer.php?action=get_dashboard', 200, 'json'),
    ('https://yourdomain.com/api/retailer.php?action=get_orders', 200, 'json'),
    ('https://yourdomain.com/api/reseller.php?action=get_dashboard', 200, 'json'),
    ('https://yourdomain.com/api/reseller.php?action=get_orders', 200, 'json'),
    ('https://yourdomain.com/admin/login.php', 200, 'html'),
    ('https://yourdomain.com/admin/orders/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/orders/pending.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/orders/shipped.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/orders/ledger.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/tracking.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/rates.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/methods.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/payments/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/payments/pending.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/gst.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/revenue.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/sales.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/view.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/retailers.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/resellers.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/wholesalers.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/pending.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/stock-in.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/stock-out.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/adjustment.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/low-stock.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/ledger.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/export.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/api/brands.php', 200, 'json'),
    ('https://yourdomain.com/admin/products/attributes/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/api/attributes.php', 200, 'json'),
    ('https://yourdomain.com/api/shipping.php?action=get_rates', 200, 'json'),
    ('https://yourdomain.com/shop.php', 200, 'html'),
    ('https://yourdomain.com/product.php?id=13', 200, 'html'),
    ('https://yourdomain.com/api/products.php', 200, 'json'),
    ('https://yourdomain.com/api/cart.php', 200, 'json'),
    ('https://yourdomain.com/api/wishlist.php', 200, 'json'),
    ('https://yourdomain.com/wholesale.php', 200, 'html'),
    ('https://yourdomain.com/retailer.php', 200, 'html'),
    ('https://yourdomain.com/reseller.php', 200, 'html'),
    ('https://yourdomain.com/api/wholesale.php?action=get_dashboard', 200, 'json'),
    ('https://yourdomain.com/api/wholesale.php?action=get_orders', 200, 'json'),
    ('https://yourdomain.com/api/retailer.php?action=get_dashboard', 200, 'json'),
    ('https://yourdomain.com/api/retailer.php?action=get_orders', 200, 'json'),
    ('https://yourdomain.com/api/reseller.php?action=get_dashboard', 200, 'json'),
    ('https://yourdomain.com/api/reseller.php?action=get_orders', 200, 'json'),
    ('https://yourdomain.com/admin/login.php', 200, 'html'),
    ('https://yourdomain.com/admin/orders/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/orders/pending.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/orders/shipped.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/orders/ledger.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/view.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/retailers.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/resellers.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/wholesalers.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/customers/pending.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/stock-in.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/stock-out.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/adjustment.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/low-stock.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/ledger.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/inventory/export.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/tracking.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/rates.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/shipping/methods.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/payments/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/payments/pending.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/gst.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/revenue.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/reports/sales.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/attributes/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/api/attributes.php', 200, 'json'),
    ('https://yourdomain.com/api/brands.php', 200, 'json'),
    ('https://yourdomain.com/api/shipping.php?action=get_rates', 200, 'json'),
    ('https://yourdomain.com/shop.php', 200, 'html'),
    ('https://yourdomain.com/product.php?id=13', 200, 'html'),
    ('https://yourdomain.com/api/products.php', 200, 'json'),
    ('https://yourdomain.com/api/cart.php', 200, 'json'),
    ('https://yourdomain.com/api/wishlist.php', 200, 'json'),
    ('https://yourdomain.com/admin/developer/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/api-registry.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/api-health.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/webhooks.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/queue.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/routes.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/migrations.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/diagnostics.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/api-registry.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/api-health.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/webhooks.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/queue.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/routes.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/migrations.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/developer/diagnostics.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/health.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/settings.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/environment.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/database.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/migrations.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/cache.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/storage.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/logs.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/cron.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/maintenance.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/feature-flags.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/backups.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/broadcast.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/leads.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/templates.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/api/whatsapp.php?action=get_info', 200, 'json'),
    ('https://yourdomain.com/api/whatsapp.php?action=test_ping', 200, 'json'),
    ('https://yourdomain.com/admin/system/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/health.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/settings.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/environment.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/database.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/migrations.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/cache.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/storage.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/logs.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/cron.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/maintenance.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/feature-flags.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/system/backups.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/broadcast.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/leads.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/whatsapp/templates.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/api/whatsapp.php?action=get_info', 200, 'json'),
    ('https://yourdomain.com/api/whatsapp.php?action=test_ping', 200, 'json'),
    ('https://yourdomain.com/admin/products/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/add.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/categories/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/brands/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/reviews/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/notifications/whatsapp.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/add.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/categories/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/brands/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/products/reviews/index.php', 200, 'redirect_ok'),
    ('https://yourdomain.com/admin/notifications/whatsapp.php', 200, 'redirect_ok'),
]


print('=== VERIFYING LIVE ENDPOINTS ON PRODUCTION SERVERS ===')
all_ok = True
for u, expected_code, check_type in urls:
    success = False
    for attempt in range(2):
        try:
            req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req, context=ctx, timeout=25) as resp:
                content = resp.read().decode('utf-8', errors='ignore')
                status = resp.status
                if check_type == 'json':
                    data = json.loads(content)
                    is_success = data.get('success', False)
                    print(f"[{status}] {u} -> success: {is_success}, keys: {list(data.keys())[:3]}")
                    if is_success:
                        success = True
                    else:
                        all_ok = False
                elif check_type == 'redirect_ok':
                    final_url = resp.geturl()
                    has_error = 'Fatal error' in content or 'Parse error' in content
                    print(f"[{status}] {u} -> Final: {final_url} (Error: {has_error})")
                    if not has_error and status == 200:
                        success = True
                    else:
                        all_ok = False
                else:
                    has_error = 'Fatal error' in content or 'Parse error' in content
                    print(f"[{status}] {u} -> Error: {has_error}, HTML length: {len(content)} bytes")
                    if not has_error and status == 200:
                        success = True
                    else:
                        all_ok = False
                break
        except Exception as e:
            if attempt == 0:
                import time
                time.sleep(1)
                continue
            print(f"[FAIL] {u}: {e}")
            all_ok = False

if all_ok:
    print('\n*** ALL PRODUCTION ENDPOINTS VERIFIED AND RESPONDING 200 OK! ***')
else:
    print('\n*** Some endpoints had issues. Review output above. ***')
