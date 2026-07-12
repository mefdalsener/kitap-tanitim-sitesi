// ================================================================
// bookSave.js
// ----------------------------------------------------------------
// BookSave.cshtml - saf "yeni kitap ekleme" sayfasına özgü JS.
//
// FAZ 3 NOTU: Bu dosyadaki ortak fonksiyonlar (tür yönetimi, dropdown yükleme,
// yazar/çevirmen panel yönetimi, popup'lar, payload toplayıcılar, toTitleCase vb.)
// artık "bookFormCommon.js" dosyasına taşındı. Bu dosyanın BookSave.cshtml'de
// bookFormCommon.js'ten SONRA yüklenmesi gerekir:
//   <script src="~/js/admin/bookFormCommon.js"></script>
//   <script src="~/js/admin/bookSave.js"></script>
//
// Bu dosyada SADECE şunlar kalıyor (BookSave'e özgü oldukları için):
//   - updateExclusivity / linkleriTemizle / isbnTemizle / onIsbnInputChange
//     → scrapePaneli + isbnCard'ın karşılıklı dışlama mantığı (sadece bu sayfada var)
//   - isbnGetir → ISBN ile DB kontrolü (sadece bilgilendirme, edit-mode'a geçmiyor)
//   - getirVeDoldur → Kitapyurdu/Goodreads scrape akışı
//   - resetForm → kayıttan sonra formu sıfırlama (bu sayfaya özgü, "yeni ekleme" davranışı)
//   - kaydet → payload'ı toplayıp /Admin/SaveBook'a POST atan, bookId'yi hep null gönderen akış
//   - sayfa açılış çağrıları
// ================================================================

// ---- ISBN / Link alanları birbirini dışlar ----
function updateExclusivity() {
	const kyVal = document.getElementById('kitapyurduUrl').value.trim();
	const grVal = document.getElementById('goodreadsUrl').value.trim();
	const isbnVal = document.getElementById('isbnInput').value.trim();

	const linkVarMi = !!(kyVal || grVal);
	const isbnVarMi = !!isbnVal;

	const isbnInput = document.getElementById('isbnInput');
	const isbnGetirBtn = document.getElementById('isbnGetirBtn');
	const kyInput = document.getElementById('kitapyurduUrl');
	const grInput = document.getElementById('goodreadsUrl');
	const linkGetirBtn = document.getElementById('getirBtn');
	const isbnNote = document.getElementById('isbnExclusivityNote');
	const linkNote = document.getElementById('linkExclusivityNote');

	if (linkVarMi && !isbnVarMi) {
		isbnInput.disabled = true;
		isbnGetirBtn.disabled = true;
		isbnNote.style.display = 'block';
	} else {
		isbnInput.disabled = false;
		isbnGetirBtn.disabled = false;
		isbnNote.style.display = 'none';
	}

	if (isbnVarMi && !linkVarMi) {
		kyInput.disabled = true;
		grInput.disabled = true;
		linkGetirBtn.disabled = true;
		linkNote.style.display = 'block';
	} else {
		kyInput.disabled = false;
		grInput.disabled = false;
		linkGetirBtn.disabled = false;
		linkNote.style.display = 'none';
	}
}

// ---- Link veya ISBN alanlarını tek tıkla temizleyip moda hızlı geçiş sağlar ----
function linkleriTemizle() {
	document.getElementById('kitapyurduUrl').value = '';
	document.getElementById('goodreadsUrl').value = '';
	updateExclusivity();
}

function isbnTemizle() {
	document.getElementById('isbnInput').value = '';
	document.getElementById('isbnDurum').textContent = '';
	document.getElementById('isbnDurum').className = '';
	updateExclusivity();
}

function onIsbnInputChange() {
	updateExclusivity();
}

// ---- ISBN ile SADECE veritabanından kitap arama (internet çekme yok) ----
// Bu sayfa saf ekleme sayfası olduğundan, ISBN zaten kayıtlıysa formu doldurup
// edit-mode'a GEÇMİYORUZ — kullanıcıyı bilgilendirip duruyoruz. BookUpdate sayfası
// hazır olunca (Faz 4), burada bookId'ye giden bir link/yönlendirme eklenecek.
async function isbnGetir() {
	const isbn = document.getElementById('isbnInput').value.trim();
	const durum = document.getElementById('isbnDurum');

	if (!isbn) {
		alert('ISBN girmelisiniz.');
		return;
	}

	durum.className = '';
	durum.textContent = 'Veritabanında aranıyor...';

	try {
		const res = await fetch('/Admin/GetBookByIsbn?isbn=' + encodeURIComponent(isbn));
		const data = await res.json();

		if (data.error) {
			durum.className = 'error';
			durum.textContent = 'Hata: ' + data.error;
			return;
		}

		if (!data.found) {
			durum.className = '';
			durum.textContent = 'Bu ISBN veritabanında kayıtlı değil. Yeni kitap olarak devam edebilirsiniz.';
			return;
		}

		durum.className = 'error';
		durum.innerHTML = `⚠ Bu ISBN ("${data.book.bookName}") veritabanında zaten kayıtlı. ` +
			`<a href="/Admin/BookUpdate?bookId=${data.bookId}" style="color:#90caf9; text-decoration:underline;">Düzenlemek için tıklayın</a>.`;
	} catch (err) {
		durum.className = 'error';
		durum.textContent = 'Bağlantı hatası: ' + err.message;
	}
}

async function getirVeDoldur() {
	const kyUrl = document.getElementById('kitapyurduUrl').value.trim();
	const grUrl = document.getElementById('goodreadsUrl').value.trim();
	const durum = document.getElementById('getirDurum');
	const btn = document.getElementById('getirBtn');

	if (!kyUrl && !grUrl) {
		alert('En az bir link girmelisiniz.');
		return;
	}

	btn.classList.add('loading');
	btn.disabled = true;
	durum.className = '';
	durum.textContent = 'Veriler çekiliyor, lütfen bekleyin...';
	document.getElementById('eslesmeSonuclari').innerHTML = '';

	try {
		const res = await fetch('/Admin/ScrapeBook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ kitapyurduUrl: kyUrl, goodreadsUrl: grUrl })
		});

		const data = await res.json();

		if (data.error) {
			durum.className = 'error';
			durum.textContent = 'Hata: ' + data.error;
			return;
		}

		// ---- Books ----
		document.getElementById('bookName').value = toTitleCase(data.books.bookName) || '';
		document.getElementById('firstPublishYear').value = data.books.firstPublishYear || '';
		document.getElementById('bookDescription').value = data.books.bookDescription || '';

		document.getElementById('coverUrl').value = data.books.bookCoverImage_URL || '';
		onCoverUrlChange();

		// ---- Authors (çoklu) ----
		const scrapedAuthors = Array.isArray(data.authors) ? data.authors : (data.authors ? [data.authors] : []);
		const matchedAuthors = [];

		document.getElementById('authorsContainer').innerHTML = '';
		authorPanelCount = 0;

		if (scrapedAuthors.length === 0) {
			yazarEkle();
		} else {
			scrapedAuthors.forEach(() => {
				const idx = authorPanelCount++;
				document.getElementById('authorsContainer').insertAdjacentHTML('beforeend', authorPanelHtml(idx));
			});
			renderAuthorOptions();

			scrapedAuthors.forEach((a, idx) => {
				document.getElementById(`authorName_${idx}`).value = toTitleCase(a.authorName) || '';
				document.getElementById(`authorSurname_${idx}`).value = toTitleCase(a.authorSurname) || '';
				document.getElementById(`authorBio_${idx}`).value = a.authorBiography || '';
				document.getElementById(`authorBirthYear_${idx}`).value = a.authorBirthYear || '';
				document.getElementById(`authorDeathYear_${idx}`).value = a.authorDeathYear || '';
				document.getElementById(`authorUrl_${idx}`).value = a.authorImage_URL || '';
				onAuthorUrlChange(idx);

				const matchedAuthor = findMatchingAuthor(a.authorName, a.authorSurname);
				const authorSelect = document.getElementById(`authorSelect_${idx}`);
				if (matchedAuthor) {
					authorSelect.value = matchedAuthor.id;
					yazarSec(idx);
					matchedAuthors.push(matchedAuthor);
				} else {
					authorSelect.value = '';
				}
			});

			panelKaldirButonlariniGuncelle('author');
		}

		// ---- Publisher ----
		const publisherSelect = document.getElementById('publisherSelect');
		const matchedPublisher = findMatchingPublisher(data.publishers.publisherName);
		if (matchedPublisher) {
			publisherSelect.value = matchedPublisher.id;
		} else if (data.publishers.publisherName) {
			const label = '(Yeni) ' + toTitleCase(data.publishers.publisherName);
			let found = [...publisherSelect.options].find(o => o.text === label);
			if (!found) {
				found = new Option(label, '');
				publisherSelect.add(found);
			}
			publisherSelect.value = found.value;
		}

		// ---- Translators (çoklu) ----
		const scrapedTranslators = Array.isArray(data.translators) ? data.translators : (data.translators ? [data.translators] : []);
		const matchedTranslators = [];

		document.getElementById('translatorsContainer').innerHTML = '';
		translatorPanelCount = 0;

		if (scrapedTranslators.length === 0) {
			cevirmenEkle();
		} else {
			scrapedTranslators.forEach(() => {
				const idx = translatorPanelCount++;
				document.getElementById('translatorsContainer').insertAdjacentHTML('beforeend', translatorPanelHtml(idx));
			});
			renderTranslatorOptions();

			scrapedTranslators.forEach((t, idx) => {
				document.getElementById(`translatorName_${idx}`).value = toTitleCase(t.translatorName) || '';
				document.getElementById(`translatorSurname_${idx}`).value = toTitleCase(t.translatorSurname) || '';

				const matchedTranslator = findMatchingTranslator(t.translatorName, t.translatorSurname);
				const translatorSelect = document.getElementById(`translatorSelect_${idx}`);
				if (matchedTranslator) {
					translatorSelect.value = matchedTranslator.id;
					matchedTranslators.push(matchedTranslator);
				} else {
					translatorSelect.value = '';
				}
			});

			panelKaldirButonlariniGuncelle('translator');
		}

		// ---- BookPublisher (ISBN, sayfa sayısı, yayın yılı) ----
		document.getElementById('pageCount').value = data.bookPublishers.pageCount || '';
		document.getElementById('publishYear').value = data.bookPublishers.publishYear || '';
		document.getElementById('isbnInput').value = data.bookPublishers.isbn || '';
		updateExclusivity();

		// Scrape'ten gelen ISBN veritabanında zaten kayıtlıysa kullanıcı ISBN kutusuna
		// hiç dokunmadan bunu öğrenemiyordu (isbnGetir() sadece elle butona basılınca
		// çalışıyordu). ISBN doluysa aynı DB kontrolünü burada da otomatik tetikliyoruz.
		if (data.bookPublishers.isbn) {
			await isbnGetir();
		}

		// ---- Genres ----

		// ---- Genres ----
		selectedGenres = new Set();
		(data.genres || []).forEach(g => {
			const genreLabel = mapGenreToTurkish(g);
			if (!genreLabel) return;
			selectedGenres.add(genreLabel);
		});
		renderGenrePills();

		// ---- Eşleşme mesajları ----
		const matchMessages = [];
		if (matchedPublisher) matchMessages.push(`✓ Var olan yayınevi seçildi: <b>${toTitleCase(matchedPublisher.name)}</b>`);
		matchedAuthors.forEach(a => matchMessages.push(`✓ Var olan yazar seçildi: <b>${toTitleCase(a.name + ' ' + a.surname)}</b>`));
		matchedTranslators.forEach(t => matchMessages.push(`✓ Var olan çevirmen seçildi: <b>${toTitleCase(t.name + ' ' + t.surname)}</b>`));
		document.getElementById('eslesmeSonuclari').innerHTML = matchMessages.join('<br>');

		durum.className = 'success';
		durum.textContent = '✓ Veriler başarıyla dolduruldu. Kontrol edip düzenleyebilirsiniz.';
	} catch (err) {
		durum.className = 'error';
		durum.textContent = 'Bir hata oluştu: ' + err.message;
	} finally {
		btn.classList.remove('loading');
		btn.disabled = false;
	}
}

// ================== KAYDETME AKIŞI ==================

// ---- Formu tamamen sıfırla (kayıttan sonra önceki değerler kalmasın) ----
function resetForm() {
	document.getElementById('kitapyurduUrl').value = '';
	document.getElementById('goodreadsUrl').value = '';
	document.getElementById('isbnInput').value = '';
	document.getElementById('getirDurum').textContent = '';
	document.getElementById('getirDurum').className = '';
	document.getElementById('isbnDurum').textContent = '';
	document.getElementById('isbnDurum').className = '';
	document.getElementById('eslesmeSonuclari').innerHTML = '';

	document.getElementById('bookName').value = '';
	document.getElementById('firstPublishYear').value = '';
	document.getElementById('bookDescription').value = '';
	document.getElementById('coverUrl').value = '';
	onCoverUrlChange();

	document.getElementById('seriesSelect').value = '';
	document.getElementById('seriesOrder').value = '';
	document.getElementById('seriesOrderWarning').style.display = 'none';
	seriesOrderConflict = false;

	selectedGenres = new Set();
	renderGenrePills();

	document.getElementById('pageCount').value = '';
	document.getElementById('publishYear').value = '';

	document.getElementById('publisherSelect').value = '';

	tumCevirmenPanelleriniSifirla();
	tumYazarPanelleriniSifirla();

	updateExclusivity();
}

async function kaydet() {
	const bookName = document.getElementById('bookName').value.trim();
	if (!bookName) {
		alert('Kitap adı boş olamaz.');
		return;
	}

	// ---- Seri sıralaması çakışması varsa kaydı engelle ve o alana götür ----
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
			bookId: null, // BookSave saf ekleme sayfası — her zaman yeni kayıt
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
	saveBtn.textContent = '⏳ Kaydediliyor...';

	try {
		const res = await fetch('/Admin/SaveBook', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Kayıt sırasında hata oluştu: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		showTopNotice(`Kitap başarıyla kaydedildi! (BookID: ${result.bookId})`);

		await loadDropdownData(); // yeni eklenen yazar/yayınevi/çevirmen/kitap listelere yansısın
		resetForm();
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	} finally {
		saveBtn.disabled = false;
		saveBtn.textContent = '💾 Kaydet';
	}
}

// ================== SAYFA AÇILIŞI ==================
renderGenrePills();
tumCevirmenPanelleriniSifirla();
tumYazarPanelleriniSifirla();
loadDropdownData();
updateExclusivity();