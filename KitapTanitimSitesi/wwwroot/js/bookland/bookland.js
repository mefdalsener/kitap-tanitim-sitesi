const btnKitaplar = document.getElementById("btn-kitaplar");
const btnYazarlar = document.getElementById("btn-yazarlar");
const viewKitaplar = document.getElementById("view-kitaplar");
const viewYazarlar = document.getElementById("view-yazarlar");
const btnPuanlarim = document.getElementById("btn-puanlarim");
const viewPuanlarim = document.getElementById("view-puanlarim");

const tumKitaplar = JSON.parse(
    document.getElementById("tum-kitaplar-data").textContent,
);
const kitapMap = {};
tumKitaplar.forEach((k) => (kitapMap[k.id] = k));

const tumYazarlar = JSON.parse(
    document.getElementById("tum-yazarlar-data").textContent,
);
const yazarMap = {};
tumYazarlar.forEach((y) => (yazarMap[y.id] = y));

// --- SAYFALAMA ---
// Filtreleme (checkbox'lar, arama, puan, sayfa aralığı) her zaman
// tumKitaplar'ın tamamı üzerinden çalışır; sonuç guncelFiltrelenmisKitaplar'da
// tutulur ve ekrana sadece o an seçili sayfaya denk gelen SAYFA_BOYUTU
// kadarlık dilim basılır.
const SAYFA_BOYUTU = 25;
let mevcutSayfa = 1;
let guncelFiltrelenmisKitaplar = [];

// Giriş yapmış kullanıcının önceden verdiği puanlar: { bookId: puan }.
// Popup açıldığında yıldızları doğru boyamak, yeni puan verildiğinde de
// burayı güncel tutmak için kullanılır (sayfa yenilenmeden).
const kullaniciPuanlari = JSON.parse(
    document.getElementById("kullanici-puanlari-data").textContent,
);

// Giriş yapmış kullanıcının adı (yorum gönderince kartı anında listeye
// eklemek için kullanılır); giriş yapılmadıysa null gelir.
const mevcutKullaniciAdi = JSON.parse(
    document.getElementById("mevcut-kullanici-adi-data").textContent,
);

// ---- YENİ (Faz Ekstra 2.4) ----
// Giriş yapmış kullanıcının, admin tarafından silinmiş yorumlarının ait
// olduğu kitap ID'leri. "Puanlarım" kartlarında/popup'ında "silindi"
// rozetini göstermek ve düzenleme/kaldırmayı engellemek için kullanılır.
const silinenYorumKitapIdleri = new Set(
    JSON.parse(document.getElementById("kullanici-silinen-yorum-kitap-idleri-data")?.textContent || "[]"),
);

// --- URL / QUERY STRING DURUM YÖNETİMİ ---
// Tüm filtreler, arama, aktif görünüm ve açık popup'lar URL'nin query
// string'inde tutulur. Böylece adres çubuğundaki her durum paylaşılabilir
// bir bağlantıdır ve tarayıcının geri/ileri tuşları beklendiği gibi çalışır.
function urlParametreleriOku() {
    return new URLSearchParams(window.location.search);
}

// degisiklikler: { anahtar: deger|null } — deger null/undefined/"" ise
// parametre URL'den tamamen silinir (URL'yi olabildiğince sade tutmak için).
// push=true -> history.pushState (geri tuşuyla geri dönülebilir bir adım)
// push=false -> history.replaceState (mevcut adımı günceller, yeni adım eklemez)
function urlGuncelle(degisiklikler, opts) {
    const push = !opts || opts.push !== false;
    const params = urlParametreleriOku();
    Object.keys(degisiklikler).forEach((anahtar) => {
        const deger = degisiklikler[anahtar];
        if (deger === null || deger === undefined || deger === "") {
            params.delete(anahtar);
        } else {
            params.set(anahtar, deger);
        }
    });
    const sorguMetni = params.toString();
    const yeniUrl = window.location.pathname + (sorguMetni ? "?" + sorguMetni : "");
    if (push) {
        history.pushState({}, "", yeniUrl);
    } else {
        history.replaceState({}, "", yeniUrl);
    }
}

function goruntuDegistir(hedef, push) {
    const gecerliHedef =
        hedef === "yazarlar" || hedef === "puanlarim" ? hedef : "kitaplar";

    viewKitaplar.classList.toggle("active", gecerliHedef === "kitaplar");
    viewYazarlar.classList.toggle("active", gecerliHedef === "yazarlar");
    if (viewPuanlarim) {
        viewPuanlarim.classList.toggle("active", gecerliHedef === "puanlarim");
    }

    btnKitaplar.classList.toggle("active", gecerliHedef === "kitaplar");
    btnYazarlar.classList.toggle("active", gecerliHedef === "yazarlar");
    if (btnPuanlarim) {
        btnPuanlarim.classList.toggle("active", gecerliHedef === "puanlarim");
    }

    if (gecerliHedef === "puanlarim") {
        puanlarimRenderEt();
    }

    if (push !== false) {
        urlGuncelle({ view: gecerliHedef === "kitaplar" ? null : gecerliHedef });
    }
}

btnKitaplar.addEventListener("click", () => goruntuDegistir("kitaplar"));
btnYazarlar.addEventListener("click", () => goruntuDegistir("yazarlar"));
if (btnPuanlarim) {
    btnPuanlarim.addEventListener("click", () => goruntuDegistir("puanlarim"));
}

// --- Popup yıldız gösterimi (salt-okunur, ortalamaya göre kısmi dolum) ---
const popupPuanKapsayici = document.getElementById("popup-puan");
let secilenPuanFiltresi = null; // Sol menüdeki "Puan" filtresinde seçili eşik (1-4, "N ve üzeri") veya null

// Yıldız kutularından seçili olanı vurgular (tek seçimli).
function puanFiltresiKutulariniGuncelle() {
    const kapsayici = document.getElementById("puan-secenekler");
    if (!kapsayici) return;
    kapsayici.querySelectorAll(".puan-secenek").forEach((kutu) => {
        const deger = Number(kutu.dataset.puan);
        kutu.classList.toggle("secili", deger === secilenPuanFiltresi);
    });
}

// Bir kutuya tıklanınca: zaten seçiliyse kaldırılır (toggle), değilse seçilir.
function puanFiltresiSec(deger) {
    secilenPuanFiltresi = secilenPuanFiltresi === deger ? null : deger;
    puanFiltresiKutulariniGuncelle();
    filtreUygula();
    urlGuncelle({ puan: secilenPuanFiltresi || null });
}

// "N★ ve üzeri": kitabın ortalama puanı seçilen eşik değerinden büyük ya da eşit olmalı.
function kitapPuanFiltresineUyuyorMu(kitap) {
    if (!secilenPuanFiltresi) return true;
    if (kitap.puanOrtalama == null || !kitap.oySayisi) return false;
    return kitap.puanOrtalama >= secilenPuanFiltresi;
}

// Yayınevinin altındaki yıldızlar artık tıklanamaz; sadece kitabın ortalama
// puanını kısmi (yüzdesel) dolulukla gösteren salt-okunur bir rozet. Gerçek
// puanlama/yorum yazma Yorumlar sekmesindeki ayrı yıldız seçiciyle yapılıyor.
// N'inci yıldızın dolum oranı: clamp(ortalama - (N-1), 0, 1) * 100.
// Örn. ortalama 3.5 ise: 1-2-3. yıldız %100, 4. yıldız %50, 5. yıldız %0.
function popupOrtalamaYildizlariBoya(ortalama) {
    if (!popupPuanKapsayici) return;
    const puan = Number(ortalama) || 0;

    popupPuanKapsayici.querySelectorAll(".popup-yildiz").forEach((yildizWrap) => {
        const basamak = Number(yildizWrap.dataset.yildiz);
        const doluOran = Math.max(0, Math.min(1, puan - (basamak - 1))) * 100;
        const dolum = yildizWrap.querySelector(".popup-yildiz-dolum");
        if (dolum) dolum.style.width = doluOran + "%";
    });
}

// --- Kullanıcı adı dropdown'ı (Çıkış Yap) ---
// Not: Bu sayfa _Layout.cshtml kullanmıyor ve Bootstrap JS dahil değil,
// bu yüzden dropdown açma/kapama sitenin geri kalanıyla tutarlı şekilde
// vanilla JS ile (popup'larda kullanılan "aktif" class deseninin
// benzeri olarak "acik" class'ı ile) yapılıyor.
const kullaniciDropdown = document.getElementById("kullanici-dropdown");
if (kullaniciDropdown) {
    const kullaniciToggle = document.getElementById("kullanici-toggle");

    kullaniciToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        kullaniciDropdown.classList.toggle("acik");
    });

    // Menü dışına tıklanınca kapat
    document.addEventListener("click", (e) => {
        if (!kullaniciDropdown.contains(e.target)) {
            kullaniciDropdown.classList.remove("acik");
        }
    });

    // Esc tuşuyla kapat
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            kullaniciDropdown.classList.remove("acik");
        }
    });
}

// ---- YENİ (Faz Ekstra 2.4): Bildirim (çan) dropdown'ı — kullanici-dropdown
// ile aynı vanilla-JS "acik" class deseni tekrar kullanıldı. ----
const bildirimDropdown = document.getElementById("bildirim-dropdown");
if (bildirimDropdown) {
    const bildirimToggle = document.getElementById("bildirim-toggle");

    bildirimToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        bildirimDropdown.classList.toggle("acik");
    });

    document.addEventListener("click", (e) => {
        if (!bildirimDropdown.contains(e.target)) {
            bildirimDropdown.classList.remove("acik");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            bildirimDropdown.classList.remove("acik");
        }
    });

    bildirimlerYukle();
}

// Bildirim listesini backend'den çeker (seen/unseen takibi yok — her açılışta
// kullanıcının TÜM silinmiş yorumları listelenir, rozet sayısı = toplam sayı).
async function bildirimlerYukle() {
    const liste = document.getElementById("bildirim-liste");
    const rozet = document.getElementById("bildirim-rozet");
    if (!liste) return;

    try {
        const yanit = await fetch("/Bookland/GetBildirimler");
        if (!yanit.ok) {
            liste.innerHTML = '<div class="bildirim-bos">Bildirimler yüklenemedi.</div>';
            return;
        }

        const sonuc = await yanit.json();
        const bildirimler = Array.isArray(sonuc.bildirimler) ? sonuc.bildirimler : [];

        if (bildirimler.length === 0) {
            liste.innerHTML = '<div class="bildirim-bos">Henüz bir bildirimin yok.</div>';
            if (rozet) rozet.style.display = "none";
            return;
        }

        if (rozet) {
            rozet.textContent = bildirimler.length;
            rozet.style.display = "inline-flex";
        }

        liste.innerHTML = "";
        bildirimler.forEach((b) => {
            const oge = document.createElement("div");
            oge.className = "bildirim-ogesi";
            const tarih = b.deletedAt ? new Date(b.deletedAt).toLocaleDateString("tr-TR") : "";
            oge.innerHTML = `
				<i class="fa-solid fa-triangle-exclamation bildirim-ikon"></i>
				<div class="bildirim-metin">
					<strong>${b.bookName || "Bir kitap"}</strong> için yaptığın yorum topluluk kurallarına uymadığı için silinmiştir.
					<span class="bildirim-tarih">${tarih}</span>
				</div>`;
            liste.appendChild(oge);
        });
    } catch (hata) {
        liste.innerHTML = '<div class="bildirim-bos">Bildirimler yüklenemedi.</div>';
    }
}

// ---- YENİ (Faz Ekstra 2.4): Genel talep/şikayet modalı (zarf ikonu) ----
function talepModalAc() {
    document.getElementById("talep-metin-alani").value = "";
    const uyari = document.getElementById("talep-uyari");
    uyari.textContent = "";
    uyari.classList.remove("basarili");
    document.getElementById("talep-modal-overlay").classList.add("aktif");
    document.body.style.overflow = "hidden";
}

function talepModalKapat() {
    document.getElementById("talep-modal-overlay").classList.remove("aktif");
    document.body.style.overflow = "";
}

async function talepGonder() {
    const metinAlani = document.getElementById("talep-metin-alani");
    const uyari = document.getElementById("talep-uyari");
    const btn = document.getElementById("talep-gonder-btn");
    const metin = metinAlani.value.trim();

    if (!metin) {
        uyari.textContent = "Mesajını yazmalısın.";
        return;
    }

    uyari.textContent = "";
    btn.disabled = true;

    try {
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");

        const yanit = await fetch("/Bookland/TalepOlustur", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken || "" },
            body: JSON.stringify({ mesaj: metin }),
        });

        if (!yanit.ok) {
            uyari.textContent = "Gönderilemedi, tekrar dene.";
            return;
        }

        talepModalKapat();
        toastGoster("Talebin alındı, teşekkürler!");
    } catch (hata) {
        uyari.textContent = "Gönderilemedi, tekrar dene.";
    } finally {
        btn.disabled = false;
    }
}

// ---- YENİ (Faz Ekstra 2.4): Yorum şikayet modalı ----
let sikayetHedefRatingId = null;

function sikayetModalAc(ratingId) {
    sikayetHedefRatingId = ratingId;
    document.getElementById("sikayet-metin-alani").value = "";
    document.getElementById("sikayet-uyari").textContent = "";
    document.getElementById("sikayet-modal-overlay").classList.add("aktif");
    document.body.style.overflow = "hidden";
}

function sikayetModalKapat() {
    document.getElementById("sikayet-modal-overlay").classList.remove("aktif");
    document.body.style.overflow = "";
    sikayetHedefRatingId = null;
}

async function sikayetGonder() {
    if (!sikayetHedefRatingId) return;

    const metinAlani = document.getElementById("sikayet-metin-alani");
    const uyari = document.getElementById("sikayet-uyari");
    const btn = document.getElementById("sikayet-gonder-btn");
    const metin = metinAlani.value.trim();

    if (!metin) {
        uyari.textContent = "Şikayet nedenini yazmalısın.";
        return;
    }

    uyari.textContent = "";
    btn.disabled = true;

    try {
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");

        const yanit = await fetch("/Bookland/SikayetEt", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRF-TOKEN": csrfToken || "" },
            body: JSON.stringify({ ratingId: sikayetHedefRatingId, mesaj: metin }),
        });

        if (!yanit.ok) {
            uyari.textContent = "Gönderilemedi, tekrar dene.";
            return;
        }

        sikayetModalKapat();
        toastGoster("Şikayetin alındı, teşekkürler!");
    } catch (hata) {
        uyari.textContent = "Gönderilemedi, tekrar dene.";
    } finally {
        btn.disabled = false;
    }
}

// ---- YENİ (Faz Ekstra 2.4): Basit toast bildirimi ----
let toastZamanlayici = null;
function toastGoster(mesaj) {
    const toast = document.getElementById("toast-bildirim");
    if (!toast) return;
    toast.textContent = mesaj;
    toast.classList.add("goster");
    clearTimeout(toastZamanlayici);
    toastZamanlayici = setTimeout(() => toast.classList.remove("goster"), 3000);
}

function toggleFilter(ad) {
    const items = document.querySelectorAll(".filter-item");
    items.forEach((item) => {
        if (item.id === "filter-" + ad) {
            item.classList.toggle("open");
        } else {
            item.classList.remove("open");
        }
    });
}

function aramaYap(filtre, aramaMetni) {
    const liste = document.getElementById("list-" + filtre);
    const secenekler = liste.querySelectorAll(".filter-option");
    secenekler.forEach((s) => {
        const metin = s.textContent.toLowerCase();
        const eslesiyor = metin.includes(aramaMetni.toLowerCase());
        s.classList.toggle("arama-gizli", !eslesiyor);
    });
}

function sayfaTrackGuncelle() {
    const rangeMin = document.getElementById("range-min");
    const rangeMax = document.getElementById("range-max");
    const aktifTrack = document.getElementById("range-track-active");
    if (!rangeMin || !rangeMax || !aktifTrack) return;

    const min = parseFloat(rangeMin.min);
    const max = parseFloat(rangeMin.max);
    const minYuzde = ((parseFloat(rangeMin.value) - min) / (max - min)) * 100;
    const maxYuzde = ((parseFloat(rangeMax.value) - min) / (max - min)) * 100;

    aktifTrack.style.left = minYuzde + "%";
    aktifTrack.style.right = (100 - maxYuzde) + "%";
}

function rangeGuncelle() {
    const min = parseInt(document.getElementById("range-min").value);
    const max = parseInt(document.getElementById("range-max").value);

    if (min > max) document.getElementById("range-min").value = max;
    if (max < min) document.getElementById("range-max").value = min;

    document.getElementById("range-min-label").textContent =
        document.getElementById("range-min").value;
    document.getElementById("range-max-label").textContent =
        document.getElementById("range-max").value;

    sayfaTrackGuncelle();
    filtreUygula();
}

function seciliDegerleriAl(filtreAdi) {
    const liste = document.getElementById("list-" + filtreAdi);
    const secili = liste.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(secili).map((cb) => parseInt(cb.value));
}

function diziKesisiyorMu(kitapDizisi, seciliDizi) {
    // Filtre seçilmemişse (dizi boşsa) bu kritere göre eleme yapma
    if (seciliDizi.length === 0) return true;
    if (!kitapDizisi) return false;
    return kitapDizisi.some((id) => seciliDizi.includes(id));
}

function diziKapsiyorMu(kitapDizisi, seciliDizi) {
    // Filtre seçilmemişse (dizi boşsa) bu kritere göre eleme yapma
    if (seciliDizi.length === 0) return true;
    if (!kitapDizisi) return false;
    // Kitap, seçilen TÜM id'leri içermeli (AND mantığı)
    return seciliDizi.every((id) => kitapDizisi.includes(id));
}

// Kitap kapağının sağ üstündeki puan rozetinin HTML'i. Hem kart ilk
// oluşturulurken hem de puan verildikten sonra rozet güncellenirken
// (bkz. puanRozetiniGuncelle) kullanılır, böylece ikisi hep tutarlı kalır.
function puanRozetiHtmlOlustur(kitap) {
    const oySayisi = kitap.oySayisi || 0;
    return oySayisi > 0
        ? `<div class="kitap-puan-rozeti">
			<i class="fa-solid fa-star"></i>
			<span>${Number(kitap.puanOrtalama).toFixed(1)}</span>
		</div>`
        : "";
}

// Popup'ta yeni puan verildiğinde, ızgaradaki kartı yeniden render etmeden
// sadece o kitabın kapak rozetini günceller (varsa değiştirir, yoksa ekler).
function puanRozetiniGuncelle(kitapId, kitap) {
    const kart = document.querySelector(`.book-card[data-kitap-id="${kitapId}"]`);
    if (!kart) return;
    const kapak = kart.querySelector(".book-cover");
    if (!kapak) return;
    const eskiRozet = kapak.querySelector(".kitap-puan-rozeti");
    if (eskiRozet) eskiRozet.remove();
    kapak.insertAdjacentHTML("beforeend", puanRozetiHtmlOlustur(kitap));
}

function kitapKartOlustur(kitap) {
    const kart = document.createElement("div");
    kart.className = "book-card";
    kart.dataset.kitapId = kitap.id;
    kart.style.cursor = "pointer";
    kart.addEventListener("click", () => popupAc(kitap));

    const kapakHtml = kitap.kapak
        ? `<img src="${kitap.kapak}" alt="${kitap.ad}" />`
        : "";

    const puanRozetiHtml = puanRozetiHtmlOlustur(kitap);

    kart.innerHTML = `
		<div class="book-cover">${kapakHtml}${puanRozetiHtml}</div>
		<div class="book-information">
		<p class="book-title">${kitap.ad}</p>
		<p class="book-author">${kitap.yazar}</p>
		<p class="book-publisher">${kitap.yayinevi}</p>
		</div>`;

    return kart;
}

function kitaplariRenderEt(liste) {
    const grid = document.getElementById("book-grid");
    grid.innerHTML = "";
    liste.forEach((kitap) => grid.appendChild(kitapKartOlustur(kitap)));
}

// Bir filtre checkbox'ı değiştiğinde: listeyi filtrele ve seçili durumu
// URL'ye yaz (her checkbox değişikliği geri tuşuyla geri alınabilir bir adım olsun).
function filtreDegisti() {
    filtreUygula();
    urlGuncelle({
        yazar: seciliDegerleriAl("yazar").join(",") || null,
        yayinevi: seciliDegerleriAl("yayinevi").join(",") || null,
        cevirmen: seciliDegerleriAl("cevirmen").join(",") || null,
        tur: seciliDegerleriAl("tur").join(",") || null,
        seri: seciliDegerleriAl("seri").join(",") || null,
    });
}

// Sayfa sayısı slider'ı bırakıldığında (sürüklenirken değil) URL'ye yazılır;
// aksi halde her piksel kaydırma geçmişe ayrı bir adım eklerdi.
function rangeDurumunuURLyeYaz() {
    const rangeMin = document.getElementById("range-min");
    const rangeMax = document.getElementById("range-max");
    urlGuncelle({
        sayfaMin: rangeMin.value !== rangeMin.min ? rangeMin.value : null,
        sayfaMax: rangeMax.value !== rangeMax.max ? rangeMax.value : null,
    });
}

function filtreUygula(sayfaSifirla = true) {
    const yazarSecili = seciliDegerleriAl("yazar");
    const yayineviSecili = seciliDegerleriAl("yayinevi");
    const cevirmenSecili = seciliDegerleriAl("cevirmen");
    const turSecili = seciliDegerleriAl("tur");
    const seriSecili = seciliDegerleriAl("seri");

    const sayfaMin = parseInt(document.getElementById("range-min").value);
    const sayfaMax = parseInt(document.getElementById("range-max").value);

    // Arama kutusu artık DOM'da kart gizleyerek değil, diğer filtrelerle
    // aynı array.filter() adımında çalışıyor — böylece sayfalanmış bir
    // sonuç üzerinde bile arama tüm 500 kitabı kapsamaya devam ediyor.
    const aramaInput = document.getElementById("kitap-arama-input");
    const aramaSorgusu = aramaInput ? normalizeMetin(aramaInput.value) : "";

    let filtrelenmis = tumKitaplar.filter((kitap) => {
        if (!diziKesisiyorMu(kitap.yazarIds, yazarSecili)) return false;
        if (!diziKesisiyorMu(kitap.yayineviIds, yayineviSecili)) return false;
        if (!diziKesisiyorMu(kitap.cevirmenIds, cevirmenSecili)) return false;
        if (!diziKapsiyorMu(kitap.turIds, turSecili)) return false;

        if (seriSecili.length > 0) {
            if (!kitap.seriesId || !seriSecili.includes(kitap.seriesId)) return false;
        }

        if (kitap.sayfaSayilari && kitap.sayfaSayilari.length > 0) {
            const araligaGiren = kitap.sayfaSayilari.some(
                (s) => s >= sayfaMin && s <= sayfaMax,
            );
            if (!araligaGiren) return false;
        }

        if (!kitapPuanFiltresineUyuyorMu(kitap)) return false;

        if (aramaSorgusu && !normalizeMetin(kitap.ad).includes(aramaSorgusu)) {
            return false;
        }

        return true;
    });

    if (seriSecili.length > 0) {
        filtrelenmis.sort((a, b) => {
            const seriKarsilastirma = (a.seriesId ?? 0) - (b.seriesId ?? 0);
            if (seriKarsilastirma !== 0) return seriKarsilastirma;
            return (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0);
        });
    } else {
        filtrelenmis.sort((a, b) => a.ad.localeCompare(b.ad, "tr-TR"));
    }

    guncelFiltrelenmisKitaplar = filtrelenmis;
    if (sayfaSifirla) mevcutSayfa = 1;

    sayfayiRenderEt();
    filtreSecenekleriniGuncelle();
    filtreEtiketleriniGuncelle();
}

function sayfayiRenderEt() {
    const toplamKitap = guncelFiltrelenmisKitaplar.length;
    const toplamSayfa = Math.max(1, Math.ceil(toplamKitap / SAYFA_BOYUTU));
    if (mevcutSayfa > toplamSayfa) mevcutSayfa = toplamSayfa;

    const baslangic = (mevcutSayfa - 1) * SAYFA_BOYUTU;
    const sayfaKitaplari = guncelFiltrelenmisKitaplar.slice(
        baslangic,
        baslangic + SAYFA_BOYUTU,
    );

    kitaplariRenderEt(sayfaKitaplari);
    sayfalamaRenderEt(toplamSayfa);

    if (toplamKitap === 0) {
        aramaBosDurumGoster();
    } else {
        aramaBosDurumGizle();
    }
}

function sayfayaGit(hedefSayfa) {
    const toplamSayfa = Math.max(
        1,
        Math.ceil(guncelFiltrelenmisKitaplar.length / SAYFA_BOYUTU),
    );
    const yeniSayfa = Math.min(Math.max(1, hedefSayfa), toplamSayfa);
    if (yeniSayfa === mevcutSayfa) return;

    mevcutSayfa = yeniSayfa;
    sayfayiRenderEt();
    urlGuncelle({ sayfa: mevcutSayfa > 1 ? mevcutSayfa : null });
    document.getElementById("book-grid").scrollIntoView({ behavior: "smooth", block: "start" });
}

// << ilk sayfa, < önceki, [numaralar], > sonraki, >> son sayfa
function sayfalamaRenderEt(toplamSayfa) {
    const kapsayici = document.getElementById("sayfalama");
    if (!kapsayici) return;
    kapsayici.innerHTML = "";

    if (toplamSayfa <= 1) {
        kapsayici.classList.remove("gorunur");
        return;
    }
    kapsayici.classList.add("gorunur");

    const butonEkle = (etiket, hedefSayfa, opts = {}) => {
        const buton = document.createElement("button");
        buton.type = "button";
        buton.className = "sayfa-buton" + (opts.aktif ? " aktif" : "");
        buton.textContent = etiket;
        buton.disabled = !!opts.devreDisi;
        buton.setAttribute("aria-label", opts.ariaLabel || etiket);
        if (!opts.devreDisi && !opts.aktif) {
            buton.addEventListener("click", () => sayfayaGit(hedefSayfa));
        }
        kapsayici.appendChild(buton);
    };

    const noktaEkle = () => {
        const span = document.createElement("span");
        span.className = "sayfa-nokta";
        span.textContent = "…";
        kapsayici.appendChild(span);
    };

    butonEkle("«", 1, { devreDisi: mevcutSayfa === 1, ariaLabel: "İlk sayfa" });
    butonEkle("‹", mevcutSayfa - 1, { devreDisi: mevcutSayfa === 1, ariaLabel: "Önceki sayfa" });

    const pencereBasi = Math.max(1, mevcutSayfa - 2);
    const pencereSonu = Math.min(toplamSayfa, mevcutSayfa + 2);

    if (pencereBasi > 1) {
        butonEkle("1", 1);
        if (pencereBasi > 2) noktaEkle();
    }
    for (let s = pencereBasi; s <= pencereSonu; s++) {
        butonEkle(String(s), s, { aktif: s === mevcutSayfa });
    }
    if (pencereSonu < toplamSayfa) {
        if (pencereSonu < toplamSayfa - 1) noktaEkle();
        butonEkle(String(toplamSayfa), toplamSayfa);
    }

    butonEkle("›", mevcutSayfa + 1, { devreDisi: mevcutSayfa === toplamSayfa, ariaLabel: "Sonraki sayfa" });
    butonEkle("»", toplamSayfa, { devreDisi: mevcutSayfa === toplamSayfa, ariaLabel: "Son sayfa" });
}

// --- KADEMELİ (FACETED) FİLTRELEME ---
// Bir kategoride (örn. Tür) seçim yapıldığında, diğer kategorilerdeki
// (Yazar, Yayınevi, Çevirmen, Seri) artık hiç kitap döndürmeyecek
// seçenekler otomatik olarak gizlenir. Örnek: "Bilim Kurgu" seçilince
// yazar listesinde sadece bilim kurgu kitabı olan yazarlar kalır.
const facetKategorileri = [
    { ad: "yazar", idAlan: "yazarIds" },
    { ad: "yayinevi", idAlan: "yayineviIds" },
    { ad: "cevirmen", idAlan: "cevirmenIds" },
    { ad: "tur", idAlan: "turIds" },
    { ad: "seri", idAlan: "seriesId" },
];

function kategoriHaricFiltrele(haricKategori) {
    const yazarSecili =
        haricKategori === "yazar" ? [] : seciliDegerleriAl("yazar");
    const yayineviSecili =
        haricKategori === "yayinevi" ? [] : seciliDegerleriAl("yayinevi");
    const cevirmenSecili =
        haricKategori === "cevirmen" ? [] : seciliDegerleriAl("cevirmen");
    const turSecili = haricKategori === "tur" ? [] : seciliDegerleriAl("tur");
    const seriSecili = haricKategori === "seri" ? [] : seciliDegerleriAl("seri");

    const sayfaMin = parseInt(document.getElementById("range-min").value);
    const sayfaMax = parseInt(document.getElementById("range-max").value);

    return tumKitaplar.filter((kitap) => {
        if (!diziKesisiyorMu(kitap.yazarIds, yazarSecili)) return false;
        if (!diziKesisiyorMu(kitap.yayineviIds, yayineviSecili)) return false;
        if (!diziKesisiyorMu(kitap.cevirmenIds, cevirmenSecili)) return false;
        if (!diziKapsiyorMu(kitap.turIds, turSecili)) return false;

        if (seriSecili.length > 0) {
            if (!kitap.seriesId || !seriSecili.includes(kitap.seriesId)) return false;
        }

        if (
            haricKategori !== "sayfa" &&
            kitap.sayfaSayilari &&
            kitap.sayfaSayilari.length > 0
        ) {
            const araligaGiren = kitap.sayfaSayilari.some(
                (s) => s >= sayfaMin && s <= sayfaMax,
            );
            if (!araligaGiren) return false;
        }

        if (haricKategori !== "puan" && !kitapPuanFiltresineUyuyorMu(kitap)) {
            return false;
        }

        return true;
    });
}

function gecerliIdSetiOlustur(kitaplar, idAlani) {
    const set = new Set();
    kitaplar.forEach((kitap) => {
        const deger = kitap[idAlani];
        if (Array.isArray(deger)) {
            deger.forEach((id) => set.add(id));
        } else if (deger !== null && deger !== undefined) {
            set.add(deger);
        }
    });
    return set;
}

function filtreSecenekleriniGuncelle() {
    facetKategorileri.forEach((kategori) => {
        const kitaplarBuKategoriHaric = kategoriHaricFiltrele(kategori.ad);
        const gecerliIdler = gecerliIdSetiOlustur(
            kitaplarBuKategoriHaric,
            kategori.idAlan,
        );

        const liste = document.getElementById("list-" + kategori.ad);
        if (!liste) return;

        liste.querySelectorAll(".filter-option").forEach((secenek) => {
            const checkbox = secenek.querySelector('input[type="checkbox"]');
            const id = parseInt(checkbox.value);
            const gecerli = gecerliIdler.has(id);
            // Seçili olan bir seçenek geçersiz hale gelse bile gizlenmez,
            // böylece kullanıcı seçimini görüp kaldırabilir.
            secenek.classList.toggle("gecersiz", !gecerli && !checkbox.checked);
        });
    });
}

function filtreleriSifirla() {
    // Tüm checkbox'ları temizle
    document
        .querySelectorAll('.filter-option input[type="checkbox"]')
        .forEach((cb) => {
            cb.checked = false;
        });

    // Arama kutularını da temizle ve gizlenmiş seçenekleri tekrar göster
    document.querySelectorAll(".filter-search").forEach((input) => {
        input.value = "";
    });
    document.querySelectorAll(".filter-option").forEach((opt) => {
        opt.classList.remove("arama-gizli", "gecersiz");
    });

    // Sayfa sayısı slider'larını min/max'e geri al
    const rangeMin = document.getElementById("range-min");
    const rangeMax = document.getElementById("range-max");
    rangeMin.value = rangeMin.min;
    rangeMax.value = rangeMax.max;
    document.getElementById("range-min-label").textContent = rangeMin.min;
    document.getElementById("range-max-label").textContent = rangeMax.max;
    sayfaTrackGuncelle();

    // Puan filtresini de sıfırla
    secilenPuanFiltresi = null;
    puanFiltresiKutulariniGuncelle();

    // Açık filtre panellerini kapat (isteğe bağlı, ister kaldır)
    document.querySelectorAll(".filter-item.open").forEach((item) => {
        item.classList.remove("open");
    });

    urlGuncelle({
        yazar: null,
        yayinevi: null,
        cevirmen: null,
        tur: null,
        seri: null,
        sayfaMin: null,
        sayfaMax: null,
        puan: null,
    });

    filtreUygula();
}

// --- SERİ / İLGİLİ KİTAPLAR MANTIĞI ---
// SeriesOrder: 1,2,3... ana seri kitapları. 100+ ise yan hikaye / evren notu vb.
// Önceki kitap = seriesOrder - 1, sonraki kitap = seriesOrder + 1.
// İlgili kitaplar = aynı seriye ait, önceki/sonraki dışındaki diğer tüm kitaplar.
function serileriBul(kitap) {
    if (!kitap.seriesId) {
        return { onceki: null, sonraki: null, ilgili: [] };
    }

    const seride = tumKitaplar.filter(
        (k) => k.seriesId === kitap.seriesId && k.id !== kitap.id,
    );

    // Sadece ana seri (seriesOrder < 100) kitapları önceki/sonraki olabilir.
    // 100+ olanlar (yan hikaye / evren notu vb.) sadece "İlgili Kitaplar" listesine düşer,
    // ne kendileri önceki/sonraki gösterir ne de başka bir kitabın önceki/sonrakisi olabilir.
    const anaSeriKitaplari = seride.filter((k) => (k.seriesOrder ?? 0) < 100);
    const buKitapAnaSeride = (kitap.seriesOrder ?? 0) < 100;

    const onceki = buKitapAnaSeride
        ? anaSeriKitaplari.find((k) => k.seriesOrder === kitap.seriesOrder - 1) ||
        null
        : null;
    const sonraki = buKitapAnaSeride
        ? anaSeriKitaplari.find((k) => k.seriesOrder === kitap.seriesOrder + 1) ||
        null
        : null;

    const ilgili = seride
        .filter((k) => k !== onceki && k !== sonraki)
        .sort((a, b) => (a.seriesOrder ?? 0) - (b.seriesOrder ?? 0));

    return { onceki, sonraki, ilgili };
}

function seriSatirOlustur(kitap, etiket) {
    const satir = document.createElement("div");
    satir.className = "seri-kitap-satir";
    satir.onclick = () => popupAc(kitap);

    const etiketHtml = etiket ? `<span class="seri-etiket">${etiket}</span>` : "";

    satir.innerHTML = `
		<div class="seri-kitap-kapak"><img src="${kitap.kapak}" alt="${kitap.ad}" /></div>
		<div class="seri-kitap-bilgi">
		${etiketHtml}
		<span class="seri-kitap-adi">${kitap.ad}</span>
		</div>`;

    return satir;
}

function renderSeri(kitap) {
    const container = document.getElementById("popup-seri");
    container.innerHTML = "";

    const { onceki, sonraki, ilgili } = serileriBul(kitap);

    if (!onceki && !sonraki && ilgili.length === 0) {
        container.style.display = "none";
        return;
    }

    container.style.display = "flex";

    if (onceki) {
        container.appendChild(seriSatirOlustur(onceki, "Serinin Önceki Kitabı"));
    }
    if (sonraki) {
        container.appendChild(seriSatirOlustur(sonraki, "Serinin Sonraki Kitabı"));
    }

    if (ilgili.length > 0) {
        const baslik = document.createElement("div");
        baslik.className = "seri-baslik";
        baslik.textContent = "İlgili Kitaplar";
        container.appendChild(baslik);

        const liste = document.createElement("div");
        liste.className = "ilgili-liste";
        ilgili.forEach((k) => {
            const etiket =
                (k.seriesOrder ?? 0) < 100 ? `Ana Seri ${k.seriesOrder}. Kitap` : "";
            liste.appendChild(seriSatirOlustur(k, etiket));
        });
        container.appendChild(liste);
    }
}
// Kitap popup'ındaki "Hakkında" / "Yorumlar" sekmeleri arasında geçiş yapar.
// İlgili buton "aktif" class'ını alır, ilgili içerik div'i gösterilir,
// kaydırma konumu sekme değişince başa alınır (bir önceki sekmenin
// kaydırma pozisyonu diğerine taşınmasın diye).
function popupSekmeDegistir(sekme) {
    document
        .querySelectorAll("#popup-sekmeler .popup-sekme")
        .forEach((buton) => {
            buton.classList.toggle("aktif", buton.dataset.sekme === sekme);
        });

    document
        .querySelectorAll("#popup-scroll-alani .popup-tab-icerik")
        .forEach((icerik) => {
            icerik.classList.toggle("aktif", icerik.id === `popup-tab-${sekme}`);
        });

    document.getElementById("popup-scroll-alani").scrollTop = 0;

    if (sekme === "yorumlar" && aktifKitapId != null) {
        yorumlariYukle(aktifKitapId);
    }
}

// === YORUMLAR SEKMESİ: yorum yazma kutusu ===
// Bu yıldız seçici, kitap popup'ının üstündeki salt-okunur ortalama
// yıldızlarından (popup-puan) tamamen bağımsız çalışır; kullanıcının
// vermek istediği puanı burada seçmesi için var.
let yorumSeciliPuan = null;
const yorumYildizSecici = document.getElementById("yorum-yildiz-secici");

if (yorumYildizSecici) {
    const yorumYildizlari = Array.from(yorumYildizSecici.querySelectorAll("i"));

    yorumYildizlari.forEach((yildiz) => {
        yildiz.addEventListener("mouseenter", () => {
            const deger = Number(yildiz.dataset.yildiz);
            yorumYildizlari.forEach((y) => {
                y.classList.toggle("onizleme", Number(y.dataset.yildiz) <= deger);
            });
        });

        yildiz.addEventListener("click", () => {
            yorumSeciliPuan = Number(yildiz.dataset.yildiz);
            yorumYildizlari.forEach((y) => {
                y.classList.toggle("dolu", Number(y.dataset.yildiz) <= yorumSeciliPuan);
            });
            const uyari = document.getElementById("yorum-uyari");
            if (uyari) {
                uyari.textContent = "";
                uyari.classList.remove("basarili");
            }
        });
    });

    yorumYildizSecici.addEventListener("mouseleave", () => {
        yorumYildizlari.forEach((y) => y.classList.remove("onizleme"));
    });
}

// Popup her açıldığında (yeni kitap seçildiğinde) yorum formunu baştan
// hazırlar. Kullanıcı bu kitaba daha önce puan verdiyse (oncekiPuan), o
// puan burada da -tıpkı yayınevinin altındaki salt-okunur yıldızlarda
// olduğu gibi- baştan sarı gösterilir; böylece kullanıcı yeniden yıldız
// seçmeden, doğrudan aynı puanla yorum yazabilir. Vermediyse hepsi boş başlar.
function yorumFormunuSifirla(oncekiPuan) {
    yorumSeciliPuan = oncekiPuan || null;

    document
        .querySelectorAll("#yorum-yildiz-secici i")
        .forEach((y) => {
            y.classList.remove("onizleme");
            y.classList.toggle("dolu", Number(y.dataset.yildiz) <= (yorumSeciliPuan || 0));
        });

    const metinAlani = document.getElementById("yorum-metin-alani");
    if (metinAlani) metinAlani.value = "";

    const uyari = document.getElementById("yorum-uyari");
    if (uyari) {
        uyari.textContent = "";
        uyari.classList.remove("basarili");
    }

    // "Yorumu Kaldır" butonu sadece bu kitaba daha önceden verilmiş bir
    // puan/yorum varsa görünür; yoksa kaldırılacak bir şey yok demektir.
    const kaldirBtn = document.getElementById("yorum-kaldir-btn");
    if (kaldirBtn) kaldirBtn.style.display = oncekiPuan ? "inline-block" : "none";
}

// "Yorum Yap" butonuna basılınca çalışır. Kural: yorum metni varsa (sadece
// boşlukla/backspace ile boşaltılmış metin boş sayılır) yıldız da seçili
// olmak zorunda; yıldız tek başına (yorumsuz) her zaman gönderilebilir.
async function yorumGonder() {
    const metinAlani = document.getElementById("yorum-metin-alani");
    const uyari = document.getElementById("yorum-uyari");
    const gonderBtn = document.getElementById("yorum-gonder-btn");
    const metin = metinAlani ? metinAlani.value.trim() : "";

    if (!yorumSeciliPuan) {
        uyari.classList.remove("basarili");
        uyari.textContent = metin.length > 0
            ? "Yorum yazabilmek için önce puan vermelisin."
            : "Göndermeden önce en az bir yıldız seçmelisin.";
        return;
    }

    uyari.classList.remove("basarili");
    uyari.textContent = "";
    gonderBtn.disabled = true;

    try {
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");

        const yanit = await fetch("/Bookland/PuanVer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrfToken || "",
            },
            body: JSON.stringify({
                bookId: aktifKitapId,
                puan: yorumSeciliPuan,
                yorum: metin,
            }),
        });

        if (!yanit.ok) {
            uyari.textContent = "Yorumun kaydedilemedi, tekrar dene.";
            return;
        }

        const sonuc = await yanit.json();

        // Ortalama/oy sayısını hem yayınevinin altındaki salt-okunur (kısmi
        // dolu) yıldızlara hem de kitap kartlarındaki rozete yansıt.
        document.getElementById("popup-puan-ortalama").textContent =
            sonuc.ratingCount > 0 ? Number(sonuc.averageRating).toFixed(1) : "—";
        document.getElementById("popup-puan-oy-sayisi").textContent =
            `(${sonuc.ratingCount} oy)`;
        popupOrtalamaYildizlariBoya(sonuc.ratingCount > 0 ? sonuc.averageRating : 0);

        const guncellenenKitap = kitapMap[aktifKitapId];
        if (guncellenenKitap) {
            guncellenenKitap.puanOrtalama = sonuc.averageRating;
            guncellenenKitap.oySayisi = sonuc.ratingCount;
            puanRozetiniGuncelle(aktifKitapId, guncellenenKitap);
        }
        kullaniciPuanlari[aktifKitapId] = sonuc.kullaniciPuani;

        // Artık bu kitaba bir puan/yorum var demektir, "Yorumu Kaldır"
        // butonu görünür olsun.
        const kaldirBtn = document.getElementById("yorum-kaldir-btn");
        if (kaldirBtn) kaldirBtn.style.display = "inline-block";

        // Listeyi backend'den (gerçek sırayla, en yeni üstte) tazeleyerek
        // yeni yorumu göster; DOM'a manuel kart eklemek yerine tek doğruluk
        // kaynağı (backend) üzerinden gidiyoruz, böylece F5/popup aç-kapa
        // sonrası da aynı liste görünür.
        await yorumlariYukle(aktifKitapId, true);

        metinAlani.value = "";
        uyari.classList.add("basarili");
        uyari.textContent = "Yorumun kaydedildi.";
    } catch (hata) {
        uyari.classList.remove("basarili");
        uyari.textContent = "Yorumun kaydedilemedi, tekrar dene.";
    } finally {
        gonderBtn.disabled = false;
    }
}

// "Yorumu Kaldır ✕" butonuna basılınca çalışır: kullanıcının bu kitaba
// verdiği puanı ve (varsa) yorumunu tamamen siler. Onay istenir, çünkü
// geri alınamaz bir işlem.
async function yorumKaldir() {
    if (!aktifKitapId) return;
    if (!confirm("Puanını ve yorumunu kaldırmak istediğine emin misin?")) return;

    const uyari = document.getElementById("yorum-uyari");
    const kaldirBtn = document.getElementById("yorum-kaldir-btn");
    const gonderBtn = document.getElementById("yorum-gonder-btn");

    uyari.classList.remove("basarili");
    uyari.textContent = "";
    kaldirBtn.disabled = true;
    gonderBtn.disabled = true;

    try {
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");

        const yanit = await fetch("/Bookland/PuanKaldir", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrfToken || "",
            },
            body: JSON.stringify({ bookId: aktifKitapId }),
        });

        if (!yanit.ok) {
            uyari.textContent = "Kaldırılamadı, tekrar dene.";
            return;
        }

        const sonuc = await yanit.json();

        document.getElementById("popup-puan-ortalama").textContent =
            sonuc.ratingCount > 0 ? Number(sonuc.averageRating).toFixed(1) : "—";
        document.getElementById("popup-puan-oy-sayisi").textContent =
            `(${sonuc.ratingCount} oy)`;
        popupOrtalamaYildizlariBoya(sonuc.ratingCount > 0 ? sonuc.averageRating : 0);

        const guncellenenKitap = kitapMap[aktifKitapId];
        if (guncellenenKitap) {
            guncellenenKitap.puanOrtalama = sonuc.averageRating;
            guncellenenKitap.oySayisi = sonuc.ratingCount;
            puanRozetiniGuncelle(aktifKitapId, guncellenenKitap);
        }
        delete kullaniciPuanlari[aktifKitapId];

        // Formu tamamen sıfırla (bu, kaldır butonunu da tekrar gizler) ve
        // yorum listesini backend'den tazele.
        yorumFormunuSifirla(null);
        await yorumlariYukle(aktifKitapId, true);

        uyari.classList.add("basarili");
        uyari.textContent = "Puanın ve yorumun kaldırıldı.";
    } catch (hata) {
        uyari.textContent = "Kaldırılamadı, tekrar dene.";
    } finally {
        kaldirBtn.disabled = false;
        gonderBtn.disabled = false;
    }
}

// Bir kitabın yorumlarını backend'den çeker. Sonuç kitap.yorumlar içinde
// önbelleğe alınır (kitap._yorumlarYuklendi ile işaretlenir), aynı kitap
// popup'ı tekrar açıldığında (aynı sayfa oturumunda) gereksiz isteği
// önler. zorlaYenile:true verilirse önbellek yok sayılır (yeni yorum
// gönderildikten sonra listeyi tazelemek için kullanılıyor).
async function yorumlariYukle(bookId, zorlaYenile) {
    const kitap = kitapMap[bookId];
    if (!kitap) return;

    if (kitap._yorumlarYuklendi && !zorlaYenile) {
        renderYorumlar(kitap);
        return;
    }

    const liste = document.getElementById("yorum-listesi");
    const bosDurum = document.getElementById("yorum-bos-durum");
    if (liste) liste.innerHTML = '<div class="yorum-yukleniyor">Yorumlar yükleniyor...</div>';
    if (bosDurum) bosDurum.style.display = "none";

    try {
        const yanit = await fetch(`/Bookland/GetYorumlar?bookId=${bookId}`);
        kitap.yorumlar = yanit.ok ? await yanit.json() : [];
    } catch (hata) {
        kitap.yorumlar = [];
    }

    kitap._yorumlarYuklendi = true;

    // Kullanıcı yükleme sürerken popup'ı kapatıp başka bir kitap açmış
    // olabilir; o zaman bu isteğin sonucunu ekrana basmayalım.
    if (aktifKitapId === bookId) {
        renderYorumlar(kitap);
    }
}

// Yorumlar sekmesindeki kart listesini kitap.yorumlar dizisinden doldurur.
function renderYorumlar(kitap) {
    const liste = document.getElementById("yorum-listesi");
    const bosDurum = document.getElementById("yorum-bos-durum");
    if (!liste || !bosDurum) return;

    liste.innerHTML = "";
    const yorumlar = Array.isArray(kitap.yorumlar) ? kitap.yorumlar : [];

    if (yorumlar.length === 0) {
        bosDurum.style.display = "block";
        return;
    }
    bosDurum.style.display = "none";

    yorumlar.forEach((yorum) => {
        liste.appendChild(yorumKartiOlustur(yorum));
    });
}

// Tek bir yorum kartı DOM elemanı üretir. Kendi yorumumuzsa (kullanıcı adı
// eşleşiyorsa) "(sen)" etiketi eklenir. Yorum metni 4 satırdan uzunsa
// baştan kısaltılmış gösterilir; "Daha fazla göster" butonu sadece metin
// gerçekten taşıyorsa gösterilir (kart DOM'a eklendikten sonra ölçülür).
function yorumKartiOlustur(yorum) {
    const kart = document.createElement("div");
    kart.className = "yorum-karti";

    const ustSatir = document.createElement("div");
    ustSatir.className = "yorum-karti-ust";

    const kullanici = document.createElement("span");
    kullanici.className = "yorum-kullanici-adi";
    const kendisiMi = mevcutKullaniciAdi && yorum.kullaniciAdi === mevcutKullaniciAdi;
    kullanici.textContent = (yorum.kullaniciAdi || "Kullanıcı") + (kendisiMi ? " (sen)" : "");

    // ---- YENİ (Faz Ekstra 2.4): tarih + şikayet ikonu birlikte sağda dursun
    // diye ortak bir grup içine alındı (justify-content:space-between iki
    // öge bekliyor, üç öge farklı dağılır). ----
    const sagGrup = document.createElement("div");
    sagGrup.className = "yorum-karti-sag-grup";

    const tarih = document.createElement("span");
    tarih.className = "yorum-tarih";
    tarih.textContent = yorum.tarih || "";
    sagGrup.appendChild(tarih);

    if (!kendisiMi && yorum.ratingId) {
        const sikayetBtn = document.createElement("button");
        sikayetBtn.type = "button";
        sikayetBtn.className = "yorum-sikayet-btn";
        sikayetBtn.title = "Bu yorumu şikayet et";
        sikayetBtn.innerHTML = '<i class="fa-regular fa-flag"></i>';
        sikayetBtn.onclick = () => sikayetModalAc(yorum.ratingId);
        sagGrup.appendChild(sikayetBtn);
    }

    ustSatir.appendChild(kullanici);
    ustSatir.appendChild(sagGrup);
    kart.appendChild(ustSatir);

    const yildizSatiri = document.createElement("div");
    yildizSatiri.className = "yorum-karti-yildizlar";
    for (let i = 1; i <= 5; i++) {
        const yildiz = document.createElement("i");
        yildiz.className = "fa-solid fa-star" + (i <= (yorum.puan || 0) ? " dolu" : "");
        yildizSatiri.appendChild(yildiz);
    }
    kart.appendChild(yildizSatiri);

    if (yorum.yorum) {
        const sarmalayici = document.createElement("div");
        sarmalayici.className = "yorum-karti-metin-sarmalayici";

        const metin = document.createElement("p");
        metin.className = "yorum-karti-metin kisaltilmis";
        metin.textContent = yorum.yorum;
        sarmalayici.appendChild(metin);

        const buton = document.createElement("button");
        buton.type = "button";
        buton.className = "yorum-devamini-goster";
        buton.textContent = "Daha fazla göster";
        buton.onclick = () => yorumMetniAcKapa(metin, buton);
        sarmalayici.appendChild(buton);

        kart.appendChild(sarmalayici);

        requestAnimationFrame(() => {
            if (metin.scrollHeight <= metin.clientHeight + 1) {
                buton.style.display = "none";
            }
        });
    }

    return kart;
}

// Kısaltılmış/tam görünüm arasında geçiş yapar (buton metnini de günceller).
function yorumMetniAcKapa(metinElemani, buton) {
    const acildi = metinElemani.classList.toggle("acik");
    metinElemani.classList.toggle("kisaltilmis", !acildi);
    buton.textContent = acildi ? "Daha az göster" : "Daha fazla göster";
}

let aktifKitapId = null;
function popupAc(kitap, push) {
    // Popup her açıldığında "Hakkında" sekmesiyle başlar; önceki kitaptan
    // kalan "Yorumlar" sekmesi açık kalmasın diye baştan sıfırlanır.
    popupSekmeDegistir("hakkinda");
    yorumFormunuSifirla(kullaniciPuanlari[kitap.id] ?? null);
    renderYorumlar(kitap);

    aktifKitapId = kitap.id;
    document.getElementById("popup-kapak-img").src = kitap.kapak || "";
    document.getElementById("popup-kitap-adi").textContent = kitap.ad;
    document.getElementById("popup-yazar").textContent = kitap.yazar;

    const yazarElemani = document.getElementById("popup-yazar");
    yazarElemani.innerHTML = "";

    const yazarListesi = Array.isArray(kitap.yazarListesi) ? kitap.yazarListesi : [];

    if (yazarListesi.length === 0) {
        yazarElemani.textContent = kitap.yazar || "—";
    } else {
        yazarListesi.forEach((yazar, index) => {
            const span = document.createElement("span");
            span.textContent = yazar.ad;

            if (yazarMap[yazar.id]) {
                span.style.cursor = "pointer";
                span.onclick = () => {
                    popupKapat(false);
                    goruntuDegistir("yazarlar", false);
                    yazarPopupAc(yazarMap[yazar.id]);
                };
            }

            yazarElemani.appendChild(span);

            if (index < yazarListesi.length - 1) {
                yazarElemani.appendChild(document.createTextNode(", "));
            }
        });
    }
    document.getElementById("popup-yayinevi").textContent = kitap.yayinevi;

    // Puan ortalaması / oy sayısı backend'den gerçek verilerle geliyor.
    // Yayınevinin altındaki yıldızlar artık salt-okunur: ortalamaya göre
    // kısmi (yüzdesel) dolulukla boyanıyor, kullanıcının kendi puanıyla
    // ilgisi yok (o artık sadece Yorumlar sekmesindeki seçicide).
    const oySayisi = kitap.oySayisi || 0;
    document.getElementById("popup-puan-ortalama").textContent =
        oySayisi > 0 ? Number(kitap.puanOrtalama).toFixed(1) : "—";
    document.getElementById("popup-puan-oy-sayisi").textContent = `(${oySayisi} oy)`;
    popupOrtalamaYildizlariBoya(oySayisi > 0 ? kitap.puanOrtalama : 0);

    document.getElementById("popup-ilk-yil").textContent = kitap.ilkYil || "—";
    document.getElementById("popup-basim-yili").textContent =
        kitap.basimYili || "—";
    document.getElementById("popup-sayfa").textContent = kitap.sayfa || "—";
    document.getElementById("popup-tur").textContent = kitap.tur || "—";
    document.getElementById("popup-cevirmen").textContent = kitap.cevirmen || "—";
    document.getElementById("popup-aciklama-metin").textContent =
        kitap.aciklama || "Açıklama bulunmuyor.";

    renderSeri(kitap);

    document.getElementById("kitap-popup-overlay").classList.add("aktif");
    document.body.style.overflow = "hidden";
    document.getElementById("popup-scroll-alani").scrollTop = 0;

    if (push !== false) {
        urlGuncelle({ view: null, bookId: kitap.id, authorId: null });
    }
}

function kitapDuzenle() {
    if (!aktifKitapId) return;
    window.open("/Admin/BookUpdate?bookId=" + aktifKitapId, "_blank");
}
function popupKapat(push) {
    document.getElementById("kitap-popup-overlay").classList.remove("aktif");
    document.body.style.overflow = "";
    if (push !== false) {
        urlGuncelle({ bookId: null });
    }
}

// --- YAZAR POPUP MANTIĞI ---
// Kitap popup'ındaki popupAc / popupKapat / kitapDuzenle üçlüsüyle
// birebir aynı yapı; sadece yazar verisine göre çalışır. Yazarın kitap
// listesi, ayrı bir sorgu yerine tumKitaplar içindeki yazarIds alanı
// (ters ilişki) filtrelenerek elde edilir ve seri bölümündeki
// seriSatirOlustur() satır deseni yeniden kullanılır.
let aktifYazarId = null;

function yazarYasamAraligiMetni(yazar) {
    if (!yazar.dogumYili) return "";
    const olum = yazar.olumYili ? yazar.olumYili : "yaşıyor";
    return `${yazar.dogumYili} – ${olum}`;
}

function yazarinKitaplariniBul(yazarId) {
    return tumKitaplar
        .filter((k) => Array.isArray(k.yazarIds) && k.yazarIds.includes(yazarId))
        .sort((a, b) => a.ad.localeCompare(b.ad, "tr-TR"));
}

function renderYazarKitaplari(yazarId) {
    const container = document.getElementById("yazar-popup-kitaplar");
    container.innerHTML = "";

    const kitaplar = yazarinKitaplariniBul(yazarId);
    if (kitaplar.length === 0) {
        container.style.display = "none";
        return;
    }
    container.style.display = "flex";

    const baslik = document.createElement("div");
    baslik.className = "seri-baslik";
    baslik.textContent = "Kitapları";
    container.appendChild(baslik);

    const liste = document.createElement("div");
    liste.className = "ilgili-liste";
    kitaplar.forEach((kitap) => {
        const satir = seriSatirOlustur(kitap, "");
        // Kitaba tıklanınca yazar popup'ı kapanır, Kitaplar sekmesine geçilir
        // ve o kitabın kendi detay popup'ı açılır.
        satir.onclick = () => {
            yazarPopupKapat(false);
            goruntuDegistir("kitaplar", false);
            popupAc(kitap);
        };
        liste.appendChild(satir);
    });
    container.appendChild(liste);
}

function yazarPopupAc(yazar, push) {
    aktifYazarId = yazar.id;
    document.getElementById("yazar-popup-foto").src = yazar.foto || "";
    document.getElementById("yazar-popup-ad").textContent = yazar.ad;
    document.getElementById("yazar-popup-yasam").textContent =
        yazarYasamAraligiMetni(yazar) || "—";
    document.getElementById("yazar-popup-aciklama").textContent =
        yazar.aciklama || "Biyografi bulunmuyor.";

    renderYazarKitaplari(yazar.id);

    document.getElementById("yazar-popup-overlay").classList.add("aktif");
    document.body.style.overflow = "hidden";
    document.getElementById("yazar-popup-scroll-alani").scrollTop = 0;

    if (push !== false) {
        urlGuncelle({ view: "yazarlar", authorId: yazar.id, bookId: null });
    }
}

function yazarDuzenle() {
    if (!aktifYazarId) return;
    window.open("/Admin/AuthorUpdate?authorId=" + aktifYazarId, "_blank");
}

function yazarPopupKapat(push) {
    document.getElementById("yazar-popup-overlay").classList.remove("aktif");
    document.body.style.overflow = "";
    if (push !== false) {
        urlGuncelle({ authorId: null });
    }
}

// === PUANLARIM SEKMESİ: yardımcılar ===
function kullaniciYorumunuBul(kitap) {
    if (!mevcutKullaniciAdi || !Array.isArray(kitap.yorumlar)) return null;
    return kitap.yorumlar.find((y) => y.kullaniciAdi === mevcutKullaniciAdi) || null;
}

function puanlarimYildizHtmlOlustur(puan) {
    let html = "";
    for (let i = 1; i <= 5; i++) {
        html += `<i class="fa-solid fa-star${i <= puan ? " dolu" : ""}"></i>`;
    }
    return html;
}

// === PUANLARIM SEKMESİ: kart listesi ===
function puanlarimKitaplariniBul() {
    return Object.keys(kullaniciPuanlari)
        .map((id) => kitapMap[id])
        .filter(Boolean)
        .sort((a, b) => a.ad.localeCompare(b.ad, "tr-TR"));
}

function puanlarimKartiOlustur(kitap) {
    const kart = document.createElement("div");
    kart.className = "puan-karti";
    kart.dataset.kitapId = kitap.id;
    kart.style.cursor = "pointer";
    kart.addEventListener("click", () => puanlarimPopupAc(kitap));

    const kapakHtml = kitap.kapak ? `<img src="${kitap.kapak}" alt="${kitap.ad}" />` : "";
    const puan = kullaniciPuanlari[kitap.id] || 0;

    kart.innerHTML = `
		<div class="puan-karti-kapak">${kapakHtml}</div>
		<div class="puan-karti-sag">
			<div class="puan-karti-ust">
				<span class="puan-karti-baslik">${kitap.ad}</span>
				<span class="yorum-karti-yildizlar puan-karti-yildizlar">${puanlarimYildizHtmlOlustur(puan)}</span>
			</div>
			<div class="puan-karti-yorum-sarmalayici">
				<p class="puan-karti-yorum kisaltilmis">Yükleniyor...</p>
			</div>
		</div>`;

    return kart;
}

// Kart açıldığında yorum metni henüz yüklenmemiş olabilir (async); yüklenince
// bu fonksiyon çağrılıp gerçek metin/rozet ile değiştirilir.
function puanlarimKartiYorumGuncelle(kitap) {
    const kart = document.querySelector(`.puan-karti[data-kitap-id="${kitap.id}"]`);
    if (!kart) return;

    const p = kart.querySelector(".puan-karti-yorum");
    const sarmalayici = kart.querySelector(".puan-karti-yorum-sarmalayici");
    if (!p || !sarmalayici) return;

    const eskiDevami = sarmalayici.querySelector(".puan-karti-devami");
    if (eskiDevami) eskiDevami.remove();

    // ---- YENİ (Faz Ekstra 2.4): silinmiş yorum artık public GetYorumlar
    // listesinde hiç görünmüyor (backend'de filtrelendi), o yüzden "silindi"
    // durumu sayfa yüklenirken gelen silinenYorumKitapIdleri'nden okunuyor. ----
    if (silinenYorumKitapIdleri.has(Number(kitap.id))) {
        p.textContent = "Bu yorum topluluk kurallarına uymadığı için silinmiştir.";
        p.classList.remove("kisaltilmis", "puan-karti-yorum-bos");
        p.classList.add("puan-karti-yorum-silindi");
        return;
    }

    const kendiYorum = kullaniciYorumunuBul(kitap);

    if (kendiYorum && kendiYorum.yorum) {
        p.textContent = kendiYorum.yorum;
        p.classList.remove("puan-karti-yorum-bos", "puan-karti-yorum-silindi");
        p.classList.add("kisaltilmis");

        requestAnimationFrame(() => {
            if (p.scrollHeight > p.clientHeight + 1) {
                const devamiSpan = document.createElement("span");
                devamiSpan.className = "puan-karti-devami";
                devamiSpan.textContent = "...(devamını oku)";
                sarmalayici.appendChild(devamiSpan);
            }
        });
    } else {
        p.textContent = "Sadece puan verildi, yorum yazılmadı.";
        p.classList.remove("kisaltilmis", "puan-karti-yorum-silindi");
        p.classList.add("puan-karti-yorum-bos");
    }
}

function puanlarimKartiGuncelle(kitap) {
    const kart = document.querySelector(`.puan-karti[data-kitap-id="${kitap.id}"]`);
    if (!kart) return;

    const puan = kullaniciPuanlari[kitap.id] || 0;
    const yildizKapsayici = kart.querySelector(".puan-karti-yildizlar");
    if (yildizKapsayici) yildizKapsayici.innerHTML = puanlarimYildizHtmlOlustur(puan);

    puanlarimKartiYorumGuncelle(kitap);
}

function puanlarimRenderEt() {
    const grid = document.getElementById("puanlarim-grid");
    const bosDurum = document.getElementById("puanlarim-bos-durum");
    if (!grid) return;

    const kitaplar = puanlarimKitaplariniBul();
    grid.innerHTML = "";

    if (kitaplar.length === 0) {
        if (bosDurum) bosDurum.style.display = "flex";
        return;
    }
    if (bosDurum) bosDurum.style.display = "none";

    kitaplar.forEach((kitap) => {
        grid.appendChild(puanlarimKartiOlustur(kitap));
        // yorumlariYukle zaten cache'li; kitap popup'ında daha önce açılmışsa anında döner.
        yorumlariYukle(kitap.id).then(() => puanlarimKartiYorumGuncelle(kitap));
    });
}

// === PUANLARIM POPUP MANTIĞI ===
let aktifPuanlarimKitapId = null;
let puanlarimDuzenleModu = false;
let puanlarimSeciliPuan = null;

function puanlarimYildizGosterGuncelle(puan) {
    const kapsayici = document.getElementById("puanlarim-popup-yildizlar-goster");
    if (kapsayici) kapsayici.innerHTML = puanlarimYildizHtmlOlustur(puan);
}

function puanlarimYildizDuzenleGuncelle(puan) {
    document
        .querySelectorAll("#puanlarim-popup-yildizlar-duzenle i")
        .forEach((y) => {
            y.classList.toggle("dolu", Number(y.dataset.yildiz) <= puan);
        });
}

async function puanlarimPopupAc(kitap, push) {
    aktifPuanlarimKitapId = kitap.id;
    puanlarimSeciliPuan = kullaniciPuanlari[kitap.id] || null;
    puanlarimDuzenleModunuAyarla(false);

    document.getElementById("puanlarim-popup-kapak-img").src = kitap.kapak || "";
    document.getElementById("puanlarim-popup-kitap-adi").textContent = kitap.ad;
    puanlarimYildizGosterGuncelle(puanlarimSeciliPuan || 0);
    puanlarimYildizDuzenleGuncelle(puanlarimSeciliPuan || 0);

    document.getElementById("puanlarim-popup-yorum-metin").textContent = "Yükleniyor...";
    document.getElementById("puanlarim-popup-yorum-duzenle").value = "";

    // ---- YENİ (Faz Ekstra 2.4): silinmiş yorumda düzenle/sil butonları
    // tamamen kapatılır. ----
    const silindiMi = silinenYorumKitapIdleri.has(Number(kitap.id));
    const duzenleBtn = document.getElementById("puanlarim-duzenle-btn");
    const silBtn = document.getElementById("puanlarim-sil-btn");
    if (duzenleBtn) duzenleBtn.disabled = silindiMi;
    if (silBtn) silBtn.disabled = silindiMi;

    document.getElementById("puanlarim-popup-overlay").classList.add("aktif");
    document.body.style.overflow = "hidden";
    document.getElementById("puanlarim-popup-govde").scrollTop = 0;

    if (push !== false) {
        urlGuncelle({ puanKitapId: kitap.id, bookId: null, authorId: null });
    }

    if (silindiMi) {
        document.getElementById("puanlarim-popup-yorum-metin").textContent =
            "Bu yorum topluluk kurallarına uymadığı için silinmiştir.";
        return;
    }

    await yorumlariYukle(kitap.id);
    if (aktifPuanlarimKitapId !== kitap.id) return;

    const kendiYorum = kullaniciYorumunuBul(kitap);
    const metin = kendiYorum && kendiYorum.yorum ? kendiYorum.yorum : "";
    document.getElementById("puanlarim-popup-yorum-metin").textContent =
        metin || "Bu kitaba yorum yazmadın, sadece puan verdin.";
    document.getElementById("puanlarim-popup-yorum-duzenle").value = metin;
}

function puanlarimPopupKapat(push) {
    document.getElementById("puanlarim-popup-overlay").classList.remove("aktif");
    document.body.style.overflow = "";
    aktifPuanlarimKitapId = null;
    if (push !== false) {
        urlGuncelle({ puanKitapId: null });
    }
}

function puanlarimDuzenleModunuAyarla(acik) {
    puanlarimDuzenleModu = acik;

    const btn = document.getElementById("puanlarim-duzenle-btn");
    if (btn) btn.textContent = acik ? "Yorumu Kaydet" : "Yorumu Düzenle";

    document.getElementById("puanlarim-popup-yildizlar-goster").style.display = acik ? "none" : "inline-flex";
    document.getElementById("puanlarim-popup-yildizlar-duzenle").style.display = acik ? "flex" : "none";

    document.getElementById("puanlarim-popup-yorum-metin").style.display = acik ? "none" : "block";
    document.getElementById("puanlarim-popup-yorum-duzenle").style.display = acik ? "block" : "none";
}

function puanlarimDuzenleToggle() {
    if (puanlarimDuzenleModu) {
        puanlarimKaydet();
    } else {
        puanlarimDuzenleModunuAyarla(true);
    }
}

// "Yorumu Sil ✕" butonuna basılınca çalışır: puanlarım popup'ındaki kitabın
// puanını ve yorumunu tamamen siler, ardından o kitabı puanlarım gridinden kaldırır.
async function puanlarimYorumSil() {
    if (!aktifPuanlarimKitapId) return;
    if (!confirm("Puanını ve yorumunu silmek istediğine emin misin?")) return;

    const silBtn = document.getElementById("puanlarim-sil-btn");
    const duzenleBtn = document.getElementById("puanlarim-duzenle-btn");
    silBtn.disabled = true;
    duzenleBtn.disabled = true;

    try {
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");

        const yanit = await fetch("/Bookland/PuanKaldir", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrfToken || "",
            },
            body: JSON.stringify({ bookId: aktifPuanlarimKitapId }),
        });

        if (!yanit.ok) {
            alert("Silinemedi, tekrar dene.");
            return;
        }

        const sonuc = await yanit.json();
        const kitap = kitapMap[aktifPuanlarimKitapId];

        if (kitap) {
            kitap.puanOrtalama = sonuc.averageRating;
            kitap.oySayisi = sonuc.ratingCount;
            puanRozetiniGuncelle(aktifPuanlarimKitapId, kitap);
            await yorumlariYukle(aktifPuanlarimKitapId, true);
        }
        delete kullaniciPuanlari[aktifPuanlarimKitapId];

        puanlarimPopupKapat();
        puanlarimRenderEt();
    } catch (hata) {
        alert("Silinemedi, tekrar dene.");
    } finally {
        silBtn.disabled = false;
        duzenleBtn.disabled = false;
    }
}

async function puanlarimKaydet() {
    if (!aktifPuanlarimKitapId) return;

    if (!puanlarimSeciliPuan) {
        alert("Kaydetmeden önce en az bir yıldız seçmelisin.");
        return;
    }

    const metinAlani = document.getElementById("puanlarim-popup-yorum-duzenle");
    const metin = metinAlani.value.trim();
    const btn = document.getElementById("puanlarim-duzenle-btn");
    btn.disabled = true;

    try {
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute("content");

        const yanit = await fetch("/Bookland/PuanVer", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": csrfToken || "",
            },
            body: JSON.stringify({
                bookId: aktifPuanlarimKitapId,
                puan: puanlarimSeciliPuan,
                yorum: metin,
            }),
        });

        if (!yanit.ok) {
            alert("Kaydedilemedi, tekrar dene.");
            return;
        }

        const sonuc = await yanit.json();
        const kitap = kitapMap[aktifPuanlarimKitapId];

        kullaniciPuanlari[aktifPuanlarimKitapId] = sonuc.kullaniciPuani;
        if (kitap) {
            kitap.puanOrtalama = sonuc.averageRating;
            kitap.oySayisi = sonuc.ratingCount;
            puanRozetiniGuncelle(aktifPuanlarimKitapId, kitap);
            await yorumlariYukle(aktifPuanlarimKitapId, true);
        }

        document.getElementById("puanlarim-popup-yorum-metin").textContent =
            metin || "Bu kitaba yorum yazmadın, sadece puan verdin.";
        puanlarimYildizGosterGuncelle(puanlarimSeciliPuan);
        puanlarimDuzenleModunuAyarla(false);

        if (kitap) puanlarimKartiGuncelle(kitap);
    } catch (hata) {
        alert("Kaydedilemedi, tekrar dene.");
    } finally {
        btn.disabled = false;
    }
}

// Düzenlenebilir yıldız seçici: hover ön izlemesi + tıklayınca seç
// (yorum-yildiz-secici ile aynı mantık, ayrı DOM/id üzerinden çalışıyor)
const puanlarimYildizSecici = document.getElementById("puanlarim-popup-yildizlar-duzenle");
if (puanlarimYildizSecici) {
    const puanlarimYildizlari = Array.from(puanlarimYildizSecici.querySelectorAll("i"));

    puanlarimYildizlari.forEach((yildiz) => {
        yildiz.addEventListener("mouseenter", () => {
            const deger = Number(yildiz.dataset.yildiz);
            puanlarimYildizlari.forEach((y) => {
                y.classList.toggle("onizleme", Number(y.dataset.yildiz) <= deger);
            });
        });

        yildiz.addEventListener("click", () => {
            puanlarimSeciliPuan = Number(yildiz.dataset.yildiz);
            puanlarimYildizDuzenleGuncelle(puanlarimSeciliPuan);
        });
    });

    puanlarimYildizSecici.addEventListener("mouseleave", () => {
        puanlarimYildizlari.forEach((y) => y.classList.remove("onizleme"));
    });
}

// Türkçe karakterleri doğru küçülten, boşlukları yok sayan normalize fonksiyonu
function normalizeMetin(str) {
    return str.toLocaleLowerCase("tr-TR").replace(/[\s.]+/g, "");
}

// Arama sonucu bulunamadığında gösterilecek ejderha görseli ile
// altındaki rastgele başlıklar
const aramaBosYazilar = [
    "Ejderha kütüphaneyi dağıttı ama kitabı bulamadı.",
    "Ejderhamız aradı, taradı, bulamadı.",
    "Kütüphane ejderhası bütün rafları devirdi, kitap yine de yok.",
    "Ejderha elinden geleni yaptı ama bu kitap burada değil.",
    "Ejderhamız bu kadarını yapabildi, kusura bakma.",
    "Kitap yok, ejderha bahane üretiyor.",
    "Ejderha 'buradaydı' diyor ama kimse inanmıyor.",
    "Ejderha bu kadar aradı, kitap hâlâ yok.",
    "Ejderhamız didik didik aradı, sonuç sıfır.",
    "Ejderha 47 kitabı yere döktü, aradığın hâlâ yok.",
    "Ejderha bütün kuleyi yıktı, o kitap içinde çıkmadı.",
    "Ejderhamız üzgün, kitap yok.",
    "Bu sefer ejderha bile pes etti.",
    "0 sonuç bulundu, ejderha yerde bulundu.",
];

function aramaBosDurumGoster() {
    const rastgeleIndex = Math.floor(Math.random() * aramaBosYazilar.length);
    document.getElementById("arama-bos-yazi").textContent =
        aramaBosYazilar[rastgeleIndex];
    document.getElementById("arama-bos-durum").style.display = "flex";
}

function aramaBosDurumGizle() {
    document.getElementById("arama-bos-durum").style.display = "none";
}

// --- UYGULANAN FİLTRELER: ÜST ETİKET ÇUBUĞU ---
// Kitapların üstünde, o an aktif olan her filtre için ayrı bir etiket
// gösterilir; etiketin çarpısına tıklanınca SADECE o filtre kaldırılır,
// diğer seçili filtrelere dokunulmaz. filtreEtiketleriniGuncelle()
// kitapAramaFiltrele() içinden çağrılır, çünkü filtreUygula() zaten her
// çalıştığında en son adım olarak kitapAramaFiltrele()'yi çağırıyor —
// yani checkbox, puan, sayfa aralığı ve arama kutusu değişikliklerinin
// hepsi tek bir noktadan (bu fonksiyon) etiket çubuğunu güncel tutar.
const filtreKategoriBasliklari = {
    yazar: "Yazar",
    yayinevi: "Yayınevi",
    cevirmen: "Çevirmen",
    seri: "Seri",
    tur: "Tür",
};

function filtreEtiketiOlustur(icerik, kaldirFn, ariaMetni) {
    const etiket = document.createElement("span");
    etiket.className = "filtre-etiketi";

    if (typeof icerik === "string") {
        const yazi = document.createElement("span");
        yazi.textContent = icerik;
        etiket.appendChild(yazi);
    } else {
        etiket.appendChild(icerik);
    }

    const kaldirBtn = document.createElement("button");
    kaldirBtn.type = "button";
    kaldirBtn.className = "filtre-etiketi-kaldir";
    kaldirBtn.textContent = "✕";
    kaldirBtn.setAttribute("aria-label", `${ariaMetni} filtresini kaldır`);
    kaldirBtn.addEventListener("click", kaldirFn);
    etiket.appendChild(kaldirBtn);

    return etiket;
}

// Puan etiketi: "Puan: 4" yazmak yerine, kaç yıldızsa o kadar dolu sarı
// yıldız yan yana gösterilir (popup ve rozetlerdeki aynı yıldız simgesiyle).
function puanEtiketiIcerigiOlustur(kacYildiz) {
    const kapsayici = document.createElement("span");
    kapsayici.className = "filtre-etiketi-yildizlar";
    for (let i = 1; i <= kacYildiz; i++) {
        const yildiz = document.createElement("i");
        yildiz.className = "fa-solid fa-star";
        kapsayici.appendChild(yildiz);
    }
    return kapsayici;
}

function filtreEtiketleriniGuncelle() {
    const kapsayici = document.getElementById("filtre-etiketleri");
    if (!kapsayici) return;
    kapsayici.innerHTML = "";

    const etiketler = [];

    // Arama kutusu (tek bir etiket olabilir)
    const aramaInput = document.getElementById("kitap-arama-input");
    const aramaDegeri = aramaInput.value.trim();
    if (aramaDegeri) {
        etiketler.push(
            filtreEtiketiOlustur(
                `Arama: ${aramaDegeri}`,
                () => {
                    aramaInput.value = "";
                    kitapAramaGirisDegisti("");
                    kitapAramaDurumunuURLyeYaz("");
                },
                `Arama: ${aramaDegeri}`,
            ),
        );
    }

    // Checkbox tabanlı filtreler: yazar, yayınevi, çevirmen, seri, tür.
    // Her işaretli checkbox kendi etiketini alır (isim, label metninden okunur).
    Object.entries(filtreKategoriBasliklari).forEach(([kategori, baslik]) => {
        const liste = document.getElementById("list-" + kategori);
        if (!liste) return;
        liste.querySelectorAll('input[type="checkbox"]:checked').forEach((cb) => {
            const isim = cb.parentElement.textContent.replace(/\s+/g, " ").trim();
            const etiketMetni = `${baslik}: ${isim}`;
            etiketler.push(
                filtreEtiketiOlustur(
                    etiketMetni,
                    () => {
                        cb.checked = false;
                        filtreDegisti();
                    },
                    etiketMetni,
                ),
            );
        });
    });

    // Puan filtresi (tek seçimli): sayı yazmak yerine kaç yıldızsa o kadar
    // dolu sarı yıldız gösterilir.
    if (secilenPuanFiltresi) {
        etiketler.push(
            filtreEtiketiOlustur(
                puanEtiketiIcerigiOlustur(secilenPuanFiltresi),
                () => {
                    puanFiltresiSec(secilenPuanFiltresi); // zaten seçiliyken çağrılınca kaldırır
                },
                `${secilenPuanFiltresi}★ ve üzeri`,
            ),
        );
    }

    // Sayfa sayısı aralığı: min ve max, sadece varsayılandan değiştirilmişlerse
    // ayrı ayrı gösterilir.
    const rangeMin = document.getElementById("range-min");
    const rangeMax = document.getElementById("range-max");
    if (rangeMin.value !== rangeMin.min) {
        etiketler.push(
            filtreEtiketiOlustur(
                `Minimum: ${rangeMin.value}`,
                () => {
                    rangeMin.value = rangeMin.min;
                    rangeGuncelle();
                    rangeDurumunuURLyeYaz();
                },
                `Minimum: ${rangeMin.value}`,
            ),
        );
    }
    if (rangeMax.value !== rangeMax.max) {
        etiketler.push(
            filtreEtiketiOlustur(
                `Maksimum: ${rangeMax.value}`,
                () => {
                    rangeMax.value = rangeMax.max;
                    rangeGuncelle();
                    rangeDurumunuURLyeYaz();
                },
                `Maksimum: ${rangeMax.value}`,
            ),
        );
    }

    etiketler.forEach((el) => kapsayici.appendChild(el));
    kapsayici.classList.toggle("gorunur", etiketler.length > 0);
}

// deger verilmezse (örn. filtreUygula() içinden çağrıldığında) mevcut
// arama kutusunun değeri kullanılır.
function kitapAramaFiltrele(deger) {
    if (deger !== undefined) {
        document.getElementById("kitap-arama-input").value = deger;
    }
    filtreUygula();
}

// Kullanıcı yazarken: anlık filtrele + URL'yi sessizce güncelle (replaceState).
// Her tuş vuruşunu geçmişe ayrı adım olarak eklemek geri tuşunu
// kullanılamaz hale getirir, bu yüzden push burada yapılmaz.
function kitapAramaGirisDegisti(deger) {
    kitapAramaFiltrele(deger);
    urlGuncelle({ q: deger || null }, { push: false });
}

// Kullanıcı arama kutusundan çıktığında (blur) veya değeri onayladığında:
// bu anı geri tuşuyla dönülebilir bir adım olarak geçmişe ekle.
function kitapAramaDurumunuURLyeYaz(deger) {
    urlGuncelle({ q: deger || null });
}

// --- YAZARLAR SEKMESİ ARAMASI ---
// Kitap aramasıyla aynı mantık; sadece yazar-grid kartlarında ve
// sadece yazar adına göre filtreler. Ayrı bir "qy" URL parametresi
// kullanılır ki kitap araması ("q") ile karışmasın.
function yazarAramaFiltrele(deger) {
    const girisDegeri =
        deger !== undefined ? deger : document.getElementById("yazar-arama-input").value;
    const sorgu = normalizeMetin(girisDegeri);
    const kartlar = document.querySelectorAll("#view-yazarlar .author-card");

    kartlar.forEach((kart) => {
        const adEl = kart.querySelector(".author-name");
        const ad = normalizeMetin(adEl.textContent);
        const eslesiyor = sorgu === "" || ad.includes(sorgu);
        kart.style.display = eslesiyor ? "flex" : "none";
    });
}

function yazarAramaGirisDegisti(deger) {
    yazarAramaFiltrele(deger);
    urlGuncelle({ qy: deger || null }, { push: false });
}

function yazarAramaDurumunuURLyeYaz(deger) {
    urlGuncelle({ qy: deger || null });
}

// --- URL -> ARAYÜZ SENKRONİZASYONU ---
// Adres çubuğundaki mevcut query string'i okuyup arayüzün tamamını
// (görünüm, arama, filtreler, sayfa aralığı, açık popup) buna göre kurar.
// Hem ilk sayfa yüklemesinde hem de tarayıcı geri/ileri tuşuna
// basıldığında (popstate) çağrılır.
function URLdenDurumUygula() {
    const params = urlParametreleriOku();

    // Görünüm (Kitaplar / Yazarlar)
    const viewParam = params.get("view");
    const view =
        viewParam === "yazarlar" || viewParam === "puanlarim" ? viewParam : "kitaplar";
    goruntuDegistir(view, false);

    // Arama kutusu (Kitaplar)
    const q = params.get("q") || "";
    document.getElementById("kitap-arama-input").value = q;

    // Arama kutusu (Yazarlar)
    const qy = params.get("qy") || "";
    document.getElementById("yazar-arama-input").value = qy;

    // Checkbox filtreleri (yazar, yayınevi, çevirmen, tür, seri)
    ["yazar", "yayinevi", "cevirmen", "tur", "seri"].forEach((ad) => {
        const seciliIdler = (params.get(ad) || "")
            .split(",")
            .filter(Boolean)
            .map(Number);
        const liste = document.getElementById("list-" + ad);
        if (!liste) return;
        liste.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
            cb.checked = seciliIdler.includes(parseInt(cb.value));
        });
    });

    // Sayfa sayısı aralığı
    const rangeMin = document.getElementById("range-min");
    const rangeMax = document.getElementById("range-max");
    rangeMin.value = params.get("sayfaMin") || rangeMin.min;
    rangeMax.value = params.get("sayfaMax") || rangeMax.max;
    document.getElementById("range-min-label").textContent = rangeMin.value;
    document.getElementById("range-max-label").textContent = rangeMax.value;
    sayfaTrackGuncelle();

    // Puan filtresi (tek seçimli yıldız)
    const puanParam = params.get("puan");
    secilenPuanFiltresi = puanParam ? Number(puanParam) : null;
    puanFiltresiKutulariniGuncelle();

    // Sayfa numarası (paylaşılan linkte belirli bir sayfaya dönmek için)
    const sayfaParam = parseInt(params.get("sayfa"), 10);
    mevcutSayfa = Number.isInteger(sayfaParam) && sayfaParam > 0 ? sayfaParam : 1;

    // Filtreleri ve aramayı uygula (bu, filtreSecenekleriniGuncelle'yi de tetikler)
    filtreUygula(false);
    yazarAramaFiltrele(qy);

    // Popup'lar: URL'de ilgili id varsa aç, yoksa kapat
    const bookId = params.get("bookId");
    if (bookId && kitapMap[bookId]) {
        popupAc(kitapMap[bookId], false);
    } else {
        popupKapat(false);
    }

    const authorId = params.get("authorId");
    if (authorId && yazarMap[authorId]) {
        yazarPopupAc(yazarMap[authorId], false);
    } else {
        yazarPopupKapat(false);
    }

    const puanKitapId = params.get("puanKitapId");
    if (puanKitapId && kitapMap[puanKitapId]) {
        puanlarimPopupAc(kitapMap[puanKitapId], false);
    } else {
        puanlarimPopupKapat(false);
    }
}

// Tarayıcının geri/ileri tuşlarına basıldığında arayüzü URL'e göre yeniden kur
window.addEventListener("popstate", URLdenDurumUygula);

// Sayfa ilk açıldığında da (paylaşılan bir bağlantı ile gelinmiş olabilir)
// arayüzü URL'deki duruma göre kur
URLdenDurumUygula();