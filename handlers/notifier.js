// Business owner notification module
const { OWNER_PHONE } = require('../config');

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

/**
 * Send a formatted notification to the business owner.
 * @param {Function} sendMsg - The sendMessage function from index.js
 * @param {Object} data - Customer data
 */
async function notifyOwner(sendMsg, data) {
    const text =
        '🔔 YENİ MONTAJ TALEBİ!\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        `👤 ${data.name}\n` +
        `📞 ${data.phone}\n` +
        `📍 ${data.address}\n` +
        `📺 ${data.tv_size} | ${data.mount_type}\n` +
        `🕐 ${getTRDate()}\n` +
        '━━━━━━━━━━━━━━━━━━━━━';

    try {
        await sendMsg(OWNER_PHONE, text);
        console.log(`[Notifier] Owner notified about ${data.name}`);
    } catch (err) {
        console.error('[Notifier] Error:', err.message);
    }
}

module.exports = { notifyOwner };
