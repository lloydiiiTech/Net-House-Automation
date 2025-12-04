const { firestore } = require('../config/firebase');
const CropPredictionService = require('./cropPredictionService');

function initPlantedCropsListener() {
  // Use a more efficient query to avoid index issues - listen for changes in planted_crops
  firestore.collection('planted_crops')
    .where('status', '==', 'harvested')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          const data = change.doc.data();
          
          // Check if already trained and has valid harvest data
          if (data.isTrained !== true && 
              data.harvestSuccessRate !== undefined && 
              data.harvestSuccessRate >= 0 && 
              data.harvestSuccessRate <= 100 &&
              data.finalSensorSummary &&
              data.endDate) {  // Ensure endDate exists for seasonality
            console.log('🌾 Detected new harvested crop for training:', change.doc.id);
            
            // Debounce retraining - only retrain if not already in progress
            if (!CropPredictionService.currentTraining) {
              CropPredictionService.autoRetrain()
                .then(() => {
                  console.log('✅ Model retrained after harvest');
                  // Mark crop as trained after successful retraining
                  return firestore.collection('planted_crops').doc(change.doc.id).update({
                    isTrained: true,
                    trainedAt: new Date()
                  });
                })
                .then(() => {
                  console.log('✅ Crop marked as trained:', change.doc.id);
                })
                .catch(err => {
                  console.error('❌ Auto-retrain or marking failed:', err);
                });
            } else {
              console.log('⏳ Training already in progress, skipping auto-retrain for:', change.doc.id);
            }
          } else if (data.isTrained === true) {
            console.log('ℹ️ Crop already used for training:', change.doc.id);
          } else {
            console.log('ℹ️ Crop not eligible for training (missing data):', change.doc.id);
          }
        }
      });
    }, err => {
      console.error('Planted crops listener error:', err);
    });
}

module.exports = { initPlantedCropsListener };


