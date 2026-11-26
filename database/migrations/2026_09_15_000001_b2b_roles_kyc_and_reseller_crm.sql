-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 2026_09_15_000001_b2b_roles_kyc_and_reseller_crm.sql
-- Description: Align customers.type/kyc_status/business_name, orders.channel,
--              and add persistent reseller_customers CRM table.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE `customers`
    MODIFY COLUMN `type` ENUM('retail', 'retailer', 'wholesale', 'reseller') NOT NULL DEFAULT 'retail';

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND COLUMN_NAME='kyc_status');
SET @_s = IF(@_x=0, "ALTER TABLE `customers` ADD COLUMN `kyc_status` ENUM('unverified', 'pending', 'verified', 'rejected') NOT NULL DEFAULT 'unverified' AFTER `pan`", 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND COLUMN_NAME='business_name');
SET @_s = IF(@_x=0, 'ALTER TABLE `customers` ADD COLUMN `business_name` VARCHAR(150) NULL DEFAULT NULL AFTER `name`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='customers' AND COLUMN_NAME='gst_verified');
SET @_s = IF(@_x=0, 'ALTER TABLE `customers` ADD COLUMN `gst_verified` TINYINT(1) NOT NULL DEFAULT 0 AFTER `gstin`', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

ALTER TABLE `orders`
    MODIFY COLUMN `channel` ENUM('retail', 'retailer', 'wholesale', 'reseller', 'whatsapp') NULL DEFAULT 'retail';

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='updated_at');
SET @_s = IF(@_x=0, 'ALTER TABLE `orders` ADD COLUMN `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

SET @_x = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='orders' AND COLUMN_NAME='notes');
SET @_s = IF(@_x=0, 'ALTER TABLE `orders` ADD COLUMN `notes` TEXT NULL DEFAULT NULL', 'SELECT 1');
PREPARE _st FROM @_s; EXECUTE _st; DEALLOCATE PREPARE _st;

-- Persistent Reseller End-Buyer CRM Table (replaces client-only localStorage mock DB)
CREATE TABLE IF NOT EXISTS `reseller_customers` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `reseller_id` INT NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(25) NOT NULL,
    `email` VARCHAR(150) NULL DEFAULT NULL,
    `city` VARCHAR(100) NULL DEFAULT NULL,
    `state` VARCHAR(100) NULL DEFAULT NULL,
    `pincode` VARCHAR(20) NULL DEFAULT NULL,
    `address` TEXT NULL,
    `notes` TEXT NULL,
    `next_followup_at` DATETIME NULL DEFAULT NULL,
    `status` ENUM('active', 'followup', 'archived') NOT NULL DEFAULT 'active',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_rc_reseller` (`reseller_id`),
    INDEX `idx_rc_phone` (`reseller_id`, `phone`),
    INDEX `idx_rc_followup` (`reseller_id`, `next_followup_at`),
    CONSTRAINT `fk_rc_reseller` FOREIGN KEY (`reseller_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Replace nonexistent default placeholder banner/category image filenames with valid catalog imagery
UPDATE `categories` SET `image` = CONCAT('/assets/images/product', ((`id` - 1) % 8) + 1, '.png') WHERE `image` LIKE '%category-sarees.png%';
UPDATE `banners` SET `image_url` = CONCAT('/assets/images/product', ((`id` - 1) % 8) + 1, '.png') WHERE `image_url` LIKE '%hero-banner.png%' OR `image_url` LIKE '%category-sarees.png%';
