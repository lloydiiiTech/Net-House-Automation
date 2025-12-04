const admin = require('firebase-admin'); // Ensure firebase-admin is initialized elsewhere

function normalizeCropEntry(crop = {}, index = 0, type = 'registered') {
    const fallbackName = `Crop ${index + 1}`;
    const score =
        typeof crop.score === 'number'
            ? crop.score
            : typeof crop.ruleBasedScore === 'number'
                ? crop.ruleBasedScore
                : null;

    return {
        id: crop.id || `${type}-${index}`,
        name: crop.name || fallbackName,
        isRegistered: type === 'registered' ? true : Boolean(crop.isRegistered),
        score,
        ruleBasedScore: crop.ruleBasedScore ?? null,
        mlScore: crop.mlScore ?? null,
        priorityLevel: crop.priorityLevel || null,
        registeredBoost: crop.registeredBoost ?? null,
        lastUpdated: crop.lastUpdated || null,
        parameterMatches: crop.parameterMatches || {},
        optimalConditions: crop.optimalConditions || {},
        analysis: crop.analysis || {},
        summary: crop.summary || null,
        status: crop.status || (type === 'registered' ? 'registered' : 'unregistered')
    };
}

exports.predictionHistoryReport = async (req, res) => {
    try {
        const db = admin.firestore();
        const pageSize = 1; // One entry per page
        let page = parseInt(req.query.page, 10) || 1;
        page = page < 1 ? 1 : page;

        // Use Firestore count aggregation to avoid fetching all docs
        const countSnap = await db.collection('prediction_history').count().get();
        const totalEntries = countSnap.data().count || 0;
        const totalPages = totalEntries > 0 ? Math.ceil(totalEntries / pageSize) : 1;

        if (totalEntries === 0) {
            return res.render('admin/report-prediction-history', {
                user: req.session.user,
                currentPrediction: null,
                totalPages: 1,
                currentPage: 1,
                error: 'No prediction history found.'
            });
        }

        if (page > totalPages) {
            page = totalPages;
        }

        const offset = (page - 1) * pageSize;
        const snapshot = await db
            .collection('prediction_history')
            .orderBy('timestamp', 'desc')
            .offset(offset)
            .limit(pageSize)
            .get();

        if (snapshot.empty) {
            return res.render('admin/report-prediction-history', {
                user: req.session.user,
                currentPrediction: null,
                totalPages,
                currentPage: page,
                error: 'No data for this page.'
            });
        }

        const doc = snapshot.docs[0];
        const rawData = doc.data();
        const predictions = rawData.predictions || {};
        const timestamp = rawData.timestamp ? rawData.timestamp.toDate() : null;

        const top5Registered = (predictions.top5Registered || []).map((crop, idx) =>
            normalizeCropEntry(crop, idx, 'registered')
        );
        const top5Unregistered = (predictions.top5Unregistered || []).map((crop, idx) =>
            normalizeCropEntry(crop, idx, 'unregistered')
        );

        // Use top5Overall directly from Firestore
        const top5Overall = (predictions.top5Overall || []).map((crop, idx) =>
            normalizeCropEntry(crop, idx, crop.isRegistered ? 'registered' : 'unregistered')
        );

        // Combine and sort top recommendations by score descending, take top 5 overall
        const allCrops = [...top5Registered, ...top5Unregistered];
        const topRecommendations = allCrops
            .sort((a, b) => (b.score || 0) - (a.score || 0))
            .slice(0, 5);

        const currentPrediction = {
            id: doc.id,
            timestampISO: timestamp ? timestamp.toISOString() : null,
            displayDate: timestamp
                ? timestamp.toLocaleString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit'
                  })
                : 'N/A',
            sensorData: rawData.sensorData || {},
            metadata: rawData.metadata || {},
            notes: rawData.notes || rawData.summary || null,
            modelVersion: rawData.modelVersion || rawData.model_version || 'N/A',
            top5Registered,
            top5Unregistered,
            top5Overall,// Add combined list
            stats: {
                registeredCount: top5Registered.length,
                unregisteredCount: top5Unregistered.length,
                totalRecommendations: top5Registered.length + top5Unregistered.length
            }
        };

        console.log(currentPrediction);
        res.render('admin/report-prediction-history', {
            user: req.session.user,
            currentPrediction,
            totalPages,
            currentPage: page,
            error: null
        });
    } catch (error) {
        console.error('Error rendering prediction history report:', error);
        res.render('admin/report-prediction-history', {
            user: req.session.user,
            currentPrediction: null,
            totalPages: 1,
            currentPage: 1,
            error: 'Failed to load prediction history report.'
        });
    }
};