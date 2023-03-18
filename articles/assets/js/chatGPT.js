// Load the Google Identity Services (GIS) library
function initializeSignInButton() {
  gapi.load('signin2', renderSignInButton);
}

// Render the Google Sign-In button
function renderSignInButton() {
  gapi.signin2.render('google-signin-btn', {
    'width': 250,
    'height': 50,
    'longtitle': true,
    'theme': 'dark',
    'onsuccess': onSignIn,
    'onfailure': function() {
      console.log('Sign-in error');
    }
  });
}

// Handle successful sign-in
async function onSignIn(googleUser) {
  const id_token = googleUser.getAuthResponse().id_token;
  const userInfoResponse = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${id_token}`);
  const userInfo = await userInfoResponse.json();

  const userId = userInfo.email;
  const firstName = userInfo.given_name;

  $('#user-id').val(userId);
  $('#welcome-message').text(`Welcome, ${firstName}!`);
}


// Function to handle the sign-out process
function signOut() {
  const auth2 = gapi.auth2.getAuthInstance();
  auth2.signOut().then(function () {
    // Clear the user ID field and welcome message
    $('#user-id').val('');
    $('#welcome-message').text('');
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


window.onload = initializeSignInButton;

initializeSignInButton();
