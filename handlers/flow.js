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

    if (faqResponse) {
        await sendMsg(phone, faqResponse);
        // Re-ask current step question if user is in a flow
        const state = await getState(phone);
        if (!state) {
            await setState(phone, { step: 'ASK_NAME' });
            await sendMsg(phone, messages.WELCOME);
        } else {
            await resendStepQuestion(sendMsg, phone, state);
        }
        return;
    }

    // --- Step 2: Get state ---
    const state = await getState(phone);

    // --- Step 3: New user ---
    if (!state) {
        await setState(phone, { step: 'ASK_NAME' });
        await sendMsg(phone, messages.WELCOME);
        return;
    }

    // --- Step 4: Process answer based on step ---
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
        // Clear state
        await deleteState(phone);
    } else {
        // Unknown step — reset
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
