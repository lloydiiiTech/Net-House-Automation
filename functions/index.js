const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp(); // Initialize Firebase Admin SDK

exports.updateVerificationStatus = functions.auth.user().onUpdate(
    async (change) => {
      try {
        const user = change.after; // Get updated user info

        // Only proceed if the user has verified their email
        if (user.emailVerified) {
          const userRef = admin
              .firestore()
              .collection("users")
              .doc(user.uid);

          await userRef.update({isVerified: true}); // Update Firestore

          console.log(
              `✅ Firestore updated: ${user.email} is now verified.`,
          );
        }
      } catch (error) {
        console.error("❌ Error updating verification status:", error);
      }
    },
);
