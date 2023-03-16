var userEmail; // Declare a global variable to store the user email
var userFirstName = '';

function onSignIn(googleUser) {
  // Get the user's ID token, which you can send to your server for verification
  var id_token = googleUser.getAuthResponse().id_token;

  // Get basic profile information about the user
  var profile = googleUser.getBasicProfile();
  userEmail = profile.getEmail(); // Use the email as the user ID
  var userName = profile.getName();
  userFirstName = profile.getGivenName();


  // Display user information
  document.getElementById('user-info').style.display = 'block';
  document.getElementById('user-name').textContent = userName;
  document.getElementById('user-id-display').textContent = userEmail;

  // Hide the sign-in button
  // document.getElementsByClassName('g-signin2')[0].style.display = 'none';

  // showWelcomePopup(userName);
  userFirstName = profile.getGivenName();
  // showUserBanner(userFirstName);
  // Redirect to the journalPrompts.html page
  window.location = 'articles/journalPrompts.html'


}

function startApp() {
  gapi.load('auth2', function() {
      gapi.auth2.init();
  });
}

function showWelcomePopup(userName) {
  // Create the welcome popup
  var popup = document.createElement('div');
  popup.id = 'welcome-popup';
  popup.innerHTML = `<p>Welcome, ${userName}!</p>`;
  
  // Add the welcome popup to the body
  document.body.appendChild(popup);
  
  // Remove the welcome popup after 3 seconds
  setTimeout(function () {
      popup.style.opacity = '0';
      setTimeout(function () {
          document.body.removeChild(popup);
      }, 1000);
  }, 3000);
}

function showUserBanner(userFirstName) {
  var banner = document.createElement('div');
  banner.id = 'user-banner';
  banner.innerHTML = `Hi, ${userFirstName}!`;

  document.body.appendChild(banner);
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
    data: JSON.stringify({ userId: userEmail, prompt: customPrompt }),
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
  addJournalEntry(userEmail, title, text);
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


async function generatePrompt() {
  const apiUrl = "https://api.quotable.io/random";
  
  try {
    const response = await fetch(apiUrl);
    const data = await response.json();
    const prompt = data.content;

    document.getElementById("prompt").innerHTML = prompt;
  } catch (error) {
    console.error("Error fetching prompt:", error);
    document.getElementById("prompt").innerHTML = "Error fetching prompt. Please try again.";
  }
}

