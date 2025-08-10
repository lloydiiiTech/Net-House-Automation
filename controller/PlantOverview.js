const { firestore, admin } = require('../config/firebase');
const { database } = require('../config/firebase');
const { realtimeDB } = require('../config/firebase');
const axios = require('axios');

exports.plantOverview = async (req, res) => {
  const rolesession = req.session.user?.role;
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
        const rolesession = req.session.user?.role;

      if (snapshot.empty) {
        if(rolesession.toUpperCase() === 'ADMIN'){
          return res.render("admin/plants", { 
          user: userData || {
            name: 'Admin',
            role: 'Admin',
            profilePicture: '/assets/img/default-avatar.png'
          },
          recommendations: [],
          sensorData: {},
          aiFertilizerAdvice: null,
          aiDiseaseAdvice: null
        });
        } else {
          return res.render("plants", { 
            user: userData || {
              name: 'User',
              role: 'User',
              profilePicture: '/assets/img/default-avatar.png'
            },
            recommendations: [],
            sensorData: {},
            aiFertilizerAdvice: null,
            aiDiseaseAdvice: null
          });
        }
        
      }
  
      const doc = snapshot.docs[0];
      const data = doc.data();
      
      // Get sensor data from the recommendations document
      const sensorData = data.sensorData || {};
      
      // Process crops - use the new enhanced structure
      const predictions = data.predictions || {};
      
      // Use top5Overall if available, otherwise fall back to the old method
      let recommendations = [];
      if (predictions.top5Overall && predictions.top5Overall.length > 0) {
        recommendations = predictions.top5Overall;
      } else {
        // Fallback to old method
        recommendations = []
          .concat(predictions.top5Registered || [])
          .concat(predictions.top5Unregistered || [])
          .filter(crop => crop && crop.name)
          .sort((a, b) => (b.score || b.ruleBasedScore || 0) - (a.score || b.ruleBasedScore || 0))
          .slice(0, 5);
      }

      // Add prediction quality information
      const predictionQuality = data.predictionQuality || {};
      const modelInfo = data.modelInfo || {};

      // Fetch the current active crop for the user
      let currentCrop = null;
      let aiFertilizerAdvice = null;
      let aiDiseaseAdvice = null;
      
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

          // Debug: Fetch all AI advice documents to see what's available
          

          // Fetch latest AI fertilizer advice for the current crop
          try {
            console.log('Fetching AI fertilizer advice for crop ID:', currentCrop.id);
            // Calculate yesterday's date range
            const now = new Date();
            const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
            const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
            let fertilizerSnapshot = await firestore.collection('ai_fertilizer_advice')
              .where('id', '==', currentCrop.id)
              .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(yesterdayStart))
              .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(yesterdayEnd))
              .get();
            console.log('Fertilizer snapshot size:', fertilizerSnapshot.size);
            if (!fertilizerSnapshot.empty) {
              // Sort by timestamp in JavaScript to get the latest
              const fertilizerDocs = fertilizerSnapshot.docs;
              fertilizerDocs.sort((a, b) => {
                const aTime = a.data().timestamp?.toDate?.() || new Date(a.data().timestamp?._seconds * 1000);
                const bTime = b.data().timestamp?.toDate?.() || new Date(b.data().timestamp?._seconds * 1000);
                return bTime - aTime; // Descending order
              });
              aiFertilizerAdvice = fertilizerDocs[0].data();
              console.log('Found fertilizer advice:', aiFertilizerAdvice);
            } else {
              console.log('No fertilizer advice found for crop ID:', currentCrop.id, 'for yesterday.');
            }
          } catch (error) {
            console.error('Error fetching AI fertilizer advice:', error);
          }

          // Fetch latest AI disease advice for the current crop
          try {
            const now = new Date();
            const yesterdayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
            const yesterdayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
            console.log('Fetching AI disease advice for crop ID:', currentCrop.id);
            let diseaseSnapshot = await firestore.collection('ai_disease_advice')
              .where('id', '==', currentCrop.id)
              .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(yesterdayStart))
              .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(yesterdayEnd))
              .get();
            console.log('Disease snapshot size:', diseaseSnapshot.size);
            if (!diseaseSnapshot.empty) {
              // Sort by timestamp in JavaScript to get the latest
              const diseaseDocs = diseaseSnapshot.docs;
              diseaseDocs.sort((a, b) => {
                const aTime = a.data().timestamp?.toDate?.() || new Date(a.data().timestamp?._seconds * 1000);
                const bTime = b.data().timestamp?.toDate?.() || new Date(b.data().timestamp?._seconds * 1000);
                return bTime - aTime; // Descending order
              });
              aiDiseaseAdvice = diseaseDocs[0].data();
              console.log('Found disease advice:', aiDiseaseAdvice);
            } else {
              console.log('No disease advice found for crop ID:', currentCrop.id, 'for yesterday.');
            }
          } catch (error) {
            console.error('Error fetching AI disease advice:', error);
          }
        }
      }

      console.log('Rendering plant overview with data:', {
        hasUser: !!userData,
        recommendationsCount: recommendations.length,
        hasCurrentCrop: !!currentCrop,
        hasFertilizerAdvice: !!aiFertilizerAdvice,
        hasDiseaseAdvice: !!aiDiseaseAdvice,
        fertilizerAdvice: aiFertilizerAdvice,
        diseaseAdvice: aiDiseaseAdvice
      });

      if(rolesession.toUpperCase() === 'ADMIN'){
        
        res.render("admin/plants", { 
          user: userData || {
            name: 'Admin',
            role: 'Admin',
            profilePicture: '/assets/img/default-avatar.png'
          },
          recommendations,
          sensorData,
          currentCrop,
          aiFertilizerAdvice,
          aiDiseaseAdvice
        });
      } else{
        res.render("plants", { 
          user: userData || {
            name: 'User',
            role: 'User',
            profilePicture: '/assets/img/default-avatar.png'
          },
          recommendations,
          sensorData,
          currentCrop,
          aiFertilizerAdvice,
          aiDiseaseAdvice
        });
      }

  
    } catch (error) {
      console.error("Error:", error);
      const rolesession = req.session.user?.role;

      if(rolesession.toUpperCase() === 'ADMIN'){
        res.render("admin/plants", { 
          user: {
            name: 'Admin',
            role: 'Admin',
            profilePicture: '/assets/img/default-avatar.png'
          },
          recommendations: [],
          sensorData: {},
          aiFertilizerAdvice: null,
          aiDiseaseAdvice: null
        });
      } else {
        res.render("plants", { 
          user: {
            name: 'User',
            role: 'User',
            profilePicture: '/assets/img/default-avatar.png'
          },
          recommendations: [],
          sensorData: {},
          aiFertilizerAdvice: null,
          aiDiseaseAdvice: null
        });
      }

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
    
    // Use the new enhanced structure if available
    let top5Crops = [];
    if (latestData.predictions?.top5Overall && latestData.predictions.top5Overall.length > 0) {
      top5Crops = latestData.predictions.top5Overall
        .filter(crop => crop && crop.name && crop.score !== undefined && crop.score !== null)
        .filter(crop => crop.score > 0)
        .map(crop => ({
          name: crop.name,
          score: crop.score,
          isRegistered: crop.isRegistered,
          registeredBoost: 0, // No boost in fair system
          priorityLevel: 'standard' // All crops have standard priority
        }));
    } else {
      // Fallback to old method
      const allCrops = []
        .concat(latestData.predictions?.top5Registered || [])
        .concat(latestData.predictions?.top5Unregistered || [])
        .filter(crop => crop && crop.name && crop.score !== undefined && crop.score !== null)
        .filter(crop => crop.score > 0);

      top5Crops = allCrops
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(crop => ({
          name: crop.name,
          score: crop.score,
          isRegistered: crop.isRegistered,
          registeredBoost: 0,
          priorityLevel: 'standard'
        }));
    }

    res.json(top5Crops);
  } catch (error) {
    console.error("Error fetching crops:", error);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
};

// Check for active crop
exports.checkActiveCrop = async (req, res) => {
  try {
    const includeLast = req.query.includeLast === 'true';
    if (!req.session.user?.uid) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const snapshot = await firestore.collection('planted_crops')
      .where('userId', '==', req.session.user.uid)
      .where('endDate', '==', null)
      .limit(1)
      .get();

    const hasActiveCrop = !snapshot.empty;
    let currentCrop = hasActiveCrop ? snapshot.docs[0].data() : null;
    if (hasActiveCrop) {
        currentCrop.id = snapshot.docs[0].id;
    }

    // If includeLast=true, also fetch the most recently cancelled/harvested crop
    let lastCancelledCrop = null;
    if (includeLast) {
      const lastSnap = await firestore.collection('planted_crops')
        .where('userId', '==', req.session.user.uid)
        .where('endDate', '!=', null)
        .orderBy('endDate', 'desc')
        .limit(1)
        .get();
      if (!lastSnap.empty) {
        lastCancelledCrop = lastSnap.docs[0].data();
        lastCancelledCrop.id = lastSnap.docs[0].id;
      }
    }

    res.json({ 
      hasActiveCrop,
      currentCrop,
      lastCancelledCrop
    });
  } catch (error) {
    console.error("Error checking active crop:", error);
    res.status(500).json({ error: "Failed to check active crops" });
  }
};

// Harvest current crop
exports.harvestCurrentCrop = async (req, res) => {
  try {
    console.log('==== HARVEST CROP DEBUG START ====');
    const { 
      harvestQuantity, 
      harvestSuccessRate, 
      harvestQuality, 
      harvestMethod, 
      harvestDate, 
      harvestTime, 
      harvestNotes, 
      harvestChallenges 
    } = req.body;
    
    console.log('Harvest request body:', { 
      harvestQuantity, 
      harvestSuccessRate, 
      harvestQuality, 
      harvestMethod, 
      harvestDate, 
      harvestTime, 
      harvestNotes, 
      harvestChallenges 
    });

    if (!req.session.user?.uid) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Validation
    if (!harvestQuantity || harvestQuantity <= 0) {
      return res.status(400).json({ error: "Invalid harvest quantity" });
    }

    if (!harvestSuccessRate || harvestSuccessRate < 0 || harvestSuccessRate > 100) {
      return res.status(400).json({ error: "Invalid success rate" });
    }

    if (!harvestQuality) {
      return res.status(400).json({ error: "Harvest quality is required" });
    }

    if (!harvestDate || !harvestTime) {
      return res.status(400).json({ error: "Harvest date and time are required" });
    }

    // Find active crop
    const snapshot = await firestore.collection('planted_crops')
      .where('endDate', '==', null)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({ error: "No active crop found" });
    }

    const cropRef = snapshot.docs[0].ref;
    const cropDoc = snapshot.docs[0];
    const cropData = cropDoc.data();
    console.log('Crop doc data:', cropData);

    // Disable irrigation schedules for this crop
    try {
      const irrigationSchedulesSnap = await firestore.collection('irrigation_schedules')
        .get();
      
      if (!irrigationSchedulesSnap.empty) {
        const batch = firestore.batch();
        irrigationSchedulesSnap.docs.forEach(doc => {
          batch.update(doc.ref, { isActive: false });
        });
        await batch.commit();
        console.log(`Disabled ${irrigationSchedulesSnap.size} irrigation schedules for crop ${cropDoc.id}`);
      }
    } catch (error) {
      console.error('Error disabling irrigation schedules:', error);
    }

    // Disable automation state in realtime database
    try {
      await realtimeDB.ref('automationState').update({ enabled: false });
      console.log('Disabled automation state in realtime database');
    } catch (error) {
      console.error('Error disabling automation state:', error);
    }

    // Create harvest timestamp
    const harvestDateTime = new Date(`${harvestDate}T${harvestTime}`);
    const harvestTimestamp = admin.firestore.Timestamp.fromDate(harvestDateTime);

    // Update with harvest data
    const endDate = admin.firestore.Timestamp.now();
    await cropRef.update({
      endDate: endDate,
      status: 'harvested',
      harvestQuantity: harvestQuantity,
      harvestSuccessRate: harvestSuccessRate,
      harvestQuality: harvestQuality,
      harvestMethod: harvestMethod,
      harvestDate: harvestTimestamp,
      harvestNotes: harvestNotes || null,
      harvestChallenges: harvestChallenges || null,
      isTrained: false,
      endUserID: req.session.user.uid || null,
      endUserName: req.session.user.name || null
    });

    // Update success rate in crops collection
    try {
      await updateCropSuccessRate(cropData.name, harvestSuccessRate);
      console.log(`Updated success rate for crop: ${cropData.name}`);
    } catch (error) {
      console.error('Error updating crop success rate:', error);
      // Don't fail the harvest if this update fails
    }

    // Summarize daily_sensor_summaries for this crop between startDate and endDate
    const cropStartDate = cropData.startDate;
    console.log('Summarizing for cropId:', cropDoc.id, 'from', cropStartDate, 'to', endDate);
    const summariesSnap = await firestore.collection('daily_sensor_summaries')
      .where('timestamp', '>=', cropStartDate)
      .where('timestamp', '<=', endDate)
      .get();
    console.log('Found', summariesSnap.size, 'summaries');

    const sensorParams = ['humidity', 'light', 'moistureAve', 'nitrogen', 'ph', 'phosphorus', 'potassium', 'temperature'];
    let paramSums = {};
    let paramCounts = {};
    sensorParams.forEach(param => {
      paramSums[param] = 0;
      paramCounts[param] = 0;
    });

    if (!summariesSnap.empty) {
      summariesSnap.docs.forEach(doc => {
        const data = doc.data();
        sensorParams.forEach(param => {
          if (data[param] && typeof data[param].average === 'number') {
            paramSums[param] += data[param].average;
            paramCounts[param] += 1;
          }
        });
      });
    }

    let avgSummary = {};
    sensorParams.forEach(param => {
      avgSummary[param] = paramCounts[param] > 0 ? paramSums[param] / paramCounts[param] : null;
    });
    console.log('Final sensor summary:', avgSummary);

    // Save to crop document (even if empty)
    await cropRef.update({ finalSensorSummary: avgSummary });
    
    // Get the updated crop data with all fields for PDF generation
    const updatedCropDoc = await cropRef.get();
    const updatedCropData = updatedCropDoc.data();
    updatedCropData.id = cropDoc.id;

    console.log('==== HARVEST CROP DEBUG END ====');
    res.json({ 
      success: true, 
      message: `${cropData.name} harvested successfully`,
      harvestedCrop: updatedCropData,
      previewUrl: `/harvest-preview/${cropDoc.id}`
    });
  } catch (error) {
    console.error("Error harvesting crop:", error);
    res.status(500).json({ error: "Failed to harvest crop" });
  }
};

// Function to update success rate in crops collection
async function updateCropSuccessRate(cropName, newSuccessRate) {
  try {
    console.log(`Updating success rate for crop: ${cropName} with new rate: ${newSuccessRate}%`);
    
    // Find the crop document by name
    const cropSnapshot = await firestore.collection('crops')
      .where('name', '==', cropName)
      .limit(1)
      .get();

    if (cropSnapshot.empty) {
      console.log(`Crop '${cropName}' not found in crops collection`);
      return;
    }

    const cropDoc = cropSnapshot.docs[0];
    const cropData = cropDoc.data();
    
    // Get current values or initialize if they don't exist
    const currentNumberFailed = cropData.numberFailed || 0;
    const currentSuccessRate = cropData.successRate || 0;
    const currentTotalSuccessRate = cropData.totalSuccessRate || 0;
    const currentPlantingCount = cropData.plantingCount || 0;

    // Calculate new values
    const newPlantingCount = currentPlantingCount + 1;
    
    // Determine if this was a successful harvest (success rate >= 50% is considered successful)
    const isSuccessful = newSuccessRate >= 50;
    const newNumberFailed = isSuccessful ? currentNumberFailed : currentNumberFailed + 1;
    
    // Calculate new average success rate
    const newTotalSuccessRate = currentTotalSuccessRate + newSuccessRate;
    const newAverageSuccessRate = newTotalSuccessRate / newPlantingCount;

    // Update the crop document
    await cropDoc.ref.update({
      numberFailed: newNumberFailed,
      successRate: newAverageSuccessRate,
      totalSuccessRate: newTotalSuccessRate,
      plantingCount: newPlantingCount,
      
    });

    

  } catch (error) {
    console.error(`Error updating success rate for crop '${cropName}':`, error);
    throw error;
  }
}

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

// Add API endpoint to fetch AI fertilizer advice
exports.getAIFertilizerAdvice = async (req, res) => {
    try {
        if (!req.session.user?.uid) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        // Get current crop ID
        const cropSnapshot = await firestore.collection('planted_crops')
            .where('userId', '==', req.session.user.uid)
            .where('endDate', '==', null)
            .limit(1)
            .get();

        if (cropSnapshot.empty) {
            return res.json({ success: false, message: "No active crop found" });
        }

        const cropId = cropSnapshot.docs[0].id;

        // Fetch latest AI fertilizer advice
        const fertilizerSnapshot = await firestore.collection('ai_fertilizer_advice')
            .where('cropId', '==', cropId)
            .get();

        if (fertilizerSnapshot.empty) {
            return res.json({ success: false, message: "No fertilizer advice available" });
        }

        // Sort by timestamp in JavaScript to get the latest
        const fertilizerDocs = fertilizerSnapshot.docs;
        fertilizerDocs.sort((a, b) => {
            const aTime = a.data().timestamp?.toDate?.() || new Date(a.data().timestamp?._seconds * 1000);
            const bTime = b.data().timestamp?.toDate?.() || new Date(b.data().timestamp?._seconds * 1000);
            return bTime - aTime; // Descending order
        });

        const fertilizerAdvice = fertilizerDocs[0].data();
        res.json({
            success: true,
            fertilizerAdvice
        });
    } catch (error) {
        console.error('Error fetching AI fertilizer advice:', error);
        res.status(500).json({ error: "Failed to fetch fertilizer advice" });
    }
};

// Add API endpoint to fetch AI disease advice
exports.getAIDiseaseAdvice = async (req, res) => {
    try {
        if (!req.session.user?.uid) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        // Get current crop ID
        const cropSnapshot = await firestore.collection('planted_crops')
            .where('userId', '==', req.session.user.uid)
            .where('endDate', '==', null)
            .limit(1)
            .get();

        if (cropSnapshot.empty) {
            return res.json({ success: false, message: "No active crop found" });
        }

        const cropId = cropSnapshot.docs[0].id;

        // Fetch latest AI disease advice
        const diseaseSnapshot = await firestore.collection('ai_disease_advice')
            .where('cropId', '==', cropId)
            .get();

        if (diseaseSnapshot.empty) {
            return res.json({ success: false, message: "No disease advice available" });
        }

        // Sort by timestamp in JavaScript to get the latest
        const diseaseDocs = diseaseSnapshot.docs;
        diseaseDocs.sort((a, b) => {
            const aTime = a.data().timestamp?.toDate?.() || new Date(a.data().timestamp?._seconds * 1000);
            const bTime = b.data().timestamp?.toDate?.() || new Date(b.data().timestamp?._seconds * 1000);
            return bTime - aTime; // Descending order
        });

        const diseaseAdvice = diseaseDocs[0].data();
        res.json({
            success: true,
            diseaseAdvice
        });
    } catch (error) {
        console.error('Error fetching AI disease advice:', error);
        res.status(500).json({ error: "Failed to fetch disease advice" });
    }
};

// Cancel current crop with reason and sensor summary
exports.cancelCurrentCrop = async (req, res) => {
    try {
        console.log('==== CANCEL CROP DEBUG START ====');
        const { cancelType, cancelReason, otherReason, explanation } = req.body;
        console.log('Cancel request body:', { cancelType, cancelReason, otherReason, explanation });

        if (!cancelType || !cancelReason) {
            console.log('Missing required fields');
            return res.status(400).json({ error: "Missing required fields" });
        }

        // Find the latest active crop (endDate == null), order by startDate desc
        const snapshot = await firestore.collection('planted_crops')
            .where('endDate', '==', null)
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log('No active crop found');
            return res.status(404).json({ error: "No active crop found" });
        }

        const cropRef = snapshot.docs[0].ref;
        const cropDoc = snapshot.docs[0];
        const cropData = cropDoc.data();
        console.log('Crop doc data:', cropData);

        const status = cancelType === 'failed' ? 'failed' : 'cancelled';
        // Compose remark
        let remark = `[${cancelType.toUpperCase()}] ${cancelReason}`;
        if (otherReason && cancelReason === 'other') {
            remark += `: ${otherReason}`;
        }
        if (explanation) {
            remark += ` - ${explanation}`;
        }

        // Disable irrigation schedules for this crop
        try {
            const irrigationSchedulesSnap = await firestore.collection('irrigation_schedules')
                .get();
            
            if (!irrigationSchedulesSnap.empty) {
                const batch = firestore.batch();
                irrigationSchedulesSnap.docs.forEach(doc => {
                    batch.update(doc.ref, { isActive: false });
                });
                await batch.commit();
                console.log(`Disabled ${irrigationSchedulesSnap.size} irrigation schedules for crop ${cropDoc.id}`);
            }
        } catch (error) {
            console.error('Error disabling irrigation schedules:', error);
        }

        // Disable automation state in realtime database
        try {
            await realtimeDB.ref('automationState').update({ enabled: false });
            console.log('Disabled automation state in realtime database');
        } catch (error) {
            console.error('Error disabling automation state:', error);
        }

        // Set endDate and status, and save remark
        const endDate = admin.firestore.Timestamp.now();
        await cropRef.update({
            endDate: endDate,
            status,
            cancelRemark: remark,
            endUserID: req.session.user.uid || null,
            endUserName: req.session.user.name || null
        });

        // Update success rate in crops collection (treat cancelled/failed crops as 0% success)
        try {
          const successRate = 0; // Cancelled/failed crops have 0% success rate
          await updateCropSuccessRate(cropData.name, successRate);
          console.log(`Updated success rate for cancelled/failed crop: ${cropData.name}`);
        } catch (error) {
          console.error('Error updating crop success rate:', error);
          // Don't fail the cancellation if this update fails
        }

        // Summarize daily_sensor_summaries for this crop between startDate and endDate
        const cropStartDate = cropData.startDate;
        console.log('Summarizing for cropId:', cropDoc.id, 'from', cropStartDate, 'to', endDate);
        const summariesSnap = await firestore.collection('daily_sensor_summaries')
            .where('timestamp', '>=', cropStartDate)
            .where('timestamp', '<=', endDate)
            .get();
        console.log('Found', summariesSnap.size, 'summaries');

        const sensorParams = ['humidity', 'light', 'moistureAve', 'nitrogen', 'ph', 'phosphorus', 'potassium', 'temperature'];
        let paramSums = {};
        let paramCounts = {};
        sensorParams.forEach(param => {
            paramSums[param] = 0;
            paramCounts[param] = 0;
        });

        if (!summariesSnap.empty) {
            summariesSnap.docs.forEach(doc => {
                const data = doc.data();
                sensorParams.forEach(param => {
                    if (data[param] && typeof data[param].average === 'number') {
                        paramSums[param] += data[param].average;
                        paramCounts[param] += 1;
                    }
                });
            });
        }

        let avgSummary = {};
        sensorParams.forEach(param => {
            avgSummary[param] = paramCounts[param] > 0 ? paramSums[param] / paramCounts[param] : null;
        });
        console.log('Final sensor summary:', avgSummary);

        // Save to crop document (even if empty)
        await cropRef.update({ finalSensorSummary: avgSummary });
        
        // Get the updated crop data with all fields for PDF generation
        const updatedCropDoc = await cropRef.get();
        const updatedCropData = updatedCropDoc.data();
        updatedCropData.id = cropDoc.id;

        console.log('==== CANCEL CROP DEBUG END ====');
        res.json({ 
            success: true, 
            message: `${cropData.name} ${status} successfully`,
            cancelledCrop: updatedCropData,
            previewUrl: `/cancellation-preview/${cropDoc.id}`
        });
    } catch (error) {
        console.error("Error cancelling crop:", error);
        res.status(500).json({ error: "Failed to cancel crop" });
    }
};

// New endpoint to render cancellation preview page
exports.cancellationPreview = async (req, res) => {
    try {
        const cropId = req.params.cropId;
        
        if (!cropId) {
            return res.status(400).json({ error: "Crop ID is required" });
        }

        // Get the cancelled crop data
        const cropDoc = await firestore.collection('planted_crops').doc(cropId).get();
        
        if (!cropDoc.exists) {
            return res.status(404).json({ error: "Crop not found" });
        }

        const cropData = cropDoc.data();
        cropData.id = cropDoc.id;

        // Render the preview page
        const rolesession = req.session.user?.role;

        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/cancellation-preview', {
            crop: cropData,
            user: req.session.user || {
                name: 'Admin',
                role: 'Admin'
            }
        });
      } else {
        res.render('cancellation-preview', {
          crop: cropData,
          user: req.session.user || {
              name: 'User',
              role: 'User'
          }
      });

      }

        

    } catch (error) {
        console.error("Error rendering cancellation preview:", error);
        res.status(500).json({ error: "Failed to load preview" });
    }
};

// New endpoint to render harvest preview page
exports.harvestPreview = async (req, res) => {
    try {
        const cropId = req.params.cropId;
        
        if (!cropId) {
            return res.status(400).json({ error: "Crop ID is required" });
        }

        // Get the harvested crop data
        const cropDoc = await firestore.collection('planted_crops').doc(cropId).get();
        
        if (!cropDoc.exists) {
            return res.status(404).json({ error: "Crop not found" });
        }

        const cropData = cropDoc.data();
        cropData.id = cropDoc.id;
        const rolesession = req.session.user?.role;

        // Render the preview page
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/harvest-preview', {
            crop: cropData,
            user: req.session.user || {
                name: 'Admin',
                role: 'Admin'
            }
        });
      } else {
        res.render('harvest-preview', {
          crop: cropData,
          user: req.session.user || {
              name: 'User',
              role: 'User'
          }
      });
      }

    } catch (error) {
        console.error("Error rendering harvest preview:", error);
        res.status(500).json({ error: "Failed to load preview" });
    }
};

