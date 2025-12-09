const { firestore } = require('../config/firebase');
const OpenAI = require('openai');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
                numberPlanted: typeof data.numberPlanted === 'number' ? data.numberPlanted : 0,
                lastPlanted: data.lastPlanted ? data.lastPlanted.toDate().toLocaleString() : null,
                // Include optimal data for the modal
                optimal_humidity: typeof data.optimal_humidity === 'number' ? data.optimal_humidity : 0,
                optimal_temperature: typeof data.optimal_temperature === 'number' ? data.optimal_temperature : 0,
                optimal_moisture: typeof data.optimal_moisture === 'number' ? data.optimal_moisture : 0,
                optimal_light: typeof data.optimal_light === 'number' ? data.optimal_light : 0,
                optimal_ph: typeof data.optimal_ph === 'number' ? data.optimal_ph : 0,
                optimal_n: typeof data.optimal_n === 'number' ? data.optimal_n : 0,
                optimal_p: typeof data.optimal_p === 'number' ? data.optimal_p : 0,
                optimal_k: typeof data.optimal_k === 'number' ? data.optimal_k : 0,
                lastPredictionScore: typeof data.lastPredictionScore === 'number' ? data.lastPredictionScore : 0,
                lastPredictionTime: data.lastPredictionTime
            };
        });
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-crops', { user: req.session.user, cropSummary });}
        else{
            res.render('report-crops', { user: req.session.user, cropSummary });
        }
    } catch (error) {
        console.error('Error rendering crops report:', error);
        if(rolesession.toUpperCase() === 'ADMIN'){
            res.render('admin/report-crops', { user: req.session.user, error: 'Failed to load crops report.', cropSummary: [] });}
            else{
                res.render('report-crops', { user: req.session.user, error: 'Failed to load crops report.', cropSummary: [] });
            }
    }
};

// Get crop details for modal (POST)
exports.getCropDetails = async (req, res) => {
    try {
        const cropName = decodeURIComponent(req.body.cropName);
        const cropsSnapshot = await firestore.collection('crops').where('name', '==', cropName).limit(1).get();
        
        if (cropsSnapshot.empty) {
            return res.status(404).json({ success: false, message: 'Crop not found.' });
        }
        
        const cropDoc = cropsSnapshot.docs[0];
        const data = cropDoc.data();
        
        const cropDetails = {
            name: data.name || 'Unknown',
            successRate: typeof data.successRate === 'number' ? data.successRate : 0,
            numberFailed: typeof data.numberFailed === 'number' ? data.numberFailed : 0,
            numberPlanted: typeof data.numberPlanted === 'number' ? data.numberPlanted : 0,
            lastPlanted: data.lastPlanted,
            optimal_humidity: typeof data.optimal_humidity === 'number' ? data.optimal_humidity : 0,
            optimal_temperature: typeof data.optimal_temperature === 'number' ? data.optimal_temperature : 0,
            optimal_moisture: typeof data.optimal_moisture === 'number' ? data.optimal_moisture : 0,
            optimal_light: typeof data.optimal_light === 'number' ? data.optimal_light : 0,
            optimal_ph: typeof data.optimal_ph === 'number' ? data.optimal_ph : 0,
            optimal_n: typeof data.optimal_n === 'number' ? data.optimal_n : 0,
            optimal_p: typeof data.optimal_p === 'number' ? data.optimal_p : 0,
            optimal_k: typeof data.optimal_k === 'number' ? data.optimal_k : 0,
            lastPredictionScore: typeof data.lastPredictionScore === 'number' ? data.lastPredictionScore : 0,
            lastPredictionTime: data.lastPredictionTime
        };
        
        res.json({ success: true, cropDetails });
    } catch (error) {
        console.error('Error getting crop details:', error);
        res.status(500).json({ success: false, message: 'Failed to get crop details.' });
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
        const { oldCropName, newCropName,
            optimal_temperature, optimal_humidity, optimal_moisture, optimal_light,
            optimal_ph, optimal_n, optimal_p, optimal_k } = req.body;
        if (!oldCropName || !newCropName) {
            return res.status(400).json({ success: false, message: 'Both old and new crop names are required.' });
        }
        const cropsSnapshot = await firestore.collection('crops').where('name', '==', oldCropName).limit(1).get();
        if (cropsSnapshot.empty) {
            return res.status(404).json({ success: false, message: 'Crop not found.' });
        }
        const cropDoc = cropsSnapshot.docs[0];
        // Build update object
        const updateObj = { name: newCropName };
        if (optimal_temperature !== undefined) updateObj.optimal_temperature = parseFloat(optimal_temperature);
        if (optimal_humidity !== undefined) updateObj.optimal_humidity = parseFloat(optimal_humidity);
        if (optimal_moisture !== undefined) updateObj.optimal_moisture = parseFloat(optimal_moisture);
        if (optimal_light !== undefined) updateObj.optimal_light = parseFloat(optimal_light);
        if (optimal_ph !== undefined) updateObj.optimal_ph = parseFloat(optimal_ph);
        if (optimal_n !== undefined) updateObj.optimal_n = parseFloat(optimal_n);
        if (optimal_p !== undefined) updateObj.optimal_p = parseFloat(optimal_p);
        if (optimal_k !== undefined) updateObj.optimal_k = parseFloat(optimal_k);
        await cropDoc.ref.update(updateObj);
        res.json({ success: true });
    } catch (error) {
        console.error('Error editing crop data:', error);
        res.status(500).json({ success: false, message: 'Failed to edit crop data.' });
    }
}; 

// Register crop with AI optimal conditions (POST)
exports.registerCropWithAI = async (req, res) => {
    try {
        const { cropName, optimal_temperature, optimal_humidity, optimal_moisture, optimal_light, optimal_ph, optimal_n, optimal_p, optimal_k } = req.body;
        
        if (!cropName) {
            return res.status(400).json({ success: false, message: 'Crop name is required.' });
        }

        // Check if crop already exists
        const existingCrop = await firestore.collection('crops').where('name', '==', cropName).limit(1).get();
        
        if (!existingCrop.empty) {
            // Crop exists - check if it's already registered
            const cropDoc = existingCrop.docs[0];
            const cropData = cropDoc.data();
            
            if (cropData.isRegistered === true) {
                return res.status(400).json({ success: false, message: 'Crop is already registered.' });
            }
            
            // Crop exists but is not registered - update it
            const updateData = { isRegistered: true };
            
            // Check if user provided optimal conditions
            const hasUserConditions = optimal_temperature || optimal_humidity || optimal_moisture || optimal_light || optimal_ph || optimal_n || optimal_p || optimal_k;
            
            if (hasUserConditions) {
                // Update with user-provided conditions
                if (optimal_temperature !== undefined) updateData.optimal_temperature = parseFloat(optimal_temperature);
                if (optimal_humidity !== undefined) updateData.optimal_humidity = parseFloat(optimal_humidity);
                if (optimal_moisture !== undefined) updateData.optimal_moisture = parseFloat(optimal_moisture);
                if (optimal_light !== undefined) updateData.optimal_light = parseFloat(optimal_light);
                if (optimal_ph !== undefined) updateData.optimal_ph = parseFloat(optimal_ph);
                if (optimal_n !== undefined) updateData.optimal_n = parseFloat(optimal_n);
                if (optimal_p !== undefined) updateData.optimal_p = parseFloat(optimal_p);
                if (optimal_k !== undefined) updateData.optimal_k = parseFloat(optimal_k);
            }
            
            await cropDoc.ref.update(updateData);
            
            res.json({ 
                success: true, 
                message: 'Existing crop registered successfully!',
                usedAI: false,
                wasExisting: true
            });
        } else {
            // Crop doesn't exist - create new crop
            let optimalConditions = {
                temperature: optimal_temperature,
                humidity: optimal_humidity,
                moisture: optimal_moisture,
                light: optimal_light,
                ph: optimal_ph,
                npk_N: optimal_n,
                npk_P: optimal_p,
                npk_K: optimal_k
            };

            // If any optimal conditions are missing, use AI to generate them
            const missingConditions = Object.values(optimalConditions).filter(val => val === null || val === undefined || val === '');
            
            if (missingConditions.length > 0) {
                try {
                    const aiOptimalConditions = await getAIOptimalConditions(cropName);
                    // Merge AI conditions with provided conditions (AI fills in the blanks)
                    optimalConditions = {
                        temperature: optimal_temperature || aiOptimalConditions.temperature,
                        humidity: optimal_humidity || aiOptimalConditions.humidity,
                        moisture: optimal_moisture || aiOptimalConditions.moisture,
                        light: optimal_light || aiOptimalConditions.light,
                        ph: optimal_ph || aiOptimalConditions.ph,
                        npk_N: optimal_n || aiOptimalConditions.npk_N,
                        npk_P: optimal_p || aiOptimalConditions.npk_P,
                        npk_K: optimal_k || aiOptimalConditions.npk_K
                    };
                } catch (aiError) {
                    console.error('AI optimal conditions generation failed:', aiError);
                    return res.status(500).json({ 
                        success: false, 
                        message: 'Failed to generate AI optimal conditions. Please provide all optimal conditions manually.' 
                    });
                }
            }

            // Create the crop document
            const cropData = {
                name: cropName,
                isRegistered: true,
                successRate: 0,
                numberPlanted: 0,
                numberFailed: 0,
                lastPlanted: null,
                lastPredictionScore: 0,
                lastPredictionTime: null,
                // Optimal conditions
                optimal_temperature: parseFloat(optimalConditions.temperature) || 0,
                optimal_humidity: parseFloat(optimalConditions.humidity) || 0,
                optimal_moisture: parseFloat(optimalConditions.moisture) || 0,
                optimal_light: parseFloat(optimalConditions.light) || 0,
                optimal_ph: parseFloat(optimalConditions.ph) || 0,
                optimal_n: parseFloat(optimalConditions.npk_N) || 0,
                optimal_p: parseFloat(optimalConditions.npk_P) || 0,
                optimal_k: parseFloat(optimalConditions.npk_K) || 0,
                // Store the original optimal conditions structure for compatibility
                optimalConditions: optimalConditions
            };

            await firestore.collection('crops').add(cropData);
            
            res.json({ 
                success: true, 
                message: 'Crop registered successfully!',
                usedAI: missingConditions.length > 0,
                wasExisting: false
            });
        }
    } catch (error) {
        console.error('Error registering crop with AI:', error);
        res.status(500).json({ success: false, message: 'Failed to register crop.' });
    }
};

// AI function to get optimal conditions for a crop
async function getAIOptimalConditions(cropName) {
    const prompt = `
    I need the optimal growing conditions for ${cropName}. Please provide the following values in a structured format:

    Please provide the optimal growing conditions for ${cropName} in this exact JSON format:
    {
        "temperature": [number in Celsius],
        "humidity": [number as percentage],
        "moisture": [number as percentage],
        "light": [number in lux],
        "ph": [number for soil pH],
        "npk_N": [number in mg/kg for Nitrogen],
        "npk_P": [number in mg/kg for Phosphorus],
        "npk_K": [number in mg/kg for Potassium]
    }

    Please ensure all values are realistic and appropriate for ${cropName}. If you're unsure about a specific value, provide a reasonable estimate based on similar crops.
    `;

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300
    });

    const content = response.choices[0].message.content;
    
    // Try to extract JSON from the response
    try {
        // Look for JSON in the response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const optimalConditions = JSON.parse(jsonMatch[0]);
            return {
                temperature: optimalConditions.temperature || 25,
                humidity: optimalConditions.humidity || 60,
                moisture: optimalConditions.moisture || 70,
                light: optimalConditions.light || 5000,
                ph: optimalConditions.ph || 6.5,
                npk_N: optimalConditions.npk_N || 30,
                npk_P: optimalConditions.npk_P || 20,
                npk_K: optimalConditions.npk_K || 25
            };
        }
    } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
    }

    // Fallback values if AI parsing fails
    return {
        temperature: 25,
        humidity: 60,
        moisture: 70,
        light: 5000,
        ph: 6.5,
        npk_N: 30,
        npk_P: 20,
        npk_K: 25
    };
}

