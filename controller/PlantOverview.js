const { firestore, admin } = require('../config/firebase');

exports.plantOverview = async (req, res) => {
    try {
      const snapshot = await firestore.collection('prediction_history')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();
  
      if (snapshot.empty) {
        return res.render("admin/plants", { 
          recommendations: [],
          sensorData: {} 
        });
      }
  
      const doc = snapshot.docs[0];
      const data = doc.data();
      
      // Get sensor data from the recommendations document
      const sensorData = data.sensorData || {};
      
      // Process crops
      const predictions = data.predictions || {};
      const recommendations = []
        .concat(predictions.top5Registered || [])
        .concat(predictions.top5Unregistered || [])
        .filter(crop => crop && crop.name)
        .sort((a, b) => (b.score || b.ruleBasedScore || 0) - (a.score || a.ruleBasedScore || 0))
        .slice(0, 5);
  
      res.render("admin/plants", { 
        recommendations,
        sensorData 
      });
  
    } catch (error) {
      console.error("Error:", error);
      res.render("admin/plants", { 
        recommendations: [],
        sensorData: {} 
      });
    }
  };

// API endpoint for AJAX call
exports.getRecommendedCrops = async (req, res) => {
  try {
    const recommendationsRef = firestore.collection('prediction_history');
    const snapshot = await recommendationsRef
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.json([]);
    }

    const latestData = snapshot.docs[0].data();
    
    const allCrops = []
      .concat(latestData.top5Registered || [])
      .concat(latestData.top5Unregistered || [])
      .filter(crop => crop && crop.name && crop.score !== undefined && crop.score !== null)
      .filter(crop => crop.score > 0);

    const top5Crops = allCrops
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(crop => ({
        name: crop.name,
        score: crop.score,
        isRegistered: crop.isRegistered
      }));

    res.json(top5Crops);
  } catch (error) {
    console.error("Error fetching crops:", error);
    res.status(500).json({ error: "Failed to fetch recommendations" });
  }
};

// Check for active crop
exports.checkActiveCrop = async (req, res) => {
  try {
    if (!req.session.user?.uid) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const snapshot = await firestore.collection('planted_crops')
      .where('userId', '==', req.session.user.uid)
      .where('endDate', '==', null)
      .limit(1)
      .get();

    const hasActiveCrop = !snapshot.empty;
    const currentCrop = hasActiveCrop ? snapshot.docs[0].data() : null;

    res.json({ 
      hasActiveCrop,
      currentCrop
    });
  } catch (error) {
    console.error("Error checking active crop:", error);
    res.status(500).json({ error: "Failed to check active crops" });
  }
};

// Confirm new crop planting
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

// Harvest current crop
exports.harvestCurrentCrop = async (req, res) => {
  try {
    if (!req.session.user?.uid) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    // Find active crop
    const snapshot = await firestore.collection('planted_crops')
      .where('userId', '==', req.session.user.uid)
      .where('endDate', '==', null)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(400).json({ error: "No active crop found" });
    }

    // Update with harvest date
    const cropDoc = snapshot.docs[0];
    await cropDoc.ref.update({
      endDate: admin.firestore.FieldValue.serverTimestamp(),
      status: 'harvested'
    });

    res.json({ 
      success: true,
      message: `${cropDoc.data().name} harvested successfully` 
    });
  } catch (error) {
    console.error("Error harvesting crop:", error);
    res.status(500).json({ error: "Failed to harvest crop" });
  }
};