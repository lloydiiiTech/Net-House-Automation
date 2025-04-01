
const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-cpu');
const { firestore } = require('../config/firebase');
const { normalizeData } = require('../utils/dataNormalizer');

class CropPredictionService {
  constructor() {
    this.model = null;
    this.backendReady = false;
  }

  async initialize() {
    try {
      await tf.setBackend('cpu');
      await tf.ready();
      this.backendReady = true;
      console.log(`✅ TensorFlow.js backend ready: ${tf.getBackend()}`);
      
      this.model = await this.createModel();
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
      inputShape: [8] // 8 input features
    }));
    model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    
    model.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError',
      metrics: ['accuracy']
    });
    
    return model;
  }

  async getLatestSensorData() {
    const snapshot = await firestore.collection('sensors')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();
    
    if (snapshot.empty) {
      throw new Error('No sensor data available');
    }
    
    return snapshot.docs[0].data();
  }

  async getAllCrops() {
    const snapshot = await firestore.collection('crops').get(); // Changed to 'crops' to match savePredictionResults
    const crops = {};
    snapshot.forEach(doc => {
      crops[doc.id] = doc.data();
    });
    return crops;
  }

  async trainModel() {
    if (!this.backendReady) throw new Error('TensorFlow backend not ready');
    
    const crops = await this.getAllCrops();
    if (Object.keys(crops).length === 0) {
      throw new Error('No crop data available for training');
    }
    
    const { features, labels } = this.prepareTrainingData(crops);
    await this.model.fit(features, labels, {
      epochs: 50,
      batchSize: 16,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}`);
        }
      }
    });
  }

  prepareTrainingData(crops) {
    const features = [];
    const labels = [];
    
    Object.values(crops).forEach(crop => {
      features.push([
        crop.optimal_n,
        crop.optimal_p,
        crop.optimal_k,
        crop.optimal_temperature,
        crop.optimal_humidity,
        crop.optimal_moisture,
        crop.optimal_ph,
        crop.optimal_light
      ]);
      labels.push(crop.priority);
    });
    
    return {
      features: tf.tensor2d(features),
      labels: tf.tensor1d(labels)
    };
  }

  async predict() {
    if (!this.backendReady) throw new Error('TensorFlow backend not ready');
    
    const sensorData = await this.getLatestSensorData();
    const crops = await this.getAllCrops();
    const inputTensor = this.createInputTensor(sensorData);
    
    const predictions = [];
    for (const [cropId, crop] of Object.entries(crops)) {
      const score = await this.calculateScore(inputTensor, crop);
      predictions.push({ 
        cropId, 
        ...crop, 
        score,
        timestamp: new Date().toISOString()
      });
    }
    
    // Save prediction results to Firestore
    await this.savePredictionResults(predictions, sensorData);
    
    return this.formatResults(predictions);
  }
  async savePredictionResults(predictions, sensorData) {
    const topPredictions = this.formatResults(predictions);
    const batch = firestore.batch();
    
    // Save to predictions collection
    const predictionRef = firestore.collection('predictions').doc();
    batch.set(predictionRef, {
      sensorData,
      predictions: topPredictions,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Update each crop with latest prediction
    topPredictions.forEach(pred => {
      const cropRef = firestore.collection('crops').doc(pred.id);
      batch.update(cropRef, {
        lastPredictionScore: pred.suitability,
        lastPredictionTime: admin.firestore.FieldValue.serverTimestamp()
      });
    });
    
    await batch.commit();
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

  async calculateScore(inputTensor, crop) {
    const prediction = this.model.predict(inputTensor).dataSync()[0];
    return (prediction * 0.7) + (crop.priority * 0.3);
  }

  formatResults(predictions, topN = 5) {
    predictions.sort((a, b) => b.score - a.score);
    const top = predictions.slice(0, topN);
    const maxScore = top[0].score;
    
    return top.map(item => ({
      id: item.cropId,
      name: item.name,
      suitability: Math.round((item.score / maxScore) * 100),
      isRegistered: item.priority === 0.5,
      optimalConditions: {
        npk_N: item.optimal_n,
        npk_P: item.optimal_p,
        npk_K: item.optimal_k,
        temperature: item.optimal_temperature,
        humidity: item.optimal_humidity,
        moisture: item.optimal_moisture,
        ph: item.optimal_ph,
        light: item.optimal_light
      }
    }));
  }
}

module.exports = new CropPredictionService();