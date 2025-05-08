
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
    const sensorRef = realtimeDB.ref("sensors");

    sensorRef.once("value", async (snapshot) => {
        const data = snapshot.val();
        
        let history = [];
        try {
            const cachedData = await redisClient.lRange(SENSOR_CACHE_KEY, 0, -1);
            history = cachedData.map(entry => JSON.parse(entry)).reverse();
        } catch (err) {
            console.error("Error fetching from Redis:", err);
        }

        // Get latest NPK averages from Firestore
        let npkAverages = { nitrogen: 0, phosphorus: 0, potassium: 0 };
try {
    const snapshot = await admin.firestore()
        .collection('daily_sensor_summaries')
        .orderBy('date', 'desc')
        .limit(1)
        .get();

    console.log('Firestore query executed'); // Debug log
    console.log('Number of documents:', snapshot.size); // Debug log
    
    if (!snapshot.empty) {
        const latestData = snapshot.docs[0].data();
        console.log('Retrieved document data:', latestData); // Debug log
        
        npkAverages = {
            nitrogen: latestData.nitrogen || latestData.N || 0,
            phosphorus: latestData.phosphorus || latestData.P || 0,
            potassium: latestData.potassium || latestData.K || 0
        };
    } else {
        console.log('No documents found in daily_sensor_summaries'); // Debug log
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

        res.render("admin/home", { 
            sensorData,
            sensorHistory: JSON.stringify(history),
            firebaseConfig: {
                apiKey: process.env.FIREBASE_API_KEY,
                projectId: process.env.FIREBASE_PROJECT_ID
            }
        }); 
    });
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

    console.log('New client connected to NPK stream');

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
                console.log('New NPK data detected:', {
                    nitrogen: data.nitrogen?.average,
                    phosphorus: data.phosphorus?.average,
                    potassium: data.potassium?.average
                });
                
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
        console.log('Client disconnected from NPK stream');
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
    

    res.render("admin/irrigation");  
};


exports.userManagement = async (req, res) => {
    

    res.render("admin/user-management");  
};


exports.reportsAnalytics = async (req, res) => {
    

    res.render("admin/reports");  
};