const { realtimeDB, firestore } = require('../config/firebase');
const redis = require('../config/redis');
const admin = require('firebase-admin');
const cron = require('node-cron');

// Cache for sensor data
let sensorDataCache = {
    moisture: null,
    temperature: null,
    lastUpdate: null
};

// Constants for calculations
const MOISTURE_THRESHOLDS = {
    CRITICAL_LOW: 20,
    LOW: 30,
    HIGH: 80,
    CRITICAL_HIGH: 90
};

const TEMPERATURE_THRESHOLDS = {
    CRITICAL_LOW: 10,
    LOW: 15,
    HIGH: 30,
    CRITICAL_HIGH: 35
};

// Function to get moisture status with more granular levels
function getMoistureStatus(moisture) {
    if (moisture < MOISTURE_THRESHOLDS.CRITICAL_LOW) return "Critical (Severe Drought)";
    if (moisture < MOISTURE_THRESHOLDS.LOW) return "Dry (Needs Irrigation)";
    if (moisture >= MOISTURE_THRESHOLDS.LOW && moisture <= MOISTURE_THRESHOLDS.HIGH) return "Normal (Adequate Moisture)";
    if (moisture > MOISTURE_THRESHOLDS.HIGH && moisture <= MOISTURE_THRESHOLDS.CRITICAL_HIGH) return "High (Risk of Waterlogging)";
    return "Critical (Severe Waterlogging)";
}

// Function to get temperature status with more granular levels
function getTemperatureStatus(temperature) {
    if (temperature < TEMPERATURE_THRESHOLDS.CRITICAL_LOW) return "Critical (Severe Cold)";
    if (temperature < TEMPERATURE_THRESHOLDS.LOW) return "Cold (Risk of Frost)";
    if (temperature >= TEMPERATURE_THRESHOLDS.LOW && temperature <= TEMPERATURE_THRESHOLDS.HIGH) return "Optimal";
    if (temperature > TEMPERATURE_THRESHOLDS.HIGH && temperature <= TEMPERATURE_THRESHOLDS.CRITICAL_HIGH) return "Hot (Risk of Heat Stress)";
    return "Critical (Severe Heat)";
}

// Function to get status color based on value and type
function getStatusColor(type, value) {
    const thresholds = type === 'moisture' ? MOISTURE_THRESHOLDS : TEMPERATURE_THRESHOLDS;
    
    if (value < thresholds.CRITICAL_LOW || value > thresholds.CRITICAL_HIGH) return 'danger';
    if (value < thresholds.LOW || value > thresholds.HIGH) return 'warning';
    return 'success';
}

// Function to compute crop health score and status based on sensor summaries and optimal conditions
function computeCropHealth(sensorSummary, optimalConditions) {
    if (!sensorSummary || !optimalConditions) {
        return { score: null, status: 'Unknown' };
    }

    let totalScore = 0;
    let factors = 0;

    // Temperature score (0-100)
    const temp = Number(sensorSummary.temperature?.average);
    const tempOptimal = Number(optimalConditions.temperature);
    if (!isNaN(temp) && !isNaN(tempOptimal)) {
        const tempDiff = Math.abs(temp - tempOptimal);
        const tempScore = Math.max(0, 100 - (tempDiff * 5)); // 5 points deduction per degree difference
        totalScore += tempScore;
        factors++;
    }

    // Humidity score (0-100)
    const humidity = Number(sensorSummary.humidity?.average);
    const humidityOptimal = Number(optimalConditions.humidity);
    if (!isNaN(humidity) && !isNaN(humidityOptimal)) {
        const humidityDiff = Math.abs(humidity - humidityOptimal);
        const humidityScore = Math.max(0, 100 - (humidityDiff * 2)); // 2 points deduction per percentage difference
        totalScore += humidityScore;
        factors++;
    }

    // Moisture score (0-100)
    const moisture = Number(sensorSummary.moistureAve?.average);
    const moistureOptimal = Number(optimalConditions.moisture);
    if (!isNaN(moisture) && !isNaN(moistureOptimal)) {
        const moistureDiff = Math.abs(moisture - moistureOptimal);
        const moistureScore = Math.max(0, 100 - (moistureDiff * 2)); // 2 points deduction per percentage difference
        totalScore += moistureScore;
        factors++;
    }

    // pH score (0-100)
    const ph = Number(sensorSummary.ph?.average);
    const phOptimal = Number(optimalConditions.ph);
    if (!isNaN(ph) && !isNaN(phOptimal)) {
        const phDiff = Math.abs(ph - phOptimal);
        const phScore = Math.max(0, 100 - (phDiff * 20)); // 20 points deduction per pH unit difference
        totalScore += phScore;
        factors++;
    }

    // NPK scores (0-100 each, averaged)
    const n = Number(sensorSummary.nitrogen?.average);
    const nOptimal = Number(optimalConditions.npk_N);
    const p = Number(sensorSummary.phosphorus?.average);
    const pOptimal = Number(optimalConditions.npk_P);
    const k = Number(sensorSummary.potassium?.average);
    const kOptimal = Number(optimalConditions.npk_K);

    let npkScore = 0;
    let npkFactors = 0;

    if (!isNaN(n) && !isNaN(nOptimal)) {
        const nDiff = Math.abs(n - nOptimal);
        const nScore = Math.max(0, 100 - (nDiff * 2));
        npkScore += nScore;
        npkFactors++;
    }

    if (!isNaN(p) && !isNaN(pOptimal)) {
        const pDiff = Math.abs(p - pOptimal);
        const pScore = Math.max(0, 100 - (pDiff * 2));
        npkScore += pScore;
        npkFactors++;
    }

    if (!isNaN(k) && !isNaN(kOptimal)) {
        const kDiff = Math.abs(k - kOptimal);
        const kScore = Math.max(0, 100 - (kDiff * 2));
        npkScore += kScore;
        npkFactors++;
    }

    if (npkFactors > 0) {
        totalScore += npkScore / npkFactors;
        factors++;
    }

    const overallScore = factors > 0 ? Math.round(totalScore / factors) : 0;
    let status;
    // Define health status based on overall score
    if (overallScore >= 75) status = 'Good'; // Excellent conditions
    else if (overallScore >= 50) status = 'Warning'; // Needs attention
    else status = 'Critical'; // Immediate action required

    return { score: overallScore, status };
}

// Add these new functions for automation control
async function checkAndStartAutomatedIrrigation(moisture, optimalMoisture) {
    // Calculate the threshold (5-7% below optimal)
    const threshold = optimalMoisture - (Math.random() * 2 + 5); // Random value between 5-7%
    
    if (moisture < threshold) {
        try {
            // Create new irrigation record
            const irrigationRef = firestore.collection('irrigation_records');
            await irrigationRef.add({
                startTime: admin.firestore.FieldValue.serverTimestamp(),
                endTime: null,
                duration: 0,
                moistureBefore: moisture,
                moistureAfter: null,
                date: admin.firestore.FieldValue.serverTimestamp(),
                note: 'Automated irrigation',
                status: 'in_progress'
            });

            // Set automation trigger to true to start irrigation
            await realtimeDB.ref('/automation').set({
                enabled: true,
                optimalMoisture: optimalMoisture
            });

            console.log('Automated irrigation triggered - Moisture below threshold');
        } catch (error) {
            console.error('Error starting automated irrigation:', error);
        }
    }else if (optimalMoisture -2 < moisture) {
        try {
            
            // Set automation trigger to true to start irrigation
            await realtimeDB.ref('/automation').set({
                enabled: false,
                optimalMoisture: optimalMoisture
            });

            console.log('Automated irrigation triggered - Moisture below threshold');
        } catch (error) {
            console.error('Error starting automated irrigation:', error);
        }
    }

}

// Add function to handle automation state changes
async function handleAutomationStateChange(snapshot) {
    const data = snapshot.val();
    if (data === null) return;

    // If automation is disabled, check if there's an ongoing irrigation
    if (!data.enabled) {
        try {
            const irrigationRef = firestore.collection('irrigation_records');
            // Get all records with null endTime
            const irrigationSnapshot = await irrigationRef
                .where('endTime', '==', null)
                .get();

            if (!irrigationSnapshot.empty) {
                // Get current moisture value
                const sensorSnapshot = await realtimeDB.ref('/sensors').once('value');
                const sensorData = sensorSnapshot.val();
                const currentMoisture = sensorData?.moistureAve || null;

                if (currentMoisture !== null) {
                    // Update all records that don't have an end time
                    const batch = firestore.batch();
                    const endTime = new Date();
                    
                    irrigationSnapshot.docs.forEach(doc => {
                        const record = doc.data();
                        // Get the start time from the record
                        const startTime = record.startTime.toDate();
                        
                        // Calculate duration in minutes
                        const durationMs = endTime.getTime() - startTime.getTime();
                        const durationMinutes = Math.round(durationMs / (1000 * 60));
                        
                        console.log('Duration calculation:', {
                            startTime: startTime.toISOString(),
                            endTime: endTime.toISOString(),
                            durationMs,
                            durationMinutes
                        });

                        batch.update(doc.ref, {
                            endTime: admin.firestore.FieldValue.serverTimestamp(),
                            moistureAfter: currentMoisture,
                            status: 'completed',
                            duration: durationMinutes
                        });
                    });
                    await batch.commit();
                    console.log('Updated irrigation records with duration after automation state changed');
                }
            }
        } catch (error) {
            console.error('Error handling automation state change:', error);
        }
    }
}

// Add function to handle automation trigger changes
async function handleAutomationTriggerChange(snapshot) {
    const data = snapshot.val();
    if (data === null) return;

    // If automation trigger is set to false, update the irrigation record
    if (!data.enabled) {
        try {
            const irrigationRef = firestore.collection('irrigation_records');
            // First get all records with null endTime
            const irrigationSnapshot = await irrigationRef
                .where('endTime', '==', null)
                .get();

            if (!irrigationSnapshot.empty) {
                // Get current moisture value
                const sensorSnapshot = await realtimeDB.ref('/sensors').once('value');
                const sensorData = sensorSnapshot.val();
                const currentMoisture = sensorData?.moistureAve || null;

                if (currentMoisture !== null) {
                    // Update all records that don't have an end time
                    const batch = firestore.batch();
                    irrigationSnapshot.docs.forEach(doc => {
                        batch.update(doc.ref, {
                            endTime: admin.firestore.FieldValue.serverTimestamp(),
                            moistureAfter: currentMoisture,
                            status: 'completed'
                        });
                    });
                    await batch.commit();
                    console.log('Updated irrigation records after automation disabled');
                }
            }
        } catch (error) {
            console.error('Error handling automation trigger change:', error);
        }
    }
}

// Function to get current crop information
async function getCurrentCrop() {
    try {
        const cropRef = firestore.collection('planted_crops');
        const cropSnapshot = await cropRef.where('endDate', '==', null).limit(1).get();

        if (cropSnapshot.empty) {
            return null;
        }

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

        // Calculate health score and status based on latest sensor summaries
        let healthScore = null;
        let healthStatus = 'Unknown';
        try {
            const summarySnap = await firestore.collection('sensor_summaries')
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();
            if (!summarySnap.empty && cropData.optimalConditions) {
                const summary = summarySnap.docs[0].data();
                const health = computeCropHealth(summary, cropData.optimalConditions);
                healthScore = health.score;
                healthStatus = health.status;
            }
        } catch (err) {
            console.error('Error computing health score/status:', err);
        }

        return {
            name: cropData.name,
            plantingDate: startDate.toISOString(),
            growthStage: growthStage,
            optimalConditions: cropData.optimalConditions,
            parameterMatches: cropData.parameterMatches,
            score: cropData.score,
            healthScore: healthScore,
            healthStatus: healthStatus
        };
    } catch (error) {
        console.error("Error fetching current crop:", error);
        return null;
    }
}

// Get current soil status
exports.getSoilStatus = async (req, res) => {
    try {
        if (!sensorDataCache.moisture || !sensorDataCache.temperature) {
            const sensorRef = realtimeDB.ref("/sensors");
            const snapshot = await sensorRef.once("value");
            const data = snapshot.val();
            
            console.log("Raw sensor data from Firebase:", data);
            
            if (!data) {
                console.log("No sensor data available in Firebase");
                return res.status(404).json({ error: "No sensor data available" });
            }
            
            console.log("Moisture value from Firebase:", data.moistureAve);
            
            sensorDataCache = {
                moisture: data.moistureAve || 0,
                temperature: data.temperature || 0,
                lastUpdate: new Date()
            };
            
            console.log("Updated sensor cache:", sensorDataCache);
        }

        // Get current crop information
        const currentCrop = await getCurrentCrop();

        const response = {
            moisture: {
                value: sensorDataCache.moisture,
                status: getMoistureStatus(sensorDataCache.moisture),
                color: getStatusColor('moisture', sensorDataCache.moisture)
            },
            temperature: {
                value: sensorDataCache.temperature,
                status: getTemperatureStatus(sensorDataCache.temperature),
                color: getStatusColor('temperature', sensorDataCache.temperature)
            },
            lastUpdate: sensorDataCache.lastUpdate,
            currentCrop: currentCrop
        };

        res.json(response);
    } catch (error) {
        console.error("Error getting soil status:", error);
        res.status(500).json({ error: "Failed to get soil status" });
    }
};

// Modify the toggleAutomation function
exports.toggleAutomation = async (req, res) => {
    try {
        const { enabled } = req.body;
        
        // Update automation state directly
        await realtimeDB.ref('/automationState').set({
            enabled: enabled,
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error toggling automation:', error);
        res.status(500).json({ success: false, error: 'Failed to toggle automation' });
    }
};

// Modify the getAutomationState function
exports.getAutomationState = async (req, res) => {
    try {
        const snapshot = await realtimeDB.ref('/automationState').once('value');
        const data = snapshot.val();
        res.json({ enabled: data?.enabled || false });
    } catch (error) {
        console.error('Error getting automation state:', error);
        res.status(500).json({ error: 'Failed to get automation state' });
    }
};

// Add function to handle automation trigger from Wemos
exports.handleAutomationTrigger = async (req, res) => {
    try {
        const { enabled, moisture } = req.body;
        
        // Update automation trigger state
        await realtimeDB.ref('/automation').set({
            enabled: enabled,
        });

        // If automation is being disabled, update the irrigation record
        if (!enabled) {
            const irrigationRef = firestore.collection('irrigation_records');
            const irrigationSnapshot = await irrigationRef
                .where('endTime', '==', null)
                .get();

            if (!irrigationSnapshot.empty) {
                const batch = firestore.batch();
                irrigationSnapshot.docs.forEach(doc => {
                    batch.update(doc.ref, {
                        endTime: admin.firestore.FieldValue.serverTimestamp(),
                        moistureAfter: moisture,
                        status: 'completed'
                    });
                });
                await batch.commit();
                console.log('Updated irrigation records after Wemos completed irrigation');
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error handling automation trigger:', error);
        res.status(500).json({ success: false, error: 'Failed to handle automation trigger' });
    }
};

// Add function to handle irrigation end state
async function handleIrrigationEnd(snapshot) {
    const data = snapshot.val();
    if (data === null || data.enable === true) return;

    try {
        // Get current moisture value
        const sensorSnapshot = await realtimeDB.ref('/sensors').once('value');
        const sensorData = sensorSnapshot.val();
        const currentMoisture = sensorData?.moistureAve || null;

        if (currentMoisture !== null) {
            // Update irrigation record in Firestore
            const irrigationRef = firestore.collection('irrigation_records');
            const irrigationSnapshot = await irrigationRef
                .where('endTime', '==', null)
                .get();

            if (!irrigationSnapshot.empty) {
                const batch = firestore.batch();
                irrigationSnapshot.docs.forEach(doc => {
                    batch.update(doc.ref, {
                        endTime: admin.firestore.FieldValue.serverTimestamp(),
                        moistureAfter: currentMoisture,
                        status: 'completed'
                    });
                });
                await batch.commit();
                console.log('Updated irrigation records after irrigation ended');
            }
        }
    } catch (error) {
        console.error('Error handling irrigation end:', error);
    }
}

// Add function to handle irrigation enable state changes
async function handleIrrigationEnableChange(snapshot) {
    const data = snapshot.val();
    if (data === null || data === true) return; // Only proceed if enable is false

    try {
        // Get current moisture value
        const sensorSnapshot = await realtimeDB.ref('/sensors').once('value');
        const sensorData = sensorSnapshot.val();
        const currentMoisture = sensorData?.moistureAve || null;

        if (currentMoisture !== null) {
            // Update irrigation record in Firestore
            const irrigationRef = firestore.collection('irrigation_records');
            const irrigationSnapshot = await irrigationRef
                .where('endTime', '==', null)
                .get();

            if (!irrigationSnapshot.empty) {
                const batch = firestore.batch();
                irrigationSnapshot.docs.forEach(doc => {
                    batch.update(doc.ref, {
                        endTime: admin.firestore.FieldValue.serverTimestamp(),
                        moistureAfter: currentMoisture,
                        status: 'completed'
                    });
                });
                await batch.commit();
                console.log('Updated irrigation records after irrigation disabled');
            }
        }
    } catch (error) {
        console.error('Error handling irrigation enable change:', error);
    }
}

// Modify the initializeSensorListener function to include the new listener
function initializeSensorListener(io) {
    const sensorRef = realtimeDB.ref("/sensors");
    
    // Set up listener for automation state changes
    realtimeDB.ref('/automation').on('value', handleAutomationStateChange);
    
    // Set up listener for automation trigger changes
    realtimeDB.ref('/automation').on('value', handleAutomationTriggerChange);

    // Add listener for irrigation enable state
    realtimeDB.ref('/irrigation/enabled').on('value', handleIrrigationEnableChange);
    
    sensorRef.on("value", async (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.val();
            const moisture = data.moistureAve || null;
            const temperature = data.temperature || null;
            
            if (moisture !== null || temperature !== null) {
                sensorDataCache = {
                    moisture,
                    temperature,
                    lastUpdate: new Date()
                };

                // Check automation state and handle irrigation
                const automationStateSnapshot = await realtimeDB.ref('/automationState').once('value');
                const automationState = automationStateSnapshot.val();

                // Only check for irrigation if automation is enabled
                if (automationState?.enabled) {
                    const currentCrop = await getCurrentCrop();
                    if (currentCrop) {
                        await checkAndStartAutomatedIrrigation(moisture, currentCrop.optimalConditions.moisture);
                    }
                }
                
                // Emit real-time updates to connected clients if any are connected
                if (io) {
                    io.emit('sensorUpdate', {
                        moisture: {
                            value: moisture,
                            status: getMoistureStatus(moisture),
                            color: getStatusColor('moisture', moisture)
                        },
                        temperature: {
                            value: temperature,
                            status: getTemperatureStatus(temperature),
                            color: getStatusColor('temperature', temperature)
                        },
                        lastUpdate: sensorDataCache.lastUpdate
                    });
                }
                
                
            }
        }
    }, (error) => {
        console.error("Error listening to sensor data:", error);
    });
}

// Initialize the sensor listener when the controller is loaded
let io;
exports.initializeSocket = (socketIO) => {
    io = socketIO;
    initializeSensorListener(io);
    initializeScheduleChecker();
    initializeIrrigationListener();
};

// Add function to handle manual irrigation trigger
exports.handleManualTrigger = async (req, res) => {
    try {
        const { enabled, duration } = req.body;
        
        // Update manual trigger in Realtime DB
        await realtimeDB.ref('/irrigation').set({
            enabled: enabled,
            duration: duration,
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error handling manual trigger:', error);
        res.status(500).json({ success: false, error: 'Failed to handle manual trigger' });
    }
};

// Add function to handle stop trigger
exports.handleStopTrigger = async (req, res) => {
    try {
        const { enabled } = req.body;
        
        // Update stop trigger in Realtime DB
        await realtimeDB.ref('/stop').set({
            enabled: enabled,
        });

        // Get current moisture value
        const sensorSnapshot = await realtimeDB.ref('/sensors').once('value');
        const sensorData = sensorSnapshot.val();
        const currentMoisture = sensorData?.moistureAve || null;

        // Update irrigation record in Firestore
        if (currentMoisture !== null) {
            const irrigationRef = firestore.collection('irrigation_records');
            const irrigationSnapshot = await irrigationRef
                .where('endTime', '==', null)
                .get();

            if (!irrigationSnapshot.empty) {
                const batch = firestore.batch();
                irrigationSnapshot.docs.forEach(doc => {
                    const record = doc.data();
                    // Get the start time from the record
                    const startTime = record.startTime.toDate();
                    const endTime = new Date();
                    
                    // Calculate duration in minutes
                    const durationMs = endTime.getTime() - startTime.getTime();
                    const durationMinutes = Math.round(durationMs / (1000 * 60));

                    batch.update(doc.ref, {
                        endTime: admin.firestore.FieldValue.serverTimestamp(),
                        moistureAfter: currentMoisture,
                        status: 'stopped',
                    });
                });
                await batch.commit();
                console.log('Updated irrigation records after manual stop');
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error handling stop trigger:', error);
        res.status(500).json({ success: false, error: 'Failed to handle stop trigger' });
    }
};

// Add function to create irrigation record
exports.createIrrigationRecord = async (req, res) => {
    try {
        const { startTime, moistureBefore, duration, note } = req.body;
        
        // Create new irrigation record with null/0 values for end metrics
        const irrigationRef = firestore.collection('irrigation_records');
        await irrigationRef.add({
            startTime: admin.firestore.FieldValue.serverTimestamp(),
            endTime: null,
            moistureBefore: moistureBefore,
            moistureAfter: null,
            duration: duration || 0, // Use the provided duration or default to 0
            date: admin.firestore.FieldValue.serverTimestamp(),
            note: note,
            status: 'in_progress'
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error creating irrigation record:', error);
        res.status(500).json({ success: false, error: 'Failed to create irrigation record' });
    }
};

// Function to save irrigation schedule
exports.saveIrrigationSchedule = async (req, res) => {
    try {
        const { time, duration, days } = req.body;
        
        // Validate time format (HH:mm)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid time format. Use HH:mm format' 
            });
        }

        // Validate duration is a positive integer
        const durationInt = parseInt(duration);
        if (isNaN(durationInt) || durationInt <= 0 || durationInt > 60) {
            return res.status(400).json({
                success: false,
                error: 'Duration must be a positive integer between 1 and 60 minutes'
            });
        }

        // Create schedule record in Firestore
        const scheduleRef = firestore.collection('irrigation_schedules');
        const scheduleDoc = await scheduleRef.add({
            time: time,
            duration: durationInt, // Store as integer
            days: days || [], // Array of days (0-6, where 0 is Sunday)
            isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update Redis with the next schedule
        await updateNextScheduleInRedis();

        res.json({ 
            success: true, 
            scheduleId: scheduleDoc.id 
        });
    } catch (error) {
        console.error('Error saving irrigation schedule:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to save irrigation schedule' 
        });
    }
};

// Function to get all irrigation schedules
exports.getIrrigationSchedules = async (req, res) => {
    try {
        const scheduleRef = firestore.collection('irrigation_schedules');
        const snapshot = await scheduleRef.get(); // Remove the where clause to get all schedules
        
        const schedules = [];
        snapshot.forEach(doc => {
            schedules.push({
                id: doc.id,
                ...doc.data()
            });
        });

        res.json({ 
            success: true, 
            schedules: schedules 
        });
    } catch (error) {
        console.error('Error getting irrigation schedules:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get irrigation schedules' 
        });
    }
};

// Function to update next schedule in Redis
async function updateNextScheduleInRedis() {
    try {
        const scheduleRef = firestore.collection('irrigation_schedules');
        const snapshot = await scheduleRef.where('isActive', '==', true).get();
        
        const now = new Date();
        let nextSchedule = null;
        let minTimeDiff = Infinity;

        snapshot.forEach(doc => {
            const schedule = doc.data();
            const [hours, minutes] = schedule.time.split(':').map(Number);
            
            // Create Date object for today with the schedule time
            const scheduleTime = new Date(now);
            scheduleTime.setHours(hours, minutes, 0, 0);

            // If the time has passed today, check for next occurrence
            if (scheduleTime <= now) {
                scheduleTime.setDate(scheduleTime.getDate() + 1);
            }

            // Find the next scheduled day
            let daysToAdd = 0;
            const currentDay = scheduleTime.getDay();
            
            // If today is not a scheduled day, find the next scheduled day
            if (!schedule.days.includes(currentDay)) {
                // Look for the next scheduled day within the next 7 days
                for (let i = 1; i <= 7; i++) {
                    const nextDay = (currentDay + i) % 7;
                    if (schedule.days.includes(nextDay)) {
                        daysToAdd = i;
                        break;
                    }
                }
                scheduleTime.setDate(scheduleTime.getDate() + daysToAdd);
            }

            const timeDiff = scheduleTime - now;
            if (timeDiff < minTimeDiff) {
                minTimeDiff = timeDiff;
                nextSchedule = {
                    id: doc.id,
                    time: schedule.time,
                    duration: schedule.duration,
                    days: schedule.days,
                    nextOccurrence: scheduleTime
                };
            }
        });

        if (nextSchedule) {
            await redis.set('next_irrigation_schedule', JSON.stringify(nextSchedule));
            console.log('Updated next irrigation schedule in Redis:', nextSchedule);
        } else {
            // If no active schedules, remove the next schedule from Redis
            await redis.del('next_irrigation_schedule');
            console.log('No active schedules found, removed next schedule from Redis');
        }
    } catch (error) {
        console.error('Error updating next schedule in Redis:', error);
    }
}

// Function to check and trigger scheduled irrigation
async function checkScheduledIrrigation() {
    try {
        const scheduleData = await redis.get('next_irrigation_schedule');
        if (!scheduleData) {
            await updateNextScheduleInRedis();
            return;
        }

        const schedule = JSON.parse(scheduleData);
        const now = new Date();
        const nextOccurrence = new Date(schedule.nextOccurrence);

        // If it's time for irrigation
        if (now >= nextOccurrence) {
            // Verify the schedule is still active
            const scheduleRef = firestore.collection('irrigation_schedules').doc(schedule.id);
            const scheduleDoc = await scheduleRef.get();
            
            if (!scheduleDoc.exists || !scheduleDoc.data().isActive) {
                // If schedule is no longer active, update Redis and return
                await updateNextScheduleInRedis();
                return;
            }

            const scheduleData = scheduleDoc.data();
            const currentDay = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

            // Check if today is one of the scheduled days
            if (!scheduleData.days.includes(currentDay)) {
                // If today is not a scheduled day, update Redis and return
                await updateNextScheduleInRedis();
                return;
            }

            // Update Realtime Database to start irrigation
            await realtimeDB.ref('/irrigation').set({
                enabled: true,
                duration: schedule.duration
            });

            // Create irrigation record
            const sensorSnapshot = await realtimeDB.ref('/sensors').once('value');
            const sensorData = sensorSnapshot.val();
            const currentMoisture = sensorData?.moistureAve || null;

            if (currentMoisture !== null) {
                const irrigationRef = firestore.collection('irrigation_records');
                await irrigationRef.add({
                    startTime: admin.firestore.FieldValue.serverTimestamp(),
                    endTime: null,
                    moistureBefore: currentMoisture,
                    moistureAfter: null,
                    duration: schedule.duration,
                    date: admin.firestore.FieldValue.serverTimestamp(),
                    note: 'Scheduled irrigation',
                    status: 'in_progress'
                });
            }

            // Update Redis with next schedule
            await updateNextScheduleInRedis();
        }
    } catch (error) {
        console.error('Error checking scheduled irrigation:', error);
    }
}

// Initialize schedule checker
function initializeScheduleChecker() {
    // Check every minute
    cron.schedule('* * * * *', checkScheduledIrrigation);
    
    // Initial check
    checkScheduledIrrigation();
}

// Function to toggle irrigation schedule status
exports.toggleIrrigationSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        const scheduleRef = firestore.collection('irrigation_schedules').doc(id);
        await scheduleRef.update({
            isActive: isActive
        });

        // Update Redis cache
        await updateNextScheduleInRedis();

        res.json({ success: true });
    } catch (error) {
        console.error('Error toggling irrigation schedule:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to toggle irrigation schedule' 
        });
    }
};

// Function to delete irrigation schedule
exports.deleteIrrigationSchedule = async (req, res) => {
    try {
        const { id } = req.params;

        const scheduleRef = firestore.collection('irrigation_schedules').doc(id);
        await scheduleRef.delete();

        // Update Redis cache
        await updateNextScheduleInRedis();

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting irrigation schedule:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to delete irrigation schedule' 
        });
    }
};

// Function to update irrigation schedule
exports.updateIrrigationSchedule = async (req, res) => {
    try {
        const { id } = req.params;
        const { time, duration } = req.body;
        
        // Validate time format (HH:mm)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(time)) {
            return res.status(400).json({ 
                success: false, 
                error: 'Invalid time format. Use HH:mm format' 
            });
        }

        // Validate duration is a positive integer
        const durationInt = parseInt(duration);
        if (isNaN(durationInt) || durationInt <= 0 || durationInt > 60) {
            return res.status(400).json({
                success: false,
                error: 'Duration must be a positive integer between 1 and 60 minutes'
            });
        }

        // Get the current schedule to preserve other fields
        const scheduleRef = firestore.collection('irrigation_schedules').doc(id);
        const scheduleDoc = await scheduleRef.get();
        
        if (!scheduleDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Schedule not found'
            });
        }

        // Update schedule in Firestore
        await scheduleRef.update({
            time: time,
            duration: durationInt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update Redis with the next schedule
        await updateNextScheduleInRedis();

        res.json({ 
            success: true, 
            message: 'Schedule updated successfully' 
        });
    } catch (error) {
        console.error('Error updating irrigation schedule:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to update irrigation schedule' 
        });
    }
};

// Function to get paginated irrigation history
exports.getIrrigationHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        
        const irrigationRef = firestore.collection('irrigation_records');
        
        // Get total count for pagination
        const totalSnapshot = await irrigationRef.count().get();
        const total = totalSnapshot.data().count;
        
        let query = irrigationRef.orderBy('startTime', 'desc').limit(limit);
        
        // If not first page, get the last document from previous page
        if (page > 1) {
            // Calculate how many documents to skip
            const skipCount = (page - 1) * limit;
            
            // Get the last document from the previous page
            const lastDocSnapshot = await irrigationRef
                .orderBy('startTime', 'desc')
                .limit(skipCount)
                .get();
            
            if (!lastDocSnapshot.empty) {
                const lastDoc = lastDocSnapshot.docs[lastDocSnapshot.docs.length - 1];
                query = query.startAfter(lastDoc);
            }
        }
        
        // Get the records for current page
        const snapshot = await query.get();
        
        const records = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            records.push({
                id: doc.id,
                startTime: data.startTime?.toDate() || null,
                duration: data.duration || 0,
                moistureBefore: data.moistureBefore || 0,
                moistureAfter: data.moistureAfter || 0,
                note: data.note || 'unknown',
                status: data.status || 'unknown'
            });
        });

        res.json({
            success: true,
            records: records,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalRecords: total
            }
        });
    } catch (error) {
        console.error('Error getting irrigation history:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to get irrigation history' 
        });
    }
};

// Function to handle irrigation record updates
function handleIrrigationRecordUpdate(change) {
    if (!io) return;

    try {
        // Get the document data and ID
        const doc = change.doc;
        const data = doc.data();
        const recordId = doc.id;

        // Emit the updated record to all connected clients
        io.emit('irrigationRecordUpdate', {
            id: recordId,
            startTime: data.startTime?.toDate() || null,
            duration: data.duration || 0,
            moistureBefore: data.moistureBefore || 0,
            moistureAfter: data.moistureAfter || 0,
            status: data.status || 'unknown',
            note: data.note || ''
        });
    } catch (error) {
        console.error('Error handling irrigation record update:', error);
    }
}

// Initialize Firestore listener for irrigation records
function initializeIrrigationListener() {
    const irrigationRef = firestore.collection('irrigation_records');
    
    // Listen for changes in irrigation records
    irrigationRef.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === 'modified' || change.type === 'added') {
                handleIrrigationRecordUpdate(change);
            }
        });
    }, (error) => {
        console.error('Error listening to irrigation records:', error);
    });
}