/* ───────────────────────────────────────────────────────────────────────────
   Editorial microfeatures — shared, dependency-free, progressive enhancement.
   Self-linking headings · external-link icons · reading progress · hover
   link-previews · Tufte sidenotes. Pairs with css/microfeatures.css.
   If this script fails to load, every page still works as plain HTML.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';
    var doc = document, root = doc.documentElement, body = doc.body;
    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var fine = matchMedia('(pointer: fine)').matches;
    var SITE_HOSTS = { 'klee.page': 1, 'www.klee.page': 1 };
    SITE_HOSTS[location.hostname] = 1; // include localhost / preview host

    function skip(name) {
        var s = root.getAttribute('data-mfx-skip') || '';
        return s.split(/[\s,]+/).indexOf(name) >= 0;
    }
    function isInternal(href) {
        if (!href) return false;
        if (href[0] === '#' || href[0] === '/') return true;
        try { return !!SITE_HOSTS[new URL(href, location.href).hostname]; }
        catch (e) { return false; }
    }
    function slugify(s) {
        return s.toLowerCase().trim()
            .replace(/[^\w\s-]/g, '')
            .replace(/[\s_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'section';
    }

    /* ── "Copied" toast ──────────────────────────────────────────────────── */
    var toastEl = null, toastT = null;
    function toast(msg) {
        if (!toastEl) {
            toastEl = doc.createElement('div');
            toastEl.className = 'mfx-toast';
            toastEl.setAttribute('role', 'status');
            toastEl.setAttribute('aria-live', 'polite');
            body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        // reflow then show
        void toastEl.offsetWidth;
        toastEl.classList.add('is-in');
        clearTimeout(toastT);
        toastT = setTimeout(function () { toastEl.classList.remove('is-in'); }, 1600);
    }

    /* ── 1. Self-linking headings ────────────────────────────────────────── */
    function headings() {
        var used = {};
        doc.querySelectorAll('[id]').forEach(function (el) { used[el.id] = 1; });
        var hs = [].slice.call(doc.querySelectorAll('h2, h3'));
        hs.forEach(function (h) {
            if (h.closest('header, nav, footer, form, .subscribe, .comments')) return;
            if (h.classList.contains('sr-only') || h.querySelector('.mfx-anchor')) return;
            if (h.querySelector('[data-l]')) return; // bilingual chrome (e.g. Dispatch headers) — skip
            var id = h.id;
            if (!id) {
                id = slugify(h.textContent);
                var base = id, n = 2;
                while (used[id]) id = base + '-' + (n++);
                h.id = id;
            }
            used[id] = 1;
            // Translated heading: move the i18n attr onto an inner span so
            // re-translation updates only the text and never wipes the anchor.
            var i18nAttr = h.hasAttribute('data-i18n') ? 'data-i18n'
                : (h.hasAttribute('data-i18n-html') ? 'data-i18n-html' : null);
            if (i18nAttr) {
                var span = doc.createElement('span');
                span.setAttribute(i18nAttr, h.getAttribute(i18nAttr));
                while (h.firstChild) span.appendChild(h.firstChild);
                h.removeAttribute(i18nAttr);
                h.appendChild(span);
            }
            var a = doc.createElement('a');
            a.className = 'mfx-anchor';
            a.href = '#' + id;
            a.textContent = '¶';
            a.setAttribute('aria-label', 'Copy link to this section');
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var url = location.origin + location.pathname + '#' + id;
                if (history.replaceState) history.replaceState(null, '', '#' + id);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(url).then(function () { toast('Link copied'); },
                        function () { toast('#' + id); });
                } else { toast('#' + id); }
            });
            h.appendChild(a);
        });
    }

    /* ── 2. External-link icons + safe rel ───────────────────────────────── */
    function externalLinks() {
        [].slice.call(doc.querySelectorAll('a[href]')).forEach(function (a) {
            var href = a.getAttribute('href');
            if (!href || href[0] === '#') return;
            if (/^(mailto:|tel:|javascript:)/i.test(href)) return;
            if (isInternal(href)) return;
            var u;
            try { u = new URL(href, location.href); } catch (e) { return; }
            a.setAttribute('data-mfx-ext', '');
            a.setAttribute('data-mfx-host', u.hostname.replace(/^www\./, ''));
            var rel = a.getAttribute('rel') || '';
            if (rel.indexOf('noopener') < 0) a.setAttribute('rel', (rel ? rel + ' ' : '') + 'noopener noreferrer');
            // skip the trailing icon on image / icon-only links
            if (a.querySelector('img, svg, picture')) a.setAttribute('data-mfx-noicon', '');
        });
    }

    /* ── 3. Reading progress ─────────────────────────────────────────────── */
    function readingProgress() {
        if (skip('progress')) return;
        if (doc.querySelector('.mf-progress-top, .mfx-progress, .progress-bar')) return; // page already has a progress bar (MERFISH, Dispatch)
        var bar = doc.createElement('div');
        bar.className = 'mfx-progress';
        bar.setAttribute('aria-hidden', 'true');
        var fill = doc.createElement('div');
        fill.className = 'mfx-progress__fill';
        bar.appendChild(fill);
        body.appendChild(bar);
        var ticking = false;
        function update() {
            var h = doc.documentElement.scrollHeight - innerHeight;
            var y = scrollY || doc.documentElement.scrollTop;
            var p = h > 0 ? Math.min(1, Math.max(0, y / h)) : 0;
            fill.style.transform = 'scaleX(' + p.toFixed(4) + ')';
            ticking = false;
        }
        addEventListener('scroll', function () {
            if (!ticking) { ticking = true; requestAnimationFrame(update); }
        }, { passive: true });
        addEventListener('resize', update, { passive: true });
        update();
    }

    /* ── 4. Hover link previews ──────────────────────────────────────────── */
    var GLOBE = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6'><circle cx='12' cy='12' r='9'/><path d='M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'/></svg>";
    function linkPreviews() {
        if (!fine) return;
        var card = null, showT = null, ctrl = null, current = null;
        var cache = {};      // href -> {title, desc} | null (internal)
        var notes = {};      // curated external annotations
        fetch('/js/link-previews.json').then(function (r) { return r.ok ? r.json() : {}; })
            .then(function (j) { notes = j || {}; }).catch(function () { notes = {}; });

        function ensureCard() {
            if (card) return card;
            card = doc.createElement('div');
            card.className = 'mfx-preview';
            card.setAttribute('role', 'tooltip');
            body.appendChild(card);
            return card;
        }
        function place(a) {
            var r = a.getBoundingClientRect(), c = ensureCard();
            c.style.visibility = 'hidden'; c.style.display = 'block';
            var cw = c.offsetWidth, ch = c.offsetHeight;
            var left = Math.min(Math.max(8, r.left), innerWidth - cw - 8);
            var top = r.bottom + 8;
            if (top + ch > innerHeight - 8) top = Math.max(8, r.top - ch - 8);
            c.style.left = left + 'px';
            c.style.top = top + 'px';
            c.style.visibility = '';
        }
        function render(a, data, host, note) {
            var c = ensureCard(), html = '';
            html += '<div class="mfx-preview__host">' + (note && note.icon ? note.icon : GLOBE) +
                '<span>' + (host || 'klee.page') + '</span></div>';
            var title = (note && note.title) || (data && data.title) || '';
            var desc = (note && note.note) || (data && data.desc) || '';
            if (title) html += '<div class="mfx-preview__title"></div>';
            if (desc) html += '<div class="mfx-preview__desc"></div>';
            c.innerHTML = html;
            if (title) c.querySelector('.mfx-preview__title').textContent = title;
            if (desc) c.querySelector('.mfx-preview__desc').textContent = desc;
            place(a);
            requestAnimationFrame(function () { c.classList.add('is-in'); });
        }
        function fetchInternal(href, cb) {
            if (href in cache) return cb(cache[href]);
            if (ctrl) ctrl.abort();
            ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
            fetch(href, ctrl ? { signal: ctrl.signal } : undefined)
                .then(function (r) { return r.ok ? r.text() : ''; })
                .then(function (t) {
                    var d = null;
                    if (t) {
                        var dp = new DOMParser().parseFromString(t, 'text/html');
                        var title = (dp.querySelector('title') || {}).textContent || '';
                        title = title.replace(/\s*[—–|]\s*Kevin Lee\s*$/, '').trim();
                        var m = dp.querySelector('meta[name="description"], meta[property="og:description"]');
                        d = { title: title, desc: m ? m.getAttribute('content') : '' };
                    }
                    cache[href] = d; cb(d);
                })
                .catch(function () { cache[href] = null; cb(null); });
        }
        function show(a) {
            var href = a.getAttribute('href');
            if (isInternal(href)) {
                if (href[0] === '#') return;
                var internalUrl;
                try { internalUrl = new URL(href, location.href); } catch (e) { return; }
                if (internalUrl.pathname === location.pathname) return; // same page
                fetchInternal(internalUrl.pathname, function (d) {
                    if (current !== a) return;
                    if (!d || (!d.title && !d.desc)) return;
                    render(a, d, 'klee.page', null);
                });
            } else {
                var u; try { u = new URL(href, location.href); } catch (e) { return; }
                var host = u.hostname.replace(/^www\./, '');
                var note = notes[href] || notes[u.origin + u.pathname] || notes[host] || null;
                render(a, null, host, note);
            }
        }
        function hide() {
            current = null;
            if (ctrl) { ctrl.abort(); ctrl = null; }
            clearTimeout(showT);
            if (card) card.classList.remove('is-in');
        }
        function onEnter(e) {
            var a = e.target.closest && e.target.closest('a[href]');
            if (!a || a.classList.contains('mfx-anchor')) return;
            if (a === current) return; // already tracking this link — ignore intra-link child moves
            var href = a.getAttribute('href');
            if (!href || href[0] === '#' || /^(mailto:|tel:|javascript:)/i.test(href)) return;
            current = a;
            clearTimeout(showT);
            showT = setTimeout(function () { if (current === a) show(a); }, 130);
        }
        function onLeave(e) {
            var a = e.target.closest && e.target.closest('a[href]');
            // ignore transitions that stay inside the same link (it has inline children)
            if (a && a === current && !a.contains(e.relatedTarget)) hide();
        }
        body.addEventListener('mouseover', onEnter);
        body.addEventListener('mouseout', onLeave);
        body.addEventListener('focusin', onEnter);
        body.addEventListener('focusout', onLeave);
        addEventListener('scroll', hide, { passive: true });
        addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
    }

    /* ── 5. Sidenotes / marginnotes ──────────────────────────────────────── *
     * Two placements, auto-detected:
     *   inline  <span class="mfx-sn">…</span>  → numbered ref in the prose, note
     *           floats to the margin (wide) / collapses to tap-to-expand (narrow)
     *   aside   <aside class="mfx-sn">…</aside> → standalone margin note, always
     *           shown (used for paragraph-attached notes, e.g. Clean Pain)
     * Numbering resets per language scope ([data-l]) so EN/KO each count from 1. */
    function sidenotes() {
        var notes = [].slice.call(doc.querySelectorAll('.mfx-sn'));
        var counters = {};
        notes.forEach(function (note) {
            if (note.dataset.mfxReady) return;
            note.dataset.mfxReady = '1';
            var scopeEl = note.closest('[data-l]');
            var scope = scopeEl ? scopeEl.getAttribute('data-l') : 'g';
            counters[scope] = (counters[scope] || 0) + 1;
            var n = counters[scope];
            var isAside = note.tagName === 'ASIDE' || note.hasAttribute('data-mfx-aside');
            note.setAttribute('role', 'note');
            note.classList.add(isAside ? 'mfx-sn--aside' : 'mfx-sn--inline');
            var num = doc.createElement('span');
            num.className = 'mfx-sn__num';
            num.textContent = n;
            note.insertBefore(num, note.firstChild);
            if (isAside) return; // standalone margin note — no inline ref/toggle
            var id = 'mfx-sn-' + scope + '-' + n;
            var ref = doc.createElement('label');
            ref.className = 'mfx-sn-ref';
            ref.setAttribute('for', id);
            ref.textContent = n;
            ref.setAttribute('role', 'doc-noteref');
            ref.setAttribute('tabindex', '0');
            ref.setAttribute('aria-label', 'Note ' + n);
            var cb = doc.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'mfx-sn-toggle';
            cb.id = id;
            cb.setAttribute('aria-hidden', 'true');
            ref.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cb.checked = !cb.checked; }
            });
            note.parentNode.insertBefore(ref, note);
            note.parentNode.insertBefore(cb, note);
        });
    }

    function init() {
        try { headings(); } catch (e) {}
        try { externalLinks(); } catch (e) {}
        try { readingProgress(); } catch (e) {}
        try { sidenotes(); } catch (e) {}
        try { linkPreviews(); } catch (e) {}
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init);
    else init();
})();
