using KitapTanitimSitesi.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KitapTanitimSitesi.Models.ViewModels;
using System.Security.Claims;

namespace KitapTanitimSitesi.Controllers
{
    public class BooklandController : Controller
    {
        private readonly AppDbContext _context;

        public BooklandController(AppDbContext context)
        {
            _context = context;
        }

        public async Task<IActionResult> Index()
        {
            var viewModel = new BooklandViewModel
            {
                Books = await _context.Books
                    .Include(b => b.BookAuthors).ThenInclude(ba => ba.Author)
                    .Include(b => b.BookGenres).ThenInclude(bg => bg.Genre)
                    .Include(b => b.BookPublishers).ThenInclude(bp => bp.Publisher)
                    .Include(b => b.BookTranslators).ThenInclude(bt => bt.Translator)
                    .AsSplitQuery()
                    .ToListAsync(),

                Authors = await _context.Authors
                    .OrderBy(a => a.AuthorName)
                    .ToListAsync(),

                Publishers = await _context.Publishers
                    .OrderBy(p => p.PublisherName)
                    .ToListAsync(),

                Translators = await _context.Translators
                    .OrderBy(t => t.TranslatorName)
                    .ToListAsync(),

                Genres = await _context.Genres
                    .OrderBy(g => g.GenreName)
                    .ToListAsync(),

                SeriesList = await _context.Series
                    .OrderBy(s => s.SeriesName)
                    .ToListAsync(),

                PageCounts = await _context.BookPublishers
                    .Where(bp => bp.PageCount.HasValue)
                    .Select(bp => bp.PageCount.Value)
                    .Distinct()
                    .OrderBy(p => p)
                    .ToListAsync()
            };

            // Giriş yapmışsa, kullanıcının şu ana kadar verdiği tüm puanları
            // tek sorguda çekip sözlüğe koyuyoruz (popup açılışında kullanılacak).
            // Giriş yapmışsa, kullanıcının şu ana kadar verdiği tüm puanları
            // tek sorguda çekip sözlüğe koyuyoruz (popup açılışında kullanılacak).
            if (User.Identity != null && User.Identity.IsAuthenticated)
            {
                var userIdMetni = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (userIdMetni != null && int.TryParse(userIdMetni, out int userId))
                {
                    // ---- GÜNCELLENDİ (Faz Ekstra 2.4): !IsDeleted eklendi — silinmiş
                    // bir yorum artık "sanki hiç var olmamış gibi" davranmalı, o yüzden
                    // bu sözlüğe hiç girmemeli. ----
                    viewModel.KullaniciPuanlari = await _context.BookRatings
                        .Where(br => br.UserID == userId && !br.IsDeleted)
                        .ToDictionaryAsync(br => br.BookID, br => br.RatingValue);

                    // ---- YENİ (Faz Ekstra 2.4) ----
                    viewModel.KullaniciSilinenYorumKitapIdleri = (await _context.BookRatings
                        .Where(br => br.UserID == userId && br.IsDeleted)
                        .Select(br => br.BookID)
                        .ToListAsync())
                        .ToHashSet();

                    viewModel.AktifYorumYasagiMesaji = await GetYorumYasagiMesajiAsync(userId);
                }
            }

            return View("BooklandIndex", viewModel);
        }

        // ---- YENİ (Faz Ekstra 2.4): Kullanıcının aktif bir "YorumYasağı" cezası
        // olup olmadığını hesaplar. AdminController.cs'teki GetTamBanDurumuAsync ile
        // kasıtlı olarak aynı mantığı taşır (izolasyon prensibi gereği paylaşılan bir
        // servise çıkarılmadı). Son ilgili satır TamBan ise null döner — TamBan zaten
        // login'de engelleniyor, bu kullanıcı buraya hiç gelemez. ----
        private async Task<string?> GetYorumYasagiMesajiAsync(int userId)
        {
            var baseAction = await _context.UserModerationActions
                .Where(a => a.UserID == userId &&
                    (a.ActionType == "TamBan" || a.ActionType == "YorumYasağı" || a.ActionType == "YasakKaldırma"))
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            if (baseAction == null || baseAction.ActionType != "YorumYasağı")
                return null;

            var laterAdjustment = await _context.UserModerationActions
                .Where(a => a.UserID == userId
                    && a.CreatedAt > baseAction.CreatedAt
                    && (a.ActionType == "YasakUzatma" || a.ActionType == "YasakKısaltma"))
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            var effectiveEndDate = laterAdjustment?.EndDate ?? baseAction.EndDate;
            var isActive = !effectiveEndDate.HasValue || effectiveEndDate.Value > DateTime.UtcNow;

            if (!isActive)
                return null;

            return !effectiveEndDate.HasValue
                ? "Yorum yazma yetkiniz süresiz olarak kısıtlanmıştır."
                : $"Yorum yazma yetkiniz {effectiveEndDate.Value:dd.MM.yyyy HH:mm} tarihine kadar kısıtlanmıştır.";
        }

        // Kullanıcı popup'ta Yorumlar sekmesindeki yıldız seçiciyi kullanıp
        // "Yorum Yap" butonuna bastığında çağrılır.
        // - Aynı kullanıcı aynı kitaba daha önce puan verdiyse: puan güncellenir.
        //   Yorum metni SADECE gönderilen metin boş değilse güncellenir; kullanıcı
        //   sadece puanını değiştirip yorum kutusunu boş bırakırsa eski yorumu
        //   korunur (üzerine yazılıp silinmez).
        // - Daha önce puan vermediyse: yeni kayıt eklenir ve Book.RatingCount +1 artırılır.
        // - Her iki durumda da Book.AverageRating, o kitaba ait tüm puanların
        //   ortalaması alınıp tek ondalık basamağa yuvarlanarak yeniden hesaplanır.
        // - Puanı/yorumu tamamen kaldırmak için ayrı bir uç nokta var: PuanKaldir.
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> PuanVer([FromBody] PuanVerRequest istek)
        {
            if (User.Identity == null || !User.Identity.IsAuthenticated)
            {
                return Unauthorized();
            }

            var userIdMetni = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdMetni == null || !int.TryParse(userIdMetni, out int userId))
            {
                return Unauthorized();
            }

            if (istek == null || istek.Puan < 1 || istek.Puan > 5)
            {
                return BadRequest("Puan 1 ile 5 arasında olmalı.");
            }

            // ---- YENİ (Faz Ekstra 2.4): Aktif YorumYasağı varsa gönderim tamamen
            // reddedilir (yıldız dahil) — arayüzdeki form zaten disable olacak,
            // bu sadece sunucu tarafı güvenlik katmanı. ----
            var yorumYasagiMesaji = await GetYorumYasagiMesajiAsync(userId);
            if (yorumYasagiMesaji != null)
            {
                return StatusCode(403, new { error = yorumYasagiMesaji });
            }

            var kitap = await _context.Books.FirstOrDefaultAsync(b => b.BookID == istek.BookId);
            if (kitap == null)
            {
                return NotFound();
            }

            // ---- GÜNCELLENDİ (Faz Ekstra 2.4): !IsDeleted eklendi — silinmiş bir
            // yorumun üzerine yazılamaz, aynı kitaba yeni bir yorum atılmak
            // istenirse bu tamamen yeni bir satır olarak açılır (filtrelenmiş
            // unique index bunu destekliyor: HasFilter("[IsDeleted] = 0")). ----
            var mevcutPuan = await _context.BookRatings
                .FirstOrDefaultAsync(br => br.BookID == istek.BookId && br.UserID == userId && !br.IsDeleted);

            string? yorumMetni;

            if (mevcutPuan != null)
            {
                mevcutPuan.RatingValue = (byte)istek.Puan;
                if (!string.IsNullOrWhiteSpace(istek.Yorum))
                {
                    mevcutPuan.Comment = istek.Yorum.Trim();
                }
                yorumMetni = mevcutPuan.Comment;
            }
            else
            {
                var yeniYorum = string.IsNullOrWhiteSpace(istek.Yorum) ? null : istek.Yorum.Trim();

                _context.BookRatings.Add(new BookRating
                {
                    BookID = istek.BookId,
                    UserID = userId,
                    RatingValue = (byte)istek.Puan,
                    Comment = yeniYorum
                });
                yorumMetni = yeniYorum;
            }

            await _context.SaveChangesAsync();

            // ---- GÜNCELLENDİ (Faz Ekstra 2.4): Ortalama VE sayaç artık sadece
            // silinmemiş satırlar üzerinden, tek sorgudan hesaplanıyor — silinmiş
            // bir yorum "sanki hiç var olmamış gibi" davranıyor. ----
            var tumPuanlar = await _context.BookRatings
                .Where(br => br.BookID == istek.BookId && !br.IsDeleted)
                .Select(br => (int)br.RatingValue)
                .ToListAsync();

            kitap.RatingCount = tumPuanlar.Count;
            kitap.AverageRating = tumPuanlar.Count > 0
                ? Math.Round((decimal)tumPuanlar.Average(), 1)
                : 0;

            await _context.SaveChangesAsync();

            return Json(new
            {
                success = true,
                averageRating = kitap.AverageRating,
                ratingCount = kitap.RatingCount ?? 0,
                kullaniciPuani = istek.Puan,
                yorumMetni,
                yorumTarihi = DateTime.Now.ToString("dd.MM.yyyy")
            });
        }

        // Yorumlar sekmesi açıldığında (ya da yeni bir yorum gönderildikten sonra
        // liste tazelenirken) çağrılır. Sadece gerçek yorum metni olan puanları
        // döndürür (yorumsuz salt puanlar burada listelenmez, onlar sadece
        // ortalamaya katkı sağlar), en yeni yorum en üstte.
        [HttpGet]
        [HttpGet]
        public async Task<IActionResult> GetYorumlar(int bookId)
        {
            var yorumlar = await _context.BookRatings
                .Where(br => br.BookID == bookId && br.Comment != null && br.Comment != "" && !br.IsDeleted)
                .Include(br => br.User)
                .OrderByDescending(br => br.CreatedAt)
                .Select(br => new
                {
                    ratingId = br.RatingID,
                    kullaniciAdi = br.User != null ? br.User.Username : "Kullanıcı",
                    tarih = br.CreatedAt.ToString("dd.MM.yyyy"),
                    puan = br.RatingValue,
                    yorum = br.Comment
                })
                .ToListAsync();

            return Json(yorumlar);
        }

        // Yorumlar sekmesindeki "Yorumu Kaldır" butonuna basılınca çağrılır.
        // Kullanıcının bu kitaba ait puan+yorum satırını tamamen siler,
        // oy sayısını ve ortalamayı buna göre yeniden hesaplar.
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> PuanKaldir([FromBody] PuanKaldirRequest istek)
        {
            if (User.Identity == null || !User.Identity.IsAuthenticated)
            {
                return Unauthorized();
            }

            var userIdMetni = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdMetni == null || !int.TryParse(userIdMetni, out int userId))
            {
                return Unauthorized();
            }

            if (istek == null)
            {
                return BadRequest();
            }

            var kitap = await _context.Books.FirstOrDefaultAsync(b => b.BookID == istek.BookId);
            if (kitap == null)
            {
                return NotFound();
            }

            // ---- GÜNCELLENDİ (Faz Ekstra 2.4): !IsDeleted eklendi — silinmiş bir
            // yorum bulunamaz, kullanıcı onu kaldıramaz. ----
            var mevcutPuan = await _context.BookRatings
                .FirstOrDefaultAsync(br => br.BookID == istek.BookId && br.UserID == userId && !br.IsDeleted);

            if (mevcutPuan == null)
            {
                return NotFound();
            }

            _context.BookRatings.Remove(mevcutPuan);
            await _context.SaveChangesAsync();

            // ---- GÜNCELLENDİ (Faz Ekstra 2.4): PuanVer ile aynı tutarlı hesaplama ----
            var tumPuanlar = await _context.BookRatings
                .Where(br => br.BookID == istek.BookId && !br.IsDeleted)
                .Select(br => (int)br.RatingValue)
                .ToListAsync();

            kitap.RatingCount = tumPuanlar.Count;
            kitap.AverageRating = tumPuanlar.Count > 0
                ? Math.Round((decimal)tumPuanlar.Average(), 1)
                : 0;

            await _context.SaveChangesAsync();

            return Json(new
            {
                success = true,
                averageRating = kitap.AverageRating,
                ratingCount = kitap.RatingCount ?? 0
            });
        }

        // ---- YENİ (Faz Ekstra 2.4) ----

        // Kitap popup'ındaki "Yorumlar" sekmesinde bir yoruma tıklanan şikayet
        // ikonu bunu çağırır. Kullanıcı kendi yorumunu şikayet edemez.
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> SikayetEt([FromBody] SikayetRequest istek)
        {
            if (User.Identity == null || !User.Identity.IsAuthenticated)
            {
                return Unauthorized();
            }

            var userIdMetni = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdMetni == null || !int.TryParse(userIdMetni, out int userId))
            {
                return Unauthorized();
            }

            if (istek == null || istek.RatingId <= 0 || string.IsNullOrWhiteSpace(istek.Mesaj))
            {
                return BadRequest("Şikayet mesajı boş olamaz.");
            }

            var hedefYorum = await _context.BookRatings
                .FirstOrDefaultAsync(br => br.RatingID == istek.RatingId && !br.IsDeleted);
            if (hedefYorum == null)
            {
                return NotFound();
            }

            if (hedefYorum.UserID == userId)
            {
                return BadRequest("Kendi yorumunuzu şikayet edemezsiniz.");
            }

            _context.Reports.Add(new Report
            {
                Type = "Şikayet",
                TargetRatingID = istek.RatingId,
                ReporterUserID = userId,
                Message = istek.Mesaj.Trim()
            });

            await _context.SaveChangesAsync();

            return Json(new { success = true });
        }

        // Zarf ikonundan açılan genel talep/şikayet modalı bunu çağırır.
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> TalepOlustur([FromBody] TalepRequest istek)
        {
            if (User.Identity == null || !User.Identity.IsAuthenticated)
            {
                return Unauthorized();
            }

            var userIdMetni = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdMetni == null || !int.TryParse(userIdMetni, out int userId))
            {
                return Unauthorized();
            }

            if (istek == null || string.IsNullOrWhiteSpace(istek.Mesaj))
            {
                return BadRequest("Talep mesajı boş olamaz.");
            }

            _context.Reports.Add(new Report
            {
                Type = "Talep",
                TargetRatingID = null,
                ReporterUserID = userId,
                Message = istek.Mesaj.Trim()
            });

            await _context.SaveChangesAsync();

            return Json(new { success = true });
        }

        // Çan ikonundan açılan bildirim dropdown'ı bunu çağırır. Seen/unseen
        // takibi yok (5 numaralı karar) — kullanıcının tüm silinmiş yorumları
        // her seferinde listelenir.
        [HttpGet]
        public async Task<IActionResult> GetBildirimler()
        {
            if (User.Identity == null || !User.Identity.IsAuthenticated)
            {
                return Unauthorized();
            }

            var userIdMetni = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userIdMetni == null || !int.TryParse(userIdMetni, out int userId))
            {
                return Unauthorized();
            }

            var silinenler = await _context.BookRatings
                .Where(br => br.UserID == userId && br.IsDeleted)
                .Include(br => br.Book)
                .OrderByDescending(br => br.DeletedAt)
                .Select(br => new
                {
                    bookName = br.Book != null ? br.Book.BookName : null,
                    deletedAt = br.DeletedAt
                })
                .ToListAsync();

            return Json(new { bildirimler = silinenler });
        }

        public class PuanKaldirRequest
        {
            public int BookId { get; set; }
        }

        public class PuanVerRequest
        {
            public int BookId { get; set; }
            public int Puan { get; set; }

            // Yorumlar sekmesindeki metin kutusundan gelen (opsiyonel) yorum.
            // Boş gönderilirse (kullanıcı sadece puanını değiştiriyorsa) eski
            // yorum korunur, üzerine yazılmaz.
            public string? Yorum { get; set; }
        }

        // ---- YENİ (Faz Ekstra 2.4) ----
        public class SikayetRequest
        {
            public int RatingId { get; set; }
            public string Mesaj { get; set; } = string.Empty;
        }

        public class TalepRequest
        {
            public string Mesaj { get; set; } = string.Empty;
        }
    }
}