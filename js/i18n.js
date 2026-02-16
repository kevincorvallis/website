(function() {
    'use strict';

    var LANGS = {
        en: { label: 'EN', name: 'English' },
        fr: { label: 'FR', name: 'Français' },
        ko: { label: 'KO', name: '한국어' },
        ja: { label: 'JA', name: '日本語' }
    };

    var CJK_FONTS = {
        serif: {
            ko: { family: 'Noto Serif KR', url: 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;600&display=swap' },
            ja: { family: 'Noto Serif JP', url: 'https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@400;600&display=swap' }
        },
        sans: {
            ko: { family: 'Noto Sans KR', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&display=swap' },
            ja: { family: 'Noto Sans JP', url: 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap' }
        }
    };

    var currentLang = 'en';
    var originals = new Map();
    var originalTitle = '';
    var originalMetaDesc = '';

    function detectLang() {
        var params = new URLSearchParams(window.location.search);
        var urlLang = params.get('lang');
        if (urlLang && LANGS[urlLang]) return urlLang;
        var stored = localStorage.getItem('lang');
        if (stored && LANGS[stored]) return stored;
        var nav = (navigator.language || '').slice(0, 2);
        if (LANGS[nav]) return nav;
        return 'en';
    }

    function storeOriginals() {
        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            if (!originals.has(el)) originals.set(el, { type: 'text', value: el.textContent });
        });
        document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
            if (!originals.has(el)) originals.set(el, { type: 'html', value: el.innerHTML });
        });
        originalTitle = document.title;
        var meta = document.querySelector('meta[name="description"]');
        if (meta) originalMetaDesc = meta.getAttribute('content');
    }

    function restoreOriginals() {
        originals.forEach(function(data, el) {
            if (data.type === 'text') el.textContent = data.value;
            else el.innerHTML = data.value;
        });
        document.title = originalTitle;
        var meta = document.querySelector('meta[name="description"]');
        if (meta && originalMetaDesc) meta.setAttribute('content', originalMetaDesc);
        var yearEl = document.getElementById('copyrightYear');
        if (yearEl) yearEl.textContent = new Date().getFullYear();
    }

    function loadTranslations(lang) {
        return fetch('/i18n/' + lang + '.json')
            .then(function(res) { return res.ok ? res.json() : null; })
            .catch(function() { return null; });
    }

    function interpolate(str, vars) {
        return str.replace(/\{(\w+)\}/g, function(_, k) {
            return vars[k] !== undefined ? vars[k] : '{' + k + '}';
        });
    }

    function resolve(obj, key) {
        return key.split('.').reduce(function(o, k) { return o && o[k]; }, obj);
    }

    function applyTranslations(data) {
        if (!data) return;
        var vars = { year: new Date().getFullYear() };
        var page = document.documentElement.getAttribute('data-i18n-page');

        document.querySelectorAll('[data-i18n]').forEach(function(el) {
            var val = resolve(data, el.getAttribute('data-i18n'));
            if (val) el.textContent = interpolate(val, vars);
        });

        document.querySelectorAll('[data-i18n-html]').forEach(function(el) {
            var val = resolve(data, el.getAttribute('data-i18n-html'));
            if (val) el.innerHTML = interpolate(val, vars);
        });

        if (page && resolve(data, page + '.pageTitle')) {
            document.title = resolve(data, page + '.pageTitle');
        }
        if (page && resolve(data, page + '.metaDescription')) {
            var meta = document.querySelector('meta[name="description"]');
            if (meta) meta.setAttribute('content', resolve(data, page + '.metaDescription'));
        }

        document.dispatchEvent(new CustomEvent('i18n:applied'));
    }

    function loadCJKFont(lang) {
        var page = document.documentElement.getAttribute('data-i18n-page');
        var isSans = page === 'brock';
        var fontSet = isSans ? CJK_FONTS.sans : CJK_FONTS.serif;
        var config = fontSet[lang];

        document.querySelectorAll('link[data-i18n-font]').forEach(function(el) { el.remove(); });

        if (!config) {
            document.documentElement.style.removeProperty('--font');
            return;
        }

        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = config.url;
        link.setAttribute('data-i18n-font', lang);
        document.head.appendChild(link);

        var base = isSans
            ? "'Satoshi', -apple-system, sans-serif"
            : "'Newsreader', Georgia, 'Times New Roman', serif";
        document.documentElement.style.setProperty('--font', "'" + config.family + "', " + base);
    }

    function removeCJKFont() {
        document.querySelectorAll('link[data-i18n-font]').forEach(function(el) { el.remove(); });
        document.documentElement.style.removeProperty('--font');
    }

    function injectStyles() {
        if (document.querySelector('style[data-i18n-styles]')) return;
        var s = document.createElement('style');
        s.setAttribute('data-i18n-styles', '');
        s.textContent =
            '.header-controls{display:flex;align-items:center;gap:12px}' +
            '.lang-switcher{position:relative}' +
            '.lang-btn{background:none;border:none;color:var(--text);font-family:var(--font);font-size:14px;font-weight:600;cursor:pointer;padding:4px 2px;opacity:0.7;transition:opacity 0.2s}' +
            '.lang-btn:hover{opacity:1}' +
            '.lang-btn::after{content:" ▾";font-size:10px}' +
            '.lang-menu{display:none;position:absolute;top:100%;right:0;background:var(--bg);border:1px solid var(--text);border-radius:6px;padding:4px 0;min-width:120px;z-index:100;margin-top:4px}' +
            '.lang-menu.open{display:block}' +
            '.lang-menu button{display:block;width:100%;background:none;border:none;color:var(--text);font-family:var(--font);font-size:14px;padding:6px 14px;cursor:pointer;text-align:left;transition:opacity 0.2s}' +
            '.lang-menu button:hover{opacity:0.6}' +
            '.lang-menu button.active{font-weight:600}' +
            '.brock-lang-switcher{position:fixed;top:1.25rem;right:1.25rem;z-index:50;mix-blend-mode:difference}' +
            '.brock-lang-switcher .lang-btn{font-size:0.7rem;letter-spacing:0.12em;text-transform:uppercase;opacity:0.6;color:#f0f0ec}' +
            '.brock-lang-switcher .lang-btn:hover{opacity:1}' +
            '.brock-lang-switcher .lang-menu{background:#0a0a0a;color:#f0f0ec;border-color:rgba(255,255,255,0.2)}' +
            '.brock-lang-switcher .lang-menu button{color:#f0f0ec}';
        document.head.appendChild(s);
    }

    function createSwitcherDOM() {
        var switcher = document.createElement('div');
        switcher.className = 'lang-switcher';

        var btn = document.createElement('button');
        btn.className = 'lang-btn';
        btn.id = 'lang-btn';
        btn.textContent = LANGS[currentLang].label;
        btn.setAttribute('aria-label', 'Change language');

        var menu = document.createElement('div');
        menu.className = 'lang-menu';
        menu.id = 'lang-menu';

        Object.keys(LANGS).forEach(function(code) {
            var item = document.createElement('button');
            item.textContent = LANGS[code].name;
            item.setAttribute('data-lang', code);
            if (code === currentLang) item.classList.add('active');
            item.addEventListener('click', function() { switchLang(code); });
            menu.appendChild(item);
        });

        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            menu.classList.toggle('open');
        });

        document.addEventListener('click', function() { menu.classList.remove('open'); });

        switcher.appendChild(btn);
        switcher.appendChild(menu);
        return switcher;
    }

    function buildSwitcher() {
        injectStyles();
        var page = document.documentElement.getAttribute('data-i18n-page');

        if (page === 'brock') {
            var wrapper = document.createElement('div');
            wrapper.className = 'brock-lang-switcher';
            wrapper.appendChild(createSwitcherDOM());
            document.body.appendChild(wrapper);
        } else {
            var header = document.querySelector('header');
            if (!header) return;
            var toggleWrap = header.querySelector('.toggle-wrap');
            if (!toggleWrap) return;
            var controls = document.createElement('div');
            controls.className = 'header-controls';
            controls.appendChild(createSwitcherDOM());
            toggleWrap.parentNode.insertBefore(controls, toggleWrap);
            controls.appendChild(toggleWrap);
        }
    }

    function updateSwitcherUI() {
        var btn = document.getElementById('lang-btn');
        if (btn) btn.textContent = LANGS[currentLang].label;
        document.querySelectorAll('.lang-menu button').forEach(function(b) {
            b.classList.toggle('active', b.getAttribute('data-lang') === currentLang);
        });
    }

    function switchLang(lang) {
        if (lang === currentLang) return;
        currentLang = lang;
        localStorage.setItem('lang', lang);

        var url = new URL(window.location);
        url.searchParams.delete('lang');
        window.history.replaceState({}, '', url);

        var menu = document.getElementById('lang-menu');
        if (menu) menu.classList.remove('open');

        restoreOriginals();

        if (lang !== 'en') {
            loadTranslations(lang).then(function(data) {
                if (data) applyTranslations(data);
                loadCJKFont(lang);
                document.documentElement.setAttribute('lang', lang);
                updateSwitcherUI();
            });
        } else {
            removeCJKFont();
            document.documentElement.setAttribute('lang', 'en');
            updateSwitcherUI();
        }
    }

    function init() {
        currentLang = detectLang();

        var yearEl = document.getElementById('copyrightYear');
        if (yearEl) yearEl.textContent = new Date().getFullYear();

        buildSwitcher();
        storeOriginals();

        if (currentLang !== 'en') {
            loadTranslations(currentLang).then(function(data) {
                if (data) {
                    applyTranslations(data);
                    loadCJKFont(currentLang);
                }
                document.documentElement.setAttribute('lang', currentLang);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
