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

        // Kullanıcı popup'ta bir yıldıza tıkladığında çağrılır.
        // - Aynı kullanıcı aynı kitaba daha önce puan verdiyse: puan güncellenir.
        // - Daha önce puan vermediyse: yeni kayıt eklenir ve Book.RatingCount +1 artırılır.
        // - Her iki durumda da Book.AverageRating, o kitaba ait tüm puanların
        //   ortalaması alınıp tek ondalık basamağa yuvarlanarak yeniden hesaplanır.
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> PuanVer([FromBody] PuanVerRequest istek)
        {
            if (User.Identity == null || !User.Identity.IsAuthenticated)
            {
                return Unauthorized();
            }

            // NOT: Giriş yapan kullanıcının Id'sinin ClaimTypes.NameIdentifier
            // claim'i içinde taşındığı varsayılıyor (yani login sırasında
            // SignInAsync'e eklenen claim listesinde bu claim User.Id'yi
            // taşıyor olmalı). Projedeki giriş mekanizması farklıysa
            // burası ona göre güncellenmeli.
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

            bool puanSilindi = false;

            if (mevcutPuan != null)
            {
                if (mevcutPuan.RatingValue == istek.Puan)
                {
                    // Kullanıcı zaten verdiği puana tekrar bastı: puanı geri al.
                    _context.BookRatings.Remove(mevcutPuan);
                    kitap.RatingCount = Math.Max(0, (kitap.RatingCount ?? 0) - 1);
                    puanSilindi = true;
                }
                else
                {
                    // Eşleşme var ama farklı bir yıldıza basıldı: eski puanın yerine yenisi yazılır.
                    mevcutPuan.RatingValue = (byte)istek.Puan;
                }
            }
            else
            {
                // Eşleşme yok: yeni kayıt eklenir ve oy sayısı 1 artırılır.
                _context.BookRatings.Add(new BookRating
                {
                    BookID = istek.BookId,
                    UserID = userId,
                    RatingValue = (byte)istek.Puan
                });
                kitap.RatingCount = (kitap.RatingCount ?? 0) + 1;
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
                kullaniciPuani = puanSilindi ? (int?)null : istek.Puan
            });
        }

        public class PuanVerRequest
        {
            public int BookId { get; set; }
            public int Puan { get; set; }
        }
    }
}