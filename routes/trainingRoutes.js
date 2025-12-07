const express = require('express');
const router = express.Router();
const trainingController = require('../controller/trainingController');

// Training data collection
router.post('/outcomes', trainingController.recordOutcome);

// Training management
router.get('/training/status', trainingController.getTrainingStatus);
router.get('/training/train', trainingController.trainModel);
router.get('/training/validate', trainingController.validateModel);
router.get('/training/chart', trainingController.getTrainingChart);
router.get('/training/evaluate', trainingController.evaluateModel);
router.get('/training/trials', trainingController.getTrainingTrials);
router.get('/training/best-trial', trainingController.getBestTrial);
router.get('/forecast/chart', trainingController.getForecastChart);

module.exports = router;
