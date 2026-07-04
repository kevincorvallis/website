// ai-chat.js — the /ai page chat component.
// Streams from /api/chat (SSE), persists the conversation in sessionStorage,
// supports ?q= deep links and share-as-link. Markdown is rendered from a safe
// subset (bold, italic, inline code, lists) after HTML-escaping.
(function () {
    var input = document.getElementById('chat-input');
    var sendBtn = document.getElementById('chat-send');
    var messagesEl = document.getElementById('chat-messages');
    var suggestionsEl = document.getElementById('chat-suggestions');
    var emptyEl = document.getElementById('chat-empty');
    var shareBtn = document.getElementById('chat-share');
    var clearBtn = document.getElementById('chat-clear');

    var STORAGE_KEY = 'ai-chat-v1';
    var history = [];
    var isLoading = false;
    var strings = {};

    var FALLBACK_SUGGESTIONS = [
        'What are you building at Paramount?',
        'How do you ship 10 side projects?',
        'Tell me about Angel Flight',
        'Why do you still shoot film?',
        'Paramount vs Microsoft — what’s different?',
        'What did the Army teach you about engineering?',
    ];

    // ——— i18n runtime strings (same pattern as the rest of the site) ———

    function loadStrings(lang, done) {
        fetch('/i18n/' + lang + '.json')
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                if (data && data.ai) strings = data.ai;
                if (done) done();
            })
            .catch(function () { if (done) done(); });
    }

    function t(key, fallback) {
        return strings[key] || fallback;
    }

    function suggestions() {
        return (strings.chips && strings.chips.length) ? strings.chips : FALLBACK_SUGGESTIONS;
    }

    // ——— Rendering ———

    function escapeHtml(str) {
        var d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // Safe markdown subset. Operates on escaped text only.
    function renderMarkdown(text) {
        var escaped = escapeHtml(text);
        var lines = escaped.split('\n');
        var html = '';
        var listType = null; // 'ul' | 'ol' | null

        function closeList() {
            if (listType) {
                html += '</' + listType + '>';
                listType = null;
            }
        }

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var ulMatch = /^\s*[-*]\s+(.+)$/.exec(line);
            var olMatch = /^\s*\d+[.)]\s+(.+)$/.exec(line);

            if (ulMatch) {
                if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
                html += '<li>' + inline(ulMatch[1]) + '</li>';
            } else if (olMatch) {
                if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
                html += '<li>' + inline(olMatch[1]) + '</li>';
            } else {
                closeList();
                if (line.trim() === '') {
                    if (html && !/(<br>){2}$/.test(html)) html += '<br><br>';
                } else {
                    if (html && !/(<br>|<\/ul>|<\/ol>)$/.test(html) && !/(<br>){2}$/.test(html)) html += '<br>';
                    html += inline(line);
                }
            }
        }
        closeList();
        return html;
    }

    function inline(escaped) {
        return escaped
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>');
    }

    function roleLabel(role) {
        return role === 'user' ? t('roleUser', 'You') : t('roleAssistant', 'Kevin');
    }

    function addMessage(role, text) {
        var div = document.createElement('div');
        div.className = 'chat-message ' + (role === 'user' ? 'user-msg' : 'assistant-msg');
        var roleEl = document.createElement('div');
        roleEl.className = 'chat-role';
        roleEl.textContent = roleLabel(role);
        var body = document.createElement('div');
        body.className = 'chat-body';
        if (role === 'assistant') {
            body.innerHTML = renderMarkdown(text);
        } else {
            body.textContent = text;
        }
        div.appendChild(roleEl);
        div.appendChild(body);
        messagesEl.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return div;
    }

    function addStreamingMessage() {
        var div = document.createElement('div');
        div.className = 'chat-message assistant-msg';
        var roleEl = document.createElement('div');
        roleEl.className = 'chat-role';
        roleEl.textContent = roleLabel('assistant');
        var body = document.createElement('div');
        body.className = 'chat-body streaming';
        div.appendChild(roleEl);
        div.appendChild(body);
        messagesEl.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return body;
    }

    function addThinking() {
        var div = document.createElement('div');
        div.className = 'chat-message assistant-msg';
        div.id = 'chat-thinking';
        div.innerHTML = '<div class="chat-role"></div><div class="chat-body thinking"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div>';
        div.querySelector('.chat-role').textContent = roleLabel('assistant');
        messagesEl.appendChild(div);
        div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function removeThinking() {
        var el = document.getElementById('chat-thinking');
        if (el) el.remove();
    }

    // ——— Empty state / persistence ———

    function updateChrome() {
        var hasConversation = history.length > 0;
        emptyEl.hidden = hasConversation;
        suggestionsEl.hidden = hasConversation;
        shareBtn.hidden = !hasConversation;
        clearBtn.hidden = !hasConversation;
    }

    function renderSuggestions() {
        suggestionsEl.innerHTML = '';
        var set = suggestions();
        for (var i = 0; i < set.length; i++) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = set[i];
            suggestionsEl.appendChild(btn);
        }
    }

    function persist() {
        try {
            sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ history: history }));
        } catch (e) { /* storage full/blocked — conversation just won't survive reload */ }
    }

    function restore() {
        try {
            var raw = sessionStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            var saved = JSON.parse(raw);
            if (!saved || !Array.isArray(saved.history)) return;
            history = saved.history.filter(function (m) {
                return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string';
            });
            for (var i = 0; i < history.length; i++) {
                addMessage(history[i].role, history[i].content);
            }
        } catch (e) {
            history = [];
        }
    }

    // ——— Actions ———

    function clearConversation() {
        history = [];
        persist();
        var msgs = messagesEl.querySelectorAll('.chat-message');
        for (var i = 0; i < msgs.length; i++) msgs[i].remove();
        updateChrome();
        input.focus();
    }

    function shareConversation() {
        var firstUser = null;
        for (var i = 0; i < history.length; i++) {
            if (history[i].role === 'user') { firstUser = history[i].content; break; }
        }
        var url = 'https://klee.page/ai' + (firstUser ? '?q=' + encodeURIComponent(firstUser) : '');
        var done = function () {
            var original = t('share', 'Share');
            shareBtn.textContent = t('copied', 'Copied');
            setTimeout(function () { shareBtn.textContent = original; }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done).catch(done);
        } else {
            done();
        }
    }

    // ——— Send / stream ———

    async function sendMessage(text) {
        text = (text || '').trim();
        if (isLoading || !text) return;
        isLoading = true;
        sendBtn.disabled = true;
        input.value = '';

        addMessage('user', text);
        updateChrome();
        addThinking();

        try {
            var res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, history: history })
            });

            if (!res.ok) {
                if (res.status === 429) throw new Error('rate-limit');
                throw new Error('request-failed');
            }

            removeThinking();

            var bodyEl = addStreamingMessage();
            var reader = res.body.getReader();
            var decoder = new TextDecoder();
            var buffer = '';
            var fullReply = '';

            while (true) {
                var chunk = await reader.read();
                if (chunk.done) break;
                buffer += decoder.decode(chunk.value, { stream: true });
                var lines = buffer.split('\n');
                buffer = lines.pop() || '';
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (!line.startsWith('data: ')) continue;
                    var data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        var parsed = JSON.parse(data);
                        if (parsed.text) {
                            fullReply += parsed.text;
                            bodyEl.innerHTML = renderMarkdown(fullReply);
                            bodyEl.parentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        }
                    } catch (e) { /* skip malformed chunk */ }
                }
            }

            bodyEl.classList.remove('streaming');

            if (!fullReply) fullReply = t('errorEmpty', 'Sorry, something went wrong.');
            history.push({ role: 'user', content: text });
            history.push({ role: 'assistant', content: fullReply });
            if (history.length > 20) history.splice(0, 2);
            persist();
        } catch (err) {
            removeThinking();
            if (err.message === 'rate-limit') {
                addMessage('assistant', t('errorRate', 'You’re sending messages a little fast — give it a minute and try again.'));
            } else {
                addMessage('assistant', t('errorNetwork', 'Sorry, I couldn’t respond right now. Please try again.'));
            }
        }

        isLoading = false;
        sendBtn.disabled = !input.value.trim();
        input.focus();
    }

    // ——— Events ———

    input.addEventListener('input', function () {
        sendBtn.disabled = isLoading || !input.value.trim();
    });

    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input.value);
        }
    });

    sendBtn.addEventListener('click', function () { sendMessage(input.value); });
    clearBtn.addEventListener('click', clearConversation);
    shareBtn.addEventListener('click', shareConversation);

    suggestionsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (btn) sendMessage(btn.textContent);
    });

    document.addEventListener('i18n:applied', function () {
        var lang = localStorage.getItem('lang') || 'en';
        loadStrings(lang, function () {
            if (history.length === 0) renderSuggestions();
        });
    });

    // ——— Init ———

    var initialLang = localStorage.getItem('lang') || 'en';
    loadStrings(initialLang, function () {
        restore();
        renderSuggestions();
        updateChrome();

        // ?q= deep link: auto-ask once, only into an empty conversation.
        var params = new URLSearchParams(location.search);
        var q = params.get('q');
        if (q && history.length === 0) {
            sendMessage(q.slice(0, 500));
        }
        input.focus();
    });
})();
