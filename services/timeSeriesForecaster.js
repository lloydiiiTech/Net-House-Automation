const tf = require('@tensorflow/tfjs');
require('@tensorflow/tfjs-backend-cpu');
const { firestore } = require('../config/firebase');

class TimeSeriesForecaster {
  constructor() {
    this.models = {}; // One model per parameter
    this.sequenceLength = 7; // Use last 7 days for prediction
    this.parameters = ['temperature', 'humidity', 'light', 'moistureAve', 'nitrogen', 'phosphorus', 'potassium', 'ph'];
  }

  async initialize() {
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('✅ TimeSeriesForecaster initialized');
  }

  async forecastSensorData() {
    try {
      // Fetch last 30 days of daily sensor summaries for training/prediction
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const snapshot = await firestore.collection('daily_sensor_summaries')
        .where('timestamp', '>=', thirtyDaysAgo)
        .orderBy('timestamp', 'asc')
        .get();

      if (snapshot.empty || snapshot.size < this.sequenceLength + 1) {
        console.log('⚠️ Not enough data for forecasting');
        return null;
      }

      const data = snapshot.docs.map(doc => doc.data());
      
      // Train models for each parameter
      for (const param of this.parameters) {
        const values = data.map(d => d[param]?.average || 0).filter(v => v > 0);
        if (values.length >= this.sequenceLength + 1) {
          await this.trainModel(param, values);
        }
      }

      // Generate forecasts for next day
      const forecasts = {};
      for (const param of this.parameters) {
        if (this.models[param]) {
          const recentData = data.slice(-this.sequenceLength).map(d => d[param]?.average || 0);
          forecasts[param] = await this.predictNext(param, recentData);
        }
      }

      // Save forecast to Firestore
      const forecastDoc = {
        forecasts,
        timestamp: now,
        basedOnDays: data.length,
        modelVersion: 'LSTM-v1'
      };
      
      await firestore.collection('sensor_forecasts').add(forecastDoc);
      console.log('✅ Forecast saved to Firestore');
      
      return forecastDoc;
    } catch (error) {
      console.error('❌ Forecasting error:', error);
      return null;
    }
  }

  async trainModel(param, values) {
    const sequences = [];
    const targets = [];
    
    for (let i = 0; i <= values.length - this.sequenceLength - 1; i++) {
      sequences.push(values.slice(i, i + this.sequenceLength));
      targets.push(values[i + this.sequenceLength]);
    }

    if (sequences.length === 0) return;

    const xTrain = tf.tensor2d(sequences);
    const yTrain = tf.tensor1d(targets);

    // Normalize
    const { mean, std } = this.getStats(values);
    const xNorm = xTrain.sub(mean).div(std);
    const yNorm = yTrain.sub(mean).div(std);

    // Simple LSTM model
    this.models[param] = tf.sequential();
    this.models[param].add(tf.layers.lstm({ units: 50, inputShape: [this.sequenceLength, 1] }));
    this.models[param].add(tf.layers.dense({ units: 1 }));
    this.models[param].compile({ optimizer: 'adam', loss: 'meanSquaredError' });

    await this.models[param].fit(xNorm.reshape([sequences.length, this.sequenceLength, 1]), yNorm, {
      epochs: 20,
      batchSize: 8,
      verbose: 0
    });

    // Store normalization stats
    this.models[param].normalization = { mean, std };

    tf.dispose([xTrain, yTrain, xNorm, yNorm]);
  }

  async predictNext(param, recentData) {
    if (!this.models[param] || recentData.length !== this.sequenceLength) return null;

    const input = tf.tensor2d([recentData]);
    const { mean, std } = this.models[param].normalization;
    const normInput = input.sub(mean).div(std);
    
    const prediction = this.models[param].predict(normInput.reshape([1, this.sequenceLength, 1]));
    const denormPrediction = prediction.mul(std).add(mean);
    
    const result = denormPrediction.dataSync()[0];
    tf.dispose([input, normInput, prediction, denormPrediction]);
    
    return Math.round(result * 100) / 100; // Round to 2 decimals
  }

  getStats(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length);
    return { mean, std: std || 1 }; // Avoid division by zero
  }

  async getLatestForecast() {
    const snapshot = await firestore.collection('sensor_forecasts')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const data = snapshot.docs[0].data();
    return {
      ...data,
      timestamp: data.timestamp.toDate().toISOString()
    };
  }
}

module.exports = new TimeSeriesForecaster();