const { firestore, admin } = require('../config/firebase');
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
        .where('userId', '==', req.session.user.uid)
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
            numberPlanted: currentNumberPlanted + 1 
          });
        } else {
          // Crop doesn't exist in crops collection, create it with numberPlanted = 1
          await firestore.collection('crops').add({
            name: cropData.name,
            isRegistered: true,
            numberPlanted: 1
          });
        }
      } catch (cropUpdateError) {
        console.error('Error updating crop numberPlanted:', cropUpdateError);
        // Continue with planting even if crop update fails
      }
  
      // Create new planted crop
      const plantedCropRef = firestore.collection('planted_crops').doc();
      await plantedCropRef.set({
        ...cropData,
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

        // Check for active planted crop
        let hasActiveCrop = false;
        if (userId) {
            const plantedSnapshot = await firestore.collection('planted_crops')
                .where('userId', '==', userId)
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
            sensorData
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
                sensorData
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
            sensorData: null
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
            sensorData: null
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
                    lastPlanted: admin.firestore.Timestamp.now()
                });
            } else {
                // Crop doesn't exist in crops collection, create it with numberPlanted = 1
                await firestore.collection('crops').add({
                    name: crop.name,
                    isRegistered: true,
                    numberPlanted: 1,
                    lastPlanted: admin.firestore.Timestamp.now()
                });
            }
        } catch (cropUpdateError) {
            console.error('Error updating crop numberPlanted:', cropUpdateError);
            // Continue with planting even if crop update fails
        }

        // Prepare planted crop data
        const plantedCrop = {
            name: crop.name,
            optimalConditions: crop.optimalConditions || {},
            parameterMatches: crop.parameterMatches || {},
            score: crop.score || crop.ruleBasedScore || null,
            ruleBasedScore: crop.ruleBasedScore || null,
            status: 'active',
            startDate: admin.firestore.FieldValue.serverTimestamp(),
            endDate: null,
            userId: user.uid,
            userEmail: user.email,
            userName: user.name,
            isRegistered: crop.isRegistered || false,
            lastUpdated: crop.lastUpdated || null,
            mlScore: crop.mlScore || null
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

exports.getCropDetails = async (req, res) => {
    try {
        const { cropName } = req.params;
        
        if (!cropName) {
            return res.status(400).json({ success: false, message: 'Crop name is required.' });
        }

        // Get the latest prediction history to access current sensor data
        const snapshot = await firestore.collection('prediction_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            return res.status(404).json({ success: false, message: 'No prediction data available.' });
        }

        const predictionData = snapshot.docs[0].data();
        const sensorData = predictionData.sensorData || {};
        
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
        
        // Create crop object with data from crops collection
        const crop = {
            name: cropName,
            id: cropDoc.id,
            isRegistered: cropData.isRegistered || true,
            optimalConditions: cropData.optimalConditions || getDefaultOptimalConditions(cropName),
            score: 0,
            ruleBasedScore: 0
        };

        // Calculate parameter matches using current sensor data from prediction_history
        const parameterMatches = {};
        const parameterAnalysis = {};
        
        if (sensorData && crop.optimalConditions) {
            const optimal = crop.optimalConditions;
            const current = sensorData;
            
            // Calculate match percentages for each parameter
            const parameters = [
                { key: 'temperature', optimal: optimal.temperature, current: current.temperature },
                { key: 'humidity', optimal: optimal.humidity, current: current.humidity },
                { key: 'moisture', optimal: optimal.moisture, current: current.moisture },
                { key: 'ph', optimal: optimal.ph, current: current.ph },
                { key: 'light', optimal: optimal.light, current: current.light },
                { key: 'nitrogen', optimal: optimal.npk_N, current: current.nitrogen },
                { key: 'phosphorus', optimal: optimal.npk_P, current: current.phosphorus },
                { key: 'potassium', optimal: optimal.npk_K, current: current.potassium }
            ];
            
            parameters.forEach(param => {
                const match = calculateMatch(param.optimal, param.current, param.key);
                parameterMatches[param.key] = match;
                
                // Add detailed analysis
                parameterAnalysis[param.key] = {
                    optimal: param.optimal,
                    current: param.current,
                    match: match,
                    status: getParameterStatus(match),
                    recommendation: getParameterRecommendation(param.key, param.optimal, param.current, match)
                };
            });
        }

        // Calculate overall suitability score
        const matchValues = Object.values(parameterMatches).filter(v => typeof v === 'number');
        const overallMatch = matchValues.length > 0 ? 
            Math.round(matchValues.reduce((a, b) => a + b, 0) / matchValues.length) : 0;

        res.json({
            success: true,
            crop: {
                ...crop,
                parameterMatches,
                parameterAnalysis,
                sensorData,
                cropDetails: cropData,
                overallMatch,
                analysis: {
                    bestParameter: getBestParameter(parameterMatches),
                    worstParameter: getWorstParameter(parameterMatches),
                    criticalIssues: getCriticalIssues(parameterAnalysis),
                    recommendations: getOverallRecommendations(parameterAnalysis)
                }
            }
        });

    } catch (error) {
        console.error('Error getting crop details:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

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
        
        // Update the crop with optimal conditions
        await firestore.collection('crops').doc(cropId).update({
            optimalConditions: optimalConditions,
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

// Helper function to calculate parameter match percentage
function calculateMatch(optimal, current, paramType) {
    if (optimal === undefined || current === undefined) {
        return 0;
    }

    const optimalValue = parseFloat(optimal);
    const currentValue = parseFloat(current);

    if (isNaN(optimalValue) || isNaN(currentValue)) {
        return 0;
    }

    // Define optimal ranges and tolerances for each parameter
    const parameterConfigs = {
        temperature: {
            tolerance: 3, // ±3°C tolerance
            min: 0,
            max: 50,
            unit: '°C',
            criticalRange: 2, // Critical range for 100% match
            goodRange: 5, // Good range for 80%+ match
            acceptableRange: 8 // Acceptable range for 60%+ match
        },
        humidity: {
            tolerance: 8, // ±8% tolerance
            min: 0,
            max: 100,
            unit: '%',
            criticalRange: 5,
            goodRange: 12,
            acceptableRange: 20
        },
        moisture: {
            tolerance: 12, // ±12% tolerance
            min: 0,
            max: 100,
            unit: '%',
            criticalRange: 8,
            goodRange: 15,
            acceptableRange: 25
        },
        ph: {
            tolerance: 0.8, // ±0.8 pH tolerance
            min: 0,
            max: 14,
            unit: '',
            criticalRange: 0.5,
            goodRange: 1.0,
            acceptableRange: 1.5
        },
        light: {
            tolerance: 800, // ±800 lux tolerance
            min: 0,
            max: 10000,
            unit: 'lux',
            criticalRange: 500,
            goodRange: 1200,
            acceptableRange: 2000
        },
        nitrogen: {
            tolerance: 8, // ±8 ppm tolerance
            min: 0,
            max: 100,
            unit: 'ppm',
            criticalRange: 5,
            goodRange: 12,
            acceptableRange: 20
        },
        phosphorus: {
            tolerance: 8, // ±8 ppm tolerance
            min: 0,
            max: 100,
            unit: 'ppm',
            criticalRange: 5,
            goodRange: 12,
            acceptableRange: 20
        },
        potassium: {
            tolerance: 8, // ±8 ppm tolerance
            min: 0,
            max: 100,
            unit: 'ppm',
            criticalRange: 5,
            goodRange: 12,
            acceptableRange: 20
        }
    };

    const config = parameterConfigs[paramType] || parameterConfigs.nitrogen;
    const difference = Math.abs(currentValue - optimalValue);
    
    // Calculate match percentage based on ranges
    let matchPercentage = 0;
    
    if (difference <= config.criticalRange) {
        // Perfect match (95-100%)
        matchPercentage = 100 - (difference / config.criticalRange) * 5;
    } else if (difference <= config.goodRange) {
        // Good match (80-95%)
        const rangeDiff = difference - config.criticalRange;
        const rangeSize = config.goodRange - config.criticalRange;
        matchPercentage = 95 - (rangeDiff / rangeSize) * 15;
    } else if (difference <= config.acceptableRange) {
        // Acceptable match (60-80%)
        const rangeDiff = difference - config.goodRange;
        const rangeSize = config.acceptableRange - config.goodRange;
        matchPercentage = 80 - (rangeDiff / rangeSize) * 20;
    } else if (difference <= config.tolerance) {
        // Poor match (30-60%)
        const rangeDiff = difference - config.acceptableRange;
        const rangeSize = config.tolerance - config.acceptableRange;
        matchPercentage = 60 - (rangeDiff / rangeSize) * 30;
    } else {
        // Very poor match (0-30%)
        const rangeDiff = difference - config.tolerance;
        const maxRange = config.tolerance * 2; // Beyond tolerance
        matchPercentage = Math.max(0, 30 - (rangeDiff / maxRange) * 30);
    }
    
    // Apply additional factors for specific parameters
    switch (paramType) {
        case 'temperature':
            // Temperature is critical for plant growth
            if (currentValue < 10 || currentValue > 40) {
                matchPercentage *= 0.7; // Reduce score for extreme temperatures
            }
            break;
        case 'humidity':
            // Humidity affects transpiration
            if (currentValue < 20 || currentValue > 90) {
                matchPercentage *= 0.8; // Reduce score for extreme humidity
            }
            break;
        case 'moisture':
            // Soil moisture is critical
            if (currentValue < 15 || currentValue > 85) {
                matchPercentage *= 0.6; // Significantly reduce score for extreme moisture
            }
            break;
        case 'ph':
            // pH affects nutrient availability
            if (currentValue < 5.5 || currentValue > 8.5) {
                matchPercentage *= 0.5; // Significantly reduce score for extreme pH
            }
            break;
        case 'light':
            // Light is essential for photosynthesis
            if (currentValue < 1000) {
                matchPercentage *= 0.8; // Reduce score for low light
            }
            break;
        case 'nitrogen':
        case 'phosphorus':
        case 'potassium':
            // NPK nutrients are essential
            if (currentValue < 10) {
                matchPercentage *= 0.7; // Reduce score for very low nutrients
            } else if (currentValue > 80) {
                matchPercentage *= 0.9; // Slightly reduce score for very high nutrients
            }
            break;
    }
    
    return Math.round(Math.max(0, Math.min(100, matchPercentage)));
} 

// Helper function to get parameter status
function getParameterStatus(match) {
    if (match >= 90) return 'excellent';
    if (match >= 80) return 'good';
    if (match >= 60) return 'acceptable';
    if (match >= 40) return 'poor';
    return 'critical';
}

// Helper function to get parameter recommendation
function getParameterRecommendation(paramKey, optimal, current, match) {
    const currentVal = parseFloat(current);
    const optimalVal = parseFloat(optimal);
    
    if (isNaN(currentVal) || isNaN(optimalVal)) {
        return 'No data available';
    }
    
    const difference = currentVal - optimalVal;
    const absDifference = Math.abs(difference);
    
    if (match >= 80) {
        return 'Optimal conditions maintained';
    }
    
    switch (paramKey) {
        case 'temperature':
            if (difference > 0) {
                return `Temperature is ${absDifference.toFixed(1)}°C above optimal. Consider cooling.`;
            } else {
                return `Temperature is ${absDifference.toFixed(1)}°C below optimal. Consider heating.`;
            }
        case 'humidity':
            if (difference > 0) {
                return `Humidity is ${absDifference.toFixed(1)}% above optimal. Consider dehumidification.`;
            } else {
                return `Humidity is ${absDifference.toFixed(1)}% below optimal. Consider humidification.`;
            }
        case 'moisture':
            if (difference > 0) {
                return `Soil moisture is ${absDifference.toFixed(1)}% above optimal. Reduce irrigation.`;
            } else {
                return `Soil moisture is ${absDifference.toFixed(1)}% below optimal. Increase irrigation.`;
            }
        case 'ph':
            if (difference > 0) {
                return `pH is ${absDifference.toFixed(1)} above optimal. Consider acidifying soil.`;
            } else {
                return `pH is ${absDifference.toFixed(1)} below optimal. Consider liming soil.`;
            }
        case 'light':
            if (difference > 0) {
                return `Light intensity is ${absDifference.toFixed(0)} lux above optimal. Consider shading.`;
            } else {
                return `Light intensity is ${absDifference.toFixed(0)} lux below optimal. Consider additional lighting.`;
            }
        case 'nitrogen':
        case 'phosphorus':
        case 'potassium':
            const nutrient = paramKey.charAt(0).toUpperCase() + paramKey.slice(1);
            if (difference > 0) {
                return `${nutrient} is ${absDifference.toFixed(1)} ppm above optimal. Consider reducing fertilization.`;
            } else {
                return `${nutrient} is ${absDifference.toFixed(1)} ppm below optimal. Consider fertilization.`;
            }
        default:
            return 'Parameter needs adjustment';
    }
}

// Helper function to get best parameter
function getBestParameter(parameterMatches) {
    const entries = Object.entries(parameterMatches);
    if (entries.length === 0) return null;
    
    return entries.reduce((a, b) => a[1] > b[1] ? a : b);
}

// Helper function to get worst parameter
function getWorstParameter(parameterMatches) {
    const entries = Object.entries(parameterMatches);
    if (entries.length === 0) return null;
    
    return entries.reduce((a, b) => a[1] < b[1] ? a : b);
}

// Helper function to get critical issues
function getCriticalIssues(parameterAnalysis) {
    const criticalIssues = [];
    
    Object.entries(parameterAnalysis).forEach(([param, analysis]) => {
        if (analysis.match < 40) {
            criticalIssues.push({
                parameter: param,
                issue: analysis.recommendation,
                severity: 'critical'
            });
        } else if (analysis.match < 60) {
            criticalIssues.push({
                parameter: param,
                issue: analysis.recommendation,
                severity: 'warning'
            });
        }
    });
    
    return criticalIssues;
}

// Helper function to get overall recommendations
function getOverallRecommendations(parameterAnalysis) {
    const recommendations = [];
    const criticalCount = Object.values(parameterAnalysis).filter(a => a.match < 40).length;
    const warningCount = Object.values(parameterAnalysis).filter(a => a.match >= 40 && a.match < 60).length;
    
    if (criticalCount > 0) {
        recommendations.push(`Immediate attention required for ${criticalCount} critical parameter(s).`);
    }
    
    if (warningCount > 0) {
        recommendations.push(`${warningCount} parameter(s) need improvement.`);
    }
    
    const avgMatch = Object.values(parameterAnalysis).reduce((sum, a) => sum + a.match, 0) / Object.keys(parameterAnalysis).length;
    
    if (avgMatch >= 80) {
        recommendations.push('Overall conditions are excellent for this crop.');
    } else if (avgMatch >= 60) {
        recommendations.push('Conditions are acceptable but could be improved.');
    } else {
        recommendations.push('Significant improvements needed for optimal growth.');
    }
    
    return recommendations;
} 

// Helper function to get default optimal conditions for common crops
function getDefaultOptimalConditions(cropName) {
    const cropNameLower = cropName.toLowerCase();
    
    // Default optimal conditions for common crops
    const defaultConditions = {
        'tomato': {
            temperature: 25,
            humidity: 65,
            moisture: 70,
            ph: 6.5,
            light: 5000,
            npk_N: 150,
            npk_P: 50,
            npk_K: 200
        },
        'lettuce': {
            temperature: 20,
            humidity: 70,
            moisture: 80,
            ph: 6.0,
            light: 3000,
            npk_N: 100,
            npk_P: 40,
            npk_K: 150
        },
        'cucumber': {
            temperature: 28,
            humidity: 75,
            moisture: 75,
            ph: 6.5,
            light: 4000,
            npk_N: 120,
            npk_P: 60,
            npk_K: 180
        },
        'pepper': {
            temperature: 26,
            humidity: 70,
            moisture: 70,
            ph: 6.0,
            light: 4500,
            npk_N: 140,
            npk_P: 50,
            npk_K: 160
        },
        'carrot': {
            temperature: 22,
            humidity: 65,
            moisture: 75,
            ph: 6.5,
            light: 3500,
            npk_N: 80,
            npk_P: 60,
            npk_K: 120
        },
        'spinach': {
            temperature: 18,
            humidity: 75,
            moisture: 80,
            ph: 6.0,
            light: 2500,
            npk_N: 90,
            npk_P: 45,
            npk_K: 100
        }
    };
    
    // Try to find a match for the crop name
    for (const [key, conditions] of Object.entries(defaultConditions)) {
        if (cropNameLower.includes(key) || key.includes(cropNameLower)) {
            return conditions;
        }
    }
    
    // Return general optimal conditions if no specific match found
    return {
        temperature: 24,
        humidity: 70,
        moisture: 75,
        ph: 6.5,
        light: 4000,
        npk_N: 120,
        npk_P: 50,
        npk_K: 150
    };
} 

