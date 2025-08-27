require('dotenv').config();
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
const server = require('http').createServer(app);
const { Server } = require('socket.io');
const path = require('path');
const irrigationController = require('./controller/irrigationController');
const initializeSocket = require('./config/socket');
const { initAIScheduledJobs } = require('./controller/aiController');
const { initPlantedCropsListener } = require('./services/plantedCropsListener');

const redis = require('redis');
const client = redis.createClient();

client.on('error', err => console.error('Redis Client Error', err));

client.connect().then(() => {
  console.log('Connected to Redis');
});

// Configure Socket.IO with CORS
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust this to your specific domain in production
    methods: ["GET", "POST"]
  },
  // Enable compatibility mode for older clients
  allowEIO3: true
});

// Remove this line - it's not needed
// app.use('/socket.io', express.static(__dirname + '/node_modules/socket.io/client-dist'));

const adminController = require('./controller/adminController');
adminController.initFirebaseListener(io);

// Session configuration
app.use(session({
    secret: "your_secret_key",
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
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
    if (firestore) {
      console.log('✅ Firebase already initialized from config');
    }

    initScheduledJobs();
    console.log('✅ Sensor data summarization scheduled');

    await CropPredictionService.initialize();
    predictionServiceReady = true;
    console.log('✅ All services initialized');
    
    // Start Firestore listener for harvested crops
    initPlantedCropsListener();
    
    // Configure prediction timing - run at specific times
    const PREDICTION_TIMES = process.env.PREDICTION_TIMES || '02:27'; // Default: 9 AM, 3 PM, 9 PM
    const predictionTimes = PREDICTION_TIMES.split(',').map(time => time.trim());
    
    console.log(`⏰ Setting up scheduled predictions at: ${predictionTimes.join(', ')}`);
    
    // Schedule predictions at specific times
    const schedule = require('node-schedule');
    
    predictionTimes.forEach(time => {
      const [hour, minute] = time.split(':').map(Number);
      
      // Schedule job to run daily at specified time
      schedule.scheduleJob(`0 ${minute} ${hour} * * *`, async () => {
        try {
          console.log(`⏳ Running scheduled prediction at ${time}...`);
          const results = await CropPredictionService.predict();
          console.log('✅ Scheduled prediction completed');
          console.log('Top overall crop:', results.topOverall?.name, 
            `(${results.topOverall?.score}%)`);
        } catch (err) {
          console.error('❌ Scheduled prediction failed:', err);
        }
      });
      
      console.log(`📅 Scheduled prediction for ${time} daily`);
    });
    
  } catch (err) {
    console.error('❌ Service initialization failed:', err);
    process.exit(1);
  }
};

// Initialize AI scheduled jobs
initAIScheduledJobs();

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

// Initialize Socket.IO for sensor data
initializeSocket(io);

// Initialize Socket.IO for irrigation controller
irrigationController.initializeSocket(io);

// Set io instance in app for use in routes
app.set('io', io);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('⚠️ Error:', err.stack);
  res.status(500).render('error', { 
    message: err.message || 'Something went wrong!',
    error: err, // Ensure error is always passed
    timestamp: new Date().toISOString()
  });
});

// Start server with Socket.IO
const PORT = process.env.PORT || 9999; // Changed from 9999 to 3000
server.listen(PORT, async () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
  await initializeServices();
});


