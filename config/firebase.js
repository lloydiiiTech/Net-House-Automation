const admin = require("firebase-admin");
const serviceAccount = require("./firebaseConfig.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://net-house-automation-demofarm-default-rtdb.firebaseio.com/", 
});


const auth = admin.auth(); // Firebase Authentication (Optional)
const firestore = admin.firestore(); // Firestore Database
const realtimeDB = admin.database(); // Realtime Database

console.log("🔥 Firebase initialized: Firestore & Realtime Database");

// Function to sync RTDB to Firestore
const syncData = () => {
    const sensorRef = realtimeDB.ref("/sensors"); // Listen to RTDB path
    sensorRef.on("value", async (snapshot) => {
        if (snapshot.exists()) {
            const sensorData = snapshot.val(); // Get RTDB data
            try {
                await firestore.collection("sensors").add({
                    ...sensorData,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            } catch (error) {
                console.error("❌ Error syncing data:", error);
            }
        }
    });
};

// Call the sync function
syncData();

module.exports = { admin, firestore, realtimeDB, auth };
