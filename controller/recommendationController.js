const { firestore, admin } = require('../config/firebase');
exports.confirmCropSelection = async (req, res) => {
    try {
      const { cropData } = req.body;
      
      if (!cropData?.name) {
        return res.status(400).json({ error: "Invalid crop data" });
      }
  
      if (!req.session.user?.uid) {
        return res.status(401).json({ error: "Not authenticated" });
      }
  
      // Verify no active crop exists
      const activeCheck = await firestore.collection('planted_crops')
        .where('userId', '==', req.session.user.uid)
        .where('endDate', '==', null)
        .limit(1)
        .get();
  
      if (!activeCheck.empty) {
        return res.status(400).json({ 
          error: "You already have an active crop. Harvest it first."
        });
      }
  
      // Create new planted crop
      const plantedCropRef = firestore.collection('planted_crops').doc();
      await plantedCropRef.set({
        ...cropData,
        startDate: admin.firestore.FieldValue.serverTimestamp(),
        endDate: null,
        status: 'active',
        userId: req.session.user.uid,
        userEmail: req.session.user.email,
        userName: req.session.user.name
      });
  
      res.json({ 
        success: true, 
        plantedCropId: plantedCropRef.id,
        message: `${cropData.name} planted successfully`
      });
    } catch (error) {
      console.error("Error saving planted crop:", error);
      res.status(500).json({ error: "Failed to save crop selection" });
    }
  };
exports.recommendationsPage = async (req, res) => {
    try {
        // Get user data from session
        const userId = req.session.user?.uid;
        let userData = null;
        if (userId) {
            try {
                const userDoc = await firestore.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    userData = userDoc.data();
                    userData.id = userDoc.id;
                    userData.profilePicture = userData.profilePicture || '/assets/img/default-avatar.png';
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        }

        // Fetch latest crop recommendations
        const snapshot = await firestore.collection('prediction_history')
            .orderBy('timestamp', 'desc')
            .limit(1)
            .get();

        let recommendations = [];
        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            const predictions = data.predictions || {};
            recommendations = []
                .concat(predictions.top5Registered || [])
                .concat(predictions.top5Unregistered || [])
                .filter(crop => crop && crop.name)
                .sort((a, b) => (b.score || b.ruleBasedScore || 0) - (a.score || a.ruleBasedScore || 0))
                .slice(0, 5);
        }

        // Fetch all registered crops
        const cropsSnapshot = await firestore.collection('crops').where('isRegistered', '==', true).get();
        const registeredCrops = cropsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Check for active planted crop
        let hasActiveCrop = false;
        if (userId) {
            const plantedSnapshot = await firestore.collection('planted_crops')
                .where('userId', '==', userId)
                .where('endDate', '==', null)
                .limit(1)
                .get();
            hasActiveCrop = !plantedSnapshot.empty;
        }
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/recommendations', {
            user: userData || {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            },
            recommendations,
            registeredCrops,
            hasActiveCrop
        });} else
        {
            res.render('recommendations', {
                user: userData || {
                    name: 'User',
                    role: 'User',
                    profilePicture: '/assets/img/default-avatar.png'
                },
                recommendations,
                registeredCrops,
                hasActiveCrop
            });}
    } catch (error) {
        console.error('Error rendering recommendations page:', error);
        if(rolesession.toUpperCase() === 'ADMIN'){

        res.render('admin/recommendations', {
            user: {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            },
            recommendations: [],
            registeredCrops: [],
            hasActiveCrop: false
        });
    }
    else {
        res.render('recommendations', {
            user: {
                name: 'User',
                role: 'User',
                profilePicture: '/assets/img/default-avatar.png'
            },
            recommendations: [],
            registeredCrops: [],
            hasActiveCrop: false
        });
    
    }
    }
};

exports.registerCrop = async (req, res) => {
    try {
        const { cropName } = req.body;
        if (!cropName || typeof cropName !== 'string' || !cropName.trim()) {
            return res.status(400).json({ success: false, message: 'Crop name is required.' });
        }
        const name = cropName.trim();
        // Check if crop exists (case-insensitive)
        const cropQuery = await firestore.collection('crops')
            .where('name', '==', name)
            .limit(1)
            .get();
        if (!cropQuery.empty) {
            // Crop exists, update isRegistered to true
            const cropDoc = cropQuery.docs[0];
            await cropDoc.ref.update({ isRegistered: true });
            return res.json({ success: true, message: 'Crop registered successfully (existing crop updated).' });
        } else {
            // Crop does not exist, create new
            await firestore.collection('crops').add({
                name,
                isRegistered: true
            });
            return res.json({ success: true, message: 'Crop registered successfully (new crop added).' });
        }
    } catch (error) {
        console.error('Error registering crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

exports.updateCrop = async (req, res) => {
    try {
        const { cropId } = req.params;
        const { newName } = req.body;
        if (!cropId || !newName || typeof newName !== 'string' || !newName.trim()) {
            return res.status(400).json({ success: false, message: 'Invalid crop ID or name.' });
        }
        await firestore.collection('crops').doc(cropId).update({ name: newName.trim() });
        return res.json({ success: true, message: 'Crop name updated successfully.' });
    } catch (error) {
        console.error('Error updating crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

exports.deleteCrop = async (req, res) => {
    try {
        const { cropId } = req.params;
        if (!cropId) {
            return res.status(400).json({ success: false, message: 'Invalid crop ID.' });
        }
        await firestore.collection('crops').doc(cropId).update({ isRegistered: false });
        return res.json({ success: true, message: 'Crop unregistered (soft deleted) successfully.' });
    } catch (error) {
        console.error('Error deleting crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
};

exports.plantCrop = async (req, res) => {
    try {
        const { crop } = req.body;
        const user = req.session.user;
        if (!user || !user.uid) {
            return res.status(401).json({ success: false, message: 'Not authenticated.' });
        }
        if (!crop || !crop.name) {
            return res.status(400).json({ success: false, message: 'Invalid crop data.' });
        }
        // Prepare planted crop data
        const plantedCrop = {
            name: crop.name,
            optimalConditions: crop.optimalConditions || {},
            parameterMatches: crop.parameterMatches || {},
            score: crop.score || crop.ruleBasedScore || null,
            ruleBasedScore: crop.ruleBasedScore || null,
            status: 'active',
            startDate: admin.firestore.FieldValue.serverTimestamp(),
            endDate: null,
            userId: user.uid,
            userEmail: user.email,
            userName: user.name,
            isRegistered: crop.isRegistered || false,
            lastUpdated: crop.lastUpdated || null,
            mlScore: crop.mlScore || null
        };
        await firestore.collection('planted_crops').add(plantedCrop);
        return res.json({ success: true, message: 'Crop planted successfully.' });
    } catch (error) {
        console.error('Error planting crop:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again.' });
    }
}; 