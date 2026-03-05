/**
 * settings.js — Bot settings service
 *
 * UPSTASH LIMIT NOTE:
 * Free tier = 10,000 commands/day.
 * Settings are cached in-process for 60 seconds to minimize Redis reads.
 * Redis is only written when an admin saves a new setting.
 */

const { redisGet, redisSet } = require('./redis');

// ---- In-memory cache (60 seconds TTL) ----
const cache = {};
const CACHE_TTL_MS = 60_000;

function getCached(key) {
    const entry = cache[key];
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        delete cache[key];
        return null;
    }
    return entry.value;
}

function setCache(key, value) {
    cache[key] = { value, ts: Date.now() };
}

// ---- Working Hours ----
const WORKING_HOURS_KEY = 'settings:working_hours';
const DEFAULT_WORKING_HOURS = {
    enabled: false,
    start: '09:00',
    end: '18:00',
    timezone: 'Europe/Istanbul',
    offMessage: '⏰ Şu an mesai saatlerimiz dışındasınız.\n\nÇalışma saatlerimiz: {{START}} - {{END}}\n\nMesajınızı aldık, mesai başlangıcında size döneceğiz! 🙏',
};

async function getWorkingHours() {
    const cached = getCached(WORKING_HOURS_KEY);
    if (cached) return cached;

    const raw = await redisGet(WORKING_HOURS_KEY);
    const value = raw ? JSON.parse(raw) : DEFAULT_WORKING_HOURS;
    setCache(WORKING_HOURS_KEY, value);
    return value;
}

async function saveWorkingHours(data) {
    await redisSet(WORKING_HOURS_KEY, JSON.stringify(data));
    setCache(WORKING_HOURS_KEY, data); // update cache immediately
}

/**
 * Returns true if current Istanbul time is within working hours.
 * Returns true if working hours feature is disabled (let all messages through).
 */
async function isWithinWorkingHours() {
    const wh = await getWorkingHours();
    if (!wh.enabled) return true;

    const now = new Date();
    // Get current time in Istanbul (UTC+3)
    const istanbulTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
    const currentMinutes = istanbulTime.getHours() * 60 + istanbulTime.getMinutes();

    const [startH, startM] = wh.start.split(':').map(Number);
    const [endH, endM] = wh.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

function formatOffMessage(wh) {
    return wh.offMessage
        .replace('{{START}}', wh.start)
        .replace('{{END}}', wh.end);
}

// ---- Flow Steps ----
const FLOW_STEPS_KEY = 'settings:flow_steps';

// Each step: { id, label, redisKey, sheetColumn, message, isActive }
const DEFAULT_FLOW_STEPS = [
    {
        id: 'ASK_NAME',
        label: 'İsim Soyisim',
        redisKey: 'name',
        sheetColumn: 'ISIM',
        isActive: true,
        message: `Hoşgeldiniz! 👋 TV montaj talebinizi almak için birkaç soru sormam gerekiyor.\n\nİsim soyisminiz nedir?`,
    },
    {
        id: 'ASK_ADDRESS',
        label: 'Adres',
        redisKey: 'address',
        sheetColumn: 'ADRES',
        isActive: true,
        message: `Teşekkürler {{name}} Bey/Hanım! 😊\n\nAçık adresiniz nedir? (İlçe, sokak ve bina/daire no)`,
    },
    {
        id: 'ASK_TV_SIZE',
        label: 'TV Boyutu',
        redisKey: 'tv_size',
        sheetColumn: 'TV_BOYUTU',
        isActive: true,
        message: `Adresinizi aldım! 📍\n\nTV'nizin ekran boyutu nedir?\n(Bilmiyorsanız TV'nin arkasındaki etikette yazar. Örn: 43", 55", 65")`,
    },
    {
        id: 'ASK_MOUNT_TYPE',
        label: 'Montaj Tipi',
        redisKey: 'mount_type',
        sheetColumn: 'MONTAJ_TIPI',
        isActive: true,
        message: `Anladım! 👍\n\nSon olarak: TV'yi *duvara* mı yoksa *sehpaya* mı kurulmasını istiyorsunuz?`,
    },
];

const CONFIRMATION_KEY = 'settings:confirmation_message';
const DEFAULT_CONFIRMATION =
    `✅ Talebiniz başarıyla alındı! Ekibimiz en kısa sürede sizinle iletişime geçecektir. 🔧`;

async function getFlowSteps() {
    const cached = getCached(FLOW_STEPS_KEY);
    if (cached) return cached;

    const raw = await redisGet(FLOW_STEPS_KEY);
    const value = raw ? JSON.parse(raw) : DEFAULT_FLOW_STEPS;
    setCache(FLOW_STEPS_KEY, value);
    return value;
}

async function saveFlowSteps(steps) {
    await redisSet(FLOW_STEPS_KEY, JSON.stringify(steps));
    setCache(FLOW_STEPS_KEY, steps);
}

async function getConfirmationMessage() {
    const cached = getCached(CONFIRMATION_KEY);
    if (cached !== null) return cached;

    const raw = await redisGet(CONFIRMATION_KEY);
    const value = raw || DEFAULT_CONFIRMATION;
    setCache(CONFIRMATION_KEY, value);
    return value;
}

async function saveConfirmationMessage(msg) {
    await redisSet(CONFIRMATION_KEY, msg);
    setCache(CONFIRMATION_KEY, msg);
}

// Invalidate all caches (called after save to force fresh read next time)
function invalidateCache() {
    Object.keys(cache).forEach((k) => delete cache[k]);
}

module.exports = {
    getWorkingHours,
    saveWorkingHours,
    isWithinWorkingHours,
    formatOffMessage,
    getFlowSteps,
    saveFlowSteps,
    getConfirmationMessage,
    saveConfirmationMessage,
    invalidateCache,
    DEFAULT_FLOW_STEPS,
    DEFAULT_WORKING_HOURS,
};
