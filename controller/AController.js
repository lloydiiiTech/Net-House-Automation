const bcrypt = require("bcrypt");
const { admin, firestore } = require("../config/firebase");
const User = require("../models/User");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

exports.register = async (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session.user) {
        return res.redirect(req.session.user.role === "Admin" ? "/admin-dashboard" : "/user-dashboard");
    }
    res.render("register", {
        Data: {
            name: req.flash("name")[0] || "",
            contactNumber: req.flash("contactNumber")[0] || "",
            email: req.flash("email")[0] || "",
            error: req.flash("error")[0] || null,
            success: req.flash("success")[0] || null
        }
    });
};


exports.registerUser = async (req, res) => {
    try {
        const { name, contactNumber, email, password } = req.body;

        // Password validation
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(password)) {


            req.flash("error", "Password must contain an uppercase letter, a lowercase letter, a number, and be at least 8 characters long");
            req.flash("name", name);
            req.flash("contactNumber", contactNumber);
            req.flash("email", email);
            return res.redirect("/register");
        }

        // Check if email is already registered
        try {
            await admin.auth().getUserByEmail(email);
            req.flash("error", "Email already in use");
            
            req.flash("name", name);
            req.flash("contactNumber", contactNumber);
            req.flash("email", email);
            return res.redirect("/register");
            
        } catch (error) {
            if (error.code !== "auth/user-not-found") {
                console.error("Error checking user:", error);
                req.flash("error", "Server error, please try again");
                req.flash("name", name);
                req.flash("contactNumber", contactNumber);
                req.flash("email", email);
                return res.redirect("/register");


                
            }
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email,
            password,
            displayName: name,
        });

        // Generate Email Verification Link
        const actionCodeSettings = {
            url: `http://localhost:9999/login`, // Redirect after verification
            handleCodeInApp: true, 
        };
        const verificationLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);

        // Send Verification Email via Nodemailer
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "lloydiiitech@gmail.com", // Replace with your email
                pass: "okqa qucp hgpg vnzv", // Use App Passwords if using Gmail
            },
        });

        const mailOptions = {
            from: '"Your App Name" <your-email@gmail.com>',
            to: email,
            subject: "Verify Your Email",
            html: `
                <h2>Hello ${name},</h2>
                <p>Thank you for registering. Please verify your email by clicking the link below:</p>
                <a href="${verificationLink}" target="_blank">Verify Email</a>
                <p>If you did not request this, please ignore this email.</p>
                <br>
                <p>Best regards,<br>Your App Team</p>
            `,
        };

        await transporter.sendMail(mailOptions);

        // Save user to Firestore (optional)
        const newUser = new User(name, contactNumber, email, hashedPassword, false);
        await firestore.collection("users").doc(userRecord.uid).set(newUser.toFirestore());

        req.flash('success', 'Check your email to verify your account before logging in.');
        return res.redirect('/login');


    } catch (error) {
        console.error("Registration error:", error);
        
        req.flash('error', 'Server error, please try again');
        return res.redirect('/register');
    }
};







exports.login = async (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session.user) {
        return res.redirect(req.session.user.role === "Admin" ? "/admin-dashboard" : "/user-dashboard");
    }
    res.render("login", {
        Data: {
            email: req.flash("email")[0] || "",
            error: req.flash("error")[0] || null,
            success: req.flash("success")[0] || null
        }
    });  
};
const { auth } = require("../config/firebase");


exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            req.flash("error", "All fields are required");
            req.flash("email", email);
            return res.redirect("/login");
        }

        // 🔹 Check Firestore for user data
        const userQuery = await firestore.collection("users").where("email", "==", email).get();

        if (userQuery.empty) {
            req.flash("error", "Email is not register.");
            req.flash("email", email);
            return res.redirect("/login");
        }

        // 🔹 Extract user data
        let userDoc = userQuery.docs[0];
        let userData = userDoc.data();
        let userId = userDoc.id;

        // 🔹 Ensure password exists before bcrypt check
        if (!userData.password) {
            req.flash("error", "Invalid email or password.");
            req.flash("email", email);
            return res.redirect("/login");
        }

        // 🔹 Validate password with bcrypt
        const isPasswordValid = await bcrypt.compare(password, userData.password);
        if (!isPasswordValid) {
            req.flash("error", "Invalid email or password.");
            req.flash("email", email);
            return res.redirect("/login");
        }

        // 🔹 Check if email is verified
        if (!userData.isVerified) {
            const authUser = await auth.getUserByEmail(email); // Optional, only needed for verification
            if (authUser.emailVerified) {
                await firestore.collection("users").doc(userId).update({ isVerified: true });
                userData.isVerified = true;
            } else {
                req.flash("error", "Please verify your email before logging in.");
                req.flash("email", email);
                return res.redirect("/login");
            }
        }

        // 🔹 Check account status
        if (userData.Status === "Pending") {
            req.flash("error", "Your account is pending approval. Please wait for the admin to approve your access.");
            req.flash("email", email);
            return res.redirect("/login");
        }
        if (userData.Status === "Deactivated") {
            req.flash("error", "Your account was deactivated. Please contact the admin.");
            req.flash("email", email);
            return res.redirect("/login");
        }
        if (userData.Status !== "Active") {
            req.flash("error", "Account status is invalid. Please contact the admin.");
            req.flash("email", email);
            return res.redirect("/login");
        }

        // 🔹 Pass `req, res` in the correct order
        return loginSuccess(req, res, userData, userId);

    } catch (error) {
        console.error("Login error:", error);
        req.flash("error", "Something went wrong. Please try again.");
        return res.redirect("/login");
    }
};
const loginSuccess = async (req, res, userData, userId, email) => {
    if (!req.session) {
        console.error("Session is undefined! Ensure express-session is set up correctly.");
        req.flash("error", "Session error. Please try again.");
        req.flash("email", email);
        return res.redirect("/login");
    }

    // Update last login timestamp in Firestore
    try {
        await firestore.collection("users").doc(userId).update({
            lastLogin: new Date()
        });
    } catch (error) {
        console.error("Error updating last login:", error);
        // Continue with login even if last login update fails
    }

    // Configure session to not expire
    req.session.cookie.expires = false; // Session won't expire when browser is closed
    req.session.cookie.maxAge = null; // No maximum age (session won't expire automatically)

    req.session.user = {
        uid: userId,
        name: userData.name,
        contactNumber: userData.contactNumber,
        email: userData.email,
        role: userData.Role
    };

    console.log("Session saved:", req.session.user);

    req.session.save((err) => {
        if (err) {
            console.error("Session save error:", err);
            req.flash("error", "Could not save session. Try again.");
            req.flash("email", email);
            return res.redirect("/login");
        }

        return res.redirect(userData.Role === "Admin" ? "/admin-dashboard" : "/user-dashboard");
    });
};



exports.isAuthenticated = (req, res, next) => {
    if (!req.session.user) {
        req.flash("error", "Please log in first.");
        return res.redirect("/login");
    }
    next();
};

exports.isAdmin = (req, res, next) => {
    if (!req.session.user || req.session.user.role !== "Admin") {
        req.flash("error", "Unauthorized access.");
        return res.redirect("/login");
    }
    next();
};


// Email setup
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: "lloydiiitech@gmail.com", // Replace with your email
                pass: "okqa qucp hgpg vnzv", // Use App Passwords if using Gmail
            
    }
});



exports.forgotpassword = (req, res) => {
    res.render("forgotpassword", {
        Data: {
            email: req.flash("email")[0] || "",
            error: req.flash("error")[0] || null,
            success: req.flash("success")[0] || null,
            
        }
    });  
};
exports.handleForgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        // Check if user exists in Firestore
        const userSnapshot = await firestore.collection("users").where("email", "==", email).get();

        if (userSnapshot.empty) {
            req.flash("error", "Email not found.");
            req.flash("email", email);
            return res.redirect("/forgotpassword");
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = await bcrypt.hash(resetToken, 10); // Hash token for security
        const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes in milliseconds
        const Email = email;
        // Save token to Firestore
        await firestore.collection("password_resets").doc(email).set({
            token: hashedToken,  // Store the hashed token
            expiresAt: new Date(expiresAt).toISOString(), // Store as an ISO string
            email: Email
        });
        // Send password reset link via email
        const resetLink = `http://localhost:9999/newpassword/${resetToken}`;
        const mailOptions = {
            from: "lloydiiitech@gmail.com",
            to: email,
            subject: "Password Reset Link",
            text: `Click the link to reset your password: ${resetLink}\nThis link will expire in 15 minutes.`
        };

        await transporter.sendMail(mailOptions);
        req.flash("success", "Password reset link sent! Check your email.");
        res.redirect("/login");

    } catch (error) {
        console.error(error);
        req.flash("error", "Server Error, Please try again.");
        req.flash("email", email);
        res.redirect("/forgotpassword");
    }
};


exports.newpassword = async (req, res) => {
    const { token } = req.params;
    req.session.token = token;

        res.redirect("/reset-password");

};



exports.ResetPassword = async (req, res) => {

    if (!req.session.token) {
        req.flash("error", "Session expired. Please request a new reset link.");
        return res.redirect("/forgotpassword");
    }
    const token = req.session.token;
    
    try {
        // Get all password reset documents
        const resetSnapshot = await firestore.collection("password_resets").get();

        if (resetSnapshot.empty) {
            req.flash("error", "Invalid or expired reset link.");
            return res.redirect("/forgotpassword");
        }

        let resetDoc = null;
        for (const doc of resetSnapshot.docs) {
            const { token: hashedToken, expiresAt } = doc.data();

            // Compare the stored hashed token with the provided token
            const isMatch = await bcrypt.compare(token, hashedToken);
            if (isMatch) {
                resetDoc = doc;
                break;
            }
        }

        if (!resetDoc) {
            req.flash("error", "Invalid or expired reset link.");
            return res.redirect("/forgotpassword");
        }

        const { email, expiresAt } = resetDoc.data();

        // Convert `expiresAt` to a Date object if necessary
        const expiryTime = new Date(expiresAt).getTime(); 

        // Check if the reset token is expired
        if (Date.now() > expiryTime) {
            await firestore.collection("password_resets").doc(resetDoc.id).delete(); // Cleanup expired token
            req.flash("error", "Reset link expired. Request a new one.");
            return res.redirect("/forgotpassword");
        }

            

        res.render("newpassword", {
            Data: {
                email: email,
                error: req.flash("error")[0] || null,
                success: req.flash("success")[0] || null,
            }
        });
        

    } catch (error) {
        console.error("Error verifying reset token:", error);
        req.flash("error", "Something went wrong. Try again.");
        res.redirect("/forgotpassword");
    }


    
};
exports.handleNewPassword = async (req, res) => {
    const { email, newPassword, confirmPassword } = req.body;
    const { token } = req.session;

    // Validate session token
    if (!token) {
        req.flash("error", "Invalid or expired reset session.");
        return res.redirect("/forgotpassword");
    }

    try {
        // Retrieve reset token data from Firestore
        const resetSnapshot = await firestore.collection("password_resets").get();

        if (resetSnapshot.empty) {
            req.flash("error", "Invalid or expired reset link.");
            return res.redirect("/forgotpassword");
        }

        let resetDoc = null;
        for (const doc of resetSnapshot.docs) {
            const { token: hashedToken, expiresAt } = doc.data();

            // Compare the stored hashed token with the session token
            const isMatch = await bcrypt.compare(token, hashedToken);
            if (isMatch) {
                resetDoc = doc;
                break;
            }
        }

        if (!resetDoc) {
            req.flash("error", "Invalid or expired reset link.");
            return res.redirect("/forgotpassword");
        }

        const { expiresAt } = resetDoc.data();
        const expiryTime = new Date(expiresAt).getTime();

        // Check if token has expired
        if (Date.now() > expiryTime) {
            await firestore.collection("password_resets").doc(resetDoc.id).delete(); // Cleanup expired token
            req.flash("error", "Reset link expired. Request a new one.");
            return res.redirect("/forgotpassword");
        }

        // Validate password match
        if (newPassword !== confirmPassword) {
            req.flash("error", "Passwords do not match.");
            return res.redirect("/reset-password");
        }

        // Validate password strength
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(newPassword)) {
            req.flash("error", "Password must be at least 8 characters long, with uppercase, lowercase, and a number.");
            return res.redirect("/reset-password");
        }

        // Get Firebase Auth user
        const userRecord = await auth.getUserByEmail(email);

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password in Firestore (if stored)
        await firestore.collection("users").doc(userRecord.uid).update({
            password: hashedPassword,  // Store hashed password (if needed)
            lastPasswordUpdate: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update Firebase Authentication password
        await auth.updateUser(userRecord.uid, { password: newPassword });

        // Delete reset token from Firestore after successful reset
        await firestore.collection("password_resets").doc(resetDoc.id).delete();

        delete req.session.token;

        req.flash("success", "Password reset successful! Please log in.");
        res.redirect("/login");
    } catch (error) {
        console.error("Error updating password:", error);
        req.flash("error", "Server error. Please try again later.");
        res.redirect("/reset-password");
    }
};

exports.preventIfAuthenticated = (req, res, next) => {
    if (req.session.user) {
        return res.redirect(req.session.user.role === "Admin" ? "/admin-dashboard" : "/user-dashboard");
    }
    next();
};