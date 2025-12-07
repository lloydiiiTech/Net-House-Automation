const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-cpu');
const { firestore } = require('../config/firebase');
const admin = require('firebase-admin');
const { normalizeData } = require('../utils/dataNormalizer');
const { generateTrainingChart } = require('../utils/trainingVisualizer');
const path = require('path');  // Added: Missing import
const fs = require('fs');  // Added: Missing import

function extractSeasonalityFeatures(startDate, endDate) {
  let month = 0, duration = 0, season = 0;
  if (startDate instanceof Date && !isNaN(startDate)) {
    month = startDate.getMonth() / 11; // Normalize to 0-1
    season = Math.floor(startDate.getMonth() / 3) / 3; // 0-3 seasons normalized to 0-1
    if (endDate instanceof Date && !isNaN(endDate)) {
      duration = Math.max(0, Math.min(1, (endDate - startDate) / (1000 * 60 * 60 * 24 * 120))); // Normalize to 0-1 for up to 120 days
    }
  }
  return { month, duration, season };
}

class CropPredictionService {
  constructor() {
    this.model = null;
    this.backendReady = false;
    this.modelTrained = false;
    this.currentTraining = false;
    this.modelVersion = '3.0'; // Updated for enhanced features and architecture
    this.lastTrainingTime = null;
    this.pendingRetrainTimeout = null;
    this.newOutcomesSinceLastTrain = 0;
    this.sequenceLength = 7; // New: Length of time-series sequences (e.g., 7 days)
    this.forecastHorizon = 7; // New: Forecast next 7 days
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

  createModel(inputShape = [this.sequenceLength, 8]) { // Updated: Input shape for sequences (time steps x features)
    const model = tf.sequential();
    
    // New: LSTM layers for time-series processing
    model.add(tf.layers.lstm({
      units: 128,
      inputShape: inputShape, // [sequenceLength, numFeatures]
      returnSequences: true, // Return sequences for stacking
      kernelInitializer: 'heNormal',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.3 }));
    
    model.add(tf.layers.lstm({
      units: 64,
      returnSequences: false, // Flatten for dense layers
      kernelInitializer: 'heNormal',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
    }));
    model.add(tf.layers.batchNormalization());
    model.add(tf.layers.dropout({ rate: 0.25 }));
    
    // Dense layers for final prediction
    model.add(tf.layers.dense({ 
      units: 32, 
      activation: 'relu',
      kernelInitializer: 'heNormal',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
    }));
    model.add(tf.layers.dropout({ rate: 0.2 }));
    
    model.add(tf.layers.dense({ 
      units: this.forecastHorizon * 8, // Forecast next horizon days for 8 sensor features
      activation: 'linear' // Linear for regression forecasting
    }));
    
    model.compile({
      optimizer: tf.train.adam(0.0003),
      loss: 'meanSquaredError',
      metrics: ['mae', 'mse']
    });
    
    return model;
  }

  async saveModel() {
    try {
      const modelsDir = path.join(__dirname, '../models');
      if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true });
      }
      
      const modelPath = path.join(modelsDir, 'saved_model');
      await this.model.save(`file://${modelPath}`);  // Fixed: Add file:// prefix
      
      const metadata = {
        version: this.modelVersion,
        trainedAt: new Date().toISOString(),
        inputShape: this.model.inputs[0].shape[1],
        architecture: 'enhanced-dense-128-64-32-1',
        status: 'saved-to-file',
        path: modelPath
      };
      
      const metadataPath = path.join(modelsDir, 'model-metadata.json');
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log('💾 Model saved to file successfully');
      
    } catch (error) {
      console.error('❌ Model save failed:', error.message);
      // Fallback to in-memory
    }
  }

  async loadModel() {
    try {
      const modelsDir = path.join(__dirname, '../models');
      const modelPath = path.join(modelsDir, 'saved_model');
      if (fs.existsSync(modelPath)) {
        this.model = await tf.loadLayersModel(`file://${modelPath}/model.json`);  // Fixed: Add file:// prefix
        console.log('✅ Model loaded from file');
        this.modelTrained = true;
      } else {
        console.log('ℹ️ No saved model found, creating new one');
        this.model = this.createModel();
        this.modelTrained = false;
      }
    } catch (error) {
      console.error('❌ Model load failed:', error.message);
      this.model = this.createModel();
      this.modelTrained = false;
    }
  }

  async getPlantedCropsTrainingData(limit = 500) { // Updated: Fetch sequences of sensor data for time-series
    try {
      const snapshot = await firestore.collection('planted_crops')
        .where('status', '==', 'harvested')
        .orderBy('endDate', 'desc')
        .limit(limit)
        .get();
  
      if (snapshot.empty) {
        console.warn('⚠️ No harvested crops available for training');
        return [];
      }

      const trainingData = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        
        if (
          typeof data.harvestSuccessRate !== 'number' ||
          data.harvestSuccessRate < 5 || data.harvestSuccessRate > 100 ||
          !data.finalSensorSummary ||
          !data.endDate
        ) continue;
        
        // New: Fetch historical sensor sequences for the crop's duration
        const sensorSequences = await this.getSensorSequencesForCrop(data.startDate.toDate(), data.endDate.toDate());
        if (sensorSequences.length < this.sequenceLength) continue; // Skip if insufficient data
        
        // Normalize sequences and convert to arrays of numbers
        const normalizedSequences = sensorSequences.slice(-this.sequenceLength).map(day => {
          const norm = normalizeData({
            nitrogen: day.nitrogen,
            phosphorus: day.phosphorus,
            potassium: day.potassium,
            temperature: day.temperature,
            humidity: day.humidity,
            moisture: day.moisture,
            ph: day.ph,
            light: day.light
          });
          // Convert object to array: [n, p, k, temperature, humidity, moisture, ph, light]
          return [norm.n ?? 0, norm.p ?? 0, norm.k ?? 0, norm.temperature ?? 0, norm.humidity ?? 0, norm.moisture ?? 0, norm.ph ?? 0, norm.light ?? 0];
        });
        
        // Prepare target: Forecasted sensor values (next horizon days)
        const targetSequences = await this.getFutureSensorSequences(data.endDate.toDate(), this.forecastHorizon);
        const normalizedTargets = targetSequences.map(day => {
          const norm = normalizeData({
            nitrogen: day.nitrogen,
            phosphorus: day.phosphorus,
            potassium: day.potassium,
            temperature: day.temperature,
            humidity: day.humidity,
            moisture: day.moisture,
            ph: day.ph,
            light: day.light
          });
          // Convert to array and flatten
          return [norm.n ?? 0, norm.p ?? 0, norm.k ?? 0, norm.temperature ?? 0, norm.humidity ?? 0, norm.moisture ?? 0, norm.ph ?? 0, norm.light ?? 0];
        }).flat(); // Flatten for output
        
        trainingData.push({
          features: normalizedSequences, // Now number[][] (sequence of feature arrays)
          label: normalizedTargets, // Flattened number[]
          cropId: data.cropId || doc.id,
          docId: doc.id,
          isRegistered: true // Add this (all are registered)
        });
      }
  
      console.log(`📊 Retrieved ${trainingData.length} training samples with sequences`);
      return trainingData;
    } catch (err) {
      // Handle missing index error
      if (err.code === 9 && err.details?.includes('The query requires an index')) {
        console.error('❌ Firestore query failed: Composite index required.');
        console.error('👉 Visit this link to create it:');
        const match = err.details.match(/https:\/\/console\.firebase\.google\.com\/[^\s"]+/);
        if (match) {
          console.error(match[0]); // Log the URL to create the index
        }
      } else {
        console.error('🔥 Unexpected error while fetching training data:', err);
      }
      return [];
    }
  }

  // New: Helper to fetch sensor sequences for a crop's period
  async getSensorSequencesForCrop(startDate, endDate) {
    const snapshot = await firestore.collection('daily_sensor_summaries')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', endDate)
      .orderBy('timestamp', 'asc')
      .get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        nitrogen: data.nitrogen?.average || 0,
        phosphorus: data.phosphorus?.average || 0,
        potassium: data.potassium?.average || 0,
        temperature: data.temperature?.average || 0,
        humidity: data.humidity?.average || 0,
        moisture: data.moistureAve?.average || 0,
        ph: data.ph?.average || 0,
        light: data.light?.average || 0,
        timestamp: data.timestamp.toDate()
      };
    });
  }

  // New: Helper to get future sequences (use historical averages or predictions as proxy)
  async getFutureSensorSequences(fromDate, horizon) {
    // For simplicity, use recent averages; in production, use a separate forecasting model
    const recentData = await this.get31DaysSensorData();
    const avgData = this.calculateWeightedAverages(recentData);
    return Array.from({ length: horizon }, () => avgData); // Repeat averages for horizon
  }

  async get31DaysSensorData() {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 31);
    
    const snapshot = await firestore.collection('daily_sensor_summaries')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', now)
      .orderBy('timestamp', 'desc')
      .limit(31)
      .get();
    
    if (snapshot.empty) {
      console.warn('⚠️ No sensor data available for the last 31 days');
      return [];
    }
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        nitrogen: data.nitrogen?.average || 0,
        phosphorus: data.phosphorus?.average || 0,
        potassium: data.potassium?.average || 0,
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
        optimal_humidity: parseFloat(data.optimal_humidity) || 0,  // Fixed: optimal_humidity instead of optimal_hidity
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
    // Updated: Forecast future sensor values and use them for crop prediction
    if (this.currentTraining) {
      throw new Error('Prediction service is currently training');
    }
    
    const sensorSequences = await this.getRecentSensorSequences(); // New: Get recent sequences
    if (sensorSequences.length < this.sequenceLength) {
      throw new Error('Insufficient sensor data for forecasting');
    }
    
    const normalizedSequences = sensorSequences.map(day => normalizeData({
      nitrogen: day.nitrogen,
      phosphorus: day.phosphorus,
      potassium: day.potassium,
      temperature: day.temperature,
      humidity: day.humidity,
      moisture: day.moisture,
      ph: day.ph,
      light: day.light
    }));
    
    const crops = await this.getAllCrops();
    
    // Forecast future sensor values
    let forecastedSensors = [];
    let forecastDetails = {};
    if (this.modelTrained) {
      const inputTensor = tf.tensor3d([normalizedSequences.slice(-this.sequenceLength)], [1, this.sequenceLength, 8]);
      const forecast = await this.model.predict(inputTensor).dataSync();
      forecastedSensors = this.reshapeForecast(forecast); // Reshape to [horizon, features]
      tf.dispose(inputTensor);
      
      // Prepare forecast details for visualization
      const featureNames = ['nitrogen', 'phosphorus', 'potassium', 'temperature', 'humidity', 'moisture', 'ph', 'light'];
      featureNames.forEach((name, i) => {
        forecastDetails[name] = forecastedSensors.map(day => day[name]);
      });
    } else {
      // Fallback: Use averages
      const avgData = this.calculateWeightedAverages(sensorSequences);
      forecastedSensors = Array.from({ length: this.forecastHorizon }, () => avgData);
    }
    
    // Use forecasted data for crop scoring
    const predictions = [];
    for (const [cropId, crop] of Object.entries(crops)) {
      const avgForecast = this.calculateWeightedAverages(forecastedSensors); // Average forecasted values
      const { suitability } = this.calculateScore(avgForecast, crop);
      
      // ...existing code... (adapt scoring logic)
      
      predictions.push({
        cropId,
        ...crop,
        score: suitability, // Use forecasted suitability
        forecastedSensors: avgForecast,
        timestamp: new Date()
      });
    }
    
    return this.savePredictionResults(predictions, forecastedSensors, forecastDetails);
  }

  // New: Get recent sensor sequences
  async getRecentSensorSequences() {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - this.sequenceLength);
    
    const snapshot = await firestore.collection('daily_sensor_summaries')
      .where('timestamp', '>=', startDate)
      .where('timestamp', '<=', now)
      .orderBy('timestamp', 'asc')
      .get();
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        nitrogen: data.nitrogen?.average || 0,
        phosphorus: data.phosphorus?.average || 0,
        potassium: data.potassium?.average || 0,
        temperature: data.temperature?.average || 0,
        humidity: data.humidity?.average || 0,
        moisture: data.moistureAve?.average || 0,
        ph: data.ph?.average || 0,
        light: data.light?.average || 0,
        timestamp: data.timestamp.toDate()
      };
    });
  }

  // New: Reshape forecast output
  reshapeForecast(flatForecast) {
    const features = 8;
    const reshaped = [];
    for (let i = 0; i < this.forecastHorizon; i++) {
      reshaped.push({
        nitrogen: flatForecast[i * features],
        phosphorus: flatForecast[i * features + 1],
        potassium: flatForecast[i * features + 2],
        temperature: flatForecast[i * features + 3],
        humidity: flatForecast[i * features + 4],
        moisture: flatForecast[i * features + 5],
        ph: flatForecast[i * features + 6],
        light: flatForecast[i * features + 7]
      });
    }
    return reshaped;
  }

  calculateWeightedAverages(sensorData) {
    const sums = {
      nitrogen: 0, phosphorus: 0, potassium: 0,
      temperature: 0, humidity: 0,
      moisture: 0, ph: 0, light: 0
    };
    let totalWeight = 0;

    sensorData.forEach(data => {
      const weight = data.data_points || 1;
      totalWeight += weight;

      sums.nitrogen += (data.nitrogen || 0) * weight;
      sums.phosphorus += (data.phosphorus || 0) * weight;
      sums.potassium += (data.potassium || 0) * weight;
      sums.temperature += (data.temperature || 0) * weight;
      sums.humidity += (data.humidity || 0) * weight;
      sums.moisture += (data.moisture || 0) * weight;
      sums.ph += (data.ph || 0) * weight;
      sums.light += (data.light || 0) * weight;
    });

    return {
      nitrogen: totalWeight ? sums.nitrogen / totalWeight : 0,
      phosphorus: totalWeight ? sums.phosphorus / totalWeight : 0,
      potassium: totalWeight ? sums.potassium / totalWeight : 0,
      temperature: totalWeight ? sums.temperature / totalWeight : 0,
      humidity: totalWeight ? sums.humidity / totalWeight : 0,
      moisture: totalWeight ? sums.moisture / totalWeight : 0,
      ph: totalWeight ? sums.ph / totalWeight : 0,
      light: totalWeight ? sums.light / totalWeight : 0,
      data_points: totalWeight,
      timestamp: new Date()
    };
  }
  createInputTensor(sensorData, cropOptimal, isRegistered = true, startDate = null, endDate = null) {
    // Normalize sensor data
    const normalizedSensor = normalizeData({
      nitrogen: sensorData.nitrogen,
      phosphorus: sensorData.phosphorus,
      potassium: sensorData.potassium,
      temperature: sensorData.temperature,
      humidity: sensorData.humidity,
      moisture: sensorData.moisture,
      ph: sensorData.ph,
      light: sensorData.light
    });
    
    // Normalize optimal conditions
    const normalizedOptimal = normalizeData({
      nitrogen: cropOptimal.optimal_n || 0,
      phosphorus: cropOptimal.optimal_p || 0,
      potassium: cropOptimal.optimal_k || 0,
      temperature: cropOptimal.optimal_temperature || 0,
      humidity: cropOptimal.optimal_humidity || 0,
      moisture: cropOptimal.optimal_moisture || 0,
      ph: cropOptimal.optimal_ph || 0,
      light: cropOptimal.optimal_light || 0
    });
    
    // Add seasonality features
    let month = 0, duration = 0, season = 0;
    if (startDate instanceof Date && !isNaN(startDate)) {
      month = startDate.getMonth() / 11;
      season = Math.floor(startDate.getMonth() / 3) / 3;
      if (endDate instanceof Date && !isNaN(endDate)) {
        duration = Math.max(0, Math.min(1, (endDate - startDate) / (1000 * 60 * 60 * 24 * 120)));
      }
    } else {
      const now = new Date();
      month = now.getMonth() / 11;
      season = Math.floor(now.getMonth() / 3) / 3;
      duration = 0;
    }
    
    return tf.tensor2d([[
      // Sensor data (8)
      normalizedSensor.n ?? 0,
      normalizedSensor.p ?? 0,
      normalizedSensor.k ?? 0,
      normalizedSensor.temperature ?? 0,
      normalizedSensor.humidity ?? 0,
      normalizedSensor.moisture ?? 0,
      normalizedSensor.ph ?? 0,
      normalizedSensor.light ?? 0,
      // Optimal conditions (8)
      normalizedOptimal.n ?? 0,
      normalizedOptimal.p ?? 0,
      normalizedOptimal.k ?? 0,
      normalizedOptimal.temperature ?? 0,
      normalizedOptimal.humidity ?? 0,
      normalizedOptimal.moisture ?? 0,
      normalizedOptimal.ph ?? 0,
      normalizedOptimal.light ?? 0,
      // Seasonality and registration (4)
      month,
      duration,
      season,
      isRegistered ? 1 : 0
    ]]);
  }

  calculateScore(sensorData, crop) {
    const parameterMatches = {
      // Keep human-friendly NPK naming similar to your Firestore example
      npk_N: this.calculateMatch(crop.optimal_n, sensorData.nitrogen, 'nitrogen'),
      npk_P: this.calculateMatch(crop.optimal_p, sensorData.phosphorus, 'phosphorus'),
      npk_K: this.calculateMatch(crop.optimal_k, sensorData.potassium, 'potassium'),
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
    // If either side is missing, we truly cannot compute a match
    if (optimal === undefined || optimal === null || actual === undefined || actual === null) {
      return null;
    }

    // If optimal is 0 but sensors have a value, treat it as 0% match
    // (like your YYY / Unnamed crop examples)
    if (optimal === 0) {
      return 0;
    }

    const absDiff = Math.abs(actual - optimal);
    const ratio = absDiff / optimal; // relative difference

    // Use a smooth decay so we NEVER hit 0 for valid comparisons, just very small %
    //  - For most params: score = 100 / (1 + 3 * ratio)
    //  - For light: wider tolerance: score = 100 / (1 + 1.5 * ratio)
    const alpha = paramName === 'light' ? 1.5 : 3.0;
    const score = 100 / (1 + alpha * ratio);

    // Return the exact decimal percentage from this function
    return score;
  }

  calculateWeightedSuitability(parameterMatches, crop) {
    // Enhanced weights based on parameter importance for crop growth
    const weights = {
      npk_N: 0.13,      // Nitrogen - slightly increased
      npk_P: 0.13,      // Phosphorus - slightly increased
      npk_K: 0.13,      // Potassium - slightly increased
      temperature: 0.20, // Temperature - most critical, increased
      humidity: 0.11,    // Humidity - slightly increased
      moisture: 0.16,    // Moisture - increased
      ph: 0.10,          // pH - critical but slightly reduced
      light: 0.04        // Light - reduced (less critical than others)
    };

    // Extract all valid parameter match scores
    const validMatches = [];
    let totalWeight = 0;
    let weightedSum = 0;
    
    Object.entries(parameterMatches).forEach(([param, score]) => {
      if (typeof score === 'number' && score !== null) {
        const weight = weights[param] || 0;
        weightedSum += score * weight;
        totalWeight += weight;
        validMatches.push(score);
      }
    });

    if (totalWeight === 0 || validMatches.length === 0) {
      return 0;
    }

    // Base weighted average
    let baseScore = weightedSum / totalWeight;

    // Enhancement 1: Completeness bonus - reward crops with more parameters configured
    const totalParams = Object.keys(weights).length;
    const completenessRatio = validMatches.length / totalParams;
    const completenessBonus = completenessRatio * 5; // Up to 5 points bonus

    // Enhancement 2: Consistency bonus - reward crops with consistent parameter matches
    // (low variance means all parameters are similarly matched)
    const avgMatch = validMatches.reduce((a, b) => a + b, 0) / validMatches.length;
    const variance = validMatches.reduce((sum, score) => {
      return sum + Math.pow(score - avgMatch, 2);
    }, 0) / validMatches.length;
    const consistencyBonus = Math.max(0, 10 - (variance / 100)); // Up to 10 points bonus for low variance

    // Enhancement 3: Critical parameters bonus - extra weight for temperature and pH
    const criticalParams = ['temperature', 'ph'];
    let criticalScore = 0;
    let criticalWeight = 0;
    criticalParams.forEach(param => {
      const score = parameterMatches[param];
      if (typeof score === 'number' && score !== null) {
        criticalScore += score;
        criticalWeight += 1;
      }
    });
    const criticalBonus = criticalWeight > 0 ? (criticalScore / criticalWeight) * 0.1 : 0; // Up to 10% bonus

    // Enhancement 4: Penalty for very poor matches - if any critical parameter is < 20%
    const hasVeryPoorMatch = validMatches.some(score => score < 20);
    const poorMatchPenalty = hasVeryPoorMatch ? 5 : 0;

    // Calculate final enhanced score
    let enhancedScore = baseScore + completenessBonus + consistencyBonus + criticalBonus - poorMatchPenalty;
    
    // Ensure score stays within 0-100 range
    enhancedScore = Math.max(0, Math.min(100, enhancedScore));

    return Math.round(enhancedScore);
  }

  async savePredictionResults(predictions, sensorData, forecastDetails) {
    // Separate registered and unregistered crops for display purposes only
    const registeredCrops = predictions.filter(p => p.isRegistered);
    const unregisteredCrops = predictions.filter(p => !p.isRegistered);

    // Get top 5 from all crops (fair competition)
    const top5Overall = predictions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => this.formatCropPrediction(item));

    // Get top 5 registered crops (for reference)
    const top5Registered = registeredCrops
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => this.formatCropPrediction(item));

    // Get top 5 unregistered crops (for reference)
    const top5Unregistered = unregisteredCrops
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(item => this.formatCropPrediction(item));

    // Get top 1 overall crop (could be registered or unregistered)
    const topOverall = top5Overall.length > 0 ? top5Overall[0] : null;

    // Start Firestore batch
    const batch = firestore.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Update last prediction data for all crops
    predictions.forEach(prediction => {
      const cropRef = firestore.collection('crops').doc(prediction.cropId);
      batch.update(cropRef, {
        lastPredictionScore: prediction.score,
        lastPredictionTime: timestamp,
        lastRegisteredBoost: 0 // No boost in fair system
      });
    });

    // Save prediction history with enhanced data structure
    const historyRef = firestore.collection('prediction_history').doc();
    batch.set(historyRef, {
      predictions: {
        top5Registered,
        top5Unregistered,
        top5Overall,
        topOverall,
        totalRegistered: registeredCrops.length,
        totalUnregistered: unregisteredCrops.length,
        registeredCropPercentage: registeredCrops.length / predictions.length * 100
      },
      sensorData: this.formatSensorSummary(sensorData),
      forecastData: forecastDetails, // Add forecast details
      modelInfo: {
        version: this.modelVersion,
        isTrained: this.modelTrained,
        lastTrainingTime: this.lastTrainingTime || null
      },
      timestamp,
      hasActualOutcome: false,
      predictionQuality: this.assessPredictionQuality(sensorData, predictions)
    });

    await batch.commit();
    console.log('💾 Saved fair prediction results to Firestore');

    return {
      top5Registered,
      top5Unregistered,
      top5Overall,
      topOverall,
      sensorData: this.formatSensorSummary(sensorData),
      forecastData: forecastDetails, // Include in response
      modelInfo: {
        version: this.modelVersion,
        isTrained: this.modelTrained
      }
    };
  }

  assessPredictionQuality(sensorData, predictions) {
    // Assess the quality of predictions based on data completeness and score distribution
    const registeredScores = predictions.filter(p => p.isRegistered).map(p => p.score);
    const unregisteredScores = predictions.filter(p => !p.isRegistered).map(p => p.score);
    
    const avgRegisteredScore = registeredScores.length > 0 ? 
      registeredScores.reduce((a, b) => a + b, 0) / registeredScores.length : 0;
    const avgUnregisteredScore = unregisteredScores.length > 0 ? 
      unregisteredScores.reduce((a, b) => a + b, 0) / unregisteredScores.length : 0;
    
    const scoreVariance = predictions.map(p => p.score).reduce((a, b) => a + Math.pow(b - avgRegisteredScore, 2), 0) / predictions.length;
    
    return {
      dataCompleteness: this.calculateDataCompleteness(sensorData),
      avgRegisteredScore: Math.round(avgRegisteredScore),
      avgUnregisteredScore: Math.round(avgUnregisteredScore),
      scoreVariance: Math.round(scoreVariance),
      quality: this.determineQualityLevel(avgRegisteredScore, scoreVariance)
    };
  }

  calculateDataCompleteness(sensorData) {
    const requiredFields = ['nitrogen', 'phosphorus', 'potassium', 'temperature', 'humidity', 'moisture', 'ph', 'light'];
    const presentFields = requiredFields.filter(field => 
      sensorData[field] !== undefined && sensorData[field] !== null && sensorData[field] > 0
    );
    return Math.round((presentFields.length / requiredFields.length) * 100);
  }

  determineQualityLevel(avgScore, variance) {
    if (avgScore >= 80 && variance < 400) return 'excellent';
    if (avgScore >= 60 && variance < 600) return 'good';
    if (avgScore >= 40 && variance < 800) return 'fair';
    return 'poor';
  }

  formatCropPrediction(prediction) {
    return {
      id: prediction.cropId,
      name: prediction.name,
      score: prediction.score,
      isRegistered: prediction.isRegistered,
      optimalConditions: {
        nitrogen: prediction.optimal_n,
        phosphorus: prediction.optimal_p,
        potassium: prediction.optimal_k,
        temperature: prediction.optimal_temperature,
        humidity: prediction.optimal_humidity,
        moisture: prediction.optimal_moisture,
        ph: prediction.optimal_ph,
        light: prediction.optimal_light
      },
      parameterMatches: prediction.parameterMatches,
      ruleBasedScore: prediction.ruleBasedScore,
      mlScore: prediction.mlScore,
      registeredBoost: 0, // No boost in fair system
      priorityLevel: 'standard', // All crops have standard priority
      lastUpdated: prediction.timestamp
    };
  }

  formatSensorSummary(sensorData) {
    return {
      nitrogen: sensorData.nitrogen,
      phosphorus: sensorData.phosphorus,
      potassium: sensorData.potassium,
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
    if (this.currentTraining) {
      console.warn('⚠️ Training already in progress, skipping this request.');
      return { success: false, message: 'Training already in progress' };
    }
    this.currentTraining = true;
    
    try {
      console.log('⏳ Loading training data...');
      const trainingData = await this.getPlantedCropsTrainingData();
      if (trainingData.length < 2) {  // Lowered to 2 for testing
        throw new Error(`Insufficient training data (${trainingData.length} samples). Need at least 2.`);
      }
      
      console.log(`📊 Training with ${trainingData.length} samples`);
      console.log(`📈 Registered crops: ${trainingData.filter(d => d.isRegistered).length}`);
      console.log(`📉 Unregistered crops: ${trainingData.filter(d => !d.isRegistered).length}`);
      
      const features = trainingData.map(d => d.features); // Now number[][][]
      const labels = trainingData.map(d => d.label); // number[][]
      
      // Create 3D tensor for features: [batch, sequenceLength, features]
      const featureTensor = tf.tensor3d(features, [features.length, this.sequenceLength, 8]);
      // Create 2D tensor for labels: [batch, forecastHorizon * 8]
      const labelTensor = tf.tensor2d(labels, [labels.length, this.forecastHorizon * 8]);
      
      // Split into train/val with stratification for registered crops
      const valSplit = 0.2;
      const numTrain = Math.floor(features.length * (1 - valSplit));
      
      // Ensure both registered and unregistered crops are in both train and validation sets
      const registeredIndices = trainingData.map((d, i) => ({ index: i, isRegistered: d.isRegistered }));
      const registeredTrain = registeredIndices.filter(d => d.isRegistered).slice(0, Math.floor(numTrain * 0.6));
      const unregisteredTrain = registeredIndices.filter(d => !d.isRegistered).slice(0, Math.floor(numTrain * 0.4));
      const trainIndices = [...registeredTrain, ...unregisteredTrain].map(d => d.index);
      const valIndices = registeredIndices.filter(d => !trainIndices.includes(d.index)).map(d => d.index);
      
      const xTrain = featureTensor.gather(trainIndices);
      const yTrain = labelTensor.gather(trainIndices);
      const xVal = featureTensor.gather(valIndices);
      const yVal = labelTensor.gather(valIndices);
      
      // Recreate model for new input shape
      this.model = this.createModel([this.sequenceLength, 8]);
      
      // Enhanced training with callbacks
      const earlyStopping = tf.callbacks.earlyStopping({ monitor: 'val_loss', patience: 20 });
      
      let bestValLoss = Infinity, bestWeights = null, patience = 20, wait = 0;
      const history = { loss: [], val_loss: [], val_mae: [] };
      const startTime = Date.now();
      
      console.log('🚀 Starting enhanced training...');
      for (let epoch = 0; epoch < 200; epoch++) { // Increased epochs
        const h = await this.model.fit(xTrain, yTrain, {
          epochs: 1,
          batchSize: Math.max(1, Math.min(32, Math.floor(trainIndices.length / 4))), // Ensure at least 1
          validationData: [xVal, yVal],
          shuffle: true,
          verbose: 0,
          callbacks: [earlyStopping]  // Only use earlyStopping
        });
        
        const loss = h.history.loss[0];
        const valLoss = h.history.val_loss[0];
        const valMae = h.history.val_mae[0];
        
        history.loss.push(loss);
        history.val_loss.push(valLoss);
        history.val_mae.push(valMae);
        
        process.stdout.write(`\rEpoch ${epoch+1}: loss=${loss.toFixed(4)} val_loss=${valLoss.toFixed(4)} val_mae=${valMae.toFixed(4)}`);
        
        if (valLoss < bestValLoss) {
          bestValLoss = valLoss;
          bestWeights = this.model.getWeights().map(w => w.clone());
          wait = 0;
        } else {
          wait++;
          if (wait >= patience) {
            console.log(`\n✅ Early stopping at epoch ${epoch+1}`);
            break;
          }
        }
      }
      
      if (bestWeights) this.model.setWeights(bestWeights);
      
      const trainingTime = Date.now() - startTime;
      console.log('\n✅ Training completed');
      
      // Enhanced validation metrics
      const preds = this.model.predict(xVal).dataSync();
      const actuals = yVal.dataSync();
      let mae = 0, mse = 0, rmse = 0;
      let correctPredictions = 0;
      const threshold = 0.1; // 10% tolerance
      
      for (let i = 0; i < preds.length; i++) {
        const pred = Math.max(0, Math.min(1, preds[i]));
        const actual = actuals[i];
        const error = Math.abs(pred - actual);
        
        mae += error;
        mse += error ** 2;
        if (error <= threshold) correctPredictions++;
      }
      
      mae /= preds.length;
      mse /= preds.length;
      rmse = Math.sqrt(mse);
      const accuracy = (correctPredictions / preds.length) * 100;
      
      console.log(`📊 Validation Metrics:`);
      console.log(`   MAE: ${(mae*100).toFixed(2)}%`);
      console.log(`   RMSE: ${(rmse*100).toFixed(2)}%`);
      console.log(`   Accuracy (±${threshold*100}%): ${accuracy.toFixed(1)}%`);
      
      // Prepare training trial data FIRST
      const chartPath = await generateTrainingChart(history);
      const trialData = {
        success: true, 
        samples: trainingData.length,
        registeredSamples: trainingData.filter(d => d.isRegistered).length,
        unregisteredSamples: trainingData.filter(d => !d.isRegistered).length,
        finalLoss: history.loss[history.loss.length-1],
        finalValLoss: history.val_loss[history.val_loss.length-1],
        finalValMae: history.val_mae[history.val_mae.length-1],
        trainingChart: chartPath,
        trainingTime: `${Math.round(trainingTime/1000)}s`,
        valMAE: mae,
        valRMSE: rmse,
        valAccuracy: accuracy,
        epochs: history.loss.length
      };

      // Save training trial to Firestore FIRST (before other async ops)
      try {
        const trialRef = firestore.collection('training_trials').doc();
        const trialTimestamp = admin.firestore.FieldValue.serverTimestamp();
        
        const trialScore = (accuracy * 0.6) + ((100 - mae * 100) * 0.3) + ((100 - rmse * 100) * 0.1);
        
        await trialRef.set({
          trialId: trialRef.id,
          trainedAt: trialTimestamp,
          modelVersion: this.modelVersion,
          metrics: {
            samples: trialData.samples,
            registeredSamples: trialData.registeredSamples,
            unregisteredSamples: trialData.unregisteredSamples,
            finalLoss: trialData.finalLoss,
            finalValLoss: trialData.finalValLoss,
            finalValMae: trialData.finalValMae,
            valMAE: trialData.valMAE,
            valRMSE: trialData.valRMSE,
            valAccuracy: trialData.valAccuracy,
            epochs: trialData.epochs,
            trainingTime: trialData.trainingTime
          },
          trialScore: Math.round(trialScore * 100) / 100,
          isBest: false,
          trainingChart: chartPath
        });
        
        console.log(`📊 Training trial saved: ${trialRef.id} (Score: ${trialScore.toFixed(2)})`);
        
        // Add delay to ensure save completes before potential restart
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (trialError) {
        console.error('❌ Failed to save training trial:', trialError);
      }
      
      await this.saveModel();
      this.modelTrained = true;
      this.lastTrainingTime = new Date().toISOString();
      
      // Mark all used crops as trained
      console.log('🏷️ Marking crops as trained...');
      const batch = firestore.batch();
      trainingData.forEach(data => {
        if (data.docId) {
          const cropRef = firestore.collection('planted_crops').doc(data.docId);
          batch.update(cropRef, {
            isTrained: true,
            trainingUsedAt: new Date()
          });
        }
      });
      
      try {
        await batch.commit();
        console.log(`✅ Marked ${trainingData.length} crops as trained`);
      } catch (batchError) {
        console.error('❌ Failed to mark crops as trained:', batchError);
      }
      
      // Update best trial LAST
      await this.updateBestTrial();
      
      return trialData;
      
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
    const threshold = 15;
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
      if (error <= threshold) correctPredictions++;
      
      results.push({
        predictionId: doc.id,
        predicted: Math.round(prediction),
        actual: Math.round(actual),
        error: Math.round(error),
        withinThreshold: error <= threshold,
        timestamp: data.timestamp.toDate().toISOString()
      });
      
      tf.dispose(inputTensor);
    }

    const meanAbsoluteError = totalError / results.length;
    const accuracy = (correctPredictions / results.length) * 100;
    const r2 = 1 - (totalError / results.length) / (results.reduce((s, r) => s + r.actual ** 2, 0) / results.length);  // Simple R²
    
    return {
      samples: results.length,
      meanAbsoluteError,
      accuracy,
      r2,
      validationThreshold: threshold,
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
    
    // Schedule auto-retrain if enough new outcomes collected
    this.scheduleAutoRetrain();
    
    return outcomeRef.id;
  }

  scheduleAutoRetrain() {
    // Increment counter
    this.newOutcomesSinceLastTrain++;
    
    // Clear existing timeout
    if (this.pendingRetrainTimeout) {
      clearTimeout(this.pendingRetrainTimeout);
    }
    
    // Retrain immediately on any new outcome (changed from 5 to 1)
    const shouldRetrain = this.newOutcomesSinceLastTrain >= 1;
    
    if (shouldRetrain) {
      // Retrain immediately
      this.newOutcomesSinceLastTrain = 0;
      this.autoRetrain();
    }
  }

  async autoRetrain() {
    if (this.currentTraining) {
      console.log('⏸️ Training already in progress, skipping auto-retrain');
      return;
    }

    if (!this.backendReady) {
      console.log('⏸️ Backend not ready, skipping auto-retrain');
      return;
    }

    try {
      console.log('🔄 Auto-retraining model with new data...');
      const result = await this.trainModel();
      if (result.success) {
        console.log(`✅ Auto-retrain completed: ${result.samples} samples, accuracy: ${result.valAccuracy.toFixed(1)}%`);
        this.lastTrainingTime = new Date().toISOString();
      }
    } catch (error) {
      console.error('❌ Auto-retrain failed:', error.message);
      // Don't throw - this is background operation
    }
  }

  async updateBestTrial() {
    try {
      // Get all training trials (fetch all and find best client-side to avoid index)
      const allTrialsSnapshot = await firestore.collection('training_trials').get();

      if (allTrialsSnapshot.empty) return;

      // Find best trial by trialScore
      let bestTrial = null;
      let bestScore = -1;

      allTrialsSnapshot.forEach(doc => {
        const data = doc.data();
        const score = data.trialScore || 0;
        if (score > bestScore) {
          bestScore = score;
          bestTrial = { id: doc.id, data };
        }
      });

      if (!bestTrial) return;

      // Update all trials - set isBest flag
      const batch = firestore.batch();

      allTrialsSnapshot.forEach(doc => {
        const trialRef = firestore.collection('training_trials').doc(doc.id);
        batch.update(trialRef, {
          isBest: doc.id === bestTrial.id
        });
      });

      await batch.commit();
      console.log(`🏆 Best trial updated: ${bestTrial.id.substring(0, 8)}... (Score: ${bestScore.toFixed(2)})`);
    } catch (error) {
      console.error('❌ Failed to update best trial:', error);
    }
  }

  async getTrainingTrials(limit = 20) {
    try {
      // Get all trials and sort client-side to avoid index requirement
      const allTrialsSnapshot = await firestore.collection('training_trials').get();

      const allTrials = [];
      allTrialsSnapshot.forEach(doc => {
        const data = doc.data();
        allTrials.push({
          trialId: doc.id,
          ...data,
          trainedAt: data.trainedAt?.toDate?.()?.getTime() || 0 // Convert to timestamp for sorting
        });
      });

      // Sort by trainedAt descending (most recent first)
      const trials = allTrials.slice(0, limit).map(trial => ({
        ...trial,
        trainedAt: trial.trainedAt > 0 ? new Date(trial.trainedAt).toISOString() : null
      }));

      // Find best trial (highest trialScore)
      let bestTrial = null;
      let bestScore = -1;

      allTrials.forEach(trial => {
        const score = trial.trialScore || 0;
        if (score > bestScore) {
          bestScore = score;
          bestTrial = {
            ...trial,
            trainedAt: trial.trainedAt > 0 ? new Date(trial.trainedAt).toISOString() : null
          };
        }
      });

      return {
        trials,
        bestTrial,
        totalTrials: allTrials.length
      };
    } catch (error) {
      console.error('❌ Failed to get training trials:', error);
      throw error;
    }
  }

  async getBestTrial() {
    try {
      // Get all training trials and find the best one
      const allTrialsSnapshot = await firestore.collection('training_trials').get();

      if (allTrialsSnapshot.empty) {
        return null;
      }

      let bestTrial = null;
      let bestScore = -1;

      allTrialsSnapshot.forEach(doc => {
        const data = doc.data();
        const score = data.trialScore || 0;
        if (score > bestScore) {
          bestScore = score;
          bestTrial = {
            trialId: doc.id,
            ...data,
            trainedAt: data.trainedAt?.toDate?.()?.toISOString() || null
          };
        }
      });

      return bestTrial;
    } catch (error) {
      console.error('❌ Failed to get best trial:', error);
      throw error;
    }
  }
}

module.exports = new CropPredictionService();


