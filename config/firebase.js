const admin = require("firebase-admin");
const serviceAccount = require("./firebaseConfig.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://your-project-id.firebaseio.com",
});

const db = admin.firestore();
const auth = admin.auth(); // Firebase Authentication

module.exports = { admin, db, auth };
