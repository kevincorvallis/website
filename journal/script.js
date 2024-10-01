// script.js

// Import Firebase functions from CDN
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";

// Your Firebase configuration (replace with your actual config)
const firebaseConfig = {
    apiKey: "AIzaSyC2YGi_HPjp6edncQMAnSI6XHaRrUWus6o",
    authDomain: "coffeethoughts-41651.firebaseapp.com",
    projectId: "coffeethoughts-41651",
    storageBucket: "coffeethoughts-41651.appspot.com",
    messagingSenderId: "342424038908",
    appId: "1:342424038908:web:60bea2fba592d922e79679",
    measurementId: "G-Y02MZF303B"
    };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let analytics;

if (firebaseConfig.measurementId) {
    analytics = getAnalytics(app);
}

// Initialize reCAPTCHA verifier
window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
    'size': 'invisible',
    'callback': (response) => {
        // reCAPTCHA solved, proceed with signInWithPhoneNumber
        sendOTP();
    }
});

// Function to handle sending OTP
window.sendOTP = () => {
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    if (!phoneNumber) {
        alert('Please enter a valid phone number.');
        return;
    }

    // Inform users about SMS
    if (!confirm('By signing in with your phone number, you may receive an SMS for verification. Standard rates apply. Do you want to proceed?')) {
        return;
    }

    const appVerifier = window.recaptchaVerifier;

    signInWithPhoneNumber(auth, phoneNumber, appVerifier)
        .then((confirmationResult) => {
            window.confirmationResult = confirmationResult;
            alert('OTP has been sent to your phone.');
            document.getElementById('otpSection').style.display = 'block';
        })
        .catch((error) => {
            console.error('Error during signInWithPhoneNumber', error);
            alert('Error sending OTP. Please try again.');
            // Reset reCAPTCHA
            window.recaptchaVerifier.clear();
            window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
                'size': 'invisible',
                'callback': (response) => {
                    sendOTP();
                }
            }, auth);
        });
};

// Function to handle verifying OTP
window.verifyOTP = () => {
    const otp = document.getElementById('otp').value.trim();
    if (!otp) {
        alert('Please enter the OTP sent to your phone.');
        return;
    }

    window.confirmationResult.confirm(otp)
        .then((result) => {
            const user = result.user;
            alert('Phone number verified and user signed in!');
            // Fetch and display personal note
            fetchPersonalNote(user.phoneNumber);
        })
        .catch((error) => {
            console.error('Error verifying OTP', error);
            alert('Invalid OTP. Please try again.');
        });
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

// Auth state listener to handle persistent sessions
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in, fetch and display personal note
        fetchPersonalNote(user.phoneNumber);
    } else {
        // User is signed out, ensure UI shows the sign-in options
        document.getElementById('personalNote').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
    }
});
