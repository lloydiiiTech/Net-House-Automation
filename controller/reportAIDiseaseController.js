const { firestore } = require('../config/firebase');

function includesInsensitive(haystack, needle) {
    if (!haystack || !needle) return false;
    return haystack.toString().toLowerCase().includes(needle.toString().toLowerCase().trim());
}

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const PDFTable = require('pdfkit-table');

// Helper for crop name filter
function shouldFilterCropName(cropName) {
    if (!cropName) return false;
    const val = cropName.trim().toLowerCase();
    return val !== 'all' && val !== 'all crops' && val !== '';
}

exports.aiDiseaseFertilizerReport = async (req, res) => {
    try {
        // Get filter params from query
        const { cropName, growthStage, dateFrom, dateTo, disease, prevention, fertilizer, application, effect, reason } = req.query;
        // Get page params (default to 1)
        const diseasePage = parseInt(req.query.diseasePage) || 1;
        const fertilizerPage = parseInt(req.query.fertilizerPage) || 1;
        const pageSize = 10;
        const filter = { cropName, growthStage, dateFrom, dateTo, disease, prevention, fertilizer, application, effect, reason };

        // Fetch all unique crop names from both collections
        const [diseaseAllSnapshot, fertilizerAllSnapshot] = await Promise.all([
            firestore.collection('ai_disease_advice').get(),
            firestore.collection('ai_fertilizer_advice').get()
        ]);
        const cropNameSet = new Set();
        diseaseAllSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.cropName) cropNameSet.add(data.cropName);
        });
        fertilizerAllSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.cropName) cropNameSet.add(data.cropName);
        });
        const cropNames = Array.from(cropNameSet).sort();

        // Helper to build Firestore query with correct date logic
        function buildQuery(baseRef) {
            let query = baseRef;
            if (dateFrom && !dateTo) {
                // Only dateFrom: filter for that specific day
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateFrom);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            } else if (!dateFrom && dateTo) {
                // Only dateTo: filter for that specific day
                const from = new Date(dateTo);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            } else if (dateFrom && dateTo) {
                // Both: filter from start of dateFrom to end of dateTo
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            }
            // If neither, no date filter
            return query.orderBy('timestamp', 'desc');
        }

        // Fetch AI Disease Advice (date range only)
        let diseasePageSnapshot = buildQuery(firestore.collection('ai_disease_advice'));
        const diseaseSnapshot = await diseasePageSnapshot.get();
        let aiDiseaseAdviceAll = diseaseSnapshot.docs.map(doc => {
            const data = doc.data();
            let readableTimestamp = '';
            if (data.timestamp) {
                if (typeof data.timestamp.toDate === 'function') {
                    readableTimestamp = data.timestamp.toDate().toLocaleString();
                } else if (data.timestamp._seconds) {
                    readableTimestamp = new Date(data.timestamp._seconds * 1000).toLocaleString();
                } else {
                    readableTimestamp = String(data.timestamp);
                }
            }
            return {
                ...data,
                timestamp: readableTimestamp
            };
        });

        // Enhanced filtering for disease advice
        aiDiseaseAdviceAll = aiDiseaseAdviceAll.filter(advice => {
            // Top-level fields
            if (cropName && !includesInsensitive(advice.cropName, cropName)) return false;
            if (growthStage && !includesInsensitive(advice.growthStage, growthStage)) return false;
            if (disease || prevention) {
                if (!advice.diseases || !Array.isArray(advice.diseases)) return false;
                const found = advice.diseases.some(d => {
                    if (disease && !includesInsensitive(d.disease, disease)) return false;
                    if (prevention && !includesInsensitive(d.prevention, prevention)) return false;
                    return true;
                });
                if (!found) return false;
            }
            return true;
        });

        // Pagination for disease advice
        const totalDiseaseRecords = aiDiseaseAdviceAll.length;
        const totalDiseasePages = Math.ceil(totalDiseaseRecords / pageSize) || 1;
        const aiDiseaseAdvice = aiDiseaseAdviceAll.slice((diseasePage - 1) * pageSize, diseasePage * pageSize);

        // Fetch AI Fertilizer Advice (date range only)
        let fertilizerPageSnapshot = buildQuery(firestore.collection('ai_fertilizer_advice'));
        const fertilizerSnapshot = await fertilizerPageSnapshot.get();
        let aiFertilizerAdviceAll = fertilizerSnapshot.docs.map(doc => {
            const data = doc.data();
            let readableTimestamp = '';
            if (data.timestamp) {
                if (typeof data.timestamp.toDate === 'function') {
                    readableTimestamp = data.timestamp.toDate().toLocaleString();
                } else if (data.timestamp._seconds) {
                    readableTimestamp = new Date(data.timestamp._seconds * 1000).toLocaleString();
                } else {
                    readableTimestamp = String(data.timestamp);
                }
            }
            return {
                ...data,
                timestamp: readableTimestamp
            };
        });

        // Enhanced filtering for fertilizer advice
        aiFertilizerAdviceAll = aiFertilizerAdviceAll.filter(advice => {
            if (cropName && !includesInsensitive(advice.cropName, cropName)) return false;
            if (growthStage && !includesInsensitive(advice.growthStage, growthStage)) return false;
            if (fertilizer || application || effect || reason) {
                if (!advice.fertilizers || !Array.isArray(advice.fertilizers)) return false;
                const found = advice.fertilizers.some(f => {
                    if (fertilizer && !includesInsensitive(f.name, fertilizer)) return false;
                    if (application && !includesInsensitive(f.application, application)) return false;
                    if (effect && !includesInsensitive(f.effect, effect)) return false;
                    if (reason && !includesInsensitive(f.reason, reason)) return false;
                    return true;
                });
                if (!found) return false;
            }
            return true;
        });

        // Pagination for fertilizer advice
        const totalFertilizerRecords = aiFertilizerAdviceAll.length;
        const totalFertilizerPages = Math.ceil(totalFertilizerRecords / pageSize) || 1;
        const aiFertilizerAdvice = aiFertilizerAdviceAll.slice((fertilizerPage - 1) * pageSize, fertilizerPage * pageSize);

        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
        
        res.render('admin/report-ai-disease-fertilizer', {
            user: req.session.user,
            aiDiseaseAdvice,
            aiFertilizerAdvice,
            filter,
            cropNames,
            diseasePagination: {
                currentPage: diseasePage,
                totalPages: totalDiseasePages,
                totalRecords: totalDiseaseRecords
            },
            fertilizerPagination: {
                currentPage: fertilizerPage,
                totalPages: totalFertilizerPages,
                totalRecords: totalFertilizerRecords
            }
        });}
        else{
            res.render('report-ai-disease-fertilizer', {
                user: req.session.user,
                aiDiseaseAdvice,
                aiFertilizerAdvice,
                filter,
                cropNames,
                diseasePagination: {
                    currentPage: diseasePage,
                    totalPages: totalDiseasePages,
                    totalRecords: totalDiseaseRecords
                },
                fertilizerPagination: {
                    currentPage: fertilizerPage,
                    totalPages: totalFertilizerPages,
                    totalRecords: totalFertilizerRecords
                }
            });
        }
    } catch (error) {
        console.error('Error rendering AI disease & fertilizer report:', error);
        const rolesession = req.session.user?.role;
        if(rolesession.toUpperCase() === 'ADMIN'){
            res.render('admin/report-ai-disease-fertilizer', {
            user: req.session.user,
            aiDiseaseAdvice: [],
            aiFertilizerAdvice: [],
            filter: {},
            cropNames: [],
            diseasePagination: { currentPage: 1, totalPages: 1, totalRecords: 0 },
            fertilizerPagination: { currentPage: 1, totalPages: 1, totalRecords: 0 },
            error: 'Failed to load AI disease & fertilizer report.'
        });
        } else {
            res.render('report-ai-disease-fertilizer', {
                user: req.session.user,
                aiDiseaseAdvice: [],
                aiFertilizerAdvice: [],
                filter: {},
                cropNames: [],
                diseasePagination: { currentPage: 1, totalPages: 1, totalRecords: 0 },
                fertilizerPagination: { currentPage: 1, totalPages: 1, totalRecords: 0 },
                error: 'Failed to load AI disease & fertilizer report.'
            });
        }
    }
};

exports.exportExcel = async (req, res) => {
    try {
        const { cropName, growthStage, dateFrom, dateTo, disease, prevention, fertilizer, application, effect, reason } = req.query;
        if (!dateFrom || !dateTo) {
            return res.status(400).send('Date From and Date To are required for export.');
        }
        const filter = { cropName, growthStage, dateFrom, dateTo, disease, prevention, fertilizer, application, effect, reason };
        function includesInsensitive(haystack, needle) {
            if (!haystack || !needle) return false;
            return haystack.toString().toLowerCase().includes(needle.toString().toLowerCase().trim());
        }
        function buildQuery(baseRef) {
            let query = baseRef;
            if (dateFrom && !dateTo) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateFrom);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            } else if (!dateFrom && dateTo) {
                const from = new Date(dateTo);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            } else if (dateFrom && dateTo) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            }
            return query.orderBy('timestamp', 'desc');
        }
        // Fetch and filter disease advice
        let diseaseQuery = buildQuery(firestore.collection('ai_disease_advice'));
        const diseaseSnapshot = await diseaseQuery.get();
        let aiDiseaseAdviceAll = diseaseSnapshot.docs.map(doc => {
            const data = doc.data();
            let readableTimestamp = '';
            let dateKey = '';
            if (data.timestamp) {
                let jsDate;
                if (typeof data.timestamp.toDate === 'function') {
                    jsDate = data.timestamp.toDate();
                } else if (data.timestamp._seconds) {
                    jsDate = new Date(data.timestamp._seconds * 1000);
                } else {
                    jsDate = new Date(data.timestamp);
                }
                readableTimestamp = jsDate.toLocaleString();
                // Format as MM/DD/YYYY
                dateKey = (jsDate.getMonth() + 1).toString().padStart(2, '0') + '/' + jsDate.getDate().toString().padStart(2, '0') + '/' + jsDate.getFullYear();
            }
            return {
                ...data,
                timestamp: readableTimestamp,
                dateKey
            };
        });
        aiDiseaseAdviceAll = aiDiseaseAdviceAll.filter(advice => {
            if (shouldFilterCropName(cropName) && !includesInsensitive(advice.cropName, cropName)) return false;
            if (growthStage && !includesInsensitive(advice.growthStage, growthStage)) return false;
            if (disease || prevention) {
                if (!advice.diseases || !Array.isArray(advice.diseases)) return false;
                const found = advice.diseases.some(d => {
                    if (disease && !includesInsensitive(d.disease, disease)) return false;
                    if (prevention && !includesInsensitive(d.prevention, prevention)) return false;
                    return true;
                });
                if (!found) return false;
            }
            return true;
        });
        // Fetch and filter fertilizer advice
        let fertilizerQuery = buildQuery(firestore.collection('ai_fertilizer_advice'));
        const fertilizerSnapshot = await fertilizerQuery.get();
        let aiFertilizerAdviceAll = fertilizerSnapshot.docs.map(doc => {
            const data = doc.data();
            let readableTimestamp = '';
            let dateKey = '';
            if (data.timestamp) {
                let jsDate;
                if (typeof data.timestamp.toDate === 'function') {
                    jsDate = data.timestamp.toDate();
                } else if (data.timestamp._seconds) {
                    jsDate = new Date(data.timestamp._seconds * 1000);
                } else {
                    jsDate = new Date(data.timestamp);
                }
                readableTimestamp = jsDate.toLocaleString();
                // Format as MM/DD/YYYY
                dateKey = (jsDate.getMonth() + 1).toString().padStart(2, '0') + '/' + jsDate.getDate().toString().padStart(2, '0') + '/' + jsDate.getFullYear();
            }
            return {
                ...data,
                timestamp: readableTimestamp,
                dateKey
            };
        });
        aiFertilizerAdviceAll = aiFertilizerAdviceAll.filter(advice => {
            if (shouldFilterCropName(cropName) && !includesInsensitive(advice.cropName, cropName)) return false;
            if (growthStage && !includesInsensitive(advice.growthStage, growthStage)) return false;
            if (fertilizer || application || effect || reason) {
                if (!advice.fertilizers || !Array.isArray(advice.fertilizers)) return false;
                const found = advice.fertilizers.some(f => {
                    if (fertilizer && !includesInsensitive(f.name, fertilizer)) return false;
                    if (application && !includesInsensitive(f.application, application)) return false;
                    if (effect && !includesInsensitive(f.effect, effect)) return false;
                    if (reason && !includesInsensitive(f.reason, reason)) return false;
                    return true;
                });
                if (!found) return false;
            }
            return true;
        });
        // Group by cropName, growthStage, dateKey
        const groupMap = new Map();
        // Add all disease advice
        aiDiseaseAdviceAll.forEach(da => {
            const key = `${da.cropName}||${da.growthStage}||${da.dateKey}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { cropName: da.cropName, growthStage: da.growthStage, dateKey: da.dateKey, diseases: [], fertilizers: [] });
            }
            groupMap.get(key).diseases = da.diseases && Array.isArray(da.diseases) && da.diseases.length > 0 ? da.diseases : [{ disease: '-', prevention: '-' }];
        });
        // Add all fertilizer advice
        aiFertilizerAdviceAll.forEach(fa => {
            const key = `${fa.cropName}||${fa.growthStage}||${fa.dateKey}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { cropName: fa.cropName, growthStage: fa.growthStage, dateKey: fa.dateKey, diseases: [], fertilizers: [] });
            }
            groupMap.get(key).fertilizers = fa.fertilizers && Array.isArray(fa.fertilizers) && fa.fertilizers.length > 0 ? fa.fertilizers : [{ name: '-', application: '-', effect: '-', reason: '-' }];
        });
        // Prepare rows
        let rows = [];
        for (const [key, group] of groupMap.entries()) {
            const maxLen = Math.max(group.diseases.length, group.fertilizers.length);
            for (let i = 0; i < maxLen; i++) {
                rows.push({
                    cropName: i === 0 ? group.cropName : '',
                    growthStage: i === 0 ? group.growthStage : '',
                    date: i === 0 ? group.dateKey : '',
                    disease: group.diseases[i] ? group.diseases[i].disease : '-',
                    prevention: group.diseases[i] ? group.diseases[i].prevention : '-',
                    fertilizerName: group.fertilizers[i] ? group.fertilizers[i].name : '-',
                    effect: group.fertilizers[i] ? group.fertilizers[i].effect : '-',
                    application: group.fertilizers[i] ? group.fertilizers[i].application : '-',
                    reason: group.fertilizers[i] ? group.fertilizers[i].reason : '-'
                });
            }
        }
        // Create Excel workbook
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('AI Disease & Fertilizer Advice');
        // Set up columns for key mapping only (do not use for header creation)
        sheet.columns = [
            { key: 'cropName' },
            { key: 'growthStage' },
            { key: 'date' },
            { key: 'disease' },
            { key: 'prevention' },
            { key: 'fertilizerName' },
            { key: 'effect' },
            { key: 'application' },
            { key: 'reason' }
        ];
        // Add report title, subtitle, and generated date as the first three rows
        const now = new Date();
        const generatedDate = now.toLocaleString();
        sheet.addRow(['AI Disease & Fertilizer Advice Report']);
        sheet.addRow(['Comprehensive report of AI-generated disease and fertilizer advice for all crops, with full details and color-coded sections.']);
        sheet.addRow([`Generated: ${generatedDate}`]);
        // Merge all columns for the first three rows
        for (let i = 1; i <= 3; i++) {
            sheet.mergeCells(i, 1, i, 9);
            const row = sheet.getRow(i);
            row.alignment = { vertical: 'middle', horizontal: 'center' };
            row.font = { bold: i === 1, size: i === 1 ? 18 : 12, color: { argb: 'FF2C3E50' } };
        }
        // Add merged group header row (row 4)
        sheet.addRow(['', '', '', 'Disease', '', 'Fertilizer', '', '', '']);
        sheet.mergeCells('D4:E4');
        sheet.mergeCells('F4:I4');
        const groupHeaderRow = sheet.getRow(4);
        groupHeaderRow.getCell(1).fill = groupHeaderRow.getCell(2).fill = groupHeaderRow.getCell(3).fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2980B9' }
        };
        groupHeaderRow.getCell(1).font = groupHeaderRow.getCell(2).font = groupHeaderRow.getCell(3).font = { bold: true, color: { argb: 'FF2980B9' }, size: 13 };
        groupHeaderRow.getCell(4).fill = groupHeaderRow.getCell(5).fill = {
            type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE74C3C' }
        };
        groupHeaderRow.getCell(4).font = groupHeaderRow.getCell(5).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
        for (let i = 6; i <= 9; i++) {
            groupHeaderRow.getCell(i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF27AE60' } };
            groupHeaderRow.getCell(i).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
        }
        groupHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
        // Add column headers (row 5)
        sheet.addRow([
            'Crop Name', 'Growth Stage', 'Date', 'Disease Name', 'Prevention', 'Fertilizer Name', 'Effect', 'Application', 'Reason'
        ]);
        const colHeaderRow = sheet.getRow(5);
        colHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF5DADE2' } };
        colHeaderRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF85C1E9' } };
        colHeaderRow.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFAED6F1' } };
        colHeaderRow.getCell(1).font = colHeaderRow.getCell(2).font = colHeaderRow.getCell(3).font = { bold: true, color: { argb: 'FF1B2631' } };
        colHeaderRow.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1948A' } };
        colHeaderRow.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFADBD8' } };
        colHeaderRow.getCell(4).font = colHeaderRow.getCell(5).font = { bold: true, color: { argb: 'FF78281F' } };
        colHeaderRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF58D68D' } };
        colHeaderRow.getCell(7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF82E0AA' } };
        colHeaderRow.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA9DFBF' } };
        colHeaderRow.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD5F5E3' } };
        colHeaderRow.getCell(6).font = colHeaderRow.getCell(7).font = colHeaderRow.getCell(8).font = colHeaderRow.getCell(9).font = { bold: true, color: { argb: 'FF145A32' } };
        colHeaderRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        // Add data rows (starting from row 6)
        rows.forEach(row => sheet.addRow(row));
        // Alternate row background color for each group
        let lastGroupKey = '';
        let groupColorToggle = false;
        for (let i = 6; i <= sheet.rowCount; i++) {
            const row = sheet.getRow(i);
            const groupKey = (row.getCell(1).value || lastGroupKey) + '||' + (row.getCell(2).value || '') + '||' + (row.getCell(3).value || '');
            if (row.getCell(1).value) {
                groupColorToggle = !groupColorToggle;
                lastGroupKey = row.getCell(1).value + '||' + row.getCell(2).value + '||' + row.getCell(3).value;
            }
            const bgColor = groupColorToggle ? 'FFF2F6FA' : 'FFFFFFFF';
            for (let j = 1; j <= 9; j++) {
                row.getCell(j).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: bgColor }
                };
                row.getCell(j).alignment = { wrapText: true, vertical: 'top' };
            }
        }
        // Auto-size all columns based on the max length of their content, but cap at 70 for most, and 25 for short columns
        const shortColumns = [0, 1, 2, 3, 5]; // 0-based indices for Crop Name, Growth Stage, Date, Disease Name, Fertilizer Name
        sheet.columns.forEach((column, i) => {
            let maxLength = 10;
            column.eachCell && column.eachCell({ includeEmpty: true }, cell => {
                const val = cell.value ? cell.value.toString() : '';
                if (val.length > maxLength) maxLength = val.length;
            });
            const maxWidth = shortColumns.includes(i) ? 25 : 70;
            column.width = Math.min(maxLength + 2, maxWidth);
        });
        // Sanitize file name
        function sanitize(str) {
            return String(str).replace(/[^a-z0-9\-_.]/gi, '_');
        }
        const fileName = `ai-disease-fertilizer-report-${sanitize(cropName)}-${sanitize(dateFrom)}-${sanitize(dateTo)}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting Excel:', error);
        res.status(500).send('Failed to export Excel');
    }
};

exports.exportPdf = async (req, res) => {
    try {
        const { cropName, growthStage, dateFrom, dateTo, disease, prevention, fertilizer, application, effect, reason } = req.query;
        if (!dateFrom || !dateTo) {
            return res.status(400).send('Date From and Date To are required for export.');
        }
        const filter = { cropName, growthStage, dateFrom, dateTo, disease, prevention, fertilizer, application, effect, reason };
        function includesInsensitive(haystack, needle) {
            if (!haystack || !needle) return false;
            return haystack.toString().toLowerCase().includes(needle.toString().toLowerCase().trim());
        }
        function buildQuery(baseRef) {
            let query = baseRef;
            if (dateFrom && dateTo) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            }
            return query.orderBy('timestamp', 'desc');
        }
        // Fetch and filter disease advice
        let diseaseQuery = buildQuery(firestore.collection('ai_disease_advice'));
        const diseaseSnapshot = await diseaseQuery.get();
        let aiDiseaseAdviceAll = diseaseSnapshot.docs.map(doc => {
            const data = doc.data();
            let readableTimestamp = '';
            let dateKey = '';
            if (data.timestamp) {
                let jsDate;
                if (typeof data.timestamp.toDate === 'function') {
                    jsDate = data.timestamp.toDate();
                } else if (data.timestamp._seconds) {
                    jsDate = new Date(data.timestamp._seconds * 1000);
                } else {
                    jsDate = new Date(data.timestamp);
                }
                readableTimestamp = jsDate.toLocaleString();
                // Format as MM/DD/YYYY
                dateKey = (jsDate.getMonth() + 1).toString().padStart(2, '0') + '/' + jsDate.getDate().toString().padStart(2, '0') + '/' + jsDate.getFullYear();
            }
            return {
                ...data,
                timestamp: readableTimestamp,
                dateKey
            };
        });
        aiDiseaseAdviceAll = aiDiseaseAdviceAll.filter(advice => {
            if (shouldFilterCropName(cropName) && !includesInsensitive(advice.cropName, cropName)) return false;
            if (growthStage && !includesInsensitive(advice.growthStage, growthStage)) return false;
            if (disease || prevention) {
                if (!advice.diseases || !Array.isArray(advice.diseases)) return false;
                const found = advice.diseases.some(d => {
                    if (disease && !includesInsensitive(d.disease, disease)) return false;
                    if (prevention && !includesInsensitive(d.prevention, prevention)) return false;
                    return true;
                });
                if (!found) return false;
            }
            return true;
        });
        // Fetch and filter fertilizer advice
        let fertilizerQuery = buildQuery(firestore.collection('ai_fertilizer_advice'));
        const fertilizerSnapshot = await fertilizerQuery.get();
        let aiFertilizerAdviceAll = fertilizerSnapshot.docs.map(doc => {
            const data = doc.data();
            let readableTimestamp = '';
            let dateKey = '';
            if (data.timestamp) {
                let jsDate;
                if (typeof data.timestamp.toDate === 'function') {
                    jsDate = data.timestamp.toDate();
                } else if (data.timestamp._seconds) {
                    jsDate = new Date(data.timestamp._seconds * 1000);
                } else {
                    jsDate = new Date(data.timestamp);
                }
                readableTimestamp = jsDate.toLocaleString();
                // Format as MM/DD/YYYY
                dateKey = (jsDate.getMonth() + 1).toString().padStart(2, '0') + '/' + jsDate.getDate().toString().padStart(2, '0') + '/' + jsDate.getFullYear();
            }
            return {
                ...data,
                timestamp: readableTimestamp,
                dateKey
            };
        });
        aiFertilizerAdviceAll = aiFertilizerAdviceAll.filter(advice => {
            if (shouldFilterCropName(cropName) && !includesInsensitive(advice.cropName, cropName)) return false;
            if (growthStage && !includesInsensitive(advice.growthStage, growthStage)) return false;
            if (fertilizer || application || effect || reason) {
                if (!advice.fertilizers || !Array.isArray(advice.fertilizers)) return false;
                const found = advice.fertilizers.some(f => {
                    if (fertilizer && !includesInsensitive(f.name, fertilizer)) return false;
                    if (application && !includesInsensitive(f.application, application)) return false;
                    if (effect && !includesInsensitive(f.effect, effect)) return false;
                    if (reason && !includesInsensitive(f.reason, reason)) return false;
                    return true;
                });
                if (!found) return false;
            }
            return true;
        });
        // Group by cropName, growthStage, dateKey (same as Excel)
        const groupMap = new Map();
        aiDiseaseAdviceAll.forEach(da => {
            const key = `${da.cropName}||${da.growthStage}||${da.dateKey}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { cropName: da.cropName, growthStage: da.growthStage, dateKey: da.dateKey, diseases: [], fertilizers: [] });
            }
            groupMap.get(key).diseases = da.diseases && Array.isArray(da.diseases) && da.diseases.length > 0 ? da.diseases : [{ disease: '-', prevention: '-' }];
        });
        aiFertilizerAdviceAll.forEach(fa => {
            const key = `${fa.cropName}||${fa.growthStage}||${fa.dateKey}`;
            if (!groupMap.has(key)) {
                groupMap.set(key, { cropName: fa.cropName, growthStage: fa.growthStage, dateKey: fa.dateKey, diseases: [], fertilizers: [] });
            }
            groupMap.get(key).fertilizers = fa.fertilizers && Array.isArray(fa.fertilizers) && fa.fertilizers.length > 0 ? fa.fertilizers : [{ name: '-', application: '-', effect: '-', reason: '-' }];
        });
        // Prepare rows (same as Excel)
        let rows = [];
        for (const [key, group] of groupMap.entries()) {
            const maxLen = Math.max(group.diseases.length, group.fertilizers.length);
            for (let i = 0; i < maxLen; i++) {
                rows.push({
                    cropName: i === 0 ? group.cropName : '',
                    growthStage: i === 0 ? group.growthStage : '',
                    date: i === 0 ? group.dateKey : '',
                    disease: group.diseases[i] ? group.diseases[i].disease : '-',
                    prevention: group.diseases[i] ? group.diseases[i].prevention : '-',
                    fertilizerName: group.fertilizers[i] ? group.fertilizers[i].name : '-',
                    effect: group.fertilizers[i] ? group.fertilizers[i].effect : '-',
                    application: group.fertilizers[i] ? group.fertilizers[i].application : '-',
                    reason: group.fertilizers[i] ? group.fertilizers[i].reason : '-'
                });
            }
        }

        // PDF rendering
        const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape', bufferPages: true });
        // Sanitize file name
        function sanitize(str) {
            return String(str).replace(/[^a-z0-9\-_.]/gi, '_');
        }
        const fileName = `ai-disease-fertilizer-report-${sanitize(cropName)}-${sanitize(dateFrom)}-${sanitize(dateTo)}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        doc.pipe(res);

        // Title, subtitle, and generated date
        doc.fontSize(22).fillColor('#2c3e50').font('Helvetica-Bold').text('AI Disease & Fertilizer Advice Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor('#555').font('Helvetica').text('Comprehensive report of AI-generated disease and fertilizer advice for all crops, with full details and color-coded sections.', { align: 'center' });
        doc.moveDown(0.2);
        doc.fontSize(10).fillColor('#555').text('Generated: ' + new Date().toLocaleString(), { align: 'center' });
        doc.moveDown(1);

        // Table columns (same as Excel)
        const tableHeaders = [
            { label: 'Crop Name', property: 'cropName', width: 70, headerColor: '#5DADE2', headerAlign: 'center', align: 'left' },
            { label: 'Growth Stage', property: 'growthStage', width: 70, headerColor: '#85C1E9', headerAlign: 'center', align: 'left' },
            { label: 'Date', property: 'date', width: 70, headerColor: '#AED6F1', headerAlign: 'center', align: 'left' },
            { label: 'Disease Name', property: 'disease', width: 70, headerColor: '#F1948A', headerAlign: 'center', align: 'left' },
            { label: 'Prevention', property: 'prevention', width: 70, headerColor: '#FADBD8', headerAlign: 'center', align: 'left' },
            { label: 'Fertilizer Name', property: 'fertilizerName', width: 70, headerColor: '#58D68D', headerAlign: 'center', align: 'left' },
            { label: 'Effect', property: 'effect', width: 70, headerColor: '#82E0AA', headerAlign: 'center', align: 'left' },
            { label: 'Application', property: 'application', width: 70, headerColor: '#A9DFBF', headerAlign: 'center', align: 'left' },
            { label: 'Reason', property: 'reason', width: 70, headerColor: '#D5F5E3', headerAlign: 'center', align: 'left' }
        ];

        if (rows.length > 0) {
            // Excel-like PDF table rendering with grouped headers
            const headers = [
                { label: 'Crop Name', width: 80, bg: '#5DADE2', color: '#1B2631' },
                { label: 'Growth Stage', width: 80, bg: '#85C1E9', color: '#1B2631' },
                { label: 'Date', width: 60, bg: '#AED6F1', color: '#1B2631' },
                { label: 'Disease Name', width: 90, bg: '#F1948A', color: '#78281F' },
                { label: 'Prevention', width: 120, bg: '#FADBD8', color: '#78281F' },
                { label: 'Fertilizer Name', width: 90, bg: '#58D68D', color: '#145A32' },
                { label: 'Effect', width: 90, bg: '#82E0AA', color: '#145A32' },
                { label: 'Application', width: 90, bg: '#A9DFBF', color: '#145A32' },
                { label: 'Reason', width: 120, bg: '#D5F5E3', color: '#145A32' }
            ];
            const startX = doc.page.margins.left;
            let y = doc.y;
            const minRowHeight = 22;
            const groupHeaderHeight = 20;
            const pageHeight = doc.page.height - doc.page.margins.bottom;
            const topMargin = doc.page.margins.top;
            // Draw grouped header row
            let x = startX;
            // 3 blank cells
            let blankWidth = headers[0].width + headers[1].width + headers[2].width;
            doc.rect(x, y, blankWidth, groupHeaderHeight).fill('#2980B9');
            x += blankWidth;
            // 'Disease' header (2 columns)
            let diseaseWidth = headers[3].width + headers[4].width;
            doc.rect(x, y, diseaseWidth, groupHeaderHeight).fill('#E74C3C');
            doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text('Disease', x, y + 3, { width: diseaseWidth, align: 'center' });
            x += diseaseWidth;
            // 'Fertilizer' header (4 columns)
            let fertWidth = headers[5].width + headers[6].width + headers[7].width + headers[8].width;
            doc.rect(x, y, fertWidth, groupHeaderHeight).fill('#27AE60');
            doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text('Fertilizer', x, y + 3, { width: fertWidth, align: 'center' });
            y += groupHeaderHeight;
            // Draw column header row
            x = startX;
            headers.forEach(h => {
                doc.rect(x, y, h.width, minRowHeight).fill(h.bg);
                doc.fillColor(h.color).font('Helvetica-Bold').fontSize(10).text(h.label, x + 4, y + 6, { width: h.width - 8, align: 'center' });
                x += h.width;
            });
            doc.fillColor('black');
            y += minRowHeight;
            // Draw rows with dynamic height and robust page breaks
            rows.forEach((row, idx) => {
                x = startX;
                const cellVals = [
                    row.cropName, row.growthStage, row.date, row.disease, row.prevention,
                    row.fertilizerName, row.effect, row.application, row.reason
                ];
                // Calculate max height for this row
                let cellHeights = cellVals.map((val, i) =>
                    doc.heightOfString(val || '-', { width: headers[i].width - 8, align: 'left' })
                );
                let rowHeight = Math.max(...cellHeights, minRowHeight) + 8; // 8px extra padding
                // Only add a new page if this is not the last row and the next row won't fit
                if (y + rowHeight > pageHeight && idx < rows.length - 1) {
                    doc.addPage();
                    y = topMargin;
                    // Redraw grouped header row
                    x = startX;
                    doc.rect(x, y, blankWidth, groupHeaderHeight).fill('#2980B9');
                    x += blankWidth;
                    doc.rect(x, y, diseaseWidth, groupHeaderHeight).fill('#E74C3C');
                    doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text('Disease', x, y + 3, { width: diseaseWidth, align: 'center' });
                    x += diseaseWidth;
                    doc.rect(x, y, fertWidth, groupHeaderHeight).fill('#27AE60');
                    doc.fillColor('white').font('Helvetica-Bold').fontSize(12).text('Fertilizer', x, y + 3, { width: fertWidth, align: 'center' });
                    y += groupHeaderHeight;
                    // Redraw column header row
                    x = startX;
                    headers.forEach(h => {
                        doc.rect(x, y, h.width, minRowHeight).fill(h.bg);
                        doc.fillColor(h.color).font('Helvetica-Bold').fontSize(10).text(h.label, x + 4, y + 6, { width: h.width - 8, align: 'center' });
                        x += h.width;
                    });
                    doc.fillColor('black');
                    y += minRowHeight;
                }
                // Alternate row background
                if (idx % 2 === 0) {
                    doc.rect(x, y, headers.reduce((a, h) => a + h.width, 0), rowHeight).fill('#F2F6FA');
                } else {
                    doc.rect(x, y, headers.reduce((a, h) => a + h.width, 0), rowHeight).fill('#FFFFFF');
                }
                // Draw cell text
                let cellX = x;
                for (let i = 0; i < headers.length; i++) {
                    doc.fillColor('black').font('Helvetica').fontSize(9).text(
                        cellVals[i] || '-',
                        cellX + 4,
                        y + 6,
                        { width: headers[i].width - 8, align: 'left' }
                    );
                    cellX += headers[i].width;
                }
                y += rowHeight;
            });
        } else {
            doc.moveDown(2);
            doc.fontSize(14).fillColor('#e74c3c').text('No data available for the selected range.', { align: 'center' });
        }

        // Footer (write only on pages with content, at correct y-position)
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
        console.error('Error exporting PDF:', error);
        res.status(500).send('Failed to export PDF');
    }
};

// Add a check endpoint for frontend to verify if data exists before download
exports.exportCheck = async (req, res) => {
    try {
        const { cropName, dateFrom, dateTo } = req.query;
        if (!dateFrom || !dateTo) {
            return res.json({ hasData: false });
        }
        function buildQuery(baseRef) {
            let query = baseRef;
            if (dateFrom && dateTo) {
                const from = new Date(dateFrom);
                from.setHours(0, 0, 0, 0);
                const to = new Date(dateTo);
                to.setHours(23, 59, 59, 999);
                query = query.where('timestamp', '>=', from).where('timestamp', '<=', to);
            }
            return query.orderBy('timestamp', 'desc');
        }
        let diseaseQuery = buildQuery(firestore.collection('ai_disease_advice'));
        let fertilizerQuery = buildQuery(firestore.collection('ai_fertilizer_advice'));
        const [diseaseSnap, fertilizerSnap] = await Promise.all([
            diseaseQuery.get(),
            fertilizerQuery.get()
        ]);
        let hasData = false;
        if (shouldFilterCropName(cropName)) {
            hasData = diseaseSnap.docs.some(doc => doc.data().cropName && doc.data().cropName.toLowerCase() === cropName.toLowerCase()) ||
                      fertilizerSnap.docs.some(doc => doc.data().cropName && doc.data().cropName.toLowerCase() === cropName.toLowerCase());
        } else {
            hasData = diseaseSnap.size > 0 || fertilizerSnap.size > 0;
        }
        return res.json({ hasData });
    } catch (err) {
        return res.json({ hasData: false });
    }
}; 