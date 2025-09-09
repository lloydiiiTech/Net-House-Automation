const { realtimeDB } = require('./firebase');

function initializeSocket(io) {
    try {
        // Set up real-time database listener
        if (!realtimeDB) {
            console.error('Firebase Realtime Database not initialized');
            return;
        }

        const sensorRef = realtimeDB.ref('sensors');
        
        sensorRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                // Log the raw data for debugging
                console.log('Raw sensor data:', data);
                
                // Transform the data to match the expected format
                const transformedData = {
                    humidity: Number(data.humidity) || 0,
                    light: Number(data.light) || 0,
                    moisture: Number(data.moistureAve) || 0,
                    nitrogen: Number(data.nitrogen) || 0,
                    ph: Number(data.ph) || 0,
                    phosphorus: Number(data.phosphorus) || 0,
                    potassium: Number(data.potassium) || 0,
                    temperature: Number(data.temperature) || 0
                };
                
                // Log the transformed data for debugging
                
                // Broadcast sensor updates to all connected clients
                io.emit('sensorUpdate', transformedData);
            }
        });

        // Handle client connections
        io.on('connection', (socket) => {
            console.log('Client connected');
            
            // Send initial data when client connects
            sensorRef.once('value', (snapshot) => {
                const data = snapshot.val();
                if (data) {
                    const transformedData = {
                        humidity: Number(data.humidity) || 0,
                        light: Number(data.light) || 0,
                        moisture: Number(data.moistureAve) || 0,
                        nitrogen: Number(data.nitrogen) || 0,
                        ph: Number(data.ph) || 0,
                        phosphorus: Number(data.phosphorus) || 0,
                        potassium: Number(data.potassium) || 0,
                        temperature: Number(data.temperature) || 0
                    };
                    socket.emit('sensorUpdate', transformedData);
                }
            });
            
            socket.on('disconnect', () => {
                console.log('Client disconnected');
            });
        });
    } catch (error) {
        console.error('Error initializing socket:', error);
    }
}

module.exports = initializeSocket; 