-- Cloudflare D1 (SQLite) schema & seed data for DT Brand's Storefront

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    image TEXT DEFAULT '/assets/images/product1.png',
    banner_image TEXT DEFAULT '/assets/images/product2.png',
    products_count INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 1,
    status TEXT DEFAULT 'active',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS coupons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    title TEXT DEFAULT '',
    discount_type TEXT DEFAULT 'percentage',
    discount_value REAL NOT NULL,
    min_order_value REAL DEFAULT 0,
    max_discount REAL DEFAULT 0,
    channel TEXT DEFAULT 'all',
    status TEXT DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL DEFAULT 5,
    review_title TEXT DEFAULT '',
    review_text TEXT NOT NULL,
    verified_buyer INTEGER DEFAULT 1,
    status TEXT DEFAULT 'approved',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    email TEXT DEFAULT '',
    password_hash TEXT NOT NULL,
    type TEXT DEFAULT 'customer',
    city TEXT DEFAULT '',
    state TEXT DEFAULT '',
    gstin TEXT DEFAULT '',
    pan TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    customer_id INTEGER DEFAULT NULL,
    product_id INTEGER NOT NULL,
    color TEXT DEFAULT '',
    size TEXT DEFAULT '',
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

CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    email TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    message TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO categories (id, name, slug, description, image, display_order, status, products_count) VALUES
(1, 'Kanjivaram Silk', 'kanjivaram-silk', 'Authentic handwoven Kanjivaram silk sarees with tested gold zari.', '/assets/images/product1.png', 1, 'active', 120),
(2, 'Banarasi Silk', 'banarasi-silk', 'Varanasi handloom kadwa meenakari pure katan silk sarees.', '/assets/images/product2.png', 2, 'active', 85),
(3, 'Paithani', 'paithani', 'Yeola handloom pure silk sarees with traditional peacock pallu.', '/assets/images/product3.png', 3, 'active', 45),
(4, 'Designer Kurtis', 'designer-kurtis', 'Chanderi silk and georgette Anarkali kurti sets with embroidery.', '/assets/images/product5.png', 4, 'active', 94),
(5, 'Organza Sarees', 'organza-sarees', 'Lightweight pure glass organza sarees with scalloped borders.', '/assets/images/product4.png', 5, 'active', 62),
(6, 'Georgette & Chiffon', 'georgette-chiffon', 'Pure 60-gram georgette sarees with Bandhej dots and gota patti.', '/assets/images/product8.png', 6, 'active', 48),
(7, 'Cotton', 'cotton', 'Airy Bagru hand block printed pure mulmul cotton sarees.', '/assets/images/product7.png', 7, 'active', 60),
(8, 'Saree', 'saree', 'Bridal velvet and raw silk couture lehengas with zardozi embroidery.', '/assets/images/product6.png', 8, 'active', 35);

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

INSERT OR IGNORE INTO coupons (id, code, title, discount_type, discount_value, min_order_value, max_discount, channel, status) VALUES
(1, 'FESTIVE25', 'Festive Silk Promo', 'percentage', 25, 1999, 1500, 'all', 'active'),
(2, 'VIPRESELLER', 'VIP Dropship Boost', 'percentage', 15, 3000, 2000, 'reseller', 'active'),
(3, 'BULK50', 'Wholesale Depot Incentive', 'percentage', 50, 20000, 10000, 'wholesale', 'active');

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
