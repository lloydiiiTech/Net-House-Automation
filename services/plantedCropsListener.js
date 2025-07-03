const { firestore } = require('../config/firebase');
const CropPredictionService = require('./cropPredictionService');

function initPlantedCropsListener() {
  firestore.collection('planted_crops')
    .where('status', '==', 'harvested')
    .onSnapshot(snapshot => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added' || change.type === 'modified') {
          console.log('Detected new/updated harvested crop:', change.doc.id);
          CropPredictionService.trainModel()
            .then(() => console.log('Model retrained after new harvest'))
            .catch(err => console.error('Model retraining failed:', err));
        }
      });
    }, err => {
      console.error('Planted crops listener error:', err);
    });
}

module.exports = { initPlantedCropsListener }; 
