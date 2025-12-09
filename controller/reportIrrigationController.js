const { firestore, admin } = require('../config/firebase');

// ...existing code...

const ExcelJS = require('exceljs'); // Add if not already imported
const PDFDocument = require('pdfkit'); // Add if not already imported

exports.exportExcel = async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        let collectionRef = firestore.collection('irrigation_records');
        let query = collectionRef;

        // Apply date filtering (reuse logic from irrigationReport)
        if (dateFrom && !dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateFrom);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
        } else if (!dateFrom && dateTo) {
            const from = new Date(dateTo);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
        } else if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
        }

        query = query.orderBy('date', 'desc');
        const snapshot = await query.get();
        const records = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                date: data.date && data.date.toDate ? data.date.toDate().toLocaleDateString() : '',
                startTime: data.startTime && data.startTime.toDate ? data.startTime.toDate().toLocaleTimeString() : '',
                endTime: data.endTime && data.endTime.toDate ? data.endTime.toDate().toLocaleTimeString() : '',
                duration: data.duration || '',
                moistureBefore: data.moistureBefore || '',
                moistureAfter: data.moistureAfter || '',
                note: data.note || '',
                status: data.status || ''
            };
        });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Irrigation Records');

        // Company header
        worksheet.addRow(['NetHouseAutomation']);
        worksheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FF2C3E50' } };
        worksheet.getCell('A1').alignment = { horizontal: 'center' };
        worksheet.mergeCells('A1:H1');

        // Report title
        worksheet.addRow(['Irrigation Records Report']);
        worksheet.getCell('A2').font = { size: 16, bold: true, color: { argb: 'FF34495E' } };
        worksheet.getCell('A2').alignment = { horizontal: 'center' };
        worksheet.mergeCells('A2:H2');

        // Metadata
        const generatedDate = new Date().toLocaleDateString();
        const filters = dateFrom && dateTo ? `Date Range: ${dateFrom} to ${dateTo}` : 'All Records';
        worksheet.addRow([`Generated on: ${generatedDate}`]);
        worksheet.getCell('A3').font = { size: 10, italic: true };
        worksheet.mergeCells('A3:H3');
        worksheet.addRow([`Filters Applied: ${filters}`]);
        worksheet.getCell('A4').font = { size: 10, italic: true };
        worksheet.mergeCells('A4:H4');

        // Add empty row for spacing
        worksheet.addRow([]);

        // Define columns with widths
        worksheet.columns = [
            { header: 'Date', key: 'date', width: 12 },
            { header: 'Start Time', key: 'startTime', width: 12 },
            { header: 'End Time', key: 'endTime', width: 12 },
            { header: 'Duration (min)', key: 'duration', width: 15 },
            { header: 'Moisture Before', key: 'moistureBefore', width: 18 },
            { header: 'Moisture After', key: 'moistureAfter', width: 18 },
            { header: 'Note', key: 'note', width: 20 },
            { header: 'Status', key: 'status', width: 12 }
        ];

        // Style header row
        const headerRow = worksheet.getRow(6);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A90E2' } };
        headerRow.alignment = { horizontal: 'center' };
        headerRow.eachCell(cell => {
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });

        // Add data rows with borders and alternating colors
        records.forEach((record, index) => {
            const row = worksheet.addRow(record);
            const fillColor = index % 2 === 0 ? 'FFF9F9F9' : 'FFFFFFFF';
            row.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillColor } };
            });
        });

        // Footer
        const footerRow = worksheet.addRow([]);
        worksheet.addRow([`Total Records: ${records.length}`]);
        worksheet.getCell(`A${worksheet.rowCount}`).font = { size: 10, italic: true };
        worksheet.mergeCells(`A${worksheet.rowCount}:H${worksheet.rowCount}`);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=irrigation_records.xlsx');
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Excel:', error);
        res.status(500).send('Failed to export Excel.');
    }
};

exports.exportPdf = async (req, res) => {
    try {
        const { dateFrom, dateTo } = req.query;
        let collectionRef = firestore.collection('irrigation_records');
        let query = collectionRef;

        // Apply date filtering (reuse logic from irrigationReport)
        if (dateFrom && !dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateFrom);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
        } else if (!dateFrom && dateTo) {
            const from = new Date(dateTo);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
        } else if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
        }

        query = query.orderBy('date', 'desc');
        const snapshot = await query.get();
        const records = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                date: data.date && data.date.toDate ? data.date.toDate().toLocaleDateString() : '',
                startTime: data.startTime && data.startTime.toDate ? data.startTime.toDate().toLocaleTimeString() : '',
                endTime: data.endTime && data.endTime.toDate ? data.endTime.toDate().toLocaleTimeString() : '',
                duration: data.duration || '',
                moistureBefore: data.moistureBefore || '',
                moistureAfter: data.moistureAfter || '',
                note: data.note || '',
                status: data.status || ''
            };
        });

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=irrigation_records.pdf');
        doc.pipe(res);

        // Header
        doc.fontSize(14).font('Helvetica-Bold').text('NetHouseAutomation', { align: 'center' });
        doc.fontSize(12).text('Irrigation Records Report', { align: 'center' });
        doc.moveDown(0.5);
        const generatedDate = new Date().toLocaleDateString();
        const filters = dateFrom && dateTo ? `Date Range: ${dateFrom} to ${dateTo}` : 'All Records';
        doc.fontSize(10).font('Helvetica').text(`Generated on: ${generatedDate}`, { align: 'center' });
        doc.text(`Filters Applied: ${filters}`, { align: 'center' });
        doc.moveDown(2);

        // Table headers
        const headers = ['Date', 'Start Time', 'End Time', 'Duration (min)', 'Moisture Before', 'Moisture After', 'Note', 'Status'];
        const columnWidths = [60, 60, 60, 70, 80, 80, 100, 60];
        let y = doc.y;

        // Draw header row with background
        doc.fontSize(10).font('Helvetica-Bold');
        headers.forEach((header, i) => {
            const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
            doc.rect(x, y - 5, columnWidths[i], 15).fill('#4A90E2').stroke();
            doc.fillColor('white').text(header, x, y, { width: columnWidths[i], align: 'center' });
        });
        y += 15;

        // Draw data rows with grid
        doc.font('Helvetica').fillColor('black');
        records.forEach((record, index) => {
            const rowData = [record.date, record.startTime, record.endTime, record.duration, record.moistureBefore, record.moistureAfter, record.note, record.status];
            rowData.forEach((data, i) => {
                const x = 50 + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
                doc.rect(x, y - 5, columnWidths[i], 15).stroke();
                doc.text(data, x, y, { width: columnWidths[i], align: 'center' });
            });
            y += 15;
            if (y > 700) { // New page
                doc.addPage();
                y = 50;
            }
        });

        // Footer with page numbers
        const totalPages = doc.bufferedPageRange().count;
        for (let i = 0; i < totalPages; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).text(`Page ${i + 1} of ${totalPages}`, 50, doc.page.height - 50, { align: 'center' });
            doc.text('NetHouseAutomation - Confidential', 50, doc.page.height - 30, { align: 'center' });
        }

        doc.end();
    } catch (error) {
        console.error('Error exporting PDF:', error);
        res.status(500).send('Failed to export PDF.');
    }
};

// ...existing code...
exports.irrigationReport = async (req, res) => {
    try {
        const pageSize = 10;
        const page = parseInt(req.query.page) || 1;
        const { dateFrom, dateTo } = req.query;
        let collectionRef = firestore.collection('irrigation_records');
        let query = collectionRef;
        let filterActive = false;
        // Date filtering logic
        if (dateFrom && !dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateFrom);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (!dateFrom && dateTo) {
            const from = new Date(dateTo);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        } else if (dateFrom && dateTo) {
            const from = new Date(dateFrom);
            from.setHours(0, 0, 0, 0);
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            query = query.where('date', '>=', admin.firestore.Timestamp.fromDate(from)).where('date', '<=', admin.firestore.Timestamp.fromDate(to));
            filterActive = true;
        }
        // Always order by date desc
        query = query.orderBy('date', 'desc');
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
        const irrigation_records = paginatedDocs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                date: data.date && data.date.toDate ? data.date.toDate() : data.date,
                startTime: data.startTime && data.startTime.toDate ? data.startTime.toDate() : data.startTime,
                endTime: data.endTime && data.endTime.toDate ? data.endTime.toDate() : data.endTime
            };
        });
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-irrigation', {
            user: req.session.user,
            irrigation_records,
            pagination: {
                currentPage: page,
                totalPages,
                totalRecords,
                pageSize
            },
            filter: filterActive ? { dateFrom, dateTo } : undefined
        });}
        else{
            res.render('report-irrigation', {
                user: req.session.user,
                irrigation_records,
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
        console.error('Error rendering irrigation report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-irrigation', {
            user: req.session.user,
            irrigation_records: [],
            pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
            error: 'Failed to load irrigation report.'
        });}
        else{
            res.render('report-irrigation', {
                user: req.session.user,
                irrigation_records: [],
                pagination: { currentPage: 1, totalPages: 1, totalRecords: 0, pageSize: 10 },
                error: 'Failed to load irrigation report.'
            });
        }
    }
}; 