// Main conversation flow engine — dynamic step system
const { checkFaq } = require('./faq');

const { getState, setState, deleteState } = require('../services/redis');
const { appendCustomer } = require('../services/sheets');
const {
    getFlowSteps,
    getFaultFlowSteps,
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
    let state = await getState(phone);

    // --- Step 2.5: "yeni talep" keyword — always starts a new flow ---
    const lower = message.toLowerCase().trim();
    const resets = ['yeni talep', 'yeni montaj', 'yeni ariza', 'yeni arıza', 'bastan basla', 'baştan başla'];
    if (resets.some(r => lower.includes(r))) {
        await deleteState(phone);
        state = null; // force menu restart
    }

    // --- Step 3: Completed cooldown ---
    if (state && state.step === 'COMPLETED') {
        if (faqResponse) {
            await sendMsg(phone, faqResponse);
            return;
        }
        await sendMsg(phone, '✅ Talebiniz alınmıştır. Yeni bir talep için *"yeni talep"* yazabilirsiniz.');
        return;
    }

    // --- Step 4: FAQ response ---
    if (faqResponse && state && state.step !== 'AWAITING_CHOICE') {
        await sendMsg(phone, faqResponse);
        await resendStepQuestion(sendMsg, phone, state);
        return;
    }

    // --- Step 5: New user -> Show Menu ---
    if (!state) {
        await setState(phone, { step: 'AWAITING_CHOICE', answers: {} });
        await sendMsg(phone, 'Hoşgeldiniz! Sizi asistan menüsüne yönlendiriyorum.\nLütfen yapmak istediğiniz işlemi seçin:\n\n1️⃣ Yeni Montaj Talebi\n2️⃣ Arıza Kaydı');
        return;
    }

    // --- Step 6: Handle Menu Choice ---
    if (state.step === 'AWAITING_CHOICE') {
        const isInstall = lower === '1' || lower.includes('montaj') || lower.includes('bağlamak') || lower.includes('kurulum') || lower.includes('yeni tv') || lower.includes('tv kur');
        const isFault = lower === '2' || lower.includes('arıza') || lower.includes('ariza') || lower.includes('bozuk') || lower.includes('çalışmıyor') || lower.includes('kırık') || lower.includes('sorun') || lower.includes('açılmıyor');

        let flowType = null;
        let selectedSteps = null;

        if (isInstall) {
            flowType = 'install';
            selectedSteps = await getFlowSteps();
        } else if (isFault) {
            flowType = 'fault';
            selectedSteps = await getFaultFlowSteps();
        } else {
            // Fallback (Resilient Router ensures unexpected text repeats menu)
            if (faqResponse) {
                await sendMsg(phone, faqResponse);
            }
            await sendMsg(phone, 'Tam anlayamadım. Lütfen Yeni Montaj Talebi için "1" veya "montaj", Arıza Kaydı için "2" veya "arıza" yazın.');
            return;
        }

        const activeSteps = selectedSteps.filter((s) => s.isActive);
        if (activeSteps.length > 0) {
            const firstActive = activeSteps[0];
            await setState(phone, { step: firstActive.id, answers: {}, flowType });
            await sendMsg(phone, firstActive.message);
        } else {
            await sendMsg(phone, '⏳ Şu an için bu işleme ait aktif adım bulunmuyor.');
        }
        return;
    }

    // --- Step 7: Dynamic flow processing ---
    const flowType = state.flowType || 'install'; // backward compatibility
    const steps = flowType === 'fault' ? await getFaultFlowSteps() : await getFlowSteps();
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
        await setState(phone, { step: nextStep.id, answers, flowType });
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
        const data = { answers, phone, flowType };
        await appendCustomer(data, activeSteps);
        await sendMsg(phone, confirmationMsg);
        await setState(phone, { step: 'COMPLETED', flowType });
    }
}

async function resendStepQuestion(sendMsg, phone, state) {
    if (state.step === 'AWAITING_CHOICE') {
        await sendMsg(phone, 'Lütfen yapmak istediğiniz işlemi seçin:\n\n1️⃣ Yeni Montaj Talebi\n2️⃣ Arıza Kaydı');
        return;
    }
    const flowType = state.flowType || 'install';
    const steps = flowType === 'fault' ? await getFaultFlowSteps() : await getFlowSteps();
    const currentStep = steps.find((s) => s.id === state.step);
    if (currentStep) {
        const msg = currentStep.message.replace('{{name}}', state.answers?.name || '');
        await sendMsg(phone, msg);
    }
}

module.exports = { handleMessage };
