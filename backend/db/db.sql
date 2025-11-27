-- Journal App Database Schema
-- Run these commands against your RDS MySQL database

-- ============================================
-- USERS TABLE (with Firebase UID support)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE,
    username VARCHAR(100),
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_firebase_uid (firebase_uid)
);

-- If table exists, add firebase_uid column:
-- ALTER TABLE users ADD COLUMN firebase_uid VARCHAR(128) UNIQUE;
-- CREATE INDEX idx_firebase_uid ON users(firebase_uid);

-- ============================================
-- JOURNAL ENTRIES TABLE
-- ============================================
-- Drop old table if it exists (WARNING: loses data)
-- DROP TABLE IF EXISTS journal_entries;

CREATE TABLE IF NOT EXISTS journal_entries (
    entry_id INT AUTO_INCREMENT PRIMARY KEY,
    firebase_uid VARCHAR(128) NOT NULL,
    date DATETIME NOT NULL,
    title VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    prompt_id INT NULL,
    client_id VARCHAR(50) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,
    INDEX idx_user_entries (firebase_uid, date),
    INDEX idx_sync (firebase_uid, updated_at),
    INDEX idx_client_id (firebase_uid, client_id)
);

-- Migration from old schema (if upgrading):
-- ALTER TABLE journal_entries ADD COLUMN firebase_uid VARCHAR(128);
-- ALTER TABLE journal_entries ADD COLUMN title VARCHAR(255);
-- ALTER TABLE journal_entries ADD COLUMN client_id VARCHAR(50);
-- ALTER TABLE journal_entries ADD COLUMN is_deleted TINYINT(1) DEFAULT 0;
-- ALTER TABLE journal_entries MODIFY COLUMN text TEXT;
-- ALTER TABLE journal_entries MODIFY COLUMN date DATETIME;
-- CREATE INDEX idx_user_entries ON journal_entries(firebase_uid, date);
-- CREATE INDEX idx_sync ON journal_entries(firebase_uid, updated_at);

-- ============================================
-- PROMPTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS prompts (
    prompt_id INT AUTO_INCREMENT PRIMARY KEY,
    prompt TEXT NOT NULL,
    user_id INT NULL,
    firebase_uid VARCHAR(128) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_prompt_user (firebase_uid)
);

-- ============================================
-- SAMPLE PROMPTS (Optional)
-- ============================================
INSERT INTO prompts (prompt) VALUES
    ('What are three things you are grateful for today?'),
    ('Describe a challenge you faced recently and how you handled it.'),
    ('What is one thing you learned today?'),
    ('Write about a person who has positively influenced your life.'),
    ('What are your goals for this week?'),
    ('Describe your perfect day.'),
    ('What advice would you give to your younger self?'),
    ('Write about a moment that made you smile today.'),
    ('What habits do you want to develop?'),
    ('Reflect on a recent accomplishment, no matter how small.');
