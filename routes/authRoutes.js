const express = require('express');
const router = express.Router();
const authController = require('../controller/AuthController.js');

router.get('/', authController.login);
router.get('/home', authController.home);
router.get('/login', authController.login);
router.get('/register', authController.register);
router.get('/forgotpassword', authController.forgotpassword);
router.get('/pinnumber', authController.pinnumber); // Added PIN verification page
router.get('/newpassword', authController.newpassword);

router.post('/login', authController.loginUser);
router.post('/register', authController.registerUser);
router.post('/forgotpassword', authController.handleForgotPassword);
router.post('/pinnumber', authController.verifyPinNumber); // Added PIN verification handling
router.post('/newpassword', authController.handleNewPassword);

module.exports = router;
