// Shared password gate for Dispatch newsletter.
// Usage: set window.DISPATCH_PASS before loading this script.
//   <script>window.DISPATCH_PASS = 'mypassword';</script>
//   <script src="/newsletter/gate.js"></script>
//
// Requires a .gate element in the page with #gateInput and #gateHint.
// Stores auth per-issue in sessionStorage so users don't re-enter
// on refresh, but need it again in a new tab.
//
// Bypass: add ?key=<password> to the URL to skip the gate.
// e.g. /newsletter/001/?key=melrosegate

(function() {
    var pass = (window.DISPATCH_PASS || '').toLowerCase();
    if (!pass) return;

    var gate = document.getElementById('gate');
    var input = document.getElementById('gateInput');
    var hint = document.getElementById('gateHint');
    if (!gate || !input) return;

    var key = 'dispatch-auth-' + pass;

    // Check URL bypass
    var params = new URLSearchParams(window.location.search);
    var urlKey = (params.get('key') || '').toLowerCase();
    if (urlKey === pass) {
        sessionStorage.setItem(key, '1');
        gate.classList.add('unlocked');
        // Clean URL without reload
        params.delete('key');
        var clean = window.location.pathname + (params.toString() ? '?' + params : '');
        window.history.replaceState({}, '', clean);
        return;
    }

    if (sessionStorage.getItem(key) === '1') {
        gate.classList.add('unlocked');
        return;
    }

    document.body.style.overflow = 'hidden';

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            var val = input.value.trim().toLowerCase();
            if (val === pass) {
                sessionStorage.setItem(key, '1');
                gate.classList.add('unlocked');
                document.body.style.overflow = '';
                input.blur();
            } else {
                input.value = '';
                input.classList.remove('shake');
                void input.offsetWidth;
                input.classList.add('shake');
                if (hint) hint.classList.add('visible');
            }
        }
    });
})();
