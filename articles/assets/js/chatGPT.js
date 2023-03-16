function initializeSignInButton() {
  gapi.load('auth2', () => {
    gapi.auth2.init({
      client_id: '801961296119-s4u306t6rggorr92gtq8pc54uuhalirq.apps.googleusercontent.com',
    }).then(() => {
      const auth2 = gapi.auth2.getAuthInstance();
      const signInButton = document.getElementById('signin-btn');
      signInButton.addEventListener('click', () => {
        auth2.signIn({
          scope: 'email profile',
        }).then((user) => {
          onSignIn(user.getAuthResponse());
        }).catch((error) => {
          console.error('Error during sign-in:', error);
        });
      });
    });
  });
}


function init() {
  gapi.load('auth2', function() {
    gapi.auth2.init({
      client_id: '801961296119-s4u306t6rggorr92gtq8pc54uuhalirq.apps.googleusercontent.com',
    }).then(function() {
      renderButton();
    });
  });
}

function renderButton() {
  gapi.signin2.render('signin-btn', {
    'scope': 'profile email',
    'width': 250,
    'height': 50,
    'longtitle': true,
    'theme': 'dark',
    'onsuccess': handleCredentialResponse,
    'onfailure': function() {
      console.log('Sign-in error');
    }
  });
}


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

async function handleCredentialResponse(response) {
  try {
    const token = response.credential;
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + token);
    const userData = await userInfo.json();

    const userId = userData.email;
    const firstName = userData.given_name;

    $('#user-id').val(userId);
    $('#welcome-message').text('Welcome, ' + firstName + '!');
  } catch (error) {
    console.error('Error handling credential response:', error);
  }
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
  var userId = $('#user-id').val(); // Use userId instead of profile.getEmail()
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
  var userId = $('#user-id').val(); // Use userId instead of profile.getEmail()
  var title = $('#entry-title').val();
  var text = $('#entry-text').val();
  addJournalEntry(userId, title, text);
}
 
$("#google-signin-btn").on("click", function () {
  google.accounts.id.prompt(function (response) {
    if (response && response.credential) {
      authenticateUser(response.credential);
    }
  });
});

function authenticateUser(idToken) {
    $.ajax({
        url: "https://0a65j03yja.execute-api.us-west-2.amazonaws.com/prod/authenticate",
        method: "POST",
        contentType: "application/json",
        dataType: "json",
        data: JSON.stringify({
            "id_token": idToken
        }),
        success: function (response) {
            // Handle successful authentication here
            console.log("Authentication successful:", response);
        },
        error: function (jqXHR, textStatus, errorThrown) {
            // Handle authentication error here
            console.error("Authentication error:", textStatus, errorThrown);
        }
    });
}

async function handleCredentialResponse(response) {
  try {
    const token = response.credential;
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + token);
    const userData = await userInfo.json();

    const userId = userData.email;
    const firstName = userData.given_name;

    $('#user-id').val(userId);
    $('#welcome-message').text('Welcome, ' + firstName + '!');
  } catch (error) {
    console.error('Error handling credential response:', error);
  }
}
$("#google-signin-btn").on("click", function () {
  google.accounts.id.prompt(function (response) {
      if (response && response.credential) {
          authenticateUser(response.credential);
      }
  });
});

