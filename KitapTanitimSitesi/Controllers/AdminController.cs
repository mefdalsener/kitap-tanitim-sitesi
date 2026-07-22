using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using KitapTanitimSitesi.Services;
using Microsoft.EntityFrameworkCore;
using KitapTanitimSitesi.Models;
using KitapTanitimSitesi.Models.ViewModels;
using System.Security.Claims;

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

        // ---- YENİ: Bir seriyi tamamen siler. Seriye bağlı kitaplar silinmez —
        // SeriesID/SeriesOrder alanları null'a çekilerek sadece seriden çıkarılır. ----
        [HttpPost]
        public async Task<IActionResult> DeleteSeries([FromBody] DeleteSeriesRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || req.SeriesId <= 0)
                    return Json(new { error = "Geçersiz istek." });

                var series = await db.Series.FirstOrDefaultAsync(s => s.SeriesID == req.SeriesId);
                if (series == null)
                    return Json(new { error = "Seri bulunamadı. Sayfayı yenileyip tekrar deneyin." });

                var bagliKitaplar = await db.Books.Where(b => b.SeriesID == req.SeriesId).ToListAsync();
                foreach (var kitap in bagliKitaplar)
                {
                    kitap.SeriesID = null;
                    kitap.SeriesOrder = null;
                }

                db.Series.Remove(series);
                await db.SaveChangesAsync();

                return Json(new { success = true, id = req.SeriesId });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ==================== FAZ EKSTRA 2.3 — TALEP/ŞİKAYET PANELİ ====================

        public IActionResult ReportManagement()
        {
            return View();
        }

        // ---- YENİ: Talep/Şikayet listesi — Tip ve Durum filtresi + sayfalama.
        // Şikayet tipindeki satırlarda TargetRatingID üzerinden BookRating'e
        // join yapılıp kitap/kullanıcı/yorum özeti de birlikte dönüyor. ----
        [HttpGet]
        public async Task<IActionResult> GetReports(
            [FromServices] AppDbContext db,
            string type = "all",
            string status = "all",
            int page = 1)
        {
            try
            {
                if (page < 1) page = 1;
                const int pageSize = 20;

                var query = db.Reports
                    .Include(r => r.ReporterUser)
                    .Include(r => r.TargetRating).ThenInclude(tr => tr.Book)
                    .Include(r => r.TargetRating).ThenInclude(tr => tr.User)
                    .AsQueryable();

                if (type == "Şikayet" || type == "Talep")
                    query = query.Where(r => r.Type == type);

                if (status != "all")
                    query = query.Where(r => r.Status == status);

                var totalCount = await query.CountAsync();
                var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling(totalCount / (double)pageSize);
                if (page > totalPages) page = totalPages;

                var items = await query
                    .OrderByDescending(r => r.CreatedAt)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(r => new
                    {
                        id = r.Id,
                        type = r.Type,
                        status = r.Status,
                        message = r.Message,
                        createdAt = r.CreatedAt,
                        reporterUsername = r.ReporterUser.Username,
                        reporterPublicId = r.ReporterUser.PublicId,
                        targetRating = r.TargetRating == null ? null : new
                        {
                            ratingId = r.TargetRating.RatingID,
                            bookName = r.TargetRating.Book.BookName,
                            username = r.TargetRating.User.Username,
                            comment = r.TargetRating.Comment,
                            ratingValue = r.TargetRating.RatingValue
                        }
                    })
                    .ToListAsync();

                return Json(new { reports = items, totalCount, totalPages, page, pageSize });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Tek bir raporun tüm detayını döner (detay görünümü için) ----
        [HttpGet]
        public async Task<IActionResult> GetReportById(int reportId, [FromServices] AppDbContext db)
        {
            try
            {
                var r = await db.Reports
                    .Include(x => x.ReporterUser)
                    .Include(x => x.ReviewedByAdmin)
                    .Include(x => x.TargetRating).ThenInclude(tr => tr.Book)
                    .Include(x => x.TargetRating).ThenInclude(tr => tr.User)
                    .FirstOrDefaultAsync(x => x.Id == reportId);

                if (r == null)
                    return Json(new { found = false });

                return Json(new
                {
                    found = true,
                    report = new
                    {
                        id = r.Id,
                        type = r.Type,
                        status = r.Status,
                        message = r.Message,
                        adminNote = r.AdminNote,
                        userMessage = r.UserMessage,
                        createdAt = r.CreatedAt,
                        reviewedAt = r.ReviewedAt,
                        reviewedByAdminUsername = r.ReviewedByAdmin != null ? r.ReviewedByAdmin.Username : null,
                        reporterUsername = r.ReporterUser != null ? r.ReporterUser.Username : null,
                        reporterPublicId = r.ReporterUser != null ? r.ReporterUser.PublicId : null,
                        targetRating = r.TargetRating == null ? null : new
                        {
                            ratingId = r.TargetRating.RatingID,
                            bookName = r.TargetRating.Book != null ? r.TargetRating.Book.BookName : null,
                            username = r.TargetRating.User != null ? r.TargetRating.User.Username : null,
                            // ---- ÖNEMLİ: bu, ceza eklenecek kullanıcının publicId'si —
                            // ReporterUser'ın DEĞİL, şikayet edilen yorumun YAZARININ. ----
                            publicId = r.TargetRating.User != null ? r.TargetRating.User.PublicId : null,
                            comment = r.TargetRating.Comment,
                            ratingValue = r.TargetRating.RatingValue,
                            isDeleted = r.TargetRating.IsDeleted
                        }
                    }
                });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Rapor durumunu (Status/AdminNote/UserMessage) günceller.
        // Report append-only DEĞİL — UserModerationAction'ın aksine, bir iş akışı
        // durumu olduğu için var olan satır UPDATE edilir (Muhammed'in onayı). ----
        [HttpPost]
        public async Task<IActionResult> UpdateReportStatus([FromBody] UpdateReportStatusRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || req.ReportId <= 0 || string.IsNullOrWhiteSpace(req.Status))
                    return Json(new { error = "Geçersiz istek." });

                var izinliDurumlar = new[] { "Beklemede", "İnceleniyor", "Çözüldü", "Reddedildi" };
                if (!izinliDurumlar.Contains(req.Status))
                    return Json(new { error = "Geçersiz durum." });

                var report = await db.Reports.FindAsync(req.ReportId);
                if (report == null)
                    return Json(new { error = "Rapor bulunamadı. Sayfayı yenileyip tekrar deneyin." });

                var adminIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (!int.TryParse(adminIdClaim, out int adminId))
                    return Json(new { error = "Admin kimliği doğrulanamadı. Lütfen tekrar giriş yapın." });

                report.Status = req.Status;
                report.AdminNote = string.IsNullOrWhiteSpace(req.AdminNote) ? null : req.AdminNote.Trim();
                report.UserMessage = string.IsNullOrWhiteSpace(req.UserMessage) ? null : req.UserMessage.Trim();
                report.ReviewedByAdminId = adminId;
                report.ReviewedAt = DateTime.UtcNow;

                await db.SaveChangesAsync();

                return Json(new { success = true, id = report.Id });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: RatingID ile tek bir yorumu getirir — ReportManagement'tan
        // "Panel 2.1'de İncele" linkiyle CommentModeration'a derin bağlantı için.
        // CommentModeration.cshtml/js'in mevcut arama akışına dokunmaz, sadece
        // sayfa açılışında ek bir "pinlenmiş yorum" gösterimi besler. ----
        [HttpGet]
        public async Task<IActionResult> GetCommentByRatingId(int ratingId, [FromServices] AppDbContext db)
        {
            try
            {
                var r = await db.BookRatings
                    .Include(x => x.Book)
                    .Include(x => x.User)
                    .Include(x => x.DeletedByAdmin)
                    .FirstOrDefaultAsync(x => x.RatingID == ratingId);

                if (r == null)
                    return Json(new { found = false });

                return Json(new
                {
                    found = true,
                    comment = new
                    {
                        ratingId = r.RatingID,
                        bookName = r.Book != null ? r.Book.BookName : null,
                        bookCoverImageUrl = r.Book != null ? r.Book.BookCoverImage_URL : null,
                        publicId = r.User != null ? r.User.PublicId : null,
                        username = r.User != null ? r.User.Username : null,
                        ratingValue = r.RatingValue,
                        comment = r.Comment,
                        createdAt = r.CreatedAt,
                        isDeleted = r.IsDeleted,
                        deletedAt = r.DeletedAt,
                        deletedByAdminUsername = r.DeletedByAdmin != null ? r.DeletedByAdmin.Username : null,
                        flaggedText = r.FlaggedText
                    }
                });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }
        public IActionResult CommentModeration()
        {
            return View();
        }

        // ---- YENİ: Yorum arama + sayfalama.
        // Kitap adı VE kullanıcı adı/ID birlikte gönderilirse AND ile birleştirilir.
        // Türkçe kurallarına göre case-insensitive ("I" = "İ" = "i" = "ı") ve
        // boşluk-toleranslı "içerir" araması için SQL Server'ın Turkish_CI_AS
        // collation'ı kullanılıyor — .NET'in ToLower()/ToUpper()'ı sunucu kültürüne
        // göre davranış değiştirebildiğinden (klasik "Turkish I" sorunu) LINQ→SQL
        // çevirisinde güvenilir değil; COLLATE ise veritabanı seviyesinde çalışıp
        // indexlenebilir bir SQL operatörü olduğundan tercih edildi. ----
        [HttpGet]
        public async Task<IActionResult> SearchComments(
            [FromServices] AppDbContext db,
            string? bookName,
            string? username,
            string? publicId,
            string status = "all",
            int page = 1)
        {
            try
            {
                if (page < 1) page = 1;
                const int pageSize = 20;

                var query = db.BookRatings
                    .Include(r => r.Book)
                    .Include(r => r.User)
                    .Include(r => r.DeletedByAdmin)
                    .AsQueryable();

                // ---- Durum filtresi ----
                if (status == "active")
                    query = query.Where(r => !r.IsDeleted);
                else if (status == "deleted")
                    query = query.Where(r => r.IsDeleted);
                // status == "all" -> filtre uygulanmaz

                // ---- Kitap adı: Türkçe-duyarlı, boşluk-normalize edilmiş "içerir" araması ----
                var normalizedBookName = NormalizeSearchTerm(bookName);
                if (!string.IsNullOrEmpty(normalizedBookName))
                {
                    var pattern = $"%{EscapeLikeTerm(normalizedBookName)}%";
                    query = query.Where(r =>
                        EF.Functions.Like(EF.Functions.Collate(r.Book.BookName, "Turkish_CI_AS"), pattern));
                }

                // ---- Kullanıcı adı: aynı yöntemle ----
                var normalizedUsername = NormalizeSearchTerm(username);
                if (!string.IsNullOrEmpty(normalizedUsername))
                {
                    var pattern = $"%{EscapeLikeTerm(normalizedUsername)}%";
                    query = query.Where(r =>
                        EF.Functions.Like(EF.Functions.Collate(r.User.Username, "Turkish_CI_AS"), pattern));
                }

                // ---- Kullanıcı kimliği: PublicId üzerinden tam eşleşme (internal UserID
                // admine gösterilmiyor/aratılmıyor — Bookland tarafında kullanıcıya
                // gösterilen kimlik zaten PublicId olduğundan tutarlılık için) ----
                var normalizedPublicId = NormalizeSearchTerm(publicId);
                if (!string.IsNullOrEmpty(normalizedPublicId))
                {
                    query = query.Where(r => r.User.PublicId == normalizedPublicId);
                }

                var totalCount = await query.CountAsync();
                var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling(totalCount / (double)pageSize);
                if (page > totalPages) page = totalPages;

                var items = await query
                    .OrderByDescending(r => r.RatingID)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(r => new
                    {
                        ratingId = r.RatingID,
                        bookId = r.BookID,
                        bookName = r.Book.BookName,
                        bookCoverImageUrl = r.Book.BookCoverImage_URL,
                        userId = r.UserID,
                        publicId = r.User.PublicId,
                        username = r.User.Username,
                        ratingValue = r.RatingValue,
                        comment = r.Comment,
                        createdAt = r.CreatedAt,
                        isDeleted = r.IsDeleted,
                        deletedAt = r.DeletedAt,
                        deletedByAdminUsername = r.DeletedByAdmin != null ? r.DeletedByAdmin.Username : null,
                        flaggedText = r.FlaggedText
                    })
                    .ToListAsync();

                return Json(new { comments = items, totalCount, totalPages, page, pageSize });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Bir yorumu tam soft-delete eder.
        // DeletedByAdminId, giriş yapmış adminin ClaimTypes.NameIdentifier claim'inden
        // (AccountController.Login'de user.Id olarak set ediliyor) okunur.
        // Kullanıcıya gösterilecek sabit mesaj burada döndürülür ama DB'ye AYRI bir
        // alan olarak KAYDEDİLMEZ — Bookland tarafında (Faz 2.4) nasıl gösterileceğine
        // karar verilecek. ----
        [HttpPost]
        public async Task<IActionResult> DeleteComment([FromBody] DeleteCommentRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || req.RatingId <= 0)
                    return Json(new { error = "Geçersiz istek." });

                var rating = await db.BookRatings.FindAsync(req.RatingId);
                if (rating == null)
                    return Json(new { error = "Yorum bulunamadı." });

                if (rating.IsDeleted)
                    return Json(new { error = "Bu yorum zaten silinmiş." });

                var adminIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (!int.TryParse(adminIdClaim, out int adminId))
                    return Json(new { error = "Admin kimliği doğrulanamadı. Lütfen tekrar giriş yapın." });

                rating.IsDeleted = true;
                rating.DeletedAt = DateTime.UtcNow;
                rating.DeletedByAdminId = adminId;
                rating.FlaggedText = string.IsNullOrWhiteSpace(req.FlaggedText) ? null : req.FlaggedText.Trim();

                await db.SaveChangesAsync();

                return Json(new
                {
                    success = true,
                    ratingId = rating.RatingID,
                    systemMessage = "Yorumunuz topluluk kurallarına uymadığı için silinmiştir."
                });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Arama teriminin baştaki/sondaki boşluklarını kırpar, arada
        // birden fazla boşluk varsa teke indirir — kullanıcı "  kürk   mantolu  "
        // yazsa da "kürk mantolu" aransın diye. ----
        private static string NormalizeSearchTerm(string? term)
        {
            if (string.IsNullOrWhiteSpace(term)) return string.Empty;
            return System.Text.RegularExpressions.Regex.Replace(term.Trim(), @"\s+", " ");
        }

        // ---- YENİ: LIKE'a özel karakterleri ( % _ [ ) kaçışlar — kullanıcı arama
        // kutusuna bu karakterleri yazarsa SQL LIKE deseni bozulmasın diye. ----
        private static string EscapeLikeTerm(string term)
        {
            return term.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
        }
        public IActionResult UserManagement()
        {
            return View();
        }

        // ---- YENİ: "Aktif cezalı" kullanıcı listesi + arama.
        // Arama (username/publicId) verilirse "aktif cezalı" filtresi bypass edilir —
        // admin geçmişi olmayan ya da cezası bitmiş bir kullanıcıyı da arayabilmeli. ----
        [HttpGet]
        public async Task<IActionResult> SearchModeratedUsers(
            [FromServices] AppDbContext db,
            string? username,
            string? publicId,
            int page = 1)
        {
            try
            {
                if (page < 1) page = 1;
                const int pageSize = 20;

                var normalizedUsername = NormalizeSearchTerm(username);
                var normalizedPublicId = NormalizeSearchTerm(publicId);
                bool aramaVar = !string.IsNullOrEmpty(normalizedUsername) || !string.IsNullOrEmpty(normalizedPublicId);

                IQueryable<User> userQuery = db.Users;

                if (!string.IsNullOrEmpty(normalizedUsername))
                {
                    var pattern = $"%{EscapeLikeTerm(normalizedUsername)}%";
                    userQuery = userQuery.Where(u => EF.Functions.Like(EF.Functions.Collate(u.Username, "Turkish_CI_AS"), pattern));
                }
                if (!string.IsNullOrEmpty(normalizedPublicId))
                {
                    userQuery = userQuery.Where(u => u.PublicId == normalizedPublicId);
                }

                // Her kullanıcının en son moderasyon satırını (varsa) tek sorguda çek
                var joined = await userQuery
                    .Select(u => new
                    {
                        u.Id,
                        u.PublicId,
                        u.Username,
                        u.Email,
                        LastAction = db.UserModerationActions
                            .Where(a => a.UserID == u.Id)
                            .OrderByDescending(a => a.CreatedAt)
                            .Select(a => new { a.ActionType, a.EndDate, a.CreatedAt })
                            .FirstOrDefault()
                    })
                    .ToListAsync();

                // Arama modunda hiç filtre yok (geçmişi olmayan kullanıcı da dahil).
                // Arama yoksa: sadece "aktif cezalı" (son satırın EndDate'i null/gelecek) kullanıcılar.
                var suzulmus = aramaVar
                    ? joined
                    : joined.Where(x => x.LastAction != null &&
                        (!x.LastAction.EndDate.HasValue || x.LastAction.EndDate.Value > DateTime.UtcNow));

                var suzulmusListe = suzulmus
                    .OrderByDescending(x => x.LastAction?.CreatedAt ?? DateTime.MinValue)
                    .ToList();

                var totalCount = suzulmusListe.Count;
                var totalPages = totalCount == 0 ? 1 : (int)Math.Ceiling(totalCount / (double)pageSize);
                if (page > totalPages) page = totalPages;

                var pageItems = suzulmusListe
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(x => new
                    {
                        userId = x.Id,
                        publicId = x.PublicId,
                        username = x.Username,
                        email = x.Email,
                        lastActionType = x.LastAction?.ActionType,
                        lastActionEndDate = x.LastAction?.EndDate,
                        lastActionCreatedAt = x.LastAction?.CreatedAt,
                        isActiveNow = x.LastAction != null &&
                            (!x.LastAction.EndDate.HasValue || x.LastAction.EndDate.Value > DateTime.UtcNow)
                    })
                    .ToList();

                return Json(new { users = pageItems, totalCount, totalPages, page, pageSize });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Bir kullanıcının TÜM moderasyon geçmişi, kronolojik sırayla.
        // İlişkili bir yorum varsa (RelatedRatingID), yorumun kendisi + FlaggedText de
        // birlikte döner — vurgulama (highlight) işlemi frontend'de (userManagement.js)
        // FlaggedText'i satır satır ayırıp comment içinde arama/replace ile yapılır. ----
        [HttpGet]
        public async Task<IActionResult> GetUserModerationHistory(int userId, [FromServices] AppDbContext db)
        {
            try
            {
                var user = await db.Users.FindAsync(userId);
                if (user == null)
                    return Json(new { error = "Kullanıcı bulunamadı." });

                var actions = await db.UserModerationActions
                    .Where(a => a.UserID == userId)
                    .Include(a => a.CreatedByAdmin)
                    .Include(a => a.RelatedRating).ThenInclude(r => r.Book)
                    .OrderBy(a => a.CreatedAt)
                    .ToListAsync();

                var result = actions.Select(a => new
                {
                    id = a.Id,
                    actionType = a.ActionType,
                    note = a.Note,
                    startDate = a.StartDate,
                    endDate = a.EndDate,
                    createdAt = a.CreatedAt,
                    createdByAdminUsername = a.CreatedByAdmin?.Username,
                    relatedRating = a.RelatedRating == null ? null : new
                    {
                        ratingId = a.RelatedRating.RatingID,
                        bookName = a.RelatedRating.Book?.BookName,
                        comment = a.RelatedRating.Comment,
                        flaggedText = a.RelatedRating.FlaggedText,
                        isDeleted = a.RelatedRating.IsDeleted
                    }
                }).ToList();

                var (isBanned, effectiveEndDate) = await GetTamBanDurumuAsync(db, userId);

                return Json(new
                {
                    user = new { id = user.Id, publicId = user.PublicId, username = user.Username, email = user.Email },
                    actions = result,
                    isCurrentlyFullyBanned = isBanned,
                    effectiveBanEndDate = effectiveEndDate
                });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Yeni bir moderasyon eylemi ekler (append-only — var olan satırlar
        // hiçbir zaman güncellenmez). "YasakKaldırma" eylemi için EndDate her zaman
        // sunucu tarafında "şimdi"ye zorlanır — böylece "son satırın EndDate'i
        // null/gelecek mi" kuralı, kaldırma sonrası otomatik olarak "aktif değil"
        // sonucunu üretir (client'ın doğru tarih göndermesine güvenmemek için). ----
        [HttpPost]
        public async Task<IActionResult> AddModerationAction([FromBody] AddModerationActionRequest req, [FromServices] AppDbContext db)
        {
            try
            {
                if (req == null || req.UserId <= 0 || string.IsNullOrWhiteSpace(req.ActionType))
                    return Json(new { error = "Geçersiz istek." });

                var izinliTipler = new[] { "Uyarı", "YorumYasağı", "TamBan", "YasakKaldırma", "YasakUzatma", "YasakKısaltma" };
                if (!izinliTipler.Contains(req.ActionType))
                    return Json(new { error = "Geçersiz eylem tipi." });

                var user = await db.Users.FindAsync(req.UserId);
                if (user == null)
                    return Json(new { error = "Kullanıcı bulunamadı." });

                if (req.RelatedRatingId.HasValue)
                {
                    var ratingExists = await db.BookRatings.AnyAsync(r => r.RatingID == req.RelatedRatingId.Value);
                    if (!ratingExists)
                        return Json(new { error = "İlişkilendirilmek istenen yorum bulunamadı." });
                }

                var adminIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (!int.TryParse(adminIdClaim, out int adminId))
                    return Json(new { error = "Admin kimliği doğrulanamadı. Lütfen tekrar giriş yapın." });

                DateTime? endDate = req.ActionType == "YasakKaldırma" ? DateTime.UtcNow : req.EndDate;

                var action = new UserModerationAction
                {
                    UserID = req.UserId,
                    ActionType = req.ActionType,
                    Note = string.IsNullOrWhiteSpace(req.Note) ? null : req.Note.Trim(),
                    RelatedRatingID = req.RelatedRatingId,
                    StartDate = req.StartDate,
                    EndDate = endDate,
                    CreatedAt = DateTime.UtcNow,
                    CreatedByAdminId = adminId
                };

                db.UserModerationActions.Add(action);
                await db.SaveChangesAsync();

                return Json(new { success = true, id = action.Id });
            }
            catch (Exception ex)
            {
                return Json(new { error = ex.Message });
            }
        }

        // ---- YENİ: Bir kullanıcının "gerçekten TamBan'lı mı" (login engeli için)
        // durumunu hesaplar. Sadece TamBan/YorumYasağı/YasakKaldırma tipindeki en son
        // satıra bakar; TamBan ise, ondan SONRA gelen bir YasakUzatma/YasakKısaltma
        // varsa onun EndDate'ini esas alır. AccountController.cs'teki aynı isimli
        // metotla kasıtlı olarak aynı mantığı taşır (izolasyon prensibi gereği
        // paylaşılan bir servise çıkarılmadı, iki controller'da ayrı ayrı tutuluyor). ----
        private static async Task<(bool isBanned, DateTime? effectiveEndDate)> GetTamBanDurumuAsync(AppDbContext db, int userId)
        {
            var baseAction = await db.UserModerationActions
                .Where(a => a.UserID == userId &&
                    (a.ActionType == "TamBan" || a.ActionType == "YorumYasağı" || a.ActionType == "YasakKaldırma"))
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            if (baseAction == null || baseAction.ActionType != "TamBan")
                return (false, null);

            var laterAdjustment = await db.UserModerationActions
                .Where(a => a.UserID == userId
                    && a.CreatedAt > baseAction.CreatedAt
                    && (a.ActionType == "YasakUzatma" || a.ActionType == "YasakKısaltma"))
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            var effectiveEndDate = laterAdjustment?.EndDate ?? baseAction.EndDate;
            var isActive = !effectiveEndDate.HasValue || effectiveEndDate.Value > DateTime.UtcNow;

            return (isActive, effectiveEndDate);
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

    // ---- YENİ EKLENEN: Seri silme request modeli ----
    public class DeleteSeriesRequest
    {
        public int SeriesId { get; set; }
    }
    public class DeleteCommentRequest
    {
        public int RatingId { get; set; }
        public string? FlaggedText { get; set; }
    }
    public class AddModerationActionRequest
    {
        public int UserId { get; set; }
        public string ActionType { get; set; }
        public string? Note { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public int? RelatedRatingId { get; set; }
    }
}