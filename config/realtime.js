const admin = require("firebase-admin");
const serviceAccount = require("./firebaseConfig.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://net-house-automation-demofarm-default-rtdb.firebaseio.com/", 
});

const db = admin.database();

console.log("Firebase database initialized:", db ? "Success" : "Failed");

module.exports = { rldb };
