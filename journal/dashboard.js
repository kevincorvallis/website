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

function getEntriesKey(uid) {
  return `journal_entries_${uid}`;
}

function displayEntries(entries) {
  const container = document.getElementById('entries');
  container.innerHTML = '';
  entries.slice().reverse().forEach(entry => {
    const div = document.createElement('div');
    div.className = 'entry';
    div.innerHTML = `<h3>${entry.title}</h3><p>${entry.text}</p><small>${new Date(entry.date).toLocaleString()}</small>`;
    container.appendChild(div);
  });
}

function loadEntries(uid) {
  const entries = JSON.parse(localStorage.getItem(getEntriesKey(uid))) || [];
  displayEntries(entries);
}

function saveEntry(uid, title, text) {
  const entries = JSON.parse(localStorage.getItem(getEntriesKey(uid))) || [];
  entries.push({ title, text, date: new Date().toISOString() });
  localStorage.setItem(getEntriesKey(uid), JSON.stringify(entries));
  displayEntries(entries);
}

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  document.getElementById('welcome').textContent = `Welcome back, ${user.displayName || user.email}!`;
  loadEntries(user.uid);
});

function signOutUser() {
  auth.signOut();
}

document.getElementById('entryForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = document.getElementById('entryTitle').value;
  const text = document.getElementById('entryText').value;
  const user = auth.currentUser;
  if (user) {
    saveEntry(user.uid, title, text);
    document.getElementById('entryTitle').value = '';
    document.getElementById('entryText').value = '';
  }
});
