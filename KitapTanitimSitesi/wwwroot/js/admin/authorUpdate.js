// ================== AuthorUpdate.cshtml — bağımsız yazar düzenleme sayfası ==================
// Bu sayfa AdminIndex'in aksine her zaman "düzenleme modunda"dır:
// - editingAuthorId, setSaveButtonMode gibi mod-geçiş state'i yok
// - Yazar, "Yazar Seç" dropdown'ından seçilir (GetSelectData'daki mevcut liste kullanılır);
//   ?authorId=X query string ile gelinirse dropdown o yazarı otomatik seçer
// - Kaydet butonu doğrudan /Admin/SaveAuthor'a POST atar
// NOT: toTitleCase / showTopNotice burada tekrar tanımlı; Faz 3'te bookFormCommon.js'e
// taşınıp ortaklaştırılacak (şimdilik bilinçli olarak kopya bırakıldı).

let editingAuthorId = null;
let dbAuthors = [];

// ---- Türkçe uyumlu Title Case (baş harfleri büyük) ----
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

// ---- Yazar fotoğrafı URL değişince önizlemeyi güncelle ----
function onAuthorUrlChange() {
	const url = document.getElementById('authorUrl_0').value;
	const preview = document.getElementById('authorPreview_0');
	if (url) {
		preview.innerHTML = `<img src="${url}" alt="Yazar" onerror="this.style.display='none'" />`;
	} else {
		preview.innerHTML = `<span class="placeholder">Fotoğraf</span>`;
	}
}

// ---- Henüz yazar seçilmemişken form alanlarını ve Kaydet butonunu kilitle ----
function formuKilitle(kilitli) {
	['authorName_0', 'authorSurname_0', 'authorBio_0', 'authorBirthYear_0', 'authorDeathYear_0', 'authorUrl_0']
		.forEach(id => { document.getElementById(id).disabled = kilitli; });
	document.getElementById('saveBtn').disabled = kilitli;
}

// ---- Formu temizle (yazar seçimi kaldırıldığında / boş seçenek seçildiğinde) ----
function formuTemizle() {
	document.getElementById('authorName_0').value = '';
	document.getElementById('authorSurname_0').value = '';
	document.getElementById('authorBio_0').value = '';
	document.getElementById('authorBirthYear_0').value = '';
	document.getElementById('authorDeathYear_0').value = '';
	document.getElementById('authorUrl_0').value = '';
	onAuthorUrlChange();
}

// ---- Dropdown'daki bir yazar seçilince (elle ya da otomatik) formu doldurur ----
function authorSecildi() {
	const select = document.getElementById('authorSelect');
	const val = select.value;

	if (!val) {
		editingAuthorId = null;
		formuTemizle();
		formuKilitle(true);
		return;
	}

	const author = dbAuthors.find(a => String(a.id) === String(val));
	if (!author) return;

	document.getElementById('authorName_0').value = toTitleCase(author.name) || '';
	document.getElementById('authorSurname_0').value = toTitleCase(author.surname) || '';
	document.getElementById('authorBio_0').value = author.biography || '';
	document.getElementById('authorBirthYear_0').value = author.birthYear || '';
	document.getElementById('authorDeathYear_0').value = author.deathYear || '';
	document.getElementById('authorUrl_0').value = author.imageUrl || '';
	onAuthorUrlChange();

	editingAuthorId = author.id;
	formuKilitle(false);

	// Adres çubuğunu seçilen yazarla senkron tut — sayfa yenilense ya da
	// bağlantı paylaşılsa aynı yazar açılsın (geçmişe yeni adım eklemeden).
	const url = new URL(window.location.href);
	url.searchParams.set('authorId', author.id);
	window.history.replaceState({}, '', url);
}
// ---- Faz 5: server-side "kayıt bulunamadı" uyarısı ----
function kayitBulunamadiGoster() {
	document.getElementById('popupKayitBulunamadi').classList.add('active');
}

function kayitBulunamadiKapat() {
	document.getElementById('popupKayitBulunamadi').classList.remove('active');
}
// ---- Sayfa açılışında: yazar listesini GetSelectData'dan çek, dropdown'ı doldur,
//      ?authorId=X varsa o yazarı otomatik seç ----
async function sayfaYuklendi() {
	if (typeof kayitBulunamadiSunucuda !== 'undefined' && kayitBulunamadiSunucuda) {
		kayitBulunamadiGoster();
	}
	formuKilitle(true);

	try {
		const res = await fetch('/Admin/GetSelectData');
		const data = await res.json();
		dbAuthors = data.authors || [];

		const select = document.getElementById('authorSelect');
		dbAuthors
			.slice()
			.sort((a, b) => `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`, 'tr-TR'))
			.forEach(a => select.add(new Option(toTitleCase(`${a.name} ${a.surname}`), a.id)));

		const params = new URLSearchParams(window.location.search);
		const authorId = params.get('authorId');
		if (authorId && dbAuthors.some(a => String(a.id) === String(authorId))) {
			select.value = authorId;
			authorSecildi();
		}
	} catch (err) {
		showTopNotice('Yazar listesi yüklenirken bağlantı hatası oluştu: ' + err.message, true);
	}
}

// ---- Güncelle butonuna basınca /Admin/SaveAuthor'a POST at ----
async function yazarGuncelle() {
	if (!editingAuthorId) {
		showTopNotice('Önce yukarıdan bir yazar seçmelisiniz.', true);
		return;
	}

	const name = document.getElementById('authorName_0').value.trim();
	const surname = document.getElementById('authorSurname_0').value.trim();
	if (!name && !surname) {
		alert('Yazar adı veya soyadı boş olamaz.');
		return;
	}

	const payload = {
		authorId: editingAuthorId,
		name: name,
		surname: surname,
		biography: document.getElementById('authorBio_0').value.trim() || null,
		imageUrl: document.getElementById('authorUrl_0').value.trim() || null,
		birthYear: document.getElementById('authorBirthYear_0').value || null,
		deathYear: document.getElementById('authorDeathYear_0').value || null
	};

	const saveBtn = document.getElementById('saveBtn');
	saveBtn.disabled = true;
	saveBtn.textContent = '⏳ Güncelleniyor...';

	try {
		const res = await fetch('/Admin/SaveAuthor', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Güncelleme sırasında hata oluştu: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		showTopNotice(`Yazar bilgileri güncellendi! (AuthorID: ${result.authorId})`);

		// Güncel bilgiler dbAuthors içine de yansısın — sayfa yenilenmeden
		// dropdown'daki isim değişmişse tekrar seçilirse doğru veri gelsin.
		const idx = dbAuthors.findIndex(a => String(a.id) === String(editingAuthorId));
		if (idx !== -1) {
			dbAuthors[idx] = { ...dbAuthors[idx], name, surname, biography: payload.biography, imageUrl: payload.imageUrl, birthYear: payload.birthYear, deathYear: payload.deathYear };
			const select = document.getElementById('authorSelect');
			const opt = [...select.options].find(o => String(o.value) === String(editingAuthorId));
			if (opt) opt.text = toTitleCase(`${name} ${surname}`);
		}
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	} finally {
		saveBtn.disabled = false;
		saveBtn.textContent = '🔄 Güncelle';
	}
}

sayfaYuklendi();