// Load the Google Identity Services (GIS) library
function initializeSignInButton() {
  gapi.load('signin2', function() {
    gapi.signin2.render('google-signin-btn', {
      'scope': 'email',
      'width': 240,
      'height': 50,
      'longtitle': true,
      'theme': 'dark',
      'onsuccess': onSignIn,
      'onfailure': onFailure
    });
  });
}


// Render the Google Sign-In button
function renderSignInButton() {
  gapi.signin.render('google-signin-btn', {
    'client_id': '801961296119-s4u306t6rggorr92gtq8pc54uuhalirq.apps.googleusercontent.com',
    'callback': onSignIn,
    'scope': 'profile email',
    'ux_mode': 'popup',
    'theme': 'dark'
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

// Initialize the Google Sign-In button
function initGoogleAuth() {
  gapi.load('auth2', () => {
    gapi.auth2.init({
      client_id: '801961296119-s4u306t6rggorr92gtq8pc54uuhalirq.apps.googleusercontent.com',
      scope: 'profile email',
    }).then(() => {
      attachSignInHandler();
    });
  });
}

function attachSignInHandler() {
  const signInButton = document.getElementById('google-signin-btn');
  signInButton.addEventListener('click', () => {
    signIn();
  });
}

function signIn() {
  const auth2 = gapi.auth2.getAuthInstance();
  auth2.signIn()
    .then(onSignIn)
    .catch(onSignInFailure);
}

function onSignInFailure(error) {
  console.error('Error during sign-in:', error);
}
