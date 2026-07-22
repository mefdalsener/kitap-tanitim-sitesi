// ================================================================
// userManagement.js — UserManagement.cshtml'e özgü, bağımsız JS.
// Faz Ekstra 2.2 (admin-paneli-modülerleştirme.txt'e ek).
//
// SeriesEdit/CommentModeration ile aynı pattern: bookFormCommon.js'e
// bağımlı DEĞİL, kendi küçük yardımcı fonksiyonlarını burada tekrar
// tanımlıyor.
// ================================================================

let currentPage = 1;
let totalPages = 1;
let currentUserId = null; // detay görünümünde açık olan kullanıcı
let secilenEylemTipi = null;

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

// ---- <input type="datetime-local"> için Date -> "yyyy-MM-ddTHH:mm" ----
function datetimeLocalDegerine(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// =================================================================
// LİSTE GÖRÜNÜMÜ
// =================================================================

// ---- "Ara" butonu: sıfır sayfadan başlatarak uygular ----
function ara() {
    currentPage = 1;
    kullanicilariGetir();
}

function sayfaDegistir(delta) {
    const yeniSayfa = currentPage + delta;
    if (yeniSayfa < 1 || yeniSayfa > totalPages) return;
    currentPage = yeniSayfa;
    kullanicilariGetir();
}

// ---- Filtreleri toplayıp /Admin/SearchModeratedUsers'a GET atar ----
async function kullanicilariGetir() {
    const username = document.getElementById('aramaKullaniciAdi').value.trim();
    const publicId = document.getElementById('aramaKullaniciPublicId').value.trim();

    const params = new URLSearchParams();
    if (username) params.set('username', username);
    if (publicId) params.set('publicId', publicId);
    params.set('page', currentPage);

    const listContainer = document.getElementById('kullaniciListesi');
    listContainer.innerHTML = '<div class="comment-empty-hint">Yükleniyor...</div>';

    try {
        const res = await fetch('/Admin/SearchModeratedUsers?' + params.toString());
        const data = await res.json();

        if (data.error) {
            showTopNotice('Hata: ' + data.error, true);
            listContainer.innerHTML = '<div class="comment-empty-hint">Kullanıcılar yüklenemedi.</div>';
            return;
        }

        totalPages = data.totalPages || 1;
        currentPage = data.page || 1;

        document.getElementById('sonucOzet').textContent =
            data.totalCount === 0 ? 'Sonuç bulunamadı.' : `${data.totalCount} sonuç bulundu.`;
        totalPages = data.totalPages || 1;
        currentPage = data.page || 1;

        document.getElementById('sonucOzet').textContent =
            data.totalCount === 0 ? 'Sonuç bulunamadı.' : `${data.totalCount} sonuç bulundu.`;

        sonAramaSonuclari = data.users || [];   // ---- YENİ (Faz Ekstra 2.3) ----
        kullaniciListesiRenderEt(data.users || []);
        sayfalamaGuncelle();
        kullaniciListesiRenderEt(data.users || []);
        sayfalamaGuncelle();
    } catch (err) {
        showTopNotice('Bağlantı hatası: ' + err.message, true);
        listContainer.innerHTML = '<div class="comment-empty-hint">Kullanıcılar yüklenemedi.</div>';
    }
}

function sayfalamaGuncelle() {
    document.getElementById('sayfaBilgisi').textContent = `Sayfa ${currentPage} / ${totalPages}`;
    document.getElementById('oncekiBtn').disabled = currentPage <= 1;
    document.getElementById('sonrakiBtn').disabled = currentPage >= totalPages;
}

// ---- Kullanıcı şeritlerini ekrana çizer ----
function kullaniciListesiRenderEt(users) {
    const container = document.getElementById('kullaniciListesi');
    container.innerHTML = '';

    if (users.length === 0) {
        container.innerHTML = '<div class="comment-empty-hint">Şu an aktif cezalı kullanıcı yok. (Arama yaparak geçmişi olan herhangi bir kullanıcıyı da bulabilirsiniz.)</div>';
        return;
    }

    users.forEach(u => {
        const strip = document.createElement('div');
        strip.className = 'user-strip';
        strip.onclick = () => kullaniciSec(u.userId);

        let badgeHtml = '';
        if (u.lastActionType) {
            if (u.lastActionType === 'TamBan' && u.isActiveNow) {
                badgeHtml = '<span class="durum-badge tamban">⛔ Tam Ban</span>';
            } else if (u.isActiveNow) {
                badgeHtml = `<span class="durum-badge kismi">${toTitleCase(u.lastActionType)}</span>`;
            } else {
                badgeHtml = `<span class="durum-badge gecmis">Geçmiş: ${toTitleCase(u.lastActionType)}</span>`;
            }
        } else {
            badgeHtml = '<span class="durum-badge gecmis">Kayıt yok</span>';
        }

        const sureBilgi = u.lastActionEndDate
            ? ` — ${tarihFormatla(u.lastActionEndDate)}'e kadar`
            : (u.lastActionType ? ' — Süresiz' : '');

        strip.innerHTML = `
			<div class="user-strip-info">
				<div class="kullanici-adi">${toTitleCase(u.username)} <span style="opacity:0.5;font-weight:400;">(#${u.publicId})</span></div>
				<div class="kullanici-alt">${escapeHtml(u.email)}${u.lastActionType ? sureBilgi : ''}</div>
			</div>
			${badgeHtml}`;

        container.appendChild(strip);
    });
}

// =================================================================
// DETAY GÖRÜNÜMÜ
// =================================================================

async function kullaniciSec(userId) {
    currentUserId = userId;

    try {
        const res = await fetch('/Admin/GetUserModerationHistory?userId=' + encodeURIComponent(userId));
        const data = await res.json();

        if (data.error) {
            showTopNotice('Hata: ' + data.error, true);
            return;
        }

        document.getElementById('detayKullaniciAdi').textContent = `👤 ${toTitleCase(data.user.username)}`;

        const durumYazisi = data.isCurrentlyFullyBanned
            ? (data.effectiveBanEndDate
                ? `⛔ Şu an Tam Ban — ${tarihFormatla(data.effectiveBanEndDate)}'e kadar`
                : '⛔ Şu an Tam Ban — Süresiz')
            : '✔ Şu an Tam Ban değil';

        document.getElementById('detayAltBilgi').textContent =
            `#${data.user.publicId} — ${data.user.email} — ${durumYazisi}`;

        gecmisRenderEt(data.actions || []);

        document.getElementById('listeGorunumu').style.display = 'none';
        document.getElementById('detayGorunumu').style.display = 'block';
    } catch (err) {
        showTopNotice('Bağlantı hatası: ' + err.message, true);
    }
}

function listeyeDon() {
    currentUserId = null;
    document.getElementById('detayGorunumu').style.display = 'none';
    document.getElementById('listeGorunumu').style.display = 'block';
    kullanicilariGetir(); // liste güncel olsun (yeni eylem eklenmiş olabilir)
}

// ---- Zaman çizelgesini ekrana çizer (kronolojik, eskiden yeniye — API'den zaten öyle geliyor) ----
function gecmisRenderEt(actions) {
    const container = document.getElementById('gecmisZamanCizelgesi');
    container.innerHTML = '';

    if (actions.length === 0) {
        container.innerHTML = '<div class="comment-empty-hint">Bu kullanıcı için henüz bir moderasyon kaydı yok.</div>';
        return;
    }

    actions.forEach(a => {
        const item = document.createElement('div');
        item.className = 'timeline-item';

        const sureYazisi = a.endDate
            ? `Bitiş: ${tarihFormatla(a.endDate)}`
            : (a.actionType === 'Uyarı' ? '' : 'Süresiz');

        let ilgiliYorumHtml = '';
        if (a.relatedRating) {
            const vurgulanmisMetin = flaggedTextVurgula(a.relatedRating.comment, a.relatedRating.flaggedText);
            ilgiliYorumHtml = `
				<div class="related-comment-box">
					<div class="rc-kitap">📖 ${toTitleCase(a.relatedRating.bookName || '')} — Yorum #${a.relatedRating.ratingId}</div>
					<div class="rc-metin">${vurgulanmisMetin || '<em>(Yorum metni yok)</em>'}</div>
					${a.relatedRating.isDeleted ? '<span class="rc-silinmis-etiket">🗑 Bu yorum silinmiş</span>' : ''}
				</div>`;
        }

        item.innerHTML = `
			<div class="timeline-marker tip-${a.actionType}"></div>
			<div class="timeline-body">
				<div class="timeline-top-row">
					<span class="timeline-tip">${toTitleCase(a.actionType)}</span>
					<span class="timeline-admin">— ${a.createdByAdminUsername ? toTitleCase(a.createdByAdminUsername) : 'Bilinmiyor'}</span>
					<span class="timeline-tarih">${tarihFormatla(a.createdAt)}</span>
				</div>
				${sureYazisi ? `<div class="timeline-sure">${sureYazisi}</div>` : ''}
				${a.note ? `<div class="timeline-not">${escapeHtml(a.note)}</div>` : ''}
				${ilgiliYorumHtml}
			</div>`;

        container.appendChild(item);
    });
}

// ---- FlaggedText, admin tarafından yorum silinirken serbest metin olarak
// (her satıra bir ifade) girildiği için offset bilgisi yok. Bu yüzden yorum
// metni içinde her satırı case-insensitive arayıp <mark> ile vurguluyoruz.
// Önce HTML kaçışlama yapılır, SONRA vurgulama eklenir — aksi halde <mark>
// etiketleri de kaçışlanıp görünür metin olarak çıkardı. ----
function flaggedTextVurgula(comment, flaggedText) {
    const guvenliMetin = escapeHtml(comment);
    if (!flaggedText) return guvenliMetin;

    const ifadeler = flaggedText
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    if (ifadeler.length === 0) return guvenliMetin;

    let sonuc = guvenliMetin;
    ifadeler.forEach(ifade => {
        const guvenliIfade = escapeHtml(ifade);
        if (!guvenliIfade) return;
        // Regex özel karakterlerini kaçışla, Türkçe harfler dahil case-insensitive ara
        const kacisliIfade = guvenliIfade.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(kacisliIfade, 'gi');
        sonuc = sonuc.replace(regex, match => `<mark>${match}</mark>`);
    });

    return sonuc;
}

// =================================================================
// YENİ EYLEM EKLEME POPUP'I
// =================================================================

function yeniEylemPopuAc() {
    secilenEylemTipi = null;
    document.querySelectorAll('#eylemTipiGrubu .radio-pill').forEach(p => p.classList.remove('selected'));
    document.getElementById('sureSecimRow').classList.remove('gorunur');
    document.getElementById('suresizCheckRow').classList.remove('gorunur');
    document.getElementById('suresizCheck').checked = false;
    document.getElementById('eylemBaslangic').value = datetimeLocalDegerine(new Date());
    document.getElementById('eylemBitis').value = '';
    document.getElementById('eylemBitis').disabled = false;
    document.getElementById('eylemNot').value = '';
    document.getElementById('eylemRatingId').value = '';

    // ---- YENİ (Faz Ekstra 2.3): Rapor bağlantı notu ----
    const notEl = document.getElementById('raporBaglantiNotu');
    if (aktifRaporBaglantisi) {
        notEl.textContent = `🔗 Bu eylem #${aktifRaporBaglantisi} numaralı rapora bağlanacak.`;
        notEl.style.display = 'block';
    } else {
        notEl.style.display = 'none';
    }

    popupAc('yeniEylem');
}

// ---- Eylem tipi seçildiğinde: süre alanlarının görünürlüğünü ayarlar.
// Uyarı ve YasakKaldırma için süre anlamsız (YasakKaldırma'nın EndDate'i
// zaten sunucu tarafında "şimdi"ye zorlanıyor — AdminController.cs). ----
function eylemTipiSec(tip) {
    secilenEylemTipi = tip;
    document.querySelectorAll('#eylemTipiGrubu .radio-pill').forEach(p => {
        p.classList.toggle('selected', p.getAttribute('data-tip') === tip);
    });

    const sureliTipler = ['TamBan', 'YorumYasağı', 'YasakUzatma', 'YasakKısaltma'];
    const sureGorunsun = sureliTipler.includes(tip);

    document.getElementById('sureSecimRow').classList.toggle('gorunur', sureGorunsun);
    document.getElementById('suresizCheckRow').classList.toggle('gorunur', sureGorunsun);
}

function suresizToggle() {
    const suresiz = document.getElementById('suresizCheck').checked;
    const bitisInput = document.getElementById('eylemBitis');
    bitisInput.disabled = suresiz;
    if (suresiz) bitisInput.value = '';
}

// ---- "Kaydet" butonu: /Admin/AddModerationAction'a POST atar ----
async function eylemKaydet() {
    if (!currentUserId) {
        showTopNotice('Kullanıcı bulunamadı, sayfayı yenileyin.', true);
        return;
    }
    if (!secilenEylemTipi) {
        showTopNotice('Bir eylem tipi seçmelisiniz.', true);
        return;
    }

    const suresiz = document.getElementById('suresizCheck').checked;
    const baslangicRaw = document.getElementById('eylemBaslangic').value;
    const bitisRaw = document.getElementById('eylemBitis').value;
    const not = document.getElementById('eylemNot').value.trim();
    const ratingIdRaw = document.getElementById('eylemRatingId').value.trim();

    const sureliTipler = ['TamBan', 'YorumYasağı', 'YasakUzatma', 'YasakKısaltma'];
    if (sureliTipler.includes(secilenEylemTipi) && !suresiz && !bitisRaw) {
        showTopNotice('Bitiş tarihi girmeli ya da "Süresiz" seçmelisiniz.', true);
        return;
    }

    const gonderilecekVeri = {
        userId: currentUserId,
        actionType: secilenEylemTipi,
        note: not || null,
        startDate: baslangicRaw || null,
        endDate: suresiz ? null : (bitisRaw || null),
        relatedRatingId: ratingIdRaw ? parseInt(ratingIdRaw, 10) : null,
        relatedReportId: aktifRaporBaglantisi   // ---- YENİ (Faz Ekstra 2.3) ----
    };

    try {
        const res = await fetch('/Admin/AddModerationAction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(gonderilecekVeri)
        });

        const result = await res.json();

        if (!res.ok || result.error) {
            showTopNotice('Hata: ' + (result.error || 'Bilinmeyen hata'), true);
            return;
        }

        popupKapat('yeniEylem');
        showTopNotice('Eylem kaydedildi.');
        await kullaniciSec(currentUserId); // geçmişi tazele
    } catch (err) {
        showTopNotice('Bağlantı hatası: ' + err.message, true);
    }
}

// ================================================================
// YENİ (Faz Ekstra 2.3): Report panelinden derin link desteği.
// ?publicId=X ile gelinirse arama kutusu doldurulup arama yapılır; sonuç tek
// kullanıcıysa otomatik detay görünümüne geçilir. ?relatedReportId=Y varsa,
// "Yeni Eylem Ekle" popup'ında bağlantı notu göstermek için saklanır.
// ================================================================
let sonAramaSonuclari = [];
const urlParams = new URLSearchParams(window.location.search);
const gelenPublicId = urlParams.get('publicId');
const gelenRelatedReportIdRaw = urlParams.get('relatedReportId');
let aktifRaporBaglantisi = gelenRelatedReportIdRaw ? parseInt(gelenRelatedReportIdRaw, 10) : null;

// ---- Sayfa açılışında: varsayılan filtrelerle ilk aramayı yap ----
if (gelenPublicId) {
    document.getElementById('aramaKullaniciPublicId').value = gelenPublicId;
    kullanicilariGetirVeDerinBaglaSec();
} else {
    kullanicilariGetir();
}

// ---- YENİ: publicId ile deep-link geldiğinde, tek sonuç varsa arama
// yaptırmakla kalmaz, doğrudan o kullanıcının detay görünümüne geçer ----
async function kullanicilariGetirVeDerinBaglaSec() {
    await kullanicilariGetir();
    if (gelenPublicId && sonAramaSonuclari.length === 1) {
        kullaniciSec(sonAramaSonuclari[0].userId);
    }
}