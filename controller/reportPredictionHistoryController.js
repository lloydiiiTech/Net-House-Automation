const admin = require('firebase-admin'); // Make sure firebase-admin is initialized elsewhere

exports.predictionHistoryReport = async (req, res) => {
    try {
        const db = admin.firestore();
        const snapshot = await db.collection('prediction_history').orderBy('timestamp', 'desc').get();
        const predictionHistoryData = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            // Extract timestamp and top5Registered crops (name and score)
            predictionHistoryData.push({
                date: data.timestamp ? (data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp) : null,
                top5Registered: (data.top5Registered || []).map(crop => ({
                    name: crop.name,
                    score: crop.score
                }))
            });
        });

        console.log('snapshot:', JSON.stringify(snapshot, null, 2));
        console.log('predictionHistoryData:', JSON.stringify(predictionHistoryData, null, 2));
        res.render('admin/report-prediction-history', {
            user: req.session.user,
            predictionHistoryData,
            plantedCrops: [], // Add this to prevent EJS error
            currentFilters: {}, // Add this to prevent EJS error
            allCrops: [] // Add this to prevent EJS error
        });
    } catch (error) {
        console.error('Error rendering prediction history report:', error);
        res.render('admin/report-prediction-history', {
            user: req.session.user,
            predictionHistoryData: [],
            error: 'Failed to load prediction history report.',
            plantedCrops: [], // Add this to prevent EJS error
            currentFilters: {}, // Add this to prevent EJS error
            allCrops: [] // Add this to prevent EJS error
        });
    }
}; 

