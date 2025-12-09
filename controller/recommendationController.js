const { firestore, admin } = require('../config/firebase');
const TimeSeriesForecaster = require('../services/timeSeriesForecaster');
exports.confirmCropSelection = async (req, res) => {
    try {
      const { cropData } = req.body;
      
      if (!cropData?.name) {
        return res.status(400).json({ error: "Invalid crop data" });
      }
  
      if (!req.session.user?.uid) {
        return res.status(401).json({ error: "Not authenticated" });
      }
  
      // Verify no active crop exists
      const activeCheck = await firestore.collection('planted_crops')
        .where('endDate', '==', null)
        .limit(1)
        .get();
  
      if (!activeCheck.empty) {
        return res.status(400).json({ 
          error: "You already have an active crop. Harvest it first."
        });
      }
  
      // Update numberPlanted in crops collection
      try {
        // Find the crop in the crops collection
        const cropQuery = await firestore.collection('crops')
          .where('name', '==', cropData.name)
          .limit(1)
          .get();
        
        if (!cropQuery.empty) {
          // Crop exists, update numberPlanted
          const cropDoc = cropQuery.docs[0];
          const existingCropData = cropDoc.data();
          const currentNumberPlanted = existingCropData.numberPlanted || 0;
          
          await cropDoc.ref.update({ 
            numberPlanted: currentNumberPlanted + 1,
            lastPlanted: admin.firestore.FieldValue.serverTimestamp()
          });
        } else {
          // Crop doesn't exist in crops collection, create it with numberPlanted = 1
          await firestore.collection('crops').add({
            name: cropData.name,
            isRegistered: true,
            numberPlanted: 1,
            lastPlanted: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (cropUpdateError) {
        console.error('Error updating crop numberPlanted:', cropUpdateError);
        // Continue with planting even if crop update fails
      }
  
      // Convert optimalConditions to numbers if present
      const processedCropData = { ...cropData };
      if (processedCropData.optimalConditions) {
        processedCropData.optimalConditions = {
          temperature: Number(processedCropData.optimalConditions.temperature),
          humidity: Number(processedCropData.optimalConditions.humidity),
          moisture: Number(processedCropData.optimalConditions.moisture),
          ph: Number(processedCropData.optimalConditions.ph),
          light: Number(processedCropData.optimalConditions.light),
          npk_N: Number(processedCropData.optimalConditions.npk_N),
          npk_P: Number(processedCropData.optimalConditions.npk_P),
          npk_K: Number(processedCropData.optimalConditions.npk_K)
        };
      }
  
      // Create new planted crop
      const plantedCropRef = firestore.collection('planted_crops').doc();
      await plantedCropRef.set({
        ...processedCropData,
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        endDate: null,
        status: 'active',
        userId: req.session.user.uid,
        userEmail: req.session.user.email,
        userName: req.session.user.name
      });
  
      res.json({ 
        success: true, 
        plantedCropId: plantedCropRef.id,
        message: `${cropData.name} planted successfully`
      });
    } catch (error) {
      console.error("Error saving planted crop:", error);
      res.status(500).json({ error: "Failed to save crop selection" });
    }
  };
exports.recommendationsPage = async (req, res) => {
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
                    userData.profilePicture = userData.profilePicture || '/assets/img/default-avatar.png';
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        }

        // Fetch latest crop recommendations
        const snapshot = await firestore.collection('prediction_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        let recommendations = [];
        let sensorData = null;
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            const predictions = data.predictions || {};
            recommendations = []
                .concat(predictions.top5Registered || [])
                .concat(predictions.top5Unregistered || [])
                .filter(crop => crop && crop.name)
                .sort((a, b) => (b.score || b.ruleBasedScore || 0) - (a.score || a.ruleBasedScore || 0))
                .slice(0, 5);
            
            // Get sensor data from the latest prediction
            sensorData = data.sensorData || null;
        }

        // Fetch all registered crops
        const cropsSnapshot = await firestore.collection('crops').where('isRegistered', '==', true).get();
        const registeredCrops = cropsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fetch latest forecast data
        let forecast = null;
        try {
            forecast = await TimeSeriesForecaster.getLatestForecast();
        } catch (error) {
            console.error('Error fetching forecast data:', error);
        }

        console.log(forecast);
        // Check for active planted crop
        let hasActiveCrop = false;
        if (userId) {
            const plantedSnapshot = await firestore.collection('planted_crops')
                .where('endDate', '==', null)
                .limit(1)
                .get();
            hasActiveCrop = !plantedSnapshot.empty;
        }
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/recommendations', {
            user: userData || {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            },
            recommendations,
            registeredCrops,
            hasActiveCrop,
            sensorData,
            forecast
        });} else
        {
            res.render('recommendations', {
                user: userData || {
                    name: 'User',
                    role: 'User',
                    profilePicture: '/assets/img/default-avatar.png'
                },
                recommendations,
                registeredCrops,
                hasActiveCrop,
                sensorData,
                forecast
            });}
    } catch (error) {
        console.error('Error rendering recommendations page:', error);
        if(rolesession.toUpperCase() === 'ADMIN'){

        res.render('admin/recommendations', {
            user: {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            },
            recommendations: [],
            registeredCrops: [],
            hasActiveCrop: false,
            sensorData: null,
            forecast: null
        });
    }
    else {
        res.render('recommendations', {
            user: {
                name: 'User',
                role: 'User',
                profilePicture: '/assets/img/default-avatar.png'
            },
            recommendations: [],
            registeredCrops: [],
            hasActiveCrop: false,
            sensorData: null,
            forecast: null
        });
    
    }
    }
};

exports.registerCrop = async (req, res) => {
    try {
        const { cropName } = req.body;
        if (!cropName || typeof cropName !== 'string' || !cropName.trim()) {
            return res.status(400).json({ success: false, message: 'Crop name is required.' });
        }
        const name = cropName.trim();
        // Check if crop exists (case-insensitive)
        const cropQuery = await firestore.collection('crops')
            .where('name', '==', name)
            .limit(1)
            .get();
        if (!cropQuery.empty) {
            // Crop exists, update isRegistered to true
            const cropDoc = cropQuery.docs[0];
            await cropDoc.ref.update({ isRegistered: true });
            return res.json({ success: true, message: 'Crop registered successfully (existing crop updated).' });
        } else {
            // Crop does not exist, create new
            await firestore.collection('crops').add({
                name,
                isRegistered: true,
                numberPlanted: 0
            });
            return res.json({ success: true, message: 'Crop registered successfully (new crop added).' });
        }
    } catch (error) {
        console.error('Error registering crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

exports.updateCrop = async (req, res) => {
    try {
        const { cropId } = req.params;
        const { newName } = req.body;
        if (!cropId || !newName || typeof newName !== 'string' || !newName.trim()) {
            return res.status(400).json({ success: false, message: 'Invalid crop ID or name.' });
        }
        await firestore.collection('crops').doc(cropId).update({ name: newName.trim() });
        return res.json({ success: true, message: 'Crop name updated successfully.' });
    } catch (error) {
        console.error('Error updating crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

exports.deleteCrop = async (req, res) => {
    try {
        const { cropId } = req.params;
        if (!cropId) {
            return res.status(400).json({ success: false, message: 'Invalid crop ID.' });
        }
        await firestore.collection('crops').doc(cropId).update({ isRegistered: false });
        return res.json({ success: true, message: 'Crop unregistered (soft deleted) successfully.' });
    } catch (error) {
        console.error('Error deleting crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

exports.plantCrop = async (req, res) => {
    try {
        const { crop } = req.body;
        const user = req.session.user;
        if (!user || !user.uid) {
            return res.status(401).json({ success: false, message: 'Not authenticated.' });
        }
        if (!crop || !crop.name) {
            return res.status(400).json({ success: false, message: 'Invalid crop data.' });
        }

        // Update numberPlanted in crops collection
        try {
            // Find the crop in the crops collection
            const cropQuery = await firestore.collection('crops')
                .where('name', '==', crop.name)
                .limit(1)
                .get();
            
            if (!cropQuery.empty) {
                // Crop exists, update numberPlanted
                const cropDoc = cropQuery.docs[0];
                const existingCropData = cropDoc.data();
                const currentNumberPlanted = existingCropData.numberPlanted || 0;
                
                await cropDoc.ref.update({ 
                    numberPlanted: currentNumberPlanted + 1,
                    lastPlanted: admin.firestore.FieldValue.serverTimestamp()
                });
            } else {
                // Crop doesn't exist in crops collection, create it with numberPlanted = 1
                await firestore.collection('crops').add({
                    name: crop.name,
                    isRegistered: true,
                    numberPlanted: 1,
                    lastPlanted: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        } catch (cropUpdateError) {
            console.error('Error updating crop numberPlanted:', cropUpdateError);
            // Continue with planting even if crop update fails
        }

        // Convert optimalConditions to numbers if present
        const processedCrop = { ...crop };
        if (processedCrop.optimalConditions) {
            processedCrop.optimalConditions = {
                temperature: Number(processedCrop.optimalConditions.temperature),
                humidity: Number(processedCrop.optimalConditions.humidity),
                moisture: Number(processedCrop.optimalConditions.moisture),
                ph: Number(processedCrop.optimalConditions.ph),
                light: Number(processedCrop.optimalConditions.light),
                npk_N: Number(processedCrop.optimalConditions.npk_N),
                npk_P: Number(processedCrop.optimalConditions.npk_P),
                npk_K: Number(processedCrop.optimalConditions.npk_K)
            };
        }

        // Prepare planted crop data
        const plantedCrop = {
            name: processedCrop.name,
            optimalConditions: processedCrop.optimalConditions || {},
            parameterMatches: processedCrop.parameterMatches || {},
            score: processedCrop.score || processedCrop.ruleBasedScore || null,
            ruleBasedScore: processedCrop.ruleBasedScore || null,
            status: 'active',
            startDate: admin.firestore.FieldValue.serverTimestamp(),
            endDate: null,
            userId: user.uid,
            userEmail: user.email,
            userName: user.name,
            isRegistered: processedCrop.isRegistered || false,
            lastUpdated: processedCrop.lastUpdated || null,
            mlScore: processedCrop.mlScore || null
        };
        await firestore.collection('planted_crops').add(plantedCrop);
        return res.json({ success: true, message: 'Crop planted successfully.' });
    } catch (error) {
        console.error('Error planting crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
}; 

exports.registerCropById = async (req, res) => {
    try {
        const { cropId } = req.params;
        if (!cropId) return res.status(400).json({ success: false, message: 'Crop ID required.' });

        // Update in crops collection
        await firestore.collection('crops').doc(cropId).update({ isRegistered: true });

        // Update in latest prediction_history
        const snapshot = await firestore.collection('prediction_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();
        if (!snapshot.empty) {
            const doc = snapshot.docs[0];
            const data = doc.data();
            let updated = false;
            ['top5Registered', 'top5Unregistered'].forEach(listKey => {
                if (Array.isArray(data.predictions?.[listKey])) {
                    data.predictions[listKey] = data.predictions[listKey].map(crop =>
                        crop.id === cropId ? { ...crop, isRegistered: true } : crop
                    );
                    updated = true;
                }
            });
            if (updated) {
                await doc.ref.update({ predictions: data.predictions });
            }
        }

        res.json({ success: true, message: 'Crop registered successfully.' });
    } catch (error) {
        console.error('Error registering crop by ID:', error);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
}; 

// Add these helper functions from cropPredictionService for consistent computation
function calculateMatch(optimal, actual, paramName = '') {
    // If either side is missing, we truly cannot compute a match
    if (optimal === undefined || optimal === null || actual === undefined || actual === null) {
        return null;
    }

    // If optimal is 0 but sensors have a value, treat it as 0% match
    if (optimal === 0) {
        return 0;
    }

    const absDiff = Math.abs(actual - optimal);
    const ratio = absDiff / optimal; // relative difference

    // Use a smooth decay so we NEVER hit 0 for valid comparisons, just very small %
    const alpha = paramName === 'light' ? 1.5 : 3.0;
    const score = 100 / (1 + alpha * ratio);

    // Return the exact decimal percentage from this function
    return score;
}

function calculateWeightedSuitability(parameterMatches, crop) {
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

function calculateScore(sensorData, crop) {
    const parameterMatches = {
        // Keep human-friendly NPK naming similar to your Firestore example
        npk_N: calculateMatch(crop.optimal_n, sensorData.nitrogen, 'nitrogen'),
        npk_P: calculateMatch(crop.optimal_p, sensorData.phosphorus, 'phosphorus'),
        npk_K: calculateMatch(crop.optimal_k, sensorData.potassium, 'potassium'),
        temperature: calculateMatch(crop.optimal_temperature, sensorData.temperature, 'temperature'),
        humidity: calculateMatch(crop.optimal_humidity, sensorData.humidity, 'humidity'),
        moisture: calculateMatch(crop.optimal_moisture, sensorData.moisture, 'moisture'),
        ph: calculateMatch(crop.optimal_ph, sensorData.ph, 'ph'),
        light: calculateMatch(crop.optimal_light, sensorData.light, 'light')
    };
  
    const suitability = calculateWeightedSuitability(parameterMatches, crop);
  
    return {
        suitability,
        parameterMatches
    };
}

// ...existing code...

exports.getCropDetails = async (req, res) => {
    try {
        const { cropName } = req.params;
        
        if (!cropName) {
            return res.status(400).json({ success: false, message: 'Crop name is required.' });
        }

        // Get the latest prediction history to access current sensor data and top 5 recommendations
        const snapshot = await firestore.collection('prediction_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: 'No prediction data available.' });
        }

        const predictionData = snapshot.docs[0].data();
        const sensorData = predictionData.sensorData || {};
        const predictions = predictionData.predictions || {};
        const top5Registered = predictions.top5Registered || [];
        const top5Unregistered = predictions.top5Unregistered || [];
        
        // Check if the crop is in the top 5 recommendations
        const isInTop5 = [...top5Registered, ...top5Unregistered].some(crop => crop.name === cropName);
        
        // Get crop details from crops collection
        const cropQuery = await firestore.collection('crops')
            .where('name', '==', cropName)
            .limit(1)
            .get();

        if (cropQuery.empty) {
            return res.status(404).json({ success: false, message: 'Crop not found in database.' });
        }

        const cropDoc = cropQuery.docs[0];
        const cropData = cropDoc.data();
        
        // Format lastPlanted timestamp if it exists
        if (cropData.lastPlanted) {
            const date = cropData.lastPlanted.toDate();
            const dateString = date.toLocaleDateString('en-US', { timeZone: 'Etc/GMT-8', year: 'numeric', month: 'long', day: 'numeric' });
            const timeString = date.toLocaleTimeString('en-US', { timeZone: 'Etc/GMT-8', hour: 'numeric', minute: '2-digit', second: '2-digit' });
            cropData.lastPlanted = `${dateString} at ${timeString} UTC+8`;
        }
        
        // Create crop object with data from crops collection
        const crop = {
            name: cropName,
            id: cropDoc.id,
            isRegistered: cropData.isRegistered || true,
            optimalConditions: cropData.optimalConditions,
            score: 0,
            ruleBasedScore: 0
        };

        // Convert optimalConditions to numbers for calculation
        const optimalConditions = cropData.optimalConditions || {};
        const numericOptimal = {
            optimal_n: Number(optimalConditions.npk_N),
            optimal_p: Number(optimalConditions.npk_P),
            optimal_k: Number(optimalConditions.npk_K),
            optimal_temperature: Number(optimalConditions.temperature),
            optimal_humidity: Number(optimalConditions.humidity),
            optimal_moisture: Number(optimalConditions.moisture),
            optimal_ph: Number(optimalConditions.ph),
            optimal_light: Number(optimalConditions.light)
        };

        // Use the same calculateScore logic as cropPredictionService for consistency
        const { suitability, parameterMatches } = calculateScore(sensorData, numericOptimal);

        // Apply penalty if the crop is not in the top 5 recommendations
        let adjustedSuitability = suitability;
        if (!isInTop5) {
            // Penalize by reducing the score by 15-25 points to ensure it's lower than top 5
            const penalty = Math.min(25, Math.max(15, suitability * 0.2)); // Adaptive penalty based on score
            adjustedSuitability = Math.max(0, suitability - penalty);
        }

        res.json({
            success: true,
            crop: {
                ...crop,
                parameterMatches,
                sensorData,
                cropDetails: cropData,
                overallMatch: Math.round(adjustedSuitability)
            }
        });

    } catch (error) {
        console.error('Error getting crop details:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

// ...existing code...

exports.updateCropOptimalConditions = async (req, res) => {
    try {
        const { cropId } = req.params;
        const { optimalConditions } = req.body;
        
        if (!cropId) {
            return res.status(400).json({ success: false, message: 'Crop ID is required.' });
        }
        
        if (!optimalConditions || typeof optimalConditions !== 'object') {
            return res.status(400).json({ success: false, message: 'Valid optimal conditions are required.' });
        }
        
        // Validate optimal conditions
        const requiredFields = ['temperature', 'humidity', 'moisture', 'ph', 'light', 'npk_N', 'npk_P', 'npk_K'];
        const missingFields = requiredFields.filter(field => optimalConditions[field] === undefined);
        
        if (missingFields.length > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Missing required fields: ${missingFields.join(', ')}` 
            });
        }
        
        // Convert optimal conditions to numbers
        const numericOptimalConditions = {
            temperature: Number(optimalConditions.temperature),
            humidity: Number(optimalConditions.humidity),
            moisture: Number(optimalConditions.moisture),
            ph: Number(optimalConditions.ph),
            light: Number(optimalConditions.light),
            npk_N: Number(optimalConditions.npk_N),
            npk_P: Number(optimalConditions.npk_P),
            npk_K: Number(optimalConditions.npk_K)
        };
        
        // Update the crop with optimal conditions
        await firestore.collection('crops').doc(cropId).update({
            optimalConditions: numericOptimalConditions,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        });
        
        res.json({ 
            success: true, 
            message: 'Crop optimal conditions updated successfully.' 
        });
        
    } catch (error) {
        console.error('Error updating crop optimal conditions:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};




