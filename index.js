// ============================================================
// WhatsApp TV Montaj Bot — Baileys + Express + Admin Panel
// ============================================================

const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const express = require('express');
const http = require('http');
const { Server: SocketIO } = require('socket.io');
const path = require('path');

const config = require('./config');
const { useRedisAuthState, clearAuthState } = require('./auth/redis-auth');
const { handleMessage } = require('./handlers/flow');
const { getRecentCustomers } = require('./services/sheets');

// ---- Express + Socket.io Setup ----
const app = express();
const server = http.createServer(app);
const io = new SocketIO(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Global State ----
let sock = null;
let isConnected = false;
let messagesProcessed = 0;
let reconnectAttempts = 0;
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

// Get bot status
app.get('/api/status', (req, res) => {
    res.json({ connected: isConnected, messagesProcessed });
});

// ---- Socket.io Auth Middleware ----
io.use((socket, next) => {
    if (socket.handshake.auth?.password === config.PANEL_PASSWORD) {
        return next();
    }
    return next(new Error('Unauthorized'));
});

// ---- Send Message Helper ----
async function sendMessage(phone, text) {
    if (!sock) {
        console.error('[Bot] Socket not initialized');
        return;
    }
    try {
        // Baileys expects JID format: phone@s.whatsapp.net
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text });
        console.log(`[Bot] Message sent to ${phone}`);
    } catch (err) {
        console.error(`[Bot] Send error to ${phone}:`, err.message);
    }
}

// ---- Start Baileys Connection ----
async function startBot() {
    const { state, saveCreds } = await useRedisAuthState();

    sock = makeWASocket({
        auth: state,
        browser: ['TV Montaj Bot', 'Chrome', '22.0'],
        // Reduce logging noise
        logger: require('pino')({ level: 'silent' }),
    });

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

            if (statusCode === reason.loggedOut) {
                console.log('[Bot] ❌ Logged out — clearing session');
                await clearAuthState();
                // Restart to show new QR
                reconnectAttempts = 0;
                setTimeout(startBot, 3000);
            } else {
                // Auto-reconnect for all other disconnect reasons
                reconnectAttempts++;
                if (reconnectAttempts <= MAX_RECONNECT) {
                    const delay = Math.min(reconnectAttempts * 3000, 30000);
                    console.log(`[Bot] 🔄 Reconnecting (attempt ${reconnectAttempts}/${MAX_RECONNECT}) in ${delay / 1000}s...`);
                    setTimeout(startBot, delay);
                } else {
                    console.error('[Bot] ❌ Max reconnect attempts reached. Manual restart required.');
                    // Reset counter after 5 minutes and try again
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

        for (const msg of msgs) {
            // Skip non-text, non-personal, own messages, and status updates
            if (!msg.message) continue;
            if (msg.key.fromMe) continue;
            if (msg.key.remoteJid === 'status@broadcast') continue;
            if (msg.key.remoteJid?.endsWith('@g.us')) continue; // Skip group messages

            // Extract text from various message types
            const text =
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                '';

            if (!text.trim()) continue;

            // Extract phone number from JID
            const phone = msg.key.remoteJid.replace('@s.whatsapp.net', '');

            console.log(`[Bot] 📩 Message from ${phone}: ${text.substring(0, 50)}`);
            messagesProcessed++;
            io.emit('stats', { messagesProcessed });

            try {
                await handleMessage(sendMessage, phone, text);
                // Notify admin panel about possible new customer
                io.emit('new_customer');
            } catch (err) {
                console.error(`[Bot] Flow error for ${phone}:`, err.message);
            }
        }
    });
}

// ---- Self-Ping (Keep Alive for Render.com) ----
function startSelfPing() {
    const url = process.env.RENDER_EXTERNAL_URL || `http://localhost:${config.PORT}`;
    setInterval(async () => {
        try {
            await fetch(`${url}/health`);
            console.log('[Ping] Self-ping OK');
        } catch {
            // Ignore — internal self-ping may fail on cold start
        }
    }, 14 * 60 * 1000); // Every 14 minutes
}

// ---- Start Server ----
server.listen(config.PORT, () => {
    console.log(`\n🚀 Server running on port ${config.PORT}`);
    console.log(`📊 Admin panel: http://localhost:${config.PORT}\n`);
    startBot();
    startSelfPing();
});
