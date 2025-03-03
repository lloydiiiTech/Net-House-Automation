const { realtimeDB } = require("../config/firebase.js");
exports.Dashboard = async (req, res) => {
    const sensorRef = realtimeDB.ref("sensors");

    sensorRef.once("value", (snapshot) => {
        const data = snapshot.val();
        
        // Compute statuses
        const sensorData = {
            temperature: { value: data.temperature, status: getTemperatureStatus(data.temperature) },
            humidity: { value: data.humidity, status: getHumidityStatus(data.humidity) },
            moisture: { value: data.moistureAve, status: getMoistureStatus(data.moistureAve) },
            light: { value: data.light, status: getLightCondition(data.light) },
        };

        res.render("admin/home", { sensorData }); 
    });
};

// API Route for AJAX requests (returns JSON)
exports.getSensorData = async (req, res) => {
    const sensorRef = realtimeDB.ref("sensors");

    sensorRef.once("value", (snapshot) => {
        const data = snapshot.val();
        
        // Compute statuses
        const sensorData = {
            temperature: { value: data.temperature, status: getTemperatureStatus(data.temperature) },
            humidity: { value: data.humidity, status: getHumidityStatus(data.humidity) },
            moisture: { value: data.moistureAve, status: getMoistureStatus(data.moistureAve) },
            light: { value: data.light, status: getLightCondition(data.light) },
        };

        res.json(sensorData); // Send JSON response
    });
};
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
    if (moisture < 300) return "Dry (Needs Irrigation)";
    if (moisture >= 300 && moisture <= 800) return "Normal (Adequate Moisture)";
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



exports.plantOverview = async (req, res) => {
    

    res.render("admin/plants");  
};


exports.irrigationControll = async (req, res) => {
    

    res.render("admin/irrigation");  
};


exports.userManagement = async (req, res) => {
    

    res.render("admin/user-management");  
};


exports.reportsAnalytics = async (req, res) => {
    

    res.render("admin/reports");  
};