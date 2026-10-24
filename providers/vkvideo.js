// ============================================================
//  vkvideo v1.1.0 — Nuvio scraper (vkvideo.ru, kullanıcı / kanal / topluluk yüklemeleri)
//  Akış: TMDB bilgisi -> VK Video araması (sayfalı) + arama motorları (Google / Yandex / Bing ...)
//        + kanal / topluluk video listeleri -> aday eleme/puanlama (okru / mailru ile aynı)
//        -> video bağlantıları (mp4 / HLS / DASH)
//  Sadece TÜRKÇE SES (TR / TR Dublaj / Türkçe Dublaj / tr / TR Dual) akışları gösterilir.
// ============================================================

var AYAR = {
  SITE: 'https://vkvideo.ru',
  API: 'https://api.vkvideo.ru/method',
  LOGIN: 'https://login.vk.ru/?act=get_anonym_token',
  V: '5.289',
  CLIENT_ID: '52461373',
  // DevTools -> Ağ -> "?act=get_anonym_token" isteği -> Yük (Payload). VkVideo.kt'deki CLIENT_SECRET ve DEVICE_ID ile AYNI değerleri yaz.
  CLIENT_SECRET: '',
  DEVICE_ID: '',
  EKLENTI_ADI: 'vkvideo',   // manifest adıyla AYNI: akış kartında eklenti adı hep görünsün
  // true iken akış çıkmazsa neden çıkmadığını yazan "DEBUG" satırları görünür. Her şey çalışınca false yap.
  DEBUG_MODU: false,
  MIN_SURE: 1200,       // sn: bundan kısa videolar (fragman/klip/kesit) hariç; süre uyumu ARANMAZ. 0 yaparsan hiç eleme olmaz
  MAX_ADAY: 12,         // en fazla kaç kesin Türkçe aday video için kaynak çekilsin
  MAX_BELIRSIZ: 6,      // dili belli olmayan (etiketsiz) en fazla kaç aday
  BELIRSIZ_GOSTER: true,  // dili doğrulanamayan adaylar "Dil ?" etiketiyle en sona eklensin
  MAX_SORGU: 12,        // VK Video'da en fazla kaç arama yapılsın (öncelik sırasıyla: "ad Türkçe Dublaj", "ad TR Dublaj", ...)
  SORGU_SAYFA: 3,       // her aramada sitedeki gibi aşağı indikçe en fazla kaç sayfa (sayfa başı ~30 video) okunsun
  ONEKLER: [],
  DOGRULA: true,        // bağlantı gerçekten açılıyor mu denenir; oynatıcıya hangi başlıkların (UA/Referer/Origin) kabul edildiği verilir, ölü mp4'ler sona atılır
  SURE_PARMAK_IZ: true, // hiçbir aday adla eşleşmediyse: süresi TMDB süresiyle ±%1.2 tutan, Türkçe dublaj etiketli TEK video varsa o eklenir ("TR Süre")
  // Arama motorları (Google / Yandex / Yandex Video / Bing / DuckDuckGo ...): "rambo tr vkvideo.ru" tarzı aramalardan VK video numaraları toplanır
  ARAMA_MOTORU: true,
  MOTOR_SORGU: 10,      // arama motorlarına en fazla kaç sorgu gitsin
  MOTOR_SURE: 7500,     // ms: motor aşamasının üst sınırı
  MOTOR_ADAY: 20,       // arama motorundan gelen en fazla kaç video doğrulansın
  // Kanallar / topluluklar: videolarının listesi de taranır.
  KANAL_ARA: true,      // arama sonuçlarında çıkan film/dublaj adlı kanallar ve Türkçe dublaj bulunan kanallar otomatik taransın
  MAX_KANAL: 8,         // otomatik taranacak en fazla kanal
  KANAL_SAYFA: 5,       // kanal başına en fazla kaç sayfa (sayfa başı 100 video)
  KANAL_ADI: 'film|dublaj|izle|sinema|movie|cinema|yerli|turk',   // kanal adında bunlardan biri geçerse otomatik taranır
  // Elle kanal / topluluk listesi (her aramada taranır, bu kanalların videoları Türkçe kabul edilir).
  // Biçim: 'club123456' | 'https://vk.com/club123456' | '-123456' | '123456' (hepsi topluluk), kişisel hesap: 'id123456'
  KANALLAR: [],
  // GARANTİ LİSTESİ: { adlar: ['Film Adı'], yil: 2000, dosya: 'sitedeki tam başlık', id: '-123456_789' }
  // id (VK video numarası: sahip_numara) verilen film, başlık/yıl/süre bakılmadan listeye girer.
  MANUEL: [],
  // ENGEL LİSTESİ: dosya adı filmle uyuşuyor ama içinde BAŞKA film çıkan yüklemeler: { adlar: [...], yil: 2000, dosya: 'tam.baslik' }
  ENGEL: [],
  PARALEL: 6,           // aynı anda en fazla kaç arama/liste isteği
  ARAMA_SURESI: 8000,   // ms: arama aşaması üst sınırı
  KANAL_SURESI: 4000,   // ms: otomatik kanal taraması üst sınırı
  KAYNAK_SURESI: 7000,  // ms: video bağlantılarının çekilmesi üst sınırı
  GENEL_SURE: 32000     // ms: dolunca o ana kadar bulunan akışlar VERİLİR (boş dönmez)
};

// Türkçe adı TMDB'de görünmeyen / farklı yazılan filmler: orijinal ad (harf-rakam, küçük) -> Türkçe adlar
var TR_ALIAS = {
  'nationaltreasure': ['Harbi Define'],
  'nationaltreasurebookofsecrets': ['Harbi Define 2'],
  'thebutterflyeffect': ['Kelebek Etkisi'],
  'thebutterflyeffect2': ['Kelebek Etkisi 2'],
  'thebutterflyeffect3revelations': ['Kelebek Etkisi 3'],
  'themummy': ['Mumya'],
  'themummyreturns': ['Mumya Geri Dönüyor', 'Mumya 2'],
  'themummytombofthedragonemperor': ['Mumya 3', 'Mumya Ejderha İmparatorunun Mezarı'],
  'diehard': ['Zor Ölüm'],
  'diehard2': ['Zor Ölüm 2'],
  'diehardwithavengeance': ['Zor Ölüm 3'],
  'livefreeordiehard': ['Zor Ölüm 4', 'Zor Ölüm 4.0'],
  'agooddaytodiehard': ['Zor Ölüm 5'],
  'insidious': ['Ruhlar Bölgesi'],
  'insidiouschapter2': ['Ruhlar Bölgesi Bölüm 2', 'Ruhlar Bölgesi 2'],
  'insidiouschapter3': ['Ruhlar Bölgesi Bölüm 3', 'Ruhlar Bölgesi 3'],
  'insidiousthelastkey': ['Ruhlar Bölgesi Son Anahtar', 'Ruhlar Bölgesi 4'],
  'insidioustheredddoor': ['Ruhlar Bölgesi Kırmızı Kapı', 'Ruhlar Bölgesi 5'],
  'insidiousthereddoor': ['Ruhlar Bölgesi Kırmızı Kapı', 'Ruhlar Bölgesi 5']
};

// Ek Türkçe adlar: [orijinal/İngilizce ad, [Türkçe adlar...]]. Yükleyenler hem resmi adı hem "yabancı + Türkçe karışık" adı kullanır.
var TR_ALIAS_EK = [
  ['The Terminator', ['Terminatör', 'Terminator']],
  ['Terminator 2: Judgment Day', ['Terminatör 2: Mahşer Günü', 'Terminatör 2: Kıyamet Günü', 'Terminator 2 Kıyamet Günü', 'Terminatör 2']],
  ['Terminator 3: Rise of the Machines', ['Terminatör 3: Makinelerin Yükselişi', 'Terminator 3 Makinelerin Yükselişi', 'Terminatör 3']],
  ['Terminator Salvation', ['Terminatör Kurtuluş', 'Terminator Kurtuluş', 'Terminatör 4']],
  ['Terminator Genisys', ['Terminatör Genisys', 'Terminatör 5']],
  ['Terminator: Dark Fate', ['Terminatör Kara Kader', 'Terminatör Kader', 'Terminator Dark Fate']],
  ['Home Alone', ['Evde Tek Başına']],
  ['Home Alone 2: Lost in New York', ['Evde Tek Başına 2', 'Evde Tek Başına 2 New York\'ta Kayıp']],
  ['Pirates of the Caribbean: The Curse of the Black Pearl', ['Karayip Korsanları Siyah İnci\'nin Laneti', 'Karayip Korsanları 1']],
  ['Pirates of the Caribbean: Dead Man\'s Chest', ['Karayip Korsanları Ölü Adamın Sandığı', 'Karayip Korsanları 2']],
  ['Pirates of the Caribbean: At World\'s End', ['Karayip Korsanları Dünyanın Sonu', 'Karayip Korsanları 3']],
  ['Pirates of the Caribbean: On Stranger Tides', ['Karayip Korsanları Gizemli Denizlerde', 'Karayip Korsanları 4']],
  ['Pirates of the Caribbean: Dead Men Tell No Tales', ['Karayip Korsanları Salazar\'ın İntikamı', 'Karayip Korsanları 5']],
  ['The Lord of the Rings: The Fellowship of the Ring', ['Yüzüklerin Efendisi Yüzük Kardeşliği', 'Yüzüklerin Efendisi 1']],
  ['The Lord of the Rings: The Two Towers', ['Yüzüklerin Efendisi İki Kule', 'Yüzüklerin Efendisi 2']],
  ['The Lord of the Rings: The Return of the King', ['Yüzüklerin Efendisi Kralın Dönüşü', 'Yüzüklerin Efendisi 3']],
  ['The Hobbit: An Unexpected Journey', ['Hobbit Beklenmedik Yolculuk', 'Hobbit 1']],
  ['The Hobbit: The Desolation of Smaug', ['Hobbit Smaug\'un Çorak Toprakları', 'Hobbit 2']],
  ['The Hobbit: The Battle of the Five Armies', ['Hobbit Beş Ordunun Savaşı', 'Hobbit 3']],
  ['Harry Potter and the Philosopher\'s Stone', ['Harry Potter ve Felsefe Taşı', 'Harry Potter 1']],
  ['Harry Potter and the Sorcerer\'s Stone', ['Harry Potter ve Felsefe Taşı', 'Harry Potter 1']],
  ['Harry Potter and the Chamber of Secrets', ['Harry Potter ve Sırlar Odası', 'Harry Potter 2']],
  ['Harry Potter and the Prisoner of Azkaban', ['Harry Potter ve Azkaban Tutsağı', 'Harry Potter 3']],
  ['Harry Potter and the Goblet of Fire', ['Harry Potter ve Ateş Kadehi', 'Harry Potter 4']],
  ['Harry Potter and the Order of the Phoenix', ['Harry Potter ve Zümrüdüanka Yoldaşlığı', 'Harry Potter 5']],
  ['Harry Potter and the Half-Blood Prince', ['Harry Potter ve Melez Prens', 'Harry Potter 6']],
  ['Harry Potter and the Deathly Hallows: Part 1', ['Harry Potter ve Ölüm Yadigârları Bölüm 1', 'Harry Potter 7']],
  ['Harry Potter and the Deathly Hallows: Part 2', ['Harry Potter ve Ölüm Yadigârları Bölüm 2', 'Harry Potter 8']],
  ['The Fast and the Furious', ['Hızlı ve Öfkeli', 'Hızlı ve Öfkeli 1']],
  ['2 Fast 2 Furious', ['Daha Hızlı Daha Öfkeli', 'Hızlı ve Öfkeli 2']],
  ['The Fast and the Furious: Tokyo Drift', ['Hızlı ve Öfkeli Tokyo Yarışı', 'Hızlı ve Öfkeli 3']],
  ['Fast & Furious', ['Hızlı ve Öfkeli 4']],
  ['Fast Five', ['Hızlı ve Öfkeli 5']],
  ['Fast & Furious 6', ['Hızlı ve Öfkeli 6']],
  ['Furious 7', ['Hızlı ve Öfkeli 7']],
  ['The Fate of the Furious', ['Hızlı ve Öfkeli 8']],
  ['Mission: Impossible', ['Görevimiz Tehlike']],
  ['Mission: Impossible II', ['Görevimiz Tehlike 2']],
  ['Mission: Impossible III', ['Görevimiz Tehlike 3']],
  ['Mission: Impossible - Ghost Protocol', ['Görevimiz Tehlike Hayalet Protokol', 'Görevimiz Tehlike 4']],
  ['The Godfather', ['Baba']],
  ['The Godfather Part II', ['Baba 2']],
  ['The Godfather Part III', ['Baba 3']],
  ['Pulp Fiction', ['Ucuz Roman']],
  ['Fight Club', ['Dövüş Kulübü']],
  ['Gladiator', ['Gladyatör']],
  ['The Shawshank Redemption', ['Esaretin Bedeli']],
  ['Inception', ['Başlangıç']],
  ['Batman Begins', ['Batman Başlıyor']],
  ['The Dark Knight', ['Kara Şövalye']],
  ['The Dark Knight Rises', ['Kara Şövalye Yükseliyor']],
  ['Interstellar', ['Yıldızlararası']],
  ['The Avengers', ['Yenilmezler']],
  ['Avengers: Age of Ultron', ['Yenilmezler Ultron Çağı']],
  ['Avengers: Infinity War', ['Yenilmezler Sonsuzluk Savaşı']],
  ['Avengers: Endgame', ['Yenilmezler Son Oyun', 'Yenilmezler 4 Son Oyun']],
  ['Saving Private Ryan', ['Er Ryan\'ı Kurtarmak']],
  ['Catch Me If You Can', ['Sıkıysa Yakala']],
  ['Shutter Island', ['Zindan Adası']],
  ['The Prestige', ['Prestij']],
  ['Se7en', ['Yedi', 'Seven']],
  ['The Silence of the Lambs', ['Kuzuların Sessizliği']],
  ['The Lion King', ['Aslan Kral']],
  ['Finding Nemo', ['Kayıp Balık Nemo']],
  ['Finding Dory', ['Kayıp Balık Dory']],
  ['Toy Story', ['Oyuncak Hikayesi']],
  ['Toy Story 2', ['Oyuncak Hikayesi 2']],
  ['Toy Story 3', ['Oyuncak Hikayesi 3']],
  ['Toy Story 4', ['Oyuncak Hikayesi 4']],
  ['Ice Age', ['Buz Devri']],
  ['Taken', ['Kiralık Katil']],
  ['Taken 2', ['Kiralık Katil 2']],
  ['Taken 3', ['Kiralık Katil 3']],
  ['Now You See Me', ['Sihirbazlar Çetesi']],
  ['Now You See Me 2', ['Sihirbazlar Çetesi 2']],
  ['The Hangover', ['Felekten Bir Gece']],
  ['The Hangover Part II', ['Felekten Bir Gece 2']],
  ['The Hangover Part III', ['Felekten Bir Gece 3']],
  ['Man of Steel', ['Çelik Adam']],
  ['Black Swan', ['Siyah Kuğu']],
  ['A Beautiful Mind', ['Akıl Oyunları']],
  ['Scarface', ['Yüzü Yaralı Adam']],
  ['Dances with Wolves', ['Kurtlarla Dans']],
  ['Braveheart', ['Cesur Yürek']],
  ['Blade Runner', ['Bıçak Sırtı']],
  ['Gone Girl', ['Kayıp Kız']],
  ['Memento', ['Akıl Defteri']],
  ['American Beauty', ['Amerikan Güzeli']],
  ['The Green Mile', ['Yeşil Yol']],
  ['Taxi Driver', ['Taksi Şoförü']],
  ['The Departed', ['Köstebek']],
  ['Django Unchained', ['Zincirsiz']],
  ['Inglourious Basterds', ['Soysuzlar Çetesi']],
  ['The Wolf of Wall Street', ['Para Avcısı']],
  ['The Revenant', ['Diriliş']],
  ['Gravity', ['Yerçekimi']],
  ['Mad Max: Fury Road', ['Çılgın Max Öfkeli Yollar']],
  ['Spider-Man', ['Örümcek Adam']],
  ['Spider-Man 2', ['Örümcek Adam 2']],
  ['Spider-Man 3', ['Örümcek Adam 3']],
  ['The Amazing Spider-Man', ['Muhteşem Örümcek Adam']],
  ['Spider-Man: Homecoming', ['Örümcek Adam Eve Dönüş']],
  ['Spider-Man: Far From Home', ['Örümcek Adam Eve Uzak']],
  ['Spider-Man: No Way Home', ['Örümcek Adam Eve Dönüş Yok']],
  ['RoboCop', ['Robot Polis']],
  ['Lethal Weapon', ['Ölümcül Silah']],
  ['Lethal Weapon 2', ['Ölümcül Silah 2']],
  ['Lethal Weapon 3', ['Ölümcül Silah 3']],
  ['First Blood', ['Rambo İlk Kan', 'Rambo 1', 'İlk Kan', 'Rambo First Blood']],
  ['Con Air', ['Kaçış Uçağı']],
  ['The Rock', ['Kaya']],
  ['Raiders of the Lost Ark', ['Kayıp Hazine Avcıları', 'Indiana Jones Kayıp Hazine Avcıları']],
  ['Indiana Jones and the Temple of Doom', ['Indiana Jones ve Ölüm Tapınağı']],
  ['Indiana Jones and the Last Crusade', ['Indiana Jones ve Son Macera']],
  ['Rain Man', ['Yağmur Adam']],
  ['The Pursuit of Happyness', ['Umudunu Kaybetme']],
  ['Eternal Sunshine of the Spotless Mind', ['Sil Baştan']],
  ['Good Will Hunting', ['Can Dostum']],
  ['Dead Poets Society', ['Ölü Ozanlar Derneği']],
  ['Life Is Beautiful', ['Hayat Güzeldir']],
  ['The Pianist', ['Piyanist']],
  ['Schindler\'s List', ['Schindler\'in Listesi']],
  ['The Usual Suspects', ['Olağan Şüpheliler']],
  ['Seven Pounds', ['Yedi Ruh']],
  ['Despicable Me', ['Çılgın Hırsız']],
  ['Despicable Me 2', ['Çılgın Hırsız 2']],
  ['Minions', ['Minyonlar']],
  ['How to Train Your Dragon', ['Ejderhanı Nasıl Eğitirsin']],
  ['Cars', ['Arabalar']],
  ['Monsters, Inc.', ['Sevimli Canavarlar']],
  ['The Incredibles', ['İnanılmaz Aile']],
  ['Up', ['Yukarı Bak']],
  ['Ratatouille', ['Ratatuy']],
  ['Inside Out', ['Ters Yüz']],
  ['Frozen', ['Karlar Ülkesi']],
  ['Tangled', ['Karmakarışık']],
  ['Zootopia', ['Zootropolis']],
  ['Night at the Museum', ['Müzede Bir Gece']],
  ['Sherlock Holmes: A Game of Shadows', ['Sherlock Holmes Gölge Oyunları']],
  ['Prince of Persia: The Sands of Time', ['Pers Prensi Zamanın Kumları']],
  ['I Am Legend', ['Ben Efsaneyim']],
  ['The Notebook', ['Not Defteri']],
  ['Troy', ['Truva']],
  ['300', ['300 Spartalı']],
  ['Clash of the Titans', ['Titanların Savaşı']],
  ['Wrath of the Titans', ['Titanların Öfkesi']],
  ['Kill Bill: Vol. 1', ['Kill Bill Bölüm 1']],
  ['Kill Bill: Vol. 2', ['Kill Bill Bölüm 2']],
  // --- Yüklenen dosya adlarında görülen Türkçe adlar (ekran görüntüleri) ---
  ['National Treasure', ['Büyük Hazine', 'Büyük Hazine 1']],
  ['National Treasure: Book of Secrets', ['Büyük Hazine 2', 'Büyük Hazine Sırlar Kitabı']],
  ['Rush Hour', ['Bitirim İkili', 'Bitirim İkili 1']],
  ['Rush Hour 2', ['Bitirim İkili 2']],
  ['Rush Hour 3', ['Bitirim İkili 3']],
  ['The Mummy Returns', ['Mumya Dönüyor']],
  ['The Time Machine', ['Zaman Tüneli', 'Zaman Makinesi']],
  ['Home Alone 3', ['Evde Tek Başına 3']],
  ['Rambo: First Blood Part II', ['Rambo 2 İlk Kan', 'Rambo İlk Kan 2', 'Rambo 2']],
  ['Rambo III', ['Rambo 3']],
  ['Rambo', ['Rambo 4']],
  ['Rambo: Last Blood', ['Rambo 5', 'Rambo Son Kan']],
  ['The Transporter|Transporter', ['Taşıyıcı', 'Taşıyıcı 1']],
  ['Transporter 2', ['Taşıyıcı 2']],
  ['Transporter 3', ['Taşıyıcı 3']],
  ['The Transporter Refueled|Transporter Refueled', ['Taşıyıcı Son Hız']],
  ['District B13|Banlieue 13', ['Banliyö 13']],
  ['District 13: Ultimatum|Banlieue 13: Ultimatum|Banlieue 13 - Ultimatum', ['Banliyö 13 Ültimatom']],
  ['Spy Kids', ['Çılgın Çocuklar', 'Çılgın Çocuklar 1']],
  ['Spy Kids 2: Island of Lost Dreams|Spy Kids 2: The Island of Lost Dreams', ['Çılgın Çocuklar 2']],
  ['Spy Kids 3-D: Game Over', ['Çılgın Çocuklar 3']],
  ['The Bourne Identity', ['Geçmişi Olmayan Adam', 'Geçmişi Olmayan Adam 1', 'Bourne Kimliği']],
  ['The Bourne Supremacy', ['Geçmişi Olmayan Adam 2', 'Bourne Üstünlüğü']],
  ['The Bourne Ultimatum', ['Geçmişi Olmayan Adam 3', 'Bourne Ültimatom']],
  ['The Bourne Legacy', ['Geçmişi Olmayan Adam 4', 'Bourne Mirası']],
  ['Jason Bourne', ['Geçmişi Olmayan Adam 5']],
  ['Blade', ['Blade 1']],
  ['Blade II', ['Blade 2']],
  ['Blade: Trinity', ['Blade 3', 'Blade Trinity']],
  ['Back to the Future', ['Geleceğe Dönüş', 'Geleceğe Dönüş Bölümü I']],
  ['Back to the Future Part II', ['Geleceğe Dönüş 2', 'Geleceğe Dönüş Bölümü II']],
  ['Back to the Future Part III', ['Geleceğe Dönüş 3', 'Geleceğe Dönüş Bölümü III']],
  ['Ghost Rider', ['Hayalet Sürücü', 'Hayalet Sürücü 1']],
  ['Ghost Rider: Spirit of Vengeance', ['Hayalet Sürücü 2']],
  ['The Mask', ['Maske', 'Maske 1']],
  ['Son of the Mask', ['Maske 2']],
  ['The Mask of Zorro', ['Maskeli Kahraman Zorro', 'Zorro 1']],
  ['The Legend of Zorro', ['Zorro 2', 'Maskeli Kahraman Zorro 2', 'Zorro Efsanesi']],
  ['A Nightmare on Elm Street', ['Elm Sokağında Kabus', 'Elm Sokağında Kabus 1']],
  ["A Nightmare on Elm Street 2: Freddy's Revenge", ['Elm Sokağında Kabus 2']],
  ['A Nightmare on Elm Street 3: Dream Warriors', ['Elm Sokağında Kabus 3']],
  ['A Nightmare on Elm Street 4: The Dream Master', ['Elm Sokağında Kabus 4', 'Elm Sokağında Kabus 4 Rüya Ustası']],
  ['A Nightmare on Elm Street 5: The Dream Child', ['Elm Sokağında Kabus 5']],
  ['Army of Darkness', ['Karanlığın Ordusu']],
  ['The Matrix', ['Matrix', 'Matrix 1']],
  ['The Matrix Reloaded', ['Matrix 2', 'Matrix Reloaded']],
  ['The Matrix Revolutions', ['Matrix 3', 'Matrix Revolutions']],
  ['The Sixth Sense', ['Altıncı His']],
  ['A.I. Artificial Intelligence', ['Yapay Zeka']],
  ['Signs', ['İşaretler']],
  ['The Invasion', ['İstila']],
  ['Twelve Monkeys|12 Monkeys', ['12 Maymun', 'On İki Maymun']],
  ['The Thing', ['Şey']],
  ['Journey to the Center of the Earth', ['Dünyanın Merkezine Yolculuk', 'Dünya Merkezine Yolculuk']],
  ['The Medallion', ['Madalyon']],
  ['The Island', ['Ada']],
  ['Triangle', ['Şeytan Üçgeni']],
  ['Frequency', ['Frekans']],
  ['Groundhog Day', ['Bugün Aslında Dündü']],
  ['Bruce Almighty', ['Aman Tanrım']],
  ['Evan Almighty', ['Aman Tanrım 2']],
  ['Small Soldiers', ['Küçük Askerler']],
  ['Get Smart', ['Akıllı Ol']],
  ["Baby's Day Out", ['Bebek Firarda']],
  ['The Invention of Lying', ['Yalanın İcadı']],
  ['Undisputed II: Last Man Standing', ['Yenilmez 2']],
  ['Undisputed', ['Yenilmez']],
  ['Black Lightning', ['Kara Yıldırım']],
  ['Wrong Turn', ['Bilinmeyen Yol']],
  ['Scary Movie', ['Korkunç Bir Film', 'Korkunç Bir Film 1']],
  ['Scary Movie 2', ['Korkunç Bir Film 2']],
  ['Scary Movie 3', ['Korkunç Bir Film 3']],
  ['Scary Movie 4', ['Korkunç Bir Film 4']],
  ['Fantastic Four', ['Fantastik Dörtlü']],
  ['Fantastic 4: Rise of the Silver Surfer', ['Fantastik Dörtlü Gümüş Sörfçü', 'Fantastik Dörtlü 2']],
  ['Zathura: A Space Adventure', ['Zathura Bir Uzay Macerası']],
  ['Hard Target', ['Zor Hedef']],
  ['Timeline', ['Zaman Yolcusu', 'Zaman Yolcu']],
  ["Snake in the Eagle's Shadow", ['Kartalın Gölgesindeki Yılan']],
  ['Fast Five', ['Hızlı Beş']],
  ['Aladdin', ['Alaaddin']],
  ["A Kid in Aladdin's Palace", ["Alaaddin'in Sarayı", "Alaaddin'in Sarayında Bir Çocuk"]],
  ['The Tuxedo', ['Smokin']],
  ['Hulk', ['Yeşil Dev', 'Yeşil Dev Hulk', 'Hulk Yeşil Dev']],
  ['The Incredible Hulk|Incredible Hulk', ['Yeşil Dev', 'İnanılmaz Hulk', 'Yeşil Dev Hulk', 'Yeşil Dev Hulk 2', 'Hulk 2']],
  ['Batman Begins', ['Batman Başlıyor']],
  ['The Dark Knight', ['Kara Şövalye']],
  ['The Dark Knight Rises', ['Kara Şövalye Yükseliyor']],
  ['Iron Man', ['Demir Adam']],
  ['Iron Man 2', ['Demir Adam 2']],
  ['Iron Man 3', ['Demir Adam 3']],
  ['The Avengers|Marvel\'s The Avengers', ['Yenilmezler', 'Avengers Yenilmezler']],
  ['Avengers: Age of Ultron', ['Yenilmezler: Ultron Çağı', 'Yenilmezler 2']],
  ['Avengers: Infinity War', ['Yenilmezler: Sonsuzluk Savaşı', 'Yenilmezler 3']],
  ['Avengers: Endgame', ['Yenilmezler: Son Oyun', 'Yenilmezler 4']],
  ['Captain America: The First Avenger', ['Kaptan Amerika: İlk Yenilmez']],
  ['Captain America: The Winter Soldier', ['Kaptan Amerika: Kış Askeri']],
  ['Captain America: Civil War', ['Kaptan Amerika: Kahramanların Savaşı']],
  ['Guardians of the Galaxy', ['Galaksi Koruyucuları']],
  ['Harry Potter and the Philosopher\'s Stone|Harry Potter and the Sorcerer\'s Stone', ['Harry Potter ve Felsefe Taşı']],
  ['Harry Potter and the Chamber of Secrets', ['Harry Potter ve Sırlar Odası']],
  ['Harry Potter and the Prisoner of Azkaban', ['Harry Potter ve Azkaban Tutsağı']],
  ['Harry Potter and the Goblet of Fire', ['Harry Potter ve Ateş Kadehi']],
  ['Harry Potter and the Order of the Phoenix', ['Harry Potter ve Zümrüdüanka Yoldaşlığı']],
  ['Harry Potter and the Half-Blood Prince', ['Harry Potter ve Melez Prens']],
  ['Harry Potter and the Deathly Hallows: Part 1', ['Harry Potter ve Ölüm Yadigarları: Bölüm 1']],
  ['Harry Potter and the Deathly Hallows: Part 2', ['Harry Potter ve Ölüm Yadigarları: Bölüm 2']],
  ['The Lord of the Rings: The Fellowship of the Ring', ['Yüzüklerin Efendisi: Yüzük Kardeşliği']],
  ['The Lord of the Rings: The Two Towers', ['Yüzüklerin Efendisi: İki Kule']],
  ['The Lord of the Rings: The Return of the King', ['Yüzüklerin Efendisi: Kralın Dönüşü']],
  ['The Hobbit: An Unexpected Journey', ['Hobbit: Beklenmedik Yolculuk']],
  ['The Hobbit: The Desolation of Smaug', ['Hobbit: Smaug\'un Çorak Toprakları']],
  ['The Hobbit: The Battle of the Five Armies', ['Hobbit: Beş Ordunun Savaşı']],
  ['Pulp Fiction', ['Ucuz Roman']],
  ['Reservoir Dogs', ['Rezervuar Köpekleri']],
  ['Inglourious Basterds', ['Soysuzlar Çetesi']],
  ['Django Unchained', ['Zincirsiz']],
  ['The Hateful Eight', ['Nefret Sekizlisi']],
  ['The Shawshank Redemption', ['Esaretin Bedeli']],
  ['The Green Mile', ['Yeşil Yol']],
  ['Fight Club', ['Dövüş Kulübü']],
  ['The Silence of the Lambs', ['Kuzuların Sessizliği']],
  ['Gladiator', ['Gladyatör']],
  ['Braveheart', ['Cesur Yürek']],
  ['Saving Private Ryan', ['Er Ryan\'ı Kurtarmak']],
  ['Schindler\'s List', ['Schindler\'in Listesi']],
  ['Titanic', ['Titanik']],
  ['Finding Nemo', ['Kayıp Balık Nemo']],
  ['Toy Story', ['Oyuncak Hikayesi']],
  ['Ice Age', ['Buz Devri']],
  ['Madagascar', ['Madagaskar']],
  ['Monsters, Inc.|Monsters Inc', ['Sevimli Canavarlar']],
  ['Home Alone', ['Evde Tek Başına']],
  ['Lethal Weapon', ['Ölümcül Silah']],
  ['Pirates of the Caribbean: The Curse of the Black Pearl', ['Karayip Korsanları: Kara İnci\'nin Laneti', 'Karayip Korsanları']],
  ['Mission: Impossible', ['Görevimiz Tehlike']],
  ['The Godfather', ['Baba', 'Vaftiz Babası']],
  ['The Godfather Part II', ['Baba 2']],
  ['Scarface', ['Yaralı Yüz']],
  ['The Lion King', ['Aslan Kral']],
  ['Beauty and the Beast', ['Güzel ve Çirkin']],
  ['The Little Mermaid', ['Küçük Deniz Kızı']],
  ['Sleeping Beauty', ['Uyuyan Güzel']],
  ['The Jungle Book', ['Orman Çocuğu']],
  ['Gone with the Wind', ['Rüzgar Gibi Geçti']],
  ['Casablanca', ['Kazablanka']],
  ['Rear Window', ['Arka Pencere']],
  ['The Exorcist', ['Şeytan', 'Exorcist Şeytan']],
  ['Friday the 13th', ['13. Cuma', 'Cuma 13']],
  ['A Nightmare on Elm Street', ['Elm Sokağı Kabusu']],
  ['The Texas Chain Saw Massacre|The Texas Chainsaw Massacre', ['Teksas Katliamı']],
  ['Star Wars', ['Yıldız Savaşları']],
  ['Planet of the Apes', ['Maymunlar Cehennemi']],
  ['RoboCop', ['Robot Polis']],
  ['Men in Black', ['Siyah Giyen Adamlar']],
  ['Ghostbusters', ['Hayalet Avcıları']],
  ['Commando', ['Komando']],
  ['The Expendables', ['Harcanabilirler']],
  ['Inception', ['Başlangıç']],
  ['Interstellar', ['Yıldızlararası']],
  ['Memento', ['Akıl Defteri']],
  ['The Departed', ['Köstebek']],
  ['Shutter Island', ['Zindan Adası']],
  ['The Wolf of Wall Street', ['Para Avcısı']],
  ['Gone Girl', ['Kayıp Kız']],
  ['Catch Me If You Can', ['Yakalayabilirsen Yakala']],
  ['The Prestige', ['Prestij']],
  ['Good Will Hunting', ['Can Dostum']],
  ['Alice, Sweet Alice|Communion', ['Sevgili Alice', 'Tarikat']]
];
TR_ALIAS_EK.forEach(function (p) {
  p[0].split('|').forEach(function (nm) {
    var k = nm.toLowerCase().replace(/[^a-z0-9]/g, '');
    TR_ALIAS[k] = (TR_ALIAS[k] || []).concat(p[1].filter(function (n) { return (TR_ALIAS[k] || []).indexOf(n) === -1; }));
  });
});


var TMDB_KEY = '000316508321ce461cf81e7c6815eec7';
var PROVIDER_ID = 'vkvideo';
var ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Mobile Safari/537.36';
var UA_VK = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';
var UA_ENGINE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

var dbg = [];

// ---------------- Yardımcılar ----------------

function pageHeaders(extra) {
  var h = {
    'User-Agent': ANDROID_UA,
    'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
    'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8,ru;q=0.5',
    'Referer': AYAR.SITE + '/'
  };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}
function vkHeaders(extra) {
  var h = { 'User-Agent': UA_VK, 'Accept': '*/*', 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE };
  if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
  return h;
}
function noop() {}

// Aynı anda çok sayıda istek yavaş ağda hepsini zaman aşımına sokuyor: normal istekler sıraya girer, prio istekler girmez.
var NET_ACTIVE = 0, NET_QUEUE = [];
function netAcquire(prio) {
  return new Promise(function (resolve) {
    if (prio || NET_ACTIVE < (AYAR.PARALEL || 4)) { NET_ACTIVE++; resolve(true); return; }
    NET_QUEUE.push({ t: Date.now(), r: resolve });
  });
}
function netRelease() {
  NET_ACTIVE = Math.max(0, NET_ACTIVE - 1);
  while (NET_QUEUE.length && NET_ACTIVE < (AYAR.PARALEL || 4)) {
    var w = NET_QUEUE.shift();
    if (Date.now() - w.t > 7000) { w.r(false); continue; }   // çok bekledi: vazgeç
    NET_ACTIVE++; w.r(true); break;
  }
}

// { status, ok, text, url }  — opt: { method, body, timeout, prio }
function getRaw(url, headers, label, opt) {
  opt = opt || {};
  var prio = !!opt.prio;
  var tmo = opt.timeout || (prio ? 8000 : 6000);
  return netAcquire(prio).then(function (granted) {
    if (!granted) return { status: 0, ok: false, text: '', err: 'sira' };
    var init = { headers: headers || pageHeaders() };
    if (opt.method) init.method = opt.method;
    if (opt.body) init.body = opt.body;
    return withTimeout(fetch(url, init), tmo).then(function (res) {
      var ct = '';
      try { ct = (res.headers && res.headers.get && res.headers.get('content-type')) || ''; } catch (e) {}
      if (opt.noBody) {                       // sadece durum kodu / içerik türü (büyük dosyayı indirme)
        try { if (res.body && res.body.cancel) res.body.cancel(); } catch (e) {}
        return { status: res.status, ok: res.ok, text: '', url: res.url || '', ct: ct };
      }
      return withTimeout(res.text(), tmo).then(
        function (t) { return { status: res.status, ok: res.ok, text: t || '', url: res.url || '', ct: ct }; },
        function () { return { status: res.status, ok: false, text: '', url: res.url || '', ct: ct }; }
      );
    }).catch(function (e) {
      return { status: 0, ok: false, text: '', err: (e && e.message) || 'hata' };
    }).then(function (r) { netRelease(); return r; });
  }).then(function (r) {
    if (label) dbg.push(label + ' ' + (r.status || r.err || '?') + '/' + (r.text || '').length);
    return r;
  });
}

function getJson(url) {
  return withTimeout(fetch(url), 10000).then(function (res) { return res.json(); });
}

function formBody(o) {
  return Object.keys(o).filter(function (k) { return o[k] !== undefined && o[k] !== null; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(o[k])); }).join('&');
}

// ---------------- VK API (anonim token) ----------------

var TOKEN = null, TOKEN_P = null, TOKEN_T = 0;

function getToken(force) {
  if (force) { TOKEN = null; TOKEN_P = null; }
  if (TOKEN && Date.now() - TOKEN_T < 25 * 60 * 1000) return Promise.resolve(TOKEN);
  if (TOKEN_P) return TOKEN_P;
  TOKEN_P = getRaw(AYAR.LOGIN, vkHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }), 'T', {
    method: 'POST', prio: true, timeout: 8000,
    body: formBody({
      client_id: AYAR.CLIENT_ID, client_secret: AYAR.CLIENT_SECRET, app_id: AYAR.CLIENT_ID,
      version: '1', device_id: AYAR.DEVICE_ID
    })
  }).then(function (r) {
    var tok = '';
    try { var j = JSON.parse(r.text); tok = (j && j.data && j.data.access_token) || ''; } catch (e) {}
    TOKEN_P = null;
    if (!tok) throw new Error('token alinamadi st=' + (r.status || r.err) + ' ' + String(r.text || '').slice(0, 80));
    TOKEN = tok; TOKEN_T = Date.now();
    return tok;
  }, function (e) { TOKEN_P = null; throw e; });
  return TOKEN_P;
}

function api(method, params, prio, retried) {
  return getToken(false).then(function (tok) {
    var p = {};
    Object.keys(params).forEach(function (k) { p[k] = params[k]; });
    p.access_token = tok;
    return getRaw(AYAR.API + '/' + method + '?v=' + AYAR.V + '&client_id=' + AYAR.CLIENT_ID,
      vkHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }), '', { method: 'POST', body: formBody(p), prio: !!prio });
  }).then(function (r) {
    var j = null;
    try { j = JSON.parse(r.text); } catch (e) {}
    if (!j) throw new Error('VK yanit yok ' + method + ' st=' + (r.status || r.err));
    if (j.error) {
      var code = j.error.error_code;
      if (code === 5 && !retried) return getToken(true).then(function () { return api(method, params, prio, true); });
      throw new Error('VK hata ' + code + ' (' + method + '): ' + String(j.error.error_msg || '').slice(0, 60));
    }
    return j.response;
  });
}

// ---------------- Video listesi yardımcıları ----------------

function newAcc() { return { map: {}, list: [] }; }
function vkey(o) {
  var k = o.owner_id + '_' + o.id;
  return o.access_key ? k + '_' + o.access_key : k;
}
function baseKey(key) { return String(key).split('_').slice(0, 2).join('_'); }

// Sadece gerçek videoları toplar (albüm / oynatma listesi gibi nesneler elenir)
function collectVideos(node, acc) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (x) { collectVideos(x, acc); }); return; }
  if (node.owner_id && node.id && node.title && node.duration !== undefined &&
      Number(node.id) !== 0 && Number(node.owner_id) !== 0) {
    var k = vkey(node);
    if (!acc.map[k]) { acc.map[k] = node; acc.list.push(node); }
  }
  Object.keys(node).forEach(function (kk) {
    var v = node[kk];
    if (v && typeof v === 'object') collectVideos(v, acc);
  });
}

// "groups" dizisinden kanal / topluluk adları (extended=1 ile gelir): { '123': 'Film İzle', ... }
function collectGroups(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (x) { collectGroups(x, out); }); return; }
  if (Array.isArray(node.groups)) {
    node.groups.forEach(function (g) {
      if (!g) return;
      var id = Math.abs(parseInt(g.id, 10)) || 0, nm = String(g.name || '');
      if (id && nm && !out[id]) out[id] = nm;
    });
  }
  Object.keys(node).forEach(function (k) {
    var v = node[k];
    if (v && typeof v === 'object') collectGroups(v, out);
  });
}

// Yanıttaki "next_from" imleçlerinden en çok video içereni seçer (sayfalama)
function findCursor(root) {
  var best = null, bestCount = -1, sec = '';
  try {
    var s0 = root && root.catalog && root.catalog.sections && root.catalog.sections[0];
    sec = (s0 && s0.id) ? String(s0.id) : '';
  } catch (e) {}
  function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    var nf = n.next_from ? String(n.next_from) : '';
    if (nf) {
      var tmp = newAcc();
      collectVideos(n, tmp);
      if (tmp.list.length > bestCount) {
        bestCount = tmp.list.length;
        best = { next: nf, section: n.section_id ? String(n.section_id) : sec };
      }
    }
    Object.keys(n).forEach(function (k) { var v = n[k]; if (v && typeof v === 'object') walk(v); });
  }
  walk(root);
  return best;
}

function toItem(o, trusted) {
  var key = vkey(o);
  return {
    path: '/video/' + key, id: key, owner: String(o.owner_id),
    title: decodeHtml(String(o.title || '')).trim(),
    dur: parseInt(o.duration, 10) || 0,
    desc: String(o.description || '').slice(0, 400),
    guvenilir: !!trusted
  };
}

// ---------------- VK Video araması (sitedeki gibi sayfa sayfa) ----------------

function searchVk(q, pages, sink, groups) {
  var cur = null, page = 0, seenL = {};
  function unseen(o) { return !seenL[vkey(o)]; }
  function step() {
    if (page >= pages) return Promise.resolve();
    page++;
    var params = { q: q, count: '30', extended: '1' };
    if (cur) params.start_from = cur.next;
    return api('catalog.getVideoSearchWeb2', params, false).then(function (resp) {
      var acc = newAcc();
      collectVideos(resp, acc);
      collectGroups(resp, groups);
      function proceed(resp2, acc2) {
        acc2.list.forEach(function (o) { if (unseen(o)) { seenL[vkey(o)] = 1; sink.push(toItem(o, false)); } });
        var nxt = findCursor(resp2);
        cur = (nxt && (!cur || nxt.next !== cur.next)) ? nxt : null;
        return cur ? step() : Promise.resolve();
      }
      // arama imleci işe yaramadıysa bölüm (section) imleciyle dene
      if (cur && cur.section && !acc.list.some(unseen)) {
        return api('catalog.getSection', { section_id: cur.section, start_from: cur.next, count: '30', extended: '1' }, false).then(function (r2) {
          var a2 = newAcc();
          collectVideos(r2, a2);
          collectGroups(r2, groups);
          return a2.list.some(unseen) ? proceed(r2, a2) : proceed(resp, acc);
        }, function () { return proceed(resp, acc); });
      }
      return proceed(resp, acc);
    });
  }
  return step().catch(function (e) { dbg.push('arama hata [' + q.slice(0, 24) + '] ' + ((e && e.message) || '')); });
}

// ---------------- Kanal / topluluk video listesi ----------------

var CH_CACHE = {};

function channelOwners(list) {
  var out = [];
  (list || []).forEach(function (u) {
    u = String(u || '').trim();
    var m;
    if (!u) return;
    if (/^-\d+$/.test(u)) out.push(u);
    else if (/^\d+$/.test(u)) out.push('-' + u);
    else if ((m = u.match(/(?:club|public|event)(\d+)/))) out.push('-' + m[1]);
    else if ((m = u.match(/(?:^|\/)id(\d+)/))) out.push(m[1]);
  });
  return uniq(out);
}

function scanChannel(owner, sink, trusted) {
  owner = String(owner);
  var c = CH_CACHE[owner];
  if (c && Date.now() - c.t < 20 * 60 * 1000) {
    c.list.forEach(function (o) { sink.push(toItem(o, trusted)); });
    return Promise.resolve(c.list.length);
  }
  var all = [], off = 0, pg = 0;
  function step() {
    if (pg >= (AYAR.KANAL_SAYFA || 1)) return Promise.resolve();
    pg++;
    return api('video.get', { owner_id: owner, count: '100', offset: String(off) }, false).then(function (r) {
      var acc = newAcc();
      collectVideos(r, acc);
      acc.list.forEach(function (o) { all.push(o); sink.push(toItem(o, trusted)); });
      var total = (r && r.count) ? parseInt(r.count, 10) : 0;
      off += 100;
      if (acc.list.length >= 100 && (!total || off < total)) return step();
    });
  }
  return step().catch(function (e) { dbg.push('kanal hata ' + owner + ' ' + ((e && e.message) || '')); }).then(function () {
    if (all.length) CH_CACHE[owner] = { t: Date.now(), list: all };
    return all.length;
  });
}

// ---------------- Video bağlantıları ----------------

function isImage(u) {
  if (u.indexOf('.mp4') > -1 || u.indexOf('.m3u8') > -1 || u.indexOf('.mpd') > -1) return false;   // psv4.userapi.com/.../video.360.mp4 gibi video adresleri
  return u.indexOf('.jpg') > -1 || u.indexOf('.jpeg') > -1 || u.indexOf('.png') > -1 || u.indexOf('.webp') > -1 ||
    u.indexOf('getVideoPreview') > -1 || u.indexOf('userapi.com') > -1 || u.indexOf('vkuserphoto') > -1;
}
function isMedia(u) {
  if (isImage(u)) return false;
  if (u.indexOf('video_ext.php') > -1) return false;
  var host = (u.match(/^https?:\/\/([^\/?#]+)/i) || [])[1] || '';
  if (/(^|\.)(vkvideo\.ru|vk\.com|vk\.ru|m\.vk\.com)$/i.test(host)) return false;
  return u.indexOf('.m3u8') > -1 || u.indexOf('.mpd') > -1 || u.indexOf('.mp4') > -1 || u.indexOf('okcdn.ru') > -1 ||
    /(mycdn\.me|vkuservideo\.(net|ru)|vkvd\d*\.)/i.test(host) || /[?&]type=\d/.test(u);
}
function cleanUrl(u) { return String(u || '').replace(/\\\//g, '/').replace(/\\u0026/g, '&').replace(/&amp;/g, '&'); }

// JSON içinde nerede olursa olsun http ile başlayan metinleri bulur: [anahtar, adres]
function scanUrls(node, hint, out) {
  if (node === null || node === undefined) return;
  if (typeof node === 'string') { if (node.indexOf('http') === 0) out.push([hint, node]); return; }
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(function (x) { scanUrls(x, hint, out); }); return; }
  Object.keys(node).forEach(function (k) {
    if (k === 'image' || k === 'first_frame' || k.indexOf('photo_') === 0) return;
    scanUrls(node[k], k, out);
  });
}

function qualityOf(hint, u) {
  var m = String(hint || '').match(/(\d{3,4})/);
  if (m) return parseInt(m[1], 10);
  var t = String(u || '').match(/[?&]type=(\d+)/);
  if (t) return { 0: 144, 1: 240, 2: 360, 3: 480, 4: 720, 5: 1080, 6: 1440, 7: 2160 }[parseInt(t[1], 10)] || 0;
  return 0;
}

// Bir videonun oynatma bağlantıları: [{ hint, url, src }]
// Kaynaklar: video.getByIds (+ video.get yedeği), video.getForPlay, video.getPlayerConfig VE oynatıcı (embed) sayfası.
// Hepsi birleştirilir: API bazı videolarda sadece düşük kaliteyi verirken embed sayfasında 1080p/HLS/DASH bulunabilir.
function getPlay(item) {
  var key = item.id, parts = key.split('_'), oid = parts[0] || '', vid = parts[1] || '', ak = parts[2] || '';
  var links = [], seen = {}, gotItem = false;
  function add(node, src) {
    var list = [];
    scanUrls(node, '', list);
    list.forEach(function (p) {
      var u = cleanUrl(p[1]);
      if (isMedia(u) && !seen[u]) { seen[u] = 1; links.push({ hint: p[0], url: u, src: src }); }
    });
  }
  function fromItems(r) {
    var acc = newAcc();
    collectVideos(r, acc);
    if (acc.list.length) {
      gotItem = true;
      var o = acc.list[0];
      add(o, 'api');
      if (!item.dur) item.dur = parseInt(o.duration, 10) || 0;
      if (o.player) item.player = String(o.player);
    } else add(r, 'api');
  }
  function embedOne(u) {
    return getRaw(u, vkHeaders({ 'Accept': 'text/html,*/*' }), 'W', { prio: true, timeout: 7000 }).then(function (r) {
      var rx = /"(hls[a-z_]*|dash_[a-z_]+|url\d+|mp4_\d+)"\s*:\s*"(https?:[^"]+)"/g, m;
      while (r.ok && (m = rx.exec(r.text)) !== null) {
        var cu = cleanUrl(m[2]);
        if (isMedia(cu) && !seen[cu]) { seen[cu] = 1; links.push({ hint: m[1], url: cu, src: 'embed' }); }
      }
    });
  }
  function fetchEmbed() {
    var std = AYAR.SITE + '/video_ext.php?oid=' + oid + '&id=' + vid + (ak ? '&hash=' + ak : '');
    var urls = [item.player || std];
    if (item.player && item.player !== std) urls.push(std);
    return Promise.all(urls.map(function (u) { return embedOne(u).catch(noop); }));
  }
  var playParams = { videos: key, video: key, owner_id: oid, video_id: vid, id: vid };
  var main = api('video.getByIds', { videos: key }, true).then(fromItems, function (e) { dbg.push('getByIds ' + key + ' ' + ((e && e.message) || '')); })
    .then(function () {
      if (gotItem) return null;
      return api('video.get', { videos: key }, true).then(fromItems, function (e) { dbg.push('video.get ' + key + ' ' + ((e && e.message) || '')); });
    })
    .then(fetchEmbed);
  return Promise.all([
    main,
    api('video.getForPlay', playParams, true).then(function (r) { add(r, 'play'); }, function (e) { dbg.push('getForPlay ' + ((e && e.message) || '')); }),
    api('video.getPlayerConfig', playParams, true).then(function (r) { add(r, 'play'); }, function (e) { dbg.push('getPlayerConfig ' + ((e && e.message) || '')); })
  ]).then(function () {
    if (AYAR.DEBUG_MODU) dbg.push('links ' + key + ': ' + links.map(function (l) { return l.src + ':' + l.hint + '@' + String(l.url).replace(/^https?:\/\//, '').split('/')[0].slice(0, 22); }).join(' ').slice(0, 300));
    return links;
  });
}

function isHlsLink(l) { return l.url.indexOf('.m3u8') > -1 || /hls/i.test(String(l.hint || '')); }
function isDashLink(l) { return l.url.indexOf('.mpd') > -1 || /dash/i.test(String(l.hint || '')); }
function isMp4Link(l) { return !isHlsLink(l) && !isDashLink(l); }

// Oynatıcıya verilecek başlık yöntemleri (CDN bazen UA / Referer / Origin ister, bazen de başlık varken reddeder): hangisi çalışıyorsa o kullanılır
var HDR_VARIANTS = [
  function () { return { 'User-Agent': UA_VK, 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE }; },
  function () { return { 'User-Agent': ANDROID_UA, 'Referer': AYAR.SITE + '/', 'Origin': AYAR.SITE }; },
  function () { return { 'User-Agent': UA_VK }; },
  function () { return {}; }
];

function probeState(r, isHls) {                      // 1 = çalışıyor, -1 = çalışmıyor, 0 = belirsiz (ağ hatası)
  if (!r || !r.status) return 0;
  if (isHls) return (r.ok && /^\s*#EXTM3U/.test(r.text || '')) ? 1 : -1;
  if (r.status === 200 || r.status === 206) return /text\/html|json/i.test(r.ct || '') ? -1 : 1;
  return -1;
}

// Bağlantıyı gerçekten dener (Range ile 2 bayt): hangi başlık takımı kabul ediliyor, mp4 ölü mü?
function verifyItem(item, links) {
  var pl = { links: links, hlsVars: [], headers: HDR_VARIANTS[0](), mp4Dead: false };
  if (!AYAR.DOGRULA || !links.length) return Promise.resolve(pl);
  var mp4 = links.filter(isMp4Link)[0] || null;
  var target = mp4 || links.filter(isHlsLink)[0] || null;
  if (!target) return Promise.resolve(pl);
  var isH = !mp4;
  var tests = HDR_VARIANTS.map(function (mk, i) {
    var ph = mk();
    if (!isH) ph['Range'] = 'bytes=0-1';
    return getRaw(target.url, ph, '', { timeout: 4000, prio: true, noBody: !isH }).then(function (r) {
      return { i: i, v: probeState(r, isH), st: r.status || r.err || '?' };
    });
  });
  return Promise.all(tests).then(function (rs) {
    var okR = null, unknown = false;
    rs.forEach(function (x) { if (x.v === 1 && !okR) okR = x; if (x.v === 0) unknown = true; });
    dbg.push('probe ' + item.id + ' ' + (isH ? 'hls' : 'mp4') + ' ' + rs.map(function (x) { return 'V' + x.i + ':' + x.st; }).join(' '));
    if (okR) pl.headers = HDR_VARIANTS[okR.i]();
    else if (!unknown && !isH) pl.mp4Dead = true;
    return pl;
  });
}

function expandHls(url, headers) {
  return getRaw(url, headers || HDR_VARIANTS[0](), '', { timeout: 3000, prio: true }).then(function (r) {
    return r.ok ? parseHlsMaster(r.text, url) : [];
  });
}

function makeStreams(item, ranked, pl) {
  var headers = pl.headers || HDR_VARIANTS[0]();
  var parts = [AYAR.EKLENTI_ADI, ranked.lang], dur = fmtDur(item.dur);
  function lbl(extra) {
    var a = parts.concat([extra]);
    if (dur) a.push(dur);
    if (AYAR.DEBUG_MODU) a.push('[' + String(item.title).slice(0, 60) + ']');
    return a.join(' | ');
  }
  var mp4 = [], extras = [], mp4h = {}, seen = {};
  (pl.links || []).forEach(function (l) {
    var u = l.url, hint = String(l.hint || '');
    if (seen[u]) return;
    seen[u] = 1;
    if (isHlsLink(l)) {
      extras.push({ name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' HLS', title: lbl('HLS Auto'), url: u, quality: 'Auto', headers: headers, provider: PROVIDER_ID });
      return;
    }
    if (isDashLink(l)) {
      extras.push({ name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' DASH', title: lbl('DASH Auto'), url: u, quality: 'Auto', headers: headers, provider: PROVIDER_ID });
      return;
    }
    var q = qualityOf(hint, u), key = q ? q + 'p' : 'Auto';
    var tag = (q && mp4h[q]) ? ' #2' : '';
    if (q) mp4h[q] = (mp4h[q] || 0) + 1;
    var s = { name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' ' + key + tag, title: lbl(key + tag + (pl.mp4Dead ? ' (test başarısız)' : '')), url: u, quality: key, type: 'mp4', headers: headers, provider: PROVIDER_ID };
    if (pl.mp4Dead) s._dead = true;
    mp4.push(s);
  });
  // HLS ana listesindeki (mp4 olarak verilmeyen) çözünürlükler: 1080p ve altı hepsi
  (pl.hlsVars || []).forEach(function (v) {
    if (!v.h || mp4h[v.h] || seen[v.url]) return;
    seen[v.url] = 1;
    mp4h[v.h] = 1;
    mp4.push({ name: AYAR.EKLENTI_ADI + ' - ' + ranked.lang + ' ' + v.h + 'p', title: lbl(v.h + 'p HLS'), url: v.url, quality: v.h + 'p', headers: headers, provider: PROVIDER_ID });
  });
  mp4.sort(function (a, b) { return heightOf(b.quality) - heightOf(a.quality); });
  return mp4.concat(extras);
}

// ---------------- Arama motorları: Google / Yandex / Yandex Video / Bing / DuckDuckGo / Brave ----------------
// Arama motorlarından VK video numaraları toplanır; gerçek başlık ve süre VK API'den (video.getByIds) okunup puanlamaya sokulur.

// Sorgular: ad (Türkçe / orijinal) + yıl + "tr", "türkçe dublaj", "tr dublaj", site adı ...
function engineQueries(host, titles, trTitles, year) {
  var y = year ? ' ' + year : '';
  function clean(s) { return String(s || '').replace(/[:!?,"]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  var trs = uniq((trTitles || []).map(clean).filter(Boolean)).slice(0, 3);
  var ens = uniq((titles || []).map(clean).filter(Boolean)).filter(function (n) { return trs.indexOf(n) === -1; }).slice(0, 2);
  var names = uniq([ens[0], trs[0], trs[1], ens[1], trs[2]].filter(Boolean)), qs = [];
  // elle yazılan çalışan sorgu en önce: kısa ad + "tr vkvideo.ru" (örn. "rambo tr vkvideo.ru")
  uniq([firstWordOf(trs[0]), firstWordOf(ens[0])].filter(Boolean)).forEach(function (w) { qs.push(w + ' tr ' + host); });
  names.slice(0, 3).forEach(function (n) { qs.push(n + ' tr ' + host); });
  names.slice(0, 2).forEach(function (n) { qs.push(n + y + ' türkçe dublaj ' + host); });
  names.slice(0, 2).forEach(function (n) { qs.push(n + y + ' tr dublaj vk.com'); });
  names.slice(0, 3).forEach(function (n) { qs.push(n + ' tr dublaj ' + host); });
  names.slice(0, 2).forEach(function (n) { qs.push('site:' + host + ' ' + n + y); qs.push('site:vk.com ' + n + y + ' dublaj'); });
  names.slice(0, 2).forEach(function (n) { qs.push(n + y + ' ' + host); });
  names.slice(3).forEach(function (n) { qs.push(n + ' tr ' + host); });
  var fw = firstWordOf(ens[0] || trs[0]);
  if (fw) { qs.push(fw + y + ' tr ' + host); qs.push(fw + ' dublaj vk'); }
  return uniq(qs).slice(0, AYAR.MOTOR_SORGU || 10);
}

// Arama motoru adresleri ÖNCELİK sırasıyla. İlk sorgu hepsinde, sonrakiler giderek daha az motorda aranır.
function engineUrls(q, qi) {
  var e = encodeURIComponent(q), all = [
    'https://www.google.com/search?q=' + e + '&hl=tr&source=hp',                          // mobil Google
    'https://yandex.com.tr/search/touch/?text=' + e.replace(/%20/g, '+') + '&lr=11508',    // mobil Yandex
    'https://yandex.com.tr/video/search?text=' + e,                                        // Yandex Video (VK videolarını doğrudan listeler)
    'https://www.google.com/search?q=' + e + '&hl=tr&num=30&gbv=1',
    'https://yandex.com.tr/search/?text=' + e,
    'https://www.bing.com/search?q=' + e + '&setlang=tr&count=30',
    'https://www.google.com/search?tbm=vid&q=' + e + '&hl=tr&num=30',
    'https://www.bing.com/videos/search?q=' + e + '&setlang=tr',
    'https://html.duckduckgo.com/html/?q=' + e + '&kl=tr-tr',
    'https://search.brave.com/search?q=' + e + '&source=web',
    'https://lite.duckduckgo.com/lite/?q=' + e + '&kl=tr-tr',
    'https://yandex.com/search/?text=' + e,
    'https://www.mojeek.com/search?q=' + e
  ];
  var cap = qi === 0 ? 13 : qi <= 2 ? 6 : qi <= 5 ? 3 : 0;
  return all.slice(0, cap);
}

function vkNorm(h) {
  return String(h || '').replace(/%252F/gi, '/').replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/%3D/gi, '=')
    .replace(/%3F/gi, '?').replace(/%26/gi, '&').replace(/&amp;/g, '&').replace(/\\u002F/gi, '/').replace(/\\u0026/gi, '&').replace(/\\\//g, '/');
}

// Sonuç sayfasındaki VK video numaraları: vkvideo.ru/video-123_456, vk.com/video-123_456, ?z=video-123_456, video_ext.php?oid=..&id=..
function parseEngine(html) {
  var h = vkNorm(html), out = [], seen = {}, m;
  function add(oid, id, hash) {
    if (!oid || !id || !parseInt(oid, 10) || !parseInt(id, 10)) return;
    var k = oid + '_' + id;
    if (seen[k]) return;
    seen[k] = 1;
    out.push({ key: k, vid: k + (hash ? '_' + hash : ''), id: k });
  }
  var r1 = /(?:vkvideo\.ru|vk\.com|vk\.ru)\/(?:video|clip)(-?\d+)_(\d+)(?:_([0-9a-f]{8,}))?/gi;
  while ((m = r1.exec(h)) !== null) add(m[1], m[2], m[3]);
  var r2 = /[?&]z=(?:video|clip)(-?\d+)_(\d+)/gi;
  while ((m = r2.exec(h)) !== null) add(m[1], m[2], '');
  var r3 = /video_ext\.php\?[^"'\s<>\\]*?oid=(-?\d+)[^"'\s<>\\]*?&id=(\d+)(?:[^"'\s<>\\]*?hash=([0-9a-f]{8,}))?/gi;
  while ((m = r3.exec(h)) !== null) add(m[1], m[2], m[3]);
  return out;
}
function engineFetch(u, lbl) { return getRaw(u, engineHeaders(u), lbl, { timeout: 7000, prio: true }); }


// ---------------- okru / mailru ile ortak yardımcılar, başlık analizi ve puanlama ----------------

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(function (v) { clearTimeout(t); resolve(v); },
                 function (e) { clearTimeout(t); reject(e); });
  });
}

function decodeHtml(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

var TR_MAP = { 'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u', 'â': 'a', 'î': 'i', 'û': 'u' };
function asciiLower(s) {
  return String(s || '').replace(/İ/g, 'i').replace(/I/g, 'i').toLowerCase()
    .replace(/[çğıöşüâîû]/g, function (c) { return TR_MAP[c]; });
}
function norm(s) { return asciiLower(s).replace(/[^a-z0-9]/g, ''); }
// Türkçe harfleri sadeleştir (büyük/küçük harf korunur): "Zor Ölüm" -> "Zor Olum"
var TR_PLAIN = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
function plain(s) { return String(s || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, function (c) { return TR_PLAIN[c]; }); }
// Ünsüz iskeleti: "Captain Phillips" ~ "Kptn.Phlps" (yükleyen kısaltmış)
function skel(s) {
  return asciiLower(s).replace(/[^a-z0-9]/g, '').replace(/c/g, 'k').replace(/[aeiou]/g, '').replace(/(.)\1+/g, '$1');
}
function hasTrChars(s) { return /[çğışöüÇĞİŞÖÜ]/.test(String(s || '')); }
// Hepsi bitince ya da süre dolunca devam et (biten sonuçlar kullanılır, bitmeyenler atlanır)
function waitWithin(promises, ms) {
  return new Promise(function (resolve) {
    var left = promises.length, done = false;
    if (!left) { resolve(); return; }
    var t = setTimeout(function () { if (!done) { done = true; resolve(); } }, ms);
    promises.forEach(function (p) {
      p.then(function () {}, function () {}).then(function () {
        left--;
        if (left === 0 && !done) { done = true; clearTimeout(t); resolve(); }
      });
    });
  });
}
// En az `need` iş bitince (ya da hepsi bitince / süre dolunca) devam et
function waitSome(promises, need, ms) {
  return new Promise(function (resolve) {
    var n = promises.length, finished = 0, done = false;
    if (!n) { resolve(); return; }
    need = Math.min(need, n);
    var t = setTimeout(function () { if (!done) { done = true; resolve(); } }, ms);
    promises.forEach(function (p) {
      p.then(function () {}, function () {}).then(function () {
        finished++;
        if (finished >= need && !done) { done = true; clearTimeout(t); resolve(); }
      });
    });
  });
}
function aliasNames(list) {
  var out = [];
  list.forEach(function (t) { var a = TR_ALIAS[norm(t)]; if (a) out = out.concat(a); });
  return uniq(out);
}

function uniq(list) {
  var out = [];
  list.forEach(function (x) { if (x && out.indexOf(x) === -1) out.push(x); });
  return out;
}

function lev(a, b) {
  if (a === b) return 0;
  var prev = [], cur = [], i, j;
  for (j = 0; j <= b.length; j++) prev[j] = j;
  for (i = 1; i <= a.length; i++) {
    cur = [i];
    for (j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}
// "future" ~ "furure" (yükleyenin yazım hatası): 5+ harfli kelimelerde 1 harf farkı kabul
function looseEq(a, b) {
  if (a === b) return true;
  return a.length >= 5 && b.length >= 5 && Math.abs(a.length - b.length) <= 1 && lev(a, b) <= 1;
}

// ---------------- Başlık analizi ----------------

var STOP_WORDS = { the: 1, a: 1, an: 1, of: 1, and: 1, ve: 1, ile: 1, film: 1, filmi: 1, izle: 1, movie: 1 };
var ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
var NOISE = {};
['bluray', 'brrip', 'bdrip', 'webrip', 'webdl', 'web', 'dl', 'hdrip', 'hdtv', 'dvdrip', 'x264', 'x265', 'h264', 'h265',
 'hevc', 'aac', 'ac3', 'dts', 'dual', 'tr', 'en', 'eng', 'turkce', 'turkish', 'trdub', 'dublaj', 'dublajli', 'altyazi',
 'altyazili', 'sub', 'subs', 'full', 'hd', 'fhd', 'uhd', 'multi', 'ar', 'arabic', 'arapca', 'imax', 'extended',
 'remastered', 'proper', 'repack', '3dfi', 'yify', 'rarbg', 'mkv', 'mp4', 'avi', 'hdr', 'english', 'ingilizce', 'dub',
 'subtitle', 'subtitles', 'bluray1080p', 'hd1080p', 'video', 'tek', 'parca', 'part',
 'mpv', 'mkv', 'mov', 'm4v', 'wmv', 'flv', 'bolum', 'bolumu', 'kisim', 'kismi',
 'xvid', 'divx', 'oped', 'otuk', 'otuke', 'direkizleyin', 'com', 'org', 'net', 'www', 'x26', 'dvd', 'bdrip',
 'cift', 'nf', 'amzn', 'dsnp', 'hmax', 'eski', 'yeni', 'seri', 'serisi', 'koleksiyon', 'fullhdfilm', 'hdfilm', 'filmizle', 'izlesene']
  .forEach(function (w) { NOISE[w] = 1; });

// Aranan başlıktan anlamlı kelimeler (TMDB tarafı)
function sigTokens(s) {
  var words = [], nums = [];
  asciiLower(s).split(/[^a-z0-9]+/).forEach(function (t) {
    if (!t) return;
    if (/^\d{1,2}$/.test(t)) { nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    words.push(t);
  });
  return { words: words, nums: nums };
}

// Yüklenen dosya adı: tt0088763.Back.to.the.Future.Part.I.1985.1080p.TR.dual
var GLUE_TAGS = ['dublaj', 'izle', 'tr'];
var NO_DIGIT_SPLIT = /^(part|disc|disk|kisim|bolum|season|sezon|mpeg|divx|xvid|dolby|atmos|hevc|dts|aac|ddp)$/;
// Dosya adı parçası -> gerçek parçalar. Yükleyenlerin bitişik yazımları:
//   "Başına2" -> basina 2 | "efsanetr" -> efsane tr | "57556kartalin" -> kartalin | "m1080ptr" -> 1080p tr | "1x" -> 1
//   "tt.57556" / "tt5967" gibi sahte IMDb numaraları atılır
function splitTok(t, depth) {
  var m;
  depth = depth || 0;
  if (t === 'tt' || t === 'ttt' || /^ttt?\d{3,5}$/.test(t)) return [];
  if (/^\d{5,7}$/.test(t)) return [];
  m = t.match(/^m?(2160|1080|720|480|360)p(tr|dual|dublaj|turkce|izle|hd|sub)?$/);
  if (m) return m[2] ? [m[1] + 'p', m[2]] : [m[1] + 'p'];
  m = t.match(/^(\d{1,4})(tr|trdub|trdublaj|dublaj|dual|turkce|altyazi|altyazili)$/) ||
      t.match(/^(tr|trdub|trdublaj|dublaj|dual|turkce)(\d{1,2})$/) ||
      t.match(/^(\d{3,4}p?|tr|dublaj|dublajli|turkce|hd|full|film|tek|parca|bolum)(izle)$/);
  if (m) return [m[1], m[2]];
  m = t.match(/^(mp4|mkv|avi|dvd|dvdrip|bluray|brrip|webrip|hd|full|mpv|mov|m4v)(tr|dublaj|dual)$/) ||
      t.match(/^(tr|dublaj|dual)(mp4|mkv|avi|dvd|dvdrip|bluray|brrip|webrip|hd|mpv|mov|m4v)$/);
  if (m) return [m[1], m[2]];
  m = t.match(/^(tr|en|eng)(sub|subs|altyazi)$/);                          // "TRSub" = Türkçe ALTYAZI (ses Türkçe değil)
  if (m) return [m[1], 'sub'];
  m = t.match(/^(\d{4,7})([a-z]{3,})$/);
  if (m) return splitTok(m[1], depth + 1).concat(splitTok(m[2], depth + 1));
  m = t.match(/^(\d{1,2})x$/);
  if (m) return [m[1]];
  m = t.match(/^([a-z]{4,})(\d{1,2})$/);
  if (m && !NO_DIGIT_SPLIT.test(m[1])) return splitTok(m[1], depth + 1).concat([m[2]]);
  if (depth < 2) {
    for (var i = 0; i < GLUE_TAGS.length; i++) {
      var g = GLUE_TAGS[i];
      if (t.length - g.length >= 4 && t.slice(-g.length) === g) return [t.slice(0, -g.length), g];
    }
  }
  return [t];
}

function analyze(title) {
  var raw = String(title || '')
    .replace(/^\s*\d{1,3}\s*[.)\-–:]\s+/, '')                                 // "66. Alice Sweet Alice ...": liste sıra numarası film numarası değil
    .replace(/\s*[\(\[]\s*\d\s*[\)\]]\s*$/, '')                      // "Film (1)": kopya numarası
    .replace(/\bsayfa\s*\d+/gi, ' ')                               // "... - Sayfa 3" site sayfası, sıra numarası değil
    .replace(/(^|[^0-9])[257][.,][01](?![0-9])/g, '$1');             // ses düzeni 5.1 / 7.1 / 2.0 sıra numarası sanılmasın
  var toks = [];
  asciiLower(raw.replace(/\?/g, '_')).split(/[^a-z0-9_]+/).filter(Boolean).forEach(function (t) {   // '?' = okunamayan harf (joker)
    splitTok(t).forEach(function (x) { if (x) toks.push(x); });
  });
  var info = { imdb: '', years: [], res: 0, tags: {}, words: [], nums: [], part: 0, bag: toks };
  toks.forEach(function (t, idx) {
    var m;
    if (t === 'x' && idx === toks.length - 1) { info.tags[t] = 1; return; }   // kesilmiş "x264" (Roman 10 sanılmasın)
    if (/^tt\d{6,9}$/.test(t)) { info.imdb = t; return; }
    if (/^(19|20)\d{2}$/.test(t)) { info.years.push(parseInt(t, 10)); return; }
    m = t.match(/^(2160|1080|720|480|360)p$/);
    if (m) { info.res = Math.max(info.res, parseInt(m[1], 10)); return; }
    if (t === '4k') { info.res = Math.max(info.res, 2160); return; }
    m = t.match(/^(?:cd|disc|disk|pt|part|kisim)(\d)$/);
    if (m) { info.part = parseInt(m[1], 10); return; }
    if (NOISE[t] || /dublaj|turkce|altyaz|dual/.test(t)) { info.tags[t] = 1; return; }
    if (/^\d{1,2}$/.test(t)) { info.nums.push(parseInt(t, 10)); return; }
    if (ROMAN[t]) { info.nums.push(ROMAN[t]); return; }
    if (STOP_WORDS[t]) return;
    info.words.push(t);
  });
  info.joined = toks.join('');
  return info;
}

// Türkçe ek toleransı: "Bourneun" ~ "Bourne", "Yolcu" ~ "Yolcusu", "Maske" ~ "Mask"
var TR_SUF = /^(i|u|a|e|s|n|si|su|in|un|an|en|ya|ye|yi|yu|da|de|ta|te|ler|lar|leri|lari|nin|nun|dan|den|tan|ten|nda|nde|ndan|nden|ni|na|ne|ndaki)$/;
function sufEq(a, b) {
  var s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
  return s.length >= 4 && l.length > s.length && l.length - s.length <= 5 && l.indexOf(s) === 0 && TR_SUF.test(l.slice(s.length));
}
function wildEq(a, b) {                       // b'deki '_' = bir (veya hiç) harf: "saray_" ~ "sarayi"
  if (b.indexOf('_') < 0 || a.indexOf('_') > -1 || a.length < 4) return false;
  try { return new RegExp('^' + b.replace(/_/g, '.?') + '$').test(a); } catch (e) { return false; }
}
function tokEq(w, b) { return looseEq(w, b) || sufEq(w, b) || wildEq(w, b); }
// Garanti listesi: site başlığı beklenen dosya adıyla aynı mı? ('?' joker)
function sameTitle(title, expectedNorm) {
  var pat = asciiLower(String(title || '').replace(/\?/g, '_')).replace(/[^a-z0-9_]/g, '').replace(/_/g, '[a-z0-9]?');
  try { return new RegExp('^' + pat + '$').test(expectedNorm); } catch (e) { return false; }
}

function noApos(wants) {                   // "Nim's Island" ~ dosyada "Nims.Island"
  var out = wants.slice();
  wants.forEach(function (w) { var x = String(w || '').replace(/['’`]/g, ''); if (x !== w) out.push(x); });
  return out;
}

function nameMatch(info, wants) {
  wants = noApos(wants);
  for (var i = 0; i < wants.length; i++) {
    var sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    var covered = ww.every(function (w) {
      return info.bag.some(function (b) { return tokEq(w, b); });
    });
    if (!covered) {
      // bitişik yazım: "SpiderMan.Homecoming" ~ "Spider-Man: Homecoming", "YapayZeka" ~ "Yapay Zeka"
      var wn = norm(wants[i]);
      if (wn.length >= 6 && info.joined && info.joined.indexOf(wn) > -1) return true;
      continue;
    }
    // kısa başlıklar ("Up", "It"): dosya adı başka kelimelerle dolu ise başka film olabilir
    if (ww.length === 1 && ww[0].length <= 2 && info.words.length > 3) continue;   // sadece 'Up', 'It' gibi 2 harflik adlar
    // sıra numarası çakışıyorsa (Taken 2 / Taken 3) reddet
    if (sw.nums.length && info.nums.length) {
      var common = sw.nums.some(function (n) { return info.nums.indexOf(n) > -1; });
      if (!common) continue;
    } else if (!sw.nums.length && !info.imdb && info.nums.some(function (n) { return n >= 2 && n <= 20; })) {
      continue;                     // aranan adda sayı yok ama dosyada "2/3/4.." var: devam filmi (Maske.2, Evde Tek Başına2)
    }
    return true;
  }
  return false;
}

// Birebir ad: dosya adındaki her kelime aranan addan, sıra numaraları da aynı (yıl yanlış yazılmış olsa bile güvenli)
function exactTitle(info, wants) {
  wants = noApos(wants);
  for (var i = 0; i < wants.length; i++) {
    var sw = sigTokens(wants[i]), ww = sw.words;
    if (!ww.length) continue;
    if (!ww.every(function (w) { return info.bag.some(function (b) { return tokEq(w, b); }); })) continue;
    var extra = info.words.filter(function (b) { return !ww.some(function (w) { return tokEq(w, b); }); });
    if (extra.length) continue;
    if (sw.nums.slice().sort().join(',') === info.nums.slice().sort().join(',')) return true;
  }
  return false;
}

// Kısmi ad eşleşmesi: aranan kelimelerin en az yarısı (içinde 5+ harfli biri) dosya adında geçiyor.
// Sadece yıl TAM tutuyor ve süre ±%6 içindeyse kabul edilir (Yenilmezler: Endgame ~ Yenilmezler Son Oyun).
function partialName(info, wants) {
  for (var i = 0; i < wants.length; i++) {
    var ww = sigTokens(wants[i]).words;
    if (!ww.length) continue;
    var hit = 0, long = false, anchor = false;
    ww.forEach(function (w) {
      if (info.bag.some(function (b) { return tokEq(w, b); })) { hit++; if (w.length >= 5) long = true; if (w.length >= 8) anchor = true; }
    });
    if (long && hit / ww.length >= 0.5) return true;
    if (anchor) return true;       // "Terminator" gibi ayırt edici tek kelime (yıl + süre şartıyla)
  }
  return false;
}

// Bulanık anahtar kelime: aranan addaki 5+ harfli bir kelime, dosya adındaki bir kelimeye en fazla 2 harf farkla benziyor
// (Aladdin ~ Alaaddin). Tek başına yetmez; süre birebir (±%1.2) ve yıl uyumu da gerekir.
function fuzzyHit(info, wants) {
  var cand = info.bag.filter(function (b) { return b.length >= 5 && !/^\d/.test(b); });
  for (var i = 0; i < wants.length; i++) {
    var ww = sigTokens(wants[i]).words.filter(function (w) { return w.length >= 5; });
    for (var j = 0; j < ww.length; j++) {
      for (var k = 0; k < cand.length; k++) {
        var a = ww[j], b = cand[k];
        if (tokEq(a, b)) return true;
        if (a.length >= 7 && b.length >= 7 && Math.abs(a.length - b.length) <= 2 && lev(a, b) <= 2) return true;
      }
    }
  }
  return false;
}

// Ünsüz iskeleti eşleşmesi (Kptn.Phlps ~ Captain Phillips). Sadece yıl TAM + süre ±%6 ise kabul edilir.
function skelMatch(info, wants) {
  var js = skel(info.joined || '');
  for (var i = 0; i < wants.length; i++) {
    var ww = sigTokens(wants[i]).words;
    if (!ww.length) continue;
    var sk = skel(ww.join(''));
    if (sk.length >= 6 && js.indexOf(sk) > -1) return true;
  }
  return false;
}

// Ses parçası bilgisinde Türkçe geçiyor mu (mail.ru meta JSON'unda ses/dil alanları)
function metaTurkishAudio(m) {
  var found = false, KEY = /audio|track|dub|voice|sound|language/i, VAL = /^(tr|tur|trk|turkish|turkce|türkçe)$/i;
  function walk(o, key, depth) {
    if (found || o === null || o === undefined || depth > 6) return;
    if (typeof o === 'string') { if (key && VAL.test(o.trim())) found = true; return; }
    if (typeof o !== 'object') return;
    Object.keys(o).forEach(function (k) {
      if (k === 'videos') return;
      walk(o[k], KEY.test(k) ? k : key, depth + 1);
    });
  }
  try { walk((m && m.raw) || (m && m.meta) || {}, '', 0); } catch (e) {}
  return found;
}

// Dil etiketi. Sadece TÜRKÇE SES kabul edilir:
//   TR / TR Dublaj / Türkçe Dublaj / TR Dual  -> ok (tier 0)
//   TR Altyazı (ses orijinal), sadece Dual, EN, RU, AR, ... -> ok değil
function langInfo(info) {
  var keys = Object.keys(info.tags).concat(info.bag);
  function any(re) { return keys.some(function (k) { return re.test(k); }); }
  var tr = any(/^tr$|^trk$|^tur$|^turk$|^turkiye$|turkce|turkish|dublaj|^trdub|^trdubl|^tr(dublaj|dublajli|dual|hd|1080p|720p)$/);
  var dual = any(/dual|^cift$/);
  var dublaj = any(/dublaj|^trdub|^dubl/);
  var sub = any(/altyaz|^sub$|^subs$|subtitle/);
  var foreign = any(/^(rus|russian|rusca|ru|ukr|ukrainian|ger|german|deu|fre|french|truefrench|vff|vfq|vf|vostfr|multi|fra|spa|spanish|ita|italian|hin|hindi|kor|korean|jpn|japanese|chi|chinese|pol|por|arabic|ar|arapca|farsi|persian)$/);
  var en = any(/^en$|^eng$|^english$|ingilizce/);
  var dubOnly = any(/^dub$/) && !foreign && !en;          // "Dub.Frekans"
  if (dubOnly) { tr = true; dublaj = true; }
  var izle = any(/^izle$/);                       // "izle", "tr izle", "izle.avi", "720pizle" ...
  if (tr && dublaj) return { label: 'TR Dublaj', tier: 0, ok: true, foreign: foreign, sub: sub, en: en };
  if (tr && dual) return { label: 'TR Dual', tier: 0, ok: true, foreign: foreign, sub: sub, en: en };
  if (tr && sub) return { label: 'TR Altyazı', tier: 5, ok: false, foreign: foreign, sub: true, en: en };
  if (tr) return { label: 'TR', tier: 0, ok: true, foreign: foreign, sub: sub, en: en };
  // "izle" etiketli (Türkçe sitelerin adlandırması) ve yabancı dil / altyazı / EN etiketi yoksa Türkçe say
  if (izle && !foreign && !sub && !en) return { label: 'TR İzle', tier: 1, ok: true, foreign: foreign, sub: sub, en: en };
  return { label: dual ? 'Dual' : sub ? 'Altyazı' : foreign ? 'Yabancı' : en ? 'EN' : '?', tier: 5, ok: false, foreign: foreign, sub: sub, en: en };
}

// Puanlama: null = ele, yoksa { score, info }
function rankItem(item, ctx) {
  if (ctx.engel && ctx.engel.some(function (e) { return sameTitle(item.title, e); })) return null;   // engelli dosya
  if (ctx.manuel && ctx.manuel.some(function (e) { return sameTitle(item.title, e); })) {          // garanti listesindeki dosya
    return { score: 999, info: analyze(item.title), lang: 'TR', tier: 0, maybe: false };
  }
  var info = analyze(item.title);
  var imdbOk = !!(info.imdb && info.imdb === ctx.imdb);
  var nameOk = nameMatch(info, ctx.wants);
  if (info.imdb && ctx.imdb && info.imdb !== ctx.imdb) {                   // başka IMDb numarası: ad + yıl TAM tutuyorsa yükleyen numarayı yanlış yazmış olabilir
    if (!(nameOk && ctx.year && info.years.indexOf(ctx.year) > -1)) return null;
  }
  var partial = false, skelOk = false;
  var tight = !!(item.dur && ctx.runtime && Math.abs(item.dur / (ctx.runtime * 60) - 1) <= 0.012);
  if (!imdbOk && !nameOk) {
    if (partialName(info, ctx.wants)) partial = true;
    else if (skelMatch(info, ctx.wants)) skelOk = true;
    else if (tight && fuzzyHit(info, ctx.wants)) partial = true;     // süre birebir + en az bir uzun kelime benzer
    else return null;
  }
  var loose = partial || skelOk;   // zayıf ad eşleşmesi: yıl + süre şart

  // Süre neredeyse birebir (±%1.2): ad dilden dile farklı yazılsa bile (Aladdin ~ Alaaddin) parmak izi olarak aday sayılır
  var score = 0;
  if (imdbOk) score += 100;
  if (nameOk) score += 20;
  if (loose) score += 10;
  if (nameOk && !info.years.length && exactTitle(info, ctx.wants)) score += 10;   // yıl yazılmamış ama ad birebir

  if (info.years.length && ctx.year) {
    var yd = 99;
    info.years.forEach(function (y) { yd = Math.min(yd, Math.abs(y - ctx.year)); });
    if (loose && yd !== 0) return null;
    if (yd === 0) score += 30;
    else if (yd === 1) score += 15;
    else if (!imdbOk) {                                                   // farklı yıl = devam filmi/başka film ...
      // ... ama ad BİREBİR, sıra numarası aynı, süre ±%20 ve yıl en fazla 8 fark ise yükleyen yılı yanlış yazmıştır
      //     (Harbi.Define.2010, Zorro.2.2008)
      var relax = nameOk && yd <= 15 &&
                  true && exactTitle(info, ctx.wants);
      if (!relax) return null;
      score += 20;
    }
    else score -= 10;
  }

  // Süre artık ELEME nedeni değil (sadece çok kısa fragman/kesitler ve puan bonusu)
  if (item.dur) {
    if (item.dur < (AYAR.MIN_SURE || 0)) return null;
    if (ctx.runtime) {
      var r = item.dur / (ctx.runtime * 60), d = Math.abs(r - 1);
      if (d <= 0.06) score += 25; else if (d <= 0.15) score += 10;
    }
  }
  var li = langInfo(info);
  if (!li.ok && item.desc) {                                           // açıklamada TR / Türkçe Dublaj yazıyorsa Türkçe say
    var li2 = langInfo(analyze(String(item.desc).slice(0, 400)));
    if (li2.ok && li2.tier === 0) li = li2;
  }
  if (/[\u0400-\u04FF]/.test(item.title) && !li.ok) return null;       // Rusça (Kiril) başlık
  if (!li.ok && ctx.trFilm && !li.foreign) li = { label: 'TR Yerli', tier: 0, ok: true };   // yerli Türk filmi: ses zaten Türkçe
  var maybe = false;
  if (!li.ok) {
    var clean = !li.foreign && !li.sub && !li.en;                        // başka dil / altyazı / EN etiketi yok
    var trNameOk = !!(ctx.trWants && ctx.trWants.length && nameMatch(info, ctx.trWants));
    var trChars = hasTrChars(item.title);
    if (clean && li.label === '?' && (trNameOk || trChars)) {
      // Etiket yok ama Türkçe adla ya da Türkçe harflerle yazılmış: Türkçe say
      // (yıl yoksa süre ±%8 içinde olmalı; başka filmle karışmasın)
      var rr = (ctx.runtime && item.dur) ? Math.abs(item.dur / (ctx.runtime * 60) - 1) : 1;
      
      li = { label: trChars ? 'TR Yazı' : 'TR Ad', tier: 1, ok: true };
    } else if (clean && (li.label === '?' || li.label === 'Dual') && (imdbOk || nameOk || tight)) {
      maybe = true;                                                      // ses parçası meta bilgisinden doğrulanacak
      li = { label: 'TR Ses', tier: 2, ok: true };
    } else return null;                                                  // EN / RU / AR / altyazılı
  }
  if (info.res >= 2160) score += 4; else if (info.res >= 1080) score += 3; else if (info.res >= 720) score += 2;

  if (score < ((nameOk || imdbOk) ? 20 : 40)) return null;
  return { score: score, info: info, lang: li.label, tier: li.tier, maybe: maybe };
}


function heightOf(key) {
  var m = String(key || '').match(/(\d{3,4})/);
  return m ? parseInt(m[1], 10) : 0;
}

function fmtDur(sec) {
  if (!sec) return '';
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return (h ? h + ':' + p(m) : m) + ':' + p(s);
}


function absUrl(u, base) {
  u = String(u || '').trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.indexOf('//') === 0) return 'https:' + u;
  var m = String(base).match(/^(https?:\/\/[^\/]+)/i);
  if (u.charAt(0) === '/') return (m ? m[1] : '') + u;
  return String(base).replace(/[?#].*$/, '').replace(/\/[^\/]*$/, '/') + u;
}
function parseHlsMaster(text, base) {
  var lines = String(text || '').split(/\r?\n/), best = {}, out = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('#EXT-X-STREAM-INF') !== 0) continue;
    var rm = lines[i].match(/RESOLUTION=(\d+)x(\d+)/), bw = parseInt((lines[i].match(/BANDWIDTH=(\d+)/) || [])[1], 10) || 0;
    var j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].charAt(0) === '#')) j++;
    if (j >= lines.length) continue;
    var h = 0;
    if (rm) {                                   // uzun kenara göre isimsel çözünürlük (1920x804 -> 1080p)
      var L = Math.max(parseInt(rm[1], 10), parseInt(rm[2], 10));
      h = L >= 3400 ? 2160 : L >= 2400 ? 1440 : L >= 1700 ? 1080 : L >= 1100 ? 720 : L >= 800 ? 480 : L >= 560 ? 360 : L >= 380 ? 240 : 144;
    }
    var key = h || ('bw' + bw);
    if (!best[key] || bw > best[key].bw) best[key] = { url: absUrl(lines[j], base), h: h, bw: bw };
  }
  Object.keys(best).forEach(function (k) { out.push(best[k]); });
  out.sort(function (a, b) { return (b.h - a.h) || (b.bw - a.bw); });
  return out;
}

function engineHeaders(u) {
  var h = pageHeaders({ 'User-Agent': UA_ENGINE, 'Referer': 'https://www.google.com/', 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' });
  if (/google\./.test(u)) h['Cookie'] = 'CONSENT=YES+cb; SOCS=CAI';
  return h;
}
function engineNorm(h) { return String(h || '').replace(/%252F/gi, '/').replace(/%2F/gi, '/').replace(/%3A/gi, ':').replace(/&amp;/g, '&').replace(/\\\//g, '/'); }
// İstekler aynı anda en fazla 4 tane gider (öncekinde ~40 istek birden gidip hepsi zaman aşımına uğruyordu)
function engineRun(queries, parse, sink, fetcher) {
  var tasks = [];
  queries.forEach(function (q, qi) {
    engineUrls(q, qi).forEach(function (u, ui) { tasks.push({ u: u, lbl: 'E' + (qi + 1) + '.' + ui }); });
  });
  var idx = 0, active = 0, deadline = Date.now() + (AYAR.MOTOR_SURE || 11000);
  return new Promise(function (resolve) {
    var fin = false;
    function pump() {
      while (active < 4 && idx < tasks.length && Date.now() < deadline) {
        (function (t) {
          active++;
          var p;
          try { p = fetcher(t.u, t.lbl); } catch (e) { p = Promise.resolve({ ok: false, text: '' }); }
          p.then(function (r) {
            var items = (r && r.ok) ? parse(r.text) : [];
            items.forEach(function (it) { sink.push(it); });
          }, function () {}).then(function () { active--; pump(); });
        })(tasks[idx++]);
      }
      if (!fin && active === 0 && (idx >= tasks.length || Date.now() >= deadline)) { fin = true; resolve(); }
    }
    pump();
  });
}


function dotted(s) { return String(s || '').replace(/[:\-–—!?,.'"’&]+/g, ' ').trim().replace(/\s+/g, '.'); }

// Film adının yanına eklenen etiketler (öncelik sırasıyla). Sitede elle yazdığın gibi: "Kelebek Etkisi 2 tr izle"
// Arama kelimelerin HEPSİNİ içeren başlıkları getirir; bu yüzden her etiket ayrı sorgu olur.
var ETIKET_ILK = ['TR', 'Türkçe Dublaj', 'izle', 'tr izle', 'Türkçe Dublaj izle'];
var ETIKET_SONRA = ['dublaj', 'TR Dual', 'HD Türkçe', 'turkce', '1080p', '720p', 'BluRay', 'BRRip', 'DVDRip', 'tek',
  'türkce dublaj izle', 'izle türkce dublaj', 'izle Türkçe Dublaj', 'Türkçe Dublaj tek parça izle',
  'türkce dublaj tek parca izle', 'tek parça izle', 'tek parca izle', 'türkce dublaj', 'turkce dublaj',
  'bölüm izle', '1080p izle', '720p izle', '480p izle', '1080pizle', '720pizle', '480pizle', 'tr dublaj izle',
  'izle.mp4', 'izle.avi', 'izle.mpv', 'TR dub', 'dual tr', 'TR-TEK', 'HD',
  'dublajli', 'tr dublajli', 'turkce dub', 'Türkçe Dub', 'TRDUB', 'TR 1080p', 'TR 720p', 'TR BluRay', 'Türkçe', 'full izle', 'tek parça'];

// Sorgular (öncelik sırasıyla; MAX_SORGU kadarı kullanılır)
function headOf(s) {                       // "Terminatör 2: Mahşer Günü" -> "Terminatör 2"
  var h = String(s || '').split(/\s*:\s*|\s+[-–—]\s+/)[0].trim();
  return h;
}
function firstWordOf(s) {                  // ilk anlamlı (5+ harf) kelime: "Terminatör"
  var w = sigTokens(plain(s)).words.filter(function (x) { return x.length >= 5; })[0];
  return w || '';
}
function titleCase(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }
function wordsOf(s) { return plain(s).replace(/[^A-Za-z0-9\s]+/g, ' ').split(/\s+/).filter(Boolean); }
// "Yapay Zeka" -> "YapayZeka" (yükleyenler kelimeleri bitişik yazar)
function glueTitle(s) {
  var w = wordsOf(s);
  return w.length >= 2 ? w.map(titleCase).join('') : '';
}
// Ünlüsüz yazım: "Altıncı His" -> "AltncHs" ; keepLast: "Banka Soygunu" -> "Bnka Sygnu"
function stripVowels(s, keepLast, joinIt) {
  var w = wordsOf(s);
  if (w.length < 2) return '';
  var out = w.map(function (x) {
    if (x.length < 3 || /^\d+$/.test(x)) return x;
    var last = keepLast && /[aeiou]$/i.test(x) ? x.slice(-1) : '';
    var body = x.slice(1, x.length - last.length).replace(/[aeiou]/gi, '');
    return x.charAt(0).toUpperCase() + body.toLowerCase() + last.toLowerCase();
  });
  return out.join(joinIt ? '' : ' ');
}

// İngilizce kelime -> yükleyenlerin sık kullandığı Türkçe yazım
var SPELL = { aladdin: 'Alaaddin', tuxedo: 'Smokin', palace: 'Saray', castle: 'Kale', island: 'Ada', ghost: 'Hayalet',
  dragon: 'Ejderha', pirates: 'Korsanlar', treasure: 'Hazine', mummy: 'Mumya', genie: 'Cin', prince: 'Prens',
  princess: 'Prenses', kingdom: 'Krallık', jungle: 'Orman', planet: 'Gezegen', mission: 'Görev', secret: 'Sır' };

function buildQueries(imdb, year, titles, trTitles) {
  var qs = [], y = year ? ' ' + year : '', dy = year ? '.' + year : '';
  var tr1 = (trTitles || [])[0] || '', tr2 = (trTitles || [])[1] || '';
  var t0 = titles[0] || '', t1 = titles[1] || '', t2 = titles[2] || '';
  var main = tr1 || t0;                                  // sitede elle aradığın ad (Türkçe varsa o)
  var names = uniq([tr1, t0].filter(Boolean));
  function add(q) { if (q) qs.push(q); }
  add(imdb);
  add(main);                                             // sadece ad: sitede "Kelebek etkisi" yazınca çıkanların hepsi
  add(main && main + y);
  add(t0 && t0 + y);
  // Yabancı baş + yıl: sitede "Terminator 2 Kıyamet Günü" gibi karışık yazılanları da getirir
  var h0 = headOf(t0), hm = headOf(main), f0 = firstWordOf(t0), fm = firstWordOf(main);
  add(h0 && h0 !== t0 && h0 + y);
  add(hm && hm !== main && plain(hm) + y);
  add(f0 && f0 !== h0 && f0 + y);
  add(fm && fm !== f0 && fm + y);
  add(h0 && h0 !== t0 && h0 + ' TR');
  ETIKET_ILK.forEach(function (tag) { names.forEach(function (n) { add(n + ' ' + tag); }); });
  // Yükleyenlerin yazım biçimleri: bitişik (YapayZeka), ünlüsüz (AltncHs / Bnka Sygnu), yükleyen işareti (tt.57556 ...)
  var noApos = main.replace(/['’`]/g, ' ').replace(/\s+/g, ' ').trim();                    // "Alaaddin'in Sarayı" -> "Alaaddin in Sarayı"
  var noSuffix = main.replace(/['’`][a-zçğıöşü]{1,4}(?=\s|$)/gi, '').replace(/\s+/g, ' ').trim();   // -> "Alaaddin Sarayı"
  if (noApos !== main) { add(noApos + y); add(noApos); }
  if (noSuffix !== main && noSuffix !== noApos) { add(noSuffix + y); add(noSuffix); }
  var gl = glueTitle(main), gl0 = glueTitle(t0);
  add(gl);
  add(gl && gl + y);
  add(gl0 && gl0 !== gl && gl0);
  add(stripVowels(main, false, true));
  add(stripVowels(main, true, false));
  (AYAR.ONEKLER || []).forEach(function (o) { add(o + ' ' + main); });
  // Ad hiç tutmasa bile yıl + Türkçe etiketle gelenler süreyle elenir (Aladdin ~ Alaaddin gibi farklı yazımlar)
  if (year) ['tr', 'TR dublaj', 'Türkçe Dublaj', 'izle'].forEach(function (t) { add(year + ' ' + t); });
  sigTokens(plain(t0)).words.filter(function (w) { return w.length >= 5 && SPELL[w]; }).slice(0, 2)
    .forEach(function (w) { add(SPELL[w] + y); });
  add(imdb && t0 && imdb + '.' + dotted(t0) + dy);
  add(t0 && dotted(t0) + dy);
  add(tr1 && plain(tr1) !== tr1 && plain(tr1) + y);      // "Zor Olum 1988"
  add(tr1 && dotted(plain(tr1)) + dy);                   // "Zor.Olum.1988"
  add(tr2 && tr2 + y);
  add(tr2 && plain(tr2) !== tr2 && plain(tr2) + y);
  add(t1 && t1 + y);
  ETIKET_SONRA.forEach(function (tag) { add(main + ' ' + tag); });
  if (tr1 && plain(tr1) !== tr1) { add(plain(tr1)); add(plain(tr1) + ' TR'); add(plain(tr1) + ' izle'); }
  (trTitles || []).slice(2, 5).forEach(function (n) { add(n + y); });
  add(t0 && t0 + ' izle');
  add(t2 && t2 + y);
  add(t0);
  return uniq(qs.map(function (q) { return String(q || '').replace(/\s+/g, ' ').trim(); }).filter(function (q) { return q.length >= 3; }))
    .slice(0, 60);
}



// ============================================================
//  NUVIO GİRİŞ NOKTASI
// ============================================================

function debugStream(msg) {
  if (!AYAR.DEBUG_MODU) return [];
  return [msg].concat(dbg.slice(0, 80)).map(function (r) {
    return { name: 'DEBUG ' + r, title: 'DEBUG ' + r, url: 'https://debug.invalid/', quality: 'Auto', provider: PROVIDER_ID };
  });
}

// VK Video'da en çok işe yarayan sorgular önce: "ad Türkçe Dublaj", "ad TR Dublaj", "ad yıl TR" ...
function buildQueriesVk(imdb, year, titles, trTitles, extra) {
  var y = year ? ' ' + year : '', front = [];
  var names = uniq([(trTitles || [])[0], (titles || [])[0], (trTitles || [])[1]].filter(Boolean));
  names.forEach(function (n) { front.push(n + ' Türkçe Dublaj'); });
  names.forEach(function (n) { front.push(n + ' TR Dublaj'); });
  names.slice(0, 2).forEach(function (n) { front.push(n + y + ' TR'); });
  names.slice(0, 2).forEach(function (n) { front.push(n + ' izle'); });
  (extra || []).forEach(function (n) { front.push(n + ' Türkçe Dublaj'); front.push(n + y); });   // TMDB'deki diğer ülke adları
  var rest = buildQueries(imdb, year, titles, trTitles);
  return uniq(front.concat(rest).map(function (q) { return String(q || '').replace(/\s+/g, ' ').trim(); })
    .filter(function (q) { return q.length >= 3; })).slice(0, AYAR.MAX_SORGU);
}

function getStreamsInner(tmdbId, mediaType, holder) {
  holder = holder || { partial: [], pu: {} };
  if (mediaType !== 'movie') return Promise.resolve([]);
  dbg = ['vkvideo v1.1.0'];
  var T0 = Date.now();
  var base = 'https://api.themoviedb.org/3/movie/' + tmdbId + '?api_key=' + TMDB_KEY;

  return Promise.all([
    getJson(base + '&language=tr-TR&append_to_response=alternative_titles,translations'),
    getJson(base + '&language=en-US').catch(function () { return {}; })
  ]).then(function (both) {
    var info = both[0], en = both[1] || {};
    var year = parseInt((info.release_date || '').slice(0, 4), 10) || 0;
    if (!info.title && !info.original_title) return debugStream('TMDB bilgisi eksik');

    var alts = [], trAlts = [];
    try {
      ((info.alternative_titles && info.alternative_titles.titles) || []).forEach(function (a) {
        if (a && a.title && /^(TR|US|GB)$/.test(a.iso_3166_1 || '')) alts.push(a.title);
        if (a && a.title && a.iso_3166_1 === 'TR') trAlts.push(a.title);
      });
    } catch (e) {}
    try {
      ((info.translations && info.translations.translations) || []).forEach(function (t) {
        if (t && t.iso_639_1 === 'tr' && t.data && t.data.title) { alts.push(t.data.title); trAlts.push(t.data.title); }
      });
    } catch (e) {}
    var titles = uniq([info.original_title, en.title, info.title]);
    var aliasTr = aliasNames([info.original_title, en.title, info.title]);   // bilinen Türkçe adlar (Zor Ölüm, Mumya...)
    var allAlt = [];                                   // TMDB'deki TÜM ülkelerin Latin harfli adları (yükleyen hangisini yazdıysa bulunsun)
    try {
      ((info.alternative_titles && info.alternative_titles.titles) || []).forEach(function (a) {
        if (a && a.title && !/[^\u0000-\u024F]/.test(a.title)) allAlt.push(a.title);
      });
    } catch (e) {}
    allAlt = uniq(allAlt);
    var wants = uniq(titles.concat(aliasTr).concat(alts.slice(0, 8)).concat(allAlt.slice(0, 14)));
    var nonTr = [norm(info.original_title), norm(en.title)];
    var trWants = uniq(aliasTr.concat([info.title]).concat(trAlts)).filter(function (t) { return t && nonTr.indexOf(norm(t)) === -1; });
    var ctx = { imdb: info.imdb_id || '', year: year, runtime: info.runtime || en.runtime || 0, wants: wants, trWants: trWants, trFilm: info.original_language === 'tr' };
    dbg.push('film ' + (info.original_title || info.title) + ' ' + year + ' ' + (ctx.imdb || '-') + ' ' + ctx.runtime + 'dk');

    var known = {};
    titles.concat(trWants).forEach(function (t) { known[norm(t)] = 1; });
    var extraQ = allAlt.filter(function (t) { return !known[norm(t)] && norm(t).length >= 4; }).slice(0, 3);
    var queries = buildQueriesVk(ctx.imdb, year, titles, trWants, extraQ);
    ctx.manuel = [];
    ctx.engel = [];
    (AYAR.ENGEL || []).forEach(function (e) {
      if (!e || !e.dosya || (e.yil && year && e.yil !== year)) return;
      if ((e.adlar || []).some(function (a) { return wants.some(function (w) { return norm(w) === norm(a); }); })) ctx.engel.push(norm(e.dosya));
    });
    var direkt = [], manuelQs = [];
    (AYAR.MANUEL || []).forEach(function (e) {
      if (!e || !e.dosya || (e.yil && year && e.yil !== year)) return;
      var hit = (e.adlar || []).some(function (a) { return wants.some(function (w) { return norm(w) === norm(a); }); });
      if (!hit && !(e.tmdb && String(e.tmdb) === String(tmdbId))) return;
      ctx.manuel.push(norm(e.dosya));
      if (e.id) direkt.push({ id: String(e.id), title: e.dosya });      // numarası belli: arama yapmadan doğrudan ekle
      else manuelQs.push(e.dosya);
    });
    if (manuelQs.length) queries = uniq(manuelQs.concat(queries));

    var groups = {}, engSink = [];
    var sinks = queries.map(function () { return []; });
    var jobs = queries.map(function (q, i) { return searchVk(q, AYAR.SORGU_SAYFA, sinks[i], groups); });
    if (AYAR.ARAMA_MOTORU) jobs.push(engineRun(engineQueries('vkvideo.ru', titles, trWants, year), parseEngine, engSink, engineFetch));
    var scanned = {};
    channelOwners(AYAR.KANALLAR).forEach(function (o) {            // elle yazılan kanallar: her aramada taranır, Türkçe kabul edilir
      scanned[o] = 1;
      var cs = [];
      sinks.push(cs);
      jobs.push(scanChannel(o, cs, true));
    });

    return waitWithin(jobs, AYAR.ARAMA_SURESI).then(function () {
      var seen = {}, all = [];
      sinks.forEach(function (l) {
        l.forEach(function (it) { var b = baseKey(it.id); if (!seen[b]) { seen[b] = 1; all.push(it); } });
      });
      direkt.forEach(function (d) {                                      // garanti listesindeki doğrudan videolar (en başa)
        var b = baseKey(d.id);
        if (seen[b]) { all.forEach(function (it) { if (baseKey(it.id) === b) it.title = d.title; }); return; }
        seen[b] = 1;
        all.unshift({ path: '/video/' + d.id, id: d.id, owner: '', title: d.title, dur: 0, desc: '', guvenilir: false });
      });
      dbg.push('sonuc ' + all.length + ' ' + (Date.now() - T0) + 'ms; kanal ' + Object.keys(groups).length);
      if (AYAR.DEBUG_MODU) queries.slice(0, 10).forEach(function (q, i) { dbg.push('q' + (i + 1) + ' [' + sinks[i].length + '] ' + q); });

      var ranked = [], rejected = 0;
      function rankAll() {
        ranked = []; rejected = 0;
        all.forEach(function (it) {
          var r = rankItem(it, ctx);
          if (r && it.guvenilir) { r.maybe = false; r.lang = 'TR'; r.tier = Math.min(r.tier, 1); }   // elle yazılan kanalların yüklemeleri Türkçe kabul
          if (r) ranked.push({ item: it, r: r });
          else {
            rejected++;
            if (AYAR.DEBUG_MODU && dbg.length < 90 && (rejected <= 4 || fuzzyHit(analyze(it.title), ctx.wants))) dbg.push('red ' + it.title.slice(0, 40) + ' ' + fmtDur(it.dur));
          }
        });
        ranked.sort(function (a, b) { return (a.r.tier - b.r.tier) || (b.r.score - a.r.score); });
      }
      rankAll();
      dbg.push('aday ' + ranked.length);

      // Arama motorlarından gelen VK numaralarını VK API'den doğrula (gerçek başlık + süre), 10'arlı toplu istek
      function motorDogrula() {
        var cands = [], sn = {};
        engSink.forEach(function (it) { var b = it.key; if (!seen[b] && !sn[b]) { sn[b] = 1; cands.push(it); } });
        dbg.push('motor aday ' + cands.length);
        if (!cands.length) return Promise.resolve();
        var lim = cands.slice(0, AYAR.MOTOR_ADAY || 20), chunks = [], i;
        for (i = 0; i < lim.length; i += 10) chunks.push(lim.slice(i, i + 10));
        return waitWithin(chunks.map(function (ch) {
          return api('video.getByIds', { videos: ch.map(function (c) { return c.vid; }).join(',') }, false).then(function (r) {
            var acc = newAcc();
            collectVideos(r, acc);
            acc.list.forEach(function (o) {
              var it = toItem(o, false), b = baseKey(it.id);
              if (!seen[b]) { seen[b] = 1; all.push(it); }
            });
          }, function (e) { dbg.push('motor dogrulama ' + ((e && e.message) || '')); });
        }), 4500).then(function () { rankAll(); dbg.push('motor sonrasi aday ' + ranked.length); });
      }

      // Kanallar / topluluklar: Türkçe dublaj bulunan kanallar + adı film/dublaj/izle olan kanallar -> tüm video listeleri taranır
      function kanalGenislet() {
        if (!AYAR.KANAL_ARA) return Promise.resolve();
        var owners = [], on = {}, rx = null;
        try { rx = new RegExp(AYAR.KANAL_ADI); } catch (e) {}
        function addO(o) {
          o = String(o || '');
          if (!/^-\d+$/.test(o) || on[o] || scanned[o]) return;
          on[o] = 1; owners.push(o);
        }
        ranked.filter(function (x) { return x.r.tier <= 1 && !x.r.maybe; }).slice(0, 6).forEach(function (x) { addO(x.item.owner); });
        if (rx) Object.keys(groups).forEach(function (gid) { if (rx.test(asciiLower(groups[gid]))) addO('-' + gid); });
        owners = owners.slice(0, AYAR.MAX_KANAL || 4);
        if (!owners.length) return Promise.resolve();
        var sk = [];
        return waitWithin(owners.map(function (o) { return scanChannel(o, sk, false); }), AYAR.KANAL_SURESI || 4000).then(function () {
          var add = 0;
          sk.forEach(function (it) { var b = baseKey(it.id); if (!seen[b]) { seen[b] = 1; all.push(it); add++; } });
          dbg.push('kanal tarama ' + owners.length + ' +' + add);
          if (add) rankAll();
        });
      }

      // Hiçbir aday adla eşleşmediyse: süre parmak izi (Türkçe dublaj etiketli, süresi TMDB ile ±%1.2 tutan TEK video)
      function sureParmakIzi() {
        if (!AYAR.SURE_PARMAK_IZ || !ctx.runtime) return;
        if (ranked.some(function (x) { return !x.r.maybe; })) return;
        var have = {};
        ranked.forEach(function (x) { have[x.item.id] = 1; });
        var cands = all.filter(function (it) {
          if (have[it.id] || !it.dur || it.dur < (AYAR.MIN_SURE || 0)) return false;
          if (Math.abs(it.dur / (ctx.runtime * 60) - 1) > 0.012) return false;
          if (/[\u0400-\u04FF]/.test(it.title)) return false;
          var inf = analyze(it.title), li = langInfo(inf);
          if (!(li.ok && li.tier === 0)) return false;
          if (inf.imdb && ctx.imdb && inf.imdb !== ctx.imdb) return false;
          if (inf.years.length && ctx.year && !inf.years.some(function (y) { return Math.abs(y - ctx.year) <= 1; })) return false;
          return true;
        });
        dbg.push('sure parmak izi aday ' + cands.length);
        if (cands.length === 1) ranked.push({ item: cands[0], r: { score: 35, info: analyze(cands[0].title), lang: 'TR Süre', tier: 1, maybe: false } });
      }

      return motorDogrula().then(kanalGenislet).then(function () {
        sureParmakIzi();
        if (!ranked.length) return debugStream('uygun video yok: ' + (info.title || info.original_title) + ' ' + year);

        var sure = ranked.filter(function (x) { return !x.r.maybe; }).slice(0, AYAR.MAX_ADAY);
        var unsure = AYAR.BELIRSIZ_GOSTER ? ranked.filter(function (x) { return x.r.maybe; }).slice(0, AYAR.MAX_BELIRSIZ) : [];
        var top = sure.concat(unsure);
        var res = top.map(function () { return null; }), hjobs = [];
        var ljobs = top.map(function (x, i) {
          return getPlay(x.item).then(function (links) { return verifyItem(x.item, links); }).then(function (pl) {
            res[i] = pl;
            if (!x.r.maybe && !pl.mp4Dead) {                            // ilk hazır kaynaklar: süre dolarsa en azından bunlar verilsin
              try {
                makeStreams(x.item, x.r, pl).forEach(function (s) { if (!holder.pu[s.url]) { holder.pu[s.url] = 1; holder.partial.push(s); } });
              } catch (e) {}
            }
            var hl = null;
            pl.links.forEach(function (l) { if (!hl && isHlsLink(l)) hl = l; });
            if (hl) hjobs.push(expandHls(hl.url, pl.headers).then(function (v) { pl.hlsVars = v; }, noop));
          }, function (e) { dbg.push('play hata ' + x.item.id + ' ' + ((e && e.message) || '')); });
        });
        return waitWithin(ljobs, AYAR.KAYNAK_SURESI).then(function () {
          return waitWithin(hjobs, 1800);                               // HLS çözünürlük listesi için kısa ek bekleme
        }).then(function () {
          var streams = [], dead = [], seenUrl = {};
          top.forEach(function (x, i) {
            var pl = res[i];
            if (!pl || !pl.links.length) { dbg.push('baglanti yok ' + x.item.id); return; }
            if (x.r.maybe) { x.r.lang = 'Dil ?'; x.r.tier = 3; }
            makeStreams(x.item, x.r, pl).forEach(function (s) {
              if (seenUrl[s.url]) return;
              seenUrl[s.url] = 1;
              (s._dead ? dead : streams).push(s);
            });
          });
          if (!streams.length) streams = dead;                          // hepsi test edilemediyse / ölüyse yine de göster (etiketli)
          streams.forEach(function (s) { delete s._dead; });
          dbg.push('bitti ' + (Date.now() - T0) + 'ms');
          if (!streams.length) return debugStream('baglanti cikmadi');
          return streams;
        });
      });
    });
  }).catch(function (e) { return holder.partial.length ? holder.partial : debugStream('hata ' + (e && e.message)); });
}

function getStreams(tmdbId, mediaType, season, episode) {
  var holder = { partial: [], pu: {} }, done = false;
  return new Promise(function (resolve) {
    var tmr = setTimeout(function () {
      fin(holder.partial.length ? holder.partial : debugStream('zaman asimi'));
    }, AYAR.GENEL_SURE);
    function fin(v) {
      if (done) return;
      done = true; clearTimeout(tmr);
      resolve(v || []);
    }
    getStreamsInner(tmdbId, mediaType, holder).then(fin, function (e) {
      fin(holder.partial.length ? holder.partial : debugStream('hata ' + (e && e.message)));
    });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams, _t: { rankItem: rankItem, analyze: analyze, langInfo: langInfo, buildQueries: buildQueries, buildQueriesVk: buildQueriesVk, parseEngine: parseEngine, engineQueries: engineQueries, makeStreams: makeStreams, collectVideos: collectVideos, findCursor: findCursor, channelOwners: channelOwners } };
} else {
  global.getStreams = getStreams;
}
