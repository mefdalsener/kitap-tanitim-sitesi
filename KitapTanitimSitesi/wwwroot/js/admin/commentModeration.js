// ================================================================
// commentModeration.js — CommentModeration.cshtml'e özgü, bağımsız JS.
// Faz Ekstra 2.1 (admin-paneli-modülerleştirme.txt'e ek).
//
// SeriesEdit ile aynı pattern: bookFormCommon.js'e bağımlı DEĞİL,
// kendi küçük yardımcı fonksiyonlarını (toTitleCase, showTopNotice,
// popupAc/Kapat) burada tekrar tanımlıyor.
// ================================================================

let currentPage = 1;
let totalPages = 1;
let pendingDeleteRatingId = null;

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
	document.getElementById('popup' + tip.charAt(0).toUpperCase() + tip.slice(1)).classList.add('active');
}

function popupKapat(tip) {
	document.getElementById('popup' + tip.charAt(0).toUpperCase() + tip.slice(1)).classList.remove('active');
}

// ---- 1-5 arası puanı yıldız string'ine çevirir ----
function yildizlarOlustur(ratingValue) {
	const dolu = '★'.repeat(ratingValue);
	const bos = '☆'.repeat(Math.max(0, 5 - ratingValue));
	return dolu + bos;
}

// ---- Tarihi tr-TR formatında, kısa şekilde gösterir ----
function tarihFormatla(isoString) {
	if (!isoString) return '';
	const d = new Date(isoString);
	return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
		' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// ---- "Ara" butonu: filtreleri sıfır sayfadan başlatarak uygular ----
function ara() {
	currentPage = 1;
	yorumlariGetir();
}

// ---- Sayfalama butonları ----
function sayfaDegistir(delta) {
	const yeniSayfa = currentPage + delta;
	if (yeniSayfa < 1 || yeniSayfa > totalPages) return;
	currentPage = yeniSayfa;
	yorumlariGetir();
}

// ---- Filtreleri toplayıp /Admin/SearchComments'e GET atar ----
async function yorumlariGetir() {
	const bookName = document.getElementById('aramaKitapAdi').value.trim();
	const username = document.getElementById('aramaKullaniciAdi').value.trim();
	const publicId = document.getElementById('aramaKullaniciPublicId').value.trim();
	const status = document.getElementById('aramaDurum').value;

	const params = new URLSearchParams();
	if (bookName) params.set('bookName', bookName);
	if (username) params.set('username', username);
	if (publicId) params.set('publicId', publicId);
	params.set('status', status);
	params.set('page', currentPage);

	const listContainer = document.getElementById('yorumListesi');
	listContainer.innerHTML = '<div class="comment-empty-hint">Yükleniyor...</div>';

	try {
		const res = await fetch('/Admin/SearchComments?' + params.toString());
		const data = await res.json();

		if (data.error) {
			showTopNotice('Hata: ' + data.error, true);
			listContainer.innerHTML = '<div class="comment-empty-hint">Yorumlar yüklenemedi.</div>';
			return;
		}

		totalPages = data.totalPages || 1;
		currentPage = data.page || 1;

		document.getElementById('sonucOzet').textContent =
			data.totalCount === 0 ? 'Sonuç bulunamadı.' : `${data.totalCount} sonuç bulundu.`;

		yorumListesiRenderEt(data.comments || []);
		sayfalamaGuncelle();
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
		listContainer.innerHTML = '<div class="comment-empty-hint">Yorumlar yüklenemedi.</div>';
	}
}

function sayfalamaGuncelle() {
	document.getElementById('sayfaBilgisi').textContent = `Sayfa ${currentPage} / ${totalPages}`;
	document.getElementById('oncekiBtn').disabled = currentPage <= 1;
	document.getElementById('sonrakiBtn').disabled = currentPage >= totalPages;
}

// ---- Yorum şeritlerini ekrana çizer ----
function yorumListesiRenderEt(comments) {
	const container = document.getElementById('yorumListesi');
	container.innerHTML = '';

	if (comments.length === 0) {
		container.innerHTML = '<div class="comment-empty-hint">Arama kriterlerine uyan yorum bulunamadı.</div>';
		return;
	}

	comments.forEach(c => {
		const strip = document.createElement('div');
		strip.className = 'comment-strip' + (c.isDeleted ? ' deleted' : '');

		const coverHtml = c.bookCoverImageUrl
			? `<img src="${c.bookCoverImageUrl}" alt="Kapak" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>Kapak Yok</span>'" />`
			: `<span class="placeholder">Kapak Yok</span>`;

		const durumBadge = c.isDeleted ? '<span class="durum-badge silinmis">🗑 Silinmiş</span>' : '';

		let silinmisDetay = '';
		if (c.isDeleted) {
			const adminBilgi = c.deletedByAdminUsername ? toTitleCase(c.deletedByAdminUsername) : 'Bilinmiyor';
			silinmisDetay = `
				<div class="silinmis-detay">
					${tarihFormatla(c.deletedAt)} tarihinde <strong>${adminBilgi}</strong> tarafından silindi.
					${c.flaggedText ? `<div class="flagged-text">İşaretlenen ifade(ler):<br>${escapeHtml(c.flaggedText)}</div>` : ''}
				</div>`;
		}

		const silButonu = c.isDeleted
			? ''
			: `<button type="button" class="sil-btn" onclick="yorumSilAc(${c.ratingId}, '${escapeForAttr(c.bookName)}', '${escapeForAttr(c.username)}')">🗑 Sil</button>`;

		const yorumMetniId = 'yorumMetni-' + c.ratingId;
		const devamBtnId = 'devamBtn-' + c.ratingId;
		const yorumMetniHtml = escapeHtml(c.comment) || '<em>(Yorum metni yok, sadece puan)</em>';

		strip.innerHTML = `
			<div class="comment-strip-cover">${coverHtml}</div>
			<div class="comment-strip-body">
				<div class="comment-strip-top">
					<span class="kitap-adi">${toTitleCase(c.bookName)}</span>
					<span class="kullanici-bilgi">— ${toTitleCase(c.username)} (#${c.publicId})</span>
					<span class="yildizlar">${yildizlarOlustur(c.ratingValue)}</span>
					${durumBadge}
					<span class="tarih">${tarihFormatla(c.createdAt)}</span>
				</div>
				<div class="yorum-metni clamp" id="${yorumMetniId}">${yorumMetniHtml}</div>
				<button type="button" class="devam-toggle-btn" id="${devamBtnId}" onclick="devamToggle(${c.ratingId})">▼ Devamını Göster</button>
				${silinmisDetay}
			</div>
			<div class="comment-strip-actions">${silButonu}</div>`;

		container.appendChild(strip);
	});

	// ---- Render'dan SONRA: her yorumun gerçekten 5 satırı aşıp aşmadığını
	// scrollHeight/clientHeight karşılaştırmasıyla ölç, sadece taşanlarda
	// "Devamını Göster" butonunu görünür yap. ----
	comments.forEach(c => {
		const el = document.getElementById('yorumMetni-' + c.ratingId);
		const btn = document.getElementById('devamBtn-' + c.ratingId);
		if (el && btn && el.scrollHeight > el.clientHeight + 2) {
			btn.style.display = 'inline-block';
		}
	});
}

// ---- "Devamını Göster / Devamını Gizle" toggle'ı ----
function devamToggle(ratingId) {
	const el = document.getElementById('yorumMetni-' + ratingId);
	const btn = document.getElementById('devamBtn-' + ratingId);
	const genisletildiMi = el.classList.toggle('genisletilmis');
	btn.textContent = genisletildiMi ? '▲ Devamını Gizle' : '▼ Devamını Göster';
}

// ---- Basit HTML kaçışlama (yorum metni kullanıcı girdisi olduğundan) ----
function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// ---- Tek tırnaklı inline onclick attribute'u için kaçışlama ----
function escapeForAttr(text) {
	if (!text) return '';
	return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// ---- "Sil" butonu: onay popup'ını açar ----
function yorumSilAc(ratingId, bookName, username) {
	pendingDeleteRatingId = ratingId;
	document.getElementById('yorumSilMesaji').textContent =
		`"${toTitleCase(bookName)}" kitabına "${toTitleCase(username)}" kullanıcısı tarafından yazılan yorumu silmek istediğinize emin misiniz?`;
	document.getElementById('flaggedTextInput').value = '';
	popupAc('yorumSil');
}

// ---- Popup'taki "Yorumu Sil" butonu: /Admin/DeleteComment'i çağırır ----
async function yorumSilOnayla() {
	if (!pendingDeleteRatingId) {
		popupKapat('yorumSil');
		return;
	}

	const ratingId = pendingDeleteRatingId;
	const flaggedText = document.getElementById('flaggedTextInput').value.trim();

	try {
		const res = await fetch('/Admin/DeleteComment', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ratingId, flaggedText: flaggedText || null })
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Hata: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		popupKapat('yorumSil');
		showTopNotice('Yorum silindi.');
		await yorumlariGetir(); // listeyi tazele
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	} finally {
		pendingDeleteRatingId = null;
	}
}

// ---- Sayfa açılışında: varsayılan filtrelerle (Tümü) ilk aramayı yap ----
yorumlariGetir();
pinliYorumKontrolEt();

// ================================================================
// YENİ (Faz Ekstra 2.3): Report panelinden derin link desteği.
// Mevcut arama/silme akışına dokunmaz — ayrı bir "pinli yorum" kartını besler.
// ================================================================

let pinliRatingId = null;

async function pinliYorumKontrolEt() {
	const urlParams = new URLSearchParams(window.location.search);
	const ratingIdRaw = urlParams.get('ratingId');
	if (!ratingIdRaw) return;

	pinliRatingId = parseInt(ratingIdRaw, 10);
	if (!pinliRatingId) return;

	await pinliYorumYukle();
}

async function pinliYorumYukle() {
	const kart = document.getElementById('pinliYorumKarti');
	const icerik = document.getElementById('pinliYorumIcerik');

	try {
		const res = await fetch('/Admin/GetCommentByRatingId?ratingId=' + encodeURIComponent(pinliRatingId));
		const data = await res.json();

		if (!data.found) {
			icerik.innerHTML = '<div class="comment-empty-hint">Bu yorum bulunamadı (silinmiş kaydı da olmayabilir).</div>';
			kart.style.display = 'block';
			return;
		}

		icerik.innerHTML = pinliYorumHtmlOlustur(data.comment);
		kart.style.display = 'block';
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

function pinliYorumHtmlOlustur(c) {
	const coverHtml = c.bookCoverImageUrl
		? `<img src="${c.bookCoverImageUrl}" alt="Kapak" onerror="this.parentElement.innerHTML='<span class=\\'placeholder\\'>Kapak Yok</span>'" />`
		: `<span class="placeholder">Kapak Yok</span>`;

	const durumBadge = c.isDeleted ? '<span class="durum-badge silinmis">🗑 Silinmiş</span>' : '';

	let silinmisDetay = '';
	if (c.isDeleted) {
		const adminBilgi = c.deletedByAdminUsername ? toTitleCase(c.deletedByAdminUsername) : 'Bilinmiyor';
		silinmisDetay = `
			<div class="silinmis-detay">
				${tarihFormatla(c.deletedAt)} tarihinde <strong>${adminBilgi}</strong> tarafından silindi.
				${c.flaggedText ? `<div class="flagged-text">İşaretlenen ifade(ler):<br>${escapeHtml(c.flaggedText)}</div>` : ''}
			</div>`;
	}

	const silButonu = c.isDeleted
		? ''
		: `<button type="button" class="sil-btn" onclick="yorumSilAc(${c.ratingId}, '${escapeForAttr(c.bookName)}', '${escapeForAttr(c.username)}')">🗑 Sil</button>`;

	return `
		<div class="comment-strip">
			<div class="comment-strip-cover">${coverHtml}</div>
			<div class="comment-strip-body">
				<div class="comment-strip-top">
					<span class="kitap-adi">${toTitleCase(c.bookName)}</span>
					<span class="kullanici-bilgi">— ${toTitleCase(c.username)} (#${c.publicId})</span>
					<span class="yildizlar">${yildizlarOlustur(c.ratingValue)}</span>
					${durumBadge}
					<span class="tarih">${tarihFormatla(c.createdAt)}</span>
				</div>
				<div class="yorum-metni">${escapeHtml(c.comment) || '<em>(Yorum metni yok, sadece puan)</em>'}</div>
				${silinmisDetay}
			</div>
			<div class="comment-strip-actions">${silButonu}</div>
		</div>`;
}