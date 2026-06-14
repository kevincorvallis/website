// Dispatch newsletter subscribe flow — shared across the landing template and all
// issues (load via <script src="/js/subscribe.js">).
//
// Posts to /api/subscribe. On a TRANSIENT failure (offline, Supabase/upstream 5xx,
// or 429 rate-limit) it queues the email in localStorage and auto-retries on the
// next page load, so a brief backend outage never silently drops a subscriber.
// A non-transient failure (e.g. 400) shows an error but is not queued. Retries are
// capped so a deterministic failure can't loop forever.
(function () {
    var SUBSCRIBED = 'dispatch-subscribed';
    var PENDING = 'dispatch-pending';
    var MAX_RETRIES = 3;

    var section = document.getElementById('subscribe');

    function post(email) {
        return fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
    }

    function markSubscribed() {
        localStorage.removeItem(PENDING);
        localStorage.setItem(SUBSCRIBED, 'true'); // state only — no PII in storage
        if (section) {
            section.classList.remove('error');
            section.classList.add('submitted');
        }
    }

    function isTransient(err) {
        // offline (no status), server/upstream errors (5xx), or rate-limited (429)
        return !err || !err.status || err.status >= 500 || err.status === 429;
    }

    // Retry a previously-failed signup FIRST — before the subscribed early-return —
    // so a queued email still flushes even on a page already in its subscribed state.
    (function retryPending() {
        var raw = localStorage.getItem(PENDING);
        if (!raw) return;
        var entry;
        try { entry = JSON.parse(raw); } catch (e) { localStorage.removeItem(PENDING); return; }
        if (!entry || !entry.email || entry.retries >= MAX_RETRIES) {
            localStorage.removeItem(PENDING);
            return;
        }
        entry.retries++;
        localStorage.setItem(PENDING, JSON.stringify(entry));
        post(entry.email)
            .then(function (res) { if (res.ok || res.status === 409) markSubscribed(); })
            .catch(function () {}); // still down — leave it for the next load (until the cap)
    })();

    if (localStorage.getItem(SUBSCRIBED)) {
        if (section) section.classList.add('submitted');
        return;
    }

    var form = document.getElementById('subscribeForm');
    if (!form || !section) return;

    var btn = document.getElementById('subscribeBtn');
    var emailInput = document.getElementById('subscribeEmail');

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = emailInput.value.trim();
        if (!email) return;
        if (btn) { btn.disabled = true; btn.style.opacity = '0.4'; }

        post(email)
            .then(function (res) {
                if (res.ok || res.status === 409) { markSubscribed(); return; }
                var err = new Error('subscribe failed: ' + res.status);
                err.status = res.status;
                throw err;
            })
            .catch(function (err) {
                // Don't fake success — surface an error so the visitor can retry.
                if (btn) { btn.disabled = false; btn.style.opacity = ''; }
                section.classList.add('error');
                if (isTransient(err)) {
                    localStorage.setItem(PENDING, JSON.stringify({ email: email, retries: 0 }));
                }
            });
    });
})();
