const admin = require('firebase-admin');
const dotenv = require("dotenv");
dotenv.config();
const serviceAccount = require('./path/to/serviceAccountKey.json'); // Replace with actual path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://net-house-automation-demofarm.firebaseio.com" // Replace if using Firestore
});

const db = admin.firestore(); // Use Firestore
const auth = admin.auth(); // Use Firebase Authentication

module.exports = { db, auth };
