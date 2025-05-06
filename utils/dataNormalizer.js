const normalizeData = (sensorData) => {
    // Adjusted to match your Firestore sensor data structure
    const ranges = {
      n: [0, 100],       // NPK Nitrogen (maps to nitrogen)
      p: [0, 100],       // NPK Phosphorus (maps to phosphorus)
      k: [0, 100],       // NPK Potassium (maps to potassium)
      temperature: [0, 50],
      humidity: [0, 100],
      moisture: [0, 100],
      ph: [0, 14],
      light: [0, 2000]
    };
  
    // Map sensor data fields to normalized names
    const fieldMapping = {
      nitrogen: 'n',
      phosphorus: 'p',
      potassium: 'k'
    };
  
    const normalized = {};
    
    for (const [key, value] of Object.entries(sensorData)) {
      // Handle mapped fields (like nitrogen -> n)
      const normKey = fieldMapping[key] || key;
      
      if (ranges[normKey]) {
        const [min, max] = ranges[normKey];
        // Ensure value is within range before normalizing
        const clampedValue = Math.max(min, Math.min(max, value));
        normalized[normKey] = (clampedValue - min) / (max - min);
      }
    }
    
    return normalized;
  };
  
  // Helper function to denormalize for display purposes
  const denormalizeData = (normalized, originalSensorData) => {
    const denormalized = {...originalSensorData};
    const ranges = {
      n: [0, 100],
      p: [0, 100],
      k: [0, 100],
      temperature: [0, 50],
      humidity: [0, 100],
      moisture: [0, 100],
      ph: [0, 14],
      light: [0, 2000]
    };
  
    for (const [key, value] of Object.entries(normalized)) {
      if (ranges[key]) {
        const [min, max] = ranges[key];
        denormalized[key] = min + (value * (max - min));
      }
    }
  
    return denormalized;
  };
  
  module.exports = { 
    normalizeData,
    denormalizeData
  };