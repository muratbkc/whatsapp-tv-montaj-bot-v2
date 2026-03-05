// ============================================================
// WhatsApp TV Montaj Bot — Baileys + Express + Admin Panel
// ============================================================

const { default: makeWASocket, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const http = require('http');
const { Server: SocketIO } = require('socket.io');
const path = require('path');

const config = require('./config');
const { useRedisAuthState, clearAuthState } = require('./auth/redis-auth');
const { handleMessage } = require('./handlers/flow');
const { getRecentCustomers, updateCustomerStatus } = require('./services/sheets');
const {
    getWorkingHours, saveWorkingHours,
    getFlowSteps, saveFlowSteps,
    getConfirmationMessage, saveConfirmationMessage,
    getSheetsConfig, saveSheetsConfig,
    invalidateCache, DEFAULT_FLOW_STEPS, DEFAULT_WORKING_HOURS,
} = require('./services/settings');

// ---- Express + Socket.io Setup ----
const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Global State ----
let sock = null;
let isConnected = false;
let isBotPaused = false;
let messagesProcessed = 0;
let reconnectAttempts = 0;
let isSessionResetting = false;
const MAX_RECONNECT = 10;

// ---- API Endpoints ----

// Simple password auth
app.post('/api/auth', (req, res) => {
    const { password } = req.body;
    if (password === config.PANEL_PASSWORD) {
        return res.json({ ok: true });
    }
    return res.status(401).json({ error: 'Invalid password' });
});

// Health check (also used for self-ping)
app.get('/health', (req, res) => {
    res.json({ status: 'ok', connected: isConnected, uptime: process.uptime() });
});

// Get recent customers
app.get('/api/customers', async (req, res) => {
    if (req.headers['x-password'] !== config.PANEL_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const data = await getRecentCustomers(20);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update customer status
app.post('/api/customers/status', async (req, res) => {
    if (req.headers['x-password'] !== config.PANEL_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const { rowNumber, status } = req.body;
        if (!rowNumber || !status) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const success = await updateCustomerStatus(rowNumber, status);
        if (success) {
            io.emit('new_customer'); // Broadcast change to all clients
            return res.json({ ok: true });
        }
        res.status(400).json({ error: 'Could not update status' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get bot status
app.get('/api/status', (req, res) => {
    res.json({ connected: isConnected, messagesProcessed, paused: isBotPaused });
});

// Stop the bot (pause — stop responding to messages, keep WA connection alive)
app.post('/api/bot/stop', (req, res) => {
    if (req.headers['x-password'] !== config.PANEL_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    isBotPaused = true;
    console.log('[Bot] ⏸️ Bot paused by admin panel');
    io.emit('bot_paused');
    res.json({ ok: true, paused: true });
});

// Start / resume the bot
app.post('/api/bot/start', (req, res) => {
    if (req.headers['x-password'] !== config.PANEL_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    isBotPaused = false;
    console.log('[Bot] ▶️ Bot resumed by admin panel');
    io.emit('bot_resumed');
    res.json({ ok: true, paused: false });
});

// Logout current WhatsApp session and force a new QR flow
app.post('/api/bot/reset-session', async (req, res) => {
    if (req.headers['x-password'] !== config.PANEL_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (isSessionResetting) {
        return res.status(409).json({ error: 'Session reset already in progress' });
    }

    isSessionResetting = true;
    try {
        const currentSock = sock;
        sock = null;
        isConnected = false;
        isBotPaused = false;
        reconnectAttempts = 0;
        io.emit('disconnected');
        io.emit('bot_resumed');

        if (currentSock) {
            try {
                currentSock.ev.removeAllListeners();
            } catch {
                // Ignore
            }
            try {
                await currentSock.logout();
                console.log('[Bot] WhatsApp session logged out by admin panel');
            } catch (err) {
                console.warn('[Bot] Logout warning:', err.message);
            }
            try {
                currentSock.end(undefined);
            } catch {
                // Ignore
            }
        }

        await clearAuthState();

        setTimeout(async () => {
            try {
                await startBot();
            } catch (err) {
                console.error('[Bot] Restart after reset failed:', err.message);
            } finally {
                isSessionResetting = false;
            }
        }, 1200);

        return res.json({ ok: true });
    } catch (err) {
        isSessionResetting = false;
        return res.status(500).json({ error: err.message });
    }
});

// ---- Socket.io Auth Middleware ----
io.use((socket, next) => {
    if (socket.handshake.auth?.password === config.PANEL_PASSWORD) {
        return next();
    }
    return next(new Error('Unauthorized'));
});

// ---- Send current state to newly connected socket ----
io.on('connection', (socket) => {
    if (isConnected) {
        socket.emit('connected');
        socket.emit('stats', { messagesProcessed });
    } else {
        socket.emit('disconnected');
    }
    // FIX: send bot pause state so page refresh shows correct button
    if (isBotPaused) {
        socket.emit('bot_paused');
    } else {
        socket.emit('bot_resumed');
    }
});

// ---- Settings API ----
const checkAuth = (req, res) => {
    if (req.headers['x-password'] !== config.PANEL_PASSWORD) {
        res.status(401).json({ error: 'Unauthorized' });
        return false;
    }
    return true;
};

// Working hours
app.get('/api/settings/working-hours', async (req, res) => {
    if (!checkAuth(req, res)) return;
    res.json(await getWorkingHours());
});
app.post('/api/settings/working-hours', async (req, res) => {
    if (!checkAuth(req, res)) return;
    await saveWorkingHours({ ...DEFAULT_WORKING_HOURS, ...req.body });
    res.json({ ok: true });
});

// Flow steps
app.get('/api/settings/flow-steps', async (req, res) => {
    if (!checkAuth(req, res)) return;
    res.json(await getFlowSteps());
});
app.post('/api/settings/flow-steps', async (req, res) => {
    if (!checkAuth(req, res)) return;
    const { steps } = req.body;
    if (!Array.isArray(steps)) return res.status(400).json({ error: 'steps must be array' });
    await saveFlowSteps(steps);
    invalidateCache();
    res.json({ ok: true });
});

// Confirmation message
app.get('/api/settings/confirmation', async (req, res) => {
    if (!checkAuth(req, res)) return;
    res.json({ message: await getConfirmationMessage() });
});
app.post('/api/settings/confirmation', async (req, res) => {
    if (!checkAuth(req, res)) return;
    await saveConfirmationMessage(req.body.message || '');
    res.json({ ok: true });
});

// Google Sheets integration
app.get('/api/settings/sheets-config', async (req, res) => {
    if (!checkAuth(req, res)) return;
    res.json(await getSheetsConfig());
});
app.post('/api/settings/sheets-config', async (req, res) => {
    if (!checkAuth(req, res)) return;
    try {
        const sheetsId = req.body.sheetsId?.trim() || '';
        const googleCredsJson = req.body.googleCredsJson?.trim() || '{}';

        // Only try to initialize if user actually provided credentials
        if (sheetsId && googleCredsJson && googleCredsJson !== '{}') {
            const { initializeHeaders } = require('./services/sheets');
            await initializeHeaders(sheetsId, googleCredsJson);
        }

        await saveSheetsConfig({ sheetsId, googleCredsJson });
        invalidateCache();
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});


// ---- Send Message Helper ----
async function sendMessage(phone, text) {
    if (!sock) {
        console.error('[Bot] Socket not initialized');
        return;
    }
    try {
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text });
        console.log(`[Bot] Message sent to ${phone}`);
    } catch (err) {
        console.error(`[Bot] Send error to ${phone}:`, err.message);
    }
}

// ---- Start Baileys Connection ----
async function startBot() {
    // Clean up old socket to prevent duplicate message handling
    if (sock) {
        try {
            sock.ev.removeAllListeners();
            sock.end(undefined);
        } catch {
            // Ignore cleanup errors
        }
        sock = null;
    }

    const { state, saveCreds } = await useRedisAuthState();

    // Fetch the latest WhatsApp Web version to avoid 405 protocol mismatch
    let version;
    try {
        const versionInfo = await fetchLatestBaileysVersion();
        version = versionInfo.version;
        console.log(`[Bot] Using WA Web version: ${version}`);
    } catch (err) {
        console.warn('[Bot] Could not fetch WA version, using built-in default');
    }

    const socketConfig = {
        auth: state,
        browser: Browsers.ubuntu('Chrome'),
        connectTimeoutMs: 60000,
        logger: require('pino')({ level: 'warn' }),
    };

    // Only add version if we successfully fetched it
    if (version) socketConfig.version = version;

    sock = makeWASocket(socketConfig);

    // ---- Connection Events ----
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR code received — send to admin panel
        if (qr) {
            console.log('[Bot] QR code generated');
            try {
                const dataUrl = await QRCode.toDataURL(qr, { width: 240 });
                io.emit('qr', dataUrl);
            } catch (err) {
                console.error('[Bot] QR generation error:', err.message);
            }
        }

        // Connected
        if (connection === 'open') {
            isConnected = true;
            reconnectAttempts = 0;
            console.log('[Bot] ✅ WhatsApp connected!');
            io.emit('connected');
        }

        // Disconnected
        if (connection === 'close') {
            isConnected = false;
            io.emit('disconnected');

            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = DisconnectReason;
            const errorMsg = lastDisconnect?.error?.message || String(lastDisconnect?.error);
            console.log(`[Bot] ⚠️ Disconnected due to: ${errorMsg} (Status: ${statusCode})`);

            if (statusCode === reason.loggedOut) {
                console.log('[Bot] ❌ Logged out — clearing session');
                await clearAuthState();
                reconnectAttempts = 0;
                setTimeout(startBot, 3000);
            } else if (statusCode === 440) {
                // 440 = connectionReplaced — another instance took over, DO NOT reconnect
                console.log('[Bot] ⏸️ Connection replaced by another instance. Waiting 30s before retry...');
                setTimeout(startBot, 30000);
            } else if (statusCode === 515) {
                // 515 = restart required
                console.log('[Bot] 🔄 Restart required. Waiting 5s...');
                setTimeout(startBot, 5000);
            } else {
                reconnectAttempts++;
                if (reconnectAttempts <= MAX_RECONNECT) {
                    const delay = Math.min(reconnectAttempts * 3000, 30000);
                    console.log(`[Bot] 🔄 Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT}) in ${delay / 1000}s...`);
                    setTimeout(startBot, delay);
                } else {
                    console.error('[Bot] ❌ Max reconnect attempts reached. Will retry in 5 minutes.');
                    setTimeout(() => {
                        reconnectAttempts = 0;
                        startBot();
                    }, 5 * 60 * 1000);
                }
            }
        }
    });

    // ---- Save Credentials ----
    sock.ev.on('creds.update', saveCreds);

    // ---- Incoming Messages ----
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        if (type !== 'notify') return;
        // If bot is paused by admin, ignore all incoming messages
        if (isBotPaused) return;

        for (const msg of msgs) {
            if (!msg.message) continue;
            if (msg.key.fromMe) continue;
            if (msg.key.remoteJid === 'status@broadcast') continue;
            if (msg.key.remoteJid?.endsWith('@g.us')) continue;

            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                '';

            if (!text.trim()) continue;

            // ---- Deduplication: atomic SET NX — only one instance processes each message ----
            const msgId = msg.key.id;
            const dedupKey = `processed:${msgId}`;
            const { redisSetNX } = require('./services/redis');
            const isFirstProcessor = await redisSetNX(dedupKey, '1', 60);
            if (!isFirstProcessor) {
                console.log(`[Bot] ⏭️ Skipping duplicate message: ${msgId}`);
                continue;
            }

            // Extract real phone number — Baileys v6 uses @lid format for some accounts.
            let phone = msg.key.remoteJid;
            if (msg.key.senderPn) {
                phone = msg.key.senderPn.replace('@s.whatsapp.net', '').replace('@c.us', '');
            } else if (msg.key.participant) {
                phone = msg.key.participant.replace('@s.whatsapp.net', '').replace('@c.us', '');
            } else if (phone.includes('@s.whatsapp.net')) {
                phone = phone.replace('@s.whatsapp.net', '');
            } else if (phone.includes('@lid')) {
                phone = phone.replace('@lid', '');
                console.warn(`[Bot] ⚠️ Could not resolve real phone for ${msg.key.remoteJid}`);
            }

            console.log(`[Bot] 📩 Message from ${phone}: ${text.substring(0, 50)}`);
            messagesProcessed++;
            io.emit('stats', { messagesProcessed });

            // ---- 3-second message buffer — collect rapid-fire messages per phone ----
            bufferMessage(phone, text);
        }
    });
}

// ---- Per-phone Message Buffer ----
// Collects messages from the same phone within BUFFER_MS and joins them before processing.
const BUFFER_MS = 3000;
const messageBuffers = new Map(); // phone → { parts: string[], timer: Timeout }

function bufferMessage(phone, text) {
    if (messageBuffers.has(phone)) {
        // Extend existing buffer
        const buf = messageBuffers.get(phone);
        buf.parts.push(text);
        clearTimeout(buf.timer);
        buf.timer = setTimeout(() => flushBuffer(phone), BUFFER_MS);
    } else {
        // Start new buffer for this phone
        const timer = setTimeout(() => flushBuffer(phone), BUFFER_MS);
        messageBuffers.set(phone, { parts: [text], timer });
    }
}

async function flushBuffer(phone) {
    const buf = messageBuffers.get(phone);
    if (!buf) return;
    messageBuffers.delete(phone);

    const combined = buf.parts.join(' ');
    console.log(`[Bot] 🔀 Buffer flushed for ${phone}: "${combined.substring(0, 80)}"`);

    try {
        await handleMessage(sendMessage, phone, combined);
        io.emit('new_customer');
    } catch (err) {
        console.error(`[Bot] Flow error for ${phone}:`, err.message);
    }
}

// ---- Self-Ping (Keep Alive for Render.com) ----
function startSelfPing() {
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.PORT}`;
    setInterval(async () => {
        try {
            await fetch(`${url}/health`);
            console.log('[Ping] Self-ping OK');
        } catch {
            // Ignore
        }
    }, 14 * 60 * 1000);
}

// ---- Crash Prevention ----
process.on('uncaughtException', (err) => {
    console.error('[Process] Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (err) => {
    console.error('[Process] Unhandled Rejection:', err?.message || err);
});

// ---- Start Server ----
server.listen(config.PORT, () => {
    console.log(`\n🚀 Server running on port ${config.PORT}`);
    console.log(`📊 Admin panel: http://localhost:${config.PORT}\n`);
    startBot();
    startSelfPing();
});
