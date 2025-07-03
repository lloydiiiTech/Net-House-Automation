const { firestore } = require("../config/firebase");
const admin = require('firebase-admin');
const cron = require('node-cron');

// Initialize the scheduled job
exports.initScheduledJobs = () => {
    // Run every 6 hours at 00, 06, 12, and 18
    cron.schedule('0 0,6,12,18 * * *', async () => {
        try {
            await summarizeSensorData();
            console.log('✅ 6-hour sensor data summarized successfully');
        } catch (error) {
            console.error('❌ Error summarizing 6-hour sensor data:', error);
        }
    }, {
        timezone: "Asia/Manila"
    });

    // Run daily at 11:59 PM to summarize the entire day's data
    cron.schedule('59 23 * * *', async () => {
        try {
            await summarizeDailySensorData();
            console.log('✅ Daily sensor data summarized successfully');
        } catch (error) {
            console.error('❌ Error summarizing daily sensor data:', error);
        }
    }, {
        timezone: "Asia/Manila"
    });

    // Test on specific hour 44 as minutes, 21 as 9PM
    // cron.schedule('54 14 * * *', async () => {
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
        console.log('⚠️ No sensor data found for the last 6 hours');
        return;
    }
    
    // Initialize summary with all required parameters
    const summary = {
        // Environmental Data
        temperature: initParameterSummary(),
        humidity: initParameterSummary(),
        light: initParameterSummary(),
        
        // Soil Data
        moistureAve: initParameterSummary(),
        nitrogen: initParameterSummary(),
        phosphorus: initParameterSummary(),
        potassium: initParameterSummary(),
        ph: initParameterSummary(),
        
        // Metadata
        data_points: snapshot.size,
        period_start: sixHoursAgo,
        period_end: now,
        timestamp: now,
        summary_type: '6-hour' // Add summary type
    };

    // Process each document
    snapshot.forEach(doc => {
        const data = doc.data();
        
        // Process all parameters consistently
        for (const param in summary) {
            if (param in data && !['data_points', 'period_start', 'period_end', 'timestamp', 'summary_type'].includes(param)) {
                const value = parseFloat(data[param]);
                if (!isNaN(value)) {
                    updateParameterSummary(summary[param], value);
                }
            }
        }
    });

    // Calculate final averages and handle null values
    for (const param in summary) {
        if (typeof summary[param] === 'object' && summary[param] !== null && 'values' in summary[param]) {
            summary[param] = finalizeParameterSummary(summary[param]);
        }
    }

    // Save summary to Firestore
    try {
        await firestore.collection('sensor_summaries').add(summary);
        console.log(`💾 Saved 6-hour summary (${summary.data_points} data points) from ${formatTime(sixHoursAgo)} to ${formatTime(now)}`);
    } catch (e) {
        console.error('❌ Error saving 6-hour summary:', e);
        throw e;
    }
}

async function summarizeDailySensorData() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0); // Set to 12:00:00 AM today
    
    // Query Firestore for data from the entire day
    const snapshot = await firestore.collection('sensor_summaries')
        .where('timestamp', '>=', startOfDay)
        .where('timestamp', '<=', now)
        .get();
    
    if (snapshot.empty) {
        console.log('⚠️ No sensor data found for today');
        return;
    }
    
    // Initialize summary with all required parameters
    const summary = {
        // Environmental Data
        temperature: initParameterSummary(),
        humidity: initParameterSummary(),
        light: initParameterSummary(),
        
        // Soil Data
        moistureAve: initParameterSummary(),
        nitrogen: initParameterSummary(),
        phosphorus: initParameterSummary(),
        potassium: initParameterSummary(),
        ph: initParameterSummary(),
        
        // Metadata
        data_points: snapshot.size,
        period_start: startOfDay,
        period_end: now,
        timestamp: now,
        summary_type: 'daily' // Add summary type
    };

    // Process each document
    snapshot.forEach(doc => {
        const data = doc.data();
        
        // Process all parameters consistently
        for (const param in summary) {
            if (param in data && !['data_points', 'period_start', 'period_end', 'timestamp', 'summary_type'].includes(param)) {
                const value = parseFloat(data[param]);
                if (!isNaN(value)) {
                    updateParameterSummary(summary[param], value);
                }
            }
        }
    });

    // Calculate final averages and handle null values
    for (const param in summary) {
        if (typeof summary[param] === 'object' && summary[param] !== null && 'values' in summary[param]) {
            summary[param] = finalizeParameterSummary(summary[param]);
        }
    }

    // Save summary to Firestore
    try {
        await firestore.collection('daily_sensor_summaries').add(summary);
        console.log(`💾 Saved daily summary (${summary.data_points} data points) from ${formatDate(startOfDay)} to ${formatTime(now)}`);
    } catch (e) {
        console.error('❌ Error saving daily summary:', e);
        throw e;
    }
}

// Helper functions
function initParameterSummary() {
    return {
        sum: 0,
        count: 0,
        min: Infinity,
        max: -Infinity,
        values: [] // Initialize empty array for values
    };
}

function updateParameterSummary(summary, value) {
    summary.sum += value;
    summary.count++;
    summary.min = Math.min(summary.min, value);
    summary.max = Math.max(summary.max, value);
    summary.values.push(value); // Add value to array
}

function finalizeParameterSummary(summary) {
    if (summary.count === 0) {
        return {
            average: null,
            min: null,
            max: null,
            count: 0
        };
    }
    
    // Calculate traditional average (mean)
    const average = summary.sum / summary.count;
    
    return {
        average: Number(average.toFixed(2)), // Rounds to 2 decimal places
        min: summary.min,
        max: summary.max,
        count: summary.count
    };
}

function formatTime(date) {
    return date.toLocaleString('en-US', { 
        timeZone: 'Asia/Manila',
        hour12: true,
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatDate(date) {
    return date.toLocaleString('en-US', { 
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}