-- Cloudflare D1 (SQLite) Complete Enterprise Schema & Seed Data
-- DT Brand's & Jai Hanuman Tex — Full Platform Relational Schema

CREATE TABLE IF NOT EXISTS app_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- 1. Categories & Subcategories
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    image TEXT DEFAULT '/assets/images/product1.png',
    banner_image TEXT DEFAULT '/assets/images/product2.png',
    subcategories_json TEXT DEFAULT '[]',
    products_count INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subcategories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS brands (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    tagline TEXT DEFAULT '',
    description TEXT DEFAULT '',
    tier TEXT DEFAULT 'Primary Flagship',
    logo_url TEXT DEFAULT '/assets/images/logo.png',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attributes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    type TEXT DEFAULT 'Text Badge / Pill',
    values_json TEXT DEFAULT '[]',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 2. Products, Media & Variants
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    category_id INTEGER DEFAULT 1,
    category_name TEXT NOT NULL,
    subcategory TEXT DEFAULT '',
    fabric TEXT DEFAULT 'Pure Silk',
    weave TEXT DEFAULT 'Handloom Brocade',
    zari_type TEXT DEFAULT 'Tested Gold Zari',
    pallu_style TEXT DEFAULT 'Heavy Rich Zari Pallu',
    blouse_piece TEXT DEFAULT 'Running Blouse Included (0.8m)',
    occasion TEXT DEFAULT 'Bridal & Festive',
    mrp REAL NOT NULL,
    retail_price REAL NOT NULL,
    wholesale_price REAL NOT NULL,
    reseller_price REAL NOT NULL,
    moq_single INTEGER DEFAULT 1,
    moq_half_set INTEGER DEFAULT 4,
    moq_full_set INTEGER DEFAULT 8,
    moq_master_bale INTEGER DEFAULT 24,
    stock_qty INTEGER DEFAULT 50,
    rating REAL DEFAULT 4.9,
    reviews_count INTEGER DEFAULT 120,
    primary_image TEXT NOT NULL,
    gallery_json TEXT DEFAULT '[]',
    colors_json TEXT DEFAULT '[]',
    sizes_json TEXT DEFAULT '[]',
    badge TEXT DEFAULT 'Bestseller',
    selling_type TEXT DEFAULT 'single_piece',
    status TEXT DEFAULT 'in_stock',
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_media (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    is_primary INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_colors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    hex_code TEXT DEFAULT '#8A681F',
    swatch_image TEXT DEFAULT NULL,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS product_sizes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    color_id INTEGER DEFAULT NULL,
    color_name TEXT DEFAULT NULL,
    size_id INTEGER DEFAULT NULL,
    size_name TEXT DEFAULT NULL,
    sku TEXT NOT NULL UNIQUE,
    stock_qty INTEGER DEFAULT 10,
    mrp REAL DEFAULT NULL,
    price REAL DEFAULT NULL,
    retail_price REAL DEFAULT NULL,
    wholesale_price REAL DEFAULT NULL,
    reseller_price REAL DEFAULT NULL,
    image TEXT DEFAULT NULL
);

-- 3. CMS, Marketing, Banners & SEO
CREATE TABLE IF NOT EXISTS banners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    tagline TEXT DEFAULT '',
    badge TEXT DEFAULT '',
    cta_text TEXT DEFAULT 'Shop Wholesale Now',
    cta_link TEXT DEFAULT '/shop',
    image_url TEXT NOT NULL,
    image_mobile_url TEXT DEFAULT '',
    placement TEXT DEFAULT 'hero',
    status TEXT DEFAULT 'active',
    display_order INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT DEFAULT '',
    message TEXT NOT NULL,
    link_url TEXT DEFAULT '/shop',
    bg_color TEXT DEFAULT '#181512',
    text_color TEXT DEFAULT '#FAF5E8',
    placement TEXT DEFAULT 'top_bar',
    status TEXT DEFAULT 'active',
    display_order INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS curated_collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    product_ids_json TEXT DEFAULT '[]',
    image_url TEXT DEFAULT '/assets/images/product1.png',
    status TEXT DEFAULT 'active',
    display_order INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS homepage_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    section_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    subtitle TEXT DEFAULT '',
    display_order INTEGER DEFAULT 1,
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS social_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT DEFAULT 'whatsapp',
    title TEXT NOT NULL,
    handle TEXT DEFAULT '',
    url TEXT NOT NULL,
    display_order INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS cms_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    content TEXT DEFAULT '',
    status TEXT DEFAULT 'published',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS seo_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_route TEXT NOT NULL UNIQUE,
    meta_title TEXT DEFAULT '',
    meta_description TEXT DEFAULT '',
    meta_keywords TEXT DEFAULT '',
    og_title TEXT DEFAULT '',
    og_description TEXT DEFAULT '',
    canonical_url TEXT DEFAULT '',
    og_image TEXT DEFAULT '/assets/images/logo.png'
);

CREATE TABLE IF NOT EXISTS share_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT NOT NULL UNIQUE,
    channel TEXT DEFAULT 'whatsapp',
    title TEXT NOT NULL,
    content_body TEXT NOT NULL,
    status TEXT DEFAULT 'active'
);

-- 4. Customers, Staff Users, Addresses & CRM
CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    business_name TEXT DEFAULT '',
    phone TEXT NOT NULL UNIQUE,
    email TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    type TEXT DEFAULT 'customer',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    tier TEXT DEFAULT 'Standard',
    credit_limit REAL DEFAULT 0,
    outstanding_balance REAL DEFAULT 0,
    total_orders INTEGER DEFAULT 0,
    lifetime_spend REAL DEFAULT 0,
    commission_rate REAL DEFAULT 15,
    gstin TEXT DEFAULT '',
    gst_verified INTEGER DEFAULT 0,
    pan TEXT DEFAULT '',
    kyc_status TEXT DEFAULT 'pending',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    status TEXT DEFAULT 'active',
    last_login TEXT DEFAULT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT DEFAULT '',
    city TEXT NOT NULL,
    state TEXT NOT NULL,
    pincode TEXT NOT NULL,
    address_type TEXT DEFAULT 'home',
    is_default INTEGER DEFAULT 0,
    is_billing_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customer_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    author TEXT DEFAULT 'Admin',
    note TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reseller_customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reseller_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    pincode TEXT DEFAULT '',
    address TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    type TEXT DEFAULT 'credit',
    amount REAL NOT NULL,
    reference TEXT DEFAULT '',
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 5. Cart, Wishlist, Coupons & Reviews
CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    customer_id INTEGER DEFAULT NULL,
    product_id INTEGER NOT NULL,
    variant_id INTEGER DEFAULT NULL,
    color TEXT DEFAULT '',
    size TEXT DEFAULT '',
    lot_type TEXT DEFAULT 'single',
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wishlist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    customer_id INTEGER DEFAULT NULL,
    product_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT DEFAULT '',
    discount_type TEXT DEFAULT 'percentage',
    discount_value REAL NOT NULL,
    min_order_value REAL DEFAULT 0,
    max_discount REAL DEFAULT 0,
    usage_limit INTEGER DEFAULT 1000,
    used_count INTEGER DEFAULT 0,
    channel TEXT DEFAULT 'all',
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS coupon_usages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    coupon_code TEXT NOT NULL,
    order_number TEXT DEFAULT '',
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    order_subtotal REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    rating INTEGER NOT NULL DEFAULT 5,
    review_title TEXT DEFAULT '',
    review_text TEXT NOT NULL,
    admin_reply TEXT DEFAULT '',
    rejection_reason TEXT DEFAULT '',
    verified_buyer INTEGER DEFAULT 1,
    status TEXT DEFAULT 'approved',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 6. Orders, Inventory Ledger & Returns
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL UNIQUE,
    session_id TEXT DEFAULT '',
    customer_id INTEGER DEFAULT 0,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT DEFAULT '',
    shipping_address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    pincode TEXT DEFAULT '',
    channel TEXT DEFAULT 'retail',
    subtotal REAL NOT NULL,
    discount REAL DEFAULT 0,
    gst_amount REAL DEFAULT 0,
    shipping_fee REAL DEFAULT 0,
    total_amount REAL NOT NULL,
    coupon_code TEXT DEFAULT '',
    payment_method TEXT DEFAULT 'upi',
    payment_status TEXT DEFAULT 'pending',
    fulfillment_status TEXT DEFAULT 'processing',
    tracking_number TEXT DEFAULT '',
    courier_name TEXT DEFAULT 'Delhivery Express',
    utr_reference TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    product_title TEXT NOT NULL,
    sku TEXT NOT NULL,
    unit_price REAL NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    total_price REAL NOT NULL,
    image TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS inventory_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    sku TEXT DEFAULT '',
    delta INTEGER NOT NULL,
    previous_qty INTEGER DEFAULT 0,
    new_qty INTEGER DEFAULT 0,
    reason TEXT DEFAULT '',
    reference_id TEXT DEFAULT '',
    operator TEXT DEFAULT 'System',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL,
    customer_phone TEXT DEFAULT '',
    reason TEXT NOT NULL,
    refund_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'requested',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 7. Payments & Shipping
CREATE TABLE IF NOT EXISTS payment_gateways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gateway_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    is_test_mode INTEGER DEFAULT 0,
    is_recommended INTEGER DEFAULT 0,
    config_json TEXT DEFAULT '{}',
    sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER DEFAULT NULL,
    order_number TEXT NOT NULL,
    customer_name TEXT DEFAULT '',
    customer_phone TEXT DEFAULT '',
    gateway TEXT NOT NULL,
    payment_method TEXT DEFAULT 'upi',
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'INR',
    status TEXT DEFAULT 'pending',
    gateway_order_id TEXT DEFAULT '',
    gateway_payment_id TEXT DEFAULT '',
    utr_reference TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    payload_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipping_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    states TEXT DEFAULT '',
    base_rate REAL DEFAULT 99,
    free_above REAL DEFAULT 1999,
    est_days INTEGER DEFAULT 4,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT NOT NULL,
    carrier TEXT DEFAULT 'Delhivery Express',
    awb_number TEXT NOT NULL,
    status TEXT DEFAULT 'manifested',
    tracking_url TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shipping_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    carrier TEXT DEFAULT '',
    awb_number TEXT DEFAULT '',
    order_number TEXT DEFAULT '',
    admin_user TEXT DEFAULT 'System',
    ip_address TEXT DEFAULT '',
    details TEXT DEFAULT '',
    status_code INTEGER DEFAULT 200,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 8. Notifications, Email Outbox, Webhooks, Integrations & Storage
CREATE TABLE IF NOT EXISTS notification_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_key TEXT NOT NULL UNIQUE,
    channel TEXT DEFAULT 'email',
    category TEXT DEFAULT 'order',
    title TEXT NOT NULL,
    subject TEXT DEFAULT '',
    content TEXT NOT NULL,
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS notifications_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel TEXT NOT NULL,
    recipient TEXT NOT NULL,
    template_key TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    content TEXT DEFAULT '',
    provider TEXT DEFAULT 'cloudflare',
    status TEXT DEFAULT 'queued',
    error_message TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS email_outbox (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT NOT NULL,
    from_email TEXT DEFAULT 'noreply@yourdomain.com',
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT DEFAULT '',
    event_type TEXT DEFAULT 'transactional',
    order_number TEXT DEFAULT '',
    provider TEXT DEFAULT 'cloudflare_email',
    status TEXT DEFAULT 'queued',
    provider_message_id TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS webhook_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    event_type TEXT DEFAULT '',
    status_code INTEGER DEFAULT 200,
    verified INTEGER DEFAULT 0,
    payload_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    integration_key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'gateway',
    is_enabled INTEGER DEFAULT 1,
    webhook_url TEXT DEFAULT '',
    config_json TEXT DEFAULT '{}',
    status TEXT DEFAULT 'operational',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    segment TEXT DEFAULT 'all',
    message TEXT NOT NULL,
    recipients_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_key TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    storage_backend TEXT DEFAULT 'cloudflare_kv',
    public_url TEXT NOT NULL,
    uploaded_by TEXT DEFAULT 'admin',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT DEFAULT 'system',
    action TEXT NOT NULL,
    entity_type TEXT DEFAULT '',
    entity_id TEXT DEFAULT '',
    details TEXT DEFAULT '',
    ip_address TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_name TEXT NOT NULL UNIQUE,
    value TEXT DEFAULT '',
    value_text TEXT DEFAULT '',
    category TEXT DEFAULT 'general'
);

CREATE TABLE IF NOT EXISTS feature_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flag_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SEED DATA (Idempotent)
-- ============================================================================

INSERT OR IGNORE INTO categories (id, name, slug, description, image, display_order, status, products_count) VALUES
(1, 'Kanjivaram Silk', 'kanjivaram-silk', 'Authentic handwoven Kanjivaram silk sarees with tested gold zari.', '/assets/images/product1.png', 1, 'active', 120),
(2, 'Banarasi Silk', 'banarasi-silk', 'Varanasi handloom kadwa meenakari pure katan silk sarees.', '/assets/images/product2.png', 2, 'active', 85),
(3, 'Paithani', 'paithani', 'Yeola handloom pure silk sarees with traditional peacock pallu.', '/assets/images/product3.png', 3, 'active', 45),
(4, 'Designer Kurtis', 'designer-kurtis', 'Chanderi silk and georgette Anarkali kurti sets with embroidery.', '/assets/images/product5.png', 4, 'active', 94),
(5, 'Organza Sarees', 'organza-sarees', 'Lightweight pure glass organza sarees with scalloped borders.', '/assets/images/product4.png', 5, 'active', 62),
(6, 'Georgette & Chiffon', 'georgette-chiffon', 'Pure 60-gram georgette sarees with Bandhej dots and gota patti.', '/assets/images/product8.png', 6, 'active', 48),
(7, 'Cotton', 'cotton', 'Airy Bagru hand block printed pure mulmul cotton sarees.', '/assets/images/product7.png', 7, 'active', 60),
(8, 'Saree', 'saree', 'Bridal velvet and raw silk couture lehengas with zardozi embroidery.', '/assets/images/product6.png', 8, 'active', 35);

INSERT OR IGNORE INTO brands (id, name, slug, tagline) VALUES
(1, 'DT Brand''s', 'dt-brands', 'Direct Surat Handloom Luxury'),
(2, 'Jai Hanuman Tex', 'jai-hanuman-tex', 'Wholesale Ethnic Wear Since 2005');

INSERT OR IGNORE INTO attributes (id, name, slug, values_json) VALUES
(1, 'Fabric', 'fabric', '["Pure Mulberry Silk","Katan Brocade Silk","Pure Glass Organza Silk","Chanderi Silk","Mulmul Cotton","60-Gram Viscose Georgette"]'),
(2, 'Occasion', 'occasion', '["Bridal & Festive","Royal Wedding & Reception","Partywear & Festive","Daily Wear & Office"]'),
(3, 'Zari Type', 'zari-type', '["Tested Gold Zari","Antique Gold & Silver Zari","Pure Muga Gold Zari","Gota Patti"]');

INSERT OR IGNORE INTO products (
    id, sku, title, slug, category_id, category_name, subcategory, fabric, weave, zari_type,
    pallu_style, blouse_piece, occasion, mrp, retail_price, wholesale_price, reseller_price,
    moq_single, moq_half_set, moq_full_set, moq_master_bale, stock_qty, rating, reviews_count,
    primary_image, gallery_json, colors_json, sizes_json, badge, selling_type, status, description
) VALUES
(1, 'KLN-SR-111', 'Nilambari Silk Saree with Rich Zari Pallu', 'nilambari-silk-saree-rich-zari-pallu', 1, 'Kanjivaram Silk', 'Bridal Korvai', 'Pure Mulberry Silk', 'Handloom Korvai Weave', 'Tested Gold Zari', 'Rich Temple Brocade Pallu', 'Running Blouse with Zari Border', 'Bridal & Festive', 6500, 4899, 1399, 2100, 1, 4, 8, 24, 95, 4.9, 142, '/assets/images/product1.png', '["/assets/images/product1.png","/assets/images/product1.webp","/assets/images/product2.png"]', '["Royal Blue","Crimson","Emerald Gold"]', '["Free Size (5.5m + 0.8m Blouse)"]', 'Bestseller', 'single_piece', 'in_stock', 'Authentic handwoven Kanjivaram pure silk saree featuring pure tested gold zari pallu and contrast korvai border.'),
(2, 'BNR-SR-204', 'Royal Banarasi Meenakari Silk Saree', 'royal-banarasi-meenakari-silk-saree', 2, 'Banarasi Silk', 'Katan Brocade', 'Katan Brocade Silk', 'Varanasi Kadwa Weave', 'Antique Gold & Silver Zari', 'Intricate Floral Meenakari Pallu', 'Contrast Embroidered Blouse (0.8m)', 'Royal Wedding & Reception', 11000, 8499, 2499, 3800, 1, 4, 8, 24, 60, 4.9, 218, '/assets/images/product2.png', '["/assets/images/product2.png","/assets/images/product2.webp","/assets/images/product1.png"]', '["Maroon Gold","Rani Pink","Peacock Green"]', '["Free Size (5.5m + 0.8m Blouse)"]', 'Exclusive', 'single_piece', 'in_stock', 'Royal Banarasi pure silk saree with handcrafted kadwa meenakari motifs and rich gold zari weave.'),
(3, 'PTH-SR-308', 'Maharani Paithani Pure Silk Saree', 'maharani-paithani-pure-silk-saree', 3, 'Paithani', 'Yeola Handloom', 'Fine Mulberry Silk', 'Yeola Handloom Weave', 'Pure Muga Gold Zari', 'Signature Mor & Asawali Peacock Pallu', 'Matching Silk Blouse Piece', 'Traditional Festive & Wedding', 16500, 12999, 3999, 5800, 1, 4, 8, 24, 40, 5.0, 96, '/assets/images/product3.png', '["/assets/images/product3.png","/assets/images/product3.webp","/assets/images/product2.png"]', '["Peacock Magenta","Kesar Yellow","Emerald"]', '["Free Size (5.5m + 0.8m Blouse)"]', 'Heritage', 'single_piece', 'in_stock', 'Authentic Yeola Paithani pure silk saree with traditional peacock motif pallu and rich zari border.'),
(4, 'ORG-SR-515', 'Pastel Organza Scallop Embroidered Saree', 'pastel-organza-scallop-embroidered-saree', 5, 'Organza Sarees', 'Floral Organza', 'Pure Glass Organza Silk', 'Computerised & Hand Scalloped Embroidery', 'Micro Sequin & Cut-Dana Zari', 'Scalloped Cutwork Fancy Pallu', 'Heavy Designer Net/Silk Blouse (0.8m)', 'Cocktail, Farewell & Reception', 5500, 3999, 1199, 1750, 1, 4, 8, 24, 75, 4.7, 88, '/assets/images/product4.png', '["/assets/images/product4.png","/assets/images/product4.webp"]', '["Blush Peach","Mint Ivory","Lavender"]', '["Free Size (5.5m + 0.8m Blouse)"]', 'New Arrival', 'single_piece', 'in_stock', 'Lightweight pure glass organza saree featuring delicate floral cutwork and scalloped gold borders.'),
(5, 'DKR-KT-412', 'Surat Designer Embroidered Anarkali Kurti', 'surat-designer-embroidered-anarkali-kurti', 4, 'Designer Kurtis', 'Festive Kurti Sets', 'Pure Chanderi Silk & Mulmul Lining', 'Machine & Hand Zardozi Embroidery', 'Gota Patti & Sequin Work', 'Heavy Flared Hemline with Organza Dupatta', 'Stitched Kurti with Pant & Dupatta Set', 'Partywear & Festive', 3999, 2899, 850, 1250, 1, 4, 8, 24, 110, 4.8, 164, '/assets/images/product5.png', '["/assets/images/product5.png","/assets/images/product5.webp"]', '["Wine Velvet","Mustard Gold","Teal"]', '["M","L","XL","XXL"]', 'Trending', 'single_piece', 'in_stock', 'Designer 3-piece Chanderi silk Anarkali Kurti set with intricate gota patti and sequin work.'),
(6, 'KN-LEH-006', 'Velvet Zardozi Bridal Couture Lehenga', 'velvet-zardozi-bridal-couture-lehenga', 8, 'Saree', 'Bridal Couture', 'Micro Velvet & Net Flared Base', 'Dabka, Nakshi & Zardozi Hand Embroidery', 'Pure Gold Bullion Zari & French Knots', 'Double Dupatta Styling Set (Velvet + Net)', 'Fully Hand-Embroidered Velvet Blouse (Unstitched)', 'Bridal Wedding Ceremony', 32000, 24999, 7999, 11500, 1, 4, 8, 24, 25, 5.0, 310, '/assets/images/product6.png', '["/assets/images/product6.png","/assets/images/product6.webp"]', '["Bridal Crimson","Royal Maroon"]', '["Semi-Stitched Free Size (Up to 44 Waist)"]', 'Bridal Couture', 'single_piece', 'in_stock', 'Royal bridal velvet lehenga with over 180 hours of hand-embroidered dabka, nakshi, and zardozi detailing.'),
(7, 'KN-SAR-007', 'Mustard Hand Block Print Mulmul Saree', 'mustard-hand-block-print-mulmul-saree', 7, 'Cotton', 'Mulmul Cotton', '100% Breathable Mulmul Cotton', 'Bagru Dabu Hand Block Printed', 'Zari Weft Temple Border', 'Geometric Artisanal Block Print Pallu with Tassels', 'Printed Mulmul Cotton Blouse Piece', 'Daily Wear, Office & Summer Festive', 2600, 1899, 599, 899, 1, 4, 8, 24, 130, 4.6, 56, '/assets/images/product7.png', '["/assets/images/product7.png","/assets/images/product7.webp"]', '["Mustard Saffron","Indigo","Coral Red"]', '["Free Size (5.5m + 0.8m Blouse)"]', 'Summer Edit', 'single_piece', 'in_stock', 'Airy hand block printed pure mulmul cotton saree using natural vegetable dyes for all-day comfort.'),
(8, 'GGT-SR-620', 'Surat Viscose Georgette Bandhani Saree', 'surat-viscose-georgette-bandhani-saree', 6, 'Georgette & Chiffon', 'Bandhani Georgette', 'Pure 60-Gram Viscose Georgette', 'Kutch Traditional Hand Bandhej & Gota Patti', 'Fine Real Zari Gota Border', 'Rich Heavy Gota Jaal Pallu with Latkan', 'Raw Silk Blouse with Gota Sleeve Work', 'Haldi, Mehendi & Family Functions', 4800, 3499, 1050, 1550, 1, 4, 8, 24, 85, 4.9, 105, '/assets/images/product8.png', '["/assets/images/product8.png","/assets/images/product8.webp"]', '["Haldi Yellow","Rani Pink","Emerald Green"]', '["Free Size (5.5m + 0.8m Blouse)"]', 'Hot Seller', 'single_piece', 'in_stock', 'Pure 60-gram georgette saree crafted with authentic Bandhej dots and shimmering hand-stitched gota patti.');

INSERT OR IGNORE INTO product_colors (id, name, hex_code) VALUES
(1, 'Royal Blue', '#1E3A8A'),
(2, 'Crimson Gold', '#991B1B'),
(3, 'Emerald Silk', '#065F46'),
(4, 'Mustard Saffron', '#D97706'),
(5, 'Peacock Magenta', '#9D174D');

INSERT OR IGNORE INTO product_sizes (id, name, sort_order) VALUES
(1, 'Free Size (5.5m + 0.8m Blouse)', 1),
(2, 'M', 2),
(3, 'L', 3),
(4, 'XL', 4),
(5, 'XXL', 5);

INSERT OR IGNORE INTO banners (id, title, subtitle, tagline, badge, cta_text, cta_link, image_url, display_order) VALUES
(1, 'Festive Pure Silk Collection', 'Direct Surat Manufacturer Wholesale Rates — Pure Silk Sarees from ₹1,399/pc', 'Surat Wholesale Hub', 'Up to 55% Off', 'Explore Wholesale Lots', '/wholesale', '/assets/images/product1.png', 1),
(2, 'Royal Bridal & Wedding Trousseau', 'Handcrafted Kanjivaram & Banarasi Silk Masterpieces with Pure Zari', 'Heritage Silk', 'Exclusive', 'View Wedding Sarees', '/shop', '/assets/images/product2.png', 2);

INSERT OR IGNORE INTO announcements (id, message, link_url, display_order) VALUES
(1, 'Free Pan-India Shipping on Retail Orders Above ₹1,999 — Direct Surat Loom Rates', '/shop', 1);

INSERT OR IGNORE INTO coupons (id, code, title, discount_type, discount_value, min_order_value, max_discount, channel, status) VALUES
(1, 'FESTIVE25', 'Festive Silk Promo', 'percentage', 25, 1999, 1500, 'all', 'active'),
(2, 'VIPRESELLER', 'VIP Dropship Boost', 'percentage', 15, 3000, 2000, 'reseller', 'active'),
(3, 'BULK50', 'Wholesale Depot Incentive', 'percentage', 50, 20000, 10000, 'wholesale', 'active'),
(4, 'WELCOME10', 'Welcome Retail Discount', 'percentage', 10, 1500, 500, 'all', 'active'),
(5, 'DTWHOLESALE', 'Wholesale Tier Promo', 'percentage', 15, 5000, 2000, 'wholesale', 'active'),
(6, 'FLAT500', 'Flat ₹500 Festive Off', 'flat', 500, 2000, 500, 'all', 'active');

INSERT OR IGNORE INTO reviews (id, product_id, customer_name, rating, review_title, review_text, verified_buyer, status) VALUES
(1, 1, 'Meenakshi Iyer (Chennai)', 5, 'Exceptional Pure Silk Quality', 'The zari weave and silk weight are outstanding. Looks exactly like authentic showroom sarees.', 1, 'approved'),
(2, 2, 'Sunita Agarwal (Varanasi)', 5, 'Grand Banarasi Craftsmanship', 'Heavy brocade with pure tested zari pallu. Highly recommended for festive gifting.', 1, 'approved'),
(3, 3, 'Kavita Deshmukh (Pune)', 5, 'Authentic Yeola Paithani Pallu', 'The peacock border and silk sheen exceeded expectations for our bridal trousseau.', 1, 'approved'),
(4, 5, 'Priya Malhotra (Delhi)', 5, 'Beautiful Festive Kurti Set', 'Intricate gota patti work and comfortable lining. Customers loved the finish.', 1, 'approved');

INSERT OR IGNORE INTO orders (id, order_number, customer_id, customer_name, customer_phone, customer_email, shipping_address, city, state, pincode, channel, subtotal, discount, gst_amount, shipping_fee, total_amount, payment_method, payment_status, fulfillment_status, tracking_number, courier_name) VALUES
(1, 'DT-ORD-90281', 101, 'Radhika Sarees Emporium', '9876543210', 'radhika@example.com', 'Ring Road Textile Market', 'Surat', 'Gujarat', '395002', 'wholesale', 44800, 2240, 2128, 0, 44688, 'upi', 'paid', 'dispatched', 'DEL-94028491', 'Delhivery Express'),
(2, 'DT-ORD-89412', 102, 'Pooja Sharma', '9823456789', 'pooja@example.com', 'Johari Bazaar', 'Jaipur', 'Rajasthan', '302003', 'reseller', 8499, 500, 400, 0, 8399, 'upi', 'paid', 'delivered', 'BD-84920194', 'Blue Dart Aviation');

INSERT OR IGNORE INTO order_items (id, order_id, product_id, product_title, sku, unit_price, quantity, total_price, image) VALUES
(1, 1, 1, 'Nilambari Silk Saree with Rich Zari Pallu', 'KLN-SR-111', 1399, 16, 22384, '/assets/images/product1.png'),
(2, 1, 2, 'Royal Banarasi Meenakari Silk Saree', 'BNR-SR-204', 2499, 8, 19992, '/assets/images/product2.png'),
(3, 2, 2, 'Royal Banarasi Meenakari Silk Saree', 'BNR-SR-204', 8499, 1, 8499, '/assets/images/product2.png');

INSERT OR IGNORE INTO payment_gateways (gateway_key, name, description, is_active, is_recommended, sort_order) VALUES
('upi_direct', 'Instant UPI & QR Pay', 'Pay via GPay, PhonePe, Paytm or BHIM (917046363528@okaxis)', 1, 1, 1),
('razorpay', 'Razorpay Online (Cards, UPI, NetBanking)', 'Instant signature-verified online checkout', 1, 0, 2),
('cod', 'Cash on Delivery (COD)', 'Pay via Cash or UPI at doorstep', 1, 0, 3),
('whatsapp_pay', 'WhatsApp Order & Pay', 'Confirm your order directly with Surat concierge', 1, 0, 4);

INSERT OR IGNORE INTO shipping_zones (id, name, states, base_rate, free_above, est_days) VALUES
(1, 'Gujarat Local Hub (Surat)', 'Gujarat', 49, 1499, 2),
(2, 'West & North Express', 'Maharashtra, Rajasthan, Delhi NCR, Madhya Pradesh', 79, 1999, 3),
(3, 'Pan-India National', 'All Other Indian States & UTs', 99, 1999, 5);

INSERT OR IGNORE INTO notification_templates (template_key, channel, category, title, subject, content) VALUES
('order_confirmation', 'email', 'order', 'Order Confirmation Email', 'Order Confirmed: {{order_number}} — DT Brand''s', 'Namaste {{customer_name}}, your order {{order_number}} of ₹{{total_amount}} has been received at our Surat depot.'),
('order_dispatched', 'email', 'shipping', 'Dispatch & AWB Alert', 'Dispatched: {{order_number}} via {{courier_name}}', 'Namaste {{customer_name}}, order {{order_number}} is dispatched. AWB: {{tracking_number}}.'),
('contact_acknowledgement', 'email', 'support', 'Contact Enquiry Received', 'We received your enquiry — DT Brand''s', 'Namaste {{name}}, thank you for contacting our Surat concierge desk.');

INSERT OR IGNORE INTO integrations (integration_key, name, category, is_enabled, webhook_url, status) VALUES
('cloudflare_d1', 'Cloudflare D1 SQL Database', 'database', 1, '/api/db_health.php', 'operational'),
('cloudflare_kv', 'Cloudflare KV Edge Storage', 'storage', 1, '/api/system.php', 'operational'),
('razorpay', 'Razorpay Payment Gateway', 'payment', 1, '/api/webhooks/razorpay.php', 'operational'),
('cashfree', 'Cashfree Payment Gateway', 'payment', 1, '/api/webhooks/cashfree.php', 'operational'),
('delhivery', 'Delhivery Express Logistics', 'shipping', 1, '/api/webhooks/delhivery.php', 'operational'),
('bluedart', 'BlueDart Aviation', 'shipping', 1, '/api/webhooks/bluedart.php', 'operational'),
('whatsapp_cloud', 'Meta WhatsApp Business API', 'messaging', 1, '/api/webhooks/whatsapp.php', 'operational');

INSERT OR IGNORE INTO settings (key_name, value, value_text, category) VALUES
('app_name', 'DT Brand''s & Jai Hanuman Tex', 'DT Brand''s & Jai Hanuman Tex', 'general'),
('store_phone', '+91 70463 63528', '+91 70463 63528', 'general'),
('whatsapp_number', '917046363528', '917046363528', 'general'),
('support_email', 'support@yourdomain.com', 'support@yourdomain.com', 'general'),
('upi_id', '917046363528@okaxis', '917046363528@okaxis', 'payment'),
('upi_merchant_code', '5691', '5691', 'payment'),
('free_shipping_threshold', '1999', '1999', 'shipping'),
('standard_shipping_rate', '99', '99', 'shipping'),
('contact_showroom_address', 'Ring Road Textile Market, Surat, Gujarat 395002', 'Ring Road Textile Market, Surat, Gujarat 395002', 'general'),
('contact_whatsapp_hotline', '+91 70463 63528', '+91 70463 63528', 'general'),
('contact_support_email', 'care@yourdomain.com', 'care@yourdomain.com', 'general');

INSERT OR IGNORE INTO feature_flags (flag_key, label, enabled) VALUES
('b2b_wholesale_portal', 'B2B Wholesale Portal', 1),
('b2b_reseller_portal', 'Reseller Dropship Portal', 1),
('upi_qr_checkout', 'Instant UPI QR Checkout', 1),
('cloud_media_uploads', 'Cloudflare Media Upload Storage', 1),
('transactional_email', 'Transactional Email Outbox', 1);
