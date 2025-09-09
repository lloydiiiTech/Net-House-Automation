const { realtimeDB, admin, firestore } = require("../config/firebase");
const redisClient = require("../config/redis");

const MAX_HISTORY = 500; // Store last 500 readings
const SENSOR_CACHE_KEY = "sensor_data";
// Cache sensor data in Redis
const cacheSensorData = async (data) => {
    const timestamp = Date.now();
    const sensorData = {
        timestamp,
        temperature: data.temperature,
        humidity: data.humidity,
        moisture: data.moistureAve,
        light: data.light,
        nitrogen: data.nitrogen,
        phosphorus: data.phosphorus,
        potassium: data.potassium,
        ph: data.ph
    };

    try {
        await redisClient.lPush(SENSOR_CACHE_KEY, JSON.stringify(sensorData));
        await redisClient.lTrim(SENSOR_CACHE_KEY, 0, MAX_HISTORY - 1);
        return sensorData;
    } catch (err) {
        console.error("Redis error:", err);
        throw err;
    }
};

// Initialize Firebase listener
exports.initFirebaseListener = (io) => {
    realtimeDB.ref("sensors").on("value", async (snapshot) => {
        const data = snapshot.val();
        
        try {
            const sensorData = await cacheSensorData(data);
            
            // Emit real-time update via WebSocket
            io.emit("sensor_update", {
                ...sensorData,
                statuses: {
                    temperature: getTemperatureStatus(data.temperature),
                    humidity: getHumidityStatus(data.humidity),
                    moisture: getMoistureStatus(data.moistureAve),
                    light: getLightCondition(data.light),
                    nitrogen: getNitrogenStatus(data.nitrogen),
                    phosphorus: getPhosphorusStatus(data.phosphorus),
                    potassium: getPotassiumStatus(data.potassium),
                    ph: getPHStatus(data.ph)
                }
            });
        } catch (err) {
            console.error("Error processing sensor data:", err);
        }
    });
};

// Dashboard controller

exports.Dashboard = async (req, res) => {
    try {
        
        const sensorRef = realtimeDB.ref("sensors");

        // Get sensor data
        const sensorSnapshot = await sensorRef.once("value");
        const data = sensorSnapshot.val();
        
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
        
        // Get crop recommendations
        const predictionSnapshot = await admin.firestore()
            .collection('prediction_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        let recommendations = [];
        if (!predictionSnapshot.empty) {
            const predictionData = predictionSnapshot.docs[0].data();
            const predictions = predictionData.predictions || {};
            recommendations = []
                .concat(predictions.top5Registered || [])
                .concat(predictions.top5Unregistered || [])
                .filter(crop => crop && crop.name)
                .sort((a, b) => (b.score || b.ruleBasedScore || 0) - (a.score || a.ruleBasedScore || 0))
                .slice(0, 5);
        }
        
        // Get crop data
        const cropRef = admin.firestore().collection('planted_crops');
        const cropSnapshot = await cropRef.where('endDate', '==', null).limit(1).get();
        
        let cropData = null;
        if (!cropSnapshot.empty) {
            const cropDoc = cropSnapshot.docs[0];
            const cropInfo = cropDoc.data();

            // Planting date
            const plantingDate = cropInfo.startDate.toDate();

            // Growth stage
            let growthStage = cropInfo.growthStage || 'Seedling';

            // Fetch latest sensor summary for health computation
            let healthScore = null;
            let healthStatus = 'Unknown';
            try {
                const summarySnap = await admin.firestore()
                    .collection('sensor_summaries')
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();
                if (!summarySnap.empty && cropInfo.optimalConditions) {
                    const summary = summarySnap.docs[0].data();
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
                        const optimal = cropInfo.optimalConditions[param.key];
                        const summaryVal = summary[param.summaryKey]?.average;
                        if (typeof optimal === 'number' && typeof summaryVal === 'number') {
                            totalParams++;
                            if (Math.abs(summaryVal - optimal) / optimal <= 0.15) {
                                goodParams++;
                            }
                        }
                    });
                    const ratio = totalParams > 0 ? goodParams / totalParams : 0;
                    healthScore = Math.round(ratio * 100);
                    if (ratio >= 0.75) healthStatus = 'Good';
                    else if (ratio >= 0.5) healthStatus = 'Warning';
                    else healthStatus = 'Critical';
                }
            } catch (err) {
                console.error('Error computing health score/status:', err);
            }

            cropData = {
                name: cropInfo.name,
                plantingDate: plantingDate.toISOString(),
                growthStage: growthStage,
                healthStatus: healthStatus,
                healthScore: healthScore
            };
        } else {
            console.log('No active crop found');
        }

        // Get sensor history
        let history = [];
        try {
            const cachedData = await redisClient.lRange(SENSOR_CACHE_KEY, 0, -1);
            history = cachedData.map(entry => JSON.parse(entry)).reverse();
        } catch (err) {
            console.error("Error fetching from Redis:", err);
        }

        // Get latest NPK averages
        let npkAverages = { nitrogen: 0, phosphorus: 0, potassium: 0 };
        try {
            const snapshot = await admin.firestore()
                .collection('daily_sensor_summaries')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();
            
            if (!snapshot.empty) {
                const latestData = snapshot.docs[0].data();
                npkAverages = {
                    nitrogen: latestData.nitrogen || latestData.N || 0,
                    phosphorus: latestData.phosphorus || latestData.P || 0,
                    potassium: latestData.potassium || latestData.K || 0
                };
            } 
        } catch (err) {
            console.error("Error fetching Firestore NPK data:", err);
        }

        const sensorData = {
            temperature: { value: data.temperature, status: getTemperatureStatus(data.temperature) },
            humidity: { value: data.humidity, status: getHumidityStatus(data.humidity) },
            moisture: { value: data.moistureAve, status: getMoistureStatus(data.moistureAve) },
            light: { value: data.light, status: getLightCondition(data.light) },
            nitrogen: { value: data.nitrogen, status: getNitrogenStatus(data.nitrogen) },
            phosphorus: { value: data.phosphorus, status: getPhosphorusStatus(data.phosphorus) },
            potassium: { value: data.potassium, status: getPotassiumStatus(data.potassium) },
            ph: { value: data.ph, status: getPHStatus(data.ph) },
            npkAverages: npkAverages
        };

        // Fetch the current active crop for the user
        let aiFertilizerAdvice = null;
        let aiDiseaseAdvice = null;
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
                // Fetch latest AI fertilizer advice for the current crop
                try {
                    let fertilizerSnapshot = await firestore.collection('ai_fertilizer_advice')
                        .where('cropId', '==', currentCrop.id)
                        .get();
                    if (fertilizerSnapshot.empty) {
                        fertilizerSnapshot = await firestore.collection('ai_fertilizer_advice')
                            .where('cropName', '==', currentCrop.name)
                            .get();
                    }
                    if (!fertilizerSnapshot.empty) {
                        const fertilizerDocs = fertilizerSnapshot.docs;
                        fertilizerDocs.sort((a, b) => {
                            const aTime = a.data().timestamp?.toDate?.() || new Date(a.data().timestamp?._seconds * 1000);
                            const bTime = b.data().timestamp?.toDate?.() || new Date(b.data().timestamp?._seconds * 1000);
                            return bTime - aTime;
                        });
                        aiFertilizerAdvice = fertilizerDocs[0].data();
                    }
                } catch (error) {
                    console.error('Error fetching AI fertilizer advice:', error);
                }
                // Fetch latest AI disease advice for the current crop
                try {
                    let diseaseSnapshot = await firestore.collection('ai_disease_advice')
                        .where('cropId', '==', currentCrop.id)
                        .get();
                    if (diseaseSnapshot.empty) {
                        diseaseSnapshot = await firestore.collection('ai_disease_advice')
                            .where('cropName', '==', currentCrop.name)
                            .get();
                    }
                    if (!diseaseSnapshot.empty) {
                        const diseaseDocs = diseaseSnapshot.docs;
                        diseaseDocs.sort((a, b) => {
                            const aTime = a.data().timestamp?.toDate?.() || new Date(a.data().timestamp?._seconds * 1000);
                            const bTime = b.data().timestamp?.toDate?.() || new Date(b.data().timestamp?._seconds * 1000);
                            return bTime - aTime;
                        });
                        aiDiseaseAdvice = diseaseDocs[0].data();
                    }
                } catch (error) {
                    console.error('Error fetching AI disease advice:', error);
                }
            }
        }

        
        
        const rolesession = req.session.user?.role;

        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render("admin/home", { 
            user: userData || {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            },
            sensorData,
            sensorHistory: JSON.stringify(history),
            cropData: cropData,
            recommendations: recommendations,
            aiFertilizerAdvice,
            aiDiseaseAdvice,
            firebaseConfig: {
                apiKey: process.env.FIREBASE_API_KEY,
                projectId: process.env.FIREBASE_PROJECT_ID
            }
        }); 
        } else{
            res.render("home", { 
                user: userData || {
                    name: 'Admin',
                    role: 'Admin',
                    profilePicture: '/assets/img/default-avatar.png'
                },
                sensorData,
                sensorHistory: JSON.stringify(history),
                cropData: cropData,
                recommendations: recommendations,
                aiFertilizerAdvice,
                aiDiseaseAdvice,
                firebaseConfig: {
                    apiKey: process.env.FIREBASE_API_KEY,
                    projectId: process.env.FIREBASE_PROJECT_ID
                }
            }); 
        }
    } catch (error) {
        console.error("Error in Dashboard:", error);
        res.status(500).send("Error loading dashboard");
    }
};

exports.getSensorData = async (req, res) => {
    const sensorRef = realtimeDB.ref("sensors");

    sensorRef.once("value", async (snapshot) => {
        const data = snapshot.val();
        
        const sensorData = {
            temperature: { value: data.temperature, status: getTemperatureStatus(data.temperature) },
            humidity: { value: data.humidity, status: getHumidityStatus(data.humidity) },
            moisture: { value: data.moistureAve, status: getMoistureStatus(data.moistureAve) },
            light: { value: data.light, status: getLightCondition(data.light) },
            nitrogen: { value: data.nitrogen, status: getNitrogenStatus(data.nitrogen) },
            phosphorus: { value: data.phosphorus, status: getPhosphorusStatus(data.phosphorus) },
            potassium: { value: data.potassium, status: getPotassiumStatus(data.potassium) },
            ph: { value: data.ph, status: getPHStatus(data.ph) }
        };

        res.json(sensorData);
    });
};

// Add this to your exports
exports.getCachedData = async (req, res) => {
    try {
        const data = await redisClient.lRange(SENSOR_CACHE_KEY, 0, -1);
        const parsedData = data.map(entry => JSON.parse(entry)).reverse();
        res.json(parsedData);
    } catch (err) {
        console.error("Error fetching cached data:", err);
        res.status(500).json({ error: "Failed to fetch cached data" });
    }
};

// Modified getNPKData endpoint to fetch last 2 records
exports.getNPKData = async (req, res) => {
    try {
        const snapshot = await admin.firestore()
            .collection('daily_sensor_summaries')
            .orderBy('timestamp', 'desc')
            .limit(2)  // Get last 2 records
            .get();

        const results = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            results.push({
                nitrogen: data.nitrogen?.average || 0,
                phosphorus: data.phosphorus?.average || 0,
                potassium: data.potassium?.average || 0,
                timestamp: data.timestamp?.toDate()?.toISOString()
            });
        });

        res.json({
            current: results[0] || { nitrogen: 0, phosphorus: 0, potassium: 0 },
            previous: results[1] || results[0] || { nitrogen: 0, phosphorus: 0, potassium: 0 }
        });
    } catch (err) {
        console.error("Error fetching NPK data:", err);
        res.status(500).json({ error: "Failed to fetch NPK data" });
    }
};

// SSE endpoint for real-time updates
exports.npkUpdates = (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();


    const sendInitialData = async () => {
        try {
            const snapshot = await admin.firestore()
                .collection('daily_sensor_summaries')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();

            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                res.write(`data: ${JSON.stringify({
                    nitrogen: data.nitrogen?.average || 0,
                    phosphorus: data.phosphorus?.average || 0,
                    potassium: data.potassium?.average || 0,
                    lastUpdated: data.timestamp?.toDate()?.toISOString()
                })}\n\n`);
            }
        } catch (err) {
            console.error("Error sending initial NPK data:", err);
        }
    };

    // Send initial data immediately
    sendInitialData();

    // Set up Firestore listener
    const unsubscribe = admin.firestore()
        .collection('daily_sensor_summaries')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .onSnapshot((snapshot) => {
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                
                res.write(`data: ${JSON.stringify({
                    nitrogen: data.nitrogen?.average || 0,
                    phosphorus: data.phosphorus?.average || 0,
                    potassium: data.potassium?.average || 0,
                    lastUpdated: data.timestamp?.toDate()?.toISOString()
                })}\n\n`);
            }
        }, (error) => {
            console.error('Firestore listener error:', error);
            res.end();
        });

    // Clean up on client disconnect
    req.on('close', () => {
        unsubscribe();
        res.end();
    });
};

function getNitrogenStatus(n) {
    if (n < 20) return "Very Low (Deficient)";
    if (n >= 20 && n < 40) return "Low (Marginal)";
    if (n >= 40 && n <= 60) return "Normal (Adequate)";
    if (n > 60 && n <= 80) return "High (Sufficient)";
    return "Very High (Excessive)";
}

function getPhosphorusStatus(p) {
    if (p < 10) return "Very Low (Deficient)";
    if (p >= 10 && p < 20) return "Low (Marginal)";
    if (p >= 20 && p <= 40) return "Normal (Adequate)";
    if (p > 40 && p <= 60) return "High (Sufficient)";
    return "Very High (Excessive)";
}

function getPotassiumStatus(k) {
    if (k < 100) return "Very Low (Deficient)";
    if (k >= 100 && k < 200) return "Low (Marginal)";
    if (k >= 200 && k <= 300) return "Normal (Adequate)";
    if (k > 300 && k <= 400) return "High (Sufficient)";
    return "Very High (Excessive)";
}

function getPHStatus(ph) {
    if (ph < 4.5) return "Extremely Acidic";
    if (ph >= 4.5 && ph < 5.5) return "Strongly Acidic";
    if (ph >= 5.5 && ph < 6.5) return "Moderately Acidic";
    if (ph >= 6.5 && ph <= 7.3) return "Neutral (Ideal)";
    if (ph > 7.3 && ph <= 8.4) return "Alkaline";
    return "Strongly Alkaline";
}

function getTemperatureStatus(temp) {
    if (temp < 10) return "Very Low (Cold Stress)";
    if (temp >= 10 && temp < 18) return "Low (Suboptimal)";
    if (temp >= 18 && temp <= 30) return "Normal (Optimal Growth)";
    if (temp > 30 && temp <= 35) return "High (Heat Stress Possible)";
    return "Very High (Extreme Heat Stress)";
}

function getHumidityStatus(humidity) {
    if (humidity < 40) return "Low (Risk of Dehydration)";
    if (humidity >= 40 && humidity <= 70) return "Normal (Ideal)";
    if (humidity > 70 && humidity <= 85) return "High (Risk of Fungal Diseases)";
    return "Very High (High Risk of Diseases)";
}
function getMoistureStatus(moisture) {
    if (moisture < 30) return "Dry (Needs Irrigation)";
    if (moisture >= 30 && moisture <= 80) return "Normal (Adequate Moisture)";
    return "High (Waterlogged - Risk of Root Rot)";
}
function getLightCondition(light) {
    if (light < 10) return "Dark (Night or No Light)";
    if (light >= 10 && light < 100) return "Very Dim (Dawn/Dusk, Indoor Low Light)";
    if (light >= 100 && light < 1000) return "Cloudy (Overcast or Shade)";
    if (light >= 1000 && light < 10000) return "Partly Sunny (Bright but Not Direct Sun)";
    if (light >= 10000 && light < 50000) return "Sunny (Direct Sunlight)";
    return "Very Bright (Extreme Light, Possible Glare)";
}



exports.plantOverview = async (req, res) => {
    

    res.render("admin/plants");  
};


exports.irrigationControll = async (req, res) => {
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
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render("admin/irrigation", {
            user: userData || {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            }
        });} else {
            res.render("irrigation", {
                user: userData || {
                    name: 'User',
                    role: 'User',
                    profilePicture: '/assets/img/default-avatar.png'
                }
            });
        }
    } catch (error) {
        console.error('Error rendering irrigation page:', error);
        if(rolesession.toUpperCase() === 'ADMIN'){
            res.render("admin/irrigation", {
                user: {
                    name: 'Admin',
                    role: 'Admin',
                    profilePicture: '/assets/img/default-avatar.png'
                }
            });
        }else{
            res.render("irrigation", {
                user: {
                    name: 'User',
                    role: 'User',
                    profilePicture: '/assets/img/default-avatar.png'
                }
            });
        }
    }
};


exports.userManagement = async (req, res) => {
    

    res.render("admin/user-management");  
};


exports.reportsAnalytics = async (req, res) => {
    

    res.render("admin/reports");  
};

exports.getCurrentCrop = async (req, res) => {
    try {
        const cropRef = admin.firestore().collection('planted_crops');
        const cropSnapshot = await cropRef.where('endDate', '==', null).limit(1).get();


        if (cropSnapshot.empty) {
            return res.json({ crop: null });
        }

        // Get current sensor data
        const sensorRef = realtimeDB.ref("sensors");
        const sensorSnapshot = await sensorRef.once("value");
        const sensorData = sensorSnapshot.val();

        const cropDoc = cropSnapshot.docs[0];
        const cropData = cropDoc.data();
        
        // Calculate growth stage based on start date
        const startDate = cropData.startDate.toDate();
        const now = new Date();
        const daysSincePlanting = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
        
        let growthStage = "Seedling";
        if (daysSincePlanting > 60) {
            growthStage = "Mature";
        } else if (daysSincePlanting > 40) {
            growthStage = "Flowering";
        } else if (daysSincePlanting > 20) {
            growthStage = "Vegetative";
        }

        // Calculate health score and status based on sensor data
        const healthScore = calculateHealthScore(sensorData, cropData.optimalConditions);
        const healthStatus = getHealthStatus(healthScore);

        const cropInfo = {
            name: cropData.name,
            plantingDate: cropData.startDate.toDate().toISOString(),
            growthStage: growthStage,
            healthStatus: healthStatus,
            score: healthScore,
            optimalConditions: {
                temperature: `${cropData.optimalConditions.temperature}°C`,
                humidity: `${cropData.optimalConditions.humidity}%`,
                moisture: `${cropData.optimalConditions.moisture}%`,
                ph: cropData.optimalConditions.ph,
                npk: {
                    nitrogen: `${cropData.optimalConditions.npk_N} ppm`,
                    phosphorus: `${cropData.optimalConditions.npk_P} ppm`,
                    potassium: `${cropData.optimalConditions.npk_K} ppm`
                }
            }
        };

        res.json({ crop: cropInfo });
    } catch (error) {
        console.error("Error fetching current crop:", error);
        res.status(500).json({ error: "Failed to fetch crop information" });
    }
};

function calculateHealthScore(sensorData, optimalConditions) {
    let totalScore = 0;
    let factors = 0;

    // Temperature score (0-100)
    const tempDiff = Math.abs(sensorData.temperature - parseFloat(optimalConditions.temperature));
    const tempScore = Math.max(0, 100 - (tempDiff * 5)); // 5 points deduction per degree difference
    totalScore += tempScore;
    factors++;

    // Humidity score (0-100)
    const humidityDiff = Math.abs(sensorData.humidity - parseFloat(optimalConditions.humidity));
    const humidityScore = Math.max(0, 100 - (humidityDiff * 2)); // 2 points deduction per percentage difference
    totalScore += humidityScore;
    factors++;

    // Moisture score (0-100)
    const moistureDiff = Math.abs(sensorData.moistureAve - parseFloat(optimalConditions.moisture));
    const moistureScore = Math.max(0, 100 - (moistureDiff * 2)); // 2 points deduction per percentage difference
    totalScore += moistureScore;
    factors++;

    // pH score (0-100)
    const phDiff = Math.abs(sensorData.ph - parseFloat(optimalConditions.ph));
    const phScore = Math.max(0, 100 - (phDiff * 20)); // 20 points deduction per pH unit difference
    totalScore += phScore;
    factors++;

    // NPK scores (0-100 each)
    const npkScore = calculateNPKScore(sensorData, optimalConditions);
    totalScore += npkScore;
    factors++;

    return Math.round(totalScore / factors);
}

function calculateNPKScore(sensorData, optimalConditions) {
    // Nitrogen score
    const nDiff = Math.abs(sensorData.nitrogen - parseFloat(optimalConditions.npk_N));
    const nScore = Math.max(0, 100 - (nDiff * 2));

    // Phosphorus score
    const pDiff = Math.abs(sensorData.phosphorus - parseFloat(optimalConditions.npk_P));
    const pScore = Math.max(0, 100 - (pDiff * 2));

    // Potassium score
    const kDiff = Math.abs(sensorData.potassium - parseFloat(optimalConditions.npk_K));
    const kScore = Math.max(0, 100 - (kDiff * 2));

    return (nScore + pScore + kScore) / 3;
}

function getHealthStatus(score) {
    if (score >= 80) return "Healthy";
    if (score >= 60) return "Moderate";
    return "At Risk";
}