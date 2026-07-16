// ================================================================
// seriesEdit.js — SeriesEdit.cshtml'e özgü, bağımsız JS.
// Faz Ekstra (admin-paneli-modülerleştirme.txt'e ek).
//
// Bu sayfa bookFormCommon.js'e bağımlı DEĞİL — kendi küçük yardımcı
// fonksiyonlarını (toTitleCase, showTopNotice, popupAc/Kapat) burada
// tekrar tanımlıyor. Gerekçe: AuthorUpdate/BookSave'in Faz 1-2'deki
// hali gibi, önce somut/izole çalışan bir sayfa — ortaklaştırma
// (varsa) ileride gerçek kullanım görüldükten sonra yapılır.
//
// DB tek SeriesID/SeriesOrder alanı kullanıyor (kitap başına tek seri).
// Bu yüzden "Seriye Yeni Kitap Ekle" select'i SADECE hiçbir seriye ait
// olmayan kitapları listeler (GetUnassignedBooks) — var olan bir kitabı
// başka bir seriden kazara koparma riski böylece hiç oluşmuyor.
// ================================================================

let dbSeriesList = [];
let currentSeriesId = null;
let currentBooks = []; // en son GetBooksInSeries'ten gelen, ekranda gösterilen liste
let pendingRemoveBookId = null; // "seriden çıkar" popup'ı onaylanana kadar bekleyen kitap

// ---- Türkçe uyumlu Title Case ----
function toTitleCase(text) {
	if (!text) return text;
	const trMap = { 'i': 'İ', 'ı': 'I', 'ş': 'Ş', 'ğ': 'Ğ', 'ü': 'Ü', 'ö': 'Ö', 'ç': 'Ç' };
	return text
		.toLocaleLowerCase('tr-TR')
		.split(' ')
		.map(word => {
			if (word.length === 0) return word;
			const firstChar = word.charAt(0);
			const upperFirst = trMap[firstChar] || firstChar.toLocaleUpperCase('tr-TR');
			return upperFirst + word.slice(1);
		})
		.join(' ');
}

// ---- alert() yerine üstten kayan, engellemeyen bildirim ----
function showTopNotice(message, isError) {
	let notice = document.getElementById('topNotice');
	if (!notice) {
		notice = document.createElement('div');
		notice.id = 'topNotice';
		notice.className = 'top-notice';
		document.body.appendChild(notice);
	}
	notice.className = 'top-notice show' + (isError ? ' error' : '');
	notice.textContent = message;
	clearTimeout(notice._hideTimer);
	notice._hideTimer = setTimeout(() => notice.classList.remove('show'), 3500);
}

// ---- Popup aç/kapat ----
function popupAc(tip) {
	if (tip === 'kitapEkle') {
		if (!currentSeriesId) {
			showTopNotice('Önce yukarıdan bir seri seçip "Getir" ile açmalısınız.', true);
			return;
		}
		kitapEklePopuHazirla();
	}
	if (tip === 'seriAdiDuzenle') {
		if (!currentSeriesId) {
			showTopNotice('Önce yukarıdan bir seri seçip "Getir" ile açmalısınız.', true);
			return;
		}
		const seri = dbSeriesList.find(s => String(s.id) === String(currentSeriesId));
		document.getElementById('seriAdiDuzenleInput').value = seri ? seri.name : '';
	}
	if (tip === 'seriSil') {
		if (!currentSeriesId) {
			showTopNotice('Önce yukarıdan bir seri seçip "Getir" ile açmalısınız.', true);
			return;
		}
		const seri = dbSeriesList.find(s => String(s.id) === String(currentSeriesId));
		const adet = currentBooks.length;
		const kitapUyarisi = adet > 0
			? ` Bu seriye bağlı ${adet} kitap var, silindiğinde bu kitaplar seriden otomatik çıkarılır (kitapların kendisi silinmez).`
			: '';
		document.getElementById('seriSilMesaji').textContent =
			`"${seri ? toTitleCase(seri.name) : ''}" serisini silmek istediğinize emin misiniz?${kitapUyarisi}`;
	}
	document.getElementById('popup' + tip.charAt(0).toUpperCase() + tip.slice(1)).classList.add('active');
}

function popupKapat(tip) {
	document.getElementById('popup' + tip.charAt(0).toUpperCase() + tip.slice(1)).classList.remove('active');
}

// ---- Sayfa açılışında: seri listesini GetSelectData'dan çek, dropdown'ı doldur ----
async function sayfaYuklendi() {
	try {
		const res = await fetch('/Admin/GetSelectData');
		const data = await res.json();
		dbSeriesList = data.series || [];
		renderSeriesSelect();
	} catch (err) {
		showTopNotice('Seri listesi yüklenirken bağlantı hatası oluştu: ' + err.message, true);
	}
}

function renderSeriesSelect() {
	const select = document.getElementById('seriesSelect');
	const currentVal = select.value;
	select.innerHTML = '';
	select.add(new Option('— Seri seçin —', ''));
	dbSeriesList
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'))
		.forEach(s => select.add(new Option(toTitleCase(s.name), s.id)));
	if ([...select.options].some(o => o.value === currentVal)) {
		select.value = currentVal;
	}
}

// ---- Seri dropdown'ı değiştiğinde: "Adını Düzenle" butonu tekrar pasif olur —
//      kullanıcı "Getir"e basıp seçimi teyit etmeden yanlış seriyi düzenlemesin ----
function seriSecimDegisti() {
	document.getElementById('seriAdiDuzenleBtn').disabled = true;
	document.getElementById('seriSilBtn').disabled = true;
}

// ---- "Getir" butonu: seçili serinin kitaplarını çek ve listele ----
async function seriGetir() {
	const select = document.getElementById('seriesSelect');
	const seriesId = select.value;

	if (!seriesId) {
		showTopNotice('Önce bir seri seçmelisiniz.', true);
		return;
	}

	currentSeriesId = seriesId;

	try {
		const res = await fetch('/Admin/GetBooksInSeries?seriesId=' + encodeURIComponent(seriesId));
		const data = await res.json();

		if (data.error) {
			showTopNotice('Hata: ' + data.error, true);
			return;
		}

		currentBooks = data.books || [];
		document.getElementById('kitapListesiCard').style.display = 'block';
		document.getElementById('seriAdiDuzenleBtn').disabled = false;
		document.getElementById('seriSilBtn').disabled = false;
		kitapListesiRenderEt();
	} catch (err) {
		showTopNotice('Kitaplar yüklenirken bağlantı hatası oluştu: ' + err.message, true);
	}
}

// ---- Kitap şeritlerini ekrana çizer ----
function kitapListesiRenderEt() {
	const container = document.getElementById('kitapListesi');
	container.innerHTML = '';
	document.getElementById('siraWarning').style.display = 'none';

	if (currentBooks.length === 0) {
		container.innerHTML = '<div class="series-empty-hint">Bu seride henüz kitap yok. Aşağıdaki "Seriye Yeni Kitap Ekle" ile ekleyebilirsiniz.</div>';
		return;
	}

	currentBooks.forEach(book => {
		const strip = document.createElement('div');
		strip.className = 'series-strip';
		strip.setAttribute('data-bookid', book.bookId);

		const coverHtml = book.bookCoverImageUrl
			? `<img src="${book.bookCoverImageUrl}" alt="Kapak" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>Kapak Yok</span>'" />`
			: `<span class="placeholder">Kapak Yok</span>`;

		strip.innerHTML = `
			<div class="series-strip-cover">${coverHtml}</div>
			<div class="series-strip-info">
				<div class="kitap-adi">${toTitleCase(book.bookName)}</div>
				<div class="yazar-adi">${toTitleCase(book.authorNames) || '— Yazar yok —'}</div>
			</div>			
			<div class="series-strip-order">
				<input type="number" class="siraInput" value="${book.seriesOrder ?? ''}" />
			</div>
			<button type="button" class="series-strip-remove" onclick="kitapSerimdenCikar(${book.bookId})" title="Kitabı seriden çıkar">
				<i class="fa-solid fa-x"></i>
			</button>`;

		container.appendChild(strip);
	});
}

// ---- "Onay" butonu: ekrandaki sıra değerlerini topla, çakışma varsa engelle,
//      yoksa /Admin/UpdateSeriesOrders'a POST at ----
async function onayla() {
	const warningEl = document.getElementById('siraWarning');
	warningEl.style.display = 'none';
	warningEl.textContent = '';

	const strips = [...document.querySelectorAll('#kitapListesi .series-strip')];
	const items = strips.map(strip => {
		const bookId = parseInt(strip.getAttribute('data-bookid'), 10);
		const raw = strip.querySelector('.siraInput').value;
		const seriesOrder = raw === '' ? null : parseInt(raw, 10);
		return { bookId, seriesOrder };
	});

	// ---- Client-side çakışma kontrolü: aynı sıra numarasından birden fazla var mı? ----
	const orderCounts = {};
	items.forEach(i => {
		if (i.seriesOrder === null) return;
		orderCounts[i.seriesOrder] = (orderCounts[i.seriesOrder] || 0) + 1;
	});
	const duplicated = Object.keys(orderCounts).find(k => orderCounts[k] > 1);

	if (duplicated) {
		warningEl.style.display = 'block';
		warningEl.textContent = `⚠ Aynı sıra numarasından (${duplicated}) birden fazla var. Lütfen birini değiştirip tekrar deneyin.`;
		return;
	}

	const onayBtn = document.getElementById('onayBtn');
	onayBtn.disabled = true;
	onayBtn.textContent = '⏳ Kaydediliyor...';

	try {
		const res = await fetch('/Admin/UpdateSeriesOrders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ seriesId: parseInt(currentSeriesId, 10), items })
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			warningEl.style.display = 'block';
			warningEl.textContent = '⚠ ' + (result.error || 'Bilinmeyen hata');
			return;
		}

		showTopNotice('Sıralama başarıyla güncellendi!');
		await seriGetir(); // ekranı güncel veriyle tazele
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	} finally {
		onayBtn.disabled = false;
		onayBtn.textContent = '✔ Onay';
	}
}

// ---- Yeni seri popup'ı: mevcut /Admin/AddSeries endpoint'ini kullanır ----
async function yeniSeriKaydet() {
	const ad = document.getElementById('yeniSeriAdi').value.trim();
	if (!ad) { popupKapat('yeniSeri'); return; }

	try {
		const res = await fetch('/Admin/AddSeries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: ad })
		});
		const data = await res.json();

		if (data.error) {
			showTopNotice('Hata: ' + data.error, true);
			return;
		}

		if (!dbSeriesList.find(s => String(s.id) === String(data.id))) {
			dbSeriesList.push({ id: data.id, name: data.name });
		}
		renderSeriesSelect();
		document.getElementById('seriesSelect').value = data.id;

		showTopNotice(data.alreadyExisted
			? `"${toTitleCase(data.name)}" serisi zaten vardı, seçildi.`
			: `"${toTitleCase(data.name)}" serisi eklendi ve seçildi.`);

		document.getElementById('yeniSeriAdi').value = '';
		popupKapat('yeniSeri');

		// Yeni seri henüz boş — kullanıcı "Getir"e basınca boş liste görecek, bu normal.
		await seriGetir();
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

// ---- "Adını Düzenle" popup'ı: mevcut serinin ismini /Admin/UpdateSeriesName ile günceller ----
async function seriAdiKaydet() {
	const yeniAd = document.getElementById('seriAdiDuzenleInput').value.trim();
	if (!yeniAd) {
		showTopNotice('Seri adı boş olamaz.', true);
		return;
	}

	try {
		const res = await fetch('/Admin/UpdateSeriesName', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ seriesId: parseInt(currentSeriesId, 10), name: yeniAd })
		});
		const data = await res.json();

		if (data.error) {
			showTopNotice('Hata: ' + data.error, true);
			return;
		}

		// Yerel listeyi ve dropdown'ı güncel isimle tazele
		const seri = dbSeriesList.find(s => String(s.id) === String(currentSeriesId));
		if (seri) seri.name = data.name;
		renderSeriesSelect();
		document.getElementById('seriesSelect').value = currentSeriesId;

		popupKapat('seriAdiDuzenle');
		showTopNotice(`Seri adı "${toTitleCase(data.name)}" olarak güncellendi.`);
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

// ---- "Seriye Yeni Kitap Ekle" popup'ı açılmadan önce: hiçbir seriye ait
//      olmayan kitapları çekip select'i doldurur ----
async function kitapEklePopuHazirla() {
	const select = document.getElementById('unassignedBookSelect');
	select.innerHTML = '<option value="">Yükleniyor...</option>';
	document.getElementById('yeniKitapSirasi').value = '';

	try {
		const res = await fetch('/Admin/GetUnassignedBooks');
		const data = await res.json();

		select.innerHTML = '';
		select.add(new Option('— Kitap seçin —', ''));
		(data.books || []).forEach(b => select.add(new Option(toTitleCase(b.name), b.id)));

		if (!data.books || data.books.length === 0) {
			select.add(new Option('(Hiçbir seriye ait olmayan kitap yok)', ''));
		}
	} catch (err) {
		showTopNotice('Kitap listesi yüklenirken bağlantı hatası oluştu: ' + err.message, true);
	}
}

// ---- "Onayla" butonu: seçilen kitabı /Admin/AddBookToSeries ile seriye bağlar ----
async function kitapEkleOnayla() {
	const bookId = document.getElementById('unassignedBookSelect').value;
	const orderVal = document.getElementById('yeniKitapSirasi').value;

	if (!bookId) {
		alert('Bir kitap seçmelisiniz.');
		return;
	}

	try {
		const res = await fetch('/Admin/AddBookToSeries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				bookId: parseInt(bookId, 10),
				seriesId: parseInt(currentSeriesId, 10),
				seriesOrder: orderVal === '' ? null : parseInt(orderVal, 10)
			})
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Hata: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		showTopNotice('Kitap seriye eklendi!');
		popupKapat('kitapEkle');
		await seriGetir(); // listeyi tazele, yeni kitap görünsün
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

// ---- Kitap şeridindeki kırmızı ✕ butonu: sayfa temalı onay popup'ını açar ----
function kitapSerimdenCikar(bookId) {
	const book = currentBooks.find(b => b.bookId === bookId);
	const isim = book ? toTitleCase(book.bookName) : 'Bu kitap';

	pendingRemoveBookId = bookId;
	document.getElementById('kitapSilMesaji').textContent =
		`"${isim}" adlı kitabı seriden çıkarmak istediğinize emin misiniz?`;
	popupAc('kitapSil');
}

// ---- Onay popup'ındaki "Seriden Çıkar" butonu: /Admin/RemoveBookFromSeries'i çağırır ----
async function kitapSilOnayla() {
	if (!pendingRemoveBookId) {
		popupKapat('kitapSil');
		return;
	}

	const bookId = pendingRemoveBookId;
	const book = currentBooks.find(b => b.bookId === bookId);
	const isim = book ? toTitleCase(book.bookName) : 'Kitap';

	try {
		const res = await fetch('/Admin/RemoveBookFromSeries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ bookId, seriesId: parseInt(currentSeriesId, 10) })
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Hata: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		popupKapat('kitapSil');
		showTopNotice(`"${isim}" seriden çıkarıldı.`);
		await seriGetir(); // listeyi tazele
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	} finally {
		pendingRemoveBookId = null;
	}
}

// ---- Onay popup'ındaki "Seriyi Sil" butonu: /Admin/DeleteSeries'i çağırır ----
async function seriSilOnayla() {
	if (!currentSeriesId) {
		popupKapat('seriSil');
		return;
	}

	const seri = dbSeriesList.find(s => String(s.id) === String(currentSeriesId));
	const isim = seri ? toTitleCase(seri.name) : 'Seri';
	const silinenId = currentSeriesId;

	try {
		const res = await fetch('/Admin/DeleteSeries', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ seriesId: parseInt(silinenId, 10) })
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Hata: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		popupKapat('seriSil');
		showTopNotice(`"${isim}" serisi silindi.`);

		// Yerel listeden çıkar, seçimi ve ekranı sıfırla
		dbSeriesList = dbSeriesList.filter(s => String(s.id) !== String(silinenId));
		currentSeriesId = null;
		currentBooks = [];
		renderSeriesSelect();
		document.getElementById('seriesSelect').value = '';
		document.getElementById('kitapListesiCard').style.display = 'none';
		document.getElementById('seriAdiDuzenleBtn').disabled = true;
		document.getElementById('seriSilBtn').disabled = true;
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

sayfaYuklendi();