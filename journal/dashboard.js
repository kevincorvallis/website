// dashboard.js - Day by Day Journal App
// With cloud sync and offline support

// ============================================
// CONFIGURATION
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyC2YGi_HPjp6edncQMAnSI6XHaRrUWus6o",
  authDomain: "coffeethoughts-41651.firebaseapp.com",
  projectId: "coffeethoughts-41651",
  storageBucket: "coffeethoughts-41651.appspot.com",
  messagingSenderId: "342424038908",
  appId: "1:342424038908:web:60bea2fba592d922e79679",
  measurementId: "G-Y02MZF303B"
};

const API_BASE_URL = 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/journalLambdafunc';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// ============================================
// API SERVICE
// ============================================
class JournalAPI {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  async getAuthToken() {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not authenticated');
    return user.getIdToken();
  }

  async request(endpoint, options = {}) {
    const user = firebase.auth().currentUser;
    if (!user) throw new Error('Not authenticated');

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

  async getEntries(uid, since = null) {
    let url = `/entries?firebase_uid=${uid}`;
    if (since) url += `&since=${since}`;
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

  async deleteEntry(entryId, uid) {
    return this.request(`/entry/${entryId}?firebase_uid=${uid}`, {
      method: 'DELETE'
    });
  }

  async sync(uid, entries, lastSyncTime) {
    return this.request('/sync', {
      method: 'POST',
      body: JSON.stringify({
        firebase_uid: uid,
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

    const entries = pending.map(p => ({
      action: p.action,
      ...p.data
    }));

    try {
      const result = await api.sync(this.uid, entries, this.getLastSyncTime());

      // Update local entries with server data
      const localEntries = result.entries.map(e => ({
        id: e.client_id || e.entry_id.toString(),
        entry_id: e.entry_id,
        title: e.title,
        text: e.text,
        date: e.date,
        synced: true
      }));

      localStorage.setItem(getEntriesKey(this.uid), JSON.stringify(localEntries));

      // Clear pending and update sync time
      this.clearPendingChanges();
      this.setLastSyncTime(result.syncTime);
      this.updateSyncStatus('synced');

      // Recalculate stats and refresh display
      recalcStats(this.uid, localEntries);
      displayStats(this.uid);
      displayEntries(localEntries);

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
      // First process any pending changes
      const pending = this.getPendingChanges();
      const entries = pending.map(p => ({
        action: p.action,
        ...p.data
      }));

      const result = await api.sync(this.uid, entries, this.getLastSyncTime());

      // Transform server entries to local format
      const localEntries = result.entries.map(e => ({
        id: e.client_id || e.entry_id.toString(),
        entry_id: e.entry_id,
        title: e.title,
        text: e.text,
        date: e.date,
        synced: true
      }));

      // Save to localStorage
      localStorage.setItem(getEntriesKey(this.uid), JSON.stringify(localEntries));

      // Clear pending and update sync time
      this.clearPendingChanges();
      this.setLastSyncTime(result.syncTime);
      this.updateSyncStatus('synced');

      return localEntries;
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
      firebase_uid: uid,
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
  if (!title?.trim()) {
    return { valid: false, error: 'Title is required' };
  }
  if (!text?.trim()) {
    return { valid: false, error: 'Entry text is required' };
  }
  if (title.length > MAX_TITLE_LENGTH) {
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
        <button class="delete-btn" onclick="deleteEntry('${entry.id}')">Delete</button>
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
        firebase_uid: uid,
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
    } catch (error) {
      console.error('Failed to sync entry:', error);
      // Queue for later sync
      syncManager.queueChange('create', {
        client_id: clientId,
        title,
        text,
        date: newEntry.date
      });
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
}

async function deleteEntry(id) {
  const user = auth.currentUser;
  if (!user) return;

  const entries = safeParseJSON(getEntriesKey(user.uid), []);
  const entryToDelete = entries.find(e => e.id === id);
  const filtered = entries.filter(e => e.id !== id);

  // Update locally first
  localStorage.setItem(getEntriesKey(user.uid), JSON.stringify(filtered));
  recalcStats(user.uid, filtered);
  displayStats(user.uid);
  displayEntries(filtered);

  // Sync deletion to server
  if (syncManager && entryToDelete?.entry_id) {
    if (syncManager.isOnline()) {
      try {
        await api.deleteEntry(entryToDelete.entry_id, user.uid);
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

// ============================================
// PROFILE FUNCTIONS
// ============================================
function showProfile() {
  const user = auth.currentUser;
  if (!user) return;

  const profile = getUserProfile(user.uid);
  const profileContent = document.getElementById('profileContent');

  if (profile) {
    profileContent.innerHTML = `
      <div class="profile-item">
        <label>Display Name:</label>
        <span>${escapeHtml(profile.displayName || 'Not set')}</span>
      </div>
      <div class="profile-item">
        <label>Email:</label>
        <span>${escapeHtml(user.email)}</span>
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
}

function hideProfile() {
  document.getElementById('profileModal').style.display = 'none';
}

function editProfile() {
  alert('Profile editing feature coming soon!');
}

function clearForm() {
  document.getElementById('entryTitle').value = '';
  document.getElementById('entryText').value = '';
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

  return `${greeting}, ${profile?.displayName || 'there'}! ${goalMessage}`;
}

// ============================================
// INITIALIZATION
// ============================================
auth.onAuthStateChanged(async user => {
  // Clear any existing sync interval to prevent memory leak
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }

  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  // Initialize sync manager
  syncManager = new SyncManager(user.uid);

  const profile = getUserProfile(user.uid);

  // Update welcome message
  document.getElementById('welcome').textContent = `Welcome back, ${profile?.displayName || user.displayName || user.email.split('@')[0]}!`;

  // Set personalized message
  const personalizedMessage = getPersonalizedMessage(profile);
  document.getElementById('personalizedMessage').textContent = personalizedMessage;

  // Initialize sync status
  if (syncManager.isOnline()) {
    syncManager.updateSyncStatus('syncing');
  } else {
    syncManager.updateSyncStatus('offline');
  }

  // Check if user needs sample entries (new user)
  const localEntries = safeParseJSON(getEntriesKey(user.uid), []);
  const seededKey = `seeded_${user.uid}`;

  if (localEntries.length === 0 && !localStorage.getItem(seededKey) && syncManager.isOnline()) {
    try {
      // Try to fetch existing entries from server first
      const result = await api.getEntries(user.uid);
      if (result.entries.length === 0) {
        // No entries on server, seed sample entries
        await seedSampleEntries(user.uid);
      }
    } catch (error) {
      console.error('Failed to check/seed entries:', error);
    }
  }

  // Perform initial sync
  try {
    const syncedEntries = await syncManager.fullSync();
    if (syncedEntries) {
      recalcStats(user.uid, syncedEntries);
    }
  } catch (error) {
    console.error('Initial sync failed, using local data:', error);
  }

  // Load and display entries
  loadEntries(user.uid);
  displayStats(user.uid);

  // Set up periodic sync (every 5 minutes if online)
  syncIntervalId = setInterval(async () => {
    if (syncManager && syncManager.isOnline() && !syncManager.isSyncing) {
      const pending = syncManager.getPendingChanges();
      if (pending.length > 0) {
        await syncManager.processQueue();
      }
    }
  }, 5 * 60 * 1000);
});

function signOutUser() {
  auth.signOut();
}

// ============================================
// EVENT LISTENERS
// ============================================

// Form submission
document.getElementById('entryForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = document.getElementById('entryTitle').value;
  const text = document.getElementById('entryText').value;
  const user = auth.currentUser;
  const submitBtn = e.target.querySelector('button[type="submit"]');

  if (!user) return;

  // Validate input
  const validation = validateEntry(title, text);
  if (!validation.valid) {
    // Show error feedback
    const originalText = submitBtn.textContent;
    submitBtn.textContent = validation.error;
    submitBtn.style.background = '#f44336';

    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.style.background = '';
    }, 3000);
    return;
  }

  saveEntry(user.uid, title, text);
  clearForm();

  // Show success feedback
  const originalText = submitBtn.textContent;
  submitBtn.textContent = 'Saved!';
  submitBtn.style.background = '#4CAF50';

  setTimeout(() => {
    submitBtn.textContent = originalText;
    submitBtn.style.background = '';
  }, 2000);
});

// Auto-resize textarea
document.getElementById('entryText').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = (this.scrollHeight) + 'px';
});

// Click outside modal to close
document.getElementById('profileModal').addEventListener('click', function(e) {
  if (e.target === this) {
    hideProfile();
  }
});

// Online/offline event listeners
window.addEventListener('online', async () => {
  console.log('Back online - syncing...');
  if (syncManager) {
    try {
      await syncManager.processQueue();
      await syncManager.fullSync();
      loadEntries(auth.currentUser?.uid);
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
