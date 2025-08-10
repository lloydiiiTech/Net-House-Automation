const CropPredictionService = require('../services/cropPredictionService');
const { firestore } = require('../config/firebase');

exports.recordOutcome = async (req, res) => {
  try {
    const { predictionId, cropId, actualPerformance } = req.body;
    
    if (!predictionId || !cropId || actualPerformance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'predictionId, cropId and actualPerformance are required'
      });
    }
    
    const outcomeId = await CropPredictionService.recordCropOutcome(
      cropId, 
      predictionId, 
      parseFloat(actualPerformance)
    );
    
    res.json({
      success: true,
      outcomeId,
      message: 'Crop outcome recorded successfully'
    });
  } catch (error) {
    console.error('Record outcome error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to record crop outcome'
    });
  }
};

exports.getTrainingStatus = async (req, res) => {
  try {
    // Get count of prediction outcomes
    const outcomesSnapshot = await firestore.collection('prediction_history')
      .where('hasActualOutcome', '==', true)
      .count()
      .get();
    
    const trainingSamples = outcomesSnapshot.data().count;

    // Get count of all predictions
    const predictionsSnapshot = await firestore.collection('prediction_history')
      .count()
      .get();
    
    const totalPredictions = predictionsSnapshot.data().count;

    res.json({
      success: true,
      trainingSamples,
      totalPredictions,
      readyForTraining: trainingSamples >= 50,
      recommendation: trainingSamples >= 100 ? 
        "Ready for full training" : 
        `Collect ${100 - trainingSamples} more samples (${Math.round((trainingSamples/100)*100)}% complete)`
    });
  } catch (error) {
    console.error('Training status error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to get training status'
    });
  }
};

exports.trainModel = async (req, res) => {
  try {
    const result = await CropPredictionService.trainModel();
    
    res.json({ 
      success: true,
      message: 'Model trained successfully',
      samples: result.samples,
      registeredSamples: result.registeredSamples,
      unregisteredSamples: result.unregisteredSamples,
      finalLoss: result.finalLoss.toFixed(4),
      finalValLoss: result.finalValLoss.toFixed(4),
      finalValMae: result.finalValMae.toFixed(4),
      trainingChart: result.trainingChart,
      trainingTime: result.trainingTime,
      validationMetrics: {
        mae: (result.valMAE * 100).toFixed(2) + '%',
        rmse: (result.valRMSE * 100).toFixed(2) + '%',
        accuracy: result.valAccuracy.toFixed(1) + '%',
        epochs: result.epochs
      }
    });
  } catch (error) {
    console.error('Training error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to train model'
    });
  }
};

exports.validateModel = async (req, res) => {
  try {
    const validation = await CropPredictionService.validateModel();
    
    res.json({
      success: true,
      accuracy: validation.accuracy.toFixed(1) + '%',
      meanAbsoluteError: validation.meanAbsoluteError.toFixed(2),
      validationThreshold: validation.validationThreshold,
      samples: validation.samples,
      results: validation.results
    });
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to validate model'
    });
  }
};

exports.getTrainingChart = async (req, res) => {
  try {
    const filePath = path.join(__dirname, '../public/training_chart.html');
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({
        success: false,
        message: 'Training chart not found'
      });
    }
  } catch (error) {
    console.error('Get chart error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to get training chart'
    });
  }
};


