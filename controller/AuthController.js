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
    
    registerUser: (req, res) => {
        const { name, email, password } = req.body;
        res.redirect('/login');
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

module.exports = AuthController;
