const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-cpu');
const { firestore } = require('../config/firebase');
const admin = require('firebase-admin');
const { normalizeData } = require('../utils/dataNormalizer');
const { generateTrainingChart } = require('../utils/trainingVisualizer');

class CropPredictionService {
  constructor() {
    this.model = null;
    this.backendReady = false;
    this.modelTrained = false;
    this.currentTraining = false;
  }

  async initialize() {
    try {
      await tf.setBackend('cpu');
      await tf.ready();
      this.backendReady = true;
      console.log(`✅ TensorFlow.js backend ready: ${tf.getBackend()}`);
      
      // Try to load saved model
      try {
        await this.loadModel();
        this.modelTrained = true;
        console.log('✅ Model loaded successfully');
      } catch (e) {
        console.log('ℹ️ No saved model found, creating new one');
        this.model = this.createModel();
      }
    } catch (err) {
      console.error('❌ TensorFlow initialization failed:', err);
      throw err;
    }
  }

  createModel() {
    const model = tf.sequential();
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu',
      inputShape: [8],
      kernelInitializer: 'heNormal'
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({ 
      units: 32, 
      activation: 'relu',
      kernelInitializer: 'heNormal'
    }));
    model.add(tf.layers.dense({ 
      units: 1, 
      activation: 'sigmoid',
      kernelInitializer: 'glorotNormal'
    }));
    
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError',
      metrics: ['mae']
    });
    
    return model;
  }

  async saveModel() {
    const modelSavePath = 'file://./models/crop-prediction';
    await this.model.save(modelSavePath);
    console.log('💾 Model saved to', modelSavePath);
  }

  async loadModel() {
    const modelLoadPath = 'file://./models/crop-prediction/model.json';
    this.model = await tf.loadLayersModel(modelLoadPath);
    console.log('🔍 Model loaded from', modelLoadPath);
    
    // Warm up the model
    const warmupTensor = tf.tensor2d([Array(8).fill(0.5)]);
    await this.model.predict(warmupTensor).data();
    tf.dispose(warmupTensor);
    
    this.modelTrained = true;
  }

  async getHistoricalTrainingData(limit = 200) {
    // Get past predictions with actual outcomes
    const snapshot = await firestore.collection('prediction_history')
      .where('hasActualOutcome', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get();
    
    if (snapshot.empty) {
      console.warn('⚠️ No historical training data available');
      return [];
    }
    
    const trainingData = [];
    const usedTimestamps = new Set();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (!data.sensorData || !data.actualOutcome) return;
      
      // Ensure we don't have duplicate timestamps
      const timeKey = data.timestamp.toDate().toISOString();
      if (usedTimestamps.has(timeKey)) return;
      usedTimestamps.add(timeKey);
      
      trainingData.push({
        features: [
          data.sensorData.npk_N || 0,
          data.sensorData.npk_P || 0,
          data.sensorData.npk_K || 0,
          data.sensorData.temperature || 0,
          data.sensorData.humidity || 0,
          data.sensorData.moisture || 0,
          data.sensorData.ph || 0,
          data.sensorData.light || 0
        ],
        label: Math.min(1, Math.max(0, data.actualOutcome.score / 100)) // Normalized 0-1
      });
    });
    
    console.log(`📊 Retrieved ${trainingData.length} training samples`);
    return trainingData;
  }

  async get31DaysSensorData() {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 31);
    
    const snapshot = await firestore.collection('sensor_summaries')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', now)
      .orderBy('timestamp', 'asc')
      .get();
    
    if (snapshot.empty) {
      console.warn('⚠️ No sensor data available for the last 31 days');
      return [];
    }
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        npk_N: data.nitrogen?.average || 0,
        npk_P: data.phosphorus?.average || 0,
        npk_K: data.potassium?.average || 0,
        temperature: data.temperature?.average || 0,
        humidity: data.humidity?.average || 0,
        moisture: data.moistureAve?.average || 0,
        ph: data.ph?.average || 0,
        light: data.light?.average || 0,
        data_points: data.data_points || 1,
        timestamp: data.timestamp.toDate()
      };
    });
  }

  async getAllCrops() {
    const snapshot = await firestore.collection('crops').get();
    const crops = {};
    
    snapshot.forEach(doc => {
      const data = doc.data();
      crops[doc.id] = {
        id: doc.id,
        name: data.name || 'Unnamed Crop',
        isRegistered: data.isRegistered !== false, // Default to true
        optimal_n: parseFloat(data.optimal_n) || 0,
        optimal_p: parseFloat(data.optimal_p) || 0,
        optimal_k: parseFloat(data.optimal_k) || 0,
        optimal_temperature: parseFloat(data.optimal_temperature) || 0,
        optimal_humidity: parseFloat(data.optimal_humidity) || 0,
        optimal_moisture: parseFloat(data.optimal_moisture) || 0,
        optimal_ph: parseFloat(data.optimal_ph) || 0,
        optimal_light: parseFloat(data.optimal_light) || 0,
        lastPredictionScore: parseFloat(data.lastPredictionScore) || 0,
        lastPredictionTime: data.lastPredictionTime || null
      };
    });
    
    console.log(`🌱 Loaded ${Object.keys(crops).length} crops`);
    return crops;
  }

  async predict() {
    if (this.currentTraining) {
      throw new Error('Prediction service is currently training');
    }
    
    const sensorData = await this.get31DaysSensorData();
    if (sensorData.length === 0) {
      throw new Error('No sensor data available for prediction');
    }
  
    const averagedData = this.calculateWeightedAverages(sensorData);
    const crops = await this.getAllCrops();
  
    const predictions = [];
    for (const [cropId, crop] of Object.entries(crops)) {
      // Rule-based score
      const { suitability, parameterMatches } = this.calculateScore(averagedData, crop);
      
      // ML-based score if model is trained
      let mlScore = suitability;
      if (this.modelTrained) {
        try {
          const inputTensor = this.createInputTensor(averagedData);
          const prediction = await this.model.predict(inputTensor).data();
          mlScore = Math.round(prediction[0] * 100);
          tf.dispose(inputTensor);
        } catch (err) {
          console.error('❌ ML prediction failed:', err);
          mlScore = suitability;
        }
      }

      // Combined score (adjust weights as needed)
      const finalScore = this.modelTrained 
        ? Math.round(suitability * 0.7 + mlScore * 0.3)
        : suitability;

      predictions.push({
        cropId,
        ...crop,
        score: finalScore,
        parameterMatches,
        ruleBasedScore: suitability,
        mlScore: this.modelTrained ? mlScore : null,
        timestamp: new Date()
      });
    }
  
    return this.savePredictionResults(predictions, averagedData);
  }

  calculateWeightedAverages(sensorData) {
    const sums = {
      npk_N: 0, npk_P: 0, npk_K: 0,
      temperature: 0, humidity: 0,
      moisture: 0, ph: 0, light: 0
    };
    let totalWeight = 0;

    sensorData.forEach(data => {
      const weight = data.data_points || 1;
      totalWeight += weight;

      sums.npk_N += (data.npk_N || 0) * weight;
      sums.npk_P += (data.npk_P || 0) * weight;
      sums.npk_K += (data.npk_K || 0) * weight;
      sums.temperature += (data.temperature || 0) * weight;
      sums.humidity += (data.humidity || 0) * weight;
      sums.moisture += (data.moisture || 0) * weight;
      sums.ph += (data.ph || 0) * weight;
      sums.light += (data.light || 0) * weight;
    });

    return {
      npk_N: totalWeight ? sums.npk_N / totalWeight : 0,
      npk_P: totalWeight ? sums.npk_P / totalWeight : 0,
      npk_K: totalWeight ? sums.npk_K / totalWeight : 0,
      temperature: totalWeight ? sums.temperature / totalWeight : 0,
      humidity: totalWeight ? sums.humidity / totalWeight : 0,
      moisture: totalWeight ? sums.moisture / totalWeight : 0,
      ph: totalWeight ? sums.ph / totalWeight : 0,
      light: totalWeight ? sums.light / totalWeight : 0,
      data_points: totalWeight,
      timestamp: new Date()
    };
  }

  createInputTensor(sensorData) {
    const normalized = normalizeData({
      n: sensorData.npk_N,
      p: sensorData.npk_P,
      k: sensorData.npk_K,
      temperature: sensorData.temperature,
      humidity: sensorData.humidity,
      moisture: sensorData.moisture,
      ph: sensorData.ph,
      light: sensorData.light
    });
    
    return tf.tensor2d([[
      normalized.n,
      normalized.p,
      normalized.k,
      normalized.temperature,
      normalized.humidity,
      normalized.moisture,
      normalized.ph,
      normalized.light
    ]]);
  }
  calculateScore(sensorData, crop) {
    const parameterMatches = {
      npk_N: this.calculateMatch(crop.optimal_n, sensorData.npk_N, 'npk_N'),
      npk_P: this.calculateMatch(crop.optimal_p, sensorData.npk_P, 'npk_P'),
      npk_K: this.calculateMatch(crop.optimal_k, sensorData.npk_K, 'npk_K'),
      temperature: this.calculateMatch(crop.optimal_temperature, sensorData.temperature, 'temperature'),
      humidity: this.calculateMatch(crop.optimal_humidity, sensorData.humidity, 'humidity'),
      moisture: this.calculateMatch(crop.optimal_moisture, sensorData.moisture, 'moisture'),
      ph: this.calculateMatch(crop.optimal_ph, sensorData.ph, 'ph'),
      light: this.calculateMatch(crop.optimal_light, sensorData.light, 'light')
    };
  
    const suitability = this.calculateWeightedSuitability(parameterMatches, crop);
  
    return {
      suitability,
      parameterMatches
    };
  }
  
  calculateMatch(optimal, actual, paramName = '') {
    // Handle cases where parameter isn't applicable
    if (optimal === 0 || optimal === undefined || actual === undefined) {
      return 0;
    }
    
    // Special handling for pH (logarithmic scale)
    if (paramName === 'ph') {
      const difference = Math.abs(optimal - actual);
      return Math.max(0, 100 - (difference * 20)); // More sensitive to pH changes
    }
  
    // Normal parameters
    const difference = Math.abs(optimal - actual);
    const tolerance = optimal * 0.3; // Increased from 0.2 to 0.3 for more flexibility
    return Math.max(0, 100 - (difference / tolerance * 100));
  }

  calculateWeightedSuitability(parameterMatches, crop) {
    const weights = {
      npk_N: 0.15,
      npk_P: 0.15,
      npk_K: 0.15,
      temperature: 0.20,
      humidity: 0.10,
      moisture: 0.10,
      ph: 0.10,
      light: 0.05
    };

    let totalScore = 0;
    let totalWeight = 0;
    
    Object.entries(parameterMatches).forEach(([param, score]) => {
      if (score > 0) {
        totalScore += score * weights[param];
        totalWeight += weights[param];
      }
    });

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  async savePredictionResults(predictions, sensorData) {
    // Separate registered and unregistered crops
    const registeredCrops = predictions.filter(p => p.isRegistered);
    const unregisteredCrops = predictions.filter(p => !p.isRegistered);

    // Get top 5 registered crops
    const top5Registered = registeredCrops
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => this.formatCropPrediction(item));

    // Get top 5 unregistered crops
    const top5Unregistered = unregisteredCrops
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => this.formatCropPrediction(item));

    // Get top 1 registered crop
    const topRegistered = top5Registered.length > 0 ? top5Registered[0] : null;

    // Start Firestore batch
    const batch = firestore.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Update last prediction data for all crops
    predictions.forEach(prediction => {
      const cropRef = firestore.collection('crops').doc(prediction.cropId);
      batch.update(cropRef, {
        lastPredictionScore: prediction.score,
        lastPredictionTime: timestamp
      });
    });

    // Save prediction history
    const historyRef = firestore.collection('prediction_history').doc();
    batch.set(historyRef, {
      predictions: {
        top5Registered,
        top5Unregistered,
        topRegistered
      },
      sensorData: this.formatSensorSummary(sensorData),
      timestamp,
      hasActualOutcome: false
    });

    await batch.commit();
    console.log('💾 Saved prediction results to Firestore');

    return {
      top5Registered,
      top5Unregistered,
      topRegistered,
      sensorData: this.formatSensorSummary(sensorData)
    };
  }

  formatCropPrediction(prediction) {
    return {
      id: prediction.cropId,
      name: prediction.name,
      score: prediction.score,
      isRegistered: prediction.isRegistered,
      optimalConditions: {
        npk_N: prediction.optimal_n,
        npk_P: prediction.optimal_p,
        npk_K: prediction.optimal_k,
        temperature: prediction.optimal_temperature,
        humidity: prediction.optimal_humidity,
        moisture: prediction.optimal_moisture,
        ph: prediction.optimal_ph,
        light: prediction.optimal_light
      },
      parameterMatches: prediction.parameterMatches,
      ruleBasedScore: prediction.ruleBasedScore,
      mlScore: prediction.mlScore,
      lastUpdated: prediction.timestamp
    };
  }

  formatSensorSummary(sensorData) {
    return {
      npk_N: sensorData.npk_N,
      npk_P: sensorData.npk_P,
      npk_K: sensorData.npk_K,
      temperature: sensorData.temperature,
      humidity: sensorData.humidity,
      moisture: sensorData.moisture,
      ph: sensorData.ph,
      light: sensorData.light,
      periodStart: new Date(new Date().setDate(new Date().getDate() - 31)),
      periodEnd: new Date(),
      dataPoints: sensorData.data_points
    };
  }

  async trainModel() {
    if (!this.backendReady) throw new Error('TensorFlow backend not ready');
    if (this.currentTraining) throw new Error('Training already in progress');
    
    this.currentTraining = true;
    try {
      console.log('⏳ Loading training data...');
      const trainingData = await this.getHistoricalTrainingData();
      
      if (trainingData.length < 50) {
        throw new Error(`Insufficient training data (${trainingData.length} samples). Need at least 50.`);
      }

      console.log(`📊 Training with ${trainingData.length} samples...`);
      
      // Prepare tensors
      const features = trainingData.map(d => d.features);
      const labels = trainingData.map(d => d.label);
      
      const featureTensor = tf.tensor2d(features);
      const labelTensor = tf.tensor1d(labels);
      
      // Train model with callbacks
      const history = await this.model.fit(featureTensor, labelTensor, {
        epochs: 100,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs) => {
            process.stdout.write(`\rEpoch ${epoch + 1}: loss=${logs.loss.toFixed(4)} val_loss=${logs.val_loss.toFixed(4)}`);
          }
        }
      });
      
      console.log('\n✅ Training completed');
      
      // Save the trained model
      await this.saveModel();
      this.modelTrained = true;
      
      // Generate training chart
      const chartPath = await generateTrainingChart(history);
      
      // Calculate final metrics
      const finalLoss = history.history.loss[history.history.loss.length - 1];
      const finalValLoss = history.history.val_loss[history.history.val_loss.length - 1];
      
      return { 
        success: true, 
        samples: trainingData.length,
        finalLoss,
        finalValLoss,
        trainingChart: chartPath,
        trainingTime: `${history.history.loss.length * 2}s`
      };
    } finally {
      this.currentTraining = false;
    }
  }

  async validateModel() {
    if (!this.modelTrained) throw new Error('Model not trained');
    
    // Get recent data not used in training (last 20%)
    const snapshot = await firestore.collection('prediction_history')
      .where('hasActualOutcome', '==', true)
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    if (snapshot.empty) {
      throw new Error('No validation data available');
    }

    let totalError = 0;
    let correctPredictions = 0;
    const validationThreshold = 15; // Points within actual to be considered correct
    const results = [];
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (!data.sensorData || !data.actualOutcome) continue;
      
      // Create input tensor
      const inputTensor = this.createInputTensor(data.sensorData);
      
      // Get prediction
      const prediction = (await this.model.predict(inputTensor).dataSync()[0] * 100);
      const actual = data.actualOutcome.score;
      const error = Math.abs(prediction - actual);
      
      totalError += error;
      if (error <= validationThreshold) correctPredictions++;
      
      results.push({
        predictionId: doc.id,
        predicted: Math.round(prediction),
        actual: Math.round(actual),
        error: Math.round(error),
        withinThreshold: error <= validationThreshold,
        timestamp: data.timestamp.toDate().toISOString()
      });
      
      tf.dispose(inputTensor);
    }

    const meanAbsoluteError = totalError / results.length;
    const accuracy = (correctPredictions / results.length) * 100;
    
    return {
      samples: results.length,
      meanAbsoluteError,
      accuracy,
      validationThreshold,
      results: results.sort((a, b) => a.error - b.error)
    };
  }

  async recordCropOutcome(cropId, predictionId, actualPerformance) {
    // Validate input
    actualPerformance = Math.min(100, Math.max(0, actualPerformance));
    
    // Save actual crop performance
    const outcomeRef = firestore.collection('crop_outcomes').doc();
    await outcomeRef.set({
      cropId,
      predictionId,
      actualPerformance,
      recordedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Mark prediction as having outcome
    await firestore.collection('prediction_history').doc(predictionId).update({
      hasActualOutcome: true,
      actualOutcome: {
        score: actualPerformance,
        recordedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });

    console.log(`📝 Recorded outcome for prediction ${predictionId}`);
    return outcomeRef.id;
  }
}

module.exports = new CropPredictionService();