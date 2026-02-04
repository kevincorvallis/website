        // ============================================
        // Dynamic Copyright Year
        // ============================================
        document.getElementById('copyrightYear').textContent = new Date().getFullYear();

        // ============================================
        // Progress Bar
        // ============================================
        const progressBar = document.getElementById('progressBar');
        let progress = 0;

        function simulateProgress() {
            const interval = setInterval(() => {
                progress += Math.random() * 30;
                if (progress > 90) {
                    progress = 90;
                    clearInterval(interval);
                }
                progressBar.style.width = progress + '%';
            }, 100);
            return interval;
        }

        const progressInterval = simulateProgress();

        window.addEventListener('load', () => {
            clearInterval(progressInterval);
            progressBar.style.width = '100%';
            setTimeout(() => {
                progressBar.style.opacity = '0';
            }, 300);
        });

        // ============================================
        // Mobile Menu Toggle
        // ============================================
        const hamburger = document.getElementById('hamburger');
        const navLinks = document.getElementById('navLinks');

        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
            hamburger.setAttribute('aria-expanded', hamburger.classList.contains('active'));
        });

        // Close menu when clicking a link
        navLinks.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
                hamburger.setAttribute('aria-expanded', 'false');
            });
        });

        // ============================================
        // Theme Toggle
        // ============================================
        const themeToggle = document.getElementById('themeToggle');

        themeToggle.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
        });

        // Listen for system preference changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });

        // ============================================
        // Custom Cursor (Desktop Only)
        // ============================================
        if (window.matchMedia('(pointer: fine)').matches) {
            const cursor = document.getElementById('cursor');
            const cursorFollower = document.getElementById('cursorFollower');
            let mouseX = 0, mouseY = 0;
            let cursorX = 0, cursorY = 0;
            let followerX = 0, followerY = 0;

            document.addEventListener('mousemove', (e) => {
                mouseX = e.clientX;
                mouseY = e.clientY;
            });

            function animateCursor() {
                // Smooth interpolation
                cursorX += (mouseX - cursorX) * 0.2;
                cursorY += (mouseY - cursorY) * 0.2;
                followerX += (mouseX - followerX) * 0.1;
                followerY += (mouseY - followerY) * 0.1;

                cursor.style.left = cursorX + 'px';
                cursor.style.top = cursorY + 'px';
                cursorFollower.style.left = followerX + 'px';
                cursorFollower.style.top = followerY + 'px';

                requestAnimationFrame(animateCursor);
            }
            animateCursor();

            // Hover states
            const hoverTargets = document.querySelectorAll('a, button, .gallery-item, .bento-item, .project-card, .link-button');
            hoverTargets.forEach(target => {
                target.addEventListener('mouseenter', () => {
                    cursor.classList.add('hover');
                    cursorFollower.classList.add('hover');
                });
                target.addEventListener('mouseleave', () => {
                    cursor.classList.remove('hover');
                    cursorFollower.classList.remove('hover');
                });
            });

            // Magnetic effect for buttons
            document.querySelectorAll('.magnetic').forEach(btn => {
                btn.addEventListener('mousemove', (e) => {
                    const rect = btn.getBoundingClientRect();
                    const x = e.clientX - rect.left - rect.width / 2;
                    const y = e.clientY - rect.top - rect.height / 2;
                    gsap.to(btn, { x: x * 0.3, y: y * 0.3, duration: 0.3, ease: 'power2.out' });
                });

                btn.addEventListener('mouseleave', () => {
                    gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
                });
            });
        }

        // ============================================
        // Lenis Smooth Scroll
        // ============================================
        const lenis = new Lenis({
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            touchMultiplier: 2,
        });

        function raf(time) {
            lenis.raf(time);
            requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);

        // Connect Lenis to GSAP ScrollTrigger
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => lenis.raf(time * 1000));
        gsap.ticker.lagSmoothing(0);

        // Register ScrollTrigger
        gsap.registerPlugin(ScrollTrigger);

        // ============================================
        // Split Text Animation for Hero
        // ============================================
        const heroTitle = document.getElementById('heroTitle');
        const splitText = new SplitType(heroTitle, { types: 'chars' });

        gsap.from(splitText.chars, {
            opacity: 0,
            y: 100,
            rotateX: -90,
            stagger: 0.05,
            duration: 1,
            ease: 'power3.out',
            delay: 0.3
        });

        gsap.to('.hero-tagline', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            delay: 0.8
        });

        gsap.to('.hero-scroll', {
            opacity: 1,
            duration: 1,
            ease: 'power2.out',
            delay: 1.2
        });

        // ============================================
        // Featured Image Clip-Path Reveal
        // ============================================
        const featuredImage = document.getElementById('featuredImage');

        ScrollTrigger.create({
            trigger: '.featured-section',
            start: 'top 80%',
            onEnter: () => featuredImage.classList.add('revealed'),
            once: true
        });

        // Parallax effect on featured image
        gsap.to('.featured-image', {
            yPercent: 20,
            ease: 'none',
            scrollTrigger: {
                trigger: '.featured-section',
                start: 'top bottom',
                end: 'bottom top',
                scrub: true
            }
        });

        // ============================================
        // Gallery Animations
        // ============================================
        gsap.to('.gallery-header h2', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.gallery-header',
                start: 'top 80%'
            }
        });

        gsap.to('.gallery-subtitle', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            delay: 0.2,
            scrollTrigger: {
                trigger: '.gallery-header',
                start: 'top 80%'
            }
        });

        // Gallery items staggered reveal
        gsap.utils.toArray('.gallery-item').forEach((item, i) => {
            gsap.from(item, {
                opacity: 0,
                x: 100,
                duration: 0.8,
                ease: 'power3.out',
                delay: i * 0.1,
                scrollTrigger: {
                    trigger: '.gallery-section',
                    start: 'top 70%'
                }
            });
        });

        // Horizontal scroll drag
        const gallery = document.getElementById('gallery');
        let isDown = false;
        let startX;
        let scrollLeft;

        gallery.addEventListener('mousedown', (e) => {
            isDown = true;
            startX = e.pageX - gallery.offsetLeft;
            scrollLeft = gallery.scrollLeft;
        });

        gallery.addEventListener('mouseleave', () => isDown = false);
        gallery.addEventListener('mouseup', () => isDown = false);

        gallery.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - gallery.offsetLeft;
            const walk = (x - startX) * 2;
            gallery.scrollLeft = scrollLeft - walk;
        });

        // ============================================
        // Video Section
        // ============================================
        gsap.to('.video-overlay h2', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.video-section',
                start: 'top 60%'
            }
        });

        // ============================================
        // Bento Grid
        // ============================================
        gsap.to('.bento-header .reveal', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.bento-section',
                start: 'top 80%'
            }
        });

        gsap.utils.toArray('.bento-item').forEach((item, i) => {
            gsap.from(item, {
                opacity: 0,
                y: 60,
                scale: 0.95,
                duration: 0.8,
                ease: 'power3.out',
                delay: i * 0.1,
                scrollTrigger: {
                    trigger: item,
                    start: 'top 85%'
                }
            });
        });

        // ============================================
        // Quote Section
        // ============================================
        gsap.to('.quote-section blockquote', {
            opacity: 1,
            y: 0,
            duration: 1.2,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.quote-section',
                start: 'top 60%'
            }
        });

        gsap.to('.quote-section cite', {
            opacity: 0.5,
            duration: 1,
            ease: 'power2.out',
            delay: 0.3,
            scrollTrigger: {
                trigger: '.quote-section',
                start: 'top 60%'
            }
        });

        // ============================================
        // Text Section
        // ============================================
        gsap.to('.text-section h2', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.text-section',
                start: 'top 70%'
            }
        });

        gsap.to('.text-section p', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            delay: 0.2,
            scrollTrigger: {
                trigger: '.text-section',
                start: 'top 70%'
            }
        });

        // ============================================
        // Projects Section
        // ============================================
        gsap.to('.projects-header .reveal', {
            opacity: 1,
            y: 0,
            duration: 1,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.projects-section',
                start: 'top 80%'
            }
        });

        gsap.utils.toArray('.project-card').forEach((card, i) => {
            gsap.to(card, {
                opacity: 1,
                y: 0,
                duration: 0.8,
                ease: 'power3.out',
                delay: i * 0.15,
                scrollTrigger: {
                    trigger: card,
                    start: 'top 85%'
                }
            });

            // Card tilt effect
            if (window.matchMedia('(pointer: fine)').matches) {
                const inner = card.querySelector('.project-card-inner');

                card.addEventListener('mousemove', (e) => {
                    const rect = card.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    const centerX = rect.width / 2;
                    const centerY = rect.height / 2;
                    const rotateX = (y - centerY) / 20;
                    const rotateY = (centerX - x) / 20;

                    gsap.to(inner, {
                        rotateX: rotateX,
                        rotateY: rotateY,
                        duration: 0.3,
                        ease: 'power2.out'
                    });
                });

                card.addEventListener('mouseleave', () => {
                    gsap.to(inner, {
                        rotateX: 0,
                        rotateY: 0,
                        duration: 0.6,
                        ease: 'elastic.out(1, 0.5)'
                    });
                });
            }
        });

        // ============================================
        // Links Section
        // ============================================
        gsap.to('.links-container h2', {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: 'power3.out',
            scrollTrigger: {
                trigger: '.links-section',
                start: 'top 80%'
            }
        });

        gsap.utils.toArray('.link-button').forEach((btn, i) => {
            gsap.to(btn, {
                opacity: 1,
                y: 0,
                duration: 0.6,
                ease: 'power3.out',
                delay: 0.1 + (i * 0.1),
                scrollTrigger: {
                    trigger: '.links-section',
                    start: 'top 80%'
                }
            });
        });

        // ============================================
        // GLightbox
        // ============================================
        const lightbox = GLightbox({
            touchNavigation: true,
            loop: true,
            autoplayVideos: false
        });

        // ============================================
        // Smooth Scroll Navigation
        // ============================================
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    lenis.scrollTo(target);
                }
            });
        });

        // ============================================
        // Back to Top Button
        // ============================================
        const backToTop = document.getElementById('backToTop');

        lenis.on('scroll', ({ scroll }) => {
            if (scroll > 500) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        });

        backToTop.addEventListener('click', () => {
            lenis.scrollTo(0);
        });

        // ============================================
        // Image Loading States
        // ============================================
        document.querySelectorAll('.gallery-item img, .bento-item img, .project-card-image img').forEach(img => {
            // Handle already loaded images (cached)
            if (img.complete) {
                img.classList.add('loaded');
                img.parentElement.classList.add('image-loaded');
            } else {
                img.addEventListener('load', () => {
                    img.classList.add('loaded');
                    img.parentElement.classList.add('image-loaded');
                });
            }
        });
