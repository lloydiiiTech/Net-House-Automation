const { firestore } = require('../config/firebase');

exports.cropsReport = async (req, res) => {
    try {
        // Fetch only registered crops
        const cropsSnapshot = await firestore.collection('crops').where('isRegistered', '==', true).get();
        const cropSummary = cropsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                name: data.name || 'Unknown',
                successRate: typeof data.successRate === 'number' ? data.successRate : 0,
                numberFailed: typeof data.numberFailed === 'number' ? data.numberFailed : 0,
                numberPlanted: typeof data.numberPlanted === 'number' ? data.numberPlanted : 0
            };
        });
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){

        res.render('admin/report-crops', { user: req.session.user, cropSummary });
        }else{
            res.render('report-crops', { user: req.session.user, cropSummary });
        }
    } catch (error) {
        console.error('Error rendering crops report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-crops', { user: req.session.user, error: 'Failed to load crops report.', cropSummary: [] });
        }else{
            res.render('report-crops', { user: req.session.user, error: 'Failed to load crops report.', cropSummary: [] });

        }
    }
};

// Edit crop page (GET)
exports.editCrop = async (req, res) => {
    try {
        const cropName = decodeURIComponent(req.params.cropName);
        const cropsSnapshot = await firestore.collection('crops').where('name', '==', cropName).limit(1).get();
        if (cropsSnapshot.empty) {
            return res.status(404).render('error', { message: 'Crop not found.' });
        }
        const cropDoc = cropsSnapshot.docs[0];
        const crop = cropDoc.data();
        res.render('admin/edit-crop', { crop, cropId: cropDoc.id, user: req.session.user });
    } catch (error) {
        console.error('Error loading crop for edit:', error);
        res.status(500).render('error', { message: 'Failed to load crop for editing.' });
    }
};

// Unregister crop (POST)
exports.unregisterCrop = async (req, res) => {
    try {
        const cropName = decodeURIComponent(req.body.cropName);
        const cropsSnapshot = await firestore.collection('crops').where('name', '==', cropName).limit(1).get();
        if (cropsSnapshot.empty) {
            return res.status(404).json({ success: false, message: 'Crop not found.' });
        }
        const cropDoc = cropsSnapshot.docs[0];
        await cropDoc.ref.update({ isRegistered: false });
        res.json({ success: true });
    } catch (error) {
        console.error('Error unregistering crop:', error);
        res.status(500).json({ success: false, message: 'Failed to unregister crop.' });
    }
};

// Edit crop name (POST)
exports.editCropName = async (req, res) => {
    try {
        const { oldCropName, newCropName } = req.body;
        if (!oldCropName || !newCropName) {
            return res.status(400).json({ success: false, message: 'Both old and new crop names are required.' });
        }
        const cropsSnapshot = await firestore.collection('crops').where('name', '==', oldCropName).limit(1).get();
        if (cropsSnapshot.empty) {
            return res.status(404).json({ success: false, message: 'Crop not found.' });
        }
        const cropDoc = cropsSnapshot.docs[0];
        await cropDoc.ref.update({ name: newCropName });
        res.json({ success: true });
    } catch (error) {
        console.error('Error editing crop name:', error);
        res.status(500).json({ success: false, message: 'Failed to edit crop name.' });
    }
}; 