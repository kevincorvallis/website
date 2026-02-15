// Copyright Year
document.getElementById('copyrightYear').textContent = new Date().getFullYear();

// ——— Theme Toggle (instant swap) ———
const toggle = document.getElementById('theme-toggle');

toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';

toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';

    // Disable all transitions for instant swap
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { transition: none !important; }';
    document.head.appendChild(style);

    // Apply theme
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);

    // Force repaint, then re-enable transitions
    getComputedStyle(style).opacity;
    document.head.removeChild(style);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        const theme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        toggle.checked = e.matches;
    }
});
