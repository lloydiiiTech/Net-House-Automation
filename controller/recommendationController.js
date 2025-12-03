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
        
        // Create crop object with data from crops collection
        const crop = {
            name: cropName,
            id: cropDoc.id,
            isRegistered: cropData.isRegistered || true,
            optimalConditions: cropData.optimalConditions || getDefaultOptimalConditions(cropName),
            score: 0,
            ruleBasedScore: 0
        };

        // Use the same calculateScore logic as cropPredictionService for consistency
        const { suitability, parameterMatches } = calculateScore(sensorData, {
            optimal_n: crop.optimalConditions.npk_N,
            optimal_p: crop.optimalConditions.npk_P,
            optimal_k: crop.optimalConditions.npk_K,
            optimal_temperature: crop.optimalConditions.temperature,
            optimal_humidity: crop.optimalConditions.humidity,
            optimal_moisture: crop.optimalConditions.moisture,
            optimal_ph: crop.optimalConditions.ph,
            optimal_light: crop.optimalConditions.light
        });

        // Apply penalty if the crop is not in the top 5 recommendations
        let adjustedSuitability = suitability;
        if (!isInTop5) {
            // Penalize by reducing the score by 15-25 points to ensure it's lower than top 5
            const penalty = Math.min(25, Math.max(15, suitability * 0.2)); // Adaptive penalty based on score
            adjustedSuitability = Math.max(0, suitability - penalty);
        }

        // Calculate parameter analysis for detailed recommendations
        const parameterAnalysis = {};
        Object.entries(parameterMatches).forEach(([param, match]) => {
            const optimal = crop.optimalConditions[param.replace('npk_', '').toUpperCase()] || crop.optimalConditions[param];
            const current = sensorData[param.replace('npk_', '')] || sensorData[param];
            parameterAnalysis[param] = {
                optimal,
                current,
                match,
                status: getParameterStatus(match),
                recommendation: getParameterRecommendation(param, optimal, current, match)
            };
        });

        res.json({
            success: true,
            crop: {
                ...crop,
                parameterMatches,
                parameterAnalysis,
                sensorData,
                cropDetails: cropData,
                overallMatch: Math.round(adjustedSuitability), // Use adjusted suitability as overallMatch
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

