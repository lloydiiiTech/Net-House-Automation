const { firestore, admin } = require('../config/firebase');

exports.dailySensorsReport = async (req, res) => {
    try {
        const pageSize = 10;
        const page = parseInt(req.query.page) || 1;
        const { dateFrom, dateTo } = req.query;
        let collectionRef = firestore.collection('daily_sensor_summaries');
        let query = collectionRef;
        let filterActive = false;
        // Date filtering logic (match reportAIDiseaseController.js)
        if (dateFrom && !dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateFrom);
            to.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from)).where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (!dateFrom && dateTo) {
            const from = new Date(dateTo);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from)).where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from)).where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        }
        // Always order by timestamp desc
        query = query.orderBy('timestamp', 'desc');
        // Get total count for pagination
        const totalSnapshot = await query.get();
        const totalRecords = totalSnapshot.size;
        const totalPages = Math.ceil(totalRecords / pageSize) || 1;
        // Pagination: skip (page-1)*pageSize, then limit pageSize
        let paginatedDocs = [];
        if (totalRecords > 0) {
            if (page === 1) {
                const snapshot = await query.limit(pageSize).get();
                paginatedDocs = snapshot.docs;
            } else {
                // Get the last doc of the previous page
                const prevSnapshot = await query.limit((page - 1) * pageSize).get();
                const docs = prevSnapshot.docs;
                if (docs.length > 0) {
                    const lastDoc = docs[docs.length - 1];
                    const snapshot = await query.startAfter(lastDoc).limit(pageSize).get();
                    paginatedDocs = snapshot.docs;
                }
            }
        }
        const daily_sensor_summaries = paginatedDocs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                timestamp: data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : data.timestamp
            };
        });


        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-daily-sensors', {
            user: req.session.user,
            daily_sensor_summaries,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                pageSize
            },
            filter: filterActive ? { dateFrom, dateTo } : undefined
        });
        }else{
            res.render('report-daily-sensors', {
                user: req.session.user,
                daily_sensor_summaries,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalRecords,
                    pageSize
                },
                filter: filterActive ? { dateFrom, dateTo } : undefined
            });
        }
    } catch (error) {
        console.error('Error rendering daily sensors report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-daily-sensors', {
            user: req.session.user,
            daily_sensor_summaries: [],
            pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
            error: 'Failed to load daily sensors report.'
        });
        } else{
            res.render('report-daily-sensors', {
                user: req.session.user,
                daily_sensor_summaries: [],
                pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
                error: 'Failed to load daily sensors report.'
            });
        }
    }
};

exports.checkSensorData = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.json({ hasData: false });
        }
        const from = new Date(startDate);
        from.setHours(0, 0, 0, 0);
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        const snapshot = await firestore.collection('daily_sensor_summaries')
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from))
            .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to))
            .limit(1)
            .get();
        res.json({ hasData: !snapshot.empty });
    } catch (error) {
        console.error('Error checking sensor data:', error);
        res.json({ hasData: false });
    }
};

exports.downloadSensorData = async (req, res) => {
    try {
        const { startDate, endDate, format, type } = req.query;
        if (!startDate || !endDate || !format) {
            return res.status(400).json({ error: 'Missing required parameters: startDate, endDate, format' });
        }
        if (!['excel', 'pdf'].includes(format)) {
            return res.status(400).json({ error: 'Invalid format. Use excel or pdf.' });
        }
        if (type !== 'sensor') {
            return res.status(400).json({ error: 'Invalid type. Only sensor data is supported.' });
        }

        // Fetch data from daily_sensor_summaries (matching dailySensorsReport logic)
        let query = firestore.collection('daily_sensor_summaries');
        const from = new Date(startDate);
        from.setHours(0, 0, 0, 0);
        const to = new Date(endDate);
        to.setHours(23, 59, 59, 999);
        query = query.where('timestamp', '>=', admin.firestore.Timestamp.fromDate(from))
                     .where('timestamp', '<=', admin.firestore.Timestamp.fromDate(to))
                     .orderBy('timestamp', 'desc');
        const snapshot = await query.get();
        const data = snapshot.docs.map(doc => ({
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate() || new Date()
        }));

        if (data.length === 0) {
            return res.status(404).json({ error: 'No data found for the selected date range.' });
        }

        if (format === 'excel') {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Sensor Data');

            // Add title row
            worksheet.mergeCells('A1:I1');  // Adjusted for 9 columns
            worksheet.getCell('A1').value = 'NetHouse Automation - Daily Sensor Summaries Report';
            worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
            worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
            worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
            worksheet.getRow(1).height = 30;

            // Add date range and generation info
            worksheet.mergeCells('A2:I2');  // Adjusted
            worksheet.getCell('A2').value = `Date Range: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()} | Generated on: ${new Date().toLocaleDateString()}`;
            worksheet.getCell('A2').font = { size: 10, italic: true };
            worksheet.getCell('A2').alignment = { horizontal: 'center' };
            worksheet.getRow(2).height = 20;

            // Header row (starting from row 4)
            const headerRow = worksheet.getRow(4);
            headerRow.values = ['Date', 'Temperature (°C)', 'Humidity (%)', 'Soil Moisture (%)', 'Light (lux)', 'pH Level', 'Nitrogen', 'Phosphorus', 'Potassium'];  // Removed Status
            headerRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34495E' } };
            headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
            headerRow.height = 25;

            // Set column widths (9 columns)
            worksheet.columns = [
                { key: 'date', width: 15 },
                { key: 'temperature', width: 20 },
                { key: 'humidity', width: 20 },
                { key: 'moisture', width: 20 },
                { key: 'light', width: 15 },
                { key: 'ph', width: 15 },
                { key: 'nitrogen', width: 15 },
                { key: 'phosphorus', width: 15 },
                { key: 'potassium', width: 15 }
            ];

            // Add data rows starting from row 5
            data.forEach((item, index) => {
                const row = worksheet.addRow({
                    date: item.timestamp.toLocaleDateString(),
                    temperature: `${(item.temperature?.average || 0).toFixed(1)}°C\nMin: ${(item.temperature?.min || 0).toFixed(1)}°C, Max: ${(item.temperature?.max || 0).toFixed(1)}°C`,
                    humidity: `${(item.humidity?.average || 0).toFixed(1)}%\nMin: ${(item.humidity?.min || 0).toFixed(1)}%, Max: ${(item.humidity?.max || 0).toFixed(1)}%`,
                    moisture: `${(item.moistureAve?.average || 0).toFixed(1)}%\nMin: ${(item.moistureAve?.min || 0).toFixed(1)}%, Max: ${(item.moistureAve?.max || 0).toFixed(1)}%`,
                    light: `${(item.light?.average || 0).toFixed(1)} lux\nMin: ${(item.light?.min || 0).toFixed(1)} lux, Max: ${(item.light?.max || 0).toFixed(1)} lux`,
                    ph: `${(item.ph?.average || 0).toFixed(1)}\nMin: ${(item.ph?.min || 0).toFixed(1)}, Max: ${(item.ph?.max || 0).toFixed(1)}`,
                    nitrogen: (item.nitrogen?.average || 0).toFixed(1),
                    phosphorus: (item.phosphorus?.average || 0).toFixed(1),
                    potassium: (item.potassium?.average || 0).toFixed(1)
                });

                // Alternate row colors
                const fillColor = index % 2 === 0 ? 'FFF8F9FA' : 'FFFFFFFF';
                row.eachCell(cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    cell.alignment = { vertical: 'middle', wrapText: true };
                });
            });

            // Add footer
            const footerRow = worksheet.addRow([]);
            worksheet.mergeCells(`A${worksheet.rowCount}:I${worksheet.rowCount}`);  // Adjusted
            worksheet.getCell(`A${worksheet.rowCount}`).value = 'NetHouse Automation - Confidential Report';
            worksheet.getCell(`A${worksheet.rowCount}`).font = { italic: true, size: 10 };
            worksheet.getCell(`A${worksheet.rowCount}`).alignment = { horizontal: 'center' };

            // Set response headers and send file
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=sensor-data-${startDate}-to-${endDate}.xlsx`);
            await workbook.xlsx.write(res);
            res.end();

        } else if (format === 'pdf') {
            const PDFDocument = require('pdfkit');
            const fs = require('fs');
            const doc = new PDFDocument({ margin: 50, size: 'A4' });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=sensor-data-${startDate}-to-${endDate}.pdf`);
            doc.pipe(res);

            // Cover Page
            if (fs.existsSync('./assets/img/logo.png')) {
                doc.image('./assets/img/logo.png', 200, 150, { width: 200 });
            }
            doc.fontSize(28).font('Helvetica-Bold').fillColor('#2C3E50').text('NetHouse Automation', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(20).text('Daily Sensor Summaries Report', { align: 'center' });
            doc.moveDown(1);
            doc.fontSize(14).font('Helvetica').fillColor('#34495E').text(`Date Range: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, { align: 'center' });
            doc.text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });
            doc.moveDown(2);
            doc.fontSize(12).fillColor('#7F8C8D').text('Confidential Report', { align: 'center' });

            doc.addPage(); // New page for content

            // Summary Section
            doc.fontSize(18).font('Helvetica-Bold').fillColor('#2C3E50').text('Executive Summary', { align: 'center' });
            doc.moveDown(1);
            const avgTemp = data.reduce((sum, item) => sum + (item.temperature?.average || 0), 0) / data.length;
            const avgHumidity = data.reduce((sum, item) => sum + (item.humidity?.average || 0), 0) / data.length;
            const avgMoisture = data.reduce((sum, item) => sum + (item.moistureAve?.average || 0), 0) / data.length;
            const avgLight = data.reduce((sum, item) => sum + (item.light?.average || 0), 0) / data.length;
            const avgPh = data.reduce((sum, item) => sum + (item.ph?.average || 0), 0) / data.length;
            const avgN = data.reduce((sum, item) => sum + (item.nitrogen?.average || 0), 0) / data.length;
            const avgP = data.reduce((sum, item) => sum + (item.phosphorus?.average || 0), 0) / data.length;
            const avgK = data.reduce((sum, item) => sum + (item.potassium?.average || 0), 0) / data.length;

            doc.fontSize(12).font('Helvetica').fillColor('#000000');
            doc.text(`Total Records: ${data.length}`);
            doc.text(`Average Temperature: ${avgTemp.toFixed(1)}°C`);
            doc.text(`Average Humidity: ${avgHumidity.toFixed(1)}%`);
            doc.text(`Average Soil Moisture: ${avgMoisture.toFixed(1)}%`);
            doc.text(`Average Light: ${avgLight.toFixed(1)} lux`);
            doc.text(`Average pH: ${avgPh.toFixed(1)}`);
            doc.text(`Average NPK: N${avgN.toFixed(1)} P${avgP.toFixed(1)} K${avgK.toFixed(1)}`);
            doc.moveDown(1);

            // Graphical Bar Chart
            doc.fontSize(14).font('Helvetica-Bold').fillColor('#2C3E50').text('Average Levels Chart', { underline: true });
            doc.moveDown(0.5);
            const chartData = [
                { label: 'Temp', value: Math.max(0, Math.min(100, Math.min(avgTemp / 40 * 100, 100))) },
                { label: 'Humidity', value: Math.max(0, Math.min(100, avgHumidity)) },
                { label: 'Moisture', value: Math.max(0, Math.min(100, avgMoisture)) },
                { label: 'Light', value: Math.max(0, Math.min(100, Math.min(avgLight / 10000 * 100, 100))) },
                { label: 'pH', value: Math.max(0, Math.min(100, avgPh / 14 * 100)) },
                { label: 'N', value: Math.max(0, Math.min(100, avgN)) },
                { label: 'P', value: Math.max(0, Math.min(100, avgP)) },
                { label: 'K', value: Math.max(0, Math.min(100, avgK)) }
            ];
            const chartY = doc.y;
            chartData.forEach((item, index) => {
                const barHeight = 20;
                const barWidth = (item.value / 100) * 300; // Max width 300
                const yPos = chartY + index * 30;
                doc.fontSize(10).font('Helvetica').fillColor('#000000').text(item.label, 50, yPos + 5);
                doc.rect(100, yPos, barWidth, barHeight).fill('#3498DB');
                doc.fillColor('#000000').text(`${item.value.toFixed(1)}%`, 410, yPos + 5);
            });
            doc.moveDown(3);

            doc.addPage(); // New page for table

            // Table Header
            doc.fontSize(16).font('Helvetica-Bold').fillColor('#2C3E50').text('Detailed Sensor Data', { align: 'center' });
            doc.moveDown(1);
            const tableTop = doc.y;
            const colWidths = [70, 55, 55, 55, 55, 45, 40, 40, 40];
            const headers = ['Date', 'Temp (°C)', 'Humidity (%)', 'Moisture (%)', 'Light (lux)', 'pH', 'N', 'P', 'K'];
            const tableWidth = colWidths.reduce((a, b) => a + b, 0);

            // Header background
            doc.rect(50, tableTop - 5, tableWidth, 25).fill('#34495E');
            doc.fontSize(10).font('Helvetica-Bold').fillColor('#FFFFFF');
            headers.forEach((header, i) => {
                const x = 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                doc.text(header, x + 5, tableTop, { width: colWidths[i] - 10, align: 'center' });
            });
            doc.moveDown(0.5);

            // Table Rows with Grid
            doc.font('Helvetica').fontSize(9).fillColor('#000000');
            data.forEach((item, index) => {
                const rowY = doc.y;
                const values = [
                    item.timestamp.toLocaleDateString(),
                    `${(item.temperature?.average || 0).toFixed(1)}\n(${item.temperature?.min?.toFixed(1)}-${item.temperature?.max?.toFixed(1)})`,
                    `${(item.humidity?.average || 0).toFixed(1)}\n(${item.humidity?.min?.toFixed(1)}-${item.humidity?.max?.toFixed(1)})`,
                    `${(item.moistureAve?.average || 0).toFixed(1)}\n(${item.moistureAve?.min?.toFixed(1)}-${item.moistureAve?.max?.toFixed(1)})`,
                    `${(item.light?.average || 0).toFixed(1)}\n(${item.light?.min?.toFixed(1)}-${item.light?.max?.toFixed(1)})`,
                    `${(item.ph?.average || 0).toFixed(1)}\n(${item.ph?.min?.toFixed(1)}-${item.ph?.max?.toFixed(1)})`,
                    (item.nitrogen?.average || 0).toFixed(1),
                    (item.phosphorus?.average || 0).toFixed(1),
                    (item.potassium?.average || 0).toFixed(1)
                ];

                // Row background
                const bgColor = index % 2 === 0 ? '#F8F9FA' : '#FFFFFF';
                doc.rect(50, rowY - 2, tableWidth, 30).fill(bgColor);

                // Grid lines
                doc.strokeColor('#BDC3C7').lineWidth(0.5);
                for (let i = 0; i <= colWidths.length; i++) {
                    const x = 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                    doc.moveTo(x, rowY - 2).lineTo(x, rowY + 28).stroke();
                }
                doc.moveTo(50, rowY - 2).lineTo(50 + tableWidth, rowY - 2).stroke();
                doc.moveTo(50, rowY + 28).lineTo(50 + tableWidth, rowY + 28).stroke();

                values.forEach((value, i) => {
                    const x = 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
                    doc.fillColor('#000000').text(value, x + 5, rowY + 2, { width: colWidths[i] - 10, align: 'center' });
                });

                doc.moveDown(0.8);

                // Page break
                if (doc.y > 700) {
                    doc.addPage();
                    doc.fontSize(10).font('Helvetica-Bold').fillColor('#2C3E50').text('Continued...', 50, 50);
                    doc.moveDown(0.5);
                }
            });

            // Footer for the last page
            doc.moveDown(1);
            doc.fontSize(8).font('Helvetica').fillColor('#7F8C8D').text('NetHouse Automation - Confidential Report', 50, doc.page.height - 30, { align: 'center' });

            doc.end();
        }
    } catch (error) {
        console.error('Error downloading data:', error);
        res.status(500).json({ error: 'Failed to download data.' });
    }
};