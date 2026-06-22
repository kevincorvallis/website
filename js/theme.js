// ——— Theme Toggle ———
const toggle = document.getElementById('theme-toggle');
const toggleLabel = toggle.nextElementSibling;

// Sync checkbox with current theme
toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';

// Enable dot transition after 100ms (prevents slide on page load)
setTimeout(() => {
    toggleLabel.classList.add('has-transition');
}, 100);

// ——— Golden-hour transition ———
// The dark/light flip plays as a brief dusk/dawn: a warm sky washes over the
// page and a sun sets (→dark) or rises (→light) while the theme swaps underneath.
// Fully self-contained (injects its own overlay + styles); respects reduced-motion.
let ghLayer;
function goldenHour(next, apply) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || document.hidden) { apply(); return; }

    if (!ghLayer) {
        const style = document.createElement('style');
        style.textContent =
            '#gh-sweep{position:fixed;inset:0;z-index:90;pointer-events:none;opacity:0;}' +
            '#gh-sweep.to-dark{background:linear-gradient(to bottom,#f7c069 0%,#e0925c 26%,#8a5f86 60%,#241f47 100%);}' +
            '#gh-sweep.to-light{background:linear-gradient(to top,#f7c069 0%,#e0925c 26%,#8a5f86 60%,#241f47 100%);}' +
            '#gh-sweep .gh-sun{position:absolute;left:50%;width:44vmin;height:44vmin;margin-left:-22vmin;border-radius:50%;' +
            'background:radial-gradient(circle,rgba(255,224,158,0.95) 0%,rgba(255,201,120,0.55) 42%,rgba(255,201,120,0) 70%);}' +
            '@keyframes ghWash{0%{opacity:0}22%{opacity:.9}68%{opacity:.78}100%{opacity:0}}' +
            '@keyframes ghSunSet{0%{transform:translateY(8vh)}100%{transform:translateY(64vh)}}' +
            '@keyframes ghSunRise{0%{transform:translateY(64vh)}100%{transform:translateY(8vh)}}' +
            '#gh-sweep.run{animation:ghWash 760ms ease-in forwards}' +
            '#gh-sweep.run.to-dark .gh-sun{animation:ghSunSet 760ms cubic-bezier(.45,0,.5,1) forwards}' +
            '#gh-sweep.run.to-light .gh-sun{animation:ghSunRise 760ms cubic-bezier(.45,0,.5,1) forwards}';
        document.head.appendChild(style);
        ghLayer = document.createElement('div');
        ghLayer.id = 'gh-sweep';
        const sun = document.createElement('div');
        sun.className = 'gh-sun';
        ghLayer.appendChild(sun);
        document.body.appendChild(ghLayer);
    }

    ghLayer.classList.remove('run', 'to-dark', 'to-light');
    void ghLayer.offsetWidth; // restart animation
    ghLayer.classList.add('run', next === 'dark' ? 'to-dark' : 'to-light');
    // Swap the theme near the peak of the wash so the cut is hidden.
    setTimeout(apply, 240);
    setTimeout(() => ghLayer.classList.remove('run', 'to-dark', 'to-light'), 820);
}

toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';
    const apply = () => {
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    };
    goldenHour(next, apply);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        const theme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        toggle.checked = e.matches;
    }
});
