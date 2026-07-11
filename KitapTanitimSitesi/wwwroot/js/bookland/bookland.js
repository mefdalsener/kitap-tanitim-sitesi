const btnKitaplar = document.getElementById("btn-kitaplar");
const btnYazarlar = document.getElementById("btn-yazarlar");
const viewKitaplar = document.getElementById("view-kitaplar");
const viewYazarlar = document.getElementById("view-yazarlar");

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
	if (hedef === "yazarlar") {
		viewYazarlar.classList.add("active");
		viewKitaplar.classList.remove("active");
		btnYazarlar.classList.add("active");
		btnKitaplar.classList.remove("active");
	} else {
		viewKitaplar.classList.add("active");
		viewYazarlar.classList.remove("active");
		btnKitaplar.classList.add("active");
		btnYazarlar.classList.remove("active");
	}
	if (push !== false) {
		urlGuncelle({ view: hedef === "yazarlar" ? "yazarlar" : null });
	}
}

btnKitaplar.addEventListener("click", () => goruntuDegistir("kitaplar"));
btnYazarlar.addEventListener("click", () => goruntuDegistir("yazarlar"));

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

function rangeGuncelle() {
	const min = parseInt(document.getElementById("range-min").value);
	const max = parseInt(document.getElementById("range-max").value);

	if (min > max) document.getElementById("range-min").value = max;
	if (max < min) document.getElementById("range-max").value = min;

	document.getElementById("range-min-label").textContent =
		document.getElementById("range-min").value;
	document.getElementById("range-max-label").textContent =
		document.getElementById("range-max").value;

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

function kitapKartOlustur(kitap) {
	const kart = document.createElement("div");
	kart.className = "book-card";
	kart.style.cursor = "pointer";
	kart.addEventListener("click", () => popupAc(kitap));

	const kapakHtml = kitap.kapak
		? `<img src="${kitap.kapak}" alt="${kitap.ad}" />`
		: "";

	kart.innerHTML = `
		<div class="book-cover">${kapakHtml}</div>
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

function filtreUygula() {
	const yazarSecili = seciliDegerleriAl("yazar");
	const yayineviSecili = seciliDegerleriAl("yayinevi");
	const cevirmenSecili = seciliDegerleriAl("cevirmen");
	const turSecili = seciliDegerleriAl("tur");
	const seriSecili = seciliDegerleriAl("seri");

	const sayfaMin = parseInt(document.getElementById("range-min").value);
	const sayfaMax = parseInt(document.getElementById("range-max").value);

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

	kitaplariRenderEt(filtrelenmis);
	filtreSecenekleriniGuncelle();
	// Filtreler kart listesini sıfırdan oluşturduğu için, arama kutusunda
	// hâlâ bir metin varsa arama filtresini de yeniden uygula
	kitapAramaFiltrele();
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
let aktifKitapId = null;
function popupAc(kitap, push) {
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
	document.getElementById("popup-ilk-yil").textContent = kitap.ilkYil || "—";
	document.getElementById("popup-basim-yili").textContent =
		kitap.basimYili || "—";
	document.getElementById("popup-sayfa").textContent = kitap.sayfa || "—";
	document.getElementById("popup-tur").textContent = kitap.tur || "—";
	document.getElementById("popup-cevirmen").textContent = kitap.cevirmen || "—";
	document.getElementById("popup-aciklama-metin").textContent =
		kitap.aciklama || "Açıklama bulunmuyor.";

	renderSeri(kitap);

	const kaydirmaAlani = document.getElementById("popup-scroll-alani");
	kaydirmaAlani.scrollTop = 0;

	document.getElementById("kitap-popup-overlay").classList.add("aktif");
	document.body.style.overflow = "hidden";

	if (push !== false) {
		urlGuncelle({ view: null, bookId: kitap.id, authorId: null });
	}
}

function kitapDuzenle() {
	if (!aktifKitapId) return;
	window.open("/Admin/Index?bookId=" + aktifKitapId, "_blank");
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

	const kaydirmaAlani = document.getElementById("yazar-popup-scroll-alani");
	kaydirmaAlani.scrollTop = 0;

	document.getElementById("yazar-popup-overlay").classList.add("aktif");
	document.body.style.overflow = "hidden";

	if (push !== false) {
		urlGuncelle({ view: "yazarlar", authorId: yazar.id, bookId: null });
	}
}

function yazarDuzenle() {
	if (!aktifYazarId) return;
	window.open("/Admin/Index?authorId=" + aktifYazarId, "_blank");
}

function yazarPopupKapat(push) {
	document.getElementById("yazar-popup-overlay").classList.remove("aktif");
	document.body.style.overflow = "";
	if (push !== false) {
		urlGuncelle({ authorId: null });
	}
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

// deger verilmezse (örn. filtreUygula() içinden çağrıldığında) mevcut
// arama kutusunun değeri kullanılır.
function kitapAramaFiltrele(deger) {
	const girisDegeri =
		deger !== undefined ? deger : document.getElementById("kitap-arama-input").value;
	const sorgu = normalizeMetin(girisDegeri);
	const kartlar = document.querySelectorAll("#view-kitaplar .book-card");

	let gorunenSayisi = 0;
	kartlar.forEach((kart) => {
		const baslikEl = kart.querySelector(".book-title");
		const baslik = normalizeMetin(baslikEl.textContent);
		const eslesiyor = sorgu === "" || baslik.includes(sorgu);
		kart.style.display = eslesiyor ? "flex" : "none";
		if (eslesiyor) gorunenSayisi++;
	});

	if (gorunenSayisi === 0) {
		aramaBosDurumGoster();
	} else {
		aramaBosDurumGizle();
	}
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
	const view = params.get("view") === "yazarlar" ? "yazarlar" : "kitaplar";
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

	// Filtreleri ve aramayı uygula (bu, filtreSecenekleriniGuncelle'yi de tetikler)
	filtreUygula();
	kitapAramaFiltrele(q);
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
}

// Tarayıcının geri/ileri tuşlarına basıldığında arayüzü URL'e göre yeniden kur
window.addEventListener("popstate", URLdenDurumUygula);

// Sayfa ilk açıldığında da (paylaşılan bir bağlantı ile gelinmiş olabilir)
// arayüzü URL'deki duruma göre kur
URLdenDurumUygula();