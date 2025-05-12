const express = require('express');
const router = express.Router();
const authController = require('../controller/AuthController.js');
const aController = require('../controller/AController.js');
const adminController = require('../controller/adminController.js');
const userController = require('../controller/userController.js');
const plantOverview = require('../controller/PlantOverview.js');
const reportsController = require('../controller/reportsController.js');
const irrigationController = require('../controller/irrigationController.js');

router.get('/', aController.login);
router.get('/login', aController.login);
router.get('/register', aController.register);
router.get('/forgotpassword', aController.forgotpassword);


router.post('/login', aController.loginUser);
router.get("/admin-dashboard", aController.isAuthenticated, aController.isAdmin, adminController.Dashboard);

router.get("/user-dashboard", aController.isAuthenticated, userController.Dashboard);
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
router.get('/newpassword/:token', aController.newpassword);
router.get('/reset-password', aController.ResetPassword);

router.post('/newpassword', aController.handleNewPassword);



// aController.isAuthenticated, aController.isAdmin,
router.get('/admin-plant-overview', aController.isAuthenticated, aController.isAdmin, plantOverview.plantOverview);
router.get('/getRecommendedCrops', aController.isAuthenticated, aController.isAdmin, plantOverview.getRecommendedCrops);
router.post('/confirmCropSelection', plantOverview.confirmCropSelection);
router.get('/checkActiveCrop', plantOverview.getActiveCrop);  
router.post('/harvestCrop', aController.isAuthenticated, plantOverview.harvestCrop);



router.get('/admin-irrigation-controll', aController.isAuthenticated, aController.isAdmin, adminController.irrigationControll);
router.get('/api/soil-status', aController.isAuthenticated, irrigationController.getSoilStatus);
router.post('/api/toggle-automation', irrigationController.toggleAutomation);
router.get('/api/automation-state', irrigationController.getAutomationState);
router.post('/api/automation-trigger', irrigationController.handleAutomationTrigger);
router.post('/api/manual-trigger', irrigationController.handleManualTrigger);
router.post('/api/stop-trigger', irrigationController.handleStopTrigger);
router.post('/api/irrigation-records', irrigationController.createIrrigationRecord);
router.get('/admin-reports&analytics', aController.isAuthenticated, aController.isAdmin, reportsController.reportsAnalytics);
router.get('/admin-user-management', aController.isAuthenticated, aController.isAdmin, adminController.userManagement);


router.get('/plant-overview', aController.isAuthenticated, userController.plantOverview);
router.get('/irrigation', aController.isAuthenticated, userController.irrigationControll);
router.get('/reports', aController.isAuthenticated, aController.isAdmin, reportsController.reportsAnalytics);
router.get('/profile', aController.isAuthenticated, userController.profile);




router.get('/sensors/history', adminController.getCachedData);
router.get('/sensors_data', adminController.getSensorData);
router.get('/npk-data', adminController.getNPKData);
router.get('/npk-updates', adminController.npkUpdates);
router.get('/current-crop', aController.isAuthenticated, adminController.getCurrentCrop);
// router.get('/test-firestore-write', adminController.testFirestoreWrite);

// Reports & Analytics Routes
router.get('/api/sensor-data', aController.isAuthenticated, aController.isAdmin, reportsController.getSensorData);
router.get('/api/download-data', aController.isAuthenticated, aController.isAdmin, reportsController.downloadSensorData);
router.get('/api/crop-data', aController.isAuthenticated, aController.isAdmin, reportsController.getCropData);
router.get('/api/planted-crops', aController.isAuthenticated, aController.isAdmin, reportsController.getPlantedCrops);
router.get('/api/historical-sensor-data', aController.isAuthenticated, aController.isAdmin, reportsController.getHistoricalSensorData);
router.get('/api/crop-performance', aController.isAuthenticated, aController.isAdmin, reportsController.getCropPerformance);













// const cropController = require('../controller/cropController');

// // Add these routes
// router.get('/crops/recommend', cropController.getRecommendations);
// router.get('/crops/train', cropController.trainModel);

// router.post('/crops', cropController.addCrop);

module.exports = router;
