const { firestore, admin } = require('../config/firebase');

async function ensureSensorData() {
    try {
        console.log('Checking for sensor data...');
        const sensorSnapshot = await firestore.collection('daily_sensor_summaries')
            .orderBy('period_start', 'desc')
            .limit(1)
            .get();

        if (sensorSnapshot.empty) {
            console.log('No sensor data found, creating test data...');
            const now = new Date();
            const testData = {
                period_start: admin.firestore.Timestamp.fromDate(now),
                period_end: admin.firestore.Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
                data_points: 24,
                temperature: {
                    average: 25.5,
                    min: 22.0,
                    max: 28.0,
                    count: 24
                },
                humidity: {
                    average: 65.0,
                    min: 60.0,
                    max: 70.0,
                    count: 24
                },
                moistureAve: {
                    average: 75.0,
                    min: 70.0,
                    max: 80.0,
                    count: 24
                },
                light: {
                    average: 8000,
                    min: 5000,
                    max: 10000,
                    count: 24
                },
                ph: {
                    average: 6.5,
                    min: 6.0,
                    max: 7.0,
                    count: 24
                },
                nitrogen: {
                    average: 25.0,
                    min: 20.0,
                    max: 30.0,
                    count: 24
                },
                phosphorus: {
                    average: 15.0,
                    min: 10.0,
                    max: 20.0,
                    count: 24
                },
                potassium: {
                    average: 20.0,
                    min: 15.0,
                    max: 25.0,
                    count: 24
                }
            };

            await firestore.collection('daily_sensor_summaries').add(testData);
            console.log('Test sensor data created successfully');
            return testData;
        }

        console.log('Existing sensor data found');
        return sensorSnapshot.docs[0].data();
    } catch (error) {
        console.error('Error in ensureSensorData:', error);
        throw error;
    }
}

async function ensureTestData() {
    try {
        console.log('Checking for sensor data...');
        const sensorSnapshot = await firestore.collection('daily_sensor_summaries')
            .orderBy('period_start', 'desc')
            .limit(1)
            .get();

        if (sensorSnapshot.empty) {
            console.log('No sensor data found, creating test data...');
            const now = new Date();
            const testData = {
                period_start: admin.firestore.Timestamp.fromDate(now),
                period_end: admin.firestore.Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
                data_points: 24,
                temperature: {
                    average: 25.5,
                    min: 22.0,
                    max: 28.0,
                    count: 24
                },
                humidity: {
                    average: 65.0,
                    min: 60.0,
                    max: 70.0,
                    count: 24
                },
                moistureAve: {
                    average: 75.0,
                    min: 70.0,
                    max: 80.0,
                    count: 24
                },
                light: {
                    average: 8000,
                    min: 5000,
                    max: 10000,
                    count: 24
                },
                ph: {
                    average: 6.5,
                    min: 6.0,
                    max: 7.0,
                    count: 24
                },
                nitrogen: {
                    average: 25.0,
                    min: 20.0,
                    max: 30.0,
                    count: 24
                },
                phosphorus: {
                    average: 15.0,
                    min: 10.0,
                    max: 20.0,
                    count: 24
                },
                potassium: {
                    average: 20.0,
                    min: 15.0,
                    max: 25.0,
                    count: 24
                }
            };

            await firestore.collection('daily_sensor_summaries').add(testData);
            console.log('Test data created successfully');
            return testData;
        }

        console.log('Existing sensor data found');
        return sensorSnapshot.docs[0].data();
    } catch (error) {
        console.error('Error in ensureTestData:', error);
        throw error;
    }
}

exports.reportsAnalytics = async (req, res) => {
    try {
        // Get user data from session
        const userId = req.session.user?.uid;
        let userData = null;
        
        if (userId) {
            try {
                const userDoc = await firestore.collection('users').doc(userId).get();
                if (userDoc.exists) {
                    userData = userDoc.data();
                    userData.id = userDoc.id;
                    // Set default profile picture if none exists
                    userData.profilePicture = userData.profilePicture || '/assets/img/default-avatar.png';
                }
            } catch (error) {
                console.error('Error fetching user data:', error);
            }
        }

        // Get latest sensor data
        const sensorSnapshot = await firestore.collection('daily_sensor_summaries')
            .orderBy('period_start', 'desc')
            .limit(1)
            .get();

        // Get all registered crops
        const cropsSnapshot = await firestore.collection('crops')
            .where('isRegistered', '==', true)
            .get();

        // Get all planted crops (both active and harvested) - Modified query to avoid index requirement
        const plantedSnapshot = await firestore.collection('planted_crops')
            .where('isRegistered', '==', true)
            .get();

        // Format sensor data
        const sensorData = sensorSnapshot.empty ? {} : {
            ...sensorSnapshot.docs[0].data(),
            period_start: sensorSnapshot.docs[0].data().period_start.toDate(),
            temperature: {
                average: sensorSnapshot.docs[0].data().temperature?.average || 0,
                min: sensorSnapshot.docs[0].data().temperature?.min || 0,
                max: sensorSnapshot.docs[0].data().temperature?.max || 0
            },
            humidity: {
                average: sensorSnapshot.docs[0].data().humidity?.average || 0,
                min: sensorSnapshot.docs[0].data().humidity?.min || 0,
                max: sensorSnapshot.docs[0].data().humidity?.max || 0
            },
            moistureAve: {
                average: sensorSnapshot.docs[0].data().moistureAve?.average || 0,
                min: sensorSnapshot.docs[0].data().moistureAve?.min || 0,
                max: sensorSnapshot.docs[0].data().moistureAve?.max || 0
            },
            light: {
                average: sensorSnapshot.docs[0].data().light?.average || 0,
                min: sensorSnapshot.docs[0].data().light?.min || 0,
                max: sensorSnapshot.docs[0].data().light?.max || 0
            },
            ph: {
                average: sensorSnapshot.docs[0].data().ph?.average || 0,
                min: sensorSnapshot.docs[0].data().ph?.min || 0,
                max: sensorSnapshot.docs[0].data().ph?.max || 0
            },
            nitrogen: {
                average: sensorSnapshot.docs[0].data().nitrogen?.average || 0,
                min: sensorSnapshot.docs[0].data().nitrogen?.min || 0,
                max: sensorSnapshot.docs[0].data().nitrogen?.max || 0
            },
            phosphorus: {
                average: sensorSnapshot.docs[0].data().phosphorus?.average || 0,
                min: sensorSnapshot.docs[0].data().phosphorus?.min || 0,
                max: sensorSnapshot.docs[0].data().phosphorus?.max || 0
            },
            potassium: {
                average: sensorSnapshot.docs[0].data().potassium?.average || 0,
                min: sensorSnapshot.docs[0].data().potassium?.min || 0,
                max: sensorSnapshot.docs[0].data().potassium?.max || 0
            }
        };

        // Format registered crops (only optimal conditions)
        const registeredCrops = cropsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                optimal_temperature: data.optimal_temperature,
                optimal_humidity: data.optimal_humidity,
                optimal_moisture: data.optimal_moisture,
                optimal_light: data.optimal_light,
                optimal_ph: data.optimal_ph,
                optimal_n: data.optimal_n,
                optimal_p: data.optimal_p,
                optimal_k: data.optimal_k,
                priority: data.priority
            };
        });

        // Format planted crops (with history and performance)
        const plantedCrops = plantedSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                startDate: data.startDate?.toDate(),
                endDate: data.endDate?.toDate(),
                status: data.status,
                successRate: data.successRate,
                score: data.score,
                ruleBasedScore: data.ruleBasedScore,
                parameterMatches: {
                    humidity: data.parameterMatches?.humidity || 0,
                    light: data.parameterMatches?.light || 0,
                    moisture: data.parameterMatches?.moisture || 0,
                    npk_K: data.parameterMatches?.npk_K || 0,
                    npk_N: data.parameterMatches?.npk_N || 0,
                    npk_P: data.parameterMatches?.npk_P || 0,
                    ph: data.parameterMatches?.ph || 0,
                    temperature: data.parameterMatches?.temperature || 0
                },
                optimalConditions: {
                    humidity: data.optimalConditions?.humidity || 0,
                    light: data.optimalConditions?.light || 0,
                    moisture: data.optimalConditions?.moisture || 0,
                    npk_K: data.optimalConditions?.npk_K || 0,
                    npk_N: data.optimalConditions?.npk_N || 0,
                    npk_P: data.optimalConditions?.npk_P || 0,
                    ph: data.optimalConditions?.ph || 0,
                    temperature: data.optimalConditions?.temperature || 0
                },
                userEmail: data.userEmail,
                userName: data.userName,
                lastUpdated: data.lastUpdated
            };
        });

        // Sort planted crops by startDate in memory
        plantedCrops.sort((a, b) => {
            if (!a.startDate || !b.startDate) return 0;
            return b.startDate - a.startDate;
        });
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/reports', {
            user: userData || {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            },
            sensorData,
            registeredCrops,
            plantedCrops
        });}
        else{
            res.render('reports', {
                user: userData || {
                    name: 'User',
                    role: 'User',
                    profilePicture: '/assets/img/default-avatar.png'
                },
                sensorData,
                registeredCrops,
                plantedCrops
            });
        }
    } catch (error) {
        console.error('Error rendering reports page:', error);
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/reports', {
            user: {
                name: 'Admin',
                role: 'Admin',
                profilePicture: '/assets/img/default-avatar.png'
            },
            sensorData: {},
            registeredCrops: [],
            plantedCrops: []
        });} else {
            res.render('reports', {
                user: {
                    name: 'User',
                    role: 'User',
                    profilePicture: '/assets/img/default-avatar.png'
                },
                sensorData: {},
                registeredCrops: [],
                plantedCrops: []
            });
        }
    }
};

exports.getSensorData = async (req, res) => {
    try {
        console.log('Fetching sensor data...');
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 10;
        const lastDoc = req.query.lastDoc ? JSON.parse(req.query.lastDoc) : null;
        
        let query = firestore.collection('daily_sensor_summaries')
            .orderBy('period_start', 'desc')
            .limit(pageSize);

        if (lastDoc) {
            query = query.startAfter(lastDoc);
        }

        const sensorSnapshot = await query.get();
        
        if (sensorSnapshot.empty) {
            console.log('No sensor data found, creating test data...');
            // Create test data for 10 days
            const testData = [];
            for (let i = 0; i < 10; i++) {
                const now = new Date();
                now.setDate(now.getDate() - i);
                const data = {
                    period_start: admin.firestore.Timestamp.fromDate(now),
                    period_end: admin.firestore.Timestamp.fromDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
                    data_points: 24,
                    temperature: {
                        average: 25.5 + (Math.random() * 2 - 1),
                        min: 22.0 + (Math.random() * 2 - 1),
                        max: 28.0 + (Math.random() * 2 - 1),
                        count: 24
                    },
                    humidity: {
                        average: 65.0 + (Math.random() * 5 - 2.5),
                        min: 60.0 + (Math.random() * 2 - 1),
                        max: 70.0 + (Math.random() * 2 - 1),
                        count: 24
                    },
                    moistureAve: {
                        average: 75.0 + (Math.random() * 5 - 2.5),
                        min: 70.0 + (Math.random() * 2 - 1),
                        max: 80.0 + (Math.random() * 2 - 1),
                        count: 24
                    },
                    light: {
                        average: 8000 + (Math.random() * 1000 - 500),
                        min: 5000 + (Math.random() * 500 - 250),
                        max: 10000 + (Math.random() * 500 - 250),
                        count: 24
                    },
                    ph: {
                        average: 6.5 + (Math.random() * 0.4 - 0.2),
                        min: 6.0 + (Math.random() * 0.2 - 0.1),
                        max: 7.0 + (Math.random() * 0.2 - 0.1),
                        count: 24
                    },
                    nitrogen: {
                        average: 25.0 + (Math.random() * 4 - 2),
                        min: 20.0 + (Math.random() * 2 - 1),
                        max: 30.0 + (Math.random() * 2 - 1),
                        count: 24
                    },
                    phosphorus: {
                        average: 15.0 + (Math.random() * 4 - 2),
                        min: 10.0 + (Math.random() * 2 - 1),
                        max: 20.0 + (Math.random() * 2 - 1),
                        count: 24
                    },
                    potassium: {
                        average: 20.0 + (Math.random() * 4 - 2),
                        min: 15.0 + (Math.random() * 2 - 1),
                        max: 25.0 + (Math.random() * 2 - 1),
                        count: 24
                    }
                };
                await firestore.collection('daily_sensor_summaries').add(data);
                testData.push(data);
            }
            console.log('Test data created successfully');
            return res.json({ 
                daily_sensor_summaries: testData,
                hasMore: false,
                lastDoc: null,
                totalEntries: testData.length
            });
        }

        const sensorData = sensorSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                period_start: data.period_start.toDate(),
                period_end: data.period_end.toDate(),
                data_points: data.data_points || 0,
                temperature: {
                    average: data.temperature?.average || 0,
                    min: data.temperature?.min || 0,
                    max: data.temperature?.max || 0,
                    count: data.temperature?.count || 0
                },
                humidity: {
                    average: data.humidity?.average || 0,
                    min: data.humidity?.min || 0,
                    max: data.humidity?.max || 0,
                    count: data.humidity?.count || 0
                },
                moistureAve: {
                    average: data.moistureAve?.average || 0,
                    min: data.moistureAve?.min || 0,
                    max: data.moistureAve?.max || 0,
                    count: data.moistureAve?.count || 0
                },
                light: {
                    average: data.light?.average || 0,
                    min: data.light?.min || 0,
                    max: data.light?.max || 0,
                    count: data.light?.count || 0
                },
                ph: {
                    average: data.ph?.average || 0,
                    min: data.ph?.min || 0,
                    max: data.ph?.max || 0,
                    count: data.ph?.count || 0
                },
                nitrogen: {
                    average: data.nitrogen?.average || 0,
                    min: data.nitrogen?.min || 0,
                    max: data.nitrogen?.max || 0,
                    count: data.nitrogen?.count || 0
                },
                phosphorus: {
                    average: data.phosphorus?.average || 0,
                    min: data.phosphorus?.min || 0,
                    max: data.phosphorus?.max || 0,
                    count: data.phosphorus?.count || 0
                },
                potassium: {
                    average: data.potassium?.average || 0,
                    min: data.potassium?.min || 0,
                    max: data.potassium?.max || 0,
                    count: data.potassium?.count || 0
                }
            };
        });

        // Get the last document for pagination
        const lastVisible = sensorSnapshot.docs[sensorSnapshot.docs.length - 1];
        
        // Check if there are more documents
        const nextQuery = firestore.collection('daily_sensor_summaries')
            .orderBy('period_start', 'desc')
            .startAfter(lastVisible)
            .limit(1);
        const nextSnapshot = await nextQuery.get();
        const hasMore = !nextSnapshot.empty;

        // Get total count
        const totalSnapshot = await firestore.collection('daily_sensor_summaries').count().get();
        const totalEntries = totalSnapshot.data().count;

        console.log('Formatted sensor data:', sensorData);
        res.json({ 
            daily_sensor_summaries: sensorData,
            hasMore,
            lastDoc: lastVisible ? {
                period_start: lastVisible.data().period_start,
                id: lastVisible.id
            } : null,
            totalEntries
        });
    } catch (error) {
        console.error('Error fetching sensor data:', error);
        res.status(500).json({ error: "Failed to fetch sensor data" });
    }
};

exports.checkSensorData = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.json({ hasData: false });
        }
        const start = admin.firestore.Timestamp.fromDate(new Date(startDate));
        const end = admin.firestore.Timestamp.fromDate(new Date(endDate));
        const snapshot = await firestore.collection('daily_sensor_summaries')
            .where('timestamp', '>=', start)
            .where('timestamp', '<=', end)
            .limit(1)
            .get();
        res.json({ hasData: !snapshot.empty });
    } catch (error) {
        res.json({ hasData: false });
    }
};

exports.downloadSensorData = async (req, res) => {
    try {
        const { startDate, endDate, format = 'csv', type = 'sensor' } = req.query;
        
        if (!startDate && !endDate) {
            return res.status(400).json({ error: "Start date or end date is required" });
        }

        // Date filtering logic (match reportDailySensorsController.js)
        let start, end;
        if (startDate && !endDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(startDate);
            end.setHours(23, 59, 59, 999);
        } else if (!startDate && endDate) {
            start = new Date(endDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        } else if (startDate && endDate) {
            start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
        }
        
        let data = [];
        
        if (type === 'sensor' || type === 'all') {
            let query = firestore.collection('daily_sensor_summaries');
            if (start && end) {
                query = query
                    .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(start))
                    .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(end));
            }
            query = query.orderBy('timestamp', 'asc');

            const sensorSnapshot = await query.get();

            data = sensorSnapshot.docs.map(doc => {
                const sensorData = doc.data();
                return {
                    Date: sensorData.timestamp && sensorData.timestamp.toDate
                        ? sensorData.timestamp.toDate().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
                        : '',
                    'Temperature Avg (°C)': sensorData.temperature?.average || 0,
                    'Temperature Min (°C)': sensorData.temperature?.min || 0,
                    'Temperature Max (°C)': sensorData.temperature?.max || 0,
                    'Humidity Avg (%)': sensorData.humidity?.average || 0,
                    'Humidity Min (%)': sensorData.humidity?.min || 0,
                    'Humidity Max (%)': sensorData.humidity?.max || 0,
                    'Soil Moisture Avg (%)': sensorData.moistureAve?.average || 0,
                    'Soil Moisture Min (%)': sensorData.moistureAve?.min || 0,
                    'Soil Moisture Max (%)': sensorData.moistureAve?.max || 0,
                    'Light Avg (lux)': sensorData.light?.average || 0,
                    'Light Min (lux)': sensorData.light?.min || 0,
                    'Light Max (lux)': sensorData.light?.max || 0,
                    'pH Avg': sensorData.ph?.average || 0,
                    'pH Min': sensorData.ph?.min || 0,
                    'pH Max': sensorData.ph?.max || 0,
                    'Nitrogen Avg': sensorData.nitrogen?.average || 0,
                    'Nitrogen Min': sensorData.nitrogen?.min || 0,
                    'Nitrogen Max': sensorData.nitrogen?.max || 0,
                    'Phosphorus Avg': sensorData.phosphorus?.average || 0,
                    'Phosphorus Min': sensorData.phosphorus?.min || 0,
                    'Phosphorus Max': sensorData.phosphorus?.max || 0,
                    'Potassium Avg': sensorData.potassium?.average || 0,
                    'Potassium Min': sensorData.potassium?.min || 0,
                    'Potassium Max': sensorData.potassium?.max || 0,
                    'Data Points': sensorData.data_points || 0
                };
            });
        }

        // IRRIGATION EXPORT SUPPORT
        if (type === 'irrigation') {
            let query = firestore.collection('irrigation_records');
            if (start && end) {
                query = query
                    .where('date', '>=', admin.firestore.Timestamp.fromDate(start))
                    .where('date', '<=', admin.firestore.Timestamp.fromDate(end));
            }
            query = query.orderBy('date', 'asc');
            const irrigationSnapshot = await query.get();
            data = irrigationSnapshot.docs.map(doc => {
                const d = doc.data();
                return {
                    Date: d.date && d.date.toDate ? d.date.toDate().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : '',
                    'Start Time': d.startTime && d.startTime.toDate ? d.startTime.toDate().toLocaleTimeString('en-CA', { timeZone: 'Asia/Manila' }) : '',
                    'End Time': d.endTime && d.endTime.toDate ? d.endTime.toDate().toLocaleTimeString('en-CA', { timeZone: 'Asia/Manila' }) : '',
                    'Duration (min)': d.duration || '',
                    'Moisture Before': d.moistureBefore || '',
                    'Moisture After': d.moistureAfter || '',
                    Note: d.note || '',
                    Status: d.status || ''
                };
            });
        }

        if (type === 'crops' || type === 'all') {
            const cropsSnapshot = await firestore.collection('planted_crops')
                .where('startDate', '>=', admin.firestore.Timestamp.fromDate(start))
                .where('startDate', '<=', admin.firestore.Timestamp.fromDate(end))
                .orderBy('startDate', 'asc')
                .get();

            const cropsData = cropsSnapshot.docs.map(doc => {
                const cropData = doc.data();
                return {
                    crop_name: cropData.name,
                    start_date: cropData.startDate?.toDate().toISOString().split('T')[0],
                    end_date: cropData.endDate?.toDate().toISOString().split('T')[0],
                    status: cropData.status,
                    success_rate: cropData.successRate,
                    score: cropData.score,
                    temperature_match: cropData.parameterMatches?.temperature || 0,
                    humidity_match: cropData.parameterMatches?.humidity || 0,
                    moisture_match: cropData.parameterMatches?.moisture || 0,
                    light_match: cropData.parameterMatches?.light || 0,
                    ph_match: cropData.parameterMatches?.ph || 0,
                    npk_n_match: cropData.parameterMatches?.npk_N || 0,
                    npk_p_match: cropData.parameterMatches?.npk_P || 0,
                    npk_k_match: cropData.parameterMatches?.npk_K || 0
                };
            });

            if (type === 'all') {
                data = {
                    sensor_data: data,
                    crops_data: cropsData
                };
            } else {
                data = cropsData;
            }
        }

        if (format === 'json') {
            res.json({ data });
        } else if (format === 'excel') {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            let sheet;
            if (type === 'irrigation') {
                sheet = workbook.addWorksheet('Irrigation Records');
                // Header
                sheet.mergeCells('A1:H1');
                sheet.getCell('A1').value = 'NetHouseAutomation';
                sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
                sheet.getCell('A1').font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
                sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
                sheet.mergeCells('A2:H2');
                sheet.getCell('A2').value = 'Irrigation Records Report';
                sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
                sheet.getCell('A2').font = { bold: true, size: 14, color: { argb: 'FFE3EEFD' } };
                sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
                sheet.mergeCells('A3:H3');
                sheet.getCell('A3').value = `Period: ${startDate} to ${endDate}    Generated on: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`;
                sheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' };
                sheet.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF34495E' } };
                // Header row
                const headerRow = ['Date', 'Start Time', 'End Time', 'Duration (min)', 'Moisture Before', 'Moisture After', 'Note', 'Status'];
                sheet.addRow(headerRow);
                const headerRowIdx = 4;
                const row = sheet.getRow(headerRowIdx);
                row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                row.alignment = { vertical: 'middle', horizontal: 'center' };
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
                // Data rows
                data.forEach((row, idx) => {
                    const excelRow = [row['Date'], row['Start Time'], row['End Time'], row['Duration (min)'], row['Moisture Before'], row['Moisture After'], row['Note'], row['Status']];
                    sheet.addRow(excelRow);
                });
                // Alternating row colors and grid lines
                for (let i = headerRowIdx + 1; i <= sheet.rowCount; i++) {
                    const row = sheet.getRow(i);
                    row.eachCell(cell => {
                        cell.border = { top: { style: 'thin', color: { argb: 'FFE3EEFD' } }, left: { style: 'thin', color: { argb: 'FFE3EEFD' } }, bottom: { style: 'thin', color: { argb: 'FFE3EEFD' } }, right: { style: 'thin', color: { argb: 'FFE3EEFD' } } };
                        if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
                    });
                }
                // Footer row
                const footerRow = sheet.addRow([
                    '', '', '', '', '', '', '',
                    `© 2025 NetHouseAutomation - All rights reserved.`
                ]);
                footerRow.font = { italic: true, size: 9, color: { argb: 'FF7A8CA3' } };
                // Auto-fit columns
                sheet.columns.forEach(col => { col.width = col.header ? Math.max(13, col.header.length + 2) : 13; });
                workbook.xlsx.writeBuffer().then(buffer => {
                    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    res.setHeader('Content-Disposition', `attachment; filename=${type}-data-${startDate}-to-${endDate}.xlsx`);
                    res.send(buffer);
                });
                return;
            }
            // 1. Colored header bar with centered title
            sheet.mergeCells('A1:I1');
            sheet.getCell('A1').value = 'NetHouseAutomation';
            sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getCell('A1').font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
            sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
            sheet.mergeCells('A2:I2');
            sheet.getCell('A2').value = 'Sensor Data Report';
            sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getCell('A2').font = { bold: true, size: 14, color: { argb: 'FFE3EEFD' } };
            sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
            // 2. Date range and generation timestamp
            sheet.mergeCells('A3:I3');
            sheet.getCell('A3').value = `Period: ${startDate} to ${endDate}    Generated on: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`;
            sheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF34495E' } };
            // 3. Summary section
            let summaryRowIdx = 5;
            if (data.length > 0) {
                const avg = (arr, key) => arr.reduce((a, b) => a + (Number(b[key]) || 0), 0) / arr.length;
                const summary = {
                    temp: avg(data, 'Temperature Avg (°C)'),
                    humidity: avg(data, 'Humidity Avg (%)'),
                    moisture: avg(data, 'Soil Moisture Avg (%)'),
                    light: avg(data, 'Light Avg (lux)'),
                    ph: avg(data, 'pH Avg'),
                    n: avg(data, 'Nitrogen Avg'),
                    p: avg(data, 'Phosphorus Avg'),
                    k: avg(data, 'Potassium Avg'),
                    points: data.reduce((a, b) => a + (Number(b['Data Points']) || 0), 0)
                };
                sheet.mergeCells(`A${summaryRowIdx}:I${summaryRowIdx}`);
                sheet.getCell(`A${summaryRowIdx}`).value = 'Summary for Selected Period:';
                sheet.getCell(`A${summaryRowIdx}`).font = { bold: true, size: 11, color: { argb: 'FF2C3E50' } };
                sheet.getCell(`A${summaryRowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EEFD' } };
                summaryRowIdx++;
                sheet.mergeCells(`A${summaryRowIdx}:I${summaryRowIdx}`);
                sheet.getCell(`A${summaryRowIdx}`).value =
                    `Avg Temp: ${summary.temp.toFixed(1)}°C   Avg Humidity: ${summary.humidity.toFixed(1)}%   Avg Soil Moisture: ${summary.moisture.toFixed(1)}%   Avg Light: ${summary.light.toFixed(1)} lux   Avg pH: ${summary.ph.toFixed(2)}   Avg N: ${summary.n.toFixed(1)}   Avg P: ${summary.p.toFixed(1)}   Avg K: ${summary.k.toFixed(1)}   Total Data Points: ${summary.points}`;
                sheet.getCell(`A${summaryRowIdx}`).font = { size: 10, color: { argb: 'FF34495E' } };
                sheet.getCell(`A${summaryRowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
                summaryRowIdx++;
            }
            // 4. Single-level header row
            const paramNames = [
                'Temperature Avg (°C)', 'Humidity Avg (%)', 'Soil Moisture Avg (%)', 'Light Avg (lux)', 'pH Avg', 'Nitrogen Avg', 'Phosphorus Avg', 'Potassium Avg'
            ];
            const headerRow = ['Date', ...paramNames, 'Data Points'];
            sheet.addRow(headerRow);
            // Style header row
            const headerRowIdx = summaryRowIdx;
            const row = sheet.getRow(headerRowIdx);
            row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            row.alignment = { vertical: 'middle', horizontal: 'center' };
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
            // 5. Add data rows
            data.forEach((row, idx) => {
                const excelRow = [row.Date];
                [
                    'Temperature Avg (°C)',
                    'Humidity Avg (%)',
                    'Soil Moisture Avg (%)',
                    'Light Avg (lux)',
                    'pH Avg',
                    'Nitrogen Avg',
                    'Phosphorus Avg',
                    'Potassium Avg'
                ].forEach(k => {
                    let val = row[k];
                    if (typeof val === 'number') val = Number(val).toFixed(1);
                    excelRow.push(val);
                });
                excelRow.push(row['Data Points']);
                sheet.addRow(excelRow);
            });
            // 6. Alternating row colors and grid lines
            for (let i = headerRowIdx + 1; i <= sheet.rowCount; i++) {
                const row = sheet.getRow(i);
                row.eachCell(cell => {
                    cell.border = { top: { style: 'thin', color: { argb: 'FFE3EEFD' } }, left: { style: 'thin', color: { argb: 'FFE3EEFD' } }, bottom: { style: 'thin', color: { argb: 'FFE3EEFD' } }, right: { style: 'thin', color: { argb: 'FFE3EEFD' } } };
                    if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
                });
            }
            // 7. Summary row at the bottom
            const totalPoints = data.reduce((a, b) => a + (Number(b['Data Points']) || 0), 0);
            const summaryRow = sheet.addRow(['TOTAL', ...Array(headerRow.length - 2).fill(''), totalPoints]);
            summaryRow.font = { bold: true, color: { argb: 'FF207D2A' } };
            summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAFFEA' } };
            // 8. Footer row
            const footerRow = sheet.addRow([
                '', '', '', '', '', '', '', '', '',
                `© 2025 NetHouseAutomation - All rights reserved.`
            ]);
            footerRow.font = { italic: true, size: 9, color: { argb: 'FF7A8CA3' } };
            // 9. Auto-fit columns
            sheet.columns.forEach(col => { col.width = col.header ? Math.max(13, col.header.length + 2) : 13; });
            workbook.xlsx.writeBuffer().then(buffer => {
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=${type}-data-${startDate}-to-${endDate}.xlsx`);
                res.send(buffer);
            });
        } else if (format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-data-${startDate}-to-${endDate}.pdf`);
            doc.pipe(res);
            if (type === 'irrigation') {
                // Header bar
                doc.rect(doc.x, doc.y, doc.page.width - 2 * doc.options.margin, 32).fill('#5b9bd5');
                doc.fontSize(22).fillColor('#fff').font('Helvetica-Bold').text('NetHouseAutomation', { align: 'center', baseline: 'middle' });
                doc.fontSize(14).fillColor('#e3eefd').font('Helvetica').text('Irrigation Records Report', { align: 'center' });
                doc.moveDown(0.5);
                doc.fontSize(12).fillColor('#34495e').text(`Period: ${startDate} to ${endDate}`, { align: 'left' });
                doc.fontSize(9).fillColor('#7a8ca3').text(`Generated on: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`, { align: 'left' });
                doc.moveDown(1.2);
                // Table header
                const headers = ['Date', 'Start Time', 'End Time', 'Duration (min)', 'Moisture Before', 'Moisture After', 'Note', 'Status'];
                const colWidths = [60, 60, 60, 60, 60, 60, 120, 60];
                let x = doc.x, y = doc.y;
                doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff').rect(x, y, colWidths.reduce((a,b)=>a+b,0), 22).fill('#5b9bd5');
                let colX = x;
                headers.forEach((name, i) => {
                    doc.fillColor('#fff').text(name, colX + 2, y + 6, { width: colWidths[i] - 4, align: 'center' });
                    colX += colWidths[i];
                });
                y += 22;
                // Data rows
                data.forEach((row, idx) => {
                    let rowColor = idx % 2 === 0 ? '#f4f7fa' : '#fff';
                    doc.rect(x, y, colWidths.reduce((a,b)=>a+b,0), 20).fill(rowColor);
                    colX = x;
                    headers.forEach((k, i) => {
                        let val = row[k];
                        if (typeof val === 'number') val = Number(val).toFixed(1);
                        doc.font('Helvetica').fillColor('#2c3e50').fontSize(8).text(val, colX + 2, y + 6, { width: colWidths[i] - 4, align: 'center' });
                        colX += colWidths[i];
                    });
                    y += 20;
                    // Draw grid lines
                    let gridX = x;
                    for (let i = 0; i < colWidths.length; i++) {
                        doc.moveTo(gridX, y - 20).lineTo(gridX, y).strokeColor('#e3eefd').lineWidth(0.5).stroke();
                        gridX += colWidths[i];
                    }
                    doc.moveTo(x, y).lineTo(x + colWidths.reduce((a,b)=>a+b,0), y).strokeColor('#e3eefd').lineWidth(0.5).stroke();
                    if (y > doc.page.height - 60) {
                        doc.addPage();
                        y = doc.y;
                        // Redraw header
                        let colX2 = x;
                        doc.font('Helvetica-Bold').fontSize(9).fillColor('#5b9bd5').rect(x, y, colWidths.reduce((a,b)=>a+b,0), 22).fill('#5b9bd5');
                        headers.forEach((name, i) => {
                            doc.fillColor('#fff').text(name, colX2 + 2, y + 6, { width: colWidths[i] - 4, align: 'center' });
                            colX2 += colWidths[i];
                        });
                        y += 22;
                    }
                });
                // Footer with page numbers
                const pageCount = doc.bufferedPageRange().count;
                for (let i = 0; i < pageCount; i++) {
                    doc.switchToPage(i);
                    doc.fontSize(8).fillColor('#7a8ca3').text(`Page ${i + 1} of ${pageCount}`, 0, doc.page.height - 40, { align: 'center' });
                    doc.fontSize(8).fillColor('#7a8ca3').text('© 2025 NetHouseAutomation - All rights reserved.', 40, doc.page.height - 40, { align: 'left' });
                }
                doc.end();
                return;
            }
            // 1. Colored header bar with centered title
            sheet.mergeCells('A1:I1');
            sheet.getCell('A1').value = 'NetHouseAutomation';
            sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getCell('A1').font = { bold: true, size: 20, color: { argb: 'FFFFFFFF' } };
            sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
            sheet.mergeCells('A2:I2');
            sheet.getCell('A2').value = 'Sensor Data Report';
            sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getCell('A2').font = { bold: true, size: 14, color: { argb: 'FFE3EEFD' } };
            sheet.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
            // 2. Date range and generation timestamp
            sheet.mergeCells('A3:I3');
            sheet.getCell('A3').value = `Period: ${startDate} to ${endDate}    Generated on: ${new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })}`;
            sheet.getCell('A3').alignment = { vertical: 'middle', horizontal: 'center' };
            sheet.getCell('A3').font = { italic: true, size: 10, color: { argb: 'FF34495E' } };
            // 3. Summary section
            let summaryRowIdx = 5;
            if (data.length > 0) {
                const avg = (arr, key) => arr.reduce((a, b) => a + (Number(b[key]) || 0), 0) / arr.length;
                const summary = {
                    temp: avg(data, 'Temperature Avg (°C)'),
                    humidity: avg(data, 'Humidity Avg (%)'),
                    moisture: avg(data, 'Soil Moisture Avg (%)'),
                    light: avg(data, 'Light Avg (lux)'),
                    ph: avg(data, 'pH Avg'),
                    n: avg(data, 'Nitrogen Avg'),
                    p: avg(data, 'Phosphorus Avg'),
                    k: avg(data, 'Potassium Avg'),
                    points: data.reduce((a, b) => a + (Number(b['Data Points']) || 0), 0)
                };
                sheet.mergeCells(`A${summaryRowIdx}:I${summaryRowIdx}`);
                sheet.getCell(`A${summaryRowIdx}`).value = 'Summary for Selected Period:';
                sheet.getCell(`A${summaryRowIdx}`).font = { bold: true, size: 11, color: { argb: 'FF2C3E50' } };
                sheet.getCell(`A${summaryRowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3EEFD' } };
                summaryRowIdx++;
                sheet.mergeCells(`A${summaryRowIdx}:I${summaryRowIdx}`);
                sheet.getCell(`A${summaryRowIdx}`).value =
                    `Avg Temp: ${summary.temp.toFixed(1)}°C   Avg Humidity: ${summary.humidity.toFixed(1)}%   Avg Soil Moisture: ${summary.moisture.toFixed(1)}%   Avg Light: ${summary.light.toFixed(1)} lux   Avg pH: ${summary.ph.toFixed(2)}   Avg N: ${summary.n.toFixed(1)}   Avg P: ${summary.p.toFixed(1)}   Avg K: ${summary.k.toFixed(1)}   Total Data Points: ${summary.points}`;
                sheet.getCell(`A${summaryRowIdx}`).font = { size: 10, color: { argb: 'FF34495E' } };
                sheet.getCell(`A${summaryRowIdx}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
                summaryRowIdx++;
            }
            // 4. Single-level header row
            const paramNames = [
                'Temperature Avg (°C)', 'Humidity Avg (%)', 'Soil Moisture Avg (%)', 'Light Avg (lux)', 'pH Avg', 'Nitrogen Avg', 'Phosphorus Avg', 'Potassium Avg'
            ];
            const headerRow = ['Date', ...paramNames, 'Data Points'];
            sheet.addRow(headerRow);
            // Style header row
            const headerRowIdx = summaryRowIdx;
            const row = sheet.getRow(headerRowIdx);
            row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            row.alignment = { vertical: 'middle', horizontal: 'center' };
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5B9BD5' } };
            // 5. Add data rows
            data.forEach((row, idx) => {
                const excelRow = [row.Date];
                [
                    'Temperature Avg (°C)',
                    'Humidity Avg (%)',
                    'Soil Moisture Avg (%)',
                    'Light Avg (lux)',
                    'pH Avg',
                    'Nitrogen Avg',
                    'Phosphorus Avg',
                    'Potassium Avg'
                ].forEach(k => {
                    let val = row[k];
                    if (typeof val === 'number') val = Number(val).toFixed(1);
                    excelRow.push(val);
                });
                excelRow.push(row['Data Points']);
                sheet.addRow(excelRow);
            });
            // 6. Alternating row colors and grid lines
            for (let i = headerRowIdx + 1; i <= sheet.rowCount; i++) {
                const row = sheet.getRow(i);
                row.eachCell(cell => {
                    cell.border = { top: { style: 'thin', color: { argb: 'FFE3EEFD' } }, left: { style: 'thin', color: { argb: 'FFE3EEFD' } }, bottom: { style: 'thin', color: { argb: 'FFE3EEFD' } }, right: { style: 'thin', color: { argb: 'FFE3EEFD' } } };
                    if (i % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FA' } };
                });
            }
            // 7. Summary row at the bottom
            const totalPoints = data.reduce((a, b) => a + (Number(b['Data Points']) || 0), 0);
            const summaryRow = sheet.addRow(['TOTAL', ...Array(headerRow.length - 2).fill(''), totalPoints]);
            summaryRow.font = { bold: true, color: { argb: 'FF207D2A' } };
            summaryRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAFFEA' } };
            // 8. Footer row
            const footerRow = sheet.addRow([
                '', '', '', '', '', '', '', '', '',
                `© 2025 NetHouseAutomation - All rights reserved.`
            ]);
            footerRow.font = { italic: true, size: 9, color: { argb: 'FF7A8CA3' } };
            // 9. Auto-fit columns
            sheet.columns.forEach(col => { col.width = col.header ? Math.max(13, col.header.length + 2) : 13; });
            workbook.xlsx.writeBuffer().then(buffer => {
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                res.setHeader('Content-Disposition', `attachment; filename=${type}-data-${startDate}-to-${endDate}.xlsx`);
                res.send(buffer);
            });
        } else {
            // CSV format
            const headers = Object.keys(data[0] || {});
            const csvContent = [
                headers.join(','),
                ...data.map(row => headers.map(header => row[header]).join(','))
            ].join('\n');

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-data-${startDate}-to-${endDate}.csv`);
            res.send(csvContent);
        }
    } catch (error) {
        console.error('Error downloading data:', error);
        res.status(500).json({ error: "Failed to download data" });
    }
};

exports.getCropData = async (req, res) => {
    try {
        const cropsSnapshot = await firestore.collection('crops')
            .where('isRegistered', '==', true)
            .get();
        
        const crops = cropsSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                optimal_temperature: data.optimal_temperature,
                optimal_humidity: data.optimal_humidity,
                optimal_moisture: data.optimal_moisture,
                optimal_light: data.optimal_light,
                optimal_ph: data.optimal_ph,
                optimal_n: data.optimal_n,
                optimal_p: data.optimal_p,
                optimal_k: data.optimal_k,
                priority: data.priority
            };
        });
        
        res.json({ crops });
    } catch (error) {
        console.error('Error fetching crop data:', error);
        res.status(500).json({ error: "Failed to fetch crop data" });
    }
};

exports.getPlantedCrops = async (req, res) => {
    try {
        console.log('Fetching planted crops...');
        // Modified query to avoid requiring composite index
        const plantedSnapshot = await firestore.collection('planted_crops')
            .where('isRegistered', '==', true)
            .get();
        
        console.log('Number of documents found:', plantedSnapshot.size);
        
        const planted_crops = plantedSnapshot.docs.map(doc => {
            const data = doc.data();
            console.log('Processing document:', doc.id, data);
            
            // Ensure dates are properly converted
            const startDate = data.startDate ? data.startDate.toDate() : null;
            const endDate = data.endDate ? data.endDate.toDate() : null;
            
            return {
                id: doc.id,
                name: data.name || 'Unknown',
                startDate: startDate,
                endDate: endDate,
                status: data.status || 'unknown',
                successRate: data.successRate || 0,
                score: data.score || 0,
                ruleBasedScore: data.ruleBasedScore || 0,
                parameterMatches: {
                    humidity: data.parameterMatches?.humidity || 0,
                    light: data.parameterMatches?.light || 0,
                    moisture: data.parameterMatches?.moisture || 0,
                    npk_K: data.parameterMatches?.npk_K || 0,
                    npk_N: data.parameterMatches?.npk_N || 0,
                    npk_P: data.parameterMatches?.npk_P || 0,
                    ph: data.parameterMatches?.ph || 0,
                    temperature: data.parameterMatches?.temperature || 0
                },
                optimalConditions: {
                    humidity: data.optimalConditions?.humidity || 0,
                    light: data.optimalConditions?.light || 0,
                    moisture: data.optimalConditions?.moisture || 0,
                    npk_K: data.optimalConditions?.npk_K || 0,
                    npk_N: data.optimalConditions?.npk_N || 0,
                    npk_P: data.optimalConditions?.npk_P || 0,
                    ph: data.optimalConditions?.ph || 0,
                    temperature: data.optimalConditions?.temperature || 0
                },
                userEmail: data.userEmail || '',
                userName: data.userName || '',
                lastUpdated: data.lastUpdated || null
            };
        });

        // Sort the results in memory instead of in the query
        planted_crops.sort((a, b) => {
            if (!a.startDate || !b.startDate) return 0;
            return b.startDate - a.startDate;
        });
        
        console.log('Formatted planted crops:', planted_crops);
        res.json({ planted_crops });
    } catch (error) {
        console.error('Error fetching planted crops:', error);
        res.status(500).json({ error: "Failed to fetch planted crops" });
    }
};

exports.getHistoricalSensorData = async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const sensorSnapshot = await firestore.collection('daily_sensor_summaries')
            .where('period_start', '>=', startDate)
            .orderBy('period_start', 'asc')
            .get();
            
        const historicalData = sensorSnapshot.docs.map(doc => doc.data());
        res.json({ historicalData });
    } catch (error) {
        console.error('Error fetching historical sensor data:', error);
        res.status(500).json({ error: "Failed to fetch historical sensor data" });
    }
};

exports.getCropPerformance = async (req, res) => {
    try {
        const plantedSnapshot = await firestore.collection('planted_crops')
            .where('isRegistered', '==', true)
            .orderBy('startDate', 'desc')
            .limit(10)
            .get();
        
        const performanceData = plantedSnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name,
                successRate: data.successRate,
                score: data.score,
                parameterMatches: data.parameterMatches,
                startDate: data.startDate,
                endDate: data.endDate
            };
        });
        
        res.json({ performanceData });
    } catch (error) {
        console.error('Error fetching crop performance:', error);
        res.status(500).json({ error: "Failed to fetch crop performance data" });
    }
}; 