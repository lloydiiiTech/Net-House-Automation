const { realtimeDB, firestore } = require("../config/firebase.js");
const admin = require('firebase-admin');
const cron = require('node-cron');

// Initialize the scheduled job
exports.initScheduledJobs = () => {
    // Run at 6 AM, 12 PM, 6 PM, and 12 AM
    cron.schedule('0 6,12,18,0 * * *', async () => {
        try {
            await summarizeSensorData();
            console.log('Sensor data summarized successfully');
        } catch (error) {
            console.error('Error summarizing sensor data:', error);
        }
    },{
        timezone: "Asia/Manila" // or your local timezone
    });
    // Test on specific hour 44 as minutes, 21 as 9PM
    // cron.schedule('02 23 * * *', async () => {
    //     try {
    //         await summarizeSensorData();
    //         console.log('Sensor data summarized at 9:40 PM');
    //     } catch (error) {
    //         console.error('Error summarizing sensor data at 9:40 PM:', error);
    //     }
    // }, {
    //     timezone: "Asia/Manila" // or your local timezone
    // });
};





async function summarizeSensorData() {
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);
    
    
    // Query Firestore for data from the last 6 hours
    const snapshot = await firestore.collection('sensors')
        .where('timestamp', '>=', sixHoursAgo)
        .where('timestamp', '<=', now)
        .get();
    
    if (snapshot.empty) {
        console.log('No documents found for the last 6 hours');
        return;
    }
    
    // Initialize summary variables for all parameters
    const parameters = {
        temperature: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        humidity: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        moistureAve: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        light: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        nitrogen: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        phosphorus: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        potassium: { sum: 0, count: 0, min: Infinity, max: -Infinity },
        ph: { sum: 0, count: 0, min: Infinity, max: -Infinity }
    };
    
    // Process each document
    snapshot.forEach(doc => {
        try {
            const data = doc.data();
            
            // Process each parameter
            for (const param in parameters) {
                const value = data[param];
                if (value !== undefined && value !== null && !isNaN(value)) {
                    parameters[param].sum += value;
                    parameters[param].count++;
                    parameters[param].min = Math.min(parameters[param].min, value);
                    parameters[param].max = Math.max(parameters[param].max, value);
                }
            }
        } catch (e) {
            console.error(`Error processing document ${doc.id}:`, e);
        }
    });
    
    // Prepare summary data
    const summaryData = {
        timestamp: now,
        period_start: sixHoursAgo,
        period_end: now,
        data_points: snapshot.size
    };
    
    // Calculate averages for each parameter
    for (const param in parameters) {
        summaryData[param] = {
            average: parameters[param].count > 0 ? 
                    parameters[param].sum / parameters[param].count : null,
            min: parameters[param].min !== Infinity ? parameters[param].min : null,
            max: parameters[param].max !== -Infinity ? parameters[param].max : null,
            count: parameters[param].count
        };
    }
    
    // Save summary to Firestore
    try {
        await firestore.collection('sensor_summaries').add(summaryData);
        console.log('Successfully saved summary for period', 
            sixHoursAgo.toLocaleString('en-US', { timeZone: 'Asia/Manila' }), 
            'to', 
            now.toLocaleString('en-US', { timeZone: 'Asia/Manila' })
        );
    } catch (e) {
        console.error('Error saving summary:', e);
    }
}