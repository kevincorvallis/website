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
// UI FUNCTIONS
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showMessage(element, message, isError = false) {
  element.innerHTML = `<p class="${isError ? 'error-message' : 'success-message'}">${escapeHtml(message)}</p>`;
}

// Toast notification function
function showToast(message, type = 'info') {
  // Remove existing toast if any
  const existingToast = document.querySelector('.connections-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `connections-toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    z-index: 10000;
    animation: slideUp 0.3s ease;
    background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#3b82f6'};
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

async function handleSearch() {
  const query = document.getElementById('searchInput').value.trim();
  const resultsEl = document.getElementById('searchResults');

  if (query.length < 2) {
    resultsEl.innerHTML = '<p class="hint">Enter at least 2 characters to search</p>';
    return;
  }

  resultsEl.innerHTML = '<p class="loading">Searching...</p>';

  try {
    const result = await searchUsers(query);

    if (result.users.length === 0) {
      resultsEl.innerHTML = '<p class="empty-state">No users found</p>';
      return;
    }

    resultsEl.innerHTML = result.users.map(user => `
      <div class="user-card">
        <div class="user-info">
          <span class="user-name">${escapeHtml(user.displayName)}</span>
        </div>
        <button class="connect-btn primary-btn" data-uid="${user.uid}">Connect</button>
      </div>
    `).join('');
    // Event delegation is set up in setupEventDelegation()
  } catch (error) {
    showMessage(resultsEl, error.message || 'Search failed', true);
  }
}

async function loadPendingConnections() {
  const listEl = document.getElementById('pendingList');
  const countEl = document.getElementById('pendingCount');

  try {
    const result = await getPendingConnections();
    countEl.textContent = result.count;

    if (result.pending.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No pending requests</p>';
      return;
    }

    listEl.innerHTML = result.pending.map(req => `
      <div class="connection-card pending">
        <div class="user-info">
          <span class="user-name">${escapeHtml(req.displayName)}</span>
          <span class="request-time">Requested ${new Date(req.requested_at).toLocaleDateString()}</span>
        </div>
        <div class="action-buttons">
          <button class="accept-btn primary-btn" data-id="${req.connection_id}">Accept</button>
          <button class="decline-btn secondary-btn" data-id="${req.connection_id}">Decline</button>
        </div>
      </div>
    `).join('');
    // Event delegation is set up in setupEventDelegation()
  } catch (error) {
    showMessage(listEl, 'Failed to load pending requests', true);
  }
}

async function loadConnections() {
  const listEl = document.getElementById('connectionsList');
  const countEl = document.getElementById('connectionsCount');

  try {
    const result = await getConnections();
    countEl.textContent = result.connections.length;

    if (result.connections.length === 0) {
      listEl.innerHTML = '<p class="empty-state">No connections yet. Search for people above!</p>';
      return;
    }

    listEl.innerHTML = result.connections.map(conn => `
      <div class="connection-card">
        <div class="user-info">
          <span class="user-name">${escapeHtml(conn.displayName)}</span>
          <span class="connected-time">Connected ${new Date(conn.connected_at).toLocaleDateString()}</span>
        </div>
        <button class="remove-btn secondary-btn" data-id="${conn.connection_id}">Remove</button>
      </div>
    `).join('');
    // Event delegation is set up in setupEventDelegation()
  } catch (error) {
    showMessage(listEl, 'Failed to load connections', true);
  }
}

function handleInvite() {
  const email = prompt('Enter email address to invite:');
  if (!email) return;

  const subject = encodeURIComponent('Join me on Day by Day Journal!');
  const body = encodeURIComponent(
    `Hey!\n\nI'd love to connect with you on Day by Day, a personal journaling app.\n\n` +
    `Sign up here: ${window.location.origin}/journal/\n\n` +
    `Once you create an account, search for me to connect!`
  );

  window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
}

async function loadInviteLink() {
  const linkInput = document.getElementById('inviteLinkInput');
  const copyBtn = document.getElementById('copyLinkBtn');

  linkInput.value = 'Generating...';
  copyBtn.disabled = true;

  try {
    const result = await generateInviteLink();
    if (result.inviteUrl) {
      linkInput.value = result.inviteUrl;
      copyBtn.disabled = false;
    } else {
      throw new Error('Invalid response');
    }
  } catch (error) {
    console.error('Error generating invite link:', error);
    linkInput.value = '';
    linkInput.placeholder = 'Click retry to generate link';
    copyBtn.textContent = 'Retry';
    copyBtn.disabled = false;
    showToast('Failed to generate invite link', 'error');
  }
}

function setupCopyButton() {
  const copyBtn = document.getElementById('copyLinkBtn');
  copyBtn.addEventListener('click', async () => {
    const linkInput = document.getElementById('inviteLinkInput');
    const feedback = document.getElementById('copyFeedback');

    // Handle retry state
    if (copyBtn.textContent === 'Retry') {
      copyBtn.textContent = 'Copy Link';
      await loadInviteLink();
      return;
    }

    if (!linkInput.value || linkInput.value === 'Generating...') return;

    try {
      await navigator.clipboard.writeText(linkInput.value);
      feedback.style.display = 'block';
      setTimeout(() => { feedback.style.display = 'none'; }, 2000);
    } catch (err) {
      // Fallback for older browsers
      linkInput.select();
      document.execCommand('copy');
      feedback.style.display = 'block';
      setTimeout(() => { feedback.style.display = 'none'; }, 2000);
    }
  });
}

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
      showMessage(document.getElementById('connectionsList'), 'You are now connected!', false);
      await loadConnections();
    } else if (result.alreadyConnected) {
      showMessage(document.getElementById('connectionsList'), 'You are already connected with this person', false);
    }
  } catch (error) {
    console.error('Failed to redeem invite:', error);
  }
}

// ============================================
// EVENT DELEGATION (prevents duplicate listeners)
// ============================================
function setupEventDelegation() {
  // Search results - connect button
  document.getElementById('searchResults').addEventListener('click', async (e) => {
    const btn = e.target.closest('.connect-btn');
    if (!btn || btn.disabled) return;

    const targetUid = btn.dataset.uid;
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      const result = await requestConnection(targetUid);
      btn.textContent = result.status === 'accepted' ? 'Connected!' : 'Request Sent';
      btn.classList.remove('primary-btn');
      btn.classList.add('secondary-btn');
      showToast(result.status === 'accepted' ? 'Connected!' : 'Friend request sent', 'success');
    } catch (error) {
      btn.textContent = 'Connect';
      btn.disabled = false;
      showToast(error.message || 'Failed to send request', 'error');
    }
  });

  // Pending list - accept/decline buttons
  document.getElementById('pendingList').addEventListener('click', async (e) => {
    const acceptBtn = e.target.closest('.accept-btn');
    const declineBtn = e.target.closest('.decline-btn');

    if (acceptBtn && !acceptBtn.disabled) {
      const id = acceptBtn.dataset.id;
      const originalText = acceptBtn.textContent;
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Accepting...';
      // Disable sibling decline button too
      const declineSibling = acceptBtn.parentElement.querySelector('.decline-btn');
      if (declineSibling) declineSibling.disabled = true;

      try {
        await acceptConnection(id);
        showToast('Connection accepted!', 'success');
        loadPendingConnections();
        loadConnections();
      } catch (error) {
        acceptBtn.textContent = originalText;
        acceptBtn.disabled = false;
        if (declineSibling) declineSibling.disabled = false;
        showToast('Failed to accept: ' + error.message, 'error');
      }
    }

    if (declineBtn && !declineBtn.disabled) {
      const id = declineBtn.dataset.id;
      const originalText = declineBtn.textContent;
      declineBtn.disabled = true;
      declineBtn.textContent = 'Declining...';
      // Disable sibling accept button too
      const acceptSibling = declineBtn.parentElement.querySelector('.accept-btn');
      if (acceptSibling) acceptSibling.disabled = true;

      try {
        await declineConnection(id);
        showToast('Request declined', 'info');
        loadPendingConnections();
      } catch (error) {
        declineBtn.textContent = originalText;
        declineBtn.disabled = false;
        if (acceptSibling) acceptSibling.disabled = false;
        showToast('Failed to decline: ' + error.message, 'error');
      }
    }
  });

  // Connections list - remove button
  document.getElementById('connectionsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-btn');
    if (!btn || btn.disabled) return;

    if (!confirm('Are you sure you want to remove this connection?')) return;

    const id = btn.dataset.id;
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Removing...';

    try {
      await removeConnection(id);
      showToast('Connection removed', 'info');
      loadConnections();
    } catch (error) {
      btn.textContent = originalText;
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

    // Setup copy button
    setupCopyButton();

    // Load data
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

// Initialize on page load
initialize();

// ============================================
// EVENT LISTENERS
// ============================================
document.getElementById('searchBtn').addEventListener('click', handleSearch);
document.getElementById('searchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleSearch();
});
document.getElementById('inviteBtn').addEventListener('click', handleInvite);

// Expose functions to window
window.signOutUser = signOutUser;
