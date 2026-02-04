// ============================================
// Portfolio - Dynamic Image Loading
// ============================================

(function() {
    'use strict';

    const config = window.portfolioConfig;

    // Check if Supabase is configured
    function isConfigured() {
        return config &&
            config.SUPABASE_URL &&
            config.SUPABASE_URL !== 'https://YOUR_PROJECT.supabase.co' &&
            config.SUPABASE_ANON_KEY &&
            config.SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY';
    }

    // Initialize Supabase client
    let supabase = null;

    function initSupabase() {
        if (!isConfigured()) {
            console.log('Portfolio: Using static images (Supabase not configured)');
            return false;
        }

        if (window.supabase) {
            supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
            return true;
        }

        console.warn('Portfolio: Supabase client not loaded');
        return false;
    }

    // Fetch photos from Supabase
    async function fetchPhotos() {
        if (!supabase) return null;

        try {
            const { data, error } = await supabase
                .from('photos')
                .select('*')
                .order('section')
                .order('display_order');

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Portfolio: Failed to fetch photos', error);
            return null;
        }
    }

    // Group photos by section
    function groupBySection(photos) {
        return photos.reduce((acc, photo) => {
            if (!acc[photo.section]) {
                acc[photo.section] = [];
            }
            acc[photo.section].push(photo);
            return acc;
        }, {});
    }

    // Generate Cloudinary optimized URL
    function getOptimizedUrl(publicId, options = {}) {
        if (config.getCloudinaryUrl) {
            return config.getCloudinaryUrl(publicId, options);
        }
        // Fallback
        return publicId;
    }

    // Generate srcset for responsive images
    function getSrcset(publicId, sizes = [400, 800, 1200, 1600]) {
        if (config.getCloudinarySrcset) {
            return config.getCloudinarySrcset(publicId, sizes);
        }
        return '';
    }

    // Render hero/featured image
    function renderFeatured(photo) {
        const featuredImg = document.getElementById('featuredImage');
        if (!featuredImg || !photo) return;

        const optimizedUrl = getOptimizedUrl(photo.cloudinary_id, {
            width: 1920,
            quality: 'auto',
            format: 'auto'
        });

        featuredImg.src = optimizedUrl;
        featuredImg.alt = photo.alt_text || photo.title || 'Featured photograph';
    }

    // Render horizontal gallery
    function renderGallery(photos) {
        const gallery = document.getElementById('gallery');
        if (!gallery || !photos || photos.length === 0) return;

        // Determine size based on index or featured status
        const getSizeClass = (photo, index) => {
            if (photo.featured) return 'large';
            const pattern = ['large', 'medium', 'small', 'medium', 'large'];
            return pattern[index % pattern.length];
        };

        gallery.innerHTML = photos.map((photo, index) => {
            const sizeClass = getSizeClass(photo, index);
            const thumbUrl = getOptimizedUrl(photo.cloudinary_id, { width: 800, quality: 80 });
            const fullUrl = getOptimizedUrl(photo.cloudinary_id, { width: 1600 });
            const srcset = getSrcset(photo.cloudinary_id, [400, 800, 1200]);

            return `
                <a href="${fullUrl}" class="gallery-item ${sizeClass} glightbox" data-gallery="portfolio">
                    <img
                        src="${thumbUrl}"
                        srcset="${srcset}"
                        sizes="(max-width: 768px) 100vw, 50vw"
                        alt="${photo.alt_text || photo.title || 'Photography work'}"
                        loading="lazy"
                        decoding="async"
                    >
                    <div class="gallery-item-overlay">
                        <span class="text-small">${photo.category || ''}</span>
                    </div>
                </a>
            `;
        }).join('');

        // Re-initialize GLightbox if available
        if (window.GLightbox) {
            GLightbox({
                selector: '.gallery-item.glightbox',
                touchNavigation: true,
                loop: true
            });
        }
    }

    // Render bento grid
    function renderBento(photos) {
        const bentoGrid = document.querySelector('.bento-grid');
        if (!bentoGrid || !photos || photos.length === 0) return;

        // Bento grid needs exactly 4 photos
        const bentoPhotos = photos.slice(0, 4);

        bentoGrid.innerHTML = bentoPhotos.map((photo, index) => {
            const thumbUrl = getOptimizedUrl(photo.cloudinary_id, {
                width: index === 0 ? 1200 : 600,
                quality: 'auto'
            });
            const fullUrl = getOptimizedUrl(photo.cloudinary_id, { width: 1600 });

            return `
                <a href="${fullUrl}" class="bento-item glightbox" data-gallery="bento">
                    <img
                        src="${thumbUrl}"
                        alt="${photo.alt_text || photo.title || 'Photography work'}"
                        loading="lazy"
                        decoding="async"
                    >
                </a>
            `;
        }).join('');

        // Re-initialize GLightbox for bento
        if (window.GLightbox) {
            GLightbox({
                selector: '.bento-item.glightbox',
                touchNavigation: true,
                loop: true
            });
        }
    }

    // Render project cards
    function renderProjects(photos) {
        const projectsGrid = document.querySelector('.projects-grid');
        if (!projectsGrid || !photos || photos.length === 0) return;

        // Keep existing project cards, just update images if needed
        const cards = projectsGrid.querySelectorAll('.project-card');
        photos.forEach((photo, index) => {
            if (cards[index]) {
                const img = cards[index].querySelector('.project-card-image img');
                if (img) {
                    img.src = getOptimizedUrl(photo.cloudinary_id, { width: 800, quality: 80 });
                    img.alt = photo.alt_text || photo.title || 'Project';
                }
            }
        });
    }

    // Main initialization
    async function init() {
        // Try to initialize Supabase
        if (!initSupabase()) {
            // Fall back to static images
            console.log('Portfolio: Running with static images');
            return;
        }

        // Fetch photos from database
        const photos = await fetchPhotos();
        if (!photos || photos.length === 0) {
            console.log('Portfolio: No photos in database, using static images');
            return;
        }

        // Group photos by section
        const sections = groupBySection(photos);

        // Render each section
        if (sections.featured && sections.featured.length > 0) {
            renderFeatured(sections.featured[0]);
        } else if (sections.hero && sections.hero.length > 0) {
            renderFeatured(sections.hero[0]);
        }

        if (sections.gallery) {
            renderGallery(sections.gallery);
        }

        if (sections.bento) {
            renderBento(sections.bento);
        }

        if (sections.projects) {
            renderProjects(sections.projects);
        }

        console.log('Portfolio: Loaded', photos.length, 'photos from database');
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Export for debugging
    window.portfolio = {
        init,
        fetchPhotos,
        isConfigured
    };
})();
