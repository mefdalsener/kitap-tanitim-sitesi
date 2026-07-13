using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using KitapTanitimSitesi.Services;
using Microsoft.EntityFrameworkCore;
using KitapTanitimSitesi.Models;
using KitapTanitimSitesi.Models.ViewModels;

namespace KitapTanitimSitesi.Controllers
{
    [Authorize(Roles = "admin")]
    public class AdminController : Controller
    {
        public IActionResult Index()
        {
            return View("AdminIndex");
        }

        // ---- YENİ EKLENEN ACTION ----
        [HttpPost]
        public async Task<IActionResult> ScrapeBook([FromBody] ScrapeRequest req, [FromServices] BookScraperService scraperService)
        {
            try
            {
                var result = await scraperService.ScrapeAsync(req.KitapyurduUrl, req.GoodreadsUrl);
                return Json(result);
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }
        public async Task<IActionResult> GetSelectData([FromServices] AppDbContext db)
        {
            var series = await db.Series
                .Select(s => new { id = s.SeriesID, name = s.SeriesName })
                .ToListAsync();

            var publishers = await db.Publishers
                .Select(p => new { id = p.PublisherID, name = p.PublisherName })
                .ToListAsync();

            var translators = await db.Translators
                .Select(t => new { id = t.TranslatorID, name = t.TranslatorName, surname = t.TranslatorSurname })
                .ToListAsync();

            var authors = await db.Authors
                .Select(a => new
                {
                    id = a.AuthorID,
                    name = a.AuthorName,
                    surname = a.AuthorSurname,
                    imageUrl = a.AuthorImage_URL,
                    biography = a.AuthorBiography,
                    birthYear = a.AuthorBirthYear,
                    deathYear = a.AuthorDeathYear
                })
                .ToListAsync();

            // ---- YENİ: Seri sıralaması çakışma kontrolü için istemciye kitap listesi ----
            var books = await db.Books
                .Select(b => new { id = b.BookID, name = b.BookName, seriesId = b.SeriesID, seriesOrder = b.SeriesOrder })
                .ToListAsync();

            return Json(new { series, publishers, translators, authors, books });
        }

        // ---- YENİ EKLENEN: Seri ekleme (aynı isimde varsa var olanı döndürür) ----
        [HttpPost]
        public async Task<IActionResult> AddSeries([FromBody] NameRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req?.Name))
                    return Json(new { error = "Seri adı boş olamaz." });

                var name = req.Name.Trim();
                var (id, resultName, alreadyExisted) = await FindOrCreateByNameAsync(
                    db, name,
                    n => db.Series.FirstOrDefaultAsync(s => s.SeriesName.ToLower() == n.ToLower()),
                    n => new Series { SeriesName = n },
                    s => s.SeriesID, s => s.SeriesName);

                return Json(new { id, name = resultName, alreadyExisted });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ EKLENEN: Yayınevi ekleme (aynı isimde varsa var olanı döndürür) ----
        [HttpPost]
        public async Task<IActionResult> AddPublisher([FromBody] NameRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req?.Name))
                    return Json(new { error = "Yayınevi adı boş olamaz." });

                var name = req.Name.Trim();
                var (id, resultName, alreadyExisted) = await FindOrCreateByNameAsync(
                    db, name,
                    n => db.Publishers.FirstOrDefaultAsync(p => p.PublisherName.ToLower() == n.ToLower()),
                    n => new Publisher { PublisherName = n },
                    p => p.PublisherID, p => p.PublisherName);

                return Json(new { id, name = resultName, alreadyExisted });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }
        private async Task<(int id, string name, bool alreadyExisted)> FindOrCreateByNameAsync<T>(
            AppDbContext db, string name,
            Func<string, Task<T>> findExisting,
            Func<string, T> createNew,
            Func<T, int> getId,
            Func<T, string> getName) where T : class
        {
            var existing = await findExisting(name);
            if (existing != null)
                return (getId(existing), getName(existing), true);

            var created = createNew(name);
            db.Add(created);
            await db.SaveChangesAsync();
            return (getId(created), getName(created), false);
        }
        // ---- YENİ EKLENEN: ISBN ile SADECE veritabanından kitap arama (internet çekme YOK) ----
        [HttpGet]
        public async Task<IActionResult> GetBookByIsbn(string isbn, [FromServices] AppDbContext db)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(isbn))
                    return Json(new { found = false });

                isbn = isbn.Trim();

                var bookPublisher = await db.BookPublishers
                    .Include(bp => bp.Publisher)
                    .FirstOrDefaultAsync(bp => bp.ISBN == isbn);

                if (bookPublisher == null)
                    return Json(new { found = false });

                var book = await db.Books
                    .Include(b => b.BookAuthors).ThenInclude(ba => ba.Author)
                    .Include(b => b.BookTranslators).ThenInclude(bt => bt.Translator)
                    .Include(b => b.BookGenres).ThenInclude(bg => bg.Genre)
                    .FirstOrDefaultAsync(b => b.BookID == bookPublisher.BookID);

                if (book == null)
                    return Json(new { found = false });

                return Json(BuildBookDetailJson(book, bookPublisher));
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> SaveBook([FromBody] SaveBookRequest req, [FromServices] AppDbContext db, [FromServices] EntityResolverService resolver)
        {
            using var transaction = await db.Database.BeginTransactionAsync();
            try
            {
                if (req?.Book == null || string.IsNullOrWhiteSpace(req.Book.BookName))
                    return Json(new { error = "Kitap adı gerekli." });

                if (req.Authors == null || req.Authors.Count == 0)
                    return Json(new { error = "En az bir yazar gerekli." });

                // ---- Düzenleme modu mu? (ISBN'den "Getir" ile çekilmiş, BookId gönderilmiş) ----
                bool isUpdate = req.Book.BookId.HasValue && req.Book.BookId.Value > 0;
                Book bookToUpdate = null;

                if (isUpdate)
                {
                    bookToUpdate = await db.Books.FindAsync(req.Book.BookId.Value);
                    if (bookToUpdate == null)
                        return Json(new { error = "Güncellenecek kitap bulunamadı. Sayfayı yenileyip tekrar deneyin." });
                }
                else
                {
                    // Yeni kitap eklenirken bu ISBN zaten kayıtlıysa, yanlışlıkla ikinci bir
                    // kayıt oluşturulmasın. Bu durum normalde frontend'de "Getir" sonrası otomatik
                    // ISBN kontrolüyle yakalanıp form kilitleniyor; burası ona ek bir güvenlik ağı.
                    var isbnToCheck = req.BookPublisher?.Isbn?.Trim();
                    if (!string.IsNullOrWhiteSpace(isbnToCheck))
                    {
                        var isbnAlreadyExists = await db.BookPublishers.AnyAsync(bp => bp.ISBN == isbnToCheck);
                        if (isbnAlreadyExists)
                        {
                            return Json(new
                            {
                                error = $"Bu ISBN ({isbnToCheck}) veritabanında zaten kayıtlı. Yeni kitap olarak eklenemez — düzenlemek için ilgili kitabın güncelleme sayfasına gidin."
                            });
                        }
                    }
                }

                // ---- Seri sıralaması çakışma kontrolü (sunucu tarafı güvenlik ağı) ----
                if (req.Book.SeriesId.HasValue && req.Book.SeriesOrder.HasValue)
                {
                    var conflictingBook = await db.Books.FirstOrDefaultAsync(b =>
                        b.SeriesID == req.Book.SeriesId &&
                        b.SeriesOrder == req.Book.SeriesOrder &&
                        (!isUpdate || b.BookID != bookToUpdate.BookID));

                    if (conflictingBook != null)
                    {
                        return Json(new
                        {
                            error = $"Bu seride {req.Book.SeriesOrder}. sırada zaten \"{conflictingBook.BookName}\" adlı kitap kayıtlı."
                        });
                    }
                }

                // ---- Authors (çoklu) ----
                var authorIds = new List<int>();
                foreach (var authorInput in req.Authors)
                {
                    if (authorInput == null) continue;

                    if (authorInput.Id.HasValue)
                    {
                        // Yazar zaten var olan bir yazar: yeni kayıt açmak yerine, formda
                        // değiştirilmiş olabilecek alanları (ölüm yılı, biyografi, foto vb.) güncelle.
                        int existingAuthorId = authorInput.Id.Value;
                        var authorToUpdate = await db.Authors.FindAsync(existingAuthorId);
                        if (authorToUpdate != null)
                        {
                            if (!string.IsNullOrWhiteSpace(authorInput.Name)) authorToUpdate.AuthorName = authorInput.Name;
                            if (!string.IsNullOrWhiteSpace(authorInput.Surname)) authorToUpdate.AuthorSurname = authorInput.Surname;
                            if (authorInput.Biography != null) authorToUpdate.AuthorBiography = authorInput.Biography;
                            if (authorInput.ImageUrl != null) authorToUpdate.AuthorImage_URL = authorInput.ImageUrl;
                            if (authorInput.BirthYear.HasValue) authorToUpdate.AuthorBirthYear = authorInput.BirthYear;
                            if (authorInput.DeathYear.HasValue) authorToUpdate.AuthorDeathYear = authorInput.DeathYear;
                            await db.SaveChangesAsync();
                        }
                        authorIds.Add(existingAuthorId);
                    }
                    else
                    {
                        if (string.IsNullOrWhiteSpace(authorInput.Name) && string.IsNullOrWhiteSpace(authorInput.Surname))
                            continue; // tamamen boş satır, atla

                        var newAuthor = new Author
                        {
                            AuthorName = authorInput.Name,
                            AuthorSurname = authorInput.Surname,
                            AuthorBiography = authorInput.Biography,
                            AuthorImage_URL = authorInput.ImageUrl,
                            AuthorBirthYear = authorInput.BirthYear,
                            AuthorDeathYear = authorInput.DeathYear
                        };
                        db.Authors.Add(newAuthor);
                        await db.SaveChangesAsync();
                        authorIds.Add(newAuthor.AuthorID);
                    }
                }

                if (authorIds.Count == 0)
                    return Json(new { error = "En az bir yazar gerekli." });

                // ---- Publisher ----
                int publisherId = await resolver.ResolvePublisherAsync(req.Publisher, db);

                // ---- Translators (opsiyonel, çoklu) ----
                var translatorIds = new List<int>();
                if (req.Translators != null)
                {
                    foreach (var translatorInput in req.Translators)
                    {
                        if (translatorInput == null) continue;

                        if (translatorInput.Id.HasValue)
                        {
                            translatorIds.Add(translatorInput.Id.Value);
                        }
                        else if (!string.IsNullOrWhiteSpace(translatorInput.Name) || !string.IsNullOrWhiteSpace(translatorInput.Surname))
                        {
                            var newTranslator = new Translator
                            {
                                TranslatorName = translatorInput.Name,
                                TranslatorSurname = translatorInput.Surname
                            };
                            db.Translators.Add(newTranslator);
                            await db.SaveChangesAsync();
                            translatorIds.Add(newTranslator.TranslatorID);
                        }
                    }
                }

                // ---- Genres (var olanı bul, yoksa oluştur) ----
                var genreIds = new List<int>();
                foreach (var genreName in req.Genres.Distinct())
                    genreIds.Add(await resolver.ResolveGenreAsync(genreName, db));

                // ---- Book: güncelleme mi, yeni ekleme mi? ----
                int bookId;
                if (isUpdate)
                {
                    bookToUpdate.BookName = req.Book.BookName;
                    bookToUpdate.BookCoverImage_URL = req.Book.BookCoverImageUrl;
                    bookToUpdate.BookDescription = req.Book.BookDescription;
                    bookToUpdate.FirstPublishYear = req.Book.FirstPublishYear;
                    bookToUpdate.SeriesID = req.Book.SeriesId;
                    bookToUpdate.SeriesOrder = req.Book.SeriesOrder;
                    await db.SaveChangesAsync();
                    bookId = bookToUpdate.BookID;

                    // Eski ilişkileri temizle — aşağıda güncel bilgilerle yeniden yazılacak
                    db.BookAuthors.RemoveRange(db.BookAuthors.Where(x => x.BookID == bookId));
                    db.BookPublishers.RemoveRange(db.BookPublishers.Where(x => x.BookID == bookId));
                    db.BookTranslators.RemoveRange(db.BookTranslators.Where(x => x.BookID == bookId));
                    db.BookGenres.RemoveRange(db.BookGenres.Where(x => x.BookID == bookId));
                    await db.SaveChangesAsync();
                }
                else
                {
                    var book = new Book
                    {
                        BookName = req.Book.BookName,
                        BookCoverImage_URL = req.Book.BookCoverImageUrl,
                        BookDescription = req.Book.BookDescription,
                        FirstPublishYear = req.Book.FirstPublishYear,
                        SeriesID = req.Book.SeriesId,
                        SeriesOrder = req.Book.SeriesOrder
                    };
                    db.Books.Add(book);
                    await db.SaveChangesAsync();
                    bookId = book.BookID;
                }

                // ---- BookAuthors (çoklu) ----
                foreach (var authorId in authorIds.Distinct())
                {
                    db.BookAuthors.Add(new BookAuthor { BookID = bookId, AuthorID = authorId });
                }

                // ---- BookPublishers ----
                db.BookPublishers.Add(new BookPublisher
                {
                    BookID = bookId,
                    PublisherID = publisherId,
                    PageCount = req.BookPublisher?.PageCount,
                    PublishYear = req.BookPublisher?.PublishYear,
                    ISBN = req.BookPublisher?.Isbn
                });

                // ---- BookTranslators (opsiyonel, çoklu) ----
                foreach (var translatorId in translatorIds.Distinct())
                {
                    db.BookTranslators.Add(new BookTranslator { BookID = bookId, TranslatorID = translatorId });
                }

                // ---- BookGenres ----
                foreach (var genreId in genreIds)
                {
                    db.BookGenres.Add(new BookGenre { BookID = bookId, GenreID = genreId });
                }

                await db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Json(new { success = true, bookId = bookId, updated = isUpdate });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return Json(new { error = ex.Message });
            }
        }
        // ---- YENİ EKLENEN: BookID ile veritabanından kitap arama
        // (Bookland popup'ındaki "Düzenle" butonu bunu kullanır) ----
        [HttpGet]
        public async Task<IActionResult> GetBookById(int bookId, [FromServices] AppDbContext db)
        {
            try
            {
                var book = await db.Books
                    .Include(b => b.BookAuthors).ThenInclude(ba => ba.Author)
                    .Include(b => b.BookPublishers).ThenInclude(bp => bp.Publisher)
                    .Include(b => b.BookTranslators).ThenInclude(bt => bt.Translator)
                    .Include(b => b.BookGenres).ThenInclude(bg => bg.Genre)
                    .FirstOrDefaultAsync(b => b.BookID == bookId);

                if (book == null)
                    return Json(new { found = false });

                var bookPublisherLink = book.BookPublishers.FirstOrDefault();
                return Json(BuildBookDetailJson(book, bookPublisherLink));
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }
        private object BuildBookDetailJson(Book book, BookPublisher bookPublisherLink)
        {
            var authorsList = book.BookAuthors.Select(ba => ba.Author).ToList();
            var translatorsList = book.BookTranslators.Select(bt => bt.Translator).ToList();
            var genreNames = book.BookGenres.Select(bg => bg.Genre.GenreName).ToList();

            return new
            {
                found = true,
                bookId = book.BookID,
                book = new
                {
                    bookName = book.BookName,
                    bookCoverImageUrl = book.BookCoverImage_URL,
                    bookDescription = book.BookDescription,
                    firstPublishYear = book.FirstPublishYear,
                    seriesId = book.SeriesID,
                    seriesOrder = book.SeriesOrder
                },
                authors = authorsList.Select(a => new
                {
                    id = a.AuthorID,
                    name = a.AuthorName,
                    surname = a.AuthorSurname,
                    biography = a.AuthorBiography,
                    imageUrl = a.AuthorImage_URL,
                    birthYear = a.AuthorBirthYear,
                    deathYear = a.AuthorDeathYear
                }).ToList(),
                publisher = bookPublisherLink == null ? null : new
                {
                    id = bookPublisherLink.PublisherID,
                    name = bookPublisherLink.Publisher?.PublisherName
                },
                translators = translatorsList.Select(t => new
                {
                    id = t.TranslatorID,
                    name = t.TranslatorName,
                    surname = t.TranslatorSurname
                }).ToList(),
                bookPublisher = bookPublisherLink == null ? null : new
                {
                    pageCount = bookPublisherLink.PageCount,
                    publishYear = bookPublisherLink.PublishYear,
                    isbn = bookPublisherLink.ISBN
                },
                genres = genreNames
            };
        }

        // ---- YENİ EKLENEN: AuthorID ile veritabanından tek yazar arama
        // (Bookland popup'ındaki "Yazarı Düzenle" akışı bunu kullanır) ----
        [HttpGet]
        public async Task<IActionResult> GetAuthorById(int authorId, [FromServices] AppDbContext db)
        {
            try
            {
                var author = await db.Authors.FindAsync(authorId);
                if (author == null)
                    return Json(new { found = false });

                return Json(new
                {
                    found = true,
                    author = new
                    {
                        id = author.AuthorID,
                        name = author.AuthorName,
                        surname = author.AuthorSurname,
                        imageUrl = author.AuthorImage_URL,
                        biography = author.AuthorBiography,
                        birthYear = author.AuthorBirthYear,
                        deathYear = author.AuthorDeathYear
                    }
                });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }
        // ---- YENİ: Bağımsız "Yazar Düzenleme" sayfası (Faz 1 — admin-modular-pages) ----
        // authorId query string ile gelir (örn. /Admin/AuthorUpdate?authorId=5).
        // Faz 5: server-side doğrulama eklendi.
        // authorId=0 (parametre hiç gönderilmemiş) GEÇERLİ bir durumdur — bu sayfa
        // "Yazar Seç" dropdown'ıyla authorId'siz de normal şekilde açılabiliyor (Faz 1),
        // bu yüzden bu durumda uyarı göstermiyoruz. Uyarı sadece authorId VERİLMİŞ ama
        // veritabanında yoksa (geçersiz/eski bir bağlantı) anlamlı.
        public async Task<IActionResult> AuthorUpdate(int authorId, [FromServices] AppDbContext db)
        {
            bool gecersizId = authorId > 0 && !await db.Authors.AnyAsync(a => a.AuthorID == authorId);
            ViewData["KayitBulunamadi"] = gecersizId;
            return View();
        }

        public IActionResult BookSave()
        {
            return View();
        }
        // ---- YENİ: BookUpdate — var olan bir kitabı düzenleme sayfası (Faz 4) ----
        // Faz 5: server-side doğrulama eklendi. Faz 6: davranış AuthorUpdate ile
        // tutarlı hâle getirildi — bookId=0 (parametre hiç gönderilmemiş, örn.
        // çıplak /Admin/BookUpdate girişi) artık GEÇERLİ bir durum sayılıyor ve
        // uyarı göstermiyor; "Kitap Seç" dropdown'ıyla bookId'siz de açılabilmeli.
        // Uyarı sadece bookId VERİLMİŞ ama veritabanında yoksa (geçersiz/eski bir
        // bağlantı) anlamlı.
        public async Task<IActionResult> BookUpdate(int bookId, [FromServices] AppDbContext db)
        {
            bool gecersizId = bookId > 0 && !await db.Books.AnyAsync(b => b.BookID == bookId);
            ViewData["KayitBulunamadi"] = gecersizId;
            return View();
        }
        // ---- YENİ EKLENEN: Bağımsız "Yazar Düzenleme" ekranından yazar güncelleme
        // (kitap/çevirmen/yayınevi bağlamı olmadan sadece Authors tablosunu günceller) ----
        [HttpPost]
        public async Task<IActionResult> SaveAuthor([FromBody] SaveAuthorRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || !req.AuthorId.HasValue || req.AuthorId.Value <= 0)
                    return Json(new { error = "Güncellenecek yazar belirtilmedi." });

                if (string.IsNullOrWhiteSpace(req.Name) && string.IsNullOrWhiteSpace(req.Surname))
                    return Json(new { error = "Yazar adı veya soyadı gerekli." });

                var author = await db.Authors.FindAsync(req.AuthorId.Value);
                if (author == null)
                    return Json(new { error = "Güncellenecek yazar bulunamadı. Sayfayı yenileyip tekrar deneyin." });

                author.AuthorName = req.Name;
                author.AuthorSurname = req.Surname;
                author.AuthorBiography = req.Biography;
                author.AuthorImage_URL = req.ImageUrl;
                author.AuthorBirthYear = req.BirthYear;
                author.AuthorDeathYear = req.DeathYear;

                await db.SaveChangesAsync();

                return Json(new { success = true, authorId = author.AuthorID });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }
        public IActionResult SeriesEdit()
        {
            return View();
        }

        // ---- YENİ: Bir seriye ait kitapları SeriesOrder'a göre artan sırayla,
        // kapak + yazar isimleriyle birlikte döner ----
        [HttpGet]
        public async Task<IActionResult> GetBooksInSeries(int seriesId, [FromServices] AppDbContext db)
        {
            try
            {
                var books = await db.Books
                    .Where(b => b.SeriesID == seriesId)
                    .Include(b => b.BookAuthors).ThenInclude(ba => ba.Author)
                    .OrderBy(b => b.SeriesOrder)
                    .ToListAsync();

                var result = books.Select(b => new
                {
                    bookId = b.BookID,
                    bookName = b.BookName,
                    bookCoverImageUrl = b.BookCoverImage_URL,
                    seriesOrder = b.SeriesOrder,
                    authorNames = string.Join(", ", b.BookAuthors.Select(ba => $"{ba.Author.AuthorName} {ba.Author.AuthorSurname}"))
                }).ToList();

                return Json(new { books = result });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Hiçbir seriye ait olmayan kitapları döner
        // ("Seriye Yeni Kitap Ekle" select'i için — DB tek SeriesID/SeriesOrder
        // kullandığından, bir kitap zaten bir seride ise başka bir seriye
        // kazara taşınmasın diye bu listeye hiç girmiyor) ----
        [HttpGet]
        public async Task<IActionResult> GetUnassignedBooks([FromServices] AppDbContext db)
        {
            try
            {
                var books = await db.Books
                    .Where(b => b.SeriesID == null)
                    .OrderBy(b => b.BookName)
                    .Select(b => new { id = b.BookID, name = b.BookName })
                    .ToListAsync();

                return Json(new { books });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Bir seri içindeki kitapların SeriesOrder değerlerini toplu günceller.
        // Client zaten aynı işi kontrol ediyor, ama server-side tekrar doğrulamak
        // (örn. iki farklı tarayıcıdan aynı anda kaydetme ihtimaline karşı) zorunlu
        // bir güvenlik ağı — SaveBook'taki mevcut çakışma kontrolüyle aynı mantık. ----
        [HttpPost]
        public async Task<IActionResult> UpdateSeriesOrders([FromBody] UpdateSeriesOrdersRequest req, [FromServices] AppDbContext db)
        {
            using var transaction = await db.Database.BeginTransactionAsync();
            try
            {
                if (req == null || req.SeriesId <= 0 || req.Items == null || req.Items.Count == 0)
                    return Json(new { error = "Geçersiz istek." });

                // Aynı seri içinde gönderilen öğeler arasında sıra çakışması var mı?
                var duplicateOrder = req.Items
                    .Where(i => i.SeriesOrder.HasValue)
                    .GroupBy(i => i.SeriesOrder.Value)
                    .FirstOrDefault(g => g.Count() > 1);

                if (duplicateOrder != null)
                    return Json(new { error = $"Aynı sıra numarasından ({duplicateOrder.Key}) birden fazla var. Lütfen birini değiştirip tekrar deneyin." });

                var bookIds = req.Items.Select(i => i.BookId).ToList();
                var books = await db.Books
                    .Where(b => bookIds.Contains(b.BookID) && b.SeriesID == req.SeriesId)
                    .ToListAsync();

                if (books.Count != req.Items.Count)
                    return Json(new { error = "Kitaplardan biri artık bu seride değil. Sayfayı yenileyip tekrar deneyin." });

                foreach (var item in req.Items)
                {
                    var book = books.First(b => b.BookID == item.BookId);
                    book.SeriesOrder = item.SeriesOrder;
                }

                await db.SaveChangesAsync();
                await transaction.CommitAsync();

                return Json(new { success = true });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Var olan bir serinin adını günceller — "Adını Düzenle" butonu.
        // AddSeries'teki aynı-isim kontrolüyle tutarlı: başka bir seri zaten bu
        // isme sahipse engelliyoruz (kendi mevcut ismiyle çakışması hariç). ----
        [HttpPost]
        public async Task<IActionResult> UpdateSeriesName([FromBody] UpdateSeriesNameRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || req.SeriesId <= 0 || string.IsNullOrWhiteSpace(req.Name))
                    return Json(new { error = "Geçersiz istek." });

                var name = req.Name.Trim();

                var series = await db.Series.FirstOrDefaultAsync(s => s.SeriesID == req.SeriesId);
                if (series == null)
                    return Json(new { error = "Seri bulunamadı. Sayfayı yenileyip tekrar deneyin." });

                var nameTaken = await db.Series.AnyAsync(s =>
                    s.SeriesID != req.SeriesId && s.SeriesName.ToLower() == name.ToLower());
                if (nameTaken)
                    return Json(new { error = $"\"{name}\" adında başka bir seri zaten var." });

                series.SeriesName = name;
                await db.SaveChangesAsync();

                return Json(new { success = true, id = series.SeriesID, name = series.SeriesName });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Var olan (henüz hiçbir seride olmayan) bir kitabı bir seriye bağlar ----
        [HttpPost]
        public async Task<IActionResult> AddBookToSeries([FromBody] AddBookToSeriesRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || req.BookId <= 0 || req.SeriesId <= 0)
                    return Json(new { error = "Kitap ve seri seçilmeli." });

                var book = await db.Books.FindAsync(req.BookId);
                if (book == null)
                    return Json(new { error = "Kitap bulunamadı." });

                if (book.SeriesID.HasValue)
                    return Json(new { error = "Bu kitap zaten bir seriye ait. Önce başka bir seriden çıkarılmalı." });

                var seriesExists = await db.Series.AnyAsync(s => s.SeriesID == req.SeriesId);
                if (!seriesExists)
                    return Json(new { error = "Seri bulunamadı." });

                if (req.SeriesOrder.HasValue)
                {
                    var conflict = await db.Books.FirstOrDefaultAsync(b =>
                        b.SeriesID == req.SeriesId && b.SeriesOrder == req.SeriesOrder.Value);
                    if (conflict != null)
                        return Json(new { error = $"Bu seride {req.SeriesOrder}. sırada zaten \"{conflict.BookName}\" adlı kitap kayıtlı." });
                }

                book.SeriesID = req.SeriesId;
                book.SeriesOrder = req.SeriesOrder;
                await db.SaveChangesAsync();

                return Json(new { success = true, bookId = book.BookID });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Bir kitabı, kitap şeridindeki kırmızı çarpı butonuyla seriden çıkarır.
        // SeriesID/SeriesOrder null'a çekilir, kitabın kendisi silinmez —
        // GetUnassignedBooks listesine geri düşer. ----
        [HttpPost]
        public async Task<IActionResult> RemoveBookFromSeries([FromBody] RemoveBookFromSeriesRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || req.BookId <= 0)
                    return Json(new { error = "Geçersiz istek." });

                var book = await db.Books.FindAsync(req.BookId);
                if (book == null)
                    return Json(new { error = "Kitap bulunamadı." });

                if (!book.SeriesID.HasValue || (req.SeriesId > 0 && book.SeriesID.Value != req.SeriesId))
                    return Json(new { error = "Kitap artık bu seride değil. Sayfayı yenileyip tekrar deneyin." });

                book.SeriesID = null;
                book.SeriesOrder = null;
                await db.SaveChangesAsync();

                return Json(new { success = true, bookId = book.BookID });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }
    }

    // ---- YENİ EKLENEN REQUEST MODELİ ----
    public class ScrapeRequest
    {
        public string KitapyurduUrl { get; set; }
        public string GoodreadsUrl { get; set; }
    }

    // ---- YENİ EKLENEN: Seri / Yayınevi ekleme için basit request modeli ----
    public class NameRequest
    {
        public string Name { get; set; }
    }

    // ---- YENİ EKLENEN: Bağımsız yazar güncelleme için request modeli ----
    public class SaveAuthorRequest
    {
        public int? AuthorId { get; set; }
        public string Name { get; set; }
        public string Surname { get; set; }
        public string Biography { get; set; }
        public string ImageUrl { get; set; }
        public int? BirthYear { get; set; }
        public int? DeathYear { get; set; }
    }
    public class UpdateSeriesOrdersRequest
    {
        public int SeriesId { get; set; }
        public List<SeriesOrderItem> Items { get; set; }
    }

    public class SeriesOrderItem
    {
        public int BookId { get; set; }
        public int? SeriesOrder { get; set; }
    }

    // ---- YENİ EKLENEN: Seri adını güncelleme için request modeli ----
    public class UpdateSeriesNameRequest
    {
        public int SeriesId { get; set; }
        public string Name { get; set; }
    }

    public class AddBookToSeriesRequest
    {
        public int BookId { get; set; }
        public int SeriesId { get; set; }
        public int? SeriesOrder { get; set; }
    }

    // ---- YENİ EKLENEN: Kitabı seriden çıkarma request modeli ----
    public class RemoveBookFromSeriesRequest
    {
        public int BookId { get; set; }
        public int SeriesId { get; set; }
    }
}