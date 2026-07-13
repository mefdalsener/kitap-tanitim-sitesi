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
//   - linkleriTemizle → link kutularını ve otomatik dolan ISBN'i temizler
//   - setFormDisabled → bookFormArea (kitap bilgileri + Kaydet dahil) kilitleme/açma
//   - isbnKayitliKontrolEt → scrape'ten gelen ISBN veritabanında var mı kontrol eder,
//     varsa formu kilitler ve düzenleme sayfasına link verir (ISBN artık elle girilip
//     aranmıyor — sadece "Getir" ile linkten otomatik doluyor)
//   - getirVeDoldur → Kitapyurdu/Goodreads scrape akışı
//   - resetForm → kayıttan sonra formu sıfırlama (bu sayfaya özgü, "yeni ekleme" davranışı)
//   - kaydet → payload'ı toplayıp /Admin/SaveBook'a POST atan, bookId'yi hep null gönderen akış
//   - sayfa açılış çağrıları
// ================================================================

// ---- Link kutularını ve otomatik dolan ISBN'i temizleyip formu tekrar açar ----
function linkleriTemizle() {
    document.getElementById('kitapyurduUrl').value = '';
    document.getElementById('goodreadsUrl').value = '';
    document.getElementById('isbnInput').value = '';
    document.getElementById('isbnDurum').textContent = '';
    document.getElementById('isbnDurum').className = '';
    isbnUyariKapat();
    setFormDisabled(false);
    scrapeLinkleriSifirla();
}

// ---- bookFormArea içindeki TÜM alanları (Kaydet butonu dahil) kilitler/açar ----
function setFormDisabled(disabled) {
    document.querySelectorAll('#bookFormArea input, #bookFormArea select, #bookFormArea textarea, #bookFormArea button')
        .forEach(el => el.disabled = disabled);
}

// ---- ISBN zaten kayıtlı UYARI POPUP'ı ----
function isbnUyariGoster(bookName, bookId) {
    const mesajEl = document.getElementById('isbnUyariMesaj');
    const linkEl = document.getElementById('isbnUyariLink');

    mesajEl.innerHTML = `⚠ Bu ISBN'nin altında halihazırda şu kitap var: <b>${bookName}</b>.`;
    linkEl.href = `/Admin/BookUpdate?bookId=${bookId}`;

    document.getElementById('isbnUyariOverlay').classList.add('active');
}

function isbnUyariKapat() {
    document.getElementById('isbnUyariOverlay').classList.remove('active');
}

// ---- Popup'taki "Temizle" — sadece popup'ı kapatmaz, çekilmiş olan kitapla
// ilgili TÜM alanları (link/ISBN kutuları dahil bookFormArea'daki her şeyi) siler ----
function isbnUyariTemizle() {
    resetForm();
}

// ---- Scrape ile gelen ISBN veritabanında zaten kayıtlı mı kontrol eder ----
// Bu sayfa saf ekleme sayfası olduğundan, ISBN zaten kayıtlıysa formu doldurup
// edit-mode'a GEÇMİYORUZ — bookFormArea'yı (Kaydet dahil) kilitleyip kullanıcıyı
// BookUpdate sayfasına yönlendiren bir link gösteriyoruz.
async function isbnKayitliKontrolEt() {
    const isbn = document.getElementById('isbnInput').value.trim();
    const durum = document.getElementById('isbnDurum');

    if (!isbn) {
        durum.className = '';
        durum.textContent = '';
        setFormDisabled(false);
        return;
    }

    durum.className = '';
    durum.textContent = 'ISBN veritabanında kontrol ediliyor...';

    try {
        const res = await fetch('/Admin/GetBookByIsbn?isbn=' + encodeURIComponent(isbn));
        const data = await res.json();

        if (data.error) {
            durum.className = 'error';
            durum.textContent = 'Hata: ' + data.error;
            setFormDisabled(false);
            return;
        }

        if (!data.found) {
            durum.className = '';
            durum.textContent = '';
            setFormDisabled(false);
            return;
        }

        durum.className = 'error';
        durum.innerHTML = `⚠ Bu ISBN'nin altında bu kitap var: <b>${data.book.bookName}</b>. ` +
            `Bunu düzenlemek için <a href="/Admin/BookUpdate?bookId=${data.bookId}" style="color:#90caf9; text-decoration:underline;">şuraya gidin</a>.`;
        setFormDisabled(true);
        isbnUyariGoster(data.book.bookName, data.bookId);
    } catch (err) {
        durum.className = 'error';
        durum.textContent = 'Bağlantı hatası: ' + err.message;
        setFormDisabled(false);
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

    setFormDisabled(false); // önceki bir kayıtlı-ISBN kilidi varsa yeni denemeyle sıfırlanır
    isbnUyariKapat();

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

        scrapeLinklerGuncelle(data); 

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

        // ISBN artık elle girilip aranmıyor — linkten dolar dolmaz otomatik olarak
        // veritabanında kayıtlı mı diye kontrol edilir. Kayıtlıysa form (Kaydet dahil) kilitlenir.
        await isbnKayitliKontrolEt();

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

    isbnUyariKapat();
    setFormDisabled(false);
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
// ================== SOL KAYAN LİNK PANELİ (Kaynak Linkler) ==================
function scrapeLinksPaneliAcKapat(e) {
    if (e) e.stopPropagation();
    document.getElementById('scrapeLinksWidget').classList.toggle('open');
}

document.addEventListener('click', function (e) {
    const widget = document.getElementById('scrapeLinksWidget');
    if (widget && widget.classList.contains('open') && !widget.contains(e.target)) {
        widget.classList.remove('open');
    }
});

// ---- Scrape sonucundaki linkleri panele yazar ----
function scrapeLinklerGuncelle(data) {
    const bookSection = document.getElementById('scrapeLinksBookSection');
    const kyLink = document.getElementById('scrapeLinkKitapyurdu');
    const grLink = document.getElementById('scrapeLinkGoodreadsBook');
    const authorSection = document.getElementById('scrapeLinksAuthorSection');
    const authorList = document.getElementById('scrapeLinksAuthorList');
    const empty = document.getElementById('scrapeLinksEmpty');

    let hasAnyLink = false;

    if (data.kitapyurduUrl) {
        kyLink.href = data.kitapyurduUrl;
        kyLink.style.display = 'flex';
        hasAnyLink = true;
    } else {
        kyLink.style.display = 'none';
    }

    if (data.goodreadsUrl) {
        grLink.href = data.goodreadsUrl;
        grLink.style.display = 'flex';
        hasAnyLink = true;
    } else {
        grLink.style.display = 'none';
    }

    bookSection.style.display = (data.kitapyurduUrl || data.goodreadsUrl) ? 'block' : 'none';

    authorList.innerHTML = '';
    const scrapedAuthors = Array.isArray(data.authors) ? data.authors : (data.authors ? [data.authors] : []);
    const authorLinks = scrapedAuthors.filter(a => a.authorUrl);

    if (authorLinks.length > 0) {
        authorLinks.forEach(a => {
            const isim = toTitleCase(((a.authorName || '') + ' ' + (a.authorSurname || '')).trim()) || 'Yazar';
            authorList.insertAdjacentHTML('beforeend',
                `<a href="${a.authorUrl}" target="_blank" rel="noopener"><i class="fa-brands fa-goodreads"></i><span>${isim}</span></a>`);
        });
        authorSection.style.display = 'block';
        hasAnyLink = true;
    } else {
        authorSection.style.display = 'none';
    }

    empty.style.display = hasAnyLink ? 'none' : 'block';
}

// ---- Panelde önceki çekimden kalan linkleri temizler ----
function scrapeLinkleriSifirla() {
    scrapeLinklerGuncelle({ kitapyurduUrl: null, goodreadsUrl: null, authors: [] });
}
// ================== SAYFA AÇILIŞI ==================
renderGenrePills();
tumCevirmenPanelleriniSifirla();
tumYazarPanelleriniSifirla();
loadDropdownData();
setFormDisabled(false);