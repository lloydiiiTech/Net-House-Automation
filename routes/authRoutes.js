const express = require('express');
const router = express.Router();
const authController = require('../controller/AuthController.js');
const aController = require('../controller/AController.js');
const adminController = require('../controller/adminController.js');
const userController = require('../controller/userController.js');
const plantOverview = require('../controller/PlantOverview.js');
const reportsController = require('../controller/reportsController.js');
const irrigationController = require('../controller/irrigationController.js');
const userManagementController = require('../controller/userManagementController.js');
const userProfileController = require('../controller/userProfileController.js');
const recommendationController = require('../controller/recommendationController.js');

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
router.post('/confirmCropSelection', recommendationController.confirmCropSelection);
router.get('/checkActiveCrop', plantOverview.checkActiveCrop);  
router.post('/harvestCrop', aController.isAuthenticated, plantOverview.harvestCurrentCrop);
router.get('/realtime-sensor-data', aController.isAuthenticated, plantOverview.getRealtimeSensorData);
router.get('/api/weather', aController.isAuthenticated, plantOverview.getWeatherData);



router.get('/admin-irrigation-controll', aController.isAuthenticated, aController.isAdmin, adminController.irrigationControll);
router.get('/api/soil-status', aController.isAuthenticated, irrigationController.getSoilStatus);
router.post('/api/toggle-automation', irrigationController.toggleAutomation);
router.get('/api/automation-state', irrigationController.getAutomationState);
router.post('/api/automation-trigger', irrigationController.handleAutomationTrigger);
router.post('/api/manual-trigger', irrigationController.handleManualTrigger);
router.post('/api/stop-trigger', irrigationController.handleStopTrigger);
router.post('/api/irrigation-records', irrigationController.createIrrigationRecord);

// Add new routes for irrigation scheduling
router.post('/api/irrigation-schedules', aController.isAuthenticated, irrigationController.saveIrrigationSchedule);
router.get('/api/irrigation-schedules', aController.isAuthenticated, irrigationController.getIrrigationSchedules);
router.post('/api/irrigation-schedules/:id/toggle', aController.isAuthenticated, irrigationController.toggleIrrigationSchedule);
router.put('/api/irrigation-schedules/:id', aController.isAuthenticated, irrigationController.updateIrrigationSchedule);
router.delete('/api/irrigation-schedules/:id', aController.isAuthenticated, irrigationController.deleteIrrigationSchedule);

// Add new route for paginated irrigation history
router.get('/api/irrigation-history', aController.isAuthenticated, irrigationController.getIrrigationHistory);



router.get('/admin-reports&analytics', aController.isAuthenticated, aController.isAdmin, reportsController.reportsAnalytics);
router.get('/admin-user-management', aController.isAuthenticated, aController.isAdmin, userManagementController.userManagement);


router.get('/plant-overview', aController.isAuthenticated, userController.plantOverview);
router.get('/irrigation', aController.isAuthenticated, userController.irrigationControll);
router.get('/reports', aController.isAuthenticated, aController.isAdmin, reportsController.reportsAnalytics);
router.get('/admin-profile', aController.isAuthenticated, userProfileController.getUserProfile);




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

// Add new routes for user management actions
// Add routes for pending users (must come before /api/users/:userId)
router.get('/api/users/pending/count', aController.isAuthenticated, aController.isAdmin, userManagementController.getPendingUsersCount);
router.get('/api/users/pending', aController.isAuthenticated, aController.isAdmin, userManagementController.getPendingUsers);
router.get('/api/users/pending/test', aController.isAuthenticated, aController.isAdmin, userManagementController.testPendingUsers);
router.put('/api/users/:userId/approve', aController.isAuthenticated, aController.isAdmin, userManagementController.approveUser);
router.put('/api/users/:userId/reject', aController.isAuthenticated, aController.isAdmin, userManagementController.rejectUser);

// User management routes (must come after specific routes)
router.put('/api/users/:userId/role', aController.isAuthenticated, aController.isAdmin, userManagementController.updateUserRole);
router.put('/api/users/:userId/status', aController.isAuthenticated, aController.isAdmin, userManagementController.toggleUserStatus);
router.put('/api/users/:userId/update', aController.isAuthenticated, aController.isAdmin, userManagementController.updateUser);
router.delete('/api/users/:userId', aController.isAuthenticated, aController.isAdmin, userManagementController.deleteUser);
router.get('/api/users/:userId', aController.isAuthenticated, aController.isAdmin, userManagementController.getUserDetails);

// User profile API routes
router.put('/api/profile/update', aController.isAuthenticated, userProfileController.updateProfile);
router.put('/api/profile/change-password', aController.isAuthenticated, userProfileController.changePassword);
router.post('/api/profile/upload-picture', aController.isAuthenticated, userProfileController.uploadProfilePicture);













// const cropController = require('../controller/cropController');

// // Add these routes
// router.get('/crops/recommend', cropController.getRecommendations);
// router.get('/crops/train', cropController.trainModel);

// router.post('/crops', cropController.addCrop);

router.get('/admin-crop-recommendations', aController.isAuthenticated, aController.isAdmin, recommendationController.recommendationsPage);

router.post('/api/crops/register', aController.isAuthenticated, aController.isAdmin, recommendationController.registerCrop);

router.put('/api/crops/:cropId', aController.isAuthenticated, aController.isAdmin, recommendationController.updateCrop);
router.delete('/api/crops/:cropId', aController.isAuthenticated, aController.isAdmin, recommendationController.deleteCrop);

module.exports = router;