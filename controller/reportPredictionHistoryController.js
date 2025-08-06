exports.predictionHistoryReport = async (req, res) => {
    try {
        // You can fetch prediction history data here if needed
        
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
            res.render('admin/report-prediction-history', { user: req.session.user });
        } else{
            res.render('report-prediction-history', { user: req.session.user });

        }
    } catch (error) {
        console.error('Error rendering prediction history report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-prediction-history', { user: req.session.user, error: 'Failed to load prediction history report.' });
        }else{
            res.render('report-prediction-history', { user: req.session.user, error: 'Failed to load prediction history report.' });

        }
    }
}; 