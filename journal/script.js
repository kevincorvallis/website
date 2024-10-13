import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, signOut } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// Your Firebase configuration (replace with your actual config)
const firebaseConfig = {
    apiKey: "AIzaSyC2YGi_HPjp6edncQMAnSI6XHaRrUWus6o",
    authDomain: "coffeethoughts-41651.firebaseapp.com",
    projectId: "coffeethoughts-41651",
    storageBucket: "coffeethoughts-41651.appspot.com",
    messagingSenderId: "342424038908",
    appId: "1:342424038908:web:60bea2fba592d922e79679"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app); // Initialize Firebase Auth
const db = getFirestore(app); // Initialize Firestore

auth.languageCode = 'it'; // Optional: Set language

// Ensure reCAPTCHA is initialized when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
            size: 'invisible', // Invisible reCAPTCHA
            callback: (response) => {
                console.log("reCAPTCHA solved");
            },
            'expired-callback': () => {
                alert('reCAPTCHA expired. Please try again.');
            }
        }, auth);
        window.recaptchaVerifier.render().then((widgetId) => {
            window.recaptchaWidgetId = widgetId;
        });
    }
});

// Function to handle sending OTP
window.sendOTP = () => {
    const phoneNumber = getPhoneNumberFromUserInput();

    if (!phoneNumber) {
        alert("Please enter a valid phone number.");
        return;
    }

    const appVerifier = window.recaptchaVerifier;

    signInWithPhoneNumber(auth, phoneNumber, appVerifier)
        .then((confirmationResult) => {
            // SMS sent. Prompt user to type the code from the message
            window.confirmationResult = confirmationResult;
            alert('OTP has been sent. Please check your phone.');
            document.getElementById('otpSection').style.display = 'block'; // Show OTP input section
        })
        .catch((error) => {
            // Handle errors during signInWithPhoneNumber
            console.error('Error during signInWithPhoneNumber:', error);
            let errorMessage = 'Error sending OTP. Please try again.';
            if (error.code === 'auth/invalid-phone-number') {
                errorMessage = 'The provided phone number is not valid.';
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = 'Too many requests. Please try again later.';
            }
            alert(errorMessage);
            grecaptcha.reset(window.recaptchaWidgetId);  // Reset reCAPTCHA if error occurs
        });
};

// Function to verify OTP
window.verifyOTP = () => {
    const otpCode = document.getElementById('otp').value.trim();

    if (!otpCode) {
        alert('Please enter the OTP sent to your phone.');
        return;
    }

    if (!window.confirmationResult) {
        alert('OTP not sent. Please request the OTP again.');
        return;
    }

    // Confirm the OTP entered by the user
    window.confirmationResult.confirm(otpCode)
        .then((result) => {
            // User signed in successfully.
            const user = result.user;
            alert('Phone number verified and user signed in successfully!');
            console.log('User data:', user);
            // Perform additional actions after sign-in, if necessary
        })
        .catch((error) => {
            console.error('Error verifying OTP:', error);
            alert('Invalid OTP. Please try again.');
        });
};

// Callback function to initialize reCAPTCHA
function onloadCallback() {
    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
        'size': 'normal',  // 'invisible' can also be used for invisible reCAPTCHA
        'callback': function(response) {
            // reCAPTCHA solved, allow the user to proceed
            console.log('reCAPTCHA solved:', response);
        },
        'expired-callback': function() {
            // Response expired. Ask the user to solve reCAPTCHA again.
            alert('reCAPTCHA expired. Please solve the reCAPTCHA again.');
        }
    });

    // Render the reCAPTCHA
    window.recaptchaVerifier.render().then(function(widgetId) {
        window.recaptchaWidgetId = widgetId;
    });
}



// Helper function to get phone number from user input
const getPhoneNumberFromUserInput = () => {
    const phoneNumberInput = document.getElementById('phoneNumber').value.trim();
    if (!phoneNumberInput) {
        return null;
    }
    return phoneNumberInput; // Assume full international format, or format as per country code
};


// Function to fetch personal note from Firestore
window.fetchPersonalNote = async (phoneNumber) => {
    try {
        const docRef = doc(db, 'contacts', phoneNumber);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            displayPersonalNote(data.personalNote, data.firstName, data.lastName);
        } else {
            displayDefaultMessage();
        }
    } catch (error) {
        console.error('Error fetching personal note:', error);
        alert('Error fetching your personal note. Please try again.');
    }
};

// Function to display personal note
window.displayPersonalNote = (note, firstName, lastName) => {
    const noteContent = document.getElementById('noteContent');
    const personalNoteDiv = document.getElementById('personalNote');

    // Optionally personalize the message
    noteContent.textContent = `Hi ${firstName} ${lastName}, ${note}`;
    personalNoteDiv.style.display = 'block';
    // Hide sign-in sections
    document.querySelector('.container').style.display = 'none';
};

// Function to display default message for unknown users
window.displayDefaultMessage = () => {
    const noteContent = document.getElementById('noteContent');
    const personalNoteDiv = document.getElementById('personalNote');

    noteContent.textContent = "Welcome to Journaling! We're glad to have you here.";
    personalNoteDiv.style.display = 'block';
    // Hide sign-in sections
    document.querySelector('.container').style.display = 'none';
};

// Function to sign out the user
window.signOutUser = () => {
    signOut(auth)
        .then(() => {
            alert('You have been signed out.');
            // Reset UI
            document.getElementById('personalNote').style.display = 'none';
            document.querySelector('.container').style.display = 'block';
        })
        .catch((error) => {
            console.error('Error signing out:', error);
            alert('Error signing out. Please try again.');
        });
};
