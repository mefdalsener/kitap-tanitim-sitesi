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
            if (User.Identity != null && User.Identity.IsAuthenticated)
            {
                var userIdMetni = User.FindFirstValue(ClaimTypes.NameIdentifier);
                if (userIdMetni != null && int.TryParse(userIdMetni, out int userId))
                {
                    viewModel.KullaniciPuanlari = await _context.BookRatings
                        .Where(br => br.UserID == userId)
                        .ToDictionaryAsync(br => br.BookID, br => br.RatingValue);
                }
            }

            return View("BooklandIndex", viewModel);
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

            var kitap = await _context.Books.FirstOrDefaultAsync(b => b.BookID == istek.BookId);
            if (kitap == null)
            {
                return NotFound();
            }

            var mevcutPuan = await _context.BookRatings
                .FirstOrDefaultAsync(br => br.BookID == istek.BookId && br.UserID == userId);

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
                kitap.RatingCount = (kitap.RatingCount ?? 0) + 1;
                yorumMetni = yeniYorum;
            }

            await _context.SaveChangesAsync();

            // Ortalamayı bu kitaba ait tüm puanlar üzerinden yeniden hesapla.
            var tumPuanlar = await _context.BookRatings
                .Where(br => br.BookID == istek.BookId)
                .Select(br => (int)br.RatingValue)
                .ToListAsync();

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
        public async Task<IActionResult> GetYorumlar(int bookId)
        {
            var yorumlar = await _context.BookRatings
                .Where(br => br.BookID == bookId && br.Comment != null && br.Comment != "")
                .Include(br => br.User)
                .OrderByDescending(br => br.CreatedAt)
                .Select(br => new
                {
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

            var mevcutPuan = await _context.BookRatings
                .FirstOrDefaultAsync(br => br.BookID == istek.BookId && br.UserID == userId);

            if (mevcutPuan == null)
            {
                return NotFound();
            }

            _context.BookRatings.Remove(mevcutPuan);
            kitap.RatingCount = Math.Max(0, (kitap.RatingCount ?? 0) - 1);
            await _context.SaveChangesAsync();

            var tumPuanlar = await _context.BookRatings
                .Where(br => br.BookID == istek.BookId)
                .Select(br => (int)br.RatingValue)
                .ToListAsync();

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
    }
}