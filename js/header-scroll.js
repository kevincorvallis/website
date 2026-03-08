(function () {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var header = document.querySelector('header');
    var title = document.querySelector('.site-title');
    if (!header || !title) return;

    var hasScrollTimeline = CSS.supports('animation-timeline', 'scroll()');
    var ticking = false;

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
            var y = window.scrollY;
            header.classList.toggle('scrolled', y > 10);
            if (!hasScrollTimeline) {
                title.classList.toggle('collapsed', y > 120);
            }
            ticking = false;
        });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
})();
