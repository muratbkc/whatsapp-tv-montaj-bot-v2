// Upstash Redis REST API client
const { REDIS_URL, REDIS_TOKEN } = require('../config');

const BASE = REDIS_URL.startsWith('https://') ? REDIS_URL : `https://${REDIS_URL}`;

async function redisRequest(path, method = 'GET') {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    return res.json();
}

// ---------- Conversation State ----------

async function getState(phone) {
    try {
        const data = await redisRequest(`/get/wa_state:${phone}`);
        if (!data.result) return null;
        return JSON.parse(data.result);
    } catch (err) {
        console.error(`[Redis] GET error for ${phone}:`, err.message);
        return null;
    }
}

async function setState(phone, state) {
    try {
        const val = encodeURIComponent(JSON.stringify(state));
        await redisRequest(`/set/wa_state:${phone}/${val}/ex/86400`, 'POST');
    } catch (err) {
        console.error(`[Redis] SET error for ${phone}:`, err.message);
    }
}

async function deleteState(phone) {
    try {
        await redisRequest(`/del/wa_state:${phone}`, 'POST');
    } catch (err) {
        console.error(`[Redis] DEL error for ${phone}:`, err.message);
    }
}

// ---------- Generic key-value (for auth & stats) ----------

async function redisGet(key) {
    try {
        const data = await redisRequest(`/get/${key}`);
        return data.result || null;
    } catch (err) {
        console.error(`[Redis] GET ${key}:`, err.message);
        return null;
    }
}

async function redisSet(key, value, ttl) {
    try {
        const val = encodeURIComponent(value);
        const path = ttl ? `/set/${key}/${val}/ex/${ttl}` : `/set/${key}/${val}`;
        await redisRequest(path, 'POST');
    } catch (err) {
        console.error(`[Redis] SET ${key}:`, err.message);
    }
}

async function redisDel(key) {
    try {
        await redisRequest(`/del/${key}`, 'POST');
    } catch (err) {
        console.error(`[Redis] DEL ${key}:`, err.message);
    }
}

// Atomic SET NX (only set if key does NOT exist)
// Returns true if key was set (we won the race), false if already existed
async function redisSetNX(key, value, ttl) {
    try {
        const val = encodeURIComponent(value);
        const path = ttl ? `/set/${key}/${val}/nx/ex/${ttl}` : `/set/${key}/${val}/nx`;
        const data = await redisRequest(path, 'POST');
        // Upstash returns {result: "OK"} if set, {result: null} if already existed
        return data.result === 'OK';
    } catch (err) {
        console.error(`[Redis] SETNX ${key}:`, err.message);
        return true; // On error, allow processing (fail open)
    }
}

module.exports = {
    getState,
    setState,
    deleteState,
    redisGet,
    redisSet,
    redisSetNX,
    redisDel,
};
