// connections.js - Connections Management for Day by Day Journal

import { Amplify } from 'https://esm.sh/aws-amplify@6';
import { getCurrentUser, fetchAuthSession, signOut } from 'https://esm.sh/aws-amplify@6/auth';

// ============================================
// CONFIGURATION
// ============================================
const cognitoConfig = {
  userPoolId: 'us-west-1_81HBZnH92',
  userPoolClientId: '7t77oqaipn9hldtdpesvde3eka',
  region: 'us-west-1',
  domain: 'daybyday-journal.auth.us-west-1.amazoncognito.com'
};

const API_BASE_URL = 'https://1t1byyi4x6.execute-api.us-west-1.amazonaws.com/default/journalLambdafunc';

// Determine the correct redirect URL based on current environment
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const currentOrigin = window.location.origin;
const redirectSignIn = isLocalhost
  ? 'http://localhost/journal/dashboard.html'
  : `${currentOrigin}/journal/dashboard.html`;
const redirectSignOut = isLocalhost
  ? 'http://localhost/journal/index.html'
  : `${currentOrigin}/journal/index.html`;

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: cognitoConfig.userPoolId,
      userPoolClientId: cognitoConfig.userPoolClientId,
      loginWith: {
        oauth: {
          domain: cognitoConfig.domain,
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [redirectSignIn],
          redirectSignOut: [redirectSignOut],
          responseType: 'code',
          providers: ['Google']
        }
      }
    }
  }
});

// Current user state
let currentUser = null;
let searchDebounceTimer = null;

// ============================================
// API SERVICE
// ============================================
async function getAuthToken() {
  try {
    const session = await fetchAuthSession();
    const token = session.tokens?.idToken?.toString();
    if (!token) throw new Error('No token available');
    return token;
  } catch (error) {
    throw new Error('Not authenticated');
  }
}

async function apiRequest(endpoint, options = {}) {
  if (!currentUser) throw new Error('Not authenticated');

  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const token = await getAuthToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}

// ============================================
// API FUNCTIONS
// ============================================
async function searchUsers(query) {
  return apiRequest(`/users/search?q=${encodeURIComponent(query)}`);
}

async function getConnections() {
  return apiRequest('/connections');
}

async function getPendingConnections() {
  return apiRequest('/connections/pending');
}

async function requestConnection(targetUid) {
  return apiRequest('/connections/request', {
    method: 'POST',
    body: JSON.stringify({ targetUid })
  });
}

async function acceptConnection(connectionId) {
  return apiRequest(`/connections/${connectionId}/accept`, {
    method: 'POST'
  });
}

async function declineConnection(connectionId) {
  return apiRequest(`/connections/${connectionId}/decline`, {
    method: 'POST'
  });
}

async function removeConnection(connectionId) {
  return apiRequest(`/connections/${connectionId}`, {
    method: 'DELETE'
  });
}

async function updateProfile(displayName, email) {
  return apiRequest('/users/profile', {
    method: 'PUT',
    body: JSON.stringify({ displayName, email })
  });
}

async function generateInviteLink() {
  return apiRequest('/invite/create', { method: 'POST' });
}

async function redeemInviteToken(token) {
  return apiRequest('/invite/redeem', {
    method: 'POST',
    body: JSON.stringify({ token })
  });
}

// ============================================
// UI HELPERS
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconSvg = type === 'success'
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : type === 'error'
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M15 9L9 15M9 9L15 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16V12M12 8H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  toast.innerHTML = `
    <span class="toast-icon">${iconSvg}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;

  container.appendChild(toast);

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================
// LOADING SKELETONS
// ============================================
function showLoadingSkeleton(container, count = 3) {
  container.innerHTML = `
    <div class="loading-state">
      ${Array(count).fill(`
        <div class="skeleton-card">
          <div class="skeleton skeleton-avatar"></div>
          <div style="flex: 1; display: flex; flex-direction: column; gap: 8px;">
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text-short"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================
function setupSearch() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const resultsEl = document.getElementById('searchResults');

  if (!searchInput) return;

  // Debounced search on input
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();

    // Show/hide clear button
    clearBtn.style.display = query.length > 0 ? 'flex' : 'none';

    // Clear existing timer
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

    if (query.length === 0) {
      resultsEl.innerHTML = '';
      return;
    }

    if (query.length < 2) {
      resultsEl.innerHTML = '<p class="search-empty">Enter at least 2 characters</p>';
      return;
    }

    // Show loading
    resultsEl.innerHTML = '<p class="search-loading">Searching...</p>';

    // Debounce search
    searchDebounceTimer = setTimeout(() => handleSearch(query), 300);
  });

  // Clear button
  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.style.display = 'none';
    resultsEl.innerHTML = '';
    searchInput.focus();
  });
}

async function handleSearch(query) {
  const resultsEl = document.getElementById('searchResults');

  try {
    const result = await searchUsers(query);

    if (result.users.length === 0) {
      resultsEl.innerHTML = '<p class="search-empty">No users found</p>';
      return;
    }

    resultsEl.innerHTML = result.users.map(user => `
      <div class="search-result-item">
        <div class="user-info">
          <div class="user-avatar">${getInitials(user.displayName)}</div>
          <div class="user-details">
            <span class="user-name">${escapeHtml(user.displayName)}</span>
          </div>
        </div>
        <button class="btn btn-primary connect-btn" data-uid="${user.uid}">Connect</button>
      </div>
    `).join('');
  } catch (error) {
    resultsEl.innerHTML = `<p class="search-empty">${escapeHtml(error.message || 'Search failed')}</p>`;
  }
}

// ============================================
// PENDING CONNECTIONS
// ============================================
async function loadPendingConnections() {
  const listEl = document.getElementById('pendingList');
  const countEl = document.getElementById('pendingCount');
  const sectionEl = document.getElementById('pendingSection');

  if (!listEl) return;

  showLoadingSkeleton(listEl, 2);

  try {
    const result = await getPendingConnections();
    countEl.textContent = result.count;

    // Hide section if no pending requests
    if (result.pending.length === 0) {
      sectionEl.style.display = 'none';
      return;
    }

    sectionEl.style.display = 'block';

    listEl.innerHTML = result.pending.map(req => `
      <div class="connection-card pending">
        <div class="user-info">
          <div class="user-avatar">${getInitials(req.displayName)}</div>
          <div class="user-details">
            <span class="user-name">${escapeHtml(req.displayName)}</span>
            <span class="connection-time">Requested ${formatDate(req.requested_at)}</span>
          </div>
        </div>
        <div class="action-buttons">
          <button class="btn btn-success accept-btn" data-id="${req.connection_id}">Accept</button>
          <button class="btn btn-secondary decline-btn" data-id="${req.connection_id}">Decline</button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    listEl.innerHTML = '<div class="empty-state"><p>Failed to load requests</p></div>';
    showToast('Failed to load pending requests', 'error');
  }
}

// ============================================
// MY CONNECTIONS
// ============================================
async function loadConnections() {
  const listEl = document.getElementById('connectionsList');
  const countEl = document.getElementById('connectionsCount');

  if (!listEl) return;

  showLoadingSkeleton(listEl, 3);

  try {
    const result = await getConnections();
    countEl.textContent = result.connections.length;

    if (result.connections.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" opacity="0.5">
            <path d="M17 21V19C17 16.79 15.21 15 13 15H5C2.79 15 1 16.79 1 19V21" stroke="currentColor" stroke-width="2"/>
            <circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="2"/>
            <path d="M20 8V14M23 11H17" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p>No connections yet</p>
          <span>Search for friends above to get started!</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = result.connections.map(conn => `
      <div class="connection-card">
        <div class="user-info">
          <div class="user-avatar">${getInitials(conn.displayName)}</div>
          <div class="user-details">
            <span class="user-name">${escapeHtml(conn.displayName)}</span>
            <span class="connection-time">Connected ${formatDate(conn.connected_at)}</span>
          </div>
        </div>
        <button class="btn btn-danger remove-btn" data-id="${conn.connection_id}">Remove</button>
      </div>
    `).join('');
  } catch (error) {
    listEl.innerHTML = '<div class="empty-state"><p>Failed to load connections</p></div>';
    showToast('Failed to load connections', 'error');
  }
}

// ============================================
// INVITE LINK
// ============================================
async function loadInviteLink() {
  const linkInput = document.getElementById('inviteLinkInput');
  const copyBtn = document.getElementById('copyLinkBtn');
  const copyBtnSpan = copyBtn?.querySelector('span');

  if (!linkInput || !copyBtn) return;

  linkInput.value = '';
  linkInput.placeholder = 'Generating...';
  copyBtn.disabled = true;

  try {
    const result = await generateInviteLink();
    if (result.inviteUrl) {
      linkInput.value = result.inviteUrl;
      linkInput.placeholder = '';
      copyBtn.disabled = false;
    } else {
      throw new Error('Invalid response');
    }
  } catch (error) {
    console.error('Error generating invite link:', error);
    linkInput.value = '';
    linkInput.placeholder = 'Failed to generate';
    copyBtn.disabled = false;
    // Change button to retry mode
    if (copyBtnSpan) copyBtnSpan.textContent = 'Retry';
    copyBtn.dataset.retry = 'true';
    showToast('Failed to generate invite link', 'error');
  }
}

function setupCopyButton() {
  const copyBtn = document.getElementById('copyLinkBtn');
  const linkInput = document.getElementById('inviteLinkInput');
  const feedback = document.getElementById('copyFeedback');
  const copyBtnSpan = copyBtn?.querySelector('span');

  if (!copyBtn) return;

  copyBtn.addEventListener('click', async () => {
    // Handle retry mode
    if (copyBtn.dataset.retry === 'true') {
      delete copyBtn.dataset.retry;
      if (copyBtnSpan) copyBtnSpan.textContent = 'Copy';
      await loadInviteLink();
      return;
    }

    if (!linkInput.value) return;

    try {
      await navigator.clipboard.writeText(linkInput.value);
      feedback.classList.add('show');
      setTimeout(() => feedback.classList.remove('show'), 2000);
    } catch (err) {
      // Fallback for older browsers
      linkInput.select();
      document.execCommand('copy');
      feedback.classList.add('show');
      setTimeout(() => feedback.classList.remove('show'), 2000);
    }
  });
}

// ============================================
// INVITE TOKEN REDEMPTION
// ============================================
async function checkAndRedeemInvite() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('invite');

  if (!inviteToken) return;

  try {
    const result = await redeemInviteToken(inviteToken);

    // Remove token from URL without reload
    const url = new URL(window.location);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url);

    // Clear the sessionStorage token now that it's been used
    sessionStorage.removeItem('pendingInviteToken');

    if (result.connected) {
      showToast('You are now connected!', 'success');
      await loadConnections();
    } else if (result.alreadyConnected) {
      showToast('You are already connected with this person', 'info');
    }
  } catch (error) {
    console.error('Failed to redeem invite:', error);
    showToast('Failed to process invite link', 'error');
  }
}

// ============================================
// EVENT DELEGATION (prevents duplicate listeners)
// ============================================
function setupEventDelegation() {
  // Search results - connect button
  document.getElementById('searchResults')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.connect-btn');
    if (!btn || btn.disabled) return;

    const targetUid = btn.dataset.uid;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      const result = await requestConnection(targetUid);
      btn.textContent = result.status === 'accepted' ? 'Connected!' : 'Sent';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-secondary');
      showToast(result.status === 'accepted' ? 'Connected!' : 'Friend request sent', 'success');
    } catch (error) {
      btn.textContent = 'Connect';
      btn.disabled = false;
      showToast(error.message || 'Failed to send request', 'error');
    }
  });

  // Pending list - accept/decline buttons
  document.getElementById('pendingList')?.addEventListener('click', async (e) => {
    const acceptBtn = e.target.closest('.accept-btn');
    const declineBtn = e.target.closest('.decline-btn');

    if (acceptBtn && !acceptBtn.disabled) {
      const id = acceptBtn.dataset.id;
      acceptBtn.disabled = true;
      acceptBtn.innerHTML = '<span class="spinner"></span>';
      // Disable sibling decline button too
      const declineSibling = acceptBtn.parentElement.querySelector('.decline-btn');
      if (declineSibling) declineSibling.disabled = true;

      try {
        await acceptConnection(id);
        showToast('Connection accepted!', 'success');
        loadPendingConnections();
        loadConnections();
      } catch (error) {
        acceptBtn.textContent = 'Accept';
        acceptBtn.disabled = false;
        if (declineSibling) declineSibling.disabled = false;
        showToast('Failed to accept: ' + error.message, 'error');
      }
    }

    if (declineBtn && !declineBtn.disabled) {
      const id = declineBtn.dataset.id;
      declineBtn.disabled = true;
      declineBtn.innerHTML = '<span class="spinner"></span>';
      // Disable sibling accept button too
      const acceptSibling = declineBtn.parentElement.querySelector('.accept-btn');
      if (acceptSibling) acceptSibling.disabled = true;

      try {
        await declineConnection(id);
        showToast('Request declined', 'info');
        loadPendingConnections();
      } catch (error) {
        declineBtn.textContent = 'Decline';
        declineBtn.disabled = false;
        if (acceptSibling) acceptSibling.disabled = false;
        showToast('Failed to decline: ' + error.message, 'error');
      }
    }
  });

  // Connections list - remove button
  document.getElementById('connectionsList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-btn');
    if (!btn || btn.disabled) return;

    if (!confirm('Are you sure you want to remove this connection?')) return;

    const id = btn.dataset.id;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';

    try {
      await removeConnection(id);
      showToast('Connection removed', 'info');
      loadConnections();
    } catch (error) {
      btn.textContent = 'Remove';
      btn.disabled = false;
      showToast('Failed to remove: ' + error.message, 'error');
    }
  });
}

// ============================================
// INITIALIZATION
// ============================================
async function initialize() {
  try {
    const user = await getCurrentUser();
    const session = await fetchAuthSession();
    const userId = session.tokens?.idToken?.payload?.sub || user.userId;

    currentUser = {
      uid: userId,
      email: session.tokens?.idToken?.payload?.email || user.username,
      name: session.tokens?.idToken?.payload?.name,
      givenName: session.tokens?.idToken?.payload?.given_name
    };

    // Ensure user exists in database with profile
    const displayName = currentUser.givenName || currentUser.name?.split(' ')[0] || currentUser.email?.split('@')[0];
    await updateProfile(displayName, currentUser.email).catch(() => {});

    // Setup event delegation (once, before loading data)
    setupEventDelegation();

    // Setup search with debounce
    setupSearch();

    // Setup copy button
    setupCopyButton();

    // Load data in parallel
    await Promise.all([
      loadPendingConnections(),
      loadConnections(),
      loadInviteLink()
    ]);

    // Check for invite token in URL and redeem it
    await checkAndRedeemInvite();
  } catch (error) {
    console.log('Not authenticated, redirecting to login:', error.message);
    window.location.href = 'index.html';
  }
}

async function signOutUser() {
  try {
    await signOut();
    window.location.href = 'index.html';
  } catch (error) {
    console.error('Sign out error:', error);
  }
}

// Expose signOut to window for nav button
window.signOutUser = signOutUser;

// Initialize on page load
initialize();
