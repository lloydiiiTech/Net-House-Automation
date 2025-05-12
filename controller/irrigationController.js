const { realtimeDB, firestore } = require('../config/firebase');
const redis = require('../config/redis');
const admin = require('firebase-admin');

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
                    irrigationSnapshot.docs.forEach(doc => {
                        batch.update(doc.ref, {
                            endTime: admin.firestore.FieldValue.serverTimestamp(),
                            moistureAfter: currentMoisture,
                            status: 'completed'
                        });
                    });
                    await batch.commit();
                    console.log('Updated irrigation records after automation state changed');
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

        // Calculate expected harvest date (assuming 90 days growth cycle)
        const expectedHarvest = new Date(startDate);
        expectedHarvest.setDate(expectedHarvest.getDate() + 90);

        return {
            name: cropData.name,
            startDate: startDate,
            expectedHarvest: expectedHarvest,
            growthStage: growthStage,
            optimalConditions: cropData.optimalConditions,
            parameterMatches: cropData.parameterMatches,
            score: cropData.score
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
            
            if (!data) {
                return res.status(404).json({ error: "No sensor data available" });
            }
            
            sensorDataCache = {
                moisture: data.moistureAve || null,
                temperature: data.temperature || null,
                lastUpdate: new Date()
            };
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
            lastUpdated: admin.database.ServerValue.TIMESTAMP
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
            lastUpdated: admin.database.ServerValue.TIMESTAMP
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

// Modify the initializeSensorListener function to run independently
function initializeSensorListener(io) {
    const sensorRef = realtimeDB.ref("/sensors");
    
    // Set up listener for automation state changes
    realtimeDB.ref('/automationState').on('value', handleAutomationStateChange);
    
    // Set up listener for automation trigger changes
    realtimeDB.ref('/automation').on('value', handleAutomationTriggerChange);
    
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
                
                console.log("Sensor data updated:", sensorDataCache);
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
    // Start the sensor listener immediately
    initializeSensorListener(io);
};

// Add function to handle manual irrigation trigger
exports.handleManualTrigger = async (req, res) => {
    try {
        const { enabled, duration } = req.body;
        
        // Update manual trigger in Realtime DB
        await realtimeDB.ref('/irrigation').set({
            enabled: enabled,
            duration: duration,
            lastUpdated: admin.database.ServerValue.TIMESTAMP
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
            lastUpdated: admin.database.ServerValue.TIMESTAMP
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
                    batch.update(doc.ref, {
                        endTime: admin.firestore.FieldValue.serverTimestamp(),
                        moistureAfter: currentMoisture,
                        status: 'completed'
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
        
        // Create new irrigation record
        const irrigationRef = firestore.collection('irrigation_records');
        await irrigationRef.add({
            startTime: admin.firestore.FieldValue.serverTimestamp(),
            endTime: null,
            moistureBefore: moistureBefore,
            moistureAfter: null,
            duration: duration,
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