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
      // Validate value is a number and within extended range (allow some tolerance)
      let numValue = parseFloat(value);
      if (isNaN(numValue)) {
        console.warn(`Invalid value for ${key}: ${value}, skipping normalization`);
        continue;
      }
      // Add check for all-zero or invalid ranges
      if (numValue < 0 || (ranges[normKey] && numValue > ranges[normKey][1] * 2)) {
        console.warn(`Out-of-range value for ${key}: ${numValue}, clamping`);
        numValue = Math.max(ranges[normKey][0], Math.min(ranges[normKey][1], numValue));
      }
      // Clamp to range with warning if out of bounds
      const clampedValue = Math.max(min - 10, Math.min(max + 10, numValue)); // Allow 10% tolerance
      if (clampedValue !== numValue) {
        console.warn(`Value for ${key} (${numValue}) clamped to ${clampedValue} for normalization`);
      }
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
      // Ensure normalized value is between 0 and 1
      const clampedNorm = Math.max(0, Math.min(1, value));
      denormalized[key] = min + (clampedNorm * (max - min));
    }
  }

  return denormalized;
};

module.exports = { 
  normalizeData,
  denormalizeData
};
