function getJournalEntry(userId, entryId) {
  // Make an HTTP GET request to retrieve a journal entry
  $.ajax({
    url: 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/journalentry',
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
    data: { userId: userId, entryId: entryId },
    success: function (data) {
      // Display the journal entry in the page
      $('#entry-title').text(data.title);
      $('#entry-text').text(data.text);
    },
    error: function () {
      alert('Error getting journal entry');
    },
  });
}

function onSignIn(googleUser) {
  // Get the Google user profile
  var profile = googleUser.getBasicProfile();

  // Get the user's Google ID and set it as the user ID
  var googleId = profile.getId();
  $('#user-id').val(googleId);

  // Display the welcome message with the user's first name
  var firstName = profile.getGivenName();
  $('#welcome-message').text('Welcome, ' + firstName + '!');
}

// Function to handle the sign-out process
function signOut() {
  var auth2 = gapi.auth2.getAuthInstance();
  auth2.signOut().then(function () {
    // Clear the user ID field and welcome message
    $('#user-id').val('');
    $('#welcome-message').text('');
  });
}


function addPrompt() {
  var userId = $('#user-id').val(); // Get the user ID
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
    // Include userId in the data you send to your API
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

function addJournalEntry(userId, title, text) {
  // Make an HTTP POST request to add a journal entry to the database
  $.ajax({
    url: 'https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/journalentry',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    data: JSON.stringify({ userId: userId, entryId: generateEntryId(), title: title, text: text }),
    success: function () {
      // Notify the user that their journal entry was added
      alert('Your journal entry was added!');
    },
    error: function () {
      alert('Error adding journal entry');
    },
  });
}

function generateEntryId() {
  // Generate a unique entry ID (e.g., using a timestamp or a UUID library)
  return new Date().getTime().toString();
}

function submitJournalEntry() {
  var userId = $('#user-id').val();
  var title = $('#entry-title').val();
  var text = $('#entry-text').val();
  addJournalEntry(userId, title, text);
}
