// Google Sheets customer record service - dynamic column support
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { getSheetsConfig } = require('./settings');

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

function makeAuth(googleCredsJson) {
    let creds;
    try {
        creds = JSON.parse(googleCredsJson || '{}');
    } catch {
        throw new Error('GOOGLE_CREDS_JSON gecerli bir JSON olmali');
    }

    if (!creds.client_email || !creds.private_key) {
        throw new Error('Google servis JSON eksik: client_email veya private_key bulunamadi');
    }

    return new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
}

async function getSheet() {
    const { sheetsId, googleCredsJson } = await getSheetsConfig();

    if (!sheetsId) {
        throw new Error('SHEETS_ID ayarlanmamis');
    }

    const doc = new GoogleSpreadsheet(sheetsId, makeAuth(googleCredsJson));
    await doc.loadInfo();

    const sheet = doc.sheetsByIndex[0];
    if (!sheet) {
        throw new Error('Google Sheets icinde calisacak sayfa bulunamadi');
    }

    return sheet;
}

/**
 * Ensure the sheet has all required columns.
 * Adds any missing columns to the header row automatically.
 */
async function ensureColumns(sheet, requiredColumns) {
    try {
        await sheet.loadHeaderRow();
    } catch {
        // Fresh sheet with no header row yet - ignore error, setHeaderRow will create it
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
        const sheet = await getSheet();

        const stepColumns = activeSteps.map((s) => s.sheetColumn);
        const requiredColumns = ['TARIH', 'TELEFON', ...stepColumns, 'DURUM'];

        await ensureColumns(sheet, requiredColumns);

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
        const sheet = await getSheet();
        const rows = await sheet.getRows();
        const headers = sheet.headerValues || [];

        const recent = rows.slice(-limit).reverse().map((row) => {
            const entry = {
                rowNumber: row.rowNumber,
                tarih: row.get('TARIH') || '',
                telefon: row.get('TELEFON') || '',
                durum: row.get('DURUM') || '',
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
        const sheet = await getSheet();
        const rows = await sheet.getRows();
        const targetRow = rows.find((r) => r.rowNumber === rowNumber);

        if (!targetRow) {
            return false;
        }

        targetRow.set('DURUM', newStatus);
        await targetRow.save();
        return true;
    } catch (err) {
        console.error('[Sheets] Update status error:', err.message);
        return false;
    }
}

/**
 * Initialize headers and data validation for a brand new sheet.
 */
async function initializeHeaders(sheetsId, googleCredsJson) {
    if (!sheetsId) throw new Error('SHEETS_ID ayarlanmamis');

    let doc;
    const authClient = makeAuth(googleCredsJson);
    try {
        doc = new GoogleSpreadsheet(sheetsId, authClient);
        await doc.loadInfo();
    } catch (e) {
        throw new Error('Google Sheets erisim hatasi: Lutfen ID ve JSON bilgilerini, ayrıca "Paylas" kismi ile izinleri kontrol edin.');
    }

    const sheet = doc.sheetsByIndex[0];
    if (!sheet) {
        throw new Error('Google Sheets icinde calisacak sayfa bulunamadi');
    }

    let existing = [];
    try {
        await sheet.loadHeaderRow();
        existing = sheet.headerValues || [];
    } catch {
        // No header row probably means empty sheet
    }

    if (existing.length === 0) {
        const defaultHeaders = ['TARIH', 'ISIM', 'TELEFON', 'ADRES', 'TV_BOYUTU', 'MONTAJ_TIPI', 'DURUM'];
        await sheet.setHeaderRow(defaultHeaders);
        console.log('[Sheets] Initialize: Default headers added to an empty sheet.');

        const durumColumnIndex = defaultHeaders.indexOf('DURUM'); // should be 6

        try {
            await authClient.request({
                url: `https://sheets.googleapis.com/v4/spreadsheets/${sheetsId}:batchUpdate`,
                method: 'POST',
                data: {
                    requests: [
                        {
                            setDataValidation: {
                                range: {
                                    sheetId: sheet.sheetId,
                                    startRowIndex: 1, // Start after header row
                                    startColumnIndex: durumColumnIndex,
                                    endColumnIndex: durumColumnIndex + 1
                                },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: "⏳ Bekliyor" },
                                            { userEnteredValue: "✅ Tamamlandı" },
                                            { userEnteredValue: "❌ İptal" }
                                        ]
                                    },
                                    showCustomUi: true,
                                    strict: true
                                }
                            }
                        }
                    ]
                }
            });
            console.log('[Sheets] Initialize: Data Validation enabled for DURUM column.');
        } catch (validationErr) {
            console.error('[Sheets] Data validation could not be applied:', validationErr.message);
        }
    }
}

module.exports = { appendCustomer, getRecentCustomers, updateCustomerStatus, initializeHeaders };
