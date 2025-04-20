const bodyParser = require('body-parser');
const express = require('express');
const routes = require('./routes/authRoutes');
const app = express();
const session = require("express-session");
const flash = require('express-flash');
const { firestore } = require('./config/firebase'); // Import from your existing file
const CropPredictionService = require('./services/cropPredictionService');
const { initScheduledJobs } = require('./controller/sensorController.js');
// Session configuration (keep your existing setup)
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

    initScheduledJobs();
    console.log('✅ Sensor data summarization scheduled');

    await CropPredictionService.initialize();
    predictionServiceReady = true;
    console.log('✅ All services initialized');
    
    // Start periodic predictions (every 10 minutes)
    setInterval(async () => {
      try {
        const results = await CropPredictionService.predict();
        console.log('Periodic prediction completed at', new Date().toISOString());
        console.log('Top crop:', results[0].name, '(', results[0].suitability, '%)');
      } catch (err) {
        console.error('Periodic prediction failed:', err);
      }
    }, 600000); // 10 minutes in milliseconds
    
  } catch (err) {
    console.error('❌ Service initialization failed:', err);
    process.exit(1);
  }
};

// Routes (keep your existing routes)
app.use('/', routes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    predictionService: predictionServiceReady ? 'Ready' : 'Initializing',
    firebase: firestore ? 'Connected' : 'Not connected',
    timestamp: new Date().toISOString()
  });
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
  console.log(`Server started on http://localhost:${PORT}`);
  await initializeServices();
});