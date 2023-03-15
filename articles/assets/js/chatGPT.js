var userId; // Declare a global variable to store the user ID

function onSignIn(googleUser) {
  // Get the user's ID token, which you can send to your server for verification
  var id_token = googleUser.getAuthResponse().id_token;

  // Get basic profile information about the user
  var profile = googleUser.getBasicProfile();
  var userId = profile.getId();
  var userName = profile.getName();
  var userEmail = profile.getEmail();

  // Display user information
  document.getElementById('user-info').style.display = 'block';
  document.getElementById('user-name').textContent = userName;
  document.getElementById('user-id-display').textContent = userId;

  // Hide the sign-in button
  document.getElementsByClassName('g-signin2')[0].style.display = 'none';
}

function signOut() {
  var auth2 = gapi.auth2.getAuthInstance();
  auth2.signOut().then(function () {
    console.log('User signed out.');

    // Hide user information and show the sign-in button
    document.getElementById('user-info').style.display = 'none';
    document.getElementsByClassName('g-signin2')[0].style.display = 'block';
  });
}

function addPrompt() {
  var customPrompt = $('#custom-prompt').val();
  if (customPrompt.trim() === "") {
    alert("Please enter a non-empty prompt.");
    return;
  }

  $.ajax({
    url: 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/addprompt',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({ userId: userId, prompt: customPrompt }),
    success: function () {
      $('#custom-prompt').val(''); // Clear the input field
      alert('Your prompt was added!');
    },
    error: function () {
      alert('Error adding prompt');
    },
  });
}

function submitJournalEntry() {
  var title = $('#entry-title').val();
  var text = $('#entry-text').val();
  addJournalEntry(userId, title, text);
}




function addJournalEntry(userId, title, text) {
  // Make an HTTP POST request to add a journal entry to the database
  $.ajax({
    url: 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/journalentry',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({userId: userId, entryId: generateEntryId(), title: title, text: text}),
    success: function() {
      // Notify the user that their journal entry was added
      alert('Your journal entry was added!');
    },
    error: function() {
      alert('Error adding journal entry');
    }
  });
}
function generateEntryId() {
  // Generate a unique entry ID (e.g., using a timestamp or a UUID library)
  return new Date().getTime().toString();
}