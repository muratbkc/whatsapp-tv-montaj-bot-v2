// All bot message constants

const WELCOME = `Hoşgeldiniz! 👋 TV montaj talebinizi almak için birkaç soru sormam gerekiyor.

İsim soyisminiz nedir?`;

const ASK_ADDRESS = (name) =>
    `Teşekkürler ${name} Bey/Hanım! 😊\n\nAçık adresiniz nedir? (İlçe, sokak ve bina/daire no)`;

const ASK_TV_SIZE = `Adresinizi aldım! 📍

TV'nizin ekran boyutu nedir?
(Bilmiyorsanız TV'nin arkasındaki etikette yazar. Örn: 43", 55", 65")`;

const ASK_MOUNT_TYPE = `Anladım! 👍

Son olarak: TV'yi *duvara* mı yoksa *sehpaya* mı kurulmasını istiyorsunuz?`;

const CONFIRMATION = ({ name, address, tv_size, mount_type }) =>
    `✅ Talebiniz başarıyla alındı!

━━━━━━━━━━━━━━━━━
📋 KAYIT ÖZETİ
━━━━━━━━━━━━━━━━━
👤 ${name}
📍 ${address}
📺 ${tv_size} | ${mount_type}
━━━━━━━━━━━━━━━━━

Ekibimiz en geç 2 saat içinde sizi arayarak randevu belirleyecek. 🔧

Başka bir sorunuz var mı?`;

const UNKNOWN = 'Üzgünüm, anlamadım. 🙏 Lütfen tekrar yazar mısınız?';

const CANCELLED =
    'Talebiniz iptal edildi. Tekrar yardımcı olmamızı isterseniz merhaba yazabilirsiniz. 👋';
module.exports = {
    WELCOME,
    ASK_ADDRESS,
    ASK_TV_SIZE,
    ASK_MOUNT_TYPE,
    CONFIRMATION,
    UNKNOWN,
    CANCELLED,
};
