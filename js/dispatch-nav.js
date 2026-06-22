/* dispatch-nav.js — shared "jump" drawer + terminal status line for Dispatch issues.
 *
 * Touch-first: a floating ❯ button (bottom-right) opens a tappable section index.
 * Desktop bonus: ⌘K / Ctrl+K toggles it, ↑/↓ + Enter navigate, Esc closes.
 *
 * Sections are discovered automatically:
 *   - elements with [data-jump] (label via data-jump-en / data-jump-ko), else
 *   - .chapter-mark titles (reads the active-language .ttl text)
 * "Top" and "Subscribe" are always added as bookends.
 *
 * Status line reads optional window.DISPATCH = { issue, title, titleKo, built }.
 * Self-injects its own CSS, so an issue only needs:
 *   <script>window.DISPATCH = { ... };</script>
 *   <script src="/js/dispatch-nav.js"></script>
 */
(function () {
    'use strict';

    var docEl = document.documentElement;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function lang() { return docEl.getAttribute('data-lang') === 'ko' ? 'ko' : 'en'; }
    function t(en, ko) { return lang() === 'ko' ? ko : en; }

    /* ---------- injected styles (uses each issue's CSS custom properties) ---------- */
    var css =
    '.dnav-trigger{position:fixed;right:1.1rem;bottom:max(1.1rem,env(safe-area-inset-bottom,0));z-index:95;width:44px;height:44px;border-radius:50%;border:1px solid var(--rule);background:var(--bg);background:color-mix(in srgb,var(--bg) 74%,transparent);-webkit-backdrop-filter:blur(18px) saturate(1.4);backdrop-filter:blur(18px) saturate(1.4);color:var(--text);font-family:var(--mono);font-size:16px;line-height:1;cursor:pointer;display:grid;place-items:center;box-shadow:0 6px 16px -6px rgba(0,0,0,.18),0 20px 50px -24px rgba(0,0,0,.30);transition:transform .18s cubic-bezier(.34,1.56,.64,1),background-color .3s ease,border-color .3s ease,color .3s ease}' +
    '.dnav-trigger:hover{transform:scale(1.06)}.dnav-trigger:active{transform:scale(.93)}' +
    '.dnav-overlay{position:fixed;inset:0;z-index:180;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.28);-webkit-backdrop-filter:blur(2px);backdrop-filter:blur(2px);opacity:0;transition:opacity .3s ease}' +
    '.dnav-overlay.is-open{opacity:1}.dnav-overlay[hidden]{display:none}' +
    '@media (min-width:768px){.dnav-overlay{align-items:center}}' +
    '.dnav-panel{width:100%;max-width:560px;max-height:75vh;display:flex;flex-direction:column;overflow:hidden;background:var(--bg);border:1px solid var(--rule);border-radius:16px 16px 0 0;box-shadow:0 -10px 60px -20px rgba(0,0,0,.5);transform:translateY(16px);transition:transform .3s cubic-bezier(.22,.61,.36,1)}' +
    '.dnav-overlay.is-open .dnav-panel{transform:translateY(0)}' +
    '@media (min-width:768px){.dnav-panel{border-radius:12px;margin:0 1rem}}' +
    '.dnav-head{display:flex;align-items:center;gap:.6rem;padding:1rem 1.2rem;border-bottom:1px solid var(--rule);font-family:var(--mono);font-size:12px;letter-spacing:.06em;color:var(--caption)}' +
    '.dnav-prompt{color:var(--accent);font-weight:600}' +
    '.dnav-title{flex:1;text-transform:uppercase;letter-spacing:.16em}' +
    '.dnav-kbd{border:1px solid var(--rule);border-radius:5px;padding:2px 7px;font-size:10px;text-transform:uppercase}' +
    '.dnav-list{list-style:none;margin:0;padding:.5rem;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
    '.dnav-item{display:flex;align-items:center;gap:.9rem;padding:.85rem 1rem;border-radius:9px;cursor:pointer;font-family:var(--font);font-size:17px;color:var(--text);transition:background-color .15s ease}' +
    '.dnav-item:hover,.dnav-item.is-active{background:color-mix(in srgb,var(--accent) 14%,transparent)}' +
    '.dnav-idx{font-family:var(--mono);font-size:11px;color:var(--accent);opacity:.7;min-width:1.7em}' +
    '.dnav-label{flex:1}' +
    '.dnav-status{margin-top:1rem;font-family:var(--mono);font-size:11px;letter-spacing:.04em;color:var(--caption);display:inline-flex;align-items:center;gap:.4em;flex-wrap:wrap;justify-content:center}' +
    '.dnav-status .dnav-prompt{color:var(--accent)}.dnav-status .dnav-dim{opacity:.7}' +
    '.dnav-clock{font-variant-numeric:tabular-nums}' +
    '.dnav-rec{width:7px;height:7px;border-radius:50%;background:#c0563e;display:inline-block;margin-left:.3em;animation:dnav-rec 1.4s cubic-bezier(.4,0,.2,1) infinite}' +
    '[data-theme="dark"] .dnav-status .dnav-rec{background:#d96a4f}' +
    '@keyframes dnav-rec{0%,100%{opacity:.55;transform:scale(1)}50%{opacity:1;transform:scale(1.35)}}' +
    '@media print{.dnav-trigger,.dnav-overlay{display:none!important}}' +
    '@media (prefers-reduced-motion:reduce){.dnav-rec{animation:none}.dnav-overlay,.dnav-panel,.dnav-trigger{transition:none}}';
    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* ---------- read the active-language text from a node holding data-l spans ---------- */
    function activeText(el) {
        if (!el) return '';
        var spans = el.querySelectorAll('[data-l]');
        if (spans.length) {
            var l = lang(), out = '';
            Array.prototype.forEach.call(spans, function (s) {
                if (s.getAttribute('data-l') === l) out += s.textContent;
            });
            out = out.trim();
            if (out) return out;
        }
        return (el.textContent || '').trim();
    }

    /* ---------- discover navigable sections ---------- */
    function sections() {
        var list = [];
        var hero = document.querySelector('.hero') || document.body;
        list.push({ target: hero, label: t('Top', '맨 위') });

        var explicit = document.querySelectorAll('[data-jump]');
        if (explicit.length) {
            Array.prototype.forEach.call(explicit, function (el) {
                var en = el.getAttribute('data-jump-en');
                var ko = el.getAttribute('data-jump-ko');
                var label = (en || ko) ? t(en || ko, ko || en)
                          : (el.getAttribute('data-jump') || activeText(el.querySelector('.chapter-mark .ttl')));
                if (label) list.push({ target: el, label: label });
            });
        } else {
            Array.prototype.forEach.call(document.querySelectorAll('.chapter-mark'), function (m) {
                var label = activeText(m.querySelector('.ttl') || m);
                if (label) list.push({ target: m.closest('.chapter') || m, label: label });
            });
        }

        var sub = document.getElementById('subscribe');
        if (sub) list.push({ target: sub, label: t('Subscribe', '구독') });
        return list;
    }

    /* ---------- trigger button ---------- */
    var trigger = document.createElement('button');
    trigger.className = 'dnav-trigger';
    trigger.type = 'button';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.innerHTML = '<span aria-hidden="true">❯</span>';
    function syncTriggerLabel() { trigger.setAttribute('aria-label', t('Jump to a section', '섹션으로 이동')); }
    syncTriggerLabel();
    document.body.appendChild(trigger);

    /* ---------- overlay + panel ---------- */
    var overlay = document.createElement('div');
    overlay.className = 'dnav-overlay';
    overlay.setAttribute('hidden', '');
    overlay.innerHTML =
        '<div class="dnav-panel" role="dialog" aria-modal="true">' +
            '<div class="dnav-head">' +
                '<span class="dnav-prompt" aria-hidden="true">❯</span>' +
                '<span class="dnav-title"></span>' +
                '<span class="dnav-kbd" aria-hidden="true">esc</span>' +
            '</div>' +
            '<ul class="dnav-list" role="listbox"></ul>' +
        '</div>';
    document.body.appendChild(overlay);
    var panel = overlay.querySelector('.dnav-panel');
    var titleEl = overlay.querySelector('.dnav-title');
    var listEl = overlay.querySelector('.dnav-list');

    var open = false, items = [], active = -1, lastFocus = null;

    function render() {
        titleEl.textContent = t('jump to…', '이동…');
        panel.setAttribute('aria-label', t('Jump to a section', '섹션 이동'));
        listEl.innerHTML = '';
        items = [];
        sections().forEach(function (s, i) {
            var li = document.createElement('li');
            li.className = 'dnav-item';
            li.setAttribute('role', 'option');
            li.tabIndex = -1;
            var idx = document.createElement('span');
            idx.className = 'dnav-idx';
            idx.setAttribute('aria-hidden', 'true');
            idx.textContent = ('0' + i).slice(-2);
            var label = document.createElement('span');
            label.className = 'dnav-label';
            label.textContent = s.label;
            li.appendChild(idx);
            li.appendChild(label);
            li.addEventListener('click', function () { go(s.target); });
            listEl.appendChild(li);
            items.push(li);
        });
    }

    function setActive(n) {
        if (!items.length) return;
        active = (n + items.length) % items.length;
        items.forEach(function (li, i) { li.classList.toggle('is-active', i === active); });
        items[active].scrollIntoView({ block: 'nearest' });
        items[active].focus();
    }

    function openDrawer() {
        if (open) return;
        render();
        lastFocus = document.activeElement;
        overlay.removeAttribute('hidden');
        void overlay.offsetWidth; // reflow so the transition runs
        overlay.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        open = true;
        setActive(0);
    }

    function closeDrawer() {
        if (!open) return;
        overlay.classList.remove('is-open');
        document.body.style.overflow = '';
        open = false;
        var done = function () { overlay.setAttribute('hidden', ''); overlay.removeEventListener('transitionend', done); };
        if (reduce) done(); else overlay.addEventListener('transitionend', done);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function go(target) {
        closeDrawer();
        if (target) target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }

    trigger.addEventListener('click', function () { open ? closeDrawer() : openDrawer(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeDrawer(); });

    document.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault(); open ? closeDrawer() : openDrawer(); return;
        }
        if (!open) return;
        if (e.key === 'Escape') { e.preventDefault(); closeDrawer(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter' && items[active]) { e.preventDefault(); items[active].click(); }
    });

    /* ---------- terminal status line (appended into .story-footer) ---------- */
    var renderStatus = (function () {
        var footer = document.querySelector('.story-footer');
        if (!footer) return function () {};
        var cfg = window.DISPATCH || {};
        var p = document.createElement('p');
        p.className = 'dnav-status';
        footer.appendChild(p);

        function clock() {
            var d = new Date();
            return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
        }
        function render() {
            var issue = cfg.issue ? (t('dispatch ', '디스패치 ') + cfg.issue) : 'dispatch';
            var title = lang() === 'ko' ? (cfg.titleKo || cfg.title || '') : (cfg.title || '');
            var meta = (cfg.built ? ' · ' + t('published ', '발행 ') + cfg.built : '') + ' · ' + t('your time ', '현지 ');
            p.innerHTML =
                '<span class="dnav-prompt" aria-hidden="true">❯</span> ' +
                '<span>' + issue + (title ? ' · ' + title : '') + '</span>' +
                '<span class="dnav-dim">' + meta + '</span>' +
                '<span class="dnav-clock">' + clock() + '</span>' +
                '<span class="dnav-rec" aria-hidden="true"></span>';
        }
        render();
        setInterval(function () {
            var c = p.querySelector('.dnav-clock');
            if (c) c.textContent = clock();
        }, 1000);
        return render;
    })();

    /* ---------- keep labels correct when the language toggles ---------- */
    new MutationObserver(function () {
        syncTriggerLabel();
        renderStatus();
        if (open) render();
    }).observe(docEl, { attributes: true, attributeFilter: ['data-lang'] });
})();
