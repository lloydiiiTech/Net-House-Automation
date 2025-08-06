const { firestore, admin } = require('../config/firebase');

exports.dailySensorsReport = async (req, res) => {
    try {
        const pageSize = 10;
        const page = parseInt(req.query.page) || 1;
        const { dateFrom, dateTo } = req.query;
        let collectionRef = firestore.collection('daily_sensor_summaries');
        let query = collectionRef;
        let filterActive = false;
        // Date filtering logic (match reportAIDiseaseController.js)
        if (dateFrom && !dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateFrom);
            to.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from)).where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (!dateFrom && dateTo) {
            const from = new Date(dateTo);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from)).where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from)).where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        }
        // Always order by timestamp desc
        query = query.orderBy('timestamp', 'desc');
        // Get total count for pagination
        const totalSnapshot = await query.get();
        const totalRecords = totalSnapshot.size;
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        // Pagination: skip (page-1)*pageSize, then limit pageSize
        let paginatedDocs = [];
        if (totalRecords > 0) {
            if (page === 1) {
                const snapshot = await query.limit(pageSize).get();
                paginatedDocs = snapshot.docs;
            } else {
                // Get the last doc of the previous page
                const prevSnapshot = await query.limit((page - 1) * pageSize).get();
                const docs = prevSnapshot.docs;
                if (docs.length > 0) {
                    const lastDoc = docs[docs.length - 1];
                    const snapshot = await query.startAfter(lastDoc).limit(pageSize).get();
                    paginatedDocs = snapshot.docs;
                }
            }
        }
        const daily_sensor_summaries = paginatedDocs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                timestamp: data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp
            };
        });


        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-daily-sensors', {
            user: req.session.user,
            daily_sensor_summaries,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                pageSize
            },
            filter: filterActive ? { dateFrom, dateTo } : undefined
        });
        }else{
            res.render('report-daily-sensors', {
                user: req.session.user,
                daily_sensor_summaries,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalRecords,
                    pageSize
                },
                filter: filterActive ? { dateFrom, dateTo } : undefined
            });
        }
    } catch (error) {
        console.error('Error rendering daily sensors report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-daily-sensors', {
            user: req.session.user,
            daily_sensor_summaries: [],
            pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
            error: 'Failed to load daily sensors report.'
        });
        } else{
            res.render('report-daily-sensors', {
                user: req.session.user,
                daily_sensor_summaries: [],
                pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
                error: 'Failed to load daily sensors report.'
            });
        }
    }
}; 