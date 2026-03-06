# Google Sheets Entegrasyon Rehberi (Sıfırdan Başlayanlar İçin)

TV Montaj Botunun topladığı müşteri bilgilerini Google Sheets'e (Excel) yazabilmesi için sisteme iki bilgi girmeniz gerekir:
1. **Google Sheets ID** (Tablonuzun kimliği)
2. **GOOGLE_CREDS_JSON** (Google'ın botumuza verdiği dijital kimlik/izin belgesi)

Aşağıdaki adımları sırayla takip ederek bu bilgileri kolayca alabilirsiniz.

---

## BÖLÜM 1: Google Sheets ID Nasıl Alınır?

Bu işlem çok basittir. Sadece boş bir Google E-Tablo oluşturmanız yeterlidir.

1. Tarayıcınızdan [Google Sheets](https://docs.google.com/spreadsheets)'e gidin ve yeni/boş bir tablo oluşturun.
2. Tablonun içine **hiçbir şey** yazmanıza gerek yok, bot başlıkları kendi atacaktır.
3. Ekranın en üstündeki **Adres Çubuğuna (URL)** bakın. Şuna benzeyecektir:
   `https://docs.google.com/spreadsheets/d/1BxiMVs0X_X...XYZ/edit#gid=0`
4. Buradaki `/d/` kelimesinden sonra başlayan ve `/edit` kelimesine kadar olan karmaşık harf ve rakam dizisi sizin **Google Sheets ID**'nizdir.
   - ÖRNEK: `1BxiMVs0X_X...XYZ`
5. Bunu kopyalayın ve botun yönetim panelindeki **Google Sheets ID** kutusuna yapıştırın. (Henüz Kaydet'e basmayın).

---

## BÖLÜM 2: GOOGLE_CREDS_JSON (Service Account) Nasıl Alınır?

Bu adım biraz daha teknik görünse de aslında "Botumuz adına sanal bir Google hesabı açmak" işlemidir.

### Adım 1: Google Cloud Projesi Oluşturma
1. [Google Cloud Console](https://console.cloud.google.com/)'a gidin. (Giriş yapmadıysanız Google hesabınızla giriş yapın).
2. Kayıt olurken şartları kabul edin. (Kredi kartı vs. istemez, ücretsizdir).
3. Üst menüde "Bir Proje Seçin" (Select a project) yazan yere tıklayın ve açılan pencerede sağ üstteki **Yeni Proje (New Project)** butonuna basın.
4. Proje adına örneğin `Whatsapp-Bot` yazın ve **Oluştur (Create)** butonuna basın. *(Not: Buraya tamamen rastgele, istediğiniz herhangi bir ismi verebilirsiniz. Projemize özel olmak zorunda değildir.)*

### Adım 2: API İzinlerini Açma
Botun tablolara erişebilmesi için Sheets yetkisini açmamız lazım.
1. Sol üstteki ☰ menü ikonuna basıp **APIs & Services (API'ler ve Hizmetler)** -> **Library (Kütüphane)** sekmesine tıklayın.
2. Arama kutusuna `Google Sheets API` yazın, çıkan sonuca tıklayın ve mavi renkli **Etkinleştir (Enable)** butonuna basın.
3. Tekrar kütüphaneye dönün, arama kutusuna `Google Drive API` yazın ve onu da bulup **Etkinleştir (Enable)** yapın.

### Adım 3: Service Account (Sanal Bot Hesabı) Oluşturma
1. Sol menüden **APIs & Services (API'ler ve Hizmetler)** -> **Credentials (Kimlik Bilgileri)** sekmesine girin.
2. Üstten **+ KİMLİK BİLGİSİ OLUŞTUR (+ CREATE CREDENTIALS)** yazısına tıklayın.
3. Açılan listeden **Hizmet Hesabı (Service Account)** seçeneğine tıklayın.
4. Adına `bot-hesabi` yazın ve "Oluştur ve Devam Et" (Create and Continue) diyerek en alttaki Bitti (Done) butonuna basın. Başka bir rol seçmenize gerek yok. *(Not: Buraya da İngilizce karakterlerle istediğiniz herhangi bir isim veya lakap yazabilirsiniz, botun çalışmasını kesinlikle etkilemez.)*

### Adım 4: JSON Dosyasını İndirme
1. Sizi tekrar Kimlik Bilgileri listesine atacaktır. Ekranın alt kısmında "Hizmet Hesapları" listesinde az önce oluşturduğunuz `bot-hesabi@...` ile başlayan hesabı göreceksiniz. E-posta adresine benzeyen yazıya tıklayarak içine girin.
2. **ÖNEMLİ:** Buradaki `bot-hesabi@projenizin-adi.iam.gserviceaccount.com` şeklindeki e-posta adresini kopyalayın. Müşteri listenizi tutacağınız Google tablomuza bu hesabı ekleyeceğiz.
3. Yukarıdaki menüden **ANAHTARLAR (KEYS)** sekmesine tıklayın.
4. **Anahtar Ekle (Add Key)** -> **Yeni anahtar oluştur (Create new key)** butonuna basın.
5. Tip olarak **JSON** seçili kalsın ve **Oluştur (Create)** butonuna basın.
6. Bilgisayarınıza bir `.json` dosyası inecektir.

### Adım 5: JSON'u Kopyalama
1. Bilgisayarınıza inen dosyaya sağ tıklayın ve **Birlikte Aç -> Not Defteri (Notepad)** diyerek açın.
2. Karşınıza süslü parantezlerle dolu şifreli bir metin çıkacak. O metnin **tamamını seçin** (CTRL+A) ve kopyalayın (CTRL+C).
3. Gidip yönetim panelindeki **GOOGLE_CREDS_JSON** kutusuna yapıştırın.

---

## BÖLÜM 3: Bot'a Yetki Verme (EN ÖNEMLİ ADIM)

Eğer botunuzun sizin tablonuza yazı yazmasına izin vermezseniz, bu bilgiler bir işe yaramaz. Tıpkı bir iş arkadaşınızla dosya paylaştığınız gibi, bot e-postasıyla da dosyayı paylaşmalısınız.

1. BÖLÜM 1'de oluşturduğunuz (ve adres çubuğundan ID'sini aldığınız) boş Google Sheets sayfasını açın.
2. Ekranın sağ üst köşesindeki yeşil renkli **Paylaş (Share)** butonuna basın.
3. Çıkan kutucuktaki kişi ekleme alanına, BÖLÜM 2 - Adım 4'te kopyaladığınız o tuhaf e-posta adresini (`bot-hesabi@xyz.iam.gserviceaccount.com`) yapıştırın.
4. Sağ taraftaki yetki kutusunun **Düzenleyen (Editor)** olduğundan kesinlikle emin olun!
5. **Gönder / Paylaş** butonuna basın.

## Bitti!
Artık yönetim panelinden **Entegrasyonu Kaydet** butonuna bastığınızda, sistem saniyeler içerisinde o boş tablonuza ulaşıp müşteri başlıklarınızı (Tarih, İsim, vs.) otomatik olarak ekleyecektir. Yeni müşterileriniz sırayla bu tabloya akmaya devam edecektir.
