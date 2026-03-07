// FAQ keyword matching module
const messages = require('../templates/messages');

function normalize(text) {
    return text
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/İ/g, 'i')
        .replace(/Ğ/g, 'g')
        .replace(/Ü/g, 'u')
        .replace(/Ş/g, 's')
        .replace(/Ö/g, 'o')
        .replace(/Ç/g, 'c')
        .toLowerCase();
}

const FAQ_KEYWORDS = {
    price: {
        keywords: ['fiyat', 'ucret', 'kac para', 'ne kadar', 'kaca', 'ücret', 'kaç para'],
        response: messages.FAQ_PRICE,
    },
    area: {
        keywords: ['bolge', 'nereye', 'geliyor musunuz', 'hizmet', 'bölge', 'semt'],
        response: messages.FAQ_AREA,
    },
    duration: {
        keywords: ['kac gun', 'ne zaman gelir', 'sure', 'süre', 'kaç gün', 'zaman'],
        response: messages.FAQ_DURATION,
    },
    cancel: {
        keywords: ['iptal', 'vazgectim', 'dur', 'hayir', 'hayır', 'istemiyorum'],
        response: null,
    },
};

/**
 * Check if the incoming message matches any FAQ keyword.
 * @returns {{ response: string|null, isCancel: boolean }}
 */
function checkFaq(message) {
    const normalized = normalize(message);

    for (const [groupKey, group] of Object.entries(FAQ_KEYWORDS)) {
        for (const keyword of group.keywords) {
            if (normalized.includes(normalize(keyword))) {
                return {
                    response: group.response,
                    isCancel: groupKey === 'cancel',
                };
            }
        }
    }

    return { response: null, isCancel: false };
}

module.exports = { checkFaq };
