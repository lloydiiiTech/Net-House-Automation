const { firestore, admin } = require('../config/firebase');
const { database } = require('../config/firebase');
const { realtimeDB } = require('../config/firebase');
const axios = require('axios');

exports.plantOverview = async (req, res) => {
    try {
      // Get user data from session
      const userId = req.session.user?.uid;
      let userData = null;
      
      if (userId) {
        try {
          const userDoc = await firestore.collection('users').doc(userId).get();
          if (userDoc.exists) {
            userData = userDoc.data();
            userData.id = userDoc.id;
            // Set default profile picture if none exists
            userData.profilePicture = userData.profilePicture || '/assets/img/default-avatar.png';
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
        }
      }

      const snapshot = await firestore.collection('prediction_history')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
  
      if (snapshot.empty) {
        return res.render("admin/plants", { 
          user: userData || {
            name: 'Admin',
            role: 'Admin',
            profilePicture: '/assets/img/default-avatar.png'
          },
          recommendations: [],
          sensorData: {} 
        });
      }
  
      const doc = snapshot.docs[0];
      const data = doc.data();
      
      // Get sensor data from the recommendations document
      const sensorData = data.sensorData || {};
      
      // Process crops
      const predictions = data.predictions || {};
      const recommendations = []
        .concat(predictions.top5Registered || [])
        .concat(predictions.top5Unregistered || [])
        .filter(crop => crop && crop.name)
        .sort((a, b) => (b.score || b.ruleBasedScore || 0) - (a.score || a.ruleBasedScore || 0))
        .slice(0, 5);

      // Fetch the current active crop for the user
      let currentCrop = null;
      if (userId) {
        const cropSnapshot = await firestore.collection('planted_crops')
          .where('userId', '==', userId)
          .where('endDate', '==', null)
          .limit(1)
          .get();
        if (!cropSnapshot.empty) {
          currentCrop = cropSnapshot.docs[0].data();
          currentCrop.id = cropSnapshot.docs[0].id;

          // Add growthStage (default to 'Seedling' if null)
          currentCrop.growthStage = currentCrop.growthStage || 'Seedling';

          // Fetch latest sensor summary
          const sensorSummarySnap = await firestore.collection('sensor_summaries')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
          let healthStatus = 'Unknown';
          if (!sensorSummarySnap.empty && currentCrop.optimalConditions) {
            const summary = sensorSummarySnap.docs[0].data();
            // Compare each parameter to optimal
            let totalParams = 0;
            let goodParams = 0;
            const params = [
              { key: 'temperature', summaryKey: 'temperature' },
              { key: 'humidity', summaryKey: 'humidity' },
              { key: 'moisture', summaryKey: 'moistureAve' },
              { key: 'light', summaryKey: 'light' },
              { key: 'npk_N', summaryKey: 'nitrogen' },
              { key: 'npk_P', summaryKey: 'phosphorus' },
              { key: 'npk_K', summaryKey: 'potassium' },
              { key: 'ph', summaryKey: 'ph' }
            ];
            params.forEach(param => {
              const optimal = currentCrop.optimalConditions[param.key];
              const summaryVal = summary[param.summaryKey]?.average;
              if (typeof optimal === 'number' && typeof summaryVal === 'number') {
                totalParams++;
                // Consider 'good' if within 15% of optimal
                if (Math.abs(summaryVal - optimal) / optimal <= 0.15) {
                  goodParams++;
                }
              }
            });
            const ratio = totalParams > 0 ? goodParams / totalParams : 0;
            if (ratio >= 0.75) healthStatus = 'Good';
            else if (ratio >= 0.5) healthStatus = 'Warning';
            else healthStatus = 'Critical';
            currentCrop.healthScore = Math.round(ratio * 100);
          }
          currentCrop.healthStatus = healthStatus;
        }
      }

      res.render("admin/plants", { 
        user: userData || {
          name: 'Admin',
          role: 'Admin',
          profilePicture: '/assets/img/default-avatar.png'
        },
        recommendations,
        sensorData,
        currentCrop
      });
  
    } catch (error) {
      console.error("Error:", error);
      res.render("admin/plants", { 
        user: {
          name: 'Admin',
          role: 'Admin',
          profilePicture: '/assets/img/default-avatar.png'
        },
        recommendations: [],
        sensorData: {} 
      });
    }
  };

// API endpoint for AJAX call
exports.getRecommendedCrops = async (req, res) => {
  try {
    const recommendationsRef = firestore.collection('prediction_history');
    const snapshot = await recommendationsRef
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json([]);
    }

    const latestData = snapshot.docs[0].data();
    
    const allCrops = []
      .concat(latestData.top5Registered || [])
      .concat(latestData.top5Unregistered || [])
      .filter(crop => crop && crop.name && crop.score !== undefined && crop.score !== null)
      .filter(crop => crop.score > 0);

    const top5Crops = allCrops
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(crop => ({
        name: crop.name,
        score: crop.score,
        isRegistered: crop.isRegistered
      }));

    res.json(top5Crops);
  } catch (error) {
    console.error("Error fetching crops:", error);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
};

// Check for active crop
exports.checkActiveCrop = async (req, res) => {
  try {
    if (!req.session.user?.uid) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const snapshot = await firestore.collection('planted_crops')
      .where('userId', '==', req.session.user.uid)
      .where('endDate', '==', null)
      .limit(1)
      .get();

    const hasActiveCrop = !snapshot.empty;
    const currentCrop = hasActiveCrop ? snapshot.docs[0].data() : null;

    res.json({ 
      hasActiveCrop,
      currentCrop
    });
  } catch (error) {
    console.error("Error checking active crop:", error);
    res.status(500).json({ error: "Failed to check active crops" });
  }
};



// Harvest current crop
exports.harvestCurrentCrop = async (req, res) => {
  try {
    if (!req.session.user?.uid) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Find active crop
    const snapshot = await firestore.collection('planted_crops')
      .where('userId', '==', req.session.user.uid)
      .where('endDate', '==', null)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({ error: "No active crop found" });
    }

    // Update with harvest date
    const cropDoc = snapshot.docs[0];
    await cropDoc.ref.update({
      endDate: admin.firestore.FieldValue.serverTimestamp(),
      status: 'harvested'
    });

    res.json({ 
      success: true,
      message: `${cropDoc.data().name} harvested successfully` 
    });
  } catch (error) {
    console.error("Error harvesting crop:", error);
    res.status(500).json({ error: "Failed to harvest crop" });
  }
};

// Add this function to get real-time sensor data
exports.getRealtimeSensorData = async (req, res) => {
    try {
        // Set up real-time listener for sensor data
        const sensorRef = database.ref('sensors');
        
        sensorRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Emit the data through WebSocket or Server-Sent Events
                req.app.get('io').emit('sensorUpdate', data);
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Error setting up real-time sensor data:", error);
        res.status(500).json({ error: "Failed to setup real-time sensor data" });
    }
};

// Add weather API endpoint
exports.getWeatherData = async (req, res) => {
    try {
        const city = 'Manila'; // You can make this configurable or get from user settings
        const apiKey = process.env.OPENWEATHER_API_KEY;
        
        if (!apiKey) {
            return res.status(500).json({
                success: false,
                error: 'Weather API key not configured'
            });
        }

        const response = await axios.get(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
        );

        const weatherData = {
            main: response.data.weather[0].main,
            description: response.data.weather[0].description,
            temperature: response.data.main.temp,
            humidity: response.data.main.humidity,
            windSpeed: response.data.wind.speed,
            icon: response.data.weather[0].icon
        };

        res.json({
            success: true,
            weather: weatherData
        });
    } catch (error) {
        console.error('Error fetching weather data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch weather data'
        });
    }
};