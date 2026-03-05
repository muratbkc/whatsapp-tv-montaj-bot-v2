# WhatsApp Destek Botu - Teslim Dokumani

Bu dokuman, projeyi teslim alan kisinin sistemi calistirmasi, panelden ayarlari yonetmesi ve Google Sheets baglantisini degistirmesi icin hazirlanmistir.

## 1) Proje Ozeti

Bu uygulama:
- WhatsApp mesajlarini dinler.
- Musteri ile tanimli soru adimlariyla konusur.
- Toplanan verileri Google Sheets'e kaydeder.
- Yonetim panelinden talepleri, bot durumunu ve ayarlari yonetmenizi saglar.

Ana klasor: `whatsapp-bot-baileys`

## 2) Gereksinimler

- Node.js 18+
- NPM
- Upstash Redis bilgileri
- Google Service Account JSON bilgisi
- Google Sheets dosyasi (duzenleme yetkisi service account e-mail'ine verilmeli)

## 3) Ilk Kurulum

1. Klasore girin:
   - `cd whatsapp-bot-baileys`
2. Bagimliliklari kurun:
   - `npm install`
3. `.env` dosyasini olusturun (ornek `.env.example`):
   - `REDIS_URL`
   - `REDIS_TOKEN`
   - `PANEL_PASSWORD`
   - `PORT`
   - `SHEETS_ID` (ilk acilis fallback degeri)
   - `GOOGLE_CREDS_JSON` (ilk acilis fallback degeri)
4. Uygulamayi baslatin:
   - `npm start`

## 4) Panel Girisi

- Tarayicidan: `http://localhost:PORT`
- Sifre: `.env` icindeki `PANEL_PASSWORD`

Panelde 2 ana sekme vardir:
- `Talepler`: son kayitlar, durum guncelleme
- `Ayarlar`: bot ayarlari, konusma adimlari, Google Sheets baglantisi

## 5) Google Sheets ID ve JSON'u Arayuzden Degistirme

Bu surumle birlikte, Sheets bilgileri panelden degistirilebilir.

Adimlar:
1. `Ayarlar` sekmesine girin.
2. `Google Sheets Entegrasyonu` kartini bulun.
3. Hedef Google Sheets dosyanizi yetkilendirmek icin **Service Account e-postaniza ("client_email" adresiniz) Editör (Duzenleyici) yetkisiyle dosyanizi paylasin.**
4. `Google Sheets ID` alanina hedef tablo ID'sini yazin.
5. `GOOGLE_CREDS_JSON` alanina service account JSON metnini yapistirin.
6. `Entegrasyonu Kaydet` butonuna basin.

Notlar:
- JSON gecersizse veya dosya erisimi (Paylas) yapilmamissa, sistem kaydetmez ve hata verir.
- Kaydedilen degerler Redis'te tutulur; uygulama yeniden baslasa da korunur.
- Eger bos, yepyeni bir Sheets tablosu baglarsaniz; sistem otomatik olarak ilk satira basliklari (Tarih, Isim, vs.) ve Durum sutunu icin acilir liste ayarlarini yapilandiracaktir.

## 6) Konusma Akisini Duzenleme

`Ayarlar > Konusma Adimlari` bolumunden:
- Adim ekleme/silme
- Soru metinlerini duzenleme
- Her adimi aktif/pasif yapma
- Her adim icin Sheets sutun adini belirleme

Kayit alinirken sutunlar otomatik olusturulur (eksik basliklar eklenir).


## 8) Operasyonel Kullanim

- Botu gecici durdurmak/baslatmak icin sag ustteki buton kullanilir.
- `Talepler` tablosunda durum alanini (`Bekliyor`, `Tamamlandi`, `Iptal`) degistirebilirsiniz.

## 9) Siklikla Karsilasilan Sorunlar

1. Sheets'e kayit gitmiyor:
- Sheets ID dogru mu?
- JSON dogru mu?
- Service account e-mail'i ilgili Sheet'e editor olarak eklendi mi?

2. Panel aciliyor ama veri yok:
- Redis baglantisi (`REDIS_URL`, `REDIS_TOKEN`) dogru mu?

3. WhatsApp baglanmiyor:
- Panelde QR kodu tekrar okutun.
- Ayni anda baska cihazda ayni session acik mi kontrol edin.

## 10) Guvenlik Notlari

- `PANEL_PASSWORD` guclu olmali.
- `GOOGLE_CREDS_JSON` gizli bilgidir; sadece yetkili kisilerle paylasin.
- Mümkünse paneli ters proxy arkasinda ve IP kisitlamasiyla yayinlayin.

## 11) Teknik Not

Sheets entegrasyon ayarlari backend tarafinda su API'ler ile yonetilir:
- `GET /api/settings/sheets-config`
- `POST /api/settings/sheets-config`

Bu endpoint'ler panel sifresi (`x-password`) ile korunur.
