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

exports.downloadSensorData = async (req, res) => {
    try {
        const { startDate, endDate, format = 'csv', type = 'sensor' } = req.query;
        
        if (!startDate || !endDate) {
            return res.status(400).json({ error: "Start date and end date are required" });
        }

        const start = new Date(startDate);
        const end = new Date(endDate);
        
        let data = [];
        
        if (type === 'sensor' || type === 'all') {
            const sensorSnapshot = await firestore.collection('daily_sensor_summaries')
                .where('period_start', '>=', admin.firestore.Timestamp.fromDate(start))
                .where('period_start', '<=', admin.firestore.Timestamp.fromDate(end))
                .orderBy('period_start', 'asc')
                .get();

            data = sensorSnapshot.docs.map(doc => {
                const sensorData = doc.data();
                return {
                    date: sensorData.period_start.toDate().toISOString().split('T')[0],
                    temperature_avg: sensorData.temperature?.average || 0,
                    temperature_min: sensorData.temperature?.min || 0,
                    temperature_max: sensorData.temperature?.max || 0,
                    humidity_avg: sensorData.humidity?.average || 0,
                    humidity_min: sensorData.humidity?.min || 0,
                    humidity_max: sensorData.humidity?.max || 0,
                    moisture_avg: sensorData.moistureAve?.average || 0,
                    moisture_min: sensorData.moistureAve?.min || 0,
                    moisture_max: sensorData.moistureAve?.max || 0,
                    light_avg: sensorData.light?.average || 0,
                    light_min: sensorData.light?.min || 0,
                    light_max: sensorData.light?.max || 0,
                    ph_avg: sensorData.ph?.average || 0,
                    ph_min: sensorData.ph?.min || 0,
                    ph_max: sensorData.ph?.max || 0,
                    nitrogen_avg: sensorData.nitrogen?.average || 0,
                    nitrogen_min: sensorData.nitrogen?.min || 0,
                    nitrogen_max: sensorData.nitrogen?.max || 0,
                    phosphorus_avg: sensorData.phosphorus?.average || 0,
                    phosphorus_min: sensorData.phosphorus?.min || 0,
                    phosphorus_max: sensorData.phosphorus?.max || 0,
                    potassium_avg: sensorData.potassium?.average || 0,
                    potassium_min: sensorData.potassium?.min || 0,
                    potassium_max: sensorData.potassium?.max || 0,
                    data_points: sensorData.data_points || 0
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
            const XLSX = require('xlsx');
            const workbook = XLSX.utils.book_new();
            
            if (type === 'all') {
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.sensor_data), 'Sensor Data');
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data.crops_data), 'Crops Data');
            } else {
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(data), type === 'sensor' ? 'Sensor Data' : 'Crops Data');
            }
            
            const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-data-${startDate}-to-${endDate}.xlsx`);
            res.send(excelBuffer);
        } else if (format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const doc = new PDFDocument();
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-data-${startDate}-to-${endDate}.pdf`);
            
            doc.pipe(res);
            
            // Add title
            doc.fontSize(20).text(`${type.charAt(0).toUpperCase() + type.slice(1)} Data Report`, { align: 'center' });
            doc.moveDown();
            
            // Add date range
            doc.fontSize(12).text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
            doc.moveDown();
            
            // Add data
            if (type === 'all') {
                doc.fontSize(16).text('Sensor Data');
                doc.moveDown();
                // Add sensor data table
                // ... (implement table generation for sensor data)
                
                doc.addPage();
                doc.fontSize(16).text('Crops Data');
                doc.moveDown();
                // Add crops data table
                // ... (implement table generation for crops data)
            } else {
                // Add single table for the selected type
                // ... (implement table generation)
            }
            
            doc.end();
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