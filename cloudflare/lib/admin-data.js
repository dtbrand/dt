/**
 * Live Cloudflare D1 Dashboard & Admin Context Builder.
 * Computes real SQL metrics, sales time series, revenue channel splits,
 * category breakdowns, order streams, product catalogs, and partner lists
 * in the exact shape expected by `admin/index.php`, `admin/assets/js/admin.js`,
 * and `admin/orders/*.php`.
 */

import { getStorageStatus } from './storage.js';
import { safeParseJsonArray } from './utils.js';

function formatDayKey(date) {
    return date.toISOString().slice(0, 10);
}

function formatMonthKey(date) {
    return date.toISOString().slice(0, 7);
}

function buildSalesSeries(orders, range) {
    const isYear = range === '1Y';
    const n = range === '1W' ? 7 : isYear ? 12 : 30;
    const span = n * 2;
    const now = new Date();
    const buckets = new Map();

    for (const o of orders) {
        if ((o.fulfillment_status || 'unfulfilled').toLowerCase() === 'cancelled') continue;
        const dt = new Date(
            String(o.created_at || '').replace(' ', 'T') + (String(o.created_at || '').includes('T') ? '' : 'Z')
        );
        if (Number.isNaN(dt.getTime())) continue;
        const key = isYear ? formatMonthKey(dt) : formatDayKey(dt);
        const prev = buckets.get(key) || { v: 0, c: 0 };
        prev.v += Number(o.total_amount || 0);
        prev.c += 1;
        buckets.set(key, prev);
    }

    const labels = [];
    const current = [];
    const previous = [];
    let total = 0;
    let count = 0;
    let prevTotal = 0;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = span - 1; i >= 0; i--) {
        const d = new Date(now);
        if (isYear) {
            d.setUTCDate(1);
            d.setUTCMonth(d.getUTCMonth() - i);
        } else {
            d.setUTCDate(d.getUTCDate() - i);
        }
        const key = isYear ? formatMonthKey(d) : formatDayKey(d);
        const entry = buckets.get(key) || { v: 0, c: 0 };
        const val = Math.round(entry.v * 100) / 100;

        if (i >= n) {
            previous.push(val);
            prevTotal += val;
        } else {
            labels.push(isYear ? months[d.getUTCMonth()] : String(d.getUTCDate()));
            current.push(val);
            total += val;
            count += entry.c;
        }
    }

    let peak = -1;
    if (total > 0 && current.length > 0) {
        let maxVal = -1;
        current.forEach((v, idx) => {
            if (v > maxVal) {
                maxVal = v;
                peak = idx;
            }
        });
    }

    const growth = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 1000) / 10 : total > 0 ? 100.0 : 0.0;

    return {
        labels,
        current,
        previous,
        total: Math.round(total * 100) / 100,
        count,
        peak,
        growth,
        hasData: total > 0 || prevTotal > 0,
    };
}

export async function buildAdminDashboardPayload(env) {
    const [prodRes, catRes, ordRes, ordItemRes, custRes, revRes, notifFailedRes, mediaCountRes, outboxCountRes] =
        await Promise.all([
            env.DB.prepare('SELECT * FROM products ORDER BY id ASC').all(),
            env.DB.prepare("SELECT * FROM categories WHERE status = 'active' ORDER BY display_order ASC").all(),
            env.DB.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all(),
            env.DB.prepare(
                `SELECT oi.order_id, oi.product_id, oi.product_title, oi.quantity, oi.total_price, p.category_name
             FROM order_items oi LEFT JOIN products p ON p.id = oi.product_id`
            ).all(),
            env.DB.prepare('SELECT * FROM customers ORDER BY id DESC LIMIT 200').all(),
            env.DB.prepare("SELECT COUNT(*) AS cnt FROM reviews WHERE status = 'pending'").first(),
            env.DB.prepare("SELECT COUNT(*) AS cnt FROM notifications_log WHERE status = 'failed'").first(),
            env.DB.prepare('SELECT COUNT(*) AS cnt FROM media_files').first(),
            env.DB.prepare('SELECT COUNT(*) AS cnt FROM email_outbox').first(),
        ]);

    const allProducts = prodRes.results || [];
    const allCategories = catRes.results || [];
    const allOrders = ordRes.results || [];
    const allOrderItems = ordItemRes.results || [];
    const allCustomers = custRes.results || [];

    const nonCancelledOrders = allOrders.filter(
        (o) => (o.fulfillment_status || 'unfulfilled').toLowerCase() !== 'cancelled'
    );

    const totalSales = nonCancelledOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const netRevenue = nonCancelledOrders.reduce(
        (s, o) => s + Math.max(0, Number(o.subtotal || 0) - Number(o.discount || 0)),
        0
    );
    const gstCollected = nonCancelledOrders.reduce((s, o) => s + Number(o.gst_amount || 0), 0);
    const discountGiven = nonCancelledOrders.reduce((s, o) => s + Number(o.discount || 0), 0);

    const pendingPayOrders = allOrders.filter((o) =>
        ['pending', 'credit'].includes((o.payment_status || '').toLowerCase())
    );
    const pendingPayments = pendingPayOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const paidOrdersCount = allOrders.filter((o) => (o.payment_status || '').toLowerCase() === 'paid').length;

    const todayStr = formatDayKey(new Date());
    const todayOrders = allOrders.filter((o) => String(o.created_at || '').startsWith(todayStr));
    const todaySales = todayOrders
        .filter((o) => (o.fulfillment_status || '').toLowerCase() !== 'cancelled')
        .reduce((s, o) => s + Number(o.total_amount || 0), 0);
    const newCustomersToday = allCustomers.filter((c) => String(c.created_at || '').startsWith(todayStr)).length;
    const avgOrderValue =
        nonCancelledOrders.length > 0 ? Math.round((totalSales / nonCancelledOrders.length) * 100) / 100 : 0;

    const totalStockQty = allProducts.reduce((s, p) => s + Number(p.stock_qty || 0), 0);
    const lowStockCount = allProducts.filter((p) => Number(p.stock_qty || 0) <= 10).length;

    const fulfilMap = { unfulfilled: 0, processing: 0, dispatched: 0, delivered: 0, cancelled: 0 };
    for (const o of allOrders) {
        const k = String(o.fulfillment_status || 'unfulfilled').toLowerCase();
        if (Object.prototype.hasOwnProperty.call(fulfilMap, k)) fulfilMap[k] += 1;
    }

    const salesSeries = {
        '1W': buildSalesSeries(allOrders, '1W'),
        '1M': buildSalesSeries(allOrders, '1M'),
        '1Y': buildSalesSeries(allOrders, '1Y'),
    };

    // 7-day B2B vs B2C revenue split
    const revLabels = [];
    const revKeys = [];
    const now = new Date();
    const b2bMap = new Map();
    const b2cMap = new Map();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - i);
        const k = formatDayKey(d);
        revKeys.push(k);
        revLabels.push(String(d.getUTCDate()).padStart(2, '0'));
        b2bMap.set(k, 0);
        b2cMap.set(k, 0);
    }
    for (const o of nonCancelledOrders) {
        const k = String(o.created_at || '').slice(0, 10);
        if (!b2bMap.has(k)) continue;
        if (String(o.channel || '').toLowerCase() === 'wholesale') {
            b2bMap.set(k, b2bMap.get(k) + Number(o.total_amount || 0));
        } else {
            b2cMap.set(k, b2cMap.get(k) + Number(o.total_amount || 0));
        }
    }
    const revB2B = revKeys.map((k) => Math.round(b2bMap.get(k) * 100) / 100);
    const revB2C = revKeys.map((k) => Math.round(b2cMap.get(k) * 100) / 100);
    const revB2BTotal = revB2B.reduce((a, b) => a + b, 0);
    const revB2CTotal = revB2C.reduce((a, b) => a + b, 0);

    // Category breakdown
    const cancelledOrderIds = new Set(
        allOrders.filter((o) => (o.fulfillment_status || '').toLowerCase() === 'cancelled').map((o) => Number(o.id))
    );
    const catSalesMap = new Map();
    for (const oi of allOrderItems) {
        if (cancelledOrderIds.has(Number(oi.order_id))) continue;
        const name = String(oi.category_name || 'Uncategorised').trim() || 'Uncategorised';
        const prev = catSalesMap.get(name) || { value: 0, units: 0 };
        prev.value += Number(oi.total_price || 0);
        prev.units += Number(oi.quantity || 0);
        catSalesMap.set(name, prev);
    }
    let catMode = 'sales';
    let catItems = [];
    const catSalesTotal = Array.from(catSalesMap.values()).reduce((s, x) => s + x.value, 0);
    if (catSalesTotal > 0) {
        catItems = Array.from(catSalesMap.entries())
            .sort((a, b) => b[1].value - a[1].value)
            .slice(0, 6)
            .map(([name, st]) => ({
                name,
                value: Math.round(st.value * 100) / 100,
                units: st.units,
                pct: Math.round((st.value / catSalesTotal) * 1000) / 10,
            }));
    } else {
        catMode = 'catalogue';
        const catCounts = new Map();
        for (const p of allProducts) {
            const name = String(p.category_name || 'Uncategorised').trim() || 'Uncategorised';
            catCounts.set(name, (catCounts.get(name) || 0) + 1);
        }
        const tot = allProducts.length || 1;
        catItems = Array.from(catCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([name, units]) => ({
                name,
                value: 0,
                units,
                pct: Math.round((units / tot) * 1000) / 10,
            }));
    }

    const mappedOrders = allOrders.slice(0, 50).map((o) => {
        const itemsForOrd = allOrderItems.filter((oi) => Number(oi.order_id) === Number(o.id));
        const summaryLabel =
            itemsForOrd.length > 0
                ? `${itemsForOrd[0].product_title} (${itemsForOrd.reduce((s, i) => s + Number(i.quantity || 0), 0)} pcs)`
                : 'Order Items';
        return {
            id: String(o.order_number || `ORD-${o.id}`),
            db_id: Number(o.id),
            date: String(o.created_at || ''),
            customer: String(o.customer_name || 'Customer'),
            phone: String(o.customer_phone || ''),
            city: [o.city, o.state].filter(Boolean).join(', '),
            channel: String(o.channel || 'retail'),
            items: summaryLabel,
            total: Number(o.total_amount || 0),
            payment: String(o.payment_method || 'UPI').toUpperCase(),
            payment_status: String(o.payment_status || 'pending'),
            status: String(o.fulfillment_status || 'processing'),
            tracking: String(o.tracking_number || '-'),
        };
    });

    const mappedProducts = allProducts.slice(0, 50).map((p) => ({
        id: Number(p.id),
        sku: String(p.sku || ''),
        hsn: String(p.hsn_code || '5007'),
        name: String(p.title || ''),
        category: String(p.category_name || 'Sarees'),
        retail_price: Number(p.retail_price || 0),
        wholesale_price: Number(p.wholesale_price || 0),
        reseller_price: Number(p.reseller_price || 0),
        moq: Number(p.moq_full_set || p.moq_half_set || 4),
        stock: Number(p.stock_qty || 0),
        image: String(p.primary_image || '/assets/images/product1.png'),
        badge: String(p.badge || ''),
        fabric: String(p.fabric || ''),
        status: Number(p.stock_qty || 0) > 0 ? 'In Stock' : 'Out of Stock',
    }));

    const mappedPartners = allCustomers.slice(0, 50).map((c) => ({
        id: `CUST-${c.id}`,
        db_id: Number(c.id),
        name: String(c.name || ''),
        phone: String(c.phone || ''),
        type: String(c.type || 'customer'),
        tier: String(c.tier || 'Standard'),
        gst: String(c.gstin || 'Unregistered'),
        orders_count: 0,
        total_spend: '₹0',
        city: [c.city, c.state].filter(Boolean).join(', '),
        kyc: String(c.status || 'active') === 'active' ? 'Verified' : String(c.status || 'pending'),
    }));

    const wholesaleCount = allCustomers.filter((c) => c.type === 'wholesale' || c.type === 'wholesaler').length;
    const resellerCount = allCustomers.filter((c) => c.type === 'reseller').length;
    const pendingTradeCount = allCustomers.filter((c) => c.status === 'pending').length;

    return {
        hasOrders: nonCancelledOrders.length > 0,
        gauge: {
            value: totalStockQty,
            target: Math.max(500, totalStockQty),
        },
        sales: salesSeries,
        revenue: {
            labels: revLabels,
            b2b: revB2B,
            b2c: revB2C,
            b2bTotal: Math.round(revB2BTotal * 100) / 100,
            b2cTotal: Math.round(revB2CTotal * 100) / 100,
            total: Math.round((revB2BTotal + revB2CTotal) * 100) / 100,
            growth: 0,
            range: `${revKeys[0]} – ${revKeys[revKeys.length - 1]}`,
        },
        categories: {
            mode: catMode,
            items: catItems,
        },
        orders: mappedOrders,
        products: mappedProducts,
        partners: mappedPartners,
        kpis: {
            total_sales: Math.round(totalSales * 100) / 100,
            net_revenue: Math.round(netRevenue * 100) / 100,
            gst_collected: Math.round(gstCollected * 100) / 100,
            discount_given: Math.round(discountGiven * 100) / 100,
            pending_payments: Math.round(pendingPayments * 100) / 100,
            pending_pay_count: pendingPayOrders.length,
            paid_orders_count: paidOrdersCount,
            today_sales: Math.round(todaySales * 100) / 100,
            live_orders_today: todayOrders.length,
            new_customers_today: newCustomersToday,
            avg_order_value: avgOrderValue,
            total_orders: allOrders.length,
            total_products: allProducts.length,
            total_categories: allCategories.length,
            total_customers: allCustomers.length,
            total_stock_qty: totalStockQty,
            low_stock_count: lowStockCount,
            fulfillment: fulfilMap,
        },
        sidebar_counts: {
            products: allProducts.length,
            categories: allCategories.length,
            orders: allOrders.length,
            wholesale: wholesaleCount,
            resellers: resellerCount,
            customers: allCustomers.length,
            pending_trade: pendingTradeCount,
            reviews_pending: Number(revRes?.cnt || 0),
            notifications_failed: Number(notifFailedRes?.cnt || 0),
            media_files: Number(mediaCountRes?.cnt || 0),
            email_outbox: Number(outboxCountRes?.cnt || 0),
        },
        services: getStorageStatus(env),
        categories_list: allCategories.map((c) => ({
            id: Number(c.id),
            name: c.name,
            slug: c.slug,
            description: c.description || '',
            image: c.image || '/assets/images/product1.png',
            products_count: Number(c.products_count || 0),
        })),
        subcategories_list: allCategories.flatMap((c) =>
            safeParseJsonArray(c.subcategories_json, []).map((s) => ({ category: c.name, name: s }))
        ),
    };
}
