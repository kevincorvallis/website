// Shared front-end client for Dispatch.
// Loaded by the sign-in page, the auth callback, and the editor.
// Wraps Supabase Auth (via the supabase-js CDN bundle) and the /api routes.

(function (global) {
    'use strict';

    var SUPABASE_URL = global.DISPATCH_SUPABASE_URL || '';
    var SUPABASE_ANON_KEY = global.DISPATCH_SUPABASE_ANON_KEY || '';

    var supabase = null;
    var profile = null;        // { id, username, display_name } once loaded
    var profileLoaded = false;

    function initSupabase() {
        if (supabase) return supabase;
        if (!global.supabase || !SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
        supabase = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        });
        return supabase;
    }

    async function getSession() {
        var c = initSupabase();
        if (!c) return null;
        var res = await c.auth.getSession();
        return res && res.data ? res.data.session : null;
    }

    async function getAccessToken() {
        var s = await getSession();
        return s ? s.access_token : null;
    }

    async function signOut() {
        var c = initSupabase();
        if (c) await c.auth.signOut();
        profile = null;
        profileLoaded = false;
    }

    function bearer() {
        return getAccessToken().then(function (t) {
            return t ? { Authorization: 'Bearer ' + t } : {};
        });
    }

    async function api(method, path, body) {
        var headers = Object.assign({ 'Content-Type': 'application/json' }, await bearer());
        var res = await fetch(path, {
            method: method,
            headers: headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        var data = null;
        try { data = await res.json(); } catch (_) {}
        if (!res.ok) {
            var err = new Error((data && data.error) || ('Request failed: ' + res.status));
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    function normalizeProfile(p) {
        if (!p) return null;
        var h = p.handle || p.username || null;
        return Object.assign({}, p, { handle: h, username: h });
    }

    async function listArticles() {
        var data = await api('GET', '/api/articles');
        if (data && data.profile) {
            profile = normalizeProfile(data.profile);
            profileLoaded = true;
        }
        return data;
    }

    async function getArticle(id) {
        var data = await api('GET', '/api/articles?id=' + encodeURIComponent(id));
        if (data && data.profile) {
            profile = normalizeProfile(data.profile);
            profileLoaded = true;
        }
        return data ? data.article : null;
    }

    async function createArticle(payload) {
        var data = await api('POST', '/api/articles', payload || {});
        return data ? data.article : null;
    }

    async function updateArticle(id, patch) {
        var data = await api('PUT', '/api/articles?id=' + encodeURIComponent(id), patch || {});
        return data ? data.article : null;
    }

    async function deleteArticle(id) {
        return api('DELETE', '/api/articles?id=' + encodeURIComponent(id));
    }

    async function publishArticle(id, patch) {
        return updateArticle(id, Object.assign({}, patch || {}, { status: 'published' }));
    }

    async function uploadPhoto(file) {
        if (!file) throw new Error('No file');
        if (file.size > 10 * 1024 * 1024) throw new Error('Image is too big (max 10 MB).');

        // Get signed params from our API
        var sig = await api('POST', '/api/upload', {});
        if (!sig || !sig.upload_url) throw new Error('Upload not available.');

        // POST directly to Cloudinary
        var fd = new FormData();
        fd.append('file', file);
        fd.append('api_key', sig.api_key);
        fd.append('timestamp', sig.timestamp);
        fd.append('folder', sig.folder);
        fd.append('signature', sig.signature);

        var resp = await fetch(sig.upload_url, { method: 'POST', body: fd });
        if (!resp.ok) {
            var txt = '';
            try { txt = await resp.text(); } catch (_) {}
            throw new Error('Cloudinary upload failed: ' + resp.status + ' ' + txt.slice(0, 200));
        }
        var data = await resp.json();
        return {
            url: data.secure_url || data.url,
            public_id: data.public_id,
            width: data.width,
            height: data.height,
            format: data.format,
            bytes: data.bytes,
        };
    }

    async function sendMagicLink(email, code) {
        var res = await fetch('/api/auth/send-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, code: code || undefined }),
        });
        var data = null;
        try { data = await res.json(); } catch (_) {}
        return { ok: res.ok, data: data, status: res.status };
    }

    async function claimUsername(username, opts) {
        var data = await api('POST', '/api/auth/claim-username', Object.assign({ handle: username, username: username }, opts || {}));
        if (data && data.profile) {
            profile = normalizeProfile(data.profile);
            profileLoaded = true;
        }
        return profile;
    }

    function getProfile() { return profile; }
    function hasProfile() { return !!profile; }

    global.Dispatch = {
        init: initSupabase,
        session: getSession,
        accessToken: getAccessToken,
        signOut: signOut,
        listArticles: listArticles,
        getArticle: getArticle,
        createArticle: createArticle,
        updateArticle: updateArticle,
        deleteArticle: deleteArticle,
        publishArticle: publishArticle,
        uploadPhoto: uploadPhoto,
        sendMagicLink: sendMagicLink,
        claimUsername: claimUsername,
        getProfile: getProfile,
        hasProfile: hasProfile,
    };
})(window);
