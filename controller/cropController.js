const { firestore } = require('../config/firebase');
const admin = require('firebase-admin');

// controllers/cropController.js
const CropPredictionService = require('../services/cropPredictionService');

exports.getMonthlyPrediction = async (req, res) => {
  try {
    const results = await CropPredictionService.predictMonthly();
    res.json({ success: true, data: results });
  } catch (err) {
    console.error('Monthly prediction failed:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
};
exports.getRecommendations = async (req, res) => {
  try {
    // Get recommendations (service will handle getting latest sensor data)
    const recommendations = await CropPredictionService.predict();
    res.json({ 
      success: true, 
      data: recommendations,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to generate recommendations'
    });
  }
};



exports.addCrop = async (req, res) => {
  try {
    const cropData = req.body;
    
    // Add to Firestore with server timestamp
    const docRef = await firestore.collection('crop_dataset').add({
      ...cropData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Train model with updated data
    await CropPredictionService.trainModel();
    
    res.json({ 
      success: true,
      cropId: docRef.id,
      message: 'Crop added successfully'
    });
  } catch (error) {
    console.error('Add crop error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      message: 'Failed to add crop'
    });
  }
};

exports.trainModel = async (req, res) => {
  try {
    await CropPredictionService.trainModel();
    res.json({ 
      success: true,
      message: 'Model trained successfully'
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


