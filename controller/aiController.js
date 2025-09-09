const { firestore, admin } = require('../config/firebase');
const OpenAI = require('openai');
const cron = require('node-cron');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper: Parse growth stage from GPT's growth section
function extractGrowthStage(growthText) {
  // Remove asterisks and trim
  let cleanText = growthText.replace(/\*/g, '').trim();

  // List of known stages
  const stages = ['Germination', 'Seedling', 'Vegetative', 'Flowering', 'Fruiting', 'Mature'];

  // Try to find a known stage in the text
  for (const stage of stages) {
    const regex = new RegExp(`${stage} Stage`, 'i');
    if (regex.test(cleanText)) return `${stage} Stage`;
  }

  // Fallback: try to extract after colon if present
  const colonMatch = cleanText.match(/Stage\s*[:\-]?\s*([a-zA-Z ]+Stage)/i);
  if (colonMatch && colonMatch[1]) return colonMatch[1].trim();

  // Fallback: try to get the first non-empty line after the label
  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    if (/growth stage/i.test(lines[i]) && lines[i + 1]) {
      // If the next line looks like a stage, return it
      for (const stage of stages) {
        if (lines[i + 1].toLowerCase().includes(stage.toLowerCase())) {
          return `${stage} Stage`;
        }
      }
      // Otherwise, just return the next line
      return lines[i + 1];
    }
  }

  return null;
}

async function fetchLatestSensorSummary() {
  const snapshot = await firestore.collection('daily_sensor_summaries')
    .orderBy('period_start', 'desc')
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data();
}

async function fetchCurrentPlantedCrop() {
  const snapshot = await firestore.collection('planted_crops')
    .where('endDate', '==', null)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  // Double-check the document exists
  if (!doc.exists) {
    console.log('fetchCurrentPlantedCrop: Document does not exist for ID:', doc.id);
    return null;
  }
  return { id: doc.id, ...doc.data() };
}

async function updateCropGrowthStage(growthStage) {
  // Removed .orderBy('startDate', 'desc') to avoid Firestore composite index error
  // Assumes only one active crop (endDate == null) at a time
  const snapshot = await firestore.collection('planted_crops')
    .where('endDate', '==', null)
    .limit(1)
    .get();
  if (snapshot.empty) {
    console.log('updateCropGrowthStage: No active crop with null endDate found.');
    return;
  }
  const doc = snapshot.docs[0];
  if (doc.exists) {
    await doc.ref.update({ growthStage });
    console.log(`updateCropGrowthStage: Updated growthStage for crop ID: ${doc.id}`);
  } else {
    console.log('updateCropGrowthStage: Document does not exist for ID:', doc.id);
  }
}

async function getChatGPTAdvice(sensorSummary, crop) {
    const startDate = crop.startDate?.toDate?.() || new Date(crop.startDate);
    const currentDate = new Date();
    const daysSincePlanting = Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24));

    const prompt = `
  Crop Information:
- Name: ${crop.name}
- Start Date: ${startDate.toISOString()}
- Current Date: ${currentDate.toISOString()}
- Days Since Planting: ${daysSincePlanting} day(s)
  
  Sensor Averages:
  - Temperature: ${sensorSummary.temperature?.average} °C
  - Humidity: ${sensorSummary.humidity?.average} %
  - Moisture: ${sensorSummary.moistureAve?.average} %
  - Nitrogen (N): ${sensorSummary.nitrogen?.average} ppm
  - Phosphorus (P): ${sensorSummary.phosphorus?.average} ppm
  - Potassium (K): ${sensorSummary.potassium?.average} ppm
  - Soil pH: ${sensorSummary.ph?.average}
  
  Optimal Conditions for ${crop.name}:
- Optimal Nitrogen (N): ${crop.optimalConditions.npk_N} ppm
- Optimal Phosphorus (P): ${crop.optimalConditions.npk_P} ppm
- Optimal Potassium (K): ${crop.optimalConditions.npk_K} ppm
- Optimal Temperature: ${crop.optimalConditions.temperature} °C
- Optimal Humidity: ${crop.optimalConditions.humidity} %
- Optimal Moisture: ${crop.optimalConditions.moisture} %
- Optimal Soil pH: ${crop.optimalConditions.ph}
- Optimal Light: ${crop.optimalConditions.light} lux

  Questions:
  1. Based on the exact number of days since planting (${daysSincePlanting} days), what is the crop's current **growth stage**? Please give a clear and accurate stage name (e.g., "Seedling Stage"), just stage name.
  2. Given the current environmental conditions and growth stage, what **plant diseases** are likely to appear? List diseases as bullet points with **matching prevention methods**.
  3. Based on the current growth stage, sensor data (N, P, K levels, pH, moisture, temperature, humidity), recommend only **chemical fertilizers**.

    For each fertilizer recommendation:
    - Use bullet points
    - Include:
    • The **exact fertilizer name** (e.g., Urea 46-0-0)
    • The **nutrient it addresses** (N, P, or K)
    • The **reason** it's needed (e.g., "nitrogen is low at 10 ppm, below the optimal 30 ppm")
    • A **short explanation** of how that nutrient supports the plant at the current growth stage
    • The **application method and frequency** (e.g., "apply 1 tbsp per plant every 10 days")

    If a nutrient is **already adequate**, clearly say:
    > • No nitrogen fertilizer needed — sensor shows sufficient nitrogen (35 ppm)

    Also, if soil pH is out of range, suggest a chemical amendment and explain why.

    Please format your response using these sections:
    **Growth Stage:**  
    ...

    **Possible Diseases and Prevention:**  
    • Disease - Prevention  
    ...

    **Fertilizer Recommendation (Chemical Only):**  
    • [Fertilizer Name] – [Why it's needed based on sensor data] – [Effect on plant] – [How and when to apply]
  `;
  
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 700
    });
  
    return response.choices[0].message.content;
  }
  
function parseAdviceSections(advice) {
  // Split the response into three sections by keywords
  const growthMatch = advice.match(/Growth[\s\S]*?(?=Disease|$)/i);
  const diseaseMatch = advice.match(/Disease[\s\S]*?(?=Fertilizer|$)/i);
  const fertilizerMatch = advice.match(/Fertilizer[\s\S]*$/i);
  return {
    growth: growthMatch ? growthMatch[0].trim() : '',
    disease: diseaseMatch ? diseaseMatch[0].trim() : '',
    fertilizer: fertilizerMatch ? fertilizerMatch[0].trim() : ''
  };
}

// Helper: Parse disease section into array of { disease, prevention }
function parseDiseaseSection(diseaseText) {
  const lines = diseaseText.split('\n').filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'));
  return lines.map(line => {
    // Remove bullet and split by ' - ' or ' – '
    const clean = line.replace(/^[-•]\s*/, '');
    const [disease, prevention] = clean.split(/\s*[-–]\s*/);
    return { disease: disease?.trim(), prevention: prevention?.trim() };
  }).filter(item => item.disease && item.prevention);
}

// Helper: Parse fertilizer section into array of objects
function parseFertilizerSection(fertilizerText) {
  // Split into lines and filter bullets
  const lines = fertilizerText.split('\n').filter(line => line.trim().startsWith('-') || line.trim().startsWith('•'));
  return lines.map(line => {
    // Remove bullet
    const clean = line.replace(/^[-•]\s*/, '').trim();
    // Split by en dash
    const parts = clean.split(/\s*–\s*/);
    // If not enough parts, try splitting by hyphen
    if (parts.length < 4) {
      const altParts = clean.split(/\s*-\s*/);
      if (altParts.length === 4) return {
        name: altParts[0]?.trim(),
        reason: altParts[1]?.trim(),
        effect: altParts[2]?.trim(),
        application: altParts[3]?.trim()
      };
    }
    return {
      name: parts[0]?.trim(),
      reason: parts[1]?.trim(),
      effect: parts[2]?.trim(),
      application: parts[3]?.trim()
    };
  }).filter(f => f.name && f.reason && f.effect && f.application);
}

async function runAIPromptAndSave() {
  try {
    const sensorSummary = await fetchLatestSensorSummary();
    const crop = await fetchCurrentPlantedCrop();
    // Only run if there is a crop with null endDate
    if (!sensorSummary || !crop || crop.endDate !== null) {
      console.log('AI Controller: No active crop with null endDate found. AI integration will not run.');
      return;
    }

    console.log('AI Controller: Fetched sensor summary:', sensorSummary);
    console.log('AI Controller: Fetched crop:', crop);

    // Get AI advice
    const advice = await getChatGPTAdvice(sensorSummary, crop);
    console.log('AI Controller: GPT advice:', advice);
    const { growth, disease, fertilizer } = parseAdviceSections(advice);
    console.log('AI Controller: Parsed growth section:', growth);

    // Extract growth stage from GPT's answer (just the stage name)
    const gptGrowthStage = extractGrowthStage(growth);
    if (gptGrowthStage) {
      await updateCropGrowthStage(gptGrowthStage);
      console.log('AI Controller: Updated crop growth stage to:', gptGrowthStage);
    } else {
      console.log('AI Controller: Could not extract growth stage from GPT response.');
    }

    // Parse disease and fertilizer sections
    const diseaseArray = parseDiseaseSection(disease);
    const fertilizerArray = parseFertilizerSection(fertilizer);

    // Save each disease/prevention as an array in a single document
    await firestore.collection('ai_disease_advice').add({
      cropId: crop.id,
      cropName: crop.name,
      growthStage: gptGrowthStage || null,
      diseases: diseaseArray,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    // Save all fertilizer recommendations as an array in a single document
    await firestore.collection('ai_fertilizer_advice').add({
      cropId: crop.id,
      cropName: crop.name,
      growthStage: gptGrowthStage || null,
      fertilizers: fertilizerArray,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('AI Controller: All advice saved to Firestore.');
  } catch (error) {
    console.error('AI Controller error:', error);
  }
}

// Schedule the job to run every 6 hours
function initAIScheduledJobs() {
  cron.schedule('0 6 * * *', async () => {
    await runAIPromptAndSave();
    console.log('✅ AI prompt and save completed');
  }, {
    timezone: 'Asia/Manila'
  });
}

module.exports = { initAIScheduledJobs, runAIPromptAndSave }; 