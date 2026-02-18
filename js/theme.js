// ——— Theme Toggle ———
const toggle = document.getElementById('theme-toggle');
const toggleLabel = toggle.nextElementSibling;

// Sync checkbox with current theme
toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';

// Enable dot transition after 100ms (prevents slide on page load)
setTimeout(() => {
    toggleLabel.classList.add('has-transition');
}, 100);

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
