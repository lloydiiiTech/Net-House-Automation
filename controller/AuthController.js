const AuthController = {
    login: (req, res) => {
        res.render('login'); 
    },
    
    register: (req, res) => {
        res.render('register');
    },

    
    loginUser: (req, res) => {
        const { email, password } = req.body;
        res.redirect('/home');
    },
    
    
    home: (req, res) => {
        res.render('home'); 
    },
    
    forgotpassword: (req, res) => {
        res.render('forgotpassword'); 
    },
    
    handleForgotPassword: (req, res) => {
        const { email } = req.body;
    
        // Generate a random 6-digit PIN
        const generatedPin = Math.floor(100000 + Math.random() * 900000);
    
        console.log(`Fake email sent to: ${email} with PIN ${generatedPin}`); // Testing only
    
        // Store the PIN in a query parameter for testing (No session required)
        res.redirect(`/pinnumber?pin=${generatedPin}`);
    },
    

    pinnumber: (req, res) => {
        const pin = req.query.pin; // Read PIN from URL
    
        res.render('pinnumber', { pin }); // Pass PIN to the view (for testing)
    },
    

    verifyPinNumber: (req, res) => {
        const { pin } = req.body;
        const providedPin = req.query.pin; // Get PIN from query parameter

        if (parseInt(pin) === parseInt(providedPin)) {
            res.redirect('/newpassword'); // Redirect to new password setup
        } else {
            res.render('pinnumber', { error: "Invalid PIN. Try again." });
        }
    },

    newpassword: (req, res) => {
        res.render('newpassword'); 
    },
    
    handleNewPassword: (req, res) => {
        const { password, confirmed_password } = req.body;
        if (password === confirmed_password) {
            res.redirect('/login');
        } else {
            res.redirect('/newpassword'); 
        }
    },
};
const bcrypt = require("bcrypt");
const db = require("../config/firebase");
const User = require("../models/User");

exports.registerUser = async (req, res) => {
    try {
        const { name, contactNumber, email, password } = req.body;

        // Check if email already exists
        const usersRef = db.collection("users");
        const snapshot = await usersRef.where("email", "==", email).get();

        if (!snapshot.empty) {
            return res.status(400).json({ message: "Email already in use" });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create user instance
        const newUser = new User(name, contactNumber, email, hashedPassword);

        // Save user to Firestore
        await usersRef.add(newUser.toFirestore());

        res.status(201).json({ message: "User registered successfully" });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
};


module.exports = AuthController;

