// ================================================================
// bookUpdate.js
// ----------------------------------------------------------------
// BookUpdate.cshtml — var olan bir kitabı düzenleme sayfasına özgü JS.
// Faz 4 (admin-paneli-modülerleştirme.txt).
//
// bookFormCommon.js'teki ortak fonksiyonlara (panel yönetimi, dropdown
// yükleme, payload toplayıcılar, tür yönetimi vb.) bağımlıdır — bu yüzden
// BookUpdate.cshtml'de bookFormCommon.js'ten SONRA yüklenmelidir.
//
// BookSave.js'ten FARKI:
//   - scrapePaneli / isbnCard (Getir akışı) yok — sadece düz bir ISBN input'u var
//   - "ISBN'den Getir ile edit-mode'a GEÇME" mantığı yok — sayfa zaten baştan
//     düzenleme modunda açılıyor, editModeTetikleyici gibi bir state hiç gerekmiyor
//   - editingBookId (bookFormCommon.js'te tanımlı ortak değişken), sayfa açılışında
//     query string'deki bookId ile SABİT dolar — checkSeriesOrderConflict onu
//     otomatik kullanıp kitabın kendi sırasını çakışma saymaz
//   - kaydet() payload'a her zaman gerçek bookId'yi ekler → backend SaveBook
//     bunu güncelleme (isUpdate=true) olarak işler
//   - resetForm YOK: kayıttan sonra form sıfırlanmıyor, sadece dropdown verileri
//     tazeleniyor (bu sayfa "aynı kitabı düzenlemeye devam" sayfası, "yeni ekle" değil)
// ================================================================

let bookNotFound = false;

function getBookIdFromUrl() {
	const params = new URLSearchParams(window.location.search);
	const id = params.get('bookId');
	return id ? parseInt(id, 10) : null;
}

// ---- Faz 5: server-side "kayıt bulunamadı" uyarısı ----
function kayitBulunamadiGoster() {
	document.getElementById('popupKayitBulunamadi').classList.add('active');
}

function kayitBulunamadiKapat() {
	document.getElementById('popupKayitBulunamadi').classList.remove('active');
}

// ---- Sayfa açılışında: GetBookById ile veriyi çek ve formu doldur ----
// ---- Verilen bookId'yi yükleyip formu doldurur — hem sayfa açılışında (URL'den),
//      hem de "Kitap Seç" dropdown'ından seçim yapıldığında ortak kullanılır ----
async function kitapVerisiniYukle(bookId) {
	if (!bookId) {
		formuKilitle(true);
		kayitBulunamadiGoster();
		return;
	}

	try {
		const res = await fetch('/Admin/GetBookById?bookId=' + encodeURIComponent(bookId));
		const data = await res.json();

		if (data.error || !data.found) {
			formuKilitle(true);
			kayitBulunamadiGoster();
			return;
		}

		kayitBulunamadiKapat();
		formuKilitle(false);
		formuVeriyleDoldur(data);
	} catch (err) {
		showTopNotice('Kitap verisi alınırken bağlantı hatası oluştu: ' + err.message, true);
		formuKilitle(true);
	}
}

// ---- Sayfa açılışında: URL'deki bookId'yi (varsa) yükler. Server (AdminController)
//      zaten kontrol ettiyse (kayitBulunamadiSunucuda) fetch'e hiç gerek yok ----
async function kitapVerisiniYukleVeDoldur() {
	if (typeof kayitBulunamadiSunucuda !== 'undefined' && kayitBulunamadiSunucuda) {
		formuKilitle(true);
		kayitBulunamadiGoster();
		return;
	}
	await kitapVerisiniYukle(getBookIdFromUrl());
}

// ---- "Kitap Seç" dropdown'ından bir kitap seçilince çalışır: veriyi yükler ve
//      adres çubuğunu senkron tutar (AuthorUpdate'teki authorSecildi ile aynı mantık) ----
async function kitapSecildi() {
	const val = document.getElementById('bookSelect').value;
	if (!val) return; // boş seçenek — mevcut duruma dokunma

	await kitapVerisiniYukle(val);

	const url = new URL(window.location.href);
	url.searchParams.set('bookId', val);
	window.history.replaceState({}, '', url);
}

// ---- "Kitap Seç" dropdown'ını dbBooks ile doldurur, URL'deki bookId varsa
//      otomatik seçili getirir ----
function kitapSeciminiDoldur() {
	const select = document.getElementById('bookSelect');
	select.innerHTML = '<option value="">— Kitap seçin —</option>';
	[...dbBooks]
		.sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'))
		.forEach(b => select.add(new Option(toTitleCase(b.name), b.id)));

	const bookId = getBookIdFromUrl();
	if (bookId && dbBooks.some(b => String(b.id) === String(bookId))) {
		select.value = bookId;
	}
}

// ---- Backend'den gelen kitap verisiyle formu doldurur ----
function formuVeriyleDoldur(data) {
	document.getElementById('bookName').value = data.book.bookName || '';
	document.getElementById('firstPublishYear').value = data.book.firstPublishYear || '';
	document.getElementById('bookDescription').value = data.book.bookDescription || '';
	document.getElementById('coverUrl').value = data.book.bookCoverImageUrl || '';
	onCoverUrlChange();

	document.getElementById('seriesSelect').value = data.book.seriesId || '';
	document.getElementById('seriesOrder').value = data.book.seriesOrder || '';

	yazarPanelleriniVeriyleDoldur(data.authors);

	if (data.publisher && data.publisher.id) {
		document.getElementById('publisherSelect').value = data.publisher.id;
	}

	cevirmenPanelleriniVeriyleDoldur(data.translators);

	document.getElementById('pageCount').value = data.bookPublisher ? (data.bookPublisher.pageCount || '') : '';
	document.getElementById('publishYear').value = data.bookPublisher ? (data.bookPublisher.publishYear || '') : '';
	document.getElementById('isbnInput').value = data.bookPublisher ? (data.bookPublisher.isbn || '') : '';

	selectedGenres = new Set(data.genres || []);
	renderGenrePills();

	// editingBookId, bookFormCommon.js'te tanımlı ortak değişken.
	editingBookId = data.bookId;
	checkSeriesOrderConflict();
}

// ---- Faz 5.1: formuKilitle artık AuthorUpdate'teki gibi parametreli — böylece
// "Kitap Seç" dropdown'ından yeni bir kitap seçildiğinde formu tekrar açabiliyoruz.
function formuKilitle(kilitli) {
	bookNotFound = kilitli;
	document.querySelectorAll('#kitapBilgileriCard input, #kitapBilgileriCard textarea, #kitapBilgileriCard select, #isbnCard input')
		.forEach(el => el.disabled = kilitli);
	document.querySelectorAll('.author-panel input, .author-panel textarea, .author-panel select, .translator-panel input, .translator-panel select')
		.forEach(el => el.disabled = kilitli);
	document.getElementById('yazarEkleBtn').disabled = kilitli;
	document.getElementById('cevirmenEkleBtn').disabled = kilitli;
	document.getElementById('saveBtn').disabled = kilitli;
}

// ================== KAYDETME (GÜNCELLEME) AKIŞI ==================

async function kaydet() {
	if (bookNotFound) return;

	const bookName = document.getElementById('bookName').value.trim();
	if (!bookName) {
		alert('Kitap adı boş olamaz.');
		return;
	}

	checkSeriesOrderConflict();
	if (seriesOrderConflict) {
		const seriesOrderEl = document.getElementById('seriesOrder');
		seriesOrderEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		seriesOrderEl.focus();
		showTopNotice('Seri sıralaması çakışması var, lütfen düzeltin.', true);
		return;
	}

	const authorsPayload = getAuthorsPayload();
	if (authorsPayload.length === 0) {
		alert('En az bir yazar bilgisi girilmeli veya seçilmelidir.');
		return;
	}

	const publisherPayload = getPublisherPayload();
	if (!publisherPayload.id && !publisherPayload.name) {
		alert('Yayınevi bilgisi girilmeli veya seçilmelidir.');
		return;
	}

	const seriesSelect = document.getElementById('seriesSelect');
	const seriesId = parseSelectId(seriesSelect);

	const payload = {
		book: {
			bookId: editingBookId, // BookUpdate her zaman mevcut bir kitabı günceller
			bookName: bookName,
			bookCoverImageUrl: document.getElementById('coverUrl').value.trim() || null,
			bookDescription: document.getElementById('bookDescription').value.trim() || null,
			firstPublishYear: document.getElementById('firstPublishYear').value || null,
			seriesId: seriesId,
			seriesOrder: seriesId ? (document.getElementById('seriesOrder').value || null) : null
		},
		authors: authorsPayload,
		publisher: publisherPayload,
		translators: getTranslatorsPayload(),
		bookPublisher: {
			pageCount: document.getElementById('pageCount').value || null,
			publishYear: document.getElementById('publishYear').value || null,
			isbn: document.getElementById('isbnInput').value.trim() || null
		},
		genres: getSelectedGenres()
	};

	const saveBtn = document.getElementById('saveBtn');
	saveBtn.disabled = true;
	saveBtn.textContent = '⏳ Güncelleniyor...';

	try {
		const res = await fetch('/Admin/SaveBook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Güncelleme sırasında hata oluştu: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		showTopNotice(`Kitap güncellendi! (BookID: ${result.bookId})`);
		await loadDropdownData(); // isim değişikliği vb. güncel bilgiler dropdown listelerine yansısın
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	} finally {
		saveBtn.disabled = false;
		saveBtn.textContent = '🔄 Güncelle';
	}
}

// ================== SAYFA AÇILIŞI ==================
renderGenrePills();
tumCevirmenPanelleriniSifirla();
tumYazarPanelleriniSifirla();
loadDropdownData().then(() => {
	kitapSeciminiDoldur();
	kitapVerisiniYukleVeDoldur();
});