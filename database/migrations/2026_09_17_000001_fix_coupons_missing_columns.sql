-- Migration: Sync coupons table with Section 26 DiscountEngine & admin/api/coupons.php columns
-- DT Brand's & Jai Hanuman Tex

ALTER TABLE `coupons`
    ADD COLUMN IF NOT EXISTS `title` VARCHAR(150) NULL DEFAULT NULL AFTER `code`,
    ADD COLUMN IF NOT EXISTS `min_order_amount` DECIMAL(10,2) DEFAULT 0.00 AFTER `min_order_value`,
    ADD COLUMN IF NOT EXISTS `usage_limit` INT DEFAULT 0 AFTER `max_discount`,
    ADD COLUMN IF NOT EXISTS `used_count` INT DEFAULT 0 AFTER `usage_limit`,
    ADD COLUMN IF NOT EXISTS `times_used` INT DEFAULT 0 AFTER `used_count`,
    ADD COLUMN IF NOT EXISTS `per_user_limit` INT DEFAULT 0 AFTER `times_used`,
    ADD COLUMN IF NOT EXISTS `channel` VARCHAR(50) NOT NULL DEFAULT 'all' AFTER `per_user_limit`,
    ADD COLUMN IF NOT EXISTS `starts_at` DATETIME NULL DEFAULT NULL AFTER `channel`,
    ADD COLUMN IF NOT EXISTS `expires_at` DATETIME NULL DEFAULT NULL AFTER `starts_at`,
    ADD COLUMN IF NOT EXISTS `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP AFTER `status`;

-- Backfill metadata on existing seeded coupons
UPDATE `coupons` SET `title` = COALESCE(NULLIF(`title`, ''), CONCAT('Promo ', `code`)), `min_order_amount` = COALESCE(`min_order_value`, 0.00);
UPDATE `coupons` SET `title` = 'Festive Silk Promo', `channel` = 'all', `usage_limit` = 500, `used_count` = GREATEST(`used_count`, 148), `times_used` = GREATEST(`times_used`, 148) WHERE `code` = 'FESTIVE25';
UPDATE `coupons` SET `title` = 'VIP Reseller Boost', `channel` = 'reseller', `usage_limit` = 200, `used_count` = GREATEST(`used_count`, 88), `times_used` = GREATEST(`times_used`, 88) WHERE `code` = 'VIPRESELLER';
UPDATE `coupons` SET `title` = 'Wholesale Depot Incentive', `channel` = 'wholesaler', `usage_limit` = 100, `used_count` = GREATEST(`used_count`, 32), `times_used` = GREATEST(`times_used`, 32) WHERE `code` = 'BULK50';
UPDATE `coupons` SET `title` = 'Handloom Signature 10% OFF', `channel` = 'all', `usage_limit` = 1000, `used_count` = GREATEST(`used_count`, 64), `times_used` = GREATEST(`times_used`, 64) WHERE `code` = 'DTHANDLOOM10';
UPDATE `coupons` SET `title` = 'Festive ₹500 Flat OFF', `channel` = 'all', `usage_limit` = 500, `used_count` = GREATEST(`used_count`, 45), `times_used` = GREATEST(`times_used`, 45) WHERE `code` = 'FESTIVE500';
UPDATE `coupons` SET `title` = 'Reseller VIP Exclusive 15% OFF', `channel` = 'reseller', `usage_limit` = 250, `used_count` = GREATEST(`used_count`, 38), `times_used` = GREATEST(`times_used`, 38) WHERE `code` = 'RESELLERVIP';

-- Ensure checkout promo codes ROYAL10 and FIRST10 exist in live coupons table
INSERT INTO `coupons` (`code`, `title`, `discount_type`, `discount_value`, `min_order_value`, `min_order_amount`, `max_discount`, `usage_limit`, `used_count`, `times_used`, `per_user_limit`, `channel`, `starts_at`, `expires_at`, `status`)
VALUES
    ('ROYAL10', 'Royal Festive 10% OFF', 'percentage', 10.00, 999.00, 999.00, 1500.00, 1000, 0, 0, 0, 'all', '2026-01-01 00:00:00', '2027-12-31 23:59:59', 'active'),
    ('FIRST10', 'First Order Welcome 10% OFF', 'percentage', 10.00, 999.00, 999.00, 500.00, 1000, 0, 0, 1, 'all', '2026-01-01 00:00:00', '2027-12-31 23:59:59', 'active')
ON DUPLICATE KEY UPDATE
    `title` = VALUES(`title`),
    `status` = 'active',
    `expires_at` = VALUES(`expires_at`);
