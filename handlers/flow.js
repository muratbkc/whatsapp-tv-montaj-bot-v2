// Main conversation flow engine
const { checkFaq } = require('./faq');
const { notifyOwner } = require('./notifier');
const { getState, setState, deleteState } = require('../services/redis');
const { appendCustomer } = require('../services/sheets');
const messages = require('../templates/messages');

/**
 * Handle an incoming message from a customer.
 * @param {Function} sendMsg - function(phone, text) to send a WhatsApp message
 * @param {string} phone - sender phone number (e.g. "905XXXXXXXXX")
 * @param {string} message - the message body text
 */
async function handleMessage(sendMsg, phone, message) {
    // --- Step 1: FAQ / cancel check ---
    const { response: faqResponse, isCancel } = checkFaq(message);

    if (isCancel) {
        await deleteState(phone);
        await sendMsg(phone, messages.CANCELLED);
        return;
    }

    // --- Step 2: Get state ---
    const state = await getState(phone);

    // --- Step 2.5: "yeni talep" keyword — always starts a new flow ---
    const lower = message.toLowerCase().trim();
    if (lower.includes('yeni talep') || lower.includes('yeni montaj')) {
        await setState(phone, { step: 'ASK_NAME' });
        await sendMsg(phone, messages.WELCOME);
        return;
    }

    // --- Step 3: Completed cooldown ---
    if (state && state.step === 'COMPLETED') {
        if (faqResponse) {
            await sendMsg(phone, faqResponse);
            return;
        }
        await sendMsg(phone, '✅ Talebiniz alınmıştır. Yeni bir montaj talebi için *"yeni talep"* yazabilirsiniz.');
        return;
    }

    // --- Step 4: FAQ response ---
    if (faqResponse) {
        await sendMsg(phone, faqResponse);
        if (state) {
            await resendStepQuestion(sendMsg, phone, state);
        }
        return;
    }

    // --- Step 5: New user ---
    if (!state) {
        await setState(phone, { step: 'ASK_NAME' });
        await sendMsg(phone, messages.WELCOME);
        return;
    }

    // --- Step 6: Process answer based on step ---
    const { step } = state;

    if (step === 'ASK_NAME') {
        state.name = message.trim();
        state.step = 'ASK_ADDRESS';
        await setState(phone, state);
        await sendMsg(phone, messages.ASK_ADDRESS(state.name));
    } else if (step === 'ASK_ADDRESS') {
        state.address = message.trim();
        state.step = 'ASK_TV_SIZE';
        await setState(phone, state);
        await sendMsg(phone, messages.ASK_TV_SIZE);
    } else if (step === 'ASK_TV_SIZE') {
        state.tv_size = message.trim();
        state.step = 'ASK_MOUNT_TYPE';
        await setState(phone, state);
        await sendMsg(phone, messages.ASK_MOUNT_TYPE);
    } else if (step === 'ASK_MOUNT_TYPE') {
        const mount_type = message.trim();
        const data = {
            name: state.name || '',
            phone,
            address: state.address || '',
            tv_size: state.tv_size || '',
            mount_type,
        };

        // Save to Google Sheets
        await appendCustomer(data);
        // Notify business owner
        await notifyOwner(sendMsg, data);
        // Send confirmation to customer
        await sendMsg(phone, messages.CONFIRMATION(data));
        // Set state to COMPLETED (not delete — prevents immediate restart)
        await setState(phone, { step: 'COMPLETED' });
    } else {
        // Unknown step — reset
        await deleteState(phone);
        await sendMsg(phone, messages.UNKNOWN);
    }
}

async function resendStepQuestion(sendMsg, phone, state) {
    const { step } = state;
    if (step === 'ASK_NAME') {
        await sendMsg(phone, messages.WELCOME);
    } else if (step === 'ASK_ADDRESS') {
        await sendMsg(phone, messages.ASK_ADDRESS(state.name || ''));
    } else if (step === 'ASK_TV_SIZE') {
        await sendMsg(phone, messages.ASK_TV_SIZE);
    } else if (step === 'ASK_MOUNT_TYPE') {
        await sendMsg(phone, messages.ASK_MOUNT_TYPE);
    }
}

module.exports = { handleMessage };
