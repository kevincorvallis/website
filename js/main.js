// Copyright Year
document.getElementById('copyrightYear').textContent = new Date().getFullYear();

// ——— Theme Toggle ———
const toggle = document.getElementById('theme-toggle');

// Sync checkbox with current theme
toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';

toggle.addEventListener('change', () => {
    const next = toggle.checked ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
});

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
        const theme = e.matches ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        toggle.checked = e.matches;
    }
});
