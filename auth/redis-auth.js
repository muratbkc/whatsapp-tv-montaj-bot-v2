// Redis-backed Baileys auth state
// Saves session credentials in Redis so the bot survives Render restarts
// without asking for a new QR code.

const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { redisGet, redisSet, redisDel } = require('../services/redis');

const AUTH_KEY_PREFIX = 'baileys_auth:';

/**
 * Creates a Baileys-compatible auth state backed by Redis.
 * Mirrors the interface of useMultiFileAuthState but persists to Redis.
 */
async function useRedisAuthState() {
    // Read a key from Redis and deserialize with BufferJSON
    async function readData(key) {
        const raw = await redisGet(`${AUTH_KEY_PREFIX}${key}`);
        if (!raw) return null;
        try {
            return JSON.parse(raw, BufferJSON.reviver);
        } catch {
            return null;
        }
    }

    // Write a key to Redis with BufferJSON serialization
    async function writeData(key, data) {
        await redisSet(`${AUTH_KEY_PREFIX}${key}`, JSON.stringify(data, BufferJSON.replacer));
    }

    // Remove a key from Redis
    async function removeData(key) {
        await redisDel(`${AUTH_KEY_PREFIX}${key}`);
    }

    // Load existing creds from Redis or initialize fresh ones
    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const result = {};
                    for (const id of ids) {
                        const val = await readData(`${type}-${id}`);
                        if (val) result[id] = val;
                    }
                    return result;
                },
                set: async (data) => {
                    for (const [type, entries] of Object.entries(data)) {
                        for (const [id, value] of Object.entries(entries)) {
                            if (value) {
                                await writeData(`${type}-${id}`, value);
                            } else {
                                await removeData(`${type}-${id}`);
                            }
                        }
                    }
                },
            },
        },
        saveCreds: async () => {
            await writeData('creds', creds);
        },
    };
}

/**
 * Clear all auth data from Redis (used when logged out).
 */
async function clearAuthState() {
    await redisDel(`${AUTH_KEY_PREFIX}creds`);
    console.log('[Auth] Session cleared from Redis');
}

module.exports = { useRedisAuthState, clearAuthState };
