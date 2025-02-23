const express = require('express');
const router = express.Router();
const authController = require('../controller/AuthController.js');
const aController = require('../controller/AController.js');

router.get('/', aController.login);
router.get('/home', authController.home);
router.get('/login', aController.login);
router.get('/register', aController.register);
router.get('/forgotpassword', aController.forgotpassword);


router.post('/login', aController.loginUser);
router.get("/admin-dashboard", aController.isAuthenticated, aController.isAdmin, (req, res) => {
    res.send("Welcome to the Admin Dashboard");
});

router.get("/user-dashboard", aController.isAuthenticated, (req, res) => {
    res.send("Welcome to the User Dashboard");
});
router.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout error:", err);
            return res.redirect("/home?error=Logout failed.");
        }
        res.redirect("/login?success=Logged out successfully.");
    });
});

router.post('/register', aController.registerUser);



router.post('/forgotpassword', aController.handleForgotPassword);
router.get("/newpassword/:token", aController.newpassword);
router.get('/reset-password', aController.ResetPassword);

router.post('/newpassword', aController.handleNewPassword);

module.exports = router;
