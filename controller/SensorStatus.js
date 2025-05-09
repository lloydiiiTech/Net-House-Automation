
function getNitrogenStatus(n) {
    if (n < 20) return "Very Low (Deficient)";
    if (n >= 20 && n < 40) return "Low (Marginal)";
    if (n >= 40 && n <= 60) return "Normal (Adequate)";
    if (n > 60 && n <= 80) return "High (Sufficient)";
    return "Very High (Excessive)";
}

function getPhosphorusStatus(p) {
    if (p < 10) return "Very Low (Deficient)";
    if (p >= 10 && p < 20) return "Low (Marginal)";
    if (p >= 20 && p <= 40) return "Normal (Adequate)";
    if (p > 40 && p <= 60) return "High (Sufficient)";
    return "Very High (Excessive)";
}

function getPotassiumStatus(k) {
    if (k < 100) return "Very Low (Deficient)";
    if (k >= 100 && k < 200) return "Low (Marginal)";
    if (k >= 200 && k <= 300) return "Normal (Adequate)";
    if (k > 300 && k <= 400) return "High (Sufficient)";
    return "Very High (Excessive)";
}

function getPHStatus(ph) {
    if (ph < 4.5) return "Extremely Acidic";
    if (ph >= 4.5 && ph < 5.5) return "Strongly Acidic";
    if (ph >= 5.5 && ph < 6.5) return "Moderately Acidic";
    if (ph >= 6.5 && ph <= 7.3) return "Neutral (Ideal)";
    if (ph > 7.3 && ph <= 8.4) return "Alkaline";
    return "Strongly Alkaline";
}

function getTemperatureStatus(temp) {
    if (temp < 10) return "Very Low (Cold Stress)";
    if (temp >= 10 && temp < 18) return "Low (Suboptimal)";
    if (temp >= 18 && temp <= 30) return "Normal (Optimal Growth)";
    if (temp > 30 && temp <= 35) return "High (Heat Stress Possible)";
    return "Very High (Extreme Heat Stress)";
}

function getHumidityStatus(humidity) {
    if (humidity < 40) return "Low (Risk of Dehydration)";
    if (humidity >= 40 && humidity <= 70) return "Normal (Ideal)";
    if (humidity > 70 && humidity <= 85) return "High (Risk of Fungal Diseases)";
    return "Very High (High Risk of Diseases)";
}
function getMoistureStatus(moisture) {
    if (moisture < 30) return "Dry (Needs Irrigation)";
    if (moisture >= 30 && moisture <= 80) return "Normal (Adequate Moisture)";
    return "High (Waterlogged - Risk of Root Rot)";
}
function getLightCondition(light) {
    if (light < 10) return "Dark (Night or No Light)";
    if (light >= 10 && light < 100) return "Very Dim (Dawn/Dusk, Indoor Low Light)";
    if (light >= 100 && light < 1000) return "Cloudy (Overcast or Shade)";
    if (light >= 1000 && light < 10000) return "Partly Sunny (Bright but Not Direct Sun)";
    if (light >= 10000 && light < 50000) return "Sunny (Direct Sunlight)";
    return "Very Bright (Extreme Light, Possible Glare)";
}