// ================================================================
// reportManagement.js — ReportManagement.cshtml'e özgü, bağımsız JS.
// Faz Ekstra 2.3 (admin-paneli-modülerleştirme.txt'e ek).
//
// UserManagement/CommentModeration ile aynı pattern: bookFormCommon.js'e
// bağımlı DEĞİL, kendi küçük yardımcı fonksiyonlarını burada tekrar
// tanımlıyor.
// ================================================================

let currentPage = 1;
let totalPages = 1;
let currentReportId = null;

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

// ---- Basit HTML kaçışlama ----
function escapeHtml(text) {
	if (!text) return '';
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// ---- Tarihi tr-TR formatında, kısa şekilde gösterir ----
function tarihFormatla(isoString) {
	if (!isoString) return '';
	const d = new Date(isoString);
	return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
		' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

// ---- 1-5 arası puanı yıldız string'ine çevirir ----
function yildizlarOlustur(ratingValue) {
	const dolu = '★'.repeat(ratingValue);
	const bos = '☆'.repeat(Math.max(0, 5 - ratingValue));
	return dolu + bos;
}

// ---- Durum -> CSS sınıfı eşlemesi ----
function durumSinifi(status) {
	const map = {
		'Beklemede': 'beklemede',
		'İnceleniyor': 'inceleniyor',
		'Çözüldü': 'cozuldu',
		'Reddedildi': 'reddedildi'
	};
	return map[status] || 'beklemede';
}

// =================================================================
// LİSTE GÖRÜNÜMÜ
// =================================================================

function ara() {
	currentPage = 1;
	raporlariGetir();
}

function sayfaDegistir(delta) {
	const yeniSayfa = currentPage + delta;
	if (yeniSayfa < 1 || yeniSayfa > totalPages) return;
	currentPage = yeniSayfa;
	raporlariGetir();
}

async function raporlariGetir() {
	const tip = document.getElementById('filtreTip').value;
	const durum = document.getElementById('filtreDurum').value;

	const params = new URLSearchParams();
	params.set('type', tip);
	params.set('status', durum);
	params.set('page', currentPage);

	const listContainer = document.getElementById('raporListesi');
	listContainer.innerHTML = '<div class="comment-empty-hint">Yükleniyor...</div>';

	try {
		const res = await fetch('/Admin/GetReports?' + params.toString());
		const data = await res.json();

		if (data.error) {
			showTopNotice('Hata: ' + data.error, true);
			listContainer.innerHTML = '<div class="comment-empty-hint">Raporlar yüklenemedi.</div>';
			return;
		}

		totalPages = data.totalPages || 1;
		currentPage = data.page || 1;

		document.getElementById('sonucOzet').textContent =
			data.totalCount === 0 ? 'Sonuç bulunamadı.' : `${data.totalCount} sonuç bulundu.`;

		raporListesiRenderEt(data.reports || []);
		sayfalamaGuncelle();
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
		listContainer.innerHTML = '<div class="comment-empty-hint">Raporlar yüklenemedi.</div>';
	}
}

function sayfalamaGuncelle() {
	document.getElementById('sayfaBilgisi').textContent = `Sayfa ${currentPage} / ${totalPages}`;
	document.getElementById('oncekiBtn').disabled = currentPage <= 1;
	document.getElementById('sonrakiBtn').disabled = currentPage >= totalPages;
}

function raporListesiRenderEt(reports) {
	const container = document.getElementById('raporListesi');
	container.innerHTML = '';

	if (reports.length === 0) {
		container.innerHTML = '<div class="comment-empty-hint">Filtre kriterlerine uyan kayıt bulunamadı.</div>';
		return;
	}

	reports.forEach(r => {
		const strip = document.createElement('div');
		strip.className = 'report-strip';
		strip.onclick = () => raporSec(r.id);

		const tipBadge = r.type === 'Şikayet'
			? '<span class="tip-badge tip-sikayet">🚩 Şikayet</span>'
			: '<span class="tip-badge tip-talep">📩 Talep</span>';

		const durumBadge = `<span class="durum-badge ${durumSinifi(r.status)}">${escapeHtml(r.status)}</span>`;

		let altBilgi;
		let mesajOnizleme;
		if (r.type === 'Şikayet' && r.targetRating) {
			altBilgi = `${toTitleCase(r.targetRating.bookName)} — ${toTitleCase(r.targetRating.username)} (${yildizlarOlustur(r.targetRating.ratingValue)})`;
			mesajOnizleme = escapeHtml(r.targetRating.comment) || '<em>(Yorum metni yok)</em>';
		} else {
			altBilgi = `Talep sahibi: ${toTitleCase(r.reporterUsername)} (#${r.reporterPublicId})`;
			mesajOnizleme = escapeHtml(r.message);
		}

		strip.innerHTML = `
			<div class="report-strip-top">
				${tipBadge}
				${durumBadge}
				<span class="tarih">${tarihFormatla(r.createdAt)}</span>
			</div>
			<div class="report-strip-alt">${altBilgi}</div>
			<div class="report-strip-mesaj">${mesajOnizleme}</div>`;

		container.appendChild(strip);
	});
}

// =================================================================
// DETAY GÖRÜNÜMÜ
// =================================================================

async function raporSec(reportId) {
	currentReportId = reportId;

	try {
		const res = await fetch('/Admin/GetReportById?reportId=' + encodeURIComponent(reportId));
		const data = await res.json();

		if (!data.found) {
			showTopNotice('Rapor bulunamadı.', true);
			return;
		}

		const r = data.report;

		document.getElementById('detayBaslik').textContent =
			(r.type === 'Şikayet' ? '🚩 Şikayet' : '📩 Talep') + ` #${r.id}`;

		const durumBadgeEl = document.getElementById('detayDurumBadge');
		durumBadgeEl.textContent = r.status;
		durumBadgeEl.className = 'durum-badge ' + durumSinifi(r.status);

		let altBilgi = `Talep sahibi: ${toTitleCase(r.reporterUsername)} (#${r.reporterPublicId}) — ${tarihFormatla(r.createdAt)}`;
		if (r.reviewedAt) {
			altBilgi += ` — İncelendi: ${r.reviewedByAdminUsername ? toTitleCase(r.reviewedByAdminUsername) : 'Bilinmiyor'} (${tarihFormatla(r.reviewedAt)})`;
		}
		document.getElementById('detayAltBilgi').textContent = altBilgi;

		// ---- Talep: sadece mesaj ----
		const talepKutusu = document.getElementById('talepMesajKutusu');
		const hedefKutusu = document.getElementById('hedefYorumKutusu');

		if (r.type === 'Talep' || !r.targetRating) {
			talepKutusu.style.display = 'block';
			hedefKutusu.style.display = 'none';
			document.getElementById('talepMesajMetni').textContent = r.message;
		} else {
			// ---- Şikayet: hedef yorum özeti + yönlendirme linkleri ----
			talepKutusu.style.display = 'none';
			hedefKutusu.style.display = 'block';

			document.getElementById('hyKitapAdi').textContent = toTitleCase(r.targetRating.bookName || '');
			document.getElementById('hyKullaniciBilgi').textContent =
				`— ${toTitleCase(r.targetRating.username || '')}` + (r.targetRating.isDeleted ? ' — 🗑 Yorum silinmiş' : '');
			document.getElementById('hyYildizlar').textContent = yildizlarOlustur(r.targetRating.ratingValue);
			document.getElementById('hyYorumMetni').textContent = r.targetRating.comment || '(Yorum metni yok)';

			document.getElementById('panel21Link').href =
				'/Admin/CommentModeration?ratingId=' + encodeURIComponent(r.targetRating.ratingId);

			// ---- ÖNEMLİ: ceza eklenecek kullanıcı, şikayeti açan (reporter) DEĞİL,
			// şikayet edilen yorumun YAZARI (targetRating.publicId). ----
			document.getElementById('panel22Link').href =
				'/Admin/UserManagement?publicId=' + encodeURIComponent(r.targetRating.publicId || '') +
				'&relatedReportId=' + encodeURIComponent(r.id);
		}

		document.getElementById('durumSecimi').value = r.status;
		document.getElementById('adminNotu').value = r.adminNote || '';
		document.getElementById('kullaniciMesaji').value = r.userMessage || '';

		document.getElementById('listeGorunumu').style.display = 'none';
		document.getElementById('detayGorunumu').style.display = 'block';
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

function listeyeDon() {
	currentReportId = null;
	document.getElementById('detayGorunumu').style.display = 'none';
	document.getElementById('listeGorunumu').style.display = 'block';
	raporlariGetir(); // liste güncel olsun (durum değişmiş olabilir)
}

// ---- "Kaydet" butonu: /Admin/UpdateReportStatus'a POST atar ----
async function raporGuncelle() {
	if (!currentReportId) {
		showTopNotice('Rapor bulunamadı, sayfayı yenileyin.', true);
		return;
	}

	const gonderilecekVeri = {
		reportId: currentReportId,
		status: document.getElementById('durumSecimi').value,
		adminNote: document.getElementById('adminNotu').value.trim() || null,
		userMessage: document.getElementById('kullaniciMesaji').value.trim() || null
	};

	try {
		const res = await fetch('/Admin/UpdateReportStatus', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(gonderilecekVeri)
		});

		const result = await res.json();

		if (!res.ok || result.error) {
			showTopNotice('Hata: ' + (result.error || 'Bilinmeyen hata'), true);
			return;
		}

		showTopNotice('Rapor güncellendi.');
		await raporSec(currentReportId); // detayı tazele (incelendi bilgisi vb.)
	} catch (err) {
		showTopNotice('Bağlantı hatası: ' + err.message, true);
	}
}

// ---- Sayfa açılışında: varsayılan filtrelerle ilk aramayı yap ----
raporlariGetir();