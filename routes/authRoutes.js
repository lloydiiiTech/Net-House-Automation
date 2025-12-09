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
const reportCropsController = require('../controller/reportCropsController');
const reportDailySensorsController = require('../controller/reportDailySensorsController');
const reportIrrigationController = require('../controller/reportIrrigationController');
const reportPlantedCropsController = require('../controller/reportPlantedCropsController');
const reportPredictionHistoryController = require('../controller/reportPredictionHistoryController');
const reportAIDiseaseController = require('../controller/reportAIDiseaseController');
const trainingController = require('../controller/trainingController');

router.get('/', aController.login);
router.get('/login', aController.login);
router.get('/register', aController.register);
router.get('/forgotpassword', aController.forgotpassword);


router.post('/login', aController.loginUser);
router.get("/dashboard", aController.isAuthenticated, adminController.Dashboard);

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
router.get('/plant-overview', aController.isAuthenticated, plantOverview.plantOverview);
router.get('/getRecommendedCrops', aController.isAuthenticated, plantOverview.getRecommendedCrops);
router.post('/confirmCropSelection', recommendationController.confirmCropSelection);
router.get('/checkActiveCrop', plantOverview.checkActiveCrop);  
router.post('/harvestCrop', aController.isAuthenticated, plantOverview.harvestCurrentCrop);
router.get('/realtime-sensor-data', aController.isAuthenticated, plantOverview.getRealtimeSensorData);
router.get('/api/weather', aController.isAuthenticated, plantOverview.getWeatherData);
router.get('/api/ai-fertilizer-advice', aController.isAuthenticated, plantOverview.getAIFertilizerAdvice);
router.get('/api/ai-disease-advice', aController.isAuthenticated, plantOverview.getAIDiseaseAdvice);



router.get('/irrigation-controll', aController.isAuthenticated, adminController.irrigationControll);
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



router.get('/reports&analytics', aController.isAuthenticated, reportsController.reportsAnalytics);
router.get('/user-management', aController.isAuthenticated, userManagementController.userManagement);


router.get('/plant-overview', aController.isAuthenticated, userController.plantOverview);
router.get('/irrigation', aController.isAuthenticated, userController.irrigationControll);
router.get('/reports', aController.isAuthenticated, reportsController.reportsAnalytics);
router.get('/profile', aController.isAuthenticated, userProfileController.getUserProfile);




router.get('/sensors/history', adminController.getCachedData);
router.get('/sensors_data', adminController.getSensorData);
router.get('/npk-data', adminController.getNPKData);
router.get('/npk-updates', adminController.npkUpdates);
router.get('/current-crop', aController.isAuthenticated, adminController.getCurrentCrop);
// router.get('/test-firestore-write', adminController.testFirestoreWrite);

// Reports & Analytics Routes
router.get('/api/sensor-data', aController.isAuthenticated, reportsController.getSensorData);
router.get('/api/download-data', aController.isAuthenticated, reportsController.downloadSensorData);
router.get('/api/crop-data', aController.isAuthenticated, reportsController.getCropData);
router.get('/api/planted-crops', aController.isAuthenticated, reportsController.getPlantedCrops);
router.get('/api/historical-sensor-data', aController.isAuthenticated, reportsController.getHistoricalSensorData);
router.get('/api/crop-performance', aController.isAuthenticated, reportsController.getCropPerformance);
router.get('/api/sensor-data/check', aController.isAuthenticated, reportsController.checkSensorData);

// Add new routes for user management actions
// Add routes for pending users (must come before /api/users/:userId)
router.get('/api/users/pending/count', aController.isAuthenticated, userManagementController.getPendingUsersCount);
router.get('/api/users/pending', aController.isAuthenticated, userManagementController.getPendingUsers);
router.get('/api/users/pending/test', aController.isAuthenticated, userManagementController.testPendingUsers);
router.put('/api/users/:userId/approve', aController.isAuthenticated, userManagementController.approveUser);
router.put('/api/users/:userId/reject', aController.isAuthenticated, userManagementController.rejectUser);

// User management routes (must come after specific routes)
router.put('/api/users/:userId/role', aController.isAuthenticated, userManagementController.updateUserRole);
router.put('/api/users/:userId/status', aController.isAuthenticated, userManagementController.toggleUserStatus);
router.put('/api/users/:userId/update', aController.isAuthenticated, userManagementController.updateUser);
router.delete('/api/users/:userId', aController.isAuthenticated, userManagementController.deleteUser);
router.get('/api/users/:userId', aController.isAuthenticated, userManagementController.getUserDetails);

// User profile API routes
router.put('/api/profile/update', aController.isAuthenticated, userProfileController.updateProfile);
router.put('/api/profile/change-password', aController.isAuthenticated, userProfileController.changePassword);
router.post('/api/profile/upload-picture', aController.isAuthenticated, userProfileController.uploadProfilePicture);













const cropController = require('../controller/cropController');

// Add these routes
router.get('/crops/recommend', cropController.getRecommendations);
router.get('/crops/train', cropController.trainModel);

router.post('/crops', cropController.addCrop);

router.get('/crop-recommendations', aController.isAuthenticated, recommendationController.recommendationsPage);

router.post('/api/crops/register', aController.isAuthenticated, recommendationController.registerCrop);

router.put('/api/crops/:cropId', aController.isAuthenticated, recommendationController.updateCrop);
router.delete('/api/crops/:cropId', aController.isAuthenticated, recommendationController.deleteCrop);
router.post('/api/crops/:cropId/register', aController.isAuthenticated, recommendationController.registerCropById);

router.get('/api/crops/:cropName/details', aController.isAuthenticated, recommendationController.getCropDetails);

router.put('/api/crops/:cropId/optimal-conditions', aController.isAuthenticated, recommendationController.updateCropOptimalConditions);

router.post('/cancelCrop', plantOverview.cancelCurrentCrop);
router.get('/cancellation-preview/:cropId', plantOverview.cancellationPreview);
router.get('/harvest-preview/:cropId', plantOverview.harvestPreview);

// Reports & Analytics - Individual Report Pages
router.get('/report-crops', aController.isAuthenticated, reportCropsController.cropsReport);
router.get('/report-daily-sensors', aController.isAuthenticated, reportDailySensorsController.dailySensorsReport);
router.get('/report-irrigation', aController.isAuthenticated, reportIrrigationController.irrigationReport);
router.get('/report-planted-crops', aController.isAuthenticated, reportPlantedCropsController.plantedCropsReport);
router.get('/report-prediction-history', aController.isAuthenticated, reportPredictionHistoryController.predictionHistoryReport);
router.get('/report-ai-disease', aController.isAuthenticated, reportAIDiseaseController.aiDiseaseFertilizerReport);

// Export endpoints for AI Disease & Fertilizer report
router.get('/report-ai-disease/export/excel', aController.isAuthenticated, reportAIDiseaseController.exportExcel);
router.get('/report-ai-disease/export/pdf', aController.isAuthenticated, reportAIDiseaseController.exportPdf);
router.get('/report-ai-disease/export/check', aController.isAuthenticated, reportAIDiseaseController.exportCheck);

// Crop edit and unregister routes for report-crops
router.get('/edit-crop/:cropName', reportCropsController.editCrop);
router.post('/unregister-crop', reportCropsController.unregisterCrop);
router.post('/edit-crop-name', reportCropsController.editCropName);
router.post('/get-crop-details', reportCropsController.getCropDetails);
router.post('/register-crop-with-ai', reportCropsController.registerCropWithAI);

router.get('/report-planted-crops/export/excel', aController.isAuthenticated, reportPlantedCropsController.exportExcel);
router.get('/report-planted-crops/export/pdf', aController.isAuthenticated, reportPlantedCropsController.exportPdf);

router.get('/forecasts', aController.isAuthenticated, trainingController.getForecastsPage);

module.exports = router;

