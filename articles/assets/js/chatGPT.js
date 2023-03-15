var userId; // Declare a global variable to store the user ID

function onSignIn(googleUser) {
  // Get the user's ID token, which you can send to your server for verification
  var id_token = googleUser.getAuthResponse().id_token;

  // Get basic profile information about the user
  var profile = googleUser.getBasicProfile();
  userId = profile.getId(); // Set the global userId variable
  var userName = profile.getName();
  var userEmail = profile.getEmail();

  // Perform any other actions needed after a successful sign-in
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