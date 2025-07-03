// dashboard.js - handles basic journal entry operations
const firebaseConfig = {
  apiKey: "AIzaSyC2YGi_HPjp6edncQMAnSI6XHaRrUWus6o",
  authDomain: "coffeethoughts-41651.firebaseapp.com",
  projectId: "coffeethoughts-41651",
  storageBucket: "coffeethoughts-41651.appspot.com",
  messagingSenderId: "342424038908",
  appId: "1:342424038908:web:60bea2fba592d922e79679",
  measurementId: "G-Y02MZF303B",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const apiBase = 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod';
let currentUser = null;

auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    document.getElementById('welcome').textContent = `Welcome, ${user.displayName || user.email}`;
    loadEntries();
  } else {
    window.location.href = 'index.html';
  }
});

function loadEntries() {
  const url = `${apiBase}/entries?user_id=${encodeURIComponent(currentUser.uid)}`;
  fetch(url)
    .then((r) => r.json())
    .then((entries) => {
      const list = document.getElementById('entries');
      list.innerHTML = '';
      entries.forEach((entry) => {
        const li = document.createElement('li');
        li.textContent = `${entry.date} - ${entry.title}`;
        list.appendChild(li);
      });
    })
    .catch((err) => console.error('Error fetching entries', err));
}

document.getElementById('save-entry').addEventListener('click', () => {
  if (!currentUser) return;
  const title = document.getElementById('entry-title').value;
  const text = document.getElementById('entry-text').value;
  const payload = {
    user_id: currentUser.uid,
    date: new Date().toISOString().slice(0, 10),
    title,
    text,
    prompt_id: null,
  };
  fetch(`${apiBase}/entry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(() => {
      document.getElementById('entry-title').value = '';
      document.getElementById('entry-text').value = '';
      loadEntries();
    })
    .catch((err) => console.error('Error saving entry', err));
});

document.getElementById('sign-out').addEventListener('click', () => {
  auth.signOut().then(() => {
    window.location.href = 'index.html';
  });
});
