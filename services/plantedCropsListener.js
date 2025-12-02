const { firestore } = require('../config/firebase');
const CropPredictionService = require('./cropPredictionService');

function initPlantedCropsListener() {
  // Temporary: Use simpler query to avoid index requirement
  firestore.collection('planted_crops')
    .where('status', '==', 'harvested')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          
          // Check if already trained (client-side filter)
          if (data.isTrained !== true) {
            console.log('🌾 Detected new harvested crop for training:', change.doc.id);
            
            // Train immediately on every harvest (no debouncing)
            // This ensures model learns from each harvest cycle
            CropPredictionService.autoRetrain()
              .then(() => {
                console.log('✅ Model retrained after harvest');
              })
              .catch(err => {
                console.error('❌ Auto-retrain after harvest failed:', err);
              });
          } else {
            console.log('ℹ️ Crop already used for training:', change.doc.id);
          }
        }
      });
    }, err => {
      console.error('Planted crops listener error:', err);
    });
}

module.exports = { initPlantedCropsListener }; 


