// ============================================
// Portfolio Configuration
// ============================================
console.log('[CONFIG] Script starting...');
(function() {
'use strict';
console.log('[CONFIG] Inside IIFE...');

// Cloudinary Configuration (public - safe to expose)
const CLOUDINARY_CLOUD_NAME = 'dvllhdgkf';
const CLOUDINARY_UPLOAD_PRESET = 'portfolio_unsigned';

// Supabase Configuration (public - safe to expose)
const SUPABASE_URL = 'https://nmkavdrvgjkolreoexfe.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta2F2ZHJ2Z2prb2xyZW9leGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTEyMjEsImV4cCI6MjA4MjkyNzIyMX0.VlmkBrD3i7eFfMg7SuZHACqa29r0GHZiU4FFzfB6P7Q';

// ============================================
// Cloudinary URL Helper
// ============================================
function getCloudinaryUrl(publicId, options = {}) {
    const {
        width,
        height,
        crop = 'fill',
        quality = 'auto',
        format = 'auto',
        gravity = 'auto'
    } = options;

    let transforms = [];

    // Quality and format (always apply for optimization)
    transforms.push(`q_${quality}`);
    transforms.push(`f_${format}`);

    // Dimensions
    if (width) transforms.push(`w_${width}`);
    if (height) transforms.push(`h_${height}`);

    // Crop mode
    if (crop && (width || height)) {
        transforms.push(`c_${crop}`);
        if (gravity) transforms.push(`g_${gravity}`);
    }

    const transformString = transforms.join(',');
    return `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transformString}/${publicId}`;
}

// ============================================
// Generate Responsive srcset
// ============================================
function getCloudinarySrcset(publicId, sizes = [400, 800, 1200, 1600]) {
    return sizes
        .map(size => `${getCloudinaryUrl(publicId, { width: size })} ${size}w`)
        .join(', ');
}

// ============================================
// Initialize Supabase Client
// ============================================
let supabase = null;

function initSupabase() {
    if (!supabase && window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}

// ============================================
// Photo Categories and Sections
// ============================================
const PHOTO_CATEGORIES = ['portrait', 'film', 'travel', 'candid', 'street', 'landscape'];
const PHOTO_SECTIONS = ['hero', 'featured', 'gallery', 'bento', 'projects'];
const GALLERY_SIZES = ['small', 'medium', 'large'];

// ============================================
// Export for ES modules or global
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CLOUDINARY_CLOUD_NAME,
        CLOUDINARY_UPLOAD_PRESET,
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        getCloudinaryUrl,
        getCloudinarySrcset,
        initSupabase,
        PHOTO_CATEGORIES,
        PHOTO_SECTIONS,
        GALLERY_SIZES
    };
}

// Make available globally
window.portfolioConfig = {
    CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_UPLOAD_PRESET,
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    getCloudinaryUrl,
    getCloudinarySrcset,
    initSupabase,
    PHOTO_CATEGORIES,
    PHOTO_SECTIONS,
    GALLERY_SIZES
};

console.log('Portfolio config loaded:', !!window.portfolioConfig);
})();
