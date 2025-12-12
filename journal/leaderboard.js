// leaderboard.js - Streaks & Leaderboard for Day by Day Journal

import { Amplify } from 'https://esm.sh/aws-amplify@6';
import { getCurrentUser, fetchAuthSession, signOut } from 'https://esm.sh/aws-amplify@6/auth';

// Configuration
const cognitoConfig = {
  userPoolId: 'us-west-1_81HBZnH92',
  userPoolClientId: '7t77oqaipn9hldtdpesvde3eka',
  region: 'us-west-1',
  domain: 'daybyday-journal.auth.us-west-1.amazoncognito.com'
};

const API_BASE_URL = 'https://1t1byyi4x6.execute-api.us-west-1.amazonaws.com/default/journalLambdafunc';

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

let currentUser = null;

// API Helper
async function getAuthToken() {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  if (!token) throw new Error('No token available');
  return token;
}

async function apiRequest(endpoint, options = {}) {
  const token = await getAuthToken();
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
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
}

// UI Helpers
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
  if (!dateString) return '-';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-message">${escapeHtml(message)}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('hiding');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Load My Streak
async function loadMyStreak() {
  try {
    const data = await apiRequest('/streaks/me');
    const streak = data.streak;

    document.getElementById('myStreakCount').textContent = streak.current_streak || 0;
    document.getElementById('myLongestStreak').textContent = streak.longest_streak || 0;
    document.getElementById('myStreakStart').textContent = formatDate(streak.streak_start_date);

    if (streak.current_streak > 0) {
      document.getElementById('myStreakDetails').textContent =
        `${streak.current_streak} day${streak.current_streak !== 1 ? 's' : ''} and counting!`;
    } else {
      document.getElementById('myStreakDetails').textContent = 'Write today to start your streak!';
    }
  } catch (error) {
    console.error('Error loading streak:', error);
  }
}

// Load Leaderboard
async function loadLeaderboard() {
  const listEl = document.getElementById('leaderboardList');

  try {
    const data = await apiRequest('/streaks/friends');
    const { leaderboard } = data;

    if (!leaderboard || leaderboard.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>No friends on the leaderboard yet</p>
          <span>Connect with friends to compare streaks!</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = leaderboard.map((user, index) => {
      const rank = index + 1;
      const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
      const isMe = user.isMe;

      return `
        <div class="leaderboard-item ${isMe ? 'is-me' : ''}">
          <span class="rank ${rankClass}">#${rank}</span>
          <div class="leaderboard-avatar">${getInitials(user.displayName)}</div>
          <div class="leaderboard-info">
            <div class="leaderboard-name">${escapeHtml(user.displayName)}${isMe ? ' (You)' : ''}</div>
            <div class="leaderboard-meta">Best: ${user.longest_streak} days</div>
          </div>
          <div class="leaderboard-streak">
            <span class="fire">🔥</span>
            ${user.current_streak}
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    listEl.innerHTML = `
      <div class="empty-state">
        <p>Failed to load leaderboard</p>
      </div>
    `;
  }
}

// Load Accountability Partners
async function loadPartners() {
  const listEl = document.getElementById('partnersList');

  try {
    const data = await apiRequest('/accountability');
    const { partners } = data;

    if (!partners || partners.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <p>No accountability partners yet</p>
          <span>Partner up with a friend to stay motivated!</span>
        </div>
      `;
      return;
    }

    listEl.innerHTML = partners.map(partner => {
      const isPending = partner.status === 'pending';
      const isIncoming = partner.is_incoming;

      return `
        <div class="partner-card" data-id="${partner.partnership_id}">
          <div class="partner-avatar">${getInitials(partner.partner_name)}</div>
          <div class="partner-info">
            <div class="partner-name">${escapeHtml(partner.partner_name)}</div>
            <div class="partner-streak">
              🔥 ${partner.partner_streak} day streak
            </div>
          </div>
          ${isPending && isIncoming ? `
            <div class="partner-actions">
              <button class="accept-btn" onclick="acceptPartnership(${partner.partnership_id})">Accept</button>
              <button class="decline-btn" onclick="declinePartnership(${partner.partnership_id})">Decline</button>
            </div>
          ` : `
            <span class="partner-status ${isPending ? 'pending' : ''}">${isPending ? 'Pending' : 'Active'}</span>
          `}
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading partners:', error);
    listEl.innerHTML = `
      <div class="empty-state">
        <p>Failed to load partners</p>
      </div>
    `;
  }
}

// Accept Partnership
async function acceptPartnership(id) {
  try {
    await apiRequest(`/accountability/${id}/accept`, { method: 'POST' });
    showToast('Partnership accepted!', 'success');
    loadPartners();
  } catch (error) {
    showToast(error.message || 'Failed to accept', 'error');
  }
}

// Decline/End Partnership
async function declinePartnership(id) {
  try {
    await apiRequest(`/accountability/${id}`, { method: 'DELETE' });
    showToast('Partnership ended', 'info');
    loadPartners();
  } catch (error) {
    showToast(error.message || 'Failed to end partnership', 'error');
  }
}

// Make functions global
window.acceptPartnership = acceptPartnership;
window.declinePartnership = declinePartnership;

// Initialize
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

    // Load all data in parallel
    await Promise.all([
      loadMyStreak(),
      loadLeaderboard(),
      loadPartners()
    ]);
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

window.signOutUser = signOutUser;
initialize();
