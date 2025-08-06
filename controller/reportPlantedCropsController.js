const { firestore } = require('../config/firebase');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function parseDate(val) {
    if (!val) return null;
    if (typeof val.toDate === 'function') return val.toDate();
    if (val instanceof Date) return val;
    // Try to parse string
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function toLocalYMD(date) {
    if (!date) return null;
    const d = new Date(date);
    if (isNaN(d.getTime())) return null;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function normalizeInputDate(input) {
    // Accepts YYYY-MM-DD or MM/DD/YYYY and returns YYYY-MM-DD
    if (!input) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(input)) {
        const [m, d, y] = input.split('/');
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return toLocalYMD(input);
}

function filterAndSortCrops(crops, cropName, fromDate, toDate, status, month, year) {
    let processed = crops.map(crop => ({
        ...crop,
        startDate: parseDate(crop.startDate),
        endDate: parseDate(crop.endDate)
    }));
    // Always filter by year (required)
    if (!year || year === '') {
        year = new Date().getFullYear().toString();
    }
    const y = parseInt(year, 10);
    processed = processed.filter(crop => {
        const sYear = crop.startDate ? crop.startDate.getFullYear() : null;
        const eYear = crop.endDate ? crop.endDate.getFullYear() : null;
        return sYear === y || eYear === y;
    });
    // Other filters only if set
    if (cropName && cropName !== 'All' && cropName !== 'all' && cropName !== '') {
        processed = processed.filter(crop => crop.name && crop.name.toLowerCase() === cropName.toLowerCase());
    }
    if (status && status !== '') {
        processed = processed.filter(crop => (crop.status || '').toLowerCase() === status.toLowerCase());
    }
    if (month && month !== '') {
        const m = parseInt(month, 10);
        processed = processed.filter(crop => {
            const sMonth = crop.startDate ? crop.startDate.getMonth() + 1 : null;
            const eMonth = crop.endDate ? crop.endDate.getMonth() + 1 : null;
            return sMonth === m || eMonth === m;
        });
    }
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    let result = [];
    if (from && to) {
        // Range: startDate in [from, to] OR endDate in [from, to]
        const startSet = processed.filter(crop => {
            if (!crop.startDate) return false;
            const d = crop.startDate;
            return d >= from && d <= to;
        });
        const endSet = processed.filter(crop => {
            if (!crop.endDate) return false;
            const d = crop.endDate;
            return d >= from && d <= to;
        });
        // Union, remove duplicates
        const key = crop => `${crop.name}|${crop.startDate ? crop.startDate.getTime() : ''}|${crop.endDate ? crop.endDate.getTime() : ''}`;
        const seen = new Set();
        result = [];
        for (const crop of [...startSet, ...endSet]) {
            const k = key(crop);
            if (!seen.has(k)) {
                seen.add(k);
                result.push(crop);
            }
        }
    } else if (from && !to) {
        // Only startDate provided: match crops where startDate matches exactly
        const fromYMD = toLocalYMD(from);
        result = processed.filter(crop => toLocalYMD(crop.startDate) === fromYMD);
    } else if (!from && to) {
        // Only endDate provided: match crops where endDate matches exactly
        const toYMD = toLocalYMD(to);
        result = processed.filter(crop => toLocalYMD(crop.endDate) === toYMD);
    } else {
        // No date filter: return all
        result = processed;
    }
    result.sort((a, b) => (b.startDate ? b.startDate : 0) - (a.startDate ? a.startDate : 0));
    return result;
}

// Update controller to pass status, month, year from req.query
exports.plantedCropsReport = async (req, res) => {
    try {
        let { cropName, startDate, endDate, status, month, year } = req.query;

        // Default to current year if no filters are applied
        const noFilters = !cropName && !startDate && !endDate && !status && !month && !year;
        if (noFilters) {
            year = new Date().getFullYear().toString();
        }

        const currentFilters = { cropName, startDate, endDate, status, month, year };

        // Fetch all crops for the dropdown
        const allCropsSnapshot = await firestore.collection('planted_crops').get();
        // Attach Firestore doc ID to each crop
        const allCrops = allCropsSnapshot.docs.map(doc => ({ cropId: doc.id, ...doc.data() }));
        
        let plantedCrops = filterAndSortCrops(allCrops, cropName, startDate, endDate, status, month, year);
        
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-planted-crops', { 
            user: req.session.user, 
            plantedCrops, 
            allCrops,
            currentFilters, // Pass the guaranteed filter object
            cropName, 
            startDate, 
            endDate,
            status,
            month,
            year
        });}
        else {
            res.render('report-planted-crops', { 
                user: req.session.user, 
                plantedCrops, 
                allCrops,
                currentFilters, // Pass the guaranteed filter object
                cropName, 
                startDate, 
                endDate,
                status,
                month,
                year
            });
        }
    } catch (error) {
        console.error('Error rendering planted crops report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        res.render('admin/report-planted-crops', { 
            user: req.session.user, 
            error: 'Failed to load planted crops report.', 
            plantedCrops: [],
            allCrops: [],
            currentFilters: { year: new Date().getFullYear().toString() }, // Default on error
            cropName: '',
            startDate: '',
            endDate: '',
            status: '',
            month: '',
            year: new Date().getFullYear().toString()
        });}
        else{
            res.render('report-planted-crops', { 
                user: req.session.user, 
                error: 'Failed to load planted crops report.', 
                plantedCrops: [],
                allCrops: [],
                currentFilters: { year: new Date().getFullYear().toString() }, // Default on error
                cropName: '',
                startDate: '',
                endDate: '',
                status: '',
                month: '',
                year: new Date().getFullYear().toString()
            });
        }
    }
};

// Export Excel
exports.exportExcel = async (req, res) => {
    try {
        console.log('[DEBUG] Export Excel Query:', req.query);
        let { cropName, startDate, endDate, status, month, year } = req.query;
        if (!year || year === '') {
            year = new Date().getFullYear().toString();
        }
        let cropsSnapshot = await firestore.collection('planted_crops').get();
        // Attach Firestore doc ID to each crop
        let crops = cropsSnapshot.docs.map(doc => ({ cropId: doc.id, ...doc.data() }));
        crops = filterAndSortCrops(crops, cropName, startDate, endDate, status, month, year);
        // Excel
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Planted Crops');
        // Title row
        sheet.mergeCells('A1:J1');
        sheet.getCell('A1').value = 'Planted Crops Report';
        sheet.getCell('A1').font = { size: 16, bold: true };
        sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
        // Subtitle row
        sheet.mergeCells('A2:J2');
        sheet.getCell('A2').value = `Generated: ${new Date().toLocaleString()}`;
        sheet.getCell('A2').font = { italic: true, size: 11 };
        sheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
        // Header row
        sheet.addRow([
            'Crop Name', 'Start Date', 'End Date', 'User', 'End User', 'Status', 'Remark', 'Harvest Quality', 'Harvest Quantity', 'Harvest Success Rate'
        ]);
        const headerRow = sheet.getRow(3);
        headerRow.font = { bold: true };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
        headerRow.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFD9E1F2' }
            };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
        });
        // Data rows
        crops.forEach(crop => {
            sheet.addRow([
                crop.name,
                crop.startDate ? crop.startDate.toLocaleDateString() : '',
                crop.endDate ? crop.endDate.toLocaleDateString() : '',
                crop.userName,
                crop.endUserName,
                crop.status,
                crop.cancelRemark || crop.harvestChallenges || crop.harvestNotes || '',
                crop.harvestQuality || '',
                crop.harvestQuantity || '',
                crop.harvestSuccessRate || '',
            ]);
        });
        // Auto-fit columns
        sheet.columns.forEach(col => {
            let maxLength = 12;
            col.eachCell({ includeEmpty: true }, cell => {
                const val = cell.value ? cell.value.toString() : '';
                if (val.length > maxLength) maxLength = val.length;
            });
            col.width = maxLength + 2;
        });
        // Freeze header
        sheet.views = [{ state: 'frozen', ySplit: 3 }];
        const fileName = `planted-crops-report-${Date.now()}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting planted crops Excel:', error);
        res.status(500).send('Failed to export Excel');
    }
};

// Export PDF
exports.exportPdf = async (req, res) => {
    try {
        console.log('[DEBUG] Export PDF Query:', req.query);
        let { cropName, startDate, endDate, status, month, year } = req.query;
        if (!year || year === '') {
            year = new Date().getFullYear().toString();
        }
        let cropsSnapshot = await firestore.collection('planted_crops').get();
        // Attach Firestore doc ID to each crop
        let crops = cropsSnapshot.docs.map(doc => ({ cropId: doc.id, ...doc.data() }));
        crops = filterAndSortCrops(crops, cropName, startDate, endDate, status, month, year);
        if (crops.length === 1) {
            const crop = crops[0];
            if (crop.status === 'harvested') {
                return res.redirect(`/harvest-preview/${crop.cropId}`);
            } else if (crop.status === 'failed' || crop.status === 'cancelled') {
                return res.redirect(`/cancellation-preview/${crop.cropId}`);
            }
        }
        // PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        const fileName = `planted-crops-report-${Date.now()}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        doc.pipe(res);
        // Title
        doc.fontSize(22).fillColor('#2c3e50').font('Helvetica-Bold').text('Planted Crops Report', { align: 'center' });
        doc.moveDown(0.5);
        // Subtitle
        doc.fontSize(12).fillColor('#555').font('Helvetica').text('Comprehensive report of all planted crops, with full details.', { align: 'center' });
        doc.moveDown(0.2);
        doc.fontSize(10).fillColor('#555').text('Generated: ' + new Date().toLocaleString(), { align: 'center' });
        doc.moveDown(1);
        // Table headers
        const headers = [
            'Crop Name', 'Start Date', 'End Date', 'User', 'End User', 'Status', 'Remark', 'Harvest Quality', 'Harvest Quantity', 'Harvest Success Rate'
        ];
        const colWidths = [80, 60, 60, 80, 80, 50, 120, 60, 60, 80];
        let y = doc.y;
        let x = doc.page.margins.left;
        // Draw header row
        headers.forEach((h, i) => {
            doc.rect(x, y, colWidths[i], 24).fill('#D9E1F2');
            doc.fillColor('#2c3e50').font('Helvetica-Bold').fontSize(10).text(h, x + 4, y + 7, { width: colWidths[i] - 8, align: 'center' });
            x += colWidths[i];
        });
        doc.fillColor('black');
        y += 24;
        // Draw rows
        crops.forEach((crop, idx) => {
            x = doc.page.margins.left;
            const rowVals = [
                crop.name,
                crop.startDate ? crop.startDate.toLocaleDateString() : '',
                crop.endDate ? crop.endDate.toLocaleDateString() : '',
                crop.userName,
                crop.endUserName,
                crop.status,
                crop.cancelRemark || crop.harvestChallenges || crop.harvestNotes || '',
                crop.harvestQuality || '',
                crop.harvestQuantity || '',
                crop.harvestSuccessRate || ''
            ];
            // Alternate row background
            if (idx % 2 === 0) {
                doc.rect(x, y, colWidths.reduce((a, w) => a + w, 0), 22).fill('#F2F6FA');
            } else {
                doc.rect(x, y, colWidths.reduce((a, w) => a + w, 0), 22).fill('#FFFFFF');
            }
            let cellX = x;
            for (let i = 0; i < headers.length; i++) {
                doc.fillColor('black').font('Helvetica').fontSize(9).text(
                    rowVals[i] || '-',
                    cellX + 4,
                    y + 6,
                    { width: colWidths[i] - 8, align: 'left' }
                );
                cellX += colWidths[i];
            }
            y += 22;
            // Page break if needed
            if (y + 22 > doc.page.height - doc.page.margins.bottom) {
                doc.addPage();
                y = doc.page.margins.top;
                // Redraw header row
                x = doc.page.margins.left;
                headers.forEach((h, i) => {
                    doc.rect(x, y, colWidths[i], 24).fill('#D9E1F2');
                    doc.fillColor('#2c3e50').font('Helvetica-Bold').fontSize(10).text(h, x + 4, y + 7, { width: colWidths[i] - 8, align: 'center' });
                    x += colWidths[i];
                });
                doc.fillColor('black');
                y += 24;
            }
        });
        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            const footerY = doc.page.height - doc.page.margins.bottom - 20;
            doc.fontSize(8).fillColor('#888').text(
                `Page ${i + 1} of ${pageCount}`,
                doc.page.width - doc.page.margins.right - 100,
                footerY,
                { align: 'right', width: 100 }
            );
            doc.fontSize(8).fillColor('#888').text(
                '© 2025 NetHouseAutomation - All rights reserved',
                doc.page.margins.left,
                footerY,
                { align: 'left', width: 300 }
            );
        }
        doc.end();
    } catch (error) {
        console.error('Error exporting planted crops PDF:', error);
        res.status(500).send('Failed to export PDF');
    }
};

// Export check endpoint
exports.exportCheck = async (req, res) => {
    try {
        console.log('[DEBUG] Export Check Query:', req.query);
        let { cropName, startDate, endDate, status, month, year } = req.query;
        if (!year || year === '') {
            year = new Date().getFullYear().toString();
        }
        let query = firestore.collection('planted_crops');
        let cropsSnapshot = await query.get();
        let crops = cropsSnapshot.docs.map(doc => doc.data());
        crops = filterAndSortCrops(crops, cropName, startDate, endDate, status, month, year);
        res.json({ hasData: crops.length > 0 });
    } catch (err) {
        res.json({ hasData: false });
    }
}; 