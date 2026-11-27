-- ============================================================================
-- Migration: 2026_09_16_000001_schema_sync_variants_sizes_and_content.sql
-- Purpose:   Sync live MariaDB schema with PHP manager classes, align categories
--            & products, seed size/color palettes & product_variants matrix,
--            and restore missing seed content across users, reviews, collections,
--            and share templates.
-- ============================================================================

-- 1. Orders schema parity (fulfillment statuses, payment_status failed, awb_number)
ALTER TABLE `orders`
    MODIFY COLUMN `fulfillment_status` ENUM(
        'pending', 'confirmed', 'unfulfilled', 'processing', 'packed',
        'dispatched', 'shipped', 'out_for_delivery', 'delivered',
        'cancelled', 'returned', 'refunded'
    ) NULL DEFAULT 'processing';

ALTER TABLE `orders`
    MODIFY COLUMN `payment_status` ENUM('pending', 'paid', 'failed', 'credit', 'refunded') NULL DEFAULT 'pending';

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='awb_number');
SET @_s = IF(@_x=0, 'ALTER TABLE `orders` ADD COLUMN `awb_number` VARCHAR(100) NULL DEFAULT NULL AFTER `tracking_number`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

-- 2. Reviews schema parity + clean 7-status seed roster + product coverage
ALTER TABLE `reviews`
    MODIFY COLUMN `status` ENUM('approved', 'pending', 'rejected', 'flagged') NULL DEFAULT 'approved';

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reviews' AND COLUMN_NAME='updated_at');
SET @_s = IF(@_x=0, 'ALTER TABLE `reviews` ADD COLUMN `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

INSERT INTO `reviews` (
    `id`, `product_id`, `customer_id`, `customer_name`, `customer_email`, `customer_phone`, `city`,
    `rating`, `review_title`, `review_text`, `images_json`, `verified_buyer`, `status`,
    `store_reply`, `store_replied_at`, `store_replied_by`, `moderated_by`, `moderated_at`, `moderation_notes`, `flag_reason`, `created_at`
) VALUES
(1, 1, 101, 'Priya Sharma', 'priya.sharma@example.com', '+91 98201 12345', 'Mumbai, MH', 5,
 'Breathtaking Pure Zari & Luster',
 'The fabric quality and real zari weave is breathtaking! Arrived in luxury royal gift packaging within 3 days to Mumbai.',
 '[]', 1, 'approved',
 'Thank you so much Priya ji! We take immense pride in our authentic master looms.', NOW(), 'Master Concierge',
 'admin', NOW(), 'Authentic verified buyer review', NULL, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(2, 2, 102, 'Deepak Singhal', 'deepak.s@boutique.in', '+91 98110 54321', 'Delhi NCR', 5,
 'Excellent Bulk Lot Packaging',
 'Quality verified by our boutique master in Surat. Zari luster is pure gold and warp tension is flawless.',
 '[]', 1, 'approved', NULL, NULL, NULL,
 'admin', NOW(), 'B2B boutique verified buyer', NULL, DATE_SUB(NOW(), INTERVAL 3 DAY)),
(3, 3, 103, 'Ananya Mehta', 'ananya.mehta@gmail.com', '+91 97234 98765', 'Surat, Gujarat', 5,
 'Pure, Royal & Lightweight',
 'The silk drape feels extremely luxurious, pure, and lightweight. WhatsApp concierge was very helpful with live video call inspection.',
 '[]', 1, 'approved',
 'Glad to hear that Ananya ji! Enjoy your celebrations.', NOW(), 'Admin',
 'admin', NOW(), 'Approved after concierge match', NULL, DATE_SUB(NOW(), INTERVAL 4 DAY)),
(4, 5, 101, 'Kavita Patel', 'kavita.p@london.co.uk', '+44 7700 900123', 'London, UK', 5,
 'Pure Bridal Glory',
 'Ordered from London with international DHL shipping. Reached in 5 days in pristine royal condition! Everyone admired the zari work.',
 '[]', 1, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(5, 4, 102, 'Sunita Roy', 'sunita.roy@kolkata.org', '+91 98300 45678', 'Kolkata, WB', 4,
 'Good Weave Quality',
 'The kurti border detailing is very heavy and rich. Delivery took 4 days and the chanderi silk finish is undeniably authentic.',
 '[]', 1, 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(6, 1, NULL, 'Spam Bot 99', 'bot@spammer.fake', '0000000000', 'Unknown', 1,
 'Cheap prices at external site',
 'Visit discount-sarees-cheap.xyz for deals.',
 '[]', 0, 'rejected', NULL, NULL, NULL,
 'admin', NOW(), 'Automated spam rejection - external URL detected', 'Spam & external links', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(7, 6, 103, 'Vikram Joshi', 'vikram.j@pune.co', '+91 94220 11223', 'Pune, MH', 2,
 'Color shade variance query',
 'The color appears slightly deeper than seen on my mobile display. Requesting exchange for bright shade.',
 '[]', 1, 'flagged', NULL, NULL, NULL,
 'admin', NOW(), 'Hold for WhatsApp customer support resolution before public publishing', 'Customer support exchange ticket pending', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(8, 4, 103, 'Meera Kulkarni', 'meera.k@example.in', '+91 98450 22334', 'Pune, MH', 5,
 'Graceful Chanderi Festive Fit',
 'Ordered M size and the tailoring, dupatta border, and foil work exceeded expectations for Diwali puja.',
 '[]', 1, 'approved', 'Thank you Meera ji! Delightful to dress your festive celebration.', NOW(), 'Master Concierge',
 'admin', NOW(), 'Verified retail review', NULL, DATE_SUB(NOW(), INTERVAL 6 DAY)),
(9, 5, 101, 'Rhea Kapoor', 'rhea.kapoor@example.in', '+91 98200 77889', 'New Delhi', 5,
 'Showstopper Bridal Lehenga',
 'The velvet zardozi skirt flare and heavy bridal border look couture-grade. Worth every rupee.',
 '[]', 1, 'approved', 'Wishing you a blissful wedding celebration!', NOW(), 'Master Concierge',
 'admin', NOW(), 'Verified bridal boutique review', NULL, DATE_SUB(NOW(), INTERVAL 7 DAY)),
(10, 6, 102, 'Nandini Gupta', 'nandini.g@example.in', '+91 99100 33445', 'Jaipur, RJ', 5,
 'Featherlight Organza Zari Drape',
 'Translucent glass organza with floral zari shimmer sits so cleanly without bulk.',
 '[]', 1, 'approved', NULL, NULL, NULL,
 'admin', NOW(), 'Verified buyer', NULL, DATE_SUB(NOW(), INTERVAL 8 DAY))
ON DUPLICATE KEY UPDATE
    `customer_name` = VALUES(`customer_name`),
    `rating` = VALUES(`rating`),
    `review_title` = VALUES(`review_title`),
    `review_text` = VALUES(`review_text`),
    `status` = VALUES(`status`),
    `store_reply` = VALUES(`store_reply`),
    `store_replied_by` = VALUES(`store_replied_by`),
    `flag_reason` = VALUES(`flag_reason`);

-- 3. Marketing Content tables parity (`banners`, `announcements`, `seo_metadata`, `share_templates`, `curated_collections`)
SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='banners' AND COLUMN_NAME='placement');
SET @_s = IF(@_x=0, "ALTER TABLE `banners` ADD COLUMN `placement` VARCHAR(50) NULL DEFAULT 'hero_slider' AFTER `banner_type`", 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='banners' AND COLUMN_NAME='image');
SET @_s = IF(@_x=0, "ALTER TABLE `banners` ADD COLUMN `image` VARCHAR(255) NULL DEFAULT '' AFTER `cta_link`", 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='banners' AND COLUMN_NAME='cta_url');
SET @_s = IF(@_x=0, "ALTER TABLE `banners` ADD COLUMN `cta_url` VARCHAR(255) NULL DEFAULT '/shop.php' AFTER `cta_link`", 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='banners' AND COLUMN_NAME='created_at');
SET @_s = IF(@_x=0, 'ALTER TABLE `banners` ADD COLUMN `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='banners' AND COLUMN_NAME='updated_at');
SET @_s = IF(@_x=0, 'ALTER TABLE `banners` ADD COLUMN `updated_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

ALTER TABLE `banners` MODIFY COLUMN `image_url` VARCHAR(255) NOT NULL DEFAULT '';
UPDATE `banners` SET `placement` = COALESCE(`placement`, `banner_type`), `image` = `image_url`, `cta_url` = COALESCE(`cta_link`, '/shop.php');

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='announcements' AND COLUMN_NAME='title');
SET @_s = IF(@_x=0, "ALTER TABLE `announcements` ADD COLUMN `title` VARCHAR(150) NULL DEFAULT '' AFTER `id`", 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='announcements' AND COLUMN_NAME='placement');
SET @_s = IF(@_x=0, "ALTER TABLE `announcements` ADD COLUMN `placement` VARCHAR(50) NULL DEFAULT 'topbar' AFTER `link_url`", 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

UPDATE `announcements` SET `title` = COALESCE(NULLIF(`title`, ''), 'Surat Mill Alert'), `placement` = COALESCE(NULLIF(`placement`, ''), 'topbar');

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seo_metadata' AND COLUMN_NAME='og_title');
SET @_s = IF(@_x=0, 'ALTER TABLE `seo_metadata` ADD COLUMN `og_title` VARCHAR(255) NULL DEFAULT NULL AFTER `meta_keywords`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='seo_metadata' AND COLUMN_NAME='og_description');
SET @_s = IF(@_x=0, 'ALTER TABLE `seo_metadata` ADD COLUMN `og_description` TEXT NULL AFTER `og_title`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

INSERT INTO `seo_metadata` (`page_route`, `meta_title`, `meta_description`, `meta_keywords`, `og_title`, `og_description`, `og_image`, `canonical_url`)
VALUES (
    '/',
    "DT Brand's & Jai Hanuman Tex — Premier Surat Sarees Wholesale & Reseller HUB",
    'Direct from Surat weaving mill. Premium designer sarees, wedding silks, georgette, and cotton at direct wholesale mill prices.',
    'surat sarees wholesale, b2b saree manufacturer, jai hanuman tex, dt brands, reseller sarees',
    "DT Brand's & Jai Hanuman Tex — Premier Surat Sarees Wholesale",
    'Direct from Surat weaving mill. Premium designer sarees, wedding silks, georgette, and cotton at direct factory pricing.',
    '/assets/images/logo.png',
    'https://yourdomain.com/'
) ON DUPLICATE KEY UPDATE
    `meta_title` = VALUES(`meta_title`),
    `og_title` = COALESCE(`og_title`, VALUES(`og_title`)),
    `og_description` = COALESCE(`og_description`, VALUES(`og_description`));

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='share_templates' AND COLUMN_NAME='template_key');
SET @_s = IF(@_x=0, 'ALTER TABLE `share_templates` ADD COLUMN `template_key` VARCHAR(100) NULL DEFAULT NULL AFTER `id`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='share_templates' AND COLUMN_NAME='created_at');
SET @_s = IF(@_x=0, 'ALTER TABLE `share_templates` ADD COLUMN `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP AFTER `updated_at`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

UPDATE `share_templates` SET `template_key` = 'reseller_product_card' WHERE `channel` = 'whatsapp' AND (`template_key` IS NULL OR `template_key` = '');
UPDATE `share_templates` SET `template_key` = 'reseller_margin_share' WHERE `channel` = 'reseller' AND (`template_key` IS NULL OR `template_key` = '');

INSERT IGNORE INTO `curated_collections` (`id`, `title`, `slug`, `tagline`, `image_url`, `badge`, `display_order`, `is_active`, `product_ids_json`) VALUES
(1, 'Surat Wedding Silks', 'surat-wedding-silks', 'Zari woven bridal & heirloom silk sarees from master looms', '/assets/images/product1.png', 'BRIDAL', 1, 1, '[1,2,3]'),
(2, 'Festive Kurtis & Organza', 'festive-kurtis-organza', 'Lightweight tissue organza & Chanderi festive 3-piece sets', '/assets/images/product4.png', 'TRENDING', 2, 1, '[4,6]'),
(3, 'Bridal Lehengas & Evening Gowns', 'bridal-lehengas-gowns', 'Handcrafted zardozi lehengas and cocktail reception silhouettes', '/assets/images/product5.png', 'COUTURE', 3, 1, '[5,7,8]');

-- 4. Admin Users, Roles & Active Sessions
ALTER TABLE `users`
    MODIFY COLUMN `role` ENUM('super_admin', 'admin', 'manager', 'catalog_staff', 'support_staff', 'staff') NULL DEFAULT 'admin';

INSERT INTO `users` (`id`, `name`, `username`, `email`, `phone`, `password_hash`, `role`, `status`, `last_login`, `created_at`) VALUES
(1, 'DT Brand Super Admin', 'superadmin', 'admin@dtbrand.in', '+91 88906 39215', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'super_admin', 'active', NOW(), '2026-01-01 00:00:00'),
(2, 'Surat Operations Dispatch', 'dispatch', 'dispatch@dtbrand.in', '+91 70463 63528', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'manager', 'active', DATE_SUB(NOW(), INTERVAL 1 HOUR), '2026-02-01 09:00:00'),
(3, 'Textile Catalog Merchandiser', 'catalog', 'catalog@dtbrand.in', '+91 98251 44021', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'catalog_staff', 'active', DATE_SUB(NOW(), INTERVAL 6 HOUR), '2026-03-01 10:00:00'),
(4, 'B2B Concierge Support', 'support', 'support@dtbrand.in', '+91 98252 66110', '$2y$10$TKh8H1.PfQx37YgCzwiKb.KjNyWgaHb9cbcoQgdIVFlYg7B77UdFm', 'support_staff', 'active', DATE_SUB(NOW(), INTERVAL 12 HOUR), '2026-03-15 11:00:00')
ON DUPLICATE KEY UPDATE
    `name` = VALUES(`name`),
    `role` = VALUES(`role`),
    `status` = 'active';

INSERT INTO `admin_sessions` (`session_id`, `user_id`, `user_name`, `role`, `ip_address`, `user_agent`, `device_type`, `location`, `status`, `last_activity`) VALUES
('sess_dtbrand_super_admin_01', 1, 'DT Brand Super Admin', 'super_admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0', 'desktop', 'Surat, Gujarat, IN', 'active', NOW()),
('sess_dtbrand_ops_mobile_02', 2, 'Surat Operations Dispatch', 'manager', '103.241.226.11', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Mobile/15E148', 'mobile', 'Surat, Gujarat, IN', 'active', DATE_SUB(NOW(), INTERVAL 10 MINUTE))
ON DUPLICATE KEY UPDATE
    `status` = 'active',
    `last_activity` = NOW();

-- 5. Align Category Slugs, Product Categories/Subcategories, & Complete 8-Product Showcase
UPDATE `categories` SET `banner_image` = CONCAT('/assets/images/product', ((`id` - 1) % 8) + 1, '.png') WHERE `banner_image` LIKE '%hero-banner.png%';
UPDATE `categories` SET `slug` = 'saree' WHERE `id` = 1;
UPDATE `categories` SET `slug` = 'lehenga' WHERE `id` = 2;
UPDATE `categories` SET `slug` = 'gown' WHERE `id` = 3;
UPDATE `categories` SET `slug` = 'kurti' WHERE `id` = 4;

UPDATE `products` SET
    `category_id` = 1, `category_name` = 'Saree', `subcategory_id` = 2, `subcategory` = 'Kanjivaram Pure Zari',
    `customer_price` = COALESCE(`customer_price`, `retail_price`), `fabric` = 'Pure Silk'
WHERE `id` = 1;

UPDATE `products` SET
    `category_id` = 1, `category_name` = 'Saree', `subcategory_id` = 1, `subcategory` = 'Banarasi Kadwa Silk',
    `customer_price` = COALESCE(`customer_price`, `retail_price`), `fabric` = 'Pure Silk'
WHERE `id` = 2;

UPDATE `products` SET
    `category_id` = 1, `category_name` = 'Saree', `subcategory_id` = 3, `subcategory` = 'Yeola Paithani Handloom',
    `customer_price` = COALESCE(`customer_price`, `retail_price`), `fabric` = 'Pure Silk'
WHERE `id` = 3;

UPDATE `products` SET
    `category_id` = 4, `category_name` = 'Kurti', `subcategory_id` = 15, `subcategory` = '3-Piece Festive Kurti Sets',
    `customer_price` = COALESCE(`customer_price`, `retail_price`), `fabric` = 'Cotton'
WHERE `id` = 4;

UPDATE `products` SET
    `category_id` = 2, `category_name` = 'Lehenga', `subcategory_id` = 8, `subcategory` = 'Handcrafted Zardozi Silk',
    `customer_price` = COALESCE(`customer_price`, `retail_price`), `fabric` = 'Pure Silk'
WHERE `id` = 5;

UPDATE `products` SET
    `category_id` = 5, `category_name` = 'Organza Tissue', `subcategory_id` = 4, `subcategory` = 'Pastel Organza & Tissue',
    `customer_price` = COALESCE(`customer_price`, `retail_price`), `fabric` = 'Organza'
WHERE `id` = 6;

INSERT INTO `products` (
    `id`, `sku`, `title`, `slug`, `category_id`, `subcategory_id`, `subcategory`, `category_name`,
    `brand`, `fabric`, `weave`, `zari_type`, `pallu_style`, `blouse_piece`, `occasion`,
    `mrp`, `customer_price`, `retail_price`, `wholesale_price`, `reseller_price`, `sale_price`,
    `stock_qty`, `primary_image`, `badge`, `is_featured`, `is_bestseller`, `status`, `selling_type`, `description`
) VALUES
(7, 'GWN-IND-701', 'Royal Sequined Indo-Western Georgette Gown', 'royal-sequined-indowestern-georgette-gown',
 3, 12, 'Floor-Length Georgette Gowns', 'Gown',
 "DT Brand's", 'Georgette', 'Flared Reception Drape', 'Tone-on-Tone Zari Sequins', 'Full Flare Plisse Bodice', 'Fully Stitched', 'Reception & Cocktail',
 8990.00, 5890.00, 5890.00, 3290.00, 4190.00, 0.00,
 36, '/assets/images/product7.png', 'New Arrival', 1, 1, 'in_stock', 'single_piece',
 'Floor-length flowing blooming georgette reception gown with hand-embroidered yoke and matching dupatta.'),
(8, 'PTL-PAT-804', 'Patan Double Ikat Patola Silk Saree', 'patan-double-ikat-patola-silk-saree',
 8, 6, 'Bandhani & Patola Heritage', 'Patola Heritage',
 "DT Brand's", 'Pure Silk', 'Double Ikat Loom', 'Tested Gold Zari Border', 'Navratna Geometric Pallu', 'Running Contrast Blouse (0.8m)', 'Bridal & Festive',
 11500.00, 7490.00, 7490.00, 3990.00, 4950.00, 0.00,
 28, '/assets/images/product8.png', 'Heritage', 1, 1, 'in_stock', 'single_piece',
 'Authentic Gujarati double ikat geometric weave in rich Patan heirloom tones with ceremonial zari pallu.')
ON DUPLICATE KEY UPDATE
    `category_id` = VALUES(`category_id`),
    `category_name` = VALUES(`category_name`),
    `subcategory_id` = VALUES(`subcategory_id`),
    `subcategory` = VALUES(`subcategory`),
    `customer_price` = COALESCE(`customer_price`, VALUES(`customer_price`));

-- Reviews for products 7 & 8 too
INSERT INTO `reviews` (
    `id`, `product_id`, `customer_id`, `customer_name`, `customer_email`, `city`,
    `rating`, `review_title`, `review_text`, `verified_buyer`, `status`, `created_at`
) VALUES
(11, 7, 103, 'Shreya Malhotra', 'shreya.m@example.in', 'Chandigarh', 5,
 'Dreamy Floor-Length Gown Fit',
 'Ordered M size for sister sangeet. Georgette flow and sequins shimmer look straight off a couture runway.',
 1, 'approved', DATE_SUB(NOW(), INTERVAL 9 DAY)),
(12, 8, 102, 'Hetal Desai', 'hetal.d@example.in', 'Ahmedabad, GJ', 5,
 'Authentic Patola Motif Clarity',
 'Double ikat motifs are razor-sharp on both sides of the silk weave. Pride of Gujarat craftsmanship.',
 1, 'approved', DATE_SUB(NOW(), INTERVAL 10 DAY))
ON DUPLICATE KEY UPDATE `status` = 'approved';

-- 6. Color Palette, Size Master & Multi-Variant Matrix (Colors × Sizes)
INSERT INTO `product_sizes` (`id`, `name`, `sort_order`, `status`) VALUES
(1, 'Free Size', 1, 'active'),
(2, 'Unstitched (6.3m)', 2, 'active'),
(3, 'Semi-Stitched', 3, 'active'),
(4, 'XS', 4, 'active'),
(5, 'S', 5, 'active'),
(6, 'M', 6, 'active'),
(7, 'L', 7, 'active'),
(8, 'XL', 8, 'active'),
(9, 'XXL', 9, 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `sort_order` = VALUES(`sort_order`), `status` = 'active';

INSERT INTO `product_colors` (`id`, `name`, `hex_code`, `status`) VALUES
(1, 'Navy', '#1B2A4A', 'active'),
(2, 'Maroon', '#6D1A24', 'active'),
(3, 'Green', '#1E5E3A', 'active'),
(4, 'Yellow', '#E5A93B', 'active'),
(5, 'Pink', '#E88B9E', 'active'),
(6, 'Red', '#B22222', 'active'),
(7, 'Orange', '#D96B27', 'active'),
(8, 'White', '#FAF8F5', 'active'),
(9, 'Black', '#1A1A1A', 'active'),
(10, 'Wine', '#4A1521', 'active'),
(11, 'Royal Blue', '#204B8C', 'active'),
(12, 'Emerald Green', '#1B5E20', 'active'),
(13, 'Peach', '#F4B2A0', 'active'),
(14, 'Peacock Teal', '#1D6870', 'active'),
(15, 'Gold', '#D4AF37', 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`), `hex_code` = VALUES(`hex_code`), `status` = 'active';

INSERT INTO `product_variants` (
    `id`, `product_id`, `color_id`, `color_name`, `size_id`, `size_name`, `sku`, `stock_qty`,
    `customer_price`, `retail_price`, `retailer_price`, `wholesale_price`, `reseller_price`, `selling_type`, `image`
) VALUES
-- Product 1: Nilambari Kanjivaram Silk Saree
(1, 1, 1, 'Navy', 1, 'Free Size', 'KLN-SR-111-NVY-FS', 28, 4899.00, 4899.00, 4899.00, 1399.00, 2100.00, 'single_piece', '/assets/images/product1.png'),
(2, 1, 2, 'Maroon', 1, 'Free Size', 'KLN-SR-111-MRN-FS', 22, 4899.00, 4899.00, 4899.00, 1399.00, 2100.00, 'single_piece', '/assets/images/product2.png'),
(3, 1, 1, 'Navy', 2, 'Unstitched (6.3m)', 'KLN-SR-111-NVY-US', 18, 5099.00, 5099.00, 5099.00, 1499.00, 2200.00, 'single_piece', '/assets/images/product1.png'),
(4, 1, 3, 'Green', 2, 'Unstitched (6.3m)', 'KLN-SR-111-GRN-US', 10, 5099.00, 5099.00, 5099.00, 1499.00, 2200.00, 'single_piece', '/assets/images/product3.png'),

-- Product 2: Royal Banarasi Meenakari Silk Saree
(5, 2, 2, 'Maroon', 1, 'Free Size', 'BNR-SR-204-MRN-FS', 24, 8499.00, 8499.00, 8499.00, 2499.00, 3500.00, 'single_piece', '/assets/images/product2.png'),
(6, 2, 6, 'Red', 1, 'Free Size', 'BNR-SR-204-RED-FS', 20, 8499.00, 8499.00, 8499.00, 2499.00, 3500.00, 'single_piece', '/assets/images/product2.png'),
(7, 2, 4, 'Yellow', 2, 'Unstitched (6.3m)', 'BNR-SR-204-YLW-US', 24, 8699.00, 8699.00, 8699.00, 2599.00, 3600.00, 'single_piece', '/assets/images/product3.png'),

-- Product 3: Maharani Paithani Handloom Silk Saree
(8, 3, 3, 'Green', 1, 'Free Size', 'PTH-MH-305-GRN-FS', 18, 9499.00, 9499.00, 9499.00, 3199.00, 4200.00, 'single_piece', '/assets/images/product3.png'),
(9, 3, 5, 'Pink', 1, 'Free Size', 'PTH-MH-305-PNK-FS', 12, 9499.00, 9499.00, 9499.00, 3199.00, 4200.00, 'single_piece', '/assets/images/product6.png'),
(10, 3, 3, 'Green', 2, 'Unstitched (6.3m)', 'PTH-MH-305-GRN-US', 12, 9699.00, 9699.00, 9699.00, 3299.00, 4300.00, 'single_piece', '/assets/images/product3.png'),

-- Product 4: Chanderi Foil Printed Festive Kurti Set (XS..XXL)
(11, 4, 4, 'Yellow', 4, 'XS', 'CHN-FO-401-YLW-XS', 8, 2290.00, 2290.00, 2290.00, 850.00, 1450.00, 'single_piece', '/assets/images/product4.png'),
(12, 4, 4, 'Yellow', 5, 'S', 'CHN-FO-401-YLW-S', 12, 2290.00, 2290.00, 2290.00, 850.00, 1450.00, 'single_piece', '/assets/images/product4.png'),
(13, 4, 4, 'Yellow', 6, 'M', 'CHN-FO-401-YLW-M', 15, 2290.00, 2290.00, 2290.00, 850.00, 1450.00, 'single_piece', '/assets/images/product4.png'),
(14, 4, 5, 'Pink', 7, 'L', 'CHN-FO-401-PNK-L', 12, 2290.00, 2290.00, 2290.00, 850.00, 1450.00, 'single_piece', '/assets/images/product4.png'),
(15, 4, 5, 'Pink', 8, 'XL', 'CHN-FO-401-PNK-XL', 9, 2390.00, 2390.00, 2390.00, 900.00, 1500.00, 'single_piece', '/assets/images/product6.png'),
(16, 4, 8, 'White', 9, 'XXL', 'CHN-FO-401-WHT-XXL', 6, 2390.00, 2390.00, 2390.00, 900.00, 1500.00, 'single_piece', '/assets/images/product4.png'),

-- Product 5: Crimson Bridal Handcrafted Zardosi Lehenga (Semi-Stitched + S..XL)
(17, 5, 6, 'Red', 3, 'Semi-Stitched', 'BRD-LH-902-RED-SS', 6, 16490.00, 16490.00, 16490.00, 11500.00, 13800.00, 'single_piece', '/assets/images/product5.png'),
(18, 5, 2, 'Maroon', 5, 'S', 'BRD-LH-902-MRN-S', 4, 16990.00, 16990.00, 16990.00, 11900.00, 14200.00, 'single_piece', '/assets/images/product5.png'),
(19, 5, 6, 'Red', 6, 'M', 'BRD-LH-902-RED-M', 4, 16990.00, 16990.00, 16990.00, 11900.00, 14200.00, 'single_piece', '/assets/images/product5.png'),
(20, 5, 5, 'Pink', 7, 'L', 'BRD-LH-902-PNK-L', 2, 16990.00, 16990.00, 16990.00, 11900.00, 14200.00, 'single_piece', '/assets/images/product5.png'),
(21, 5, 2, 'Maroon', 8, 'XL', 'BRD-LH-902-MRN-XL', 2, 17490.00, 17490.00, 17490.00, 12200.00, 14500.00, 'single_piece', '/assets/images/product5.png'),

-- Product 6: Organza Glass Tissue Floral Zari Saree
(22, 6, 5, 'Pink', 1, 'Free Size', 'ORG-TS-508-PNK-FS', 22, 3499.00, 3499.00, 3499.00, 1150.00, 1750.00, 'single_piece', '/assets/images/product6.png'),
(23, 6, 8, 'White', 1, 'Free Size', 'ORG-TS-508-WHT-FS', 18, 3499.00, 3499.00, 3499.00, 1150.00, 1750.00, 'single_piece', '/assets/images/product6.png'),
(24, 6, 7, 'Orange', 2, 'Unstitched (6.3m)', 'ORG-TS-508-ORG-US', 14, 3599.00, 3599.00, 3599.00, 1220.00, 1820.00, 'single_piece', '/assets/images/product6.png'),

-- Product 7: Royal Sequined Indo-Western Georgette Gown
(25, 7, 9, 'Black', 5, 'S', 'GWN-IND-701-BLK-S', 8, 5890.00, 5890.00, 5890.00, 3290.00, 4190.00, 'single_piece', '/assets/images/product7.png'),
(26, 7, 10, 'Wine', 6, 'M', 'GWN-IND-701-WIN-M', 12, 5890.00, 5890.00, 5890.00, 3290.00, 4190.00, 'single_piece', '/assets/images/product7.png'),
(27, 7, 1, 'Navy', 7, 'L', 'GWN-IND-701-NVY-L', 10, 5890.00, 5890.00, 5890.00, 3290.00, 4190.00, 'single_piece', '/assets/images/product7.png'),
(28, 7, 10, 'Wine', 8, 'XL', 'GWN-IND-701-WIN-XL', 6, 5990.00, 5990.00, 5990.00, 3390.00, 4290.00, 'single_piece', '/assets/images/product7.png'),

-- Product 8: Patan Double Ikat Patola Silk Saree
(29, 8, 6, 'Red', 1, 'Free Size', 'PTL-PAT-804-RED-FS', 12, 7490.00, 7490.00, 7490.00, 3990.00, 4950.00, 'single_piece', '/assets/images/product8.png'),
(30, 8, 3, 'Green', 1, 'Free Size', 'PTL-PAT-804-GRN-FS', 10, 7490.00, 7490.00, 7490.00, 3990.00, 4950.00, 'single_piece', '/assets/images/product8.png'),
(31, 8, 4, 'Yellow', 2, 'Unstitched (6.3m)', 'PTL-PAT-804-YLW-US', 6, 7690.00, 7690.00, 7690.00, 4090.00, 5050.00, 'single_piece', '/assets/images/product8.png')
ON DUPLICATE KEY UPDATE
    `color_id` = VALUES(`color_id`),
    `color_name` = VALUES(`color_name`),
    `size_id` = VALUES(`size_id`),
    `size_name` = VALUES(`size_name`),
    `stock_qty` = VALUES(`stock_qty`),
    `customer_price` = VALUES(`customer_price`),
    `retail_price` = VALUES(`retail_price`),
    `retailer_price` = VALUES(`retailer_price`),
    `wholesale_price` = VALUES(`wholesale_price`),
    `reseller_price` = VALUES(`reseller_price`),
    `image` = VALUES(`image`);

-- Product gallery images for multi-angle PDP sliders
INSERT IGNORE INTO `product_media` (`product_id`, `image_url`, `is_primary`, `sort_order`) VALUES
(1, '/assets/images/product1.png', 1, 1),
(1, '/assets/images/product2.png', 0, 2),
(2, '/assets/images/product2.png', 1, 1),
(2, '/assets/images/product3.png', 0, 2),
(3, '/assets/images/product3.png', 1, 1),
(3, '/assets/images/product6.png', 0, 2),
(4, '/assets/images/product4.png', 1, 1),
(4, '/assets/images/product6.png', 0, 2),
(5, '/assets/images/product5.png', 1, 1),
(5, '/assets/images/product2.png', 0, 2),
(6, '/assets/images/product6.png', 1, 1),
(6, '/assets/images/product4.png', 0, 2),
(7, '/assets/images/product7.png', 1, 1),
(7, '/assets/images/product5.png', 0, 2),
(8, '/assets/images/product8.png', 1, 1),
(8, '/assets/images/product1.png', 0, 2);

INSERT IGNORE INTO `_migrations` (`migration`, `applied_at`)
VALUES ('2026_09_16_000001_schema_sync_variants_sizes_and_content.sql', NOW());
