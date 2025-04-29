const express = require('express');
const router = express.Router();
const trainingController = require('../controller/trainingController');

// Training data collection
router.post('/outcomes', trainingController.recordOutcome);

// Training management
router.get('/training/status', trainingController.getTrainingStatus);
router.post('/training/train', trainingController.trainModel);
router.get('/training/validate', trainingController.validateModel);
router.get('/training/chart', trainingController.getTrainingChart);

module.exports = router;