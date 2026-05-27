// Public Supabase config for the Dispatch front-end.
// These two values are safe to expose — the anon key only grants what RLS allows.
// Service-role writes happen in Vercel Functions.
(function () {
    window.DISPATCH_SUPABASE_URL = 'https://nmkavdrvgjkolreoexfe.supabase.co';
    window.DISPATCH_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ta2F2ZHJ2Z2prb2xyZW9leGZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjczNTEyMjEsImV4cCI6MjA4MjkyNzIyMX0.VlmkBrD3i7eFfMg7SuZHACqa29r0GHZiU4FFzfB6P7Q';
})();
