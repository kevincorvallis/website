// dashboard.js
const firebaseConfig = {
  apiKey: "AIzaSyC2YGi_HPjp6edncQMAnSI6XHaRrUWus6o",
  authDomain: "coffeethoughts-41651.firebaseapp.com",
  projectId: "coffeethoughts-41651",
  storageBucket: "coffeethoughts-41651.appspot.com",
  messagingSenderId: "342424038908",
  appId: "1:342424038908:web:60bea2fba592d922e79679",
  measurementId: "G-Y02MZF303B"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
window.currentEditId = null;

// User profile functions
function getUserProfile(uid) {
  const profile = localStorage.getItem(`user_profile_${uid}`);
  return profile ? JSON.parse(profile) : null;
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

// Stats functions
function getStats(uid) {
  const stats = localStorage.getItem(getStatsKey(uid));
  return stats ? JSON.parse(stats) : {
    totalEntries: 0,
    totalWords: 0,
    currentStreak: 0,
    lastEntryDate: null,
    firstEntryDate: null
  };
}

function updateStats(uid, newEntry) {
  const stats = getStats(uid);
  const today = new Date().toDateString();
  
  stats.totalEntries++;
  stats.totalWords += newEntry.text.split(' ').length;
  
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

// Recalculate statistics from a given list of entries
function recalcStats(uid, entries) {
  const stats = {
    totalEntries: entries.length,
    totalWords: 0,
    currentStreak: 0,
    lastEntryDate: null,
    firstEntryDate: null,
  };

  if (entries.length > 0) {
    stats.totalWords = entries.reduce((sum, e) => sum + e.text.split(' ').length, 0);
    stats.firstEntryDate = new Date(entries[0].date).toDateString();
    stats.lastEntryDate = new Date(entries[entries.length - 1].date).toDateString();

    let streak = 1;
    for (let i = entries.length - 1; i > 0; i--) {
      const current = new Date(entries[i].date);
      const prev = new Date(entries[i - 1].date);
      const diffDays = Math.floor((current - prev) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
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

// Entry functions
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
    const wordCount = entry.text.split(' ').length;
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML = `
      <h3>${entry.title}</h3>
      <p>${entry.text}</p>
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
        <button class="edit-btn" onclick="editEntry('${entry.id}')" aria-label="Edit entry">Edit</button>
        <button class="delete-btn" onclick="deleteEntry('${entry.id}')" aria-label="Delete entry">Delete</button>
      </div>
    `;
    container.appendChild(div);
  });
}

function loadEntries(uid) {
  const entries = JSON.parse(localStorage.getItem(getEntriesKey(uid))) || [];
  displayEntries(entries);
}

function saveEntry(uid, title, text) {
  const entries = JSON.parse(localStorage.getItem(getEntriesKey(uid))) || [];
  const newEntry = { 
    title, 
    text, 
    date: new Date().toISOString(),
    id: Date.now().toString()
  };
  
  entries.push(newEntry);
  localStorage.setItem(getEntriesKey(uid), JSON.stringify(entries));
  
  // Update stats
  const stats = updateStats(uid, newEntry);
  displayStats(uid);
  displayEntries(entries);
}

// Delete an entry and update statistics
function deleteEntry(id) {
  const user = auth.currentUser;
  if (!user) return;

  const entries = JSON.parse(localStorage.getItem(getEntriesKey(user.uid))) || [];
  const filtered = entries.filter(e => e.id !== id);
  localStorage.setItem(getEntriesKey(user.uid), JSON.stringify(filtered));

  recalcStats(user.uid, filtered);
  displayStats(user.uid);
  displayEntries(filtered);
}

// Edit an entry
function editEntry(id) {
  const user = auth.currentUser;
  if (!user) return;

  const entries = JSON.parse(localStorage.getItem(getEntriesKey(user.uid))) || [];
  const entry = entries.find(e => e.id === id);
  if (!entry) return;

  document.getElementById('entryTitle').value = entry.title;
  document.getElementById('entryText').value = entry.text;
  window.currentEditId = id;
  document.querySelector('#entryForm button[type="submit"]').textContent = 'Update Entry';
}

function updateEntry(uid, id, title, text) {
  const entries = JSON.parse(localStorage.getItem(getEntriesKey(uid))) || [];
  const index = entries.findIndex(e => e.id === id);
  if (index === -1) return;

  entries[index].title = title;
  entries[index].text = text;
  localStorage.setItem(getEntriesKey(uid), JSON.stringify(entries));

  recalcStats(uid, entries);
  displayStats(uid);
  displayEntries(entries);
}

// Profile functions
function showProfile() {
  const user = auth.currentUser;
  if (!user) return;
  
  const profile = getUserProfile(user.uid);
  const profileContent = document.getElementById('profileContent');
  
  if (profile) {
    profileContent.innerHTML = `
      <div class="profile-item">
        <label>Display Name:</label>
        <span>${profile.displayName || 'Not set'}</span>
      </div>
      <div class="profile-item">
        <label>Email:</label>
        <span>${user.email}</span>
      </div>
      <div class="profile-item">
        <label>Age Group:</label>
        <span>${profile.age || 'Not specified'}</span>
      </div>
      <div class="profile-item">
        <label>Journaling Goal:</label>
        <span>${profile.journalGoal || 'Not specified'}</span>
      </div>
      <div class="profile-item">
        <label>Writing Frequency:</label>
        <span>${profile.writingFrequency || 'Not specified'}</span>
      </div>
      <div class="profile-item">
        <label>Preferred Writing Time:</label>
        <span>${profile.favoriteTime || 'Not specified'}</span>
      </div>
      <div class="profile-item">
        <label>Inspiration:</label>
        <span>${profile.inspiration || 'Not specified'}</span>
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
  // For now, redirect to a profile edit page or show inline editing
  alert('Profile editing feature coming soon!');
}

function clearForm() {
  document.getElementById('entryTitle').value = '';
  document.getElementById('entryText').value = '';
  window.currentEditId = null;
  document.querySelector('#entryForm button[type="submit"]').textContent = 'Save Entry';
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

// Authentication and initialization
auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  const profile = getUserProfile(user.uid);
  
  // Update welcome message
  document.getElementById('welcome').textContent = `Welcome back, ${profile?.displayName || user.displayName || user.email.split('@')[0]}!`;
  
  // Set personalized message
  const personalizedMessage = getPersonalizedMessage(profile);
  document.getElementById('personalizedMessage').textContent = personalizedMessage;
  
  // Load user data
  loadEntries(user.uid);
  displayStats(user.uid);
});

function signOutUser() {
  auth.signOut();
}

// Form submission
document.getElementById('entryForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = document.getElementById('entryTitle').value;
  const text = document.getElementById('entryText').value;
  const user = auth.currentUser;

  if (user && title.trim() && text.trim()) {
    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (window.currentEditId) {
      updateEntry(user.uid, window.currentEditId, title, text);
      window.currentEditId = null;
      submitBtn.textContent = 'Save Entry';
    } else {
      saveEntry(user.uid, title, text);
    }
    clearForm();

    // Show success feedback
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Saved!';
    submitBtn.style.background = '#4CAF50';

    setTimeout(() => {
      submitBtn.textContent = originalText;
      submitBtn.style.background = '';
    }, 2000);
  }
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

// Theme handling
function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme');
    document.getElementById('themeIcon').textContent = '🌙';
  } else {
    document.body.classList.remove('light-theme');
    document.getElementById('themeIcon').textContent = '☀';
  }
}

function toggleTheme() {
  const current = localStorage.getItem('journal_theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('journal_theme', next);
  applyTheme(next);
}

document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('journal_theme') || 'dark';
  applyTheme(saved);
});
