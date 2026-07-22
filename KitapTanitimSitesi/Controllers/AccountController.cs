using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KitapTanitimSitesi.Models;
using KitapTanitimSitesi.Models.ViewModels;

namespace KitapTanitimSitesi.Controllers
{
    public class AccountController : Controller
    {
        private readonly AppDbContext _context;

        public AccountController(AppDbContext context)
        {
            _context = context;
        }

        // GET: /Account/Register
        [HttpGet]
        public IActionResult Register()
        {
            return View(new SignupIndex());
        }

        // POST: /Account/Register
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Register(SignupIndex model)
        {
            if (!ModelState.IsValid)
                return View(model);

            // Username veya Email zaten kayıtlı mı kontrol et
            var existingUser = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == model.Username || u.Email == model.Email);

            if (existingUser != null)
            {
                if (existingUser.Email == model.Email)
                {
                    // ---- YENİ (Faz Ekstra 2.2): E-posta zaten kayıtlı VE o hesap
                    // TamBan'lıysa, jenerik "zaten kayıtlı" yerine özel mesaj göster. ----
                    var (isBanned, _) = await GetTamBanDurumuAsync(existingUser.Id);
                    ModelState.AddModelError(nameof(model.Email), isBanned
                        ? "Kullanım şartlarının ihlali nedeniyle bu e-posta adresi kullanım dışı bırakılmıştır."
                        : "Bu e-posta zaten kayıtlı.");
                }
                if (existingUser.Username == model.Username)
                    ModelState.AddModelError(nameof(model.Username), "Bu kullanıcı adı zaten kayıtlı.");

                return View(model);
            }

            var user = new User
            {
                Username = model.Username,
                Email = model.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(model.Password),
                Role = "user",
                CreatedAt = DateTime.Now,
                UpdatedAt = DateTime.Now
            };

            const int maxRetries = 5;
            bool saved = false;

            for (int attempt = 0; attempt < maxRetries && !saved; attempt++)
            {
                user.PublicId = await GenerateUniquePublicIdAsync();

                try
                {
                    _context.Users.Add(user);
                    await _context.SaveChangesAsync();
                    saved = true;
                }
                catch (DbUpdateException ex) when (IsUniqueConstraintViolation(ex))
                {
                    _context.Entry(user).State = EntityState.Detached;
                }
            }

            if (!saved)
            {
                ModelState.AddModelError("", "Kayıt sırasında bir hata oluştu, lütfen tekrar deneyin.");
                return View(model);
            }

            return RedirectToAction("Login");
        }

        // Rastgele + benzersiz 9 haneli PublicId üretir: "YY" + 7 haneli rastgele sayı
        private async Task<string> GenerateUniquePublicIdAsync()
        {
            var rng = new Random();
            string yearPrefix = (DateTime.Now.Year % 100).ToString("D2");
            string candidateId;
            bool exists;

            do
            {
                int randomPart = rng.Next(0, 10_000_000);
                candidateId = yearPrefix + randomPart.ToString("D7");
                exists = await _context.Users.AnyAsync(u => u.PublicId == candidateId);
            }
            while (exists);

            return candidateId;
        }

        private bool IsUniqueConstraintViolation(DbUpdateException ex)
        {
            return ex.InnerException is Microsoft.Data.SqlClient.SqlException sqlEx &&
                   (sqlEx.Number == 2627 || sqlEx.Number == 2601);
        }

        // GET: /Account/Login
        [HttpGet]
        public IActionResult Login()
        {
            return View(new LoginIndex());
        }

        // POST: /Account/Login
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Login(LoginIndex model)
        {
            if (!ModelState.IsValid)
                return View(model);

            var input = model.UsernameOrEmail;

            var user = await _context.Users
                .FirstOrDefaultAsync(u => u.Username == input || u.Email == input);

            // Kullanıcı bulunamadı VEYA şifre yanlış -> aynı genel mesaj (güvenlik amaçlı ayrım yapılmaz)
            if (user == null || !BCrypt.Net.BCrypt.Verify(model.Password, user.PasswordHash))
            {
                ModelState.AddModelError("", "Hatalı giriş yaptınız veya kayıtlı kullanıcı bulunamadı.");
                return View(model);
            }

            // ---- YENİ (Faz Ekstra 2.2): TamBan'lı kullanıcının girişini engelle ----
            var (isBanned, effectiveEndDate) = await GetTamBanDurumuAsync(user.Id);
            if (isBanned)
            {
                var mesaj = !effectiveEndDate.HasValue
                    ? "Hesabınız topluluk kurallarını ihlal ettiği için kalıcı olarak yasaklanmıştır."
                    : $"Hesabınız {effectiveEndDate.Value:dd.MM.yyyy HH:mm} tarihine kadar yasaklanmıştır.";
                ModelState.AddModelError("", mesaj);
                return View(model);
            }

            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Username),
                new Claim(ClaimTypes.Role, user.Role)
            };

            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

            await HttpContext.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(claimsIdentity),
                new AuthenticationProperties
                {
                    IsPersistent = true,
                    ExpiresUtc = DateTimeOffset.UtcNow.AddDays(7)
                });

            return RedirectToAction("Index", "Bookland");
        }

        // POST: /Account/Logout
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Logout()
        {
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return RedirectToAction("Index", "Bookland");
        }

        // ---- YENİ (Faz Ekstra 2.2): Bir kullanıcının "gerçekten TamBan'lı mı"
        // durumunu hesaplar. AdminController.cs'teki aynı isimli metotla kasıtlı
        // olarak aynı mantığı taşır — izolasyon prensibi gereği paylaşılan bir
        // servise çıkarılmadı. ----
        private async Task<(bool isBanned, DateTime? effectiveEndDate)> GetTamBanDurumuAsync(int userId)
        {
            var baseAction = await _context.UserModerationActions
                .Where(a => a.UserID == userId &&
                    (a.ActionType == "TamBan" || a.ActionType == "YorumYasağı" || a.ActionType == "YasakKaldırma"))
                .OrderByDescending(a => a.CreatedAt)
                .FirstOrDefaultAsync();

            if (baseAction == null || baseAction.ActionType != "TamBan")
                return (false, null);

            var laterAdjustment = await _context.UserModerationActions
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
}