// feed.js - Activity Feed for Day by Day Journal

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
let currentEntryId = null;
const EMOJIS = ['❤️', '🔥', '👏', '✨', '😢'];

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

function timeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
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

// Load Feed
async function loadFeed() {
  const listEl = document.getElementById('feedList');
  const refreshBtn = document.getElementById('refreshBtn');

  refreshBtn?.classList.add('spinning');

  try {
    const data = await apiRequest('/feed');
    const { feed } = data;

    if (!feed || feed.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M3 9H21" stroke="currentColor" stroke-width="2"/>
            <path d="M9 21V9" stroke="currentColor" stroke-width="2"/>
          </svg>
          <p>Your feed is empty</p>
          <span>When friends share entries with you, they'll appear here.<br>
          <a href="connections.html">Find friends</a> to get started!</span>
        </div>
      `;
      return;
    }

    // Store feed data for later use
    window.feedData = {};
    feed.forEach(item => {
      window.feedData[item.entry_id] = item;
    });

    listEl.innerHTML = feed.map(item => {
      const myReactionsSet = new Set(item.my_reactions || []);

      return `
        <div class="feed-card ${item.is_read ? '' : 'unread'}" data-entry-id="${item.entry_id}" data-share-id="${item.share_id}">
          <div class="feed-header">
            <div class="feed-avatar">${getInitials(item.owner_name)}</div>
            <div class="feed-meta">
              <div class="feed-author">${escapeHtml(item.owner_name)}</div>
              <div class="feed-time">Shared ${timeAgo(item.shared_at)}</div>
            </div>
          </div>
          <div class="feed-body">
            <h3 class="feed-title">${escapeHtml(item.title)}</h3>
            <p class="feed-preview">${escapeHtml(item.preview)}</p>
          </div>
          <div class="feed-reactions">
            <div class="reaction-counts" id="reactions-${item.entry_id}">
              ${item.reaction_count > 0 ? `<span class="reaction-count">${item.reaction_count} reactions</span>` : ''}
            </div>
            <div class="reaction-actions">
              <div class="emoji-picker-wrapper" style="position: relative;">
                <button class="reaction-btn" onclick="event.stopPropagation(); toggleEmojiPicker(${item.entry_id})">
                  ${myReactionsSet.size > 0 ? Array.from(myReactionsSet)[0] : '+'}
                </button>
                <div class="emoji-picker" id="emoji-picker-${item.entry_id}">
                  ${EMOJIS.map(emoji => `
                    <span class="emoji-option ${myReactionsSet.has(emoji) ? 'active' : ''}"
                          onclick="event.stopPropagation(); toggleReaction(${item.entry_id}, '${emoji}')">${emoji}</span>
                  `).join('')}
                </div>
              </div>
              <button class="comment-btn" onclick="event.stopPropagation(); openComments(${item.entry_id})">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${item.comment_count || 0}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Mark entries as read
    feed.filter(item => !item.is_read).forEach(item => {
      markAsRead(item.share_id);
    });

  } catch (error) {
    console.error('Error loading feed:', error);
    listEl.innerHTML = `
      <div class="empty-state">
        <p>Failed to load feed</p>
        <span>Please try again later</span>
      </div>
    `;
  } finally {
    refreshBtn?.classList.remove('spinning');
  }
}

// Mark entry as read
async function markAsRead(shareId) {
  try {
    await apiRequest(`/entry-share/${shareId}/read`, { method: 'PUT' });
  } catch (error) {
    console.error('Error marking as read:', error);
  }
}

// Toggle Emoji Picker
function toggleEmojiPicker(entryId) {
  // Close all other pickers
  document.querySelectorAll('.emoji-picker.show').forEach(picker => {
    if (picker.id !== `emoji-picker-${entryId}`) {
      picker.classList.remove('show');
    }
  });

  const picker = document.getElementById(`emoji-picker-${entryId}`);
  picker.classList.toggle('show');
}

// Toggle Reaction
async function toggleReaction(entryId, emoji) {
  const picker = document.getElementById(`emoji-picker-${entryId}`);
  const emojiOption = picker.querySelector(`[onclick*="${emoji}"]`);
  const isActive = emojiOption?.classList.contains('active');

  try {
    if (isActive) {
      await apiRequest(`/entry/${entryId}/react/${encodeURIComponent(emoji)}`, { method: 'DELETE' });
      emojiOption?.classList.remove('active');
    } else {
      await apiRequest(`/entry/${entryId}/react`, {
        method: 'POST',
        body: JSON.stringify({ emoji })
      });
      emojiOption?.classList.add('active');
    }

    // Update reaction count
    const data = await apiRequest(`/entry/${entryId}/reactions`);
    const totalReactions = Object.values(data.reactions || {}).reduce((sum, arr) => sum + arr.length, 0);
    const countsEl = document.getElementById(`reactions-${entryId}`);
    if (countsEl) {
      countsEl.innerHTML = totalReactions > 0 ? `<span class="reaction-count">${totalReactions} reactions</span>` : '';
    }

    // Update button
    const card = document.querySelector(`[data-entry-id="${entryId}"]`);
    const btn = card?.querySelector('.reaction-btn');
    if (btn) {
      const myReactions = [];
      picker.querySelectorAll('.emoji-option.active').forEach(opt => {
        myReactions.push(opt.textContent.trim());
      });
      btn.textContent = myReactions.length > 0 ? myReactions[0] : '+';
    }

  } catch (error) {
    showToast(error.message || 'Failed to update reaction', 'error');
  }

  picker.classList.remove('show');
}

// Comments
async function openComments(entryId) {
  currentEntryId = entryId;

  // Update modal header with entry info
  const entryData = window.feedData?.[entryId];
  const modalHeader = document.querySelector('.comments-modal .modal-header');
  const entryTitle = entryData?.title || 'Entry';

  modalHeader.innerHTML = `
    <div class="modal-header-content">
      <h3>${escapeHtml(entryTitle)}</h3>
      <button class="read-article-btn" onclick="viewFullEntry(${entryId})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M18 13V19C18 20.1046 17.1046 21 16 21H5C3.89543 21 3 20.1046 3 19V8C3 6.89543 3.89543 6 5 6H11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M15 3H21V9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Read Entry
      </button>
    </div>
    <button class="modal-close" onclick="closeComments()">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;

  document.getElementById('commentsModal').style.display = 'flex';
  document.getElementById('commentInput').value = '';
  await loadComments(entryId);
}

// View full entry
function viewFullEntry(entryId) {
  // Navigate to entry view page
  window.location.href = `entry-view.html?id=${entryId}`;
}

function closeComments() {
  document.getElementById('commentsModal').style.display = 'none';
  currentEntryId = null;
}

async function loadComments(entryId) {
  const listEl = document.getElementById('commentsList');
  listEl.innerHTML = '<div class="comments-empty">Loading comments...</div>';

  try {
    const data = await apiRequest(`/entry/${entryId}/comments`);
    const { comments } = data;

    if (!comments || comments.length === 0) {
      listEl.innerHTML = '<div class="comments-empty">No comments yet. Be the first!</div>';
      return;
    }

    listEl.innerHTML = comments.map(comment => `
      <div class="comment-item" data-comment-id="${comment.comment_id}">
        <div class="comment-avatar">${getInitials(comment.commenter_name)}</div>
        <div class="comment-content">
          <div class="comment-header">
            <span class="comment-author">${escapeHtml(comment.commenter_name)}</span>
            <span class="comment-time">${timeAgo(comment.created_at)}</span>
            ${comment.is_mine ? `<button class="comment-delete" onclick="deleteComment(${comment.comment_id})">Delete</button>` : ''}
          </div>
          <p class="comment-text">${escapeHtml(comment.text)}</p>
        </div>
      </div>
    `).join('');

  } catch (error) {
    listEl.innerHTML = '<div class="comments-empty">Failed to load comments</div>';
  }
}

async function sendComment() {
  if (!currentEntryId) return;

  const input = document.getElementById('commentInput');
  const text = input.value.trim();

  if (!text) return;

  try {
    await apiRequest(`/entry/${currentEntryId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ text })
    });

    input.value = '';
    await loadComments(currentEntryId);

    // Update comment count on card
    const card = document.querySelector(`[data-entry-id="${currentEntryId}"]`);
    const btn = card?.querySelector('.comment-btn');
    if (btn) {
      const count = parseInt(btn.textContent.trim()) || 0;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${count + 1}
      `;
    }

    showToast('Comment added!', 'success');
  } catch (error) {
    showToast(error.message || 'Failed to add comment', 'error');
  }
}

async function deleteComment(commentId) {
  if (!confirm('Delete this comment?')) return;

  try {
    await apiRequest(`/comment/${commentId}`, { method: 'DELETE' });
    await loadComments(currentEntryId);
    showToast('Comment deleted', 'info');
  } catch (error) {
    showToast(error.message || 'Failed to delete comment', 'error');
  }
}

// Make functions global
window.toggleEmojiPicker = toggleEmojiPicker;
window.toggleReaction = toggleReaction;
window.openComments = openComments;
window.closeComments = closeComments;
window.sendComment = sendComment;
window.deleteComment = deleteComment;
window.viewFullEntry = viewFullEntry;

// Close emoji pickers on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.emoji-picker-wrapper')) {
    document.querySelectorAll('.emoji-picker.show').forEach(picker => {
      picker.classList.remove('show');
    });
  }
});

// Click on feed card to open comments
document.addEventListener('click', (e) => {
  const feedCard = e.target.closest('.feed-card');
  if (feedCard && !e.target.closest('.reaction-actions')) {
    const entryId = feedCard.dataset.entryId;
    if (entryId) {
      openComments(parseInt(entryId));
    }
  }
});

// Enter key sends comment
document.getElementById('commentInput')?.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendComment();
  }
});

// Refresh button
document.getElementById('refreshBtn')?.addEventListener('click', loadFeed);

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

    await loadFeed();
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
