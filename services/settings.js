/**
 * settings.js — Bot settings service
 *
 * UPSTASH LIMIT NOTE:
 * Free tier = 10,000 commands/day.
 * Settings are cached in-process for 60 seconds to minimize Redis reads.
 * Redis is only written when an admin saves a new setting.
 */

const { redisGet, redisSet } = require('./redis');
const config = require('../config');

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
        message: `Teşekkürler {{name}} Bey/Hanım! \n\nAçık adresiniz nedir? (İlçe, sokak ve bina/daire no)`,
    },
    {
        id: 'ASK_TV_SIZE',
        label: 'TV Boyutu',
        redisKey: 'tv_size',
        sheetColumn: 'TV_BOYUTU',
        isActive: true,
        message: `Adresinizi aldım! 📍\n\nTV'nizin ekran boyutu nedir?`,
    },
    {
        id: 'ASK_MOUNT_TYPE',
        label: 'Montaj Tipi',
        redisKey: 'mount_type',
        sheetColumn: 'MONTAJ_TIPI',
        isActive: true,
        message: `Son olarak: TV'yi *duvara* mı yoksa *sehpaya* mı kurulmasını istiyorsunuz?`,
    },
];

const CONFIRMATION_KEY = 'settings:confirmation_message';
const DEFAULT_CONFIRMATION =
    `✅ Talebiniz başarıyla alındı! Ekibimiz en kısa sürede sizinle iletişime geçecektir.`;

// ---- Google Sheets Integration ----
const SHEETS_CONFIG_KEY = 'settings:sheets_config';
const DEFAULT_SHEETS_CONFIG = {
    sheetsId: config.SHEETS_ID || '',
    googleCredsJson: config.GOOGLE_CREDS_JSON || '{}',
};

function normalizeSheetsConfig(data = {}) {
    const sheetsId = typeof data.sheetsId === 'string' ? data.sheetsId.trim() : '';
    const googleCredsJson = typeof data.googleCredsJson === 'string' && data.googleCredsJson.trim()
        ? data.googleCredsJson.trim()
        : '{}';
    return { sheetsId, googleCredsJson };
}

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

async function getSheetsConfig() {
    const cached = getCached(SHEETS_CONFIG_KEY);
    if (cached) return cached;

    const raw = await redisGet(SHEETS_CONFIG_KEY);
    if (!raw) {
        const fallback = normalizeSheetsConfig(DEFAULT_SHEETS_CONFIG);
        setCache(SHEETS_CONFIG_KEY, fallback);
        return fallback;
    }

    try {
        const parsed = JSON.parse(raw);
        const value = normalizeSheetsConfig(parsed);
        setCache(SHEETS_CONFIG_KEY, value);
        return value;
    } catch {
        const fallback = normalizeSheetsConfig(DEFAULT_SHEETS_CONFIG);
        setCache(SHEETS_CONFIG_KEY, fallback);
        return fallback;
    }
}

async function saveSheetsConfig(data) {
    const value = normalizeSheetsConfig(data);

    try {
        JSON.parse(value.googleCredsJson);
    } catch {
        throw new Error('GOOGLE_CREDS_JSON geçerli bir JSON olmalı');
    }

    await redisSet(SHEETS_CONFIG_KEY, JSON.stringify(value));
    setCache(SHEETS_CONFIG_KEY, value);
}

// Invalidate all caches (called after save to force fresh read next time)
function invalidateCache() {
    Object.keys(cache).forEach((k) => delete cache[k]);
}

module.exports = {
    getFlowSteps,
    saveFlowSteps,
    getConfirmationMessage,
    saveConfirmationMessage,
    getSheetsConfig,
    saveSheetsConfig,
    invalidateCache,
    DEFAULT_FLOW_STEPS,
    DEFAULT_SHEETS_CONFIG,
};
