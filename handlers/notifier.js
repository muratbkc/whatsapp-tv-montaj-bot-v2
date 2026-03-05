// Business owner notification module
const { getOwnerPhone } = require('../services/settings');

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
 * Owner phone is read from Redis (settable from admin panel),
 * falling back to OWNER_PHONE env var.
 */
async function notifyOwner(sendMsg, data) {
    const ownerPhone = await getOwnerPhone();
    if (!ownerPhone) {
        console.warn('[Notifier] No owner phone configured, skipping notification.');
        return;
    }

    // Build summary from dynamic answers
    const summaryLines = Object.entries(data)
        .filter(([k]) => !['phone'].includes(k))
        .map(([, v]) => v)
        .filter(Boolean);

    const text =
        '🔔 YENİ MONTAJ TALEBİ!\n' +
        '━━━━━━━━━━━━━━━━━━━━━\n' +
        `📞 ${data.phone}\n` +
        summaryLines.map((v) => `• ${v}`).join('\n') + '\n' +
        `🕐 ${getTRDate()}\n` +
        '━━━━━━━━━━━━━━━━━━━━━';

    try {
        await sendMsg(ownerPhone, text);
        console.log(`[Notifier] Owner notified: ${ownerPhone}`);
    } catch (err) {
        console.error('[Notifier] Error:', err.message);
    }
}

module.exports = { notifyOwner };
