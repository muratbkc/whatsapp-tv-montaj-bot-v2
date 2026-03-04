// Google Sheets customer record service
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { SHEETS_ID, GOOGLE_CREDS_JSON } = require('../config');

function getTRDate() {
    const now = new Date();
    // UTC+3 for Turkey
    const tr = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const dd = String(tr.getUTCDate()).padStart(2, '0');
    const mm = String(tr.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = tr.getUTCFullYear();
    const hh = String(tr.getUTCHours()).padStart(2, '0');
    const min = String(tr.getUTCMinutes()).padStart(2, '0');
    return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

async function appendCustomer(data) {
    try {
        const creds = JSON.parse(GOOGLE_CREDS_JSON);
        const auth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SHEETS_ID, auth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];

        await sheet.addRow({
            Tarih: getTRDate(),
            'İsim Soyisim': data.name,
            Telefon: data.phone,
            Adres: data.address,
            'TV Boyutu': data.tv_size,
            'Montaj Tipi': data.mount_type,
            Durum: '⏳ Bekliyor',
        });

        console.log(`[Sheets] Customer added: ${data.name}`);
    } catch (err) {
        console.error('[Sheets] Error:', err.message);
    }
}

/**
 * Get recent customers from Google Sheets (for admin panel).
 */
async function getRecentCustomers(limit = 20) {
    try {
        const creds = JSON.parse(GOOGLE_CREDS_JSON);
        const auth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SHEETS_ID, auth);
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();

        // Return the last N rows, newest first
        const recent = rows.slice(-limit).reverse().map((row) => ({
            tarih: row.get('Tarih') || '',
            isim: row.get('İsim Soyisim') || '',
            telefon: row.get('Telefon') || '',
            adres: row.get('Adres') || '',
            tv_boyutu: row.get('TV Boyutu') || '',
            montaj_tipi: row.get('Montaj Tipi') || '',
            durum: row.get('Durum') || '',
        }));

        return { total: rows.length, recent };
    } catch (err) {
        console.error('[Sheets] Read error:', err.message);
        return { total: 0, recent: [] };
    }
}

module.exports = { appendCustomer, getRecentCustomers };
