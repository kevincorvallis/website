// dashboard.js - Day by Day Journal App
// With cloud sync and offline support (Cognito Auth)

// Import AWS Amplify v6 from esm.sh CDN
import { Amplify } from 'https://esm.sh/aws-amplify@6';
// Note: signInWithRedirect import is needed to register the OAuth callback listener
import { getCurrentUser, fetchAuthSession, signOut, signInWithRedirect } from 'https://esm.sh/aws-amplify@6/auth';
import { Hub } from 'https://esm.sh/aws-amplify@6/utils';

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
let quillEditor = null;
let autoSaveTimeout = null;
let draftKey = null;
let isInitializing = false; // Prevent double initialization on OAuth redirect

// ============================================
// API SERVICE
// ============================================
class JournalAPI {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async getAuthToken() {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) throw new Error('No token available');
      return token;
    } catch (error) {
      throw new Error('Not authenticated');
    }
  }

  async request(endpoint, options = {}) {
    if (!currentUser) throw new Error('Not authenticated');

    const url = `${this.baseUrl}${endpoint}`;

    try {
      const token = await this.getAuthToken();
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

  async getEntries(since = null) {
    let url = '/entries';
    if (since) url += `?since=${since}`;
    return this.request(url);
  }

  async createEntry(entry) {
    return this.request('/entry', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }

  async updateEntry(entryId, entry) {
    return this.request(`/entry/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(entry)
    });
  }

  async deleteEntry(entryId) {
    return this.request(`/entry/${entryId}`, {
      method: 'DELETE'
    });
  }

  async sync(entries, lastSyncTime) {
    return this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        entries,
        lastSyncTime
      })
    });
  }
}

const api = new JournalAPI();

// ============================================
// SYNC MANAGER (Offline Support)
// ============================================
class SyncManager {
  constructor(uid) {
    this.uid = uid;
    this.pendingKey = `pending_sync_${uid}`;
    this.lastSyncKey = `last_sync_${uid}`;
    this.isSyncing = false;
  }

  // Get pending changes queue
  getPendingChanges() {
    return safeParseJSON(this.pendingKey, []);
  }

  // Save pending changes
  savePendingChanges(changes) {
    localStorage.setItem(this.pendingKey, JSON.stringify(changes));
  }

  // Add a change to the pending queue
  queueChange(action, data) {
    const pending = this.getPendingChanges();
    pending.push({
      action,
      data,
      timestamp: Date.now(),
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
    this.savePendingChanges(pending);
    this.updateSyncStatus('pending');
  }

  // Clear pending changes
  clearPendingChanges() {
    localStorage.removeItem(this.pendingKey);
  }

  // Get last sync time
  getLastSyncTime() {
    return parseInt(localStorage.getItem(this.lastSyncKey) || '0');
  }

  // Set last sync time
  setLastSyncTime(time) {
    localStorage.setItem(this.lastSyncKey, time.toString());
  }

  // Check online status
  isOnline() {
    return navigator.onLine;
  }

  // Update sync status indicator
  updateSyncStatus(status) {
    const indicator = document.getElementById('syncStatus');
    if (!indicator) return;

    const pending = this.getPendingChanges();

    switch (status) {
      case 'syncing':
        indicator.innerHTML = '<span class="sync-indicator syncing">Syncing...</span>';
        break;
      case 'synced':
        indicator.innerHTML = '<span class="sync-indicator synced">Synced</span>';
        break;
      case 'offline':
        indicator.innerHTML = '<span class="sync-indicator offline">Offline</span>';
        break;
      case 'pending':
        indicator.innerHTML = `<span class="sync-indicator pending">${pending.length} pending</span>`;
        break;
      case 'error':
        indicator.innerHTML = '<span class="sync-indicator error">Sync error</span>';
        break;
    }
  }

  // Process pending changes queue
  async processQueue() {
    if (!this.isOnline() || this.isSyncing) return;

    const pending = this.getPendingChanges();
    if (pending.length === 0) return;

    this.isSyncing = true;
    this.updateSyncStatus('syncing');

    // Get current local entries BEFORE sync to preserve unsynced ones
    const currentLocalEntries = safeParseJSON(getEntriesKey(this.uid), []);
    const unsyncedLocalEntries = currentLocalEntries.filter(e => !e.synced);

    const entries = pending.map(p => ({
      action: p.action,
      ...p.data
    }));

    // Also add any unsynced local entries that aren't already in pending queue
    for (const unsyncedEntry of unsyncedLocalEntries) {
      const alreadyPending = entries.some(e => e.client_id === unsyncedEntry.id);
      if (!alreadyPending) {
        entries.push({
          action: 'create',
          client_id: unsyncedEntry.id,
          title: unsyncedEntry.title,
          text: unsyncedEntry.text,
          date: unsyncedEntry.date
        });
      }
    }

    try {
      const result = await api.sync(entries, this.getLastSyncTime());

      // Transform server entries to local format
      const serverEntries = result.entries.map(e => ({
        id: e.client_id || e.entry_id.toString(),
        entry_id: e.entry_id,
        title: e.title,
        text: e.text,
        date: e.date,
        synced: true
      }));

      // Create a map of server entries for quick lookup
      const serverEntryMap = new Map();
      serverEntries.forEach(e => {
        serverEntryMap.set(e.id, e);
        if (e.entry_id) serverEntryMap.set(e.entry_id.toString(), e);
      });

      // Merge: keep unsynced local entries that weren't synced in this batch
      const mergedEntries = [...serverEntries];
      for (const unsyncedEntry of unsyncedLocalEntries) {
        const wasSynced = serverEntryMap.has(unsyncedEntry.id) ||
                          (unsyncedEntry.entry_id && serverEntryMap.has(unsyncedEntry.entry_id.toString()));
        if (!wasSynced) {
          console.log('Preserving unsynced entry:', unsyncedEntry.id);
          mergedEntries.push(unsyncedEntry);
        }
      }

      localStorage.setItem(getEntriesKey(this.uid), JSON.stringify(mergedEntries));

      // Clear pending and update sync time
      this.clearPendingChanges();
      this.setLastSyncTime(result.syncTime);
      this.updateSyncStatus('synced');

      // Recalculate stats and refresh display
      recalcStats(this.uid, mergedEntries);
      displayStats(this.uid);
      displayEntries(mergedEntries);

      return result;
    } catch (error) {
      console.error('Queue processing failed:', error);
      this.updateSyncStatus('error');
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  // Full sync with server
  async fullSync() {
    if (!this.isOnline()) {
      this.updateSyncStatus('offline');
      return null;
    }

    this.isSyncing = true;
    this.updateSyncStatus('syncing');

    try {
      // Get current local entries BEFORE sync to preserve unsynced ones
      const currentLocalEntries = safeParseJSON(getEntriesKey(this.uid), []);
      const unsyncedLocalEntries = currentLocalEntries.filter(e => !e.synced);

      // First process any pending changes
      const pending = this.getPendingChanges();
      const entries = pending.map(p => ({
        action: p.action,
        ...p.data
      }));

      // Also add any unsynced local entries that aren't already in pending queue
      for (const unsyncedEntry of unsyncedLocalEntries) {
        const alreadyPending = entries.some(e => e.client_id === unsyncedEntry.id);
        if (!alreadyPending) {
          entries.push({
            action: 'create',
            client_id: unsyncedEntry.id,
            title: unsyncedEntry.title,
            text: unsyncedEntry.text,
            date: unsyncedEntry.date
          });
        }
      }

      // If no local entries, use lastSyncTime of 0 to get ALL entries from server
      let syncTime = this.getLastSyncTime();
      if (currentLocalEntries.length === 0) {
        console.log('fullSync: No local entries, fetching all from server');
        syncTime = 0;
      }

      const result = await api.sync(entries, syncTime);

      // Transform server entries to local format
      const serverEntries = result.entries.map(e => ({
        id: e.client_id || e.entry_id.toString(),
        entry_id: e.entry_id,
        title: e.title,
        text: e.text,
        date: e.date,
        synced: true
      }));

      // Create a map of server entries by client_id and entry_id for quick lookup
      const serverEntryMap = new Map();
      serverEntries.forEach(e => {
        serverEntryMap.set(e.id, e);
        if (e.entry_id) serverEntryMap.set(e.entry_id.toString(), e);
      });

      // Merge: keep unsynced local entries that weren't synced in this batch
      const mergedEntries = [...serverEntries];
      for (const unsyncedEntry of unsyncedLocalEntries) {
        // Check if this entry was synced (exists in server response)
        const wasSynced = serverEntryMap.has(unsyncedEntry.id) ||
                          (unsyncedEntry.entry_id && serverEntryMap.has(unsyncedEntry.entry_id.toString()));
        if (!wasSynced) {
          // Entry wasn't synced yet, keep it locally
          console.log('Preserving unsynced entry:', unsyncedEntry.id);
          mergedEntries.push(unsyncedEntry);
        }
      }

      // Save merged entries to localStorage
      localStorage.setItem(getEntriesKey(this.uid), JSON.stringify(mergedEntries));

      // Clear pending and update sync time
      this.clearPendingChanges();
      this.setLastSyncTime(result.syncTime);
      this.updateSyncStatus('synced');

      return mergedEntries;
    } catch (error) {
      console.error('Full sync failed:', error);
      this.updateSyncStatus('error');
      return null;
    } finally {
      this.isSyncing = false;
    }
  }
}

let syncManager = null;
let syncIntervalId = null;

// ============================================
// SAMPLE ENTRIES (for new users)
// ============================================
const SAMPLE_ENTRIES = [
  {
    title: "Welcome to Day by Day",
    text: "This is your personal journaling space. Write about your day, your thoughts, or whatever's on your mind. Your entries sync across all your devices, so you can journal from anywhere.",
    daysAgo: 0
  },
  {
    title: "Getting Started",
    text: "Try writing about one thing you're grateful for today. Small moments count! Regular journaling can help with self-reflection, stress relief, and tracking your personal growth.",
    daysAgo: 1
  }
];

async function seedSampleEntries(uid) {
  const seededKey = `seeded_${uid}`;
  if (localStorage.getItem(seededKey)) return;

  console.log('Seeding sample entries for new user');

  const entries = [];
  for (const sample of SAMPLE_ENTRIES) {
    const date = new Date();
    date.setDate(date.getDate() - sample.daysAgo);

    const entry = {
      title: sample.title,
      text: sample.text,
      date: date.toISOString(),
      client_id: `sample_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    try {
      await api.createEntry(entry);
      entries.push(entry);
    } catch (error) {
      console.error('Failed to seed entry:', error);
    }
  }

  localStorage.setItem(seededKey, 'true');
  return entries;
}

// ============================================
// VALIDATION CONSTANTS
// ============================================
const MAX_TITLE_LENGTH = 255;
const MAX_TEXT_LENGTH = 50000;

function validateEntry(title, text) {
  if (!text?.trim()) {
    return { valid: false, error: 'Please write something first' };
  }
  if (title && title.length > MAX_TITLE_LENGTH) {
    return { valid: false, error: `Title must be under ${MAX_TITLE_LENGTH} characters` };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: `Entry must be under ${MAX_TEXT_LENGTH.toLocaleString()} characters` };
  }
  return { valid: true };
}

// ============================================
// LOCAL STORAGE HELPERS
// ============================================

// Safe JSON parser with backup on corruption
function safeParseJSON(key, defaultValue = null) {
  try {
    const data = localStorage.getItem(key);
    if (!data) return defaultValue;
    return JSON.parse(data);
  } catch (e) {
    console.error(`Failed to parse localStorage key "${key}":`, e);
    // Backup corrupted data before returning default
    const backupKey = `${key}_backup_${Date.now()}`;
    localStorage.setItem(backupKey, localStorage.getItem(key));
    console.warn(`Corrupted data backed up to "${backupKey}"`);
    return defaultValue;
  }
}

function getUserProfile(uid) {
  return safeParseJSON(`user_profile_${uid}`, null);
}

function updateUserProfile(uid, profileData) {
  localStorage.setItem(`user_profile_${uid}`, JSON.stringify(profileData));
}

function getEntriesKey(uid) {
  return `journal_entries_${uid}`;
}

function getStatsKey(uid) {
  return `journal_stats_${uid}`;
}

// ============================================
// STATS FUNCTIONS
// ============================================
function getStats(uid) {
  return safeParseJSON(getStatsKey(uid), {
    totalEntries: 0,
    totalWords: 0,
    currentStreak: 0,
    lastEntryDate: null,
    firstEntryDate: null
  });
}

function updateStats(uid, newEntry) {
  const stats = getStats(uid);
  const today = new Date().toDateString();

  stats.totalEntries++;
  stats.totalWords += newEntry.text.split(/\s+/).filter(w => w).length;

  if (!stats.firstEntryDate) {
    stats.firstEntryDate = today;
  }

  // Update streak
  if (stats.lastEntryDate) {
    const lastDate = new Date(stats.lastEntryDate);
    const currentDate = new Date(today);
    const dayDiff = Math.floor((currentDate - lastDate) / (1000 * 60 * 60 * 24));

    if (dayDiff === 1) {
      stats.currentStreak++;
    } else if (dayDiff > 1) {
      stats.currentStreak = 1;
    }
  } else {
    stats.currentStreak = 1;
  }

  stats.lastEntryDate = today;
  localStorage.setItem(getStatsKey(uid), JSON.stringify(stats));
  return stats;
}

function recalcStats(uid, entries) {
  const stats = {
    totalEntries: entries.length,
    totalWords: 0,
    currentStreak: 0,
    lastEntryDate: null,
    firstEntryDate: null,
  };

  if (entries.length === 0) {
    localStorage.setItem(getStatsKey(uid), JSON.stringify(stats));
    return stats;
  }

  // Sort entries by date
  const sorted = [...entries].sort((a, b) => new Date(a.date) - new Date(b.date));

  stats.totalWords = sorted.reduce((sum, e) => sum + e.text.split(/\s+/).filter(w => w).length, 0);
  stats.firstEntryDate = new Date(sorted[0].date).toDateString();
  stats.lastEntryDate = new Date(sorted[sorted.length - 1].date).toDateString();

  // Calculate streak - must check if last entry is recent enough
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastEntryDay = new Date(sorted[sorted.length - 1].date);
  lastEntryDay.setHours(0, 0, 0, 0);

  const daysSinceLastEntry = Math.floor((today - lastEntryDay) / (1000 * 60 * 60 * 24));

  // Streak only counts if last entry was today or yesterday
  if (daysSinceLastEntry > 1) {
    stats.currentStreak = 0;
  } else {
    let streak = 1;
    for (let i = sorted.length - 1; i > 0; i--) {
      const current = new Date(sorted[i].date);
      current.setHours(0, 0, 0, 0);
      const prev = new Date(sorted[i - 1].date);
      prev.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((current - prev) / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Same day, don't increment streak
        continue;
      } else if (diffDays === 1) {
        streak++;
      } else {
        break;
      }
    }
    stats.currentStreak = streak;
  }

  localStorage.setItem(getStatsKey(uid), JSON.stringify(stats));
  return stats;
}

function displayStats(uid) {
  const stats = getStats(uid);
  document.getElementById('entryCount').textContent = stats.totalEntries;
  document.getElementById('wordCount').textContent = stats.totalWords.toLocaleString();
  document.getElementById('streakCount').textContent = stats.currentStreak;
}

// ============================================
// ENTRY DISPLAY FUNCTIONS
// ============================================
function displayEntries(entries) {
  const container = document.getElementById('entries');

  if (entries.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Your journal is waiting</h3>
        <p>Start documenting your thoughts, experiences, and reflections. Every journey begins with a single step.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  entries.slice().reverse().forEach(entry => {
    const wordCount = entry.text.split(/\s+/).filter(w => w).length;
    const syncIcon = entry.synced ? '' : '<span class="unsynced-badge" title="Not synced">*</span>';
    const div = document.createElement('div');
    div.className = 'entry';
    const entryId = entry.entry_id || entry.id;
    div.innerHTML = `
      <h3>${escapeHtml(entry.title)} ${syncIcon}</h3>
      <p>${escapeHtml(entry.text)}</p>
      <div class="entry-meta">
        <small>${new Date(entry.date).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })}</small>
        <span class="word-count">${wordCount} words</span>
        <div class="entry-actions">
          ${entry.synced && entry.entry_id ? `<button class="share-btn" onclick="shareEntry(${entry.entry_id})" title="Share with friends">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
          </button>
          <button class="link-btn" onclick="getShareLink(${entry.entry_id})" title="Get share link">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </button>` : ''}
          <button class="delete-btn" onclick="deleteEntry('${entry.id}')">Delete</button>
        </div>
      </div>
    `;
    container.appendChild(div);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function loadEntries(uid) {
  const entries = safeParseJSON(getEntriesKey(uid), []);
  displayEntries(entries);
}

// ============================================
// ENTRY CRUD OPERATIONS
// ============================================
async function saveEntry(uid, title, text) {
  const clientId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const newEntry = {
    id: clientId,
    title,
    text,
    date: new Date().toISOString(),
    synced: false
  };

  // Save locally first (optimistic update)
  const entries = safeParseJSON(getEntriesKey(uid), []);
  entries.push(newEntry);
  localStorage.setItem(getEntriesKey(uid), JSON.stringify(entries));

  // Update UI immediately
  updateStats(uid, newEntry);
  displayStats(uid);
  displayEntries(entries);

  // Sync to server
  if (syncManager && syncManager.isOnline()) {
    try {
      const result = await api.createEntry({
        title,
        text,
        date: newEntry.date,
        client_id: clientId
      });

      // Update local entry with server ID
      const updated = entries.map(e =>
        e.id === clientId
          ? { ...e, entry_id: result.entry.entry_id, synced: true }
          : e
      );
      localStorage.setItem(getEntriesKey(uid), JSON.stringify(updated));
      displayEntries(updated);
      syncManager.updateSyncStatus('synced');

      // Return the server entry_id for sharing
      return result.entry.entry_id;
    } catch (error) {
      console.error('Failed to sync entry:', error);
      // Queue for later sync
      syncManager.queueChange('create', {
        client_id: clientId,
        title,
        text,
        date: newEntry.date
      });
      // Show warning to user that entry is saved locally but not synced
      showToast('Entry saved locally. Sync pending...', 'warning');
      return null;
    }
  } else if (syncManager) {
    // Offline - queue for later
    syncManager.queueChange('create', {
      client_id: clientId,
      title,
      text,
      date: newEntry.date
    });
  }
  return null;
}

async function deleteEntry(id) {
  if (!currentUser) return;

  const entries = safeParseJSON(getEntriesKey(currentUser.uid), []);
  const entryToDelete = entries.find(e => e.id === id);
  const filtered = entries.filter(e => e.id !== id);

  // Update locally first
  localStorage.setItem(getEntriesKey(currentUser.uid), JSON.stringify(filtered));
  recalcStats(currentUser.uid, filtered);
  displayStats(currentUser.uid);
  displayEntries(filtered);

  // Sync deletion to server
  if (syncManager && entryToDelete?.entry_id) {
    if (syncManager.isOnline()) {
      try {
        await api.deleteEntry(entryToDelete.entry_id);
        syncManager.updateSyncStatus('synced');
      } catch (error) {
        console.error('Failed to delete on server:', error);
        syncManager.queueChange('delete', { entry_id: entryToDelete.entry_id });
      }
    } else {
      syncManager.queueChange('delete', { entry_id: entryToDelete.entry_id });
    }
  }
}

let currentShareEntryId = null;
let selectedConnections = new Set();

async function shareEntry(entryId) {
  if (!currentUser) return;

  currentShareEntryId = entryId;
  selectedConnections.clear();

  // Show modal immediately with loading state
  const connectionsList = document.getElementById('connectionsList');
  connectionsList.innerHTML = `
    <p style="text-align: center; color: var(--text-secondary);">
      <span class="loading-spinner" style="display: inline-block; width: 20px; height: 20px; border: 2px solid var(--border-color); border-top-color: var(--accent-primary); border-radius: 50%; animation: spin 1s linear infinite;"></span>
      Loading connections...
    </p>
  `;
  document.getElementById('shareModal').style.display = 'flex';

  // Load connections
  try {
    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');
    const response = await fetch(`${baseUrl}/journalLambdafunc/connections`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    if (!data.connections || data.connections.length === 0) {
      connectionsList.innerHTML = `
        <p style="text-align: center; color: var(--text-secondary);">
          No connections yet. <a href="connections.html">Add friends</a> to share entries with them.
        </p>
      `;
    } else {
      connectionsList.innerHTML = data.connections.map(conn => `
        <div class="connection-option" onclick="toggleConnection('${conn.uid}')">
          <input type="checkbox" id="conn-${conn.uid}" ${selectedConnections.has(conn.uid) ? 'checked' : ''}>
          <span class="connection-name">${escapeHtml(conn.first_name || conn.username || 'Friend')}</span>
          <span class="phone-status ${conn.phone_verified ? 'verified' : ''}">${conn.phone_verified ? 'SMS enabled' : ''}</span>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Error loading connections:', error);
    connectionsList.innerHTML = `
      <p style="text-align: center; color: var(--error);">
        Failed to load connections. <a href="#" onclick="shareEntry('${entryId}'); return false;">Try again</a>
      </p>
    `;
  }
}

function toggleConnection(uid) {
  if (selectedConnections.has(uid)) {
    selectedConnections.delete(uid);
  } else {
    selectedConnections.add(uid);
  }
  const checkbox = document.getElementById(`conn-${uid}`);
  if (checkbox) checkbox.checked = selectedConnections.has(uid);

  const option = checkbox?.closest('.connection-option');
  if (option) option.classList.toggle('selected', selectedConnections.has(uid));
}

function hideShareModal() {
  document.getElementById('shareModal').style.display = 'none';
  currentShareEntryId = null;
  selectedConnections.clear();
}

async function confirmShare() {
  if (!currentShareEntryId || selectedConnections.size === 0) {
    showToast('Select at least one friend to share with', 'error');
    return;
  }

  // Disable button to prevent duplicate requests
  const confirmBtn = document.querySelector('#shareModal .primary-btn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Sharing...';
  }

  try {
    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');
    const response = await fetch(`${baseUrl}/journalLambdafunc/entry/${currentShareEntryId}/share-with`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ connectionUids: Array.from(selectedConnections) })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    hideShareModal();
    showToast('Entry shared! They\'ll get notified.', 'success');
  } catch (error) {
    console.error('Error sharing entry:', error);
    showToast('Failed to share entry', 'error');
    // Re-enable button on error
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Share';
    }
  }
}

// ============================================
// PUBLIC SHARE LINK
// ============================================
async function getShareLink(entryId) {
  if (!currentUser) return;

  try {
    showToast('Creating share link...', 'info');

    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');
    const response = await fetch(`${baseUrl}/journalLambdafunc/entry/${entryId}/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    // Validate response has required data
    if (!data.shareUrl && !data.shareToken) {
      throw new Error('Invalid response from server');
    }

    // Use the shareUrl from backend, or build it from shareToken
    const shareUrl = data.shareUrl || `${window.location.origin}/journal/shared.html?token=${data.shareToken}`;

    // Show modal with copy functionality
    showShareLinkModal(shareUrl);
  } catch (error) {
    console.error('Error getting share link:', error);
    showToast('Failed to create share link', 'error');
  }
}

function showShareLinkModal(url) {
  // Create modal if it doesn't exist
  let modal = document.getElementById('shareLinkModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'shareLinkModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Share Link</h2>
          <button class="close-btn" onclick="hideShareLinkModal()">&times;</button>
        </div>
        <div class="modal-body">
          <p class="share-desc">Anyone with this link can see a preview. Friends can read the full entry.</p>
          <div class="share-link-container">
            <input type="text" id="shareLinkInput" readonly>
            <button onclick="copyShareLink()" class="primary-btn" id="copyLinkBtn">Copy</button>
          </div>
          <div class="modal-actions">
            <button onclick="hideShareLinkModal()" class="secondary-btn">Close</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  document.getElementById('shareLinkInput').value = url;
  modal.style.display = 'flex';
}

function hideShareLinkModal() {
  const modal = document.getElementById('shareLinkModal');
  if (modal) modal.style.display = 'none';
}

async function copyShareLink() {
  const input = document.getElementById('shareLinkInput');
  const btn = document.getElementById('copyLinkBtn');

  try {
    await navigator.clipboard.writeText(input.value);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    showToast('Link copied to clipboard!', 'success');
  } catch (err) {
    // Fallback for older browsers
    input.select();
    document.execCommand('copy');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  }
}

// ============================================
// PHONE VERIFICATION
// ============================================
async function loadPhoneStatus() {
  if (!currentUser) return;

  try {
    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');
    const response = await fetch(`${baseUrl}/journalLambdafunc/users/phone`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    const phoneStatus = document.getElementById('phoneStatus');
    const phoneForm = document.getElementById('phoneForm');
    const verifyForm = document.getElementById('verifyForm');

    if (data.verified) {
      phoneStatus.innerHTML = `
        <div class="verified">
          <svg viewBox="0 0 24 24" fill="none"><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/></svg>
          Verified: ${data.phoneNumber}
        </div>
      `;
      phoneForm.style.display = 'none';
      verifyForm.style.display = 'none';
    } else if (data.phoneNumber) {
      phoneStatus.innerHTML = `<p>Verification code sent to ${data.phoneNumber}</p>`;
      phoneForm.style.display = 'none';
      verifyForm.style.display = 'flex';
    } else {
      phoneStatus.innerHTML = '';
      phoneForm.style.display = 'flex';
      verifyForm.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading phone status:', error);
  }
}

async function sendPhoneCode() {
  const phoneInput = document.getElementById('phoneInput');
  const phone = phoneInput.value.replace(/\D/g, '');

  if (phone.length < 10) {
    showToast('Enter a valid phone number', 'error');
    return;
  }

  try {
    showToast('Sending verification code...', 'info');
    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');

    const response = await fetch(`${baseUrl}/journalLambdafunc/users/phone`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ phoneNumber: phone })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    showToast('Verification code sent!', 'success');
    document.getElementById('phoneForm').style.display = 'none';
    document.getElementById('verifyForm').style.display = 'flex';
    document.getElementById('phoneStatus').innerHTML = `<p>Code sent to ${data.phoneNumber}</p>`;
  } catch (error) {
    console.error('Error sending code:', error);
    showToast(error.message || 'Failed to send code', 'error');
  }
}

async function verifyPhoneCode() {
  const code = document.getElementById('verifyCodeInput').value;

  if (code.length !== 6) {
    showToast('Enter the 6-digit code', 'error');
    return;
  }

  try {
    showToast('Verifying...', 'info');
    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');

    const response = await fetch(`${baseUrl}/journalLambdafunc/users/phone/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ code })
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    showToast('Phone verified!', 'success');
    loadPhoneStatus();
  } catch (error) {
    console.error('Error verifying:', error);
    showToast(error.message || 'Invalid code', 'error');
  }
}

// ============================================
// FRIENDS SECTION
// ============================================
let friendsList = [];
let selectedFriendsForNewEntry = new Set();

async function loadFriends() {
  const container = document.getElementById('friendsList');
  if (!container || !currentUser) return;

  try {
    const token = await api.getAuthToken();
    const response = await fetch(`${API_BASE_URL}/connections`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    friendsList = data.connections || [];

    if (friendsList.length === 0) {
      container.innerHTML = `
        <div class="no-friends">
          <p>No friends yet. Invite someone to share your journal with!</p>
          <a href="connections.html" class="invite-btn">Invite Friends</a>
        </div>
      `;
      return;
    }

    // Render friends as clickable cards
    container.innerHTML = friendsList.map(friend => `
      <div class="friend-card" data-uid="${friend.uid}" onclick="toggleFriendForShare('${friend.uid}')">
        <div class="friend-avatar">${getInitials(friend.displayName)}</div>
        <span class="friend-name">${escapeHtml(friend.displayName)}</span>
        ${friend.phone_verified ? '<span class="friend-status verified">SMS</span>' : ''}
      </div>
    `).join('') + `
      <a href="connections.html" class="add-friend-card">
        <div class="friend-avatar">+</div>
        <span class="friend-name">Add</span>
      </a>
    `;
  } catch (error) {
    console.error('Error loading friends:', error);
    container.innerHTML = '<div class="friends-loading">Failed to load friends</div>';
  }
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function toggleFriendForShare(uid) {
  const card = document.querySelector(`.friend-card[data-uid="${uid}"]`);
  if (!card) return;

  if (selectedFriendsForNewEntry.has(uid)) {
    selectedFriendsForNewEntry.delete(uid);
    card.classList.remove('selected');
  } else {
    selectedFriendsForNewEntry.add(uid);
    card.classList.add('selected');
  }

  updateShareIndicator();
}

function updateShareIndicator() {
  let indicator = document.getElementById('shareWithIndicator');
  const form = document.getElementById('entryForm');

  if (selectedFriendsForNewEntry.size === 0) {
    if (indicator) indicator.remove();
    return;
  }

  // Get friend names
  const selectedFriends = friendsList.filter(f => selectedFriendsForNewEntry.has(f.uid));

  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'shareWithIndicator';
    indicator.className = 'share-with-indicator';
    form.insertBefore(indicator, form.firstChild);
  }

  indicator.innerHTML = `
    <span>Share with:</span>
    <div class="selected-friends">
      ${selectedFriends.map(f => `
        <span class="friend-chip">
          ${escapeHtml(f.displayName)}
          <span class="remove" onclick="event.stopPropagation(); deselectFriend('${f.uid}')">&times;</span>
        </span>
      `).join('')}
    </div>
  `;
}

function deselectFriend(uid) {
  selectedFriendsForNewEntry.delete(uid);
  const card = document.querySelector(`.friend-card[data-uid="${uid}"]`);
  if (card) card.classList.remove('selected');
  updateShareIndicator();
}

function clearFriendSelections() {
  selectedFriendsForNewEntry.clear();
  document.querySelectorAll('.friend-card.selected').forEach(c => c.classList.remove('selected'));
  updateShareIndicator();
}

// ============================================
// SHARED WITH ME
// ============================================
async function loadSharedWithMe() {
  if (!currentUser) return;

  try {
    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');
    const response = await fetch(`${baseUrl}/journalLambdafunc/entries/shared-with-me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    const section = document.getElementById('sharedWithMeSection');
    const container = document.getElementById('sharedEntries');
    const badge = document.getElementById('sharedUnreadBadge');

    if (data.entries && data.entries.length > 0) {
      section.style.display = 'block';

      if (data.unreadCount > 0) {
        badge.textContent = data.unreadCount;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }

      container.innerHTML = data.entries.map(entry => `
        <div class="shared-entry ${entry.is_read ? '' : 'unread'}" onclick="viewSharedEntry(${entry.share_id}, ${entry.entry_id})">
          <div class="shared-by">
            Shared by <strong>${escapeHtml(entry.sharedBy)}</strong>
            <span>• ${new Date(entry.shared_at).toLocaleDateString()}</span>
          </div>
          ${entry.prompt ? `<div class="entry-prompt">${escapeHtml(entry.prompt)}</div>` : ''}
          <h3>${escapeHtml(entry.title)}</h3>
          <p>${escapeHtml(entry.text).substring(0, 150)}${entry.text.length > 150 ? '...' : ''}</p>
        </div>
      `).join('');
    } else {
      section.style.display = 'none';
    }
  } catch (error) {
    console.error('Error loading shared entries:', error);
  }
}

async function viewSharedEntry(shareId, entryId) {
  // Mark as read
  try {
    const token = await api.getAuthToken();
    const baseUrl = API_BASE_URL.replace('/journalLambdafunc', '');
    const response = await fetch(`${baseUrl}/journalLambdafunc/entry-share/${shareId}/read`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      throw new Error('Failed to mark as read');
    }

    // Reload to update unread count
    loadSharedWithMe();
  } catch (error) {
    console.error('Error marking as read:', error);
    showToast('Failed to mark entry as read', 'error');
  }
}

// ============================================
// PROFILE FUNCTIONS
// ============================================
function showProfile() {
  if (!currentUser) return;

  const profile = getUserProfile(currentUser.uid);
  const profileContent = document.getElementById('profileContent');

  if (profile) {
    profileContent.innerHTML = `
      <div class="profile-item">
        <label>Display Name:</label>
        <span>${escapeHtml(profile.displayName || 'Not set')}</span>
      </div>
      <div class="profile-item">
        <label>Email:</label>
        <span>${escapeHtml(currentUser.email || profile.email || 'Not set')}</span>
      </div>
      <div class="profile-item">
        <label>Age Group:</label>
        <span>${escapeHtml(profile.age || 'Not specified')}</span>
      </div>
      <div class="profile-item">
        <label>Journaling Goal:</label>
        <span>${escapeHtml(profile.journalGoal || 'Not specified')}</span>
      </div>
      <div class="profile-item">
        <label>Writing Frequency:</label>
        <span>${escapeHtml(profile.writingFrequency || 'Not specified')}</span>
      </div>
      <div class="profile-item">
        <label>Preferred Writing Time:</label>
        <span>${escapeHtml(profile.favoriteTime || 'Not specified')}</span>
      </div>
      <div class="profile-item">
        <label>Inspiration:</label>
        <span>${escapeHtml(profile.inspiration || 'Not specified')}</span>
      </div>
      <div class="profile-item">
        <label>Member Since:</label>
        <span>${new Date(profile.createdAt).toLocaleDateString()}</span>
      </div>
    `;
  }

  document.getElementById('profileModal').style.display = 'flex';

  // Load phone verification status
  loadPhoneStatus();
}

function hideProfile() {
  document.getElementById('profileModal').style.display = 'none';
}

function editProfile() {
  alert('Profile editing feature coming soon!');
}

// ============================================
// ACCOUNT DELETION
// ============================================
function showDeleteAccountModal() {
  hideProfile();
  document.getElementById('deleteAccountModal').style.display = 'flex';
}

function hideDeleteAccountModal() {
  document.getElementById('deleteAccountModal').style.display = 'none';
}

async function deleteAccount() {
  if (!currentUser) return;

  const confirmBtn = document.getElementById('confirmDeleteBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Deleting...';

  try {
    const token = await api.getAuthToken();
    const response = await fetch(`${API_BASE_URL}/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete account');
    }

    // Clear local data
    localStorage.clear();

    // Sign out
    await signOut();

    // Redirect to home
    showToast('Account deleted successfully', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1500);
  } catch (error) {
    console.error('Error deleting account:', error);
    showToast('Failed to delete account: ' + error.message, 'error');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Delete My Account';
  }
}

function clearForm() {
  document.getElementById('entryTitle').value = '';
  if (quillEditor) {
    quillEditor.setContents([]);
  } else {
    const textArea = document.getElementById('entryText');
    if (textArea) textArea.value = '';
  }
  // Clear draft
  if (draftKey) {
    localStorage.removeItem(draftKey);
  }
  updateAutosaveIndicator('');
}

// ============================================
// QUILL EDITOR INITIALIZATION
// ============================================
function initializeQuillEditor() {
  if (typeof Quill === 'undefined') {
    console.log('Quill not loaded, using textarea fallback');
    return;
  }

  // Check if editor element exists
  const editorEl = document.getElementById('editor');
  if (!editorEl) return;

  quillEditor = new Quill('#editor', {
    theme: 'snow',
    placeholder: 'Write your thoughts, feelings, or experiences...',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['clean']
      ]
    }
  });

  // Auto-save on content change (debounced)
  quillEditor.on('text-change', () => {
    triggerAutoSave();
  });

  // Load draft if exists
  loadDraft();
}

// ============================================
// AUTO-SAVE FUNCTIONALITY
// ============================================
function triggerAutoSave() {
  if (!currentUser) return;

  // Clear existing timeout
  if (autoSaveTimeout) {
    clearTimeout(autoSaveTimeout);
  }

  updateAutosaveIndicator('saving');

  // Debounce: save after 1 second of inactivity
  autoSaveTimeout = setTimeout(() => {
    saveDraft();
    updateAutosaveIndicator('saved');
  }, 1000);
}

function saveDraft() {
  if (!currentUser || !draftKey) return;

  const title = document.getElementById('entryTitle')?.value || '';
  const content = quillEditor ? quillEditor.root.innerHTML : (document.getElementById('entryText')?.value || '');

  if (title || content !== '<p><br></p>') {
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        title,
        content,
        savedAt: Date.now()
      }));
    } catch (error) {
      // localStorage quota exceeded or not available
      console.error('Failed to save draft:', error);
      showToast('Storage full - draft not saved', 'error');
      updateAutosaveIndicator('');
    }
  }
}

function loadDraft() {
  if (!draftKey) return;

  const draft = safeParseJSON(draftKey, null);
  if (draft) {
    document.getElementById('entryTitle').value = draft.title || '';
    if (quillEditor && draft.content) {
      quillEditor.root.innerHTML = draft.content;
    }
    updateAutosaveIndicator('Draft restored');
    setTimeout(() => updateAutosaveIndicator(''), 2000);
  }
}

function updateAutosaveIndicator(status) {
  const indicator = document.getElementById('autosaveIndicator');
  if (!indicator) return;

  indicator.className = 'autosave-indicator';

  switch (status) {
    case 'saving':
      indicator.textContent = 'Saving...';
      indicator.classList.add('saving');
      break;
    case 'saved':
      indicator.textContent = 'Draft saved';
      indicator.classList.add('saved');
      break;
    default:
      indicator.textContent = status;
  }
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================
// SCROLL TO FORM (FAB ACTION)
// ============================================
function scrollToForm() {
  const formContainer = document.getElementById('entryFormContainer');
  if (formContainer) {
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Focus on title input after scroll
    setTimeout(() => {
      document.getElementById('entryTitle')?.focus();
    }, 300);
  }
}

// ============================================
// SWIPE GESTURES FOR ENTRIES
// ============================================
function initializeSwipeGestures() {
  if (typeof Hammer === 'undefined') {
    console.log('Hammer.js not loaded, skipping swipe gestures');
    return;
  }

  // Observer to add swipe to new entries
  const entriesContainer = document.getElementById('entries');
  if (!entriesContainer) return;

  const observer = new MutationObserver(() => {
    setupEntrySwipes();
  });

  observer.observe(entriesContainer, { childList: true });
  setupEntrySwipes();
}

function setupEntrySwipes() {
  const entries = document.querySelectorAll('.entry:not([data-swipe-initialized])');

  entries.forEach(entry => {
    entry.setAttribute('data-swipe-initialized', 'true');

    // Add swipe action indicator
    const swipeAction = document.createElement('div');
    swipeAction.className = 'swipe-action';
    swipeAction.textContent = 'Delete';
    entry.appendChild(swipeAction);

    const hammer = new Hammer(entry);
    hammer.on('swipeleft', () => {
      entry.classList.add('swiping');
      // Show delete confirmation
      const deleteBtn = entry.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.style.background = '#f44336';
        deleteBtn.focus();
      }
    });

    hammer.on('swiperight', () => {
      entry.classList.remove('swiping');
      const deleteBtn = entry.querySelector('.delete-btn');
      if (deleteBtn) {
        deleteBtn.style.background = '';
      }
    });

    // Tap to dismiss swipe state
    entry.addEventListener('click', (e) => {
      if (!e.target.classList.contains('delete-btn')) {
        entry.classList.remove('swiping');
      }
    });
  });
}

function getPersonalizedMessage(profile) {
  const messages = {
    'self-reflection': 'Take a moment to reflect on your journey today.',
    'goal-tracking': 'How are you progressing towards your goals?',
    'emotional-wellness': 'How are you feeling today? Let it out.',
    'creative-expression': 'What creative ideas are flowing through your mind?',
    'memory-keeping': 'What moments from today are worth remembering?',
    'habit-building': 'What positive habits are you building today?'
  };

  const timeOfDay = new Date().getHours();
  let greeting = '';

  if (timeOfDay < 12) {
    greeting = 'Good morning';
  } else if (timeOfDay < 17) {
    greeting = 'Good afternoon';
  } else {
    greeting = 'Good evening';
  }

  const goalMessage = messages[profile?.journalGoal] || 'What\'s on your mind today?';

  // Use Google name if available, fallback to profile displayName
  const name = profile?.displayName ||
               currentUser?.givenName ||
               currentUser?.name?.split(' ')[0] ||
               'there';

  return `${greeting}, ${name}! ${goalMessage}`;
}

// ============================================
// OAUTH CALLBACK HANDLING
// ============================================
// Listen for OAuth redirect completion
Hub.listen('auth', ({ payload }) => {
  switch (payload.event) {
    case 'signInWithRedirect':
      console.log('OAuth sign-in completed successfully');
      // Clean up URL by removing OAuth params
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      // Reset initialization flag to allow fresh initialization
      isInitializing = false;
      // Initialize dashboard after OAuth completes
      initializeDashboard();
      break;
    case 'signInWithRedirect_failure':
      console.error('OAuth sign-in failed:', payload.data);
      window.location.href = 'index.html';
      break;
  }
});

// ============================================
// INITIALIZATION
// ============================================
async function initializeDashboard() {
  // Prevent double initialization (can happen during OAuth redirect)
  if (isInitializing) {
    console.log('Dashboard initialization already in progress, skipping...');
    return;
  }
  isInitializing = true;

  // Clear any existing sync interval to prevent memory leak
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }

  try {
    // Check if user is authenticated
    const user = await getCurrentUser();
    let session = await fetchAuthSession();

    // IMPORTANT: Always use the sub from idToken - it's the consistent Cognito user ID
    // user.userId can be different (email for native users, provider ID for federated)
    let tokenSub = session.tokens?.idToken?.payload?.sub;

    // If no token sub, try forcing a session refresh
    if (!tokenSub) {
      console.log('No token sub found, forcing session refresh...');
      session = await fetchAuthSession({ forceRefresh: true });
      tokenSub = session.tokens?.idToken?.payload?.sub;
    }

    const userId = tokenSub || user.userId;

    // Debug logging to help diagnose user ID mismatches
    console.log('Auth debug:', {
      tokenSub,
      userId: user.userId,
      username: user.username,
      finalUserId: userId
    });

    // Warn if still falling back to user.userId (potential ID mismatch issue)
    if (!tokenSub) {
      console.warn('No token sub found even after refresh, using user.userId as fallback. This may cause sync issues.');
    }

    currentUser = {
      uid: userId,
      email: session.tokens?.idToken?.payload?.email || user.username,
      username: user.username,
      name: session.tokens?.idToken?.payload?.name,
      givenName: session.tokens?.idToken?.payload?.given_name
    };
  } catch (error) {
    console.log('Not authenticated, redirecting to login:', error.message);
    isInitializing = false; // Reset flag before redirect
    window.location.href = 'index.html';
    return;
  }

  // Initialize sync manager
  syncManager = new SyncManager(currentUser.uid);

  // Initialize draft key
  draftKey = `draft_${currentUser.uid}`;

  // Initialize Quill editor
  initializeQuillEditor();

  // Initialize swipe gestures
  initializeSwipeGestures();

  const profile = getUserProfile(currentUser.uid);

  // Update welcome message - prefer Google name over email prefix
  const displayName = profile?.displayName ||
                      currentUser.givenName ||
                      currentUser.name?.split(' ')[0] ||
                      currentUser.email?.split('@')[0] ||
                      'there';
  document.getElementById('welcome').textContent = `Welcome back, ${displayName}!`;

  // Set personalized message
  const personalizedMessage = getPersonalizedMessage(profile);
  document.getElementById('personalizedMessage').textContent = personalizedMessage;

  // Initialize sync status
  if (syncManager.isOnline()) {
    syncManager.updateSyncStatus('syncing');
  } else {
    syncManager.updateSyncStatus('offline');
  }

  // Check local entries and sync state
  const localEntries = safeParseJSON(getEntriesKey(currentUser.uid), []);
  const seededKey = `seeded_${currentUser.uid}`;
  const lastSyncTime = syncManager.getLastSyncTime();

  console.log('Sync debug:', {
    localEntriesCount: localEntries.length,
    lastSyncTime,
    isSeeded: !!localStorage.getItem(seededKey),
    isOnline: syncManager.isOnline()
  });

  // IMPORTANT: If no local entries but we have a lastSyncTime, clear it to force full fetch
  // This handles the case where user cleared browser data but lastSyncTime persisted somehow
  // OR when localStorage was cleared but auth cookies remained
  if (localEntries.length === 0 && lastSyncTime > 0) {
    console.log('Resetting lastSyncTime because local entries are empty');
    syncManager.setLastSyncTime(0);
  }

  // For fresh browser/cleared cache: fetch all entries from server first
  if (localEntries.length === 0 && syncManager.isOnline()) {
    try {
      console.log('No local entries, fetching from server...');
      const result = await api.getEntries();
      console.log('Server returned entries:', result.entries.length);

      if (result.entries.length > 0) {
        // Transform and save server entries to localStorage
        const serverEntries = result.entries.map(e => ({
          id: e.client_id || e.entry_id.toString(),
          entry_id: e.entry_id,
          title: e.title,
          text: e.text,
          date: e.date,
          synced: true
        }));
        localStorage.setItem(getEntriesKey(currentUser.uid), JSON.stringify(serverEntries));
        console.log('Saved server entries to localStorage');
      } else if (!localStorage.getItem(seededKey)) {
        // No entries on server and never seeded - seed sample entries
        console.log('No entries on server, seeding sample entries...');
        await seedSampleEntries(currentUser.uid);
      }
    } catch (error) {
      console.error('Failed to fetch entries from server:', error);
    }
  }

  // Perform full sync to catch any pending changes and merge
  try {
    const syncedEntries = await syncManager.fullSync();
    console.log('Full sync complete, entries:', syncedEntries?.length || 0);
    if (syncedEntries) {
      recalcStats(currentUser.uid, syncedEntries);
    }
  } catch (error) {
    console.error('Initial sync failed, using local data:', error);
  }

  // Load and display entries
  loadEntries(currentUser.uid);
  displayStats(currentUser.uid);

  // Fetch pending connections count for badge
  fetchPendingConnectionsCount();

  // Load friends section
  loadFriends();

  // Load entries shared with me
  loadSharedWithMe();

  // Set up periodic sync (every 5 minutes if online)
  syncIntervalId = setInterval(async () => {
    if (syncManager && syncManager.isOnline() && !syncManager.isSyncing) {
      const pending = syncManager.getPendingChanges();
      if (pending.length > 0) {
        await syncManager.processQueue();
      }
    }
  }, 5 * 60 * 1000);
}

async function fetchPendingConnectionsCount() {
  try {
    const token = await api.getAuthToken();
    const response = await fetch(`${API_BASE_URL}/connections/pending`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.ok) {
      const data = await response.json();
      // Update header badge
      const badge = document.getElementById('pendingBadge');
      if (badge && data.count > 0) {
        badge.textContent = data.count;
        badge.style.display = 'flex';
      }
      // Update bottom nav badge
      const navBadge = document.getElementById('navPendingBadge');
      if (navBadge && data.count > 0) {
        navBadge.textContent = data.count;
        navBadge.style.display = 'flex';
      }
    }
  } catch (error) {
    console.error('Failed to fetch pending connections:', error);
  }
}

// ============================================
// LOGOUT MODAL & SIGN OUT
// ============================================
function showLogoutModal() {
  document.getElementById('logoutModal').style.display = 'flex';
  document.getElementById('clearDataCheckbox').checked = false;

  // Check for unsynced entries and pending changes
  const warningEl = document.getElementById('logoutWarning');
  if (warningEl && currentUser) {
    const entries = safeParseJSON(getEntriesKey(currentUser.uid), []);
    const unsyncedCount = entries.filter(e => !e.synced).length;
    const pendingChanges = syncManager ? syncManager.getPendingChanges().length : 0;

    if (unsyncedCount > 0 || pendingChanges > 0) {
      warningEl.style.display = 'block';
      warningEl.innerHTML = `<strong>Warning:</strong> You have ${unsyncedCount + pendingChanges} unsynced entries that may be lost if you clear local data.`;
    } else {
      warningEl.style.display = 'none';
    }
  }
}

function hideLogoutModal() {
  document.getElementById('logoutModal').style.display = 'none';
}

async function confirmLogout() {
  const confirmBtn = document.getElementById('confirmLogoutBtn');
  const clearData = document.getElementById('clearDataCheckbox').checked;

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Signing out...';

  try {
    // Clear local data if requested
    if (clearData && currentUser) {
      const uid = currentUser.uid;
      localStorage.removeItem(`user_profile_${uid}`);
      localStorage.removeItem(`journal_entries_${uid}`);
      localStorage.removeItem(`journal_stats_${uid}`);
      localStorage.removeItem(`draft_${uid}`);
      localStorage.removeItem(`pending_sync_${uid}`);
      localStorage.removeItem(`last_sync_${uid}`);
      localStorage.removeItem(`seeded_${uid}`);
    }

    await signOut();
    currentUser = null;
    showToast('Signed out successfully', 'success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);
  } catch (error) {
    console.error('Sign out error:', error);
    showToast('Failed to sign out. Please try again.', 'error');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Sign Out';
  }
}

// Legacy function for backwards compatibility
async function signOutUser() {
  showLogoutModal();
}

// Initialize on page load
// Check if we're handling an OAuth callback (code in URL means OAuth is in progress)
const urlParams = new URLSearchParams(window.location.search);
const isOAuthCallback = urlParams.has('code') || urlParams.has('error');

if (isOAuthCallback) {
  // OAuth callback in progress - wait for Hub event to complete auth
  console.log('OAuth callback detected, waiting for auth completion...');
  // Show loading state while waiting
  document.getElementById('loadingOverlay')?.classList?.add('active');
} else {
  // Normal page load - initialize directly
  initializeDashboard();
}

// ============================================
// EVENT LISTENERS
// ============================================

// Form submission
document.getElementById('entryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('entryTitle').value;
  // Get content from Quill or fallback to textarea
  let text = '';
  if (quillEditor) {
    text = quillEditor.getText().trim(); // Get plain text for validation/storage
  } else {
    const textArea = document.getElementById('entryText');
    text = textArea ? textArea.value : '';
  }
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!currentUser) return;

  // For entries without title, use first line of text or date
  const finalTitle = title.trim() || text.split('\n')[0].substring(0, 50) || new Date().toLocaleDateString();

  // Validate input
  const validation = validateEntry(finalTitle, text);
  if (!validation.valid) {
    showToast(validation.error, 'error');
    return;
  }

  const entryId = await saveEntry(currentUser.uid, finalTitle, text);
  clearForm();

  // Share with selected friends if any
  if (selectedFriendsForNewEntry.size > 0 && entryId) {
    try {
      const token = await api.getAuthToken();
      const response = await fetch(`${API_BASE_URL}/entry/${entryId}/share-with`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ connectionUids: Array.from(selectedFriendsForNewEntry) })
      });

      if (response.ok) {
        const friendNames = friendsList
          .filter(f => selectedFriendsForNewEntry.has(f.uid))
          .map(f => f.displayName)
          .join(', ');
        showToast(`Entry saved & shared with ${friendNames}!`, 'success');
      } else {
        showToast('Entry saved, but sharing failed', 'error');
      }
    } catch (error) {
      console.error('Error sharing with friends:', error);
      showToast('Entry saved, but sharing failed', 'error');
    }
    clearFriendSelections();
  } else {
    showToast('Entry saved!', 'success');
  }
});

// Auto-resize textarea (only if it exists - may be replaced by Quill)
const entryTextArea = document.getElementById('entryText');
if (entryTextArea) {
  entryTextArea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
  });
}

// Title input auto-save trigger
document.getElementById('entryTitle')?.addEventListener('input', triggerAutoSave);

// Click outside modal to close
document.getElementById('profileModal').addEventListener('click', function(e) {
  if (e.target === this) {
    hideProfile();
  }
});

document.getElementById('deleteAccountModal').addEventListener('click', function(e) {
  if (e.target === this) {
    hideDeleteAccountModal();
  }
});

document.getElementById('logoutModal').addEventListener('click', function(e) {
  if (e.target === this) {
    hideLogoutModal();
  }
});

// Online/offline event listeners
window.addEventListener('online', async () => {
  console.log('Back online - syncing...');
  if (syncManager && currentUser) {
    try {
      await syncManager.processQueue();
      await syncManager.fullSync();
      loadEntries(currentUser.uid);
    } catch (error) {
      console.error('Reconnection sync failed:', error);
    }
  }
});

window.addEventListener('offline', () => {
  console.log('Gone offline - changes will be saved locally');
  if (syncManager) {
    syncManager.updateSyncStatus('offline');
  }
});

// Expose functions to window for onclick handlers (ES modules have their own scope)
window.showProfile = showProfile;
window.hideProfile = hideProfile;
window.editProfile = editProfile;
window.showDeleteAccountModal = showDeleteAccountModal;
window.hideDeleteAccountModal = hideDeleteAccountModal;
window.deleteAccount = deleteAccount;
window.signOutUser = signOutUser;
window.showLogoutModal = showLogoutModal;
window.hideLogoutModal = hideLogoutModal;
window.confirmLogout = confirmLogout;
window.clearForm = clearForm;
window.deleteEntry = deleteEntry;
window.shareEntry = shareEntry;
window.scrollToForm = scrollToForm;
window.showToast = showToast;
// Phone verification
window.sendPhoneCode = sendPhoneCode;
window.verifyPhoneCode = verifyPhoneCode;
// Share modal
window.toggleConnection = toggleConnection;
window.hideShareModal = hideShareModal;
window.confirmShare = confirmShare;
// Public share link
window.getShareLink = getShareLink;
window.hideShareLinkModal = hideShareLinkModal;
window.copyShareLink = copyShareLink;
// Shared entries
window.viewSharedEntry = viewSharedEntry;
// Friends section
window.toggleFriendForShare = toggleFriendForShare;
window.deselectFriend = deselectFriend;
window.clearFriendSelections = clearFriendSelections;
