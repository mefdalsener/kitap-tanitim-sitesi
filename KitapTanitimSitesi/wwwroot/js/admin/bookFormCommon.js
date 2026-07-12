// ================================================================
// bookFormCommon.js
// ----------------------------------------------------------------
// BookSave.js VE BookUpdate.js (Faz 4) tarafından ORTAK kullanılan kod.
// Bu dosya, BookSave.js'in çalışan halinden (Faz 2) çıkarıldı — bkz.
// admin-paneli-modülerleştirme.txt Faz 3.
//
// ÖNEMLİ: Bu dosya, sayfaya özel script'ten (bookSave.js / bookUpdate.js)
// ÖNCE yüklenmeli:
//   <script src="~/js/admin/bookFormCommon.js"></script>
//   <script src="~/js/admin/bookSave.js"></script>
//
// Bu dosyada BULUNMAYANLAR (kasıtlı olarak sayfaya özel script'te kalanlar):
//   - updateExclusivity, linkleriTemizle, isbnTemizle, onIsbnInputChange,
//     isbnGetir  → sadece BookSave'de var olan scrapePaneli/isbnCard'a bağımlı
//   - getirVeDoldur → sadece BookSave'e özgü (Kitapyurdu/Goodreads scrape)
//   - resetForm, kaydet → her sayfanın kaydetme akışı farklı (ekleme vs güncelleme)
// ================================================================

// ---- TÜR (GENRE) LİSTESİ ----
let allGenres = [
	"Kurgu", "Kurgu Dışı", "Fantastik", "Epik Fantastik", "Yüksek Fantastik",
	"Fantastik-Bilim Kurgu", "Büyü", "Macera", "Klasik", "Felsefe",
	"Polisiye", "Tarih", "Politik", "Sosyoloji", "Bilim Kurgu",
	"Tarihi Kurgu", "Gizem", "Gerilim", "Korku", "Romantik",
	"Bilim", "Psikoloji", "Biyografi", "Anı", "Şiir",
	"Çocuk", "Genç Yetişkin", "Çizgi Roman", "Grafik Roman", "Manga",
	"Sanat", "Müzik", "Seyahat", "Yemek", "Din",
	"Maneviyat", "Kişisel Gelişim", "İş Dünyası / Ekonomi"
];
let selectedGenres = new Set();

const genreMapEnToTr = {
	"art": "Sanat",
	"adventure": "Macera",
	"biography": "Biyografi",
	"business": "İş Dünyası / Ekonomi",
	"children's": "Çocuk",
	"christian": "Din",
	"classics": "Klasik",
	"comics": "Çizgi Roman",
	"contemporary": "Kurgu",
	"cookbooks": "Yemek",
	"crime": "Polisiye",
	"epic fantasy": "Epik Fantastik",
	"fantasy": "Fantastik",
	"fiction": "Kurgu",
	"graphic novels": "Grafik Roman",
	"high fantasy": "Yüksek Fantastik",
	"historical fiction": "Tarihi Kurgu",
	"history": "Tarih",
	"horror": "Korku",
	"magic": "Büyü",
	"manga": "Manga",
	"memoir": "Anı",
	"music": "Müzik",
	"mystery": "Gizem",
	"nonfiction": "Kurgu Dışı",
	"paranormal": "Fantastik",
	"philosophy": "Felsefe",
	"poetry": "Şiir",
	"politics": "Politik",
	"psychology": "Psikoloji",
	"religion": "Din",
	"romance": "Romantik",
	"science": "Bilim",
	"science fiction": "Bilim Kurgu",
	"science fiction fantasy": "Fantastik-Bilim Kurgu",
	"self help": "Kişisel Gelişim",
	"sociology": "Sosyoloji",
	"suspense": "Gerilim",
	"spirituality": "Maneviyat",
	"thriller": "Gerilim",
	"travel": "Seyahat",
	"young adult": "Genç Yetişkin"
};

function mapGenreToTurkish(englishGenre) {
	if (!englishGenre) return null;
	const key = englishGenre.trim().toLocaleLowerCase('en-US');
	return genreMapEnToTr[key] || null;
}

// Bu ikisi her zaman en başta sabit kalır, alfabetik sıralamaya girmez
const PINNED_GENRES = ["Kurgu", "Kurgu Dışı"];

function getOrderedGenres() {
	const pinned = PINNED_GENRES.filter(g => allGenres.includes(g));
	const rest = allGenres.filter(g => !PINNED_GENRES.includes(g));

	const secili = rest.filter(g => selectedGenres.has(g)).sort((a, b) => a.localeCompare(b, 'tr-TR'));
	const secilmemis = rest.filter(g => !selectedGenres.has(g)).sort((a, b) => a.localeCompare(b, 'tr-TR'));

	return [...pinned, ...secili, ...secilmemis];
}

function renderGenrePills() {
	const container = document.getElementById('genreSelect');
	container.innerHTML = '';

	if (allGenres.length === 0) {
		const hint = document.createElement('div');
		hint.className = 'pill-empty-hint';
		hint.textContent = 'Tür listesi yükleniyor...';
		container.appendChild(hint);
		return;
	}

	getOrderedGenres().forEach(genre => {
		const pill = document.createElement('button');
		pill.type = 'button';
		pill.className = 'pill' + (selectedGenres.has(genre) ? ' selected' : '');
		pill.setAttribute('data-genre', genre);
		pill.innerHTML = '<span class="pill-check">✓</span><span>' + genre + '</span>';
		pill.onclick = () => toggleGenre(genre);
		container.appendChild(pill);
	});
}

function toggleGenre(genre) {
	if (selectedGenres.has(genre)) {
		selectedGenres.delete(genre);
	} else {
		selectedGenres.add(genre);
	}
	renderGenrePills();
}

function getSelectedGenres() {
	return Array.from(selectedGenres);
}

// ================== SQL DROPDOWN VERİLERİ ==================
let dbSeries = [];
let dbPublishers = [];
let dbTranslators = [];
let dbAuthors = [];
let dbBooks = []; // seri sıralaması çakışma kontrolü için

// Düzenleme modunda (BookUpdate, Faz 4) hangi kitabın düzenlendiğini tutar; bu sayede
// checkSeriesOrderConflict kendi kitabını çakışma olarak görmez. BookSave'de her zaman
// null kalır (zararsız) — bu değişkeni şimdiden ortak dosyaya koymamızın nedeni, Faz 4'te
// checkSeriesOrderConflict'i tekrar yazmak zorunda kalmamak.
let editingBookId = null;

async function loadDropdownData() {
	try {
		const res = await fetch('/Admin/GetSelectData');
		const data = await res.json();

		dbSeries = data.series || [];
		dbPublishers = data.publishers || [];
		dbTranslators = data.translators || [];
		dbAuthors = data.authors || [];
		dbBooks = data.books || [];

		renderSimpleSelect('seriesSelect', dbSeries, s => toTitleCase(s.name), '— Seri seçin —');
		renderSimpleSelect('publisherSelect', dbPublishers, p => toTitleCase(p.name), '— Yayınevi seçin —');
		renderTranslatorOptions();
		renderAuthorOptions();
	} catch (err) {
		console.error('Dropdown verileri yüklenemedi:', err);
	}
}

function renderSimpleSelect(selectId, items, labelFn, placeholderText) {
	const select = document.getElementById(selectId);
	select.innerHTML = '';
	const placeholderOption = new Option(placeholderText, '');
	placeholderOption.setAttribute('data-placeholder', '1');
	select.add(placeholderOption);
	items.forEach(item => select.add(new Option(labelFn(item), item.id)));
}

// İsim + soyada göre Türkçe alfabetik sıralama (a-z) için ortak yardımcı fonksiyon.
function sortByFullNameTr(list) {
	return [...list].sort((a, b) =>
		`${a.name || ''} ${a.surname || ''}`.localeCompare(`${b.name || ''} ${b.surname || ''}`, 'tr-TR')
	);
}

function renderTranslatorOptions() {
	const sortedTranslators = sortByFullNameTr(dbTranslators);
	document.querySelectorAll('.translatorSelect').forEach(select => {
		const currentVal = select.value;
		select.innerHTML = '';
		select.add(new Option('— Çevirmen seçin veya yeni çevirmen girin —', ''));
		select.add(new Option('+ Yeni Çevirmen', 'yeni'));
		sortedTranslators.forEach(t => select.add(new Option(toTitleCase(`${t.name} ${t.surname}`), t.id)));
		if ([...select.options].some(o => o.value === currentVal)) {
			select.value = currentVal;
		}
	});
}

function renderAuthorOptions() {
	const sortedAuthors = sortByFullNameTr(dbAuthors);
	document.querySelectorAll('.authorSelect').forEach(select => {
		const currentVal = select.value;
		select.innerHTML = '';
		select.add(new Option('— Yazar seçin veya yeni yazar girin —', ''));
		select.add(new Option('+ Yeni Yazar', 'yeni'));
		sortedAuthors.forEach(a => select.add(new Option(toTitleCase(`${a.name} ${a.surname}`), a.id)));
		if ([...select.options].some(o => o.value === currentVal)) {
			select.value = currentVal;
		}
	});
}

// ================== ÇOKLU YAZAR / ÇEVİRMEN PANEL YÖNETİMİ ==================
let translatorPanelCount = 0;
let authorPanelCount = 0;

function translatorPanelHtml(index) {
	return `
<div class="card translator-panel" data-index="${index}">
	<div class="card-header-row">
		<h2>🈺 Çevirmen Bilgileri</h2>
		<button type="button" class="remove-panel-btn" onclick="cevirmenKaldir(${index})" title="Bu çevirmeni kaldır">✕ Kaldır</button>
	</div>

	<div class="form-group">
		<label>Çevirmen Seç</label>
		<select class="translatorSelect" id="translatorSelect_${index}" onchange="cevirmenSec(${index})">
			<option value="">— Çevirmen seçin veya yeni çevirmen girin —</option>
			<option value="yeni">+ Yeni Çevirmen</option>
		</select>
	</div>

	<div class="two-input-row">
		<div class="form-group">
			<label>Çevirmen Adı</label>
			<input type="text" id="translatorName_${index}" placeholder="Ad..." />
		</div>
		<div class="form-group">
			<label>Çevirmen Soyadı</label>
			<input type="text" id="translatorSurname_${index}" placeholder="Soyad..." />
		</div>
	</div>
</div>`;
}

function authorPanelHtml(index) {
	return `
<div class="card author-panel" data-index="${index}">
	<div class="card-header-row">
		<h2>✍️ Yazar Bilgileri</h2>
		<button type="button" class="remove-panel-btn" onclick="yazarKaldir(${index})" title="Bu yazarı kaldır">✕ Kaldır</button>
	</div>

	<div class="form-group">
		<label>Yazar Seç</label>
		<select class="authorSelect" id="authorSelect_${index}" onchange="yazarSec(${index})">
			<option value="">— Yazar seçin veya yeni yazar girin —</option>
			<option value="yeni">+ Yeni Yazar</option>
		</select>
	</div>

	<div class="author-row">
		<div class="author-fields">
			<div class="two-input-row">
				<div class="form-group">
					<label>Yazar Adı</label>
					<input type="text" id="authorName_${index}" placeholder="Ad..." />
				</div>
				<div class="form-group">
					<label>Yazar Soyadı</label>
					<input type="text" id="authorSurname_${index}" placeholder="Soyad..." />
				</div>
			</div>

			<div class="form-group">
				<label>Biyografi</label>
				<textarea id="authorBio_${index}" placeholder="Yazar hakkında..."></textarea>
			</div>

			<div class="two-input-row">
				<div class="form-group">
					<label>Doğum Yılı</label>
					<input type="number" id="authorBirthYear_${index}" placeholder="Örn: 1821" />
				</div>
				<div class="form-group">
					<label>Ölüm Yılı</label>
					<input type="number" id="authorDeathYear_${index}" placeholder="Örn: 1881" />
				</div>
			</div>
		</div>

		<div class="author-image-col">
			<div class="author-image-preview" id="authorPreview_${index}">
				<span class="placeholder">Fotoğraf</span>
			</div>
			<input type="text" class="url-input" id="authorUrl_${index}"
				   placeholder="Fotoğraf URL'si..."
				   oninput="onAuthorUrlChange(${index})" />
		</div>
	</div>
</div>`;
}

function cevirmenEkle() {
	const index = translatorPanelCount++;
	document.getElementById('translatorsContainer').insertAdjacentHTML('beforeend', translatorPanelHtml(index));
	renderTranslatorOptions();
	panelKaldirButonlariniGuncelle('translator');
}

function yazarEkle() {
	const index = authorPanelCount++;
	document.getElementById('authorsContainer').insertAdjacentHTML('beforeend', authorPanelHtml(index));
	renderAuthorOptions();
	panelKaldirButonlariniGuncelle('author');
}

function cevirmenKaldir(index) {
	const container = document.getElementById('translatorsContainer');
	if (container.children.length <= 1) {
		const select = document.getElementById(`translatorSelect_${index}`);
		if (select) select.value = '';
		cevirmenSec(index);
		return;
	}
	const panel = document.querySelector(`.translator-panel[data-index="${index}"]`);
	if (panel) panel.remove();
	panelKaldirButonlariniGuncelle('translator');
}

function yazarKaldir(index) {
	const container = document.getElementById('authorsContainer');
	if (container.children.length <= 1) {
		const select = document.getElementById(`authorSelect_${index}`);
		if (select) select.value = '';
		yazarSec(index);
		return;
	}
	const panel = document.querySelector(`.author-panel[data-index="${index}"]`);
	if (panel) panel.remove();
	panelKaldirButonlariniGuncelle('author');
}

function panelKaldirButonlariniGuncelle(tip) {
	const container = document.getElementById(tip === 'translator' ? 'translatorsContainer' : 'authorsContainer');
	const panels = [...container.children];
	panels.forEach(panel => {
		const btn = panel.querySelector('.remove-panel-btn');
		if (btn) btn.style.visibility = panels.length > 1 ? 'visible' : 'hidden';
	});
}

function tumCevirmenPanelleriniSifirla() {
	document.getElementById('translatorsContainer').innerHTML = '';
	translatorPanelCount = 0;
	cevirmenEkle();
}

function tumYazarPanelleriniSifirla() {
	document.getElementById('authorsContainer').innerHTML = '';
	authorPanelCount = 0;
	yazarEkle();
}

// ---- Tek bir yazar panelini veriyle doldurur (BookUpdate/Faz 4 için hazır) ----
// "id" varsa dbAuthors üzerinden (yazarSec ile) doldurur; id yoksa alanları doğrudan doldurur.
function authorPanelDoldur(index, a) {
	if (!a) return;
	if (a.id) {
		const select = document.getElementById(`authorSelect_${index}`);
		if (select) select.value = a.id;
		yazarSec(index);
		return;
	}
	document.getElementById(`authorName_${index}`).value = toTitleCase(a.name) || '';
	document.getElementById(`authorSurname_${index}`).value = toTitleCase(a.surname) || '';
	document.getElementById(`authorBio_${index}`).value = a.biography || '';
	document.getElementById(`authorBirthYear_${index}`).value = a.birthYear || '';
	document.getElementById(`authorDeathYear_${index}`).value = a.deathYear || '';
	document.getElementById(`authorUrl_${index}`).value = a.imageUrl || '';
	onAuthorUrlChange(index);
}

// ---- Tek bir çevirmen panelini veriyle doldurur (BookUpdate/Faz 4 için hazır) ----
function translatorPanelDoldur(index, t) {
	if (!t) return;
	if (t.id) {
		const select = document.getElementById(`translatorSelect_${index}`);
		if (select) select.value = t.id;
		cevirmenSec(index);
		return;
	}
	document.getElementById(`translatorName_${index}`).value = toTitleCase(t.name) || '';
	document.getElementById(`translatorSurname_${index}`).value = toTitleCase(t.surname) || '';
}

// data.authors (dizi) formatını kabul eder; mevcut tüm yazar panellerini kaldırıp
// veriye göre yeniden oluşturur. (BookUpdate/Faz 4 tarafından kullanılacak.)
function yazarPanelleriniVeriyleDoldur(authorData) {
	const list = Array.isArray(authorData) ? authorData : (authorData ? [authorData] : []);
	document.getElementById('authorsContainer').innerHTML = '';
	authorPanelCount = 0;

	if (list.length === 0) {
		yazarEkle();
		return;
	}

	list.forEach(() => {
		const index = authorPanelCount++;
		document.getElementById('authorsContainer').insertAdjacentHTML('beforeend', authorPanelHtml(index));
	});
	renderAuthorOptions();
	list.forEach((a, i) => authorPanelDoldur(i, a));
	panelKaldirButonlariniGuncelle('author');
}

// data.translators (dizi) formatını kabul eder. (BookUpdate/Faz 4 tarafından kullanılacak.)
function cevirmenPanelleriniVeriyleDoldur(translatorData) {
	const list = Array.isArray(translatorData) ? translatorData : (translatorData ? [translatorData] : []);
	document.getElementById('translatorsContainer').innerHTML = '';
	translatorPanelCount = 0;

	if (list.length === 0) {
		cevirmenEkle();
		return;
	}

	list.forEach(() => {
		const index = translatorPanelCount++;
		document.getElementById('translatorsContainer').insertAdjacentHTML('beforeend', translatorPanelHtml(index));
	});
	renderTranslatorOptions();
	list.forEach((t, i) => translatorPanelDoldur(i, t));
	panelKaldirButonlariniGuncelle('translator');
}

function normalizeForMatch(text) {
	return (text || '').toLocaleLowerCase('tr-TR').trim().replace(/\s+/g, ' ');
}

function findMatchingPublisher(name) {
	const target = normalizeForMatch(name);
	if (!target) return null;
	return dbPublishers.find(p => normalizeForMatch(p.name) === target) || null;
}

function findMatchingAuthor(name, surname) {
	const target = normalizeForMatch(`${name || ''} ${surname || ''}`);
	if (!target) return null;
	return dbAuthors.find(a => normalizeForMatch(`${a.name} ${a.surname}`) === target) || null;
}

function findMatchingTranslator(name, surname) {
	const target = normalizeForMatch(`${name || ''} ${surname || ''}`);
	if (!target) return null;
	return dbTranslators.find(t => normalizeForMatch(`${t.name} ${t.surname}`) === target) || null;
}
// ================== SQL DROPDOWN VERİLERİ SONU ==================

// ---- Kapak resmi URL değişince önizlemeyi güncelle ----
function onCoverUrlChange() {
	const url = document.getElementById('coverUrl').value;
	const preview = document.getElementById('coverPreview');
	if (url) {
		preview.innerHTML = `<img src="${url}" alt="Kapak" onerror="this.style.display='none'" />`;
	} else {
		preview.innerHTML = `<span class="placeholder">Kapak Resmi</span>`;
	}
}

function yazarSec(index) {
	const select = document.getElementById(`authorSelect_${index}`);
	if (!select) return;
	const val = select.value;

	if (val === '' || val === 'yeni') {
		document.getElementById(`authorName_${index}`).value = '';
		document.getElementById(`authorSurname_${index}`).value = '';
		document.getElementById(`authorBio_${index}`).value = '';
		document.getElementById(`authorBirthYear_${index}`).value = '';
		document.getElementById(`authorDeathYear_${index}`).value = '';
		document.getElementById(`authorUrl_${index}`).value = '';
		document.getElementById(`authorPreview_${index}`).innerHTML = '<span class="placeholder">Fotoğraf</span>';
		return;
	}

	const author = dbAuthors.find(a => String(a.id) === String(val));
	if (!author) return;

	document.getElementById(`authorName_${index}`).value = toTitleCase(author.name) || '';
	document.getElementById(`authorSurname_${index}`).value = toTitleCase(author.surname) || '';
	document.getElementById(`authorBio_${index}`).value = author.biography || '';
	document.getElementById(`authorBirthYear_${index}`).value = author.birthYear || '';
	document.getElementById(`authorDeathYear_${index}`).value = author.deathYear || '';
	document.getElementById(`authorUrl_${index}`).value = author.imageUrl || '';
	onAuthorUrlChange(index);
}

function onAuthorUrlChange(index) {
	const url = document.getElementById(`authorUrl_${index}`).value;
	const preview = document.getElementById(`authorPreview_${index}`);
	if (url) {
		preview.innerHTML = `<img src="${url}" alt="Yazar" onerror="this.style.display='none'" />`;
	} else {
		preview.innerHTML = `<span class="placeholder">Fotoğraf</span>`;
	}
}

// ---- Popup aç/kapat (partial'daki popupSeri/popupYayinevi için ortak) ----
function popupAc(tip) {
	document.getElementById('popup' + tip.charAt(0).toUpperCase() + tip.slice(1)).classList.add('active');
}

function popupKapat(tip) {
	document.getElementById('popup' + tip.charAt(0).toUpperCase() + tip.slice(1)).classList.remove('active');
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

async function seriKaydet() {
	const ad = document.getElementById('yeniSeriAdi').value.trim();
	if (!ad) { popupKapat('seri'); return; }

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

		const select = document.getElementById('seriesSelect');
		let opt = [...select.options].find(o => String(o.value) === String(data.id));
		if (!opt) {
			opt = new Option(toTitleCase(data.name), data.id);
			select.add(opt);
		}
		select.value = data.id;

		if (!dbSeries.find(s => String(s.id) === String(data.id))) {
			dbSeries.push({ id: data.id, name: data.name });
		}

		showTopNotice(data.alreadyExisted
			? `"${toTitleCase(data.name)}" serisi zaten vardı, seçildi.`
			: `"${toTitleCase(data.name)}" serisi eklendi ve seçildi.`);

		document.getElementById('yeniSeriAdi').value = '';
		popupKapat('seri');
		checkSeriesOrderConflict();
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

async function yayineviKaydet() {
	const ad = document.getElementById('yeniYayineviAdi').value.trim();
	if (!ad) { popupKapat('yayinevi'); return; }

	try {
		const res = await fetch('/Admin/AddPublisher', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: ad })
		});
		const data = await res.json();

		if (data.error) {
			showTopNotice('Hata: ' + data.error, true);
			return;
		}

		const select = document.getElementById('publisherSelect');
		let opt = [...select.options].find(o => String(o.value) === String(data.id));
		if (!opt) {
			opt = new Option(toTitleCase(data.name), data.id);
			select.add(opt);
		}
		select.value = data.id;

		if (!dbPublishers.find(p => String(p.id) === String(data.id))) {
			dbPublishers.push({ id: data.id, name: data.name });
		}

		showTopNotice(data.alreadyExisted
			? `"${toTitleCase(data.name)}" yayınevi zaten vardı, seçildi.`
			: `"${toTitleCase(data.name)}" yayınevi eklendi ve seçildi.`);

		document.getElementById('yeniYayineviAdi').value = '';
		popupKapat('yayinevi');
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

// ---- Seri sıralaması çakışma kontrolü ----
let seriesOrderConflict = false;

function checkSeriesOrderConflict() {
	const seriesSelect = document.getElementById('seriesSelect');
	const seriesId = parseSelectId(seriesSelect);
	const orderVal = document.getElementById('seriesOrder').value;
	const warningEl = document.getElementById('seriesOrderWarning');

	seriesOrderConflict = false;
	warningEl.style.display = 'none';
	warningEl.textContent = '';

	if (!seriesId || !orderVal) return;

	const order = parseInt(orderVal, 10);
	// editingBookId BookSave'de her zaman null'dur (kendi kitabını hariç tutma ihtiyacı yok).
	// BookUpdate'te (Faz 4) formuDoldurVeDuzenlemeModunaGec sonrası bu değer dolar ve
	// kitap kendi sırasıyla çakışıyor gibi görünmez.
	const conflict = dbBooks.find(b =>
		String(b.seriesId) === String(seriesId) &&
		Number(b.seriesOrder) === order &&
		String(b.id) !== String(editingBookId || '')
	);

	if (conflict) {
		seriesOrderConflict = true;
		warningEl.style.display = 'block';
		warningEl.textContent = `⚠ Bu seride ${order}. sırada zaten "${conflict.name}" adlı kitap kayıtlı. Lütfen farklı bir sıra numarası girin.`;
	}
}

function cevirmenSec(index) {
	const select = document.getElementById(`translatorSelect_${index}`);
	if (!select) return;
	const val = select.value;

	if (val === '' || val === 'yeni') {
		document.getElementById(`translatorName_${index}`).value = '';
		document.getElementById(`translatorSurname_${index}`).value = '';
		return;
	}

	const translator = dbTranslators.find(t => String(t.id) === String(val));
	if (!translator) return;

	document.getElementById(`translatorName_${index}`).value = toTitleCase(translator.name) || '';
	document.getElementById(`translatorSurname_${index}`).value = toTitleCase(translator.surname) || '';
}

// ---- Türkçe uyumlu Title Case (baş harfleri büyük) fonksiyonu ----
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

// ================== KAYDETME AKIŞI — ORTAK PAYLOAD TOPLAYICILAR ==================

function parseSelectId(selectElement) {
	const val = selectElement.value;
	return /^\d+$/.test(val) ? parseInt(val, 10) : null;
}

function getAuthorsPayload() {
	const panels = document.querySelectorAll('#authorsContainer .author-panel');
	const authors = [];

	panels.forEach(panel => {
		const index = panel.getAttribute('data-index');
		const select = document.getElementById(`authorSelect_${index}`);
		const id = parseSelectId(select);
		const name = document.getElementById(`authorName_${index}`).value.trim() || null;
		const surname = document.getElementById(`authorSurname_${index}`).value.trim() || null;

		if (!id && !name && !surname) return; // boş panel, atla

		authors.push({
			id: id || null,
			name: name,
			surname: surname,
			biography: document.getElementById(`authorBio_${index}`).value.trim() || null,
			imageUrl: document.getElementById(`authorUrl_${index}`).value.trim() || null,
			birthYear: document.getElementById(`authorBirthYear_${index}`).value || null,
			deathYear: document.getElementById(`authorDeathYear_${index}`).value || null
		});
	});

	return authors;
}

function getPublisherPayload() {
	const select = document.getElementById('publisherSelect');
	const id = parseSelectId(select);

	if (id) return { id, name: null };

	const selectedOption = select.options[select.selectedIndex];

	if (!selectedOption || selectedOption.getAttribute('data-placeholder') === '1') {
		return { id: null, name: null };
	}

	let name = selectedOption.text.replace(/^\(Yeni\)\s*/, '').trim();
	return { id: null, name: name || null };
}

function getTranslatorsPayload() {
	const panels = document.querySelectorAll('#translatorsContainer .translator-panel');
	const translators = [];

	panels.forEach(panel => {
		const index = panel.getAttribute('data-index');
		const select = document.getElementById(`translatorSelect_${index}`);
		const id = parseSelectId(select);
		const name = document.getElementById(`translatorName_${index}`).value.trim();
		const surname = document.getElementById(`translatorSurname_${index}`).value.trim();

		if (id) {
			translators.push({ id, name: null, surname: null });
			return;
		}
		if (!name && !surname) return; // çevirmen girilmemiş, opsiyonel alan, atla
		translators.push({ id: null, name, surname });
	});

	return translators;
}