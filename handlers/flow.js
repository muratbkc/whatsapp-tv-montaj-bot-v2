// Main conversation flow engine — dynamic step system
const { checkFaq } = require('./faq');

const { getState, setState, deleteState } = require('../services/redis');
const { appendCustomer } = require('../services/sheets');
const {
    getFlowSteps,
    getConfirmationMessage,
} = require('../services/settings');

/**
 * Handle an incoming message from a customer.
 */
async function handleMessage(sendMsg, phone, message) {
    // --- Step 1: FAQ / cancel check ---
    const { response: faqResponse, isCancel } = checkFaq(message);

    if (isCancel) {
        await deleteState(phone);
        await sendMsg(phone, '❌ Talebiniz iptal edildi. Tekrar yardımcı olmamızı isterseniz merhaba yazabilirsiniz. 👋');
        return;
    }

    // --- Step 2: Get state ---
    const state = await getState(phone);

    // --- Step 2.5: "yeni talep" keyword — always starts a new flow ---
    const lower = message.toLowerCase().trim();
    if (lower.includes('yeni talep') || lower.includes('yeni montaj')) {
        await deleteState(phone);
        const steps = await getFlowSteps();
        const firstActive = steps.find((s) => s.isActive);
        if (firstActive) {
            await setState(phone, { step: firstActive.id, answers: {} });
            await sendMsg(phone, firstActive.message);
        }
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
        if (state) await resendStepQuestion(sendMsg, phone, state);
        return;
    }

    // --- Step 5: New user ---
    if (!state) {
        const steps = await getFlowSteps();
        const firstActive = steps.find((s) => s.isActive);
        if (firstActive) {
            await setState(phone, { step: firstActive.id, answers: {} });
            await sendMsg(phone, firstActive.message);
        }
        return;
    }

    // --- Step 7: Dynamic flow processing ---
    const steps = await getFlowSteps();
    const activeSteps = steps.filter((s) => s.isActive);
    const currentIndex = activeSteps.findIndex((s) => s.id === state.step);

    if (currentIndex === -1) {
        // Unknown step — reset
        await deleteState(phone);
        await sendMsg(phone, '🙏 Üzgünüm, bir hata oluştu. Lütfen tekrar "merhaba" yazın.');
        return;
    }

    // Save the answer for current step
    const currentStep = activeSteps[currentIndex];
    const answers = state.answers || {};
    answers[currentStep.redisKey] = message.trim();

    const nextStep = activeSteps[currentIndex + 1];

    if (nextStep) {
        // Move to next step
        const nextMsg = nextStep.message.replace('{{name}}', answers.name || '');
        await setState(phone, { step: nextStep.id, answers });
        await sendMsg(phone, nextMsg);
    } else {
        // All steps done — save and confirm
        const confirmationTemplate = await getConfirmationMessage();

        // Build summary lines from answers
        const summaryLines = activeSteps.map((s) => {
            const val = answers[s.redisKey] || '-';
            return `${s.label}: ${val}`;
        });

        const confirmationMsg = confirmationTemplate.replace('{{summary}}', summaryLines.join('\n'));

        // Prepare data object for sheets using dynamic column names
        const data = { answers, phone };
        await appendCustomer(data, activeSteps);
        await sendMsg(phone, confirmationMsg);
        await setState(phone, { step: 'COMPLETED' });
    }
}

async function resendStepQuestion(sendMsg, phone, state) {
    const steps = await getFlowSteps();
    const currentStep = steps.find((s) => s.id === state.step);
    if (currentStep) {
        const msg = currentStep.message.replace('{{name}}', state.answers?.name || '');
        await sendMsg(phone, msg);
    }
}

module.exports = { handleMessage };
