const bodyParser = require('body-parser');
const express = require('express');
const mainRoutes = require('./routes/authRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const app = express();
const session = require("express-session");
const flash = require('express-flash');
const { firestore } = require('./config/firebase');
const CropPredictionService = require('./services/cropPredictionService');
const { initScheduledJobs } = require('./controller/sensorController.js');
const path = require('path');

// Session configuration
app.use(session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

app.use(flash());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Initialize services
let predictionServiceReady = false;
const initializeServices = async () => {
  try {
    // First check if Firebase is already initialized
    if (firestore) {
      console.log('✅ Firebase already initialized from config');
    }

    // Initialize sensor data collection
    initScheduledJobs();
    console.log('✅ Sensor data summarization scheduled');

    // Initialize prediction service
    await CropPredictionService.initialize();
    predictionServiceReady = true;
    console.log('✅ All services initialized');
    
    // Start periodic predictions (every 6 hours)
    setInterval(async () => {
      try {
        console.log('⏳ Running periodic prediction...');
        const results = await CropPredictionService.predict();
        console.log('✅ Periodic prediction completed');
        console.log('Top registered crop:', results.topRegistered?.name, 
          `(${results.topRegistered?.score}%)`);
      } catch (err) {
        console.error('❌ Periodic prediction failed:', err);
      }
    }, 6 * 60 * 60 * 1000); // 6 hours in milliseconds
    
  } catch (err) {
    console.error('❌ Service initialization failed:', err);
    process.exit(1);
  }
};

// Routes
app.use('/', mainRoutes);
app.use('/api', trainingRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    services: {
      prediction: predictionServiceReady ? 'Ready' : 'Initializing',
      firebase: firestore ? 'Connected' : 'Not connected',
      lastChecked: new Date().toISOString()
    }
  });
});

// Serve training chart
app.get('/training-chart', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'training_chart.html'));
});


// Prediction endpoint
app.get('/predict', async (req, res) => {
  try {
    if (!predictionServiceReady) {
      return res.status(503).json({ 
        success: false, 
        message: 'Prediction service is initializing' 
      });
    }
    
    const results = await CropPredictionService.predict();
    res.json({ 
      success: true, 
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Prediction error:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});
// Error handling middleware
app.use((err, req, res, next) => {
  console.error('⚠️ Error:', err.stack);
  res.status(500).render('error', { 
    message: err.message || 'Something went wrong!',
    timestamp: new Date().toISOString()
  });
});

// Start server
const PORT = process.env.PORT || 9999;
app.listen(PORT, async () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
  await initializeServices();
});