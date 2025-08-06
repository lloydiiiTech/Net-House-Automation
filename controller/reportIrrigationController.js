const { firestore, admin } = require('../config/firebase');

exports.irrigationReport = async (req, res) => {
    try {
        const pageSize = 10;
        const page = parseInt(req.query.page) || 1;
        const { dateFrom, dateTo } = req.query;
        let collectionRef = firestore.collection('irrigation_records');
        let query = collectionRef;
        let filterActive = false;
        // Date filtering logic
        if (dateFrom && !dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateFrom);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (!dateFrom && dateTo) {
            const from = new Date(dateTo);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        }
        // Always order by date desc
        query = query.orderBy('date', 'desc');
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
        const irrigation_records = paginatedDocs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                date: data.date && data.date.toDate ? data.date.toDate() : data.date,
                startTime: data.startTime && data.startTime.toDate ? data.startTime.toDate() : data.startTime,
                endTime: data.endTime && data.endTime.toDate ? data.endTime.toDate() : data.endTime
            };
        });
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-irrigation', {
            user: req.session.user,
            irrigation_records,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                pageSize
            },
            filter: filterActive ? { dateFrom, dateTo } : undefined
        });}
        else{
            res.render('report-irrigation', {
                user: req.session.user,
                irrigation_records,
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
        console.error('Error rendering irrigation report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-irrigation', {
            user: req.session.user,
            irrigation_records: [],
            pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
            error: 'Failed to load irrigation report.'
        });}
        else{
            res.render('report-irrigation', {
                user: req.session.user,
                irrigation_records: [],
                pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
                error: 'Failed to load irrigation report.'
            });
        }
    }
}; 