const admin = require("firebase-admin");
class User {
    constructor(name, contactNumber, email, password, isVerified = false, Accessible = false, Role = "User", createdAt = admin.firestore.FieldValue.serverTimestamp()) {
        this.name = name;
        this.contactNumber = contactNumber;
        this.email = email;
        this.password = password; // Now storing hashed password
        this.createdAt = createdAt;
        this.isVerified = isVerified;
        this.Accessible = Accessible;
        this.Role = Role;
    }

    toFirestore() {
        return {
            name: this.name,
            contactNumber: this.contactNumber,
            email: this.email,
            password: this.password, // Save hashed password
            createdAt: this.createdAt || admin.firestore.FieldValue.serverTimestamp(),
            isVerified: this.isVerified,
            Accessible: this.Accessible,
            Role: this.Role,
        };
    }

    static fromFirestore(doc) {
        const data = doc.data();
        return new User(
            data.name,
            data.contactNumber,
            data.email,
            data.password, // Retrieve password
            data.createdAt ? data.createdAt.toDate().toISOString() : null,
            data.isVerified,
            data.Accessible,
            data.Role
        );
    }
}

module.exports = User;
