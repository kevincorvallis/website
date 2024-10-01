// importContacts.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Load contacts from contacts.json
const contacts = require('./contacts.json');

async function importContacts() {
  const batch = db.batch();

  contacts.forEach(contact => {
    const docRef = db.collection('contacts').doc(contact.phoneNumber);
    batch.set(docRef, {
      phoneNumber: contact.phoneNumber,
      personalNote: contact.personalNote,
      firstName: contact.firstName,
      lastName: contact.lastName
    });
  });

  try {
    await batch.commit();
    console.log('Contacts imported successfully.');
  } catch (error) {
    console.error('Error importing contacts:', error);
  }
}

importContacts();
