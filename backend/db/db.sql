-- Journal App Database Schema
-- Run these commands against your RDS MySQL database

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE,
    username VARCHAR(100),
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone_number VARCHAR(20),
    phone_verified TINYINT(1) DEFAULT 0,
    phone_verification_code VARCHAR(6),
    phone_verification_expires DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_firebase_uid (firebase_uid),
    INDEX idx_phone (phone_number)
);

-- ============================================
-- JOURNAL ENTRIES TABLE
-- ============================================
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
-- CONNECTIONS (FRIENDS) TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS connections (
    connection_id INT AUTO_INCREMENT PRIMARY KEY,
    requester_uid VARCHAR(128) NOT NULL,
    target_uid VARCHAR(128) NOT NULL,
    status ENUM('pending', 'accepted', 'declined', 'blocked') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_connection (requester_uid, target_uid),
    INDEX idx_target (target_uid, status),
    INDEX idx_requester (requester_uid, status)
);

-- ============================================
-- INVITE LINKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS invite_links (
    invite_id INT AUTO_INCREMENT PRIMARY KEY,
    invite_token VARCHAR(64) UNIQUE NOT NULL,
    creator_uid VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_token (invite_token),
    INDEX idx_creator (creator_uid)
);

-- ============================================
-- SHARED ENTRIES (PUBLIC LINKS) TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS shared_entries (
    share_id INT AUTO_INCREMENT PRIMARY KEY,
    share_token VARCHAR(64) UNIQUE NOT NULL,
    entry_id INT NOT NULL,
    owner_uid VARCHAR(128) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    view_count INT DEFAULT 0,
    INDEX idx_share_token (share_token),
    INDEX idx_entry (entry_id),
    INDEX idx_owner (owner_uid)
);

-- ============================================
-- ENTRY SHARES (DIRECT TO FRIENDS) TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS entry_shares (
    share_id INT AUTO_INCREMENT PRIMARY KEY,
    entry_id INT NOT NULL,
    owner_uid VARCHAR(128) NOT NULL,
    shared_with_uid VARCHAR(128) NOT NULL,
    shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read TINYINT(1) DEFAULT 0,
    notified TINYINT(1) DEFAULT 0,
    UNIQUE KEY unique_share (entry_id, shared_with_uid),
    INDEX idx_shared_with (shared_with_uid, is_read),
    INDEX idx_owner (owner_uid),
    INDEX idx_entry (entry_id)
);

-- ============================================
-- ENTRY REACTIONS TABLE (NEW)
-- ============================================
CREATE TABLE IF NOT EXISTS entry_reactions (
    reaction_id INT AUTO_INCREMENT PRIMARY KEY,
    entry_id INT NOT NULL,
    reactor_uid VARCHAR(128) NOT NULL,
    emoji VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_reaction (entry_id, reactor_uid, emoji),
    INDEX idx_entry (entry_id),
    INDEX idx_reactor (reactor_uid)
);

-- ============================================
-- ENTRY COMMENTS TABLE (NEW)
-- ============================================
CREATE TABLE IF NOT EXISTS entry_comments (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    entry_id INT NOT NULL,
    commenter_uid VARCHAR(128) NOT NULL,
    parent_comment_id INT NULL,
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,
    INDEX idx_entry (entry_id),
    INDEX idx_commenter (commenter_uid),
    INDEX idx_parent (parent_comment_id)
);

-- ============================================
-- USER STREAKS TABLE (NEW)
-- ============================================
CREATE TABLE IF NOT EXISTS user_streaks (
    streak_id INT AUTO_INCREMENT PRIMARY KEY,
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    current_streak INT DEFAULT 0,
    longest_streak INT DEFAULT 0,
    last_entry_date DATE,
    streak_start_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_uid (firebase_uid),
    INDEX idx_streak (current_streak DESC)
);

-- ============================================
-- ACCOUNTABILITY PARTNERS TABLE (NEW)
-- ============================================
CREATE TABLE IF NOT EXISTS accountability_partners (
    partnership_id INT AUTO_INCREMENT PRIMARY KEY,
    user_uid VARCHAR(128) NOT NULL,
    partner_uid VARCHAR(128) NOT NULL,
    status ENUM('pending', 'active', 'ended') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_partnership (user_uid, partner_uid),
    INDEX idx_user (user_uid),
    INDEX idx_partner (partner_uid)
);

-- ============================================
-- SAMPLE PROMPTS (Run only once)
-- ============================================
INSERT IGNORE INTO prompts (prompt_id, prompt) VALUES
    (1, 'What are three things you are grateful for today?'),
    (2, 'Describe a challenge you faced recently and how you handled it.'),
    (3, 'What is one thing you learned today?'),
    (4, 'Write about a person who has positively influenced your life.'),
    (5, 'What are your goals for this week?'),
    (6, 'Describe your perfect day.'),
    (7, 'What advice would you give to your younger self?'),
    (8, 'Write about a moment that made you smile today.'),
    (9, 'What habits do you want to develop?'),
    (10, 'Reflect on a recent accomplishment, no matter how small.');
