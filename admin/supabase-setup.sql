-- ============================================
-- Supabase Setup Script for Portfolio Photos
-- ============================================
-- Run this in the Supabase SQL Editor to create the photos table

-- Create the photos table
CREATE TABLE IF NOT EXISTS photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Cloudinary fields
    cloudinary_id TEXT NOT NULL,           -- Cloudinary public_id (e.g., "portfolio/abc123")
    cloudinary_url TEXT NOT NULL,          -- Base URL (without transformations)

    -- Metadata
    title VARCHAR(255),
    alt_text VARCHAR(500),
    category VARCHAR(100),                 -- 'portrait', 'film', 'travel', 'candid', 'street', 'landscape'

    -- Display settings
    section VARCHAR(50) NOT NULL,          -- 'hero', 'featured', 'gallery', 'bento', 'projects'
    display_order INTEGER DEFAULT 0,
    featured BOOLEAN DEFAULT FALSE,

    -- Image info (from Cloudinary response)
    width INTEGER,
    height INTEGER,
    format VARCHAR(20),
    size_bytes INTEGER,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_photos_section_order ON photos(section, display_order);
CREATE INDEX IF NOT EXISTS idx_photos_category ON photos(category);
CREATE INDEX IF NOT EXISTS idx_photos_featured ON photos(featured) WHERE featured = TRUE;

-- Enable Row Level Security
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Policy: Public can read all photos
CREATE POLICY "Public read access"
    ON photos
    FOR SELECT
    USING (true);

-- Policy: Only authenticated users can insert
CREATE POLICY "Authenticated insert"
    ON photos
    FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Policy: Only authenticated users can update
CREATE POLICY "Authenticated update"
    ON photos
    FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Policy: Only authenticated users can delete
CREATE POLICY "Authenticated delete"
    ON photos
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- ============================================
-- Optional: Create admin user
-- ============================================
-- After running this script:
-- 1. Go to Authentication > Users in Supabase dashboard
-- 2. Click "Invite user"
-- 3. Enter your email address
-- 4. Set a password when you receive the email

-- ============================================
-- Sample data (optional - remove if not needed)
-- ============================================
-- INSERT INTO photos (cloudinary_id, cloudinary_url, title, category, section, display_order)
-- VALUES
--     ('portfolio/sample1', 'https://res.cloudinary.com/your-cloud/image/upload/portfolio/sample1.jpg', 'Sample Portrait', 'portrait', 'gallery', 0),
--     ('portfolio/sample2', 'https://res.cloudinary.com/your-cloud/image/upload/portfolio/sample2.jpg', 'Sample Film', 'film', 'gallery', 1);
