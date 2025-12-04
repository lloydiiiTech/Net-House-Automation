const admin = require('firebase-admin'); // Make sure firebase-admin is initialized elsewhere

exports.predictionHistoryReport = async (req, res) => {
    try {
        const db = admin.firestore();
        const page = parseInt(req.query.page) || 1;
        const pageSize = 1; // One entry per page
        const offset = (page - 1) * pageSize;

        // Fetch all docs to get total count and paginate (for simplicity; in production, use cursor-based pagination)
        const allSnapshot = await db.collection('prediction_history').orderBy('timestamp', 'desc').get();
        const totalEntries = allSnapshot.size;

        if (offset >= totalEntries) {
            return res.render('admin/report-prediction-history', {
                user: req.session.user,
                currentData: null,
                totalPages: Math.ceil(totalEntries / pageSize),
                currentPage: page,
                error: 'No data for this page.'
            });
        }

        // Get the document for the current page
        const docs = allSnapshot.docs.slice(offset, offset + pageSize);
        const currentData = docs.length > 0 ? { id: docs[0].id, ...docs[0].data() } : null;

        console.log('Current page data:', JSON.stringify(currentData, null, 2));
        res.render('admin/report-prediction-history', {
            user: req.session.user,
            currentData,
            totalPages: Math.ceil(totalEntries / pageSize),
            currentPage: page
        });
    } catch (error) {
        console.error('Error rendering prediction history report:', error);
        res.render('admin/report-prediction-history', {
            user: req.session.user,
            currentData: null,
            totalPages: 1,
            currentPage: 1,
            error: 'Failed to load prediction history report.'
        });
    }
};

