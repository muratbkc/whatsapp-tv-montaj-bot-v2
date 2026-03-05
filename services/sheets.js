// Google Sheets customer record service — dynamic column support
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { SHEETS_ID, GOOGLE_CREDS_JSON } = require('../config');

function getTRDate() {
    const now = new Date();
    const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const dd = String(tr.getUTCDate()).padStart(2, '0');
    const mm = String(tr.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = tr.getUTCFullYear();
    const hh = String(tr.getUTCHours()).padStart(2, '0');
    const min = String(tr.getUTCMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

function makeAuth() {
    const creds = JSON.parse(GOOGLE_CREDS_JSON);
    return new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}

/**
 * Ensure the sheet has all required columns.
 * Adds any missing columns to the header row automatically.
 */
async function ensureColumns(sheet, requiredColumns) {
    try {
        await sheet.loadHeaderRow();
    } catch {
        // Fresh sheet with no header row yet — ignore error, setHeaderRow will create it
    }
    const existing = sheet.headerValues || [];
    const missing = requiredColumns.filter((col) => !existing.includes(col));

    if (missing.length > 0) {
        const newHeaders = [...existing, ...missing];
        await sheet.setHeaderRow(newHeaders);
        console.log(`[Sheets] Added columns: ${missing.join(', ')}`);
    }
}

/**
 * Append a customer record. Columns are determined by the active flow steps.
 * @param {Object} data - { answers: {key: value}, phone }
 * @param {Array} activeSteps - active flow step definitions from settings
 */
async function appendCustomer(data, activeSteps) {
    try {
        const doc = new GoogleSpreadsheet(SHEETS_ID, makeAuth());
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        // Determine required columns
        const stepColumns = activeSteps.map((s) => s.sheetColumn);
        const requiredColumns = ['TARIH', 'TELEFON', ...stepColumns, 'DURUM'];

        await ensureColumns(sheet, requiredColumns);

        // Build row object
        const row = {
            TARIH: getTRDate(),
            TELEFON: data.phone,
            DURUM: '⏳ Bekliyor',
        };
        activeSteps.forEach((s) => {
            row[s.sheetColumn] = data.answers[s.redisKey] || '';
        });

        await sheet.addRow(row);
        console.log(`[Sheets] Customer added: ${data.answers?.name || data.phone}`);
    } catch (err) {
        console.error('[Sheets] Error:', err.message);
    }
}

/**
 * Get recent customers from Google Sheets (for admin panel).
 */
async function getRecentCustomers(limit = 20) {
    try {
        const doc = new GoogleSpreadsheet(SHEETS_ID, makeAuth());
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        const headers = sheet.headerValues || [];

        const recent = rows.slice(-limit).reverse().map((row) => {
            const entry = {
                rowNumber: row.rowNumber,
                tarih: row.get('TARIH') || '',
                telefon: row.get('TELEFON') || '',
                durum: row.get('DURUM') || '',
                // All dynamic columns
                columns: {},
            };
            headers.forEach((h) => {
                if (!['TARIH', 'TELEFON', 'DURUM'].includes(h)) {
                    entry.columns[h] = row.get(h) || '';
                }
            });
            return entry;
        });

        return { total: rows.length, recent, headers };
    } catch (err) {
        console.error('[Sheets] Read error:', err.message);
        return { total: 0, recent: [], headers: [] };
    }
}

/**
 * Update DURUM column for a specific row.
 */
async function updateCustomerStatus(rowNumber, newStatus) {
    try {
        const doc = new GoogleSpreadsheet(SHEETS_ID, makeAuth());
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        const targetRow = rows.find((r) => r.rowNumber === rowNumber);
        if (targetRow) {
            targetRow.set('DURUM', newStatus);
            await targetRow.save();
            return true;
        }
        return false;
    } catch (err) {
        console.error('[Sheets] Update status error:', err.message);
        return false;
    }
}

module.exports = { appendCustomer, getRecentCustomers, updateCustomerStatus };
