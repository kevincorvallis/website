// Shared password gate for Dispatch newsletter.
// Validates password via /api/gate serverless function.
// Usage: <script src="/newsletter/gate.js"></script>
//
// Requires a .gate element with #gateInput and optional #gateHint.
// Stores auth per-issue in sessionStorage so users don't re-enter
// on refresh, but need it again in a new tab.
//
// Bypass: add ?key=<password> to the URL to skip the gate.

(function() {
    var gate = document.getElementById('gate');
    var input = document.getElementById('gateInput');
    var hint = document.getElementById('gateHint');
    if (!gate || !input) return;

    // Normalize pathname so /newsletter/001 and /newsletter/001/ use same key
    var path = window.location.pathname.replace(/\/$/, '') || '/';
    var issueKey = 'dispatch-auth-' + path;

    function unlock() {
        sessionStorage.setItem(issueKey, '1');
        gate.classList.add('unlocked');
        document.body.style.overflow = '';
    }

    function showGate() {
        document.body.style.overflow = 'hidden';
        input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                var val = input.value.trim();
                if (!val) return;
                input.disabled = true;
                checkPassword(val, function(ok) {
                    input.disabled = false;
                    if (ok) {
                        unlock();
                        input.blur();
                    } else {
                        input.value = '';
                        input.classList.remove('shake');
                        void input.offsetWidth;
                        input.classList.add('shake');
                        if (hint) hint.classList.add('visible');
                    }
                });
            }
        });
    }

    function checkPassword(val, callback) {
        fetch('/api/gate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: val }),
        })
        .then(function(r) { return r.json(); })
        .then(function(data) { callback(data.ok === true); })
        .catch(function() { callback(false); });
    }

    // Already authenticated this session
    if (sessionStorage.getItem(issueKey) === '1') {
        gate.classList.add('unlocked');
        return;
    }

    // Check URL bypass (?key=)
    var params = new URLSearchParams(window.location.search);
    var urlKey = params.get('key');
    if (urlKey) {
        // Hide gate immediately while we verify (avoid flash)
        gate.style.opacity = '0';
        checkPassword(urlKey, function(ok) {
            if (ok) {
                unlock();
                params.delete('key');
                var clean = window.location.pathname + (params.toString() ? '?' + params : '');
                window.history.replaceState({}, '', clean);
            } else {
                // Key was wrong — show gate normally
                gate.style.opacity = '';
                showGate();
            }
        });
        return;
    }

    // No bypass, no session — show the gate
    showGate();
})();
